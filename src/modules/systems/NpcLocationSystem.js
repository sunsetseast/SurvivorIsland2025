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

function isMarkedAbsent(absentSet, survivorId) {
  if (!absentSet) return false;
  return absentSet.has(survivorId) || absentSet.has(String(survivorId));
}

export const CAMP_LOCATION_WEIGHTS = {
  [LocationKeys.BEACH]: 4,
  [LocationKeys.SHELTER]: 4,
  [LocationKeys.CAMPFIRE]: 3,
  [LocationKeys.TRIBE_FLAG]: 2,
  [LocationKeys.WATER_WELL]: 3,
  [LocationKeys.FORK1]: 1,
  [LocationKeys.FORK2]: 1,
  [LocationKeys.FORK3]: 1,

  [LocationKeys.ROCKY_SHORE]: 1,
  [LocationKeys.JUNGLE_TRAIL]: 1,
  [LocationKeys.MOUNTAIN_TRAIL]: 1,
  [LocationKeys.WATERFALL_TRAIL]: 1,

  [LocationKeys.TREE_MAIL]: 1 // Player can walk here
};

// Dynamically derived key list
export const CAMP_LOCATIONS = Object.keys(CAMP_LOCATION_WEIGHTS);

export const ISLAND_LOCATION_GRAPH = Object.freeze({
  [LocationKeys.TRIBE_FLAG]: [LocationKeys.BEACH, LocationKeys.CAMPFIRE],
  [LocationKeys.BEACH]: [LocationKeys.TRIBE_FLAG, LocationKeys.ROCKY_SHORE],
  [LocationKeys.ROCKY_SHORE]: [LocationKeys.BEACH],
  [LocationKeys.CAMPFIRE]: [LocationKeys.TRIBE_FLAG, LocationKeys.SHELTER],
  [LocationKeys.SHELTER]: [LocationKeys.CAMPFIRE, LocationKeys.FORK1, LocationKeys.FORK2, LocationKeys.FORK3],
  [LocationKeys.FORK1]: [LocationKeys.SHELTER, LocationKeys.MOUNTAIN_TRAIL, LocationKeys.JUNGLE_TRAIL],
  [LocationKeys.FORK2]: [LocationKeys.SHELTER, LocationKeys.MOUNTAIN_TRAIL, LocationKeys.JUNGLE_TRAIL],
  [LocationKeys.FORK3]: [LocationKeys.SHELTER, LocationKeys.MOUNTAIN_TRAIL, LocationKeys.JUNGLE_TRAIL],
  [LocationKeys.MOUNTAIN_TRAIL]: [LocationKeys.FORK1, LocationKeys.FORK2, LocationKeys.FORK3, LocationKeys.TREE_MAIL],
  [LocationKeys.TREE_MAIL]: [LocationKeys.MOUNTAIN_TRAIL, LocationKeys.WATERFALL_TRAIL],
  [LocationKeys.WATERFALL_TRAIL]: [LocationKeys.TREE_MAIL, LocationKeys.WATER_WELL],
  [LocationKeys.WATER_WELL]: [LocationKeys.WATERFALL_TRAIL, LocationKeys.JUNGLE_TRAIL],
  [LocationKeys.JUNGLE_TRAIL]: [LocationKeys.WATER_WELL, LocationKeys.FORK1, LocationKeys.FORK2, LocationKeys.FORK3]
});

const SOCIAL_MEETING_LOCATIONS = new Set([
  LocationKeys.BEACH,
  LocationKeys.SHELTER,
  LocationKeys.CAMPFIRE,
  LocationKeys.TRIBE_FLAG,
  LocationKeys.WATER_WELL
]);

const IDOL_SUSPICION_LOCATIONS = new Set([
  LocationKeys.ROCKY_SHORE,
  LocationKeys.JUNGLE_TRAIL,
  LocationKeys.MOUNTAIN_TRAIL,
  LocationKeys.WATERFALL_TRAIL,
  LocationKeys.TREE_MAIL,
  LocationKeys.WATER_WELL
]);

const ROAM_INTERVAL_SECONDS = 240;
const FORCED_ROAM_AFTER_SECONDS = 720;
const IDOL_SUSPICION_AFTER_SECONDS = 480;

