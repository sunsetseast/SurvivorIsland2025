import { gameManager } from '../../core/index.js';
import { renderAlliancesGrid } from './AlliancesOverlay.js';

const state = {
  initialized: false,
  eligible: [],
  selectedIds: new Set(),
};

function handleEscape(event) {
  if (event.key !== 'Escape') return;
  closeCreateAllianceOverlay();
}

function stopPropagation(event) {
  event.stopPropagation();
}

function getAllianceSystem() {
  return gameManager?.systems?.allianceSystem || null;
}

function getPlayer() {
  return gameManager?.getPlayerSurvivor?.() || gameManager?.player || null;
}

function updateCreateButtonState() {
  const createButton = document.getElementById('create-alliance-create-button');
  if (createButton) {
    createButton.disabled = state.selectedIds.size === 0;
  }
}

function toggleSelection(survivorId, chip) {
  if (!survivorId) return;
  if (state.selectedIds.has(survivorId)) {
    state.selectedIds.delete(survivorId);
    chip?.classList?.remove('selected');
  } else {
    state.selectedIds.add(survivorId);
    chip?.classList?.add('selected');
  }
  updateCreateButtonState();
}

function renderEligibleSurvivors() {
  const container = document.getElementById('create-alliance-members');
  if (!container) return;

  container.innerHTML = '';

  state.eligible.forEach((survivor) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'alliance-chip';
    chip.dataset.id = survivor.id;

    const avatar = document.createElement('img');
    avatar.src = survivor.avatarUrl || `Assets/Avatars/${survivor.firstName?.toLowerCase?.() || 'unknown'}.jpeg`;
    avatar.alt = survivor.firstName || survivor.name || 'Survivor';

    const label = document.createElement('span');
    label.textContent = survivor.firstName || survivor.name || 'Unknown';

    chip.appendChild(avatar);
    chip.appendChild(label);

    chip.addEventListener('click', (event) => {
      event.stopPropagation();
      toggleSelection(survivor.id, chip);
    });

    container.appendChild(chip);
  });

  updateCreateButtonState();
}

function buildAllianceName() {
  const allianceSystem = getAllianceSystem();
  const count = allianceSystem?.getAllAlliances?.().length ?? allianceSystem?.alliances?.length ?? 0;
  return `Alliance ${count + 1}`;
}

function handleCreate() {
  const allianceSystem = getAllianceSystem();
  const player = getPlayer();
  if (!allianceSystem || !player) {
    closeCreateAllianceOverlay();
    return;
  }

  const selected = Array.from(state.selectedIds);
  if (selected.length === 0) return;

  const tribe = gameManager?.getPlayerTribe?.();
  const memberIds = [player.id, ...selected];
  const name = buildAllianceName();

  if (typeof allianceSystem.createAlliance === 'function') {
    allianceSystem.createAlliance({
      name,
      memberIds,
      tribeId: tribe?.id ?? null,
      leaderId: player.id,
    });
  }

  closeCreateAllianceOverlay();
  renderAlliancesGrid();
}

function attachEventListeners() {
  const overlay = document.getElementById('create-alliance-overlay');
  const panel = document.getElementById('create-alliance-panel');
  const cancelButton = document.getElementById('create-alliance-cancel-button');
  const createButton = document.getElementById('create-alliance-create-button');

  if (overlay && !state.initialized) {
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) {
        closeCreateAllianceOverlay();
      }
    });
  }

  if (panel && !panel.dataset.stop) {
    panel.addEventListener('click', stopPropagation);
    panel.dataset.stop = 'true';
  }

  if (cancelButton && !cancelButton.dataset.bound) {
    cancelButton.addEventListener('click', () => closeCreateAllianceOverlay());
    cancelButton.dataset.bound = 'true';
  }

  if (createButton && !createButton.dataset.bound) {
    createButton.addEventListener('click', handleCreate);
    createButton.dataset.bound = 'true';
  }

  state.initialized = true;
}

export function openCreateAllianceOverlay(eligibleSurvivors = []) {
  const overlay = document.getElementById('create-alliance-overlay');
  if (!overlay) return;

  state.eligible = eligibleSurvivors;
  state.selectedIds.clear();

  attachEventListeners();
  renderEligibleSurvivors();
  updateCreateButtonState();

  overlay.style.display = 'flex';
  document.addEventListener('keydown', handleEscape);
}

export function closeCreateAllianceOverlay() {
  const overlay = document.getElementById('create-alliance-overlay');
  if (!overlay) return;

  overlay.style.display = 'none';
  document.removeEventListener('keydown', handleEscape);
  state.selectedIds.clear();
}

if (typeof window !== 'undefined') {
  window.openCreateAllianceOverlay = openCreateAllianceOverlay;
  window.closeCreateAllianceOverlay = closeCreateAllianceOverlay;
}
