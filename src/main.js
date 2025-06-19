/**
 * Main entry point for the Survivor Island game
 * Initializes game systems and starts the game
 */

import { gameManager, screenManager, eventManager, GameEvents } from './modules/core/index.js';
import {
  WelcomeScreen,
  CharacterSelectionScreen,
  TribeDivisionScreen,
  CampScreen,
  ChallengeScreen
} from './modules/screens/index.js';
import * as systems from './modules/systems/index.js';
import timerManager from './modules/utils/TimerManager.js';
import { openRelationshipsOverlay } from './modules/screens/camp/RelationshipsOverlay.js';

window.mainJsLoaded = true;
window.openRelationshipsOverlay = openRelationshipsOverlay; // ✅ Make it globally accessible

// Game constants
const GAME_TITLE = 'Survivor Island';
const GAME_VERSION = '1.0.0';

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
  console.log(`Initializing ${GAME_TITLE} v${GAME_VERSION}`);

  // Register screens
  screenManager.registerScreen('welcome', new WelcomeScreen());
  screenManager.registerScreen('character-selection', new CharacterSelectionScreen());
  screenManager.registerScreen('tribe-division', new TribeDivisionScreen());

  const campScreenInstance = new CampScreen();
  screenManager.registerScreen('camp', campScreenInstance);
  window.campScreen = campScreenInstance;
  
  const challengeScreenInstance = new ChallengeScreen();
  screenManager.registerScreen('challenge-screen', challengeScreenInstance);

  screenManager.initialize();
  screenManager.showScreen('welcome');

  // Register systems
  gameManager.registerSystem('dialogueSystem', new systems.DialogueSystem(gameManager));
  gameManager.registerSystem('energySystem', new systems.EnergySystem(gameManager));
  gameManager.registerSystem('idolSystem', new systems.IdolSystem(gameManager));
  gameManager.registerSystem('relationshipSystem', new systems.RelationshipSystem(gameManager));
  gameManager.registerSystem('allianceSystem', new systems.AllianceSystem(gameManager));

  // Subscribe to game events
  eventManager.subscribe(GameEvents.GAME_INITIALIZED, handleGameInitialized);
  eventManager.subscribe(GameEvents.GAME_STARTED, handleGameStarted);

  // Initialize game
  gameManager.initialize();

  // Reveal "Continue Game" if save exists
  const continueButton = document.getElementById('continue-game-button');
  if (gameManager.hasSavedGame() && continueButton) {
    continueButton.style.display = 'block';
  }

  // Set up UI
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
  const player = gameManager.getPlayerSurvivor();
  if (!player) return;

  // Update individual fish types
  const fish1Element = document.getElementById('value-fish1');
  const fish2Element = document.getElementById('value-fish2');
  const fish3Element = document.getElementById('value-fish3');
  const coconutElement = document.getElementById('value-coconut');
  const firewoodElement = document.getElementById('value-firewood');
  const waterElement = document.getElementById('value-water');
  const bambooElement = document.getElementById('value-bamboo');
  const palmsElement = document.getElementById('value-palms');

  if (fish1Element) fish1Element.textContent = player.fish1 || 0;
  if (fish2Element) fish2Element.textContent = player.fish2 || 0;
  if (fish3Element) fish3Element.textContent = player.fish3 || 0;
  if (coconutElement) coconutElement.textContent = player.coconuts || 0;
  if (firewoodElement) firewoodElement.textContent = player.firewood || 0;
  if (waterElement) waterElement.textContent = player.water || 0;
  if (bambooElement) bambooElement.textContent = player.bamboo || 0;
  if (palmsElement) palmsElement.textContent = player.palms || 0;
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

    // 🔁 Update all menu values when the menu is shown
    if (!isVisible) {
      updateInventoryUI();
      // Also refresh character stats (hunger, rest, threat, etc.)
      if (window.refreshMenuCard && typeof window.refreshMenuCard === 'function') {
        window.refreshMenuCard();
      }
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