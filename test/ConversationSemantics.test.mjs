import test from "node:test";
import assert from "node:assert/strict";
import { makeScrambleQa } from "../qa/ScrambleSimulationHarness.mjs";
import { quiet } from "../qa/LivingCampSimulationHarness.mjs";
import {
  ACTION_DEFINITIONS,
  validateConversationCatalog,
  conversationCapabilities,
} from "../src/modules/systems/ConversationActionCatalog.js";
import { CONVERSATION_RESOLVER_TYPES } from "../src/modules/systems/ConversationResolver.js";
import { conversationCharacter } from "../src/modules/systems/ConversationCharacter.js";
import TribalCouncilSystem from "../src/modules/systems/TribalCouncilSystem.js";
const names = ["Sandra", "Jeremy", "Michele", "Tony", "Parvati"];
function setup() {
  return quiet(() => {
    const s = makeScrambleQa({ names });
    s.idle();
    s.strategy.scramble.meetings = [];
    s.strategy.scramble.nextApproachAt = -1;
    s.gm.systems.allianceSystem.reset();
    s.memory.deserialize({});
    const by = (name) => s.activity.members().find((p) => p.firstName === name),
      e = s.conversation.engine;
    for (const p of s.activity.npcs())
      for (const q of s.activity.members())
        if (p.id !== q.id) s.gm.systems.trustSystem.setTrust(p.id, q.id, 65);
    s.e = e;
    s.by = by;
    s.act = (type, speaker, listener, fields = {}) =>
      e.resolve(
        e.action(type, {
          speakerId: speaker.id,
          listenerIds: Array.isArray(listener)
            ? listener.map((p) => p.id)
            : [listener.id],
          ...fields,
        }),
      );
    return s;
  });
}
const check = (name, fn) => test(name, () => quiet(() => fn(setup())));
check(
  "catalog has resolver and navigable categories for every capability",
  (s) => {
    assert.deepEqual(
      validateConversationCatalog(CONVERSATION_RESOLVER_TYPES),
      [],
    );
    assert.ok(Object.keys(ACTION_DEFINITIONS).length >= 60);
  },
);
check(
  "A bonding is bounded, remembered and offers meaningful continuation",
  (s) => {
    const npc = s.by("Jeremy"),
      before = { value: 50 };
    s.gm.systems.relationshipSystem.setRelationship(s.gm.player.id, npc.id, 50);
    for (let i = 0; i < 5; i++) {
      const r = s.act("check_in", s.gm.player, npc);
      assert.ok(r.followUps.includes("personal"));
    }
    assert.equal(s.memory.memory[npc.id].conversationHistory.length, 5);
    const after = s.gm.systems.relationshipSystem.getRelationship(
      s.gm.player.id,
      npc.id,
    );
    assert.ok(after.value - before.value <= 2);
  },
);
check(
  "B social reads use different owned evidence and never hidden threat",
  (s) => {
    const a = s.by("Sandra"),
      b = s.by("Jeremy"),
      tony = s.by("Tony"),
      parvati = s.by("Parvati");
    s.memory.recordCampClaim({
      id: "a-read",
      speakerId: a.id,
      subjectId: tony.id,
      topic: "idol_possession",
      stance: "yes",
      origin: "firsthand",
      confidence: 0.9,
    });
    s.memory.recordCampClaim({
      id: "b-read",
      speakerId: b.id,
      subjectId: parvati.id,
      topic: "idol_possession",
      stance: "yes",
      origin: "firsthand",
      confidence: 0.9,
    });
    for (const p of s.activity.members())
      Object.defineProperty(p, "threat", {
        get() {
          throw new Error("omniscient threat access");
        },
        configurable: true,
      });
    assert.notEqual(
      s.e.socialRead(a.id, "dangerous").subjectId,
      s.e.socialRead(b.id, "dangerous").subjectId,
    );
  },
);
check(
  "C direct commitment can be truthfully attributed without revealing another mind",
  (s) => {
    const j = s.by("Jeremy"),
      m = s.by("Michele"),
      t = s.by("Tony");
    s.act("promise", j, m, { subjectId: t.id });
    const claim = s.e
      .knowledge(m.id)
      .find((k) => k.speakerId === j.id && k.topic === "commitment");
    assert.equal(claim.provenance, "direct_statement");
    s.act("share", m, s.gm.player, { claimId: claim.id });
    const received = s.e
      .knowledge(s.gm.player.id)
      .find((k) => k.attributedId === j.id);
    assert.equal(received.provenance, "hearsay");
    assert.ok(received.sourceChain.includes(m.id));
  },
);
check(
  "D hearsay stays secondhand and does not become a direct personal promise",
  (s) => {
    const j = s.by("Jeremy"),
      m = s.by("Michele"),
      t = s.by("Tony");
    s.act("bluff", m, s.by("Sandra"), {
      subjectId: t.id,
      allegedSourceId: j.id,
    });
    const heard = s.e
      .knowledge(s.by("Sandra").id)
      .find((k) => k.topic === "commitment");
    assert.equal(heard.provenance, "hearsay");
    assert.equal(s.e.promises(s.by("Sandra").id).length, 0);
  },
);
check(
  "E deliberate bluff propagates a claim without rewriting the alleged voter",
  (s) => {
    const j = s.by("Jeremy"),
      t = s.by("Tony"),
      before = s.strategy.reasoning.state(j.id).intendedVoteId;
    s.act("bluff", s.gm.player, s.by("Michele"), {
      subjectId: t.id,
      allegedSourceId: j.id,
    });
    assert.equal(s.strategy.reasoning.state(j.id).intendedVoteId, before);
    const raw = s.memory.getCampClaims(s.by("Michele").id)[0];
    assert.equal(raw.truthfulness, undefined);
    assert.equal(s.e.knowledge(s.by("Sandra").id).length, 0);
  },
);
check(
  "F verification can deny a story and creates uncertainty rather than a truth detector",
  (s) => {
    const j = s.by("Jeremy"),
      m = s.by("Michele"),
      t = s.by("Tony");
    j.gameplayStyle = "Competitive";
    j.honesty = 10;
    j.deception = 2;
    s.act("bluff", s.gm.player, m, { subjectId: t.id, allegedSourceId: j.id });
    const claim = s.e.knowledge(m.id)[0];
    const r = s.act("verify", m, j, { claimId: claim.id });
    assert.match(r.responses[0].line, /did not say/);
    assert.ok(s.memory.getCampClaims(m.id).some((k) => k.contradicts?.length));
    assert.ok(
      s.memory.getCampClaims(m.id).every((k) => k.truthfulness === undefined),
    );
  },
);
check(
  "J conditional promise stores a condition and only becomes real after owned confirmation",
  (s) => {
    const m = s.by("Michele"),
      j = s.by("Jeremy"),
      t = s.by("Tony"),
      sand = s.by("Sandra");
    const before = s.strategy.reasoning.state(m.id).committedTargetId;
    s.act("conditional", m, sand, {
      subjectId: t.id,
      conditions: [{ kind: "known_commitment", voterId: j.id, targetId: t.id }],
    });
    assert.equal(s.strategy.reasoning.state(m.id).committedTargetId, before);
    s.act("promise", j, m, { subjectId: t.id });
    assert.equal(s.strategy.reasoning.state(m.id).committedTargetId, t.id);
  },
);
check("unmet condition is not a broken promise after Tribal", (s) => {
  const m = s.by("Michele"),
    j = s.by("Jeremy"),
    t = s.by("Tony");
  s.act("conditional", m, s.gm.player, {
    subjectId: t.id,
    conditions: [{ kind: "known_commitment", voterId: j.id, targetId: t.id }],
  });
  s.e.settlePromises({
    day: 1,
    votes: [{ voterId: m.id, targetId: s.by("Parvati").id }],
  });
  assert.equal(s.e.promises(m.id)[0].status, "condition_unmet");
  assert.equal(s.e.promises(s.gm.player.id)[0].status, "conditional");
});
check(
  "K decoys change audience beliefs without changing sender intentions",
  (s) => {
    const sand = s.by("Sandra"),
      t = s.by("Tony"),
      p = s.by("Parvati");
    s.strategy.updateNpcIntentTarget(sand.id, t.id);
    s.act("decoy", sand, t, { subjectId: p.id });
    assert.equal(s.e.ownTarget(sand.id), t.id);
    assert.ok(s.e.knowledge(t.id).some((k) => k.subjectId === p.id));
    assert.equal(s.e.knowledge(s.by("Michele").id).length, 0);
  },
);
check(
  "L distinct leak-test stories can return as evidence for suspicion, never certainty",
  (s) => {
    const j = s.by("Jeremy"),
      m = s.by("Michele"),
      t = s.by("Tony"),
      p = s.by("Parvati");
    s.act("leak_test", s.gm.player, j, { subjectId: t.id });
    s.act("leak_test", s.gm.player, m, { subjectId: p.id });
    const sent = s.e.knowledge(j.id).find((k) => k.subjectId === t.id);
    s.act("share", j, p, { claimId: sent.id });
    const passed = s.e.knowledge(p.id).find((k) => k.subjectId === t.id);
    s.act("share", p, s.gm.player, { claimId: passed.id });
    s.e.inferLeaks(s.gm.player.id);
    assert.ok(
      s.e
        .knowledge(s.gm.player.id)
        .some(
          (k) =>
            k.topic === "alliance_doubt" &&
            k.subjectId === j.id &&
            k.provenance === "inference" &&
            k.confidence < 0.5,
        ),
    );
  },
);
check(
  "M backups and split assignments use the existing strategy authority",
  (s) => {
    const t = s.by("Tony"),
      p = s.by("Parvati"),
      j = s.by("Jeremy"),
      m = s.by("Michele");
    s.act("promise", s.gm.player, j, { subjectId: t.id });
    s.act("backup", s.gm.player, [j, m], { subjectId: p.id });
    assert.equal(
      s.strategy.reasoning.state(s.gm.player.id).backup.targetId,
      p.id,
    );
    s.act("split", s.gm.player, [j, m], { subjectId: p.id });
    assert.ok(s.strategy.reasoning.state(s.gm.player.id).splitPlan);
  },
);
check(
  "N broken promise remains private until a surviving listener learns owned evidence",
  (s) => {
    const t = s.by("Tony"),
      j = s.by("Jeremy");
    s.act("promise", s.gm.player, t, { subjectId: j.id });
    s.e.settlePromises({
      day: 1,
      votes: [{ voterId: s.gm.player.id, targetId: s.by("Parvati").id }],
    });
    assert.equal(s.e.promises(s.gm.player.id)[0].status, "broken");
    assert.equal(s.e.promises(t.id)[0].status, "active");
    s.memory.recordCampClaim({
      id: "attribution",
      speakerId: t.id,
      subjectId: s.gm.player.id,
      topic: "vote_attribution",
      stance: "yes",
      origin: "firsthand",
      confidence: 0.9,
      day: 1,
      proposition: { targetId: s.by("Parvati").id },
    });
    s.e.learnPromiseHistory(t.id);
    assert.equal(s.e.promises(t.id)[0].learnedOutcome, "broken");
    s.restore();
    assert.equal(s.e.promises(t.id)[0].learnedOutcome, "broken");
  },
);
check(
  "O player on bottom retains counterplans, bluffing, pressure, protection and delegation capabilities",
  (s) => {
    const caps = conversationCapabilities(s.e, s.gm.player.id, [
      s.by("Jeremy").id,
    ]).map((d) => d.type);
    for (const type of [
      "pitch",
      "ask_vote",
      "bluff",
      "threaten",
      "delegate",
      "conditional",
      "leak_test",
    ])
      assert.ok(caps.includes(type), type);
  },
);
check(
  "group participants hear distinct individual reactions and promises",
  (s) => {
    const j = s.by("Jeremy"),
      m = s.by("Michele"),
      p = s.by("Parvati"),
      t = s.by("Tony");
    s.gm.systems.allianceSystem.createAlliance({
      memberIds: [p.id, t.id],
      type: "core",
    });
    p.loyalty = 10;
    p.honesty = 10;
    p.gameplayStyle = "Competitive";
    const r = s.act("ask_vote", s.gm.player, [j, m, p], { subjectId: t.id });
    assert.equal(r.responses.length, 3);
    assert.equal(
      r.responses.find((x) => x.speakerId === p.id).stance,
      "refused",
    );
    assert.ok(
      s.memory.getCampClaims(j.id).some((k) => k.speakerId === s.gm.player.id),
    );
  },
);
check(
  "travel blocks listening at destination and no private information reaches an absent contestant",
  (s) => {
    const j = s.by("Jeremy"),
      m = s.by("Michele");
    j.campActivity = null;
    s.activity.start(j, {
      type: "travel",
      location: "waterWell",
      duration: 45,
    });
    m.campActivity = null;
    s.activity.start(m, {
      type: "idle_at_camp",
      location: "waterWell",
      duration: 300,
    });
    const r = s.act("check_in", j, m);
    assert.equal(r.invalid, "not_present");
    assert.equal(
      s.e.knowledge(m.id).filter((k) => k.topic === "personal_bond").length,
      0,
    );
  },
);
check(
  "resolved action replay and production reload never duplicate effects or reroll",
  (s) => {
    const a = s.e.action("check_in", {
        speakerId: s.gm.player.id,
        listenerIds: [s.by("Jeremy").id],
        actionId: "stable",
      }),
      one = s.e.resolve(a),
      before = JSON.stringify(s.memory.serialize());
    assert.equal(s.e.resolve(a).replay, true);
    assert.equal(JSON.stringify(s.memory.serialize()), before);
    s.restore();
    const again = s.e.resolve(a);
    assert.equal(again.replay, true);
    assert.deepEqual(again.responses, one.responses);
    assert.equal(JSON.stringify(s.memory.serialize()), before);
  },
);
check("apology is unavailable without an owned actual event", (s) => {
  assert.equal(
    conversationCapabilities(s.e, s.gm.player.id, [s.by("Jeremy").id]).some(
      (d) => d.type === "apologize",
    ),
    false,
  );
  assert.equal(
    s.act("apologize", s.gm.player, s.by("Jeremy"), { eventId: "invented" })
      .invalid,
    "unowned_event",
  );
});
check("threats are risky and characters can resist instead of obeying", (s) => {
  const j = s.by("Jeremy");
  j.gameplayStyle = "Power Player";
  j.aggression = 10;
  const before = s.gm.getTrust(j.id, s.gm.player.id),
    r = s.act("threaten", s.gm.player, j);
  assert.equal(r.responses[0].stance, "resist");
  assert.ok(s.gm.getTrust(j.id, s.gm.player.id) < before);
});
check(
  "idol truth, denial, concealment and bluff are symmetric and epistemically isolated",
  (s) => {
    const j = s.by("Jeremy");
    assert.equal(s.act("idol_reveal", s.gm.player, j).invalid, "no_idol");
    s.act("idol_bluff", s.gm.player, j);
    const claim = s.e
      .knowledge(j.id)
      .find((k) => k.topic === "idol_possession");
    assert.equal(claim.provenance, "direct_statement");
    assert.equal(claim.truthfulness, undefined);
    s.act("idol_conceal", s.gm.player, j);
    assert.equal(s.e.knowledge(s.by("Sandra").id).length, 0);
  },
);
check("all six gameplay styles have distinct strategy profiles", (s) => {
  const styles = [
      "Social Genius",
      "Power Player",
      "Shadow Strategist",
      "Competitive",
      "Wildcard",
      "Lethal Charmer",
    ],
    profiles = styles.map((gameplayStyle) =>
      conversationCharacter({ gameplayStyle }),
    );
  assert.equal(
    new Set(
      profiles.map((p) =>
        JSON.stringify([
          p.visibilityTolerance,
          p.delegationDrive,
          p.pressureDrive,
          p.consensusNeed,
          p.coverDrive,
          p.shieldValue,
          p.repairDrive,
          p.flexibility,
        ]),
      ),
    ).size,
    6,
  );
  assert.ok(profiles[1].pressureDrive > profiles[0].pressureDrive);
  assert.ok(profiles[2].delegationDrive > profiles[3].delegationDrive);
  assert.ok(profiles[4].flexibility > profiles[5].flexibility);
});
check(
  "Tribal uses individual actual intentions rather than planner objectives",
  (s) => {
    const sand = s.by("Sandra"),
      t = s.by("Tony"),
      p = s.by("Parvati");
    s.e.objectives.establish(sand.id, {
      type: "blindside",
      targetId: t.id,
      explicit: true,
    });
    s.strategy.updateNpcIntentTarget(sand.id, p.id, {
      absoluteConfidence: 0.9,
    });
    const tribal = new TribalCouncilSystem(s.gm, { publish() {} });
    tribal.buildTribeContext(1);
    assert.equal(s.strategy.getNpcTargetIntent(sand.id).targetId, p.id);
    assert.equal(s.e.objectives.objective(sand.id).targetId, t.id);
  },
);
