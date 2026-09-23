import { createElement, clearChildren } from '../utils/DOMUtils.js';
import LastFlagChallengeEngine from '../core/LastFlagChallengeEngine.js';

const keyMatches = (a, b) => String(a) === String(b);

export default class LastFlagView {
  constructor(container, config, gameManager, onComplete) {
    this.container = container;
    this.gameManager = gameManager;
    this.onComplete = onComplete;
    this.engine = new LastFlagChallengeEngine({
      tribes: gameManager.getTribes(), playerId: gameManager.player.id, day: config.day
    });
    this.timer = null;
    this.disposed = false;
    this.completionSent = false;
    this.heatPause = null;
    this.lastMove = null;
    this.render();
  }

  dispose() {
    this.disposed = true;
    clearTimeout(this.timer);
    this.timer = null;
  }

  tribe(key) {
    return this.engine.tribes.find(tribe => keyMatches(tribe.key, key));
  }

  take(count) {
    if (this.disposed || !this.engine.awaitingPlayer) return;
    this.afterMove(this.engine.take(count, this.engine.currentActor.id));
  }

  afterMove(move) {
    if (!move || this.disposed) return;
    this.lastMove = move;
    if (move.finalMove && !this.engine.completed) {
      this.heatPause = this.engine.heatResults.at(-1);
      this.render();
      this.timer = setTimeout(() => {
        this.heatPause = null;
        this.render();
      }, 1700);
      return;
    }
    this.render();
  }

  scheduleNpc() {
    if (this.disposed || this.engine.completed || this.engine.awaitingPlayer || this.heatPause) return;
    this.timer = setTimeout(() => {
      if (this.disposed || this.engine.awaitingPlayer) return;
      this.afterMove(this.engine.advanceNpcTurn());
    }, 900);
  }

