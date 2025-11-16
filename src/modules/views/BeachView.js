/**
 * @module BeachView
 * Renders the beach screen inside the Camp Phase
 */

import { createElement, clearChildren, addDebugBanner } from '../utils/index.js';
import { gameManager, screenManager } from '../core/index.js';

/* ⭐ NEW IMPORTS FOR NPC ICON SYSTEM -------------------------------- */
import npcLocationSystem from "../systems/NpcLocationSystem.js";
import { createNpcIcon } from "../ui/NpcIcon.js";
/* ------------------------------------------------------------------- */

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

  /* ⭐ NEW NPC RENDERING LOGIC -------------------------------------- */
  renderNPCsAtBeach(container);
  /* ---------------------------------------------------------------- */

  // --- Action Bar Buttons ---
  const actionButtons = document.getElementById('action-buttons');
  if (actionButtons) {
    clearChildren(actionButtons);

    actionButtons.style.justifyContent = 'center';
    actionButtons.style.gap = '20px';
    actionButtons.style.padding = '0'; // No extra side padding

    const createIconButton = (src, alt, onClick) => {
      const wrapper = createElement('div', {
        style: `
          width: 240px;
          height: 135px;
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
      if (onClick) wrapper.addEventListener('click', onClick);
      return wrapper;
    };

    const upButton = createIconButton('Assets/Buttons/up.png', 'Up', () => {
      console.log('Up button clicked - going to Rocky Shore');
      window.campScreen.loadView('rocky');
    });

    const blankButton = createIconButton('Assets/Buttons/blank.png', 'Blank', () => {
      console.log('Blank button clicked - going to Fishing');
      window.campScreen.loadView('fishing');
    });

    const rightButton = createIconButton('Assets/Buttons/right.png', 'Right', () => {
      console.log('Right button clicked - returning to Tribe Flag');
      window.campScreen.loadView('flag');
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
  const survivorsHere = npcLocationSystem.getSurvivorsAtLocation("BeachView");

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