import { generateId } from '../utils/CommonUtils.js';
import eventManager, { GameEvents } from '../core/EventManager.js';

export const DealTypes = {
  VOTE_TOGETHER: 'VOTE_TOGETHER',
  MUTUAL_PROTECTION: 'MUTUAL_PROTECTION',
  IDOL_PROTECTION: 'IDOL_PROTECTION',
  FINAL_TWO: 'FINAL_TWO',
  SHARE_INFO: 'SHARE_INFO',
  ALLIANCE_REFERENCE: 'ALLIANCE_REFERENCE'
};

export const DealStatus = {
  PROPOSED: 'PROPOSED',
  ACCEPTED: 'ACCEPTED',
  REFUSED: 'REFUSED',
  BROKEN: 'BROKEN',
  COMPLETED: 'COMPLETED',
  EXPIRED: 'EXPIRED'
};

class DealSystem {
  constructor(gameManager) {
    this.gameManager = gameManager;
    this.dealsById = {};
    this.debug = false;
    this._initialized = false;
  }

  initialize() {
    if (this._initialized) return;
    this._initialized = true;
    console.log('Initializing DealSystem');

    eventManager.subscribe(GameEvents.SURVIVOR_ELIMINATED, this._handleSurvivorEliminated.bind(this));
    eventManager.subscribe(GameEvents.TRIBES_MERGED, this._handleTribesMerged.bind(this));
    eventManager.subscribe(GameEvents.GAME_LOADED, this._handleGameLoaded.bind(this));
    eventManager.subscribe(GameEvents.GAME_STARTED, this._handleGameStarted.bind(this));
    eventManager.subscribe(GameEvents.TRIBES_CREATED, this._handleTribesCreated.bind(this));

    this._ensureDealFieldsForAllSurvivors();
  }

  reset() {
    this.dealsById = {};
  }

  serialize() {
    return JSON.parse(JSON.stringify({
      dealsById: this.dealsById
    }));
  }

  deserialize(payload) {
    if (!payload || typeof payload !== 'object') {
      this.dealsById = {};
      return;
    }

    const rawDeals = payload.dealsById && typeof payload.dealsById === 'object'
      ? payload.dealsById
      : {};

    this.dealsById = {};
    Object.values(rawDeals).forEach(rawDeal => {
      const normalized = this._normalizeDeal(rawDeal);
      if (normalized) {
        this.dealsById[normalized.id] = normalized;
      }
    });

    this._ensureDealFieldsForAllSurvivors();
    this.cleanupInvalidReferences();
  }

  createDeal({ type, parties, terms = {}, expires = null, note = '', stakes = 'standard' }) {
    if (!Array.isArray(parties) || parties.length !== 2) {
      this._log('[DealSystem] Invalid parties for deal creation', parties);
      return null;
    }

    const [partyAId, partyBId] = parties;
    if (!partyAId || !partyBId || partyAId === partyBId) {
      this._log('[DealSystem] Invalid party ids for deal creation', parties);
      return null;
    }

    const survivorA = this._getSurvivorById(partyAId);
    const survivorB = this._getSurvivorById(partyBId);
    if (!survivorA || !survivorB) {
      this._log('[DealSystem] Missing survivor for deal creation', { partyAId, partyBId });
      return null;
    }

    this._ensureDealIdsArray(survivorA);
    this._ensureDealIdsArray(survivorB);

    const existing = this._findDuplicateActiveDeal({ type, parties: [partyAId, partyBId] });
    if (existing) {
      this._log('[DealSystem] Duplicate active deal found, returning existing deal', existing);
      return existing;
    }

    const dealId = `deal_${generateId()}`;
    const now = Date.now();
    const context = this._getGameContext();
    const deal = {
      id: dealId,
      dealId,
      type,
      parties: [partyAId, partyBId],
      status: DealStatus.PROPOSED,
      created: {
        day: context.day,
        phase: context.phase,
        round: context.round,
        timestamp: now
      },
      updated: {
        timestamp: now
      },
      expires: expires ?? null,
      terms: terms ?? {},
      history: [
        {
          timestamp: now,
          at: context,
          action: DealStatus.PROPOSED,
          by: partyAId,
          note: note || undefined
        }
      ],
      visibility: 'private_pair',
      stakes: this._normalizeStakes(stakes)
    };

    const normalizedDeal = this._normalizeDeal(deal);
    this.dealsById[dealId] = normalizedDeal;
    this._attachDealToSurvivor(survivorA, dealId);
    this._attachDealToSurvivor(survivorB, dealId);

    eventManager.publish(GameEvents.DEAL_CREATED, { deal: normalizedDeal });
    this._logDeal('CREATED', normalizedDeal);

    return normalizedDeal;
  }

