/**
 * @module SummaryView
 * Renders the summary of camp activities after the 2-hour timer expires
 */

import { createElement, clearChildren, addDebugBanner } from '../utils/index.js';
import { gameManager } from '../core/index.js';

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

function formatResourceList(resources = {}) {
  return Object.entries(resources)
    .filter(([, amount]) => Number(amount) > 0)
    .map(([resource, amount]) => `${amount} ${formatResourceLabel(resource, amount)}`);
}

function formatCampLogBody(entry, tribe, playerId) {
  if (entry.text) return entry.text;
  if (entry.type === 'camp_contribute' && entry.resources) {
    const name = displayNameById(entry.actorId, tribe, playerId);
    const pieces = formatResourceList(entry.resources);
    if (pieces.length) return `${name} contributed ${pieces.join(', ')} to the stockpile.`;
  }
  if (entry.type === 'camp_contribute_food' || entry.food || entry.fish) {
    const name = displayNameById(entry.actorId, tribe, playerId);
    const food = {
      coconuts: entry.food?.coconuts ?? entry.coconuts,
      fish1: entry.food?.fish1 ?? entry.fish1,
      fish2: entry.food?.fish2 ?? entry.fish2,
      fish3: entry.food?.fish3 ?? entry.fish3
    };
    const pieces = formatResourceList(food);
    if (pieces.length) return `${name} brought ${pieces.join(', ')} back to camp.`;
  }
  if (entry.type === 'camp_shelter_build') {
    const name = displayNameById(entry.actorId, tribe, playerId);
    if (entry.success) {
      return `${name} improved the shelter (${entry.shelterBefore ?? '?'} → ${entry.shelterAfter ?? '?'}).`;
    }
    return `${name} attempted to improve the shelter but progress stalled.`;
  }
  if (entry.type === 'camp_fire_build') {
    const name = displayNameById(entry.actorId, tribe, playerId);
    if (entry.success) {
      return `${name} raised the fire (${entry.fireBefore ?? '?'} → ${entry.fireAfter ?? '?'}).`;
    }
    return `${name} attempted to build the fire, but it did not catch.`;
  }
  if (entry.type === 'float_step_up') {
    const name = displayNameById(entry.floatId, tribe, playerId);
    if (entry.reason) return `${name} stepped up. ${entry.reason}`;
    if (entry.text) return entry.text;
    return `${name} stepped up to help when needed.`;
  }
  return entry.title || entry.type || '';
}

function renderCampHighlightsSection(campLog, tribe) {
  if (!campLog.length) return null;
  const wrapper = createElement('div', {
    style: `
      display: flex;
      flex-direction: column;
      gap: 12px;
    `
  });

  wrapper.appendChild(createElement('h3', {
    style: `
      margin: 0 0 6px;
      padding-bottom: 8px;
      border-bottom: 1px solid #d2b48c;
      color: #4a2c0a;
    `
  }, 'Camp Highlights'));

  const playerId = gameManager.getPlayerSurvivor?.()?.id;
  dedupeCampEntries(campLog).forEach(entry => {
    const card = createElement('div', {
      style: `
        background: #fff8e1;
        border: 1px solid #d2b48c;
        border-radius: 10px;
        padding: 12px;
      `
    });

    card.appendChild(createElement('div', { style: { fontWeight: 'bold', color: '#3c2415' } }, entry.title || entry.type || 'Camp note'));
    const body = createElement('div', { style: { color: '#2b190a', marginTop: '4px', whiteSpace: 'pre-wrap' } });
    body.textContent = formatCampLogBody(entry, tribe, playerId);
    card.appendChild(body);
    wrapper.appendChild(card);
  });

  return wrapper;
}

