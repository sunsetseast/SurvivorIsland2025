/**
 * @module FirewoodView
 * Firewood chopping mini-game with action bar integration
 */
import { createElement, clearChildren, addDebugBanner } from '../utils/index.js';
import { gameManager } from '../core/index.js';
import { updateCampClockUI } from '../utils/ClockUtils.js';
import { trackResourceAttempt } from '../utils/ActivityTracker.js';

export default function renderFirewoodView(container) {
  console.log('renderFirewoodView() called');
  addDebugBanner('renderFirewoodView() called', 'orange', 40);

  clearChildren(container);
  container.style.backgroundImage = "url('Assets/Minigame/firewoodScreen.png')";
  container.style.backgroundSize = 'cover';
  container.style.backgroundPosition = 'center';
  container.style.backgroundRepeat = 'no-repeat';
  container.style.position = 'relative';

  let gameState = 'ready';
  let machetePosition = -10;
  let firewood = 0;
  let hitLines = [];
  let animationId = null;
  const gameSpeed = 1.5;
  const redLinePositions = [20, 35, 50, 65, 80];

  const logContainer = createElement('div', {
    className: 'log-container',
    style: `
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 128px;
      height: 320px;
      z-index: 1;
    `
  });

  const logImage = createElement('img', {
    src: 'Assets/Minigame/firewoodGame.png',
    alt: 'Log',
    style: 'width: 100%; height: 100%; position: absolute;'
  });
  logContainer.appendChild(logImage);

  for (let i = 0; i < redLinePositions.length; i++) {
    const line = createElement('div', {
      id: `line-${i}`,
      className: 'red-line',
      style: `
        top: ${redLinePositions[i]}%;
        position: absolute;
        width: 100%;
        height: 8px;
        background: #dc2626;
        opacity: 0.8;
      `
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

  const macheteImg = createElement('img', {
    id: 'machete',
    src: 'Assets/Minigame/machete.png',
    alt: 'Machete',
    style: `
      position: absolute;
      width: 90px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 10;
    `
  });
  logContainer.appendChild(macheteImg);
  container.appendChild(logContainer);

  const tapArea = createElement('div', {
    id: 'tap-area',
    style: `
      position: absolute;
      inset: 0;
      z-index: 30;
      background: transparent;
      display: none;
    `
  });
  tapArea.addEventListener('click', chopWood);
  container.appendChild(tapArea);

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
  }, 'Gather Firewood:');

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
  }, 'Tap as the machete crosses red lines.\nHit all 5 lines for maximum firewood.');

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
  popupSubtext.innerHTML = `Gathering firewood deducts<br><span style="color: #dc2626;">5 minutes</span> from the clock.`;
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

    const startButton = createIconButton('Assets/Buttons/blank.png', 'Start', () => {
      popup.style.display = 'none';
      startGame();
    }, 'Start', 110, 65, '1.3rem', -1);

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
  function startGame() {
    gameState = 'playing';
    firewood = 0;
    machetePosition = -10;
    hitLines = [];
    tapArea.style.display = 'block';

    for (let i = 0; i < 5; i++) {
      const line = document.getElementById(`line-${i}`);
      line.classList.remove('hit');
      line.style.background = '#dc2626';
      line.querySelector('.line-check').classList.add('hidden');
    }

    animate();
  }

  function animate() {
    if (gameState === 'playing') {
      machetePosition += gameSpeed;
      macheteImg.style.top = `${machetePosition}%`;

      if (machetePosition >= 110) {
        gameState = 'finished';
        endGame();
        return;
      }

      animationId = requestAnimationFrame(animate);
    }
  }

  function chopWood() {
    if (gameState !== 'playing') return;

    const tolerance = 8;
    let hitLine = null;

    for (let i = 0; i < redLinePositions.length; i++) {
      const linePos = redLinePositions[i];
      if (!hitLines.includes(i) && Math.abs(machetePosition - linePos) <= tolerance) {
        hitLine = i;
        break;
      }
    }

    if (hitLine !== null) {
      hitLines.push(hitLine);
      firewood++;

      const line = document.getElementById(`line-${hitLine}`);
      line.classList.add('hit');
      line.style.background = '#2ecc71';
      line.querySelector('.line-check').classList.remove('hidden');
      showHitEffect(redLinePositions[hitLine]);
    }
  }

  function showHitEffect(position) {
    const effect = createElement('div', {
      className: 'hit-effect',
      style: `
        position: absolute;
        left: 50%;
        transform: translateX(-50%);
        font-size: 26px;
        font-weight: bold;
        color: #16a085;
        pointer-events: none;
        z-index: 20;
        top: ${position + 10}%;
        display: flex;
        align-items: center;
        gap: 8px;
        animation: hitPing 0.8s ease-out;
      `
    });

    const plusText = createElement('span', {}, '+1');

    const icon = createElement('img', {
      src: 'Assets/Resources/firewood.png',
      alt: 'Firewood',
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
  tapArea.style.display = 'none';

  // Deduct 5 minutes (300 seconds) and update the clock UI
  gameManager.deductTime(300);
  updateCampClockUI(
    gameManager.getDayTimer(),
    gameManager.getCurrentDay()
  );

  // Track firewood gathering attempt
  trackResourceAttempt('firewood', firewood);

  // Add firewood to player inventory
  const player = gameManager.getPlayerSurvivor();
  if (player) {
    player.firewood = (player.firewood || 0) + firewood;
    console.log(`Player now has ${player.firewood} firewood`);
  } else {
    console.warn('No player survivor found to assign firewood.');
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

  popupMessage.textContent = `You collected ${firewood} firewood.`;
  popup.style.display = 'flex';
}
}