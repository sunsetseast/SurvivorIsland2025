import { createElement, clearChildren } from '../utils/DOMUtils.js';
import LastFlagChallengeEngine from '../core/LastFlagChallengeEngine.js';

const same = (a, b) => String(a) === String(b);

export default class LastFlagView {
  constructor(container, config, gameManager, onComplete, playerSitOutIds = []) {
    this.container = container;
    this.config = config;
    this.onComplete = onComplete;
    this.engine = new LastFlagChallengeEngine({
      tribes: gameManager.getTribes(), playerId: gameManager.player.id,
      day: config.day, playerSitOutIds
    });
    this.timer = null;
    this.disposed = false;
    this.completionSent = false;
    this.inputLocked = false;
    this.heatPause = null;
    this.finalPause = false;
    this.lastMove = null;
    this.render();
  }

  dispose() {
    this.disposed = true;
    clearTimeout(this.timer);
    this.timer = null;
  }

  tribe(key) {
    return this.engine.tribes.find(tribe => same(tribe.key, key));
  }

  turnToken() {
    const heat = this.engine.heat;
    return `${heat.index}:${heat.moves.length}:${this.engine.currentActor?.id}`;
  }

  take(count, token = this.turnToken()) {
    if (this.disposed || this.inputLocked || this.heatPause || this.finalPause
      || !this.engine.awaitingPlayer || token !== this.turnToken()) return;
    this.inputLocked = true;
    const move = this.engine.take(count, this.engine.currentActor.id);
    if (move) this.afterMove(move);
    else this.inputLocked = false;
  }

  afterMove(move) {
    if (!move || this.disposed) return;
    this.lastMove = move;
    if (move.finalMove && !this.engine.completed) {
      this.heatPause = { phase: 'immunity', result: this.engine.heatResults.at(-1) };
      this.render();
      this.timer = setTimeout(() => {
        if (this.disposed) return;
        this.heatPause.phase = 'second';
        this.lastMove = null;
        this.render();
        this.timer = setTimeout(() => {
          if (this.disposed) return;
          this.heatPause = null;
          this.lastMove = null;
          this.inputLocked = false;
          this.render();
        }, 1250);
      }, 1100);
      return;
    }
    if (this.engine.completed) {
      this.finalPause = true;
      this.render();
      this.timer = setTimeout(() => {
        if (this.disposed) return;
        this.finalPause = false;
        this.render();
      }, 750);
      return;
    }
    this.inputLocked = false;
    this.render();
  }

  scheduleNpc() {
    if (this.disposed || this.engine.completed || this.engine.awaitingPlayer || this.heatPause) return;
    this.timer = setTimeout(() => {
      if (this.disposed || this.engine.awaitingPlayer || this.heatPause) return;
      this.afterMove(this.engine.advanceNpcTurn());
    }, 840);
  }

  renderArena(heat) {
    const arena = createElement('div', { className: 'last-flag-board' });
    arena.appendChild(createElement('div', {
      className: 'last-flag-count', role: 'status', 'aria-live': 'polite'
    }, `${heat.flagsRemaining} ${heat.flagsRemaining === 1 ? 'FLAG' : 'FLAGS'} REMAINING`));
    const flags = createElement('div', { className: 'last-flag-flags', role: 'img',
      'aria-label': `${heat.flagsRemaining} of 21 flags remain` });
    for (let i = 0; i < 21; i += 1) {
      const row = Math.floor(i / 7), column = i % 7;
      const flag = createElement('span', {
        className: `last-flag-pennant ${i >= heat.flagsRemaining ? 'taken' : ''}`,
        'aria-hidden': 'true'
      });
      flag.style.setProperty('--flag-x', `${9 + column * 13.5 + (row === 1 ? 2 : row === 2 ? -1 : 0)}%`);
      flag.style.setProperty('--flag-y', `${20 + row * 23 + Math.abs(column - 3) * 1.9}%`);
      flag.style.setProperty('--flag-tilt', `${(column - 3) * 2}deg`);
      flags.appendChild(flag);
    }
    arena.appendChild(flags);
    return arena;
  }

