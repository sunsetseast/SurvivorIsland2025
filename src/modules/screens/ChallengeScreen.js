import { createElement, clearChildren } from '../utils/DOMUtils.js';
import gameManager, { GamePhase } from '../core/GameManager.js';
import challengeManager from '../core/ChallengeManager.js';
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
    ChallengeIntroView.render(this.container, this.currentChallenge, () => {
      // Once intro is complete, show RoleView before actual challenge
      this.loadRoleView();
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
    const playerTribe = gameManager.getPlayerTribe?.();
    const playerTribeKey = playerTribe?.id ?? playerTribe?.tribeName ?? null;
    const hasPlayerWinSignal = typeof results?.playerTribeWon === 'boolean';
    const winningTribeKeys = Array.isArray(results?.winningTribeKeys)
      ? results.winningTribeKeys
      : results?.winningTribeKey != null
        ? [results.winningTribeKey]
        : [];
    const playerTribeWon = hasPlayerWinSignal
      ? results.playerTribeWon
      : winningTribeKeys.some((key) => String(key) === String(playerTribeKey));

    if (results && this.currentChallenge) {
      challengeManager.storeChallengeResult(this.currentChallenge.day, {
        challengeKey: this.currentChallenge.day === 1 ? 'first_contact' : (results.challengeKey || this.currentChallenge.name || '').toLowerCase().replace(/\s+/g, '_'),
        challengeName: this.currentChallenge.name,
        challengeDay: this.currentChallenge.day,
        playerTribeKey,
        playerTribeWon,
        ...results
      });
    }

    if (this.currentChallenge?.type === 'tribal') {
      gameManager.postChallengeMode = playerTribeWon ? 'scripted' : 'playable';
      console.info('[ChallengeScreen] postChallengeMode set', {
        postChallengeMode: gameManager.postChallengeMode,
        playerTribeWon,
        challengeDay: this.currentChallenge?.day,
        challengeName: this.currentChallenge?.name
      });
    }

    // Advance game phase unless already set for post-challenge return
    if (gameManager.gamePhase !== GamePhase.POST_CHALLENGE) {
      gameManager.advanceGamePhase();
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
