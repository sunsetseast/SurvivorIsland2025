
/**
 * @module SummaryView
 * Renders the summary of camp activities after the 2-hour timer expires
 */

import { createElement, clearChildren, addDebugBanner } from '../utils/index.js';
import { gameManager } from '../core/index.js';
import { getRandomInt } from '../utils/CommonUtils.js';
import { getPlayerActivitySummary } from '../utils/ActivityTracker.js';

// Track camp activities
if (!window.campActivityTracker) {
  window.campActivityTracker = {
    playerActions: [],
    npcActions: [],
    relationships: {},
    resourcesGathered: {},
    fireAttempts: [],
    shelterBuilders: [],
    leadershipActions: [],
    bonding: [],
    conflicts: []
  };
}

export default function renderSummary(container) {
  console.log('renderSummary() called');
  addDebugBanner('renderSummary() called', 'purple', 40);

  clearChildren(container);

  const playerTribe = gameManager.getPlayerTribe();
  if (!playerTribe) {
    console.error('No player tribe found for summary');
    return;
  }

  // Set background based on tribe color
  const tribeColor = playerTribe.tribeColor;
  container.style.backgroundImage = `url('Assets/Tribe/${tribeColor}-portrait.png')`;
  container.style.backgroundSize = 'cover';
  container.style.backgroundPosition = 'center';
  container.style.backgroundRepeat = 'no-repeat';

  // Generate summary content
  const summaryData = generateSummaryData();
  
  // Apply all the changes to game state
  applySummaryChanges(summaryData);

  const wrapper = createElement('div', {
    className: 'summary-wrapper',
    style: `
      position: relative;
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: flex-start;
      overflow-y: auto;
      padding: 20px;
      background: rgba(0, 0, 0, 0.3);
    `
  });

  const title = createElement('h2', {
    style: `
      color: white;
      text-shadow: 2px 2px 4px black;
      font-size: 2.2rem;
      font-family: 'Survivant', sans-serif;
      text-align: center;
      margin-bottom: 20px;
      border-bottom: 2px solid white;
      padding-bottom: 10px;
    `
  }, `Day 1 Summary - ${playerTribe.tribeName} Tribe`);

  const summaryContent = createElement('div', {
    style: `
      background: rgba(0, 0, 0, 0.7);
      border-radius: 15px;
      padding: 25px;
      max-width: 800px;
      color: white;
      font-family: 'Survivant', sans-serif;
      font-size: 1.1rem;
      line-height: 1.6;
      border: 2px solid rgba(255, 255, 255, 0.3);
    `
  });

  // Create summary text
  let summaryText = generateSummaryText(summaryData);
  
  const textElement = createElement('div', {
    style: `
      text-shadow: 1px 1px 2px black;
    `
  });
  textElement.innerHTML = summaryText;

  summaryContent.appendChild(textElement);
  wrapper.appendChild(title);
  wrapper.appendChild(summaryContent);
  container.appendChild(wrapper);

  // --- Action Bar Buttons ---
  const actionButtons = document.getElementById('action-buttons');
  if (actionButtons) {
    clearChildren(actionButtons);

    actionButtons.style.justifyContent = 'center';
    actionButtons.style.gap = '20px';
    actionButtons.style.padding = '0';

    const createButton = (text, onClick) => {
      const button = createElement('div', {
        style: `
          background-image: url('Assets/Buttons/blank.png');
          background-size: contain;
          background-repeat: no-repeat;
          background-position: center;
          width: 200px;
          height: 100px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: transform 0.1s ease;
          font-family: 'Survivant', sans-serif;
          font-size: 1rem;
          color: #8B4513;
          font-weight: bold;
          text-shadow: 1px 1px 1px rgba(255,255,255,0.8);
        `
      }, text);

      button.addEventListener('mouseenter', () => {
        button.style.transform = 'scale(1.05)';
      });

      button.addEventListener('mouseleave', () => {
        button.style.transform = 'scale(1)';
      });

      if (onClick) button.addEventListener('click', onClick);
      return button;
    };

    const continueButton = createButton('Continue to Challenge', () => {
      console.log('Continue to Challenge clicked');
      gameManager.advanceGamePhase();
    });

    actionButtons.appendChild(continueButton);
  }

  addDebugBanner('Summary view rendered!', 'purple', 170);
}

