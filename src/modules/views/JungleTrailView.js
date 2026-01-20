/**
 * @module JungleTrailView
 * Renders the Jungle Trail screen inside the Camp Phase
 */

import { createElement, clearChildren, addDebugBanner } from '../utils/index.js';
import { gameManager } from '../core/index.js';
import { openIdolHuntOptions } from '../ui/IdolHuntOverlay.js';
import { LocationKeys } from '../core/LocationKeys.js';

/* ⭐ NEW IMPORTS FOR NPC SYSTEM ------------------------------- */
import npcLocationSystem from "../systems/NpcLocationSystem.js";
import { createNpcIcon } from "../ui/NpcIcon.js";
/* ------------------------------------------------------------ */

export default function renderJungleTrail(container) {
  console.log('renderJungleTrail() called');
  addDebugBanner('renderJungleTrail() called', 'green', 40);

  clearChildren(container);

  const fromWaterWell = window.previousCampView === LocationKeys.WATER_WELL;
  const backgroundURL = "url('Assets/Screens/jungle-trail.png')";

  container.style.position = 'relative';
  container.style.overflow = 'hidden';

  const oldBgLayer = container.querySelector('.bg-layer');
  if (oldBgLayer) oldBgLayer.remove();

  const bgLayer = createElement('div', {
    className: `bg-layer${fromWaterWell ? ' is-flipped' : ''}`,
    style: `
      position: absolute;
      inset: 0;
      z-index: 0;
      background-image: ${backgroundURL};
      background-size: cover;
      background-position: center;
      background-repeat: no-repeat;
    `
  });

  const uiLayer = createElement('div', {
    className: 'ui-layer',
    style: `
      position: relative;
      z-index: 1;
      width: 100%;
      height: 100%;
    `
  });

  container.appendChild(bgLayer);
  container.appendChild(uiLayer);

  const wrapper = createElement('div', {
    className: 'jungletrail-wrapper',
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
    id: 'jungle-message',
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
  }, 'The jungle grows thick around you...');

  wrapper.appendChild(message);
  uiLayer.appendChild(wrapper);

  /* ⭐ NEW NPC RENDERING -------------------------------------- */
  renderNPCsAtJungleTrail(uiLayer);
  /* ----------------------------------------------------------- */

  // Fade out message after a delay
  setTimeout(() => {
    message.style.opacity = '0';
  }, 3000);

  setTimeout(() => {
    message.remove();
  }, 4000);

  // --- Resource Popup UI ---
  const resourcePopup = createElement('div', {
    id: 'resource-popup',
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
    id: 'resource-popup-content',
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
  }, 'Gather Resources:');

  const firewoodButton = createElement('button', { 
    className: 'rect-button alt' 
  }, 'Firewood');

  firewoodButton.addEventListener('click', () => {
    window.campScreen.loadView(LocationKeys.FIREWOOD);
  });

  const bambooButton = createElement('button', { 
    className: 'rect-button alt' 
  }, 'Bamboo');

  bambooButton.addEventListener('click', () => {
    window.campScreen.loadView(LocationKeys.BAMBOO);
  });

  popupContent.appendChild(popupTitle);
  popupContent.appendChild(firewoodButton);
  popupContent.appendChild(bambooButton);

  const huntButton = createElement('button', {
    className: 'rect-button alt'
  }, 'Hunt for an Idol');

  huntButton.addEventListener('click', () => {
    resourcePopup.style.display = 'none';
    openIdolHuntOptions(container, LocationKeys.JUNGLE_TRAIL);
  });

  popupContent.appendChild(huntButton);
  resourcePopup.appendChild(popupContent);
  uiLayer.appendChild(resourcePopup);

  // Allow closing when clicking the background, but not popup content
  resourcePopup.addEventListener('click', (e) => {
    const content = document.getElementById('resource-popup-content');
    if (!content.contains(e.target)) {
      resourcePopup.style.display = 'none';
    }
  });

  // --- Action Bar Buttons ---
  const actionButtons = document.getElementById('action-buttons');
  if (actionButtons) {
    clearChildren(actionButtons);

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
      if (onClick) wrapper.addEventListener('click', onClick);
      return wrapper;
    };

    const upButton = createIconButton('Assets/Buttons/up.png', 'Up', () => {
      if (fromWaterWell) {
        console.log('Up: go to Fork3 (from Water Well)');
        window.campScreen.loadView(LocationKeys.FORK3);
      } else {
        console.log('Up: back to Water Well (from Fork1)');
        window.campScreen.loadView(LocationKeys.WATER_WELL);
      }
    });

    const centerButton = createIconButton('Assets/Buttons/blank.png', 'Center', () => {
      const popup = document.getElementById('resource-popup');
      popup.style.display = popup.style.display === 'none' ? 'flex' : 'none';
    });

    const downButton = createIconButton('Assets/Buttons/down.png', 'Down', () => {
      if (fromWaterWell) {
        console.log('Down: back to Water Well (from Water Well)');
        window.campScreen.loadView(LocationKeys.WATER_WELL);
      } else {
        console.log('Down: go to Fork3 (from Fork1)');
        window.campScreen.loadView(LocationKeys.FORK3);
      }
    });

    actionButtons.appendChild(upButton);
    actionButtons.appendChild(centerButton);
    actionButtons.appendChild(downButton);
  }

  addDebugBanner('Jungle Trail view rendered!', 'green', 170);
}

/* ⭐⭐ NEW: NPC RENDER FUNCTION ---------------------------------- */
function renderNPCsAtJungleTrail(uiLayer) {
  const old = uiLayer.querySelector(".npc-icon-container");
  if (old) old.remove();

  const npcContainer = document.createElement("div");
  npcContainer.classList.add("npc-icon-container");

  const survivorsHere = npcLocationSystem.getSurvivorsAtLocation(LocationKeys.JUNGLE_TRAIL);

  survivorsHere.forEach(survivor => {
    const icon = createNpcIcon(survivor, () => {
      console.log(`Clicked NPC: ${survivor.name}`);
      // TODO: trigger conversation UI
    });
    npcContainer.appendChild(icon);
  });

  uiLayer.appendChild(npcContainer);
}
/* -------------------------------------------------------------- */
