import { GameEvents } from './EventManager.js';

export const DEFAULT_SEASON_CONFIG = Object.freeze({
  startingPlayers: 18,
  mergeAt: 12,
  swapAt: 14,
  swapToTribes: 2,
  juryStartsAtMerge: true,
  endgameAt: 4
});

const idOf = (value) => value?.tribeId ?? value?.id ?? value;

export default class SeasonEngine {
  constructor(gameManager, eventManager, config = {}) {
    this.gameManager = gameManager;
    this.eventManager = eventManager;
    this.config = { ...DEFAULT_SEASON_CONFIG, ...config };
    this.state = {
      round: 1,
      swapCount: 0,
      mergeCount: 0,
      endgameReached: false,
      completedRounds: [],
      history: []
    };
  }

  get activeSurvivors() {
    return (this.gameManager.survivors || []).filter(survivor => !survivor?.isOut);
  }

  get activeTribes() {
    return (this.gameManager.tribes || []).filter(tribe => (
      (tribe?.members || []).some(member => !member?.isOut)
    ));
  }

  getActiveSurvivors() { return this.activeSurvivors; }
  getActiveTribes() { return this.activeTribes; }
  getActivePlayerCount() { return this.activeSurvivors.length; }
  isMerged() { return Boolean(this.gameManager.isMerged); }
  isEndgame() { return this.getActivePlayerCount() <= this.config.endgameAt; }

  reset() {
    this.state = {
      round: 1,
      swapCount: 0,
      mergeCount: 0,
      endgameReached: false,
      completedRounds: [],
      history: []
    };
  }

  maybeTransition() {
    if (this.gameManager.isMerged) return { merged: false, swapped: false };
    const activeCount = this.getActivePlayerCount();
    if (activeCount <= this.config.mergeAt) {
      return { merged: this.merge(), swapped: false };
    }
    if (
      !this.gameManager.isTribesShuffled &&
      this.activeTribes.length > this.config.swapToTribes &&
      activeCount <= this.config.swapAt
    ) {
      return { merged: false, swapped: this.swap(this.config.swapToTribes) };
    }
    return { merged: false, swapped: false };
  }

  swap(targetCount = this.config.swapToTribes) {
    if (this.gameManager.isTribesShuffled || this.gameManager.isMerged) return false;
    const members = this.activeSurvivors;
    if (members.length < targetCount || targetCount < 2) return false;
    const oldTribes = this.activeTribes;
    const names = ['Tide', 'Ember', 'Cove', 'Wild'];
    const colors = ['#1976D2', '#D84315', '#388E3C', '#7B1FA2'];
    const groups = Array.from({ length: targetCount }, () => []);
    members.forEach((member, index) => groups[index % targetCount].push(member));
    this.gameManager.tribes = groups.map((group, index) => {
      const tribe = {
        id: index + 1,
        tribeId: index + 1,
        tribeName: names[index] || `Tribe ${index + 1}`,
        tribeColor: colors[index] || '#607D8B',
        members: group,
        resources: { fish: 0, water: 50, fire: 75, shelter: 60 },
        fire: 0, shelter: 0, immunityWins: 0, rewardWins: 0
      };
      group.forEach(member => {
        member.tribeId = tribe.tribeId;
        member.tribeColor = tribe.tribeColor;
      });
      tribe.name = tribe.tribeName;
      tribe.color = tribe.tribeColor;
      tribe.attributes = this.gameManager._calculateTribeAttributes(group);
      this.gameManager.initializeWaterPlanForTribe?.(tribe);
      return tribe;
    });
    this.gameManager.tribeCount = targetCount;
    this.gameManager.isTribesShuffled = true;
    this.state.swapCount += 1;
    this.state.history.push({ type: 'swap', day: this.gameManager.day, from: oldTribes.length, to: targetCount });
    this.eventManager?.publish(GameEvents.TRIBE_SHUFFLED, {
      tribes: this.gameManager.tribes, day: this.gameManager.day
    });
    return true;
  }

