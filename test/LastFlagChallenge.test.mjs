import test from 'node:test';
import assert from 'node:assert/strict';
import { buildChallengeArrival } from '../src/modules/core/ChallengeArrival.js';
import LastFlagChallengeEngine from '../src/modules/core/LastFlagChallengeEngine.js';
import { normalizeChallengeResult } from '../src/modules/core/ChallengeResult.js';
import SeasonEngine from '../src/modules/core/SeasonEngine.js';
globalThis.window = globalThis.window || {};
const { gameManager } = await import('../src/modules/core/GameManager.js');
const { default: challengeManager } = await import('../src/modules/core/ChallengeManager.js');
const { default: ChallengeScreen } = await import('../src/modules/screens/ChallengeScreen.js');

function fixtures(count = 2, { playerTribe = 0, size = 4, strong = false } = {}) {
  const tribes = Array.from({ length: count }, (_, index) => ({
    id: index + 1, tribeId: index + 1, tribeName: `Tribe ${index + 1}`,
    tribeColor: ['#df6951', '#58b59b', '#a98ac7'][index],
    members: Array.from({ length: size }, (_, slot) => ({
      id: `t${index + 1}-${slot}`, name: `Contestant ${index + 1}-${slot}`,
      firstName: `C${index + 1}-${slot}`, tribeId: index + 1,
      isPlayer: index === playerTribe && slot === size - 1,
      mental: strong ? 110 : 25, puzzles: strong ? 10 : 2,
      focus: strong ? 10 : 2, gameplayStyle: strong ? 'Shadow Strategist' : 'Wildcard', risk: strong ? 3 : 9
    }))
  }));
  const player = tribes[playerTribe].members.at(-1);
  return { tribes, player, survivors: tribes.flatMap(tribe => tribe.members) };
}

function play(engine, playerChoice = () => 1) {
  let guard = 0;
  while (!engine.completed && guard++ < 50) {
    const actor = engine.currentActor;
    const move = engine.awaitingPlayer
      ? engine.take(playerChoice(engine), actor.id) : engine.advanceNpcTurn();
    assert.ok(move, 'every turn must progress');
  }
  assert.ok(engine.completed, 'challenge ends');
  return engine.getResult();
}

test('last completed Tribal supplies the reveal and the returning tribe enters last', () => {
  const { tribes, survivors } = fixtures(3);
  const eliminated = { id: 'voted-out', name: 'Sarah', avatarUrl: 'sarah.jpg', tribeId: 2, isOut: true };
  survivors.push(eliminated);
  const seasonHistory = [
    { type: 'roundComplete', day: 0, unsafeTribe: 3, eliminatedId: 'stale' },
    { type: 'roundComplete', day: 1, unsafeTribe: 2, eliminatedId: eliminated.id, tribalMode: 'offscreen' }
  ];
  const scene = buildChallengeArrival({ day: 2, tribes, survivors, seasonHistory });
  assert.deepEqual(scene.arrivals.map(tribe => tribe.key), [1, 3, 2]);
  assert.equal(scene.previous.eliminatedName, 'Sarah');
  assert.equal(scene.previous.eliminatedPortrait, 'sarah.jpg');
  assert.equal(scene.previous.mode, 'offscreen');
  assert.equal(scene.arrivals.at(-1).members.some(member => member.id === eliminated.id), false);
  assert.equal(scene.beats.find(beat => beat.reveal)?.reveal?.eliminatedName, 'Sarah');
  assert.ok(scene.beats.findIndex(beat => beat.reveal) < scene.beats.findIndex(beat => beat.title === 'Last Flag'));
});

