import { generateId } from "../utils/CommonUtils.js";
import eventManager, { GameEvents } from "../core/EventManager.js";
import {
  eligibleCampMember,
  isCampPhysicallyPresent,
} from "../locations/CampPresence.js";
import { ownedCampKnowledge } from "./CampKnowledge.js";
import { getCampBehaviorProfile } from "./CampBehaviorProfile.js";
const same = (a, b) => a != null && b != null && String(a) === String(b);
const bounded = (n, fallback = 0.5) =>
  Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : fallback;
const unique = (ids) =>
  ids.filter((id, i, a) => id != null && a.findIndex((x) => same(x, id)) === i);
const copy = (x) => JSON.parse(JSON.stringify(x));
const defaults = {
  core: [0.72, 0.65, 0.78],
  final_two: [0.82, 0.8, 0.85],
  final_three: [0.8, 0.76, 0.83],
  voting_bloc: [0.58, 0.5, 0.48],
  temporary: [0.4, 0.35, 0.35],
};
const aliases = {
  core_alliance: "core",
  final2: "final_two",
  final3: "final_three",
  votingBloc: "voting_bloc",
  vote_together: "voting_bloc",
};

// Objective coalitions organize individual relationships. Votes belong to #350;
// statements and social beliefs belong to the existing owner-scoped SocialMemory.
export default class AllianceSystem {
  constructor(gm) {
    this.gameManager = gm;
    this.reset();
  }
  get gm() {
    return this.gameManager;
  }
  get memory() {
    return this.gm?.systems?.socialMemorySystem;
  }
  get reasoning() {
    return this.gm?.systems?.strategyPhaseSystem?.reasoning;
  }
  get day() {
    return this.gm?.getCurrentDay?.() ?? this.gm?.day ?? 1;
  }
  get time() {
    return this.gm?.dayTimer ?? null;
  }
  reset() {
    this.alliances = [];
    this.commitments = new Map();
    this.proposals = [];
    this.pendingRecruitment = [];
    this.pendingExclusion = [];
    this.processed = [];
    this.reactions = [];
    this.metrics = {};
    this.sequence = 0;
  }
  initialize() {
    this.alliances = this.alliances.map((a) => this.normalize(a));
    if (!this.initialized) {
      this.initialized = true;
      eventManager.subscribe(GameEvents.TRIBES_CREATED, () =>
        this.ensureNpcCommitments(),
      );
    }
  }
  nextId() {
    return `alliance:${this.day}:${++this.sequence}`;
  }
  count(key) {
    this.metrics[key] = (this.metrics[key] || 0) + 1;
  }
  person(id) {
    return (
      this.gm?.survivors?.find((p) => same(p.id, id)) ||
      this.gm?.tribes
        ?.flatMap((t) => t.members || [])
        .find((p) => same(p.id, id))
    );
  }
  living(id) {
    return eligibleCampMember(this.gm, this.person(id));
  }
  tribeOf(id) {
    return (
      this.gm?.tribes?.find((t) =>
        (t.members || []).some((p) => same(p.id ?? p, id)),
      )?.id ?? this.person(id)?.tribeId
    );
  }
  location(id) {
    const p = this.person(id);
    return p?.isPlayer
      ? p.location
      : this.gm?.systems?.npcLocationSystem?.getLocation?.(id);
  }
  together(a, b) {
    return (
      this.living(a) &&
      this.living(b) &&
      same(this.tribeOf(a), this.tribeOf(b)) &&
      isCampPhysicallyPresent(
        this.person(a),
        this.gm.systems.npcLocationSystem,
        this.location(a),
        this.gm,
      ) &&
      isCampPhysicallyPresent(
        this.person(b),
        this.gm.systems.npcLocationSystem,
        this.location(a),
        this.gm,
      )
    );
  }
  relationship(a, b) {
    const r = this.gm?.systems?.relationshipSystem?.getRelationship?.(a, b);
    return Number.isFinite(r) ? r : (r?.value ?? 50);
  }
  trust(a, b) {
    return (
      this.gm?.getTrust?.(a, b) ??
      this.gm?.systems?.trustSystem?.getTrust?.(a, b) ??
      50
    );
  }
  type(type) {
    return defaults[type] ? type : aliases[type] || "core";
  }
  memberState(raw = {}, type = "core", sincerity = "real", roster = []) {
    const [commitment, priority, loyalty] = defaults[this.type(type)],
      fake = ["fake", "cover"].includes(raw.sincerity ?? sincerity);
    const s = {
      status: "active",
      sincerity,
      commitment,
      priority,
      loyalty,
      willingnessToDefect: type === "temporary" ? 0.65 : 0.25,
      influence: 0.5,
      believesAllianceActive: true,
      perceivedHealth: 0.6,
      joinedDay: this.day,
      lastContactDay: this.day,
      lastPlanSupport: null,
      migrationRoster: [...roster],
      ...raw,
    };
    if (fake)
      for (const key of ["commitment", "priority", "loyalty"])
        if (raw[key] == null) s[key] = 0.18;
    for (const key of [
      "commitment",
      "priority",
      "loyalty",
      "willingnessToDefect",
      "influence",
      "perceivedHealth",
    ])
      s[key] = bounded(s[key]);
    return s;
  }
  normalize(raw = {}) {
    const roster = unique(raw.memberIds || raw.members || []),
      type = this.type(raw.type);
    const a = {
      ...raw,
      id: raw.id || `alliance_${generateId()}`,
      name: raw.name || "Working relationship",
      type,
      createdDay: raw.createdDay ?? this.day,
      tribeId: raw.tribeId ?? null,
      leaderId: raw.leaderId ?? roster[0] ?? null,
      active: raw.active !== false,
      lifecycle:
        raw.lifecycle || (raw.active === false ? "disbanded" : "active"),
      secrecy: raw.secrecy || "private",
      memberIds: roster,
      memberStates: {},
      sincerityMap: {},
      cohesion: Number.isFinite(raw.cohesion)
        ? Math.max(0, Math.min(100, raw.cohesion))
        : this.computeCohesion(roster),
      history: copy(raw.history || []),
      roundPlan: copy(
        raw.roundPlan || {
          day: this.day,
          primaryTargetId: raw.targetId ?? null,
          status: raw.targetId != null ? "legacy_unconfirmed" : "unresolved",
          participantCommitments: {},
        },
      ),
      targetId: raw.targetId ?? null,
      linkedDealIds: [...(raw.linkedDealIds || [])],
      privateLabels: { ...(raw.privateLabels || {}) },
      notes: raw.notes || "",
    };
    for (const id of unique([
      ...roster,
      ...Object.keys(raw.memberStates || {}),
    ])) {
      const canonical = this.person(id)?.id ?? id;
      const s = this.memberState(
        raw.memberStates?.[id],
        type,
        raw.sincerityMap?.[id] === "fake" ? "fake" : "real",
        roster,
      );
      if (!a.active && !raw.memberStates) s.believesAllianceActive = false;
      if (this.person(id) && !this.living(id)) {
        if (s.status !== "eliminated") s.previousStatus = s.status;
        s.status = "eliminated";
        s.priority = 0;
      }
      a.memberStates[canonical] = s;
    }
    this.project(a);
    return a;
  }
  project(a) {
    a.memberIds = Object.entries(a.memberStates)
      .filter(([, s]) => s.status === "active")
      .map(
        ([id]) =>
          this.person(id)?.id ??
          (Number.isFinite(Number(id)) ? Number(id) : id),
      );
    a.sincerityMap = Object.fromEntries(
      Object.entries(a.memberStates).map(([id, s]) => [
        id,
        ["fake", "cover"].includes(s.sincerity) ? "fake" : "real",
      ]),
    );
    a.active = !["disbanded", "fractured"].includes(a.lifecycle);
    if (!a.memberIds.some((id) => same(id, a.leaderId)))
      a.leaderId = this.influential(a, a.memberIds)[0] ?? null;
  }
  event(a, type, detail = {}, knownTo = []) {
    const e = {
      id: this.nextId(),
      type,
      day: this.day,
      campTime: this.time,
      ...detail,
      knownTo: unique(knownTo),
    };
    a.history.push(e);
    a.history = a.history.slice(-80);
    return e;
  }
  stability(a, delta) {
    a.cohesion = Math.max(0, Math.min(100, a.cohesion + delta));
  }
  computeCohesion(value) {
    const ids = Array.isArray(value) ? value : value?.memberIds || [];
    let sum = 0,
      pairs = 0;
    for (let i = 0; i < ids.length; i++)
      for (let j = i + 1; j < ids.length; j++) {
        sum += this.relationship(ids[i], ids[j]);
        pairs++;
      }
    return pairs ? Math.max(0, Math.min(100, sum / pairs)) : 50;
  }
  // Compatibility/import primitives: social entry points below require consent/contact.
  createAlliance(options = {}) {
    const ids = unique(options.memberIds || []),
      type = this.type(options.type);
    if (
      ids.length < 2 ||
      (type === "final_two" && ids.length !== 2) ||
      (type === "final_three" && ids.length !== 3)
    )
      return null;
    const existing = this.alliances.find(
      (a) =>
        a.active &&
        a.type === type &&
        a.memberIds.length === ids.length &&
        ids.every((id) => a.memberIds.some((x) => same(x, id))),
    );
    if (existing) return existing;
    const a = this.normalize({ ...options, type, memberIds: ids });
    this.alliances.push(a);
    this.count("alliancesFormed");
    if (
      ids.some((id) =>
        this.alliances.some(
          (b) => b.id !== a.id && b.memberIds.some((x) => same(x, id)),
        ),
      )
    )
      this.count("overlappingAlliances");
    this.event(a, "formed", {}, ids);
    this.recordRoster(a, ids[0], ids, ids);
    eventManager.publish(GameEvents.ALLIANCE_CREATED, { alliance: a });
    this.ensureNpcCommitments();
    return a;
  }
  getAlliance(id) {
    return this.alliances.find((a) => same(a.id, id)) || null;
  }
  getAllianceById(id) {
    return this.getAlliance(id);
  }
  getAlliances({ includeInactive = false } = {}) {
    return this.alliances.filter((a) => includeInactive || a.active);
  }
  getAllAlliances() {
    return [...this.alliances];
  }
  getAlliancesForSurvivor(id) {
    return this.alliances.filter(
      (a) => a.memberStates[id]?.believesAllianceActive,
    );
  }
  getSharedAlliances(a, b) {
    return this.getAlliances().filter(
      (x) =>
        x.memberIds.some((id) => same(id, a)) &&
        x.memberIds.some((id) => same(id, b)),
    );
  }
  areAllied(a, b) {
    return this.getSharedAlliances(a, b).length > 0;
  }
  getMemberState(memberId, allianceId) {
    return this.getAlliance(allianceId)?.memberStates[memberId] || null;
  }
  getAlliancePriorityForMember(memberId, allianceId) {
    return this.getMemberState(memberId, allianceId)?.priority ?? 0;
  }
  getRankedAlliancesForMember(id) {
    return this.getAlliancesForSurvivor(id).sort(
      (a, b) =>
        this.getAlliancePriorityForMember(id, b.id) -
          this.getAlliancePriorityForMember(id, a.id) ||
        String(a.id).localeCompare(String(b.id)),
    );
  }
  getCommittedAllianceId(id) {
    return this.getRankedAlliancesForMember(id)[0]?.id ?? null;
  }
  ensureNpcCommitments() {
    for (const p of this.gm?.survivors || []) {
      const id = this.getCommittedAllianceId(p.id);
      this.commitments.set(p.id, id);
      this.memory?.setCommittedAllianceId?.(p.id, id);
    }
  }
  commitToAlliance({ survivorId, allianceId }) {
    const s = this.getMemberState(survivorId, allianceId);
    if (!s?.believesAllianceActive) return { ok: false, reason: "not_member" };
    s.priority = bounded(s.priority + 0.08);
    this.ensureNpcCommitments();
    return { ok: true };
  }
  clearCommitment(id) {
    const s = this.getMemberState(id, this.getCommittedAllianceId(id));
    if (s) s.priority = bounded(s.priority - 0.1);
    this.commitments.delete(id);
  }
  updateAllianceName(id, name, ownerId = this.gm?.player?.id) {
    const a = this.getAlliance(id);
    if (a && ownerId != null && name.trim())
      a.privateLabels[ownerId] = name.trim().slice(0, 60);
    return a;
  }
  getAllianceDisplayName(id, ownerId = this.gm?.player?.id) {
    const a = this.getAlliance(id);
    return a?.privateLabels[ownerId] || a?.name || "Working relationship";
  }
  addMember(id, memberId, sincerity = "real", knownTo = []) {
    const a = this.getAlliance(id);
    if (
      !a ||
      a.type === "final_two" ||
      (a.type === "final_three" && a.memberIds.length >= 3) ||
      !this.living(memberId)
    )
      return null;
    if (a.memberStates[memberId]?.status === "active") return a;
    a.memberStates[memberId] = this.memberState({}, a.type, sincerity, []);
    this.stability(a, -2);
    this.project(a);
    this.event(a, "joined", { memberId }, knownTo);
    return a;
  }
  removeMember(id, memberId, reason = "left", knownTo = [memberId]) {
    const a = this.getAlliance(id),
      s = a?.memberStates[memberId];
    if (!s) return a;
    s.previousStatus = s.status;
    s.status = reason === "eliminated" ? "eliminated" : "left";
    s.priority = 0;
    s.believesAllianceActive = false;
    this.stability(a, -5);
    this.event(a, "departed", { memberId, reason }, knownTo);
    this.project(a);
    if (a.memberIds.length < 2) a.lifecycle = "dormant";
    this.project(a);
    return a;
  }
  disbandAlliance(id, reason = "disbanded", knownTo = []) {
    const a = this.getAlliance(id);
    if (!a) return null;
    a.lifecycle = "disbanded";
    for (const owner of knownTo)
      if (a.memberStates[owner])
        a.memberStates[owner].believesAllianceActive = false;
    this.event(a, "disbanded", { reason }, knownTo);
    this.project(a);
    return a;
  }
  dissolveAlliance(id) {
    return this.disbandAlliance(id, "dissolved");
  }
  addMemberToAlliance(id, memberId) {
    return this.addMember(id, memberId);
  }
  removeMemberFromAlliance(id, memberId) {
    return this.removeMember(id, memberId);
  }
  claims(ownerId) {
    return this.memory?.getCampClaims?.(ownerId) || [];
  }
  recordClaim({
    id = this.nextId(),
    speakerId,
    listenerIds = [],
    subjectId = speakerId,
    topic = "alliance",
    stance = "mentioned",
    ...detail
  }) {
    return this.memory?.recordCampClaim?.({
      id,
      speakerId,
      listenerIds,
      subjectId,
      topic,
      stance,
      origin: "participant",
      day: this.day,
      campTime: this.time,
      confidence: 0.8,
      salience: "high",
      ...detail,
    });
  }
  recordRoster(a, speakerId, listenerIds, roster) {
    this.recordClaim({
      speakerId,
      listenerIds: listenerIds.filter((id) => !same(id, speakerId)),
      subjectId: speakerId,
      topic: "alliance_membership",
      allianceId: a.id,
      memberIds: unique(roster),
      stance: "yes",
    });
  }
  knownRoster(ownerId, allianceId) {
    const a = this.getAlliance(allianceId);
    if (!a) return [];
    const claims = this.claims(ownerId),
      index = claims.findLastIndex(
        (e) =>
          same(e.allianceId, allianceId) &&
          ["alliance_membership", "alliance_disclosure"].includes(e.topic) &&
          e.stance !== "denied" &&
          !e.challenged,
      );
    let roster = unique(
      claims[index]?.memberIds ||
        a.memberStates[ownerId]?.migrationRoster ||
        [],
    );
    // Later communicated departure/exclusion changes this owner's relationship
    // claim. Uninformed owners retain it; a new negotiated roster can restore it.
    for (const evidence of claims.slice(index + 1))
      if (
        same(evidence.allianceId, allianceId) &&
        !evidence.challenged &&
        evidence.confidence >=
          (evidence.topic === "alliance_departure" &&
          evidence.origin === "direct_statement" &&
          same(evidence.speakerId, evidence.subjectId)
            ? 0.3
            : 0.55) &&
        ((evidence.topic === "alliance_departure" &&
          evidence.stance === "left") ||
          (evidence.topic === "alliance_exclusion" &&
            evidence.stance === "yes"))
      )
        roster = roster.filter((id) => !same(id, evidence.subjectId));
    return roster;
  }

