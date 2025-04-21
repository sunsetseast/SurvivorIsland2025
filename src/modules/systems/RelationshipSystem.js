/**
 * @module RelationshipSystem
 * Manages relationships between survivors in the game
 */

import { getRandomInt } from '../utils/CommonUtils.js';
import eventManager, { GameEvents } from '../core/EventManager.js';

// Relationship types
export const RelationshipType = {
  ALLY: 'ally',
  ENEMY: 'enemy',
  NEUTRAL: 'neutral'
};

class RelationshipSystem {
  constructor(gameManager) {
    this.gameManager = gameManager;
    this.relationships = {}; // Format: { "survivorId1_survivorId2": { value: number, type: string } }
    this.defaultValue = 50; // Default relationship value (0-100 scale)
    this.threshold = {
      ally: 70, // Value above which survivors are considered allies
      enemy: 30  // Value below which survivors are considered enemies
    };
  }
  
  /**
   * Initialize the relationship system
   */
  initialize() {
    console.log('Initializing RelationshipSystem');
    this.relationships = {};
    
    // Setup event listeners
    eventManager.subscribe(GameEvents.TRIBES_CREATED, this._handleTribesCreated.bind(this));
    eventManager.subscribe(GameEvents.TRIBES_MERGED, this._handleTribesMerged.bind(this));
    eventManager.subscribe(GameEvents.SURVIVOR_ELIMINATED, this._handleSurvivorEliminated.bind(this));
  }
  
  /**
   * Create initial relationships between all survivors
   * @private
   */
  _createInitialRelationships() {
    const tribes = this.gameManager.getTribes();
    
    if (!tribes || tribes.length === 0) {
      console.warn('No tribes available to create relationships');
      return;
    }
    
    // Get all survivors
    const allSurvivors = [];
    tribes.forEach(tribe => {
      if (tribe.members && tribe.members.length > 0) {
        tribe.members.forEach(survivor => {
          allSurvivors.push(survivor);
        });
      }
    });
    
    // Create relationships between all survivors
    for (let i = 0; i < allSurvivors.length; i++) {
      for (let j = i + 1; j < allSurvivors.length; j++) {
        const survivor1 = allSurvivors[i];
        const survivor2 = allSurvivors[j];
        
        // Skip if relationship already exists
        if (this.getRelationship(survivor1.id, survivor2.id)) continue;
        
        // Create initial relationship
        let value = this.defaultValue;
        
        // Tribe members have slightly better relationships to start
        if (this._areInSameTribe(survivor1, survivor2)) {
          // Tribe bonus: 5-15 extra points
          value += getRandomInt(5, 15);
        } else {
          // Small random variation for non-tribe members
          value += getRandomInt(-10, 10);
        }
        
        // Ensure value is within bounds
        value = Math.min(100, Math.max(0, value));
        
        // Set the relationship
        this.setRelationship(survivor1.id, survivor2.id, value);
      }
    }
    
    console.log('Initial relationships created');
  }
  
  /**
   * Check if two survivors are in the same tribe
   * @param {Object} survivor1 - First survivor
   * @param {Object} survivor2 - Second survivor
   * @returns {boolean} Whether the survivors are in the same tribe
   * @private
   */
  _areInSameTribe(survivor1, survivor2) {
    const tribes = this.gameManager.getTribes();
    
    for (const tribe of tribes) {
      const inTribe1 = tribe.members.some(member => member.id === survivor1.id);
      const inTribe2 = tribe.members.some(member => member.id === survivor2.id);
      
      if (inTribe1 && inTribe2) {
        return true;
      }
    }
    
    return false;
  }
  
  /**
   * Handle tribes created event
   * @param {Object} data - Event data
   * @private
   */
  _handleTribesCreated(data) {
    // Initialize relationships when tribes are created
    this._createInitialRelationships();
  }
  
  /**
   * Handle tribes merged event
   * @param {Object} data - Event data
   * @private
   */
  _handleTribesMerged(data) {
    // After merge, decay some relationships and create randomization
    // This simulates the social dynamics after tribes merge
    this._applyMergeEffect();
  }
  
