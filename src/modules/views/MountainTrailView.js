/**
 * @module MountainTrailView
 * Renders the Mountain Trail screen inside the Camp Phase
 */

import { createElement, clearChildren, addDebugBanner } from '../utils/index.js';
import { gameManager } from '../core/index.js';

export default function renderMountainTrail(container) {
  console.log('renderMountainTrail() called');
  addDebugBanner('renderMountainTrail() called', 'sienna', 40);

  clearChildren(container);

  const fromTreeMail = window.previousCampView === 'treemail';
  const backgroundURL = "url('Assets/Screens/mountain-trail-view.png')";

  container.style.backgroundImage = backgroundURL;
  container.style.backgroundSize = 'cover';
  container.style.backgroundPosition = 'center';
  container.style.backgroundRepeat = 'no-repeat';
  container.style.transform = fromTreeMail ? 'scaleX(-1)' : 'scaleX(1)';

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
      transform: scaleX(${fromTreeMail ? -1 : 1}); /* Unflip the message */
    `
  }, 'You begin your ascent up the Mountain Trail...');

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

    const upButton = fromTreeMail
    ? createIconButton('Assets/Buttons/up.png', 'Up', () => {
        console.log('Up button clicked - going to Fork2');
        document.getElementById('camp-content').style.transform = 'scaleX(1)';
        window.campScreen.loadView('fork2');
      })
    : createIconButton('Assets/Buttons/up.png', 'Up', () => {
        console.log('Up button clicked - going to TreeMail');
        window.campScreen.loadView('treemail');
      });
    const downButton = fromTreeMail
    ? createIconButton('Assets/Buttons/down.png', 'Down', () => {
        console.log('Down button clicked - returning to TreeMail');
        document.getElementById('camp-content').style.transform = 'scaleX(1)';
        window.campScreen.loadView('treemail');
      })
    : createIconButton('Assets/Buttons/down.png', 'Down', () => {
        console.log('Down button clicked - returning to Fork2');
        window.campScreen.loadView('fork2');
      });

    actionButtons.appendChild(upButton);
    actionButtons.appendChild(downButton);
  }

  addDebugBanner('Mountain Trail view rendered!', 'sienna', 170);
}