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
import { GamePhase } from '../core/GameManager.js';
import renderFirewoodView from '../views/FirewoodView.js';
import renderBambooView from '../views/BambooView.js';
import renderShakeView from '../views/ShakeView.js';
import renderFishingView from '../views/FishingView.js';
import renderFireView from '../views/FireView.js';
import renderSummary from '../views/SummaryView.js';
import renderPostChallengeSummaryView from '../views/PostChallengeSummaryView.js';
import { updateCampClockUI } from '../utils/ClockUtils.js';
import eventManager, { GameEvents } from '../core/EventManager.js';
import npcAutoRenderer from '../ui/NpcAutoRenderer.js';
import { runDay1FirstImpressions, canRunDay1FirstImpressions } from '../events/Day1FirstImpressionsEvent.js';

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
  summary: renderSummary,
  strategySummary: renderPostChallengeSummaryView
};

export default class CampScreen {
  constructor() {
    this.currentView = null;
    window.campScreen = this;
    this.day1EventRunning = false;
    this.campEventActive = false;
    this.clockTicking = false;
    gameManager.flags = gameManager.flags || {};
    gameManager.flags.campEventActive = false;

    eventManager.subscribe(GameEvents.CAMP_EVENT_STARTED, ({ eventId }) => {
      console.info('[CampScreen] Camp event started', eventId);
      this.campEventActive = true;
      gameManager.flags.campEventActive = true;
      timerManager.clearInterval('campClockTick');
      this.clockTicking = false;

      const campContent = getElement('camp-content');
      campContent?.querySelectorAll('.npc-icon-container')?.forEach(el => el.remove());
    });

    eventManager.subscribe(GameEvents.CAMP_EVENT_FINISHED, ({ eventId }) => {
      console.info('[CampScreen] Camp event finished', eventId);
      this.campEventActive = false;
      gameManager.flags.campEventActive = false;
      this.ensureClockUI();
      this.startCampClockTick();
    });
  }

  initialize() {
    console.log('CampScreen initialized');
  }

  async _startCampClockAfterDay1() {
    // clock should already be visible, but be defensive:
    this.ensureClockUI();

    const gate = canRunDay1FirstImpressions(gameManager);
    if (gate.ok) {
      const resultPromise = this._maybeRunDay1Event();
      resultPromise?.then?.(result => {
        if (!result || result?.skipped || result?.error) {
          this.ensureClockUI();
          this.startCampClockTick();
        }
      })?.catch?.(error => {
        console.error('[CampScreen] Day 1 promise rejected', error);
        this.ensureClockUI();
        this.startCampClockTick();
      });
    } else {
      this.startCampClockTick();
    }
  }

  async _maybeRunDay1Event() {
    const playerTribe = gameManager.getPlayerTribe();
    if (!playerTribe) return;
    gameManager.flags = gameManager.flags || {};
    const tribeSize = playerTribe?.members?.length || 0;
    const gate = canRunDay1FirstImpressions(gameManager);
    console.info('[CampScreen] Day 1 trigger check', {
      invoking: typeof runDay1FirstImpressions,
      phase: gameManager.gamePhase,
      day: gameManager.day,
      tribeSize,
      gate
    });

    if (!gate.ok) {
      console.info('[CampScreen] Day 1 event not triggered', gate);
      return { skipped: true, reason: gate.reason };
    }

    if (this.day1EventRunning) return;
    this.day1EventRunning = true;
    const container = getElement('camp-screen');
    let result;
    try {
      if (container) container.style.pointerEvents = 'none';
      console.info('[CampScreen] Invoking runDay1FirstImpressions');
      result = await runDay1FirstImpressions({ gameManager, campScreen: this });
      if (!result?.skipped) {
        gameManager.flags.day1FirstImpressionsCompleted = true;
        gameManager.flags.day1FirstImpressionsDone = true;
      }
      if (container) container.style.pointerEvents = '';
      gameManager.saveGame?.();
    } catch (error) {
      console.error('[CampScreen] Day 1 event failed', error);
      gameManager.flags.day1FirstImpressionsCompleted = false;
      gameManager.flags.day1FirstImpressionsDone = false;
      eventManager.publish(GameEvents.CAMP_EVENT_FINISHED, { eventId: 'day1_first_impressions', error: true });
      result = { error: true };
    } finally {
      if (container) container.style.pointerEvents = '';
      this.day1EventRunning = false;
    }

    return result;
  }

  setup(data = {}) {
    const container = getElement('camp-screen');
    container.style.display = 'block';
    this.loadView('flag');
    this.ensureClockUI();
    this._startCampClockAfterDay1();
  }

