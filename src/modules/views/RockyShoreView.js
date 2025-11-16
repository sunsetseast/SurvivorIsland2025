/**
 * @module RockyShoreView
 * Renders the rocky shore screen inside the Camp Phase
 */

import { createElement, clearChildren, addDebugBanner } from '../utils/index.js';
import { gameManager } from '../core/index.js';

/* ⭐ NEW IMPORTS FOR NPC SYSTEM ----------------------------------- */
import npcLocationSystem from "../systems/NpcLocationSystem.js";
import { createNpcIcon } from "../ui/NpcIcon.js";
/* ---------------------------------------------------------------- */

export default function renderRockyShore(container) {
  console.log('renderRockyShore() called');
  addDebugBanner('renderRockyShore() called', 'slategray', 40);

  clearChildren(container);

  container.style.backgroundImage = "url('Assets/Screens/rocky.png')";
  container.style.backgroundSize = 'cover';
  container.style.backgroundPosition = 'center';
  container.style.backgroundRepeat = 'no-repeat';

  const wrapper = createElement('div', {
    className: 'rocky-wrapper',
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
  }, 'You’ve reached the Rocky Shore. A quiet, reflective spot on the island.');

  wrapper.appendChild(message);
  container.appendChild(wrapper);

  /* ⭐ NEW NPC RENDERING CALL ------------------------------------- */
  renderNPCsAtRocky(container);
  /* -------------------------------------------------------------- */

  // --- Action Bar Buttons ---
  const actionButtons = document.getElementById('action-buttons');
  if (actionButtons) {
    clearChildren(actionButtons);

    actionButtons.style.justifyContent = 'center';
    actionButtons.style.padding = '0';

    const createIconButton = (src, alt, onClick) => {
      const wrapper = createElement('div', {
        style: `
          width: 140px;
          height: 80px;
          display: flex;
          justify-content: center;
          align-items: center;
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
        `
      });

      wrapper.appendChild(image);
      wrapper.addEventListener('click', onClick);
      return wrapper;
    };

    const downButton = createIconButton('Assets/Buttons/down.png', 'Down', () => {
      console.log('Down button clicked (return to Beach)');
      window.campScreen.loadView('beach');
    });

    actionButtons.appendChild(downButton);
  }

  addDebugBanner('Rocky Shore view rendered!', 'darkslategray', 170);
}


/* ⭐⭐ NEW FUNCTION — RENDER NPC ICONS FOR ROCKY SHORE ------------- */
function renderNPCsAtRocky(container) {
  // Remove old NPC container
  const old = container.querySelector(".npc-icon-container");
  if (old) old.remove();

  // Create fresh icon container
  const npcContainer = document.createElement("div");
  npcContainer.classList.add("npc-icon-container");

  // Get NPCs located at RockyShoreView
  const survivorsHere = npcLocationSystem.getSurvivorsAtLocation("RockyShoreView");

  survivorsHere.forEach(survivor => {
    const icon = createNpcIcon(survivor, () => {
      console.log("Clicked NPC:", survivor.name);
      // TODO: conversationUI.startConversation(survivor);
    });

    npcContainer.appendChild(icon);
  });

  container.appendChild(npcContainer);
}
/* --------------------------------------------------------------- */