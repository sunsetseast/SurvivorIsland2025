/**
 * @module CampfireView
 * Renders the campfire screen inside the Camp Phase,
 * with a fading message similar to JungleTrailView.
 */

import { createElement, clearChildren, addDebugBanner } from '../utils/index.js';
import { gameManager } from '../core/index.js';
import { openIdolHuntOptions } from '../ui/IdolHuntOverlay.js';
import { LocationKeys } from '../core/LocationKeys.js';

/* ⭐ NEW IMPORTS FOR NPC SYSTEM ----------------------------------- */
import npcLocationSystem from "../systems/NpcLocationSystem.js";
import { createNpcIcon } from "../ui/NpcIcon.js";
/* ---------------------------------------------------------------- */

function loadCampView(locationKey) {
  if (window.campScreen?.loadView) {
    return window.campScreen.loadView(locationKey);
  }
  console.warn('[CampfireView] Unable to load camp view', { locationKey });
}

export default function renderCampfire(container) {
  console.log('renderCampfire() called');
  addDebugBanner('renderCampfire() called', 'orangered', 40);

  clearChildren(container);

  // Get player's tribe fire value to determine background
  const playerTribe = gameManager.getPlayerTribe();
  const tribeFireValue = playerTribe ? playerTribe.fire : 0;

  // Use different backgrounds based on fire level
  let backgroundImage;
  if (tribeFireValue >= 3) {
    backgroundImage = "url('Assets/Screens/fire4.png')";
  } else if (tribeFireValue >= 2) {
    backgroundImage = "url('Assets/Screens/fire3.png')";
  } else if (tribeFireValue >= 1) {
    backgroundImage = "url('Assets/Screens/fire2.png')";
  } else {
    backgroundImage = "url('Assets/Screens/fire1.png')";
  }

  container.style.backgroundImage = backgroundImage;
  container.style.backgroundSize = 'cover';
  container.style.backgroundPosition = 'center';
  container.style.backgroundRepeat = 'no-repeat';

  // Wrapper around the message
  const wrapper = createElement('div', {
    className: 'campfire-wrapper',
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

  // Message with fade-out styling
  const message = createElement('div', {
    id: 'campfire-message',
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
  }, 'Welcome to the Campfire. Warm up and plan your next move.');

  wrapper.appendChild(message);
  container.appendChild(wrapper);
  if (playerTribe) {
    ensureCampfireStockpileBanner(wrapper, playerTribe);
  }

  const actionPopup = createElement('div', {
    id: 'campfire-action-popup',
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
    id: 'campfire-action-content',
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
  }, 'Campfire Actions:');

  const fireButton = createElement('button', { className: 'rect-button alt' }, 'Tend the Fire');
  fireButton.addEventListener('click', () => {
    actionPopup.style.display = 'none';
    loadCampView(LocationKeys.FIRE);
  });

  const huntButton = createElement('button', { className: 'rect-button alt' }, 'Hunt for an Idol');
  huntButton.addEventListener('click', () => {
    actionPopup.style.display = 'none';
    openIdolHuntOptions(container, LocationKeys.CAMPFIRE);
  });

  popupContent.appendChild(popupTitle);
  popupContent.appendChild(fireButton);
  popupContent.appendChild(huntButton);
  actionPopup.appendChild(popupContent);
  container.appendChild(actionPopup);

  actionPopup.addEventListener('click', (event) => {
    if (event.target === actionPopup) {
      actionPopup.style.display = 'none';
    }
  });

  /* ⭐ NEW NPC RENDERING CALL ------------------------------------- */
  try {
    renderNPCsAtCampfire(container);
  } catch (error) {
    console.warn('[CampfireView] NPC render crashed', error);
  }
  /* -------------------------------------------------------------- */

  // Fade out after 3 seconds
  setTimeout(() => {
    const msgEl = document.getElementById('campfire-message');
    if (msgEl) {
      msgEl.style.opacity = '0';
    }
  }, 3000);

  // Remove message after fade
  setTimeout(() => {
    const msgEl = document.getElementById('campfire-message');
    if (msgEl) {
      msgEl.remove();
    }
  }, 4000);

  // --- Action Bar Buttons ---
  const actionButtons = document.getElementById('action-buttons');
  if (actionButtons) {
    clearChildren(actionButtons);
    actionButtons.style.display = 'flex';

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
      if (onClick) {
        wrapper.addEventListener('click', onClick);
      }
      return wrapper;
    };

  const upButton = createIconButton('Assets/Buttons/up.png', 'Up', () => {
    console.log('Up button clicked - returning to Tribe Flag');
    loadCampView(LocationKeys.TRIBE_FLAG);
  });

    const blankButton = createIconButton('Assets/Buttons/blank.png', 'Blank', () => {
      actionPopup.style.display = actionPopup.style.display === 'none' ? 'flex' : 'none';
    });

  const downButton = createIconButton('Assets/Buttons/down.png', 'Down', () => {
    console.log('Down button clicked - loading Shelter');
    loadCampView(LocationKeys.SHELTER);
  });

    actionButtons.appendChild(upButton);
    actionButtons.appendChild(blankButton);
    actionButtons.appendChild(downButton);
  }

  addDebugBanner('Campfire view rendered!', 'orangered', 170);
}

function ensureCampfireStockpileBanner(container, tribe) {
  if (!container || !tribe) return;
  const existing = container.querySelector('#campfire-stockpile-banner');
  const stockpile = gameManager.ensureStockpileExists?.(tribe) || {};
  const firewoodCount = stockpile.firewood || 0;

  if (existing) {
    const firewoodEl = existing.querySelector('.stockpile-count-firewood');
    if (firewoodEl) firewoodEl.textContent = firewoodCount;
    return;
  }

  const banner = createElement('div', {
    id: 'campfire-stockpile-banner',
    style: `
      position: absolute;
      left: 50%;
      transform: translateX(-50%);
      bottom: 120px;
      background: rgba(0,0,0,0.55);
      color: #fff8e7;
      padding: 10px 14px;
      border-radius: 10px;
      font-family: 'Survivant', serif;
      font-size: 14px;
      box-shadow: 0 2px 12px rgba(0,0,0,0.35);
      z-index: 120;
      display: flex;
      flex-direction: column;
      gap: 6px;
    `
  });

  const title = createElement('div', {
    style: `
      text-align: center;
      width: 100%;
      color: #f5f5dc;
      text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.8);
      letter-spacing: 0.3px;
    `
  }, 'Tribe Stockpile');

  const row = createElement('div', {
    style: `
      display: flex;
      align-items: center;
      gap: 10px;
      justify-content: center;
    `
  });

  const item = createElement('div', {
    className: 'stockpile-item',
    style: `
      display: flex;
      align-items: center;
      gap: 6px;
    `
  });

  const icon = createElement('img', {
    src: 'Assets/Minigame/firewoodButton.png',
    alt: 'Firewood stockpile',
    style: `
      width: 28px;
      height: 28px;
      object-fit: contain;
      filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.7));
    `
  });

  const countEl = createElement('span', {
    className: 'stockpile-count-firewood',
    style: `
      color: #f5f5dc;
      font-family: 'Survivant', serif;
      font-size: 16px;
      text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.8);
      display: inline-block;
      min-width: 14px;
      text-align: center;
    `
  }, firewoodCount);

  item.appendChild(icon);
  item.appendChild(countEl);
  row.appendChild(item);

  banner.appendChild(title);
  banner.appendChild(row);
  container.appendChild(banner);
}

/* ⭐⭐ NEW FUNCTION — RENDER NPC ICONS FOR CAMPFIRE ---------------- */
function renderNPCsAtCampfire(container) {
  // Remove old NPC container
  const old = container.querySelector(".npc-icon-container");
  if (old) old.remove();

  // Create fresh icon container
  const npcContainer = document.createElement("div");
  npcContainer.classList.add("npc-icon-container");

  // Get NPCs located at CampfireView
  let survivorsHere = [];
  try {
    survivorsHere = npcLocationSystem?.getSurvivorsAtLocation?.(LocationKeys.CAMPFIRE) || [];
  } catch (e) {
    console.warn('[CampfireView] NPC render failed', e);
    survivorsHere = [];
  }

  survivorsHere.forEach(survivor => {
    const icon = createNpcIcon(survivor, () => {
      console.log("Clicked NPC:", survivor.name);
      // TODO: conversationUI.startConversation(survivor);
    });

    npcContainer.appendChild(icon);
  });

  container.appendChild(npcContainer);
}
/* ---------------------------------------------------------------- */
