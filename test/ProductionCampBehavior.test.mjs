import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import data from '../src/modules/data/GameData.js';
import { getCampBehaviorProfile as profile, campWorkSkill, campBuildSuccessChance } from '../src/modules/systems/CampBehaviorProfile.js';
import { campEvidenceRank, ownedCampKnowledge, campTargetPreference, selectCampStrategicIntent } from '../src/modules/systems/CampKnowledge.js';
import { LocationKeys as L } from '../src/modules/core/LocationKeys.js';
import { physicalCampLocation } from '../src/modules/locations/LocationUtils.js';
import { normalizeCampState } from '../src/modules/systems/CampState.js';

globalThis.window ||= { debugBanner() {} };
globalThis.window.debugBanner ||= () => {};
globalThis.document ||= { getElementById: () => null, querySelector: () => null };
globalThis.HTMLElement ||= class HTMLElement {};
const { default: memory } = await import('../src/modules/systems/SocialMemorySystem.js');
const { gameManager } = await import('../src/modules/core/GameManager.js');
const { default: CampActivitySystem } = await import('../src/modules/systems/CampActivitySystem.js');
const { resolveNpcCampExchange } = await import('../src/modules/systems/CampSocialResolution.js');
const { default: TribalKnowledgeModel } = await import('../src/modules/systems/TribalKnowledgeModel.js');
const { composeNpcAnswer } = await import('../src/modules/systems/TribalDialogueComposer.js');
const { default: strategy } = await import('../src/modules/systems/StrategyPhaseSystem.js');

const cast = data.getSurvivors();
const byName = firstName => cast.find(s => s.firstName === firstName);
function camp(random = () => .99) {
  memory.deserialize(null);
  const members = [{ id: 'p', firstName: 'You', isPlayer: true, location: L.BEACH },
    ...structuredClone(cast).map(s => ({ ...s, location: L.BEACH }))];
  const positions = Object.fromEntries(members.map(s => [s.id, s.location]));
  const tribe = normalizeCampState({ id: 'red', members, fire: 0, shelter: 0,
    stockpile: { firewood: 0, bamboo: 0, palms: 20, water: 0, coconuts: 0, fish1: 0 },
    day1Plan: { assignments: { fire: [], shelter: [], wood: [], resources: [], float: [] } } });
  const gm = { day: 3, dayTimer: 7200, flags: {}, systems: {}, survivors: members, tribes: [tribe],
    gamePhase: 'preChallenge', gameState: 'camp', campLog: [], gameSettings: { enableIdols: true },
    getPlayerTribe: () => tribe, getPlayerSurvivor: () => members[0], getTrust: () => 70,
    ensureStockpileExists: () => tribe.stockpile,
    addToStockpile: (_, key, n) => tribe.stockpile[key] = (tribe.stockpile[key] || 0) + n,
    consumeFromStockpile: (_, key, n) => { tribe.stockpile[key] -= n; return true; } };
  gm.systems.npcLocationSystem = { getLocation: id => positions[id], updateNpcLocation(id, to) {
    positions[id] = to; members.find(s => String(s.id) === String(id)).location = to;
  } };
  gm.systems.socialMemorySystem = memory;
  gm.systems.taskSimulationSystem = { getAssignmentsFromPlanOrTasks: () => tribe.day1Plan.assignments };
  gm.systems.relationshipSystem = { getRelationship: () => ({ value: 50 }), changeRelationship() {} };
  gm.systems.allianceSystem = { areAllied: () => false, getAllianceAffinity: () => 0 };
  const activity = new CampActivitySystem(gm, random); gm.systems.campActivitySystem = activity;
  activity.phaseId = activity.phase;
  window.gameManager = gm; window.campScreen = { currentView: L.BEACH };
  return { gm, tribe, positions, activity, npc: name => members.find(s => s.firstName === name) };
}
const weight = (activity, npc, type) => activity.scoreChoices(npc).find(c => c.type === type)?.weight || 0;

