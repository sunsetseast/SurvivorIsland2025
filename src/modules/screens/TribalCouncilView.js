import { createElement, clearChildren } from '../utils/DOMUtils.js';
import eventManager, { GameEvents } from '../core/EventManager.js';
import TribalBeatRunner from './TribalBeatRunner.js';
import TribalQuestionEngine from '../systems/TribalQuestionEngine.js';
import { TRIBAL_CONSENSUS_REFUSAL } from '../systems/TribalCouncilSystem.js';
import { assignTribalSeats, getTribalSeat, TRIBAL_ART_WIDTH, TRIBAL_ART_HEIGHT } from './TribalSceneLayout.js';
import { planVoteReveals } from './TribalVoteRevealPlan.js';
import { TRIBAL_PACING, tribalMotionDelay } from './TribalPacing.js';

const ASSET_BASE = 'Assets/TribalCouncil';

export default class TribalCouncilView {
  constructor({ gameManager, tribalCouncilSystem, container, onComplete } = {}) {
    this.gameManager = gameManager;
    this.tribalCouncilSystem = tribalCouncilSystem;
    this.container = container;
    this.onComplete = onComplete;
    this.result = null;
    this.tribalSummary = null;
    this.playerVote = null;
    this.selectedVote = null;
    this.pendingIdolTarget = null;
    this.sitdConfirmPending = false;
    this.seatAssignments = new Map();
    this.revealTimer = null;
    this.sitdUsed = false;
    this.playerRevote = null;
    this.playerConsensusTarget = null;
    this.attendingTribeId = null;
    this.isCompleting = false;
    this.root = null;
    this.beatRunner = null;
    this.allPlayers = [];
    this.sessionJeffCommentary = {};
    this.questionEngine = new TribalQuestionEngine(gameManager);
    this.tribalContext = null;
    this.tribalQuestions = [];
    this.liveTribalMoment = null;
    this.questionResponses = new Map();
    this.questionResponseLog = [];
  }

  start() {
    this.setup();
  }

  setup(data = {}) {
    if (!this.container) {
      this.container = document.getElementById('tribal-council-screen');
    }
    if (!this.container) return;

    this.tribalCouncilSystem?.beginSession?.();
    this.isCompleting = false;
    this.result = null;
    this.tribalSummary = null;
    this.playerVote = null;
    this.selectedVote = null;
    this.pendingIdolTarget = null;
    this.sitdConfirmPending = false;
    this.sitdUsed = false;
    this.playerRevote = null;
    this.playerConsensusTarget = null;
    this.questionResponses = new Map();
    this.questionResponseLog = [];

    const playerTribe = this.gameManager.getPlayerTribe?.();
    this.attendingTribeId = data?.attendingTribeId ?? data?.tribeId ?? playerTribe?.tribeId ?? playerTribe?.id ?? null;
    this.allPlayers = this._buildAllPlayersList();
    const seated = (this._getAttendingTribe()?.members || []).filter(member => !member.isOut);
    this.seatAssignments = assignTribalSeats(seated);
    this.sessionJeffCommentary = this.tribalCouncilSystem?.generateJeffCommentary?.({}) || {};
    this.tribalContext = this.questionEngine.createContext({ attendingTribeId: this.attendingTribeId });
    this.tribalQuestions = this.questionEngine.generateQuestions({ context: this.tribalContext });
    this.liveTribalMoment = this.questionEngine.generateLiveTribalMoment({ context: this.tribalContext });

    clearChildren(this.container);
    this.root = createElement('div', { className: 'tribal-root' });
    this.container.appendChild(this.root);

    this.beatRunner = new TribalBeatRunner({
      container: this.root,
      beats: this._buildPreVoteBeats(),
      renderBeat: (beat, controls) => this._renderBeat(beat, controls)
    });
    this.beatRunner.start();
  }

  teardown() {
    this._clearRevealTimer();
    this.beatRunner?.destroy();
    this.beatRunner = null;
    if (this.container) {
      clearChildren(this.container);
      this.container.style.backgroundImage = '';
    }
    this.root = null;
  }

  getSurvivorById(id) {
    const normalized = String(id);
    return (this.gameManager.survivors || []).find(member => String(member?.id) === normalized)
      || this._getAttendingTribe()?.members?.find(member => String(member?.id) === normalized)
      || null;
  }

  getDisplayName(idOrSurvivor, { firstOnly = true } = {}) {
    const survivor = typeof idOrSurvivor === 'object' && idOrSurvivor
      ? idOrSurvivor
      : this.getSurvivorById(idOrSurvivor);
    const rawName = survivor?.name || (typeof idOrSurvivor === 'string' ? idOrSurvivor : String(idOrSurvivor ?? 'Unknown'));
    if (!firstOnly) return rawName;
    return String(rawName).trim().split(/\s+/)[0]?.toUpperCase?.() || 'UNKNOWN';
  }


