/**
 * @module GameData
 * Central data store for game information
 */

// Default survivor data if not provided elsewhere
const DEFAULT_SURVIVORS = [
  {
    id: 1,
    name: "Alex",
    gender: "male",
    age: 28,
    occupation: "Firefighter",
    archetype: "Physical Threat",
    physical: 8,
    mental: 6,
    personality: 7,
    health: 100,
    avatarUrl: null
  },
  {
    id: 2,
    name: "Brooke",
    gender: "female",
    age: 31,
    occupation: "Attorney",
    archetype: "Strategist",
    physical: 5,
    mental: 9,
    personality: 7,
    health: 100,
    avatarUrl: null
  },
  {
    id: 3,
    name: "Carlos",
    gender: "male",
    age: 26,
    occupation: "Personal Trainer",
    archetype: "Social Threat",
    physical: 9,
    mental: 5,
    personality: 8,
    health: 100,
    avatarUrl: null
  },
  {
    id: 4,
    name: "Diana",
    gender: "female",
    age: 24,
    occupation: "Graduate Student",
    archetype: "Underdog",
    physical: 6,
    mental: 8,
    personality: 6,
    health: 100,
    avatarUrl: null
  },
  {
    id: 5,
    name: "Ethan",
    gender: "male",
    age: 35,
    occupation: "Fishing Guide",
    archetype: "Outdoorsman",
    physical: 8,
    mental: 7,
    personality: 5,
    health: 100,
    avatarUrl: null
  },
  {
    id: 6,
    name: "Fiona",
    gender: "female",
    age: 29,
    occupation: "Nurse",
    archetype: "Caretaker",
    physical: 6,
    mental: 7,
    personality: 9,
    health: 100,
    avatarUrl: null
  },
  {
    id: 7,
    name: "Greg",
    gender: "male",
    age: 41,
    occupation: "Construction Manager",
    archetype: "Leader",
    physical: 7,
    mental: 6,
    personality: 8,
    health: 100,
    avatarUrl: null
  },
  {
    id: 8,
    name: "Hannah",
    gender: "female",
    age: 33,
    occupation: "Teacher",
    archetype: "Social Butterfly",
    physical: 5,
    mental: 7,
    personality: 9,
    health: 100,
    avatarUrl: null
  },
  {
    id: 9,
    name: "Ian",
    gender: "male",
    age: 27,
    occupation: "Bartender",
    archetype: "Wildcard",
    physical: 7,
    mental: 7,
    personality: 8,
    health: 100,
    avatarUrl: null
  },
  {
    id: 10,
    name: "Jessica",
    gender: "female",
    age: 25,
    occupation: "Marketing Executive",
    archetype: "Social Manipulator",
    physical: 4,
    mental: 9,
    personality: 8,
    health: 100,
    avatarUrl: null
  },
  {
    id: 11,
    name: "Kevin",
    gender: "male",
    age: 38,
    occupation: "Accountant",
    archetype: "Under the Radar",
    physical: 5,
    mental: 8,
    personality: 6,
    health: 100,
    avatarUrl: null
  },
  {
    id: 12,
    name: "Lisa",
    gender: "female",
    age: 30,
    occupation: "Fitness Instructor",
    archetype: "Challenge Beast",
    physical: 9,
    mental: 6,
    personality: 7,
    health: 100,
    avatarUrl: null
  },
  {
    id: 13,
    name: "Michael",
    gender: "male",
    age: 29,
    occupation: "App Developer",
    archetype: "Nerd",
    physical: 4,
    mental: 10,
    personality: 5,
    health: 100,
    avatarUrl: null
  },
  {
    id: 14,
    name: "Natalie",
    gender: "female",
    age: 32,
    occupation: "Professional Surfer",
    archetype: "Free Spirit",
    physical: 8,
    mental: 6,
    personality: 8,
    health: 100,
    avatarUrl: null
  },
  {
    id: 15,
    name: "Oliver",
    gender: "male",
    age: 42,
    occupation: "Park Ranger",
    archetype: "Survivalist",
    physical: 7,
    mental: 8,
    personality: 6,
    health: 100,
    avatarUrl: null
  },
  {
    id: 16,
    name: "Paige",
    gender: "female",
    age: 26,
    occupation: "Yoga Instructor",
    archetype: "Spiritual Guide",
    physical: 7,
    mental: 6,
    personality: 8,
    health: 100,
    avatarUrl: null
  }
];

