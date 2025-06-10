
/**
 * @module ActivityTracker
 * Tracks player and NPC activities during camp phase
 */

// Initialize global activity tracker
if (!window.campActivityTracker) {
  window.campActivityTracker = {
    playerActions: [],
    npcActions: [],
    relationships: {},
    resourcesGathered: {},
    fireAttempts: [],
    shelterBuilders: [],
    leadershipActions: [],
    bonding: [],
    conflicts: []
  };
}

export function trackPlayerAction(action, details = '') {
  if (!window.campActivityTracker.playerActions) {
    window.campActivityTracker.playerActions = [];
  }
  
  const actionString = details ? `${action} (${details})` : action;
  window.campActivityTracker.playerActions.push(actionString);
  console.log('Player action tracked:', actionString);
}

export function trackNPCAction(survivorId, action, details = '') {
  if (!window.campActivityTracker.npcActions) {
    window.campActivityTracker.npcActions = [];
  }
  
  const actionString = details ? `${action} (${details})` : action;
  window.campActivityTracker.npcActions.push({
    survivorId,
    action: actionString,
    timestamp: Date.now()
  });
  console.log('NPC action tracked:', actionString);
}

export function trackResourceGathering(survivorId, resource, amount = 1) {
  if (!window.campActivityTracker.resourcesGathered) {
    window.campActivityTracker.resourcesGathered = {};
  }
  
  if (!window.campActivityTracker.resourcesGathered[survivorId]) {
    window.campActivityTracker.resourcesGathered[survivorId] = {};
  }
  
  window.campActivityTracker.resourcesGathered[survivorId][resource] = 
    (window.campActivityTracker.resourcesGathered[survivorId][resource] || 0) + amount;
}

export function resetActivityTracker() {
  window.campActivityTracker = {
    playerActions: [],
    npcActions: [],
    relationships: {},
    resourcesGathered: {},
    fireAttempts: [],
    shelterBuilders: [],
    leadershipActions: [],
    bonding: [],
    conflicts: []
  };
  console.log('Activity tracker reset');
}

export function getActivityTracker() {
  return window.campActivityTracker;
}