  renderInterlude(scene) {
    const pause = this.heatPause;
    if (pause.phase === 'second') {
      scene.appendChild(createElement('h2', { className: 'last-flag-interlude-title' }, 'SECOND IMMUNITY'));
      scene.appendChild(this.renderArena(this.engine.heat));
      scene.appendChild(createElement('p', { className: 'last-flag-moment', role: 'status' },
        `JEFF: ${pause.result.remainingTribeKeys.map(key => this.tribe(key).name).join(' and ')}, you are playing for the final immunity. Fresh flags. Take your spots!`));
    } else {
      scene.appendChild(createElement('div', { className: 'last-flag-interlude' }));
      scene.appendChild(createElement('h2', { className: 'last-flag-interlude-title', role: 'status' },
        `${this.tribe(pause.result.winningTribeKey).name.toUpperCase()} WINS IMMUNITY!`));
      scene.appendChild(createElement('p', { className: 'last-flag-moment' },
        `JEFF: ${this.tribe(pause.result.winningTribeKey).name} is safe. The other two tribes will play again for the second immunity.`));
    }
  }

  renderFinish(scene) {
    if (this.finalPause) {
      scene.appendChild(createElement('div', { className: 'last-flag-interlude' }));
      scene.appendChild(createElement('h2', { className: 'last-flag-interlude-title', role: 'status' },
        `${this.lastMove.actorName.toUpperCase()} TAKES THE FINAL FLAG!`));
      return;
    }
    const result = this.engine.getResult();
    const finish = createElement('div', { className: 'last-flag-finish' });
    finish.appendChild(createElement('img', { src: 'Assets/jeff-screen.png', alt: 'Jeff', className: 'last-flag-finish-jeff' }));
    finish.appendChild(createElement('span', { className: 'last-flag-speaker' }, 'JEFF · CHALLENGE RESULTS'));
    finish.appendChild(createElement('h2', {}, 'IMMUNITY IS YOURS'));
    for (const [index, key] of result.winningTribeKeys.entries()) {
      const winner = this.tribe(key);
      const line = createElement('p', { className: 'last-flag-winner' },
        `${winner.name} wins ${result.winningTribeKeys.length === 2 ? index === 0 ? 'the first' : 'the second' : 'tribal'} immunity!`);
      line.style.setProperty('--tribe-color', winner.color);
      finish.appendChild(line);
    }
    finish.appendChild(createElement('p', { className: 'last-flag-tribal' },
      `${this.tribe(result.losingTribeKey).name}, I’ll see you at Tribal Council tonight.`));
    finish.appendChild(createElement('button', {
      type: 'button', className: 'last-flag-button last-flag-next',
      onclick: () => {
        if (this.completionSent || this.disposed) return;
        this.completionSent = true;
        this.onComplete(result);
      }
    }, 'CONTINUE'));
    scene.appendChild(finish);
  }

