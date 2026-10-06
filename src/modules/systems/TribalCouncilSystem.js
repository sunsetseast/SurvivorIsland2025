/**
 * @module TribalCouncilSystem
 * Pure logic engine for pre-merge tribal council resolution
 */

import { GameEvents } from '../core/EventManager.js';
import { eligibleRockDrawers, resolveFireMaking, resolveMultiWayFireMaking } from './TribalDeadlock.js';
import TribalKnowledgeModel from './TribalKnowledgeModel.js';
import { decideNpcIdolPlay } from './TribalIdolPerception.js';

export const TRIBAL_CONSENSUS_REFUSAL = 'REFUSE_CONSENSUS';

export default class TribalCouncilSystem {
  constructor(gameManager, eventManager) {
    this.gameManager = gameManager;
    this.eventManager = eventManager;
    this.tribalNumber = 0;
    this.resetSessionState();
    this.sessionStatus = 'idle';
  }

  beginSession() {
    this.resetSessionState();
    this.sessionStatus = 'active';
  }

  endSession() {
    this.resetSessionState();
    this.sessionStatus = 'idle';
  }

  resetSessionState({ preservePlayerChoices = false } = {}) {
    const preservedPlayerVotes = preservePlayerChoices ? new Map(this.playerVotes) : new Map();
    const preservedSitdUsers = preservePlayerChoices ? new Set(this.sitdUsers) : new Set();
    const preservedIdolRegistrations = preservePlayerChoices ? [...this.idolRegistrations] : [];

    this.currentTribe = null;
    this.voters = [];
    this.eligibleTargets = [];
    this.initialVotes = [];
    this.revoteVotes = [];
    this.tiebreakRounds = [];
    this.currentTieIds = [];
    this.releasedFromTieIds = [];
    this.deadlockRounds = [];
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
    this.initialTie = false;
    this.zeroValidVotes = false;
    this.deadlockOccurred = false;
    this.deadlockTiedCandidateIds = [];
    this.consensusDecisionMakerIds = [];
    this.consensusChoices = [];
    this.deadlockConsensusReached = false;
    this.deadlockDecisionTargetId = null;
    this.resolutionType = null;
    this.fireMakingParticipants = [];
    this.fireMakingRounds = [];
    this.fireMakingWinnerId = null;
    this.deadlockCasualtyId = null;
    this.revoteOccurred = false;
    this.rockDrawOccurred = false;
    this.rockDrawEligible = [];
    this.forcedResolution = false;
    this.eliminatedId = null;
    this.majorityThreshold = 0;
    this.latestSummary = null;
  }

  runPreMergeTribal(options = {}) {
    if (this.sessionStatus === 'resolved') return this.latestSummary;
    if (this.sessionStatus === 'active' && ['REVOTE_PENDING', 'DEADLOCK_DISCUSSION'].includes(this.latestSummary?.tribalState)) {
      return this.latestSummary;
    }
    if (this.sessionStatus === 'idle') this.sessionStatus = 'active';
    const { attendingTribeId = null } = options;
    this.resetSessionState({ preservePlayerChoices: true });

    this.buildTribeContext(attendingTribeId);
    const day = this.gameManager.getDay?.() ?? null;
    const attendingTribeIdResolved = this.currentTribe?.tribeId ?? this.currentTribe?.id ?? null;

    this._debug('runPreMergeTribal start', {
      day,
      attendingTribeId,
      resolvedTribeId: this.currentTribe?.tribeId ?? this.currentTribe?.id ?? null,
      voters: this.voters.length
    });

    if (!this.currentTribe || this.voters.length === 0) {
      console.warn('[TribalCouncilSystem] Missing attending tribe or voters; returning empty tribal summary.', {
        attendingTribeId,
        resolvedTribeId: this.currentTribe?.tribeId ?? this.currentTribe?.id ?? null
      });
    }
    const membersAtTribal = this.voters.map(member => ({
      id: member.id,
      name: member.name || member.id
    }));

    const playerVoteRequirement = this._getPlayerVoteRequirement();
    if (playerVoteRequirement) {
      return this._buildPlayerVoteRequiredSummary({ day, membersAtTribal, attendingTribeId: attendingTribeIdResolved });
    }
    this.tribalNumber += 1;

    for (const voter of this.voters) {
      if (!voter.isPlayer) continue;
      this._castPlayerVoteIfNeeded(voter);
    }

    this.computeNpcVotes();
    this.resolveShotInTheDark();
    this.idolOpportunities=this.voters.map(owner=>({ownerId:owner.id,usable:this._hasIdol(owner)}));
    this.resolveIdolStage();

    const initialCounts = this.buildVoteTally(this.initialVotes.filter(vote => vote.phase === 'initial'));
    const initialHighest = this._getHighestCount(initialCounts);
    const tiedCandidates = initialHighest > 0
      ? Object.entries(initialCounts).filter(([, count]) => count === initialHighest).map(([id]) => id)
      : [];

    const initialTie = tiedCandidates.length > 1;
    const zeroValidVotes = initialHighest === 0;
    this.initialTie = initialTie;
    this.zeroValidVotes = zeroValidVotes;
    const revoteTargetIds = zeroValidVotes ? this._getVoidRevoteTargetIds() : tiedCandidates;
    this.currentTieIds = [...revoteTargetIds];
    let revoteOccurred = false;
    let decidingCounts = initialCounts;
    let revoteEligibleVoterIds = [];
    let rockDrawOccurred = false;
    let rockDrawEligible = [];
    let rockDrawEliminatedId = null;
    let revotePendingPlayerChoice = false;
    let tribalState = 'FINAL_VOTE';
    let decisionResolved = true;
    const playerId = this._normalizeId(this.gameManager.getPlayerSurvivor?.()?.id);

    if (!initialTie && !zeroValidVotes) {
      this.eliminatedId = tiedCandidates[0] || null;
    } else if (zeroValidVotes && !revoteTargetIds.length) {
      tribalState = 'NO_ELIMINATION';
    } else {
      revoteEligibleVoterIds = this._getRevoteEligibleVoterIds(tiedCandidates, { voidVote: zeroValidVotes });
      const playerRevoteTargetIds = revoteEligibleVoterIds.includes(playerId)
        ? this.getLegalRevoteTargetIds(playerId, revoteTargetIds) : [];
      const playerCanRevote = playerRevoteTargetIds.length > 0;

      if (playerCanRevote) {
        revotePendingPlayerChoice = true;
        tribalState = 'REVOTE_PENDING';
        decisionResolved = false;
        decidingCounts = null;
      } else {
        const resolution = this._resolveRevoteFlow({ tiedCandidateIds: revoteTargetIds, playerChoiceTargetId: null, voidVote: zeroValidVotes });
        revoteOccurred = resolution.revoteOccurred;
        decidingCounts = resolution.decidingCounts;
        rockDrawOccurred = resolution.rockDrawOccurred;
        rockDrawEligible = resolution.rockDrawEligible;
        rockDrawEliminatedId = resolution.rockDrawEliminatedId;
        tribalState = resolution.nextRevotePending ? 'REVOTE_PENDING' : resolution.deadlockPending ? 'DEADLOCK_DISCUSSION'
          : !this.eliminatedId ? 'NO_ELIMINATION' : 'FINAL_VOTE';
        decisionResolved = !resolution.deadlockPending && !resolution.nextRevotePending;
        revotePendingPlayerChoice = resolution.nextRevotePending;
        revoteEligibleVoterIds = resolution.nextRevotePending ? resolution.nextEligibleVoterIds : revoteEligibleVoterIds;
      }
    }
    if (decisionResolved) this.resolutionType = this.eliminatedId ? (revoteOccurred ? 'REVOTE' : 'VOTE') : 'NO_ELIMINATION';

    this.revealQueue = this._buildRevealQueue({ initialVotes: this.initialVotes, revoteVotes: this.revoteVotes });

    const validVoteCount = this.voteRecords.filter(vote => !vote.wasNullified).length;
    const nullifiedVoteCount = this.voteRecords.filter(vote => vote.wasNullified).length;
    const tribalTimestamp = Date.now();
    const getName = (id) => this._findSurvivorById(id)?.name || id;

    const tribalSummary = {
      day,
      attendingTribeId: attendingTribeIdResolved,
      membersAtTribal,
      votes: this.voteRecords.map(vote => ({
        ...vote,
        voterName: getName(vote.voterId),
        targetName: getName(vote.targetId),
        nullified: vote.wasNullified
      })),
      initialVotes: this.initialVotes.map(vote => ({
        ...vote,
        voterName: getName(vote.voterId),
        targetName: getName(vote.targetId),
        nullified: vote.wasNullified
      })),
      validVoteCount,
      nullifiedVoteCount,
      idolOpportunities: this.idolOpportunities || [],
      immuneIds: [...this.immunityHolderIds],
      idolPlays: this.idolPlays.map(play => ({
        ...play,
        playerId: play.playedById,
        playerName: getName(play.playedById),
        targetId: play.playedOnId,
        targetName: getName(play.playedOnId)
      })),
      shotResults: this.shotResults.map(result => ({
        ...result,
        playerName: getName(result.playerId)
      })),
      initialCounts,
      initialTally: initialCounts,
      finalTallyInitial: initialCounts,
      revoteCounts: revoteOccurred ? { ...this.tiebreakRounds.at(-1)?.counts } : null,
      revoteTally: revoteOccurred ? { ...this.tiebreakRounds.at(-1)?.counts } : null,
      finalTallyRevote: revoteOccurred ? { ...this.tiebreakRounds.at(-1)?.counts } : null,
      decidingCounts,
      decidingTally: decidingCounts,
      eliminatedId: this.eliminatedId,
      eliminatedName: this.eliminatedId ? getName(this.eliminatedId) : null,
      majorityThreshold: this.majorityThreshold,
      voteOrder: this.revealQueue.map(vote => ({
        ...vote,
        voterName: getName(vote.voterId),
        targetName: getName(vote.targetId),
        nullified: vote.wasNullified
      })),
      wasTie: this.initialTie,
      initialTie,
      zeroValidVotes,
      revoteReason: zeroValidVotes ? 'VOID_VOTE' : initialTie ? 'TIE' : null,
      revoteTargetIds: [...this.currentTieIds],
      tiebreakRounds: this.tiebreakRounds.map(round => ({ ...round, votes: round.votes.map(vote => ({ ...vote })) })),
      revoteOccurred,
      revotePendingPlayerChoice,
      tribalState,
      decisionResolved,
      playerCanRevote: revotePendingPlayerChoice,
      revoteEligibleVoterIds,
      playerRevoteTargetIds: revotePendingPlayerChoice ? this.getLegalRevoteTargetIds(playerId, this.currentTieIds) : [],
      revoteVotes: this.revoteVotes.map(vote => ({
        ...vote,
        voterName: getName(vote.voterId),
        targetName: getName(vote.targetId),
        nullified: vote.wasNullified
      })),
      rockDrawOccurred,
      wentToRocks: rockDrawOccurred,
      rockDrawEligible: rockDrawEligible.map(id => ({ id, name: getName(id) })),
      rockDrawEliminatedId,
      forcedResolution: this.forcedResolution,
      tiedCandidateIds: tiedCandidates,
      ...this._deadlockSummaryFields(),
      createdAt: tribalTimestamp
    };

    tribalSummary.jeffCommentary = this.generateJeffCommentary(tribalSummary);
    this.latestSummary = tribalSummary;
    this.sessionStatus = decisionResolved ? 'resolved' : 'active';

    this._debug('runPreMergeTribal resolved', {
      initialTie,
      revoteOccurred,
      rockDrawOccurred,
      eliminatedId: this.eliminatedId,
      decidingCounts: tribalSummary.decidingCounts
    });

    return tribalSummary;
  }

