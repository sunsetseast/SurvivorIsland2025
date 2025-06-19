/**
 * @module TribeChallengeView
 * Renders the Tribal Immunity Challenge screen
 */

import { createElement, clearChildren, addDebugBanner } from '../utils/index.js';
import { gameManager } from '../core/index.js';
import screenManager from '../core/ScreenManager.js';

export default function renderTribeChallengeView(container) {
  console.log('renderTribeChallengeView() called');
  addDebugBanner('renderTribeChallengeView() called', 'purple', 40);

  clearChildren(container);

  // Set background to challenge screen
  container.style.backgroundImage = "url('Assets/Screens/challenge.png')";
  container.style.backgroundSize = 'cover';
  container.style.backgroundPosition = 'center';
  container.style.backgroundRepeat = 'no-repeat';

  // Get game data
  const currentDay = gameManager.getDay();
  const gamePhase = gameManager.getGamePhase();
  const tribes = gameManager.getTribes();
  const playerSurvivor = gameManager.getPlayerSurvivor();
  const playerTribe = gameManager.getPlayerTribe();

  console.log(`Challenge Day: ${currentDay}, Phase: ${gamePhase}`);
  addDebugBanner(`Day ${currentDay} - First Immunity Challenge`, 'blue', 70);

  // Check if this is the first immunity challenge
  const isFirstChallenge = currentDay === 1;

  // Create main challenge content
  const challengeWrapper = createElement('div', {
    style: `
      position: relative;
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 20px;
    `
  });

  const challengeTitle = createElement('h1', {
    style: `
      color: white;
      font-family: 'Survivant', sans-serif;
      font-size: 2.5rem;
      text-align: center;
      text-shadow: 2px 2px 4px black;
      margin-bottom: 20px;
    `
  }, isFirstChallenge ? 'FIRST IMMUNITY CHALLENGE' : 'IMMUNITY CHALLENGE');

  const challengeDescription = createElement('div', {
    style: `
      color: white;
      font-family: 'Survivant', sans-serif;
      font-size: 1.2rem;
      text-align: center;
      text-shadow: 1px 1px 2px black;
      max-width: 600px;
      margin-bottom: 30px;
      line-height: 1.4;
    `
  }, 'The tribes will compete in their first immunity challenge. The losing tribe will face tribal council and vote out their first member.');

  const continueButton = createElement('button', {
    className: 'rect-button',
    style: `
      font-size: 1rem;
    `,
    onclick: () => {
      console.log('Continue from Challenge clicked');
      // This should advance to next day or tribal council
      // For now, return to camp screen
      gameManager.setGameState('camp');
      screenManager.showScreen('camp');
      if (window.campScreen && typeof window.campScreen.loadView === 'function') {
        window.campScreen.loadView('flag');
      }
    }
  }, 'Continue to Challenge');

  challengeWrapper.append(challengeTitle, challengeDescription, continueButton);
  container.appendChild(challengeWrapper);

  

  // Log game state information
  console.log('=== CHALLENGE SCREEN DATA ===');
  console.log('Current Day:', currentDay);
  console.log('Game Phase:', gamePhase);
  console.log('Is First Challenge:', isFirstChallenge);
  console.log('Player:', playerSurvivor?.name);
  console.log('Player Tribe:', playerTribe?.tribeName);
  console.log('Total Tribes:', tribes?.length);

  if (tribes) {
    tribes.forEach((tribe, index) => {
      console.log(`Tribe ${index + 1}: ${tribe.tribeName} (${tribe.members?.length} members)`);
    });
  }

  addDebugBanner(`Player: ${playerSurvivor?.name} | Tribe: ${playerTribe?.tribeName}`, 'green', 100);
}