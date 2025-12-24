/**
 * @module SummaryView
 * Renders the summary of camp activities after the 2-hour timer expires
 */

import { createElement, clearChildren, addDebugBanner } from '../utils/index.js';
import { gameManager } from '../core/index.js';
import { getRandomInt } from '../utils/CommonUtils.js';
import activityTracker from '../utils/ActivityTracker.js';

function renderCampLogSection(campLog) {
  const wrapper = createElement('div', {
    style: `
      display: flex;
      flex-direction: column;
      gap: 12px;
    `
  });

  const grouped = campLog.reduce((acc, entry) => {
    const key = `day-${entry.day}`;
    acc[key] = acc[key] || [];
    acc[key].push(entry);
    return acc;
  }, {});

  Object.keys(grouped).forEach(dayKey => {
    const dayEntries = grouped[dayKey];
    const header = createElement('h3', {
      style: `
        margin: 0;
        padding: 8px 0;
        border-bottom: 1px solid #d2b48c;
        color: #4a2c0a;
      `
    }, `Day ${dayEntries[0]?.day} Highlights`);

    wrapper.appendChild(header);

    dayEntries.forEach(entry => {
      const card = createElement('div', {
        style: `
          background: #fff8e1;
          border: 1px solid #d2b48c;
          border-radius: 10px;
          padding: 12px;
        `
      });

      card.appendChild(createElement('div', { style: { fontWeight: 'bold', color: '#3c2415' } }, entry.title || entry.type));
      card.appendChild(createElement('div', { style: { color: '#2b190a', marginTop: '4px' } }, entry.text || ''));
      wrapper.appendChild(card);
    });
  });

  return wrapper;
}

function evaluateDay1FollowThrough(playerTribe) {
  if (!playerTribe?.day1PlanCreated || !playerTribe.day1Plan || playerTribe.day1PlanEvaluated) return [];
  const logEntries = [];
  const plan = playerTribe.day1Plan;
  const resources = playerTribe.resources || {};

  const checkResource = (key, baseline = 0) => (resources[key] || 0) > baseline;

  const evaluateIds = (ids, success) => {
    ids.forEach(id => {
      const member = playerTribe.members.find(m => m.id === id);
      if (!member) return;
      member.laziness = member.laziness ?? 0;
      if (success) {
        member.teamPlayer = Math.min(100, (member.teamPlayer || 0) + 3);
        gameManager.systems.socialMemorySystem?.addMemory?.(member.id, { type: 'workethic', text: 'Pulled weight Day 1', day: 1, tags: ['day1', 'workethic'] });
      } else {
        member.teamPlayer = Math.max(0, (member.teamPlayer || 0) - 5);
        member.laziness += 5;
        gameManager.systems.socialMemorySystem?.addMemory?.(member.id, { type: 'workethic', text: "Didn't follow through Day 1", day: 1, tags: ['day1', 'workethic'] });
      }
    });
  };

  const fireIds = plan.fireIds || plan.fire || [];
  const shelterIds = plan.shelterIds || plan.shelter || [];
  const foodIds = plan.foodIds || plan.food || [];
  const materialsIds = plan.materialsIds || plan.materials || [];

  const fireDone = checkResource('fire');
  evaluateIds(fireIds, fireDone);
  if (!fireDone && fireIds.length) {
    logEntries.push({ day: 1, type: 'fire_miss', title: 'Fire Follow-through', text: 'The promised fire never fully caught.' });
  }

  const shelterDone = checkResource('shelter');
  evaluateIds(shelterIds, shelterDone);
  if (!shelterDone && shelterIds.length) {
    logEntries.push({ day: 1, type: 'shelter_miss', title: 'Shelter Follow-through', text: 'Shelter progress stalled compared to what was promised.' });
  }

  const foodDone = checkResource('fish') || checkResource('food');
  evaluateIds(foodIds, foodDone);
  const materialDone = checkResource('bamboo') || checkResource('palms');
  evaluateIds(materialsIds, materialDone);

  const player = gameManager.getPlayerSurvivor();
  if (materialsIds.includes(player?.id) && !materialDone) {
    logEntries.push({ day: 1, type: 'player_miss', title: 'Your Promise', text: 'You didn\'t gather as many materials as planned.' });
  }

  if (logEntries.length) {
    gameManager.campLog = gameManager.campLog || [];
    gameManager.campLog.push(...logEntries);
  }
  playerTribe.day1PlanEvaluated = true;
  return logEntries;
}

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

function normalizeCampSocialChanges() {
  if (!window.campSocialChanges) return null;
  const buckets = ['relationship', 'trust', 'suspicion', 'deals', 'gossip', 'memory', 'voteShifts'];
  const normalized = {};

  buckets.forEach(key => {
    normalized[key] = Array.isArray(window.campSocialChanges[key])
      ? window.campSocialChanges[key]
      : [];
  });

  return normalized;
}

