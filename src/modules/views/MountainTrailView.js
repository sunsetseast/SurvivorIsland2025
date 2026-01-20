/**
 * @module MountainTrailView
 * Renders the Mountain Trail screen inside the Camp Phase
 */

import { createElement, clearChildren, addDebugBanner } from '../utils/index.js';
import { openIdolHuntOptions } from '../ui/IdolHuntOverlay.js';
import { LocationKeys } from '../core/LocationKeys.js';

/* ⭐ NEW IMPORTS FOR NPC SYSTEM ------------------------------- */
import npcLocationSystem from "../systems/NpcLocationSystem.js";
import { createNpcIcon } from "../ui/NpcIcon.js";
/* ------------------------------------------------------------ */

function loadCampView(locationKey) {
  if (window.campScreen?.loadView) {
    return window.campScreen.loadView(locationKey);
  }
  console.warn('[MountainTrailView] Unable to load camp view', { locationKey });
}

export default function renderMountainTrail(container) {
  console.log('renderMountainTrail() called');
  addDebugBanner('renderMountainTrail() called', 'sienna', 40);

  clearChildren(container);

  const prev = window.previousCampView;
  const fromTreeMail = prev === 'treemail' || prev === LocationKeys.TREE_MAIL;
  const backgroundURL = "url('Assets/Screens/mountain-trail-view.png')";

  container.style.position = 'relative';
  container.style.overflow = 'hidden';

  const oldBgLayer = container.querySelector('.bg-layer');
  if (oldBgLayer) oldBgLayer.remove();

  const bgLayer = createElement('div', {
    className: `bg-layer${fromTreeMail ? ' is-flipped' : ''}`,
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
    className: 'mountaintrail-wrapper',
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
      opacity: 1;
      transition: opacity 1s ease;
    `
  }, 'You begin your ascent up the Mountain Trail...');

  wrapper.appendChild(message);
  uiLayer.appendChild(wrapper);

  const actionPopup = createElement('div', {
    id: 'mountain-action-popup',
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
    id: 'mountain-action-content',
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
  }, 'Trail Actions:');

  const shakeButton = createElement('button', { className: 'rect-button alt' }, 'Shake Trees');
  shakeButton.addEventListener('click', () => {
    actionPopup.style.display = 'none';
    loadCampView(LocationKeys.SHAKE);
  });

  const huntButton = createElement('button', { className: 'rect-button alt' }, 'Hunt for an Idol');
  huntButton.addEventListener('click', () => {
    actionPopup.style.display = 'none';
    openIdolHuntOptions(container, LocationKeys.MOUNTAIN_TRAIL);
  });

  popupContent.appendChild(popupTitle);
  popupContent.appendChild(shakeButton);
  popupContent.appendChild(huntButton);
  actionPopup.appendChild(popupContent);
  uiLayer.appendChild(actionPopup);

  actionPopup.addEventListener('click', (event) => {
    if (event.target === actionPopup) {
      actionPopup.style.display = 'none';
    }
  });

  /* ⭐ NEW NPC RENDERING -------------------------------------------------- */
  renderNPCsAtMountainTrail(uiLayer);
  /* ---------------------------------------------------------------------- */

  // Fade out message after a delay
  setTimeout(() => {
    message.style.opacity = '0';
  }, 3000);

  setTimeout(() => {
    message.remove();
  }, 4000);

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

    const upButton = fromTreeMail
      ? createIconButton('Assets/Buttons/up.png', 'Up', () => {
          console.log('Up: go to Fork2');
          loadCampView(LocationKeys.FORK2);
        })
      : createIconButton('Assets/Buttons/up.png', 'Up', () => {
          console.log('Up: back to Tree Mail');
          loadCampView(LocationKeys.TREE_MAIL);
        });

    const centerButton = createIconButton('Assets/Buttons/blank.png', 'Center', () => {
      actionPopup.style.display = actionPopup.style.display === 'none' ? 'flex' : 'none';
    });

    const downButton = fromTreeMail
      ? createIconButton('Assets/Buttons/down.png', 'Down', () => {
          console.log('Down: back to Tree Mail');
          loadCampView(LocationKeys.TREE_MAIL);
        })
      : createIconButton('Assets/Buttons/down.png', 'Down', () => {
          console.log('Down: go to Fork2');
          loadCampView(LocationKeys.FORK2);
        });

    actionButtons.appendChild(upButton);
    actionButtons.appendChild(centerButton);
    actionButtons.appendChild(downButton);
  }

  addDebugBanner('Mountain Trail view rendered!', 'sienna', 170);
}

/* ⭐⭐ NEW FUNCTION — RENDER NPC ICONS FOR THIS LOCATION ------------------ */
function renderNPCsAtMountainTrail(uiLayer) {
  const old = uiLayer.querySelector(".npc-icon-container");
  if (old) old.remove();

  const npcContainer = document.createElement("div");
  npcContainer.classList.add("npc-icon-container");

  let survivorsHere = [];
  try {
    survivorsHere = npcLocationSystem?.getSurvivorsAtLocation?.(LocationKeys.MOUNTAIN_TRAIL) || [];
  } catch (e) {
    console.warn('[MountainTrailView] NPC render failed', e);
    survivorsHere = [];
  }

  survivorsHere.forEach(survivor => {
    const icon = createNpcIcon(survivor, () => {
      console.log("Clicked NPC:", survivor.name);
      // TODO: conversation UI
    });

    npcContainer.appendChild(icon);
  });

  uiLayer.appendChild(npcContainer);
}
/* ---------------------------------------------------------------------- */