  getAllianceAffinity(fromId, toId) {
    if (same(fromId, toId) || !this.living(toId)) return 0;
    let strength = 0;
    for (const a of this.getAlliancesForSurvivor(fromId)) {
      const s = a.memberStates[fromId];
      if (!this.knownRoster(fromId, a.id).some((id) => same(id, toId)))
        continue;
      const sincerity =
        { real: 1, strategic: 0.55, cover: 0.06, fake: 0.035 }[s.sincerity] ??
        0.65;
      const value = bounded(
        sincerity *
          (s.commitment * 0.35 + s.priority * 0.4 + s.loyalty * 0.25) *
          (1 - s.willingnessToDefect * 0.3),
      );
      strength = 1 - (1 - strength) * (1 - value);
    }
    return bounded(strength, 0);
  }
  getEffectiveAllianceStrength(a, b) {
    return this.getAllianceAffinity(a, b);
  }
  getKnownAlliances(ownerId) {
    return this.getAlliancesForSurvivor(ownerId).map((a) => {
      const s = a.memberStates[ownerId],
        ids = this.knownRoster(ownerId, a.id),
        live = ids.filter((id) => this.living(id)),
        local = live.filter((id) =>
          same(this.tribeOf(ownerId), this.tribeOf(id)),
        );
      const evidence = this.claims(ownerId).filter((e) =>
        same(e.allianceId, a.id),
      );
      const plan = evidence
        .filter((e) => e.topic === "alliance_plan" && e.stance !== "denied")
        .at(-1);
      const read =
        live.length < 2
          ? "Ended"
          : local.length < 2
            ? "Dormant"
            : s.perceivedHealth < 0.3
              ? "Strained"
              : s.perceivedHealth < 0.5
                ? "Uncertain"
                : s.perceivedHealth > 0.8
                  ? "Solid"
                  : "Working";
      const recent = a.history
        .filter((e) => e.knownTo?.some((id) => same(id, ownerId)))
        .slice(-3)
        .map(
          (e) =>
            ({
              formed: "We agreed to work together.",
              joined: "A member joined through conversation.",
              recruitment: "We agreed to approach another member.",
              eliminated: "An alliance member left the game.",
              meeting: "We discussed the vote.",
              concern: "An issue is unresolved.",
              departed: "A member stepped away.",
            })[e.type] || "A recent conversation changed your read.",
        );
      return {
        id: a.id,
        name: this.getAllianceDisplayName(a.id, ownerId),
        type: a.type,
        secrecy: a.secrecy,
        memberIds: ids,
        read,
        lastDiscussedTargetId: plan?.subjectId ?? null,
        recent,
        available: local.length >= 2,
      };
    });
  }
  disclose({
    speakerId,
    listenerId,
    allianceId,
    deny = false,
    claimedMemberIds = null,
  }) {
    if (!this.together(speakerId, listenerId)) return null;
    const roster = claimedMemberIds || this.knownRoster(speakerId, allianceId);
    return this.recordClaim({
      speakerId,
      listenerIds: [listenerId],
      subjectId: speakerId,
      topic: "alliance_disclosure",
      allianceId,
      memberIds: roster,
      stance: deny ? "denied" : "yes",
      ...(!deny && !claimedMemberIds ? {} : { truthfulness: false }),
    });
  }
  inferAlliances(ownerId) {
    const groups = new Map();
    for (const e of this.memory?.getCampObservations?.(ownerId) || [])
      if (e.type === "seen_together" && e.confidence >= 0.2) {
        const ids = unique([e.actorId, ...(e.participantIds || [])]).filter(
          (id) => !same(id, ownerId),
        );
        if (ids.length < 2) continue;
        const key = ids.map(String).sort().join("|"),
          g = groups.get(key) || { memberIds: ids, evidenceIds: [] };
        if (!g.evidenceIds.includes(e.id)) g.evidenceIds.push(e.id);
        groups.set(key, g);
      }
    return [...groups.values()]
      .filter((g) => g.evidenceIds.length >= 2)
      .map((g) => ({
        ...g,
        confidence: Math.min(0.4, 0.15 + g.evidenceIds.length * 0.05),
        provenance: "inference",
      }));
  }
  evaluateAllianceOffer({
    proposerId,
    receiverId,
    type = "core",
    targetId = null,
    random = Math.random,
  }) {
    const profile = getCampBehaviorProfile(this.person(receiverId)),
      rel = this.relationship(proposerId, receiverId) / 100,
      trust = this.trust(receiverId, proposerId) / 100,
      state = this.reasoning?.state(receiverId),
      busy = this.getRankedAlliancesForMember(receiverId).filter(
        (a) => this.getAlliancePriorityForMember(receiverId, a.id) > 0.7,
      ).length;
    const score = bounded(
      0.12 +
        rel * 0.36 +
        trust * 0.28 +
        (targetId && same(state?.intendedVoteId, targetId) ? 0.12 : 0) +
        (state?.safetyBelief < 0.4 ? 0.12 : 0) +
        (type === "voting_bloc" ? 0.08 : 0) -
        busy * 0.05 -
        (type.startsWith("final_") && rel < 0.65 ? 0.1 : 0),
    );
    const roll = random(),
      accepted = roll < score,
      outcome = accepted
        ? "accept"
        : roll < Math.min(0.95, score + 0.18)
          ? "hedge"
          : "decline";
    const fakeChance =
      (1 - profile.honesty) * 0.4 +
      (1 - trust) * 0.35 +
      (same(state?.intendedVoteId, proposerId) ? 0.25 : 0);
    return {
      accepted,
      outcome,
      sincerity: accepted && random() < fakeChance ? "fake" : "real",
      score: Math.round(score * 100),
      reasons: [accepted ? "accepted" : outcome],
    };
  }
  canForm(a, b, type) {
    return (
      this.together(a, b) &&
      this.getAlliancesForSurvivor(a).length < 5 &&
      this.getAlliancesForSurvivor(b).length < 5 &&
      !this.getSharedAlliances(a, b).some((x) => x.type === this.type(type))
    );
  }
  propose({
    id = this.nextId(),
    proposerId,
    receiverId,
    type = "core",
    secrecy = "private",
    targetId = null,
    sincerity = "real",
  }) {
    const previous = this.proposals.find((p) => p.id === id);
    if (previous) return previous;
    if (!this.canForm(proposerId, receiverId, type)) return null;
    const p = {
      id,
      proposerId,
      receiverId,
      type: this.type(type),
      secrecy,
      targetId,
      proposerSincerity: sincerity,
      status: "pending",
      day: this.day,
      campTime: this.time,
    };
    this.proposals.push(p);
    this.proposals = this.proposals.slice(-80);
    this.count("proposals");
    this.recordClaim({
      id: `${id}:offer`,
      speakerId: proposerId,
      listenerIds: [receiverId],
      topic: "alliance_proposal",
      stance: "offered",
      allianceId: id,
      memberIds: [proposerId, receiverId],
    });
    return p;
  }
  respond(proposalId, { choice = "evaluate", random = Math.random } = {}) {
    const p = this.proposals.find((p) => p.id === proposalId);
    if (!p || !this.together(p.proposerId, p.receiverId)) return null;
    if (p.status !== "pending") return p;
    const result =
      choice === "evaluate"
        ? this.evaluateAllianceOffer({ ...p, random })
        : { accepted: choice === "accept", outcome: choice, sincerity: "real" };
    p.status = result.accepted ? "accepted" : result.outcome;
    p.receiverSincerity = result.sincerity;
    this.recordClaim({
      id: `p:${p.id}:response`,
      speakerId: p.receiverId,
      listenerIds: [p.proposerId],
      topic: "alliance_response",
      allianceId: p.id,
      stance: p.status,
    });
    if (result.accepted) {
      const a = this.createAlliance({
        id: `${p.id}:accepted`,
        memberIds: [p.proposerId, p.receiverId],
        type: p.type,
        secrecy: p.secrecy,
        sincerityMap: {
          [p.proposerId]: p.proposerSincerity,
          [p.receiverId]: result.sincerity,
        },
      });
      p.allianceId = a.id;
      if ([p.proposerSincerity, result.sincerity].includes("fake"))
        this.count("fakeAllianceAcceptance");
      this.linkEndgame(a);
    }
    return p;
  }
  formGroup({
    id = this.nextId(),
    proposerId,
    participantIds,
    type = "core",
    random = Math.random,
  }) {
    const others = unique(participantIds).filter((x) => !same(x, proposerId));
    if (!others.length || others.some((x) => !this.together(proposerId, x)))
      return null;
    const accepted = [proposerId],
      sincerityMap = {};
    for (const memberId of others) {
      const r = this.evaluateAllianceOffer({
        proposerId,
        receiverId: memberId,
        type,
        random,
      });
      this.recordClaim({
        speakerId: memberId,
        listenerIds: [proposerId],
        topic: "alliance_response",
        stance: r.outcome,
      });
      if (r.accepted) {
        accepted.push(memberId);
        sincerityMap[memberId] = r.sincerity;
      }
    }
    return this.createAlliance({ id, type, memberIds: accepted, sincerityMap });
  }
  linkEndgame(a) {
    if (!a || !["final_two", "final_three"].includes(a.type)) return;
    const ds = this.gm?.systems?.dealSystem;
    if (!ds) return;
    for (let i = 0; i < a.memberIds.length; i++)
      for (let j = i + 1; j < a.memberIds.length; j++) {
        const d = ds.createDeal({
          id: `${a.id}:deal:${i}:${j}`,
          type: a.type === "final_two" ? "FINAL_TWO" : "FINAL_THREE",
          parties: [a.memberIds[i], a.memberIds[j]],
          terms: { allianceId: a.id },
          stakes: "major",
        });
        if (d?.status === "PROPOSED") ds.acceptDeal(d.id, a.memberIds[j]);
        if (d && !a.linkedDealIds.includes(d.id)) a.linkedDealIds.push(d.id);
      }
  }
  proposeRecruitment({
    allianceId,
    proposerId,
    candidateId,
    participantIds = [proposerId],
    approachById = proposerId,
  }) {
    const a = this.getAlliance(allianceId);
    if (
      !a?.active ||
      a.memberStates[proposerId]?.status !== "active" ||
      ["final_two", "final_three"].includes(a.type) ||
      a.memberIds.some((id) => same(id, candidateId)) ||
      !this.living(candidateId)
    )
      return null;
    const existing = this.pendingRecruitment.find(
      (p) =>
        p.allianceId === allianceId &&
        same(p.candidateId, candidateId) &&
        p.status === "pending",
    );
    if (existing) return existing;
    const present = unique(participantIds).filter(
        (id) => same(id, proposerId) || this.together(proposerId, id),
      ),
      objections = present.filter(
        (id) =>
          !same(id, proposerId) &&
          (this.relationship(id, candidateId) < 35 ||
            this.trust(id, candidateId) < 30),
      );
    const p = {
      id: this.nextId(),
      allianceId,
      proposerId,
      candidateId,
      approachById,
      participantIds: present,
      objections,
      status: objections.length ? "disputed" : "pending",
      day: this.day,
    };
    this.pendingRecruitment.push(p);
    this.count("recruitmentAttempts");
    this.event(a, "recruitment", { candidateId }, present);
    return p;
  }
  respondRecruitment(id, { choice = "evaluate", random = Math.random } = {}) {
    const p = this.pendingRecruitment.find((p) => p.id === id),
      a = p && this.getAlliance(p.allianceId);
    if (
      !p ||
      p.status !== "pending" ||
      !this.together(p.approachById, p.candidateId)
    )
      return null;
    const r =
      choice === "evaluate"
        ? this.evaluateAllianceOffer({
            proposerId: p.approachById,
            receiverId: p.candidateId,
            type: a.type,
            random,
          })
        : { accepted: choice === "accept", outcome: choice, sincerity: "real" };
    p.status = r.accepted ? "accepted" : r.outcome;
    this.recordClaim({
      id: `${p.id}:response`,
      speakerId: p.candidateId,
      listenerIds: [p.approachById],
      topic: "alliance_response",
      allianceId: a.id,
      stance: p.status,
    });
    if (r.accepted) {
      this.addMember(a.id, p.candidateId, r.sincerity, [
        p.candidateId,
        p.approachById,
      ]);
      this.recordRoster(
        a,
        p.approachById,
        [p.candidateId],
        unique([...this.knownRoster(p.approachById, a.id), p.candidateId]),
      );
    } else if (r.outcome === "decline") this.count("recruitmentRejected");
    return p;
  }
  exclude({ allianceId, proposerId, memberId, participantIds = [proposerId] }) {
    const a = this.getAlliance(allianceId),
      s = a?.memberStates[memberId],
      supporters = unique(participantIds).filter(
        (id) =>
          !same(id, memberId) &&
          a?.memberStates[id]?.status === "active" &&
          (same(id, proposerId) || this.together(proposerId, id)),
      );
    if (
      !s ||
      s.status !== "active" ||
      !supporters.some((id) => same(id, proposerId)) ||
      supporters.length < 2
    )
      return null;
    if (
      supporters
        .filter((id) => !same(id, proposerId))
        .some(
          (id) =>
            this.getAllianceAffinity(id, memberId) > 0.75 &&
            !same(this.reasoning?.state(id)?.intendedVoteId, memberId),
        )
    )
      return null;
    const p = {
      id: this.nextId(),
      allianceId,
      memberId,
      participantIds: supporters,
      status: "agreed",
      day: this.day,
    };
    this.pendingExclusion.push(p);
    s.status = "excluded";
    s.previousStatus = "active";
    this.stability(a, -4);
    a.lifecycle = "strained";
    this.project(a);
    this.event(a, "exclusion", { memberId }, supporters);
    for (const ownerId of supporters)
      this.recordRoster(
        a,
        ownerId,
        [],
        this.knownRoster(ownerId, a.id).filter((id) => !same(id, memberId)),
      );
    this.count("exclusions");
    this.recordClaim({
      speakerId: proposerId,
      listenerIds: supporters.filter((id) => !same(id, proposerId)),
      subjectId: memberId,
      topic: "alliance_exclusion",
      allianceId,
      stance: "yes",
    });
    return p;
  }
  distance(memberId, allianceId) {
    const s = this.getMemberState(memberId, allianceId);
    if (!s) return false;
    s.priority = bounded(s.priority - 0.2);
    s.commitment = bounded(s.commitment - 0.1);
    return true;
  }
  leave({ memberId, allianceId, listenerIds = [] }) {
    const a = this.getAlliance(allianceId),
      informed = listenerIds.filter((id) => this.together(memberId, id));
    if (!a) return false;
    if (!informed.length) return this.distance(memberId, allianceId);
    this.removeMember(allianceId, memberId, "left", [memberId, ...informed]);
    this.recordClaim({
      speakerId: memberId,
      listenerIds: informed,
      subjectId: memberId,
      topic: "alliance_departure",
      allianceId,
      stance: "left",
    });
    for (const id of informed) {
      const s = a.memberStates[id];
      if (s) {
        s.perceivedHealth = bounded(s.perceivedHealth - 0.12);
        this.gm.systems.trustSystem?.changeOwnedTrust?.(
          id,
          memberId,
          -3,
          "communicated departure",
        );
      }
    }
    return true;
  }
  recordContact(a, ids) {
    for (const id of ids) {
      const s = a.memberStates[id];
      if (!s || !this.living(id)) continue;
      s.lastContactDay = this.day;
      if (!["fake", "cover"].includes(s.sincerity)) {
        s.commitment = bounded(s.commitment + 0.01);
        s.priority = bounded(s.priority + 0.01);
      }
    }
    this.stability(a, 0.5);
  }
  recordPlanSupport(memberId, targetId, listenerIds) {
    for (const a of this.getAlliancesForSurvivor(memberId))
      if (listenerIds.some((id) => a.memberIds.some((x) => same(x, id)))) {
        const s = a.memberStates[memberId];
        s.lastPlanSupport = { day: this.day, targetId };
        s.priority = bounded(s.priority + 0.01);
        s.lastContactDay = this.day;
      }
  }
  recommit(memberId, allianceId, listenerId = null) {
    const a = this.getAlliance(allianceId),
      s = a?.memberStates[memberId];
    if (!s) return "I’m keeping my options open.";
    if (
      ["fake", "cover"].includes(s.sincerity) ||
      (listenerId != null &&
        !this.knownRoster(memberId, allianceId).some((id) =>
          same(id, listenerId),
        ))
    )
      return "I still want to work with you.";
    if (s.perceivedHealth < 0.4)
      return "After our last conversation, I’m not sure where we stand.";
    s.commitment = bounded(s.commitment + 0.025);
    s.priority = bounded(s.priority + 0.015);
    return s.commitment > 0.8
      ? "Absolutely. This matters to me."
      : a.type === "voting_bloc" || s.commitment < 0.6
        ? "I’m with you for tonight, but I’m keeping options open."
        : "I want to keep working together. Let’s agree on the actual vote.";
  }
  priorityAnswer(memberId, listenerId, random = Math.random) {
    const best = this.getRankedAlliancesForMember(memberId)[0];
    if (!best) return "I’m keeping my options open.";
    if (
      !this.knownRoster(listenerId, best.id).length ||
      (getCampBehaviorProfile(this.person(memberId)).honesty < 0.5 &&
        random() < 0.5)
    )
      return "I value what we have. I’m not going to rank every relationship.";
    return `The ${best.type.replaceAll("_", " ")} we discussed matters most to me right now.`;
  }
  concerns(ownerId, allianceId) {
    return ownedCampKnowledge(this.memory, ownerId, this.day)
      .filter(
        (e) =>
          (same(e.allianceId, allianceId) &&
            [
              "alliance_exclusion",
              "alliance_departure",
              "alliance_doubt",
              "vote_attribution",
              "alliance_plan",
            ].includes(e.topic)) ||
          (e.challenged &&
            this.knownRoster(ownerId, allianceId).some((id) =>
              same(id, e.speakerId),
            )),
      )
      .slice(-4);
  }
  raiseConcern({ ownerId, memberId, allianceId, evidenceId = null }) {
    if (!this.together(ownerId, memberId)) return null;
    const evidence =
      evidenceId &&
      ownedCampKnowledge(this.memory, ownerId, this.day).find(
        (e) => e.id === evidenceId,
      );
    if (evidenceId && !evidence) return null;
    const a = this.getAlliance(allianceId),
      s = a?.memberStates[memberId];
    if (!s) return null;
    this.event(a, "concern", { evidenceId }, [ownerId, memberId]);
    this.recordClaim({
      speakerId: ownerId,
      listenerIds: [memberId],
      subjectId: evidence?.subjectId || memberId,
      topic: "alliance_doubt",
      allianceId,
      evidenceIds: evidence ? [evidence.id] : [],
      stance: "question",
    });
    return ["fake", "cover"].includes(s.sincerity)
      ? "I still want us working together. What exactly did you hear?"
      : s.perceivedHealth < 0.4
        ? "There are things we need to clear up before I promise anything."
        : "Tell me what you noticed. We should compare what we actually know.";
  }
  influential(a, ids) {
    return [...ids].sort(
      (x, y) =>
        this.influence(a, y) - this.influence(a, x) ||
        String(x).localeCompare(String(y)),
    );
  }
  influence(a, id) {
    const s = a.memberStates[id];
    if (!s) return 0;
    const peers = a.memberIds.filter((x) => !same(x, id)),
      profile = getCampBehaviorProfile(this.person(id));
    return (
      s.influence * 0.4 +
      (profile.socialEnergy ?? 0.5) * 0.15 +
      (peers.reduce((n, p) => n + this.trust(p, id), 0) /
        Math.max(1, peers.length) /
        100) *
        0.3 +
      (s.lastPlanSupport?.day === this.day ? 0.15 : 0)
    );
  }
  localMembers(a, referenceId = this.gm?.player?.id) {
    return a.memberIds.filter(
      (id) =>
        this.living(id) && same(this.tribeOf(id), this.tribeOf(referenceId)),
    );
  }
  membersReunited(a) {
    const live = a.memberIds.filter((id) => this.living(id));
    return (
      live.length >= 2 &&
      live.every((id) => same(this.tribeOf(live[0]), this.tribeOf(id)))
    );
  }
  getMeetingNeed(allianceId) {
    const a = this.getAlliance(allianceId);
    if (!a?.active || this.localMembers(a).length < 2) return null;
    const ids = this.localMembers(a),
      minds = ids.map((id) => this.reasoning?.state(id)),
      targets = unique(minds.map((s) => s?.intendedVoteId).filter(Boolean)),
      danger = minds.some((s) => s?.safetyBelief < 0.45),
      missing =
        a.roundPlan?.day !== this.day ||
        ["unresolved", "legacy_unconfirmed"].includes(a.roundPlan?.status),
      recruit = this.pendingRecruitment.some(
        (p) => p.allianceId === a.id && p.status === "pending",
      );
    const reason = danger
      ? "member_danger"
      : targets.length > 1
        ? "disagreement"
        : recruit
          ? "recruitment"
          : missing
            ? "unresolved_vote"
            : a.lifecycle === "strained"
              ? "repair"
              : null;
    return reason
      ? {
          reason,
          urgency: bounded(
            0.4 + (danger ? 0.3 : 0) + (this.time <= 600 ? 0.2 : 0),
          ),
          memberIds: this.influential(a, ids),
        }
      : null;
  }
  chooseMeeting(memberId, meetings) {
    return (
      meetings
        .filter((m) => m.memberIds.some((id) => same(id, memberId)))
        .sort(
          (a, b) =>
            this.getAlliancePriorityForMember(memberId, b.allianceId) +
              (b.urgency || 0) * 0.35 -
              (this.getAlliancePriorityForMember(memberId, a.allianceId) +
                (a.urgency || 0) * 0.35) ||
            String(a.id).localeCompare(String(b.id)),
        )[0] || null
    );
  }
  captureRoundPlan(allianceId, participants, result, activityId) {
    const a = this.getAlliance(allianceId);
    if (!a) return null;
    const ids = participants.map((p) => p.id ?? p),
      target = result.targetId ?? result.primaryTargetId ?? null,
      commitments = { ...(result.participantCommitments || {}) };
    for (const p of result.positions || [])
      if (
        !commitments[p.id] &&
        same(p.publicTargetId ?? p.intendedVoteId, target)
      )
        commitments[p.id] = {
          targetId: target,
          status: result.outcome === "consensus" ? "committed" : "tentative",
        };
    const split = ids
      .map((id) => this.reasoning?.state(id)?.splitPlan)
      .find((p) => p?.assignments);
    if (split)
      for (const id of ids)
        if (
          same(
            this.reasoning.state(id).committedTargetId,
            split.assignments[id],
          )
        )
          commitments[id] = {
            targetId: split.assignments[id],
            status: "committed",
          };
    a.roundPlan = {
      day: this.day,
      primaryTargetId: target,
      backupTargetId:
        ids
          .map((id) => this.reasoning?.state(id)?.backup?.targetId)
          .find(Boolean) || null,
      splitPlanId: split?.id || null,
      status: result.outcome || "unresolved",
      participantCommitments: commitments,
      participantIds: ids,
      lastDiscussedAt: this.time,
      activityId,
    };
    a.targetId = target;
    this.event(a, "meeting", { outcome: a.roundPlan.status }, ids);
    this.count("meetings");
    if (result.outcome === "disagreement") {
      this.stability(a, -2);
      this.count("disagreements");
    } else this.stability(a, 1);
    if (target)
      this.recordClaim({
        speakerId: ids[0],
        listenerIds: ids.slice(1),
        subjectId: target,
        topic: "alliance_plan",
        allianceId,
        stance: result.outcome === "consensus" ? "yes" : "consider",
      });
    for (const id of ids)
      this.recordRoster(
        a,
        id,
        ids.filter((x) => !same(x, id)),
        unique([...this.knownRoster(id, a.id), ...ids]),
      );
    this.recordContact(a, ids);
    if (a.lifecycle === "dormant" && this.membersReunited(a)) {
      a.lifecycle = "active";
      this.count("reactivatedAlliances");
      if (this.gm.isMerged) this.count("mergeReunions");
    }
    return a.roundPlan;
  }
  resolveMeeting(allianceId, participants, activity, random) {
    const r = this.reasoning?.resolveMeeting(participants, activity, random);
    if (r) {
      this.captureRoundPlan(allianceId, participants, r, activity.id);
      const a = this.getAlliance(allianceId),
        target = r.targetId,
        ids = participants.map((p) => p.id);
      // A subgroup may deliberately cut out a member only after discussing that
      // member as its actual intended target. The absent member learns nothing.
      if (
        target != null &&
        a?.memberStates[target]?.status === "active" &&
        !ids.some((id) => same(id, target)) &&
        ids.length >= 2 &&
        ids.every((id) => same(this.reasoning.state(id).intendedVoteId, target))
      )
        this.exclude({
          allianceId,
          proposerId: ids[0],
          memberId: target,
          participantIds: ids,
        });
    }
    return r;
  }
  npcMotive(speakerId, listenerId) {
    const speaker = this.person(speakerId),
      listener = this.person(listenerId);
    if (
      !speaker ||
      !listener ||
      speaker.isPlayer ||
      !this.living(listenerId) ||
      this.time < 240
    )
      return null;
    const shared = this.getSharedAlliances(speakerId, listenerId),
      mind = this.reasoning?.state(speakerId),
      profile = getCampBehaviorProfile(speaker);
    for (const a of shared)
      if (
        a.lifecycle === "dormant" &&
        this.membersReunited(a) &&
        this.getAlliancePriorityForMember(speakerId, a.id) > 0.5
      )
        return { purpose: "alliance_reunion", allianceId: a.id };
    const repair = shared.find(
      (a) =>
        this.concerns(speakerId, a.id).length &&
        this.getAlliancePriorityForMember(speakerId, a.id) > 0.5 &&
        a.memberStates[speakerId].lastContactDay < this.day,
    );
    if (repair) return { purpose: "alliance_repair", allianceId: repair.id };
    const recruit = this.pendingRecruitment.find(
      (p) =>
        same(p.approachById, speakerId) &&
        same(p.candidateId, listenerId) &&
        p.status === "pending",
    );
    if (recruit)
      return {
        purpose: "alliance_recruitment",
        recruitmentId: recruit.id,
        allianceId: recruit.allianceId,
      };
    if (
      this.proposals.some(
        (p) =>
          same(p.proposerId, speakerId) &&
          same(p.receiverId, listenerId) &&
          this.day - p.day < 2,
      ) ||
      this.getAlliancesForSurvivor(speakerId).length >= 4 ||
      this.getAlliancesForSurvivor(listenerId).length >= 4
    )
      return null;
    const expandable = this.getRankedAlliancesForMember(speakerId).find(
      (a) =>
        a.active &&
        ["core", "voting_bloc", "temporary"].includes(a.type) &&
        a.memberIds.length <
          Math.ceil(
            (this.gm.tribes
              .find((t) => same(t.id, this.tribeOf(speakerId)))
              ?.members.filter((p) => this.living(p.id)).length || 7) / 2,
          ) +
            1 &&
        !a.memberStates[listenerId] &&
        this.getAlliancePriorityForMember(speakerId, a.id) > 0.5,
    );
    if (
      !shared.length &&
      expandable &&
      this.relationship(speakerId, listenerId) > 64 &&
      this.trust(speakerId, listenerId) > 55 &&
      (mind?.safetyBelief < 0.45 ||
        same(
          mind?.intendedVoteId,
          this.reasoning?.state(listenerId)?.intendedVoteId,
        ))
    )
      return { purpose: "alliance_expansion", allianceId: expandable.id };
    const rel = this.relationship(speakerId, listenerId),
      trust = this.trust(speakerId, listenerId),
      cover = same(mind?.intendedVoteId, listenerId) && profile.honesty < 0.5,
      type = cover
        ? "final_two"
        : this.gm.isMerged &&
            this.gm.survivors.filter((p) => this.living(p.id)).length <= 8 &&
            rel > 68
          ? "final_two"
          : shared.length
            ? "core"
            : mind?.safetyBelief < 0.45
              ? "voting_bloc"
              : "temporary";
    return (cover || (rel > 64 && trust > 55)) &&
      !shared.some((a) => a.type === type)
      ? {
          purpose: "alliance_offer",
          type,
          sincerity: cover ? "fake" : "real",
          targetId: mind?.intendedVoteId,
        }
      : null;
  }
  resolveNpcMotive(
    speakerId,
    listenerId,
    motive,
    activityId,
    random = Math.random,
  ) {
    if (!motive || !this.together(speakerId, listenerId)) return null;
    if (motive.purpose === "alliance_repair") {
      this.recordContact(this.getAlliance(motive.allianceId), [
        speakerId,
        listenerId,
      ]);
      return {
        status: "discussed",
        response: this.raiseConcern({
          ownerId: speakerId,
          memberId: listenerId,
          allianceId: motive.allianceId,
        }),
      };
    }
    if (motive.purpose === "alliance_expansion") {
      const p = this.proposeRecruitment({
        allianceId: motive.allianceId,
        proposerId: speakerId,
        candidateId: listenerId,
      });
      return (
        p &&
        (this.person(listenerId)?.isPlayer
          ? { ...p, status: "recruitment_pending", recruitmentId: p.id }
          : this.respondRecruitment(p.id, { random }))
      );
    }
    if (motive.purpose === "alliance_recruitment")
      return this.person(listenerId)?.isPlayer
        ? {
            status: "recruitment_pending",
            recruitmentId: motive.recruitmentId,
            allianceId: motive.allianceId,
          }
        : this.respondRecruitment(motive.recruitmentId, { random });
    if (motive.purpose === "alliance_reunion") {
      const a = this.getAlliance(motive.allianceId);
      this.recordContact(a, [speakerId, listenerId]);
      if (this.membersReunited(a) && this.trust(speakerId, listenerId) > 50) {
        a.lifecycle = "active";
        this.count("reactivatedAlliances");
        if (this.gm.isMerged) this.count("mergeReunions");
      }
      return { status: "reconnected" };
    }
    const p = this.propose({
      id: `${activityId}:offer`,
      proposerId: speakerId,
      receiverId: listenerId,
      ...motive,
    });
    return (
      p &&
      (this.person(listenerId)?.isPlayer ? p : this.respond(p.id, { random }))
    );
  }
  onTribeSwap() {
    for (const a of this.getAlliances())
      if (!this.membersReunited(a)) {
        if (a.lifecycle !== "dormant") this.count("dormantAlliances");
        a.lifecycle = "dormant";
        this.event(a, "separated", {}, []);
      }
  }
  onMerge() {
    for (const a of this.getAlliances())
      if (a.lifecycle === "dormant" && this.membersReunited(a))
        this.event(a, "reunion_available", {}, []);
  }
  onElimination(id) {
    for (const a of this.alliances)
      if (a.memberStates[id] && a.memberStates[id].status !== "eliminated") {
        const s = a.memberStates[id];
        s.previousStatus = s.status;
        s.status = "eliminated";
        s.priority = 0;
        this.stability(a, -2);
        this.project(a);
        this.event(
          a,
          "eliminated",
          { memberId: id },
          Object.keys(a.memberStates),
        );
        if (a.memberIds.length < 2) {
          a.lifecycle = a.type === "voting_bloc" ? "disbanded" : "dormant";
          this.project(a);
        }
      }
  }
  renew(allianceId, participants) {
    const a = this.getAlliance(allianceId),
      ids = participants.map((p) => p.id ?? p);
    if (!a || ids.length < 2 || ids.some((id) => !this.together(ids[0], id)))
      return false;
    a.lifecycle = "active";
    a.roundPlan = {
      day: this.day,
      status: "unresolved",
      participantCommitments: {},
    };
    for (const id of ids) a.memberStates[id].believesAllianceActive = true;
    this.recordContact(a, ids);
    this.project(a);
    return true;
  }
  processPostTribalFallout(summary = {}) {
    const reference =
      summary.id ||
      summary.completionKey ||
      `tribal:${summary.day}:${summary.attendingTribeId ?? summary.tribeId}`;
    if (this.processed.includes(reference)) return;
    const votes = summary.initialVotes || summary.votes || [];
    if (!votes.length) return;
    this.processed.push(reference);
    for (const a of this.alliances) {
      const plan = a.roundPlan;
      if (plan?.day !== summary.day && plan?.day !== this.day) continue;
      const participants =
          plan.participantIds || Object.keys(plan.participantCommitments || {}),
        compliance = [],
        defects = [];
      for (const v of votes) {
        const pledge = plan.participantCommitments?.[v.voterId];
        if (!pledge || pledge.status !== "committed") continue;
        (same(v.targetId, pledge.targetId) ? compliance : defects).push(
          v.voterId,
        );
      }
      if (
        !compliance.length &&
        !defects.length &&
        !participants.some((id) => votes.some((v) => same(v.voterId, id))) &&
        !(
          a.type === "voting_bloc" &&
          a.memberIds.some((id) => votes.some((v) => same(v.voterId, id)))
        )
      )
        continue;
      const success = same(
        summary.eliminatedId ?? summary.eliminated?.id,
        plan.primaryTargetId,
      );
      this.event(
        a,
        "objective_vote_outcome",
        {
          objectiveReference: reference,
          defectorIds: defects,
          compliance: compliance.length,
          success,
        },
        [],
      );
      for (const id of defects) {
        this.count("defections");
        this.count("hiddenDefections");
        const s = a.memberStates[id];
        if (s && s.status !== "eliminated") {
          s.priority = bounded(s.priority - 0.04);
          s.commitment = bounded(s.commitment - 0.025);
        }
      }
      this.stability(
        a,
        success && !defects.length ? 1.5 : -Math.min(8, defects.length * 2),
      );
      if (a.cohesion < 20 && defects.length) {
        a.lifecycle = "fractured";
        this.count("fractures");
      } else if (defects.length && a.lifecycle === "active")
        a.lifecycle = "strained";
      for (const id of compliance)
        if (a.memberStates[id]?.status === "active" && success) {
          const s = a.memberStates[id];
          if (!["fake", "cover"].includes(s.sincerity)) {
            s.priority = bounded(s.priority + 0.015);
            s.commitment = bounded(s.commitment + 0.015);
          }
        }
      if (a.type === "voting_bloc") {
        a.lifecycle = "disbanded";
        for (const id of unique([
          ...participants,
          ...a.memberIds.filter((id) => votes.some((v) => same(v.voterId, id))),
        ]))
          if (a.memberStates[id])
            a.memberStates[id].believesAllianceActive = false;
        this.count("votingBlocsExpired");
      } else if (
        a.type === "temporary" &&
        this.day - a.createdDay >= 2 &&
        a.lifecycle === "active"
      ) {
        a.lifecycle = "dormant";
        this.count("dormantAlliances");
      }
      const tally = votes.filter((v) =>
          same(v.targetId, plan.primaryTargetId),
        ).length,
        expected = Object.values(plan.participantCommitments || {}).filter(
          (p) => same(p.targetId, plan.primaryTargetId),
        ).length;
      if (expected && tally < expected)
        for (const owner of participants)
          if (this.living(owner))
            this.recordClaim({
              id: `${reference}:${a.id}:uncertainty:${owner}`,
              speakerId: owner,
              subjectId: owner,
              topic: "alliance_doubt",
              allianceId: a.id,
              stance: "uncertain",
              origin: "inference",
              confidence: 0.35,
              objectiveReference: reference,
            });
      this.project(a);
    }
    this.reactToOwnedEvidence();
  }
  perceiveBetrayal({
    ownerId,
    accusedId,
    allianceId,
    evidenceId,
    objectiveReference = null,
  }) {
    const evidence = ownedCampKnowledge(this.memory, ownerId, this.day).find(
        (e) => e.id === evidenceId,
      ),
      a = this.getAlliance(allianceId),
      s = a?.memberStates[ownerId];
    if (
      !s ||
      !evidence ||
      !same(evidence.subjectId, accusedId) ||
      evidence.confidence < 0.55 ||
      evidence.challenged ||
      !["vote_attribution", "alliance_exclusion", "deal_breach"].includes(
        evidence.topic,
      )
    )
      return false;
    const key = `${ownerId}:${allianceId}:${objectiveReference || evidenceId}:${accusedId}`;
    if (this.reactions.includes(key)) return false;
    this.reactions.push(key);
    s.perceivedHealth = bounded(s.perceivedHealth - 0.2);
    s.priority = bounded(s.priority - 0.06);
    this.gm.systems.trustSystem?.changeOwnedTrust?.(
      ownerId,
      accusedId,
      -10,
      "believed alliance betrayal",
    );
    this.memory?.recordBetrayal?.(
      ownerId,
      accusedId,
      "believed alliance betrayal",
    );
    this.event(a, "known_betrayal", { accusedId, evidenceId }, [ownerId]);
    this.count("discoveredBetrayals");
    return true;
  }
  reactToOwnedEvidence() {
    for (const p of this.gm?.survivors || [])
      for (const e of ownedCampKnowledge(this.memory, p.id, this.day)) {
        if (
          e.topic === "alliance_exclusion" &&
          same(e.subjectId, p.id) &&
          e.confidence >= 0.55 &&
          !e.challenged
        ) {
          const s = this.getMemberState(p.id, e.allianceId);
          if (s) s.believesAllianceActive = false;
        }
        if (["vote_attribution", "deal_breach"].includes(e.topic))
          for (const a of this.getAlliancesForSurvivor(p.id))
            if (
              same(e.allianceId, a.id) ||
              (e.objectiveReference &&
                a.history.some(
                  (h) => h.objectiveReference === e.objectiveReference,
                ))
            )
              this.perceiveBetrayal({
                ownerId: p.id,
                accusedId: e.subjectId,
                allianceId: a.id,
                evidenceId: e.id,
                objectiveReference: e.objectiveReference,
              });
        for (const d of this.gm?.systems?.dealSystem?.getDealsForSurvivor?.(
          p.id,
        ) || [])
          this.gm.systems.dealConsequencesSystem?.learnBreach?.(
            d.id,
            p.id,
            e.id,
          );
      }
  }
  scoreDealAcceptance({ offererId, receiverId }) {
    return (
      this.evaluateAllianceOffer({
        proposerId: offererId,
        receiverId,
        type: "voting_bloc",
      }).score / 100
    );
  }
  wouldAcceptDeal(options) {
    const score = this.scoreDealAcceptance(options);
    return { accept: Math.random() < score, score };
  }
  migrateLegacyPriorityHints(payload, memoryPayload) {
    if (payload?.version >= 2) return;
    const hints = new Map(payload?.commitments || []);
    for (const [id, m] of Object.entries(memoryPayload?.memory || {}))
      if (m.committedAllianceId) hints.set(id, m.committedAllianceId);
    for (const [memberId, allianceId] of hints) {
      const s = this.getMemberState(memberId, allianceId);
      if (s?.status === "active") s.priority = Math.max(s.priority, 0.8);
    }
  }
  serialize() {
    return copy({
      version: 2,
      alliances: this.alliances,
      commitments: [...this.commitments],
      proposals: this.proposals,
      pendingRecruitment: this.pendingRecruitment,
      pendingExclusion: this.pendingExclusion,
      processed: this.processed,
      reactions: this.reactions,
      metrics: this.metrics,
      sequence: this.sequence,
    });
  }
  deserialize(payload) {
    this.reset();
    if (!payload) return;
    this.alliances = (payload.alliances || []).map((a) => this.normalize(a));
    this.commitments = new Map(payload.commitments || []);
    for (const key of [
      "proposals",
      "pendingRecruitment",
      "pendingExclusion",
      "processed",
      "reactions",
    ])
      this[key] = copy(payload[key] || []);
    this.metrics = { ...(payload.metrics || {}) };
    this.sequence = payload.sequence || 0;
    if (payload.version < 2 || payload.version == null)
      this.migrateLegacyPriorityHints(payload);
  }
}
