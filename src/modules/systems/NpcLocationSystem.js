/**
 * NpcLocationSystem.js
 * Handles NPC placement across camp locations for each camp phase.
 * Factors in relationships, personality, spawn weights,
 * and can generate rare confrontation events.
 */

import gameManager from "../core/GameManager.js";
import { randomInt } from "../utils/CommonUtils.js";
import eventManager, { GameEvents } from "../core/EventManager.js";

export const CAMP_LOCATION_WEIGHTS = {
    // Tier 1 — Hubs (highest traffic, most group activity)
    BeachView: 4,
    ShelterView: 4,

    // Tier 2 — Common social areas
    CampfireView: 3,
    WaterWellView: 3,

    // Tier 3 — Suspicious / alone zones
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
    }

    reset() {
        this.locations = {};
        this.phaseAssigned = false;
    }

    /**
     * MAIN ENTRY — Assign NPCs to locations at the start of each camp phase.
     * This uses weighted random selection + relationship adjustments.
     */
    assignLocationsForPhase(survivors) {
        this.locations = {};
        this.phaseAssigned = true;

        // Exclude the player from NPC spawning
        const npcs = survivors.filter(s => !s.isPlayer);

        // Shuffle NPCs to avoid ordering bias
        const shuffled = [...npcs].sort(() => Math.random() - 0.5);

        for (let npc of shuffled) {
            const location = this._chooseLocationForSurvivor(npc, shuffled);
            this.locations[npc.id] = location;
        }

        // After all placements: check for fights
        this._evaluatePotentialConfrontations(shuffled);

        eventManager.publish(GameEvents.NPC_LOCATIONS_ASSIGNED, {
            locations: this.locations,
        });
    }

    /**
     * Weighted location choice with relationship and personality modifiers.
     */
    _chooseLocationForSurvivor(npc, allNpcs) {
        // Step 1: Start with base weights
        let locationScores = {};
        for (let loc of CAMP_LOCATIONS) {
            locationScores[loc] = CAMP_LOCATION_WEIGHTS[loc];
        }

        // Step 2: Relationship influence
        for (let other of allNpcs) {
            if (other.id === npc.id) continue;

            const npcLoc = this.locations[other.id];
            if (!npcLoc) continue;

            const trust = gameManager.getRelationshipValue(npc.id, other.id);

            if (trust > 70) {
                // Allies cluster
                locationScores[npcLoc] += 1.5;
            }
            if (trust < 30) {
                // Enemies avoid each other
                locationScores[npcLoc] -= 1.5;
            }
        }

        // Step 3: Personality modifiers (if defined)
        if (npc.personalityTraits) {
            if (npc.personalityTraits.includes("paranoid")) {
                locationScores.WaterWellView += 1;
                locationScores.JungleTrailView += 1;
            }
            if (npc.personalityTraits.includes("idol_hunter")) {
                locationScores.JungleTrailView += 2;
                locationScores.MountainTrailView += 2;
                locationScores.WaterfallTrailView += 2;
            }
            if (npc.personalityTraits.includes("social")) {
                locationScores.BeachView += 2;
                locationScores.ShelterView += 2;
            }
            if (npc.personalityTraits.includes("loner")) {
                locationScores.RockyShoreView += 2;
                locationScores.WaterfallTrailView += 1;
            }
        }

        // Step 4: Convert to weighted pool
        const weightedPool = [];
        for (let [loc, score] of Object.entries(locationScores)) {
            const normalized = Math.max(0, Math.round(score));
            for (let i = 0; i < normalized; i++) {
                weightedPool.push(loc);
            }
        }

        // Step 5: Choose location
        if (weightedPool.length === 0) return "ShelterView";
        return weightedPool[randomInt(0, weightedPool.length - 1)];
    }

    /**
     * Rare confrontation events — only 10–20% chance between enemies
     */
    _evaluatePotentialConfrontations(npcs) {
        const fights = [];

        for (let npcA of npcs) {
            for (let npcB of npcs) {
                if (npcA.id >= npcB.id) continue;

                const locA = this.locations[npcA.id];
                const locB = this.locations[npcB.id];

                if (locA !== locB) continue; // must be in same location

                const trust = gameManager.getRelationshipValue(npcA.id, npcB.id);
                const reverseTrust = gameManager.getRelationshipValue(npcB.id, npcA.id);

                if (trust < 25 && reverseTrust < 25) {
                    // Roll chance for fight: 10–20%
                    const chance = Math.random();
                    if (chance < 0.15) {
                        fights.push({
                            type: "confrontation",
                            npcA,
                            npcB,
                            location: locA,
                            intensity: randomInt(1, 3),
                        });
                    }
                }
            }
        }

        if (fights.length > 0) {
            eventManager.publish(GameEvents.NPC_CONFRONTATION, { fights });
        }
    }

    /**
     * Returns where a survivor is located this phase.
     */
    getLocation(id) {
        return this.locations[id] || null;
    }

    /**
     * Returns all survivors in a given location.
     */
    getSurvivorsAtLocation(locationName) {
        return Object.entries(this.locations)
            .filter(([_, loc]) => loc === locationName)
            .map(([id]) => gameManager.survivors.find(s => s.id == id));
    }
}

const npcLocationSystem = new NpcLocationSystem();
export default npcLocationSystem;