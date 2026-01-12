import { createElement, clearChildren, addDebugBanner } from '../utils/index.js';
import { gameManager } from '../core/index.js';
import { getRandomInt } from '../utils/CommonUtils.js';
import activityTracker from '../utils/ActivityTracker.js';
import npcLocationSystem from '../systems/NpcLocationSystem.js';
import { createNpcIcon } from '../ui/NpcIcon.js';
import { updateCampClockUI } from '../utils/ClockUtils.js';

const BAMBOO_REQUIRED = 5;
const PALM_REQUIRED = 1;
const MAX_SHELTER_LEVEL = 4;
let bambooAdded = 0;
let palmsAdded = 0;
let overlayOpen = false;
let shelterRoot = null;
let currentActionMode = null; // 'build' | 'contribute'

function isPlayerDay1Leader(player, tribe) {
  const pid = String(player?.id);
  const leaderId = tribe?.day1Plan?.leaderId != null ? String(tribe.day1Plan.leaderId) : null;
  return (
    leaderId === pid ||
    tribe?.day1Plan?.leadershipScenario === 'player_leads' ||
    gameManager.flags?.playerIsLeader === true
  );
}

export default function renderShelter(container) {
  cleanupShelterUI();
  window.__campViewCleanup = cleanupShelterUI;

  console.log('renderShelter() called');
  addDebugBanner('renderShelter() called', 'darkgreen', 40);

  clearChildren(container);
  shelterRoot = container;

  const actionButtons = document.getElementById('action-buttons');
  if (actionButtons) {
    clearChildren(actionButtons);
    actionButtons.style.justifyContent = 'center';
    actionButtons.style.gap = '20px';
    actionButtons.style.padding = '0';

    const createIconButton = (src, alt, onClick) => {
      const btnWrapper = createElement('div', {
        style: `
          width: 260px;
          height: 150px;
          display: inline-block;
          overflow: hidden;
          cursor: pointer;
        `
      });

      const image = createElement('img', {
        src,
        alt,
        style: `
          width: 100%;
          height: 100%;
          display: block;
          object-fit: contain;
          pointer-events: none;
        `
      });

      btnWrapper.appendChild(image);
      if (onClick) btnWrapper.addEventListener('click', onClick);
      return btnWrapper;
    };

    const leftButton = createIconButton('Assets/Buttons/left.png', 'Left', () => {
      window.campScreen.loadView('campfire');
    });
    const centerButton = createIconButton('Assets/Buttons/blank.png', 'Center', handleCenterButtonClick);
    const downButton = createIconButton('Assets/Buttons/down.png', 'Down', () => {
      window.campScreen.loadView('fork1');
    });

    actionButtons.appendChild(leftButton);
    actionButtons.appendChild(centerButton);
    actionButtons.appendChild(downButton);
  }

  try {
    const playerTribe = gameManager.getPlayerTribe();
    gameManager.ensureStockpileExists?.(playerTribe);
    const tribeShelterValue = playerTribe && typeof playerTribe.shelter === 'number' ? playerTribe.shelter : 0;

    const backgroundImage = `url('Assets/Screens/shelter${tribeShelterValue}.png')`;
    container.style.backgroundImage = backgroundImage;
    container.style.backgroundSize = 'cover';
    container.style.backgroundPosition = 'center';
    container.style.backgroundRepeat = 'no-repeat';

    const wrapper = createElement('div', {
      className: 'shelter-wrapper',
      style: `
        position: relative;
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        overflow: hidden;
      `
    });

    const shelterLevelContainer = createElement('div', {
      id: 'shelter-level-indicator',
      style: `
        position: absolute;
        left: 5px;
        top: 50%;
        transform: translateY(-50%);
        display: flex;
        flex-direction: column;
        gap: 12px;
        z-index: 10;
      `
    });

    for (let i = 4; i >= 0; i--) {
      const circle = createElement('div', {
        id: `shelter-level-${i}`,
        style: `
          width: 30px;
          height: 30px;
          border-radius: 50%;
          border: 3px solid #8B4513;
          background: rgba(139, 69, 19, 0.3);
          transition: all 0.4s ease;
        `
      });

      if (tribeShelterValue > i) {
        circle.style.background = 'linear-gradient(45deg, #22c55e, #16a34a)';
        circle.style.borderColor = '#22c55e';
        circle.style.boxShadow = '0 0 15px rgba(34, 197, 94, 0.8)';
      }

      shelterLevelContainer.appendChild(circle);
    }

    container.appendChild(shelterLevelContainer);

    const message = createElement('div', {
      id: 'shelter-message',
      style: `
        color: white;
        text-shadow: 2px 2px 4px black;
        font-size: 1.8rem;
        font-family: 'Survivant', sans-serif;
        text-align: center;
        padding: 20px;
        z-index: 2;
        opacity: 1;
        transition: opacity 1s ease;
      `
    }, 'Shelter: Rest, recover, and prepare for the next challenge.');

    wrapper.appendChild(message);
    container.appendChild(wrapper);
    ensureStockpileBanner(wrapper, playerTribe);
    updateStockpileValuesUI(playerTribe);

    renderNPCsAtShelter(container);
    createResourceButtons(wrapper);

    setTimeout(() => {
      const msgEl = getShelterRoot()?.querySelector('#shelter-message');
      if (msgEl) msgEl.style.opacity = '0';
    }, 3000);

    setTimeout(() => {
      const msgEl = getShelterRoot()?.querySelector('#shelter-message');
      if (msgEl) msgEl.remove();
    }, 4000);
  } catch (error) {
    console.error('Shelter view render error:', error);
  }

  addDebugBanner('Shelter view rendered!', 'forestgreen', 170);
}

