/**
 * @module GameManager
 * Central manager for game state and systems
 */

import eventManager, { GameEvents } from './EventManager.js';
import screenManager from './ScreenManager.js';
import { GameData } from '../data/index.js';
import { loadFromLocalStorage, saveToLocalStorage } from '../utils/StorageUtils.js';
import { deepCopy } from '../utils/CommonUtils.js';
import timerManager from '../utils/TimerManager.js';

// Game states
export const GameState = {
  INITIALIZING: 'initializing',
  WELCOME: 'welcome',
  CHARACTER_SELECTION: 'characterSelection',
  TRIBE_DIVISION: 'tribeDivision',
  CAMP: 'camp',
  CHALLENGE: 'challenge',
  TRIBAL_COUNCIL: 'tribalCouncil',
  MERGE: 'merge',
  FIRE_MAKING: 'fireMaking',
  FINALE: 'finale',
  GAME_OVER: 'gameOver'
};

// Game phases
export const GamePhase = {
  PRE_GAME: 'preGame',
  PRE_CHALLENGE: 'preChallenge',
  CHALLENGE: 'challenge',
  POST_CHALLENGE: 'postChallenge',
  TRIBAL_COUNCIL: 'tribalCouncil',
  NIGHT: 'night'
};

// Save game key
const SAVE_GAME_KEY = 'survivorIsland.saveGame';

class GameManager {
  constructor() {
    this.isInitialized = false;
    this.gameState = GameState.INITIALIZING;
    this.gamePhase = GamePhase.PRE_GAME;
    this.day = 1;
    this.tribes = [];
    this.tribeCount = 2; // Default to 2 tribes
    this.survivors = [];
    this.player = null;
    this.jury = [];
    this.finalists = [];
    this.winner = null;
    this.mergeAt = 12; // Default player count for merge
    this.isTribesShuffled = false;
    this.isMerged = false;
    this.gameSettings = {
      enableIdols: true,
      enableAdvantages: true,
      difficultyLevel: 'normal',
      tribeCount: 2
    };
    this.systems = {}; // Will hold references to game systems
  }
  
  /**
   * Initialize the game manager and all systems
   */
  initialize() {
    if (this.isInitialized) {
      console.warn('GameManager already initialized');
      return;
    }
    
    console.log('Initializing GameManager');
    
    // Initialize event manager
    eventManager.clear();
    eventManager.setDebug(false);
    
    // Initialize screen manager
    screenManager.initialize();
    
    // Initialize timer manager
    timerManager.clearAll();
    
    // Set game state
    this.gameState = GameState.WELCOME;
    
    // Mark as initialized
    this.isInitialized = true;
    
    // Publish game initialized event
    eventManager.publish(GameEvents.GAME_INITIALIZED);
  }
  
  /**
   * Register a game system
   * @param {string} systemName - System name
   * @param {Object} system - System instance
   */
  registerSystem(systemName, system) {
    if (this.systems[systemName]) {
      console.warn(`System ${systemName} already registered, overwriting`);
    }
    
    this.systems[systemName] = system;
    
    // Initialize the system if it has an initialize method
    if (system.initialize && typeof system.initialize === 'function') {
      system.initialize();
    }
    
    console.log(`System registered: ${systemName}`);
  }
  
  /**
   * Start a new game
   * @param {Object} settings - Game settings
   */
  startNewGame(settings = {}) {
    console.log('Starting new game');
    
    // Apply settings
    this.gameSettings = {
      ...this.gameSettings,
      ...settings
    };
    
    // Set tribe count from settings
    this.tribeCount = this.gameSettings.tribeCount;
    
    // Reset game state
    this.resetGameState();
    
    // Set game state to character selection
    this.setGameState(GameState.CHARACTER_SELECTION);
    
    // Publish game started event
    eventManager.publish(GameEvents.GAME_STARTED, {
      settings: this.gameSettings
    });
  }
  
