import test from "node:test";
import assert from "node:assert/strict";
import { makeConversationStrategyQa } from "../qa/ConversationStrategyHarness.mjs";
import { autonomousSituation } from "../qa/AutonomousDelegationHarness.mjs";
import { quiet } from "../qa/LivingCampSimulationHarness.mjs";
import { suggestedConversationActions } from "../src/modules/systems/ConversationActionCatalog.js";
import { evaluateReportEvidence } from "../src/modules/systems/StrategicTaskReports.js";
import { taskAction } from "../src/modules/systems/StrategicTaskActions.js";
test("future conditional talk and a safe tribe do not generate imminent voting assignments", () =>
  quiet(() => {
    const s = autonomousSituation("gather");
    s.claim(
      "future-condition",
      s.by("Michele"),
      s.by("Tony"),
      "commitment",
      "conditional",
      {
        conditions: [
          {
            kind: "known_commitment",
            voterId: s.by("Jeremy").id,
            targetId: s.by("Tony").id,
          },
        ],
      },
    );
    for (const safe of [false, true]) {
      s.gm.gamePhase = safe ? "postChallenge" : "preChallenge";
      s.strategy.playerTribeSafe = safe;
      const work = s.e.objectives.workPlanner.candidates(
        s.owner,
        s.objective,
        s.gm.dayTimer,
      );
      assert.equal(
        work.some((w) =>
          ["recruit", "verify_vote", "backup", "split", "decoy"].includes(
            w.purpose,
          ),
        ),
        false,
      );
    }
  }));
test("unconvincing bring explanations are not repeated forever and privacy survives NPC fallback", () =>
  quiet(() => {
    const s = bring({ privateReason: true });
    s.gm.systems.trustSystem.setTrust(s.by("Michele").id, s.gm.player.id, 46);
    s.invite();
    s.invite({ explanationMode: "respect_secret" });
    assert.equal(s.task().status, "asking_reason");
    {
      assert.equal(
        s.e.tasks
          .bringOptions(s.task(), s.gm.player.id)
          .some((o) => o.explanationMode === "respect_secret"),
        false,
      );
      assert.equal(
        s.e.tasks.npcBringExplanation(s.task(), s.gm.player.id).explanationMode,
        "vague",
      );
      const receipts = Object.keys(s.e.receipts).length;
      assert.equal(
        s.invite({ explanationMode: "respect_secret" }).invalid,
        "invalid_bring_explanation",
      );
      assert.equal(Object.keys(s.e.receipts).length, receipts);
    }
  }));
test("a truthful rumor-verification report transmits the actual attributed answer and replans from it", () =>
  quiet(() => {
    const s = autonomousSituation("verify_rumor"),
      S = s.owner,
      T = s.by("Tony");
    s.memory.deserialize({});
    s.claim(
      "attributed-idol",
      s.by("Jeremy"),
      T,
      "idol_suspicion",
      "possible",
      {
        attributedId: T.id,
        origin: "hearsay",
        confidenceByListener: { [S.id]: 0.35 },
      },
    );
    s.memory.recordCampClaim({
      id: "target-owned-answer",
      speakerId: T.id,
      subjectId: T.id,
      topic: "idol_suspicion",
      stance: "yes",
      origin: "participant",
      listenerIds: [],
      day: s.gm.day,
      campTime: s.gm.dayTimer,
    });
    const weak = s.e.knowledge(S.id).find((k) => k.topic === "idol_suspicion");
    s.act("delegate", S, s.gm.player, {
      subjectId: T.id,
      requestedAction: "verify_rumor",
      claimId: weak.id,
    });
    const t = s.task();
    s.e.tasks.respond(t.id, s.gm.player.id, true);
    s.act("verify", s.gm.player, T, { claimId: t.claimId });
    assert.ok(t.outcome.claimIds.length);
    assert.equal(
      s.e
        .knowledge(S.id)
        .some(
          (k) =>
            k.delegationId === t.id &&
            k.topic === "idol_suspicion" &&
            k.stance === "yes",
        ),
      false,
    );
    s.act("report", s.gm.player, S, { delegationId: t.id });
    const heard = s.e
      .knowledge(S.id)
      .find(
        (k) =>
          k.delegationId === t.id &&
          k.topic === "idol_suspicion" &&
          k.stance === "yes",
      );
    assert.ok(heard);
    assert.equal(heard.attributedId, T.id);
    assert.equal(heard.provenance, "hearsay");
    const work = s.e.objectives.workPlanner.candidates(
      S,
      s.objective,
      s.gm.dayTimer,
    );
    assert.ok(work.some((w) => w.purpose === "backup"));
    assert.equal(
      work.some((w) => w.purpose === "verify_rumor" && w.targetId === T.id),
      false,
    );
  }));
