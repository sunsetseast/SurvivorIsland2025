/**
 * @module IdolSystem
 * Manages hidden immunity idols and clues during the camp phase
 */

import eventManager, { GameEvents } from '../core/EventManager.js';
import { generateId, getRandomInt } from '../utils/CommonUtils.js';
import { LocationKeys } from '../core/LocationKeys.js';

export const ELIGIBLE_IDOL_LOCATIONS = [
  LocationKeys.BEACH,
  LocationKeys.CAMPFIRE,
  LocationKeys.JUNGLE_TRAIL,
  LocationKeys.MOUNTAIN_TRAIL,
  LocationKeys.ROCKY_SHORE,
  LocationKeys.SHELTER,
  LocationKeys.TREE_MAIL,
  LocationKeys.TRIBE_FLAG,
  LocationKeys.WATERFALL_TRAIL,
  LocationKeys.WATER_WELL
];

const LOCATION_NAMES = {
  [LocationKeys.BEACH]: 'Beach',
  [LocationKeys.CAMPFIRE]: 'Campfire',
  [LocationKeys.JUNGLE_TRAIL]: 'Jungle Trail',
  [LocationKeys.MOUNTAIN_TRAIL]: 'Mountain Trail',
  [LocationKeys.ROCKY_SHORE]: 'Rocky Shore',
  [LocationKeys.SHELTER]: 'Shelter',
  [LocationKeys.TREE_MAIL]: 'Tree Mail',
  [LocationKeys.TRIBE_FLAG]: 'Tribe Flag',
  [LocationKeys.WATERFALL_TRAIL]: 'Waterfall Trail',
  [LocationKeys.WATER_WELL]: 'Water Well'
};

const CLUE_TEMPLATES = {
  [LocationKeys.BEACH]: [
    'Where the waves soften the shoreline, the idol waits near the {location}.',
    'The sand whispers at the {location}—that is where the idol rests.',
    'When the tide hums, the {location} hides the prize you seek.'
  ],
  [LocationKeys.CAMPFIRE]: [
    'Follow the smoke and embers to the {location}.',
    'Ash and ember guard the idol at the {location}.',
    'Where warmth gathers, so does power — the {location}.'
  ],
  [LocationKeys.JUNGLE_TRAIL]: [
    'The jungle thickens where the {location} bends.',
    'Leave the path and listen; the {location} keeps its secret.',
    'Vines and shadows point toward the {location}.'
  ],
  [LocationKeys.MOUNTAIN_TRAIL]: [
    'Higher ground reveals the {location}.',
    'Stone and wind guide you to the {location}.',
    'The climb ends where the {location} begins.'
  ],
  [LocationKeys.ROCKY_SHORE]: [
    'Jagged stone and salt spray mark the {location}.',
    'Seek the idol where the rocks break the tide — the {location}.',
    'The shore grows sharp at the {location}.'
  ],
  [LocationKeys.SHELTER]: [
    'Home holds secrets; the {location} conceals the idol.',
    'Beneath woven shade, the {location} keeps its secret.',
    'The idol hides close to camp at the {location}.'
  ],
  [LocationKeys.TREE_MAIL]: [
    'News brings power; follow the path to the {location}.',
    'Where messages hang, so does fortune — the {location}.',
    'The idol waits near the {location}, where word travels.'
  ],
  [LocationKeys.TRIBE_FLAG]: [
    'Pride marks the {location}.',
    'Where your colors fly, the {location} keeps the idol.',
    'Honor and power meet at the {location}.'
  ],
  [LocationKeys.WATERFALL_TRAIL]: [
    'Mist and roar conceal the {location}.',
    'Where water thunders, the {location} hides the idol.',
    'The trail of spray points to the {location}.'
  ],
  [LocationKeys.WATER_WELL]: [
    'Still water mirrors the {location}.',
    'Quench your thirst at the {location}, but keep searching.',
    'The idol rests where canteens are filled — the {location}.'
  ]
};

