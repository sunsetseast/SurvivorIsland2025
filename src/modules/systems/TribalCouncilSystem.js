/**
 * @module TribalCouncilSystem
 * Pure logic engine for pre-merge tribal council resolution
 */

import { GameEvents } from '../core/EventManager.js';

export default class TribalCouncilSystem {
  constructor(gameManager, eventManager) {
    this.gameManager = gameManager;
    this.eventManager = eventManager;
    this.tribalNumber = 0;
    this.resetSessionState();
  }

  resetSessionState({ preservePlayerChoices = false } = {}) {
    const preservedPlayerVotes = preservePlayerChoices ? new Map(this.playerVotes) : new Map();
    const preservedSitdUsers = preservePlayerChoices ? new Set(this.sitdUsers) : new Set();
    const preservedIdolRegistrations = preservePlayerChoices ? [...this.idolRegistrations] : [];

    this.currentTribe = null;
    this.voters = [];
    this.eligibleTargets = [];
    this.voteRecords = [];
    this.shotResults = [];
    this.idolPlays = [];
    this.nullifiedVotes = [];
    this.playerVotes = preservedPlayerVotes;
    this.sitdUsers = preservedSitdUsers;
    this.idolRegistrations = preservedIdolRegistrations;
    this.revealQueue = [];
    this.immunityHolderIds = new Set();
    this.lostVoteIds = new Set();
    this.shotEligibleIds = new Set();
    this.idolHolderIds = new Set();
    this.idolProtectedIds = new Set();
    this.wasTie = false;
    this.wentToRocks = false;
    this.eliminatedId = null;
    this.majorityThreshold = 0;
  }

  runPreMergeTribal(options = {}) {
    const { attendingTribeId = null } = options;
    this.resetSessionState({ preservePlayerChoices: true });
    this.tribalNumber += 1;

    this.buildTribeContext(attendingTribeId);

    for (const voter of this.voters) {
      if (this.sitdUsers.has(voter.id) || this.lostVoteIds.has(voter.id)) {
        continue;
      }

      const hasPlayerVote = this.playerVotes.has(voter.id);
      if (voter.isPlayer && hasPlayerVote) {
        const targetId = this.playerVotes.get(voter.id);
        this._recordVote(voter.id, targetId, false);
        continue;
      }

      if (!voter.isPlayer) {
        continue;
      }

      const fallbackTarget = this.eligibleTargets.find(target => target.id !== voter.id);
      if (fallbackTarget) {
        this._recordVote(voter.id, fallbackTarget.id, false);
      }
    }

    this.computeNpcVotes();
    this.resolveShotInTheDark();
    this.resolveIdolStage();

    const tally = this.buildVoteTally();
    const highest = this._getHighestCount(tally);
    const tiedCandidates = highest > 0
      ? Object.entries(tally).filter(([, count]) => count === highest).map(([id]) => id)
      : [];

    if (tiedCandidates.length > 1) {
      this.wasTie = true;
      this.eliminatedId = null;
    } else {
      this.eliminatedId = tiedCandidates[0] || null;
    }

    this.revealQueue = this._buildRevealQueue();

    const finalTally = this.buildVoteTally();
    const tribalTimestamp = Date.now();
    const attendingTribeIdResolved = this.currentTribe?.tribeId ?? this.currentTribe?.id ?? null;

    const tribalSummary = {
      tribalNumber: this.tribalNumber,
      tribeId: attendingTribeIdResolved,
      attendingTribeId: attendingTribeIdResolved,
      majorityThreshold: this.majorityThreshold,
      votes: [...this.voteRecords],
      shotResults: [...this.shotResults],
      idolPlays: [...this.idolPlays],
      nullifiedVotes: [...this.nullifiedVotes],
      finalTally,
      tribalContext: {
        attendingTribeId: attendingTribeIdResolved,
        memberIds: this.voters.map(voter => voter.id)
      },
      eliminatedId: this.eliminatedId,
      reason: this.eliminatedId ? 'vote' : (this.wasTie ? 'tie' : 'noVotes'),
      wasTie: this.wasTie,
      wentToRocks: this.wentToRocks,
      timestamp: tribalTimestamp
    };

    this.eventManager.publish(GameEvents.TRIBAL_COUNCIL_COMPLETE, tribalSummary);
    // Backward compatibility for existing listeners.
    this.eventManager.publish('TRIBAL_COMPLETE', tribalSummary);
    return tribalSummary;
  }

