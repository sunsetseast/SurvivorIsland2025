import { LocationKeys } from '../core/LocationKeys.js';
import { routeBetween } from './CampActivitySystem.js';
import { eligibleCampMember, isCampPhysicallyPresent } from '../locations/CampPresence.js';

export { ScrambleState, SCRAMBLE_SECONDS, scrambleConversationSeconds } from './ScrambleTime.js';
import { ScrambleState } from './ScrambleTime.js';
const same = (a, b) => a != null && b != null && String(a) === String(b);

// Plans and resolves strategy INSIDE CampActivitySystem. Movement, occupancy,
// arrivals, clock advancement, and observations remain owned by that system.
export default class ScrambleActivityPlan {
  constructor(gm, strategy, payload = {}) {
    this.gm = gm; this.strategy = strategy;
    this.rngState = payload.rngState ?? (Math.random() * 4294967296) >>> 0;
    this.meetings = payload.meetings || [];
    this.invitation = payload.invitation || null;
    this.nextApproachAt = payload.nextApproachAt ?? 3300;
    this.history = payload.history || [];
  }
  random() {
    this.rngState = (Math.imul(1664525, this.rngState) + 1013904223) >>> 0;
    return this.rngState / 4294967296;
  }
  get camp() { return this.gm.systems.campActivitySystem; }
  get members() { return (this.gm.getPlayerTribe?.()?.members || []).filter(s => eligibleCampMember(this.gm, s)); }
  person(id) { return this.members.find(s => same(s.id, id)); }
  present(s, location) { return isCampPhysicallyPresent(s, this.gm.systems.npcLocationSystem, location, this.gm); }
  free(s) { return s && !s.isPlayer && (!s.campActivity || ['rest', 'idle_at_camp', 'observe'].includes(s.campActivity.type)); }
  note(type, detail = {}) {
    this.history.push({ type, campTime: this.gm.dayTimer, ...detail });
    if (this.history.length > 400) this.history.shift();
  }
  scheduleAlliances() {
    if(this.gm.dayTimer<=780)return;
    const alliances = this.gm.systems.allianceSystem?.getAllAlliances?.() ||
      this.gm.systems.allianceSystem?.getAlliancesForSurvivor?.(this.gm.player?.id) || [];
    for (const alliance of alliances) {
      const need=this.gm.systems.allianceSystem?.getMeetingNeed?.(alliance.id);
      if (alliance.active === false || !need) continue;
      const key = this.strategy.getAllianceKey(alliance);
      const ids = (need.memberIds || []).map(s => s?.id ?? s)
        .filter(id => this.person(id));
      if (key == null || ids.filter(id => !this.person(id)?.isPlayer).length < 2 ||
        this.meetings.some(m => same(m.allianceId, key))) continue;
      const dueAt=Math.min(this.gm.dayTimer-60,3300-this.meetings.length*180);
      if(dueAt<=780)continue;
      const spots = [LocationKeys.WATER_WELL, LocationKeys.SHELTER, LocationKeys.CAMPFIRE];
      this.meetings.push({ id: `${this.camp.phase}:meeting:${key}`, allianceId: key, memberIds: ids,
        urgency: need.urgency, reason: need.reason, location: spots[Math.floor(this.random() * spots.length)], dueAt,
        status: 'pending' });
    }
  }
  plan(npc, now) {
    this.strategy.reasoning.react(npc.id);
    const other = this.strategy.reasoning.choosePartner(npc, this.members.filter(s => this.free(s)));
    if (other) {
      const agenda = this.strategy.reasoning.agenda(npc.id, other.id, { plan: true });
      return { type: 'strategy_conversation', location: this.gm.systems.npcLocationSystem.getLocation(other.id),
        targetId: other.id, duration: now<=300 && agenda.priority>=4 ? 120 : 240, purpose: agenda.purpose, agenda };
    }
    return { type: this.random() < .5 ? 'observe' : 'idle_at_camp',
      location: this.gm.systems.npcLocationSystem.getLocation(npc.id) || LocationKeys.BEACH, duration: 120 };
  }
  nextBoundary(cursor, after) {
    const times = this.meetings.flatMap(m => m.status === 'pending' ? [m.dueAt] : m.status === 'gathering' ? [m.deadline] : []);
    if (this.invitation) times.push(this.invitation.expiresAt);
    else times.push(this.nextApproachAt);
    return times.filter(t => t < cursor && t >= after);
  }
  onBoundary(now) {
    if (!this.strategy.isActive || this.strategy.playerTribeSafe || this.gm.flags?.campEventActive) return;
    this.scheduleAlliances();
    this.gm.systems.allianceSystem?.reactToOwnedEvidence?.();
    if (now <= 600) this.strategy.scrambleState = ScrambleState.FINAL;
    for (const meeting of this.meetings) {
      if (meeting.status === 'pending' && now <= meeting.dueAt) {
        const npcs = meeting.memberIds.map(id => this.person(id)).filter(s => s && !s.isPlayer);
        if (npcs.length < 2) { meeting.status = 'cancelled'; continue; }
        if (!npcs.some(s => this.free(s))) {
          meeting.dueAt = now - 60;
          if (meeting.dueAt <= 480) meeting.status = 'cancelled';
          continue;
        }
        // Hold members as they become free, rather than requiring a simultaneous
        // idle instant. Existing conversations finish before their participants travel.
        meeting.status = 'gathering'; meeting.deadline = now - 420;
        this.note('meeting_gathering', { meetingId: meeting.id });
      }
      if (meeting.status !== 'gathering') continue;
      const npcs = meeting.memberIds.map(id => this.person(id)).filter(s => s && !s.isPlayer && (this.gm.systems.allianceSystem?.chooseMeeting?.(s.id,this.meetings.filter(m => ['pending','gathering'].includes(m.status)))?.id === meeting.id));
      for (const npc of npcs.filter(s => this.free(s) && this.gm.systems.allianceSystem?.chooseMeeting?.(s.id,this.meetings.filter(m => ['pending','gathering'].includes(m.status)))?.id === meeting.id)) {
        const goal = { type: 'meeting_wait', location: meeting.location, meetingId: meeting.id,
          duration: Math.max(1, now - meeting.deadline) };
        const route = routeBetween(this.gm.systems.npcLocationSystem.getLocation(npc.id), meeting.location);
        this.camp.start(npc, route.length ? { type: 'travel', location: route[0], route: route.slice(1), goal } : goal, now);
        npc.campActivity.interruptible = false;
      }
      if (npcs.length >= 2 && npcs.every(s => s.campActivity?.meetingId === meeting.id && this.present(s, meeting.location))) {
        const [owner, ...others] = npcs;
        owner.campActivity = null;
        const activity = this.camp.start(owner, { type: 'alliance_meeting', location: meeting.location,
          duration: 360, meetingId: meeting.id, allianceId: meeting.allianceId, purpose:meeting.reason }, now);
        activity.interruptible = false; activity.participantIds = others.map(s => s.id);
        for (const other of others) other.campActivity = { ...activity, actorId: other.id, external: true };
        meeting.status = 'active'; meeting.activityId = activity.id;
        meeting.missedMemberIds=meeting.memberIds.filter(id=>!this.person(id)?.isPlayer&&!npcs.some(p=>same(p.id,id)));
        for(const id of meeting.missedMemberIds)this.gm.systems.allianceSystem?.count?.('missedMeetings');
        // Absence is diagnostic, not evidence identifying betrayal or another
        // loyalty. Actual witnesses/conversations can explain it later.
        this.note('meeting_started', { meetingId: meeting.id, participantIds: npcs.map(s => s.id) });
      } else if (now <= meeting.deadline) {
        meeting.status = 'cancelled'; this.releaseMeeting(meeting, now);
      }
    }
    if (this.invitation && (now <= this.invitation.expiresAt ||
      !this.present(this.person(this.invitation.npcId), this.gm.player?.location))) this.clearInvitation();
    if (!this.invitation && now <= this.nextApproachAt && now > 180 && !this.camp.conversation) {
      this.nextApproachAt = now - 600;
      const npc = this.members.filter(s => this.free(s)).map(npc => ({ npc, score: this.strategy.reasoning.candidateScore(npc.id, this.gm.player.id) }))
          .filter(x => Number.isFinite(x.score)).sort((a,b) => b.score-a.score)[0]?.npc;
      const player = this.gm.getPlayerSurvivor?.();
      if (npc && this.present(player, player.location)) {
        const agenda = this.strategy.reasoning.agenda(npc.id, player.id, { plan: true });
        const purpose = agenda.purpose;
        const goal = { type: 'approach_player', location: player.location, duration: 45, purpose, agenda };
        const route = routeBetween(this.gm.systems.npcLocationSystem.getLocation(npc.id), player.location);
        this.camp.start(npc, route.length ? { type: 'travel', location: route[0], route: route.slice(1), goal } : goal, now);
        npc.campActivity.interruptible = false;
        this.note('npc_approach', { actorId: npc.id, purpose });
      }
    }
  }
  resolve(actor, activity, at) {
    if (this.strategy.playerTribeSafe) return false;
    if (activity.type === 'meeting_wait') return true;
    if (activity.type === 'approach_player') {
      const player = this.gm.getPlayerSurvivor?.();
      if (this.present(player, activity.location)) {
        actor.campActivity = { ...activity, id: `${activity.id}:waiting`, type: 'approach_wait', endsAt: 0, external: true, interruptible: false };
        this.invitation = { npcId: actor.id, purpose: activity.purpose, agenda: activity.agenda, activityId: actor.campActivity.id, expiresAt: at - 180 };
      }
      return true;
    }
    if (!['strategy_conversation', 'alliance_meeting'].includes(activity.type)) return false;
    const listeners = (activity.participantIds || []).map(id => this.person(id)).filter(s => this.present(s, activity.location));
    if (!listeners.length) return true;
    this.camp.observe({ actor, type: 'seen_together', participants: listeners.map(s => s.id), location: activity.location,
      activityId: activity.id, at, visibility: 'private' });
    this.strategy.reasoning.contact([actor.id,...listeners.map(s=>s.id)],at);
    const meeting = this.meetings.find(m => m.activityId === activity.id);
    if (meeting) {
      const result = this.gm.systems.allianceSystem.resolveMeeting(meeting.allianceId, [actor, ...listeners], activity, () => this.random());
      if (result.targetId) this.strategy.allianceTargets.set(meeting.allianceId, result.targetId);
      meeting.outcome = result; meeting.status = 'completed'; this.strategy.completedAllianceMeetings.add(meeting.id);
    } else for (const listener of listeners) {
      const engine = this.gm.systems.conversationSystem?.engine;
      if (engine && activity.taskId) engine.tasks.execute(actor, listener, activity);
      else if (engine && activity.objectiveId) engine.objectives.execute(actor, listener, activity);
      else if (engine) engine.executeAgenda(actor, listener, activity, () => this.random());
      else this.strategy.reasoning.resolveAgenda(actor, listener, activity, () => this.random());
    }
    this.note('conversation_resolved', { activityId: activity.id, actorId: actor.id, participantIds: listeners.map(s => s.id) });
    return true;
  }
  releaseMeeting(meeting, at) {
    for (const person of this.members) if (person.campActivity?.meetingId === meeting.id || person.campActivity?.goal?.meetingId === meeting.id) {
      // A travelling member keeps their route/arrival; release only the reservation.
      if (person.campActivity.type === 'travel') { person.campActivity.interruptible = true;
        person.campActivity.goal = { type: 'idle_at_camp', location: meeting.location, duration: 120 }; }
      else person.campActivity = null;
    }
  }
  clearInvitation() {
    const npc = this.person(this.invitation?.npcId);
    if (this.invitation && npc?.campActivity?.id === this.invitation.activityId && npc.campActivity.type === 'approach_wait') npc.campActivity = null;
    this.invitation = null;
  }
  attend(meetingId) {
    const meeting = this.meetings.find(m => m.id === meetingId && m.status === 'active');
    const participants = meeting?.memberIds.map(id => this.person(id)).filter(s => s && !s.isPlayer &&
      s.campActivity?.id === meeting.activityId && this.present(s, meeting.location)) || [];
    if (!meeting || participants.length < 2 || !meeting.memberIds.some(id => same(id, this.gm.player?.id)) ||
      !this.present(this.gm.player, meeting.location) || this.camp.conversation) return false;
    // Demote the reserved NPC meeting to the existing interactive conversation.
    for (const npc of participants) npc.campActivity = null;
    meeting.status = 'attended';
    this.gm.systems.conversationSystem?.startAllianceConversation?.(participants[0].id,meeting.allianceId,{location:meeting.location,meetingId,groupParticipantIds:participants.map(s=>s.id)});
    if (!this.camp.conversation) { meeting.status = 'cancelled'; return false; }
    this.camp.conversation.meetingId = meeting.id;
    this.note('player_attended', { meetingId });
    return true;
  }
  serialize() { return { rngState: this.rngState, meetings: this.meetings, invitation: this.invitation,
    nextApproachAt: this.nextApproachAt, history: this.history }; }
}
