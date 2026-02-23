import { generateId } from '../utils/CommonUtils.js';
import eventManager, { GameEvents } from '../core/EventManager.js';

const ALLIANCE_TYPES = {
  CORE: 'core',
  FINAL_TWO: 'final_two',
  VOTING_BLOC: 'voting_bloc',
  TEMPORARY: 'temporary'
};

const TYPE_ALIASES = {
  core_alliance: ALLIANCE_TYPES.CORE,
  final2: ALLIANCE_TYPES.FINAL_TWO,
  final_two: ALLIANCE_TYPES.FINAL_TWO,
  votingBloc: ALLIANCE_TYPES.VOTING_BLOC,
  vote_together: ALLIANCE_TYPES.VOTING_BLOC,
  voting_bloc: ALLIANCE_TYPES.VOTING_BLOC,
  temporary: ALLIANCE_TYPES.TEMPORARY,
  core: ALLIANCE_TYPES.CORE
};

class AllianceSystem {
  constructor(gameManager) {
    this.gameManager = gameManager;
    this.alliances = [];
    this.relationshipSystem = gameManager?.systems?.relationshipSystem || null;
    this.socialMemorySystem = gameManager?.systems?.socialMemorySystem || null;
    this.commitments = new Map();
  }

  initialize() {
    if (!Array.isArray(this.alliances)) {
      this.alliances = [];
    }

    this.alliances = this.alliances.map(alliance => this._normalizeAlliance(alliance));
    this.ensureNpcCommitments();
    console.log(`[AllianceSystem] Initialized with ${this.alliances.length} alliances`);
  }

  _ensureRelationshipSystem() {
    if (!this.relationshipSystem) {
      this.relationshipSystem = this.gameManager?.systems?.relationshipSystem || null;
    }
  }

  _ensureSocialMemorySystem() {
    if (!this.socialMemorySystem) {
      this.socialMemorySystem = this.gameManager?.systems?.socialMemorySystem || null;
    }
  }

  _getCurrentDay() {
    return this.gameManager?.getCurrentDay?.() ?? 1;
  }

  _normalizeType(type) {
    return TYPE_ALIASES[type] || ALLIANCE_TYPES.CORE;
  }

  _normalizeSincerity(value) {
    return value === 'fake' ? 'fake' : 'real';
  }

  _normalizeMemberIds(memberIds = []) {
    return Array.from(new Set(memberIds.filter(id => Number.isFinite(id))));
  }

  _memberKey(memberIds = []) {
    return [...memberIds].sort((a, b) => a - b).join('|');
  }

  _normalizeAlliance(alliance = {}) {
    const memberIds = this._normalizeMemberIds(alliance.memberIds || alliance.members || []);
    const sincerityMap = { ...(alliance.sincerityMap || {}) };
    memberIds.forEach(id => {
      sincerityMap[id] = this._normalizeSincerity(sincerityMap[id]);
    });

    const normalized = {
      id: alliance.id || `alliance_${generateId()}`,
      name: alliance.name || 'Unnamed Alliance',
      type: this._normalizeType(alliance.type),
      tribeId: alliance.tribeId ?? null,
      createdDay: alliance.createdDay ?? this._getCurrentDay(),
      memberIds,
      leaderId: alliance.leaderId ?? memberIds[0] ?? null,
      active: alliance.active !== false,
      cohesion: 50,
      sincerityMap,
      targetId: alliance.targetId ?? null,
      notes: alliance.notes || ''
    };

    normalized.cohesion = this.computeCohesion(normalized);
    return normalized;
  }

  _publish(eventType, payload) {
    eventManager.publish(eventType, payload);
  }

  _findActiveDuplicate(memberIds, type) {
    const key = this._memberKey(this._normalizeMemberIds(memberIds));
    const normalizedType = this._normalizeType(type);
    return this.alliances.find(alliance => (
      alliance.active
      && this._normalizeType(alliance.type) === normalizedType
      && this._memberKey(alliance.memberIds) === key
    )) || null;
  }

  _getRelationshipValue(a, b) {
    this._ensureRelationshipSystem();
    if (!this.relationshipSystem) return 50;
    const relationship = this.relationshipSystem.getRelationship?.(a, b);
    const value = relationship?.value;
    return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 50;
  }

