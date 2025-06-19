
import { createElement, clearChildren } from '../utils/DOMUtils.js';
import gameManager from '../core/GameManager.js';
import challengeManager from '../core/ChallengeManager.js';

const IndividualChallengeView = {
  render(container, challengeConfig = null) {
    if (!container) {
      console.error('IndividualChallengeView: No container provided');
      return;
    }

    clearChildren(container);

    // Get current game state
    const currentDay = gameManager.getDay();
    const player = gameManager.getPlayerSurvivor();

    // Use provided config or get from challenge manager
    const config = challengeConfig || challengeManager.getCurrentChallenge() || this.getDefaultConfig();

    console.log('=== INDIVIDUAL IMMUNITY CHALLENGE ===');
    console.log('Challenge:', config.name);
    console.log('Day:', config.day);

    // Set background
    container.style.backgroundImage = `url('${config.background}')`;
    container.style.backgroundSize = 'cover';
    container.style.backgroundPosition = 'center';
    container.style.backgroundRepeat = 'no-repeat';

    this.renderIndividualChallenge(container, config, player);
  },

  renderIndividualChallenge(container, config, player) {
    const challengeWrapper = createElement('div', {
      style: `
        position: relative;
        width: 100%;
        height: 100vh;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        background-color: rgba(26, 77, 46, 0.8);
        color: white;
        text-align: center;
      `
    });

    // Challenge title
    const challengeTitle = createElement('h1', {
      style: `
        font-family: 'Survivant', serif;
        font-size: 2.5rem;
        margin-bottom: 20px;
        text-shadow: 2px 2px 4px rgba(0,0,0,0.5);
      `
    }, config.name);

    // Challenge day subtitle
    const daySubtitle = createElement('h2', {
      style: `
        font-family: 'Survivant', serif;
        font-size: 1.5rem;
        margin-bottom: 20px;
        color: #f39c12;
        text-shadow: 2px 2px 4px rgba(0,0,0,0.5);
      `
    }, `Day ${config.day} Individual Immunity Challenge`);

    // Challenge description with mechanics
    const challengeDescription = createElement('div', {
      style: `
        max-width: 600px;
        margin-bottom: 30px;
        line-height: 1.6;
      `
    });

    const description = createElement('p', {
      style: 'font-size: 1.2rem; margin-bottom: 15px;'
    }, config.description);

    const mechanics = challengeManager.getMechanic(config.mechanics);
    if (mechanics) {
      const mechanicsInfo = createElement('p', {
        style: `
          font-size: 1rem;
          color: #f39c12;
          font-style: italic;
        `
      }, `${mechanics.icon} ${mechanics.description}`);
      challengeDescription.append(description, mechanicsInfo);
    } else {
      challengeDescription.appendChild(description);
    }

    // Player info
    const playerInfo = this.createPlayerDisplay(player);

    // Continue button
    const continueButton = createElement('button', {
      className: 'rect-button',
      style: `
        padding: 15px 30px;
        font-size: 1.1rem;
        margin-top: 30px;
      `,
      onclick: () => {
        console.log(`${config.name} completed - returning to camp`);
        this.completeChallengeAndReturnToCamp(config);
      }
    }, 'Complete Challenge');

    challengeWrapper.append(
      challengeTitle, 
      daySubtitle, 
      challengeDescription, 
      playerInfo, 
      continueButton
    );
    container.appendChild(challengeWrapper);
  },

  createPlayerDisplay(player) {
    if (!player) {
      return createElement('div');
    }

    const playerContainer = createElement('div', {
      style: `
        background-color: rgba(0,0,0,0.6);
        border: 2px solid #f39c12;
        border-radius: 10px;
        padding: 15px;
        margin: 20px 0;
        min-width: 200px;
      `
    });

    const playerName = createElement('h3', {
      style: `
        color: #f39c12;
        margin-bottom: 10px;
        font-family: 'Survivant', sans-serif;
      `
    }, `${player.firstName} ${player.lastName}`);

    const playerStatus = createElement('p', {
      style: 'margin: 5px 0;'
    }, 'Competing for Individual Immunity');

    playerContainer.append(playerName, playerStatus);
    return playerContainer;
  },

  getDefaultConfig() {
    return {
      name: 'Individual Immunity Challenge',
      description: 'Compete for individual immunity and safety from tribal council.',
      background: 'Assets/Screens/individual-challenge.png',
      mechanics: 'endurance',
      day: gameManager.getDay()
    };
  },

  completeChallengeAndReturnToCamp(config) {
    // Store basic challenge completion result
    const result = {
      challengeName: config.name,
      challengeType: config.type,
      completed: true,
      completedAt: new Date().toISOString()
    };

    // Use challenge screen's completion method if available
    if (window.challengeScreen && typeof window.challengeScreen.completeChallenge === 'function') {
      window.challengeScreen.completeChallenge(result);
    } else {
      // Fallback to direct navigation
      gameManager.advanceGamePhase();
      gameManager.setGameState('camp');
      screenManager.showScreen('camp');

      if (window.campScreen && typeof window.campScreen.loadView === 'function') {
        window.campScreen.loadView('flag');
      }
    }
  }
};

export default IndividualChallengeView;