test('all protected cast values match the numerically exact main baseline, including traitClass', () => {
  const expected = JSON.parse(fs.readFileSync(new URL('./fixtures/protected-cast-main.json', import.meta.url)));
  assert.equal(cast.length, 18);
  for (const survivor of cast) assert.deepEqual(Object.fromEntries(Object.keys(expected[survivor.id])
    .map(key => [key, survivor[key]])), expected[survivor.id]);
});

test('all 18 behavioral calibrations match the approved target table', () => {
  const fields = 'bigmove idolhunt idolshare honesty risk aggression paratend leader fishing laziness firemaking'.split(' ');
  const values = [
    [6,7,4,7,9,4,4,6,10,1,9], [8,8,5,6,8,6,5,5,7,3,3], [10,7,6,5,9,8,5,8,5,1,6],
    [10,7,4,4,7,9,6,10,6,2,10], [7,6,3,6,6,5,5,5,5,3,5], [8,9,9,8,7,5,4,8,5,2,6],
    [9,7,7,9,4,2,2,9,5,2,6], [10,8,6,7,6,3,2,10,5,1,6], [10,10,4,1,10,9,10,9,3,3,9],
    [10,2,4,6,6,3,5,6,4,5,2], [7,6,8,6,4,8,4,4,7,3,5], [9,10,2,4,9,5,7,6,5,3,5],
    [10,8,10,3,9,4,4,9,4,4,6], [6,4,6,8,6,3,6,4,4,3,6], [7,5,5,7,5,4,3,8,6,1,10],
    [9,9,2,4,9,5,4,8,5,5,7], [8,9,2,7,8,6,7,5,4,4,7], [10,10,6,1,10,10,9,9,3,6,5]
  ];
  cast.forEach((s, i) => assert.deepEqual(fields.map(key => s[key]), values[i], s.name));
});

test('actual production profiles distinguish providers, fire builders, idol hunters, and quiet leaders', () => {
  const p = name => profile(byName(name));
  assert.ok(p('Ozzy').fishingSkill > p('Cirie').fishingSkill + .4);
  assert.ok(p('Boston Rob').fireSkill > p('Jay').fireSkill + .4);
  assert.ok(p('Wendell').fireSkill > cast.reduce((n, s) => n + profile(s).fireSkill, 0) / cast.length);
  assert.ok(p('Tony').idolDrive > p('Michele').idolDrive);
  assert.ok(p('Tony').paranoiaDrive > p('Yul').paranoiaDrive);
  assert.ok(p('Russell').idolDrive > p('Cirie').idolDrive);
  assert.ok(p('Sandra').workDrive > p('Russell').workDrive);
  assert.ok(p('Kim').leadershipDrive > .9 && p('Kim').paranoiaDrive < .3 && p('Kim').confrontationDrive < .4);
  assert.ok(p('Jeremy').advantageSharing > p('Kelley').advantageSharing);
  assert.ok(p('Tyson').idolDrive >= .9 && p('Tyson').riskTolerance >= .9 && p('Tyson').confrontationDrive < .6);
});

test('missing/custom/old attributes have finite neutral fallbacks without persisting synthetic ratings', () => {
  const custom = { id: 'custom', laziness: NaN, idolhunt: null, fishing: Infinity };
  const before = { ...custom };
  assert.deepEqual(profile(custom), profile({}));
  assert.ok(Object.values(profile(custom)).every(n => n > 0 && n <= 1));
  assert.deepEqual(custom, before);
  assert.ok(!('survivalSkill' in custom) && !('workEthic' in custom));
});

