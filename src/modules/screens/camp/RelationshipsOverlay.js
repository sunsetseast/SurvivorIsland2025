// src/screens/camp/RelationshipsOverlay.js

import { createElement, clearChildren } from '../../utils/index.js';
import { gameManager } from '../../core/index.js';

let selectedSurvivor = null;

export function openRelationshipsOverlay() {
  console.log('Opening relationships overlay...');

  // Force refresh relationship data by logging current state
  if (gameManager.systems && gameManager.systems.relationshipSystem) {
    // Ensure all relationships exist before displaying
    gameManager.systems.relationshipSystem.ensureAllRelationships();

    const allRelationships = gameManager.systems.relationshipSystem.getRelationships();
    console.log('Current relationships data:', allRelationships);
    console.log('Total relationships:', Object.keys(allRelationships).length);
  }

  // Add a tiny delay to ensure any pending relationship updates are processed
  setTimeout(() => {
    openRelationshipsOverlayImmediate();
  }, 50);
}

function openRelationshipsOverlayImmediate() {
  const overlay = document.getElementById('relationships-overlay');
  const tribeImage = document.getElementById('relationships-tribe-image');
  const grid = document.getElementById('relationships-grid');

  if (!overlay || !tribeImage || !grid) {
    console.error('Relationships overlay elements not found');
    return;
  }

  overlay.style.display = 'block';
  clearChildren(grid);

  const player = gameManager.getPlayerSurvivor();
  if (!player) {
    console.error('No player survivor found');
    return;
  }

  const tribe = gameManager.tribes.find(t => t.members.some(m => m.id === player.id));
  if (!tribe) {
    console.error('Player tribe not found');
    return;
  }

  console.log('Tribe found:', tribe.name, 'Members:', tribe.members.length);

  // Force reset to player if flag is set
  if (window.resetRelationshipsOverlayToPlayer || !selectedSurvivor || !tribe.members.some(m => m.id === selectedSurvivor.id)) {
    selectedSurvivor = player;
    window.resetRelationshipsOverlayToPlayer = false;
  }

  // Set tribe background image
  tribeImage.src = `Assets/Tribe/${tribe.color}-portrait.png`;

  // Set tribe name
  if (window.setRelationshipsTribeName) {
    window.setRelationshipsTribeName(tribe.name);
  }

  // Place the selected survivor in the center
  const centerWrapper = createElement('div', {
    style: `
      grid-column: 2;
      grid-row: 2;
      display: flex;
      flex-direction: column;
      align-items: center;
      z-index: 5;
    `
  });

  const centerAvatar = createElement('img', {
    src: selectedSurvivor.avatarUrl || `Assets/Avatars/${selectedSurvivor.firstName.toLowerCase()}.jpeg`,
    alt: selectedSurvivor.firstName,
    style: `
      width: 72px;
      height: 72px;
      border-radius: 50%;
      object-fit: cover;
      border: 4px solid gold;
      background: #000;
    `
  });

  const centerName = createElement('span', {
    style: `
      font-family: 'Survivant', sans-serif;
      font-size: 0.85rem;
      color: white;
      margin-top: 4px;
      text-shadow: 1px 1px 2px black;
    `
  }, selectedSurvivor.firstName.toUpperCase());

  centerWrapper.appendChild(centerAvatar);
  centerWrapper.appendChild(centerName);
  grid.appendChild(centerWrapper);

  // Surrounding positions (8 positions around center)
  const positions = [
    [1, 1], [1, 2], [1, 3],  // Top row
    [2, 1],         [2, 3],  // Middle row (center is [2,2])
    [3, 1], [3, 2], [3, 3],  // Bottom row
  ];

  // Get other tribe members (excluding selected survivor)
  const otherMembers = tribe.members.filter(member => member.id !== selectedSurvivor.id);
  console.log('Other members to display:', otherMembers.length);

  // Place surrounding members
  otherMembers.forEach((member, index) => {
    if (index >= positions.length) {
      console.warn('More members than available positions');
      return;
    }

    const [row, col] = positions[index];
    console.log(`Placing ${member.firstName} at position [${row}, ${col}]`);

    const wrapper = createElement('div', {
      style: `
        grid-row: ${row};
        grid-column: ${col};
        display: flex;
        flex-direction: column;
        align-items: center;
        cursor: pointer;
        z-index: 1;
      `
    });

    // Force immediate relationship lookup for border calculation
    const relationshipBorder = getRelationshipBorder(selectedSurvivor.id, member.id);
    console.log(`Border for ${selectedSurvivor.firstName} → ${member.firstName}: ${relationshipBorder}`);

    // Additional debug: log the actual relationship value
    const debugRelationship = gameManager.systems.relationshipSystem.getRelationship(selectedSurvivor.id, member.id);
    console.log(`  -> Actual relationship value: ${debugRelationship ? debugRelationship.value : 'not found'}`);

    const avatar = createElement('img', {
      src: member.avatarUrl || `Assets/Avatars/${member.firstName.toLowerCase()}.jpeg`,
      alt: member.firstName,
      style: `
        width: 64px;
        height: 64px;
        border-radius: 50%;
        object-fit: cover;
        border: ${relationshipBorder};
        background: #000;
      `
    });

    // Add click event to switch to this member
    avatar.addEventListener('click', (e) => {
      e.preventDefault();
      console.log(`Switching to ${member.firstName}`);
      selectedSurvivor = member;
      openRelationshipsOverlay(); // Refresh the overlay
    });

    const name = createElement('span', {
      style: `
        font-family: 'Survivant', sans-serif;
        font-size: 0.85rem;
        color: white;
        margin-top: 4px;
        text-align: center;
        text-shadow: 1px 1px 2px black;
        max-width: 80px;
        word-wrap: break-word;
      `
    }, member.firstName.toUpperCase());

    wrapper.appendChild(avatar);
    wrapper.appendChild(name);
    grid.appendChild(wrapper);
  });

  // Add instructional text below the grid (outside the grid container)
  const instructionText = createElement('div', {
    style: `
      position: absolute;
      bottom: 100px;
      left: 50%;
      transform: translateX(-50%);
      width: 245px;
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 10;
    `
  });

  const textSpan = createElement('span', {
    style: `
      font-family: 'Survivant', sans-serif;
      font-size: 0.9rem;
      color: white;
      text-align: center;
      text-shadow: 1px 1px 2px black;
    `
  }, 'SELECT A SURVIVOR TO VIEW THEIR CURRENT RELATIONSHIPS.');

  instructionText.appendChild(textSpan);
  overlay.appendChild(instructionText);

  console.log('Relationships overlay populated with', otherMembers.length, 'surrounding members');
}

