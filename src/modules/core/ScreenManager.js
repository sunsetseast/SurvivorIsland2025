/**
 * @module ScreenManager
 * Manages screen transitions and history in the game
 */

import { getElement, clearChildren, showElement, hideElement } from '../utils/DOMUtils.js';
import eventManager, { GameEvents } from './EventManager.js';

class ScreenManager {
  constructor() {
    this.screens = {};
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

  initialize() {
    console.log('ScreenManager initialized');
    this.containerElement = getElement('game-container');
    if (!this.containerElement) {
      console.error('Game container element not found');
    }
  }

  registerScreen(screenId, screenObj) {
    if (this.screens[screenId]) {
      console.warn(`Screen ${screenId} already registered, overwriting`);
    }

    const requiredMethods = ['setup', 'teardown'];
    const missingMethods = requiredMethods.filter(method =>
      !screenObj[method] || typeof screenObj[method] !== 'function'
    );

    if (missingMethods.length > 0) {
      console.error(`Screen ${screenId} is missing required methods: ${missingMethods.join(', ')}`);
      return false;
    }

    if (screenObj.initialize && typeof screenObj.initialize === 'function') {
      screenObj.initialize();
    }

    this.screens[screenId] = screenObj;
    return true;
  }

  registerScreens(screens) {
    Object.entries(screens).forEach(([screenId, screenObj]) => {
      this.registerScreen(screenId, screenObj);
    });
  }

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

    this._hideAllScreens();

    if (this.currentScreen) {
      this.previousScreen = this.currentScreen;
      this.history.push(this.currentScreen);
      if (this.history.length > this.maxHistoryLength) {
        this.history = this.history.slice(-this.maxHistoryLength);
      }
    }

    this.currentScreen = screenId;

    const transition = options.transition || this.defaultTransition;
    const transitionFn = this.transitions[transition] || this.transitions.none;
    transitionFn(screenElement, () => {
      try {
        screen.setup(data);
      } catch (error) {
        console.error(`Error in screen setup for ${screenId}:`, error);
      }

      eventManager.publish(GameEvents.SCREEN_CHANGED, {
        screenId,
        data
      });
    });
  }

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

    try {
      screen.teardown();
    } catch (error) {
      console.error(`Error in screen teardown for ${screenId}:`, error);
    }

    hideElement(screenElement);
  }

  goBack(data = {}, options = {}) {
    if (!this.previousScreen) {
      console.warn('No previous screen to go back to');
      return;
    }

    this.showScreen(this.previousScreen, data, options);

    if (this.history.length > 0) {
      this.history.pop();
      this.previousScreen = this.history[this.history.length - 1] || null;
    }
  }

  getCurrentScreen() {
    return this.currentScreen;
  }

  getPreviousScreen() {
    return this.previousScreen;
  }

  getHistory() {
    return [...this.history];
  }

  clearHistory() {
    this.history = [];
    this.previousScreen = null;
  }

  _hideAllScreens() {
    const screenElements = document.querySelectorAll('[id$="-screen"]');
    screenElements.forEach(element => {
      hideElement(element);
    });
  }

  _noTransition(element, callback) {
    showElement(element);
    callback();
  }

  _fadeTransition(element, callback) {
    showElement(element); // Ensure it's visible before setup
    element.style.opacity = '0';
    element.style.transition = 'opacity 0.3s ease';
    element.offsetHeight; // force reflow
    element.style.opacity = '1';
    setTimeout(() => {
      element.style.transition = '';
      callback();
    }, 300);
  }

  _slideTransition(element, callback) {
    showElement(element); // Ensure it's visible before setup
    element.style.transform = 'translateX(100%)';
    element.style.transition = 'transform 0.3s ease';
    element.offsetHeight; // force reflow
    element.style.transform = 'translateX(0)';
    setTimeout(() => {
      element.style.transition = '';
      element.style.transform = '';
      callback();
    }, 300);
  }

  setDefaultTransition(transition) {
    if (this.transitions[transition]) {
      this.defaultTransition = transition;
    } else {
      console.error(`Transition ${transition} not found`);
    }
  }

  registerTransition(name, transitionFn) {
    if (typeof transitionFn !== 'function') {
      console.error('Transition must be a function');
      return;
    }

    this.transitions[name] = transitionFn;
  }
}

// Export instance, not class
const screenManager = new ScreenManager();
export default screenManager;