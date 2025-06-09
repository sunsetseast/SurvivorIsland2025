/**
 * @module FireView
 * Build and tend to the fire, integrated Spiral Fire Challenge minigame.
 * Updated to:
 *  - Deduct 10 firewood at the start of the minigame (with animation).
 *  - If player lacks 10 firewood, show a parchment message (no minigame start).
 *  - Deduct 5 minutes (300 seconds) at the end of the minigame, whether success or fail.
 *  - On failure, show a parchment overlay (no button); tapping anywhere closes and resets.
 *  - On success, show the parchment overlay (no button) then award teamPlayer and switch to “Tend Fire”.
 */

import { createElement, clearChildren, addDebugBanner } from '../utils/index.js';
import { gameManager } from '../core/index.js';
import { updateCampClockUI } from '../utils/ClockUtils.js';

export default function renderFireView(container) {
  // --- Persistent state: has the fire been built already? ---
  const player = gameManager.getPlayerSurvivor();
  const playerTribe = gameManager.getPlayerTribe();
  const fireBuilt = playerTribe && playerTribe.fire >= 1;

  // --- Clear existing content and set FireView background based on fire level ---
  clearChildren(container);

  // Get current fire level from tribe
  const currentFireLevel = playerTribe ? playerTribe.fire : 0;

  // Set background image based on fire level
  let backgroundImage;
  if (currentFireLevel >= 3) {
    backgroundImage = "url('Assets/Minigame/fire3.png')";
  } else if (currentFireLevel >= 2) {
    backgroundImage = "url('Assets/Minigame/fire2.png')";
  } else if (currentFireLevel >= 1) {
    backgroundImage = "url('Assets/Minigame/fire1.png')";
  } else {
    backgroundImage = "url('Assets/Minigame/fire0.png')";
  }

  container.style.backgroundImage = backgroundImage;
  container.style.backgroundSize = 'cover';
  container.style.backgroundPosition = 'center';
  container.style.backgroundRepeat = 'no-repeat';
  container.style.position = 'relative';

  // --- POT IMAGE (always visible and clickable) ---
  const potImg = createElement('img', {
    src: 'Assets/Resources/pot.png',
    alt: 'Pot',
    style: `
      position: absolute;
      bottom: 80px;
      right: 20px;
      width: 27%;
      height: auto;
      z-index: 10;
      cursor: pointer;
    `
  });
  container.appendChild(potImg);

  // Add click handler for pot
  potImg.addEventListener('click', () => {
    handlePotClick();
  });

  // --- FIRE LEVEL INDICATOR (3 circles on left side) ---
  const fireLevelContainer = createElement('div', {
    id: 'fire-level-indicator',
    style: `
      position: absolute;
      left: 5px;
      top: 50%;
      transform: translateY(-50%);
      display: flex;
      flex-direction: column;
      gap: 15px;
      z-index: 10;
    `
  });

  // Create 3 circles for fire levels (bottom to top: level 1, 2, 3)
  for (let i = 2; i >= 0; i--) { // Reverse order so bottom circle is index 0
    const circle = createElement('div', {
      id: `fire-level-${i}`,
      style: `
        width: 30px;
        height: 30px;
        border-radius: 50%;
        border: 3px solid #8B4513;
        background: rgba(139, 69, 19, 0.3);
        transition: all 0.4s ease;
      `
    });

    // Light up circles based on current fire level
    if (currentFireLevel > i) {
      circle.style.background = 'linear-gradient(45deg, #ff6b00, #ffd700)';
      circle.style.borderColor = '#ffd700';
      circle.style.boxShadow = '0 0 15px rgba(255, 140, 0, 0.8)';
    }

    fireLevelContainer.appendChild(circle);
  }

  container.appendChild(fireLevelContainer);

  // --- Helper: createIconButton (usable throughout this module) ---
  function createIconButton(
    src,
    alt,
    onClick,
    label = '',
    width = 110,
    height = 65,
    fontSize = '1.3rem',
    textOffset = -1
  ) {
    const wrapper = createElement('div', {
      style: `
        width: ${width}px;
        height: ${height}px;
        display: inline-block;
        position: relative;
        cursor: pointer;
        overflow: hidden;
      `
    });

    const image = createElement('img', {
      src,
      alt,
      style: `
        width: 100%;
        height: 100%;
        object-fit: contain;
        pointer-events: none;
      `
    });
    wrapper.appendChild(image);

    if (label) {
      const textOverlay = createElement(
        'div',
        {
          style: `
            position: absolute;
            top: calc(50% + ${textOffset}px);
            left: 0;
            width: 100%;
            text-align: center;
            color: white;
            font-size: ${fontSize};
            font-family: 'Survivant', sans-serif;
            text-shadow: 1px 1px 2px black;
            transform: translateY(-50%);
            line-height: 1;
            pointer-events: none;
          `
        },
        label
      );
      wrapper.appendChild(textOverlay);
    }

    wrapper.addEventListener('click', onClick);
    return wrapper;
  }

  // --- ACTION BAR BUTTONS SETUP ---
  const actionButtons = document.getElementById('action-buttons');
  if (actionButtons) {
    clearChildren(actionButtons);
    actionButtons.style.justifyContent = 'center';
    actionButtons.style.gap = '20px';
    actionButtons.style.padding = '0';

    // If fire not built → "Make Fire"; else → "Tend Fire"
    if (!fireBuilt) {
      const makeFireButton = createIconButton(
        'Assets/Buttons/blank.png',
        'Make Fire',
        () => handleMakeFireTap(),
        'Make Fire'
      );
      actionButtons.appendChild(makeFireButton);
    } else {
      const tendFireButton = createIconButton(
        'Assets/Buttons/blank.png',
        'Tend Fire',
        () => handleTendFireTap(),
        'Tend Fire'
      );
      actionButtons.appendChild(tendFireButton);
    }

    // "Down" arrow to return to previous camp view
    const downButton = createIconButton(
      'Assets/Buttons/down.png',
      'Down',
      () => {
        if (cookingState.activeItems.length > 0) {
          showCookingUnattendedParchment();
          return;
        }
        if (window.previousCampView) {
          window.campScreen.loadView(window.previousCampView);
        } else {
          window.campScreen.loadView('campfire');
        }
      },
      ''
    );
    actionButtons.appendChild(downButton);
  }

  addDebugBanner('Fire view rendered!', 'orange', 170);

  // --- COOKING SYSTEM STATE (persistent across view changes) ---
  if (!window.globalCookingState) {
    window.globalCookingState = {
      isOpen: false,
      activeItems: [], // { type: 'fish'|'coconut', quantity: 1, startTime: Date.now(), duration: 600000 }
      timers: []
    };
  }
  const cookingState = window.globalCookingState;



  // --- COOKING SYSTEM FUNCTIONS ---
  function handlePotClick() {
    const playerTribe = gameManager.getPlayerTribe();
    const currentFireLevel = playerTribe && typeof playerTribe.fire === 'number' ? playerTribe.fire : 0;

    if (currentFireLevel < 2) {
        showWeakFireParchment();
        return;
    }
    
    showCookingInterface();
  }

  function showWeakFireParchment() {
    const overlay = createElement('div', {
      id: 'weak-fire-overlay',
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

    const text = createElement(
      'div',
      {
        style: `
          color: white;
          font-family: 'Survivant', sans-serif;
          font-size: 1.2rem;
          text-align: center;
          text-shadow: 2px 2px 4px black;
          line-height: 1.4;
        `
      },
      `You don't have a strong enough fire to cook anything.`
    );

    parchment.appendChild(text);
    overlay.appendChild(parchment);
    document.body.appendChild(overlay);

    overlay.addEventListener('click', () => {
      overlay.remove();
    });
  }

  function showCookingInterface() {
    if (cookingState.isOpen) return;

    // Double-check fire level before showing interface
    const playerTribe = gameManager.getPlayerTribe();
    const currentFireLevel = playerTribe && typeof playerTribe.fire === 'number' ? playerTribe.fire : 0;

    if (currentFireLevel < 2) {
      showWeakFireParchment();
      return;
    }

    // Set cooking background now that fire check passed
    container.style.backgroundImage = "url('Assets/Screens/fire-pot.png')";

    cookingState.isOpen = true;

    // Show large pot overlay instead of changing small pot image
    const potOverlay = createElement('div', {
      id: 'pot-overlay',
      style: `
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background-color: rgba(0, 0, 0, 0.8);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1500;
      `
    });

    const potContainer = createElement('div', {
      style: `
        position: relative;
        width: 80vw;
        max-width: 400px;
        height: 80vh;
        max-height: 600px;
      `
    });

    const largePotImage = createElement('img', {
      src: 'Assets/Minigame/pot-open.png',
      style: `
        width: 100%;
        height: 100%;
        object-fit: contain;
      `
    });

    potContainer.appendChild(largePotImage);
    potOverlay.appendChild(potContainer);
    document.body.appendChild(potOverlay);

    // Show instructions if first time opening
    if (cookingState.activeItems.length === 0) {
      showCookingInstructions(() => {
        showCookingButtons();
        updateCookingDisplay();
      });
    } else {
      showCookingButtons();
      updateCookingDisplay();
    }
  }

  function showCookingInstructions(callback) {
    const overlay = createElement('div', {
      id: 'cooking-instructions-overlay',
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

    const text = createElement(
      'div',
      {
        style: `
          color: white;
          font-family: 'Survivant', sans-serif;
          font-size: 1.2rem;
          text-align: center;
          text-shadow: 2px 2px 4px black;
          line-height: 1.4;
        `
      },
      `Add ingredients to the pot to cook. Different items take longer than others to cook. Keep an eye on the pot to prevent food from burning.`
    );

    parchment.appendChild(text);
    overlay.appendChild(parchment);
    document.body.appendChild(overlay);

    overlay.addEventListener('click', () => {
      overlay.remove();
      if (callback) callback();
    });
  }

  function showCookingButtons() {
    // Remove existing buttons
    const existingButtons = document.getElementById('cooking-buttons-container');
    if (existingButtons) {
      existingButtons.remove();
    }

    // Create cooking buttons container inside pot overlay
    const potOverlay = document.getElementById('pot-overlay');
    if (!potOverlay) return;

    const cookingButtonsContainer = createElement('div', {
      id: 'cooking-buttons-container',
      style: `
        position: absolute;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        display: flex;
        gap: 20px;
        z-index: 1600;
      `
    });

    // Fish button
    const fishButton = createElement('img', {
      src: 'Assets/Minigame/fishButton.png',
      alt: 'Cook Fish',
      style: `
        height: 60px;
        width: auto;
        cursor: pointer;
      `
    });
    fishButton.addEventListener('click', () => showIngredientSelector('fish'));

    // Coconut button
    const coconutButton = createElement('img', {
      src: 'Assets/Minigame/coconutButton.png',
      alt: 'Cook Coconut',
      style: `
        height: 60px;
        width: auto;
        cursor: pointer;
      `
    });
    coconutButton.addEventListener('click', () => showIngredientSelector('coconut'));

    // Close button
    const closeButton = createElement('img', {
      src: 'Assets/Buttons/x-button.png',
      alt: 'Close',
      style: `
        position: absolute;
        top: -40px;
        right: -5px;
        width: 20px;
        height: 20px;
        cursor: pointer;
        z-index: 1700;
      `
    });
    closeButton.addEventListener('click', closeCookingInterface);

    cookingButtonsContainer.appendChild(fishButton);
    cookingButtonsContainer.appendChild(coconutButton);
    cookingButtonsContainer.appendChild(closeButton);
    potOverlay.appendChild(cookingButtonsContainer);
  }

  function showIngredientSelector(type) {
    const player = gameManager.getPlayerSurvivor();
    const availableAmount = type === 'fish' ? (player.fish || 0) : (player.coconuts || 0);

    if (availableAmount === 0) {
      alert(`You don't have any ${type} to cook!`);
      return;
    }

    let selectedAmount = 0;

    const overlay = createElement('div', {
      id: 'ingredient-selector-overlay',
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
    }, `Add ${type}<br>to pot`);

    const availableDisplay = createElement('div', {
      style: `
        margin-bottom: 12px;
        font-size: 14px;
        color: #fff8e7;
        text-shadow: 1px 1px 2px black;
        font-family: 'Survivant', fantasy;
        text-align: center;
      `
    }, `Available: ${availableAmount}`);

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
      if (selectedAmount < availableAmount) {
        selectedAmount++;
        amountDisplay.textContent = selectedAmount;
      }
    });

    addButton.addEventListener('click', () => {
      if (selectedAmount > 0) {
        addToPot(type, selectedAmount);
        overlay.remove();
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

  function addToPot(type, quantity) {
    const player = gameManager.getPlayerSurvivor();

    // Check if we can cook both items (max 2 types)
    const uniqueTypes = [...new Set(cookingState.activeItems.map(item => item.type))];
    if (uniqueTypes.length >= 2 && !uniqueTypes.includes(type)) {
      alert('You can only cook 2 different types of items at once!');
      return;
    }

    // Deduct from player inventory
    if (type === 'fish') {
      player.fish = (player.fish || 0) - quantity;
    } else {
      player.coconuts = (player.coconuts || 0) - quantity;
    }

    // Add to cooking state
    const cookingItem = {
      type: type,
      quantity: quantity,
      startTime: gameManager.getDayTimer(), // Use game time instead of real time
      duration: type === 'fish' ? 600 : 480, // 10 minutes for fish, 8 minutes for coconut (in game seconds)
      state: 'cooking' // 'cooking', 'cooked', 'burned'
    };

    cookingState.activeItems.push(cookingItem);

    // Update background to fire-pot
    container.style.backgroundImage = "url('Assets/Screens/fire-pot.png')";

    updateCookingDisplay();
    startCookingTimer(cookingItem);
  }

  function updateCookingDisplay() {
    // Remove existing cooking display
    const existingDisplay = document.getElementById('cooking-items-display');
    if (existingDisplay) {
      existingDisplay.remove();
    }

    if (cookingState.activeItems.length === 0) return;

    // Find the pot overlay or use the main container
    const potOverlay = document.getElementById('pot-overlay');
    const displayParent = potOverlay || container;

    // Make sure we have a valid parent element
    if (!displayParent) return;

    const display = createElement('div', {
      id: 'cooking-items-display',
      style: `
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 20px;
        z-index: ${potOverlay ? '1600' : '12'};
        pointer-events: none;
        max-width: 200px;
      `
    });

    cookingState.activeItems.forEach((item, index) => {
      const itemContainer = createElement('div', {
        style: `
          position: relative;
          width: 60px;
          height: 60px;
          display: flex;
          align-items: center;
          justify-content: center;
        `
      });

      // Item image
      let imageSrc = '';
      if (item.type === 'fish') {
        if (item.state === 'burned') {
          imageSrc = 'Assets/Resources/ash.png';
        } else if (item.state === 'cooked') {
          imageSrc = 'Assets/Resources/fishCooked3.png';
        } else {
          imageSrc = 'Assets/Resources/fish3.png';
        }
      } else {
        if (item.state === 'burned') {
          imageSrc = 'Assets/Resources/ash.png';
        } else if (item.state === 'cooked') {
          imageSrc = 'Assets/Resources/coconutCooked.png';
        } else {
          imageSrc = 'Assets/Resources/coconut.png';
        }
      }

      const itemImg = createElement('img', {
        src: imageSrc,
        style: `
          width: 100%;
          height: 100%;
          object-fit: contain;
        `
      });

      // Quantity indicator (only show if > 1)
      if (item.quantity > 1) {
        const quantityLabel = createElement('div', {
          style: `
            position: absolute;
            top: -5px;
            right: -5px;
            background: rgba(0, 0, 0, 0.8);
            color: white;
            border-radius: 50%;
            width: 20px;
            height: 20px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 12px;
            font-weight: bold;
            border: 1px solid white;
          `
        }, `x${item.quantity}`);
        itemContainer.appendChild(quantityLabel);
      }

      // Cooking progress bar
      const progressBar = createElement('div', {
        style: `
          position: absolute;
          bottom: -10px;
          left: 0;
          width: 100%;
          height: 6px;
          background: rgba(0, 0, 0, 0.5);
          border-radius: 3px;
          border: 1px solid rgba(255, 255, 255, 0.3);
        `
      });

      const progressFill = createElement('div', {
        id: `progress-fill-${index}`,
        style: `
          height: 100%;
          border-radius: 2px;
          transition: all 0.5s ease;
          background: linear-gradient(to right, #ffff99, #ff6600, #000000);
          width: 0%;
        `
      });

      progressBar.appendChild(progressFill);
      itemContainer.appendChild(itemImg);
      itemContainer.appendChild(progressBar);
      display.appendChild(itemContainer);
    });

    displayParent.appendChild(display);
  }

  function startCookingTimer(cookingItem) {
    const timer = setInterval(() => {
      const currentGameTime = gameManager.getDayTimer();
      const elapsed = cookingItem.startTime - currentGameTime; // Game time counts down
      const progress = Math.min(elapsed / cookingItem.duration, 1);

      // Update progress bar
      const index = cookingState.activeItems.indexOf(cookingItem);
      const progressFill = document.getElementById(`progress-fill-${index}`);
      if (progressFill) {
        progressFill.style.width = `${progress * 100}%`;
      }

      // Check cooking stages
      if (progress >= 0.9 && cookingItem.state === 'cooking') {
        // 90% done - item is cooked
        cookingItem.state = 'cooked';
        updateCookingDisplay();
      } else if (progress >= 1) {
        // 100% done - item is burned
        cookingItem.state = 'burned';
        updateCookingDisplay();
        clearInterval(timer);

        // Remove timer from array
        const timerIndex = cookingState.timers.indexOf(timer);
        if (timerIndex > -1) {
          cookingState.timers.splice(timerIndex, 1);
        }

        // Remove from active items after a delay
        setTimeout(() => {
          const itemIndex = cookingState.activeItems.indexOf(cookingItem);
          if (itemIndex > -1) {
            cookingState.activeItems.splice(itemIndex, 1);
            updateCookingDisplay();

            // Reset background if no more items cooking
            if (cookingState.activeItems.length === 0) {
              const playerTribe = gameManager.getPlayerTribe();
              const currentFireLevel = playerTribe ? playerTribe.fire : 0;
              if (currentFireLevel >= 3) {
                container.style.backgroundImage = "url('Assets/Minigame/fire3.png')";
              } else if (currentFireLevel >= 2) {
                container.style.backgroundImage = "url('Assets/Minigame/fire2.png')";
              } else if (currentFireLevel >= 1) {
                container.style.backgroundImage = "url('Assets/Minigame/fire1.png')";
              } else {
                container.style.backgroundImage = "url('Assets/Minigame/fire0.png')";
              }
            }
          }
        }, 5000);
      }
    }, 1000);

    cookingState.timers.push(timer);
  }

  // Only resume cooking if we have both adequate fire and active items
  const resumePlayerTribe = gameManager.getPlayerTribe();
  const resumeFireLevel = resumePlayerTribe && typeof resumePlayerTribe.fire === 'number' ? resumePlayerTribe.fire : 0;
  
  if (resumeFireLevel >= 2 && cookingState.activeItems.length > 0) {
    // Clean up any existing timers first
    cookingState.timers.forEach(timer => {
      if (timer) clearInterval(timer);
    });
    cookingState.timers = [];

    // Resume existing timers when returning to view
    cookingState.activeItems.forEach((item, index) => {
      startCookingTimer(item);
    });

    // Update display for existing items
    updateCookingDisplay();
  }

  function closeCookingInterface() {
    cookingState.isOpen = false;

    const potOverlay = document.getElementById('pot-overlay');
    if (potOverlay) {
      potOverlay.remove();
    }

    // Don't clear timers or items - they should persist
  }

  // --- Helper function for showing firewood deduction effect ---
  function showFirewoodEffect(amount) {
    const effect = createElement('div', {
      className: 'firewood-hit-effect',
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
    icon.src = 'Assets/Resources/firewood.png';
    icon.style.height = '28px';
    icon.style.width = 'auto';

    effect.appendChild(minus);
    effect.appendChild(icon);
    document.body.appendChild(effect);

    setTimeout(() => {
      effect.remove();
    }, 2500);
  }

  // --- 1) Handle Make Fire tap: check firewood first ---
  function handleMakeFireTap() {
    const firewoodCount = player.firewood || 0;
    if (firewoodCount < 10) {
      showInsufficientFirewoodParchment(10);
    } else {
      // Deduct 10 firewood and show effect
      player.firewood = firewoodCount - 10;
      showFirewoodEffect(10);
      // Then show instructions to start minigame
      showFireInstructions(false); // false = normal speed
    }
  }

  // --- 1b) Handle Tend Fire tap: check firewood first ---
  function handleTendFireTap() {
    const firewoodCount = player.firewood || 0;
    const currentFireLevel = playerTribe ? playerTribe.fire : 0;

    // Determine cost based on current fire level
    let requiredFirewood;
    if (currentFireLevel === 1) {
      requiredFirewood = 20; // Fire 1 → Fire 2
    } else if (currentFireLevel === 2) {
      requiredFirewood = 30; // Fire 2 → Fire 3 (max)
    } else {
      requiredFirewood = 20; // Default fallback
    }

    if (firewoodCount < requiredFirewood) {
      showInsufficientFirewoodParchment(requiredFirewood);
    } else {
      // Deduct required firewood and show effect
      player.firewood = firewoodCount - requiredFirewood;
      showFirewoodEffect(requiredFirewood);
      // Then show instructions to start minigame at faster speed
      showTendFireInstructions(requiredFirewood);
    }
  }

  // --- 2) Parchment for insufficient firewood ---
  function showInsufficientFirewoodParchment(requiredAmount = 10) {
    const overlay = createElement('div', {
      id: 'insufficient-firewood-overlay',
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
        background-size: contain;        background-repeat: no-repeat;
        background-position: center;
        padding: 30px;
        box-sizing: border-box;
      `
    });

    const text = createElement(
      'div',
      {
        style: `
          color: white;
          font-family: 'Survivant', sans-serif;
          font-size: 1.2rem;
          text-align: center;
          text-shadow: 2px 2px 4px black;
          line-height: 1.4;
        `
      },
      `You need ${requiredAmount} firewood to ${requiredAmount === 10 ? 'make' : 'tend'} a fire.\nHead into the jungle and gather some more.`
    );

    parchment.appendChild(text);
    overlay.appendChild(parchment);
    document.body.appendChild(overlay);

    overlay.addEventListener('click', () => {
      overlay.remove();
      // No further action—stay on FireView
    });
  }

  // --- 3) Show the parchment instructions before the minigame starts ---
  function showFireInstructions(isFastMode = false) {
    const overlay = createElement('div', {
      id: 'fire-instructions-overlay',
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

    const text = createElement(
      'div',
      {
        style: `
          color: white;
          font-family: 'Survivant', sans-serif;
          font-size: 1.2rem;
          text-align: center;
          text-shadow: 2px 2px 4px black;
          line-height: 1.4;
        `
      },
      `Make Fire:\nTap when the ember is glowing on top of each ring in order until all 5 rings are lit.\n\n(Costs 5 minutes and 10 firewood.)`
    );

    parchment.appendChild(text);
    overlay.appendChild(parchment);
    document.body.appendChild(overlay);

    overlay.addEventListener('click', () => {
      overlay.remove();
      initFireGame(isFastMode);
    });
  }

  // --- 3b) Show the parchment instructions for tending fire ---
  function showTendFireInstructions(firewoodCost = 20) {
    const overlay = createElement('div', {
      id: 'tend-fire-instructions-overlay',
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

    const text = createElement(
      'div',
      {
        style: `
          color: white;
          font-family: 'Survivant', sans-serif;
          font-size: 1.2rem;
          text-align: center;
          text-shadow: 2px 2px 4px black;
          line-height: 1.4;
        `
      },
      `Tend Fire:\nTap when the ember is glowing on top of each ring in order until all 5 rings are lit.\n\n(Faster pace! Costs 5 minutes and ${firewoodCost} firewood.)`
    );

    parchment.appendChild(text);
    overlay.appendChild(parchment);
    document.body.appendChild(overlay);

    overlay.addEventListener('click', () => {
      overlay.remove();
      initFireGame(true); // true = fast mode
    });
  }

  // --- 4) Initialize and run the Spiral Fire Challenge minigame ---
  function initFireGame(isFastMode = false) {
    // Do NOT deduct time or firewood here—instead do it at end of minigame.

    // Hide fire level indicator during minigame
    const fireLevelIndicator = document.getElementById('fire-level-indicator');
    if (fireLevelIndicator) {
      fireLevelIndicator.style.display = 'none';
    }

    // Container for the minigame UI (rings, canvas, etc.)
    const gameUI = createElement('div', {
      id: 'fire-game-ui',
      style: `
        position: absolute;
        top: 60px;
        left: 50%;
        transform: translateX(-50%);
        width: 90vw;
        max-width: 360px;
        height: 75vh;
        max-height: 480px;
        z-index: 500;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: flex-start;
        pointer-events: auto;
      `
    });
    container.appendChild(gameUI);

    // --- 4a) Progress Rings (5 circles in a row) ---
    const ringsWrapper = createElement('div', {
      id: 'progress-rings-container',
      style: `
        margin-top: 35px;
        display: flex;
        justify-content: center;
        gap: 8px;
        z-index: 510;
      `
    });
    gameUI.appendChild(ringsWrapper);

    for (let i = 0; i < 5; i++) {
      const ring = createElement('div', {
        id: `ring${i}`,
        style: `
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: rgba(139, 69, 19, 0.3);
          border: 3px solid #8B4513;
          transition: all 0.4s ease;
          position: relative;
        `
      });
      ringsWrapper.appendChild(ring);
    }

    // --- 4b) Canvas for drawing the spiral, ember, and particles ---
    const canvas = createElement('canvas', {
      id: 'fireCanvas',
      width: 320,
      height: 380,
      style: `
        margin-top: 10px;
        background-color: transparent;
        touch-action: manipulation;
        z-index: 505;
      `
    });
    gameUI.appendChild(canvas);
    const ctx = canvas.getContext('2d');

    // --- 4c) Failure overlay (parchment, no button; click to reset) ---
    const failureOverlay = createElement('div', {
      id: 'fireFailureOverlay',
      style: `
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background-color: rgba(0, 0, 0, 0.7);
        display: none;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
        z-index: 2000;
        cursor: pointer;
      `
    });
    const failureParchment = createElement('div', {
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
    const failureText = createElement(
      'div',
      {
        style: `
          color: white;
          font-family: 'Survivant', sans-serif;
          font-size: 1.2rem;
          text-align: center;
          text-shadow: 2px 2px 4px black;
          line-height: 1.4;
        `
      },
      `You failed to make fire.\nKeep trying!`
    );
    failureParchment.appendChild(failureText);
    failureOverlay.appendChild(failureParchment);
    document.body.appendChild(failureOverlay);
    failureOverlay.addEventListener('click', () => {
      failureOverlay.style.display = 'none';
      restartGame();
    });

    // --- 4d) Victory overlay (parchment, no button; click to finalize) ---
    const victoryOverlay = createElement('div', {
      id: 'fireVictoryOverlay',
      style: `
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background-color: rgba(0, 0, 0, 0.7);
        display: none;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
        z-index: 2000;
        cursor: pointer;
      `
    });
    const victoryParchment = createElement('div', {
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
    const victoryText = createElement(
      'div',
      {
        style: `
          color: white;
          font-family: 'Survivant', sans-serif;
          font-size: 1.2rem;
          text-align: center;
          text-shadow: 2px 2px 4px black;
          line-height: 1.4;
        `
      },
      `🔥 All Rings Ablaze! 🌀\n\nCongratulations! You made a fire! Keep tending to make it stronger.`
    );
    victoryParchment.appendChild(victoryText);
    victoryOverlay.appendChild(victoryParchment);
    document.body.appendChild(victoryOverlay);
    victoryOverlay.addEventListener('click', () => {
      victoryOverlay.style.display = 'none';
      finalizeFireBuild();
    });

    // --- 5) Game State and Constants ---
    let gameState = {
      ember: {
        angle: 0,
        radius: 140,
        speed: isFastMode ? 0.035 : 0.02, // Faster speed for tend fire
        brightness: 0.5,
        x: 0,
        y: 0
      },
      currentRing: 0,
      ringsLit: [false, false, false, false, false],
      gameRunning: true,
      lastTapTime: 0,
      particles: [],
      waves: [],
      spiralRings: [
        { radius: 140, width: 25, lit: false },
        { radius: 110, width: 25, lit: false },
        { radius: 80, width: 25, lit: false },
        { radius: 50, width: 25, lit: false },
        { radius: 20, width: 20, lit: false }
      ]
    };

    const CENTER_X = canvas.width / 2;
    const CENTER_Y = canvas.height / 2 + 20;
    const EMBER_SIZE = 12;

    for (let i = 0; i < 3; i++) {
      gameState.waves.push({
        offset: i * Math.PI / 1.5,
        amplitude: 8 + Math.random() * 4,
        frequency: 0.01 + Math.random() * 0.005
      });
    }

    function createParticle(x, y, type = 'spark') {
      return {
        x: x,
        y: y,
        vx: (Math.random() - 0.5) * 8,
        vy: -Math.random() * 6 - 3,
        life: 1.0,
        decay: 0.02 + Math.random() * 0.02,
        size: Math.random() * 5 + 2,
        type: type,
        color:
          type === 'spark'
            ? `hsl(${20 + Math.random() * 40}, 100%, ${60 + Math.random() * 30}%)`
            : type === 'sand'
            ? '#F4A460'
            : '#87CEEB'
      };
    }

    function updateParticles() {
      for (let i = gameState.particles.length - 1; i >= 0; i--) {
        const p = gameState.particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life -= p.decay;
        p.vy += 0.1;

        if (p.life <= 0 || p.y > canvas.height) {
          gameState.particles.splice(i, 1);
        }
      }
    }

    function drawParticles() {
      gameState.particles.forEach(p => {
        ctx.save();
        ctx.globalAlpha = p.life;
        ctx.fillStyle = p.color;
        if (p.type === 'spark') {
          ctx.shadowColor = p.color;
          ctx.shadowBlur = 8;
        }
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });
    }

    function updateEmberPosition() {
      gameState.ember.angle += gameState.ember.speed;
      const spiralProgress =
        (gameState.ember.angle % (Math.PI * 10)) / (Math.PI * 10);
      gameState.ember.radius = 140 - spiralProgress * 120;
      gameState.ember.x =
        CENTER_X + Math.cos(gameState.ember.angle) * gameState.ember.radius;
      gameState.ember.y =
        CENTER_Y + Math.sin(gameState.ember.angle) * gameState.ember.radius;

      if (gameState.ember.radius < 15) {
        gameState.ember.angle = 0;
        gameState.ember.radius = 140;
      }
    }

    function getCurrentRing() {
      const currentRadius = gameState.ember.radius;
      for (let i = 0; i < gameState.spiralRings.length; i++) {
        const ring = gameState.spiralRings[i];
        if (
          currentRadius <= ring.radius + ring.width / 2 &&
          currentRadius >= ring.radius - ring.width / 2
        ) {
          return i;
        }
      }
      return -1;
    }

    function updateGame() {
      if (!gameState.gameRunning) return;
      updateEmberPosition();
      const newCurrentRing = getCurrentRing();
      if (newCurrentRing !== gameState.currentRing && newCurrentRing !== -1) {
        gameState.currentRing = newCurrentRing;
        updateRingDisplay();
      }

      gameState.ember.brightness =
        0.4 + 0.4 * Math.sin(Date.now() * 0.01);

      if (
        gameState.currentRing !== -1 &&
        !gameState.ringsLit[gameState.currentRing]
      ) {
        gameState.ember.brightness = Math.min(
          1,
          gameState.ember.brightness + 0.3
        );
      }

      updateParticles();
      drawGame();
      requestAnimationFrame(updateGame);
    }

    function drawGame() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      gameState.spiralRings.forEach((ring, index) => {
        ctx.save();
        if (index === gameState.currentRing && !gameState.ringsLit[index]) {
          ctx.strokeStyle = '#ff8c00';
          ctx.lineWidth = 6;
          ctx.shadowColor = '#ff8c00';
          ctx.shadowBlur = 15;
        } else if (gameState.ringsLit[index]) {
          ctx.strokeStyle = '#ffd700';
          ctx.lineWidth = 8;
          ctx.shadowColor = '#ffd700';
          ctx.shadowBlur = 20;
        } else {
          ctx.strokeStyle = '#8B4513';
          ctx.lineWidth = 4;
          ctx.shadowBlur = 0;
        }
        ctx.beginPath();
        ctx.arc(CENTER_X, CENTER_Y, ring.radius, 0, Math.PI * 2);
        ctx.stroke();

        if (gameState.ringsLit[index]) {
          ctx.strokeStyle = '#ffff88';
          ctx.lineWidth = 3;
          ctx.shadowBlur = 10;
          ctx.stroke();
        }
        ctx.restore();
      });

      ctx.save();
      ctx.strokeStyle = 'rgba(139, 69, 19, 0.3)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let angle = 0; angle < Math.PI * 10; angle += 0.1) {
        const progress = angle / (Math.PI * 10);
        const radius = 140 - progress * 120;
        const x = CENTER_X + Math.cos(angle) * radius;
        const y = CENTER_Y + Math.sin(angle) * radius;
        if (angle === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
      ctx.restore();

      const emberGlow = gameState.ember.brightness;
      ctx.save();
      ctx.shadowColor = `rgba(255, ${
        80 + 100 * emberGlow
      }, 0, ${emberGlow})`;
      ctx.shadowBlur = 25 * emberGlow;

      ctx.fillStyle = `rgba(255, ${
        80 + 120 * emberGlow
      }, ${30 * emberGlow}, ${0.7 + 0.3 * emberGlow})`;
      ctx.beginPath();
      ctx.arc(
        gameState.ember.x,
        gameState.ember.y,
        EMBER_SIZE * (1 + 0.6 * emberGlow),
        0,
        Math.PI * 2
      );
      ctx.fill();

      ctx.shadowBlur = 10;
      ctx.fillStyle = `rgba(255, ${
        150 + 100 * emberGlow
      }, ${80 * emberGlow}, 1)`;
      ctx.beginPath();
      ctx.arc(
        gameState.ember.x,
        gameState.ember.y,
        EMBER_SIZE * 0.6,
        0,
        Math.PI * 2
      );
      ctx.fill();
      ctx.restore();

      drawParticles();
    }

    function updateRingDisplay() {
      for (let i = 0; i < 5; i++) {
        const ringEl = document.getElementById(`ring${i}`);
        if (!ringEl) continue;

        if (gameState.ringsLit[i]) {
          // Keep successfully lit rings glowing
          ringEl.style.background = 'linear-gradient(45deg, #ff6b00, #ffd700)';
          ringEl.style.borderColor = '#ffd700';
          ringEl.style.boxShadow = '0 0 20px rgba(255, 140, 0, 0.9)';
          ringEl.style.transform = 'scale(1.1)';
        } else {
          // Reset unlighted rings to default
          ringEl.style.borderColor = '#8B4513';
          ringEl.style.background = 'rgba(139, 69, 19, 0.3)';
          ringEl.style.boxShadow = 'none';
          ringEl.style.transform = 'scale(1)';
        }
      }

      // Highlight the current active ring (if it's not already lit)
      const idx = gameState.currentRing;
      if (idx !== -1 && !gameState.ringsLit[idx]) {
        const activeEl = document.getElementById(`ring${idx}`);
        activeEl.style.borderColor = '#ff8c00';
        activeEl.style.background = 'rgba(255, 140, 0, 0.4)';
        activeEl.style.boxShadow = '0 0 10px rgba(255, 140, 0, 0.6)';
      }
    }

    function handleTap() {
      if (!gameState.gameRunning) return;
      const currentTime = Date.now();
      if (currentTime - gameState.lastTapTime < 300) return;

      if (
        gameState.currentRing !== -1 &&
        !gameState.ringsLit[gameState.currentRing] &&
        gameState.ember.brightness > 0.75
      ) {
        // --- Success on a ring ---
        gameState.ringsLit[gameState.currentRing] = true;
        gameState.spiralRings[gameState.currentRing].lit = true;

        // Update ring display immediately to show gold circle
        updateRingDisplay();

        // Create success spark particles
        for (let i = 0; i < 15; i++) {
          gameState.particles.push(
            createParticle(
              gameState.ember.x + (Math.random() - 0.5) * 50,
              gameState.ember.y + (Math.random() - 0.5) * 50,
              'spark'
            )
          );
        }

        // Speed up ember slightly
        gameState.ember.speed = Math.min(0.05, gameState.ember.speed + 0.005);

        // Flash effect
        navigator.vibrate && navigator.vibrate(150);
        canvas.style.filter = 'brightness(1.4) saturate(1.5)';
        setTimeout(() => {
          canvas.style.filter = 'brightness(1)';
        }, 300);

        gameState.lastTapTime = currentTime;

        const litCount = gameState.ringsLit.filter(l => l).length;
        if (litCount >= 5) {
          setTimeout(() => {
            gameState.gameRunning = false;
            victoryOverlay.style.display = 'flex';
          }, 1000);
        }
      } else {
        // --- Failure: show failure parchment, deduct time (5 min) and leave background as fire0 ---
        gameState.gameRunning = false;
        // Create failure particles (sand/water)
        for (let i = 0; i < 12; i++) {
          gameState.particles.push(
            createParticle(
              gameState.ember.x + (Math.random() - 0.5) * 60,
              gameState.ember.y + (Math.random() - 0.5) * 60,
              Math.random() > 0.5 ? 'sand' : 'water'
            )
          );
        }
        navigator.vibrate && navigator.vibrate([150, 75, 150]);
        canvas.style.filter = 'brightness(0.5) saturate(0.6)';

        // Deduct 5 minutes for failure
        gameManager.deductTime(300);
        updateCampClockUI(gameManager.getDayTimer(), gameManager.getCurrentDay());

        // After short delay, show failure overlay
        setTimeout(() => {
          failureOverlay.style.display = 'flex';
        }, 600);
      }
    }

    function restartGame() {
      // Reset game state for another attempt (background remains fire0)
      gameState = {
        ember: {
          angle: 0,
          radius: 140,
          speed: isFastMode ? 0.035 : 0.02, // Maintain speed based on mode
          brightness: 0.5,
          x: 0,
          y: 0
        },
        currentRing: 0,
        ringsLit: [false, false, false, false, false],
        gameRunning: true,
        lastTapTime: 0,
        particles: [],
        waves: gameState.waves,
        spiralRings: [
          { radius: 140, width: 25, lit: false },
          { radius: 110, width: 25, lit: false },
          { radius: 80, width: 25, lit: false },
          { radius: 50, width: 25, lit: false },
          { radius: 20, width: 20, lit: false }
        ]
      };

      failureOverlay.style.display = 'none';
      victoryOverlay.style.display = 'none';
      canvas.style.filter = 'brightness(1)';

      // Reset ring indicators visually
      for (let i = 0; i < 5; i++) {
        const ringEl = document.getElementById(`ring${i}`);
        if (ringEl) {
          ringEl.style.borderColor = '#8B4513';
          ringEl.style.background = 'rgba(139, 69, 19, 0.3)';
          ringEl.style.boxShadow = 'none';
          ringEl.style.transform = 'scale(1)';
        }
      }

      // Show fire level indicator again
      const fireLevelIndicator = document.getElementById('fire-level-indicator');
      if (fireLevelIndicator) {
        fireLevelIndicator.style.display = 'flex';
      }

      updateGame();
    }

    // --- 6) After Victory: finalize fire build, persist state, and restore action buttons ---
    function finalizeFireBuild() {
      // Deduct 5 minutes (time cost of success)
      gameManager.deductTime(300);
      updateCampClockUI(gameManager.getDayTimer(), gameManager.getCurrentDay());

      // Set tribe fire value based on current state and mode
      const playerTribe = gameManager.getPlayerTribe();
      if (playerTribe) {
        if (isFastMode) {
          // Tending fire increases by 1 level
          playerTribe.fire = Math.min(3, playerTribe.fire + 1);
        } else {
          // Making fire sets to level 1
          playerTribe.fire = 1;
        }
      }

      // Award teamPlayer points to player for each other tribe member
      const tribe = gameManager.getPlayerTribe();
      if (tribe && tribe.members) {
        const otherCount = tribe.members.filter(m => m.id !== player.id).length;
        if (otherCount > 0) {
          if (!player.teamPlayer) {
            player.teamPlayer = 0;
          }
          player.teamPlayer += otherCount;
          showTeamPlayerEffect(otherCount);
        }
      }

      // Remove the minigame UI container
      const gameUIEl = document.getElementById('fire-game-ui');
      if (gameUIEl) gameUIEl.remove();

      // Get the new fire level first
      const newFireLevel = playerTribe ? playerTribe.fire : 1;

      // Show and update fire level indicator
      const fireLevelIndicator = document.getElementById('fire-level-indicator');
      if (fireLevelIndicator) {
        fireLevelIndicator.style.display = 'flex';

        // Update fire level circles based on new fire level
        for (let i = 0; i < 3; i++) {
          const circle = document.getElementById(`fire-level-${i}`);
          if (circle) {
            if (newFireLevel > i) {
              circle.style.background = 'linear-gradient(45deg, #ff6b00, #ffd700)';
              circle.style.borderColor = '#ffd700';
              circle.style.boxShadow = '0 0 15px rgba(255, 140, 0, 0.8)';
            } else {
              circle.style.background = 'rgba(139, 69, 19, 0.3)';
              circle.style.borderColor = '#8B4513';
              circle.style.boxShadow = 'none';
            }
          }
        }
      }

      // Switch background based on fire level
      if (newFireLevel >= 3) {
        container.style.backgroundImage = "url('Assets/Minigame/fire3.png')";
      } else if (newFireLevel >= 2) {
        container.style.backgroundImage = "url('Assets/Minigame/fire2.png')";
      } else {
        container.style.backgroundImage = "url('Assets/Minigame/fire1.png')";
      }

      // Rebuild action row: clear and add appropriate button + Down
      if (actionButtons) {
        clearChildren(actionButtons);

        if (newFireLevel >= 3) {
          // Fire is at max level, show a different button or message
          const maxFireBtn = createIconButton(
            'Assets/Buttons/blank.png',
            'Fire Maxed',
            () => {
              console.log('Fire is at maximum level');
            },
            'Fire Maxed'
          );
          actionButtons.appendChild(maxFireBtn);
        } else {
          // Still can tend fire
          const tendFireBtn = createIconButton(
            'Assets/Buttons/blank.png',
            'Tend Fire',
            () => handleTendFireTap(),
            'Tend Fire'
          );
          actionButtons.appendChild(tendFireBtn);
        }

        const downBtn = createIconButton(
          'Assets/Buttons/down.png',
          'Down',
          () => {
            if (window.previousCampView) {
              window.campScreen.loadView(window.previousCampView);
            } else {
              window.campScreen.loadView('campfire');
            }
          },
          ''
        );
        actionButtons.appendChild(downBtn);
      }

      addDebugBanner('Fire successfully built!', 'orange', 200);
    }

    function showTeamPlayerEffect(amount) {
      const effect = document.createElement('div');
      effect.className = 'team-player-hit-effect';
      effect.style.position = 'fixed';
      effect.style.left = '50%';
      effect.style.top = '50%';
      effect.style.transform = 'translate(-50%, -50%)';
      effect.style.fontSize = '28px';
      effect.style.fontWeight = 'bold';
      effect.style.color = '#10b981';
      effect.style.zIndex = '9999';
      effect.style.display = 'flex';
      effect.style.alignItems = 'center';
      effect.style.gap = '10px';
      effect.style.pointerEvents = 'none';
      // <-- no inline animation property, CSS will handle it via .team-player-hit-effect -->

      const plus = document.createElement('span');
      plus.textContent = `+${amount}`;

      const icon = document.createElement('img');
      icon.src = 'Assets/Resources/teamPlayer.png';
      icon.style.height = '28px';
      icon.style.width = 'auto';

      effect.appendChild(plus);
      effect.appendChild(icon);
      document.body.appendChild(effect);

      setTimeout(() => {
        effect.remove();
      }, 2500);
    }

    // --- 9) Start the minigame loop ---
    updateGame();

    // --- 10) Attach input handlers to the canvas ---
    canvas.addEventListener('touchstart', e => {
      e.preventDefault();
      handleTap();
    });
    canvas.addEventListener('click', handleTap);
    canvas.addEventListener('touchend', e => {
      e.preventDefault();
    });
  }
  function showCookingUnattendedParchment() {
    const overlay = createElement('div', {
        id: 'cooking-unattended-overlay',
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
  
      const text = createElement(
        'div',
        {
          style: `
            color: white;
            font-family: 'Survivant', sans-serif;
            font-size: 1.2rem;
            text-align: center;
            text-shadow: 2px 2px 4px black;
            line-height: 1.4;
          `
        },
        `You can't leave food cooking unattended.`
      );
  
      parchment.appendChild(text);
      overlay.appendChild(parchment);
      document.body.appendChild(overlay);
  
      overlay.addEventListener('click', () => {
        overlay.remove();
      });
    }
}