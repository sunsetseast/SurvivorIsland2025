import test from "node:test";
import assert from "node:assert/strict";
import { autonomousSituation } from "../qa/AutonomousDelegationHarness.mjs";
import { quiet } from "../qa/LivingCampSimulationHarness.mjs";
import { TASK_PURPOSES } from "../src/modules/systems/ConversationActionCatalog.js";
import { makeConversationStrategyQa } from "../qa/ConversationStrategyHarness.mjs";
test("pre-immunity delegated social work physically arrives, reserves the conversation and awaits explicit response", () =>
  quiet(() => {
    const s = autonomousSituation("check_loyalty"),
      S = s.owner,
      M = s.by("Michele"),
      player = s.gm.player;
    s.move("waterWell");
    s.gm.gamePhase = "preChallenge";
    s.strategy.isActive = false;
    s.activity.phaseId = s.activity.phase;
    s.e.objectives.deserialize();
    S.gameplayStyle = "Shadow Strategist";
    s.gm.systems.trustSystem.setTrust(S.id, player.id, 100);
    for (let i = 0; i < 5; i++)
      s.memory.recordCampObservation({
        id: `pre-connector:${i}`,
        actorId: player.id,
        participantIds: [M.id],
        witnessIds: [S.id],
        type: "seen_together",
        day: s.gm.day,
        campTime: s.gm.dayTimer,
      });
    s.conversation._renderMenu = (npc, body, buttons) => (s.buttons = buttons);
    s.conversation._clearOverlay = () => {};
    s.conversation._showNpcApproachOverlay = (npc, place, accept) =>
      (s.acceptApproach = accept);
    const plan = s.e.objectives.plan(S, s.gm.dayTimer);
    assert.equal(plan.type, "approach_player");
    assert.equal(plan.agenda.requestedAction, "check_loyalty");
    s.activity.interrupt(S, "new-social-need");
    s.activity.chooseNext(S, s.gm.dayTimer);
    assert.equal(S.campActivity.type, "travel");
    for (let i = 0; i < 12 && !s.acceptApproach; i++) s.wait(45);
    assert.ok(s.e.together(S.id, player.id));
    assert.ok(s.acceptApproach);
    assert.equal(Object.keys(s.e.tasks.records).length, 0);
    assert.equal(s.activity.conversation.npcId, S.id);
    s.acceptApproach();
    assert.equal(s.task().publicStatus, "pending");
    assert.ok(s.buttons.some((b) => b.label === "Agree to the request"));
  }));

for (const [purpose] of TASK_PURPOSES)
  test(`natural ${purpose}: owned situation → selected work → existing conversation execution`, () =>
    quiet(() => {
      const s = autonomousSituation(purpose),
        e = s.e,
        o = s.objective;
      assert.equal(o.work, null);
      const plan = e.objectives.plan(s.owner, s.gm.dayTimer);
      assert.ok(plan?.agenda, `No work for ${purpose}`);
      assert.equal(
        plan.agenda.requestedAction,
        purpose,
        JSON.stringify(plan.agenda.work),
      );
      assert.ok(plan.agenda.work.reason);
      assert.equal(
        plan.agenda.work.value,
        undefined,
        "derived ranking scores are not saved in the selected job",
      );
      assert.equal(
        o.work,
        null,
        "fixture and planner do not inject compatibility work",
      );
      const listener = e.person(plan.targetId);
      if (!e.together(s.owner.id, listener.id)) {
        s.travel(s.owner, e.place(listener.id));
        for (let i = 0; i < 8 && !e.together(s.owner.id, listener.id); i++)
          s.wait(45);
        assert.ok(
          e.together(s.owner.id, listener.id),
          "physical opportunity before execution",
        );
      }
      const result = e.objectives.execute(s.owner, listener, {
        ...plan,
        id: `natural-${purpose}`,
      });
      assert.ok(result && !result.invalid, JSON.stringify(result));
      assert.ok(o.selectedWork?.purpose === purpose);
      if (plan.agenda.purpose === "objective_delegate")
        assert.equal(s.task().purpose, purpose);
      else assert.notEqual(result.type, "delegate");
      assert.equal(
        e.resolve(
          e.action("check_in", {
            actionId: `other-${purpose}`,
            speakerId: s.owner.id,
            listenerIds: [listener.id],
          }),
        ).invalid,
        undefined,
      );
    }));