function generateSummaryData() {
  const playerTribe = gameManager.getPlayerTribe();
  const player = gameManager.getPlayerSurvivor();
  const tribeMembers = playerTribe.members.filter(m => !m.isPlayer);
  
  const data = {
    leadership: [],
    fireAttempts: [],
    shelterBuilders: [],
    resourceGathering: {},
    relationships: [],
    playerActions: window.campActivityTracker.playerActions || [],
    currentFire: playerTribe.fire || 0,
    currentShelter: playerTribe.shelter || 0
  };

  // Determine leadership based on gameplay styles and traits
  const leadershipCandidates = tribeMembers.filter(m => 
    m.gameplayStyle === 'Power Player' || 
    m.gameplayStyle === 'Social Genius' || 
    m.traitClass === 'Mental'
  );
  
  if (leadershipCandidates.length > 0) {
    const leader = leadershipCandidates[getRandomInt(0, leadershipCandidates.length - 1)];
    data.leadership.push(leader);
  }

  // Determine fire attempts - prioritize physical survivors and player if they did fire activities
  const fireBuilders = [];
  const playerDidFire = data.playerActions.some(action => action.includes('fire') || action.includes('Fire'));
  
  if (playerDidFire) {
    fireBuilders.push({ survivor: player, success: data.currentFire > 0 });
  } else {
    const physicalSurvivors = tribeMembers.filter(m => m.traitClass === 'Physical');
    if (physicalSurvivors.length > 0) {
      const fireBuilder = physicalSurvivors[getRandomInt(0, physicalSurvivors.length - 1)];
      const success = Math.random() < 0.6; // 60% success rate
      fireBuilders.push({ survivor: fireBuilder, success });
      if (success && data.currentFire === 0) {
        data.currentFire = 1;
      }
    }
  }
  data.fireAttempts = fireBuilders;

  // Determine shelter builders - need 2 survivors
  const playerDidShelter = data.playerActions.some(action => action.includes('shelter') || action.includes('Shelter'));
  
  if (playerDidShelter) {
    // Player built shelter, pick a co-builder
    const coBuilder = tribeMembers[getRandomInt(0, tribeMembers.length - 1)];
    data.shelterBuilders = [player, coBuilder];
  } else {
    // Pick 2 NPCs to build shelter
    const shuffled = [...tribeMembers].sort(() => Math.random() - 0.5);
    data.shelterBuilders = shuffled.slice(0, 2);
  }

  // Set shelter level if builders were chosen
  if (data.shelterBuilders.length === 2 && data.currentShelter === 0) {
    data.currentShelter = 1;
  }

  // Generate resource gathering for each survivor
  tribeMembers.forEach(survivor => {
    const resourceCount = getRandomInt(0, 3);
    const resources = ['fish', 'coconuts', 'palms', 'bamboo', 'firewood'];
    const gathered = [];
    
    for (let i = 0; i < resourceCount; i++) {
      const resource = resources[getRandomInt(0, resources.length - 1)];
      if (!gathered.includes(resource)) {
        gathered.push(resource);
      }
    }
    
    data.resourceGathering[survivor.id] = gathered;
  });

  // Ensure shelter builders have palms and bamboo
  data.shelterBuilders.forEach(builder => {
    if (!builder.isPlayer) {
      if (!data.resourceGathering[builder.id].includes('palms')) {
        data.resourceGathering[builder.id].push('palms');
      }
      if (!data.resourceGathering[builder.id].includes('bamboo')) {
        data.resourceGathering[builder.id].push('bamboo');
      }
    }
  });

  // Ensure fire builders have firewood
  data.fireAttempts.forEach(attempt => {
    if (!attempt.survivor.isPlayer) {
      if (!data.resourceGathering[attempt.survivor.id].includes('firewood')) {
        data.resourceGathering[attempt.survivor.id].push('firewood');
      }
    }
  });

  // Generate relationship changes
  const relationshipSystem = gameManager.systems.relationshipSystem;
  if (relationshipSystem) {
    // Create some bonding pairs
    for (let i = 0; i < 2; i++) {
      if (tribeMembers.length >= 2) {
        const pair = [...tribeMembers].sort(() => Math.random() - 0.5).slice(0, 2);
        if (Math.random() < 0.7) {
          data.relationships.push({
            survivors: pair,
            type: 'bonding',
            change: getRandomInt(5, 12)
          });
        }
      }
    }

    // Potential conflicts
    if (Math.random() < 0.4) {
      const conflictPair = [...tribeMembers].sort(() => Math.random() - 0.5).slice(0, 2);
      data.relationships.push({
        survivors: conflictPair,
        type: 'conflict',
        change: -getRandomInt(3, 8)
      });
    }
  }

  return data;
}

