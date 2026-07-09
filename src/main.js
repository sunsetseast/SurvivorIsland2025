/**
 * Main entry point for the Survivor Island game
 * Initializes game systems and starts the game
 */

import { gameManager } from './modules/core/GameManager.js';
import { screenManager, eventManager, GameEvents, challengeManager } from './modules/core/index.js';
import {
  WelcomeScreen,
  CharacterSelectionScreen,
  TribeDivisionScreen,
  CampScreen,
  ChallengeScreen,
  TribalCouncilView
} from './modules/screens/index.js';
import * as systems from './modules/systems/index.js';
import timerManager from './modules/utils/TimerManager.js';
import { openRelationshipsOverlay } from './modules/screens/camp/RelationshipsOverlay.js';
import { openSocialMenuOverlay, closeSocialMenuOverlay } from './modules/screens/camp/SocialMenuOverlay.js';
import { openAlliancesOverlay, closeAlliancesOverlay } from './modules/screens/camp/AlliancesOverlay.js';
import npcAutoRenderer from './modules/ui/NpcAutoRenderer.js';
import { initOverlaysController } from './modules/ui/OverlaysController.js';
import InventoryUI from './modules/ui/InventoryUI.js';
import TribalCouncilSystem from './modules/systems/TribalCouncilSystem.js';

window.mainJsLoaded = true;
window.openRelationshipsOverlay = openRelationshipsOverlay;
window.openSocialMenuOverlay = openSocialMenuOverlay;
window.closeSocialMenuOverlay = closeSocialMenuOverlay;
window.openAlliancesOverlay = openAlliancesOverlay;
window.closeAlliancesOverlay = closeAlliancesOverlay;

// A startup marker is available only when explicitly debugging.
if (new URLSearchParams(window.location.search).has('debug')) {
  const debugBanner = document.createElement('div');
  debugBanner.textContent = 'main.js is running!';
  debugBanner.style.cssText = 'position:fixed;top:0;left:0;background:#8d1b16;color:#fff;padding:5px 10px;z-index:9999;';
  document.body.appendChild(debugBanner);
}

/**
 * Initialize the game when the DOM is loaded
 */
function init() {
  console.log(`Initializing Survivor Island`);

  // Register screens
  screenManager.registerScreen('welcome', new WelcomeScreen());
  screenManager.registerScreen('character-selection', new CharacterSelectionScreen());
  screenManager.registerScreen('tribe-division', new TribeDivisionScreen());

  const campScreenInstance = new CampScreen();
  screenManager.registerScreen('camp', campScreenInstance);
  window.campScreen = campScreenInstance;

  const challengeScreenInstance = new ChallengeScreen();
  screenManager.registerScreen('challenge', challengeScreenInstance);

  const tribalCouncilSystem = new TribalCouncilSystem(gameManager, eventManager);
  gameManager.systems.tribalCouncilSystem = tribalCouncilSystem;
  const tribalCouncilScreenInstance = new TribalCouncilView({
    gameManager,
    tribalCouncilSystem
  });
  screenManager.registerScreen('tribal-council', tribalCouncilScreenInstance);

  screenManager.initialize();
  screenManager.showScreen('welcome');

  initOverlaysController();
  InventoryUI.init();

  // Register systems
  // Core systems (all created fresh because they depend on gameManager)
  gameManager.registerSystem("dialogueSystem", new systems.DialogueSystem(gameManager));
  gameManager.registerSystem("energySystem", new systems.EnergySystem(gameManager));
  gameManager.registerSystem("inventorySystem", new systems.InventorySystem(gameManager));
  gameManager.registerSystem("idolSystem", new systems.IdolSystem(gameManager));
  gameManager.registerSystem("relationshipSystem", new systems.RelationshipSystem(gameManager));
  gameManager.registerSystem("trustSystem", new systems.TrustSystem(gameManager));
  gameManager.registerSystem("allianceSystem", new systems.AllianceSystem(gameManager));
  gameManager.registerSystem("dealSystem", new systems.DealSystem(gameManager));
  gameManager.registerSystem("dealConsequencesSystem", new systems.DealConsequencesSystem(gameManager));
  gameManager.registerSystem("challengeManager", challengeManager);

  // ⭐ NPC LOCATION SYSTEM — USE THE SINGLETON, NOT A NEW INSTANCE
  gameManager.registerSystem("npcLocationSystem", systems.npcLocationSystem);

  // Subscribe to events
  eventManager.subscribe(GameEvents.GAME_INITIALIZED, handleGameInitialized);
  eventManager.subscribe(GameEvents.GAME_STARTED, handleGameStarted);

  // Initialize game
  console.log("Calling gameManager.initialize()…");
  gameManager.initialize();

  // ⭐⭐⭐ CRITICAL LINE — ACTIVATE NPC RENDER SYSTEM ⭐⭐⭐
  console.log("Initializing npcAutoRenderer…");
  npcAutoRenderer.initialize();

  // Show "continue game" if save exists
  const continueButton = document.getElementById('continue-game-button');
  if (gameManager.hasSavedGame() && continueButton) {
    continueButton.style.display = 'block';
  }

  setupEventListeners();
  setupMenuToggle();
  setupSaveControls();
  console.log('Initialization complete');
}

function handleGameInitialized(data) {
  console.log('Game initialized');
}

