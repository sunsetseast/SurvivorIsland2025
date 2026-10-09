import test from 'node:test';
import assert from 'node:assert/strict';
import { autonomousSituation } from '../qa/AutonomousDelegationHarness.mjs';
import { makeConversationStrategyQa } from '../qa/ConversationStrategyHarness.mjs';
import { quiet } from '../qa/LivingCampSimulationHarness.mjs';
import { taskAction, strategicWorkKey } from '../src/modules/systems/StrategicTaskActions.js';
import { evaluateReportEvidence, withinReportWindow } from '../src/modules/systems/StrategicTaskReports.js';
const check = (name, fn) => test(name, () => quiet(fn));

function assignment(purpose) {
  const s = makeConversationStrategyQa(), S = s.by('Sandra'), M = s.by('Michele'), T = s.by('Tony');
  if (purpose === 'repair') s.act('threaten', s.gm.player, M, { subjectId: T.id });
  const event = s.e.events(s.gm.player.id)[0];
  s.act('delegate', S, s.gm.player, { subjectId: M.id, requestedAction: purpose,
    planTargetId: T.id, eventId: event?.id });
  s.e.tasks.respond(s.task().id, s.gm.player.id, true);
  return { ...s, S, M, T };
}
const reportClaim = (s) => s.e.knowledge(s.S.id).filter(k => k.topic === 'task_report').at(-1);

for (const purpose of ['verify_vote', 'warn', 'recruit', 'pass_info', 'backup', 'protect_source'])
  check(`${purpose}: a worker's refusal retains the need and changes the executor, not the vote`, () => {
    const s = autonomousSituation(purpose), S = s.owner, player = s.gm.player;
    const needs = s.e.objectives.workPlanner.candidates(S, s.objective, s.gm.dayTimer);
    const w = needs.find(w => w.purpose === purpose && w.targetId !== player.id);
    assert.ok(w);
    const J = [s.by('Jeremy'), s.by('Parvati')].find(p => p.id !== w.targetId);
    s.gm.systems.trustSystem.setTrust(S.id, J.id, 100);
    s.gm.systems.trustSystem.ownedTrust[`${J.id}>${S.id}`] = 0;
    for (let i = 0; i < 5; i++) s.memory.recordCampObservation({ id: `refusal-connection:${i}`,
      actorId: J.id, participantIds: [w.targetId], witnessIds: [S.id], type: 'seen_together',
      day: s.gm.day, campTime: s.gm.dayTimer });
    // All members physically meet at camp; the request itself is a real exchange.
    s.activity.start(J, { type: 'idle_at_camp', location: 'beach', duration: 3000 });
    const before = s.strategy.getNpcTargetIntent(w.targetId)?.targetId;
    s.act('delegate', S, J, { subjectId: w.targetId, planTargetId: w.subjectId || s.objective.targetId,
      primaryTargetId: s.objective.targetId, claimId: w.claimId, requestedAction: purpose,
      objectiveId: s.objective.id, workKey: w.key });
    const t = s.task(); assert.equal(t.publicStatus, 'refused');
    s.objective.workReceipts = { [w.key]: { day: s.gm.day, at: s.gm.dayTimer, taskId: t.id, kind: 'request' } };
    const retained = s.e.objectives.workPlanner.candidates(S, s.objective, s.gm.dayTimer).find(x =>
      x.key === w.key || (purpose === 'backup' && x.purpose === 'backup'));
    assert.ok(retained, 'worker refusal does not cancel the need');
    const candidates = [J, player, s.by('Parvati')].filter(x => x.id !== w.targetId);
    s.gm.systems.trustSystem.setTrust(S.id, player.id, 100);
    for (let i = 0; i < 5; i++) s.memory.recordCampObservation({ id: `replacement:${i}`,
      actorId: player.id, participantIds: [w.targetId], witnessIds: [S.id], type: 'seen_together',
      day: s.gm.day, campTime: s.gm.dayTimer });
    const selected = s.e.objectives.intermediary(S, s.e.person(w.targetId), s.objective, candidates, w);
    assert.equal(selected?.person.id, player.id);
    assert.equal(s.e.tasks.refusedWork(S.id, J.id, w, s.objective.id, s.gm.dayTimer), true);
    assert.equal(s.e.objectives.intermediary(S, s.e.person(w.targetId), s.objective, [J], w), null, 'personal recovery remains possible');
    assert.equal(s.strategy.getNpcTargetIntent(w.targetId)?.targetId, before);
    const changed = { ...w, claimId: 'new-material-evidence' };
    changed.key = strategicWorkKey(s.objective.id, changed);
    assert.equal(s.e.tasks.refusedWork(S.id, J.id, changed, s.objective.id, s.gm.dayTimer), false);
  });

