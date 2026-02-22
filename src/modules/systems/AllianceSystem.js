import { generateId } from '../utils/CommonUtils.js';
import eventManager, { GameEvents } from '../core/EventManager.js';

const ALLIANCE_TYPES = {
  CORE: 'core',
  FINAL_TWO: 'final_two',
  VOTING_BLOC: 'voting_bloc',
  TEMPORARY: 'temporary'
};

class AllianceSystem {
  constructor(gameManager) {
    this.gameManager = gameManager;
    this.alliances = [];
    this.relationshipSystem = gameManager?.systems?.relationshipSystem || null;
    this.socialMemorySystem = gameManager?.systems?.socialMemorySystem || (typeof window !== 'undefined' ? window.socialMemorySystem : null);
    this.minRelationshipForInvite = 60;
    this._lastNpcAllianceDay = null;
  }

  initialize() {
    console.log('Initializing AllianceSystem');
    if (!Array.isArray(this.alliances)) {
      this.alliances = [];
    }

    this.alliances = this.alliances.map(alliance => this._normalizeAlliance(alliance));
    this._refreshCohesionAndCommitments();
    this.ensureNpcCommitments();
  }

  _normalizeAllianceType(type) {
    if (type === 'votingBloc') return ALLIANCE_TYPES.VOTING_BLOC;
    if (type === 'final2') return ALLIANCE_TYPES.FINAL_TWO;
    return type || ALLIANCE_TYPES.CORE;
  }

  _normalizeAlliance(alliance = {}) {
    const hasLegacyMembers = Array.isArray(alliance.members);
    const normalizedMemberIds = Array.from(new Set(
      (Array.isArray(alliance.memberIds) ? alliance.memberIds : (hasLegacyMembers ? alliance.members : []))
        .filter(Boolean)
    ));

    const sincerityMap = { ...(alliance.sincerityMap || {}) };
    normalizedMemberIds.forEach(id => {
      sincerityMap[id] = sincerityMap[id] === 'fake' ? 'fake' : 'real';
    });

    const normalized = {
      id: alliance.id || `alliance_${generateId()}`,
      name: alliance.name || 'Unnamed Alliance',
      type: this._normalizeAllianceType(alliance.type),
      tribeId: alliance.tribeId ?? null,
      createdDay: alliance.createdDay ?? this._getCurrentDay(),
      memberIds: normalizedMemberIds,
      leaderId: alliance.leaderId ?? normalizedMemberIds[0] ?? null,
      active: alliance.active !== false,
      cohesion: Number.isFinite(alliance.cohesion) ? alliance.cohesion : 50,
      sincerityMap,
      targetId: alliance.targetId ?? null,
      notes: alliance.notes ?? ''
    };

    if (hasLegacyMembers && !Array.isArray(alliance.memberIds)) {
      normalized.members = [...alliance.members];
    } else if (Array.isArray(alliance.members)) {
      normalized.members = [...alliance.members];
    }

    normalized.cohesion = this.computeCohesion(normalized);
    return normalized;
  }

  _getCurrentDay() {
    return this.gameManager?.getCurrentDay?.() ?? 1;
  }

  _ensureRelationshipSystem() {
    if (!this.relationshipSystem && this.gameManager?.systems?.relationshipSystem) {
      this.relationshipSystem = this.gameManager.systems.relationshipSystem;
    }
    if (!this.relationshipSystem) {
      console.warn('[AllianceSystem] RelationshipSystem missing, using default values.');
    }
  }

  _ensureSocialMemorySystem() {
    if (!this.socialMemorySystem) {
      this.socialMemorySystem = this.gameManager?.systems?.socialMemorySystem || (typeof window !== 'undefined' ? window.socialMemorySystem : null);
    }
    if (!this.socialMemorySystem) {
      console.warn('[AllianceSystem] SocialMemorySystem missing, memory-driven alliance logic will use defaults.');
    }
  }

  _emitAllianceUpdated(alliance) {
    eventManager.publish(GameEvents.ALLIANCE_UPDATED, { alliance });
  }

  _getSurvivorById(id) {
    return this.gameManager?.survivors?.find?.(s => s?.id === id) || null;
  }

  _memberKey(memberIds = []) {
    return [...new Set(memberIds.filter(Boolean))].sort().join('|');
  }

