/**
 * @module IdolSystem
 * Manages hidden immunity idols and advantages in the game
 */

import eventManager, { GameEvents } from '../core/EventManager.js';
import { getRandomInt, generateId } from '../utils/CommonUtils.js';

// Idol types
export const IdolType = {
  REGULAR: 'regular', // Standard immunity idol
  SUPER: 'super', // Super idol that can be played after votes are read
  NULLIFIER: 'nullifier', // Nullifies an idol played by someone else
  STEAL: 'steal', // Steal a vote
  EXTRA: 'extra' // Extra vote
};

class IdolSystem {
  constructor(gameManager) {
    this.gameManager = gameManager;
    this.idols = []; // Array of idol objects
    this.advantages = []; // Array of advantage objects
    this.idolsFound = 0; // Number of idols found this game
    this.defaultIdolsPerTribe = 1; // Number of idols to place at start
    this.idolRehideChance = 0.75; // Chance that an idol is rehidden after being played
    this.replayedIdolsCount = 0; // Number of idols that have been rehidden
  }
  
  /**
   * Initialize the idol system
   */
  initialize() {
    console.log('Initializing IdolSystem');
    
    // Subscribe to events
    eventManager.subscribe(GameEvents.TRIBES_CREATED, this._handleTribesCreated.bind(this));
    eventManager.subscribe(GameEvents.TRIBES_MERGED, this._handleTribesMerged.bind(this));
    eventManager.subscribe(GameEvents.DAY_ADVANCED, this._handleDayAdvanced.bind(this));
  }
  
  /**
   * Handle tribes created event
   * @param {Object} data - Event data
   * @private
   */
  _handleTribesCreated(data) {
    // Generate initial idols for each tribe
    this._placeInitialIdols();
  }
  
  /**
   * Handle tribes merged event
   * @param {Object} data - Event data
   * @private
   */
  _handleTribesMerged(data) {
    // Add merge idol(s)
    this._placeMergeIdols();
    
    // Add special advantages at merge
    this._placeMergeAdvantages();
    
    console.log('Merge idols and advantages placed');
  }
  
  /**
   * Handle day advanced event
   * @param {Object} data - Event data
   * @private
   */
  _handleDayAdvanced(data) {
    // Check if we should rehide an idol
    this._checkForIdolRehiding();
  }
  
  /**
   * Place initial idols at game start
   * @private
   */
  _placeInitialIdols() {
    if (!this.gameManager.gameSettings.enableIdols) {
      console.log('Idols are disabled in settings');
      return;
    }
    
    const tribes = this.gameManager.getTribes();
    if (!tribes || tribes.length === 0) return;
    
    // Clear any existing idols
    this.idols = [];
    
    // Place idols for each tribe
    tribes.forEach(tribe => {
      for (let i = 0; i < this.defaultIdolsPerTribe; i++) {
        const idol = this._createIdol(IdolType.REGULAR, tribe.tribeName);
        this.idols.push(idol);
      }
    });
    
    console.log(`Placed ${this.idols.length} initial idols`);
  }
  
  /**
   * Place idols when tribes merge
   * @private
   */
  _placeMergeIdols() {
    if (!this.gameManager.gameSettings.enableIdols) return;
    
    // Place a merge idol
    const mergeIdol = this._createIdol(IdolType.REGULAR, 'Merge');
    this.idols.push(mergeIdol);
    
    console.log('Placed merge idol');
  }
  
  /**
   * Place advantages when tribes merge
   * @private
   */
  _placeMergeAdvantages() {
    if (!this.gameManager.gameSettings.enableAdvantages) return;
    
    // Add a vote steal advantage
    const stealAdvantage = this._createAdvantage(IdolType.STEAL);
    this.advantages.push(stealAdvantage);
    
    // Add an extra vote advantage
    const extraVoteAdvantage = this._createAdvantage(IdolType.EXTRA);
    this.advantages.push(extraVoteAdvantage);
    
    // Add an idol nullifier if the game is set to hard mode
    if (this.gameManager.gameSettings.difficultyLevel === 'hard') {
      const nullifierAdvantage = this._createAdvantage(IdolType.NULLIFIER);
      this.advantages.push(nullifierAdvantage);
    }
    
    console.log(`Placed ${this.advantages.length} merge advantages`);
  }
  
  /**
   * Create a new idol
   * @param {string} type - Type of idol
   * @param {string} location - Where the idol is located
   * @returns {Object} The created idol
   * @private
   */
  _createIdol(type, location) {
    return {
      id: generateId(),
      type,
      location,
      isFound: false,
      foundBy: null,
      foundOnDay: null,
      isPlayed: false,
      playedOnDay: null,
      playedBy: null,
      expiresOnDay: null // Some idols might expire
    };
  }
  