function getShelterRoot() {
  return shelterRoot || document.querySelector('.shelter-wrapper')?.parentElement || document.getElementById('camp-content');
}

function cleanupShelterUI() {
  const root = getShelterRoot();
  document.getElementById('shelter-resource-buttons')?.remove();
  document.getElementById('submit-contribution-button')?.remove();
  document.getElementById('shelter-overlay')?.remove();
  document.getElementById('resource-popup')?.remove();
  if (!root) return;

  const removableIds = [
    'shelter-overlay',
    'parchment-popup',
    'submit-contribution-button',
    'start-building-button',
    'bamboo-selector-overlay',
    'palm-selector-overlay',
    'cobuilder-popup',
    'confirm-popup',
    'shelter-resource-buttons'
  ];

  removableIds.forEach(id => root.querySelectorAll(`#${id}`).forEach(el => el.remove()));
  root.querySelectorAll('.shelter-temp-overlay').forEach(el => el.remove());
  bambooAdded = 0;
  palmsAdded = 0;
  overlayOpen = false;
}

function handleCenterButtonClick() {
  hideContributionUI();
  currentActionMode = null;
  if (overlayOpen) {
    closeOverlay();
    return;
  }
  overlayOpen = true;
  addDebugBanner('Shelter action overlay opened', 'darkorange', 50);

  const root = getShelterRoot();
  const overlay = createElement('div', {
    id: 'shelter-overlay',
    className: 'shelter-temp-overlay',
    style: `
      position: absolute;
      inset: 0;
      background: rgba(0, 0, 0, 0.55);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 2000;
    `
  });

  const buttonColumn = createElement('div', {
    style: `
      display: flex;
      flex-direction: column;
      gap: 16px;
      align-items: center;
    `
  });

  const buildBtn = createElement('button', {
    className: 'rect-button alt',
    style: `
      background-image: url('Assets/rect-button-1.png');
      background-size: 100% 100%;
      border: none;
      padding: 12px;
      color: white;
      font-size: 16px;
      cursor: pointer;
    `
  }, 'Build Shelter');

  const contributeBtn = createElement('button', {
    className: 'rect-button alt',
    style: `
      background-image: url('Assets/rect-button-1.png');
      background-size: 100% 100%;
      border: none;
      padding: 12px;
      color: white;
      font-size: 16px;
      cursor: pointer;
    `
  }, 'Contribute Resources');

  buildBtn.addEventListener('click', () => {
    closeOverlay();
    startBuildFlow();
  });
  contributeBtn.addEventListener('click', () => {
    closeOverlay();
    startContributionFlow();
  });

  buttonColumn.appendChild(buildBtn);
  buttonColumn.appendChild(contributeBtn);
  overlay.appendChild(buttonColumn);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      closeOverlay();
      hideContributionUI();
    }
  });

  root.appendChild(overlay);
}

function closeOverlay() {
  const root = getShelterRoot();
  root?.querySelectorAll('#shelter-overlay').forEach(el => el.remove());
  overlayOpen = false;
  addDebugBanner('Shelter action overlay closed', 'darkorange', 50);
}

function showParchmentPopup(message, onClose) {
  const root = getShelterRoot();
  const popup = createElement('div', {
    id: 'parchment-popup',
    className: 'shelter-temp-overlay',
    style: `
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 420px;
      height: 320px;
      background-image: url('Assets/parch-portrait.png');
      background-size: 100% 100%;
      background-position: center;
      background-repeat: no-repeat;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 2100;
      cursor: pointer;
      padding: 40px;
      box-sizing: border-box;
    `
  });

  const text = createElement('div', {
    style: `
      font-family: 'Survivant', serif;
      font-size: 18px;
      color: white;
      text-shadow: 3px 3px 6px black;
      text-align: center;
      line-height: 1.4;
      white-space: pre-line;
    `
  }, message);

  popup.appendChild(text);
  popup.addEventListener('click', () => {
    popup.remove();
    onClose?.();
  });

  root?.appendChild(popup);
}

