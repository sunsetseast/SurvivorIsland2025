import test from "node:test";
import assert from "node:assert/strict";
import { makeScrambleQa } from "../qa/ScrambleSimulationHarness.mjs";
import { quiet } from "../qa/LivingCampSimulationHarness.mjs";
import { semanticProjection } from "../qa/StrategicDelegationNaturalSimulation.mjs";
import {
  openNegotiation,
  negotiateNpcMeeting,
} from "../src/modules/systems/NpcNegotiation.js";
import { ACTION_DEFINITIONS } from "../src/modules/systems/ConversationActionCatalog.js";
const check = (name, fn) => test(name, () => quiet(fn));
function setup(pre = false) {
  const s = makeScrambleQa({
    seed: 360,
    names: ["Sandra", "Jeremy", "Michele", "Tony", "Parvati"],
  });
  s.idle();
  s.strategy.scramble.meetings = [];
  s.gm.systems.allianceSystem.reset();
  s.memory.deserialize({});
  const e = s.conversation.engine;
  e.tasks.deserialize();
  e.objectives.deserialize();
  const by = (name) => s.activity.npcs().find((p) => p.firstName === name),
    npc = by("Sandra"),
    target = by("Tony"),
    alternate = by("Michele"),
    voter = by("Jeremy");
  if (pre) {
    s.gm.gamePhase = "preChallenge";
    s.strategy.isActive = false;
    s.activity.phaseId = s.activity.phase;
  }
  s.gm.flags.campEventActive = false;
  s.gm.campNeedElapsed.restByTribe = {};
  s.conversation._renderMenu = () => {};
  s.conversation.view.show = () => {};
  return {
    ...s,
    e,
    i: e.initiative,
    npc,
    target,
    alternate,
    voter,
    by,
    p: s.gm.player,
  };
}
function opening(s, type = "ask_vote") {
  assert.ok(
    s.activity.beginConversation(s.npc, { location: "beach", strategy: true }),
  );
  const r = s.e.resolve(
    s.e.action(type, {
      speakerId: s.npc.id,
      listenerIds: [s.p.id],
      subjectId: s.target.id,
    }),
  );
  s.i.dialogueOpening(s.npc, r);
  return s.activity.conversation.checkpoint.npcNegotiation;
}
function speak(s, type, fields = {}) {
  const a = s.e.action(type, {
    speakerId: s.p.id,
    listenerIds: [s.npc.id],
    subjectId: s.activity.conversation.checkpoint.npcNegotiation.subjectId,
    ...fields,
  });
  const result = s.e.resolve(a);
  assert.ok(!result.invalid, JSON.stringify(result));
  return { a, result, follow: s.i.afterPlayerAction(s.npc, a, result) };
}
function counter(s) {
  s.npc.gameplayStyle = "Wildcard";
  s.strategy.updateNpcIntentTarget(s.npc.id, s.target.id, {
    reason: "controlled original plan",
    absoluteConfidence: 0.6,
  });
  for (const p of s.activity.npcs())
    s.gm.systems.trustSystem.setTrust(
      s.npc.id,
      p.id,
      p.id === s.alternate.id ? 0 : 100,
    );
  return speak(s, "reply", { stance: "refused" }).follow;
}
check(
  "rejected Tony stays in history; Michele becomes a genuine pending counteroffer",
  () => {
    const s = setup(),
      n = opening(s),
      vote = s.p.voteTarget;
    const f = counter(s);
    assert.equal(f.subjectId, s.alternate.id);
    assert.equal(n.subjectId, s.alternate.id);
    assert.equal(n.originalSubjectId, s.target.id);
    assert.equal(n.status, "awaiting_response");
    assert.equal(n.proposals[0].status, "rejected");
    assert.equal(n.proposals[1].status, "pending");
    assert.ok(
      s.i.dialogueChoices(s.npc).some((c) => c.label === "Why Michele?"),
    );
    speak(s, "why");
    assert.equal(n.status, "awaiting_response");
    const conditions = [
      {
        kind: "known_commitment",
        voterId: s.voter.id,
        targetId: s.alternate.id,
      },
    ];
    speak(s, "conditional", { conditions });
    assert.equal(n.status, "condition_pending");
    assert.deepEqual(n.conditions, conditions);
    assert.equal(
      s.memory
        .getConversationObligations(s.p.id)
        .filter((o) => o.kind === "promise").length,
      1,
    );
    assert.equal(s.p.voteTarget, vote);
    s.restore();
    assert.equal(
      s.activity.conversation.checkpoint.npcNegotiation.subjectId,
      s.alternate.id,
    );
  },
);
for (const response of ["promise", "reply", "cover_promise"])
  check(`alternate ${response} applies only to the active subject`, () => {
    const s = setup(),
      n = opening(s);
    counter(s);
    speak(s, response, response === "reply" ? { stance: "refused" } : {});
    assert.equal(n.status, "settled");
    assert.equal(n.proposals[0].status, "rejected");
    assert.equal(
      n.proposals[1].status,
      response === "reply" ? "rejected" : "accepted",
    );
    if (response === "cover_promise")
      assert.equal(s.strategy.reasoning.state(s.p.id).committedTargetId, null);
  });
