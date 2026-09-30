import test from 'node:test';
import assert from 'node:assert/strict';
import { LocationKeys } from '../src/modules/core/LocationKeys.js';
import { normalizeCampState } from '../src/modules/systems/CampState.js';
import { advanceCampNeeds } from '../src/modules/systems/CampTime.js';

globalThis.window ||= { debugBanner: () => {} };
globalThis.window.debugBanner ||= () => {};
globalThis.document ||= { getElementById: () => null, querySelector: () => null };
globalThis.HTMLElement ||= class HTMLElement {};
const { gameManager } = await import('../src/modules/core/GameManager.js');
const { default: CampActivitySystem } = await import('../src/modules/systems/CampActivitySystem.js');
const { default: ConversationSystem } = await import('../src/modules/systems/ConversationSystem.js');
const { default: memory } = await import('../src/modules/systems/SocialMemorySystem.js');
const { resolveNpcCampExchange } = await import('../src/modules/systems/CampSocialResolution.js');

function camp(random = () => 0) {
  memory.deserialize(null);
  const people = ['p', 'a', 'b', 'c', 'd', 'r'].map((id, i) => ({ id, firstName: id.toUpperCase(),
    isPlayer: i === 0, location: i === 4 ? LocationKeys.ROCKY_SHORE : LocationKeys.BEACH,
    rest: 80, water: 80, hunger: 80, teamPlayer: 50, workEthic: 65 }));
  const [player, a, b, c, d, r] = people;
  const tribe = normalizeCampState({ id: 'red', fire: 0, shelter: 0, resources: {},
    stockpile: { firewood: 0, bamboo: 0, palms: 0, coconuts: 0, water: 0 }, members: people });
  const positions = Object.fromEntries(people.filter(s => !s.isPlayer).map(s => [s.id, s.location]));
  const gm = { day: 1, dayTimer: 7200, gameState: 'camp', gamePhase: 'preChallenge',
    flags: {}, campLog: [], tribes: [tribe], survivors: people, player, systems: {},
    getPlayerTribe: () => tribe, getPlayerSurvivor: () => player, getTrust: () => 60,
    ensureStockpileExists: () => tribe.stockpile,
    addToStockpile: (_, resource, amount) => { tribe.stockpile[resource] += amount; },
    consumeFromStockpile: (_, resource, amount) => { tribe.stockpile[resource] -= amount; return true; },
    consumeCampTime(seconds) { const before = this.dayTimer; this.dayTimer = before - seconds;
      activity.advance(before, this.dayTimer); },
    updateHealthForAll() {} };
  gm.systems.npcLocationSystem = { locations: positions, getLocation: id => positions[id],
    updateNpcLocation(id, place) { positions[id] = place; people.find(s => s.id === id).location = place; } };
  gm.systems.socialMemorySystem = memory;
  gm.systems.relationshipSystem = { changes: [], changeRelationship(...args) { this.changes.push(args); } };
  gm.systems.allianceSystem = { areAllied: () => false };
  const activity = new CampActivitySystem(gm, random); gm.systems.campActivitySystem = activity;
  window.gameManager = gm; window.campScreen = { currentView: LocationKeys.BEACH };
  return { gm, activity, tribe, positions, player, a, b, c, d, r };
}

test('NPC departure includes a co-located player and NPC but excludes elsewhere', () => {
  const { activity, a, b, d, player, gm } = camp();
  activity.recordDeparture(a, LocationKeys.BEACH, 7200);
  assert.deepEqual(new Set(activity.departureWitnesses(a.id, 7200)), new Set([player.id, b.id, 'c', 'r']));
  activity.observe({ actor: a, type: 'absence', location: LocationKeys.JUNGLE_TRAIL,
    activityId: 'departure', at: gm.dayTimer, witnessIds: activity.departureWitnesses(a.id, 7200) });
  assert.equal(memory.getCampObservations(player.id).length, 1);
  assert.equal(memory.getCampObservations(b.id).length, 1);
  assert.equal(memory.getCampObservations(d.id).length, 0);
});

