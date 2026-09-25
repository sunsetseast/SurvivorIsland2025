import { createElement, clearChildren } from '../utils/DOMUtils.js';
import { gameManager, GamePhase } from '../core/GameManager.js';
import challengeManager from '../core/ChallengeManager.js';
import ChallengeIntroView from '../views/ChallengeIntroView.js';
import TribeChallengeView from '../views/TribeChallengeView.js';
import IndividualChallengeView from '../views/IndividualChallengeView.js';
import LastFlagView from '../views/LastFlagView.js';
import { normalizeChallengeResult } from '../core/ChallengeResult.js';

export default class ChallengeScreen {
  constructor() {
    this.container = null;
    this.currentView = null;
    this.currentChallenge = null;
    this.activeChallengeView = null;
    this.lastFlagCompletionSent = false;
    this.lastFlagSitOutIds = [];
  }

  setup() {
    console.log('ChallengeScreen setup');
    this.container = document.getElementById('challenge-screen');
    this.activeChallengeView?.dispose();
    this.activeChallengeView = null;
    this.lastFlagCompletionSent = false;
    this.lastFlagSitOutIds = [];

    // Expose this instance globally for challenge views to access
    window.challengeScreen = this;

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

    // Always start with the challenge introduction
    this.loadChallengeIntro();
  }

  loadChallengeIntro() {
    // Show the challenge introduction first
    ChallengeIntroView.render(this.container, this.currentChallenge, playerSitOutIds => {
      // The Day 1 role assignment belongs to First Contact alone.
      if (this.currentChallenge.challengeKey === 'last_flag') {
        this.lastFlagSitOutIds = playerSitOutIds;
        this.loadActualChallenge();
      } else {
        this.loadRoleView();
      }
    });
    this.currentView = 'challenge-intro';
    console.log(`Loaded challenge introduction: ${this.currentChallenge.name}`);
  }

  loadRoleView() {
    if (!this.container) return;

    // Import RoleView at the top of the file
    import('../views/RoleView.js').then(({ default: RoleView }) => {
      RoleView.render(this.container, () => {
        // Once RoleView is complete, load the actual challenge
        this.loadActualChallenge();
      });
      this.currentView = 'role-view';
      console.log('Loaded RoleView');
    });
  }

  loadActualChallenge() {
    if (!this.container || !this.currentChallenge) return;

    clearChildren(this.container);

    const challengeType = this.currentChallenge.type;
    const challengeDay = this.currentChallenge.day;

    if (this.currentChallenge.challengeKey === 'last_flag') {
      this.activeChallengeView = new LastFlagView(this.container, this.currentChallenge, gameManager,
        result => this.completeChallenge(result), this.lastFlagSitOutIds);
      this.currentView = 'last-flag-challenge';
      return;
    }

    // Load specific challenge views based on day/name
    if (challengeDay === 1 || this.currentChallenge.name === 'First Contact') {
      // Load FirstContactView for the first challenge
      import('../views/FirstContactView.js').then(({ default: FirstContactView }) => {
        FirstContactView.render(this.container, this.currentChallenge);
        this.currentView = 'first-contact-challenge';
        console.log(`Loaded First Contact challenge view`);
      });
      return;
    }

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
    if (this.currentChallenge?.challengeKey === 'last_flag') {
      if (this.lastFlagCompletionSent || !this.activeChallengeView?.engine.completed || !results) return;
      this.lastFlagCompletionSent = true;
    }
    const canonicalResult = results && this.currentChallenge
      ? normalizeChallengeResult(results, { challenge: this.currentChallenge, gameManager })
      : null;
    const playerTribeWon = Boolean(canonicalResult?.playerTribeWon);

    if (canonicalResult) {
      challengeManager.storeChallengeResult(this.currentChallenge.day, canonicalResult);
      gameManager.lastChallengeResult = canonicalResult;
      gameManager.seasonEngine?.applyChallengeResult?.(canonicalResult);
    }

    if (this.currentChallenge?.type === 'tribal') {
      gameManager.postChallengeMode = playerTribeWon ? 'scripted' : 'playable';
      console.log('PostChallengeMode set to:', gameManager.postChallengeMode);
      console.log('Challenge complete. postChallengeMode =', gameManager.postChallengeMode);
      console.log('[ChallengeScreen] postChallengeMode set', gameManager.postChallengeMode);
      console.info('[ChallengeScreen] postChallengeMode set', {
        postChallengeMode: gameManager.postChallengeMode,
        playerTribeWon,
        challengeDay: this.currentChallenge?.day,
        challengeName: this.currentChallenge?.name
      });
    }

    // Advance into post-challenge. Some entry points can still open the challenge
    // screen while phase is PRE_CHALLENGE; in that case we need two transitions:
    // PRE_CHALLENGE -> CHALLENGE -> POST_CHALLENGE.
    if (gameManager.gamePhase !== GamePhase.POST_CHALLENGE) {
      let safety = 0;
      while (gameManager.gamePhase !== GamePhase.POST_CHALLENGE && safety < 3) {
        const phaseBeforeAdvance = gameManager.gamePhase;
        gameManager.advanceGamePhase();
        safety += 1;

        if (gameManager.gamePhase === phaseBeforeAdvance) {
          console.warn('[ChallengeScreen] Game phase did not advance as expected', {
            phase: gameManager.gamePhase,
            safety
          });
          break;
        }
      }
    }

    console.info('[ChallengeScreen] challenge complete; transitioning to camp', {
      challengeDay: this.currentChallenge?.day,
      challengeName: this.currentChallenge?.name,
      phase: gameManager.gamePhase,
      postChallengeMode: gameManager.postChallengeMode,
      usedStateDrivenTransition: true
    });

    // Return to camp via the state-driven path only.
    gameManager.setGameState('camp');
  }

  teardown() {
    console.log('ChallengeScreen teardown');
    this.activeChallengeView?.dispose();
    this.activeChallengeView = null;
    if (this.container) {
      clearChildren(this.container);
    }
    this.currentView = null;
    this.currentChallenge = null;
  }

  destroy() {
    this.activeChallengeView?.dispose();
    this.activeChallengeView = null;
    if (this.container) {
      clearChildren(this.container);
    }
    this.currentView = null;
    this.currentChallenge = null;
  }
}
