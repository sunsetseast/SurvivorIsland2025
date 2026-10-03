import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { LocationKeys } from '../src/modules/core/LocationKeys.js';
import { normalizeCampState } from '../src/modules/systems/CampState.js';
import { advanceCampNeeds } from '../src/modules/systems/CampTime.js';
import { witnessedHuntSuspicion } from '../src/modules/systems/CampIdolRisk.js';

globalThis.window ||= { debugBanner: () => {} };
globalThis.window.debugBanner ||= () => {};
globalThis.document ||= { getElementById: () => null, querySelector: () => null };
globalThis.HTMLElement ||= class HTMLElement {};
const { gameManager } = await import('../src/modules/core/GameManager.js');
const { default: CampActivitySystem, routeBetween } = await import('../src/modules/systems/CampActivitySystem.js');
const { default: memory } = await import('../src/modules/systems/SocialMemorySystem.js');
const { default: locations } = await import('../src/modules/systems/NpcLocationSystem.js');
const { default: socialEngine } = await import('../src/modules/systems/SocialEngine.js');
const { default: ConversationSystem } = await import('../src/modules/systems/ConversationSystem.js');
const { default: TaskSimulationSystem } = await import('../src/modules/systems/TaskSimulationSystem.js');
const { default: TaskSystem } = await import('../src/modules/systems/TaskSystem.js');

function fixture(random = () => 0) {
  const player = { id: 'p', firstName: 'You', isPlayer: true, rest: 90, water: 90, hunger: 90, teamPlayer: 50, location: LocationKeys.BEACH };
  const worker = { id: 'w', firstName: 'Charlie', rest: 90, water: 90, hunger: 90, teamPlayer: 50, workEthic: 75, location: LocationKeys.JUNGLE_TRAIL };
  const witness = { id: 'x', firstName: 'Maria', rest: 30, water: 90, hunger: 90, teamPlayer: 50, location: LocationKeys.BEACH };
  const tribe = normalizeCampState({ id: 'red', fire: 0, shelter: 0, resources: {},
    stockpile: { firewood: 0, bamboo: 0, palms: 0, coconuts: 0, water: 0 },
    members: [player, worker, witness], day1Plan: { assignments: { wood: ['w'], resources: ['x'], fire: [], shelter: [], float: [] } } });
  const positions = { w: LocationKeys.JUNGLE_TRAIL, x: LocationKeys.BEACH };
  const gm = {
    day: 1, dayTimer: 7200, gamePhase: 'preChallenge', flags: {}, campLog: [], tribes: [tribe],
    player, gameSettings: { enableIdols: true }, systems: {},
    getPlayerTribe: () => tribe, getPlayerSurvivor: () => player, getTrust: () => 60,
    ensureStockpileExists: () => tribe.stockpile,
    addToStockpile: (_, key, amount) => { tribe.stockpile[key] += amount; return tribe.stockpile[key]; },
    consumeFromStockpile: (_, key, amount) => { if (tribe.stockpile[key] < amount) return false; tribe.stockpile[key] -= amount; return true; },
    consumeCampTime(seconds) { const before = this.dayTimer; this.dayTimer = Math.max(0, before - seconds);
      activity.advance(before, this.dayTimer, elapsed => advanceCampNeeds(this, elapsed)); },
    updateHealthForAll() {}
  };
  gm.systems.npcLocationSystem = {
    locations: positions, getLocation: id => positions[id] || null,
    updateNpcLocation(id, to) { positions[id] = to; tribe.members.find(member => member.id === id).location = to; },
    getSurvivorsAtLocation: to => tribe.members.filter(member => !member.isPlayer && positions[member.id] === to)
  };
  gm.systems.taskSimulationSystem = { getAssignmentsFromPlanOrTasks: () => tribe.day1Plan.assignments };
  gm.systems.socialMemorySystem = memory;
  gm.systems.relationshipSystem = { changes: [], changeRelationship(a, b, delta) { this.changes.push([a, b, delta]); } };
  gm.systems.allianceSystem = { areAllied: () => false };
  const activity = new CampActivitySystem(gm, random);
  gm.systems.campActivitySystem = activity;
  memory.deserialize(null);
  window.campScreen = { currentView: LocationKeys.BEACH };
  return { gm, tribe, player, worker, witness, positions, activity };
}

