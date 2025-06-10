/**
 * @module TreeMailView
 * Renders the Tree Mail screen inside the Camp Phase
 */

import { createElement, clearChildren, addDebugBanner } from '../utils/index.js';
import { gameManager } from '../core/index.js';

export default function renderTreeMail(container) {
  console.log('renderTreeMail() called');
  addDebugBanner('renderTreeMail() called', 'sienna', 40);

  clearChildren(container);

  container.style.backgroundImage = "url('Assets/Screens/tree-mail.png')";
  container.style.backgroundSize = 'cover';
  container.style.backgroundPosition = 'center';
  container.style.backgroundRepeat = 'no-repeat';

  const wrapper = createElement('div', {
    className: 'treemail-wrapper',
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
  }, 'Tree Mail: A clue to your next challenge appears...');

  wrapper.appendChild(message);
  container.appendChild(wrapper);

  // Check if timer has run out
  const currentTimer = gameManager.getDayTimer();
  const timerExpired = currentTimer <= 0;

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
          width: 240px;
          height: 135px;
          display: inline-block;
          overflow: hidden;
          cursor: pointer;
          position: relative;
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

    const createTreeMailButton = () => {
      const buttonWrapper = createElement('div', {
        className: 'tree-mail-button-wrapper',
        style: `
          width: 240px;
          height: 135px;
          display: inline-block;
          overflow: hidden;
          cursor: pointer;
          position: relative;
          transition: transform 0.1s ease;
          display: flex;
          align-items: center;
          justify-content: center;
        `
      });

      // Base blank button - smaller size
      const blankImage = createElement('img', {
        src: 'Assets/Buttons/blank.png',
        alt: 'Blank Button Base',
        style: `
          width: 140px;
          height: 90px;
          display: block;
          object-fit: contain;
          pointer-events: none;
          position: absolute;
        `
      });

      // Tree mail icon overlay - properly sized and centered
      const treeMailIcon = createElement('img', {
        src: 'Assets/Resources/treeMail.png',
        alt: 'Tree Mail Icon',
        style: `
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 60px;
          height: 60px;
          object-fit: contain;
          pointer-events: none;
          z-index: 1;
        `
      });

      // Add hover effect
      buttonWrapper.addEventListener('mouseenter', () => {
        buttonWrapper.style.transform = 'scale(1.05)';
      });

      buttonWrapper.addEventListener('mouseleave', () => {
        buttonWrapper.style.transform = 'scale(1)';
      });

      // Add click handler
      buttonWrapper.addEventListener('click', () => {
        console.log('Tree Mail button clicked - loading summary view');
        window.campScreen.loadView('summary');
      });

      buttonWrapper.appendChild(blankImage);
      buttonWrapper.appendChild(treeMailIcon);

      return buttonWrapper;
    };

    if (timerExpired) {
      // When timer expired, only show the tree mail button in center
      const treeMailButton = createTreeMailButton();
      actionButtons.appendChild(treeMailButton);
    } else {
      // Normal navigation buttons when timer hasn't expired
      const leftButton = createIconButton('Assets/Buttons/left.png', 'Left', () => {
        console.log('Left button clicked - returning to Mountain Trail');
        window.campScreen.loadView('mountainTrail');
      });

      const blankButton = createIconButton('Assets/Buttons/blank.png', 'Blank');

      const rightButton = createIconButton('Assets/Buttons/right.png', 'Right', () => {
        console.log('Right button clicked - loading Waterfall Trail View');
        window.campScreen.loadView('waterfallTrail');
      });

      actionButtons.appendChild(leftButton);
      actionButtons.appendChild(blankButton);
      actionButtons.appendChild(rightButton);
    }
  }

  addDebugBanner('Tree Mail view rendered!', 'sienna', 170);
}