test('visible player Tribal uses canonical day-one history and reveals to the safe tribe', () => {
  const { tribes, survivors, player } = fixtures(2, { playerTribe: 1 });
  const departed = { id: 'departed', name: 'Jay', tribeId: 2, isOut: true };
  survivors.push(departed);
  const scene = buildChallengeArrival({ day: 2, tribes, survivors,
    seasonHistory: [{ type: 'tribal', day: 1, unsafeTribe: 2, eliminatedId: departed.id, eliminationType: 'vote' }],
    tribalHistory: [{ day: 1, attendingTribeId: 2, eliminatedId: departed.id, eliminatedName: 'Jay' }]
  });
  assert.deepEqual(scene.arrivals.map(tribe => tribe.key), [1, 2]);
  assert.equal(scene.previous.mode, 'visible');
  assert.ok(scene.arrivals.at(-1).members.some(member => member.id === player.id));
  assert.equal(scene.previous.eliminatedName, 'Jay');
  const fromGameHistory = buildChallengeArrival({ day: 2, tribes, survivors,
    tribalHistory: [{ day: 1, attendingTribeId: 2, eliminatedId: departed.id, eliminatedName: 'Jay' }]
  });
  assert.deepEqual(fromGameHistory.arrivals.map(tribe => tribe.key), [1, 2]);
  assert.equal(fromGameHistory.previous.eliminatedName, 'Jay');
});

test('missing or stale prior Tribal does not invent an elimination', () => {
  const { tribes, survivors } = fixtures();
  for (const seasonHistory of [[], [{ type: 'roundComplete', day: 0, unsafeTribe: 1, eliminatedId: 'old' }]]) {
    const scene = buildChallengeArrival({ day: 2, tribes, survivors, seasonHistory,
      tribalHistory: [{ day: 0, attendingTribeId: 1, eliminatedId: 'old', eliminatedName: 'Old' }] });
    assert.equal(scene.previous, null);
    assert.equal(scene.beats.some(beat => beat.reveal), false);
    assert.equal(scene.beats.some(beat => /undefined|Old/.test(beat.text)), false);
  }
});

test('21 flags, legal actions, alternating teams and rotating actors', () => {
  const { tribes, player } = fixtures(2, { size: 4 });
  const engine = new LastFlagChallengeEngine({ tribes, playerId: player.id });
  assert.equal(engine.heat.flagsRemaining, 21);
  const playerLineup = engine.lineups[String(player.tribeId)];
  assert.ok(playerLineup.indexOf(player.id) < 3);
  const initialKey = engine.heat.turnTribeKey;
  const first = engine.currentActor.id;
  for (const invalid of [0, 4, -1, 21, 1.5]) assert.equal(engine.take(invalid, first), null);
  assert.equal(engine.take(1, 'wrong-actor'), null);
  assert.equal(engine.heat.flagsRemaining, 21);
  assert.ok(engine.take(1, first));
  assert.notEqual(String(engine.heat.turnTribeKey), String(initialKey));
  for (let i = 1; i < 8; i += 1) {
    const actor = engine.currentActor;
    assert.equal(String(engine.heat.turnTribeKey), String(i % 2 ? engine.heat.tribeKeys.find(key => String(key) !== String(initialKey)) : initialKey));
    engine.take(1, actor.id);
  }
  assert.equal(engine.heat.positions[String(initialKey)], 4);
  assert.equal(engine.currentActor.id, engine.lineups[String(initialKey)][0]);
});

test('player turn pauses NPC progression and player moves change the board', () => {
  const { tribes, player } = fixtures();
  const engine = new LastFlagChallengeEngine({ tribes, playerId: player.id });
  for (let i = 0; i < 5 && !engine.awaitingPlayer; i += 1) engine.advanceNpcTurn();
  assert.equal(engine.awaitingPlayer, true);
  const remaining = engine.heat.flagsRemaining;
  assert.equal(engine.advanceNpcTurn(), null);
  assert.equal(engine.heat.flagsRemaining, remaining);
  assert.equal(engine.take(2, player.id).taken, 2);
  assert.equal(engine.heat.flagsRemaining, remaining - 2);
  assert.notEqual(engine.currentActor.id, player.id);
});

test('the player cannot override an NPC teammate or the opposing tribe', () => {
  const { tribes, player } = fixtures();
  const engine = new LastFlagChallengeEngine({ tribes, playerId: player.id });
  while (!engine.awaitingPlayer) engine.advanceNpcTurn();
  engine.take(1, player.id);
  while (String(engine.heat.turnTribeKey) !== String(player.tribeId)) engine.advanceNpcTurn();
  assert.notEqual(engine.currentActor.id, player.id);
  const before = engine.heat.flagsRemaining;
  assert.equal(engine.take(3, player.id), null);
  assert.equal(engine.heat.flagsRemaining, before);
  const teammate = engine.advanceNpcTurn();
  assert.ok(teammate && String(teammate.tribeKey) === String(player.tribeId));
});

