
import { getElement, createElement, showElement, hideElement } from '../utils/DOMUtils.js';
import { updateTimer, getCurrentTimeObject } from '../utils/TimerManager.js';
import { player, tribes, gameState } from '../data/GameData.js';
import { showResourceEffect, showTeamPlayerEffect } from '../utils/CommonUtils.js';

export function showShelterView() {
  const container = getElement('game-container');
  container.innerHTML = '';

  // Get current player tribe's shelter value
  const playerTribe = tribes.find(tribe => tribe.id === player.tribeId);
  const shelterLevel = playerTribe.shelter || 0;

  // Create main container with shelter background based on current level
  const shelterContainer = createElement('div', {
    id: 'shelter-container',
    style: `
      position: relative;
      width: 100vw;
      height: 100vh;
      background-image: url('Assets/Screens/shelter${shelterLevel}.jpeg');
      background-size: cover;
      background-position: center;
      background-repeat: no-repeat;
    `
  });

  // Action bar
  const actionBar = createElement('div', {
    className: 'action-bar',
    style: `
      position: absolute;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      gap: 20px;
      z-index: 100;
    `
  });

  // Center build button
  const buildButton = createElement('button', {
    className: 'center-action-button',
    style: `
      width: 80px;
      height: 80px;
      background-image: url('Assets/Screens/shelter${Math.min(shelterLevel + 1, 5)}.jpeg');
      background-size: cover;
      background-position: center;
      border: 3px solid #8B4513;
      border-radius: 10px;
      cursor: pointer;
    `
  });

  buildButton.addEventListener('click', handleBuildButtonClick);
  actionBar.appendChild(buildButton);

  shelterContainer.appendChild(actionBar);
  container.appendChild(shelterContainer);
}

function handleBuildButtonClick() {
  const playerTribe = tribes.find(tribe => tribe.id === player.tribeId);
  const shelterLevel = playerTribe.shelter || 0;
  const bambooCount = player.bamboo || 0;
  const palmCount = player.palms || 0;

  // Check shelter level and show appropriate message
  if (shelterLevel === 5) {
    showShelterMessage("This place can't get much better.");
    return;
  }

  if (shelterLevel === 4) {
    showShelterMessage("You must have a luxury item to enhance your shelter further.");
    return;
  }

  // Check resource requirements
  if (bambooCount < 1 || palmCount < 1) {
    let message;
    if (shelterLevel === 0) {
      message = "Before building a structure, you must gather 1 bamboo and 1 palm frond.";
    } else {
      message = "Before continuing work on the shelter, you must gather 1 bamboo and 1 palm frond.";
    }
    showShelterMessage(message);
    return;
  }

  // Show building introduction
  showBuildingIntroduction();
}

function showShelterMessage(message) {
  const overlay = createElement('div', {
    id: 'shelter-message-overlay',
    style: `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background-color: rgba(0, 0, 0, 0.7);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 2000;
      cursor: pointer;
    `
  });

  const parchment = createElement('div', {
    style: `
      width: 80vw;
      max-width: 400px;
      background-image: url('Assets/parch-landscape.png');
      background-size: contain;
      background-repeat: no-repeat;
      background-position: center;
      padding: 30px;
      box-sizing: border-box;
    `
  });

  const text = createElement('div', {
    style: `
      color: white;
      font-family: 'Survivant', sans-serif;
      font-size: 1.2rem;
      text-align: center;
      text-shadow: 2px 2px 4px black;
      line-height: 1.4;
    `
  }, message);

  parchment.appendChild(text);
  overlay.appendChild(parchment);
  document.body.appendChild(overlay);

  overlay.addEventListener('click', () => {
    overlay.remove();
  });
}

function showBuildingIntroduction() {
  const overlay = createElement('div', {
    id: 'building-intro-overlay',
    style: `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background-color: rgba(0, 0, 0, 0.7);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 2000;
      cursor: pointer;
    `
  });

  const parchment = createElement('div', {
    style: `
      width: 80vw;
      max-width: 400px;
      background-image: url('Assets/parch-landscape.png');
      background-size: contain;
      background-repeat: no-repeat;
      background-position: center;
      padding: 30px;
      box-sizing: border-box;
    `
  });

  const text = createElement('div', {
    style: `
      color: white;
      font-family: 'Survivant', sans-serif;
      font-size: 1.2rem;
      text-align: center;
      text-shadow: 2px 2px 4px black;
      line-height: 1.4;
    `
  }, "A good way to gain favor with the tribe is to help build a strong shelter. However, it's also physically demanding and can take time.<br><br>Choose a tribe mate to join you in shelter building.");

  parchment.appendChild(text);
  overlay.appendChild(parchment);
  document.body.appendChild(overlay);

  overlay.addEventListener('click', () => {
    overlay.remove();
    showCoBuilderSelection();
  });
}

