import test from 'node:test';
import assert from 'node:assert/strict';
import TribalCouncilSystem from '../src/modules/systems/TribalCouncilSystem.js';
import TribalQuestionEngine from '../src/modules/systems/TribalQuestionEngine.js';

function survivor(id, { isPlayer = false, hasImmunity = false, advantages = {} } = {}) {
  return {
    id,
    name: `Survivor ${id}`,
    isPlayer,
    hasImmunity,
    hasVote: true,
    advantages: { ...advantages },
    physical: 50,
    mental: 50,
    social: 50
  };
}

function buildGame(members, { inventories = new Map() } = {}) {
  const player = members.find(member => member.isPlayer);
  const gameManager = {
    day: 3,
    survivors: members,
    tribes: [{ id: 'tribe-1', tribeId: 'tribe-1', members }],
    systems: {
      idolSystem: { survivorInventories: inventories, tribeIdolStates: new Map() }
    },
    getDay: () => 3,
    getTribes: () => gameManager.tribes,
    getPlayerTribe: () => gameManager.tribes[0],
    getPlayerSurvivor: () => player,
    hasVote: member => Boolean(member && member.hasVote !== false),
    canPlayShotInTheDark: member => Boolean(member && gameManager.hasVote(member) && member?.advantages?.shotInTheDarkAvailable !== false),
    consumeShotInTheDarkForSurvivor: id => {
      const target = members.find(member => String(member.id) === String(id));
      if (!target || !gameManager.canPlayShotInTheDark(target)) return false;
      target.advantages.shotInTheDarkAvailable = false;
      target.shotInTheDarkAvailable = false;
      return true;
    },
    consumeIdolForSurvivor: id => {
      const idol = inventories.get(id)?.idols?.find(entry => !entry.isUsed && !entry.played);
      if (!idol) return false;
      idol.isUsed = true;
      idol.played = true;
      return true;
    },
    hasImmunity: member => Boolean(member?.hasImmunity),
    hasLostVote: () => false,
    getTrust: () => 50
  };
  return gameManager;
}

const eventManager = { publish() {} };

test('a played idol is consumed even when it receives no votes', () => {
  const player = survivor('player', { isPlayer: true, hasImmunity: true });
  const inventory = { idols: [{ id: 'idol-1', isUsed: false, played: false, tribeId: 'tribe-1' }] };
  const game = buildGame([player, survivor('a'), survivor('b')], { inventories: new Map([[player.id, inventory]]) });
  const tribal = new TribalCouncilSystem(game, eventManager);

  tribal.registerPlayerVote(player.id, 'a');
  tribal.registerIdolPlay(player.id, player.id);
  const summary = tribal.runPreMergeTribal({ attendingTribeId: 'tribe-1' });

  assert.equal(summary.idolPlays[0].successful, false);
  assert.equal(summary.idolPlays[0].consumed, true);
  assert.equal(inventory.idols[0].isUsed, true);
});

test('Shot in the Dark is permanently consumed on use, whether it is safe or not', () => {
  const player = survivor('player', { isPlayer: true, advantages: { shotInTheDarkAvailable: true } });
  const game = buildGame([player, survivor('a'), survivor('b')]);
  const tribal = new TribalCouncilSystem(game, eventManager);

  assert.equal(tribal.registerPlayerShotInTheDark(player.id), true);
  const summary = tribal.runPreMergeTribal({ attendingTribeId: 'tribe-1' });

  assert.equal(summary.shotResults.length, 1);
  assert.equal(summary.shotResults[0].consumed, true);
  assert.equal(player.advantages.shotInTheDarkAvailable, false);
  assert.equal(player.shotInTheDarkAvailable, false);
});

test('a missing player vote returns a controlled unresolved state instead of inventing a vote', () => {
  const player = survivor('player', { isPlayer: true });
  const game = buildGame([player, survivor('a'), survivor('b')]);
  const tribal = new TribalCouncilSystem(game, eventManager);

  const summary = tribal.runPreMergeTribal({ attendingTribeId: 'tribe-1' });

  assert.equal(summary.tribalState, 'PLAYER_VOTE_REQUIRED');
  assert.equal(summary.blockedReason, 'PLAYER_VOTE_REQUIRED');
  assert.equal(summary.decisionResolved, false);
  assert.deepEqual(summary.initialVotes, []);
});

test('the question engine turns Tribal state into deterministic player choices', () => {
  const player = survivor('player', { isPlayer: true });
  const target = survivor('target');
  const ally = survivor('ally');
  const game = buildGame([player, target, ally]);
  const targetBoard = {
    primaryTargetId: 'player',
    secondaryTargetId: 'target',
    heatMap: { player: 3, target: 2 }
  };
  game.flags = { tribalTargetBoard: targetBoard };
  game.systems.strategyPhaseSystem = {
    tribalTargetBoard: targetBoard,
    getTribalTargetBoard: () => targetBoard,
    getSummaryFacts: () => [{ type: 'playerNameFloated', targetId: 'player' }]
  };
  game.systems.allianceSystem = {
    getAlliances: () => [{ id: 'alliance-1', memberIds: ['player', 'ally'], active: true }]
  };
  game.changeTrust = () => {};

  const engine = new TribalQuestionEngine(game);
  const questions = engine.generateQuestions({ attendingTribeId: 'tribe-1' });
  const playerQuestion = questions.find(question => question.focusSurvivorId === 'player');

  assert.ok(questions.length >= 3 && questions.length <= 5);
  assert.ok(playerQuestion);
  assert.ok(playerQuestion.responseOptions.length >= 2);
  assert.deepEqual(Object.keys(playerQuestion.responseOptions[0].effects).sort(), ['relationship', 'suspicion', 'targetHeat', 'threat', 'trust']);
});

// Manual scene coverage in the browser: simple majority, initial tie + revote,
// rocks, a successful idol, a failed SITD, lost vote, and alliance betrayal.
