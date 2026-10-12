/**
 * @module TribeFlagView
 * Renders the tribe flag screen inside the Camp Phase
 */

import { createElement, clearChildren } from '../utils/index.js';
import { gameManager } from '../core/index.js';
import screenManager from '../core/ScreenManager.js';
import { createSurvivorCard } from '../ui/SurvivorCardFactory.js';
import { openIdolHuntMenu } from '../ui/IdolHuntOverlay.js';
import { LocationKeys } from '../core/LocationKeys.js';

export default function renderTribeFlag(container) {

  clearChildren(container);
  const loadCampView = (locationKey) => {
    if (window.campScreen?.loadView) {
      window.campScreen.loadView(locationKey);
      return;
    }
    if (screenManager.screens?.camp?.loadView) {
      screenManager.screens.camp.loadView(locationKey);
      return;
    }
    console.warn('[TribeFlagView] Unable to load camp view', { locationKey });
  };

  container.style.backgroundImage = "url('Assets/Screens/tribe-flag.png')";
  container.style.backgroundSize = 'cover';
  container.style.backgroundPosition = 'center';
  container.style.backgroundRepeat = 'no-repeat';

  document.querySelectorAll('.survivor-card-overlay').forEach(el => el.remove());

  const playerSurvivor = gameManager.getPlayerSurvivor();
  if (!playerSurvivor) {
    console.error('TribeFlagView: No player survivor found.');
    return;
  }

  const playerTribe = gameManager.tribes.find(tribe =>
    tribe.members.some(m => m.id === playerSurvivor.id)
  );
  if (!playerTribe) {
    console.error('TribeFlagView: Player tribe not found.');
    return;
  }

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
    className: 'tribe-avatar-grid',
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
  }, 'Tap a Survivor to meet your tribe.');

  if (gameManager.day === 1 && gameManager.gamePhase === 'preChallenge') {
    bottomOverlay.className = 'first-day-camp-entry';
    bottomOverlay.style.pointerEvents = 'auto';
    bottomOverlay.style.background = 'rgba(15, 30, 20, .9)';
    bottomOverlay.style.padding = '10px';
    bottomOverlay.style.borderRadius = '12px';
    bottomOverlay.appendChild(createElement('p', { style: 'margin:6px 0;font-family:sans-serif;color:#fff;' },
      'Head to the beach to meet people, help around camp, or see who is talking.'));
    bottomOverlay.appendChild(createElement('button', {
      type: 'button', className: 'rect-button',
      style: 'min-height:44px;width:100%;',
      onclick: () => window.campScreen?.loadView?.(LocationKeys.BEACH),
    }, 'Step into camp'));
  }

  let activeOverlay = null;

  const closeOverlay = () => {
    if (activeOverlay) {
      activeOverlay.remove();
      activeOverlay = null;
    }
  };

  const openOverlay = (member) => {
    closeOverlay();

    const overlay = createElement('div', { className: 'survivor-card-overlay' });
    const content = createElement('div', { className: 'survivor-card-overlay__content' });

    const card = createSurvivorCard(member, { mode: 'view' });
    const closeButton = createElement('button', {
      className: 'rect-button overlay-close',
      onclick: () => closeOverlay()
    }, 'Back');

    content.appendChild(card);
    content.appendChild(closeButton);
    overlay.appendChild(content);

    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) {
        closeOverlay();
      }
    });

    document.body.appendChild(overlay);
    activeOverlay = overlay;
  };

  playerTribe.members.forEach(member => {
    const avatarWrapper = createElement('button', {
      type: 'button', 'aria-label': `View ${member.firstName}`,
      style: 'display: flex; flex-direction: column; align-items: center; cursor: pointer; border:0; background:transparent; padding:0;'
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

    avatarWrapper.addEventListener('click', () => openOverlay(member));

    avatarGrid.appendChild(avatarWrapper);
  });

  wrapper.append(tribeImage, tribeNameOverlay, avatarGrid, bottomOverlay);
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
      if (onClick) {
        wrapper.addEventListener('click', onClick);
      }
      return wrapper;
    };

    const leftButton = createIconButton('Assets/Buttons/left.png', 'Left', () => {
      loadCampView(LocationKeys.BEACH);
    });

    const blankButton = createIconButton('Assets/Buttons/blank.png', 'Blank', () => {
      openIdolHuntMenu(container, LocationKeys.TRIBE_FLAG);
    });

    const rightButton = createIconButton('Assets/Buttons/right.png', 'Right', () => {
      loadCampView(LocationKeys.CAMPFIRE);
    });

    actionButtons.appendChild(leftButton);
    actionButtons.appendChild(blankButton);
    actionButtons.appendChild(rightButton);
  }
}
