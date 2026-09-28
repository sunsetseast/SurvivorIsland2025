import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import TribalKnowledgeModel from '../src/modules/systems/TribalKnowledgeModel.js';
import TribalQuestionEngine from '../src/modules/systems/TribalQuestionEngine.js';
import TribalCouncilSystem from '../src/modules/systems/TribalCouncilSystem.js';
import TribalCouncilView from '../src/modules/screens/TribalCouncilView.js';
import { decideNpcIdolPlay } from '../src/modules/systems/TribalIdolPerception.js';
import { composeNpcAnswer } from '../src/modules/systems/TribalDialogueComposer.js';
import { assignTribalSeats } from '../src/modules/screens/TribalSceneLayout.js';

const cast = () => ['player', 'a', 'b', 'c'].map((id, index) => ({ id, name: `Person ${id}`,
  isPlayer: index === 0, hasVote: true, honesty: index === 1 ? 2 : 8,
  deception: index === 1 ? 9 : 1, risk: 5, social: 5, physical: 5, mental: 5 }));
function game(members = cast(), facts = [], events = []) {
  const gm = { survivors: members, tribes: [{ id: 'tribe', tribeId: 'tribe', members }], systems: {},
    getDay: () => 4, getTribes: () => gm.tribes, getPlayerTribe: () => gm.tribes[0],
    getPlayerSurvivor: () => members[0], hasVote: member => member.hasVote !== false,
    hasImmunity: member => Boolean(member.hasImmunity), hasLostVote: () => false,
    getTrust: () => 50 };
  gm.systems.strategyPhaseSystem = { strategyFacts: facts, getSummaryFacts: () => facts,
    getNpcTargetIntent: id => id === 'a' ? { targetId: 'b', confidence: .45 } : null };
  gm.systems.socialMemorySystem = { structuredEvents: events,
    getStructuredEvents: () => events, recordStructuredEvent: entry => events.push(entry) };
  return gm;
}

test('secret idol ownership and target-board heat cannot alter Jeff questions or visible mood', () => {
  const members = cast(); const gm = game(members);
  const engine = new TribalQuestionEngine(gm);
  const plan = () => engine.generateQuestions({ attendingTribeId: 'tribe' })
    .map(q => [q.id, q.focusSurvivorId, q.questionText, q.mood.id]);
  const before = plan(); const mood = engine.getMood(members[1], { context: engine.createContext() });
  members[1].hasIdol = true;
  gm.flags = { tribalTargetBoard: { primaryTargetId: 'a', heatMap: { a: 99 } } };
  const privateIdol = new TribalKnowledgeModel(gm, members).facts.find(fact => fact.type === 'ownIdol');
  assert.equal(privateIdol.subjectId, 'a');
  assert.equal(new TribalKnowledgeModel(gm, members).knows('b', privateIdol), false);
  assert.equal(new TribalKnowledgeModel(gm, members).jeffCanReference(privateIdol), false);
  assert.deepEqual(plan(), before);
  assert.deepEqual(engine.getMood(members[1], { context: engine.createContext() }), mood);
  members[1].hasIdol = false; members[2].hasIdol = true;
  assert.deepEqual(plan(), before);
});

test('changing only secret ballots cannot choose mood, dialogue, reaction or camera focus', () => {
  const members = cast(); const gm = game(members);
  const engine = new TribalQuestionEngine(gm);
  const project = () => engine.generateQuestions({ attendingTribeId: 'tribe' }).map(question => ({
    text: question.questionText, speaker: question.focusSurvivorId, mood: question.mood,
    answer: question.npcAnswer, reactions: question.reactions.map(reaction => reaction.survivorId)
  }));
  gm.systems.tribalCouncilSystem = { voteRecords: [{ targetId: 'a' }, { targetId: 'a' }] };
  const first = project();
  gm.systems.tribalCouncilSystem.voteRecords = [{ targetId: 'b' }, { targetId: 'b' }];
  assert.deepEqual(project(), first);
});

test('private deals, NPC intent and social memories stay private; public history can matter', () => {
  const members = cast();
  const privateEvent = { type: 'playerStrategizedWithNpc', speakerId: 'player', listenerId: 'b',
    subjectId: 'a', data: { targetId: 'a' } };
  const gm = game(members, [{ type: 'allianceTargetLocked', allianceId: 'secret', targetId: 'a' }], [privateEvent]);
  const knowledge = new TribalKnowledgeModel(gm, members);
  const secret = knowledge.facts.find(f => f.type === privateEvent.type);
  assert.equal(knowledge.knows('b', secret), true);
  assert.equal(knowledge.knows('a', secret), false);
  assert.equal(knowledge.jeffCanReference(secret), false);
  const questions = new TribalQuestionEngine(gm).generateQuestions({ attendingTribeId: 'tribe' });
  assert.ok(questions.every(q => !q.questionText.includes('secret')));
  gm.tribalCouncilLog = [{ day: 3, eliminatedId: 'z', wasTie: true,
    idolPlays: [{ playerId: 'b' }] }];
  const publicKnowledge = new TribalKnowledgeModel(gm, members);
  assert.ok(publicKnowledge.publicFacts().some(f => f.type === 'revealedIdol'));
  assert.ok(new TribalQuestionEngine(gm).generateQuestions({ attendingTribeId: 'tribe' })
    .some(q => q.topic === 'tribal_history'));
});

