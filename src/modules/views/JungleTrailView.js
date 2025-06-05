/**
 * @module JungleTrailView
 * Renders the Jungle Trail screen inside the Camp Phase
 */

import { createElement, clearChildren, addDebugBanner } from '../utils/index.js';
import { gameManager } from '../core/index.js';

export default function renderJungleTrail(container) {
  console.log('renderJungleTrail() called');
  addDebugBanner('renderJungleTrail() called', 'green', 40);

  clearChildren(container);

  const fromWaterWell = window.previousCampView === 'waterWell';
  const backgroundURL = "url('Assets/Screens/jungle-trail.png')";

  container.style.backgroundImage = backgroundURL;
  container.style.backgroundSize = 'cover';
  container.style.backgroundPosition = 'center';
  container.style.backgroundRepeat = 'no-repeat';
  container.style.transform = fromWaterWell ? 'scaleX(-1)' : 'scaleX(1)';

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
      transform: scaleX(${fromWaterWell ? -1 : 1});
      opacity: 1;
      transition: opacity 1s ease;
    `
  }, 'The jungle grows thick around you...');

  wrapper.appendChild(message);
  container.appendChild(wrapper);

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
      transform: scaleX(${fromWaterWell ? -1 : 1});
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
    if (fromWaterWell) {
      document.getElementById('camp-content').style.transform = 'scaleX(1)';
    }
    window.previousCampView = fromWaterWell ? 'waterWell' : 'jungleTrail';
    window.campScreen.loadView('firewood');
  });

  const bambooButton = createElement('button', { 
    className: 'rect-button alt' 
  }, 'Bamboo');

  bambooButton.addEventListener('click', () => {
    if (fromWaterWell) {
      document.getElementById('camp-content').style.transform = 'scaleX(1)';
    }
    window.previousCampView = fromWaterWell ? 'waterWell' : 'jungleTrail';
    window.campScreen.loadView('bamboo');
  });

  popupContent.appendChild(popupTitle);
  popupContent.appendChild(firewoodButton);
  popupContent.appendChild(bambooButton);
  resourcePopup.appendChild(popupContent);
  container.appendChild(resourcePopup);

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
    actionButtons.style.display = 'flex';
    actionButtons.style.justifyContent = 'center';
    actionButtons.style.padding = '0';
    actionButtons.style.gap = '20px';

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
        console.log('Up: go to Fork3');
        document.getElementById('camp-content').style.transform = 'scaleX(1)';
        window.campScreen.loadView('fork3');
      } else {
        console.log('Up: back to Water Well');
        window.campScreen.loadView('waterWell');
      }
    });

    const centerButton = createIconButton('Assets/Buttons/blank.png', 'Center', () => {
      const popup = document.getElementById('resource-popup');
      popup.style.display = popup.style.display === 'none' ? 'flex' : 'none';
    });

    const downButton = createIconButton('Assets/Buttons/down.png', 'Down', () => {
      if (fromWaterWell) {
        console.log('Down: back to Water Well');
        document.getElementById('camp-content').style.transform = 'scaleX(1)';
        window.campScreen.loadView('waterWell');
      } else {
        console.log('Down: go to Fork3');
        window.campScreen.loadView('fork3');
      }
    });

    actionButtons.appendChild(upButton);
    actionButtons.appendChild(centerButton);
    actionButtons.appendChild(downButton);
  }

  addDebugBanner('Jungle Trail view rendered!', 'green', 170);
}