  resolveRevoteWithPlayerChoice({ playerChoiceTargetId = null } = {}) {
    // Reuse the unresolved session. A missing, immune, or invented choice must
    // never silently proceed to NPC votes/rocks or create another Tribal number.
    if ((!this.initialTie && !this.zeroValidVotes) || this.sessionStatus !== 'active'
      || this.latestSummary?.tribalState !== 'REVOTE_PENDING' || !this.latestSummary?.playerCanRevote) return this.latestSummary;
    const resolvedTiedIds = [...this.currentTieIds];
    const playerId = this._normalizeId(this.gameManager.getPlayerSurvivor?.()?.id);
    const canRevote = this._getRevoteEligibleVoterIds(resolvedTiedIds, { voidVote: this.zeroValidVotes && !this.tiebreakRounds.length }).includes(playerId);
    const validChoice = this.getLegalRevoteTargetIds(playerId, resolvedTiedIds)
      .some(id => this._idsEqual(id, playerChoiceTargetId));
    if (!resolvedTiedIds.length || (canRevote && !validChoice)) return this.latestSummary;

    const initialCounts = this.buildVoteTally(this.initialVotes.filter(vote => vote.phase === 'initial'));
    const resolution = this._resolveRevoteFlow({ tiedCandidateIds: resolvedTiedIds, playerChoiceTargetId, voidVote: this.zeroValidVotes && !this.tiebreakRounds.length });
    this.revealQueue = this._buildRevealQueue({ initialVotes: this.initialVotes, revoteVotes: this.revoteVotes });

    const day = this.gameManager.getDay?.() ?? null;
    const membersAtTribal = this.voters.map(member => ({ id: member.id, name: member.name || member.id }));
    const getName = (id) => this._findSurvivorById(id)?.name || id;
    const validVoteCount = this.voteRecords.filter(vote => !vote.wasNullified).length;
    const nullifiedVoteCount = this.voteRecords.filter(vote => vote.wasNullified).length;

    const tribalSummary = {
      day,
      attendingTribeId: this.currentTribe?.tribeId ?? this.currentTribe?.id ?? null,
      membersAtTribal,
      votes: this.voteRecords.map(vote => ({ ...vote, voterName: getName(vote.voterId), targetName: getName(vote.targetId), nullified: vote.wasNullified })),
      initialVotes: this.initialVotes.map(vote => ({ ...vote, voterName: getName(vote.voterId), targetName: getName(vote.targetId), nullified: vote.wasNullified })),
      validVoteCount,
      nullifiedVoteCount,
      idolOpportunities: this.idolOpportunities || [],
      immuneIds: [...this.immunityHolderIds],
      idolPlays: this.idolPlays.map(play => ({ ...play, playerId: play.playedById, playerName: getName(play.playedById), targetId: play.playedOnId, targetName: getName(play.playedOnId) })),
      shotResults: this.shotResults.map(result => ({ ...result, playerName: getName(result.playerId) })),
      initialCounts,
      initialTally: initialCounts,
      finalTallyInitial: initialCounts,
      revoteCounts: { ...this.tiebreakRounds.at(-1)?.counts },
      revoteTally: { ...this.tiebreakRounds.at(-1)?.counts },
      finalTallyRevote: { ...this.tiebreakRounds.at(-1)?.counts },
      decidingCounts: resolution.decidingCounts,
      decidingTally: resolution.decidingCounts,
      eliminatedId: this.eliminatedId,
      eliminatedName: this.eliminatedId ? getName(this.eliminatedId) : null,
      majorityThreshold: this.majorityThreshold,
      voteOrder: this.revealQueue.map(vote => ({ ...vote, voterName: getName(vote.voterId), targetName: getName(vote.targetId), nullified: vote.wasNullified })),
      wasTie: this.initialTie,
      initialTie: this.initialTie,
      zeroValidVotes: this.zeroValidVotes,
      revoteReason: this.zeroValidVotes ? 'VOID_VOTE' : 'TIE',
      revoteTargetIds: [...this.currentTieIds],
      tiebreakRounds: this.tiebreakRounds.map(round => ({ ...round, votes: round.votes.map(vote => ({ ...vote })) })),
      revoteOccurred: true,
      revotePendingPlayerChoice: Boolean(resolution.nextRevotePending),
      tribalState: resolution.nextRevotePending ? 'REVOTE_PENDING' : resolution.deadlockPending ? 'DEADLOCK_DISCUSSION'
        : !this.eliminatedId ? 'NO_ELIMINATION' : 'FINAL_VOTE',
      decisionResolved: !resolution.deadlockPending && !resolution.nextRevotePending,
      playerCanRevote: Boolean(resolution.nextRevotePending),
      revoteEligibleVoterIds: resolution.nextRevotePending ? resolution.nextEligibleVoterIds : resolution.revoteEligibleVoterIds,
      playerRevoteTargetIds: resolution.nextRevotePending ? this.getLegalRevoteTargetIds(playerId, this.currentTieIds) : [],
      revoteVotes: this.revoteVotes.map(vote => ({ ...vote, voterName: getName(vote.voterId), targetName: getName(vote.targetId), nullified: vote.wasNullified })),
      rockDrawOccurred: resolution.rockDrawOccurred,
      wentToRocks: resolution.rockDrawOccurred,
      rockDrawEligible: resolution.rockDrawEligible.map(id => ({ id, name: getName(id) })),
      rockDrawEliminatedId: resolution.rockDrawEliminatedId,
      forcedResolution: this.forcedResolution,
      tiedCandidateIds: resolvedTiedIds,
      ...this._deadlockSummaryFields(),
      createdAt: Date.now()
    };

    if (!resolution.deadlockPending && !resolution.nextRevotePending) {
      this.resolutionType = this.eliminatedId ? 'REVOTE' : 'NO_ELIMINATION';
      Object.assign(tribalSummary, this._deadlockSummaryFields());
    }
    tribalSummary.jeffCommentary = this.generateJeffCommentary(tribalSummary);
    this.latestSummary = tribalSummary;
    this.sessionStatus = resolution.deadlockPending || resolution.nextRevotePending ? 'active' : 'resolved';
    return tribalSummary;
  }