test('a public rumor changes plausible idol discussion and perceived danger without secret ownership', () => {
  const members = cast(); const facts = [];
  const gm = game(members, facts); const engine = new TribalQuestionEngine(gm);
  const before = engine.generateQuestions({ attendingTribeId: 'tribe' });
  const baseline = new TribalKnowledgeModel(gm, members).perceivedDanger(members[1]);
  facts.push({ type: 'publicIdolRumor', speakerId: 'b', targetId: 'a', public: true },
    { type: 'NAME_MENTION', speakerId: 'b', targetId: 'a', public: true });
  const after = engine.generateQuestions({ attendingTribeId: 'tribe' });
  assert.ok(!before.some(question => question.topic === 'idol_paranoia'));
  assert.ok(after.some(question => question.topic === 'idol_paranoia'));
  assert.ok(new TribalKnowledgeModel(gm, members).perceivedDanger(members[1]) > baseline);
});

test('NPC idol decision is invariant to secret ballots, but perception can cause a correct or wasted play', () => {
  const members = cast(); members[1].hasIdol = true;
  const gm = game(members); gm.systems.idolSystem = { survivorInventories: new Map() };
  const tribal = new TribalCouncilSystem(gm, { publish() {} });
  tribal.buildTribeContext('tribe');
  const original = decideNpcIdolPlay(members[1], new TribalKnowledgeModel(gm, members));
  assert.equal(original.play, false); // A plausible blindside can leave the idol in a pocket.
  tribal.voteRecords = []; tribal.initialVotes = [];
  tribal.resolveIdolStage();
  assert.equal(tribal.idolPlays.length, 0);
  tribal.voteRecords = [0, 1, 2, 3, 4].map(i => ({ voterId: `v${i}`, targetId: 'a', phase: 'initial', wasNullified: false }));
  tribal.initialVotes = [...tribal.voteRecords];
  tribal.resolveIdolStage();
  assert.equal(tribal.idolPlays.length, 0);
  gm.systems.strategyPhaseSystem.strategyFacts.push({ type: 'playerNameFloated', speakerId: 'a',
    targetId: 'a', toPlayer: true }, { type: 'rumor', speakerId: 'c', targetId: 'a', toPlayer: true });
  members[1].suspicion = 85;
  const worried = decideNpcIdolPlay(members[1], new TribalKnowledgeModel(gm, members));
  assert.equal(worried.play, true);
  assert.equal(worried.play, decideNpcIdolPlay(members[1], new TribalKnowledgeModel(gm, members)).play);
  tribal.resolveIdolStage();
  assert.equal(tribal.idolPlays.length, 1);
  assert.equal(tribal.idolPlays[0].playedById, 'a');
  assert.equal(tribal.idolPlays[0].successful, true);
});

test('a worried idol holder can waste an idol when no ballots actually target them', () => {
  const members = cast(); members[1].hasIdol = true; members[1].suspicion = 95;
  const facts = [{ type: 'NAME_MENTION', speakerId: 'a', subjectId: 'a', targetId: 'a', public: true }];
  const gm = game(members, facts);
  const tribal = new TribalCouncilSystem(gm, { publish() {} });
  tribal.buildTribeContext('tribe');
  tribal.resolveIdolStage();
  assert.equal(tribal.idolPlays.length, 1);
  assert.equal(tribal.idolPlays[0].successful, false);
  assert.equal(tribal.idolPlays[0].nullifiedVotesCount, 0);
});

test('composed NPC answers are stable, personal, guarded when deceptive, and do not reveal exact ballots', () => {
  const members = cast(); const gm = game(members);
  const knowledge = new TribalKnowledgeModel(gm, members);
  const input = id => ({ speaker: members.find(m => m.id === id), topic: 'tribe_state',
    mood: 'calm', knowledge, strategy: gm.systems.strategyPhaseSystem, members, day: 4 });
  assert.deepEqual(composeNpcAnswer(input('a')), composeNpcAnswer(input('a')));
  assert.equal(composeNpcAnswer(input('a')).disclosure, 'GUARDED');
  assert.equal(composeNpcAnswer(input('b')).disclosure, 'OPEN');
  assert.notEqual(composeNpcAnswer(input('a')).text, composeNpcAnswer(input('b')).text);
  assert.doesNotMatch(composeNpcAnswer(input('a')).text, /heat|score|votes? against|undefined/i);
  gm.systems.strategyPhaseSystem.getNpcTargetIntent = () => ({ targetId: 'b', confidence: .9 });
  const possibleLies = Array.from({ length: 30 }, (_, day) => composeNpcAnswer({ ...input('a'), day }));
  assert.ok(possibleLies.some(answer => answer.lied && /not settled on a name/.test(answer.text)));
});

