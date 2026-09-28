import test from 'node:test';
import assert from 'node:assert/strict';
import TribalCouncilSystem from '../src/modules/systems/TribalCouncilSystem.js';
import SeasonEngine from '../src/modules/core/SeasonEngine.js';
import DealSystem, { DealTypes, DealStatus } from '../src/modules/systems/DealSystem.js';
import AllianceSystem from '../src/modules/systems/AllianceSystem.js';

globalThis.window = globalThis.window || {};
const { gameManager } = await import('../src/modules/core/GameManager.js');

function numericGame({ playerBoot = false, fire = false } = {}) {
  const survivors = [1, 2, 3, 4].map(id => ({ id, name: `Contestant ${id}`, tribeId: 1,
    isPlayer: id === 1, hasVote: true, physical: 35, mental: 30,
    firemaking: id === 2 ? 9 : id === 3 ? 2 : 5, focus: 5, dexterity: 5, fortitude: 5,
    risk: 10, hasImmunity: fire && [1, 4].includes(id) }));
  const gm = Object.create(gameManager);
  gm.day = 3; gm.player = survivors[0]; gm.survivors = survivors;
  gm.tribes = [{ id: 1, tribeId: 1, members: [...survivors], resources: { food: 50, water: 50, fire: 50, shelter: 50 } }];
  gm.isMerged = false; gm.isTribesShuffled = false; gm.jury = [];
  gm.lastChallengeResult = { challengeDay: 3, challengeType: 'tribal', playerTribeWon: false };
  gm.gameHistory = { tribals: [] }; gm.tribalCouncilLog = [];
  gm.systems = { idolSystem: { survivorInventories: new Map(), tribeIdolStates: new Map() } };
  gm.getTrust = () => 50;
  gm.requestAutoSave = () => {};
  gm.resetTaskSimFlags = () => {};
  gm.updateTribeHealth = () => {};
  gm.setGameState = state => { gm.gameState = state; };
  let terminalCalls = 0;
  gm.showGameOverScreen = () => { terminalCalls++; gm.gameState = 'gameOver'; };
  gm.seasonEngine = new SeasonEngine(gm, { publish() {} }, { mergeAt: 2, endgameAt: 2 });
  const tribal = new TribalCouncilSystem(gm, { publish() {} });
  const desired = playerBoot ? { 2: 1, 3: 1, 4: 1 } : { 2: 3, 3: 2, 4: 3 };
  tribal._scoreNpcTarget = (voter, target) => target.id === desired[voter.id] ? 10 : 0;
  return { gm, tribal, survivors, terminalCalls: () => terminalCalls };
}

function resolveNumeric(mode) {
  const setup = numericGame({ playerBoot: mode === 'player', fire: mode === 'fire' });
  const { tribal } = setup;
  tribal.registerPlayerVote(1, mode === 'normal' ? 3 : 2);
  let summary = tribal.runPreMergeTribal({ attendingTribeId: 1 });
  if (['revote', 'consensus', 'rocks', 'fire'].includes(mode)) {
    assert.equal(summary.tribalState, 'REVOTE_PENDING');
    summary = tribal.resolveRevoteWithPlayerChoice({ playerChoiceTargetId: mode === 'revote' ? 3 : 2 });
  }
  if (summary.tribalState === 'DEADLOCK_DISCUSSION') {
    const original = Math.random; Math.random = () => mode === 'rocks' ? 0.99 : 0.5;
    try { summary = tribal.resolveDeadlockConsensus({ playerChoiceTargetId: mode === 'consensus' ? 3 : 2 }); }
    finally { Math.random = original; }
  }
  assert.equal(typeof summary.eliminatedId, 'string');
  assert.equal(summary.decisionResolved, true);
  return { ...setup, summary };
}

