/**
 * Main entry point for the Survivor Island game
 * Initializes game systems and starts the game
 */

try {
  const { gameManager, screenManager, eventManager, GameEvents } = await import('./modules/core/index.js');
  const {
    WelcomeScreen,
    CharacterSelectionScreen,
    TribeDivisionScreen,
    CampScreen
  } = await import('./modules/screens/index.js');
  const systems = await import('./modules/systems/index.js');
  const timerManagerModule = await import('./modules/utils/TimerManager.js');
  const timerManager = timerManagerModule.default;
  const { openRelationshipsOverlay } = await import('./modules/screens/camp/RelationshipsOverlay.js');

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
async function init() {
  console.log(`Initializing ${GAME_TITLE} v${GAME_VERSION}`);

  // Register screens
  screenManager.registerScreen('welcome', new WelcomeScreen());
  screenManager.registerScreen('character-selection', new CharacterSelectionScreen());
  screenManager.registerScreen('tribe-division', new TribeDivisionScreen());

  const campScreenInstance = new CampScreen();
  screenManager.registerScreen('camp', campScreenInstance);
  window.campScreen = campScreenInstance;

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

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

} catch (error) {
  console.error('Critical error loading main.js:', error);
  const errorBanner = document.createElement('div');
  errorBanner.textContent = `IMPORT ERROR: ${error.message}`;
  errorBanner.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    background-color: darkred;
    color: white;
    padding: 10px;
    font-weight: bold;
    text-align: center;
    z-index: 9999;
  `;
  document.body.appendChild(errorBanner);
}

window.addEventListener('beforeunload', cleanup);
window.gameManager = gameManager;