function showCoBuilderSelection() {
  const playerTribe = tribes.find(tribe => tribe.id === player.tribeId);
  const tribeColor = playerTribe.color.toLowerCase();

  const overlay = createElement('div', {
    id: 'cobuilder-selection-overlay',
    style: `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background-color: rgba(0, 0, 0, 0.7);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 2000;
    `
  });

  const banner = createElement('div', {
    style: `
      width: 90vw;
      max-width: 600px;
      height: 80vh;
      background-image: url('Assets/Tribe/${tribeColor}-banner.png');
      background-size: contain;
      background-repeat: no-repeat;
      background-position: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 40px;
      box-sizing: border-box;
    `
  });

  // Grid of tribe mates (excluding player)
  const grid = createElement('div', {
    style: `
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
      gap: 20px;
      width: 100%;
      max-width: 500px;
      margin-top: 20px;
    `
  });

  // Get tribe members excluding player
  const tribeMembers = playerTribe.members.filter(member => member.id !== player.id);

  tribeMembers.forEach(member => {
    const memberCard = createElement('div', {
      style: `
        display: flex;
        flex-direction: column;
        align-items: center;
        cursor: pointer;
        transition: transform 0.2s;
      `
    });

    memberCard.addEventListener('mouseenter', () => {
      memberCard.style.transform = 'scale(1.05)';
    });

    memberCard.addEventListener('mouseleave', () => {
      memberCard.style.transform = 'scale(1)';
    });

    const avatar = createElement('img', {
      src: `Assets/Avatars/${member.avatar}`,
      alt: member.name,
      style: `
        width: 80px;
        height: 80px;
        border-radius: 50%;
        border: 3px solid #8B4513;
        object-fit: cover;
      `
    });

    const name = createElement('div', {
      style: `
        color: white;
        font-family: 'Survivant', sans-serif;
        font-size: 1rem;
        text-align: center;
        margin-top: 8px;
        text-shadow: 2px 2px 4px black;
      `
    }, member.name);

    const physical = createElement('div', {
      style: `
        color: white;
        font-family: 'Survivant', sans-serif;
        font-size: 0.9rem;
        text-align: center;
        margin-top: 4px;
        text-shadow: 2px 2px 4px black;
      `
    }, `Physical: ${member.physical}`);

    memberCard.appendChild(avatar);
    memberCard.appendChild(name);
    memberCard.appendChild(physical);

    memberCard.addEventListener('click', () => {
      showCoBuilderConfirmation(member, overlay);
    });

    grid.appendChild(memberCard);
  });

  banner.appendChild(grid);
  overlay.appendChild(banner);
  document.body.appendChild(overlay);
}