  render() {
    if (this.disposed) return;
    clearTimeout(this.timer);
    clearChildren(this.container);
    this.container.style.backgroundImage = "url('Assets/Screens/challenge.png')";
    this.container.style.backgroundSize = 'cover';
    this.container.style.backgroundPosition = 'center';

    const scene = createElement('section', { className: 'last-flag-scene last-flag-game' });
    scene.appendChild(createElement('div', { className: 'last-flag-overline' }, 'DAY 2 · TRIBAL IMMUNITY'));
    scene.appendChild(createElement('h1', {}, 'LAST FLAG'));

    if (this.heatPause) {
      scene.appendChild(createElement('div', { className: 'last-flag-moment', role: 'status' },
        `${this.tribe(this.heatPause.winningTribeKey).name} takes the final flag and wins the opening heat!`));
      scene.appendChild(createElement('p', { className: 'last-flag-caption' },
        `${this.tribe(this.heatPause.losingTribeKey).name} faces ${this.tribe(this.engine.byeTribeKey).name} next. Twenty-one fresh flags.`));
      this.container.appendChild(scene);
      return;
    }

    if (this.engine.completed) {
      const result = this.engine.getResult();
      const winners = result.winningTribeKeys.map(key => this.tribe(key).name);
      const finish = createElement('div', { className: 'last-flag-finish', role: 'status' });
      finish.appendChild(createElement('span', { className: 'last-flag-speaker' }, 'JEFF'));
      finish.appendChild(createElement('h2', {}, `${winners.join(' and ')} win immunity!`));
      finish.appendChild(createElement('p', {}, `${this.tribe(result.losingTribeKey).name}, I’ll see you at Tribal Council tonight.`));
      finish.appendChild(createElement('p', { className: 'last-flag-caption' },
        `${this.lastMove.actorName} took the final ${this.lastMove.taken === 1 ? 'flag' : `${this.lastMove.taken} flags`}.`));
      finish.appendChild(createElement('button', {
        type: 'button', className: 'last-flag-button',
        onclick: () => {
          if (this.completionSent || this.disposed) return;
          this.completionSent = true;
          this.onComplete(result);
        }
      }, 'Return to camp'));
      scene.appendChild(finish);
      this.container.appendChild(scene);
      return;
    }

    const heat = this.engine.heat;
    const actor = this.engine.currentActor;
    const actingTribe = this.tribe(heat.turnTribeKey);
    scene.appendChild(createElement('div', { className: 'last-flag-heat' },
      this.engine.byeTribeKey == null ? 'TRIBAL IMMUNITY' : `HEAT ${heat.index + 1} OF 2`));

    const sides = createElement('div', { className: 'last-flag-sides' });
    for (const key of heat.tribeKeys) {
      const tribe = this.tribe(key);
      const side = createElement('div', { className: `last-flag-side ${keyMatches(key, heat.turnTribeKey) ? 'active' : ''}` });
      side.style.setProperty('--tribe-color', tribe.color);
      side.appendChild(createElement('strong', {}, tribe.name));
      side.appendChild(createElement('span', {}, keyMatches(key, heat.startingTribeKey) ? 'STARTED THIS HEAT' : 'READY TO PLAY'));
      sides.appendChild(side);
    }
    scene.appendChild(sides);
    const lineups = createElement('div', { className: 'last-flag-lineups' });
    lineups.appendChild(createElement('span', { className: 'last-flag-speaker' }, 'ROTATING LINEUP'));
    for (const key of heat.tribeKeys) {
      const tribe = this.tribe(key);
      const row = createElement('div', { className: 'last-flag-lineup-row', 'aria-label': `${tribe.name} turn order` });
      row.style.setProperty('--tribe-color', tribe.color);
      for (const id of this.engine.lineups[String(key)]) {
        const member = tribe.members.find(person => keyMatches(person.id, id));
        const active = keyMatches(key, heat.turnTribeKey) && keyMatches(member.id, actor.id);
        row.appendChild(createElement('span', { className: `last-flag-lineup-person ${active ? 'active' : ''}` },
          keyMatches(member.id, this.engine.playerId) ? `YOU · ${member.name}` : member.name));
      }
      lineups.appendChild(row);
    }
    scene.appendChild(lineups);
    if (this.engine.byeTribeKey != null && heat.index === 0) {
      scene.appendChild(createElement('p', { className: 'last-flag-bye' },
        `${this.tribe(this.engine.byeTribeKey).name} drew the bye and enters the second heat.`));
    }

    const board = createElement('div', { className: 'last-flag-board' });
    board.appendChild(createElement('div', { className: 'last-flag-count', role: 'status', 'aria-live': 'polite' },
      `${heat.flagsRemaining} ${heat.flagsRemaining === 1 ? 'FLAG' : 'FLAGS'} REMAINING`));
    const flags = createElement('div', { className: 'last-flag-flags', role: 'img',
      'aria-label': `${heat.flagsRemaining} of 21 flags remain` });
    for (let i = 0; i < 21; i += 1) {
      flags.appendChild(createElement('span', {
        className: `last-flag-pennant ${i >= heat.flagsRemaining ? 'taken' : ''}`,
        'aria-hidden': 'true'
      }));
    }
    board.appendChild(flags);
    scene.appendChild(board);

    const turn = createElement('div', { className: 'last-flag-turn' });
    turn.style.setProperty('--tribe-color', actingTribe.color);
    if (actor.portrait) turn.appendChild(createElement('img', { src: actor.portrait, alt: '' }));
    const turnText = createElement('div');
    turnText.appendChild(createElement('span', { className: 'last-flag-speaker' }, `${actingTribe.name} · ON THE FLAG LINE`));
    turnText.appendChild(createElement('strong', {}, this.engine.awaitingPlayer ? 'YOUR TURN' : `${actor.name}’s turn`));
    turn.appendChild(turnText);
    scene.appendChild(turn);

    if (this.lastMove) {
      const message = this.lastMove.finalMove ? `${this.lastMove.actorName} snatches the final flag!`
        : this.lastMove.recognizedPattern ? `${this.lastMove.actorName}: “I think I see it.”`
          : this.lastMove.mistake ? `${this.lastMove.actorName} takes ${this.lastMove.taken}. Their tribe calls out from the sidelines.`
            : `${this.lastMove.actorName} takes ${this.lastMove.taken}. ${this.lastMove.remaining} left.`;
      scene.appendChild(createElement('p', { className: 'last-flag-commentary', role: 'status' }, message));
    }

    if (this.engine.awaitingPlayer) {
      const choices = createElement('div', { className: 'last-flag-choices' });
      for (const count of [1, 2, 3]) {
        choices.appendChild(createElement('button', {
          type: 'button', className: 'last-flag-button',
          disabled: !this.engine.legalTakes.includes(count),
          onclick: () => this.take(count)
        }, `TAKE ${count}`));
      }
      scene.appendChild(choices);
    } else {
      scene.appendChild(createElement('p', { className: 'last-flag-wait', role: 'status' },
        `${actor.name} is deciding…`));
    }
    this.container.appendChild(scene);
    this.scheduleNpc();
  }
}
