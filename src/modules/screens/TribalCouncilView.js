import { createElement, clearChildren } from '../utils/DOMUtils.js';

const ASSET_BASE = 'Assets/TribalCouncil';

export default class TribalCouncilView {
  constructor({ gameManager, tribalCouncilSystem, container, onComplete } = {}) {
    this.gameManager = gameManager;
    this.tribalCouncilSystem = tribalCouncilSystem;
    this.container = container;
    this.onComplete = onComplete;
    this.revealQueue = [];
    this.result = null;
    this.playerVote = null;
    this.sitdUsed = false;
  }

  start() {
    if (!this.container) return;
    this.renderArrival();
  }

  renderArrival() {
    this._renderScene({
      background: `${ASSET_BASE}/arrival.png`,
      text: 'Welcome to Tribal Council.',
      portrait: `${ASSET_BASE}/Jeff.png`,
      buttonLabel: 'Continue',
      onNext: () => this.renderSeating()
    });
  }

  _resolveTribalBackground(count) {
    const normalized = Number.isFinite(count) ? Math.max(2, Math.min(12, count)) : 6;
    const candidate = `${ASSET_BASE}/${normalized}.png`;
    return candidate;
  }

  renderSeating() {
    const tribe = this.gameManager.getPlayerTribe?.();
    const alive = (tribe?.members || []).filter(member => !member.isOut);
    this._renderScene({
      background: this._resolveTribalBackground(alive.length),
      text: '',
      buttonLabel: 'Vote',
      onNext: () => this.renderVoteWalk(),
      afterRender: panel => {
        const ring = createElement('div', {
          className: 'tribal-avatar-ring',
          style: 'display:flex;flex-wrap:wrap;gap:8px;justify-content:center;max-width:80%;margin:0 auto;'
        });
        alive.forEach(member => {
          const seat = createElement('button', {
            className: 'tribal-seat-avatar',
            type: 'button',
            'data-member-id': member.id,
            'data-member-name': member.name || member.id,
            style: 'padding:6px 10px;border-radius:999px;background:rgba(0,0,0,0.6);color:#fff;font-size:12px;border:1px solid rgba(255,255,255,0.35);'
          }, member.name || member.id);
          ring.appendChild(seat);
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
    const hasLostVote = Boolean(player?.lostVote || player?.penalties?.lostVote);

    if (hasLostVote) {
      this._renderScene({
        background: `${ASSET_BASE}/novote.png`,
        text: 'You have lost your vote.',
        buttonLabel: 'Continue',
        onNext: () => this.renderIdolWindow()
      });
      return;
    }

    this._renderScene({
      background: `${ASSET_BASE}/votingbooth.png`,
      text: 'Cast your vote or risk it with Shot In The Dark.',
      buttonLabel: 'Continue',
      disableNext: !this.playerVote && !this.sitdUsed,
      onNext: () => {
        if (!this.playerVote && !this.sitdUsed) {
          this.renderVotingBooth('You must cast a vote or use Shot In The Dark first.');
          return;
        }
        this.renderIdolWindow();
      },
      afterRender: panel => {
        const actions = createElement('div', {
          style: 'display:flex;gap:10px;justify-content:center;margin-top:12px;'
        });

        const parchmentButton = createElement('button', {
          onclick: () => this.openTargetGrid()
        }, this.playerVote ? 'Change Vote' : 'Parchment');

        actions.appendChild(parchmentButton);

        if (player?.shotInTheDarkAvailable !== false) {
          const sitdButton = createElement('button', {
            onclick: () => {
              this.tribalCouncilSystem.registerPlayerShotInTheDark(player.id);
              this.sitdUsed = true;
              this.playerVote = null;
              this.renderVotingBooth('Shot In The Dark selected.');
            }
          }, this.sitdUsed ? 'SITD Selected' : 'Bag (Shot In The Dark)');
          sitdButton.disabled = this.sitdUsed;
          actions.appendChild(sitdButton);
        }

        panel.appendChild(actions);
      },
      notice
    });
  }

  openTargetGrid() {
    const tribe = this.gameManager.getPlayerTribe?.();
    const player = this.gameManager.getPlayerSurvivor?.();
    const targets = (tribe?.members || []).filter(member => (
      !member.isOut
      && member.id !== player?.id
      && !member.hasImmunity
      && !member.isImmune
    ));

    this._renderScene({
      background: `${ASSET_BASE}/votingbooth.png`,
      text: 'Choose a target.',
      buttonLabel: 'Back',
      onNext: () => this.renderVotingBooth(),
      afterRender: panel => {
        const grid = createElement('div', {
          style: 'display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;width:100%;max-width:680px;margin:0 auto;'
        });

        targets.forEach(member => {
          const selected = this.playerVote === member.id;
          grid.appendChild(createElement('button', {
            'data-target-id': member.id,
            'data-target-name': member.name || member.id,
            style: `border:${selected ? '2px solid #FFD700' : '1px solid #333'};background:${selected ? 'rgba(255,215,0,0.22)' : ''};`,
            onclick: () => {
              this.tribalCouncilSystem.registerPlayerVote(player.id, member.id);
              this.playerVote = member.id;
              this.sitdUsed = false;
              this.renderVotingBooth();
            }
          }, member.name || member.id));
        });

        panel.appendChild(grid);
      }
    });
  }

  renderIdolWindow() {
    const player = this.gameManager.getPlayerSurvivor?.();
    const tribe = this.gameManager.getPlayerTribe?.();
    const members = (tribe?.members || []).filter(member => !member.isOut);
    const hasIdol = this.tribalCouncilSystem?.playerHasIdol?.(player?.id);

    this._renderScene({
      background: `${ASSET_BASE}/nowisthetime.png`,
      text: hasIdol ? 'Play your idol?' : 'No idol to play.',
      buttonLabel: hasIdol ? null : 'Continue',
      onNext: () => this.renderIllReadScreen(),
      afterRender: panel => {
        if (!hasIdol) return;
        const actions = createElement('div', {
          style: 'display:flex;flex-wrap:wrap;gap:10px;justify-content:center;'
        });

        actions.appendChild(createElement('button', {
          onclick: () => {
            this.tribalCouncilSystem.registerIdolPlay(player.id, player.id);
            this.renderIllReadScreen();
          }
        }, 'Self'));

        members.filter(member => member.id !== player.id).forEach(member => {
          actions.appendChild(createElement('button', {
            onclick: () => {
              this.tribalCouncilSystem.registerIdolPlay(player.id, member.id);
              this.renderIllReadScreen();
            }
          }, member.name || member.id));
        });

        actions.appendChild(createElement('button', {
          onclick: () => this.renderIllReadScreen()
        }, 'No'));

        panel.appendChild(actions);
      }
    });
  }

  renderIllReadScreen() {
    this._renderScene({
      background: `${ASSET_BASE}/illread.png`,
      buttonLabel: 'Read Votes',
      onNext: () => this.renderVoteReading()
    });
  }

  renderVoteReading() {
    const tribe = this.gameManager.getPlayerTribe?.();
    const attendingTribeId = tribe?.tribeId ?? tribe?.id;
    this.result = this.tribalCouncilSystem.runPreMergeTribal({ attendingTribeId });
    this.revealQueue = this.tribalCouncilSystem.getVoteRevealQueue();

    let index = 0;
    const renderCurrent = () => {
      const current = this.revealQueue[index];
      const target = (this.gameManager.survivors || []).find(survivor => survivor.id === current?.targetId);
      const targetName = target?.name || 'Unknown';
      const label = current
        ? (current.revealType === 'NULLIFIED' ? `${targetName} (Does not count)` : targetName)
        : 'Done';

      this._renderScene({
        background: `${ASSET_BASE}/voteread.png`,
        text: label,
        buttonLabel: index < this.revealQueue.length - 1 ? 'Next Vote' : 'Continue',
        onNext: () => {
          if (index < this.revealQueue.length - 1) {
            index += 1;
            renderCurrent();
            return;
          }
          this.renderSnuff();
        }
      });
    };

    renderCurrent();
  }

  renderSnuff() {
    const tribe = this.gameManager.getPlayerTribe?.();
    const eliminated = (this.gameManager.survivors || []).find(survivor => survivor.id === this.result?.eliminatedId)
      || (tribe?.members || []).find(member => member.id === this.result?.eliminatedId);
    const tieMessage = this.result?.wasTie && !this.result?.eliminatedId
      ? 'It is a tie. No one is eliminated tonight.'
      : `The tribe has spoken. ${eliminated?.name || this.result?.eliminatedId || ''}`;

    this._renderScene({
      background: `${ASSET_BASE}/snuff.jpeg`,
      text: tieMessage,
      buttonLabel: 'Continue',
      onNext: () => this.finish()
    });
  }

  finish() {
    if (typeof this.onComplete === 'function') {
      this.onComplete(this.result);
    }
  }

  _renderScene({ background, text = '', portrait, buttonLabel, onNext, afterRender, disableNext = false, notice = '' } = {}) {
    clearChildren(this.container);

    this.container.style.backgroundImage = background ? `url('${background}'), linear-gradient(rgba(10,10,10,0.55), rgba(10,10,10,0.55))` : '';
    this.container.style.backgroundSize = 'cover';
    this.container.style.backgroundPosition = 'center';

    const panel = createElement('div', {
      className: 'tribal-panel',
      style: 'padding:20px;min-height:240px;display:flex;flex-direction:column;gap:14px;align-items:center;justify-content:flex-end;'
    });

    if (portrait) {
      panel.appendChild(createElement('img', {
        src: portrait,
        alt: 'portrait',
        style: 'width:120px;height:auto;'
      }));
    }

    if (text) {
      panel.appendChild(createElement('div', {
        style: 'font-size:20px;font-weight:700;color:#fff;text-shadow:1px 1px 2px #000;'
      }, text));
    }

    if (notice) {
      panel.appendChild(createElement('div', {
        style: 'font-size:14px;color:#FFD166;text-shadow:1px 1px 1px #000;'
      }, notice));
    }

    if (typeof afterRender === 'function') {
      afterRender(panel);
    }

    if (buttonLabel) {
      panel.appendChild(createElement('button', {
        disabled: disableNext,
        onclick: () => onNext?.()
      }, buttonLabel));
    }

    this.container.appendChild(panel);
  }
}