function updateStockpileValuesUI(tribe) {
  const activeTribe = tribe || gameManager.getPlayerTribe();
  if (!activeTribe) {
    console.warn('[ShelterView] Unable to update stockpile UI: missing tribe.');
    return;
  }

  const stockpile = gameManager.ensureStockpileExists?.(activeTribe);
  if (!stockpile) {
    console.warn('[ShelterView] Unable to update stockpile UI: missing stockpile data.');
    return;
  }

  const root = getShelterRoot();
  if (root) {
    ensureStockpileBanner(root, activeTribe);
  } else {
    console.warn('[ShelterView] Unable to update stockpile UI: missing shelter root.');
  }

  const inventoryValues = {
    'value-bamboo': stockpile.bamboo ?? 0,
    'value-palms': stockpile.palms ?? 0,
    'value-firewood': stockpile.firewood ?? 0,
    'value-water': stockpile.water ?? 0,
    'value-coconut': stockpile.coconuts ?? 0,
    'value-fish1': stockpile.fish1 ?? 0,
    'value-fish2': stockpile.fish2 ?? 0,
    'value-fish3': stockpile.fish3 ?? 0
  };

  const missingNodes = [];
  Object.entries(inventoryValues).forEach(([id, value]) => {
    const node = document.getElementById(id);
    if (node) {
      node.textContent = value;
    } else {
      missingNodes.push(id);
    }
  });

  if (missingNodes.length) {
    console.warn('[ShelterView] Missing inventory value nodes:', missingNodes.join(', '));
  }
}

function ensureStockpileBanner(container, tribe) {
  const existing = container.querySelector('#stockpile-banner');
  const stockpile = gameManager.ensureStockpileExists?.(tribe) || {};
  const bambooCount = stockpile.bamboo || 0;
  const palmCount = stockpile.palms || 0;

  if (existing) {
    const bambooCountEl = existing.querySelector('.stockpile-count-bamboo');
    const palmCountEl = existing.querySelector('.stockpile-count-palm');
    if (bambooCountEl) bambooCountEl.textContent = bambooCount;
    if (palmCountEl) palmCountEl.textContent = palmCount;
    return;
  }

  const banner = createElement('div', {
    id: 'stockpile-banner',
    style: `
      position: absolute;
      left: 50%;
      transform: translateX(-50%);
      bottom: 120px;
      background: rgba(0,0,0,0.55);
      color: #fff8e7;
      padding: 10px 14px;
      border-radius: 10px;
      font-family: 'Survivant', serif;
      font-size: 14px;
      box-shadow: 0 2px 12px rgba(0,0,0,0.35);
      z-index: 60;
      display: flex;
      flex-direction: column;
      gap: 6px;
    `
  });

  const title = createElement('div', {
    style: `
      text-align: center;
      width: 100%;
      color: #f5f5dc;
      text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.8);
      letter-spacing: 0.3px;
    `
  }, 'Tribe Stockpile');

  const row = createElement('div', {
    style: `
      display: flex;
      align-items: center;
      gap: 10px;
      justify-content: center;
    `
  });

  const createStockpileItem = (src, alt, count, countClass) => {
    const item = createElement('div', {
      className: 'stockpile-item',
      style: `
        display: flex;
        align-items: center;
        gap: 6px;
      `
    });

    const icon = createElement('img', {
      src,
      alt,
      style: `
        width: 28px;
        height: 28px;
        object-fit: contain;
        filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.7));
      `
    });

    const countEl = createElement('span', {
      className: countClass,
      style: `
        color: #f5f5dc;
        font-family: 'Survivant', serif;
        font-size: 16px;
        text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.8);
        display: inline-block;
        min-width: 14px;
        text-align: center;
      `
    }, count);

    item.appendChild(icon);
    item.appendChild(countEl);
    return item;
  };

  row.appendChild(createStockpileItem('Assets/Minigame/bambooButton.png', 'Bamboo stockpile', bambooCount, 'stockpile-count-bamboo'));
  row.appendChild(createStockpileItem('Assets/Minigame/palmsButton.png', 'Palm fronds stockpile', palmCount, 'stockpile-count-palm'));

  banner.appendChild(title);
  banner.appendChild(row);
  container.appendChild(banner);
}

function startContributionFlow() {
  currentActionMode = 'contribute';
  const root = getShelterRoot();
  const tribe = gameManager.getPlayerTribe();
  ensureStockpileBanner(root, tribe);
  showResourceButtons();
  updateContributionSubmit();
  addDebugBanner('Contribution flow started', 'teal', 60);
}

