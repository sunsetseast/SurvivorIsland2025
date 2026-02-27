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

  renderSeating() {
    const tribe = this.gameManager.getPlayerTribe?.();
    const alive = (tribe?.members || []).filter(member => !member.isOut);
    this._renderScene({
      background: `${ASSET_BASE}/${alive.length}.png`,
      text: '',
      buttonLabel: 'Vote',
      onNext: () => this.renderVoteWalk(),
      afterRender: panel => {
        const ring = createElement('div', {
          className: 'tribal-avatar-ring',
          style: 'display:flex;flex-wrap:wrap;gap:8px;justify-content:center;max-width:80%;margin:0 auto;'
        });
        alive.forEach(member => {
          ring.appendChild(createElement('div', {
            className: 'tribal-seat-avatar',
            style: 'padding:6px 10px;border-radius:999px;background:rgba(0,0,0,0.6);color:#fff;font-size:12px;'
          }, target.name || target.id));
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

  renderVotingBooth() {
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
      onNext: () => this.renderIdolWindow(),
      afterRender: panel => {
        const actions = createElement('div', {
          style: 'display:flex;gap:10px;justify-content:center;margin-top:12px;'
        });

        const parchmentButton = createElement('button', {
          onclick: () => this.openTargetGrid()
        }, 'Parchment');

        actions.appendChild(parchmentButton);

        if (player?.shotInTheDarkAvailable !== false) {
          const sitdButton = createElement('button', {
            onclick: () => {
              this.tribalCouncilSystem.registerPlayerShotInTheDark(player.id);
              this.renderIdolWindow();
            }
          }, 'Bag (Shot In The Dark)');
          actions.appendChild(sitdButton);
        }

        panel.appendChild(actions);
      }
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
      afterRender: panel => {
        const grid = createElement('div', {
          style: 'display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;width:100%;max-width:680px;margin:0 auto;'
        });

        targets.forEach(target => {
          grid.appendChild(createElement('button', {
            onclick: () => {
              this.tribalCouncilSystem.registerPlayerVote(player.id, target.id);
              this.renderIdolWindow();
            }
          }, target.name || target.id));
        });

        panel.appendChild(grid);
      }
    });
  }

  renderIdolWindow() {
    const player = this.gameManager.getPlayerSurvivor?.();
    const tribe = this.gameManager.getPlayerTribe?.();
    const members = (tribe?.members || []).filter(member => !member.isOut);
    const hasIdol = this.tribalCouncilSystem?._hasIdol?.(player);

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
    this.result = this.tribalCouncilSystem.runPreMergeTribal();
    this.revealQueue = this.tribalCouncilSystem.getVoteRevealQueue();

    let index = 0;
    const renderCurrent = () => {
      const current = this.revealQueue[index];
      const label = current ? `${current.targetId}${current.revealType === 'NULLIFIED' ? ' (Does not count)' : ''}` : 'Done';

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

    this._renderScene({
      background: `${ASSET_BASE}/snuff.jpeg`,
      text: `The tribe has spoken. ${eliminated?.name || this.result?.eliminatedId || ''}`,
      buttonLabel: 'Continue',
      onNext: () => this.finish()
    });
  }

  finish() {
    if (typeof this.onComplete === 'function') {
      this.onComplete(this.result);
    }
  }

  _renderScene({ background, text = '', portrait, buttonLabel, onNext, afterRender } = {}) {
    clearChildren(this.container);

    this.container.style.backgroundImage = background ? `url('${background}')` : '';
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

    if (typeof afterRender === 'function') {
      afterRender(panel);
    }

    if (buttonLabel) {
      panel.appendChild(createElement('button', {
        onclick: () => onNext?.()
      }, buttonLabel));
    }

    this.container.appendChild(panel);
  }
}
