import { createElement, clearChildren } from '../utils/DOMUtils.js';
import eventManager, { GameEvents } from '../core/EventManager.js';
import TribalBeatRunner from './TribalBeatRunner.js';

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
    this.attendingTribeId = null;
    this.isCompleting = false;
    this.root = null;
    this.beatRunner = null;
  }

  start() {
    this.setup();
  }

  setup() {
    if (!this.container) {
      this.container = document.getElementById('tribal-council-screen');
    }
    if (!this.container) return;

    this.isCompleting = false;
    this.result = null;
    this.tribalSummary = null;
    this.playerVote = null;
    this.sitdUsed = false;

    const playerTribe = this.gameManager.getPlayerTribe?.();
    this.attendingTribeId = playerTribe?.tribeId ?? playerTribe?.id ?? null;

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
        text: 'WELCOME TO TRIBAL COUNCIL.',
        textPos: 'top',
        jeff: null,
        button: { label: 'CONTINUE' }
      },
      {
        id: 'seating',
        background: this._resolveTribalBackground(alive.length),
        showStools: true,
        stoolsData: alive,
        button: { label: 'CONTINUE' }
      },
      {
        id: 'vote-intro',
        background: `${ASSET_BASE}/votewalk.jpeg`,
        text: 'It is time to vote.',
        textPos: 'center',
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

  _transitionToReadVotes(controls) {
    if (!this.attendingTribeId) {
      this.finish();
      return;
    }

    this.tribalSummary = this.tribalCouncilSystem.runPreMergeTribal({ attendingTribeId: this.attendingTribeId });
    this.result = this.tribalSummary;

    const postVoteBeats = this._buildPostVoteBeats();
    controls.setBeats(postVoteBeats, { index: 0 });
  }

  _buildPostVoteBeats() {
    const beats = [
      {
        id: 'read-votes-intro',
        background: `${ASSET_BASE}/illread.png`,
        text: 'I will read the votes.',
        textPos: 'top',
        button: { label: 'READ VOTES' }
      },
      ...this._buildVoteRevealBeats((this.tribalSummary?.voteOrder || []).filter(v => v.phase !== 'revote'), 'initial')
    ];

    if (this.tribalSummary?.initialTie) {
      beats.push(
        {
          id: 'tie-announcement',
          background: `${ASSET_BASE}/voteread.png`,
          text: 'WE ARE TIED. THAT MEANS WE VOTE AGAIN, AND ONLY FOR THE TIED PLAYERS.',
          textPos: 'top',
          button: { label: 'CONTINUE' }
        },
        {
          id: 'revote-intro',
          background: `${ASSET_BASE}/votingbooth.png`,
          text: 'THIS REVOTE IS YOUR CHANCE TO SHOW WHERE YOU TRULY STAND.',
          textPos: 'top',
          button: { label: 'CONTINUE' },
          customRender: (content) => this._renderRevoteContext(content)
        },
        ...this._buildVoteRevealBeats((this.tribalSummary?.voteOrder || []).filter(v => v.phase === 'revote'), 'revote')
      );

      if (this.tribalSummary?.rockDrawOccurred) {
        const eliminatedName = this.getDisplayName(this.tribalSummary?.rockDrawEliminatedId, { firstOnly: false });
        beats.push(
          {
            id: 'rocks-intro',
            background: `${ASSET_BASE}/voteread.png`,
            text: 'WE ARE DEADLOCKED. WE ARE GOING TO ROCKS.',
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

    const eliminatedName = this.getDisplayName(this.result?.eliminatedId, { firstOnly: false });
    beats.push({
      id: 'snuff',
      background: `${ASSET_BASE}/snuff.jpeg`,
      text: `THE TRIBE HAS SPOKEN.\n${eliminatedName}`,
      textPos: 'center',
      button: { label: this._shouldShowDebugSummary() ? 'REVIEW SUMMARY' : 'FINISH', onClick: () => (this._shouldShowDebugSummary() ? this.renderDebugSummary() : this.finish()) }
    });

    return beats;
  }

  _buildVoteRevealBeats(votes = [], phase = 'initial') {
    if (!votes.length) return [];

    const counts = {};
    const candidateCounts = phase === 'revote'
      ? (this.tribalSummary?.finalTallyRevote || this.tribalSummary?.revoteCounts || {})
      : (this.tribalSummary?.finalTallyInitial || this.tribalSummary?.initialCounts || {});

    Object.keys(candidateCounts).forEach(id => {
      counts[String(id)] = 0;
    });

    return votes.map((vote, index) => {
      if (!vote.wasNullified) {
        const key = String(vote.targetId);
        counts[key] = (counts[key] || 0) + 1;
      }

      const tallyLines = Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .map(([id, count]) => `${this.getDisplayName(id, { firstOnly: true })}: ${count}`);

      return {
        id: `${phase}-vote-${index}`,
        background: `${ASSET_BASE}/voteread.png`,
        textPos: 'parchment',
        parchment: {
          show: true,
          voteName: vote?.targetName || this.getDisplayName(vote?.targetId, { firstOnly: true }),
          subText: vote?.wasNullified ? 'DOES NOT COUNT' : ''
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

    const panel = createElement('div', { className: 'tribal-panel' });

    if (beat?.text) {
      const textClass = beat.textPos === 'top' ? 'tribal-text tribal-text-top' : 'tribal-text tribal-text-center';
      const wrapperClass = beat.textPos === 'top' ? 'tribal-top-safe' : 'tribal-center-wrap';
      const textWrap = createElement('div', { className: wrapperClass });
      textWrap.appendChild(createElement('div', { className: textClass }, beat.text));
      panel.appendChild(textWrap);
    }

    if (beat?.parchment?.show) {
      const parchmentWrap = createElement('div', { className: 'tribal-parchment-wrap' });
      const parchment = createElement('div', { className: 'tribal-parchment' });
      const voteName = createElement('div', { className: 'tribal-vote-name' }, String(beat.parchment.voteName || 'UNKNOWN').toUpperCase());
      parchment.appendChild(voteName);
      if (beat.parchment.subText) {
        parchment.appendChild(createElement('div', { className: 'tribal-vote-subtext' }, beat.parchment.subText));
      }
      parchmentWrap.appendChild(parchment);
      panel.appendChild(parchmentWrap);
    }

    if (beat?.customRender) {
      const custom = createElement('div', { className: 'tribal-custom-wrap' });
      beat.customRender(custom, controls);
      panel.appendChild(custom);
    }

    if (beat?.tallyLines) {
      const tally = createElement('div', { className: 'tribal-tally-box' });
      tally.appendChild(createElement('div', { className: 'tribal-tally-title' }, beat.tallyTitle || 'TALLY'));
      (beat.tallyLines.length ? beat.tallyLines : ['No valid votes yet']).forEach(line => {
        tally.appendChild(createElement('div', {}, line));
      });
      panel.appendChild(tally);
    }

    const actions = this._createActions(beat, controls);
    if (actions) panel.appendChild(actions);

    scene.appendChild(panel);
    this.root.appendChild(scene);
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
        disabled: typeof beat.button.disabled === 'function' ? beat.button.disabled() : !!beat.button.disabled,
        onclick: () => {
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
        ? `CURRENT VOTE: ${this.getDisplayName(this.playerVote, { firstOnly: false }).toUpperCase()}`
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
      }, this.getDisplayName(member, { firstOnly: false })));
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
        ? 'IF ANYBODY HAS A HIDDEN IMMUNITY IDOL AND YOU WANT TO PLAY IT, NOW WOULD BE THE TIME.'
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
        }, `PLAY ON ${this.getDisplayName(member, { firstOnly: true })}`));
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
      const seat = createElement('div', {
        className: `tribal-seat ${String(member?.id) === String(highlightId) ? 'is-highlighted' : ''}`.trim(),
        title: this.getDisplayName(member, { firstOnly: false }),
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

      wrap.appendChild(seat);
    });

    return wrap;
  }

  _getTribalSeatPositions(count) {
    const size = Math.max(2, Math.min(12, Number(count) || 2));
    const centerX = 50;
    const centerY = 58;
    const radiusX = 36;
    const radiusY = 22;
    const start = Math.PI * 1.08;
    const end = Math.PI * -0.08;
    const step = size > 1 ? (end - start) / (size - 1) : 0;

    return Array.from({ length: size }, (_, index) => {
      const angle = start + (step * index);
      return {
        leftPct: centerX + (Math.cos(angle) * radiusX),
        topPct: centerY + (Math.sin(angle) * radiusY)
      };
    });
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
      list.appendChild(createElement('span', {}, this.getDisplayName(entry.id || entry, { firstOnly: false })));
    });
    content.appendChild(list);
  }

  _getTiedPlayerNames() {
    const tiedIds = this.tribalSummary?.tiedCandidateIds || [];
    return tiedIds.length ? tiedIds.map(id => this.getDisplayName(id)) : ['UNKNOWN'];
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
      const name = this.getDisplayName(member, { firstOnly: false });
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
