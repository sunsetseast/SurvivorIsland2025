/**
 * @module ScreenManager
 * Manages screen transitions and history in the game
 */

import { getElement, clearChildren, showElement, hideElement } from '../utils/DOMUtils.js';
import eventManager, { GameEvents } from './EventManager.js';

class ScreenManager {
  constructor() {
    this.screens = {}; // Map of screen ID to screen object
    this.currentScreen = null;
    this.previousScreen = null;
    this.history = [];
    this.maxHistoryLength = 10;
    this.transitions = {
      fade: this._fadeTransition.bind(this),
      slide: this._slideTransition.bind(this),
      none: this._noTransition.bind(this)
    };
    this.defaultTransition = 'fade';
  }
  
  /**
   * Initialize the screen manager
   */
  initialize() {
    console.log('ScreenManager initialized');
    this.containerElement = getElement('game-container');
    
    if (!this.containerElement) {
      console.error('Game container element not found');
    }
  }
  
  /**
   * Register a screen
   * @param {string} screenId - Screen identifier
   * @param {Object} screenObj - Screen object with setup and teardown methods
   */
  registerScreen(screenId, screenObj) {
    if (this.screens[screenId]) {
      console.warn(`Screen ${screenId} already registered, overwriting`);
    }
    
    // Ensure screen object has required methods
    const requiredMethods = ['setup', 'teardown'];
    const missingMethods = requiredMethods.filter(method => 
      !screenObj[method] || typeof screenObj[method] !== 'function'
    );
    
    if (missingMethods.length > 0) {
      console.error(`Screen ${screenId} is missing required methods: ${missingMethods.join(', ')}`);
      return false;
    }
    
    // Initialize the screen if it has an initialize method
    if (screenObj.initialize && typeof screenObj.initialize === 'function') {
      screenObj.initialize();
    }
    
    this.screens[screenId] = screenObj;
    return true;
  }
  
  /**
   * Register multiple screens
   * @param {Object} screens - Map of screen IDs to screen objects
   */
  registerScreens(screens) {
    Object.entries(screens).forEach(([screenId, screenObj]) => {
      this.registerScreen(screenId, screenObj);
    });
  }
  
  /**
   * Show a screen
   * @param {string} screenId - Screen identifier
   * @param {Object} data - Data to pass to the screen
   * @param {Object} options - Transition options
   */
  showScreen(screenId, data = {}, options = {}) {
    const screen = this.screens[screenId];
    
    if (!screen) {
      console.error(`Screen ${screenId} not found`);
      return;
    }
    
    const screenElement = getElement(`${screenId}-screen`);
    
    if (!screenElement) {
      console.error(`Screen element #${screenId}-screen not found`);
      return;
    }
    
    // Hide all screens first
    this._hideAllScreens();
    
    // Update history
    if (this.currentScreen) {
      this.previousScreen = this.currentScreen;
      this.history.push(this.currentScreen);
      
      // Trim history if needed
      if (this.history.length > this.maxHistoryLength) {
        this.history = this.history.slice(-this.maxHistoryLength);
      }
    }
    
    // Set current screen
    this.currentScreen = screenId;
    
    // Get transition type
    const transition = options.transition || this.defaultTransition;
    
    // Apply transition
    const transitionFn = this.transitions[transition] || this.transitions.none;
    transitionFn(screenElement, () => {
      // Setup the screen
      try {
        screen.setup(data);
      } catch (error) {
        console.error(`Error in screen setup for ${screenId}:`, error);
      }
      
      // Publish screen changed event
      eventManager.publish(GameEvents.SCREEN_CHANGED, {
        screenId,
        data
      });
    });
  }
  