  render() {
    if (this.disposed) return;
    clearTimeout(this.timer);
    clearChildren(this.container);
    this.container.style.backgroundImage = `url('${this.config.background || 'Assets/Screens/challenge.png'}')`;
    this.container.style.backgroundSize = 'cover';
    this.container.style.backgroundPosition = 'center';
    const scene = createElement('section', { className: 'last-flag-scene last-flag-game' });
    scene.appendChild(createElement('div', { className: 'last-flag-overline' },
      `DAY ${this.config.day} · LAST FLAG · TRIBAL IMMUNITY`));

    if (this.heatPause) {
      this.renderInterlude(scene);
      this.container.appendChild(scene);
      return;
    }
    if (this.engine.completed) {
      this.renderFinish(scene);
      this.container.appendChild(scene);
      return;
    }

    const heat = this.engine.heat;
    const actor = this.engine.currentActor;
    const actingTribe = this.tribe(heat.turnTribeKey);
    const nextTribe = this.tribe(this.engine.nextTribeKey);
    scene.appendChild(createElement('div', { className: 'last-flag-heat' },
      this.engine.hasSecondHeat ? heat.index === 0 ? 'FIRST IMMUNITY · THREE TRIBES' : 'SECOND IMMUNITY · TWO TRIBES'
        : 'ONE IMMUNITY · TWO TRIBES'));
    const hud = createElement('div', { className: 'last-flag-sides', 'aria-label': 'Tribe status' });
    for (const tribe of this.engine.tribes) {
      const immune = this.engine.winningTribeKeys.some(key => same(key, tribe.key));
      const active = same(tribe.key, heat.turnTribeKey);
      const next = same(tribe.key, nextTribe.key);
      const status = immune ? 'IMMUNE' : active ? 'ACTIVE' : next ? 'NEXT' : 'WAITING';
      const side = createElement('div', { className: `last-flag-side ${status.toLowerCase()}` });
      side.style.setProperty('--tribe-color', tribe.color);
      side.appendChild(createElement('strong', {}, tribe.name));
      side.appendChild(createElement('span', {}, status));
      hud.appendChild(side);
    }
    scene.appendChild(hud);
    scene.appendChild(this.renderArena(heat));

    const dock = createElement('div', { className: 'last-flag-dock' });
    const turn = createElement('div', { className: `last-flag-turn ${this.engine.awaitingPlayer ? 'player-turn' : ''}` });
    turn.style.setProperty('--tribe-color', actingTribe.color);
    if (actor.portrait) turn.appendChild(createElement('img', { src: actor.portrait, alt: '' }));
    const turnText = createElement('div');
    turnText.appendChild(createElement('span', { className: 'last-flag-speaker' },
      `${actingTribe.name} · ${nextTribe.name} NEXT`));
    turnText.appendChild(createElement('strong', {}, this.engine.awaitingPlayer ? 'YOUR TURN' : `${actor.name} AT THE FLAGS`));
    turn.appendChild(turnText);
    dock.appendChild(turn);

    if (this.lastMove) {
      const message = this.lastMove.callout
        ? `${this.lastMove.actorName}: ${this.lastMove.callout}`
        : `JEFF: ${this.lastMove.actorName} takes ${this.lastMove.taken}. ${this.lastMove.remaining} left.`;
      dock.appendChild(createElement('p', { className: 'last-flag-commentary' }, message));
    } else {
      dock.appendChild(createElement('p', { className: 'last-flag-commentary' }, 'JEFF: Survivors ready? Go!'));
    }
    if (this.engine.awaitingPlayer) {
      const choices = createElement('div', { className: 'last-flag-choices' });
      const token = this.turnToken();
      for (const count of [1, 2, 3]) {
        choices.appendChild(createElement('button', {
          type: 'button', className: 'last-flag-button',
          disabled: !this.engine.legalTakes.includes(count),
          onclick: () => this.take(count, token)
        }, `TAKE ${count}`));
      }
      dock.appendChild(choices);
    } else {
      dock.appendChild(createElement('p', { className: 'last-flag-wait' }, `${actor.name} is choosing…`));
    }
    const lineups = createElement('div', { className: 'last-flag-lineups', 'aria-label': 'Upcoming tribe lineups' });
    for (const key of heat.tribeKeys) {
      const tribe = this.tribe(key);
      const row = createElement('div', { className: 'last-flag-lineup-row',
        'aria-label': `${tribe.name} rotating lineup` });
      row.style.setProperty('--tribe-color', tribe.color);
      row.appendChild(createElement('strong', {}, tribe.name));
      const ids = this.engine.lineups[String(key)];
      for (let offset = 0; offset < Math.min(ids.length, 3); offset += 1) {
        const id = ids[(heat.positions[String(key)] + offset) % ids.length];
        const member = tribe.members.find(person => same(person.id, id));
        const person = createElement('span', { className: `last-flag-lineup-person ${offset === 0 ? 'up-next' : ''}`,
          title: member.name });
        if (member.portrait) person.appendChild(createElement('img', { src: member.portrait, alt: '' }));
        person.appendChild(createElement('span', {}, same(id, this.engine.playerId) ? 'YOU' : member.name));
        row.appendChild(person);
      }
      lineups.appendChild(row);
    }
    dock.appendChild(lineups);
    scene.appendChild(dock);
    this.container.appendChild(scene);
    this.scheduleNpc();
  }
}
