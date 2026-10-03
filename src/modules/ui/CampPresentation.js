// A read-only, player-visible projection of the existing physical camp. No AI
// intentions, hidden targets, or other contestants' memories enter this model.
import { physicalCampLocation } from '../locations/LocationUtils.js';
export const sameId = (a, b) => a != null && b != null && String(a) === String(b);
export const placeName = key => ({ beach: 'the beach', campfire: 'the fire', shelter: 'the shelter',
  jungleTrail: 'the jungle trail', rockyShore: 'the rocks', waterWell: 'the water well',
  mountainTrail: 'the mountain trail', waterfallTrail: 'the waterfall trail', tribeFlag: 'camp',
  fork1: 'the trail', fork2: 'the trail', fork3: 'the trail', treeMail: 'Tree Mail' }[key] || 'camp');
export const LOCATION_MOOD = Object.freeze({ beach: 'Around the beach', campfire: 'Around the fire',
  shelter: 'At the shelter', jungleTrail: 'Along the trail', rockyShore: 'Along the rocks',
  waterWell: 'At the well' });
export const HELP_VIEWS = Object.freeze({ gather_firewood: 'firewood', gather_bamboo: 'bamboo',
  gather_food: 'shake', collect_water: 'waterWell', fish: 'fishing', build_fire: 'fire',
  tend_fire: 'fire', build_shelter: 'shelter' });
const LABELS = Object.freeze({ gather_firewood: 'Gathering firewood', gather_bamboo: 'Cutting bamboo',
  gather_food: 'Gathering food', collect_water: 'Collecting water', fish: 'Fishing along the rocks',
  build_fire: 'Working on the fire', tend_fire: 'Tending the fire', build_shelter: 'Working on the shelter',
  rest: 'Taking a break', idol_hunt: 'Looking around the trail', investigate: 'Watching the trail',
  observe: 'Watching camp', idle_at_camp: 'Sitting nearby', cook: 'Preparing food',
  private_conversation: 'Talking with you', strategy_conversation_player: 'Talking with you' });