check(
  "no second alternate is endlessly offered after both targets are rejected",
  () => {
    const s = setup(),
      n = opening(s);
    counter(s);
    const f = speak(s, "reply", { stance: "refused" }).follow;
    assert.equal(f, null);
    assert.equal(n.counteroffers, 1);
    assert.equal(s.i.dialogueChoices(s.npc).length, 0);
  },
);
check("unrelated promise never settles the NPC proposal", () => {
  const s = setup(),
    n = opening(s);
  speak(s, "promise", { subjectId: s.alternate.id });
  assert.equal(n.status, "awaiting_response");
  assert.equal(n.subjectId, s.target.id);
});
check(
  "hesitation is not agreement and no promise or player ballot is manufactured",
  () => {
    const s = setup(),
      n = opening(s),
      before = s.p.voteTarget;
    speak(s, "reply", { stance: "consider" });
    assert.equal(n.status, "awaiting_response");
    assert.equal(s.memory.getConversationObligations(s.p.id).length, 0);
    assert.equal(s.p.voteTarget, before);
  },
);
check(
  "ordinary player counterproposal receives the NPC independent evaluation",
  () => {
    const s = setup(),
      n = opening(s);
    const before = n.responses.length;
    const r = speak(s, "pitch", { subjectId: s.alternate.id });
    assert.equal(n.responses.length, before + 1);
    const reaction = r.result.responses.find((r) => r.speakerId === s.npc.id);
    assert.ok(reaction);
    assert.ok(["awaiting_response", "unresolved"].includes(n.status));
    if (n.status === "awaiting_response")
      assert.equal(n.subjectId, s.alternate.id);
  },
);
check(
  "withholding works through actual View without subject picker or commitment",
  () => {
    const s = setup(),
      n = opening(s, "vote_read"),
      before = s.e.ownTarget(s.p.id);
    let selections = 0;
    s.conversation.view.render = () => selections++;
    s.conversation.view.choose(s.npc, {}, ACTION_DEFINITIONS.reply, {
      stance: "withheld",
      subjectId: null,
      line: "I’m keeping my plans to myself.",
    });
    assert.equal(selections, 0);
    assert.equal(n.outcome, "withheld");
    const claim = s.e
      .knowledge(s.npc.id)
      .find((k) => k.topic === "information" && k.stance === "withheld");
    assert.ok(claim);
    assert.equal(claim.commitmentStatus, null);
    assert.equal(s.e.ownTarget(s.p.id), before);
  },
);
for (const kind of ["why", "source", "evidence", "numbers"])
  check(`${kind} answers use owned knowledge and keep negotiation live`, () => {
    const s = setup(),
      n = opening(s);
    const r = speak(s, kind);
    assert.ok(r.result.responses[0].line);
    assert.ok(!r.result.responses[0].line.includes("undefined"));
    assert.equal(n.status, "awaiting_response");
  });