test('a denial only costs trust with a listener who knows the contradictory private conversation', () => {
  const events = [{ type: 'playerStrategizedWithNpc', speakerId: 'player', listenerId: 'b',
    subjectId: 'a', data: { targetId: 'a' } }];
  const gm = game(cast(), [], events); const changes = [];
  gm.changeTrust = (...args) => changes.push(args);
  const engine = new TribalQuestionEngine(gm);
  const question = { topic: 'tribe_state' };
  const response = { id: 'deny-target', text: 'I never said that.', subjectId: 'a',
    effects: { trust: [], relationship: [], suspicion: [], threat: [], targetHeat: [] } };
  engine.applyResponse(question, response);
  assert.deepEqual(changes.map(([from, to, delta]) => [from, to, delta]), [['player', 'b', -3]]);
  assert.ok(events.some(event => event.type === 'tribal_deny-target' && event.data.public));
  const follow = engine.createFollowUp(question, response, engine.createContext());
  assert.match(follow.npcAnswer, /remember that conversation differently/);
  assert.equal(follow.focusSurvivorId, 'b');
});

test('a public denial inserts one follow-up beat without regenerating a previous answer', () => {
  const events = [{ type: 'playerStrategizedWithNpc', speakerId: 'player', listenerId: 'b', subjectId: 'a' }];
  const gm = game(cast(), [], events);
  const view = new TribalCouncilView({ gameManager: gm });
  view.attendingTribeId = 'tribe';
  const question = { id: 'tribe-state', topic: 'tribe_state', responseOptions: [] };
  const response = { id: 'deny-target', label: 'Deny it', text: 'I did not say it.', subjectId: 'a',
    effects: { trust: [], relationship: [], suspicion: [], threat: [], targetHeat: [] } };
  const runner = { currentIndex: 0, beats: [{ id: 'tribal-question-tribe-state' }, { id: 'vote-intro' }],
    setBeats(beats) { this.beats = beats; }, goTo() {} };
  view.beatRunner = runner;
  view._selectQuestionResponse(question, response);
  view._selectQuestionResponse(question, response);
  assert.deepEqual(runner.beats.map(beat => beat.id),
    ['tribal-question-tribe-state', 'tribal-reaction-tribe-state-follow-up',
      'tribal-question-tribe-state-follow-up', 'vote-intro']);
  assert.equal(view.questionResponseLog.length, 1);
  assert.equal(runner.beats[1].sceneMode, 'reaction');
  assert.deepEqual(runner.beats[1].reactionTargetIds, ['b']);
  assert.match(runner.beats[2].customRender.toString(), /_renderQuestionContent/);
});

test('explicit late switch stages one stable Live Tribal; close heat and regex-like fact names do not', () => {
  const facts = [{ type: 'lateRumorScramble' }]; const gm = game(cast(), facts);
  const engine = new TribalQuestionEngine(gm);
  gm.flags = { tribalTargetBoard: { heatMap: { a: 5, b: 5 } } };
  assert.equal(engine.generateLiveTribalMoment({ attendingTribeId: 'tribe' }), null);
  facts.push({ type: 'lateTargetSwitch', speakerId: 'a', fromTargetId: 'b',
    toTargetId: 'c', severity: .75, source: 'npcScramble' });
  const first = engine.generateLiveTribalMoment({ attendingTribeId: 'tribe' });
  assert.deepEqual(engine.generateLiveTribalMoment({ attendingTribeId: 'tribe' }), first);
  assert.deepEqual(first.liveParticipants, ['a', 'b']);
  assert.equal(first.responseOptions.length, 0); // Player did not witness a private target choice.
  const view = new TribalCouncilView({ gameManager: gm });
  view.attendingTribeId = 'tribe'; view.liveTribalMoment = first;
  const beats = view._buildLiveTribalBeat(gm.survivors);
  assert.equal(beats.autoAdvance, true);
  assert.equal(beats.requiresDecision, false);
  facts.pop(); assert.equal(engine.generateLiveTribalMoment({ attendingTribeId: 'tribe' }), null);
});