test('production choices tilt fishing, fire, searching, observation and investigation without fixing a routine', () => {
  const { activity, npc } = camp();
  assert.ok(weight(activity, npc('Ozzy'), 'fish') > weight(activity, npc('Cirie'), 'fish'));
  assert.ok(weight(activity, npc('Tony'), 'idol_hunt') > weight(activity, npc('Michele'), 'idol_hunt'));
  assert.ok(weight(activity, npc('Tony'), 'observe') > weight(activity, npc('Yul'), 'observe'));
  for (const observer of ['Tony', 'Yul']) for (let i = 0; i < 3; i++) memory.recordCampObservation({
    id: `${observer}:${i}`, actorId: npc('Carolyn').id, witnessIds: [npc(observer).id], type: 'absence', day: 3 });
  assert.ok(weight(activity, npc('Tony'), 'investigate') > weight(activity, npc('Yul'), 'investigate'));
  for (const person of [npc('Tony'), npc('Russell'), npc('Cirie'), npc('Ozzy')]) {
    const choices = activity.scoreChoices(person), total = choices.reduce((n, c) => n + c.weight, 0);
    assert.ok(choices.length > 4 && choices.every(c => c.weight > 0 && c.weight < total));
  }
});

test('work avoidance, responsibility, leadership, rest and urgent strategy remain contextual', () => {
  const { gm, tribe, activity, npc } = camp();
  const actor = npc('Sandra'), base = weight(activity, actor, 'gather_firewood');
  actor.laziness = 9;
  assert.ok(weight(activity, actor, 'gather_firewood') < base);
  tribe.day1Plan.assignments.wood = [actor.id];
  assert.ok(weight(activity, actor, 'gather_firewood') > 0);
  const withRole = weight(activity, actor, 'gather_firewood');
  tribe.day1Plan.assignments.wood = [];
  assert.ok(withRole > weight(activity, actor, 'gather_firewood'));
  actor.leader = 2; const lowLead = weight(activity, actor, 'gather_firewood');
  actor.leader = 10; assert.ok(weight(activity, actor, 'gather_firewood') > lowLead);
  const resting = weight(activity, actor, 'rest'); actor.rest = 10;
  assert.ok(weight(activity, actor, 'rest') > resting);
  actor.risk = actor.aggression = 2;
  memory.recordConversationIntent({ npcId: actor.id, targetId: npc('Tony').id, intent: 'warning', day: gm.day, campTime: 7000 });
  const cautious = weight(activity, actor, 'strategy_conversation');
  actor.risk = actor.aggression = 10;
  assert.ok(weight(activity, actor, 'strategy_conversation') > cautious);
  tribe.stockpile.firewood = 40;
  assert.ok(weight(activity, actor, 'gather_firewood') < lowLead);
});

test('context-specific fishing output and fire success are bounded distributions with no automatic success', () => {
  const { gm, tribe, activity, npc } = camp();
  let step = 0; activity.random = () => (step++ % 100) / 100;
  const catchTotal = name => {
    const before = tribe.stockpile.fish1;
    for (let i = 0; i < 100; i++) activity.resolveWork(npc(name), { id: `${name}:fish:${i}`, type: 'fish', location: L.ROCKY_SHORE }, 6000);
    return tribe.stockpile.fish1 - before;
  };
  assert.ok(catchTotal('Ozzy') > catchTotal('Cirie'));
  const fireWins = name => {
    let wins = 0; step = 0;
    for (let i = 0; i < 100; i++) {
      tribe.fire = 0; tribe.stockpile.firewood = 20;
      activity.resolveWork(npc(name), { id: `${name}:fire:${i}`, type: 'build_fire', location: L.CAMPFIRE }, 5000);
      wins += tribe.fire;
    }
    return wins;
  };
  const strong = fireWins('Boston Rob'), weak = fireWins('Jay');
  assert.ok(strong > weak + 20 && strong < 100 && weak > 0);
  assert.ok(gm.campLog.every(e => !e.amount || Number.isFinite(e.amount) && e.amount >= 0));
  assert.ok(campBuildSuccessChance(npc('Wendell'), 'build_fire') < 1);
  const skill = campWorkSkill(npc('Ozzy'), 'gather_firewood');
  npc('Ozzy').firemaking = 1;
  assert.equal(campWorkSkill(npc('Ozzy'), 'gather_firewood'), skill);
});

