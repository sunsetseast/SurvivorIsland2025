import { gameManager } from '../core/index.js';

export function refreshMenuCard() {
  const player = gameManager.player;
  const tribes = gameManager.tribes;

  const avatarImg = document.getElementById('menu-avatar');
  const nameText = document.getElementById('menu-name');

  // Safety check: ensure all required elements and data exist
  if (!player || !avatarImg || !nameText || !tribes) return;

  // Load avatar
  avatarImg.src = player.avatarUrl || `Assets/Avatars/${player.firstName.toLowerCase()}.jpeg`;

  // Find the player's tribe
  const tribe = tribes.find(t => t.members.some(m => m.id === player.id));
  const tribeColor = tribe ? tribe.color : 'white';

  // Set player name and apply tribe color styling
  nameText.textContent = player.firstName.toUpperCase();
  nameText.style.color = tribeColor;

  // Update stats display
  const threatElement = document.getElementById('value-threat');
  const teamPlayerElement = document.getElementById('value-team-player');
  const hungerDisplayElement = document.getElementById('value-hunger-display');

  if (threatElement) {
    const threatValue = player.threat || 0;
    threatElement.textContent = threatValue;
  }

  if (teamPlayerElement) {
    const teamPlayerValue = player.teamPlayer || 0;
    teamPlayerElement.textContent = teamPlayerValue;
  }

  if (hungerDisplayElement) {
    const hungerValue = player.hunger || 0;
    hungerDisplayElement.textContent = hungerValue;
  }
}