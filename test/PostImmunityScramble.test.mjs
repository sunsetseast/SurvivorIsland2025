import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { makeScrambleQa, scrambleProjection, validateScrambleHarness } from '../qa/ScrambleSimulationHarness.mjs';
import { quiet } from '../qa/LivingCampSimulationHarness.mjs';
const { scrambleConversationSeconds, ScrambleState } = await import('../src/modules/systems/ScrambleActivityPlan.js');
const { campGroups } = await import('../src/modules/ui/CampPresentation.js');
const { default: CampInteractionSystem } = await import('../src/modules/systems/CampInteractionSystem.js');
const { default: social } = await import('../src/modules/systems/SocialEngine.js');
const { default: CampScreen } = await import('../src/modules/screens/CampScreen.js');
const { default: TribalKnowledgeModel } = await import('../src/modules/systems/TribalKnowledgeModel.js');
const q = run => quiet(run);
function controlled() {
  const s = makeScrambleQa(); s.strategy.scramble.meetings = []; s.strategy.scramble.nextApproachAt = -1; s.idle();
  return { ...s, a: s.activity.npcs()[0], b: s.activity.npcs()[1], c: s.activity.npcs()[2] };
}
function dialogue(s) {
  s.conversation._validateConversationTreeOnStart = () => {};
  s.conversation._showTopicSelection = () => {};
  s.conversation._startNpcInitiatedConversation = () => {};
  s.conversation._showNpcApproachOverlay = (_npc, _place, accept) => accept();
}