  /**
   * Reset game state for a new game
   */
  resetGameState() {
    this.day = 1;
    this.tribes = [];
    this.survivors = [];
    this.player = null;
    this.jury = [];
    this.finalists = [];
    this.winner = null;
    this.isTribesShuffled = false;
    this.isMerged = false;
    this.gamePhase = GamePhase.PRE_GAME;
    
    // Reset systems
    Object.keys(this.systems).forEach(systemName => {
      const system = this.systems[systemName];
      if (system.reset && typeof system.reset === 'function') {
        system.reset();
      }
    });
  }
  
  /**
   * Set the game state and update UI
   * @param {string} newState - The new game state
   */
  setGameState(newState) {
    if (!Object.values(GameState).includes(newState)) {
      console.error(`Invalid game state: ${newState}`);
      return;
    }
    
    const oldState = this.gameState;
    this.gameState = newState;
    
    // Update screen based on new state
    this._updateScreenForState(newState);
    
    // Publish state changed event
    eventManager.publish(GameEvents.GAME_STATE_CHANGED, {
      oldState,
      newState
    });
    
    console.log(`Game state changed: ${oldState} -> ${newState}`);
  }
  
  /**
   * Set the game phase
   * @param {string} newPhase - The new game phase
   */
  setGamePhase(newPhase) {
    if (!Object.values(GamePhase).includes(newPhase)) {
      console.error(`Invalid game phase: ${newPhase}`);
      return;
    }
    
    const oldPhase = this.gamePhase;
    this.gamePhase = newPhase;
    
    // Publish phase changed event
    eventManager.publish(GameEvents.GAME_PHASE_CHANGED, {
      oldPhase,
      newPhase
    });
    
    console.log(`Game phase changed: ${oldPhase} -> ${newPhase}`);
  }
  
  /**
   * Update the active screen based on game state
   * @param {string} state - The game state
   * @private
   */
  _updateScreenForState(state) {
    switch (state) {
      case GameState.WELCOME:
        screenManager.showScreen('welcome');
        break;
      case GameState.CHARACTER_SELECTION:
        screenManager.showScreen('characterSelection');
        break;
      case GameState.TRIBE_DIVISION:
        screenManager.showScreen('tribeDivision');
        break;
      case GameState.CAMP:
        screenManager.showScreen('camp');
        break;
      case GameState.CHALLENGE:
        screenManager.showScreen('challenge');
        break;
      case GameState.TRIBAL_COUNCIL:
        screenManager.showScreen('tribalCouncil');
        break;
      case GameState.FIRE_MAKING:
        screenManager.showScreen('fireMakingChallenge');
        break;
      case GameState.FINALE:
        screenManager.showScreen('finale');
        break;
      case GameState.GAME_OVER:
        screenManager.showScreen('gameOver');
        break;
      default:
        console.warn(`No screen defined for state: ${state}`);
    }
  }
  
  /**
   * Select a character to play as
   * @param {Object} survivor - The selected survivor
   */
  selectCharacter(survivor) {
    if (!survivor) {
      console.error('No survivor provided');
      return;
    }
    
    // Set player
    survivor.isPlayer = true;
    this.player = survivor;
    
    // Add to survivors list
    this.survivors = [...GameData.getSurvivors()];
    
    // Create tribes
    this.createTribes();
    
    // Publish character selected event
    eventManager.publish(GameEvents.CHARACTER_SELECTED, {
      survivor
    });
    
    // Move to tribe division
    this.setGameState(GameState.TRIBE_DIVISION);
    
    console.log(`Character selected: ${survivor.name}`);
  }
  