function getRelationshipBorder(fromId, toId) {
  // Same person - gold border
  if (fromId === toId) return '4px solid gold';

  // Try to get relationship value
  try {
    if (!gameManager.systems || !gameManager.systems.relationshipSystem) {
      console.warn('Relationship system not available');
      return '2px solid white';
    }

    // Get fresh relationship data every time - multiple attempts
    const relationshipSystem = gameManager.systems.relationshipSystem;
    const allRelationships = relationshipSystem.getRelationships();
    const relationshipKey = fromId < toId ? `${fromId}_${toId}` : `${toId}_${fromId}`;
    const directRelationship = allRelationships[relationshipKey];
    const methodRelationship = relationshipSystem.getRelationship(fromId, toId);

    // Use whichever method works
    const relationship = directRelationship || methodRelationship;
    const value = relationship ? relationship.value : 50; // Default to neutral if no relationship found

    // Enhanced debug log with survivor names for clarity
    const fromSurvivor = gameManager.survivors.find(s => s.id === fromId);
    const toSurvivor = gameManager.survivors.find(s => s.id === toId);
    const fromName = fromSurvivor ? fromSurvivor.firstName : `ID:${fromId}`;
    const toName = toSurvivor ? toSurvivor.firstName : `ID:${toId}`;

    console.log(`Relationship border: ${fromName} → ${toName} = ${value} (key: ${relationshipKey}, direct: ${!!directRelationship}, method: ${!!methodRelationship})`);

    if (value === 100) return '4px solid gold';
    if (value >= 76) return '3px solid green';
    if (value >= 51) return '2px solid green';
    if (value === 50) return '1px solid white';
    if (value >= 25) return '2px solid red';
    return '4px solid red';
  } catch (error) {
    console.warn('Could not get relationship value:', error);
    // Default to neutral border if relationship system isn't working
    return '2px solid white';
  }
}