import { scrambleConversationSeconds } from './ScrambleTime.js';
import { LocationKeys } from '../core/LocationKeys.js';
import { ISLAND_LOCATION_GRAPH } from './NpcLocationSystem.js';
import { MAX_FIRE_LEVEL, MAX_SHELTER_LEVEL, isNeededCampContribution, syncCampResources } from './CampState.js';
import { resolveNpcCampExchange } from './CampSocialResolution.js';
import { physicalCampLocation } from '../locations/LocationUtils.js';
import { eligibleCampMember, isCampPhysicallyPresent } from '../locations/CampPresence.js';
import { getCampBehaviorProfile, campWorkSkill, campBuildSuccessChance } from './CampBehaviorProfile.js';
import { refreshNpcCampNeeds } from './CampSustenance.js';
import { ownsUsableIdol } from './IdolPossession.js';
import eventManager from '../core/EventManager.js';
export { physicalCampLocation } from '../locations/LocationUtils.js';

const WORK = Object.freeze({
  gather_firewood: { location: LocationKeys.JUNGLE_TRAIL, resource: 'firewood', role: 'wood', duration: 420 },
  gather_bamboo: { location: LocationKeys.JUNGLE_TRAIL, resource: 'bamboo', role: 'wood', duration: 420 },
  gather_food: { location: LocationKeys.BEACH, resource: 'coconuts', role: 'resources', duration: 420 },
  collect_water: { location: LocationKeys.WATER_WELL, resource: 'water', role: 'resources', duration: 420 },
  fish: { location: LocationKeys.ROCKY_SHORE, resource: 'fish1', role: 'resources', duration: 480 },
  build_fire: { location: LocationKeys.CAMPFIRE, role: 'fire', duration: 420 },
  build_shelter: { location: LocationKeys.SHELTER, role: 'shelter', duration: 480 },
  tend_fire: { location: LocationKeys.CAMPFIRE, role: 'fire', duration: 300 }
});
const VIEW_WORK = {
  [LocationKeys.FIREWOOD]: 'gather_firewood', [LocationKeys.BAMBOO]: 'gather_bamboo',
  [LocationKeys.SHAKE]: 'gather_food', [LocationKeys.FISHING]: 'fish',
  [LocationKeys.FIRE]: 'build_fire', [LocationKeys.SHELTER]: 'build_shelter',
  [LocationKeys.WATER_WELL]: 'collect_water'
};
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const same = (a, b) => a != null && b != null && String(a) === String(b);
const WORK_BALANCE = Object.freeze({ routine: .05, shortage: 2.4, assigned: 1.4,
  coveredResponsibility: .05, exhaustedMultiplier: .5, restRecovery: 6 });
export function routeBetween(from, to) {
  if (!from || !to || from === to) return [];
  const queue = [[from]], seen = new Set([from]);
  while (queue.length) {
    const path = queue.shift();
    for (const next of ISLAND_LOCATION_GRAPH[path.at(-1)] || []) {
      if (seen.has(next)) continue;
      if (next === to) return [...path.slice(1), next];
      seen.add(next); queue.push([...path, next]);
    }
  }
  return [];
}