check('reported target refusal cools the exact proposal; new evidence creates a distinct useful question', () => {
  const s = autonomousSituation('verify_vote'), w = s.e.objectives.workPlanner.candidates(s.owner, s.objective, 3000)[0];
  s.act('delegate', s.owner, s.gm.player, { subjectId: w.targetId, requestedAction: w.purpose,
    objectiveId: s.objective.id, workKey: w.key, claimId: w.claimId });
  s.e.tasks.respond(s.task().id, s.gm.player.id, true);
  // A spoken report is the requester's evidence, not the hidden outcome.
  s.task().outcome = { stance: 'refused' };
  s.act('report', s.gm.player, s.owner, { delegationId: s.task().id });
  assert.equal(s.e.objectives.workPlanner.candidates(s.owner, s.objective, 2999).some(x => x.key === w.key), false);
  s.gm.dayTimer = 2700;
  s.claim('new-vote-flip', s.by('Parvati'), s.by('Tony'), 'commitment', 'yes', {
    attributedId: s.by('Michele').id, origin: 'hearsay' });
  assert.ok(s.e.objectives.workPlanner.candidates(s.owner, s.objective, 2700).some(x => x.purpose === 'verify_vote'));
});
check('a late refusal after hedging cools from the answer, not the old request', () => {
  const s = autonomousSituation('verify_vote'), w = s.e.objectives.workPlanner.candidates(s.owner, s.objective, 3000)[0];
  s.act('delegate', s.owner, s.gm.player, { subjectId: w.targetId, requestedAction: w.purpose,
    objectiveId: s.objective.id, workKey: w.key, claimId: w.claimId });
  const t = s.task(); s.e.tasks.respond(t.id, s.gm.player.id, 'hedge');
  s.gm.dayTimer = 1800;
  assert.equal(s.e.tasks.respond(t.id, s.gm.player.id, false), true);
  assert.equal(s.e.tasks.refusedWork(s.owner.id, s.gm.player.id, w, s.objective.id, 1755), true);
  s.restore();
  assert.equal(s.e.tasks.refusedWork(s.owner.id, s.gm.player.id, w, s.objective.id, 1755), true);
  assert.equal(s.e.tasks.refusedWork(s.owner.id, s.gm.player.id, w, s.objective.id, 850), false);
});

for (const purpose of ['reassure', 'repair', 'decoy'])
  check(`${purpose}: unrelated contact is neither performance nor proof of subjective success`, () => {
    const s = assignment(purpose), t = s.task();
    s.act('check_in', s.gm.player, s.M);
    assert.equal(t.executionReceipt, undefined);
    s.act('report', s.gm.player, s.S, { delegationId: t.id, truthMode: 'fabrication' });
    const claim = reportClaim(s), trust = s.gm.getTrust(s.S.id, s.gm.player.id);
    const evidence = evaluateReportEvidence(s.e, s.M.id, claim);
    assert.equal(evidence.assertion, 'assigned_action_attempted');
    assert.equal(s.gm.getTrust(s.S.id, s.gm.player.id), trust, 'evaluation is not an omniscient penalty');
    s.act('verify', s.S, s.M, { claimId: claim.id });
    assert.ok(s.e.events(s.S.id).some(k => k.topic === 'task_report_dispute'));
    assert.equal(s.e.events(s.by('Jeremy').id).some(k => k.topic === 'task_report_dispute'), false);
  });

