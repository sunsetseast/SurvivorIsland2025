import test from 'node:test';
import assert from 'node:assert/strict';
import { makeTribalQa, finishTribal, seeded, withRandom, id, same } from '../qa/TribalQaHarness.mjs';
import { getTribalSeat } from '../src/modules/screens/TribalSceneLayout.js';
import { decideNpcIdolPlay } from '../src/modules/systems/TribalIdolPerception.js';
import TribalCouncilView from '../src/modules/screens/TribalCouncilView.js';
import { DealTypes } from '../src/modules/systems/DealSystem.js';

function assertSummary(setup, summary, label = '') {
  const { members, tribal } = setup;
  const attending = new Set(members.filter(member => !member.isOut).map(member => id(member.id)));
  assert.equal(summary.decisionResolved, true, `${label} state ${summary.tribalState}`);
  assert.ok(['FINAL_VOTE', 'NO_ELIMINATION'].includes(summary.tribalState));
  if (summary.eliminatedId != null) assert.ok(attending.has(id(summary.eliminatedId)));
  const votes = summary.votes || [];
  assert.equal(votes.length, (summary.initialVotes || []).length + (summary.revoteVotes || []).length);
  assert.equal(summary.validVoteCount, votes.filter(vote => !vote.wasNullified).length);
  assert.equal(summary.nullifiedVoteCount, votes.filter(vote => vote.wasNullified).length);
  for (const vote of votes) {
    assert.ok(attending.has(id(vote.voterId)) && attending.has(id(vote.targetId)));
    assert.ok(!same(vote.voterId, vote.targetId));
    const voter = members.find(member => same(member.id, vote.voterId));
    assert.equal(voter.hasVote, true, `lost vote cast by ${vote.voterId}`);
    assert.ok(!tribal.sitdUsers.has(id(vote.voterId)));
    assert.ok(!tribal.immunityHolderIds.has(id(vote.targetId)));
    if (vote.phase === 'revote') {
      const round = summary.tiebreakRounds[vote.roundIndex];
      assert.ok(round?.tiedIds.some(candidate => same(candidate, vote.targetId)));
      assert.ok(round?.eligibleVoterIds.some(candidate => same(candidate, vote.voterId)));
      assert.ok(!tribal.idolProtectedIds.has(id(vote.targetId)));
    }
  }
  assert.deepEqual(summary.tiebreakRounds.map(round => round.index),
    summary.tiebreakRounds.map((_, index) => index));
  assert.equal(new Set(summary.tiebreakRounds.flatMap(round => round.votes.map(vote =>
    `${round.index}:${id(vote.voterId)}`))).size, summary.revoteVotes.length);
  for (const play of summary.idolPlays || []) {
    assert.ok(attending.has(id(play.playedById)) && attending.has(id(play.playedOnId)));
  }
  for (const protectedId of tribal.idolProtectedIds) assert.ok(!same(summary.eliminatedId, protectedId));
  for (const protectedId of tribal.immunityHolderIds) assert.ok(!same(summary.eliminatedId, protectedId));
  assert.equal(tribal.runPreMergeTribal({ attendingTribeId: 1 }), summary);
}

function withGameWindow(gm, work) {
  const previous = globalThis.window;
  globalThis.window = { gameManager: gm };
  try { return work(); } finally {
    if (previous === undefined) delete globalThis.window;
    else globalThis.window = previous;
  }
}