test("autonomous cover reassurance keeps its delivery meaning through delegation", () =>
  quiet(() => {
    const s = autonomousSituation("reassure"),
      S = s.owner,
      T = s.by("Tony");
    s.gm.systems.trustSystem.setTrust(S.id, s.gm.player.id, 100);
    for (let i = 0; i < 5; i++)
      s.memory.recordCampObservation({
        id: `cover-connector:${i}`,
        actorId: s.gm.player.id,
        participantIds: [T.id],
        witnessIds: [S.id],
        type: "seen_together",
        day: s.gm.day,
        campTime: s.gm.dayTimer,
      });
    const plan = s.e.objectives.plan(S, s.gm.dayTimer);
    assert.equal(plan.agenda.requestedAction, "reassure");
    const spokenRequest = s.e.objectives.execute(S, s.e.person(plan.targetId), {
      ...plan,
      id: "cover-request",
    });
    assert.match(spokenRequest.playerLine, /even if you are not sure/);
    const t = s.task();
    assert.equal(t.deliveryTruthMode, "fabrication");
    s.e.tasks.respond(t.id, s.gm.player.id, true);
    assert.match(
      s.e.tasks.suggestions(s.gm.player.id, [T.id])[0].label,
      /^Bluff:/,
    );
    const a = taskAction(s.e, t);
    assert.equal(a.truthMode, "fabrication");
    s.act(a.type, s.gm.player, T, a);
    assert.ok(
      s.memory
        .getCampClaims(s.gm.player.id)
        .some((k) => k.topic === "safety" && k.truthfulness === false),
    );
    assert.equal(
      s.e
        .knowledge(T.id)
        .find((k) => k.topic === "safety" && k.speakerId === s.gm.player.id)
        .truthfulness,
      undefined,
    );
  }));
test("protected bring reason returns as evidence rather than remotely notifying the requester", () =>
  quiet(() => {
    const s = bring({ privateReason: true }),
      S = s.by("Sandra"),
      M = s.by("Michele");
    s.invite();
    assert.ok(
      s.e.tasks
        .bringOptions(s.task(), s.gm.player.id)
        .some((o) => o.label.includes("keep private")),
    );
    s.invite({ explanationMode: "known" });
    assert.equal(
      s.memory
        .getConversationObligations(s.gm.player.id)
        .find((o) => o.id === `${s.task().id}:secrecy`).status,
      "violated",
    );
    assert.equal(
      s.e.knowledge(S.id).some((k) => k.topic === "alliance_doubt"),
      false,
    );
    const told = s.e
      .knowledge(M.id)
      .find((k) => k.topic === "delegation" && k.proposition?.reasonLine);
    assert.ok(told);
    s.act("share", M, S, { claimId: told.id });
    assert.ok(
      s.e
        .knowledge(S.id)
        .some((k) => k.topic === "alliance_doubt" && k.confidence <= 0.4),
    );
  }));