test('activity owns physical location and resolves work once at its clock boundary', () => {
  const { gm, worker, tribe, positions, activity } = fixture();
  activity.ensureStarted();
  const first = worker.campActivity;
  assert.equal(first.type, 'gather_firewood');
  assert.equal(positions.w, first.location);
  const complete = activity.complete.bind(activity);
  let boundary;
  activity.complete = (...args) => { if (args[1]?.id === first.id) boundary = gm.dayTimer; return complete(...args); };
  gm.consumeCampTime(900);
  assert.equal(boundary, first.endsAt);
  assert.ok(tribe.stockpile.firewood > 0);
  assert.equal(gm.campLog.filter(entry => entry.activityId === first.id).length, 1);
  assert.equal(activity.complete(worker, first), false);
  assert.equal(routeBetween(LocationKeys.BEACH, LocationKeys.WATER_WELL)[0], LocationKeys.TRIBE_FLAG);
});

test('interrupted work grants effort but cannot double-resolve', () => {
  const { gm, tribe, worker, activity } = fixture();
  activity.ensureStarted(); const first = worker.campActivity;
  gm.dayTimer -= 150;
  assert.equal(activity.interrupt(worker, 'warning'), true);
  assert.equal(activity.complete(worker, first), false);
  assert.equal(tribe.stockpile.firewood, 0);
  assert.ok(activity.effort.w >= 150);
});

test('known urgent warning can override routine work without inventing its output', () => {
  const { gm, tribe, worker, activity } = fixture();
  activity.ensureStarted(); const first = worker.campActivity;
  gm.systems.allianceSystem.areAllied = (a, b) => a === 'w' && b === 'x';
  memory.recordConversationIntent({ npcId: 'w', intent: 'warning', day: 1, campTime: 7110 });
  gm.dayTimer = 7070; activity.advance(7070, 7060);
  assert.equal(worker.campActivity.type, 'travel');
  assert.equal(worker.campActivity.goal.type, 'strategy_conversation');
  assert.equal(activity.resolved.has(first.id), true);
  assert.equal(tribe.stockpile.firewood, 0);
});

test('one long action and natural ticks produce equivalent needs and NPC outcomes', () => {
  const jump = fixture(); jump.gm.consumeCampTime(1320);
  const result = { stock: { ...jump.tribe.stockpile },
    needs: jump.tribe.members.map(s => [s.water, s.hunger, s.rest]), resolved: jump.activity.resolved.size };
  const ticks = fixture();
  for (let n = 0; n < 1320; n += 8) ticks.gm.consumeCampTime(8);
  assert.deepEqual({ stock: ticks.tribe.stockpile,
    needs: ticks.tribe.members.map(s => [s.water, s.hunger, s.rest]), resolved: ticks.activity.resolved.size }, result);
});

test('shelter protects its own tribe rather than everyone', () => {
  const a = { id: 'a', shelter: 0, members: [{ rest: 20 }] }, b = { id: 'b', shelter: 2, members: [{ rest: 20 }] };
  const gm = { tribes: [a, b], campNeedElapsed: { water: 0, hunger: 0, rest: 0 }, updateHealthForAll() {} };
  advanceCampNeeds(gm, 720);
  assert.equal(a.members[0].rest, 17); assert.equal(b.members[0].rest, 19);
});