test('private content stays with participants while a visible meeting can travel as hearsay', () => {
  camp();
  memory.recordCampObservation({ id: 'meeting', actorId: 'a', participantIds: ['b'], witnessIds: ['c'],
    type: 'seen_together', visibility: 'private', detail: 'A pitched R', day: 1 });
  memory.recordCampClaim({ id: 'pitch', speakerId: 'a', listenerIds: ['b'], subjectId: 'r',
    topic: 'target', stance: 'proposed', day: 1, salience: 'high' });
  assert.equal(memory.getCampObservations('c')[0].detail, '');
  assert.equal(memory.getCampClaims('c').length, 0);
  assert.equal(memory.getCampObservations('d').length, 0);
  assert.equal(memory.shareCampObservation({ fromId: 'c', toId: 'd', observationId: 'meeting' }), true);
  assert.equal(memory.getCampObservations('d')[0].sourceId, 'c');
  assert.equal(memory.getCampObservations('d')[0].detail, '');
  assert.equal(memory.getCampClaims('d').length, 0);
});

test('gossip moves from an actual witness, and each link loses confidence', () => {
  const { gm, a, b, r, positions } = camp();
  positions.a = positions.b = LocationKeys.WATER_WELL;
  for (let n = 0; n < 3; n++) memory.recordCampObservation({ id: `leave:${n}`, actorId: r.id,
    witnessIds: [a.id], type: 'absence', day: 1, campTime: 7000 - n * 240 });
  const activity = { id: 'chat', type: 'socialize', targetId: b.id,
    location: LocationKeys.WATER_WELL, endsAt: 6200 };
  const outcome = resolveNpcCampExchange({ gm, memory, speaker: a, listener: b, activity, random: () => 0 });
  assert.equal(outcome.type, 'gossip');
  const first = memory.getCampObservations('b')[0];
  assert.equal(first.sourceId, 'a'); assert.equal(first.origin, 'hearsay');
  assert.equal(memory.shareCampObservation({ fromId: 'b', toId: 'c', observationId: first.id }), true);
  const second = memory.getCampObservations('c')[0];
  assert.equal(second.sourceId, 'b'); assert.ok(second.confidence < first.confidence);
  const suspicion = memory.getCampClaims('b', { topic: 'idol_suspicion' })[0];
  assert.equal(suspicion.stance, 'possible');
  assert.equal(memory.shareCampClaim({ fromId: 'b', toId: 'c', claimId: suspicion.id }), true);
  assert.ok(memory.getCampClaims('c')[0].confidence < suspicion.confidence);
  assert.equal(memory.getCampClaims('c')[0].sourceId, 'b');
  assert.notEqual(memory.getCampClaims('c')[0].stance, 'confirmed');
  assert.equal(memory.getCampObservations('d').length, 0);
});

test('claims are owned, source trust matters, and hidden truth does not discredit a source', () => {
  const { gm } = camp();
  gm.getTrust = (_, source) => source === 'a' ? 90 : 20;
  memory.recordCampClaim({ id: 'a-claim', speakerId: 'a', listenerIds: ['b'],
    subjectId: 'r', topic: 'target', stance: 'yes', day: 1, confidence: 0.8 });
  memory.recordCampClaim({ id: 'c-claim', speakerId: 'c', listenerIds: ['b'],
    subjectId: 'r', topic: 'other', stance: 'yes', day: 1, confidence: 0.8, truthfulness: false });
  assert.ok(memory.getCampClaims('b')[0].confidence > memory.getCampClaims('b')[1].confidence);
  assert.equal(memory.getCampClaims('b')[1].truthfulness, undefined);
  assert.equal(memory.getCampClaims('b')[0].challenged, undefined);
  assert.deepEqual(memory.memory.b.campSourceReliability, {});
  memory.recordCampClaim({ id: 'direct', speakerId: 'b', subjectId: 'r',
    topic: 'target', stance: 'no', origin: 'firsthand', day: 1, confidence: 1 });
  assert.equal(memory.getCampClaims('b')[0].challenged, true);
  assert.ok(memory.memory.b.campSourceReliability.a < 0.75);
  assert.equal(memory.getCampClaims('d').length, 0);
});

test('corroboration improves a known source while contradictory rumors alone do not expose a lie', () => {
  camp();
  memory.recordCampClaim({ id: 'rumor1', speakerId: 'a', listenerIds: ['b'],
    subjectId: 'r', topic: 'idol_suspicion', stance: 'possible', day: 1 });
  memory.recordCampClaim({ id: 'rumor2', speakerId: 'c', listenerIds: ['b'],
    subjectId: 'r', topic: 'idol_suspicion', stance: 'unlikely', day: 1 });
  assert.deepEqual(memory.memory.b.campSourceReliability, {});
  memory.recordCampClaim({ id: 'seen', speakerId: 'b', subjectId: 'r', topic: 'idol_suspicion',
    stance: 'possible', origin: 'firsthand', day: 1 });
  assert.ok(memory.memory.b.campSourceReliability.a > 0.75);
  assert.ok(memory.memory.b.campSourceReliability.c < 0.75);
});