function buildSocialRecapSection() {
  const socialLog = normalizeCampSocialChanges();
  if (!socialLog) return null;

  const hasEntries = ['relationship', 'trust', 'suspicion', 'deals', 'gossip', 'memory', 'voteShifts']
    .some(key => Array.isArray(socialLog[key]) && socialLog[key].length > 0);

  if (!hasEntries) return null;

  const section = createElement('div', {
    style: `
      margin-top: 20px;
      padding: 16px;
      border-radius: 12px;
      background: #fff8e1;
      border: 1px solid #d2b48c;
      box-shadow: inset 0 1px 0 rgba(255,255,255,0.6);
    `
  });

  section.appendChild(createElement('h3', {
    style: `
      margin-top: 0;
      margin-bottom: 12px;
      color: #4a2c0a;
      font-size: 1.4rem;
      text-align: center;
    `
  }, 'Social & Conversation Recap'));

  const addCategory = (title, items, formatter) => {
    if (!items || items.length === 0) return;

    section.appendChild(createElement('h4', {
      style: `
        margin: 10px 0 6px;
        color: #5d3b0c;
      `
    }, title));

    const list = createElement('ul', {
      style: `
        margin: 0 0 10px 18px;
        padding: 0;
        color: #2b190a;
      `
    });

    items.forEach(item => {
      const li = createElement('li', {
        style: {
          marginBottom: '4px'
        }
      });
      li.innerHTML = formatter(item);   // IMPORTANT: render <b>/<span> as HTML
      list.appendChild(li);
    });

    section.appendChild(list);
  };

  addCategory('Relationship Changes', socialLog.relationship, change => {
    const delta = change.amount || 0;
    const deltaColor = delta >= 0 ? 'green' : 'red';
    const deltaText = delta >= 0 ? `+${delta}` : `${delta}`;
    return `You and <b>${change.with}</b> had a ${change.context || 'camp'} interaction ` +
      `(<span style="color:${deltaColor}">${deltaText}</span>)`;
  });

  addCategory('Trust Changes', socialLog.trust, change => {
    const delta = change.amount || 0;
    const deltaColor = delta >= 0 ? 'green' : 'red';
    const deltaText = delta >= 0 ? `+${delta}` : `${delta}`;
    const direction = delta >= 0 ? 'trusts you more' : 'trusts you less';
    return `<b>${change.with}</b> ${direction} ` +
      `(<span style="color:${deltaColor}">${deltaText}</span>)`;
  });

  addCategory('Suspicion', socialLog.suspicion, change => {
    const delta = change.amount || 0;
    const deltaColor = delta >= 0 ? 'red' : 'green';
    const deltaText = delta >= 0 ? `+${delta}` : `${delta}`;
    const direction = delta >= 0 ? 'more suspicious of you' : 'less suspicious of you';
    return `<b>${change.with}</b> is now ${direction} ` +
      `(<span style="color:${deltaColor}">${deltaText}</span>)`;
  });

  const mentionEntries = (socialLog.memory || []).filter(m => m && (m.type === 'mention' || m.type === 'strategic_context'));

  addCategory('Names Mentioned & Strategic Intel', mentionEntries, entry => {
    const speaker = entry.speaker || 'Someone';
    const toneSuffix = entry.tone === 'hedging'
      ? ' <i>(seemed unsure)</i>'
      : entry.tone === 'deceptive'
        ? ' <i>(may not have been honest)</i>'
        : '';
    if (entry.type === 'strategic_context') {
      return `${speaker} discussed voting dynamics but avoided naming a target${toneSuffix}`;
    }

    const about = entry.about || 'someone';
    switch (entry.context) {
      case 'pushed_target':
        return `${speaker === 'Player' ? 'You' : speaker} pushed a plan to vote out <b>${about}</b>${toneSuffix}`;
      case 'warned_about':
        return `${speaker === 'Player' ? 'You' : speaker} warned you about <b>${about}</b>${toneSuffix}`;
      case 'gossip':
        return `${speaker === 'Player' ? 'You' : speaker} gossiped about <b>${about}</b>${toneSuffix}`;
      case 'deal_proposed':
        return `${speaker === 'Player' ? 'You' : speaker} brought up <b>${about}</b> while talking deals${toneSuffix}`;
      case 'counter_target':
        if (speaker === 'Player') return `You redirected the target toward <b>${about}</b>${toneSuffix}`;
        return `${speaker} reacted to targeting <b>${about}</b>${toneSuffix}`;
      case 'alliance_talk':
        return `${speaker === 'Player' ? 'You' : speaker} discussed alliance talk around <b>${about}</b>${toneSuffix}`;
      case 'suspicion':
        return `${speaker === 'Player' ? 'You' : speaker} voiced suspicion about <b>${about}</b>${toneSuffix}`;
      default:
        return `${speaker === 'Player' ? 'You' : speaker} mentioned <b>${about}</b>${toneSuffix}`;
    }
  });

  const structuredSummaries = (socialLog.memory || []).filter(m => m && m.type === 'structured_summary');
  addCategory('Conversation Highlights', structuredSummaries, entry => entry.text || '');

  addCategory('Deals & Agreements', socialLog.deals, deal => {
    const label = deal.dealType === 'voteTogether' ? 'voting together' : deal.dealType === 'protection' ? 'mutual protection' : deal.dealType === 'information' ? 'sharing information' : 'alliance interest';
    const targetSuffix = deal.dealType === 'protection' ? '' : (deal.target ? ` on <b>${deal.target}</b>` : ' tonight');
    return `You and <b>${deal.with}</b> discussed ${label}${targetSuffix} (${deal.outcome || 'noncommittal'})`;
  });

  addCategory('Gossip', socialLog.gossip, gossip => {
    return `You and <b>${gossip.with}</b> gossiped about <b>${gossip.about}</b> (${gossip.effect || 'speculation'})`;
  });

  const memoryItems = (socialLog.memory || []).filter(m => !m.type && m.tags);
  addCategory('What Survivors Will Remember', memoryItems, memory => {
    const tags = Array.isArray(memory.tags) ? memory.tags.join(', ') : '';
    return `<b>${memory.with}</b> will remember: <i>${tags}</i>`;
  });

  addCategory('Vote Dynamics', socialLog.voteShifts, vote => {
    const direction = vote.weight >= 0 ? 'more likely' : 'less likely';
    const deltaText = vote.weight >= 0 ? `+${vote.weight}` : `${vote.weight}`;
    const deltaColor = vote.weight >= 0 ? 'red' : 'green';
    return `<b>${vote.with}</b> is now ${direction} to vote <b>${vote.target}</b> ` +
      `(<span style="color:${deltaColor}">${deltaText}</span>)`;
  });

  return section;
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
  let summaryText = '';
  const campLog = gameManager.campLog || [];
  evaluateDay1FollowThrough(playerTribe);

  const renderDay1PlanSection = plan => {
    const section = createElement('div', {
      style: `
        background: #fff8e1;
        border: 1px solid #d2b48c;
        border-radius: 12px;
        padding: 14px;
        margin-bottom: 14px;
      `
    });
    const leader = playerTribe.members.find(m => m.id === plan.leaderId);
    const listNames = ids => ids.map(id => playerTribe.members.find(m => m.id === id)?.firstName || 'Unknown').join(', ') || 'None';
    section.appendChild(createElement('div', { style: { fontWeight: 'bold', color: '#3c2415', marginBottom: '6px' } }, 'Day 1 Plan (First Impressions)'));
    section.appendChild(createElement('div', {}, `Leader: ${leader?.firstName || 'Unknown'} (${plan.leadershipScenario})`));
    section.appendChild(createElement('div', {}, `Fire: ${listNames(plan.fireIds || [])}`));
    section.appendChild(createElement('div', {}, `Shelter: ${listNames(plan.shelterIds || [])}`));
    section.appendChild(createElement('div', {}, `Food: ${listNames(plan.foodIds || [])}`));
    section.appendChild(createElement('div', {}, `Materials: ${listNames(plan.materialsIds || [])}`));
    section.appendChild(createElement('div', {}, `Floaters: ${listNames(plan.floaterIds || [])}`));
    if (plan.bondPairIds?.length) {
      section.appendChild(createElement('div', { style: { marginTop: '6px', color: '#245624' } }, `Bond: ${listNames(plan.bondPairIds)}`));
    }
    if (plan.tensionPairIds?.length) {
      section.appendChild(createElement('div', { style: { color: '#7a1b1b' } }, `Tension: ${listNames(plan.tensionPairIds)}`));
    }
    section.appendChild(createElement('div', { style: { marginTop: '6px', fontStyle: 'italic' } }, `Mood leaving camp: ${plan.mood || 'neutral'}`));
    return section;
  };

  if (campLog.length > 0) {
    if (playerTribe.day1PlanCreated && playerTribe.day1Plan) {
      summaryContent.appendChild(renderDay1PlanSection(playerTribe.day1Plan));
    }
    summaryContent.appendChild(renderCampLogSection(campLog));
  } else {
    summaryText = generateSummaryText(summaryData);
    const textElement = createElement('div', {
      style: `
        text-shadow: 1px 1px 2px rgba(255, 255, 255, 0.8);
      `
    });
    textElement.innerHTML = summaryText;
    summaryContent.appendChild(textElement);
  }
  const socialRecap = buildSocialRecapSection();
  if (socialRecap) {
    summaryContent.appendChild(socialRecap);
  }
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
      screenManager.showScreen('challenge');
      window.campSocialChanges = {
        relationship: [],
        trust: [],
        suspicion: [],
        deals: [],
        gossip: [],
        memory: [],
        voteShifts: []
      };
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

  if (playerTribe.day1PlanCreated && playerTribe.day1Plan) {
    data.day1Plan = playerTribe.day1Plan;
    return data;
  }

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

  if (data.day1Plan) {
    playerTribe.fire = playerTribe.fire || 0;
    playerTribe.shelter = playerTribe.shelter || 0;
    return;
  }

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