  /**
   * Create tribes for the game
   */
  createTribes() {
    const survivors = [...this.survivors];
    const tribeNames = GameData.getTribeNames();
    
    if (survivors.length === 0) {
      console.error('No survivors to create tribes with');
      return;
    }
    
    // Ensure we have enough tribe names
    if (tribeNames.length < this.tribeCount) {
      console.error(`Not enough tribe names (${tribeNames.length}) for tribe count (${this.tribeCount})`);
      return;
    }
    
    // Reset tribes
    this.tribes = [];
    
    // Shuffle survivors for random distribution
    for (let i = survivors.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [survivors[i], survivors[j]] = [survivors[j], survivors[i]];
    }
    
    // Calculate survivors per tribe
    const survivorsPerTribe = Math.floor(survivors.length / this.tribeCount);
    let remainingSurvivors = survivors.length % this.tribeCount;
    
    // Create tribes
    let survivorIndex = 0;
    for (let i = 0; i < this.tribeCount; i++) {
      // Calculate how many survivors for this tribe
      let tribeSize = survivorsPerTribe;
      if (remainingSurvivors > 0) {
        tribeSize++;
        remainingSurvivors--;
      }
      
      // Create tribe with the selected tribe name
      const tribe = {
        id: i + 1,
        tribeName: tribeNames[i].name,
        tribeColor: tribeNames[i].color,
        members: [],
        resources: {
          food: 25,
          water: 50,
          fire: 75,
          shelter: 60,
        },
        immunityWins: 0,
        rewardWins: 0,
        attributes: this._calculateTribeAttributes([])
      };
      
      // Add survivors to tribe
      for (let j = 0; j < tribeSize; j++) {
        if (survivorIndex < survivors.length) {
          tribe.members.push(survivors[survivorIndex]);
          survivorIndex++;
        }
      }
      
      // Calculate tribe attributes based on members
      tribe.attributes = this._calculateTribeAttributes(tribe.members);
      
      // Add tribe to list
      this.tribes.push(tribe);
    }
    
    // Publish tribes created event
    eventManager.publish(GameEvents.TRIBES_CREATED, {
      tribes: this.tribes
    });
    
    console.log(`Created ${this.tribes.length} tribes`);
  }
  
  /**
   * Calculate tribe attributes based on members
   * @param {Array} members - Tribe members
   * @returns {Object} Tribe attributes
   * @private
   */
  _calculateTribeAttributes(members) {
    if (!members || members.length === 0) {
      return {
        physical: 0,
        mental: 0,
        social: 0,
        teamwork: 0,
        morale: 50
      };
    }
    
    // Calculate average attributes
    const totalPhysical = members.reduce((sum, member) => sum + member.physical, 0);
    const totalMental = members.reduce((sum, member) => sum + member.mental, 0);
    const totalPersonality = members.reduce((sum, member) => sum + member.personality, 0);
    
    // Calculate averages
    const physical = Math.round(totalPhysical / members.length);
    const mental = Math.round(totalMental / members.length);
    const social = Math.round(totalPersonality / members.length);
    
    // Teamwork and morale start at neutral values
    const teamwork = 50;
    const morale = 50;
    
    return {
      physical,
      mental,
      social,
      teamwork,
      morale
    };
  }
  
  /**
   * Merge tribes into one
   */
  mergeTribes() {
    if (this.tribes.length <= 1 || this.isMerged) {
      console.warn('Cannot merge tribes');
      return;
    }
    
    // Create merge tribe name and color
    const mergeTribeName = "Merged Tribe";
    const mergeTribeColor = "#FFC107"; // Amber color for merged tribe
    
    // Collect all survivors from all tribes
    const allMembers = [];
    this.tribes.forEach(tribe => {
      allMembers.push(...tribe.members);
    });
    
    // Create merged tribe
    const mergedTribe = {
      id: 1,
      tribeName: mergeTribeName,
      tribeColor: mergeTribeColor,
      members: allMembers,
      resources: {
        food: 50,
        water: 75,
        fire: 100,
        shelter: 80,
      },
      immunityWins: 0,
      rewardWins: 0,
      attributes: this._calculateTribeAttributes(allMembers)
    };
    
    // Replace all tribes with merged tribe
    this.tribes = [mergedTribe];
    this.isMerged = true;
    
    // Publish tribes merged event
    eventManager.publish(GameEvents.TRIBES_MERGED, {
      mergedTribe
    });
    
    console.log('Tribes merged');
  }
  
