import { createElement, clearChildren } from '../utils/DOMUtils.js';
import eventManager, { GameEvents } from '../core/EventManager.js';
import TribalBeatRunner from './TribalBeatRunner.js';
import TribalQuestionEngine from '../systems/TribalQuestionEngine.js';

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
    this.sitdUsed = false;
    this.playerRevote = null;
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

    this.isCompleting = false;
    this.result = null;
    this.tribalSummary = null;
    this.playerVote = null;
    this.sitdUsed = false;
    this.playerRevote = null;
    this.questionResponses = new Map();
    this.questionResponseLog = [];

    const playerTribe = this.gameManager.getPlayerTribe?.();
    this.attendingTribeId = data?.attendingTribeId ?? data?.tribeId ?? playerTribe?.tribeId ?? playerTribe?.id ?? null;
    this.allPlayers = this._buildAllPlayersList();
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
        pauseMs: 500,
        canSkipAfterMs: 260,
        button: { label: 'CONTINUE' }
      },
      {
        id: 'seating',
        background: this._resolveTribalBackground(alive.length),
        showStools: true,
        stoolsData: alive,
        customRender: (content) => this._renderMoodScan(content, alive),
        mood: 'tense',
        button: { label: 'CONTINUE' }
      },
      {
        id: 'jeff-opening',
        background: this._resolveTribalBackground(alive.length),
        showStools: true,
        stoolsData: alive,
        text: this.questionEngine.getOpeningLine(this.tribalContext),
        textPos: 'top',
        jeff: { img: `${ASSET_BASE}/jeff.png` },
        mood: 'watchful',
        button: { label: 'LET\'S TALK' }
      },
      ...this._buildQuestionBeats(alive),
      ...(this.liveTribalMoment ? [this._buildLiveTribalBeat(alive)] : []),
      {
        id: 'vote-intro',
        background: `${ASSET_BASE}/votewalk.jpeg`,
        text: 'The fire has heard enough. It is time to vote.',
        textPos: 'center',
        mood: 'decisive',
        button: { label: 'Vote' }
      },
      {
        id: 'voting-booth',
        background: `${ASSET_BASE}/votingbooth.png`,
        textPos: 'top',
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
        id: 'idol-window',
        background: `${ASSET_BASE}/nowisthetime.png`,
        textPos: 'top',
        customRender: (content, controls) => this._renderIdolContent(content, controls),
        button: { label: 'CONTINUE', onClick: (controls) => this._transitionToReadVotes(controls) }
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
      jeff: { img: `${ASSET_BASE}/jeff.png` },
      mood: question.mood?.id || 'tense',
      cameraTargetIds: question.focusSurvivorId ? [question.focusSurvivorId] : [],
      reactionTargetIds: (question.reactions || []).map(reaction => reaction.survivorId),
      customRender: (content) => this._renderQuestionContent(content, question),
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
      mood: 'chaotic',
      cameraTargetIds: moment?.focusSurvivorId ? [moment.focusSurvivorId] : [],
      customRender: (content) => this._renderQuestionContent(content, moment, { live: true }),
      button: {
        label: 'SETTLE BACK IN',
        disabled: () => !this.questionResponses.has(moment?.id)
      }
    };
  }

  _renderMoodScan(content, members = []) {
    const summary = createElement('div', { className: 'tribal-mood-summary' });
    summary.appendChild(createElement('div', { className: 'tribal-mood-summary-title' }, 'TRIBE MOOD'));
    const list = createElement('div', { className: 'tribal-mood-list' });
    members.forEach(member => {
      const mood = this.questionEngine.getMood(member, { context: this.tribalContext });
      list.appendChild(createElement('span', { className: `tribal-mood-chip is-${mood.id}` }, `${this.getTribalName(member)} · ${mood.label}`));
    });
    summary.appendChild(list);
    content.appendChild(summary);
  }

  _renderQuestionContent(content, question, { live = false } = {}) {
    if (!question) return;
    const focus = this.getSurvivorById(question.focusSurvivorId);
    const card = createElement('div', { className: `tribal-question ${live ? 'tribal-question-live' : ''}`.trim() });

    if (live) {
      card.appendChild(createElement('div', { className: 'tribal-question-kicker' }, 'LIVE TRIBAL'));
    } else {
      card.appendChild(createElement('div', { className: 'tribal-question-kicker' }, focus ? `HOST TO ${this.getTribalName(focus)}` : 'TRIBAL COUNCIL'));
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

    const reactions = question.reactions || [];
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
      {
        id: 'read-votes-intro',
        background: `${ASSET_BASE}/illread.png`,
        text: 'Once the votes are read, the decision is final. I will read the votes.',
        textPos: 'top',
        jeff: this.tribalSummary?.jeffCommentary?.votesRevealingIntroLine ? { img: `${ASSET_BASE}/jeff.png` } : null,
        mood: 'suspense',
        button: { label: 'READ VOTES' }
      },
      ...this._buildVoteRevealBeats((this.tribalSummary?.voteOrder || []).filter(v => v.phase !== 'revote'), 'initial')
    ];

    if (this.tribalSummary?.initialTie) {
      const tieBeats = [
        {
          id: 'tie-announcement',
          background: `${ASSET_BASE}/voteread.png`,
          text: this.tribalSummary?.jeffCommentary?.tieLine || 'WE ARE TIED. THAT MEANS WE VOTE AGAIN, AND ONLY FOR THE TIED PLAYERS.',
          textPos: 'top',
          mood: 'shock',
          button: { label: 'CONTINUE' }
        },
        {
          id: 'revote-intro',
          background: `${ASSET_BASE}/votingbooth.png`,
          text: this.tribalSummary?.jeffCommentary?.revoteIntroLine || 'THIS REVOTE IS YOUR CHANCE TO SHOW WHERE YOU TRULY STAND.',
          textPos: 'top',
          button: { label: this.tribalSummary?.playerCanRevote ? 'VOTE NOW' : 'CONTINUE' },
          customRender: (content) => this._renderRevoteContext(content)
        }
      ];

      if (this.tribalSummary?.tribalState === 'REVOTE_PENDING' && this.tribalSummary?.playerCanRevote && this.tribalSummary?.revotePendingPlayerChoice) {
        tieBeats.push({
          id: 'revote-voting-booth',
          background: `${ASSET_BASE}/votingbooth.png`,
          textPos: 'top',
          customRender: (content) => this._renderRevoteVotingContent(content),
          button: {
            label: 'CAST REVOTE',
            disabled: () => !this.playerRevote,
            onClick: (controls) => this._resolvePendingRevote(controls)
          }
        });
      }

      tieBeats.push(...this._buildVoteRevealBeats((this.tribalSummary?.voteOrder || []).filter(v => v.phase === 'revote'), 'revote'));
      beats.push(...tieBeats);

      if (this.tribalSummary?.rockDrawOccurred) {
        const eliminatedName = this.getTribalName(this.tribalSummary?.rockDrawEliminatedId);
        beats.push(
          {
            id: 'deadlock-discussion',
            background: `${ASSET_BASE}/voteread.png`,
            text: 'The revote did not break the tie. This is the final chance to change the outcome before rocks decide it.',
            textPos: 'top',
            mood: 'deadlock',
            customRender: (content) => this._renderDeadlockDiscussion(content),
            button: { label: 'NO ONE BUDGES' }
          },
          {
            id: 'rocks-intro',
            background: `${ASSET_BASE}/voteread.png`,
            text: this.tribalSummary?.jeffCommentary?.rocksIntroLine || 'WE ARE DEADLOCKED. WE ARE GOING TO ROCKS.',
            textPos: 'top',
            button: { label: 'DRAW ROCK' },
            customRender: (content) => this._renderRockList(content)
          },
          {
            id: 'rocks-result',
            background: `${ASSET_BASE}/snuff.jpeg`,
            text: `${eliminatedName} DREW THE BAD ROCK.`,
            textPos: 'center',
            button: { label: 'CONTINUE' }
          }
        );
      }
    }

    const eliminatedName = this.getTribalName(this.result?.eliminatedId);
    beats.push({
      id: 'snuff',
      background: `${ASSET_BASE}/snuff.jpeg`,
      text: this.result?.jeffCommentary?.snuffLine || `${eliminatedName}, THE TRIBE HAS SPOKEN.`,
      textPos: 'center',
      mood: 'final',
      button: { label: 'CONTINUE' }
    });

    beats.push({
      id: 'tribal-aftermath',
      background: `${ASSET_BASE}/snuff.jpeg`,
      text: 'THE FIRE GOES OUT. THE FALLOUT DOES NOT.',
      textPos: 'top',
      mood: 'aftermath',
      customRender: (content) => this._renderAftermath(content),
      button: {
        label: this._shouldShowDebugSummary() ? 'REVIEW SUMMARY' : 'RETURN TO CAMP',
        onClick: () => (this._shouldShowDebugSummary() ? this.renderDebugSummary() : this.finish())
      }
    });

    return beats;
  }

  _buildVoteRevealBeats(votes = [], phase = 'initial') {
    if (!votes.length) return [];

    const counts = {};
    let previousLeader = null;

    return votes.map((vote, index) => {
      const countsBefore = { ...counts };
      if (!vote.wasNullified) {
        const key = String(vote.targetId);
        counts[key] = (counts[key] || 0) + 1;
      }
      const countsAfter = { ...counts };
      const leadersBefore = this._getLeadersFromCounts(countsBefore);
      const leadersAfter = this._getLeadersFromCounts(countsAfter);
      const currentLeader = leadersAfter.length === 1 ? leadersAfter[0] : null;
      const totalReveals = votes.length;
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
        pauseMs: revealIndex >= totalReveals - 1 ? 1050 : 650,
        canSkipAfterMs: revealIndex >= totalReveals - 1 ? 800 : 420,
        reactionLines: this._getVoteReactionLines({ vote, countsAfter, phase, revealIndex, totalReveals }),
        parchment: {
          show: true,
          voteName: this._resolveVoteName(vote),
          subText: vote?.wasNullified ? 'DOES NOT COUNT' : '',
          nullified: Boolean(vote?.wasNullified)
        },
        tallyLines,
        tallyTitle: phase === 'revote' ? 'REVOTE TALLY' : 'VOTE TALLY',
        button: { label: index === votes.length - 1 ? 'CONTINUE' : 'NEXT VOTE' }
      };
    });
  }


  _renderBeat(beat, controls) {
    const scene = createElement('div', { className: 'tribal-scene' });
    const bg = createElement('div', { className: 'tribal-bg' });
    bg.style.backgroundImage = beat?.background ? `url('${beat.background}')` : 'none';
    scene.appendChild(bg);

    if (beat?.showStools) {
      scene.appendChild(this._createSeats(beat.stoolsData || [], beat.stoolHighlightId));
    }

    if (beat?.jeff && beat.jeff.img) {
      scene.appendChild(this._renderJeff(beat.jeff));
    }

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
      setTimeout(() => {
        delayedRevealElements.forEach(element => element.classList.add('is-visible'));
      }, 400);
    }
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

  _renderVotingContent(content) {
    const player = this.gameManager.getPlayerSurvivor?.();
    const hasVote = this.gameManager.hasVote?.(player) === true;

    if (!hasVote) {
      content.appendChild(createElement('div', { className: 'tribal-top-safe' }, [
        createElement('div', { className: 'tribal-text tribal-text-top' }, 'YOU HAVE LOST YOUR VOTE. YOU CANNOT VOTE OR PLAY SHOT IN THE DARK.')
      ]));
      return;
    }

    const votingText = this.sitdUsed
      ? 'SHOT IN THE DARK USED. YOU WILL NOT CAST A VOTE.'
      : (this.playerVote
        ? `CURRENT VOTE: ${this.getTribalName(this.playerVote)}`
        : 'CAST YOUR VOTE OR PLAY SHOT IN THE DARK.');

    content.appendChild(createElement('div', { className: 'tribal-top-safe' }, [
      createElement('div', { className: 'tribal-text tribal-text-top' }, votingText)
    ]));

    const actions = createElement('div', { className: 'tribal-grid' });
    const targets = this._getVoteTargets();

    targets.forEach(member => {
      const selected = String(this.playerVote) === String(member.id);
      actions.appendChild(createElement('button', {
        className: 'rect-button small',
        type: 'button',
        style: selected ? { filter: 'brightness(1.2)', outline: '2px solid #FFD700' } : {},
        disabled: this.sitdUsed,
        onclick: () => {
          const registered = this.tribalCouncilSystem.registerPlayerVote(player.id, member.id);
          if (!registered) return;
          this.playerVote = member.id;
          this.sitdUsed = false;
          this.beatRunner.goTo(this.beatRunner.currentIndex);
        }
      }, this.getTribalName(member)));
    });

    content.appendChild(actions);

    const canPlaySitd = this.gameManager.canPlayShotInTheDark?.(player) === true
      && player?.shotInTheDarkAvailable !== false
      && hasVote;

    if (canPlaySitd) {
      content.appendChild(createElement('button', {
        className: 'rect-button small',
        type: 'button',
        disabled: this.sitdUsed,
        onclick: () => {
          const registered = this.tribalCouncilSystem.registerPlayerShotInTheDark(player.id);
          if (!registered) return;
          this.sitdUsed = true;
          this.playerVote = null;
          this.beatRunner.goTo(this.beatRunner.currentIndex);
        }
      }, this.sitdUsed ? 'SITD SELECTED' : 'BAG (SHOT IN THE DARK)'));
    }
  }

  _renderIdolContent(content, controls) {
    const player = this.gameManager.getPlayerSurvivor?.();
    const hasIdol = this.tribalCouncilSystem?.playerHasIdol?.(player?.id);

    content.appendChild(createElement('div', { className: 'tribal-top-safe' }, [
      createElement('div', { className: 'tribal-text tribal-text-top' }, hasIdol
        ? (this.sessionJeffCommentary?.idolWindowLine || 'IF ANYBODY HAS A HIDDEN IMMUNITY IDOL AND YOU WANT TO PLAY IT, NOW WOULD BE THE TIME.')
        : 'NO IDOL TO PLAY.')
    ]));

    if (!hasIdol) return;

    const tribe = this._getAttendingTribe();
    const members = (tribe?.members || []).filter(member => !member.isOut && !this.gameManager.hasImmunity?.(member));
    const list = createElement('div', { className: 'tribal-actions-row' });

    list.appendChild(createElement('button', {
      className: 'rect-button small',
      type: 'button',
      onclick: () => {
        this.tribalCouncilSystem.registerIdolPlay(player.id, player.id);
        this._transitionToReadVotes(controls);
      }
    }, 'PLAY ON SELF'));

    members
      .filter(member => String(member.id) !== String(player?.id))
      .forEach(member => {
        list.appendChild(createElement('button', {
          className: 'rect-button small',
          type: 'button',
          onclick: () => {
            this.tribalCouncilSystem.registerIdolPlay(player.id, member.id);
            this._transitionToReadVotes(controls);
          }
        }, `PLAY ON ${this.getTribalName(member)}`));
      });

    list.appendChild(createElement('button', {
      className: 'rect-button small',
      type: 'button',
      onclick: () => this._transitionToReadVotes(controls)
    }, 'NO IDOL'));

    content.appendChild(list);
  }

  _handleVotingContinue() {
    const player = this.gameManager.getPlayerSurvivor?.();
    const hasVote = this.gameManager.hasVote?.(player) === true;
    if (hasVote && !this.playerVote && !this.sitdUsed) return;
    this.beatRunner.next();
  }

  _createSeats(members = [], highlightId = null) {
    const wrap = createElement('div', { className: 'tribal-seats-wrap' });
    const positions = this._getTribalSeatPositions(members.length);

    members.forEach((member, index) => {
      const position = positions[index] || { leftPct: 50, topPct: 40 };
      const avatarUrl = this._getAvatarUrl(member);
      const mood = this.questionEngine.getMood(member, { context: this.tribalContext });
      const seat = createElement('div', {
        className: `tribal-seat is-${mood.id} ${String(member?.id) === String(highlightId) ? 'is-highlighted' : ''}`.trim(),
        title: `${this.getTribalName(member)} · ${mood.label}`,
        style: {
          left: `${position.leftPct}%`,
          top: `${position.topPct}%`
        }
      });

      if (avatarUrl) {
        seat.style.backgroundImage = `url('${avatarUrl}')`;
      } else {
        seat.appendChild(createElement('span', { className: 'tribal-seat-fallback' }, this.getDisplayName(member).charAt(0)));
      }

      seat.appendChild(createElement('span', { className: `tribal-mood-chip is-${mood.id}` }, mood.label));

      wrap.appendChild(seat);
    });

    return wrap;
  }

  _getTribalSeatPositions(count) {
    const presets = {
      2: [
        { leftPct: 38, topPct: 56 },
        { leftPct: 62, topPct: 56 }
      ],
      3: [
        { leftPct: 30, topPct: 58 },
        { leftPct: 50, topPct: 54 },
        { leftPct: 70, topPct: 58 }
      ],
      4: [
        { leftPct: 24, topPct: 59 },
        { leftPct: 41, topPct: 55 },
        { leftPct: 59, topPct: 55 },
        { leftPct: 76, topPct: 59 }
      ],
      5: [
        { leftPct: 18, topPct: 60 },
        { leftPct: 34, topPct: 56 },
        { leftPct: 50, topPct: 53 },
        { leftPct: 66, topPct: 56 },
        { leftPct: 82, topPct: 60 }
      ],
      6: [
        { leftPct: 14, topPct: 60 },
        { leftPct: 28, topPct: 57 },
        { leftPct: 42, topPct: 54 },
        { leftPct: 58, topPct: 54 },
        { leftPct: 72, topPct: 57 },
        { leftPct: 86, topPct: 60 }
      ],
      7: [
        { leftPct: 24, topPct: 47 },
        { leftPct: 50, topPct: 44 },
        { leftPct: 76, topPct: 47 },
        { leftPct: 14, topPct: 62 },
        { leftPct: 36, topPct: 59 },
        { leftPct: 64, topPct: 59 },
        { leftPct: 86, topPct: 62 }
      ],
      8: [
        { leftPct: 18, topPct: 47 },
        { leftPct: 39, topPct: 44 },
        { leftPct: 61, topPct: 44 },
        { leftPct: 82, topPct: 47 },
        { leftPct: 12, topPct: 62 },
        { leftPct: 33, topPct: 59 },
        { leftPct: 67, topPct: 59 },
        { leftPct: 88, topPct: 62 }
      ],
      9: [
        { leftPct: 12, topPct: 47 },
        { leftPct: 31, topPct: 44 },
        { leftPct: 50, topPct: 42 },
        { leftPct: 69, topPct: 44 },
        { leftPct: 88, topPct: 47 },
        { leftPct: 10, topPct: 62 },
        { leftPct: 30, topPct: 59 },
        { leftPct: 70, topPct: 59 },
        { leftPct: 90, topPct: 62 }
      ],
      10: [
        { leftPct: 11, topPct: 47 },
        { leftPct: 28, topPct: 44 },
        { leftPct: 44, topPct: 42 },
        { leftPct: 56, topPct: 42 },
        { leftPct: 72, topPct: 44 },
        { leftPct: 89, topPct: 47 },
        { leftPct: 10, topPct: 62 },
        { leftPct: 28, topPct: 59 },
        { leftPct: 72, topPct: 59 },
        { leftPct: 90, topPct: 62 }
      ],
      11: [
        { leftPct: 9, topPct: 47 },
        { leftPct: 24, topPct: 44 },
        { leftPct: 38, topPct: 42 },
        { leftPct: 50, topPct: 41 },
        { leftPct: 62, topPct: 42 },
        { leftPct: 76, topPct: 44 },
        { leftPct: 91, topPct: 47 },
        { leftPct: 10, topPct: 62 },
        { leftPct: 30, topPct: 59 },
        { leftPct: 70, topPct: 59 },
        { leftPct: 90, topPct: 62 }
      ],
      12: [
        { leftPct: 8, topPct: 47 },
        { leftPct: 22, topPct: 44 },
        { leftPct: 36, topPct: 42 },
        { leftPct: 50, topPct: 41 },
        { leftPct: 64, topPct: 42 },
        { leftPct: 78, topPct: 44 },
        { leftPct: 92, topPct: 47 },
        { leftPct: 8, topPct: 62 },
        { leftPct: 24, topPct: 59 },
        { leftPct: 42, topPct: 57 },
        { leftPct: 58, topPct: 57 },
        { leftPct: 76, topPct: 59 }
      ]
    };

    const normalized = Math.max(2, Math.min(12, Number(count) || 2));
    return presets[normalized] || presets[12];
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
    this.tribalSummary = this.tribalCouncilSystem.resolveRevoteWithPlayerChoice({
      tiedCandidateIds: this.tribalSummary?.tiedCandidateIds || [],
      playerChoiceTargetId: this.playerRevote
    });
    this.result = this.tribalSummary;
    this.playerRevote = null;
    const beats = this._buildPostVoteBeats();
    const nextIndex = beats.findIndex(beat => String(beat?.id || '').startsWith('revote-vote-') || beat?.id === 'rocks-intro' || beat?.id === 'snuff');
    controls.setBeats(beats, { index: nextIndex >= 0 ? nextIndex : 0 });
  }

  _renderRevoteVotingContent(content) {
    const tiedIds = this.tribalSummary?.tiedCandidateIds || [];
    const tiedTargets = tiedIds
      .map(id => this.getSurvivorById(id))
      .filter(Boolean);

    const votingText = this.playerRevote
      ? `REVOTE LOCKED: ${this.getTribalName(this.playerRevote)}`
      : 'CAST YOUR REVOTE FOR ONE OF THE TIED PLAYERS.';

    content.appendChild(createElement('div', { className: 'tribal-top-safe' }, [
      createElement('div', { className: 'tribal-text tribal-text-top' }, votingText)
    ]));

    const actions = createElement('div', { className: 'tribal-grid' });
    tiedTargets.forEach(member => {
      const selected = String(this.playerRevote) === String(member.id);
      actions.appendChild(createElement('button', {
        className: 'rect-button small',
        type: 'button',
        style: selected ? { filter: 'brightness(1.2)', outline: '2px solid #FFD700' } : {},
        onclick: () => {
          this.playerRevote = member.id;
          this.beatRunner.goTo(this.beatRunner.currentIndex);
        }
      }, this.getTribalName(member)));
    });

    content.appendChild(actions);
  }

  _getVoteCommentary({ countsBefore, countsAfter, vote, phase, revealIndex, totalReveals, previousLeader, currentLeader, tiedIds, isNullified, isLastVote }) {
    const name = this.getTribalName(vote?.targetId || vote?.displayName || 'UNKNOWN');
    const phaseLabel = phase === 'revote' ? ' on the revote' : '';
    const leadersBefore = this._getLeadersFromCounts(countsBefore);
    const leadersAfter = Array.isArray(tiedIds) ? tiedIds : this._getLeadersFromCounts(countsAfter);
    const wasTieBefore = leadersBefore.length > 1;
    const isTieNow = leadersAfter.length > 1;
    const hadVotesBefore = leadersBefore.length > 0;
    const hasVotesNow = leadersAfter.length > 0;
    const currentCount = countsAfter[String(vote?.targetId)] || 0;
    const previousCount = countsBefore[String(vote?.targetId)] || 0;
    const beforeLeaderId = leadersBefore.length === 1 ? leadersBefore[0] : null;
    const beforeLeaderCount = beforeLeaderId ? countsBefore[String(beforeLeaderId)] || 0 : 0;
    const afterLeaderCount = leadersAfter[0] ? countsAfter[String(leadersAfter[0])] || 0 : 0;

    if (isNullified) return revealIndex % 2 === 0 ? 'This vote does not count.' : `This vote is for ${name}. It does not count.`;
    if (!hadVotesBefore && hasVotesNow) return `First vote${phaseLabel}... ${name}.`;

    const createdTie = !wasTieBefore && isTieNow;
    if (createdTie) return 'We are tied.';

    const tieBroken = wasTieBefore && !isTieNow && leadersAfter.length === 1;
    if (tieBroken) return `${this.getTribalName(leadersAfter[0])} takes the lead.`;

    if (previousLeader && currentLeader && previousLeader !== currentLeader) {
      return `${this.getTribalName(currentLeader)} takes the lead.`;
    }

    if (currentCount >= 2 && currentCount > previousCount && currentLeader && String(currentLeader) === String(vote?.targetId)) {
      return revealIndex % 2 === 0
        ? `${name} now has ${currentCount} votes.`
        : `That's ${currentCount} votes ${name}.`;
    }

    const closesGap = beforeLeaderId
      && String(vote?.targetId) !== String(beforeLeaderId)
      && currentCount > previousCount
      && (beforeLeaderCount - previousCount) > (afterLeaderCount - currentCount);
    if (closesGap) {
      return `${name} closes the gap.`;
    }

    if (isLastVote) return 'This vote will decide it.';

    const remaining = totalReveals - revealIndex;
    if (remaining <= 1) return 'This next vote could decide it.';
    return `Vote ${revealIndex}${phaseLabel}... ${name}.`;
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

  _renderDeadlockDiscussion(content) {
    const discussion = createElement('div', { className: 'tribal-aftermath' });
    discussion.appendChild(createElement('div', { className: 'tribal-aftermath-title' }, 'THE DECISION DISCUSSION'));
    discussion.appendChild(createElement('div', { className: 'tribal-aftermath-line' }, 'The tied players cannot vote. Everyone else must decide whether they are willing to change course.'));
    discussion.appendChild(createElement('div', { className: 'tribal-aftermath-line tribal-warning' }, 'No one moves. The deadlock stands.'));
    content.appendChild(discussion);
  }

  _renderAftermath(content) {
    const summary = this.tribalSummary || {};
    const finalCounts = summary.rockDrawOccurred
      ? summary.initialCounts || {}
      : summary.decidingCounts || summary.revoteCounts || summary.initialCounts || {};
    const voteLines = Object.entries(finalCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([id, count]) => `${this.getTribalName(id)}: ${count}`);
    const eliminated = this.getTribalName(summary.eliminatedId || summary.rockDrawEliminatedId);
    const details = [];

    if ((summary.idolPlays || []).length) {
      details.push(`${summary.idolPlays.length === 1 ? 'An idol was played' : `${summary.idolPlays.length} idols were played`} — and every played idol is gone.`);
    }
    if ((summary.shotResults || []).length) {
      const safe = summary.shotResults.some(result => result.success);
      details.push(`Shot in the Dark: ${safe ? 'SAFE' : 'NOT SAFE'}. The vote was sacrificed.`);
    }
    if (summary.revoteOccurred) details.push(summary.rockDrawOccurred ? 'The revote failed to break the tie. Rocks decided the night.' : 'The revote broke the tie.');
    const betrayal = this._getBiggestBetrayal(summary);
    if (betrayal) details.push(betrayal);
    details.push('Back at camp, nobody will be quite as comfortable as they were before this fire.');

    const wrap = createElement('div', { className: 'tribal-aftermath' });
    wrap.appendChild(createElement('div', { className: 'tribal-aftermath-title' }, `${eliminated} IS OUT`));
    if (voteLines.length) {
      wrap.appendChild(createElement('div', { className: 'tribal-aftermath-vote' }, `FINAL VOTE · ${voteLines.join('  |  ')}`));
    }
    details.forEach(line => wrap.appendChild(createElement('div', { className: 'tribal-aftermath-line' }, line)));
    content.appendChild(wrap);
  }

  _getBiggestBetrayal(summary = {}) {
    const allianceSystem = this.gameManager?.systems?.allianceSystem;
    const alliances = allianceSystem?.getAlliances?.() || [];
    const decidingVotes = summary.revoteOccurred && !summary.rockDrawOccurred
      ? summary.revoteVotes || []
      : summary.initialVotes || summary.votes || [];
    const betrayal = decidingVotes.find(vote => alliances.some(alliance => {
      const ids = alliance.memberIds || [];
      return ids.some(id => String(id) === String(vote.voterId)) && ids.some(id => String(id) === String(vote.targetId));
    }));
    if (!betrayal) return null;
    return `${this.getTribalName(betrayal.voterId)} voted against an ally in the open — an alliance has fractured.`;
  }


  _renderRevoteContext(content) {
    const tiedNames = this._getTiedPlayerNames().join(' / ');
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
    const tiedIds = new Set((this.tribalSummary?.tiedCandidateIds || []).map(id => String(id)));
    const revoteEligibleIds = new Set((this.tribalSummary?.revoteEligibleVoterIds || []).map(id => String(id)));
    members.forEach(member => {
      const key = String(member.id);
      const name = this.getTribalName(member);
      if (tiedIds.has(key) || !revoteEligibleIds.has(key)) excluded.add(name);
    });
    return [...excluded];
  }

  finish() {
    if (this.isCompleting) return;
    this.isCompleting = true;
    if (this.tribalSummary) {
      eventManager.publish(GameEvents.TRIBAL_COUNCIL_COMPLETE, this.tribalSummary);
    }
    if (typeof this.onComplete === 'function') {
      this.onComplete(this.result);
    }
  }
}