  getTribalName(idOrSurvivor) {
    return this.getDisplayName(idOrSurvivor, { firstOnly: true });
  }
  _buildPreVoteBeats() {
    const tribe = this._getAttendingTribe();
    if (!tribe) {
      return [{
        id: 'tribal-error',
        background: `${ASSET_BASE}/arrival.png`,
        text: 'Unable to start Tribal Council: no attending tribe found.',
        textPos: 'top',
        button: { label: 'Finish', onClick: () => this.finish() }
      }];
    }

    const alive = (tribe.members || []).filter(member => !member.isOut);

    return [
      {
        id: 'arrival',
        background: `${ASSET_BASE}/arrival.png`,
        text: this.sessionJeffCommentary?.arrivalLine || 'WELCOME TO TRIBAL COUNCIL.',
        textPos: 'top',
        jeff: null,
        mood: 'tense',
        pauseMs: TRIBAL_PACING.arrivalHold,
        canSkipAfterMs: TRIBAL_PACING.arrivalHold - 350,
        autoAdvance: true,
        button: { label: 'CONTINUE' }
      },
      {
        id: 'seating',
        background: this._resolveTribalBackground(alive.length),
        showStools: true,
        stoolsData: alive,
        sceneMode: 'wide',
        mood: 'tense',
        pauseMs: TRIBAL_PACING.seatingHold,
        autoAdvance: true
      },
      {
        id: 'jeff-opening',
        background: this._resolveTribalBackground(alive.length),
        showStools: true,
        stoolsData: alive,
        text: this.questionEngine.getOpeningLine(this.tribalContext),
        textPos: 'top',
        jeff: { img: `${ASSET_BASE}/Jeff.png` },
        mood: 'watchful',
        canSkipAfterMs: TRIBAL_PACING.openingHold,
        button: { label: 'LET\'S TALK' }
      },
      ...this._buildQuestionBeats(alive),
      ...(this.liveTribalMoment ? [this._buildLiveTribalBeat(alive)] : []),
      {
        id: 'discussion-settle', background: this._resolveTribalBackground(alive.length),
        showStools: true, stoolsData: alive, sceneMode: 'wide',
        pauseMs: TRIBAL_PACING.discussionTransition, autoAdvance: true
      },
      {
        id: 'vote-intro',
        background: `${ASSET_BASE}/votewalk.jpeg`,
        text: 'It is time to vote.',
        textPos: 'center',
        mood: 'decisive',
        canSkipAfterMs: TRIBAL_PACING.openingHold,
        button: { label: 'VOTE' }
      },
      {
        id: 'voting-walk', background: `${ASSET_BASE}/votewalk.jpeg`,
        pauseMs: TRIBAL_PACING.voteWalk, autoAdvance: true
      },
      {
        id: 'voting-booth',
        background: `${ASSET_BASE}/votingbooth.png`,
        textPos: 'top',
        requiresDecision: true,
        button: {
          label: 'CONTINUE',
          onClick: () => this._handleVotingContinue(),
          disabled: () => {
            const hasVote = this.gameManager.hasVote?.(this.gameManager.getPlayerSurvivor?.()) === true;
            return hasVote && !this.playerVote && !this.sitdUsed;
          }
        },
        customRender: (content) => this._renderVotingContent(content)
      },
      {
        id: 'votes-collected',
        background: `${ASSET_BASE}/urn.png`,
        text: 'The votes are in.',
        textPos: 'top',
        pauseMs: TRIBAL_PACING.votesCollected, autoAdvance: true
      },
      {
        id: 'urn-away', background: `${ASSET_BASE}/urn.png`,
        text: 'Jeff goes to retrieve and tally the votes.', textPos: 'top',
        pauseMs: TRIBAL_PACING.urnAway, autoAdvance: true
      },
      {
        id: 'urn-return', background: `${ASSET_BASE}/urn.png`,
        text: 'Jeff returns with the urn.', textPos: 'top',
        pauseMs: TRIBAL_PACING.urnReturn, autoAdvance: true
      },
      {
        id: 'idol-window',
        background: `${ASSET_BASE}/nowisthetime.png`,
        textPos: 'top',
        requiresDecision: true,
        canSkipAfterMs: TRIBAL_PACING.idolPrompt,
        customRender: (content, controls) => this._renderIdolContent(content, controls),
        button: { label: this.tribalCouncilSystem?.playerHasIdol?.(this.gameManager.getPlayerSurvivor?.()?.id)
          ? 'KEEP IDOL / CONTINUE' : 'CONTINUE', onClick: (controls) => this._transitionToReadVotes(controls) }
      }
    ];
  }

  _buildQuestionBeats(alive = []) {
    return this.tribalQuestions.map((question, index) => ({
      id: `tribal-question-${question.id}`,
      background: this._resolveTribalBackground(alive.length),
      showStools: true,
      stoolsData: alive,
      stoolHighlightId: question.focusSurvivorId,
      sceneMode: 'focus',
      mood: question.mood?.id || 'tense',
      cameraTargetIds: question.focusSurvivorId ? [question.focusSurvivorId] : [],
      reactionTargetIds: (question.reactions || []).map(reaction => reaction.survivorId),
      customRender: (content) => this._renderQuestionContent(content, question),
      requiresDecision: true,
      button: {
        label: index === this.tribalQuestions.length - 1 && !this.liveTribalMoment ? 'MOVE TO THE VOTE' : 'CONTINUE',
        disabled: () => question.responseOptions?.length > 0 && !this.questionResponses.has(question.id)
      }
    }));
  }

  _buildLiveTribalBeat(alive = []) {
    const moment = this.liveTribalMoment;
    return {
      id: 'live-tribal-tension',
      background: this._resolveTribalBackground(alive.length),
      showStools: true,
      stoolsData: alive,
      stoolHighlightId: moment?.focusSurvivorId,
      sceneMode: 'reaction',
      mood: 'chaotic',
      cameraTargetIds: moment?.focusSurvivorId ? [moment.focusSurvivorId] : [],
      customRender: (content) => this._renderQuestionContent(content, moment, { live: true }),
      requiresDecision: true,
      button: {
        label: 'SETTLE BACK IN',
        disabled: () => !this.questionResponses.has(moment?.id)
      }
    };
  }

  _renderQuestionContent(content, question, { live = false } = {}) {
    if (!question) return;
    const focus = this.getSurvivorById(question.focusSurvivorId);
    const card = createElement('div', { className: `tribal-question ${live ? 'tribal-question-live' : ''}`.trim() });

    if (live) {
      card.appendChild(createElement('div', { className: 'tribal-question-kicker' }, 'LIVE TRIBAL'));
    } else {
      // The camera and Jeff's question identify the speaker without a debug label.
    }
    card.appendChild(createElement('div', { className: 'tribal-question-text' }, question.questionText));

    if (question.npcAnswer) {
      card.appendChild(createElement('div', { className: 'tribal-answer' }, question.npcAnswer));
    }

    const selectedResponseId = this.questionResponses.get(question.id);
    if (question.responseOptions?.length) {
      const options = createElement('div', { className: 'tribal-response-options' });
      question.responseOptions.forEach(response => {
        const isSelected = selectedResponseId === response.id;
        options.appendChild(createElement('button', {
          className: `rect-button small ${isSelected ? 'is-selected' : ''}`.trim(),
          type: 'button',
          disabled: Boolean(selectedResponseId),
          onclick: () => this._selectQuestionResponse(question, response)
        }, response.label));
      });
      card.appendChild(options);

      if (selectedResponseId) {
        const selected = question.responseOptions.find(response => response.id === selectedResponseId);
        card.appendChild(createElement('div', { className: 'tribal-response-feedback' }, selected?.text || 'You make your answer.'));
      }
    }

    content.appendChild(card);

    const reactions = this._shouldShowDebugSummary() ? question.reactions || [] : [];
    if (reactions.length) {
      const reactionWrap = createElement('div', { className: 'tribal-reactions' });
      reactions.slice(0, 2).forEach(reaction => {
        reactionWrap.appendChild(createElement('div', { className: 'tribal-reaction' }, reaction.text));
      });
      content.appendChild(reactionWrap);
    }
  }

  _selectQuestionResponse(question, response) {
    if (!question || !response || this.questionResponses.has(question.id)) return;
    const result = this.questionEngine.applyResponse(question, response);
    this.questionResponses.set(question.id, response.id);
    this.questionResponseLog.push({
      questionId: question.id,
      topic: question.topic,
      responseId: response.id,
      responseLabel: response.label,
      responseText: response.text,
      applied: Boolean(result?.applied)
    });
    this.tribalContext = this.questionEngine.createContext({ attendingTribeId: this.attendingTribeId });
    this.beatRunner?.goTo(this.beatRunner.currentIndex, { force: true });
  }

