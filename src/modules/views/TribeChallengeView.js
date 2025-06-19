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
        background-color: #1a4d2e;
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
    }, 'Immunity Challenge');

    // Challenge description
    const challengeDescription = createElement('p', {
      style: `
        font-size: 1.2rem;
        margin-bottom: 30px;
        max-width: 600px;
        line-height: 1.6;
      `
    }, 'Today\'s challenge will test your endurance, strategy, and determination. Only one tribe will earn immunity and safety from tonight\'s tribal council.');

    // Continue button
    const continueButton = createElement('button', {
      className: 'rect-button',
      style: `
        padding: 15px 30px;
        font-size: 1.1rem;
        margin-top: 20px;
      `,
      onclick: () => {
        console.log('Continue from Challenge clicked');
        // Return to camp screen after challenge
        gameManager.setGameState('camp');
        screenManager.showScreen('camp');
        if (window.campScreen && typeof window.campScreen.loadView === 'function') {
          window.campScreen.loadView('flag');
        }
      }
    }, 'Continue to Camp');

    challengeWrapper.append(challengeTitle, challengeDescription, continueButton);
    container.appendChild(challengeWrapper);

    // Log game state information
    console.log('=== CHALLENGE SCREEN DATA ===');
    console.log('Current day:', gameManager.getDay());
    console.log('Game phase:', gameManager.getGamePhase());
    console.log('Player tribe:', gameManager.getPlayerTribe());
  }
};

export default TribeChallengeView;