/**
 * NpcLocationSystem.js
 * Handles NPC placement across camp locations for each camp phase.
 * Matches CampScreen view keys EXACTLY so NPCs always render.
 */

import gameManager from "../core/GameManager.js";
import { getRandomInt, shuffleArray } from "../utils/CommonUtils.js";
import eventManager from "../core/EventManager.js";
import { LocationKeys } from "../core/LocationKeys.js";
import { isCoreCampLocation, normalizeLocationKey } from "../locations/LocationUtils.js";

// Safe debug helper – uses global debugBanner if it exists
const dbg = (typeof window.debugBanner === "function") ? window.debugBanner : () => {};

export const CAMP_LOCATION_WEIGHTS = {
  [LocationKeys.BEACH]: 4,
  [LocationKeys.SHELTER]: 4,
  [LocationKeys.CAMPFIRE]: 3,
  [LocationKeys.TRIBE_FLAG]: 2,
  [LocationKeys.WATER_WELL]: 3,

  [LocationKeys.ROCKY_SHORE]: 1,
  [LocationKeys.JUNGLE_TRAIL]: 1,
  [LocationKeys.MOUNTAIN_TRAIL]: 1,
  [LocationKeys.WATERFALL_TRAIL]: 1,

  [LocationKeys.TREE_MAIL]: 1 // Player can walk here
};

// Dynamically derived key list
export const CAMP_LOCATIONS = Object.keys(CAMP_LOCATION_WEIGHTS);

class NpcLocationSystem {
  constructor() {
    this.locations = {};    // survivorId → viewName
    this.phaseAssigned = false;
    this.lastFights = [];   // confrontation events
    this.lastPhaseUsed = null;
  }

  // So main.js can safely call initialize()
  initialize() {
    dbg("NpcLocationSystem.initialize called");
  }

  reset() {
    this.locations = {};
    this.phaseAssigned = false;
    this.lastFights = [];
    dbg("NpcLocationSystem reset");
  }

  /**
   * MAIN ENTRY – assign locations for the current camp phase
   */
  assignLocationsForPhase(survivors, phase = null) {
    dbg("assignLocationsForPhase called", { total: survivors?.length, phase });

    if (gameManager.flags?.campEventActive) {
      dbg("Camp event active — skipping location assignment");
      return;
    }

    this.locations = {};
    this.phaseAssigned = true;
    this.lastFights = [];

    const tribe = gameManager.getPlayerTribe();
    if (!tribe) {
      dbg("No player tribe found – cannot assign NPC locations");
      return;
    }

    const roster = (survivors && survivors.length) ? survivors : tribe.members || [];
    if (!roster.length) {
      dbg("No survivors available for assignLocationsForPhase");
      return;
    }

    // Only NPCs FROM PLAYER'S TRIBE
    const npcs = roster.filter(s => !s.isPlayer);
    dbg("NPCs in player tribe", npcs.map(n => n.firstName));

    // Safe shuffle
    const shuffled = shuffleArray(npcs);

    // Assign locations
    for (let npc of shuffled) {
      let loc = normalizeLocationKey(this._chooseLocationForSurvivor(npc, shuffled));
      if (!isCoreCampLocation(loc)) {
        loc = LocationKeys.SHELTER;
      }
      this.locations[npc.id] = loc;
      npc.location = loc;
      console.log("[NpcLocationSystem] assigned", npc.name || npc.firstName || npc.id, "->", loc);
      dbg("Assigned NPC location", { npc: npc.firstName, loc });
    }

    this._refineAssignments(shuffled);

    // Check for confrontations
    this._evaluatePotentialConfrontations(shuffled);

    // Publish event so render system knows we’re ready
    eventManager.publish("npc:locationsAssigned", {
      locations: this.locations
    });

    this.lastPhaseUsed = phase || gameManager.getGamePhase?.() || gameManager.gamePhase || null;
    this._debugAssignmentSummary(this.lastPhaseUsed, npcs.length);
    dbg("Finished assignLocationsForPhase", this.locations);
  }

