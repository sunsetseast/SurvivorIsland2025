import { conversationCharacter } from "./ConversationCharacter.js";
const same = (a, b) => a != null && b != null && String(a) === String(b);
const copy = (x) => JSON.parse(JSON.stringify(x));
const proposals = ["pitch", "ask_vote", "press", "negotiate"];

// Exchange bookkeeping only. All words and effects go through the existing
// resolver; evidence, promises, objectives and ballots retain their owners.
export function openNegotiation(engine, npc, listenerId, result, context = {}) {
  return {
    npcId: npc.id,
    listenerId,
    initiativeId: context.initiativeId,
    activityId:
      context.activityId ||
      engine.camp.conversation?.activityId ||
      result.actionId,
    type: result.type,
    subjectId: result.subjectId,
    originalSubjectId: result.subjectId,
    proposal: proposals.includes(result.type),
    question: [
      "vote_read",
      "loyalty",
      "verify",
      "idol_ask",
      "vibe",
      "warn",
      "reassure",
    ].includes(result.type),
    status: "awaiting_response",
    round: 0,
    counteroffers: 0,
    maxRounds: conversationCharacter(npc).pressureDrive > 0.5 ? 6 : 5,
    proposals: [
      {
        subjectId: result.subjectId,
        actionId: result.actionId,
        status: "pending",
        reason: "opening",
      },
    ],
    responses: [],
    answered: [],
    arguments: [],
    handled: [],
    conditions: [],
  };
}
export function negotiationChoices(engine, n) {
  if (!n || ["settled", "unresolved", "condition_pending"].includes(n.status))
    return [];
  const subjectId = n.subjectId,
    name = engine.name(subjectId);
  if (n.proposal && subjectId != null)
    return [
      { type: "why", label: `Why ${name}?`, subjectId },
      { type: "numbers", label: "Who else do we actually have?", subjectId },
      { type: "evidence", label: "What have you actually heard?", subjectId },
      {
        type: "promise",
        label: engine.model
          ? `I’ll vote ${name}`
          : `If we lose, I’d be willing to vote ${name}`,
        subjectId,
      },
      {
        type: "conditional",
        label: "Only if someone else is really in",
        subjectId,
        conditionPicker: true,
      },
      {
        type: "pitch",
        label: "I’d rather discuss someone else",
        counterPicker: true,
      },
      {
        type: "reply",
        label: "I’ll consider it — no promise",
        subjectId,
        stance: "consider",
        line: "I’ll consider it. I’m not promising.",
      },
      {
        type: "reply",
        label: engine.model
          ? `I’m not voting ${name}`
          : `If we lose, I won’t vote ${name}`,
        subjectId,
        stance: "refused",
        line: engine.model
          ? `I’m not voting ${name}.`
          : `If we lose, I won’t vote ${name}.`,
      },
      { type: "cover_promise", label: `Bluff: agree to ${name}`, subjectId },
    ];
  if (n.question)
    return [
      { type: "source", label: "Who told you?", subjectId },
      { type: "evidence", label: "What do you know?", subjectId },
      { type: "share", label: "Tell them something you actually heard" },
      { type: "speculate", label: "Offer your own read" },
      {
        type: "reply",
        label: "Keep your plans private",
        subjectId: null,
        stance: "withheld",
        line: "I’m keeping my plans to myself for now.",
      },
    ];
  return [];
}
function speak(engine, n, type, fields = {}) {
  const reservation = engine.camp.conversation;
  const group =
    reservation?.activityId === n.activityId ? reservation.groupIds || [] : [];
  const listenerIds = [...new Set([n.listenerId, ...group].map(String))]
    .map((id) => engine.person(id)?.id)
    .filter(
      (id) => id != null && !same(id, n.npcId) && engine.together(n.npcId, id),
    );
  const result = engine.resolve(
    engine.action(type, {
      actionId: `${n.activityId}:negotiation:${n.listenerId}:${n.round}:${type}`,
      speakerId: n.npcId,
      listenerIds,
      subjectId: n.subjectId,
      objectiveId: n.objectiveId,
      ...fields,
    }),
  );
  if (result.invalid) return null;
  return result;
}
function rememberResponse(engine, n, action) {
  n.responses.push(
    copy({
      actionId: action.actionId,
      type: action.type,
      subjectId: action.subjectId,
      stance: action.stance,
      conditions: action.conditions || [],
    }),
  );
  n.handled.push(action.actionId);
  n.round++;
}
function activate(engine, n, subjectId, result, reason) {
  if (!result || result.invalid) return null;
  const previous = n.proposals.at(-1);
  if (previous?.status === "pending") previous.status = "rejected";
  n.subjectId = subjectId;
  n.type = result.type;
  n.status = "awaiting_response";
  n.proposal = true;
  n.conditions = [];
  n.proposals.push({
    subjectId,
    actionId: result.actionId,
    status: "pending",
    reason,
  });
  engine.objectives.invalidate(n.npcId);
  return result;
}
export function continueNegotiation(engine, n, action, result) {
  if (
    n &&
    action.type === "withdraw" &&
    same(action.subjectId, n.subjectId) &&
    result &&
    !result.invalid &&
    !result.replay &&
    !n.handled.includes(action.actionId)
  ) {
    rememberResponse(engine, n, action);
    n.status = "unresolved";
    n.outcome = "withdrawn";
    n.proposals.at(-1).status = "withdrawn";
    engine.objectives.invalidate(n.npcId);
    return null;
  }
  if (
    !n ||
    !result ||
    result.invalid ||
    result.replay ||
    n.handled.includes(action.actionId) ||
    ["settled", "unresolved"].includes(n.status)
  )
    return null;
  // Changing topic does not settle, repeat or erase the existing proposal.
  const related = same(action.subjectId, n.subjectId);
  const counter =
    n.proposal &&
    ["pitch", "ask_vote", "negotiate"].includes(action.type) &&
    !related;
  if (
    !counter &&
    !related &&
    action.stance !== "withheld" &&
    !["share", "source", "evidence"].includes(action.type)
  )
    return null;
  rememberResponse(engine, n, action);
  const current = n.proposals.at(-1);
  if (related && ["promise", "cover_promise"].includes(action.type)) {
    n.status = "settled";
    n.outcome = "agreed";
    current.status = "accepted";
    engine.objectives.invalidate(n.npcId);
    return null;
  }
  if (related && action.type === "conditional") {
    n.status = "condition_pending";
    n.outcome = "conditional";
    current.status = "conditional";
    n.conditions = copy(action.conditions || []);
    // The owned conditional claim is already in SocialMemory. WorkPlanner
    // derives verification of its prerequisite; do not invent confirmation.
    engine.objectives.invalidate(n.npcId);
    return null;
  }
  if (action.stance === "withheld") {
    n.status = "unresolved";
    n.outcome = "withheld";
    return null;
  }
  if (counter) {
    // The listener's pitch has already received an independent NPC evaluation.
    const response = result.responses.find((r) => same(r.speakerId, n.npcId));
    n.counteroffers++;
    current.status = "challenged";
    if (!response || response.stance === "refused" || n.counteroffers > 2) {
      n.status = "unresolved";
      n.outcome = "counter_resisted";
      return null;
    }
    const follow = speak(engine, n, "ask_vote", {
      subjectId: action.subjectId,
      line: `I can consider ${engine.name(action.subjectId)}. Would you actually vote that way?`,
    });
    return activate(
      engine,
      n,
      action.subjectId,
      follow,
      "listener proposed a compromise",
    );
  }
  if (action.type === "reply" && action.stance === "refused") {
    current.status = "rejected";
    n.outcome = "refused";
    const character = conversationCharacter(engine.person(n.npcId));
    if (
      n.counteroffers < 1 &&
      n.round < n.maxRounds &&
      engine.model &&
      character.flexibility > 0.55
    ) {
      const alt = engine.model.alternateTarget(n.npcId, [
        n.npcId,
        n.listenerId,
        ...n.proposals.map((p) => p.subjectId),
      ]);
      if (
        alt &&
        !engine.validate({
          actionId: `${n.activityId}:validate-alternate`,
          type: "pitch",
          speakerId: n.npcId,
          listenerIds: [n.listenerId],
          subjectId: alt,
        })
      ) {
        n.counteroffers++;
        return activate(
          engine,
          n,
          alt,
          speak(engine, n, "pitch", {
            subjectId: alt,
            line: `Then would ${engine.name(alt)} make more sense for you?`,
          }),
          "listener rejected original target",
        );
      }
    }
    n.status = "settled";
    return null;
  }
  if (n.round >= n.maxRounds) {
    n.status = "unresolved";
    n.outcome = "no decision";
    return null;
  }
  if (
    n.proposal &&
    ["why", "source", "evidence", "numbers", "reply"].includes(action.type)
  ) {
    const key = `${n.subjectId}:${action.type}:${action.stance || ""}`;
    if (n.answered.includes(key)) {
      n.repeatedQuestions = (n.repeatedQuestions || 0) + 1;
      if (n.repeatedQuestions >= 2) {
        n.status = "unresolved";
        n.outcome = "repeated unresolved objection";
      }
      return null;
    }
    n.answered.push(key);
    const p = conversationCharacter(engine.person(n.npcId));
    if (action.type === "reply" && action.stance === "consider") {
      const owned = engine.knowledge(n.npcId);
      const evidence = owned
        .filter(
          (k) =>
            same(k.subjectId, n.subjectId) &&
            !same(k.speakerId, n.npcId) &&
            !same(k.speakerId, n.listenerId) &&
            !same(k.attributedId, n.listenerId) &&
            !engine.protectedClaim(n.npcId, k) &&
            !owned.some(
              (h) =>
                same(h.speakerId, n.npcId) &&
                h.evidenceIds?.includes(k.id) &&
                h.audienceIds?.some((id) => same(id, n.listenerId)),
            ),
        )
        .at(-1);
      if (evidence && !n.arguments.includes(`share:${evidence.id}`)) {
        n.arguments.push(`share:${evidence.id}`);
        return speak(engine, n, "share", { claimId: evidence.id });
      }
      if (
        p.repairDrive > 0.65 &&
        (engine.gm.getTrust?.(n.npcId, n.listenerId) ?? 50) >= 60 &&
        !n.arguments.includes("offer:mutual_protection")
      ) {
        n.arguments.push("offer:mutual_protection");
        return speak(engine, n, "deal", {
          dealType: "MUTUAL_PROTECTION",
          line: `Would protecting each other help you consider ${engine.name(n.subjectId)}? I’m offering that, not counting your vote.`,
        });
      }
      if (
        engine.model &&
        p.pressureDrive > 0.6 &&
        engine.gm.dayTimer <= 600 &&
        !n.arguments.includes("pressure")
      ) {
        n.arguments.push("pressure");
        return speak(engine, n, "press", {
          line: `We’re running out of time. Can you give me a clear answer on ${engine.name(n.subjectId)}?`,
        });
      }
    }
    let line;
    if (action.type === "numbers")
      line = `Which of those votes would you need confirmed before considering ${engine.name(n.subjectId)}?`;
    else if (action.type === "reply")
      line =
        p.pressureDrive > 0.5
          ? `What is keeping you from giving me an answer on ${engine.name(n.subjectId)}?`
          : `What worries you about ${engine.name(n.subjectId)}? You don't have to promise now.`;
    else
      line =
        p.repairDrive > 0.65
          ? `I want to understand your side too. What would make ${engine.name(n.subjectId)} work for you?`
          : `Does that answer your concern about ${engine.name(n.subjectId)}, or is there something else?`;
    n.arguments.push(key);
    return speak(engine, n, "ask_vote", { line });
  }
  return null;
}

