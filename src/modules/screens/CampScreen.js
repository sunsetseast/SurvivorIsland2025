/**
 * @module CampScreen
 * Manages the camp phase screen in the game
 */

import { getElement, clearChildren, createElement } from '../utils/DOMUtils.js';
import eventManager, { GameEvents } from '../core/EventManager.js';

export const CampScreen = {
  initialize() {
    console.log('CampScreen initialized');
  },

  setup(data = {}) {
    console.log('CampScreen setup running...');
    const screen = getElement('camp-screen');
    if (!screen) {
      console.error('Camp screen element not found!');
      return;
    }

    // Basic example of clearing and showing the screen
    clearChildren(screen);
    screen.classList.add('active');
    screen.innerHTML = '<h2>Camp Phase</h2><p>Welcome to camp!</p>';

    eventManager.publish(GameEvents.SCREEN_CHANGED, {
      screenId: 'camp',
      data
    });
  },

  teardown() {
    const screen = getElement('camp-screen');
    if (screen) screen.classList.remove('active');
    console.log('CampScreen torn down');
  }
};