  setDealStatus(dealId, status, bySurvivorId = null, note = '') {
    const deal = this.dealsById[dealId];
    if (!deal) return false;

    deal.status = status;
    deal.updated.timestamp = Date.now();
    this._appendHistory(deal, {
      action: status,
      by: bySurvivorId,
      note
    });

    const payload = {
      deal,
      byId: bySurvivorId,
      otherId: this._getOtherPartyId(deal, bySurvivorId),
      note
    };

    eventManager.publish(GameEvents.DEAL_UPDATED, payload);

    if (status === DealStatus.EXPIRED) {
      eventManager.publish(GameEvents.DEAL_EXPIRED, payload);
      this._logDeal('EXPIRED', deal);
    }

    if (status === DealStatus.BROKEN) {
      eventManager.publish(GameEvents.DEAL_BROKEN, payload);
      this._logDeal('BROKEN', deal, bySurvivorId);
    }

    if (status === DealStatus.ACCEPTED) {
      eventManager.publish(GameEvents.DEAL_ACCEPTED, payload);
      this._logDeal('ACCEPTED', deal, bySurvivorId);
    }

    if (status === DealStatus.REFUSED) {
      eventManager.publish(GameEvents.DEAL_REFUSED, payload);
      this._logDeal('REFUSED', deal, bySurvivorId);
    }

    if (status === DealStatus.COMPLETED) {
      eventManager.publish(GameEvents.DEAL_COMPLETED, payload);
      this._logDeal('COMPLETED', deal, bySurvivorId);
    }

    return true;
  }

  acceptDeal(dealId, bySurvivorId, note = '') {
    return this.setDealStatus(dealId, DealStatus.ACCEPTED, bySurvivorId, note);
  }

  refuseDeal(dealId, bySurvivorId, note = '') {
    return this.setDealStatus(dealId, DealStatus.REFUSED, bySurvivorId, note);
  }

  breakDeal(dealId, bySurvivorId, note = '') {
    return this.setDealStatus(dealId, DealStatus.BROKEN, bySurvivorId, note);
  }

  expireDeal(dealId, note = '') {
    return this.setDealStatus(dealId, DealStatus.EXPIRED, null, note);
  }

  completeDeal(dealId, bySurvivorId = null, note = '') {
    return this.setDealStatus(dealId, DealStatus.COMPLETED, bySurvivorId, note);
  }

  getDealById(dealId) {
    return this.dealsById[dealId] || null;
  }

  getDeal(dealId) {
    return this.getDealById(dealId);
  }

  getDealsForSurvivor(survivorId, { statuses = null, statusList = null, types = null } = {}) {
    const survivor = this._getSurvivorById(survivorId);
    if (!survivor) return [];

    this._ensureDealIdsArray(survivor);

    const filterStatuses = Array.isArray(statuses) && statuses.length > 0
      ? statuses
      : Array.isArray(statusList) && statusList.length > 0
        ? statusList
        : null;

    const validDealIds = [];
    const deals = survivor.dealIds
      .map(dealId => {
        const deal = this.dealsById[dealId];
        if (deal) validDealIds.push(dealId);
        return deal || null;
      })
      .filter(Boolean)
      .filter(deal => {
        if (filterStatuses && !filterStatuses.includes(deal.status)) {
          return false;
        }
        if (Array.isArray(types) && types.length > 0 && !types.includes(deal.type)) {
          return false;
        }
        return true;
      });

    if (validDealIds.length !== survivor.dealIds.length) {
      survivor.dealIds = validDealIds;
    }

    return deals;
  }

  getActiveDealsBetween(idA, idB, { types = null } = {}) {
    if (!idA || !idB) return [];
    const activeStatuses = [DealStatus.PROPOSED, DealStatus.ACCEPTED];

    return Object.values(this.dealsById).filter(deal => {
      if (!deal || !Array.isArray(deal.parties)) return false;
      const includesBoth = deal.parties.includes(idA) && deal.parties.includes(idB);
      if (!includesBoth) return false;
      if (!activeStatuses.includes(deal.status)) return false;
      if (Array.isArray(types) && types.length > 0 && !types.includes(deal.type)) return false;
      return true;
    });
  }