  /**
   * Create a new advantage
   * @param {string} type - Type of advantage
   * @returns {Object} The created advantage
   * @private
   */
  _createAdvantage(type) {
    return {
      id: generateId(),
      type,
      isFound: false,
      foundBy: null,
      foundOnDay: null,
      isPlayed: false,
      playedOnDay: null,
      playedBy: null,
      expiresOnDay: this.gameManager.getDay() + 3 // Advantages typically expire
    };
  }
  
  /**
   * Check if an idol should be rehidden
   * @private
   */
  _checkForIdolRehiding() {
    if (!this.gameManager.gameSettings.enableIdols) return;
    
    // Limit number of rehidden idols based on game phase
    const maxRehiddenIdols = this.gameManager.isMerged ? 2 : 1;
    
    if (this.replayedIdolsCount >= maxRehiddenIdols) return;
    
    // Check to see if we should rehide an idol
    const playedIdols = this.idols.filter(idol => idol.isPlayed);
    
    if (playedIdols.length > 0 && Math.random() < this.idolRehideChance) {
      // Choose one played idol to rehide
      const idolToRehide = playedIdols[0];
      
      // Create a new idol to replace it
      const newIdol = this._createIdol(IdolType.REGULAR, this.gameManager.isMerged ? 'Merge' : 'Camp');
      this.idols.push(newIdol);
      
      // Increment counter
      this.replayedIdolsCount++;
      
      console.log('Rehid an idol after one was played');
    }
  }
  
  /**
   * Randomly search for an idol at a location
   * @param {number} survivorId - ID of the survivor searching
   * @param {string} location - Location to search
   * @returns {Object|null} The found idol or null
   */
  searchForIdol(survivorId, location) {
    if (!this.gameManager.gameSettings.enableIdols) return null;
    
    const survivor = this._getSurvivorById(survivorId);
    if (!survivor) return null;
    
    // Get idols at this location that haven't been found
    const availableIdols = this.idols.filter(idol => 
      !idol.isFound && 
      idol.location === location
    );
    
    if (availableIdols.length === 0) return null;
    
    // Calculate search success chance based on game phase and number of idols found
    let successChance = 0.05; // Base 5% chance
    
    // Early game bonus
    if (this.gameManager.getDay() <= 3) {
      successChance += 0.05;
    }
    
    // Desperate search bonus when tribe is losing
    const tribe = this._getSurvivorTribe(survivorId);
    if (tribe && tribe.immunityWins === 0 && this.gameManager.getDay() > 3) {
      successChance += 0.1;
    }
    
    // Personality factor - smart players find idols easier
    if (survivor.mental >= 8) {
      successChance += 0.05;
    }
    
    // Determine if search is successful
    if (Math.random() < successChance) {
      // Success! Find an idol
      const foundIdol = availableIdols[0];
      
      // Mark as found
      foundIdol.isFound = true;
      foundIdol.foundBy = survivorId;
      foundIdol.foundOnDay = this.gameManager.getDay();
      
      // Update counter
      this.idolsFound++;
      
      // Publish idol found event
      eventManager.publish(GameEvents.IDOL_FOUND, {
        idol: foundIdol,
        survivorId,
        location
      });
      
      console.log(`Survivor ${survivorId} found an idol at ${location}`);
      
      return foundIdol;
    }
    
    return null;
  }
  
  /**
   * Randomly search for an advantage at a location
   * @param {number} survivorId - ID of the survivor searching
   * @param {string} location - Location to search
   * @returns {Object|null} The found advantage or null
   */
  searchForAdvantage(survivorId, location) {
    if (!this.gameManager.gameSettings.enableAdvantages) return null;
    
    // Get advantages that haven't been found
    const availableAdvantages = this.advantages.filter(advantage => 
      !advantage.isFound
    );
    
    if (availableAdvantages.length === 0) return null;
    
    // Even lower chance than idols
    const successChance = 0.02;
    
    // Determine if search is successful
    if (Math.random() < successChance) {
      // Success! Find an advantage
      const foundAdvantage = availableAdvantages[0];
      
      // Mark as found
      foundAdvantage.isFound = true;
      foundAdvantage.foundBy = survivorId;
      foundAdvantage.foundOnDay = this.gameManager.getDay();
      
      // Set expiration
      foundAdvantage.expiresOnDay = this.gameManager.getDay() + 3;
      
      // Publish advantage found event (using same event as idols for simplicity)
      eventManager.publish(GameEvents.IDOL_FOUND, {
        idol: foundAdvantage,
        survivorId,
        location,
        isAdvantage: true
      });
      
      console.log(`Survivor ${survivorId} found an advantage at ${location}`);
      
      return foundAdvantage;
    }
    
    return null;
  }
  
