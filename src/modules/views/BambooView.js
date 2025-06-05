/**
 * @module BambooView
 * Bamboo gathering mini-game with action bar integration
 */
import { createElement, clearChildren, addDebugBanner } from '../utils/index.js';
import { gameManager } from '../core/index.js';
import { updateCampClockUI } from '../utils/ClockUtils.js';

export default function renderBambooView(container) {
  console.log('renderBambooView() called');
  addDebugBanner('renderBambooView() called', 'green', 40);

  clearChildren(container);
  container.style.backgroundImage = "url('Assets/Minigame/bambooScreen.png')";
  container.style.backgroundSize = 'cover';
  container.style.backgroundPosition = 'center';
  container.style.backgroundRepeat = 'no-repeat';
  container.style.position = 'relative';

  let gameState = 'ready';
  let bamboo = 0;
  let machetePosition = -10;
  let currentDirection = 'down'; // 'down' or 'up'
  let directionChanges = 0;
  let animationId = null;
  const gameSpeed = 1.2;
  const sequence = [0, 4, 1, 3, 2]; // Which line to highlight for each direction change
  const redLinePositions = [20, 35, 50, 65, 80];
  const hitLines = new Set();
  let currentTargetLine = 0;

  // Log and lines
  const logContainer = createElement('div', {
    className: 'log-container',
    style: `position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 128px; height: 320px; z-index: 1;`
  });

  const logImage = createElement('img', {
    src: 'Assets/Minigame/bambooGame.png',
    alt: 'Bamboo',
    style: 'width: 100%; height: 100%; position: absolute;'
  });
  logContainer.appendChild(logImage);

  for (let i = 0; i < redLinePositions.length; i++) {
    const line = createElement('div', {
      id: `line-${i}`,
      className: 'red-line',
      style: `top: ${redLinePositions[i]}%; position: absolute; width: 100%; height: 8px; background: #dc2626; opacity: 0.8;`
    });

    const check = createElement('div', {
      className: 'line-check hidden',
      style: `
        position: absolute;
        right: -40px;
        top: 0;
        color: #16a085;
        font-weight: bold;
        font-size: 24px;
      `
    }, '✓');

    line.appendChild(check);
    logContainer.appendChild(line);
  }

  // Machete
  const macheteImg = createElement('img', {
    id: 'machete',
    src: 'Assets/Minigame/machete.png',
    alt: 'Machete',
    style: `position: absolute; width: 90px; left: 50%; transform: translateX(-50%); z-index: 10;`
  });
  logContainer.appendChild(macheteImg);
  container.appendChild(logContainer);

  // Tap area
  const tapArea = createElement('div', {
    id: 'tap-area',
    style: `position: absolute; inset: 0; z-index: 30; background: transparent; display: none;`
  });
  tapArea.addEventListener('click', gatherBamboo);
  container.appendChild(tapArea);

  // Popup
  const popup = createElement('div', {
    id: 'result-popup',
    style: `position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 320px; height: 280px; background-image: url('Assets/parch-portrait.png'); background-size: 100% 100%; background-position: center; background-repeat: no-repeat; text-align: center; font-family: 'Survivant', serif; z-index: 100; display: flex; flex-direction: column; justify-content: center; align-items: center;`
  });

  const popupHeader = createElement('div', {
    style: `font-size: 28px; font-weight: bold; margin-bottom: 10px; color: white; text-shadow: 1px 1px 2px black;`
  }, 'Gather Bamboo:');

  const popupMessage = createElement('p', {
    id: 'result-text',
    style: `margin: 0; font-size: 20px; font-weight: bold; padding: 0 20px; white-space: pre-line; color: white; text-shadow: 1px 1px 2px black;`
  }, 'Tap when the machete crosses the highlighted line.\nWatch for direction changes!');

  const popupSubtext = createElement('div', {
    style: `font-size: 16px; font-weight: bold; margin-top: 10px; color: white; text-shadow: 1px 1px 2px black;`
  });
  popupSubtext.innerHTML = `Gathering bamboo deducts<br><span style="color: #dc2626;">5 minutes</span> from the clock.`;
  popup.appendChild(popupHeader);
  popup.appendChild(popupMessage);
  popup.appendChild(popupSubtext);
  container.appendChild(popup);

  // === ACTION BAR ===
  const actionButtons = document.getElementById('action-buttons');
  if (actionButtons) {
    clearChildren(actionButtons);
    actionButtons.style.justifyContent = 'center';
    actionButtons.style.gap = '20px';

    const createIconButton = (src, alt, onClick, label, width = 110, height = 65, fontSize = '1.2rem') => {
      const wrapper = createElement('div', {
        style: `
          width: ${width}px;
          height: ${height}px;
          position: relative;
          cursor: pointer;
        `
      });

      const image = createElement('img', {
        src, alt,
        style: `width: 100%; height: 100%; object-fit: contain; pointer-events: none;`
      });

      const text = createElement('div', {
        style: `
          position: absolute;
          top: 50%;
          left: 0;
          width: 100%;
          text-align: center;
          color: white;
          font-size: ${fontSize};
          font-family: 'Survivant', sans-serif;
          transform: translateY(-50%);
          text-shadow: 1px 1px 2px black;
          pointer-events: none;
        `
      }, label || '');

      wrapper.appendChild(image);
      if (label) wrapper.appendChild(text);
      wrapper.addEventListener('click', onClick);
      return wrapper;
    };

    const startButton = createIconButton('Assets/Buttons/blank.png', 'Start', () => {
      popup.style.display = 'none';
      startGame();
    }, 'Start');

    const downButton = createIconButton('Assets/Buttons/down.png', 'Down', () => {
      if (window.previousCampView) {
        window.campScreen.loadView(window.previousCampView);
      } else {
        window.campScreen.loadView('campfire');
      }
    });

    actionButtons.appendChild(startButton);
    actionButtons.appendChild(downButton);
  }

  // === GAME FUNCTIONS ===
  function startGame() {
    gameState = 'playing';
    machetePosition = -10;
    currentDirection = 'down';
    directionChanges = 0;
    bamboo = 0;
    hitLines.clear();
    currentTargetLine = 0;
    tapArea.style.display = 'block';

    // Reset all lines
    for (let i = 0; i < 5; i++) {
      const line = document.getElementById(`line-${i}`);
      line.classList.remove('hit');
      line.style.background = '#dc2626';
      line.querySelector('.line-check').classList.add('hidden');
    }

    // Highlight the first target line
    highlightTargetLine();
    animate();
  }

  function animate() {
    if (gameState === 'playing') {
      // Move machete based on current direction
      if (currentDirection === 'down') {
        machetePosition += gameSpeed;

        // Check if we need to change direction (reached bottom)
        if (machetePosition >= 110) {
          // Check if player missed the target line
          const targetLineIndex = sequence[currentTargetLine];
          if (!hitLines.has(targetLineIndex)) {
            // Missed the line - end game with 0 bamboo
            bamboo = 0;
            gameState = 'finished';
            endGame();
            return;
          }

          currentDirection = 'up';
          directionChanges++;
          if (directionChanges < 5) {
            currentTargetLine++;
            highlightTargetLine();
          }
        }
      } else if (currentDirection === 'up') {
        machetePosition -= gameSpeed;

        // Check if we need to change direction (reached top)
        if (machetePosition <= -10) {
          // Check if player missed the target line
          const targetLineIndex = sequence[currentTargetLine];
          if (!hitLines.has(targetLineIndex)) {
            // Missed the line - end game with 0 bamboo
            bamboo = 0;
            gameState = 'finished';
            endGame();
            return;
          }

          currentDirection = 'down';
          directionChanges++;
          if (directionChanges < 5) {
            currentTargetLine++;
            highlightTargetLine();
          }
        }
      }

      macheteImg.style.top = `${machetePosition}%`;

      // Check if game should end (completed 5 direction changes)
      if (directionChanges >= 5) {
        gameState = 'finished';
        endGame();
        return;
      }

      animationId = requestAnimationFrame(animate);
    }
  }

  function highlightTargetLine() {
    // Remove previous highlights
    for (let i = 0; i < 5; i++) {
      const line = document.getElementById(`line-${i}`);
      if (!hitLines.has(i)) {
        line.style.background = '#dc2626';
        line.style.opacity = '0.8';
      }
    }

    // Highlight current target line
    if (currentTargetLine < sequence.length) {
      const targetLineIndex = sequence[currentTargetLine];
      const line = document.getElementById(`line-${targetLineIndex}`);
      if (!hitLines.has(targetLineIndex)) {
        line.style.background = '#fbbf24'; // Yellow highlight
        line.style.opacity = '1';
      }
    }
  }

  function gatherBamboo() {
    if (gameState !== 'playing' || currentTargetLine >= sequence.length) return;

    const tolerance = 8;
    const targetLineIndex = sequence[currentTargetLine];
    const targetLinePos = redLinePositions[targetLineIndex];

    // Check if machete is close enough to the target line
    if (!hitLines.has(targetLineIndex) && Math.abs(machetePosition - targetLinePos) <= tolerance) {
      hitLines.add(targetLineIndex);
      bamboo++;

      const line = document.getElementById(`line-${targetLineIndex}`);
      line.classList.add('hit');
      line.style.background = '#2ecc71';
      line.style.opacity = '1';
      line.querySelector('.line-check').classList.remove('hidden');
      showHitEffect(targetLinePos);
    } else {
      // Tapped at wrong time/position - end game immediately with 0 bamboo
      bamboo = 0;
      gameState = 'finished';
      endGame();
    }
  }

  function showHitEffect(position) {
    const effect = createElement('div', {
      className: 'hit-effect',
      style: `position: absolute; left: 50%; transform: translateX(-50%); font-size: 26px; font-weight: bold; color: #16a085; pointer-events: none; z-index: 20; top: ${position + 10}%; display: flex; align-items: center; gap: 8px; animation: hitPing 0.8s ease-out;`
    });

    const plusText = createElement('span', {}, '+1');

    const icon = createElement('img', {
      src: 'Assets/Resources/bamboo.png',
      alt: 'Bamboo',
      style: `
        height: 28px;
        width: auto;
        display: inline-block;
      `
    });

    effect.appendChild(plusText);
    effect.appendChild(icon);
    logContainer.appendChild(effect);

    setTimeout(() => effect.remove(), 800);
  }

  function endGame() {
    if (animationId) cancelAnimationFrame(animationId);
    gameState = 'finished';
    tapArea.style.display = 'none';

    gameManager.deductTime(300);
    updateCampClockUI(gameManager.getDayTimer(), gameManager.getCurrentDay());

    const player = gameManager.getPlayerSurvivor();
    if (player) {
      player.bamboo = (player.bamboo || 0) + bamboo;
      console.log(`Player now has ${player.bamboo} bamboo`);
    }

    const timerEl = document.getElementById('clock-time-text');
    if (timerEl) {
      timerEl.style.color = 'red';
      timerEl.style.transition = 'color 0.3s ease';
      setTimeout(() => {
        timerEl.style.color = '#2b190a';
      }, 1000);
    }

    popupMessage.textContent = `You collected ${bamboo} bamboo.`;
    popup.style.display = 'flex';
  }
}