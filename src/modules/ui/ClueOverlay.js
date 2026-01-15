/**
 * @module ClueOverlay
 * Handles clue inventory icon and modal display.
 */

import { createElement } from '../utils/DOMUtils.js';
import gameManager from '../core/GameManager.js';

function ensureClueModal() {
  let overlay = document.getElementById('clue-overlay');
  if (overlay) return overlay;

  overlay = createElement('div', {
    id: 'clue-overlay',
    className: 'overlay-backdrop'
  });

  const panel = createElement('div', {
    id: 'clue-panel',
    style: `
      background-image: url('Assets/Idols/clue-ui1.png');
      background-size: contain;
      background-repeat: no-repeat;
      background-position: center;
      width: min(90vw, 460px);
      height: min(80vh, 520px);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px 28px 32px;
      text-align: center;
      color: #2b190a;
      font-family: 'Survivant', sans-serif;
      position: relative;
    `
  });

  const content = createElement('div', {
    style: `
      width: min(80%, 320px);
      max-height: 85%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 12px;
    `
  });

  const title = createElement('div', {
    id: 'clue-title',
    style: `
      font-size: 1.2rem;
      text-shadow: 1px 1px 2px rgba(0,0,0,0.4);
    `
  }, 'Idol Clue');

  const expiredTag = createElement('div', {
    id: 'clue-expired-tag',
    style: `
      position: absolute;
      top: 18px;
      right: 24px;
      font-size: 0.9rem;
      font-weight: bold;
      color: #b91c1c;
      display: none;
    `
  }, 'EXPIRED');

  const text = createElement('div', {
    id: 'clue-text',
    style: `
      font-size: 1rem;
      line-height: 1.4;
      text-shadow: 1px 1px 2px rgba(255,255,255,0.4);
      max-width: 100%;
    `
  });

  const closeButton = createElement('button', {
    className: 'rect-button small',
    style: 'margin-top: 16px;'
  }, 'Close');

  closeButton.addEventListener('click', () => {
    overlay.style.display = 'none';
  });

  content.appendChild(title);
  content.appendChild(expiredTag);
  content.appendChild(text);
  content.appendChild(closeButton);
  panel.appendChild(content);
  overlay.appendChild(panel);

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) {
      overlay.style.display = 'none';
    }
  });

  document.body.appendChild(overlay);
  return overlay;
}

export function openClueModal(clue) {
  const overlay = ensureClueModal();
  const text = overlay.querySelector('#clue-text');
  const expiredTag = overlay.querySelector('#clue-expired-tag');
  const title = overlay.querySelector('#clue-title');

  if (title) {
    title.textContent = clue?.expired ? 'Idol Clue (Expired)' : 'Idol Clue';
  }

  if (text) {
    text.textContent = clue?.text || 'No clue details available.';
  }

  if (expiredTag) {
    expiredTag.style.display = clue?.expired ? 'block' : 'none';
  }

  overlay.style.display = 'flex';
}

export function renderClueInventory() {
  const inventoryOverlay = document.getElementById('inventory-overlay');
  const inventoryValues = document.getElementById('inventory-values');
  if (!inventoryOverlay || !inventoryValues) return;

  let clueSlot = document.getElementById('clue-inventory-slot');
  if (!clueSlot) {
    clueSlot = createElement('div', {
      id: 'clue-inventory-slot',
      className: 'clue-inventory-slot',
      style: `
        position: absolute;
        top: 72px;
        left: 170px;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 6px;
        cursor: pointer;
      `
    });

    const icon = createElement('img', {
      id: 'clue-inventory-icon',
      src: 'Assets/Idols/clue1.png',
      alt: 'Idol Clue',
      className: 'clue-icon'
    });

    const label = createElement('div', {
      id: 'clue-inventory-label',
      style: `
        font-size: 0.8rem;
        color: white;
        text-shadow: 1px 1px 2px black;
      `
    }, 'Clue');

    clueSlot.appendChild(icon);
    clueSlot.appendChild(label);
    inventoryValues.appendChild(clueSlot);
  }

  const player = gameManager.getPlayerSurvivor();
  const inventory = player ? gameManager.systems?.idolSystem?.getSurvivorInventory(player.id) : null;
  const activeClue = inventory?.clues?.find(clue => !clue.expired) || inventory?.clues?.[0] || null;

  if (!activeClue) {
    clueSlot.style.display = 'none';
    return;
  }

  clueSlot.style.display = 'flex';
  clueSlot.classList.toggle('clue-expired', !!activeClue.expired);

  clueSlot.onclick = () => {
    if (!activeClue) return;
    openClueModal(activeClue);
    gameManager.systems?.idolSystem?.markClueRead?.(player.id, activeClue.id);
  };
}
