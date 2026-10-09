import {
  conversationMembers,
  samePerson as same,
} from "./ConversationActionCatalog.js";
import { conversationCharacter } from "./ConversationCharacter.js";
import { TASK_ACTIONS, taskAction } from "./StrategicTaskActions.js";
import StrategicWorkPlanner from "./StrategicWorkPlanner.js";
const copy = (x) => JSON.parse(JSON.stringify(x));
// Persist the chosen job, not the temporary comparison scores used to choose it.
const selectedWork = ({
  value,
  preferSelf,
  preferredExecutorType,
  exposureRisk,
  urgency,
  ...work
}) => copy(work);
// A planner influences conversations only. It never writes ballots or creates a vote solver.
export default class StrategicObjectivePlanner {
  constructor(engine, payload = {}) {
    this.engine = engine;
    this.workPlanner = new StrategicWorkPlanner(engine);
    this.records = payload?.records || {};
    this.dirty = new Set(payload?.dirty || []);
  }
  invalidate(...ids) {
    ids.forEach((id) => this.dirty.add(String(id)));
  }
  intermediary(owner, target, objective, candidates, work = null) {
    const e = this.engine,
      p = conversationCharacter(owner),
      known = e.knowledge(owner.id);
    const connection = (person) => {
      const observations = e.memory
        .getCampObservations(owner.id)
        .filter(
          (k) =>
            (same(k.actorId, person.id) &&
              (k.participantIds || []).some((id) => same(id, target.id))) ||
            (same(k.actorId, target.id) &&
              (k.participantIds || []).some((id) => same(id, person.id))),
        );
      const reported = known.some(
        (k) =>
          k.memberIds?.some((id) => same(id, person.id)) &&
          k.memberIds?.some((id) => same(id, target.id)) &&
          k.confidence >= 0.5,
      );
      return Math.min(1, observations.length * 0.3 + (reported ? 0.4 : 0));
    };
    const scores = candidates
      .filter((x) => !same(x.id, target.id) &&
        !e.tasks.refusedWork(owner.id, x.id, work || {}, objective.id, e.gm.dayTimer))
      .map((person) => {
        const trust = (e.gm.getTrust?.(owner.id, person.id) ?? 50) / 100,
          affinity =
            e.gm.systems.allianceSystem?.getAllianceAffinity(
              owner.id,
              person.id,
            ) || 0,
          support = objective.believedVotes.find((v) =>
            same(v.voterId, person.id),
          ),
          alignment = support?.status === "committed" ? 1 : support ? 0.5 : 0,
          relation = connection(person),
          reliability = e.tasks.reliability(owner.id, person.id),
          risk = known.some(
            (k) => same(k.speakerId, person.id) && k.topic === "alliance_doubt",
          )
            ? 0.25
            : 0,
          priorRefusal = e.tasks.refusedWork(owner.id, person.id,
            work || {}, objective.id, e.gm.dayTimer),
          workload = e.tasks
            .knownTasks(owner.id)
            .filter(
              (t) =>
                same(t.delegateId, person.id) &&
                t.publicStatus === "accepted" &&
                !t.report,
            ).length;
        return {
          person,
          connection: relation,
          score:
            trust * 0.35 +
            affinity * 0.15 +
            alignment * 0.18 +
            relation * 0.25 +
            reliability * 0.55 +
            p.delegationDrive * 0.14 -
            (work?.secrecyNeed
              ? Math.max(0, 0.7 - trust) * 0.4 + Math.max(0, -reliability) * 0.3
              : 0) -
            risk -
            workload * 0.18 -
            (priorRefusal ? 0.5 : 0),
        };
      })
      .filter(
        (x) => x.score >= 0.52 && !e.model?.recent(owner.id, x.person.id, 180),
      )
      .sort(
        (a, b) =>
          b.score - a.score ||
          String(a.person.id).localeCompare(String(b.person.id)),
      );
    const best = scores[0],
      self =
        0.45 +
        ((e.gm.getTrust?.(owner.id, target.id) ?? 50) / 100) * 0.16 +
        p.visibilityTolerance * 0.12 -
        (objective.secrecy ? (1 - p.visibilityTolerance) * 0.13 : 0);
    return best && best.score > self ? best : null;
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
      work = null,
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
      work: work ? copy(work) : null,
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
    if (e.person(ownerId)?.isPlayer) return null;
    if (!model) {
      const owned = e.knowledge(ownerId),
        meaningful = owned.find(
          (k) =>
            [
              "safety",
              "alliance_doubt",
              "idol_suspicion",
              "public_conflict",
            ].includes(k.topic) && !same(k.subjectId, ownerId),
        );
      return meaningful
        ? this.objective(ownerId) ||
            this.establish(ownerId, {
              type: "maintain_connections",
              targetId: meaningful.subjectId,
              rationale: "Maintain useful relationships before immunity",
            })
        : null;
    }
    const early = this.objective(ownerId);
    if (early?.type === "maintain_connections") early.status = "expired";
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
          !k.challenged &&
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
    for (const task of e.tasks
      .knownTasks(ownerId)
      .filter(
        (t) => o.taskIds.includes(t.id) && t.publicStatus === "refused",
      )) {
      o.processedRefusals ||= [];
      if (!o.processedRefusals.includes(task.id)) {
        o.processedRefusals.push(task.id);
        o.revision++;
      }
    }
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
    if (actor.isPlayer) return null;
    e.refreshConditions();
    e.tasks.expire();
    const taskPlan = e.tasks.plan(actor, now);
    if (taskPlan) return taskPlan;
    const o = this.evaluate(actor.id, now);
    if (!o || now <= 180) return null;
    // Keep #356's maturation boundary: the objective layer supplements the
    // established camp agenda once there is a concrete, personally supported move.
    const established = e.model?.state(actor.id);
    if (
      e.model &&
      !o.explicit &&
      (established.confidence < 0.65 ||
        o.believedVotes.filter((v) => v.status === "committed").length < 2)
    )
      return null;
    const p = conversationCharacter(actor),
      known = e.knowledge(actor.id);
    const free = conversationMembers(e.gm).filter(
      (x) =>
        !same(x.id, actor.id) &&
        (!x.campActivity ||
          ["rest", "idle_at_camp", "observe"].includes(x.campActivity.type)),
    );
    const dispute = e
      .events(actor.id)
      .find(
        (k) =>
          k.topic === "task_report_dispute" &&
          !o.steps.some((step) => step.eventId === k.id),
      );
    if (dispute) {
      const listener = e.person(dispute.proposition.delegateId);
      if (listener && !e.model?.recent(actor.id, listener.id, 180))
        return {
          type: listener.isPlayer ? "approach_player" : "strategy_conversation",
          location: e.place(listener.id),
          targetId: listener.id,
          duration: listener.isPlayer ? 45 : 120,
          objectiveId: o.id,
          purpose: "objective_confront",
          agenda: {
            purpose: "objective_confront",
            objectiveId: o.id,
            eventId: dispute.id,
            primarySubject: listener.id,
          },
        };
    }
    const follow = e.tasks
      .knownTasks(actor.id)
      .find(
        (t) =>
          same(t.requesterId, actor.id) &&
          ["accepted", "hedged"].includes(t.publicStatus) &&
          !t.report &&
          now <
            (e.tasks.get(t.id).lastFollowupAt ?? e.tasks.get(t.id).createdAt) -
              (t.purpose === "bring" ? 900 : 300),
      );
    if (follow) {
      const listener = e.person(follow.delegateId);
      if (listener)
        return {
          type: listener.isPlayer ? "approach_player" : "strategy_conversation",
          location: e.place(listener.id),
          targetId: listener.id,
          duration: listener.isPlayer ? 45 : 120,
          objectiveId: o.id,
          purpose: "objective_followup",
          agenda: {
            purpose: "objective_followup",
            objectiveId: o.id,
            followTaskId: follow.id,
            primarySubject: follow.targetId,
          },
        };
    }
    const supplied =
      o.work &&
      TASK_ACTIONS[o.work.purpose] &&
      (!o.work.claimId || known.some((k) => k.id === o.work.claimId)) &&
      (!o.work.eventId ||
        e.events(actor.id).some((k) => k.id === o.work.eventId))
        ? o.work
        : null;
    const needs = supplied
      ? [supplied]
      : this.workPlanner.candidates(actor, o, now);
    const work = needs.find(
      (w) =>
        free.some((x) => same(x.id, w.targetId)) &&
        !e.model?.recent(actor.id, w.targetId, 420),
    );
    if (!work) return null;
    // Preserve the established agenda until an ordinary voting move is ready.
    const own = e.model?.state(actor.id);
    if (
      !o.explicit &&
      ["recruit", "bring"].includes(work.purpose) &&
      (!own ||
        own.confidence < 0.65 ||
        o.believedVotes.filter((v) => v.status === "committed").length < 2)
    )
      return null;
    const target = e.person(work.targetId);
    const publicAudience = conversationMembers(e.gm).filter(
      (x) => e.together(actor.id, x.id) && !same(x.id, actor.id),
    ).length;
    const pending = e.tasks
      .knownTasks(actor.id)
      .filter(
        (t) =>
          same(t.requesterId, actor.id) &&
          t.day === e.gm.day &&
          !t.report &&
          ["accepted", "pending", "hedged"].includes(t.publicStatus),
      );
    if (
      pending.some(
        (t) => t.purpose === "bring" && now > e.tasks.get(t.id).createdAt - 900,
      )
    )
      return { type: "observe", location: e.place(actor.id), duration: 120 };
    const intermediary = this.intermediary(
      actor,
      target,
      o,
      free.filter((x) => !same(x.id, o.targetId)),
      work,
    );
    // Lower-bound logistics, not a success estimate: a request, target exchange
    // and report each need a real reservation. Near Tribal, act personally if
    // the intermediary chain cannot possibly finish. Busy targets can still move.
    const walk = (from, to) => e.camp.minimumTravelSeconds(e.place(from), e.place(to));
    const delegateSeconds = intermediary ? walk(actor.id, intermediary.person.id) + 120 +
      walk(intermediary.person.id, target.id) + 120 +
      (work.purpose === "bring" ? walk(target.id, actor.id) : walk(target.id, actor.id) + 120) : Infinity;
    const delegate = intermediary && !work.preferSelf && pending.length < 2 && delegateSeconds < now;
    if (
      publicAudience > 2 &&
      work.secrecyNeed &&
      p.visibilityTolerance < 0.3 &&
      !delegate &&
      work.urgency < 0.9
    )
      return { type: "observe", location: e.place(actor.id), duration: 120 };
    const listener = delegate ? intermediary.person : target;
    if (walk(actor.id, listener.id) + (listener.isPlayer ? 45 : 120) >= now) return null;
    return {
      type: listener.isPlayer ? "approach_player" : "strategy_conversation",
      location: e.place(listener.id),
      targetId: listener.id,
      duration: listener.isPlayer ? 45 : 120,
      purpose: delegate ? "objective_delegate" : "objective_recruit",
      objectiveId: o.id,
      agenda: {
        purpose: delegate ? "objective_delegate" : "objective_recruit",
        objectiveId: o.id,
        primarySubject: work.subjectId || o.targetId,
        delegateTargetId: target.id,
        requestedAction: work.purpose,
        claimId: work.claimId,
        eventId: work.eventId,
        work: selectedWork(work),
      },
    };
  }
  execute(actor, listener, activity) {
    const e = this.engine,
      o = this.records[activity.objectiveId || activity.agenda?.objectiveId];
    if (!o || !e.together(actor.id, listener.id)) return null;
    const purpose = activity.agenda?.purpose,
      delegate = purpose === "objective_delegate",
      personalWork =
        purpose === "objective_recruit" && (activity.agenda?.work || o.work)
          ? taskAction(
              e,
              {
                ...(activity.agenda?.work || o.work),
                targetId: listener.id,
                delegateId: actor.id,
                requesterId: actor.id,
                primaryTargetId: o.targetId,
              },
              actor.id,
            )
          : null,
      type =
        purpose === "objective_confront"
          ? "confront"
          : purpose === "objective_followup"
            ? "follow_task"
            : purpose === "objective_backup"
              ? "backup"
              : purpose === "objective_leak_test"
                ? "leak_test"
                : delegate
                  ? "delegate"
                  : personalWork?.type === "come_with_me"
                    ? e.model
                      ? "ask_vote"
                      : "loyalty"
                    : personalWork?.type || "ask_vote";
    const subjectId =
      type === "backup"
        ? e.model.alternateTarget(actor.id, [actor.id, listener.id, o.targetId])
        : delegate
          ? activity.agenda.delegateTargetId
          : personalWork?.type === "come_with_me"
            ? e.model
              ? o.targetId
              : null
            : personalWork
              ? personalWork.subjectId
              : o.targetId;
    if (subjectId == null && !personalWork) return null;
    const a = e.action(type, {
      ...(personalWork || {}),
      actionId: `${activity.id}:objective`,
      speakerId: actor.id,
      listenerIds: [listener.id],
      subjectId,
      planTargetId: activity.agenda?.primarySubject || o.targetId,
      primaryTargetId: o.targetId,
      claimId: activity.agenda?.claimId,
      eventId: activity.agenda?.eventId,
      requestedAction: activity.agenda?.requestedAction || "recruit",
      requestedTruthMode: delegate
        ? activity.agenda?.work?.truthMode
        : undefined,
      delegationId: activity.agenda?.followTaskId,
      objectiveId: o.id,
      workKey: activity.agenda?.work?.key,
      activityId: activity.id,
      keepSourcePrivate:
        activity.agenda?.work?.keepSourcePrivate ??
        (o.secrecy && activity.agenda?.requestedAction !== "bring"),
      reasonLine: activity.agenda?.work?.reasonLine,
      reasonClaimId: activity.agenda?.work?.reasonClaimId,
      dependencyIds: activity.agenda?.work?.dependencyIds || [],
      line:
        type === "follow_task"
          ? `Did you talk to ${e.name(e.tasks.get(activity.agenda.followTaskId)?.targetId)}?`
          : undefined,
    });
    const r = e.resolve(a);
    if (type === "follow_task" && !r.invalid) {
      const task = e.tasks.get(a.delegationId);
      if (task) task.lastFollowupAt = e.gm.dayTimer;
    }
    if (!r.invalid) {
      e.model?.contact([actor.id, listener.id]);
      const work = activity.agenda?.work;
      if (work?.key) {
        o.workReceipts ||= {};
        const task = Object.values(e.tasks.records).find((t) =>
          t.workKey === work.key && t.requesterId === actor.id &&
          t.requestClaimId?.startsWith(a.actionId));
        o.workReceipts[work.key] = {
          day: e.gm.day, at: e.gm.dayTimer,
          kind: delegate ? "request" : "attempt", taskId: task?.id || null,
        };
        o.selectedWork = copy(work);
      }
      o.steps.push({
        actionId: a.actionId,
        type: a.type,
        listenerId: listener.id,
        eventId: a.eventId,
      });
      for (const t of Object.values(e.tasks.records).filter(
        (t) => t.objectiveId === o.id,
      ))
        if (!o.taskIds.includes(t.id)) o.taskIds.push(t.id);
    }
    return r;
  }
  serialize() {
    return copy({ records: this.records, dirty: [...this.dirty] });
  }
  deserialize(p = {}) {
    this.records = p?.records || {};
    this.dirty = new Set(p?.dirty || []);
  }
}
