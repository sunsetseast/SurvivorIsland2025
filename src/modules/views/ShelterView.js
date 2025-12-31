/**
 * @module ShelterView
 * Renders the shelter screen inside the Camp Phase with building functionality
 */

import { createElement, clearChildren, addDebugBanner } from '../utils/index.js';
import { gameManager } from '../core/index.js';
import { getRandomInt } from '../utils/CommonUtils.js';
import timerManager from '../utils/TimerManager.js';
import activityTracker from '../utils/ActivityTracker.js';
import npcLocationSystem from "../systems/NpcLocationSystem.js";
import { createNpcIcon } from "../ui/NpcIcon.js";

let selectedCoBuilder = null;
let bambooAdded = 0;
let palmsAdded = 0;
const BAMBOO_REQUIRED = 5;
let currentActionMode = null; // 'contribute' | 'build'
let overlayOpen = false;

export default function renderShelter(container) {
  console.log('renderShelter() called');
  addDebugBanner('renderShelter() called', 'darkgreen', 40);

  clearChildren(container);

  // Get player's tribe shelter value to determine background
  const playerTribe = gameManager.getPlayerTribe();
  gameManager.ensureStockpileExists?.(playerTribe);
  const tribeShelterValue = playerTribe && typeof playerTribe.shelter === 'number' ? playerTribe.shelter : 0;

  // Set background based on shelter level
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

  // --- SHELTER LEVEL INDICATOR (5 circles on left side) ---
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

  // Create 5 circles for shelter levels (bottom to top: level 1, 2, 3, 4, 5)
  for (let i = 4; i >= 0; i--) { // Reverse order so bottom circle is index 0
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

    // Light up circles based on current shelter level
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

      /* Start fully visible and allow a fade transition */
      opacity: 1;
      transition: opacity 1s ease;
    `
  }, 'Shelter: Rest, recover, and prepare for the next challenge.');

  wrapper.appendChild(message);
  container.appendChild(wrapper);
  // ⭐ Render NPCs located at the shelter
  renderNPCsAtShelter(container);

  // Fade out after 3 seconds (3000ms)
  setTimeout(() => {
    const msgEl = document.getElementById('shelter-message');
    if (msgEl) {
      msgEl.style.opacity = '0';
    }
  }, 3000);

  // Remove the message from DOM after 4 seconds (4000ms)
  setTimeout(() => {
    const msgEl = document.getElementById('shelter-message');
    if (msgEl) {
      msgEl.remove();
    }
  }, 4000);

  // Resource buttons (initially hidden)
  createResourceButtons(container);

  // --- Action Bar Buttons ---
  const actionButtons = document.getElementById('action-buttons');
  if (actionButtons) {
    clearChildren(actionButtons);

    actionButtons.style.justifyContent = 'center';
    actionButtons.style.gap = '20px';
    actionButtons.style.padding = '0';

    const createIconButton = (src, alt, onClick) => {
      const wrapper = createElement('div', {
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

      wrapper.appendChild(image);
      if (onClick) wrapper.addEventListener('click', onClick);
      return wrapper;
    };

    const leftButton = createIconButton('Assets/Buttons/left.png', 'Left', () => {
      console.log('Left button clicked - returning to Campfire');
      window.campScreen.loadView('campfire');
    });

    const centerButton = createIconButton('Assets/Buttons/blank.png', 'Center', handleCenterButtonClick);

    const downButton = createIconButton('Assets/Buttons/down.png', 'Down', () => {
      console.log('Down button clicked — loading Fork1 View');
      window.campScreen.loadView('fork1');
    });

    actionButtons.appendChild(leftButton);
    actionButtons.appendChild(centerButton);
    actionButtons.appendChild(downButton);
  }
  addDebugBanner('Shelter view rendered!', 'forestgreen', 170);
}

function handleCenterButtonClick() {
  if (overlayOpen) return;
  overlayOpen = true;
  addDebugBanner('Shelter action overlay opened', 'darkorange', 50);

  const overlay = createElement('div', {
    id: 'shelter-overlay',
    style: `
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.6);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 2000;
    `
  });

  const card = createElement('div', {
    style: `
      width: 340px;
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

  card.appendChild(createElement('div', { style: { fontSize: '20px', color: '#3c2415', fontWeight: 'bold' } }, 'Shelter Actions'));

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

  contributeBtn.addEventListener('click', () => {
    closeOverlay();
    startContributionFlow();
  });
  buildBtn.addEventListener('click', () => {
    closeOverlay();
    startBuildFlow();
  });

  card.appendChild(contributeBtn);
  card.appendChild(buildBtn);
  overlay.appendChild(card);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      closeOverlay();
    }
  });

  document.body.appendChild(overlay);
}

function closeOverlay() {
  const existing = document.getElementById('shelter-overlay');
  if (existing) existing.remove();
  overlayOpen = false;
  addDebugBanner('Shelter action overlay closed', 'darkorange', 50);
}