  _findDuplicateAlliance(memberIds, type) {
    const typeKey = this._normalizeAllianceType(type);
    const key = this._memberKey(memberIds);
    return this.alliances.find(alliance => (
      alliance?.active !== false
      && this._normalizeAllianceType(alliance?.type) === typeKey
      && this._memberKey(alliance?.memberIds || []) === key
    )) || null;
  }

  _getRelationshipValue(aId, bId) {
    this._ensureRelationshipSystem();
    if (!this.relationshipSystem) return 50;
    const rel = this.relationshipSystem.getRelationship?.(aId, bId);
    return Number.isFinite(rel?.value) ? Math.max(0, Math.min(100, rel.value)) : 50;
  }

  _refreshCohesionAndCommitments() {
    this.alliances.forEach(alliance => {
      const normalized = this._normalizeAlliance(alliance);
      Object.assign(alliance, normalized);
      this._handleCohesionCommitmentEffects(alliance);
    });
  }

  _handleCohesionCommitmentEffects(alliance) {
    if (!alliance || alliance.active === false) return;
    this._ensureSocialMemorySystem();

    if ((alliance.cohesion ?? 50) < 30) {
      (alliance.memberIds || []).forEach(id => {
        const committed = this.socialMemorySystem?.getCommittedAllianceId?.(id);
        if (committed === alliance.id) {
          this.socialMemorySystem?.setCommittedAllianceId?.(id, null);
        }
      });
    }

    if ((alliance.memberIds?.length || 0) === 2 && (alliance.cohesion ?? 50) < 15) {
      this.disbandAlliance(alliance.id, 'cohesion_collapse');
    }
  }

  _commitSincereMembers(alliance) {
    if (!alliance || ![ALLIANCE_TYPES.CORE, ALLIANCE_TYPES.FINAL_TWO].includes(this._normalizeAllianceType(alliance.type))) return;
    this._ensureSocialMemorySystem();
    (alliance.memberIds || []).forEach(id => {
      if (alliance.sincerityMap?.[id] === 'real') {
        this.socialMemorySystem?.setCommittedAllianceId?.(id, alliance.id);
      }
    });
  }

  createAlliance({
    name,
    type = ALLIANCE_TYPES.CORE,
    tribeId = null,
    memberIds = [],
    leaderId = null,
    targetId = null,
    notes = '',
    sincerityMap = null
  }) {
    const normalizedType = this._normalizeAllianceType(type);
    const uniqueMembers = Array.from(new Set(memberIds.filter(Boolean)));
    if (uniqueMembers.length < 2) return null;

    const duplicate = this._findDuplicateAlliance(uniqueMembers, normalizedType);
    if (duplicate) {
      return duplicate;
    }

    const resolvedSincerityMap = {};
    uniqueMembers.forEach(id => {
      const requested = sincerityMap?.[id];
      resolvedSincerityMap[id] = requested === 'fake' ? 'fake' : 'real';
    });

    const alliance = this._normalizeAlliance({
      id: `alliance_${generateId()}`,
      name,
      type: normalizedType,
      tribeId,
      createdDay: this._getCurrentDay(),
      memberIds: uniqueMembers,
      leaderId: leaderId ?? uniqueMembers[0] ?? null,
      active: true,
      cohesion: 50,
      sincerityMap: resolvedSincerityMap,
      targetId: targetId ?? null,
      notes: notes ?? ''
    });

    this.alliances.push(alliance);

    console.log(`[AllianceSystem] Created alliance ${alliance.name} (${alliance.id})`);
    eventManager.publish(GameEvents.ALLIANCE_CREATED, { alliance });

    this._commitSincereMembers(alliance);
    this._handleCohesionCommitmentEffects(alliance);
    this.ensureNpcCommitments();

    return alliance;
  }

  disbandAlliance(allianceId, reason = 'disbanded') {
    const alliance = this.getAlliance(allianceId);
    if (!alliance) return null;

    alliance.active = false;
    (alliance.memberIds || []).forEach(id => {
      if (this.getCommittedAllianceId(id) === alliance.id) {
        this.clearCommitment(id);
      }
    });

    console.log(`[AllianceSystem] Disbanded alliance ${alliance.name} (${alliance.id})${reason ? `: ${reason}` : ''}`);
    eventManager.publish(GameEvents.ALLIANCE_DISBANDED, { alliance, reason });
    this._emitAllianceUpdated(alliance);
    return alliance;
  }

