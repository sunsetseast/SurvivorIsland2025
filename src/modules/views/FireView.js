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

  // --- Clear existing content and set FireView background ---
  clearChildren(container);
  container.style.backgroundImage = fireBuilt
    ? "url('Assets/Minigame/fire1.png')"
    : "url('Assets/Minigame/fire0.png')";
  container.style.backgroundSize = 'cover';
  container.style.backgroundPosition = 'center';
  container.style.backgroundRepeat = 'no-repeat';
  container.style.position = 'relative';

  // --- POT IMAGE (always visible) ---
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
    `
  });
  container.appendChild(potImg);

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
        () => {
          console.log('Tend Fire clicked');
          gameManager.deductTime(120);
          updateCampClockUI(gameManager.getDayTimer(), gameManager.getCurrentDay());
        },
        'Tend Fire'
      );
      actionButtons.appendChild(tendFireButton);
    }

    // "Down" arrow to return to previous camp view
    const downButton = createIconButton(
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
    actionButtons.appendChild(downButton);
  }

  addDebugBanner('Fire view rendered!', 'orange', 170);

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
      showInsufficientFirewoodParchment();
    } else {
      // Deduct 10 firewood and show effect
      player.firewood = firewoodCount - 10;
      showFirewoodEffect(10);
      // Then show instructions to start minigame
      showFireInstructions();
    }
  }

  // --- 2) Parchment for insufficient firewood ---
  function showInsufficientFirewoodParchment() {
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
      `You need 10 firewood to make a fire.\nHead into the jungle and gather some more.`
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
  function showFireInstructions() {
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
      `Make Fire:\nTap when the ember is glowing on top of each ring in order until all 5 rings are lit.\n\n(Ends cost 5 minutes and 10 firewood.)`
    );

    parchment.appendChild(text);
    overlay.appendChild(parchment);
    document.body.appendChild(overlay);

    overlay.addEventListener('click', () => {
      overlay.remove();
      initFireGame();
    });
  }

  // --- 4) Initialize and run the Spiral Fire Challenge minigame ---
  function initFireGame() {
    // Do NOT deduct time or firewood here—instead do it at end of minigame.

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
        margin-top: 10px;
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
        speed: 0.02,
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
        ringEl.style.borderColor = '#8B4513';
        ringEl.style.background = 'rgba(139, 69, 19, 0.3)';
        ringEl.style.boxShadow = 'none';
        ringEl.style.transform = 'scale(1)';
      }

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

        const litEl = document.getElementById(`ring${gameState.currentRing}`);
        litEl.style.background = 'linear-gradient(45deg, #ff6b00, #ffd700)';
        litEl.style.borderColor = '#ffd700';
        litEl.style.boxShadow = '0 0 20px rgba(255, 140, 0, 0.9)';
        litEl.style.transform = 'scale(1.1)';

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
          speed: 0.02,
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
      updateGame();
    }

    // --- 6) After Victory: finalize fire build, persist state, and restore action buttons ---
    function finalizeFireBuild() {
      // Deduct 5 minutes (time cost of success)
      gameManager.deductTime(300);
      updateCampClockUI(gameManager.getDayTimer(), gameManager.getCurrentDay());

      // Set tribe fire value to 1
      const playerTribe = gameManager.getPlayerTribe();
      if (playerTribe) {
        playerTribe.fire = 1;
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

      // Switch background to fire1.png
      container.style.backgroundImage = "url('Assets/Minigame/fire1.png')";

      // Rebuild action row: clear and add Tend Fire + Down
      if (actionButtons) {
        clearChildren(actionButtons);

        const tendFireBtn = createIconButton(
          'Assets/Buttons/blank.png',
          'Tend Fire',
          () => {
            console.log('Tend Fire clicked');
            gameManager.deductTime(120);
            updateCampClockUI(
              gameManager.getDayTimer(),
              gameManager.getCurrentDay()
            );
          },
          'Tend Fire'
        );
        actionButtons.appendChild(tendFireBtn);

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
}