check(
  "owned evidence is transmitted with provenance, not as omniscient proof",
  () => {
    const s = setup();
    s.memory.recordCampClaim({
      id: "own-evidence",
      speakerId: s.voter.id,
      listenerIds: [s.npc.id],
      subjectId: s.target.id,
      topic: "target",
      stance: "possible",
      day: s.gm.day,
      campTime: s.gm.dayTimer,
    });
    opening(s);
    const r = speak(s, "evidence");
    assert.match(r.result.responses[0].line, /Jeremy/);
    const passed = s.e
      .knowledge(s.p.id)
      .find((k) => k.evidenceIds.includes("own-evidence"));
    assert.ok(passed);
    assert.equal(passed.provenance, "hearsay");
  },
);
check("protected source remains private in evidence answer", () => {
  const s = setup();
  s.memory.recordCampClaim({
    id: "protected",
    speakerId: s.voter.id,
    listenerIds: [s.npc.id],
    subjectId: s.target.id,
    topic: "target",
    stance: "possible",
    day: s.gm.day,
    campTime: s.gm.dayTimer,
  });
  s.memory.recordConversationObligation(
    {
      id: "secrecy",
      speakerId: s.npc.id,
      kind: "secrecy",
      status: "accepted",
      claimId: "protected",
    },
    [s.npc.id],
  );
  opening(s);
  const r = speak(s, "evidence");
  assert.match(r.result.responses[0].line, /private/);
  assert.ok(
    !s.e.knowledge(s.p.id).some((k) => k.evidenceIds.includes("protected")),
  );
});
check(
  "no evidence answer admits uncertainty rather than fabricating a source",
  () => {
    const s = setup();
    opening(s);
    const r = speak(s, "evidence");
    assert.match(r.result.responses[0].line, /solid source/);
  },
);
check(
  "replayed player action and repeated rendering duplicate no offers, promises or trust",
  () => {
    const s = setup(),
      n = opening(s);
    const r = counter(s),
      count = Object.keys(s.e.receipts).length;
    const a = s.e.action("why", {
      speakerId: s.p.id,
      listenerIds: [s.npc.id],
      subjectId: n.subjectId,
    });
    const result = s.e.resolve(a);
    s.i.afterPlayerAction(s.npc, a, result);
    const after = Object.keys(s.e.receipts).length;
    s.i.afterPlayerAction(s.npc, a, s.e.resolve(a));
    for (let k = 0; k < 20; k++) s.i.dialogueChoices(s.npc);
    assert.equal(Object.keys(s.e.receipts).length, after);
    assert.ok(after > count);
    assert.ok(r);
  },
);
check(
  "failed private route preserves invitation and original reservation",
  () => {
    const s = setup();
    s.i.create(s.npc, s.p.id, {
      type: "check_in",
      key: "private-failure",
      private: true,
    });
    s.activity.interrupt(s.npc);
    s.activity.chooseNext(s.npc, s.gm.dayTimer);
    s.wait(45);
    const invitation = s.i.invitation,
      activity = s.npc.campActivity;
    s.gm.dayTimer = 100;
    assert.equal(s.i.respond("private"), false);
    assert.equal(s.i.invitation, invitation);
    assert.equal(s.npc.campActivity, activity);
    assert.match(invitation.reply, /talk here/);
    assert.equal(s.i.respond("accept"), true);
  },
);
check(
  "failed private movement rolls back exactly without stranding companion",
  () => {
    const s = setup();
    s.i.create(s.npc, s.p.id, {
      type: "check_in",
      key: "private-rollback",
      private: true,
    });
    s.activity.interrupt(s.npc);
    s.activity.chooseNext(s.npc, s.gm.dayTimer);
    s.wait(45);
    const invitation = s.i.invitation,
      activity = s.npc.campActivity;
    s.activity.moveTogether = () => false;
    assert.equal(s.i.respond("private"), false);
    assert.equal(s.i.invitation, invitation);
    assert.equal(s.npc.campActivity, activity);
    assert.equal(s.p.campActivity, null);
  },
);
check(
  "NPC to NPC conditional commitment preserves required voter and task dependency",
  () => {
    const s = setup();
    s.activity.interrupt(s.voter);
    s.activity.start(s.voter, {
      type: "idle_at_camp",
      location: "beach",
      duration: 3000,
    });
    s.gm.systems.trustSystem.setTrust(s.voter.id, s.npc.id, 100);
    s.gm.systems.relationshipSystem.setRelationship(s.voter.id, s.npc.id, 100);
    s.strategy.updateNpcIntentTarget(s.voter.id, s.target.id, {
      reason: "controlled willing listener",
      absoluteConfidence: 0.6,
    });
    const r = s.e.resolve(
      s.e.action("negotiate", {
        speakerId: s.npc.id,
        listenerIds: [s.voter.id],
        subjectId: s.target.id,
      }),
    );
    assert.equal(r.responses[0].stance, "conditional");
    assert.ok(r.responses[0].conditions.length);
    const n = negotiateNpcMeeting(s.e, s.npc, s.voter, r, {
      activityId: "real-co-present-meeting",
    });
    assert.equal(n.status, "condition_pending");
    assert.deepEqual(n.conditions, r.responses[0].conditions);
    assert.notEqual(s.e.model.state(s.voter.id).committedTargetId, s.target.id);
  },
);
check(
  "NPC to NPC refusal remains independent and may negotiate a bounded alternate",
  () => {
    const s = setup();
    s.npc.gameplayStyle = "Wildcard";
    s.gm.systems.trustSystem.setTrust(s.voter.id, s.npc.id, 0);
    const r = s.e.resolve(
      s.e.action("ask_vote", {
        speakerId: s.npc.id,
        listenerIds: [s.voter.id],
        subjectId: s.target.id,
      }),
    );
    const n = negotiateNpcMeeting(s.e, s.npc, s.voter, r, {
      activityId: "independent-negotiation",
    });
    assert.ok(n);
    assert.ok(n.round <= 5);
    assert.ok(n.counteroffers <= 1);
    assert.ok(n.proposals.length <= 2);
  },
);
check(
  "nearby work gives lawful conversation opportunity; protected activities do not",
  () => {
    const s = setup();
    s.activity.interrupt(s.voter);
    s.activity.start(s.voter, {
      type: "gather_food",
      location: "beach",
      duration: 420,
    });
    assert.equal(s.i.canListen(s.voter, s.npc.id), true);
    s.voter.campActivity.interruptible = false;
    assert.equal(s.i.canListen(s.voter, s.npc.id), false);
  },
);
check(
  "important nearby wait retains intention until actual listener availability",
  () => {
    const s = setup();
    s.voter.campActivity = {
      id: "protected",
      type: "social_conversation",
      location: "beach",
      endsAt: s.gm.dayTimer - 90,
      interruptible: false,
    };
    const i = s.i.create(s.npc, s.voter.id, {
      type: "ask_vote",
      fields: { subjectId: s.target.id },
      key: "useful",
      urgent: true,
    });
    i.attempts = 1;
    const plan = s.i.starting(s.npc, {
      type: "strategy_conversation",
      location: "beach",
      initiativeId: i.id,
    });
    assert.equal(plan.type, "initiative_wait");
    assert.equal(plan.duration, 90);
    assert.equal(i.status, "waiting");
    assert.equal(i.attempts, 0);
  },
);
for (const pre of [true, false])
  check(
    `${pre ? "pre" : "post"} proposal keeps phase-appropriate promise copy`,
    () => {
      const s = setup(pre);
      opening(s);
      const c = s.i.dialogueChoices(s.npc).find((c) => c.type === "promise");
      assert.equal(c.label.startsWith("If we lose"), pre);
    },
  );
