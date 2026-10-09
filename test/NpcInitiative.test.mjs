import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { makeScrambleQa } from "../qa/ScrambleSimulationHarness.mjs";
import { quiet } from "../qa/LivingCampSimulationHarness.mjs";
import { semanticProjection } from "../qa/StrategicDelegationNaturalSimulation.mjs";
const q = (fn) => quiet(fn);
function setup({ pre = false } = {}) {
  return q(() => {
    const s = makeScrambleQa({
      seed: 59,
      names: ["Sandra", "Jeremy", "Michele", "Tony", "Parvati"],
    });
    s.idle();
    s.strategy.scramble.meetings = [];
    s.gm.systems.allianceSystem.reset();
    s.memory.deserialize({});
    s.conversation.engine.tasks.deserialize();
    s.conversation.engine.objectives.deserialize();
    if (pre) {
      s.gm.gamePhase = "preChallenge";
      s.strategy.isActive = false;
      s.activity.phaseId = s.activity.phase;
    }
    const e = s.conversation.engine,
      i = e.initiative,
      a = s.activity.npcs()[0],
      b = s.activity.npcs()[1],
      p = s.gm.player;
    s.conversation.view.show = () => {};
    s.conversation._renderMenu = () => {};
    return { ...s, e, i, a, b, p };
  });
}
function approach(s, type = "check_in", fields = {}) {
  const i = s.i.create(s.a, s.p.id, {
    type,
    fields,
    reason: type,
    key: `${type}:${fields.claimId || "fixture"}`,
    private: true,
  });
  s.activity.interrupt(s.a);
  s.activity.chooseNext(s.a, s.gm.dayTimer);
  return i;
}
function invite(s, type = "check_in", fields = {}) {
  const i = approach(s, type, fields);
  s.wait(45);
  assert.ok(s.i.invitation);
  return i;
}
function heard(s, owner, subject, topic = "target", extra = {}) {
  s.memory.recordCampClaim({
    id: `owned:${topic}:${subject.id}`,
    speakerId: s.b.id,
    listenerIds: [owner.id],
    subjectId: subject.id,
    topic,
    stance: "proposed",
    confidence: 0.8,
    day: s.gm.day,
    campTime: s.gm.dayTimer,
    ...extra,
  });
}

test("ordinary pre-immunity connection emerges from relationship and lack of contact", () =>
  q(() => {
    const s = setup({ pre: true });
    s.activity.effort[s.a.id] = 360;
    s.gm.systems.trustSystem.setTrust(s.a.id, s.p.id, 80);
    assert.ok(
      s.i
        .candidates(s.a)
        .some((c) => c.targetId === s.p.id && c.type === "check_in"),
    );
  }));
test("owned danger creates proactive warning; private danger does not leak to another owner", () =>
  q(() => {
    const s = setup({ pre: true });
    s.gm.systems.trustSystem.setTrust(s.a.id, s.p.id, 85);
    heard(s, s.a, s.p);
    assert.ok(
      s.i
        .candidates(s.a)
        .some((c) => c.type === "warn" && c.targetId === s.p.id),
    );
    assert.ok(
      !s.i
        .candidates(s.b)
        .some((c) => c.type === "warn" && c.targetId === s.p.id),
    );
  }));
test("pre-immunity formal alliance opportunity uses the existing alliance authority", () =>
  q(() => {
    const s = setup({ pre: true });
    s.gm.systems.trustSystem.setTrust(s.a.id, s.p.id, 85);
    s.gm.systems.relationshipSystem.setRelationship(s.a.id, s.p.id, 85);
    assert.ok(
      s.i
        .candidates(s.a)
        .some((c) => c.agenda?.allianceMotive && c.targetId === s.p.id),
    );
  }));
test("both NPC and human listeners participate in production candidate selection", () =>
  q(() => {
    const s = setup({ pre: true });
    s.activity.effort[s.a.id] = 360;
    for (const target of [s.b, s.p])
      s.gm.systems.trustSystem.setTrust(s.a.id, target.id, 75);
    const ids = s.i.candidates(s.a).map((c) => c.targetId);
    assert.ok(ids.includes(s.b.id));
    assert.ok(ids.includes(s.p.id));
  }));