  /**
   * LOCATION CHOOSING LOGIC
   */
  _chooseLocationForSurvivor(npc, allNpcs) {
    // Start with base weights
    const scores = {};
    for (let loc of CAMP_LOCATIONS) {
      scores[loc] = CAMP_LOCATION_WEIGHTS[loc];
    }

    // RELATIONSHIP-based adjustments
    for (let other of allNpcs) {
      if (other.id === npc.id) continue;

      const otherLoc = this.locations[other.id];
      if (!otherLoc) continue;
      if (scores[otherLoc] === undefined) continue; // safety

      const trust = gameManager.getRelationshipValue(npc.id, other.id);

      if (trust > 70) scores[otherLoc] += 1.5;
      if (trust < 30) scores[otherLoc] -= 1.5;
    }

    // PERSONALITY modifiers
    const traits = npc.personalityTraits || [];

    if (traits.includes("paranoid")) {
      scores[LocationKeys.WATER_WELL] += 1;
      scores[LocationKeys.JUNGLE_TRAIL] += 1;
    }

    if (traits.includes("idol_hunter")) {
      scores[LocationKeys.JUNGLE_TRAIL] += 2;
      scores[LocationKeys.MOUNTAIN_TRAIL] += 2;
      scores[LocationKeys.WATERFALL_TRAIL] += 2;
    }

    if (traits.includes("social")) {
      scores[LocationKeys.BEACH] += 2;
      scores[LocationKeys.SHELTER] += 2;
    }

    if (traits.includes("loner")) {
      scores[LocationKeys.ROCKY_SHORE] += 2;            // ✅ matches CAMP_LOCATION_WEIGHTS
      scores[LocationKeys.WATERFALL_TRAIL] += 1;
    }

    // Weighted pool
    const pool = [];
    for (let [loc, value] of Object.entries(scores)) {
      const count = Math.max(0, Math.round(value));
      for (let i = 0; i < count; i++) pool.push(loc);
    }

    if (pool.length === 0) {
      dbg("⚠ No weighted pool — defaulting to shelter for", npc.firstName);
      return LocationKeys.SHELTER;
    }

    const index = getRandomInt(0, pool.length - 1);
    const picked = pool[index];

    dbg("Location chosen", { npc: npc.firstName, picked });

    return picked;
  }

  _scoreNpcAtLocation(npc, location, allNpcs, assignments) {
    if (!isCoreCampLocation(location)) return -Infinity;
    let score = CAMP_LOCATION_WEIGHTS[location] || 0;

    allNpcs.forEach(other => {
      if (other.id === npc.id) return;
      const otherLoc = assignments[other.id];
      if (otherLoc !== location) return;
      const trust = gameManager.getRelationshipValue(npc.id, other.id);
      if (trust > 70) score += 1.5;
      if (trust < 30) score -= 1.5;
    });

    const traits = npc.personalityTraits || [];
    if (traits.includes("paranoid")) {
      if (location === LocationKeys.WATER_WELL) score += 1;
      if (location === LocationKeys.JUNGLE_TRAIL) score += 1;
    }
    if (traits.includes("idol_hunter")) {
      if ([LocationKeys.JUNGLE_TRAIL, LocationKeys.MOUNTAIN_TRAIL, LocationKeys.WATERFALL_TRAIL].includes(location)) {
        score += 2;
      }
    }
    if (traits.includes("social")) {
      if ([LocationKeys.BEACH, LocationKeys.SHELTER, LocationKeys.CAMPFIRE].includes(location)) score += 2;
    }
    if (traits.includes("loner")) {
      if (location === LocationKeys.ROCKY_SHORE) score += 2;
      if (location === LocationKeys.WATERFALL_TRAIL) score += 1;
    }

    return score;
  }