  _resolveSurvivor(id) {
    return this.gameManager?.survivors?.find?.(s => s?.id === id) || null;
  }

  _getTrust(receiverId) {
    this._ensureSocialMemorySystem();
    const value = this.socialMemorySystem?.getTrust?.(receiverId);
    return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 50;
  }

  _getReliability(proposerId) {
    this._ensureSocialMemorySystem();
    const value = this.socialMemorySystem?.getReliability?.(proposerId);
    return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 50;
  }

  createAlliance({
    name,
    type = ALLIANCE_TYPES.CORE,
    memberIds = [],
    tribeId = null,
    leaderId = null,
    targetId = null,
    sincerityMap = {},
    notes = ''
  }) {
    const normalizedMembers = this._normalizeMemberIds(memberIds);
    if (normalizedMembers.length < 2) return null;

    const normalizedType = this._normalizeType(type);
    const duplicate = this._findActiveDuplicate(normalizedMembers, normalizedType);
    if (duplicate) {
      return duplicate;
    }

    const resolvedSincerityMap = {};
    normalizedMembers.forEach(id => {
      resolvedSincerityMap[id] = this._normalizeSincerity(sincerityMap?.[id]);
    });

    const alliance = this._normalizeAlliance({
      id: `alliance_${generateId()}`,
      name: name || `${normalizedType} alliance`,
      type: normalizedType,
      tribeId,
      createdDay: this._getCurrentDay(),
      memberIds: normalizedMembers,
      leaderId: leaderId ?? normalizedMembers[0] ?? null,
      active: true,
      sincerityMap: resolvedSincerityMap,
      targetId,
      notes
    });

    this.alliances.push(alliance);
    this._publish(GameEvents.ALLIANCE_CREATED, { alliance });
    this._publish(GameEvents.ALLIANCE_UPDATED, { alliance });
    this.ensureNpcCommitments();
    console.log(`[AllianceSystem] Created ${alliance.type} alliance ${alliance.id}`);
    return alliance;
  }

  disbandAlliance(allianceId, reason = 'disbanded') {
    const alliance = this.getAlliance(allianceId);
    if (!alliance) return null;

    alliance.active = false;
    alliance.notes = alliance.notes ? `${alliance.notes} | ${reason}` : reason;

    alliance.memberIds.forEach(memberId => {
      if (this.getCommittedAllianceId(memberId) === allianceId) {
        this.clearCommitment(memberId);
      }
    });

    this._publish(GameEvents.ALLIANCE_DISBANDED, { alliance, reason });
    this._publish(GameEvents.ALLIANCE_UPDATED, { alliance });
    return alliance;
  }

  addMember(allianceId, survivorId, sincerity = 'real') {
    const alliance = this.getAlliance(allianceId);
    if (!alliance || !Number.isFinite(survivorId)) return null;

    if (!alliance.memberIds.includes(survivorId)) {
      alliance.memberIds.push(survivorId);
      alliance.memberIds = this._normalizeMemberIds(alliance.memberIds);
      alliance.sincerityMap[survivorId] = this._normalizeSincerity(sincerity);
      alliance.cohesion = this.computeCohesion(alliance);

      this._publish(GameEvents.ALLIANCE_MEMBER_ADDED, { allianceId, survivorId });
      this._publish(GameEvents.ALLIANCE_UPDATED, { alliance });
      this.ensureNpcCommitments();
    }

    return alliance;
  }

  removeMember(allianceId, survivorId, reason = 'left') {
    const alliance = this.getAlliance(allianceId);
    if (!alliance) return null;

    const originalLength = alliance.memberIds.length;
    alliance.memberIds = alliance.memberIds.filter(id => id !== survivorId);
    delete alliance.sincerityMap[survivorId];

    if (alliance.memberIds.length === originalLength) return alliance;

    this._publish(GameEvents.ALLIANCE_MEMBER_REMOVED, { allianceId, survivorId, reason });

    if (alliance.memberIds.length < 2) {
      this.disbandAlliance(allianceId, 'too_small');
    } else {
      alliance.cohesion = this.computeCohesion(alliance);
      this._publish(GameEvents.ALLIANCE_UPDATED, { alliance });
    }

    if (this.getCommittedAllianceId(survivorId) === allianceId) {
      this.clearCommitment(survivorId);
    }

    this.ensureNpcCommitments();
    return alliance;
  }

