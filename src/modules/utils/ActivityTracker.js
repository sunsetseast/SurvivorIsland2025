
/**
 * @module ActivityTracker
 * Non-intrusive activity tracker that passively observes player actions
 * without interfering with existing game functionality
 */

// Initialize global activity tracker if it doesn't exist
if (!window.activityTracker) {
  window.activityTracker = {
    // Player activities
    fishingAttempts: [],
    fishCaught: [],
    fireAttempts: [],
    fireSuccesses: [],
    cookingAttempts: [],
    cookingResults: [],
    shelterBuilds: [],
    resourceGathering: [],
    waterGathering: [],
    teamPlayerChanges: [],
    
    // Session tracking
    sessionStart: Date.now(),
    currentView: null,
    viewHistory: []
  };
}

/**
 * Track fishing attempt
 */
export function trackFishingAttempt(success = false, fishCount = 0) {
  const tracker = window.activityTracker;
  
  tracker.fishingAttempts.push({
    timestamp: Date.now(),
    success,
    timeDeducted: 300 // 5 minutes in seconds
  });
  
  if (success && fishCount > 0) {
    tracker.fishCaught.push({
      timestamp: Date.now(),
      amount: fishCount,
      fishType: fishCount === 1 ? 'common' : fishCount === 3 ? 'uncommon' : 'rare'
    });
  }
  
  console.log(`[ActivityTracker] Fishing attempt: success=${success}, fishCount=${fishCount}`);
}

/**
 * Track fire building attempt
 */
export function trackFireAttempt(success = false, isTending = false, firewoodUsed = 0) {
  const tracker = window.activityTracker;
  
  tracker.fireAttempts.push({
    timestamp: Date.now(),
    success,
    isTending,
    firewoodUsed,
    timeDeducted: 300 // 5 minutes in seconds
  });
  
  if (success) {
    tracker.fireSuccesses.push({
      timestamp: Date.now(),
      type: isTending ? 'tend' : 'build',
      firewoodUsed
    });
  }
  
  console.log(`[ActivityTracker] Fire attempt: success=${success}, tending=${isTending}, firewood=${firewoodUsed}`);
}

/**
 * Track cooking activity
 */
export function trackCooking(ingredient, quantity, success = true) {
  const tracker = window.activityTracker;
  
  tracker.cookingAttempts.push({
    timestamp: Date.now(),
    ingredient,
    quantity,
    success
  });
  
  if (success) {
    tracker.cookingResults.push({
      timestamp: Date.now(),
      ingredient,
      quantity,
      result: 'cooked'
    });
  }
  
  console.log(`[ActivityTracker] Cooking: ${ingredient} x${quantity}, success=${success}`);
}

/**
 * Track shelter building
 */
export function trackShelterBuild(coBuilderName, bambooUsed, palmsUsed, timeSpent) {
  const tracker = window.activityTracker;
  
  tracker.shelterBuilds.push({
    timestamp: Date.now(),
    coBuilder: coBuilderName,
    bambooUsed,
    palmsUsed,
    timeSpent
  });
  
  console.log(`[ActivityTracker] Shelter built with ${coBuilderName}, time: ${timeSpent}min`);
}

/**
 * Track resource gathering
 */
export function trackResourceGathering(resource, amount, location, success = true) {
  const tracker = window.activityTracker;
  
  tracker.resourceGathering.push({
    timestamp: Date.now(),
    resource,
    amount,
    location,
    success
  });
  
  console.log(`[ActivityTracker] Resource gathered: ${resource} x${amount} at ${location}`);
}

/**
 * Track water gathering
 */
export function trackWaterGathering(amount, forTribe = false) {
  const tracker = window.activityTracker;
  
  tracker.waterGathering.push({
    timestamp: Date.now(),
    amount,
    forTribe,
    recipient: forTribe ? 'tribe' : 'self'
  });
  
  console.log(`[ActivityTracker] Water gathered: ${amount} for ${forTribe ? 'tribe' : 'self'}`);
}

/**
 * Track team player points changes
 */
export function trackTeamPlayerChange(amount, reason) {
  const tracker = window.activityTracker;
  
  tracker.teamPlayerChanges.push({
    timestamp: Date.now(),
    amount,
    reason
  });
  
  console.log(`[ActivityTracker] Team player points: ${amount > 0 ? '+' : ''}${amount} (${reason})`);
}

/**
 * Track view changes (passive observation)
 */