for (const purpose of ['reassure', 'warn', 'decoy'])
  for (const sameTick of [false, true])
    check(`${purpose}: action after report cannot validate earlier completion (${sameTick ? 'same semantic tick' : 'countdown'})`, () => {
      const s = assignment(purpose), t = s.task();
      s.gm.dayTimer = 2800;
      s.act('report', s.gm.player, s.S, { delegationId: t.id, truthMode: 'fabrication' });
      const report = reportClaim(s);
      if (!sameTick) s.gm.dayTimer = 2600;
      const a = taskAction(s.e, t);
      s.act(a.type, s.gm.player, s.M, a);
      s.restore();
      const replayReport = s.e.knowledge(s.S.id).find(k => k.id === report.id);
      const evidence = evaluateReportEvidence(s.e, s.M.id, replayReport);
      assert.equal(evidence.consistent, undefined);
      assert.equal(evidence.assessment, 'not_recalled');
      assert.equal(replayReport.proposition.reportTime, 2800);
    });

check('countdown interval has documented inclusive bounds and excludes another day', () => {
  const p = { requestDay: 1, requestTime: 720, reportTime: 600 };
  for (const time of [720, 650, 600]) assert.equal(withinReportWindow({ day: 1, campTime: time }, p, {}), true);
  for (const time of [721, 599]) assert.equal(withinReportWindow({ day: 1, campTime: time }, p, {}), false);
  assert.equal(withinReportWindow({ day: 2, campTime: 650 }, p, {}), false);
});
check('ordinary equivalent reassurance completes delivery, not the target belief', () => {
  const s = assignment('reassure'), t = s.task();
  s.act('reassure', s.gm.player, s.M); // No delegation ID, no magic suggestion.
  assert.equal(t.outcome.assignedActionAttempted, true);
  assert.equal(t.outcome.actionType, 'reassure');
  s.act('report', s.gm.player, s.S, { delegationId: t.id });
  assert.equal(evaluateReportEvidence(s.e, s.M.id, reportClaim(s)).consistent, true);
  assert.equal(reportClaim(s).proposition.subjective, true);
  assert.equal(reportClaim(s).proposition.assertions.some(a => a.kind === 'belief'), false);
});
check('a truthful commitment report survives the target changing their mind afterwards', () => {
  const s = assignment('recruit'), t = s.task();
  s.act('promise', s.M, s.gm.player, { subjectId: s.T.id });
  s.act('ask_vote', s.gm.player, s.M, { subjectId: s.T.id });
  s.act('report', s.gm.player, s.S, { delegationId: t.id });
  const report = reportClaim(s);
  s.gm.dayTimer -= 100;
  s.act('withdraw', s.M, s.gm.player, { subjectId: s.T.id });
  assert.equal(evaluateReportEvidence(s.e, s.M.id, report).consistent, true);
});
check('missing evidence carries no automatic consequence; clipped history gives uncertain recollection', () => {
  const s = assignment('warn'), t = s.task();
  s.act('report', s.gm.player, s.S, { delegationId: t.id, truthMode: 'fabrication' });
  const before = JSON.stringify(s.gm.systems.trustSystem.serialize());
  const evidence = evaluateReportEvidence(s.e, s.M.id, reportClaim(s));
  assert.equal(evidence.assessment, 'not_recalled');
  assert.equal(JSON.stringify(s.gm.systems.trustSystem.serialize()), before);
});
check('exposure without protection does not justify a split even when arithmetic is viable', () => {
  const s = autonomousSituation('split');
  s.memory.memory[String(s.owner.id)].campClaims = s.memory.memory[String(s.owner.id)].campClaims.filter(k => !k.topic.startsWith('idol'));
  s.claim('exposed-target', s.by('Tony'), s.by('Tony'), 'suspicion', 'nervous');
  s.objective.secrecy = true;
  const work = s.e.objectives.workPlanner.candidates(s.owner, s.objective, 3000);
  assert.ok(work.some(w => ['reassure', 'decoy', 'backup'].includes(w.purpose)));
  assert.equal(work.some(w => w.purpose === 'split'), false);
});
check('weak idol hearsay favors checking; credible protection still requires certified split capacity', () => {
  for (const situation of ['split', 'backup']) {
    const s = autonomousSituation(situation);
    const evidence = s.memory.memory[String(s.owner.id)].campClaims.find(k => k.topic === 'idol_possession');
    evidence.confidence = 0.35; evidence.origin = 'hearsay';
    assert.equal(s.e.objectives.workPlanner.candidates(s.owner, s.objective, 3000).some(w => w.purpose === 'split'), false);
    evidence.confidence = 0.9;
    const work = s.e.objectives.workPlanner.candidates(s.owner, s.objective, 3000);
    assert.equal(work.some(w => w.purpose === 'split'), situation === 'split');
  }
});

