/**
 * @module EventManager
 * Manages event publishing and subscription throughout the game
 * Implements a pub-sub pattern for decoupled communication
 */

// List of game events
export const GameEvents = {
  // Game state events
  GAME_INITIALIZED: 'game:initialized',
  GAME_STARTED: 'game:started',
  GAME_STATE_CHANGED: 'game:stateChanged',
  GAME_PHASE_CHANGED: 'game:phaseChanged',
  GAME_SAVED: 'game:saved',
  GAME_LOADED: 'game:loaded',
  GAME_OVER: 'game:over',
  
  // Screen events
  SCREEN_CHANGED: 'screen:changed',
  
  // Character events
  CHARACTER_SELECTED: 'character:selected',
  
  // Tribe events
  TRIBES_CREATED: 'tribes:created',
  TRIBES_MERGED: 'tribes:merged',
  TRIBE_SHUFFLED: 'tribes:shuffled',
  
  // Day events
  DAY_STARTED: 'day:started',
  DAY_ADVANCED: 'day:advanced',
  
  // Camp events
  CAMP_ACTIVITY_COMPLETED: 'camp:activityCompleted',
  RESOURCE_GATHERED: 'resource:gathered',
  RESOURCE_USED: 'resource:used',
  
  // Challenge events
  CHALLENGE_STARTED: 'challenge:started',
  CHALLENGE_COMPLETED: 'challenge:completed',
  IMMUNITY_GRANTED: 'immunity:granted',
  REWARD_GRANTED: 'reward:granted',
  
  // Tribal council events
  TRIBAL_COUNCIL_STARTED: 'tribalCouncil:started',
  VOTE_CAST: 'vote:cast',
  SURVIVOR_ELIMINATED: 'survivor:eliminated',
  
  // Relationship events
  RELATIONSHIP_CHANGED: 'relationship:changed',
  
  // Alliance events
  ALLIANCE_FORMED: 'alliance:formed',
  ALLIANCE_DISBANDED: 'alliance:disbanded',
  ALLIANCE_MEMBER_ADDED: 'alliance:memberAdded',
  ALLIANCE_MEMBER_REMOVED: 'alliance:memberRemoved',
  
  // Idol events
  IDOL_FOUND: 'idol:found',
  IDOL_PLAYED: 'idol:played',
  
  // Health events
  HEALTH_CHANGED: 'health:changed',
  ENERGY_CHANGED: 'energy:changed',
  
  // UI events
  UI_UPDATED: 'ui:updated',
  DIALOGUE_SHOWN: 'dialogue:shown',
  DIALOGUE_HIDDEN: 'dialogue:hidden'
};

class EventManager {
  constructor() {
    this.subscribers = {};
    this.history = [];
    this.maxHistoryLength = 100;
    this.debug = false; // Set to true to enable debug logging
  }
  
  /**
   * Subscribe to an event
   * @param {string} event - Event name
   * @param {Function} callback - Function to call when event is published
   * @returns {Function} Unsubscribe function
   */
  subscribe(event, callback) {
    if (!this.subscribers[event]) {
      this.subscribers[event] = [];
    }
    
    this.subscribers[event].push(callback);
    
    // Return unsubscribe function
    return () => {
      this.unsubscribe(event, callback);
    };
  }
  
  /**
   * Unsubscribe from an event
   * @param {string} event - Event name
   * @param {Function} callback - The callback to remove
   */
  unsubscribe(event, callback) {
    if (!this.subscribers[event]) return;
    
    this.subscribers[event] = this.subscribers[event].filter(
      subscriber => subscriber !== callback
    );
    
    // Clean up empty event arrays
    if (this.subscribers[event].length === 0) {
      delete this.subscribers[event];
    }
  }
  
  /**
   * Publish an event
   * @param {string} event - Event name
   * @param {Object} data - Data to pass to subscribers
   */
  publish(event, data = {}) {
    if (this.debug) {
      console.log(`Event published: ${event}`, data);
    }
    
    // Add event to history
    this.history.push({
      event,
      data,
      timestamp: Date.now()
    });
    
    // Trim history if needed
    if (this.history.length > this.maxHistoryLength) {
      this.history = this.history.slice(-this.maxHistoryLength);
    }
    
    // Notify subscribers
    if (!this.subscribers[event]) return;
    
    // Make a copy of subscribers to avoid issues if a subscriber unsubscribes during iteration
    const subscribersCopy = [...this.subscribers[event]];
    
    subscribersCopy.forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        console.error(`Error in event handler for ${event}:`, error);
      }
    });
  }
  
  /**
   * Get event history
   * @param {string} eventFilter - Optional event name to filter history
   * @param {number} limit - Maximum number of history items to return
   * @returns {Array} Event history
   */
  getHistory(eventFilter = null, limit = this.maxHistoryLength) {
    if (eventFilter) {
      return this.history
        .filter(item => item.event === eventFilter)
        .slice(-limit);
    }
    
    return this.history.slice(-limit);
  }
  
  /**
   * Clear all subscribers and history
   */
  clear() {
    this.subscribers = {};
    this.history = [];
  }
  
  /**
   * Set debug mode
   * @param {boolean} enabled - Whether to enable debug mode
   */
  setDebug(enabled) {
    this.debug = enabled;
  }
  
  /**
   * Get subscriber count for an event
   * @param {string} event - Event name
   * @returns {number} Number of subscribers
   */
  getSubscriberCount(event) {
    if (!this.subscribers[event]) return 0;
    return this.subscribers[event].length;
  }
  
  /**
   * Get all events with subscribers
   * @returns {Array} Array of event names
   */
  getActiveEvents() {
    return Object.keys(this.subscribers);
  }
}

// Create and export singleton instance
const eventManager = new EventManager();
export default eventManager;