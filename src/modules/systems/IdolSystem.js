/**
 * @module IdolSystem
 * Manages hidden immunity idols and clues during the camp phase
 */

import eventManager, { GameEvents } from '../core/EventManager.js';
import { GamePhase } from '../core/GameManager.js';
import { generateId, getRandomInt } from '../utils/CommonUtils.js';

export const ELIGIBLE_IDOL_LOCATIONS = [
  'BeachView',
  'CampfireView',
  'JungleTrailView',
  'MountainTrailView',
  'RockyShoreView',
  'ShelterView',
  'TreeMailView',
  'TribeFlagView',
  'WaterfallTrailView',
  'WaterWellView'
];

const LOCATION_NAMES = {
  BeachView: 'Beach',
  CampfireView: 'Campfire',
  JungleTrailView: 'Jungle Trail',
  MountainTrailView: 'Mountain Trail',
  RockyShoreView: 'Rocky Shore',
  ShelterView: 'Shelter',
  TreeMailView: 'Tree Mail',
  TribeFlagView: 'Tribe Flag',
  WaterfallTrailView: 'Waterfall Trail',
  WaterWellView: 'Water Well'
};

const CLUE_TEMPLATES = {
  BeachView: [
    'Where the waves soften the shoreline, the idol waits near the {location}.',
    'The sand whispers at the {location}—that is where the idol rests.',
    'When the tide hums, the {location} hides the prize you seek.'
  ],
  CampfireView: [
    'Follow the smoke and embers to the {location}.',
    'Ash and ember guard the idol at the {location}.',
    'Where warmth gathers, so does power — the {location}.'
  ],
  JungleTrailView: [
    'The jungle thickens where the {location} bends.',
    'Leave the path and listen; the {location} keeps its secret.',
    'Vines and shadows point toward the {location}.'
  ],
  MountainTrailView: [
    'Higher ground reveals the {location}.',
    'Stone and wind guide you to the {location}.',
    'The climb ends where the {location} begins.'
  ],
  RockyShoreView: [
    'Jagged stone and salt spray mark the {location}.',
    'Seek the idol where the rocks break the tide — the {location}.',
    'The shore grows sharp at the {location}.'
  ],
  ShelterView: [
    'Home holds secrets; the {location} conceals the idol.',
    'Beneath woven shade, the {location} keeps its secret.',
    'The idol hides close to camp at the {location}.'
  ],
  TreeMailView: [
    'News brings power; follow the path to the {location}.',
    'Where messages hang, so does fortune — the {location}.',
    'The idol waits near the {location}, where word travels.'
  ],
  TribeFlagView: [
    'Pride marks the {location}.',
    'Where your colors fly, the {location} keeps the idol.',
    'Honor and power meet at the {location}.'
  ],
  WaterfallTrailView: [
    'Mist and roar conceal the {location}.',
    'Where water thunders, the {location} hides the idol.',
    'The trail of spray points to the {location}.'
  ],
  WaterWellView: [
    'Still water mirrors the {location}.',
    'Quench your thirst at the {location}, but keep searching.',
    'The idol rests where canteens are filled — the {location}.'
  ]
};

const HUNT_SETTINGS = {
  casual: {
    timeCost: 300,
    idolChance: 0.12,
    clueChance: 0.22
  },
  aggressive: {
    timeCost: 900,
    idolChance: 0.2,
    clueChance: 0.3,
    suspicion: 5
  }
};

class IdolSystem {
  constructor(gameManager) {
    this.gameManager = gameManager;
    this.tribeIdolStates = new Map();
    this.tribeClueStates = new Map();
    this.survivorInventories = new Map();
    this.casualSearchCounts = new Map();
    this.currentCampPhaseId = null;
    this.initialSpawnCompleted = false;
  }

  initialize() {
    eventManager.subscribe(GameEvents.GAME_PHASE_CHANGED, ({ phase }) => {
      if (phase === GamePhase.PRE_CHALLENGE || phase === GamePhase.POST_CHALLENGE) {
        this.currentCampPhaseId = this.currentCampPhaseId || this._buildCampPhaseId();
      }
    });
  }

