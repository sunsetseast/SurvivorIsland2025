import test from "node:test";
import assert from "node:assert/strict";
import { makeScrambleQa } from "../qa/ScrambleSimulationHarness.mjs";
import { quiet } from "../qa/LivingCampSimulationHarness.mjs";
import {
  buildPlayerScrambleRead,
  buildNearbyScramble,
  contextualScrambleChoices,
  scrambleCountdown,
  formatScrambleSpeech,
} from "../src/modules/ui/ScramblePresentation.js";
import { scrambleNodes } from "../src/modules/systems/ScrambleConversation.js";
function fixture() {
  const s = quiet(() => makeScrambleQa({ seed: 79 }));
  s.idle();
  s.memory.deserialize({});
  const [a, b, c, d] = s.activity.npcs();
  const say = (
    id,
    speaker,
    subject,
    topic = "target",
    stance = "consider",
    extra = {},
  ) =>
    s.memory.recordCampClaim({
      id,
      speakerId: speaker.id,
      listenerIds: [s.gm.player.id],
      subjectId: subject.id,
      topic,
      stance,
      day: s.gm.day,
      campTime: s.gm.dayTimer,
      ...extra,
    });
  return { ...s, a, b, c, d, say, read: () => buildPlayerScrambleRead(s.gm) };
}
const check = (title, f) => test(title, () => quiet(() => f(fixture())));
for (const [seconds, text, tier] of [
  [3600, "60:00", "open"],
  [1200, "20:00", "close"],
  [600, "10:00", "urgent"],
  [300, "05:00", "final"],
  [120, "02:00", "last"],
  [-1, "00:00", "last"],
])
  test(`semantic countdown ${seconds}`, () =>
    assert.deepEqual(scrambleCountdown(seconds), {
      text,
      tier,
      label: seconds <= 300 ? "Final scramble" : "Tribal in",
    }));
