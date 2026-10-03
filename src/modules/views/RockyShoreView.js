/**
 * @module RockyShoreView
 * Renders the rocky shore screen inside the Camp Phase
 */

import { createElement, clearChildren } from '../utils/index.js';
import { gameManager } from '../core/index.js';
import { openIdolHuntMenu } from '../ui/IdolHuntOverlay.js';
import { LocationKeys } from '../core/LocationKeys.js';

export default function renderRockyShore(container) {

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
    className: 'camp-location-intro',
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

  // --- Action Bar Buttons ---
  const actionButtons = document.getElementById('action-buttons');
  if (actionButtons) {
    clearChildren(actionButtons);

    const createIconButton = (src, alt, onClick) => {
      const wrapper = createElement('button', {
        type: 'button', className: 'camp-nav-button', 'aria-label': alt,
        style: `
          border: 0; background: transparent; padding: 0;
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
      if (onClick) {
        wrapper.addEventListener('click', onClick);
      }
      return wrapper;
    };

    const downButton = createIconButton('Assets/Buttons/down.png', 'Down', () => {
      window.campScreen.loadView(LocationKeys.BEACH);
    });

    const blankButton = createIconButton('Assets/Buttons/blank.png', 'Blank', () => {
      openIdolHuntMenu(container, LocationKeys.ROCKY_SHORE);
    });

    actionButtons.appendChild(downButton);
    actionButtons.appendChild(blankButton);
  }
}