test('NPC choice is reproducible, strong minds recognize positions, weaker minds can miss them', () => {
  const { tribes, player } = fixtures(2, { strong: true });
  tribes.forEach(tribe => tribe.members.forEach(member => { member.id += '0'; }));
  const a = new LastFlagChallengeEngine({ tribes, playerId: player.id });
  const b = new LastFlagChallengeEngine({ tribes, playerId: player.id });
  for (const engine of [a, b]) {
    engine.heat.flagsRemaining = 10; // The logical move takes two.
    if (engine.awaitingPlayer) engine.take(1, player.id);
  }
  assert.equal(a.chooseNpcMove(), b.chooseNpcMove());
  const strongDecision = a.chooseNpcMove();
  assert.ok(a.legalTakes.includes(strongDecision));
  assert.equal(strongDecision, b.chooseNpcMove());
  assert.equal(strongDecision, a.heat.flagsRemaining % 4);
  assert.equal(a.lastNpcDecision.recognized, true);
  const weak = fixtures(2);
  const imperfect = new LastFlagChallengeEngine({ tribes: weak.tribes, playerId: weak.player.id });
  let misses = 0;
  for (const remaining of [6, 9, 10, 11, 13, 14, 15, 17]) {
    imperfect.heat.flagsRemaining = remaining;
    if (!imperfect.awaitingPlayer && imperfect.chooseNpcMove() !== remaining % 4) misses += 1;
  }
  assert.ok(misses > 0, 'an imperfect contestant does not always find the pattern');
});

test('two-tribe result is canonical and the last move cannot finish twice', () => {
  const { tribes, player } = fixtures(2);
  const engine = new LastFlagChallengeEngine({ tribes, playerId: player.id });
  const result = normalizeChallengeResult(play(engine), { challenge: { day: 2, type: 'tribal', name: 'Last Flag' },
    gameManager: { player, getPlayerTribe: () => tribes.find(tribe => tribe.id === player.tribeId) } });
  assert.equal(result.challengeKey, 'last_flag');
  assert.equal(result.challengeDay, 2);
  assert.equal(result.challengeType, 'tribal');
  assert.equal(result.winningTribeKeys.length, 1);
  assert.notEqual(String(result.winningTribeKey), String(result.losingTribeKey));
  assert.equal(result.completed, true);
  assert.equal(result.totalTurns, engine.moves.length);
  assert.equal(result.heatResults[0].startingTribeKey, result.startingTribeKey);
  assert.equal(result.contestantPerformance[player.id].turns > 0, true);
  assert.equal(engine.advanceNpcTurn(), null);
  assert.equal(engine.take(1, result.finalActorId), null);
  assert.equal(engine.getResult().totalTurns, result.totalTurns);
  assert.equal(engine.getResult().finalActorId, result.finalActorId);
});

test('three-tribe heats grant two immunities, reset flags, and keep the bye fair', () => {
  const { tribes, player } = fixtures(3);
  const engine = new LastFlagChallengeEngine({ tribes, playerId: player.id });
  assert.equal(engine.heat.tribeKeys.includes(engine.byeTribeKey), false);
  let firstHeat;
  while (!firstHeat) {
    if (engine.awaitingPlayer) engine.take(1, player.id);
    else engine.advanceNpcTurn();
    firstHeat = engine.heatResults[0];
  }
  assert.equal(engine.heat.flagsRemaining, 21);
  assert.ok(engine.heat.tribeKeys.some(key => String(key) === String(firstHeat.losingTribeKey)));
  assert.ok(engine.heat.tribeKeys.some(key => String(key) === String(engine.byeTribeKey)));
  const result = play(engine);
  assert.equal(result.heatResults.length, 2);
  assert.equal(new Set(result.winningTribeKeys.map(String)).size, 2);
  assert.equal(tribes.filter(tribe => result.winningTribeKeys.some(key => String(key) === String(tribe.id))).length, 2);
  assert.equal(tribes.filter(tribe => String(tribe.id) === String(result.losingTribeKey)).length, 1);
  assert.ok(result.contestantPerformance[player.id].turns > 0);
  const byes = new Set(Array.from({ length: 12 }, (_, index) => {
    const varied = fixtures(3);
    varied.tribes[0].members[0].id = `variant-${index}`;
    return new LastFlagChallengeEngine({ tribes: varied.tribes, playerId: varied.player.id }).byeTribeKey;
  }));
  assert.ok(byes.size > 1, 'bye is determined by cast and round, never assigned permanently');
});

