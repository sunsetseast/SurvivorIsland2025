import test from "node:test";
import assert from "node:assert/strict";
import {
  runBlindside,
  makeConversationStrategyQa,
} from "../qa/ConversationStrategyHarness.mjs";
import { quiet } from "../qa/LivingCampSimulationHarness.mjs";
const check = (name, fn) => test(name, () => quiet(fn));
check(
  "G multi-step blindside delegates real recruitment, travel and conditional report",
  () => {
    const r = runBlindside();
    assert.equal(r.task.publicStatus, "accepted");
    assert.equal(r.task.outcome.stance, "conditional");
    assert.ok(r.events.length >= 3);
  },
);
check(
  "save/load in the middle of delegated travel preserves execution and reports",
  () => {
    const a = runBlindside(),
      b = runBlindside({ reload: true });
    assert.equal(b.saved, true);
    assert.deepEqual(b.events, a.events);
    assert.deepEqual(b.projection, a.projection);
  },
);
check(
  "Michele can refuse and the blindside objective receives failure evidence",
  () => {
    const r = runBlindside({ refuse: true });
    assert.equal(r.task.outcome.stance, "refused");
    assert.equal(r.task.reports[0].reported, "refused");
  },
);
check(
  "Michele can give a false public commitment while protecting her real ally",
  () => {
    const r = runBlindside({ lie: true });
    assert.equal(r.task.outcome.stance, "committed");
    assert.equal(r.task.reports[0].reported, "committed");
  },
);
check("H delegate can agree and fail to perform the assignment", () => {
  const r = runBlindside({ ignore: true });
  assert.equal(r.task.publicStatus, "accepted");
  assert.equal(r.task.status, "ignored");
  assert.equal(r.task.executionReceipt, undefined);
});
check(
  "I requester learns only a false spoken report, not hidden task failure",
  () => {
    const s = makeConversationStrategyQa(),
      sand = s.by("Sandra"),
      j = s.by("Jeremy"),
      m = s.by("Michele"),
      t = s.by("Tony");
    s.act("delegate", sand, j, {
      subjectId: m.id,
      planTargetId: t.id,
      requestedAction: "recruit",
    });
    const task = s.task(),
      before = s.strategy.getNpcTargetIntent(m.id).targetId;
    task.status = "ignored";
    const r = s.act("follow_task", sand, j, {
      delegationId: task.id,
      truthMode: "fabrication",
    });
    assert.match(r.responses[0].line, /said they are voting/);
    assert.equal(s.strategy.getNpcTargetIntent(m.id).targetId, before);
    assert.equal(s.e.tasks.knownTasks(sand.id)[0].report.reported, "committed");
  },
);
check(
  "a delegated blindside can leak through a real approach to the target",
  () => {
    const r = runBlindside({ leak: true });
    assert.equal(r.task.executionMode, "leak");
    assert.ok(r.task.executionReceipt);
  },
);
check("NPC can assign the human player work that the player may refuse", () => {
  const s = makeConversationStrategyQa(),
    sand = s.by("Sandra"),
    m = s.by("Michele");
  s.act("delegate", sand, s.gm.player, {
    subjectId: m.id,
    requestedAction: "verify_vote",
  });
  const task = s.task();
  assert.equal(task.publicStatus, "pending");
  assert.equal(s.e.tasks.respond(task.id, s.gm.player.id, false), true);
  assert.equal(task.status, "refused");
});
check(
  "objective is persistent and adapts only from its owners reported information",
  () => {
    const s = makeConversationStrategyQa(),
      sand = s.by("Sandra"),
      j = s.by("Jeremy"),
      m = s.by("Michele"),
      t = s.by("Tony");
    const o = s.e.objectives.establish(sand.id, {
      type: "blindside",
      targetId: t.id,
      explicit: true,
    });
    s.act("delegate", sand, j, {
      subjectId: m.id,
      planTargetId: t.id,
      requestedAction: "recruit",
      objectiveId: o.id,
    });
    o.taskIds.push(s.task().id);
    s.task().outcome = { stance: "refused" };
    s.task().status = "awaiting_report";
    assert.equal(s.e.objectives.evaluate(sand.id, s.gm.dayTimer).revision, 0);
    s.act("follow_task", sand, j, { delegationId: s.task().id });
    assert.ok(s.e.objectives.evaluate(sand.id, s.gm.dayTimer).revision > 0);
  },
);