class NpcLocationSystem {
  constructor() {
    this.locations = {};    // survivorId → viewName
    this.phaseAssigned = false;
    this.lastFights = [];   // confrontation events
    this.lastPhaseUsed = null;
    this.locationSinceTimer = {};
    this.lastRoamTimer = null;
    this.meetingReservations = {};
    this.lastSuspicionTimer = {};
  }

  // So main.js can safely call initialize()
  initialize() {
    dbg("NpcLocationSystem.initialize called");
    if (typeof window !== "undefined") {
      window.NpcLocationDebug = window.NpcLocationDebug || {};
      window.NpcLocationDebug.map = () => ({ ...ISLAND_LOCATION_GRAPH });
      window.NpcLocationDebug.locations = () => ({ ...this.locations });
      window.NpcLocationDebug.counts = () => this.getLocationCounts();
      window.NpcLocationDebug.forceRoam = () => this.advanceRoaming({
        currentTime: (gameManager.getDayTimer?.() ?? gameManager.dayTimer ?? 0) - ROAM_INTERVAL_SECONDS,
        phase: gameManager.getGamePhase?.() || gameManager.gamePhase,
        currentView: window.campScreen?.currentView || null
      });
    }
  }

  reset() {
    this.locations = {};
    this.phaseAssigned = false;
    this.lastFights = [];
    this.locationSinceTimer = {};
    this.lastRoamTimer = null;
    this.meetingReservations = {};
    this.lastSuspicionTimer = {};
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
    this.locationSinceTimer = {};
    this.meetingReservations = {};
    this.lastSuspicionTimer = {};
    this.lastRoamTimer = gameManager.getDayTimer?.() ?? gameManager.dayTimer ?? null;

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

    const absentSet = gameManager.flags?.absentFromCampIds;
    if (absentSet?.size) {
      window.debugBanner?.('ABSENT NPC ACTIVE', Array.from(absentSet).join(', '));
    }

    // Only NPCs FROM PLAYER'S TRIBE and not marked absent
    const npcs = roster.filter(s => !s.isPlayer && !isMarkedAbsent(absentSet, s.id));
    roster.forEach((npc) => {
      if (!npc?.isPlayer && isMarkedAbsent(absentSet, npc.id)) {
        npc.location = null;
      }
    });
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
      this.locationSinceTimer[npc.id] = this.lastRoamTimer;
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

    // TRUST-based adjustments
    for (let other of allNpcs) {
      if (other.id === npc.id) continue;

      const otherLoc = this.locations[other.id];
      if (!otherLoc) continue;
      if (scores[otherLoc] === undefined) continue; // safety

      const trust = gameManager.getTrust(npc.id, other.id);

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
      const trust = gameManager.getTrust(npc.id, other.id);
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
          const timer = gameManager.getDayTimer?.() ?? gameManager.dayTimer ?? null;
          this.locationSinceTimer[npcA.id] = timer;
          this.locationSinceTimer[npcB.id] = timer;
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

        const trustAB = gameManager.getTrust(A.id, B.id);
        const trustBA = gameManager.getTrust(B.id, A.id);

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
    if (id == null) return null;
    return this.locations[id] || this.locations[String(id)] || null;
  }

  getAdjacentLocations(locationKey) {
    const normalized = normalizeLocationKey(locationKey);
    if (!normalized) return [];
    return ISLAND_LOCATION_GRAPH[normalized] || [];
  }

  getBestMeetingLocation(npcId, { preferredLocation = null, currentView = null } = {}) {
    const preferred = normalizeLocationKey(preferredLocation);
    const currentNpcLocation = normalizeLocationKey(this.getLocation(npcId));

    if (preferred && isCoreCampLocation(preferred)) {
      if (!currentNpcLocation) return preferred;
      const reachable = preferred === currentNpcLocation || this.getAdjacentLocations(currentNpcLocation).includes(preferred);
      if (reachable) return preferred;
    }

    if (currentNpcLocation && isCoreCampLocation(currentNpcLocation)) {
      if (SOCIAL_MEETING_LOCATIONS.has(currentNpcLocation)) return currentNpcLocation;
      const nearbySocial = this.getAdjacentLocations(currentNpcLocation).find(loc => SOCIAL_MEETING_LOCATIONS.has(loc));
      if (nearbySocial) return nearbySocial;
      return currentNpcLocation;
    }

    const currentPlayerView = normalizeLocationKey(currentView);
    if (currentPlayerView && isCoreCampLocation(currentPlayerView)) {
      return currentPlayerView;
    }

    return LocationKeys.CAMPFIRE;
  }

  reserveNpcForMeeting(npcId, locationKey, { reason = "meeting", ttlMs = 180000 } = {}) {
    const normalized = normalizeLocationKey(locationKey);
    if (!npcId || !isCoreCampLocation(normalized)) return null;
    const key = String(npcId);
    this.meetingReservations[key] = {
      location: normalized,
      reason,
      expiresAt: Date.now() + ttlMs
    };
    this.updateNpcLocation(npcId, normalized, { reason });
    return normalized;
  }

  releaseNpcMeetingReservation(npcId, { reason = "meeting_released" } = {}) {
    const key = String(npcId);
    if (!npcId || !this.meetingReservations[key]) return;
    delete this.meetingReservations[key];
    eventManager.publish("npc:locationUpdated", { npcId, locationKey: this.getLocation(npcId), reason });
  }

  advanceRoaming({ currentTime = null, phase = null, currentView = null } = {}) {
    if (gameManager.flags?.campEventActive) return;
    const timer = Number.isFinite(currentTime) ? currentTime : (gameManager.getDayTimer?.() ?? gameManager.dayTimer ?? null);
    if (!Number.isFinite(timer)) return;
    if (this.lastRoamTimer == null) {
      this.lastRoamTimer = timer;
      return;
    }

    const elapsedSinceRoam = this.lastRoamTimer - timer;
    this._expireMeetingReservations();
    this._applyLoiterSuspicion(timer);
    if (elapsedSinceRoam < ROAM_INTERVAL_SECONDS) return;

    this.lastRoamTimer = timer;
    const tribe = gameManager.getPlayerTribe();
    const absentSet = gameManager.flags?.absentFromCampIds;
    const moved = [];
    const npcs = (tribe?.members || []).filter(member => member && !member.isPlayer && !isMarkedAbsent(absentSet, member.id));
    const normalizedCurrentView = normalizeLocationKey(currentView);

    npcs.forEach(npc => {
      if (this._isReservedForMeeting(npc.id)) return;
      const from = normalizeLocationKey(this.locations[npc.id]) || LocationKeys.SHELTER;
      const neighbors = this.getAdjacentLocations(from).filter(isCoreCampLocation);
      if (!neighbors.length) return;

      const since = this.locationSinceTimer[npc.id];
      const dwellSeconds = Number.isFinite(since) ? Math.max(0, since - timer) : 0;
      const shouldMove = dwellSeconds >= FORCED_ROAM_AFTER_SECONDS || Math.random() < this._getRoamChance(npc, from, phase);
      if (!shouldMove) return;

      const to = this._pickNextLocation(npc, from, neighbors, { phase, currentView: normalizedCurrentView });
      if (!to || to === from) return;
      this.locations[npc.id] = to;
      npc.location = to;
      this.locationSinceTimer[npc.id] = timer;
      moved.push({ npcId: npc.id, from, to });
    });

    if (moved.length) {
      eventManager.publish("npc:locationsRoamed", { moved, currentTime: timer, phase });
      eventManager.publish("npc:locationUpdated", { reason: "roam", moved });
    }
  }

  getSurvivorsAtLocation(locationName) {
    const results = [];
    const tribe = gameManager.getPlayerTribe();
    if (!tribe) return results;
    const canonicalLocation = normalizeLocationKey(locationName);
    if (!canonicalLocation) return results;

    const absentSet = gameManager.flags?.absentFromCampIds;

    for (let s of tribe.members) {
      const assignedLocation = normalizeLocationKey(this.locations[s.id]);
      if (!s.isPlayer && !isMarkedAbsent(absentSet, s.id) && assignedLocation === canonicalLocation) {
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
    const key = String(npcId);
    this.locations[key] = normalized;
    this.locationSinceTimer[key] = gameManager.getDayTimer?.() ?? gameManager.dayTimer ?? this.locationSinceTimer[key] ?? null;
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

  _isReservedForMeeting(npcId) {
    const key = String(npcId);
    const reservation = this.meetingReservations[key];
    if (!reservation) return false;
    if (reservation.expiresAt && reservation.expiresAt < Date.now()) {
      delete this.meetingReservations[key];
      return false;
    }
    return true;
  }

  _expireMeetingReservations() {
    Object.keys(this.meetingReservations).forEach(npcId => {
      this._isReservedForMeeting(npcId);
    });
  }

  _getRoamChance(npc, location, phase) {
    let chance = phase === "post" ? 0.22 : 0.18;
    const traits = npc.personalityTraits || [];
    const style = String(npc.gameplayStyle || npc.personality || "").toLowerCase();
    if (traits.includes("idol_hunter") || style.includes("shadow") || style.includes("strateg")) chance += 0.08;
    if (traits.includes("social") && SOCIAL_MEETING_LOCATIONS.has(location)) chance -= 0.04;
    if (traits.includes("loner") && IDOL_SUSPICION_LOCATIONS.has(location)) chance -= 0.04;
    return Math.max(0.08, Math.min(0.42, chance));
  }

  _pickNextLocation(npc, from, neighbors, { phase = null, currentView = null } = {}) {
    const traits = npc.personalityTraits || [];
    const style = String(npc.gameplayStyle || npc.personality || "").toLowerCase();
    const weighted = [];

    neighbors.forEach(location => {
      let score = 2;
      if (CAMP_LOCATION_WEIGHTS[location]) score += CAMP_LOCATION_WEIGHTS[location] * 0.25;
      if (phase === "post" && [LocationKeys.CAMPFIRE, LocationKeys.SHELTER, LocationKeys.WATER_WELL].includes(location)) score += 1;
      if (traits.includes("social") && SOCIAL_MEETING_LOCATIONS.has(location)) score += 2;
      if ((traits.includes("idol_hunter") || style.includes("shadow")) && IDOL_SUSPICION_LOCATIONS.has(location)) score += 1.5;
      if (traits.includes("loner") && [LocationKeys.ROCKY_SHORE, LocationKeys.WATERFALL_TRAIL, LocationKeys.TREE_MAIL].includes(location)) score += 2;
      if (currentView && location === currentView) score += 0.75;
      if (location === from) score = 0;

      const count = Math.max(1, Math.round(score));
      for (let i = 0; i < count; i++) weighted.push(location);
    });

    if (!weighted.length) return neighbors[getRandomInt(0, neighbors.length - 1)];
    return weighted[getRandomInt(0, weighted.length - 1)];
  }

  _applyLoiterSuspicion(currentTime) {
    const tribe = gameManager.getPlayerTribe();
    if (!tribe?.members?.length) return;
    tribe.members.forEach(npc => {
      if (!npc || npc.isPlayer || this._isReservedForMeeting(npc.id)) return;
      const location = normalizeLocationKey(this.locations[npc.id]);
      if (!IDOL_SUSPICION_LOCATIONS.has(location)) return;
      const since = this.locationSinceTimer[npc.id];
      if (!Number.isFinite(since)) return;
      const dwellSeconds = Math.max(0, since - currentTime);
      if (dwellSeconds < IDOL_SUSPICION_AFTER_SECONDS) return;
      const lastNoted = this.lastSuspicionTimer[npc.id];
      if (Number.isFinite(lastNoted) && lastNoted - currentTime < IDOL_SUSPICION_AFTER_SECONDS) return;

      npc.idolSuspicion = Math.min(100, (npc.idolSuspicion ?? npc.suspicion ?? 0) + 2);
      npc.suspicion = Math.min(100, (npc.suspicion ?? 0) + 1);
      this.lastSuspicionTimer[npc.id] = currentTime;
      eventManager.publish("npc:idolSuspicionRaised", {
        npcId: npc.id,
        location,
        dwellSeconds,
        idolSuspicion: npc.idolSuspicion
      });
    });
  }
}

const npcLocationSystem = new NpcLocationSystem();
export default npcLocationSystem;
