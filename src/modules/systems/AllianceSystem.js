/**
 * @module AllianceSystem
 * Manages alliances between survivors in the game
 */

import { generateId } from '../utils/CommonUtils.js';
import eventManager, { GameEvents } from '../core/EventManager.js';
import { RelationshipType } from './RelationshipSystem.js';

class AllianceSystem {
  constructor(gameManager) {
    this.gameManager = gameManager;
    this.alliances = []; // Array of alliance objects
    this.minRelationshipForInvite = 60; // Minimum relationship value to invite to alliance
  }
  
  /**
   * Initialize the alliance system
   */
  initialize() {
    console.log('Initializing AllianceSystem');
    this.alliances = [];
    
    // Setup event listeners
    eventManager.subscribe(GameEvents.TRIBES_CREATED, this._handleTribesCreated.bind(this));
    eventManager.subscribe(GameEvents.SURVIVOR_ELIMINATED, this._handleSurvivorEliminated.bind(this));
    eventManager.subscribe(GameEvents.RELATIONSHIP_CHANGED, this._handleRelationshipChanged.bind(this));
  }
  
  /**
   * Handle tribes created event
   * @param {Object} data - Event data
   * @private
   */
  _handleTribesCreated(data) {
    // Wait for relationships to be established before creating NPC alliances
    setTimeout(() => {
      this._createInitialNPCAlliances();
    }, 500);
  }
  
  /**
   * Handle survivor eliminated event
   * @param {Object} data - Event data
   * @private
   */
  _handleSurvivorEliminated(data) {
    const eliminatedId = data.eliminatedSurvivor.id;
    
    // Remove eliminated survivor from all alliances
    this.alliances.forEach(alliance => {
      const index = alliance.members.indexOf(eliminatedId);
      if (index !== -1) {
        alliance.members.splice(index, 1);
        console.log(`Removed survivor ${eliminatedId} from alliance ${alliance.name}`);
        
        // Publish alliance member removed event
        eventManager.publish(GameEvents.ALLIANCE_MEMBER_REMOVED, {
          allianceId: alliance.id,
          survivorId: eliminatedId,
          reason: 'eliminated'
        });
        
        // If alliance is now too small, dissolve it
        if (alliance.members.length < 2) {
          this.dissolveAlliance(alliance.id);
        }
      }
    });
  }
  
  /**
   * Handle relationship changed event
   * @param {Object} data - Event data
   * @private
   */
  _handleRelationshipChanged(data) {
    // If relationship becomes too low, might break alliance
    if (data.type === RelationshipType.ENEMY || data.value < 30) {
      this._checkForAllianceStrain(data.survivor1Id, data.survivor2Id);
    }
    
    // If relationship becomes high, NPCs might form alliances
    if (data.type === RelationshipType.ALLY && data.value > 75) {
      this._checkForPotentialAlliance(data.survivor1Id, data.survivor2Id);
    }
  }
  
  /**
   * Check if relationship strain might break an alliance
   * @param {number} id1 - First survivor ID
   * @param {number} id2 - Second survivor ID
   * @private
   */
  _checkForAllianceStrain(id1, id2) {
    // Find alliances where both survivors are members
    const sharedAlliances = this.getSharedAlliances(id1, id2);
    
    if (sharedAlliances.length === 0) return;
    
    // 40% chance that bad relationship strains alliance
    if (Math.random() < 0.4) {
      // Choose one alliance to have issues
      const alliance = sharedAlliances[0];
      
      // If player is in alliance, notify them
      if (alliance.members.includes(this.gameManager.getPlayerSurvivor()?.id)) {
        // Show notification via dialogue system if available
        if (this.gameManager.systems.dialogueSystem) {
          const survivor1 = this._getSurvivorById(id1);
          const survivor2 = this._getSurvivorById(id2);
          
          if (survivor1 && survivor2) {
            this.gameManager.systems.dialogueSystem.showDialogue(
              `There seems to be tension between ${survivor1.name} and ${survivor2.name} in your alliance. This could cause problems for your group.`,
              ["Continue"],
              () => this.gameManager.systems.dialogueSystem.hideDialogue()
            );
          }
        }
      }
      
      // 15% chance someone actually leaves the alliance
      if (Math.random() < 0.15) {
        // The one with lower relationship to most alliance members leaves
        const leaverId = this._determineLikelyLeaver(alliance, id1, id2);
        this.removeMemberFromAlliance(alliance.id, leaverId);
      }
    }
  }
  