  buildTribeContext(attendingTribeId = null) {
    const tribes = this.gameManager.getTribes?.() || this.gameManager.tribes || [];
    const tribe = tribes.find(candidate => (
      String(candidate?.tribeId ?? candidate?.id) === String(attendingTribeId)
    )) || this.gameManager.getPlayerTribe?.();
    const aliveMembers = (tribe?.members || []).filter(member => !member.isOut);

    this.currentTribe = tribe;
    this.voters = [...aliveMembers];
    this.eligibleTargets = [...aliveMembers];
    this.majorityThreshold = Math.floor(aliveMembers.length / 2) + 1;

    for (const member of aliveMembers) {
      if (this._hasImmunity(member)) this.immunityHolderIds.add(member.id);
      if (this._hasLostVote(member)) this.lostVoteIds.add(member.id);
      if (this._hasShotInTheDark(member)) this.shotEligibleIds.add(member.id);
      if (this._hasIdol(member)) this.idolHolderIds.add(member.id);
    }
  }

  registerPlayerVote(voterId, targetId) {
    this.playerVotes.set(voterId, targetId);
    if (this.sitdUsers.has(voterId)) {
      this.sitdUsers.delete(voterId);
    }
  }

  registerPlayerShotInTheDark(voterId) {
    this.sitdUsers.add(voterId);
    this.playerVotes.delete(voterId);
  }

  registerIdolPlay(playedById, playedOnId) {
    this.idolRegistrations = this.idolRegistrations.filter(play => play.playedById !== playedById);
    this.idolRegistrations.push({ playedById, playedOnId });
  }

  playerHasIdol(playerId) {
    if (!playerId) return false;
    const survivor = (this.gameManager.survivors || []).find(member => member.id === playerId)
      || this.voters.find(member => member.id === playerId)
      || this.eligibleTargets.find(member => member.id === playerId);
    return this._hasIdol(survivor);
  }

  computeNpcVotes() {
    const npcs = this.voters.filter(voter => !voter.isPlayer);

    for (const voter of npcs) {
      if (this.sitdUsers.has(voter.id) || this.lostVoteIds.has(voter.id)) {
        continue;
      }

      let bestTargetId = null;
      let bestScore = Number.NEGATIVE_INFINITY;

      const eligible = this.eligibleTargets.filter(target => (
        target.id !== voter.id
        && !target.isOut
        && !this.immunityHolderIds.has(target.id)
      ));

      for (const target of eligible) {
        const score = this._scoreNpcTarget(voter, target);
        if (score > bestScore) {
          bestScore = score;
          bestTargetId = target.id;
        }
      }

      if (bestTargetId) {
        this._recordVote(voter.id, bestTargetId, false);
      }
    }
  }

  resolveShotInTheDark() {
    for (const playerId of this.sitdUsers) {
      const isSafe = Math.random() < 1 / 6;
      this.shotResults.push({
        type: 'shotInTheDark',
        playerId,
        success: isSafe,
        gainedImmunity: isSafe,
        result: isSafe ? 'SAFE' : 'NOT_SAFE',
        forfeitedVote: true,
        timestamp: Date.now()
      });

      if (!isSafe) continue;

      for (const record of this.voteRecords) {
        if (record.targetId === playerId && !record.wasNullified) {
          record.wasNullified = true;
          this.nullifiedVotes.push({
            voterId: record.voterId,
            targetId: record.targetId,
            reason: 'shotInTheDark'
          });
        }
      }
    }
  }

