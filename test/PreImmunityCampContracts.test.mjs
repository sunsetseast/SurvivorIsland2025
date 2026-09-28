import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { normalizeCampState, syncCampResources, MAX_FIRE_LEVEL, MAX_SHELTER_LEVEL, CAMP_WORK_LOCATIONS,
  isNeededCampContribution } from '../src/modules/systems/CampState.js';
import { shelterBuildOdds } from '../src/modules/systems/ShelterBuildRules.js';
import { firewoodCost, payForFireAttempt } from '../src/modules/systems/FireAttemptRules.js';
import { witnessedHuntSuspicion } from '../src/modules/systems/CampIdolRisk.js';
import TaskSystem from '../src/modules/systems/TaskSystem.js';

globalThis.window ||= { debugBanner: () => {} };
globalThis.window.debugBanner ||= () => {};
globalThis.document ||= { getElementById: () => null, querySelector: () => null };
globalThis.HTMLElement ||= class HTMLElement {};
const { gameManager } = await import('../src/modules/core/GameManager.js');
const { default: npcLocations } = await import('../src/modules/systems/NpcLocationSystem.js');
const { default: TaskSimulationSystem } = await import('../src/modules/systems/TaskSimulationSystem.js');

function campTribe() {
  return { id: 1, fire: 0, shelter: 0, resources: { water: 50, fire: 75, shelter: 60, food: 50 },
    members: [{ id: 1, isPlayer: true, water: 100 }, { id: 2, water: 100 }],
    day1Plan: { assignments: { fire: [2], shelter: [2], wood: [2], resources: [1], float: [] } } };
}

function clockGame() {
  const survivor = { id: 1, water: 100, hunger: 100, rest: 100 };
  const tribe = { shelter: 0 };
  const gm = Object.create(Object.getPrototypeOf(gameManager));
  Object.assign(gm, { dayTimer: 7200, timeSpeed: 8, day: 1, gamePhase: 'preChallenge',
    campNeedElapsed: { water: 0, hunger: 0, rest: 0 }, flags: {}, survivors: [survivor],
    systems: {}, campLog: [], taskSystem: { ingestCampLogForTribe() {} },
    getPlayerTribe: () => tribe, updateHealthForAll() {}, checkpoints: [] });
  gm.runTaskSimCheckpoint = function(checkpoint) {
    if (this.flags[checkpoint]) return null;
    this.flags[checkpoint] = true;
    this.checkpoints.push(checkpoint);
    return { id: checkpoint };
  };
  return { gm, survivor };
}

test('old stores migrate once; fire, shelter and potable supply have one authoritative value', () => {
  const tribe = campTribe();
  normalizeCampState(tribe);
  assert.equal(tribe.stockpile.water, 50);
  assert.equal(tribe.resources.fire, 0);
  assert.equal(tribe.resources.shelter, 0);
  tribe.stockpile.water = 12;
  tribe.resources.water = 80; // an obsolete writer cannot re-migrate over the supply
  normalizeCampState(tribe);
  assert.equal(tribe.stockpile.water, 12);
  tribe.fire = 2; tribe.shelter = 3;
  syncCampResources(tribe);
  assert.equal(tribe.resources.fire, 67);
  assert.equal(tribe.resources.shelter, 75);
  assert.equal(tribe.resources.water, 12);
  tribe.stockpile.firewood = NaN;
  tribe.stockpile.bamboo = -12;
  normalizeCampState(tribe);
  assert.equal(tribe.stockpile.firewood, 0);
  assert.equal(tribe.stockpile.bamboo, 0);
  assert.deepEqual(JSON.parse(JSON.stringify(tribe)).stockpile.water, 12);
});

test('manual and simulated construction synchronize the same levels and never exceed maxima', () => {
  const tribe = campTribe();
  normalizeCampState(tribe);
  const gm = { ensureStockpileExists: () => tribe.stockpile,
    consumeFromStockpile: (_, key, amount) => { tribe.stockpile[key] -= amount; return true; },
    getCurrentDay: () => 1, campLog: [], getPlayerTribe: () => tribe };
  tribe.stockpile.firewood = 100;
  tribe.stockpile.bamboo = 15;
  tribe.stockpile.palms = 3;
  const simulation = new TaskSimulationSystem(gm);
  const report = { deltas: { firewood: 0, bamboo: 0, palms: 0 }, stockpileAfter: {} };
  assert.equal(simulation.tryConsumeAndBuild(tribe, 'fire', { firewood: 10 }, report, 2).success, true);
  assert.equal(tribe.resources.fire, Math.round(100 / MAX_FIRE_LEVEL));
  assert.equal(simulation.tryConsumeAndBuild(tribe, 'shelter', { bamboo: 5, palms: 1 }, report, 2).success, true);
  assert.equal(tribe.resources.shelter, Math.round(100 / MAX_SHELTER_LEVEL));
  tribe.fire = MAX_FIRE_LEVEL; tribe.shelter = MAX_SHELTER_LEVEL;
  assert.equal(simulation.tryConsumeAndBuild(tribe, 'fire', { firewood: 10 }, report, 2).maxed, true);
  assert.equal(simulation.tryConsumeAndBuild(tribe, 'shelter', { bamboo: 5 }, report, 2).maxed, true);
});