  buildTribeContext(attendingTribeId = null) {
    const tribes = this.gameManager.getTribes?.() || this.gameManager.tribes || [];
    const tribe = tribes.find(candidate => (
      String(candidate?.tribeId ?? candidate?.id) === String(attendingTribeId)
    )) || this.gameManager.getPlayerTribe?.();
    const aliveMembers = (tribe?.members || []).filter(member => !member?.isOut);

    this.currentTribe = tribe || null;
    this.voters = [...aliveMembers];
    this.eligibleTargets = [...aliveMembers];
    this.majorityThreshold = Math.floor(aliveMembers.length / 2) + 1;

    for (const member of aliveMembers) {
      if (this._hasImmunity(member)) this.immunityHolderIds.add(this._normalizeId(member.id));
      if (this._hasLostVote(member)) this.lostVoteIds.add(this._normalizeId(member.id));
      if (this._hasShotInTheDark(member)) this.shotEligibleIds.add(this._normalizeId(member.id));
      if (this._hasIdol(member)) this.idolHolderIds.add(this._normalizeId(member.id));
    }
  }

  _getPlayerVoteRequirement() {
    const player = this.voters.find(member => member?.isPlayer);
    if (!player?.id || !this.gameManager.hasVote?.(player)) return null;

    // A player cannot cast a ballot if every other attending survivor is immune.
    // The rest of the tribe may still vote, so this must not stall resolution.
    if (!this.eligibleTargets.some(target => !target.isOut && !this._idsEqual(target.id, player.id)
      && !this._hasImmunity(target))) return null;

    const playerId = this._normalizeId(player.id);
    if (this.sitdUsers.has(playerId) || this.playerVotes.has(playerId)) return null;

    return {
      playerId,
      playerName: player.name || playerId,
      reason: 'PLAYER_VOTE_REQUIRED'
    };
  }

  _buildPlayerVoteRequiredSummary({ day = null, membersAtTribal = [], attendingTribeId = null } = {}) {
    const requirement = this._getPlayerVoteRequirement();
    const summary = {
      day,
      attendingTribeId,
      membersAtTribal,
      votes: [],
      initialVotes: [],
      revoteVotes: [],
      idolPlays: [],
      shotResults: [],
      initialCounts: {},
      initialTally: {},
      decidingCounts: null,
      decidingTally: null,
      eliminatedId: null,
      eliminatedName: null,
      voteOrder: [],
      majorityThreshold: this.majorityThreshold,
      wasTie: false,
      initialTie: false,
      revoteOccurred: false,
      revotePendingPlayerChoice: false,
      tribalState: 'PLAYER_VOTE_REQUIRED',
      blockedReason: requirement?.reason || 'PLAYER_VOTE_REQUIRED',
      playerVoteRequired: true,
      requiredPlayerId: requirement?.playerId || null,
      decisionResolved: false,
      createdAt: Date.now()
    };
    summary.jeffCommentary = {
      ...this.generateJeffCommentary(summary),
      votingIntroLine: 'A player vote is still required before Tribal Council can continue.'
    };
    return summary;
  }

  registerPlayerVote(voterId, targetId) {
    const normalizedVoterId = this._normalizeId(voterId);
    const voter = this._findSurvivorById(voterId);
    const tribe = (this.gameManager.getTribes?.() || this.gameManager.tribes || [])
      .find(entry => (entry.members || []).some(member => this._idsEqual(member.id, voterId) && member.isPlayer));
    const target = (tribe?.members || []).find(member => this._idsEqual(member.id, targetId));
    if (!voter?.isPlayer || voter.isOut || !this.gameManager.hasVote?.(voter)
      || this._hasLostVote(voter) || this.lostVoteIds.has(normalizedVoterId)
      || !target || target.isOut || this._idsEqual(target.id, voterId) || this._hasImmunity(target)) return false;
    this.playerVotes.set(normalizedVoterId, this._normalizeId(target.id));
    if (this.sitdUsers.has(normalizedVoterId)) {
      this.sitdUsers.delete(normalizedVoterId);
    }
    return true;
  }

