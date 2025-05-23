/**
 * Main entry point for the Survivor Island game
 * Initializes game systems and starts the game
 */

import { gameManager, screenManager, eventManager, GameEvents } from './modules/core/index.js';
import {
  WelcomeScreen,
  CharacterSelectionScreen,
  TribeDivisionScreen,
  CampScreen
} from './modules/screens/index.js';
import * as systems from './modules/systems/index.js';
import timerManager from './modules/utils/TimerManager.js';

window.mainJsLoaded = true;

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

  // Register screens with screen manager (as class instances)
  screenManager.registerScreen('welcome', new WelcomeScreen());
  screenManager.registerScreen('character-selection', new CharacterSelectionScreen());
  screenManager.registerScreen('tribe-division', new TribeDivisionScreen());

  const campScreenInstance = new CampScreen();
  screenManager.registerScreen('camp', campScreenInstance);
  window.campScreen = campScreenInstance;

  screenManager.initialize();

  // Show the welcome screen
  console.log('Trying to show welcome screen...');
  screenManager.showScreen('welcome');

  // Register systems with game manager
  gameManager.registerSystem('dialogueSystem', new systems.DialogueSystem(gameManager));
  gameManager.registerSystem('energySystem', new systems.EnergySystem(gameManager));
  gameManager.registerSystem('idolSystem', new systems.IdolSystem(gameManager));
  gameManager.registerSystem('relationshipSystem', new systems.RelationshipSystem(gameManager));
  gameManager.registerSystem('allianceSystem', new systems.AllianceSystem(gameManager));

  // Subscribe to events
  eventManager.subscribe(GameEvents.GAME_INITIALIZED, handleGameInitialized);
  eventManager.subscribe(GameEvents.GAME_STARTED, handleGameStarted);

  // Initialize game manager
  gameManager.initialize();

  // Check for saved game
  if (gameManager.hasSavedGame()) {
    const continueButton = document.getElementById('continue-game-button');
    if (continueButton) {
      continueButton.style.display = 'block';
    }
  }

  // Setup UI event listeners
  setupEventListeners();

  console.log('Initialization complete');
}

/**
 * Handle game initialized event
 */
function handleGameInitialized(data) {
  console.log('Game initialized');
}

/**
 * Handle game started event
 */
function handleGameStarted(data) {
  console.log('Game started with settings:', data.settings);
}

/**
 * Setup event listeners for UI elements
 */
function setupEventListeners() {
  const newGameButton = document.getElementById('new-game-button');
  if (newGameButton) {
    newGameButton.addEventListener('click', () => gameManager.startNewGame());
  }

  const continueButton = document.getElementById('continue-game-button');
  if (continueButton) {
    continueButton.addEventListener('click', () => gameManager.loadGame());
  }

  const settingsButton = document.getElementById('settings-button');
  if (settingsButton) {
    settingsButton.addEventListener('click', () => {
      const settingsDialog = document.getElementById('settings-dialog');
      if (settingsDialog) settingsDialog.style.display = 'block';
    });
  }

  const infoButton = document.getElementById('info-button');
  if (infoButton) {
    infoButton.addEventListener('click', () => {
      const infoDialog = document.getElementById('info-dialog');
      if (infoDialog) infoDialog.style.display = 'block';
    });
  }

  const closeButtons = document.querySelectorAll('.dialog-close');
  closeButtons.forEach(button => {
    button.addEventListener('click', () => {
      const dialog = button.closest('.dialog');
      if (dialog) dialog.style.display = 'none';
    });
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      const dialogs = document.querySelectorAll('.dialog');
      dialogs.forEach(dialog => dialog.style.display = 'none');
    }
  });
}

/**
 * Cleanup resources on page unload
 */
function cleanup() {
  if (gameManager.isInitialized && gameManager.getGameState() !== 'welcome') {
    gameManager.saveGame();
  }

  timerManager.clearAll();
  console.log('Game cleanup complete');
}

// Initialize game when DOM is loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// Cleanup when page is unloaded
window.addEventListener('beforeunload', cleanup);

// Expose game manager to global scope for debugging
window.gameManager = gameManager;

// Export for module usage
export { gameManager, screenManager, eventManager };