function showCoBuilderConfirmation(selectedMember, previousOverlay) {
  const playerTribe = tribes.find(tribe => tribe.id === player.tribeId);
  const tribeColor = playerTribe.color.toLowerCase();

  const overlay = createElement('div', {
    id: 'cobuilder-confirmation-overlay',
    style: `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background-color: rgba(0, 0, 0, 0.7);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 2001;
    `
  });

  const banner = createElement('div', {
    style: `
      width: 80vw;
      max-width: 400px;
      height: 60vh;
      background-image: url('Assets/Tribe/${tribeColor}-banner.png');
      background-size: contain;
      background-repeat: no-repeat;
      background-position: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 40px;
      box-sizing: border-box;
    `
  });

  const avatar = createElement('img', {
    src: `Assets/Avatars/${selectedMember.avatar}`,
    alt: selectedMember.name,
    style: `
      width: 100px;
      height: 100px;
      border-radius: 50%;
      border: 3px solid #8B4513;
      object-fit: cover;
      margin-bottom: 20px;
    `
  });

  const question = createElement('div', {
    style: `
      color: white;
      font-family: 'Survivant', sans-serif;
      font-size: 1.3rem;
      text-align: center;
      margin-bottom: 30px;
      text-shadow: 2px 2px 4px black;
    `
  }, `Choose ${selectedMember.name}?`);

  const buttonContainer = createElement('div', {
    style: `
      display: flex;
      gap: 20px;
    `
  });

  const confirmButton = createElement('button', {
    className: 'rect-button small',
    style: `
      background-image: url('Assets/rect-button.png');
      background-size: contain;
      background-repeat: no-repeat;
      background-position: center;
      border: none;
      width: 100px;
      height: 40px;
      color: white;
      font-family: 'Survivant', sans-serif;
      font-size: 1rem;
      cursor: pointer;
      text-shadow: 2px 2px 4px black;
    `
  }, 'Confirm');

  const cancelButton = createElement('button', {
    className: 'rect-button small',
    style: `
      background-image: url('Assets/rect-button.png');
      background-size: contain;
      background-repeat: no-repeat;
      background-position: center;
      border: none;
      width: 100px;
      height: 40px;
      color: white;
      font-family: 'Survivant', sans-serif;
      font-size: 1rem;
      cursor: pointer;
      text-shadow: 2px 2px 4px black;
    `
  }, 'Cancel');

  confirmButton.addEventListener('click', () => {
    overlay.remove();
    previousOverlay.remove();
    startResourceCollection(selectedMember);
  });

  cancelButton.addEventListener('click', () => {
    overlay.remove();
  });

  buttonContainer.appendChild(confirmButton);
  buttonContainer.appendChild(cancelButton);

  banner.appendChild(avatar);
  banner.appendChild(question);
  banner.appendChild(buttonContainer);

  overlay.appendChild(banner);
  document.body.appendChild(overlay);
}

function startResourceCollection(coBuilder) {
  const container = getElement('game-container');
  
  // Add resource buttons above action bar
  const resourceContainer = createElement('div', {
    id: 'resource-container',
    style: `
      position: absolute;
      bottom: 120px;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      gap: 20px;
      z-index: 100;
    `
  });

  const bambooButton = createElement('button', {
    id: 'bamboo-button',
    style: `
      width: 60px;
      height: 60px;
      background-image: url('Assets/Resources/bamboo.png');
      background-size: contain;
      background-repeat: no-repeat;
      background-position: center;
      border: 3px solid #8B4513;
      border-radius: 10px;
      cursor: pointer;
      background-color: rgba(255, 255, 255, 0.1);
    `
  });

  const palmButton = createElement('button', {
    id: 'palm-button',
    style: `
      width: 60px;
      height: 60px;
      background-image: url('Assets/Resources/palm.png');
      background-size: contain;
      background-repeat: no-repeat;
      background-position: center;
      border: 3px solid #8B4513;
      border-radius: 10px;
      cursor: pointer;
      background-color: rgba(255, 255, 255, 0.1);
    `
  });

  bambooButton.addEventListener('click', () => showResourcePopup('bamboo', coBuilder));
  palmButton.addEventListener('click', () => showResourcePopup('palm', coBuilder));

  resourceContainer.appendChild(bambooButton);
  resourceContainer.appendChild(palmButton);
  container.appendChild(resourceContainer);

  // Store co-builder for later use
  window.selectedCoBuilder = coBuilder;
  window.resourcesAdded = { bamboo: false, palm: false };
}

function showResourcePopup(resourceType, coBuilder) {
  const resourceName = resourceType === 'bamboo' ? 'Bamboo' : 'Palm Fronds';
  const playerResourceCount = player[resourceType === 'bamboo' ? 'bamboo' : 'palms'] || 0;

  if (playerResourceCount < 1) {
    showShelterMessage(`You don't have any ${resourceName.toLowerCase()}.`);
    return;
  }

  if (window.resourcesAdded[resourceType]) {
    showShelterMessage(`You've already added ${resourceName.toLowerCase()}.`);
    return;
  }

  const overlay = createElement('div', {
    style: `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background-color: rgba(0, 0, 0, 0.7);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 2000;
    `
  });

  const parchment = createElement('div', {
    style: `
      width: 80vw;
      max-width: 400px;
      background-image: url('Assets/parch-landscape.png');
      background-size: contain;
      background-repeat: no-repeat;
      background-position: center;
      padding: 30px;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      align-items: center;
    `
  });

  const title = createElement('div', {
    style: `
      color: white;
      font-family: 'Survivant', sans-serif;
      font-size: 1.3rem;
      text-align: center;
      text-shadow: 2px 2px 4px black;
      margin-bottom: 20px;
    `
  }, `Add ${resourceName}`);

  const addButton = createElement('button', {
    style: `
      background-image: url('Assets/rect-button.png');
      background-size: contain;
      background-repeat: no-repeat;
      background-position: center;
      border: none;
      width: 120px;
      height: 40px;
      color: white;
      font-family: 'Survivant', sans-serif;
      font-size: 1rem;
      cursor: pointer;
      text-shadow: 2px 2px 4px black;
    `
  }, 'Add 1');

  addButton.addEventListener('click', () => {
    // Deduct resource
    if (resourceType === 'bamboo') {
      player.bamboo = Math.max(0, player.bamboo - 1);
    } else {
      player.palms = Math.max(0, player.palms - 1);
    }

    // Mark as added
    window.resourcesAdded[resourceType] = true;

    // Update button appearance
    const button = getElement(`${resourceType}-button`);
    button.style.opacity = '0.5';
    button.style.cursor = 'not-allowed';

    overlay.remove();

    // Check if both resources are added
    if (window.resourcesAdded.bamboo && window.resourcesAdded.palm) {
      showStartBuildingButton();
    }
  });

  parchment.appendChild(title);
  parchment.appendChild(addButton);
  overlay.appendChild(parchment);
  document.body.appendChild(overlay);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      overlay.remove();
    }
  });
}

