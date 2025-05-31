import { getElement, clearChildren } from '../utils/index.js';
import renderTribeFlag from '../views/TribeFlagView.js';
import renderGatherFirewood from './camp/GatherFirewood.js'; // Test import

const campViews = {
  flag: renderTribeFlag,
  firewood: renderGatherFirewood // Minimal test
};

export default class CampScreen {
  initialize() {
    console.log('CampScreen initialized');
  }

  setup(data = {}) {
    const container = getElement('camp-screen');
    container.style.display = 'block';
    this.loadView('flag');
  }

  teardown() {
    console.log('CampScreen teardown');
  }

  loadView(viewName) {
    const viewContainer = getElement('camp-content');
    clearChildren(viewContainer);
    const renderFn = campViews[viewName];
    if (renderFn) {
      renderFn(viewContainer);
    }
  }
}