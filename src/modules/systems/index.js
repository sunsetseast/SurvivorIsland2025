/**
 * @module Systems
 * Consolidates and re-exports all game systems
 */

// Core systems
export { default as DialogueSystem } from './DialogueSystem.js';
export { default as EnergySystem } from './EnergySystem.js';
export { default as IdolSystem } from './IdolSystem.js';
export { default as RelationshipSystem, RelationshipType } from './RelationshipSystem.js';
export { default as AllianceSystem } from './AllianceSystem.js';

// ⭐ NEW: NPC SYSTEMS (NpcLocationSystem default export is the singleton instance)
export { default as npcLocationSystem } from './NpcLocationSystem.js';
export { default as NpcAutoRenderer } from '../ui/NpcAutoRenderer.js';

// Import everything for default export
import DialogueSystem from './DialogueSystem.js';
import EnergySystem from './EnergySystem.js';
import IdolSystem from './IdolSystem.js';
import RelationshipSystem, { RelationshipType } from './RelationshipSystem.js';
import AllianceSystem from './AllianceSystem.js';

import npcLocationSystem from './NpcLocationSystem.js';
import NpcAutoRenderer from '../ui/NpcAutoRenderer.js';

export default {
  DialogueSystem,
  EnergySystem,
  IdolSystem,
  RelationshipSystem,
  RelationshipType,
  AllianceSystem,

  // ⭐ NPC systems must be included here
  npcLocationSystem,
  NpcAutoRenderer
};