  resolveIdolStage() {
    const aliveMembers = this.eligibleTargets.filter(member => !member.isOut);

    for (const survivor of aliveMembers) {
      if (!this._hasIdol(survivor) || survivor.isPlayer) continue;

      const projectedVotes = this._countVotesAgainst(survivor.id, { includeNullified: false });
      const paranoia = this._extractParanoia(survivor);
      const trustSignal = this._extractTrustSignal(survivor);
      const shouldPlay = projectedVotes >= 2 || paranoia >= 0.75 || trustSignal <= 0.3;

      if (shouldPlay) {
        this.idolRegistrations.push({ playedById: survivor.id, playedOnId: survivor.id });
      }
    }

    for (const play of this.idolRegistrations) {
      const playedBy = this.eligibleTargets.find(member => member.id === play.playedById);
      if (!playedBy || !this._hasIdol(playedBy)) {
        this.idolPlays.push({
          type: 'idolPlay',
          playedById: play.playedById,
          playedOnId: play.playedOnId,
          successful: false,
          nullifiedVotesCount: 0,
          timestamp: Date.now()
        });
        continue;
      }

      const protectedId = play.playedOnId;
      this.idolProtectedIds.add(protectedId);
      let nullifiedVotesCount = 0;

      for (const record of this.voteRecords) {
        if (record.targetId === protectedId && !record.wasNullified) {
          record.wasNullified = true;
          nullifiedVotesCount += 1;
          this.nullifiedVotes.push({
            voterId: record.voterId,
            targetId: record.targetId,
            reason: 'idol'
          });
        }
      }

      const successful = nullifiedVotesCount > 0;
      if (successful) {
        this.gameManager.consumeIdolForSurvivor?.(play.playedById, {
          playedOnId: play.playedOnId,
          day: this.gameManager.getDay?.(),
          tribalNumber: this.tribalNumber
        });
      }

      this.idolPlays.push({
        type: 'idolPlay',
        playedById: play.playedById,
        playedOnId: play.playedOnId,
        successful,
        nullifiedVotesCount,
        timestamp: Date.now()
      });
    }
  }

  buildVoteTally(records = this.voteRecords) {
    const tally = {};
    for (const vote of records) {
      if (vote.wasNullified) continue;
      tally[vote.targetId] = (tally[vote.targetId] || 0) + 1;
    }
    return tally;
  }

  getVoteRevealQueue() {
    return [...this.revealQueue];
  }

  runRevote(tiedCandidateIds) {
    const revoteRecords = [];
    const revoters = this.voters.filter(voter => (
      !this.immunityHolderIds.has(voter.id)
      && !tiedCandidateIds.includes(voter.id)
      && !voter.isOut
    ));

    for (const voter of revoters) {
      const candidates = tiedCandidateIds.filter(id => !this.immunityHolderIds.has(id));
      if (candidates.length === 0) continue;

      let selected = candidates[0];
      if (!voter.isPlayer) {
        let score = Number.NEGATIVE_INFINITY;
        for (const candidateId of candidates) {
          const candidate = this.eligibleTargets.find(target => target.id === candidateId);
          if (!candidate) continue;
          const candidateScore = this._scoreNpcTarget(voter, candidate);
          if (candidateScore > score) {
            score = candidateScore;
            selected = candidateId;
          }
        }
      }

      this._recordVote(voter.id, selected, true, revoteRecords);
    }

    this.voteRecords.push(...revoteRecords);
    const revoteTally = this.buildVoteTally(revoteRecords);
    const topCount = this._getHighestCount(revoteTally);
    const leaders = topCount > 0
      ? Object.entries(revoteTally).filter(([, count]) => count === topCount).map(([id]) => id)
      : [];

    if (leaders.length === 1) {
      return leaders[0];
    }

    return null;
  }

  runRockDraw(tiedCandidateIds) {
    const eligible = this.eligibleTargets.filter(member => (
      !member.isOut
      && !this.immunityHolderIds.has(member.id)
      && !tiedCandidateIds.includes(member.id)
      && !this.idolProtectedIds.has(member.id)
    ));

    if (eligible.length === 0) {
      return tiedCandidateIds[Math.floor(Math.random() * tiedCandidateIds.length)] || null;
    }

    const drawn = eligible[Math.floor(Math.random() * eligible.length)];
    return drawn?.id || null;
  }

  _recordVote(voterId, targetId, wasRevote = false, targetCollection = this.voteRecords) {
    if (!voterId || !targetId) return null;
    const record = {
      voterId,
      targetId,
      wasRevote,
      wasNullified: false,
      timestamp: Date.now()
    };
    targetCollection.push(record);
    this.eventManager.publish(GameEvents.VOTE_CAST, {
      voterId,
      targetId,
      wasRevote,
      timestamp: record.timestamp
    });
    return record;
  }

