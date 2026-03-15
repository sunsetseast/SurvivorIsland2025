// ChallengeManager.js
import { gameManager } from './GameManager.js';

class ChallengeManager {
  constructor() {
    this.challenges = new Map();
    this.mechanics = new Map();
    this.currentChallenge = null;
    this.challengeResults = new Map(); // Store results for each day

    this.initializeChallenges();
    this.initializeMechanics();
  }

  initializeChallenges() {
    // Tribal Phase Challenges (Days 1-9)
    this.challenges.set(1, {
      type: 'tribal',
      name: 'First Contact',
      description: 'Your first test begins! Tribes will compete for immunity.',
      background: 'Assets/jeff-screen.png',
      isSpecial: true,
      showJeff: true,
      jeffMessage: 'COME ON IN, GUYS!',
      mechanics: 'endurance',
      reward: 'immunity'
    });

    this.challenges.set(2, {
      type: 'tribal',
      name: 'Building Bonds',
      description: 'Test your tribe\'s teamwork and communication skills.',
      background: 'Assets/Screens/challenge.png',
      mechanics: 'teamwork',
      reward: 'immunity'
    });

    this.challenges.set(3, {
      type: 'tribal',
      name: 'Survival Instinct',
      description: 'Navigate obstacles while carrying your tribe\'s flame.',
      background: 'Assets/Screens/challenge.png',
      mechanics: 'obstacle',
      reward: 'immunity'
    });

    this.challenges.set(4, {
      type: 'tribal',
      name: 'Breaking Barriers',
      description: 'Overcome physical and mental obstacles as one unit.',
      background: 'Assets/Screens/challenge.png',
      mechanics: 'combined',
      reward: 'immunity'
    });

    this.challenges.set(5, {
      type: 'tribal', 
      name: 'Pressure Point',
      description: 'The stakes rise as immunity becomes more crucial.',
      background: 'Assets/Screens/challenge.png',
      mechanics: 'endurance',
      reward: 'immunity'
    });

    this.challenges.set(6, {
      type: 'tribal',
      name: 'Unity Test',
      description: 'Can your tribe work together under extreme pressure?',
      background: 'Assets/Screens/challenge.png',  
      mechanics: 'teamwork',
      reward: 'immunity'
    });

    this.challenges.set(7, {
      type: 'tribal',
      name: 'Final Stand',
      description: 'The last tribal challenge before everything changes.',
      background: 'Assets/Screens/challenge.png',
      isSpecial: true,
      mechanics: 'combined',
      reward: 'immunity'
    });

    // Merge Challenge (Day 8-10 depending on tribe elimination)
    this.challenges.set(10, {
      type: 'individual',
      name: 'Lone Survivor',
      description: 'Now it\'s every person for themselves.',
      background: 'Assets/Screens/individual-challenge.png',
      isSpecial: true,
      isMerge: true,
      mechanics: 'puzzle',
      reward: 'immunity'
    });

    // Individual Challenges (Post-merge)
    this.challenges.set(11, {
      type: 'individual',
      name: 'Personal Best',
      description: 'Prove your individual worth in this endurance challenge.',
      background: 'Assets/Screens/individual-challenge.png',
      mechanics: 'endurance',
      reward: 'immunity'
    });

    this.challenges.set(12, {
      type: 'individual',
      name: 'Mind Over Matter',
      description: 'Solve complex puzzles while maintaining focus.',
      background: 'Assets/Screens/individual-challenge.png',
      mechanics: 'puzzle',
      reward: 'immunity'
    });

    this.challenges.set(13, {
      type: 'individual',
      name: 'The Gauntlet',
      description: 'Navigate through the ultimate obstacle course.',
      background: 'Assets/Screens/individual-challenge.png',
      mechanics: 'obstacle',
      reward: 'immunity'
    });

    this.challenges.set(14, {
      type: 'individual',
      name: 'Final Four',
      description: 'Only four remain. Who wants it more?',
      background: 'Assets/Screens/individual-challenge.png',
      isSpecial: true,
      mechanics: 'combined',
      reward: 'immunity'
    });

    this.challenges.set(15, {
      type: 'individual',
      name: 'Final Three',
      description: 'The last immunity challenge. Winner chooses their final opponent.',
      background: 'Assets/Screens/finale-challenge.png',
      isSpecial: true,
      isFinal: true,
      mechanics: 'endurance',
      reward: 'immunity'
    });
  }

