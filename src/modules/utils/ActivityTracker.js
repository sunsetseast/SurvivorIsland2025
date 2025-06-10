
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
    conflicts: [],
    fishingAttempts: [],
    cookingAttempts: [],
    waterGathering: [],
    teamPlayerChanges: []
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

export function trackFishingAttempt(success = false, fishCaught = 0) {
  if (!window.campActivityTracker.fishingAttempts) {
    window.campActivityTracker.fishingAttempts = [];
  }
  
  const attempt = {
    success,
    fishCaught,
    timestamp: Date.now()
  };
  
  window.campActivityTracker.fishingAttempts.push(attempt);
  console.log('Fishing attempt tracked:', attempt);
}

export function trackFireAttempt(success = false, fireLevel = 0) {
  if (!window.campActivityTracker.fireAttempts) {
    window.campActivityTracker.fireAttempts = [];
  }
  
  const attempt = {
    success,
    fireLevel,
    timestamp: Date.now()
  };
  
  window.campActivityTracker.fireAttempts.push(attempt);
  console.log('Fire attempt tracked:', attempt);
}

export function trackCookingAttempt(success = false, itemCooked = '', amount = 0) {
  if (!window.campActivityTracker.cookingAttempts) {
    window.campActivityTracker.cookingAttempts = [];
  }
  
  const attempt = {
    success,
    itemCooked,
    amount,
    timestamp: Date.now()
  };
  
  window.campActivityTracker.cookingAttempts.push(attempt);
  console.log('Cooking attempt tracked:', attempt);
}

export function trackShelterBuilding(coBuilder = null, shelterLevel = 0) {
  if (!window.campActivityTracker.shelterBuilders) {
    window.campActivityTracker.shelterBuilders = [];
  }
  
  const shelterData = {
    coBuilder,
    shelterLevel,
    timestamp: Date.now()
  };
  
  window.campActivityTracker.shelterBuilders.push(shelterData);
  console.log('Shelter building tracked:', shelterData);
}

export function trackResourceAttempt(resourceType, amount, success = true) {
  if (!window.campActivityTracker.resourcesGathered) {
    window.campActivityTracker.resourcesGathered = {};
  }
  
  if (!window.campActivityTracker.resourcesGathered.player) {
    window.campActivityTracker.resourcesGathered.player = {};
  }
  
  if (success) {
    window.campActivityTracker.resourcesGathered.player[resourceType] = 
      (window.campActivityTracker.resourcesGathered.player[resourceType] || 0) + amount;
  }
  
  console.log('Resource attempt tracked:', { resourceType, amount, success });
}

export function trackWaterGathering(type = 'self', amount = 0) {
  if (!window.campActivityTracker.waterGathering) {
    window.campActivityTracker.waterGathering = [];
  }
  
  const waterData = {
    type, // 'self' or 'tribe'
    amount,
    timestamp: Date.now()
  };
  
  window.campActivityTracker.waterGathering.push(waterData);
  console.log('Water gathering tracked:', waterData);
}

export function trackTeamPlayerChange(change, reason = '') {
  if (!window.campActivityTracker.teamPlayerChanges) {
    window.campActivityTracker.teamPlayerChanges = [];
  }
  
  const changeData = {
    change,
    reason,
    timestamp: Date.now()
  };
  
  window.campActivityTracker.teamPlayerChanges.push(changeData);
  console.log('TeamPlayer change tracked:', changeData);
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
    conflicts: [],
    fishingAttempts: [],
    cookingAttempts: [],
    waterGathering: [],
    teamPlayerChanges: []
  };
  console.log('Activity tracker reset');
}

export function getActivityTracker() {
  return window.campActivityTracker;
}
