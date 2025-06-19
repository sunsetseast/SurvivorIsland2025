import { createElement, clearChildren } from '../utils/DOMUtils.js';
import gameManager from '../core/GameManager.js';
import screenManager from '../core/ScreenManager.js';
import challengeManager from '../core/ChallengeManager.js';
import TribeChallengeView from '../views/TribeChallengeView.js';
import IndividualChallengeView from '../views/IndividualChallengeView.js';

export default class ChallengeScreen {
  constructor() {
    this.container = null;
    this.currentView = null;
    this.currentChallenge = null;
  }

  setup() {
    console.log('ChallengeScreen setup');
    this.container = document.getElementById('challenge-screen');

    if (!this.container) {
      console.error('Challenge screen container not found');
      return;
    }

    clearChildren(this.container);

    // Get current challenge from challenge manager
    this.currentChallenge = challengeManager.getCurrentChallenge();

    if (!this.currentChallenge) {
      console.warn('No challenge configured for current day');
      return;
    }

    // Load appropriate challenge type
    this.loadChallenge();
  }

  loadChallenge() {
    if (!this.container || !this.currentChallenge) return;

    clearChildren(this.container);

    const challengeType = this.currentChallenge.type;

    switch (challengeType) {
      case 'tribal':
        TribeChallengeView.render(this.container, this.currentChallenge);
        this.currentView = 'tribal-challenge';
        break;

      case 'individual':
        IndividualChallengeView.render(this.container, this.currentChallenge);
        this.currentView = 'individual-challenge';
        break;

      default:
        console.warn(`Unknown challenge type: ${challengeType}`);
        // Fallback - determine type based on game state
        const fallbackType = challengeManager.determineChallengeType();
        if (fallbackType === 'individual') {
          IndividualChallengeView.render(this.container, this.currentChallenge);
          this.currentView = 'individual-challenge';
        } else {
          TribeChallengeView.render(this.container, this.currentChallenge);
          this.currentView = 'tribal-challenge';
        }
    }

    console.log(`Loaded ${challengeType} challenge: ${this.currentChallenge.name}`);
  }

  // Helper method for views to access current challenge data
  getCurrentChallenge() {
    return this.currentChallenge;
  }

  // Method to handle challenge completion (called by views)
  completeChallenge(results = null) {
    if (results && this.currentChallenge) {
      challengeManager.storeChallengeResult(this.currentChallenge.day, results);
    }

    // Advance game phase
    gameManager.advanceGamePhase();

    // Return to camp
    gameManager.setGameState('camp');
    screenManager.showScreen('camp');

    // Load flag view to show results
    if (window.campScreen && typeof window.campScreen.loadView === 'function') {
      window.campScreen.loadView('flag');
    }
  }

  teardown() {
    console.log('ChallengeScreen teardown');
    if (this.container) {
      clearChildren(this.container);
    }
    this.currentView = null;
    this.currentChallenge = null;
  }

  destroy() {
    if (this.container) {
      clearChildren(this.container);
    }
    this.currentView = null;
    this.currentChallenge = null;
  }
}