  hasActiveDealBetween(idA, idB, type = null) {
    const matches = this.getActiveDealsBetween(idA, idB, { types: type ? [type] : null });
    return matches.length > 0;
  }

  getDealSummary(dealId) {
    const deal = this.dealsById[dealId];
    if (!deal) return null;
    const [aId, bId] = deal.parties || [];
    const aName = this._getSurvivorDisplayName(aId);
    const bName = this._getSurvivorDisplayName(bId);
    return {
      id: deal.id,
      type: deal.type,
      status: deal.status,
      parties: [aName, bName].filter(Boolean),
      created: {
        day: deal.created?.day ?? null,
        phase: deal.created?.phase ?? null
      },
      stakes: deal.stakes ?? 'standard'
    };
  }

  removeDealReferences(dealId) {
    const deal = this.dealsById[dealId];
    if (!deal) return false;

    deal.parties.forEach(partyId => {
      const survivor = this._getSurvivorById(partyId);
      if (!survivor || !Array.isArray(survivor.dealIds)) return;
      survivor.dealIds = survivor.dealIds.filter(id => id !== dealId);
    });

    return true;
  }

  cleanupInvalidReferences() {
    const survivors = this._getAllSurvivors();
    survivors.forEach(survivor => {
      this._ensureDealIdsArray(survivor);
      const validIds = survivor.dealIds.filter(id => Boolean(this.dealsById[id]));
      if (validIds.length !== survivor.dealIds.length) {
        survivor.dealIds = validIds;
      }
    });
  }

  processTribalOutcome(tribalSummary = {}, gameManager = this.gameManager) {
    const membersAtTribal = new Set((tribalSummary.membersAtTribal || []).map(member => member.id));
    if (!membersAtTribal.size) return;

    const decidingVotes = tribalSummary.revoteOccurred && !tribalSummary.rockDrawOccurred
      ? (tribalSummary.revoteVotes || [])
      : (tribalSummary.initialVotes || tribalSummary.votes || []);
    const votesByVoter = new Map(decidingVotes.map(vote => [vote.voterId, vote.targetId]));
    const activeStatuses = new Set([DealStatus.PROPOSED, DealStatus.ACCEPTED]);
    const activeDeals = Object.values(this.dealsById).filter(deal => activeStatuses.has(deal?.status));

    activeDeals.forEach(deal => {
      const [partyAId, partyBId] = deal.parties || [];
      if (!partyAId || !partyBId) return;
      if (!membersAtTribal.has(partyAId) || !membersAtTribal.has(partyBId)) return;

      const aVote = votesByVoter.get(partyAId);
      const bVote = votesByVoter.get(partyBId);
      const terms = deal.terms || {};

      if (deal.type === DealTypes.VOTE_TOGETHER) {
        const requiredTargetId = terms.targetId ?? null;
        if (requiredTargetId) {
          if (aVote && aVote !== requiredTargetId) {
            this.breakDeal(deal.id, partyAId, 'VOTE_TOGETHER target not honored');
            return;
          }
          if (bVote && bVote !== requiredTargetId) {
            this.breakDeal(deal.id, partyBId, 'VOTE_TOGETHER target not honored');
            return;
          }
          if (aVote === requiredTargetId && bVote === requiredTargetId) {
            this.completeDeal(deal.id, null, 'VOTE_TOGETHER target honored');
          }
          return;
        }

        if (aVote && bVote && aVote !== bVote) {
          this.breakDeal(deal.id, null, 'VOTE_TOGETHER alignment failed');
          return;
        }
        if (aVote && bVote && aVote === bVote) {
          this.completeDeal(deal.id, null, 'VOTE_TOGETHER alignment held');
        }
        return;
      }

      if (deal.type === DealTypes.MUTUAL_PROTECTION || deal.type === 'DO_NOT_VOTE_ME' || deal.type === 'PROTECT_X') {
        const protectedId = terms.protectedId ?? terms.targetId ?? null;
        const protectedForA = protectedId || partyBId;
        const protectedForB = protectedId || partyAId;

        if (aVote && aVote === protectedForA) {
          this.breakDeal(deal.id, partyAId, 'Protection promise broken');
          return;
        }
        if (bVote && bVote === protectedForB) {
          this.breakDeal(deal.id, partyBId, 'Protection promise broken');
          return;
        }

        if (aVote && bVote) {
          this.completeDeal(deal.id, null, 'Protection promise honored');
        }
        return;
      }

      if (deal.type === DealTypes.FINAL_TWO || deal.type === 'FINAL_THREE') {
        if (aVote && aVote === partyBId) {
          this.breakDeal(deal.id, partyAId, 'Final pact broken by direct vote');
          return;
        }
        if (bVote && bVote === partyAId) {
          this.breakDeal(deal.id, partyBId, 'Final pact broken by direct vote');
          return;
        }
      }
    });

    if (gameManager?.systems?.dealConsequencesSystem?.initialize) {
      gameManager.systems.dealConsequencesSystem.initialize();
    }
  }