test('a purposeful private block can pass an owned warning; an intentional lie stays trackable', () => {
  const { gm, a, b, positions } = camp();
  positions.a = positions.b = LocationKeys.WATER_WELL;
  gm.systems.allianceSystem.areAllied = (left, right) => left === 'a' && right === 'b';
  memory.recordConversationIntent({ npcId: 'a', withId: 'b', intent: 'warning',
    targetId: 'r', day: 1, campTime: 7000 });
  const activity = { id: 'purpose', type: 'strategy_conversation', targetId: 'b',
    location: LocationKeys.WATER_WELL, endsAt: 6900 };
  assert.equal(resolveNpcCampExchange({ gm, memory, speaker: a, listener: b,
    activity, random: () => 0 }).type, 'pitch');
  assert.equal(memory.getCampClaims('b', { topic: 'target' })[0].sourceId, 'a');
  a.honesty = 2;
  memory.recordCampClaim({ id: 'own', speakerId: 'a', subjectId: 'r', topic: 'idol_suspicion',
    stance: 'possible', day: 1 });
  const lie = resolveNpcCampExchange({ gm, memory, speaker: a, listener: b,
    activity: { ...activity, id: 'cover' }, random: () => 0 });
  assert.equal(lie.type, 'lie');
  assert.equal(memory.getCampClaims('a').find(claim => claim.id === 'cover:claim').truthfulness, false);
  assert.equal(memory.getCampClaims('b').find(claim => claim.id === 'cover:claim').truthfulness, undefined);
  assert.equal(memory.getCampClaims('c').length, 0);
  const snapshot = JSON.parse(JSON.stringify(memory.serialize())); memory.deserialize(snapshot);
  assert.equal(memory.getCampClaims('b').find(claim => claim.id === 'cover:claim').origin, 'direct_statement');
});

test('personality and owned experience tilt choices without fixing a single outcome', () => {
  const { activity, a, b, gm, tribe } = camp();
  const weight = (type, actor = a) => activity.scoreChoices(actor).find(choice => choice.type === type)?.weight || 0;
  const work = weight('gather_firewood'), social = weight('socialize');
  a.laziness = 9; a.connections = 9; a.likeability = 9;
  assert.ok(weight('gather_firewood') < work);
  assert.ok(weight('socialize') > social);
  a.paratend = 9; a.bigmove = 9;
  memory.recordCampObservation({ id: 'leaving1', actorId: 'b', witnessIds: ['a'], type: 'absence', day: 1 });
  memory.recordCampObservation({ id: 'leaving2', actorId: 'b', witnessIds: ['a'], type: 'absence', day: 1 });
  assert.ok(weight('investigate') > 0);
  memory.recordConversationIntent({ npcId: 'a', intent: 'warning', targetId: 'r', day: 1 });
  assert.ok(weight('strategy_conversation') > 0);
  tribe.stockpile.firewood = 30;
  assert.ok(weight('gather_firewood') > 0);
  assert.ok(activity.scoreChoices(a).length > 3);
  assert.equal(gm.dayTimer, 7200);
});

test('a legacy private mention does not populate all initialized memories or NPC dialogue intel', () => {
  const { gm, activity } = camp();
  activity.phaseId = activity.phase;
  for (const id of ['a', 'b', 'c', 'd']) memory.initNPC(id);
  memory.recordNamedIntel({ about: 'R', context: 'target', from: 'A', to: 'b', day: 1 });
  memory.recordIntel({ from: 'a', to: 'b', kind: 'targetClaim', claimedTarget: 'R', day: 1 });
  assert.equal(memory.memory.b.namedIntel.length, 1);
  assert.equal(memory.memory.c.namedIntel.length, 0);
  assert.equal(memory.memory.d.intel.length, 0);
  assert.equal(memory.getCampClaims('c').length, 0);
  assert.equal(memory.getRecentIntelAbout('r', 4, 'c').length, 0);
  const conversation = new ConversationSystem(gm);
  assert.equal(conversation._getBestIntelForTarget('r', 'R', 'c'), null);
  assert.equal(conversation._getBestIntelForTarget('r', 'R', 'b').type, 'target');
  assert.deepEqual(conversation._pickIntelTarget(gm.survivors.find(s => s.id === 'c')),
    { targetId: null, targetName: null });
});

