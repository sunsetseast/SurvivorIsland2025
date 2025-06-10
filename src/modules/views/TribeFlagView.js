
/**
 * @module TribeFlagView
 * Renders the tribe flag screen inside the Camp Phase
 */

import { createElement, clearChildren, addDebugBanner } from '../utils/index.js';
import { gameManager } from '../core/index.js';
import screenManager from '../core/ScreenManager.js';
import gameData from '../data/index.js';

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
      showSurvivorCard(member);
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

    actionButtons.appendChild(leftButton);
    actionButtons.appendChild(rightButton);
  }

  addDebugBanner('Tribe flag view rendered!', 'limegreen', 170);
}

function showSurvivorCard(survivor) {
  // Create overlay that covers the entire screen
  const overlay = createElement('div', {
    style: `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.8);
      z-index: 1000;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
      box-sizing: border-box;
    `
  });

  // Create card container
  const cardContainer = createElement('div', {
    style: `
      position: relative;
      width: 100%;
      max-width: 909px;
      height: 625px;
      z-index: 1001;
    `
  });

  const cardWrapper = createSurvivorCard(survivor);
  cardContainer.appendChild(cardWrapper);
  overlay.appendChild(cardContainer);

  // Close on overlay click (but not on card click)
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      overlay.remove();
    }
  });

  // Add to document
  document.body.appendChild(overlay);
}

function createSurvivorCard(survivor) {
  const cardWrapper = createElement('div', { className: 'card-wrapper' });

  const avatarFrame = createElement('div', { className: 'avatar-frame' });
  const avatarImg = createElement('img', {
    src: survivor.avatarUrl || 'Assets/Avatars/default.jpeg',
    alt: `${survivor.firstName}'s avatar`
  });
  avatarFrame.appendChild(avatarImg);
  cardWrapper.appendChild(avatarFrame);

  const card = createElement('div', { className: 'survivor-card' });
  card.dataset.id = survivor.id;

  // FRONT
  const cardFront = createElement('div', { className: 'card-front' });
  const name = createElement('h3', { className: 'survivor-header' });
  name.innerHTML = `${survivor.firstName}<br>${survivor.lastName}`;

  const moreInfoButton = createElement('button', { className: 'card-button' }, 'More Info');
  
  const buttonContainer = createElement('div', { 
    className: 'card-buttons',
    style: 'justify-content: center;'
  });
  buttonContainer.appendChild(moreInfoButton);
  cardFront.appendChild(name);
  cardFront.appendChild(buttonContainer);

  // BACK
  const cardBack = createElement('div', { className: 'card-back' });
  cardBack.style.backgroundImage = `url('Assets/card-back-${survivor.traitClass.toLowerCase()}.png')`;

  const nameBox = createElement('div', { className: 'name-box' });
  nameBox.innerHTML = `<strong>${survivor.firstName}<br>${survivor.lastName}</strong><br><small>${survivor.season || 'Unknown'}</small>`;

  const gameplayStyleBox = createElement('div', {
    className: `gameplay-style-box${['Lethal Charmer', 'Shadow Strategist'].includes(survivor.gameplayStyle) ? ' small-text' : ''}`
  }, survivor.gameplayStyle || 'Unknown');

  const traitBox = createElement('div', {
    className: `trait-values ${survivor.traitClass.toLowerCase()}-layout`
  });
  traitBox.innerHTML = `
    <div class="trait-row physical-value">${survivor.physical}</div>
    <div class="trait-row mental-value">${survivor.mental}</div>
    <div class="trait-row social-value">${survivor.social}</div>
  `;

  const buttonWrap = createElement('div', { className: 'card-buttons-back' });
  const backButton = createElement('button', { className: 'rect-button' }, 'Back');
  const moreTraitsButton = createElement('button', { className: 'rect-button' }, 'Traits');
  buttonWrap.appendChild(backButton);
  buttonWrap.appendChild(moreTraitsButton);

  cardBack.appendChild(nameBox);
  cardBack.appendChild(gameplayStyleBox);
  cardBack.appendChild(traitBox);
  cardBack.appendChild(buttonWrap);

  // TRAIT CARD OVERLAY
  const traitCardOverlay = createElement('div', { className: 'trait-card-overlay hidden' });
  const traitCardWrapper = createElement('div', { className: 'trait-card-wrapper' });
  traitCardOverlay.appendChild(traitCardWrapper);

  const traitCardBg = createElement('img', { className: 'trait-card-bg' });
  traitCardBg.src = 'Assets/card-back-traits.png';
  traitCardWrapper.appendChild(traitCardBg);

  const traitCoordinates = {
    physical: [75, 141],
    mental: [168, 141],
    social: [261, 141],
    strength: [75, 201],
    memory: [168, 201],
    connections: [261, 201],
    speed: [75, 266],
    puzzles: [168, 266],
    likeability: [261, 266],
    endurance: [75, 328],
    fortitude: [168, 328],
    interrogation: [261, 328],
    dexterity: [75, 392],
    awareness: [168, 392],
    deception: [261, 392],
    balance: [75, 457],
    focus: [168, 457],
    alliances: [261, 457]
  };

  Object.entries(traitCoordinates).forEach(([key, [x, y]]) => {
    const value = survivor[key];
    const el = createElement('div', {
      className: 'trait-element',
      style: `left: ${x}px; top: ${y}px;`
    }, value?.toString() ?? '?');
    traitCardWrapper.appendChild(el);
  });

  const closeTraitCardButton = createElement('button', {
    className: 'rect-button small close-trait-card'
  }, 'Back');
  closeTraitCardButton.style.position = 'absolute';
  closeTraitCardButton.style.left = '50%';
  closeTraitCardButton.style.bottom = '30px';
  closeTraitCardButton.style.transform = 'translateX(-50%)';
  closeTraitCardButton.style.zIndex = '5';

  closeTraitCardButton.addEventListener('click', () => {
    traitCardOverlay.classList.add('hidden');
  });

  traitCardWrapper.appendChild(closeTraitCardButton);
  cardBack.appendChild(traitCardOverlay);

  moreTraitsButton.addEventListener('click', () => {
    traitCardOverlay.classList.remove('hidden');
  });

  // Combine front/back
  card.appendChild(cardFront);
  card.appendChild(cardBack);
  cardWrapper.appendChild(card);

  // Flip logic
  moreInfoButton.addEventListener('click', () => cardWrapper.classList.toggle('flipped'));
  backButton.addEventListener('click', () => cardWrapper.classList.remove('flipped'));

  return cardWrapper;
}
