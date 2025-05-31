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
import { openRelationshipsOverlay } from './modules/screens/camp/RelationshipsOverlay.js';

// Add error logging immediately
window.addEventListener('error', (e) => {
  console.error('Global error:', e.error, 'at', e.filename, 'line', e.lineno);
  console.error('Stack:', e.error?.stack);
});

window.addEventListener('unhandledrejection', (e) => {
  console.error('Unhandled promise rejection:', e.reason);
});

console.log('main.js: Starting execution...');

try {
  window.mainJsLoaded = true;
  window.openRelationshipsOverlay = openRelationshipsOverlay; // ✅ Make it globally accessible
  console.log('main.js: Basic setup complete');
} catch (error) {
  console.error('Error in main.js setup:', error);
}

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
  try {
    console.log(`Initializing ${GAME_TITLE} v${GAME_VERSION}`);

    // Register screens
    console.log('Registering screens...');
    screenManager.registerScreen('welcome', new WelcomeScreen());
    screenManager.registerScreen('character-selection', new CharacterSelectionScreen());
    screenManager.registerScreen('tribe-division', new TribeDivisionScreen());

    console.log('Creating camp screen...');
    const campScreenInstance = new CampScreen();
    screenManager.registerScreen('camp', campScreenInstance);
    window.campScreen = campScreenInstance;

  console.log('Initializing screen manager...');
    screenManager.initialize();
    screenManager.showScreen('welcome');

    // Register systems
    console.log('Registering systems...');
    gameManager.registerSystem('dialogueSystem', new systems.DialogueSystem(gameManager));
    gameManager.registerSystem('energySystem', new systems.EnergySystem(gameManager));
    gameManager.registerSystem('idolSystem', new systems.IdolSystem(gameManager));
    gameManager.registerSystem('relationshipSystem', new systems.RelationshipSystem(gameManager));
    gameManager.registerSystem('allianceSystem', new systems.AllianceSystem(gameManager));

    // Subscribe to game events
    console.log('Setting up event handlers...');
    eventManager.subscribe(GameEvents.GAME_INITIALIZED, handleGameInitialized);
    eventManager.subscribe(GameEvents.GAME_STARTED, handleGameStarted);

    // Initialize game
    console.log('Initializing game manager...');
    gameManager.initialize();

    // Reveal "Continue Game" if save exists
    const continueButton = document.getElementById('continue-game-button');
    if (gameManager.hasSavedGame() && continueButton) {
      continueButton.style.display = 'block';
    }

    // Set up UI
    console.log('Setting up UI...');
    setupEventListeners();
    setupMenuToggle();

    console.log('Initialization complete');
  } catch (error) {
    console.error('Error during initialization:', error);
    console.error('Stack trace:', error.stack);
    
    // Show error to user
    const errorDiv = document.createElement('div');
    errorDiv.style.cssText = `
      position: fixed; top: 50px; left: 50%; transform: translateX(-50%);
      background: red; color: white; padding: 20px; z-index: 10000;
      border-radius: 5px; font-family: monospace;
    `;
    errorDiv.textContent = `Initialization failed: ${error.message}`;
    document.body.appendChild(errorDiv);
  }
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

function setupMenuToggle() {
  const hamburger = document.getElementById('hamburger-icon');
  const menuCard = document.getElementById('menu-card');
  const overlay = document.getElementById('menu-overlay');

  if (!hamburger || !menuCard || !overlay) return;

  hamburger.addEventListener('click', () => {
    const isVisible = window.getComputedStyle(menuCard).display === 'block';

    menuCard.style.display = isVisible ? 'none' : 'block';
    overlay.style.display = isVisible ? 'none' : 'block';
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

try {
  if (document.readyState === 'loading') {
    console.log('DOM loading, waiting for DOMContentLoaded...');
    document.addEventListener('DOMContentLoaded', init);
  } else {
    console.log('DOM already loaded, initializing immediately...');
    init();
  }
} catch (error) {
  console.error('Error setting up DOM ready handler:', error);
}

window.addEventListener('beforeunload', cleanup);
window.gameManager = gameManager;