  registerPlayerShotInTheDark(voterId) {
    const normalizedVoterId = this._normalizeId(voterId);
    if (this.lostVoteIds.has(normalizedVoterId) || this.sitdUsers.has(normalizedVoterId)) {
      return false;
    }
    // SITD requires a vote to spend this tribal.
    const voter = this._findSurvivorById(voterId) || voterId;
    if (!this.gameManager.canPlayShotInTheDark?.(voter) || !this.gameManager.hasVote?.(voter)) {
      return false;
    }
    this.sitdUsers.add(normalizedVoterId);
    this.playerVotes.delete(normalizedVoterId);
    return true;
  }

  registerIdolPlay(playedById, playedOnId) {
    const tribe = this.currentTribe || (this.gameManager.getTribes?.() || this.gameManager.tribes || [])
      .find(entry => (entry.members || []).some(member => this._idsEqual(member.id, playedById)));
    const holder = (tribe?.members || []).find(member => this._idsEqual(member.id, playedById) && !member.isOut);
    const target = (tribe?.members || []).find(member => this._idsEqual(member.id, playedOnId) && !member.isOut);
    if (!holder || !target || !this._hasIdol(holder)) return false;
    this.idolRegistrations = this.idolRegistrations.filter(play => !this._idsEqual(play.playedById, playedById));
    this.idolRegistrations.push({ playedById: holder.id, playedOnId: target.id });
    return true;
  }

  playerHasIdol(playerId) {
    if (!playerId) return false;
    const survivor = this._findSurvivorById(playerId);
    return this._hasIdol(survivor);
  }