for (const [mode, expectedResolution] of [
  ['normal', 'VOTE'], ['revote', 'REVOTE'], ['consensus', 'DEADLOCK_CONSENSUS'],
  ['rocks', 'ROCKS'], ['fire', 'FIRE_MAKING']
]) {
  test(`numeric production cast completes ${mode} Tribal through real GameManager and SeasonEngine`, () => {
    const { gm, summary, survivors } = resolveNumeric(mode);
    assert.equal(summary.resolutionType, expectedResolution);
    const eliminated = survivors.find(member => String(member.id) === summary.eliminatedId);
    // Exercise name resolution even if an incoming historical/Tribal ballot uses strings.
    summary.votes = summary.votes.map(({ voterName, targetName, ...vote }) => ({ ...vote,
      voterId: String(vote.voterId), targetId: String(vote.targetId) }));
    summary.initialVotes = summary.initialVotes.map(({ voterName, targetName, ...vote }) => ({ ...vote,
      voterId: String(vote.voterId), targetId: String(vote.targetId) }));
    gm.handleTribalCouncilComplete(summary);
    assert.equal(eliminated.isOut, true);
    assert.ok(!gm.tribes[0].members.some(member => member.id === eliminated.id));
    assert.equal(gm.day, 4);
    assert.equal(gm.gameHistory.tribals.length, 1);
    const log = gm.gameHistory.tribals[0];
    assert.equal(log.eliminatedId, eliminated.id);
    assert.equal(log.eliminatedName, eliminated.name);
    assert.equal(log.votes[0].targetName, survivors.find(member => String(member.id) === log.votes[0].targetId).name);
    assert.equal(log.resolutionType, expectedResolution);
    assert.equal(gm.seasonEngine.state.history.find(entry => entry.type === 'tribal').eliminatedId, eliminated.id);
    const round = gm.seasonEngine.state.history.find(entry => entry.type === 'roundComplete');
    assert.equal(round.eliminatedId, eliminated.id);
    assert.equal(gm.seasonEngine.state.round, 2);
    gm.handleTribalCouncilComplete({ ...summary });
    assert.equal(gm.day, 4);
    assert.equal(gm.gameHistory.tribals.length, 1);
  });
}

test('string player ID eliminates the numeric player and terminates without camp/day advancement', () => {
  const { gm, summary, survivors, terminalCalls } = resolveNumeric('player');
  assert.equal(summary.eliminatedId, '1');
  gm.handleTribalCouncilComplete(summary);
  gm.handleTribalCouncilComplete({ ...summary });
  assert.equal(survivors[0].isOut, true);
  assert.ok(!gm.tribes[0].members.some(member => member.id === 1));
  assert.equal(terminalCalls(), 1);
  assert.equal(gm.gameState, 'gameOver');
  assert.equal(gm.day, 3);
  assert.equal(gm.seasonEngine.state.round, 1);
  assert.equal(gm.gameHistory.tribals[0].eliminatedId, 1);
});

test('direct string ID elimination removes the numeric model and vote penalties read mixed history IDs', () => {
  const { gm, survivors } = numericGame();
  survivors[1].votePenalty = { type: 'LOST_VOTE_JOURNEY', pending: true };
  survivors[1].hasVote = false;
  gm.consumeVotePenaltiesAfterTribal(['2']);
  assert.equal(survivors[1].hasVote, true);
  assert.equal(gm.eliminateSurvivor('3', 'rocks'), true);
  assert.equal(survivors[2].isOut, true);
  assert.ok(!gm.tribes[0].members.some(member => member.id === 3));
  assert.equal(gm.eliminateSurvivor(3, 'rocks'), false);
  assert.equal(gm.seasonEngine.recordTribal({ day: 3, attendingTribeId: 1,
    membersAtTribal: [{ id: '2' }], eliminatedId: '3' }), true);
  assert.equal(gm.seasonEngine.state.history.at(-1).eliminatedId, 3);
});

test('a failed completion can retry without poisoning the key, duplicating history or eliminating twice', () => {
  const { gm, summary, survivors } = resolveNumeric('normal');
  let attempts = 0;
  gm.systems.dealSystem = { processTribalOutcome() { if (++attempts === 1) throw Error('temporary fallout failure'); } };
  assert.throws(() => gm.handleTribalCouncilComplete(summary), /temporary fallout failure/);
  assert.equal(gm.day, 3);
  assert.equal(gm._completedTribalKeys.has(`${summary.createdAt}:1`), false);
  assert.equal(gm._tribalCompletionInFlight.size, 0);
  assert.equal(gm.gameHistory.tribals.length, 1);
  assert.equal(survivors.filter(member => member.isOut).length, 1);
  gm.handleTribalCouncilComplete(summary);
  gm.handleTribalCouncilComplete({ ...summary });
  assert.equal(attempts, 2);
  assert.equal(gm.gameHistory.tribals.length, 1);
  assert.equal(gm.tribalCouncilLog.length, 1);
  assert.equal(gm.seasonEngine.state.history.filter(entry => entry.type === 'tribal').length, 1);
  assert.equal(gm.day, 4);
  assert.equal(gm._completedTribalKeys.has(`${summary.createdAt}:1`), true);
});

