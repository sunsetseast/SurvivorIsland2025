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
    this.initialVotes = [];
    this.revoteVotes = [];
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
    this.revoteOccurred = false;
    this.rockDrawOccurred = false;
    this.forcedResolution = false;
    this.eliminatedId = null;
    this.majorityThreshold = 0;
  }

  runPreMergeTribal(options = {}) {
    const { attendingTribeId = null } = options;
    this.resetSessionState({ preservePlayerChoices: true });
    this.tribalNumber += 1;

    this.buildTribeContext(attendingTribeId);
    const day = this.gameManager.getDay?.() ?? null;

    console.log('[TribalCouncilSystem] runPreMergeTribal start', {
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

    for (const voter of this.voters) {
      if (!voter.isPlayer) continue;
      this._castPlayerVoteIfNeeded(voter);
    }

    this.computeNpcVotes();
    this.resolveShotInTheDark();
    this.resolveIdolStage();

    const initialCounts = this.buildVoteTally(this.initialVotes.filter(vote => vote.phase === 'initial'));
    const initialHighest = this._getHighestCount(initialCounts);
    const tiedCandidates = initialHighest > 0
      ? Object.entries(initialCounts).filter(([, count]) => count === initialHighest).map(([id]) => id)
      : [];

    const initialTie = tiedCandidates.length > 1;
    this.initialTie = initialTie;
    let revoteOccurred = false;
    let decidingCounts = initialCounts;
    let revoteEligibleVoterIds = [];
    let rockDrawOccurred = false;
    let rockDrawEligible = [];
    let rockDrawEliminatedId = null;
    let revotePendingPlayerChoice = false;
    let tribalState = 'FINAL_VOTE';
    let decisionResolved = true;

    if (!initialTie) {
      this.eliminatedId = tiedCandidates[0] || null;
    } else {
      this.initialTie = true;
      revoteEligibleVoterIds = this._getRevoteEligibleVoterIds(tiedCandidates);
      const playerId = this._normalizeId(this.gameManager.getPlayerSurvivor?.()?.id);
      const playerCanRevote = revoteEligibleVoterIds.includes(playerId);

      if (playerCanRevote) {
        revotePendingPlayerChoice = true;
        tribalState = 'REVOTE_PENDING';
        decisionResolved = false;
        decidingCounts = null;
      } else {
        const resolution = this._resolveRevoteFlow({ tiedCandidateIds: tiedCandidates, playerChoiceTargetId: null });
        revoteOccurred = resolution.revoteOccurred;
        decidingCounts = resolution.decidingCounts;
        rockDrawOccurred = resolution.rockDrawOccurred;
        rockDrawEligible = resolution.rockDrawEligible;
        rockDrawEliminatedId = resolution.rockDrawEliminatedId;
        tribalState = rockDrawOccurred ? 'ROCKS_DRAW' : 'FINAL_VOTE';
      }
    }

    this.revealQueue = this._buildRevealQueue({ initialVotes: this.initialVotes, revoteVotes: this.revoteVotes });

    const validVoteCount = this.voteRecords.filter(vote => !vote.wasNullified).length;
    const nullifiedVoteCount = this.voteRecords.filter(vote => vote.wasNullified).length;
    const tribalTimestamp = Date.now();
    const attendingTribeIdResolved = this.currentTribe?.tribeId ?? this.currentTribe?.id ?? null;
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
      revoteCounts: revoteOccurred ? this.buildVoteTally(this.revoteVotes.filter(vote => vote.phase === 'revote')) : null,
      revoteTally: revoteOccurred ? this.buildVoteTally(this.revoteVotes.filter(vote => vote.phase === 'revote')) : null,
      finalTallyRevote: revoteOccurred ? this.buildVoteTally(this.revoteVotes.filter(vote => vote.phase === 'revote')) : null,
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
      revoteOccurred,
      revotePendingPlayerChoice,
      tribalState,
      decisionResolved,
      playerCanRevote: revoteEligibleVoterIds.includes(this._normalizeId(this.gameManager.getPlayerSurvivor?.()?.id)),
      revoteEligibleVoterIds,
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
      createdAt: tribalTimestamp
    };

    tribalSummary.jeffCommentary = this.generateJeffCommentary(tribalSummary);

    console.log('[TribalCouncilSystem] runPreMergeTribal resolved', {
      initialTie,
      revoteOccurred,
      rockDrawOccurred,
      eliminatedId: this.eliminatedId,
      decidingCounts: tribalSummary.decidingCounts
    });

    return tribalSummary;
  }

  resolveRevoteWithPlayerChoice({ tiedCandidateIds = [], playerChoiceTargetId = null } = {}) {
    const resolvedTiedIds = (Array.isArray(tiedCandidateIds) && tiedCandidateIds.length)
      ? tiedCandidateIds
      : this._getCurrentTiedCandidateIds();
    if (!resolvedTiedIds.length) {
      return this.runPreMergeTribal({ attendingTribeId: this.currentTribe?.tribeId ?? this.currentTribe?.id ?? null });
    }

    const initialCounts = this.buildVoteTally(this.initialVotes.filter(vote => vote.phase === 'initial'));
    const resolution = this._resolveRevoteFlow({ tiedCandidateIds: resolvedTiedIds, playerChoiceTargetId });
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
      immuneIds: [...this.immunityHolderIds],
      idolPlays: this.idolPlays.map(play => ({ ...play, playerId: play.playedById, playerName: getName(play.playedById), targetId: play.playedOnId, targetName: getName(play.playedOnId) })),
      shotResults: this.shotResults.map(result => ({ ...result, playerName: getName(result.playerId) })),
      initialCounts,
      initialTally: initialCounts,
      finalTallyInitial: initialCounts,
      revoteCounts: this.buildVoteTally(this.revoteVotes.filter(vote => vote.phase === 'revote')),
      revoteTally: this.buildVoteTally(this.revoteVotes.filter(vote => vote.phase === 'revote')),
      finalTallyRevote: this.buildVoteTally(this.revoteVotes.filter(vote => vote.phase === 'revote')),
      decidingCounts: resolution.decidingCounts,
      decidingTally: resolution.decidingCounts,
      eliminatedId: this.eliminatedId,
      eliminatedName: this.eliminatedId ? getName(this.eliminatedId) : null,
      majorityThreshold: this.majorityThreshold,
      voteOrder: this.revealQueue.map(vote => ({ ...vote, voterName: getName(vote.voterId), targetName: getName(vote.targetId), nullified: vote.wasNullified })),
      wasTie: this.initialTie,
      initialTie: this.initialTie,
      revoteOccurred: true,
      revotePendingPlayerChoice: false,
      tribalState: 'FINAL_VOTE',
      decisionResolved: true,
      playerCanRevote: false,
      revoteEligibleVoterIds: resolution.revoteEligibleVoterIds,
      revoteVotes: this.revoteVotes.map(vote => ({ ...vote, voterName: getName(vote.voterId), targetName: getName(vote.targetId), nullified: vote.wasNullified })),
      rockDrawOccurred: resolution.rockDrawOccurred,
      wentToRocks: resolution.rockDrawOccurred,
      rockDrawEligible: resolution.rockDrawEligible.map(id => ({ id, name: getName(id) })),
      rockDrawEliminatedId: resolution.rockDrawEliminatedId,
      forcedResolution: this.forcedResolution,
      tiedCandidateIds: resolvedTiedIds,
      createdAt: Date.now()
    };

    tribalSummary.jeffCommentary = this.generateJeffCommentary(tribalSummary);
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

  registerPlayerVote(voterId, targetId) {
    const voter = this._findSurvivorById(voterId) || voterId;
    if (!this.gameManager.hasVote?.(voter) || this.lostVoteIds.has(this._normalizeId(voterId))) {
      return false;
    }
    const normalizedVoterId = this._normalizeId(voterId);
    this.playerVotes.set(normalizedVoterId, targetId);
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
    this.idolRegistrations = this.idolRegistrations.filter(play => play.playedById !== playedById);
    this.idolRegistrations.push({ playedById, playedOnId });
  }

  playerHasIdol(playerId) {
    if (!playerId) return false;
    const survivor = this._findSurvivorById(playerId);
    return this._hasIdol(survivor);
  }

  computeNpcVotes() {
    const npcs = this.voters.filter(voter => !voter.isPlayer);

    for (const voter of npcs) {
      if (this.sitdUsers.has(this._normalizeId(voter.id)) || this.lostVoteIds.has(this._normalizeId(voter.id))) {
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
      if (!this.gameManager.canPlayShotInTheDark?.(player) || !this.gameManager.hasVote?.(player)) {
        continue;
      }
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
      this.idolProtectedIds.add(protectedId);
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

  _getCurrentTiedCandidateIds() {
    const initialCounts = this.buildVoteTally(this.initialVotes.filter(vote => vote.phase === 'initial'));
    const highest = this._getHighestCount(initialCounts);
    if (highest <= 0) return [];
    return Object.entries(initialCounts)
      .filter(([, count]) => count === highest)
      .map(([id]) => id);
  }

  _getRevoteEligibleVoterIds(tiedCandidateIds = []) {
    const tiedSet = new Set((tiedCandidateIds || []).map(id => this._normalizeId(id)));
    return this.voters
      .filter(voter => (
        !voter.isOut
        && !tiedSet.has(this._normalizeId(voter.id))
        && !this.lostVoteIds.has(this._normalizeId(voter.id))
        && !this.sitdUsers.has(this._normalizeId(voter.id))
      ))
      .map(voter => this._normalizeId(voter.id));
  }

  _resolveRevoteFlow({ tiedCandidateIds = [], playerChoiceTargetId = null } = {}) {
    this.revoteOccurred = true;
    const revoteResult = this.runRevote(tiedCandidateIds, { playerChoiceTargetId });
    let decidingCounts = this.buildVoteTally(this.revoteVotes.filter(vote => vote.phase === 'revote'));
    let rockDrawOccurred = false;
    let rockDrawEligible = [];
    let rockDrawEliminatedId = null;

    if (revoteResult.eliminatedId) {
      this.eliminatedId = revoteResult.eliminatedId;
    } else {
      this.rockDrawOccurred = true;
      rockDrawOccurred = true;
      const rockResult = this.runRockDraw(tiedCandidateIds);
      rockDrawEligible = rockResult.eligible;
      rockDrawEliminatedId = rockResult.eliminatedId;
      this.forcedResolution = Boolean(rockResult.forcedResolution);
      this.eliminatedId = rockResult.eliminatedId;
      decidingCounts = null;
    }

    return {
      revoteOccurred: true,
      decidingCounts,
      revoteEligibleVoterIds: revoteResult.eligibleVoterIds,
      rockDrawOccurred,
      rockDrawEligible,
      rockDrawEliminatedId
    };
  }

  runRevote(tiedCandidateIds, { playerChoiceTargetId = null } = {}) {
    const revoteRecords = [];
    const revoters = this.voters.filter(voter => (
      !tiedCandidateIds.some(id => this._idsEqual(id, voter.id))
      && !voter.isOut
      && !this.lostVoteIds.has(this._normalizeId(voter.id))
      && !this.sitdUsers.has(this._normalizeId(voter.id))
    ));

    for (const voter of revoters) {
      const candidates = tiedCandidateIds.filter(id => !this.immunityHolderIds.has(this._normalizeId(id)));
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

      this._recordVote(voter.id, selected, true, revoteRecords, 'revote');
    }

    const revoteTally = this.buildVoteTally(revoteRecords);
    const topCount = this._getHighestCount(revoteTally);
    const leaders = topCount > 0
      ? Object.entries(revoteTally).filter(([, count]) => count === topCount).map(([id]) => id)
      : [];

    return {
      eliminatedId: leaders.length === 1 ? leaders[0] : null,
      records: revoteRecords,
      eligibleVoterIds: revoters.map(voter => this._normalizeId(voter.id))
    };
  }

  runRockDraw(tiedCandidateIds) {
    const eligible = this.eligibleTargets.filter(member => (
      !member.isOut
      && !this.immunityHolderIds.has(this._normalizeId(member.id))
      && !tiedCandidateIds.some(id => this._idsEqual(id, member.id))
    ));

    if (eligible.length === 0) {
      console.error('[TribalCouncilSystem] Rock draw had zero eligible players. Forcing random elimination among tied players.');
      return {
        eligible: [],
        eliminatedId: tiedCandidateIds[Math.floor(Math.random() * tiedCandidateIds.length)] || null,
        forcedResolution: true
      };
    }

    const drawn = eligible[Math.floor(Math.random() * eligible.length)];
    return {
      eligible: eligible.map(member => this._normalizeId(member.id)),
      eliminatedId: drawn?.id || null,
      forcedResolution: false
    };
  }

  _recordVote(voterId, targetId, wasRevote = false, targetCollection = this.voteRecords, phase = 'initial') {
    if (!voterId || !targetId) return null;
    // Safety: immune survivors cannot receive valid votes.
    if (this.immunityHolderIds.has(this._normalizeId(targetId))) return null;
    const record = {
      voterId,
      targetId,
      wasRevote,
      phase,
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
    const revoteOrder = this.buildSuspensefulRevealOrder(revoteVotes, this.buildVoteTally(revoteVotes));
    const toRevealEntry = (vote, phase) => {
      const target = this._findSurvivorById(vote.targetId);
      const displayName = this._getFirstName(target?.name || vote.targetId);
      const nullifyReason = this.nullifiedVotes.find(entry => (
        this._idsEqual(entry.voterId, vote.voterId) && this._idsEqual(entry.targetId, vote.targetId)
      ))?.reason || null;

      return {
        phase,
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
      ...revoteOrder.map(vote => toRevealEntry(vote, 'revote'))
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

  _getFirstName(rawName = '') {
    const first = String(rawName || '').trim().split(/\s+/)[0];
    return first ? first.toUpperCase() : 'UNKNOWN';
  }

  _scoreNpcTarget(voter, target) {
    const allianceWeight = this._inSameAlliance(voter.id, target.id) ? 0.1 : 0.35;
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
      return Math.max(0, Math.min(1, directIntent.confidence ?? 0.5));
    }

    // Fallback bridge for player/alliance target-board pressure when no direct NPC intent exists.
    const board = strategyPhaseSystem.getTribalTargetBoard?.() || this.gameManager.flags?.tribalTargetBoard;
    const heatMap = board?.heatMap || {};
    const targetHeat = Number(heatMap[this._normalizeId(target.id)]) || 0;
    if (targetHeat <= 0) return 0;

    const maxHeat = Math.max(...Object.values(heatMap).map(value => Number(value) || 0), 0);
    if (maxHeat <= 0) return 0;

    return Math.min(0.25, (targetHeat / maxHeat) * 0.25);
  }

  _inSameAlliance(id1, id2) {
    const allianceSystem = this.gameManager.systems?.allianceSystem;
    if (!allianceSystem || typeof allianceSystem.getAllAlliances !== 'function') return false;
    const alliances = allianceSystem.getAllAlliances() || [];
    return alliances.some(alliance => {
      const members = (alliance.members || alliance.memberIds || []).map(memberId => this._normalizeId(memberId));
      return members.includes(this._normalizeId(id1)) && members.includes(this._normalizeId(id2));
    });
  }

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

  _extractTrustSignal(survivor) {
    const signal = survivor.trustSignals?.recent ?? survivor.socialSignals?.trust ?? 0.5;
    if (!Number.isFinite(signal)) return 0.5;
    return signal > 1 ? signal / 100 : signal;
  }

  _countVotesAgainst(targetId, opts = {}) {
    const includeNullified = opts.includeNullified === true;
    return this.initialVotes.filter(record => {
      if (!this._idsEqual(record.targetId, targetId)) return false;
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
      return;
    }

    const fallbackTarget = this.eligibleTargets.find(target => (
      !this._idsEqual(target.id, voter.id)
      && !target.isOut
      && !this.immunityHolderIds.has(this._normalizeId(target.id))
    ));

    if (fallbackTarget) {
      this._recordVote(voter.id, fallbackTarget.id, false);
    }
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

}