  _transitionToReadVotes(controls) {
    if (!this.attendingTribeId) {
      this.finish();
      return;
    }

    this.tribalSummary = this.tribalCouncilSystem.runPreMergeTribal({ attendingTribeId: this.attendingTribeId });
    if (this.tribalSummary?.tribalState === 'PLAYER_VOTE_REQUIRED') {
      controls.setBeats(this._buildPreVoteBeats(), { index: this._findVotingBoothIndex() });
      return;
    }

    this.tribalSummary.questionResponses = [...this.questionResponseLog];
    this.tribalSummary.tribalQuestions = this.tribalQuestions.map(question => ({
      id: question.id,
      topic: question.topic,
      focusSurvivorId: question.focusSurvivorId,
      severity: question.severity,
      questionText: question.questionText
    }));
    this.result = this.tribalSummary;

    const postVoteBeats = this._buildPostVoteBeats();
    controls.setBeats(postVoteBeats, { index: 0 });
  }

  _findVotingBoothIndex() {
    return Math.max(0, this._buildPreVoteBeats().findIndex(beat => beat.id === 'voting-booth'));
  }

  _buildPostVoteBeats() {
    const beats = [
      ...this._buildAdvantageBeats(),
      {
        id: 'read-votes-intro',
        background: `${ASSET_BASE}/illread.png`,
        text: 'Once the votes are read, the decision is final. I will read the votes.',
        textPos: 'top',
        jeff: this.tribalSummary?.jeffCommentary?.votesRevealingIntroLine ? { img: `${ASSET_BASE}/Jeff.png` } : null,
        mood: 'suspense',
        canSkipAfterMs: TRIBAL_PACING.openingHold,
        button: { label: 'READ VOTES' }
      },
      ...this._buildVoteRevealBeats((this.tribalSummary?.voteOrder || []).filter(v => v.phase !== 'revote'), 'initial', { mustEstablishTie: Boolean(this.tribalSummary?.initialTie) })
    ];

    const noRevotePossible = this.tribalSummary?.tribalState === 'NO_ELIMINATION'
      && !(this.tribalSummary?.revoteVotes || []).length;
    if (noRevotePossible) {
      beats.push({ id: this.tribalSummary?.zeroValidVotes ? 'void-vote-announcement' : 'tie-announcement',
        background: `${ASSET_BASE}/voteread.png`,
        text: 'There is no legal way to resolve another ballot tonight.', textPos: 'top',
        canSkipAfterMs: TRIBAL_PACING.tieHold,
        button: { label: 'CONTINUE' } });
    }
    if ((this.tribalSummary?.initialTie || this.tribalSummary?.zeroValidVotes) && !noRevotePossible) {
      const voidVote = Boolean(this.tribalSummary?.zeroValidVotes);
      const tieBeats = [
        {
          id: voidVote ? 'void-vote-announcement' : 'tie-announcement',
          background: `${ASSET_BASE}/voteread.png`,
          text: voidVote ? 'No votes count. We vote again. Anyone protected tonight cannot receive a vote.'
            : this.tribalSummary?.jeffCommentary?.tieLine || 'WE ARE TIED. THAT MEANS WE VOTE AGAIN, AND ONLY FOR THE TIED PLAYERS.',
          textPos: 'top',
          mood: 'shock',
          canSkipAfterMs: TRIBAL_PACING.tieHold,
          button: { label: 'CONTINUE' }
        },
        {
          id: 'tie-hold', background: this._resolveTribalBackground(this.tribalSummary?.membersAtTribal?.length),
          showStools: true, stoolsData: (this._getAttendingTribe()?.members || []).filter(member => !member.isOut),
          sceneMode: 'wide', pauseMs: TRIBAL_PACING.tieHold, autoAdvance: true
        },
        {
          id: 'revote-intro',
          background: `${ASSET_BASE}/votingbooth.png`,
          text: voidVote ? 'A new ballot begins. Anyone without a vote tonight still cannot vote.'
            : this.tribalSummary?.jeffCommentary?.revoteIntroLine || 'THIS REVOTE IS YOUR CHANCE TO SHOW WHERE YOU TRULY STAND.',
          textPos: 'top',
          ...(this.tribalSummary?.playerCanRevote
            ? { button: { label: 'VOTE NOW' }, requiresDecision: true }
            : { pauseMs: TRIBAL_PACING.voteWalk, autoAdvance: true }),
          customRender: (content) => this._renderRevoteContext(content)
        }
      ];

      if (this.tribalSummary?.tribalState === 'REVOTE_PENDING' && this.tribalSummary?.playerCanRevote && this.tribalSummary?.revotePendingPlayerChoice) {
        tieBeats.push({
          id: 'revote-voting-booth',
          background: `${ASSET_BASE}/votingbooth.png`,
          textPos: 'top',
          customRender: (content) => this._renderRevoteVotingContent(content),
          requiresDecision: true,
          button: {
            label: 'CAST REVOTE',
            disabled: () => !this.playerRevote,
            onClick: (controls) => this._resolvePendingRevote(controls)
          }
        });
      }

      tieBeats.push(...this._buildVoteRevealBeats((this.tribalSummary?.voteOrder || []).filter(v => v.phase === 'revote'), 'revote'));
      beats.push(...tieBeats);

      if (this.tribalSummary?.deadlockOccurred) {
        beats.push({ id: 'revote-deadlock-announcement', background: `${ASSET_BASE}/voteread.png`,
          text: 'The revote is still tied. There will be no more voting.', textPos: 'top',
          canSkipAfterMs: TRIBAL_PACING.deadlockHold, button: { label: 'DISCUSS' } });
        beats.push({ id: 'deadlock-discussion', background: this._resolveTribalBackground(this.tribalSummary?.membersAtTribal?.length),
          showStools: true, stoolsData: (this._getAttendingTribe()?.members || []).filter(member => !member.isOut),
          sceneMode: 'wide', mood: 'deadlock', requiresDecision: true,
          customRender: content => this._renderDeadlockContent(content),
          button: { label: this.tribalSummary?.playerCanDecideConsensus ? 'CONFIRM DECISION' : 'HEAR DECISION',
            disabled: () => this.tribalSummary?.playerCanDecideConsensus && !this.playerConsensusTarget,
            onClick: controls => this._resolvePendingDeadlock(controls) },
          secondaryActions: this.tribalSummary?.playerCanRefuseConsensus
            ? [{ label: 'DO NOT AGREE', onClick: controls => this._resolvePendingDeadlock(controls, { refuse: true }) }] : [] });
        if (this.tribalSummary?.tribalState === 'DEADLOCK_DISCUSSION') return beats;

        const method = this.tribalSummary?.resolutionType;
        beats.push({ id: 'deadlock-outcome', background: `${ASSET_BASE}/voteread.png`, textPos: 'top',
          text: this.tribalSummary?.deadlockConsensusReached
            ? `The tribe agrees. ${this.getTribalName(this.tribalSummary.deadlockDecisionTargetId)} is leaving.`
            : method === 'ROCKS' ? 'The tribe cannot agree. The tied survivors are safe. The eligible survivors will draw rocks.'
              : method === 'AUTOMATIC_DEADLOCK' ? 'The tribe cannot agree. Only one survivor is exposed.'
                : method === 'FIRE_MAKING' ? 'The tribe cannot agree. With nobody eligible to draw rocks, fire will break the tie.'
                  : 'The tribe cannot agree.',
          canSkipAfterMs: TRIBAL_PACING.deadlockHold, button: { label: 'CONTINUE' } });
        if (method === 'ROCKS') {
          beats.push({ id: 'rocks-intro', background: `${ASSET_BASE}/voteread.png`,
            text: 'The unprotected survivors will draw rocks.', textPos: 'top',
            customRender: content => this._renderRockList(content),
            canSkipAfterMs: TRIBAL_PACING.rockReveal, button: { label: 'REVEAL ROCKS' } },
          { id: 'rocks-result', background: `${ASSET_BASE}/snuff.jpeg`,
            text: `${this.getTribalName(this.tribalSummary.rockDrawEliminatedId)} has the bad rock.`, textPos: 'center',
            canSkipAfterMs: TRIBAL_PACING.deadlockHold, button: { label: 'CONTINUE' } });
        } else if (method === 'AUTOMATIC_DEADLOCK') {
          beats.push({ id: 'automatic-deadlock', background: `${ASSET_BASE}/voteread.png`,
            text: `${this.getTribalName(this.tribalSummary.deadlockCasualtyId)} is the only unprotected survivor outside the tie. There is no rock to draw.`,
            textPos: 'top', canSkipAfterMs: TRIBAL_PACING.deadlockHold, button: { label: 'CONTINUE' } });
        } else if (method === 'FIRE_MAKING') {
          const names = this.tribalSummary.fireMakingParticipants.map(id => this.getTribalName(id)).join(', ');
          beats.push({ id: 'fire-intro', background: `${ASSET_BASE}/voteread.png`,
            text: `No one can draw rocks. ${names} will make fire to break the tie.`, textPos: 'top',
            canSkipAfterMs: TRIBAL_PACING.fireReveal, button: { label: 'MAKE FIRE' } });
          (this.tribalSummary.fireMakingRounds || []).slice(0, -1).forEach((round, index) => beats.push(
            { id: `fire-hold-${index}`, background: `${ASSET_BASE}/urn.png`,
              text: 'The flames rise.', textPos: 'center', pauseMs: TRIBAL_PACING.fireReveal, autoAdvance: true },
            { id: `fire-round-${index}`, background: `${ASSET_BASE}/voteread.png`,
              text: `${this.getTribalName(round.winnerId)} is safe. ${this.getTribalName(round.eliminatedId)} faces the next fire.`,
              textPos: 'top', pauseMs: TRIBAL_PACING.fireReveal, autoAdvance: true }
          ));
          beats.push({ id: 'fire-hold', background: `${ASSET_BASE}/urn.png`,
            text: 'The flames rise.', textPos: 'center', pauseMs: TRIBAL_PACING.fireReveal, autoAdvance: true },
          { id: 'fire-result', background: `${ASSET_BASE}/voteread.png`,
            text: `${this.getTribalName(this.tribalSummary.fireMakingWinnerId)} wins. ${this.getTribalName(this.result.eliminatedId)} loses fire-making.`,
            textPos: 'top', canSkipAfterMs: TRIBAL_PACING.deadlockHold, button: { label: 'CONTINUE' } });
        }
      }
    }

    if (this.tribalSummary?.tribalState === 'NO_ELIMINATION') {
      beats.push({ id: 'no-elimination', background: `${ASSET_BASE}/voteread.png`,
        text: this.tribalSummary?.revoteTargetIds?.length
          ? 'No legal revote can decide tonight. The tribe returns to camp.'
          : 'No one is eligible to leave tonight. The tribe returns to camp.', textPos: 'top',
        button: { label: 'RETURN TO CAMP', onClick: () => this.finish() } });
      return beats;
    }
    const eliminatedName = this.getTribalName(this.result?.eliminatedId);
    beats.push({
      id: 'snuff',
      background: `${ASSET_BASE}/snuff.jpeg`,
      text: this.result?.jeffCommentary?.snuffLine || `${eliminatedName}, THE TRIBE HAS SPOKEN.`,
      textPos: 'center',
      mood: 'final',
      canSkipAfterMs: TRIBAL_PACING.snuffHold,
      button: { label: 'CONTINUE' }
    });

    beats.push({
      id: 'tribal-exit',
      background: `${ASSET_BASE}/snuff.jpeg`,
      text: `${eliminatedName} leaves Tribal Council. The tribe returns to camp.`,
      textPos: 'top',
      canSkipAfterMs: TRIBAL_PACING.exitHold,
      button: { label: this._shouldShowDebugSummary() ? 'REVIEW SUMMARY' : 'RETURN TO CAMP',
        onClick: () => (this._shouldShowDebugSummary() ? this.renderDebugSummary() : this.finish()) }
    });

    return beats;
  }

