import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { makeScrambleQa } from "../qa/ScrambleSimulationHarness.mjs";
import { quiet } from "../qa/LivingCampSimulationHarness.mjs";
import {
  allianceOpening,
  allianceChoices,
} from "../src/modules/systems/AllianceConversation.js";
import DealConsequencesSystem from "../src/modules/systems/DealConsequencesSystem.js";
import TribalCouncilSystem from "../src/modules/systems/TribalCouncilSystem.js";

function setup() {
  const s = makeScrambleQa();
  s.strategy.scramble.meetings = [];
  s.strategy.scramble.nextApproachAt = -1;
  s.idle();
  const A = s.gm.systems.allianceSystem;
  A.reset();
  const player = s.gm.player,
    npcs = s.gm.getPlayerTribe().members.filter((p) => !p.isPlayer);
  return {
    ...s,
    A,
    player,
    npcs,
    ids: [player.id, ...npcs.map((p) => p.id)],
    trust: s.gm.systems.trustSystem,
    core(ids = [player.id, npcs[0].id, npcs[1].id], extra = {}) {
      return A.createAlliance({ memberIds: ids, type: "core", ...extra });
    },
    start(npc = npcs[0], groups = []) {
      assert.ok(
        s.activity.beginConversation(npc, {
          location: "beach",
          strategy: true,
        }),
      );
      s.activity.reserveConversationGroup(groups);
      return s.strategy.reasoning.checkpoint(s.activity.conversation);
    },
    claim(owner, accused, alliance, evidence = "evidence", extra = {}) {
      A.recordClaim({
        id: evidence,
        speakerId: owner,
        subjectId: accused,
        topic: "vote_attribution",
        stance: "yes",
        allianceId: alliance.id,
        confidence: 0.85,
        ...extra,
      });
      return evidence;
    },
  };
}
const check = (name, fn) => test(name, () => quiet(() => fn(setup())));
const json = (x) => JSON.parse(JSON.stringify(x));
function planned(s, a, assignments) {
  a.roundPlan = {
    day: s.gm.day,
    primaryTargetId: Object.values(assignments)[0],
    status: "consensus",
    participantIds: Object.keys(assignments).map(Number),
    participantCommitments: Object.fromEntries(
      Object.entries(assignments).map(([id, targetId]) => [
        id,
        { targetId, status: "committed" },
      ]),
    ),
  };
}
function outcome(s, votes, extra = {}) {
  return {
    id: "test-tribal",
    day: s.gm.day,
    attendingTribeId: 1,
    membersAtTribal: s.gm.getPlayerTribe().members.map((p) => ({ id: p.id })),
    initialVotes: votes,
    ...extra,
  };
}

check(
  "Final Two, core and majority coexist with independent member priorities",
  (s) => {
    const [a, b, c, d, e] = s.ids;
    const pair = s.core([a, b], { type: "final_two" }),
      core = s.core([a, b, c]),
      bloc = s.core([a, b, c, d, e], { type: "voting_bloc" });
    pair.memberStates[a].priority = 0.95;
    core.memberStates[a].priority = 0.8;
    bloc.memberStates[a].priority = 0.4;
    assert.equal(s.A.getAlliancesForSurvivor(a).length, 3);
    assert.deepEqual(
      s.A.getRankedAlliancesForMember(a).map((x) => x.id),
      [pair.id, core.id, bloc.id],
    );
    assert.equal(s.A.getCommittedAllianceId(a), pair.id);
  },
);
check("compatibility commitment does not erase competing priorities", (s) => {
  const a = s.core(),
    b = s.core(s.ids.slice(0, 2), { type: "final_two" }),
    before = a.memberStates[s.player.id].priority;
  s.A.commitToAlliance({ survivorId: s.player.id, allianceId: b.id });
  assert.equal(a.memberStates[s.player.id].priority, before);
});
check(
  "membership remains a claim while affinity is asymmetric for fake members",
  (s) => {
    const [a, b] = s.ids,
      p = s.core([a, b], { sincerityMap: { [b]: "fake" } });
    assert.ok(s.A.areAllied(a, b));
    assert.ok(s.A.getAllianceAffinity(a, b) > 0.5);
    assert.ok(s.A.getAllianceAffinity(b, a) < 0.02);
    assert.equal(p.memberStates[b].sincerity, "fake");
  },
);
check("Tribal alliance protection uses the voter perspective", (s) => {
  const [a, b] = s.ids;
  s.core([a, b], { sincerityMap: { [b]: "fake" } });
  const t = new TribalCouncilSystem(s.gm, { publish() {} });
  assert.equal(t._inSameAlliance(a, b), true);
  assert.equal(t._inSameAlliance(b, a), false);
});
check("fake member can reassure without gaining real commitment", (s) => {
  const [a, b] = s.ids,
    p = s.core([a, b], { sincerityMap: { [b]: "fake" } }),
    before = json(p.memberStates[b]);
  assert.match(s.A.recommit(b, p.id), /work with/);
  assert.deepEqual(p.memberStates[b], before);
});
check(
  "fake NPC Final Two offer creates a pact without leaking private sincerity",
  (s) => {
    const [player, npc] = s.ids,
      p = s.A.propose({
        id: "offer",
        proposerId: npc,
        receiverId: player,
        type: "final_two",
        sincerity: "fake",
      }),
      cp = s.start();
    cp.allianceProposalId = p.id;
    const ctx = { gm: s.gm, player: s.player, npc: s.npcs[0], context: {}, cp };
    const opening = allianceOpening(ctx),
      accept = allianceChoices(ctx).find((n) => n.id.endsWith(":accept")),
      answer = accept.resolve(() => 0.5),
      pact = s.A.getAlliance(p.allianceId);
    assert.equal(pact.memberStates[npc].sincerity, "fake");
    assert.ok(pact.linkedDealIds.length);
    assert.doesNotMatch(
      JSON.stringify([
        ...opening,
        ...answer.lines,
        ...s.A.getKnownAlliances(player),
      ]),
      /fake|sincerity|loyalty|priority|cohesion/,
    );
  },
);
check("offer questions do not imply consent", (s) => {
  const p = s.A.propose({ proposerId: s.npcs[0].id, receiverId: s.player.id }),
    cp = s.start();
  cp.allianceProposalId = p.id;
  allianceChoices({
    gm: s.gm,
    player: s.player,
    npc: s.npcs[0],
    context: {},
    cp,
  })
    .find((n) => n.id.endsWith(":question"))
    .resolve(() => 0);
  assert.equal(p.status, "pending");
  assert.equal(s.A.alliances.length, 0);
});
for (const choice of ["hedge", "decline"])
  check(`${choice} does not create alliance membership`, (s) => {
    const p = s.A.propose({
      proposerId: s.player.id,
      receiverId: s.npcs[0].id,
    });
    s.A.respond(p.id, { choice });
    assert.equal(s.A.alliances.length, 0);
  });