// Every boundary uses the production JSON save/restore contract, not a helper clone.
for (const boundary of [
  "opening",
  "why",
  "evidence",
  "numbers",
  "refusal",
  "alternate",
  "alternate_why",
  "conditional",
  "agreement",
  "withheld",
  "unresolved",
])
  check(
    `production JSON preserves ${boundary} negotiation and continuation`,
    () => {
      const s = setup();
      opening(s, boundary === "withheld" ? "vote_read" : "ask_vote");
      if (["why", "evidence", "numbers"].includes(boundary)) speak(s, boundary);
      if (
        [
          "refusal",
          "alternate",
          "alternate_why",
          "conditional",
          "agreement",
        ].includes(boundary)
      )
        counter(s);
      if (boundary === "alternate_why") speak(s, "why");
      if (boundary === "conditional")
        speak(s, "conditional", {
          conditions: [
            {
              kind: "known_commitment",
              voterId: s.voter.id,
              targetId: s.alternate.id,
            },
          ],
        });
      if (boundary === "agreement") speak(s, "cover_promise");
      if (boundary === "withheld")
        speak(s, "reply", { subjectId: null, stance: "withheld" });
      if (boundary === "unresolved")
        for (let k = 0; k < 3; k++) speak(s, "why");
      const before = semanticProjection(s.gm.createSavePayload());
      s.restore();
      assert.deepEqual(semanticProjection(s.gm.createSavePayload()), before);
    },
  );
