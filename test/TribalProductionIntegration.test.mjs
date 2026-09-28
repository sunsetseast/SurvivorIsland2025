import test from 'node:test';
import assert from 'node:assert/strict';
import gameData from '../src/modules/data/GameData.js';
import AllianceSystem from '../src/modules/systems/AllianceSystem.js';
import DealSystem, { DealTypes } from '../src/modules/systems/DealSystem.js';
import socialMemory from '../src/modules/systems/SocialMemorySystem.js';
import TribalKnowledgeModel from '../src/modules/systems/TribalKnowledgeModel.js';
import TribalQuestionEngine from '../src/modules/systems/TribalQuestionEngine.js';
import { normalizedThreat } from '../src/modules/systems/TribalThreat.js';
import { decideNpcIdolPlay } from '../src/modules/systems/TribalIdolPerception.js';
import { composeNpcAnswer } from '../src/modules/systems/TribalDialogueComposer.js';
import TribalCouncilView from '../src/modules/screens/TribalCouncilView.js';

function productionGame(t) {
  const previousWindow = globalThis.window;
  const previousMemory = socialMemory.serialize();
  const members = gameData.getSurvivors().slice(0, 4).map(member => ({ ...member, dealIds: [], isOut: false }));
  members[0].isPlayer = true;
  const trust = new Map();
  const key = (a, b) => [String(a), String(b)].sort().join(':');
  const gm = { survivors: members, tribes: [{ id: 1, tribeId: 1, members }], systems: {},
    getDay: () => 4, getCurrentDay: () => 4, getGamePhase: () => 'tribalCouncil',
    getTribes: () => gm.tribes, getPlayerTribe: () => gm.tribes[0], getPlayerSurvivor: () => members[0],
    hasImmunity: () => false, getTrust: (a, b) => trust.get(key(a, b)) ?? 50,
    changeTrust(a, b, delta) { trust.set(key(a, b), Math.max(0, Math.min(100, this.getTrust(a, b) + delta))); } };
  gm.systems.strategyPhaseSystem = { strategyFacts: [], getSummaryFacts() { return this.strategyFacts; },
    getNpcTargetIntent: () => null };
  gm.systems.socialMemorySystem = socialMemory;
  gm.systems.allianceSystem = new AllianceSystem(gm);
  gm.systems.dealSystem = new DealSystem(gm);
  socialMemory.deserialize(null);
  globalThis.window = { gameManager: gm };
  t.after(() => { socialMemory.deserialize(previousMemory); globalThis.window = previousWindow; });
  return { gm, members, trust, key, knowledge: () => new TribalKnowledgeModel(gm, members) };
}

test('actual numeric cast and private production alliance inform members, never outsiders or Jeff', t => {
  const { gm, members, trust, key, knowledge } = productionGame(t);
  const plan = () => new TribalQuestionEngine(gm).generateQuestions({ attendingTribeId: 1 })
    .map(question => [question.id, question.focusSurvivorId, question.questionText]);
  const publicPlan = plan();
  const alliance = gm.systems.allianceSystem.createAlliance({ name: 'Secret Pair', type: 'final_two',
    tribeId: 1, memberIds: [1, 2], leaderId: 1, sincerityMap: { 1: 'real', 2: 'real' } });
  assert.deepEqual(Object.keys(alliance).sort(), ['active', 'cohesion', 'createdDay', 'id', 'leaderId',
    'memberIds', 'name', 'notes', 'sincerityMap', 'targetId', 'tribeId', 'type'].sort());
  const model = knowledge();
  assert.deepEqual(model.getKnownAllies('1').map(member => member.id), [2]);
  assert.equal(model.getKnownAllies(3).length, 0);
  assert.equal(model.getKnownAlliances(3).length, 0);
  assert.equal(model.publicFacts().some(fact => fact.type === 'allianceMembership'), false);
  const questions = new TribalQuestionEngine(gm).generateQuestions({ attendingTribeId: 1 });
  assert.deepEqual(plan(), publicPlan);
  assert.ok(questions.every(question => !question.questionText.includes('Secret Pair')));
  assert.ok(questions.some(question => question.responseOptions.some(option =>
    option.effects.trust.some(effect => effect.survivorId === 2))));
  const survival = questions.find(question => question.topic === 'loyalty_vs_survival');
  assert.ok(survival.responseOptions.some(option => option.id === 'reassure-alliance' && option.subjectId === 2));
  assert.ok(survival.responseOptions.some(option => option.id === 'distance-ally' && option.subjectId === 2));
  const beforeTrust = model.perceivedDanger(members[0]);
  trust.set(key(1, 2), 72);
  assert.ok(knowledge().perceivedDanger(members[0]) < beforeTrust);
  members[1].isOut = true;
  assert.deepEqual(knowledge().getKnownAllies(1), []);
  alliance.active = false;
  assert.equal(knowledge().getKnownAlliances(1).length, 0);
});

