import {
  TASK_PURPOSES,
  samePerson as same,
  conversationMembers,
} from "./ConversationActionCatalog.js";
import { conversationCharacter } from "./ConversationCharacter.js";
import {
  matchesTask,
  taskAction,
  taskDescription,
  taskSuggestion,
} from "./StrategicTaskActions.js";
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
        conditions: copy(t.conditions || []),
        publicStatus: t.publicStatus,
        day: t.day,
        objectiveId: t.objectiveId,
        report:
          (t.reports || []).filter((r) => same(r.listenerId, ownerId)).at(-1) ||
          null,
      }));
  }
  reliability(ownerId, delegateId) {
    const owned = this.engine.memory
      .getConversationObligations(ownerId)
      .filter((t) => t.kind === "task" && same(t.speakerId, delegateId));
    let value = 0;
    for (const t of owned.slice(-12)) {
      if (
        [
          "reported:arrived",
          "reported:committed",
          "reported:conditional",
          "reported:open",
        ].includes(t.status)
      )
        value += 0.08;
      if (t.status === "refused") value -= 0.035;
      if (t.status === "reported:not_done") value -= 0.15;
      if (t.status === "report_disputed") value -= 0.22;
    }
    const source =
      this.engine.memory.memory[String(ownerId)]?.campSourceReliability?.[
        String(delegateId)
      ] ?? 0.75;
    return Math.max(-0.8, Math.min(0.6, value + (source - 0.75) * 0.5));
  }
  playerRequests(ownerId) {
    this.expire();
    const states = {
      pending: "Requested",
      hedged: "Not promised",
      queued: "Active",
      finding: "In progress",
      ready_to_walk: "Ready to walk together",
      bringing: "Walking together",
      awaiting_report: "Ready to report",
      reported: "Reported",
      refused: "Declined",
      ignored: "Left undone",
      expired: "Expired",
      abandoned: "Unfinished",
    };
    return Object.values(this.records)
      .filter((t) => same(t.delegateId, ownerId))
      .slice(-20)
      .reverse()
      .map((t) => ({
        id: t.id,
        requesterId: t.requesterId,
        targetId: t.targetId,
        purpose: t.purpose,
        requester: this.engine.name(t.requesterId),
        description: taskDescription(this.engine, t),
        status:
          t.status === "reported" && t.outcome?.stance === "arrived"
            ? "Completed"
            : states[t.status] || "Active",
        active: [
          "queued",
          "finding",
          "ready_to_walk",
          "bringing",
          "awaiting_report",
        ].includes(t.status),
        canIgnore: [
          "queued",
          "finding",
          "ready_to_walk",
          "awaiting_report",
        ].includes(t.status),
        canReport:
          t.publicStatus === "accepted" &&
          !["reported", "expired"].includes(t.status),
        canWalk: t.status === "ready_to_walk",
        meetingIds: t.outcome?.stance === "arrived" ? t.meetingIds || [] : [],
        reportLine: t.reports?.at(-1)?.line || null,
      }));
  }
  assignedRequests(ownerId) {
    return this.knownTasks(ownerId)
      .filter((t) => same(t.requesterId, ownerId))
      .slice(-12)
      .reverse()
      .map((t) => ({
        id: t.id,
        delegateId: t.delegateId,
        targetId: t.targetId,
        description: taskDescription(this.engine, t),
        delegate: this.engine.name(t.delegateId),
        status:
          t.report?.line ||
          {
            accepted: "Agreed — awaiting report",
            pending: "Awaiting an answer",
            hedged: "Has not promised",
            refused: "Declined",
          }[t.publicStatus],
      }));
  }
  suggestions(ownerId, listenerIds) {
    this.expire();
    return Object.values(this.records)
      .filter(
        (t) =>
          same(t.delegateId, ownerId) &&
          ["queued", "finding", "ready_to_walk"].includes(t.status) &&
          listenerIds.some((id) => same(id, t.targetId)),
      )
      .map((t) => taskSuggestion(this.engine, t))
      .filter(Boolean);
  }
  ignore(id, ownerId) {
    const t = this.get(id);
    if (
      !t ||
      !same(t.delegateId, ownerId) ||
      t.publicStatus !== "accepted" ||
      !["queued", "finding", "ready_to_walk", "awaiting_report"].includes(
        t.status,
      )
    )
      return false;
    t.status = "ignored";
    this.rememberStatus(t, ownerId, "ignored");
    this.engine.memory.recordConversationHistory({
      id: `${t.id}:ignored`,
      participantIds: [ownerId],
      speakerId: ownerId,
      subjectId: t.targetId,
      type: "task_left_undone",
      topic: "delegation",
      day: this.engine.gm.day,
      campTime: this.engine.gm.dayTimer,
      delegationId: t.id,
    });
    return true;
  }
  acceptance(delegate, requester, task) {
    const e = this.engine,
      p = conversationCharacter(delegate),
      trust = (e.gm.getTrust?.(delegate.id, requester.id) ?? 50) / 100,
      affinity =
        e.gm.systems.allianceSystem?.getAllianceAffinity(
          delegate.id,
          requester.id,
        ) || 0,
      targetRisk =
        e.gm.systems.allianceSystem?.getAllianceAffinity(
          delegate.id,
          task.subjectId,
        ) || 0,
      workload = Object.values(this.records).filter(
        (t) =>
          t.id !== task.id &&
          same(t.delegateId, delegate.id) &&
          ["queued", "finding", "working", "awaiting_report"].includes(
            t.status,
          ),
      ).length;
    const score =
      trust * 0.5 +
      affinity * 0.25 +
      p.delegationDrive * 0.15 +
      p.loyalty * 0.15 -
      targetRisk * 0.3 -
      workload * 0.2;
    return score >= 0.47 ? "accepted" : score >= 0.3 ? "hedged" : "refused";
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
      subjectId: ["recruit", "decoy", "backup", "split"].includes(a.purpose)
        ? a.planTargetId || e.ownTarget(requester.id)
        : null,
      purpose: a.purpose,
      claimId: a.claimId || null,
      requestClaimId:
        e
          .knowledge(delegate.id)
          .find(
            (k) =>
              k.id.startsWith(`${a.actionId}:claim:`) &&
              k.topic === "delegation",
          )?.id || null,
      eventId: a.eventId || null,
      primaryTargetId: ["backup", "split"].includes(a.purpose)
        ? a.primaryTargetId || e.ownTarget(requester.id)
        : null,
      destination: e.place(requester.id),
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
    const objective = e.objectives.records[task.objectiveId];
    if (objective && !objective.taskIds.includes(id))
      objective.taskIds.push(id);
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
    const incident = e.events(requester.id).find((k) => k.id === a.eventId);
    if (incident) {
      const told = e.statement(
        a,
        {
          speakerId: requester.id,
          listenerIds: [delegate.id],
          subjectId: incident.subjectId || target.id,
          topic: incident.topic,
          stance: incident.stance || "remembered",
          mode: "hearsay",
          evidenceIds: [incident.id],
          proposition: incident.proposition,
        },
        random,
      );
      task.eventId = told?.id || task.eventId;
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
          claimId: task.claimId || task.requestClaimId || a.actionId,
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
    const answer =
      accept === "hedge" ? "hedged" : accept ? "accepted" : "refused";
    t.publicStatus = answer;
    t.status = answer === "accepted" ? "queued" : answer;
    for (const id of [t.delegateId, t.requesterId])
      this.rememberStatus(t, id, t.publicStatus);
    if (answer === "accepted" && (t.keepSourcePrivate || t.secrecy?.requested))
      this.engine.memory.recordConversationObligation(
        {
          id: `${t.id}:secrecy`,
          kind: "secrecy",
          speakerId: ownerId,
          requesterId: t.requesterId,
          claimId: t.claimId || t.requestClaimId,
          allowedIds: [ownerId, t.requesterId, t.targetId],
          useWithoutName: t.keepSourcePrivate,
          status: "accepted",
          day: t.day,
        },
        [ownerId, t.requesterId],
      );
    this.engine.objectives.invalidate(t.requesterId, t.delegateId);
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
    const fields = taskAction(e, task, actor.id);
    if (!fields) {
      task.status = "awaiting_report";
      task.outcome = {
        stance: "unreached",
        line: "I did not have enough information to do what you asked.",
      };
      return null;
    }
    let { type, subjectId, claimId, eventId } = fields;
    if (task.executionMode === "leak") {
      type = "warn";
      subjectId = task.subjectId;
    }
    const action = e.action(type, {
      actionId: `${activity.id}:task:${task.id}`,
      speakerId: actor.id,
      listenerIds: [listener.id],
      subjectId,
      claimId,
      eventId,
      planTargetId: task.primaryTargetId,
      primaryTargetId: task.primaryTargetId,
      requesterId: task.requesterId,
      objectiveId: task.objectiveId,
      delegationId: task.id,
      activityId: activity.id,
      keepSourcePrivate: fields.keepSourcePrivate,
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
    this.recordOutcome(task, action, result);
    if (task.purpose === "bring" && task.status === "ready_to_walk")
      this.beginBring(task.id, actor.id);
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
    if (voluntary && task.publicStatus !== "accepted")
      return { line: "I have not agreed to that request.", stance: "unknown" };
    if (task.publicStatus === "hedged" && !e.person(delegateId)?.isPlayer) {
      const answer = this.acceptance(
        e.person(delegateId),
        e.person(task.requesterId),
        task,
      );
      if (answer !== "hedged")
        this.respond(task.id, delegateId, answer === "accepted");
      return {
        line:
          answer === "accepted"
            ? "I can take that on now."
            : answer === "refused"
              ? "I cannot do it."
              : "Maybe. I still cannot promise.",
        stance: answer,
      };
    }
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
        (delegate?.isPlayer &&
        ["not_done", "unreached"].includes(a.reportStance)
          ? a.reportStance
          : null) ||
        task.outcome?.stance ||
        (["finding", "working", "queued", "bringing", "ready_to_walk"].includes(
          task.status,
        )
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
      open: task.outcome?.line
        ? `${e.name(task.targetId)} told me: “${task.outcome.line}”`
        : "They are still thinking.",
      arrived: "We reached you together.",
      requester_moved: "We got there, but you had moved.",
    };
    const line =
      falseReport && task.purpose !== "recruit"
        ? `I did what you asked with ${e.name(task.targetId)}. It went well.`
        : lines[reported] || "I do not have a clear answer yet.";
    e.statement(
      { ...a, location: e.place(delegateId) },
      {
        speakerId: delegateId,
        listenerIds: [
          ...new Set([
            requester,
            ...a.listenerIds.filter((id) => !same(id, delegateId)),
          ]),
        ],
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
      ["recruit", "verify_vote", "gather", "check_loyalty"].includes(
        task.purpose,
      ) &&
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
          listenerIds: [
            ...new Set([
              requester,
              ...a.listenerIds.filter((id) => !same(id, delegateId)),
            ]),
          ],
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
    if (
      !task.reportConsequence &&
      !falseReport &&
      ["arrived", "committed", "conditional", "open"].includes(reported)
    ) {
      e.trust(requester, delegateId, 1, "followed_through_on_request");
      task.reportConsequence = true;
    } else if (!task.reportConsequence && reported === "not_done") {
      e.trust(requester, delegateId, -1, "admitted_unfinished_request");
      task.reportConsequence = true;
    }
    if (!["pending", "coming"].includes(reported)) task.status = "reported";
    e.objectives.invalidate(requester);
    return { line, stance: reported };
  }
  defer(id) {
    const t = this.get(id);
    if (t && t.status === "working") t.status = "queued";
  }
  recordOutcome(t, a, result) {
    const e = this.engine,
      response = result.responses.find((r) => same(r.speakerId, t.targetId));
    const spoken = e
      .knowledge(a.speakerId)
      .filter(
        (k) =>
          k.id.startsWith(`${a.actionId}:claim:${t.targetId}:`) &&
          ["target", "commitment"].includes(k.topic),
      )
      .at(-1);
    t.executionReceipt = a.actionId;
    t.completedAt = e.gm.dayTimer;
    t.outcome = {
      stance: response?.stance || "open",
      line: response?.line || "",
      listenerId: t.targetId,
      subjectId: spoken?.subjectId || null,
      evidenceId: spoken?.id || null,
      conditions: copy(spoken?.conditions || []),
    };
    t.status =
      t.purpose === "bring" && response?.stance === "coming"
        ? "ready_to_walk"
        : "awaiting_report";
    this.rememberStatus(
      t,
      a.speakerId,
      t.status === "ready_to_walk" ? "coming" : "performed",
    );
  }
  invite(a, listenerId, random) {
    const e = this.engine,
      listener = e.person(listenerId);
    if (listener?.isPlayer)
      return { line: "Will you come with me?", stance: "pending" };
    const p = conversationCharacter(listener),
      requesterId = a.subjectId,
      trust = (e.gm.getTrust?.(listenerId, a.speakerId) ?? 50) / 100,
      requesterTrust = (e.gm.getTrust?.(listenerId, requesterId) ?? 50) / 100,
      affinity =
        e.gm.systems.allianceSystem?.getAllianceAffinity(
          listenerId,
          requesterId,
        ) || 0;
    const warning = e
      .knowledge(listenerId)
      .some(
        (k) =>
          ["target", "safety"].includes(k.topic) &&
          same(k.subjectId, listenerId) &&
          (same(k.speakerId, requesterId) || same(k.attributedId, requesterId)),
      );
    const score =
      trust * 0.4 +
      requesterTrust * 0.3 +
      affinity * 0.2 +
      p.visibilityTolerance * 0.15 -
      p.paranoiaDrive * 0.08 -
      (warning ? 0.4 : 0) -
      (a.listenerIds.length > 1 ? 0.07 : 0) -
      random() * 0.04;
    if (score >= 0.4)
      return {
        line: `All right. I’ll come with you to talk to ${e.name(requesterId)}.`,
        stance: "coming",
      };
    if (score >= 0.33)
      return {
        line: "Why do they want me? I need to know more first.",
        stance: "ask_why",
      };
    if (score >= 0.27)
      return {
        line: "Maybe later. They can come find me here.",
        stance: "later",
      };
    return {
      line: "No. I am staying here. Tell them to come to me.",
      stance: "refused",
    };
  }
  beginBring(id, delegateId) {
    const t = this.get(id),
      e = this.engine;
    if (
      !t ||
      !same(t.delegateId, delegateId) ||
      t.status !== "ready_to_walk" ||
      !e.together(delegateId, t.targetId) ||
      e.camp.conversation
    )
      return false;
    if (e.place(delegateId) === t.destination) {
      this.arrived(e.person(delegateId), {
        taskId: id,
        route: [],
        participantIds: [t.targetId],
      });
      return true;
    }
    const moved = e.camp.moveTogether(
      e.person(delegateId),
      e.person(t.targetId),
      t.destination,
      { taskId: t.id },
    );
    if (moved) t.status = "bringing";
    return Boolean(moved);
  }
  arrived(actor, activity) {
    const t = this.get(activity.taskId),
      e = this.engine;
    if (
      !t ||
      t.purpose !== "bring" ||
      !same(actor.id, t.delegateId) ||
      activity.route?.length ||
      !e.together(actor.id, t.targetId)
    )
      return;
    const reached = e.together(actor.id, t.requesterId);
    t.status = "awaiting_report";
    t.outcome = {
      ...t.outcome,
      stance: reached ? "arrived" : "requester_moved",
      line: reached
        ? "We reached you together."
        : "We got there, but you had moved.",
    };
    this.rememberStatus(t, actor.id, "performed");
    if (reached) {
      const r = e.resolve(
        e.action("report", {
          actionId: `${t.id}:physical-arrival`,
          speakerId: actor.id,
          listenerIds: [t.requesterId, t.targetId],
          delegationId: t.id,
        }),
      );
      t.meetingIds = [t.requesterId, t.targetId];
      e.objectives.invalidate(t.requesterId);
      return r;
    }
  }
  learnReportEvidence(ownerId) {
    const e = this.engine,
      owned = e.knowledge(ownerId);
    for (const t of Object.values(this.records).filter((t) =>
      same(t.requesterId, ownerId),
    )) {
      const reported = owned.find(
        (k) =>
          k.delegationId === t.id &&
          k.topic === "commitment" &&
          same(k.speakerId, t.delegateId),
      );
      const denial =
        reported &&
        owned.find(
          (k) =>
            k.refutesClaimId === reported.id && same(k.speakerId, t.targetId),
        );
      if (!denial || t.disputedBy?.includes(String(ownerId))) continue;
      (t.disputedBy ||= []).push(String(ownerId));
      this.rememberStatus(t, ownerId, "report_disputed");
      e.trust(ownerId, t.delegateId, -2, "contradicted_task_report");
      e.memory.recordConversationHistory({
        id: `${t.id}:disputed:${ownerId}`,
        participantIds: [ownerId],
        speakerId: t.delegateId,
        subjectId: t.targetId,
        type: "task_report_disputed",
        topic: "delegation",
        evidenceIds: [reported.id, denial.id],
        day: e.gm.day,
        campTime: e.gm.dayTimer,
      });
      e.objectives.invalidate(ownerId);
    }
  }
  playerResponse(a, result) {
    if (!this.engine.person(a.speakerId)?.isPlayer) return;
    for (const t of Object.values(this.records))
      if (
        same(t.delegateId, a.speakerId) &&
        ["queued", "finding", "ignored"].includes(t.status) &&
        a.listenerIds.some((id) => same(id, t.targetId)) &&
        matchesTask(this.engine, t, a)
      )
        this.recordOutcome(t, a, result);
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
        (t.day !== this.engine.gm.day ||
          t.phase !== this.engine.gm.gamePhase ||
          this.engine.gm.dayTimer <= t.deadline) &&
        !["reported", "refused"].includes(t.status)
      ) {
        t.status = "expired";
        this.rememberStatus(t, t.delegateId, "expired");
      }
  }
  serialize() {
    return copy({ records: this.records });
  }
  deserialize(p = {}) {
    this.records = p?.records || {};
  }
}