  /**
   * Determine which survivor is more likely to leave an alliance
   * @param {Object} alliance - The alliance
   * @param {number} id1 - First survivor ID
   * @param {number} id2 - Second survivor ID
   * @returns {number} ID of the survivor more likely to leave
   * @private
   */
  _determineLikelyLeaver(alliance, id1, id2) {
    // If relationship system isn't available, choose randomly
    if (!this.gameManager.systems.relationshipSystem) {
      return Math.random() < 0.5 ? id1 : id2;
    }
    
    // Calculate average relationship with other members
    let sum1 = 0, sum2 = 0;
    let count1 = 0, count2 = 0;
    
    alliance.members.forEach(memberId => {
      if (memberId !== id1 && memberId !== id2) {
        const rel1 = this.gameManager.systems.relationshipSystem.getRelationship(id1, memberId);
        const rel2 = this.gameManager.systems.relationshipSystem.getRelationship(id2, memberId);
        
        if (rel1) {
          sum1 += rel1.value;
          count1++;
        }
        
        if (rel2) {
          sum2 += rel2.value;
          count2++;
        }
      }
    });
    
    const avg1 = count1 > 0 ? sum1 / count1 : 50;
    const avg2 = count2 > 0 ? sum2 / count2 : 50;
    
    // The one with lower average relationship is more likely to leave
    return avg1 < avg2 ? id1 : id2;
  }
  
  /**
   * Check if two survivors might form a new alliance
   * @param {number} id1 - First survivor ID
   * @param {number} id2 - Second survivor ID
   * @private
   */
  _checkForPotentialAlliance(id1, id2) {
    // Skip if either is the player
    const playerId = this.gameManager.getPlayerSurvivor()?.id;
    if (id1 === playerId || id2 === playerId) return;
    
    // Skip if they already share an alliance
    if (this.getSharedAlliances(id1, id2).length > 0) return;
    
    // Only consider if in same tribe
    const survivor1 = this._getSurvivorById(id1);
    const survivor2 = this._getSurvivorById(id2);
    
    if (!survivor1 || !survivor2) return;
    
    const tribes = this.gameManager.getTribes();
    let sameTribe = false;
    
    for (const tribe of tribes) {
      const inTribe1 = tribe.members.some(member => member.id === id1);
      const inTribe2 = tribe.members.some(member => member.id === id2);
      
      if (inTribe1 && inTribe2) {
        sameTribe = true;
        break;
      }
    }
    
    if (!sameTribe) return;
    
    // 20% chance of forming a new alliance
    if (Math.random() < 0.2) {
      // Create a new alliance with these two members
      this.createAlliance(`${survivor1.name}-${survivor2.name} Alliance`, [id1, id2]);
      
      console.log(`NPCs formed a new alliance between ${id1} and ${id2}`);
    }
  }
  
  /**
   * Create initial NPC alliances
   * @private
   */
  _createInitialNPCAlliances() {
    const tribes = this.gameManager.getTribes();
    
    if (!tribes || tribes.length === 0) return;
    
    // Create some initial alliances in each tribe
    tribes.forEach(tribe => {
      // Skip if tribe has less than 3 members
      if (!tribe.members || tribe.members.length < 3) return;
      
      // Get non-player members
      const npcMembers = tribe.members.filter(member => 
        !member.isPlayer && member.id !== this.gameManager.getPlayerSurvivor()?.id
      );
      
      // If we have relationships system, use it to form alliances
      if (this.gameManager.systems.relationshipSystem) {
        this._createNPCAlliancesWithRelationships(tribe.tribeName, npcMembers);
      } else {
        this._createRandomNPCAlliances(tribe.tribeName, npcMembers);
      }
    });
  }
  
  /**
   * Create NPC alliances based on relationships
   * @param {string} tribeName - The tribe name
   * @param {Array} npcMembers - Array of NPC members
   * @private
   */
  _createNPCAlliancesWithRelationships(tribeName, npcMembers) {
    const relationshipSystem = this.gameManager.systems.relationshipSystem;
    
    // Create a graph of relationships
    const relationshipGraph = {};
    
    // Initialize graph
    npcMembers.forEach(member => {
      relationshipGraph[member.id] = [];
    });
    
    // Add relationships as edges
    for (let i = 0; i < npcMembers.length; i++) {
      for (let j = i + 1; j < npcMembers.length; j++) {
        const id1 = npcMembers[i].id;
        const id2 = npcMembers[j].id;
        
        const relationship = relationshipSystem.getRelationship(id1, id2);
        
        if (relationship && relationship.value >= 60) {
          relationshipGraph[id1].push(id2);
          relationshipGraph[id2].push(id1);
        }
      }
    }
    
    // Find connected components (potential alliances)
    const visited = new Set();
    
    npcMembers.forEach(member => {
      if (!visited.has(member.id)) {
        const component = this._findConnectedComponent(relationshipGraph, member.id, visited);
        
        // If component is large enough, form an alliance
        if (component.length >= 2) {
          const memberNames = component.map(id => 
            npcMembers.find(m => m.id === id)?.name || `Survivor ${id}`
          );
          
          const allianceName = `${tribeName} ${memberNames[0]}-${memberNames[1]} Alliance`;
          this.createAlliance(allianceName, component);
          
          console.log(`Created NPC alliance: ${allianceName} with ${component.length} members`);
        }
      }
    });
  }
  
