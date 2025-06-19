
import { createElement, clearChildren } from '../utils/DOMUtils.js';
import gameManager from '../core/GameManager.js';
import screenManager from '../core/ScreenManager.js';
import TribeChallengeView from '../views/TribeChallengeView.js';

export default class ChallengeScreen {
  constructor() {
    this.container = null;
    this.currentView = null;
  }

  setup() {
    console.log('ChallengeScreen setup');
    this.container = document.getElementById('challenge-screen');

    if (!this.container) {
      console.error('Challenge screen container not found');
      return;
    }

    clearChildren(this.container);

    // Load the tribal challenge view
    this.loadView('tribal-challenge');
  }

  loadView(viewName) {
    if (!this.container) return;

    clearChildren(this.container);

    switch (viewName) {
      case 'tribal-challenge':
        TribeChallengeView.render(this.container);
        break;
      default:
        console.warn(`Unknown challenge view: ${viewName}`);
    }

    this.currentView = viewName;
  }

  teardown() {
    console.log('ChallengeScreen teardown');
    if (this.container) {
      clearChildren(this.container);
    }
    this.currentView = null;
  }

  destroy() {
    if (this.container) {
      clearChildren(this.container);
    }
    this.currentView = null;
  }
}
