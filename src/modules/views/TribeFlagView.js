/**
 * @module TribeFlagView
 * Renders the tribe flag screen and, on avatar click,
 * shows a fixed full-screen survivor card overlay
 * built entirely with inline styles and <img> backgrounds.
 */

import { createElement, clearChildren, addDebugBanner } from '../utils/index.js';
import { gameManager } from '../core/index.js';
import screenManager from '../core/ScreenManager.js';

export default function renderTribeFlag(container) {
  // --- Debug & Clear ---
  addDebugBanner('renderTribeFlag() called', 'teal', 40);
  clearChildren(container);
  container.style.background = "url('Assets/Screens/tribe-flag.png') center/cover no-repeat";

  // --- Get Player & Tribe ---
  const player = gameManager.getPlayerSurvivor();
  if (!player) {
    addDebugBanner('No player survivor found', 'red', 100);
    return;
  }
  const tribe = gameManager.tribes.find(t => t.members.some(m => m.id === player.id));
  if (!tribe) {
    addDebugBanner('Player tribe not found', 'orange', 130);
    return;
  }

  // --- Build Main Wrapper ---
  const wrapper = createElement('div', {
    style: `
      position:relative;
      width:100%; height:100%;
      display:flex; flex-direction:column;
      align-items:center; justify-content:center;
    `
  });

  // Tribe portrait & title
  wrapper.append(
    createElement('img', {
      src: `Assets/Tribe/${tribe.color}-portrait.png`,
      alt: tribe.name,
      style: 'width:100%; max-width:300px; z-index:1;'
    }),
    createElement('div', {
      style: `
        position:absolute; top:15%; left:50%;
        transform:translateX(-50%);
        color:white; text-shadow:2px2px4px black;
        font-size:2.4rem; font-family:'Survivant',sans-serif;
        z-index:2; pointer-events:none;
      `
    }, tribe.name.toUpperCase())
  );

  // Avatar grid
  const twoMode = tribe.members.length === 9;
  const grid = createElement('div', {
    style: `
      position:absolute;
      top:${twoMode?'27%':'28%'};
      left:50%; transform:translateX(-50%) scale(${twoMode?0.9:1.05});
      display:grid;
      grid-template-columns:repeat(${twoMode?3:2},auto);
      gap:8px 4px;
      z-index:2;
    `
  });

  tribe.members.forEach(member => {
    const cell = createElement('div', {
      style: 'display:flex; flex-direction:column; align-items:center; cursor:pointer;'
    });
    cell.addEventListener('click', () => showCard(member));

    cell.append(
      createElement('img', {
        src: member.avatarUrl || `Assets/Avatars/${member.firstName.toLowerCase()}.jpeg`,
        alt: member.firstName,
        style: `
          width:64px; height:64px;
          border-radius:50%; object-fit:cover;
          border:3px solid ${tribe.color};
        `
      }),
      createElement('span', {
        style: `
          margin-top:4px;
          font-family:'Survivant',sans-serif;
          font-size:0.85rem; color:white;
          text-shadow:1px1px2px black;
          text-align:center; width:80px; line-height:1.1;
        `
      }, member.firstName.toUpperCase())
    );

    grid.append(cell);
  });

  // Instruction text
  wrapper.append(
    grid,
    createElement('div', {
      style: `
        position:absolute; bottom:17%; left:50%;
        transform:translateX(-50%);
        color:white; text-shadow:2px2px4px black;
        font-family:'Survivant',sans-serif;
        font-size:0.85rem; z-index:2; pointer-events:none;
        width:90%; max-width:280px; text-align:center; line-height:1.3;
      `
    }, 'Click a Survivor to see more information about them.')
  );

  container.append(wrapper);
  addDebugBanner('Tribe flag view rendered!', 'limegreen', 170);

  // --- Inject Fixed Overlay Once ---
  let overlay = document.getElementById('survivor-overlay');
  if (!overlay) {
    overlay = createElement('div', {
      id: 'survivor-overlay',
      style: `
        position:fixed; top:0; left:0;
        width:100vw; height:100vh;
        background:rgba(0,0,0,0.8);
        display:none; align-items:center; justify-content:center;
        padding:20px; box-sizing:border-box; z-index:10000;
      `
    });
    document.body.append(overlay);
  }

  // --- Card Dimensions & Builder ---
  const CARD_W = 350, CARD_H = 500;

  function createSurvivorCard(s) {
    // Wrapper with perspective for 3D flip
    const cw = createElement('div', {
      style: `
        position:relative;
        width:${CARD_W}px; height:${CARD_H}px;
        perspective:1000px;
      `
    });

    // Inner card that flips
    const card = createElement('div', {
      style: `
        width:100%; height:100%;
        position:relative;
        transform-style:preserve-3d;
        transition:transform 0.6s ease-in-out;
      `
    });

    // FRONT SIDE
    const front = createElement('div', {
      style: `
        position:absolute; top:0; left:0;
        width:100%; height:100%;
        backface-visibility:hidden;
        background:url('Assets/card-front.png') center/cover no-repeat;
        display:flex; flex-direction:column; align-items:center;
      `
    });
    // Name header
    front.append(
      createElement('h3', {
        style: `
          margin-top:40px;
          color:white; text-shadow:2px2px4px black;
          text-align:center;
        `
      }, `${s.firstName}\n${s.lastName}`),
      createElement('button', {
        style: 'margin-top:auto; margin-bottom:20px; padding:8px 16px;'
      }, 'More Info')
    );

    // BACK SIDE
    const back = createElement('div', {
      style: `
        position:absolute; top:0; left:0;
        width:100%; height:100%;
        backface-visibility:hidden;
        transform:rotateY(180deg);
        background:url('Assets/card-back-${s.traitClass.toLowerCase()}.png')
                   center/cover no-repeat;
        display:flex; flex-direction:column; align-items:center;
      `
    });
    back.append(
      createElement('div', {
        style: `
          margin-top:40px;
          color:white; text-shadow:2px2px4px black;
          text-align:center;
        `
      }, `${s.firstName} ${s.lastName}`),
      createElement('button', {
        style: 'margin-top:auto; margin-bottom:20px; padding:8px 16px;'
      }, 'Back')
    );

    // Wire up flip
    front.querySelector('button').addEventListener('click', () => {
      card.style.transform = 'rotateY(180deg)';
    });
    back.querySelector('button').addEventListener('click', () => {
      card.style.transform = 'rotateY(0deg)';
    });

    cw.append(card.append(front, back));
    return cw;
  }

  // --- Show Card in Overlay ---
  function showCard(survivor) {
    addDebugBanner(`Opening card: ${survivor.firstName}`, 'yellow', 200);
    clearChildren(overlay);
    overlay.appendChild(createSurvivorCard(survivor));
    overlay.style.display = 'flex';

    // Click outside to close
    overlay.addEventListener('click', e => {
      if (e.target === overlay) overlay.style.display = 'none';
    }, { once: true });
  }

  // --- Action Bar (unchanged) ---
  const actions = document.getElementById('action-buttons');
  if (actions) {
    clearChildren(actions);
    actions.style.justifyContent = 'space-between';
    actions.style.padding = '0 40px';
    const mk = (src, alt, fn) => {
      const w = createElement('div', { style:'width:240px;height:135px;cursor:pointer;' });
      w.appendChild(createElement('img', {
        src, alt,
        style: 'width:100%;height:100%;object-fit:contain;pointer-events:none;'
      }));
      w.addEventListener('click', fn);
      return w;
    };
    actions.append(
      mk('Assets/Buttons/left.png','Left', () => screenManager.screens['camp'].loadView('beach')),
      mk('Assets/Buttons/right.png','Right',() => window.campScreen.loadView('campfire'))
    );
  }
}