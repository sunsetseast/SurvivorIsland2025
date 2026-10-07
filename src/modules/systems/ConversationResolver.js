import {
  ACTION_DEFINITIONS,
  conversationMembers,
  samePerson as same,
  makeConversationAction,
  actionSubjects,
} from "./ConversationActionCatalog.js";
import { conversationCharacter } from "./ConversationCharacter.js";
import {
  ownedCampKnowledge,
  selectCampStrategicIntent,
} from "./CampKnowledge.js";
import { campLieAttemptChance } from "./CampBehaviorProfile.js";
import { isCampPhysicallyPresent } from "../locations/CampPresence.js";
import { ownsUsableIdol } from "./IdolPossession.js";
import StrategicTaskSystem from "./StrategicTaskSystem.js";
import StrategicObjectivePlanner from "./StrategicObjectivePlanner.js";
import {
  CONVERSATION_HANDLERS,
  CONVERSATION_RESOLVER_TYPES,
} from "./ConversationActionHandlers.js";
const clone = (x) => JSON.parse(JSON.stringify(x));
const negative = (e) =>
  ["no", "denied", "protect", "withdrawn"].includes(e.stance);
const clamp = (n) => Math.max(0, Math.min(1, n));
function keyedRandom(key) {
  let seed = 2166136261;
  for (const c of key) seed = Math.imul(seed ^ c.charCodeAt(0), 16777619) >>> 0;
  return () =>
    (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
}

// No vote map or belief store: intentions stay in ScrambleStrategy, knowledge in SocialMemory.
export default class ConversationResolver {
  constructor(gm, payload = {}) {
    this.gm = gm;
    this.receipts = payload.receipts || {};
    this.sequence = payload.sequence || 0;
    this.tasks = new StrategicTaskSystem(this, payload.tasks);
    this.objectives = new StrategicObjectivePlanner(this, payload.objectives);
  }
  get memory() {
    return this.gm.systems.socialMemorySystem;
  }
  get camp() {
    return this.gm.systems.campActivitySystem;
  }
  get model() {
    const s = this.gm.systems.strategyPhaseSystem;
    return this.gm.gamePhase === "postChallenge" &&
      s?.isActive &&
      !s.playerTribeSafe
      ? s.reasoning
      : null;
  }
  person(id) {
    return conversationMembers(this.gm).find((p) => same(p.id, id));
  }
  name(id) {
    return (
      this.person(id)?.firstName ||
      this.gm.survivors?.find((p) => same(p.id, id))?.firstName ||
      "someone"
    );
  }
  knowledge(id) {
    return ownedCampKnowledge(this.memory, id, this.gm.day);
  }
  ownTarget(id) {
    return this.model?.state(id).intendedVoteId || null;
  }
  present(id, place) {
    return isCampPhysicallyPresent(
      this.person(id),
      this.gm.systems.npcLocationSystem,
      place,
      this.gm,
    );
  }
  place(id) {
    const p = this.person(id);
    return p?.isPlayer
      ? p.location
      : this.gm.systems.npcLocationSystem?.getLocation(id);
  }
  together(a, b) {
    const place = this.place(a);
    return Boolean(place && this.present(a, place) && this.present(b, place));
  }
  nextActionId(speakerId) {
    return `${this.camp?.conversation?.activityId || `${this.gm.day}:${this.gm.gamePhase}`}:speech:${speakerId}:${++this.sequence}`;
  }
  promises(id) {
    return (
      this.memory
        ?.getConversationObligations(id)
        .filter((p) => p.kind === "promise") || []
    );
  }
  lastExchange(id) {
    return this.memory?.memory[String(id)]?.conversationHistory?.at(-1) || null;
  }
  events(id) {
    const store = this.memory?.memory[String(id)] || {},
      owned = this.knowledge(id);
    return [
      ...owned.filter((e) =>
        [
          "betrayal",
          "public_conflict",
          "confirmed_lie",
          "vote_attribution",
          "deal_breach",
          "alliance_exclusion",
          "idol_search_seen",
          "idol_play",
          "challenge_result",
          "previous_tribal",
        ].includes(e.topic),
      ),
      ...this.promises(id)
        .filter(
          (p) =>
            same(p.speakerId, id) && ["broken", "withdrawn"].includes(p.status),
        )
        .map((p) => ({ ...p, subjectId: p.targetId, topic: "broken_promise" })),
      ...(store.conversationHistory || []).filter((e) =>
        ["confront", "apologize", "threaten", "withdraw"].includes(e.type),
      ),
    ]
      .filter((e, i, a) => a.findIndex((x) => x.id === e.id) === i)
      .slice(-12)
      .reverse();
  }
  action(type, fields) {
    return makeConversationAction(this, type, fields);
  }
  validate(a) {
    if (
      !ACTION_DEFINITIONS[a.type] ||
      !CONVERSATION_RESOLVER_TYPES.includes(a.type) ||
      !a.actionId ||
      !this.person(a.speakerId)
    )
      return "invalid_action";
    const ids = [...new Set((a.listenerIds || []).map(String))];
    if (
      !ids.length ||
      ids.some((id) => same(id, a.speakerId) || !this.together(a.speakerId, id))
    )
      return "not_present";
    if (a.subjectId != null && !this.person(a.subjectId) && !a.eventId)
      return "invalid_subject";
    if (
      [
        "pitch",
        "ask_vote",
        "press",
        "negotiate",
        "promise",
        "conditional",
        "cover_promise",
        "backup",
        "split",
        "decoy",
        "bluff",
        "speculate",
        "leak_test",
      ].includes(a.type) &&
      (a.subjectId == null ||
        same(a.subjectId, a.speakerId) ||
        (this.model && !this.model.strategy.isTargetIdAvailable(a.subjectId)))
    )
      return "invalid_target";
    if (
      ["share", "leak", "verify", "idol_rumor"].includes(a.type) &&
      !this.knowledge(a.speakerId).some((e) => e.id === a.claimId)
    )
      return "unowned_claim";
    if (
      ["apologize", "repair", "confront", "admit", "deny", "event"].includes(
        a.type,
      ) &&
      !actionSubjects(this, a.type, a.speakerId, a.listenerIds).some(
        (e) => e.id === a.eventId,
      )
    )
      return "unowned_event";
    if (
      a.type === "idol_reveal" &&
      !ownsUsableIdol(this.person(a.speakerId), this.gm.systems.idolSystem)
    )
      return "no_idol";
    if (a.type === "conditional" && !(a.conditions || []).length)
      return "missing_condition";
    if (
      a.type === "bluff" &&
      (!this.person(a.allegedSourceId) || same(a.allegedSourceId, a.speakerId))
    )
      return "missing_source";
    if (
      a.type === "split" &&
      (!this.ownTarget(a.speakerId) ||
        same(this.ownTarget(a.speakerId), a.subjectId))
    )
      return "invalid_split";
    if (
      ["delegate", "bring"].includes(a.type) &&
      (!this.person(a.subjectId) ||
        a.listenerIds.some((id) => same(id, a.subjectId)))
    )
      return "invalid_delegate_target";
    return null;
  }
  resolve(input) {
    const a = {
      ...input,
      day: this.gm.day,
      phase: this.gm.gamePhase,
      campTime: this.gm.dayTimer,
      location: this.place(input.speakerId),
      activityId: input.activityId || this.camp?.conversation?.activityId,
    };
    if (this.receipts[a.actionId])
      return { ...clone(this.receipts[a.actionId]), replay: true };
    const invalid = this.validate(a);
    if (invalid)
      return { invalid, responses: [], followUps: ["change_topic", "end"] };
    const random = keyedRandom(
        `${this.camp?.conversation?.checkpoint?.seed || this.gm.seasonEngine?.state?.seed || "survivor"}:${a.actionId}`,
      ),
      participants = [a.speakerId, ...a.listenerIds];
    const result = {
      actionId: a.actionId,
      type: a.type,
      subjectId: a.subjectId,
      playerLine: a.line || this.sentence(a),
      responses: [],
      followUps: [],
    };
    const say = (id, line, stance = "open") =>
      result.responses.push({ speakerId: id, line, stance });
    const heard = this.knowledge(a.speakerId).find((e) => e.id === a.claimId),
      event = this.events(a.speakerId).find((e) => e.id === a.eventId);
    const emit = (speakerId, subjectId, fields = {}) =>
      this.statement(
        a,
        {
          speakerId,
          listenerIds: participants.filter((id) => !same(id, speakerId)),
          subjectId,
          ...fields,
        },
        random,
      );
    if (["share", "leak", "idol_rumor"].includes(a.type)) {
      const source = a.keepSourcePrivate
        ? a.speakerId
        : heard.attributedId || heard.speakerId;
      emit(a.speakerId, heard.subjectId, {
        topic: heard.topic,
        stance: heard.stance,
        mode: "hearsay",
        attributedId: source,
        sourceChain: a.keepSourcePrivate
          ? [a.speakerId]
          : [...(heard.sourceChain || []), a.speakerId],
        evidenceIds: [heard.id],
        proposition: heard.proposition,
        conditions: heard.conditions,
      });
      this.noteSecretUse(a, heard);
      for (const id of a.listenerIds)
        say(id, "I hear you. Who else has checked that?");
    } else if (["pitch", "ask_vote", "press", "negotiate"].includes(a.type)) {
      if (
        a.type === "pitch" &&
        this.model &&
        this.person(a.speakerId).isPlayer
      ) {
        const own = this.model.state(a.speakerId);
        own.preferredTargetId = a.subjectId;
        if (!own.committedTargetId) {
          own.intendedVoteId = a.subjectId;
          own.intentStatus = "provisional";
          this.model.strategy.personalTargetId = a.subjectId;
        }
      }
      const statement = emit(a.speakerId, a.subjectId, {
        topic: "target",
        stance: "consider",
      });
      for (const id of a.listenerIds) {
        if (a.type === "press" && !this.person(id).isPlayer)
          this.trust(
            id,
            a.speakerId,
            conversationCharacter(this.person(id)).pressureDrive > 0.35
              ? -2
              : -1,
            "pressured_for_vote",
          );
        const r = this.negotiate(
          a,
          id,
          statement?.belief?.[String(id)] !== false,
          random,
        );
        say(id, r.line, r.stance);
      }
    } else if (["promise", "conditional", "cover_promise"].includes(a.type)) {
      this.makePromise(
        a,
        {
          speakerId: a.speakerId,
          targetId: a.subjectId,
          listenerIds: a.listenerIds,
          conditions: a.conditions || [],
          cover: a.type === "cover_promise" || a.truthMode === "fabrication",
        },
        random,
      );
      for (const id of a.listenerIds)
        say(
          id,
          a.type === "conditional"
            ? "I understand the condition. Let’s check it before counting that vote."
            : "I’ll remember what you said.",
        );
    } else if (a.type === "withdraw") {
      for (const p of this.promises(a.speakerId).filter(
        (p) => p.status === "active",
      )) {
        p.status = "withdrawn";
        emit(a.speakerId, p.targetId, {
          topic: "commitment",
          stance: "withdrawn",
          commitmentStatus: "withdrawn",
        });
      }
      if (this.model) {
        const s = this.model.state(a.speakerId);
        s.committedTargetId = null;
        s.intentStatus = "provisional";
      }
      for (const id of a.listenerIds) {
        this.trust(id, a.speakerId, -1, "withdrawn_promise");
        say(id, "Then I need to rethink what I can count on.");
      }
    } else if (["backup", "split"].includes(a.type)) {
      const primary = this.ownTarget(a.speakerId);
      if (this.model && a.type === "backup") {
        this.model.backup(
          a.speakerId,
          primary,
          a.subjectId,
          a.listenerIds,
          a.trigger || "suspected_idol",
        );
        emit(a.speakerId, a.subjectId, { topic: "backup", stance: "possible" });
      }
      if (this.model && a.type === "split") {
        const assignments =
          a.assignments ||
          Object.fromEntries(
            participants.map((id, i) => [
              id,
              i < Math.ceil(participants.length * 0.66) ? primary : a.subjectId,
            ]),
          );
        this.model.split(a.speakerId, primary, a.subjectId, assignments, [
          a.speakerId,
        ]);
        for (const id of a.listenerIds) {
          const assigned = assignments[id];
          const r = this.negotiate(
            { ...a, type: "ask_vote", subjectId: assigned },
            id,
            true,
            random,
          );
          if (r.stance === "committed") this.model.acceptSplit(id);
          say(id, r.line, r.stance);
        }
      } else
        for (const id of a.listenerIds)
          say(
            id,
            this.model
              ? "That gives us insurance. It still needs people to agree."
              : "We can revisit that if we have to go to Tribal.",
          );
    } else if (
      [
        "decoy",
        "bluff",
        "speculate",
        "leak_test",
        "idol_speculate",
        "idol_fabricate",
      ].includes(a.type)
    ) {
      const fabrication =
        ["decoy", "bluff", "idol_fabricate"].includes(a.type) ||
        a.truthMode === "fabrication";
      const topic =
        a.type === "bluff"
          ? "commitment"
          : a.type === "idol_fabricate"
            ? "idol_possession"
            : a.type.startsWith("idol")
              ? "idol_suspicion"
              : "target";
      if (a.type === "decoy")
        this.model?.decoy(a.speakerId, a.subjectId, a.listenerIds);
      emit(a.speakerId, a.subjectId, {
        topic,
        stance: ["bluff", "idol_fabricate"].includes(a.type)
          ? "yes"
          : "possible",
        mode: fabrication ? "deliberate_lie" : "speculation",
        attributedId: a.allegedSourceId || a.speakerId,
      });
      for (const id of a.listenerIds)
        say(
          id,
          "I’ll keep that in mind. I want to hear more before I rely on it.",
        );
    } else if (["delegate", "bring"].includes(a.type)) {
      emit(a.speakerId, a.subjectId, {
        topic: "delegation",
        stance: "requested",
        proposition: a.requestedAction || "bring",
      });
      for (const id of a.listenerIds) {
        const task = this.tasks.create(
          {
            ...a,
            delegateId: id,
            purpose:
              a.type === "bring" ? "bring" : a.requestedAction || "recruit",
          },
          random,
        );
        say(
          id,
          task?.acceptanceLine || "I cannot take that on.",
          task?.publicStatus || "refused",
        );
      }
    } else if (a.type === "follow_task") {
      const task = this.tasks.get(a.delegationId);
      for (const id of a.listenerIds) {
        const report = this.tasks.report(task, a, id, random);
        say(id, report.line, report.stance);
      }
    } else if (a.type === "report") {
      const task = this.tasks.get(a.delegationId);
      const report = this.tasks.report(task, a, a.speakerId, random, true);
      result.playerLine = report.line;
      say(
        a.listenerIds[0],
        "Thanks. I need to check what that means for the plan.",
        report.stance,
      );
    } else if (a.type === "secrecy") {
      const last = this.lastExchange(a.speakerId);
      for (const id of a.listenerIds) {
        const p = conversationCharacter(this.person(id)),
          accept =
            (this.gm.getTrust?.(id, a.speakerId) ?? 50) >= 40 &&
            random() > p.coverDrive * 0.35;
        this.memory.recordConversationObligation(
          {
            id: `${a.actionId}:secret:${id}`,
            kind: "secrecy",
            speakerId: id,
            requesterId: a.speakerId,
            claimId: a.claimId || last?.id,
            allowedIds: a.allowedIds || participants,
            useWithoutName: Boolean(a.keepSourcePrivate),
            status: accept ? "accepted" : "refused",
            day: this.gm.day,
          },
          participants,
        );
        say(
          id,
          accept ? "I’ll keep your name out of it." : "I cannot promise that.",
        );
      }
    } else if (
      ["apologize", "repair", "confront", "admit", "deny", "event"].includes(
        a.type,
      )
    ) {
      emit(a.speakerId, event.subjectId || a.listenerIds[0], {
        topic:
          a.type === "event"
            ? "recent_event"
            : a.type === "confront"
              ? "public_conflict"
              : "relationship_repair",
        stance: a.type,
        evidenceIds: [event.id],
      });
      for (const id of a.listenerIds) {
        const p = conversationCharacter(this.person(id)),
          trust = (this.gm.getTrust?.(id, a.speakerId) ?? 50) / 100;
        if (a.type === "confront") {
          this.trust(id, a.speakerId, -1, "confrontation");
          say(
            id,
            p.coverDrive > 0.5
              ? "That is not the whole story. What exactly did you hear?"
              : "Tell me what you think happened.",
          );
        } else if (["apologize", "repair", "admit"].includes(a.type)) {
          const accept =
            trust * 0.6 + p.repairDrive * 0.4 - random() * 0.25 > 0.4;
          this.trust(id, a.speakerId, accept ? 1 : 0, "relationship_repair");
          say(
            id,
            accept
              ? "I appreciate you saying that. I still need to see what you do next."
              : "I hear you, but words do not settle it for me.",
            accept ? "partial" : "refused",
          );
        } else
          say(
            id,
            `What I remember is ${this.describeEvent(event)}. What is your side of it?`,
          );
      }
    } else if (a.type === "threaten") {
      emit(a.speakerId, a.listenerIds[0], {
        topic: "pressure",
        stance: "threatened",
      });
      for (const id of a.listenerIds) {
        const p = conversationCharacter(this.person(id));
        this.trust(id, a.speakerId, -3, "strategic_threat");
        say(
          id,
          p.pressureDrive > 0.4
            ? "If you threaten me, I will make my own move."
            : "I do not like being cornered. Give me a real reason to work with you.",
          p.pressureDrive > 0.4 ? "resist" : "hedge",
        );
      }
    } else if (a.type === "deal" || a.type === "idol_protect") {
      for (const id of a.listenerIds) {
        const type =
          a.type === "idol_protect"
            ? "IDOL_PROTECTION"
            : a.dealType || "SHARE_INFO";
        if (["FINAL_TWO", "ALLIANCE_REFERENCE"].includes(type)) {
          say(id, "Let’s discuss that as an alliance.");
          continue;
        }
        const accept = (this.gm.getTrust?.(id, a.speakerId) ?? 50) >= 50;
        const deal = this.gm.systems.dealSystem?.createDeal({
          id: `${a.actionId}:deal:${id}`,
          type,
          parties: [a.speakerId, id],
          terms: {
            ownerId: a.speakerId,
            targetId: a.subjectId,
            conditions: a.conditions || [],
            protectedId: id,
            action: a.type === "idol_protect" ? "play_idol" : "exchange",
          },
        });
        if (this.person(id).isPlayer) {
          say(id, "Are you agreeing to those terms?", "pending");
          continue;
        }
        if (deal)
          (accept
            ? this.gm.systems.dealSystem.acceptDeal
            : this.gm.systems.dealSystem.refuseDeal
          ).call(this.gm.systems.dealSystem, deal.id, id, "conversation");
        if (accept)
          this.memory.recordConversationObligation(
            {
              id: `${a.actionId}:obligation:${id}`,
              kind: "promise",
              speakerId: a.speakerId,
              listenerIds: [id],
              topic: type,
              conditions: a.conditions || [],
              status: "active",
              day: this.gm.day,
              dealId: deal?.id,
            },
            participants,
          );
        say(
          id,
          accept
            ? "I can agree to those terms. That is a specific promise."
            : "I am not agreeing to that.",
        );
      }
    } else if (
      [
        "idol_reveal",
        "idol_hint",
        "idol_deny",
        "idol_conceal",
        "idol_bluff",
      ].includes(a.type)
    ) {
      const owns = ownsUsableIdol(
          this.person(a.speakerId),
          this.gm.systems.idolSystem,
        ),
        conceal = a.type === "idol_conceal";
      if (!conceal)
        emit(a.speakerId, a.speakerId, {
          topic: "idol_possession",
          stance:
            a.type === "idol_deny"
              ? "no"
              : a.type === "idol_hint"
                ? "possible"
                : "yes",
          mode:
            a.type === "idol_bluff" ||
            (a.type === "idol_hint" && !owns) ||
            (a.type === "idol_deny" && owns)
              ? "deliberate_lie"
              : "truthful",
        });
      for (const id of a.listenerIds)
        say(
          id,
          conceal
            ? "You do not have to show me. I still have to make my own plan."
            : "That changes what I need to think about. What are you offering?",
        );
    } else if (
      [
        "idol_ask",
        "idol_search",
        "vote_read",
        "safety",
        "numbers",
        "verify",
        "source",
        "why",
        "evidence",
        "who_knows",
        "loyalty",
        "reassure",
        "warn",
      ].includes(a.type)
    ) {
      for (const id of a.listenerIds)
        this.answer(a, id, emit, say, random, heard);
    } else if (
      ["alliance", "person_include", "person_exclude"].includes(a.type)
    ) {
      emit(a.speakerId, a.subjectId || a.listenerIds[0], {
        topic: "alliance_interest",
        stance: a.type === "person_exclude" ? "exclude" : "consider",
      });
      for (const id of a.listenerIds)
        say(
          id,
          "We should discuss who is included and what we are actually agreeing to.",
        );
    } else if (
      [
        "dangerous",
        "trustworthy",
        "lazy",
        "suspicious",
        "close",
        "isolated",
        "leader",
        "person_read",
        "vibe",
      ].includes(a.type)
    ) {
      for (const id of a.listenerIds) {
        const read = this.socialRead(id, a.type, a.subjectId);
        say(id, read.line);
        if (read.subjectId)
          emit(id, read.subjectId, {
            topic: "social_read",
            stance: a.type,
            mode: "inference",
            evidenceIds: read.evidenceIds,
          });
      }
    } else if (CONVERSATION_HANDLERS.bond.includes(a.type)) {
      for (const id of a.listenerIds) {
        const count = (
          this.memory.memory[String(id)]?.conversationHistory || []
        ).filter(
          (e) =>
            e.day === this.gm.day &&
            same(e.speakerId, a.speakerId) &&
            e.type === a.type,
        ).length;
        if (count < 2)
          this.gm.systems.relationshipSystem?.changeRelationship(
            a.speakerId,
            id,
            1,
          );
        emit(a.speakerId, id, { topic: "personal_bond", stance: a.type });
        say(id, this.bondLine(a.type, id, a.speakerId));
      }
    }
    for (const id of participants)
      this.memory.recordConversationHistory({
        id: a.actionId,
        participantIds: [id],
        speakerId: a.speakerId,
        subjectId: a.subjectId,
        type: a.type,
        topic: a.topic,
        line: result.playerLine,
        day: a.day,
        campTime: a.campTime,
        location: a.location,
        objectiveId: a.objectiveId,
        delegationId: a.delegationId,
      });
    result.followUps = this.followUps(a, result);
    this.receipts[a.actionId] = clone(result);
    const keys = Object.keys(this.receipts);
    if (keys.length > 500) delete this.receipts[keys[0]];
    if (this.camp?.conversation) {
      const cp = (this.camp.conversation.checkpoint ||= {
        activityId: this.camp.conversation.activityId,
        choices: {},
        statementIds: [],
        commitmentIds: [],
        topics: [],
      });
      cp.semanticLast = clone(result);
      this.camp.conversation.turns = (this.camp.conversation.turns || 0) + 1;
      this.camp.conversation.topics = `${this.camp.conversation.topics || ""} ${a.topic}`;
    }
    this.tasks.playerResponse(a, result);
    this.refreshConditions();
    for (const id of participants) {
      this.learnPromiseHistory(id);
      this.inferLeaks(id);
    }
    if (
      !this.person(a.speakerId).isPlayer &&
      !a.listenerIds.some((id) => this.person(id)?.isPlayer)
    ) {
      const activity = this.person(a.speakerId).campActivity;
      const claimId = this.memory
        .getCampClaims(a.listenerIds[0])
        .filter((k) => k.id.startsWith(`${a.actionId}:claim`))
        .at(-1)?.id;
      if (activity)
        this.gm.systems.campInteractionSystem?.hearExchange?.({
          speaker: this.person(a.speakerId),
          listener: this.person(a.listenerIds[0]),
          activity,
          claimId,
          random,
        });
    }
    this.objectives.invalidate(a.speakerId, ...a.listenerIds);
    return result;
  }
  statement(a, fields, random) {
    const id = `${a.actionId}:claim:${fields.speakerId}:${fields.topic || a.topic}:${fields.subjectId}`;
    const extras = {
      id,
      topic: a.topic,
      stance: "mentioned",
      mode: "truthful",
      speechAct: a.speechAct,
      leakTest: a.type === "leak_test",
      conditions: a.conditions || [],
      secrecy: a.secrecy,
      delegationId: a.delegationId,
      objectiveReference: a.objectiveId,
      location: a.location,
      activityId: a.activityId,
      proposition: a.proposition,
      ...fields,
    };
    if (this.model) return this.model.statement({ ...extras, random });
    const confidenceByListener = {};
    for (const listenerId of fields.listenerIds)
      confidenceByListener[String(listenerId)] = clamp(
        0.2 +
          ((this.gm.getTrust?.(listenerId, fields.speakerId) ?? 50) / 100) *
            0.35 +
          (this.memory.getCampSourceReliability?.(
            listenerId,
            fields.speakerId,
          ) ?? 0.75) *
            0.2,
      );
    this.memory.recordCampClaim({
      ...extras,
      origin: ["inference", "speculation"].includes(extras.mode)
        ? "inference"
        : extras.mode === "hearsay"
          ? "hearsay"
          : "participant",
      sourceChain: extras.sourceChain || [
        extras.attributedId || fields.speakerId,
      ],
      confidenceByListener,
      day: this.gm.day,
      campTime: this.gm.dayTimer,
      ...(["deliberate_lie", "decoy", "reassurance_lie"].includes(extras.mode)
        ? { truthfulness: false }
        : {}),
      salience: "high",
    });
    return {
      id,
      belief: Object.fromEntries(
        fields.listenerIds.map((id) => [
          String(id),
          confidenceByListener[String(id)] >= 0.45,
        ]),
      ),
    };
  }
  negotiate(a, id, belief, random) {
    if (this.person(id)?.isPlayer)
      return { line: "Your answer is up to you.", stance: "pending" };
    const npc = this.person(id),
      p = conversationCharacter(npc),
      target = this.person(a.subjectId),
      own = this.model?.state(id),
      alliance = this.gm.systems.allianceSystem;
    if (same(id, a.subjectId))
      return {
        line: "You are asking me to vote for myself. No.",
        stance: "refused",
      };
    const protects =
      (alliance?.getAllianceAffinity(id, a.subjectId) || 0) > 0.55;
    const history = this.memory.memory[String(id)]?.conversationHistory || [],
      hostility = history.filter(
        (e) => same(e.speakerId, a.speakerId) && e.type === "threaten",
      ).length;
    if (
      (protects ||
        (p.shieldValue > 0.2 &&
          (target?.challengeStrength || target?.strength || 5) >= 7)) &&
      p.loyalty > 0.4
    ) {
      if (
        a.type !== "pitch" &&
        p.coverDrive > 0.55 &&
        random() < p.coverDrive
      ) {
        this.makePromise(
          a,
          {
            speakerId: id,
            listenerIds: [
              a.speakerId,
              ...a.listenerIds.filter((x) => !same(x, id)),
            ],
            targetId: a.subjectId,
            cover: true,
          },
          random,
        );
        return {
          line: `Yes. You can count me for ${this.name(a.subjectId)}.`,
          stance: "committed",
        };
      }
      return {
        line: `No. ${this.name(a.subjectId)} helps my game. ${this.ownTarget(id) ? `What about ${this.name(this.ownTarget(id))}?` : "Give me another option."}`,
        stance: "refused",
      };
    }
    if (hostility > 1 && p.pressureDrive > 0.25)
      return {
        line: "I am not letting you dictate my vote.",
        stance: "refused",
      };
    if (!this.model)
      return {
        line: `I could consider ${this.name(a.subjectId)} if we go to Tribal. I am not promising yet.`,
        stance: "leaning",
      };
    const before = own.committedTargetId,
      outcome = this.model.adoption(id, a.speakerId, a.subjectId, {
        belief,
        random,
      });
    if (a.type === "pitch") {
      if (outcome === "commit") {
        own.committedTargetId = before;
        own.intentStatus = "provisional";
      }
      return {
        line:
          outcome === "refuse"
            ? `That does not work for me. I would rather discuss ${this.name(own.intendedVoteId)}.`
            : `I ${outcome === "hedge" ? "need to think about" : "can consider"} ${this.name(a.subjectId)}. That is not a vote promise.`,
        stance: outcome === "refuse" ? "refused" : "leaning",
      };
    }
    const known = this.knowledge(id),
      required = conversationMembers(this.gm)
        .filter(
          (x) =>
            !same(x.id, id) &&
            !same(x.id, a.speakerId) &&
            !same(x.id, a.subjectId),
        )
        .filter(
          (x) =>
            !known.some(
              (e) =>
                same(e.attributedId || e.speakerId, x.id) &&
                same(e.subjectId, a.subjectId) &&
                e.topic === "commitment" &&
                e.stance === "yes" &&
                !e.challenged,
            ),
        )
        .sort(
          (x, y) =>
            (this.gm.getTrust?.(id, y.id) ?? 50) -
            (this.gm.getTrust?.(id, x.id) ?? 50),
        )[0];
    if (
      ["commit", "open"].includes(outcome) &&
      required &&
      (a.type === "negotiate" ||
        (p.consensusNeed > 0.5 && this.model.viability(id, a.subjectId) < 2))
    ) {
      own.committedTargetId = before;
      own.intentStatus = "provisional";
      const conditions = [
        {
          kind: "known_commitment",
          voterId: required.id,
          targetId: a.subjectId,
        },
      ];
      this.makePromise(
        a,
        {
          speakerId: id,
          listenerIds: [
            a.speakerId,
            ...a.listenerIds.filter((x) => !same(x, id)),
          ],
          targetId: a.subjectId,
          conditions,
        },
        random,
      );
      return {
        line: `I’ll vote ${this.name(a.subjectId)} if ${this.name(required.id)} is actually in. Check that with them.`,
        stance: "conditional",
      };
    }
    if (outcome === "commit") {
      this.makePromise(
        a,
        {
          speakerId: id,
          listenerIds: [
            a.speakerId,
            ...a.listenerIds.filter((x) => !same(x, id)),
          ],
          targetId: a.subjectId,
        },
        random,
      );
      return {
        line: `I’m voting ${this.name(a.subjectId)}. You have my vote.`,
        stance: "committed",
      };
    }
    return {
      line:
        outcome === "refuse"
          ? `No. ${this.name(own.intendedVoteId)} makes more sense for me.`
          : outcome === "open"
            ? `I’m leaning ${this.name(a.subjectId)}, but I need to talk to people.`
            : `I’m not ready to commit. ${a.type === "press" ? "Pushing me does not change that." : "Who else is really in?"}`,
      stance:
        outcome === "refuse"
          ? "refused"
          : outcome === "open"
            ? "leaning"
            : "hedge",
    };
  }
  makePromise(
    a,
    { speakerId, listenerIds, targetId, conditions = [], cover = false },
    random,
  ) {
    const id = `${a.actionId}:promise:${speakerId}`,
      status = conditions.length ? "conditional" : "active";
    this.memory.recordConversationObligation(
      {
        id,
        kind: "promise",
        speakerId,
        listenerIds,
        targetId,
        conditions: clone(conditions),
        status,
        day: this.gm.day,
        campTime: this.gm.dayTimer,
        conditionMet: false,
        knowinglyFalse: cover,
      },
      [speakerId, ...listenerIds],
    );
    this.statement(
      a,
      {
        speakerId,
        listenerIds,
        subjectId: targetId,
        topic: "commitment",
        stance: conditions.length ? "conditional" : "yes",
        commitmentStatus: conditions.length ? "conditional" : "committed",
        conditions,
        mode: cover ? "deliberate_lie" : "truthful",
      },
      random,
    );
    if (this.model && !conditions.length && !cover)
      this.model.commit({
        id: `${id}:actual`,
        speakerId,
        listenerIds,
        targetId,
        random,
      });
  }
  conditionTrue(ownerId, c) {
    if (c.kind === "known_commitment")
      return this.knowledge(ownerId).some(
        (e) =>
          same(e.attributedId || e.speakerId, c.voterId) &&
          same(e.subjectId, c.targetId) &&
          e.topic === "commitment" &&
          e.stance === "yes" &&
          !e.challenged &&
          e.confidence >= 0.45,
      );
    if (c.kind === "secrecy")
      return this.memory
        .getConversationObligations(ownerId)
        .some(
          (p) =>
            p.kind === "secrecy" &&
            p.status === "accepted" &&
            same(p.speakerId, c.personId),
        );
    return false;
  }
  refreshConditions() {
    if (!this.model) return;
    for (const person of conversationMembers(this.gm))
      for (const promise of this.promises(person.id)) {
        if (
          !same(promise.speakerId, person.id) ||
          promise.status !== "conditional" ||
          promise.knowinglyFalse ||
          promise.day !== this.gm.day ||
          !promise.conditions.every((c) => this.conditionTrue(person.id, c))
        )
          continue;
        promise.conditionMet = true;
        promise.status = "active";
        const random = keyedRandom(promise.id);
        // Only the speaker's real intention changes; remote listeners are not notified.
        if (person.isPlayer) {
          const s = this.model.state(person.id);
          s.committedTargetId = promise.targetId;
          s.intendedVoteId = promise.targetId;
          this.model.strategy.personalTargetId = promise.targetId;
        } else {
          this.model.state(person.id).committedTargetId = promise.targetId;
          this.model.strategy.updateNpcIntentTarget(
            person.id,
            promise.targetId,
            { reason: "condition_met", absoluteConfidence: 0.8 },
          );
        }
      }
  }
  settlePromises(summary = {}) {
    const votes = summary.initialVotes || summary.votes || [],
      day = summary.day ?? this.gm.day;
    for (const person of this.gm.survivors || [])
      for (const promise of this.promises(person.id)) {
        if (
          !same(promise.speakerId, person.id) ||
          promise.targetId == null ||
          promise.day !== day ||
          !["active", "conditional"].includes(promise.status)
        )
          continue;
        const vote = votes.find((v) => same(v.voterId, person.id));
        if (!vote) continue;
        promise.status =
          promise.conditions?.length && !promise.conditionMet
            ? "condition_unmet"
            : same(vote.targetId, promise.targetId)
              ? "fulfilled"
              : "broken";
      }
  }
  learnPromiseHistory(ownerId) {
    const owned = this.knowledge(ownerId);
    for (const promise of this.promises(ownerId)) {
      if (
        same(promise.speakerId, ownerId) ||
        promise.learnedOutcome ||
        (promise.status === "conditional" && !promise.conditionMet)
      )
        continue;
      const evidence = owned.find(
        (e) =>
          e.day === promise.day &&
          e.topic === "vote_attribution" &&
          same(e.subjectId, promise.speakerId) &&
          e.confidence >= 0.65 &&
          !e.challenged,
      );
      if (!evidence || !evidence.proposition?.targetId) continue;
      promise.learnedOutcome = same(
        evidence.proposition.targetId,
        promise.targetId,
      )
        ? "fulfilled"
        : "broken";
      this.trust(
        ownerId,
        promise.speakerId,
        promise.learnedOutcome === "fulfilled" ? 1 : -4,
        "known_promise_outcome",
      );
      if (promise.learnedOutcome === "broken")
        this.memory.recordBetrayal(
          ownerId,
          promise.speakerId,
          "believed broken vote promise",
        );
    }
  }
  answer(a, id, emit, say, random, heard) {
    if (this.person(id)?.isPlayer) {
      say(id, "Choose how much you want to tell them.", "pending");
      return;
    }
    const p = conversationCharacter(this.person(id)),
      owned = this.knowledge(id),
      own = this.model?.state(id),
      last = this.lastExchange(a.speakerId);
    if (a.type === "vote_read" || a.type === "loyalty") {
      const cover =
        own &&
        (this.model.hasVotePlan(id, a.speakerId) ||
          (p.coverDrive > 0.55 && random() < p.coverDrive * 0.3));
      const target = cover
        ? own.decoys.find((d) =>
            d.audienceIds.some((x) => same(x, a.speakerId)),
          )?.targetId || this.model.alternateTarget(id, [id, a.speakerId])
        : own?.intendedVoteId;
      if (target && !same(target, a.speakerId)) {
        const speech = cover
          ? {
              topic: "target",
              stance: "consider",
              line: `I’m hearing ${this.name(target)}.`,
            }
          : this.model.voteStatement(id, target);
        emit(id, target, {
          topic: speech.topic,
          stance: speech.stance,
          mode: cover ? "decoy" : "truthful",
        });
        say(
          id,
          speech.line,
          speech.topic === "commitment" ? "committed" : "leaning",
        );
      } else say(id, "I am still figuring out where I stand.");
    } else if (a.type === "numbers") {
      const claims = owned.filter(
        (e) =>
          same(e.subjectId, a.subjectId) &&
          ["target", "commitment"].includes(e.topic) &&
          !negative(e) &&
          !same(e.speakerId, id) &&
          !this.protectedClaim(id, e),
      );
      const accounts = new Map();
      for (const e of claims)
        accounts.set(String(e.attributedId || e.speakerId), e);
      const lines = [...accounts.values()].slice(-4).map((e) => {
        emit(id, e.subjectId, {
          topic: e.topic,
          stance: e.stance,
          mode: "hearsay",
          attributedId: e.attributedId || e.speakerId,
          sourceChain: e.sourceChain,
          evidenceIds: [e.id],
          conditions: e.conditions,
        });
        return `${this.name(e.attributedId || e.speakerId)} ${e.topic === "commitment" && e.stance === "yes" ? "said they were in" : e.stance === "conditional" ? "gave a condition" : "was considering it"}${e.provenance === "hearsay" ? ` — that came through ${this.name(e.sourceId)}` : ""}`;
      });
      say(
        id,
        lines.length
          ? `${lines.join(". ")}. That is what I have heard; we should check.`
          : "I do not have enough confirmed names to count yet.",
      );
    } else if (a.type === "safety" || a.type === "warn") {
      const subject =
          a.type === "safety" ? a.speakerId : a.subjectId || a.listenerIds[0],
        e = owned.find(
          (e) =>
            same(e.subjectId, subject) &&
            ["target", "commitment", "safety"].includes(e.topic) &&
            !negative(e) &&
            e.stance !== "yes",
        );
      if (e && (this.gm.getTrust?.(id, a.speakerId) ?? 50) > 50) {
        emit(id, subject, {
          topic: "safety",
          stance: "warned",
          mode: "hearsay",
          attributedId: e.attributedId || e.speakerId,
          sourceChain: e.sourceChain,
          evidenceIds: [e.id],
        });
        say(
          id,
          `${this.name(e.speakerId)} mentioned that name. I would check with them.`,
        );
      } else if (a.type === "warn") {
        emit(a.speakerId, subject, {
          topic: "safety",
          stance: "warned",
          mode:
            a.truthMode === "fabrication" ? "deliberate_lie" : "speculation",
        });
        say(id, "I need to check what that means for me.");
      } else
        say(id, "Nobody has told me that. I cannot guarantee your safety.");
    } else if (a.type === "reassure") {
      emit(a.speakerId, id, {
        topic: "safety",
        stance: "yes",
        mode: a.truthMode === "fabrication" ? "reassurance_lie" : "speculation",
      });
      say(id, "I hear you. I still need to check with people.");
    } else if (a.type === "verify") {
      if (!same(heard.attributedId || heard.speakerId, id)) {
        const corroboration = owned.find(
          (k) =>
            same(
              k.attributedId || k.speakerId,
              heard.attributedId || heard.speakerId,
            ) &&
            same(k.subjectId, heard.subjectId) &&
            k.topic === heard.topic,
        );
        if (corroboration) {
          emit(id, heard.subjectId, {
            topic: corroboration.topic,
            stance: corroboration.stance,
            mode: "hearsay",
            attributedId: corroboration.attributedId || corroboration.speakerId,
            sourceChain: corroboration.sourceChain,
            evidenceIds: [corroboration.id],
          });
          say(
            id,
            `I heard that account too. You should ask ${this.name(heard.attributedId || heard.speakerId)} directly.`,
          );
        } else
          say(
            id,
            `I cannot verify that. You need to ask ${this.name(heard.attributedId || heard.speakerId)}.`,
          );
        return;
      }
      const prior = (this.memory.getCampClaims(id) || []).find(
        (e) =>
          same(e.speakerId, id) &&
          same(e.subjectId, heard.subjectId) &&
          e.topic === heard.topic &&
          e.day === heard.day,
      );
      const fabricate =
        !prior && p.coverDrive > 0.55 && random() < p.coverDrive;
      emit(id, heard.subjectId, {
        topic: heard.topic,
        stance: prior?.stance || (fabricate ? heard.stance : "denied"),
        mode:
          fabricate || prior?.truthfulness === false
            ? "deliberate_lie"
            : "truthful",
        refutesClaimId: !prior && !fabricate ? heard.id : null,
      });
      say(
        id,
        prior || fabricate
          ? "That is what I told them."
          : "I did not say that. Ask them where that came from.",
      );
    } else if (a.type === "idol_ask" || a.type === "idol_search") {
      const owns =
        a.type === "idol_ask"
          ? ownsUsableIdol(this.person(id), this.gm.systems.idolSystem)
          : this.memory
              .getCampObservations(id)
              .some(
                (e) =>
                  same(e.actorId, id) &&
                  ["idol_search_seen", "absence"].includes(e.type),
              );
      const admit =
        owns &&
        (this.gm.getTrust?.(id, a.speakerId) ?? 50) > 60 &&
        random() < p.advantageSharing;
      emit(id, id, {
        topic: a.type === "idol_ask" ? "idol_possession" : "idol_search",
        stance: admit ? "yes" : "no",
        mode: owns && !admit ? "deliberate_lie" : "truthful",
      });
      say(
        id,
        admit
          ? "Yes. Keep that between us."
          : "Nothing I am ready to show you.",
      );
    } else {
      const claim =
        owned.find((e) => e.id === a.claimId) ||
        [...owned]
          .reverse()
          .find(
            (e) =>
              same(e.subjectId, a.subjectId || last?.subjectId) &&
              e.kind === "claim",
          );
      if (!claim) {
        say(id, "I do not have a solid source for that.");
        return;
      }
      if (a.type === "source" && this.protectedClaim(id, claim))
        say(id, "I promised to keep that source private.");
      else if (
        a.type === "source" &&
        same(claim.speakerId, id) &&
        !claim.sourceId
      )
        say(id, "That is my own read from what I have seen.");
      else if (a.type === "source")
        say(
          id,
          `I heard it from ${this.name(claim.sourceId || claim.speakerId)}${claim.provenance === "hearsay" ? ". That was secondhand." : "."}`,
        );
      else if (a.type === "who_knows")
        say(
          id,
          claim.audienceIds?.length
            ? `I know ${claim.audienceIds.map((x) => this.name(x)).join(" and ")} heard that exchange. I cannot say who heard it later.`
            : "I do not know who else was told.",
        );
      else
        say(
          id,
          `${this.name(claim.speakerId)} ${claim.provenance === "inference" ? "suspected" : "said"} ${this.name(claim.subjectId)} was involved. I do not have more proof than that.`,
        );
    }
  }
  socialRead(ownerId, type, subjectId) {
    const p = conversationCharacter(this.person(ownerId)),
      owned = this.knowledge(ownerId),
      candidates = conversationMembers(this.gm).filter(
        (x) => !same(x.id, ownerId) && (!subjectId || same(x.id, subjectId)),
      );
    const ranked = candidates
      .map((x) => {
        const evidence = owned.filter(
            (e) => same(e.subjectId, x.id) || e.memberIds.includes(x.id),
          ),
          trust = (this.gm.getTrust?.(ownerId, x.id) ?? 50) / 100,
          impressions = this.memory.getCampImpression?.(ownerId, x.id) || {},
          observed =
            evidence.length +
            Object.values(impressions).reduce((n, v) => n + (v?.count || 0), 0);
        const speakerEvidence = owned.filter(
          (e) =>
            same(e.speakerId, x.id) &&
            ["target", "commitment", "delegation", "leadership"].includes(
              e.topic,
            ),
        );
        const company = this.memory
          .getCampObservations(ownerId)
          .filter(
            (e) =>
              e.type === "seen_together" &&
              (same(e.actorId, x.id) ||
                e.participantIds?.some((id) => same(id, x.id))),
          );
        const score =
          type === "close"
            ? company.length +
              owned.filter(
                (e) =>
                  e.topic === "alliance_disclosure" &&
                  e.memberIds.some((id) => same(id, x.id)),
              ).length +
              trust * 0.1
            : type === "trustworthy"
              ? trust + p.socialDrive * 0.1
              : type === "lazy"
                ? (impressions.role_neglect?.count || 0) -
                  (impressions.work?.count || 0)
                : type === "isolated"
                  ? 1 - trust + (observed ? 0 : 0.2)
                  : type === "leader"
                    ? speakerEvidence.length
                    : evidence.reduce(
                        (n, e) =>
                          n +
                          ([
                            "idol_possession",
                            "commitment",
                            "alliance_disclosure",
                            "public_conflict",
                            "betrayal",
                          ].includes(e.topic)
                            ? e.confidence
                            : 0),
                        0,
                      ) *
                        (1 + p.paranoiaDrive) +
                      (impressions.absence?.count || 0) * 0.12 +
                      (1 - trust) * p.strategyDrive;
        return {
          x,
          evidence:
            type === "leader" ? [...evidence, ...speakerEvidence] : evidence,
          score,
          observed: observed + speakerEvidence.length + company.length,
        };
      })
      .filter(
        (x) =>
          x.observed ||
          ["trustworthy", "close", "isolated", "person_read"].includes(type),
      )
      .sort((a, b) => b.score - a.score);
    const top = ranked[0];
    if (type === "vibe")
      return {
        line: owned.some((e) =>
          ["public_conflict", "betrayal", "safety"].includes(e.topic),
        )
          ? "I have heard tension and a few different stories. I am keeping my ears open."
          : "From what I have seen, people are still feeling one another out.",
        evidenceIds: [],
      };
    return top
      ? {
          line: `My read is ${this.name(top.x.id)}. ${top.evidence.some((e) => e.provenance === "hearsay") ? "Some of that is what people have told me." : "That comes from my own interactions."} I could be wrong.`,
          subjectId: top.x.id,
          evidenceIds: top.evidence.slice(-4).map((e) => e.id),
        }
      : { line: "I have not seen enough to give you a name.", evidenceIds: [] };
  }
  trust(owner, subject, delta, reason) {
    this.gm.systems.trustSystem?.changeOwnedTrust?.(
      owner,
      subject,
      delta,
      reason,
    );
  }
  protectedClaim(ownerId, claim) {
    return this.memory
      .getConversationObligations(ownerId)
      .find(
        (p) =>
          p.kind === "secrecy" &&
          p.status === "accepted" &&
          (p.claimId === claim.id ||
            p.claimId === claim.activityId ||
            claim.id.startsWith(`${p.claimId}:claim`)),
      );
  }
  noteSecretUse(a, claim) {
    for (const p of this.memory.getConversationObligations(a.speakerId))
      if (
        p.kind === "secrecy" &&
        p.status === "accepted" &&
        (p.claimId === claim.id ||
          p.claimId === claim.activityId ||
          claim.id.startsWith(`${p.claimId}:claim`)) &&
        a.listenerIds.some((id) => !p.allowedIds?.some((x) => same(x, id)))
      )
        p.status = "violated";
  }
  inferLeaks(ownerId) {
    const owned = this.knowledge(ownerId),
      sent = this.memory
        .getCampClaims(ownerId)
        .filter((e) => same(e.speakerId, ownerId));
    for (const returned of owned.filter(
      (e) => e.sourceChain.length > 1 && !same(e.speakerId, ownerId),
    )) {
      const original = sent.find(
        (e) =>
          (e.leakTest ||
            e.secrecy?.requested ||
            this.memory
              .getConversationObligations(ownerId)
              .some(
                (p) =>
                  p.kind === "secrecy" &&
                  p.requesterId === ownerId &&
                  e.id.startsWith(`${p.claimId}:claim`),
              )) &&
          e.topic === returned.topic &&
          same(e.subjectId, returned.subjectId) &&
          e.id !== returned.id &&
          e.audienceIds.some((id) =>
            returned.sourceChain.some((x) => same(x, id)),
          ),
      );
      if (!original) continue;
      const suspect = original.audienceIds.find((id) =>
        returned.sourceChain.some((x) => same(x, id)),
      );
      this.memory.recordCampClaim({
        id: `suspected-leak:${original.id}:${returned.id}`,
        speakerId: ownerId,
        subjectId: suspect,
        topic: "alliance_doubt",
        stance: "uncertain",
        origin: "inference",
        confidence: 0.35,
        evidenceIds: [original.id, returned.id],
        day: this.gm.day,
        campTime: this.gm.dayTimer,
      });
    }
  }
  bondLine(type, id, speakerId) {
    const p = conversationCharacter(this.person(id)),
      tense = (this.gm.getTrust?.(id, speakerId) ?? 50) < 40;
    if (tense)
      return "I appreciate the check-in. Things between us still need time.";
    return (
      {
        help: "Thanks. Come help me when we finish talking.",
        comfort: "Thank you. This has been a lot.",
        personal:
          "Being away from home is tough. What has this been like for you?",
        share_personal: "I appreciate you telling me. I will remember that.",
        joke:
          p.socialDrive > 0.6
            ? "I needed that laugh."
            : "You caught me at a good time.",
        praise: "Thanks. I am trying to do my part.",
        encourage: "That helps. Let’s keep going.",
        spend_time: "Sure. Let’s catch up for a bit.",
      }[type] || "Thanks for checking on me. How are you doing?"
    );
  }
  describeEvent(e) {
    if (e.topic === "previous_tribal")
      return e.proposition?.eliminatedId
        ? `${this.name(e.proposition.eliminatedId)} leaving at Tribal${e.proposition.revote ? " after a revote" : ""}`
        : "the last Tribal ending without an elimination";
    if (e.topic === "challenge_result")
      return `${e.proposition?.name || "the challenge"}${e.proposition?.winnerId ? ` won by ${this.name(e.proposition.winnerId)}` : e.proposition?.won ? " — our win" : " — our loss"}`;
    if (e.topic === "idol_play")
      return `${this.name(e.subjectId)} playing an idol for ${this.name(e.proposition?.protectedId)}`;
    if (e.topic === "vote_attribution")
      return `${this.name(e.subjectId)} voting ${this.name(e.proposition?.targetId)}`;
    return `${e.topic?.replaceAll("_", " ") || e.type} involving ${this.name(e.subjectId || e.speakerId)}`;
  }
  sentence(a) {
    const name = this.name(a.subjectId);
    return (
      {
        pitch: `What if we vote ${name}?`,
        check_in: "How are you holding up?",
        personal: "What has being out here been like for you?",
        share_personal:
          "Being away from home has been a lot. I appreciate having someone to talk to.",
        joke: "If coconuts could vote, I think they would write my name.",
        praise: "I appreciate what you have been doing around camp.",
        encourage: "We can keep each other going.",
        comfort: "You seem to have a lot on your mind. Want to talk?",
        help: "Would you like a hand around camp?",
        spend_time: "Want to spend some time together?",
        vibe: "How does camp feel to you?",
        dangerous: "Who seems dangerous to you?",
        trustworthy: "Who do you trust?",
        lazy: "Who have you seen avoiding the work?",
        suspicious: "Who seems suspicious?",
        close: "Who have you seen getting close?",
        isolated: "Who seems left out?",
        leader: "Who is trying to lead things?",
        vote_read: "Where are you on the vote?",
        safety: "Has my name come up?",
        numbers: `Who do we actually have for ${name}?`,
        source: "Who told you?",
        why: "Why do you think that?",
        evidence: "What exactly did you hear?",
        who_knows: "Who else heard that?",
        loyalty: "Where do we stand with each other?",
        reassure: "I want you to feel safe with me.",
        warn: `I think ${name} needs to be careful.`,
        leak_test: `I think ${name} might be the vote.`,
        backup: `Could we use ${name} as a backup?`,
        split: `Could we split some votes onto ${name}?`,
        idol_ask: "Have you found an idol?",
        idol_search: "Have you been looking for an idol?",
        idol_hint: "I might have some protection.",
        idol_protect:
          "If the vote turns onto you, I promise to use my idol to protect you.",
        ask_vote: `Will you vote ${name}?`,
        press: `I need an answer. Will you vote ${name}?`,
        negotiate: `What would get you to ${name}?`,
        promise: `I’m voting ${name}.`,
        conditional: `I’ll vote ${name} if ${a.conditions.map((c) => `${this.name(c.voterId)} is in`).join(" and ")}.`,
        cover_promise: `I’m voting ${name}.`,
        delegate: `Would you talk to ${name}${a.planTargetId ? ` about voting ${this.name(a.planTargetId)}` : ""}? ${a.keepSourcePrivate ? "Keep my name out of it." : ""}`,
        decoy: `I’m hearing ${name}.`,
        bluff: `${this.name(a.allegedSourceId)} committed to ${name}.`,
        speculate: `I think ${name} might be the vote.`,
        idol_bluff: "I have an idol.",
        idol_fabricate: `I heard ${name} has an idol.`,
        idol_speculate: `I think ${name} might have an idol.`,
        idol_reveal: "I have an idol. I want you to know.",
        idol_deny: "I do not have an idol.",
        idol_conceal: "I am keeping that private.",
        secrecy: "Keep this between us.",
        threaten: "If you leave me out, I will expose the plan.",
      }[a.type] || ACTION_DEFINITIONS[a.type].label
    );
  }
  followUps(a, result) {
    const base = ["change_topic", "end"];
    if (["pitch", "ask_vote", "press", "negotiate"].includes(a.type))
      return ["numbers", "negotiate", "promise", "delegate", ...base];
    if (["share", "verify", "vote_read", "safety", "idol_ask"].includes(a.type))
      return ["source", "why", "evidence", "who_knows", ...base];
    if (a.type === "delegate" || a.type === "follow_task")
      return ["follow_task", "pitch", "backup", ...base];
    if (["apologize", "repair", "confront"].includes(a.type))
      return ["why", "loyalty", "secrecy", ...base];
    return ["check_in", "personal", ...base];
  }
  executeAgenda(actor, listener, activity, random) {
    const agenda =
      activity.agenda ||
      this.model?.agenda(actor.id, listener.id, { plan: true });
    if (!this.model || !agenda) return null;
    // Keep #353–#354 adoption, source sharing and checkpoint RNG authoritative.
    // This is a semantic adapter, not a second NPC resolver or intention model.
    const result = this.model.resolveAgenda(
      actor,
      listener,
      { ...activity, agenda },
      random,
    );
    if (result)
      this.memory.recordConversationHistory({
        id: `${activity.id}:agenda-history:${listener.id}`,
        participantIds: [actor.id, listener.id],
        speakerId: actor.id,
        subjectId: agenda.primarySubject,
        type: agenda.purpose,
        topic: agenda.purpose,
        day: this.gm.day,
        campTime: this.gm.dayTimer,
        location: activity.location,
      });
    this.refreshConditions();
    this.inferLeaks(actor.id);
    return result;
  }
  resolveCampAgenda(actor, listener, activity) {
    const id = `${activity.id}:social`;
    if (this.receipts[id]) return { ...clone(this.receipts[id]), replay: true };
    const random = keyedRandom(
        `${this.gm.seasonEngine?.state?.seed || 1}:${id}`,
      ),
      p = conversationCharacter(actor),
      owned = this.knowledge(actor.id),
      discreet =
        conversationMembers(this.gm).filter(
          (x) =>
            this.together(actor.id, x.id) &&
            !same(x.id, actor.id) &&
            !same(x.id, listener.id),
        ).length === 0,
      strategic =
        activity.type === "strategy_conversation" ||
        activity.socialPurpose === "strategy",
      allied =
        (this.gm.systems.allianceSystem?.getAllianceAffinity(
          actor.id,
          listener.id,
        ) || 0) > 0.35,
      trust = this.gm.getTrust?.(actor.id, listener.id) ?? 50;
    const fresh = owned.filter(
        (k) =>
          !same(k.subjectId, listener.id) &&
          this.gm.day - k.day < 4 &&
          k.confidence >= 0.18 &&
          (!this.protectedClaim(actor.id, k) || random() < p.coverDrive * 0.2),
      ),
      claim = fresh.filter((k) => k.kind === "claim").at(-1);
    let type = "check_in",
      fields = {};
    if (
      strategic &&
      discreet &&
      claim &&
      ["target", "idol_suspicion"].includes(claim.topic) &&
      random() < campLieAttemptChance(p)
    ) {
      type = claim.topic === "target" ? "speculate" : "idol_fabricate";
      fields = { subjectId: claim.subjectId, truthMode: "fabrication" };
    } else if (
      random() <
      Math.min(
        0.72,
        0.2 +
          (strategic ? 0.22 : 0) +
          (allied ? 0.12 : 0) +
          (trust > 65 ? 0.1 : 0) +
          p.socialDrive * 0.08 -
          (discreet ? 0 : 0.22),
      )
    ) {
      if (
        claim &&
        (claim.topic !== "idol_possession" ||
          random() < 0.15 + p.advantageSharing * 0.6)
      ) {
        type = "share";
        fields = { claimId: claim.id };
      } else {
        const sighting = fresh
          .filter(
            (k) =>
              k.kind === "observation" &&
              !same(k.subjectId, actor.id) &&
              ["absence", "role_neglect", "work", "seen_together"].includes(
                k.topic,
              ),
          )
          .at(-1);
        if (sighting) {
          this.memory.recordCampClaim({
            id: `${id}:observation-account`,
            speakerId: actor.id,
            subjectId: sighting.subjectId,
            topic: sighting.topic,
            stance: "observed",
            origin: "firsthand",
            evidenceIds: [sighting.id],
            day: this.gm.day,
            campTime: this.gm.dayTimer,
          });
          type = "share";
          fields = { claimId: `${id}:observation-account` };
        }
      }
    }
    if (
      type === "check_in" &&
      strategic &&
      discreet &&
      allied &&
      trust >= 65 &&
      ownsUsableIdol(actor, this.gm.systems.idolSystem) &&
      random() < 0.02 + p.advantageSharing * 0.25
    )
      type = "idol_reveal";
    if (type === "check_in" && strategic && discreet) {
      const intent = selectCampStrategicIntent(
        this.memory.getNpcConversationIntents(actor.id, { limit: null }),
        this.gm,
        listener.id,
      );
      if (
        intent &&
        random() <
          (allied ? 0.35 : 0.15) +
            p.strategyDrive * 0.2 +
            p.confrontationDrive * 0.1
      ) {
        type = intent.intent === "warning" ? "warn" : "pitch";
        fields = { subjectId: intent.targetId };
      }
    }
    const result = this.resolve(
      this.action(type, {
        actionId: id,
        speakerId: actor.id,
        listenerIds: [listener.id],
        activityId: activity.id,
        ...fields,
      }),
    );
    const claimId = this.memory
      .getCampClaims(listener.id)
      .filter((k) => k.id.startsWith(`${id}:claim`))
      .at(-1)?.id;
    this.gm.systems.campInteractionSystem?.hearExchange?.({
      speaker: actor,
      listener,
      activity,
      claimId,
      random,
    });
    return result;
  }
  serialize() {
    return clone({
      receipts: this.receipts,
      sequence: this.sequence,
      tasks: this.tasks.serialize(),
      objectives: this.objectives.serialize(),
    });
  }
  deserialize(p = {}) {
    this.receipts = p?.receipts || {};
    this.sequence = p?.sequence || 0;
    this.tasks.deserialize(p?.tasks);
    this.objectives.deserialize(p?.objectives);
  }
}
export { CONVERSATION_RESOLVER_TYPES };