const LOCATION_KEY_LOOKUP = {
  [LocationKeys.BEACH.toLowerCase()]: LocationKeys.BEACH,
  [LocationKeys.CAMPFIRE.toLowerCase()]: LocationKeys.CAMPFIRE,
  [LocationKeys.JUNGLE_TRAIL.toLowerCase()]: LocationKeys.JUNGLE_TRAIL,
  [LocationKeys.MOUNTAIN_TRAIL.toLowerCase()]: LocationKeys.MOUNTAIN_TRAIL,
  [LocationKeys.ROCKY_SHORE.toLowerCase()]: LocationKeys.ROCKY_SHORE,
  [LocationKeys.SHELTER.toLowerCase()]: LocationKeys.SHELTER,
  [LocationKeys.TREE_MAIL.toLowerCase()]: LocationKeys.TREE_MAIL,
  [LocationKeys.TRIBE_FLAG.toLowerCase()]: LocationKeys.TRIBE_FLAG,
  [LocationKeys.WATERFALL_TRAIL.toLowerCase()]: LocationKeys.WATERFALL_TRAIL,
  [LocationKeys.WATER_WELL.toLowerCase()]: LocationKeys.WATER_WELL,
  flag: LocationKeys.TRIBE_FLAG,
  treemail: LocationKeys.TREE_MAIL,
  rocky: LocationKeys.ROCKY_SHORE
};