test('shortage, role, exhaustion, allies and strategy pressure change bounded choice weights', () => {
  const { gm, tribe, worker, witness, activity } = fixture();
  const low = activity.scoreChoices(worker).find(c => c.type === 'gather_firewood').weight;
  tribe.stockpile.firewood = 30;
  const stocked = activity.scoreChoices(worker).find(c => c.type === 'gather_firewood').weight;
  assert.ok(low > stocked);
  const tired = activity.scoreChoices(witness).find(c => c.type === 'rest').weight;
  witness.rest = 95;
  assert.ok(tired > activity.scoreChoices(witness).find(c => c.type === 'rest').weight);
  memory.recordConversationIntent({ npcId: 'w', intent: 'warning', day: 1, campTime: 7000 });
  assert.ok(activity.scoreChoices(worker).find(c => c.type === 'strategy_conversation').weight > 1);
  gm.systems.allianceSystem.areAllied = (a, b) => a === 'w' && b === 'x';
  assert.ok(activity.scoreChoices(worker).find(c => c.type === 'socialize').weight > 1);
  tribe.day1Plan.assignments.wood = []; tribe.day1Plan.assignments.float = ['w']; tribe.stockpile.firewood = 0;
  assert.ok(activity.scoreChoices(worker).find(c => c.type === 'gather_firewood').weight > stocked);
});

test('private talk has participants and visible witnesses but no omniscient contents', () => {
  const { gm, player, worker, witness, activity, positions } = fixture();
  activity.ensureStarted();
  activity.start(witness, { type: 'rest', location: LocationKeys.WATER_WELL });
  activity.start(worker, { type: 'rest', location: LocationKeys.WATER_WELL });
  window.campScreen.currentView = LocationKeys.WATER_WELL;
  activity.observe({ actor: player, type: 'seen_together', participants: [worker.id],
    location: LocationKeys.WATER_WELL, activityId: 'meeting', at: gm.dayTimer,
    visibility: 'private', detail: 'private target plan' });
  assert.equal(memory.getCampObservations(worker.id)[0].detail, 'private target plan');
  assert.equal(memory.getCampObservations(witness.id)[0].detail, '');
  assert.equal(memory.getCampObservations('outsider').length, 0);
  assert.equal(memory.shareCampObservation({ fromId: witness.id, toId: 'outsider', observationId: 'meeting' }), true);
  assert.equal(memory.getCampObservations('outsider')[0].origin, 'hearsay');
  assert.equal(memory.getCampObservations('outsider')[0].sourceId, witness.id);
});

test('observed absence accumulates locally, unobserved absence does not, low-value history is bounded', () => {
  const { gm, worker, witness, activity } = fixture(); activity.ensureStarted();
  for (let i = 0; i < 3; i++) activity.observe({ actor: worker, type: 'absence',
    location: LocationKeys.JUNGLE_TRAIL, activityId: `seen-${i}`, at: gm.dayTimer - i * 300,
    witnessIds: [witness.id], detail: 'left camp' });
  assert.equal(memory.getCampImpression(witness.id, worker.id, 'absence').count, 3);
  assert.ok(gm.systems.relationshipSystem.changes.some(([a, b, n]) => a === witness.id && b === worker.id && n < 0));
  activity.observe({ actor: worker, type: 'absence', location: LocationKeys.JUNGLE_TRAIL,
    activityId: 'unseen', at: 6000, witnessIds: [] });
  assert.equal(memory.getCampImpression(witness.id, worker.id, 'absence').count, 3);
  for (let i = 0; i < 60; i++) memory.recordCampObservation({ id: `minor-${i}`, actorId: worker.id,
    witnessIds: [witness.id], type: 'work', day: 1, campTime: 7000 - i });
  assert.ok(memory.getCampObservations(witness.id).length <= 48);
  assert.equal(memory.getCampImpression(witness.id, worker.id, 'work').count, 20);
  const saved = JSON.parse(JSON.stringify(memory.serialize())); memory.deserialize(saved);
  assert.equal(memory.getCampImpression(witness.id, worker.id, 'absence').count, 3);
});