test("remote live coordinates are not knowledge", () =>
  q(() => {
    const s = setup();
    s.activity.start(s.b, {
      type: "observe",
      location: "waterWell",
      duration: 3000,
    });
    assert.equal(s.i.locate(s.a.id, s.b.id), null);
    s.gm.systems.npcLocationSystem.updateNpcLocation(s.b.id, "shelter");
    assert.equal(s.i.locate(s.a.id, s.b.id), null);
  }));
test("owned recent sightings guide approach while stale sightings expire", () =>
  q(() => {
    const s = setup();
    s.p.location = "waterWell";
    window.campScreen.currentView = "waterWell";
    s.memory.recordCampObservation({
      id: "sighting",
      actorId: s.p.id,
      witnessIds: [s.a.id],
      type: "arrived",
      location: "waterWell",
      day: s.gm.day,
      campTime: s.gm.dayTimer,
    });
    assert.equal(s.i.locate(s.a.id, s.p.id), "waterWell");
    s.gm.dayTimer -= 901;
    assert.equal(s.i.locate(s.a.id, s.p.id), null);
  }));
test("travel completes before invitation and destination presence is not arrival", () =>
  q(() => {
    const s = setup();
    s.p.location = "waterWell";
    window.campScreen.currentView = "waterWell";
    s.memory.recordCampObservation({
      id: "known-well",
      actorId: s.p.id,
      witnessIds: [s.a.id],
      type: "arrived",
      location: "waterWell",
      day: s.gm.day,
      campTime: s.gm.dayTimer,
    });
    approach(s);
    assert.equal(s.a.campActivity.type, "travel");
    assert.equal(s.i.invitation, null);
    assert.equal(s.e.together(s.a.id, s.p.id), false);
    s.wait(270);
    assert.equal(s.i.invitation, null);
    s.wait(45);
    assert.ok(s.i.invitation);
    assert.equal(s.e.together(s.a.id, s.p.id), true);
  }));
test("moving target is not tracked through hidden coordinates", () =>
  q(() => {
    const s = setup();
    s.p.location = "waterWell";
    window.campScreen.currentView = "waterWell";
    s.memory.recordCampObservation({
      id: "last-well",
      actorId: s.p.id,
      witnessIds: [s.a.id],
      type: "arrived",
      location: "waterWell",
      day: s.gm.day,
      campTime: s.gm.dayTimer,
    });
    const intent = approach(s);
    s.p.location = "shelter";
    window.campScreen.currentView = "shelter";
    s.wait(270);
    assert.equal(s.i.invitation, null);
    assert.equal(s.e.place(s.a.id), "waterWell");
    assert.equal(intent.status, "waiting");
  }));
test("search attempts are bounded and an unavailable target does not create ghost dialogue", () =>
  q(() => {
    const s = setup();
    s.p.location = "treeMail";
    window.campScreen.currentView = "treeMail";
    const intent = approach(s);
    s.wait(700);
    assert.ok(["abandoned", "expired"].includes(intent.status));
    assert.equal(s.activity.conversation, null);
    assert.equal(s.i.invitation, null);
  }));
test("busy player cannot be hijacked or invited while traveling", () =>
  q(() => {
    const s = setup();
    s.activity.start(s.p, {
      type: "travel",
      location: "waterWell",
      external: true,
    });
    approach(s);
    s.wait(45);
    assert.equal(s.i.invitation, null);
    assert.equal(s.activity.conversation, null);
  }));
test("NPC listener cannot have parallel exclusive conversations", () =>
  q(() => {
    const s = setup(),
      c = s.activity.npcs()[2];
    s.activity.start(s.b, {
      type: "private_conversation",
      location: "beach",
      external: true,
    });
    const intent = s.i.create(s.a, s.b.id, {
      type: "check_in",
      key: "busy",
      reason: "connection",
    });
    s.activity.interrupt(s.a);
    s.activity.chooseNext(s.a, s.gm.dayTimer);
    assert.equal(s.a.campActivity.type, "initiative_wait");
    assert.equal(s.b.campActivity.type, "private_conversation");
    assert.equal(intent.status, "waiting");
    assert.notEqual(c.campActivity.id, s.b.campActivity.id);
  }));
