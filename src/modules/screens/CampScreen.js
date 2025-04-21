/**
 * @module CampScreen
 * Manages the camp phase screen in the game
 */

import { getElement, clearChildren, createElement } from '../utils/index.js';
import { eventManager } from '../core/index.js';
import { GameEvents } from '../core/EventManager.js';

class CampScreen {
  initialize() {
    console.log('CampScreen initialized');
  }

  setup(data = {}) {
    console.log('CampScreen setup running...');
    const screen = getElement('camp-screen');
    if (!screen) {
      console.error('Camp screen element not found!');
      return;
    }

    clearChildren(screen);
    screen.classList.add('active');

    // Placeholder content — you can replace with your dynamic content later
    const header = createElement('h2', {}, 'Camp Phase');
    const message = createElement('p', {}, 'Welcome to camp!');
    screen.appendChild(header);
    screen.appendChild(message);

    eventManager.publish(GameEvents.SCREEN_CHANGED, {
      screenId: 'camp',
      data
    });
  }

  teardown() {
    const screen = getElement('camp-screen');
    if (screen) screen.classList.remove('active');
    console.log('CampScreen torn down');
  }
}

export default new CampScreen();