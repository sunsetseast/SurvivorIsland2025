import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import TribalCouncilSystem from '../src/modules/systems/TribalCouncilSystem.js';
import TribalQuestionEngine from '../src/modules/systems/TribalQuestionEngine.js';
import TribalCouncilView from '../src/modules/screens/TribalCouncilView.js';
import tribalEvents, { GameEvents } from '../src/modules/core/EventManager.js';
import { TRIBAL_SEAT_LAYOUTS, assignTribalSeats, getTribalSeat } from '../src/modules/screens/TribalSceneLayout.js';
import { decisiveVoteIndex, planVoteReveals } from '../src/modules/screens/TribalVoteRevealPlan.js';

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

  assert.ok(questions.length >= 1 && questions.length <= 2);
  assert.ok(playerQuestion);
  assert.ok(playerQuestion.responseOptions.length >= 2);
  assert.deepEqual(Object.keys(playerQuestion.responseOptions[0].effects).sort(), ['relationship', 'suspicion', 'targetHeat', 'threat', 'trust']);
});



test('player vote registration rejects self, strangers, eliminated, immune, and lost-vote targets', () => {
  const player = survivor('player', { isPlayer: true });
  const immune = survivor('immune', { hasImmunity: true });
  const out = survivor('out'); out.isOut = true;
  const other = survivor('other');
  const game = buildGame([player, immune, out, other]);
  const tribal = new TribalCouncilSystem(game, eventManager);
  for (const id of ['player', 'stranger', 'immune', 'out', null]) {
    assert.equal(tribal.registerPlayerVote(player.id, id), false);
  }
  assert.equal(tribal.registerPlayerVote(player.id, other.id), true);
  assert.equal(tribal.playerVotes.get(player.id), other.id);
  player.hasVote = false;
  assert.equal(tribal.registerPlayerVote(player.id, immune.id), false);
});

test('unresolved vote probes do not increment Tribal number or consume the vote', () => {
  const player = survivor('player', { isPlayer: true });
  const game = buildGame([player, survivor('a'), survivor('b')]);
  const tribal = new TribalCouncilSystem(game, eventManager);
  for (let n = 0; n < 3; n++) assert.equal(tribal.runPreMergeTribal({ attendingTribeId: 'tribe-1' }).tribalState, 'PLAYER_VOTE_REQUIRED');
  assert.equal(tribal.tribalNumber, 0);
  tribal.registerPlayerVote('player', 'a');
  const result = tribal.runPreMergeTribal({ attendingTribeId: 'tribe-1' });
  assert.equal(tribal.tribalNumber, 1);
  assert.equal(result.initialVotes.find(vote => vote.voterId === 'player').targetId, 'a');
  assert.ok(result.voteOrder.length > 0);
});

test('idol registration validates holder and target; played protection excludes rock draw', () => {
  const player = survivor('player', { isPlayer: true, advantages: { idol: true } });
  const game = buildGame([player, survivor('a'), survivor('b'), survivor('c')]);
  const tribal = new TribalCouncilSystem(game, eventManager);
  assert.equal(tribal.registerIdolPlay('a', 'b'), false);
  assert.equal(tribal.registerIdolPlay('player', 'outsider'), false);
  assert.equal(tribal.registerIdolPlay('player', 'c'), true);
  tribal.buildTribeContext('tribe-1');
  tribal.resolveIdolStage();
  assert.ok(tribal.idolProtectedIds.has('c'));
  assert.ok(!tribal.runRockDraw(['a', 'b']).eligible.includes('c'));
});

test('successful Shot in the Dark nullifies votes and protects the player from rocks', () => {
  const player = survivor('player', { isPlayer: true, advantages: { shotInTheDarkAvailable: true } });
  const game = buildGame([player, survivor('a'), survivor('b'), survivor('c')]);
  const tribal = new TribalCouncilSystem(game, eventManager);
  tribal.buildTribeContext('tribe-1');
  tribal._recordVote('a', 'player');
  assert.equal(tribal.registerPlayerShotInTheDark('player'), true);
  const random = Math.random; Math.random = () => 0;
  try { tribal.resolveShotInTheDark(); } finally { Math.random = random; }
  assert.equal(tribal.shotResults[0].success, true);
  assert.equal(tribal.initialVotes[0].wasNullified, true);
  assert.ok(!tribal.runRockDraw(['a', 'b']).eligible.includes('player'));
});

