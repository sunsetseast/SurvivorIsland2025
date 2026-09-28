import { LocationKeys } from '../core/LocationKeys.js';
import { ISLAND_LOCATION_GRAPH } from './NpcLocationSystem.js';
import { MAX_FIRE_LEVEL, MAX_SHELTER_LEVEL, isNeededCampContribution, syncCampResources } from './CampState.js';

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
const VIEW_LOCATION = {
  [LocationKeys.FIREWOOD]: LocationKeys.JUNGLE_TRAIL,
  [LocationKeys.BAMBOO]: LocationKeys.JUNGLE_TRAIL,
  [LocationKeys.SHAKE]: LocationKeys.BEACH,
  [LocationKeys.FISHING]: LocationKeys.ROCKY_SHORE,
  [LocationKeys.FIRE]: LocationKeys.CAMPFIRE
};
const VIEW_WORK = {
  [LocationKeys.FIREWOOD]: 'gather_firewood', [LocationKeys.BAMBOO]: 'gather_bamboo',
  [LocationKeys.SHAKE]: 'gather_food', [LocationKeys.FISHING]: 'fish',
  [LocationKeys.FIRE]: 'build_fire', [LocationKeys.SHELTER]: 'build_shelter',
  [LocationKeys.WATER_WELL]: 'collect_water'
};
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const same = (a, b) => a != null && b != null && String(a) === String(b);
export const physicalCampLocation = view => VIEW_LOCATION[view] || (ISLAND_LOCATION_GRAPH[view] ? view : null);
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
  get phase() { return `${this.gm.day || 1}:preChallenge`; }
  get active() { return this.gm.gamePhase === 'preChallenge' && this.phaseId === this.phase; }
  absent(s) {
    const absent = this.gm.flags?.absentFromCampIds;
    return !s || s.isOut || (absent instanceof Set ? [...absent].some(id => same(id, s.id)) :
      (absent || []).some?.(id => same(id, s.id)));
  }
  members() { return (this.tribe?.members || []).filter(s => !this.absent(s)); }
  npcs() { return this.members().filter(s => !s.isPlayer); }
  roleOf(s) {
    const assignments = this.gm.systems?.taskSimulationSystem?.getAssignmentsFromPlanOrTasks?.(this.gm, this.tribe) || {};
    return Object.keys(assignments).find(role => assignments[role]?.some(id => same(id, s.id))) || null;
  }
  ensureStarted(now = this.gm.dayTimer) {
    if (this.gm.gamePhase !== 'preChallenge' || (this.gm.gameState && this.gm.gameState !== 'camp') ||
      this.gm.flags?.campEventActive || !this.tribe) return false;
    if (!this.active) {
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
    for (const npc of this.npcs()) if (!npc.campActivity) this.chooseNext(npc, now);
    return true;
  }
  scoreChoices(npc) {
    const tribe = this.tribe, supply = tribe.stockpile || {}, role = this.roleOf(npc);
    const traits = (npc.personalityTraits || []).map(t => String(t).toLowerCase());
    const ethic = clamp((npc.workEthic ?? 50) / 100, 0, 1);
    const urgent = this.memory?.getNpcConversationIntents?.(npc.id, { day: this.gm.day, limit: 4 })?.length || 0;
    const allies = this.npcs().filter(s => !same(s.id, npc.id)).map(s => ({ s,
      score: (this.gm.getTrust?.(npc.id, s.id) ?? 50) +
        (this.gm.systems?.allianceSystem?.areAllied?.(npc.id, s.id) ? 25 : 0) })).sort((a, b) => b.score - a.score);
    const ally = allies[0]?.s;
    const need = {
      gather_firewood: isNeededCampContribution(tribe, 'firewood'),
      gather_bamboo: isNeededCampContribution(tribe, 'bamboo'),
      gather_food: isNeededCampContribution(tribe, 'coconuts'),
      collect_water: isNeededCampContribution(tribe, 'water'),
      fish: isNeededCampContribution(tribe, 'fish1'),
      build_fire: (tribe.fire || 0) < MAX_FIRE_LEVEL && supply.firewood >= 10,
      build_shelter: (tribe.shelter || 0) < MAX_SHELTER_LEVEL && supply.bamboo >= 5 && supply.palms >= 1,
      tend_fire: (tribe.fire || 0) > 0 && (tribe.fire || 0) < MAX_FIRE_LEVEL
    };
    const choices = Object.entries(WORK).map(([type, rule]) => ({ type, location: rule.location,
      weight: ['build_fire', 'build_shelter'].includes(type) && !need[type] ? 0 :
        (0.2 + (need[type] ? 2.2 : 0) + (role === rule.role || role === 'float' && need[type] ? 1.4 : 0)) * (0.65 + ethic) }));
    choices.push({ type: 'rest', location: this.locations?.getLocation?.(npc.id) || LocationKeys.SHELTER,
      weight: 0.5 + (1 - clamp((npc.rest ?? 75) / 100, 0, 1)) * 5 });
    choices.push({ type: 'socialize', location: ally ? this.locations?.getLocation?.(ally.id) : LocationKeys.BEACH,
      targetId: ally?.id, weight: ally ? 0.7 + allies[0].score / 100 * 1.4 + (traits.includes('social') ? 0.8 : 0) : 0 });
    choices.push({ type: 'strategy_conversation', location: ally ? this.locations?.getLocation?.(ally.id) : LocationKeys.SHELTER,
      targetId: ally?.id, weight: ally ? 0.2 + Math.min(3, urgent * 1.4) : 0 });
    choices.push({ type: 'idol_hunt', location: LocationKeys.JUNGLE_TRAIL,
      weight: this.gm.gameSettings?.enableIdols === false ? 0 : traits.includes('idol_hunter') ? 0.95 : 0.12 });
    choices.push({ type: 'observe', location: this.locations?.getLocation?.(npc.id) || LocationKeys.BEACH,
      weight: traits.includes('paranoid') ? 0.9 : 0.25 });
    const suspect = allies.map(({ s }) => ({ s, count: this.memory?.getCampImpression?.(npc.id, s.id, 'absence')?.count || 0 }))
      .sort((a, b) => b.count - a.count)[0];
    if (suspect?.count >= 2) choices.push({ type: 'investigate', location: this.locations?.getLocation?.(suspect.s.id),
      targetId: suspect.s.id, weight: 0.4 + Math.min(1, suspect.count * 0.2) });
    choices.push({ type: 'idle_at_camp', location: LocationKeys.BEACH, weight: 0.35 });
    return choices.filter(c => c.location && c.weight > 0);
  }
  chooseNext(npc, now) {
    if (this.absent(npc) || npc.isPlayer) return null;
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
    if (actor.campActivity) this.interrupt(actor, 'new_priority', now);
    const duration = plan.duration || (plan.type === 'travel' ? 45 : WORK[plan.type]?.duration ||
      (plan.type === 'idol_hunt' ? 510 : plan.type === 'rest' ? 360 : 240));
    const activity = { id: `${this.phase}:${this.nextId++}`, actorId: actor.id, type: plan.type,
      location: plan.location, startedAt: now, endsAt: Math.max(0, now - duration), duration,
      role: this.roleOf(actor), targetId: plan.targetId || null, route: plan.route || null,
      goal: plan.goal || null, privacy: ['strategy_conversation', 'idol_hunt'].includes(plan.type) ? 'private' : 'visible',
      interruptible: !['private_conversation', 'strategy_conversation_player'].includes(plan.type),
      external: Boolean(plan.external) };
    actor.campActivity = activity;
    if (!actor.isPlayer) this.locations?.updateNpcLocation?.(actor.id, plan.location, { reason: `activity:${plan.type}` });
    if (['socialize', 'strategy_conversation'].includes(plan.type) && plan.targetId) {
      const target = this.npcs().find(s => same(s.id, plan.targetId));
      const available = !target?.campActivity || ['rest', 'idle_at_camp', 'observe'].includes(target.campActivity.type);
      if (target && available && this.locations?.getLocation?.(target.id) === plan.location) {
        this.interrupt(target, 'conversation', now);
        target.campActivity = { ...activity, actorId: target.id, targetId: actor.id, external: true };
        activity.participantIds = [target.id];
      }
    }
    return activity;
  }
  interrupt(actor, reason = 'interrupted', at = this.gm.dayTimer) {
    const activity = actor?.campActivity;
    if (!activity || !activity.interruptible) return false;
    actor.campActivity = null; this.resolved.add(activity.id);
    if (WORK[activity.type]) this.effort[actor.id] = (this.effort[actor.id] || 0) + Math.max(0, activity.startedAt - at);
    return true;
  }
  advance(before, after, elapsed = () => {}) {
    if (!this.ensureStarted(before)) { elapsed(before - after); return; }
    for (const npc of this.npcs()) {
      const current = npc.campActivity;
      if (!WORK[current?.type] || current.startedAt - before < 90) continue;
      const urgent = this.memory?.getNpcConversationIntents?.(npc.id, { day: this.gm.day, limit: 3 })?.filter(i =>
        ['warning', 'targeting', 'vote_pitch', 'alliance_pitch'].includes(i.intent) &&
        Number.isFinite(i.campTime) && i.campTime <= current.startedAt &&
        i.campTime < (this.lastUrgentTime[npc.id] ?? Infinity)) || [];
      if (!urgent.length || this.random() >= 0.7) continue;
      this.lastUrgentTime[npc.id] = urgent.at(-1).campTime;
      this.interrupt(npc, 'urgent_information', before);
      const ally = this.npcs().find(s => !same(s.id, npc.id) && this.gm.systems?.allianceSystem?.areAllied?.(npc.id, s.id));
      if (ally) {
        const location = this.locations?.getLocation?.(ally.id), route = routeBetween(this.locations?.getLocation?.(npc.id), location);
        const goal = { type: 'strategy_conversation', location, targetId: ally.id };
        this.start(npc, route.length ? { type: 'travel', location: route[0], route: route.slice(1), goal } : goal, before);
      } else this.chooseNext(npc, before);
    }
    let cursor = before, guard = 0;
    while (cursor > after && guard++ < 3000) {
      const due = this.npcs().map(s => s.campActivity).filter(a => a && !a.external && a.endsAt < cursor && a.endsAt >= after);
      if (!due.length) break;
      const boundary = Math.max(...due.map(a => a.endsAt));
      elapsed(cursor - boundary); cursor = boundary; this.gm.dayTimer = boundary;
      for (const npc of this.npcs()) if (npc.campActivity?.endsAt === boundary && !npc.campActivity.external) {
        const current = npc.campActivity;
        this.complete(npc, current, boundary);
        if (boundary > 0 && !npc.campActivity && !this.gm.flags?.campEventActive) this.chooseNext(npc, boundary);
      }
    }
    elapsed(cursor - after); this.gm.dayTimer = after; this.ingestNewCampLog();
  }
  complete(actor, activity = actor?.campActivity, at = this.gm.dayTimer) {
    if (!activity || this.resolved.has(activity.id) || !same(actor?.campActivity?.id, activity.id)) return false;
    this.resolved.add(activity.id); actor.campActivity = null;
    const companion = activity.participantIds?.length && this.npcs().find(s => same(s.id, activity.participantIds[0]));
    if (companion?.campActivity?.id === activity.id) {
      companion.campActivity = null;
    }
    if (activity.type === 'travel') {
      if (activity.route?.length) this.start(actor, { type: 'travel', location: activity.route[0], route: activity.route.slice(1), goal: activity.goal }, at);
      else if (activity.goal) this.start(actor, activity.goal, at);
    } else if (activity.external) { /* The owning minigame records its own outcome. */ }
    else if (WORK[activity.type]) {
      this.effort[actor.id] = (this.effort[actor.id] || 0) + activity.duration;
      this.resolveWork(actor, activity, at);
    } else if (activity.type === 'rest') actor.rest = clamp((actor.rest ?? 50) + 2, 0, 100);
    else if (activity.type === 'idol_hunt') {
      this.gm.systems?.idolSystem?.attemptIntentionalHunt?.(actor.id, activity.location, 'casual', { isNpc: true });
      this.observe({ actor, type: 'absence', location: activity.location, activityId: activity.id,
        at, witnessIds: this.departureWitnesses(actor.id, activity.startedAt), visibility: 'movement', detail: 'was seen away from camp' });
    } else if (['socialize', 'strategy_conversation'].includes(activity.type)) {
      const target = this.members().find(s => same(s.id, activity.targetId));
      if (target && activity.participantIds?.some(id => same(id, target.id)) &&
        this.locations?.getLocation?.(target.id) === activity.location) {
        this.observe({ actor, type: 'seen_together', location: activity.location, participants: [target.id],
          activityId: activity.id, at, visibility: 'private', detail: `${actor.firstName} spent time with ${target.firstName}` });
        this.gm.systems?.relationshipSystem?.changeRelationship?.(actor.id, target.id, 1);
      }
    }
    if (companion && !companion.campActivity && at > 0) this.chooseNext(companion, at);
    return true;
  }
  resolveWork(actor, activity, at) {
    const tribe = this.tribe, rule = WORK[activity.type];
    const stock = this.gm.ensureStockpileExists?.(tribe) || tribe.stockpile;
    const skill = clamp(((actor.workEthic ?? 50) + (actor.survivalSkill ?? 50)) / 200, 0, 1);
    const needed = rule.resource ? isNeededCampContribution(tribe, rule.resource) :
      (activity.type.includes('fire') ? (tribe.fire || 0) < MAX_FIRE_LEVEL : (tribe.shelter || 0) < MAX_SHELTER_LEVEL);
    let amount = 0;
    if (rule.resource) {
      amount = Math.max(1, Math.round(1 + skill * 2 + this.random() * 2)) + (rule.resource === 'water' ? 2 : 0);
      this.gm.addToStockpile?.(tribe, rule.resource, amount);
      this.gm.campLog.push({ type: rule.resource === 'coconuts' || rule.resource.startsWith('fish') ? 'camp_contribute_food' : 'camp_contribute',
        id: activity.id, activityId: activity.id, actorId: actor.id, role: activity.role,
        resource: rule.resource, resources: { [rule.resource]: amount }, amount, day: this.gm.day,
        campTime: at, source: 'camp_activity' });
    } else {
      const fire = activity.type.includes('fire'), key = fire ? 'fire' : 'shelter';
      const cost = fire ? { firewood: activity.type === 'tend_fire' ? 4 : 10 } : { bamboo: 5, palms: 1 };
      const max = fire ? MAX_FIRE_LEVEL : MAX_SHELTER_LEVEL;
      if ((tribe[key] || 0) < max && Object.entries(cost).every(([res, n]) => stock[res] >= n)) {
        for (const [res, n] of Object.entries(cost)) this.gm.consumeFromStockpile(tribe, res, n);
        const before = tribe[key] || 0;
        if (this.random() < 0.65 + skill * 0.23) tribe[key] = Math.min(max, before + 1);
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
    this.departures[actor.id] = { at, witnessIds: this.npcs().filter(s => !same(s.id, actor.id) &&
      this.locations?.getLocation?.(s.id) === from).map(s => s.id) };
  }
  departureWitnesses(actorId, startedAt) {
    const entry = this.departures[actorId];
    return entry && entry.at >= startedAt && entry.at - startedAt <= 900 ? entry.witnessIds : null;
  }
  observe({ actor, type, location, participants = [], activityId, at, detail = '', visibility = 'visible', witnessIds = null }) {
    if (!actor || !location || !this.memory?.recordCampObservation) return [];
    const witnesses = this.members().filter(s => !same(s.id, actor.id) && !participants.some(id => same(id, s.id)) &&
      ((Array.isArray(witnessIds) && witnessIds.some(id => same(id, s.id))) ||
        (s.isPlayer ? physicalCampLocation(typeof window !== 'undefined' ? window.campScreen?.currentView : s.location) :
          this.locations?.getLocation?.(s.id)) === location)).map(s => s.id);
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
      (s.isPlayer ? physicalCampLocation(typeof window !== 'undefined' ? window.campScreen?.currentView : s.location) :
        this.locations?.getLocation?.(s.id)) === location);
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
    if (!this.active || !npc || !player || !place || this.conversation || this.gm.flags?.campEventActive ||
      this.locations?.getLocation?.(npc.id) !== place || npc.campActivity?.interruptible === false) return false;
    const prior = npc.campActivity && WORK[npc.campActivity.type] ? { type: npc.campActivity.type,
      location: place, duration: Math.max(120, this.gm.dayTimer - npc.campActivity.endsAt) } : null;
    this.interrupt(npc, 'conversation');
    const activity = this.start(npc, { type: strategy ? 'strategy_conversation_player' : 'private_conversation',
      location: place, external: true });
    if (!activity) return false;
    activity.interruptible = false; activity.endsAt = 0;
    player.campActivity = { ...activity, actorId: player.id, participantIds: [npc.id] };
    this.conversation = { npcId: npc.id, activityId: activity.id, location: place, strategy, prior };
    return true;
  }
  approachPlayer(npc, location) {
    if (!this.active) this.ensureStarted();
    const place = physicalCampLocation(location) || location, from = this.locations?.getLocation?.(npc?.id);
    const route = routeBetween(from, place);
    if (!this.active || !npc || this.absent(npc) || !place || from !== place && !route.length ||
      npc.campActivity?.interruptible === false) return false;
    this.interrupt(npc, 'approach');
    for (const step of route) {
      const activity = this.start(npc, { type: 'travel', location: step, external: true });
      this.gm.consumeCampTime(45, { source: 'npc_approach_travel' });
      this.complete(npc, activity);
    }
    return true;
  }
  finishConversation({ turns = 0, strategy = false } = {}) {
    if (!this.conversation) return false;
    const current = this.conversation; this.conversation = null;
    const npc = this.members().find(s => same(s.id, current.npcId)), player = this.gm.getPlayerSurvivor?.();
    const seconds = clamp((strategy || current.strategy ? 180 : 90) + Math.max(0, turns) * 30, 90, 420);
    this.gm.consumeCampTime(seconds, { source: 'camp_conversation' });
    if (npc?.campActivity?.id === current.activityId) npc.campActivity = null;
    if (player?.campActivity?.id === current.activityId) player.campActivity = null;
    this.resolved.add(current.activityId);
    if (npc && player) this.observe({ actor: player, type: 'seen_together', participants: [npc.id],
      location: current.location, activityId: current.activityId, at: this.gm.dayTimer,
      visibility: 'movement', detail: `You spent time talking with ${npc.firstName}` });
    if (npc && this.gm.dayTimer > 0) {
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
    const activity = this.start(player, { type: payload.source === 'player_idol_hunt' ? 'idol_hunt' : VIEW_WORK[view] || 'observe',
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
  finalize() {
    if (!this.active) return;
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
    lastLogIndex: this.lastLogIndex, departures: this.departures, lastUrgentTime: this.lastUrgentTime }; }
  deserialize(p) {
    this.phaseId = p?.phaseId || null; this.nextId = Number.isInteger(p?.nextId) ? p.nextId : 1;
    this.resolved = new Set(p?.resolved || []); this.reputationEvents = new Set(p?.reputationEvents || []);
    this.effort = p?.effort || {}; this.initialNeeds = p?.initialNeeds || {};
    this.lastLogIndex = Math.min(this.gm.campLog?.length || 0, Math.max(0, p?.lastLogIndex || 0));
    this.departures = p?.departures || {}; this.lastUrgentTime = p?.lastUrgentTime || {};
    this.conversation = null;
    for (const s of this.tribe?.members || []) {
      const a = s.campActivity;
      const companion = a?.external && ['socialize', 'strategy_conversation'].includes(a.type) &&
        this.npcs().some(owner => owner.campActivity?.id === a.id && !owner.campActivity.external &&
          owner.campActivity.participantIds?.some(id => same(id, s.id)));
      if (this.absent(s) || a?.external && !companion ||
          a && (!Number.isFinite(a.endsAt) || !a.location || this.resolved.has(a.id)))
        s.campActivity = null;
    }
  }
}
