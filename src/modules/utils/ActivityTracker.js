
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
    
    // New detailed tracking
    fishing: {
      attempts: 0,
      successfulCatches: 0,
      totalFishCaught: 0
    },
    fire: {
      attempts: 0,
      successful: false,
      tendAttempts: 0,
      tendSuccessful: 0
    },
    shelter: {
      attempts: 0,
      successful: false,
      coBuilders: []
    },
    resources: {
      bamboo: { attempts: 0, gathered: 0 },
      firewood: { attempts: 0, gathered: 0 },
      coconuts: { attempts: 0, gathered: 0 },
      palms: { attempts: 0, gathered: 0 }
    },
    water: {
      attempts: 0,
      forSelf: 0,
      forTribe: 0
    }
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

// New detailed tracking functions
export function trackFishingAttempt(caught = 0) {
  const tracker = window.campActivityTracker;
  tracker.fishing.attempts++;
  if (caught > 0) {
    tracker.fishing.successfulCatches++;
    tracker.fishing.totalFishCaught += caught;
  }
  console.log('Fishing attempt tracked:', { attempts: tracker.fishing.attempts, caught });
}

export function trackFireAttempt(type = 'make', successful = false) {
  const tracker = window.campActivityTracker;
  if (type === 'make') {
    tracker.fire.attempts++;
    if (successful) {
      tracker.fire.successful = true;
    }
  } else if (type === 'tend') {
    tracker.fire.tendAttempts++;
    if (successful) {
      tracker.fire.tendSuccessful++;
    }
  }
  console.log('Fire attempt tracked:', { type, successful });
}

export function trackShelterBuilding(coBuilders = [], successful = false) {
  const tracker = window.campActivityTracker;
  tracker.shelter.attempts++;
  if (successful) {
    tracker.shelter.successful = true;
    tracker.shelter.coBuilders = coBuilders;
  }
  console.log('Shelter building tracked:', { successful, coBuilders });
}

export function trackResourceAttempt(resourceType, amount = 0) {
  const tracker = window.campActivityTracker;
  if (tracker.resources[resourceType]) {
    tracker.resources[resourceType].attempts++;
    if (amount > 0) {
      tracker.resources[resourceType].gathered += amount;
    }
  }
  console.log('Resource attempt tracked:', { resourceType, amount });
}

export function trackWaterGathering(type = 'self') {
  const tracker = window.campActivityTracker;
  tracker.water.attempts++;
  if (type === 'self') {
    tracker.water.forSelf++;
  } else if (type === 'tribe') {
    tracker.water.forTribe++;
  }
  console.log('Water gathering tracked:', { type });
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
    
    fishing: {
      attempts: 0,
      successfulCatches: 0,
      totalFishCaught: 0
    },
    fire: {
      attempts: 0,
      successful: false,
      tendAttempts: 0,
      tendSuccessful: 0
    },
    shelter: {
      attempts: 0,
      successful: false,
      coBuilders: []
    },
    resources: {
      bamboo: { attempts: 0, gathered: 0 },
      firewood: { attempts: 0, gathered: 0 },
      coconuts: { attempts: 0, gathered: 0 },
      palms: { attempts: 0, gathered: 0 }
    },
    water: {
      attempts: 0,
      forSelf: 0,
      forTribe: 0
    }
  };
  console.log('Activity tracker reset');
}

export function getActivityTracker() {
  return window.campActivityTracker;
}

export function getPlayerActivitySummary() {
  const tracker = window.campActivityTracker;
  return {
    fishing: { ...tracker.fishing },
    fire: { ...tracker.fire },
    shelter: { ...tracker.shelter },
    resources: { ...tracker.resources },
    water: { ...tracker.water },
    generalActions: [...tracker.playerActions]
  };
}