test('rock pool excludes tied candidates, individual immunity, idol and SITD protection', () => {
  const members = ['player', 'tied', 'immune', 'idol', 'sitd', 'eligible'].map(id => survivor(id, { isPlayer: id === 'player', hasImmunity: id === 'immune' }));
  const tribal = new TribalCouncilSystem(buildGame(members), eventManager);
  tribal.buildTribeContext('tribe-1');
  tribal.idolProtectedIds.add('idol');
  tribal.shotResults.push({ playerId: 'sitd', success: true });
  assert.deepEqual(tribal.runRockDraw(['player', 'tied']).eligible, ['eligible']);
});

test('initial tie waits for an eligible player revote, then preserves complete ballot history', () => {
  const game = buildGame([survivor('player', { isPlayer: true }), survivor('a'), survivor('b'), survivor('c')]);
  const tribal = new TribalCouncilSystem(game, eventManager);
  const desired = { a: 'b', b: 'a', c: 'b' };
  tribal._scoreNpcTarget = (voter, target) => target.id === desired[voter.id] ? 10 : 0;
  tribal.registerPlayerVote('player', 'a');
  const pending = tribal.runPreMergeTribal({ attendingTribeId: 'tribe-1' });
  assert.equal(pending.tribalState, 'REVOTE_PENDING');
  assert.equal(pending.revotePendingPlayerChoice, true);
  assert.equal(pending.revoteVotes.length, 0);
  assert.equal(pending.initialVotes.length, 4);
  const rejected = tribal.resolveRevoteWithPlayerChoice({ tiedCandidateIds: ['player', 'c'], playerChoiceTargetId: 'c' });
  assert.equal(rejected.tribalState, 'REVOTE_PENDING');
  assert.equal(tribal.revoteVotes.length, 0);
  assert.equal(tribal.tribalNumber, 1);
  const resolved = tribal.resolveRevoteWithPlayerChoice({ tiedCandidateIds: pending.tiedCandidateIds, playerChoiceTargetId: 'a' });
  assert.equal(resolved.revoteVotes.find(vote => vote.voterId === 'player').targetId, 'a');
  assert.equal(resolved.revoteOccurred, true);
  assert.equal(resolved.initialVotes.length, 4);
  assert.equal(resolved.votes.length, 6);
  assert.equal(resolved.rockDrawOccurred, true);
  assert.deepEqual(resolved.rockDrawEligible.map(member => member.id).sort(), ['c', 'player']);
});

test('reveal planner stops only after a unique outcome is locked; ties and nullified votes stay honest', () => {
  const votes = ['a', 'b', 'a', 'a', 'a'].map(targetId => ({ targetId }));
  assert.equal(decisiveVoteIndex(votes), 3);
  assert.equal(planVoteReveals(votes).length, 4);
  assert.equal(votes.length, 5); // The source record belongs to history, never the UI.
  assert.equal(planVoteReveals(votes, { mustEstablishTie: true }).length, 5);
  const nullified = [{ targetId: 'a', wasNullified: true }, { targetId: 'b' }, { targetId: 'a' }, { targetId: 'b' }];
  assert.equal(decisiveVoteIndex(nullified), 3);
  assert.equal(planVoteReveals(nullified).length, 4);
  const fiveOne = ['a', 'b', 'a', 'a', 'a', 'a'].map(targetId => ({ targetId }));
  assert.equal(planVoteReveals(fiveOne).length, 5);
  assert.equal(planVoteReveals(fiveOne.map(vote => ({ ...vote, phase: 'revote' }))).length, 5);
});

test('each artwork from 2 through 12 has distinct measured stump anchors and stable assignments', () => {
  for (let count = 2; count <= 12; count++) {
    const slots = TRIBAL_SEAT_LAYOUTS[count];
    assert.equal(slots.length, count);
    assert.equal(new Set(slots.map(slot => `${slot.x},${slot.y}`)).size, count);
    assert.ok(slots.every(slot => slot.x > 0 && slot.x < 1024 && slot.y > 0 && slot.y < 1536));
    const members = Array.from({ length: count }, (_, index) => survivor(`s${index}`));
    const mapping = assignTribalSeats(members);
    assert.equal(mapping.size, count);
    for (const member of [...members].reverse()) assert.equal(getTribalSeat(count, mapping.get(member.id))?.id, mapping.get(member.id));
  }
});

