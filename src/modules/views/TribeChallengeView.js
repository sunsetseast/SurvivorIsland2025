
import { createElement, clearChildren } from '../utils/DOMUtils.js';
import gameManager from '../core/GameManager.js';
import screenManager from '../core/ScreenManager.js';

const TribeChallengeView = {
  render(container) {
    if (!container) {
      console.error('TribeChallengeView: No container provided');
      return;
    }

    clearChildren(container);

    // Get current game state
    const currentDay = gameManager.getDay();
    const gamePhase = gameManager.getGamePhase();
    const playerTribe = gameManager.getPlayerTribe();
    const allTribes = gameManager.getTribes();
    const player = gameManager.getPlayerSurvivor();

    console.log('=== TRIBAL IMMUNITY CHALLENGE ===');
    console.log('Current day:', currentDay);
    console.log('Game phase:', gamePhase);
    console.log('Player tribe:', playerTribe?.name);
    console.log('Total tribes:', allTribes?.length);

    // Determine if this is the first immunity challenge
    // First challenge happens on Day 1 when moving from preChallenge to challenge phase
    const isFirstChallenge = currentDay === 1 && gamePhase === 'challenge';

    // Set background to challenge image
    container.style.backgroundImage = "url('Assets/Screens/challenge.png')";
    container.style.backgroundSize = 'cover';
    container.style.backgroundPosition = 'center';
    container.style.backgroundRepeat = 'no-repeat';

    if (isFirstChallenge) {
      this.renderFirstChallengeIntro(container, playerTribe, allTribes, player);
    } else {
      this.renderRegularChallenge(container, currentDay, playerTribe, allTribes);
    }
  },

  renderFirstChallengeIntro(container, playerTribe, allTribes, player) {
    // Jeff background overlay
    const jeffOverlay = createElement('div', {
      style: `
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background-image: url('Assets/jeff-screen.png');
        background-size: cover;
        background-position: center;
        background-repeat: no-repeat;
        z-index: 1;
      `
    });

    // Parchment wrapper positioned at top
    const parchmentWrapper = createElement('div', {
      style: `
        position: absolute;
        top: 30px;
        left: 50%;
        transform: translateX(-50%);
        width: 100%;
        max-width: 320px;
        z-index: 2;
      `
    });

    const parchment = createElement('img', {
      src: 'Assets/parch-landscape.png',
      style: `
        width: 100%;
        max-width: 320px;
        max-height: 180px;
        display: block;
        margin: 0 auto;
      `
    });

    const jeffText = createElement('div', {
      className: 'parchment-text',
      style: `
        color: white;
        font-family: 'Survivant', sans-serif;
        font-weight: bold;
        text-align: center;
        margin: -160px auto 0;
        max-width: 260px;
        font-size: 1.2rem;
        line-height: 1.3;
        text-shadow:
          0 1px 0 #000,
          0 2px 0 #000,
          0 3px 0 #000,
          0 4px 4px rgba(0, 0, 0, 0.5);
      `
    }, 'COME ON IN, GUYS!');

    parchmentWrapper.append(parchment, jeffText);

    // Challenge info container
    const challengeInfo = createElement('div', {
      style: `
        position: absolute;
        bottom: 120px;
        left: 50%;
        transform: translateX(-50%);
        background-color: rgba(0, 0, 0, 0.8);
        color: white;
        padding: 20px;
        border-radius: 10px;
        max-width: 400px;
        text-align: center;
        z-index: 2;
      `
    });

    const challengeTitle = createElement('h2', {
      style: `
        font-family: 'Survivant', serif;
        font-size: 1.8rem;
        margin-bottom: 15px;
        color: #f39c12;
        text-shadow: 2px 2px 4px rgba(0,0,0,0.5);
      `
    }, 'First Immunity Challenge');

    const challengeDescription = createElement('p', {
      style: `
        font-size: 1rem;
        margin-bottom: 15px;
        line-height: 1.5;
      `
    }, `Day ${gameManager.getDay()} - Your first test begins! ${allTribes.length} tribes will compete for immunity. The losing tribe will face their first tribal council tonight.`);

    // Tribe status
    const tribeStatus = createElement('div', {
      style: `
        margin: 15px 0;
        padding: 10px;
        background-color: rgba(255,255,255,0.1);
        border-radius: 5px;
      `
    });

    const tribeInfo = createElement('p', {
      style: `
        margin: 5px 0;
        font-weight: bold;
        color: ${playerTribe?.tribeColor || '#fff'};
      `
    }, `Your Tribe: ${playerTribe?.tribeName || 'Unknown'} (${playerTribe?.members?.length || 0} members)`);

    const playerInfo = createElement('p', {
      style: `
        margin: 5px 0;
        font-style: italic;
      `
    }, `Playing as: ${player?.firstName || 'Unknown'} ${player?.lastName || ''}`);

    tribeStatus.append(tribeInfo, playerInfo);
    challengeInfo.append(challengeTitle, challengeDescription, tribeStatus);

    // Continue button
    const continueButton = createElement('button', {
      className: 'rect-button',
      style: `
        position: absolute;
        bottom: 40px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 2;
        padding: 15px 30px;
        font-size: 1.1rem;
      `,
      onclick: () => {
        console.log('First challenge completed - returning to camp');
        this.completeChallengeAndReturnToCamp();
      }
    }, 'Begin Challenge');

    container.append(jeffOverlay, parchmentWrapper, challengeInfo, continueButton);
  },

  renderRegularChallenge(container, currentDay, playerTribe, allTribes) {
    // Create main challenge wrapper
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
    }, `Day ${currentDay} Immunity Challenge`);

    // Challenge description
    const challengeDescription = createElement('p', {
      style: `
        font-size: 1.2rem;
        margin-bottom: 30px;
        max-width: 600px;
        line-height: 1.6;
      `
    }, `Today's challenge will test your tribe's endurance, strategy, and determination. Only the winning tribe${allTribes.length > 2 ? 's' : ''} will earn immunity and safety from tonight's tribal council.`);

    // Tribe standings
    if (allTribes && allTribes.length > 0) {
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

      challengeWrapper.appendChild(tribesContainer);
    }

    // Continue button
    const continueButton = createElement('button', {
      className: 'rect-button',
      style: `
        padding: 15px 30px;
        font-size: 1.1rem;
        margin-top: 30px;
      `,
      onclick: () => {
        console.log('Challenge completed - returning to camp');
        this.completeChallengeAndReturnToCamp();
      }
    }, 'Complete Challenge');

    challengeWrapper.append(challengeTitle, challengeDescription, continueButton);
    container.appendChild(challengeWrapper);
  },

  completeChallengeAndReturnToCamp() {
    // Advance game phase after challenge
    gameManager.advanceGamePhase();
    
    // Return to camp screen
    gameManager.setGameState('camp');
    screenManager.showScreen('camp');
    
    // Load the flag view to show results
    if (window.campScreen && typeof window.campScreen.loadView === 'function') {
      window.campScreen.loadView('flag');
    }
  }
};

export default TribeChallengeView;