test('Live Tribal selects an actual ally and never offers an empty ally action', t => {
  const { gm, key, trust } = productionGame(t);
  const signal = { type: 'lateTargetSwitch', speakerId: 2, toPlayer: true,
    fromTargetId: 3, toTargetId: 4, severity: .8 };
  gm.systems.strategyPhaseSystem.strategyFacts.push(signal);
  const engine = new TribalQuestionEngine(gm);
  const without = engine.generateLiveTribalMoment({ attendingTribeId: 1 });
  assert.equal(without.responseOptions.some(option => option.id === 'lock-ally'), false);
  assert.ok(without.responseOptions.every(option => Object.values(option.effects).flat().length > 0));
  gm.systems.allianceSystem.createAlliance({ memberIds: [1, 3], tribeId: 1 });
  const withAlly = engine.generateLiveTribalMoment({ attendingTribeId: 1 });
  const option = withAlly.responseOptions.find(choice => choice.id === 'lock-ally');
  assert.match(option.label, /Wendell|Parvati|Cirie|Sandra|Ozzy|Jay|Kim|Tony|Jeremy|Tyson|Kelley|Michele|Natalie|Russell|Carolyn|Andrea|Yul/); // Real first name.
  assert.equal(option.effects.trust[0].survivorId, 3);
  engine.applyResponse(withAlly, option);
  assert.equal(trust.get(key(1, 3)), 52);
  assert.equal(trust.has(key(1, 2)), false);
});

test('actual DealSystem terms stay private and modestly inform the participants', t => {
  const { gm, members, trust, key, knowledge } = productionGame(t);
  const system = gm.systems.dealSystem;
  for (const [type, terms] of [
    [DealTypes.VOTE_TOGETHER, { targetId: 3 }],
    [DealTypes.MUTUAL_PROTECTION, { protectedId: 2 }],
    [DealTypes.FINAL_TWO, { duration: 'until_final_two' }]
  ]) {
    const deal = system.createDeal({ type, parties: [1, 2], terms });
    system.acceptDeal(deal.id, 2);
  }
  const facts = knowledge().getKnownDeals('1');
  assert.deepEqual(facts.map(fact => fact.details.dealType).sort(),
    [DealTypes.FINAL_TWO, DealTypes.MUTUAL_PROTECTION, DealTypes.VOTE_TOGETHER].sort());
  assert.equal(facts.find(fact => fact.details.dealType === DealTypes.VOTE_TOGETHER).targetId, '3');
  assert.equal(facts.find(fact => fact.details.dealType === DealTypes.MUTUAL_PROTECTION).details.protectedId, '2');
  assert.equal(knowledge().getKnownDeals(2).length, 3);
  assert.equal(knowledge().getKnownDeals(3).length, 0);
  assert.equal(facts.some(fact => knowledge().jeffCanReference(fact)), false);
  trust.set(key(1, 2), 75);
  const safer = knowledge().perceivedDanger(members[0]);
  trust.set(key(1, 2), 40);
  assert.ok(knowledge().perceivedDanger(members[0]) > safer);
  const line = composeNpcAnswer({ speaker: members[1], topic: 'alliance_cracks', mood: 'calm',
    knowledge: knowledge(), members, day: 4 }).text;
  assert.doesNotMatch(line, /FINAL_TWO|secret Final Two|deal_/);
  assert.ok(new TribalQuestionEngine(gm).generateQuestions({ attendingTribeId: 1 })
    .every(question => !/FINAL_TWO|deal_/.test(question.questionText)));
});