  reset() {
    this.tribeIdolStates.clear();
    this.tribeClueStates.clear();
    this.survivorInventories.clear();
    this.casualSearchCounts.clear();
    this.currentCampPhaseId = null;
    this.initialSpawnCompleted = false;
  }

  spawnInitialForAllTribes() {
    if (this.initialSpawnCompleted || !this.gameManager.gameSettings?.enableIdols) {
      return;
    }

    const tribes = this.gameManager.getTribes();
    if (!tribes || tribes.length === 0) return;

    tribes.forEach((tribe, index) => {
      const tribeId = this._getTribeIdFromTribe(tribe, index);
      if (tribeId) {
        this._spawnIdolAndClueForTribe(tribeId, { requireNewLocations: false });
      }
    });

    this.initialSpawnCompleted = true;
  }

  startNewCampPhase(reason = {}) {
    this.currentCampPhaseId = this._buildCampPhaseId();
    this.casualSearchCounts.clear();
    return {
      ok: true,
      reason,
      campPhaseId: this.currentCampPhaseId
    };
  }

  respawnAfterIdolUsed(tribeId) {
    const idolState = this.tribeIdolStates.get(tribeId);
    if (idolState) {
      idolState.isUsed = true;
      idolState.usedOnDay = this.gameManager.getDay();
      eventManager.publish(GameEvents.IDOL_USED, {
        tribeId,
        idolId: idolState.id,
        usedById: idolState.foundById
      });
    }

    this._spawnIdolAndClueForTribe(tribeId, { requireNewLocations: true });
  }

  attemptIntentionalHunt(survivorId, locationKey, mode) {
    const safeLocationKey = locationKey || 'unknown';
    const via = 'intentional';

    if (!this.gameManager.gameSettings?.enableIdols) {
      return this._buildResult({
        ok: false,
        outcome: 'ERROR',
        via,
        mode,
        locationKey: safeLocationKey,
        tribeId: 'unknown',
        message: 'Idol hunting is currently disabled.'
      });
    }

    const survivor = this._getSurvivorById(survivorId);
    if (!survivor) {
      return this._buildResult({
        ok: false,
        outcome: 'ERROR',
        via,
        mode,
        locationKey: safeLocationKey,
        tribeId: 'unknown',
        message: 'Unable to find the survivor for this hunt.'
      });
    }

    if (!ELIGIBLE_IDOL_LOCATIONS.includes(safeLocationKey)) {
      return this._buildResult({
        ok: false,
        outcome: 'ERROR',
        via,
        mode,
        locationKey: safeLocationKey,
        tribeId: 'unknown',
        message: 'This location cannot be searched for idols.'
      });
    }

    const tribeId = this.getTribeIdForSurvivor(survivorId);
    if (!tribeId) {
      return this._buildResult({
        ok: false,
        outcome: 'ERROR',
        via,
        mode,
        locationKey: safeLocationKey,
        tribeId: 'unknown',
        message: 'Unable to determine tribe for this hunt.'
      });
    }

    const settings = HUNT_SETTINGS[mode];
    if (!settings) {
      return this._buildResult({
        ok: false,
        outcome: 'ERROR',
        via,
        mode,
        locationKey: safeLocationKey,
        tribeId,
        message: 'Unknown hunt mode.'
      });
    }

    if (mode === 'casual') {
      const casualCount = this.getCasualSearchCount(survivorId, safeLocationKey);
      if (casualCount >= 2) {
        return this._buildResult({
          ok: false,
          outcome: 'BLOCKED',
          via,
          mode,
          locationKey: safeLocationKey,
          tribeId,
          message: 'You have already searched this area twice during this camp phase.'
        });
      }
      this._incrementCasualSearch(survivorId, safeLocationKey);
    }

    this.gameManager.deductTime(settings.timeCost);

    if (mode === 'aggressive') {
      survivor.suspicion = (survivor.suspicion || 0) + settings.suspicion;
    }

    const idolState = this.tribeIdolStates.get(tribeId);
    const clueState = this.tribeClueStates.get(tribeId);

    const idolHiddenHere =
      idolState &&
      !idolState.isFound &&
      !idolState.isUsed &&
      idolState.locationKey === safeLocationKey;

    let idolChance = settings.idolChance;
    if (idolHiddenHere && this._hasActiveClueForLocation(survivorId, idolState.locationKey)) {
      idolChance += 0.1;
    }

    if (idolHiddenHere && Math.random() < idolChance) {
      const clueExpired = this._handleIdolFound({
        idolState,
        survivor,
        tribeId,
        locationKey: safeLocationKey,
        via: 'intentional',
        mode
      });
      return this._buildResult({
        ok: true,
        outcome: 'IDOL_FOUND',
        via,
        mode,
        locationKey: safeLocationKey,
        tribeId,
        message: 'You found a Hidden Immunity Idol!',
        foundIdol: true,
        idolId: idolState.id,
        clueExpired
      });
    }

    const clueHiddenHere =
      clueState &&
      !clueState.isFound &&
      !clueState.expired &&
      clueState.hiddenAtLocationKey === safeLocationKey;

    if (clueHiddenHere && Math.random() < settings.clueChance) {
      this._handleClueFound({
        clueState,
        survivor,
        tribeId,
        locationKey: safeLocationKey,
        via: 'intentional',
        mode
      });
      return this._buildResult({
        ok: true,
        outcome: 'CLUE_FOUND',
        via,
        mode,
        locationKey: safeLocationKey,
        tribeId,
        message: 'You discovered a clue to the hidden idol.',
        foundClue: true,
        clueId: clueState.id
      });
    }

    return this._buildResult({
      ok: true,
      outcome: 'NOTHING',
      via,
      mode,
      locationKey: safeLocationKey,
      tribeId,
      message: 'You search the area but find nothing unusual.'
    });
  }