  teardown() {
    console.log('CampScreen teardown');
    timerManager.clearInterval('campClockTick');
    this.clockTicking = false;
    const clock = document.getElementById('camp-clock');
    if (clock) clock.remove();
  }

  loadView(viewName) {
    const viewContainer = getElement('camp-content');

    // Always clear old view first
    clearChildren(viewContainer);

    // Track previous view
    window.previousCampView = this.currentView || null;
    this.currentView = viewName;

    // 🔥 1) Render the actual view
    const renderFn = campViews[viewName];
    if (renderFn) {
      renderFn(viewContainer);
    }

    if (!this.campEventActive) {
      // 🔥 2) Publish event AFTER rendering so subscribers know the DOM exists
      eventManager.publish(GameEvents.CAMP_VIEW_LOADED, {
        viewName
      });
      window.debugBanner('CAMP VIEW LOADED', viewName);

      // 🔥 3) Force NPC renderer AFTER DOM exists
      // (this is the critical step — without this, you see nothing)
      if (npcAutoRenderer && typeof npcAutoRenderer.renderFor === 'function') {
        npcAutoRenderer.renderFor(viewName);
      }

      // 🔥 4) Update menu stats
      if (typeof refreshMenuCard === 'function') {
        refreshMenuCard();
      }
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

  updateInventoryDisplay() {
    const menuCard = document.getElementById('menu-card');
    if (menuCard && menuCard.style.display === 'block') {
      const player = gameManager.getPlayerSurvivor();
      if (player) {
        // Update all player stats in the inventory
        const waterValue = document.getElementById('value-water');
        const hungerValue = document.getElementById('value-hunger');
        const restValue = document.getElementById('value-rest');
        const healthValue = document.getElementById('value-health');
        
        if (waterValue) waterValue.textContent = player.water || 0;
        if (hungerValue) hungerValue.textContent = player.hunger || 0;
        if (restValue) restValue.textContent = player.rest || 0;
        if (healthValue) healthValue.textContent = player.health || 0;
      }
    }
  }

  ensureClockUI() {
    const existing = document.getElementById('camp-clock');
    if (existing) return existing;

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

    const dayText = document.createElement('div');
    dayText.id = 'clock-day-text';
    dayText.style.position = 'absolute';
    dayText.style.bottom = '3%';
    dayText.style.left = '50%';
    dayText.style.transform = 'translateX(-50%)';
    dayText.style.fontFamily = 'Survivant, sans-serif';
    dayText.style.fontSize = '21px';
    dayText.style.color = '#ffffff';

    clockWrapper.appendChild(timeText);
    clockWrapper.appendChild(dayText);

    const container = getElement('camp-screen');
    container.appendChild(clockWrapper);

    updateCampClockUI(gameManager.getDayTimer(), gameManager.getDay());
    return clockWrapper;
  }

  startCampClockTick() {
    if (this.campEventActive || this.clockTicking) return;

    timerManager.clearInterval('campClockTick');
    this.clockTicking = true;
    this.ensureClockUI();

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
        this.clockTicking = false;
        if (gameManager.gamePhase === GamePhase.POST_CHALLENGE) {
          const strat = gameManager?.systems?.strategyPhaseSystem;
          if (strat?.handleTimerExpired) {
            strat.handleTimerExpired();
          }
        } else {
          this.triggerTreeMailEvent();
        }
        return;
      }

      if (gameManager.gamePhase !== GamePhase.POST_CHALLENGE) {
        // Track if any stats changed to update health
        let statsChanged = false;

        // If at least 300 seconds (5 in-game minutes) have passed - water decrease
        if (lastWaterTick - currentTime >= 300) {
          lastWaterTick = currentTime;
          gameManager.decreaseWaterForAll(1);
          statsChanged = true;
          console.log('Water decreased for all survivors (5 in-game minutes passed)');
        }

        // If at least 360 seconds (6 in-game minutes) have passed - hunger decrease
        if (lastHungerTick - currentTime >= 360) {
          lastHungerTick = currentTime;
          gameManager.decreaseHungerForAll(1);
          statsChanged = true;
          console.log('Hunger decreased for all survivors (6 in-game minutes passed)');
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
          statsChanged = true;
          console.log(`Rest decreased for all survivors (${restInterval} seconds passed, shelter level ${currentShelterLevel})`);
        }

        // Update health calculations for all survivors if any stats changed
        if (statsChanged) {
          gameManager.updateHealthForAll();
        }

        // Update UI display if inventory is open
        this.updateInventoryDisplay();
      }
    }, 1000);
  }

  renderClockUI() {
    return this.ensureClockUI();
  }
}