test("ordinary mature objective naturally asks a human to verify, with physical approach and spoken report", () =>
  quiet(() => {
    const s = makeConversationStrategyQa(),
      e = s.e,
      S = s.by("Sandra"),
      J = s.by("Jeremy"),
      M = s.by("Michele"),
      T = s.by("Tony"),
      player = s.gm.player;
    s.act("promise", player, S, { subjectId: T.id });
    s.act("promise", J, S, { subjectId: T.id });
    s.memory.recordCampClaim({
      id: "only-secondhand",
      speakerId: J.id,
      subjectId: T.id,
      topic: "commitment",
      stance: "yes",
      attributedId: M.id,
      sourceChain: [M.id, J.id],
      origin: "hearsay",
      listenerIds: [S.id],
      confidenceByListener: { [S.id]: 0.8 },
      day: s.gm.day,
      campTime: s.gm.dayTimer,
    });
    s.gm.systems.trustSystem.setTrust(S.id, player.id, 100);
    for (let i = 0; i < 5; i++)
      s.memory.recordCampObservation({
        id: `seen-connector:${i}`,
        actorId: player.id,
        participantIds: [M.id],
        witnessIds: [S.id],
        type: "seen_together",
        day: s.gm.day,
        campTime: s.gm.dayTimer,
        location: "beach",
      });
    s.move("waterWell");
    s.wait(210);
    s.strategy.updateNpcIntentTarget(S.id, T.id, {
      absoluteConfidence: 0.85,
      intentStatus: "committed",
    });
    e.objectives.deserialize();
    const plan = e.objectives.plan(S, s.gm.dayTimer),
      objective = e.objectives.objective(S.id);
    assert.equal(objective.explicit, false);
    assert.equal(objective.work, null);
    assert.equal(plan?.type, "approach_player");
    assert.equal(plan.agenda.requestedAction, "verify_vote");
    assert.equal(Object.keys(e.tasks.records).length, 0);
    s.activity.interrupt(S, "new-information");
    s.activity.chooseNext(S, s.gm.dayTimer);
    assert.equal(S.campActivity.type, "travel");
    for (let i = 0; i < 12 && !s.strategy.scramble.invitation; i++) s.wait(45);
    const invitation = s.strategy.scramble.invitation;
    assert.equal(invitation.npcId, S.id);
    assert.ok(e.together(S.id, player.id));
    assert.equal(Object.keys(e.tasks.records).length, 0);
    s.strategy.scramble.clearInvitation();
    s.activity.beginConversation(S, {
      strategy: true,
      location: player.location,
    });
    s.conversation._renderMenu = (npc, body, buttons) => (s.buttons = buttons);
    s.conversation._clearOverlay = () => {};
    s.conversation.view.startNpc(S, { agenda: invitation.agenda });
    const task = s.task();
    assert.equal(task.publicStatus, "pending");
    assert.ok(s.buttons.some((b) => b.label === "Agree to the request"));
    s.buttons.find((b) => b.label === "Agree to the request").onClick();
    assert.equal(e.tasks.playerRequests(player.id)[0].active, true);
    s.activity.finishConversation();
    s.travel(M, player.location);
    s.wait(45);
    s.act("vote_read", player, M);
    assert.ok(task.executionReceipt);
    if (!e.together(player.id, S.id)) {
      s.travel(S, player.location);
      s.wait(45);
    }
    const result = s.act("report", player, S, { delegationId: task.id });
    assert.equal(result.invalid, undefined);
    e.objectives.evaluate(S.id, s.gm.dayTimer);
    assert.ok(objective.processedReports.length);
    assert.ok(
      e
        .knowledge(S.id)
        .some((k) => k.topic === "task_report" && k.delegationId === task.id),
    );
  }));

test("self, NPC intermediary and human intermediary are weighted without a human bonus", () =>
  quiet(() => {
    const self = autonomousSituation("verify_vote");
    for (const other of self.activity.members())
      if (other.id !== self.owner.id)
        self.gm.systems.trustSystem.setTrust(self.owner.id, other.id, 35);
    assert.equal(
      self.e.objectives.plan(self.owner, self.gm.dayTimer).agenda.purpose,
      "objective_recruit",
    );
    const npc = autonomousSituation("verify_vote"),
      J = npc.by("Jeremy");
    npc.gm.systems.trustSystem.setTrust(npc.owner.id, J.id, 100);
    for (let i = 0; i < 4; i++)
      npc.memory.recordCampObservation({
        id: `npc-connector:${i}`,
        actorId: J.id,
        participantIds: [npc.by("Michele").id],
        witnessIds: [npc.owner.id],
        type: "seen_together",
        day: npc.gm.day,
        campTime: npc.gm.dayTimer,
      });
    const chosen = npc.e.objectives.plan(npc.owner, npc.gm.dayTimer);
    assert.equal(chosen.agenda.purpose, "objective_delegate");
    assert.equal(chosen.targetId, J.id);
  }));

test("stable personally confirmed plans quiet down instead of filling task queues", () =>
  quiet(() => {
    const s = autonomousSituation("gather");
    for (const person of s.activity
      .members()
      .filter((p) => ![s.owner.id, s.by("Tony").id].includes(p.id)))
      s.claim(`firm:${person.id}`, person, s.by("Tony"), "commitment");
    s.e.objectives.evaluate(s.owner.id, s.gm.dayTimer);
    assert.ok(s.objective.confidence >= 0.8);
    assert.equal(
      s.e.objectives.workPlanner.candidates(s.owner, s.objective, s.gm.dayTimer)
        .length,
      0,
    );
    assert.equal(s.e.objectives.plan(s.owner, s.gm.dayTimer), null);
  }));