test('fire retry consumes materials for every playable attempt', () => {
  const tribe = { fire: 0, stockpile: { firewood: 20 } };
  const gm = { consumeFromStockpile: (_, key, amount) => {
    if (tribe.stockpile[key] < amount) return false;
    tribe.stockpile[key] -= amount;
    return true;
  } };
  assert.equal(firewoodCost(0), 10);
  assert.equal(firewoodCost(1), 20);
  assert.equal(firewoodCost(2), 30);
  assert.equal(firewoodCost(MAX_FIRE_LEVEL), 0);
  assert.equal(payForFireAttempt(gm, tribe), 10);
  assert.equal(payForFireAttempt(gm, tribe), 10);
  assert.equal(payForFireAttempt(gm, tribe), 0);
  assert.equal(tribe.stockpile.firewood, 0);
});

test('time jumps process every need boundary and checkpoints once, matching natural ticks', () => {
  const large = clockGame();
  large.gm.advanceCampTime(900);
  assert.deepEqual([large.survivor.water, large.survivor.hunger, large.survivor.rest], [97, 98, 97]);
  const natural = clockGame();
  for (let i = 0; i < 900 / 8; i++) natural.gm.advanceCampTime(8);
  natural.gm.advanceCampTime(900 % 8);
  assert.deepEqual([natural.survivor.water, natural.survivor.hunger, natural.survivor.rest],
    [large.survivor.water, large.survivor.hunger, large.survivor.rest]);
  large.gm.advanceCampTime(10000);
  large.gm.finalizePreImmunityCamp();
  assert.deepEqual(large.gm.checkpoints, ['mid', 'end']);
  const restored = clockGame();
  restored.gm.flags = JSON.parse(JSON.stringify(large.gm.flags));
  restored.gm.campNeedElapsed = JSON.parse(JSON.stringify(large.gm.campNeedElapsed));
  restored.gm.dayTimer = large.gm.dayTimer;
  restored.gm.finalizePreImmunityCamp();
  assert.deepEqual(restored.gm.checkpoints, []);
});

test('shelter relationship value, ability, condition and style affect bounded odds', () => {
  const strong = { strength: 9, rest: 90, laziness: 1 };
  const weak = { strength: 3, rest: 25, laziness: 7 };
  const high = shelterBuildOdds({ player: strong, partner: strong, relationshipValue: 90, style: 'together' });
  const low = shelterBuildOdds({ player: weak, partner: weak, relationshipValue: 10, style: 'npc_lead' });
  assert.ok(high - low > 0.25, `${high} versus ${low}`);
  assert.ok(high <= 0.88 && low >= 0.25);
  assert.ok(shelterBuildOdds({ player: strong, partner: strong, relationshipValue: 90, style: 'lead', leader: true })
    > shelterBuildOdds({ player: strong, partner: strong, relationshipValue: 90, style: 'npc_lead' }));
});

test('fire objectives are achievable; Resources and Flex see useful contributions automatically', () => {
  const tribe = campTribe();
  const player = tribe.members[0];
  tribe.day1Plan.assignments.fire = [1];
  tribe.day1Plan.assignments.float = [1];
  const gm = { day: 1, campLog: [], getPlayerTribe: () => tribe, getPlayerSurvivor: () => player, systems: {} };
  const tasks = new TaskSystem(gm);
  tasks.createDay1TasksFromPlan(tribe, 'day1_phase1');
  const fire = tribe.taskState.tasks.find(task => task.type === 'fire_long');
  assert.equal(fire.target.fireLevel, MAX_FIRE_LEVEL);
  fire.progress.fireLevel = MAX_FIRE_LEVEL;
  assert.equal(tasks.isTaskComplete(fire), true);
  tasks.recordResourceGain(1, 'water', 10, 'water_well');
  assert.equal(tribe.taskState.tasks.find(task => task.type === 'resources_short').status, 'complete');
  assert.ok(tribe.taskState.tasks.find(task => task.type === 'float_short').status === 'complete');
  assert.ok(gm.campLog.some(entry => entry.type === 'camp_responsibility_met'));
  assert.equal(tasks.hasClaimableTasksForPlayer(gm), false);
  assert.equal(isNeededCampContribution({ stockpile: { water: 90 } }, 'water', 10), false);
});

