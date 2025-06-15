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
import { MAX_WATER, MAX_HUNGER } from '../data/GameData.js';
import RelationshipSystem from '../systems/RelationshipSystem.js';

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

export const GamePhase = {
  PRE_GAME: 'preGame',
  PRE_CHALLENGE: 'preChallenge',
  CHALLENGE: 'challenge',
  POST_CHALLENGE: 'postChallenge',
  TRIBAL_COUNCIL: 'tribalCouncil',
  NIGHT: 'night'
};

const SAVE_GAME_KEY = 'survivorIsland.saveGame';

class GameManager {
  constructor() {
    this.isInitialized = false;
    this.gameState = GameState.INITIALIZING;
    this.gamePhase = GamePhase.PRE_GAME;
    this.day = 1;
    this.tribes = [];
    this.tribeCount = 2;
    this.survivors = [];
    this.player = null;
    this.jury = [];
    this.finalists = [];
    this.winner = null;
    this.mergeAt = 12;
    this.isTribesShuffled = false;
    this.isMerged = false;
    this.gameSettings = {
      enableIdols: true,
      enableAdvantages: true,
      difficultyLevel: 'normal',
      tribeCount: 2
    };
    this.systems = {};
    this.dayTimer = 7200;     // 2 hours in seconds
    this.timeSpeed = 8;       // countdown rate per tick
  }

  initialize() {
    if (this.isInitialized) return;
    eventManager.clear();
    eventManager.setDebug(false);
    screenManager.initialize();
    timerManager.clearAll();

    // Initialize relationship system
    this.systems.relationshipSystem = new RelationshipSystem(this);
    this.systems.relationshipSystem.initialize();

    this.gameState = GameState.WELCOME;
    this.isInitialized = true;
    eventManager.publish(GameEvents.GAME_INITIALIZED);
  }

  registerSystem(systemName, system) {
    this.systems[systemName] = system;
    if (system.initialize) system.initialize();
  }