function updateContributionSubmit() {
  const root = getShelterRoot();
  let submit = root?.querySelector('#submit-contribution-button');
  const stagedTotal = (bambooAdded || 0) + (palmsAdded || 0);
  if (!submit) {
    submit = createElement('button', {
      id: 'submit-contribution-button',
      className: 'rect-button alt',
      style: `
        position: absolute;
        bottom: 260px;
        left: 50%;
        transform: translateX(-50%);
        background-image: url('Assets/rect-button-1.png');
        background-size: 100% 100%;
        background-repeat: no-repeat;
        border: none;
        padding: 10px 14px;
        color: white;
        font-family: 'Survivant', serif;
        font-size: 16px;
        cursor: pointer;
        z-index: 200;
        display: none;
      `
    }, 'Submit Contribution');
    submit.addEventListener('click', submitContribution);
    root?.appendChild(submit);
  }
  submit.style.display = stagedTotal > 0 ? 'block' : 'none';
}

function hideContributionUI() {
  const root = getShelterRoot();
  const submit = root?.querySelector('#submit-contribution-button');
  if (submit) submit.remove();
  const resourceButtons = root?.querySelector('#shelter-resource-buttons');
  if (resourceButtons) resourceButtons.style.display = 'none';
  bambooAdded = 0;
  palmsAdded = 0;
  updateResourceButtonStyles();
}

function submitContribution() {
  const tribe = gameManager.getPlayerTribe();
  const player = gameManager.getPlayerSurvivor();
  if (!tribe || !player) return;
  const bamboo = bambooAdded || 0;
  const palms = palmsAdded || 0;
  if (bamboo <= 0 && palms <= 0) {
    showParchmentPopup('Add bamboo or palm fronds to contribute to the tribe.');
    return;
  }
  gameManager.addToStockpile?.(tribe, 'bamboo', bamboo);
  gameManager.addToStockpile?.(tribe, 'palms', palms);
  player.bamboo = Math.max(0, (player.bamboo || 0) - bamboo);
  player.palms = Math.max(0, (player.palms || 0) - palms);
  activityTracker.trackActivity('camp_contribute', {
    subtype: 'shelter_materials',
    bamboo,
    palms,
    actorId: player.id
  });
  const day = gameManager.getCurrentDay();
  gameManager.campLog = gameManager.campLog || [];
  gameManager.campLog.push({
    id: 'contribute_shelter_materials',
    day,
    actorId: player.id,
    bamboo,
    palms,
    timestamp: Date.now(),
    type: 'camp_contribute'
  });
  addDebugBanner('Contribution submitted', 'teal', 60);
  bambooAdded = 0;
  palmsAdded = 0;
  updateResourceButtonStyles();
  updateStockpileValuesUI(tribe);
  window.refreshMenuCard?.();
  updateContributionSubmit();
  showParchmentPopup('You add your gathered materials to the tribe stockpile.');
}

function startBuildFlow() {
  currentActionMode = 'build';
  const tribe = gameManager.getPlayerTribe();
  const player = gameManager.getPlayerSurvivor();
  if (!tribe || !player) return;

  if ((tribe.shelter || 0) >= MAX_SHELTER_LEVEL) {
    showParchmentPopup('The shelter already feels solid at 4/4. Any further upgrades will have to wait.');
    return;
  }

  const assignments = tribe.day1Plan?.shelterIds || tribe.day1Plan?.shelter || [];
  const pid = String(player.id);
  const normalizedAssignments = assignments.map(String);
  const isAssigned = normalizedAssignments.includes(pid);
  if (!isAssigned) {
    const partners = normalizedAssignments
      .map(id => tribe.members.find(m => String(m.id) === id))
      .filter(Boolean)
      .map(m => m.firstName)
      .slice(0, 2)
      .join(' and ');
    const msg = partners
      ? `${partners} wave you off. "We've got the shelter covered—go focus on something else."`
      : 'The shelter crew insists they have it handled for now.';
    showParchmentPopup(msg);
    logBuildAttempt('not_assigned', null, null, { reason: 'no_assignments', shelterBefore: tribe.shelter, shelterAfter: tribe.shelter });
    return;
  }

  const stockpile = gameManager.ensureStockpileExists?.(tribe) || {};
  if ((stockpile.bamboo || 0) < BAMBOO_REQUIRED || (stockpile.palms || 0) < PALM_REQUIRED) {
    showParchmentPopup('You don\'t have enough bamboo or palm fronds to make progress.');
    logBuildAttempt('insufficient_resources', null, null, { bamboo: stockpile.bamboo, palms: stockpile.palms, shelterBefore: tribe.shelter, shelterAfter: tribe.shelter });
    return;
  }

  const partnerId = normalizedAssignments.find(id => id !== pid) || null;
  const partnerFromAssignments = partnerId
    ? tribe.members.find(m => String(m.id) === partnerId || m.id === partnerId)
    : null;
  const partner = partnerFromAssignments || pickCoBuilder(tribe, player, normalizedAssignments);
  showApproachChoices(partner);
}

