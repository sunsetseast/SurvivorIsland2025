import { generateId } from '../utils/CommonUtils.js';
import eventManager, { GameEvents } from '../core/EventManager.js';

export const DealTypes = {
  VOTE_TOGETHER: 'VOTE_TOGETHER',
  MUTUAL_PROTECTION: 'MUTUAL_PROTECTION',
  IDOL_PROTECTION: 'IDOL_PROTECTION',
  FINAL_TWO: 'FINAL_TWO',
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
  }

  initialize() {
    console.log('Initializing DealSystem');
    this.dealsById = {};

    eventManager.subscribe(GameEvents.SURVIVOR_ELIMINATED, this._handleSurvivorEliminated.bind(this));
    eventManager.subscribe(GameEvents.TRIBES_MERGED, this._handleTribesMerged.bind(this));
    eventManager.subscribe(GameEvents.GAME_LOADED, this._handleGameLoaded.bind(this));

    this._ensureDealFieldsForAllSurvivors();
  }

  reset() {
    this.dealsById = {};
  }

  serialize() {
    return {
      dealsById: this.dealsById
    };
  }

  deserialize(payload) {
    if (!payload || typeof payload !== 'object') {
      this.dealsById = {};
      return;
    }

    this.dealsById = payload.dealsById && typeof payload.dealsById === 'object'
      ? payload.dealsById
      : {};

    this._ensureDealFieldsForAllSurvivors();
    this.cleanupInvalidReferences();
  }

  createDeal({ type, parties, terms = {}, expires = null, note = '' }) {
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

    const dealId = `deal_${generateId()}`;
    const now = Date.now();
    const context = this._getGameContext();
    const deal = {
      id: dealId,
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
      visibility: 'private_pair'
    };

    this.dealsById[dealId] = deal;
    this._attachDealToSurvivor(survivorA, dealId);
    this._attachDealToSurvivor(survivorB, dealId);

    eventManager.publish(GameEvents.DEAL_CREATED, { deal });
    this._log('[DealSystem] Deal created', deal);

    return dealId;
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

    eventManager.publish(GameEvents.DEAL_UPDATED, { deal });

    if (status === DealStatus.EXPIRED) {
      eventManager.publish(GameEvents.DEAL_EXPIRED, { deal });
    }

    if (status === DealStatus.BROKEN) {
      eventManager.publish(GameEvents.DEAL_BROKEN, { deal });
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

  completeDeal(dealId, note = '') {
    return this.setDealStatus(dealId, DealStatus.COMPLETED, null, note);
  }

  getDeal(dealId) {
    return this.dealsById[dealId] || null;
  }

  getDealsForSurvivor(survivorId, { statusList = null, types = null } = {}) {
    const survivor = this._getSurvivorById(survivorId);
    if (!survivor) return [];

    this._ensureDealIdsArray(survivor);

    const validDealIds = [];
    const deals = survivor.dealIds
      .map(dealId => {
        const deal = this.dealsById[dealId];
        if (deal) validDealIds.push(dealId);
        return deal || null;
      })
      .filter(Boolean)
      .filter(deal => {
        if (Array.isArray(statusList) && statusList.length > 0 && !statusList.includes(deal.status)) {
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

  _log(...args) {
    if (this.debug) {
      console.log(...args);
    }
  }
}

export default DealSystem;
