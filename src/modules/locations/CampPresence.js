import { physicalCampLocation } from './LocationUtils.js';

const same = (a, b) => a != null && b != null && String(a) === String(b);

export function eligibleCampMember(gm, person) {
  const absent = gm?.flags?.absentFromCampIds;
  return Boolean(person && !person.isOut && !person.eliminated && !person.isEliminated && !person.outOfGame &&
    !(absent instanceof Set ? [...absent] : absent || []).some(id => same(id, person.id)));
}

// Location storage may name the next route node. Only this contract answers
// co-presence: a semantic travel/follow block occupies neither endpoint.
// Player navigation pays time synchronously; player.location, not the view
// being opened, remains authoritative throughout that payment.
export function isCampPhysicallyPresent(person, locations, place, gm = null) {
  const destination = physicalCampLocation(place);
  if (!destination || !eligibleCampMember(gm, person) || ['travel', 'follow'].includes(person.campActivity?.type)) return false;
  const location = person.isPlayer ? person.location : locations?.getLocation?.(person.id);
  return physicalCampLocation(location) === destination;
}