function renderCheckpointReportSection(report, tribe, heading) {
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
  }, heading));

  const contributionsBySurvivor = new Map();
  (report.contributions || []).forEach(entry => {
    if (!entry?.survivorId || !entry?.resource || !entry?.amount) return;
    const existing = contributionsBySurvivor.get(entry.survivorId) || {};
    existing[entry.resource] = (existing[entry.resource] || 0) + entry.amount;
    contributionsBySurvivor.set(entry.survivorId, existing);
  });

  if (contributionsBySurvivor.size) {
    const lines = [];
    contributionsBySurvivor.forEach((resources, survivorId) => {
      const pieces = Object.entries(resources).map(([resource, amount]) => `${amount} ${formatResourceLabel(resource, amount)}`);
      const name = displayNameById(survivorId, tribe, playerId);
      lines.push(`${name} brought ${pieces.join(', ')}.`);
    });
    section.appendChild(createElement('div', { style: { color: '#2b190a', marginBottom: '10px' } }, lines.join(' ')));
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
    section.appendChild(createElement('div', { style: { color: '#2b190a', marginBottom: '10px' } }, buildLines.join(' ')));
  }

  if (report.drama?.reason) {
    const blamedName = report.drama.blamedId ? displayNameById(report.drama.blamedId, tribe, playerId) : null;
    const builderName = report.drama.builderId ? displayNameById(report.drama.builderId, tribe, playerId) : null;
    const missingParts = Object.entries(report.drama.missing || {})
      .map(([resource, amount]) => `${amount} ${formatResourceLabel(resource, amount)}`);
    const missingText = missingParts.length ? ` Missing ${missingParts.join(', ')}.` : '';
    const blameText = blamedName ? ` Blame landed on ${blamedName}.` : '';
    const builderText = builderName ? `${builderName} called it out. ` : '';
    section.appendChild(createElement('div', { style: { color: '#2b190a', marginBottom: '10px' } }, `${builderText}${report.drama.reason}.${missingText}${blameText}`.trim()));
  }

  if (report.floatCredits?.length) {
    const lines = report.floatCredits.map(credit => credit.reason || credit.text || 'A floater stepped up.');
    section.appendChild(createElement('div', { style: { color: '#2b190a', marginBottom: '10px' } }, lines.join(' ')));
  }

  if (report.teamPlayerDeltas?.length) {
    const lines = report.teamPlayerDeltas.map(delta => {
      const name = displayNameById(delta.survivorId, tribe, playerId);
      return `${name} saw team player change ${delta.delta >= 0 ? '+' : ''}${delta.delta}.`;
    });
    section.appendChild(createElement('div', { style: { color: '#2b190a', marginBottom: '10px' } }, lines.join(' ')));
  }

  if (report.relationshipDeltasProposed?.length) {
    const lines = report.relationshipDeltasProposed.map(delta => {
      const fromName = displayNameById(delta.fromId, tribe, playerId);
      const toName = displayNameById(delta.toId, tribe, playerId);
      return `${fromName} and ${toName} shifted by ${delta.delta >= 0 ? '+' : ''}${delta.delta}.`;
    });
    section.appendChild(createElement('div', { style: { color: '#2b190a', marginBottom: '10px' } }, lines.join(' ')));
  }

  return section;
}

function renderCinematicRecap(entry) {
  if (!entry) return null;
  const card = createElement('div', {
    style: `
      background: #fff4d6;
      border: 1px solid #c89c53;
      border-radius: 12px;
      padding: 14px;
      margin-bottom: 14px;
      box-shadow: inset 0 1px 0 rgba(255,255,255,0.7);
    `
  });

  card.appendChild(createElement('div', { style: { fontWeight: 'bold', color: '#3c2415', fontSize: '1.15rem' } }, 'Day 1: First Impressions'));
  const summaryBlock = createElement('div', { style: { color: '#2b190a', marginTop: '4px', whiteSpace: 'pre-wrap' } });
  if (entry.data?.summaryHtml) {
    summaryBlock.innerHTML = entry.data.summaryHtml;
  } else {
    summaryBlock.textContent = entry.text || '';
  }
  card.appendChild(summaryBlock);
  return card;
}

function findLatestCheckpointReport(campLog, day) {
  if (!Array.isArray(campLog)) return null;
  for (let i = campLog.length - 1; i >= 0; i -= 1) {
    const entry = campLog[i];
    if (entry?.type === 'checkpoint_report' && entry?.day === day) {
      return entry;
    }
  }
  return null;
}

