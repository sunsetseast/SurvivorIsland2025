/**
 * @module InventorySystem
 * Manages player and NPC inventories for idol clues and idols.
 */

import { generateId } from '../utils/CommonUtils.js';

const PLAYER_OWNER_ID = 'player';
const MAX_PLAYER_ITEMS = 9;

class InventorySystem {
  constructor(gameManager) {
    this.gameManager = gameManager;
  }

  initialize() {
    this.ensureInitialized();
  }

  reset() {
    this.ensureInitialized(true);
  }

  ensureInitialized(force = false) {
    this.gameManager.state = this.gameManager.state || {};
    if (force || !this.gameManager.state.inventories) {
      this.gameManager.state.inventories = {
        player: [],
        npcs: {}
      };
    }
  }

  _normalizeOwnerId(ownerId) {
    if (!ownerId) return PLAYER_OWNER_ID;
    if (ownerId === PLAYER_OWNER_ID) return PLAYER_OWNER_ID;
    if (typeof ownerId === 'string' && ownerId.startsWith('npc:')) {
      return ownerId.slice(4);
    }
    return ownerId;
  }

  _ensureNpcInventory(ownerId) {
    const inventories = this.gameManager.state.inventories;
    const key = `${ownerId}`;
    if (!inventories.npcs[key]) {
      inventories.npcs[key] = [];
    }
    return inventories.npcs[key];
  }

  addItem(ownerId, item) {
    if (!item) return false;
    this.ensureInitialized();
    const normalizedOwner = this._normalizeOwnerId(ownerId);
    const entry = {
      ...item,
      id: item.id || generateId(),
      createdAt: item.createdAt || Date.now()
    };

    if (normalizedOwner === PLAYER_OWNER_ID) {
      const items = this.gameManager.state.inventories.player;
      if (items.length >= MAX_PLAYER_ITEMS) {
        return false;
      }
      items.push(entry);
      return true;
    }

    const npcItems = this._ensureNpcInventory(normalizedOwner);
    npcItems.push(entry);
    return true;
  }

  removeItem(ownerId, itemId) {
    if (!itemId) return false;
    this.ensureInitialized();
    const normalizedOwner = this._normalizeOwnerId(ownerId);

    if (normalizedOwner === PLAYER_OWNER_ID) {
      const items = this.gameManager.state.inventories.player;
      const next = items.filter(item => item?.id !== itemId);
      const changed = next.length !== items.length;
      this.gameManager.state.inventories.player = next;
      return changed;
    }

    const npcItems = this._ensureNpcInventory(normalizedOwner);
    const next = npcItems.filter(item => item?.id !== itemId);
    const changed = next.length !== npcItems.length;
    this.gameManager.state.inventories.npcs[`${normalizedOwner}`] = next;
    return changed;
  }

  removeItemByIndex(ownerId, index) {
    this.ensureInitialized();
    const normalizedOwner = this._normalizeOwnerId(ownerId);

    if (normalizedOwner === PLAYER_OWNER_ID) {
      const items = [...this.gameManager.state.inventories.player];
      if (index < 0 || index >= items.length) return false;
      items.splice(index, 1);
      this.gameManager.state.inventories.player = items.filter(Boolean);
      return true;
    }

    const npcItems = this._ensureNpcInventory(normalizedOwner);
    if (index < 0 || index >= npcItems.length) return false;
    npcItems.splice(index, 1);
    return true;
  }

  getItems(ownerId) {
    this.ensureInitialized();
    const normalizedOwner = this._normalizeOwnerId(ownerId);
    if (normalizedOwner === PLAYER_OWNER_ID) {
      return this.gameManager.state.inventories.player;
    }
    return this._ensureNpcInventory(normalizedOwner);
  }

  hasItem(ownerId, type) {
    return this.getItems(ownerId).some(item => item?.type === type);
  }

  findItem(ownerId, predicate) {
    if (typeof predicate !== 'function') return null;
    return this.getItems(ownerId).find(predicate) || null;
  }
}

export default InventorySystem;
