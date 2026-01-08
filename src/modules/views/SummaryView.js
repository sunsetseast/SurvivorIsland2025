/**
 * @module SummaryView
 * Renders the summary of camp activities after the 2-hour timer expires
 */

import { createElement, clearChildren, addDebugBanner } from '../utils/index.js';
import { gameManager } from '../core/index.js';
import activityTracker from '../utils/ActivityTracker.js';

const RESOURCE_LABELS = {
  bamboo: 'bamboo',
  palms: 'palm',
  firewood: 'firewood',
  coconuts: 'coconut',
  fish1: 'small fish',
  fish2: 'big fish',
  fish3: 'rare fish'
};

function displayNameById(id, tribe, playerId) {
  const survivor = tribe?.members?.find(member => member.id === id);
  if (!survivor) return 'Someone';
  return survivor.id === playerId ? 'You' : survivor.firstName || 'Someone';
}

function formatResourceLabel(resource, amount) {
  const base = RESOURCE_LABELS[resource] || resource;
  if (amount === 1) return base;
  if (base.endsWith('s')) return base;
  return `${base}s`;
}

function dedupeCampEntries(entries = []) {
  const seen = new Set();
  return entries.filter(entry => {
    const id = entry.id || `${entry.day || 'unknown'}-${entry.type || 'log'}-${entry.title || 'untitled'}`;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function renderCampLogSection(campLog) {
  const wrapper = createElement('div', {
    style: `
      display: flex;
      flex-direction: column;
      gap: 12px;
    `
  });
  const uniqueLog = dedupeCampEntries(campLog);
  const tribe = gameManager.getPlayerTribe();

  const cinematicSummary = (uniqueLog || []).find(entry => entry.id === 'day1_first_impressions');
  if (cinematicSummary) {
    const card = createElement('div', {
      style: `
        background: #fff4d6;
        border: 1px solid #c89c53;
        border-radius: 12px;
        padding: 14px;
        box-shadow: inset 0 1px 0 rgba(255,255,255,0.7);
      `
    });
    card.appendChild(createElement('div', { style: { fontWeight: 'bold', color: '#3c2415', fontSize: '1.1rem' } }, cinematicSummary.title || 'Cinematic Recap'));
    const summaryBlock = createElement('div', { style: { color: '#2b190a', marginTop: '4px', whiteSpace: 'pre-wrap' } });
    if (cinematicSummary.data?.summaryHtml) {
      summaryBlock.innerHTML = cinematicSummary.data.summaryHtml;
    } else {
      summaryBlock.textContent = cinematicSummary.text || '';
    }
    card.appendChild(summaryBlock);
    wrapper.appendChild(card);
  }

  const filtered = uniqueLog.filter(entry => !entry.isCinematicEventSummary);
  const grouped = filtered.reduce((acc, entry) => {
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
      const isShelterBuild = entry.type === 'camp_shelter_build' && entry.day === dayEntries[0]?.day;
      if (isShelterBuild) {
        const shelterCard = renderShelterEntry(entry, tribe);
        if (shelterCard) wrapper.appendChild(shelterCard);
        return;
      }

      const card = createElement('div', {
        style: `
          background: #fff8e1;
          border: 1px solid #d2b48c;
          border-radius: 10px;
          padding: 12px;
        `
      });

      card.appendChild(createElement('div', { style: { fontWeight: 'bold', color: '#3c2415' } }, entry.title || entry.type));
      const body = createElement('div', { style: { color: '#2b190a', marginTop: '4px', whiteSpace: 'pre-wrap' } });
      if (entry.data?.summaryHtml) {
        body.innerHTML = entry.data.summaryHtml;
      } else {
        body.textContent = entry.text || '';
      }
      card.appendChild(body);
      wrapper.appendChild(card);
    });
  });

  return wrapper;
}

function renderCheckpointReportSection(report, tribe) {
  if (!report || !tribe) return null;
  const playerId = gameManager.getPlayerSurvivor?.()?.id;

  const section = createElement('div', {
    style: `
      background: #fff8e1;
      border: 2px solid #d2b48c;
      border-radius: 12px;
      padding: 16px;
      margin-bottom: 16px;
      box-shadow: inset 0 1px 0 rgba(255,255,255,0.6);
    `
  });

  section.appendChild(createElement('div', {
    style: { fontWeight: 'bold', color: '#3c2415', fontSize: '1.2rem', marginBottom: '8px' }
  }, 'Day 1 Task Report'));

  const contributionsBySurvivor = new Map();
  (report.contributions || []).forEach(entry => {
    if (!entry?.survivorId || !entry?.resource || !entry?.amount) return;
    const existing = contributionsBySurvivor.get(entry.survivorId) || {};
    existing[entry.resource] = (existing[entry.resource] || 0) + entry.amount;
    contributionsBySurvivor.set(entry.survivorId, existing);
  });

  if (contributionsBySurvivor.size) {
    section.appendChild(createElement('div', { style: { fontWeight: 'bold', color: '#3c2415' } }, 'Resource contributions'));
    const list = createElement('ul', { style: { margin: '6px 0 12px 18px', color: '#2b190a' } });
    contributionsBySurvivor.forEach((resources, survivorId) => {
      const pieces = Object.entries(resources).map(([resource, amount]) => `${amount} ${formatResourceLabel(resource, amount)}`);
      const name = displayNameById(survivorId, tribe, playerId);
      list.appendChild(createElement('li', {}, `${name}: ${pieces.join(', ')}`));
    });
    section.appendChild(list);
  }

  const buildOrder = ['fire', 'shelter'];
  const buildLines = buildOrder.map(buildType => {
    const build = report.builds?.[buildType];
    if (!build) return null;
    const name = displayNameById(build.attemptedBy, tribe, playerId);
    if (build.succeeded) {
      return `${buildType === 'fire' ? 'Fire' : 'Shelter'} built by ${name}.`;
    }
    const missing = build.missing || {};
    const missingParts = Object.entries(missing).map(([resource, amount]) => `${amount} ${formatResourceLabel(resource, amount)}`);
    const missingText = missingParts.length ? `Missing ${missingParts.join(', ')}.` : 'Missing materials.';
    const blamedId = build.blamed?.[0];
    const blamedName = blamedId ? displayNameById(blamedId, tribe, playerId) : null;
    const blameText = blamedName ? ` Blame fell on ${blamedName}.` : '';
    return `${buildType === 'fire' ? 'Fire' : 'Shelter'} blocked. ${missingText}${blameText}`;
  }).filter(Boolean);

  if (buildLines.length) {
    section.appendChild(createElement('div', { style: { fontWeight: 'bold', color: '#3c2415' } }, 'Build outcomes'));
    const list = createElement('ul', { style: { margin: '6px 0 12px 18px', color: '#2b190a' } });
    buildLines.forEach(line => list.appendChild(createElement('li', {}, line)));
    section.appendChild(list);
  }

  if (report.floatCredits?.length) {
    section.appendChild(createElement('div', { style: { fontWeight: 'bold', color: '#3c2415' } }, 'Float stepped up'));
    const list = createElement('ul', { style: { margin: '6px 0 12px 18px', color: '#2b190a' } });
    report.floatCredits.forEach(credit => {
      list.appendChild(createElement('li', {}, credit.text || 'A floater stepped up.'));
    });
    section.appendChild(list);
  }

  if (report.teamPlayerDeltas?.length) {
    section.appendChild(createElement('div', { style: { fontWeight: 'bold', color: '#3c2415' } }, 'Team player changes'));
    const list = createElement('ul', { style: { margin: '6px 0 12px 18px', color: '#2b190a' } });
    report.teamPlayerDeltas.forEach(delta => {
      const name = displayNameById(delta.survivorId, tribe, playerId);
      list.appendChild(createElement('li', {}, `${name} teamPlayer ${delta.delta >= 0 ? '+' : ''}${delta.delta}.`));
    });
    section.appendChild(list);
  }

  if (report.relationshipDeltasApplied?.length) {
    section.appendChild(createElement('div', { style: { fontWeight: 'bold', color: '#3c2415' } }, 'Relationship shifts'));
    const list = createElement('ul', { style: { margin: '6px 0 12px 18px', color: '#2b190a' } });
    report.relationshipDeltasApplied.forEach(delta => {
      const fromName = displayNameById(delta.fromId, tribe, playerId);
      const toName = displayNameById(delta.toId, tribe, playerId);
      list.appendChild(createElement('li', {}, `${fromName} ➜ ${toName}: ${delta.delta >= 0 ? '+' : ''}${delta.delta}.`));
    });
    section.appendChild(list);
  }

  return section;
}

function renderShelterEntry(entry, tribe) {
  const partner = tribe?.members?.find(m => m.id === entry.partnerId);
  const partnerName = partner?.firstName || 'someone';
  const isBuildPhase = entry.phase === 'build';
  const title = isBuildPhase
    ? `Shelter Build: ${entry.success ? 'SUCCESS' : 'FAIL'}`
    : 'Shelter Build Attempt';

  const card = createElement('div', {
    style: `
      background: #fff8e1;
      border: 1px solid #d2b48c;
      border-radius: 10px;
      padding: 12px;
    `
  });

  card.appendChild(createElement('div', { style: { fontWeight: 'bold', color: '#3c2415' } }, title));

  const body = createElement('div', { style: { color: '#2b190a', marginTop: '6px', whiteSpace: 'pre-wrap', lineHeight: 1.35 } });

  if (isBuildPhase) {
    const minutesSpent = entry.secondsSpent ? Math.round((entry.secondsSpent / 60) * 10) / 10 : null;
    const relationshipNote = entry.relationshipDelta
      ? `Relationship: ${entry.relationshipDelta > 0 ? '+' : ''}${entry.relationshipDelta}`
      : null;
    const teamNote = entry.teamPlayerDelta
      ? `Teamwork: ${entry.teamPlayerDelta > 0 ? '+' : ''}${entry.teamPlayerDelta}`
      : null;
    const metaPieces = [
      `Partner: ${partnerName}`,
      `Progress: ${entry.shelterBefore ?? '?'} -> ${entry.shelterAfter ?? '?'}`,
      minutesSpent ? `Time: ${minutesSpent} min` : null,
      relationshipNote,
      teamNote
    ].filter(Boolean);

    const meta = metaPieces.join(' • ');
    body.textContent = `${meta}\n${entry.narration || ''}`;
  } else {
    let attemptNote = 'Attempted to build shelter.';
    if (entry.outcome === 'insufficient_resources') {
      attemptNote = 'Tried to build shelter but lacked resources.';
    } else if (entry.outcome === 'not_assigned') {
      attemptNote = 'Not assigned to the shelter crew today.';
    }
    body.textContent = attemptNote;
  }

  card.appendChild(body);
  return card;
}

function renderDay1FirstImpressionsSection(playerTribe) {
  const existingLog = (gameManager.campLog || []).find(entry => entry.id === 'day1_first_impressions');
  if (existingLog) return null;
  if (!playerTribe?.day1PlanCreated || !playerTribe.day1Plan) return null;
  const plan = playerTribe.day1Plan;
  const listNames = ids => ids.map(id => playerTribe.members.find(m => m.id === id)?.firstName || 'Unknown').join(', ') || 'None';
  const section = createElement('div', {
    style: `
      background: #fff8e1;
      border: 1px solid #d2b48c;
      border-radius: 12px;
      padding: 14px;
      margin-bottom: 14px;
      box-shadow: inset 0 1px 0 rgba(255,255,255,0.6);
    `
  });

  section.appendChild(createElement('div', { style: { fontWeight: 'bold', color: '#3c2415', fontSize: '1.15rem', marginBottom: '8px' } }, 'Day 1: First Impressions'));

  const leader = playerTribe.members.find(m => m.id === plan.leaderId);
  section.appendChild(createElement('div', { style: { color: '#2b190a' } }, `Leader emergence: ${leader?.firstName || 'None'} (${plan.leadershipScenario || 'unclear'})`));
  section.appendChild(createElement('div', {}, `Fire: ${listNames(plan.fireIds || [])}`));
  section.appendChild(createElement('div', {}, `Shelter: ${listNames(plan.shelterIds || [])}`));
  section.appendChild(createElement('div', {}, `Food: ${listNames(plan.foodIds || [])}`));
  section.appendChild(createElement('div', {}, `Materials: ${listNames(plan.materialsIds || [])}`));
  if ((plan.floaterIds || []).length) section.appendChild(createElement('div', {}, `Float: ${listNames(plan.floaterIds || [])}`));

  if (Array.isArray(plan.chemistryMoments) && plan.chemistryMoments.length) {
    const momentsHeader = createElement('div', { style: { marginTop: '8px', fontWeight: 'bold', color: '#3c2415' } }, 'Social moments');
    section.appendChild(momentsHeader);
    plan.chemistryMoments.forEach(moment => {
      const [aId, bId] = moment.pairIds || [];
      const a = playerTribe.members.find(m => m.id === aId)?.firstName || 'Someone';
      const b = playerTribe.members.find(m => m.id === bId)?.firstName || 'someone';
      const label = moment.type === 'bond' ? 'bonded' : moment.type === 'friction' ? 'clashed' : moment.type;
      section.appendChild(createElement('div', { style: { color: moment.type === 'bond' ? '#245624' : '#7a1b1b' } }, `${a} and ${b} ${label}.`));
    });
  }

  section.appendChild(createElement('div', { style: { marginTop: '8px', fontStyle: 'italic', color: '#2b190a' } }, `Camp mood: ${plan.mood || 'neutral'}`));
  return section;
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

  if (campLog.length > 0) {
    const firstImpressionsSection = renderDay1FirstImpressionsSection(playerTribe);
    if (firstImpressionsSection) summaryContent.appendChild(firstImpressionsSection);
    if (summaryData.checkpointReport) {
      const reportSection = renderCheckpointReportSection(summaryData.checkpointReport, playerTribe);
      if (reportSection) summaryContent.appendChild(reportSection);
    }
    const filteredLog = campLog.filter(entry => entry.type !== 'checkpoint_report');
    if (filteredLog.length) {
      summaryContent.appendChild(renderCampLogSection(filteredLog));
    }
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
  const hasDay1Cinematic = (gameManager.campLog || []).some(entry => entry.id === 'day1_first_impressions');

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
    currentShelter: playerTribe.shelter || 0,
    player
  };

  const phaseId = gameManager.taskSystem?.getCurrentPhaseId?.(gameManager) ?? gameManager.getCurrentCampPhaseId?.();
  const checkpointReport = (gameManager.campLog || []).find(entry => entry.type === 'checkpoint_report' && entry.day === currentDay && entry.phaseId === phaseId);
  if (checkpointReport) {
    data.checkpointReport = checkpointReport;
    return data;
  }

  if ((playerTribe.day1PlanCreated && playerTribe.day1Plan) || hasDay1Cinematic) {
    data.day1Plan = playerTribe.day1Plan;
    return data;
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
    text += `<p><strong>Leadership:</strong> ${leader.firstName} ${leader.lastName} stepped up as a natural leader, organizing the tribe's initial efforts. Their authoritative presence has increased their threat level.</p>`;
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

  if (data.checkpointReport) {
    return;
  }

  if (data.day1Plan) {
    return;
  }
  return;
}