check("formal endgame promise links to the same coalition", (s) => {
  const p = s.A.propose({
    proposerId: s.player.id,
    receiverId: s.npcs[0].id,
    type: "final_two",
  });
  s.A.respond(p.id, { choice: "accept" });
  const a = s.A.getAlliance(p.allianceId);
  for (const id of a.linkedDealIds)
    assert.equal(
      s.gm.systems.dealSystem.getDealById(id).terms.allianceId,
      a.id,
    );
});
check(
  "secret core inside a majority does not become outsider knowledge",
  (s) => {
    const majority = s.core(s.ids.slice(0, 5)),
      core = s.core(s.ids.slice(0, 3));
    assert.equal(
      s.A.getKnownAlliances(s.ids[3]).some((a) => a.id === core.id),
      false,
    );
    assert.ok(
      s.A.getKnownAlliances(s.ids[3]).some((a) => a.id === majority.id),
    );
  },
);
check("individual recruitment consent is required", (s) => {
  const a = s.core(s.ids.slice(0, 2)),
    p = s.A.proposeRecruitment({
      allianceId: a.id,
      proposerId: s.player.id,
      candidateId: s.ids[2],
    });
  assert.ok(p);
  assert.equal(a.memberIds.includes(s.ids[2]), false);
  s.A.respondRecruitment(p.id, { choice: "accept" });
  assert.ok(a.memberIds.includes(s.ids[2]));
});
check(
  "recruitment rejection leaves roster unchanged and belongs to the approacher",
  (s) => {
    const a = s.core(s.ids.slice(0, 2)),
      p = s.A.proposeRecruitment({
        allianceId: a.id,
        proposerId: s.player.id,
        candidateId: s.ids[2],
      });
    s.A.respondRecruitment(p.id, { choice: "decline" });
    assert.deepEqual(new Set(a.memberIds), new Set(s.ids.slice(0, 2)));
    assert.equal(
      s.A.claims(s.ids[3]).some((c) => c.id === `${p.id}:response`),
      false,
    );
  },
);
check("remote recruitment response cannot join a candidate", (s) => {
  const a = s.core(s.ids.slice(0, 2)),
    p = s.A.proposeRecruitment({
      allianceId: a.id,
      proposerId: s.player.id,
      candidateId: s.ids[2],
    });
  s.activity.start(s.npcs[1], {
    type: "travel",
    location: "waterWell",
    duration: 45,
  });
  assert.equal(s.A.respondRecruitment(p.id, { choice: "accept" }), null);
  assert.equal(a.memberIds.length, 2);
});
check("group members each evaluate formation independently", (s) => {
  let calls = 0;
  const a = s.A.formGroup({
    proposerId: s.player.id,
    participantIds: s.ids.slice(1, 4),
    random: () => [0, 0.99, 0.99, 0, 0.99][calls++] ?? 0.99,
  });
  assert.ok(a);
  assert.ok(a.memberIds.length < 4);
  assert.equal(
    s.A.claims(s.ids[4]).some((c) => c.topic === "alliance_response"),
    false,
  );
});
check("Final Three requires all three consents", (s) => {
  let calls = 0;
  const a = s.A.formGroup({
    proposerId: s.player.id,
    participantIds: s.ids.slice(1, 3),
    type: "final_three",
    random: () => [0, 0.99, 0.99][calls++] ?? 0.99,
  });
  assert.equal(a, null);
});
check("overlap does not block proposing a Final Two inside a core", (s) => {
  s.core();
  assert.ok(
    s.A.propose({
      proposerId: s.player.id,
      receiverId: s.ids[1],
      type: "final_two",
    }),
  );
});
check(
  "proposal requires actual contact rather than destination storage",
  (s) => {
    s.activity.start(s.npcs[0], {
      type: "travel",
      location: "beach",
      duration: 45,
    });
    assert.equal(
      s.A.propose({ proposerId: s.player.id, receiverId: s.ids[1] }),
      null,
    );
  },
);
check("capacity and duplicate guards bound alliance formation", (s) => {
  for (const type of ["core", "final_two", "voting_bloc", "temporary"])
    s.core(s.ids.slice(0, 2), { type });
  assert.equal(s.A.npcMotive(s.ids[1], s.ids[2]), null);
  assert.equal(
    s.A.createAlliance({ memberIds: s.ids.slice(0, 2), type: "core" }).id,
    s.A.alliances[0].id,
  );
});
check("meeting conflict chooses personal priority plus urgency", (s) => {
  const left = s.core(s.ids.slice(0, 3)),
    right = s.core([s.ids[0], s.ids[1], s.ids[3]]);
  left.memberStates[s.ids[1]].priority = 0.9;
  right.memberStates[s.ids[1]].priority = 0.2;
  const meetings = [
    { id: "L", allianceId: left.id, memberIds: left.memberIds, urgency: 0.5 },
    { id: "R", allianceId: right.id, memberIds: right.memberIds, urgency: 1 },
  ];
  assert.equal(s.A.chooseMeeting(s.ids[1], meetings).id, "L");
});
check(
  "resolved healthy meeting is not scheduled just because membership exists",
  (s) => {
    const a = s.core();
    for (const id of a.memberIds) {
      const state = s.strategy.reasoning.state(id);
      state.intendedVoteId = s.ids[4];
      state.safetyBelief = 0.9;
    }
    a.roundPlan = { day: s.gm.day, status: "consensus" };
    assert.equal(s.A.getMeetingNeed(a.id), null);
  },
);
check("disagreement provides a real meeting need", (s) => {
  const a = s.core();
  s.strategy.reasoning.state(s.ids[1]).intendedVoteId = s.ids[4];
  s.strategy.reasoning.state(s.ids[2]).intendedVoteId = s.ids[3];
  assert.equal(s.A.getMeetingNeed(a.id).reason, "disagreement");
});
check("every attending member contributes to autonomous negotiation", (s) => {
  const a = s.core(s.ids.slice(1, 4)),
    people = a.memberIds.map((id) => s.A.person(id));
  s.A.resolveMeeting(
    a.id,
    people,
    { id: "alliance-meeting", allianceId: a.id },
    () => 0.99,
  );
  for (const id of a.memberIds)
    assert.ok(
      s.A.claims(id).some((c) => c.id === `alliance-meeting:position:${id}`),
    );
  assert.deepEqual(a.roundPlan.participantIds, a.memberIds);
});
check(
  "interactive group opening has several speakers and preserves preferences",
  (s) => {
    const a = s.core(),
      cp = s.start(s.npcs[0], [s.ids[2]]);
    cp.allianceId = a.id;
    const before = s.strategy.reasoning.state(s.ids[2]).preferredTargetId;
    const lines = allianceOpening({
      gm: s.gm,
      player: s.player,
      npc: s.npcs[0],
      context: { allianceId: a.id },
      cp,
    });
    assert.equal(lines.length, 2);
    assert.notEqual(lines[0].name, lines[1].name);
    assert.equal(
      s.strategy.reasoning.state(s.ids[2]).preferredTargetId,
      before,
    );
  },
);
check(
  "supporting one speaker does not force the other member to commit",
  (s) => {
    const a = s.core(),
      cp = s.start(s.npcs[0], [s.ids[2]]);
    cp.allianceId = a.id;
    cp.groupPositions = { [s.ids[1]]: s.ids[4], [s.ids[2]]: s.ids[3] };
    const other = s.strategy.reasoning.state(s.ids[2]);
    other.preferredTargetId = s.ids[3];
    other.intendedVoteId = s.ids[3];
    other.committedTargetId = s.ids[3];
    s.trust.setTrust(s.ids[2], s.player.id, 0);
    const node = allianceChoices({
      gm: s.gm,
      player: s.player,
      npc: s.npcs[0],
      context: {},
      cp,
    }).find((n) => n.id.startsWith(`support:${s.ids[1]}:`));
    node.resolve(() => 0);
    assert.notEqual(other.intendedVoteId, s.ids[4]);
    assert.equal(a.roundPlan.participantCommitments[s.ids[2]], undefined);
  },
);
check(
  "semantic alliance choices charge time only at conversation completion",
  (s) => {
    const cp = s.start(),
      before = s.gm.dayTimer,
      p = s.A.propose({ proposerId: s.ids[1], receiverId: s.player.id });
    cp.allianceProposalId = p.id;
    const ctx = { gm: s.gm, player: s.player, npc: s.npcs[0], context: {}, cp },
      node = allianceChoices(ctx).find((n) => n.id.endsWith(":accept"));
    s.strategy.reasoning.choice(node.id, node.resolve);
    for (let i = 0; i < 10; i++) s.A.getKnownAlliances(s.player.id);
    assert.equal(s.gm.dayTimer, before);
    s.activity.finishConversation({ strategy: true });
    assert.ok(s.gm.dayTimer < before);
  },
);
check(
  "secret exclusion preserves a bottom member’s beliefs and notebook",
  (s) => {
    const a = s.core(s.ids.slice(0, 5)),
      before = json(s.A.getKnownAlliances(s.player.id));
    const p = s.A.exclude({
      allianceId: a.id,
      proposerId: s.ids[1],
      memberId: s.player.id,
      participantIds: s.ids.slice(1, 4),
    });
    assert.ok(p);
    assert.equal(a.memberStates[s.player.id].status, "excluded");
    assert.equal(a.memberStates[s.player.id].believesAllianceActive, true);
    assert.deepEqual(s.A.getKnownAlliances(s.player.id), before);
    assert.ok(s.A.getAllianceAffinity(s.player.id, s.ids[1]) > 0.5);
  },
);
check("excluded member is absent from operational meetings", (s) => {
  const a = s.core(s.ids.slice(0, 4));
  s.A.exclude({
    allianceId: a.id,
    proposerId: s.ids[1],
    memberId: s.player.id,
    participantIds: s.ids.slice(1, 4),
  });
  assert.equal(s.A.localMembers(a).includes(s.player.id), false);
});
check("a single member cannot unilaterally exclude a third member", (s) => {
  const a = s.core();
  assert.equal(
    s.A.exclude({
      allianceId: a.id,
      proposerId: s.player.id,
      memberId: s.ids[2],
    }),
    null,
  );
  assert.equal(a.memberStates[s.ids[2]].status, "active");
});
check("credible exclusion disclosure permits warning and counterplay", (s) => {
  const a = s.core(s.ids.slice(0, 5));
  s.A.exclude({
    allianceId: a.id,
    proposerId: s.ids[1],
    memberId: s.player.id,
    participantIds: s.ids.slice(1, 4),
  });
  s.trust.setTrust(s.player.id, s.ids[1], 95);
  s.A.recordClaim({
    speakerId: s.ids[1],
    listenerIds: [s.player.id],
    subjectId: s.player.id,
    topic: "alliance_exclusion",
    allianceId: a.id,
    stance: "yes",
    confidence: 0.95,
  });
  s.A.reactToOwnedEvidence();
  assert.equal(a.memberStates[s.player.id].believesAllianceActive, false);
  assert.ok(
    s.A.propose({
      proposerId: s.player.id,
      receiverId: s.ids[5],
      type: "final_two",
    }),
  );
});
check("planned split assignments are not defections", (s) => {
  const a = s.core(s.ids.slice(0, 4)),
    before = a.cohesion;
  planned(s, a, {
    [s.ids[0]]: s.ids[4],
    [s.ids[1]]: s.ids[4],
    [s.ids[2]]: s.ids[5],
    [s.ids[3]]: s.ids[5],
  });
  s.A.processPostTribalFallout(
    outcome(
      s,
      Object.entries(a.roundPlan.participantCommitments).map(
        ([voterId, p]) => ({ voterId, targetId: p.targetId }),
      ),
      { eliminatedId: s.ids[4] },
    ),
  );
  assert.equal(s.A.metrics.defections || 0, 0);
  assert.equal(a.cohesion, Math.min(100, before + 1.5));
});
check(
  "true defection changes objective history without psychic trust loss",
  (s) => {
    const a = s.core(),
      before = s.trust.getTrust(s.player.id, s.ids[1]),
      read = json(s.A.getKnownAlliances(s.player.id));
    planned(s, a, {
      [s.ids[0]]: s.ids[4],
      [s.ids[1]]: s.ids[4],
      [s.ids[2]]: s.ids[4],
    });
    s.A.processPostTribalFallout(
      outcome(s, [
        { voterId: s.ids[0], targetId: s.ids[4] },
        { voterId: s.ids[1], targetId: s.ids[5] },
        { voterId: s.ids[2], targetId: s.ids[4] },
      ]),
    );
    assert.equal(s.A.metrics.defections, 1);
    assert.equal(s.trust.getTrust(s.player.id, s.ids[1]), before);
    assert.equal(s.A.getKnownAlliances(s.player.id)[0].read, read[0].read);
    assert.deepEqual(
      a.history.find((e) => e.type === "objective_vote_outcome").defectorIds,
      [s.ids[1]],
    );
  },
);
check("fallout is idempotent through save and reload", (s) => {
  const a = s.core();
  planned(s, a, { [s.ids[1]]: s.ids[4] });
  const o = outcome(s, [{ voterId: s.ids[1], targetId: s.ids[5] }]);
  s.A.processPostTribalFallout(o);
  const before = s.A.serialize();
  s.restore();
  s.A.processPostTribalFallout(o);
  assert.deepEqual(s.A.serialize(), before);
});
check("credible discovery changes only the informed owner’s trust", (s) => {
  const a = s.core(),
    before = s.trust.getTrust(s.player.id, s.ids[1]),
    unaware = s.trust.getTrust(s.ids[2], s.ids[1]);
  s.claim(s.player.id, s.ids[1], a);
  assert.ok(
    s.A.perceiveBetrayal({
      ownerId: s.player.id,
      accusedId: s.ids[1],
      allianceId: a.id,
      evidenceId: "evidence",
    }),
  );
  assert.equal(s.trust.getTrust(s.player.id, s.ids[1]), before - 10);
  assert.equal(s.trust.getTrust(s.ids[2], s.ids[1]), unaware);
});
check(
  "wrong blame can affect trust without changing engine attribution",
  (s) => {
    const a = s.core();
    planned(s, a, { [s.ids[1]]: s.ids[4] });
    s.A.processPostTribalFallout(
      outcome(s, [{ voterId: s.ids[1], targetId: s.ids[5] }]),
    );
    s.claim(s.player.id, s.ids[2], a);
    s.A.perceiveBetrayal({
      ownerId: s.player.id,
      accusedId: s.ids[2],
      allianceId: a.id,
      evidenceId: "evidence",
    });
    assert.deepEqual(
      a.history.find((e) => e.type === "objective_vote_outcome").defectorIds,
      [s.ids[1]],
    );
    assert.ok(s.trust.getTrust(s.player.id, s.ids[2]) < 50);
  },
);
for (const confidence of [0.2, 0.54])
  check(
    `weak attribution ${confidence} does not become known betrayal`,
    (s) => {
      const a = s.core();
      s.claim(s.player.id, s.ids[1], a, "weak", { confidence });
      assert.equal(
        s.A.perceiveBetrayal({
          ownerId: s.player.id,
          accusedId: s.ids[1],
          allianceId: a.id,
          evidenceId: "weak",
        }),
        false,
      );
    },
  );
