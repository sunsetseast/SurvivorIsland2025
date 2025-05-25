import { getElement, clearChildren } from '../utils/index.js';
import renderTribeFlag from '../views/TribeFlagView.js';
import renderBeach from '../views/BeachView.js';
import renderRockyShore from '../views/RockyShoreView.js';
import renderCampfire from '../views/CampfireView.js';
import renderShelter from '../views/ShelterView.js';
import renderFork1 from '../views/Fork1View.js';
import renderMountainTrail from '../views/MountainTrailView.js';
import renderTreeMail from '../views/TreeMailView.js';
import renderWaterfallTrail from '../views/WaterfallTrailView.js';
import renderWaterWell from '../views/WaterWellView.js';
import renderJungleTrail from '../views/JungleTrailView.js';
import renderFork2 from '../views/Fork2View.js';
import renderFork3 from '../views/Fork3View.js';
import { refreshMenuCard } from '../utils/MenuUtils.js';

const campViews = {
  flag: renderTribeFlag,
  beach: renderBeach,
  rocky: renderRockyShore,
  campfire: renderCampfire,
  shelter: renderShelter,
  fork1: renderFork1,
  mountainTrail: renderMountainTrail,
  treemail: renderTreeMail,
  waterfallTrail: renderWaterfallTrail,
  waterWell: renderWaterWell,
  jungleTrail: renderJungleTrail,
  fork2: renderFork2,
  fork3: renderFork3
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

      // Track previous and current view globally
      window.previousCampView = this.currentView || null;
      this.currentView = viewName;

      const renderFn = campViews[viewName];
      if (renderFn) {
        renderFn(viewContainer);
        refreshMenuCard(); // <-- Update menu avatar and name
      }
    }
  }