test('different player decisions diverge and a forced position can pay off', () => {
  const { tribes, player } = fixtures(2, { size: 1, strong: true });
  const left = new LastFlagChallengeEngine({ tribes, playerId: player.id });
  const right = new LastFlagChallengeEngine({ tribes, playerId: player.id });
  // Both games see the same roster and NPC reasoning until the player's choice.
  while (!left.awaitingPlayer) {
    left.advanceNpcTurn();
    right.advanceNpcTurn();
  }
  const before = left.heat.flagsRemaining;
  left.take(1, player.id);
  right.take(3, player.id);
  assert.equal(left.heat.flagsRemaining, before - 1);
  assert.equal(right.heat.flagsRemaining, before - 3);
  assert.deepEqual(left.moves.slice(0, -1), right.moves.slice(0, -1));
  // One contestant per tribe makes the strategic choice wholly the player's.
  const result = play(left, engine => engine.heat.flagsRemaining % 4 || 1);
  assert.ok(result.contestantPerformance[player.id].turns >= 2);
});

test('a player taking one versus three can change the actual immunity winner', () => {
  const { tribes, player } = fixtures(2, { size: 1, strong: true });
  player.id = 't1-19';
  tribes[1].members[0].id = 't2-19';
  const patient = new LastFlagChallengeEngine({ tribes, playerId: player.id });
  const aggressive = new LastFlagChallengeEngine({ tribes, playerId: player.id });
  const firstResult = play(patient, () => 1);
  const secondResult = play(aggressive, engine => Math.min(3, engine.heat.flagsRemaining));
  assert.equal(firstResult.winningTribeKey, player.tribeId);
  assert.notEqual(secondResult.winningTribeKey, player.tribeId);
  assert.ok(firstResult.contestantPerformance[player.id].turns > 0);
  assert.ok(secondResult.contestantPerformance[player.id].turns > 0);
});

test('Season Engine receives the winning keys for safe and unsafe tribal paths', () => {
  for (const playerTribeWon of [true, false]) {
    const { tribes, survivors, player } = fixtures(2);
    const gm = {
      day: 2, tribes, survivors, player, isMerged: false, flags: {},
      getPlayerTribe: () => tribes[0],
      eliminateSurvivor(target) { target.isOut = true; tribes.forEach(tribe => { tribe.members = tribe.members.filter(member => member !== target); }); },
      resetTaskSimFlags() {}, updateTribeHealth() {},
      hasImmunity: () => false
    };
    const engine = new SeasonEngine(gm, { publish() {} }, { mergeAt: 2 });
    const winners = playerTribeWon ? [1] : [2];
    const result = normalizeChallengeResult({
      challengeDay: 2, challengeKey: 'last_flag', challengeType: 'tribal',
      winningTribeKeys: winners, losingTribeKey: playerTribeWon ? 2 : 1,
      playerTribeKey: 1, playerTribeWon
    });
    if (playerTribeWon) {
      assert.equal(engine.completeRound({ challengeResult: result }), true);
      assert.equal(survivors.filter(member => member.isOut).length, 1);
      assert.equal(gm.day, 3);
    } else {
      assert.equal(engine.completeRound({ challengeResult: result }), false);
      assert.equal(survivors.filter(member => member.isOut).length, 0);
      assert.equal(gm.day, 2);
    }
  }
});