  getAlliance(allianceId) {
    return this.alliances.find(alliance => alliance.id === allianceId) || null;
  }

  getAlliances({ includeInactive = false } = {}) {
    return includeInactive ? [...this.alliances] : this.alliances.filter(alliance => alliance.active);
  }

  getAllAlliances() {
    return [...this.alliances];
  }

  getAlliancesForSurvivor(survivorId) {
    return this.getAlliances().filter(alliance => alliance.memberIds.includes(survivorId));
  }

  getSharedAlliances(id1, id2) {
    return this.getAlliances().filter(alliance => (
      alliance.memberIds.includes(id1) && alliance.memberIds.includes(id2)
    ));
  }


  areAllied(id1, id2) {
    return this.getAlliances().some(alliance => (
      alliance.memberIds.includes(id1) && alliance.memberIds.includes(id2)
    ));
  }

  updateAllianceName(allianceId, newName) {
    const alliance = this.getAlliance(allianceId);
    if (!alliance || !newName) return null;
    alliance.name = newName;
    this._publish(GameEvents.ALLIANCE_UPDATED, { alliance });
    return alliance;
  }

  getAllianceDisplayName(allianceId) {
    return this.getAlliance(allianceId)?.name || 'Unnamed Alliance';
  }

  computeCohesion(allianceOrMemberIds) {
    this._ensureRelationshipSystem();
    if (!this.relationshipSystem) return 50;

    const memberIds = Array.isArray(allianceOrMemberIds)
      ? this._normalizeMemberIds(allianceOrMemberIds)
      : this._normalizeMemberIds(allianceOrMemberIds?.memberIds || []);

    if (memberIds.length < 2) return 50;

    let total = 0;
    let pairs = 0;

    for (let i = 0; i < memberIds.length; i++) {
      for (let j = i + 1; j < memberIds.length; j++) {
        total += this._getRelationshipValue(memberIds[i], memberIds[j]);
        pairs += 1;
      }
    }

    const average = pairs > 0 ? total / pairs : 50;
    return Math.max(0, Math.min(100, average));
  }

  ensureNpcCommitments() {
    this._ensureSocialMemorySystem();
    const survivors = this.gameManager?.survivors || [];

    survivors.forEach(survivor => {
      if (!survivor || survivor.isPlayer) return;

      const alliances = this.getAlliancesForSurvivor(survivor.id);
      if (!alliances.length) {
        this.clearCommitment(survivor.id);
        return;
      }

      const ranked = [...alliances].sort((a, b) => {
        const aReal = a.sincerityMap?.[survivor.id] === 'real' ? 1 : 0;
        const bReal = b.sincerityMap?.[survivor.id] === 'real' ? 1 : 0;
        if (aReal !== bReal) return bReal - aReal;

        if (a.cohesion !== b.cohesion) return b.cohesion - a.cohesion;

        const aLeader = a.leaderId === survivor.id ? 1 : 0;
        const bLeader = b.leaderId === survivor.id ? 1 : 0;
        if (aLeader !== bLeader) return bLeader - aLeader;

        if (a.createdDay !== b.createdDay) return b.createdDay - a.createdDay;

        return (a.id || '').localeCompare(b.id || '');
      });

      const best = ranked[0] || null;
      if (!best || best.cohesion < 30) {
        this.clearCommitment(survivor.id);
      } else {
        this.commitToAlliance({ survivorId: survivor.id, allianceId: best.id });
      }
    });
  }

  commitToAlliance({ survivorId, allianceId }) {
    const alliance = this.getAlliance(allianceId);
    if (!alliance || !alliance.memberIds.includes(survivorId)) {
      return { ok: false, reason: 'not_member' };
    }

    this.commitments.set(survivorId, allianceId);
    this._ensureSocialMemorySystem();
    this.socialMemorySystem?.setCommittedAllianceId?.(survivorId, allianceId);
    return { ok: true };
  }

