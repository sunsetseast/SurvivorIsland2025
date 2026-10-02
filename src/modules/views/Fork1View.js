/**
 * @module Fork1View
 * Renders the Fork in the Trail screen inside the Camp Phase
 */

import { createElement, clearChildren } from '../utils/index.js';
import { gameManager } from '../core/index.js';
import { LocationKeys } from '../core/LocationKeys.js';

export default function renderFork1(container) {

  clearChildren(container);

  container.style.backgroundImage = "url('Assets/Screens/fork1.png')";
  container.style.backgroundSize = 'cover';
  container.style.backgroundPosition = 'center';
  container.style.backgroundRepeat = 'no-repeat';

  const wrapper = createElement('div', {
    className: 'fork-wrapper',
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
  }, 'You reach a fork in the trail...');

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
      window.campScreen.loadView(LocationKeys.MOUNTAIN_TRAIL);
    });

    const downButton = createIconButton('Assets/Buttons/down.png', 'Down', () => {
      window.campScreen.loadView(LocationKeys.SHELTER);
    });

    const rightButton = createIconButton('Assets/Buttons/right.png', 'Right', () => {
      window.campScreen.loadView(LocationKeys.JUNGLE_TRAIL);
    });

    actionButtons.appendChild(leftButton);
    actionButtons.appendChild(downButton);
    actionButtons.appendChild(rightButton);
  }
}
