/**
 * @module FishingView
 * Spear fishing mini-game with action bar integration (finalized with spear animation)
 */
import { createElement, clearChildren, addDebugBanner } from '../utils/index.js';
import { gameManager } from '../core/index.js';
import { updateCampClockUI } from '../utils/ClockUtils.js';
import activityTracker from '../utils/ActivityTracker.js';

export default function renderFishingView(container) {
  console.log('renderFishingView() called');
  addDebugBanner('renderFishingView() called', 'blue', 40);

  clearChildren(container);
  container.style.backgroundImage = "url('Assets/water-bg.png')";
  container.style.backgroundSize = 'cover';
  container.style.backgroundPosition = 'center';
  container.style.backgroundRepeat = 'no-repeat';
  container.style.position = 'relative';

  // === PULSE KEYFRAMES (ensure aim circle pulses) ===
  const styleEl = document.createElement('style');
  styleEl.textContent = `
    @keyframes pulse {
      0%, 100% {
        transform: scale(1);
        opacity: 0.8;
      }
      50% {
        transform: scale(1.1);
        opacity: 1;
      }
    }
    @keyframes float {
      0% {
        transform: translateY(100vh) rotate(0deg);
        opacity: 0;
      }
      10% {
        opacity: 1;
      }
      90% {
        opacity: 1;
      }
      100% {
        transform: translateY(-100px) rotate(360deg);
        opacity: 0;
      }
    }
    @keyframes hitPing {
      0%   { transform: translateY(0) scale(1); opacity: 1; }
      100% { transform: translateY(-40px) scale(1.3); opacity: 0; }
    }
    /* ─── Insert into your existing <style> block ─── */
    @keyframes spearPulse {
      0%, 100% {
        transform: translateY(0);
      }
      50% {
        transform: translateY(-10px);
      }
    }
  `;
  document.head.appendChild(styleEl);

  // === BUBBLE OVERLAY ANIMATION ===
  const bubbleConfigs = [
    { left: '10%', width:  '20px', height: '20px', delay: '0s' },
    { left: '20%', width:  '15px', height: '15px', delay: '2s' },
    { left: '40%', width:  '25px', height: '25px', delay: '4s' },
    { left: '60%', width:  '18px', height: '18px', delay: '1s' },
    { left: '80%', width:  '22px', height: '22px', delay: '3s' },
    { left: '90%', width:  '16px', height: '16px', delay: '5s' }
  ];
  bubbleConfigs.forEach(cfg => {
    const bubble = createElement('div', {
      className: 'bubble',
      style: `
        position: absolute;
        left: ${cfg.left};
        width: ${cfg.width};
        height: ${cfg.height};
        animation: float 8s infinite linear;
        animation-delay: ${cfg.delay};
        background: rgba(255, 255, 255, 0.1);
        border-radius: 50%;
        pointer-events: none;
        z-index: 1;
      `
    });
    container.appendChild(bubble);
  });

  // === AIM CIRCLE ===
  const aimCircle = createElement('div', {
    id: 'aimCircle',
    style: `
      position: absolute;
      border: 3px solid #ff6b35;
      border-radius: 50%;
      width: 80px;
      height: 80px;
      pointer-events: none;
      display: none;
      animation: pulse 1s infinite;
      transform-origin: center center;
      z-index: 50;
    `
  });
  container.appendChild(aimCircle);

  // === SPEAR IMAGE (initially hidden) ===
  const spear = createElement('img', {
    src: 'Assets/Minigame/fishingSpear.png',
    alt: 'Spear',
    style: `
      position: absolute;
      width: 40px;
      height: auto;
      display: none;
      z-index: 55;
      pointer-events: none;
    `
  });
  container.appendChild(spear);

  // === RESULT POPUP (PARCHMENT) ===
  const popup = createElement('div', {
    id: 'result-popup',
    style: `
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 320px;
      height: 220px;
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
      cursor: pointer;
    `
  });
  // Popup header
  const popupHeader = createElement('div', {
    style: `
      font-size: 28px;
      font-weight: bold;
      margin-bottom: 8px;
      color: white;
      text-shadow: 1px 1px 2px black;
      font-family: 'Survivant', serif;
    `
  }, '🎣 Fishing:');
  popup.appendChild(popupHeader);

  // Popup message (initial instructions or catch result)
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
      text-align: center;
    `
  }, 'Tap anywhere to start fishing.');
  popup.appendChild(popupMessage);

  // Popup subtext about time deduction
  const popupSubtext = createElement('div', {
    style: `
      font-size: 16px;
      font-weight: bold;
      margin-top: 8px;
      color: white;
      text-shadow: 1px 1px 2px black;
      font-family: 'Survivant', serif;
    `
  });
  popupSubtext.innerHTML = `Fishing deducts<br><span style="color: #dc2626;">5 minutes</span> per attempt.`;
  popup.appendChild(popupSubtext);

  container.appendChild(popup);

  // === TAP AREA ===
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
  container.appendChild(tapArea);

  // === ACTION BAR BUTTONS ===
  // === ACTION BAR BUTTONS ===
  const actionButtons = document.getElementById('action-buttons');
  if (actionButtons) {
    clearChildren(actionButtons);
    actionButtons.style.justifyContent = 'center';
    actionButtons.style.gap = '20px';
    actionButtons.style.padding = '0';

    const downButton = createElement('div', {
      style: `
        width: 120px;
        height: 100px;
        display: inline-block;
        position: relative;
        cursor: pointer;
        overflow: hidden;
      `
    });
    const downImg = createElement('img', {
      src: 'Assets/Buttons/down.png',
      alt: 'Down',
      style: `
        width: 100%;
        height: 100%;
        object-fit: contain;
        pointer-events: none;
      `
    });
    downButton.appendChild(downImg);

    downButton.addEventListener('click', () => {
      // ——— CLEANUP FISHING LOGIC ———
      gameState = 'ended';            // stop any further spawning
      aimSet = false;                 // prevent clicks from setting aim
      tapArea.style.display = 'none'; // hide tap area
      aimCircle.style.display = 'none';
      spear.style.display = 'none';

      // cancel and remove any fish still on screen
      if (currentFish) {
        if (currentFish.animation) {
          currentFish.animation.cancel();
        }
        currentFish.remove();
        currentFish = null;
      }

      // clear any pending spawn timers
      if (spawnTimer) {
        clearTimeout(spawnTimer);
        spawnTimer = null;
      }

      // ——— SWITCH VIEW ———
      if (window.campScreen && typeof window.campScreen.loadView === 'function') {
        window.campScreen.loadView('beach');
      }
    });

    actionButtons.appendChild(downButton);
  }

  // === GAME STATE VARIABLES ===
  let gameState = 'ready';      // 'ready' = showing instructions, 'playing' = aiming/fishing
  let aimSet = false;
  let currentFish = null;
  let spawnTimer = null;

  // Weighted probabilities for fish types: fish1 (common), fish2 (uncommon), fish3 (rare)
  const fishWeights = [
    { type: 1, weight: 60 },
    { type: 2, weight: 30 },
    { type: 3, weight: 10 }
  ];
  function chooseFishType() {
    const total = fishWeights.reduce((sum, fw) => sum + fw.weight, 0);
    let rand = Math.random() * total;
    for (const fw of fishWeights) {
      rand -= fw.weight;
      if (rand <= 0) return fw.type;
    }
    return fishWeights[fishWeights.length - 1].type;
  }

  // === EVENT HANDLERS ===
  container.addEventListener('click', (e) => {
    // Ignore action bar clicks
    if (e.target.closest('#action-buttons')) return;

    // If result popup is visible, ignore container clicks
    if (popup.style.display === 'flex' || popup.style.display === 'block') {
      return;
    }

    if (gameState === 'ready') {
      // First tap: hide instructions, start fishing
      popup.style.display = 'none';
      startFishing();
      return;
    }

    // Now in 'playing' state
    const rect = container.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (!aimSet) {
      setAim(x, y);
    } else {
      attemptCatch();
    }
  });

  // Popup click: hides it and either starts fishing (initial) or resets for next round (result)
  popup.addEventListener('click', (e) => {
    e.stopPropagation();
    popup.style.display = 'none';
    if (gameState === 'ready') {
      startFishing();
    } else {
      // After showing catch result, reset aim for next round
      aimCircle.style.display = 'none';
      aimSet = false;
      scheduleNextFish();
      // Hide spear when popup closes
      spear.style.display = 'none';
    }
  });

  // === GAME FUNCTIONS ===
  function startFishing() {
    gameState = 'playing';
    aimSet = false;
    // Show tap area so player can set aim
    tapArea.style.display = 'block';
    aimCircle.style.display = 'none';
    // Ensure spear is hidden initially
    spear.style.display = 'none';
  }

  function setAim(x, y) {
    aimCircle.style.left = `${x - 40}px`;
    aimCircle.style.top = `${y - 40}px`;
    aimCircle.style.display = 'block';
    aimSet = true;

    // Position spear so prongs peek just above action bar, directly under aim circle
    const spearWidth = 40; // must match CSS
    const spearLeft = x - spearWidth / 2;
    spear.style.left = `${spearLeft}px`;

    // Determine action bar top relative to container
    let actionTopRelative = container.getBoundingClientRect().height;
    if (actionButtons) {
      const abRect = actionButtons.getBoundingClientRect();
      const contRect = container.getBoundingClientRect();
      actionTopRelative = abRect.top - contRect.top;
    }
    const visibleTip = 10; // px of prong that’s visible
    spear.style.top = `${actionTopRelative - visibleTip - 20}px`;
    spear.style.display = 'block';
    // Pulse the spear up and down while aim is set:
    spear.style.animation = 'spearPulse 1.2s infinite ease-in-out';

    // Begin spawning fish continuously
    scheduleNextFish();
  }

  function scheduleNextFish() {
    // Clear any existing timer
    if (spawnTimer) {
      clearTimeout(spawnTimer);
      spawnTimer = null;
    }
    if (!aimSet || gameState !== 'playing') return;
    // Random delay between 1s and 3s before next fish appears
    const delay = 1000 + Math.random() * 2000;
    spawnTimer = setTimeout(() => {
      spawnFish();
    }, delay);
  }

  function spawnFish() {
    if (!aimSet || gameState !== 'playing') return;
    // If a fish is already on screen, do not spawn another
    if (currentFish) return;

    // Choose fish type by weighted probability
    const fishType = chooseFishType();
    const fish = createElement('img', {
      className: 'fish',
      src: `Assets/Resources/fish${fishType}.png`,
      alt: `Fish${fishType}`,
      style: `
        position: absolute;
        width: 60px;
        height: 40px;
        cursor: pointer;
        z-index: 75;
        pointer-events: none;
      `
    });
    container.appendChild(fish);
    currentFish = fish;

    // Random spawn side and end coordinates
    const side = Math.floor(Math.random() * 4);
    let startX, startY, endX, endY;
    const w = window.innerWidth;
    const h = window.innerHeight;

    switch (side) {
      case 0: // Left → Right
        startX = -80;
        startY = Math.random() * (h - 200) + 100;
        endX = w + 80;
        endY = Math.random() * (h - 200) + 100;
        break;
      case 1: // Right → Left
        startX = w + 80;
        startY = Math.random() * (h - 200) + 100;
        endX = -80;
        endY = Math.random() * (h - 200) + 100;
        break;
      case 2: // Top → Bottom
        startX = Math.random() * (w - 200) + 100;
        startY = -60;
        endX = Math.random() * (w - 200) + 100;
        endY = h + 60;
        break;
      default: // Bottom → Top
        startX = Math.random() * (w - 200) + 100;
        startY = h + 60;
        endX = Math.random() * (w - 200) + 100;
        endY = -60;
        break;
    }
    fish.style.left = `${startX}px`;
    fish.style.top = `${startY}px`;

    // Animate fish across the screen and save the Animation object:
    const duration = 4000 + Math.random() * 3000;
    const anim = fish.animate(
      [
        { left: `${startX}px`, top: `${startY}px` },
        { left: `${endX}px`,   top: `${endY}px`   }
      ],
      {
        duration: duration,
        easing: 'linear'
      }
    );

    // Store the Animation instance on the element and on currentFish
    fish.animation = anim;
    currentFish.animation = anim;

    anim.onfinish = () => {
      // Only remove if it wasn’t caught already
      if (currentFish === fish && gameState === 'playing') {
        fish.remove();
        currentFish = null;
        scheduleNextFish();
      }
    };
  }

  function calculateOverlap() {
    if (!currentFish) return 0;
    const circleRect = aimCircle.getBoundingClientRect();
    const fishRect = currentFish.getBoundingClientRect();

    const circleCenterX = circleRect.left + circleRect.width / 2;
    const circleCenterY = circleRect.top + circleRect.height / 2;
    const fishCenterX = fishRect.left + fishRect.width / 2;
    const fishCenterY = fishRect.top + fishRect.height / 2;

    const distance = Math.hypot(
      circleCenterX - fishCenterX,
      circleCenterY - fishCenterY
    );

    const circleRadius = 40;
    const fishRadius = 30;

    if (distance >= circleRadius + fishRadius) return 0;
    if (distance <= Math.abs(circleRadius - fishRadius)) return 1;
    return (circleRadius + fishRadius - distance) / (2 * Math.min(circleRadius, fishRadius));
  }

  function attemptCatch() {
    // Stop pulsing so the spear can shoot straight up:
    spear.style.animation = 'none';

    // If no fish is on screen, it’s an immediate miss:
    if (!currentFish) {
      missCatch();
      return;
    }

    // Determine overlap and catch chance (but don't call catchFish/missCatch yet):
    const overlap     = calculateOverlap();
    const catchChance = Math.min(overlap * 2, 0.95);
    const isCatch     = (Math.random() < catchChance);

    // Compute circleCenterY while the aim circle is still visible:
    const circleRect    = aimCircle.getBoundingClientRect();
    const contRect      = container.getBoundingClientRect();
    const circleCenterY = (circleRect.top - contRect.top) + (circleRect.height / 2);

    // Calculate spear's displayed height (CSS width is 40px):
    const naturalHeight = spear.naturalHeight || 0;
    const naturalWidth  = spear.naturalWidth  || 1; // avoid division by zero
    const spearHeight   = (naturalHeight / naturalWidth) * 40;

    // Starting top (where spear currently sits):
    const startY = parseFloat(spear.style.top);

    // Choose finalTop based on hit or miss:
    let finalTop;
    if (isCatch) {
      // On a catch, spear's top lands at the circle center
      finalTop = circleCenterY;
    } else {
      // On a miss, spear goes off-screen
      finalTop = -spearHeight;
    }

    // Animate spear from startY → finalTop over ~30 frames
    const frameCount = 30;
    let frame = 0;

    function animateSpear() {
      frame++;
      const progress = frame / frameCount;
      const newY = startY + (finalTop - startY) * progress;
      spear.style.top = `${newY}px`;

      if (frame < frameCount) {
        requestAnimationFrame(animateSpear);
      } else {
        // Once animation finishes, wait an extra 500ms before showing the parchment:
        setTimeout(() => {
          if (isCatch) {
            catchFish();
          } else {
            missCatch();
          }
        }, 500);
      }
    }    requestAnimationFrame(animateSpear);
  }

  function catchFish() {
    // 1) If a fish exists, compute its current on‐screen position and cancel its WAAPI animation
    if (currentFish) {
      const fishRect      = currentFish.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();

      // Calculate fish's coordinates relative to the container
      const relLeft = fishRect.left - containerRect.left;
      const relTop  = fishRect.top  - containerRect.top;

      // Cancel the Web Animations API animation so it stops moving
      if (currentFish.animation) {
        currentFish.animation.cancel();
      }

      // Explicitly "freeze" the fish in place by setting its inline styles
      currentFish.style.left = `${relLeft}px`;
      currentFish.style.top  = `${relTop}px`;
    }

    // 2) Determine fish type based on the image filename
    let fishType = 'fish1';
    let fishDescription = 'You caught 1 small fish.';
    const src = currentFish.getAttribute('src');
    if (src.includes('fish2.png')) {
      fishType = 'fish2';
      fishDescription = 'You caught 1 medium fish.';
    }
    if (src.includes('fish3.png')) {
      fishType = 'fish3';
      fishDescription = 'You caught 1 large fish.';
    }

    // 3) Update player inventory with specific fish type (always +1)
    const player = gameManager.getPlayerSurvivor();
    if (player) {
      // Initialize fish properties if they don't exist
      if (!player.fish1) player.fish1 = 0;
      if (!player.fish2) player.fish2 = 0;
      if (!player.fish3) player.fish3 = 0;
      
      // Update the specific fish type
      if (fishType === 'fish1') {
        player.fish1 += 1;
      } else if (fishType === 'fish2') {
        player.fish2 += 1;
      } else if (fishType === 'fish3') {
        player.fish3 += 1;
      }
      
      // Update total fish count
      gameManager.updateSurvivorTotalFish(player);
      
      console.log(`Player now has ${player.fish} total fish (${player.fish1} fish1, ${player.fish2} fish2, ${player.fish3} fish3).`);
    }

    // 4) Track successful fishing attempt
    activityTracker.trackFishingAttempt(true, 1, fishType);

    // 5) Show the +1 fish animation effect
    if (currentFish) {
      showFishEffect(fishType, currentFish);
    }

    // 6) After a short delay (to let the freeze be visible), remove the fish element
    setTimeout(() => {
      if (currentFish) {
        currentFish.remove();
        currentFish = null;
      }
    }, 300); // 300ms delay before removal—adjust if needed

    // 7) Deduct 5 minutes (= 300 seconds) from camp clock, then update UI
    gameManager.deductTime(300);
    updateCampClockUI(
      gameManager.getDayTimer(),
      gameManager.getCurrentDay()
    );

    // 8) Display the result parchment (catch)
    popupMessage.textContent = fishDescription;
    popup.style.display = 'flex';

    // 9) Stop spawning new fish until the player closes the popup
    aimCircle.style.display = 'none';
  }

  function missCatch() {
    // Remove fish if still present
    if (currentFish) {
      currentFish.remove();
      currentFish = null;
    }
    // Deduct time
    gameManager.deductTime(300);
    updateCampClockUI(
      gameManager.getDayTimer(),
      gameManager.getCurrentDay()
    );
    // Show miss popup
    popupMessage.textContent = `You missed.`;
    popup.style.display = 'flex';
    aimCircle.style.display = 'none';
  }

  function showFishEffect(fishType, fishEl) {
    // Position effect near where fish was caught
    const fishRect = fishEl.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const topPos = fishRect.top - containerRect.top + 10;
    const leftPos = fishRect.left - containerRect.left + 10;

    const effect = createElement('div', {
      className: 'fish-effect',
      style: `
        position: absolute;
        left: ${leftPos}px;
        top: ${topPos}px;
        font-size: 26px;
        font-weight: bold;
        color: #16a085;
        pointer-events: none;
        z-index: 20;
        display: flex;
        align-items: center;
        gap: 8px;
        animation: hitPing 0.8s ease-out;
      `
    });
    const plusText = createElement('span', {}, '+1');
    const icon = createElement('img', {
      src: `Assets/Resources/${fishType}.png`,
      alt: 'FishIcon',
      style: `
        height: 28px;
        width: auto;
        display: inline-block;
      `
    });
    effect.appendChild(plusText);
    effect.appendChild(icon);
    container.appendChild(effect);

    setTimeout(() => effect.remove(), 800);
  }
    
}