function findLatestEndOfPhaseReport(campLog, day) {
  if (!Array.isArray(campLog)) return null;
  for (let i = campLog.length - 1; i >= 0; i -= 1) {
    const entry = campLog[i];
    if (entry?.day !== day) continue;
    if (entry?.type === 'task_results' || entry?.type === 'end_phase_report') {
      return entry;
    }
    if (entry?.type === 'checkpoint_report' && entry?.checkpoint === 'end') {
      return entry;
    }
  }
  return null;
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
      li.textContent = formatter(item);
      list.appendChild(li);
    });

    section.appendChild(list);
  };

  addCategory('Relationship Changes', socialLog.relationship, change => {
    const delta = change.amount || 0;
    const deltaText = delta >= 0 ? `+${delta}` : `${delta}`;
    return `You and ${change.with} had a ${change.context || 'camp'} interaction (${deltaText}).`;
  });

  addCategory('Trust Changes', socialLog.trust, change => {
    const delta = change.amount || 0;
    const deltaText = delta >= 0 ? `+${delta}` : `${delta}`;
    const direction = delta >= 0 ? 'trusts you more' : 'trusts you less';
    return `${change.with} ${direction} (${deltaText}).`;
  });

  addCategory('Suspicion', socialLog.suspicion, change => {
    const delta = change.amount || 0;
    const deltaText = delta >= 0 ? `+${delta}` : `${delta}`;
    const direction = delta >= 0 ? 'more suspicious of you' : 'less suspicious of you';
    return `${change.with} is now ${direction} (${deltaText}).`;
  });

  const mentionEntries = (socialLog.memory || []).filter(m => m && (m.type === 'mention' || m.type === 'strategic_context'));

  addCategory('Names Mentioned & Strategic Intel', mentionEntries, entry => {
    const speaker = entry.speaker || 'Someone';
    const toneSuffix = entry.tone === 'hedging'
      ? ' (seemed unsure)'
      : entry.tone === 'deceptive'
        ? ' (may not have been honest)'
        : '';
    if (entry.type === 'strategic_context') {
      return `${speaker} discussed voting dynamics but avoided naming a target${toneSuffix}.`;
    }

    const about = entry.about || 'someone';
    switch (entry.context) {
      case 'pushed_target':
        return `${speaker === 'Player' ? 'You' : speaker} pushed a plan to vote out ${about}${toneSuffix}.`;
      case 'warned_about':
        return `${speaker === 'Player' ? 'You' : speaker} warned you about ${about}${toneSuffix}.`;
      case 'gossip':
        return `${speaker === 'Player' ? 'You' : speaker} gossiped about ${about}${toneSuffix}.`;
      case 'deal_proposed':
        return `${speaker === 'Player' ? 'You' : speaker} brought up ${about} while talking deals${toneSuffix}.`;
      case 'counter_target':
        if (speaker === 'Player') return `You redirected the target toward ${about}${toneSuffix}.`;
        return `${speaker} reacted to targeting ${about}${toneSuffix}.`;
      case 'alliance_talk':
        return `${speaker === 'Player' ? 'You' : speaker} discussed alliance talk around ${about}${toneSuffix}.`;
      case 'suspicion':
        return `${speaker === 'Player' ? 'You' : speaker} voiced suspicion about ${about}${toneSuffix}.`;
      default:
        return `${speaker === 'Player' ? 'You' : speaker} mentioned ${about}${toneSuffix}.`;
    }
  });

  const structuredSummaries = (socialLog.memory || []).filter(m => m && m.type === 'structured_summary');
  addCategory('Conversation Highlights', structuredSummaries, entry => entry.text || '');

  addCategory('Deals & Agreements', socialLog.deals, deal => {
    const label = deal.dealType === 'voteTogether' ? 'voting together' : deal.dealType === 'protection' ? 'mutual protection' : deal.dealType === 'information' ? 'sharing information' : 'alliance interest';
    const targetSuffix = deal.dealType === 'protection' ? '' : (deal.target ? ` on ${deal.target}` : ' tonight');
    return `You and ${deal.with} discussed ${label}${targetSuffix} (${deal.outcome || 'noncommittal'}).`;
  });

  addCategory('Gossip', socialLog.gossip, gossip => {
    return `You and ${gossip.with} gossiped about ${gossip.about} (${gossip.effect || 'speculation'}).`;
  });

  const memoryItems = (socialLog.memory || []).filter(m => !m.type && m.tags);
  addCategory('What Survivors Will Remember', memoryItems, memory => {
    const tags = Array.isArray(memory.tags) ? memory.tags.join(', ') : '';
    return `${memory.with} will remember: ${tags}.`;
  });

  addCategory('Vote Dynamics', socialLog.voteShifts, vote => {
    const direction = vote.weight >= 0 ? 'more likely' : 'less likely';
    const deltaText = vote.weight >= 0 ? `+${vote.weight}` : `${vote.weight}`;
    return `${vote.with} is now ${direction} to vote ${vote.target} (${deltaText}).`;
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

  const campLog = Array.isArray(gameManager.campLog) ? gameManager.campLog : [];
  const currentDay = gameManager.getCurrentDay?.() ?? gameManager.day ?? 1;

  const recapEntry = [...campLog].reverse().find(entry => entry?.id === 'day1_first_impressions');
  if (recapEntry) {
    const recapSection = renderCinematicRecap(recapEntry);
    if (recapSection) summaryContent.appendChild(recapSection);
  }

  const midpointReport = findLatestCheckpointReport(campLog, currentDay);
  if (midpointReport) {
    const reportSection = renderCheckpointReportSection(midpointReport, playerTribe, 'Midpoint Checkpoint');
    if (reportSection) summaryContent.appendChild(reportSection);
  }

  const endReport = findLatestEndOfPhaseReport(campLog, currentDay);
  if (endReport && endReport !== midpointReport) {
    const endSection = renderCheckpointReportSection(endReport, playerTribe, 'End of Camp Results');
    if (endSection) summaryContent.appendChild(endSection);
  }

  const highlightEntries = campLog.filter(entry => {
    if (!entry) return false;
    if (entry.id === 'day1_first_impressions') return false;
    if (entry.type === 'checkpoint_report') return false;
    if (entry.type === 'task_results' || entry.type === 'end_phase_report') return false;
    if (entry.isCinematicEventSummary) return false;
    return true;
  });

  const highlightSection = renderCampHighlightsSection(highlightEntries, playerTribe);
  if (highlightSection) {
    summaryContent.appendChild(highlightSection);
  }

  const socialRecap = buildSocialRecapSection();
  if (!recapEntry && !midpointReport && !endReport && !highlightEntries.length && !socialRecap) {
    const placeholder = createElement('div', {
      style: `
        color: #2b190a;
        font-style: italic;
        text-align: center;
        padding: 12px 0;
      `
    }, 'Nothing significant was recorded during this camp phase.');
    summaryContent.appendChild(placeholder);
  }
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