  _buildVoteRevealBeats(votes = [], phase = 'initial', options = {}) {
    const shownVotes = planVoteReveals(votes, options);
    if (!shownVotes.length) return [];

    const counts = {};
    let previousLeader = null;

    return shownVotes.map((vote, index) => {
      const countsBefore = { ...counts };
      if (!vote.wasNullified) {
        const key = String(vote.targetId);
        counts[key] = (counts[key] || 0) + 1;
      }
      const countsAfter = { ...counts };
      const leadersBefore = this._getLeadersFromCounts(countsBefore);
      const leadersAfter = this._getLeadersFromCounts(countsAfter);
      const currentLeader = leadersAfter.length === 1 ? leadersAfter[0] : null;
      const totalReveals = shownVotes.length;
      const revealIndex = index + 1;

      const tallyLines = Object.entries(countsAfter)
        .filter(([, count]) => count > 0)
        .sort((a, b) => b[1] - a[1])
        .map(([id, count]) => `${this.getTribalName(id)}: ${count}`);

      const jeffLine = this._getVoteCommentary({
        countsBefore,
        countsAfter,
        vote,
        phase,
        revealIndex,
        totalReveals,
        previousLeader,
        currentLeader,
        tiedIds: leadersAfter,
        isNullified: Boolean(vote?.wasNullified),
        isLastVote: revealIndex === totalReveals
      });

      if (currentLeader) previousLeader = currentLeader;

      return {
        id: `${phase}-vote-${index}`,
        background: `${ASSET_BASE}/voteread.png`,
        textPos: 'parchment',
        jeffLine,
        mood: revealIndex >= totalReveals - 1 ? 'peak-suspense' : 'suspense',
        canSkipAfterMs: vote.wasNullified ? TRIBAL_PACING.voteNullified
          : revealIndex === totalReveals ? TRIBAL_PACING.voteDecisive
            : leadersAfter.length > 1 || leadersBefore.length > 1 ? TRIBAL_PACING.voteTense
              : TRIBAL_PACING.voteNormal,
        reactionLines: this._shouldShowDebugSummary() ? this._getVoteReactionLines({ vote, countsAfter, phase, revealIndex, totalReveals }) : [],
        parchment: {
          show: true,
          voteName: this._resolveVoteName(vote),
          subText: vote?.wasNullified ? 'DOES NOT COUNT' : '',
          nullified: Boolean(vote?.wasNullified)
        },
        tallyLines: this._shouldShowDebugSummary() ? tallyLines : null,
        tallyTitle: phase === 'revote' ? 'REVOTE TALLY' : 'VOTE TALLY',
        button: { label: index === shownVotes.length - 1 ? 'CONTINUE' : 'NEXT VOTE' }
      };
    });
  }