test('waiting advances the authoritative post-immunity clock', () => {
  const s = controlled(); s.wait(60); assert.equal(s.gm.dayTimer, 3540);
});
test('rendering nearby groups and legacy heartbeat calls cannot advance strategy', () => {
  const s = controlled(), before = scrambleProjection(s);
  for (let i = 0; i < 50; i++) { campGroups(s.gm, 'beach'); s.strategy.runStrategyBeat(); s.strategy.triggerNpcScramble(); }
  assert.deepEqual(scrambleProjection(s), before);
});
test('real-second clock source cannot mutate post-immunity time or activities', () => {
  const s = controlled(), before = scrambleProjection(s);
  s.gm.decreaseDayTimer(); s.gm.consumeCampTime(999, { source: 'clock' }); assert.deepEqual(scrambleProjection(s), before);
});
test('no strategy intervals are scheduled by start or compatibility entry points', async () => {
  const s = makeScrambleQa({ start: false }); let intervals = 0;
  const old = globalThis.setInterval; globalThis.setInterval = () => { intervals++; };
  try { await s.strategy.startPostChallengePhase(); s.strategy.beginStrategyBeats(); s.strategy.startTimerWatcher(); }
  finally { globalThis.setInterval = old; }
  assert.equal(intervals, 0);
});
test('CampScreen post-immunity clock setup creates no wall-clock heartbeat', async () => {
  const s = controlled(), screen = new CampScreen(); screen.isActive = true; screen.ensureClockUI = () => {};
  await screen.startCampClockTick(); assert.equal(screen.clockRunning, false); assert.equal(s.gm.dayTimer, 3600); screen.teardown();
});
test('NPC strategic activity resolves only after its semantic duration', () => {
  const s = controlled(), block = s.activity.start(s.a, { type: 'strategy_conversation', location: 'beach', targetId: s.b.id, duration: 180 });
  s.wait(179); assert.ok(!s.strategy.scramble.history.some(h => h.activityId === block.id));
  s.wait(1); assert.ok(s.strategy.scramble.history.some(h => h.type === 'conversation_resolved' && h.activityId === block.id));
});
test('reading a reserved player conversation freezes time and keeps the NPC occupied', () => {
  const s = controlled(); s.activity.beginConversation(s.a, { location: 'beach' });
  const block = s.a.campActivity.id; for (let i = 0; i < 20; i++) campGroups(s.gm, 'beach');
  assert.equal(s.gm.dayTimer, 3600); assert.equal(s.a.campActivity.id, block); assert.equal(s.a.campActivity.interruptible, false);
});
test('production ConversationSystem close spends semantic time once', () => {
  const s = controlled(); dialogue(s);
  s.conversation.startPlayerConversation({ npcId: s.a.id, phase: 'post', context: { location: 'beach' } });
  assert.ok(s.activity.conversation); q(() => s.conversation.closeConversation());
  assert.equal(s.gm.dayTimer, 3510); q(() => s.conversation.closeConversation()); assert.equal(s.gm.dayTimer, 3510);
});
test('simple bounded duration tiers distinguish check-in, target talk and deals', () => {
  const quick = scrambleConversationSeconds({}), target = scrambleConversationSeconds({ topics: 'pitch_target' }), deal = scrambleConversationSeconds({ topics: 'offer_deal_vote_together' });
  assert.ok(quick < target && target < deal); assert.equal(scrambleConversationSeconds({ topics: 'gossip', strategy: true }), 120); assert.equal(scrambleConversationSeconds({ topics: 'deal', turns: 100 }), 480);
});
test('meaningful turns and earlier deal purpose survive topic changes and save', () => {
  const s = controlled(); s.activity.beginConversation(s.a, { location: 'beach' });
  s.activity.conversation.topics = 'offer_deal_vote_together'; s.activity.conversation.turns = 2; s.restore();
  q(() => s.activity.finishConversation({ topics: 'smalltalk' })); assert.equal(s.gm.dayTimer, 3240);
});
test('conversation time progresses other NPC activity and camp needs', () => {
  const s = controlled(); s.activity.start(s.c, { type: 'observe', location: 'beach', duration: 60 });
  const id = s.c.campActivity.id, water = s.gm.player.water;
  s.activity.beginConversation(s.a, { location: 'beach' }); q(() => s.activity.finishConversation({ topics: 'deal', turns: 2 }));
  assert.notEqual(s.c.campActivity?.id, id); assert.ok(s.gm.player.water <= water);
});
test('remote NPC cannot begin a physical player conversation', () => {
  const s = controlled(); s.activity.start(s.a, { type: 'observe', location: 'waterWell' }); dialogue(s);
  s.conversation.startPlayerConversation({ npcId: s.a.id, phase: 'post', context: { location: 'beach' } }); assert.equal(s.activity.conversation, null);
});
test('destination marker does not allow Talk or Approach before arrival', () => {
  const s = controlled(); s.gm.player.location = 'waterWell'; window.campScreen.currentView = 'waterWell';
  s.activity.start(s.a, { type: 'travel', location: 'waterWell', goal: { type: 'idle_at_camp', location: 'waterWell' } });
  assert.equal(s.activity.beginConversation(s.a, { location: 'waterWell' }), false);
  assert.ok(!campGroups(s.gm, 'waterWell').some(g => g.members.some(m => m.id === s.a.id)));
});
test('in-transit NPC cannot witness destination strategic content or visible group', () => {
  const s = controlled(); s.activity.start(s.b, { type: 'idle_at_camp', location: 'waterWell' });
  s.activity.start(s.c, { type: 'strategy_conversation', location: 'waterWell', targetId: s.b.id, duration: 20 });
  s.activity.start(s.a, { type: 'travel', location: 'waterWell', goal: { type: 'idle_at_camp', location: 'waterWell' } }); s.wait(20);
  assert.ok(!s.memory.getCampObservations(s.a.id).some(e => e.type === 'seen_together' && e.location === 'waterWell'));
  assert.equal(s.memory.getCampClaims(s.a.id).length, 0);
});
test('in-transit player does not gain destination group observations', () => {
  const s = controlled(); s.activity.start(s.b, { type: 'idle_at_camp', location: 'waterWell' });
  s.activity.start(s.c, { type: 'strategy_conversation', location: 'waterWell', targetId: s.b.id });
  const interactions = new CampInteractionSystem(s.gm, { getView: () => 'waterWell' });
  s.activity.start(s.gm.player, { type: 'travel', location: 'waterWell', external: true });
  const before = s.memory.getCampObservations(s.gm.player.id).length;
  assert.deepEqual(interactions.seeGroups('waterWell'), []); assert.equal(s.memory.getCampObservations(s.gm.player.id).length, before);
});
test('arrival unlocks conversation and records the actual completion time once', () => {
  const s = controlled(); s.gm.player.location = 'waterWell'; window.campScreen.currentView = 'waterWell';
  const step = s.activity.start(s.a, { type: 'travel', location: 'waterWell', goal: { type: 'idle_at_camp', location: 'waterWell' } });
  s.wait(20); s.restore(); s.wait(25); const actor = s.activity.npcs().find(p => p.id === s.a.id);
  assert.ok(s.present(actor, 'waterWell')); assert.ok(s.activity.beginConversation(actor, { location: 'waterWell' }));
  const arrivals = s.memory.getCampObservations(s.gm.player.id).filter(e => e.id === `${step.id}:arrival`);
  assert.equal(arrivals.length, 1); assert.equal(arrivals[0].campTime, 3555);
});
test('missed conversation goal becomes regrouping when its intended listener is occupied', () => {
  const s = controlled(); s.activity.start(s.b, { type: 'private_conversation', location: 'waterWell', external: true });
  s.activity.start(s.a, { type: 'travel', location: 'waterWell', goal: { type: 'strategy_conversation', location: 'waterWell', targetId: s.b.id } });
  s.wait(45); assert.equal(s.a.campActivity.type, 'observe');
  assert.ok(s.present(s.a, 'waterWell')); assert.equal(s.b.campActivity.type, 'private_conversation');
});
test('participant cannot be booked into two simultaneous conversations', () => {
  const s = controlled(); const first = s.activity.start(s.a, { type: 'strategy_conversation', location: 'beach', targetId: s.b.id });
  const second = s.activity.start(s.c, { type: 'strategy_conversation', location: 'beach', targetId: s.b.id });
  assert.equal(s.b.campActivity.id, first.id); assert.ok(!second.participantIds?.includes(s.b.id));
});
test('interrupting either participant releases the entire exact shared activity', () => {
  const s = controlled(); const first = s.activity.start(s.a, { type: 'strategy_conversation', location: 'beach', targetId: s.b.id });
  assert.ok(s.activity.interrupt(s.b)); assert.equal(s.a.campActivity, null); assert.equal(s.b.campActivity, null); assert.ok(s.activity.resolved.has(first.id));
});
test('legacy offscreen SocialEngine post chatter cannot generate parallel outcomes', () => {
  const s = controlled(), before = scrambleProjection(s); social.runOffscreenNpcChatter({ phaseType: 'post', beatId: 'qa' }); assert.deepEqual(scrambleProjection(s), before);
});
test('premerge chatter target selection never chooses outsiders, out or immune contestants', () => {
  const s = controlled(), outsider = { id: 9000, firstName: 'Outside', tribeId: 2 }; s.gm.survivors = [...s.gm.survivors, outsider]; s.a.isOut = true;
  const old = s.gm.hasImmunity; s.gm.hasImmunity = person => person?.id === s.b.id;
  try { for (let i = 0; i < 100; i++) { const target = social._pickChatterTarget(); assert.ok(![outsider.id, s.a.id, s.b.id].includes(target?.id)); } }
  finally { s.gm.hasImmunity = old; }
});
test('legitimate physical pitch updates intent without revealing it to bystanders', () => {
  const s = controlled(); s.strategy.pickAction = () => 'SOFT_COUNTER'; const original = s.strategy.pickTargetForAction;
  s.strategy.pickTargetForAction = () => s.c.id;
  try { s.activity.start(s.a, { type: 'strategy_conversation', location: 'beach', targetId: s.b.id, duration: 30 }); s.wait(30);
    assert.equal(s.strategy.getNpcTargetIntent(s.a.id).targetId, s.c.id);
    assert.ok(s.memory.getCampClaims(s.b.id).some(c => c.subjectId === s.c.id));
    assert.ok(!s.strategy.getPlayerSummaryFacts().some(f => f.type === 'targetProposed'));
  } finally { delete s.strategy.pickAction; s.strategy.pickTargetForAction = original; }
});
test('resulting intents still project into the existing Tribal target board', () => {
  const s = controlled(); s.strategy.updateNpcIntentTarget(s.a.id, s.c.id); const board = s.strategy.computeTribalTargetBoard();
  assert.ok(board.heatMap[String(s.c.id)] >= 1); assert.equal(s.strategy.getTribalTargetBoard(), board);
});
test('NPC immunity remains excluded from all intent and target board inputs', () => {
  const s = controlled(), old = s.gm.hasImmunity; s.gm.hasImmunity = p => p?.id === s.c.id;
  try { assert.equal(s.strategy.updateNpcIntentTarget(s.a.id, s.c.id), null); s.strategy.npcIntentTargets.set(s.a.id, s.c.id);
    assert.equal(s.strategy.getNpcTargetIntent(s.a.id), null); assert.equal(s.strategy.computeTribalTargetBoard().heatMap[s.c.id], undefined); }
  finally { s.gm.hasImmunity = old; }
});
test('player immunity remains excluded while the player can still participate', () => {
  const s = controlled(), old = s.gm.hasImmunity; s.gm.hasImmunity = p => p?.isPlayer;
  try { assert.equal(s.strategy.updateNpcIntentTarget(s.a.id, s.gm.player.id), null); assert.ok(s.activity.beginConversation(s.a, { location: 'beach' })); }
  finally { s.gm.hasImmunity = old; }
});
test('NPC approach uses real routes before an invitation exists', () => {
  const s = controlled(); s.strategy.scramble.nextApproachAt = 3600; s.gm.player.location = 'waterWell'; window.campScreen.currentView = 'waterWell';
  s.strategy.onActivityBoundary(3600); const npc = s.activity.npcs().find(p => p.campActivity?.goal?.type === 'approach_player');
  assert.ok(npc); assert.equal(npc.campActivity.type, 'travel'); assert.equal(s.strategy.scramble.invitation, null);
  s.wait(45); assert.equal(s.strategy.scramble.invitation, null);
  s.wait(300); assert.ok(s.strategy.scramble.history.some(h => h.type === 'npc_approach'));
});
test('only physically present approach wait can launch the preserved NPC dialogue', () => {
  const s = controlled(); dialogue(s); s.strategy.scramble.nextApproachAt = 3600; s.strategy.onActivityBoundary(3600); s.wait(45);
  const invite = s.strategy.scramble.invitation; assert.ok(invite);
  const npc = s.activity.npcs().find(p => p.id === invite.npcId);
  s.conversation.startNpcConversation(npc, invite.purpose, { initiatedByNpc: true, context: { phase: 'post' }, location: 'beach' });
  assert.equal(s.activity.conversation.npcId, npc.id); assert.equal(s.strategy.scramble.invitation, null);
});
test('closing/canceling dialogue releases every participant and player reservation', () => {
  const s = controlled(); s.activity.beginConversation(s.a, { location: 'beach' }); s.activity.reserveConversationGroup([s.b.id]);
  const id = s.a.campActivity.id; q(() => s.activity.finishConversation());
  for (const person of s.gm.getPlayerTribe().members) assert.notEqual(person.campActivity?.id, id);
  assert.equal(s.activity.conversation, null);
});
test('occupied player-conversation participant cannot take offscreen strategy', () => {
  const s = controlled(); s.activity.beginConversation(s.a, { location: 'beach' }); const id = s.a.campActivity.id;
  assert.equal(s.activity.start(s.a, { type: 'strategy_conversation', location: 'shelter', targetId: s.c.id }), null);
  s.wait(120); assert.equal(s.a.campActivity.id, id);
});
test('alliance meeting gathers through travel before occupying shared physical time', () => {
  const s = controlled(); s.strategy.scramble.scheduleAlliances(); const meeting = s.strategy.scramble.meetings[0]; meeting.dueAt = 3600;
  s.strategy.onActivityBoundary(3600); assert.equal(meeting.status, 'gathering');
  for (const id of meeting.memberIds.filter(id => id !== s.gm.player.id)) assert.equal(s.present(s.activity.npcs().find(p => p.id === id), meeting.location), false);
  s.wait(180); assert.equal(meeting.status, 'active'); const owner = s.activity.npcs().find(p => p.campActivity?.id === meeting.activityId && !p.campActivity.external);
  assert.equal(owner.campActivity.type, 'alliance_meeting'); assert.equal(owner.campActivity.interruptible, false);
});
test('player can attend only an actual arrived alliance meeting', () => {
  const s = controlled(); dialogue(s); s.strategy.scramble.scheduleAlliances(); const meeting = s.strategy.scramble.meetings[0]; meeting.dueAt = 3600;
  assert.equal(s.strategy.scramble.attend(meeting.id), false); s.strategy.onActivityBoundary(3600); s.wait(180);
  assert.equal(s.strategy.scramble.attend(meeting.id), false); s.gm.player.location = meeting.location; window.campScreen.currentView = meeting.location;
  assert.ok(s.strategy.scramble.attend(meeting.id)); assert.equal(s.activity.conversation.groupIds.length, 2);
  const before = s.gm.dayTimer; q(() => s.activity.finishConversation()); assert.ok(before - s.gm.dayTimer >= 300);
});
test('gathering members wait for occupied allies to finish before meeting', () => {
  const s = controlled(); s.strategy.scramble.scheduleAlliances(); const meeting = s.strategy.scramble.meetings[0]; meeting.dueAt = 3600;
  const block = s.activity.start(s.a, { type: 'strategy_conversation', location: 'beach', targetId: s.b.id, duration: 150 });
  s.strategy.onActivityBoundary(3600); assert.equal(meeting.status, 'gathering');
  assert.equal(s.a.campActivity.id, block.id); assert.ok(s.c.campActivity.goal?.meetingId === meeting.id || s.c.campActivity.meetingId === meeting.id);
  s.wait(150); assert.ok(s.strategy.scramble.history.some(h => h.activityId === block.id));
  s.wait(180); assert.equal(meeting.status, 'active');
});
test('inactive alliances do not schedule scramble meetings', () => {
  const s = controlled(); s.gm.systems.allianceSystem.getAllAlliances()[0].active = false;
  s.strategy.scramble.scheduleAlliances(); assert.equal(s.strategy.scramble.meetings.length, 0);
});
test('save halfway through meeting gathering preserves reservations and resolution', () => {
  const s = controlled(); s.strategy.scramble.scheduleAlliances(); s.strategy.scramble.meetings[0].dueAt = 3600;
  s.strategy.onActivityBoundary(3600); s.wait(20); const before = scrambleProjection(s);
  s.restore(); assert.deepEqual(scrambleProjection(s), before); s.wait(160);
  assert.equal(s.strategy.scramble.meetings[0].status, 'active'); s.wait(360);
  assert.equal(s.strategy.scramble.meetings[0].status, 'completed');
});
test('stale meeting cannot release participants from unrelated activities', () => {
  const s = controlled(); s.strategy.scramble.scheduleAlliances(); const meeting = s.strategy.scramble.meetings[0]; meeting.dueAt = 3600;
  s.strategy.onActivityBoundary(3600); s.wait(180); s.gm.player.location = meeting.location;
  s.a.campActivity = null; s.b.campActivity = null;
  const block = s.activity.start(s.a, { type: 'private_conversation', location: meeting.location, external: true });
  assert.equal(s.strategy.scramble.attend(meeting.id), false); assert.equal(s.a.campActivity.id, block.id);
});
test('safe tribe receives ordinary camp activities without strategy generation', () => {
  const s = controlled(); s.strategy.playerTribeSafe = true; s.strategy.scramble.nextApproachAt = 3600;
  const before = s.strategy.strategyFacts.length; s.wait(3600);
  assert.equal(s.strategy.strategyFacts.length, before); assert.equal(s.strategy.scramble.invitation, null);
});
test('existing alliance membership and target projection remain save-compatible', () => {
  const s = controlled(); const ids = s.gm.systems.allianceSystem.getAllAlliances()[0].memberIds;
  s.strategy.allianceTargets.set('qa-core', s.c.id); s.restore();
  assert.deepEqual(s.gm.systems.allianceSystem.getAllAlliances()[0].memberIds, ids); assert.equal(s.strategy.allianceTargets.get('qa-core'), s.c.id);
  assert.ok(s.strategy.computeTribalTargetBoard().heatMap[s.c.id] >= 1);
});
test('restoring does not duplicate scheduled alliance meetings or alliances', () => {
  const s = makeScrambleQa(); const meetingIds = s.strategy.scramble.meetings.map(m => m.id);
  s.restore(); s.strategy.scheduleAllianceMeetings(); s.restore(); s.strategy.scheduleAllianceMeetings();
  assert.deepEqual(s.strategy.scramble.meetings.map(m => m.id), meetingIds); assert.equal(s.gm.systems.allianceSystem.getAllAlliances().length, 1);
});
test('post-immunity save preserves semantic time, intent confidence and occupied locations', () => {
  const s = makeScrambleQa(); s.wait(20); const before = scrambleProjection(s); s.restore(); assert.deepEqual(scrambleProjection(s), before);
});
test('legacy active strategy save adopts semantic meetings without reseeding or resetting time', () => {
  const s = makeScrambleQa(); s.wait(800); const intent = s.strategy.getNpcTargetIntent(s.npcs[0].id), payload = s.gm.createSavePayload();
  delete payload.systems.strategyPhaseSystem.scramble;
  payload.systems.strategyPhaseSystem.pendingAllianceMeetings = [{ allianceId: 'qa-core', locationView: 'waterWell' }];
  payload.systems.strategyPhaseSystem.startedForPhaseKey = null;
  assert.ok(q(() => s.gm.restoreSavePayload(JSON.parse(JSON.stringify(payload)))));
  assert.equal(s.gm.dayTimer, 2800); assert.deepEqual(s.strategy.getNpcTargetIntent(s.npcs[0].id), intent);
  assert.equal(s.strategy.scramble.meetings.length, 1); assert.equal(s.strategy.scramble.meetings[0].location, 'waterWell');
  assert.equal(s.strategy.startedForPhaseKey, '1-postChallenge');
});
test('alliance scheduling does not overwrite disagreeing individual preferences', () => {
  const s = makeScrambleQa({ scenario: 'alliance-disagreement' }), before = [...s.strategy.npcIntentTargets];
  s.strategy.scheduleAllianceMeetings(); assert.deepEqual([...s.strategy.npcIntentTargets], before);
  const members = s.strategy.scramble.meetings[0].memberIds.filter(id => id !== s.gm.player.id);
  assert.ok(new Set(members.map(id => s.strategy.getNpcTargetIntent(id).targetId)).size > 1);
});
test('pending NPC invitation and its reservation restore without wall timeout', () => {
  const s = controlled(); s.strategy.scramble.nextApproachAt = 3600; s.strategy.onActivityBoundary(3600); s.wait(45);
  const invite = structuredClone(s.strategy.scramble.invitation); s.restore(); assert.deepEqual(s.strategy.scramble.invitation, invite);
  assert.equal(s.activity.npcs().find(p => p.id === invite.npcId).campActivity.id, invite.activityId);
});
test('player conversation reservation resumes after JSON restore and charges once', () => {
  const s = controlled(); dialogue(s); s.activity.beginConversation(s.a, { location: 'beach' }); s.restore();
  s.conversation.startPlayerConversation({ npcId: s.a.id, phase: 'post', context: { location: 'beach' } });
  assert.equal(s.activity.conversation.npcId, s.a.id); q(() => s.conversation.closeConversation()); assert.equal(s.gm.dayTimer, 3510);
});
test('phase starts once even if force/zero timer or repeated setup requests follow', async () => {
  const s = makeScrambleQa({ start: false }); await s.strategy.startPostChallengePhase(); s.wait(60); const before = scrambleProjection(s);
  assert.equal(await s.strategy.startPostChallengePhase({ force: true }), false); assert.deepEqual(scrambleProjection(s), before);
  s.gm.dayTimer = 0; assert.equal(await s.strategy.startPostChallengePhase({ force: true }), false); assert.equal(s.gm.dayTimer, 0);
});
test('semantic expiry resolves once with no forced administrative picker', async () => {
  const s = controlled(); let summaries = 0; const show = s.strategy.showSummaryView; s.strategy.showSummaryView = () => summaries++;
  const picker = s.strategy.buildAvatarGridPickerModal; s.strategy.buildAvatarGridPickerModal = () => { throw Error('admin picker'); };
  try { s.wait(3600); await s.strategy.handleTimerExpired(); assert.equal(summaries, 1); assert.equal(s.strategy.scrambleState, ScrambleState.BEFORE_TRIBAL);
    assert.ok(s.gm.getPlayerTribe().members.every(p => !p.campActivity)); }
  finally { s.strategy.showSummaryView = show; s.strategy.buildAvatarGridPickerModal = picker; }
});
test('Tribal summary handoff runs once and preserves individual intent API', () => {
  const s = controlled(); s.wait(3600); let transitions = 0; const old = s.gm.setGameState; s.gm.setGameState = () => transitions++;
  try { q(() => s.strategy.proceedAfterSummary()); q(() => s.strategy.proceedAfterSummary()); assert.equal(transitions, 1); assert.equal(s.gm.gamePhase, 'tribalCouncil'); assert.equal(s.strategy.scrambleState, ScrambleState.COMPLETE); }
  finally { s.gm.setGameState = old; }
});
test('CampScreen re-entry loads existing scramble without rerunning return events', () => {
  const s = controlled(), screen = new CampScreen(); let runs = 0; screen.ensureTaskIcon = () => {}; screen.renderClockUI = () => {};
  screen.runScriptedPostChallengeFlow = () => { runs++; }; screen.loadView = () => {};
  const old = document.getElementById; document.getElementById = () => ({ style: {} });
  try { screen.setup(); screen.setup(); assert.equal(runs, 0); assert.equal(s.gm.dayTimer, 3600); }
  finally { document.getElementById = old; }
});
test('safe-tribe completion path retains its Season Engine delegation', () => {
  const s = controlled(); s.strategy.playerTribeSafe = true; let completions = 0; const old = s.gm.endPostChallengePhase;
  s.gm.endPostChallengePhase = () => completions++;
  try { q(() => s.strategy.proceedAfterSummary()); q(() => s.strategy.proceedAfterSummary()); assert.equal(completions, 1); }
  finally { s.gm.endPostChallengePhase = old; }
});
test('TribalKnowledgeModel grants pitch facts to participants, never arbitrary bystanders', () => {
  const s = controlled(); s.strategy.logFact({ type: 'targetProposed', speakerId: s.a.id, targetId: s.c.id, participantIds: [s.b.id] });
  const model = new TribalKnowledgeModel(s.gm, s.gm.getPlayerTribe().members);
  const fact = model.facts.find(f => f.type === 'targetProposed'); assert.ok(fact.knownTo.includes(String(s.b.id))); assert.ok(!fact.knownTo.includes(String(s.gm.player.id)));
});
test('six complete deterministic scramble scenarios survive halfway save/load equivalently', () => {
  const results = validateScrambleHarness(); assert.equal(results.length, 6);
  for (const result of results) { assert.equal(result.elapsedMinutes, 60); assert.ok(result.saveLoadEquivalent); assert.ok(result.conversations > 0); assert.equal(result.savedAt, 1800); assert.ok(result.meetings.every(m => ['completed', 'cancelled'].includes(m.status))); assert.ok(result.tribalInputs.length > 0); }
  assert.ok(results.flatMap(r => r.meetings).filter(m => m.status === 'completed').length >= 5);
  assert.ok(results.find(r => r.scenario === 'late-change').actions.includes('late_counter'));
});
test('active strategy source has no wall-clock strategic scheduling', () => {
  const source = fs.readFileSync(new URL('../src/modules/systems/StrategyPhaseSystem.js', import.meta.url), 'utf8');
  assert.ok(!source.includes('setInterval(')); assert.ok(!source.includes('setTimeout('));
});