  addMember(allianceId, survivorId, sincerity = 'real') {
    const alliance = this.getAlliance(allianceId);
    if (!alliance || !survivorId) return null;

    if (!alliance.memberIds.includes(survivorId)) {
      alliance.memberIds.push(survivorId);
      alliance.sincerityMap = alliance.sincerityMap || {};
      alliance.sincerityMap[survivorId] = sincerity === 'fake' ? 'fake' : 'real';
      alliance.cohesion = this.computeCohesion(alliance);
      eventManager.publish(GameEvents.ALLIANCE_MEMBER_ADDED, {
        allianceId,
        survivorId,
        sincerity: alliance.sincerityMap[survivorId]
      });
      this._commitSincereMembers(alliance);
      this._handleCohesionCommitmentEffects(alliance);
      this._emitAllianceUpdated(alliance);
      this.ensureNpcCommitments();
    }
    return alliance;
  }

  removeMember(allianceId, survivorId, reason = 'left') {
    const alliance = this.getAlliance(allianceId);
    if (!alliance) return null;

    const beforeLength = alliance.memberIds.length;
    alliance.memberIds = alliance.memberIds.filter(id => id !== survivorId);
    if (alliance.sincerityMap) {
      delete alliance.sincerityMap[survivorId];
    }

    if (alliance.memberIds.length !== beforeLength) {
      eventManager.publish(GameEvents.ALLIANCE_MEMBER_REMOVED, {
        allianceId,
        survivorId,
        reason
      });
      if (alliance.memberIds.length < 2) {
        this.disbandAlliance(allianceId, 'too_small');
      } else {
        alliance.cohesion = this.computeCohesion(alliance);
        this._handleCohesionCommitmentEffects(alliance);
        this._emitAllianceUpdated(alliance);
      }
      if (this.getCommittedAllianceId(survivorId) === allianceId) {
        this.clearCommitment(survivorId);
      }
      this.ensureNpcCommitments();
    }
    return alliance;
  }

  deleteAlliance(allianceId, reason = '') {
    const index = this.alliances.findIndex(alliance => alliance.id === allianceId);
    if (index === -1) return null;

    const [removed] = this.alliances.splice(index, 1);
    eventManager.publish(GameEvents.ALLIANCE_DISBANDED, { alliance: removed, reason });
    this._emitAllianceUpdated(removed);
    return removed;
  }

  getAlliance(allianceId) {
    return this.alliances.find(alliance => alliance.id === allianceId) || null;
  }

  getAlliances({ includeInactive = false } = {}) {
    if (includeInactive) {
      return [...this.alliances];
    }
    return this.alliances.filter(alliance => alliance.active !== false);
  }

  getAllAlliances() {
    return [...this.alliances];
  }

  updateAllianceName(allianceId, newName) {
    const alliance = this.getAlliance(allianceId);
    if (!alliance || !newName) return null;

    alliance.name = newName;
    this._emitAllianceUpdated(alliance);
    return alliance;
  }

  getAlliancesForSurvivor(survivorId, { includeInactive = false } = {}) {
    return this.alliances.filter(
      alliance =>
        (alliance.memberIds || []).includes(survivorId) && (includeInactive || alliance.active)
    );
  }

  getSharedAlliances(id1, id2) {
    return this.getAlliances().filter(alliance => alliance.memberIds.includes(id1) && alliance.memberIds.includes(id2));
  }

  getTribeAlliances(tribeId, { includeInactive = false } = {}) {
    return this.alliances.filter(
      alliance =>
        alliance.tribeId === tribeId && (includeInactive || alliance.active)
    );
  }

  getGlobalAlliances() {
    return this.alliances.filter(alliance => alliance.tribeId === null);
  }

  areAllied(aId, bId) {
    return this.alliances.some(
      alliance =>
        alliance.active &&
        (alliance.memberIds || []).includes(aId) &&
        (alliance.memberIds || []).includes(bId)
    );
  }