  _renderBeat(beat, controls) {
    this._clearRevealTimer();
    const scene = createElement('div', { className: `tribal-scene mode-${beat.sceneMode || (beat.showStools ? 'wide' : 'ritual')}` });
    scene.style.setProperty('--tribal-art', beat?.background ? `url("${beat.background}")` : 'none');
    const artboard = createElement('div', { className: 'tribal-artboard' });
    const bg = createElement('img', { className: 'tribal-bg', src: beat.background || '', alt: '' });
    artboard.appendChild(bg);
    if (beat?.showStools) {
      artboard.appendChild(this._createSeats(beat.stoolsData || [], beat.stoolHighlightId));
    }
    scene.appendChild(artboard);
    if (beat?.jeff?.img) scene.appendChild(this._renderJeff(beat.jeff));

    const panel = createElement('div', { className: 'tribal-panel' });
    const isVoteRevealBeat = String(beat?.id || '').includes('-vote-');
    let delayedRevealElements = [];

    if (beat?.text) {
      const textClass = beat.textPos === 'top' ? 'tribal-text tribal-text-top' : 'tribal-text tribal-text-center';
      const wrapperClass = beat.textPos === 'top' ? 'tribal-top-safe' : 'tribal-center-wrap';
      const textWrap = createElement('div', { className: wrapperClass });
      textWrap.appendChild(createElement('div', { className: textClass }, beat.text));
      panel.appendChild(textWrap);
    }

    if (beat?.jeffLine) {
      const commentaryWrap = createElement('div', { className: 'tribal-commentary-wrap' });
      commentaryWrap.appendChild(createElement('div', { className: 'tribal-commentary' }, beat.jeffLine));
      panel.appendChild(commentaryWrap);
    }

    if (beat?.parchment?.show) {
      const parchmentWrap = createElement('div', { className: `tribal-parchment-wrap ${isVoteRevealBeat ? 'tribal-delayed-reveal' : ''}`.trim() });
      const parchment = createElement('div', { className: `tribal-parchment ${beat.parchment.nullified ? 'tribal-nullified' : ''}`.trim() });
      const voteName = createElement('div', { className: 'tribal-vote-name' }, String(beat.parchment.voteName || 'UNKNOWN').toUpperCase());
      parchment.appendChild(voteName);
      if (beat.parchment.subText) {
        parchment.appendChild(createElement('div', { className: 'tribal-vote-subtext' }, beat.parchment.subText));
      }
      parchmentWrap.appendChild(parchment);
      panel.appendChild(parchmentWrap);
      if (isVoteRevealBeat) delayedRevealElements.push(parchmentWrap);
    }

    if (beat?.customRender) {
      const custom = createElement('div', { className: 'tribal-custom-wrap' });
      beat.customRender(custom, controls);
      panel.appendChild(custom);
    }

    if (beat?.tallyLines) {
      const tally = createElement('div', { className: `tribal-tally-box ${isVoteRevealBeat ? 'tribal-delayed-reveal' : ''}`.trim() });
      tally.appendChild(createElement('div', { className: 'tribal-tally-title' }, beat.tallyTitle || 'TALLY'));
      (beat.tallyLines.length ? beat.tallyLines : ['No valid votes yet']).forEach(line => {
        tally.appendChild(createElement('div', {}, line));
      });
      panel.appendChild(tally);
      if (isVoteRevealBeat) delayedRevealElements.push(tally);
    }

    if (Array.isArray(beat?.reactionLines) && beat.reactionLines.length) {
      const reactions = createElement('div', { className: `tribal-reaction-stack ${isVoteRevealBeat ? 'tribal-delayed-reveal' : ''}`.trim() });
      beat.reactionLines.forEach(line => reactions.appendChild(createElement('div', { className: 'tribal-reaction' }, line)));
      panel.appendChild(reactions);
      if (isVoteRevealBeat) delayedRevealElements.push(reactions);
    }

    const actions = this._createActions(beat, controls);
    if (actions) panel.appendChild(actions);

    scene.appendChild(panel);
    this.root.appendChild(scene);

    if (isVoteRevealBeat && delayedRevealElements.length) {
      this.revealTimer = setTimeout(() => {
        if (scene.isConnected) delayedRevealElements.forEach(element => element.classList.add('is-visible'));
        this.revealTimer = null;
      }, tribalMotionDelay(TRIBAL_PACING.parchmentRaise));
    }
    return () => {
      const button = actions?.lastElementChild;
      if (button && beat?.button?.label) button.disabled = !controls.canAdvance()
        || (typeof beat.button.disabled === 'function' ? beat.button.disabled() : !!beat.button.disabled);
    };
  }

  _createActions(beat, controls) {
    const hasSecondary = Array.isArray(beat?.secondaryActions) && beat.secondaryActions.length > 0;
    const hasButton = Boolean(beat?.button?.label);
    if (!hasSecondary && !hasButton) return null;

    const actions = createElement('div', { className: 'tribal-actions' });

    if (hasSecondary) {
      const secondaryRow = createElement('div', { className: 'tribal-actions-row' });
      beat.secondaryActions.forEach((action) => {
        const button = createElement('button', {
          className: action.className || 'rect-button small',
          type: 'button',
          disabled: typeof action.disabled === 'function' ? action.disabled() : !!action.disabled,
          onclick: () => action.onClick?.(controls)
        }, action.label || 'Action');
        secondaryRow.appendChild(button);
      });
      actions.appendChild(secondaryRow);
    }

    if (hasButton) {
        const button = createElement('button', {
          className: 'rect-button',
          type: 'button',
          disabled: !controls.canAdvance() || (typeof beat.button.disabled === 'function' ? beat.button.disabled() : !!beat.button.disabled),
          onclick: () => {
            if (!controls.canAdvance()) return;
            if (beat.button.onClick) {
            beat.button.onClick(controls);
            return;
          }
          controls.next();
        }
      }, beat.button.label);
      actions.appendChild(button);
    }

    return actions;
  }