function pickCoBuilder(tribe, player, assignments) {
  const assignedPartners = assignments
    .map(id => tribe.members.find(m => String(m.id) === String(id) && String(id) !== String(player.id)))
    .filter(Boolean);
  if (assignedPartners.length) return assignedPartners[0];
  const others = tribe.members.filter(m => String(m.id) !== String(player.id));
  return others.sort((a, b) => (b.physical || 0) - (a.physical || 0))[0] || null;
}

function showApproachChoices(partner) {
  const player = gameManager.getPlayerSurvivor();
  const tribe = gameManager.getPlayerTribe();
  if (!player || !tribe || !partner) return;
  const root = getShelterRoot();

  const forceLead = isPlayerDay1Leader(player, tribe);

  const overlay = createElement('div', {
    className: 'shelter-temp-overlay',
    style: `
      position: absolute;
      inset: 0;
      background: rgba(0,0,0,0.6);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 2050;
    `
  });

  const card = createElement('div', {
    style: `
      width: 420px;
      background: rgba(255, 248, 225, 0.96);
      border: 2px solid #c99a4b;
      border-radius: 16px;
      padding: 18px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.35);
      display: flex;
      flex-direction: column;
      gap: 12px;
      text-align: center;
      font-family: 'Survivant', serif;
    `
  });

  const headingText = forceLead
    ? 'Your tribe is counting on you to lead this build.'
    : 'How do you want to build?';
  card.appendChild(createElement('div', { style: { fontSize: '20px', color: '#3c2415', fontWeight: 'bold' } }, headingText));
  const subheadingText = forceLead
    ? `${partner.firstName} looks to you for direction.`
    : `You're building with ${partner.firstName}.`;
  card.appendChild(createElement('div', { style: { color: '#5a3618', fontSize: '15px' } }, subheadingText));

  const options = forceLead
    ? [{ key: 'lead', label: `Take the lead (with ${partner.firstName} backing you up)` }]
    : [
      { key: 'lead', label: `Take the lead (with ${partner.firstName} backing you up)` },
      { key: 'together', label: `Work together with ${partner.firstName}` },
      { key: 'npc_lead', label: `Let ${partner.firstName} take the lead` }
    ];

  const buttonRow = createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } });
  options.forEach(opt => {
    const btn = createElement('button', {
      className: 'rect-button alt',
      style: `
        background-image: url('Assets/rect-button-1.png');
        background-size: 100% 100%;
        border: none;
        padding: 12px;
        color: white;
        font-size: 16px;
        cursor: pointer;
      `
    }, opt.label + (forceLead && opt.key === 'lead' ? ' (You stepped up as leader)' : ''));
    btn.addEventListener('click', () => {
      overlay.remove();
      resolveBuildOutcome(opt.key, partner);
    });
    buttonRow.appendChild(btn);
  });

  card.appendChild(buttonRow);
  overlay.appendChild(card);
  root?.appendChild(overlay);
}