for (const pre of [false, true])
  test(`${pre ? "pre" : "post"} invitation never assumes consent`, () =>
    q(() => {
      const s = setup({ pre });
      invite(s);
      assert.equal(s.activity.conversation, null);
      assert.equal(s.p.campActivity, null);
      s.wait(30);
      assert.ok(s.i.invitation);
      assert.equal(s.activity.conversation, null);
      assert.equal(s.i.respond("accept"), true);
      assert.equal(s.activity.conversation.npcId, s.a.id);
    }));
test("reasonable deferral preserves trust and meaningful intention", () =>
  q(() => {
    const s = setup();
    const intent = invite(s),
      before = s.gm.getTrust(s.a.id, s.p.id);
    assert.equal(s.i.respond("defer"), true);
    assert.equal(intent.status, "deferred");
    assert.equal(s.gm.getTrust(s.a.id, s.p.id), before);
    s.wait(165);
    assert.ok(s.i.invitation);
    assert.equal(s.i.invitation.intentionId, intent.id);
  }));
test("decline and deliberate rude dismissal have distinct social semantics", () =>
  q(() => {
    for (const choice of ["decline", "rude"]) {
      const s = setup(),
        intent = invite(s),
        before = s.gm.getTrust(s.a.id, s.p.id);
      s.i.respond(choice);
      assert.equal(intent.status, "abandoned");
      assert.equal(s.activity.conversation, null);
      assert.equal(s.gm.getTrust(s.a.id, s.p.id) < before, choice === "rude");
      assert.ok(
        s.memory.memory[String(s.a.id)].conversationHistory.some(
          (k) => k.type === `approach_${choice}`,
        ),
      );
    }
  }));
test("urgent fresh evidence bypasses routine recency; repeated evidence remains suppressed", () =>
  q(() => {
    const s = setup({ pre: true });
    s.gm.systems.trustSystem.setTrust(s.a.id, s.p.id, 80);
    s.i.recency[`${s.a.id}:${s.p.id}`] = {
      key: "check_in",
      at: s.gm.dayTimer,
      day: s.gm.day,
      phase: s.gm.gamePhase,
    };
    heard(s, s.a, s.p);
    const warning = s.i.candidates(s.a).find((c) => c.type === "warn");
    assert.ok(warning);
    s.i.recency[`${s.a.id}:${s.p.id}`].key = warning.key;
    assert.ok(!s.i.candidates(s.a).some((c) => c.type === "warn"));
  }));
test("selected trivial motive cannot repeatedly bypass anti-spam bounds", () =>
  q(() => {
    const s = setup({ pre: true }),
      intent = invite(s);
    s.i.respond("decline");
    assert.equal(s.i.recent(s.a.id, s.p.id, intent.key), true);
    assert.equal(s.i.recent(s.a.id, s.p.id, "other-small-talk"), true);
  }));
test("private relocation uses real paired travel and both contestants remain absent in transit", () =>
  q(() => {
    const s = setup();
    const intent = invite(s);
    assert.equal(s.i.respond("private"), true);
    assert.equal(s.p.campActivity.type, "travel");
    assert.equal(s.a.campActivity.id, s.p.campActivity.id);
    assert.equal(s.e.together(s.a.id, s.p.id), false);
    assert.equal(intent.status, "relocating");
    s.wait(180);
    assert.equal(s.p.location, "shelter");
    assert.equal(s.e.place(s.a.id), "shelter");
    assert.ok(s.i.invitation);
    assert.equal(s.activity.conversation, null);
  }));