function showParchmentPopup(message, canProceed = false) {
  const popup = createElement('div', {
    id: 'parchment-popup',
    style: `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 400px;
      height: 300px;
      background-image: url('Assets/parch-portrait.png');
      background-size: 100% 100%;
      background-position: center;
      background-repeat: no-repeat;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
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
  document.body.appendChild(popup);

  popup.addEventListener('click', () => {
    popup.remove();
    if (canProceed) {
      showCoBuilderSelection();
    }
  });
}

function ensureStockpileBanner(container, tribe) {
  const existing = container.querySelector('#stockpile-banner');
  if (existing) existing.remove();
  const banner = createElement('div', {
    id: 'stockpile-banner',
    style: `
      position: absolute;
      top: 10px;
      right: 10px;
      background: rgba(0,0,0,0.55);
      color: #fff8e7;
      padding: 10px 14px;
      border-radius: 10px;
      font-family: 'Survivant', serif;
      font-size: 14px;
      box-shadow: 0 2px 12px rgba(0,0,0,0.35);
      z-index: 20;
      white-space: pre-line;
    `
  });
  const stockpile = gameManager.ensureStockpileExists?.(tribe) || {};
  banner.textContent = `Tribe Stockpile\nBamboo: ${stockpile.bamboo || 0}\nPalms: ${stockpile.palms || 0}`;
  container.appendChild(banner);
}

function startContributionFlow() {
  currentActionMode = 'contribute';
  const container = document.querySelector('.shelter-wrapper');
  const tribe = gameManager.getPlayerTribe();
  ensureStockpileBanner(container?.parentElement || document.body, tribe);
  showResourceButtons();
  showContributionSubmit();
  addDebugBanner('Contribution flow started', 'teal', 60);
}

function showContributionSubmit() {
  let submit = document.getElementById('submit-contribution-button');
  if (submit) {
    submit.style.display = 'block';
    return;
  }
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
    `
  }, 'Contribute');
  submit.addEventListener('click', submitContribution);
  document.body.appendChild(submit);
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
  ensureStockpileBanner(document.querySelector('.shelter-wrapper')?.parentElement || document.body, tribe);
}

function startBuildFlow() {
  currentActionMode = 'build';
  addDebugBanner('Build flow started', 'saddlebrown', 60);
  const tribe = gameManager.getPlayerTribe();
  const player = gameManager.getPlayerSurvivor();
  if (!tribe || !player) return;
  const assignments = tribe.day1Plan?.shelterIds || tribe.day1Plan?.shelter || [];
  const isAssigned = assignments.includes(player.id);
  if (!assignments.length) {
    showParchmentPopup('No one is officially assigned yet.');
    logBuildAttempt('not_assigned', null, null, { reason: 'no_assignments' });
    return;
  }
  if (!isAssigned) {
    const speakers = assignments.slice(0, 2).map(id => tribe.members.find(m => m.id === id)?.firstName || 'Someone');
    showParchmentPopup(`${speakers[0] || 'One castaway'} and ${speakers[1] || 'another'} wave you off. "We\'ve got shelter covered. If you want to help, bring bamboo or palm."`);
    logBuildAttempt('not_assigned', speakers, null, {});
    return;
  }
  const stockpile = gameManager.ensureStockpileExists?.(tribe) || {};
  if ((stockpile.bamboo || 0) < BAMBOO_REQUIRED || (stockpile.palms || 0) < 1) {
    showParchmentPopup('The tribe stockpile needs 5 bamboo and 1 palm frond before building.');
    logBuildAttempt('blocked_insufficient_stockpile', null, null, { have: { bamboo: stockpile.bamboo || 0, palms: stockpile.palms || 0 } });
    return;
  }
  const partnerId = assignments.find(id => id !== player.id);
  const partner = tribe.members.find(m => m.id === partnerId);
  const playerIsLeader = tribe.day1Plan?.leaderId === player.id || tribe.day1Plan?.leadershipScenario === 'player_leads' || gameManager.flags?.playerIsLeader;
  showBuildStyleChoice(playerIsLeader, partner);
}

function logBuildAttempt(outcome, speakers, partnerId, extra = {}) {
  const player = gameManager.getPlayerSurvivor();
  const tribe = gameManager.getPlayerTribe();
  const entry = {
    type: 'camp_shelter_attempt',
    outcome,
    day: gameManager.getCurrentDay(),
    actorId: player?.id,
    speakers,
    partnerId,
    ...extra
  };
  activityTracker.trackActivity(entry.type, entry);
  gameManager.campLog = gameManager.campLog || [];
  gameManager.campLog.push({ ...entry, timestamp: Date.now() });
}

