/**
 * @module CampfireView
 * Renders the campfire screen inside the Camp Phase,
 * with a fading message similar to JungleTrailView.
 */

import { createElement, clearChildren, addDebugBanner } from '../utils/index.js';
import { gameManager } from '../core/index.js';

/* ⭐ NEW IMPORTS FOR NPC SYSTEM ----------------------------------- */
import npcLocationSystem from "../systems/NpcLocationSystem.js";
import { createNpcIcon } from "../ui/NpcIcon.js";
/* ---------------------------------------------------------------- */

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

  /* ⭐ NEW NPC RENDERING CALL ------------------------------------- */
  renderNPCsAtCampfire(container);
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

    actionButtons.style.justifyContent = 'center';
    actionButtons.style.gap = '20px';
    actionButtons.style.padding = '0';

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
      window.campScreen.loadView('flag');
    });

    const blankButton = createIconButton('Assets/Buttons/blank.png', 'Blank', () => {
      console.log('Blank button clicked - launching Fire view');
      window.previousCampView = 'campfire';
      window.campScreen.loadView('fire');
    });

    const downButton = createIconButton('Assets/Buttons/down.png', 'Down', () => {
      console.log('Down button clicked - loading Shelter');
      window.campScreen.loadView('shelter');
    });

    actionButtons.appendChild(upButton);
    actionButtons.appendChild(blankButton);
    actionButtons.appendChild(downButton);
  }

  addDebugBanner('Campfire view rendered!', 'orangered', 170);
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
  const survivorsHere = npcLocationSystem.getSurvivorsAtLocation("CampfireView");

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