check("direct lean and pledge keep source/maturity without tally", (s) => {
  s.say("lean", s.a, s.c, "target", "lean");
  s.say("commit", s.b, s.c, "commitment", "yes");
  const r = s.read();
  assert.equal(r.names.length, 1);
  assert.match(r.names[0].lines[0].text, /is leaning/);
  assert.match(r.names[0].lines[1].text, /said they’re voting/);
  assert.ok(!JSON.stringify(r).includes("confidence"));
});
check("hedge is not a promise", (s) => {
  s.say("hedge", s.a, s.c, "commitment", "hedge");
  assert.equal(s.read().promisesToYou.length, 0);
});
check("self-owned cover promise is remembered without lie flag", (s) => {
  s.memory.recordCampClaim({
    id: "cover",
    speakerId: s.gm.player.id,
    listenerIds: [s.a.id],
    subjectId: s.c.id,
    topic: "commitment",
    stance: "yes",
    truthfulness: false,
    day: s.gm.day,
  });
  assert.equal(s.read().yourPromises.length, 1);
  assert.ok(!JSON.stringify(s.read()).includes("truthfulness"));
});
check("two incompatible player promises remain", (s) => {
  for (const [id, npc, target] of [
    ["first", s.a, s.c],
    ["second", s.b, s.d],
  ])
    s.memory.recordCampClaim({
      id,
      speakerId: s.gm.player.id,
      listenerIds: [npc.id],
      subjectId: target.id,
      topic: "commitment",
      stance: "yes",
      day: s.gm.day,
    });
  assert.equal(s.read().yourPromises.length, 2);
});
check("hearsay and direct correction make neutral different stories", (s) => {
  s.say("hearsay", s.a, s.c, "target", "consider", { attributedId: s.b.id });
  s.say("direct", s.b, s.d, "commitment", "yes");
  const r = s.read();
  assert.equal(r.contradictions.length, 1);
  assert.match(
    r.contradictions[0].text,
    new RegExp(`${s.a.firstName} says ${s.b.firstName}`),
  );
  assert.ok(!JSON.stringify(r).includes("lying"));
});
check("repeated same account does not invent a second vote", (s) => {
  s.say("one", s.a, s.c);
  s.say("two", s.a, s.c);
  assert.equal(s.read().contradictions.length, 0);
  assert.equal(s.read().names[0].lines.length, 1);
});
check("warning/reassurance remain unresolved without safety score", (s) => {
  s.say("safe", s.a, s.gm.player, "safety", "yes");
  s.say("warning", s.b, s.gm.player, "safety", "warned");
  assert.equal(s.read().warnings.length, 2);
  assert.ok(
    !JSON.stringify(s.read()).match(/safetyBelief|blindside|probability/),
  );
});
check("disclosed outsider coalition remains a claim", (s) => {
  s.say("disclosure", s.a, s.a, "alliance_disclosure", "yes", {
    memberIds: [s.a.id, s.b.id],
  });
  assert.match(s.read().coalitionClaims[0].text, /may be working together/);
});
check("denial remains remembered wording, not roster truth", (s) => {
  s.say("denial", s.a, s.a, "alliance_disclosure", "denied", {
    memberIds: [s.a.id, s.b.id],
  });
  assert.match(s.read().coalitionClaims[0].text, /aren’t working together/);
});
check("unheard votes/splits/backups/safety stay absent", (s) => {
  s.memory.recordCampClaim({
    id: "hidden",
    speakerId: s.a.id,
    listenerIds: [s.b.id],
    subjectId: s.d.id,
    topic: "backup",
    stance: "yes",
    day: s.gm.day,
  });
  s.strategy.reasoning.state(s.a.id).safetyBelief = 0.01;
  s.strategy.reasoning.state(s.a.id).backup = { targetId: s.d.id };
  assert.equal(s.read().names.length, 0);
  assert.equal(s.read().warnings.length, 0);
});
check("projection cannot read NPC strategic states", (s) => {
  const states = s.strategy.reasoning.states;
  s.strategy.reasoning.states = new Proxy(states, {
    get(target, key) {
      if (key !== String(s.gm.player.id)) throw Error("hidden read");
      return target[key];
    },
  });
  assert.doesNotThrow(() => s.read());
  s.strategy.reasoning.states = states;
});
check("secret outsider alliance is absent", (s) => {
  const a = s.gm.systems.allianceSystem.createAlliance({
    memberIds: [s.a.id, s.b.id],
    type: "final_two",
    name: "Unheard pair",
  });
  assert.ok(!s.read().alliances.some((r) => r.key === a.id));
});
check("fake sincerity/priority does not change known notebook", (s) => {
  const a = s.gm.systems.allianceSystem.getAlliance("qa-core"),
    before = s.read();
  a.memberStates[s.a.id].sincerity = "fake";
  a.memberStates[s.a.id].priority = 0.03;
  a.memberStates[s.a.id].commitment = 0.01;
  assert.deepEqual(s.read(), before);
});
check("secret exclusion leaves bottom player read intact", (s) => {
  const A = s.gm.systems.allianceSystem,
    before = s.read().alliances;
  assert.ok(
    A.exclude({
      allianceId: "qa-core",
      proposerId: s.a.id,
      memberId: s.gm.player.id,
      participantIds: [s.a.id, s.b.id, s.c.id],
    }),
  );
  assert.equal(
    A.getAlliance("qa-core").memberStates[s.gm.player.id].status,
    "excluded",
  );
  assert.deepEqual(s.read().alliances, before);
});
check("own current plan never assigns player ballot", (s) => {
  s.strategy.reasoning.state(s.gm.player.id).intendedVoteId = s.d.id;
  assert.equal(s.read().currentPlan, s.d.firstName);
  assert.equal(s.gm.player.vote, undefined);
});
check("repeated rendering preserves semantic state/RNG", (s) => {
  s.say("owned", s.a, s.b);
  const before = JSON.stringify([
    s.memory.serialize(),
    s.strategy.serialize(),
    s.gm.systems.allianceSystem.serialize(),
  ]);
  s.read();
  s.read();
  assert.equal(
    JSON.stringify([
      s.memory.serialize(),
      s.strategy.serialize(),
      s.gm.systems.allianceSystem.serialize(),
    ]),
    before,
  );
});
check("production restore reconstructs owned notebook", (s) => {
  s.say("owned", s.a, s.b);
  s.say("second", s.c, s.d, "commitment", "yes");
  const before = s.read();
  s.restore();
  assert.deepEqual(s.read(), before);
});
check("routine arrival omitted; repeated observed pair retained", (s) => {
  for (let i = 0; i < 2; i++)
    s.memory.recordCampObservation({
      id: `observed-${i}`,
      actorId: s.a.id,
      participantIds: [s.b.id],
      witnessIds: [s.gm.player.id],
      type: "seen_together",
      location: "beach",
      day: s.gm.day,
      campTime: 3500 - i * 200,
    });
  s.memory.recordCampObservation({
    id: "arrival",
    actorId: s.d.id,
    witnessIds: [s.gm.player.id],
    type: "arrived",
    location: "beach",
    day: s.gm.day,
  });
  assert.equal(s.read().observations.length, 1);
  assert.match(s.read().observations[0].text, /more than once/);
});
check("actual linked conversation becomes one quiet group", (s) => {
  s.activity.start(s.a, {
    type: "strategy_conversation",
    targetId: s.b.id,
    location: "beach",
    duration: 300,
  });
  const pair = buildNearbyScramble(s.gm, "beach").groups.find((g) =>
    g.members.some((p) => p.id === s.a.id),
  );
  assert.equal(pair.members.length, 2);
  assert.match(pair.label, /quietly/);
  assert.equal(pair.meetingId, null);
});
check("travel does not render destination arrival", (s) => {
  s.activity.start(s.a, {
    type: "travel",
    fromLocation: "beach",
    location: "waterWell",
    route: ["beach", "waterWell"],
    duration: 120,
  });
  assert.ok(
    !buildNearbyScramble(s.gm, "waterWell").groups.some((g) =>
      g.members.some((p) => p.id === s.a.id),
    ),
  );
});
check("distant invitation is unavailable", (s) => {
  s.activity.start(s.a, {
    type: "idle_at_camp",
    location: "waterWell",
    duration: 300,
  });
  s.strategy.scramble.invitation = { npcId: s.a.id, activityId: "remote" };
  assert.equal(buildNearbyScramble(s.gm, "beach").invitation, null);
});
check("present invitation exposes identity, not motive", (s) => {
  s.strategy.scramble.invitation = {
    npcId: s.a.id,
    activityId: "present",
    purpose: "reassure_target",
    agenda: { primarySubject: s.gm.player.id },
  };
  const r = buildNearbyScramble(s.gm, "beach").invitation;
  assert.equal(r.name, s.a.firstName);
  assert.ok(!JSON.stringify(r).includes("reassure_target"));
});
check("unheard private group cannot be labelled alliance", (s) => {
  s.strategy.scramble.meetings = [
    {
      id: "secret",
      allianceId: "unheard",
      status: "active",
      location: "beach",
      memberIds: [s.a.id, s.b.id],
    },
  ];
  s.activity.start(s.a, {
    type: "alliance_meeting",
    location: "beach",
    targetId: s.b.id,
    duration: 300,
  });
  assert.ok(
    buildNearbyScramble(s.gm, "beach").groups.every(
      (g) => !g.label.includes("alliance"),
    ),
  );
});
test("bounded context uses owned evidence and uncommitted exit", () => {
  const nodes = [
    "vote_read",
    "numbers_read",
    "verify:x",
    "confront:y",
    "share:z",
    "commit:3",
    "counter:4",
    "not_commit",
  ].map((id) => ({
    id,
    buttonText: id,
    playerLine: id === "commit:3" ? "I’m voting Three." : id,
  }));
  const r = contextualScrambleChoices(
    nodes,
    [{ speakerId: 2, attributedId: 2, subjectId: 3, topic: "target" }],
    2,
  );
  assert.ok(r.length <= 6);
  assert.ok(r.some((n) => n.id === "not_commit"));
  assert.ok(r.some((n) => n.id === "numbers_read"));
});
test("resolved context choices cannot replay", () =>
  assert.deepEqual(
    contextualScrambleChoices(
      [{ id: "vote_read" }, { id: "not_commit" }],
      [],
      2,
      { vote_read: { line: "done" } },
    ).map((n) => n.id),
    ["not_commit"],
  ));