test("NPC-to-NPC initiative actually resolves semantic dialogue and memory", () =>
  q(() => {
    const s = setup(),
      intent = s.i.create(s.a, s.b.id, {
        type: "check_in",
        fields: { subjectId: s.b.id },
        reason: "connection",
        key: "connection",
      });
    s.activity.interrupt(s.a);
    s.activity.chooseNext(s.a, s.gm.dayTimer);
    s.wait(240);
    assert.equal(intent.status, "resolved");
    assert.ok(
      s.i.history.some(
        (k) => k.stage === "semantic_action" && k.intentionId === intent.id,
      ),
    );
    assert.ok(
      s.memory.memory[String(s.b.id)].conversationHistory.some(
        (k) => k.speakerId === s.a.id && k.type === "check_in",
      ),
    );
  }));
test("NPC proposal continues after questioning without assigning the player a vote", () =>
  q(() => {
    const s = setup(),
      target = s.activity.npcs()[3];
    invite(s, "ask_vote", { subjectId: target.id });
    s.i.respond("accept");
    const checkpoint = s.activity.conversation.checkpoint;
    assert.equal(checkpoint.npcNegotiation.proposal, true);
    const before = s.p.voteTarget;
    const a = s.e.action("why", {
      speakerId: s.p.id,
      listenerIds: [s.a.id],
      subjectId: target.id,
    });
    const r = s.e.resolve(a),
      follow = s.i.afterPlayerAction(s.a, a, r);
    assert.equal(follow.type, "ask_vote");
    assert.equal(s.p.voteTarget, before);
    assert.ok(s.i.dialogueChoices(s.a).some((c) => c.type === "conditional"));
  }));
test("conditional player answer records actual condition and follow-up need", () =>
  q(() => {
    const s = setup(),
      target = s.activity.npcs()[3];
    const intent = invite(s, "ask_vote", { subjectId: target.id });
    s.i.respond("accept");
    const conditions = [
      { kind: "known_commitment", voterId: s.b.id, targetId: target.id },
    ];
    const a = s.e.action("conditional", {
      speakerId: s.p.id,
      listenerIds: [s.a.id],
      subjectId: target.id,
      conditions,
    });
    const r = s.e.resolve(a);
    s.i.afterPlayerAction(s.a, a, r);
    assert.deepEqual(
      s.activity.conversation.checkpoint.npcNegotiation.conditions,
      conditions,
    );
    assert.ok(
      s.i.history.some(
        (k) => k.stage === "followup_needed" && k.intentionId === intent.id,
      ),
    );
    assert.ok(
      s.memory
        .getConversationObligations(s.p.id)
        .some((o) => o.conditions?.length),
    );
  }));
test("player lean and refusal communicate uncertainty without manufacturing a promise", () =>
  q(() => {
    const s = setup(),
      target = s.activity.npcs()[3];
    s.activity.beginConversation(s.a, { location: "beach" });
    const prior = s.memory.getConversationObligations(s.p.id).length;
    for (const stance of ["consider", "refused"])
      assert.ok(
        !s.e.resolve(
          s.e.action("reply", {
            speakerId: s.p.id,
            listenerIds: [s.a.id],
            subjectId: target.id,
            stance,
          }),
        ).invalid,
      );
    assert.equal(s.memory.getConversationObligations(s.p.id).length, prior);
  }));
test("false agreement stays a spoken cover promise and never a human ballot", () =>
  q(() => {
    const s = setup(),
      target = s.activity.npcs()[3];
    invite(s, "ask_vote", { subjectId: target.id });
    s.i.respond("accept");
    const before = s.p.voteTarget,
      a = s.e.action("cover_promise", {
        speakerId: s.p.id,
        listenerIds: [s.a.id],
        subjectId: target.id,
      });
    const r = s.e.resolve(a);
    s.i.afterPlayerAction(s.a, a, r);
    assert.equal(s.p.voteTarget, before);
    assert.equal(
      s.activity.conversation.checkpoint.npcNegotiation.status,
      "settled",
    );
  }));
test("NPC stops repeating an identical proposal after bounded exchanges", () =>
  q(() => {
    const s = setup(),
      target = s.activity.npcs()[3];
    invite(s, "ask_vote", { subjectId: target.id });
    s.i.respond("accept");
    for (let n = 0; n < 4; n++) {
      const a = s.e.action("why", {
        speakerId: s.p.id,
        listenerIds: [s.a.id],
        subjectId: target.id,
      });
      const r = s.e.resolve(a),
        follow = s.i.afterPlayerAction(s.a, a, r);
      if (n >= 2) assert.equal(follow, null);
    }
    assert.equal(s.i.dialogueChoices(s.a).length, 0);
  }));