test('post-vote beats present idol and SITD before any parchment and hide production tally', () => {
  const game = buildGame([survivor('player', { isPlayer: true }), survivor('a'), survivor('b')]);
  const view = new TribalCouncilView({ gameManager: game,
    tribalCouncilSystem: new TribalCouncilSystem(game, eventManager) });
  view.attendingTribeId = 'tribe-1';
  view.allPlayers = game.survivors;
  const voteOrder = ['a', 'b', 'a', 'a', 'a'].map(targetId => ({ targetId, phase: 'initial' }));
  view.tribalSummary = { voteOrder, idolPlays: [{ playedById: 'b', playedOnId: 'b', consumed: true }],
    shotResults: [{ playerId: 'player', success: false, consumed: true }], eliminatedId: 'a', initialTie: false };
  view.result = view.tribalSummary;
  const beats = view._buildPostVoteBeats();
  const ids = beats.map(beat => beat.id);
  assert.ok(ids.indexOf('idol-play-0') < ids.indexOf('initial-vote-0'));
  assert.ok(ids.indexOf('sitd-result-1') < ids.indexOf('initial-vote-0'));
  assert.equal(beats.filter(beat => beat.id.startsWith('initial-vote-')).length, 4);
  assert.equal(voteOrder.length, 5);
  assert.ok(beats.filter(beat => beat.parchment).every(beat => !beat.tallyLines));
  assert.equal(ids.at(-1), 'tribal-exit');
});

test('Jeff asset path exists with exact casing and urn return precedes the universal idol prompt', () => {
  const source = readFileSync(new URL('../src/modules/screens/TribalCouncilView.js', import.meta.url), 'utf8');
  assert.ok(existsSync(new URL('../Assets/TribalCouncil/Jeff.png', import.meta.url)));
  assert.ok(!source.includes('TribalCouncil/jeff.png'));
  const game = buildGame([survivor('player', { isPlayer: true }), survivor('a')]);
  const view = new TribalCouncilView({ gameManager: game, tribalCouncilSystem: new TribalCouncilSystem(game, eventManager) });
  view.attendingTribeId = 'tribe-1';
  const ids = view._buildPreVoteBeats().map(beat => beat.id);
  assert.ok(ids.indexOf('votes-collected') < ids.indexOf('urn-return'));
  assert.ok(ids.indexOf('urn-return') < ids.indexOf('idol-window'));
  assert.equal(view._buildAdvantageBeats().some(beat => beat.id === 'urn-return'), false);
  for (const [, name] of source.matchAll(/\$\{ASSET_BASE\}\/([A-Za-z0-9.-]+\.(?:png|jpeg))/g)) {
    assert.ok(existsSync(new URL(`../Assets/TribalCouncil/${name}`, import.meta.url)), name);
  }
});

test('the finished view publishes one stable summary and ends the session once', () => {
  const game = buildGame([survivor('player', { isPlayer: true }), survivor('a'), survivor('b')]);
  const tribal = new TribalCouncilSystem(game, eventManager);
  tribal.registerPlayerVote('player', 'a');
  const summary = tribal.runPreMergeTribal({ attendingTribeId: 'tribe-1' });
  let published = 0;
  const unsubscribe = tribalEvents.subscribe(GameEvents.TRIBAL_COUNCIL_COMPLETE, received => {
    assert.equal(received, summary);
    published += 1;
  });
  let completed = 0;
  try {
    const view = new TribalCouncilView({ gameManager: game, tribalCouncilSystem: tribal, onComplete: () => { completed += 1; } });
    view.tribalSummary = summary;
    view.result = summary;
    view.finish(); view.finish();
    assert.equal(published, 1);
    assert.equal(completed, 1);
    assert.equal(tribal.sessionStatus, 'idle');
    assert.equal(tribal.playerVotes.size, 0);
    assert.ok(summary.votes.length > 0);
  } finally { unsubscribe(); }
});

