/**
 * @module EnergySystem
 * Manages player and tribe energy/resource levels
 */

import eventManager, { GameEvents } from '../core/EventManager.js';
import timerManager from '../utils/TimerManager.js';
import { clamp } from '../utils/CommonUtils.js';

class EnergySystem {
  constructor(gameManager) {
    this.gameManager = gameManager;
    this.energyUpdateInterval = null;
    this.energyDecayRate = 0.1; // Energy units lost per minute
    this.energyReplenishRate = 0.5; // Energy units gained per action
    this.resourceDecayRates = {
      food: 0.05,
      water: 0.08,
      fire: 0.03,
      shelter: 0.01
    };
    this.maxEnergy = 100;
    this.maxResourceLevel = 100;
  }
  
  /**
   * Initialize the energy system
   */
  initialize() {
    console.log('Initializing EnergySystem');
    
    // Start energy decay timer
    this._startEnergyDecayTimer();
    
    // Subscribe to relevant events
    eventManager.subscribe(GameEvents.DAY_ADVANCED, this._handleDayAdvanced.bind(this));
    eventManager.subscribe(GameEvents.GAME_PHASE_CHANGED, this._handlePhaseChanged.bind(this));
    eventManager.subscribe(GameEvents.CAMP_ACTIVITY_COMPLETED, this._handleCampActivity.bind(this));
  }
  
  /**
   * Start energy decay timer
   * @private
   */
  _startEnergyDecayTimer() {
    // Clear any existing interval
    if (this.energyUpdateInterval) {
      timerManager.clearInterval(this.energyUpdateInterval);
    }
    
    // Set new interval (every minute)
    this.energyUpdateInterval = timerManager.setInterval(
      'energy_decay',
      () => {
        this._applyEnergyDecay();
      },
      60000 // 1 minute
    );
  }
  
  /**
   * Apply energy decay
   * @private
   */
  _applyEnergyDecay() {
    const player = this.gameManager.getPlayerSurvivor();
    if (!player) return;
    
    // Decay player energy
    const newEnergy = Math.max(0, player.energy - this.energyDecayRate);
    this.setEnergy(newEnergy);
    
    // Decay tribe resources
    const playerTribe = this.gameManager.getPlayerTribe();
    if (playerTribe) {
      this._decayResources(playerTribe);
    }
  }
  
  /**
   * Decay tribe resources
   * @param {Object} tribe - Tribe object
   * @private
   */
  _decayResources(tribe) {
    if (!tribe.resources) return;
    
    // Apply decay to each resource
    Object.keys(this.resourceDecayRates).forEach(resource => {
      if (tribe.resources[resource] !== undefined) {
        const decayRate = this.resourceDecayRates[resource];
        tribe.resources[resource] = Math.max(0, tribe.resources[resource] - decayRate);
        
        // Publish resource used event
        eventManager.publish(GameEvents.RESOURCE_USED, {
          tribe: tribe.id,
          resource,
          amount: decayRate,
          reason: 'natural decay'
        });
      }
    });
  }
  
  /**
   * Handle day advanced event
   * @param {Object} data - Event data
   * @private
   */
  _handleDayAdvanced(data) {
    // Replenish some energy at the start of a new day
    const player = this.gameManager.getPlayerSurvivor();
    if (!player) return;
    
    // Gain 20% energy when a new day starts
    const energyGain = this.maxEnergy * 0.2;
    const newEnergy = Math.min(this.maxEnergy, (player.energy || 0) + energyGain);
    this.setEnergy(newEnergy);
    
    // Update tribe resources based on events/activities from previous day
    this._updateTribeResources();
  }
  
  /**
   * Handle game phase changed event
   * @param {Object} data - Event data
   * @private
   */
  _handlePhaseChanged(data) {
    // Adjust energy based on phase
    const player = this.gameManager.getPlayerSurvivor();
    if (!player) return;
    
    // Energy loss for certain phases
    let energyChange = 0;
    
    switch (data.newPhase) {
      case 'challenge':
        // Challenges cost energy
        energyChange = -15;
        break;
      case 'tribalCouncil':
        // Tribal councils are stressful
        energyChange = -5;
        break;
      case 'night':
        // Night time rest recovers energy
        energyChange = 10;
        break;
    }
    
    if (energyChange !== 0) {
      const newEnergy = clamp((player.energy || 0) + energyChange, 0, this.maxEnergy);
      this.setEnergy(newEnergy);
    }
  }
  
  /**
   * Handle camp activity event
   * @param {Object} data - Event data
   * @private
   */
  _handleCampActivity(data) {
    if (!data.activity) return;
    
    const player = this.gameManager.getPlayerSurvivor();
    if (!player) return;
    
    const tribe = this.gameManager.getPlayerTribe();
    if (!tribe) return;
    
    // Apply energy cost for the activity
    let energyCost = 0;
    let resourceGains = {};
    
    switch (data.activity) {
      case 'gatherFood':
        energyCost = 10;
        resourceGains.food = 15;
        break;
      case 'gatherWater':
        energyCost = 8;
        resourceGains.water = 20;
        break;
      case 'buildShelter':
        energyCost = 15;
        resourceGains.shelter = 10;
        break;
      case 'tendFire':
        energyCost = 5;
        resourceGains.fire = 25;
        break;
      case 'rest':
        // Resting gives energy back
        this.replenishEnergy(25);
        return;
      default:
        // Generic activity
        energyCost = 5;
    }
    
    // Apply energy cost
    if (energyCost > 0) {
      const newEnergy = Math.max(0, (player.energy || 0) - energyCost);
      this.setEnergy(newEnergy);
    }
    
    // Apply resource gains
    if (Object.keys(resourceGains).length > 0) {
      this.addResources(tribe, resourceGains);
    }
  }
  
