import { LocationKeys } from '../core/LocationKeys.js';

const SUPPLY_LOCATIONS = new Set([LocationKeys.BEACH, LocationKeys.SHELTER, LocationKeys.CAMPFIRE,
  LocationKeys.TRIBE_FLAG, LocationKeys.WATER_WELL]);
const REFRESH_THRESHOLD = 60;
const WATER_RECOVERY = 12;
const FOOD_RECOVERY = 12;

// Routine eating/drinking fits inside an already completed camp block. NPCs
// consume the same real stockpile as the player; travel/search does not conjure
// supplies, and the player's existing hands-on interactions are untouched.
export function refreshNpcCampNeeds(gm, actor, location) {
  if (!actor || actor.isPlayer || actor.isOut || !SUPPLY_LOCATIONS.has(location)) return;
  const tribe = gm.getPlayerTribe?.(), stock = tribe?.stockpile;
  if (!stock) return;
  if (Number.isFinite(actor.water) && actor.water < REFRESH_THRESHOLD && stock.water >= 1 &&
    gm.consumeFromStockpile?.(tribe, 'water', 1)) actor.water = Math.min(100, actor.water + WATER_RECOVERY);
  if (Number.isFinite(actor.hunger) && actor.hunger < REFRESH_THRESHOLD) {
    const food = ['coconuts', ...(tribe.fire > 0 ? ['fish1', 'fish2', 'fish3'] : [])].find(key => stock[key] >= 1);
    if (food && gm.consumeFromStockpile?.(tribe, food, 1)) actor.hunger = Math.min(100, actor.hunger + FOOD_RECOVERY);
  }
  gm.updateSurvivorHealth?.(actor);
}