test("rendering and replaying a resolved answer cannot duplicate the NPC continuation", () =>
  q(() => {
    const s = setup(),
      target = s.activity.npcs()[3];
    invite(s, "ask_vote", { subjectId: target.id });
    s.i.respond("accept");
    const a = s.e.action("why", {
        speakerId: s.p.id,
        listenerIds: [s.a.id],
        subjectId: target.id,
      }),
      r = s.e.resolve(a);
    s.i.afterPlayerAction(s.a, a, r);
    const count = Object.keys(s.e.receipts).length;
    s.i.afterPlayerAction(s.a, a, s.e.resolve(a));
    for (let n = 0; n < 20; n++) s.i.dialogueChoices(s.a);
    assert.equal(Object.keys(s.e.receipts).length, count);
  }));
for (const state of [
  "identified",
  "traveling",
  "waiting",
  "invited",
  "deferred",
  "relocating",
  "in_conversation",
  "conditional",
  "resolved",
  "abandoned",
])
  test(`production JSON save preserves ${state} initiative without reroll or duplicate invitation`, () =>
    q(() => {
      const s = setup();
      let intent;
      if (state === "identified")
        intent = s.i.create(s.a, s.p.id, {
          type: "check_in",
          reason: "connection",
          key: "saved",
        });
      else if (["traveling", "waiting"].includes(state)) {
        s.p.location = "waterWell";
        window.campScreen.currentView = "waterWell";
        intent = approach(s);
        if (state === "waiting") {
          s.p.location = "shelter";
          window.campScreen.currentView = "shelter";
          s.wait(90);
        }
      } else {
        intent = invite(
          s,
          state === "conditional" ? "ask_vote" : "check_in",
          state === "conditional" ? { subjectId: s.b.id } : {},
        );
        if (["deferred", "abandoned"].includes(state))
          s.i.respond(state === "deferred" ? "defer" : "decline");
        if (state === "relocating") s.i.respond("private");
        if (["in_conversation", "conditional", "resolved"].includes(state))
          s.i.respond("accept");
        if (state === "conditional") {
          const a = s.e.action("conditional", {
            speakerId: s.p.id,
            listenerIds: [s.a.id],
            subjectId: s.b.id,
            conditions: [
              {
                kind: "known_commitment",
                voterId: s.activity.npcs()[2].id,
                targetId: s.b.id,
              },
            ],
          });
          s.i.afterPlayerAction(s.a, a, s.e.resolve(a));
        }
        if (state === "resolved") s.activity.finishConversation();
      }
      const before = semanticProjection({
        initiative: s.i.serialize(),
        camp: s.activity.serialize(),
        engine: s.e.serialize(),
      });
      s.restore();
      const after = semanticProjection({
        initiative: s.i.serialize(),
        camp: s.activity.serialize(),
        engine: s.e.serialize(),
      });
      assert.deepEqual(after, before);
    }));
test("phase and elimination end pending intentions and release invitation reservations", () =>
  q(() => {
    const s = setup();
    const intent = invite(s);
    s.a.isOut = true;
    s.i.boundary(s.gm.dayTimer);
    assert.equal(intent.status, "expired");
    assert.equal(s.i.invitation, null);
  }));