  computeCohesion(allianceOrMembers = []) {
    this._ensureRelationshipSystem();
    if (!this.relationshipSystem) return 50;

    const memberIds = Array.isArray(allianceOrMembers)
      ? allianceOrMembers
      : (allianceOrMembers?.memberIds || []);
    const members = Array.from(new Set(memberIds.filter(Boolean)));
    if (members.length < 2) return 50;

    let total = 0;
    let count = 0;
    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        total += this._getRelationshipValue(members[i], members[j]);
        count++;
      }
    }

    const average = count > 0 ? total / count : 50;
    return Math.max(0, Math.min(100, average));
  }

  recomputeAllianceCohesion(allianceId) {
    const alliance = this.getAlliance(allianceId);
    if (!alliance) return null;

    alliance.cohesion = this.computeCohesion(alliance);
    this._handleCohesionCommitmentEffects(alliance);
    this._emitAllianceUpdated(alliance);
    return alliance.cohesion;
  }

  getAllianceDisplayName(allianceId) {
    const alliance = this.getAlliance(allianceId);
    return alliance?.name || 'Unnamed Alliance';
  }

  getCommittedAllianceId(survivorId) {
    this._ensureSocialMemorySystem();
    return this.socialMemorySystem?.getCommittedAllianceId?.(survivorId) ?? null;
  }

  commitToAlliance({ survivorId, allianceId }) {
    const alliance = this.getAlliance(allianceId);
    if (!alliance || !alliance.memberIds?.includes?.(survivorId)) {
      return { ok: false, reason: 'not_member' };
    }

    this._ensureSocialMemorySystem();
    this.socialMemorySystem?.setCommittedAllianceId?.(survivorId, allianceId);
    return { ok: true };
  }

  clearCommitment(survivorId) {
    this._ensureSocialMemorySystem();
    this.socialMemorySystem?.setCommittedAllianceId?.(survivorId, null);
  }

  getTribeAlliancesForTarget(tribeId, targetId) {
    return this.alliances.filter(
      alliance =>
        this._normalizeAllianceType(alliance.type) === ALLIANCE_TYPES.VOTING_BLOC &&
        alliance.tribeId === tribeId &&
        alliance.targetId === targetId
    );
  }

  makeVotingDeal({ offererId, receiverId, targetId }) {
    this._ensureSocialMemorySystem();
    const participants = [offererId, receiverId].filter(Boolean);
    let alliance = this.alliances.find(
      entry =>
        this._normalizeAllianceType(entry.type) === ALLIANCE_TYPES.VOTING_BLOC &&
        participants.every(id => entry.memberIds.includes(id)) &&
        entry.active
    );

    if (!alliance) {
      alliance = this.createAlliance({
        name: `Voting Bloc vs ${targetId ?? 'unknown'}`,
        type: ALLIANCE_TYPES.VOTING_BLOC,
        memberIds: participants,
        targetId,
        sincerityMap: {
          [offererId]: 'real',
          [receiverId]: 'real'
        }
      });
    } else {
      alliance.memberIds = Array.from(new Set([...alliance.memberIds, ...participants]));
      alliance.targetId = targetId ?? alliance.targetId;
      alliance.active = true;
      alliance.cohesion = this.computeCohesion(alliance);
      this._emitAllianceUpdated(alliance);
    }

    this.socialMemorySystem?.recordDeal?.(offererId, receiverId, 'voteTogether', targetId, true);
    this.socialMemorySystem?.recordPromise?.(receiverId, offererId, 'voteTogether');

    console.log(`[AllianceSystem] Voting deal made between ${offererId} and ${receiverId} targeting ${targetId}`);
    eventManager.publish(GameEvents.ALLIANCE_DEAL_MADE, { offererId, receiverId, targetId, alliance });

    return alliance;
  }

  ensureNpcCommitments() {
    this._ensureSocialMemorySystem();
    const survivors = this.gameManager?.survivors || [];

    survivors.forEach((survivor) => {
      if (!survivor || survivor.isPlayer) return;

      const alliances = this.getAlliancesForSurvivor(survivor.id) || [];
      if (!alliances.length) {
        this.socialMemorySystem?.setCommittedAllianceId?.(survivor.id, null);
        return;
      }

      const ranked = [...alliances].sort((a, b) => {
        const sincerityA = a?.sincerityMap?.[survivor.id] === 'real' ? 1 : 0;
        const sincerityB = b?.sincerityMap?.[survivor.id] === 'real' ? 1 : 0;
        if (sincerityA !== sincerityB) return sincerityB - sincerityA;

        const cohesionA = a?.cohesion ?? 0;
        const cohesionB = b?.cohesion ?? 0;
        if (cohesionA !== cohesionB) return cohesionB - cohesionA;

        const leaderA = a?.leaderId === survivor.id ? 1 : 0;
        const leaderB = b?.leaderId === survivor.id ? 1 : 0;
        if (leaderA !== leaderB) return leaderB - leaderA;

        const createdA = a?.createdDay ?? 0;
        const createdB = b?.createdDay ?? 0;
        if (createdA !== createdB) return createdB - createdA;

        return (a?.id || '').localeCompare(b?.id || '');
      });

      const selected = ranked[0];
      if (selected?.cohesion < 30) {
        this.socialMemorySystem?.setCommittedAllianceId?.(survivor.id, null);
      } else {
        this.socialMemorySystem?.setCommittedAllianceId?.(survivor.id, selected?.id ?? null);
      }
    });
  }

  evaluateAllianceOffer({ proposerId, receiverId, type = ALLIANCE_TYPES.CORE, targetId = null }) {
    this._ensureRelationshipSystem();
    this._ensureSocialMemorySystem();

    const receiver = this._getSurvivorById(receiverId);
    const style = receiver?.gameplayStyle || 'Competitive';
    const relationship = this._getRelationshipValue(proposerId, receiverId);
    const trust = this.socialMemorySystem?.getTrust?.(receiverId) ?? 50;
    const reliability = this.socialMemorySystem?.getReliability?.(receiverId) ?? 50;
    const allianceStat = Number(receiver?.alliances ?? 50);
    const deception = Number(receiver?.deception ?? 50);
    const honesty = Number(receiver?.honesty ?? 50);
    const bigmove = Number(receiver?.bigmove ?? 50);
    const risk = Number(receiver?.risk ?? 50);

    const baseRandom = (Math.random() - 0.5) * 8;
    let score = relationship * 0.3 + trust * 0.2 + reliability * 0.15 + allianceStat * 0.2 + bigmove * 0.075 + risk * 0.075 + baseRandom;
    let threshold = 60;
    const normalizedType = this._normalizeAllianceType(type);

    switch (style) {
      case 'Competitive':
        score += relationship * 0.1 + allianceStat * 0.05 - honesty * 0.03;
        threshold = normalizedType === ALLIANCE_TYPES.FINAL_TWO ? 68 : (normalizedType === ALLIANCE_TYPES.VOTING_BLOC ? 50 : 60);
        break;
      case 'Power Player':
        score += allianceStat * 0.15 + bigmove * 0.1 + risk * 0.08 - relationship * 0.05;
        threshold = normalizedType === ALLIANCE_TYPES.FINAL_TWO ? 62 : (normalizedType === ALLIANCE_TYPES.VOTING_BLOC ? 45 : 55);
        break;
      case 'Social Genius':
        score += relationship * 0.18 + trust * 0.12 + honesty * 0.05 - deception * 0.06;
        threshold = normalizedType === ALLIANCE_TYPES.FINAL_TWO ? 72 : (normalizedType === ALLIANCE_TYPES.VOTING_BLOC ? 52 : 62);
        break;
      case 'Shadow Strategist':
        score += deception * 0.15 + risk * 0.1 + bigmove * 0.08 - honesty * 0.08;
        threshold = normalizedType === ALLIANCE_TYPES.FINAL_TWO ? 58 : (normalizedType === ALLIANCE_TYPES.VOTING_BLOC ? 42 : 52);
        break;
      case 'Lethal Charmer':
        score += relationship * 0.15 + allianceStat * 0.12 + deception * 0.04;
        threshold = normalizedType === ALLIANCE_TYPES.FINAL_TWO ? 66 : (normalizedType === ALLIANCE_TYPES.VOTING_BLOC ? 48 : 58);
        break;
      case 'Wildcard': {
        const chaos = (Math.random() - 0.5) * 20;
        score += chaos + deception * 0.08 + risk * 0.08;
        threshold = normalizedType === ALLIANCE_TYPES.FINAL_TWO ? 65 : (normalizedType === ALLIANCE_TYPES.VOTING_BLOC ? 44 : 57);
        break;
      }
      default:
        break;
    }

    if (normalizedType === ALLIANCE_TYPES.TEMPORARY) threshold -= 6;

    const clampedScore = Math.max(0, Math.min(100, score));
    const accepted = clampedScore >= threshold;

    let sincerity = 'real';
    const lowTrust = trust < 50;
    const lowRelationship = relationship < 50;
    const strategicStyle = ['Shadow Strategist', 'Power Player', 'Wildcard'].includes(style);
    const veryHonestAndClose = honesty > 80 && relationship > 70;

    if (accepted) {
      if (veryHonestAndClose) {
        sincerity = 'real';
      } else {
        const fakePressure = (lowTrust ? 20 : 0)
          + (lowRelationship ? 20 : 0)
          + (strategicStyle ? 18 : 0)
          + (deception > honesty ? 12 : 0)
          + (normalizedType === ALLIANCE_TYPES.VOTING_BLOC || normalizedType === ALLIANCE_TYPES.TEMPORARY ? 10 : 0)
          + (style === 'Shadow Strategist' && trust < 55 ? 18 : 0);
        sincerity = fakePressure >= 30 ? 'fake' : 'real';
      }
    }

    const reason = accepted
      ? (sincerity === 'fake' ? 'accepted_for_positioning' : 'accepted_on_merit')
      : `declined_${targetId ? 'target' : 'offer'}`;

    return {
      accepted,
      sincerity,
      score: clampedScore,
      reason
    };
  }

  maybeFormNpcAlliance({ tribeId = null } = {}) {
    const day = this._getCurrentDay();
    if (this._lastNpcAllianceDay === day && Math.random() > 0.2) {
      return null;
    }

    const survivors = (this.gameManager?.survivors || []).filter(s => s && !s.isPlayer);
    const tribeFiltered = tribeId
      ? survivors.filter(s => s.tribeId === tribeId || s.tribe?.id === tribeId)
      : survivors;

    if (tribeFiltered.length < 2) return null;

    const candidates = [];
    for (let i = 0; i < tribeFiltered.length; i++) {
      for (let j = i + 1; j < tribeFiltered.length; j++) {
        const a = tribeFiltered[i];
        const b = tribeFiltered[j];
        const tribeMatch = (a.tribeId || a.tribe?.id || null) === (b.tribeId || b.tribe?.id || null);
        if (!tribeMatch) continue;

        const hasCoreAlliance = this.getSharedAlliances(a.id, b.id)
          .some(alliance => [ALLIANCE_TYPES.CORE, ALLIANCE_TYPES.FINAL_TWO].includes(this._normalizeAllianceType(alliance.type)));
        if (hasCoreAlliance) continue;

        const relationship = this._getRelationshipValue(a.id, b.id);
        const strategicPair = ['Power Player', 'Shadow Strategist'].includes(a.gameplayStyle)
          || ['Power Player', 'Shadow Strategist'].includes(b.gameplayStyle);

        if (relationship >= 62 || (strategicPair && relationship >= 45)) {
          candidates.push({ a, b, relationship, strategicPair });
        }
      }
    }

    if (!candidates.length) return null;
    if (Math.random() > 0.1) return null;

    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    const tribeForAlliance = pick.a.tribeId || pick.a.tribe?.id || null;
    const alliance = this.createAlliance({
      name: `${pick.a.firstName} & ${pick.b.firstName}`,
      type: ALLIANCE_TYPES.CORE,
      memberIds: [pick.a.id, pick.b.id],
      tribeId: tribeForAlliance,
      leaderId: pick.a.id,
      sincerityMap: {
        [pick.a.id]: 'real',
        [pick.b.id]: 'real'
      }
    });

    if (!alliance) return null;

    this._ensureSocialMemorySystem();
    this.socialMemorySystem?.recordIntelEvent?.({
      type: 'alliance',
      about: [pick.a.id, pick.b.id],
      from: pick.a.id,
      to: pick.b.id,
      shortText: `${pick.a.firstName} and ${pick.b.firstName} agreed to work together quietly.`
    });

    this._lastNpcAllianceDay = day;
    return alliance;
  }

  scoreDealAcceptance({ offererId, receiverId }) {
    const result = this.evaluateAllianceOffer({ proposerId: offererId, receiverId, type: ALLIANCE_TYPES.VOTING_BLOC });
    return Math.max(0, Math.min(1, result.score / 100));
  }

  wouldAcceptDeal({ offererId, receiverId }) {
    const result = this.evaluateAllianceOffer({ proposerId: offererId, receiverId, type: ALLIANCE_TYPES.VOTING_BLOC });
    return { accept: !!result.accepted, score: Math.max(0, Math.min(1, result.score / 100)) };
  }
}

export default AllianceSystem;
