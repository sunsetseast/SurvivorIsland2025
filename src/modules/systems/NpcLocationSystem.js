/**
 * NpcLocationSystem.js
 * Handles NPC placement across camp locations for each camp phase.
 * Ensures location names match CampScreen view keys.
 */

import gameManager from "../core/GameManager.js";
import { getRandomInt } from "../utils/CommonUtils.js";
import eventManager from "../core/EventManager.js";

// IMPORTANT — These MUST match campViews keys in CampScreen.js
export const CAMP_LOCATION_WEIGHTS = {
  beach: 4,
  shelter: 4,
  campfire: 3,
  waterWell: 3,
  rocky: 1,
  jungleTrail: 1,
  mountainTrail: 1,
  waterfallTrail: 1,
};

export const CAMP_LOCATIONS = Object.keys(CAMP_LOCATION_WEIGHTS);

class NpcLocationSystem {
  constructor() {
    this.locations = {};     // survivorId -> viewName
    this.phaseAssigned = false;
    this.lastFights = [];    // stores confrontations
  }

  reset() {
    this.locations = {};
    this.phaseAssigned = false;
    this.lastFights = [];
  }

  /**
   * MAIN ENTRY — Runs at the start of each camp phase.
   */
  assignLocationsForPhase(survivors) {
    console.log('🟣 NpcLocationSystem.assignLocationsForPhase called', { survivorCount: survivors?.length });
    
    this.locations = {};
    this.phaseAssigned = true;
    this.lastFights = [];

    if (!survivors || survivors.length === 0) {
      console.log('⚠️ No survivors to assign locations');
      return;
    }

    const npcs = survivors.filter(s => !s.isPlayer);
    console.log('🟣 NPCs to assign:', npcs.length);
    
    const shuffled = [...npcs].sort(() => Math.random() - 0.5);

    for (let npc of shuffled) {
      const loc = this._chooseLocationForSurvivor(npc, shuffled);
      this.locations[npc.id] = loc;
      console.log(`🟣 Assigned ${npc.firstName} to ${loc}`);
    }

    // Trigger rare fight events
    this._evaluatePotentialConfrontations(shuffled);

    // String event = no need for GameEvents update
    eventManager.publish("NPC_LOCATIONS_ASSIGNED", {
      locations: this.locations
    });
  }

  /**
   * Weighted + relationship + personality modifiers.
   */
  _chooseLocationForSurvivor(npc, allNpcs) {
    const scores = {};

    // Base weights
    for (let loc of CAMP_LOCATIONS) {
      scores[loc] = CAMP_LOCATION_WEIGHTS[loc];
    }

    // Relationship clustering
    for (let other of allNpcs) {
      if (other.id === npc.id) continue;

      const otherLoc = this.locations[other.id];
      if (!otherLoc) continue;

      const trust = gameManager.getRelationshipValue(npc.id, other.id);

      if (trust > 70) scores[otherLoc] += 1.5;
      if (trust < 30) scores[otherLoc] -= 1.5;
    }

    // Personality modifiers
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
      scores.rocky += 2;
      scores.waterfallTrail += 1;
    }

    // Build weighted pool
    const pool = [];

    for (let [loc, score] of Object.entries(scores)) {
      const count = Math.max(0, Math.round(score));
      for (let i = 0; i < count; i++) pool.push(loc);
    }

    if (pool.length === 0) return "shelter";

    return pool[getRandomInt(0, pool.length - 1)];
  }

  /**
   * Rare confrontation events (10–20%).
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
            fights.push({
              type: "confrontation",
              npcAId: npcA.id,
              npcBId: npcB.id,
              location: locA,
              intensity: getRandomInt(1, 3)
            });
          }
        }
      }
    }

    this.lastFights = fights;

    if (fights.length > 0) {
      eventManager.publish("NPC_CONFRONTATION", { fights });
    }
  }

  getLocation(id) {
    return this.locations[id] || null;
  }

  getSurvivorsAtLocation(locationName) {
    const survivors = gameManager.survivors || [];
    return survivors.filter(s => this.locations[s.id] === locationName);
  }
}

const npcLocationSystem = new NpcLocationSystem();
export default npcLocationSystem;