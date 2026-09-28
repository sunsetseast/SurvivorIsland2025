import { MAX_FIRE_LEVEL } from './CampState.js';

export function firewoodCost(level) {
  return level <= 0 ? 10 : level >= MAX_FIRE_LEVEL ? 0 : (level + 1) * 10;
}

// Called for the first play and every retry. A paid attempt is never recycled.
export function payForFireAttempt(gameManager, tribe) {
  const cost = firewoodCost(tribe?.fire || 0);
  if (!cost || !gameManager.consumeFromStockpile?.(tribe, 'firewood', cost)) return 0;
  return cost;
}