function resolveBuildOutcome(style, partner) {
  const player = gameManager.getPlayerSurvivor();
  const tribe = gameManager.getPlayerTribe();
  if (!player || !tribe || !partner) return;

  const stockpile = gameManager.ensureStockpileExists?.(tribe) || {};
  if ((stockpile.bamboo || 0) < BAMBOO_REQUIRED || (stockpile.palms || 0) < PALM_REQUIRED) {
    showParchmentPopup('You don\'t have enough materials after all.');
    return;
  }

  const baseMinutes = 18;
  const relationshipScore = gameManager.systems?.relationshipSystem?.getRelationship?.(player.id, partner.id)?.score ?? 0;
  const leadershipBoost = style === 'lead' && isPlayerDay1Leader(player, tribe) ? -3 : 0;
  const lazinessPenalty = ((player.laziness || 0) + (partner.laziness || 0)) / 40;
  const relationshipFactor = -relationshipScore / 120; // better relationship reduces time
  const teamworkBonus = style === 'together' ? -2 : style === 'npc_lead' ? 1 : 0;
  const randomSwing = getRandomInt(-120, 180) / 60; // +/- 2-3 minutes

  let actualMinutes = baseMinutes + leadershipBoost + lazinessPenalty + relationshipFactor + teamworkBonus + randomSwing;
  actualMinutes = Math.max(8, Math.min(28, actualMinutes));

  const performanceScore = 0.7 - lazinessPenalty / 8 + (relationshipScore / 200) + (isPlayerDay1Leader(player, tribe) ? 0.05 : 0);
  const styleBias = style === 'lead' ? 0.05 : style === 'npc_lead' ? -0.05 : 0.02;
  const successChance = Math.min(0.92, Math.max(0.45, 0.7 + performanceScore + styleBias + (getRandomInt(-8, 8) / 100)));
  const success = Math.random() < successChance;

  gameManager.consumeFromStockpile?.(tribe, 'bamboo', BAMBOO_REQUIRED);
  gameManager.consumeFromStockpile?.(tribe, 'palms', PALM_REQUIRED);

  const shelterBefore = tribe.shelter || 0;
  let shelterAfter = shelterBefore;
  let narration;
  let relationshipDelta = 0;
  let teamPlayerDelta = 0;

  if (success) {
    shelterAfter = Math.min(MAX_SHELTER_LEVEL, shelterBefore + 1);
    const wentSmooth = relationshipScore > 20 || style === 'together';
    relationshipDelta = wentSmooth ? 4 : 2;
    teamPlayerDelta = wentSmooth ? 10 : 8;
    narration = style === 'lead'
      ? `You call the shots and ${partner.firstName} follows your plan, adjusting on the fly. The frame tightens fast and the tribe notices.`
      : style === 'npc_lead'
        ? `${partner.firstName} sketches their plan and you prop beams, plug gaps, and back them up. Their design clicks and the shelter takes shape.`
        : `You and ${partner.firstName} trade ideas and fall into a rhythm, passing lashings and beams without words. Teamwork makes the walls sturdier.`;
  } else {
    relationshipDelta = relationshipScore < -20 ? -6 : -3;
    teamPlayerDelta = -5;
    narration = style === 'lead'
      ? `${partner.firstName} bristles under your calls and you push back. The lashings slip, tension spikes, and the shelter doesn't improve.`
      : style === 'npc_lead'
        ? `You try to follow ${partner.firstName}'s plan, but directions get crossed and frustration builds. Nothing sturdy comes of it.`
        : `You and ${partner.firstName} get out of sync, second-guessing each other. Tempers rise and the shelter stays the same.`;
  }

  const secondsSpent = Math.round(actualMinutes * 60);
  gameManager.deductTime(secondsSpent);
  updateCampClockUI(gameManager.getDayTimer(), gameManager.getDay());

  const clockElement = document.getElementById('clock-time-text');
  if (clockElement) {
    clockElement.style.color = 'red';
    setTimeout(() => { clockElement.style.color = '#2b190a'; }, 500);
  }

  if (gameManager.systems?.relationshipSystem) {
    gameManager.systems.relationshipSystem.changeRelationship(player.id, partner.id, relationshipDelta);
  }
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  player.teamPlayer = clamp((player.teamPlayer || 50) + teamPlayerDelta, 0, 100);
  partner.teamPlayer = clamp((partner.teamPlayer || 50) + teamPlayerDelta, 0, 100);

  const newShelterLevel = Math.min(MAX_SHELTER_LEVEL, success ? shelterAfter : shelterBefore);
  tribe.shelter = newShelterLevel;
  updateShelterVisuals(newShelterLevel);
  updateStockpileValuesUI(tribe);
  window.refreshMenuCard?.();

  activityTracker.trackShelterBuilding(success, partner.firstName, newShelterLevel, {
    style,
    narration,
    partnerId: partner.id,
    relationshipDelta,
    teamPlayerDelta,
    secondsSpent,
    successChance
  });

  if (teamPlayerDelta !== 0) {
    activityTracker.trackTeamPlayerPoints(
      Math.max(teamPlayerDelta, 0),
      Math.max(-teamPlayerDelta, 0),
      `Shelter building with ${partner.firstName}`
    );
  }

  showParchmentPopup(narration + (success ? `\n\nShelter level: ${newShelterLevel}/${MAX_SHELTER_LEVEL}` : '\n\nNo upgrade this time.' ));
  logShelterBuild(
    style,
    success ? 'success' : 'fail',
    { bamboo: BAMBOO_REQUIRED, palms: PALM_REQUIRED },
    shelterBefore,
    newShelterLevel,
    partner,
    narration,
    relationshipDelta,
    teamPlayerDelta,
    secondsSpent,
    success
  );
  hideContributionUI();
}

function updateShelterVisuals(level) {
  const container = getShelterRoot();
  if (container) {
    container.style.backgroundImage = `url('Assets/Screens/shelter${level}.png')`;
  }
  for (let i = 0; i < 5; i++) {
    const circle = container?.querySelector(`#shelter-level-${i}`);
    if (circle) {
      if (level > i) {
        circle.style.background = 'linear-gradient(45deg, #22c55e, #16a34a)';
        circle.style.borderColor = '#22c55e';
        circle.style.boxShadow = '0 0 15px rgba(34, 197, 94, 0.8)';
      } else {
        circle.style.background = 'rgba(139, 69, 19, 0.3)';
        circle.style.borderColor = '#2d8100';
        circle.style.boxShadow = 'none';
      }
    }
  }
}

