
class ActivityTracker {
  constructor() {
    this.activities = [];
  }

  trackActivity(type, data = {}) {
    const activity = {
      type,
      timestamp: Date.now(),
      day: window.gameManager?.getCurrentDay() || 1,
      ...data
    };
    
    this.activities.push(activity);
    console.log('Activity tracked:', activity);
  }

  getActivities(type = null) {
    if (type) {
      return this.activities.filter(activity => activity.type === type);
    }
    return this.activities;
  }

  getActivitiesByDay(day) {
    return this.activities.filter(activity => activity.day === day);
  }

  clearActivities() {
    this.activities = [];
  }

  // Specific tracking methods
  trackFishingAttempt(success = false, fishCaught = 0, fishType = null) {
    this.trackActivity('fishing_attempt', {
      success,
      fishCaught,
      fishType,
      player: window.gameManager?.getPlayerSurvivor()?.name || 'Unknown'
    });
  }

  trackFireBuilding(success = false, fireLevel = 0) {
    this.trackActivity('fire_building', {
      success,
      fireLevel,
      player: window.gameManager?.getPlayerSurvivor()?.name || 'Unknown'
    });
  }

  trackCooking(success = false, itemCooked = null, quantity = 0) {
    this.trackActivity('cooking', {
      success,
      itemCooked,
      quantity,
      player: window.gameManager?.getPlayerSurvivor()?.name || 'Unknown'
    });
  }

  trackShelterBuilding(success = false, coBuilder = null, shelterLevel = 0) {
    this.trackActivity('shelter_building', {
      success,
      coBuilder,
      shelterLevel,
      player: window.gameManager?.getPlayerSurvivor()?.name || 'Unknown'
    });
  }

  trackResourceGathering(resourceType, quantity = 0, location = null) {
    this.trackActivity('resource_gathering', {
      resourceType,
      quantity,
      location,
      player: window.gameManager?.getPlayerSurvivor()?.name || 'Unknown'
    });
  }

  trackWaterGathering(quantity = 0, forTribe = false) {
    this.trackActivity('water_gathering', {
      quantity,
      forTribe,
      player: window.gameManager?.getPlayerSurvivor()?.name || 'Unknown'
    });
  }

  trackTeamPlayerPoints(pointsEarned = 0, pointsLost = 0, reason = null) {
    this.trackActivity('team_player_points', {
      pointsEarned,
      pointsLost,
      reason,
      player: window.gameManager?.getPlayerSurvivor()?.name || 'Unknown'
    });
  }

  // Summary methods for reporting
  getFishingStats() {
    const fishingAttempts = this.getActivities('fishing_attempt');
    return {
      totalAttempts: fishingAttempts.length,
      successfulCatches: fishingAttempts.filter(a => a.success).length,
      totalFishCaught: fishingAttempts.reduce((sum, a) => sum + (a.fishCaught || 0), 0)
    };
  }

  getResourceStats() {
    const resourceGathering = this.getActivities('resource_gathering');
    const stats = {};
    
    resourceGathering.forEach(activity => {
      if (!stats[activity.resourceType]) {
        stats[activity.resourceType] = 0;
      }
      stats[activity.resourceType] += activity.quantity || 0;
    });
    
    return stats;
  }
}

// Create global instance
const activityTracker = new ActivityTracker();

// Make it globally accessible
if (typeof window !== 'undefined') {
  window.activityTracker = activityTracker;
}

export default activityTracker;