  attemptIncidentalFind(survivorId, mappedLocationKey, sourceTag) {
    const safeLocationKey = mappedLocationKey || 'unknown';
    const via = 'incidental';

    if (!this.gameManager.gameSettings?.enableIdols) {
      return this._buildResult({
        ok: false,
        outcome: 'ERROR',
        via,
        locationKey: safeLocationKey,
        tribeId: 'unknown',
        message: 'Idol discoveries are currently disabled.'
      });
    }

    const survivor = this._getSurvivorById(survivorId);
    if (!survivor) {
      return this._buildResult({
        ok: false,
        outcome: 'ERROR',
        via,
        locationKey: safeLocationKey,
        tribeId: 'unknown',
        message: 'Unable to identify the survivor for this find.'
      });
    }

    const tribeId = this.getTribeIdForSurvivor(survivorId);
    if (!tribeId) {
      return this._buildResult({
        ok: false,
        outcome: 'ERROR',
        via,
        locationKey: safeLocationKey,
        tribeId: 'unknown',
        message: 'Unable to determine the survivor tribe.'
      });
    }

    const idolState = this.tribeIdolStates.get(tribeId);
    const clueState = this.tribeClueStates.get(tribeId);

    const idolHiddenHere =
      idolState &&
      !idolState.isFound &&
      !idolState.isUsed &&
      idolState.locationKey === mappedLocationKey;

    const clueHiddenHere =
      clueState &&
      !clueState.isFound &&
      !clueState.expired &&
      clueState.hiddenAtLocationKey === mappedLocationKey;

    if (!idolHiddenHere && !clueHiddenHere) {
      return this._buildResult({
        ok: true,
        outcome: 'NOTHING',
        via,
        locationKey: safeLocationKey,
        tribeId,
        message: 'Nothing unusual catches your eye.'
      });
    }

    if (Math.random() >= 0.06) {
      return this._buildResult({
        ok: true,
        outcome: 'NOTHING',
        via,
        locationKey: safeLocationKey,
        tribeId,
        message: 'You notice nothing out of the ordinary.'
      });
    }

    if (idolHiddenHere) {
      const clueExpired = this._handleIdolFound({
        idolState,
        survivor,
        tribeId,
        locationKey: mappedLocationKey,
        via: 'incidental',
        sourceTag
      });
      return this._buildResult({
        ok: true,
        outcome: 'IDOL_FOUND',
        via,
        locationKey: safeLocationKey,
        tribeId,
        message: 'A hidden idol turns up unexpectedly.',
        foundIdol: true,
        idolId: idolState.id,
        clueExpired
      });
    }

    if (clueHiddenHere) {
      this._handleClueFound({
        clueState,
        survivor,
        tribeId,
        locationKey: mappedLocationKey,
        via: 'incidental',
        sourceTag
      });
      return this._buildResult({
        ok: true,
        outcome: 'CLUE_FOUND',
        via,
        locationKey: safeLocationKey,
        tribeId,
        message: 'You stumble upon an idol clue.',
        foundClue: true,
        clueId: clueState.id
      });
    }

    return this._buildResult({
      ok: true,
      outcome: 'NOTHING',
      via,
      locationKey: safeLocationKey,
      tribeId,
      message: 'Nothing unusual turns up.'
    });
  }