  /**
   * Apply merge effect to relationships
   * @private
   */
  _applyMergeEffect() {
    const relationships = Object.keys(this.relationships);
    
    relationships.forEach(relationshipKey => {
      // 30% chance to change relationship substantially
      if (Math.random() < 0.3) {
        const currentValue = this.relationships[relationshipKey].value;
        
        // Either improve or weaken relationship
        const change = getRandomInt(10, 20) * (Math.random() < 0.5 ? -1 : 1);
        
        // Apply change
        let newValue = currentValue + change;
        newValue = Math.min(100, Math.max(0, newValue));
        
        // Update relationship
        this.relationships[relationshipKey].value = newValue;
        this.relationships[relationshipKey].type = this._getRelationshipType(newValue);
      }
    });
    
    console.log('Merge effect applied to relationships');
  }
  
  /**
   * Handle survivor eliminated event
   * @param {Object} data - Event data
   * @private
   */
  _handleSurvivorEliminated(data) {
    const eliminatedId = data.eliminatedSurvivor.id;
    
    // Remove all relationships involving the eliminated survivor
    Object.keys(this.relationships).forEach(key => {
      const [id1, id2] = key.split('_');
      if (id1 === eliminatedId.toString() || id2 === eliminatedId.toString()) {
        delete this.relationships[key];
      }
    });
    
    // If player voted for this elimination, affect relationships
    if (data.votedBy && data.votedBy.includes(this.gameManager.getPlayerSurvivor().id)) {
      this._handlePlayerVoting(eliminatedId);
    }
  }
  
  /**
   * Handle player voting for elimination
   * @param {number} eliminatedId - ID of eliminated survivor
   * @private
   */
  _handlePlayerVoting(eliminatedId) {
    const playerSurvivor = this.gameManager.getPlayerSurvivor();
    
    if (!playerSurvivor) return;
    
    const playerTribe = this.gameManager.getPlayerTribe();
    
    if (!playerTribe) return;
    
    // Find all survivors who also voted for the eliminated player
    playerTribe.members.forEach(member => {
      if (member.id !== playerSurvivor.id && member.id !== eliminatedId) {
        // Improve relationship with those who voted the same way
        const relationshipKey = this._getRelationshipKey(playerSurvivor.id, member.id);
        if (this.relationships[relationshipKey]) {
          // Improve relationship slightly
          let value = this.relationships[relationshipKey].value + getRandomInt(3, 8);
          value = Math.min(100, value);
          
          this.relationships[relationshipKey].value = value;
          this.relationships[relationshipKey].type = this._getRelationshipType(value);
        }
      }
    });
  }
  
  /**
   * Get relationship key for two survivors
   * @param {number} id1 - First survivor ID
   * @param {number} id2 - Second survivor ID
   * @returns {string} Relationship key
   * @private
   */
  _getRelationshipKey(id1, id2) {
    // Ensure consistent key ordering
    return id1 < id2 ? `${id1}_${id2}` : `${id2}_${id1}`;
  }
  
  /**
   * Get relationship type based on value
   * @param {number} value - Relationship value
   * @returns {string} Relationship type
   * @private
   */
  _getRelationshipType(value) {
    if (value >= this.threshold.ally) {
      return RelationshipType.ALLY;
    } else if (value <= this.threshold.enemy) {
      return RelationshipType.ENEMY;
    } else {
      return RelationshipType.NEUTRAL;
    }
  }
  
  /**
   * Set relationship between two survivors
   * @param {number} id1 - First survivor ID
   * @param {number} id2 - Second survivor ID
   * @param {number} value - Relationship value (0-100)
   */
  setRelationship(id1, id2, value) {
    if (id1 === id2) {
      console.warn('Cannot set relationship between the same survivor');
      return;
    }
    
    const key = this._getRelationshipKey(id1, id2);
    const type = this._getRelationshipType(value);
    
    this.relationships[key] = {
      value,
      type
    };
    
    // Publish relationship changed event
    eventManager.publish(GameEvents.RELATIONSHIP_CHANGED, {
      survivor1Id: id1,
      survivor2Id: id2,
      value,
      type
    });
  }
  