test("context commitment displays actual player promise", () =>
  assert.equal(
    contextualScrambleChoices(
      [
        {
          id: "commit:3",
          buttonText: "Commit",
          playerLine: "I’m voting Three.",
        },
      ],
      [{ speakerId: 2, subjectId: 3, topic: "target" }],
      2,
    )[0].buttonText,
    "I’m voting Three.",
  ));
check("who else shares only actual speaker-owned evidence", (s) => {
  const m = s.strategy.reasoning;
  s.say("context", s.a, s.c);
  s.memory.recordCampClaim({
    id: "number",
    speakerId: s.b.id,
    listenerIds: [s.a.id],
    subjectId: s.c.id,
    topic: "commitment",
    stance: "yes",
    day: s.gm.day,
  });
  s.activity.beginConversation(s.a, { location: "beach", strategy: true });
  const n = scrambleNodes(m, { player: s.gm.player, npc: s.a }).find(
    (n) => n.id === "numbers_read",
  );
  assert.ok(n);
  const r = n.semanticResolve(() => 0);
  assert.match(r.line, new RegExp(s.b.firstName));
  assert.ok(
    s.memory.getCampClaims(s.gm.player.id).some((e) => e.id === "number"),
  );
  assert.ok(!r.line.includes(s.d.firstName));
});
check(
  "resumed reservation retains existing non-interruptible group and checkpoint",
  (s) => {
    assert.ok(
      s.activity.beginConversation(s.a, { location: "beach", strategy: true }),
    );
    s.activity.reserveConversationGroup([s.b.id, s.c.id]);
    const before = JSON.stringify(s.activity.conversation.checkpoint);
    s.restore();
    s.activity.reserveConversationGroup(s.activity.conversation.groupIds);
    assert.deepEqual(s.activity.conversation.groupIds, [s.b.id, s.c.id]);
    assert.equal(JSON.stringify(s.activity.conversation.checkpoint), before);
  },
);
check("overheard commitment is not a personal promise", (s) => {
  s.memory.recordCampClaim({
    id: "overheard",
    speakerId: s.a.id,
    listenerIds: [s.b.id],
    witnessIds: [s.gm.player.id],
    subjectId: s.c.id,
    topic: "commitment",
    stance: "yes",
    day: s.gm.day,
  });
  assert.equal(s.read().promisesToYou.length, 0);
});

test("player reference grammar is presentation-only", () => {
  const raw = "You is where my head is. I have not committed yet.";
  assert.equal(
    formatScrambleSpeech(raw),
    "Your name is where my head is. I have not committed yet.",
  );
  assert.equal(raw, "You is where my head is. I have not committed yet.");
});