  merge() {
    if (this.gameManager.isMerged) return false;
    const members = this.activeSurvivors;
    if (!members.length) return false;
    const merged = {
      id: 1, tribeId: 1, tribeName: 'Merged Tribe', name: 'Merged Tribe',
      tribeColor: '#FFC107', color: '#FFC107', members,
      resources: { fish: 50, water: 75, fire: 100, shelter: 80 },
      fire: 0, shelter: 0, immunityWins: 0, rewardWins: 0
    };
    members.forEach(member => {
      member.tribeId = 1;
      member.tribeColor = merged.tribeColor;
    });
    merged.attributes = this.gameManager._calculateTribeAttributes(members);
    this.gameManager.tribes = [merged];
    this.gameManager.tribeCount = 1;
    this.gameManager.isMerged = true;
    this.state.mergeCount += 1;
    this.state.history.push({ type: 'merge', day: this.gameManager.day, activeCount: members.length });
    this.eventManager?.publish(GameEvents.TRIBES_MERGED, { mergedTribe: merged, day: this.gameManager.day });
    return true;
  }

  resolveChallenge({ random = Math.random, day = this.gameManager.day } = {}) {
    const tribes = this.activeTribes;
    if (tribes.length < 2) {
      return {
        challengeDay: day,
        challengeType: 'individual',
        playerTribeWon: false,
        playerWonIndividualImmunity: false
      };
    }
    const score = tribe => {
      const members = tribe.members.filter(member => !member.isOut);
      const total = members.reduce((sum, member) => sum
        + Number(member.physical || 50) * 0.3
        + Number(member.mental || 50) * 0.25
        + Number(member.personality || member.social || 50) * 0.2
        + Number(member.health ?? 50) * 0.15, 0);
      return total / Math.max(1, members.length) + members.length * 1.5 + (random() - 0.5) * 12;
    };
    const ranking = tribes.map(tribe => ({ tribe, score: score(tribe) }))
      .sort((a, b) => b.score - a.score);
    const winningRanking = tribes.length >= 3 ? ranking.slice(0, 2) : ranking.slice(0, 1);
    const winner = winningRanking[0].tribe;
    const playerTribe = this.gameManager.getPlayerTribe?.();
    return {
      challengeDay: day, challengeType: 'tribal',
      winningTribeKey: idOf(winner),
      winningTribeKeys: winningRanking.map(entry => idOf(entry.tribe)),
      losingTribeKey: idOf(ranking[ranking.length - 1].tribe),
      playerTribeKey: idOf(playerTribe),
      playerTribeWon: Boolean(playerTribe && winningRanking.some(entry => idOf(entry.tribe) === idOf(playerTribe))),
      rankings: ranking.map(entry => ({ tribeKey: idOf(entry.tribe), score: entry.score })),
      completed: true
    };
  }

  applyChallengeResult(result = {}) {
    if (result.challengeType !== 'individual' && !this.gameManager.isMerged) return null;
    const winnerId = result.individualWinnerId
      || (result.playerWonIndividualImmunity ? this.gameManager.player?.id : null);
    const winner = this.activeSurvivors.find(member => String(member.id) === String(winnerId));
    if (!winner) return null;
    winner.hasImmunity = true;
    winner.isImmune = true;
    winner.immunity = {
      ...(winner.immunity || {}),
      individual: true,
      day: this.gameManager.day
    };
    return winner;
  }

  clearChallengeImmunity() {
    for (const survivor of this.gameManager.survivors || []) {
      if (!survivor?.immunity?.individual) continue;
      survivor.hasImmunity = false;
      survivor.isImmune = false;
      survivor.immunity = { ...survivor.immunity, individual: false };
    }
  }

  enterEndgame() {
    if (this.state.endgameReached || !this.isEndgame()) return false;
    this.state.endgameReached = true;
    this.gameManager.finalists = [...this.activeSurvivors];
    this.gameManager.flags = {
      ...(this.gameManager.flags || {}),
      seasonEndgameReached: true
    };
    this.gameManager.gamePhase = 'endgame';
    this.gameManager.dayTimer = 0;
    this.state.history.push({
      type: 'endgame',
      day: this.gameManager.day,
      finalistIds: this.gameManager.finalists.map(finalist => finalist.id)
    });
    this.eventManager?.publish(GameEvents.GAME_PHASE_CHANGED, {
      phase: 'endgame',
      day: this.gameManager.day,
      finalistIds: this.gameManager.finalists.map(finalist => finalist.id)
    });
    return true;
  }

