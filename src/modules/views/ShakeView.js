/**
 * @module ShakeView
 * Tree shaking mini-game with action bar integration
 */
import { createElement, clearChildren, addDebugBanner } from '../utils/index.js';
import { gameManager } from '../core/index.js';
import { updateCampClockUI } from '../utils/ClockUtils.js';
import activityTracker from '../utils/ActivityTracker.js';

export default function renderShakeView(container) {
  console.log('renderShakeView() called');
  addDebugBanner('renderShakeView() called', 'orange', 40);

  clearChildren(container);
  container.style.backgroundImage = "url('Assets/Minigame/bambooScreen.png')";
  container.style.backgroundSize = 'cover';
  container.style.backgroundPosition = 'center';
  container.style.backgroundRepeat = 'no-repeat';
  container.style.position = 'relative';

  let isShaking = false;

  const popup = createElement('div', {
    id: 'result-popup',
    style: `
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 320px;
      height: 280px;
      background-image: url('Assets/parch-portrait.png');
      background-size: 100% 100%;
      background-position: center;
      background-repeat: no-repeat;
      text-align: center;
      font-family: 'Survivant', serif;
      z-index: 100;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
    `
  });

  const popupHeader = createElement('div', {
    style: `
      font-size: 28px;
      font-weight: bold;
      margin-bottom: 10px;
      color: white;
      text-shadow: 1px 1px 2px black;
      font-family: 'Survivant', serif;
    `
  }, 'Gather Resources:');

  const popupMessage = createElement('p', {
    id: 'result-text',
    style: `
      margin: 0;
      font-size: 20px;
      font-weight: bold;
      padding: 0 20px;
      white-space: pre-line;
      color: white;
      text-shadow: 1px 1px 2px black;
      font-family: 'Survivant', serif;
    `
  }, 'Shake the tree to drop\nCoconuts and Palm Fronds.');

  const popupSubtext = createElement('div', {
    style: `
      font-size: 16px;
      font-weight: bold;
      margin-top: 10px;
      color: white;
      text-shadow: 1px 1px 2px black;
      font-family: 'Survivant', serif;
    `
  });
  popupSubtext.innerHTML = `Every shake will deduct<br><span style="color: #dc2626;">5 minutes</span> from the clock.`;

  popup.appendChild(popupHeader);
  popup.appendChild(popupMessage);
  popup.appendChild(popupSubtext);
  container.appendChild(popup);

  // === ACTION BAR BUTTONS ===
  const actionButtons = document.getElementById('action-buttons');
  if (actionButtons) {
    clearChildren(actionButtons);
    actionButtons.style.justifyContent = 'center';
    actionButtons.style.gap = '20px';
    actionButtons.style.padding = '0';

    const createIconButton = (src, alt, onClick, label, width = 110, height = 70, fontSize = '1.2rem', textOffset = -10) => {
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

      const textOverlay = createElement('div', {
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
          pointer-events: none;
        `
      }, label || '');

      wrapper.appendChild(image);
      if (label) wrapper.appendChild(textOverlay);
      wrapper.addEventListener('click', onClick);
      return wrapper;
    };

    const startButton = createIconButton('Assets/Buttons/blank.png', 'Shake', () => {
      popup.style.display = 'none';
      if (!isShaking) {
        shakeTree();
      }
    }, 'Shake', 110, 65, '1.3rem', -1);

    const downButton = createIconButton('Assets/Buttons/down.png', 'Down', () => {
      if (window.previousCampView) {
        console.log(`Returning to previous view: ${window.previousCampView}`);
        window.campScreen.loadView(window.previousCampView);
      } else {
        console.warn('No previousCampView set. Defaulting to campfire.');
        window.campScreen.loadView('campfire');
      }
    });

    actionButtons.appendChild(startButton);
    actionButtons.appendChild(downButton);
  }

  // === GAME FUNCTIONS ===
  function shakeTree() {
    if (isShaking) return;

    // Remove any existing reward icons before new drop
    const oldIcons = container.querySelectorAll('.reward-icon');
    oldIcons.forEach(icon => icon.remove());

    isShaking = true;

    // Add shake animation to container
    container.style.animation = 'shake 2s ease-in-out';

    // Remove animation after 2 seconds
    setTimeout(() => {
      container.style.animation = '';
      isShaking = false;

      // Determine rewards
      const rewards = calculateRewards();
      showResults(rewards);
    }, 2000);
  }

  function calculateRewards() {
    const rewards = {
      coconuts: 0,
      palms: 0
    };

    // Random chance system
    const coconutChance = Math.random();
    const palmChance = Math.random();

    // 30% chance for coconut
    if (coconutChance < 0.3) {
      rewards.coconuts = 1;
    }

    // 30% chance for palm frond
    if (palmChance < 0.3) {
      rewards.palms = 1;
    }

    // 5% chance for both (rare occurrence)
    if (Math.random() < 0.05) {
      rewards.coconuts = 1;
      rewards.palms = 1;
    }

    return rewards;
  }

  // New: Animate two icons side by side if both rewards exist
  function showBothRewardsSideBySide() {
    // Coconut icon on the left side of center
    const coconutIcon = createElement('img', {
      src: 'Assets/Resources/coconut.png',
      alt: 'Coconut',
      className: 'reward-icon',
      style: `
        position: absolute;
        top: -80px;
        left: calc(50% - 40px);
        transform: translateX(-50%);
        height: 80px;
        width: auto;
        z-index: 20;
        animation: fall 1s ease-out forwards;
      `
    });
    // Palm icon on the right side of center
    const palmIcon = createElement('img', {
      src: 'Assets/Resources/palm.png',
      alt: 'Palm Frond',
      className: 'reward-icon',
      style: `
        position: absolute;
        top: -80px;
        left: calc(50% + 40px);
        transform: translateX(-50%);
        height: 80px;
        width: auto;
        z-index: 20;
        animation: fall 1s ease-out forwards;
      `
    });

    container.appendChild(coconutIcon);
    container.appendChild(palmIcon);
    // Icons remain until next shakeTree() call
  }

  function showRewardEffect(reward, count) {
    for (let i = 0; i < count; i++) {
      const icon = createElement('img', {
        src: reward === 'coconuts' ? 'Assets/Resources/coconut.png' : 'Assets/Resources/palm.png',
        alt: reward === 'coconuts' ? 'Coconut' : 'Palm Frond',
        className: 'reward-icon',
        style: `
          position: absolute;
          top: -80px;
          left: 50%;
          transform: translateX(-50%);
          height: 80px;
          width: auto;
          z-index: 20;
          animation: fall 1s ease-out forwards;
        `
      });

      container.appendChild(icon);
      // No removal here: icon remains until next shakeTree() call
    }
  }

  function showResults(rewards) {
    // Deduct 5 minutes (300 seconds) and update the clock UI
    gameManager.deductTime(300);
    updateCampClockUI(
      gameManager.getDayTimer(),
      gameManager.getCurrentDay()
    );

    // Add resources to player inventory
    const player = gameManager.getPlayerSurvivor();
    if (player) {
      if (rewards.coconuts > 0 && rewards.palms > 0) {
        // Show side-by-side drop effect
        player.coconuts = (player.coconuts || 0) + rewards.coconuts;
        player.palms = (player.palms || 0) + rewards.palms;
        console.log(`Player now has ${player.coconuts} coconuts and ${player.palms} palm fronds`);
        
        // Track both resource collections
        activityTracker.trackResourceGathering('coconuts', rewards.coconuts, 'Tree Shaking');
        activityTracker.trackResourceGathering('palms', rewards.palms, 'Tree Shaking');
        
        showBothRewardsSideBySide();
      } else {
        if (rewards.coconuts > 0) {
          player.coconuts = (player.coconuts || 0) + rewards.coconuts;
          console.log(`Player now has ${player.coconuts} coconuts`);
          
          // Track coconut collection
          activityTracker.trackResourceGathering('coconuts', rewards.coconuts, 'Tree Shaking');
          
          showRewardEffect('coconuts', rewards.coconuts);
        }
        if (rewards.palms > 0) {
          player.palms = (player.palms || 0) + rewards.palms;
          console.log(`Player now has ${player.palms} palm fronds`);
          
          // Track palm collection
          activityTracker.trackResourceGathering('palms', rewards.palms, 'Tree Shaking');
          
          showRewardEffect('palms', rewards.palms);
        }
      }
      
      // Track unsuccessful attempts (when nothing is found)
      if (rewards.coconuts === 0 && rewards.palms === 0) {
        activityTracker.trackResourceGathering('none', 0, 'Tree Shaking - No rewards');
      }
    } else {
      console.warn('No player survivor found to assign resources.');
    }

    // Flash the clock red
    const timerEl = document.getElementById('clock-time-text');
    if (timerEl) {
      timerEl.style.color = 'red';
      timerEl.style.transition = 'color 0.3s ease';

      setTimeout(() => {
        timerEl.style.color = '#2b190a'; // Original color
      }, 1000);
    }

    // Show results after a brief delay to let effects play
    setTimeout(() => {
      let resultText = '';

      if (rewards.coconuts > 0 && rewards.palms > 0) {
        resultText = 'Lucky! You found a coconut and a palm frond!';
      } else if (rewards.coconuts > 0) {
        resultText = 'You found a coconut!';
      } else if (rewards.palms > 0) {
        resultText = 'You found a palm frond!';
      } else {
        resultText = 'Nothing fell from the tree this time.';
      }

      popupMessage.textContent = resultText;
      popup.style.display = 'flex';

      // Show start button again
      if (actionButtons) {
        clearChildren(actionButtons);
        actionButtons.style.justifyContent = 'center';
        actionButtons.style.gap = '20px';
        actionButtons.style.padding = '0';

        const createIconButton = (src, alt, onClick, label, width = 110, height = 70, fontSize = '1.2rem', textOffset = -10) => {
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

          const textOverlay = createElement('div', {
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
              pointer-events: none;
            `
          }, label || '');

          wrapper.appendChild(image);
          if (label) wrapper.appendChild(textOverlay);
          wrapper.addEventListener('click', onClick);
          return wrapper;
        };

        const startButton = createIconButton('Assets/Buttons/blank.png', 'Shake', () => {
          popup.style.display = 'none';
          if (!isShaking) {
            shakeTree();
          }
        }, 'Shake', 110, 65, '1.3rem', -1);

        const downButton = createIconButton('Assets/Buttons/down.png', 'Down', () => {
          if (window.previousCampView) {
            console.log(`Returning to previous view: ${window.previousCampView}`);
            window.campScreen.loadView(window.previousCampView);
          } else {
            console.warn('No previousCampView set. Defaulting to campfire.');
            window.campScreen.loadView('campfire');
          }
        });

        actionButtons.appendChild(startButton);
        actionButtons.appendChild(downButton);
      }
    }, 300);
  }

  // Add CSS for shake and fall animations
  const style = createElement('style', {});
  style.textContent = `
    @keyframes shake {
      0%, 100% { transform: translateX(0); }
      10%, 30%, 50%, 70%, 90% { transform: translateX(-5px); }
      20%, 40%, 60%, 80% { transform: translateX(5px); }
    }

    @keyframes hitPing {
      0% { opacity: 0; transform: translate(-50%, -50%) scale(0.5); }
      50% { opacity: 1; transform: translate(-50%, -50%) scale(1.1); }
      100% { opacity: 0; transform: translate(-50%, -50%) scale(1); }
    }

    @keyframes fall {
      0% { top: -80px; }
      100% { top: calc(100% - 140px); }
    }

    .hidden {
      display: none !important;
    }
  `;
  document.head.appendChild(style);
}