  initializeMechanics() {
    this.mechanics.set('endurance', {
      description: 'Test your ability to outlast the competition',
      icon: '💪',
      difficulty: 'medium'
    });

    this.mechanics.set('teamwork', {
      description: 'Work together to achieve victory',
      icon: '🤝',
      difficulty: 'easy'
    });

    this.mechanics.set('obstacle', {
      description: 'Navigate through challenging terrain',
      icon: '🏃',
      difficulty: 'hard'
    });

    this.mechanics.set('puzzle', {
      description: 'Solve complex puzzles under pressure',
      icon: '🧩',
      difficulty: 'hard'
    });

    this.mechanics.set('combined', {
      description: 'Multiple challenge elements combined',
      icon: '⚡',
      difficulty: 'extreme'
    });
  }

  // Get challenge configuration for a specific day
  getChallengeForDay(day) {
    return this.challenges.get(day) || null;
  }

  // Get current challenge based on game state
  getCurrentChallenge() {
    const currentDay = gameManager.getDay();
    const challenge = this.getChallengeForDay(currentDay);

    if (challenge) {
      this.currentChallenge = {
        day: currentDay,
        ...challenge
      };
    }

    return this.currentChallenge;
  }

  // Determine challenge type based on game state
  determineChallengeType() {
    const currentDay = gameManager.getDay();
    const allTribes = gameManager.getTribes();
    const activeTribeCount = allTribes?.filter(tribe => tribe.members.length > 0).length || 0;

    // Check if we have a specific challenge configured
    const challengeConfig = this.getChallengeForDay(currentDay);

    if (challengeConfig) {
      return challengeConfig.type;
    }

    // Default logic: tribal if multiple tribes, individual if merged
    return activeTribeCount > 1 ? 'tribal' : 'individual';
  }

  // Get mechanic information
  getMechanic(mechanicName) {
    return this.mechanics.get(mechanicName) || null;
  }

  // Check if current challenge is special
  isSpecialChallenge(day = null) {
    const targetDay = day || gameManager.getDay();
    const challenge = this.getChallengeForDay(targetDay);
    return challenge?.isSpecial || false;
  }

  // Check if current challenge is the merge challenge
  isMergeChallenge(day = null) {
    const targetDay = day || gameManager.getDay();
    const challenge = this.getChallengeForDay(targetDay);
    return challenge?.isMerge || false;
  }

  // Check if current challenge is the final challenge
  isFinalChallenge(day = null) {
    const targetDay = day || gameManager.getDay();
    const challenge = this.getChallengeForDay(targetDay);
    return challenge?.isFinal || false;
  }

  // Store challenge results
  storeChallengeResult(day, result) {
    this.challengeResults.set(day, {
      ...result,
      timestamp: Date.now()
    });
  }

  // Get challenge result for a specific day
  getChallengeResult(day) {
    return this.challengeResults.get(day) || null;
  }

  getLatestChallengeResult(day = null) {
    const dayValue = day || gameManager.getCurrentDay?.() || gameManager.getDay?.() || gameManager.day || 1;
    if (this.challengeResults.has(dayValue)) {
      return this.challengeResults.get(dayValue);
    }
    for (let checkDay = dayValue - 1; checkDay >= 1; checkDay -= 1) {
      if (this.challengeResults.has(checkDay)) {
        return this.challengeResults.get(checkDay);
      }
    }
    return null;
  }

  getLastChallengeResult(day = null) {
    return this.getLatestChallengeResult(day);
  }

