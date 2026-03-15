/**
 * @module GameManager
 * Central manager for game state and systems
 */

import eventManager, { GameEvents } from './EventManager.js';
import screenManager from './ScreenManager.js';
import { GameData } from '../data/index.js';
import { loadFromLocalStorage, saveToLocalStorage } from '../utils/StorageUtils.js';
import { deepCopy, shuffleArray } from '../utils/CommonUtils.js';
import timerManager from '../utils/TimerManager.js';
import { MAX_WATER, MAX_HUNGER } from '../data/GameData.js';
import { updateCampClockUI } from '../utils/ClockUtils.js';
import socialEngine from '../systems/SocialEngine.js';
import socialMemorySystem from '../systems/SocialMemorySystem.js';
import strategyPhaseSystem from '../systems/StrategyPhaseSystem.js';
import TaskSystem from '../systems/TaskSystem.js';
import TaskSimulationSystem from '../systems/TaskSimulationSystem.js';

// ⭐ SAFE SINGLETON IMPORT — NO circular dependency
import { ConversationSystem } from '../systems/index.js';
import { canRunDay1FirstImpressions } from '../events/Day1FirstImpressionsEvent.js';

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
    this.journey = null;
    this.jury = [];
    this.finalists = [];
    this.winner = null;
    this.mergeAt = 12;
    this.isTribesShuffled = false;
    this.isMerged = false;
    this.flags = { day1FirstImpressionsCompleted: false };
    this.campLog = [];
    this.gameHistory = { tribals: [] };
    this.tribalCouncilLog = [];
    this.state = {};
    this.postChallengeMode = 'playable';
    // Tracks whether the player stepped into an early leadership role (e.g., Day 1 First Impressions)
    // Set to true when those events mark the player as the top leader.
    this.flags.playerIsLeader = false;
    this.gameSettings = {
      enableIdols: true,
      enableAdvantages: true,
      difficultyLevel: 'normal',
      tribeCount: 2
    };
    this.systems = {};
    this.dayTimer = 7200;     // 2 hours in seconds
    this.timeSpeed = 8;       // countdown rate per tick
    this.taskSystem = new TaskSystem(this);
    this.systems.taskSimulationSystem = new TaskSimulationSystem(this);
    this._missingTrustSystemWarned = false;
  }

  initialize() {
    if (this.isInitialized) return;

    // Systems are registered/initialized in main.js; GameManager.initialize should not re-initialize them.
    eventManager.clear();
    eventManager.setDebug(false);
    screenManager.initialize();
    this._attachTribalCompleteListener();

    timerManager.clearAll();

    // Initialize social systems
    this.systems.socialMemorySystem = socialMemorySystem;
    this.systems.socialEngine = socialEngine;
    this.systems.strategyPhaseSystem = strategyPhaseSystem;
    // Initialize conversation system
    this.systems.conversationSystem = new ConversationSystem(this);
    this.systems.conversationSystem.initialize();
    if (typeof this.systems.strategyPhaseSystem.initialize === 'function') {
      this.systems.strategyPhaseSystem.initialize();
    }

    this.gameState = GameState.WELCOME;
    this.isInitialized = true;
    eventManager.publish(GameEvents.GAME_INITIALIZED);
  }


  _attachTribalCompleteListener() {
    if (this._tribalCompleteListenerAttached) return;
    this._tribalCompleteListenerAttached = true;

    eventManager.subscribe(GameEvents.TRIBAL_COUNCIL_COMPLETE, (tribalSummary = {}) => {
      this.handleTribalCouncilComplete(tribalSummary);
    });
  }


  handleTribalCouncilComplete(tribalSummary = {}) {
    if (!this.gameHistory) this.gameHistory = { tribals: [] };
    if (!Array.isArray(this.gameHistory.tribals)) this.gameHistory.tribals = [];
    if (!Array.isArray(this.tribalCouncilLog)) this.tribalCouncilLog = [];

    const canonicalEntry = this._buildTribalLogEntry(tribalSummary);
    this.gameHistory.tribals.push(canonicalEntry);
    this.tribalCouncilLog.push(canonicalEntry);

    console.log('[GameManager] handleTribalCouncilComplete', {
      day: canonicalEntry.day,
      attendingTribeId: canonicalEntry.attendingTribeId,
      eliminatedId: canonicalEntry.eliminatedId,
      initialTie: canonicalEntry.initialTie,
      revoteOccurred: canonicalEntry.revoteOccurred,
      wasRockDraw: canonicalEntry.wasRockDraw
    });

    if (canonicalEntry.wasTie) {
      console.log('[TribalCouncil] Tie detected:', {
        revoteVotes: canonicalEntry.revoteVotes,
        rockDrawEligible: canonicalEntry.rockDrawEligible,
        rockDrawEliminatedId: canonicalEntry.rockDrawEliminatedId,
        forcedResolution: canonicalEntry.forcedResolution
      });
    }

    if (canonicalEntry.eliminatedId) {
      const alreadyOut = this.survivors?.find(s => s.id === canonicalEntry.eliminatedId)?.isOut === true;
      if (alreadyOut) {
        console.warn('[GameManager] Skipping duplicate elimination; survivor already out', {
          eliminatedId: canonicalEntry.eliminatedId
        });
      } else {
        this.eliminateSurvivor(canonicalEntry.eliminatedId, 'vote');
      }
    }

    if (this.systems.dealConsequencesSystem?.initialize) {
      this.systems.dealConsequencesSystem.initialize();
    }
    this.systems.dealSystem?.processTribalOutcome?.(canonicalEntry, this);
    this.systems.allianceSystem?.processPostTribalFallout?.(canonicalEntry, this);
    console.log('[GameManager] Tribal consequences processed', {
      dealsProcessed: Boolean(this.systems.dealSystem?.processTribalOutcome),
      allianceFalloutProcessed: Boolean(this.systems.allianceSystem?.processPostTribalFallout)
    });

    const playerId = this.player?.id;
    const playerEliminated = Boolean(playerId && canonicalEntry.eliminatedId === playerId);
    const juryInactive = !this.isMerged;

    if (playerEliminated && juryInactive) {
      this.showGameOverScreen();
      return;
    }

    this.consumeVotePenaltiesAfterTribal(canonicalEntry.membersAtTribal.map(member => member.id));

    this.advanceDay();
    this.gamePhase = GamePhase.PRE_CHALLENGE;
    this.dayTimer = 7200;
    this.setGameState(GameState.CAMP);
    console.log('[GameManager] Tribal complete -> next day/camp transition complete', {
      day: this.day,
      gamePhase: this.gamePhase,
      gameState: this.gameState
    });
  }

  _buildTribalLogEntry(tribalSummary = {}) {
    const tribes = this.getTribes?.() || this.tribes || [];
    const survivors = this.survivors || [];
    const attendingTribeId = tribalSummary.attendingTribeId ?? tribalSummary.tribeId ?? null;
    const tribe = tribes.find(candidate => String(candidate?.tribeId ?? candidate?.id) === String(attendingTribeId)) || null;
    const getName = (id) => {
      if (!id) return null;
      return survivors.find(member => member.id === id)?.name
        || tribe?.members?.find(member => member.id === id)?.name
        || id;
    };

    const membersAtTribal = (tribalSummary.membersAtTribal && tribalSummary.membersAtTribal.length > 0)
      ? tribalSummary.membersAtTribal.map(member => ({
        id: member?.id || null,
        name: member?.name || getName(member?.id) || member?.id || 'Unknown'
      }))
      : (tribe?.members || [])
        .filter(member => !member.isOut)
        .map(member => ({ id: member.id, name: member.name || getName(member.id) || member.id }));

    return {
      id: `tribal_${tribalSummary.createdAt || Date.now()}`,
      day: tribalSummary.day ?? this.day,
      attendingTribeId,
      tribeName: tribe?.tribeName || tribe?.name || null,
      membersAtTribal,
      votes: (tribalSummary.votes || []).map(vote => ({
        voterId: vote.voterId,
        voterName: vote.voterName || getName(vote.voterId),
        targetId: vote.targetId,
        targetName: vote.targetName || getName(vote.targetId),
        nullified: vote.nullified ?? vote.wasNullified ?? false
      })),
      initialVotes: (tribalSummary.initialVotes || tribalSummary.votes || [])
        .filter(vote => vote.phase !== 'revote')
        .map(vote => ({
          voterId: vote.voterId,
          voterName: vote.voterName || getName(vote.voterId),
          targetId: vote.targetId,
          targetName: vote.targetName || getName(vote.targetId),
          nullified: vote.nullified ?? vote.wasNullified ?? false,
          phase: vote.phase || 'initial'
        })),
      revoteVotes: (tribalSummary.revoteVotes || []).map(vote => ({
        voterId: vote.voterId,
        voterName: vote.voterName || getName(vote.voterId),
        targetId: vote.targetId,
        targetName: vote.targetName || getName(vote.targetId),
        nullified: vote.nullified ?? vote.wasNullified ?? false
      })),
      rockDrawEligible: (tribalSummary.rockDrawEligible || []).map(entry => ({
        id: entry.id || entry,
        name: entry.name || getName(entry.id || entry) || 'Unknown'
      })),
      rockDrawEliminatedId: tribalSummary.rockDrawEliminatedId || null,
      idolPlays: (tribalSummary.idolPlays || []).map(play => ({
        playerId: play.playerId || play.playedById || null,
        playerName: play.playerName || getName(play.playerId || play.playedById) || 'Unknown',
        targetId: play.targetId || play.playedOnId || null,
        targetName: play.targetName || getName(play.targetId || play.playedOnId) || 'Unknown',
        successful: Boolean(play.successful)
      })),
      shotResults: (tribalSummary.shotResults || []).map(result => ({
        playerId: result.playerId || null,
        playerName: result.playerName || getName(result.playerId) || 'Unknown',
        success: Boolean(result.success),
        gainedImmunity: Boolean(result.gainedImmunity)
      })),
      initialCounts: { ...(tribalSummary.initialCounts || tribalSummary.initialTally || {}) },
      initialTally: { ...(tribalSummary.initialCounts || tribalSummary.initialTally || {}) },
      revoteCounts: tribalSummary.revoteCounts ? { ...(tribalSummary.revoteCounts || {}) } : (tribalSummary.revoteTally ? { ...(tribalSummary.revoteTally || {}) } : null),
      revoteTally: tribalSummary.revoteCounts ? { ...(tribalSummary.revoteCounts || {}) } : (tribalSummary.revoteTally ? { ...(tribalSummary.revoteTally || {}) } : null),
      decidingCounts: tribalSummary.decidingCounts ? { ...(tribalSummary.decidingCounts || {}) } : (tribalSummary.decidingTally ? { ...(tribalSummary.decidingTally || {}) } : null),
      decidingTally: tribalSummary.decidingCounts ? { ...(tribalSummary.decidingCounts || {}) } : (tribalSummary.decidingTally ? { ...(tribalSummary.decidingTally || {}) } : null),
      eliminatedId: tribalSummary.eliminatedId || null,
      eliminatedName: tribalSummary.eliminatedName || getName(tribalSummary.eliminatedId) || null,
      wasTie: Boolean(tribalSummary.wasTie),
      initialTie: Boolean(tribalSummary.initialTie),
      revoteOccurred: Boolean(tribalSummary.revoteOccurred),
      wasRockDraw: Boolean(tribalSummary.rockDrawOccurred),
      forcedResolution: Boolean(tribalSummary.forcedResolution),
      jeffCommentary: tribalSummary.jeffCommentary || null,
      majorityThreshold: tribalSummary.majorityThreshold || 0,
      createdAt: tribalSummary.createdAt || Date.now()
    };
  }

  // ----------------------------
  // NPC LOCATION PHASE HOOK
  // ----------------------------
  attachNpcLocationPhaseHook() {
    eventManager.subscribe(GameEvents.GAME_PHASE_CHANGED, ({ phase }) => {

      // Only assign NPC positions once player is actually in CAMP
      if (this.gameState !== GameState.CAMP) return;

      // PRE-CHALLENGE (morning camp)
      if (phase === GamePhase.PRE_CHALLENGE) {
        this.systems.npcLocationSystem.assignLocationsForPhase(this.survivors, this.gamePhase);
      }

      // POST-CHALLENGE (strategy camp)
      if (phase === GamePhase.POST_CHALLENGE) {
        this.systems.npcLocationSystem.assignLocationsForPhase(this.survivors, this.gamePhase);
      }
    });
  }

  // ----------------------------------
  // SOCIAL ENGINE PHASE HOOK
  // ----------------------------------
  // This triggers SocialEngine ONLY when in CAMP and phase changes
  // (Prevents accidental NPC conversations on the Welcome screen)
  // ----------------------------------
  attachSocialEnginePhaseHook() {
    eventManager.subscribe(GameEvents.GAME_PHASE_CHANGED, ({ phase }) => {
      // Only activate inside the camp
      if (this.gameState !== GameState.CAMP) return;

      if (phase === GamePhase.PRE_CHALLENGE) {
        this.systems.socialEngine.resetForNewPhase("pre");
      }

      if (phase === GamePhase.POST_CHALLENGE) {
        this.systems.socialEngine.resetForNewPhase("post");
      }
    });
  }

  registerSystem(systemName, system) {
    this.systems[systemName] = system;
    if (system.initialize) system.initialize();
  }

  startNewGame(settings = {}) {
    this.gameSettings = { ...this.gameSettings, ...settings };
    this.tribeCount = this.gameSettings.tribeCount;
    this.resetGameState();
    this.survivors = GameData.getSurvivors().map(survivor => ({
      ...survivor,
      laziness: survivor.laziness ?? 0
    }));

    // ⭐ Reinitialize ConversationSystem for the new game
    if (this.systems.conversationSystem) {
      if (typeof this.systems.conversationSystem.reset === "function") {
        this.systems.conversationSystem.reset();
      }
      if (typeof this.systems.conversationSystem.initialize === "function") {
        this.systems.conversationSystem.initialize();
      }
    }
    this.attachSocialEnginePhaseHook(); // Attach phase listener at game start
    this.attachNpcLocationPhaseHook();
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
    this.flags = { day1FirstImpressionsCompleted: false };
    this.postChallengeMode = 'playable';
    this.campLog = [];
    this.gameHistory = { tribals: [] };
    this.tribalCouncilLog = [];
    this.state = {};
    this.gamePhase = GamePhase.PRE_GAME;
    this.dayTimer = 7200;
    this.timeSpeed = 8;
    Object.values(this.systems).forEach(system => {
      if (system.reset) system.reset();
    });
  }

  ensureStockpileExists(tribe) {
    if (!tribe) return null;
    tribe.stockpile = tribe.stockpile || {
      firewood: 0,
      bamboo: 0,
      palms: 0,
      water: 0,
      coconuts: 0,
      fish1: 0,
      fish2: 0,
      fish3: 0
    };
    return tribe.stockpile;
  }

  addToStockpile(tribe, type, amount = 0) {
    if (!tribe || !type || typeof amount !== 'number') return 0;
    const stockpile = this.ensureStockpileExists(tribe);
    const safeAmount = Math.max(0, amount);
    if (stockpile[type] === undefined) {
      stockpile[type] = 0;
    }
    stockpile[type] += safeAmount;
    return stockpile[type];
  }

  consumeFromStockpile(tribe, type, amount = 0) {
    if (!tribe || !type || typeof amount !== 'number') return false;
    const stockpile = this.ensureStockpileExists(tribe);
    const safeAmount = Math.max(0, amount);
    if (stockpile[type] === undefined) {
      stockpile[type] = 0;
    }
    if (stockpile[type] < safeAmount) {
      return false;
    }
    stockpile[type] = Math.max(0, stockpile[type] - safeAmount);
    return true;
  }

  setGameState(newState) {
    if (!Object.values(GameState).includes(newState)) return;
    const oldState = this.gameState;
    this.gameState = newState;

    // If entering camp, activate social engine + NPC placement immediately
    if (newState === GameState.CAMP) {

      // Set initial camp phase if still in the pre-game placeholder
      // Root cause: Day 1 event gating expected PRE_CHALLENGE, but we stayed in PRE_GAME after loading camp
      if (this.gamePhase === GamePhase.PRE_GAME) {
        this.gamePhase = GamePhase.PRE_CHALLENGE;
      }

      if (oldState !== GameState.CAMP) {
        this.systems?.idolSystem?.startNewCampPhase?.('enterCamp');
        this.systems?.idolSystem?.spawnInitialForAllTribes?.();
      }

      const gate = canRunDay1FirstImpressions?.(this);
      const shouldBlockCampSystems = !!gate?.ok;

      if (shouldBlockCampSystems) {
        this.flags = this.flags || {};
        this.flags.campEventActive = true;
        console.info('[GameManager] Camp systems paused for pending camp event', gate);
      }

      // Notify all systems that the camp phase has begun
      eventManager.publish(GameEvents.GAME_PHASE_CHANGED, {
        phase: this.gamePhase
      });

      if (!this.flags?.campEventActive) {
        this.systems.npcLocationSystem.assignLocationsForPhase(this.survivors, this.gamePhase);

        if (this.gamePhase === GamePhase.PRE_CHALLENGE) {
          this.systems.socialEngine.resetForNewPhase("pre");
        }
        if (this.gamePhase === GamePhase.POST_CHALLENGE) {
          this.systems.socialEngine.resetForNewPhase("post");
        }
      }

    }

    this._updateScreenForState(newState);
    eventManager.publish(GameEvents.GAME_STATE_CHANGED, { oldState, newState });
  }

  _updateScreenForState(state) {
    const map = {
      welcome: 'welcome',
      characterSelection: 'character-selection',
      tribeDivision: 'tribe-division',
      camp: 'camp',
      challenge: 'challenge',
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

  createTribes(options = {}) {
    const mode = options.mode || this.gameMode || '2-tribe';
    const requestedCount = Number(options.tribeCount || this.tribeCount || 2);
    const tribeCount = requestedCount === 3 ? 3 : 2;
    const survivors = [...(options.survivors || this.survivors || [])];
    const constraints = options.constraints || {};
    const minTribeSize = Number(constraints.minTribeSize || 1);
    const disallowRedOrangeTogether = constraints.disallowRedOrangeTogether !== false;
    const allTribeNames = GameData.getTribeNames();
    const colorPool = ['red', 'orange', 'blue', 'purple', 'green'];

    this.tribeCount = tribeCount;

    const tribeNames = this._resolveTribeNames({ mode, tribeCount, allTribeNames });
    const chosenColors = this._pickTribeColors({ colorPool, tribeCount, disallowRedOrangeTogether });
    const groupedMembers = this._buildRequestedTribeGroups({ mode, tribeCount, survivors, minTribeSize });

    this.tribes = groupedMembers.map((members, i) => {
      const tribeName = tribeNames[i];
      const tribeColor = chosenColors[i];
      const tribe = {
        id: i + 1,
        tribeId: i + 1,
        tribeName,
        tribeColor,
        name: tribeName,
        color: tribeColor,
        members,
        resources: { fish: 0, fish1: 0, fish2: 0, fish3: 0, water: 50, fire: 75, shelter: 60 },
        fire: 0,
        shelter: 0,
        immunityWins: 0,
        rewardWins: 0,
        attributes: this._calculateTribeAttributes(members)
      };

      members.forEach(member => {
        member.tribeId = tribe.tribeId;
        member.tribeColor = tribe.tribeColor;
      });

      this.initializeWaterPlanForTribe(tribe);
      return tribe;
    });

    this.tribes = this.tribes.map(tribe => this._normalizeTribeAliases(tribe));

    this.survivors = this.tribes.flatMap(tribe => tribe.members);
    this.player = this.survivors.find(survivor => survivor.isPlayer) || this.player;

    eventManager.publish(GameEvents.TRIBES_CREATED, { tribes: this.tribes });
    return this.tribes;
  }

  _normalizeTribeAliases(tribe) {
    if (!tribe) return tribe;

    const normalizedTribeName = tribe.tribeName ?? tribe.name;
    const normalizedTribeColor = tribe.tribeColor ?? tribe.color;

    if (normalizedTribeName !== undefined) {
      tribe.tribeName = normalizedTribeName;
      tribe.name = normalizedTribeName;
    }

    if (normalizedTribeColor !== undefined) {
      tribe.tribeColor = normalizedTribeColor;
      tribe.color = normalizedTribeColor;
    }

    return tribe;
  }

  _resolveTribeNames({ mode, tribeCount, allTribeNames }) {
    if (mode === 'brains-brawn-beauty') {
      return ['Brains', 'Brawn', 'Beauty'];
    }
    return shuffleArray(allTribeNames)
      .slice(0, tribeCount)
      .map(nameEntry => (typeof nameEntry === 'string' ? nameEntry : nameEntry.name));
  }

  _pickTribeColors({ colorPool, tribeCount, disallowRedOrangeTogether = true }) {
    let chosenColors;
    while (true) {
      const shuffledColors = shuffleArray(colorPool);
      chosenColors = shuffledColors.slice(0, tribeCount);
      const hasRedOrange = chosenColors.includes('red') && chosenColors.includes('orange');
      if (!disallowRedOrangeTogether || !hasRedOrange) break;
    }
    return chosenColors;
  }

  _buildRequestedTribeGroups({ mode, tribeCount, survivors, minTribeSize = 1 }) {
    let groups = null;

    if (mode === 'brains-brawn-beauty') {
      groups = [
        survivors.filter(s => (s.traitClass || '').toLowerCase() === 'mental'),
        survivors.filter(s => (s.traitClass || '').toLowerCase() === 'physical'),
        survivors.filter(s => (s.traitClass || '').toLowerCase() === 'social')
      ];
    } else if (mode === 'battle-sexes') {
      groups = [
        survivors.filter(s => (s.gender || '').toLowerCase() === 'male'),
        survivors.filter(s => (s.gender || '').toLowerCase() === 'female')
      ];
    }

    if (!this._isValidTribeDistribution(groups, tribeCount, minTribeSize)) {
      if (groups) {
        console.warn(`[GameManager] Invalid '${mode}' tribe distribution detected; falling back to standard balanced random split.`);
      }
      return this._buildBalancedRandomGroups(survivors, tribeCount);
    }

    return groups;
  }

  _isValidTribeDistribution(groups, tribeCount, minTribeSize = 1) {
    if (!Array.isArray(groups)) return false;
    if (groups.length !== tribeCount) return false;
    return groups.every(group => Array.isArray(group) && group.length >= minTribeSize);
  }

  _buildBalancedRandomGroups(survivors, tribeCount) {
    const males = shuffleArray(survivors.filter(s => (s.gender || '').toLowerCase() === 'male'));
    const females = shuffleArray(survivors.filter(s => (s.gender || '').toLowerCase() === 'female'));
    const others = shuffleArray(survivors.filter(s => {
      const gender = (s.gender || '').toLowerCase();
      return gender !== 'male' && gender !== 'female';
    }));

    const interleaved = [];
    let mi = 0;
    let fi = 0;
    while (mi < males.length || fi < females.length) {
      if (fi < females.length) interleaved.push(females[fi++]);
      if (mi < males.length) interleaved.push(males[mi++]);
    }
    interleaved.push(...others);

    const groups = Array.from({ length: tribeCount }, () => []);
    interleaved.forEach((survivor, index) => {
      groups[index % tribeCount].push(survivor);
    });
    return groups;
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

  hasLostVote(survivorIdOrObj) {
    const survivor = typeof survivorIdOrObj === 'string'
      ? this.survivors.find(entry => entry.id === survivorIdOrObj)
      : survivorIdOrObj;

    if (!survivor) return false;

    if (survivor.hasVote === false) return true;
    if (survivor.lostVote === true) return true;

    const penaltiesLostVote = survivor.penalties?.lostVote;
    if (penaltiesLostVote === true || (Number.isFinite(penaltiesLostVote) && penaltiesLostVote > 0)) {
      return true;
    }

    const votePenalty = survivor.votePenalty;
    if (!votePenalty) return false;

    if (votePenalty.lostVote === true) return true;
    if (votePenalty.pending === true && votePenalty.type === 'LOST_VOTE_JOURNEY') return true;
    if (Number.isFinite(votePenalty.daysRemaining) && votePenalty.daysRemaining > 0) return true;
    if (Number.isFinite(votePenalty.roundsRemaining) && votePenalty.roundsRemaining > 0) return true;

    return false;
  }

  hasVote(survivorIdOrObj) {
    const survivor = typeof survivorIdOrObj === 'string'
      ? this.survivors.find(entry => entry.id === survivorIdOrObj)
      : survivorIdOrObj;

    if (!survivor) return false;
    if (survivor.hasVote === false) return false;
    return this.hasLostVote(survivor) === false;
  }

  canPlayShotInTheDark(survivorIdOrObj) {
    return this.hasVote(survivorIdOrObj) === true;
  }

  hasImmunity(survivorIdOrObj) {
    const survivor = typeof survivorIdOrObj === 'string'
      ? this.survivors.find(entry => entry.id === survivorIdOrObj)
      : survivorIdOrObj;

    if (!survivor) return false;

    return Boolean(
      survivor.hasImmunity
      || survivor.isImmune
      || survivor.immunity?.individual
      || survivor.advantages?.individualImmunity
      || survivor.immunityWon
      || survivor.temporaryImmunity
    );
  }

  getTribes() {
    return this.tribes;
  }

  getCurrentCampPhaseId() {
    const dayValue = this.day || 1;
    return `day${dayValue}_phase1`;
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
    this.resetTaskSimFlags({ reason: 'day' });
    this.updateTribeHealth();
    this.checkForMerge();
    eventManager.publish(GameEvents.DAY_ADVANCED, { day: this.day });
  }

  advanceGamePhase() {
    console.log(`Advancing from phase: ${this.gamePhase}`);

    switch (this.gamePhase) {
      case 'preChallenge':
        this.gamePhase = 'challenge';
        this._triggerTreeMail();
        break;
      case 'challenge':
        this.gamePhase = 'postChallenge';
        break;
      case 'postChallenge':
        this.gamePhase = 'tribalCouncil';
        break;
      case 'tribalCouncil':
        this.day++;
        this.gamePhase = 'preChallenge';
        this.dayTimer = 7200;
        break;
      default:
        console.warn(`Unknown game phase: ${this.gamePhase}`);
    }

    console.log(`Advanced to phase: ${this.gamePhase}`);
    this._publishPhaseChange();
  }

  async endPostChallengePhase() {
    this.flags = this.flags || {};
    this.flags.postChallengeScriptedComplete = true;
    this.postChallengeMode = 'playable';
    this.day += 1;
    this.dayTimer = 7200;
    this.gamePhase = GamePhase.PRE_CHALLENGE;
    console.info('[GameManager] Scripted post-challenge phase complete; advancing to next day', {
      day: this.day,
      gamePhase: this.gamePhase,
      postChallengeMode: this.postChallengeMode
    });
    this._publishPhaseChange();

    if (this.gameState === GameState.CAMP) {
      console.info('[GameManager] Refreshing camp screen for next pre-challenge day');
      this.setGameState(GameState.CAMP);
    }
  }

  _triggerTreeMail() {
    console.log('Tree Mail triggered for challenge phase');
    eventManager.publish(GameEvents.TREE_MAIL_RECEIVED, { 
      phase: this.gamePhase,
      day: this.day 
    });
  }

  _publishPhaseChange() {
    if (
      this.gameState === GameState.CAMP &&
      (this.gamePhase === GamePhase.PRE_CHALLENGE || this.gamePhase === GamePhase.POST_CHALLENGE)
    ) {
      this.systems?.idolSystem?.startNewCampPhase?.('phaseChange');
    }
    this.resetTaskSimFlags({ reason: 'phase' });
    eventManager.publish(GameEvents.GAME_PHASE_CHANGED, { 
      phase: this.gamePhase,
      day: this.day 
    });
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
      tribeId: 1,
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
    this.tribes = this.tribes.map(tribe => this._normalizeTribeAliases(tribe));
    this.isMerged = true;
    eventManager.publish(GameEvents.TRIBES_MERGED, { mergedTribe: this.tribes[0] });
  }

  eliminateSurvivor(survivorOrId, reason = 'vote') {
    const survivorId = typeof survivorOrId === 'string' ? survivorOrId : survivorOrId?.id;
    if (!survivorId) return;

    const survivor = this.survivors.find(entry => entry.id === survivorId) || survivorOrId;
    if (!survivor) return;

    survivor.isOut = true;

    let sourceTribe = null;
    this.tribes.forEach(tribe => {
      if (tribe.members.some(member => member.id === survivorId)) {
        sourceTribe = sourceTribe || tribe;
        tribe.members = tribe.members.filter(member => member.id !== survivorId);
      }
    });

    if (!sourceTribe) return;
    if (this.isMerged) this.jury.push(survivor);

    eventManager.publish(GameEvents.SURVIVOR_ELIMINATED, {
      eliminatedSurvivor: survivor,
      tribe: sourceTribe.id,
      addedToJury: this.isMerged,
      reason,
      day: this.day
    });
    if (survivor.isPlayer) this.setGameState(GameState.GAME_OVER);
  }

  consumeIdolForSurvivor(survivorId, context = {}) {
    if (!survivorId) return false;

    const idolSystem = this.systems?.idolSystem;
    const inventory = idolSystem?.survivorInventories?.get?.(survivorId);
    const idolToUse = inventory?.idols?.find(idol => !idol?.isUsed && !idol?.played);
    if (!idolToUse) {
      return false;
    }

    idolToUse.isUsed = true;
    idolToUse.played = true;
    idolToUse.usedOnDay = this.day;

    const tribeId = idolToUse.tribeId;
    const tribeIdolState = idolSystem?.tribeIdolStates?.get?.(tribeId);
    if (tribeIdolState && tribeIdolState.id === idolToUse.id) {
      tribeIdolState.isUsed = true;
      tribeIdolState.usedOnDay = this.day;
    }

    eventManager.publish(GameEvents.IDOL_PLAYED, {
      survivorId,
      idolId: idolToUse.id,
      tribeId,
      day: this.day,
      ...context
    });

    return true;
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
    return this.dayTimer;
  }

  deductTime(seconds) {
    this.dayTimer = Math.max(0, this.dayTimer - seconds);
  }

  consumeCampTime(seconds, payload = {}) {
    const amount = Math.max(0, Number(seconds) || 0);
    if (!amount) return;
    this.dayTimer = Math.max(0, this.dayTimer - amount);
    updateCampClockUI(this.dayTimer, this.getDay());
    if (this.systems?.idolSystem?.isDebugMode?.()) {
      console.debug('[GameManager] Camp time consumed', {
        seconds: amount,
        remaining: this.dayTimer,
        ...payload
      });
    }
  }

  getCurrentDay() {
    return this.day;
  }

  runTaskSimCheckpoint(checkpoint, opts) {
    return this.systems?.taskSimulationSystem?.runCheckpoint?.(checkpoint, opts);
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
      flags: this.flags,
      campLog: this.campLog,
      gameHistory: this.gameHistory,
      tribalCouncilLog: this.tribalCouncilLog,
      state: this.state,
      postChallengeMode: this.postChallengeMode,
      gameSettings: this.gameSettings,
      systemsState: {
        dealSystem: this.systems.dealSystem?.serialize?.() ?? null,
        trustSystem: this.systems.trustSystem?.serialize?.() ?? null
      },
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
    this.flags = data.flags || { day1FirstImpressionsCompleted: false };
    this.campLog = data.campLog || [];
    this.gameHistory = data.gameHistory || { tribals: [] };
    this.tribalCouncilLog = data.tribalCouncilLog || [];
    this.state = data.state || {};
    this.postChallengeMode = data.postChallengeMode || 'playable';
    this.survivors = (this.survivors || []).map(survivor => ({ ...survivor, laziness: survivor.laziness ?? 0 }));
    (this.tribes || []).forEach(tribe => {
      this.initializeWaterPlanForTribe(tribe);
    });
    if (typeof this.systems.dealSystem.deserialize === 'function') {
      const dealPayload = data.systemsState?.dealSystem ?? data.dealSystemData ?? null;
      this.systems.dealSystem.deserialize(dealPayload);
    }
    if (this.systems.trustSystem?.deserialize) {
      const trustPayload = data.systemsState?.trustSystem ?? null;
      this.systems.trustSystem.deserialize(trustPayload);
    } else {
      console.warn('[GameManager] TrustSystem unavailable during load; trust will default to 50.');
    }
    this.resetTaskSimFlags({ reason: 'load' });
    this._updateScreenForState(this.gameState);
    eventManager.publish(GameEvents.GAME_LOADED, { timestamp: data.timestamp });
    return true;
  }

  resetTaskSimFlags({ reason = 'manual' } = {}) {
    this.flags = this.flags || {};
    this.flags.taskSimMidCompleted = false;
    this.flags.taskSimEndCompleted = false;
    this.flags.taskSimMidReportId = null;
    this.flags.taskSimEndReportId = null;
    if (this.systems?.idolSystem?.isDebugMode?.()) {
      console.debug('[GameManager] Reset task sim flags', { reason });
    }
  }

  initializeWaterPlanForTribe(tribe) {
    if (!tribe) return null;
    const existing = tribe.waterPlan;
    if (existing && Array.isArray(existing.assigneeIds)) {
      return existing;
    }

    const members = tribe.members || [];
    const scored = members.map(member => {
      const teamPlayer = Number.isFinite(member.teamPlayer) ? member.teamPlayer : 50;
      const leadership = Number.isFinite(member.leadership) ? member.leadership : 50;
      const workEthic = Number.isFinite(member.workEthic) ? member.workEthic : 50;
      const style = member.gameplayStyle || member.playStyle || '';
      const styleBoost = ['Shadow Strategist', 'Power Player', 'Social Genius', 'Lethal Charmer'].includes(style)
        ? 8
        : style === 'Wildcard'
          ? 4
          : 0;
      return {
        id: member.id,
        score: teamPlayer * 0.5 + leadership * 0.3 + workEthic * 0.2 + styleBoost
      };
    });

    scored.sort((a, b) => b.score - a.score);
    const targetCount = Math.min(3, Math.max(1, Math.round(members.length / 4)));
    const assigneeIds = scored.slice(0, targetCount).map(entry => entry.id);

    const plan = {
      assigneeIds,
      active: true,
      lastUpdatedDay: this.getCurrentDay?.() ?? this.day ?? 1
    };
    tribe.waterPlan = plan;
    return plan;
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

  getTrust(id1, id2) {
    if (this.systems.trustSystem?.getTrust) {
      return this.systems.trustSystem.getTrust(id1, id2);
    }
    if (!this._missingTrustSystemWarned) {
      console.warn('[GameManager] TrustSystem unavailable; defaulting trust to 50.');
      this._missingTrustSystemWarned = true;
    }
    return 50;
  }

  changeTrust(id1, id2, delta, reason = null) {
    if (this.systems.trustSystem?.changeTrust) {
      this.systems.trustSystem.changeTrust(id1, id2, delta, reason);
      return;
    }
    if (!this._missingTrustSystemWarned) {
      console.warn('[GameManager] TrustSystem unavailable; trust change skipped.');
      this._missingTrustSystemWarned = true;
    }
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
    const calculatedHealth = Math.round((water + hunger + rest) / 3);

    survivor.health = Math.max(0, Math.min(100, calculatedHealth));

    console.log(`Updated health for ${survivor.name}: ${survivor.health} (water: ${water}, hunger: ${hunger}, rest: ${rest})`);
  }

  consumeVotePenaltiesAfterTribal(attendeeIds = []) {
    if (!Array.isArray(attendeeIds) || !this.survivors) return;

    attendeeIds.forEach(id => {
      const survivor = this.survivors.find(s => s.id === id);
      if (survivor?.votePenalty?.type === 'LOST_VOTE_JOURNEY' && survivor.votePenalty.pending === true) {
        survivor.hasVote = true;
        survivor.votePenalty = null;
      }
    });
  }
}

const gameManager = new GameManager();
export default gameManager;