  /**
   * Get the player's tribe
   * @returns {Object} The player's tribe
   */
  getPlayerTribe() {
    if (!this.player) {
      console.warn('Player not available yet');
      return null;
    }
    
    return this.tribes.find(tribe => 
      tribe.members.some(member => member.id === this.player.id)
    ) || null;
  }
  
  /**
   * Get the player survivor object
   * @returns {Object} The player survivor
   */
  getPlayerSurvivor() {
    return this.player;
  }
  
  /**
   * Get all tribes
   * @returns {Array} All tribes
   */
  getTribes() {
    return this.tribes;
  }
  
  /**
   * Get the current game phase
   * @returns {string} The current game phase
   */
  getGamePhase() {
    return this.gamePhase;
  }
  
  /**
   * Get the current game state
   * @returns {string} The current game state
   */
  getGameState() {
    return this.gameState;
  }
  
  /**
   * Get the current day
   * @returns {number} The current day
   */
  getDay() {
    return this.day;
  }
  
  /**
   * Advance to the next day
   */
  advanceDay() {
    this.day++;
    
    // Update tribe health
    this.updateTribeHealth();
    
    // Check for merge
    this.checkForMerge();
    
    // Publish day advanced event
    eventManager.publish(GameEvents.DAY_ADVANCED, {
      day: this.day
    });
    
    console.log(`Advanced to day ${this.day}`);
  }
  
  /**
   * Update player health based on tribe health and personal actions
   */
  updatePlayerHealth() {
    if (!this.player) return;
    
    const tribe = this.getPlayerTribe();
    if (!tribe) return;
    
    // Base health decay - lose 5 health points per day if not maintained
    let healthChange = -5;
    
    // Adjust based on tribe resources
    const resources = tribe.resources;
    if (resources.food > 60) healthChange += 2;
    if (resources.water > 60) healthChange += 2;
    if (resources.fire > 60) healthChange += 1;
    if (resources.shelter > 60) healthChange += 1;
    
    // Apply change
    this.player.health = Math.max(0, Math.min(100, this.player.health + healthChange));
    
    // Publish health changed event
    eventManager.publish(GameEvents.HEALTH_CHANGED, {
      survivorId: this.player.id,
      health: this.player.health,
      change: healthChange
    });
  }
  
  /**
   * Player eats food action
   * @returns {boolean} Whether the action was successful
   */
  playerEat() {
    if (!this.player) return false;
    
    const tribe = this.getPlayerTribe();
    if (!tribe || tribe.resources.food < 10) return false;
    
    // Consume tribe food
    tribe.resources.food = Math.max(0, tribe.resources.food - 10);
    
    // Gain health
    const oldHealth = this.player.health;
    this.player.health = Math.min(100, this.player.health + 15);
    
    // Publish health changed event
    eventManager.publish(GameEvents.HEALTH_CHANGED, {
      survivorId: this.player.id,
      health: this.player.health,
      change: this.player.health - oldHealth
    });
    
    // Publish resource used event
    eventManager.publish(GameEvents.RESOURCE_USED, {
      tribe: tribe.id,
      resource: 'food',
      amount: 10
    });
    
    return true;
  }
  
  /**
   * Player drinks water action
   * @returns {boolean} Whether the action was successful
   */
  playerDrink() {
    if (!this.player) return false;
    
    const tribe = this.getPlayerTribe();
    if (!tribe || tribe.resources.water < 10) return false;
    
    // Consume tribe water
    tribe.resources.water = Math.max(0, tribe.resources.water - 10);
    
    // Gain health
    const oldHealth = this.player.health;
    this.player.health = Math.min(100, this.player.health + 10);
    
    // Publish health changed event
    eventManager.publish(GameEvents.HEALTH_CHANGED, {
      survivorId: this.player.id,
      health: this.player.health,
      change: this.player.health - oldHealth
    });
    
    // Publish resource used event
    eventManager.publish(GameEvents.RESOURCE_USED, {
      tribe: tribe.id,
      resource: 'water',
      amount: 10
    });
    
    return true;
  }
  
