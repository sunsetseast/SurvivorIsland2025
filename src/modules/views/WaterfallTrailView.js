/**
 * @module WaterfallTrailView
 * Renders the waterfall trail screen inside the Camp Phase
 */

import { createElement, clearChildren, addDebugBanner } from '../utils/index.js';
import { gameManager } from '../core/index.js';

export default function renderWaterfallTrail(container) {
  console.log('renderWaterfallTrail() called');
  addDebugBanner('renderWaterfallTrail() called', 'dodgerblue', 40);

  clearChildren(container);

  container.style.backgroundImage = "url('Assets/Screens/waterfall-trail.png')";
  container.style.backgroundSize = 'cover';
  container.style.backgroundPosition = 'center';
  container.style.backgroundRepeat = 'no-repeat';

  const wrapper = createElement('div', {
    className: 'waterfall-trail-wrapper',
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
  }, 'A peaceful trail winds around a stunning waterfall.');

  wrapper.appendChild(message);
  container.appendChild(wrapper);

  // --- Action Bar Buttons ---
  const actionButtons = document.getElementById('action-buttons');
    if (actionButtons) {
      clearChildren(actionButtons);

      actionButtons.style.justifyContent = 'space-between';
      actionButtons.style.padding = '0 40px';

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
      console.log('Left button clicked - returning to Tree Mail');
      window.campScreen.loadView('treemail');
    });

      const rightButton = createIconButton('Assets/Buttons/right.png', 'Right', () => {
        console.log('Right button clicked - going to Water Well');
        window.campScreen.loadView('waterWell');
      });

    actionButtons.appendChild(leftButton);
    actionButtons.appendChild(rightButton);
  }

  addDebugBanner('Waterfall Trail view rendered!', 'dodgerblue', 170);
}