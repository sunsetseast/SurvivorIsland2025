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
    this.playerRevote = null;
    this.attendingTribeId = null;
    this.isCompleting = false;
    this.root = null;
    this.beatRunner = null;
    this.allPlayers = [];
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
    this.playerRevote = null;

    const playerTribe = this.gameManager.getPlayerTribe?.();
    this.attendingTribeId = playerTribe?.tribeId ?? playerTribe?.id ?? null;
    this.allPlayers = this._buildAllPlayersList();

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
        jeff: this.tribalSummary?.jeffCommentary?.readVotesIntro ? { img: `${ASSET_BASE}/jeff.png` } : null,
        button: { label: 'READ VOTES' }
      },
      ...this._buildVoteRevealBeats((this.tribalSummary?.voteOrder || []).filter(v => v.phase !== 'revote'), 'initial')
    ];

    if (this.tribalSummary?.initialTie) {
      const tieBeats = [
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
          button: { label: this.tribalSummary?.playerCanRevote ? 'VOTE NOW' : 'CONTINUE' },
          customRender: (content) => this._renderRevoteContext(content)
        }
      ];

      if (this.tribalSummary?.playerCanRevote && this.tribalSummary?.revotePendingPlayerChoice) {
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

    const eliminatedName = this.getTribalName(this.result?.eliminatedId);
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
    let lastLeaderId = null;

    return votes.map((vote, index) => {
      const countsBefore = { ...counts };
      if (!vote.wasNullified) {
        const key = String(vote.targetId);
        counts[key] = (counts[key] || 0) + 1;
      }
      const countsAfter = { ...counts };
      const sorted = Object.entries(countsAfter).sort((a, b) => b[1] - a[1]);
      const topCount = sorted[0]?.[1] || 0;
      const tiedIds = topCount > 0 ? sorted.filter(([, count]) => count === topCount).map(([id]) => id) : [];
      const currentLeaderId = tiedIds.length === 1 ? tiedIds[0] : null;
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
        lastLeaderId,
        currentLeaderId,
        tiedIds,
        isNullified: Boolean(vote?.wasNullified),
        isLast: revealIndex === totalReveals
      });

      if (currentLeaderId) lastLeaderId = currentLeaderId;

      return {
        id: `${phase}-vote-${index}`,
        background: `${ASSET_BASE}/voteread.png`,
        textPos: 'parchment',
        jeffLine,
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
      const parchmentWrap = createElement('div', { className: 'tribal-parchment-wrap' });
      const parchment = createElement('div', { className: `tribal-parchment ${beat.parchment.nullified ? 'is-nullified' : ''}`.trim() });
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
    const positions = this._getSeatPositions(members.length);

    members.forEach((member, index) => {
      const position = positions[index] || { leftPct: 50, topPct: 40 };
      const avatarUrl = this._getAvatarUrl(member);
      const seat = createElement('div', {
        className: `tribal-seat ${String(member?.id) === String(highlightId) ? 'is-highlighted' : ''}`.trim(),
        title: this.getTribalName(member),
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

  _getSeatPositions(count) {
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
    const wrap = createElement('div', { className: 'tribal-jeff-wrap' });
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

  _getVoteCommentary({ countsBefore, countsAfter, vote, phase, revealIndex, totalReveals, lastLeaderId, currentLeaderId, tiedIds, isNullified, isLast }) {
    const name = this.getTribalName(vote?.targetId || vote?.displayName || 'UNKNOWN');
    const topCount = Math.max(0, ...Object.values(countsAfter));
    const beforeTop = Math.max(0, ...Object.values(countsBefore));
    const phaseLabel = phase === 'revote' ? ' on the revote' : '';

    if (isNullified) return `This vote is for ${name}. This vote does not count.`;
    if (revealIndex === 1) return `First vote${phaseLabel}... ${name}.`;

    const currentCount = countsAfter[String(vote.targetId)] || 0;
    if (currentLeaderId && lastLeaderId && currentLeaderId !== lastLeaderId) {
      return `${this.getTribalName(currentLeaderId)} takes the lead.`;
    }
    if (tiedIds.length > 1 && topCount > 0 && beforeTop !== topCount) {
      return isLast ? "We're deadlocked." : 'We are tied.';
    }
    if (currentCount >= 2) {
      return `That's ${currentCount} votes ${name}.`;
    }
    if (isLast && tiedIds.length === 1) {
      return `${this.getTribalName(tiedIds[0])} has enough. That's it.`;
    }

    const remaining = totalReveals - revealIndex;
    if (remaining === 1) return 'This next vote could decide it.';
    return `Vote ${revealIndex}${phaseLabel}... ${name}.`;
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