export const isSocialActivity = activity => ['socialize', 'strategy_conversation'].includes(activity?.type) || Boolean(activity?.socialPurpose);
export function activityPrivacy(activity) {
  if (!isSocialActivity(activity)) return 'public';
  return activity.privacy === 'private' || activity.type === 'strategy_conversation' || activity.socialPurpose === 'strategy' ? 'private' : 'public';
}
export function visibleActivityLabel(activity, companions = []) {
  if (!activity) return 'Around camp';
  if (activity.type === 'travel') return `Heading toward ${placeName(activity.location)}`;
  const work = LABELS[activity.type];
  if (activity.socialPurpose && work) return `${work} together`;
  if (isSocialActivity(activity)) return activityPrivacy(activity) === 'private' ? 'Talking quietly' :
    companions.length ? `Talking with ${companions.join(' & ')}` : 'Talking nearby';
  return work || 'Around camp';
}
export function eligibleCampMember(gm, person) {
  const absent = gm.flags?.absentFromCampIds;
  return person && !person.isOut && !(absent instanceof Set ? [...absent] : absent || []).some(id => sameId(id, person.id));
}
export function playerPlace(gm, view) {
  return physicalCampLocation(view || gm.getPlayerSurvivor?.()?.location);
}
// Runtime locations identify route destinations early. Keep that contract,
// but a traveler is not yet an arrived, talkable portrait at that destination.
export function physicallyPresent(person, positions, place) {
  return positions?.getLocation?.(person.id) === place && person.campActivity?.type !== 'travel';
}
export function publicCampCue(group, tribe) {
  if (!group.social || group.privacy !== 'public') return null;
  const supplies = tribe?.stockpile || {};
  if ((supplies.water || 0) < (tribe?.members?.length || 1)) return '“Water’s getting low.”';
  if ((supplies.firewood || 0) < 10) return '“We need more wood.”';
  if (!(tribe?.fire > 0)) return '“We still need to get the fire going.”';
  if ((tribe?.shelter || 0) < 3) return '“There’s still work to do on the shelter.”';
  return null;
}
export function activityCue(activity) {
  return ({ build_shelter: '⚒', fish: '⌁', build_fire: '♨', tend_fire: '♨', collect_water: '◒',
    gather_firewood: '⚒', gather_bamboo: '⚒', rest: '·', strategy_conversation: '◌' })[activity?.type] || null;
}
export function campGroups(gm, view) {
  const place = playerPlace(gm, view);
  if (!place || gm.flags?.campEventActive) return [];
  const positions = gm.systems?.npcLocationSystem;
  const visible = (gm.getPlayerTribe?.()?.members || []).filter(person => !person.isPlayer &&
    eligibleCampMember(gm, person) && physicallyPresent(person, positions, place));
  const currentActivity = person => gm.gamePhase === 'preChallenge' ? person.campActivity : null;
  const sets = visible.map(person => [person]);
  // Link only people actually engaged in the same block/shared work, not every
  // co-located bystander. A third nearby person remains a distinct presence.
  for (const person of visible) {
    const a = currentActivity(person);
    if (!a || a.location !== place) continue;
    for (const other of visible) {
      const b = currentActivity(other);
      if (!b || b.location !== place || sameId(person.id, other.id)) continue;
      const together = a.id === b.id || (a.type === b.type && a.socialPurpose && sameId(a.targetId, other.id));
      if (!together) continue;
      const left = sets.find(g => g.includes(person)), right = sets.find(g => g.includes(other));
      if (left !== right) { left.push(...right); sets.splice(sets.indexOf(right), 1); }
    }
  }
  return sets.map(people => {
    const activity = people.map(currentActivity).find(a => a?.location === place && !a.external) || currentActivity(people[0]);
    const engaged = people.length > 1;
    const privacy = engaged ? activityPrivacy(activity) : 'public';
    const members = people.map(p => ({ id: p.id, name: p.firstName || 'Survivor', avatarUrl: p.avatarUrl,
      label: visibleActivityLabel(currentActivity(p)?.location === place ? currentActivity(p) : null,
        people.filter(o => o !== p).map(o => o.firstName)),
      helpView: HELP_VIEWS[currentActivity(p)?.type] || null,
      busy: currentActivity(p)?.interruptible === false,
      travelling: currentActivity(p)?.type === 'travel' }));
    for (const member of members) member.cue = activityCue(currentActivity(people.find(p => sameId(p.id, member.id))));
    return { id: people.map(p => String(p.id)).sort().join(':'), location: place, privacy, engaged,
      social: engaged && isSocialActivity(activity), activityId: activity?.id,
      label: visibleActivityLabel(activity, engaged ? [] : []), members };
  });
}
// Used by the renderer, and testable without DOM. Boxes flow in an offset arc;
// wrapping keeps portraits separate at phone widths, including large groups.
export function clusterPortraitLayout(count, width = 300) {
  const size = 56, gap = 24, inset = 8; // Leave room for readable contestant names.
  const usable = Math.max(size + inset * 2, width);
  const columns = Math.max(1, Math.min(count || 1, Math.floor((usable - inset * 2 + gap) / (size + gap))));
  const rows = Math.ceil(count / columns);
  const boxes = Array.from({ length: count }, (_, i) => {
    const row = Math.floor(i / columns), inRow = Math.min(columns, count - row * columns);
    const col = i % columns, span = inRow * size + (inRow - 1) * gap;
    return { x: Math.max(inset, (usable - span) / 2) + col * (size + gap),
      y: row * 88 + (inRow === 3 && col === 1 ? 8 : 0), width: size, height: size };
  });
  return { boxes, width: usable, height: rows ? rows * 88 : 0 };
}