test('contradictory direct evidence updates a neglect impression; hearsay is weaker', () => {
  memory.deserialize(null);
  memory.recordCampObservation({ id: 'neglect', actorId: 'w', witnessIds: ['x'], type: 'role_neglect', day: 1 });
  const prior = memory.getCampImpression('x', 'w', 'role_neglect').confidence;
  memory.recordCampObservation({ id: 'work', actorId: 'w', witnessIds: ['x'], type: 'work', day: 1 });
  assert.ok(memory.getCampImpression('x', 'w', 'role_neglect').confidence < prior);
  assert.equal(memory.shareCampObservation({ fromId: 'x', toId: 'p', observationId: 'work' }), true);
  assert.ok(memory.getCampImpression('p', 'w', 'work').confidence < memory.getCampImpression('x', 'w', 'work').confidence);
});

test('normalized pre conversation reserves both people and costs camp time', () => {
  const { gm, worker, player, positions, activity } = fixture(); gm.gameState = 'camp';
  activity.ensureStarted(); activity.interrupt(worker); positions.w = LocationKeys.BEACH; worker.location = LocationKeys.BEACH;
  const conversation = new ConversationSystem(gm);
  conversation._logConversationStart({ initiator: 'player', phase: 'pre', survivor: worker, location: LocationKeys.BEACH });
  assert.equal(worker.campActivity.type, 'private_conversation');
  assert.equal(player.campActivity.participantIds[0], worker.id);
  const before = gm.dayTimer; activity.finishConversation({ turns: 2, strategy: true });
  assert.equal(gm.dayTimer, before - 240);
  assert.equal(player.campActivity, null);
});

test('NPC social time reserves a real companion and cannot overlap their work', () => {
  const { gm, activity, worker, witness, positions } = fixture();
  activity.ensureStarted(); activity.interrupt(worker); activity.interrupt(witness);
  positions.x = LocationKeys.JUNGLE_TRAIL; witness.location = LocationKeys.JUNGLE_TRAIL;
  const talk = activity.start(worker, { type: 'socialize', targetId: witness.id,
    location: LocationKeys.JUNGLE_TRAIL });
  assert.equal(witness.campActivity.id, talk.id);
  assert.equal(witness.campActivity.external, true);
  assert.equal(witness.campActivity.type, 'socialize');
  gm.consumeCampTime(talk.duration);
  assert.equal(activity.resolved.has(talk.id), true);
  assert.equal(memory.getCampObservations(witness.id).some(entry => entry.id === talk.id), true);
  assert.notEqual(witness.campActivity?.id, talk.id);
});

test('reputation credits one activity and Flex can fill a real need once', () => {
  const { gm, tribe, worker, activity } = fixture(); activity.ensureStarted();
  gm.consumeCampTime(worker.campActivity.duration);
  const credited = worker.teamPlayer; activity.ingestNewCampLog();
  assert.equal(worker.teamPlayer, credited);
  const task = new TaskSystem(gm);
  task.applyRewards(tribe, { assignees: [worker.id], deadline: 'phase', rewards: { teamPlayer: 5 } });
  assert.equal(worker.teamPlayer, credited);
  tribe.day1Plan.assignments.wood = []; tribe.day1Plan.assignments.float = [worker.id];
  assert.equal(activity.recordReputation({ key: 'flex-water', actor: worker, role: 'resources', needed: true,
    amount: 3, location: LocationKeys.JUNGLE_TRAIL }), true);
  assert.equal(worker.teamPlayer, credited + 2);
  assert.equal(activity.recordReputation({ key: 'flex-water', actor: worker, needed: true }), false);
});

test('checkpoint does not invent a second NPC shift while living activities are active', () => {
  const { gm, tribe, activity } = fixture(); activity.ensureStarted(); gm.saveGame = () => true;
  const stock = { ...tribe.stockpile };
  const sim = new TaskSimulationSystem(gm);
  sim.runCheckpoint('mid');
  assert.deepEqual(tribe.stockpile, stock);
  assert.equal(sim.runCheckpoint('mid'), null);
});