  getTribeIdolState(tribeId) {
    return this.tribeIdolStates.get(tribeId) || null;
  }

  getTribeClueState(tribeId) {
    return this.tribeClueStates.get(tribeId) || null;
  }

  getSurvivorInventory(survivorId) {
    return this._ensureSurvivorInventory(survivorId);
  }

  markClueRead(survivorId, clueId) {
    const inventory = this._ensureSurvivorInventory(survivorId);
    const clue = inventory.clues.find(item => item.id === clueId);
    if (clue) {
      clue.read = true;
    }
  }

  getCasualSearchCount(survivorId, locationKey) {
    const key = this._casualCountKey(survivorId, locationKey);
    return this.casualSearchCounts.get(key) || 0;
  }

  _spawnIdolAndClueForTribe(tribeId, { requireNewLocations }) {
    const previousIdol = this.tribeIdolStates.get(tribeId);
    const previousClue = this.tribeClueStates.get(tribeId);

    const idolLocation = this._pickRandomLocation([
      ...(requireNewLocations && previousIdol?.locationKey ? [previousIdol.locationKey] : [])
    ]);

    const clueLocation = this._pickRandomLocation([
      idolLocation,
      ...(requireNewLocations && previousClue?.hiddenAtLocationKey ? [previousClue.hiddenAtLocationKey] : [])
    ]);

    const idolState = {
      id: generateId(),
      tribeId,
      locationKey: idolLocation,
      isFound: false,
      foundById: null,
      foundOnDay: null,
      isUsed: false,
      usedOnDay: null
    };

    const clueState = {
      id: generateId(),
      tribeId,
      hiddenAtLocationKey: clueLocation,
      pointsToLocationKey: idolLocation,
      text: this._generateClueText(idolLocation),
      foundById: null,
      foundOnDay: null,
      expired: false,
      read: false,
      isFound: false
    };

    this.tribeIdolStates.set(tribeId, idolState);
    this.tribeClueStates.set(tribeId, clueState);
  }

  _generateClueText(pointsToLocationKey) {
    const templates = CLUE_TEMPLATES[pointsToLocationKey] || [];
    const locationName = LOCATION_NAMES[pointsToLocationKey] || pointsToLocationKey;

    if (templates.length === 0) {
      return `Look carefully near the ${locationName} for the hidden idol.`;
    }

    const template = templates[getRandomInt(0, templates.length - 1)];
    return template.replace('{location}', locationName);
  }

  _handleIdolFound({ idolState, survivor, tribeId, locationKey, via, mode, sourceTag }) {
    idolState.isFound = true;
    idolState.foundById = survivor.id;
    idolState.foundOnDay = this.gameManager.getDay();

    const inventory = this._ensureSurvivorInventory(survivor.id);
    if (!inventory.idols.includes(idolState)) {
      inventory.idols.push(idolState);
    }

    const clueExpired = this._expireClueForTribe(tribeId);

    eventManager.publish(GameEvents.IDOL_FOUND, {
      survivorId: survivor.id,
      tribeId,
      locationKey,
      isPlayer: survivor.isPlayer === true,
      via,
      mode,
      sourceTag
    });

    if (survivor.isPlayer) {
      this._showPlayerNotification('You found a Hidden Immunity Idol!', 'success');
    }

    return clueExpired;
  }

