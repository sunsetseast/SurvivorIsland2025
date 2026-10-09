import { samePerson as same } from "./ConversationActionCatalog.js";
import { TASK_ACTIONS } from "./StrategicTaskActions.js";

// Camp time counts DOWN: requestTime >= recordTime >= reportTime.
// Persisted semantic order disambiguates several spoken actions in one tick.
export function withinReportWindow(record, p, report) {
  const reportTime = p.reportTime ?? report.campTime;
  if (p.requestPhase && record.phase && p.requestPhase !== record.phase) return false;
  if (record.day !== p.requestDay || !Number.isFinite(record.campTime) ||
      record.campTime > p.requestTime) return false;
  if (Number.isFinite(reportTime) && record.campTime < reportTime) return false;
  const order = record.semantic?.order ?? record.semanticOrder;
  if (order != null && p.requestOrder != null && record.campTime === p.requestTime &&
      order < p.requestOrder) return false;
  if (order != null && p.reportOrder != null && record.campTime === reportTime &&
      order >= p.reportOrder) return false;
  return true;
}
const sameInformation = (a, b) => a && b && a.topic === b.topic &&
  same(a.subjectId, b.subjectId) && a.stance === b.stance &&
  JSON.stringify(a.proposition ?? null) === JSON.stringify(b.proposition ?? null);

// A spoken account, never the delegate's private execution truth.
export function reportProposition(task, reported, line, fabricated = false, clock = {}) {
  const contact = !["not_done", "unreached", "pending"].includes(reported);
  // "I did not do the job" / "not finished" does not deny unrelated contact
  // or a partial attempt. Do not dispute an honest admission on that basis.
  const assertions = ["not_done", "pending"].includes(reported) ? [] : [{ kind: "contact", value: contact }];
  if (contact && task.purpose === "warn") assertions.push({ kind: "warning_received", value: true });
  if (contact && ["pass_info", "leak", "protect_source"].includes(task.purpose))
    assertions.push({ kind: "information_received", value: true });
  if (contact && task.purpose === "protect_source") assertions.push({ kind: "source_protected", value: true });
  if (contact) assertions.push({ kind: "assigned_action_attempted", value: true });
  if (task.purpose === "bring" && ["refused", "coming", "arrived"].includes(reported))
    assertions.push({ kind: "invitation_stance", value: reported === "arrived" ? "coming" : reported });
  if (["recruit", "verify_vote"].includes(task.purpose) &&
      ["committed", "conditional", "leaning", "refused"].includes(reported))
    assertions.push({ kind: "attributed_vote_statement", value: reported,
      subjectId: task.subjectId || (!fabricated && task.outcome?.subjectId) || null });
  const subjective = ["reassure", "repair", "decoy"].includes(task.purpose);
  return {
    kind: "task_result", purpose: task.purpose, targetId: task.targetId,
    delegateId: task.delegateId, requesterId: task.requesterId,
    requestDay: task.day, requestPhase: task.phase, requestTime: task.createdAt, requestOrder: task.createdOrder,
    reportDay: clock.day ?? task.day, reportTime: clock.campTime, reportOrder: clock.order,
    subjectId: task.subjectId, eventId: task.eventId,
    assertions, subjective, impression: subjective ? line : null, line,
    information: task.information || null,
  };
}

function relevantAttempt(k, p, targetId) {
  if (!TASK_ACTIONS[p.purpose]?.includes(k.type)) return false;
  if (k.semantic?.listenerIds && !k.semantic.listenerIds.some((id) => same(id, targetId))) return false;
  if (["recruit", "decoy", "backup", "split"].includes(p.purpose) && !same(k.subjectId, p.subjectId)) return false;
  if (p.purpose === "warn" && !same(k.subjectId, targetId)) return false;
  if (p.purpose === "bring" && !same(k.subjectId, p.requesterId)) return false;
  if (p.purpose === "repair" && p.eventId && k.semantic?.eventId && k.semantic.eventId !== p.eventId) return false;
  if (["verify_rumor", "pass_info", "leak", "protect_source"].includes(p.purpose) &&
      !sameInformation(k.semantic?.information, p.information)) return false;
  return true;
}

