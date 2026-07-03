/**
 * @module SaveManager
 * Small localStorage facade for versioned Survivor Island world saves.
 */

import { loadFromLocalStorage, saveToLocalStorage } from '../utils/StorageUtils.js';

export const SAVE_VERSION = 1;
export const DEFAULT_SAVE_KEY = 'survivorIsland.saveGame';

function cloneJsonSafe(value, fallback = null) {
  if (value === undefined) return fallback;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (error) {
    console.warn('[SaveManager] Value was not JSON-safe and was omitted.', error);
    return fallback;
  }
}

class SaveManager {
  constructor({ storageKey = DEFAULT_SAVE_KEY } = {}) {
    this.storageKey = storageKey;
  }

  getSaveVersion() {
    return SAVE_VERSION;
  }

  cloneJsonSafe(value, fallback = null) {
    return cloneJsonSafe(value, fallback);
  }

  preparePayload(payload) {
    const prepared = {
      saveVersion: payload?.saveVersion ?? SAVE_VERSION,
      savedAt: payload?.savedAt ?? Date.now(),
      ...payload
    };
    return cloneJsonSafe(prepared);
  }

  save(payload, key = this.storageKey) {
    const prepared = this.preparePayload(payload);
    if (!prepared) return false;
    return saveToLocalStorage(key, prepared);
  }

  load(key = this.storageKey) {
    const payload = loadFromLocalStorage(key);
    return this.normalizePayload(payload);
  }

  hasSave(key = this.storageKey) {
    return !!loadFromLocalStorage(key);
  }

  normalizePayload(payload) {
    if (!payload || typeof payload !== 'object') return null;

    if (payload.gameManager || payload.systems) {
      return {
        saveVersion: payload.saveVersion ?? SAVE_VERSION,
        savedAt: payload.savedAt ?? payload.timestamp ?? Date.now(),
        appVersion: payload.appVersion ?? null,
        gameManager: payload.gameManager || {},
        systems: payload.systems || {}
      };
    }

    // Legacy single-slot payload support.
    return {
      saveVersion: 0,
      savedAt: payload.timestamp ?? Date.now(),
      appVersion: null,
      gameManager: {
        gameState: payload.gameState,
        gamePhase: payload.gamePhase,
        day: payload.day,
        dayTimer: payload.dayTimer,
        timeSpeed: payload.timeSpeed,
        tribeCount: payload.tribeCount,
        tribes: payload.tribes,
        survivors: payload.survivors,
        player: payload.player,
        journey: payload.journey,
        jury: payload.jury,
        finalists: payload.finalists,
        winner: payload.winner,
        isTribesShuffled: payload.isTribesShuffled,
        isMerged: payload.isMerged,
        flags: payload.flags,
        campLog: payload.campLog,
        gameHistory: payload.gameHistory,
        tribalCouncilLog: payload.tribalCouncilLog,
        state: payload.state,
        postChallengeMode: payload.postChallengeMode,
        gameSettings: payload.gameSettings
      },
      systems: payload.systemsState || {}
    };
  }
}

const saveManager = new SaveManager();

export default saveManager;