  _handleClueFound({ clueState, survivor, tribeId, locationKey, via, mode, sourceTag }) {
    clueState.isFound = true;
    clueState.foundById = survivor.id;
    clueState.foundOnDay = this.gameManager.getDay();

    const inventory = this._ensureSurvivorInventory(survivor.id);
    if (!inventory.clues.includes(clueState)) {
      inventory.clues.push(clueState);
    }

    eventManager.publish(GameEvents.CLUE_FOUND, {
      survivorId: survivor.id,
      tribeId,
      locationKey,
      isPlayer: survivor.isPlayer === true,
      via,
      mode,
      sourceTag
    });

    if (survivor.isPlayer) {
      this._showPlayerNotification('You found an idol clue!', 'info');
    }
  }

  _expireClueForTribe(tribeId) {
    const clueState = this.tribeClueStates.get(tribeId);
    if (!clueState || clueState.expired) return false;

    clueState.expired = true;

    this.survivorInventories.forEach(inventory => {
      inventory.clues.forEach(clue => {
        if (clue.tribeId === tribeId) {
          clue.expired = true;
        }
      });
    });

    eventManager.publish(GameEvents.CLUE_EXPIRED, {
      tribeId,
      clueId: clueState.id
    });

    return true;
  }

  _showPlayerNotification(message, type) {
    this.gameManager.systems?.dialogueSystem?.showNotification?.(message, type, 4000);
  }

  _hasActiveClueForLocation(survivorId, locationKey) {
    const inventory = this._ensureSurvivorInventory(survivorId);
    return inventory.clues.some(
      clue => !clue.expired && clue.pointsToLocationKey === locationKey
    );
  }

  _incrementCasualSearch(survivorId, locationKey) {
    const key = this._casualCountKey(survivorId, locationKey);
    const count = this.casualSearchCounts.get(key) || 0;
    this.casualSearchCounts.set(key, count + 1);
  }

  _casualCountKey(survivorId, locationKey) {
    return `${this.currentCampPhaseId || 'camp'}:${survivorId}:${locationKey}`;
  }

  _buildCampPhaseId() {
    const day = this.gameManager.getDay?.() ?? this.gameManager.day ?? 1;
    const phase = this.gameManager.getGamePhase?.() ?? this.gameManager.gamePhase ?? 'camp';
    return `day${day}_${phase}`;
  }

  _buildResult({
    ok = true,
    outcome = 'NOTHING',
    via,
    mode,
    locationKey,
    tribeId,
    message,
    foundIdol = false,
    foundClue = false,
    idolId,
    clueId,
    clueExpired = false
  }) {
    return {
      ok,
      outcome,
      via,
      mode,
      locationKey,
      tribeId,
      message,
      foundIdol,
      foundClue,
      idolId,
      clueId,
      clueExpired
    };
  }

  getTribeIdForSurvivor(survivorId) {
    return this._getSurvivorTribeId(survivorId);
  }

  _pickRandomLocation(exclude = []) {
    const available = ELIGIBLE_IDOL_LOCATIONS.filter(key => !exclude.includes(key));
    if (available.length === 0) {
      return ELIGIBLE_IDOL_LOCATIONS[0];
    }
    return available[getRandomInt(0, available.length - 1)];
  }

  _ensureSurvivorInventory(survivorId) {
    if (!this.survivorInventories.has(survivorId)) {
      this.survivorInventories.set(survivorId, { idols: [], clues: [] });
    }
    return this.survivorInventories.get(survivorId);
  }

  _getSurvivorById(id) {
    const tribes = this.gameManager.getTribes();
    for (const tribe of tribes) {
      const survivor = tribe.members.find(member => member.id === id);
      if (survivor) return survivor;
    }
    return null;
  }

  _getSurvivorTribeId(id) {
    const tribes = this.gameManager.getTribes();
    for (let index = 0; index < tribes.length; index += 1) {
      const tribe = tribes[index];
      if (tribe.members.some(member => member.id === id)) {
        return this._getTribeIdFromTribe(tribe, index);
      }
    }
    return null;
  }

  _getTribeIdFromTribe(tribe, index) {
    if (tribe?.tribeId) return tribe.tribeId;
    const memberId = tribe?.members?.[0]?.tribeId;
    return memberId || index + 1;
  }
}

export default IdolSystem;
