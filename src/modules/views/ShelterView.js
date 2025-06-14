
/**
 * @module ShelterView
 * Renders the shelter screen inside the Camp Phase with building functionality
 */

import { createElement, clearChildren, addDebugBanner } from '../utils/index.js';
import { gameManager } from '../core/index.js';
import { getRandomInt } from '../utils/CommonUtils.js';
import timerManager from '../utils/TimerManager.js';
import activityTracker from '../utils/ActivityTracker.js';

let selectedCoBuilder = null;
let bambooAdded = 0;
let palmsAdded = 0;

export default function renderShelter(container) {
  console.log('renderShelter() called');
  addDebugBanner('renderShelter() called', 'darkgreen', 40);

  clearChildren(container);

  // Get player's tribe shelter value to determine background
  const playerTribe = gameManager.getPlayerTribe();
  const tribeShelterValue = playerTribe && typeof playerTribe.shelter === 'number' ? playerTribe.shelter : 0;

  // Set background based on shelter level
  const backgroundImage = `url('Assets/Screens/shelter${tribeShelterValue}.jpeg')`;
  container.style.backgroundImage = backgroundImage;
  container.style.backgroundSize = 'cover';
  container.style.backgroundPosition = 'center';
  container.style.backgroundRepeat = 'no-repeat';

  const wrapper = createElement('div', {
    className: 'shelter-wrapper',
    style: `
      position: relative;
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    `
  });

  // --- SHELTER LEVEL INDICATOR (5 circles on left side) ---
  const shelterLevelContainer = createElement('div', {
    id: 'shelter-level-indicator',
    style: `
      position: absolute;
      left: 5px;
      top: 50%;
      transform: translateY(-50%);
      display: flex;
      flex-direction: column;
      gap: 12px;
      z-index: 10;
    `
  });

  // Create 5 circles for shelter levels (bottom to top: level 1, 2, 3, 4, 5)
  for (let i = 4; i >= 0; i--) { // Reverse order so bottom circle is index 0
    const circle = createElement('div', {
      id: `shelter-level-${i}`,
      style: `
        width: 30px;
        height: 30px;
        border-radius: 50%;
        border: 3px solid #8B4513;
        background: rgba(139, 69, 19, 0.3);
        transition: all 0.4s ease;
      `
    });

    // Light up circles based on current shelter level
    if (tribeShelterValue > i) {
      circle.style.background = 'linear-gradient(45deg, #22c55e, #16a34a)';
      circle.style.borderColor = '#22c55e';
      circle.style.boxShadow = '0 0 15px rgba(34, 197, 94, 0.8)';
    }

    shelterLevelContainer.appendChild(circle);
  }

  container.appendChild(shelterLevelContainer);

  const message = createElement('div', {
    id: 'shelter-message',
    style: `
      color: white;
      text-shadow: 2px 2px 4px black;
      font-size: 1.8rem;
      font-family: 'Survivant', sans-serif;
      text-align: center;
      padding: 20px;
      z-index: 2;

      /* Start fully visible and allow a fade transition */
      opacity: 1;
      transition: opacity 1s ease;
    `
  }, 'Shelter: Rest, recover, and prepare for the next challenge.');

  wrapper.appendChild(message);
  container.appendChild(wrapper);

  // Fade out after 3 seconds (3000ms)
  setTimeout(() => {
    const msgEl = document.getElementById('shelter-message');
    if (msgEl) {
      msgEl.style.opacity = '0';
    }
  }, 3000);

  // Remove the message from DOM after 4 seconds (4000ms)
  setTimeout(() => {
    const msgEl = document.getElementById('shelter-message');
    if (msgEl) {
      msgEl.remove();
    }
  }, 4000);

  // Resource buttons (initially hidden)
  createResourceButtons(container);

  // --- Action Bar Buttons ---
  const actionButtons = document.getElementById('action-buttons');
  if (actionButtons) {
    clearChildren(actionButtons);

    actionButtons.style.justifyContent = 'center';
    actionButtons.style.gap = '20px';
    actionButtons.style.padding = '0';

    const createIconButton = (src, alt, onClick) => {
      const wrapper = createElement('div', {
        style: `
          width: 260px;
          height: 150px;
          display: inline-block;
          overflow: hidden;
          cursor: pointer;
        `
      });

      const image = createElement('img', {
        src,
        alt,
        style: `
          width: 100%;
          height: 100%;
          display: block;
          object-fit: contain;
          pointer-events: none;
        `
      });

      wrapper.appendChild(image);
      if (onClick) wrapper.addEventListener('click', onClick);
      return wrapper;
    };

    const leftButton = createIconButton('Assets/Buttons/left.png', 'Left', () => {
      console.log('Left button clicked - returning to Campfire');
      window.campScreen.loadView('campfire');
    });

    const centerButton = createIconButton('Assets/Buttons/blank.png', 'Center', handleCenterButtonClick);

    const downButton = createIconButton('Assets/Buttons/down.png', 'Down', () => {
      console.log('Down button clicked — loading Fork1 View');
      window.campScreen.loadView('fork1');
    });

    actionButtons.appendChild(leftButton);
    actionButtons.appendChild(centerButton);
    actionButtons.appendChild(downButton);
  }
  addDebugBanner('Shelter view rendered!', 'forestgreen', 170);
}

