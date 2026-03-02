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
    this.wasTie = false;
    this.wentToRocks = false;
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
    let revoteOccurred = false;
    let decidingCounts = initialCounts;
    let revoteEligibleVoterIds = [];
    let rockDrawOccurred = false;
    let rockDrawEligible = [];
    let rockDrawEliminatedId = null;

    if (!initialTie) {
      this.eliminatedId = tiedCandidates[0] || null;
    } else {
      // Survivor tie flow: tie -> revote -> rocks.
      this.wasTie = true;
      revoteOccurred = true;
      const revoteResult = this.runRevote(tiedCandidates);
      revoteEligibleVoterIds = revoteResult.eligibleVoterIds;

      if (revoteResult.eliminatedId) {
        this.eliminatedId = revoteResult.eliminatedId;
        decidingCounts = this.buildVoteTally(this.revoteVotes.filter(vote => vote.phase === 'revote'));
      } else {
        // Still tied after revote: draw rocks among eligible non-immune, non-tied players.
        this.wentToRocks = true;
        rockDrawOccurred = true;
        const rockResult = this.runRockDraw(tiedCandidates);
        rockDrawEligible = rockResult.eligible;
        rockDrawEliminatedId = rockResult.eliminatedId;
        this.forcedResolution = Boolean(rockResult.forcedResolution);
        this.eliminatedId = rockResult.eliminatedId;
        decidingCounts = null;
      }
    }

    this.revealQueue = this._buildRevealQueue();

    const validVoteCount = this.voteRecords.filter(vote => !vote.wasNullified).length;
    const nullifiedVoteCount = this.voteRecords.filter(vote => vote.wasNullified).length;
    const tribalTimestamp = Date.now();
    const attendingTribeIdResolved = this.currentTribe?.tribeId ?? this.currentTribe?.id ?? null;
    const survivors = this.gameManager.survivors || [];
    const getName = (id) => survivors.find(member => member.id === id)?.name
      || this.voters.find(member => member.id === id)?.name
      || id;

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
      revoteCounts: revoteOccurred ? this.buildVoteTally(this.revoteVotes.filter(vote => vote.phase === 'revote')) : null,
      revoteTally: revoteOccurred ? this.buildVoteTally(this.revoteVotes.filter(vote => vote.phase === 'revote')) : null,
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
      wasTie: this.wasTie,
      initialTie,
      revoteOccurred,
      revoteEligibleVoterIds,
      revoteVotes: this.revoteVotes.map(vote => ({
        ...vote,
        voterName: getName(vote.voterId),
        targetName: getName(vote.targetId),
        nullified: vote.wasNullified
      })),
      rockDrawOccurred,
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
      if (this._hasImmunity(member)) this.immunityHolderIds.add(member.id);
      if (this._hasLostVote(member)) this.lostVoteIds.add(member.id);
      if (this._hasShotInTheDark(member)) this.shotEligibleIds.add(member.id);
      if (this._hasIdol(member)) this.idolHolderIds.add(member.id);
    }
  }

  registerPlayerVote(voterId, targetId) {
    if (!this.gameManager.hasVote?.(voterId)) {
      return false;
    }
    this.playerVotes.set(voterId, targetId);
    if (this.sitdUsers.has(voterId)) {
      this.sitdUsers.delete(voterId);
    }
    return true;
  }

  registerPlayerShotInTheDark(voterId) {
    // SITD requires a vote to spend this tribal.
    if (!this.gameManager.canPlayShotInTheDark?.(voterId)) {
      return false;
    }
    this.sitdUsers.add(voterId);
    this.playerVotes.delete(voterId);
    return true;
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
      if (!this.gameManager.canPlayShotInTheDark?.(playerId)) {
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

  buildVoteTally(records = []) {
    const source = Array.isArray(records) ? records : [];
    const tally = {};
    for (const vote of source) {
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
      !tiedCandidateIds.includes(voter.id)
      && !voter.isOut
      && !this.lostVoteIds.has(voter.id)
      && !this.sitdUsers.has(voter.id)
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
      eligibleVoterIds: revoters.map(voter => voter.id)
    };
  }

  runRockDraw(tiedCandidateIds) {
    const eligible = this.eligibleTargets.filter(member => (
      !member.isOut
      && !this.immunityHolderIds.has(member.id)
      && !tiedCandidateIds.includes(member.id)
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
      eligible: eligible.map(member => member.id),
      eliminatedId: drawn?.id || null,
      forcedResolution: false
    };
  }

  _recordVote(voterId, targetId, wasRevote = false, targetCollection = this.voteRecords, phase = 'initial') {
    if (!voterId || !targetId) return null;
    // Safety: immune survivors cannot receive valid votes.
    if (this.immunityHolderIds.has(targetId)) return null;
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

  _buildRevealQueue() {
    const initialVotes = [...this.initialVotes];
    const revoteVotes = [...this.revoteVotes];

    const shuffle = (stack) => {
      for (let i = stack.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [stack[i], stack[j]] = [stack[j], stack[i]];
      }
      return stack;
    };

    const stack = [...shuffle([...initialVotes]), ...shuffle([...revoteVotes])];

    const queue = [];

    for (const vote of stack) {
      const revealType = vote.wasNullified ? 'NULLIFIED' : 'VALID';
      queue.push({ ...vote, revealType });
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
    return this.initialVotes.filter(record => {
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
    const initialTally = tribalSummary.initialCounts || tribalSummary.initialTally || {};
    const decidingTally = tribalSummary.decidingCounts || tribalSummary.decidingTally || {};
    const nullifiedVoteCount = Number(tribalSummary.nullifiedVoteCount || 0);
    const idolSuccessCount = (tribalSummary.idolPlays || []).filter(play => play.successful).length;
    const sitdSuccess = (tribalSummary.shotResults || []).some(result => result.success);

    const ordered = Object.entries(initialTally).sort((a, b) => b[1] - a[1]);
    const lead = ordered[0]?.[1] || 0;
    const second = ordered[1]?.[1] || 0;
    const margin = Math.max(0, lead - second);
    const totalDecidingVotes = Object.values(decidingTally).reduce((sum, count) => sum + count, 0);
    const unanimous = totalDecidingVotes > 0 && Object.keys(decidingTally).length === 1;

    return {
      arrival: 'Come on in. Grab a torch and get fire, because in this game, fire represents your life.',
      preVote: 'Tonight, trust is currency. Spend it carefully.',
      sitdExplain: tribalSummary.shotResults?.length ? 'A Shot in the Dark was played tonight. One gamble can flip everything.' : '',
      idolOpportunity: tribalSummary.idolPlays?.length ? 'If you have an idol and you want to play it, now would be the time.' : 'If anybody has a hidden immunity idol and you want to play it, now would be the time.',
      votingIntro: 'It is time to vote.',
      readVotesIntro: 'I will read the votes.',
      afterInitial: unanimous
        ? 'That was decisive. When everyone lands on one name, that sends a message.'
        : margin <= 1
          ? 'Close vote. That is how cracks become fault lines.'
          : 'Clear numbers tonight, but those numbers can move fast in this game.',
      tieAnnouncement: tribalSummary.initialTie
        ? 'We are tied. That means we vote again, and only for the tied players.'
        : '',
      revoteIntro: tribalSummary.revoteOccurred
        ? 'This revote is your chance to show where you truly stand.'
        : '',
      afterRevote: tribalSummary.revoteOccurred && !tribalSummary.rockDrawOccurred
        ? 'The revote settled it. Lines are no longer hidden.'
        : '',
      rocksIntro: tribalSummary.rockDrawOccurred
        ? 'We are deadlocked. When strategy fails, chance takes over. We are drawing rocks.'
        : '',
      rocksResult: tribalSummary.rockDrawOccurred
        ? 'Tonight was decided by fate, not votes.'
        : '',
      snuffLine: [
        idolSuccessCount > 0 ? `An idol changed everything tonight with ${nullifiedVoteCount} vote${nullifiedVoteCount === 1 ? '' : 's'} voided.` : null,
        sitdSuccess ? 'Shot in the Dark hit, and safety came at the exact right moment.' : null,
        'The tribe has spoken.'
      ].filter(Boolean).join(' ')
    };
  }

  _castPlayerVoteIfNeeded(voter) {
    if (!voter?.id) return;

    if (this.sitdUsers.has(voter.id)) {
      // SITD consumes the player's vote for this tribal.
      this.playerVotes.delete(voter.id);
      return;
    }

    if (!this.gameManager.hasVote?.(voter)) {
      return;
    }

    if (this.playerVotes.has(voter.id)) {
      const selectedTarget = this.playerVotes.get(voter.id);
      this._recordVote(voter.id, selectedTarget, false);
      return;
    }

    const fallbackTarget = this.eligibleTargets.find(target => (
      target.id !== voter.id
      && !target.isOut
      && !this.immunityHolderIds.has(target.id)
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
    const inventory = idolSystem?.survivorInventories?.get?.(survivor?.id);
    if (!inventory?.idols) return false;
    return inventory.idols.some(idol => !idol.isUsed && !idol.played);
  }

}