function generateSummaryText(data) {
  const playerTribe = gameManager.getPlayerTribe();
  const player = gameManager.getPlayerSurvivor();
  const playerActivities = getPlayerActivitySummary();
  
  let text = `<p><strong>The first two hours at ${playerTribe.tribeName} camp have set the stage for the days ahead...</strong></p>`;

  // Player-specific activities first
  text += `<p><strong>Your Activities:</strong> `;
  
  // Fishing
  if (playerActivities.fishing.attempts > 0) {
    text += `You attempted to fish ${playerActivities.fishing.attempts} time${playerActivities.fishing.attempts > 1 ? 's' : ''}`;
    if (playerActivities.fishing.totalFishCaught > 0) {
      text += ` and successfully caught ${playerActivities.fishing.totalFishCaught} fish. `;
    } else {
      text += ` but didn't catch anything. `;
    }
  }

  // Fire building
  if (playerActivities.fire.attempts > 0 || playerActivities.fire.tendAttempts > 0) {
    if (playerActivities.fire.attempts > 0) {
      text += `You attempted to build fire`;
      if (playerActivities.fire.successful) {
        text += ` and succeeded! `;
      } else {
        text += ` but were unsuccessful. `;
      }
    }
    if (playerActivities.fire.tendAttempts > 0) {
      text += `You tended the fire ${playerActivities.fire.tendAttempts} time${playerActivities.fire.tendAttempts > 1 ? 's' : ''}`;
      if (playerActivities.fire.tendSuccessful > 0) {
        text += ` successfully ${playerActivities.fire.tendSuccessful} time${playerActivities.fire.tendSuccessful > 1 ? 's' : ''}. `;
      } else {
        text += ` but were unsuccessful. `;
      }
    }
  }

  // Shelter building
  if (playerActivities.shelter.attempts > 0) {
    if (playerActivities.shelter.successful) {
      text += `You successfully built shelter with ${playerActivities.shelter.coBuilders.join(', ')}. `;
    } else {
      text += `You attempted to build shelter but were unsuccessful. `;
    }
  }

  // Resource gathering
  const resourceSummary = [];
  Object.keys(playerActivities.resources).forEach(resource => {
    const data = playerActivities.resources[resource];
    if (data.attempts > 0) {
      if (data.gathered > 0) {
        resourceSummary.push(`${data.gathered} ${resource}`);
      } else {
        resourceSummary.push(`attempted to gather ${resource} but got none`);
      }
    }
  });
  if (resourceSummary.length > 0) {
    text += `You gathered ${resourceSummary.join(', ')}. `;
  }

  // Water gathering
  if (playerActivities.water.attempts > 0) {
    if (playerActivities.water.forSelf > 0 && playerActivities.water.forTribe > 0) {
      text += `You gathered water for yourself and for the entire tribe. `;
    } else if (playerActivities.water.forSelf > 0) {
      text += `You gathered water for yourself. `;
    } else if (playerActivities.water.forTribe > 0) {
      text += `You gathered water for the entire tribe, showing great teamwork. `;
    }
  }
  text += `</p>`;

  // Leadership
  if (data.leadership.length > 0) {
    const leader = data.leadership[0];
    text += `<p><strong>Leadership:</strong> ${leader.firstName} ${leader.lastName} stepped up as a natural leader, organizing the tribe's initial efforts. Their authoritative presence has increased their threat level.</p>`;
  }

  // NPC activities
  let npcActivities = [];
  Object.keys(data.resourceGathering).forEach(survivorId => {
    const survivor = playerTribe.members.find(m => m.id == survivorId);
    if (survivor && !survivor.isPlayer) {
      const resources = data.resourceGathering[survivorId];
      if (resources.length > 0) {
        npcActivities.push(`${survivor.firstName} gathered ${resources.join(', ')}`);
      }
    }
  });
  
  if (npcActivities.length > 0) {
    text += `<p><strong>Tribe Activities:</strong> ${npcActivities.join('; ')}.</p>`;
  }

  // Relationship dynamics
  if (data.relationships.length > 0) {
    text += `<p><strong>Social Dynamics:</strong> `;
    const bondingEvents = data.relationships.filter(r => r.type === 'bonding');
    const conflictEvents = data.relationships.filter(r => r.type === 'conflict');
    
    if (bondingEvents.length > 0) {
      const bonds = bondingEvents.map(b => `${b.survivors[0].firstName} and ${b.survivors[1].firstName} formed a strong connection`);
      text += bonds.join(', ') + '. ';
    }
    
    if (conflictEvents.length > 0) {
      const conflicts = conflictEvents.map(c => `tension emerged between ${c.survivors[0].firstName} and ${c.survivors[1].firstName}`);
      text += 'However, ' + conflicts.join(', ') + '. ';
    }
    
    text += 'These early relationships will be crucial as the game progresses.</p>';
  }

  text += `<p><strong>Tribe Status:</strong> ${playerTribe.tribeName} ends their first day with a fire level of ${data.currentFire} and shelter level of ${data.currentShelter}. The foundation has been set for the challenges ahead.</p>`;

  return text;
}

