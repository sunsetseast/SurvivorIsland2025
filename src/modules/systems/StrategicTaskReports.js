import { samePerson as same } from "./ConversationActionCatalog.js";

// A spoken claim, not task truth. Requesters never receive hidden execution mode.
export function reportProposition(task, reported, line) {
  const contact = !["not_done", "unreached", "pending"].includes(reported);
  const assertions = [{ kind: "contact", value: contact }];
  if (contact && task.purpose === "warn")
    assertions.push({ kind: "warning_received", value: true });
  if (contact && ["pass_info", "leak", "protect_source"].includes(task.purpose))
    assertions.push({ kind: "information_received", value: true });
  if (contact && task.purpose === "protect_source")
    assertions.push({ kind: "source_protected", value: true });
  if (
    task.purpose === "bring" &&
    ["refused", "coming", "arrived"].includes(reported)
  )
    assertions.push({
      kind: "invitation_stance",
      value: reported === "arrived" ? "coming" : reported,
    });
  const subjective = ["reassure", "repair", "decoy"].includes(task.purpose);
  return {
    kind: "task_result",
    purpose: task.purpose,
    targetId: task.targetId,
    delegateId: task.delegateId,
    requesterId: task.requesterId,
    requestDay: task.day,
    requestTime: task.createdAt,
    assertions,
    subjective,
    impression: subjective ? line : null,
    line,
    information: task.information || null,
  };
}

// Only this target's records are consulted when it is actually asked.
export function evaluateReportEvidence(engine, targetId, report) {
  const p = report.proposition;
  if (p?.kind !== "task_result" || !same(p.targetId, targetId)) return null;
  const claims = engine
    .knowledge(targetId)
    .filter(
      (k) =>
        k.day === p.requestDay &&
        (k.campTime ?? Infinity) <= p.requestTime &&
        same(k.speakerId, p.delegateId),
    );
  const history = (
    engine.memory.memory[String(targetId)]?.conversationHistory || []
  ).filter(
    (k) =>
      k.day === p.requestDay &&
      k.campTime <= p.requestTime &&
      same(k.speakerId, p.delegateId),
  );
  const delivery = claims.filter(
    (k) =>
      p.information &&
      k.topic === p.information.topic &&
      same(k.subjectId, p.information.subjectId) &&
      k.stance === p.information.stance &&
      JSON.stringify(k.proposition ?? null) ===
        JSON.stringify(p.information.proposition ?? null),
  );
  for (const assertion of p.assertions) {
    let actual,
      evidence = [];
    if (assertion.kind === "contact") {
      actual = Boolean(claims.length || history.length);
      evidence = [...claims, ...history].map((k) => k.id);
    } else if (assertion.kind === "warning_received") {
      const heard = claims.filter(
        (k) =>
          k.topic === "safety" &&
          k.stance === "warned" &&
          same(k.subjectId, targetId),
      );
      actual = heard.length > 0;
      evidence = heard.map((k) => k.id);
    } else if (assertion.kind === "information_received") {
      const heard = delivery;
      actual = heard.length > 0;
      evidence = heard.map((k) => k.id);
    } else if (assertion.kind === "source_protected") {
      const heard = delivery;
      // An existing unrelated rumor cannot expose this delivery's attribution.
      actual = heard.length
        ? !heard.some((k) =>
            k.sourceChain?.some(
              (id) => !same(id, p.delegateId) && !same(id, targetId),
            ),
          )
        : null;
      evidence = heard.map((k) => k.id);
    } else if (assertion.kind === "invitation_stance") {
      const response = engine
        .knowledge(targetId)
        .filter(
          (k) =>
            k.topic === "bring_response" &&
            k.delegationId === report.delegationId &&
            same(k.speakerId, targetId),
        )
        .at(-1);
      actual = response?.stance ?? null;
      evidence = response ? [response.id] : [];
    }
    if (actual != null && actual !== assertion.value)
      return {
        assertion: assertion.kind,
        expected: assertion.value,
        actual,
        evidenceIds: evidence,
      };
  }
  return { consistent: true, evidenceIds: claims.map((k) => k.id) };
}