function fakeElement(tag = 'div') {
  return {
    tag, children: [], attributes: {}, dataset: {}, disabled: false,
    style: { setProperty(key, value) { this[key] = value; } },
    setAttribute(key, value) { this.attributes[key] = value; },
    removeAttribute(key) { delete this.attributes[key]; },
    addEventListener(key, callback) { this.listeners ||= {}; this.listeners[key] = callback; },
    appendChild(child) { this.children.push(child); child.parentElement = this; return child; },
    removeChild(child) { this.children.splice(this.children.indexOf(child), 1); child.parentElement = null; },
    get firstChild() { return this.children[0] || null; },
    get textContent() { return this._text ?? this.children.map(child => child.textContent).join(''); },
    set textContent(value) { this._text = String(value); this.children = []; },
    click() { if (!this.disabled) this.listeners?.click?.(); }
  };
}

function findElement(root, predicate) {
  if (predicate(root)) return root;
  for (const child of root.children) {
    const found = findElement(child, predicate);
    if (found) return found;
  }
  return null;
}

test('Round 2 ceremony flows directly into interactive play and canonical completion once', () => {
  const oldDocument = globalThis.document;
  const keys = ['day', 'gamePhase', 'gameState', 'tribes', 'survivors', 'player', 'isMerged',
    'gameHistory', 'seasonEngine', 'lastChallengeResult', 'advanceGamePhase', 'setGameState'];
  const saved = Object.fromEntries(keys.map(key => [key, gameManager[key]]));
  const previousResults = challengeManager.serialize();
  const previousScreen = window.challengeScreen;
  const { tribes, survivors, player } = fixtures();
  const container = fakeElement();
  const screen = new ChallengeScreen();
  try {
    globalThis.document = {
      createElement: fakeElement,
      createTextNode: value => { const node = fakeElement('#text'); node.textContent = value; return node; },
      getElementById: id => id === 'challenge-screen' ? container : null
    };
    gameManager.day = 2;
    gameManager.gamePhase = 'preChallenge';
    gameManager.tribes = tribes;
    gameManager.survivors = survivors;
    gameManager.player = player;
    gameManager.isMerged = false;
    gameManager.gameHistory = { tribals: [] };
    gameManager.seasonEngine = { state: { history: [] }, applyChallengeResult() {} };
    gameManager.advanceGamePhase = () => {
      gameManager.gamePhase = gameManager.gamePhase === 'preChallenge' ? 'challenge' : 'postChallenge';
    };
    gameManager.setGameState = state => { gameManager.gameState = state; };
    screen.setup();
    assert.equal(screen.currentView, 'challenge-intro');
    assert.equal(findElement(container, node => node.textContent === 'Challenge beach') != null, true);
    let introClicks = 0;
    while (screen.currentView === 'challenge-intro' && introClicks++ < 10) {
      findElement(container, node => node.className === 'last-flag-button last-flag-next').click();
    }
    assert.equal(screen.currentView, 'last-flag-challenge');
    assert.ok(screen.activeChallengeView);
    const view = screen.activeChallengeView;
    let playerTurns = 0;
    let guard = 0;
    while (!view.engine.completed && guard++ < 22) {
      if (view.engine.awaitingPlayer) {
        playerTurns += 1;
        const action = findElement(container, node => node.textContent === 'TAKE 1');
        assert.ok(action, 'player decision is rendered');
        action.click();
      } else {
        view.afterMove(view.engine.advanceNpcTurn());
      }
    }
    assert.ok(playerTurns > 0);
    assert.ok(view.engine.completed);
    findElement(container, node => node.textContent === 'Return to camp').click();
    assert.equal(gameManager.gameState, 'camp');
    assert.equal(gameManager.gamePhase, 'postChallenge');
    assert.equal(challengeManager.getChallengeResult(2)?.challengeKey, 'last_flag');
    const priorResult = gameManager.lastChallengeResult;
    screen.completeChallenge(priorResult);
    assert.equal(gameManager.lastChallengeResult, priorResult);
  } finally {
    screen.teardown();
    for (const key of keys) gameManager[key] = saved[key];
    challengeManager.deserialize(previousResults);
    globalThis.document = oldDocument;
    window.challengeScreen = previousScreen;
  }
});
