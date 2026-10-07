import test from "node:test";
import assert from "node:assert/strict";
import { makeConversationStrategyQa } from "../qa/ConversationStrategyHarness.mjs";
import { quiet } from "../qa/LivingCampSimulationHarness.mjs";
import { CONVERSATION_RESOLVER_TYPES } from "../src/modules/systems/ConversationResolver.js";
import {
  ACTION_DEFINITIONS,
  validateConversationCatalog,
  conversationCapabilities,
  actionSubjects,
} from "../src/modules/systems/ConversationActionCatalog.js";
import {
  rememberConversationTribal,
  rememberConversationChallenge,
} from "../src/modules/systems/ConversationEvents.js";
import { promisedIdolProtectionTarget } from "../src/modules/systems/ConversationProtection.js";
import TribalCouncilSystem from "../src/modules/systems/TribalCouncilSystem.js";
const check = (name, fn) =>
  test(name, () => quiet(() => fn(makeConversationStrategyQa())));
check(
  "delegated vote verification reports the voters actual named target, not the requested plan",
  (s) => {
    const sand = s.by("Sandra"),
      j = s.by("Jeremy"),
      m = s.by("Michele"),
      t = s.by("Tony"),
      p = s.by("Parvati");
    s.act("promise", m, t, { subjectId: p.id });
    s.act("delegate", sand, j, {
      subjectId: m.id,
      requestedAction: "verify_vote",
      planTargetId: t.id,
    });
    const task = s.task();
    s.wait(300);
    assert.equal(task.status, "reported");
    assert.equal(task.outcome.subjectId, p.id);
    assert.match(task.reports[0].line, /Parvati/);
    assert.ok(
      s.e
        .knowledge(sand.id)
        .some(
          (k) =>
            k.delegationId === task.id &&
            k.topic === "commitment" &&
            k.attributedId === m.id &&
            k.subjectId === p.id,
        ),
    );
  },
);
check(
  "leadership and closeness reads follow owned proposals and witnessed company",
  (s) => {
    const sand = s.by("Sandra"),
      j = s.by("Jeremy"),
      m = s.by("Michele"),
      t = s.by("Tony");
    s.act("pitch", j, sand, { subjectId: t.id });
    assert.equal(s.e.socialRead(sand.id, "leader").subjectId, j.id);
    s.memory.recordCampObservation({
      id: "real-company",
      actorId: j.id,
      participantIds: [m.id],
      witnessIds: [sand.id],
      type: "seen_together",
      location: "beach",
      day: 1,
      campTime: 3600,
    });
    assert.ok(
      [j.id, m.id].includes(s.e.socialRead(sand.id, "close").subjectId),
    );
    assert.equal(
      s.e.knowledge(s.by("Parvati").id).some((k) => k.id === "real-company"),
      false,
    );
  },
);
check(
  "a kept idol protection promise can produce a real NPC play on an endangered ally",
  (s) => {
    const j = s.by("Jeremy"),
      m = s.by("Michele"),
      sand = s.by("Sandra"),
      p = s.by("Parvati");
    j.hasIdol = true;
    j.loyalty = 10;
    j.honesty = 10;
    s.act("idol_protect", j, m);
    assert.equal(promisedIdolProtectionTarget(s.gm, j), null);
    for (const [i, speaker] of [sand, p].entries())
      s.memory.recordCampClaim({
        id: `protection-warning:${i}`,
        speakerId: speaker.id,
        listenerIds: [j.id],
        subjectId: m.id,
        topic: "safety",
        stance: "warned",
        day: 1,
        confidenceByListener: { [j.id]: 0.9 },
      });
    assert.equal(promisedIdolProtectionTarget(s.gm, j), m.id);
    assert.equal(promisedIdolProtectionTarget(s.gm, p), null);
    const tribal = new TribalCouncilSystem(s.gm, { publish() {} });
    tribal.buildTribeContext(1);
    tribal.voteRecords = [
      { voterId: sand.id, targetId: m.id, wasNullified: false },
    ];
    tribal.resolveIdolStage();
    assert.ok(
      tribal.idolPlays.some(
        (play) => play.playedById === j.id && play.playedOnId === m.id,
      ),
    );
    assert.equal(tribal.voteRecords[0].wasNullified, true);
  },
);
check(
  "verification with a third party does not invent a denial by the original source",
  (s) => {
    const sand = s.by("Sandra"),
      j = s.by("Jeremy"),
      m = s.by("Michele"),
      t = s.by("Tony");
    s.act("promise", j, m, { subjectId: t.id });
    const claim = s.e.knowledge(m.id).find((k) => k.topic === "commitment");
    const r = s.act("verify", m, sand, { claimId: claim.id });
    assert.match(r.responses[0].line, /ask Jeremy/);
    assert.equal(
      s.memory.getCampClaims(m.id).some((k) => k.refutesClaimId === claim.id),
      false,
    );
  },
);
check(
  "a requested source protection prevents casual source disclosure",
  (s) => {
    const j = s.by("Jeremy"),
      m = s.by("Michele"),
      t = s.by("Tony");
    s.act("leak_test", s.gm.player, j, { subjectId: t.id });
    s.act("secrecy", s.gm.player, j);
    const r = s.act("source", m, j, { subjectId: t.id });
    assert.match(r.responses[0].line, /source private/);
  },
);
check(
  "every catalog capability resolves once and supplies a valid continuation or end",
  () => {
    for (const definition of Object.values(ACTION_DEFINITIONS)) {
      const s = makeConversationStrategyQa(),
        player = s.gm.player,
        j = s.by("Jeremy"),
        m = s.by("Michele"),
        t = s.by("Tony"),
        p = s.by("Parvati");
      player.hasIdol = definition.type !== "idol_bluff";
      s.act("promise", player, j, { subjectId: t.id });
      s.act("check_in", player, j);
      if (player.hasIdol) s.act("idol_reveal", player, j);
      rememberConversationTribal(s.e, {
        day: 1,
        membersAtTribal: [player, j],
        votes: [{ voterId: player.id, targetId: p.id }],
      });
      if (definition.type === "report") {
        s.act("delegate", j, player, {
          subjectId: m.id,
          requestedAction: "verify_vote",
        });
        s.e.tasks.respond(s.task().id, player.id, true);
      } else
        s.act("delegate", player, j, {
          subjectId: m.id,
          planTargetId: t.id,
          requestedAction: "recruit",
        });
      const candidates = actionSubjects(s.e, definition.type, player.id, [
          j.id,
        ]),
        subject = candidates[0],
        fields = {
          actionId: `coverage:${definition.type}`,
          subjectId:
            definition.subject === "target"
              ? p.id
              : definition.subject === "person"
                ? m.id
                : null,
          claimId: definition.subject === "claim" ? subject?.id : undefined,
          eventId: definition.subject === "event" ? subject?.id : undefined,
          delegationId: definition.subject === "task" ? subject?.id : undefined,
          allegedSourceId: m.id,
          conditions:
            definition.type === "conditional"
              ? [{ kind: "known_commitment", voterId: m.id, targetId: p.id }]
              : [],
          requestedAction: "recruit",
          planTargetId: t.id,
        };
      const result = s.act(definition.type, player, j, fields);
      assert.equal(result.invalid, undefined, definition.type);
      assert.ok(result.responses.length, definition.type);
      assert.ok(result.followUps.includes("end"), definition.type);
      const before = JSON.stringify(s.memory.serialize());
      assert.equal(s.act(definition.type, player, j, fields).replay, true);
      assert.equal(
        JSON.stringify(s.memory.serialize()),
        before,
        `${definition.type} fired twice`,
      );
    }
  },
);
check(
  "graph validator rejects missing, duplicate and unreachable semantic ownership",
  () => {
    assert.match(
      validateConversationCatalog(
        CONVERSATION_RESOLVER_TYPES.filter((t) => t !== "delegate"),
      ).join(","),
      /Missing resolver: delegate/,
    );
    assert.match(
      validateConversationCatalog([
        ...CONVERSATION_RESOLVER_TYPES,
        "promise",
      ]).join(","),
      /Duplicate resolver/,
    );
    assert.match(
      validateConversationCatalog([
        ...CONVERSATION_RESOLVER_TYPES,
        "imaginary",
      ]).join(","),
      /Unreachable resolver/,
    );
  },
);
check(
  "an NPC asking the player cannot choose or disclose the humans answer",
  (s) => {
    const sand = s.by("Sandra"),
      t = s.by("Tony"),
      before = s.strategy.reasoning.state(s.gm.player.id).intendedVoteId;
    const r = s.act("ask_vote", sand, s.gm.player, { subjectId: t.id });
    assert.equal(r.responses[0].stance, "pending");
    assert.equal(
      s.strategy.reasoning.state(s.gm.player.id).intendedVoteId,
      before,
    );
    assert.equal(s.e.promises(s.gm.player.id).length, 0);
    const known = s.e
      .knowledge(sand.id)
      .filter((k) => k.speakerId === s.gm.player.id);
    assert.equal(known.length, 0);
  },
);
check(
  "human delegate must speak to the target before a truthful recruitment report exists",
  (s) => {
    const sand = s.by("Sandra"),
      m = s.by("Michele"),
      t = s.by("Tony");
    s.act("delegate", sand, s.gm.player, {
      subjectId: m.id,
      planTargetId: t.id,
      requestedAction: "recruit",
    });
    const task = s.task();
    s.e.tasks.respond(task.id, s.gm.player.id, true);
    assert.equal(task.executionReceipt, undefined);
    s.act("ask_vote", s.gm.player, m, { subjectId: t.id });
    assert.ok(task.executionReceipt);
    assert.equal(task.status, "awaiting_report");
    s.act("report", s.gm.player, sand, { delegationId: task.id });
    assert.equal(task.status, "reported");
    assert.ok(
      s.e
        .knowledge(sand.id)
        .some((k) => k.topic === "task_report" && k.delegationId === task.id),
    );
  },
);
check(
  "human delegate may fabricate a report without rewriting the target vote",
  (s) => {
    const sand = s.by("Sandra"),
      m = s.by("Michele"),
      t = s.by("Tony"),
      before = s.e.ownTarget(m.id);
    s.act("delegate", sand, s.gm.player, {
      subjectId: m.id,
      planTargetId: t.id,
      requestedAction: "recruit",
    });
    const task = s.task();
    s.e.tasks.respond(task.id, s.gm.player.id, true);
    s.act("report", s.gm.player, sand, {
      delegationId: task.id,
      truthMode: "fabrication",
    });
    assert.equal(task.reports[0].reported, "committed");
    assert.equal(s.e.ownTarget(m.id), before);
    assert.equal(
      s.memory.getCampClaims(sand.id).find((k) => k.topic === "task_report")
        .truthfulness,
      undefined,
    );
  },
);
check(
  "delegated verification transfers the actual story to the delegate while co-present",
  (s) => {
    const sand = s.by("Sandra"),
      j = s.by("Jeremy"),
      m = s.by("Michele"),
      t = s.by("Tony");
    s.act("promise", m, sand, { subjectId: t.id });
    const claim = s.e.knowledge(sand.id).find((k) => k.topic === "commitment");
    s.act("delegate", sand, j, {
      subjectId: m.id,
      requestedAction: "verify_rumor",
      claimId: claim.id,
    });
    assert.ok(s.e.knowledge(j.id).some((k) => k.id === s.task().claimId));
    assert.equal(s.e.knowledge(s.by("Parvati").id).length, 0);
  },
);
check(
  "accepted secrecy can be broken without remotely notifying the source",
  (s) => {
    const j = s.by("Jeremy"),
      m = s.by("Michele"),
      t = s.by("Tony");
    s.act("leak_test", s.gm.player, j, { subjectId: t.id });
    s.act("secrecy", s.gm.player, j);
    const own = s.memory
      .getConversationObligations(j.id)
      .find((p) => p.kind === "secrecy");
    assert.equal(own.status, "accepted");
    const claim = s.e.knowledge(j.id).find((k) => k.topic === "target");
    s.act("leak", j, m, { claimId: claim.id });
    assert.equal(own.status, "violated");
    assert.equal(
      s.memory
        .getConversationObligations(s.gm.player.id)
        .find((p) => p.kind === "secrecy").status,
      "accepted",
    );
  },
);
check(
  "owned conditional hearsay prioritizes the voter needed to unlock support",
  (s) => {
    const sand = s.by("Sandra"),
      j = s.by("Jeremy"),
      m = s.by("Michele"),
      p = s.by("Parvati"),
      t = s.by("Tony");
    const o = s.e.objectives.establish(sand.id, {
      type: "blindside",
      targetId: t.id,
      explicit: true,
    });
    s.act("conditional", m, j, {
      subjectId: t.id,
      conditions: [{ kind: "known_commitment", voterId: p.id, targetId: t.id }],
    });
    const claim = s.e.knowledge(j.id).find((k) => k.topic === "commitment");
    s.act("share", j, sand, { claimId: claim.id });
    s.e.objectives.evaluate(sand.id, s.gm.dayTimer);
    assert.deepEqual(o.requiredPeople, [p.id]);
  },
);
check(
  "a refused report revises an objective only once, without changing ballots",
  (s) => {
    const sand = s.by("Sandra"),
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
    s.task().status = "awaiting_report";
    s.task().outcome = { stance: "refused" };
    s.act("follow_task", sand, j, { delegationId: s.task().id });
    s.e.objectives.evaluate(sand.id, s.gm.dayTimer);
    const revision = o.revision;
    s.e.objectives.invalidate(sand.id);
    s.e.objectives.evaluate(sand.id, s.gm.dayTimer - 120);
    assert.equal(o.revision, revision);
  },
);
check(
  "Tony learns a real warning, becomes less safe and can pitch his own counterplan",
  (s) => {
    const j = s.by("Jeremy"),
      t = s.by("Tony"),
      p = s.by("Parvati"),
      before = s.strategy.reasoning.refresh(t.id).safetyBelief;
    s.act("warn", j, t, { subjectId: t.id });
    assert.ok(s.strategy.reasoning.refresh(t.id).safetyBelief < before);
    s.act("pitch", t, j, { subjectId: p.id });
    assert.ok(
      s.e
        .knowledge(j.id)
        .some((k) => k.speakerId === t.id && k.subjectId === p.id),
    );
  },
);
check(
  "new owned idol evidence activates a communicated backup through existing strategy",
  (s) => {
    const sand = s.by("Sandra"),
      j = s.by("Jeremy"),
      t = s.by("Tony"),
      p = s.by("Parvati");
    s.act("backup", sand, j, { subjectId: p.id });
    assert.equal(s.strategy.reasoning.state(sand.id).backup.active, false);
    s.act("idol_speculate", j, sand, { subjectId: t.id });
    s.strategy.reasoning.react(sand.id);
    assert.equal(s.strategy.reasoning.state(sand.id).backup.active, true);
    assert.equal(s.e.ownTarget(sand.id), p.id);
  },
);
check(
  "public Tribal memories expose witnessed outcome and idol play, never other ballots",
  (s) => {
    const sand = s.by("Sandra"),
      j = s.by("Jeremy"),
      t = s.by("Tony"),
      summary = {
        day: 1,
        membersAtTribal: [sand, j],
        eliminatedId: t.id,
        initialVotes: [
          { voterId: sand.id, targetId: t.id },
          { voterId: j.id, targetId: sand.id },
        ],
        idolPlays: [{ playedById: j.id, playedOnId: j.id }],
      };
    rememberConversationTribal(s.e, summary);
    assert.ok(s.e.events(sand.id).some((k) => k.topic === "idol_play"));
    assert.equal(
      s.e.knowledge(sand.id).filter((k) => k.topic === "vote_attribution")
        .length,
      1,
    );
    assert.equal(s.e.knowledge(s.by("Michele").id).length, 0);
    assert.match(
      s.e.describeEvent(
        s.e.events(sand.id).find((k) => k.topic === "previous_tribal"),
      ),
      /Tony/,
    );
  },
);
check(
  "challenge outcomes offer specific remembered events without exposing private scores",
  (s) => {
    rememberConversationChallenge(s.e, {
      completed: true,
      challengeDay: 1,
      challengeKey: "first_contact",
      challengeName: "First Contact",
      playerTribeWon: false,
    });
    assert.match(
      s.e.describeEvent(s.e.events(s.gm.player.id)[0]),
      /First Contact.*loss/,
    );
    assert.equal(
      conversationCapabilities(s.e, s.gm.player.id, [s.by("Jeremy").id]).some(
        (d) => d.type === "apologize",
      ),
      false,
    );
  },
);
check(
  "same proposed blindside creates materially different social, power and shield reactions",
  (s) => {
    const sand = s.by("Sandra"),
      j = s.by("Jeremy"),
      t = s.by("Tony"),
      styles = [
        "Social Genius",
        "Power Player",
        "Shadow Strategist",
        "Competitive",
        "Wildcard",
        "Lethal Charmer",
      ],
      responses = [];
    const payload = JSON.stringify(s.gm.createSavePayload());
    for (const style of styles) {
      s.gm.restoreSavePayload(JSON.parse(payload));
      const actor = s.e.person(j.id);
      actor.gameplayStyle = style;
      actor.honesty = 5;
      actor.risk = 5;
      actor.paratend = 5;
      actor.loyalty = 5;
      actor.aggression = 5;
      s.e.person(t.id).strength = 9;
      const r = s.e.resolve(
        s.e.action("ask_vote", {
          actionId: "comparable-style",
          speakerId: sand.id,
          listenerIds: [actor.id],
          subjectId: t.id,
        }),
      );
      responses.push(r.responses[0].stance);
    }
    assert.notEqual(responses[0], responses[1]);
    assert.notEqual(responses[2], responses[3]);
    assert.ok(new Set(responses).size >= 3);
  },
);
check(
  "pre-immunity active conversations and their resolved idol answer survive production reload",
  (s) => {
    s.gm.gamePhase = "preChallenge";
    s.gm.dayTimer = 7200;
    s.strategy.isActive = false;
    s.activity.phaseId = s.activity.phase;
    const j = s.by("Jeremy");
    s.activity.beginConversation(j, { location: "beach" });
    const action = s.e.action("idol_ask", {
        speakerId: s.gm.player.id,
        listenerIds: [j.id],
      }),
      answer = s.e.resolve(action),
      before = JSON.stringify(s.memory.serialize());
    s.restore();
    assert.ok(s.activity.conversation);
    assert.deepEqual(s.e.resolve(action).responses, answer.responses);
    assert.equal(JSON.stringify(s.memory.serialize()), before);
  },
);
