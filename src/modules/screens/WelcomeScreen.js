/**
 * @module WelcomeScreen
 * Welcome screen for the game
 */

import { getElement, createElement, clearChildren } from '../utils/index.js';
import { gameManager, eventManager } from '../core/index.js';
import { GameEvents } from '../core/EventManager.js';
import { screenManager } from '../core/index.js'; // Make sure this is imported if not already

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
        screenManager.showScreen('character-selection'); // Adjust this if your first screen differs
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
    welcomeScreen.appendChild(versionInfo);

    eventManager.publish(GameEvents.SCREEN_CHANGED, { screenId: 'welcome', data });
  }

  teardown() {
    console.log('WelcomeScreen teardown');

    const welcomeScreen = getElement('welcome-screen');
    if (welcomeScreen) {
      clearChildren(welcomeScreen);
    }

    const gameContainer = getElement('game-container');
    if (gameContainer) {
      gameContainer.style.backgroundImage = '';
      gameContainer.style.backgroundSize = '';
      gameContainer.style.backgroundPosition = '';
      gameContainer.style.backgroundRepeat = '';
    }

    const buttonRow = document.querySelector('.button-row');
    if (buttonRow) buttonRow.remove();

    const filterOptions = getElement('filter-options');
    if (filterOptions) filterOptions.remove();
  }
}