export default class CampActivitySystem {
  constructor(gm, random = Math.random) {
    this.gm = gm; this.random = random; this.phaseId = null; this.nextId = 1;
    this.resolved = new Set(); this.reputationEvents = new Set(); this.effort = {};
    this.initialNeeds = {}; this.lastLogIndex = 0; this.departures = {};
    this.lastUrgentTime = {}; this.conversation = null;
  }
  get tribe() { return this.gm.getPlayerTribe?.(); }
  get locations() { return this.gm.systems?.npcLocationSystem; }
  get memory() { return this.gm.systems?.socialMemorySystem; }
  get phase() { return `${this.gm.day || 1}:${this.gm.gamePhase}`; }
  get post() { return this.gm.gamePhase === 'postChallenge'; }
  get strategy() { return this.gm.systems?.strategyPhaseSystem; }
  get active() { return ['preChallenge', 'postChallenge'].includes(this.gm.gamePhase) && (!this.post || Boolean(this.strategy?.isActive)) && this.phaseId === this.phase; }
  absent(s) {
    return !eligibleCampMember(this.gm, s);
  }
  members() { return (this.tribe?.members || []).filter(s => !this.absent(s)); }
  npcs() { return this.members().filter(s => !s.isPlayer); }
  roleOf(s) {
    const assignments = this.gm.systems?.taskSimulationSystem?.getAssignmentsFromPlanOrTasks?.(this.gm, this.tribe) || {};
    return Object.keys(assignments).find(role => assignments[role]?.some(id => same(id, s.id))) || null;
  }
  ensureStarted(now = this.gm.dayTimer) {
    if (!['preChallenge', 'postChallenge'].includes(this.gm.gamePhase) || this.post && !this.strategy?.isActive || (this.gm.gameState && this.gm.gameState !== 'camp') ||
      this.gm.flags?.campEventActive || !this.tribe) return false;
    if (!this.active) {
      this.memory?.advanceCampMemoryDay?.(this.gm.day || 1);
      this.phaseId = this.phase; this.resolved.clear(); this.reputationEvents.clear(); this.effort = {};
      this.initialNeeds = {
        fire: (this.tribe.fire || 0) < MAX_FIRE_LEVEL,
        shelter: (this.tribe.shelter || 0) < MAX_SHELTER_LEVEL,
        wood: isNeededCampContribution(this.tribe, 'firewood') || isNeededCampContribution(this.tribe, 'bamboo'),
        resources: isNeededCampContribution(this.tribe, 'water') || isNeededCampContribution(this.tribe, 'coconuts')
      };
      this.departures = {}; this.lastUrgentTime = {}; this.lastLogIndex = this.gm.campLog?.length || 0;
      for (const s of this.tribe.members || []) s.campActivity = null;
    }
    for (const s of this.tribe.members || []) if (this.absent(s)) {
      s.campActivity = null;
      if (!s.isPlayer) delete this.locations?.locations?.[s.id];
    }
    if (this.post) this.strategy?.onActivityBoundary?.(now);
    for (const npc of this.npcs()) if (!npc.campActivity) this.chooseNext(npc, now);
    return true;
  }
  scoreChoices(npc) {
    const tribe = this.tribe, supply = tribe.stockpile || {}, role = this.roleOf(npc);
    const profile = getCampBehaviorProfile(npc);
    const urgent = (this.memory?.getNpcConversationIntents?.(npc.id, { day: this.gm.day, limit: 4 })?.length || 0) +
      (this.memory?.getCampClaims?.(npc.id)?.filter(claim => claim.salience === 'high' &&
        claim.day === this.gm.day && !claim.challenged && claim.confidence >= .2 && claim.truthfulness !== false).length || 0);
    const allies = this.npcs().filter(s => !same(s.id, npc.id)).map(s => ({ s,
      score: (this.gm.getTrust?.(npc.id, s.id) ?? 50) +
        (this.gm.systems?.allianceSystem?.getAllianceAffinity?.(npc.id, s.id) || 0) * 25 +
        Math.min(8, (this.memory?.getCampImpression?.(npc.id, s.id, 'work')?.count || 0) * 2) -
        Math.min(8, (this.memory?.getCampImpression?.(npc.id, s.id, 'role_neglect')?.count || 0) * 2) +
        ((this.memory?.getCampSourceReliability?.(npc.id, s.id) ?? 0.75) - 0.75) * 16 }))
      .sort((a, b) => b.score - a.score);
    const availableAlly = allies.find(({ s }) => !s.campActivity ||
      ['rest', 'idle_at_camp', 'observe'].includes(s.campActivity.type));
    const need = {
      gather_firewood: isNeededCampContribution(tribe, 'firewood'),
      gather_bamboo: isNeededCampContribution(tribe, 'bamboo'),
      gather_food: isNeededCampContribution(tribe, 'coconuts') || isNeededCampContribution(tribe, 'palms'),
      collect_water: isNeededCampContribution(tribe, 'water'),
      fish: isNeededCampContribution(tribe, 'fish1'),
      build_fire: (tribe.fire || 0) < MAX_FIRE_LEVEL && supply.firewood >= 10,
      build_shelter: (tribe.shelter || 0) < MAX_SHELTER_LEVEL && supply.bamboo >= 5 && supply.palms >= 1,
      tend_fire: (tribe.fire || 0) > 0 && (tribe.fire || 0) < MAX_FIRE_LEVEL && supply.firewood >= 4
    };
    const rested = clamp((npc.rest ?? 75) / 100, 0, 1);
    const workCondition = WORK_BALANCE.exhaustedMultiplier + rested * (1 - WORK_BALANCE.exhaustedMultiplier);
    const choices = Object.entries(WORK).map(([type, rule]) => {
      const responsibility = role === rule.role ? (need[type] ? WORK_BALANCE.assigned : WORK_BALANCE.coveredResponsibility) :
        role === 'float' && need[type] ? WORK_BALANCE.assigned : 0;
      return { type, location: rule.location,
        weight: ['build_fire', 'build_shelter', 'tend_fire'].includes(type) && !need[type] ? 0 :
        ((need[type] ? WORK_BALANCE.shortage : WORK_BALANCE.routine) + responsibility) *
        (0.55 + profile.workDrive * 1.2) * workCondition *
        (type === 'fish' ? .25 + profile.fishingSkill * 1.6 :
          ['build_fire', 'tend_fire'].includes(type) ? .6 + profile.fireSkill * .8 : .7 + campWorkSkill(npc, type) * .6) *
        (need[type] ? .8 + profile.leadershipDrive * .4 : 1) };
    });
    for (const choice of choices) {
      const partner = this.npcs().find(other => !same(other.id, npc.id) &&
        other.campActivity?.type === choice.type && this.present(other, choice.location) &&
        other.campActivity.endsAt < this.gm.dayTimer &&
        (this.gm.getTrust?.(npc.id, other.id) ?? 50) >= 45);
      if (partner) {
        choice.targetId = partner.id;
        choice.socialPurpose = this.random() < (urgent ? .18 + profile.strategyDrive * .2 : profile.strategyDrive * .16) ? 'strategy' : 'social';
        choice.weight *= 1.2;
      }
    }
    choices.push({ type: 'rest', location: this.locations?.getLocation?.(npc.id) || LocationKeys.SHELTER,
      weight: 0.5 + (1 - clamp((npc.rest ?? 75) / 100, 0, 1)) * 5 + (1 - profile.workDrive) * .5 });
    choices.push({ type: 'socialize', location: availableAlly ? this.locations?.getLocation?.(availableAlly.s.id) : LocationKeys.BEACH,
      targetId: availableAlly?.s.id, weight: availableAlly ? (.4 + availableAlly.score / 100 * 1.4) * (.5 + profile.socialDrive) : 0 });
    choices.push({ type: 'strategy_conversation', location: availableAlly ? this.locations?.getLocation?.(availableAlly.s.id) : LocationKeys.SHELTER,
      targetId: availableAlly?.s.id, weight: availableAlly ? .2 + profile.strategyDrive * .65 +
        Math.min(3, urgent * (.5 + profile.strategyDrive * .7 + profile.paranoiaDrive * .4)) *
        (.7 + profile.riskTolerance * .3 + profile.confrontationDrive * .2) : 0 });
    const observers = this.members().filter(s => !same(s.id, npc.id) &&
      this.present(s, LocationKeys.JUNGLE_TRAIL)).length;
    const shortages = Object.values(need).filter(Boolean).length;
    // Only personal/public availability is consulted. Another contestant's
    // secret idol find is not an AI input. Exhausted legal searches are blocked
    // by the same per-location limit as IdolSystem, before committing camp time.
    const searches = this.gm.systems?.idolSystem?.getCasualSearchCount?.(npc.id, LocationKeys.JUNGLE_TRAIL) || 0;
    const maySearch = this.gm.gameSettings?.enableIdols !== false && !ownsUsableIdol(npc, this.gm.systems?.idolSystem) && searches < 2;
    choices.push({ type: 'idol_hunt', location: LocationKeys.JUNGLE_TRAIL,
      weight: !maySearch ? 0 : (.04 + profile.idolDrive ** 2 * 1.15) *
        (observers ? .35 + profile.riskTolerance * .5 : 1.15) * (shortages >= 4 ? .8 : 1) });
    choices.push({ type: 'observe', location: this.locations?.getLocation?.(npc.id) || LocationKeys.BEACH,
      weight: .1 + profile.paranoiaDrive * .8 });
    const suspect = allies.map(({ s }) => ({ s, count: this.memory?.getCampImpression?.(npc.id, s.id, 'absence')?.count || 0 }))
      .sort((a, b) => b.count - a.count)[0];
    if (suspect?.count >= 2) choices.push({ type: 'investigate', location: this.locations?.getLocation?.(suspect.s.id),
      targetId: suspect.s.id, weight: (0.4 + Math.min(1, suspect.count * 0.2)) *
        (.35 + profile.paranoiaDrive * 1.3) * (.8 + profile.confrontationDrive * .2) });
    choices.push({ type: 'idle_at_camp', location: LocationKeys.BEACH, weight: 0.35 });
    return choices.filter(c => c.location && c.weight > 0);
  }
  chooseNext(npc, now) {
    if (this.absent(npc) || npc.isPlayer) return null;
    if (this.post && !this.strategy?.playerTribeSafe) {
      const choice = this.strategy?.planActivity?.(npc, now);
      if (!choice) return null;
      const from = this.locations?.getLocation?.(npc.id) || npc.location || LocationKeys.BEACH;
      const route = routeBetween(from, choice.location);
      return this.start(npc, route.length ? { type: 'travel', location: route[0], route: route.slice(1), goal: choice } : choice, now);
    }
    const choices = this.scoreChoices(npc), total = choices.reduce((n, c) => n + c.weight, 0);
    let roll = this.random() * total;
    const choice = choices.find(c => (roll -= c.weight) <= 0) || choices.at(-1);
    if (!choice) return null;
    const from = this.locations?.getLocation?.(npc.id) || npc.location || LocationKeys.BEACH;
    const route = routeBetween(from, choice.location);
    if (choice.type === 'idol_hunt' && route.length) this.recordDeparture(npc, from, now);
    return route.length ? this.start(npc, { type: 'travel', location: route[0], route: route.slice(1), goal: choice }, now) :
      this.start(npc, choice, now);
  }
  start(actor, plan, now = this.gm.dayTimer) {
    if (this.absent(actor) || !plan?.location || actor.campActivity?.interruptible === false) return null;
    if (this.post && plan.type === 'strategy_conversation') {
      const partner = this.npcs().find(s => same(s.id, plan.targetId) && !same(s.id, actor.id));
      const free = partner && (!partner.campActivity || ['rest', 'idle_at_camp', 'observe'].includes(partner.campActivity.type));
      // A route is a plan, not a reservation of a remote contestant. If the
      // intended listener is gone/busy on arrival, regroup instead of talking alone.
      if (!free || !this.present(partner, plan.location)) plan = { type: 'observe', location: plan.location, duration: 120 };
    }
    if (actor.campActivity) this.interrupt(actor, 'new_priority', now);
    const duration = plan.duration || (plan.type === 'travel' ? 45 : WORK[plan.type]?.duration ||
      (plan.type === 'idol_hunt' ? 510 : plan.type === 'rest' ? 360 : 240));
    const from = actor.isPlayer ? actor.location : this.locations?.getLocation?.(actor.id);
    const activity = { id: `${this.phase}:${this.nextId++}`, actorId: actor.id, type: plan.type,
      location: plan.location, ...(plan.type === 'travel' ? { fromLocation: from } : {}), startedAt: now, endsAt: now - duration, duration,
      role: this.roleOf(actor), targetId: plan.targetId || null, socialPurpose: plan.socialPurpose || null,
      route: plan.route || null, travelWithId: plan.travelWithId || null,
      goal: plan.goal || null, privacy: ['strategy_conversation', 'alliance_meeting', 'idol_hunt'].includes(plan.type) ? 'private' : 'visible',
      interruptible: !['private_conversation', 'strategy_conversation_player', 'meeting_wait', 'alliance_meeting', 'approach_player', 'approach_wait'].includes(plan.type),
      external: Boolean(plan.external), ...(plan.meetingId ? { meetingId: plan.meetingId } : {}),
      ...(plan.purpose ? { purpose: plan.purpose } : {}), ...(plan.agenda ? { agenda: plan.agenda } : {}) };
    actor.campActivity = activity;
    if (!actor.isPlayer) this.locations?.updateNpcLocation?.(actor.id, plan.location, { reason: `activity:${plan.type}`, publish: false });
    if (plan.type === 'travel' && plan.travelWithId) {
      const companion = this.npcs().find(s => same(s.id, plan.travelWithId));
      if (companion && this.present(companion, from) && companion.campActivity?.interruptible !== false) {
        this.interrupt(companion, 'walk_together', now);
        activity.participantIds = [companion.id];
        companion.campActivity = { ...activity, actorId: companion.id, external: true };
        this.locations?.updateNpcLocation?.(companion.id, plan.location, { reason: 'activity:travel', publish: false });
      }
    }
    if (['socialize', 'strategy_conversation'].includes(plan.type) && plan.targetId) {
      const target = this.npcs().find(s => same(s.id, plan.targetId));
      const available = !target?.campActivity || ['rest', 'idle_at_camp', 'observe'].includes(target.campActivity.type);
      if (target && available && this.present(target, plan.location)) {
        this.interrupt(target, 'conversation', now);
        target.campActivity = { ...activity, actorId: target.id, targetId: actor.id, external: true };
        activity.participantIds = [target.id];
      }
    }
    if (!actor.isPlayer && plan.type === 'travel' && from && from !== plan.location)
      this.recordPhysicalMovement(actor, activity, 'departed', now);
    eventManager.publish('camp:activityChanged', { activityId: activity.id });
    return activity;
  }
  interrupt(actor, reason = 'interrupted', at = this.gm.dayTimer) {
    const activity = actor?.campActivity;
    if (!activity || !activity.interruptible) return false;
    actor.campActivity = null; this.resolved.add(activity.id);
    for (const partner of this.npcs()) if (partner.campActivity?.id === activity.id)
      partner.campActivity = null;
    if (WORK[activity.type]) this.effort[actor.id] = (this.effort[actor.id] || 0) + Math.max(0, activity.startedAt - at);
    return true;
  }
  advance(before, after, elapsed = () => {}) {
    if (!this.ensureStarted(before)) { elapsed(before - after); return; }
    for (const npc of this.post ? [] : this.npcs()) {
      const current = npc.campActivity;
      if (!WORK[current?.type] || current.startedAt - before < 90) continue;
      const urgent = this.memory?.getNpcConversationIntents?.(npc.id, { day: this.gm.day, limit: 3 })?.filter(i =>
        ['warning', 'targeting', 'vote_pitch', 'alliance_pitch'].includes(i.intent) &&
        Number.isFinite(i.campTime) && i.campTime <= current.startedAt &&
        i.campTime < (this.lastUrgentTime[npc.id] ?? Infinity)) || [];
      const profile = getCampBehaviorProfile(npc);
      if (!urgent.length || this.random() >= .35 + profile.strategyDrive * .2 + profile.confrontationDrive * .15) continue;
      this.lastUrgentTime[npc.id] = urgent.at(-1).campTime;
      this.interrupt(npc, 'urgent_information', before);
      const ally = this.npcs().find(s => !same(s.id, npc.id) && (this.gm.systems?.allianceSystem?.getAllianceAffinity?.(npc.id, s.id) || 0) > .35);
      if (ally) {
        const location = this.locations?.getLocation?.(ally.id), route = routeBetween(this.locations?.getLocation?.(npc.id), location);
        const goal = { type: 'strategy_conversation', location, targetId: ally.id };
        this.start(npc, route.length ? { type: 'travel', location: route[0], route: route.slice(1), goal } : goal, before);
      } else this.chooseNext(npc, before);
    }
    let cursor = before, guard = 0;
    while (cursor > after && guard++ < 3000) {
      const due = this.npcs().map(s => s.campActivity).filter(a => a && !a.external && a.endsAt < cursor && a.endsAt >= after);
      const scheduled = this.post ? this.strategy?.nextActivityBoundaries?.(cursor, after) || [] : [];
      if (!due.length && !scheduled.length) break;
      const boundary = Math.max(...due.map(a => a.endsAt), ...scheduled);
      elapsed(cursor - boundary); cursor = boundary; this.gm.dayTimer = boundary;
      // Settle every arrival at this boundary before collecting witnesses or
      // starting another route step. Pair companions are cleared atomically.
      const arriving = this.npcs().filter(npc => npc.campActivity?.endsAt === boundary &&
        npc.campActivity.type === 'travel' && !npc.campActivity.external)
        .map(actor => ({ actor, activity: actor.campActivity }));
      const landed = arriving.filter(({ actor, activity }) => this.settleTravel(actor, activity, boundary));
      for (const { actor, activity } of landed) this.recordPhysicalMovement(actor, activity, 'arrived', boundary);
      landed.sort((a, b) => Number(Boolean(b.activity.route?.length)) - Number(Boolean(a.activity.route?.length)));
      for (const { actor, activity } of landed) this.continueTravel(actor, activity, boundary);
      if (this.post) this.strategy?.onActivityBoundary?.(boundary);
      for (const npc of this.npcs()) if (npc.campActivity?.endsAt === boundary && !npc.campActivity.external) {
        const current = npc.campActivity;
        this.complete(npc, current, boundary);
        if (boundary > 0 && !npc.campActivity && !this.gm.flags?.campEventActive) this.chooseNext(npc, boundary);
      }
    }
    elapsed(cursor - after); this.gm.dayTimer = after;
    if (this.post) this.strategy?.onActivityBoundary?.(after);
    else this.ingestNewCampLog();
  }
  complete(actor, activity = actor?.campActivity, at = this.gm.dayTimer) {
    if (!activity || this.resolved.has(activity.id) || !same(actor?.campActivity?.id, activity.id)) return false;
    if (activity.type === 'travel') {
      if (!this.settleTravel(actor, activity, at)) return false;
      this.recordPhysicalMovement(actor, activity, 'arrived', at);
      this.continueTravel(actor, activity, at);
      return true;
    }
    if (!this.present(actor, activity.location)) return false;
    if (WORK[activity.type]) for (const helper of this.npcs()) {
      const shared = helper.campActivity;
      if (!shared?.socialPurpose || shared.socialResolved || !same(shared.targetId, actor.id) ||
        shared.type !== activity.type || !this.present(helper, activity.location)) continue;
      this.observe({ actor: helper, type: 'seen_together', location: activity.location,
        participants: [actor.id], activityId: `${shared.id}:company`, at, visibility: 'private' });
      resolveNpcCampExchange({ gm: this.gm, memory: this.memory, speaker: helper, listener: actor,
        activity: { ...shared, endsAt: at }, random: this.random });
      shared.socialResolved = true;
    }
    const strategyResolved = this.post && !activity.external && this.strategy?.resolveActivity?.(actor, activity, at);
    this.resolved.add(activity.id);
    if (actor.campActivity === activity) actor.campActivity = null;
    const companion = activity.participantIds?.length && this.npcs().find(s => same(s.id, activity.participantIds[0]));
    const companions = this.npcs().filter(s => s.campActivity?.id === activity.id && s !== actor);
    for (const member of companions) member.campActivity = null;
    if (strategyResolved) { /* Content resolved inside the authoritative strategy plan. */ }
    else if (activity.external) { /* The owning minigame records its own outcome. */ }
    else if (WORK[activity.type]) {
      this.effort[actor.id] = (this.effort[actor.id] || 0) + activity.duration;
      this.resolveWork(actor, activity, at);
      const partner = this.npcs().find(s => same(s.id, activity.targetId) &&
        this.present(s, activity.location) &&
        (s.campActivity?.type === activity.type || s.campActivity?.endsAt === at));
      if (partner && activity.socialPurpose && !activity.socialResolved) {
        this.observe({ actor, type: 'seen_together', location: activity.location, participants: [partner.id],
          activityId: `${activity.id}:company`, at, visibility: 'private' });
        resolveNpcCampExchange({ gm: this.gm, memory: this.memory, speaker: actor, listener: partner,
          activity, random: this.random });
      }
    } else if (activity.type === 'rest') actor.rest = clamp((actor.rest ?? 50) + WORK_BALANCE.restRecovery, 0, 100);
    else if (activity.type === 'idol_hunt') {
      this.gm.systems?.idolSystem?.attemptIntentionalHunt?.(actor.id, activity.location, 'casual', { isNpc: true });
      this.observe({ actor, type: 'absence', location: activity.location, activityId: activity.id,
        at, witnessIds: this.departureWitnesses(actor.id, activity.startedAt), visibility: 'movement', detail: 'was seen away from camp' });
    } else if (['socialize', 'strategy_conversation'].includes(activity.type)) {
      const target = this.members().find(s => same(s.id, activity.targetId));
      if (target && activity.participantIds?.some(id => same(id, target.id)) &&
        this.present(target, activity.location)) {
        this.observe({ actor, type: 'seen_together', location: activity.location, participants: [target.id],
          activityId: activity.id, at, visibility: 'private', detail: `${actor.firstName} spent time with ${target.firstName}` });
        resolveNpcCampExchange({ gm: this.gm, memory: this.memory, speaker: actor, listener: target,
          activity, random: this.random });
      }
    } else if (activity.type === 'investigate') {
      const subject = this.npcs().find(s => same(s.id, activity.targetId));
      if (subject && this.present(subject, activity.location) &&
        subject.campActivity?.type === 'idol_hunt') {
        this.observe({ actor: subject, type: 'idol_search_seen', location: activity.location,
          activityId: `${activity.id}:discovery`, at, witnessIds: [actor.id], visibility: 'visible' });
        this.memory?.recordCampClaim?.({ id: `${activity.id}:idol`, speakerId: actor.id,
          subjectId: subject.id, topic: 'idol_suspicion', stance: 'searching', origin: 'firsthand',
          confidence: 0.9, salience: 'high', day: this.gm.day, campTime: at });
      }
    }
    if (!this.post && activity.type !== 'travel' && !activity.external) {
      refreshNpcCampNeeds(this.gm, actor, activity.location);
      if (companion) refreshNpcCampNeeds(this.gm, companion, activity.location);
    }
    // A gathering meeting may reserve newly freed participants before another
    // unrelated block is selected. Resolution still happens while co-present.
    if (this.post && at > 0) this.strategy?.onActivityBoundary?.(at);
    for (const member of companions) if (!member.campActivity && at > 0) this.chooseNext(member, at);
    return true;
  }
  present(person, place) { return isCampPhysicallyPresent(person, this.locations, place, this.gm); }
  recordPhysicalMovement(actor, activity, type, at) {
    const place = type === 'departed' ? activity.fromLocation : activity.location;
    if (!place) return;
    const participants = activity.participantIds || [];
    const witnesses = this.members().filter(s => !same(s.id, actor.id) &&
      !participants.some(id => same(id, s.id)) && this.present(s, place)).map(s => s.id);
    this.memory?.recordCampObservation?.({ id: `${activity.id}:${type === 'departed' ? 'departure' : 'arrival'}`,
      actorId: actor.id, participantIds: participants, witnessIds: witnesses, type,
      location: activity.location, fromLocation: activity.fromLocation, day: this.gm.day, campTime: at, visibility: 'movement' });
  }
  settleTravel(actor, activity, at) {
    if (this.absent(actor) || this.resolved.has(activity.id) || actor.campActivity?.id !== activity.id ||
      at > activity.endsAt) return false;
    activity.participantIds = (activity.participantIds || []).filter(id =>
      this.npcs().some(s => same(s.id, id) && s.campActivity?.id === activity.id));
    this.resolved.add(activity.id); actor.campActivity = null;
    for (const id of activity.participantIds || []) {
      const companion = this.npcs().find(s => same(s.id, id));
      if (companion?.campActivity?.id === activity.id) companion.campActivity = null;
    }
    // Refresh location residency/returned-target eligibility at actual arrival.
    for (const id of [actor.id, ...(activity.participantIds || [])])
      this.locations?.updateNpcLocation?.(id, activity.location, { reason: 'activity:arrival', publish: false });
    return true;
  }
  continueTravel(actor, activity, at) {
    // An earlier arrival at this same boundary may have legitimately invited
    // this now-present contestant into a shared goal. Do not interrupt it via
    // the stale, already completed travel object.
    if (actor.campActivity) return;
    if (activity.route?.length) this.start(actor, { type: 'travel', location: activity.route[0],
      route: activity.route.slice(1), goal: activity.goal, travelWithId: activity.travelWithId }, at);
    else if (activity.goal) this.start(actor, activity.goal, at);
    const companion = this.npcs().find(s => same(s.id, activity.travelWithId));
    if (companion && !companion.campActivity && at > 0) this.chooseNext(companion, at);
    if (!actor.campActivity && at > 0 && !activity.external) this.chooseNext(actor, at);
    eventManager.publish('camp:activityChanged', { activityId: activity.id });
  }
  resolveWork(actor, activity, at) {
    const tribe = this.tribe, rule = WORK[activity.type];
    const stock = this.gm.ensureStockpileExists?.(tribe) || tribe.stockpile;
    const skill = campWorkSkill(actor, activity.type);
    const needed = rule.resource ? isNeededCampContribution(tribe, rule.resource) ||
      activity.type === 'gather_food' && isNeededCampContribution(tribe, 'palms') :
      (activity.type.includes('fire') ? (tribe.fire || 0) < MAX_FIRE_LEVEL : (tribe.shelter || 0) < MAX_SHELTER_LEVEL);
    let amount = 0;
    if (rule.resource) {
      amount = Math.max(1, Math.round(1 + skill * 2 + this.random() * 2)) + (rule.resource === 'water' ? 2 : 0);
      this.gm.addToStockpile?.(tribe, rule.resource, amount);
      this.gm.campLog.push({ type: rule.resource === 'coconuts' || rule.resource.startsWith('fish') ? 'camp_contribute_food' : 'camp_contribute',
        id: activity.id, activityId: activity.id, actorId: actor.id, role: activity.role,
        resource: rule.resource, resources: { [rule.resource]: amount }, amount, day: this.gm.day,
        campTime: at, source: 'camp_activity' });
      // Beach foraging also supplies needed roof material. The previous block
      // engine could gather bamboo forever while a missing palm blocked shelter.
      if (activity.type === 'gather_food' && isNeededCampContribution(tribe, 'palms')) {
        this.gm.addToStockpile?.(tribe, 'palms', 1);
        this.gm.campLog.at(-1).resources.palms = 1;
      }
    } else {
      const fire = activity.type.includes('fire'), key = fire ? 'fire' : 'shelter';
      const cost = fire ? { firewood: activity.type === 'tend_fire' ? 4 : 10 } : { bamboo: 5, palms: 1 };
      const max = fire ? MAX_FIRE_LEVEL : MAX_SHELTER_LEVEL;
      if ((tribe[key] || 0) < max && Object.entries(cost).every(([res, n]) => stock[res] >= n)) {
        for (const [res, n] of Object.entries(cost)) this.gm.consumeFromStockpile(tribe, res, n);
        const before = tribe[key] || 0;
        if (this.random() < campBuildSuccessChance(actor, activity.type,
          { responsible: this.roleOf(actor) === rule.role })) tribe[key] = Math.min(max, before + 1);
        syncCampResources(tribe); amount = tribe[key] > before ? 1 : 0;
        this.gm.campLog.push({ type: `camp_${key}_build`, id: activity.id, activityId: activity.id,
          actorId: actor.id, success: Boolean(amount), [`${key}Before`]: before, [`${key}After`]: tribe[key],
          day: this.gm.day, campTime: at, source: 'camp_activity' });
      }
    }
    if (Number.isFinite(actor.rest)) actor.rest = Math.max(0, actor.rest - 1);
    if (amount) {
      this.recordReputation({ key: activity.id, actor, role: rule.role, amount, needed,
        location: activity.location, resource: rule.resource });
      this.observe({ actor, type: 'work', location: activity.location, activityId: activity.id,
        at, detail: `${actor.firstName} worked on ${activity.type.replaceAll('_', ' ')}` });
    }
  }
  recordDeparture(actor, from, at = this.gm.dayTimer) {
    if (!actor || !from) return;
    this.departures[actor.id] = { at, witnessIds: this.members().filter(s => !same(s.id, actor.id) &&
      this.present(s, from)).map(s => s.id) };
  }
  departureWitnesses(actorId, startedAt) {
    const entry = this.departures[actorId];
    return entry && entry.at >= startedAt && entry.at - startedAt <= 900 ? entry.witnessIds : null;
  }
  observe({ actor, type, location, participants = [], activityId, at, detail = '', visibility = 'visible', witnessIds = null }) {
    if (!actor || !location || !this.memory?.recordCampObservation) return [];
    const witnesses = this.members().filter(s => !same(s.id, actor.id) && !participants.some(id => same(id, s.id)) &&
      (Array.isArray(witnessIds) ? witnessIds.some(id => same(id, s.id)) :
        this.present(s, location))).map(s => s.id);
    this.memory.recordCampObservation({ id: activityId, actorId: actor.id, participantIds: participants,
      witnessIds: witnesses, type, location, day: this.gm.day, campTime: at, detail, visibility });
    if (type === 'absence') for (const id of witnesses) {
      const pattern = this.memory.getCampImpression?.(id, actor.id, 'absence');
      if (pattern?.count >= 3 && pattern.count % 3 === 0)
        this.gm.systems?.relationshipSystem?.changeRelationship?.(id, actor.id, -1);
    }
    return witnesses;
  }
  recordReputation({ key, actor, role, amount = 1, needed = false, location }) {
    if (!key || !actor || this.reputationEvents.has(key)) return false;
    this.reputationEvents.add(key);
    const witnesses = this.members().filter(s => !same(s.id, actor.id) &&
      this.present(s, location));
    const recognized = role === this.roleOf(actor) || this.roleOf(actor) === 'float' && needed;
    actor.teamPlayer = clamp((actor.teamPlayer ?? 50) + (recognized ? 2 : 1), 0, 100);
    for (const s of witnesses) this.gm.systems?.relationshipSystem?.changeRelationship?.(s.id, actor.id, 1);
    return true;
  }
  ingestNewCampLog() {
    const log = this.gm.campLog || [];
    for (let i = this.lastLogIndex; i < log.length; i++) {
      const entry = log[i];
      if (entry?.source === 'camp_activity' || entry?.day !== this.gm.day || !entry?.actorId ||
        !['camp_contribute', 'camp_contribute_food', 'camp_fire_build', 'camp_shelter_build'].includes(entry.type)) continue;
      const actor = this.members().find(s => same(s.id, entry.actorId));
      if (!actor) continue;
      const amount = Math.max(0, Number(entry.amount) || Object.values(entry.resources || entry.food || {})
        .reduce((n, value) => n + (Number(value) || 0), 0) || (entry.success ? 1 : 0));
      const role = entry.type.includes('shelter') ? 'shelter' : entry.type.includes('fire_build') ? 'fire' :
        ['water', 'coconut', 'fish1'].includes(entry.resource) ? 'resources' : 'wood';
      const location = role === 'shelter' ? LocationKeys.SHELTER : role === 'fire' ? LocationKeys.CAMPFIRE : actor.location || LocationKeys.BEACH;
      this.effort[actor.id] = (this.effort[actor.id] || 0) + Math.max(60, entry.secondsSpent || 180);
      if (amount && entry.success !== false) this.recordReputation({ key: `log:${this.phaseId}:${i}`, actor, role, amount, location });
      this.observe({ actor, type: 'work', location, activityId: `log:${this.phaseId}:${i}`,
        at: this.gm.dayTimer, detail: `${actor.firstName || 'You'} contributed around camp` });
    }
    this.lastLogIndex = log.length;
  }
  beginConversation(npc, { strategy = false, location = null } = {}) {
    if (!this.active) this.ensureStarted();
    const player = this.gm.getPlayerSurvivor?.();
    const place = physicalCampLocation(location) || location;
    if (this.post && this.conversation && same(this.conversation.npcId, npc?.id)) return true;
    if (!this.active || !npc || !player || !place || this.conversation || this.gm.flags?.campEventActive ||
      !this.present(npc, place) || !this.present(player, place) || npc.campActivity?.interruptible === false) return false;
    const prior = npc.campActivity && WORK[npc.campActivity.type] ? { type: npc.campActivity.type,
      location: place, duration: Math.max(120, this.gm.dayTimer - npc.campActivity.endsAt) } : null;
    this.interrupt(npc, 'conversation');
    const activity = this.start(npc, { type: strategy ? 'strategy_conversation_player' : 'private_conversation',
      location: place, external: true });
    if (!activity) return false;
    activity.interruptible = false; activity.endsAt = 0;
    player.campActivity = { ...activity, actorId: player.id, participantIds: [npc.id] };
    this.conversation = { npcId: npc.id, activityId: activity.id, location: place, strategy, prior };
    if (this.post) this.strategy?.reasoning?.checkpoint(this.conversation);
    return true;
  }
  moveTogether(actor, companion, destination) {
    if (!this.active || this.absent(actor) || this.absent(companion) || actor.isPlayer || companion.isPlayer ||
      actor.campActivity?.interruptible === false || companion.campActivity?.interruptible === false) return false;
    const from = this.locations?.getLocation?.(actor.id), route = routeBetween(from, destination);
    if (!this.present(actor, from) || !this.present(companion, from) || !route.length || route.length > 2) return false;
    const goal = { type: 'strategy_conversation', location: destination, targetId: companion.id };
    return this.start(actor, { type: 'travel', location: route[0], route: route.slice(1),
      goal, travelWithId: companion.id });
  }
  reserveConversationGroup(ids = []) {
    if (!this.conversation) return false;
    const npc = this.members().find(s => same(s.id, this.conversation.npcId));
    if (!npc?.campActivity) return false;
    const groupIds = [];
    for (const id of ids) {
      const other = this.npcs().find(s => same(s.id, id));
      if (!other || same(other.id, npc.id) || !this.present(other, this.conversation.location)) continue;
      // Restore/resume reuses the physical reservation, including speakers
      // whose existing conversation is deliberately non-interruptible.
      if (other.campActivity?.id === npc.campActivity.id &&
          this.conversation.groupIds?.some(memberId => same(memberId, other.id))) {
        groupIds.push(other.id); continue;
      }
      if (other.campActivity?.interruptible === false) continue;
      this.interrupt(other, 'joined_conversation');
      other.campActivity = { ...npc.campActivity, actorId: other.id, external: true };
      groupIds.push(other.id);
    }
    this.conversation.groupIds = groupIds;
    if (this.conversation.checkpoint) this.conversation.checkpoint.participants = [npc.id, ...groupIds];
    return true;
  }
  approachPlayer(npc, location) {
    if (!this.active) this.ensureStarted();
    const place = physicalCampLocation(location) || location, from = this.locations?.getLocation?.(npc?.id);
    const route = routeBetween(from, place);
    if (!this.active || !npc || this.absent(npc) || npc.campActivity?.type === 'travel' || !place || from !== place && !route.length ||
      npc.campActivity?.interruptible === false) return false;
    this.interrupt(npc, 'approach');
    for (const step of route) {
      const activity = this.start(npc, { type: 'travel', location: step, external: true });
      this.gm.consumeCampTime(45, { source: 'npc_approach_travel' });
      this.complete(npc, activity);
    }
    return true;
  }
  finishConversation({ turns = 0, strategy = false, topics = '' } = {}) {
    if (!this.conversation) return false;
    const current = this.conversation; this.conversation = null;
    this.gm.systems?.allianceSystem?.reactToOwnedEvidence?.();
    const npc = this.members().find(s => same(s.id, current.npcId)), player = this.gm.getPlayerSurvivor?.();
    turns = Math.max(turns, current.turns || 0); topics = `${topics} ${current.topics || ''} ${current.meetingId ? 'alliance_commitment' : ''}`;
    const seconds = this.post ? scrambleConversationSeconds({ turns, strategy: strategy || current.strategy, topics: topics || (current.meetingId ? 'alliance_commitment' : '') }) :
      clamp((strategy || current.strategy ? 180 : 90) + Math.max(0, turns) * 30, 90, 420);
    if (this.post) this.strategy?.scramble?.note('player_conversation', { npcId: current.npcId, seconds, topics });
    this.gm.consumeCampTime(seconds, { source: 'camp_conversation' });
    if(this.post)this.strategy?.reasoning?.contact([player?.id,current.npcId,...(current.groupIds||[])].filter(id=>id!=null));
    if (npc?.campActivity?.id === current.activityId) npc.campActivity = null;
    if (player?.campActivity?.id === current.activityId) player.campActivity = null;
    this.resolved.add(current.activityId);
    for (const id of current.groupIds || []) {
      const other = this.npcs().find(s => same(s.id, id));
      if (other?.campActivity?.id === current.activityId) {
        other.campActivity = null;
        if (this.gm.dayTimer > 0) this.chooseNext(other, this.gm.dayTimer);
      }
    }
    if (npc && player) this.observe({ actor: player, type: 'seen_together', participants: [npc.id, ...(current.groupIds || [])],
      location: current.location, activityId: current.activityId, at: this.gm.dayTimer,
      visibility: 'movement', detail: `You spent time talking with ${npc.firstName}` });
    if (current.meetingId) {
      const meeting = this.strategy?.scramble?.meetings.find(m => m.id === current.meetingId);
      if (meeting) { meeting.status = 'completed'; this.strategy.completedAllianceMeetings.add(meeting.id); }
    }
    if (npc && this.gm.dayTimer > 0 && this.active) {
      if (current.prior && !(strategy || current.strategy)) this.start(npc, current.prior, this.gm.dayTimer);
      else this.chooseNext(npc, this.gm.dayTimer);
    }
    return true;
  }
  beginPlayerBlock(before, after, payload = {}) {
    if (!this.ensureStarted(before) || ['clock', 'camp_conversation', 'npc_approach_travel', 'camp_travel'].includes(payload.source)) return null;
    const player = this.gm.getPlayerSurvivor?.(), view = payload.locationKey ||
      (typeof window !== 'undefined' ? window.campScreen?.currentView : player?.location);
    const location = physicalCampLocation(view) || player?.location;
    if (!player || !location || player.campActivity?.interruptible === false) return null;
    const activity = this.start(player, { type: ['follow', 'watch', 'approach'].includes(payload.activityType) ? payload.activityType :
      payload.source === 'player_idol_hunt' ? 'idol_hunt' : VIEW_WORK[view] || 'observe',
      location, duration: before - after, external: true }, before);
    if (activity) { activity.endsAt = after; player.location = location; }
    return activity;
  }
  finishPlayerBlock(activity) {
    const player = this.gm.getPlayerSurvivor?.();
    if (!activity || player?.campActivity?.id !== activity.id) return;
    player.campActivity = null; this.resolved.add(activity.id);
    if (WORK[activity.type]) this.effort[player.id] = (this.effort[player.id] || 0) + activity.duration;
    if (activity.type === 'idol_hunt') this.observe({ actor: player, type: 'absence',
      location: activity.location, activityId: activity.id, at: this.gm.dayTimer,
      witnessIds: this.departureWitnesses(player.id, activity.startedAt), visibility: 'movement',
      detail: 'You were seen away from camp' });
  }
  releasePhaseReservations() {
    this.conversation = null;
    for (const member of this.tribe?.members || []) member.campActivity = null;
  }
  finalize() {
    if (!this.active || this.post) return;
    this.ingestNewCampLog();
    for (const npc of this.npcs()) if (WORK[npc.campActivity?.type])
      this.effort[npc.id] = (this.effort[npc.id] || 0) + Math.max(0, npc.campActivity.startedAt - this.gm.dayTimer);
    for (const member of this.members()) {
      const role = this.roleOf(member);
      if (!role || role === 'float' || !this.initialNeeds[role] || (this.effort[member.id] || 0) >= 180) continue;
      const coworkers = this.members().filter(s => !same(s.id, member.id) && this.roleOf(s) === role);
      const key = `neglect:${this.phaseId}:${member.id}`;
      if (!coworkers.length || this.reputationEvents.has(key)) continue;
      this.reputationEvents.add(key);
      member.teamPlayer = clamp((member.teamPlayer ?? 50) - 1, 0, 100);
      coworkers.forEach(s => this.gm.systems?.relationshipSystem?.changeRelationship?.(s.id, member.id, -1));
      this.memory?.recordCampObservation?.({ id: key, actorId: member.id, witnessIds: coworkers.map(s => s.id),
        type: 'role_neglect', location: LocationKeys.BEACH, day: this.gm.day, campTime: this.gm.dayTimer,
        visibility: 'inference', detail: `${member.firstName} was rarely seen helping with ${role}` });
    }
  }
  serialize() { return { phaseId: this.phaseId, nextId: this.nextId, resolved: [...this.resolved].slice(-500),
    reputationEvents: [...this.reputationEvents].slice(-500), effort: this.effort, initialNeeds: this.initialNeeds,
    conversation: this.post ? this.conversation : null, lastLogIndex: this.lastLogIndex, departures: this.departures, lastUrgentTime: this.lastUrgentTime }; }
  deserialize(p) {
    this.phaseId = p?.phaseId || null; this.nextId = Number.isInteger(p?.nextId) ? p.nextId : 1;
    this.resolved = new Set(p?.resolved || []); this.reputationEvents = new Set(p?.reputationEvents || []);
    this.effort = p?.effort || {}; this.initialNeeds = p?.initialNeeds || {};
    this.lastLogIndex = Math.min(this.gm.campLog?.length || 0, Math.max(0, p?.lastLogIndex || 0));
    this.departures = p?.departures || {}; this.lastUrgentTime = p?.lastUrgentTime || {};
    this.conversation = this.post ? p?.conversation || null : null;
    for (const s of this.tribe?.members || []) {
      const a = s.campActivity;
      if (a?.type === 'travel' && !a.fromLocation) {
        const departure = this.memory?.getCampObservations?.(s.id)?.find(e => e.id === `${a.id}:departure`);
        a.fromLocation = departure?.fromLocation || null;
        this.memory?.removePrematureCampArrival?.(a.id, a.endsAt);
      }
      const companion = a?.external && ['socialize', 'strategy_conversation', 'alliance_meeting', 'travel'].includes(a.type) &&
        this.npcs().some(owner => owner.campActivity?.id === a.id && !owner.campActivity.external &&
          owner.campActivity.participantIds?.some(id => same(id, s.id)));
      const reservation = this.post && (a?.id === this.conversation?.activityId ||
        a?.type === 'approach_wait' && a.id === this.strategy?.scramble?.invitation?.activityId);
      if (this.absent(s) || a?.external && !companion && !reservation ||
          a && (!Number.isFinite(a.endsAt) || !a.location || this.resolved.has(a.id)))
        s.campActivity = null;
    }
  }
}