function logShelterBuild(style, outcome, stockpileSpent, shelterBefore, shelterAfter, partner, narration, relationshipDelta, teamPlayerDelta, secondsSpent, success) {
  const player = gameManager.getPlayerSurvivor();
  const entry = {
    type: 'camp_shelter_build',
    phase: 'build',
    actorId: player?.id,
    partnerId: partner?.id,
    style,
    outcome,
    success,
    stockpileSpent,
    shelterBefore,
    shelterAfter,
    narration,
    relationshipDelta,
    teamPlayerDelta,
    secondsSpent,
    day: gameManager.getCurrentDay()
  };
  activityTracker.trackActivity(entry.type, entry);
  gameManager.campLog = gameManager.campLog || [];
  gameManager.campLog.push({ ...entry, timestamp: Date.now() });
}

function logBuildAttempt(outcome, partner, style, extra) {
  const entry = {
    type: 'camp_shelter_build',
    phase: 'attempt',
    outcome,
    partnerId: partner?.id,
    style,
    success: false,
    day: gameManager.getCurrentDay(),
    ...extra
  };
  activityTracker.trackActivity(entry.type, entry);
  gameManager.campLog = gameManager.campLog || [];
  gameManager.campLog.push({ ...entry, timestamp: Date.now() });
}

function createResourceButtons(container) {
  const resourceContainer = createElement('div', {
    id: 'shelter-resource-buttons',
    style: `
      position: absolute;
      bottom: 180px;
      left: 50%;
      transform: translateX(-50%);
      display: none;
      gap: 20px;
      z-index: 10;
    `
  });

  const bambooButton = createElement('div', {
    style: `
      width: 80px;
      height: 80px;
      background-image: url('Assets/Minigame/bambooButton.png');
      background-size: contain;
      background-position: center;
      background-repeat: no-repeat;
      cursor: pointer;
      border: 3px solid transparent;
      border-radius: 10px;
      transition: border-color 0.3s;
    `
  });

  const palmButton = createElement('div', {
    style: `
      width: 80px;
      height: 80px;
      background-image: url('Assets/Minigame/palmsButton.png');
      background-size: contain;
      background-position: center;
      background-repeat: no-repeat;
      cursor: pointer;
      border: 3px solid transparent;
      border-radius: 10px;
      transition: border-color 0.3s;
    `
  });

  bambooButton.addEventListener('click', () => showResourcePopup('bamboo'));
  palmButton.addEventListener('click', () => showResourcePopup('palm'));

  resourceContainer.appendChild(bambooButton);
  resourceContainer.appendChild(palmButton);
  container.appendChild(resourceContainer);
}

function showResourceButtons() {
  const resourceButtons = getShelterRoot()?.querySelector('#shelter-resource-buttons');
  if (resourceButtons) resourceButtons.style.display = 'flex';
  bambooAdded = 0;
  palmsAdded = 0;
  updateResourceButtonStyles();
}

function updateResourceButtonStyles() {
  const resourceButtons = getShelterRoot()?.querySelector('#shelter-resource-buttons');
  if (!resourceButtons) return;

  const [bambooButton, palmButton] = resourceButtons.children;
  if (bambooButton) {
    if (bambooAdded >= 1) {
      bambooButton.style.border = '2px solid gold';
      bambooButton.style.boxShadow = '0 0 15px 3px rgba(255, 215, 0, 0.6)';
    } else {
      bambooButton.style.border = '2px solid transparent';
      bambooButton.style.boxShadow = 'none';
    }
  }

  if (palmButton) {
    if (palmsAdded >= 1) {
      palmButton.style.border = '2px solid gold';
      palmButton.style.boxShadow = '0 0 15px 3px rgba(255, 215, 0, 0.6)';
    } else {
      palmButton.style.border = '2px solid transparent';
      palmButton.style.boxShadow = 'none';
    }
  }

  updateContributionSubmit();
}