function handleCenterButtonClick() {
  const playerTribe = gameManager.getPlayerTribe();
  const player = gameManager.getPlayerSurvivor();
  
  if (!playerTribe || !player) return;

  const shelterValue = playerTribe.shelter || 0;
  const bambooCount = player.bamboo || 0;
  const palmsCount = player.palms || 0;

  let message = '';
  let canProceed = false;

  if (shelterValue === 5) {
    message = "This place can't get much better.";
  } else if (shelterValue === 4) {
    message = "You must have a luxury item to enhance your shelter further.";
  } else if (shelterValue >= 0 && shelterValue <= 3) {
    if (bambooCount < 1 || palmsCount < 1) {
      if (shelterValue === 0) {
        message = "Before building a structure, you must gather 1 bamboo and 1 palm frond.";
      } else {
        message = "Before continuing work on the shelter, you must gather 1 bamboo and 1 palm frond.";
      }
    } else {
      message = "A good way to gain favor with the tribe is to help build a strong shelter. However, it's also physically demanding and can take time.\n\nChoose a tribe mate to join you in shelter building.";
      canProceed = true;
    }
  }

  showParchmentPopup(message, canProceed);
}

function showParchmentPopup(message, canProceed = false) {
  const popup = createElement('div', {
    id: 'parchment-popup',
    style: `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 400px;
      height: 300px;
      background-image: url('Assets/parch-portrait.png');
      background-size: 100% 100%;
      background-position: center;
      background-repeat: no-repeat;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      cursor: pointer;
      padding: 40px;
      box-sizing: border-box;
    `
  });

  const text = createElement('div', {
    style: `
      font-family: 'Survivant', serif;
      font-size: 18px;
      color: white;
      text-shadow: 3px 3px 6px black;
      text-align: center;
      line-height: 1.4;
      white-space: pre-line;
    `
  }, message);

  popup.appendChild(text);
  document.body.appendChild(popup);

  popup.addEventListener('click', () => {
    popup.remove();
    if (canProceed) {
      showCoBuilderSelection();
    }
  });
}