check('refusal recovery physically reaches a replacement human, then the voter and a spoken report', () => {
  const s = autonomousSituation('verify_vote'), S = s.owner, J = s.by('Jeremy'), M = s.by('Michele'), player = s.gm.player;
  for (const person of s.activity.members()) if (person.id !== S.id)
    s.gm.systems.trustSystem.setTrust(S.id, person.id, person.id === J.id ? 100 : 15);
  s.gm.systems.trustSystem.ownedTrust[`${J.id}>${S.id}`] = 0;
  for (let i = 0; i < 5; i++) s.memory.recordCampObservation({ id: `physical-j:${i}`,
    actorId: J.id, participantIds: [M.id], witnessIds: [S.id], type: 'seen_together', day: s.gm.day, campTime: s.gm.dayTimer });
  const first = s.e.objectives.plan(S, s.gm.dayTimer);
  assert.equal(first.targetId, J.id);
  assert.equal(first.agenda.requestedAction, 'verify_vote');
  s.activity.interrupt(S, 'owned-uncertainty'); s.activity.chooseNext(S, s.gm.dayTimer);
  assert.equal(S.campActivity.type, 'travel');
  for (let i = 0; i < 12 && !Object.values(s.e.tasks.records).some(t => t.requesterId === S.id && t.delegateId === J.id); i++) s.wait(45);
  const rejected = Object.values(s.e.tasks.records).find(t => t.requesterId === S.id && t.delegateId === J.id);
  assert.equal(rejected?.publicStatus, 'refused');
  assert.ok(s.e.objectives.workPlanner.candidates(S, s.objective, s.gm.dayTimer).some(w => w.purpose === 'verify_vote'));
  s.gm.systems.trustSystem.setTrust(S.id, player.id, 100);
  for (let i = 0; i < 5; i++) s.memory.recordCampObservation({ id: `physical-human:${i}`,
    actorId: player.id, participantIds: [M.id], witnessIds: [S.id], type: 'seen_together', day: s.gm.day, campTime: s.gm.dayTimer });
  s.activity.interrupt(M, 'controlled-open-opportunity');
  s.activity.start(M, { type: 'idle_at_camp', location: s.e.place(M.id), duration: 3000 });
  const replacement = s.e.objectives.plan(S, s.gm.dayTimer);
  assert.equal(replacement?.agenda.requestedAction, 'verify_vote', JSON.stringify(replacement));
  assert.equal(replacement.targetId, player.id);
  s.strategy.scramble.clearInvitation();
  s.activity.interrupt(S, 'replacement-opportunity'); s.activity.chooseNext(S, s.gm.dayTimer);
  for (let i = 0; i < 14 && !s.strategy.scramble.invitation; i++) s.wait(45);
  const invitation = s.strategy.scramble.invitation;
  assert.equal(invitation?.npcId, S.id);
  assert.equal(invitation.agenda.purpose, 'objective_delegate', JSON.stringify(invitation));
  assert.ok(s.e.together(S.id, player.id));
  assert.equal(Object.values(s.e.tasks.records).some(t => t.requesterId === S.id && t.delegateId === player.id), false);
  s.strategy.scramble.clearInvitation();
  s.activity.beginConversation(S, { strategy: true, location: player.location });
  s.conversation._renderMenu = (npc, text, buttons) => s.buttons = buttons;
  s.conversation._clearOverlay = () => {};
  s.conversation.view.startNpc(S, { agenda: invitation.agenda });
  const t = Object.values(s.e.tasks.records).findLast(t => t.requesterId === S.id && t.delegateId === player.id);
  assert.equal(t?.publicStatus, 'pending', JSON.stringify(invitation));
  s.buttons.find(b => b.label === 'Agree to the request').onClick();
  assert.equal(t.publicStatus, 'accepted');
  s.activity.finishConversation();
  s.activity.start(M, { type: 'idle_at_camp', location: 'waterWell', duration: 3000 });
  s.move('waterWell');
  assert.ok(s.e.together(player.id, M.id));
  s.act('vote_read', player, M); assert.ok(t.executionReceipt);
  if (!s.e.together(S.id, player.id)) { s.travel(S, player.location); s.wait(45); }
  s.act('report', player, S, { delegationId: t.id });
  s.e.objectives.evaluate(S.id, s.gm.dayTimer);
  assert.ok(s.objective.processedReports.some(id => id.startsWith(t.reports[0].id)));
  assert.equal(Object.values(s.e.tasks.records).filter(t => t.delegateId === J.id && t.requesterId === S.id).length, 1);
});
check('a target may falsely confirm an unperformed task; only that spoken claim reaches the requester', () => {
  const s = assignment('reassure'), t = s.task();
  s.act('check_in', s.gm.player, s.M);
  s.act('report', s.gm.player, s.S, { delegationId: t.id, truthMode: 'fabrication' });
  const report = reportClaim(s);
  s.M.gameplayStyle = 'Lethal Charmer'; s.M.honesty = 1; s.M.deception = 10;
  const before = s.strategy.getNpcTargetIntent(s.M.id)?.targetId;
  const response = s.e.tasks.verifyReport(s.e.action('verify', { speakerId: s.S.id, listenerIds: [s.M.id], claimId: report.id }),
    s.M.id, report, () => 0);
  assert.equal(response.stance, 'confirmed');
  s.e.tasks.learnReportEvidence(s.S.id);
  assert.equal(t.disputedBy?.includes(String(s.S.id)) || false, false);
  assert.equal(s.strategy.getNpcTargetIntent(s.M.id)?.targetId, before);
  assert.equal(s.e.knowledge(s.S.id).findLast(k => k.topic === 'task_report_confirmation').truthfulness, undefined);
});
check('an honest unfinished report does not deny partial or unrelated contact', () => {
  const s = assignment('reassure'), t = s.task();
  s.act('check_in', s.gm.player, s.M);
  s.act('report', s.gm.player, s.S, { delegationId: t.id, reportStance: 'not_done' });
  assert.deepEqual(reportClaim(s).proposition.assertions, []);
  s.act('verify', s.S, s.M, { claimId: reportClaim(s).id });
  assert.equal(t.disputedBy, undefined);
});
check('canonical constructor restore preserves same-tick semantic chronology and phase isolation', () => {
  const s = assignment('warn'), restored = new s.e.constructor(s.gm, s.e.serialize());
  assert.equal(restored.exchangeSequence, s.e.exchangeSequence);
  const p = { requestDay: 1, requestPhase: 'postChallenge', requestTime: 720, reportTime: 600 };
  assert.equal(withinReportWindow({ day: 1, phase: 'preChallenge', campTime: 650 }, p, {}), false);
});
check('attributed vote verification does not mistake a post-report change of mind for an old lie', () => {
  const s = assignment('recruit'), t = s.task();
  s.act('promise', s.M, s.gm.player, { subjectId: s.T.id });
  s.act('ask_vote', s.gm.player, s.M, { subjectId: s.T.id });
  s.act('report', s.gm.player, s.S, { delegationId: t.id });
  const attributed = s.e.knowledge(s.S.id).findLast(k => k.delegationId === t.id && k.topic === 'commitment');
  s.gm.dayTimer -= 100;
  s.act('withdraw', s.M, s.gm.player, { subjectId: s.T.id });
  const response = s.act('verify', s.S, s.M, { claimId: attributed.id });
  assert.match(response.responses[0].line, /what I told/);
  assert.equal(t.disputedBy, undefined);
});