test('completed sessions clear all registrations; a future idol cannot be consumed by an old play', () => {
  const player = survivor('player', { isPlayer: true, advantages: { shotInTheDarkAvailable: true } });
  const a = survivor('a'); const b = survivor('b');
  const inventory = { idols: [{ id: 'idol-a', isUsed: false, played: false }] };
  const game = buildGame([player, a, b], { inventories: new Map([[player.id, inventory]]) });
  const tribal = new TribalCouncilSystem(game, eventManager);
  tribal._scoreNpcTarget = (voter, target) => target.id === (voter.id === 'a' ? 'b' : 'a') ? 10 : 0;
  tribal.beginSession();
  assert.equal(tribal.registerPlayerVote('player', 'a'), true);
  assert.equal(tribal.registerIdolPlay('player', 'player'), true);
  const first = tribal.runPreMergeTribal({ attendingTribeId: 'tribe-1' });
  assert.equal(tribal.runPreMergeTribal({ attendingTribeId: 'tribe-1' }), first);
  assert.equal(tribal.tribalNumber, 1);
  tribal.endSession();
  assert.equal(tribal.playerVotes.size, 0);
  assert.equal(tribal.idolRegistrations.length, 0);
  assert.equal(tribal.voteRecords.length, 0);
  assert.equal(tribal.currentTribe, null);
  inventory.idols.push({ id: 'idol-b', isUsed: false, played: false });
  tribal.beginSession();
  assert.equal(tribal.runPreMergeTribal({ attendingTribeId: 'tribe-1' }).tribalState, 'PLAYER_VOTE_REQUIRED');
  assert.equal(tribal.tribalNumber, 1);
  assert.equal(tribal.registerPlayerVote('player', 'b'), true);
  const second = tribal.runPreMergeTribal({ attendingTribeId: 'tribe-1' });
  assert.equal(tribal.tribalNumber, 2);
  assert.equal(second.initialVotes.find(vote => vote.voterId === 'player').targetId, 'b');
  assert.equal(second.idolPlays.length, 0);
  assert.equal(inventory.idols[1].isUsed, false);
});

test('SITD choice clears between sessions and never sacrifices a future vote', () => {
  const player = survivor('player', { isPlayer: true, advantages: { shotInTheDarkAvailable: true } });
  const game = buildGame([player, survivor('a'), survivor('b')]);
  const tribal = new TribalCouncilSystem(game, eventManager);
  tribal.beginSession();
  assert.equal(tribal.registerPlayerShotInTheDark('player'), true);
  tribal.runPreMergeTribal({ attendingTribeId: 'tribe-1' });
  tribal.endSession();
  assert.equal(tribal.sitdUsers.size, 0);
  tribal.beginSession();
  assert.equal(tribal.runPreMergeTribal({ attendingTribeId: 'tribe-1' }).tribalState, 'PLAYER_VOTE_REQUIRED');
  assert.equal(tribal.tribalNumber, 1);
  tribal.registerPlayerVote('player', 'a');
  const next = tribal.runPreMergeTribal({ attendingTribeId: 'tribe-1' });
  assert.equal(next.initialVotes.find(vote => vote.voterId === 'player').targetId, 'a');
  assert.equal(next.shotResults.length, 0);
  assert.equal(tribal.tribalNumber, 2);
});

test('all idol-nullified votes cause a void revote; protection and lost votes persist', () => {
  const player = survivor('player', { isPlayer: true, advantages: { idol: true } });
  player.hasVote = false;
  const game = buildGame([player, survivor('a'), survivor('b'), survivor('c')]);
  game.hasLostVote = member => member.id === 'player';
  const tribal = new TribalCouncilSystem(game, eventManager);
  tribal._scoreNpcTarget = (_, target) => target.id === 'player' ? 100 : target.id === 'a' ? 10 : 0;
  tribal.beginSession();
  tribal.registerIdolPlay('player', 'player');
  const result = tribal.runPreMergeTribal({ attendingTribeId: 'tribe-1' });
  assert.equal(result.zeroValidVotes, true);
  assert.equal(result.revoteReason, 'VOID_VOTE');
  assert.deepEqual(result.initialCounts, {});
  assert.equal(result.initialVotes.length, 3);
  assert.ok(result.initialVotes.every(vote => vote.wasNullified));
  assert.equal(result.revoteOccurred, true);
  assert.ok(result.revoteVotes.length > 0);
  assert.ok(result.revoteVotes.every(vote => vote.targetId !== 'player' && vote.voterId !== 'player'));
  assert.equal(result.eliminatedId, 'a');
  assert.equal(result.votes.length, result.initialVotes.length + result.revoteVotes.length);
});