  startNewGame(settings = {}) {
    this.gameSettings = { ...this.gameSettings, ...settings };
    this.tribeCount = this.gameSettings.tribeCount;
    this.resetGameState();
    this.survivors = [...GameData.getSurvivors()];
    this.setGameState(GameState.CHARACTER_SELECTION);
    eventManager.publish(GameEvents.GAME_STARTED, { settings: this.gameSettings });
  }

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
    this.dayTimer = 7200;
    this.timeSpeed = 8;
    Object.values(this.systems).forEach(system => {
      if (system.reset) system.reset();
    });
  }

  setGameState(newState) {
    if (!Object.values(GameState).includes(newState)) return;
    const oldState = this.gameState;
    this.gameState = newState;
    this._updateScreenForState(newState);
    eventManager.publish(GameEvents.GAME_STATE_CHANGED, { oldState, newState });
  }

  _updateScreenForState(state) {
    const map = {
      welcome: 'welcome',
      characterSelection: 'character-selection',
      tribeDivision: 'tribe-division',
      camp: 'camp',
      challenge: 'challenge-screen',
      tribalCouncil: 'tribal-council',
      fireMaking: 'fire-making-challenge',
      finale: 'finale',
      gameOver: 'game-over'
    };
    const screenId = map[state];
    if (screenId) screenManager.showScreen(screenId);
  }

  selectCharacter(survivor) {
    if (!survivor) return;
    survivor.isPlayer = true;
    this.player = survivor;
    eventManager.publish(GameEvents.CHARACTER_SELECTED, { survivor });
    this.setGameState(GameState.TRIBE_DIVISION);
  }

  createTribes() {
    const survivors = [...this.survivors];
    const allTribeNames = GameData.getTribeNames();
    const tribeCount = this.tribeCount;
    const colorPool = ['red', 'orange', 'blue', 'purple', 'green'];

    // Shuffle tribe names and survivors
    const shuffledNames = [...allTribeNames].sort(() => Math.random() - 0.5).slice(0, tribeCount);
    const shuffledSurvivors = survivors.sort(() => Math.random() - 0.5);

    // Ensure red + orange aren’t both selected
    let chosenColors;
    while (true) {
      const shuffledColors = [...colorPool].sort(() => Math.random() - 0.5);
      chosenColors = shuffledColors.slice(0, tribeCount);
      if (!(chosenColors.includes('red') && chosenColors.includes('orange'))) break;
    }

    this.tribes = [];

    const perTribe = Math.floor(survivors.length / tribeCount);
    let remainder = survivors.length % tribeCount;
    let index = 0;

    for (let i = 0; i < tribeCount; i++) {
      const size = perTribe + (remainder-- > 0 ? 1 : 0);
      const members = shuffledSurvivors.slice(index, index + size);
      index += size;

      this.tribes.push({
        id: i + 1,
        tribeName: shuffledNames[i].name,
        tribeColor: chosenColors[i],
        members,
        resources: { fish: 0, fish1: 0, fish2: 0, fish3: 0, water: 50, fire: 75, shelter: 60 },
        fire: 0,
        shelter: 0,
        immunityWins: 0,
        rewardWins: 0,
        attributes: this._calculateTribeAttributes(members)
      });
    }

    eventManager.publish(GameEvents.TRIBES_CREATED, { tribes: this.tribes });
  }

  _calculateTribeAttributes(members) {
    const total = (key) => members.reduce((sum, m) => sum + m[key], 0);
    const len = members.length || 1;
    return {
      physical: Math.round(total('physical') / len),
      mental: Math.round(total('mental') / len),
      social: Math.round(total('personality') / len),
      teamwork: 50,
      morale: 50
    };
  }

  getPlayerTribe() {
    return this.tribes.find(t => t.members.some(m => m.id === this.player?.id));
  }

  getPlayerSurvivor() {
    return this.player;
  }

  getTribes() {
    return this.tribes;
  }

  getGamePhase() {
    return this.gamePhase;
  }

  getGameState() {
    return this.gameState;
  }

  getDay() {
    return this.day;
  }

  advanceDay() {
    this.day++;
    this.updateTribeHealth();
    this.checkForMerge();
    eventManager.publish(GameEvents.DAY_ADVANCED, { day: this.day });
  }

  advanceGamePhase() {
    const phaseOrder = [
      GamePhase.PRE_CHALLENGE,
      GamePhase.CHALLENGE,
      GamePhase.POST_CHALLENGE,
      GamePhase.TRIBAL_COUNCIL,
      GamePhase.NIGHT
    ];

    const currentIndex = phaseOrder.indexOf(this.gamePhase);
    const nextIndex = (currentIndex + 1) % phaseOrder.length;
    const nextPhase = phaseOrder[nextIndex];

    this.gamePhase = nextPhase;
    eventManager.publish(GameEvents.GAME_PHASE_CHANGED, { phase: nextPhase });

    // Optional: load the screen based on phase
    if (nextPhase === GamePhase.CHALLENGE) {
      this.setGameState(GameState.CHALLENGE);
    } else if (nextPhase === GamePhase.TRIBAL_COUNCIL) {
      this.setGameState(GameState.TRIBAL_COUNCIL);
    } else if (nextPhase === GamePhase.NIGHT) {
      this.advanceDay(); // Move to next day
      this.setGameState(GameState.CAMP);
      this.gamePhase = GamePhase.PRE_CHALLENGE;
    } else {
      this.setGameState(GameState.CAMP); // fallback screen
    }
  }

  updateTribeHealth() {
    this.tribes.forEach(tribe => {
      tribe.members.forEach(member => {
        if (member.isPlayer) return;
        let healthChange = -5;
        const { food, water, fire, shelter } = tribe.resources;
        if (food > 50) healthChange += 2;
        if (water > 50) healthChange += 2;
        if (fire > 50) healthChange += 1;
        if (shelter > 50) healthChange += 1;
        member.health = Math.max(0, Math.min(100, member.health + healthChange));
        eventManager.publish(GameEvents.HEALTH_CHANGED, {
          survivorId: member.id,
          health: member.health,
          change: healthChange
        });
      });
      tribe.resources.food = Math.max(0, tribe.resources.food - 15);
      tribe.resources.water = Math.max(0, tribe.resources.water - 10);
      tribe.resources.fire = Math.max(0, tribe.resources.fire - 5);
      tribe.resources.shelter = Math.max(0, tribe.resources.shelter - 3);
    });
  }

  checkForMerge() {
    if (this.isMerged) return;
    const total = this.tribes.reduce((sum, t) => sum + t.members.length, 0);
    if (total <= this.mergeAt) {
      this.mergeTribes();
    } else if (!this.isTribesShuffled && this.tribeCount > 2 && total <= 14) {
      this.shuffleTribes(2);
    }
  }

  mergeTribes() {
    const allMembers = this.tribes.flatMap(t => t.members);
    this.tribes = [{
      id: 1,
      tribeName: "Merged Tribe",
      tribeColor: "#FFC107",
      members: allMembers,
      resources: { fish: 50, fish1: 0, fish2: 0, fish3: 0, water: 75, fire: 100, shelter: 80 },
      fire: 0,
      shelter: 0,
      immunityWins: 0,
      rewardWins: 0,
      attributes: this._calculateTribeAttributes(allMembers)
    }];
    this.isMerged = true;
    eventManager.publish(GameEvents.TRIBES_MERGED, { mergedTribe: this.tribes[0] });
  }

  eliminateSurvivor(survivor) {
    if (!survivor) return;
    const tribe = this.tribes.find(t => t.members.some(m => m.id === survivor.id));
    if (!tribe) return;
    tribe.members = tribe.members.filter(m => m.id !== survivor.id);
    if (this.isMerged) this.jury.push(survivor);
    eventManager.publish(GameEvents.SURVIVOR_ELIMINATED, {
      eliminatedSurvivor: survivor,
      tribe: tribe.id,
      addedToJury: this.isMerged
    });
    if (survivor.isPlayer) this.setGameState(GameState.GAME_OVER);
  }

  decreaseWaterForAll(amount) {
    if (!this.survivors) return;

    this.survivors.forEach(survivor => {
      if (typeof survivor.water === 'number') {
        survivor.water = Math.max(0, survivor.water - amount);
      }
    });
  }

  decreaseHungerForAll(amount) {
    if (!this.survivors) return;

    this.survivors.forEach(survivor => {
      if (typeof survivor.hunger === 'number') {
        survivor.hunger = Math.max(0, survivor.hunger - amount);
      }
    });
  }

  decreaseRestForAll(amount) {
    if (!this.survivors) return;

    this.survivors.forEach(survivor => {
      if (typeof survivor.rest === 'number') {
        survivor.rest = Math.max(0, survivor.rest - amount);
      }
    });
  }

  getDayTimer() {
    return this.dayTimer;
  }

  getTimeSpeed() {
    return this.timeSpeed;
  }

  decreaseDayTimer() {
    this.dayTimer = Math.max(0, this.dayTimer - this.timeSpeed);
  }

  deductTime(seconds) {
    this.dayTimer = Math.max(0, this.dayTimer - seconds);
  }

  getCurrentDay() {
    return this.day;
  }

  saveGame() {
    const data = {
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
    const success = saveToLocalStorage(SAVE_GAME_KEY, data);
    if (success) eventManager.publish(GameEvents.GAME_SAVED, { timestamp: data.timestamp });
    return success;
  }

  loadGame() {
    const data = loadFromLocalStorage(SAVE_GAME_KEY);
    if (!data) return false;
    Object.assign(this, data);
    this._updateScreenForState(this.gameState);
    eventManager.publish(GameEvents.GAME_LOADED, { timestamp: data.timestamp });
    return true;
  }

  hasSavedGame() {
    return !!loadFromLocalStorage(SAVE_GAME_KEY);
  }

  showGameOverScreen() {
    this.setGameState(GameState.GAME_OVER);
  }

  // Calculate total fish for a survivor from individual fish types
  calculateTotalFish(survivor) {
    if (!survivor) return 0;
    const fish1 = survivor.fish1 || 0;
    const fish2 = survivor.fish2 || 0;
    const fish3 = survivor.fish3 || 0;
    return fish1 + fish2 + fish3;
  }

  // Update survivor's total fish count
  updateSurvivorTotalFish(survivor) {
    if (!survivor) return;
    survivor.fish = this.calculateTotalFish(survivor);
  }

  // Calculate total tribe fish from all members
  calculateTribeFish(tribe) {
    if (!tribe || !tribe.members) return { fish: 0, fish1: 0, fish2: 0, fish3: 0 };

    const totals = { fish: 0, fish1: 0, fish2: 0, fish3: 0 };
    tribe.members.forEach(member => {
      totals.fish1 += member.fish1 || 0;
      totals.fish2 += member.fish2 || 0;
      totals.fish3 += member.fish3 || 0;
    });
    totals.fish = totals.fish1 + totals.fish2 + totals.fish3;

    return totals;
  }

  // Get relationship value between two survivors
  getRelationshipValue(id1, id2) {
    if (!this.systems.relationshipSystem) return 50; // Default neutral value
    const relationship = this.systems.relationshipSystem.getRelationship(id1, id2);
    return relationship ? relationship.value : 50;
  }

  // Update health for all survivors based on their stats
  updateHealthForAll() {
    if (!this.survivors) return;

    this.survivors.forEach(survivor => {
      this.updateSurvivorHealth(survivor);
    });
  }

  // Calculate and update health for a single survivor
  updateSurvivorHealth(survivor) {
    if (!survivor) return;

    const water = survivor.water || 0;
    const hunger = survivor.hunger || 0;
    const rest = survivor.rest || 0;

    // Health calculation: average of water, hunger, and rest
    // Each stat contributes equally to health
    const calculatedHealth = Math.round((water + hunger + rest) / 3);
    
    // Ensure health stays within 0-100 bounds
    survivor.health = Math.max(0, Math.min(100, calculatedHealth));

    console.log(`Updated health for ${survivor.name}: ${survivor.health} (water: ${water}, hunger: ${hunger}, rest: ${rest})`);
  }
}

const gameManager = new GameManager();
export default gameManager;