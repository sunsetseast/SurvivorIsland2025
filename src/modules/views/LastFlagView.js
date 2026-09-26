import { createElement, clearChildren } from '../utils/DOMUtils.js';
import LastFlagChallengeEngine from '../core/LastFlagChallengeEngine.js';
import { BOARD_FLAG_SLOTS, LAST_FLAG_BOARD_ART, lastFlagAsset } from '../core/LastFlagField.js';

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
    this.finalPause = false;
    this.lastMove = null;
    this.animateTurn = null;
    this.openingCut = true;
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
    return `${heat.moves.length}:${this.engine.currentActor?.id}`;
  }

  take(count, token = this.turnToken()) {
    if (this.disposed || this.inputLocked || this.finalPause
      || !this.engine.awaitingPlayer || token !== this.turnToken()) return;
    this.inputLocked = true;
    const move = this.engine.take(count, this.engine.currentActor.id);
    if (move) this.afterMove(move);
    else this.inputLocked = false;
  }

  afterMove(move) {
    if (!move || this.disposed) return;
    this.lastMove = move;
    this.animateTurn = move.turn;
    if (this.engine.completed) {
      this.finalPause = true;
      this.render();
      this.timer = setTimeout(() => {
        if (this.disposed) return;
        this.finalPause = false;
        this.render();
      }, 1050);
      return;
    }
    this.inputLocked = false;
    this.render();
  }

  scheduleNpc() {
    if (this.disposed || this.engine.completed || this.engine.awaitingPlayer) return;
    this.timer = setTimeout(() => {
      if (this.disposed || this.engine.awaitingPlayer || this.engine.completed) return;
      this.afterMove(this.engine.advanceNpcTurn());
    }, 840);
  }

  renderArena(heat) {
    const arena = createElement('div', { className: 'last-flag-arena' });
    arena.appendChild(createElement('img', { className: 'last-flag-board-art',
      src: LAST_FLAG_BOARD_ART, alt: '',
      onerror: event => { event.currentTarget.onerror = null; event.currentTarget.src = 'Assets/Screens/challenge.png'; }
    }));
    const flags = createElement('div', { className: 'last-flag-flags', role: 'img',
      'aria-label': `${heat.flagsRemaining} of 21 flags remain` });
    const removed = 21 - heat.flagsRemaining;
    const pulling = this.animateTurn === this.lastMove?.turn ? this.lastMove?.taken || 0 : 0;
    BOARD_FLAG_SLOTS.forEach((slot, i) => {
      const newlyTaken = i >= removed - pulling && i < removed;
      const flag = createElement('span', {
        className: `last-flag-pennant ${i < removed ? 'taken' : ''} ${newlyTaken ? 'pulling' : ''}`.trim(),
        'aria-hidden': 'true'
      });
      flag.style.setProperty('--flag-x', `${slot.x}%`);
      flag.style.setProperty('--flag-y', `${slot.y}%`);
      flag.style.setProperty('--flag-art', `url('${lastFlagAsset(this.engine.fieldFlagColor)}')`);
      flag.style.setProperty('--pull-delay', `${(i - (removed - pulling)) * 95}ms`);
      flag.setAttribute('data-ring', slot.ring);
      flags.appendChild(flag);
    });
    arena.appendChild(flags);
    arena.appendChild(createElement('div', {
      className: 'last-flag-count', role: 'status', 'aria-live': 'polite'
    }, `${heat.flagsRemaining} ${heat.flagsRemaining === 1 ? 'FLAG' : 'FLAGS'} REMAINING`));
    return arena;
  }

  renderFinish(scene) {
    const result = this.engine.getResult();
    const finish = createElement('div', { className: 'last-flag-finish' });
    finish.appendChild(createElement('img', { src: 'Assets/jeff-screen.png', alt: 'Jeff at the challenge', className: 'last-flag-result-art' }));
    const speech = createElement('div', { className: 'last-flag-result-speech' });
    speech.appendChild(createElement('span', { className: 'last-flag-speaker' }, 'JEFF · CHALLENGE RESULTS'));
    speech.appendChild(createElement('h2', {}, result.winningTribeKeys.length === 2 ? 'TWO TRIBES WIN IMMUNITY' : 'IMMUNITY IS YOURS'));
    const finalTribe = this.tribe(this.lastMove?.tribeKey ?? this.engine.moves.at(-1).tribeKey);
    speech.appendChild(createElement('p', {}, result.winningTribeKeys.length === 2
      ? `${finalTribe.name} takes the final flag — and loses Last Flag.`
      : `${finalTribe.name} takes the final flag and wins immunity!`));
    for (const key of result.winningTribeKeys) {
      const winner = this.tribe(key);
      const line = createElement('p', { className: 'last-flag-winner' },
        `${winner.name} wins tribal immunity!`);
      line.style.setProperty('--tribe-color', winner.color);
      speech.appendChild(line);
    }
    speech.appendChild(createElement('p', { className: 'last-flag-tribal' },
      `${this.tribe(result.losingTribeKey).name}, I’ll see you at Tribal Council tonight.`));
    speech.appendChild(createElement('button', {
      type: 'button', className: 'last-flag-button last-flag-next',
      onclick: () => {
        if (this.completionSent || this.disposed) return;
        this.completionSent = true;
        this.onComplete(result);
      }
    }, 'CONTINUE'));
    finish.appendChild(speech);
    scene.appendChild(finish);
  }

  render() {
    if (this.disposed) return;
    clearTimeout(this.timer);
    clearChildren(this.container);
    this.container.style.backgroundImage = '';
    const scene = createElement('section', { className: `last-flag-scene last-flag-game ${this.openingCut ? 'last-flag-opening-cut' : ''} ${this.engine.completed && !this.finalPause ? 'last-flag-result-scene' : ''}`.trim() });
    this.openingCut = false;
    scene.appendChild(createElement('div', { className: 'last-flag-overline' },
      `DAY ${this.config.day} · LAST FLAG · TRIBAL IMMUNITY`));

    if (this.engine.completed && !this.finalPause) {
      this.renderFinish(scene);
      this.container.appendChild(scene);
      return;
    }

    const heat = this.engine.heat;
    const actor = this.engine.currentActor;
    const actingTribe = this.tribe(heat.turnTribeKey);
    const nextTribe = this.tribe(this.engine.nextTribeKey);
    scene.appendChild(createElement('div', { className: 'last-flag-heat' },
      this.engine.tribes.length === 3 ? 'THREE TRIBES · LAST FLAG LOSES' : 'TWO TRIBES · LAST FLAG WINS'));
    const hud = createElement('div', { className: 'last-flag-sides', 'aria-label': 'Tribe status' });
    for (const tribe of this.engine.tribes) {
      const active = same(tribe.key, heat.turnTribeKey);
      const next = same(tribe.key, nextTribe.key);
      const status = active ? 'ACTIVE' : next ? 'NEXT' : 'WAITING';
      const side = createElement('div', { className: `last-flag-side ${status.toLowerCase()}` });
      side.style.setProperty('--tribe-color', tribe.color);
      side.appendChild(createElement('strong', {}, tribe.name));
      side.appendChild(createElement('span', {}, status));
      hud.appendChild(side);
    }
    scene.appendChild(hud);
    const arenaSpace = createElement('div', { className: 'last-flag-arena-space' });
    arenaSpace.appendChild(this.renderArena(heat));
    scene.appendChild(arenaSpace);
    this.animateTurn = null;
    if (this.finalPause) {
      const loser = this.engine.tribes.length === 3;
      scene.appendChild(createElement('h2', { className: 'last-flag-final-impact', role: 'status' },
        `${this.lastMove.actorName.toUpperCase()} TAKES THE FINAL FLAG! ${loser ? `${actingTribe.name.toUpperCase()} LOSES!` : `${actingTribe.name.toUpperCase()} WINS IMMUNITY!`}`));
      this.container.appendChild(scene);
      return;
    }

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