test('NPC work maps to locations, filters absent cast, and survives valid JSON restore', () => {
  const previous = { tribes: gameManager.tribes, player: gameManager.player, dayTimer: gameManager.dayTimer,
    flags: gameManager.flags, systems: gameManager.systems };
  const tribe = campTribe();
  tribe.members.push({ id: 3, isOut: true });
  gameManager.tribes = [tribe]; gameManager.player = tribe.members[0]; gameManager.dayTimer = 5000;
  gameManager.flags = { absentFromCampIds: new Set([3]) };
  gameManager.systems = { taskSimulationSystem: new TaskSimulationSystem(gameManager) };
  try {
    npcLocations.reset();
    npcLocations.assignCampWork(tribe, 5000);
    assert.equal(npcLocations.getLocation(2), CAMP_WORK_LOCATIONS.wood);
    assert.equal(tribe.members[1].campActivity.type, 'wood');
    assert.equal(npcLocations.getLocation(3), null);
    const snapshot = JSON.parse(JSON.stringify(npcLocations.serialize()));
    npcLocations.reset(); npcLocations.deserialize(snapshot);
    assert.equal(npcLocations.getLocation(2), CAMP_WORK_LOCATIONS.wood);
    assert.deepEqual(npcLocations.getSurvivorsAtLocation(CAMP_WORK_LOCATIONS.wood).map(s => s.id), [2]);
    snapshot.locations[2] = 'invalid';
    npcLocations.deserialize(snapshot);
    assert.equal(npcLocations.getLocation(2), null);
    assert.equal(tribe.members[1].campActivity, null);
  } finally {
    npcLocations.reset(); Object.assign(gameManager, previous);
  }
});

test('GameManager save/load preserves canonical camp and completed checkpoints', () => {
  const original = gameManager.createSavePayload();
  const previousScreenUpdate = gameManager._updateScreenForState;
  const previousSystems = gameManager.systems;
  const tribe = campTribe();
  tribe.members[0].isPlayer = true;
  normalizeCampState(tribe);
  tribe.fire = 2; tribe.shelter = 1; tribe.stockpile.water = 14;
  syncCampResources(tribe);
  tribe.taskState = { activePhaseId: 'day1_phase1', tasks: [], lastIngestIndex: 0 };
  gameManager.tribes = [tribe]; gameManager.survivors = tribe.members;
  gameManager.player = tribe.members[0]; gameManager.gameState = 'camp'; gameManager.gamePhase = 'preChallenge';
  gameManager.dayTimer = 0; gameManager.day = 1;
  gameManager.campNeedElapsed = { water: 15, hunger: 20, rest: 30 };
  gameManager.flags = { taskSimMidCompleted: true, taskSimEndCompleted: true,
    absentFromCampIds: new Set([3]), campEventActive: true };
  gameManager.systems = { npcLocationSystem: npcLocations };
  gameManager._updateScreenForState = () => {};
  npcLocations.reset();
  npcLocations.updateNpcLocation(2, CAMP_WORK_LOCATIONS.wood);
  tribe.members[1].campActivity = { type: 'wood', location: CAMP_WORK_LOCATIONS.wood, startedAt: 600, endsAt: 0 };
  try {
    const payload = gameManager.createSavePayload();
    assert.deepEqual(payload.gameManager.flags.absentFromCampIds, [3]);
    gameManager.tribes = []; npcLocations.reset();
    assert.equal(gameManager.restoreSavePayload(payload), true);
    const restored = gameManager.getPlayerTribe();
    assert.equal(restored.fire, 2);
    assert.equal(restored.resources.fire, 67);
    assert.equal(restored.stockpile.water, restored.resources.water);
    assert.equal(gameManager.campNeedElapsed.rest, 30);
    assert.equal(gameManager.flags.taskSimEndCompleted, true);
    assert.equal(gameManager.flags.campEventActive, false);
    assert.equal(gameManager.flags.absentFromCampIds.has(3), true);
    assert.equal(npcLocations.getLocation(2), CAMP_WORK_LOCATIONS.wood);
    assert.equal(restored.members[1].campActivity.type, 'wood');
  } finally {
    gameManager.systems = previousSystems;
    gameManager.restoreSavePayload(original);
    gameManager._updateScreenForState = previousScreenUpdate;
    npcLocations.reset();
  }
});

test('witnesses and repeat searches change idol suspicion; Beach has no local renderer', () => {
  assert.equal(witnessedHuntSuspicion({ witnesses: 0, repeatVisits: 0 }), 0);
  assert.ok(witnessedHuntSuspicion({ witnesses: 2, repeatVisits: 2 }) >
    witnessedHuntSuspicion({ witnesses: 0, repeatVisits: 1 }));
  const beach = fs.readFileSync(new URL('../src/modules/views/BeachView.js', import.meta.url), 'utf8');
  assert.doesNotMatch(beach, /renderNPCsAtBeach|createNpcIcon|npc-icon-container/);
});