test('legacy owned memories preserve promise, betrayal, gossip and discovered-lie visibility', t => {
  const { gm, knowledge } = productionGame(t);
  socialMemory.recordPromise(2, 1, 'final_two');
  socialMemory.recordBetrayal(2, 1, 'broken promise');
  socialMemory.recordGossip(1, 2, 3, 'target', 'uncertain');
  socialMemory.recordTargetRequest(1, 2, 3);
  socialMemory.recordLie(1, 3, 'target');
  // Older saves can hold the witnessed copy in the listener's personal store.
  socialMemory.initNPC(2);
  socialMemory.memory[2].lies.push({ ...socialMemory.memory[1].lies[0] });
  socialMemory.markLieDiscovered(2, 1, 'target');
  const model = knowledge();
  const privateTypes = model.factsFor(2).map(fact => fact.type);
  assert.ok(['rememberedPromise', 'rememberedBetrayal', 'heardGossip', 'targetRequest', 'discoveredLie']
    .every(type => privateTypes.includes(type)));
  assert.equal(model.factsFor(4).some(fact => privateTypes.includes(fact.type)), false);
  assert.equal(model.factsFor(1).some(fact => fact.type === 'discoveredLie'), false);
  assert.equal(model.publicFacts().some(fact => privateTypes.includes(fact.type)), false);
  const debug = model.debugSnapshot(2);
  assert.equal(debug.discoveredLies.length, 1);
  assert.ok(debug.dangerBreakdown.factors.length);
  assert.equal(gm.systems.socialMemorySystem, socialMemory);
});

test('public Tribal callout changes idol perception without ever reading secret ballots', t => {
  const { gm, members, knowledge } = productionGame(t);
  const holder = members[1]; holder.hasIdol = true; holder.suspicion = 70;
  const engine = new TribalQuestionEngine(gm);
  const baseline = decideNpcIdolPlay(holder, knowledge());
  const bystanderBefore = knowledge().perceivedDanger(members[3]);
  assert.equal(baseline.play, false);
  const response = { id: 'call-out', subjectId: 2, label: 'Name Jay', text: 'Jay is a threat.',
    effects: { trust: [], relationship: [], suspicion: [], threat: [], targetHeat: [] } };
  engine.applyResponse({ topic: 'tribe_state' }, response);
  const after = knowledge();
  assert.ok(after.perceivedDanger(holder) > baseline.perceivedDanger);
  assert.equal(decideNpcIdolPlay(holder, after).play, true);
  assert.equal(after.perceivedDanger(members[3]), bystanderBefore);
  gm.systems.tribalCouncilSystem = { voteRecords: Array.from({ length: 4 }, () => ({ targetId: 2 })) };
  assert.deepEqual(decideNpcIdolPlay(holder, knowledge()), decideNpcIdolPlay(holder, after));
});

