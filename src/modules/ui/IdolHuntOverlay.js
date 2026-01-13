/**
 * @module IdolHuntOverlay
 * Provides overlay helpers for idol hunting menus.
 */

import { createElement } from '../utils/index.js';
import { gameManager } from '../core/index.js';
import { updateCampClockUI } from '../utils/ClockUtils.js';
import { openClueModal } from './ClueOverlay.js';
import { showHuntResultOverlay } from './HuntResultOverlay.js';

function closeOverlay(overlay) {
  if (overlay && overlay.parentNode) {
    overlay.parentNode.removeChild(overlay);
  }
}

export function openIdolHuntOptions(container, locationKey) {
  const parent = document.body;
  const overlay = createElement('div', {
    className: 'idol-hunt-overlay',
    style: `
      display: flex;
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background-color: rgba(0, 0, 0, 0.6);
      z-index: 1010;
      align-items: center;
      justify-content: center;
    `
  });

  const content = createElement('div', {
    style: `
      display: flex;
      flex-direction: column;
      align-items: center;
      background: none;
      padding: 20px;
      gap: 12px;
      z-index: 1011;
    `
  });

  const title = createElement('div', {
    style: `
      color: white;
      font-family: 'Survivant', sans-serif;
      font-size: 1.4rem;
    `
  }, 'Hunt for an Idol');

  const casualButton = createElement('button', { className: 'rect-button alt' }, 'Casual Search');
  const aggressiveButton = createElement('button', { className: 'rect-button alt' }, 'Aggressive Hunt');

  const idolSystem = gameManager.systems?.idolSystem;
  const player = gameManager.getPlayerSurvivor();
  const casualCount = player && idolSystem
    ? idolSystem.getCasualSearchCount(player.id, locationKey)
    : 0;

  if (casualCount >= 2) {
    casualButton.disabled = true;
    casualButton.style.opacity = '0.4';
    casualButton.style.cursor = 'not-allowed';
  }

  const attemptHunt = (mode) => {
    if (!player || !idolSystem) return;
    const result = idolSystem.attemptIntentionalHunt(player.id, locationKey, mode);
    const inventory = idolSystem.getSurvivorInventory?.(player.id);
    const clue = result?.clueId
      ? inventory?.clues?.find(item => item.id === result.clueId)
      : null;

    showHuntResultOverlay(result, {
      onReadClue: clue
        ? () => {
            openClueModal(clue);
            idolSystem.markClueRead?.(player.id, clue.id);
          }
        : null
    });
    updateCampClockUI(gameManager.getDayTimer(), gameManager.getCurrentDay());
    closeOverlay(overlay);
  };

  casualButton.addEventListener('click', (event) => {
    event.stopPropagation();
    if (casualButton.disabled) return;
    attemptHunt('casual');
  });

  aggressiveButton.addEventListener('click', (event) => {
    event.stopPropagation();
    attemptHunt('aggressive');
  });

  content.appendChild(title);
  content.appendChild(casualButton);
  content.appendChild(aggressiveButton);
  overlay.appendChild(content);

  overlay.addEventListener('click', (event) => {
    if (!content.contains(event.target)) {
      closeOverlay(overlay);
    }
  });

  parent.appendChild(overlay);
  return overlay;
}

export function openIdolHuntMenu(container, locationKey) {
  const parent = document.body;
  const overlay = createElement('div', {
    className: 'idol-hunt-menu-overlay',
    style: `
      display: flex;
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background-color: rgba(0, 0, 0, 0.6);
      z-index: 1007;
      align-items: center;
      justify-content: center;
    `
  });

  const content = createElement('div', {
    style: `
      display: flex;
      flex-direction: column;
      align-items: center;
      background: none;
      padding: 20px;
      gap: 12px;
      z-index: 1008;
    `
  });

  const huntButton = createElement('button', { className: 'rect-button alt' }, 'Hunt for an Idol');

  huntButton.addEventListener('click', (event) => {
    event.stopPropagation();
    closeOverlay(overlay);
    openIdolHuntOptions(container, locationKey);
  });

  content.appendChild(huntButton);
  overlay.appendChild(content);

  overlay.addEventListener('click', (event) => {
    if (!content.contains(event.target)) {
      closeOverlay(overlay);
    }
  });

  parent.appendChild(overlay);
  return overlay;
}