  computeNpcVotes() {
    const npcs = this.voters.filter(voter => !voter.isPlayer);

    for (const voter of npcs) {
      if (this.gameManager.hasVote?.(voter) === false
        || this.sitdUsers.has(this._normalizeId(voter.id)) || this.lostVoteIds.has(this._normalizeId(voter.id))) {
        continue;
      }

      let bestTargetId = null;
      let bestScore = Number.NEGATIVE_INFINITY;

      const eligible = this.eligibleTargets.filter(target => (
        !this._idsEqual(target.id, voter.id)
        && !target.isOut
        && !this.immunityHolderIds.has(this._normalizeId(target.id))
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
      const player = this._findSurvivorById(playerId) || playerId;
      if (!this.gameManager.canPlayShotInTheDark?.(player)) {
        continue;
      }

      const consumed = this.gameManager.consumeShotInTheDarkForSurvivor?.(playerId, {
        tribalNumber: this.tribalNumber,
        day: this.gameManager.getDay?.()
      });
      if (consumed === false) continue;

      const isSafe = Math.random() < 1 / 6;
      this.shotResults.push({
        type: 'shotInTheDark',
        playerId,
        success: isSafe,
        gainedImmunity: isSafe,
        result: isSafe ? 'SAFE' : 'NOT_SAFE',
        forfeitedVote: true,
        consumed: true,
        timestamp: Date.now()
      });

      if (!isSafe) continue;
      this.idolProtectedIds.add(this._normalizeId(playerId));

      for (const record of this.voteRecords) {
        if (this._idsEqual(record.targetId, playerId) && !record.wasNullified) {
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
    const knowledge = new TribalKnowledgeModel(this.gameManager, aliveMembers);

    for (const survivor of aliveMembers) {
      if (!this._hasIdol(survivor) || survivor.isPlayer) continue;

      const decision = decideNpcIdolPlay(survivor, knowledge);
      const shouldPlay = decision.play;
      this._debug('NPC idol perception', { survivorId: survivor.id, ...decision });

      if (shouldPlay) {
        if (!this.idolRegistrations.some(play => this._idsEqual(play.playedById, survivor.id))) {
          this.idolRegistrations.push({ playedById: survivor.id, playedOnId: survivor.id });
        }
      }
    }

    for (const play of this.idolRegistrations) {
      const playedBy = this.eligibleTargets.find(member => this._idsEqual(member.id, play.playedById));
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
      this.idolProtectedIds.add(this._normalizeId(protectedId));
      let nullifiedVotesCount = 0;

      for (const record of this.voteRecords) {
        if (this._idsEqual(record.targetId, protectedId) && !record.wasNullified) {
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
      const consumed = this.gameManager.consumeIdolForSurvivor?.(play.playedById, {
        playedOnId: play.playedOnId,
        day: this.gameManager.getDay?.(),
        tribalNumber: this.tribalNumber,
        successful
      }) || this._consumeIdolFallback(playedBy);

      this.idolPlays.push({
        type: 'idolPlay',
        playedById: play.playedById,
        playedOnId: play.playedOnId,
        successful,
        consumed: Boolean(consumed),
        nullifiedVotesCount,
        timestamp: Date.now()
      });
    }
  }

  buildVoteTally(records = []) {
    const source = Array.isArray(records) ? records : [];
    const tally = {};
    for (const vote of source) {
      if (vote.wasNullified) continue;
      const key = this._normalizeId(vote.targetId);
      tally[key] = (tally[key] || 0) + 1;
    }
    return tally;
  }

  getVoteRevealQueue() {
    return [...this.revealQueue];
  }

  _isProtected(id) {
    const normalized = this._normalizeId(id);
    return this.immunityHolderIds.has(normalized) || this.idolProtectedIds.has(normalized);
  }

  _getVoidRevoteTargetIds() {
    return this.eligibleTargets.filter(member => !member.isOut && !this._isProtected(member.id))
      .map(member => this._normalizeId(member.id));
  }

  _getRevoteEligibleVoterIds(tiedCandidateIds = [], { voidVote = false } = {}) {
    const tiedSet = new Set((voidVote ? [] : tiedCandidateIds || []).map(id => this._normalizeId(id)));
    const tiedWithVote = this.voters.filter(voter => tiedSet.has(this._normalizeId(voter.id))
      && !voter.isOut && !this.lostVoteIds.has(this._normalizeId(voter.id))
      && !this.sitdUsers.has(this._normalizeId(voter.id)) && this.gameManager.hasVote?.(voter) === true);
    // Equal voting power among tied contestants cancels their forced ballots,
    // regardless of tie size. Unequal power leaves the tied voters who still
    // hold a ballot eligible (including the modern lost-vote exception).
    const tiedCancel = !voidVote && (tiedWithVote.length === 0 || tiedWithVote.length === tiedSet.size);
    return this.voters
      .filter(voter => (
        !voter.isOut
        && (!tiedSet.has(this._normalizeId(voter.id)) || !tiedCancel)
        && !this.lostVoteIds.has(this._normalizeId(voter.id))
        && !this.sitdUsers.has(this._normalizeId(voter.id))
        && this.gameManager.hasVote?.(voter) === true
      ))
      .map(voter => this._normalizeId(voter.id));
  }

  getLegalRevoteTargetIds(playerId, targetIds = this.latestSummary?.revoteTargetIds || []) {
    return targetIds.filter(id => !this._idsEqual(id, playerId) && !this._isProtected(id)
      && this.eligibleTargets.some(member => !member.isOut && this._idsEqual(member.id, id)))
      .map(id => this._normalizeId(id));
  }

  _resolveRevoteFlow({ tiedCandidateIds = [], playerChoiceTargetId = null, voidVote = false } = {}) {
    this.revoteOccurred = true;
    let current = [...tiedCandidateIds];
    let choice = playerChoiceTargetId;
    let result;
    let nextRevotePending = false;
    let nextEligibleVoterIds = [];
    let deadlockPending = false;
    while (current.length > 1) {
      result = this.runRevote(current, { playerChoiceTargetId: choice, voidVote });
      const leaders = result.leaders.length ? result.leaders : current;
      this.currentTieIds = [...leaders];
      if (result.eliminatedId) { this.eliminatedId = result.eliminatedId; break; }
      if (leaders.length < current.length) {
        // A partial break creates a new ballot with the smaller tie. A formerly
        // tied contestant may now vote; never reuse the previous electorate.
        nextEligibleVoterIds = this._getRevoteEligibleVoterIds(leaders);
        const playerId = this._normalizeId(this.gameManager.getPlayerSurvivor?.()?.id);
        if (nextEligibleVoterIds.includes(playerId) && this.getLegalRevoteTargetIds(playerId, leaders).length) {
          nextRevotePending = true;
          break;
        }
        current = leaders;
        choice = null;
        voidVote = false;
        continue;
      }
      this.deadlockOccurred = true;
      this.deadlockTiedCandidateIds = [...leaders];
      this.consensusDecisionMakerIds = this._getConsensusDecisionMakerIds(leaders);
      deadlockPending = true;
      break;
    }

    return {
      revoteOccurred: true,
      decidingCounts: { ...this.tiebreakRounds.at(-1)?.counts },
      revoteEligibleVoterIds: result?.eligibleVoterIds || [],
      nextRevotePending,
      nextEligibleVoterIds,
      deadlockPending,
      rockDrawOccurred: false,
      rockDrawEligible: [],
      rockDrawEliminatedId: null
    };
  }

  runRevote(tiedCandidateIds, { playerChoiceTargetId = null, voidVote = false } = {}) {
    const revoteRecords = [];
    const voterIds = new Set(this._getRevoteEligibleVoterIds(tiedCandidateIds, { voidVote }));
    const revoters = this.voters.filter(voter => (
      voterIds.has(this._normalizeId(voter.id))
    ));

    for (const voter of revoters) {
      const candidates = tiedCandidateIds.filter(id => !this._isProtected(id) && !this._idsEqual(id, voter.id)
        && this.eligibleTargets.some(target => !target.isOut && this._idsEqual(target.id, id)));
      if (candidates.length === 0) continue;

      let selected = candidates[0];
      if (voter.isPlayer) {
        const normalizedChoice = this._normalizeId(playerChoiceTargetId);
        if (!normalizedChoice || !candidates.some(id => this._idsEqual(id, normalizedChoice))) {
          continue;
        }
        selected = normalizedChoice;
      } else {
        let score = Number.NEGATIVE_INFINITY;
        for (const candidateId of candidates) {
          const candidate = this.eligibleTargets.find(target => this._idsEqual(target.id, candidateId));
          if (!candidate) continue;
          const candidateScore = this._scoreNpcTarget(voter, candidate);
          if (candidateScore > score) {
            score = candidateScore;
            selected = candidateId;
          }
        }
      }

      this._recordVote(voter.id, selected, true, revoteRecords, 'revote', this.tiebreakRounds.length);
    }

    const revoteTally = this.buildVoteTally(revoteRecords);
    const topCount = this._getHighestCount(revoteTally);
    const leaders = topCount > 0
      ? Object.entries(revoteTally).filter(([, count]) => count === topCount).map(([id]) => id)
      : [];

    this.tiebreakRounds.push({ index: this.tiebreakRounds.length, tiedIds: [...tiedCandidateIds],
      eligibleVoterIds: [...voterIds], votes: [...revoteRecords], counts: { ...revoteTally }, leaders: [...leaders] });

    return {
      eliminatedId: leaders.length === 1 ? leaders[0] : null,
      leaders,
      records: revoteRecords,
      eligibleVoterIds: revoters.map(voter => this._normalizeId(voter.id))
    };
  }

  runRockDraw(tiedCandidateIds) {
    const eligible = this._getDeadlockRockPool(tiedCandidateIds);

    if (eligible.length === 0) {
      return {
        eligible: [],
        eliminatedId: null,
        forcedResolution: true
      };
    }

    const drawn = eligible[Math.floor(Math.random() * eligible.length)];
    return {
      eligible,
      eliminatedId: drawn || null,
      forcedResolution: false
    };
  }

  _getDeadlockRockPool(tiedIds) {
    return eligibleRockDrawers(this.eligibleTargets, tiedIds, [
      ...this.immunityHolderIds, ...this.idolProtectedIds,
      ...this.shotResults.filter(result => result.success).map(result => this._normalizeId(result.playerId))
    ]);
  }

  _getConsensusDecisionMakerIds(tiedIds) {
    const tied = new Set(tiedIds.map(id => this._normalizeId(id)));
    return this.voters.filter(voter => !voter.isOut && !tied.has(this._normalizeId(voter.id))
      && !this.lostVoteIds.has(this._normalizeId(voter.id))
      && !this.sitdUsers.has(this._normalizeId(voter.id))
      && this.gameManager.hasVote?.(voter) === true)
      .map(voter => this._normalizeId(voter.id));
  }

  _scoreConsensusTarget(voter, target, { pressureTargetId = null, rockPool = [] } = {}) {
    const revote = this.revoteVotes.findLast(vote => this._idsEqual(vote.voterId, voter.id));
    const initial = this.initialVotes.find(vote => this._idsEqual(vote.voterId, voter.id));
    const trust = Number(this.gameManager.getTrust?.(voter.id, target.id));
    const rawRisk = Number(voter.risk ?? voter.traits?.risk ?? 5);
    const risk = Number.isFinite(rawRisk) ? Math.max(0, Math.min(10, rawRisk)) : 5;
    const selfExposed = rockPool.some(id => this._idsEqual(id, voter.id));
    const allyExposed = !selfExposed && rockPool.some(id => this._inSameAlliance(voter.id, id));
    const concessionPressure = (selfExposed ? 8 : allyExposed ? 5 : 0) * (1 - risk / 12);
    return (this._idsEqual(revote?.targetId, target.id) ? 4 : 0)
      + (this._idsEqual(initial?.targetId, target.id) ? 2 : 0)
      + (Number.isFinite(trust) ? (100 - trust) / 100 : 0.5)
      + this._getIntentConfidence(voter, target)
      - (this._inSameAlliance(voter.id, target.id) ? 1 : 0)
      + (this._idsEqual(pressureTargetId, target.id) ? concessionPressure : 0);
  }

  _consensusPressureTarget(tiedIds, playerChoiceTargetId) {
    const preferences = new Map(tiedIds.map(id => [id, 0]));
    const playerId = this._normalizeId(this.gameManager.getPlayerSurvivor?.()?.id);
    for (const id of this.consensusDecisionMakerIds) {
      const voter = this._findSurvivorById(id);
      const prior = this.revoteVotes.findLast(vote => this._idsEqual(vote.voterId, id))
        || this.initialVotes.find(vote => this._idsEqual(vote.voterId, id));
      const target = id === playerId && tiedIds.some(tied => this._idsEqual(tied, playerChoiceTargetId))
        ? playerChoiceTargetId : prior?.targetId;
      const matched = tiedIds.find(tied => this._idsEqual(tied, target));
      const rawRisk = Number(voter?.risk ?? 5);
      const risk = Number.isFinite(rawRisk) ? Math.max(0, Math.min(10, rawRisk)) : 5;
      if (matched != null) preferences.set(matched, preferences.get(matched) + 1 + risk / 20);
    }
    return [...preferences].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))[0]?.[0] || null;
  }

  _deadlockSummaryFields() {
    const playerId = this._normalizeId(this.gameManager.getPlayerSurvivor?.()?.id);
    return {
      deadlockOccurred: this.deadlockOccurred,
      deadlockConsensusRequired: this.deadlockOccurred,
      deadlockConsensusReached: this.deadlockConsensusReached,
      deadlockDecisionTargetId: this.deadlockDecisionTargetId,
      deadlockTiedCandidateIds: [...this.deadlockTiedCandidateIds],
      currentDeadlockTiedIds: [...this.deadlockTiedCandidateIds],
      releasedFromTieIds: [...this.releasedFromTieIds],
      deadlockRounds: this.deadlockRounds.map(round => ({ ...round, tiedIds: [...round.tiedIds], choices: round.choices.map(choice => ({ ...choice })) })),
      consensusDecisionMakerIds: [...this.consensusDecisionMakerIds],
      consensusChoices: this.consensusChoices.map(choice => ({ ...choice })),
      playerCanDecideConsensus: this.deadlockOccurred && this.consensusDecisionMakerIds.includes(playerId),
      playerCanRefuseConsensus: this.deadlockOccurred && this.consensusDecisionMakerIds.includes(playerId)
        && (this._getDeadlockRockPool(this.deadlockTiedCandidateIds).length > 0 || this.deadlockTiedCandidateIds.length >= 2),
      resolutionType: this.resolutionType,
      fireMakingOccurred: Boolean(this.fireMakingWinnerId),
      fireMakingParticipants: [...this.fireMakingParticipants],
      fireMakingRounds: this.fireMakingRounds.map(round => ({ ...round, participants: [...round.participants] })),
      fireMakingWinnerId: this.fireMakingWinnerId,
      deadlockCasualtyId: this.deadlockCasualtyId
    };
  }

  resolveDeadlockConsensus({ playerChoiceTargetId = null } = {}) {
    if (this.sessionStatus !== 'active' || this.latestSummary?.tribalState !== 'DEADLOCK_DISCUSSION') return this.latestSummary;
    const tiedIds = this.deadlockTiedCandidateIds;
    const playerId = this._normalizeId(this.gameManager.getPlayerSurvivor?.()?.id);
    const playerParticipates = this.consensusDecisionMakerIds.includes(playerId);
    const playerRefuses = playerParticipates && playerChoiceTargetId === TRIBAL_CONSENSUS_REFUSAL;
    const safeChoice = typeof playerChoiceTargetId === 'string' && playerChoiceTargetId.startsWith('SAFE:')
      ? playerChoiceTargetId.slice(5) : null;
    if (playerParticipates && !playerRefuses && !tiedIds.some(id => this._idsEqual(id, safeChoice || playerChoiceTargetId))) return this.latestSummary;
    if (safeChoice && tiedIds.length < 3) return this.latestSummary;
    const rockPool = this._getDeadlockRockPool(tiedIds);
    const pressureTargetId = this._consensusPressureTarget(tiedIds, playerChoiceTargetId);

    this.consensusChoices = this.consensusDecisionMakerIds.map(id => {
      if (id === playerId && playerParticipates) return { voterId: id,
        targetId: playerRefuses || safeChoice ? null : this._normalizeId(playerChoiceTargetId),
        safeId: safeChoice || null, refused: playerRefuses };
      const voter = this._findSurvivorById(id);
      const safeId = tiedIds.length >= 3 ? this._chooseConsensusSafeId(voter, tiedIds) : null;
      const targetId = [...tiedIds].sort((a, b) => {
        const scoreA = this._scoreConsensusTarget(voter, this._findSurvivorById(a), { pressureTargetId, rockPool });
        const scoreB = this._scoreConsensusTarget(voter, this._findSurvivorById(b), { pressureTargetId, rockPool });
        return scoreB - scoreA || String(a).localeCompare(String(b));
      })[0];
      return { voterId: id, targetId, safeId };
    });

    const unanimous = !playerRefuses && !safeChoice && this.consensusChoices.length > 0
      && this.consensusChoices.every(choice => choice.targetId === this.consensusChoices[0].targetId);
    const unanimousSafe = !unanimous && !playerRefuses && tiedIds.length > 2
      && this.consensusChoices.length > 0 && this.consensusChoices[0].safeId
      && this.consensusChoices.every(choice => choice.safeId === this.consensusChoices[0].safeId);
    this.deadlockRounds.push({ index: this.deadlockRounds.length, tiedIds: [...tiedIds],
      decisionMakerIds: [...this.consensusDecisionMakerIds], choices: this.consensusChoices.map(choice => ({ ...choice })),
      action: unanimous ? 'ELIMINATE' : unanimousSafe ? 'RELEASE' : 'NO_CONSENSUS',
      targetId: unanimous ? this.consensusChoices[0].targetId : unanimousSafe ? this.consensusChoices[0].safeId : null });
    if (unanimousSafe) {
      const releasedId = this.consensusChoices[0].safeId;
      this.releasedFromTieIds.push(releasedId);
      this.deadlockTiedCandidateIds = tiedIds.filter(id => !this._idsEqual(id, releasedId));
      this.consensusDecisionMakerIds = this._getConsensusDecisionMakerIds(this.deadlockTiedCandidateIds);
      const summary = { ...this.latestSummary, ...this._deadlockSummaryFields(),
        tribalState: 'DEADLOCK_DISCUSSION', decisionResolved: false };
      this.latestSummary = summary;
      return summary;
    }
    this.deadlockConsensusReached = unanimous;
    if (unanimous) {
      this.deadlockDecisionTargetId = this.consensusChoices[0].targetId;
      this.eliminatedId = this.deadlockDecisionTargetId;
      this.resolutionType = 'DEADLOCK_CONSENSUS';
    } else {
      if (rockPool.length >= 2) {
        const draw = this.runRockDraw(tiedIds);
        this.rockDrawOccurred = true;
        this.rockDrawEligible = draw.eligible;
        this.eliminatedId = draw.eliminatedId;
        this.resolutionType = 'ROCKS';
      } else if (rockPool.length === 1) {
        this.rockDrawEligible = rockPool;
        this.deadlockCasualtyId = rockPool[0];
        this.eliminatedId = rockPool[0];
        this.resolutionType = 'AUTOMATIC_DEADLOCK';
      } else {
        const participants = tiedIds.map(id => this._findSurvivorById(id));
        const fire = participants.length === 2 ? resolveFireMaking(participants)
          : resolveMultiWayFireMaking(participants);
        if (fire) {
          this.fireMakingParticipants = fire.participants;
          this.fireMakingRounds = fire.rounds || [fire];
          this.fireMakingWinnerId = fire.winnerId;
          this.eliminatedId = fire.eliminatedId;
          this.resolutionType = 'FIRE_MAKING';
        } else {
          this.forcedResolution = true;
          this.resolutionType = 'NO_ELIMINATION';
        }
      }
    }

    const getName = id => this._findSurvivorById(id)?.name || id;
    const summary = {
      ...this.latestSummary,
      ...this._deadlockSummaryFields(),
      eliminatedId: this.eliminatedId,
      eliminatedName: this.eliminatedId ? getName(this.eliminatedId) : null,
      tribalState: this.eliminatedId ? 'FINAL_VOTE' : 'NO_ELIMINATION',
      decisionResolved: true,
      rockDrawOccurred: this.rockDrawOccurred,
      wentToRocks: this.rockDrawOccurred,
      rockDrawEligible: (this.rockDrawEligible || []).map(id => ({ id, name: getName(id) })),
      rockDrawEliminatedId: this.rockDrawOccurred ? this.eliminatedId : null,
      forcedResolution: this.forcedResolution
    };
    summary.jeffCommentary = this.generateJeffCommentary(summary);
    this.latestSummary = summary;
    this.sessionStatus = 'resolved';
    return summary;
  }

  _chooseConsensusSafeId(voter, tiedIds) {
    if (!voter) return null;
    const ranked = [...tiedIds].sort((a, b) => {
      const score = id => (Number(this.gameManager.getTrust?.(voter.id, id)) || 50)
        + (this._inSameAlliance(voter.id, id) ? 18 : 0);
      return score(b) - score(a) || String(a).localeCompare(String(b));
    });
    const favored = ranked[0];
    return favored && ((Number(this.gameManager.getTrust?.(voter.id, favored)) || 50) >= 62
      || this._inSameAlliance(voter.id, favored)) ? favored : null;
  }

  _recordVote(voterId, targetId, wasRevote = false, targetCollection = this.voteRecords, phase = 'initial', roundIndex = null) {
    if (!voterId || !targetId) return null;
    // Safety: immune survivors cannot receive valid votes.
    if (this.immunityHolderIds.has(this._normalizeId(targetId)) || (wasRevote && this._isProtected(targetId))) return null;
    const record = {
      voterId,
      targetId,
      wasRevote,
      phase,
      ...(roundIndex != null ? { roundIndex } : {}),
      wasNullified: false,
      timestamp: Date.now()
    };
    targetCollection.push(record);
    if (phase === 'revote') {
      this.revoteVotes.push(record);
    } else {
      this.initialVotes.push(record);
    }
    if (targetCollection !== this.voteRecords) {
      this.voteRecords.push(record);
    }
    this.eventManager.publish(GameEvents.VOTE_CAST, {
      voterId,
      targetId,
      wasRevote,
      phase,
      timestamp: record.timestamp
    });
    return record;
  }

  _buildRevealQueue({ initialVotes = [], revoteVotes = [] } = {}) {
    const initialOrder = this.buildSuspensefulRevealOrder(initialVotes, this.buildVoteTally(initialVotes));
    const toRevealEntry = (vote, phase) => {
      const target = this._findSurvivorById(vote.targetId);
      const displayName = this._getFirstName(target?.name || vote.targetId);
      const nullifyReason = this.nullifiedVotes.find(entry => (
        this._idsEqual(entry.voterId, vote.voterId) && this._idsEqual(entry.targetId, vote.targetId)
      ))?.reason || null;

      return {
        phase,
        ...(vote.roundIndex != null ? { roundIndex: vote.roundIndex } : {}),
        voterId: this._normalizeId(vote.voterId),
        targetId: this._normalizeId(vote.targetId),
        wasNullified: Boolean(vote.wasNullified),
        nullifyReason,
        displayName,
        revealType: vote.wasNullified ? 'NULLIFIED' : 'VALID'
      };
    };

    return [
      ...initialOrder.map(vote => toRevealEntry(vote, 'initial')),
      ...this.tiebreakRounds.flatMap(round => this.buildSuspensefulRevealOrder(round.votes, round.counts)
        .map(vote => toRevealEntry(vote, 'revote')))
    ];
  }

  buildSuspensefulRevealOrder(voteRecords = [], finalTally = {}) {
    if (!Array.isArray(voteRecords) || voteRecords.length <= 1) {
      return [...(voteRecords || [])];
    }

    const validVotes = voteRecords.filter(vote => !vote.wasNullified);
    const nullifiedVotes = voteRecords.filter(vote => vote.wasNullified);
    const buckets = new Map();

    for (const vote of validVotes) {
      const key = this._normalizeId(vote.targetId);
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(vote);
    }

    const tallyEntries = Object.entries(finalTally)
      .map(([id, count]) => ({ id: this._normalizeId(id), count: Number(count) || 0 }))
      .filter(entry => entry.count > 0 && buckets.has(entry.id))
      .sort((a, b) => b.count - a.count || String(a.id).localeCompare(String(b.id)));

    const ordered = [];
    const running = {};
    const remaining = {};
    tallyEntries.forEach(entry => {
      running[entry.id] = 0;
      remaining[entry.id] = entry.count;
    });

    // Seeding phase.
    tallyEntries.forEach(entry => {
      const first = buckets.get(entry.id)?.shift();
      if (!first) return;
      ordered.push(first);
      running[entry.id] += 1;
      remaining[entry.id] -= 1;
    });

    const rankCandidate = (candidateId) => {
      const projectedShown = { ...running, [candidateId]: (running[candidateId] || 0) + 1 };
      const projectedRemaining = { ...remaining, [candidateId]: Math.max(0, (remaining[candidateId] || 0) - 1) };
      const states = Object.keys(projectedShown).map(id => ({
        shown: projectedShown[id] || 0,
        potential: (projectedShown[id] || 0) + (projectedRemaining[id] || 0)
      })).sort((a, b) => b.shown - a.shown || b.potential - a.potential);
      const leader = states[0] || { shown: 0, potential: 0 };
      const second = states[1] || { shown: 0, potential: 0 };
      const bestChaserPotential = states.slice(1).reduce((max, state) => Math.max(max, state.potential), 0);
      const locked = leader.shown > bestChaserPotential;
      return {
        locked,
        spread: leader.shown - second.shown,
        chaserPotential: bestChaserPotential,
        remaining: projectedRemaining[candidateId] || 0
      };
    };

    while (Object.values(remaining).some(count => count > 0)) {
      const candidates = tallyEntries.filter(entry => remaining[entry.id] > 0).map(entry => entry.id);
      candidates.sort((a, b) => {
        const ra = rankCandidate(a);
        const rb = rankCandidate(b);
        if (ra.locked !== rb.locked) return Number(ra.locked) - Number(rb.locked);
        if (ra.spread !== rb.spread) return ra.spread - rb.spread;
        if (ra.chaserPotential !== rb.chaserPotential) return rb.chaserPotential - ra.chaserPotential;
        if (ra.remaining !== rb.remaining) return ra.remaining - rb.remaining;
        return String(a).localeCompare(String(b));
      });

      const selected = candidates[0];
      const next = buckets.get(selected)?.shift();
      if (!next) break;
      ordered.push(next);
      running[selected] += 1;
      remaining[selected] = Math.max(0, remaining[selected] - 1);
    }

    if (nullifiedVotes.length === 0) {
      return ordered;
    }

    const withNullified = [];
    const spacing = Math.max(1, Math.floor(ordered.length / (nullifiedVotes.length + 1)));
    let nullifiedIndex = 0;

    ordered.forEach((vote, index) => {
      withNullified.push(vote);
      if ((index + 1) % spacing === 0 && nullifiedVotes[nullifiedIndex]) {
        withNullified.push(nullifiedVotes[nullifiedIndex]);
        nullifiedIndex += 1;
      }
    });

    while (nullifiedVotes[nullifiedIndex]) {
      withNullified.push(nullifiedVotes[nullifiedIndex]);
      nullifiedIndex += 1;
    }

    return withNullified;
  }

  _scoreNpcTarget(voter, target) {
    const allianceWeight = 0.35 - this._allianceAffinity(voter.id, target.id) * 0.25;
    const intentConfidence = this._getIntentConfidence(voter, target);
    const trust = this.gameManager.getTrust?.(voter.id, target.id) ?? 50;
    const distrustWeight = (100 - trust) / 100;
    const threatValue = this._extractThreat(target);
    const paranoia = this._extractParanoia(voter);
    const strategyIntentWeight = this._getStrategyIntentWeight(voter, target);
    const chaos = Math.random() * 0.05;

    return allianceWeight + intentConfidence + strategyIntentWeight + distrustWeight + threatValue + paranoia + chaos;
  }

  _getStrategyIntentWeight(voter, target) {
    const strategyPhaseSystem = this.gameManager.systems?.strategyPhaseSystem;
    if (!strategyPhaseSystem || !voter?.id || !target?.id) return 0;

    const directIntent = strategyPhaseSystem.getNpcTargetIntent?.(voter.id);
    if (directIntent && this._idsEqual(directIntent.targetId, target.id)) {
      const cap=directIntent.intentStatus==='lean' ? .25 : directIntent.intentStatus==='provisional' ? .65 : 1;
      return Math.max(0, Math.min(cap, directIntent.confidence ?? 0.5));
    }

    // A board aggregate must not pressure an NPC away from their own ballot.
    if (directIntent) return 0;

    // Fallback bridge for player/alliance target-board pressure when no direct NPC intent exists.
    const board = strategyPhaseSystem.getTribalTargetBoard?.() || this.gameManager.flags?.tribalTargetBoard;
    const heatMap = board?.heatMap || {};
    const targetHeat = Number(heatMap[this._normalizeId(target.id)]) || 0;
    if (targetHeat <= 0) return 0;

    const maxHeat = Math.max(...Object.values(heatMap).map(value => Number(value) || 0), 0);
    if (maxHeat <= 0) return 0;

    return Math.min(0.25, (targetHeat / maxHeat) * 0.25);
  }

  _allianceAffinity(fromId, toId) {
    return this.gameManager.systems?.allianceSystem?.getAllianceAffinity?.(fromId,toId) ?? 0;
  }
  _inSameAlliance(fromId, toId) { return this._allianceAffinity(fromId,toId) >= .35; }

  _getIntentConfidence(voter, target) {
    const intents = voter.personalIntent || voter.personalIntents || voter.intentions || [];
    if (!Array.isArray(intents)) return 0;
    const hit = intents.find(intent => this._idsEqual(intent?.targetId, target.id) || this._idsEqual(intent?.target, target.id));
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

  _getHighestCount(tally) {
    const counts = Object.values(tally);
    if (counts.length === 0) return 0;
    return Math.max(...counts);
  }

  _hasImmunity(survivor) {
    return this.gameManager.hasImmunity?.(survivor) === true;
  }

  _hasLostVote(survivor) {
    return this.gameManager.hasLostVote?.(survivor) === true;
  }

  _hasShotInTheDark(survivor) {
    const value = survivor?.advantages?.shotInTheDarkAvailable;
    if (typeof value === 'boolean') return value;
    if (Number.isFinite(value)) return value > 0;
    return survivor?.shotInTheDarkAvailable !== false;
  }

  generateJeffCommentary(tribalSummary = {}) {
    const eliminatedFirstName = this._getFirstName(tribalSummary.eliminatedName || tribalSummary.eliminatedId);
    const tieLine = 'We are tied.';

    return {
      arrivalLine: 'Welcome to Tribal Council.',
      votingIntroLine: 'It is time to vote.',
      votesRevealingIntroLine: 'I will read the votes.',
      idolWindowLine: 'If anyone has a hidden immunity idol and wants to play it, now would be the time to do so.',
      tieLine,
      revoteIntroLine: 'We will vote again. You may only vote for the tied players.',
      rocksIntroLine: 'We are deadlocked. We will draw rocks.',
      snuffLine: eliminatedFirstName
        ? `${eliminatedFirstName}, the tribe has spoken.`
        : 'The tribe has spoken.'
    };
  }


  _castPlayerVoteIfNeeded(voter) {
    if (!voter?.id) return;

    const voterId = this._normalizeId(voter.id);

    if (this.sitdUsers.has(voterId)) {
      // SITD consumes the player's vote for this tribal.
      this.playerVotes.delete(voterId);
      return;
    }

    if (!this.gameManager.hasVote?.(voter)) {
      return;
    }

    if (this.playerVotes.has(voterId)) {
      const selectedTarget = this.playerVotes.get(voterId);
      this._recordVote(voter.id, selectedTarget, false);
      return true;
    }

    // The player must make this choice through the UI. Never invent a vote.
    return false;
  }

  _consumeIdolFallback(survivor) {
    if (!survivor) return false;

    const idolSystem = this.gameManager.systems?.idolSystem;
    const inventory = idolSystem?.survivorInventories?.get?.(survivor.id)
      || idolSystem?.survivorInventories?.get?.(this._normalizeId(survivor.id));
    const idol = inventory?.idols?.find(entry => !entry?.isUsed && !entry?.played);
    if (idol) {
      idol.isUsed = true;
      idol.played = true;
      idol.usedOnDay = this.gameManager.getDay?.();
      return true;
    }

    if (survivor.hasIdol || survivor?.advantages?.idol || survivor?.advantages?.hasIdol) {
      survivor.hasIdol = false;
      survivor.advantages = {
        ...(survivor.advantages || {}),
        idol: false,
        hasIdol: false
      };
      return true;
    }

    return false;
  }

  _hasIdol(survivor) {
    if (!survivor) return false;
    if (survivor?.hasIdol || survivor?.advantages?.idol || survivor?.advantages?.hasIdol) {
      return true;
    }

    const idolSystem = this.gameManager.systems?.idolSystem;
    const inventory = idolSystem?.survivorInventories?.get?.(survivor?.id)
      || idolSystem?.survivorInventories?.get?.(this._normalizeId(survivor?.id));
    if (!inventory?.idols) return false;
    return inventory.idols.some(idol => !idol.isUsed && !idol.played);
  }

  _getFirstName(nameOrId) {
    const rawName = String(nameOrId || '').trim();
    if (!rawName) return '';
    return rawName.split(/\s+/)[0];
  }

  _normalizeId(id) {
    return id === undefined || id === null ? '' : String(id);
  }

  _idsEqual(a, b) {
    return this._normalizeId(a) === this._normalizeId(b);
  }

  _findSurvivorById(id) {
    const normalized = this._normalizeId(id);
    return (this.gameManager.survivors || []).find(member => this._idsEqual(member?.id, normalized))
      || this.voters.find(member => this._idsEqual(member?.id, normalized))
      || null;
  }

  _debug(message, payload = null) {
    if (this.gameManager?.gameSettings?.debugTribal !== true && this.gameManager?.debug?.tribal !== true) return;
    console.debug(`[TribalCouncilSystem] ${message}`, payload);
  }

}