test('failure after alliance fallout retries without applying the cohesion penalty twice', () => {
  const { gm, summary } = resolveNumeric('normal');
  const alliance = { id: 'retry-fallout', memberIds: [2, 3], cohesion: 100, notes: '' };
  const alliances = new AllianceSystem(gm);
  alliances.getAlliances = () => [alliance];
  alliances._publish = () => {};
  gm.systems.allianceSystem = alliances;
  let saves = 0;
  gm.requestAutoSave = () => { if (++saves === 1) throw Error('temporary save failure'); };
  assert.throws(() => gm.handleTribalCouncilComplete(summary), /temporary save failure/);
  const cohesionAfterFirstAttempt = alliance.cohesion;
  assert.ok(cohesionAfterFirstAttempt < 100);
  gm.handleTribalCouncilComplete(summary);
  assert.equal(alliance.cohesion, cohesionAfterFirstAttempt);
  assert.equal(gm.gameHistory.tribals.length, 1);
  assert.equal(gm.day, 4);
  gm.handleTribalCouncilComplete(summary);
  assert.equal(alliance.cohesion, cohesionAfterFirstAttempt);
});

test('an alliance-stage failure does not replay already completed deal fallout', () => {
  const { gm, summary } = resolveNumeric('normal');
  let deals = 0;
  let alliances = 0;
  gm.systems.dealSystem = { processTribalOutcome() { deals++; } };
  gm.systems.allianceSystem = { processPostTribalFallout() {
    if (++alliances === 1) throw Error('temporary alliance failure');
  } };
  assert.throws(() => gm.handleTribalCouncilComplete(summary), /temporary alliance failure/);
  gm.handleTribalCouncilComplete(summary);
  assert.equal(deals, 1);
  assert.equal(alliances, 2);
  assert.equal(gm.day, 4);
  assert.equal(gm.gameHistory.tribals.length, 1);
});

test('deal voting and protection terms compare native and ballot IDs without false results', () => {
  const gm = { systems: {} };
  const deals = new DealSystem(gm);
  const actions = [];
  deals.completeDeal = id => actions.push(`complete:${id}`);
  deals.breakDeal = id => actions.push(`break:${id}`);
  deals.dealsById = {
    together: { id: 'together', type: DealTypes.VOTE_TOGETHER, status: DealStatus.ACCEPTED,
      parties: [2, 3], terms: { targetId: 4 } },
    protection: { id: 'protection', type: DealTypes.MUTUAL_PROTECTION, status: DealStatus.ACCEPTED,
      parties: [2, 3], terms: { protectedId: 3 } },
    final: { id: 'final', type: DealTypes.FINAL_TWO, status: DealStatus.ACCEPTED,
      parties: [2, 3], terms: {} }
  };
  deals.processTribalOutcome({ membersAtTribal: [{ id: '2' }, { id: '3' }],
    initialVotes: [{ voterId: '2', targetId: '4' }, { voterId: 3, targetId: 4 }] });
  assert.deepEqual(actions, ['complete:together', 'complete:protection']);
  actions.length = 0;
  deals.processTribalOutcome({ membersAtTribal: [{ id: 2 }, { id: '3' }],
    initialVotes: [{ voterId: 2, targetId: '3' }, { voterId: '3', targetId: '4' }] });
  assert.ok(actions.includes('break:together'));
  assert.ok(actions.includes('break:protection'));
  assert.ok(actions.includes('break:final'));
});

test('alliance fallout recognizes string ballot IDs against numeric member IDs', () => {
  const gm = { systems: {} };
  const allianceSystem = new AllianceSystem(gm);
  const alliance = { id: 'mixed', memberIds: [2, 3], cohesion: 100, notes: '' };
  allianceSystem.getAlliances = () => [alliance];
  allianceSystem._publish = () => {};
  allianceSystem.processPostTribalFallout({ day: 3,
    membersAtTribal: [{ id: '2' }, { id: '3' }],
    initialVotes: [{ voterId: '2', targetId: '3' }] }, gm);
  assert.equal(alliance.cohesion, 97);
});

