/**
 * @module InventoryUI
 * Handles the player inventory grid UI and item modal interactions.
 */

import { createElement } from '../utils/DOMUtils.js';
import gameManager from '../core/GameManager.js';

const PLAYER_OWNER_ID = 'player';
const SLOT_COUNT = 9;

const InventoryUI = {
  initialized: false,
  grid: null,
  modal: null,
  slots: [],

  init() {
    if (this.initialized) return;
    this.grid = document.getElementById('inventory-items-grid');
    if (!this.grid) return;

    this.grid.innerHTML = '';
    this.slots = [];

    for (let i = 0; i < SLOT_COUNT; i += 1) {
      const slot = createElement('button', {
        className: 'inventory-grid-slot',
        type: 'button',
        'data-index': `${i}`,
        'aria-label': `Inventory slot ${i + 1}`
      });

      slot.addEventListener('click', () => {
        this.handleSlotClick(i);
      });

      this.grid.appendChild(slot);
      this.slots.push(slot);
    }

    this.ensureModal();
    this.initialized = true;
  },

  ensureModal() {
    if (this.modal) return this.modal;
    let overlay = document.getElementById('inventory-item-modal');
    if (!overlay) {
      overlay = createElement('div', {
        id: 'inventory-item-modal',
        className: 'overlay-backdrop',
        style: 'display: none;'
      });

      const panel = createElement('div', { className: 'inventory-item-panel' });
      const title = createElement('div', { className: 'inventory-item-title' });
      const text = createElement('div', { className: 'inventory-item-text' });
      const actions = createElement('div', { className: 'inventory-item-actions' });

      const destroyButton = createElement('button', { className: 'rect-button small' }, 'Destroy');
      const closeButton = createElement('button', { className: 'rect-button small' }, 'Close');

      actions.appendChild(destroyButton);
      actions.appendChild(closeButton);
      panel.appendChild(title);
      panel.appendChild(text);
      panel.appendChild(actions);
      overlay.appendChild(panel);

      overlay.addEventListener('click', (event) => {
        if (event.target === overlay) {
          this.closeModal();
        }
      });

      closeButton.addEventListener('click', () => {
        this.closeModal();
      });

      document.body.appendChild(overlay);
    }

    this.modal = overlay;
    return this.modal;
  },

  renderResources() {
    const player = gameManager.getPlayerSurvivor?.();
    if (!player) return;

    const mapping = {
      'value-fish1': player.fish1,
      'value-fish2': player.fish2,
      'value-fish3': player.fish3,
      'value-coconut': player.coconuts,
      'value-firewood': player.firewood,
      'value-water': player.water,
      'value-bamboo': player.bamboo,
      'value-palms': player.palms
    };

    for (const id in mapping) {
      const el = document.getElementById(id);
      if (el) el.textContent = mapping[id] || 0;
    }
  },

  render() {
    this.init();
    if (!this.grid) return;

    const inventorySystem = gameManager.systems?.inventorySystem;
    const items = inventorySystem?.getItems?.(PLAYER_OWNER_ID) || [];

    this.slots.forEach((slot, index) => {
      slot.innerHTML = '';
      const item = items[index];
      if (!item) return;
      const icon = createElement('img', {
        src: item.iconSrc || '',
        alt: item.name || item.type || 'Inventory item'
      });
      slot.appendChild(icon);
    });
  },

  handleSlotClick(index) {
    const inventorySystem = gameManager.systems?.inventorySystem;
    const items = inventorySystem?.getItems?.(PLAYER_OWNER_ID) || [];
    const item = items[index];
    if (!item) return;
    this.openItemModal(item);
  },

  openItemModal(item) {
    const modal = this.ensureModal();
    if (!modal) return;
    const title = modal.querySelector('.inventory-item-title');
    const text = modal.querySelector('.inventory-item-text');
    const destroyButton = modal.querySelector('.inventory-item-actions button');

    if (title) {
      title.textContent = item.name || 'Inventory Item';
    }

    if (text) {
      if (item.type === 'CLUE') {
        text.textContent = item?.data?.text || 'No clue details available.';
      } else {
        text.textContent = 'A powerful Hidden Immunity Idol. Keep it safe for Tribal Council.';
      }
    }

    if (destroyButton) {
      if (item.type === 'CLUE') {
        destroyButton.style.display = 'inline-flex';
        destroyButton.onclick = () => {
          const inventorySystem = gameManager.systems?.inventorySystem;
          inventorySystem?.removeItem?.(PLAYER_OWNER_ID, item.id);
          const player = gameManager.getPlayerSurvivor?.();
          if (player && item?.data?.clueId) {
            gameManager.systems?.idolSystem?.removeClueFromInventory?.(player.id, item.data.clueId);
          }
          this.render();
          this.closeModal();
        };
      } else {
        destroyButton.style.display = 'none';
        destroyButton.onclick = null;
      }
    }

    modal.style.display = 'flex';
  },

  closeModal() {
    if (this.modal) {
      this.modal.style.display = 'none';
    }
  }
};

window.InventoryUI = InventoryUI;

export default InventoryUI;
