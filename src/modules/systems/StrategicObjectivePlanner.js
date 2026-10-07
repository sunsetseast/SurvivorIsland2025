import {
  conversationMembers,
  samePerson as same,
} from "./ConversationActionCatalog.js";
import { conversationCharacter } from "./ConversationCharacter.js";
const copy = (x) => JSON.parse(JSON.stringify(x));
// A planner influences conversations only. It never writes ballots or creates a vote solver.
export default class StrategicObjectivePlanner {
  constructor(engine, payload = {}) {
    this.engine = engine;
    this.records = payload?.records || {};
    this.dirty = new Set();
  }
  invalidate(...ids) {
    ids.forEach((id) => this.dirty.add(String(id)));
  }
  objective(ownerId) {
    return (
      Object.values(this.records).find(
        (o) =>
          same(o.ownerId, ownerId) &&
          o.day === this.engine.gm.day &&
          !["abandoned", "expired"].includes(o.status),
      ) || null
    );
  }
  establish(
    ownerId,
    {
      type = "build_majority",
      targetId,
      rationale = "Improve my position",
      backupTargetId = null,
      explicit = false,
    } = {},
  ) {
    const e = this.engine;
    if (!e.person(ownerId) || same(ownerId, targetId) || !e.person(targetId))
      return null;
    const id = `objective:${e.gm.day}:${ownerId}:${type}:${targetId}`;
    if (explicit)
      for (const old of Object.values(this.records))
        if (old.id !== id && same(old.ownerId, ownerId) && old.day === e.gm.day)
          old.status = "abandoned";
    if (this.records[id]) {
      if (explicit) {
        this.records[id].explicit = true;
        this.records[id].status = "planning";
      }
      return this.records[id];
    }
    return (this.records[id] ||= {
      id,
      ownerId,
      type,
      targetId,
      explicit,
      rationale,
      desiredOutcome: "a viable individual voting plan",
      requiredVotes: Math.floor(conversationMembers(e.gm).length / 2) + 1,
      believedVotes: [],
      confidence: 0,
      risks: [],
      secrecy: type === "blindside",
      coverStory: null,
      backupTargetId,
      deadline: 0,
      day: e.gm.day,
      status: "planning",
      taskIds: [],
      steps: [],
      revision: 0,
      lastEvaluated: null,
    });
  }
  evaluate(ownerId, now) {
    const e = this.engine,
      model = e.model;
    if (!model || e.person(ownerId)?.isPlayer) return null;
    const state = model.refresh(ownerId),
      p = conversationCharacter(e.person(ownerId));
    let o = this.objective(ownerId);
    if (!o && state.intendedVoteId && !same(ownerId, state.intendedVoteId))
      o = this.establish(ownerId, {
        type:
          state.safetyBelief < 0.4
            ? "save_self"
            : p.coverDrive > 0.5
              ? "blindside"
              : "build_majority",
        targetId: state.intendedVoteId,
        rationale:
          state.safetyBelief < 0.4
            ? "My name is coming up"
            : "Build support for my preferred move",
      });
    if (!o) return null;
    const key = `${e.gm.day}:${Math.floor(now / 120)}`;
    if (o.lastEvaluated === key && !this.dirty.has(String(ownerId))) return o;
    this.dirty.delete(String(ownerId));
    o.lastEvaluated = key;
    if (!model.strategy.isTargetIdAvailable(o.targetId)) {
      o.status = "abandoned";
      return o;
    }
    const support = model
      .planSupport(ownerId)
      .accounts.filter((v) => same(v.targetId, o.targetId));
    o.believedVotes = support.map((v) => ({
      voterId: v.voterId,
      status: v.confirmed ? "committed" : "leaning",
      evidenceId: v.evidenceId,
    }));
    o.confidence = Math.min(
      1,
      (support.reduce((n, v) => n + v.weight, 0) + 1) / o.requiredVotes,
    );
    const owned = e.knowledge(ownerId),
      idol = owned.find(
        (k) =>
          same(k.subjectId, o.targetId) &&
          ["idol_possession", "idol_suspicion"].includes(k.topic) &&
          !["no", "denied", "unlikely"].includes(k.stance),
      );
    const leak = owned.find(
      (k) => k.topic === "alliance_doubt" && k.stance === "uncertain",
    );
    o.risks = [
      ...(idol ? ["idol_concern"] : []),
      ...(leak ? ["possible_leak"] : []),
    ];
    const reports = owned.filter(
      (k) => k.topic === "task_report" && o.taskIds.includes(k.delegationId),
    );
    o.processedReports ||= [];
    for (const report of reports)
      if (!o.processedReports.includes(report.id)) {
        o.processedReports.push(report.id);
        if (
          ["refused", "unreached", "not_done", "conditional"].includes(
            report.stance,
          )
        )
          o.revision++;
      }
    o.requiredPeople = [
      ...new Set(
        owned
          .filter(
            (k) =>
              k.topic === "commitment" &&
              same(k.subjectId, o.targetId) &&
              k.stance === "conditional",
          )
          .flatMap((k) => k.conditions || [])
          .filter((c) => c.kind === "known_commitment")
          .map((c) => c.voterId),
      ),
    ];
    if (o.risks.length && state.backup)
      o.backupTargetId = state.backup.targetId;
    if (
      !same(state.intendedVoteId, o.targetId) &&
      reports.length &&
      o.confidence < 0.45
    ) {
      o.status = "abandoned";
      return null;
    }
    o.status = o.confidence >= 0.8 ? "coordinating" : "recruiting";
    return o;
  }
  plan(actor, now) {
    const e = this.engine;
    if (!e.model || actor.isPlayer) return null;
    e.refreshConditions();
    e.tasks.expire();
    const taskPlan = e.tasks.plan(actor, now);
    if (taskPlan) return taskPlan;
    const o = this.evaluate(actor.id, now);
    if (!o || now <= 180) return null;
    // Do not displace the established short-term agenda before the speaker has
    // a concrete move and personally heard support. Explicit proposals can start earlier.
    const own = e.model.state(actor.id);
    if (
      !o.explicit &&
      (own.confidence < 0.65 ||
        o.believedVotes.filter((v) => v.status === "committed").length < 2)
    )
      return null;
    const p = conversationCharacter(actor),
      known = e.knowledge(actor.id),
      free = conversationMembers(e.gm).filter(
        (x) =>
          !x.isPlayer &&
          !same(x.id, actor.id) &&
          !same(x.id, o.targetId) &&
          (!x.campActivity ||
            ["rest", "idle_at_camp", "observe"].includes(x.campActivity.type)),
      );
    const unknown = free.filter(
      (x) =>
        !o.believedVotes.some(
          (v) => same(v.voterId, x.id) && v.status === "committed",
        ),
    );
    const failed = new Set(
      known
        .filter((k) => k.topic === "task_report" && k.stance === "refused")
        .map((k) => String(k.subjectId)),
    );
    const candidates = unknown.filter(
      (x) => !failed.has(String(x.id)) && !e.model.recent(actor.id, x.id, 420),
    );
    if (!candidates.length) return null;
    const ally = free
      .filter(
        (x) =>
          !same(x.id, o.targetId) &&
          o.believedVotes.some(
            (v) => same(v.voterId, x.id) && v.status === "committed",
          ),
      )
      .sort(
        (a, b) =>
          (e.gm.getTrust?.(actor.id, b.id) ?? 50) -
          (e.gm.getTrust?.(actor.id, a.id) ?? 50),
      )[0];
    const pending = o.taskIds.some((id) => {
      const task = e.tasks.knownTasks(actor.id).find((t) => t.id === id);
      return task && !task.report && task.publicStatus === "accepted";
    });
    const target = candidates.sort(
      (a, b) =>
        Number(o.requiredPeople.some((id) => same(id, b.id))) -
          Number(o.requiredPeople.some((id) => same(id, a.id))) ||
        (e.gm.getTrust?.(actor.id, b.id) ?? 50) -
          (e.gm.getTrust?.(actor.id, a.id) ?? 50),
    )[0];
    const publicAudience = conversationMembers(e.gm).filter(
      (x) => e.together(actor.id, x.id) && !same(x.id, actor.id),
    ).length;
    if (pending && p.visibilityTolerance < 0.6)
      return { type: "observe", location: e.place(actor.id), duration: 120 };
    const delegate =
      ally &&
      p.delegationDrive > 0.55 &&
      !pending &&
      !same(ally.id, target.id) &&
      !e.model.recent(actor.id, ally.id, 180);
    if (
      publicAudience > 2 &&
      o.secrecy &&
      p.visibilityTolerance < 0.3 &&
      !delegate
    )
      return { type: "observe", location: e.place(actor.id), duration: 120 };
    const listener = delegate ? ally : target;
    const contingency =
      o.explicit && o.risks.includes("idol_concern") && !o.backupTargetId;
    const leakTest =
      o.explicit &&
      o.risks.includes("possible_leak") &&
      p.coverDrive > 0.5 &&
      !o.steps.some((s) => s.type === "leak_test");
    return {
      type: "strategy_conversation",
      location: e.place(listener.id),
      targetId: listener.id,
      duration: 120,
      objectiveId: o.id,
      agenda: {
        purpose: contingency
          ? "objective_backup"
          : leakTest
            ? "objective_leak_test"
            : delegate
              ? "objective_delegate"
              : "objective_recruit",
        objectiveId: o.id,
        primarySubject: o.targetId,
        delegateTargetId: target.id,
      },
    };
  }
  execute(actor, listener, activity) {
    const e = this.engine,
      o = this.records[activity.objectiveId || activity.agenda?.objectiveId];
    if (!o || !e.together(actor.id, listener.id)) return null;
    const purpose = activity.agenda?.purpose,
      delegate = purpose === "objective_delegate",
      type =
        purpose === "objective_backup"
          ? "backup"
          : purpose === "objective_leak_test"
            ? "leak_test"
            : delegate
              ? "delegate"
              : "ask_vote";
    const subjectId =
      type === "backup"
        ? e.model.alternateTarget(actor.id, [actor.id, listener.id, o.targetId])
        : delegate
          ? activity.agenda.delegateTargetId
          : o.targetId;
    if (subjectId == null) return null;
    const a = e.action(type, {
      actionId: `${activity.id}:objective`,
      speakerId: actor.id,
      listenerIds: [listener.id],
      subjectId,
      planTargetId: o.targetId,
      requestedAction: "recruit",
      objectiveId: o.id,
      activityId: activity.id,
      keepSourcePrivate: o.secrecy,
    });
    const r = e.resolve(a);
    if (!r.invalid) {
      e.model.contact([actor.id, listener.id]);
      o.steps.push({
        actionId: a.actionId,
        type: a.type,
        listenerId: listener.id,
      });
      for (const t of Object.values(e.tasks.records).filter(
        (t) => t.objectiveId === o.id,
      ))
        if (!o.taskIds.includes(t.id)) o.taskIds.push(t.id);
    }
    return r;
  }
  serialize() {
    return copy({ records: this.records });
  }
  deserialize(p = {}) {
    this.records = p?.records || {};
    this.dirty = new Set();
  }
}