test("two known pending requests suppress more delegation; urgent work can remain personal", () =>
  quiet(() => {
    const s = autonomousSituation("warn"),
      S = s.owner;
    for (const delegate of [s.gm.player, s.by("Michele")]) {
      s.travel(delegate, "beach");
      s.wait(45);
      s.act("delegate", S, delegate, {
        subjectId: s.by("Parvati").id,
        requestedAction: "gather",
      });
    }
    const plans = s.e.objectives.workPlanner.candidates(
      S,
      s.objective,
      s.gm.dayTimer,
    );
    assert.ok(plans.length);
    assert.ok(plans.every((w) => w.preferSelf));
    assert.notEqual(
      s.e.objectives.plan(S, s.gm.dayTimer)?.agenda?.purpose,
      "objective_delegate",
    );
  }));

test("pre-immunity social work reaches the real semantic executor and avoids imminent vote coordination", () =>
  quiet(() => {
    const s = autonomousSituation("check_loyalty"),
      S = s.owner;
    s.gm.gamePhase = "preChallenge";
    s.strategy.isActive = false;
    s.activity.phaseId = s.activity.phase;
    s.e.objectives.deserialize();
    s.gm.dayTimer = 6000;
    const plan = s.e.objectives.plan(S, s.gm.dayTimer);
    assert.equal(plan.agenda.requestedAction, "check_loyalty");
    const candidates = s.e.objectives.workPlanner.candidates(
      S,
      s.e.objectives.objective(S.id),
      s.gm.dayTimer,
    );
    assert.equal(
      candidates.some((w) =>
        ["recruit", "backup", "split", "decoy"].includes(w.purpose),
      ),
      false,
    );
    s.travel(S, plan.location);
    s.wait(45);
    const activity = s.activity.start(S, plan);
    assert.ok(activity);
    s.activity.complete(S, activity, activity.endsAt);
    assert.ok(
      Object.keys(s.e.receipts).some((id) => id === `${activity.id}:objective`),
    );
  }));

for (const [purpose] of TASK_PURPOSES)
  test(`natural ${purpose} can choose and ask a trusted human connector`, () =>
    quiet(() => {
      const s = autonomousSituation(purpose),
        e = s.e;
      s.gm.dayTimer--;
      s.gm.systems.trustSystem.setTrust(s.owner.id, s.gm.player.id, 100);
      s.act("promise", s.gm.player, s.owner, { subjectId: s.by("Tony").id });
      const pledge = e
        .knowledge(s.owner.id)
        .find(
          (k) => k.speakerId === s.gm.player.id && k.topic === "commitment",
        );
      // The owner has already told the others about this pledge; it is not new work.
      s.memory.recordCampClaim({
        id: "already-shared-player-pledge",
        speakerId: s.owner.id,
        subjectId: s.by("Tony").id,
        attributedId: s.gm.player.id,
        listenerIds: s.activity
          .members()
          .filter((p) => p.id !== s.owner.id && p.id !== s.by("Tony").id)
          .map((p) => p.id),
        topic: "commitment",
        stance: "yes",
        origin: "hearsay",
        evidenceIds: [pledge.id],
        day: s.gm.day,
        campTime: s.gm.dayTimer,
      });
      s.gm.dayTimer -= 181;
      const first = e.objectives.workPlanner.candidates(
        s.owner,
        s.objective,
        s.gm.dayTimer,
      )[0];
      s.gm.systems.trustSystem.setTrust(s.owner.id, s.gm.player.id, 100);
      for (let i = 0; i < 5; i++)
        s.memory.recordCampObservation({
          id: `connector:${i}`,
          actorId: s.gm.player.id,
          participantIds: [first.targetId],
          witnessIds: [s.owner.id],
          type: "seen_together",
          day: s.gm.day,
          campTime: s.gm.dayTimer,
          location: "beach",
        });
      const plan = e.objectives.plan(s.owner, s.gm.dayTimer);
      assert.equal(plan?.agenda?.requestedAction, purpose);
      assert.equal(plan?.type, "approach_player", JSON.stringify(plan));
      assert.equal(Object.keys(e.tasks.records).length, 0);
      const result = e.objectives.execute(s.owner, s.gm.player, {
        ...plan,
        id: `trusted-human-${purpose}`,
      });
      assert.ok(result && !result.invalid);
      assert.equal(s.task().purpose, purpose);
      assert.equal(
        s.task().publicStatus,
        "pending",
        "no invented human acceptance",
      );
      e.tasks.respond(s.task().id, s.gm.player.id, true);
      assert.equal(e.tasks.playerRequests(s.gm.player.id)[0].active, true);
    }));
