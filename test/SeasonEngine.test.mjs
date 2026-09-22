import test from 'node:test';
import assert from 'node:assert/strict';
import SeasonEngine from '../src/modules/core/SeasonEngine.js';
globalThis.window = globalThis.window || {};
const { gameManager } = await import('../src/modules/core/GameManager.js');
const { default: challengeManager } = await import('../src/modules/core/ChallengeManager.js');

const events = { publish() {} };
const survivor = (id, tribeId, extra = {}) => ({
  id, name: id, tribeId, physical: 50, mental: 50, social: 50, health: 80, ...extra
});

function game({ tribeCount = 2, count = 18, mergeAt = 12 } = {}) {
  const survivors = Array.from({ length: count }, (_, index) => (
    survivor(`s${index}`, (index % tribeCount) + 1, { isPlayer: index === 0 })
  ));
  const tribes = Array.from({ length: tribeCount }, (_, index) => ({
    id: index + 1, tribeId: index + 1, tribeName: `T${index + 1}`,
    members: survivors.filter(member => member.tribeId === index + 1),
    resources: { water: 50, fire: 50, shelter: 50 }
  }));
  const gm = {
    day: 1, survivors, tribes, tribeCount, mergeAt,
    isMerged: false, isTribesShuffled: false, player: survivors[0],
    getPlayerTribe() { return this.tribes.find(tribe => tribe.members.some(member => member.isPlayer)); },
    _calculateTribeAttributes() { return {}; },
    initializeWaterPlanForTribe() {},
    eliminateSurvivor(target) {
      target.isOut = true;
      this.tribes.forEach(tribe => { tribe.members = tribe.members.filter(member => member.id !== target.id); });
    },
    resetTaskSimFlags() {},
    updateTribeHealth() {}
  };
  gm.seasonEngine = new SeasonEngine(gm, events, { mergeAt, swapAt: 14 });
  return gm;
}

test('two-tribe rounds eliminate one contestant and merge canonically', () => {
  const gm = game();
  const engine = gm.seasonEngine;
  for (let i = 0; i < 6; i++) {
    const target = engine.getActiveSurvivors().find(member => !member.isPlayer);
    gm.eliminateSurvivor(target);
    engine.completeRound({ challengeResult: { playerTribeWon: false } });
  }
  assert.equal(gm.isMerged, true);
  assert.equal(gm.tribes.length, 1);
  assert.equal(engine.validateSeasonState().valid, true);
});

test('three tribes safely swap to two without losing or duplicating players', () => {
  const gm = game({ tribeCount: 3, count: 15 });
  gm.eliminateSurvivor(gm.survivors[14]);
  gm.seasonEngine.maybeTransition();
  assert.equal(gm.isTribesShuffled, true);
  assert.equal(gm.tribes.length, 2);
  assert.equal(new Set(gm.tribes.flatMap(tribe => tribe.members).map(member => member.id)).size, 14);
  assert.equal(gm.seasonEngine.validateSeasonState().valid, true);
  while (!gm.isMerged) {
    const target = gm.seasonEngine.getActiveSurvivors().find(member => !member.isPlayer);
    gm.eliminateSurvivor(target);
    gm.seasonEngine.completeRound({ challengeResult: { challengeDay: gm.day, playerTribeWon: false } });
  }
  assert.equal(gm.tribes.length, 1);
  assert.equal(gm.seasonEngine.validateSeasonState().valid, true);
});

test('a safe player round resolves an off-screen NPC tribal', () => {
  const gm = game({ count: 6, mergeAt: 3 });
  const before = gm.seasonEngine.getActivePlayerCount();
  gm.seasonEngine.completeRound({
    challengeResult: { playerTribeWon: true, losingTribeKey: 2 }
  });
  assert.equal(gm.seasonEngine.getActivePlayerCount(), before - 1);
  assert.notEqual(gm.player.isOut, true);
});

test('player-loss completion advances exactly once', () => {
  const gm = game();
  gm.seasonEngine.completeRound({ challengeResult: { challengeDay: 1, playerTribeWon: false } });
  assert.equal(gm.day, 2);
  gm.seasonEngine.completeRound({ challengeResult: { challengeDay: 1, playerTribeWon: false } });
  assert.equal(gm.day, 2);
});

test('a completed visible Tribal cannot cause a second elimination', () => {
  const gm = game({ count: 8, mergeAt: 4 });
  const eliminated = gm.seasonEngine.getActiveSurvivors().find(member => !member.isPlayer);
  gm.eliminateSurvivor(eliminated);
  const afterTribal = gm.seasonEngine.getActivePlayerCount();
  gm.seasonEngine.completeRound({
    challengeResult: {
      challengeDay: 1,
      challengeType: 'tribal',
      winningTribeKeys: [2],
      losingTribeKey: 1,
      playerTribeWon: false
    },
    elimination: eliminated
  });
  assert.equal(gm.seasonEngine.getActivePlayerCount(), afterTribal);
  assert.equal(gm.day, 2);
});

test('player elimination is terminal and marked out', () => {
  const gm = game({ count: 6 });
  gm.eliminateSurvivor(gm.player);
  assert.equal(gm.player.isOut, true);
  assert.equal(gm.seasonEngine.getActiveSurvivors().some(member => member.isPlayer), false);
});