test('physical privacy includes the player in Firewood/Bamboo/Fishing/Fire subviews', () => {
  const { gm, npc, positions } = camp(() => 0);
  const a = npc('Tony'), b = npc('Jeremy');
  memory.recordConversationIntent({ npcId: a.id, targetId: npc('Sandra').id, intent: 'targeting', day: 3, campTime: 7000 });
  for (const [view, physical] of [[L.FIREWOOD,L.JUNGLE_TRAIL],[L.BAMBOO,L.JUNGLE_TRAIL],[L.FISHING,L.ROCKY_SHORE],[L.FIRE,L.CAMPFIRE]]) {
    window.campScreen.currentView = view; gm.getPlayerSurvivor().location = physical; positions[a.id] = positions[b.id] = physical;
    assert.equal(physicalCampLocation(view), physical);
    const result = resolveNpcCampExchange({ gm, memory, speaker: a, listener: b, random: () => 0,
      activity: { id: view, type: 'strategy_conversation', targetId: b.id, location: physical, endsAt: 6000 } });
    assert.notEqual(result.type, 'pitch');
    assert.equal(memory.getCampClaims(b.id).length, 0);
  }
});

test('strategic intent ordering uses current day, newest remaining camp time, urgency, and valid targets', () => {
  const { gm, npc } = camp(); const a = npc('Tony'), r = npc('Sandra'), b = npc('Jeremy');
  const intents = [{ day: 2, campTime: 100, targetId: r.id, intent: 'targeting' },
    { day: 3, campTime: 7000, targetId: r.id, intent: 'targeting' },
    { day: 3, campTime: 5000, targetId: b.id, intent: 'warning', urgency: 1 },
    { day: 3, campTime: 5000, targetId: r.id, intent: 'targeting', urgency: .2 }];
  assert.equal(selectCampStrategicIntent(intents, gm).targetId, b.id);
  b.isOut = true;
  assert.equal(selectCampStrategicIntent(intents, gm).targetId, r.id);
  b.isOut = false;
  memory.recordConversationIntent({ npcId: a.id, ...intents[1] });
  memory.recordConversationIntent({ npcId: a.id, ...intents[2] });
  window.campScreen.currentView = L.BEACH;
  // Keep the speaker/listener alone for the actual pitch.
  const pair = { ...gm, getPlayerTribe: () => ({ members: [a, r, b] }),
    systems: { ...gm.systems, npcLocationSystem: { getLocation: id => String(id) === String(b.id) ? L.BEACH : L.WATER_WELL } } };
  const result = resolveNpcCampExchange({ gm: pair, memory, speaker: a, listener: r, random: () => 0,
    activity: { id: 'newest', type: 'strategy_conversation', location: L.WATER_WELL, targetId: r.id, endsAt: 4500 } });
  assert.equal(result.subjectId, b.id);
});

test('firsthand > direct statement > relayed hearsay > inference; source chains and hidden lies survive JSON safely', () => {
  const { gm, npc } = camp(); const a = npc('Tony'), b = npc('Jeremy'), c = npc('Yul');
  memory.recordCampClaim({ id: 'fact', speakerId: a.id, listenerIds: [b.id], subjectId: npc('Carolyn').id,
    topic: 'idol_suspicion', stance: 'searching', origin: 'firsthand', confidence: .9, day: gm.day });
  memory.shareCampClaim({ fromId: b.id, toId: c.id, claimId: 'fact' });
  const first = memory.getCampClaims(a.id)[0], direct = memory.getCampClaims(b.id)[0], heard = memory.getCampClaims(c.id)[0];
  assert.ok(campEvidenceRank(first) > campEvidenceRank(direct) && campEvidenceRank(direct) > campEvidenceRank(heard));
  assert.ok(first.confidence > direct.confidence && direct.confidence > heard.confidence);
  assert.equal(campEvidenceRank({ origin: 'inference' }), 1);
  memory.recordCampClaim({ id: 'lie', speakerId: a.id, listenerIds: [b.id], subjectId: c.id,
    topic: 'target', stance: 'yes', truthfulness: false, day: gm.day });
  const snapshot = JSON.parse(JSON.stringify(memory.serialize())); memory.deserialize(snapshot);
  assert.deepEqual(memory.getCampClaims(c.id)[0].sourceChain, heard.sourceChain);
  assert.equal(memory.getCampClaims(b.id).find(e => e.id === 'lie').truthfulness, undefined);
  assert.ok(ownedCampKnowledge(memory, b.id).every(e => !('truthfulness' in e)));
  assert.equal(memory.getCampClaims(b.id).find(e => e.id === 'lie').challenged, undefined);
  // Old #343 saves stay uncertain hearsay rather than being silently promoted.
  snapshot.memory[b.id].campClaims[0].origin = 'hearsay'; memory.deserialize(snapshot);
  assert.equal(ownedCampKnowledge(memory, b.id)[0].provenance, 'hearsay');
});

