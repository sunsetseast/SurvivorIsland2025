/**
 * @module WelcomeScreen
 * Welcome screen for the game
 */

import { getElement, createElement, clearChildren } from '../utils/index.js';
import { gameManager, eventManager } from '../core/index.js';
import { GameEvents } from '../core/EventManager.js';

export class WelcomeScreen {
  initialize() {
    console.log('WelcomeScreen initialized');
  }

  setup(data = {}) {
    console.log('WelcomeScreen.setup() is running');
    const welcomeScreen = getElement('welcome-screen');
    if (!welcomeScreen) {
      console.error('Welcome screen element not found');
      return;
    }

    clearChildren(welcomeScreen);

    // Logo
    const logoImage = createElement('img', {
      src: 'Assets/logo.png',
      id: 'logo',
      alt: 'Survivor Island Logo',
      style: {
        width: '90%',
        maxWidth: '500px',
        margin: '1rem auto',
        display: 'block'
      }
    });
    welcomeScreen.appendChild(logoImage);

    // Main menu buttons
    const menuContainer = createElement('div', {
      className: 'menu-container'
    });

    const newGameButton = createElement('div', {
      className: 'rect-button',
      onclick: () => {
        const tribePopup = getElement('tribe-popup');
        tribePopup.style.display = 'flex';
      }
    }, 'New Game');

    const loadGameButton = createElement('div', {
      id: 'load-game-button',
      className: 'rect-button',
      onclick: () => {
        console.log('Load Game button clicked');
      }
    }, 'Load Game');

    const infoButton = createElement('div', {
      id: 'info-button',
      className: 'rect-button',
      onclick: () => {
        const infoDialog = getElement('info-dialog');
        if (infoDialog) {
          infoDialog.style.display = 'block';
        } else {
          console.warn('Info dialog not found');
        }
      }
    }, 'Game Info');

    menuContainer.appendChild(newGameButton);
    menuContainer.appendChild(loadGameButton);
    menuContainer.appendChild(infoButton);

    // Tribe popup
    const tribePopup = createElement('div', {
      id: 'tribe-popup',
      style: {
        display: 'none',
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: '1rem',
        zIndex: 999
      }
    });

    const tribeModeTitle = createElement('h2', {
      style: { color: '#fff', marginBottom: '1rem' }
    }, 'Select Tribe Mode');

    const twoTribeButton = createElement('button', {
      className: 'rect-button',
      onclick: () => {
        gameManager.startNewGame({ tribeCount: 2 });
        tribePopup.style.display = 'none';
      }
    }, '2 Tribes');

    const threeTribeButton = createElement('button', {
      className: 'rect-button',
      onclick: () => {
        gameManager.startNewGame({ tribeCount: 3 });
        tribePopup.style.display = 'none';
      }
    }, '3 Tribes');

    const closePopupButton = createElement('button', {
      className: 'rect-button small',
      onclick: () => {
        tribePopup.style.display = 'none';
      }
    }, 'Cancel');

    tribePopup.appendChild(tribeModeTitle);
    tribePopup.appendChild(twoTribeButton);
    tribePopup.appendChild(threeTribeButton);
    tribePopup.appendChild(closePopupButton);

    const versionInfo = createElement('div', {
      className: 'version-info',
      style: {
        position: 'absolute',
        bottom: '1rem',
        right: '1rem',
        fontSize: '0.8rem',
        color: '#aaa'
      }
    }, 'v1.0.0');

    welcomeScreen.appendChild(menuContainer);
    welcomeScreen.appendChild(tribePopup);
    welcomeScreen.appendChild(versionInfo);

    eventManager.publish(GameEvents.SCREEN_CHANGED, { screenId: 'welcome', data });
  }

  teardown() {
    console.log('WelcomeScreen teardown');

    const welcomeScreen = getElement('welcome-screen');
    if (welcomeScreen) {
      clearChildren(welcomeScreen);
    }

    // Optional: reset background if needed
    const gameContainer = getElement('game-container');
    if (gameContainer) {
      gameContainer.style.backgroundImage = '';
      gameContainer.style.backgroundSize = '';
      gameContainer.style.backgroundPosition = '';
      gameContainer.style.backgroundRepeat = '';
    }

    // Remove lingering UI from other screens if any (like button-row, filter-options)
    const buttonRow = document.querySelector('.button-row');
    if (buttonRow) buttonRow.remove();

    const filterOptions = getElement('filter-options');
    if (filterOptions) filterOptions.remove();
  }
}