function handleGameStarted(data) {
  console.log('Game started with settings:', data.settings);
}

function setupEventListeners() {
  const closeButtons = document.querySelectorAll('.dialog-close');

  closeButtons.forEach(button => {
    button.addEventListener('click', () => {
      const dialog = button.closest('.dialog');
      if (dialog) dialog.style.display = 'none';
    });
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      document.querySelectorAll('.dialog').forEach(dialog => {
        dialog.style.display = 'none';
      });
    }
  });
}

function updateInventoryUI() {
  InventoryUI.renderResources();
}

function setupMenuToggle() {
  const hamburger = document.getElementById('hamburger-icon');
  const menuCard = document.getElementById('menu-card');
  const overlay = document.getElementById('menu-overlay');

  if (!hamburger || !menuCard || !overlay) return;

  hamburger.addEventListener('click', () => {
    const isVisible = window.getComputedStyle(menuCard).display === 'block';

    menuCard.style.display = isVisible ? 'none' : 'block';
    overlay.style.display = isVisible ? 'none' : 'block';

    if (!isVisible) {
      updateInventoryUI();
      if (window.refreshMenuCard) window.refreshMenuCard();
    }
  });

  overlay.addEventListener('click', () => {
    menuCard.style.display = 'none';
    overlay.style.display = 'none';
  });
}

function setupSaveControls() {
  const saveButton = document.getElementById('menu-save-button');
  if (saveButton) {
    saveButton.addEventListener('click', () => {
      const saved = gameManager.saveGame();
      if (!saved) showSaveStatus('Save failed');
    });
  }

  eventManager.subscribe(GameEvents.GAME_SAVED, ({ manual = false } = {}) => {
    showSaveStatus(manual ? 'Saved' : 'Autosaved');
    const continueButton = document.getElementById('continue-game-button');
    if (continueButton) {
      continueButton.style.display = 'block';
    }
  });
}

let saveStatusTimer = null;

function showSaveStatus(message = 'Saved') {
  const toast = document.getElementById('save-status-toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('visible');
  if (saveStatusTimer) clearTimeout(saveStatusTimer);
  saveStatusTimer = setTimeout(() => {
    toast.classList.remove('visible');
    saveStatusTimer = null;
  }, 1800);
}

function cleanup() {
  if (gameManager.isInitialized && gameManager.getGameState() !== 'welcome') {
    gameManager.saveGame();
  }
  timerManager.clearAll();
  console.log('Game cleanup complete');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

window.addEventListener('beforeunload', cleanup);
window.gameManager = gameManager;

function getCriticalSaveFields(payload) {
  const gm = payload?.gameManager || {};
  const systemsState = payload?.systems || {};
  return {
    saveVersion: payload?.saveVersion,
    gameState: gm.gameState,
    gamePhase: gm.gamePhase,
    day: gm.day,
    dayTimer: gm.dayTimer,
    playerId: gm.playerId ?? gm.player?.id ?? null,
    survivorCount: Array.isArray(gm.survivors) ? gm.survivors.length : null,
    tribeCount: Array.isArray(gm.tribes) ? gm.tribes.length : null,
    journeyPresent: Boolean(gm.journey),
    flagsCount: gm.flags ? Object.keys(gm.flags).length : 0,
    socialMemoryNpcs: systemsState.socialMemorySystem?.memory
      ? Object.keys(systemsState.socialMemorySystem.memory).length
      : null,
    relationshipCount: systemsState.relationshipSystem?.relationships
      ? Object.keys(systemsState.relationshipSystem.relationships).length
      : null,
    allianceCount: Array.isArray(systemsState.allianceSystem?.alliances)
      ? systemsState.allianceSystem.alliances.length
      : null,
    dealCount: systemsState.dealSystem?.dealsById
      ? Object.keys(systemsState.dealSystem.dealsById).length
      : null,
    challengeResultCount: Array.isArray(systemsState.challengeManager?.challengeResults)
      ? systemsState.challengeManager.challengeResults.length
      : null
  };
}

function diffCriticalSaveFields(before, after) {
  const diffs = [];
  const keys = Array.from(new Set([...Object.keys(before || {}), ...Object.keys(after || {})]));
  keys.forEach((key) => {
    if (before?.[key] !== after?.[key]) {
      diffs.push({ key, before: before?.[key], after: after?.[key] });
    }
  });
  return diffs;
}

window.SaveDebug = {
  snapshot() {
    const payload = gameManager.createSavePayload();
    console.info('[SaveDebug] snapshot', payload);
    return payload;
  },

  inspect() {
    const payload = gameManager.createSavePayload();
    const summary = getCriticalSaveFields(payload);
    console.table(summary);
    return summary;
  },

  roundTrip() {
    const beforePayload = gameManager.createSavePayload();
    const beforeSummary = getCriticalSaveFields(beforePayload);
    const parsed = JSON.parse(JSON.stringify(beforePayload));
    const restored = gameManager.restoreSavePayload(parsed);
    const afterPayload = gameManager.createSavePayload();
    const afterSummary = getCriticalSaveFields(afterPayload);
    const diffs = diffCriticalSaveFields(beforeSummary, afterSummary);
    const report = {
      ok: restored && diffs.length === 0,
      restored,
      diffs,
      before: beforeSummary,
      after: afterSummary
    };
    console.info('[SaveDebug] roundTrip', report);
    return report;
  }
};