  _refineAssignments(npcs) {
    if (npcs.length < 2) return;
    const iterations = Math.min(2, Math.max(1, Math.floor(npcs.length / 3)));
    for (let pass = 0; pass < iterations; pass++) {
      const shuffled = shuffleArray(npcs);
      for (let i = 0; i < shuffled.length - 1; i += 2) {
        const npcA = shuffled[i];
        const npcB = shuffled[i + 1];
        const locA = this.locations[npcA.id];
        const locB = this.locations[npcB.id];
        if (!locA || !locB) continue;

        const currentScore =
          this._scoreNpcAtLocation(npcA, locA, npcs, this.locations) +
          this._scoreNpcAtLocation(npcB, locB, npcs, this.locations);
        const swappedScore =
          this._scoreNpcAtLocation(npcA, locB, npcs, this.locations) +
          this._scoreNpcAtLocation(npcB, locA, npcs, this.locations);

        if (swappedScore > currentScore) {
          this.locations[npcA.id] = locB;
          this.locations[npcB.id] = locA;
          npcA.location = locB;
          npcB.location = locA;
        }
      }
    }
  }

  _debugAssignmentSummary(phase, totalNpcCount) {
    const idolSystem = gameManager.systems?.idolSystem;
    const isDebug = idolSystem?.isDebugMode?.() === true;
    if (!isDebug) return;

    const counts = {};
    Object.values(this.locations).forEach(loc => {
      if (!loc) return;
      counts[loc] = (counts[loc] || 0) + 1;
    });

    console.debug('[NpcLocationSystem] Assignment summary', {
      phase,
      totalNpcCount,
      counts
    });
  }

  /**
   * CONFRONTATION LOGIC
   */
  _evaluatePotentialConfrontations(npcs) {
    dbg("Checking confrontation possibilities...");

    const fights = [];

    for (let i = 0; i < npcs.length; i++) {
      for (let j = i + 1; j < npcs.length; j++) {
        const A = npcs[i];
        const B = npcs[j];

        const locA = this.locations[A.id];
        const locB = this.locations[B.id];
        if (!locA || locA !== locB) continue;

        const trustAB = gameManager.getRelationshipValue(A.id, B.id);
        const trustBA = gameManager.getRelationshipValue(B.id, A.id);

        if (trustAB < 25 && trustBA < 25 && Math.random() < 0.15) {
          fights.push({
            type: "confrontation",
            npcAId: A.id,
            npcBId: B.id,
            location: locA,
            intensity: getRandomInt(1, 3)
          });
        }
      }
    }

    this.lastFights = fights;

    if (fights.length > 0) {
      eventManager.publish("npc:confrontation", { fights });
      dbg("⚠ CONFRONTATIONS HAPPENED", fights);
    } else {
      dbg("No confrontations this phase.");
    }
  }

  /**
   * PUBLIC HELPERS
   */
  getLocation(id) {
    return this.locations[id] || null;
  }

  getSurvivorsAtLocation(locationName) {
    const results = [];
    const tribe = gameManager.getPlayerTribe();
    if (!tribe) return results;
    const canonicalLocation = normalizeLocationKey(locationName);
    if (!canonicalLocation) return results;

    for (let s of tribe.members) {
      const assignedLocation = normalizeLocationKey(this.locations[s.id]);
      if (!s.isPlayer && assignedLocation === canonicalLocation) {
        results.push(s);
      }
    }

    dbg("getSurvivorsAtLocation", {
      viewName: canonicalLocation,
      results: results.map(r => r.firstName)
    });

    return results;
  }

  updateNpcLocation(npcId, locationKey, { reason = null } = {}) {
    if (!npcId) return;
    const normalized = normalizeLocationKey(locationKey);
    if (!isCoreCampLocation(normalized)) return;
    this.locations[npcId] = normalized;
    const tribe = gameManager.getPlayerTribe();
    const npc = tribe?.members?.find(member => String(member.id) === String(npcId));
    if (npc) {
      npc.location = normalized;
    }
    eventManager.publish("npc:locationUpdated", { npcId, locationKey: normalized, reason });
  }

  getLocationCounts() {
    const counts = {};
    Object.values(this.locations).forEach(location => {
      if (!location) return;
      counts[location] = (counts[location] || 0) + 1;
    });
    return counts;
  }
}

const npcLocationSystem = new NpcLocationSystem();
export default npcLocationSystem;
