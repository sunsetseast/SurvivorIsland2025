/**
 * @module WaterWellView
 * Renders the water well screen inside the Camp Phase
 */
import { createElement, clearChildren, addDebugBanner } from '../utils/index.js';
import { gameManager } from '../core/index.js';
import { updateCampClockUI } from '../utils/ClockUtils.js';
import { MAX_WATER } from '../data/GameData.js';
import activityTracker from '../utils/ActivityTracker.js';

/* ⭐ NPC SYSTEM IMPORTS ---------------------------------------- */
import npcLocationSystem from "../systems/NpcLocationSystem.js";
import { createNpcIcon } from "../ui/NpcIcon.js";
/* ------------------------------------------------------------- */

export default function renderWaterWell(container) {
  console.log('renderWaterWell() called');
  addDebugBanner('renderWaterWell() called', 'dodgerblue', 40);

  clearChildren(container);
  container.style.backgroundImage = "url('Assets/Screens/water-well.png')";
  container.style.backgroundSize = 'cover';
  container.style.backgroundPosition = 'center';
  container.style.backgroundRepeat = 'no-repeat';

  const wrapper = createElement('div', {
    className: 'waterwell-wrapper',
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

  const message = createElement('div', {
    id: 'water-well-message',
    style: `
      color: white;
      text-shadow: 2px 2px 4px black;
      font-size: 1.8rem;
      font-family: 'Survivant', sans-serif;
      text-align: center;
      padding: 20px;
      z-index: 2;
      opacity: 1;
      transition: opacity 1s ease;
    `
  }, 'You\'ve arrived at the Water Well. Stay hydrated and look for clues.');

  wrapper.appendChild(message);
  container.appendChild(wrapper);

  setTimeout(() => message.style.opacity = '0', 3000);
  setTimeout(() => message.remove(), 4000);

  /* ⭐ ADD NPC ICONS HERE -------------------------------------- */
  renderNPCsAtWaterWell(container);
  /* ------------------------------------------------------------ */

  function showWaterInfoPopup() {
    const infoPopup = createElement('div', {
      id: 'water-info-popup',
      style: `
        display: flex;
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background-color: rgba(0, 0, 0, 0.6);
        z-index: 1007;
        align-items: center;
        justify-content: center;
        cursor: pointer;
      `
    });

    const infoContent = createElement('div', {
      style: `
        width: 400px;
        height: 300px;
        background-image: url('Assets/parch-landscape.png');
        background-size: contain;
        background-position: center;
        background-repeat: no-repeat;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 40px;
        box-sizing: border-box;
      `
    });

    const infoText = createElement('div', {
      style: `
        color: white;
        font-family: 'Survivant', sans-serif;
        font-size: 1.2rem;
        text-align: center;
        text-shadow: 2px 2px 4px black;
        line-height: 1.4;
      `
    });
    infoText.innerHTML = 'Filling only your own canteen will deduct 5 minutes.<br>Filling for your entire tribe will deduct 5 minutes per tribe member.';

    infoContent.appendChild(infoText);
    infoPopup.appendChild(infoContent);
    container.appendChild(infoPopup);

    infoPopup.addEventListener('click', () => {
      infoPopup.remove();
      document.getElementById('water-popup').style.display = 'flex';
    });
  }

  const waterPopup = createElement('div', {
    id: 'water-popup',
    style: `
      display: none;
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background-color: rgba(0, 0, 0, 0.6);
      z-index: 1005;
      align-items: center;
      justify-content: center;
    `
  });

  const popupContent = createElement('div', {
    id: 'water-popup-content',
    style: `
      display: flex;
      flex-direction: column;
      align-items: center;
      background: none;
      padding: 20px;
      gap: 12px;
      z-index: 1006;
    `
  });

  const popupTitle = createElement('div', {
    style: `
      color: white;
      font-family: 'Survivant', sans-serif;
      font-size: 1.4rem;
    `
  }, 'Gather Water:');

  const forYourselfButton = createElement('button', { className: 'rect-button alt' }, 'For Yourself');
  const forTribeButton = createElement('button', { className: 'rect-button alt' }, 'For the Tribe');

  popupContent.appendChild(popupTitle);
  popupContent.appendChild(forYourselfButton);
  popupContent.appendChild(forTribeButton);
  waterPopup.appendChild(popupContent);
  container.appendChild(waterPopup);

  waterPopup.addEventListener('click', (e) => {
    const content = document.getElementById('water-popup-content');
    if (!content.contains(e.target)) {
      waterPopup.style.display = 'none';
    }
  });

  function flashClockRed() {
    const timerEl = document.getElementById('clock-time-text');
    if (timerEl) {
      timerEl.style.color = 'red';
      timerEl.style.transition = 'color 0.3s ease';
      setTimeout(() => { timerEl.style.color = '#2b190a'; }, 1000);
    }
  }

  function showWaterEffect(target) {
    const effect = createElement('div', {
      className: 'water-hit-effect',
      style: 'position: absolute; top: 45%; left: 50%; transform: translate(-50%, -50%); display: flex; align-items: center; gap: 6px; font-size: 28px; font-weight: bold; color: white; text-shadow: 2px 2px 4px black; z-index: 999;'
    });

    const plus = createElement('span', {}, '+100');
    const icon = createElement('img', {
      src: 'Assets/Resources/water.png',
      style: 'height: 28px; width: auto;'
    });

    effect.appendChild(plus);
    effect.appendChild(icon);
    target.appendChild(effect);

    setTimeout(() => effect.remove(), 2000);
  }

  function showTeamPlayerEffect(target, amount) {
    const effect = document.createElement('div');
    effect.className = 'team-player-hit-effect';
    effect.style.position = 'absolute';
    effect.style.left = '50%';
    effect.style.top = '58%';
    effect.style.transform = 'translate(-50%, -50%)';
    effect.style.fontSize = '28px';
    effect.style.fontWeight = 'bold';
    effect.style.color = '#10b981';
    effect.style.zIndex = '2000';
    effect.style.display = 'flex';
    effect.style.alignItems = 'center';
    effect.style.gap = '10px';
    effect.style.pointerEvents = 'none';
    effect.style.animation = 'teamPing 2.5s ease-out forwards';

    const plus = document.createElement('span');
    plus.textContent = `+${amount}`;

    const icon = document.createElement('img');
    icon.src = 'Assets/Resources/teamPlayer.png';
    icon.style.height = '28px';
    icon.style.width = 'auto';

    effect.appendChild(plus);
    effect.appendChild(icon);
    target.appendChild(effect);

    setTimeout(() => {
      effect.remove();
    }, 2500);
  }

  function showYourselfParchment() {
    const overlay = createElement('div', {
      id: 'yourself-parchment-overlay',
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
        padding: 30px;
        box-sizing: border-box;
        display: flex;
        align-items: center;
        justify-content: center;
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
    }, 'You fill your own canteen. The rest can fend for themselves.');

    parchment.appendChild(text);
    overlay.appendChild(parchment);
    container.appendChild(overlay);

    overlay.addEventListener('click', () => {
      overlay.remove();
    });
  }

  function showTribeParchment() {
    const overlay = createElement('div', {
      id: 'tribe-parchment-overlay',
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
        padding: 30px;
        box-sizing: border-box;
        display: flex;
        align-items: center;
        justify-content: center;
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
    }, 'You fill canteens for every tribe mate. This improves your standing in the tribe.');

    parchment.appendChild(text);
    overlay.appendChild(parchment);
    container.appendChild(overlay);

    overlay.addEventListener('click', () => {
      overlay.remove();
    });
  }

  forYourselfButton.addEventListener('click', () => {
    const player = gameManager.getPlayerSurvivor();
    if (!player) return;

    if ((player.water || 0) >= MAX_WATER) {
      console.log('Player already has max water.');
      waterPopup.style.display = 'none';
      return;
    }

    waterPopup.style.display = 'none';

    gameManager.deductTime(300);
    updateCampClockUI(gameManager.getDayTimer(), gameManager.getCurrentDay());
    flashClockRed();

    player.water = Math.min(MAX_WATER, (player.water || 0) + 100);

    activityTracker.trackWaterGathering(100, false);

    showWaterEffect(container);

    setTimeout(() => {
      showYourselfParchment();
    }, 500);
  });

  forTribeButton.addEventListener('click', () => {
    const tribe = gameManager.getPlayerTribe();
    const player = gameManager.getPlayerSurvivor();

    if (!tribe || !tribe.members || !player) return;

    const allFull = tribe.members.every(member => (member.water || 0) >= MAX_WATER);
    if (allFull) {
      console.log('All tribe members already have max water.');
      waterPopup.style.display = 'none';
      return;
    }

    waterPopup.style.display = 'none';

    const otherMembers = tribe.members.filter(m => m.id !== player.id);
    const otherMembersCount = otherMembers.length;

    const totalSeconds = tribe.members.length * 300;
    gameManager.deductTime(totalSeconds);
    updateCampClockUI(gameManager.getDayTimer(), gameManager.getCurrentDay());
    flashClockRed();

    tribe.members.forEach(member => {
      member.water = Math.min(MAX_WATER, (member.water || 0) + 100);
    });

    activityTracker.trackWaterGathering(100, true);

    if (otherMembersCount > 0) {
      if (typeof player.teamPlayer !== 'number') {
        player.teamPlayer = 50;
      }
      player.teamPlayer += otherMembersCount;

      import('../utils/MenuUtils.js').then(({ refreshMenuCard }) => {
        refreshMenuCard();
      });
    }

    showWaterEffect(container);

    if (otherMembersCount > 0) {
      setTimeout(() => {
        showTeamPlayerEffect(container, otherMembersCount);
      }, 300);
    }

    setTimeout(() => {
      showTribeParchment();
    }, 1000);
  });

  const actionButtons = document.getElementById('action-buttons');
  if (actionButtons) {
    clearChildren(actionButtons);
    actionButtons.style.display = 'flex';
    actionButtons.style.justifyContent = 'center';
    actionButtons.style.padding = '0';
    actionButtons.style.gap = '20px';

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
          object-fit: contain;
          pointer-events: none;
        `
      });

      wrapper.appendChild(image);
      if (onClick) wrapper.addEventListener('click', onClick);
      return wrapper;
    };

    const leftButton = createIconButton('Assets/Buttons/left.png', 'Left', () => {
      window.campScreen.loadView('waterfallTrail');
    });

    const centerButton = createIconButton('Assets/Buttons/blank.png', 'Center', () => {
      showWaterInfoPopup();
    });

    const rightButton = createIconButton('Assets/Buttons/right.png', 'Right', () => {
      window.previousCampView = 'waterWell';
      window.campScreen.loadView('jungleTrail');
    });

    actionButtons.appendChild(leftButton);
    actionButtons.appendChild(centerButton);
    actionButtons.appendChild(rightButton);
  }

  addDebugBanner('Water Well view rendered!', 'dodgerblue', 170);
}

/* ⭐⭐ NEW FUNCTION — RENDER NPC ICONS FOR WATER WELL ----------- */
function renderNPCsAtWaterWell(container) {
  const old = container.querySelector(".npc-icon-container");
  if (old) old.remove();

  const npcContainer = document.createElement("div");
  npcContainer.classList.add("npc-icon-container");

  const survivorsHere = npcLocationSystem.getSurvivorsAtLocation("WaterWellView");

  survivorsHere.forEach(survivor => {
    const icon = createNpcIcon(survivor, () => {
      console.log("Clicked NPC at Water Well:", survivor.name);
      // TODO: Dialogue system later
    });

    npcContainer.appendChild(icon);
  });

  container.appendChild(npcContainer);
}