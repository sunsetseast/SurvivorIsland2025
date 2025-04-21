/**
 * @module Utils
 * Consolidates and re-exports all utility modules
 */

// Export all utility functions
export * from './CommonUtils.js';
export * from './DOMUtils.js';
export * from './StorageUtils.js';
export { default as timerManager } from './TimerManager.js';

// Import all utilities for convenient usage via the default export
import * as CommonUtils from './CommonUtils.js';
import * as DOMUtils from './DOMUtils.js';
import * as StorageUtils from './StorageUtils.js';
import timerManager from './TimerManager.js';

// Default export for convenient importing
export default {
  ...CommonUtils,
  ...DOMUtils,
  ...StorageUtils,
  timerManager
};