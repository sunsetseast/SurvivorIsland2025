/**
 * @module ShelterView
 * Renders the shelter screen inside the Camp Phase
 */

import { createElement, clearChildren, addDebugBanner } from '../utils/index.js';
import { gameManager } from '../core/index.js';

export default function renderShelter(container) {
  console.log('renderShelter() called');
  addDebugBanner('renderShelter() called', 'darkgreen', 40);

  clearChildren(container);

  container.style.backgroundImage = "url('Assets/Screens/shelter0.jpeg')";
  container.style.backgroundSize = 'cover';
  container.style.backgroundPosition = 'center';
  container.style.backgroundRepeat = 'no-repeat';

  const wrapper = createElement('div', {
    className: 'shelter-wrapper',
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
  }, 'Shelter: Rest, recover, and prepare for the next challenge.');

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
      if (onClick) wrapper.addEventListener('click', onClick);
      return wrapper;
    };

    const leftButton = createIconButton('Assets/Buttons/left.png', 'Left', () => {
      console.log('Left button clicked - returning to Campfire');
      window.campScreen.loadView('campfire');
    });

    const blankButton = createIconButton('Assets/Buttons/blank.png', 'Blank');
  const downButton = createIconButton('Assets/Buttons/down.png', 'Down', () => {
    console.log('Down button clicked — loading Fork1 View');
    window.campScreen.loadView('fork1');
  });

  actionButtons.appendChild(leftButton);
  actionButtons.appendChild(blankButton);
  actionButtons.appendChild(downButton);
  }
  addDebugBanner('Shelter view rendered!', 'forestgreen', 170);
}
}