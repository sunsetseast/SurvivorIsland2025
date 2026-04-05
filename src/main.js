/**
 * Main entry point for the Survivor Island game
 * Initializes game systems and starts the game
 */

import { gameManager } from './modules/core/GameManager.js';
import { screenManager, eventManager, GameEvents } from './modules/core/index.js';
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

// Banner to confirm main.js is running
const debugBanner = document.createElement('div');
debugBanner.textContent = 'main.js is running!';
debugBanner.style.position = 'fixed';
debugBanner.style.top = '0px';
debugBanner.style.marginBottom = '50px';
debugBanner.style.left = '0';
debugBanner.style.backgroundColor = 'red';
debugBanner.style.color = 'white';
debugBanner.style.padding = '5px 10px';
debugBanner.style.zIndex = '9999';
document.body.appendChild(debugBanner);

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
  console.log('Initialization complete');
}

function handleGameInitialized(data) {
  console.log('Game initialized');
}

function handleGameStarted(data) {
  console.log('Game started with settings:', data.settings);
}

function setupEventListeners() {
  const newGameButton = document.getElementById('new-game-button');
  const continueButton = document.getElementById('continue-game-button');
  const settingsButton = document.getElementById('settings-button');
  const infoButton = document.getElementById('info-button');
  const closeButtons = document.querySelectorAll('.dialog-close');

  if (newGameButton) {
    newGameButton.addEventListener('click', () => gameManager.startNewGame());
  }

  if (continueButton) {
    continueButton.addEventListener('click', () => gameManager.loadGame());
  }

  if (settingsButton) {
    settingsButton.addEventListener('click', () => {
      const dialog = document.getElementById('settings-dialog');
      if (dialog) dialog.style.display = 'block';
    });
  }

  if (infoButton) {
    infoButton.addEventListener('click', () => {
      const dialog = document.getElementById('info-dialog');
      if (dialog) dialog.style.display = 'block';
    });
  }

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