test('reassurance is tempered by discovered lies; public distancing affects only the informed listener', t => {
  const { gm, members, knowledge, trust, key } = productionGame(t);
  gm.systems.allianceSystem.createAlliance({ memberIds: [1, 2], tribeId: 1 });
  const before = knowledge().perceivedDanger(members[1]);
  socialMemory.recordStructuredEvent({ type: 'tribal_reassure-alliance', speakerId: 1,
    subjectId: 2, data: { public: true } });
  assert.ok(knowledge().perceivedDanger(members[1]) < before);
  const reassured = knowledge().perceivedDanger(members[1]);
  socialMemory.initNPC(2);
  socialMemory.memory[2].lies.push({ liarId: 1, targetId: 2, lieType: 'promise', discovered: true });
  assert.ok(knowledge().perceivedDanger(members[1]) > reassured);
  const earlyQuestion = new TribalQuestionEngine(gm).generateQuestions({ attendingTribeId: 1 })
    .find(entry => entry.topic === 'loyalty_vs_survival');
  new TribalQuestionEngine(gm).applyResponse(earlyQuestion,
    earlyQuestion.responseOptions.find(entry => entry.id === 'reassure-alliance'));
  assert.equal(trust.get(key(1, 2)), undefined); // A discovered liar gains no trust from another reassurance.
  socialMemory.recordStructuredEvent({ type: 'tribal_deny-target', speakerId: 1,
    subjectId: 2, data: { public: true } });
  assert.ok(knowledge().perceivedDanger(members[1]) > reassured + .1);
  const beforeDistance = knowledge().perceivedDanger(members[1]);
  const engine = new TribalQuestionEngine(gm);
  const question = engine.generateQuestions({ attendingTribeId: 1 })
    .find(entry => entry.topic === 'loyalty_vs_survival');
  const option = question.responseOptions.find(entry => entry.id === 'distance-ally');
  engine.applyResponse(question, option);
  assert.ok(knowledge().perceivedDanger(members[1]) > beforeDistance);
  assert.equal(knowledge().perceivedDanger(members[3]), knowledge().perceivedDanger(members[2]));
});

test('private name mention remains owned; direct public mention raises danger', t => {
  const { gm, members, knowledge } = productionGame(t);
  const before = knowledge().perceivedDanger(members[1]);
  socialMemory.recordNameMention({ speakerId: 1, listenerId: 3, subjectId: 2, contextTag: 'target' });
  socialMemory.recordSocialEvent({ type: 'MENTION', speakerId: 1, subjectId: 2,
    data: { context: 'gossip' } });
  assert.equal(knowledge().perceivedDanger(members[1]), before);
  assert.ok(knowledge().factsFor(3).some(fact => fact.type === 'NAME_MENTION'));
  assert.equal(knowledge().jeffCanReference(knowledge().facts.find(fact => fact.type === 'NAME_MENTION')), false);
  socialMemory.recordNameMention({ speakerId: 1, subjectId: 2, contextTag: 'target', data: { public: true } });
  assert.ok(knowledge().perceivedDanger(members[1]) > before);
  assert.equal(gm.systems.strategyPhaseSystem.strategyFacts.length, 0);
});

test('a visibly cross-group Live whisper is recorded once and concerns the excluded ally', t => {
  const { gm, members, knowledge } = productionGame(t);
  gm.systems.allianceSystem.createAlliance({ memberIds: [1, 2], tribeId: 1 });
  const before = knowledge().perceivedDanger(members[0]);
  const bystander = knowledge().perceivedDanger(members[3]);
  const view = new TribalCouncilView({ gameManager: gm });
  view.attendingTribeId = 1;
  view.liveTribalMoment = { id: 'live', liveParticipants: [2, 3], responseOptions: [] };
  const whisper = view._buildPreVoteBeats().find(beat => beat.id === 'live-whispers');
  whisper.onEnter(); whisper.onEnter();
  const events = socialMemory.getStructuredEventsByType('visibleLiveWhisper');
  assert.equal(events.length, 1);
  assert.deepEqual(events[0].data.participants, [2, 3]);
  assert.ok(knowledge().perceivedDanger(members[0]) > before);
  assert.equal(knowledge().perceivedDanger(members[3]), bystander);
});

test('production threat scale maps 5 to 50, 8 to 80, and supports 0–100 threatScore', t => {
  const { gm, members } = productionGame(t);
  assert.equal(normalizedThreat(members[0]), 50);
  members[0].threat = 8;
  assert.equal(normalizedThreat(members[0]), 80);
  members[0].threatScore = 72;
  assert.equal(normalizedThreat(members[0]), 72);
  delete members[0].threatScore;
  const engine = new TribalQuestionEngine(gm);
  assert.ok(engine.generateQuestions({ attendingTribeId: 1 }).some(question => question.topic === 'big_threat'));
  members[0].threat = 2;
  assert.ok(!engine.generateQuestions({ attendingTribeId: 1 }).some(question => question.topic === 'big_threat'));
});