// NPC listeners use the exact same resolved answer: no second adoption roll.
// This bounded continuation executes inside the existing physical meeting.
export function negotiateNpcMeeting(
  engine,
  npc,
  listener,
  result,
  context = {},
) {
  if (!result?.type || !proposals.includes(result.type) || result.invalid)
    return null;
  const n = openNegotiation(engine, npc, listener.id, result, context);
  let current = result;
  for (let turn = 0; turn < 3; turn++) {
    const response = current.responses?.find((r) =>
      same(r.speakerId, listener.id),
    );
    if (!response) break;
    const action = {
      actionId: `${current.actionId}:heard-response`,
      speakerId: listener.id,
      subjectId: current.subjectId,
      type:
        response.stance === "conditional"
          ? "conditional"
          : response.stance === "committed"
            ? "promise"
            : "reply",
      stance: response.stance === "refused" ? "refused" : "consider",
      conditions: response.conditions || [],
    };
    const next = continueNegotiation(engine, n, action, {
      responses: [],
      type: action.type,
    });
    if (n.status === "condition_pending") break;
    if (next) {
      current = next;
      continue;
    }
    if (
      response.stance === "leaning" &&
      current.type === "pitch" &&
      n.round < n.maxRounds
    ) {
      current = speak(engine, n, "ask_vote", {
        line: `Are you willing to vote ${engine.name(n.subjectId)}, or are you only considering it?`,
      });
      if (!current) break;
    } else break;
  }
  // The last permitted spoken follow-up has already resolved a listener reply.
  // Consume that reply even when no further turn is available; otherwise a
  // real commitment/condition can disappear from the completed exchange summary.
  if (n.status === "awaiting_response") {
    const response = current.responses?.find((r) =>
      same(r.speakerId, listener.id),
    );
    const actionId = `${current.actionId}:heard-response`;
    if (response && !n.handled.includes(actionId)) {
      const maxRounds = n.maxRounds;
      n.maxRounds = n.round + 1;
      continueNegotiation(
        engine,
        n,
        {
          actionId,
          speakerId: listener.id,
          subjectId: current.subjectId,
          type:
            response.stance === "conditional"
              ? "conditional"
              : response.stance === "committed"
                ? "promise"
                : "reply",
          stance: response.stance === "refused" ? "refused" : "consider",
          conditions: response.conditions || [],
        },
        { responses: [] },
      );
      n.maxRounds = maxRounds;
    }
    if (n.status === "awaiting_response") {
      n.status = "unresolved";
      n.outcome = "bounded meeting ended without a decision";
    }
  }
  return n;
}
