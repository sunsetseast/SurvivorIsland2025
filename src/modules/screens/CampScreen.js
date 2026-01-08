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
import { runDay1FirstImpressions, canRunDay1FirstImpressions, runPart2FromCheckpointReport } from '../events/Day1FirstImpressionsEvent.js';

const CAMP_CLOCK_TIMER_ID = 'campClockTick';
const TASK_ICON_HIDDEN_VIEWS = new Set();

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
    this.clockRunning = false;
    this.isActive = false;
    this.unsubscribeFromCampEventStarted = null;
    this.unsubscribeFromCampEventEnded = null;
    gameManager.flags = gameManager.flags || {};
    gameManager.flags.campEventActive = false;
    this.taskOverlayOpen = false;

    this.unsubscribeFromCampEventStarted = eventManager.subscribe(GameEvents.CAMP_EVENT_STARTED, ({ eventId }) => {
      console.info('[CampScreen] Camp event started', eventId);
      gameManager.flags.campEventActive = true;
      this.stopCampClockTick();

      const campContent = getElement('camp-content');
      campContent?.querySelectorAll('.npc-icon-container')?.forEach(el => el.remove());
      this.closeTaskOverlay();
    });

    this.unsubscribeFromCampEventEnded = eventManager.subscribe(GameEvents.CAMP_EVENT_ENDED, ({ eventId }) => {
      console.info('[CampScreen] Camp event ended', eventId);
      gameManager.flags.campEventActive = false;
      this.ensureClockUI();

      if (this.isActive) {
        // Force the local clock state to resync after the cinematic "Continue" flow
        // ends. In some cases the interval may have been cleared without toggling
        // the CampScreen flag, leaving the guard in startCampClockTick() thinking
        // a timer is still running.
        this.clockRunning = false;
        this.startCampClockTick();
      }

      if (eventId === 'day1_first_impressions') {
        this.clockRunning = false;
        this.startDayClockTimer();
      }

      const survivors = gameManager.survivors;
      const phaseKey = gameManager.gamePhase === GamePhase.POST_CHALLENGE ? 'post' : 'pre';
      console.info('[CampScreen] Resuming camp systems after event');

      gameManager.systems?.npcLocationSystem?.assignLocationsForPhase?.(survivors);
      gameManager.systems?.socialEngine?.resetForNewPhase?.(phaseKey);

      eventManager.publish(GameEvents.CAMP_VIEW_LOADED, {
        viewName: this.currentView,
        container: getElement('camp-content')
      });
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
          this.startDayClockTimer();
        }
      })?.catch?.(error => {
        console.error('[CampScreen] Day 1 promise rejected', error);
        this.ensureClockUI();
        this.startCampClockTick();
        this.startDayClockTimer();
      });
    } else {
      this.startCampClockTick();
      this.startDayClockTimer();
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
      eventManager.publish(GameEvents.CAMP_EVENT_ENDED, { eventId: 'day1_first_impressions', id: 'day1_first_impressions', error: true });
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
    this.isActive = true;
    this.ensureTaskIcon();
    this.loadView('flag');
    this.renderClockUI();
    if (!gameManager.flags?.campEventActive) {
      this.startCampClockTick();
    }
    this._startCampClockAfterDay1();
  }

  teardown() {
    console.log('CampScreen teardown');
    this.isActive = false;
    this.stopCampClockTick();
    document.getElementById('task-icon')?.remove();
    document.getElementById('task-overlay')?.remove();
    this.taskOverlayOpen = false;
    const clock = document.getElementById('camp-clock');
    if (clock) clock.remove();
  }

  loadView(viewName) {
    const viewContainer = getElement('camp-content');

    this.ensureTaskIcon();
    this.closeTaskOverlay();
    this.setTaskIconVisible(true);

    // Always clear old view first
    if (window.__campViewCleanup) {
      try {
        window.__campViewCleanup();
      } catch (e) {}
      window.__campViewCleanup = null;
    }
    clearChildren(viewContainer);

    // Track previous view
    window.previousCampView = this.currentView || null;
    this.currentView = viewName;

    // 🔥 1) Render the actual view
    const renderFn = campViews[viewName];
    if (renderFn) {
      renderFn(viewContainer);
    }

    if (!gameManager.flags?.campEventActive) {
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

      // 🔥 5) Ensure the Day 1 cinematic still triggers when camp first loads
      if (
        viewName === 'flag' &&
        gameManager.day === 1 &&
        gameManager.gamePhase === GamePhase.PRE_CHALLENGE &&
        !gameManager.flags?.day1FirstImpressionsCompleted &&
        !gameManager.flags?.day1FirstImpressionsDone &&
        !this.day1EventRunning
      ) {
        this._startCampClockAfterDay1();
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

  ensureTaskIcon() {
    const container = getElement('camp-screen');
    if (!container) return;

    let icon = document.getElementById('task-icon');
    if (!icon) {
      icon = document.createElement('img');
      icon.id = 'task-icon';
      icon.src = 'Assets/task-icon.png';
      icon.alt = 'Tasks';
      icon.addEventListener('click', () => this.toggleTaskOverlay());
      container.appendChild(icon);
    }

    this.refreshTaskIconState();

    let overlay = document.getElementById('task-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'task-overlay';
      overlay.style.display = 'none';
      overlay.addEventListener('click', event => {
        if (event.target === overlay) {
          this.closeTaskOverlay();
        }
      });

      const panel = document.createElement('div');
      panel.id = 'task-panel';
      panel.addEventListener('click', event => event.stopPropagation());

      const linePositions = ['line1', 'line2', 'line3', 'line4'];
      linePositions.forEach(lineClass => {
        const line = document.createElement('div');
        line.className = `task-line ${lineClass}`;
        panel.appendChild(line);
      });

      const closeHit = document.createElement('div');
      closeHit.id = 'task-close-hit';
      closeHit.addEventListener('click', () => this.closeTaskOverlay());
      panel.appendChild(closeHit);

      overlay.appendChild(panel);
      container.appendChild(overlay);
    }

    return icon;
  }

  refreshTaskIconState() {
    const icon = document.getElementById('task-icon');
    if (!icon) return;
    const hasClaimable = gameManager.taskSystem?.hasClaimableTasksForPlayer?.(gameManager);
    if (hasClaimable) {
      icon.classList.add('task-icon-alert');
    } else {
      icon.classList.remove('task-icon-alert');
    }
  }

  setTaskIconVisible(isVisible) {
    const icon = document.getElementById('task-icon');
    if (icon) {
      icon.style.display = isVisible ? 'block' : 'none';
    }
    if (!isVisible) {
      this.closeTaskOverlay();
    }
  }

  toggleTaskOverlay() {
    if (this.taskOverlayOpen) {
      this.closeTaskOverlay();
    } else {
      this.openTaskOverlay();
    }
  }

  openTaskOverlay() {
    this.ensureTaskIcon();
    gameManager.taskSystem?.ingestCampLogForTribe?.(gameManager, gameManager.getPlayerTribe?.());
    const overlay = document.getElementById('task-overlay');
    if (!overlay) return;
    this.renderTasksIntoOverlay();
    overlay.style.display = 'flex';
    const panel = document.getElementById('task-panel');
    if (panel) {
      panel.classList.remove('task-panel-open');
      requestAnimationFrame(() => panel.classList.add('task-panel-open'));
    }
    this.taskOverlayOpen = true;
  }

  closeTaskOverlay() {
    const overlay = document.getElementById('task-overlay');
    if (!overlay) return;
    const panel = document.getElementById('task-panel');
    panel?.classList.remove('task-panel-open');
    setTimeout(() => {
      overlay.style.display = 'none';
    }, 150);
    this.taskOverlayOpen = false;
  }

  renderTasksIntoOverlay() {
    const panel = document.getElementById('task-panel');
    if (!panel) return;

    const taskData = gameManager.taskSystem?.getVisibleTasksForPlayer(gameManager) || { lines: [], tasksForUI: [] };
    const lines = panel.querySelectorAll('.task-line');
    lines.forEach((line, idx) => {
      const existingCheck = line.querySelector('.task-claim-check');
      if (existingCheck) existingCheck.remove();

      const textSpan = line.querySelector('.task-line-text') || document.createElement('span');
      textSpan.className = 'task-line-text';
      textSpan.textContent = taskData.lines[idx] || '';
      if (!textSpan.parentElement) {
        line.appendChild(textSpan);
      }

      const taskForLine = taskData.tasksForUI[idx];
      if (taskForLine?.claimable) {
        const check = document.createElement('div');
        check.className = 'task-claim-check';
        check.textContent = '✓';
        check.title = 'Claim task reward';
        check.addEventListener('click', event => {
          event.stopPropagation();
          this.handleClaimTask(taskForLine.id);
        });
        line.appendChild(check);
      }
    });
  }

  handleClaimTask(taskId) {
    const result = gameManager.taskSystem?.claimTaskForPlayer?.(gameManager, taskId);
    if (result?.ok) {
      const message = result.rewardText && result.rewardText.length
        ? `Task Complete: ${result.task?.title}\nYour reward: ${result.rewardText}`
        : 'Task Claimed!';
      gameManager.systems?.dialogueSystem?.showNotification?.(message, 'success');
    } else {
      gameManager.systems?.dialogueSystem?.showNotification?.('Unable to claim task.', 'warning');
    }

    this.renderTasksIntoOverlay();
    this.refreshTaskIconState();
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
    if (gameManager.flags?.campEventActive || this.clockRunning) return;
    this.stopCampClockTick();
    this.clockRunning = true;
    this.ensureClockUI();

    // 🕒 Track last time water, hunger, and rest were decreased
    let lastWaterTick = gameManager.getDayTimer();
    let lastHungerTick = gameManager.getDayTimer();
    let lastRestTick = gameManager.getDayTimer();
    let lastShelterLevel = gameManager.getPlayerTribe()?.shelter || 0;

    timerManager.setInterval(CAMP_CLOCK_TIMER_ID, () => {
      if (gameManager.flags?.campEventActive) {
        return;
      }
      gameManager.decreaseDayTimer();
      const currentTime = gameManager.getDayTimer();
      updateCampClockUI(currentTime, gameManager.getDay());
      this.refreshTaskIconState();

      if (
        gameManager.gamePhase !== GamePhase.POST_CHALLENGE &&
        currentTime <= 3600 &&
        !gameManager.flags?.taskSimMidCompleted
      ) {
        const report = gameManager.runTaskSimCheckpoint?.('mid', { triggerDramaEvent: true });
        if (report?.uiIntent) {
          runPart2FromCheckpointReport?.(report);
        }
      }

      // Check if time has run out
      if (currentTime <= 0) {
        this.stopCampClockTick();
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

  stopCampClockTick() {
    timerManager.clearInterval(CAMP_CLOCK_TIMER_ID);
    this.clockRunning = false;
  }

  startDayClockTimer() {
    if (gameManager.flags?.campEventActive || !this.isActive || this.clockRunning) return;

    timerManager.clearInterval(CAMP_CLOCK_TIMER_ID);
    this.startCampClockTick();
  }

  renderClockUI() {
    return this.ensureClockUI();
  }
}
