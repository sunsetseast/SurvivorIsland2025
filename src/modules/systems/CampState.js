// Camp construction levels and potable supply are the world state. The older
// resource scores remain derived compatibility values for old UI/save readers.
import { LocationKeys } from '../core/LocationKeys.js';
export const MAX_FIRE_LEVEL = 3;
export const MAX_SHELTER_LEVEL = 4;
export const CAMP_WORK_LOCATIONS = Object.freeze({
  fire: LocationKeys.CAMPFIRE, shelter: LocationKeys.SHELTER,
  wood: LocationKeys.JUNGLE_TRAIL, resources: LocationKeys.BEACH,
  water: LocationKeys.WATER_WELL
});

export const safeCampAmount = value => Number.isFinite(value) ? Math.max(0, value) : 0;

export function normalizeCampState(tribe) {
  if (!tribe) return null;
  tribe.resources ||= {};
  tribe.stockpile ||= {};
  if (tribe.campStateVersion !== 1) {
    // Old saves may have collected water in either store. Preserve both rather
    // than silently discarding the larger potable supply on migration.
    tribe.stockpile.water = Math.max(
      safeCampAmount(tribe.stockpile.water), safeCampAmount(tribe.resources.water)
    );
    tribe.campStateVersion = 1;
  }
  tribe.fire = Math.min(MAX_FIRE_LEVEL, safeCampAmount(tribe.fire));
  tribe.shelter = Math.min(MAX_SHELTER_LEVEL, safeCampAmount(tribe.shelter));
  for (const key of ['firewood', 'bamboo', 'palms', 'water', 'coconuts', 'fish1', 'fish2', 'fish3']) {
    tribe.stockpile[key] = safeCampAmount(tribe.stockpile[key]);
  }
  syncCampResources(tribe);
  return tribe;
}

export function syncCampResources(tribe) {
  if (!tribe) return;
  tribe.resources ||= {};
  tribe.stockpile ||= {};
  tribe.resources.fire = Math.round(safeCampAmount(tribe.fire) / MAX_FIRE_LEVEL * 100);
  tribe.resources.shelter = Math.round(safeCampAmount(tribe.shelter) / MAX_SHELTER_LEVEL * 100);
  tribe.resources.water = safeCampAmount(tribe.stockpile.water);
}

export function isNeededCampContribution(tribe, resource, amount = 0) {
  const supply = safeCampAmount(tribe?.stockpile?.[resource]) - safeCampAmount(amount);
  if (resource === 'water') return supply < 30;
  if (resource === 'coconuts' || resource?.startsWith('fish')) {
    return ['coconuts', 'fish1', 'fish2', 'fish3'].reduce((sum, key) =>
      sum + safeCampAmount(tribe?.stockpile?.[key]) - (key === resource ? amount : 0), 0) < 3;
  }
  if (resource === 'firewood') return (tribe?.fire || 0) < MAX_FIRE_LEVEL && supply < 10;
  if (resource === 'bamboo' || resource === 'palms') {
    return (tribe?.shelter || 0) < MAX_SHELTER_LEVEL && supply < (resource === 'bamboo' ? 5 : 1);
  }
  return false;
}
