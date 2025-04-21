/**
 * @module Screens
 * Consolidates and re-exports all game screens
 */

// Import screen modules
import { WelcomeScreen } from './WelcomeScreen.js';
import { CharacterSelectionScreen } from './CharacterSelectionScreen.js';
import { TribeDivisionScreen } from './TribeDivisionScreen.js';
import { CampScreen } from './CampScreen.js';

// Re-export named screens
export {
  WelcomeScreen,
  CharacterSelectionScreen,
  TribeDivisionScreen,
  CampScreen
};

// Default export for grouped usage
export default {
  WelcomeScreen,
  CharacterSelectionScreen,
  TribeDivisionScreen,
  CampScreen
};