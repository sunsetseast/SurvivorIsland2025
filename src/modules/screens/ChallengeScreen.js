import { createElement, clearChildren } from '../utils/DOMUtils.js';
import { gameManager, screenManager } from '../core/index.js';
import ChallengeIntroView from '../views/ChallengeIntroView.js';
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

    // Create default challenge configuration for first immunity challenge
    this.currentChallenge = {
      name: 'First Immunity Challenge',
      description: 'Welcome to your first immunity challenge! Tribes will compete for safety.',
      background: 'Assets/jeff-screen.png',
      type: 'tribal',
      mechanics: 'endurance',
      day: gameManager.getDay(),
      isSpecial: true,
      showJeff: true,
      jeffMessage: 'COME ON IN, GUYS!'
    };

    // Load appropriate challenge type
    this.loadChallenge();
  }

  loadChallenge() {
    if (!this.container || !this.currentChallenge) return;

    clearChildren(this.container);

    // Always start with the challenge introduction
    this.loadChallengeIntro();
  }

  loadChallengeIntro() {
    // Show the challenge introduction first
    ChallengeIntroView.render(this.container, this.currentChallenge, () => {
      // Once intro is complete, load the actual challenge
      this.loadActualChallenge();
    });
    this.currentView = 'challenge-intro';
    console.log(`Loaded challenge introduction: ${this.currentChallenge.name}`);
  }

  loadActualChallenge() {
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
        // Fallback to tribal challenge for early game
        TribeChallengeView.render(this.container, this.currentChallenge);
        this.currentView = 'tribal-challenge';
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
      console.log('Challenge completed with results:', results);
      // Store results in game manager if needed
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