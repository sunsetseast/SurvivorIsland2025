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
}