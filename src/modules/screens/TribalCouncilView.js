import { createElement, clearChildren } from '../utils/DOMUtils.js';
import eventManager, { GameEvents } from '../core/EventManager.js';

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
  }

  start() {
    if (!this.container) return;
    const playerTribe = this.gameManager.getPlayerTribe?.();
    this.attendingTribeId = playerTribe?.tribeId ?? playerTribe?.id ?? null;
    this.renderArrival();
  }

  setup() {
    if (!this.container) {
      this.container = document.getElementById('tribal-council-screen');
    }
    this.isCompleting = false;
    this.start();
  }

  teardown() {
    if (this.container) {
      clearChildren(this.container);
      this.container.style.backgroundImage = '';
    }
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

  renderArrival() {
    this._renderScene({
      background: `${ASSET_BASE}/arrival.png`,
      text: this._commentaryLine('arrival', 'Welcome to Tribal Council.'),
      portrait: `${ASSET_BASE}/Jeff.png`,
      buttonLabel: 'Continue',
      onNext: () => this.renderSeating()
    });
  }

  _resolveTribalBackground(count) {
    const normalized = Number.isFinite(count) ? Math.max(2, Math.min(12, count)) : 12;
    return `${ASSET_BASE}/${normalized}.png`;
  }

  renderSeating() {
    const tribe = this._getAttendingTribe();
    if (!tribe) {
      this._renderScene({
        background: `${ASSET_BASE}/arrival.png`,
        text: 'Unable to start Tribal Council: no attending tribe found.',
        buttonLabel: null
      });
      return;
    }

    const alive = (tribe?.members || []).filter(member => !member.isOut);
    this._renderScene({
      background: this._resolveTribalBackground(alive.length),
      text: '',
      buttonLabel: 'Vote',
      onNext: () => this.renderVoteWalk(),
      afterRender: panel => {
        const ring = createElement('div', { className: 'tribal-avatar-ring' });
        alive.forEach(member => {
          ring.appendChild(createElement('span', {
            className: 'tribal-seat-avatar',
            'data-member-id': member.id,
            'data-member-name': member.name || member.id
          }, this.getDisplayName(member)));
        });
        panel.prepend(ring);
      }
    });
  }

  renderVoteWalk() {
    this._renderScene({
      background: `${ASSET_BASE}/votewalk.jpeg`,
      buttonLabel: 'Enter Booth',
      onNext: () => this.renderVotingBooth()
    });
  }

  renderVotingBooth(notice = '') {
    const player = this.gameManager.getPlayerSurvivor?.();
    const hasVote = this.gameManager.hasVote?.(player) === true;

    if (!hasVote) {
      this._renderScene({
        background: `${ASSET_BASE}/novote.png`,
        text: 'You have lost your vote. You cannot vote or play Shot In The Dark.',
        buttonLabel: 'Continue',
        onNext: () => this.renderIdolWindow()
      });
      return;
    }

    this._renderScene({
      background: `${ASSET_BASE}/votingbooth.png`,
      text: this.sitdUsed
        ? 'You have used your Shot in the Dark. You will not vote.'
        : this._commentaryLine('preVote', 'Cast your vote or risk it with Shot In The Dark.'),
      buttonLabel: 'Continue',
      disableNext: !this.playerVote && !this.sitdUsed,
      onNext: () => {
        if (!this.playerVote && !this.sitdUsed) {
          this.renderVotingBooth('You must cast a vote or use Shot In The Dark first.');
          return;
        }
        this.renderIdolWindow();
      },
      secondaryActions: [
        {
          label: this.playerVote ? 'Change Vote' : 'Parchment',
          className: 'rect-button small',
          disabled: this.sitdUsed,
          onClick: () => this.openTargetGrid()
        },
        ...(this.gameManager.canPlayShotInTheDark?.(player) === true && player?.shotInTheDarkAvailable !== false && hasVote ? [{
          label: this.sitdUsed ? 'SITD Selected' : 'Bag (Shot In The Dark)',
          className: 'rect-button small',
          disabled: this.sitdUsed,
          onClick: () => {
            const registered = this.tribalCouncilSystem.registerPlayerShotInTheDark(player.id);
            if (!registered) {
              this.renderVotingBooth('Shot In The Dark is not available right now.');
              return;
            }
            this.sitdUsed = true;
            this.playerVote = null;
            this.renderVotingBooth('You have used your Shot in the Dark. You will not vote.');
          }
        }] : [])
      ],
      notice
    });
  }

  openTargetGrid() {
    const tribe = this._getAttendingTribe();
    const player = this.gameManager.getPlayerSurvivor?.();
    const hasVote = this.gameManager.hasVote?.(player) === true;

    if (!hasVote || this.sitdUsed) {
      this.renderVotingBooth();
      return;
    }

    const targets = (tribe?.members || []).filter(member => (
      !member.isOut
      && String(member.id) !== String(player?.id)
      && !this.gameManager.hasImmunity?.(member)
    ));

    this._renderScene({
      background: `${ASSET_BASE}/votingbooth.png`,
      text: 'Choose a target.',
      buttonLabel: 'Back',
      onNext: () => this.renderVotingBooth(),
      afterRender: panel => {
        const grid = createElement('div', { className: 'tribal-grid' });
        targets.forEach(member => {
          const selected = String(this.playerVote) === String(member.id);
          grid.appendChild(createElement('button', {
            className: 'rect-button small',
            type: 'button',
            style: selected ? 'filter:brightness(1.2);outline:2px solid #FFD700;' : '',
            onclick: () => {
              const registered = this.tribalCouncilSystem.registerPlayerVote(player.id, member.id);
              if (!registered) {
                this.renderVotingBooth('You cannot vote right now.');
                return;
              }
              this.playerVote = member.id;
              this.sitdUsed = false;
              this.renderVotingBooth();
            }
          }, this.getDisplayName(member, { firstOnly: false })));
        });
        panel.appendChild(grid);
      }
    });
  }

  renderIdolWindow() {
    const player = this.gameManager.getPlayerSurvivor?.();
    const tribe = this._getAttendingTribe();
    const members = (tribe?.members || []).filter(member => (!member.isOut && !this.gameManager.hasImmunity?.(member)));
    const hasIdol = this.tribalCouncilSystem?.playerHasIdol?.(player?.id);

    this._renderScene({
      background: `${ASSET_BASE}/nowisthetime.png`,
      text: hasIdol ? 'Play your idol?' : 'No idol to play.',
      buttonLabel: hasIdol ? null : 'Continue',
      onNext: () => this.renderIllReadScreen(),
      secondaryActions: hasIdol ? [
        {
          label: 'Self', className: 'rect-button small', onClick: () => {
            this.tribalCouncilSystem.registerIdolPlay(player.id, player.id);
            this.renderIllReadScreen();
          }
        },
        ...members.filter(member => String(member.id) !== String(player.id)).map(member => ({
          label: this.getDisplayName(member, { firstOnly: false }),
          className: 'rect-button small',
          onClick: () => {
            this.tribalCouncilSystem.registerIdolPlay(player.id, member.id);
            this.renderIllReadScreen();
          }
        })),
        { label: 'No', className: 'rect-button small', onClick: () => this.renderIllReadScreen() }
      ] : []
    });
  }

  renderIllReadScreen() {
    this._renderScene({
      background: `${ASSET_BASE}/illread.png`,
      text: [this._commentaryLine('sitdExplain', ''), this._commentaryLine('idolOpportunity', ''), this._commentaryLine('readVotesIntro', '')].filter(Boolean).join('\n'),
      buttonLabel: 'Read Votes',
      onNext: () => this.renderVoteReading()
    });
  }

  renderVoteReading() {
    if (!this.attendingTribeId) {
      this._renderScene({
        background: `${ASSET_BASE}/voteread.png`,
        text: 'Tribal Council cannot proceed: attending tribe missing.',
        buttonLabel: 'Continue',
        onNext: () => this.finish()
      });
      return;
    }

    this.tribalSummary = this.tribalCouncilSystem.runPreMergeTribal({ attendingTribeId: this.attendingTribeId });
    this.result = this.tribalSummary;

    const initialQueue = (this.tribalSummary?.voteOrder || []).filter(vote => vote.phase !== 'revote');
    const revoteQueue = (this.tribalSummary?.voteOrder || []).filter(vote => vote.phase === 'revote');

    this._renderVoteQueue(initialQueue, {
      onDone: () => {
        if (!this.tribalSummary?.initialTie) {
          this.renderSnuff();
          return;
        }
        this.renderTieAnnouncement(() => {
          this.renderRevoteScreen(() => {
            if (revoteQueue.length > 0) {
              this._renderVoteQueue(revoteQueue, { onDone: () => this._continueAfterRevote() });
              return;
            }
            this._continueAfterRevote();
          });
        });
      }
    });
  }

  _continueAfterRevote() {
    if (this.tribalSummary?.rockDrawOccurred) {
      this.renderRockDrawScreen(() => this.renderSnuff());
      return;
    }
    this.renderSnuff();
  }

  renderTieAnnouncement(onNext) {
    const tiedNames = this._getTiedPlayerNames();
    this._renderScene({
      background: `${ASSET_BASE}/voteread.png`,
      text: this._commentaryLine('tieAnnouncement', `We are deadlocked at ${tiedNames.join(' and ')}. We will now revote.`),
      buttonLabel: 'Proceed to Revote',
      onNext
    });
  }

  renderRevoteScreen(onNext) {
    const tiedNames = this._getTiedPlayerNames();
    const excludedVoters = this._getRevoteExcludedVoters();
    this._renderScene({
      background: `${ASSET_BASE}/votingbooth.png`,
      text: this._commentaryLine('revoteIntro', `Revote targets: ${tiedNames.join(' / ')}`),
      buttonLabel: 'Proceed to Revote Vote Reading',
      onNext,
      afterRender: panel => {
        panel.appendChild(createElement('div', { className: 'tribal-subtext' }, 'Only tied players are valid targets. Tied players do not vote. Lost vote and Shot In The Dark users still cannot vote.'));
        if (excludedVoters.length > 0) {
          panel.appendChild(createElement('div', { className: 'tribal-warning' }, `Not voting in revote: ${excludedVoters.join(', ')}`));
        }
      }
    });
  }

  renderRockDrawScreen(onNext) {
    const eligible = this.tribalSummary?.rockDrawEligible || [];
    const eliminatedName = this.getDisplayName(this.tribalSummary?.rockDrawEliminatedId, { firstOnly: false });
    this._renderScene({
      background: `${ASSET_BASE}/voteread.png`,
      text: this._commentaryLine('rocksIntro', 'We are going to rocks.'),
      buttonLabel: 'Draw Rock',
      onNext: () => {
        this._renderScene({
          background: `${ASSET_BASE}/snuff.jpeg`,
          text: this._commentaryLine('rocksResult', `${eliminatedName} draws the bad rock.`),
          buttonLabel: 'Continue',
          onNext
        });
      },
      afterRender: panel => {
        const visual = createElement('div', { className: 'tribal-rocks-list' });
        eligible.forEach(entry => {
          visual.appendChild(createElement('span', {}, this.getDisplayName(entry.id || entry, { firstOnly: false })));
        });
        panel.appendChild(visual);
      }
    });
  }

  _renderVoteQueue(queue = [], { onDone } = {}) {
    if (!Array.isArray(queue) || queue.length === 0) {
      onDone?.();
      return;
    }

    const revealedCounts = {};
    let index = 0;

    const renderCurrent = () => {
      const current = queue[index];
      if (current && !current.nullified) {
        const key = String(current.targetId);
        revealedCounts[key] = (revealedCounts[key] || 0) + 1;
      }

      const targetName = this.getDisplayName(current?.targetId, { firstOnly: true });
      const label = current?.nullified ? `${targetName} (DOES NOT COUNT)` : targetName;
      const tallyEntries = Object.entries(revealedCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([id, count]) => `${this.getDisplayName(id)}: ${count}`);

      const atLastReveal = index >= queue.length - 1;
      this._renderScene({
        background: `${ASSET_BASE}/voteread.png`,
        text: '',
        buttonLabel: atLastReveal ? 'Continue' : 'Next Vote',
        onNext: () => {
          if (!atLastReveal) {
            index += 1;
            renderCurrent();
            return;
          }
          onDone?.();
        },
        afterRender: panel => {
          panel.appendChild(createElement('div', { className: 'vote-parchment-overlay' }, label));
          const tally = createElement('div', { className: 'tribal-tally' });
          tally.appendChild(createElement('div', { className: 'tribal-tally-title' }, current?.phase === 'revote' ? 'REVOTE TALLY' : 'VOTE TALLY'));
          tallyEntries.forEach(line => tally.appendChild(createElement('div', {}, line)));
          if (tallyEntries.length === 0) {
            tally.appendChild(createElement('div', {}, 'No valid votes yet'));
          }
          panel.appendChild(tally);
        }
      });
    };

    renderCurrent();
  }

  renderSnuff() {
    const eliminatedName = this.getDisplayName(this.result?.eliminatedId, { firstOnly: false });
    this._renderScene({
      background: `${ASSET_BASE}/snuff.jpeg`,
      text: `${this._commentaryLine('snuffLine', 'The tribe has spoken.')} ${eliminatedName}`.trim(),
      buttonLabel: this._shouldShowDebugSummary() ? 'Review Summary' : 'Finish',
      onNext: () => (this._shouldShowDebugSummary() ? this.renderDebugSummary() : this.finish())
    });
  }

  finish() {
    if (this.isCompleting) return;
    this.isCompleting = true;
    this._disableActions();
    if (this.tribalSummary) {
      eventManager.publish(GameEvents.TRIBAL_COUNCIL_COMPLETE, this.tribalSummary);
    }
    if (typeof this.onComplete === 'function') {
      this.onComplete(this.result);
    }
  }

  _disableActions() {
    if (!this.container) return;
    this.container.querySelectorAll('button').forEach(button => {
      button.disabled = true;
      button.onclick = null;
    });
  }

  _renderScene({ background, text = '', portrait, buttonLabel, onNext, afterRender, disableNext = false, notice = '', secondaryActions = [] } = {}) {
    clearChildren(this.container);
    this._setBackground(background);
    this.container.style.backgroundSize = 'cover';
    this.container.style.backgroundPosition = 'center';

    const panel = createElement('div', { className: 'tribal-panel' });
    const content = createElement('div', { className: 'tribal-content' });

    if (portrait) {
      content.appendChild(createElement('img', { src: portrait, alt: 'portrait', style: 'width:120px;height:auto;' }));
    }

    if (text) {
      content.appendChild(createElement('div', { className: 'tribal-text' }, text));
    }

    if (notice) {
      content.appendChild(createElement('div', { className: 'tribal-warning' }, notice));
    }

    if (typeof afterRender === 'function') {
      afterRender(content);
    }

    panel.appendChild(content);

    const actions = createElement('div', { className: 'tribal-actions' });
    secondaryActions.forEach(action => {
      const button = createElement('button', {
        className: action.className || 'rect-button small',
        type: 'button',
        onclick: () => action.onClick?.()
      }, action.label || 'Action');
      button.disabled = !!action.disabled;
      actions.appendChild(button);
    });

    if (buttonLabel) {
      const nextButton = createElement('button', {
        className: 'rect-button',
        type: 'button',
        onclick: () => onNext?.()
      }, buttonLabel);
      nextButton.disabled = !!disableNext;
      actions.appendChild(nextButton);
    }

    if (actions.childNodes.length > 0) {
      panel.appendChild(actions);
    }

    this.container.appendChild(panel);
  }

  _getAttendingTribe() {
    const tribes = this.gameManager.getTribes?.() || this.gameManager.tribes || [];
    return tribes.find(candidate => String(candidate?.tribeId ?? candidate?.id) === String(this.attendingTribeId)) || null;
  }

  _resolveName(id) {
    return this.getDisplayName(id, { firstOnly: false });
  }

  _getTiedPlayerNames() {
    const tiedIds = this.tribalSummary?.tiedCandidateIds || [];
    return tiedIds.length ? tiedIds.map(id => this.getDisplayName(id)) : ['UNKNOWN'];
  }

  _commentaryLine(key, fallback = '') {
    return this.tribalSummary?.jeffCommentary?.[key] || fallback;
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

    this._renderScene({
      background: `${ASSET_BASE}/voteread.png`,
      text: 'Tribal Summary (Debug)',
      buttonLabel: 'Continue',
      onNext: () => this.finish(),
      afterRender: panel => {
        const block = createElement('div', { style: 'display:flex;flex-direction:column;gap:8px;max-width:760px;width:100%;font-size:13px;color:#fff;background:rgba(0,0,0,0.55);padding:10px;border-radius:8px;' });
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
    });
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

  _setBackground(background) {
    const fallback = `${ASSET_BASE}/12.png`;
    if (!background) {
      this.container.style.backgroundImage = '';
      return;
    }
    const apply = (imagePath) => {
      this.container.style.backgroundImage = `url('${imagePath}'), linear-gradient(rgba(10,10,10,0.55), rgba(10,10,10,0.55))`;
    };
    const testImage = new Image();
    testImage.onload = () => apply(background);
    testImage.onerror = () => apply(fallback);
    testImage.src = background;
  }
}