  /**
   * Player rests action
   * @returns {boolean} Whether the action was successful
   */
  playerRest() {
    if (!this.player) return false;
    
    const tribe = this.getPlayerTribe();
    if (!tribe) return false;
    
    // Rest effectiveness depends on shelter quality
    const shelterQuality = tribe.resources.shelter;
    const healthGain = 5 + Math.floor(shelterQuality / 20); // 5-10 health gain
    
    // Gain health
    const oldHealth = this.player.health;
    this.player.health = Math.min(100, this.player.health + healthGain);
    
    // Publish health changed event
    eventManager.publish(GameEvents.HEALTH_CHANGED, {
      survivorId: this.player.id,
      health: this.player.health,
      change: this.player.health - oldHealth
    });
    
    return true;
  }
  
  /**
   * Update tribe health based on current resources
   */
  updateTribeHealth() {
    this.tribes.forEach(tribe => {
      tribe.members.forEach(member => {
        if (member.isPlayer) return; // Player health is handled separately
        
        // Base health decay
        let healthChange = -5;
        
        // Adjust based on tribe resources
        const resources = tribe.resources;
        if (resources.food > 50) healthChange += 2;
        if (resources.water > 50) healthChange += 2;
        if (resources.fire > 50) healthChange += 1;
        if (resources.shelter > 50) healthChange += 1;
        
        // Apply change
        member.health = Math.max(0, Math.min(100, member.health + healthChange));
        
        // Publish health changed event
        eventManager.publish(GameEvents.HEALTH_CHANGED, {
          survivorId: member.id,
          health: member.health,
          change: healthChange
        });
      });
      
      // Natural resource decay
      tribe.resources.food = Math.max(0, tribe.resources.food - 15);
      tribe.resources.water = Math.max(0, tribe.resources.water - 10);
      tribe.resources.fire = Math.max(0, tribe.resources.fire - 5);
      tribe.resources.shelter = Math.max(0, tribe.resources.shelter - 3);
    });
  }
  
  /**
   * Check if tribes should merge or shuffle
   */
  checkForMerge() {
    if (this.isMerged) return;
    
    const totalSurvivors = this.tribes.reduce((sum, tribe) => sum + tribe.members.length, 0);
    
    // Merge when we reach merge threshold
    if (totalSurvivors <= this.mergeAt) {
      this.mergeTribes();
      return;
    }
    
    // If we haven't shuffled yet and we're below a certain threshold, shuffle tribes
    if (!this.isTribesShuffled && this.tribeCount > 2 && totalSurvivors <= 14) {
      this.shuffleTribes(2);
    }
  }
  
  /**
   * Shuffle players into a new number of tribes
   * @param {number} newTribeCount - The new number of tribes
   */
  shuffleTribes(newTribeCount) {
    if (newTribeCount < 1) {
      console.error('New tribe count must be at least 1');
      return;
    }
    
    // Collect all survivors
    const allSurvivors = [];
    this.tribes.forEach(tribe => {
      allSurvivors.push(...tribe.members);
    });
    
    // Save old tribe count
    const oldTribeCount = this.tribes.length;
    
    // Update tribe count
    this.tribeCount = newTribeCount;
    
    // Create new tribes
    this.createTribes();
    
    // Mark as shuffled
    this.isTribesShuffled = true;
    
    // Publish tribe shuffled event
    eventManager.publish(GameEvents.TRIBE_SHUFFLED, {
      oldTribeCount,
      newTribeCount,
      tribes: this.tribes
    });
    
    console.log(`Tribes shuffled from ${oldTribeCount} to ${newTribeCount}`);
  }
  