test('many weak rumors cannot erase firsthand evidence, while contradictory direct accounts create uncertainty', () => {
  const { gm, npc } = camp(); const owner = npc('Jeremy'), subject = npc('Carolyn');
  memory.recordCampClaim({ id: 'seen', speakerId: owner.id, subjectId: subject.id,
    topic: 'idol_suspicion', stance: 'searching', origin: 'firsthand', confidence: .95, day: gm.day });
  for (let i = 0; i < 65; i++) memory.recordCampClaim({ id: `rumor:${i}`, speakerId: npc('Tony').id,
    listenerIds: [owner.id], subjectId: subject.id, topic: 'idol_suspicion', stance: 'unlikely',
    origin: 'inference', confidence: .2, day: gm.day });
  const seen = memory.getCampClaims(owner.id).find(e => e.id === 'seen');
  assert.equal(seen.confidence, .95); assert.equal(seen.challenged, undefined);
  assert.equal(memory.getCampClaims(owner.id).length, 40);
  assert.ok(campTargetPreference(memory, owner.id, subject.id, gm.day) > 0);
  memory.recordCampClaim({ id: 'direct1', speakerId: npc('Tony').id, listenerIds: [owner.id], subjectId: subject.id,
    topic: 'target', stance: 'yes', day: gm.day });
  memory.recordCampClaim({ id: 'direct2', speakerId: npc('Yul').id, listenerIds: [owner.id], subjectId: subject.id,
    topic: 'target', stance: 'no', day: gm.day });
  assert.ok(memory.getCampClaims(owner.id).find(e => e.id === 'direct1').challenged);
  assert.ok(memory.getCampClaims(owner.id).find(e => e.id === 'direct2').challenged);
});

