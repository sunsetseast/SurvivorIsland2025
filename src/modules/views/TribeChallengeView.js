import { createElement, clearChildren } from '../utils/DOMUtils.js';
import gameManager from '../core/GameManager.js';
import challengeManager from '../core/ChallengeManager.js';

const TribeChallengeView = {
  render(container, challengeConfig = null) {
    if (!container) {
      console.error('TribeChallengeView: No container provided');
      return;
    }

    // Reset challenge stage when starting a new challenge
    this.challengeStage = 0;

    clearChildren(container);

    // Get current game state
    const currentDay = gameManager.getDay();
    const playerTribe = gameManager.getPlayerTribe();
    const allTribes = gameManager.getTribes();
    const player = gameManager.getPlayerSurvivor();

    // Use provided config or get from challenge manager
    const config = challengeConfig || challengeManager.getCurrentChallenge() || this.getDefaultConfig();

    console.log('=== TRIBAL IMMUNITY CHALLENGE ===');
    console.log('Challenge:', config.name);
    console.log('Day:', config.day);

    // Set background
    container.style.backgroundImage = `url('${config.background}')`;
    container.style.backgroundSize = 'cover';
    container.style.backgroundPosition = 'center';
    container.style.backgroundRepeat = 'no-repeat';

    // Render based on challenge configuration
    if (config.isSpecial && config.showJeff) {
      this.renderChallengeInfo(container, config, playerTribe, allTribes, player);
    } else {
      this.renderStandardChallenge(container, config, playerTribe, allTribes);
    }
  },

  renderChallengeInfo(container, config, playerTribe, allTribes, player) {
    clearChildren(container);

    // Challenge info container
    const challengeInfo = this.createChallengeInfoBox(config, playerTribe, allTribes, player);

    // Continue button
    const continueButton = createElement('button', {
      style: `
        position: absolute;
        bottom: 40px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 2;
        width: 130px;
        height: 60px;
        background-image: url('Assets/rect-button.png');
        background-size: contain;
        background-repeat: no-repeat;
        background-position: center;
        border: none;
        color: white;
        font-family: 'Survivant', sans-serif;
        font-size: 1.15rem;
        font-weight: bold;
        text-shadow: 1px 1px 2px black;
        padding: 0;
        cursor: pointer;
      `,
      onclick: () => {
        console.log(`${config.name} completed - returning to camp`);
        this.completeChallengeAndReturnToCamp(config);
      }
    }, 'Complete Challenge');

    container.append(challengeInfo, continueButton);
  },

  renderStandardChallenge(container, config, playerTribe, allTribes) {
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
    }, `Day ${config.day} Immunity Challenge`);

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

    // Tribe standings
    const tribesContainer = this.createTribesDisplay(allTribes, playerTribe);

    // Continue button
    const continueButton = createElement('button', {
      style: `
        width: 130px;
        height: 60px;
        background-image: url('Assets/rect-button.png');
        background-size: contain;
        background-repeat: no-repeat;
        background-position: center;
        border: none;
        color: white;
        font-family: 'Survivant', sans-serif;
        font-size: 1.15rem;
        font-weight: bold;
        text-shadow: 1px 1px 2px black;
        padding: 0;
        cursor: pointer;
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
      tribesContainer, 
      continueButton
    );
    container.appendChild(challengeWrapper);
  },

  createTribesDisplay(allTribes, playerTribe) {
    if (!allTribes || allTribes.length === 0) {
      return createElement('div');
    }

    const tribesContainer = createElement('div', {
      style: `
        display: flex;
        gap: 20px;
        margin: 20px 0;
        flex-wrap: wrap;
        justify-content: center;
      `
    });

    allTribes.forEach(tribe => {
      const tribeBox = createElement('div', {
        style: `
          background-color: rgba(0,0,0,0.6);
          border: 2px solid ${tribe.tribeColor};
          border-radius: 10px;
          padding: 15px;
          min-width: 150px;
          ${tribe.id === playerTribe?.id ? 'box-shadow: 0 0 15px rgba(255,255,255,0.5);' : ''}
        `
      });

      const tribeName = createElement('h3', {
        style: `
          color: ${tribe.tribeColor};
          margin-bottom: 10px;
          font-family: 'Survivant', sans-serif;
        `
      }, tribe.tribeName);

      const memberCount = createElement('p', {
        style: 'margin: 5px 0;'
      }, `${tribe.members.length} members`);

      const isPlayerTribe = tribe.id === playerTribe?.id;
      if (isPlayerTribe) {
        const yourTribe = createElement('p', {
          style: `
            color: #f39c12;
            font-weight: bold;
            font-style: italic;
          `
        }, 'YOUR TRIBE');
        tribeBox.appendChild(yourTribe);
      }

      tribeBox.append(tribeName, memberCount);
      tribesContainer.appendChild(tribeBox);
    });

    return tribesContainer;
  },

  createChallengeInfoBox(config, playerTribe, allTribes, player) {
    const infoBox = createElement('div', {
      style: `
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background-color: rgba(0,0,0,0.8);
        border: 2px solid #f39c12;
        border-radius: 15px;
        padding: 20px;
        max-width: 400px;
        color: white;
        text-align: center;
        z-index: 2;
      `
    });

    const title = createElement('h2', {
      style: `
        font-family: 'Survivant', sans-serif;
        color: #f39c12;
        margin-bottom: 15px;
      `
    }, config.name);

    const description = createElement('p', {
      style: 'margin-bottom: 20px; line-height: 1.5;'
    }, config.description);

    infoBox.append(title, description);
    return infoBox;
  },

  getDefaultConfig() {
    return {
      name: 'Immunity Challenge',
      description: 'Compete for immunity and safety from tribal council.',
      background: 'Assets/Screens/challenge.png',
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

export default TribeChallengeView;