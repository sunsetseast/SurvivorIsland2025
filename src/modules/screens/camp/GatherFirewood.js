
/**
 * @module GatherFirewoodView
 * Machete-based firewood chopping mini-game view
 */

import { createElement, clearChildren } from '../../../utils/index.js';

export default function renderGatherFirewoodView(container) {
  // Prevent multiple initializations
  if (container._firewoodInitialized) {
    return;
  }
  container._firewoodInitialized = true;

  clearChildren(container);

  // Set full-screen background
  container.style.backgroundImage = "url('Assets/Minigame/firewoodScreen.png')";
  container.style.backgroundSize = 'cover';
  container.style.backgroundPosition = 'center';
  container.style.backgroundRepeat = 'no-repeat';
  container.style.position = 'relative';

  // Game state variables
  let gameState = 'ready'; // 'ready', 'playing', 'finished'
  let machetePosition = -10;
  let firewood = 0;
  let hitLines = [];
  let animationId = null;
  const gameSpeed = 1.5;
  const redLinePositions = [20, 35, 50, 65, 80];

  // Create log container
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

  // Red Lines
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
        right: -32px;
        top: 0;
        color: #16a085;
        font-weight: bold;
        font-size: 14px;
      `
    }, '✓');

    line.appendChild(check);
    logContainer.appendChild(line);
  }

  // Machete Image
  const macheteImg = createElement('img', {
    id: 'machete',
    src: 'Assets/Minigame/machete.png',
    alt: 'Machete',
    style: `
      position: absolute;
      width: 48px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 10;
    `
  });

  logContainer.appendChild(macheteImg);
  container.appendChild(logContainer);

  // Tap Area
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

  // Parchment Popup
  const popup = createElement('div', {
    style: `
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 300px;
      padding: 30px 20px;
      background-image: url('Assets/parch-portrait.png');
      background-size: cover;
      background-position: center;
      background-repeat: no-repeat;
      text-align: center;
      font-family: 'Survivant', serif;
      color: #2d1a05;
      z-index: 100;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
    `
  });

  const message = createElement('p', {
    style: `
      margin-bottom: 24px;
      font-size: 16px;
      line-height: 1.5;
    `
  }, 'To gather firewood, tap when the machete crosses red lines. Hit all red lines for maximum firewood!');

  const startButton = createElement('button', {
    className: 'rect-button small',
    style: 'margin-top: 8px;'
  }, 'Start');

  startButton.addEventListener('click', () => {
    popup.remove();
    startGame();
  });

  popup.appendChild(message);
  popup.appendChild(startButton);
  container.appendChild(popup);

  // Add CSS for animations (only if not already present)
  const existingStyle = document.getElementById('firewood-game-styles');
  if (!existingStyle) {
    const style = document.createElement('style');
    style.id = 'firewood-game-styles';
    style.textContent = `
      @keyframes hitPing {
        0% { opacity: 1; transform: translateX(-50%) scale(1); }
        100% { opacity: 0; transform: translateX(-50%) scale(1.2); }
      }
      
      .hidden {
        display: none;
      }
      
      .red-line.hit {
        background-color: #16a085 !important;
      }
    `;
    document.head.appendChild(style);
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
      if (line) {
        line.classList.remove('hit');
        const check = line.querySelector('.line-check');
        if (check) check.classList.add('hidden');
      }
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
      if (line) {
        line.classList.add('hit');
        const check = line.querySelector('.line-check');
        if (check) check.classList.remove('hidden');
      }
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
        font-size: 18px;
        font-weight: bold;
        color: #16a085;
        pointer-events: none;
        z-index: 20;
        top: ${position + 10}%;
        animation: hitPing 0.4s ease-out;
      `
    }, '+1 🪵');

    logContainer.appendChild(effect);
    setTimeout(() => effect.remove(), 400);
  }

  function endGame() {
    if (animationId) cancelAnimationFrame(animationId);
    tapArea.style.display = 'none';

    console.log(`Firewood gathered: ${firewood}`);
    
    // Show completion message
    const completionPopup = createElement('div', {
      style: `
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 300px;
        padding: 30px 20px;
        background-image: url('Assets/parch-portrait.png');
        background-size: cover;
        background-position: center;
        background-repeat: no-repeat;
        text-align: center;
        font-family: 'Survivant', serif;
        color: #2d1a05;
        z-index: 100;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
      `
    });

    const completionMessage = createElement('p', {
      style: `
        margin-bottom: 24px;
        font-size: 16px;
        line-height: 1.5;
      `
    }, `You gathered ${firewood} pieces of firewood!`);

    const returnButton = createElement('button', {
      className: 'rect-button small',
      style: 'margin-top: 8px;'
    }, 'Return to Camp');

    returnButton.addEventListener('click', () => {
      if (window.campScreen) {
        window.campScreen.loadView('campfire');
      }
    });

    completionPopup.appendChild(completionMessage);
    completionPopup.appendChild(returnButton);
    container.appendChild(completionPopup);
  }

  // Cleanup function for when leaving the view
  const cleanup = () => {
    if (animationId) {
      cancelAnimationFrame(animationId);
      animationId = null;
    }
    gameState = 'finished';
  };
  
  container.addEventListener('cleanup', cleanup);
  
  // Store cleanup function on container for manual cleanup
  container._firewoodCleanup = cleanup;
}