// Only this target's records when actually asked. Missing records are not proof
// of deception: verifyReport turns recollection into a fallible spoken account.
export function evaluateReportEvidence(engine, targetId, report) {
  const p = report.proposition;
  if (p?.kind !== "task_result" || !same(p.targetId, targetId)) return null;
  const owned = engine.knowledge(targetId);
  const allHistory = engine.memory.memory[String(targetId)]?.conversationHistory || [];
  const history = allHistory.filter((k) => same(k.speakerId, p.delegateId) && withinReportWindow(k, p, report));
  const claims = owned.filter((k) => same(k.speakerId, p.delegateId) && withinReportWindow(k, p, report));
  const attempts = history.filter((k) => relevantAttempt(k, p, targetId));
  const delivery = claims.filter((k) => sameInformation(k, p.information));
  // Legacy saves can still verify a specific heard delivery. Generic contact
  // is never substituted for the assigned speech act.
  const semanticClaims = claims.filter((k) =>
    (p.purpose === "reassure" && k.topic === "safety" && k.stance === "yes" && same(k.subjectId, targetId)) ||
    (p.purpose === "warn" && k.topic === "safety" && k.stance === "warned" && same(k.subjectId, targetId)) ||
    (p.purpose === "decoy" && k.topic === "target" && same(k.subjectId, p.subjectId)) ||
    (["pass_info", "leak", "protect_source"].includes(p.purpose) && delivery.includes(k)),
  );
  for (const assertion of p.assertions) {
    let actual = null, evidence = [];
    if (assertion.kind === "contact") { actual = Boolean(claims.length || history.length); evidence = [...claims, ...history]; }
    else if (assertion.kind === "assigned_action_attempted") { actual = Boolean(attempts.length || semanticClaims.length); evidence = [...attempts, ...semanticClaims]; }
    else if (assertion.kind === "warning_received") { evidence = semanticClaims; actual = evidence.length > 0; }
    else if (assertion.kind === "information_received") { evidence = delivery; actual = evidence.length > 0; }
    else if (assertion.kind === "source_protected") {
      evidence = delivery;
      actual = delivery.length ? !delivery.some((k) => k.sourceChain?.some((id) => !same(id, p.delegateId) && !same(id, targetId))) : null;
    } else if (assertion.kind === "invitation_stance") {
      evidence = owned.filter((k) => k.topic === "bring_response" && k.delegationId === report.delegationId &&
        same(k.speakerId, targetId) && withinReportWindow(k, p, report)).slice(-1);
      actual = evidence[0]?.stance ?? null;
    } else if (assertion.kind === "attributed_vote_statement") {
      const said = owned.filter((k) => same(k.speakerId, targetId) &&
        ["target", "commitment"].includes(k.topic) &&
        (!assertion.subjectId || same(k.subjectId, assertion.subjectId)) &&
        k.audienceIds?.some((id) => same(id, p.delegateId)) && withinReportWindow(k, p, report));
      const stance = (k) => k.stance === "yes" ? "committed" : k.stance === "lean" ? "leaning" : k.stance;
      evidence = said.filter((k) => stance(k) === assertion.value);
      // Current intention/changed mind is never substituted for historical speech.
      actual = evidence.length ? assertion.value : said.length ? stance(said.at(-1)) : null;
    }
    if (actual != null && actual !== assertion.value) return {
      assertion: assertion.kind, expected: assertion.value, actual,
      evidenceIds: evidence.map((k) => k.id),
      assessment: evidence.length || history.length ? "remembered_conversation" : "not_recalled",
      subjectiveOutcome: p.subjective,
    };
  }
  return { consistent: true, evidenceIds: [...claims, ...attempts].map((k) => k.id), subjectiveOutcome: p.subjective };
}
