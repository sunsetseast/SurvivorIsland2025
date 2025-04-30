/**
 * @module GameData
 * Central data store for game information
 */

const DEFAULT_SURVIVORS = [
  {
    id: 1,
    name: "Sandra Diaz-Twine",
    firstName: "Sandra",
    gender: "female",
    age: 45,
    season: "Pearl Islands",
    archetype: "Strategist",
    physical: 4,
    mental: 9,
    personality: 8,
    health: 100,
    avatarUrl: null
  },
  {
    id: 2,
    name: "Russell Hantz",
    firstName: "Russell",
    gender: "male",
    age: 47,
    season: "Samoa",
    archetype: "Villain",
    physical: 5,
    mental: 8,
    personality: 9,
    health: 100,
    avatarUrl: null
  },
  {
    id: 3,
    name: "Parvati Shallow",
    firstName: "Parvati",
    gender: "female",
    age: 38,
    season: "Cook Islands",
    archetype: "Social Manipulator",
    physical: 7,
    mental: 8,
    personality: 10,
    health: 100,
    avatarUrl: null
  },
  {
    id: 4,
    name: "Tony Vlachos",
    firstName: "Tony",
    gender: "male",
    age: 46,
    season: "Cagayan",
    archetype: "Wildcard",
    physical: 8,
    mental: 9,
    personality: 8,
    health: 100,
    avatarUrl: null
  },
  {
    id: 5,
    name: "Cirie Fields",
    firstName: "Cirie",
    gender: "female",
    age: 50,
    season: "Panama",
    archetype: "Underdog",
    physical: 3,
    mental: 10,
    personality: 9,
    health: 100,
    avatarUrl: null
  },
  {
    id: 6,
    name: "Ozzy Lusth",
    firstName: "Ozzy",
    gender: "male",
    age: 39,
    season: "Cook Islands",
    archetype: "Challenge Beast",
    physical: 10,
    mental: 6,
    personality: 7,
    health: 100,
    avatarUrl: null
  },
  {
    id: 7,
    name: "Natalie Anderson",
    firstName: "Natalie",
    gender: "female",
    age: 32,
    season: "San Juan del Sur",
    archetype: "Physical Threat",
    physical: 9,
    mental: 7,
    personality: 8,
    health: 100,
    avatarUrl: null
  },
  {
    id: 8,
    name: "Yul Kwon",
    firstName: "Yul",
    gender: "male",
    age: 40,
    season: "Cook Islands",
    archetype: "Brains",
    physical: 6,
    mental: 10,
    personality: 7,
    health: 100,
    avatarUrl: null
  },
  {
    id: 9,
    name: "Boston Rob Mariano",
    firstName: "Rob",
    gender: "male",
    age: 44,
    season: "Marquesas",
    archetype: "Leader",
    physical: 8,
    mental: 8,
    personality: 9,
    health: 100,
    avatarUrl: null
  },
  {
    id: 10,
    name: "Kim Spradlin",
    firstName: "Kim",
    gender: "female",
    age: 36,
    season: "One World",
    archetype: "Strategist",
    physical: 7,
    mental: 9,
    personality: 8,
    health: 100,
    avatarUrl: null
  },
  {
    id: 11,
    name: "Tyson Apostol",
    firstName: "Tyson",
    gender: "male",
    age: 42,
    season: "Tocantins",
    archetype: "Free Spirit",
    physical: 8,
    mental: 7,
    personality: 9,
    health: 100,
    avatarUrl: null
  },
  {
    id: 12,
    name: "Michele Fitzgerald",
    firstName: "Michele",
    gender: "female",
    age: 32,
    season: "Kaôh Rōng",
    archetype: "Social Threat",
    physical: 6,
    mental: 8,
    personality: 9,
    health: 100,
    avatarUrl: null
  },
  {
    id: 13,
    name: "Jeremy Collins",
    firstName: "Jeremy",
    gender: "male",
    age: 40,
    season: "San Juan del Sur",
    archetype: "Protector",
    physical: 8,
    mental: 8,
    personality: 8,
    health: 100,
    avatarUrl: null
  },
  {
    id: 14,
    name: "Aubry Bracco",
    firstName: "Aubry",
    gender: "female",
    age: 35,
    season: "Kaôh Rōng",
    archetype: "Underdog",
    physical: 5,
    mental: 10,
    personality: 8,
    health: 100,
    avatarUrl: null
  },
  {
    id: 15,
    name: "Joe Anglim",
    firstName: "Joe",
    gender: "male",
    age: 31,
    season: "Worlds Apart",
    archetype: "Challenge Beast",
    physical: 10,
    mental: 6,
    personality: 8,
    health: 100,
    avatarUrl: null
  },
  {
    id: 16,
    name: "Denise Stapley",
    firstName: "Denise",
    gender: "female",
    age: 48,
    season: "Philippines",
    archetype: "Balanced",
    physical: 7,
    mental: 8,
    personality: 7,
    health: 100,
    avatarUrl: null
  },
  {
    id: 17,
    name: "J.T. Thomas",
    firstName: "J.T.",
    gender: "male",
    age: 38,
    season: "Tocantins",
    archetype: "Hero",
    physical: 9,
    mental: 7,
    personality: 9,
    health: 100,
    avatarUrl: null
  },
  {
    id: 18,
    name: "Andrea Boehlke",
    firstName: "Andrea",
    gender: "female",
    age: 33,
    season: "Redemption Island",
    archetype: "Strategic Socialite",
    physical: 7,
    mental: 8,
    personality: 9,
    health: 100,
    avatarUrl: null
  }
];

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

const DEFAULT_TRIBE_NAMES = [
  { name: "Tagi", color: "#5c6bc0" },
  { name: "Moto", color: "#66bb6a" },
  { name: "Fang", color: "#ef5350" },
  { name: "Bayon", color: "#f06292" },
  { name: "Luvu", color: "#0288d1" },
  { name: "Tika", color: "#7e57c2" },
  { name: "Ratu", color: "#f57c00" },
  { name: "Soka", color: "#4db6ac" },
  { name: "Yanuya", color: "#d4e157" },
  { name: "Galang", color: "#ff7043" },
  { name: "Salani", color: "#26a69a" },
  { name: "Nuku", color: "#9575cd" },
  { name: "Manono", color: "#c2185b" },
  { name: "Jabeni", color: "#8d6e63" },
  { name: "Tandang", color: "#fbc02d" },
  { name: "Zhan Hu", color: "#d84315" },
  { name: "Ikabula", color: "#43a047" },
  { name: "La Mina", color: "#90a4ae" }
];

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
    this.initializeDefaultData();
  }

  initializeDefaultData() {
    this.survivors = DEFAULT_SURVIVORS;
    this.challenges = DEFAULT_CHALLENGES;
    this.tribeNames = DEFAULT_TRIBE_NAMES;
    this.locations = DEFAULT_LOCATIONS;
  }

  getSurvivors() {
    return this.survivors;
  }

  setSurvivors(survivors) {
    this.survivors = survivors;
  }

  getChallenges(type) {
    return type ? this.challenges[type] || [] : this.challenges;
  }

  setChallenges(challenges) {
    this.challenges = challenges;
  }

  getTribeNames() {
    return this.tribeNames;
  }

  setTribeNames(tribeNames) {
    this.tribeNames = tribeNames;
  }

  getLocations(locationName) {
    return locationName ? this.locations[locationName] || null : this.locations;
  }

  setLocations(locations) {
    this.locations = locations;
  }
}

const gameData = new GameData();
export default gameData;