export function campObservationLine(entry, name) {
  const actor = name(entry.actorId);
  const company = entry.participantIds?.map(name).filter(Boolean).join(' & ');
  switch (entry.type) {
    case 'departed': return `${actor}${company ? ` and ${company}` : ''} headed toward ${placeName(entry.location)}.`;
    case 'arrived': return `${actor}${company ? ` and ${company}` : ''} arrived from ${placeName(entry.fromLocation)}.`;
    case 'noticed': return `${actor} was nearby at ${placeName(entry.location)}.`;
    case 'seen_together': return `${actor}${company ? ` and ${company}` : ''} spent time together near ${placeName(entry.location)}.`;
    case 'work': return `${actor} spent time contributing to camp.`;
    case 'absence': return `${actor} was seen away from camp.`;
    case 'idol_search_seen': return `You saw ${actor} searching through the brush.`;
    case 'player_following': return actor === 'You' ? `You were noticed following ${name(entry.subjectId)}.` : `${actor} was noticed following someone.`;
    case 'conversation_guarded': return `The conversation went quiet as you approached ${actor}.`;
    case 'overheard_name': return `You heard ${name(entry.subjectId)}'s name in a quiet conversation.`;
    case 'overheard_fragment': return 'You caught a few words, but missed the rest of a quiet conversation.';
    case 'overheard_statement': return `You heard ${actor} bring up ${name(entry.subjectId)}.`;
    case 'public_conflict': return `${actor} was involved in a disagreement near ${placeName(entry.location)}.`;
    default: return null;
  }
}
export function campRecap(gm) {
  const player = gm.getPlayerSurvivor?.(), tribe = gm.getPlayerTribe?.(), memory = gm.systems?.socialMemorySystem;
  const name = id => sameId(id, player?.id) ? 'You' : tribe?.members?.find(p => sameId(p.id, id))?.firstName || 'Someone';
  const owned = memory?.getCampObservations?.(player?.id, { day: gm.day }) || [];
  const life = [...new Set(owned.filter(e => e.origin !== 'hearsay')
    .map(e => campObservationLine(e, name)).filter(Boolean))].slice(-6);
  const told = (memory?.getCampClaims?.(player?.id) || []).filter(claim => claim.day === gm.day &&
    claim.sourceId != null && ['direct_statement', 'hearsay'].includes(claim.origin)).slice(-2);
  for (const claim of told) {
    const source = name(claim.sourceId), subject = name(claim.subjectId);
    if (claim.challenged) life.push(`You heard differing accounts about ${subject}.`);
    else if (claim.topic === 'target' || claim.topic === 'warning') life.push(`${source} brought up ${subject}'s name.`);
    else if (claim.topic === 'idol_suspicion') life.push(`${source} passed along a question about ${subject}'s time away from camp.`);
  }
  const read = [];
  for (const person of tribe?.members || []) {
    if (sameId(person.id, player?.id)) continue;
    const patterns = memory?.getCampImpression?.(player?.id, person.id) || {};
    if (patterns.absence?.count >= 2) read.push(`${person.firstName} was away from camp more than once.`);
    if (patterns.work?.count >= 3) read.push(`${person.firstName} seemed dependable around camp.`);
    const pair = owned.filter(e => e.type === 'seen_together' && sameId(e.actorId, person.id));
    const partner = pair.find(e => pair.filter(o => o.participantIds?.some(id => sameId(id, e.participantIds?.[0]))).length >= 2)?.participantIds?.[0];
    if (partner != null) read.push(`${person.firstName} and ${name(partner)} kept finding time together.`);
  }
  const water = tribe?.stockpile?.water || 0, food = ['coconuts', 'fish1', 'fish2', 'fish3'].reduce((n, key) => n + (tribe?.stockpile?.[key] || 0), 0);
  return { life: [...new Set(life)].slice(-6), read: [...new Set(read)].slice(0, 4), needs: [
    (tribe?.fire || 0) >= 3 ? 'Fire is stable.' : (tribe?.fire || 0) > 0 ? 'The fire still needs attention.' : 'The tribe still needs fire.',
    (tribe?.shelter || 0) >= 3 ? 'Shelter is holding.' : 'Shelter could use more work.',
    water >= (tribe?.members?.length || 1) ? 'Water is comfortable.' : 'Water is running low.',
    food >= (tribe?.members?.length || 1) ? 'There is food to share.' : 'Food is getting low.' ] };
}