test('all production seating counts 2–12 resolve, assign one stump per active survivor, and produce safe dialogue', () => {
  for (let size = 2; size <= 12; size++) {
    const setup = makeTribalQa({ size, playerId: 1 });
    const seats = setup.seats();
    assert.equal(seats.size, size);
    assert.equal(new Set(seats.values()).size, size);
    for (const member of setup.members) {
      const slot = getTribalSeat(size, seats.get(id(member.id)));
      assert.ok(Number.isFinite(slot?.x) && Number.isFinite(slot?.y), `size ${size} id ${member.id}`);
    }
    const questions = setup.questions().generateQuestions({ attendingTribeId: 1 });
    assert.ok(questions.length > 0);
    const content = questions.flatMap(question => [question.questionText, question.npcAnswer].filter(Boolean));
    assert.ok(content.every(line => line && !/undefined|null|\[object Object\]|targetHeat|trustScore|deal_/.test(line)));
    const summary = withRandom(seeded(1000 + size), () => finishTribal(setup));
    assertSummary(setup, summary, `size ${size}`);
    setup.tribal.endSession();
    assert.equal(setup.tribal.voteRecords.length, 0);
    assert.equal(setup.tribal.currentTieIds.length, 0);
  }
});

test('fixed-seed 96-scenario matrix preserves legal ballots, protection, and terminal state', () => {
  const random = seeded(0x5eed339);
  for (let scenario = 0; scenario < 96; scenario++) {
    const size = 2 + Math.floor(random() * 11);
    const immuneIds = Array.from({ length: size }, (_, i) => i + 1).filter(() => random() < .11);
    const lostVoteIds = Array.from({ length: size }, (_, i) => i + 1).filter(() => random() < .16);
    const idolIds = Array.from({ length: size }, (_, i) => i + 1).filter(() => random() < .09);
    const facts = random() < .22 ? [{ type: 'NAME_MENTION', speakerId: 2,
      targetId: idolIds[0] || 1, public: true }] : [];
    const suspicionById = Object.fromEntries(idolIds.map(holder => [holder, Math.floor(random() * 95)]));
    const trustPairs = [[1, 2, Math.floor(30 + random() * 60)]];
    const alliances = random() < .25 ? [{ memberIds: [1, 2], tribeId: 1 }] : [];
    const deals = random() < .2 ? [{ type: DealTypes.VOTE_TOGETHER, parties: [1, 2],
      terms: { targetId: Math.min(3, size) }, accepted: true }] : [];
    const setup = withRandom(seeded(70000 + scenario), () => makeTribalQa({ size, immuneIds,
      lostVoteIds, idolIds, facts, suspicionById, trustPairs, alliances, deals }));
    if (random() < .2) withGameWindow(setup.gm, () => setup.memory.recordStructuredEvent({
      type: 'NAME_MENTION', speakerId: 2, listenerId: 1,
      subjectId: Math.min(3, size), data: {}, day: 3 }));
    const knowledge = setup.knowledge();
    if (alliances.length) {
      assert.ok(knowledge.getKnownAllies('1').some(member => same(member.id, 2)));
      if (size >= 3) assert.equal(knowledge.getKnownAllies(3).length, 0);
    }
    if (deals.length && size >= 3) assert.equal(knowledge.getKnownDeals(3).length, 0);
    const questions = setup.questions();
    const plan = questions.generateQuestions({ attendingTribeId: 1 });
    const signature = entries => entries.map(question => ({ topic: question.topic,
      questionText: question.questionText, npcAnswer: question.npcAnswer,
      focusSurvivorId: question.focusSurvivorId, reactionIds: question.reactions?.map(reaction => reaction.survivorId) }));
    assert.deepEqual(signature(questions.generateQuestions({ attendingTribeId: 1 })), signature(plan));
    const present = new Set(setup.members.map(member => id(member.id)));
    for (const question of plan) {
      assert.ok(present.has(id(question.focusSurvivorId)));
      assert.ok(question.questionText?.trim());
      for (const line of [question.questionText, question.npcAnswer, ...(question.responseOptions || [])
        .flatMap(option => [option.label, option.text])].filter(Boolean)) {
        assert.doesNotMatch(line, /undefined|null|\[object Object\]|targetHeat|trustScore|deal_[a-z0-9]+|alliance_[a-z0-9]+/i,
          `scenario ${scenario}: unsafe dialogue`);
      }
      const reactionIds = (question.reactions || []).map(reaction => id(reaction.survivorId));
      assert.equal(new Set(reactionIds).size, reactionIds.length);
      assert.ok(reactionIds.length <= 2 && reactionIds.every(target => present.has(target)));
    }
    if (setup.members[0].hasIdol && random() < .5) {
      setup.tribal.registerIdolPlay(1, random() < .5 ? 1 : Math.min(2, size));
    }
    const sitd = setup.members[0].hasVote && random() < .12;
    if (sitd) setup.members[0].advantages.shotInTheDarkAvailable = true;
    const summary = withRandom(seeded(90000 + scenario), () => finishTribal(setup, { sitd }));
    assertSummary(setup, summary, `scenario ${scenario} size ${size} immune ${immuneIds} lost ${lostVoteIds} idol ${idolIds} sitd ${sitd}`);
    assert.ok([...setup.consumption.idols.values()].every(count => count === 1));
    assert.ok([...setup.consumption.sitd.values()].every(count => count === 1));
    setup.tribal.endSession();
    assert.equal(setup.tribal.idolRegistrations.length, 0);
    assert.equal(setup.tribal.sitdUsers.size, 0);
  }
});

