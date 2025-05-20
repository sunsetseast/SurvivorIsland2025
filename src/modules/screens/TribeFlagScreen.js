/**
 * @module TribeFlagScreen
 * Displays the tribe flag and current tribe members
 */

import { getElement, createElement, clearChildren } from '../utils/index.js';
import { gameManager, screenManager } from '../core/index.js';

export default class TribeFlagScreen {
  initialize() {
    console.log('TribeFlagScreen initialized');
  }

  setup(data = {}) {
    const container = getElement('tribe-flag-screen');
    clearChildren(container);

    container.style.backgroundImage = "url('Assets/Screens/tribe-flag.png')";
    container.style.backgroundSize = 'cover';
    container.style.backgroundPosition = 'center';
    container.style.backgroundRepeat = 'no-repeat';

    const playerSurvivor = gameManager.getPlayerSurvivor();

    if (!playerSurvivor) {
      console.error('TribeFlagScreen: No player survivor found.');
      return;
    }

    const playerTribe = gameManager.tribes.find(tribe =>
      tribe.members.some(m => m.id === playerSurvivor.id)
    );

    if (!playerTribe) {
      console.error('TribeFlagScreen: Player tribe not found.');
      return;
    }

    const wrapper = createElement('div', {
      className: 'tribe-wrapper',
      style: `
        text-align: center;
        margin: 40px auto 20px;
        position: relative;
        display: inline-block;
      `
    });

    const tribeImage = createElement('img', {
      src: `Assets/Tribe/${playerTribe.color}-portrait.png`,
      alt: `${playerTribe.name} portrait`,
      style: `
        width: 100%;
        max-width: 400px;
        display: block;
        margin: 0 auto;
        position: relative;
        z-index: 1;
      `
    });

    const avatarGrid = createElement('div', {
      style: `
        position: absolute;
        top: 33%;
        left: 50%;
        transform: translateX(-50%) scale(1.1);
        display: grid;
        grid-template-columns: repeat(2, auto);
        grid-template-rows: repeat(3, auto);
        column-gap: 4px;
        row-gap: 8px;
        z-index: 2;
      `
    });

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
        // You can later replace this with an actual SurvivorCard popup
        alert(`${member.firstName} ${member.lastName}'s stats coming soon!`);
      });

      avatarGrid.appendChild(avatarWrapper);
    });

    wrapper.append(tribeImage, avatarGrid);
    container.appendChild(wrapper);

    // Placeholder for bottom button row — coming in next steps
  }

  teardown() {
    console.log('TribeFlagScreen teardown');
  }
}