import { campObservationLine, sameId, placeName } from './CampPresentation.js';

export const NARRATION = Object.freeze({ pending: 3, dwellMs: 5500, lifetimeMs: 22000, lifetimeSeconds: 180 });
// Input is exclusively the player's owned observations. No NPC knowledge or
// AI goals are consulted. Routine life remains visual; repeated witnessed
// departures can become a pattern, once per actor/direction in this phase.
export function narrationBeat(entry, owned, name, playerId) {
  if (!['witness', 'participant'].includes(entry.origin)) return null;
  const high = ['overheard_statement', 'caught_following', 'idol_search_seen', 'conversation_guarded', 'public_conflict'];
  let priority = high.includes(entry.type) || entry.type === 'overheard_name' && sameId(entry.subjectId, playerId) ? 3 :
    ['overheard_name', 'overheard_fragment', 'player_following'].includes(entry.type) ? 2 : 0;
  let text = entry.type === 'caught_following' ? `${name(entry.actorId)} noticed you following.` : campObservationLine(entry, name);
  if (entry.type === 'overheard_name' && sameId(entry.subjectId, playerId)) text = 'You hear your name in a quiet conversation.';
  let key = `${entry.type}:${entry.actorId}:${entry.subjectId || ''}:${entry.location}:${(entry.participantIds || []).map(String).sort().join(':')}`;
  if (entry.type === 'departed') {
    const repeats = owned.filter(e => e.type === 'departed' && e.origin === 'witness' &&
      sameId(e.actorId, entry.actorId) && e.location === entry.location && e.campTime >= entry.campTime).length;
    if (repeats >= 2) {
      priority = 2; key = `departure-pattern:${entry.actorId}:${entry.location}`;
      text = `${name(entry.actorId)} has headed toward ${placeName(entry.location)} more than once.`;
    } else if (entry.participantIds?.length) priority = 2;
  }
  if (entry.type === 'arrived' && entry.origin === 'witness') {
    const departed = owned.filter(e => e.type === 'departed' && e.origin === 'witness' && sameId(e.actorId, entry.actorId));
    const followed = departed.some(e => owned.some(attempt => attempt.type === 'followed' &&
      attempt.id.startsWith(`${e.id}:follow:`) && attempt.campTime >= entry.campTime && attempt.campTime - entry.campTime <= NARRATION.lifetimeSeconds));
    if (entry.participantIds?.length || followed || departed.length >= 2) {
      priority = entry.participantIds?.length ? 2 : 1;
      const people = [name(entry.actorId), ...(entry.participantIds || []).map(name)].join(' and ');
      text = `${people} ${entry.participantIds?.length ? 'walk up' : 'walks up'} from ${placeName(entry.fromLocation)}.`;
    }
  }
  return priority && text ? { id: entry.id, key, priority, text, campTime: entry.campTime } : null;
}

// Presentation only; reconstructed empty on phase/load. One timer schedules
// the next readable beat, with no polling or scrolling feed.
export class CampNarrationQueue {
  constructor() { this.reset(); }
  reset(owned = []) {
    this.seen = new Set(owned.map(e => e.id)); this.stories = new Set();
    this.pending = []; this.current = null;
  }
  expire(campTime, now) {
    this.pending = this.pending.filter(b => b.campTime >= campTime && b.campTime - campTime <= NARRATION.lifetimeSeconds && now - b.enqueuedAt < NARRATION.lifetimeMs);
  }
  ingest(owned, makeBeat, campTime, now) {
    this.expire(campTime, now);
    for (const e of owned) {
      if (this.seen.has(e.id)) continue;
      this.seen.add(e.id);
      const beat = makeBeat(e);
      if (!beat || this.stories.has(beat.key) || e.campTime < campTime || e.campTime - campTime > NARRATION.lifetimeSeconds) continue;
      const duplicate = this.pending.find(b => b.key === beat.key);
      if (duplicate) { duplicate.priority = Math.max(duplicate.priority, beat.priority); continue; }
      this.pending.push({ ...beat, enqueuedAt: now });
    }
    this.pending.sort((a,b) => b.priority - a.priority || b.campTime - a.campTime);
    this.pending.length = Math.min(this.pending.length, NARRATION.pending);
    if (this.seen.size > 200) this.seen = new Set(owned.map(e => e.id));
  }
  advance(campTime, now) {
    this.expire(campTime, now);
    if (this.current && now - this.current.displayedAt < NARRATION.dwellMs) return this.current;
    const next = this.pending.shift();
    this.current = next ? { ...next, displayedAt: now } : null;
    if (next) this.stories.add(next.key);
    return this.current;
  }
  get delay() { return this.current ? NARRATION.dwellMs : null; }
}