function showBuildStyleChoice(playerIsLeader, partner) {
  const parchment = createElement('div', {
    style: `
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.6);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 2100;
    `
  });
  const card = createElement('div', {
    style: `
      width: 360px;
      background-image: url('Assets/parch-portrait.png');
      background-size: cover;
      padding: 40px;
      color: white;
      text-shadow: 2px 2px 4px black;
      font-family: 'Survivant', serif;
      display: flex;
      flex-direction: column;
      gap: 10px;
      box-sizing: border-box;
    `
  });
  const partnerName = partner?.firstName || 'your tribemate';
  const introText = playerIsLeader ? 'Everyone expects you to call the shots on this shelter push.' : `You and ${partnerName} size up the frame. How do you want to run this?`;
  card.appendChild(createElement('div', { style: { fontSize: '18px' } }, introText));

  const buttonContainer = createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } });
  const styles = playerIsLeader ? ['lead'] : ['lead', 'together', 'npc_lead'];
  styles.forEach(style => {
    const label = style === 'lead' ? 'Take the Lead' : style === 'together' ? 'Build Together' : `Let ${partnerName} Lead`;
    const btn = createElement('button', {
      className: 'rect-button alt',
      style: `
        background-image: url('Assets/rect-button-1.png');
        background-size: 100% 100%;
        border: none;
        padding: 10px;
        color: white;
        cursor: pointer;
      `
    }, label);
    btn.addEventListener('click', () => {
      parchment.remove();
      resolveBuild(style, partner);
    });
    buttonContainer.appendChild(btn);
  });
  card.appendChild(buttonContainer);
  parchment.appendChild(card);
  document.body.appendChild(parchment);
}

function resolveBuild(style, partner) {
  const player = gameManager.getPlayerSurvivor();
  const tribe = gameManager.getPlayerTribe();
  if (!player || !tribe) return;
  const stockpile = gameManager.ensureStockpileExists?.(tribe) || {};
  if ((stockpile.bamboo || 0) < BAMBOO_REQUIRED || (stockpile.palms || 0) < 1) {
    addDebugBanner('Guard prevented build without stockpile', 'crimson', 40);
    return;
  }
  const partnerTraits = partner || {};
  const pSkill = ((player.survival || 50) + (player.endurance || 50) + (player.leadership || 50)) / 3;
  const nSkill = ((partnerTraits.survival || 45) + (partnerTraits.endurance || 45) + (partnerTraits.leadership || 45)) / 3;
  const lazinessPenalty = ((player.laziness || 0) + (partnerTraits.laziness || 0)) / 300;
  const teamBoost = ((player.teamPlayer || 50) + (partnerTraits.teamPlayer || 50)) / 200;
  let base = (pSkill * 0.6 + nSkill * 0.4) / 100;
  if (style === 'together') base += 0.05 * teamBoost;
  if (style === 'lead') base += 0.1 * Math.random();
  if (style === 'npc_lead') base += ((partnerTraits.leadership || 50) - (player.leadership || 50)) / 400;
  base -= lazinessPenalty;
  const variance = style === 'together' ? 0.05 : 0.12;
  const roll = base + (Math.random() * variance - variance / 2);
  const success = roll > 0.45;

  let narration = '';
  let spent = { bamboo: 0, palms: 0 };
  const shelterBefore = tribe.shelter || 0;
  if (success) {
    gameManager.consumeFromStockpile?.(tribe, 'bamboo', BAMBOO_REQUIRED);
    gameManager.consumeFromStockpile?.(tribe, 'palms', 1);
    spent = { bamboo: BAMBOO_REQUIRED, palms: 1 };
    tribe.shelter = Math.min(4, shelterBefore + 1);
    narration = 'The frame tightens and the roof holds. The tribe steps back impressed.';
    addDebugBanner('Shelter build success', 'darkgreen', 60);
  } else {
    gameManager.consumeFromStockpile?.(tribe, 'bamboo', 2);
    gameManager.consumeFromStockpile?.(tribe, 'palms', 1);
    spent = { bamboo: 2, palms: 1 };
    narration = 'A gust snaps the lashings and the frame slumps. You salvage what you can, but time is lost.';
    addDebugBanner('Shelter build failed', 'darkred', 60);
  }
  updateShelterVisuals(tribe.shelter || 0);
  logShelterBuild(style, success ? 'success' : 'fail', spent, shelterBefore, tribe.shelter || 0, partner, narration);
  showParchmentPopup(narration);
}

