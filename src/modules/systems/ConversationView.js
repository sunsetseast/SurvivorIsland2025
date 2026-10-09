import {
  CONVERSATION_CATEGORIES,
  ACTION_DEFINITIONS,
  PERSON_READ_ANGLES,
  TASK_PURPOSES,
  actionSubjects,
  conversationCapabilities,
  suggestedConversationActions,
} from "./ConversationActionCatalog.js";
import eventManager from "../core/EventManager.js";
const same = (a, b) => a != null && b != null && String(a) === String(b);
const GROUPS = {
  read: [
    [
      "Camp impressions",
      [
        "vibe",
        "dangerous",
        "trustworthy",
        "lazy",
        "suspicious",
        "close",
        "isolated",
        "leader",
      ],
    ],
    [
      "Votes and safety",
      ["vote_read", "safety", "numbers", "loyalty", "strategy_style"],
    ],
    [
      "Information and sources",
      ["share", "verify", "source", "why", "evidence", "who_knows"],
    ],
  ],
  move: [
    [
      "Votes and promises",
      [
        "pitch",
        "ask_vote",
        "press",
        "negotiate",
        "promise",
        "conditional",
        "cover_promise",
        "withdraw",
      ],
    ],
    ["Plans and protection", ["backup", "split", "warn", "reassure", "deal"]],
    [
      "Deception and leverage",
      ["decoy", "bluff", "speculate", "threaten", "leak_test", "leak"],
    ],
    [
      "Ask someone to help",
      ["delegate", "follow_task", "report", "bring", "come_with_me"],
    ],
  ],
  idol: [
    [
      "Ask and investigate",
      [
        "idol_ask",
        "idol_search",
        "idol_rumor",
        "idol_speculate",
        "idol_fabricate",
      ],
    ],
    [
      "Your protection",
      [
        "idol_reveal",
        "idol_hint",
        "idol_deny",
        "idol_conceal",
        "idol_bluff",
        "idol_protect",
      ],
    ],
  ],
  relationships: [
    ["Loyalty and alliances", ["alliance", "loyalty", "secrecy"]],
    [
      "What happened between you",
      ["repair", "apologize", "confront", "admit", "deny", "event"],
    ],
  ],
};
// DOM orchestration only; Back changes navigation, never semantic state.
export default class ConversationView {
  constructor(host) {
    this.host = host;
  }
  get engine() {
    return this.host.engine;
  }
  get gm() {
    return this.host.gameManager;
  }
  get reservation() {
    return this.gm.systems.campActivitySystem.conversation;
  }
  participants(npc) {
    return [npc.id, ...(this.reservation?.groupIds || [])].filter(
      (id, i, a) =>
        a.findIndex((x) => same(x, id)) === i &&
        this.engine.together(this.gm.player.id, id),
    );
  }
  session(npc, context) {
    const h = this.host;
    h.nodeSession ||= { npcId: npc.id, context, transcript: [], menuStack: [] };
    h._initTranscript(h.nodeSession);
    const cp = this.reservation?.checkpoint;
    if (cp?.semanticTranscript && !h.nodeSession.transcript.length)
      h.nodeSession.transcript = JSON.parse(
        JSON.stringify(cp.semanticTranscript),
      );
    else if (cp?.lastLine && !h.nodeSession.transcript.length)
      h.nodeSession.addNpc(cp.lastLine);
    return h.nodeSession;
  }
  show(npc, context = {}) {
    if (!this.reservation) return false;
    const player = this.gm.getPlayerSurvivor(),
      session = this.session(npc, context),
      listeners = this.participants(npc),
      capabilities = conversationCapabilities(
        this.engine,
        player.id,
        listeners,
      ),
      suggestions = suggestedConversationActions(
        this.engine,
        player.id,
        listeners,
      );
    const incoming = this.engine.tasks
      .knownTasks(player.id)
      .find(
        (t) =>
          same(t.delegateId, player.id) &&
          same(t.requesterId, npc.id) &&
          ["pending", "hedged"].includes(t.publicStatus),
      );
    const buttons = [];
    const offer = this.gm.systems.dealSystem
      ?.getDealsForSurvivor?.(player.id)
      ?.find(
        (d) =>
          d.status === "PROPOSED" &&
          d.parties.some((id) => same(id, npc.id)) &&
          same(d.parties[0], npc.id),
      );
    if (offer) {
      buttons.push(
        {
          label: "Agree to their proposed deal",
          onClick: () => this.respondToDeal(npc, context, offer, true),
        },
        {
          label: "Decline their proposed deal",
          onClick: () => this.respondToDeal(npc, context, offer, false),
        },
      );
    }
    if (incoming) {
      buttons.push(
        {
          label: "Agree to the request",
          onClick: () => this.respondToTask(npc, context, incoming, true),
        },
        {
          label: "Decline the request",
          onClick: () => this.respondToTask(npc, context, incoming, false),
        },
        {
          label: "Maybe — don’t count on me yet",
          onClick: () => this.respondToTask(npc, context, incoming, "hedge"),
        },
      );
    }
    const meeting = this.engine.tasks
      .playerRequests(player.id)
      .find(
        (t) =>
          t.meetingIds.includes(npc.id) &&
          t.meetingIds.every((id) => this.engine.together(player.id, id)) &&
          !this.reservation.groupIds?.some((id) => same(id, t.targetId)),
      );
    if (meeting)
      buttons.push({
        label: `Talk together with ${this.engine.name(meeting.targetId)}`,
        onClick: () => {
          this.engine.camp.reserveConversationGroup([meeting.targetId]);
          if (this.host.activeOverlay)
            this.host._renderScrambleParticipants(this.host.activeOverlay, npc);
          this.show(npc, context);
        },
      });
    const walk = this.engine.tasks
      .playerRequests(player.id)
      .find((t) => t.canWalk && same(t.targetId, npc.id));
    if (walk)
      buttons.push({
        label: `Walk with ${this.engine.name(npc.id)}`,
        onClick: () => {
          this.reservation.followWithId = npc.id;
          this.host.endConversation();
          this.engine.tasks.beginBring(walk.id, player.id);
        },
      });
    const priority = suggestions.filter(
      (d) => d.taskContext || d.type === "report",
    );
    if (context.reportTaskId)
      priority.sort(
        (a, b) =>
          Number(b.delegationId === context.reportTaskId) -
          Number(a.delegationId === context.reportTaskId),
      );
    for (const d of priority)
      buttons.push({
        label: d.label,
        onClick: () => this.choose(npc, context, d, d),
      });
    for (const choice of this.engine.initiative.dialogueChoices(npc)) {
      buttons.push({
        label: choice.label,
        onClick: () => {
          if (choice.counterPicker) {
            this.choose(npc, context, ACTION_DEFINITIONS.pitch, {
              negotiationCounter: true,
            });
          } else if (choice.conditionPicker) {
            const people = this.engine.camp
              .members()
              .filter(
                (p) => !same(p.id, player.id) && !same(p.id, choice.subjectId),
              );
            this.render(
              npc,
              session,
              people.map((p) => ({
                label: `Only if ${p.firstName} is in`,
                onClick: () =>
                  this.choose(npc, context, ACTION_DEFINITIONS.conditional, {
                    subjectId: choice.subjectId,
                    conditions: [
                      {
                        kind: "known_commitment",
                        voterId: p.id,
                        targetId: choice.subjectId,
                      },
                    ],
                  }),
              })),
              () => this.show(npc, context),
              "Whose support do you need?",
            );
          } else
            this.choose(npc, context, ACTION_DEFINITIONS[choice.type], choice);
        },
      });
    }
    const last = this.reservation.checkpoint?.semanticLast;
    const reportChallenge =
      last?.type === "confront" &&
      this.engine
        .events(player.id)
        .find(
          (event) =>
            event.proposition?.delegateId != null &&
            same(event.proposition.delegateId, player.id) &&
            event.proposition.reportId &&
            event.evidenceIds?.length &&
            same(event.speakerId, npc.id),
        );
    if (reportChallenge) {
      for (const [type, label] of [
        ["admit", "Admit your report was wrong"],
        ["deny", "Stand by your report"],
        ["event", "Explain a possible misunderstanding"],
        ["apologize", "Apologize for the report"],
      ]) {
        const def = capabilities.find((d) => d.type === type);
        if (def)
          buttons.push({
            label,
            onClick: () =>
              this.choose(npc, context, def, {
                eventId: reportChallenge.id,
                subjectId: reportChallenge.subjectId,
                line:
                  type === "event"
                    ? "I may have misunderstood what they told me."
                    : undefined,
              }),
          });
      }
    }
    for (const type of (last?.followUps || [])
      .filter(() => !reportChallenge)
      .filter((t) => ACTION_DEFINITIONS[t])
      .slice(0, 3)) {
      const def = capabilities.find((d) => d.type === type);
      if (def)
        buttons.push({
          label: def.label,
          onClick: () =>
            this.choose(npc, context, def, {
              subjectId:
                !def.subject ||
                (def.subject === "target" &&
                  !["backup", "split"].includes(def.type))
                  ? last.subjectId
                  : null,
            }),
        });
    }
    if (!buttons.length)
      for (const d of suggestions.filter(
        (d) => !d.taskContext && d.type !== "report",
      ))
        buttons.push({
          label: d.label,
          onClick: () => this.choose(npc, context, d, d),
        });
    for (const [category, label] of CONVERSATION_CATEGORIES)
      buttons.push({
        label,
        onClick: () => this.category(npc, context, category),
      });
    this.render(
      npc,
      session,
      buttons,
      null,
      listeners.length > 1
        ? "Everyone in this conversation can hear you."
        : "Choose what you want to say.",
    );
    return true;
  }
  category(npc, context, category, subset = null) {
    const player = this.gm.player,
      listeners = this.participants(npc),
      capabilities = conversationCapabilities(
        this.engine,
        player.id,
        listeners,
      ).filter(
        (d) => d.category === category && (!subset || subset.includes(d.type)),
      );
    if (GROUPS[category] && !subset) {
      const buttons = GROUPS[category]
        .filter(([, types]) => capabilities.some((d) => types.includes(d.type)))
        .map(([label, types]) => ({
          label,
          onClick: () => this.category(npc, context, category, types),
        }));
      this.render(
        npc,
        this.session(npc, context),
        buttons,
        () => this.show(npc, context),
        CONVERSATION_CATEGORIES.find(([id]) => id === category)?.[1],
      );
      return;
    }
    const buttons = capabilities.map((d) => ({
      label: d.label,
      onClick: () => {
        if (d.type === "alliance")
          return this.host._renderAllianceConversation({
            player,
            npc,
            context,
          });
        this.choose(npc, context, d, { menuGroup: subset });
      },
    }));
    this.render(
      npc,
      this.session(npc, context),
      buttons,
      () =>
        subset
          ? this.category(npc, context, category)
          : this.show(npc, context),
      CONVERSATION_CATEGORIES.find(([id]) => id === category)?.[1],
    );
  }
  choose(npc, context, def, fields = {}) {
    const back = () =>
        this.category(npc, context, def.category, fields.menuGroup || null),
      e = this.engine,
      player = this.gm.player,
      listeners = this.participants(npc);
    const key =
      def.subject === "claim"
        ? "claimId"
        : def.subject === "event"
          ? "eventId"
          : def.subject === "task"
            ? "delegationId"
            : "subjectId";
    if (
      def.subject &&
      !fields[key] &&
      !(def.type === "reply" && fields.stance === "withheld")
    ) {
      const candidates = actionSubjects(e, def.type, player.id, listeners);
      this.render(
        npc,
        this.session(npc, context),
        candidates.map((subject) => ({
          label:
            def.subject === "claim"
              ? `${e.name(subject.speakerId)}: ${subject.topic.replaceAll("_", " ")} — ${e.name(subject.subjectId)}`
              : def.subject === "event"
                ? e.describeEvent(subject)
                : def.subject === "task"
                  ? `About ${e.name(subject.targetId)}`
                  : subject.firstName,
          onClick: () =>
            this.choose(npc, context, def, {
              ...fields,
              [key]: subject.id,
              ...(def.subject === "claim"
                ? { subjectId: subject.subjectId }
                : {}),
              ...(def.subject === "event"
                ? { subjectId: subject.subjectId || npc.id }
                : {}),
            }),
        })),
        back,
        "Who or what do you mean?",
      );
      return;
    }
    if (def.type === "person_read" && !fields.readAngle) {
      this.render(
        npc,
        this.session(npc, context),
        PERSON_READ_ANGLES.map(([readAngle, label]) => ({
          label,
          onClick: () =>
            this.choose(npc, context, def, { ...fields, readAngle }),
        })),
        back,
        "What do you want to ask about them?",
      );
      return;
    }
    if (def.type === "conditional" && !fields.conditions) {
      const candidates = actionSubjects(
        e,
        "delegate",
        player.id,
        listeners,
      ).filter((p) => !same(p.id, fields.subjectId));
      this.render(
        npc,
        this.session(npc, context),
        candidates.map((p) => ({
          label: `Only if ${p.firstName} commits`,
          onClick: () =>
            this.choose(npc, context, def, {
              ...fields,
              conditions: [
                {
                  kind: "known_commitment",
                  voterId: p.id,
                  targetId: fields.subjectId,
                },
              ],
            }),
        })),
        back,
        "Make your condition clear",
      );
      return;
    }
    if (def.type === "bluff" && !fields.allegedSourceId) {
      const candidates = actionSubjects(
        e,
        "person_read",
        player.id,
        listeners,
      ).filter((p) => !same(p.id, fields.subjectId));
      this.render(
        npc,
        this.session(npc, context),
        candidates.map((p) => ({
          label: `Bluff: say ${p.firstName} committed`,
          onClick: () =>
            this.choose(npc, context, def, {
              ...fields,
              allegedSourceId: p.id,
              truthMode: "fabrication",
            }),
        })),
        back,
        "You are inventing a commitment",
      );
      return;
    }
    if (["delegate", "bring"].includes(def.type) && !fields.requestedAction) {
      const groups = [
        [
          "Their vote",
          ["recruit", "verify_vote", "check_loyalty", "backup", "split"],
        ],
        [
          "Information",
          ["verify_rumor", "gather", "pass_info", "leak", "protect_source"],
        ],
        ["Relationships", ["warn", "reassure", "bring", "repair", "decoy"]],
      ];
      if (def.type !== "bring" && !fields.taskGroup) {
        this.render(
          npc,
          this.session(npc, context),
          groups.map(([label, purposes]) => ({
            label,
            onClick: () =>
              this.choose(npc, context, def, {
                ...fields,
                taskGroup: purposes,
              }),
          })),
          back,
          `Ask ${npc.firstName} to talk to ${e.name(fields.subjectId)}`,
        );
        return;
      }
      this.render(
        npc,
        this.session(npc, context),
        TASK_PURPOSES.filter(
          ([p]) =>
            (def.type !== "bring" || p === "bring") &&
            (!fields.taskGroup || fields.taskGroup.includes(p)) &&
            (!["verify_rumor", "pass_info", "leak"].includes(p) ||
              e.knowledge(player.id).some((k) => k.kind === "claim")),
        ).map(([purpose, label]) => ({
          label,
          onClick: () =>
            this.choose(npc, context, def, {
              ...fields,
              requestedAction: purpose,
            }),
        })),
        back,
        `Ask ${npc.firstName} to talk to ${e.name(fields.subjectId)}`,
      );
      return;
    }
    if (
      ["verify_rumor", "pass_info", "leak"].includes(fields.requestedAction) &&
      !fields.claimId
    ) {
      this.render(
        npc,
        this.session(npc, context),
        e
          .knowledge(player.id)
          .filter((k) => k.kind === "claim")
          .slice(-12)
          .map((k) => ({
            label: `${e.name(k.speakerId)}: ${k.topic.replaceAll("_", " ")} — ${e.name(k.subjectId)}`,
            onClick: () =>
              this.choose(npc, context, def, { ...fields, claimId: k.id }),
          })),
        back,
        "Which information should they use?",
      );
      return;
    }
    if (
      ["backup", "split", "decoy"].includes(fields.requestedAction) &&
      !fields.planTargetId
    ) {
      this.render(
        npc,
        this.session(npc, context),
        actionSubjects(e, "pitch", player.id, listeners)
          .filter((p) => !same(p.id, e.ownTarget(player.id)))
          .map((p) => ({
            label: p.firstName,
            onClick: () =>
              this.choose(npc, context, def, { ...fields, planTargetId: p.id }),
          })),
        back,
        fields.requestedAction === "decoy"
          ? "Which decoy name should they give?"
          : "Which second target should they discuss?",
      );
      return;
    }
    if (
      ["delegate", "bring"].includes(def.type) &&
      fields.attribution == null
    ) {
      this.render(
        npc,
        this.session(npc, context),
        [
          ["private", "Don’t use my name"],
          ["sent", "Tell them I sent you"],
          ["if_necessary", "Only tell them if necessary"],
        ].map(([attribution, label]) => ({
          label,
          onClick: () =>
            this.choose(npc, context, def, {
              ...fields,
              attribution,
              keepSourcePrivate: attribution === "private",
              secrecy: { requested: true },
            }),
        })),
        back,
        "How should they explain the approach?",
      );
      return;
    }
    if (
      ["delegate", "bring", "backup", "split", "numbers"].includes(def.type) &&
      !fields.planTargetId
    ) {
      const target =
        e.ownTarget(player.id) ||
        e
          .knowledge(player.id)
          .filter((k) => ["target", "commitment"].includes(k.topic))
          .at(-1)?.subjectId;
      if (target) fields.planTargetId = target;
      else if (
        ["delegate", "numbers"].includes(def.type) &&
        ["recruit", "decoy", "backup", "split", undefined].includes(
          fields.requestedAction,
        )
      ) {
        this.render(
          npc,
          this.session(npc, context),
          actionSubjects(e, "pitch", player.id, listeners).map((p) => ({
            label: p.firstName,
            onClick: () =>
              this.choose(npc, context, def, {
                ...fields,
                planTargetId: p.id,
                ...(def.type === "numbers" ? { subjectId: p.id } : {}),
              }),
          })),
          back,
          "Which voting plan?",
        );
        return;
      }
    }
    if (def.type === "numbers" && !fields.subjectId)
      fields.subjectId = fields.planTargetId;
    if (def.type === "deal" && !fields.dealType) {
      this.render(
        npc,
        this.session(npc, context),
        [
          ["VOTE_TOGETHER", "Agree on this vote"],
          ["SHARE_INFO", "Exchange information"],
          ["MUTUAL_PROTECTION", "Protect one another"],
        ].map(([dealType, label]) => ({
          label,
          onClick: () =>
            this.choose(npc, context, def, { ...fields, dealType }),
        })),
        back,
        "Make a specific agreement",
      );
      return;
    }
    if (
      def.type === "deal" &&
      fields.dealType === "VOTE_TOGETHER" &&
      !fields.subjectId
    ) {
      this.render(
        npc,
        this.session(npc, context),
        actionSubjects(e, "pitch", player.id, listeners).map((p) => ({
          label: `Vote ${p.firstName}`,
          onClick: () =>
            this.choose(npc, context, def, { ...fields, subjectId: p.id }),
        })),
        back,
        "Which target are you agreeing on?",
      );
      return;
    }
    if (def.type === "report" && !fields.truthMode) {
      this.render(
        npc,
        this.session(npc, context),
        [
          {
            label: "Report what actually happened",
            onClick: () =>
              this.choose(npc, context, def, { ...fields, truthMode: "truth" }),
          },
          {
            label:
              e.tasks.get(fields.delegationId)?.purpose === "recruit"
                ? "Bluff: say they committed"
                : "Bluff: say it went well",
            onClick: () =>
              this.choose(npc, context, def, {
                ...fields,
                truthMode: "fabrication",
              }),
          },
          ...[
            ["not_done", "Admit you did not do it"],
            ["unreached", "Say you could not reach them"],
          ].map(([reportStance, label]) => ({
            label,
            onClick: () =>
              this.choose(npc, context, def, {
                ...fields,
                truthMode: "truth",
                reportStance,
              }),
          })),
        ],
        back,
        "What will you tell them?",
      );
      return;
    }
    if (
      ["share", "leak", "idol_rumor"].includes(def.type) &&
      fields.keepSourcePrivate == null
    ) {
      this.render(
        npc,
        this.session(npc, context),
        [
          {
            label: "Name the source",
            onClick: () =>
              this.choose(npc, context, def, {
                ...fields,
                keepSourcePrivate: false,
              }),
          },
          {
            label: "Keep the source private",
            onClick: () =>
              this.choose(npc, context, def, {
                ...fields,
                keepSourcePrivate: true,
              }),
          },
        ],
        back,
        "How much do you want to share?",
      );
      return;
    }
    const { menuGroup, taskGroup, ...semanticFields } = fields;
    const action = e.action(def.type, {
      speakerId: player.id,
      listenerIds: listeners,
      ...semanticFields,
      truthMode: [
        "cover_promise",
        "bluff",
        "decoy",
        "idol_bluff",
        "idol_fabricate",
      ].includes(def.type)
        ? "fabrication"
        : fields.truthMode || "truth",
    });
    const result = e.resolve(action);
    if (result.invalid) {
      this.render(
        npc,
        this.session(npc, context),
        [],
        () => this.show(npc, context),
        "That option is no longer available.",
      );
      return;
    }
    this.append(npc, context, result);
    const follow = e.initiative.afterPlayerAction(npc, action, result);
    if (follow && !follow.invalid && !follow.replay) {
      const s = this.session(npc, context);
      s.transcript.push({
        speaker: "NPC",
        name: e.name(npc.id),
        text: follow.playerLine,
      });
      for (const response of follow.responses || []) {
        if (
          !e.person(response.speakerId)?.isPlayer &&
          response.stance !== "pending"
        )
          s.transcript.push({
            speaker: "NPC",
            name: e.name(response.speakerId),
            text: response.line,
          });
      }
      this.reservation.checkpoint.semanticTranscript = JSON.parse(
        JSON.stringify(s.transcript),
      );
    }
    this.show(npc, context);
  }
  append(npc, context, result) {
    if (result.replay) return;
    const s = this.session(npc, context);
    s.addYou(result.playerLine);
    for (const r of result.responses)
      s.transcript.push({
        speaker: "NPC",
        name: this.engine.name(r.speakerId),
        text: r.line,
      });
    if (this.reservation?.checkpoint)
      this.reservation.checkpoint.semanticTranscript = JSON.parse(
        JSON.stringify(s.transcript),
      );
    eventManager.publish("camp:readUpdated");
  }
  respondToTask(npc, context, task, accept) {
    if (this.engine.tasks.respond(task.id, this.gm.player.id, accept)) {
      const s = this.session(npc, context);
      s.addYou(
        accept === "hedge"
          ? "Maybe. I can’t promise."
          : accept
            ? "I’ll do it."
            : "I cannot take that on.",
      );
      this.engine.memory.recordConversationHistory({
        id: `${task.id}:response`,
        participantIds: [this.gm.player.id, npc.id],
        speakerId: this.gm.player.id,
        subjectId: task.targetId,
        type:
          accept === "hedge"
            ? "task_hedged"
            : accept
              ? "task_accepted"
              : "task_refused",
        topic: "delegation",
        line: accept === "hedge" ? "hedged" : accept ? "accepted" : "refused",
        day: this.gm.day,
        campTime: this.gm.dayTimer,
        location: this.gm.player.location,
      });
      this.reservation.checkpoint.semanticTranscript = JSON.parse(
        JSON.stringify(s.transcript),
      );
    }
    this.show(npc, context);
  }
  respondToDeal(npc, context, deal, accept) {
    const system = this.gm.systems.dealSystem;
    if (deal.status !== "PROPOSED") return this.show(npc, context);
    (accept ? system.acceptDeal : system.refuseDeal).call(
      system,
      deal.id,
      this.gm.player.id,
      "conversation",
    );
    const s = this.session(npc, context);
    s.addYou(accept ? "I agree to that deal." : "I am not agreeing to that.");
    this.engine.memory.recordConversationHistory({
      id: `${deal.id}:player-response`,
      participantIds: [this.gm.player.id, npc.id],
      speakerId: this.gm.player.id,
      subjectId: npc.id,
      type: accept ? "deal_accepted" : "deal_refused",
      topic: "deal",
      day: this.gm.day,
      campTime: this.gm.dayTimer,
    });
    this.reservation.checkpoint.semanticTranscript = JSON.parse(
      JSON.stringify(s.transcript),
    );
    this.show(npc, context);
  }
  startNpc(npc, context = {}) {
    const e = this.engine,
      player = this.gm.player;
    this.session(npc, context);
    const activity = {
      id: this.reservation.activityId,
      agenda: context.agenda,
      taskId: context.agenda?.taskId,
    };
    if (context.agenda?.allianceMotive) {
      const motive = context.agenda.allianceMotive,
        model = this.gm.systems.strategyPhaseSystem.reasoning,
        offer = model.choice(`${activity.id}:alliance-motive`, (random) =>
          this.gm.systems.allianceSystem.resolveNpcMotive(
            npc.id,
            player.id,
            motive,
            activity.id,
            random,
          ),
        );
      return this.host._renderAllianceConversation({
        player,
        npc,
        context: {
          ...context,
          allianceId: offer?.allianceId || motive.allianceId,
          allianceProposalId: offer?.recruitmentId ? null : offer?.id,
          allianceRecruitmentId: offer?.recruitmentId,
        },
      });
    }
    let result;
    const initiative =
      e.initiative.intentions.find((i) => i.id === context.initiativeId) ||
      e.initiative.active(npc.id);
    if (initiative?.type && !context.agenda)
      result = e.resolve(
        e.action(initiative.type, {
          ...initiative.fields,
          actionId: `${activity.id}:opening`,
          speakerId: npc.id,
          listenerIds: [player.id],
        }),
      );
    else if (activity.taskId) result = e.tasks.execute(npc, player, activity);
    else if (context.agenda?.objectiveId)
      result = e.objectives.execute(npc, player, {
        ...activity,
        objectiveId: context.agenda.objectiveId,
      });
    else if (context.agenda && e.model) {
      const agenda = context.agenda,
        types = {
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
      const claim = e
        .knowledge(npc.id)
        .find((k) => (agenda.knownEvidence || []).includes(k.id));
      let type = types[agenda.purpose] || "vote_read";
      if (["share", "verify"].includes(type) && !claim) type = "vote_read";
      const subjectId =
        type === "backup"
          ? e.model.alternateTarget(npc.id, [
              npc.id,
              player.id,
              agenda.primarySubject,
            ])
          : agenda.primarySubject;
      result = e.resolve(
        e.action(type, {
          actionId: `${activity.id}:opening`,
          speakerId: npc.id,
          listenerIds: [player.id],
          subjectId,
          claimId: claim?.id,
          truthMode:
            agenda.cover ||
            ["decoy", "reassurance_lie"].includes(agenda.messageMode)
              ? "fabrication"
              : "truth",
        }),
      );
    } else {
      const incident = e
          .events(npc.id)
          .find(
            (x) => same(x.subjectId, player.id) || same(x.speakerId, player.id),
          ),
        claim = e
          .knowledge(npc.id)
          .filter((k) => k.kind === "claim" && !same(k.subjectId, player.id))
          .at(-1),
        intent = context.intent || context.socialType,
        mapping = {
          warning: "warn",
          targeting: "pitch",
          vote_pitch: "ask_vote",
          alliance_pitch: "alliance",
          allianceInvite: "alliance",
          alliance_maintenance: "loyalty",
          confrontation: incident ? "confront" : "loyalty",
          apology: incident ? "apologize" : "check_in",
          gossip: claim ? "share" : "vibe",
          informationPlay: claim ? "share" : "vibe",
          dealMaking: "deal",
          idolTalk: "idol_ask",
          challengeDebrief: e
            .events(npc.id)
            .some((k) => k.topic === "challenge_result")
            ? "event"
            : "check_in",
          reassurance: "reassure",
          personal: "personal",
          bonding: "check_in",
        };
      let type = mapping[intent] || "check_in";
      if (["warn", "pitch", "ask_vote"].includes(type) && !context.targetId)
        type = "loyalty";
      result = e.resolve(
        e.action(type, {
          actionId: `activity:${activity.id}:opening`,
          speakerId: npc.id,
          listenerIds: [player.id],
          subjectId: context.targetId || null,
          eventId:
            incident?.id ||
            e.events(npc.id).find((k) => k.topic === "challenge_result")?.id,
          claimId: claim?.id,
        }),
      );
    }
    if (result && !result.invalid && !result.replay) {
      const s = this.session(npc, context);
      s.transcript.push({
        speaker: "NPC",
        name: npc.firstName,
        text: result.playerLine,
      });
      this.reservation.checkpoint.semanticTranscript = JSON.parse(
        JSON.stringify(s.transcript),
      );
    }
    e.initiative.dialogueOpening(npc, result, context);
    return this.show(npc, context);
  }
  render(npc, session, buttons, back, narration) {
    this.host._renderMenu(
      npc,
      this.host._buildTranscriptBody({ session, narration }),
      buttons,
      { onBack: back, showEnd: true },
    );
    if (typeof document !== "undefined") {
      const overlay = this.host.activeOverlay;
      overlay?.classList.add("semantic-conversation");
      overlay?.setAttribute("data-conversation-menu", "semantic");
      const header = overlay?.querySelector(".scramble-speakers"),
        center = overlay?.querySelector(".conversation-center");
      if (header && center)
        center.style.setProperty(
          "--scramble-speaker-height",
          `${header.getBoundingClientRect().height}px`,
        );
    }
  }
}