test('an NPC without a vote cannot cast an initial ballot even when hasLostVote is stale', () => {
  const setup = makeTribalQa({ size: 4, lostVoteIds: [2] });
  setup.gm.hasLostVote = () => false; // Legacy save: hasVote is authoritative despite stale penalty metadata.
  const summary = withRandom(seeded(31), () => finishTribal(setup));
  assert.ok(!summary.initialVotes.some(vote => same(vote.voterId, 2)));
});

test('a player with no legal target can proceed without an impossible ballot', () => {
  const setup = makeTribalQa({ size: 2, immuneIds: [2] });
  const view = new TribalCouncilView({ gameManager: setup.gm, tribalCouncilSystem: setup.tribal });
  view.attendingTribeId = 1;
  const booth = view._buildPreVoteBeats().find(beat => beat.id === 'voting-booth');
  assert.equal(view._getVoteTargets().length, 0);
  assert.equal(booth.button.disabled(), false);
  class FakeElement {
    constructor(tag) { this.tag = tag; this.children = []; this.style = {}; this.dataset = {}; this.textContent = ''; }
    appendChild(child) { this.children.push(child); return child; }
    addEventListener() {}
    setAttribute() {}
    removeAttribute() {}
  }
  const previousDocument = globalThis.document;
  globalThis.document = { createElement: tag => new FakeElement(tag),
    createTextNode: value => Object.assign(new FakeElement('#text'), { textContent: value }) };
  try {
    const content = new FakeElement('div');
    view._renderVotingContent(content);
    assert.equal(content.children[0].className, 'tribal-ballot-flow');
    assert.equal(content.children[0].children.some(child => child.tag === 'button'), false);
    assert.match(content.children[0].children[0].textContent, /No one else can receive your vote/);
  } finally { globalThis.document = previousDocument; }
  let advanced = 0;
  view.beatRunner = { next() { advanced++; } };
  view._handleVotingContinue();
  assert.equal(advanced, 1);
  const summary = withRandom(seeded(44), () => finishTribal(setup));
  assert.equal(summary.tribalState, 'FINAL_VOTE');
  assert.ok(same(summary.eliminatedId, 1));
  assert.equal(summary.initialVotes.length, 1);
});

test('an inactive alliance does not suppress an NPC vote against a former ally', () => {
  const setup = makeTribalQa({ size: 4, alliances: [{ memberIds: [2, 3], tribeId: 1 }] });
  const alliance = setup.gm.systems.allianceSystem.getAlliances()[0];
  assert.equal(setup.tribal._inSameAlliance(2, 3), true);
  setup.gm.systems.allianceSystem.disbandAlliance(alliance.id);
  assert.equal(setup.tribal._inSameAlliance('2', 3), false);
});