test("no legacy wall-time automatic invitation acceptance remains", () => {
  const source = fs.readFileSync(
    new URL("../src/modules/systems/ConversationSystem.js", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(source, /setTimeout[\s\S]{0,150},\s*1800\s*\)/);
  assert.ok(!source.includes("autoAcceptTimer"));
});
test("production planning selects and physically executes a meaningful human warning without injected intention", () =>
  q(() => {
    const s = setup({ pre: true });
    s.gm.systems.trustSystem.setTrust(s.a.id, s.p.id, 90);
    heard(s, s.a, s.p);
    s.activity.interrupt(s.a);
    s.activity.chooseNext(s.a, s.gm.dayTimer);
    assert.equal(s.i.active(s.a.id).targetId, s.p.id);
    assert.equal(s.a.campActivity.type, "approach_player");
    s.wait(45);
    s.i.respond("accept");
    assert.equal(s.activity.conversation.checkpoint.semanticLast.type, "warn");
  }));
test("production planning selects another NPC for owned danger and resolves an actual warning", () =>
  q(() => {
    const s = setup({ pre: true });
    s.gm.systems.trustSystem.setTrust(s.a.id, s.b.id, 90);
    heard(s, s.a, s.b);
    s.activity.interrupt(s.a);
    s.activity.chooseNext(s.a, s.gm.dayTimer);
    assert.equal(s.i.active(s.a.id).targetId, s.b.id);
    s.wait(120);
    assert.ok(
      s.memory
        .getCampClaims(s.b.id)
        .some((k) => k.topic === "safety" && k.speakerId === s.a.id),
    );
  }));
test("a fulfilled, owner-known player condition causes a new bounded follow-up", () =>
  q(() => {
    const s = setup(),
      target = s.activity.npcs()[3];
    s.i.candidates = () => [];
    s.strategy.updateNpcIntentTarget(s.a.id, target.id);
    const intent = invite(s, "ask_vote", { subjectId: target.id });
    s.i.respond("accept");
    const conditions = [
      { kind: "known_commitment", voterId: s.b.id, targetId: target.id },
    ];
    const a = s.e.action("conditional", {
      speakerId: s.p.id,
      listenerIds: [s.a.id],
      subjectId: target.id,
      conditions,
    });
    s.i.afterPlayerAction(s.a, a, s.e.resolve(a));
    s.activity.finishConversation();
    assert.equal(intent.outcome, "condition_pending");
    assert.equal(s.i.active(s.a.id), undefined);
    heard(s, s.a, target, "commitment", { speakerId: s.b.id, stance: "yes" });
    s.i.boundary(s.gm.dayTimer);
    const follow = s.i.active(s.a.id);
    assert.ok(follow);
    assert.equal(follow.targetId, s.p.id);
    assert.equal(follow.reason, "follow up on agreed condition");
    const count = s.i.intentions.length;
    s.i.boundary(s.gm.dayTimer);
    assert.equal(s.i.intentions.length, count);
  }));
test("witnesses observe an approach but do not inherit a private proposal", () =>
  q(() => {
    const s = setup(),
      target = s.activity.npcs()[3],
      witness = s.activity.npcs()[2];
    invite(s, "ask_vote", { subjectId: target.id });
    s.i.respond("accept");
    assert.ok(
      s.memory.getCampClaims(s.p.id).some((k) => k.subjectId === target.id),
    );
    assert.ok(
      !s.memory
        .getCampClaims(witness.id)
        .some((k) => k.subjectId === target.id),
    );
  }));
test("refusing attention leaves NPC work unresolved and does not create an accepted assignment", () =>
  q(() => {
    const s = setup();
    const objective = s.e.objectives.establish(s.a.id, {
      targetId: s.activity.npcs()[3].id,
      explicit: true,
    });
    const intent = invite(s);
    intent.agenda = {
      purpose: "objective_delegate",
      objectiveId: objective.id,
      work: { purpose: "verify_vote" },
    };
    s.i.respond("decline");
    assert.equal(Object.values(s.e.tasks.records).length, 0);
    assert.ok(objective.revision > 0);
    assert.equal(s.i.active(s.a.id), undefined);
  }));
for (const privateWalk of [false, true])
  test(`${privateWalk ? "private walk" : "invitation and negotiation"} uninterrupted and reloaded progression are identical`, () =>
    q(() => {
      const run = (reload) => {
        const s = setup(),
          target = s.activity.npcs()[3];
        invite(s, "ask_vote", { subjectId: target.id });
        if (reload) s.restore();
        s.i.respond(privateWalk ? "private" : "accept");
        if (privateWalk) {
          s.wait(45);
          if (reload) s.restore();
          s.wait(135);
          s.i.respond("accept");
        }
        const npc = s.e.person(s.a.id),
          action = s.e.action("why", {
            speakerId: s.p.id,
            listenerIds: [npc.id],
            subjectId: target.id,
          });
        const result = s.e.resolve(action);
        s.i.afterPlayerAction(npc, action, result);
        if (reload) s.restore();
        s.activity.finishConversation();
        s.wait(45);
        return semanticProjection({
          camp: s.activity.serialize(),
          initiative: s.i.serialize(),
          engine: s.e.serialize(),
          locations: s.gm.systems.npcLocationSystem.serialize(),
          memory: s.memory.serialize(),
          intents: [...s.strategy.npcIntentTargets],
        });
      };
      assert.deepEqual(run(true), run(false));
    }));
test("production character profiles weight privacy, repair and persistence differently", async () => {
  const { conversationCharacter } =
    await import("../src/modules/systems/ConversationCharacter.js");
  const styles = [
    "Social Genius",
    "Power Player",
    "Shadow Strategist",
    "Competitive",
    "Wildcard",
    "Lethal Charmer",
  ];
  const profiles = styles.map((gameplayStyle) =>
    conversationCharacter({
      gameplayStyle,
      social: 7,
      strategy: 7,
      honesty: 6,
      loyalty: 6,
      paratend: 5,
      aggression: 5,
      risk: 5,
    }),
  );
  assert.ok(profiles[2].visibilityTolerance < profiles[1].visibilityTolerance);
  assert.ok(profiles[0].repairDrive > profiles[1].repairDrive);
  assert.ok(
    new Set(
      profiles.map((p) =>
        JSON.stringify([p.coverDrive, p.flexibility, p.pressureDrive]),
      ),
    ).size >= 4,
  );
});
test("two co-present NPCs seeking each other can reserve a real meeting instead of waiting forever", () =>
  q(() => {
    const s = setup();
    s.i.create(s.a, s.b.id, {
      type: "check_in",
      key: "mutual-a",
      reason: "connection",
    });
    s.i.create(s.b, s.a.id, {
      type: "check_in",
      key: "mutual-b",
      reason: "connection",
    });
    for (const person of [s.a, s.b]) {
      s.activity.interrupt(person);
      s.activity.start(person, {
        type: "initiative_wait",
        location: "beach",
        duration: 60,
      });
    }
    s.activity.interrupt(s.a);
    s.activity.chooseNext(s.a, s.gm.dayTimer);
    assert.equal(s.a.campActivity.type, "strategy_conversation");
    assert.equal(s.a.campActivity.id, s.b.campActivity.id);
    s.wait(240);
    assert.ok(
      s.i.history.some(
        (k) => k.stage === "semantic_action" && k.direction === "npc",
      ),
    );
  }));
test("routine unknown-location check-in waits for a sighting rather than sending a blind expedition", () =>
  q(() => {
    const s = setup({ pre: true });
    s.p.location = "waterWell";
    window.campScreen.currentView = "waterWell";
    s.i.create(s.a, s.p.id, {
      type: "check_in",
      reason: "connection",
      key: "low-urgency",
    });
    assert.equal(s.i.plan(s.a, s.gm.dayTimer, { objectives: false }), null);
    assert.equal(s.i.active(s.a.id).waitForSighting, true);
    assert.notEqual(s.a.campActivity.type, "travel");
  }));
test("new owned urgent warning supersedes an unresolved ordinary motive at a semantic opportunity", () =>
  q(() => {
    const s = setup({ pre: true });
    s.gm.systems.trustSystem.setTrust(s.a.id, s.p.id, 90);
    const old = s.i.create(s.a, s.b.id, {
      type: "check_in",
      reason: "connection",
      key: "old-routine",
    });
    s.activity.interrupt(s.a);
    s.activity.start(s.a, {
      type: "observe",
      location: "beach",
      duration: 600,
    });
    s.wait(100);
    heard(s, s.a, s.p);
    s.wait(1);
    assert.equal(old.status, "abandoned");
    assert.equal(s.i.active(s.a.id).type, "warn");
  }));
