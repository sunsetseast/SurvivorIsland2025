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
import { timerManager } from '../utils/index.js';
import { gameManager } from '../core/index.js';
import renderGatherFirewoodView from './camp/GatherFirewood.js';


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
  fork3: renderFork3,
  gatherFirewood: renderGatherFirewoodView // 👈 add this line
};

export default class CampScreen {
  initialize() {
    console.log('CampScreen initialized');
  }

  setup(data = {}) {
    const container = getElement('camp-screen');
    container.style.display = 'block';
    this.loadView('flag');

    this.renderClockUI();
  }

  teardown() {
    console.log('CampScreen teardown');
    const clock = document.getElementById('camp-clock');
    if (clock) clock.remove();
  }

  loadView(viewName) {
    const viewContainer = getElement('camp-content');
    clearChildren(viewContainer);

    window.previousCampView = this.currentView || null;
    this.currentView = viewName;

    const renderFn = campViews[viewName];
    if (renderFn) {
      renderFn(viewContainer);
      refreshMenuCard();
    }
  }

  renderClockUI() {
    const existing = document.getElementById('camp-clock');
    if (existing) return;

    const clockWrapper = document.createElement('div');
    clockWrapper.id = 'camp-clock';
    clockWrapper.style.position = 'absolute';
    clockWrapper.style.top = '0px';
    clockWrapper.style.left = '50%';
    clockWrapper.style.transform = 'translateX(-50%)';
    clockWrapper.style.width = '180px';
    clockWrapper.style.height = '90px';
    clockWrapper.style.backgroundImage = "url('Assets/clock.png')";
    clockWrapper.style.backgroundSize = 'contain';
    clockWrapper.style.backgroundRepeat = 'no-repeat';
    clockWrapper.style.backgroundPosition = 'center';
    clockWrapper.style.zIndex = '1000';
    clockWrapper.style.position = 'absolute';

    // Time text
    const timeText = document.createElement('div');
    timeText.id = 'clock-time-text';
    timeText.style.position = 'absolute';
    timeText.style.top = '27%';
    timeText.style.left = '50%';
    timeText.style.transform = 'translateX(-50%)';
    timeText.style.fontFamily = 'Survivant, sans-serif';
    timeText.style.fontSize = '24px';
    timeText.style.color = '#2b190a';
    timeText.style.fontWeight = 'bold';
    timeText.innerText = '02:00:00';

    // Day text
    const dayText = document.createElement('div');
    dayText.id = 'clock-day-text';
    dayText.style.position = 'absolute';
    dayText.style.bottom = '3%';
    dayText.style.left = '50%';
    dayText.style.transform = 'translateX(-50%)';
    dayText.style.fontFamily = 'Survivant, sans-serif';
    dayText.style.fontSize = '21px';
    dayText.style.color = '#ffffff';
    dayText.innerText = `Day ${gameManager.getDay()}`;

    clockWrapper.appendChild(timeText);
    clockWrapper.appendChild(dayText);

    const container = getElement('camp-screen');
    container.appendChild(clockWrapper);

    // Start live update
    timerManager.setInterval('campClockTick', () => {
      gameManager.decreaseDayTimer();

      const total = Math.max(0, Math.floor(gameManager.getDayTimer()));
      const hours = Math.floor(total / 3600);
      const minutes = Math.floor((total % 3600) / 60);
      const seconds = total % 60;

      const displayTime =
        `${hours.toString().padStart(2, '0')}:` +
        `${minutes.toString().padStart(2, '0')}:` +
        `${seconds.toString().padStart(2, '0')}`;

      timeText.innerText = displayTime;
    }, 1000);
  }
}