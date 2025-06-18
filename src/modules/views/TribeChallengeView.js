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

  // Create Jeff introduction section
  const jeffSection = createElement('div', {
    style: `
      position: relative;
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: flex-start;
      padding-top: 20px;
    `
  });

  // Add Jeff image (positioned same as tribe division)
  const jeffImage = createElement('img', {
    src: 'Assets/jeff-screen.png',
    style: `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
      z-index: 1;
    `
  });

  // Create parchment wrapper for text
  const parchmentWrapper = createElement('div', {
    style: `
      position: relative;
      width: 100%;
      max-width: 320px;
      margin: 30px auto 0;
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

  // Add Jeff's speech text
  const speechText = createElement('div', {
    style: `
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 90%;
      text-align: center;
      font-family: 'Survivant', serif;
      font-size: 1.2rem;
      color: #2c1810;
      line-height: 1.4;
      font-weight: bold;
    `
  }, 'Come on in, guys!');

  // Add continue button
  const continueButton = createElement('button', {
    className: 'rect-button',
    style: `
      position: absolute;
      bottom: 100px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 3;
      padding: 12px 24px;
      font-size: 1rem;
    `,
    onclick: () => {
      console.log('Continue to Challenge clicked');
      // Return to camp screen summary view
      gameManager.setGameState('camp');
      screenManager.showScreen('camp');
      if (window.campScreen && typeof window.campScreen.loadView === 'function') {
        window.campScreen.loadView('summary');
      }
    }
  }, 'Continue to Challenge');

  // Assemble the parchment section
  parchmentWrapper.appendChild(parchment);
  parchmentWrapper.appendChild(speechText);

  // Assemble the Jeff section
  jeffSection.appendChild(jeffImage);
  jeffSection.appendChild(parchmentWrapper);
  jeffSection.appendChild(continueButton);

  // Add to container
  container.appendChild(jeffSection);

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

  // Add event listeners for filter buttons
  const filterButtons = container.querySelectorAll('.filter-button');
  filterButtons.forEach(button => {
    if (button && typeof button.classList !== 'undefined') {
      button.addEventListener('click', () => {
        // Remove active class from all buttons
        filterButtons.forEach(btn => {
          if (btn && typeof btn.classList !== 'undefined') {
            btn.classList.remove('active');
          }
        });
        // Add active class to clicked button
        if (button.classList) {
          button.classList.add('active');
        }

        const filter = button.dataset ? button.dataset.filter : '';
        console.log(`Filter button clicked: ${filter}`);

        // Here you would implement the actual filtering logic
        // For now, just log the filter type
      });
    }
  });
}