function updateShelterVisuals(level) {
  const container = document.querySelector('.shelter-wrapper')?.parentElement;
  if (container) {
    container.style.backgroundImage = `url('Assets/Screens/shelter${level}.png')`;
  }
  for (let i = 0; i < 5; i++) {
    const circle = document.getElementById(`shelter-level-${i}`);
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

function logShelterBuild(style, outcome, stockpileSpent, shelterBefore, shelterAfter, partner, narration) {
  const player = gameManager.getPlayerSurvivor();
  const entry = {
    type: 'camp_shelter_build',
    actorId: player?.id,
    partnerId: partner?.id,
    style,
    outcome,
    stockpileSpent,
    shelterBefore,
    shelterAfter,
    narration,
    day: gameManager.getCurrentDay()
  };
  activityTracker.trackActivity(entry.type, entry);
  gameManager.campLog = gameManager.campLog || [];
  gameManager.campLog.push({ ...entry, timestamp: Date.now() });
}

function showCoBuilderSelection() {
  const playerTribe = gameManager.getPlayerTribe();
  const player = gameManager.getPlayerSurvivor();

  if (!playerTribe || !player) return;

  const tribeColor = playerTribe.color || 'blue';
  const backgroundImage = `Assets/Tribe/${tribeColor}-banner.png`;

  const popup = createElement('div', {
    id: 'cobuilder-popup',
    style: `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background-image: url('${backgroundImage}');
      background-size: cover;
      background-position: center;
      background-repeat: no-repeat;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      padding: 20px;
      box-sizing: border-box;
    `
  });

  const grid = createElement('div', {
    style: `
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 8px;
      max-width: 500px;
      width: 90%;
      padding: 40px 20px;
      margin-top: 20px;
    `
  });

  // Get tribe members excluding the player
  const tribeMembers = playerTribe.members.filter(member => member.id !== player.id);

  tribeMembers.forEach(survivor => {
    const memberCard = createElement('div', {
      style: `
        display: flex;
        flex-direction: column;
        align-items: center;
        cursor: pointer;
        padding: 5px;
        border-radius: 10px;
        transition: background-color 0.3s;
      `
    });

    memberCard.addEventListener('mouseenter', () => {
      memberCard.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
    });

    memberCard.addEventListener('mouseleave', () => {
      memberCard.style.backgroundColor = 'transparent';
    });

    const avatar = createElement('img', {
      src: survivor.avatarUrl,
      alt: survivor.name,
      style: `
        width: 60px;
        height: 60px;
        border-radius: 50%;
        object-fit: cover;
        border: 2px solid white;
        margin-bottom: 3px;
      `
    });

    const name = createElement('div', {
      style: `
        font-family: 'Survivant', serif;
        font-size: 12px;
        color: white;
        text-shadow: 1px 1px 2px black;
        text-align: center;
        margin-bottom: 1px;
      `
    }, survivor.firstName);

    const physical = createElement('div', {
      style: `
        font-family: 'Survivant', serif;
        font-size: 10px;
        color: white;
        text-shadow: 1px 1px 2px black;
        text-align: center;
      `
    }, `Physical: ${survivor.physical}`);

    memberCard.appendChild(avatar);
    memberCard.appendChild(name);
    memberCard.appendChild(physical);

    memberCard.addEventListener('click', () => {
      showConfirmationDialog(survivor, popup);
    });

    grid.appendChild(memberCard);
  });

  popup.appendChild(grid);
  document.body.appendChild(popup);
}

function showConfirmationDialog(survivor, parentPopup) {
  const confirmPopup = createElement('div', {
    id: 'confirm-popup',
    style: `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 300px;
      height: 250px;
      background-image: url('Assets/card-back.png');
      background-size: 100% 100%;
      background-position: center;
      background-repeat: no-repeat;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      z-index: 1001;
      padding: 20px;
      box-sizing: border-box;
    `
  });

  const avatar = createElement('img', {
    src: survivor.avatarUrl,
    alt: survivor.name,
    style: `
      width: 80px;
      height: 80px;
      border-radius: 50%;
      object-fit: cover;
      border: 3px solid white;
      margin-bottom: 10px;
    `
  });

  const question = createElement('div', {
    style: `
      font-family: 'Survivant', serif;
      font-size: 16px;
      color: white;
      text-shadow: 2px 2px 4px black;
      text-align: center;
      margin-bottom: 15px;
    `
  }, `Choose ${survivor.firstName}?`);

  const buttonContainer = createElement('div', {
    style: `
      display: flex;
      gap: 10px;
    `
  });

  const confirmButton = createElement('button', {
    className: 'rect-button small',
    style: `
      background-image: url('Assets/rect-button.png');
      background-size: 100% 100%;
      border: none;
      width: 80px;
      height: 35px;
      font-family: 'Survivant', serif;
      font-size: 12px;
      color: white;
      cursor: pointer;
    `
  }, 'Confirm');

  const cancelButton = createElement('button', {
    className: 'rect-button small',
    style: `
      background-image: url('Assets/rect-button.png');
      background-size: 100% 100%;
      border: none;
      width: 80px;
      height: 35px;
      font-family: 'Survivant', serif;
      font-size: 12px;
      color: white;
      cursor: pointer;
    `
  }, 'Cancel');

  confirmButton.addEventListener('click', () => {
    selectedCoBuilder = survivor;
    confirmPopup.remove();
    parentPopup.remove();
    showResourceButtons();
  });

  cancelButton.addEventListener('click', () => {
    confirmPopup.remove();
  });

  buttonContainer.appendChild(confirmButton);
  buttonContainer.appendChild(cancelButton);

  confirmPopup.appendChild(avatar);
  confirmPopup.appendChild(question);
  confirmPopup.appendChild(buttonContainer);

  document.body.appendChild(confirmPopup);
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
  const resourceButtons = document.getElementById('shelter-resource-buttons');
  if (resourceButtons) {
    resourceButtons.style.display = 'flex';
  }

  // Reset resource counts
  bambooAdded = 0;
  palmsAdded = 0;
  updateResourceButtonStyles();
}

function updateResourceButtonStyles() {
  const resourceButtons = document.getElementById('shelter-resource-buttons');
  if (!resourceButtons) return;

  const bambooButton = resourceButtons.children[0];
  const palmButton = resourceButtons.children[1];

  // Add blurred gold glow effect when resources are added
  if (bambooAdded >= 1) {
    bambooButton.style.border = '2px solid gold';
    bambooButton.style.boxShadow = '0 0 15px 3px rgba(255, 215, 0, 0.6)';
    bambooButton.style.borderRadius = '10px';
  } else {
    bambooButton.style.border = '2px solid transparent';
    bambooButton.style.boxShadow = 'none';
    bambooButton.style.borderRadius = '10px';
  }

  if (palmsAdded >= 1) {
    palmButton.style.border = '2px solid gold';
    palmButton.style.boxShadow = '0 0 15px 3px rgba(255, 215, 0, 0.6)';
    palmButton.style.borderRadius = '10px';
  } else {
    palmButton.style.border = '2px solid transparent';
    palmButton.style.boxShadow = 'none';
    palmButton.style.borderRadius = '10px';
  }

  // Show start building button if both resources are added
  if (currentActionMode === 'build' && bambooAdded >= BAMBOO_REQUIRED && palmsAdded >= 1) {
    showStartBuildingButton();
  }
}

function showResourcePopup(resourceType) {
  const player = gameManager.getPlayerSurvivor();
  if (!player) return;

  const resourceProperty = resourceType === 'bamboo' ? 'bamboo' : 'palms';
  const resourceCount = player[resourceProperty] || 0;
  const alreadyAdded = resourceType === 'bamboo' ? bambooAdded : palmsAdded;
  const requiredAmount = currentActionMode === 'contribute' ? resourceCount : resourceType === 'bamboo' ? BAMBOO_REQUIRED : 1;
  const remainingNeeded = Math.max(0, requiredAmount - alreadyAdded);
  const maxSelectable = currentActionMode === 'contribute' ? resourceCount : Math.min(resourceCount, remainingNeeded);

  if (resourceCount <= 0) {
    showInsufficientResourceParchment(resourceType);
    return;
  }

  if (remainingNeeded <= 0) {
    showParchmentPopup(`You've already added enough ${resourceType === 'bamboo' ? 'bamboo' : 'palm fronds'}.`);
    return;
  }

  let selectedAmount = 0;

  const overlay = createElement('div', {
    id: `${resourceType}-selector-overlay`,
    style: `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
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
  title.innerHTML = `Add ${resourceType === 'bamboo' ? 'bamboo' : 'palm fronds'}<br>to shelter`;

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

  minusBtn.addEventListener('mouseenter', () => {
    minusBtn.style.transform = 'scale(1.1)';
  });
  minusBtn.addEventListener('mouseleave', () => {
    minusBtn.style.transform = 'scale(1)';
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

  plusBtn.addEventListener('mouseenter', () => {
    plusBtn.style.transform = 'scale(1.1)';
  });
  plusBtn.addEventListener('mouseleave', () => {
    plusBtn.style.transform = 'scale(1)';
  });

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
      font-size: 12px;
      font-weight: bold;
      cursor: pointer;
      text-shadow: 1px 1px 2px black;
      box-shadow: none;
    `
  }, 'Add');

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
      font-size: 12px;
      font-weight: bold;
      cursor: pointer;
      text-shadow: 1px 1px 2px black;
      box-shadow: none;
    `
  }, 'Cancel');

  minusBtn.addEventListener('click', () => {
    if (selectedAmount > 0) {
      selectedAmount--;
      amountDisplay.textContent = selectedAmount;
    }
  });

  plusBtn.addEventListener('click', () => {
    if (selectedAmount < maxSelectable) {
      selectedAmount++;
      amountDisplay.textContent = selectedAmount;
    }
  });

  addButton.addEventListener('click', () => {
    if (selectedAmount > 0) {
      // Show resource deduction effect
      showResourceEffect(resourceType, selectedAmount);

      if (resourceType === 'bamboo') {
        bambooAdded = Math.min(requiredAmount, bambooAdded + selectedAmount);
        player.bamboo = Math.max(0, player.bamboo - selectedAmount);
      } else {
        palmsAdded = Math.min(requiredAmount, palmsAdded + selectedAmount);
        player.palms = Math.max(0, player.palms - selectedAmount);
      }
      overlay.remove();
      updateResourceButtonStyles();
    }
  });

  cancelButton.addEventListener('click', () => {
    overlay.remove();
  });

  controls.appendChild(minusBtn);
  controls.appendChild(amountDisplay);
  controls.appendChild(plusBtn);

  buttonContainer.appendChild(addButton);
  buttonContainer.appendChild(cancelButton);

  selector.appendChild(title);
  selector.appendChild(availableDisplay);
  selector.appendChild(controls);
  selector.appendChild(buttonContainer);
  overlay.appendChild(selector);
  document.body.appendChild(overlay);
}

function showInsufficientResourceParchment(resourceType) {
  const overlay = createElement('div', {
    id: `insufficient-${resourceType}-overlay`,
    style: `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background-color: rgba(0, 0, 0, 0.7);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 2000;
      cursor: pointer;
    `
  });

  const parchment = createElement('div', {
    style: `
      width: 70vw;
      max-width: 300px;
      background-image: url('Assets/parch-landscape.png');
      background-size: contain;
      background-repeat: no-repeat;
      background-position: center;
      padding: 25px 20px;
      box-sizing: border-box;
    `
  });

  const text = createElement(
    'div',
    {
      style: `
        color: white;
        font-family: 'Survivant', sans-serif;
        font-size: 1rem;
        text-align: center;
        text-shadow: 2px 2px 4px black;
        line-height: 1.3;
      `
    },
    `You don't have any ${resourceType === 'bamboo' ? 'bamboo' : 'palm fronds'} to add!`
  );

  parchment.appendChild(text);
  overlay.appendChild(parchment);
  document.body.appendChild(overlay);

  overlay.addEventListener('click', () => {
    overlay.remove();
  });
}

function showResourceEffect(resourceType, amount) {
  const effect = createElement('div', {
    className: `${resourceType}-hit-effect`,
    style: `
      position: fixed;
      left: 50%;
      top: 50%;
      transform: translate(-50%, -50%);
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 28px;
      font-weight: bold;
      color: #dc2626;
      z-index: 9999;
      pointer-events: none;
    `
  });

  const minus = document.createElement('span');
  minus.textContent = `-${amount}`;

  const icon = document.createElement('img');
  icon.src = `Assets/Resources/${resourceType === 'bamboo' ? 'bamboo' : 'palm'}.png`;
  icon.style.height = '28px';
  icon.style.width = 'auto';

  effect.appendChild(minus);
  effect.appendChild(icon);
  document.body.appendChild(effect);

  setTimeout(() => {
    effect.remove();
  }, 2500);
}

function showStartBuildingButton() {
  const existingButton = document.getElementById('start-building-button');
  if (existingButton) return;

  const button = createElement('button', {
    id: 'start-building-button',
    className: 'rect-button alt',
    style: `
      position: absolute;
      top: 35%;
      left: 50%;
      transform: translate(-50%, -50%);
      background-image: url('Assets/rect-button-1.png');
      background-size: 100% 100%;
      background-repeat: no-repeat;
      background-position: center;
      border: none;
      font-family: 'Survivant', serif;
      font-size: 16px;
      font-weight: bold;
      color: white;
      text-shadow: 3px 3px 6px black;
      cursor: pointer;
      z-index: 100;
      box-shadow: none;
      filter: brightness(1.1);
      padding: 8px;
      line-height: 1.1;
      text-align: center;
    `
  });

  button.innerHTML = 'Start<br>Building';

  button.addEventListener('click', startBuilding);
  document.body.appendChild(button);
}

function computeShelterRelationshipDelta(player, coBuilder, actualBuildTime, expectedBuildTime) {
  // 1. Performance Factor (more impactful)
  const performanceFactor = expectedBuildTime / actualBuildTime;
  
  // 2. Style Compatibility (with negative potential)
  const styleCompat = {
    'aggressive|aggressive': 1.2,  // Can clash if both too forceful
    'aggressive|balanced': 1.4,
    'aggressive|cautious': 0.4,   // Very poor compatibility
    'balanced|aggressive': 1.4,
    'balanced|balanced': 1.5,
    'balanced|cautious': 1.2,
    'cautious|aggressive': 0.4,   // Very poor compatibility
    'cautious|balanced': 1.2,
    'cautious|cautious': 0.8      // Too slow together
  };

  const styleKey = `${player.gameplayStyle}|${coBuilder.gameplayStyle}`;
  const styleFactor = styleCompat[styleKey] || 1.0;

  // 3. Physical Balance (bigger penalty for mismatched abilities)
  const physGap = Math.abs(player.physical - coBuilder.physical);
  const maxPhysical = 100;
  const physicalFactor = 1 - (physGap / maxPhysical) * 0.6; // Increased penalty

  // 4. Personality Harmony (can be negative)
  const avgTeam = (player.teamPlayer + coBuilder.teamPlayer) / 200;
  const avgSocial = (player.social + coBuilder.social) / 200;
  const avgMental = (player.mental + coBuilder.mental) / 200;
  const harmonyFactor = (avgTeam * 1.3 + avgSocial * 1.2 + avgMental) / 3;

  // 5. Stress / Suspicion Penalty (more impactful)
  const threatAvg = (player.threat + coBuilder.threat) / 2 / 100;
  const healthAvg = (player.health + coBuilder.health) / 2 / 100;
  const stressFactor = 1 - (threatAvg * 0.4) - ((1 - healthAvg) * 0.3);

  // 6. Determine if collaboration was successful or problematic
  const collaborationQuality = performanceFactor * styleFactor * physicalFactor * harmonyFactor * stressFactor;
  
  let baseChange;
  let message = '';
  
  if (collaborationQuality >= 1.2) {
    // Excellent collaboration
    baseChange = +5;
    message = 'Excellent teamwork!';
  } else if (collaborationQuality >= 0.9) {
    // Good collaboration
    baseChange = +3;
    message = 'Good collaboration';
  } else if (collaborationQuality >= 0.6) {
    // Adequate but strained - can be slightly negative to slightly positive
    baseChange = Math.random() < 0.5 ? -1 : +1; // Random between -1 and +1
    message = 'Adequate but tense';
  } else if (collaborationQuality >= 0.4) {
    // Poor collaboration - relationship damage
    baseChange = -2;
    message = 'Poor collaboration caused friction';
  } else {
    // Very poor collaboration - significant damage
    baseChange = -4;
    message = 'Terrible collaboration caused conflict';
  }

  // 7. Apply final calculation
  let delta = Math.round(baseChange * (0.5 + collaborationQuality * 0.5));
  
  // Special handling for adequate but tense range to ensure -2 to +2
  if (collaborationQuality >= 0.6 && collaborationQuality < 0.9) {
    delta = Math.max(-2, Math.min(2, delta));
  } else {
    // Clamp to reasonable bounds (-6 to +8) for other categories
    delta = Math.max(-6, Math.min(8, delta));
  }

  console.log(`Shelter relationship calculation:
    Performance: ${performanceFactor.toFixed(2)}
    Style: ${styleFactor}
    Physical: ${physicalFactor.toFixed(2)}
    Harmony: ${harmonyFactor.toFixed(2)}
    Stress: ${stressFactor.toFixed(2)}
    Collaboration Quality: ${collaborationQuality.toFixed(2)}
    Base: ${baseChange}
    Final Delta: ${delta}
    Result: ${message}`);

  return { delta, message };
}

function startBuilding() {
  const player = gameManager.getPlayerSurvivor();
  const playerTribe = gameManager.getPlayerTribe();

  if (!player || !selectedCoBuilder || !playerTribe) return;

  // Calculate expected construction time based on physical values
  const playerPhysical = player.physical || 30;
  const coBuilderPhysical = selectedCoBuilder.physical || 30;
  const averagePhysical = (playerPhysical + coBuilderPhysical) / 2;

  // Convert average physical (28-45 range) to expected time (5-20 minutes)
  // Higher physical = less time
  const minTime = 5;
  const maxTime = 20;
  const minPhysical = 28;
  const maxPhysical = 45;

  const expectedBuildTime = Math.round(maxTime - ((averagePhysical - minPhysical) / (maxPhysical - minPhysical)) * (maxTime - minTime));

  // Calculate actual build time with additional factors
  let actualBuildTime = expectedBuildTime;

  // Apply harmony factor to actual build time
  const avgTeam = (player.teamPlayer + selectedCoBuilder.teamPlayer) / 200;
  const avgSocial = (player.social + selectedCoBuilder.social) / 200;
  const avgMental = (player.mental + selectedCoBuilder.mental) / 200;
  const harmonyFactor = (avgTeam + avgSocial + avgMental) / 3;

  // Apply style compatibility to build time
  const styleCompat = {
    'aggressive|aggressive': 0.9,
    'aggressive|balanced': 1.1,
    'aggressive|cautious': 0.8,
    'balanced|aggressive': 1.1,
    'balanced|balanced': 1.2,
    'balanced|cautious': 1.0,
    'cautious|aggressive': 0.8,
    'cautious|balanced': 1.0,
    'cautious|cautious': 1.1
  };

  const styleKey = `${player.gameplayStyle}|${selectedCoBuilder.gameplayStyle}`;
  const styleFactor = styleCompat[styleKey] || 1.0;

  // Apply stress factors
  const threatAvg = (player.threat + selectedCoBuilder.threat) / 2 / 100;
  const healthAvg = (player.health + selectedCoBuilder.health) / 2 / 100;
  const stressFactor = 1 - (threatAvg * 0.3) - ((1 - healthAvg) * 0.2);

  // Calculate final build time
  actualBuildTime = Math.round(expectedBuildTime / (harmonyFactor * styleFactor * stressFactor));
  actualBuildTime = Math.max(3, Math.min(30, actualBuildTime)); // Clamp between 3-30 minutes

  const constructionTime = actualBuildTime;

  // Calculate relationship delta FIRST
  const relationshipResult = computeShelterRelationshipDelta(player, selectedCoBuilder, actualBuildTime, expectedBuildTime);
  const relationshipDelta = relationshipResult.delta;
  const collaborationMessage = relationshipResult.message;

  // Increase shelter value
  const newShelterLevel = (playerTribe.shelter || 0) + 1;
  playerTribe.shelter = newShelterLevel;

  // Track shelter building activity with relationship outcome
  const relationshipOutcomePositive = relationshipDelta >= 0;
  activityTracker.trackShelterBuilding(
    relationshipOutcomePositive, // success based on relationship outcome
    selectedCoBuilder.firstName,
    newShelterLevel
  );

  // Track teamPlayer points gained
  activityTracker.trackTeamPlayerPoints(
    10, // pointsEarned
    0,  // pointsLost
    `Shelter building with ${selectedCoBuilder.firstName}`
  );

  // Add teamPlayer points
  player.teamPlayer = (player.teamPlayer || 50) + 10;
  selectedCoBuilder.teamPlayer = (selectedCoBuilder.teamPlayer || 50) + 10;

  // Apply relationship changes using the relationship system
  if (gameManager.systems && gameManager.systems.relationshipSystem) {
    gameManager.systems.relationshipSystem.changeRelationship(player.id, selectedCoBuilder.id, relationshipDelta);
  }

  console.log(`Shelter building relationship change: ${relationshipDelta} between ${player.firstName} and ${selectedCoBuilder.firstName} (${collaborationMessage})`);

  // Update background
  const newBackgroundImage = `url('Assets/Screens/shelter${playerTribe.shelter}.png')`;
  const container = document.querySelector('.shelter-wrapper').parentElement;
  container.style.backgroundImage = newBackgroundImage;

  // Update shelter level indicator
  for (let i = 0; i < 5; i++) {
    const circle = document.getElementById(`shelter-level-${i}`);
    if (circle) {
      if (newShelterLevel > i) {
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

  // Show completion message with relationship context
  let relationshipMessage = '';
  if (relationshipDelta > 0) {
    relationshipMessage = ` ${collaborationMessage} - your relationship with ${selectedCoBuilder.firstName} improved.`;
  } else if (relationshipDelta < 0) {
    relationshipMessage = ` ${collaborationMessage} - this strained your relationship with ${selectedCoBuilder.firstName}.`;
  } else {
    relationshipMessage = ` You and ${selectedCoBuilder.firstName} worked together without major incident.`;
  }

  const message = `Based on your teamwork, compatibility, and combined abilities, construction took ${constructionTime} minutes.${relationshipMessage}`;

  // Deduct time from clock (convert minutes to seconds)
  const timeInSeconds = constructionTime * 60;
  gameManager.deductTime(timeInSeconds);

  // Update clock display and flash red
  const clockElement = document.getElementById('clock-time-text');
  const dayElement = document.getElementById('clock-day-text');
  if (clockElement && dayElement) {
    const min = Math.floor(gameManager.dayTimer / 60);
    const sec = gameManager.dayTimer % 60;
    clockElement.textContent = `${min}:${sec.toString().padStart(2, '0')}`;
    dayElement.textContent = `Day ${gameManager.day}`;
  }

  // Flash red effect on the correct clock element
  if (clockElement) {
    clockElement.style.color = 'red';
    setTimeout(() => {
      clockElement.style.color = '#2b190a';
    }, 500);
  }

  // Show teamPlayer animation (only if positive outcome)
  if (relationshipDelta >= 0) {
    showTeamPlayerAnimation();
  }

  // Clean up
  const startButton = document.getElementById('start-building-button');
  if (startButton) startButton.remove();

  const resourceButtons = document.getElementById('shelter-resource-buttons');
  if (resourceButtons) resourceButtons.style.display = 'none';

  selectedCoBuilder = null;
  bambooAdded = 0;
  palmsAdded = 0;

  showParchmentPopup(message);
}

function showTeamPlayerAnimation() {
  const animationElement = createElement('div', {
    style: `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      display: flex;
      align-items: center;
      gap: 10px;
      z-index: 1010;
      animation: fadeInOut 3s forwards;
      pointer-events: none;
    `
  });

  const teamPlayerIcon = createElement('img', {
    src: 'Assets/Resources/teamPlayer.png',
    alt: 'Team Player',
    style: `
      width: 40px;
      height: 40px;
    `
  });

  const text = createElement('div', {
    style: `
      font-family: 'Survivant', serif;
      font-size: 24px;
      color: white;
      text-shadow: 2px 2px 4px black;
      font-weight: bold;
    `
  }, '+10');

  animationElement.appendChild(teamPlayerIcon);
  animationElement.appendChild(text);

  // Add CSS animation
  const style = createElement('style');
  style.textContent = `
    @keyframes fadeInOut {
      0% { opacity: 0; transform: translate(-50%, -50%) translateY(20px); }
      30% { opacity: 1; transform: translate(-50%, -50%) translateY(0px); }
      70% { opacity: 1; transform: translate(-50%, -50%) translateY(0px); }
      100% { opacity: 0; transform: translate(-50%, -50%) translateY(-20px); }
    }
  `;
  document.head.appendChild(style);

  document.body.appendChild(animationElement);

  setTimeout(() => {
    animationElement.remove();
    style.remove();
  }, 3000);
}

/* --------------------------------------------------------------
   ⭐ NEW: NPC RENDER FUNCTION FOR SHELTER VIEW
-------------------------------------------------------------- */
function renderNPCsAtShelter(container) {
  // Remove old NPC container if it exists
  const old = container.querySelector(".npc-icon-container");
  if (old) old.remove();

  // Create fresh container for NPC icons
  const npcContainer = document.createElement("div");
  npcContainer.classList.add("npc-icon-container");

  // Get survivors located at ShelterView
  const survivorsHere = npcLocationSystem.getSurvivorsAtLocation("ShelterView");

  survivorsHere.forEach(survivor => {
    const icon = createNpcIcon(survivor, () => {
      console.log("Clicked NPC at Shelter:", survivor.name);
      // TODO: open conversation UI (later step)
    });
    npcContainer.appendChild(icon);
  });

  container.appendChild(npcContainer);
}