const check = (label, run) => test(label, () => quiet(run));
function bring({ privateReason = false } = {}) {
  const s = makeConversationStrategyQa(),
    S = s.by("Sandra"),
    M = s.by("Michele");
  s.gm.systems.trustSystem.setTrust(M.id, s.gm.player.id, 55);
  s.gm.systems.trustSystem.setTrust(M.id, S.id, 62);
  s.act("delegate", S, s.gm.player, {
    subjectId: M.id,
    requestedAction: "bring",
    reasonLine: "I want to talk about our numbers.",
    keepSourcePrivate: privateReason,
  });
  s.e.tasks.respond(s.task().id, s.gm.player.id, true);
  s.invite = (fields) =>
    s.act("come_with_me", s.gm.player, M, {
      subjectId: S.id,
      delegationId: s.task().id,
      ...fields,
    });
  return s;
}
check(
  "bring why stays unresolved, gives specific answers, and target reconsiders",
  () => {
    const s = bring(),
      M = s.by("Michele"),
      r = s.invite();
    assert.equal(r.responses[0].stance, "ask_why");
    assert.equal(s.task().status, "asking_reason");
    assert.equal(s.e.tasks.playerRequests(s.gm.player.id)[0].canIgnore, true);
    const options = suggestedConversationActions(s.e, s.gm.player.id, [M.id]);
    assert.equal(options[0].explanationMode, "known");
    assert.ok(
      options.some(
        (x) => x.explanationMode === "bluff" && x.label.startsWith("Bluff:"),
      ),
    );
    const answered = s.invite({ explanationMode: "known" });
    assert.equal(answered.responses[0].stance, "coming");
    assert.equal(s.task().status, "ready_to_walk");
    assert.equal(s.e.model.state(M.id).committedTargetId, null);
  },
);
check(
  "maybe later has cooldown, can be retried after changed circumstances, and is not refusal",
  () => {
    const s = bring(),
      M = s.by("Michele");
    s.gm.systems.trustSystem.setTrust(M.id, s.gm.player.id, 40);
    s.gm.systems.trustSystem.setTrust(M.id, s.by("Sandra").id, 55);
    assert.equal(s.invite().responses[0].stance, "later");
    assert.equal(s.task().status, "maybe_later");
    assert.equal(s.e.tasks.suggestions(s.gm.player.id, [M.id]).length, 0);
    s.gm.dayTimer -= 181;
    s.gm.systems.trustSystem.setTrust(M.id, s.gm.player.id, 95);
    assert.ok(s.e.tasks.suggestions(s.gm.player.id, [M.id]).length);
    assert.equal(s.invite().responses[0].stance, "coming");
  },
);
check(
  "active why negotiation restores without reroll and Back/render cannot speak twice",
  () => {
    const s = bring();
    s.invite();
    const saved = JSON.parse(JSON.stringify(s.e.serialize()));
    const receipts = Object.keys(s.e.receipts).length;
    s.e.deserialize(saved);
    for (let i = 0; i < 3; i++)
      s.e.tasks.suggestions(s.gm.player.id, [s.by("Michele").id]);
    assert.equal(Object.keys(s.e.receipts).length, receipts);
    assert.equal(s.task().status, "asking_reason");
    const a = s.e.action("come_with_me", {
      actionId: "known-reason-once",
      speakerId: s.gm.player.id,
      listenerIds: [s.by("Michele").id],
      subjectId: s.by("Sandra").id,
      delegationId: s.task().id,
      explanationMode: "known",
    });
    const first = s.e.resolve(a),
      snapshot = JSON.stringify(s.e.serialize());
    assert.deepEqual(s.e.resolve(a), { ...first, replay: true });
    assert.equal(JSON.stringify(s.e.serialize()), snapshot);
  },
);
check(
  "NPC delegate can answer why using the same secrecy-aware semantics",
  () => {
    const s = bring({ privateReason: true }),
      t = s.task(),
      J = s.by("Jeremy"),
      M = s.by("Michele");
    // A separate real NPC assignment, not changing the human response.
    s.act("delegate", s.by("Sandra"), J, {
      subjectId: M.id,
      requestedAction: "bring",
      reasonLine: "I want to talk numbers.",
      keepSourcePrivate: true,
    });
    const nt = s.task();
    assert.equal(nt.publicStatus, "accepted");
    s.gm.systems.trustSystem.setTrust(M.id, J.id, 55);
    s.e.tasks.execute(J, M, { id: "npc-first", taskId: nt.id });
    assert.equal(nt.status, "asking_reason");
    assert.equal(
      s.e.tasks.npcBringExplanation(nt, J.id).explanationMode,
      "respect_secret",
    );
    s.e.tasks.execute(J, M, { id: "npc-answer", taskId: nt.id });
    assert.ok(
      s.e
        .knowledge(M.id)
        .some(
          (k) => k.topic === "bring_reason" && k.stance === "respect_secret",
        ),
    );
    assert.notEqual(nt.status, "refused");
    assert.equal(t.publicStatus, "accepted");
  },
);
check(
  "player may bluff a bring reason and listener receives a claim, not hidden falsity",
  () => {
    const s = bring();
    s.invite();
    s.invite({ explanationMode: "bluff", truthMode: "fabrication" });
    const own = s.e
      .knowledge(s.by("Michele").id)
      .find((k) => k.topic === "bring_reason" && k.stance === "bluff");
    assert.ok(own);
    assert.equal(own.truthfulness, undefined);
    assert.ok(
      s.memory
        .getCampClaims(s.gm.player.id)
        .some((k) => k.topic === "bring_reason" && k.truthfulness === false),
    );
  },
);
for (const purpose of [
  "warn",
  "pass_info",
  "protect_source",
  "bring",
  "reassure",
  "repair",
  "decoy",
])
  check(
    `${purpose}: false performed-work report requires an owned target contradiction`,
    () => {
      const s = makeConversationStrategyQa(),
        S = s.by("Sandra"),
        M = s.by("Michele"),
        T = s.by("Tony");
      s.act("delegate", S, s.gm.player, {
        subjectId: M.id,
        requestedAction: purpose,
        planTargetId: T.id,
      });
      const t = s.task();
      s.e.tasks.respond(t.id, s.gm.player.id, true);
      const trust = s.gm.getTrust(S.id, s.gm.player.id),
        reliability = s.e.tasks.reliability(S.id, s.gm.player.id);
      s.act("report", s.gm.player, S, {
        delegationId: t.id,
        truthMode: "fabrication",
      });
      assert.equal(s.gm.getTrust(S.id, s.gm.player.id), trust);
      assert.ok(
        s.e.tasks.reliability(S.id, s.gm.player.id) >= reliability,
        "the requester may believe the positive report; no hidden penalty",
      );
      assert.equal(
        s.e.knowledge(M.id).filter((k) => k.topic === "task_report").length,
        0,
      );
      const claim = s.e
        .knowledge(S.id)
        .find((k) => k.topic === "task_report" && k.delegationId === t.id);
      assert.equal(claim.proposition.kind, "task_result");
      s.act("verify", S, M, { claimId: claim.id });
      assert.ok(
        s.e.knowledge(S.id).some((k) => k.topic === "task_report_dispute"),
      );
      assert.ok(s.e.tasks.reliability(S.id, s.gm.player.id) < reliability);
      assert.ok(s.gm.getTrust(S.id, s.gm.player.id) < trust);
    },
  );