test('secret ballots and secret idol placement leave public dialogue and idol perception unchanged', () => {
  const setup = makeTribalQa({ size: 6 });
  const engine = setup.questions();
  const project = () => engine.generateQuestions({ attendingTribeId: 1 }).map(question => ({
    id: question.id, text: question.questionText, answer: question.npcAnswer,
    mood: question.mood, reactions: question.reactions, focus: question.focusSurvivorId }));
  const before = project();
  const idolBefore = decideNpcIdolPlay(setup.members[1], setup.knowledge());
  setup.gm.systems.tribalCouncilSystem = { voteRecords: Array.from({ length: 5 }, () => ({ targetId: 2 })) };
  setup.members[3].hasIdol = true;
  setup.gm.flags.tribalTargetBoard = { heatMap: { 2: 99 }, primaryTargetId: 2 };
  assert.deepEqual(project(), before);
  assert.deepEqual(decideNpcIdolPlay(setup.members[1], setup.knowledge()), idolBefore);
});

test('public reassurance is credible to a trusted ally, weak from a neutral speaker, and not calming from a rival or discovered liar', () => {
  const measure = ({ trust, allied = false, liar = false }) => {
    const setup = makeTribalQa({ size: 4, trustPairs: [[1, 2, trust]],
      alliances: allied ? [{ memberIds: [1, 2], tribeId: 1 }] : [] });
    if (liar) {
      setup.memory.initNPC(2);
      setup.memory.memory[2].lies.push({ liarId: 1, targetId: 2, discovered: true, day: 4 });
    }
    const before = setup.knowledge().perceivedDanger(setup.members[1]);
    setup.memory.recordStructuredEvent({ type: 'tribal_reassure-alliance', speakerId: 1,
      subjectId: 2, data: { public: true }, day: 4, phase: 'tribalCouncil' });
    return setup.knowledge().perceivedDanger(setup.members[1]) - before;
  };
  const ally = measure({ trust: 85, allied: true });
  const neutral = measure({ trust: 50 });
  const rival = measure({ trust: 15 });
  const liar = measure({ trust: 85, allied: true, liar: true });
  assert.ok(ally < neutral && neutral <= 0, `ally ${ally}, neutral ${neutral}`);
  assert.ok(rival >= 0, `rival ${rival}`);
  assert.ok(liar >= 0, `known liar ${liar}`);
});

test('JSON-restored production social systems and legacy memories retain ownership without public leaks', () => {
  const setup = makeTribalQa({ size: 5, alliances: [{ memberIds: [1, 2], tribeId: 1 }],
    deals: [{ type: 'FINAL_TWO', parties: [1, 2], terms: {}, accepted: true }] });
  withGameWindow(setup.gm, () => {
    setup.memory.recordStructuredEvent({ type: 'NAME_MENTION', speakerId: 1, listenerId: '2',
      subjectId: '3', data: {}, day: 3 });
    setup.memory.recordStructuredEvent({ type: 'tribal_call-out', speakerId: '1', subjectId: 4,
      data: { public: true }, day: 3 });
  });
  const saved = JSON.parse(JSON.stringify({ survivors: setup.members,
    alliances: setup.gm.systems.allianceSystem.serialize(),
    deals: setup.gm.systems.dealSystem.serialize(), memory: setup.memory.serialize() }));
  saved.memory.memory['2'] = { promises: [{ withWho: '1', day: 2 }],
    lies: [{ liarId: '1', targetId: '3', discovered: true }],
    gossip: [{ sourceId: '4', aboutId: '5' }], targetRequests: [{}] };
  saved.memory.structuredEvents.push({ type: 'NAME_MENTION', subjectId: 5, data: {} });
  setup.gm.systems.allianceSystem.deserialize(saved.alliances);
  setup.gm.systems.dealSystem.deserialize(saved.deals);
  setup.memory.deserialize(saved.memory);
  const knowledge = setup.knowledge();
  assert.ok(knowledge.getKnownAllies('1').some(member => same(member.id, 2)));
  assert.equal(knowledge.getKnownAllies(3).length, 0);
  assert.ok(knowledge.getKnownDeals('2').some(fact => fact.details?.dealType === 'FINAL_TWO'));
  assert.equal(knowledge.getKnownDeals(4).length, 0);
  const privateMention = knowledge.facts.find(fact => fact.type === 'NAME_MENTION' && same(fact.subjectId, 3));
  assert.ok(knowledge.knows(2, privateMention));
  assert.equal(knowledge.knows(4, privateMention), false);
  assert.equal(knowledge.jeffCanReference(privateMention), false);
  const malformed = knowledge.facts.find(fact => fact.type === 'NAME_MENTION' && same(fact.subjectId, 5));
  assert.equal(knowledge.jeffCanReference(malformed), false);
  assert.ok(knowledge.factsFor(2).some(fact => fact.type === 'discoveredLie'));
  assert.ok(knowledge.publicFacts().some(fact => fact.type === 'tribal_call-out'));
  const summary = withRandom(seeded(72), () => finishTribal(setup));
  assertSummary(setup, summary);
});