test('absent people cannot keep or finish a camp activity', () => {
  const { gm, witness, positions, activity } = fixture();
  witness.campActivity = { id: 'stale', type: 'collect_water', location: LocationKeys.WATER_WELL, endsAt: 7000 };
  gm.flags.absentFromCampIds = new Set([witness.id]);
  activity.ensureStarted();
  assert.equal(witness.campActivity, null); assert.equal(positions.x, undefined);
  gm.consumeCampTime(500);
  assert.equal(gm.campLog.some(entry => entry.actorId === witness.id), false);
});

test('JSON restore preserves a pending activity and its one-time outcome', () => {
  const { activity, worker, tribe, gm } = fixture(); activity.ensureStarted();
  const pending = worker.campActivity;
  const saved = JSON.parse(JSON.stringify({ system: activity.serialize(), members: tribe.members,
    positions: gm.systems.npcLocationSystem.locations }));
  const restored = fixture(); restored.tribe.members.splice(0, restored.tribe.members.length, ...saved.members);
  Object.assign(restored.positions, saved.positions);
  restored.activity.deserialize(saved.system);
  const resumed = restored.tribe.members.find(s => s.id === 'w');
  restored.activity.advance(7200, 6780);
  assert.equal(restored.gm.campLog.filter(entry => entry.activityId === pending.id).length, 1);
  assert.equal(restored.activity.complete(resumed, pending), false);
});

test('a saved NPC companion resumes the shared block; an external player UI does not', () => {
  const { activity, worker, witness, player, positions, tribe } = fixture();
  activity.ensureStarted(); activity.interrupt(worker); activity.interrupt(witness);
  positions.x = LocationKeys.JUNGLE_TRAIL; witness.location = LocationKeys.JUNGLE_TRAIL;
  const talk = activity.start(worker, { type: 'socialize', targetId: witness.id,
    location: LocationKeys.JUNGLE_TRAIL });
  player.campActivity = { id: 'ui-only', external: true, location: LocationKeys.BEACH, endsAt: 0 };
  const saved = JSON.parse(JSON.stringify({ state: activity.serialize(), members: tribe.members, positions }));
  const resumed = fixture();
  resumed.tribe.members.splice(0, resumed.tribe.members.length, ...saved.members);
  Object.assign(resumed.positions, saved.positions);
  resumed.activity.deserialize(saved.state);
  assert.equal(resumed.tribe.members.find(s => s.id === 'x').campActivity.id, talk.id);
  assert.equal(resumed.tribe.members.find(s => s.id === 'p').campActivity, null);
  resumed.activity.advance(7200, 6960);
  assert.equal(memory.getCampObservations('x').some(entry => entry.id === talk.id), true);
});