check(
  "a warning to human transfers owned danger before awaiting their response",
  () => {
    const s = setup();
    s.memory.recordCampClaim({
      id: "danger-to-human",
      speakerId: s.voter.id,
      listenerIds: [s.npc.id],
      subjectId: s.p.id,
      topic: "target",
      stance: "proposed",
      day: s.gm.day,
      campTime: s.gm.dayTimer,
    });
    const r = s.e.resolve(
      s.e.action("warn", {
        speakerId: s.npc.id,
        listenerIds: [s.p.id],
        subjectId: s.p.id,
        claimId: "danger-to-human",
      }),
    );
    assert.equal(r.responses[0].stance, "pending");
    assert.ok(
      s.e
        .knowledge(s.p.id)
        .some(
          (k) =>
            k.topic === "safety" && k.evidenceIds.includes("danger-to-human"),
        ),
    );
  },
);
check(
  "NPC fabricated reassurance remains a heard claim, never a player lie detector",
  () => {
    const s = setup();
    const before = s.e.ownTarget(s.p.id);
    s.e.resolve(
      s.e.action("reassure", {
        speakerId: s.npc.id,
        listenerIds: [s.p.id],
        subjectId: s.p.id,
        truthMode: "fabrication",
      }),
    );
    const claim = s.e
      .knowledge(s.p.id)
      .find((k) => k.topic === "safety" && k.stance === "yes");
    assert.ok(claim);
    assert.equal(claim.truthfulness, undefined);
    assert.equal(s.e.ownTarget(s.p.id), before);
  },
);
check(
  "hesitation can elicit real new owned information instead of another empty pitch",
  () => {
    const s = setup();
    opening(s);
    s.memory.recordCampClaim({
      id: "new-useful-number",
      speakerId: s.voter.id,
      listenerIds: [s.npc.id],
      subjectId: s.target.id,
      topic: "commitment",
      stance: "yes",
      day: s.gm.day,
      campTime: s.gm.dayTimer,
    });
    const r = speak(s, "reply", { stance: "consider" });
    assert.equal(r.follow.type, "share");
    assert.ok(
      s.e
        .knowledge(s.p.id)
        .some((k) => k.evidenceIds.includes("new-useful-number")),
    );
  },
);
check(
  "relationship-minded initiator can propose protection but human must accept the actual deal",
  () => {
    const s = setup();
    s.npc.gameplayStyle = "Social Genius";
    s.gm.systems.trustSystem.setTrust(s.npc.id, s.p.id, 90);
    opening(s);
    const r = speak(s, "reply", { stance: "consider" });
    assert.equal(r.follow.type, "deal");
    const offer = s.gm.systems.dealSystem
      .getDealsForSurvivor(s.p.id)
      .find((d) => d.type === "MUTUAL_PROTECTION");
    assert.ok(offer);
    assert.equal(offer.status, "PROPOSED");
    assert.notEqual(
      s.activity.conversation.checkpoint.npcNegotiation.status,
      "settled",
    );
  },
);
check(
  "late assertive initiator can seek certainty once without forcing a player vote",
  () => {
    const s = setup();
    s.npc.gameplayStyle = "Power Player";
    s.gm.dayTimer = 500;
    opening(s);
    const before = s.p.voteTarget,
      r = speak(s, "reply", { stance: "consider" });
    assert.equal(r.follow.type, "press");
    assert.equal(s.p.voteTarget, before);
    assert.equal(speak(s, "reply", { stance: "consider" }).follow, null);
  },
);
check(
  "explicit withdrawal remains distinct from a historical accepted proposal",
  () => {
    const s = setup(),
      n = opening(s);
    speak(s, "promise");
    assert.equal(n.status, "settled");
    speak(s, "withdraw");
    assert.equal(n.outcome, "withdrawn");
    assert.equal(n.proposals[0].status, "withdrawn");
    assert.ok(
      s.memory
        .getConversationObligations(s.p.id)
        .some((o) => o.status === "withdrawn"),
    );
  },
);
check(
  "new strategic assignment can outrank a routine intention at a semantic boundary",
  () => {
    const s = setup();
    s.i.create(s.npc, s.voter.id, { type: "check_in", key: "ordinary" });
    const current = s.npc.campActivity;
    current.startedAt = s.gm.dayTimer + 120;
    s.memory.recordCampClaim({
      id: "fresh-conditional",
      speakerId: s.voter.id,
      listenerIds: [s.npc.id],
      subjectId: s.target.id,
      topic: "commitment",
      stance: "conditional",
      confidence: 0.9,
      confidenceByListener: { [s.npc.id]: 0.9 },
      conditions: [
        {
          kind: "known_commitment",
          voterId: s.alternate.id,
          targetId: s.target.id,
        },
      ],
      day: s.gm.day,
      campTime: s.gm.dayTimer,
    });
    for (const supporter of [s.p, s.by("Parvati")])
      s.memory.recordCampClaim({
        id: `firm:${supporter.id}`,
        speakerId: supporter.id,
        listenerIds: [s.npc.id],
        subjectId: s.target.id,
        topic: "commitment",
        stance: "yes",
        confidence: 0.9,
        confidenceByListener: { [s.npc.id]: 0.9 },
        day: s.gm.day,
        campTime: s.gm.dayTimer,
      });
    s.strategy.updateNpcIntentTarget(s.npc.id, s.target.id, {
      reason: "controlled owned coalition",
      absoluteConfidence: 0.9,
    });
    s.e.objectives.establish(s.npc.id, {
      type: "build_majority",
      targetId: s.target.id,
      rationale: "owned conditional vote",
    });
    const moved = s.i.reprioritize(s.npc, s.gm.dayTimer);
    assert.equal(moved, true);
    assert.ok(s.i.history.some((e) => e.reason === "new owned strategic work"));
    assert.notEqual(s.i.active(s.npc.id)?.key, "ordinary");
  },
);
check(
  "urgent reevaluation cannot interrupt an in-progress protected conversation",
  () => {
    const s = setup();
    opening(s);
    const activity = s.npc.campActivity;
    s.memory.recordCampClaim({
      id: "fresh-danger",
      speakerId: s.voter.id,
      listenerIds: [s.npc.id],
      subjectId: s.p.id,
      topic: "safety",
      stance: "warned",
      day: s.gm.day,
      campTime: s.gm.dayTimer - 1,
    });
    assert.equal(s.i.reprioritize(s.npc, s.gm.dayTimer), false);
    assert.equal(s.npc.campActivity, activity);
  },
);
check(
  "urgent reevaluation preserves current work when the proposed retry is on cooldown",
  () => {
    const s = setup();
    const old = s.i.create(s.npc, s.voter.id, {
      type: "check_in",
      key: "ordinary",
    });
    const current = s.npc.campActivity;
    current.startedAt = s.gm.dayTimer + 120;
    s.memory.recordCampClaim({
      id: "fresh-retry-danger",
      speakerId: s.voter.id,
      listenerIds: [s.npc.id],
      subjectId: s.p.id,
      topic: "safety",
      stance: "warned",
      confidence: 0.9,
      confidenceByListener: { [s.npc.id]: 0.9 },
      day: s.gm.day,
      campTime: s.gm.dayTimer,
    });
    const plan = {
      type: "approach_player",
      targetId: s.p.id,
      purpose: "objective_verify",
      agenda: { primarySubject: s.target.id },
    };
    s.i.recency[`${s.npc.id}:${s.p.id}:${s.i.planKey(plan)}`] = {
      day: s.gm.day,
      phase: s.gm.gamePhase,
      at: s.gm.dayTimer,
      key: s.i.planKey(plan),
    };
    s.e.objectives.plan = () => plan;
    assert.equal(s.i.reprioritize(s.npc, s.gm.dayTimer), false);
    assert.equal(s.npc.campActivity, current);
    assert.equal(s.i.active(s.npc.id), old);
    assert.equal(s.i.intentions.length, 1);
  },
);
check(
  "spoken reply text states refusal, consideration and nondisclosure explicitly",
  () => {
    const s = setup();
    opening(s);
    assert.equal(
      speak(s, "reply", { subjectId: null, stance: "withheld" }).result
        .playerLine,
      "I’m keeping my plans to myself for now.",
    );
    assert.equal(
      s.e.sentence(
        s.e.action("reply", {
          speakerId: s.p.id,
          listenerIds: [s.npc.id],
          subjectId: s.target.id,
          stance: "refused",
        }),
      ),
      "I’m not voting Tony.",
    );
    assert.match(
      s.e.sentence(
        s.e.action("reply", {
          speakerId: s.p.id,
          listenerIds: [s.npc.id],
          subjectId: s.target.id,
          stance: "consider",
        }),
      ),
      /not making a promise/,
    );
  },
);
check(
  "unresolved human condition creates a lawful prerequisite approach without invented support",
  () => {
    const s = setup();
    const i = s.i.create(s.npc, s.p.id, {
      type: "ask_vote",
      fields: { subjectId: s.target.id },
      key: "condition-origin",
    });
    opening(s);
    speak(s, "conditional", {
      conditions: [
        {
          kind: "known_commitment",
          voterId: s.voter.id,
          targetId: s.target.id,
        },
      ],
    });
    s.activity.conversation.initiativeId = i.id;
    s.activity.finishConversation();
    s.activity.interrupt(s.npc);
    s.i.boundary(s.gm.dayTimer);
    const follow = s.i.active(s.npc.id);
    assert.ok(follow);
    assert.equal(follow.targetId, s.voter.id);
    assert.equal(follow.type, "vote_read");
    assert.equal(
      s.e.conditionTrue(s.npc.id, {
        kind: "known_commitment",
        voterId: s.voter.id,
        targetId: s.target.id,
      }),
      false,
    );
    assert.equal(s.i.active(s.voter.id), undefined);
  },
);
check(
  "bounded NPC meetings consume every final resolved reply and never leave ghost response opportunities",
  () => {
    for (let variant = 0; variant < 10; variant++) {
      const s = setup();
      s.activity.beginConversation(s.npc, {
        location: "beach",
        strategy: true,
      });
      s.npc.gameplayStyle = variant % 2 ? "Power Player" : "Wildcard";
      s.gm.systems.trustSystem.setTrust(
        s.alternate.id,
        s.npc.id,
        35 + variant * 6,
      );
      const resolved = [];
      const resolve = s.e.resolve.bind(s.e);
      s.e.resolve = (action) => {
        const r = resolve(action);
        if (
          action.speakerId === s.npc.id &&
          ["pitch", "ask_vote", "press", "negotiate"].includes(action.type)
        )
          resolved.push(r);
        return r;
      };
      const r = s.e.resolve(
        s.e.action("pitch", {
          speakerId: s.npc.id,
          listenerIds: [s.alternate.id],
          subjectId: s.target.id,
        }),
      );
      const n = negotiateNpcMeeting(s.e, s.npc, s.alternate, r, {
        activityId: `bounded:${variant}`,
      });
      assert.notEqual(n.status, "awaiting_response");
      const last = resolved.at(-1);
      assert.ok(n.handled.includes(`${last.actionId}:heard-response`));
      const answer = last.responses.find((r) => r.speakerId === s.alternate.id);
      if (answer.stance === "conditional")
        assert.deepEqual(n.conditions, answer.conditions);
      if (answer.stance === "committed") assert.equal(n.outcome, "agreed");
      assert.ok(n.round <= 4);
    }
  },
);
check(
  "pre-immunity refusal stays hypothetical and a short camp clock does not imply Tribal pressure",
  () => {
    const s = setup(true);
    s.npc.gameplayStyle = "Power Player";
    opening(s);
    assert.ok(
      s.i
        .dialogueChoices(s.npc)
        .some(
          (c) =>
            c.label === "If we lose, I won’t vote Tony" &&
            c.line === "If we lose, I won’t vote Tony.",
        ),
    );
    s.gm.dayTimer = 300;
    const f = speak(s, "reply", { stance: "consider" }).follow;
    assert.ok(f && !f.invalid);
    assert.notEqual(f.type, "press");
    assert.ok(!f.playerLine.includes("running out of time"));
  },
);
check(
  "public NPC follow-up reaches each reserved group member without informing bystanders or forcing human support",
  () => {
    const s = setup();
    const n = opening(s),
      vote = s.p.voteTarget;
    assert.ok(s.activity.reserveConversationGroup([s.alternate.id]));
    const r = speak(s, "why");
    const f = r.follow;
    assert.ok(f && !f.invalid);
    assert.ok(f.responses.some((r) => r.speakerId === s.alternate.id));
    assert.ok(
      s.e
        .knowledge(s.alternate.id)
        .some(
          (k) =>
            k.id.startsWith(f.actionId) &&
            k.speakerId === s.npc.id &&
            k.subjectId === s.target.id,
        ),
    );
    assert.ok(
      !s.e.knowledge(s.voter.id).some((k) => k.id.startsWith(f.actionId)),
    );
    assert.equal(s.p.voteTarget, vote);
    assert.equal(n.status, "awaiting_response");
    const receiptCount = Object.keys(s.e.receipts).length;
    s.restore();
    assert.equal(
      s.activity.conversation.checkpoint.npcNegotiation.subjectId,
      s.target.id,
    );
    assert.equal(Object.keys(s.e.receipts).length, receiptCount);
  },
);
check(
  "persuasion novelty uses the initiator's sharing history rather than the listener's private knowledge",
  () => {
    const lines = [];
    for (const secretlyHeard of [false, true]) {
      const s = setup();
      s.memory.recordCampClaim({
        id: "owned-argument",
        speakerId: s.voter.id,
        listenerIds: [s.npc.id],
        subjectId: s.target.id,
        topic: "target",
        stance: "mentioned",
        day: s.gm.day,
        campTime: s.gm.dayTimer,
        confidence: 0.9,
      });
      opening(s);
      const ownerBefore = JSON.stringify(s.e.knowledge(s.npc.id));
      if (secretlyHeard)
        s.memory.recordCampClaim({
          id: "owned-argument",
          speakerId: s.voter.id,
          listenerIds: [s.p.id],
          subjectId: s.target.id,
          topic: "target",
          stance: "mentioned",
          day: s.gm.day,
          campTime: s.gm.dayTimer,
          confidence: 0.9,
        });
      assert.equal(JSON.stringify(s.e.knowledge(s.npc.id)), ownerBefore);
      const f = speak(s, "reply", { stance: "consider" }).follow;
      assert.equal(f.type, "share");
      lines.push(f.playerLine);
    }
    assert.equal(lines[0], lines[1]);
  },
);