test('a private pre-immunity pitch affects only its owners in later Strategy and Tribal reasoning', () => {
  const { gm, npc, tribe } = camp(); const a = npc('Tony'), b = npc('Jeremy'), c = npc('Yul'), subject = npc('Sandra');
  memory.recordCampObservation({ id: 'meeting', actorId: a.id, participantIds: [b.id], witnessIds: [c.id],
    type: 'seen_together', visibility: 'private', day: gm.day });
  memory.recordCampClaim({ id: 'pitch', speakerId: a.id, listenerIds: [b.id], subjectId: subject.id,
    topic: 'target', stance: 'consider', confidence: .8, day: gm.day, campTime: 5100, salience: 'high' });
  const saved = JSON.parse(JSON.stringify(memory.serialize())); memory.deserialize(saved);
  const fields = ['day','gamePhase','gameState','systems','tribes','survivors','player','flags'];
  const previous = Object.fromEntries(fields.map(k => [k, gameManager[k]]));
  try {
    Object.assign(gameManager, { day: gm.day, gamePhase: 'postChallenge', gameState: 'camp',
      systems: gm.systems, tribes: [tribe], survivors: tribe.members, player: tribe.members[0], flags: {} });
    assert.ok(strategy.campPreference(b.id, subject.id) > 0);
    assert.equal(strategy.campPreference(c.id, subject.id), 0);
    // Same baseline threats/relationships: test the actual weighted selection,
    // using one roll between the uninformed and informed cumulative boundaries.
    const members = [subject, c]; subject.isPlayer = c.isPlayer = false;
    const baselineRandom = Math.random;
    try {
      strategy.reset({ skipGameManager: true });
      strategy.personalTargetId = subject.id;
      Math.random = () => .99;
      strategy.seedNpcIntentTargetsForPhase();
      assert.notEqual(strategy.getNpcTargetIntent(c.id).targetId, subject.id,
        'a private player pick cannot seed every NPC with that target');
      Math.random = () => .53;
      assert.equal(strategy.pickTargetForAction('SOFT_COUNTER', members, b), subject.id);
      assert.equal(strategy.pickTargetForAction('SOFT_COUNTER', [subject, b], c), b.id);
    } finally { Math.random = baselineRandom; strategy.reset({ skipGameManager: true }); }
    const knowledge = new TribalKnowledgeModel(gameManager, tribe.members);
    assert.ok(knowledge.factsFor(b.id).some(f => f.type === 'campClaim' && f.subjectId === String(subject.id)));
    assert.ok(!knowledge.factsFor(c.id).some(f => f.type === 'campClaim'));
    assert.ok(knowledge.factsFor(c.id).some(f => f.type === 'campObservation'));
    assert.ok(knowledge.publicFacts().every(f => f.source !== 'campMemory'));
    assert.ok(knowledge.factsFor(b.id).filter(f => f.source === 'campMemory').every(f => !knowledge.jeffCanReference(f)));
  } finally { Object.assign(gameManager, previous); }
});

test('owned idol rumor feeds qualified Tribal dialogue without public/Jeff knowledge or hidden truth', () => {
  const { gm, npc, tribe } = camp(); const a = npc('Tony'), b = npc('Jeremy'), c = npc('Yul');
  memory.recordCampClaim({ id: 'rumor', speakerId: a.id, listenerIds: [b.id], subjectId: c.id,
    topic: 'idol_suspicion', stance: 'possible', origin: 'inference', confidence: .4, day: gm.day });
  const knowledge = new TribalKnowledgeModel(gm, tribe.members);
  assert.ok(knowledge.factsFor(b.id).some(f => f.visibility === 'RUMOR' && f.details?.sourceId === a.id));
  assert.ok(!knowledge.factsFor(c.id).some(f => f.type === 'campClaim'));
  const answer = speaker => composeNpcAnswer({ speaker, topic: 'idol_paranoia', knowledge, members: tribe.members, day: gm.day }).text;
  assert.match(answer(b), /Talk is not proof/);
  assert.doesNotMatch(answer(c), /Talk is not proof/);
  assert.equal(knowledge.publicFacts().filter(f => f.source === 'campMemory').length, 0);
});

test('advantage disclosure uses actual idolshare and real privacy, rather than idol-hunting aptitude', () => {
  const { gm, npc, tribe } = camp(); const listener = npc('Yul');
  gm.systems.allianceSystem.getAllianceAffinity = () => 1;
  const exchange = speaker => {
    speaker.hasIdol = true;
    gm.systems.npcLocationSystem.updateNpcLocation(speaker.id, L.WATER_WELL);
    gm.systems.npcLocationSystem.updateNpcLocation(listener.id, L.WATER_WELL);
    const pair = { ...gm, getPlayerTribe: () => ({ members: [speaker, listener] }) };
    return resolveNpcCampExchange({ gm: pair, memory, speaker, listener, random: () => .2,
      activity: { id: `disclosure:${speaker.id}`, type: 'strategy_conversation', location: L.WATER_WELL,
        targetId: listener.id, endsAt: 6000 } });
  };
  assert.equal(exchange(npc('Jeremy')).type, 'disclosure');
  assert.notEqual(exchange(npc('Kelley')).type, 'disclosure');
  const known = memory.getCampClaims(listener.id).find(e => e.topic === 'idol_possession');
  assert.equal(known.origin, 'direct_statement');
  assert.equal(memory.getCampClaims(npc('Sandra').id).length, 0);
});