  /**
   * Get relationship between two survivors
   * @param {number} id1 - First survivor ID
   * @param {number} id2 - Second survivor ID
   * @returns {Object|null} Relationship object or null if not found
   */
  getRelationship(id1, id2) {
    if (id1 === id2) return null;
    
    const key = this._getRelationshipKey(id1, id2);
    return this.relationships[key] || null;
  }
  
  /**
   * Change relationship between two survivors
   * @param {number} id1 - First survivor ID
   * @param {number} id2 - Second survivor ID
   * @param {number} change - Amount to change the relationship by
   */
  changeRelationship(id1, id2, change) {
    if (id1 === id2) return;
    
    const relationship = this.getRelationship(id1, id2);
    let value = relationship ? relationship.value : this.defaultValue;
    
    // Apply change
    value += change;
    
    // Ensure value is within bounds
    value = Math.min(100, Math.max(0, value));
    
    // Set the updated relationship
    this.setRelationship(id1, id2, value);
    
    console.log(`Relationship between ${id1} and ${id2} changed by ${change} to ${value}`);
  }
  
  /**
   * Get all relationships for a survivor
   * @param {number} survivorId - Survivor ID
   * @returns {Object} Map of relationships with other survivors
   */
  getSurvivorRelationships(survivorId) {
    const relationships = {};
    
    Object.keys(this.relationships).forEach(key => {
      const [id1, id2] = key.split('_').map(Number);
      
      if (id1 === survivorId) {
        relationships[id2] = this.relationships[key];
      } else if (id2 === survivorId) {
        relationships[id1] = this.relationships[key];
      }
    });
    
    return relationships;
  }
  
  /**
   * Get survivors with a specific relationship type to a survivor
   * @param {number} survivorId - Survivor ID
   * @param {string} type - Relationship type
   * @returns {Array} Array of survivor IDs with that relationship type
   */
  getSurvivorsByRelationshipType(survivorId, type) {
    const relationships = this.getSurvivorRelationships(survivorId);
    const survivors = [];
    
    Object.keys(relationships).forEach(id => {
      if (relationships[id].type === type) {
        survivors.push(Number(id));
      }
    });
    
    return survivors;
  }
  
  /**
   * Check if two survivors are allies
   * @param {number} id1 - First survivor ID
   * @param {number} id2 - Second survivor ID
   * @returns {boolean} Whether the survivors are allies
   */
  areAllies(id1, id2) {
    const relationship = this.getRelationship(id1, id2);
    return relationship && relationship.type === RelationshipType.ALLY;
  }
  
  /**
   * Check if two survivors are enemies
   * @param {number} id1 - First survivor ID
   * @param {number} id2 - Second survivor ID
   * @returns {boolean} Whether the survivors are enemies
   */
  areEnemies(id1, id2) {
    const relationship = this.getRelationship(id1, id2);
    return relationship && relationship.type === RelationshipType.ENEMY;
  }
  
  /**
   * Process relationships for camp activities
   * @param {number} survivorId - Survivor ID
   * @param {string} activityType - Type of activity
   */
  processCampActivity(survivorId, activityType) {
    const playerTribe = this.gameManager.getPlayerTribe();
    
    if (!playerTribe) return;
    
    // For each tribe member, potentially change relationship
    playerTribe.members.forEach(member => {
      if (member.id !== survivorId) {
        // Skip if not in the same location
        if (activityType === 'location' && member.location !== playerTribe.members.find(s => s.id === survivorId).location) {
          return;
        }
        
        // 60% chance of relationship change
        if (Math.random() < 0.6) {
          // Small random change (-2 to +4)
          const change = getRandomInt(-2, 4);
          this.changeRelationship(survivorId, member.id, change);
        }
      }
    });
  }
  
  /**
   * Get all relationships
   * @returns {Object} All relationships
   */
  getRelationships() {
    return this.relationships;
  }
  
  /**
   * Set all relationships
   * @param {Object} relationships - Relationships to set
   */
  setRelationships(relationships) {
    this.relationships = relationships;
  }
}

export default RelationshipSystem;