  /**
   * Find connected component in relationship graph
   * @param {Object} graph - Relationship graph
   * @param {number} startId - Starting survivor ID
   * @param {Set} visited - Set of visited survivor IDs
   * @returns {Array} Connected component
   * @private
   */
  _findConnectedComponent(graph, startId, visited) {
    const component = [];
    const queue = [startId];
    
    while (queue.length > 0) {
      const id = queue.shift();
      
      if (!visited.has(id)) {
        visited.add(id);
        component.push(id);
        
        graph[id].forEach(neighborId => {
          if (!visited.has(neighborId)) {
            queue.push(neighborId);
          }
        });
      }
    }
    
    return component;
  }
  
  /**
   * Create random NPC alliances
   * @param {string} tribeName - The tribe name
   * @param {Array} npcMembers - Array of NPC members
   * @private
   */
  _createRandomNPCAlliances(tribeName, npcMembers) {
    if (npcMembers.length < 2) return;
    
    // Decide how many alliances to create
    const allianceCount = Math.min(
      Math.floor(npcMembers.length / 2),
      Math.ceil(Math.random() * 2)
    );
    
    // Make a copy of members to work with
    const availableMembers = [...npcMembers];
    
    for (let i = 0; i < allianceCount; i++) {
      // Check if we have enough members left
      if (availableMembers.length < 2) break;
      
      // Decide alliance size (2-4 members)
      const size = Math.min(
        availableMembers.length,
        2 + Math.floor(Math.random() * 3)
      );
      
      // Select random members
      const members = [];
      for (let j = 0; j < size; j++) {
        const randomIndex = Math.floor(Math.random() * availableMembers.length);
        members.push(availableMembers[randomIndex].id);
        availableMembers.splice(randomIndex, 1);
      }
      
      // Create the alliance
      const name = `${tribeName} Alliance ${i + 1}`;
      this.createAlliance(name, members);
      
      console.log(`Created random NPC alliance: ${name} with ${members.length} members`);
    }
  }
  
  /**
   * Get survivor by ID
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
   * Create a new alliance
   * @param {string} name - Alliance name
   * @param {Array} memberIds - Array of member survivor IDs
   * @returns {Object} The created alliance
   */
  createAlliance(name, memberIds) {
    if (!name || !memberIds || memberIds.length < 2) {
      console.error('Invalid alliance data');
      return null;
    }
    
    // Create alliance object
    const alliance = {
      id: generateId(),
      name,
      members: [...memberIds],
      votes: {}, // Track voting intentions
      created: Date.now()
    };
    
    // Add to alliances list
    this.alliances.push(alliance);
    
    // Publish alliance formed event
    eventManager.publish(GameEvents.ALLIANCE_FORMED, {
      alliance
    });
    
    return alliance;
  }
  
  /**
   * Dissolve an alliance
   * @param {string} allianceId - Alliance ID
   * @returns {boolean} Whether the dissolution was successful
   */
  dissolveAlliance(allianceId) {
    const index = this.alliances.findIndex(a => a.id === allianceId);
    
    if (index === -1) {
      console.warn(`Alliance ${allianceId} not found`);
      return false;
    }
    
    const alliance = this.alliances[index];
    
    // Remove the alliance
    this.alliances.splice(index, 1);
    
    // Publish alliance disbanded event
    eventManager.publish(GameEvents.ALLIANCE_DISBANDED, {
      allianceId,
      allianceName: alliance.name,
      members: alliance.members
    });
    
    console.log(`Alliance ${alliance.name} dissolved`);
    
    return true;
  }
  