  resolveNpcTribal(unsafeTribe = null) {
    const tribe = unsafeTribe || this.activeTribes.find(candidate => (
      !candidate.members.some(member => member.isPlayer)
    ));
    const candidates = (tribe?.members || []).filter(member => (
      !member.isOut
      && !member.isPlayer
      && String(member.id) !== String(this.gameManager.player?.id)
      && !this.gameManager.hasImmunity?.(member)
    ));
    if (!candidates.length) return null;
    const alliances = this.gameManager.systems?.allianceSystem?.getAlliances?.() || [];
    const allianceSize = (member) => alliances.find(alliance => (
      alliance?.active !== false && (alliance.memberIds || []).includes(member.id)
    ))?.memberIds?.length || 0;
    const score = (member) => {
      const trust = Number(this.gameManager.getTrust?.(member.id) ?? member.trust ?? 50);
      const relationship = Number(member.relationships?.[this.gameManager.player?.id] ?? member.relationship ?? 50);
      const intentPressure = (tribe?.members || []).reduce((total, voter) => {
        if (voter.isOut || voter.id === member.id) return total;
        const intent = this.gameManager.systems?.strategyPhaseSystem?.getNpcTargetIntent?.(voter.id);
        return total + (String(intent?.targetId) === String(member.id) ? 8 : 0);
      }, 0);
      return Number(member.threat ?? 50) * 1.4
        + Number(member.social ?? 50) * 0.2
        - trust * 0.35 - relationship * 0.25 - allianceSize(member) * 2
        + intentPressure;
    };
    const target = [...candidates].sort((a, b) => score(b) - score(a))[0];
    this.gameManager.eliminateSurvivor(target, 'off-screen-npc-tribal');
    return target;
  }

  recordTribal(summary = {}) {
    const key = summary.id || `tribal:${summary.day ?? this.gameManager.day}:${summary.attendingTribeId ?? ''}`;
    if (this.state.history.some(entry => entry.type === 'tribal' && entry.key === key)) return false;
    this.state.history.push({
      type: 'tribal',
      key,
      day: summary.day ?? this.gameManager.day,
      challengeType: summary.challengeType || (this.gameManager.isMerged ? 'individual' : 'tribal'),
      unsafeTribe: summary.attendingTribeId ?? summary.tribeId ?? null,
      attendees: (summary.membersAtTribal || []).map(member => member.id || member),
      eliminatedId: summary.eliminatedId || null,
      eliminationType: summary.eliminatedId ? 'vote' : null,
      juryStatus: { started: Boolean(this.gameManager.isMerged), count: (this.gameManager.jury || []).length }
    });
    return true;
  }

