/**
 * @module NpcIdolHuntAI
 * Decides when NPCs hunt for idols/clues during camp simulation.
 */

import { ELIGIBLE_IDOL_LOCATIONS } from './IdolSystem.js';
import npcLocationSystem from './NpcLocationSystem.js';
import { isCoreCampLocation, normalizeLocationKey } from '../locations/LocationUtils.js';

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

function pickHuntLocation(npc, idolSystem, context = {}) {
  const inventory = idolSystem.getSurvivorInventory(npc.id);
  const activeClue = inventory?.clues?.find(clue => !clue.expired);
  const clueLocation = normalizeLocationKey(activeClue?.pointsToLocationKey);
  const currentLocation = normalizeLocationKey(context.currentLocation);
  const recentLocations = Array.isArray(npc?.idolHuntMemory?.recentLocations)
    ? npc.idolHuntMemory.recentLocations
    : [];
  const crowdCounts = npcLocationSystem?.getLocationCounts?.() || {};

  const candidates = ELIGIBLE_IDOL_LOCATIONS.filter(loc => isCoreCampLocation(loc));
  const scored = candidates.map(location => {
    let score = 1;
    if (currentLocation && location === currentLocation) {
      score += 0.6;
    } else {
      score -= 0.2;
    }

    if (clueLocation && location === clueLocation) score += 2;
    if (recentLocations.includes(location)) score -= 1;

    const crowd = crowdCounts[location] || 0;
    score += clamp(0.6 - crowd * 0.15, -0.4, 0.6);
    score += Math.random() * 0.4;

    return { location, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const topChoices = scored.slice(0, Math.max(2, Math.ceil(scored.length * 0.3)));
  return randomChoice(topChoices.map(entry => entry.location));
}

function computeUrgeScore(npc, context, idolSystem) {
  const style = npc.gameplayStyle || npc.playStyle || 'Competitive';
  const modifiers = STYLE_MODIFIERS[style] || { urge: 0, casualBias: 0.6 };

  const idolHunt = normalize(npc.idolhunt);
  const paranoia = normalize(npc.paratend || npc.paranoia);
  const awareness = normalize(npc.awareness);
  const aggression = normalize(npc.aggression);
  const laziness = normalize(npc.laziness);
  const suspicion = normalize(npc.idolSuspicion ?? npc.suspicion);
  const threat = normalize(npc.threat || npc.threatLevel || npc.challengeThreat);

  const inventory = idolSystem.getSurvivorInventory(npc.id);
  const hasActiveClue = inventory?.clues?.some(clue => !clue.expired);

  let urge = 0.12 + idolHunt * 0.35 + paranoia * 0.22 + awareness * 0.1 + threat * 0.2;
  urge += aggression * 0.1;
  urge -= laziness * 0.25;
  urge -= suspicion * 0.15;

  if (hasActiveClue) {
    urge += 0.25;
  }

  if (context?.campTasksUrgent) {
    urge -= 0.2;
  }

  if (context?.phase === 'postChallenge' || context?.phase === 'post') {
    urge += 0.1;
  }

  if (context?.tribeInDanger) {
    urge += 0.1;
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
  const suspicion = normalize(npc.idolSuspicion ?? npc.suspicion);
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

function updateSuspicionDecay(npc, gameManager, context = {}) {
  const day = gameManager?.getCurrentDay?.() ?? gameManager?.day ?? 1;
  const phase = context.phase || gameManager?.getGamePhase?.() || gameManager?.gamePhase || 'preChallenge';
  const decayKey = `${day}-${phase}`;
  npc.idolHuntMemory = npc.idolHuntMemory || {};
  if (npc.idolHuntMemory.lastSuspicionDecayKey === decayKey) return;
  npc.idolHuntMemory.lastSuspicionDecayKey = decayKey;
  const current = Number.isFinite(npc.idolSuspicion) ? npc.idolSuspicion : Number.isFinite(npc.suspicion) ? npc.suspicion : 0;
  const decayed = Math.max(0, current - 2);
  npc.idolSuspicion = decayed;
  if (Number.isFinite(npc.suspicion)) {
    npc.suspicion = Math.max(0, npc.suspicion - 1);
  }
}

function updateHuntMemory(npc, locationKey) {
  npc.idolHuntMemory = npc.idolHuntMemory || {};
  const recent = Array.isArray(npc.idolHuntMemory.recentLocations) ? npc.idolHuntMemory.recentLocations : [];
  const next = [locationKey, ...recent.filter(loc => loc !== locationKey)].slice(0, 3);
  npc.idolHuntMemory.recentLocations = next;
  npc.idolHuntMemory.lastLocationKey = locationKey;
}

function getDebugEnabled(gameManager) {
  const idolSystem = gameManager?.systems?.idolSystem;
  return idolSystem?.isDebugMode?.() === true;
}

const NpcIdolHuntAI = {
  decideAndMaybeHunt(npcSurvivor, gameManager, idolSystem, context = {}) {
    if (!npcSurvivor || npcSurvivor.isPlayer) return null;
    if (!gameManager?.gameSettings?.enableIdols) return null;

    const tribeId = idolSystem.getTribeIdForSurvivor?.(npcSurvivor.id);
    if (!tribeId) return null;

    const idolState = idolSystem.getTribeIdolState(tribeId);
    if (!idolState || idolState.isFound || idolState.isUsed) return null;

    updateSuspicionDecay(npcSurvivor, gameManager, context);

    const urge = computeUrgeScore(npcSurvivor, context, idolSystem);
    if (Math.random() > urge) return null;

    const currentLocation = normalizeLocationKey(
      npcLocationSystem?.getLocation?.(npcSurvivor.id) || npcSurvivor.location
    );
    const locationKey = pickHuntLocation(npcSurvivor, idolSystem, { currentLocation }) || idolState.locationKey;
    const normalizedLocation = normalizeLocationKey(locationKey) || idolState.locationKey;
    const travelTime = currentLocation && normalizedLocation && currentLocation !== normalizedLocation ? 180 : 0;
    const mode = decideHuntMode(npcSurvivor, context, idolSystem);
    const shouldTravel = travelTime > 0;

    if (shouldTravel) {
      npcLocationSystem?.updateNpcLocation?.(npcSurvivor.id, normalizedLocation, { reason: 'idol_hunt' });
    }

    if (travelTime > 0 && gameManager.consumeCampTime) {
      gameManager.consumeCampTime(travelTime, {
        source: 'npc_idol_travel',
        npcId: npcSurvivor.id,
        locationKey: normalizedLocation
      });
    }

    const result = idolSystem.attemptIntentionalHunt(npcSurvivor.id, normalizedLocation, mode, { isNpc: true });
    updateHuntMemory(npcSurvivor, normalizedLocation);

    if (mode === 'aggressive') {
      npcSurvivor.idolSuspicion = (npcSurvivor.idolSuspicion || 0) + 4;
      if (Number.isFinite(npcSurvivor.suspicion)) {
        npcSurvivor.suspicion += 2;
      }
    }

    if (getDebugEnabled(gameManager)) {
      console.debug('[NpcIdolHuntAI] NPC hunt', {
        npc: npcSurvivor.firstName || npcSurvivor.id,
        mode,
        urge,
        locationKey: normalizedLocation,
        travelTime,
        result: result?.outcome
      });
    }

    return result;
  }
};

export default NpcIdolHuntAI;
export { computeUrgeScore, decideHuntMode };