  /**
   * Clear immunity from all survivors
   */
  clearImmunity() {
    this.tribes.forEach(tribe => {
      tribe.members.forEach(member => {
        member.hasImmunity = false;
      });
    });
  }
  
  /**
   * Eliminate a survivor
   * @param {Object} survivor - The survivor to eliminate
   */
  eliminateSurvivor(survivor) {
    if (!survivor) {
      console.error('No survivor provided');
      return;
    }
    
    // Find the survivor's tribe
    const tribe = this.tribes.find(t => 
      t.members.some(member => member.id === survivor.id)
    );
    
    if (!tribe) {
      console.error('Survivor not found in any tribe');
      return;
    }
    
    // Remove from tribe
    tribe.members = tribe.members.filter(member => member.id !== survivor.id);
    
    // Add to jury if merge has happened
    if (this.isMerged) {
      this.jury.push(survivor);
    }
    
    // Publish survivor eliminated event
    eventManager.publish(GameEvents.SURVIVOR_ELIMINATED, {
      eliminatedSurvivor: survivor,
      tribe: tribe.id,
      addedToJury: this.isMerged
    });
    
    console.log(`Survivor ${survivor.name} eliminated`);
    
    // If player is eliminated, game over
    if (survivor.isPlayer) {
      this.setGameState(GameState.GAME_OVER);
    }
  }
  
  /**
   * Get the jury members
   * @returns {Array} The jury members
   */
  getJury() {
    return this.jury;
  }
  
  /**
   * Save the current game state
   */
  saveGame() {
    const gameData = {
      gameState: this.gameState,
      gamePhase: this.gamePhase,
      day: this.day,
      tribes: this.tribes,
      player: this.player,
      jury: this.jury,
      finalists: this.finalists,
      winner: this.winner,
      tribeCount: this.tribeCount,
      isTribesShuffled: this.isTribesShuffled,
      isMerged: this.isMerged,
      gameSettings: this.gameSettings,
      timestamp: Date.now()
    };
    
    const success = saveToLocalStorage(SAVE_GAME_KEY, gameData);
    
    if (success) {
      console.log('Game saved');
      eventManager.publish(GameEvents.GAME_SAVED, { timestamp: gameData.timestamp });
    } else {
      console.error('Failed to save game');
    }
    
    return success;
  }
  
  /**
   * Load a saved game
   */
  loadGame() {
    const gameData = loadFromLocalStorage(SAVE_GAME_KEY);
    
    if (!gameData) {
      console.error('No saved game found');
      return false;
    }
    
    // Restore game state
    this.gameState = gameData.gameState;
    this.gamePhase = gameData.gamePhase;
    this.day = gameData.day;
    this.tribes = gameData.tribes;
    this.player = gameData.player;
    this.jury = gameData.jury || [];
    this.finalists = gameData.finalists || [];
    this.winner = gameData.winner || null;
    this.tribeCount = gameData.tribeCount;
    this.isTribesShuffled = gameData.isTribesShuffled;
    this.isMerged = gameData.isMerged;
    this.gameSettings = gameData.gameSettings;
    
    // Update the UI based on the loaded state
    this._updateScreenForState(this.gameState);
    
    // Publish game loaded event
    eventManager.publish(GameEvents.GAME_LOADED, { timestamp: gameData.timestamp });
    
    console.log('Game loaded');
    return true;
  }
  
  /**
   * Check if there's a saved game
   * @returns {boolean} Whether there's a saved game
   */
  hasSavedGame() {
    const gameData = loadFromLocalStorage(SAVE_GAME_KEY);
    return !!gameData;
  }
  
  /**
   * Show game over screen
   */
  showGameOverScreen() {
    this.setGameState(GameState.GAME_OVER);
  }
}

// Create and export singleton instance
const gameManager = new GameManager();
export default gameManager;