  _renderPortraitChoices(content, members, selectedId, onSelect, { disabled = false } = {}) {
    const grid = createElement('div', { className: 'tribal-portrait-grid' });
    members.forEach(member => {
      const selected = String(selectedId) === String(member.id);
      const button = createElement('button', { className: `tribal-portrait-choice ${selected ? 'is-selected' : ''}`,
        type: 'button', disabled, 'aria-pressed': selected ? 'true' : 'false',
        onclick: () => onSelect(member) });
      const url = this._getAvatarUrl(member);
      if (url) button.appendChild(createElement('img', { src: url, alt: '', loading: 'lazy' }));
      else button.appendChild(createElement('span', { className: 'tribal-choice-fallback' }, this.getTribalName(member).charAt(0)));
      button.appendChild(createElement('span', {}, this.getTribalName(member)));
      grid.appendChild(button);
    });
    content.appendChild(grid);
  }

  _renderVotingContent(content) {
    const player = this.gameManager.getPlayerSurvivor?.();
    const hasVote = this.gameManager.hasVote?.(player) === true;
    const wrap = createElement('div', { className: 'tribal-ballot-flow' });
    content.appendChild(wrap);
    if (!hasVote) {
      wrap.appendChild(createElement('div', { className: 'tribal-dialogue' },
        'You have lost your vote tonight. There is no ballot to cast, and Shot in the Dark is unavailable.'));
      return;
    }
    if (this.sitdUsed || this.playerVote) {
      wrap.appendChild(createElement('div', { className: 'tribal-dialogue' }, this.sitdUsed
        ? 'Your vote has been sacrificed. The result will be revealed after Jeff returns with the urn.'
        : 'Your vote has been cast. Fold the parchment and return to your seat.'));
      return;
    }
    wrap.appendChild(createElement('div', { className: 'tribal-dialogue' }, 'Choose a name. You can change it until you cast your vote.'));
    this._renderPortraitChoices(wrap, this._getVoteTargets(), this.selectedVote, member => {
      this.selectedVote = member.id;
      this.sitdConfirmPending = false;
      this.beatRunner.goTo(this.beatRunner.currentIndex, { force: true });
    });
    const preview = createElement('div', { className: 'tribal-ballot-preview' }, this.selectedVote
      ? this.getTribalName(this.selectedVote) : 'YOUR BALLOT');
    wrap.appendChild(preview);
    wrap.appendChild(createElement('button', { className: 'rect-button tribal-cast-vote', type: 'button',
      disabled: !this.selectedVote, onclick: () => {
        if (!this.tribalCouncilSystem.registerPlayerVote(player.id, this.selectedVote)) return;
        this.playerVote = this.selectedVote;
        const beat = this.beatRunner.getCurrentBeat?.();
        if (beat) beat.canSkipAfterMs = TRIBAL_PACING.ballotConfirmation;
        this.beatRunner.goTo(this.beatRunner.currentIndex, { force: true });
      } }, 'CAST VOTE'));
    const canPlaySitd = this.gameManager.canPlayShotInTheDark?.(player) === true
      && player?.shotInTheDarkAvailable !== false;
    if (canPlaySitd) {
      wrap.appendChild(createElement('button', { className: 'tribal-sitd-action', type: 'button', onclick: () => {
        this.sitdConfirmPending = !this.sitdConfirmPending;
        this.beatRunner.goTo(this.beatRunner.currentIndex, { force: true });
      } }, 'Take the Shot in the Dark'));
      if (this.sitdConfirmPending) {
        wrap.appendChild(createElement('div', { className: 'tribal-confirmation' }, [
          createElement('p', {}, 'Using Shot in the Dark sacrifices your vote. Reveal the result later with the tribe?'),
          createElement('button', { className: 'rect-button', type: 'button', onclick: () => {
            if (!this.tribalCouncilSystem.registerPlayerShotInTheDark(player.id)) return;
            this.sitdUsed = true;
            this.playerVote = null;
            this.selectedVote = null;
            const beat = this.beatRunner.getCurrentBeat?.();
            if (beat) beat.canSkipAfterMs = TRIBAL_PACING.ballotConfirmation;
            this.beatRunner.goTo(this.beatRunner.currentIndex, { force: true });
          } }, 'SACRIFICE VOTE')
        ]));
      }
    }
  }

  _renderIdolContent(content, controls) {
    const player = this.gameManager.getPlayerSurvivor?.();
    const hasIdol = this.tribalCouncilSystem?.playerHasIdol?.(player?.id);
    const wrap = createElement('div', { className: 'tribal-idol-flow' });
    content.appendChild(wrap);
    wrap.appendChild(createElement('div', { className: 'tribal-dialogue' },
      this.sessionJeffCommentary?.idolWindowLine || 'If anybody has a hidden immunity idol and wants to play it, now would be the time.'));
    if (!hasIdol) return;
    wrap.appendChild(createElement('div', { className: 'tribal-dialogue' }, 'Keep your idol, or choose someone to protect.'));
    const members = (this._getAttendingTribe()?.members || []).filter(member => !member.isOut
      && (String(member.id) === String(player?.id) || !this.gameManager.hasImmunity?.(member)));
    this._renderPortraitChoices(wrap, members, this.pendingIdolTarget, member => {
      this.pendingIdolTarget = member.id;
      this.beatRunner.goTo(this.beatRunner.currentIndex, { force: true });
    });
    if (this.pendingIdolTarget) {
      wrap.appendChild(createElement('div', { className: 'tribal-confirmation' }, [
        createElement('p', {}, `Play your idol for ${this.getTribalName(this.pendingIdolTarget)}? It will be consumed even if no votes are cast against them.`),
        createElement('button', { className: 'rect-button', type: 'button', onclick: () => {
          if (this.tribalCouncilSystem.registerIdolPlay(player.id, this.pendingIdolTarget)) this._transitionToReadVotes(controls);
        } }, 'CONFIRM IDOL PLAY')
      ]));
    }
  }

  _buildAdvantageBeats() {
    const beats = [];
    for (const play of this.tribalSummary?.idolPlays || []) {
      if (!play.consumed) continue;
      const holder = this.getTribalName(play.playedById);
      const target = this.getTribalName(play.playedOnId);
      beats.push({ id: `idol-play-${beats.length}`, background: `${ASSET_BASE}/nowisthetime.png`,
        text: `${holder} stands and plays a hidden immunity idol for ${target}. Jeff confirms it is valid. Any votes cast for ${target} will not count.`,
        textPos: 'top', canSkipAfterMs: TRIBAL_PACING.advantageReveal, button: { label: 'CONTINUE' } });
    }
    for (const result of this.tribalSummary?.shotResults || []) {
      if (!result.consumed) continue;
      beats.push({ id: `sitd-result-${beats.length}`, background: `${ASSET_BASE}/voteread.png`,
        text: `${this.getTribalName(result.playerId)} played Shot in the Dark. ${result.success ? 'SAFE — votes against them do not count.' : 'NOT SAFE — their vote was sacrificed.'}`,
        textPos: 'center', sceneMode: 'advantage', canSkipAfterMs: TRIBAL_PACING.advantageReveal,
        button: { label: 'CONTINUE' } });
    }
    return beats;
  }

  _handleVotingContinue() {
    const player = this.gameManager.getPlayerSurvivor?.();
    const hasVote = this.gameManager.hasVote?.(player) === true;
    if (hasVote && !this.playerVote && !this.sitdUsed) return;
    this.beatRunner.next();
  }

