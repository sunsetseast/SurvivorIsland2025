import { gameManager } from '../../core/index.js';
import { openCreateAllianceOverlay } from './CreateAllianceOverlay.js';
import { openManageAllianceOverlay } from './ManageAllianceOverlay.js';

const alliancesState = {
  initialized: false,
  slotCount: 6,
};

function getAllianceSystem() {
  return gameManager?.systems?.allianceSystem || null;
}

function getRelationshipValue(playerId, memberId) {
  const relationshipSystem = gameManager?.systems?.relationshipSystem;
  if (!relationshipSystem) return 0;

  if (typeof relationshipSystem.getRelationshipValue === 'function') {
    return relationshipSystem.getRelationshipValue(playerId, memberId) ?? 0;
  }

  const relationship = relationshipSystem.getRelationship?.(playerId, memberId);
  if (relationship && typeof relationship.value === 'number') {
    return relationship.value;
  }

  return 0;
}

function isAlreadyAllied(playerId, memberId) {
  const allianceSystem = getAllianceSystem();
  if (!allianceSystem || !playerId || !memberId) return false;

  if (typeof allianceSystem.areAllied === 'function') {
    return allianceSystem.areAllied(playerId, memberId);
  }

  const alliances = allianceSystem.getAlliancesForSurvivor?.(playerId) || [];
  return alliances.some(alliance => alliance.memberIds?.includes?.(memberId));
}

function determineEligibleSurvivors() {
  const player = gameManager?.getPlayerSurvivor?.() || gameManager?.player;
  const tribe = gameManager?.getPlayerTribe?.();
  const allianceSystem = getAllianceSystem();

  if (!player || !tribe || !Array.isArray(tribe.members)) {
    return [];
  }

  const tribeMembers = tribe.members.filter(member => member.id !== player.id);
  const threshold = allianceSystem?.minRelationshipForInvite ?? 60;

  return tribeMembers.filter(member => {
    const relationshipValue = getRelationshipValue(player.id, member.id);
    const eligible = relationshipValue >= threshold && !isAlreadyAllied(player.id, member.id);
    return eligible;
  });
}

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
  const panel = document.getElementById('alliances-panel');

  if (overlay) {
    overlay.addEventListener('click', handleBackdropClick);
  }

  if (panel) {
    panel.addEventListener('click', (event) => event.stopPropagation());
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
  const allianceSystem = getAllianceSystem();
  const player = gameManager?.getPlayerSurvivor?.() || gameManager?.player;
  const committedId = player ? allianceSystem?.getCommittedAllianceId?.(player.id) : null;
  const alliances = (player && allianceSystem?.getAlliancesForSurvivor?.(player.id))
    || allianceSystem?.getAlliances?.()
    || allianceSystem?.getAllAlliances?.()
    || [];
  const activeAlliances = alliances.filter(alliance => alliance?.active !== false && (!player || alliance.memberIds?.includes?.(player.id)));

  const slotsToRender = Math.max(Math.max(activeAlliances.length + 1, 4), alliancesState.slotCount);

  const getSurvivorById = (id) => gameManager?.survivors?.find?.(survivor => survivor.id === id) || null;

  for (let i = 0; i < slotsToRender; i += 1) {
    if (i < activeAlliances.length) {
      const alliance = activeAlliances[i];
      const slot = document.createElement('button');
      slot.type = 'button';
      slot.className = 'alliance-slot alliance-existing-slot';
      slot.title = alliance.name;

      const isCommitted = committedId && alliance.id === committedId;
      if (isCommitted) {
        slot.classList.add('primary');
        const badge = document.createElement('div');
        badge.className = 'alliance-slot-badge';
        badge.textContent = 'PRIMARY';
        slot.appendChild(badge);
      }

      const membersWrapper = document.createElement('div');
      membersWrapper.className = 'alliance-slot-members';
      const members = alliance.memberIds?.map?.(id => getSurvivorById(id)).filter(Boolean) || [];
      const membersToShow = members.slice(0, 4);

      membersToShow.forEach((member) => {
        const avatar = document.createElement('img');
        avatar.src = member.avatarUrl || `Assets/Avatars/${member.firstName?.toLowerCase?.() || 'unknown'}.jpeg`;
        avatar.alt = member.firstName || member.name || 'Member';
        avatar.className = 'alliance-slot-avatar';
        membersWrapper.appendChild(avatar);
      });

      if (members.length > 4) {
        const extra = document.createElement('div');
        extra.className = 'alliance-slot-extra';
        extra.textContent = `+${members.length - 4}`;
        membersWrapper.appendChild(extra);
      }

      const label = document.createElement('div');
      label.className = 'alliance-slot-name';
      label.textContent = alliance.name || 'Alliance';

      slot.appendChild(membersWrapper);
      slot.appendChild(label);

      slot.addEventListener('click', (event) => {
        event.stopPropagation();
        openManageAllianceOverlay(alliance.id);
      });

      grid.appendChild(slot);
      continue;
    }

    if (i === activeAlliances.length) {
      const slot = document.createElement('button');
      slot.className = 'alliance-slot alliance-add-slot';
      slot.id = 'alliances-add-button';
      slot.type = 'button';

      const addImage = document.createElement('img');
      addImage.src = 'Assets/Buttons/add.png';
      addImage.alt = 'Add Alliance';

      slot.appendChild(addImage);
      slot.addEventListener('click', (event) => {
        event.stopPropagation();
        const eligible = determineEligibleSurvivors();
        if (!eligible.length) {
          if (typeof window !== 'undefined' && window.dialogueSystem && typeof window.dialogueSystem.showMessage === 'function') {
            window.dialogueSystem.showMessage('No one trusts you enough yet to form an alliance.');
          } else {
            alert('No one trusts you enough yet to form an alliance.');
          }
          return;
        }
        openCreateAllianceOverlay(eligible);
      });

      grid.appendChild(slot);
      continue;
    }

    const slot = document.createElement('div');
    slot.className = 'alliance-slot';
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