test('GameManager save restores activity, owned memory, and completed checkpoint state', () => {
  const original = gameManager.createSavePayload();
  const oldSystems = gameManager.systems, oldScreen = gameManager._updateScreenForState;
  try {
    const { tribe, player } = fixture();
    gameManager.tribes = [tribe]; gameManager.survivors = tribe.members; gameManager.player = player;
    gameManager.gameState = 'camp'; gameManager.gamePhase = 'preChallenge';
    gameManager.day = 1; gameManager.dayTimer = 7200;
    gameManager.flags = { taskSimMidCompleted: true }; gameManager.campLog = [];
    gameManager.campSocialChanges = { relationship: [{ with: 'Charlie', amount: 2 }] };
    gameManager.campNeedElapsed = { water: 0, hunger: 0, rest: 0 };
    gameManager._updateScreenForState = () => {};
    locations.reset(); locations.locations = { w: LocationKeys.JUNGLE_TRAIL, x: LocationKeys.BEACH };
    locations.phaseAssigned = true;
    const living = new CampActivitySystem(gameManager, () => 0);
    gameManager.systems = { taskSimulationSystem: new TaskSimulationSystem(gameManager),
      campActivitySystem: living, npcLocationSystem: locations, socialMemorySystem: memory };
    living.ensureStarted();
    gameManager.advanceCampTime(500, { source: 'clock' });
    const pending = tribe.members.find(s => s.id === 'w').campActivity.id;
    memory.recordCampObservation({ id: 'important', actorId: 'w', witnessIds: ['p'], type: 'work',
      location: LocationKeys.JUNGLE_TRAIL, day: 1, campTime: 6700 });
    const saved = JSON.parse(JSON.stringify(gameManager.createSavePayload()));
    gameManager.campLog = []; gameManager.tribes = []; locations.reset(); memory.deserialize(null);
    assert.equal(gameManager.restoreSavePayload(saved), true);
    const restored = gameManager.getPlayerTribe().members.find(s => s.id === 'w');
    assert.equal(restored.campActivity.id, pending);
    assert.equal(locations.getLocation('w'), restored.campActivity.location);
    // Observed travel may precede this memory; preserve ownership, not an array position.
    assert.ok(memory.getCampObservations('p').some(entry => entry.id === 'important'));
    assert.equal(gameManager.flags.taskSimMidCompleted, true);
    assert.equal(gameManager.campSocialChanges.relationship[0].with, 'Charlie');
    const existing = new Set(gameManager.campLog.map(entry => entry.activityId).filter(Boolean));
    gameManager.advanceCampTime(420, { source: 'clock' });
    assert.equal(gameManager.campLog.filter(entry => existing.has(entry.activityId)).length,
      saved.gameManager.campLog.filter(entry => existing.has(entry.activityId)).length);
  } finally {
    gameManager.systems = oldSystems; gameManager.restoreSavePayload(original);
    gameManager._updateScreenForState = oldScreen; locations.reset();
  }
});

test('central NPC presentation owns every camp view and the well has no second layer', () => {
  for (const name of ['Beach', 'Campfire', 'WaterWell', 'JungleTrail', 'RockyShore', 'MountainTrail', 'WaterfallTrail']) {
    const source = fs.readFileSync(new URL(`../src/modules/views/${name}View.js`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /renderNPCsAt|createNpcIcon|npc-icon-container/, name);
  }
});

test('camp social cooldown depends on game time rather than wall time', () => {
  const old = { day: gameManager.day, dayTimer: gameManager.dayTimer, gamePhase: gameManager.gamePhase };
  const saved = socialEngine.serialize();
  try {
    gameManager.day = 3; gameManager.dayTimer = 6000; gameManager.gamePhase = 'preChallenge';
    socialEngine.lastApproachAt = socialEngine._campClock();
    socialEngine.dayStamp = 3; socialEngine.phaseBeatCounts = { pre: 0, post: 0 };
    const clock = socialEngine._campClock();
    assert.equal(socialEngine.shouldTriggerBeatNow({ phaseType: 'pre' }), false);
    gameManager.dayTimer -= socialEngine.globalApproachCooldownSeconds;
    assert.equal(socialEngine._campClock() - clock, socialEngine.globalApproachCooldownSeconds);
    const roundtrip = JSON.parse(JSON.stringify(socialEngine.serialize()));
    socialEngine.deserialize(roundtrip); assert.equal(socialEngine.lastApproachAt, clock);
  } finally { Object.assign(gameManager, old); socialEngine.deserialize(saved); }
});

test('quiet idol search does not gain arbitrary suspicion through repeated taps', () => {
  assert.equal(witnessedHuntSuspicion({ witnesses: 0, repeatVisits: 5, seconds: 1500 }), 0);
  assert.ok(witnessedHuntSuspicion({ witnesses: 2, repeatVisits: 5, seconds: 1500 }) > 0);
});

test('living camp reputation rules end when the phase changes', () => {
  const { gm, activity } = fixture();
  activity.ensureStarted(); assert.equal(activity.active, true);
  gm.gamePhase = 'postChallenge';
  assert.equal(activity.active, false);
});