test('numeric tied player sees only the other legal revote target and is listed as voting', async () => {
  const { gm } = numericGame();
  gm.survivors.forEach((member, index) => { member.name = ['One', 'Two', 'Three', 'Four'][index]; });
  gm.tribes[0].members = gm.survivors.slice(0, 3);
  gm.survivors[1].hasVote = false;
  const tribal = new TribalCouncilSystem(gm, { publish() {} });
  tribal._scoreNpcTarget = (voter, target) => voter.id === 3 && target.id === 1 ? 10 : 0;
  tribal.registerPlayerVote(1, 2);
  const summary = tribal.runPreMergeTribal({ attendingTribeId: 1 });
  assert.equal(summary.tribalState, 'REVOTE_PENDING');
  assert.deepEqual(summary.playerRevoteTargetIds, ['2']);
  const { default: TribalCouncilView } = await import('../src/modules/screens/TribalCouncilView.js');
  const view = new TribalCouncilView({ gameManager: gm, tribalCouncilSystem: tribal });
  view.attendingTribeId = 1; view.tribalSummary = summary;
  assert.deepEqual(view._getRevoteExcludedVoters(), ['TWO']);
  class FakeElement {
    constructor(tag) { this.tag = tag; this.children = []; this.listeners = {}; this.style = {}; this.textContent = ''; }
    appendChild(child) { this.children.push(child); return child; }
    addEventListener(name, callback) { this.listeners[name] = callback; }
    setAttribute() {}
    removeAttribute() {}
  }
  const previous = globalThis.document;
  globalThis.document = { createElement: tag => new FakeElement(tag),
    createTextNode: value => Object.assign(new FakeElement('#text'), { textContent: value }) };
  try {
    const root = new FakeElement('div');
    view._renderRevoteVotingContent(root);
    const portraits = root.children[0].children[1].children;
    assert.equal(portraits.length, 1);
    assert.equal(portraits[0].children.at(-1).textContent, 'TWO');
    assert.deepEqual(tribal.getLegalRevoteTargetIds(1, ['1', '2']), ['2']);
  } finally { globalThis.document = previous; }
});

test('reentrant completion event is ignored while the same Tribal is in flight', () => {
  const { gm, summary, survivors } = resolveNumeric('normal');
  let falloutCalls = 0;
  gm.systems.dealSystem = { processTribalOutcome() { falloutCalls++; gm.handleTribalCouncilComplete(summary); } };
  gm.handleTribalCouncilComplete(summary);
  assert.equal(falloutCalls, 1);
  assert.equal(survivors.filter(member => member.isOut).length, 1);
  assert.equal(gm.day, 4);
  assert.equal(gm.gameHistory.tribals.length, 1);
  assert.equal(gm._tribalCompletionInFlight.size, 0);
});

test('completion without a timestamp has a stable retry key, and invalid IDs cannot advance the day', () => {
  const { gm, summary } = resolveNumeric('normal');
  delete summary.createdAt;
  let attempts = 0;
  gm.systems.dealSystem = { processTribalOutcome() { if (++attempts === 1) throw Error('retry'); } };
  assert.throws(() => gm.handleTribalCouncilComplete(summary), /retry/);
  gm.handleTribalCouncilComplete(summary);
  assert.equal(gm.gameHistory.tribals.length, 1);
  assert.equal(gm.seasonEngine.state.history.filter(entry => entry.type === 'tribal').length, 1);
  assert.equal(gm.day, 4);

  const invalid = numericGame().gm;
  assert.throws(() => invalid.handleTribalCouncilComplete({ day: 3, attendingTribeId: 1,
    createdAt: 9876, membersAtTribal: [{ id: 1 }], eliminatedId: '999' }), /missing/);
  assert.equal(invalid.day, 3);
  assert.equal(invalid.gameHistory.tribals.length, 0);
  assert.equal(invalid._completedTribalKeys.has('9876:1'), false);
});

test('canonical Tribal history preserves every narrowed revote round without replacing compatibility ballots', () => {
  const { gm } = numericGame();
  const first = { voterId: 1, targetId: '2', phase: 'initial', wasNullified: false };
  const second = { voterId: 4, targetId: '2', phase: 'revote', roundIndex: 0, wasNullified: false };
  const third = { voterId: 3, targetId: '2', phase: 'revote', roundIndex: 1, wasNullified: false };
  const rounds = [
    { index: 0, tiedIds: ['2', '3', '4'], eligibleVoterIds: ['1'], leaders: ['2', '3'],
      counts: { 2: 1, 3: 1 }, votes: [second] },
    { index: 1, tiedIds: ['2', '3'], eligibleVoterIds: ['1', '4'], leaders: ['2'],
      counts: { 2: 2 }, votes: [third] }
  ];
  const entry = gm._buildTribalLogEntry({ day: 3, attendingTribeId: 1,
    membersAtTribal: gm.survivors, votes: [first, second, third], initialVotes: [first],
    revoteVotes: [second, third], tiebreakRounds: rounds, eliminatedId: '2', resolutionType: 'REVOTE' });
  assert.equal(entry.votes.length, 3);
  assert.deepEqual(entry.revoteVotes.map(vote => vote.roundIndex), [0, 1]);
  assert.deepEqual(entry.tiebreakRounds.map(round => round.tiedIds), [['2', '3', '4'], ['2', '3']]);
  assert.equal(entry.eliminatedName, 'Contestant 2');
});