test('production-shaped beat graph keeps interaction and ritual phases in order with valid camera targets', () => {
  for (const size of [2, 4, 6, 9, 12]) {
    const setup = makeTribalQa({ size });
    const view = new TribalCouncilView({ gameManager: setup.gm, tribalCouncilSystem: setup.tribal });
    view.attendingTribeId = 1;
    view.tribalContext = view.questionEngine.createContext({ attendingTribeId: 1 });
    view.tribalQuestions = view.questionEngine.generateQuestions({ context: view.tribalContext });
    const pre = view._buildPreVoteBeats();
    const position = label => pre.findIndex(beat => beat.id === label);
    for (const [a, b] of [['arrival', 'seating'], ['seating', 'jeff-opening'],
      ['jeff-opening', 'vote-intro'], ['vote-intro', 'voting-booth'],
      ['voting-booth', 'votes-collected'], ['votes-collected', 'urn-away'],
      ['urn-away', 'urn-return'], ['urn-return', 'idol-window']]) {
      assert.ok(position(a) >= 0 && position(a) < position(b), `size ${size}: ${a} before ${b}`);
    }
    assert.equal(pre.filter(beat => beat.id === 'voting-booth').length, 1);
    assert.ok(pre.some(beat => beat.id.startsWith('tribal-question-')));
    assert.ok(pre.every(beat => !beat.requiresDecision || !beat.autoAdvance));
    const attending = new Set(setup.members.map(member => id(member.id)));
    for (const beat of pre) {
      for (const target of [...(beat.cameraTargetIds || []), ...(beat.reactionTargetIds || []),
        ...(beat.whisperTargetIds || []), ...(beat.stoolHighlightId != null ? [beat.stoolHighlightId] : [])]) {
        assert.ok(attending.has(id(target)), `size ${size}: stale cue ${target}`);
      }
      if (beat.button) assert.ok(beat.button.label?.trim());
    }
    const summary = withRandom(seeded(300 + size), () => finishTribal(setup));
    view.tribalSummary = summary; view.result = summary;
    const post = view._buildPostVoteBeats();
    assert.equal(new Set(post.map(beat => beat.id)).size, post.length);
    assert.ok(post.findIndex(beat => beat.id === 'read-votes-intro') < post.findIndex(beat => beat.id === 'snuff'));
    assert.ok(post.findIndex(beat => beat.id === 'snuff') < post.findIndex(beat => beat.id === 'tribal-exit'));
    assert.equal(post.filter(beat => beat.id === 'snuff').length, 1);
    assert.ok(post.every(beat => !beat.requiresDecision || !beat.autoAdvance));
    assert.ok(post.every(beat => !beat.button || beat.button.label?.trim()));
  }
});
