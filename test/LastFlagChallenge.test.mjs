import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildChallengeArrival } from '../src/modules/core/ChallengeArrival.js';
import LastFlagChallengeEngine, { planLastFlagSitOuts, evaluateThreeTribeTakes } from '../src/modules/core/LastFlagChallengeEngine.js';
import { FLAG_COLORS, BOARD_FLAG_SLOTS, CINEMATIC_FLAG_SLOTS, tribeColorToken, selectLastFlagFieldColor, lastFlagAsset, LAST_FLAG_BOARD_ART, LAST_FLAG_INTRO_ART } from '../src/modules/core/LastFlagField.js';
import { normalizeChallengeResult } from '../src/modules/core/ChallengeResult.js';
import SeasonEngine from '../src/modules/core/SeasonEngine.js';
globalThis.window = globalThis.window || {};
const { gameManager } = await import('../src/modules/core/GameManager.js');
const { default: challengeManager } = await import('../src/modules/core/ChallengeManager.js');
const { default: ChallengeScreen } = await import('../src/modules/screens/ChallengeScreen.js');

function fixtures(count = 2, { playerTribe = 0, size = 4, strong = false } = {}) {
  const tribes = Array.from({ length: count }, (_, index) => ({
    id: index + 1, tribeId: index + 1, tribeName: `Tribe ${index + 1}`,
    tribeColor: ['red', 'green', 'purple'][index],
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
  assert.ok(scene.beats.findIndex(beat => beat.reveal) < scene.beats.findIndex(beat => beat.title === 'LAST FLAG'));
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

test('Jeff explains distinct two- and three-tribe final-flag rules', () => {
  for (const count of [2, 3]) {
    const cast = fixtures(count);
    const scene = buildChallengeArrival({ day: 2, tribes: cast.tribes, survivors: cast.survivors });
    const rules = scene.beats.find(beat => beat.title === 'The rules').text;
    const title = scene.beats.find(beat => beat.title === 'LAST FLAG');
    assert.ok(title.titleCard);
    assert.ok(scene.beats.find(beat => beat.title === 'Survivors Ready?').lineup);
    assert.doesNotMatch(rules + title.text, /heat|second immunity|start again|steps out|bye|draw/i);
    if (count === 3) {
      assert.match(rules, /final flag loses/);
      assert.match(title.text, /not be the tribe/);
    } else {
      assert.match(rules, /final flag wins immunity/);
      assert.match(title.text, /last flag wins immunity/);
    }
  }
});

test('field flag color excludes canonical competing colors and stays seeded for the challenge', () => {
  for (const count of [2, 3]) {
    const { tribes, player } = fixtures(count);
    const colors = Array.from({ length: 12 }, (_, index) => {
      const varied = structuredClone(tribes);
      varied[0].members[0].id = `variant-${index}`;
      const color = selectLastFlagFieldColor(varied, 2);
      assert.ok(FLAG_COLORS.includes(color));
      assert.ok(!varied.some(tribe => tribeColorToken(tribe) === color));
      assert.equal(new LastFlagChallengeEngine({ tribes: varied, playerId: player.id }).fieldFlagColor, color);
      return color;
    });
    assert.ok(new Set(colors).size > 1);
    assert.equal(FLAG_COLORS.filter(color => !tribes.some(tribe => tribeColorToken(tribe) === color)).length, 5 - count);
    assert.equal(selectLastFlagFieldColor(tribes, 2), selectLastFlagFieldColor(tribes, 2));
  }
  assert.equal(tribeColorToken({ tribeColor: 'red', color: 'blue' }), 'red');
  assert.equal(tribeColorToken({ tribeColor: '#d64541' }), 'red');
  assert.equal(tribeColorToken({ color: '#3498db' }), 'blue');
  assert.equal(tribeColorToken({ tribeColor: '#9b59b6' }), 'purple');
  assert.equal(tribeColorToken({ tribeColor: '#abcdef' }), null);
  const unknown = fixtures(2);
  unknown.tribes[0].tribeColor = '#abcdef';
  const warning = console.warn;
  try {
    let warned = false;
    console.warn = () => { warned = true; };
    const color = selectLastFlagFieldColor(unknown.tribes, 2);
    assert.ok(warned);
    assert.notEqual(color, 'green');
  } finally { console.warn = warning; }
});

test('the supplied art and fixed physical flag formation have one image coordinate system', () => {
  assert.equal(BOARD_FLAG_SLOTS.length, 21);
  assert.deepEqual(BOARD_FLAG_SLOTS.reduce((rings, slot) => ({ ...rings, [slot.ring]: (rings[slot.ring] || 0) + 1 }), {}),
    { outer: 14, inner: 6, center: 1 });
  assert.equal(new Set(BOARD_FLAG_SLOTS.map(slot => `${slot.x},${slot.y}`)).size, 21);
  assert.equal(CINEMATIC_FLAG_SLOTS.length, 21);
  assert.ok(BOARD_FLAG_SLOTS.every(slot => slot.x > 20 && slot.x < 80 && slot.y > 25 && slot.y < 75));
  assert.equal(LAST_FLAG_BOARD_ART, 'Assets/Challenge/LastFlag/last-flag-board.png');
  assert.equal(LAST_FLAG_INTRO_ART, 'Assets/Challenge/LastFlag/last-flag-intro.png');
  for (const path of [LAST_FLAG_BOARD_ART, LAST_FLAG_INTRO_ART, ...FLAG_COLORS.map(lastFlagAsset)]) {
    assert.ok(readFileSync(new URL(`../${path}`, import.meta.url)).length > 0);
  }
  const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
  assert.match(css, /\.last-flag-arena-space\s*\{[^}]*container-type: size/);
  assert.match(css, /\.last-flag-board-art\s*\{[^}]*object-fit: contain/);
  assert.doesNotMatch(css, /last-flag-field-(wide|portrait)\.png|flag-red\.png/);
  assert.ok(css.indexOf('.last-flag-scene {') < css.indexOf('.last-flag-game {'));
});

test('player tribe sit-out choice equalizes lineups and never benches the player', () => {
  const { tribes, player } = fixtures(2, { size: 4 });
  tribes[0].members.push({ id: 'extra', firstName: 'Extra', mental: 20, puzzles: 1, focus: 1 });
  const pending = planLastFlagSitOuts({ tribes, playerId: player.id });
  assert.equal(pending.playerChoicesNeeded, 1);
  assert.equal(pending.playerOptions.some(member => member.id === player.id), false);
  assert.throws(() => new LastFlagChallengeEngine({ tribes, playerId: player.id }), /Choose/);
  assert.throws(() => planLastFlagSitOuts({ tribes, playerId: player.id, playerSitOutIds: [player.id] }), /Invalid/);
  const chosen = tribes[0].members[0].id;
  const engine = new LastFlagChallengeEngine({ tribes, playerId: player.id, playerSitOutIds: [chosen] });
  assert.deepEqual(engine.sitOutIds, [chosen]);
  assert.deepEqual(Object.values(engine.lineups).map(ids => ids.length), [4, 4]);
  assert.ok(engine.lineups['1'].includes(player.id));
  assert.equal(engine.lineups['1'].includes(chosen), false);
  const result = play(engine);
  assert.deepEqual(result.sitOutIds, [chosen]);
  assert.ok(result.contestantPerformance[player.id].turns > 0);
  assert.ok(engine.moves.every(move => move.actorId !== chosen));
});

test('opponent sit-outs are deterministic and use the existing logic traits', () => {
  const { tribes, player } = fixtures(2, { size: 4 });
  tribes[1].members.push({ id: 'weak-fit', firstName: 'Weak', mental: 19, puzzles: 1, focus: 1 });
  const a = new LastFlagChallengeEngine({ tribes, playerId: player.id });
  const b = new LastFlagChallengeEngine({ tribes, playerId: player.id });
  assert.deepEqual(a.sitOutIds, ['weak-fit']);
  assert.deepEqual(a.sitOutIds, b.sitOutIds);
  assert.deepEqual(Object.values(a.lineups).map(ids => ids.length), [4, 4]);
  assert.ok(play(a).sitOutIds.includes('weak-fit'));
  assert.ok(a.moves.every(move => move.actorId !== 'weak-fit'));
});

test('three uneven tribes field equal teams on one board; out and sat players never act', () => {
  const { tribes, player } = fixtures(3, { size: 3 });
  tribes[0].members.push({ id: 'reserve-a', mental: 20, puzzles: 1, focus: 1 }, { id: 'reserve-b', mental: 25, puzzles: 2, focus: 2 });
  tribes[1].members.push({ id: 'reserve-c', mental: 20, puzzles: 1, focus: 1 });
  tribes[2].members.push({ id: 'voted-out', isOut: true });
  const plan = planLastFlagSitOuts({ tribes, playerId: player.id, playerSitOutIds: ['reserve-a', 'reserve-b'] });
  const engine = new LastFlagChallengeEngine({ tribes, playerId: player.id, playerSitOutIds: ['reserve-a', 'reserve-b'] });
  const originalBoard = engine.heat;
  const originalLineups = structuredClone(engine.lineups);
  assert.deepEqual(Object.values(engine.lineups).map(ids => ids.length), [3, 3, 3]);
  assert.deepEqual(plan.sitOutIds, ['reserve-a', 'reserve-b', 'reserve-c']);
  const result = play(engine);
  assert.equal(engine.heat, originalBoard);
  assert.equal(engine.moves.reduce((total, move) => total + move.taken, 0), 21);
  assert.deepEqual(engine.lineups, originalLineups);
  assert.deepEqual(result.sitOutIds, plan.sitOutIds);
  assert.ok(engine.moves.every(move => ![...result.sitOutIds, 'voted-out'].includes(move.actorId)));
  assert.ok(result.contestantPerformance[player.id].turns > 0);
});

test('three-tribe NPCs evaluate survival in cyclic turn order, with imperfect decisions', () => {
  const options = evaluateThreeTribeTakes(2, 0);
  assert.equal(options.find(option => option.take === 2).chances[0], 0);
  assert.equal(options.find(option => option.take === 1).chances[0], 1);
  assert.equal(options.find(option => option.take === 1).chances[1], 0);
  const player = { id: 'p0', mental: 25 };
  const strong = { id: 's0', mental: 45, puzzles: 10, focus: 9, leader: 9,
    teamPlayer: 85, gameplayStyle: 'Shadow Strategist' };
  const weak = { id: 'w0', mental: 25, puzzles: 2, focus: 2, gameplayStyle: 'Wildcard', risk: 9 };
  const tribes = [{ id: 1, members: [strong, weak] }, { id: 2, members: [player, { id: 'o0' }] },
    { id: 3, members: [{ id: 'x0' }, { id: 'y0' }] }];
  const engine = new LastFlagChallengeEngine({ tribes, playerId: player.id });
  const identical = new LastFlagChallengeEngine({ tribes, playerId: player.id });
  for (const game of [engine, identical]) {
    game.heat.turnTribeKey = 1;
    game.heat.flagsRemaining = 2;
  }
  assert.equal(engine.chooseNpcMove(), 1);
  assert.equal(engine.lastNpcDecision.recognized, true);
  assert.equal(identical.chooseNpcMove(), 1);
  engine.heat.positions['1'] = 1;
  assert.ok(engine.legalTakes.includes(engine.chooseNpcMove()));
  assert.equal(engine.lastNpcDecision.recognized, false);
  // Across real board states, a weak aggressive contestant can still choose the losing take.
  let mistakes = 0;
  for (const flags of [2, 3, 5, 6, 8, 9, 11, 14, 17, 20]) {
    engine.heat.flagsRemaining = flags;
    const choice = engine.chooseNpcMove();
    if (!engine.bestTakes(engine.heat, flags).includes(choice)) mistakes += 1;
  }
  assert.ok(mistakes > 0);
});

test('production-scale three-tribe thinkers beat weak instincts without becoming perfect', () => {
  const make = strong => new LastFlagChallengeEngine({ playerId: 'player', tribes: [
    { id: 1, tribeColor: 'red', members: [{ id: 'logic', mental: strong ? 45 : 25,
      puzzles: strong ? 10 : 2, focus: strong ? 9 : 2,
      gameplayStyle: strong ? 'Shadow Strategist' : 'Wildcard', risk: strong ? 3 : 9 }] },
    { id: 2, tribeColor: 'green', members: [{ id: 'player' }] },
    { id: 3, tribeColor: 'purple', members: [{ id: 'rival' }] }
  ] });
  const strong = make(true), weak = make(false), repeat = make(true);
  let strongGood = 0, weakGood = 0;
  for (let flags = 2; flags <= 21; flags += 1) {
    for (const engine of [strong, weak, repeat]) {
      engine.heat.turnTribeKey = 1;
      engine.heat.flagsRemaining = flags;
    }
    const strongChoice = strong.chooseNpcMove();
    const weakChoice = weak.chooseNpcMove();
    strongGood += Number(strong.bestTakes(strong.heat, flags).includes(strongChoice));
    weakGood += Number(weak.bestTakes(weak.heat, flags).includes(weakChoice));
    assert.equal(strongChoice, repeat.chooseNpcMove());
    if (flags === 2) { assert.equal(strongChoice, 1); assert.equal(weakChoice, 2); }
  }
  assert.ok(strongGood > weakGood);
  assert.ok(strongGood < 20);
  assert.ok(weakGood > 0);
});

test('any of three tribes taking the final flag loses to the other two, exactly once', () => {
  for (const loser of [1, 2, 3]) {
    const { tribes, player } = fixtures(3);
    const engine = new LastFlagChallengeEngine({ tribes, playerId: player.id });
    const board = engine.heat;
    engine.heat.turnTribeKey = loser;
    engine.heat.flagsRemaining = 1;
    const finalActor = engine.currentActor;
    const move = engine.take(1, finalActor.id);
    const result = engine.getResult();
    assert.equal(move.finalMove, true);
    assert.equal(engine.heat, board);
    assert.equal(engine.heat.flagsRemaining, 0);
    assert.equal(result.losingTribeKey, loser);
    assert.deepEqual(result.winningTribeKeys, [1, 2, 3].filter(key => key !== loser));
    assert.equal(result.playerTribeWon, loser !== 1);
    assert.equal(result.finalActorId, finalActor.id);
    assert.equal(result.contestantPerformance[finalActor.id].finalWinningMove, false);
    assert.equal(engine.take(1, finalActor.id), null);
  }
});

test('a completed three-tribe Last Flag sends only the final-flag tribe to Season Engine', () => {
  const { tribes, survivors, player } = fixtures(3, { size: 3 });
  const challenge = new LastFlagChallengeEngine({ tribes, playerId: player.id });
  challenge.heat.turnTribeKey = 3;
  challenge.heat.flagsRemaining = 1;
  challenge.take(1, challenge.currentActor.id);
  const result = normalizeChallengeResult(challenge.getResult());
  const gm = {
    day: 2, tribes, survivors, player, isMerged: false, flags: {},
    getPlayerTribe: () => tribes[0],
    eliminateSurvivor(target) {
      target.isOut = true;
      tribes.forEach(tribe => { tribe.members = tribe.members.filter(member => member !== target); });
    },
    resetTaskSimFlags() {}, updateTribeHealth() {}, hasImmunity: () => false
  };
  const season = new SeasonEngine(gm, { publish() {} }, { mergeAt: 2, swapAt: 2 });
  assert.equal(result.losingTribeKey, 3);
  assert.deepEqual(result.winningTribeKeys, [1, 2]);
  assert.equal(season.completeRound({ challengeResult: result }), true);
  assert.deepEqual(survivors.filter(member => member.isOut).map(member => member.tribeId), [3]);
  assert.equal(gm.day, 3);
  assert.equal(season.completeRound({ challengeResult: result }), false);
});

test('production-scale NPCs can discover a pattern and share it without making teammates perfect', () => {
  const make = n => {
    const strong = { id: `s${n}`, mental: 45, puzzles: 10, focus: 9, leader: 9,
      teamPlayer: 85, gameplayStyle: 'Shadow Strategist' };
    const mate = { id: `m${n}`, mental: 30, puzzles: 3, focus: 3,
      leader: 3, teamPlayer: 55, gameplayStyle: 'Balanced', risk: 8 };
    const player = { id: `p${n}`, mental: 32, puzzles: 5, focus: 5 };
    const tribes = [{ id: 1, members: [strong, mate, { id: `o${n}` }] },
      { id: 2, members: [{ id: `x${n}` }, player, { id: `z${n}` }] }];
    const engine = new LastFlagChallengeEngine({ tribes, playerId: player.id });
    engine.heat.turnTribeKey = 1;
    engine.heat.flagsRemaining = 10;
    return engine;
  };
  for (const [id, follows] of [[11, true], [1, false]]) {
    const engine = make(id), identical = make(id);
    const callout = engine.advanceNpcTurn(), repeat = identical.advanceNpcTurn();
    assert.equal(callout.taken, 2);
    assert.equal(callout.recognizedPattern, true);
    assert.match(callout.callout, /I see it/);
    assert.deepEqual(callout, repeat, 'identical state gives the same decision and callout');
    // Inspect the next teammate's reasoning on the same board after hearing the callout.
    for (const copy of [engine, identical]) {
      copy.heat.turnTribeKey = 1;
      copy.heat.flagsRemaining = 10;
      copy.heat.positions['1'] = 1;
    }
    const teamChoice = engine.chooseNpcMove();
    assert.equal(engine.lastNpcDecision.followedPlan, follows);
    if (follows) assert.equal(teamChoice, 2);
    else assert.notEqual(teamChoice, 2);
    identical.tribeAwareness['1'] = null;
    const soloChoice = identical.chooseNpcMove();
    assert.equal(identical.lastNpcDecision.followedPlan, false);
    assert.notEqual(soloChoice, 2);
  }
  const weak = make(1);
  weak.heat.positions['1'] = 1;
  weak.heat.flagsRemaining = 10;
  assert.notEqual(weak.chooseNpcMove(), 2);
  assert.equal(weak.lastNpcDecision.recognized, false);
  assert.equal(weak.advanceNpcTurn().callout, undefined, 'unaware teammates never issue informed callouts');
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
  assert.equal(result.startingTribeKey, engine.heat.startingTribeKey);
  assert.equal(result.contestantPerformance[player.id].turns > 0, true);
  assert.equal(engine.advanceNpcTurn(), null);
  assert.equal(engine.take(1, result.finalActorId), null);
  assert.equal(engine.getResult().totalTurns, result.totalTurns);
  assert.equal(engine.getResult().finalActorId, result.finalActorId);
});

test('all three tribes cycle on one continuous 21-flag board with fair stable starter', () => {
  const { tribes, player } = fixtures(3);
  const engine = new LastFlagChallengeEngine({ tribes, playerId: player.id });
  const board = engine.heat;
  assert.deepEqual(board.tribeKeys, [1, 2, 3]);
  assert.equal('hasSecondHeat' in engine, false);
  const cycle = [board.turnTribeKey];
  for (let i = 0; i < 6; i += 1) {
    const actor = engine.currentActor;
    engine.take(1, actor.id);
    cycle.push(board.turnTribeKey);
  }
  assert.deepEqual(cycle.slice(0, 3), cycle.slice(3, 6));
  const result = play(engine);
  assert.equal(engine.heat, board);
  assert.equal(board.flagsRemaining, 0);
  assert.equal(engine.moves.reduce((sum, move) => sum + move.taken, 0), 21);
  assert.equal(result.winningTribeKeys.length, 2);
  assert.equal(result.losingTribeKey, engine.moves.at(-1).tribeKey);
  assert.ok(result.winningTribeKeys.every(key => key !== result.losingTribeKey));
  assert.ok(result.contestantPerformance[player.id].turns > 0);
  const starters = new Set(Array.from({ length: 12 }, (_, index) => {
    const varied = fixtures(3);
    varied.tribes[0].members[0].id = `variant-${index}`;
    return new LastFlagChallengeEngine({ tribes: varied.tribes, playerId: varied.player.id }).heat.startingTribeKey;
  }));
  assert.ok(starters.size > 1);
  assert.equal(new LastFlagChallengeEngine({ tribes, playerId: player.id }).heat.startingTribeKey, board.startingTribeKey);
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

function findElements(root, predicate) {
  return [ ...(predicate(root) ? [root] : []), ...root.children.flatMap(child => findElements(child, predicate)) ];
}

function withChallengeScreen({ tribes, survivors, player }, run, { day = 2 } = {}) {
  const oldDocument = globalThis.document;
  const keys = ['day', 'gamePhase', 'gameState', 'tribes', 'survivors', 'player', 'isMerged',
    'gameHistory', 'seasonEngine', 'lastChallengeResult', 'advanceGamePhase', 'setGameState'];
  const saved = Object.fromEntries(keys.map(key => [key, gameManager[key]]));
  const previousResults = challengeManager.serialize();
  const previousScreen = window.challengeScreen;
  const container = fakeElement();
  const screen = new ChallengeScreen();
  try {
    globalThis.document = {
      createElement: fakeElement,
      createTextNode: value => { const node = fakeElement('#text'); node.textContent = value; return node; },
      getElementById: id => id === 'challenge-screen' ? container : null
    };
    gameManager.day = day;
    gameManager.gamePhase = 'challenge';
    gameManager.tribes = tribes;
    gameManager.survivors = survivors;
    gameManager.player = player;
    gameManager.isMerged = false;
    gameManager.gameHistory = { tribals: [] };
    gameManager.seasonEngine = { state: { history: [] }, applyChallengeResult() {} };
    gameManager.advanceGamePhase = () => { gameManager.gamePhase = 'postChallenge'; };
    gameManager.setGameState = state => { gameManager.gameState = state; };
    screen.setup();
    run(screen, container);
  } finally {
    screen.teardown();
    for (const key of keys) gameManager[key] = saved[key];
    challengeManager.deserialize(previousResults);
    globalThis.document = oldDocument;
    window.challengeScreen = previousScreen;
  }
}

function advanceCeremony(screen, container) {
  let guard = 0;
  while (screen.currentView === 'challenge-intro' && guard++ < 12) {
    const next = findElement(container, node => node.className === 'last-flag-button last-flag-next');
    assert.ok(next, 'ceremony should offer a next beat');
    next.click();
  }
  assert.equal(screen.currentView, 'last-flag-challenge');
}

test('Last Flag remains scheduled for day 2 yet its ceremony and routing work on a later tribal day', () => {
  assert.equal(challengeManager.challenges.get(2).challengeKey, 'last_flag');
  const previous = challengeManager.challenges.get(4);
  challengeManager.challenges.set(4, { ...challengeManager.challenges.get(2) });
  try {
    withChallengeScreen(fixtures(), (screen, container) => {
      assert.match(container.textContent, /DAY 4/);
      advanceCeremony(screen, container);
      assert.equal(screen.currentView, 'last-flag-challenge');
      assert.equal(screen.activeChallengeView.engine.day, 4);
      assert.match(container.textContent, /DAY 4 · LAST FLAG/);
      const result = play(screen.activeChallengeView.engine);
      assert.equal(result.challengeDay, 4);
      assert.equal(result.challengeKey, 'last_flag');
    }, { day: 4 });
  } finally {
    challengeManager.challenges.set(4, previous);
  }
});

test('the ceremony stages title reveal and all participating lineups before Survivors Ready', () => {
  withChallengeScreen(fixtures(3), (screen, container) => {
    let steps = 0;
    while (!findElement(container, node => node.className?.includes('last-flag-title-card')) && steps++ < 10) {
      findElement(container, node => node.className === 'last-flag-button last-flag-next').click();
    }
    assert.ok(findElement(container, node => node.textContent === 'LAST FLAG'));
    findElement(container, node => node.className === 'last-flag-button last-flag-next').click();
    assert.ok(findElement(container, node => node.textContent === 'Survivors Ready?'));
    const pregame = findElement(container, node => node.className === 'last-flag-pregame-lineups');
    assert.ok(pregame);
    assert.equal(pregame.children.length, 3);
    assert.match(pregame.textContent, /YOU/);
    const introArt = findElement(container, node => node.attributes.src === LAST_FLAG_INTRO_ART);
    assert.ok(introArt);
    const cinematicFlags = findElements(container, node => node.className === 'last-flag-cinematic-flag');
    assert.equal(cinematicFlags.length, 21);
    const introColor = cinematicFlags[0].style['--flag-art'];
    assert.ok(cinematicFlags.every(flag => flag.style['--flag-art'] === introColor));
    advanceCeremony(screen, container);
    assert.equal(screen.activeChallengeView.engine.heat.tribeKeys.length, 3);
    assert.ok(findElement(container, node => node.attributes.src === LAST_FLAG_BOARD_ART));
    const boardFlags = findElements(container, node => node.className?.includes('last-flag-pennant'));
    assert.equal(boardFlags.length, 21);
    assert.ok(boardFlags.every(flag => flag.style['--flag-art'] === introColor));
  });
});

test('each Take animates exactly its flags while the board count follows the engine', () => {
  for (const count of [1, 2, 3]) {
    withChallengeScreen(fixtures(2), (screen, container) => {
      advanceCeremony(screen, container);
      const view = screen.activeChallengeView;
      while (!view.engine.awaitingPlayer) view.afterMove(view.engine.advanceNpcTurn());
      view.engine.heat.flagsRemaining = 7;
      view.render();
      assert.equal(findElements(container, node => node.className?.includes('last-flag-pennant') && !node.className.includes('taken')).length, 7);
      const button = findElement(container, node => node.textContent === `TAKE ${count}`);
      button.click();
      assert.equal(view.engine.heat.flagsRemaining, 7 - count);
      assert.equal(findElements(container, node => node.className?.includes('last-flag-pennant') && node.className.includes('pulling')).length, count);
      assert.equal(findElements(container, node => node.className?.includes('last-flag-pennant') && !node.className.includes('taken')).length, 7 - count);
      assert.match(container.textContent, new RegExp(`${7 - count} FLAGS REMAINING`));
    });
  }
});

test('Jeff offers the player an NPC sit-out choice and passes it to Last Flag', () => {
  const cast = fixtures(2);
  cast.tribes[0].members.push({ id: 'extra', firstName: 'Extra', mental: 20, puzzles: 1, focus: 1 });
  cast.survivors = cast.tribes.flatMap(tribe => tribe.members);
  withChallengeScreen(cast, (screen, container) => {
    let guard = 0;
    while (!findElement(container, node => node.textContent === 'Sitting out') && guard++ < 10) {
      findElement(container, node => node.className === 'last-flag-button last-flag-next').click();
    }
    assert.ok(findElement(container, node => node.textContent === 'Sitting out'));
    assert.equal(findElement(container, node => node.textContent === cast.player.firstName), null,
      'player is not offered as a sit-out');
    assert.equal(findElement(container, node => node.className === 'last-flag-button last-flag-next'), null,
      'play cannot begin until a teammate is selected');
    findElement(container, node => node.tag === 'button' && node.textContent === 'Extra').click();
    assert.match(container.textContent, /Tribe 1 sits out: Extra/);
    advanceCeremony(screen, container);
    assert.deepEqual(screen.activeChallengeView.engine.sitOutIds, ['extra']);
    assert.deepEqual(Object.values(screen.activeChallengeView.engine.lineups).map(ids => ids.length), [4, 4]);
  });
});

test('Jeff announces deterministic opponent sit-out without asking the player to choose', () => {
  const cast = fixtures(2);
  cast.tribes[1].members.push({ id: 'weak-fit', firstName: 'Weak', mental: 19, puzzles: 1, focus: 1 });
  cast.survivors = cast.tribes.flatMap(tribe => tribe.members);
  withChallengeScreen(cast, (screen, container) => {
    let guard = 0;
    while (!findElement(container, node => node.textContent === 'Sitting out') && guard++ < 10) {
      findElement(container, node => node.className === 'last-flag-button last-flag-next').click();
    }
    assert.match(container.textContent, /Tribe 2 sits out: Weak/);
    assert.ok(findElement(container, node => node.className === 'last-flag-button last-flag-next'));
    advanceCeremony(screen, container);
    assert.deepEqual(screen.activeChallengeView.engine.sitOutIds, ['weak-fit']);
  });
});

test('take controls are legal only on the current player turn and ignore repeated activation', () => {
  withChallengeScreen(fixtures(), (screen, container) => {
    advanceCeremony(screen, container);
    const view = screen.activeChallengeView;
    while (!view.engine.awaitingPlayer) {
      assert.equal(findElement(container, node => node.textContent === 'TAKE 1'), null);
      view.afterMove(view.engine.advanceNpcTurn());
    }
    view.engine.heat.flagsRemaining = 2;
    view.render();
    const takeOne = findElement(container, node => node.textContent === 'TAKE 1');
    const takeTwo = findElement(container, node => node.textContent === 'TAKE 2');
    const takeThree = findElement(container, node => node.textContent === 'TAKE 3');
    assert.ok(takeOne && takeTwo && takeThree);
    assert.equal(takeThree.disabled, true);
    const before = view.engine.moves.length;
    takeOne.click();
    takeOne.click();
    assert.equal(view.engine.moves.length, before + 1);
    assert.equal(view.engine.heat.flagsRemaining, 1);
    assert.equal(findElement(container, node => node.textContent === 'TAKE 1'), null);
  });
});

test('Jeff result ceremony names both immune tribes and sends one result on Continue', () => {
  withChallengeScreen(fixtures(3), (screen, container) => {
    advanceCeremony(screen, container);
    const view = screen.activeChallengeView;
    view.engine.heat.turnTribeKey = 3;
    view.engine.heat.flagsRemaining = 1;
    view.afterMove(view.engine.take(1, view.engine.currentActor.id));
    view.finalPause = false;
    view.render();
    assert.match(container.textContent, /TWO TRIBES WIN IMMUNITY/);
    assert.match(container.textContent, /Tribe 1 wins tribal immunity/);
    assert.match(container.textContent, /Tribe 2 wins tribal immunity/);
    assert.match(container.textContent, /Tribe 3.*Tribal Council/);
    assert.ok(findElement(container, node => node.className === 'last-flag-result-art'));
    let applied = 0;
    gameManager.seasonEngine.applyChallengeResult = () => { applied += 1; };
    const button = findElement(container, node => node.textContent === 'CONTINUE');
    button.click(); button.click();
    assert.equal(applied, 1);
    assert.equal(gameManager.gameState, 'camp');
    assert.deepEqual(challengeManager.getChallengeResult(2).winningTribeKeys, [1, 2]);
  });
});

test('two-tribe Jeff result names final-flag winner and sole Tribal tribe', () => {
  withChallengeScreen(fixtures(2), (screen, container) => {
    advanceCeremony(screen, container);
    const view = screen.activeChallengeView;
    view.engine.heat.turnTribeKey = 1;
    view.engine.heat.flagsRemaining = 1;
    view.afterMove(view.engine.take(1, view.engine.currentActor.id));
    view.finalPause = false;
    view.render();
    assert.match(container.textContent, /Tribe 1 takes the final flag and wins immunity/);
    assert.match(container.textContent, /Tribe 1 wins tribal immunity/);
    assert.match(container.textContent, /Tribe 2.*Tribal Council/);
    assert.equal(view.engine.getResult().winningTribeKeys.length, 1);
  });
});

test('non-optimal player move receives neutral narration; only a real NPC callout appears', () => {
  const cast = fixtures(2);
  withChallengeScreen(cast, (screen, container) => {
    advanceCeremony(screen, container);
    const view = screen.activeChallengeView;
    while (!view.engine.awaitingPlayer) view.afterMove(view.engine.advanceNpcTurn());
    view.engine.heat.flagsRemaining = 10;
    const move = view.engine.take(1, cast.player.id);
    assert.equal(move.mistake, true);
    view.afterMove(move);
    const line = findElement(container, node => node.className === 'last-flag-commentary');
    assert.equal(line.textContent, `JEFF: ${move.actorName} takes 1. 9 left.`);
    assert.doesNotMatch(line.textContent, /call|mistake|wrong|pattern/i);
    view.lastMove = { ...move, actorName: 'Strategist', recognizedPattern: true,
      mistake: false, callout: '“I see it. Stay with me!”' };
    view.render();
    assert.match(findElement(container, node => node.className === 'last-flag-commentary').textContent, /Strategist: “I see it/);
  });
});

test('the final three-tribe pull stays on the original board before Jeff result', () => {
  withChallengeScreen(fixtures(3), (screen, container) => {
    advanceCeremony(screen, container);
    const view = screen.activeChallengeView;
    const board = view.engine.heat;
    view.engine.heat.flagsRemaining = 2;
    const actor = view.engine.currentActor;
    view.afterMove(view.engine.take(1, actor.id));
    assert.equal(view.engine.heat, board);
    assert.equal(view.engine.heat.flagsRemaining, 1);
    assert.equal(view.engine.completed, false);
    const finalActor = view.engine.currentActor;
    view.afterMove(view.engine.take(1, finalActor.id));
    assert.equal(view.engine.heat, board);
    assert.equal(view.engine.heat.flagsRemaining, 0);
    assert.match(container.textContent, /TAKES THE FINAL FLAG/);
    assert.match(container.textContent, /LOSES/);
    assert.doesNotMatch(container.textContent, /SECOND IMMUNITY|Fresh flags|Heat 2/);
    view.finalPause = false;
    view.render();
    assert.match(container.textContent, /Tribal Council/);
  });
});

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
    view.finalPause = false;
    view.render();
    findElement(container, node => node.textContent === 'CONTINUE').click();
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
