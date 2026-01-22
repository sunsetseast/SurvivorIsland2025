/**
 * NpcLocationSystem.js
 * Handles NPC placement across camp locations for each camp phase.
 * Matches CampScreen view keys EXACTLY so NPCs always render.
 */

import gameManager from "../core/GameManager.js";
import { getRandomInt } from "../utils/CommonUtils.js";
import eventManager from "../core/EventManager.js";
import { LocationKeys } from "../core/LocationKeys.js";

// Safe debug helper – uses global debugBanner if it exists
const dbg = (typeof window.debugBanner === "function") ? window.debugBanner : () => {};

const LOCATION_KEY_LOOKUP = {
  [LocationKeys.BEACH.toLowerCase()]: LocationKeys.BEACH,
  [LocationKeys.SHELTER.toLowerCase()]: LocationKeys.SHELTER,
  [LocationKeys.CAMPFIRE.toLowerCase()]: LocationKeys.CAMPFIRE,
  [LocationKeys.WATER_WELL.toLowerCase()]: LocationKeys.WATER_WELL,
  [LocationKeys.ROCKY_SHORE.toLowerCase()]: LocationKeys.ROCKY_SHORE,
  [LocationKeys.TRIBE_FLAG.toLowerCase()]: LocationKeys.TRIBE_FLAG,
  [LocationKeys.JUNGLE_TRAIL.toLowerCase()]: LocationKeys.JUNGLE_TRAIL,
  [LocationKeys.MOUNTAIN_TRAIL.toLowerCase()]: LocationKeys.MOUNTAIN_TRAIL,
  [LocationKeys.WATERFALL_TRAIL.toLowerCase()]: LocationKeys.WATERFALL_TRAIL,
  [LocationKeys.TREE_MAIL.toLowerCase()]: LocationKeys.TREE_MAIL,
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
  treemail: LocationKeys.TREE_MAIL,
  flag: LocationKeys.TRIBE_FLAG,
  tribeflag: LocationKeys.TRIBE_FLAG,
  waterwell: LocationKeys.WATER_WELL,
  campfire: LocationKeys.CAMPFIRE,
  shelter: LocationKeys.SHELTER,
  beach: LocationKeys.BEACH,
  summary: LocationKeys.SUMMARY,
  strategysummary: LocationKeys.STRATEGY_SUMMARY
};

const normalizeLocationKey = (key) => {
  if (!key || typeof key !== "string") return key;
  const trimmed = key.trim();
  const lower = trimmed.toLowerCase();
  const normalized = lower.replace(/[\s_-]+/g, "");
  if (LOCATION_KEY_LOOKUP[lower]) return LOCATION_KEY_LOOKUP[lower];
  if (LOCATION_KEY_LOOKUP[normalized]) return LOCATION_KEY_LOOKUP[normalized];
  if (/view$/i.test(trimmed)) {
    const base = trimmed.replace(/view$/i, "");
    const baseLower = base.toLowerCase();
    const baseNormalized = baseLower.replace(/[\s_-]+/g, "");
    if (LOCATION_KEY_LOOKUP[baseLower]) return LOCATION_KEY_LOOKUP[baseLower];
    if (LOCATION_KEY_LOOKUP[baseNormalized]) return LOCATION_KEY_LOOKUP[baseNormalized];
    return base.charAt(0).toLowerCase() + base.slice(1);
  }
  return trimmed;
};

export const CAMP_LOCATION_WEIGHTS = {
  [LocationKeys.BEACH]: 4,
  [LocationKeys.SHELTER]: 4,
  [LocationKeys.CAMPFIRE]: 3,
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
  assignLocationsForPhase(survivors) {
    dbg("assignLocationsForPhase called", { total: survivors?.length });

    if (gameManager.flags?.campEventActive) {
      dbg("Camp event active — skipping location assignment");
      return;
    }

    this.locations = {};
    this.phaseAssigned = true;
    this.lastFights = [];

    if (!survivors || survivors.length === 0) {
      dbg("No survivors passed into assignLocationsForPhase");
      return;
    }

    // Only NPCs FROM PLAYER'S TRIBE
    const tribe = gameManager.getPlayerTribe();
    if (!tribe) {
      dbg("No player tribe found – cannot assign NPC locations");
      return;
    }

    const npcs = tribe.members.filter(s => !s.isPlayer);
    dbg("NPCs in player tribe", npcs.map(n => n.firstName));

    // Safe shuffle
    const shuffled = [...npcs].sort(() => Math.random() - 0.5);

    // Assign locations
    for (let npc of shuffled) {
      const loc = normalizeLocationKey(this._chooseLocationForSurvivor(npc, shuffled));
      this.locations[npc.id] = loc;
      npc.location = loc;
      console.log("[NpcLocationSystem] assigned", npc.name || npc.firstName || npc.id, "->", loc);
      dbg("Assigned NPC location", { npc: npc.firstName, loc });
    }

    // Check for confrontations
    this._evaluatePotentialConfrontations(shuffled);

    // Publish event so render system knows we’re ready
    eventManager.publish("npc:locationsAssigned", {
      locations: this.locations
    });

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
}

const npcLocationSystem = new NpcLocationSystem();
export default npcLocationSystem;
