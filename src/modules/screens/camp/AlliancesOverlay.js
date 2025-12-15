const alliancesState = {
  initialized: false,
  slotCount: 6,
};

function handleBackdropClick(event) {
  const overlay = document.getElementById('alliances-overlay');
  const panel = document.getElementById('alliances-panel');

  if (!overlay) return;

  if (event.target === overlay && (!panel || !panel.contains(event.target))) {
    closeAlliancesOverlay();
  }
}

function handleEscape(event) {
  if (event.key !== 'Escape') return;
  closeAlliancesOverlay();
}

function setupAlliancesOverlay() {
  if (alliancesState.initialized) return;

  const overlay = document.getElementById('alliances-overlay');
  const closeButton = document.getElementById('alliances-close-button');

  if (overlay) {
    overlay.addEventListener('click', handleBackdropClick);
  }

  if (closeButton) {
    closeButton.addEventListener('click', () => {
      closeAlliancesOverlay();
    });
  }

  alliancesState.initialized = true;
}

export function renderAlliancesGrid() {
  const grid = document.getElementById('alliances-grid');
  if (!grid) return;

  grid.innerHTML = '';
  const slotsToRender = Math.max(4, alliancesState.slotCount);

  for (let i = 0; i < slotsToRender; i += 1) {
    const slot = i === 0 ? document.createElement('button') : document.createElement('div');
    slot.className = i === 0 ? 'alliance-slot alliance-add-slot' : 'alliance-slot';

    if (i === 0) {
      slot.id = 'alliances-add-button';

      const addImage = document.createElement('img');
      addImage.src = 'Assets/Buttons/add.png';
      addImage.alt = 'Add Alliance';

      slot.appendChild(addImage);
      slot.addEventListener('click', (event) => {
        event.stopPropagation();
        if (typeof window !== 'undefined' && window.dialogueSystem && typeof window.dialogueSystem.showMessage === 'function') {
          window.dialogueSystem.showMessage('Alliance creation coming next!');
        } else {
          alert('Alliance creation coming next!');
        }
      });
    }

    grid.appendChild(slot);
  }
}

export function openAlliancesOverlay() {
  setupAlliancesOverlay();
  const overlay = document.getElementById('alliances-overlay');
  if (!overlay) return;

  renderAlliancesGrid();
  overlay.style.display = 'flex';
  document.addEventListener('keydown', handleEscape);
}

export function closeAlliancesOverlay() {
  const overlay = document.getElementById('alliances-overlay');
  if (!overlay) return;

  overlay.style.display = 'none';
  document.removeEventListener('keydown', handleEscape);
}

if (typeof window !== 'undefined') {
  window.openAlliancesOverlay = openAlliancesOverlay;
  window.closeAlliancesOverlay = closeAlliancesOverlay;
}