  _buildRevealQueue() {
    const stack = [...this.voteRecords];
    for (let i = stack.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [stack[i], stack[j]] = [stack[j], stack[i]];
    }

    const queue = [];

    let runningCounts = {};
    let top = 0;
    for (const vote of stack) {
      const revealType = vote.wasNullified ? 'NULLIFIED' : 'VALID';
      queue.push({ ...vote, revealType });

      if (vote.wasNullified) continue;

      runningCounts[vote.targetId] = (runningCounts[vote.targetId] || 0) + 1;
      top = Math.max(top, runningCounts[vote.targetId]);
      if (top >= this.majorityThreshold) {
        break;
      }
    }

    return queue;
  }

  _scoreNpcTarget(voter, target) {
    const allianceWeight = this._inSameAlliance(voter.id, target.id) ? 0.1 : 0.35;
    const intentConfidence = this._getIntentConfidence(voter, target);
    const trust = this.gameManager.getTrust?.(voter.id, target.id) ?? 50;
    const distrustWeight = (100 - trust) / 100;
    const threatValue = this._extractThreat(target);
    const paranoia = this._extractParanoia(voter);
    const chaos = Math.random() * 0.05;

    return allianceWeight + intentConfidence + distrustWeight + threatValue + paranoia + chaos;
  }

  _inSameAlliance(id1, id2) {
    const allianceSystem = this.gameManager.systems?.allianceSystem;
    if (!allianceSystem || typeof allianceSystem.getAllAlliances !== 'function') return false;
    const alliances = allianceSystem.getAllAlliances() || [];
    return alliances.some(alliance => {
      const members = alliance.members || alliance.memberIds || [];
      return members.includes(id1) && members.includes(id2);
    });
  }

  _getIntentConfidence(voter, target) {
    const intents = voter.personalIntent || voter.personalIntents || voter.intentions || [];
    if (!Array.isArray(intents)) return 0;
    const hit = intents.find(intent => intent?.targetId === target.id || intent?.target === target.id);
    return Number.isFinite(hit?.confidence) ? Math.max(0, Math.min(1, hit.confidence)) : 0;
  }

  _extractThreat(target) {
    const raw = target.threatScore ?? target.threat ?? target.attributes?.threat ?? 0;
    if (!Number.isFinite(raw)) return 0;
    return raw > 1 ? raw / 100 : raw;
  }

  _extractParanoia(survivor) {
    const trait = survivor.traits?.paranoia ?? survivor.paranoia ?? survivor.personality?.paranoia ?? 0;
    if (!Number.isFinite(trait)) return 0;
    return trait > 1 ? trait / 100 : trait;
  }

  _extractTrustSignal(survivor) {
    const signal = survivor.trustSignals?.recent ?? survivor.socialSignals?.trust ?? 0.5;
    if (!Number.isFinite(signal)) return 0.5;
    return signal > 1 ? signal / 100 : signal;
  }

  _countVotesAgainst(targetId, opts = {}) {
    const includeNullified = opts.includeNullified === true;
    return this.voteRecords.filter(record => {
      if (record.targetId !== targetId) return false;
      if (!includeNullified && record.wasNullified) return false;
      return true;
    }).length;
  }

  _getHighestCount(tally) {
    const counts = Object.values(tally);
    if (counts.length === 0) return 0;
    return Math.max(...counts);
  }

  _hasImmunity(survivor) {
    return Boolean(
      survivor?.hasImmunity
      || survivor?.isImmune
      || survivor?.advantages?.individualImmunity
      || survivor?.immunity?.individual
    );
  }

  _hasLostVote(survivor) {
    const penalty = survivor?.penalties?.lostVote;
    return penalty === true || penalty > 0 || survivor?.lostVote === true;
  }

  _hasShotInTheDark(survivor) {
    const value = survivor?.advantages?.shotInTheDarkAvailable;
    if (typeof value === 'boolean') return value;
    if (Number.isFinite(value)) return value > 0;
    return survivor?.shotInTheDarkAvailable !== false;
  }

  _hasIdol(survivor) {
    if (!survivor) return false;
    if (survivor?.hasIdol || survivor?.advantages?.idol || survivor?.advantages?.hasIdol) {
      return true;
    }

    const idolSystem = this.gameManager.systems?.idolSystem;
    const inventory = idolSystem?.survivorInventories?.get?.(survivor?.id);
    if (!inventory?.idols) return false;
    return inventory.idols.some(idol => !idol.isUsed && !idol.played);
  }

}