test('season state survives swap and merge serialization', () => {
  const gm = game({ tribeCount: 3, count: 15 });
  gm.seasonEngine.swap(2);
  const saved = gm.seasonEngine.serialize();
  const restored = game({ tribeCount: 2, count: 15 });
  restored.seasonEngine.deserialize(saved);
  assert.equal(restored.seasonEngine.state.swapCount, 1);
  gm.seasonEngine.merge();
  const merged = gm.seasonEngine.serialize();
  restored.seasonEngine.deserialize(merged);
  assert.equal(restored.seasonEngine.state.mergeCount, 1);
});

test('merged individual immunity still routes one elimination and clears temporary immunity', () => {
  const gm = game({ count: 6, mergeAt: 6 });
  gm.seasonEngine.merge();
  const winner = gm.survivors.find(member => member.isPlayer);
  gm.seasonEngine.completeRound({
    challengeResult: {
      challengeDay: 1,
      challengeType: 'individual',
      individualWinnerId: winner.id,
      playerTribeWon: true
    }
  });
  assert.equal(gm.seasonEngine.getActivePlayerCount(), 5);
  assert.equal(winner.hasImmunity, false);
  assert.equal(gm.survivors.some(member => member.isOut && member.id !== winner.id), true);
});

test('individual immunity is active before Tribal and cleared after the round', () => {
  const gm = game({ count: 7, mergeAt: 7 });
  gm.seasonEngine.merge();
  const winner = gm.survivors.find(member => !member.isPlayer);
  const result = {
    challengeDay: 1,
    challengeType: 'individual',
    individualWinnerId: winner.id,
    playerTribeWon: false
  };
  gm.seasonEngine.applyChallengeResult(result);
  assert.equal(winner.hasImmunity, true);
  const eliminated = gm.survivors.find(member => member.id !== winner.id && !member.isPlayer);
  gm.eliminateSurvivor(eliminated);
  gm.seasonEngine.completeRound({ challengeResult: result, elimination: eliminated });
  assert.equal(winner.hasImmunity, false);
  assert.equal(winner.isOut, undefined);
});

test('reaching the configured endgame stops ordinary day progression', () => {
  const gm = game({ count: 5, mergeAt: 5 });
  gm.seasonEngine.merge();
  gm.gamePhase = 'postChallenge';
  gm.flags = {};
  const eliminated = gm.survivors.find(member => !member.isPlayer);
  gm.eliminateSurvivor(eliminated);
  gm.seasonEngine.completeRound({
    challengeResult: {
      challengeDay: 1,
      challengeType: 'individual',
      individualWinnerId: gm.player.id,
      playerTribeWon: true
    },
    elimination: eliminated
  });
  assert.equal(gm.seasonEngine.state.endgameReached, true);
  assert.equal(gm.gamePhase, 'endgame');
  assert.equal(gm.day, 1);
  assert.equal(gm.finalists.length, 4);
  assert.equal(gm.flags.seasonEndgameReached, true);
});

test('multi-winner tribal result selects an unsafe non-winning tribe', () => {
  const gm = game({ tribeCount: 3, count: 9 });
  gm.seasonEngine.completeRound({
    challengeResult: {
      challengeDay: 1,
      challengeType: 'tribal',
      winningTribeKeys: [1, 2],
      playerTribeWon: true
    }
  });
  const eliminated = gm.survivors.find(member => member.isOut);
  assert.equal(eliminated.tribeId, 3);
});

test('GameManager restore rebuilds canonical survivor identity and filters eliminated members', () => {
  const original = gameManager.createSavePayload();
  const originalScreenUpdate = gameManager._updateScreenForState;
  gameManager._updateScreenForState = () => {};
  const player = { id: 'restore-player', isPlayer: true, laziness: 0 };
  const npc = { id: 'restore-npc', isOut: false, laziness: 0 };
  const eliminated = { id: 'restore-out', isOut: true, laziness: 0 };
  const payload = {
    gameManager: {
      isInitialized: true, day: 4, gameState: 'camp', gamePhase: 'preChallenge',
      isMerged: false,
      tribes: [{ id: 1, tribeId: 1, tribeName: 'A', members: [player, npc, eliminated] }],
      survivors: [player, npc, eliminated], player, playerId: player.id, jury: [], state: {}
    },
    systems: {}
  };
  assert.equal(gameManager.restoreSavePayload(payload), true);
  assert.equal(gameManager.player, gameManager.survivors.find(member => member.id === player.id));
  assert.equal(gameManager.tribes[0].members[0], gameManager.survivors.find(member => member.id === player.id));
  assert.equal(gameManager.tribes[0].members.some(member => member.isOut), false);
  assert.equal(gameManager.state.seasonValidation.valid, true);
  gameManager.restoreSavePayload(original);
  gameManager._updateScreenForState = originalScreenUpdate;
});

test('merged state overrides an exact tribal calendar entry', () => {
  const priorMerged = gameManager.isMerged;
  const priorTribes = gameManager.tribes;
  const priorDay = gameManager.day;
  gameManager.isMerged = true;
  gameManager.day = 2;
  gameManager.tribes = [{ id: 1, members: [{ id: 'player' }] }];
  assert.equal(challengeManager.getCurrentChallenge().type, 'individual');
  gameManager.isMerged = priorMerged;
  gameManager.tribes = priorTribes;
  gameManager.day = priorDay;
});