test('memory decays by camp day, repeated behavior forms impressions, and durable events persist', () => {
  camp();
  for (let i = 0; i < 3; i++) memory.recordCampObservation({ id: `absence:${i}`,
    actorId: 'r', witnessIds: ['a'], type: 'absence', day: 1 });
  memory.recordCampObservation({ id: 'routine', actorId: 'r', witnessIds: ['a'], type: 'work', day: 1 });
  memory.recordCampObservation({ id: 'betrayal', actorId: 'r', witnessIds: ['a'], type: 'betrayal', day: 1 });
  const count = memory.getCampImpression('a', 'r', 'absence').count;
  assert.equal(count, 3);
  memory.advanceCampMemoryDay(4);
  assert.equal(memory.getCampObservations('a').some(x => x.id === 'routine'), false);
  assert.equal(memory.getCampObservations('a').some(x => x.id === 'betrayal'), true);
  assert.ok(memory.getCampImpression('a', 'r', 'absence').count < count);
  const snapshot = memory.serialize(); memory.advanceCampMemoryDay(4);
  assert.deepEqual(memory.serialize(), snapshot);
  for (let i = 0; i < 90; i++) memory.recordCampObservation({ id: `noise:${i}`, actorId: 'r', witnessIds: ['a'], type: 'work', day: 4 });
  assert.ok(memory.getCampObservations('a').length <= 48);
  assert.ok(memory.getCampObservations('a').some(x => x.id === 'betrayal'));
});

test('shared work and a social exchange consume one clock block and each resolve once after restore', () => {
  const original = camp();
  const { a, b, gm, activity, positions } = original;
  positions.a = positions.b = LocationKeys.JUNGLE_TRAIL;
  a.location = b.location = LocationKeys.JUNGLE_TRAIL;
  activity.phaseId = activity.phase;
  memory.recordCampObservation({ id: 'rumor', actorId: 'r', witnessIds: ['a'], type: 'absence', day: 1 });
  const partner = activity.start(b, { type: 'gather_firewood', location: LocationKeys.JUNGLE_TRAIL });
  const shared = activity.start(a, { type: 'gather_firewood', location: LocationKeys.JUNGLE_TRAIL,
    targetId: b.id, socialPurpose: 'social' });
  assert.equal(a.campActivity.type, b.campActivity.type);
  gm.consumeCampTime(210);
  const saved = JSON.parse(JSON.stringify({ members: original.tribe.members, state: activity.serialize(),
    positions, memory: memory.serialize(), dayTimer: gm.dayTimer, stockpile: original.tribe.stockpile,
    campLog: gm.campLog }));
  const restored = camp();
  restored.tribe.members.splice(0, restored.tribe.members.length, ...saved.members);
  Object.assign(restored.positions, saved.positions);
  Object.assign(restored.tribe.stockpile, saved.stockpile);
  restored.gm.dayTimer = saved.dayTimer; restored.gm.campLog = saved.campLog;
  memory.deserialize(saved.memory); restored.activity.deserialize(saved.state);
  restored.gm.consumeCampTime(210);
  assert.equal(restored.gm.dayTimer, 6780);
  assert.equal(restored.gm.campLog.filter(e => e.activityId === shared.id).length, 1);
  assert.equal(restored.gm.campLog.filter(e => e.activityId === partner.id).length, 1);
  assert.ok(restored.tribe.stockpile.firewood > 0);
  assert.ok(memory.getCampObservations('b').some(e => e.id === `${shared.id}:company`));
  assert.equal(restored.activity.complete(restored.tribe.members.find(s => s.id === a.id), shared), false);
});

test('a coworker leaving earlier resolves shared talk once while the remaining work continues', () => {
  const { gm, activity, a, b, positions } = camp();
  activity.phaseId = activity.phase;
  positions.a = positions.b = LocationKeys.JUNGLE_TRAIL;
  a.location = b.location = LocationKeys.JUNGLE_TRAIL;
  const short = activity.start(b, { type: 'gather_firewood', location: LocationKeys.JUNGLE_TRAIL,
    duration: 210 });
  const long = activity.start(a, { type: 'gather_firewood', location: LocationKeys.JUNGLE_TRAIL,
    targetId: b.id, socialPurpose: 'social' });
  gm.consumeCampTime(210);
  assert.equal(activity.resolved.has(short.id), true);
  assert.equal(a.campActivity.id, long.id);
  assert.equal(a.campActivity.socialResolved, true);
  assert.equal(memory.getCampObservations('b').filter(entry => entry.id === `${long.id}:company`).length, 1);
  const saved = JSON.parse(JSON.stringify({ members: gm.tribes[0].members, positions,
    state: activity.serialize(), campLog: gm.campLog, stockpile: gm.tribes[0].stockpile,
    memory: memory.serialize(), dayTimer: gm.dayTimer }));
  const resumed = camp(); resumed.tribe.members.splice(0, resumed.tribe.members.length, ...saved.members);
  Object.assign(resumed.positions, saved.positions);
  Object.assign(resumed.tribe.stockpile, saved.stockpile);
  resumed.gm.dayTimer = saved.dayTimer; resumed.gm.campLog = saved.campLog;
  memory.deserialize(saved.memory); resumed.activity.deserialize(saved.state);
  resumed.gm.consumeCampTime(210);
  assert.equal(resumed.gm.campLog.filter(entry => entry.activityId === long.id).length, 1);
  assert.equal(memory.getCampObservations('b').filter(entry => entry.id === `${long.id}:company`).length, 1);
});

