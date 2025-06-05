/**
 * @module TimerManager
 * Manages timed events and intervals in the game
 */

class TimerManager {
  constructor() {
    this.timers = {};
    this.intervals = {};
    this.gameSpeed = 1.0; // Default game speed multiplier
    this.paused = false;
    this.waterDecreaseCounter = 0; // Track seconds for water decrease
    this.WATER_DECREASE_INTERVAL = 300; // 5 minutes in seconds
  }

  /**
   * Set a timeout with a managed ID
   * @param {string} id - Timer identifier
   * @param {Function} callback - Function to call when timer expires
   * @param {number} delay - Delay in milliseconds
   * @returns {string} The timer ID
   */
  setTimeout(id, callback, delay) {
    // Clear existing timer with same ID if it exists
    this.clearTimeout(id);

    // Apply game speed to delay
    const adjustedDelay = this.paused ? Infinity : delay / this.gameSpeed;

    // Create new timer
    this.timers[id] = {
      timeoutId: window.setTimeout(() => {
        delete this.timers[id];
        callback();
      }, adjustedDelay),
      createdAt: Date.now(),
      delay: delay,
      callback: callback
    };

    return id;
  }

  /**
   * Clear a timeout by ID
   * @param {string} id - Timer identifier
   * @returns {boolean} Whether a timer was cleared
   */
  clearTimeout(id) {
    if (this.timers[id]) {
      window.clearTimeout(this.timers[id].timeoutId);
      delete this.timers[id];
      return true;
    }
    return false;
  }

  /**
   * Set an interval with a managed ID
   * @param {string} id - Interval identifier
   * @param {Function} callback - Function to call on each interval
   * @param {number} delay - Interval delay in milliseconds
   * @returns {string} The interval ID
   */
  setInterval(id, callback, delay) {
    // Clear existing interval with same ID if it exists
    this.clearInterval(id);

    // Apply game speed to delay
    const adjustedDelay = this.paused ? Infinity : delay / this.gameSpeed;

    // Create new interval
    this.intervals[id] = {
      intervalId: window.setInterval(callback, adjustedDelay),
      createdAt: Date.now(),
      delay: delay,
      callback: callback
    };

    return id;
  }

  /**
   * Clear an interval by ID
   * @param {string} id - Interval identifier
   * @returns {boolean} Whether an interval was cleared
   */
  clearInterval(id) {
    if (this.intervals[id]) {
      window.clearInterval(this.intervals[id].intervalId);
      delete this.intervals[id];
      return true;
    }
    return false;
  }

  /**
   * Initialize water decrease system
   * @param {Object} gameManager - Game manager instance
   */
  initializeWaterDecrease(gameManager) {
    this.gameManager = gameManager;

    // Check every real second if 5 in-game minutes have passed
    this.setInterval('checkWaterDecrease', () => {
      if (typeof gameManager.getDayTimer !== 'function') return;

      const dayTimer = gameManager.getDayTimer(); // This returns in-game seconds passed
      const roundedSeconds = Math.floor(dayTimer);

      // Check if we've hit a 5-minute mark (every 300 seconds)
      if (roundedSeconds > 0 && roundedSeconds % this.WATER_DECREASE_INTERVAL === 0) {
        if (!this.lastDecreaseTime || this.lastDecreaseTime !== roundedSeconds) {
          this.lastDecreaseTime = roundedSeconds;
          this.handleWaterDecrease();
        }
      }
    }, 1000); // check every real-life second
  }

  /**
   * Handle water decrease for all survivors
   * @private
   */
  handleWaterDecrease() {
    if (!this.gameManager?.survivors?.length) return;

    this.gameManager.decreaseWaterForAll(1);

    // Update inventory UI only if player is viewing the menu
    const menuCard = document.getElementById('menu-card');
    if (menuCard && menuCard.style.display === 'block') {
      const player = this.gameManager.getPlayerSurvivor();
      if (player) {
        const waterElement = document.getElementById('value-water');
        if (waterElement) {
          waterElement.textContent = player.water || 0;
        }
      }
    }

    console.log('Water decreased for all survivors (5 in-game minutes passed)');
  }

  /**
   * Update game speed and adjust all timers and intervals
   * @param {number} speed - New game speed multiplier
   */
  setGameSpeed(speed) {
    // Validate speed
    if (speed <= 0) {
      console.error('Game speed must be greater than 0');
      return;
    }

    const oldSpeed = this.gameSpeed;
    this.gameSpeed = speed;

    // No need to update timers if we're paused
    if (this.paused) return;

    // Adjust all active timers
    Object.keys(this.timers).forEach(id => {
      const timer = this.timers[id];

      // Calculate remaining time based on old speed
      const elapsed = Date.now() - timer.createdAt;
      const remainingOld = (timer.delay / oldSpeed) - elapsed;

      // Skip if timer is about to expire
      if (remainingOld <= 10) return;

      // Calculate new delay based on new speed
      const remainingNew = remainingOld * (oldSpeed / speed);

      // Clear old timer and create new one
      window.clearTimeout(timer.timeoutId);

      this.timers[id].timeoutId = window.setTimeout(() => {
        delete this.timers[id];
        timer.callback();
      }, remainingNew);
    });

    // Adjust all active intervals
    Object.keys(this.intervals).forEach(id => {
      const interval = this.intervals[id];

      // Clear old interval and create new one with adjusted delay
      window.clearInterval(interval.intervalId);

      this.intervals[id].intervalId = window.setInterval(
        interval.callback,
        interval.delay / speed
      );
    });

    console.log(`Game speed set to ${speed}x`);
  }

