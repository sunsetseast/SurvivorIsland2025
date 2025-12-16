import { generateId } from '../utils/CommonUtils.js';
import eventManager, { GameEvents } from '../core/EventManager.js';

class AllianceSystem {
  constructor(gameManager) {
    this.gameManager = gameManager;
    this.alliances = [];
    this.relationshipSystem = gameManager?.systems?.relationshipSystem || null;
    this.socialMemorySystem = gameManager?.systems?.socialMemorySystem || (typeof window !== 'undefined' ? window.socialMemorySystem : null);
    this.minRelationshipForInvite = 60;
  }

  initialize() {
    console.log('Initializing AllianceSystem');
    if (!Array.isArray(this.alliances)) {
      this.alliances = [];
    }

    this.ensureNpcCommitments();
  }

  _getCurrentDay() {
    return this.gameManager?.getCurrentDay?.() ?? 1;
  }

  _ensureRelationshipSystem() {
    if (!this.relationshipSystem && this.gameManager?.systems?.relationshipSystem) {
      this.relationshipSystem = this.gameManager.systems.relationshipSystem;
    }
  }

  _ensureSocialMemorySystem() {
    if (!this.socialMemorySystem) {
      this.socialMemorySystem = this.gameManager?.systems?.socialMemorySystem || (typeof window !== 'undefined' ? window.socialMemorySystem : null);
    }
  }

  _emitAllianceUpdated(alliance) {
    eventManager.publish(GameEvents.ALLIANCE_UPDATED, { alliance });
  }

  createAlliance({
    name,
    type = 'core',
    tribeId = null,
    memberIds = [],
    leaderId = null,
    targetId = null,
    notes = ''
  }) {
    const uniqueMembers = Array.from(new Set(memberIds.filter(Boolean)));
    const alliance = {
      id: `alliance_${generateId()}`,
      name,
      type,
      tribeId,
      createdDay: this._getCurrentDay(),
      memberIds: uniqueMembers,
      leaderId: leaderId ?? null,
      targetId: targetId ?? null,
      active: true,
      cohesion: 0,
      notes: notes ?? ''
    };

    alliance.cohesion = this.computeCohesion(alliance.memberIds);
    this.alliances.push(alliance);

    console.log(`[AllianceSystem] Created alliance ${alliance.name} (${alliance.id})`);
    eventManager.publish(GameEvents.ALLIANCE_CREATED, { alliance });

    this.ensureNpcCommitments();

    return alliance;
  }

  disbandAlliance(allianceId, reason = '') {
    const alliance = this.getAlliance(allianceId);
    if (!alliance) return null;

    alliance.active = false;
    console.log(`[AllianceSystem] Disbanded alliance ${alliance.name} (${alliance.id})${reason ? `: ${reason}` : ''}`);
    eventManager.publish(GameEvents.ALLIANCE_DISBANDED, { alliance, reason });
    this._emitAllianceUpdated(alliance);
    return alliance;
  }

  addMember(allianceId, survivorId) {
    const alliance = this.getAlliance(allianceId);
    if (!alliance || !survivorId) return null;

    if (!alliance.memberIds.includes(survivorId)) {
      alliance.memberIds.push(survivorId);
      eventManager.publish(GameEvents.ALLIANCE_MEMBER_ADDED, {
        allianceId,
        survivorId
      });
      alliance.cohesion = this.computeCohesion(alliance.memberIds);
      this._emitAllianceUpdated(alliance);
      this.ensureNpcCommitments();
    }
    return alliance;
  }

  removeMember(allianceId, survivorId) {
    const alliance = this.getAlliance(allianceId);
    if (!alliance) return null;

    const beforeLength = alliance.memberIds.length;
    alliance.memberIds = alliance.memberIds.filter(id => id !== survivorId);
    if (alliance.memberIds.length !== beforeLength) {
      eventManager.publish(GameEvents.ALLIANCE_MEMBER_REMOVED, {
        allianceId,
        survivorId
      });
      if (alliance.memberIds.length < 2) {
        this.deleteAlliance(allianceId, 'too_small');
      } else {
        alliance.cohesion = this.computeCohesion(alliance.memberIds);
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
        alliance.memberIds.includes(survivorId) && (includeInactive || alliance.active)
    );
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
        alliance.memberIds.includes(aId) &&
        alliance.memberIds.includes(bId)
    );
  }

  computeCohesion(memberIds = []) {
    this._ensureRelationshipSystem();
    const members = Array.from(new Set(memberIds.filter(Boolean)));
    if (members.length < 2) return 50;

    let total = 0;
    let count = 0;
    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        const rel = this.relationshipSystem?.getRelationship?.(members[i], members[j]);
        const value = typeof rel?.value === 'number' ? rel.value : 50;
        total += value;
        count++;
      }
    }

    const average = count > 0 ? total / count : 50;
    return Math.max(0, Math.min(100, average));
  }

  recomputeAllianceCohesion(allianceId) {
    const alliance = this.getAlliance(allianceId);
    if (!alliance) return null;

    alliance.cohesion = this.computeCohesion(alliance.memberIds);
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
        alliance.type === 'votingBloc' &&
        alliance.tribeId === tribeId &&
        alliance.targetId === targetId
    );
  }

  makeVotingDeal({ offererId, receiverId, targetId }) {
    this._ensureSocialMemorySystem();
    const participants = [offererId, receiverId].filter(Boolean);
    let alliance = this.alliances.find(
      entry =>
        entry.type === 'votingBloc' &&
        participants.every(id => entry.memberIds.includes(id)) &&
        entry.active
    );

    if (!alliance) {
      alliance = this.createAlliance({
        name: `Voting Bloc vs ${targetId ?? 'unknown'}`,
        type: 'votingBloc',
        memberIds: participants,
        targetId
      });
    } else {
      alliance.memberIds = Array.from(new Set([...alliance.memberIds, ...participants]));
      alliance.targetId = targetId ?? alliance.targetId;
      alliance.active = true;
      alliance.cohesion = this.computeCohesion(alliance.memberIds);
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
      this.socialMemorySystem?.setCommittedAllianceId?.(survivor.id, selected?.id ?? null);
    });
  }

  scoreDealAcceptance({ offererId, receiverId }) {
    this._ensureRelationshipSystem();
    this._ensureSocialMemorySystem();

    const rel = this.relationshipSystem?.getRelationship?.(offererId, receiverId);
    const relationshipScore = typeof rel?.value === 'number' ? rel.value / 100 : 0.5;

    const trust = this.socialMemorySystem?.getTrust?.(receiverId) ?? 50;
    const reliability = this.socialMemorySystem?.getReliability?.(offererId) ?? 50;
    const trustScore = ((trust + reliability) / 2) / 100;

    const score = Math.max(0, Math.min(1, relationshipScore * 0.7 + trustScore * 0.3));
    return score;
  }

  wouldAcceptDeal({ offererId, receiverId }) {
    const score = this.scoreDealAcceptance({ offererId, receiverId });
    const noise = (Math.random() - 0.5) * 0.1;
    const finalScore = Math.max(0, Math.min(1, score + noise));
    return { accept: finalScore >= 0.5, score: finalScore };
  }
}

export default AllianceSystem;