test('a SAFE SITD void ballot retains immunity and vote sacrifice in the immediate revote', () => {
  const player = survivor('player', { isPlayer: true, advantages: { shotInTheDarkAvailable: true } });
  const game = buildGame([player, survivor('a'), survivor('b'), survivor('c')]);
  const tribal = new TribalCouncilSystem(game, eventManager);
  tribal._scoreNpcTarget = (_, target) => target.id === 'player' ? 100 : target.id === 'a' ? 10 : 0;
  tribal.registerPlayerShotInTheDark('player');
  const random = Math.random; Math.random = () => 0;
  let result;
  try { result = tribal.runPreMergeTribal({ attendingTribeId: 'tribe-1' }); } finally { Math.random = random; }
  assert.equal(result.shotResults[0].result, 'SAFE');
  assert.equal(result.zeroValidVotes, true);
  assert.equal(result.initialVotes.length, 3);
  assert.ok(result.revoteVotes.every(vote => vote.targetId !== 'player' && vote.voterId !== 'player'));
  assert.equal(result.eliminatedId, 'a');
});

test('valid votes still decide an idol ballot while nullified votes remain in full history', () => {
  const player = survivor('player', { isPlayer: true, advantages: { idol: true } });
  const game = buildGame([player, survivor('a'), survivor('b'), survivor('c')]);
  const tribal = new TribalCouncilSystem(game, eventManager);
  tribal._scoreNpcTarget = (voter, target) => target.id === (voter.id === 'a' ? 'b' : 'player') ? 100 : 0;
  tribal.registerPlayerVote('player', 'b');
  tribal.registerIdolPlay('player', 'player');
  const summary = tribal.runPreMergeTribal({ attendingTribeId: 'tribe-1' });
  assert.equal(summary.zeroValidVotes, false);
  assert.equal(summary.revoteOccurred, false);
  assert.equal(summary.eliminatedId, 'b');
  assert.equal(summary.votes.length, 4);
  assert.equal(summary.nullifiedVoteCount, 2);
  assert.equal(summary.voteOrder.filter(vote => vote.wasNullified).length, 2);
});

test('an NPC idol registration creates one visible play even when AI also wants to play', () => {
  const player = survivor('player', { isPlayer: true });
  const holder = survivor('holder', { advantages: { idol: true } });
  const game = buildGame([player, holder, survivor('a'), survivor('b')]);
  const tribal = new TribalCouncilSystem(game, eventManager);
  tribal._scoreNpcTarget = (_, target) => target.id === 'holder' ? 10 : 0;
  tribal.registerPlayerVote('player', 'holder');
  tribal.registerIdolPlay('holder', 'holder');
  const summary = tribal.runPreMergeTribal({ attendingTribeId: 'tribe-1' });
  assert.equal(summary.idolPlays.filter(play => play.playedById === 'holder').length, 1);
  const view = new TribalCouncilView({ gameManager: game, tribalCouncilSystem: tribal });
  view.attendingTribeId = 'tribe-1'; view.allPlayers = game.survivors;
  view.tribalSummary = summary; view.result = summary;
  const beats = view._buildPostVoteBeats();
  assert.equal(beats.filter(beat => beat.id.startsWith('idol-play-')).length, 1);
  assert.ok(beats.findIndex(beat => beat.id.startsWith('idol-play-')) < beats.findIndex(beat => beat.id.startsWith('initial-vote-')));
});

test('void revote awaits an eligible player; rejects protected, own and invalid targets', () => {
  const player = survivor('player', { isPlayer: true });
  const immune = survivor('immune', { hasImmunity: true });
  const a = survivor('a', { advantages: { idol: true } }); const b = survivor('b');
  const game = buildGame([player, immune, a, b]);
  const tribal = new TribalCouncilSystem(game, eventManager);
  tribal.registerPlayerVote('player', 'a');
  tribal.registerIdolPlay('a', 'a');
  // Give each other voter no ballot, leaving only the player's idol-nullified ballot.
  game.hasLostVote = member => member.id !== 'player';
  const pending = tribal.runPreMergeTribal({ attendingTribeId: 'tribe-1' });
  assert.equal(pending.zeroValidVotes, true);
  assert.equal(pending.tribalState, 'REVOTE_PENDING');
  assert.deepEqual(pending.revoteTargetIds.sort(), ['b', 'player']);
  assert.deepEqual(pending.revoteEligibleVoterIds, ['player']);
  for (const id of ['a', 'immune', 'player', 'invented']) {
    assert.equal(tribal.resolveRevoteWithPlayerChoice({ playerChoiceTargetId: id }), pending);
    assert.equal(tribal.revoteVotes.length, 0);
  }
  const resolved = tribal.resolveRevoteWithPlayerChoice({ playerChoiceTargetId: 'b' });
  assert.equal(resolved.eliminatedId, 'b');
  assert.equal(resolved.initialVotes.length, 1);
  assert.equal(resolved.initialVotes[0].wasNullified, true);
  assert.equal(resolved.revoteVotes.length, 1);
  assert.equal(tribal.tribalNumber, 1);
});

