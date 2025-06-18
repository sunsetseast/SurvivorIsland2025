/**
 * @module SummaryView
 * Renders the summary of camp activities after the 2-hour timer expires
 */

import { createElement, clearChildren, addDebugBanner } from '../utils/index.js';
import { gameManager } from '../core/index.js';
import { getRandomInt } from '../utils/CommonUtils.js';
import activityTracker from '../utils/ActivityTracker.js';

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
  }, `Day 1 Summary - ${playerTribe.name} Tribe`);

  const summaryContent = createElement('div', {
    style: `
      background: #F5DEB3;
      border-radius: 15px;
      padding: 25px;
      max-width: 800px;
      color: #4A4A4A;
      font-family: 'Survivant', sans-serif;
      font-size: 1.1rem;
      line-height: 1.6;
      border: 2px solid #D2B48C;
      box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
    `
  });

  // Create summary text
  let summaryText = generateSummaryText(summaryData);

  const textElement = createElement('div', {
    style: `
      text-shadow: 1px 1px 2px rgba(255, 255, 255, 0.8);
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
          color: white;
          font-weight: bold;
          text-shadow: 2px 2px 4px black;
          text-align: center;
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

    // Add continue button at the bottom
  const continueButton = createElement('div', {
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
          color: white;
          font-weight: bold;
          text-shadow: 2px 2px 4px black;
          text-align: center;
        `
  }, 'Continue to Challenge');

      continueButton.addEventListener('mouseenter', () => {
        continueButton.style.transform = 'scale(1.05)';
      });

      continueButton.addEventListener('mouseleave', () => {
        continueButton.style.transform = 'scale(1)';
      });

    continueButton.addEventListener('click', () => {
      console.log('Continue to Challenge button clicked');
      gameManager.setGameState('challenge');
    });

    actionButtons.appendChild(continueButton);
  }

  addDebugBanner('Summary view rendered!', 'purple', 170);
}