function showCoBuilderSelection() {
  const playerTribe = gameManager.getPlayerTribe();
  const player = gameManager.getPlayerSurvivor();
  
  if (!playerTribe || !player) return;

  const tribeColor = playerTribe.color || 'blue';
  const backgroundImage = `Assets/Tribe/${tribeColor}-banner.png`;

  const popup = createElement('div', {
    id: 'cobuilder-popup',
    style: `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background-image: url('${backgroundImage}');
      background-size: cover;
      background-position: center;
      background-repeat: no-repeat;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      padding: 20px;
      box-sizing: border-box;
    `
  });

  const grid = createElement('div', {
    style: `
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 8px;
      max-width: 500px;
      width: 90%;
      padding: 40px 20px;
      margin-top: 20px;
    `
  });

  // Get tribe members excluding the player
  const tribeMembers = playerTribe.members.filter(member => member.id !== player.id);

  tribeMembers.forEach(survivor => {
    const memberCard = createElement('div', {
      style: `
        display: flex;
        flex-direction: column;
        align-items: center;
        cursor: pointer;
        padding: 5px;
        border-radius: 10px;
        transition: background-color 0.3s;
      `
    });

    memberCard.addEventListener('mouseenter', () => {
      memberCard.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
    });

    memberCard.addEventListener('mouseleave', () => {
      memberCard.style.backgroundColor = 'transparent';
    });

    const avatar = createElement('img', {
      src: survivor.avatarUrl,
      alt: survivor.name,
      style: `
        width: 60px;
        height: 60px;
        border-radius: 50%;
        object-fit: cover;
        border: 2px solid white;
        margin-bottom: 3px;
      `
    });

    const name = createElement('div', {
      style: `
        font-family: 'Survivant', serif;
        font-size: 12px;
        color: white;
        text-shadow: 1px 1px 2px black;
        text-align: center;
        margin-bottom: 1px;
      `
    }, survivor.firstName);

    const physical = createElement('div', {
      style: `
        font-family: 'Survivant', serif;
        font-size: 10px;
        color: white;
        text-shadow: 1px 1px 2px black;
        text-align: center;
      `
    }, `Physical: ${survivor.physical}`);

    memberCard.appendChild(avatar);
    memberCard.appendChild(name);
    memberCard.appendChild(physical);

    memberCard.addEventListener('click', () => {
      showConfirmationDialog(survivor, popup);
    });

    grid.appendChild(memberCard);
  });

  popup.appendChild(grid);
  document.body.appendChild(popup);
}

function showConfirmationDialog(survivor, parentPopup) {
  const confirmPopup = createElement('div', {
    id: 'confirm-popup',
    style: `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 300px;
      height: 250px;
      background-image: url('Assets/card-back.png');
      background-size: 100% 100%;
      background-position: center;
      background-repeat: no-repeat;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      z-index: 1001;
      padding: 20px;
      box-sizing: border-box;
    `
  });

  const avatar = createElement('img', {
    src: survivor.avatarUrl,
    alt: survivor.name,
    style: `
      width: 80px;
      height: 80px;
      border-radius: 50%;
      object-fit: cover;
      border: 3px solid white;
      margin-bottom: 10px;
    `
  });

  const question = createElement('div', {
    style: `
      font-family: 'Survivant', serif;
      font-size: 16px;
      color: white;
      text-shadow: 2px 2px 4px black;
      text-align: center;
      margin-bottom: 15px;
    `
  }, `Choose ${survivor.firstName}?`);

  const buttonContainer = createElement('div', {
    style: `
      display: flex;
      gap: 10px;
    `
  });

  const confirmButton = createElement('button', {
    className: 'rect-button small',
    style: `
      background-image: url('Assets/rect-button.png');
      background-size: 100% 100%;
      border: none;
      width: 80px;
      height: 35px;
      font-family: 'Survivant', serif;
      font-size: 12px;
      color: white;
      cursor: pointer;
    `
  }, 'Confirm');

  const cancelButton = createElement('button', {
    className: 'rect-button small',
    style: `
      background-image: url('Assets/rect-button.png');
      background-size: 100% 100%;
      border: none;
      width: 80px;
      height: 35px;
      font-family: 'Survivant', serif;
      font-size: 12px;
      color: white;
      cursor: pointer;
    `
  }, 'Cancel');

  confirmButton.addEventListener('click', () => {
    selectedCoBuilder = survivor;
    confirmPopup.remove();
    parentPopup.remove();
    showResourceButtons();
  });

  cancelButton.addEventListener('click', () => {
    confirmPopup.remove();
  });

  buttonContainer.appendChild(confirmButton);
  buttonContainer.appendChild(cancelButton);

  confirmPopup.appendChild(avatar);
  confirmPopup.appendChild(question);
  confirmPopup.appendChild(buttonContainer);

  document.body.appendChild(confirmPopup);
}