test('zero eligible revote targets is an explicit no-elimination outcome', () => {
  const player = survivor('player', { isPlayer: true, hasImmunity: true });
  const other = survivor('other', { advantages: { idol: true } });
  player.hasVote = false;
  const game = buildGame([player, other]);
  const tribal = new TribalCouncilSystem(game, eventManager);
  tribal._scoreNpcTarget = () => 10;
  tribal.registerIdolPlay('other', 'other');
  const summary = tribal.runPreMergeTribal({ attendingTribeId: 'tribe-1' });
  assert.equal(summary.tribalState, 'NO_ELIMINATION');
  assert.equal(summary.decisionResolved, true);
  assert.equal(summary.eliminatedId, null);
  const view = new TribalCouncilView({ gameManager: game, tribalCouncilSystem: tribal });
  view.attendingTribeId = 'tribe-1'; view.allPlayers = game.survivors;
  view.tribalSummary = summary; view.result = summary;
  const ids = view._buildPostVoteBeats().map(beat => beat.id);
  assert.ok(ids.includes('void-vote-announcement'));
  assert.ok(ids.includes('no-elimination'));
  assert.ok(!ids.includes('revote-voting-booth'));
  assert.ok(!ids.includes('snuff'));
});

test('a resolved rock draw is stable and cannot reroll on a repeat resolution probe', () => {
  const members = [survivor('player', { isPlayer: true }), survivor('a'), survivor('b'), survivor('c')];
  const game = buildGame(members);
  const tribal = new TribalCouncilSystem(game, eventManager);
  const desired = { a: 'b', b: 'a', c: 'b' };
  tribal._scoreNpcTarget = (voter, target) => target.id === desired[voter.id] ? 10 : 0;
  tribal.registerPlayerVote('player', 'a');
  const pending = tribal.runPreMergeTribal({ attendingTribeId: 'tribe-1' });
  assert.equal(pending.tribalState, 'REVOTE_PENDING');
  const originalRandom = Math.random;
  let draws = 0;
  Math.random = () => { draws += 1; return 0; };
  let result;
  try {
    result = tribal.resolveRevoteWithPlayerChoice({ playerChoiceTargetId: 'a' });
    assert.equal(result.rockDrawOccurred, true);
    const count = draws;
    assert.equal(tribal.resolveRevoteWithPlayerChoice({ playerChoiceTargetId: 'b' }), result);
    assert.equal(tribal.runPreMergeTribal({ attendingTribeId: 'tribe-1' }), result);
    assert.equal(draws, count);
  } finally { Math.random = originalRandom; }
  assert.equal(tribal.tribalNumber, 1);
  assert.deepEqual(result.revoteVotes.map(vote => vote.voterId).sort(), ['c', 'player']);
  const view = new TribalCouncilView({ gameManager: game, tribalCouncilSystem: tribal });
  view.attendingTribeId = 'tribe-1'; view.allPlayers = game.survivors;
  view.tribalSummary = result; view.result = result;
  assert.equal(view._buildPostVoteBeats().find(beat => beat.id === 'rocks-intro').button.label, 'REVEAL ROCKS');
});

test('reveal planner completes idol/SITD nullifications before a decisive valid name', () => {
  for (const nullifyReason of ['idol', 'shotInTheDark']) {
    const votes = [
      { targetId: 'boot', voterId: '1' }, { targetId: 'safe', voterId: '2', wasNullified: true, nullifyReason },
      { targetId: 'boot', voterId: '3' }, { targetId: 'safe', voterId: '4', wasNullified: true, nullifyReason },
      { targetId: 'boot', voterId: '5' }, { targetId: 'safe', voterId: '6', wasNullified: true, nullifyReason },
      { targetId: 'boot', voterId: '7' }
    ];
    const shown = planVoteReveals(votes);
    assert.equal(shown.filter(vote => vote.wasNullified).length, 3);
    assert.equal(shown.at(-1).targetId, 'boot');
    assert.equal(shown.length, 6); // Three nullifications and the decisive third countable vote.
    assert.equal(votes.length, 7);
  }
  const tie = ['a', 'b', 'b', 'a'].map(targetId => ({ targetId }));
  assert.equal(planVoteReveals(tie, { mustEstablishTie: true }).length, tie.length);
});

