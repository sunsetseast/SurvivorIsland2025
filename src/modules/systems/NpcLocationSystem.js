/**
 * NpcLocationSystem.js
 * Handles NPC placement across camp locations for each camp phase.
 * Factors in relationships, personality, spawn weights,
 * and can generate rare confrontation events.
 */

import gameManager from "../core/GameManager.js";
import { getRandomInt } from "../utils/CommonUtils.js";
import eventManager from "../core/EventManager.js";

// We will NOT import GameEvents here,
// because your EventManager does NOT define
// NPC_LOCATIONS_ASSIGNED or NPC_CONFRONTATION yet.
// We will emit plain string events instead.

export const CAMP_LOCATION_WEIGHTS = {
  BeachView: 4,
  ShelterView: 4,
  CampfireView: 3,
  WaterWellView: 3,
  RockyShoreView: 1,
  JungleTrailView: 1,
  MountainTrailView: 1,
  WaterfallTrailView: 1,
};

export const CAMP_LOCATIONS = Object.keys(CAMP_LOCATION_WEIGHTS);

class NpcLocationSystem {
  constructor() {
    this.locations = {}; // survivorId → viewName
    this.phaseAssigned = false;

    this.lastFights = []; // store confrontations internally
  }

  reset() {
    this.locations = {};
    this.phaseAssigned = false;
    this.lastFights = [];
  }

  /**
   * MAIN ENTRY — Assign NPCs to locations at the start of each camp phase.
   */
  assignLocationsForPhase(survivors) {
    this.locations = {};
    this.phaseAssigned = true;
    this.lastFights = [];

    if (!survivors || survivors.length === 0) return;

    const npcs = survivors.filter(s => !s.isPlayer);

    // Shuffle NPCs to avoid ordering bias
    const shuffled = [...npcs].sort(() => Math.random() - 0.5);

    for (let npc of shuffled) {
      const loc = this._chooseLocationForSurvivor(npc, shuffled);
      this.locations[npc.id] = loc;
    }

    // Detect rare fight events
    this._evaluatePotentialConfrontations(shuffled);

    // Publish basic event (string-based, safe, no GameEvents needed)
    eventManager.publish("NPC_LOCATIONS_ASSIGNED", {
      locations: this.locations
    });
  }

  /**
   * Weighted location choice with relationship + personality modifiers.
   */
  _chooseLocationForSurvivor(npc, allNpcs) {
    // Step 1 — base weights
    const scores = {};
    for (let loc of CAMP_LOCATIONS) {
      scores[loc] = CAMP_LOCATION_WEIGHTS[loc];
    }

    // Step 2 — relationships with NPCs already placed
    for (let other of allNpcs) {
      if (other.id === npc.id) continue;

      const otherLoc = this.locations[other.id];
      if (!otherLoc) continue;

      const trust = gameManager.getRelationshipValue(npc.id, other.id);

      if (trust > 70) scores[otherLoc] += 1.5;
      if (trust < 30) scores[otherLoc] -= 1.5;
    }

    // Step 3 — personality modifiers
    const traits = npc.personalityTraits || [];

    if (traits.includes("paranoid")) {
      scores.WaterWellView += 1;
      scores.JungleTrailView += 1;
    }

    if (traits.includes("idol_hunter")) {
      scores.JungleTrailView += 2;
      scores.MountainTrailView += 2;
      scores.WaterfallTrailView += 2;
    }

    if (traits.includes("social")) {
      scores.BeachView += 2;
      scores.ShelterView += 2;
    }

    if (traits.includes("loner")) {
      scores.RockyShoreView += 2;
      scores.WaterfallTrailView += 1;
    }

    // Step 4 — build weighted selection pool
    const pool = [];

    for (let [loc, score] of Object.entries(scores)) {
      const count = Math.max(0, Math.round(score));
      for (let i = 0; i < count; i++) pool.push(loc);
    }

    if (pool.length === 0) return "ShelterView";

    const index = getRandomInt(0, pool.length - 1);
    return pool[index];
  }

  /**
   * Rare confrontation events (10–20% chance)
   */
  _evaluatePotentialConfrontations(npcs) {
    const fights = [];

    for (let i = 0; i < npcs.length; i++) {
      for (let j = i + 1; j < npcs.length; j++) {
        const npcA = npcs[i];
        const npcB = npcs[j];

        const locA = this.locations[npcA.id];
        const locB = this.locations[npcB.id];

        if (!locA || locA !== locB) continue;

        const trustAB = gameManager.getRelationshipValue(npcA.id, npcB.id);
        const trustBA = gameManager.getRelationshipValue(npcB.id, npcA.id);

        if (trustAB < 25 && trustBA < 25) {
          if (Math.random() < 0.15) {
            const confrontation = {
              type: "confrontation",
              npcAId: npcA.id,
              npcBId: npcB.id,
              location: locA,
              intensity: getRandomInt(1, 3)
            };
            fights.push(confrontation);
          }
        }
      }
    }

    this.lastFights = fights;

    if (fights.length > 0) {
      // Publish simple string event to avoid requiring GameEvents update
      eventManager.publish("NPC_CONFRONTATION", { fights });
    }
  }

  getLocation(id) {
    return this.locations[id] || null;
  }

  getSurvivorsAtLocation(locationName) {
    const list = [];
    const all = gameManager.survivors || [];

    for (let s of all) {
      if (this.locations[s.id] === locationName) list.push(s);
    }

    return list;
  }
}

const npcLocationSystem = new NpcLocationSystem();
export default npcLocationSystem;