test('Live Tribal player action only strengthens a witnessed, unstable intent', () => {
  const members = cast(); const signal = { type: 'lateVolatility', speakerId: 'a',
    fromTargetId: 'b', toTargetId: 'c', severity: .8, toPlayer: true };
  const gm = game(members, [signal]);
  const updates = [];
  gm.systems.strategyPhaseSystem.updateNpcIntentTarget = (...args) => updates.push(args);
  const engine = new TribalQuestionEngine(gm);
  const live = engine.generateLiveTribalMoment({ attendingTribeId: 'tribe' });
  assert.equal(live.responseOptions.length, 2);
  assert.equal(live.responseOptions.some(option => option.id === 'lock-ally'), false);
  engine.applyResponse(live, live.responseOptions.find(option => option.id === 'press-swing'));
  assert.deepEqual(updates[0].slice(0, 2), ['a', 'c']);
  assert.equal(updates[0][2].reason, 'liveTribalPlayerPitch');
  gm.systems.strategyPhaseSystem.getNpcTargetIntent = () => ({ targetId: 'c', confidence: .95 });
  engine.applyResponse(live, live.responseOptions.find(option => option.id === 'press-swing'));
  assert.equal(updates.length, 1); // A stable, locked plan is not overwritten.
});

test('camera and phone Jeff styles transform the shared artboard and keep anchors untouched', () => {
  const view = readFileSync(new URL('../src/modules/screens/TribalCouncilView.js', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
  assert.match(view, /onCue: cue =>/);
  assert.match(view, /getTribalSeat\(beat\.stoolsData\?\.length/);
  assert.match(view, /artboard\.appendChild\(this\._createSeats/);
  assert.match(css, /\.tribal-scene\.has-camera \.tribal-artboard/);
  assert.match(css, /\.tribal-jeff-wrap \{ display: block;/);
  assert.doesNotMatch(css, /\.tribal-jeff-wrap\s*\{\s*display:\s*none/);
  assert.match(css, /\.tribal-actions[^\n]*[\s\S]*?env\(safe-area-inset-bottom/);
  assert.match(css, /\.tribal-parchment-wrap[^\n]*left: 50%; top: 48%/);
  assert.match(css, /\.tribal-question \{[\s\S]*?overflow-y: auto/);
  assert.match(css, /prefers-reduced-motion: reduce[\s\S]*?\.tribal-scene\.has-camera \.tribal-artboard \{ transition: none/);
});

test('speaker and reaction cues frame the same artboard that contains background and seated portraits', () => {
  class FakeElement {
    constructor(tag) { this.tag = tag; this.children = []; this.style = { setProperty: (key, value) => { this.style[key] = value; } };
      this.className = ''; this.classList = { add: value => { this.className += ` ${value}`; } }; }
    appendChild(child) { this.children.push(child); return child; }
    setAttribute(key, value) { this[key] = value; }
    removeAttribute() {}
    addEventListener() {}
    get firstChild() { return this.children[0]; }
    removeChild(child) { this.children.splice(this.children.indexOf(child), 1); }
  }
  const previous = globalThis.document;
  globalThis.document = { createElement: tag => new FakeElement(tag),
    createTextNode: text => Object.assign(new FakeElement('#text'), { textContent: text }) };
  try {
    const members = cast(); const gm = game(members);
    const view = new TribalCouncilView({ gameManager: gm });
    view.root = new FakeElement('root');
    view.attendingTribeId = 'tribe'; view.seatAssignments = assignTribalSeats(members);
    const focus = { id: 'question', showStools: true, stoolsData: members, sceneMode: 'focus',
      background: 'Assets/TribalCouncil/4.png', cameraTargetIds: ['a'], reactionTargetIds: ['b'] };
    view.currentCue = { beat: focus, cameraTargetIds: ['a'], reactionTargetIds: ['b'] };
    view._renderBeat(focus, { canAdvance: () => true });
    const scene = view.root.children[0]; const art = scene.children[0];
    const x = art.style['--camera-x'];
    assert.match(scene.className, /has-camera/);
    assert.equal(art.children[0].tag, 'img');
    assert.equal(art.children[1].children.length, 4);
    const positions = art.children[1].children.map(seat => [seat.style.left, seat.style.top]);
    const reaction = { ...focus, id: 'reaction', sceneMode: 'reaction' };
    view.currentCue = { beat: reaction, cameraTargetIds: ['a'], reactionTargetIds: ['b'] };
    view._renderBeat(reaction, { canAdvance: () => true });
    const reactionArt = view.root.children[1].children[0];
    assert.notEqual(reactionArt.style['--camera-x'], x);
    assert.deepEqual(reactionArt.children[1].children.map(seat => [seat.style.left, seat.style.top]), positions);
  } finally { globalThis.document = previous; }
});