function showStartBuildingButton() {
  const container = getElement('game-container');

  const startButton = createElement('button', {
    id: 'start-building-button',
    className: 'rect-button-1 alt',
    style: `
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background-image: url('Assets/rect-button-1.png');
      background-size: contain;
      background-repeat: no-repeat;
      background-position: center;
      border: none;
      width: 200px;
      height: 60px;
      color: white;
      font-family: 'Survivant', sans-serif;
      font-size: 1.2rem;
      cursor: pointer;
      text-shadow: 2px 2px 4px black;
      z-index: 200;
    `
  }, 'Start Building');

  startButton.addEventListener('click', () => {
    startBuildingProcess();
    startButton.remove();
  });

  container.appendChild(startButton);
}

function startBuildingProcess() {
  const coBuilder = window.selectedCoBuilder;
  const playerPhysical = player.physical || 1;
  const coBuilderPhysical = coBuilder.physical || 1;

  // Calculate time based on combined physical values
  // Higher physical = less time, lower physical = more time
  const combinedPhysical = playerPhysical + coBuilderPhysical;
  const baseTime = 20; // Maximum time
  const minTime = 5; // Minimum time
  
  // Scale time inversely with physical values (assuming max physical is around 10 each)
  const timeReduction = Math.floor((combinedPhysical - 2) * (baseTime - minTime) / 18);
  const buildTime = Math.max(minTime, baseTime - timeReduction);

  // Update timer
  updateTimer(-buildTime);

  // Show completion message
  const overlay = createElement('div', {
    style: `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background-color: rgba(0, 0, 0, 0.7);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 2000;
      cursor: pointer;
    `
  });

  const parchment = createElement('div', {
    style: `
      width: 80vw;
      max-width: 400px;
      background-image: url('Assets/parch-landscape.png');
      background-size: contain;
      background-repeat: no-repeat;
      background-position: center;
      padding: 30px;
      box-sizing: border-box;
    `
  });

  const text = createElement('div', {
    style: `
      color: white;
      font-family: 'Survivant', sans-serif;
      font-size: 1.2rem;
      text-align: center;
      text-shadow: 2px 2px 4px black;
      line-height: 1.4;
    `
  }, `Based on your and ${coBuilder.name}'s Physical values, construction took ${buildTime} minutes.`);

  parchment.appendChild(text);
  overlay.appendChild(parchment);
  document.body.appendChild(overlay);

  // Update shelter level
  const playerTribe = tribes.find(tribe => tribe.id === player.tribeId);
  playerTribe.shelter = (playerTribe.shelter || 0) + 1;

  // Add team player points
  player.teamPlayer = (player.teamPlayer || 0) + 10;
  coBuilder.teamPlayer = (coBuilder.teamPlayer || 0) + 10;

  // Show team player effect
  showTeamPlayerEffect();

  overlay.addEventListener('click', () => {
    overlay.remove();
    
    // Clean up and refresh view
    const resourceContainer = getElement('resource-container');
    if (resourceContainer) {
      resourceContainer.remove();
    }
    
    // Clean up global variables
    delete window.selectedCoBuilder;
    delete window.resourcesAdded;
    
    // Refresh shelter view with new level
    showShelterView();
  });
}