  _appendHistory(deal, { action, by = null, note = '' }) {
    const now = Date.now();
    const context = this._getGameContext();
    deal.history = Array.isArray(deal.history) ? deal.history : [];
    deal.history.push({
      timestamp: now,
      at: context,
      action,
      by,
      note: note || undefined
    });
  }

  _handleSurvivorEliminated({ eliminatedSurvivor }) {
    const eliminatedId = eliminatedSurvivor?.id;
    if (!eliminatedId) return;

    Object.values(this.dealsById).forEach(deal => {
      if (!deal || !Array.isArray(deal.parties)) return;
      if (!deal.parties.includes(eliminatedId)) return;
      if ([DealStatus.PROPOSED, DealStatus.ACCEPTED].includes(deal.status)) {
        this.expireDeal(deal.id, 'party eliminated');
      }
    });
  }

  _handleTribesMerged() {
    Object.values(this.dealsById).forEach(deal => {
      if (!deal || ![DealStatus.PROPOSED, DealStatus.ACCEPTED].includes(deal.status)) return;
      if (deal.expires?.kind === 'untilMerge') {
        this.expireDeal(deal.id, 'expired on merge');
      }
    });
  }

  _handleGameLoaded() {
    this._ensureDealFieldsForAllSurvivors();
    this.cleanupInvalidReferences();
  }

  _handleGameStarted() {
    this._ensureDealFieldsForAllSurvivors();
  }

  _handleTribesCreated() {
    this._ensureDealFieldsForAllSurvivors();
  }

  _ensureDealFieldsForAllSurvivors() {
    const survivors = this._getAllSurvivors();
    survivors.forEach(survivor => this._ensureDealIdsArray(survivor));
  }

  _ensureDealIdsArray(survivor) {
    if (!survivor) return;
    if (!Array.isArray(survivor.dealIds)) {
      survivor.dealIds = [];
    }
  }

  _attachDealToSurvivor(survivor, dealId) {
    if (!survivor || !dealId) return;
    this._ensureDealIdsArray(survivor);
    if (!survivor.dealIds.includes(dealId)) {
      survivor.dealIds.push(dealId);
    }
  }

  _getSurvivorById(id) {
    if (!id) return null;
    const idString = id.toString();
    const direct = (this.gameManager?.survivors || []).find(survivor => survivor.id?.toString() === idString);
    if (direct) return direct;

    const tribes = this.gameManager?.tribes || [];
    for (const tribe of tribes) {
      const member = (tribe.members || []).find(survivor => survivor.id?.toString() === idString);
      if (member) return member;
    }

    return null;
  }

  _getAllSurvivors() {
    const survivors = [];
    const seen = new Set();

    (this.gameManager?.survivors || []).forEach(survivor => {
      const key = survivor?.id?.toString?.() ?? null;
      if (!survivor || !key || seen.has(key)) return;
      seen.add(key);
      survivors.push(survivor);
    });

    (this.gameManager?.tribes || []).forEach(tribe => {
      (tribe.members || []).forEach(member => {
        const key = member?.id?.toString?.() ?? null;
        if (!member || !key || seen.has(key)) return;
        seen.add(key);
        survivors.push(member);
      });
    });

    return survivors;
  }

  _getGameContext() {
    return {
      day: this.gameManager?.day ?? 1,
      phase: this.gameManager?.gamePhase ?? 'unknown',
      round: null
    };
  }