function generateSummaryData() {
  const playerTribe = gameManager.getPlayerTribe();
  const player = gameManager.getPlayerSurvivor();
  const tribeMembers = playerTribe.members.filter(m => !m.isPlayer);

  // Get tracked activities for the current day
  const currentDay = gameManager.getCurrentDay();
  const dayActivities = activityTracker.getActivitiesByDay(currentDay);

  const data = {
    leadership: [],
    fireAttempts: [],
    shelterBuilders: [],
    resourceGathering: {},
    relationships: [],
    playerActivities: dayActivities,
    playerResourceStats: activityTracker.getResourceStats(),
    playerFishingStats: activityTracker.getFishingStats(),
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

  // Determine fire attempts - check ActivityTracker for actual fire building
  const fireBuilders = [];
  const playerFireActivities = dayActivities.filter(a => a.type === 'fire_building');

  if (playerFireActivities.length > 0) {
    const lastFireAttempt = playerFireActivities[playerFireActivities.length - 1];
    fireBuilders.push({ survivor: player, success: lastFireAttempt.success || data.currentFire > 0 });
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

  // Determine shelter builders - check ActivityTracker for actual shelter building
  const playerShelterActivities = dayActivities.filter(a => a.type === 'shelter_building');

  if (playerShelterActivities.length > 0) {
    // Player built shelter, use the actual co-builder from the activity
    const shelterActivity = playerShelterActivities[0];
    const coBuilderName = shelterActivity.coBuilder;
    const coBuilder = tribeMembers.find(m => m.firstName === coBuilderName);

    if (coBuilder) {
      data.shelterBuilders = [player, coBuilder];
    } else {
      // Fallback if co-builder not found
      const fallbackCoBuilder = tribeMembers[getRandomInt(0, tribeMembers.length - 1)];
      data.shelterBuilders = [player, fallbackCoBuilder];
    }
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

  // Generate relationship changes - ensure player is involved in some interactions
  const relationshipSystem = gameManager.systems.relationshipSystem;
  if (relationshipSystem) {
    // 70% chance player is involved in a bonding event
    if (Math.random() < 0.7 && tribeMembers.length > 0) {
      const bondingPartner = tribeMembers[getRandomInt(0, tribeMembers.length - 1)];
      data.relationships.push({
        survivors: [player, bondingPartner],
        type: 'bonding',
        change: getRandomInt(5, 12)
      });
    }

    // Create some NPC bonding pairs
    for (let i = 0; i < 1; i++) {
      if (tribeMembers.length >= 2) {
        const pair = [...tribeMembers].sort(() => Math.random() - 0.5).slice(0, 2);
        if (Math.random() < 0.6) {
          data.relationships.push({
            survivors: pair,
            type: 'bonding',
            change: getRandomInt(5, 12)
          });
        }
      }
    }

    // 30% chance of conflict involving player or NPCs
    if (Math.random() < 0.3) {
      let conflictPair;
      if (Math.random() < 0.5 && tribeMembers.length > 0) {
        // Player involved in conflict
        const conflictPartner = tribeMembers[getRandomInt(0, tribeMembers.length - 1)];
        conflictPair = [player, conflictPartner];
      } else if (tribeMembers.length >= 2) {
        // NPC conflict
        conflictPair = [...tribeMembers].sort(() => Math.random() - 0.5).slice(0, 2);
      }

      if (conflictPair) {
        data.relationships.push({
          survivors: conflictPair,
          type: 'conflict',
          change: -getRandomInt(3, 8)
        });
      }
    }
  }

   // Store shelter activity data
   const shelterActivities = dayActivities.filter(a => a.type === 'shelter_building');
   if (shelterActivities.length > 0) {
       data.shelterActivity = shelterActivities[0]; // Use the first shelter activity found
   }

  return data;
}

function generateSummaryText(data) {
  const playerTribe = gameManager.getPlayerTribe();
  const player = gameManager.getPlayerSurvivor();
  let text = `<p><strong>The first two hours at ${playerTribe.name} camp have set the stage for the days ahead...</strong></p>`;

  // Leadership
  if (data.leadership.length > 0) {
    const leader = data.leadership[0];
    const threatIncrease = getRandomInt(2, 4);
    text += `<p><strong>Leadership:</strong> ${leader.firstName} ${leader.lastName} stepped up as a natural leader, organizing the tribe's initial efforts. Their authoritative presence has increased their threat level. <em>(Threat +${threatIncrease})</em></p>`;
  }

  // Fire attempts
  if (data.fireAttempts.length > 0) {
    data.fireAttempts.forEach(attempt => {
      if (attempt.survivor.isPlayer) {
        text += `<p><strong>Fire Building:</strong> You took on the crucial task of building fire. ${attempt.success ? 'Your efforts paid off, and the tribe now has fire!' : 'Despite your best efforts, the fire remains elusive.'}</p>`;
      } else {
        text += `<p><strong>Fire Building:</strong> ${attempt.survivor.firstName} worked tirelessly to create fire for the tribe. ${attempt.success ? 'Their persistence paid off, providing warmth and security.' : 'Unfortunately, their attempts were unsuccessful.'}</p>`;
      }
    });
  }

  // Shelter building summary
  if (data.shelterBuilders && data.shelterBuilders.length === 2) {
    const builder1 = data.shelterBuilders[0];
    const builder2 = data.shelterBuilders[1];

    // Check if we have actual activity data with outcome information
    let outcomeText = "Working together, you've created a basic foundation that will protect the tribe from the elements.";

    if (data.shelterActivity && data.shelterActivity.success !== undefined) {
      if (data.shelterActivity.success) {
        outcomeText = "The collaboration went well, strengthening both your shelter and your working relationship.";
      } else {
        outcomeText = "While you managed to improve the shelter, the work was challenging and created some tension between you.";
      }
    }

    if (builder1.isPlayer) {
      text += `<p><strong>Shelter Construction:</strong> You partnered with ${builder2.firstName} to work on the tribe's shelter. ${outcomeText}</p>`;
    } else if (builder2.isPlayer) {
      text += `<p><strong>Shelter Construction:</strong> You partnered with ${builder1.firstName} to work on the tribe's shelter. ${outcomeText}</p>`;
    } else {
      text += `<p><strong>Shelter Construction:</strong> ${builder1.firstName} and ${builder2.firstName} took initiative in building the tribe's shelter, working together to improve the structure.</p>`;
    }
  }

  // Resource gathering summary based on ActivityTracker
  text += `<p><strong>Resource Gathering:</strong> `;

  // Player's actual resource gathering from ActivityTracker
  const playerResourceActivities = data.playerActivities.filter(a => a.type === 'resource_gathering');
  const playerWaterActivities = data.playerActivities.filter(a => a.type === 'water_gathering');
  const playerFishingActivities = data.playerActivities.filter(a => a.type === 'fishing_attempt');
  const playerCookingActivities = data.playerActivities.filter(a => a.type === 'cooking');

  let playerActions = [];

  if (playerResourceActivities.length > 0) {
    const resourceSummary = {};
    playerResourceActivities.forEach(activity => {
      if (activity.resourceType && activity.quantity > 0) {
        resourceSummary[activity.resourceType] = (resourceSummary[activity.resourceType] || 0) + activity.quantity;
      }
    });
    Object.keys(resourceSummary).forEach(resource => {
      if (resourceSummary[resource] > 0) {
        playerActions.push(`collected ${resourceSummary[resource]} ${resource}`);
      }
    });
  }

  if (playerWaterActivities.length > 0) {
    const tribeWater = playerWaterActivities.filter(a => a.forTribe).length;
    const selfWater = playerWaterActivities.filter(a => !a.forTribe).length;
    if (tribeWater > 0) {
      playerActions.push(`gathered water for the entire tribe`);
    }
    if (selfWater > 0) {
      playerActions.push(`gathered water for yourself`);
    }
  }

  if (playerFishingActivities.length > 0) {
    const successfulCatches = playerFishingActivities.filter(a => a.success).length;
    if (successfulCatches > 0) {
      playerActions.push(`caught ${data.playerFishingStats.totalFishCaught} fish`);
    } else {
      playerActions.push(`attempted fishing (no catches)`);
    }
  }

  if (playerCookingActivities.length > 0) {
    const successfulCooks = playerCookingActivities.filter(a => a.success);
    if (successfulCooks.length > 0) {
      const cookedItems = successfulCooks.map(a => `${a.quantity} ${a.itemCooked}`);
      playerActions.push(`cooked ${cookedItems.join(', ')}`);
    }
  }

  if (playerActions.length > 0) {
    text += `You personally ${playerActions.join(', ')}. `;
  } else {
    text += `You focused on exploration and tribe dynamics. `;
  }

  // NPC resource gathering (existing logic)
  let gatheringDetails = [];
  Object.keys(data.resourceGathering).forEach(survivorId => {
    const survivor = playerTribe.members.find(m => m.id == survivorId);
    const resources = data.resourceGathering[survivorId];
    if (resources.length > 0) {
      gatheringDetails.push(`${survivor.firstName} gathered ${resources.join(', ')}`);
    } else {
      const teamPlayerPenalty = data.teamPlayerChanges && data.teamPlayerChanges[survivorId];
      const penaltyText = teamPlayerPenalty ? ` <em>(Team Player ${teamPlayerPenalty})</em>` : '';
      gatheringDetails.push(`${survivor.firstName} focused on other tasks${penaltyText}`);
    }
  });

  if (gatheringDetails.length > 0) {
    text += `Meanwhile, ${gatheringDetails.join('; ')}.`;
  }
  text += `</p>`;

  // Relationship dynamics
  if (data.relationships.length > 0) {
    text += `<p><strong>Social Dynamics:</strong> `;
    const bondingEvents = data.relationships.filter(r => r.type === 'bonding');
    const conflictEvents = data.relationships.filter(r => r.type === 'conflict');

    if (bondingEvents.length > 0) {
      const bonds = bondingEvents.map(b => {
        const survivor1Name = b.survivors[0].isPlayer ? 'You' : b.survivors[0].firstName;
        const survivor2Name = b.survivors[1].isPlayer ? 'you' : b.survivors[1].firstName;
        return `${survivor1Name} and ${survivor2Name} formed a strong connection <em>(Relationship +${b.change})</em>`;
      });
      text += bonds.join(', ') + '. ';
    }

    if (conflictEvents.length > 0) {
      const conflicts = conflictEvents.map(c => {
        const survivor1Name = c.survivors[0].isPlayer ? 'you' : c.survivors[0].firstName;
        const survivor2Name = c.survivors[1].isPlayer ? 'you' : c.survivors[1].firstName;
        return `tension emerged between ${survivor1Name} and ${survivor2Name} <em>(Relationship ${c.change})</em>`;
      });
      text += 'However, ' + conflicts.join(', ') + '. ';
    }

    text += 'These early relationships will be crucial as the game progresses.</p>';
  }

  // Detailed activity breakdown
  if (data.playerActivities.length > 0) {
    text += `<p><strong>Your Day Summary:</strong> `;
    const activitySummary = [];

    const resourceCount = playerResourceActivities.length;
    const waterCount = playerWaterActivities.length;
    const fishingCount = playerFishingActivities.length;
    const fireCount = data.playerActivities.filter(a => a.type === 'fire_building').length;
    const shelterCount = data.playerActivities.filter(a => a.type === 'shelter_building').length;
    const cookingCount = playerCookingActivities.length;

    if (resourceCount > 0) activitySummary.push(`${resourceCount} resource gathering session${resourceCount > 1 ? 's' : ''}`);
    if (waterCount > 0) activitySummary.push(`${waterCount} water collection${waterCount > 1 ? 's' : ''}`);
    if (fishingCount > 0) activitySummary.push(`${fishingCount} fishing attempt${fishingCount > 1 ? 's' : ''}`);
    if (fireCount > 0) activitySummary.push(`${fireCount} fire building attempt${fireCount > 1 ? 's' : ''}`);
    if (shelterCount > 0) activitySummary.push(`${shelterCount} shelter construction session${shelterCount > 1 ? 's' : ''}`);
    if (cookingCount > 0) activitySummary.push(`${cookingCount} cooking session${cookingCount > 1 ? 's' : ''}`);

    if (activitySummary.length > 0) {
      text += `You completed ${activitySummary.join(', ')}. This shows your commitment to both survival and tribe welfare.</p>`;
    } else {
      text += `You focused on exploration and getting oriented to camp life.</p>`;
    }
  }

  const fireStatus = data.currentFire === 0 ? 'no fire' : `a fire level of ${data.currentFire}`;
  text += `<p><strong>Tribe Status:</strong> ${playerTribe.name} ends their first day with ${fireStatus} and shelter level of ${data.currentShelter}. The foundation has been set for the challenges ahead.</p>`;

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
  const teamPlayerChanges = {};
  Object.keys(data.resourceGathering).forEach(survivorId => {
    const survivor = playerTribe.members.find(m => m.id == survivorId);
    if (survivor && data.resourceGathering[survivorId].length === 0) {
      const penalty = getRandomInt(3, 8);
      survivor.teamPlayer = Math.max(0, survivor.teamPlayer - penalty);
      teamPlayerChanges[survivorId] = -penalty;
    }
  });

  // Store team player changes for display
  data.teamPlayerChanges = teamPlayerChanges;

  // Apply relationship changes
  if (relationshipSystem) {
    data.relationships.forEach(rel => {
      const survivor1 = rel.survivors[0];
      const survivor2 = rel.survivors[1];
      relationshipSystem.changeRelationship(survivor1.id, survivor2.id, rel.change);
    });
  }

  const currentTribe = gameManager.getPlayerTribe();
  // Apply resource gathering
      Object.keys(data.resourceGathering).forEach(survivorId => {
        const survivor = currentTribe.members.find(m => m.id == survivorId);
        if (survivor) {
          data.resourceGathering[survivorId].forEach(resource => {
            if (resource === 'fish1' || resource === 'fish2' || resource === 'fish3') {
              // Fish types always add 1
              if (survivor[resource] !== undefined) {
                survivor[resource] += 1;
              } else {
                survivor[resource] = 1;
              }
              // Update total fish count
              gameManager.updateSurvivorTotalFish(survivor);
            } else {
              // Other resources add random amount
              const amount = getRandomInt(1, 3);
              if (survivor[resource] !== undefined) {
                survivor[resource] += amount;
              }
            }
          });
        }
      });

  console.log('Summary changes applied to game state');
}