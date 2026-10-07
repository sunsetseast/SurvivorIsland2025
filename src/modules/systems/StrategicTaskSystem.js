import {
  TASK_PURPOSES,
  samePerson as same,
  conversationMembers,
} from "./ConversationActionCatalog.js";
import { conversationCharacter } from "./ConversationCharacter.js";
const copy = (x) => JSON.parse(JSON.stringify(x));
const TERMINAL = ["refused", "expired", "abandoned"];
// Durable work records are hidden execution state. Requesters see only the request and spoken reports.
export default class StrategicTaskSystem {
  constructor(engine, payload = {}) {
    this.engine = engine;
    this.records = payload?.records || {};
  }
  get(id) {
    return this.records[id] || null;
  }
  knownTasks(ownerId) {
    return Object.values(this.records)
      .filter(
        (t) => same(t.requesterId, ownerId) || same(t.delegateId, ownerId),
      )
      .map((t) => ({
        id: t.id,
        requesterId: t.requesterId,
        delegateId: t.delegateId,
        targetId: t.targetId,
        purpose: t.purpose,
        subjectId: t.subjectId,
        publicStatus: t.publicStatus,
        day: t.day,
        objectiveId: t.objectiveId,
        report:
          (t.reports || []).filter((r) => same(r.listenerId, ownerId)).at(-1) ||
          null,
      }));
  }
  create(a, random) {
    const id = a.delegationId || `${a.actionId}:task:${a.delegateId}`;
    if (this.records[id]) return this.records[id];
    const e = this.engine,
      delegate = e.person(a.delegateId),
      requester = e.person(a.speakerId),
      target = e.person(a.subjectId);
    if (
      !delegate ||
      !requester ||
      !target ||
      !e.together(delegate.id, requester.id) ||
      !TASK_PURPOSES.some(([p]) => p === a.purpose)
    )
      return null;
    const p = conversationCharacter(delegate),
      trust = (e.gm.getTrust?.(delegate.id, requester.id) ?? 50) / 100,
      affinity =
        e.gm.systems.allianceSystem?.getAllianceAffinity(
          delegate.id,
          requester.id,
        ) || 0;
    const targetRisk =
      e.gm.systems.allianceSystem?.getAllianceAffinity(
        delegate.id,
        a.planTargetId,
      ) || 0;
    const workload = Object.values(this.records).filter(
      (t) =>
        same(t.delegateId, delegate.id) &&
        ["queued", "finding", "working", "awaiting_report"].includes(t.status),
    ).length;
    const score =
      trust * 0.5 +
      affinity * 0.25 +
      p.delegationDrive * 0.15 +
      p.loyalty * 0.15 -
      targetRisk * 0.3 -
      workload * 0.2;
    let publicStatus = delegate.isPlayer
      ? "pending"
      : score >= 0.47
        ? "accepted"
        : score >= 0.3
          ? "hedged"
          : "refused";
    const executionMode =
      publicStatus === "accepted" && p.coverDrive > 0.5 && targetRisk > 0.4
        ? "leak"
        : publicStatus === "accepted" && trust < 0.5 && random() < p.coverDrive
          ? "ignore"
          : "sincere";
    const task = {
      id,
      requesterId: requester.id,
      delegateId: delegate.id,
      targetId: target.id,
      subjectId: a.planTargetId || e.ownTarget(requester.id),
      purpose: a.purpose,
      claimId: a.claimId || null,
      conditions: copy(a.conditions || []),
      secrecy: a.secrecy || null,
      keepSourcePrivate: Boolean(a.keepSourcePrivate),
      attribution: a.attribution || "if_necessary",
      objectiveId: a.objectiveId || null,
      day: e.gm.day,
      phase: e.gm.gamePhase,
      createdAt: e.gm.dayTimer,
      deadline: 0,
      status: publicStatus === "accepted" ? "queued" : publicStatus,
      publicStatus,
      executionMode,
      attempts: 0,
      reports: [],
      searchIndex: 0,
      acceptanceLine:
        publicStatus === "accepted"
          ? "I’ll go talk to them."
          : publicStatus === "hedged"
            ? "I may be able to. Do not count on it yet."
            : publicStatus === "pending"
              ? "Will you do that for me?"
              : "I am not taking that on.",
    };
    this.records[id] = task;
    const information = e
      .knowledge(requester.id)
      .find((k) => k.id === a.claimId);
    if (information) {
      const told = e.statement(
        a,
        {
          speakerId: requester.id,
          listenerIds: [delegate.id],
          subjectId: information.subjectId,
          topic: information.topic,
          stance: information.stance,
          mode: "hearsay",
          attributedId: information.attributedId || information.speakerId,
          sourceChain: information.sourceChain,
          evidenceIds: [information.id],
          conditions: information.conditions,
          proposition: information.proposition,
        },
        random,
      );
      task.claimId = told?.id || task.claimId;
    }
    if (
      publicStatus === "accepted" &&
      ["idle_at_camp", "rest", "observe"].includes(delegate.campActivity?.type)
    )
      e.camp.interrupt(delegate, "strategic_assignment");
    e.memory.recordConversationObligation(
      {
        id,
        kind: "task",
        speakerId: delegate.id,
        requesterId: requester.id,
        targetId: target.id,
        purpose: task.purpose,
        status: publicStatus,
        day: task.day,
      },
      [requester.id, delegate.id],
    );
    if (
      publicStatus === "accepted" &&
      (a.keepSourcePrivate || a.secrecy?.requested)
    )
      e.memory.recordConversationObligation(
        {
          id: `${id}:secrecy`,
          kind: "secrecy",
          speakerId: delegate.id,
          requesterId: requester.id,
          claimId: a.actionId,
          allowedIds: [requester.id, delegate.id, target.id],
          useWithoutName: Boolean(a.keepSourcePrivate),
          status: "accepted",
          day: task.day,
        },
        [requester.id, delegate.id],
      );
    return task;
  }
  respond(id, ownerId, accept) {
    const t = this.get(id);
    if (
      !t ||
      !same(t.delegateId, ownerId) ||
      !this.engine.together(ownerId, t.requesterId) ||
      !["pending", "hedged"].includes(t.status)
    )
      return false;
    t.publicStatus = accept ? "accepted" : "refused";
    t.status = accept ? "queued" : "refused";
    for (const id of [t.delegateId, t.requesterId])
      this.rememberStatus(t, id, t.publicStatus);
    return true;
  }
  rememberStatus(task, ownerId, status) {
    const obligation = this.engine.memory
      .getConversationObligations(ownerId)
      .find((p) => p.kind === "task" && p.id === task.id);
    if (obligation) obligation.status = status;
  }
  plan(actor, now) {
    const e = this.engine,
      task = Object.values(this.records).find(
        (t) =>
          same(t.delegateId, actor.id) &&
          t.day === e.gm.day &&
          !TERMINAL.includes(t.status) &&
          ["queued", "finding", "awaiting_report"].includes(t.status),
      );
    if (!task || actor.isPlayer) return null;
    if (task.executionMode === "ignore") {
      task.status = "ignored";
      return null;
    }
    if (task.attempts >= 4 && task.status !== "awaiting_report") {
      task.status = "awaiting_report";
      task.outcome = { stance: "unreached" };
    }
    const reporting = task.status === "awaiting_report",
      destination = reporting
        ? task.requesterId
        : task.executionMode === "leak"
          ? task.subjectId
          : task.targetId;
    const target = e.person(destination);
    if (!target) {
      task.status = "abandoned";
      return null;
    }
    if (e.together(actor.id, target.id)) {
      if (target.isPlayer)
        return {
          type: "approach_player",
          location: e.place(target.id),
          duration: 45,
          purpose: "strategic_task",
          taskId: task.id,
          agenda: { purpose: "strategic_task", taskId: task.id, reporting },
        };
      const free =
        !target.campActivity ||
        ["rest", "idle_at_camp", "observe"].includes(target.campActivity.type);
      if (free) {
        task.status = reporting ? "awaiting_report" : "working";
        return {
          type: "strategy_conversation",
          location: e.place(actor.id),
          targetId: target.id,
          duration: 120,
          taskId: task.id,
          taskReporting: reporting,
        };
      }
      // Seeing a busy contestant is not a failed search. Wait locally, rather
      // than exhausting attempts while another conversation finishes.
      return {
        type: "observe",
        location: e.place(actor.id),
        duration: 60,
        taskId: task.id,
      };
    }
    // Current nearby presence and owned movement sightings are the search inputs.
    const observations = e.memory
      .getCampObservations(actor.id)
      .filter(
        (o) => same(o.actorId, target.id) && o.location && o.day === e.gm.day,
      );
    const last = observations.at(-1),
      places = [
        "beach",
        "waterWell",
        "shelter",
        "campfire",
        "jungleTrail",
        "rockyShore",
      ];
    const sighting =
      last?.type === "departed"
        ? last.toLocation || last.location
        : last?.location;
    const place =
      sighting && task.lastSearchLocation !== sighting
        ? sighting
        : places[task.searchIndex++ % places.length];
    task.lastSearchLocation = place;
    if (!reporting) task.status = "finding";
    task.attempts++;
    return { type: "observe", location: place, duration: 45, taskId: task.id };
  }
  execute(actor, listener, activity) {
    const task = this.get(activity.taskId);
    if (
      !task ||
      !same(task.delegateId, actor.id) ||
      !this.engine.together(actor.id, listener.id)
    )
      return null;
    const e = this.engine;
    if (
      activity.taskReporting ||
      (same(task.requesterId, listener.id) && task.status === "awaiting_report")
    ) {
      const action = e.action("report", {
        actionId: `${activity.id}:report`,
        speakerId: actor.id,
        listenerIds: [listener.id],
        delegationId: task.id,
        activityId: activity.id,
      });
      return e.resolve(action);
    }
    if (task.executionReceipt) return e.receipts[task.executionReceipt] || null;
    const map = {
      recruit: "ask_vote",
      verify_vote: "vote_read",
      verify_rumor: "verify",
      warn: "warn",
      reassure: "reassure",
      decoy: "decoy",
      gather: "vibe",
      bring: "check_in",
      repair: "repair",
      pass_info: "share",
      check_loyalty: "loyalty",
      backup: "backup",
      split: "split",
      leak: "leak",
      protect_source: "secrecy",
    };
    let type = map[task.purpose] || "vote_read",
      subjectId = ["recruit", "decoy", "backup", "split"].includes(task.purpose)
        ? task.subjectId
        : task.purpose === "warn"
          ? task.targetId
          : null;
    let claimId = task.claimId;
    if (task.executionMode === "leak") {
      type = "warn";
      subjectId = task.subjectId;
    }
    if (
      ["share", "verify"].includes(type) &&
      !e.knowledge(actor.id).some((k) => k.id === claimId)
    )
      type = "vote_read";
    const incident =
      type === "repair"
        ? e
            .events(actor.id)
            .find(
              (k) =>
                same(k.subjectId, listener.id) ||
                same(k.speakerId, listener.id),
            )
        : null;
    if (type === "repair" && !incident) {
      task.outcome = {
        stance: "refused",
        line: "There is no shared incident I can honestly apologize for.",
      };
      task.status = "awaiting_report";
      return null;
    }
    const action = e.action(type, {
      actionId: `${activity.id}:task:${task.id}`,
      speakerId: actor.id,
      listenerIds: [listener.id],
      subjectId,
      claimId,
      eventId: incident?.id,
      objectiveId: task.objectiveId,
      delegationId: task.id,
      activityId: activity.id,
      keepSourcePrivate: task.keepSourcePrivate,
      truthMode: task.purpose === "decoy" ? "fabrication" : "truth",
    });
    const result = e.resolve(action);
    if (result.invalid) {
      task.status = "queued";
      return result;
    }
    if (task.executionMode === "leak")
      for (const secret of e.memory.getConversationObligations(actor.id))
        if (secret.id === `${task.id}:secrecy`) secret.status = "violated";
    task.executionReceipt = action.actionId;
    const spoken = e
      .knowledge(actor.id)
      .filter(
        (k) =>
          k.id.startsWith(`${action.actionId}:claim:${listener.id}:`) &&
          ["target", "commitment"].includes(k.topic),
      )
      .at(-1);
    task.outcome = {
      stance:
        result.responses.find((r) => same(r.speakerId, listener.id))?.stance ||
        "open",
      line: result.responses[0]?.line || "",
      listenerId: listener.id,
      subjectId: spoken?.subjectId || null,
      evidenceId: spoken?.id || null,
    };
    task.status = "awaiting_report";
    task.completedAt = e.gm.dayTimer;
    this.rememberStatus(task, actor.id, "performed");
    if (task.purpose === "bring") {
      const p = conversationCharacter(listener),
        trust = e.gm.getTrust?.(listener.id, actor.id) ?? 50;
      const willing = trust >= 50 && p.visibilityTolerance > 0.2;
      task.outcome.stance = willing ? "coming" : "refused";
      if (willing && !listener.isPlayer)
        e.camp.moveTogether(actor, listener, e.place(task.requesterId));
    }
    return result;
  }
  report(task, a, delegateId, random, voluntary = false) {
    const e = this.engine;
    if (
      !task ||
      !same(task.delegateId, delegateId) ||
      !(
        same(a.speakerId, task.requesterId) ||
        (voluntary && same(a.speakerId, task.delegateId))
      ) ||
      !e.together(task.delegateId, task.requesterId)
    )
      return {
        line: "I do not have an assignment to report on.",
        stance: "unknown",
      };
    if (e.person(delegateId)?.isPlayer && !voluntary)
      return {
        line: `What happened with ${e.name(task.targetId)}?`,
        stance: "pending",
      };
    const requester = task.requesterId,
      delegate = e.person(delegateId),
      p = conversationCharacter(delegate),
      failed =
        !task.executionReceipt ||
        ["refused", "unreached"].includes(task.outcome?.stance),
      falseReport =
        a.truthMode === "fabrication" ||
        (!delegate?.isPlayer &&
          failed &&
          p.coverDrive > 0.5 &&
          random() < p.coverDrive);
    const actual =
        task.outcome?.stance ||
        (["finding", "working", "queued"].includes(task.status)
          ? "pending"
          : "not_done"),
      reported = falseReport ? "committed" : actual;
    const reportedTargetId = falseReport
      ? task.subjectId
      : task.outcome?.subjectId || task.subjectId;
    const lines = {
      committed: `${e.name(task.targetId)} said they are voting ${e.name(reportedTargetId)}.`,
      conditional: `${e.name(task.targetId)} is open, but gave a condition: ${task.outcome?.line || ""}`,
      leaning: `${e.name(task.targetId)} is leaning ${e.name(reportedTargetId)}, but has not promised.`,
      refused: `${e.name(task.targetId)} refused.`,
      hedge: `${e.name(task.targetId)} would not commit.`,
      coming: `${e.name(task.targetId)} agreed to come over.`,
      unreached: "I could not reach them.",
      pending: "I have not finished talking to them.",
      not_done: "I did not do it.",
      open: task.outcome?.line || "They are still thinking.",
    };
    const line = lines[reported] || "I do not have a clear answer yet.";
    e.statement(
      { ...a, location: e.place(delegateId) },
      {
        speakerId: delegateId,
        listenerIds: [requester],
        subjectId: task.targetId,
        topic: "task_report",
        stance: reported,
        mode: falseReport ? "deliberate_lie" : "truthful",
        delegationId: task.id,
        proposition: line,
      },
      random,
    );
    if (
      reportedTargetId &&
      ["committed", "leaning", "conditional"].includes(reported)
    ) {
      const actualClaim = e
        .knowledge(delegateId)
        .filter(
          (k) =>
            same(k.speakerId, task.targetId) &&
            same(k.subjectId, reportedTargetId) &&
            ["commitment", "target"].includes(k.topic),
        )
        .at(-1);
      e.statement(
        a,
        {
          speakerId: delegateId,
          listenerIds: [requester],
          subjectId: reportedTargetId,
          topic: reported === "leaning" ? "target" : "commitment",
          stance:
            reported === "committed"
              ? "yes"
              : reported === "conditional"
                ? "conditional"
                : "lean",
          mode: falseReport ? "deliberate_lie" : "hearsay",
          attributedId: task.targetId,
          sourceChain: [task.targetId, delegateId],
          evidenceIds: !falseReport && actualClaim ? [actualClaim.id] : [],
          conditions: falseReport ? [] : actualClaim?.conditions || [],
          delegationId: task.id,
        },
        random,
      );
    }
    task.reports.push({
      id: a.actionId,
      listenerId: requester,
      reported,
      line,
      day: e.gm.day,
    });
    this.rememberStatus(task, requester, `reported:${reported}`);
    this.rememberStatus(
      task,
      delegateId,
      falseReport ? "false_report" : `reported:${reported}`,
    );
    if (!["pending"].includes(reported)) task.status = "reported";
    return { line, stance: reported };
  }
  defer(id) {
    const t = this.get(id);
    if (t && t.status === "working") t.status = "queued";
  }
  playerResponse(a, result) {
    if (!this.engine.person(a.speakerId)?.isPlayer) return;
    const purposes = {
      recruit: ["ask_vote", "press", "negotiate"],
      verify_vote: ["vote_read"],
      verify_rumor: ["verify"],
      gather: ["vibe", "numbers"],
      warn: ["warn"],
      reassure: ["reassure"],
      decoy: ["decoy"],
      repair: ["repair", "apologize"],
      pass_info: ["share"],
      check_loyalty: ["loyalty"],
      backup: ["backup"],
      split: ["split"],
      leak: ["leak"],
      protect_source: ["secrecy"],
    };
    for (const t of Object.values(this.records))
      if (
        same(t.delegateId, a.speakerId) &&
        ["queued", "finding"].includes(t.status) &&
        a.listenerIds.some((id) => same(id, t.targetId)) &&
        purposes[t.purpose]?.includes(a.type)
      ) {
        t.executionReceipt = a.actionId;
        t.completedAt = this.engine.gm.dayTimer;
        t.status = "awaiting_report";
        this.rememberStatus(t, a.speakerId, "performed");
        t.outcome = {
          stance:
            result.responses.find((r) => same(r.speakerId, t.targetId))
              ?.stance || "open",
          line: result.responses[0]?.line || "",
          listenerId: t.targetId,
        };
        const spoken = this.engine
          .knowledge(a.speakerId)
          .filter(
            (k) =>
              k.id.startsWith(`${a.actionId}:claim:${t.targetId}:`) &&
              ["target", "commitment"].includes(k.topic),
          )
          .at(-1);
        t.outcome.subjectId = spoken?.subjectId || null;
        t.outcome.evidenceId = spoken?.id || null;
      }
    for (const t of Object.values(this.records))
      if (
        same(t.targetId, a.speakerId) &&
        t.status === "awaiting_report" &&
        a.listenerIds.some((id) => same(id, t.delegateId))
      ) {
        if (
          ["promise", "cover_promise", "conditional"].includes(a.type) &&
          same(a.subjectId, t.subjectId)
        )
          t.outcome = {
            stance: a.type === "conditional" ? "conditional" : "committed",
            line: result.playerLine,
            listenerId: a.speakerId,
          };
        else if (a.type === "withdraw")
          t.outcome = {
            stance: "refused",
            line: result.playerLine,
            listenerId: a.speakerId,
          };
      }
  }
  expire() {
    for (const t of Object.values(this.records))
      if (
        t.day !== this.engine.gm.day &&
        !["reported", "refused"].includes(t.status)
      )
        t.status = "expired";
  }
  serialize() {
    return copy({ records: this.records });
  }
  deserialize(p = {}) {
    this.records = p?.records || {};
  }
}
