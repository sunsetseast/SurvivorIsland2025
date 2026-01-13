/**
 * @module NpcIdolHuntAI
 * Decides when NPCs hunt for idols/clues during camp simulation.
 */

import { ELIGIBLE_IDOL_LOCATIONS } from './IdolSystem.js';

const STYLE_MODIFIERS = {
  'Shadow Strategist': { urge: 0.15, casualBias: 0.75, avoidAggressiveWhenSuspicious: true },
  'Power Player': { urge: 0.2, casualBias: 0.35 },
  'Social Genius': { urge: -0.1, casualBias: 0.7 },
  'Wildcard': { urge: 0.05, casualBias: 0.45, spiky: true },
  Competitive: { urge: -0.05, casualBias: 0.6 },
  'Lethal Charmer': { urge: 0.05, casualBias: 0.65 }
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalize(value, divisor = 100) {
  if (typeof value !== 'number') return 0;
  return clamp(value / divisor, 0, 1);
}

function randomChoice(list) {
  if (!list || list.length === 0) return null;
  const index = Math.floor(Math.random() * list.length);
  return list[index];
}

function pickHuntLocation(npc, idolSystem) {
  const inventory = idolSystem.getSurvivorInventory(npc.id);
  const activeClue = inventory?.clues?.find(clue => !clue.expired);
  if (activeClue?.pointsToLocationKey) {
    if (Math.random() < 0.7) {
      return activeClue.pointsToLocationKey;
    }
  }

  return randomChoice(ELIGIBLE_IDOL_LOCATIONS);
}

function computeUrgeScore(npc, context, idolSystem) {
  const style = npc.gameplayStyle || npc.playStyle || 'Competitive';
  const modifiers = STYLE_MODIFIERS[style] || { urge: 0, casualBias: 0.6 };

  const idolHunt = normalize(npc.idolhunt);
  const paranoia = normalize(npc.paratend || npc.paranoia);
  const awareness = normalize(npc.awareness);
  const aggression = normalize(npc.aggression);
  const laziness = normalize(npc.laziness);
  const suspicion = normalize(npc.suspicion);

  const inventory = idolSystem.getSurvivorInventory(npc.id);
  const hasActiveClue = inventory?.clues?.some(clue => !clue.expired);

  let urge = 0.15 + idolHunt * 0.35 + paranoia * 0.2 + awareness * 0.1;
  urge += aggression * 0.1;
  urge -= laziness * 0.25;
  urge -= suspicion * 0.15;

  if (hasActiveClue) {
    urge += 0.25;
  }

  if (context?.campTasksUrgent) {
    urge -= 0.2;
  }

  urge += modifiers.urge;

  if (style === 'Social Genius' && (paranoia > 0.6 || suspicion > 0.5)) {
    urge += 0.1;
  }

  if (style === 'Competitive' && hasActiveClue) {
    urge += 0.1;
  }

  if (style === 'Wildcard' && Math.random() < 0.2) {
    urge += 0.3;
  }

  return clamp(urge, 0, 0.95);
}

function decideHuntMode(npc, context, idolSystem) {
  const style = npc.gameplayStyle || npc.playStyle || 'Competitive';
  const modifiers = STYLE_MODIFIERS[style] || { casualBias: 0.6 };

  let casualBias = modifiers.casualBias ?? 0.6;
  const suspicion = normalize(npc.suspicion);
  const aggression = normalize(npc.aggression);

  casualBias -= aggression * 0.3;
  casualBias += suspicion * 0.2;

  if (modifiers.avoidAggressiveWhenSuspicious && suspicion > 0.5) {
    casualBias += 0.25;
  }

  if (style === 'Power Player') {
    casualBias -= 0.2;
  }

  if (style === 'Wildcard' && Math.random() < 0.2) {
    casualBias -= 0.3;
  }

  casualBias = clamp(casualBias, 0.1, 0.9);

  return Math.random() < casualBias ? 'casual' : 'aggressive';
}

const NpcIdolHuntAI = {
  decideAndMaybeHunt(npcSurvivor, gameManager, idolSystem, context = {}) {
    if (!npcSurvivor || npcSurvivor.isPlayer) return null;
    if (!gameManager?.gameSettings?.enableIdols) return null;

    const tribeId = idolSystem.getTribeIdForSurvivor?.(npcSurvivor.id);
    if (!tribeId) return null;

    const idolState = idolSystem.getTribeIdolState(tribeId);
    if (!idolState || idolState.isFound || idolState.isUsed) return null;

    const urge = computeUrgeScore(npcSurvivor, context, idolSystem);
    if (Math.random() > urge) return null;

    const locationKey = pickHuntLocation(npcSurvivor, idolSystem) || idolState.locationKey;
    const mode = decideHuntMode(npcSurvivor, context, idolSystem);

    return idolSystem.attemptIntentionalHunt(npcSurvivor.id, locationKey, mode);
  }
};

export default NpcIdolHuntAI;
export { computeUrgeScore, decideHuntMode };
