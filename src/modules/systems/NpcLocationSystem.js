/**
 * NpcLocationSystem.js
 * Handles NPC placement across camp locations for each camp phase.
 * Matches CampScreen view keys EXACTLY so NPCs always render.
 */

import gameManager from "../core/GameManager.js";
import { getRandomInt } from "../utils/CommonUtils.js";
import eventManager from "../core/EventManager.js";

// Safe debug helper – uses global debugBanner if it exists
const dbg = window.debugBanner || function () {};

// ----------------------------------------------
// ✔ MATCHES CampScreen.js VIEW KEYS
// ----------------------------------------------
export const CAMP_LOCATION_WEIGHTS = {
  beach: 4,
  shelter: 4,
  campfire: 3,
  waterWell: 3,

  rocky: 1,
  jungleTrail: 1,
  mountainTrail: 1,
  waterfallTrail: 1,

  treemail: 1 // Player can walk here
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
      const loc = this._chooseLocationForSurvivor(npc, shuffled);
      this.locations[npc.id] = loc;
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
      scores.waterWell += 1;
      scores.jungleTrail += 1;
    }

    if (traits.includes("idol_hunter")) {
      scores.jungleTrail += 2;
      scores.mountainTrail += 2;
      scores.waterfallTrail += 2;
    }

    if (traits.includes("social")) {
      scores.beach += 2;
      scores.shelter += 2;
    }

    if (traits.includes("loner")) {
      scores.rocky += 2;            // ✅ matches CAMP_LOCATION_WEIGHTS
      scores.waterfallTrail += 1;
    }

    // Weighted pool
    const pool = [];
    for (let [loc, value] of Object.entries(scores)) {
      const count = Math.max(0, Math.round(value));
      for (let i = 0; i < count; i++) pool.push(loc);
    }

    if (pool.length === 0) {
      dbg("⚠ No weighted pool — defaulting to shelter for", npc.firstName);
      return "shelter";
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

    for (let s of tribe.members) {
      if (!s.isPlayer && this.locations[s.id] === locationName) {
        results.push(s);
      }
    }

    dbg("getSurvivorsAtLocation", {
      viewName: locationName,
      results: results.map(r => r.firstName)
    });

    return results;
  }
}

const npcLocationSystem = new NpcLocationSystem();
export default npcLocationSystem;