  /**
   * Pause all timers and intervals
   */
  pause() {
    if (this.paused) return;

    this.paused = true;

    // Store state of all timers and clear them
    Object.keys(this.timers).forEach(id => {
      const timer = this.timers[id];

      // Calculate remaining time
      const elapsed = Date.now() - timer.createdAt;
      timer.remaining = (timer.delay / this.gameSpeed) - elapsed;

      // Clear timeout
      window.clearTimeout(timer.timeoutId);
    });

    // Clear all intervals
    Object.keys(this.intervals).forEach(id => {
      window.clearInterval(this.intervals[id].intervalId);
    });

    console.log('Timers paused');
  }

  /**
   * Resume all paused timers and intervals
   */
  resume() {
    if (!this.paused) return;

    this.paused = false;

    // Resume all timers with remaining time
    Object.keys(this.timers).forEach(id => {
      const timer = this.timers[id];

      // Skip if timer already expired
      if (timer.remaining <= 0) {
        timer.callback();
        delete this.timers[id];
        return;
      }

      // Create new timer with remaining time
      timer.timeoutId = window.setTimeout(() => {
        delete this.timers[id];
        timer.callback();
      }, timer.remaining);

      // Update created time
      timer.createdAt = Date.now();

      // Remove remaining property
      delete timer.remaining;
    });

    // Resume all intervals
    Object.keys(this.intervals).forEach(id => {
      const interval = this.intervals[id];

      interval.intervalId = window.setInterval(
        interval.callback,
        interval.delay / this.gameSpeed
      );
    });

    console.log('Timers resumed');
  }

  /**
   * Clear all timers and intervals
   */
  clearAll() {
    // Clear all timers
    Object.keys(this.timers).forEach(id => {
      window.clearTimeout(this.timers[id].timeoutId);
    });

    // Clear all intervals
    Object.keys(this.intervals).forEach(id => {
      window.clearInterval(this.intervals[id].intervalId);
    });

    this.timers = {};
    this.intervals = {};

    // Reset water decrease counter
    this.waterDecreaseCounter = 0;

    console.log('All timers and intervals cleared');
  }

  /**
   * Get the count of active timers
   * @returns {number} Count of active timers
   */
  getTimerCount() {
    return Object.keys(this.timers).length;
  }

  /**
   * Get the count of active intervals
   * @returns {number} Count of active intervals
   */
  getIntervalCount() {
    return Object.keys(this.intervals).length;
  }

  /**
   * Check if a timer exists
   * @param {string} id - Timer identifier
   * @returns {boolean} Whether the timer exists
   */
  hasTimer(id) {
    return !!this.timers[id];
  }

  /**
   * Check if an interval exists
   * @param {string} id - Interval identifier
   * @returns {boolean} Whether the interval exists
   */
  hasInterval(id) {
    return !!this.intervals[id];
  }

  /**
   * Get information about all active timers
   * @returns {Object} Timer information
   */
  getTimerInfo() {
    const info = {};

    Object.keys(this.timers).forEach(id => {
      const timer = this.timers[id];
      const elapsed = Date.now() - timer.createdAt;
      const remaining = this.paused 
        ? timer.remaining 
        : (timer.delay / this.gameSpeed) - elapsed;

      info[id] = {
        createdAt: timer.createdAt,
        elapsed: elapsed,
        remaining: remaining,
        originalDelay: timer.delay,
        adjustedDelay: timer.delay / this.gameSpeed
      };
    });

    return info;
  }

  /**
   * Get the current game speed
   * @returns {number} Current game speed multiplier
   */
  getGameSpeed() {
    return this.gameSpeed;
  }

  /**
   * Check if timers are paused
   * @returns {boolean} Whether timers are paused
   */
  isPaused() {
    return this.paused;
  }

  /**
   * Get water decrease status
   * @returns {Object} Water decrease information
   */
  getWaterDecreaseInfo() {
    return {
      counter: this.waterDecreaseCounter,
      interval: this.WATER_DECREASE_INTERVAL,
      nextDecreaseIn: this.WATER_DECREASE_INTERVAL - this.waterDecreaseCounter,
      isActive: this.hasInterval('waterDecrease')
    };
  }

  /**
   * Reset water decrease counter (useful for testing or save/load)
   */
  resetWaterDecreaseCounter() {
    this.waterDecreaseCounter = 0;
    console.log('Water decrease counter reset');
  }
}

// Create and export singleton instance
const timerManager = new TimerManager();
export default timerManager;