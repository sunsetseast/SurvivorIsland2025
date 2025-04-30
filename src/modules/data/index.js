/**
 * @module Data
 * Consolidates and re-exports all game data
 */

import GameDataInstance from './GameData.js';

// Named export: use with `import { GameData } from '../data/index.js'`
export const GameData = GameDataInstance;

// Default export: use with `import data from '../data/index.js'`
export default GameDataInstance;