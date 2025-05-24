import { getElement, clearChildren } from '../utils/index.js';
import renderTribeFlag from '../views/TribeFlagView.js';
import renderBeach from '../views/BeachView.js';
import renderRockyShore from '../views/RockyShoreView.js';
import renderCampfire from '../views/CampfireView.js';
import renderShelter from '../views/ShelterView.js';
import renderForktw from '../views/ForktwView.js'; // Renamed to match file

const campViews = {
  flag: renderTribeFlag,
  beach: renderBeach,
  rocky: renderRockyShore,
  campfire: renderCampfire,
  shelter: renderShelter,
  forktw: renderForktw // Updated reference
};

export default class CampScreen {
  initialize() {
    console.log('CampScreen initialized');
  }

  setup(data = {}) {
    const container = getElement('camp-screen');
    container.style.display = 'block';
    this.loadView('flag'); // Start with Tribe Flag each round
  }

  teardown() {
    console.log('CampScreen teardown');
  }

  loadView(viewName) {
    const viewContainer = getElement('camp-content');
    clearChildren(viewContainer);
    const renderFn = campViews[viewName];
    if (renderFn) renderFn(viewContainer);
  }
}