  /**
   * Play an idol for a survivor
   * @param {string} idolId - ID of the idol to play
   * @param {number} targetId - ID of the survivor to play it for
   * @returns {boolean} Whether the idol was played successfully
   */
  playIdol(idolId, targetId) {
    const idol = this.idols.find(i => i.id === idolId);
    
    if (!idol) {
      console.error(`Idol ${idolId} not found`);
      return false;
    }
    
    if (!idol.isFound) {
      console.error(`Idol ${idolId} has not been found yet`);
      return false;
    }
    
    if (idol.isPlayed) {
      console.error(`Idol ${idolId} has already been played`);
      return false;
    }
    
    const targetSurvivor = this._getSurvivorById(targetId);
    if (!targetSurvivor) {
      console.error(`Target survivor ${targetId} not found`);
      return false;
    }
    
    // Mark as played
    idol.isPlayed = true;
    idol.playedOnDay = this.gameManager.getDay();
    idol.playedBy = idol.foundBy;
    idol.targetId = targetId;
    
    // Grant immunity
    targetSurvivor.hasImmunity = true;
    
    // Publish idol played event
    eventManager.publish(GameEvents.IDOL_PLAYED, {
      idol,
      playerId: idol.foundBy,
      targetId
    });
    
    console.log(`Survivor ${idol.foundBy} played an idol for ${targetId}`);
    
    return true;
  }
  
  /**
   * Play an advantage
   * @param {string} advantageId - ID of the advantage to play
   * @param {number} targetId - ID of the target survivor
   * @returns {boolean} Whether the advantage was played successfully
   */
  playAdvantage(advantageId, targetId) {
    const advantage = this.advantages.find(a => a.id === advantageId);
    
    if (!advantage) {
      console.error(`Advantage ${advantageId} not found`);
      return false;
    }
    
    if (!advantage.isFound) {
      console.error(`Advantage ${advantageId} has not been found yet`);
      return false;
    }
    
    if (advantage.isPlayed) {
      console.error(`Advantage ${advantageId} has already been played`);
      return false;
    }
    
    if (advantage.expiresOnDay < this.gameManager.getDay()) {
      console.error(`Advantage ${advantageId} has expired`);
      return false;
    }
    
    const targetSurvivor = this._getSurvivorById(targetId);
    if (!targetSurvivor) {
      console.error(`Target survivor ${targetId} not found`);
      return false;
    }
    
    // Mark as played
    advantage.isPlayed = true;
    advantage.playedOnDay = this.gameManager.getDay();
    advantage.playedBy = advantage.foundBy;
    advantage.targetId = targetId;
    
    // Apply advantage effect
    switch (advantage.type) {
      case IdolType.STEAL:
        // Apply vote steal effect
        // This will need to be integrated with the voting system
        break;
        
      case IdolType.EXTRA:
        // Apply extra vote effect
        // This will need to be integrated with the voting system
        break;
        
      case IdolType.NULLIFIER:
        // Apply idol nullifier effect
        // This will need to be integrated with the idol playing system
        break;
    }
    
    // Publish advantage played event (using same event as idols for simplicity)
    eventManager.publish(GameEvents.IDOL_PLAYED, {
      idol: advantage,
      playerId: advantage.foundBy,
      targetId,
      isAdvantage: true
    });
    
    console.log(`Survivor ${advantage.foundBy} played a ${advantage.type} advantage for ${targetId}`);
    
    return true;
  }
  
  /**
   * Get idols owned by a survivor
   * @param {number} survivorId - ID of the survivor
   * @returns {Array} Array of idol objects
   */
  getIdolsForSurvivor(survivorId) {
    return this.idols.filter(idol => 
      idol.isFound && 
      idol.foundBy === survivorId && 
      !idol.isPlayed
    );
  }
  
  /**
   * Get advantages owned by a survivor
   * @param {number} survivorId - ID of the survivor
   * @returns {Array} Array of advantage objects
   */
  getAdvantagesForSurvivor(survivorId) {
    return this.advantages.filter(advantage => 
      advantage.isFound && 
      advantage.foundBy === survivorId && 
      !advantage.isPlayed &&
      advantage.expiresOnDay >= this.gameManager.getDay()
    );
  }
  
  /**
   * Get a survivor by ID
   * @param {number} id - Survivor ID
   * @returns {Object|null} Survivor object or null if not found
   * @private
   */
  _getSurvivorById(id) {
    const tribes = this.gameManager.getTribes();
    
    for (const tribe of tribes) {
      const survivor = tribe.members.find(member => member.id === id);
      if (survivor) return survivor;
    }
    
    return null;
  }
  
  /**
   * Get a survivor's tribe
   * @param {number} id - Survivor ID
   * @returns {Object|null} Tribe object or null if not found
   * @private
   */
  _getSurvivorTribe(id) {
    const tribes = this.gameManager.getTribes();
    
    for (const tribe of tribes) {
      if (tribe.members.some(member => member.id === id)) {
        return tribe;
      }
    }
    
    return null;
  }
  
  /**
   * Reset the idol system
   */
  reset() {
    this.idols = [];
    this.advantages = [];
    this.idolsFound = 0;
    this.replayedIdolsCount = 0;
  }
}

export default IdolSystem;