test('voting booth selection stays reversible until the separate CAST VOTE action', async () => {
  class FakeElement {
    constructor(tag) { this.tag = tag; this.children = []; this.listeners = {}; this.style = {}; this.disabled = false; this.textContent = ''; }
    appendChild(child) { this.children.push(child); return child; }
    addEventListener(name, callback) { this.listeners[name] = callback; }
    setAttribute() {}
    removeAttribute() {}
  }
  const oldDocument = globalThis.document;
  globalThis.document = { createElement: tag => new FakeElement(tag), createTextNode: value => Object.assign(new FakeElement('#text'), { textContent: value }) };
  try {
    const members = [survivor('player', { isPlayer: true }), survivor('a'), survivor('b')];
    members[1].name = 'A'; members[2].name = 'B';
    const game = buildGame(members);
    const tribal = new TribalCouncilSystem(game, eventManager);
    const view = new TribalCouncilView({ gameManager: game, tribalCouncilSystem: tribal });
    view.attendingTribeId = 'tribe-1';
    view.beatRunner = { currentIndex: 0, goTo() {} };
    const root = new FakeElement('div');
    const buttons = () => {
      const found = []; const visit = node => { if (node.tag === 'button') found.push(node); node.children.forEach(visit); };
      visit(root); return found;
    };
    view._renderVotingContent(root);
    buttons().find(button => button.children.some(child => child.textContent === 'A')).listeners.click();
    assert.equal(view.selectedVote, 'a');
    assert.equal(tribal.playerVotes.size, 0);
    root.children = []; view._renderVotingContent(root);
    buttons().find(button => button.children.some(child => child.textContent === 'B')).listeners.click();
    assert.equal(view.selectedVote, 'b');
    assert.equal(tribal.playerVotes.size, 0);
    root.children = []; view._renderVotingContent(root);
    buttons().find(button => button.textContent === 'CAST VOTE').listeners.click();
    assert.equal(tribal.playerVotes.get('player'), 'b');
  } finally { globalThis.document = oldDocument; }
});

test('revote portraits, reversible selection and preview share the ballot-flow layout', () => {
  class FakeElement {
    constructor(tag) { this.tag = tag; this.children = []; this.listeners = {}; this.style = {}; this.textContent = ''; }
    appendChild(child) { this.children.push(child); return child; }
    addEventListener(name, callback) { this.listeners[name] = callback; }
    setAttribute() {}
    removeAttribute() {}
  }
  const oldDocument = globalThis.document;
  globalThis.document = { createElement: tag => new FakeElement(tag), createTextNode: text => Object.assign(new FakeElement('#text'), { textContent: text }) };
  try {
    const members = [survivor('player', { isPlayer: true }), survivor('a'), survivor('b')];
    members[1].name = 'A'; members[2].name = 'B';
    const game = buildGame(members);
    const tribal = new TribalCouncilSystem(game, eventManager);
    const view = new TribalCouncilView({ gameManager: game, tribalCouncilSystem: tribal });
    view.attendingTribeId = 'tribe-1';
    view.tribalSummary = { initialTie: true, tiedCandidateIds: ['a', 'b'], revoteTargetIds: ['a', 'b'], playerCanRevote: true };
    view.beatRunner = { currentIndex: 0, goTo() {} };
    const root = new FakeElement('div');
    const render = () => { root.children = []; view._renderRevoteVotingContent(root); return root.children[0]; };
    let flow = render();
    assert.equal(flow.className, 'tribal-ballot-flow');
    assert.equal(flow.children[0].className, 'tribal-dialogue');
    flow.children[1].children[0].listeners.click();
    assert.equal(view.playerRevote, 'a');
    assert.equal(tribal.revoteVotes.length, 0);
    flow = render();
    assert.match(flow.children[0].textContent, /YOUR REVOTE: A/);
    assert.doesNotMatch(flow.children[0].textContent, /LOCKED/);
    flow.children[1].children[1].listeners.click();
    assert.equal(view.playerRevote, 'b');
    assert.equal(tribal.revoteVotes.length, 0);
    assert.match(render().children[2].textContent, /B/);
  } finally { globalThis.document = oldDocument; }
});