check(
  "subjective reassurance report cannot be refuted merely by different feelings",
  () => {
    const s = makeConversationStrategyQa(),
      S = s.by("Sandra"),
      M = s.by("Michele");
    s.act("delegate", S, s.gm.player, {
      subjectId: M.id,
      requestedAction: "reassure",
    });
    const t = s.task();
    s.e.tasks.respond(t.id, s.gm.player.id, true);
    s.act("reassure", s.gm.player, M);
    s.act("report", s.gm.player, S, { delegationId: t.id });
    const claim = s.e
      .knowledge(S.id)
      .find((k) => k.topic === "task_report" && k.delegationId === t.id);
    assert.equal(claim.proposition.subjective, true);
    s.act("verify", S, M, { claimId: claim.id });
    assert.equal(
      s.e.knowledge(S.id).some((k) => k.topic === "task_report_dispute"),
      false,
    );
  },
);
check(
  "discovered false report provides confrontation and owned confidence, never proof of intent",
  () => {
    const s = makeConversationStrategyQa(),
      S = s.by("Sandra"),
      M = s.by("Michele");
    s.act("delegate", S, s.gm.player, {
      subjectId: M.id,
      requestedAction: "warn",
    });
    const t = s.task();
    s.e.tasks.respond(t.id, s.gm.player.id, true);
    s.act("report", s.gm.player, S, {
      delegationId: t.id,
      truthMode: "fabrication",
    });
    const report = s.e.knowledge(S.id).find((k) => k.topic === "task_report");
    s.act("verify", S, M, { claimId: report.id });
    const incident = s.e
      .events(S.id)
      .find((k) => k.topic === "task_report_dispute");
    assert.equal(incident.proposition.classification, "credible_contradiction");
    assert.equal(incident.proposition.confirmedDeception, undefined);
    assert.ok(
      suggestedConversationActions(s.e, S.id, [s.gm.player.id]).some(
        (k) => k.type === "confront" && k.eventId === incident.id,
      ),
    );
    assert.match(
      s.act("confront", S, s.gm.player, { eventId: incident.id }).playerLine,
      /You told me/,
    );
    const copied = JSON.parse(JSON.stringify(s.e.serialize()));
    s.e.deserialize(copied);
    assert.ok(s.e.events(S.id).some((k) => k.id === incident.id));
  },
);
check(
  "conditional support generates a bounded prerequisite, then group follow-up after actual confirmation",
  () => {
    const s = autonomousSituation("gather"),
      S = s.owner,
      J = s.by("Jeremy"),
      M = s.by("Michele"),
      T = s.by("Tony");
    s.claim("conditional", M, T, "commitment", "conditional", {
      conditions: [{ kind: "known_commitment", voterId: J.id, targetId: T.id }],
    });
    const first = s.e.objectives.plan(S, s.gm.dayTimer);
    assert.equal(first.agenda.requestedAction, "verify_vote");
    assert.equal(first.agenda.delegateTargetId, J.id);
    assert.ok(first.agenda.work.dependencyIds.length);
    s.gm.dayTimer--;
    s.claim("confirmed-prerequisite", J, T, "commitment");
    s.e.objectives.invalidate(S.id);
    const next = s.e.objectives.plan(S, s.gm.dayTimer);
    assert.equal(next.agenda.requestedAction, "bring");
    assert.equal(next.agenda.delegateTargetId, M.id);
  },
);
check(
  "no split from insufficient numbers; hidden danger and private idol facts are not planner inputs",
  () => {
    const s = autonomousSituation("backup");
    s.by("Tony").hasIdol = true;
    let candidates = s.e.objectives.workPlanner.candidates(
      s.owner,
      s.objective,
      s.gm.dayTimer,
    );
    assert.equal(
      candidates.some((w) => w.purpose === "split"),
      false,
    );
    s.memory.deserialize({});
    candidates = s.e.objectives.workPlanner.candidates(
      s.owner,
      s.objective,
      s.gm.dayTimer,
    );
    assert.equal(
      candidates.some((w) =>
        ["backup", "split", "warn", "decoy"].includes(w.purpose),
      ),
      false,
    );
  },
);
check(
  "style weights change work and visibility decisions without random purposes",
  () => {
    const choices = [];
    for (const style of [
      "Social Genius",
      "Power Player",
      "Shadow Strategist",
      "Competitive",
      "Wildcard",
      "Lethal Charmer",
    ]) {
      const s = autonomousSituation("decoy");
      s.owner.gameplayStyle = style;
      s.owner.honesty = 5;
      const candidates = s.e.objectives.workPlanner.candidates(
        s.owner,
        s.objective,
        s.gm.dayTimer,
      );
      choices.push({
        style,
        top: candidates[0].purpose,
        weights: candidates.map((k) => [k.purpose, k.value]),
      });
    }
    assert.ok(new Set(choices.map((k) => k.top)).size >= 2);
    assert.ok(new Set(choices.map((k) => JSON.stringify(k.weights))).size >= 4);
  },
);
check(
  "resolved work is not repeated immediately and candidate fanout is bounded",
  () => {
    const s = autonomousSituation("warn"),
      plan = s.e.objectives.plan(s.owner, s.gm.dayTimer);
    s.travel(s.owner, s.e.place(plan.targetId));
    for (let i = 0; i < 8 && !s.e.together(s.owner.id, plan.targetId); i++)
      s.wait(45);
    s.e.objectives.execute(s.owner, s.e.person(plan.targetId), {
      ...plan,
      id: "bounded-warning",
    });
    const later = s.e.objectives.workPlanner.candidates(
      s.owner,
      s.objective,
      s.gm.dayTimer,
    );
    assert.ok(later.length <= 5);
    assert.equal(
      later.some((w) => w.key === plan.agenda.work.key),
      false,
    );
  },
);
check(
  "production save/load preserves active bring clarification and resolved replies",
  () => {
    const s = bring();
    s.invite();
    const id = s.task().id;
    s.restore();
    assert.equal(s.e.tasks.get(id).status, "asking_reason");
    assert.ok(
      s.e.tasks
        .bringOptions(s.e.tasks.get(id), s.gm.player.id)
        .some((o) => o.explanationMode === "known"),
    );
    const action = s.e.action("come_with_me", {
      speakerId: s.gm.player.id,
      listenerIds: [s.by("Michele").id],
      subjectId: s.by("Sandra").id,
      delegationId: id,
      explanationMode: "known",
    });
    const first = s.e.resolve(action);
    s.restore();
    assert.deepEqual(s.e.resolve(action), { ...first, replay: true });
  },
);
check(
  "bring explanations reject missing tasks, unowned reasons and another delegate",
  () => {
    const s = bring();
    assert.equal(
      s.invite({ delegationId: "missing", explanationMode: "known" }).invalid,
      "invalid_bring_explanation",
    );
    assert.equal(
      s.invite({ explanationMode: "reassure" }).invalid,
      "invalid_bring_explanation",
    );
    const r = s.act("come_with_me", s.by("Jeremy"), s.by("Michele"), {
      subjectId: s.by("Sandra").id,
      delegationId: s.task().id,
      explanationMode: "known",
    });
    assert.equal(r.invalid, "invalid_bring_explanation");
  },
);
check(
  "information reports concern the assigned story, not an unrelated conversation",
  () => {
    const s = makeConversationStrategyQa(),
      S = s.by("Sandra"),
      M = s.by("Michele"),
      T = s.by("Tony");
    s.act("promise", T, S, { subjectId: M.id });
    const claim = s.e
      .knowledge(S.id)
      .find((k) => k.topic === "commitment" && k.speakerId === T.id);
    s.act("delegate", S, s.gm.player, {
      subjectId: M.id,
      requestedAction: "pass_info",
      claimId: claim.id,
    });
    const t = s.task();
    s.e.tasks.respond(t.id, s.gm.player.id, true);
    s.act("check_in", s.gm.player, M);
    s.act("report", s.gm.player, S, {
      delegationId: t.id,
      truthMode: "fabrication",
    });
    const report = s.e.knowledge(S.id).find((k) => k.topic === "task_report");
    assert.equal(
      evaluateReportEvidence(s.e, M.id, report).assertion,
      "information_received",
    );
    s.act("verify", S, M, { claimId: report.id });
    assert.ok(s.e.events(S.id).some((k) => k.topic === "task_report_dispute"));
  },
);
check(
  "protected-source attribution can be disputed only after the recipient actually reports it",
  () => {
    const s = makeConversationStrategyQa(),
      S = s.by("Sandra"),
      M = s.by("Michele"),
      J = s.by("Jeremy"),
      T = s.by("Tony");
    s.act("promise", J, S, { subjectId: T.id });
    const original = s.e
      .knowledge(S.id)
      .find((k) => k.topic === "commitment" && k.speakerId === J.id);
    s.act("delegate", S, s.gm.player, {
      subjectId: M.id,
      requestedAction: "protect_source",
      claimId: original.id,
    });
    const t = s.task();
    s.e.tasks.respond(t.id, s.gm.player.id, true);
    s.act("share", s.gm.player, M, {
      claimId: t.claimId,
      keepSourcePrivate: false,
    });
    s.act("report", s.gm.player, S, {
      delegationId: t.id,
      truthMode: "fabrication",
    });
    assert.equal(
      s.e.events(S.id).some((k) => k.topic === "task_report_dispute"),
      false,
    );
    const report = s.e.knowledge(S.id).find((k) => k.topic === "task_report");
    assert.equal(
      evaluateReportEvidence(s.e, M.id, report).assertion,
      "source_protected",
    );
    s.act("verify", S, M, { claimId: report.id });
    assert.ok(s.e.events(S.id).some((k) => k.topic === "task_report_dispute"));
  },
);
check(
  "a weak secondhand dispute is suspicion and stronger direct evidence can upgrade it",
  () => {
    const s = makeConversationStrategyQa(),
      S = s.by("Sandra"),
      M = s.by("Michele"),
      J = s.by("Jeremy");
    s.act("delegate", S, s.gm.player, {
      subjectId: M.id,
      requestedAction: "warn",
    });
    const t = s.task();
    s.e.tasks.respond(t.id, s.gm.player.id, true);
    s.act("report", s.gm.player, S, {
      delegationId: t.id,
      truthMode: "fabrication",
    });
    const report = s.e.knowledge(S.id).find((k) => k.topic === "task_report");
    s.memory.recordCampClaim({
      id: "weak-denial",
      speakerId: M.id,
      subjectId: M.id,
      listenerIds: [S.id],
      topic: "task_report_confirmation",
      stance: "denied",
      attributedId: J.id,
      sourceChain: [M.id, J.id],
      refutesClaimId: report.id,
      origin: "hearsay",
      confidenceByListener: { [S.id]: 0.35 },
      day: s.gm.day,
      campTime: s.gm.dayTimer,
    });
    const trust = s.gm.getTrust(S.id, s.gm.player.id);
    s.e.tasks.learnReportEvidence(S.id);
    assert.equal(s.gm.getTrust(S.id, s.gm.player.id), trust);
    assert.equal(
      s.e.events(S.id).find((k) => k.topic === "task_report_dispute")
        .proposition.classification,
      "suspicious_inconsistency",
    );
    s.act("verify", S, M, { claimId: report.id });
    assert.ok(
      s.e
        .events(S.id)
        .some(
          (k) =>
            k.topic === "task_report_dispute" &&
            k.proposition.classification === "credible_contradiction",
        ),
    );
  },
);
check(
  "human challenged about a report can admit, deny, explain or apologize with the actual event",
  () => {
    const s = makeConversationStrategyQa(),
      S = s.by("Sandra"),
      M = s.by("Michele");
    s.act("delegate", S, s.gm.player, {
      subjectId: M.id,
      requestedAction: "warn",
    });
    const t = s.task();
    s.e.tasks.respond(t.id, s.gm.player.id, true);
    s.act("report", s.gm.player, S, {
      delegationId: t.id,
      truthMode: "fabrication",
    });
    const report = s.e.knowledge(S.id).find((k) => k.topic === "task_report");
    s.act("verify", S, M, { claimId: report.id });
    const dispute = s.e
      .events(S.id)
      .find((k) => k.topic === "task_report_dispute");
    s.activity.beginConversation(S, { strategy: true, location: "beach" });
    const r = s.act("confront", S, s.gm.player, { eventId: dispute.id });
    assert.ok(r.followUps.includes("admit"));
    s.conversation._renderMenu = (npc, body, buttons) => (s.buttons = buttons);
    s.conversation.view.show(S, {});
    for (const label of [
      "Admit your report was wrong",
      "Stand by your report",
      "Explain a possible misunderstanding",
      "Apologize for the report",
    ])
      assert.ok(
        s.buttons.some((b) => b.label === label),
        label,
      );
    s.buttons.find((b) => b.label === "Admit your report was wrong").onClick();
    assert.ok(
      s.e
        .knowledge(S.id)
        .some((k) => k.topic === "relationship_repair" && k.stance === "admit"),
    );
  },
);
