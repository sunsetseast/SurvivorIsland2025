import test from 'node:test';
import assert from 'node:assert/strict';
import SeasonEngine from '../src/modules/core/SeasonEngine.js';
import { normalizeChallengeResult } from '../src/modules/core/ChallengeResult.js';
import TribalCouncilSystem from '../src/modules/systems/TribalCouncilSystem.js';
import timerManager from '../src/modules/utils/TimerManager.js';
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
     hasImmunity(member) {
       return Boolean(member?.hasImmunity || member?.isImmune || member?.immunity?.individual);
     },
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
  const history = gm.seasonEngine.state.history.find(entry => entry.type === 'roundComplete');
  assert.equal(history.eliminationType, 'off-screen-npc-tribal');
  assert.equal(history.tribalMode, 'offscreen');
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
  const history = gm.seasonEngine.state.history.find(entry => entry.type === 'roundComplete');
  assert.equal(history.eliminationType, 'vote');
  assert.equal(history.tribalMode, 'visible');
  assert.ok(history.attendees.includes(eliminated.id));
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

test('merged individual immunity waits for visible Tribal before eliminating or completing', () => {
  const gm = game({ count: 6, mergeAt: 6 });
  gm.seasonEngine.merge();
  const winner = gm.survivors.find(member => member.isPlayer);
   const result = {
     challengeDay: 1,
     challengeType: 'individual',
     individualWinnerId: winner.id,
     playerTribeWon: false
   };
   gm.seasonEngine.applyChallengeResult(result);
   assert.equal(gm.seasonEngine.completeRound({ challengeResult: result }), false);
   assert.equal(gm.seasonEngine.getActivePlayerCount(), 6);
   assert.equal(gm.day, 1);
   assert.equal(winner.hasImmunity, true);
   const eliminated = gm.survivors.find(member => member.id !== winner.id);
   gm.eliminateSurvivor(eliminated);
   assert.equal(gm.seasonEngine.completeRound({ challengeResult: result, elimination: eliminated }), true);
   assert.equal(gm.seasonEngine.getActivePlayerCount(), 5);
   assert.equal(gm.day, 2);
   assert.equal(winner.hasImmunity, false);
   assert.equal(gm.survivors.filter(member => member.isOut).length, 1);
   const history = gm.seasonEngine.state.history.find(entry => entry.type === 'roundComplete');
   assert.ok(history.attendees.includes(winner.id));
   assert.notEqual(history.eliminatedId, winner.id);
   assert.equal(history.eliminationType, 'vote');
   assert.equal(history.tribalMode, 'visible');
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
  const history = gm.seasonEngine.state.history.find(entry => entry.type === 'roundComplete');
  assert.ok(history.attendees.includes(winner.id));
  assert.notEqual(history.eliminatedId, winner.id);
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

test('challenge normalization preserves First Contact and separates individual immunity', () => {
  const gm = game();
  const firstContact = normalizeChallengeResult({
    challengeDay: 1, challengeKey: 'first_contact', challengeType: 'tribal',
    winningTribeKeys: [1], playerTribeWon: true
  }, { gameManager: gm });
  assert.equal(firstContact.challengeKey, 'first_contact');
  assert.equal(firstContact.playerTribeWon, true);
  const individual = normalizeChallengeResult({
    challengeDay: 2, challengeType: 'individual',
    individualWinnerId: gm.player.id, playerTribeWon: true
  }, { gameManager: gm });
  assert.equal(individual.playerTribeWon, false);
  assert.equal(individual.playerWonIndividualImmunity, true);
});

test('three-tribe challenge gives second-place player tribe immunity', () => {
  const gm = game({ tribeCount: 3, count: 9 });
  gm.player.isPlayer = false;
  gm.tribes[1].members[0].isPlayer = true;
  gm.player = gm.tribes[1].members[0];
  const result = gm.seasonEngine.resolveChallenge({ random: () => 0.5 });
  assert.deepEqual(result.winningTribeKeys, [1, 2]);
  assert.equal(result.losingTribeKey, 3);
  assert.equal(result.playerTribeWon, true);
});

test('merged player immunity starts strategy and does not auto-complete the round', async () => {
  const gm = game({ count: 6, mergeAt: 6 });
  gm.seasonEngine.merge();
  const result = {
    challengeDay: 1, challengeType: 'individual',
    individualWinnerId: gm.player.id, playerWonIndividualImmunity: true
  };
  let strategyStarted = false;
  gm.systems = { strategyPhaseSystem: {
    startPostChallengePhase: async () => { strategyStarted = true; }
  } };
  await gm.systems.strategyPhaseSystem.startPostChallengePhase();
  assert.equal(strategyStarted, true);
  assert.equal(gm.seasonEngine.completeRound({ challengeResult: result }), false);
  assert.equal(gm.day, 1);
});

test('merged NPC immunity winner is excluded from off-screen Tribal targets', () => {
  const gm = game({ count: 8, mergeAt: 8 });
  gm.seasonEngine.merge();
  const winner = gm.survivors.find(member => !member.isPlayer);
  const result = { challengeType: 'individual', individualWinnerId: winner.id };
  gm.seasonEngine.applyChallengeResult(result);
  const eliminated = gm.seasonEngine.resolveNpcTribal(gm.tribes[0]);
  assert.notEqual(eliminated?.id, winner.id);
  assert.equal(winner.isOut, undefined);
});

test('safe pre-merge round performs one off-screen elimination and advances once', () => {
  const gm = game({ count: 8 });
  const result = {
    challengeDay: 1, challengeType: 'tribal',
    winningTribeKeys: [1], losingTribeKey: 2, playerTribeWon: true
  };
  gm.seasonEngine.completeRound({ challengeResult: result });
  assert.equal(gm.survivors.filter(member => member.isOut).length, 1);
  assert.equal(gm.day, 2);
  assert.equal(gm.seasonEngine.completeRound({ challengeResult: result }), false);
  assert.equal(gm.survivors.filter(member => member.isOut).length, 1);
  assert.equal(gm.day, 2);
});

test('player-unsafe pre-merge round waits for visible Tribal', () => {
  const gm = game({ count: 8 });
  const before = gm.seasonEngine.getActivePlayerCount();
  const result = {
    challengeDay: 1,
    challengeType: 'tribal',
    winningTribeKeys: [2],
    losingTribeKey: 1,
    playerTribeWon: false
  };
  assert.equal(gm.seasonEngine.completeRound({ challengeResult: result }), false);
  assert.equal(gm.seasonEngine.getActivePlayerCount(), before);
  assert.equal(gm.day, 1);
  assert.deepEqual(gm.seasonEngine.state.completedRounds, []);
});

test('normal Tribal voting cannot target the individual immunity winner', () => {
  const gm = game({ count: 6, mergeAt: 6 });
  gm.seasonEngine.merge();
  gm.getTribes = () => gm.tribes;
  const winner = gm.survivors.find(member => !member.isPlayer);
  gm.seasonEngine.applyChallengeResult({
    challengeDay: 1,
    challengeType: 'individual',
    individualWinnerId: winner.id,
    playerWonIndividualImmunity: false
  });
  const tribal = new TribalCouncilSystem(gm, events);
  tribal.buildTribeContext(1);
  tribal._scoreNpcTarget = (_voter, target) => target.id === winner.id ? 10000 : 1;
  tribal.computeNpcVotes();
  assert.equal(tribal.immunityHolderIds.has(winner.id), true);
  assert.equal(tribal.initialVotes.some(vote => vote.targetId === winner.id), false);
});

test('player elimination performs one terminal transition and clears timers', () => {
  const original = gameManager.createSavePayload();
  const originalScreenUpdate = gameManager._updateScreenForState;
  const originalWindowSetTimeout = window.setTimeout;
  const originalWindowClearTimeout = window.clearTimeout;
  window.setTimeout = globalThis.setTimeout;
  window.clearTimeout = globalThis.clearTimeout;
  const visitedStates = [];
  gameManager._updateScreenForState = state => visitedStates.push(state);
  gameManager.resetGameState();
  const player = { id: 'terminal-player', name: 'Terminal Player', isPlayer: true };
  const npc = { id: 'terminal-npc', name: 'NPC' };
  gameManager.player = player;
  gameManager.survivors = [player, npc];
  gameManager.tribes = [{
    id: 1,
    tribeId: 1,
    tribeName: 'Final',
    members: [player, npc],
    resources: { food: 50, water: 50, fire: 50, shelter: 50 }
  }];
  gameManager.isMerged = true;
  gameManager.day = 9;
  timerManager.setTimeout('terminal-test', () => {}, 60000);
  assert.equal(gameManager.eliminateSurvivor(player, 'vote'), true);
  assert.equal(gameManager.eliminateSurvivor(player, 'vote'), false);
  assert.equal(gameManager.gameState, 'gameOver');
  assert.equal(gameManager.gamePhase, 'night');
  assert.equal(gameManager.dayTimer, 0);
  assert.equal(gameManager.day, 9);
  assert.equal(timerManager.getTimerCount(), 0);
  assert.deepEqual(visitedStates, ['gameOver']);
  gameManager._terminalHandled = false;
  gameManager.restoreSavePayload(original);
  gameManager._updateScreenForState = originalScreenUpdate;
  window.setTimeout = originalWindowSetTimeout;
  window.clearTimeout = originalWindowClearTimeout;
});

test('save/load preserves canonical challenge and individual immunity state', () => {
  const gm = game({ count: 6, mergeAt: 6 });
  gm.seasonEngine.merge();
  const winner = gm.survivors.find(member => !member.isPlayer);
  const result = normalizeChallengeResult({
    challengeDay: 1, challengeType: 'individual', individualWinnerId: winner.id
  }, { gameManager: gm });
  gm.lastChallengeResult = result;
  gm.seasonEngine.applyChallengeResult(result);
  const payload = {
    gameManager: {
      isInitialized: true,
      gameState: 'camp',
      gamePhase: 'postChallenge',
      day: gm.day,
      dayTimer: 3600,
      tribeCount: 1,
      tribes: gm.tribes,
      survivors: gm.survivors,
      player: gm.player,
      playerId: gm.player.id,
      jury: [],
      finalists: [],
      winner: null,
      mergeAt: gm.mergeAt,
      isMerged: true,
      isTribesShuffled: false,
      flags: {},
      state: {},
      postChallengeMode: 'playable',
      lastChallengeResult: result,
      seasonEngine: gm.seasonEngine.serialize()
    },
    systems: {}
  };
  const originalUpdate = gameManager._updateScreenForState;
  gameManager._updateScreenForState = () => {};
  assert.equal(gameManager.restoreSavePayload(payload), true);
  assert.equal(gameManager.lastChallengeResult.challengeType, 'individual');
  assert.equal(gameManager.lastChallengeResult.individualWinnerId, winner.id);
  assert.equal(gameManager.hasImmunity(winner.id), true);
  gameManager._updateScreenForState = originalUpdate;
});