function showResourcePopup(resourceType) {
  const player = gameManager.getPlayerSurvivor();
  if (!player) return;

  const resourceProperty = resourceType === 'bamboo' ? 'bamboo' : 'palms';
  const resourceCount = player[resourceProperty] || 0;
  const alreadyAdded = resourceType === 'bamboo' ? bambooAdded : palmsAdded;
  const maxSelectable = Math.max(0, resourceCount - alreadyAdded);

  if (resourceCount <= 0) {
    showParchmentPopup(`You don't have any ${resourceType === 'bamboo' ? 'bamboo' : 'palm fronds'} to add!`);
    return;
  }
  if (maxSelectable <= 0) {
    showParchmentPopup(`You've already staged all your available ${resourceType === 'bamboo' ? 'bamboo' : 'palm fronds'}.`);
    return;
  }

  let selectedAmount = 0;
  const root = getShelterRoot();
  const overlayId = `${resourceType}-selector-overlay`;
  root?.querySelectorAll(`#${overlayId}`).forEach(el => el.remove());

  const overlay = createElement('div', {
    id: overlayId,
    className: 'shelter-temp-overlay',
    style: `
      position: absolute;
      inset: 0;
      background-color: rgba(0, 0, 0, 0.7);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 2000;
    `
  });

  const selector = createElement('div', {
    style: `
      width: 260px;
      height: 280px;
      background-image: url('Assets/card-back.png');
      background-size: 100% 100%;
      background-repeat: no-repeat;
      background-position: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 20px 15px;
      box-sizing: border-box;
    `
  });

  const title = createElement('h3', {
    style: `
      margin: 0 0 15px 0;
      font-size: 18px;
      font-weight: bold;
      color: #fff8e7;
      text-shadow: 2px 2px 4px black;
      font-family: 'Survivant', fantasy;
      text-align: center;
      line-height: 1.2;
    `
  });
  title.innerHTML = `How many ${resourceType === 'bamboo' ? 'bamboo' : 'palm fronds'}<br>to contribute?`;

  const availableDisplay = createElement('div', {
    style: `
      margin-bottom: 12px;
      font-size: 14px;
      color: #fff8e7;
      text-shadow: 1px 1px 2px black;
      font-family: 'Survivant', fantasy;
      text-align: center;
    `
  }, `Available: ${resourceCount}`);

  const controls = createElement('div', {
    style: `
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 15px;
      margin: 12px 0;
    `
  });

  const minusBtn = createElement('img', {
    src: 'Assets/Buttons/minus.png',
    alt: 'Decrease',
    style: `
      width: 40px;
      height: 40px;
      cursor: pointer;
      transition: transform 0.2s;
    `
  });
  const amountDisplay = createElement('span', {
    style: `
      font-size: 28px;
      font-weight: bold;
      color: #fff8e7;
      text-shadow: 2px 2px 4px black;
      font-family: 'Survivant', fantasy;
      min-width: 50px;
      text-align: center;
      display: inline-block;
    `
  }, '0');
  const plusBtn = createElement('img', {
    src: 'Assets/Buttons/add.png',
    alt: 'Increase',
    style: `
      width: 40px;
      height: 40px;
      cursor: pointer;
      transition: transform 0.2s;
    `
  });

  const updateAmount = (delta) => {
    selectedAmount = Math.max(0, Math.min(maxSelectable, selectedAmount + delta));
    amountDisplay.textContent = String(selectedAmount);
  };

  minusBtn.addEventListener('click', () => updateAmount(-1));
  plusBtn.addEventListener('click', () => updateAmount(1));

  controls.appendChild(minusBtn);
  controls.appendChild(amountDisplay);
  controls.appendChild(plusBtn);

  const buttonContainer = createElement('div', {
    style: `
      display: flex;
      gap: 10px;
      margin-top: 15px;
      justify-content: center;
    `
  });

  const addButton = createElement('button', {
    className: 'rect-button small',
    style: `
      background-image: url('Assets/rect-button.png');
      background-size: 100% 100%;
      background-repeat: no-repeat;
      background-position: center;
      width: 70px;
      height: 35px;
      border: none;
      color: #fff8e7;
      font-family: 'Survivant', fantasy;
      cursor: pointer;
    `
  }, 'Add');

  addButton.addEventListener('click', () => {
    if (selectedAmount <= 0) return;
    if (resourceType === 'bamboo') {
      bambooAdded = Math.min(resourceCount, bambooAdded + selectedAmount);
    } else {
      palmsAdded = Math.min(resourceCount, palmsAdded + selectedAmount);
    }
    updateResourceButtonStyles();
    overlay.remove();
  });

  const cancelButton = createElement('button', {
    className: 'rect-button small',
    style: `
      background-image: url('Assets/rect-button.png');
      background-size: 100% 100%;
      background-repeat: no-repeat;
      background-position: center;
      width: 70px;
      height: 35px;
      border: none;
      color: #fff8e7;
      font-family: 'Survivant', fantasy;
      cursor: pointer;
    `
  }, 'Cancel');

  cancelButton.addEventListener('click', () => overlay.remove());

  buttonContainer.appendChild(addButton);
  buttonContainer.appendChild(cancelButton);

  selector.appendChild(title);
  selector.appendChild(availableDisplay);
  selector.appendChild(controls);
  selector.appendChild(buttonContainer);

  overlay.appendChild(selector);
  root?.appendChild(overlay);
}

function renderNPCsAtShelter(container) {
  const old = container.querySelector('.npc-icon-container');
  if (old) old.remove();

  const npcContainer = document.createElement('div');
  npcContainer.classList.add('npc-icon-container');

  const survivorsHere = npcLocationSystem.getSurvivorsAtLocation('ShelterView');
  survivorsHere.forEach(survivor => {
    const icon = createNpcIcon(survivor, () => {
      console.log('Clicked NPC at Shelter:', survivor.name);
    });
    npcContainer.appendChild(icon);
  });

  container.appendChild(npcContainer);
}