  _createSeats(members = [], highlightId = null) {
    const wrap = createElement('div', { className: `tribal-seats-wrap ${highlightId ? 'has-focus' : ''}` });
    for (const member of members) {
      const slot = getTribalSeat(members.length, this.seatAssignments.get(String(member.id)));
      if (!slot) continue;
      const focused = String(member.id) === String(highlightId);
      const seat = createElement('div', { className: `tribal-seat ${focused ? 'is-highlighted' : ''}`,
        'data-survivor-id': String(member.id), 'data-slot-id': slot.id,
        style: { left: `${slot.x / TRIBAL_ART_WIDTH * 100}%`, top: `${slot.y / TRIBAL_ART_HEIGHT * 100}%`,
          width: `${slot.width / TRIBAL_ART_WIDTH * 100}%`, height: `${slot.height / TRIBAL_ART_HEIGHT * 100}%`,
          zIndex: slot.depth } });
      const url = this._getAvatarUrl(member);
      if (url) seat.appendChild(createElement('img', { className: 'tribal-seat-portrait', src: url,
        alt: `${this.getDisplayName(member, { firstOnly: false })} seated at Tribal Council`, loading: 'eager' }));
      else seat.appendChild(createElement('span', { className: 'tribal-seat-fallback' }, this.getTribalName(member).charAt(0)));
      wrap.appendChild(seat);
    }
    return wrap;
  }

  _clearRevealTimer() {
    if (this.revealTimer !== null) clearTimeout(this.revealTimer);
    this.revealTimer = null;
  }

  _getLeadersFromCounts(counts = {}) {
    const ordered = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const topCount = ordered[0]?.[1] || 0;
    if (!topCount) return [];
    return ordered.filter(([, count]) => count === topCount).map(([id]) => id);
  }

  _resolveVoteName(vote) {
    if (!vote) return 'UNKNOWN';
    const target = this.allPlayers.find(player => String(player?.id) === String(vote.targetId));
    return this.getTribalName(target || vote?.targetId);
  }

  _buildAllPlayersList() {
    const tribeMembers = this._getAttendingTribe()?.members || [];
    const survivors = this.gameManager?.survivors || [];
    const byId = new Map();

    [...survivors, ...tribeMembers].forEach(player => {
      if (!player?.id) return;
      byId.set(String(player.id), player);
    });

    return [...byId.values()];
  }

  _renderJeff(jeff = {}) {
    const wrap = createElement('div', { className: 'tribal-jeff tribal-jeff-wrap' });
    const img = createElement('img', {
      className: 'tribal-jeff-img',
      src: jeff.img,
      alt: 'Jeff'
    });
    wrap.appendChild(img);
    return wrap;
  }

  _getAvatarUrl(member) {
    return member?.avatarUrl || member?.portraitUrl || member?.imageUrl || member?.image || null;
  }

  _getVoteTargets() {
    const tribe = this._getAttendingTribe();
    const player = this.gameManager.getPlayerSurvivor?.();
    return (tribe?.members || []).filter(member => (
      !member.isOut
      && String(member.id) !== String(player?.id)
      && !this.gameManager.hasImmunity?.(member)
    ));
  }

  _resolveTribalBackground(count) {
    const normalized = Number.isFinite(count) ? Math.max(2, Math.min(12, count)) : 12;
    return `${ASSET_BASE}/${normalized}.png`;
  }

  _getAttendingTribe() {
    const tribes = this.gameManager.getTribes?.() || this.gameManager.tribes || [];
    return tribes.find(candidate => String(candidate?.tribeId ?? candidate?.id) === String(this.attendingTribeId)) || null;
  }


  _resolvePendingRevote(controls) {
    if (!this.playerRevote) return;
    const resolved = this.tribalCouncilSystem.resolveRevoteWithPlayerChoice({
      tiedCandidateIds: this.tribalSummary?.tiedCandidateIds || [],
      playerChoiceTargetId: this.playerRevote
    });
    if (!resolved || (resolved.tribalState !== 'DEADLOCK_DISCUSSION' && !resolved.decisionResolved)) return;
    this.tribalSummary = resolved;
    this.result = this.tribalSummary;
    this.playerRevote = null;
    const beats = this._buildPostVoteBeats();
    const nextIndex = beats.findIndex(beat => String(beat?.id || '').startsWith('revote-vote-')
      || beat?.id === 'revote-deadlock-announcement' || beat?.id === 'snuff' || beat?.id === 'no-elimination');
    controls.setBeats(beats, { index: nextIndex >= 0 ? nextIndex : 0 });
  }

  _resolvePendingDeadlock(controls, { refuse = false } = {}) {
    const resolved = this.tribalCouncilSystem.resolveDeadlockConsensus({
      playerChoiceTargetId: refuse ? TRIBAL_CONSENSUS_REFUSAL : this.playerConsensusTarget
    });
    if (!resolved?.decisionResolved) return;
    this.tribalSummary = resolved;
    this.result = resolved;
    this.playerConsensusTarget = null;
    const beats = this._buildPostVoteBeats();
    const index = beats.findIndex(beat => beat.id === 'deadlock-outcome');
    controls.setBeats(beats, { index: index >= 0 ? index : 0 });
  }

  _renderDeadlockContent(content) {
    const summary = this.tribalSummary || {};
    const tied = (summary.deadlockTiedCandidateIds || []).map(id => this.getSurvivorById(id)).filter(Boolean);
    const decisionMakers = (summary.consensusDecisionMakerIds || []).map(id => this.getTribalName(id));
    const flow = createElement('div', { className: 'tribal-ballot-flow' });
    flow.appendChild(createElement('div', { className: 'tribal-dialogue' },
      `${tied.map(member => this.getTribalName(member)).join(' or ')}: the group must unanimously decide who leaves. If they cannot agree, the deadlock has a consequence.`));
    flow.appendChild(createElement('div', { className: 'tribal-subtext' },
      `DECISION-MAKERS: ${decisionMakers.join(', ') || 'NONE'}`));
    if (summary.tribalState === 'DEADLOCK_DISCUSSION' && summary.playerCanDecideConsensus) {
      flow.appendChild(createElement('div', { className: 'tribal-dialogue' }, 'Who are you willing to send home?'));
      this._renderPortraitChoices(flow, tied, this.playerConsensusTarget, member => {
        this.playerConsensusTarget = member.id;
        this.beatRunner.goTo(this.beatRunner.currentIndex, { force: true });
      });
      flow.appendChild(createElement('div', { className: 'tribal-ballot-preview' }, this.playerConsensusTarget
        ? this.getTribalName(this.playerConsensusTarget) : 'YOUR DECISION'));
    }
    content.appendChild(flow);
  }

