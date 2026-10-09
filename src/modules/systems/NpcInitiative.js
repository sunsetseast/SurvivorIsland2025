import { conversationCharacter } from "./ConversationCharacter.js";
import { LocationKeys } from "../core/LocationKeys.js";
import eventManager from "../core/EventManager.js";

const same = (a, b) => a != null && b != null && String(a) === String(b);
const copy = (x) => JSON.parse(JSON.stringify(x));
const TERMINAL = new Set(["resolved", "abandoned", "expired"]);
const idle = (p) =>
  !p.campActivity ||
  ["rest", "idle_at_camp", "observe"].includes(p.campActivity.type);
const TYPES = {
  gather_intel: "vote_read",
  check_loyalty: "loyalty",
  recruit_swing: "ask_vote",
  counter_pitch: "pitch",
  warn_ally: "warn",
  reassure_target: "reassure",
  spread_decoy: "decoy",
  establish_backup: "backup",
  verify_story: "verify",
  share_intel: "share",
};

// Initiative coordinates opportunities. It owns neither beliefs, dialogue effects,
// strategic tasks nor votes. Camp activities execute every selected encounter.
export default class NpcInitiative {
  constructor(engine, payload = {}) {
    this.engine = engine;
    this.deserialize(payload);
  }
  get gm() {
    return this.engine.gm;
  }
  get camp() {
    return this.engine.camp;
  }
  get members() {
    return this.camp.members();
  }
  person(id) {
    return this.engine.person(id);
  }
  active(actorId) {
    return this.intentions.find(
      (i) => same(i.actorId, actorId) && !TERMINAL.has(i.status),
    );
  }
  note(i, stage, detail = {}) {
    const direction = this.person(i.targetId)?.isPlayer ? "player" : "npc";
    this.metrics[direction] ||= {};
    this.metrics[direction][stage] = (this.metrics[direction][stage] || 0) + 1;
    this.history.push({
      intentionId: i.id,
      actorId: i.actorId,
      targetId: i.targetId,
      direction,
      stage,
      day: this.gm.day,
      phase: this.gm.gamePhase,
      campTime: this.gm.dayTimer,
      ...detail,
    });
    this.history = this.history.slice(-500);
  }
  // Live physical coordinates are consulted only for the actor and current
  // co-presence. Remote destinations come from this actor's own sightings.
  locate(actorId, targetId) {
    const own = this.engine.place(actorId);
    if (this.engine.present(targetId, own)) return own;
    const sightings = this.engine.memory?.getCampObservations?.(actorId) || [];
    const last = [...sightings]
      .reverse()
      .find(
        (k) =>
          k.day === this.gm.day &&
          k.location &&
          (same(k.actorId, targetId) ||
            (k.participantIds || []).some((id) => same(id, targetId))) &&
          [
            "arrived",
            "departed",
            "seen_together",
            "work",
            "approached",
          ].includes(k.type),
      );
    if (
      !last ||
      !Number.isFinite(last.campTime) ||
      last.campTime - this.gm.dayTimer < 0 ||
      last.campTime - this.gm.dayTimer > 900
    )
      return null;
    // A departure is a witnessed direction, not proof the target arrived.
    return last.location;
  }
  recent(actorId, targetId, key, urgent = false) {
    const exact = this.recency[`${actorId}:${targetId}:${key}`];
    if (
      exact?.day === this.gm.day &&
      exact.phase === this.gm.gamePhase &&
      exact.at - this.gm.dayTimer >= 0 &&
      exact.at - this.gm.dayTimer < 1200
    )
      return true;
    const r = this.recency[`${actorId}:${targetId}`];
    if (!r || r.day !== this.gm.day || r.phase !== this.gm.gamePhase)
      return false;
    const age = r.at - this.gm.dayTimer;
    return age >= 0 && (r.key === key ? age < 1200 : !urgent && age < 300);
  }
  candidates(actor) {
    const e = this.engine,
      p = conversationCharacter(actor),
      owned = e.knowledge(actor.id),
      out = [];
    // Small tribes are bounded further to six relationship-relevant listeners.
    const relevance = (x) =>
      (this.gm.getTrust?.(actor.id, x.id) ?? 50) +
      (same(e.ownTarget(actor.id), x.id) ? 75 : 0) +
      (owned.some((k) => same(k.subjectId, x.id) && k.confidence >= 0.35)
        ? 50
        : 0);
    const targets = this.members
      .filter((x) => !same(x.id, actor.id))
      .sort((a, b) => relevance(b) - relevance(a))
      .slice(0, 6);
    for (const target of targets) {
      const affinity =
        this.gm.systems.allianceSystem?.getAllianceAffinity?.(
          actor.id,
          target.id,
        ) || 0;
      const trust = this.gm.getTrust?.(actor.id, target.id) ?? 50;
      const add = (type, score, fields = {}, reason = type, urgent = false) => {
        const key = `${type}:${target.id}:${fields.subjectId || ""}:${fields.claimId || fields.eventId || ""}`;
        if (!this.recent(actor.id, target.id, key, urgent))
          out.push({
            targetId: target.id,
            type,
            fields,
            key,
            score,
            reason,
            urgent,
          });
      };
      const danger = owned.find(
        (k) =>
          same(k.subjectId, target.id) &&
          ["target", "commitment", "safety"].includes(k.topic) &&
          !["no", "denied", "protect"].includes(k.stance) &&
          !(k.topic === "safety" && k.stance === "yes") &&
          k.confidence >= 0.35 &&
          !k.challenged,
      );
      if (
        !e.model &&
        danger &&
        (trust >= 60 || affinity > 0.3) &&
        !same(e.ownTarget(actor.id), target.id)
      )
        add(
          "warn",
          17 + affinity,
          { subjectId: target.id, claimId: danger.id },
          "owned danger to valued contestant",
          true,
        );
      const incident = e
        .events(actor.id)
        .find(
          (k) => same(k.subjectId, target.id) || same(k.speakerId, target.id),
        );
      if (
        incident &&
        [
          "betrayal",
          "confirmed_lie",
          "task_report_dispute",
          "public_conflict",
        ].includes(incident.topic)
      )
        add(
          p.repairDrive > p.pressureDrive && trust > 45 ? "repair" : "confront",
          11 + p.repairDrive,
          { eventId: incident.id, subjectId: target.id },
          "unfinished relationship conflict",
        );
      if (e.model) {
        const agenda = e.model.agenda(actor.id, target.id);
        if (agenda.priority > 0) {
          const type = TYPES[agenda.purpose];
          if (type || agenda.allianceMotive) {
            const key = agenda.key || `${agenda.purpose}:${target.id}`;
            if (!this.recent(actor.id, target.id, key, agenda.priority >= 5))
              out.push({
                targetId: target.id,
                type,
                agenda,
                key,
                score: agenda.priority * 3 + agenda.value + affinity,
                reason: agenda.purpose,
                urgent: agenda.priority >= 5,
              });
          }
        }
      } else {
        const allianceMotive = this.gm.systems.allianceSystem?.npcMotive?.(
          actor.id,
          target.id,
        );
        if (allianceMotive) {
          const key = `${allianceMotive.purpose}:${target.id}:${allianceMotive.allianceId || allianceMotive.type || ""}`;
          if (!this.recent(actor.id, target.id, key))
            out.push({
              targetId: target.id,
              agenda: { purpose: allianceMotive.purpose, allianceMotive },
              key,
              score: 9 + p.strategyDrive + affinity,
              reason: allianceMotive.purpose,
            });
        }
        const uncertain = owned.find(
          (k) =>
            same(k.attributedId, target.id) &&
            !same(k.speakerId, target.id) &&
            ["idol_suspicion", "alliance_disclosure", "target"].includes(
              k.topic,
            ) &&
            k.challenged,
        );
        if (uncertain)
          add(
            "verify",
            10 + p.strategyDrive,
            { claimId: uncertain.id, subjectId: uncertain.subjectId },
            "owned disputed story",
          );
        const privateTalks = owned.filter(
          (k) =>
            k.kind === "observation" &&
            k.topic === "seen_together" &&
            same(k.subjectId, target.id),
        );
        if (privateTalks.length >= 2 && p.paranoiaDrive > 0.5)
          add(
            "vibe",
            7 + p.paranoiaDrive,
            {
              subjectId: target.id,
              line: `You’ve been talking privately a lot. What’s on your mind?`,
            },
            "observed private contact",
          );
      }
      const last = this.engine.memory?.memory[
        String(actor.id)
      ]?.conversationHistory
        ?.filter(
          (k) =>
            k.day === this.gm.day &&
            (same(k.speakerId, target.id) || same(k.subjectId, target.id)),
        )
        .at(-1);
      const effort = this.camp.effort[actor.id] || 0;
      if (
        !last &&
        trust >= 40 &&
        p.socialDrive > 0.4 &&
        (e.model ? this.gm.dayTimer > 600 : effort >= 180)
      )
        add(
          "check_in",
          3 + p.socialDrive + affinity,
          { subjectId: target.id },
          "relationship needs a check-in",
        );
    }
    return out
      .map((c) => {
        const location = this.locate(actor.id, c.targetId);
        // Nearby opportunity matters; a routine question is not worth a blind
        // expedition. Important owned warnings/objective work can still search.
        const travel = location
          ? this.camp.minimumTravelSeconds(e.place(actor.id), location)
          : 360;
        return {
          ...c,
          score: c.score + (travel === 0 ? 2 : -Math.min(4, travel / 90)),
        };
      })
      .filter(
        (c) =>
          !e.together(actor.id, c.targetId) ||
          this.person(c.targetId)?.isPlayer ||
          this.canListen(this.person(c.targetId), actor.id) ||
          c.urgent,
      )
      .sort(
        (a, b) =>
          b.score - a.score ||
          String(a.targetId).localeCompare(String(b.targetId)),
      )
      .slice(0, 5);
  }
  create(actor, targetId, fields = {}) {
    const old = this.active(actor.id);
    if (old) return old;
    const i = {
      id: `initiative:${this.gm.day}:${this.gm.gamePhase}:${++this.sequence}`,
      actorId: actor.id,
      targetId,
      day: this.gm.day,
      phase: this.gm.gamePhase,
      status: "identified",
      createdAt: this.gm.dayTimer,
      attempts: 0,
      searches: 0,
      ...copy(fields),
    };
    this.intentions.push(i);
    this.intentions = this.intentions
      .filter((x) => !TERMINAL.has(x.status) || x.day === this.gm.day)
      .slice(-80);
    this.note(i, "motive_created", {
      reason: i.reason,
      evidenceIds: i.evidenceIds || i.agenda?.knownEvidence || [],
    });
    this.note(i, "intention_selected");
    this.note(i, "target_chosen");
    return i;
  }
  adopt(actor, plan) {
    if (
      !plan?.targetId ||
      !["approach_player", "strategy_conversation"].includes(plan.type)
    )
      return plan;
    const key = `${plan.purpose}:${plan.targetId}:${plan.agenda?.work?.key || plan.agenda?.requestedAction || ""}:${plan.agenda?.primarySubject || ""}:${plan.agenda?.claimId || plan.agenda?.followTaskId || ""}`;
    if (
      this.recent(
        actor.id,
        plan.targetId,
        key,
        Boolean(plan.agenda?.followTaskId),
      )
    )
      return null;
    return this.create(actor, plan.targetId, {
      key,
      agenda: plan.agenda,
      basePlan: plan,
      reason: plan.purpose,
      urgent:
        plan.purpose === "objective_confront" ||
        Boolean(plan.agenda?.followTaskId),
      private: conversationCharacter(actor).visibilityTolerance < 0.4,
    });
  }
  plan(actor, now, { objectives = true } = {}) {
    if (actor.isPlayer || !this.camp.active || now <= 45) return null;
    let i = this.active(actor.id);
    if (
      i &&
      ["invited", "in_conversation", "deferred", "relocating"].includes(
        i.status,
      )
    )
      return null;
    if (
      i?.basePlan?.objectiveId &&
      !actor.campActivity &&
      now < i.createdAt &&
      objectives
    ) {
      const revised = this.engine.objectives.plan(actor, now);
      if (
        revised &&
        (revised.targetId !== i.targetId ||
          revised.agenda?.work?.key !== i.agenda?.work?.key)
      ) {
        this.finish(i, "abandoned", "owned objective revision");
        i = null;
        const replacement = this.adopt(actor, revised);
        if (replacement?.id) i = replacement;
        else if (replacement) return replacement;
      }
    }
    if (!i && objectives) {
      const strategic = this.engine.objectives.plan(actor, now);
      if (strategic) {
        const selected = this.adopt(actor, strategic);
        if (selected?.id) i = selected;
        else if (selected) return selected;
      }
    }
    if (!i) {
      const c = this.candidates(actor)[0];
      if (!c) return null;
      // Ordinary social work yields to camp shortages and has a small concurrent budget.
      if (
        c.type === "check_in" &&
        this.intentions.filter((x) => !TERMINAL.has(x.status)).length >=
          Math.max(1, Math.floor(this.members.length / 3))
      )
        return null;
      if (c.agenda && this.engine.model && !c.agenda.allianceMotive)
        c.agenda = this.engine.model.agenda(actor.id, c.targetId, {
          plan: true,
        });
      i = this.create(actor, c.targetId, {
        ...c,
        private:
          c.urgent || conversationCharacter(actor).visibilityTolerance < 0.4,
      });
    }
    if (i.nextAt != null && now > i.nextAt) {
      if (i.waitForSighting) return null;
      return {
        type: "observe",
        location: this.engine.place(actor.id),
        duration: Math.min(120, now - i.nextAt),
      };
    }
    if (
      i.attempts >= 3 ||
      i.day !== this.gm.day ||
      i.phase !== this.gm.gamePhase ||
      !this.person(i.targetId)
    ) {
      this.finish(i, "abandoned", "no feasible opportunity");
      return null;
    }
    let location = this.locate(actor.id, i.targetId);
    if (
      !location &&
      !i.urgent &&
      !i.basePlan &&
      (i.agenda?.priority || 0) < 3
    ) {
      i.waitForSighting = true;
      i.nextAt = now - 180;
      i.opportunityWaits = (i.opportunityWaits || 0) + 1;
      this.note(i, "waiting_for_sighting");
      if (i.opportunityWaits >= 2)
        this.finish(i, "abandoned", "routine opportunity did not appear");
      return null;
    }
    i.waitForSighting = false;
    if (!location) {
      const search = [
        LocationKeys.BEACH,
        LocationKeys.WATER_WELL,
        LocationKeys.SHELTER,
      ].filter((x) => x !== this.engine.place(actor.id));
      location = search[i.searches % search.length];
      i.searches++;
      if (i.searches > 2) {
        this.finish(i, "abandoned", "target not located");
        return null;
      }
    }
    if (
      this.camp.minimumTravelSeconds(this.engine.place(actor.id), location) +
        45 >=
      now
    ) {
      this.finish(i, "expired", "insufficient travel time");
      return null;
    }
    i.status = "seeking";
    i.destination = location;
    i.attempts++;
    this.note(i, "approach_planned", {
      location,
      ownedLocation: Boolean(this.locate(actor.id, i.targetId)),
    });
    return {
      ...(i.basePlan || {}),
      type: this.person(i.targetId).isPlayer
        ? "approach_player"
        : "strategy_conversation",
      targetId: i.targetId,
      location,
      duration:
        i.basePlan?.duration ||
        (this.person(i.targetId).isPlayer
          ? 45
          : this.engine.model && !(now <= 300 && i.urgent)
            ? 240
            : 120),
      purpose: i.reason,
      agenda: i.agenda,
      initiativeId: i.id,
    };
  }
  starting(actor, plan) {
    const id = plan.initiativeId || plan.goal?.initiativeId,
      i = this.intentions.find((x) => x.id === id);
    if (!i) return plan;
    if (TERMINAL.has(i.status))
      return { type: "observe", location: plan.location, duration: 120 };
    if (plan.type === "travel") {
      if (i.status !== "relocating") i.status = "traveling";
      this.note(i, "travel_started", { location: plan.location });
      return plan;
    }
    if (plan.type === "initiative_wait") return plan;
    const target = this.person(i.targetId);
    if (
      !target ||
      !this.engine.present(target.id, plan.location) ||
      (target.isPlayer && !this.playerAvailable()) ||
      (!target.isPlayer && !this.canListen(target, actor.id))
    ) {
      i.status = "waiting";
      i.nextAt = this.gm.dayTimer - 60;
      this.note(i, "opportunity_missed", {
        reason:
          target && this.engine.present(target.id, plan.location)
            ? "busy"
            : "moved",
      });
      return {
        type: "initiative_wait",
        location: plan.location,
        duration: 60,
        initiativeId: i.id,
        targetId: i.targetId,
      };
    }
    i.status = "arrived";
    this.note(i, "target_located");
    this.note(i, "physically_arrived");
    return plan;
  }
  canListen(target, actorId) {
    // Two co-present contestants waiting for one another must not deadlock.
    // An interruptible waiting block is not a second ongoing conversation.
    return (
      idle(target) ||
      (target?.campActivity?.type === "initiative_wait" &&
        same(this.active(target.id)?.targetId, actorId))
    );
  }
  playerAvailable() {
    const p = this.gm.player;
    return (
      !this.camp.conversation &&
      !this.gm.flags?.campEventActive &&
      (!p.campActivity ||
        (p.campActivity.interruptible !== false &&
          p.campActivity.type !== "travel")) &&
      this.engine.present(p.id, p.location)
    );
  }
  resolve(actor, activity, at) {
    let i = this.intentions.find((x) => x.id === activity.initiativeId);
    if (!i && activity.type === "approach_player")
      i = this.adopt(actor, {
        ...activity,
        targetId: activity.targetId || this.gm.player.id,
      });
    if (!i?.id) return false;
    if (activity.type === "initiative_wait") {
      i.status = "seeking";
      return true;
    }
    if (activity.type === "approach_player") {
      if (
        !this.engine.together(actor.id, i.targetId) ||
        !this.playerAvailable() ||
        this.invitation
      ) {
        i.status = "seeking";
        i.nextAt = at - 120;
        if (actor.campActivity?.id === activity.id) actor.campActivity = null;
        this.camp.start(
          actor,
          { type: "observe", location: activity.location, duration: 120 },
          at,
        );
        return true;
      }
      actor.campActivity = {
        ...activity,
        id: `${activity.id}:waiting`,
        type: "approach_wait",
        endsAt: 0,
        external: true,
        interruptible: false,
      };
      i.status = "invited";
      this.invitation = {
        npcId: actor.id,
        intentionId: i.id,
        purpose: activity.purpose,
        agenda: activity.agenda || null,
        activityId: actor.campActivity.id,
        expiresAt: at - (i.urgent ? 120 : 180),
        private: Boolean(i.private),
      };
      this.note(i, "invitation_offered");
      eventManager.publish("camp:readUpdated");
      return true;
    }
    if (activity.type !== "strategy_conversation") return false;
    const listeners = (activity.participantIds || [])
      .map((id) => this.person(id))
      .filter((p) => p && this.engine.together(actor.id, p.id));
    if (!listeners.length) {
      i.status = "seeking";
      return true;
    }
    this.note(i, "conversation_started");
    this.camp.observe({
      actor,
      type: "seen_together",
      location: activity.location,
      participants: listeners.map((p) => p.id),
      activityId: activity.id,
      at,
      visibility: i.private ? "private" : "visible",
    });
    let meaningful = 0;
    for (const target of listeners) {
      let result;
      if (activity.taskId)
        result = this.engine.tasks.execute(actor, target, activity);
      else if (activity.objectiveId)
        result = this.engine.objectives.execute(actor, target, activity);
      else if (i.agenda?.allianceMotive && !this.engine.model) {
        result = this.gm.systems.allianceSystem.resolveNpcMotive(
          actor.id,
          target.id,
          i.agenda.allianceMotive,
          activity.id,
          this.camp.random,
        );
      } else if (i.agenda)
        result = this.engine.executeAgenda(actor, target, activity, () =>
          this.gm.systems.strategyPhaseSystem.random(),
        );
      else
        result = this.engine.resolve(
          this.engine.action(i.type || "check_in", {
            ...i.fields,
            actionId: `${activity.id}:initiative:${target.id}`,
            speakerId: actor.id,
            listenerIds: [target.id],
          }),
        );
      if (result && !result.invalid) {
        meaningful++;
        this.note(i, "semantic_action");
        this.note(i, "response_obtained", {
          responses:
            result.responses?.map((r) => ({ id: r.id, status: r.status })) ||
            [],
        });
      }
      if (
        result &&
        !activity.taskId &&
        !activity.objectiveId &&
        this.engine.model &&
        ["verify_story", "gather_intel", "check_loyalty"].includes(
          i.agenda?.purpose,
        )
      ) {
        const state = this.engine.model.state(actor.id),
          position = this.engine.model.knownPosition(actor.id, target.id);
        const counter = state.intendedVoteId,
          plan = this.engine.model
            .planSupport(actor.id)
            .plans.find((p) => same(p.targetId, counter));
        if (
          state.safetyBelief < 0.5 &&
          counter &&
          !same(counter, target.id) &&
          !same(counter, actor.id) &&
          !same(position?.subjectId, counter) &&
          (plan?.confirmed.length || 0) >= 1
        ) {
          // A threatened initiator can use the same actual meeting to propose
          // their supported alternative after hearing the listener's answer.
          const follow = this.engine.resolve(
            this.engine.action("ask_vote", {
              actionId: `${activity.id}:counter-followup:${target.id}`,
              speakerId: actor.id,
              listenerIds: [target.id],
              subjectId: counter,
            }),
          );
          if (!follow.invalid) {
            this.note(i, "followup_initiated");
            this.note(i, "semantic_action");
            this.note(i, "response_obtained");
          }
        }
      }
    }
    this.engine.model?.contact([actor.id, ...listeners.map((p) => p.id)], at);
    this.gm.systems.strategyPhaseSystem?.scramble?.note(
      "conversation_resolved",
      {
        activityId: activity.id,
        actorId: actor.id,
        participantIds: listeners.map((p) => p.id),
      },
    );
    const position = this.engine.model?.knownPosition(actor.id, i.targetId);
    const outcome =
      position?.stance === "yes"
        ? "advanced"
        : position?.stance === "no"
          ? "resisted"
          : "discussed";
    this.note(i, `goal_${outcome}`);
    this.finish(
      i,
      meaningful ? "resolved" : "abandoned",
      meaningful ? outcome : "proposal no longer valid",
    );
    return true;
  }
  clearInvitation(reason = "released") {
    const invite = this.invitation;
    this.invitation = null;
    const actor = this.person(invite?.npcId);
    if (
      actor &&
      invite &&
      actor.campActivity?.id === invite.activityId &&
      actor.campActivity.type === "approach_wait"
    )
      actor.campActivity = null;
    const i = this.intentions.find((x) => x.id === invite?.intentionId);
    if (i && i.status === "invited") {
      i.status = "seeking";
      i.nextAt = this.gm.dayTimer - 120;
      this.note(i, "invitation_released", { reason });
    }
  }
  respond(choice) {
    const invite = this.invitation,
      i = this.intentions.find((x) => x.id === invite?.intentionId),
      actor = this.person(invite?.npcId);
    if (!invite || !actor || !this.engine.together(actor.id, this.gm.player.id))
      return false;
    if (!["accept", "private", "defer", "decline", "rude"].includes(choice))
      return false;
    if (["accept", "private"].includes(choice) && !this.playerAvailable())
      return false;
    this.clearInvitation("player response");
    if (i) this.note(i, `invitation_${choice}`);
    if (choice === "private" && i) {
      const destination = [LocationKeys.SHELTER, LocationKeys.WATER_WELL].find(
        (loc) =>
          loc !== this.gm.player.location &&
          this.camp.minimumTravelSeconds(this.gm.player.location, loc) <= 180 &&
          this.camp.minimumTravelSeconds(this.gm.player.location, loc) + 90 <
            this.gm.dayTimer,
      );
      if (!destination) return false;
      i.status = "relocating";
      i.destination = destination;
      if (
        !this.camp.moveTogether(this.gm.player, actor, destination, {
          initiativeId: i.id,
        })
      ) {
        i.status = "seeking";
        return false;
      }
      this.note(i, "privacy_relocation");
      return true;
    }
    if (choice === "accept") {
      if (
        !this.camp.beginConversation(actor, {
          location: this.gm.player.location,
          strategy: Boolean(this.engine.model),
        })
      )
        return false;
      if (i) {
        i.status = "in_conversation";
        this.camp.conversation.initiativeId = i.id;
      }
      this.gm.systems.conversationSystem.startNpcConversation(
        actor,
        invite.purpose,
        {
          initiatedByNpc: true,
          location: this.gm.player.location,
          context: {
            approachAccepted: true,
            agenda: invite.agenda,
            initiativeId: i?.id,
          },
        },
      );
      if (i) this.note(i, "conversation_started");
      return true;
    }
    if (i) {
      if (choice === "defer") {
        i.status = "deferred";
        i.nextAt = this.gm.dayTimer - 120;
        this.camp.start(actor, {
          type: "observe",
          location: this.engine.place(actor.id),
          duration: 120,
        });
      } else {
        if (i.agenda?.purpose === "objective_delegate") {
          this.gm.systems.socialMemorySystem.recordConversationHistory({
            id: `${i.id}:request-not-heard`,
            participantIds: [actor.id, this.gm.player.id],
            speakerId: this.gm.player.id,
            subjectId: actor.id,
            type: "approach_declined",
            topic: "relationship",
            day: this.gm.day,
            campTime: this.gm.dayTimer,
            location: this.gm.player.location,
          });
          // The work need stays unresolved: no task was spoken or accepted.
          const objective =
            this.engine.objectives.records[i.agenda.objectiveId];
          if (objective) objective.revision++;
        }
        this.finish(i, "abandoned", "player declined");
      }
      this.engine.memory.recordConversationHistory({
        id: `${i.id}:invitation:${i.attempts}:${choice}`,
        participantIds: [actor.id, this.gm.player.id],
        speakerId: this.gm.player.id,
        subjectId: actor.id,
        type: `approach_${choice}`,
        topic: "relationship",
        day: this.gm.day,
        campTime: this.gm.dayTimer,
        location: this.gm.player.location,
      });
      if (choice === "rude")
        this.engine.trust(
          actor.id,
          this.gm.player.id,
          -(conversationCharacter(actor).pressureDrive > 0.5 ? 3 : 2),
          "dismissed_rudely",
        );
    }
    eventManager.publish("camp:readUpdated");
    return true;
  }
  boundary(now) {
    if (
      this.invitation &&
      (now <= this.invitation.expiresAt ||
        !this.engine.together(this.invitation.npcId, this.gm.player.id))
    ) {
      const i = this.intentions.find(
        (x) => x.id === this.invitation.intentionId,
      );
      this.clearInvitation("expired or moved");
      if (i && i.attempts >= 2) this.finish(i, "expired", "invitation missed");
    }
    for (const i of this.intentions.filter((x) => !TERMINAL.has(x.status))) {
      if (
        i.day !== this.gm.day ||
        i.phase !== this.gm.gamePhase ||
        !this.person(i.targetId) ||
        !this.person(i.actorId) ||
        this.person(i.actorId)?.isOut ||
        this.person(i.targetId)?.isOut ||
        now <= 0
      ) {
        if (this.invitation?.intentionId === i.id)
          this.clearInvitation("phase/participant ended");
        this.finish(i, "expired", "phase/participant ended");
      } else if (
        i.status === "relocating" &&
        !this.gm.player.campActivity &&
        this.engine.together(i.actorId, i.targetId) &&
        this.engine.present(i.actorId, i.destination)
      ) {
        i.status = "seeking";
        const a = this.person(i.actorId);
        if (a && idle(a)) {
          this.camp.interrupt(a, "private arrival", now);
          this.camp.start(
            a,
            {
              type: "approach_player",
              location: i.destination,
              targetId: i.targetId,
              duration: 45,
              purpose: i.reason,
              agenda: i.agenda,
              initiativeId: i.id,
            },
            now,
          );
        }
      } else if (i.status === "deferred" && now <= i.nextAt) {
        i.status = "seeking";
        const a = this.person(i.actorId);
        if (a && idle(a)) {
          this.camp.interrupt(a, "deferred approach", now);
          this.camp.chooseNext(a, now);
        }
      } else if (
        !i.basePlan?.taskId &&
        ["counter_pitch", "recruit_swing"].includes(i.agenda?.purpose) &&
        this.engine.ownTarget(i.actorId) &&
        !same(this.engine.ownTarget(i.actorId), i.agenda.primarySubject)
      ) {
        if (this.invitation?.intentionId === i.id)
          this.clearInvitation("plan changed");
        this.finish(i, "abandoned", "intended plan changed");
      }
    }
    for (const prior of this.intentions.filter(
      (i) =>
        i.status === "resolved" &&
        i.outcome === "condition_pending" &&
        !i.followupStarted &&
        i.day === this.gm.day &&
        i.phase === this.gm.gamePhase,
    )) {
      const actor = this.person(prior.actorId);
      if (
        !actor ||
        actor.isOut ||
        this.active(actor.id) ||
        !prior.conditions?.length ||
        !prior.conditions.every((c) =>
          this.engine.conditionTrue(actor.id, c),
        ) ||
        !same(this.engine.ownTarget(actor.id), prior.followupSubjectId)
      )
        continue;
      prior.followupStarted = true;
      this.create(actor, prior.targetId, {
        type: "ask_vote",
        fields: { subjectId: prior.followupSubjectId },
        key: `fulfilled-condition:${prior.id}`,
        reason: "follow up on agreed condition",
        urgent: true,
        private: true,
      });
    }
  }
  nextBoundary(cursor, after) {
    return [
      this.invitation?.expiresAt,
      ...this.intentions
        .filter((i) => i.status === "deferred")
        .map((i) => i.nextAt),
    ].filter((t) => Number.isFinite(t) && t < cursor && t >= after);
  }
  finish(i, status, reason) {
    if (!i || TERMINAL.has(i.status)) return;
    i.status = status;
    i.outcome = reason;
    i.completedAt = this.gm.dayTimer;
    const receipt = {
      key: i.key,
      at: this.gm.dayTimer,
      day: this.gm.day,
      phase: this.gm.gamePhase,
    };
    this.recency[`${i.actorId}:${i.targetId}`] = receipt;
    this.recency[`${i.actorId}:${i.targetId}:${i.key}`] = receipt;
    this.recency = Object.fromEntries(
      Object.entries(this.recency)
        .filter(([, r]) => r.day === this.gm.day)
        .slice(-240),
    );
    this.note(i, `intention_${status}`, { reason });
  }
  ended(reservation) {
    const i = this.intentions.find((x) => x.id === reservation?.initiativeId),
      n = reservation?.checkpoint?.npcNegotiation;
    if (!i || TERMINAL.has(i.status)) return;
    if (n?.type === "delegate") {
      const request = this.engine.tasks
        .knownTasks(i.actorId)
        .find(
          (t) =>
            same(t.delegateId, i.targetId) &&
            t.requestClaimId?.startsWith(reservation.activityId),
        );
      if (
        request &&
        ["accepted", "refused", "hedged"].includes(request.publicStatus)
      ) {
        n.status = request.publicStatus === "hedged" ? "unresolved" : "settled";
        this.note(i, "response_obtained", {
          taskId: request.id,
          response: request.publicStatus,
        });
      }
    }
    if (n?.status === "condition_pending") {
      i.conditions = copy(n.conditions);
      i.followupSubjectId = n.subjectId;
    }
    this.note(
      i,
      n?.status === "settled" ? "goal_responded" : "goal_unresolved",
    );
    this.finish(i, "resolved", n?.status || "discussion ended");
  }
  dialogueOpening(npc, result, context = {}) {
    const cp = this.camp.conversation?.checkpoint;
    if (!cp || !result || result.invalid) return;
    if (cp.npcNegotiation) return;
    const initiative = this.active(npc.id);
    if (initiative) {
      this.camp.conversation.initiativeId = initiative.id;
      if (initiative.status !== "in_conversation")
        this.note(initiative, "conversation_started");
      initiative.status = "in_conversation";
    }
    if (initiative && this.engine.model && initiative.key)
      (this.engine.model.state(npc.id).motiveReceipts ||= {})[initiative.key] =
        { day: this.gm.day, at: this.gm.dayTimer };
    cp.npcNegotiation = {
      npcId: npc.id,
      subjectId: result.subjectId,
      type: result.type,
      status: "awaiting_response",
      round: 0,
      initiativeId: context.initiativeId || initiative?.id,
      proposal: ["pitch", "ask_vote", "press", "negotiate"].includes(
        result.type,
      ),
      question: ["vote_read", "loyalty", "verify", "idol_ask", "vibe"].includes(
        result.type,
      ),
    };
    if (initiative) {
      this.note(initiative, "semantic_action");
    }
  }
  dialogueChoices(npc) {
    const n = this.camp.conversation?.checkpoint?.npcNegotiation;
    if (
      !n ||
      same(n.npcId, npc.id) === false ||
      ["settled", "unresolved", "condition_pending"].includes(n.status)
    )
      return [];
    const subject = n.subjectId,
      name = this.engine.name(subject),
      future = !this.engine.model;
    const agree = future
      ? `If we lose, I’d be willing to vote ${name}`
      : `I’ll vote ${name}`;
    if (n.proposal && subject != null)
      return [
        { type: "why", label: `Why ${name}?`, subjectId: subject },
        {
          type: "numbers",
          label: "Who else do we actually have?",
          subjectId: subject,
        },
        { type: "promise", label: agree, subjectId: subject },
        {
          type: "conditional",
          label: "Only if someone else is really in",
          subjectId: subject,
          conditionPicker: true,
        },
        {
          type: "reply",
          label: "I’ll consider it — no promise",
          subjectId: subject,
          stance: "consider",
          line: "I’ll consider it. I’m not promising.",
        },
        {
          type: "reply",
          label: `I’m not voting ${name}`,
          subjectId: subject,
          stance: "refused",
          line: `I’m not voting ${name}.`,
        },
        {
          type: "cover_promise",
          label: `Bluff: agree to ${name}`,
          subjectId: subject,
        },
      ];
    if (n.question)
      return [
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
  afterPlayerAction(npc, action, result) {
    const cp = this.camp.conversation?.checkpoint,
      n = cp?.npcNegotiation;
    if (
      !n ||
      ["settled", "unresolved"].includes(n.status) ||
      !result ||
      result.invalid ||
      result.replay
    )
      return null;
    const i = this.intentions.find((x) => x.id === n.initiativeId);
    if (i) this.note(i, "response_obtained", { type: action.type });
    n.round++;
    if (["promise", "cover_promise"].includes(action.type)) {
      n.status = "settled";
      return null;
    }
    if (action.type === "conditional") {
      n.status = "condition_pending";
      n.conditions = copy(action.conditions);
      if (i) this.note(i, "followup_needed", { conditions: action.conditions });
      return null;
    }
    if (action.type === "reply" && action.stance === "refused") {
      const p = conversationCharacter(npc);
      n.status = "settled";
      // One concession is spoken, never an imposed alternative vote.
      if (p.flexibility > 0.55 && n.round <= 2 && this.engine.model) {
        const alt = this.engine.model.alternateTarget(npc.id, [
          npc.id,
          this.gm.player.id,
          n.subjectId,
        ]);
        if (alt)
          return this.engine.resolve(
            this.engine.action("pitch", {
              actionId: `${cp.activityId}:npc-concession:${n.round}`,
              speakerId: npc.id,
              listenerIds: [this.gm.player.id],
              subjectId: alt,
              line: `Then would ${this.engine.name(alt)} make more sense for you?`,
            }),
          );
      }
      return null;
    }
    if (n.round >= 3) {
      n.status = "unresolved";
      return null;
    }
    if (
      n.proposal &&
      ["why", "source", "evidence", "numbers", "reply"].includes(action.type)
    ) {
      // The normal resolver already answered from owned information. The
      // initiator now asks a real follow-up rather than disappearing into menus.
      return this.engine.resolve(
        this.engine.action("ask_vote", {
          actionId: `${cp.activityId}:npc-followup:${n.round}`,
          speakerId: npc.id,
          listenerIds: [this.gm.player.id],
          subjectId: n.subjectId,
          line:
            action.type === "numbers"
              ? "Would confirming those people get you there?"
              : `What would make ${this.engine.name(n.subjectId)} work for you?`,
        }),
      );
    }
    return null;
  }
  serialize() {
    return copy({
      sequence: this.sequence,
      intentions: this.intentions,
      recency: this.recency,
      invitation: this.invitation,
      history: this.history,
      metrics: this.metrics,
    });
  }
  deserialize(p = {}) {
    this.sequence = p.sequence || 0;
    this.intentions = p.intentions || [];
    this.recency = p.recency || {};
    this.invitation = p.invitation || null;
    this.history = p.history || [];
    this.metrics = p.metrics || {};
  }
}
