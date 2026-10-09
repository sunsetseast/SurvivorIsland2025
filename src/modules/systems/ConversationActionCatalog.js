import { eligibleCampMember } from "../locations/CampPresence.js";
import { ownedCampKnowledge } from "./CampKnowledge.js";
import { ownsUsableIdol } from "./IdolPossession.js";
export const samePerson = (a, b) =>
  a != null && b != null && String(a) === String(b);
export const CONVERSATION_CATEGORIES = Object.freeze([
  ["connect", "Connect"],
  ["read", "Read the Game"],
  ["move", "Make a Move"],
  ["relationships", "Relationships"],
  ["idol", "Idols & Advantages"],
  ["person", "Talk About Someone"],
]);
// Definitions are capabilities, not sentence trees. Subject selection is a UI concern.
export const PERSON_READ_ANGLES = Object.freeze([
  ["trustworthy", "Do you trust them?"],
  ["close", "Who are they close with?"],
  ["dangerous", "How dangerous are they?"],
  ["lazy", "Are they helping around camp?"],
  ["challenge_value", "What do they bring to challenges?"],
  ["suspicious", "Are they acting suspiciously?"],
  ["idol", "Have they been searching for an idol?"],
  ["name_mention", "Have they brought up my name?"],
  ["working_with", "Who are they working with?"],
]);
export const PRE_CAMP_LABELS = Object.freeze({
  vote_read: "Who might be vulnerable if we lose?",
  safety: "Would I be vulnerable if we lose?",
  ask_vote: "Ask about voting together if we lose",
  press: "Ask for a clear answer if we lose",
  promise: "Promise a vote if we lose",
  conditional: "Make a conditional vote promise if we lose",
  cover_promise: "Bluff: promise a vote if we lose",
  numbers: "Who could we work with if we lose?",
  decoy: "Plant a possible target",
  backup: "Discuss a backup if we lose",
  split: "Discuss a possible split if we lose",
});
const definitions = [
  ["reply", "move", "Answer their proposal", "Tell", "commitment", "target"],
  [
    "strategy_style",
    "read",
    "How do you want to play?",
    "Ask",
    "strategy_style",
  ],
  [
    "come_with_me",
    "move",
    "Ask them to come with you",
    "Propose",
    "invitation",
    "person",
  ],
  ["check_in", "connect", "Check in", "Ask", "relationship"],
  [
    "personal",
    "connect",
    "Have a personal conversation",
    "Ask",
    "personal_bond",
  ],
  [
    "share_personal",
    "connect",
    "Share something about yourself",
    "Tell",
    "personal_bond",
  ],
  ["joke", "connect", "Share a joke", "Tell", "personal_bond"],
  ["praise", "connect", "Give a compliment", "Praise", "relationship"],
  ["encourage", "connect", "Encourage them", "Reassure", "relationship"],
  ["comfort", "connect", "Offer support", "Reassure", "relationship"],
  ["help", "connect", "Offer help around camp", "Propose", "camp_life"],
  ["spend_time", "connect", "Spend time together", "Propose", "relationship"],
  ["vibe", "read", "What is the camp mood?", "Ask", "social_dynamics"],
  ["dangerous", "read", "Who seems dangerous?", "Ask", "threat_perception"],
  ["trustworthy", "read", "Who seems trustworthy?", "Ask", "trust"],
  ["lazy", "read", "Who is not helping?", "Ask", "work_ethic"],
  ["suspicious", "read", "Who seems suspicious?", "Ask", "suspicion"],
  ["close", "read", "Who is getting close?", "Ask", "social_dynamics"],
  ["isolated", "read", "Who seems isolated?", "Ask", "social_dynamics"],
  ["leader", "read", "Who is trying to lead?", "Ask", "leadership"],
  ["vote_read", "read", "Where is the vote?", "Ask", "vote"],
  ["safety", "read", "Is my name coming up?", "Ask", "safety"],
  ["numbers", "read", "Who do we actually have?", "Ask", "numbers", "target"],
  ["share", "read", "Tell them what you heard", "Tell", "information", "claim"],
  ["verify", "read", "Verify a story", "Verify", "information", "claim"],
  ["source", "read", "Who told you?", "Ask", "source"],
  ["why", "read", "Ask why", "Ask", "information"],
  ["evidence", "read", "What exactly did you hear?", "Ask", "information"],
  ["who_knows", "read", "Who else knows?", "Ask", "secrecy"],
  ["pitch", "move", "Pitch a target", "Pitch", "target", "target"],
  ["ask_vote", "move", "Ask for their vote", "Recruit", "commitment", "target"],
  [
    "press",
    "move",
    "Ask for a firm answer",
    "Pressure",
    "commitment",
    "target",
  ],
  [
    "negotiate",
    "move",
    "What would get you there?",
    "Condition",
    "commitment",
    "target",
  ],
  ["promise", "move", "Promise your vote", "Promise", "commitment", "target"],
  [
    "conditional",
    "move",
    "Make a conditional vote promise",
    "Condition",
    "commitment",
    "target",
  ],
  [
    "cover_promise",
    "move",
    "Bluff: promise a vote",
    "Promise",
    "commitment",
    "target",
  ],
  ["withdraw", "move", "Withdraw your vote promise", "Withdraw", "commitment"],
  ["backup", "move", "Propose a backup target", "Propose", "backup", "target"],
  [
    "split",
    "move",
    "Coordinate a split vote",
    "Coordinate",
    "split_assignment",
    "target",
  ],
  ["decoy", "move", "Give them a decoy name", "Lie", "target", "target"],
  [
    "bluff",
    "move",
    "Bluff: say somebody committed",
    "Lie",
    "commitment",
    "target",
  ],
  [
    "speculate",
    "move",
    "Say who you think the vote might be",
    "Speculate",
    "target",
    "target",
  ],
  ["warn", "move", "Warn someone", "Warn", "safety", "person"],
  ["reassure", "move", "Reassure them", "Reassure", "safety"],
  ["threaten", "move", "Threaten to expose their plan", "Threaten", "pressure"],
  [
    "delegate",
    "move",
    "Ask them to talk to someone",
    "Delegate",
    "delegation",
    "person",
  ],
  [
    "follow_task",
    "move",
    "Follow up on an assignment",
    "Ask",
    "delegation",
    "task",
  ],
  [
    "report",
    "move",
    "Report back on your assignment",
    "Report",
    "delegation",
    "task",
  ],
  [
    "bring",
    "move",
    "Ask them to bring someone over",
    "Delegate",
    "invitation",
    "person",
  ],
  ["leak_test", "move", "Test who carries a story", "Tell", "target", "target"],
  ["leak", "move", "Pass on a secret", "Break secrecy", "information", "claim"],
  ["deal", "move", "Offer a specific agreement", "Propose", "deal"],
  ["alliance", "relationships", "Discuss an alliance", "Propose", "alliance"],
  ["loyalty", "relationships", "Check their loyalty", "Verify", "loyalty"],
  [
    "secrecy",
    "relationships",
    "Ask to keep this between you",
    "Request secrecy",
    "secrecy",
  ],
  [
    "repair",
    "relationships",
    "Repair things after what happened",
    "Repair relationship",
    "betrayal",
    "event",
  ],
  [
    "apologize",
    "relationships",
    "Apologize for what happened",
    "Apologize",
    "betrayal",
    "event",
  ],
  [
    "confront",
    "relationships",
    "Confront what happened",
    "Accuse",
    "betrayal",
    "event",
  ],
  [
    "admit",
    "relationships",
    "Admit what you did",
    "Admit",
    "betrayal",
    "event",
  ],
  ["deny", "relationships", "Deny the accusation", "Deny", "betrayal", "event"],
  [
    "event",
    "relationships",
    "Talk about a recent event",
    "Ask",
    "recent_event",
    "event",
  ],
  ["idol_ask", "idol", "Ask if they found an idol", "Ask", "idol_possession"],
  ["idol_search", "idol", "Ask whether they have looked", "Ask", "idol_search"],
  ["idol_reveal", "idol", "Reveal your idol", "Reveal", "idol_possession"],
  [
    "idol_hint",
    "idol",
    "Hint that you have protection",
    "Bluff",
    "idol_possession",
  ],
  ["idol_deny", "idol", "Deny having an idol", "Deny", "idol_possession"],
  [
    "idol_conceal",
    "idol",
    "Keep your inventory private",
    "Conceal",
    "idol_possession",
  ],
  [
    "idol_bluff",
    "idol",
    "Bluff: say you have an idol",
    "Bluff",
    "idol_possession",
  ],
  [
    "idol_rumor",
    "idol",
    "Discuss an idol rumor",
    "Tell",
    "idol_suspicion",
    "claim",
  ],
  [
    "idol_speculate",
    "idol",
    "Speculate about an idol",
    "Speculate",
    "idol_suspicion",
    "person",
  ],
  [
    "idol_fabricate",
    "idol",
    "Bluff: invent an idol rumor",
    "Lie",
    "idol_possession",
    "person",
  ],
  [
    "idol_protect",
    "idol",
    "Offer conditional idol protection",
    "Promise",
    "idol_protection",
  ],
  [
    "person_read",
    "person",
    "Ask about someone",
    "Ask",
    "social_dynamics",
    "person",
  ],
  [
    "person_include",
    "person",
    "Explore working with someone",
    "Propose",
    "alliance",
    "person",
  ],
  [
    "person_exclude",
    "person",
    "Discuss excluding someone",
    "Exclude",
    "alliance",
    "person",
  ],
];
export const ACTION_DEFINITIONS = Object.freeze(
  Object.fromEntries(
    definitions.map(([type, category, label, speechAct, topic, subject]) => [
      type,
      Object.freeze({ type, category, label, speechAct, topic, subject }),
    ]),
  ),
);
export const TASK_PURPOSES = Object.freeze([
  ["recruit", "Get their vote"],
  ["verify_vote", "See where they stand"],
  ["verify_rumor", "Verify a story"],
  ["warn", "Warn them"],
  ["reassure", "Reassure them"],
  ["decoy", "Give them the decoy"],
  ["gather", "Find out what they have heard"],
  ["bring", "Ask them to come over"],
  ["repair", "Repair things with them"],
  ["pass_info", "Pass information"],
  ["check_loyalty", "Check loyalty"],
  ["backup", "Communicate a backup"],
  ["split", "Coordinate a split"],
  ["leak", "Let a story spread"],
  ["protect_source", "Protect a source"],
]);
export function conversationMembers(gm) {
  return (gm.getPlayerTribe?.()?.members || []).filter((p) =>
    eligibleCampMember(gm, p),
  );
}
export function actionSubjects(engine, type, speakerId, listenerIds = []) {
  const gm = engine.gm,
    def = ACTION_DEFINITIONS[type];
  if (def?.subject === "claim")
    return engine
      .knowledge(speakerId)
      .filter(
        (e) =>
          e.kind === "claim" &&
          (type !== "idol_rumor" || e.topic.startsWith("idol")),
      )
      .slice(-12);
  if (def?.subject === "event")
    return engine
      .events(speakerId)
      .filter(
        (e) =>
          !["apologize", "admit"].includes(type) ||
          ((samePerson(e.speakerId, speakerId) ||
            (["task_report_dispute", "public_conflict"].includes(e.topic) &&
              samePerson(e.proposition?.delegateId, speakerId))) &&
            [
              "betrayal",
              "public_conflict",
              "confirmed_lie",
              "vote_attribution",
              "deal_breach",
              "alliance_exclusion",
              "broken_promise",
              "task_report_dispute",
            ].includes(e.topic)),
      );
  if (def?.subject === "task")
    return engine.tasks
      .knownTasks(speakerId)
      .filter((t) =>
        type === "report"
          ? samePerson(t.delegateId, speakerId) &&
            listenerIds.some((id) => samePerson(id, t.requesterId))
          : samePerson(t.requesterId, speakerId) &&
            listenerIds.some((id) => samePerson(id, t.delegateId)),
      );
  return conversationMembers(gm).filter(
    (p) =>
      !samePerson(p.id, speakerId) &&
      (def?.subject !== "target" ||
        gm.gamePhase !== "postChallenge" ||
        engine.model?.strategy.isTargetIdAvailable(p.id)) &&
      (!["delegate", "bring", "come_with_me"].includes(type) ||
        !listenerIds.some((id) => samePerson(id, p.id))),
  );
}
export function conversationCapabilities(engine, speakerId, listenerIds) {
  const owned = engine.knowledge(speakerId),
    idol = ownsUsableIdol(
      engine.person(speakerId),
      engine.gm.systems.idolSystem,
    );
  return Object.values(ACTION_DEFINITIONS)
    .filter(
      (d) =>
        (d.type !== "reply" || engine.camp?.conversation?.checkpoint?.npcNegotiation) &&
        (d.type !== "idol_reveal" || idol) &&
        (d.type !== "idol_protect" || idol) &&
        (d.type !== "idol_bluff" || !idol) &&
        (!["withdraw"].includes(d.type) ||
          engine.promises(speakerId).some((p) => p.status === "active")) &&
        (!d.subject ||
          actionSubjects(engine, d.type, speakerId, listenerIds).length) &&
        (!["source", "why", "evidence", "who_knows", "secrecy"].includes(
          d.type,
        ) ||
          engine.lastExchange(speakerId)) &&
        ((d.type !== "backup" && d.type !== "split") ||
          engine.ownTarget(speakerId)),
    )
    .map((d) =>
      engine.gm.gamePhase !== "postChallenge" && PRE_CAMP_LABELS[d.type]
        ? { ...d, label: PRE_CAMP_LABELS[d.type] }
        : d,
    )
    .map((d) =>
      engine.person(speakerId)?.isPlayer && d.type === "idol_deny" && idol
        ? { ...d, label: "Lie: deny having an idol" }
        : engine.person(speakerId)?.isPlayer && d.type === "idol_hint" && !idol
          ? { ...d, label: "Bluff: hint that you have protection" }
          : d,
    );
}
export function suggestedConversationActions(engine, speakerId, listenerIds) {
  const available = conversationCapabilities(engine, speakerId, listenerIds),
    first = listenerIds[0],
    suggestions = [...engine.tasks.suggestions(speakerId, listenerIds)];
  const add = (type, label, extras = {}) => {
    const d = available.find((d) => d.type === type);
    if (d) suggestions.push({ ...d, label: label || d.label, ...extras });
  };
  const dispute = engine
    .events(speakerId)
    .find(
      (k) =>
        k.topic === "task_report_dispute" &&
        samePerson(k.proposition?.delegateId, first),
    );
  if (dispute)
    add(
      "confront",
      `Challenge their report about ${engine.name(dispute.proposition.targetId)}`,
      { eventId: dispute.id },
    );
  const incoming = engine.tasks
    .knownTasks(speakerId)
    .find(
      (t) =>
        samePerson(t.delegateId, speakerId) &&
        samePerson(t.requesterId, first) &&
        t.publicStatus === "accepted" &&
        !t.report,
    );
  if (incoming)
    add(
      "report",
      `Update ${engine.name(first)} about ${engine.name(incoming.targetId)}`,
      { delegationId: incoming.id },
    );
  const tasks = engine.tasks
    .knownTasks(speakerId)
    .filter(
      (t) =>
        samePerson(t.requesterId, speakerId) && samePerson(t.delegateId, first),
    );
  if (tasks.length)
    add("follow_task", `Follow up on ${engine.name(tasks.at(-1).targetId)}`, {
      delegationId: tasks.at(-1).id,
    });
  const incident = engine
    .events(speakerId)
    .find(
      (e) => samePerson(e.speakerId, first) || samePerson(e.subjectId, first),
    );
  if (incident)
    add("repair", "Talk about what happened between you", {
      eventId: incident.id,
    });
  if (engine.gm.gamePhase === "postChallenge") {
    add("vote_read");
    add("safety");
  } else {
    add("check_in");
    add("vibe");
  }
  return suggestions.slice(0, 4);
}
export function makeConversationAction(
  engine,
  type,
  { speakerId, listenerIds, ...fields },
) {
  const d = ACTION_DEFINITIONS[type];
  if (!d) throw new Error(`Unknown conversation action: ${type}`);
  return {
    ...d,
    actionId: fields.actionId || engine.nextActionId(speakerId),
    speakerId,
    listenerIds: [...listenerIds],
    subjectId: null,
    truthMode: "truth",
    delivery: "direct",
    conditions: [],
    secrecy: null,
    ...fields,
  };
}
export function validateConversationCatalog(resolverTypes) {
  return [
    ...resolverTypes
      .filter((t, i) => resolverTypes.indexOf(t) !== i)
      .map((t) => `Duplicate resolver: ${t}`),
    ...resolverTypes
      .filter((t) => !ACTION_DEFINITIONS[t])
      .map((t) => `Unreachable resolver: ${t}`),
    ...Object.values(ACTION_DEFINITIONS).flatMap((d) =>
      !resolverTypes.includes(d.type)
        ? [`Missing resolver: ${d.type}`]
        : !CONVERSATION_CATEGORIES.some(([id]) => id === d.category)
          ? [`Unreachable category: ${d.type}`]
          : [],
    ),
  ];
}
