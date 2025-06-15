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
import renderFirewoodView from '../views/FirewoodView.js';
import renderBambooView from '../views/BambooView.js';
import renderShakeView from '../views/ShakeView.js';
import renderFishingView from '../views/FishingView.js';
import renderFireView from '../views/FireView.js';
import renderSummary from '../views/SummaryView.js';
import { updateCampClockUI } from '../utils/ClockUtils.js';

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
  firewood: renderFirewoodView,
  bamboo: renderBambooView,
  shake: renderShakeView,
  fishing: renderFishingView,
  fire: renderFireView,
  summary: renderSummary
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

  triggerTreeMailEvent() {
    console.log('Time ran out - triggering Tree Mail event');

    // Create the tree mail icon overlay
    const treeMailOverlay = document.createElement('div');
    treeMailOverlay.id = 'tree-mail-overlay';
    treeMailOverlay.style.position = 'fixed';
    treeMailOverlay.style.top = '0';
    treeMailOverlay.style.left = '0';
    treeMailOverlay.style.width = '100%';
    treeMailOverlay.style.height = '100%';
    treeMailOverlay.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
    treeMailOverlay.style.display = 'flex';
    treeMailOverlay.style.alignItems = 'center';
    treeMailOverlay.style.justifyContent = 'center';
    treeMailOverlay.style.zIndex = '2000';
    treeMailOverlay.style.opacity = '0';
    treeMailOverlay.style.transition = 'opacity 0.5s ease';

    // Create the large tree mail icon
    const treeMailIcon = document.createElement('img');
    treeMailIcon.src = 'Assets/Resources/treeMail.png';
    treeMailIcon.alt = 'Tree Mail';
    treeMailIcon.style.width = '200px';
    treeMailIcon.style.height = '200px';
    treeMailIcon.style.objectFit = 'contain';
    treeMailIcon.style.animation = 'pulse 1s ease-in-out infinite';

    treeMailOverlay.appendChild(treeMailIcon);
    document.body.appendChild(treeMailOverlay);

    // Fade in the overlay
    setTimeout(() => {
      treeMailOverlay.style.opacity = '1';
    }, 100);

    // After 2 seconds, animate to top-left position
    setTimeout(() => {
      this.animateTreeMailToPosition(treeMailOverlay, treeMailIcon);
    }, 2000);
  }

  animateTreeMailToPosition(overlay, icon) {
    // Change overlay to not block clicks
    overlay.style.backgroundColor = 'transparent';
    overlay.style.alignItems = 'flex-start';
    overlay.style.justifyContent = 'flex-start';
    overlay.style.padding = '20px';

    // Animate icon to smaller size and position
    icon.style.width = '60px';
    icon.style.height = '60px';
    icon.style.animation = 'none';
    icon.style.cursor = 'pointer';
    icon.style.transition = 'all 0.5s ease';
    icon.style.filter = 'drop-shadow(2px 2px 4px rgba(0,0,0,0.5))';

    // Add click handler to navigate to tree mail
    icon.addEventListener('click', () => {
      console.log('Tree Mail icon clicked - loading TreeMail view');
      overlay.remove();
      this.loadView('treemail');
    });

    // Add hover effect
    icon.addEventListener('mouseenter', () => {
      icon.style.transform = 'scale(1.1)';
    });

    icon.addEventListener('mouseleave', () => {
      icon.style.transform = 'scale(1)';
    });
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

    // 🕒 Track last time water, hunger, and rest were decreased
    let lastWaterTick = gameManager.getDayTimer();
    let lastHungerTick = gameManager.getDayTimer();
    let lastRestTick = gameManager.getDayTimer();
    let lastShelterLevel = gameManager.getPlayerTribe()?.shelter || 0;

    timerManager.setInterval('campClockTick', () => {
      gameManager.decreaseDayTimer();
      const currentTime = gameManager.getDayTimer();
      updateCampClockUI(currentTime, gameManager.getDay());

      // Check if time has run out
      if (currentTime <= 0) {
        timerManager.clearInterval('campClockTick');
        this.triggerTreeMailEvent();
        return;
      }

      // If at least 300 seconds (5 in-game minutes) have passed - water decrease
      if (lastWaterTick - currentTime >= 300) {
        lastWaterTick = currentTime;
        gameManager.decreaseWaterForAll(1);

        // Update water display if inventory is open
        const menuCard = document.getElementById('menu-card');
        if (menuCard && menuCard.style.display === 'block') {
          const player = gameManager.getPlayerSurvivor();
          if (player) {
            const waterValue = document.getElementById('value-water');
            if (waterValue) {
              waterValue.textContent = player.water || 0;
            }
          }
        }
      }

      // If at least 360 seconds (6 in-game minutes) have passed - hunger decrease
      if (lastHungerTick - currentTime >= 360) {
        lastHungerTick = currentTime;
        gameManager.decreaseHungerForAll(1);
        console.log('Hunger decreased for all survivors (6 in-game minutes passed)');

        // Update hunger display if inventory is open
        const menuCard = document.getElementById('menu-card');
        if (menuCard && menuCard.style.display === 'block') {
          const player = gameManager.getPlayerSurvivor();
          if (player) {
            const hungerValue = document.getElementById('value-hunger');
            if (hungerValue) {
              hungerValue.textContent = player.hunger || 0;
            }
          }
        }
      }

      // Dynamic rest deduction based on shelter level
      // Level 0: 240 seconds (4 min), Level 5: 840 seconds (14 min)
      // Linear progression: 240 + (shelterLevel * 120)
      const playerTribe = gameManager.getPlayerTribe();
      const currentShelterLevel = playerTribe ? (playerTribe.shelter || 0) : 0;
      
      // Recalculate rest tick if shelter level changed
      if (currentShelterLevel !== lastShelterLevel) {
        lastRestTick = currentTime;
        lastShelterLevel = currentShelterLevel;
        console.log(`Shelter level changed to ${currentShelterLevel}, rest interval now ${240 + (currentShelterLevel * 120)} seconds`);
      }
      
      const restInterval = 240 + (currentShelterLevel * 120); // 120 seconds per shelter level
      
      // Only deduct if enough time has passed AND we haven't already deducted at this time
      if (lastRestTick - currentTime >= restInterval && lastRestTick !== currentTime) {
        lastRestTick = currentTime;
        gameManager.decreaseRestForAll(1);
        console.log(`Rest decreased for all survivors (${restInterval} seconds passed, shelter level ${currentShelterLevel})`);

        // Update rest and health display if inventory is open
        const menuCard = document.getElementById('menu-card');
        if (menuCard && menuCard.style.display === 'block') {
          const player = gameManager.getPlayerSurvivor();
          if (player) {
            const restValue = document.getElementById('value-rest');
            const healthValue = document.getElementById('value-health');
            if (restValue) {
              restValue.textContent = player.rest || 0;
            }
            if (healthValue) {
              healthValue.textContent = player.health || 0;
            }
          }
        }
      }
    }, 1000);
  }
}