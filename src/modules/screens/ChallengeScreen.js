
/**
 * @module ChallengeScreen
 * Manages the Challenge screen and its different phases
 */

import { getElement, clearChildren, createElement } from '../utils/index.js';
import { gameManager } from '../core/index.js';
import screenManager from '../core/ScreenManager.js';
import renderTribeChallengeView from '../views/TribeChallengeView.js';

class ChallengeScreen {
  constructor() {
    this.container = null;
    this.currentView = null;
    this.isInitialized = false;
  }

  initialize() {
    if (this.isInitialized) return;
    
    console.log('ChallengeScreen initializing...');
    this.container = getElement('challenge-screen');
    
    if (!this.container) {
      console.error('Challenge screen container not found');
      return;
    }
    
    this.isInitialized = true;
    console.log('ChallengeScreen initialized');
  }

  setup(data = {}) {
    console.log('ChallengeScreen setup called with data:', data);
    
    if (!this.container) {
      console.error('Challenge screen container not available');
      return;
    }

    // Clear any existing content
    clearChildren(this.container);

    // Get current game state
    const currentDay = gameManager.getDay();
    const gamePhase = gameManager.getGamePhase();
    const tribes = gameManager.getTribes();

    console.log(`Setting up challenge for Day ${currentDay}, Phase: ${gamePhase}`);

    // Load the tribal challenge view
    this.loadTribeChallengeView();
  }

  loadTribeChallengeView() {
    console.log('Loading tribal challenge view...');
    
    if (!this.container) {
      console.error('Container not available for tribal challenge view');
      return;
    }

    // Render the tribal challenge view
    renderTribeChallengeView(this.container);
    this.currentView = 'tribal-challenge';
  }

  teardown() {
    console.log('ChallengeScreen teardown');
    
    if (this.container) {
      clearChildren(this.container);
    }
    
    this.currentView = null;
  }

  getCurrentView() {
    return this.currentView;
  }
}

export default ChallengeScreen;
