import { samePerson as same } from "./ConversationActionCatalog.js";
// Shared purpose policy for autonomous work, contextual actions and semantic matching.
export const TASK_ACTIONS = Object.freeze({
  recruit: ["ask_vote", "press", "negotiate"],
  verify_vote: ["vote_read"],
  verify_rumor: ["verify"],
  warn: ["warn"],
  reassure: ["reassure"],
  decoy: ["decoy"],
  gather: ["vibe", "vote_read", "numbers"],
  bring: ["come_with_me"],
  repair: ["repair", "apologize"],
  pass_info: ["share"],
  check_loyalty: ["loyalty"],
  backup: ["backup"],
  split: ["split"],
  leak: ["leak"],
  protect_source: ["share", "secrecy"],
});
// Identity is the question/proposal, not merely the pair of people. Refusal
// revisions are deliberately absent: a worker saying no is not new evidence.
export function strategicWorkKey(objectiveId, work, primaryTargetId = null) {
  return JSON.stringify([
    objectiveId || null, work.purpose, String(work.targetId),
    work.subjectId == null ? null : String(work.subjectId),
    work.primaryTargetId == null ? primaryTargetId : work.primaryTargetId,
    work.requestedClaimId || work.claimId || null, work.eventId || null,
    work.conditions || [], work.dependencyIds || [],
  ]);
}
// Stored in canonical participant history; contains only the spoken semantics.
// No executionMode, success flag, hidden intention or listener belief is copied.
export function taskSpeechEvidence(e, a) {
  const claim = e.knowledge(a.speakerId).find((k) => k.id === a.claimId);
  return {
    listenerIds: [...a.listenerIds], primaryTargetId: a.primaryTargetId || null,
    eventId: a.eventId || null, keepSourcePrivate: Boolean(a.keepSourcePrivate),
    information: claim ? {
      topic: claim.topic, subjectId: claim.subjectId, stance: claim.stance,
      proposition: claim.proposition ?? null,
    } : null,
  };
}
export function taskDescription(e, t) {
  const target = e.name(t.targetId),
    subject = e.name(t.subjectId);
  return {
    recruit: `Ask ${target} to vote ${subject}`,
    verify_vote: `Find out ${target}'s vote`,
    verify_rumor: `Check a story with ${target}`,
    warn: `Warn ${target} that their name is coming up`,
    reassure: `Reassure ${target}`,
    decoy: `Give ${target} the ${subject} cover story`,
    gather: `Find out what ${target} has heard`,
    bring: `Bring ${target} to ${e.name(t.requesterId)}`,
    repair: `Repair things with ${target}`,
    pass_info: `Pass the information to ${target}`,
    check_loyalty: `Check where ${target} stands`,
    backup: `Discuss ${subject} as a backup with ${target}`,
    split: `Discuss the split onto ${subject} with ${target}`,
    leak: `Pass the story to ${target}`,
    protect_source: `Share with ${target} while protecting the source`,
  }[t.purpose];
}
export function taskAction(e, t, speakerId = t.delegateId) {
  const claim = e.knowledge(speakerId).find((k) => k.id === t.claimId);
  const event = e
    .events(speakerId)
    .find(
      (k) =>
        k.id === t.eventId ||
        (t.purpose === "repair" &&
          (same(k.subjectId, t.targetId) || same(k.speakerId, t.targetId))),
    );
  const type = TASK_ACTIONS[t.purpose]?.[0];
  if (!type) return null;
  if (
    ["verify_rumor", "pass_info", "leak", "protect_source"].includes(
      t.purpose,
    ) &&
    !claim
  )
    return null;
  if (t.purpose === "repair" && !event) return null;
  return {
    type,
    delegationId: t.id,
    requesterId: t.requesterId,
    subjectId:
      t.purpose === "bring"
        ? t.requesterId
        : ["recruit", "decoy", "backup", "split"].includes(t.purpose)
          ? t.subjectId
          : t.purpose === "warn"
            ? t.targetId
            : claim?.subjectId || null,
    claimId: claim?.id,
    eventId: event?.id,
    planTargetId: t.primaryTargetId,
    primaryTargetId: t.primaryTargetId,
    conditions: t.conditions || [],
    keepSourcePrivate: t.purpose === "protect_source" || t.keepSourcePrivate,
    truthMode:
      t.deliveryTruthMode ||
      t.truthMode ||
      (t.purpose === "decoy" ? "fabrication" : "truth"),
  };
}
export function taskSuggestion(e, t) {
  const a = taskAction(e, t);
  if (!a) return null;
  const requester = e.name(t.requesterId),
    target = e.name(t.targetId);
  const suggestion = {
    ...a,
    taskContext: true,
    label:
      t.purpose === "bring"
        ? `${requester} wants to talk — ask ${target} to come with you`
        : t.purpose === "recruit"
          ? `${requester} wants ${target} on ${e.name(t.subjectId)} — ask for their vote`
          : `${requester} asked you: ${taskDescription(e, t)}`,
  };
  if (e.person(t.delegateId)?.isPlayer && a.truthMode === "fabrication")
    suggestion.label = `Bluff: ${suggestion.label}`;
  return suggestion;
}
export function matchesTask(e, t, a) {
  if (
    !same(t.delegateId, a.speakerId) ||
    !a.listenerIds.some((id) => same(id, t.targetId)) ||
    !TASK_ACTIONS[t.purpose]?.includes(a.type) ||
    !e.together(a.speakerId, t.targetId)
  )
    return false;
  if (
    ["recruit", "decoy", "backup", "split"].includes(t.purpose) &&
    !same(a.subjectId, t.subjectId)
  )
    return false;
  if (
    (t.purpose === "bring" && !same(a.subjectId, t.requesterId)) ||
    (t.purpose === "warn" && !same(a.subjectId, t.targetId))
  )
    return false;
  if (
    ["verify_rumor", "pass_info", "leak", "protect_source"].includes(t.purpose)
  ) {
    const expected = e.knowledge(a.speakerId).find((k) => k.id === t.claimId),
      spoken = e.knowledge(a.speakerId).find((k) => k.id === a.claimId);
    if (
      !expected ||
      !spoken ||
      !same(expected.subjectId, spoken.subjectId) ||
      expected.topic !== spoken.topic ||
      expected.stance !== spoken.stance ||
      !(
        expected.id === spoken.id ||
        (spoken.evidenceIds || []).includes(expected.id)
      )
    )
      return false;
    if (t.purpose === "protect_source" && !a.keepSourcePrivate) return false;
  }
  return !(t.purpose === "repair" && t.eventId && a.eventId !== t.eventId);
}