  getCommittedAllianceId(survivorId) {
    this._ensureSocialMemorySystem();
    const memoryValue = this.socialMemorySystem?.getCommittedAllianceId?.(survivorId);
    if (memoryValue !== undefined) return memoryValue;
    return this.commitments.get(survivorId) ?? null;
  }

  clearCommitment(survivorId) {
    this.commitments.delete(survivorId);
    this._ensureSocialMemorySystem();
    this.socialMemorySystem?.setCommittedAllianceId?.(survivorId, null);
  }

  evaluateAllianceOffer({ proposerId, receiverId, type = ALLIANCE_TYPES.CORE, targetId = null }) {
    const normalizedType = this._normalizeType(type);
    const relationship = this._getRelationshipValue(proposerId, receiverId);
    const trust = this._getTrust(receiverId);
    const reliability = this._getReliability(proposerId);
    const receiver = this._resolveSurvivor(receiverId);
    const style = receiver?.gameplayStyle || 'Competitive';

    const reasons = [];
    let probability = 0.18;

    probability += (relationship - 50) / 180;
    probability += (trust - 50) / 240;
    probability += (reliability - 50) / 280;

    if (normalizedType === ALLIANCE_TYPES.FINAL_TWO) probability -= 0.06;
    if (normalizedType === ALLIANCE_TYPES.VOTING_BLOC) probability += 0.07;
    if (normalizedType === ALLIANCE_TYPES.TEMPORARY) probability += 0.05;

    if (targetId !== null && Number.isFinite(targetId)) {
      reasons.push('has_specific_target');
      probability += 0.03;
    }

    if (['Power Player', 'Shadow Strategist', 'Competitive'].includes(style)) {
      probability += 0.1;
      reasons.push('strategic_style_acceptance_bonus');
    }

    if (['Social Genius', 'Lethal Charmer'].includes(style)) {
      if (relationship >= 55) {
        probability += 0.1;
        reasons.push('social_style_strong_relationship_bonus');
      } else {
        probability -= 0.1;
        reasons.push('social_style_requires_better_relationship');
      }
    }

    if (style === 'Wildcard') {
      probability += (Math.random() - 0.5) * 0.3;
      reasons.push('wildcard_variance');
    }

    probability += (Math.random() - 0.5) * 0.08;
    probability = Math.max(0, Math.min(1, probability));

    const accepted = Math.random() < probability;
    const score = Math.round(probability * 100);

    let sincerity = 'real';
    if (accepted) {
      let fakeChance = 0.2;
      if (relationship < 50) fakeChance += 0.15;
      if (trust < 45) fakeChance += 0.15;
      if (['Power Player', 'Shadow Strategist', 'Competitive'].includes(style)) fakeChance += 0.25;
      if (['Social Genius', 'Lethal Charmer'].includes(style)) fakeChance -= 0.12;
      if (style === 'Wildcard') fakeChance += (Math.random() - 0.5) * 0.2;

      fakeChance = Math.max(0.05, Math.min(0.9, fakeChance));
      sincerity = Math.random() < fakeChance ? 'fake' : 'real';
      reasons.push(sincerity === 'fake' ? 'accepted_fake' : 'accepted_real');
    } else {
      reasons.push('declined_offer');
    }

    return { accepted, sincerity, score, reasons };
  }


  scoreDealAcceptance({ offererId, receiverId }) {
    const result = this.evaluateAllianceOffer({
      proposerId: offererId,
      receiverId,
      type: ALLIANCE_TYPES.VOTING_BLOC
    });
    return Math.max(0, Math.min(1, result.score / 100));
  }

  wouldAcceptDeal({ offererId, receiverId }) {
    const result = this.evaluateAllianceOffer({
      proposerId: offererId,
      receiverId,
      type: ALLIANCE_TYPES.VOTING_BLOC
    });
    return { accept: !!result.accepted, score: Math.max(0, Math.min(1, result.score / 100)) };
  }

  dissolveAlliance(allianceId) {
    return this.disbandAlliance(allianceId, 'dissolved');
  }

  addMemberToAlliance(allianceId, survivorId) {
    return this.addMember(allianceId, survivorId, 'real');
  }

  removeMemberFromAlliance(allianceId, survivorId) {
    return this.removeMember(allianceId, survivorId, 'removed');
  }
}

export default AllianceSystem;