test('interrupting a reserved social block releases both people without creating content', () => {
  const { activity, a, b } = camp();
  activity.phaseId = activity.phase;
  const talk = activity.start(a, { type: 'strategy_conversation', targetId: b.id,
    location: LocationKeys.BEACH });
  assert.equal(b.campActivity.id, talk.id);
  assert.equal(activity.interrupt(a, 'urgent_information', 7100), true);
  assert.equal(b.campActivity, null);
  assert.equal(activity.complete(a, talk), false);
  assert.equal(memory.getCampClaims('b').length, 0);
});

test('investigation sees a search only if the investigator reaches its actual location', () => {
  const { activity, a, b, c, positions, gm } = camp();
  activity.phaseId = activity.phase;
  positions.a = positions.b = LocationKeys.JUNGLE_TRAIL;
  a.location = b.location = LocationKeys.JUNGLE_TRAIL;
  activity.start(b, { type: 'idol_hunt', location: LocationKeys.JUNGLE_TRAIL, duration: 500 });
  const investigation = activity.start(a, { type: 'investigate', targetId: b.id,
    location: LocationKeys.JUNGLE_TRAIL, duration: 120 });
  gm.dayTimer = 7080;
  activity.complete(a, investigation, gm.dayTimer);
  assert.equal(memory.getCampClaims(a.id, { topic: 'idol_suspicion' })[0].origin, 'firsthand');
  assert.equal(memory.getCampClaims(c.id).length, 0);
  assert.equal(memory.getCampObservations(c.id).length, 0);
});

test('restByTribe survives GameManager save and continues with separate shelter intervals', () => {
  const original = gameManager.createSavePayload();
  const oldScreen = gameManager._updateScreenForState;
  try {
    const people = [{ id: 'u', isPlayer: true, rest: 30, water: 80, hunger: 80 },
      { id: 'v', rest: 30, water: 80, hunger: 80 }];
    gameManager._updateScreenForState = () => {};
    gameManager.tribes = [{ id: 'unsheltered', shelter: 0, members: [people[0]] },
      { id: 'sheltered', shelter: 2, members: [people[1]] }];
    gameManager.survivors = people; gameManager.player = people[0];
    gameManager.gameState = 'camp'; gameManager.gamePhase = 'preChallenge';
    gameManager.campNeedElapsed = { water: 0, hunger: 0, rest: 0 };
    advanceCampNeeds(gameManager, 300);
    const saved = JSON.parse(JSON.stringify(gameManager.createSavePayload()));
    assert.deepEqual(saved.gameManager.campNeedElapsed.restByTribe, { unsheltered: 60, sheltered: 300 });
    advanceCampNeeds(gameManager, 180);
    const expected = gameManager.tribes.map(t => t.members[0].rest);
    const fractional = { ...gameManager.campNeedElapsed.restByTribe };
    gameManager.restoreSavePayload(saved);
    advanceCampNeeds(gameManager, 180);
    assert.deepEqual(gameManager.tribes.map(t => t.members[0].rest), expected);
    assert.deepEqual(gameManager.campNeedElapsed.restByTribe, fractional);
    delete saved.gameManager.campNeedElapsed.restByTribe;
    assert.equal(gameManager.restoreSavePayload(saved), true);
    assert.deepEqual(gameManager.campNeedElapsed.restByTribe, {});
    advanceCampNeeds(gameManager, 60);
    assert.ok(Object.values(gameManager.campNeedElapsed.restByTribe).every(Number.isFinite));
  } finally {
    gameManager.restoreSavePayload(original);
    gameManager._updateScreenForState = oldScreen;
  }
});