  /**
   * Add a member to an alliance
   * @param {string} allianceId - Alliance ID
   * @param {number} survivorId - Survivor ID
   * @returns {boolean} Whether the addition was successful
   */
  addMemberToAlliance(allianceId, survivorId) {
    const alliance = this.getAlliance(allianceId);
    
    if (!alliance) {
      console.warn(`Alliance ${allianceId} not found`);
      return false;
    }
    
    // Check if already a member
    if (alliance.members.includes(survivorId)) {
      console.warn(`Survivor ${survivorId} is already in alliance ${allianceId}`);
      return false;
    }
    
    // Add to alliance
    alliance.members.push(survivorId);
    
    // Publish alliance member added event
    eventManager.publish(GameEvents.ALLIANCE_MEMBER_ADDED, {
      allianceId,
      allianceName: alliance.name,
      survivorId
    });
    
    console.log(`Added survivor ${survivorId} to alliance ${alliance.name}`);
    
    return true;
  }
  
  /**
   * Remove a member from an alliance
   * @param {string} allianceId - Alliance ID
   * @param {number} survivorId - Survivor ID
   * @returns {boolean} Whether the removal was successful
   */
  removeMemberFromAlliance(allianceId, survivorId) {
    const alliance = this.getAlliance(allianceId);
    
    if (!alliance) {
      console.warn(`Alliance ${allianceId} not found`);
      return false;
    }
    
    // Check if member exists
    const index = alliance.members.indexOf(survivorId);
    if (index === -1) {
      console.warn(`Survivor ${survivorId} is not in alliance ${allianceId}`);
      return false;
    }
    
    // Remove from alliance
    alliance.members.splice(index, 1);
    
    // Publish alliance member removed event
    eventManager.publish(GameEvents.ALLIANCE_MEMBER_REMOVED, {
      allianceId,
      allianceName: alliance.name,
      survivorId,
      reason: 'left'
    });
    
    console.log(`Removed survivor ${survivorId} from alliance ${alliance.name}`);
    
    // If alliance is now too small, dissolve it
    if (alliance.members.length < 2) {
      this.dissolveAlliance(allianceId);
    }
    
    return true;
  }
  
  /**
   * Get an alliance by ID
   * @param {string} allianceId - Alliance ID
   * @returns {Object|null} Alliance object or null if not found
   */
  getAlliance(allianceId) {
    return this.alliances.find(a => a.id === allianceId) || null;
  }
  
  /**
   * Get all alliances that a survivor is a member of
   * @param {number} survivorId - Survivor ID
   * @returns {Array} Array of alliance objects
   */
  getSurvivorAlliances(survivorId) {
    return this.alliances.filter(alliance => 
      alliance.members.includes(survivorId)
    );
  }
  
  /**
   * Get all alliances shared by two survivors
   * @param {number} id1 - First survivor ID
   * @param {number} id2 - Second survivor ID
   * @returns {Array} Array of shared alliance objects
   */
  getSharedAlliances(id1, id2) {
    return this.alliances.filter(alliance => 
      alliance.members.includes(id1) && alliance.members.includes(id2)
    );
  }
  
  /**
   * Set a survivor's voting intention for an alliance
   * @param {string} allianceId - Alliance ID
   * @param {number} voterId - Voter survivor ID
   * @param {number} targetId - Target survivor ID
   * @returns {boolean} Whether the vote was set successfully
   */
  setAllianceVote(allianceId, voterId, targetId) {
    const alliance = this.getAlliance(allianceId);
    
    if (!alliance) {
      console.warn(`Alliance ${allianceId} not found`);
      return false;
    }
    
    // Check if voter is in alliance
    if (!alliance.members.includes(voterId)) {
      console.warn(`Survivor ${voterId} is not in alliance ${allianceId}`);
      return false;
    }
    
    // Set vote
    if (!alliance.votes) {
      alliance.votes = {};
    }
    
    alliance.votes[voterId] = targetId;
    
    // Publish vote cast event
    eventManager.publish(GameEvents.VOTE_CAST, {
      allianceId,
      voterId,
      targetId
    });
    
    console.log(`Survivor ${voterId} is voting for ${targetId} in alliance ${alliance.name}`);
    
    return true;
  }
  
  /**
   * Get alliance voting plan
   * @param {string} allianceId - Alliance ID
   * @returns {Object} Map of voter IDs to target IDs
   */
  getAllianceVotes(allianceId) {
    const alliance = this.getAlliance(allianceId);
    
    if (!alliance) {
      console.warn(`Alliance ${allianceId} not found`);
      return {};
    }
    
    return alliance.votes || {};
  }
  
  /**
   * Get all alliances
   * @returns {Array} All alliances
   */
  getAlliances() {
    return this.alliances;
  }
  
  /**
   * Set all alliances
   * @param {Array} alliances - Alliances to set
   */
  setAlliances(alliances) {
    this.alliances = alliances;
  }
}

export default AllianceSystem;