function createResourceButtons(container) {
  const resourceContainer = createElement('div', {
    id: 'shelter-resource-buttons',
    style: `
      position: absolute;
      bottom: 180px;
      left: 50%;
      transform: translateX(-50%);
      display: none;
      gap: 20px;
      z-index: 10;
    `
  });

  const bambooButton = createElement('div', {
    style: `
      width: 80px;
      height: 80px;
      background-image: url('Assets/Minigame/bambooButton.png');
      background-size: contain;
      background-position: center;
      background-repeat: no-repeat;
      cursor: pointer;
      border: 3px solid transparent;
      border-radius: 10px;
      transition: border-color 0.3s;
    `
  });

  const palmButton = createElement('div', {
    style: `
      width: 80px;
      height: 80px;
      background-image: url('Assets/Minigame/palmsButton.png');
      background-size: contain;
      background-position: center;
      background-repeat: no-repeat;
      cursor: pointer;
      border: 3px solid transparent;
      border-radius: 10px;
      transition: border-color 0.3s;
    `
  });

  bambooButton.addEventListener('click', () => showResourcePopup('bamboo'));
  palmButton.addEventListener('click', () => showResourcePopup('palm'));

  resourceContainer.appendChild(bambooButton);
  resourceContainer.appendChild(palmButton);
  container.appendChild(resourceContainer);
}

function showResourceButtons() {
  const resourceButtons = document.getElementById('shelter-resource-buttons');
  if (resourceButtons) {
    resourceButtons.style.display = 'flex';
  }
  
  // Reset resource counts
  bambooAdded = 0;
  palmsAdded = 0;
  updateResourceButtonStyles();
}

function updateResourceButtonStyles() {
  const resourceButtons = document.getElementById('shelter-resource-buttons');
  if (!resourceButtons) return;

  const bambooButton = resourceButtons.children[0];
  const palmButton = resourceButtons.children[1];

  // Add blurred gold glow effect when resources are added
  if (bambooAdded >= 1) {
    bambooButton.style.border = '2px solid gold';
    bambooButton.style.boxShadow = '0 0 15px 3px rgba(255, 215, 0, 0.6)';
    bambooButton.style.borderRadius = '10px';
  } else {
    bambooButton.style.border = '2px solid transparent';
    bambooButton.style.boxShadow = 'none';
    bambooButton.style.borderRadius = '10px';
  }
  
  if (palmsAdded >= 1) {
    palmButton.style.border = '2px solid gold';
    palmButton.style.boxShadow = '0 0 15px 3px rgba(255, 215, 0, 0.6)';
    palmButton.style.borderRadius = '10px';
  } else {
    palmButton.style.border = '2px solid transparent';
    palmButton.style.boxShadow = 'none';
    palmButton.style.borderRadius = '10px';
  }

  // Show start building button if both resources are added
  if (bambooAdded >= 1 && palmsAdded >= 1) {
    showStartBuildingButton();
  }
}

