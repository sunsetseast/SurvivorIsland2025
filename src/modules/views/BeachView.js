/**
 * @module BeachView
 * Renders the beach screen inside the Camp Phase
 */

import { createElement, clearChildren, addDebugBanner } from '../utils/index.js';
import { openIdolHuntOptions } from '../ui/IdolHuntOverlay.js';
import { LocationKeys } from '../core/LocationKeys.js';

/* ⭐ NEW IMPORTS FOR NPC ICON SYSTEM -------------------------------- */
import npcLocationSystem from "../systems/NpcLocationSystem.js";
import { createNpcIcon } from "../ui/NpcIcon.js";
/* ------------------------------------------------------------------- */

function loadCampView(locationKey) {
  if (window.campScreen?.loadView) {
    return window.campScreen.loadView(locationKey);
  }
  console.warn('[BeachView] Unable to load camp view', { locationKey });
}

export default function renderBeach(container) {
  console.log('renderBeach() called');
  addDebugBanner('renderBeach() called', 'skyblue', 40);

  clearChildren(container);

  container.style.backgroundImage = "url('Assets/Screens/beach.png')";
  container.style.backgroundSize = 'cover';
  container.style.backgroundPosition = 'center';
  container.style.backgroundRepeat = 'no-repeat';

  const wrapper = createElement('div', {
    className: 'beach-wrapper',
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
    style: `
      color: white;
      text-shadow: 2px 2px 4px black;
      font-size: 1.8rem;
      font-family: 'Survivant', sans-serif;
      text-align: center;
      padding: 20px;
      z-index: 2;
    `
  }, 'Welcome to the Beach! Chill, fish, and bond with your tribe.');

  wrapper.appendChild(message);
  container.appendChild(wrapper);

  const actionPopup = createElement('div', {
    id: 'beach-action-popup',
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
    id: 'beach-action-content',
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
  }, 'Beach Actions:');

  const fishingButton = createElement('button', {
    className: 'rect-button alt'
  }, 'Go Fishing');

  fishingButton.addEventListener('click', () => {
    actionPopup.style.display = 'none';
    loadCampView(LocationKeys.FISHING);
  });

  const huntButton = createElement('button', {
    className: 'rect-button alt'
  }, 'Hunt for an Idol');

  huntButton.addEventListener('click', () => {
    actionPopup.style.display = 'none';
    openIdolHuntOptions(container, LocationKeys.BEACH);
  });

  popupContent.appendChild(popupTitle);
  popupContent.appendChild(fishingButton);
  popupContent.appendChild(huntButton);
  actionPopup.appendChild(popupContent);
  container.appendChild(actionPopup);

  actionPopup.addEventListener('click', (event) => {
    if (event.target === actionPopup) {
      actionPopup.style.display = 'none';
    }
  });

  /* ⭐ NEW NPC RENDERING LOGIC -------------------------------------- */
  renderNPCsAtBeach(container);
  /* ---------------------------------------------------------------- */

  // --- Action Bar Buttons ---
  const actionButtons = document.getElementById('action-buttons');
  if (actionButtons) {
    clearChildren(actionButtons);
    actionButtons.style.display = 'flex';

    const createIconButton = (src, alt, onClick) => {
      const wrapper = createElement('div', {
        style: `
          width: 140px;
          height: 70px;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          cursor: pointer;
        `
      });

      const image = createElement('img', {
        src,
        alt,
        style: `
          max-width: 100%;
          max-height: 100%;
          width: auto;
          height: auto;
          display: block;
          object-fit: contain;
          pointer-events: none;
        `
      });

      wrapper.appendChild(image);
      if (onClick) wrapper.addEventListener('click', onClick);
      return wrapper;
    };

    const upButton = createIconButton('Assets/Buttons/up.png', 'Up', () => {
      console.log('Up button clicked - going to Rocky Shore');
      loadCampView(LocationKeys.ROCKY_SHORE);
    });

    const blankButton = createIconButton('Assets/Buttons/blank.png', 'Blank', () => {
      actionPopup.style.display = actionPopup.style.display === 'none' ? 'flex' : 'none';
    });

    const rightButton = createIconButton('Assets/Buttons/right.png', 'Right', () => {
      console.log('Right button clicked - returning to Tribe Flag');
      loadCampView(LocationKeys.TRIBE_FLAG);
    });

    actionButtons.appendChild(upButton);
    actionButtons.appendChild(blankButton);
    actionButtons.appendChild(rightButton);
  }

  addDebugBanner('Beach view rendered!', 'deepskyblue', 170);
}

/* ⭐⭐ NEW FUNCTION ADDED: Renders NPC Icons for BeachView ----------- */
function renderNPCsAtBeach(container) {
  // Remove old NPC container if it exists
  const old = container.querySelector(".npc-icon-container");
  if (old) old.remove();

  const npcContainer = document.createElement("div");
  npcContainer.classList.add("npc-icon-container");

  // Fetch survivors located at BeachView
  let survivorsHere = [];
  try {
    survivorsHere = npcLocationSystem?.getSurvivorsAtLocation?.(LocationKeys.BEACH) || [];
  } catch (e) {
    console.warn('[BeachView] NPC render failed', e);
    survivorsHere = [];
  }

  survivorsHere.forEach(survivor => {
    const icon = createNpcIcon(survivor, () => {
      console.log("Clicked NPC:", survivor.name);
      // TODO: Launch conversation UI
      // conversationUI.startConversation(survivor);
    });
    npcContainer.appendChild(icon);
  });

  container.appendChild(npcContainer);
}
/* ------------------------------------------------------------------- */
