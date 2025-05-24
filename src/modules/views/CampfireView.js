/**
 * @module CampfireView
 * Renders the campfire screen inside the Camp Phase
 */

import { createElement, clearChildren, addDebugBanner } from '../utils/index.js';
import { gameManager } from '../core/index.js';

export default function renderCampfire(container) {
  console.log('renderCampfire() called');
  addDebugBanner('renderCampfire() called', 'orangered', 40);

  clearChildren(container);

  container.style.backgroundImage = "url('Assets/Screens/fire1.png')";
  container.style.backgroundSize = 'cover';
  container.style.backgroundPosition = 'center';
  container.style.backgroundRepeat = 'no-repeat';

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
  }, 'Welcome to the Campfire. Warm up and plan your next move.');

  wrapper.appendChild(message);
  container.appendChild(wrapper);

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

    const blankButton = createIconButton('Assets/Buttons/blank.png', 'Blank');

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