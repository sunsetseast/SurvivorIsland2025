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

    const titleContainer = createElement('div', { className: 'title-container', style: { textAlign: 'center', marginBottom: '2rem' } });

    const gameTitle = createElement('h1', { className: 'game-title', style: { fontSize: '3rem', color: '#fff', textShadow: '2px 2px 4px rgba(0, 0, 0, 0.5)', margin: '0.5rem 0' } }, 'Survivor Island');

    const gameSubtitle = createElement('p', { className: 'game-subtitle', style: { fontSize: '1.2rem', color: '#ddd', fontStyle: 'italic', margin: '0.5rem 0' } }, 'Outwit, Outplay, Outlast');

    titleContainer.appendChild(gameTitle);
    titleContainer.appendChild(gameSubtitle);

    const menuContainer = createElement('div', { className: 'menu-container', style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', marginTop: '2rem' } });

    const newGameButton = createElement('button', {
      id: 'new-game-button',
      className: 'primary-button',
      style: { padding: '0.8rem 2rem', fontSize: '1.2rem', backgroundColor: '#ff9800', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', transition: 'background-color 0.2s', width: '200px' },
      onmouseover: (e) => { e.target.style.backgroundColor = '#e68a00'; },
      onmouseout: (e) => { e.target.style.backgroundColor = '#ff9800'; },
      onclick: () => {
        const tribePopup = getElement('tribe-popup');
        tribePopup.style.display = 'flex';
      }
    }, 'New Game');

    const tribePopup = createElement('div', {
      id: 'tribe-popup',
      style: {
        display: 'none', position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0, 0, 0, 0.8)', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '1rem', zIndex: 999
      }
    });

    const tribeModeTitle = createElement('h2', { style: { color: '#fff', marginBottom: '1rem' } }, 'Select Tribe Mode');

    const twoTribeButton = createElement('button', {
      style: {
        padding: '1rem 2rem',
        fontSize: '1.2rem',
        backgroundColor: '#4caf50',
        color: '#fff',
        border: 'none',
        borderRadius: '4px',
        cursor: 'pointer',
        width: '200px'
      },
      onclick: () => {
        gameManager.startNewGame({ tribeCount: 2 });
        getElement('tribe-popup').style.display = 'none';
      }
    }, '2 Tribe Mode');

    const threeTribeButton = createElement('button', {
      style: {
        padding: '1rem 2rem',
        fontSize: '1.2rem',
        backgroundColor: '#2196f3',
        color: '#fff',
        border: 'none',
        borderRadius: '4px',
        cursor: 'pointer',
        width: '200px'
      },
      onclick: () => {
        gameManager.startNewGame({ tribeCount: 3 });
        getElement('tribe-popup').style.display = 'none';
      }
    }, '3 Tribe Mode');

    const closePopupButton = createElement('button', {
      style: { padding: '0.6rem 1.5rem', fontSize: '1rem', backgroundColor: '#f44336', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', width: '120px' },
      onclick: () => {
        tribePopup.style.display = 'none';
      }
    }, 'Cancel');

    tribePopup.appendChild(tribeModeTitle);
    tribePopup.appendChild(twoTribeButton);
    tribePopup.appendChild(threeTribeButton);
    tribePopup.appendChild(closePopupButton);

    const continueButton = createElement('button', {
      id: 'continue-game-button',
      className: 'secondary-button',
      style: {
        padding: '0.8rem 2rem', fontSize: '1.2rem', backgroundColor: '#4caf50', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', transition: 'background-color 0.2s', width: '200px', display: gameManager.hasSavedGame() ? 'block' : 'none'
      },
      onmouseover: (e) => { e.target.style.backgroundColor = '#43a047'; },
      onmouseout: (e) => { e.target.style.backgroundColor = '#4caf50'; },
      onclick: () => gameManager.loadGame()
    }, 'Continue');

    const settingsButton = createElement('button', {
      id: 'settings-button',
      className: 'tertiary-button',
      style: {
        padding: '0.8rem 2rem', fontSize: '1.2rem', backgroundColor: '#2196f3', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', transition: 'background-color 0.2s', width: '200px'
      },
      onmouseover: (e) => { e.target.style.backgroundColor = '#1e88e5'; },
      onmouseout: (e) => { e.target.style.backgroundColor = '#2196f3'; },
      onclick: () => {
        const settingsDialog = getElement('settings-dialog');
        if (settingsDialog) {
          settingsDialog.style.display = 'block';
        } else {
          console.warn('Settings dialog not found');
        }
      }
    }, 'Settings');

    const infoButton = createElement('button', {
      id: 'info-button',
      className: 'tertiary-button',
      style: {
        padding: '0.8rem 2rem', fontSize: '1.2rem', backgroundColor: '#9c27b0', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', transition: 'background-color 0.2s', width: '200px'
      },
      onmouseover: (e) => { e.target.style.backgroundColor = '#8e24aa'; },
      onmouseout: (e) => { e.target.style.backgroundColor = '#9c27b0'; },
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
    menuContainer.appendChild(continueButton);
    menuContainer.appendChild(settingsButton);
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

    welcomeScreen.appendChild(titleContainer);
    welcomeScreen.appendChild(menuContainer);
    welcomeScreen.appendChild(tribePopup);
    welcomeScreen.appendChild(versionInfo);

    eventManager.publish(GameEvents.SCREEN_CHANGED, { screenId: 'welcome', data });
  }

  teardown() {
    console.log('WelcomeScreen teardown');
  }
}