function showResourcePopup(resourceType) {
  const player = gameManager.getPlayerSurvivor();
  if (!player) return;

  const resourceProperty = resourceType === 'bamboo' ? 'bamboo' : 'palms';
  const resourceCount = player[resourceProperty] || 0;
  const alreadyAdded = resourceType === 'bamboo' ? bambooAdded : palmsAdded;
  const maxNeeded = 1;

  if (resourceCount <= 0) {
    showInsufficientResourceParchment(resourceType);
    return;
  }

  if (alreadyAdded >= maxNeeded) {
    showParchmentPopup(`You've already added enough ${resourceType === 'bamboo' ? 'bamboo' : 'palm fronds'}.`);
    return;
  }

  let selectedAmount = 0;

  const overlay = createElement('div', {
    id: `${resourceType}-selector-overlay`,
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

  const selector = createElement('div', {
    style: `
      width: 260px;
      height: 280px;
      background-image: url('Assets/card-back.png');
      background-size: 100% 100%;
      background-repeat: no-repeat;
      background-position: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 20px 15px;
      box-sizing: border-box;
    `
  });

  const title = createElement('h3', {
    style: `
      margin: 0 0 15px 0;
      font-size: 18px;
      font-weight: bold;
      color: #fff8e7;
      text-shadow: 2px 2px 4px black;
      font-family: 'Survivant', fantasy;
      text-align: center;
      line-height: 1.2;
    `
  });
  title.innerHTML = `Add ${resourceType === 'bamboo' ? 'bamboo' : 'palm fronds'}<br>to shelter`;

  const availableDisplay = createElement('div', {
    style: `
      margin-bottom: 12px;
      font-size: 14px;
      color: #fff8e7;
      text-shadow: 1px 1px 2px black;
      font-family: 'Survivant', fantasy;
      text-align: center;
    `
  }, `Available: ${resourceCount}`);

  const controls = createElement('div', {
    style: `
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 15px;
      margin: 12px 0;
    `
  });

  const minusBtn = createElement('img', {
    src: 'Assets/Buttons/minus.png',
    alt: 'Decrease',
    style: `
      width: 40px;
      height: 40px;
      cursor: pointer;
      transition: transform 0.2s;
    `
  });

  minusBtn.addEventListener('mouseenter', () => {
    minusBtn.style.transform = 'scale(1.1)';
  });
  minusBtn.addEventListener('mouseleave', () => {
    minusBtn.style.transform = 'scale(1)';
  });

  const amountDisplay = createElement('span', {
    style: `
      font-size: 28px;
      font-weight: bold;
      color: #fff8e7;
      text-shadow: 2px 2px 4px black;
      font-family: 'Survivant', fantasy;
      min-width: 50px;
      text-align: center;
      display: inline-block;
    `
  }, '0');

  const plusBtn = createElement('img', {
    src: 'Assets/Buttons/add.png',
    alt: 'Increase',
    style: `
      width: 40px;
      height: 40px;
      cursor: pointer;
      transition: transform 0.2s;
    `
  });

  plusBtn.addEventListener('mouseenter', () => {
    plusBtn.style.transform = 'scale(1.1)';
  });
  plusBtn.addEventListener('mouseleave', () => {
    plusBtn.style.transform = 'scale(1)';
  });

  const buttonContainer = createElement('div', {
    style: `
      display: flex;
      gap: 10px;
      margin-top: 15px;
      justify-content: center;
    `
  });

  const addButton = createElement('button', {
    className: 'rect-button small',
    style: `
      background-image: url('Assets/rect-button.png');
      background-size: 100% 100%;
      background-repeat: no-repeat;
      background-position: center;
      width: 70px;
      height: 35px;
      border: none;
      color: #fff8e7;
      font-family: 'Survivant', fantasy;
      font-size: 12px;
      font-weight: bold;
      cursor: pointer;
      text-shadow: 1px 1px 2px black;
      box-shadow: none;
    `
  }, 'Add');

  const cancelButton = createElement('button', {
    className: 'rect-button small',
    style: `
      background-image: url('Assets/rect-button.png');
      background-size: 100% 100%;
      background-repeat: no-repeat;
      background-position: center;
      width: 70px;
      height: 35px;
      border: none;
      color: #fff8e7;
      font-family: 'Survivant', fantasy;
      font-size: 12px;
      font-weight: bold;
      cursor: pointer;
      text-shadow: 1px 1px 2px black;
      box-shadow: none;
    `
  }, 'Cancel');

  minusBtn.addEventListener('click', () => {
    if (selectedAmount > 0) {
      selectedAmount--;
      amountDisplay.textContent = selectedAmount;
    }
  });

  plusBtn.addEventListener('click', () => {
    if (selectedAmount < Math.min(resourceCount, maxNeeded)) {
      selectedAmount++;
      amountDisplay.textContent = selectedAmount;
    }
  });

  addButton.addEventListener('click', () => {
    if (selectedAmount > 0) {
      // Show resource deduction effect
      showResourceEffect(resourceType, selectedAmount);
      
      if (resourceType === 'bamboo') {
        bambooAdded = selectedAmount;
        player.bamboo = Math.max(0, player.bamboo - selectedAmount);
      } else {
        palmsAdded = selectedAmount;
        player.palms = Math.max(0, player.palms - selectedAmount);
      }
      overlay.remove();
      updateResourceButtonStyles();
    }
  });

  cancelButton.addEventListener('click', () => {
    overlay.remove();
  });

  controls.appendChild(minusBtn);
  controls.appendChild(amountDisplay);
  controls.appendChild(plusBtn);

  buttonContainer.appendChild(addButton);
  buttonContainer.appendChild(cancelButton);

  selector.appendChild(title);
  selector.appendChild(availableDisplay);
  selector.appendChild(controls);
  selector.appendChild(buttonContainer);
  overlay.appendChild(selector);
  document.body.appendChild(overlay);
}

function showInsufficientResourceParchment(resourceType) {
  const overlay = createElement('div', {
    id: `insufficient-${resourceType}-overlay`,
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
      width: 70vw;
      max-width: 300px;
      background-image: url('Assets/parch-landscape.png');
      background-size: contain;
      background-repeat: no-repeat;
      background-position: center;
      padding: 25px 20px;
      box-sizing: border-box;
    `
  });

  const text = createElement(
    'div',
    {
      style: `
        color: white;
        font-family: 'Survivant', sans-serif;
        font-size: 1rem;
        text-align: center;
        text-shadow: 2px 2px 4px black;
        line-height: 1.3;
      `
    },
    `You don't have any ${resourceType === 'bamboo' ? 'bamboo' : 'palm fronds'} to add!`
  );

  parchment.appendChild(text);
  overlay.appendChild(parchment);
  document.body.appendChild(overlay);

  overlay.addEventListener('click', () => {
    overlay.remove();
  });
}

function showResourceEffect(resourceType, amount) {
  const effect = createElement('div', {
    className: `${resourceType}-hit-effect`,
    style: `
      position: fixed;
      left: 50%;
      top: 50%;
      transform: translate(-50%, -50%);
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 28px;
      font-weight: bold;
      color: #dc2626;
      z-index: 9999;
      pointer-events: none;
    `
  });

  const minus = document.createElement('span');
  minus.textContent = `-${amount}`;

  const icon = document.createElement('img');
  icon.src = `Assets/Resources/${resourceType === 'bamboo' ? 'bamboo' : 'palm'}.png`;
  icon.style.height = '28px';
  icon.style.width = 'auto';

  effect.appendChild(minus);
  effect.appendChild(icon);
  document.body.appendChild(effect);

  setTimeout(() => {
    effect.remove();
  }, 2500);
}

function showStartBuildingButton() {
  const existingButton = document.getElementById('start-building-button');
  if (existingButton) return;

  const button = createElement('button', {
    id: 'start-building-button',
    className: 'rect-button alt',
    style: `
      position: absolute;
      top: 35%;
      left: 50%;
      transform: translate(-50%, -50%);
      background-image: url('Assets/rect-button-1.png');
      background-size: 100% 100%;
      background-repeat: no-repeat;
      background-position: center;
      border: none;
      font-family: 'Survivant', serif;
      font-size: 16px;
      font-weight: bold;
      color: white;
      text-shadow: 3px 3px 6px black;
      cursor: pointer;
      z-index: 100;
      box-shadow: none;
      filter: brightness(1.1);
      padding: 8px;
      line-height: 1.1;
      text-align: center;
    `
  });
  
  button.innerHTML = 'Start<br>Building';

  button.addEventListener('click', startBuilding);
  document.body.appendChild(button);
}

function startBuilding() {
  const player = gameManager.getPlayerSurvivor();
  const playerTribe = gameManager.getPlayerTribe();
  
  if (!player || !selectedCoBuilder || !playerTribe) return;

  // Calculate construction time based on physical values
  const playerPhysical = player.physical || 30;
  const coBuilderPhysical = selectedCoBuilder.physical || 30;
  const averagePhysical = (playerPhysical + coBuilderPhysical) / 2;
  
  // Convert average physical (28-45 range) to time (5-20 minutes)
  // Higher physical = less time
  const minTime = 5;
  const maxTime = 20;
  const minPhysical = 28;
  const maxPhysical = 45;
  
  const constructionTime = Math.round(maxTime - ((averagePhysical - minPhysical) / (maxPhysical - minPhysical)) * (maxTime - minTime));
  
  // Increase shelter value
  const newShelterLevel = (playerTribe.shelter || 0) + 1;
  playerTribe.shelter = newShelterLevel;
  
  // Track shelter building activity
  activityTracker.trackShelterBuilding(
    true, // success
    selectedCoBuilder.firstName,
    newShelterLevel
  );
  
  // Track teamPlayer points gained
  activityTracker.trackTeamPlayerPoints(
    10, // pointsEarned
    0,  // pointsLost
    `Shelter building with ${selectedCoBuilder.firstName}`
  );
  
  // Add teamPlayer points
  player.teamPlayer = (player.teamPlayer || 50) + 10;
  selectedCoBuilder.teamPlayer = (selectedCoBuilder.teamPlayer || 50) + 10;
  
  // Update background
  const newBackgroundImage = `url('Assets/Screens/shelter${playerTribe.shelter}.jpeg')`;
  const container = document.querySelector('.shelter-wrapper').parentElement;
  container.style.backgroundImage = newBackgroundImage;
  
  // Update shelter level indicator
  const newShelterLevel = playerTribe.shelter;
  for (let i = 0; i < 5; i++) {
    const circle = document.getElementById(`shelter-level-${i}`);
    if (circle) {
      if (newShelterLevel > i) {
        circle.style.background = 'linear-gradient(45deg, #22c55e, #16a34a)';
        circle.style.borderColor = '#22c55e';
        circle.style.boxShadow = '0 0 15px rgba(34, 197, 94, 0.8)';
      } else {
        circle.style.background = 'rgba(139, 69, 19, 0.3)';
        circle.style.borderColor = '#2d8100';
        circle.style.boxShadow = 'none';
      }
    }
  }
  
  // Show completion message
  const message = `Based on your and ${selectedCoBuilder.firstName}'s Physical values, construction took ${constructionTime} minutes.`;
  
  // Deduct time from clock (convert minutes to seconds)
  const timeInSeconds = constructionTime * 60;
  gameManager.deductTime(timeInSeconds);
  
  // Update clock display and flash red
  const clockElement = document.getElementById('clock-time-text');
  const dayElement = document.getElementById('clock-day-text');
  if (clockElement && dayElement) {
    const min = Math.floor(gameManager.dayTimer / 60);
    const sec = gameManager.dayTimer % 60;
    clockElement.textContent = `${min}:${sec.toString().padStart(2, '0')}`;
    dayElement.textContent = `Day ${gameManager.day}`;
  }
  
  // Flash red effect on the correct clock element
  if (clockElement) {
    clockElement.style.color = 'red';
    setTimeout(() => {
      clockElement.style.color = '#2b190a';
    }, 500);
  }
  
  // Show teamPlayer animation
  showTeamPlayerAnimation();
  
  // Clean up
  const startButton = document.getElementById('start-building-button');
  if (startButton) startButton.remove();
  
  const resourceButtons = document.getElementById('shelter-resource-buttons');
  if (resourceButtons) resourceButtons.style.display = 'none';
  
  selectedCoBuilder = null;
  bambooAdded = 0;
  palmsAdded = 0;
  
  showParchmentPopup(message);
}

function showTeamPlayerAnimation() {
  const animationElement = createElement('div', {
    style: `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      display: flex;
      align-items: center;
      gap: 10px;
      z-index: 1010;
      animation: fadeInOut 3s forwards;
      pointer-events: none;
    `
  });

  const teamPlayerIcon = createElement('img', {
    src: 'Assets/Resources/teamPlayer.png',
    alt: 'Team Player',
    style: `
      width: 40px;
      height: 40px;
    `
  });

  const text = createElement('div', {
    style: `
      font-family: 'Survivant', serif;
      font-size: 24px;
      color: white;
      text-shadow: 2px 2px 4px black;
      font-weight: bold;
    `
  }, '+10');

  animationElement.appendChild(teamPlayerIcon);
  animationElement.appendChild(text);

  // Add CSS animation
  const style = createElement('style');
  style.textContent = `
    @keyframes fadeInOut {
      0% { opacity: 0; transform: translate(-50%, -50%) translateY(20px); }
      30% { opacity: 1; transform: translate(-50%, -50%) translateY(0px); }
      70% { opacity: 1; transform: translate(-50%, -50%) translateY(0px); }
      100% { opacity: 0; transform: translate(-50%, -50%) translateY(-20px); }
    }
  `;
  document.head.appendChild(style);

  document.body.appendChild(animationElement);

  setTimeout(() => {
    animationElement.remove();
    style.remove();
  }, 3000);
}
