import { LocationKeys } from '../core/LocationKeys.js';

const LOCATION_ALIASES = {
  [LocationKeys.SHELTER.toLowerCase()]: LocationKeys.SHELTER,
  [LocationKeys.CAMPFIRE.toLowerCase()]: LocationKeys.CAMPFIRE,
  [LocationKeys.WATER_WELL.toLowerCase()]: LocationKeys.WATER_WELL,
  [LocationKeys.BEACH.toLowerCase()]: LocationKeys.BEACH,
  [LocationKeys.ROCKY_SHORE.toLowerCase()]: LocationKeys.ROCKY_SHORE,
  [LocationKeys.WATERFALL_TRAIL.toLowerCase()]: LocationKeys.WATERFALL_TRAIL,
  [LocationKeys.JUNGLE_TRAIL.toLowerCase()]: LocationKeys.JUNGLE_TRAIL,
  [LocationKeys.MOUNTAIN_TRAIL.toLowerCase()]: LocationKeys.MOUNTAIN_TRAIL,
  [LocationKeys.TREE_MAIL.toLowerCase()]: LocationKeys.TREE_MAIL,
  [LocationKeys.TRIBE_FLAG.toLowerCase()]: LocationKeys.TRIBE_FLAG,
  [LocationKeys.FORK1.toLowerCase()]: LocationKeys.FORK1,
  [LocationKeys.FORK2.toLowerCase()]: LocationKeys.FORK2,
  [LocationKeys.FORK3.toLowerCase()]: LocationKeys.FORK3,
  [LocationKeys.FIREWOOD.toLowerCase()]: LocationKeys.FIREWOOD,
  [LocationKeys.BAMBOO.toLowerCase()]: LocationKeys.BAMBOO,
  [LocationKeys.SHAKE.toLowerCase()]: LocationKeys.SHAKE,
  [LocationKeys.FISHING.toLowerCase()]: LocationKeys.FISHING,
  [LocationKeys.FIRE.toLowerCase()]: LocationKeys.FIRE,
  [LocationKeys.SUMMARY.toLowerCase()]: LocationKeys.SUMMARY,
  [LocationKeys.STRATEGY_SUMMARY.toLowerCase()]: LocationKeys.STRATEGY_SUMMARY,
  rocky: LocationKeys.ROCKY_SHORE,
  rockyshore: LocationKeys.ROCKY_SHORE,
  tree: LocationKeys.TREE_MAIL,
  treemail: LocationKeys.TREE_MAIL,
  tree_mail: LocationKeys.TREE_MAIL,
  flag: LocationKeys.TRIBE_FLAG,
  tribeflag: LocationKeys.TRIBE_FLAG,
  tribe_flag: LocationKeys.TRIBE_FLAG,
  waterwell: LocationKeys.WATER_WELL,
  water_well: LocationKeys.WATER_WELL,
  waterwelltrail: LocationKeys.WATERFALL_TRAIL,
  jungletrail: LocationKeys.JUNGLE_TRAIL,
  mountaintrail: LocationKeys.MOUNTAIN_TRAIL,
  waterfalltrail: LocationKeys.WATERFALL_TRAIL
};

const CORE_CAMP_LOCATIONS = new Set([
  LocationKeys.ROCKY_SHORE,
  LocationKeys.BEACH,
  LocationKeys.CAMPFIRE,
  LocationKeys.SHELTER,
  LocationKeys.JUNGLE_TRAIL,
  LocationKeys.MOUNTAIN_TRAIL,
  LocationKeys.WATERFALL_TRAIL,
  LocationKeys.TREE_MAIL,
  LocationKeys.WATER_WELL,
  LocationKeys.TRIBE_FLAG
]);

export function normalizeLocationKey(input) {
  if (!input || typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  const normalized = lower.replace(/[\s_-]+/g, '');

  if (LOCATION_ALIASES[lower]) return LOCATION_ALIASES[lower];
  if (LOCATION_ALIASES[normalized]) return LOCATION_ALIASES[normalized];

  if (/view$/i.test(trimmed)) {
    const base = trimmed.replace(/view$/i, '');
    const baseLower = base.toLowerCase();
    const baseNormalized = baseLower.replace(/[\s_-]+/g, '');
    if (LOCATION_ALIASES[baseLower]) return LOCATION_ALIASES[baseLower];
    if (LOCATION_ALIASES[baseNormalized]) return LOCATION_ALIASES[baseNormalized];
  }

  if (Object.values(LocationKeys).includes(trimmed)) {
    return trimmed;
  }

  return null;
}

export function isCoreCampLocation(key) {
  const normalized = normalizeLocationKey(key);
  return normalized ? CORE_CAMP_LOCATIONS.has(normalized) : false;
}

export { CORE_CAMP_LOCATIONS };