export function trackViewChange(viewName) {
  const tracker = window.activityTracker;
  
  tracker.currentView = viewName;
  tracker.viewHistory.push({
    timestamp: Date.now(),
    view: viewName
  });
  
  // Keep only last 50 view changes to prevent memory bloat
  if (tracker.viewHistory.length > 50) {
    tracker.viewHistory = tracker.viewHistory.slice(-50);
  }
  
  console.log(`[ActivityTracker] View changed to: ${viewName}`);
}

/**
 * Get comprehensive activity summary for SummaryView
 */
export function getActivitySummary() {
  const tracker = window.activityTracker;
  
  return {
    // Fishing summary
    fishing: {
      totalAttempts: tracker.fishingAttempts.length,
      successfulAttempts: tracker.fishingAttempts.filter(a => a.success).length,
      totalFishCaught: tracker.fishCaught.reduce((sum, f) => sum + f.amount, 0),
      fishByType: {
        common: tracker.fishCaught.filter(f => f.fishType === 'common').length,
        uncommon: tracker.fishCaught.filter(f => f.fishType === 'uncommon').length,
        rare: tracker.fishCaught.filter(f => f.fishType === 'rare').length
      }
    },
    
    // Fire summary
    fire: {
      totalAttempts: tracker.fireAttempts.length,
      successfulAttempts: tracker.fireSuccesses.length,
      builds: tracker.fireSuccesses.filter(f => f.type === 'build').length,
      tends: tracker.fireSuccesses.filter(f => f.type === 'tend').length,
      totalFirewoodUsed: tracker.fireAttempts.reduce((sum, f) => sum + f.firewoodUsed, 0)
    },
    
    // Cooking summary
    cooking: {
      totalAttempts: tracker.cookingAttempts.length,
      successfulCooks: tracker.cookingResults.length,
      itemsCooked: tracker.cookingResults.reduce((acc, c) => {
        acc[c.ingredient] = (acc[c.ingredient] || 0) + c.quantity;
        return acc;
      }, {})
    },
    
    // Shelter summary
    shelter: {
      totalBuilds: tracker.shelterBuilds.length,
      coBuilders: [...new Set(tracker.shelterBuilds.map(s => s.coBuilder))],
      totalBambooUsed: tracker.shelterBuilds.reduce((sum, s) => sum + s.bambooUsed, 0),
      totalPalmsUsed: tracker.shelterBuilds.reduce((sum, s) => sum + s.palmsUsed, 0)
    },
    
    // Resource gathering summary
    resources: tracker.resourceGathering.reduce((acc, r) => {
      if (!acc[r.resource]) acc[r.resource] = { total: 0, locations: [] };
      acc[r.resource].total += r.amount;
      if (!acc[r.resource].locations.includes(r.location)) {
        acc[r.resource].locations.push(r.location);
      }
      return acc;
    }, {}),
    
    // Water summary
    water: {
      totalGathered: tracker.waterGathering.reduce((sum, w) => sum + w.amount, 0),
      forSelf: tracker.waterGathering.filter(w => !w.forTribe).reduce((sum, w) => sum + w.amount, 0),
      forTribe: tracker.waterGathering.filter(w => w.forTribe).reduce((sum, w) => sum + w.amount, 0)
    },
    
    // Team player summary
    teamPlayer: {
      totalChanges: tracker.teamPlayerChanges.length,
      netGain: tracker.teamPlayerChanges.reduce((sum, t) => sum + t.amount, 0),
      reasons: tracker.teamPlayerChanges.map(t => t.reason)
    },
    
    // Session info
    session: {
      duration: Date.now() - tracker.sessionStart,
      uniqueViewsVisited: [...new Set(tracker.viewHistory.map(v => v.view))].length
    }
  };
}

/**
 * Reset tracker (for new game sessions)
 */
export function resetActivityTracker() {
  window.activityTracker = {
    fishingAttempts: [],
    fishCaught: [],
    fireAttempts: [],
    fireSuccesses: [],
    cookingAttempts: [],
    cookingResults: [],
    shelterBuilds: [],
    resourceGathering: [],
    waterGathering: [],
    teamPlayerChanges: [],
    sessionStart: Date.now(),
    currentView: null,
    viewHistory: []
  };
  
  console.log('[ActivityTracker] Tracker reset for new session');
}

/**
 * Export tracker data for debugging
 */
export function exportTrackerData() {
  return JSON.stringify(window.activityTracker, null, 2);
}