  /**
   * Update tribe resources
   * @private
   */
  _updateTribeResources() {
    const tribe = this.gameManager.getPlayerTribe();
    if (!tribe || !tribe.resources) return;
    
    // Random fluctuations
    const resources = ['food', 'water', 'fire', 'shelter'];
    const changes = {};
    
    resources.forEach(resource => {
      // Small random change (-5 to +5)
      const change = Math.floor(Math.random() * 11) - 5;
      changes[resource] = change;
    });
    
    // Apply changes
    this.addResources(tribe, changes);
  }
  
  /**
   * Set player energy level
   * @param {number} energy - Energy level
   */
  setEnergy(energy) {
    const player = this.gameManager.getPlayerSurvivor();
    if (!player) return;
    
    const oldEnergy = player.energy || 0;
    const newEnergy = clamp(energy, 0, this.maxEnergy);
    player.energy = newEnergy;
    
    // Publish energy changed event
    eventManager.publish(GameEvents.ENERGY_CHANGED, {
      oldEnergy,
      newEnergy,
      change: newEnergy - oldEnergy
    });
    
    // If energy gets too low, affect health
    if (newEnergy < 20) {
      // Low energy hurts health
      this.gameManager.updatePlayerHealth();
    }
  }
  
  /**
   * Replenish player energy
   * @param {number} amount - Amount to replenish
   */
  replenishEnergy(amount) {
    const player = this.gameManager.getPlayerSurvivor();
    if (!player) return;
    
    const oldEnergy = player.energy || 0;
    const newEnergy = clamp(oldEnergy + amount, 0, this.maxEnergy);
    player.energy = newEnergy;
    
    // Publish energy changed event
    eventManager.publish(GameEvents.ENERGY_CHANGED, {
      oldEnergy,
      newEnergy,
      change: amount
    });
  }
  
  /**
   * Reduce player energy
   * @param {number} amount - Amount to reduce
   */
  reduceEnergy(amount) {
    const player = this.gameManager.getPlayerSurvivor();
    if (!player) return;
    
    const oldEnergy = player.energy || 0;
    const newEnergy = clamp(oldEnergy - amount, 0, this.maxEnergy);
    player.energy = newEnergy;
    
    // Publish energy changed event
    eventManager.publish(GameEvents.ENERGY_CHANGED, {
      oldEnergy,
      newEnergy,
      change: -amount
    });
  }
  
  /**
   * Check if player has enough energy
   * @param {number} amount - Required energy amount
   * @returns {boolean} Whether player has enough energy
   */
  hasEnough(amount) {
    const player = this.gameManager.getPlayerSurvivor();
    if (!player) return false;
    
    return (player.energy || 0) >= amount;
  }
  
  /**
   * Add resources to a tribe
   * @param {Object} tribe - Tribe object
   * @param {Object} resources - Resources to add (can be negative)
   */
  addResources(tribe, resources) {
    if (!tribe || !tribe.resources) return;
    
    Object.keys(resources).forEach(resource => {
      if (tribe.resources[resource] !== undefined) {
        const oldValue = tribe.resources[resource];
        const change = resources[resource];
        
        // Clamp to valid range
        tribe.resources[resource] = clamp(oldValue + change, 0, this.maxResourceLevel);
        
        // Publish resource event
        if (change > 0) {
          eventManager.publish(GameEvents.RESOURCE_GATHERED, {
            tribe: tribe.id,
            resource,
            amount: change
          });
        } else if (change < 0) {
          eventManager.publish(GameEvents.RESOURCE_USED, {
            tribe: tribe.id,
            resource,
            amount: -change
          });
        }
      }
    });
  }
  
  /**
   * Get tribe resource level
   * @param {Object} tribe - Tribe object
   * @param {string} resource - Resource name
   * @returns {number} Resource level
   */
  getResourceLevel(tribe, resource) {
    if (!tribe || !tribe.resources || tribe.resources[resource] === undefined) {
      return 0;
    }
    
    return tribe.resources[resource];
  }
  
  /**
   * Check if tribe has enough of a resource
   * @param {Object} tribe - Tribe object
   * @param {string} resource - Resource name
   * @param {number} amount - Required amount
   * @returns {boolean} Whether tribe has enough
   */
  hasResource(tribe, resource, amount) {
    return this.getResourceLevel(tribe, resource) >= amount;
  }
  
  /**
   * Stop all timers
   */
  stopTimers() {
    if (this.energyUpdateInterval) {
      timerManager.clearInterval(this.energyUpdateInterval);
      this.energyUpdateInterval = null;
    }
  }
  
  /**
   * Reset the energy system
   */
  reset() {
    this.stopTimers();
    this._startEnergyDecayTimer();
  }
}

export default EnergySystem;