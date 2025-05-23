/**
 * @module Utils
 * Consolidates and re-exports all utility modules
 */

// Core utility functions (updated)
export function getElement(id) {
  return document.getElementById(id);
}

// Export other utility modules
export * from './CommonUtils.js';
export * from './DOMUtils.js';
export * from './StorageUtils.js';
export { default as timerManager } from './TimerManager.js';

// Import all utilities for the default grouped export
import * as CommonUtils from './CommonUtils.js';
import * as DOMUtils from './DOMUtils.js';
import * as StorageUtils from './StorageUtils.js';
import timerManager from './TimerManager.js';

// Add getElement manually since it's not part of the above modules
export default {
  getElement,
  ...CommonUtils,
  ...DOMUtils,
  ...StorageUtils,
  timerManager
};