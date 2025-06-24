/**
 * @module TribeFlagView
 * Renders the tribe flag screen inside the Camp Phase
 */

import { createElement, clearChildren, addDebugBanner } from '../utils/index.js';
import { gameManager } from '../core/index.js';
import screenManager from '../core/ScreenManager.js';

export default function renderTribeFlag(container) {
  console.log('renderTribeFlag() called');
  addDebugBanner('renderTribeFlag() called', 'teal', 40);

  clearChildren(container);

  container.style.backgroundImage = "url('Assets/Screens/tribe-flag.png')";
  container.style.backgroundSize = 'cover';
  container.style.backgroundPosition = 'center';
  container.style.backgroundRepeat = 'no-repeat';

  const playerSurvivor = gameManager.getPlayerSurvivor();
  if (!playerSurvivor) {
    console.error('TribeFlagView: No player survivor found.');
    addDebugBanner('No player survivor found', 'red', 100);
    return;
  }
  addDebugBanner(`Player: ${playerSurvivor.firstName}`, 'green', 100);

  const playerTribe = gameManager.tribes.find(tribe =>
    tribe.members.some(m => m.id === playerSurvivor.id)
  );
  if (!playerTribe) {
    console.error('TribeFlagView: Player tribe not found.');
    addDebugBanner('Player tribe not found', 'orange', 130);
    return;
  }
  addDebugBanner(`Tribe found: ${playerTribe.name}`, 'blue', 130);

  const wrapper = createElement('div', {
    className: 'tribe-wrapper',
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

  const tribeImage = createElement('img', {
    src: `Assets/Tribe/${playerTribe.color}-portrait.png`,
    alt: `${playerTribe.name} portrait`,
    style: `
      width: 100%;
      max-width: 300px;
      display: block;
      margin: 0 auto;
      position: relative;
      z-index: 1;
    `
  });

  const tribeNameOverlay = createElement('div', {
    style: `
      position: absolute;
      top: 15%;
      left: 50%;
      transform: translateX(-50%);
      color: white;
      text-shadow: 2px 2px 4px black;
      font-size: 2.4rem;
      font-family: 'Survivant', sans-serif;
      z-index: 2;
      pointer-events: none;
    `
  }, playerTribe.name.toUpperCase());

  const memberCount = playerTribe.members.length;
  const isTwoTribeMode = memberCount === 9;
  const isThreeTribeMode = memberCount === 6;

  const topOffset = isTwoTribeMode ? '27%' : '28%';
  const scaleValue = isTwoTribeMode ? 0.9 : 1.05;
  const columns = isTwoTribeMode ? 3 : 2;

  const avatarGrid = createElement('div', {
    style: `
      position: absolute;
      top: ${topOffset};
      left: 50%;
      transform: translate(-50%, 0%) scale(${scaleValue});
      display: grid;
      grid-template-columns: repeat(${columns}, auto);
      grid-template-rows: repeat(3, auto);
      column-gap: 4px;
      row-gap: 8px;
      z-index: 2;
    `
  });

  const bottomOverlay = createElement('div', {
    style: `
      position: absolute;
      bottom: 17%;
      left: 50%;
      transform: translateX(-50%);
      color: white;
      text-shadow: 2px 2px 4px black;
      font-size: 0.85rem;
      font-family: 'Survivant', sans-serif;
      z-index: 2;
      pointer-events: none;
      width: 90%;
      max-width: 280px;
      line-height: 1.3;
      text-align: center;
    `
  }, 'Click a Survivor to see more information about them.');

  playerTribe.members.forEach(member => {
    const avatarWrapper = createElement('div', {
      style: 'display: flex; flex-direction: column; align-items: center; cursor: pointer;'
    });

    const avatar = createElement('img', {
      src: member.avatarUrl || `Assets/Avatars/${member.firstName.toLowerCase()}.jpeg`,
      alt: member.firstName,
      style: `
        width: 64px;
        height: 64px;
        border-radius: 50%;
        object-fit: cover;
        border: 3px solid ${playerTribe.color};
        background: #000;
      `
    });

    const name = createElement('span', {
      style: `
        font-family: 'Survivant', sans-serif;
        font-size: 0.85rem;
        color: white;
        margin-top: 4px;
        text-align: center;
        text-shadow: 1px 1px 2px black;
        width: 80px;
        white-space: normal;
        word-break: keep-all;
        line-height: 1.1;
      `
    }, member.firstName.toUpperCase());

    avatarWrapper.appendChild(avatar);
    avatarWrapper.appendChild(name);

    avatarWrapper.addEventListener('click', () => {
      alert(`${member.firstName} ${member.lastName}'s stats coming soon!`);
    });

    avatarGrid.appendChild(avatarWrapper);
  });

  wrapper.append(tribeImage, tribeNameOverlay, avatarGrid, bottomOverlay);
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
          width: 240px;
          height: 135px;
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
      wrapper.addEventListener('click', onClick);
      return wrapper;
    };

    const leftButton = createIconButton('Assets/Buttons/left.png', 'Left', () => {
      console.log('Left button clicked');
      screenManager.screens['camp'].loadView('beach');
    });

    const rightButton = createIconButton('Assets/Buttons/right.png', 'Right', () => {
      console.log('Right button clicked - loading Campfire');
      window.campScreen.loadView('campfire');
    });

    // Testing button to reset clock timer to zero
    const testButton = createElement('button', {
      style: `
        position: absolute;
        top: 10px;
        right: 10px;
        width: 120px;
        height: 40px;
        background-color: rgba(255, 0, 0, 0.8);
        border: 2px solid #fff;
        border-radius: 5px;
        color: white;
        font-family: 'Survivant', sans-serif;
        font-size: 0.9rem;
        font-weight: bold;
        text-shadow: 1px 1px 2px black;
        cursor: pointer;
        z-index: 1000;
      `,
      onclick: () => {
        console.log('Test button clicked - setting timer to zero');
        if (gameManager && typeof gameManager.setDayTimer === 'function') {
          gameManager.setDayTimer(0);
          console.log('Timer set to zero for testing');
        } else if (gameManager && gameManager.dayTimer !== undefined) {
          gameManager.dayTimer = 0;
          console.log('Timer manually set to zero for testing');
        } else {
          console.warn('Could not access game timer');
        }
      }
    }, 'SKIP TIME');

    actionButtons.appendChild(leftButton);
    actionButtons.appendChild(rightButton);
    wrapper.appendChild(testButton);
  }

  addDebugBanner('Tribe flag view rendered!', 'limegreen', 170);
}