  getStageStandoutsForTribe(tribeIdOrKey, day = null) {
    const result = this.getLatestChallengeResult(day);
    if (!result) return { mvps: [], lvps: [] };

    const standouts = { mvps: [], lvps: [] };
    const seenMvp = new Set();
    const seenLvp = new Set();

    const resolveName = (survivorId) => {
      if (!survivorId) return null;
      const survivor = gameManager.survivors?.find?.(s => s.id === survivorId);
      return survivor?.firstName || null;
    };

    const matchesTribe = (tribeKey) => {
      if (!tribeIdOrKey) return true;
      if (!tribeKey) return false;
      return String(tribeKey) === String(tribeIdOrKey);
    };

    const stagePerformance = result.stagePerformance || {};
    Object.entries(stagePerformance).forEach(([stageId, info]) => {
      const mvp = info?.mvp || null;
      const lvp = info?.lvp || null;
      if (mvp?.survivorId && matchesTribe(mvp.tribeKey) && !seenMvp.has(mvp.survivorId)) {
        standouts.mvps.push({
          survivorId: mvp.survivorId,
          name: resolveName(mvp.survivorId) || 'Unknown',
          stageId,
          scoreOrValue: mvp.score ?? null
        });
        seenMvp.add(mvp.survivorId);
      }
      if (lvp?.survivorId && matchesTribe(lvp.tribeKey) && !seenLvp.has(lvp.survivorId)) {
        standouts.lvps.push({
          survivorId: lvp.survivorId,
          name: resolveName(lvp.survivorId) || 'Unknown',
          stageId,
          scoreOrValue: lvp.score ?? null
        });
        seenLvp.add(lvp.survivorId);
      }
    });

    if (!standouts.mvps.length || !standouts.lvps.length) {
      const ranking = Array.isArray(result.rankings) ? result.rankings : Array.isArray(result.performance) ? result.performance : null;
      if (Array.isArray(ranking) && ranking.length) {
        const filtered = ranking.filter(entry => matchesTribe(entry.tribeKey || entry.tribeId || entry.tribeName));
        const scored = filtered.map(entry => {
          const score = entry.score ?? entry.value ?? (typeof entry.rank === 'number' ? -entry.rank : 0);
          return { ...entry, score };
        });
        scored.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
        const top = scored[0];
        const bottom = scored[scored.length - 1];
        if (top?.survivorId && !seenMvp.has(top.survivorId)) {
          standouts.mvps.push({
            survivorId: top.survivorId,
            name: resolveName(top.survivorId) || 'Unknown',
            stageId: top.stageId || null,
            scoreOrValue: top.score ?? null
          });
          seenMvp.add(top.survivorId);
        }
        if (bottom?.survivorId && !seenLvp.has(bottom.survivorId)) {
          standouts.lvps.push({
            survivorId: bottom.survivorId,
            name: resolveName(bottom.survivorId) || 'Unknown',
            stageId: bottom.stageId || null,
            scoreOrValue: bottom.score ?? null
          });
          seenLvp.add(bottom.survivorId);
        }
      }
    }

    return standouts;
  }

  // Get all challenge results
  getAllChallengeResults() {
    return Array.from(this.challengeResults.entries()).map(([day, result]) => ({
      day,
      ...result
    }));
  }

  // Add a new challenge (for dynamic content)
  addChallenge(day, challengeConfig) {
    this.challenges.set(day, challengeConfig);
  }

  // Update existing challenge
  updateChallenge(day, updates) {
    const existing = this.challenges.get(day);
    if (existing) {
      this.challenges.set(day, { ...existing, ...updates });
    }
  }

  // Get challenges by type
  getChallengesByType(type) {
    const challengesByType = [];
    for (const [day, challenge] of this.challenges) {
      if (challenge.type === type) {
        challengesByType.push({ day, ...challenge });
      }
    }
    return challengesByType;
  }

  // Get all tribal challenges
  getTribalChallenges() {
    return this.getChallengesByType('tribal');
  }

  // Get all individual challenges  
  getIndividualChallenges() {
    return this.getChallengesByType('individual');
  }

  // Reset challenge state (for game restart)
  reset() {
    this.currentChallenge = null;
    this.challengeResults.clear();
  }

  // Debug method to log all challenges
  logAllChallenges() {
    console.log('=== ALL CHALLENGES ===');
    for (const [day, challenge] of this.challenges) {
      console.log(`Day ${day}: ${challenge.name} (${challenge.type}) - ${challenge.mechanics}`);
    }
  }
}

// Create singleton instance
const challengeManager = new ChallengeManager();

export default challengeManager;