  _renderRevoteVotingContent(content) {
    const tiedIds = this.tribalSummary?.revoteTargetIds || this.tribalSummary?.tiedCandidateIds || [];
    const playerId = this.gameManager.getPlayerSurvivor?.()?.id;
    const legalIds = this.tribalCouncilSystem?.getLegalRevoteTargetIds?.(
      playerId, this.tribalSummary?.playerRevoteTargetIds ?? tiedIds)
      ?? this.tribalSummary?.playerRevoteTargetIds ?? [];
    const tiedTargets = legalIds
      .map(id => this.getSurvivorById(id))
      .filter(member => member && !member.isOut && String(member.id) !== String(playerId));

    const votingText = this.playerRevote
      ? `YOUR REVOTE: ${this.getTribalName(this.playerRevote)}. You can change it before casting.`
      : this.tribalSummary?.zeroValidVotes ? 'CHOOSE AN UNPROTECTED SURVIVOR.' : 'CHOOSE ONE OF THE TIED SURVIVORS.';

    const flow = createElement('div', { className: 'tribal-ballot-flow' });
    content.appendChild(flow);
    flow.appendChild(createElement('div', { className: 'tribal-dialogue' }, votingText));

    this._renderPortraitChoices(flow, tiedTargets, this.playerRevote, member => {
      this.playerRevote = member.id;
      this.beatRunner.goTo(this.beatRunner.currentIndex, { force: true });
    });
    flow.appendChild(createElement('div', { className: 'tribal-ballot-preview' }, this.playerRevote
      ? this.getTribalName(this.playerRevote) : 'REVOTE BALLOT'));
  }

  _getVoteCommentary({ countsBefore, countsAfter, vote, phase, revealIndex, totalReveals, isNullified }) {
    if (isNullified) return 'This vote does not count.';
    if (revealIndex === 1) return phase === 'revote' ? 'First vote of the revote.' : 'First vote.';
    const before = this._getLeadersFromCounts(countsBefore);
    const after = this._getLeadersFromCounts(countsAfter);
    if (before.length === 1 && after.length > 1) return 'We are tied.';
    if (revealIndex === totalReveals && after.length === 1) return `${this.getTribalName(after[0])}.`;
    return '';
  }

  _getVoteReactionLines({ vote, countsAfter, revealIndex, totalReveals }) {
    if (vote?.wasNullified) {
      return ['The tribe exhales as the parchment is set aside.'];
    }

    const targetName = this.getTribalName(vote?.targetId);
    const voteCount = countsAfter[String(vote?.targetId)] || 0;
    if (revealIndex === totalReveals) return [`Every eye moves to ${targetName}.`];
    if (voteCount >= 2) return [`${targetName} absorbs another vote without looking away.`];
    return ['A few heads turn, but nobody shows their hand.'];
  }

  _renderRevoteContext(content) {
    const tiedNames = (this.tribalSummary?.revoteTargetIds || this.tribalSummary?.tiedCandidateIds || []).map(id => this.getTribalName(id)).join(' / ');
    const excludedVoters = this._getRevoteExcludedVoters();
    content.appendChild(createElement('div', { className: 'tribal-subtext' }, `REVOTE TARGETS: ${tiedNames}`));
    if (excludedVoters.length > 0) {
      content.appendChild(createElement('div', { className: 'tribal-warning' }, `NOT VOTING: ${excludedVoters.join(', ')}`));
    }
  }

  _renderRockList(content) {
    const eligible = this.tribalSummary?.rockDrawEligible || [];
    const list = createElement('div', { className: 'tribal-rocks-list' });
    eligible.forEach(entry => {
      list.appendChild(createElement('span', {}, this.getTribalName(entry.id || entry)));
    });
    content.appendChild(list);
  }

  _getTiedPlayerNames() {
    const tiedIds = this.tribalSummary?.tiedCandidateIds || [];
    return tiedIds.length ? tiedIds.map(id => this.getTribalName(id)) : ['UNKNOWN'];
  }

  _resolveName(id) {
    return this.getDisplayName(id, { firstOnly: false });
  }

  _shouldShowDebugSummary() {
    return this.gameManager?.debug?.showTribalSummaryScreen === true
      || this.gameManager?.gameSettings?.debugTribal === true;
  }

  renderDebugSummary() {
    const summary = this.tribalSummary || {};
    const initialVotes = summary.initialVotes || [];
    const revoteVotes = summary.revoteVotes || [];
    const decidingLabel = summary.rockDrawOccurred ? 'Elimination by rocks' : JSON.stringify(summary.decidingTally || {});

    const debugBeat = {
      id: 'debug-summary',
      background: `${ASSET_BASE}/voteread.png`,
      text: 'Tribal Summary (Debug)',
      textPos: 'top',
      button: { label: 'CONTINUE', onClick: () => this.finish() },
      customRender: (panel) => {
        const block = createElement('div', { className: 'tribal-debug-block' });
        const formatVotes = votes => votes.map(vote => `${this._resolveName(vote.voterId)} → ${this._resolveName(vote.targetId)}${vote.nullified ? ' (nullified)' : ''}`).join(' | ') || 'None';
        [
          `Initial votes: ${formatVotes(initialVotes)}`,
          `Revote votes: ${formatVotes(revoteVotes)}`,
          `Idol plays: ${(summary.idolPlays || []).map(play => `${this._resolveName(play.playerId || play.playedById)} on ${this._resolveName(play.targetId || play.playedOnId)}${play.successful ? ' (success)' : ''}`).join(' | ') || 'None'}`,
          `SITD results: ${(summary.shotResults || []).map(result => `${this._resolveName(result.playerId)}: ${result.success ? 'SAFE' : 'NOT SAFE'}`).join(' | ') || 'None'}`,
          `Tie/Revote/Rocks: ${Boolean(summary.initialTie)} / ${Boolean(summary.revoteOccurred)} / ${Boolean(summary.rockDrawOccurred)}`,
          `Eliminated: ${this._resolveName(summary.eliminatedId)} (${summary.eliminatedId || 'none'})`,
          `Deciding tally: ${decidingLabel}`
        ].forEach(line => block.appendChild(createElement('div', {}, line)));
        panel.appendChild(block);
      }
    };

    this.beatRunner?.setBeats([debugBeat], { index: 0 });
  }

  _getRevoteExcludedVoters() {
    const excluded = new Set();
    const members = this.tribalSummary?.membersAtTribal || [];
    const revoteEligibleIds = new Set((this.tribalSummary?.revoteEligibleVoterIds || []).map(id => String(id)));
    members.forEach(member => {
      const key = String(member.id);
      const name = this.getTribalName(member);
      if (!revoteEligibleIds.has(key)) excluded.add(name);
    });
    return [...excluded];
  }

  finish() {
    if (this.isCompleting) return;
    this.isCompleting = true;
    if (this.tribalSummary) {
      eventManager.publish(GameEvents.TRIBAL_COUNCIL_COMPLETE, this.tribalSummary);
    }
    this.tribalCouncilSystem?.endSession?.();
    if (typeof this.onComplete === 'function') {
      this.onComplete(this.result);
    }
  }
}