  completeRound({ challengeResult = null, elimination = null, headless = false } = {}) {
    const token = String(challengeResult?.challengeDay ?? this.gameManager.day);
    if (this.state.completedRounds.includes(token)) return false;
    const result = challengeResult || {};
    const visibleTribal = Boolean(elimination);
    let eliminated = elimination;
    const attendees = [];
    const winners = new Set((result.winningTribeKeys || (
      result.winningTribeKey != null ? [result.winningTribeKey] : []
    )).map(String));
    if ((result.challengeType === 'individual' || this.gameManager.isMerged) && !elimination && !headless && this.gameManager.player && !this.gameManager.player.isOut) {
      return false;
    }
    if (result.challengeType === 'individual' || this.gameManager.isMerged) {
      this.applyChallengeResult(result);
      const mergedTribe = this.activeTribes[0];
      attendees.push(...(mergedTribe?.members || []).filter(member => !member.isOut));
      if (!eliminated && headless) {
        eliminated = this.resolveNpcTribal({
          ...(mergedTribe || {}),
          members: attendees
        });
      }
      if (eliminated) this.clearChallengeImmunity();
    } else if (winners.size) {
      const losing = this.activeTribes.find(tribe => (
        !winners.has(String(idOf(tribe)))
        && (result.losingTribeKey == null || String(idOf(tribe)) === String(result.losingTribeKey))
      )) || this.activeTribes.find(tribe => !winners.has(String(idOf(tribe))));
      attendees.push(...(losing?.members || []).filter(member => !member.isOut));
      if (!eliminated && losing?.members?.some(member => (
        !member.isOut && (member.isPlayer || String(member.id) === String(this.gameManager.player?.id))
      ))) {
        return false;
      }
      if (!eliminated) eliminated = this.resolveNpcTribal(losing);
    } else if (result.playerTribeWon) {
      const losing = this.activeTribes.find(tribe => !tribe.members.some(member => member.isPlayer));
      attendees.push(...(losing?.members || []).filter(member => !member.isOut));
      if (!eliminated) eliminated = this.resolveNpcTribal(losing);
    }
    // Visible Tribal has already removed the eliminated voter from the active tribe.
    if (visibleTribal && !attendees.some(member => String(member.id) === String(eliminated.id))) {
      attendees.push(eliminated);
    }
    this.state.completedRounds.push(token);
    const unsafeTribeId = eliminated
      ? eliminated.tribeId
      : attendees[0]?.tribeId || null;
    this.state.history.push({
      type: 'roundComplete', day: this.gameManager.day,
      challenge: result.challengeKey || result.challengeName || null,
      challengeType: result.challengeType || (this.gameManager.isMerged ? 'individual' : 'tribal'),
      winningTribeKeys: [...winners],
      winningTribeKey: result.winningTribeKey || [...winners][0] || null,
      unsafeTribe: unsafeTribeId,
      attendees: attendees.map(member => member.id),
      playerTribeWon: Boolean(result.playerTribeWon),
      eliminatedId: eliminated?.id || null,
      eliminationType: eliminated ? (visibleTribal ? 'vote' : 'off-screen-npc-tribal') : null,
      tribalMode: eliminated ? (visibleTribal ? 'visible' : 'offscreen') : null,
      juryStatus: {
        started: Boolean(this.gameManager.isMerged),
        count: (this.gameManager.jury || []).length
      }
    });
    this.maybeTransition();
    if (this.enterEndgame()) {
      this.state.round += 1;
      return true;
    }
    this.gameManager.day += 1;
    this.state.round += 1;
    this.gameManager.resetTaskSimFlags?.({ reason: 'day' });
    this.gameManager.updateTribeHealth?.();
    this.eventManager?.publish(GameEvents.DAY_ADVANCED, { day: this.gameManager.day });
    return true;
  }

  validateSeasonState() {
    const diagnostics = [];
    const active = this.activeSurvivors;
    const seen = new Set();
    for (const tribe of this.activeTribes) {
      for (const member of tribe.members || []) {
        if (member.isOut) diagnostics.push(`Eliminated survivor ${member.id} remains in active tribe`);
        if (seen.has(member.id)) diagnostics.push(`Survivor ${member.id} belongs to multiple tribes`);
        seen.add(member.id);
      }
    }
    if (seen.size !== active.length) diagnostics.push(`Active roster mismatch: tribes=${seen.size}, survivors=${active.length}`);
    if (this.gameManager.player && !active.includes(this.gameManager.player) && !this.gameManager.player.isOut) {
      diagnostics.push('Player reference is not canonical active survivor');
    }
    if (this.gameManager.isMerged && this.activeTribes.length !== 1) diagnostics.push('Merged game must have exactly one active tribe');
    return { valid: diagnostics.length === 0, diagnostics };
  }

  serialize() {
    return { config: this.config, state: this.state };
  }

  deserialize(payload) {
    if (!payload) return;
    this.config = { ...DEFAULT_SEASON_CONFIG, ...(payload.config || {}) };
    this.state = { ...this.state, ...(payload.state || {}) };
  }
}