function applySummaryChanges(data) {
  const playerTribe = gameManager.getPlayerTribe();
  const relationshipSystem = gameManager.systems.relationshipSystem;

  // Update tribe fire and shelter levels
  playerTribe.fire = data.currentFire;
  playerTribe.shelter = data.currentShelter;

  // Update threat levels for leaders
  data.leadership.forEach(leader => {
    leader.threat = Math.min(10, leader.threat + getRandomInt(2, 4));
  });

  // Update teamPlayer values for those who didn't gather resources
  Object.keys(data.resourceGathering).forEach(survivorId => {
    const survivor = playerTribe.members.find(m => m.id == survivorId);
    if (survivor && data.resourceGathering[survivorId].length === 0) {
      survivor.teamPlayer = Math.max(0, survivor.teamPlayer - getRandomInt(3, 8));
    }
  });

  // Apply relationship changes
  if (relationshipSystem) {
    data.relationships.forEach(rel => {
      const survivor1 = rel.survivors[0];
      const survivor2 = rel.survivors[1];
      relationshipSystem.changeRelationship(survivor1.id, survivor2.id, rel.change);
    });
  }

  // Update survivor resources based on gathering
  Object.keys(data.resourceGathering).forEach(survivorId => {
    const survivor = playerTribe.members.find(m => m.id == survivorId);
    if (survivor) {
      data.resourceGathering[survivorId].forEach(resource => {
        if (survivor[resource] !== undefined) {
          survivor[resource] = (survivor[resource] || 0) + 1;
        }
      });
    }
  });

  console.log('Summary changes applied to game state');
}
