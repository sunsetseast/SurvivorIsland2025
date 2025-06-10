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

  // Create survivor card overlay container (hidden by default)
  const survivorCardOverlay = createElement('div', {
    className: 'survivor-card-overlay hidden',
    style: `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(0, 0, 0, 0.8);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
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
      showSurvivorCard(member, survivorCardOverlay);
    });

    avatarGrid.appendChild(avatarWrapper);
  });

  wrapper.append(tribeImage, tribeNameOverlay, avatarGrid, bottomOverlay);
  container.appendChild(wrapper);
  container.appendChild(survivorCardOverlay);

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

function showSurvivorCard(survivor, overlayContainer) {
  clearChildren(overlayContainer);

  const cardWrapper = createElement('div', { 
    className: 'card-wrapper',
    style: `
      position: relative;
      width: 100%;
      max-width: 909px;
      height: 625px;
      transform-style: preserve-3d;
      transition: transform 0.6s;
      perspective: 1000px;
      margin: 0 auto;
    `
  });

  // Add CSS classes for card functionality
  const style = document.createElement('style');
  style.textContent = `
    .card-wrapper.flipped {
      transform: rotateY(180deg);
    }
    .card-front, .card-back {
      backface-visibility: hidden;
    }
    .card-back {
      transform: rotateY(180deg);
    }
    .hidden {
      display: none !important;
    }
    .trait-card-overlay {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.9);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10;
    }
    .trait-card-wrapper {
      position: relative;
      max-width: 90%;
      max-height: 90%;
    }
    .trait-card-bg {
      width: 100%;
      height: auto;
      display: block;
    }
    .trait-element {
      position: absolute;
      color: white;
      font-family: 'Survivant', fantasy;
      font-size: 14px;
      font-weight: bold;
      text-shadow: 1px 1px 2px black;
      transform: translate(-50%, -50%);
    }
    .name-box {
      position: absolute;
      top: 60px;
      left: 50%;
      transform: translateX(-50%);
      color: white;
      font-family: 'Survivant', fantasy;
      font-size: 18px;
      text-align: center;
      text-shadow: 1px 1px 2px black;
    }
    .gameplay-style-box {
      position: absolute;
      top: 120px;
      left: 50%;
      transform: translateX(-50%);
      color: white;
      font-family: 'Survivant', fantasy;
      font-size: 16px;
      text-align: center;
      text-shadow: 1px 1px 2px black;
      max-width: 200px;
    }
    .gameplay-style-box.small-text {
      font-size: 14px;
    }
    .trait-values {
      position: absolute;
      top: 160px;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      gap: 20px;
    }
    .trait-row {
      color: white;
      font-family: 'Survivant', fantasy;
      font-size: 24px;
      font-weight: bold;
      text-shadow: 1px 1px 2px black;
      text-align: center;
      min-width: 40px;
    }
    .card-buttons-back {
      position: absolute;
      bottom: 100px;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      gap: 12px;
    }
    .rect-button {
      padding: 10px 20px;
      background-image: url('Assets/rect-button.png');
      background-size: 100% 100%;
      background-repeat: no-repeat;
      background-position: center;
      border: none;
      color: #fff8e7;
      font-family: 'Survivant', fantasy;
      font-size: 16px;
      font-weight: bold;
      cursor: pointer;
      text-shadow: 
        0 1px 0 #000,
        0 2px 0 #000,
        0 3px 0 #000,
        0 4px 4px rgba(0, 0, 0, 0.5);
      transition: transform 0.3s;
    }
    .rect-button:hover {
      transform: scale(1.05);
    }
    .rect-button.small {
      padding: 8px 16px;
      font-size: 14px;
    }
  `;
  document.head.appendChild(style);

  const avatarFrame = createElement('div', { 
    className: 'avatar-frame',
    style: `
      position: absolute;
      top: 119px;
      left: 50%;
      transform: translateX(-50%);
      width: 220px;
      height: 220px;
      overflow: hidden;
      border-radius: 12px;
      z-index: 1;
      display: flex;
      justify-content: center;
      align-items: center;
      backface-visibility: hidden;
    `
  });
  const avatarImg = createElement('img', {
    src: survivor.avatarUrl || `Assets/Avatars/${survivor.firstName.toLowerCase()}.jpeg`,
    alt: `${survivor.firstName}'s avatar`,
    style: `
      width: 100%;
      height: 100%;
      object-fit: cover;
      object-position: top center;
      display: block;
    `
  });
  avatarFrame.appendChild(avatarImg);
  cardWrapper.appendChild(avatarFrame);

  const card = createElement('div', { 
    className: 'survivor-card',
    style: `
      width: 100%;
      max-width: 909px;
      height: 625px;
      background-size: contain;
      background-position: center;
      background-repeat: no-repeat;
      font-size: 18px;
      font-family: 'Survivant', fantasy;
      color: #333;
      border-radius: 12px;
      padding: 0;
      box-shadow: 0 3px 10px rgba(0, 0, 0, 0.2);
      margin: 0 auto;
      position: relative;
      text-align: center;
      z-index: 1;
      transform-style: preserve-3d;
      perspective: 1000px;
    `
  });
  card.dataset.id = survivor.id;

  // FRONT
  const cardFront = createElement('div', { 
    className: 'card-front',
    style: `
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      width: 100%;
      height: 100%;
      backface-visibility: hidden;
      border-radius: 12px;
      padding: 15px;
      background-image: url('Assets/card-front.png');
      background-size: contain;
      background-position: center;
      background-repeat: no-repeat;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: space-between;
      overflow: hidden;
      z-index: 2;
    `
  });
  const name = createElement('h3', { 
    className: 'survivor-header',
    style: `
      position: absolute;
      top: 99px;
      left: 50%;
      transform: translateX(-50%);
      width: 80%;
      font-size: 32px;
      font-weight: bold;
      font-family: 'Survivant', fantasy;
      color: #fff8e7;
      text-align: center;
      box-shadow: 
        0 3px 6px rgba(0, 0, 0, 0.15),
        inset 0 -2px 4px rgba(0, 0, 0, 0.2),
        inset 0 2px 6px rgba(255, 255, 255, 0.05);
      text-shadow: 
        0 1px 0 #000,
        0 2px 0 #000,
        0 3px 0 #000,
        0 4px 4px rgba(0, 0, 0, 0.5);
      z-index: 3;
      pointer-events: none;
    `
  });
  name.innerHTML = `${survivor.firstName}<br>${survivor.lastName}`;

  const moreInfoButton = createElement('button', { 
    className: 'card-button',
    style: `
      padding: 10px;
      background-image: url('Assets/rect-button.png');
      background-size: 100% 100%;
      background-repeat: no-repeat;
      background-position: center;
      border: none;
      color: #fff8e7;
      font-family: 'Survivant', fantasy;
      font-size: 16px;
      font-weight: bold;
      cursor: pointer;
      width: 120px;
      height: 60px;
      box-shadow: 
        0 3px 6px rgba(0, 0, 0, 0.15),
        inset 0 -2px 4px rgba(0, 0, 0, 0.2),
        inset 0 2px 4px rgba(255, 255, 255, 0.4);
      text-shadow: 
        0 1px 0 #000,
        0 2px 0 #000,
        0 3px 0 #000,
        0 4px 4px rgba(0, 0, 0, 0.5);
      transition: transform 0.3s;
      margin: 0 auto;
      display: block;
    `
  }, 'More Info');

  const buttonContainer = createElement('div', { 
    className: 'card-buttons',
    style: `
      display: flex;
      justify-content: center;
      gap: 12px;
      margin-top: auto;
      margin-bottom: 109px;
    `
  });
  buttonContainer.appendChild(moreInfoButton);
  cardFront.appendChild(name);
  cardFront.appendChild(buttonContainer);

  // BACK
  const cardBack = createElement('div', { 
    className: 'card-back',
    style: `
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      width: 100%;
      height: 100%;
      backface-visibility: hidden;
      border-radius: 12px;
      padding: 15px;
      background-image: url('Assets/card-back-${survivor.traitClass.toLowerCase()}.png');
      background-size: contain;
      background-position: center;
      background-repeat: no-repeat;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      transform: rotateY(180deg);
    `
  });

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

  // Close overlay button
  const closeOverlayButton = createElement('button', {
    className: 'rect-button',
    style: `
      position: absolute;
      top: 20px;
      right: 20px;
      z-index: 1001;
    `
  }, 'Close');

  closeOverlayButton.addEventListener('click', () => {
    overlayContainer.classList.add('hidden');
  });

  overlayContainer.appendChild(cardWrapper);
  overlayContainer.appendChild(closeOverlayButton);
  overlayContainer.classList.remove('hidden');

  // Close overlay when clicking outside the card
  overlayContainer.addEventListener('click', (e) => {
    if (e.target === overlayContainer) {
      overlayContainer.classList.add('hidden');
    }
  });
}