// Default challenge data
const DEFAULT_CHALLENGES = {
  immunity: [
    {
      id: 1,
      name: "Balance Beam Puzzle",
      description: "Survivors must cross a series of balance beams, collecting puzzle pieces along the way, then solve the puzzle.",
      type: "individual",
      attributes: ["physical", "mental"],
      difficulty: 7
    },
    {
      id: 2,
      name: "Memory Match",
      description: "Survivors must memorize a sequence of symbols and recreate them in order.",
      type: "individual",
      attributes: ["mental"],
      difficulty: 6
    },
    {
      id: 3,
      name: "Water Carry",
      description: "Tribes must transport water from the ocean to fill a container, using leaky buckets.",
      type: "tribal",
      attributes: ["physical", "teamwork"],
      difficulty: 8
    },
    {
      id: 4,
      name: "Obstacle Course",
      description: "Survivors must navigate a complex obstacle course, retrieving keys that unlock advantages in the final stage.",
      type: "individual",
      attributes: ["physical", "endurance"],
      difficulty: 9
    },
    {
      id: 5,
      name: "Blind Maze",
      description: "One tribe member must navigate a maze blindfolded, guided only by the calls of their tribemates.",
      type: "tribal",
      attributes: ["teamwork", "communication"],
      difficulty: 7
    }
  ],
  reward: [
    {
      id: 1,
      name: "Coconut Bowling",
      description: "Survivors must roll coconuts down a lane, trying to knock over wooden pins.",
      type: "tribal",
      attributes: ["physical", "precision"],
      difficulty: 5,
      reward: "Fishing kit"
    },
    {
      id: 2,
      name: "Auction",
      description: "Survivors bid on covered items which may be food, advantages, or nothing at all.",
      type: "individual",
      attributes: ["strategy"],
      difficulty: 3,
      reward: "Various food items and advantages"
    },
    {
      id: 3,
      name: "Log Rolling",
      description: "Survivors must roll a heavy log through an obstacle course as a team.",
      type: "tribal",
      attributes: ["physical", "teamwork"],
      difficulty: 8,
      reward: "Comfort items (pillows, blankets)"
    },
    {
      id: 4,
      name: "Rescue Mission",
      description: "Tribes must rescue a 'stranded' team member by constructing a stretcher and carrying them through the jungle.",
      type: "tribal",
      attributes: ["physical", "ingenuity"],
      difficulty: 7,
      reward: "Barbecue feast"
    },
    {
      id: 5,
      name: "Survivor Quiz",
      description: "Survivors answer questions about the island, survival skills, and their tribemates.",
      type: "individual",
      attributes: ["mental", "social"],
      difficulty: 4,
      reward: "Letters from home"
    }
  ]
};

// Default tribe data
const DEFAULT_TRIBE_NAMES = [
  { name: "Tagi", color: "#5c6bc0" }, // Blue
  { name: "Moto", color: "#66bb6a" }, // Green  
  { name: "Fang", color: "#ef5350" }  // Red
];

// Default location data
const DEFAULT_LOCATIONS = {
  Beach: {
    description: "A long stretch of golden sand with crystal clear water. Perfect for swimming and finding seafood.",
    resources: ["fish", "coconuts", "shells"],
    activities: ["fishing", "swimming", "relaxing", "idol hunting"],
    energyCost: 1
  },
  Jungle: {
    description: "A dense tropical forest with tall trees, exotic plants, and hidden creatures.",
    resources: ["fruits", "wood", "medicinal plants"],
    activities: ["foraging", "exploring", "idol hunting"],
    energyCost: 2
  },
  Camp: {
    description: "Your tribe's home base, with a shelter, fire pit, and basic tools.",
    resources: ["water", "fire", "shelter"],
    activities: ["resting", "cooking", "socializing", "strategy", "idol hunting"],
    energyCost: 0
  },
  "Private Area": {
    description: "A secluded spot away from camp, perfect for private conversations and strategizing.",
    resources: [],
    activities: ["strategizing", "alliance building", "idol hunting"],
    energyCost: 1
  }
};

class GameData {
  constructor() {
    this.survivors = null;
    this.challenges = null;
    this.tribeNames = null;
    this.locations = null;
    
    // Initialize with default data
    this.initializeDefaultData();
  }
  
  /**
   * Initialize with default data if not provided
   */
  initializeDefaultData() {
    this.survivors = DEFAULT_SURVIVORS;
    this.challenges = DEFAULT_CHALLENGES;
    this.tribeNames = DEFAULT_TRIBE_NAMES;
    this.locations = DEFAULT_LOCATIONS;
  }
  
  /**
   * Get all survivors
   * @returns {Array} Array of survivor objects
   */
  getSurvivors() {
    return this.survivors;
  }
  
  /**
   * Set survivors data
   * @param {Array} survivors - Array of survivor objects
   */
  setSurvivors(survivors) {
    this.survivors = survivors;
  }
  
  /**
   * Get challenges
   * @param {string} type - Challenge type ('immunity' or 'reward')
   * @returns {Array} Array of challenge objects
   */
  getChallenges(type) {
    if (type) {
      return this.challenges[type] || [];
    }
    return this.challenges;
  }
  
  /**
   * Set challenges data
   * @param {Object} challenges - Challenge data
   */
  setChallenges(challenges) {
    this.challenges = challenges;
  }
  
  /**
   * Get tribe names
   * @returns {Array} Array of tribe name objects
   */
  getTribeNames() {
    return this.tribeNames;
  }
  
  /**
   * Set tribe names
   * @param {Array} tribeNames - Array of tribe name objects
   */
  setTribeNames(tribeNames) {
    this.tribeNames = tribeNames;
  }
  
  /**
   * Get locations
   * @param {string} locationName - Optional specific location name
   * @returns {Object} Location data
   */
  getLocations(locationName) {
    if (locationName) {
      return this.locations[locationName] || null;
    }
    return this.locations;
  }
  
  /**
   * Set locations data
   * @param {Object} locations - Locations data
   */
  setLocations(locations) {
    this.locations = locations;
  }
}

// Create and export singleton instance
const gameData = new GameData();
export default gameData;