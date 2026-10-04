// Player encounters use existing activities, clock and owned SocialMemory.
// Transient watching/sheets are never saved; received evidence is semantic.
import { eligibleCampMember, isCampPhysicallyPresent } from '../locations/CampPresence.js';
import { physicalCampLocation } from '../locations/LocationUtils.js';
import { ISLAND_LOCATION_GRAPH } from './NpcLocationSystem.js';
import { routeBetween } from './CampActivitySystem.js';
import { campGroups, playerPlace, sameId, visibleActivityLabel, placeName } from '../ui/CampPresentation.js';
const clamp = n => Math.max(0, Math.min(1, n));
export const APPROACH_SECONDS = 45;
export function overhearingChance({ privacy = 'private', awareness = 5, occupied = false, near = false, location } = {}) {
  const noise = ['campfire', 'rockyShore'].includes(location) ? .12 : 0;
  return Math.max(.05, Math.min(.8, (privacy === 'public' ? .55 : .16) + clamp(awareness / 10) * .18 +
    (near ? .16 : 0) - (occupied ? .18 : 0) - noise));
}
export default class CampInteractionSystem {
  constructor(gm, { getView = () => globalThis.window?.campScreen?.currentView,
    navigate = view => globalThis.window?.campScreen?.loadView?.(view, { travelPaid: true }), random = Math.random } = {}) {
    this.gm = gm; this.getView = getView; this.navigate = navigate; this.random = random; this.watching = null;
  }
  get memory() { return this.gm.systems?.socialMemorySystem; }
  get player() { return this.gm.getPlayerSurvivor?.(); }
  get place() { return playerPlace(this.gm, this.getView()); }
  get living() { return this.gm.systems?.campActivitySystem; }
  get available() { return this.gm.gameState === 'camp' && this.living?.active && !this.gm.flags?.campEventActive && this.gm.dayTimer > 0 && this.place !== 'treeMail'; }
  person(id) { return this.living?.members?.().find(p => sameId(id, p.id)); }
  visible(id) { return this.available && eligibleCampMember(this.gm, this.person(id)) &&
    isCampPhysicallyPresent(this.player, this.gm.systems.npcLocationSystem, this.place, this.gm) &&
    isCampPhysicallyPresent(this.person(id), this.gm.systems.npcLocationSystem, this.place, this.gm); }
  observe({ id, actorId, type, location = this.place, participantIds = [], subjectId = null, detail = '', witnessOnly = false }) {
    return this.memory?.recordCampObservation?.({ id, actorId, participantIds, witnessIds: [this.player.id],
      type, location, subjectId, day: this.gm.day, campTime: this.gm.dayTimer, visibility: 'visible', detail, witnessOnly });
  }
  seeGroups(view = this.getView()) {
    const groups = campGroups(this.gm, view);
    if (!isCampPhysicallyPresent(this.player, this.gm.systems.npcLocationSystem, playerPlace(this.gm, view), this.gm)) return [];
    for (const group of groups) {
      const actor = this.person(group.members[0].id), a = actor?.campActivity;
      if (!a?.id || !this.available) continue;
      if (group.engaged) this.observe({ id: a.socialPurpose ? `${a.id}:company` : a.id, actorId: actor.id, type: 'seen_together',
        location: group.location, participantIds: group.members.slice(1).map(p => p.id) });
      else if (group.members[0].helpView) this.observe({ id: a.id, actorId: actor.id,
        type: 'work', location: group.location });
    }
    return groups;
  }
  // Called only after an actual resolved exchange. claimId refers to the
  // statement just received by its participant, never a hidden intention.
  hearExchange({ speaker, listener, activity, claimId, observationId, random = this.random }) {
    if (!this.available || !isCampPhysicallyPresent(this.player, this.gm.systems.npcLocationSystem, activity.location, this.gm) ||
      !isCampPhysicallyPresent(speaker, this.gm.systems.npcLocationSystem, activity.location, this.gm) ||
      !isCampPhysicallyPresent(listener, this.gm.systems.npcLocationSystem, activity.location, this.gm) || this.place !== physicalCampLocation(activity.location) ||
      sameId(this.player.id, speaker.id) || sameId(this.player.id, listener.id)) return null;
    const id = `${activity.id}:heard:${this.player.id}`;
    if (this.memory.getCampObservations(this.player.id).some(e => e.id === id)) return null;
    const privacy = activity.privacy === 'private' || activity.socialPurpose === 'strategy' ? 'private' : 'public';
    const near = this.watching?.activityId === activity.id;
    const occupied = physicalCampLocation(this.getView()) !== this.getView() ||
      this.player.campActivity && !['observe', 'watch'].includes(this.player.campActivity.type);
    const chance = overhearingChance({ privacy, awareness: this.player.awareness ?? 5, occupied: Boolean(occupied), near, location: this.place });
    const roll = random();
    // Record the attempt even when inaudible so reload/re-render cannot reroll.
    this.observe({ id, actorId: this.player.id, type: 'listened', detail: '' });
    if (roll >= chance || !claimId && !observationId) return null;
    const claim = claimId && this.memory.getCampClaims(listener.id).find(e => e.id === claimId);
    const observation = observationId && this.memory.getCampObservations(listener.id).find(e => e.id === observationId);
    const subjectId = claim?.subjectId ?? observation?.actorId;
    if (subjectId == null) return null;
    // Complete statements require close, relatively open conversation. A
    // guarded conversation normally yields a name, not its strategic content.
    if (claim && near && privacy === 'public' && !occupied && roll < chance * .45) {
      this.memory.overhearCampClaim({ ownerId: this.player.id, listenerId: listener.id,
        speakerId: speaker.id, claimId, confidence: .65 });
      this.observe({ id: `${id}:statement`, actorId: speaker.id, type: 'overheard_statement', subjectId, witnessOnly: true });
      const text = this.statementText(speaker, claim);
      if (near) this.watching.text = text;
      return text;
    }
    const type = roll < chance * .75 ? 'overheard_name' : 'overheard_fragment';
    this.observe({ id: `${id}:fragment`, actorId: speaker.id, type, subjectId: type === 'overheard_name' ? subjectId : null, witnessOnly: true });
    const text = type === 'overheard_name' ? `You hear ${speaker.firstName} mention ${this.person(subjectId)?.firstName || 'someone'}.` :
      'You catch a name, but miss the rest of the conversation.';
    if (near) this.watching.text = text;
    return text;
  }
  statementText(speaker, claim) {
    const subject = this.person(claim.subjectId)?.firstName || 'someone';
    if (claim.topic === 'idol_suspicion') return `${speaker.firstName} says ${subject} ${['unlikely', 'denied', 'no'].includes(claim.stance) ? 'may not be looking for anything' : 'may be looking for something'}.`;
    if (claim.topic === 'target') return `${speaker.firstName} brings up ${subject} ${['denied', 'no'].includes(claim.stance) ? 'and dismisses their name' : 'as someone to watch after the challenge'}.`;
    if (claim.topic === 'idol_possession') return `${speaker.firstName} says ${subject} has an idol.`;
    return `${speaker.firstName} mentions ${subject} in the conversation.`;
  }
  currentGroup(group) { return campGroups(this.gm, this.getView()).some(current => current.id === group?.id && current.activityId === group?.activityId); }
  watch(group) {
    if (!this.available || !group?.social || !this.currentGroup(group) || !group.members.every(p => this.visible(p.id))) return { text: 'They have moved on.' };
    const id = `${group.activityId}:watch:${this.player.id}`;
    if (this.memory.getCampObservations(this.player.id).some(e => e.id === id)) return { text: 'You have already lingered here. You could approach them.' };
    this.observe({ id, actorId: this.player.id, type: 'watched' });
    this.watching = { activityId: group.activityId };
    let heard;
    try {
      this.gm.consumeCampTime(60, { source: 'camp_watch', activityType: 'watch', locationKey: this.place });
      heard = this.watching.text;
    } finally { this.watching = null; }
    return { text: heard || (group.privacy === 'private' ? 'You linger nearby for a minute. They keep their voices low.' : 'You hang around for a minute, but can’t make out much.') };
  }
  approach(group) {
    if (!this.available || !this.currentGroup(group) || !group?.members.every(p => this.visible(p.id))) return { text: 'They have moved on.', join: false };
    const lead = this.person(group.members[0].id);
    if (group.members.some(p => p.busy)) return { text: 'They are in the middle of another conversation.', join: false };
    const id = `${group.activityId}:approach:${this.player.id}`;
    if (this.memory.getCampObservations(this.player.id).some(e => e.id === id) || lead.campActivity?.approachedByIds?.some(playerId => sameId(playerId, this.player.id)))
      return { text: 'You are already close enough to join them.', join: true, context: this.joinContext(group) };
    // Walking is a player block, not work at the well/shelter. Revalidate the
    // exact shared activity after everyone else has had time to continue.
    this.observe({ id, actorId: this.player.id, type: 'approached', witnessOnly: true });
    this.gm.consumeCampTime(APPROACH_SECONDS, { source: 'camp_approach', activityType: 'approach', locationKey: this.place });
    if (!this.available || !this.currentGroup(group) || !group.members.every(p => this.visible(p.id)))
      return { text: 'You walk over, but they have already moved on.', join: false, movedOn: true };
    for (const member of group.members) {
      const activity = this.person(member.id)?.campActivity;
      if (activity?.id === group.activityId) activity.approachedByIds = [...new Set([...(activity.approachedByIds || []), this.player.id])];
    }
    const trust = group.members.reduce((n, p) => n + (this.gm.getTrust?.(p.id, this.player.id) ?? 50), 0) / group.members.length;
    const relationship = group.members.reduce((n, p) => n + (this.gm.systems.relationshipSystem?.getRelationship?.(p.id, this.player.id)?.value ?? 50), 0) / group.members.length;
    const welcomed = group.privacy === 'public' || this.random() < Math.max(.12, Math.min(.75, (trust + relationship) / 200 - .15));
    if (!welcomed) {
      this.observe({ id: `${id}:guarded`, actorId: lead.id, type: 'conversation_guarded', participantIds: group.members.slice(1).map(p => p.id), witnessOnly: true });
      // Interrupt the shared block once; no invented social outcome/reward.
      this.living.interrupt(lead, 'player_approach');
      for (const person of group.members.map(p => this.person(p.id)))
        if (person && !person.campActivity) this.living.start(person, { type: 'idle_at_camp', location: group.location, duration: 90 });
      const companion = group.members.length === 2 && this.person(group.members[1].id);
      const quieter = (ISLAND_LOCATION_GRAPH[group.location] || []).find(place =>
        !this.living.members().some(person => isCampPhysicallyPresent(person, this.gm.systems.npcLocationSystem, place, this.gm)));
      if (companion && quieter && this.random() < .25 && this.living.moveTogether(lead, companion, quieter))
        return { text: 'They go quiet, then head down the path together.', join: false, guarded: true, relocated: true };
      return { text: 'Their conversation trails off as you get closer.', join: false, guarded: true };
    }
    return { text: `You walk over. ${lead.firstName} makes room for you.`, join: true, context: this.joinContext(group) };
  }
  joinContext(group) { return { location: group.location,
      groupParticipantIds: group.members.map(p => p.id), groupWelcomed: true, interruptedGroup: true,
      observedPrivacy: group.privacy };
  }
  join(group, context) {
    if (!this.available || !this.currentGroup(group) || !group.members.every(p => this.visible(p.id))) return false;
    // The existing dialogue remains one speaker at a time. Other members stay
    // physically reserved, preventing unrelated work while the player joins.
    const npc = this.person(group.members[0].id);
    this.gm.systems.conversationSystem?.startPlayerConversation?.({ npcId: npc.id, phase: this.gm.gamePhase === 'postChallenge' ? 'post' : 'pre', context });
    this.living.reserveConversationGroup?.(group.members.slice(1).map(p => p.id));
    return true;
  }
  recentDepartures() {
    const owned = this.memory?.getCampObservations?.(this.player?.id, { day: this.gm.day }) || [];
    for (const e of owned.filter(e => e.type === 'departed' && e.origin === 'witness')) {
      if (!this.available || this.place !== e.fromLocation || !eligibleCampMember(this.gm, this.person(e.actorId)) ||
          isCampPhysicallyPresent(this.person(e.actorId), this.gm.systems.npcLocationSystem, e.fromLocation, this.gm) || e.campTime - this.gm.dayTimer > 180)
        e.followMissed = true;
    }
    if (!this.available) return [];
    return owned.filter(e =>
      e.type === 'departed' && e.origin === 'witness' && e.campTime - this.gm.dayTimer <= 180 &&
      !e.followMissed && this.place === e.fromLocation &&
      e.campTime >= this.gm.dayTimer && !this.memory.getCampObservations(this.player.id).some(known => known.id === `${e.id}:follow:${this.player.id}`) && eligibleCampMember(this.gm, this.person(e.actorId)) &&
      !this.visible(e.actorId)).slice(-2);
  }
  leaveLocation(from, to) {
    if (from === to) return;
    for (const e of this.memory?.getCampObservations?.(this.player?.id, { day: this.gm.day }) || [])
      if (e.type === 'departed' && e.origin === 'witness' && e.fromLocation === from) e.followMissed = true;
  }
  missDepartures() {
    for (const e of this.memory?.getCampObservations?.(this.player?.id, { day: this.gm.day }) || [])
      if (e.type === 'departed' && e.origin === 'witness') e.followMissed = true;
  }
  targetMoved(id, location) {
    for (const e of this.memory?.getCampObservations?.(this.player?.id, { day: this.gm.day }) || [])
      if (e.type === 'departed' && sameId(e.actorId, id) && e.fromLocation === location) e.followMissed = true;
  }
  follow(entry) {
    if (!this.recentDepartures().some(e => e.id === entry?.id)) return { text: 'You have lost their trail.' };
    const id = `${entry.id}:follow:${this.player.id}`;
    if (this.memory.getCampObservations(this.player.id).some(e => e.id === id)) return { text: 'They have already moved on.' };
    const target = this.person(entry.actorId);
    this.observe({ id, actorId: this.player.id, type: 'followed', location: entry.location });
    // The timed following block is in transit, so events resolving during
    // the walk cannot become destination evidence. Navigate once time is paid.
    this.gm.consumeCampTime(120, { source: 'camp_follow', activityType: 'follow', locationKey: entry.location });
    if (!this.available) return { text: 'You lose sight of them.' };
    this.navigate(entry.location);
    if (!eligibleCampMember(this.gm, target) || !isCampPhysicallyPresent(target, this.gm.systems.npcLocationSystem, target.location, this.gm)) return { text: 'You lose sight of them.' };
    const location = this.gm.systems.npcLocationSystem.getLocation(target.id);
    if (!location || (location !== entry.location && (!routeBetween(entry.location, location).length || routeBetween(entry.location, location).length > 2)) || this.random() > .55 + clamp((this.player.awareness ?? 5) / 10) * .25)
      return { text: `You lose sight of ${target.firstName} beyond ${placeName(entry.location)}.` };
    if (location !== entry.location) this.navigate(location);
    const caughtId = `${id}:caught`;
    if (this.random() < .15 + clamp((target.awareness ?? 5) / 10) * .25) {
      this.memory.recordCampObservation({ id: caughtId, actorId: this.player.id, witnessIds: [target.id], type: 'player_following',
        location, subjectId: target.id, day: this.gm.day, campTime: this.gm.dayTimer, detail: 'was noticed following' });
      this.gm.systems.relationshipSystem?.changeRelationship?.(target.id, this.player.id, -1);
      this.gm.systems.trustSystem?.changeTrust?.(target.id, this.player.id, -1, 'caught_following');
      this.observe({ id: `${caughtId}:owned`, actorId: target.id, type: 'caught_following', location, witnessOnly: true });
      return { text: `${target.firstName} turns around. “You following me?”`, caught: true };
    }
    const a = target.campActivity;
    if (a?.type === 'idol_hunt') {
      this.observe({ id: `${id}:search`, actorId: target.id, type: 'idol_search_seen', location, witnessOnly: true });
      this.memory.recordCampClaim({ id: `${id}:evidence`, speakerId: this.player.id, subjectId: target.id,
        topic: 'idol_suspicion', stance: 'searching', origin: 'firsthand', confidence: .9, salience: 'high',
        day: this.gm.day, campTime: this.gm.dayTimer });
      return { text: `${target.firstName} steps off the trail and searches through the brush.` };
    }
    this.observe({ id: `${id}:seen`, actorId: target.id, type: a?.type && ['socialize', 'strategy_conversation'].includes(a.type) ? 'seen_together' : 'noticed',
      location, participantIds: a?.participantIds || [], witnessOnly: true });
    return { text: `${target.firstName} is ${visibleActivityLabel(a).toLowerCase()}.` };
  }
}