  _findDuplicateActiveDeal({ type, parties }) {
    if (!type || !Array.isArray(parties)) return null;
    const [partyAId, partyBId] = parties;
    const activeStatuses = [DealStatus.PROPOSED, DealStatus.ACCEPTED];
    const partySet = new Set([partyAId?.toString?.(), partyBId?.toString?.()]);

    return Object.values(this.dealsById).find(deal => {
      if (!deal || deal.type !== type) return false;
      if (!activeStatuses.includes(deal.status)) return false;
      const dealParties = new Set((deal.parties || []).map(id => id?.toString?.()));
      if (dealParties.size !== 2 || partySet.size !== 2) return false;
      return partySet.size === dealParties.size && [...partySet].every(id => dealParties.has(id));
    }) || null;
  }

  _normalizeDeal(rawDeal) {
    if (!rawDeal || typeof rawDeal !== 'object') return null;
    const parties = Array.isArray(rawDeal.parties) ? rawDeal.parties.slice(0, 2) : [];
    if (parties.length !== 2) return null;
    const [partyAId, partyBId] = parties;
    if (!partyAId || !partyBId || partyAId === partyBId) return null;
    if (!this._getSurvivorById(partyAId) || !this._getSurvivorById(partyBId)) {
      return null;
    }

    const now = Date.now();
    const created = rawDeal.created || this._getGameContext();
    const updated = rawDeal.updated || { timestamp: now };
    const history = Array.isArray(rawDeal.history) ? rawDeal.history : [];

    const resolvedId = rawDeal.id || `deal_${generateId()}`;
    return {
      id: resolvedId,
      dealId: rawDeal.dealId || resolvedId,
      type: rawDeal.type || DealTypes.ALLIANCE_REFERENCE,
      parties: [partyAId, partyBId],
      status: rawDeal.status || DealStatus.PROPOSED,
      created: {
        day: created.day ?? this.gameManager?.day ?? 1,
        phase: created.phase ?? this.gameManager?.gamePhase ?? 'unknown',
        round: created.round ?? null,
        timestamp: created.timestamp ?? rawDeal.created?.timestamp ?? now
      },
      updated: {
        timestamp: updated.timestamp ?? now
      },
      expires: this._normalizeExpires(rawDeal.expires),
      terms: rawDeal.terms && typeof rawDeal.terms === 'object' ? rawDeal.terms : {},
      history,
      visibility: rawDeal.visibility || 'private_pair',
      stakes: this._normalizeStakes(rawDeal.stakes)
    };
  }

  _normalizeExpires(expires) {
    if (!expires || typeof expires !== 'object') return null;
    const allowed = ['endOfDay', 'endOfPhase', 'endOfRound', 'untilMerge', 'custom'];
    if (!allowed.includes(expires.kind)) return null;
    return {
      kind: expires.kind,
      day: expires.day ?? undefined,
      phase: expires.phase ?? undefined,
      round: expires.round ?? undefined,
      timestamp: expires.timestamp ?? undefined
    };
  }

  _normalizeStakes(stakes) {
    const allowed = ['minor', 'standard', 'major', 'low', 'high'];
    return allowed.includes(stakes) ? stakes : 'standard';
  }

  _getOtherPartyId(deal, bySurvivorId) {
    if (!deal || !bySurvivorId || !Array.isArray(deal.parties)) return null;
    return deal.parties.find(id => id?.toString?.() !== bySurvivorId?.toString?.()) || null;
  }

  _getSurvivorDisplayName(id) {
    const survivor = this._getSurvivorById(id);
    if (!survivor) return null;
    return survivor.name || survivor.firstName || survivor.nickname || survivor.id?.toString?.() || 'Unknown';
  }

  _logDeal(action, deal, byId = null) {
    if (!this.debug) return;
    const [aId, bId] = deal.parties || [];
    const aName = this._getSurvivorDisplayName(aId) || 'Unknown';
    const bName = this._getSurvivorDisplayName(bId) || 'Unknown';
    const byName = byId ? this._getSurvivorDisplayName(byId) : null;
    const byText = byName ? ` by ${byName}` : '';
    console.log(`[Deal] ${action} ${deal.type} (${aName} ↔ ${bName}) stakes=${deal.stakes}${byText}`);
  }

  setDebug(enabled) {
    this.debug = Boolean(enabled);
  }

  _log(...args) {
    if (this.debug) {
      console.log(...args);
    }
  }
}

export default DealSystem;