  /**
   * Hide a screen
   * @param {string} screenId - Screen identifier
   */
  hideScreen(screenId) {
    const screen = this.screens[screenId];
    
    if (!screen) {
      console.error(`Screen ${screenId} not found`);
      return;
    }
    
    const screenElement = getElement(`${screenId}-screen`);
    
    if (!screenElement) {
      console.error(`Screen element #${screenId}-screen not found`);
      return;
    }
    
    // Teardown the screen
    try {
      screen.teardown();
    } catch (error) {
      console.error(`Error in screen teardown for ${screenId}:`, error);
    }
    
    // Hide the screen
    hideElement(screenElement);
  }
  
  /**
   * Go back to the previous screen
   * @param {Object} data - Data to pass to the previous screen
   * @param {Object} options - Transition options
   */
  goBack(data = {}, options = {}) {
    if (!this.previousScreen) {
      console.warn('No previous screen to go back to');
      return;
    }
    
    this.showScreen(this.previousScreen, data, options);
    
    // Remove the last screen from history
    if (this.history.length > 0) {
      this.history.pop();
      this.previousScreen = this.history[this.history.length - 1] || null;
    }
  }
  
  /**
   * Get the current screen ID
   * @returns {string} Current screen ID
   */
  getCurrentScreen() {
    return this.currentScreen;
  }
  
  /**
   * Get the previous screen ID
   * @returns {string} Previous screen ID
   */
  getPreviousScreen() {
    return this.previousScreen;
  }
  
  /**
   * Get the screen history
   * @returns {Array} Screen history
   */
  getHistory() {
    return [...this.history];
  }
  
  /**
   * Clear screen history
   */
  clearHistory() {
    this.history = [];
    this.previousScreen = null;
  }
  
  /**
   * Hide all screens
   * @private
   */
  _hideAllScreens() {
    const screenElements = document.querySelectorAll('[id$="-screen"]');
    
    screenElements.forEach(element => {
      hideElement(element);
    });
  }
  
  /**
   * No transition
   * @param {HTMLElement} element - Screen element
   * @param {Function} callback - Callback when transition is complete
   * @private
   */
  _noTransition(element, callback) {
    showElement(element);
    callback();
  }
  
  /**
   * Fade transition
   * @param {HTMLElement} element - Screen element
   * @param {Function} callback - Callback when transition is complete
   * @private
   */
  _fadeTransition(element, callback) {
    // Set initial styles
    element.style.opacity = '0';
    element.style.transition = 'opacity 0.3s ease';
    showElement(element);
    
    // Force reflow
    element.offsetHeight;
    
    // Trigger fade in
    element.style.opacity = '1';
    
    // Wait for transition to complete
    setTimeout(() => {
      // Reset styles
      element.style.transition = '';
      callback();
    }, 300);
  }
  
  /**
   * Slide transition
   * @param {HTMLElement} element - Screen element
   * @param {Function} callback - Callback when transition is complete
   * @private
   */
  _slideTransition(element, callback) {
    // Set initial styles
    element.style.transform = 'translateX(100%)';
    element.style.transition = 'transform 0.3s ease';
    showElement(element);
    
    // Force reflow
    element.offsetHeight;
    
    // Trigger slide in
    element.style.transform = 'translateX(0)';
    
    // Wait for transition to complete
    setTimeout(() => {
      // Reset styles
      element.style.transition = '';
      element.style.transform = '';
      callback();
    }, 300);
  }
  
  /**
   * Set the default transition
   * @param {string} transition - Transition name
   */
  setDefaultTransition(transition) {
    if (this.transitions[transition]) {
      this.defaultTransition = transition;
    } else {
      console.error(`Transition ${transition} not found`);
    }
  }
  
  /**
   * Register a custom transition
   * @param {string} name - Transition name
   * @param {Function} transitionFn - Transition function
   */
  registerTransition(name, transitionFn) {
    if (typeof transitionFn !== 'function') {
      console.error('Transition must be a function');
      return;
    }
    
    this.transitions[name] = transitionFn;
  }
}

// Create and export singleton instance
const screenManager = new ScreenManager();
export default screenManager;