check("a challenged accusation does not punish its subject", (s) => {
  const a = s.core();
  s.claim(s.player.id, s.ids[1], a);
  s.A.claims(s.player.id).find((e) => e.id === "evidence").challenged = true;
  assert.equal(
    s.A.perceiveBetrayal({
      ownerId: s.player.id,
      accusedId: s.ids[1],
      allianceId: a.id,
      evidenceId: "evidence",
    }),
    false,
  );
});
check("unknown side alliance never enters another owner’s notebook", (s) => {
  const a = s.core(s.ids.slice(1, 4));
  assert.deepEqual(s.A.getKnownAlliances(s.player.id), []);
  assert.equal(
    s.A.claims(s.player.id).some((e) => e.allianceId === a.id),
    false,
  );
});
check("direct disclosure reaches its listener but no other outsiders", (s) => {
  const a = s.core(s.ids.slice(1, 3));
  s.A.disclose({
    speakerId: s.ids[1],
    listenerId: s.player.id,
    allianceId: a.id,
  });
  assert.ok(
    s.A.claims(s.player.id).some((e) => e.topic === "alliance_disclosure"),
  );
  assert.equal(
    s.A.claims(s.ids[3]).some((e) => e.allianceId === a.id),
    false,
  );
  assert.deepEqual(s.A.getKnownAlliances(s.player.id), []);
});
check(
  "alliance denial can be believed without exposing the speaker’s lie flag",
  (s) => {
    const a = s.core(s.ids.slice(1, 3));
    s.A.disclose({
      speakerId: s.ids[1],
      listenerId: s.player.id,
      allianceId: a.id,
      deny: true,
    });
    const e = s.A.claims(s.player.id).find(
      (e) => e.topic === "alliance_disclosure",
    );
    assert.equal(e.stance, "denied");
    assert.equal(e.truthfulness, undefined);
    assert.ok(s.A.areAllied(s.ids[1], s.ids[2]));
  },
);
check(
  "one witnessed meeting is not confirmation, repeated meetings remain inference",
  (s) => {
    const record = (id) =>
      s.memory.recordCampObservation({
        id,
        actorId: s.ids[1],
        participantIds: [s.ids[2], s.ids[3]],
        witnessIds: [s.player.id],
        type: "seen_together",
        location: "beach",
        day: s.gm.day,
        confidence: 0.8,
      });
    record("one");
    assert.equal(s.A.inferAlliances(s.player.id).length, 0);
    record("two");
    const [suspected] = s.A.inferAlliances(s.player.id);
    assert.equal(suspected.provenance, "inference");
    assert.ok(suspected.confidence < 0.5);
    assert.equal(suspected.allianceId, undefined);
  },
);
check("member addition preserves accumulated cohesion consequences", (s) => {
  const a = s.core(s.ids.slice(0, 2));
  a.cohesion = 17;
  s.A.addMember(a.id, s.ids[2]);
  assert.equal(a.cohesion, 15);
});
check("member departure preserves accumulated cohesion consequences", (s) => {
  const a = s.core();
  a.cohesion = 17;
  s.A.removeMember(a.id, s.ids[2]);
  assert.equal(a.cohesion, 12);
});
check("private distancing does not rewrite other members’ beliefs", (s) => {
  const a = s.core(),
    before = json(a.memberStates[s.ids[1]]);
  s.A.distance(s.player.id, a.id);
  assert.deepEqual(a.memberStates[s.ids[1]], before);
  assert.equal(a.memberStates[s.player.id].status, "active");
});
check("communicated departure has listener-specific consequences", (s) => {
  const a = s.core(),
    before = s.trust.getTrust(s.ids[2], s.player.id);
  s.A.leave({
    memberId: s.player.id,
    allianceId: a.id,
    listenerIds: [s.ids[1]],
  });
  assert.equal(s.trust.getTrust(s.ids[2], s.player.id), before);
  assert.equal(
    s.A.claims(s.ids[2]).some((e) => e.topic === "alliance_departure"),
    false,
  );
});
check(
  "unknown disbandment does not erase an uninformed member’s loyalty",
  (s) => {
    const a = s.core(),
      before = s.A.getAllianceAffinity(s.player.id, s.ids[1]);
    s.A.disbandAlliance(a.id, "secret");
    assert.equal(s.A.getAllianceAffinity(s.player.id, s.ids[1]), before);
    assert.equal(s.A.getKnownAlliances(s.player.id)[0].read, "Working");
  },
);
check("private nickname remains private", (s) => {
  const a = s.core();
  s.A.updateAllianceName(a.id, "My private trio", s.player.id);
  assert.equal(
    s.A.getAllianceDisplayName(a.id, s.player.id),
    "My private trio",
  );
  assert.notEqual(
    s.A.getAllianceDisplayName(a.id, s.ids[1]),
    "My private trio",
  );
});
check(
  "swap dormancy preserves history and prevents cross-tribe meetings",
  (s) => {
    const a = s.core(s.ids.slice(0, 2)),
      past = json(a.history);
    s.gm.tribes[0].members = s.gm.tribes[0].members.filter(
      (p) => p.id !== s.ids[1],
    );
    s.gm.tribes.push({ id: 2, members: [s.npcs[0]] });
    s.A.onTribeSwap();
    assert.equal(a.lifecycle, "dormant");
    assert.equal(s.A.getMeetingNeed(a.id), null);
    assert.deepEqual(a.history.slice(0, past.length), past);
    assert.equal(s.A.together(s.player.id, s.ids[1]), false);
  },
);
check(
  "merge makes reunion possible without automatic restored dominance",
  (s) => {
    const a = s.core();
    a.lifecycle = "dormant";
    const rival = s.core(s.ids.slice(0, 2), { type: "final_two" });
    rival.memberStates[s.ids[1]].priority = 0.99;
    s.gm.isMerged = true;
    s.A.onMerge();
    assert.equal(a.lifecycle, "dormant");
    s.A.resolveNpcMotive(
      s.ids[1],
      s.player.id,
      { purpose: "alliance_reunion", allianceId: a.id },
      "reunion",
    );
    assert.equal(s.A.getCommittedAllianceId(s.ids[1]), rival.id);
  },
);
check(
  "eliminated leader is replaced and historical membership remains",
  (s) => {
    const a = s.core(s.ids.slice(1, 4), { leaderId: s.ids[1] });
    s.npcs[0].isOut = true;
    s.A.onElimination(s.ids[1]);
    assert.notEqual(a.leaderId, s.ids[1]);
    assert.ok(a.memberStates[s.ids[1]]);
    assert.equal(a.memberStates[s.ids[1]].status, "eliminated");
    assert.equal(s.A.localMembers(a).includes(s.ids[1]), false);
  },
);
check("one-round bloc expires even when it never resolved a plan", (s) => {
  const a = s.core(s.ids.slice(1, 3), { type: "voting_bloc" });
  s.A.processPostTribalFallout(
    outcome(s, [
      { voterId: s.ids[1], targetId: s.ids[4] },
      { voterId: s.ids[2], targetId: s.ids[4] },
    ]),
  );
  assert.equal(a.lifecycle, "disbanded");
  assert.equal(s.A.metrics.votingBlocsExpired, 1);
});
check("Final Two persists through several ordinary Tribals", (s) => {
  const a = s.core(s.ids.slice(0, 2), { type: "final_two" });
  for (let i = 0; i < 3; i++) {
    s.gm.day = i + 1;
    planned(s, a, { [s.ids[0]]: s.ids[4], [s.ids[1]]: s.ids[4] });
    s.A.processPostTribalFallout(
      outcome(
        s,
        [
          { voterId: s.ids[0], targetId: s.ids[4] },
          { voterId: s.ids[1], targetId: s.ids[4] },
        ],
        { id: `tribal-${i}`, eliminatedId: s.ids[4] },
      ),
    );
  }
  assert.equal(a.lifecycle, "active");
});
check(
  "old-save migration preserves cohesion, sincerity, target and priority hint",
  (s) => {
    s.A.deserialize({
      alliances: [
        {
          id: "old",
          memberIds: s.ids.slice(0, 2),
          type: "final_two",
          cohesion: 23,
          sincerityMap: { [s.ids[1]]: "fake" },
          targetId: s.ids[4],
        },
      ],
      commitments: [[s.player.id, "old"]],
    });
    const a = s.A.getAlliance("old");
    assert.equal(a.cohesion, 23);
    assert.equal(a.memberStates[s.ids[1]].sincerity, "fake");
    assert.ok(a.memberStates[s.player.id].priority >= 0.8);
    assert.equal(a.roundPlan.status, "legacy_unconfirmed");
    assert.deepEqual(a.history, []);
  },
);
check("migration priority hints are idempotent", (s) => {
  const p = {
    alliances: [{ id: "old", memberIds: s.ids.slice(0, 2) }],
    commitments: [[s.player.id, "old"]],
  };
  s.A.deserialize(p);
  const before = s.A.getAlliancePriorityForMember(s.player.id, "old");
  s.A.migrateLegacyPriorityHints(p);
  assert.equal(s.A.getAlliancePriorityForMember(s.player.id, "old"), before);
});
check("proposal and recruitment survive production save/restore", (s) => {
  const a = s.core(s.ids.slice(0, 2));
  s.A.proposeRecruitment({
    allianceId: a.id,
    proposerId: s.player.id,
    candidateId: s.ids[2],
  });
  s.A.propose({
    proposerId: s.ids[3],
    receiverId: s.player.id,
    type: "final_two",
    sincerity: "fake",
  });
  const before = s.A.serialize();
  s.restore();
  assert.deepEqual(s.A.serialize(), before);
});
check(
  "group conversation semantic checkpoint survives production restore",
  (s) => {
    const a = s.core(),
      cp = s.start(s.npcs[0], [s.ids[2]]);
    cp.allianceId = a.id;
    cp.allianceTranscript = allianceOpening({
      gm: s.gm,
      player: s.player,
      npc: s.npcs[0],
      context: {},
      cp,
    });
    const before = json(cp);
    s.restore();
    assert.deepEqual(s.activity.conversation.checkpoint, before);
    assert.equal(JSON.stringify(before).includes("<div"), false);
  },
);
check(
  "secret exclusion survives save without revealing status to player",
  (s) => {
    const a = s.core(s.ids.slice(0, 5));
    s.A.exclude({
      allianceId: a.id,
      proposerId: s.ids[1],
      memberId: s.player.id,
      participantIds: s.ids.slice(1, 4),
    });
    const before = s.A.getKnownAlliances(s.player.id);
    s.restore();
    assert.deepEqual(s.A.getKnownAlliances(s.player.id), before);
    assert.equal(
      s.A.getAlliance(a.id).memberStates[s.player.id].status,
      "excluded",
    );
  },
);
check("knowledge notebook contains no secret numeric metrics", (s) => {
  s.core(s.ids.slice(0, 3), { sincerityMap: { [s.ids[1]]: "fake" } });
  const value = JSON.stringify(s.A.getKnownAlliances(s.player.id));
  assert.doesNotMatch(
    value,
    /sincerity|fake|cohesion|priority|loyalty|commitment|memberStates/,
  );
});
check("starter and manager contain no world-mutation shortcuts", () => {
  for (const file of ["CreateAllianceOverlay", "ManageAllianceOverlay"]) {
    const source = readFileSync(
      new URL(`../src/modules/screens/camp/${file}.js`, import.meta.url),
      "utf8",
    );
    assert.doesNotMatch(
      source,
      /\.createAlliance\(|\.addMember\(|\.removeMember\(|\.disbandAlliance\(|\.commitToAlliance\(/,
    );
  }
});
check("personal priority answer does not rank global cohesion", (s) => {
  const a = s.core(),
    b = s.core(s.ids.slice(0, 2), { type: "final_two" });
  a.cohesion = 99;
  b.cohesion = 5;
  b.memberStates[s.ids[1]].priority = 0.99;
  assert.match(
    s.A.priorityAnswer(s.ids[1], s.player.id, () => 0.99),
    /final two/,
  );
});
check(
  "formal vote-together terms respect negotiated split assignments",
  (s) => {
    const d = s.gm.systems.dealSystem.createDeal({
      type: "VOTE_TOGETHER",
      parties: s.ids.slice(0, 2),
      terms: { assignments: { [s.ids[0]]: s.ids[4], [s.ids[1]]: s.ids[5] } },
    });
    s.gm.systems.dealSystem.acceptDeal(d.id, s.ids[1]);
    s.gm.systems.dealSystem.processTribalOutcome(
      outcome(s, [
        { voterId: s.ids[0], targetId: s.ids[4] },
        { voterId: s.ids[1], targetId: s.ids[5] },
      ]),
    );
    assert.equal(d.status, "COMPLETED");
  },
);
check(
  "objective deal breach has no consequence without owned evidence",
  (s) => {
    const ds = s.gm.systems.dealSystem,
      d = ds.createDeal({ type: "FINAL_TWO", parties: s.ids.slice(0, 2) });
    ds.acceptDeal(d.id, s.ids[1]);
    const consequence = new DealConsequencesSystem(s.gm);
    s.gm.systems.dealConsequencesSystem = consequence;
    const before = s.trust.getTrust(s.player.id, s.ids[1]);
    ds.processTribalOutcome(
      outcome(s, [{ voterId: s.ids[1], targetId: s.player.id }]),
    );
    consequence._handleDealBroken({ deal: d });
    assert.equal(d.status, "BROKEN");
    assert.equal(s.trust.getTrust(s.player.id, s.ids[1]), before);
    assert.equal(
      ds.getKnownDealsForSurvivor(s.player.id).find((x) => x.id === d.id)
        .status,
      "ACCEPTED",
    );
  },
);
check("discovered deal breach is applied once to its informed victim", (s) => {
  const ds = s.gm.systems.dealSystem,
    d = ds.createDeal({ type: "FINAL_TWO", parties: s.ids.slice(0, 2) });
  ds.acceptDeal(d.id, s.ids[1]);
  ds.processTribalOutcome(
    outcome(s, [{ voterId: s.ids[1], targetId: s.player.id }]),
  );
  const c = new DealConsequencesSystem(s.gm);
  s.gm.systems.dealConsequencesSystem = c;
  s.A.recordClaim({
    id: "deal-evidence",
    speakerId: s.player.id,
    subjectId: s.ids[1],
    topic: "deal_breach",
    stance: "yes",
    confidence: 0.9,
    objectiveReference: d.objectiveReference,
  });
  const before = s.trust.getTrust(s.player.id, s.ids[1]);
  assert.ok(c.learnBreach(d.id, s.player.id, "deal-evidence"));
  assert.equal(c.learnBreach(d.id, s.player.id, "deal-evidence"), false);
  assert.ok(s.trust.getTrust(s.player.id, s.ids[1]) < before);
});
check("SHARE_INFO requires relevant two-way delivery", (s) => {
  const ds = s.gm.systems.dealSystem,
    d = ds.createDeal({ type: "SHARE_INFO", parties: s.ids.slice(0, 2) });
  ds.acceptDeal(d.id, s.ids[1]);
  ds.recordInformationShared(s.player.id, s.ids[1], {
    id: "one",
    topic: "target",
  });
  assert.equal(d.status, "ACCEPTED");
  ds.recordInformationShared(s.ids[1], s.player.id, {
    id: "two",
    topic: "idol_suspicion",
  });
  assert.equal(d.status, "COMPLETED");
});
check("IDOL_PROTECTION requires a relevant opportunity before breach", (s) => {
  const ds = s.gm.systems.dealSystem,
    d = ds.createDeal({
      type: "IDOL_PROTECTION",
      parties: s.ids.slice(0, 2),
      terms: {
        action: "play_idol",
        ownerId: s.player.id,
        protectedId: s.ids[1],
      },
    });
  ds.acceptDeal(d.id, s.ids[1]);
  ds.processTribalOutcome(
    outcome(s, [{ voterId: s.ids[2], targetId: s.ids[1] }], {
      idolOpportunities: [],
    }),
  );
  assert.equal(d.status, "ACCEPTED");
});
check(
  "IDOL_PROTECTION warning is fulfilled by actual relevant delivery",
  (s) => {
    const ds = s.gm.systems.dealSystem,
      d = ds.createDeal({
        type: "IDOL_PROTECTION",
        parties: s.ids.slice(0, 2),
        terms: { action: "warn" },
      });
    ds.acceptDeal(d.id, s.ids[1]);
    ds.recordInformationShared(s.player.id, s.ids[1], {
      id: "warning",
      topic: "idol_suspicion",
    });
    assert.equal(d.status, "COMPLETED");
  },
);
check(
  "legacy player fake invitation markers migrate without deleting NPC private state",
  (s) => {
    s.memory.deserialize({
      memory: {
        [s.player.id]: {
          allianceInvites: [
            {
              isFake: true,
              outcome: "fake_accept",
              perspective: "player",
              accepted: true,
            },
          ],
        },
        [s.ids[1]]: {
          allianceInvites: [
            { isFake: true, outcome: "fake_accept", perspective: "npc" },
          ],
        },
      },
    });
    assert.equal(
      s.memory.memory[s.player.id].allianceInvites[0].isFake,
      undefined,
    );
    assert.equal(
      s.memory.memory[s.player.id].allianceInvites[0].outcome,
      "accepted",
    );
    assert.equal(s.memory.memory[s.ids[1]].allianceInvites[0].isFake, true);
  },
);