const HUNT_SETTINGS = {
  INCIDENTAL_CHANCE: 0.06,
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
    this.debugMode = false;
    this.debugForceFind = { idol: false, clue: false };
    this.debugButtonId = 'idol-debug-button';
  }

  initialize() {
    // No event subscriptions needed; IdolSystem is driven by GameManager camp-entry hooks and direct calls.
  }

  reset() {
    this.tribeIdolStates.clear();
    this.tribeClueStates.clear();
    this.survivorInventories.clear();
    this.casualSearchCounts.clear();
    this.currentCampPhaseId = null;
    this.initialSpawnCompleted = false;
    this.debugForceFind = { idol: false, clue: false };
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
        if (this.debugMode) {
          this._logDebugSpawn(tribeId);
        }
      }
    });

    this.initialSpawnCompleted = true;
  }

  startNewCampPhase(reason = '') {
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

  attemptIntentionalHunt(survivorId, locationKey, mode, opts = {}) {
    const normalizedLocationKey = this.normalizeLocationKey(locationKey) || locationKey;
    const safeLocationKey = normalizedLocationKey || 'unknown';
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

    const isNpc = opts.isNpc === true || survivor.isPlayer !== true;

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

    if (this.gameManager.consumeCampTime) {
      this.gameManager.consumeCampTime(settings.timeCost, {
        source: isNpc ? 'npc_idol_hunt' : 'player_idol_hunt',
        survivorId,
        locationKey: safeLocationKey,
        mode
      });
    } else if (survivor.isPlayer === true) {
      this.gameManager.deductTime(settings.timeCost);
    }

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

    if (idolHiddenHere && this._consumeDebugForceFind('idol')) {
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

    if (clueHiddenHere && this._consumeDebugForceFind('clue')) {
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
    const normalizedLocationKey = this.normalizeLocationKey(mappedLocationKey) || mappedLocationKey;
    const safeLocationKey = normalizedLocationKey || 'unknown';
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
      idolState.locationKey === normalizedLocationKey;

    const clueHiddenHere =
      clueState &&
      !clueState.isFound &&
      !clueState.expired &&
      clueState.hiddenAtLocationKey === normalizedLocationKey;

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

    if (idolHiddenHere && this._consumeDebugForceFind('idol')) {
      const clueExpired = this._handleIdolFound({
        idolState,
        survivor,
        tribeId,
        locationKey: safeLocationKey,
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

    if (clueHiddenHere && this._consumeDebugForceFind('clue')) {
      this._handleClueFound({
        clueState,
        survivor,
        tribeId,
        locationKey: safeLocationKey,
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

    if (Math.random() >= HUNT_SETTINGS.INCIDENTAL_CHANCE) {
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
        locationKey: safeLocationKey,
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
        locationKey: safeLocationKey,
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

  setDebugMode(enabled = false) {
    this.debugMode = !!enabled;

    if (this.debugMode) {
      this._attachDebugWindowHook();
      this._ensureDebugButton();
    } else {
      this._detachDebugWindowHook();
      this._removeDebugButton();
      this.debugForceFind = { idol: false, clue: false };
    }
  }

  isDebugMode() {
    return this.debugMode;
  }

  setDebugForceFind({ idol = false, clue = false } = {}) {
    if (!this.debugMode) {
      this.debugForceFind = { idol: false, clue: false };
      return;
    }
    this.debugForceFind = {
      idol: !!idol,
      clue: !!clue
    };
  }

  getDebugSnapshot() {
    const tribeIds = new Set([
      ...this.tribeIdolStates.keys(),
      ...this.tribeClueStates.keys()
    ]);

    const tribes = [];
    tribeIds.forEach(tribeId => {
      const idolState = this.tribeIdolStates.get(tribeId);
      const clueState = this.tribeClueStates.get(tribeId);
      tribes.push({
        tribeId,
        idol: idolState
          ? {
              id: idolState.id,
              locationKey: idolState.locationKey,
              isFound: idolState.isFound,
              isUsed: idolState.isUsed,
              foundById: idolState.foundById
            }
          : null,
        clue: clueState
          ? {
              id: clueState.id,
              hiddenAtLocationKey: clueState.hiddenAtLocationKey,
              pointsToLocationKey: clueState.pointsToLocationKey,
              isFound: clueState.isFound,
              expired: clueState.expired,
              foundById: clueState.foundById
            }
          : null
      });
    });

    return {
      debugMode: this.debugMode,
      initialSpawnCompleted: this.initialSpawnCompleted,
      tribes
    };
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

  removeClueFromInventory(survivorId, clueId) {
    const inventory = this._ensureSurvivorInventory(survivorId);
    inventory.clues = inventory.clues.filter(clue => clue.id !== clueId);
  }

  getCasualSearchCount(survivorId, locationKey) {
    const canonicalLocation = this.normalizeLocationKey(locationKey) || locationKey;
    const key = this._casualCountKey(survivorId, canonicalLocation);
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

    this._syncInventoryItem({
      survivor,
      item: {
        id: `idol_${idolState.id}`,
        type: 'IDOL',
        name: 'Hidden Immunity Idol',
        iconSrc: 'Assets/Idols/hidden1.png',
        data: {
          idolId: idolState.id,
          tribeId: idolState.tribeId,
          played: false
        }
      }
    });

    eventManager.publish(GameEvents.IDOL_FOUND, {
      survivorId: survivor.id,
      tribeId,
      locationKey,
      isPlayer: survivor.isPlayer === true,
      via,
      mode,
      sourceTag
    });

    if (survivor.isPlayer && via === 'incidental') {
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

    this._syncInventoryItem({
      survivor,
      item: {
        id: `clue_${clueState.id}`,
        type: 'CLUE',
        name: 'Idol Clue',
        iconSrc: 'Assets/Idols/clue1.png',
        data: {
          clueId: clueState.id,
          tribeId: clueState.tribeId,
          pointsToLocationKey: clueState.pointsToLocationKey,
          text: clueState.text,
          expired: clueState.expired
        }
      }
    });

    eventManager.publish(GameEvents.CLUE_FOUND, {
      survivorId: survivor.id,
      tribeId,
      locationKey,
      isPlayer: survivor.isPlayer === true,
      via,
      mode,
      sourceTag
    });

    if (survivor.isPlayer && via === 'incidental') {
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

    const inventorySystem = this.gameManager.systems?.inventorySystem;
    if (inventorySystem) {
      const state = this.gameManager.state?.inventories;
      if (state?.player) {
        state.player.forEach(item => {
          if (item?.type === 'CLUE' && item?.data?.tribeId === tribeId) {
            item.data.expired = true;
          }
        });
      }
      if (state?.npcs) {
        Object.values(state.npcs).forEach(items => {
          items.forEach(item => {
            if (item?.type === 'CLUE' && item?.data?.tribeId === tribeId) {
              item.data.expired = true;
            }
          });
        });
      }
    }

    eventManager.publish(GameEvents.CLUE_EXPIRED, {
      tribeId,
      clueId: clueState.id
    });

    return true;
  }

  _syncInventoryItem({ survivor, item }) {
    const inventorySystem = this.gameManager.systems?.inventorySystem;
    if (!inventorySystem || !survivor || !item) return;

    const ownerId = survivor.isPlayer ? 'player' : survivor.id;
    const existing = inventorySystem.findItem?.(ownerId, entry => entry?.id === item.id);
    if (!existing) {
      const added = inventorySystem.addItem(ownerId, item);
      if (!added && ownerId === 'player') {
        console.warn('[IdolSystem] Player inventory full; could not add item', item);
      }
      if (ownerId !== 'player' && added) {
        console.debug('[IdolSystem] Stored NPC inventory item', { ownerId, item });
      }
    }

    if (ownerId === 'player' && typeof window.InventoryUI?.render === 'function') {
      window.InventoryUI.render();
    }
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

  normalizeLocationKey(locationKey) {
    if (!locationKey || typeof locationKey !== 'string') return locationKey;
    const trimmed = locationKey.trim();
    const lower = trimmed.toLowerCase();
    const normalized = lower.replace(/[\s_-]+/g, '');
    if (LOCATION_KEY_LOOKUP[lower]) return LOCATION_KEY_LOOKUP[lower];
    if (LOCATION_KEY_LOOKUP[normalized]) return LOCATION_KEY_LOOKUP[normalized];
    if (trimmed.endsWith('View')) {
      const base = trimmed.replace(/View$/, '');
      const baseLower = base.toLowerCase();
      const baseNormalized = baseLower.replace(/[\s_-]+/g, '');
      if (LOCATION_KEY_LOOKUP[baseLower]) return LOCATION_KEY_LOOKUP[baseLower];
      if (LOCATION_KEY_LOOKUP[baseNormalized]) return LOCATION_KEY_LOOKUP[baseNormalized];
      return base.charAt(0).toLowerCase() + base.slice(1);
    }
    return trimmed;
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
    if (tribe?.id) return tribe.id;
    const memberId = tribe?.members?.[0]?.tribeId;
    return memberId || index + 1;
  }

  _consumeDebugForceFind(kind) {
    if (!this.debugMode) return false;
    if (!this.debugForceFind?.[kind]) return false;
    this.debugForceFind = { ...this.debugForceFind, [kind]: false };
    return true;
  }

  _logDebugSpawn(tribeId) {
    const idolState = this.tribeIdolStates.get(tribeId);
    const clueState = this.tribeClueStates.get(tribeId);
    if (!idolState || !clueState) return;
    console.info('[IdolSystem][Debug] Spawned idol/clue', {
      tribeId,
      idolLocationKey: idolState.locationKey,
      clueHiddenAtLocationKey: clueState.hiddenAtLocationKey,
      cluePointsToLocationKey: clueState.pointsToLocationKey
    });
  }

  _attachDebugWindowHook() {
    if (typeof window === 'undefined') return;
    window.IdolDebug = {
      snapshot: () => this.getDebugSnapshot(),
      setDebug: (on) => this.setDebugMode(on),
      forceFind: (opts) => this.setDebugForceFind(opts)
    };
  }

  _detachDebugWindowHook() {
    if (typeof window === 'undefined') return;
    if (window.IdolDebug) {
      delete window.IdolDebug;
    }
  }

  _ensureDebugButton() {
    if (typeof document === 'undefined') return;
    if (document.getElementById(this.debugButtonId)) return;
    const button = document.createElement('button');
    button.id = this.debugButtonId;
    button.type = 'button';
    button.textContent = '🐛';
    button.title = 'Idol debug snapshot';
    button.style.cssText = `
      position: fixed;
      bottom: 12px;
      right: 12px;
      width: 32px;
      height: 32px;
      border-radius: 50%;
      border: none;
      background: rgba(0, 0, 0, 0.6);
      color: #fff;
      font-size: 18px;
      cursor: pointer;
      z-index: 2500;
    `;
    button.addEventListener('click', () => {
      const snapshot = this.getDebugSnapshot();
      const lines = snapshot.tribes.map(tribe => {
        const idolLocation = tribe.idol?.locationKey ?? 'unknown';
        const clueHidden = tribe.clue?.hiddenAtLocationKey ?? 'unknown';
        const cluePoints = tribe.clue?.pointsToLocationKey ?? 'unknown';
        return `Tribe ${tribe.tribeId}: Idol @ ${idolLocation}, Clue hidden @ ${clueHidden}, Clue points to ${cluePoints}`;
      });
      alert(lines.join('\n') || 'No idol/clue data available.');
    });
    document.body.appendChild(button);
  }

  _removeDebugButton() {
    if (typeof document === 'undefined') return;
    const button = document.getElementById(this.debugButtonId);
    if (button?.parentNode) {
      button.parentNode.removeChild(button);
    }
  }
}

export default IdolSystem;
