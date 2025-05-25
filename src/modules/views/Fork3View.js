/**
 * @module Fork3View
 * Renders the Fork 3 screen inside the Camp Phase
 */

import { createElement, clearChildren, addDebugBanner } from '../utils/index.js';
import { gameManager } from '../core/index.js';

export default function renderFork3(container) {
  console.log('renderFork3() called');
  addDebugBanner('renderFork3() called', 'mediumpurple', 40);

  clearChildren(container);

  container.style.backgroundImage = "url('Assets/Screens/fork3.png')";
  container.style.backgroundSize = 'cover';
  container.style.backgroundPosition = 'center';
  container.style.backgroundRepeat = 'no-repeat';

  const wrapper = createElement('div', {
    className: 'fork3-wrapper',
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
  }, 'You reach another fork in the trail...');

  wrapper.appendChild(message);
  container.appendChild(wrapper);

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
      if (onClick) wrapper.addEventListener('click', onClick);
      return wrapper;
    };

    const leftButton = createIconButton('Assets/Buttons/left.png', 'Left', () => {
      console.log('Left button clicked - returning to Shelter');
      window.campScreen.loadView('shelter');
    });

    const downButton = createIconButton('Assets/Buttons/down.png', 'Down', () => {
      console.log('Down button clicked - going to Jungle Trail');
      window.campScreen.loadView('jungleTrail');
    });

    const rightButton = createIconButton('Assets/Buttons/right.png', 'Right', () => {
      console.log('Right button clicked - going to Mountain Trail');
      window.campScreen.loadView('mountainTrail');
    });

    actionButtons.appendChild(leftButton);
    actionButtons.appendChild(downButton);
    actionButtons.appendChild(rightButton);
  }

  addDebugBanner('Fork3 view rendered!', 'mediumpurple', 170);
}