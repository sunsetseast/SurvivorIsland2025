import { gameManager } from '../../core/index.js';
import { renderAlliancesGrid } from './AlliancesOverlay.js';

let currentAllianceId = null;

function handleEscape(event) {
  if (event.key !== 'Escape') return;
  closeManageAllianceOverlay();
}

function stopPropagation(event) {
  event.stopPropagation();
}

function getAllianceSystem() {
  return gameManager?.systems?.allianceSystem || null;
}

function getPlayer() {
  return gameManager?.getPlayerSurvivor?.() || null;
}

function getSurvivorById(id) {
  return gameManager?.survivors?.find?.((s) => s.id === id) || null;
}

function renderMemberList(alliance) {
  const list = document.getElementById('manage-alliance-members');
  if (!list) return;

  list.innerHTML = '';
  alliance.memberIds.forEach((id) => {
    const survivor = getSurvivorById(id);
    const row = document.createElement('div');
    row.className = 'alliance-member-row';

    const avatar = document.createElement('img');
    avatar.src = survivor?.avatarUrl || `Assets/Avatars/${survivor?.firstName?.toLowerCase?.() || 'unknown'}.jpeg`;
    avatar.alt = survivor?.firstName || survivor?.name || 'Survivor';
    avatar.className = 'alliance-member-avatar';

    const info = document.createElement('div');
    info.className = 'alliance-member-info';

    const name = document.createElement('div');
    name.className = 'alliance-member-name';
    name.textContent = survivor?.firstName || survivor?.name || 'Unknown';

    const strength = document.createElement('div');
    strength.className = 'alliance-member-strength';
    const strengthValue = alliance.strength ?? alliance.cohesion;
    strength.textContent = typeof strengthValue === 'number' ? `Strength: ${strengthValue}` : 'Strength: TBD';

    info.appendChild(name);
    info.appendChild(strength);

    row.appendChild(avatar);
    row.appendChild(info);
    list.appendChild(row);
  });
}

function populateAllianceDetails(alliance) {
  const title = document.getElementById('manage-alliance-title');
  const nameInput = document.getElementById('manage-alliance-name-input');

  if (title) {
    title.textContent = alliance?.name || 'Alliance';
  }

  if (nameInput) {
    nameInput.value = alliance?.name || '';
  }

  renderMemberList(alliance);
}

function attachEventListeners() {
  const overlay = document.getElementById('manage-alliance-overlay');
  const panel = document.getElementById('manage-alliance-panel');
  const saveButton = document.getElementById('manage-alliance-save-button');
  const leaveButton = document.getElementById('manage-alliance-leave-button');
  const closeButton = document.getElementById('manage-alliance-close-button');

  if (overlay && !overlay.dataset.bound) {
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) {
        closeManageAllianceOverlay();
      }
    });
    overlay.dataset.bound = 'true';
  }

  if (panel && !panel.dataset.stop) {
    panel.addEventListener('click', stopPropagation);
    panel.dataset.stop = 'true';
  }

  if (saveButton && !saveButton.dataset.bound) {
    saveButton.addEventListener('click', () => {
      const allianceSystem = getAllianceSystem();
      const nameInput = document.getElementById('manage-alliance-name-input');
      if (!allianceSystem || !currentAllianceId || !nameInput) return;
      const newName = nameInput.value?.trim();
      if (!newName) return;
      allianceSystem.updateAllianceName?.(currentAllianceId, newName);
      const updated = allianceSystem.getAlliance?.(currentAllianceId);
      if (updated) {
        populateAllianceDetails(updated);
        renderAlliancesGrid();
      }
    });
    saveButton.dataset.bound = 'true';
  }

  if (leaveButton && !leaveButton.dataset.bound) {
    leaveButton.addEventListener('click', () => {
      const allianceSystem = getAllianceSystem();
      const player = getPlayer();
      if (!allianceSystem || !player || !currentAllianceId) return;
      allianceSystem.removeMember?.(currentAllianceId, player.id);
      closeManageAllianceOverlay();
      renderAlliancesGrid();
    });
    leaveButton.dataset.bound = 'true';
  }

  if (closeButton && !closeButton.dataset.bound) {
    closeButton.addEventListener('click', () => closeManageAllianceOverlay());
    closeButton.dataset.bound = 'true';
  }
}

export function openManageAllianceOverlay(allianceId) {
  const overlay = document.getElementById('manage-alliance-overlay');
  if (!overlay) return;

  const allianceSystem = getAllianceSystem();
  const alliance = allianceSystem?.getAlliance?.(allianceId);
  if (!alliance) return;

  currentAllianceId = allianceId;
  attachEventListeners();
  populateAllianceDetails(alliance);

  overlay.style.display = 'flex';
  document.addEventListener('keydown', handleEscape);
}

export function closeManageAllianceOverlay() {
  const overlay = document.getElementById('manage-alliance-overlay');
  if (!overlay) return;

  overlay.style.display = 'none';
  document.removeEventListener('keydown', handleEscape);
  currentAllianceId = null;
}

if (typeof window !== 'undefined') {
  window.openManageAllianceOverlay = openManageAllianceOverlay;
  window.closeManageAllianceOverlay = closeManageAllianceOverlay;
}
