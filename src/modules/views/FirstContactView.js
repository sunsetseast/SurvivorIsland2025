// src/views/FirstContactView.js

import { createElement, clearChildren } from '../utils/DOMUtils.js';
import gameManager from '../core/GameManager.js';

const FirstContactView = {
  render(container, config = {}) {
    this.container = container;
    this.config = config;
    this.playerTribe = gameManager.getPlayerTribe();
    this.allTribes = gameManager.getTribes();
    this.isThreeTribe = this.allTribes.length === 3;
    this.stageIndex = 0;
    this.context = { 
      stageScores: {}, 
      totalScores: {},
      survivorStagePerformances: {} // Track individual performances
    };

    // Define the four stages
    this.stages = [
      {
        id: 'mud',
        name: 'Mud Crawl',
        weights: { strength: 0.30, endurance: 0.30, dexterity: 0.20, balance: 0.20 },
        background: 'Assets/Challenge/mud-crawl.png',
        description: 'crawling through thick mud'
      },
      {
        id: 'knots',
        name: 'Untie Knots',
        weights: { dexterity: 0.45, puzzles: 0.25, focus: 0.20, endurance: 0.10 },
        background: 'Assets/Challenge/untie-knots.png',
        description: 'untying complex rope knots'
      },
      {
        id: 'toss',
        name: 'Bean-Bag Toss',
        weights: { dexterity: 0.50, focus: 0.30, strength: 0.20 },
        background: 'Assets/Challenge/bean-bag-toss.png',
        description: 'landing bean bags on targets'
      },
      {
        id: 'puzzle',
        name: 'Vertical Puzzle',
        weights: { puzzles: 0.50, memory: 0.30, focus: 0.20 },
        background: 'Assets/Challenge/vertical-puzzle.png',
        description: 'solving the vertical puzzle'
      },
    ];

    this.runNextStage();
  },

  runNextStage() {
    if (this.stageIndex < this.stages.length) {
      const stage = this.stages[this.stageIndex];
      clearChildren(this.container);
      this.container.style.backgroundImage = `url('${stage.background}')`;
      this._calculateStage(stage);
      this._animateStage(stage);
    } else {
      this._showFinalResults();
    }
  },

  _calculateStage(stage) {
    // Store individual survivor performances for this stage
    this.context.survivorStagePerformances[stage.id] = [];

    this.allTribes.forEach(tribe => {
      const participants = tribe.members.filter(s => s.roles.includes(stage.id));
      let totalAbility = 0;
      participants.forEach(survivor => {
        const healthFactor = ((survivor.health || 100) / 100);
        let ability = 0;
        for (let [trait, weight] of Object.entries(stage.weights)) {
          ability += (survivor[trait] || 0) * weight * healthFactor;
        }
        survivor._fc_ability = ability;
        totalAbility += ability;

        // Store individual performance
        this.context.survivorStagePerformances[stage.id].push({
          survivor,
          tribe,
          ability,
          normalizedScore: ability // Will be normalized later
        });
      });
      const maxPossible = participants.length
        * Object.values(stage.weights).reduce((sum, w) => sum + w, 0)
        * 100;
      const basePoints = (totalAbility / maxPossible) * 25;
      const finalPoints = basePoints * (0.95 + Math.random() * 0.10);
      this.context.stageScores[stage.id] = this.context.stageScores[stage.id] || {};
      this.context.stageScores[stage.id][tribe.id] = finalPoints;
      this.context.totalScores[tribe.id] = (this.context.totalScores[tribe.id] || 0) + finalPoints;
    });

    // Normalize individual scores for ranking
    const stagePerfs = this.context.survivorStagePerformances[stage.id];
    const maxAbility = Math.max(...stagePerfs.map(p => p.ability));
    stagePerfs.forEach(perf => {
      perf.normalizedScore = (perf.ability / maxAbility) * 100;
    });
    stagePerfs.sort((a, b) => b.normalizedScore - a.normalizedScore);
  },

  _animateStage(stage) {
    console.log(`Starting animation for stage: ${stage.name}`);

    // Build vertical "tracks" for each tribe
    const laneCount = this.allTribes.length;
    const containerWidth = this.container.clientWidth;
    const laneWidth = containerWidth / laneCount;
    const avatars = [];

    this.allTribes.forEach((tribe, tIndex) => {
      // Track container
      const track = createElement('div', {
        className: 'fc-track',
        style: `
          position: absolute;
          left: ${tIndex * laneWidth}px;
          width: ${laneWidth}px;
          height: 100%;
          border-right: ${tIndex < laneCount - 1 ? '2px solid rgba(255,255,255,0.3)' : 'none'};
          overflow: hidden;
        `,
      });
      this.container.appendChild(track);

      // Survivors on this track
      const stageParticipants = tribe.members.filter(s => s.roles.includes(stage.id));
      stageParticipants.forEach((survivor, i) => {
        // Calculate safe positioning within the lane
        const avatarSize = 50;
        const padding = 10;
        const maxAvatarsPerRow = Math.floor((laneWidth - padding * 2) / (avatarSize + 5));
        const row = Math.floor(i / maxAvatarsPerRow);
        const col = i % maxAvatarsPerRow;

        // Center the avatars in the lane
        const totalWidth = Math.min(stageParticipants.length, maxAvatarsPerRow) * (avatarSize + 5) - 5;
        const startX = (laneWidth - totalWidth) / 2;
        const xPos = startX + col * (avatarSize + 5);
        const yOffset = row * 10; // Slight vertical offset for multiple rows

        const avatar = createElement('img', {
          className: 'fc-avatar',
          src: survivor.avatarUrl || `Assets/Avatars/${survivor.firstName.toLowerCase()}.jpeg`,
          style: `
            position: absolute;
            width: ${avatarSize}px;
            height: ${avatarSize}px;
            border-radius: 50%;
            object-fit: cover;
            border: 3px solid ${tribe.tribeColor || '#fff'};
            left: ${Math.max(padding, Math.min(xPos, laneWidth - avatarSize - padding))}px;
            bottom: ${10 + yOffset}px;
            z-index: ${10 + i};
          `,
        });
        track.appendChild(avatar);
        avatars.push({ survivor, avatar, tribe });
      });
    });

    // Ensure we have avatars before proceeding
    if (avatars.length === 0) {
      console.warn(`No avatars found for stage ${stage.name}, proceeding to Jeff commentary`);
      setTimeout(() => this._showJeffCommentary(stage), 1000);
      return;
    }

    // Animate avatars from bottom → top
    setTimeout(() => {
      console.log(`Starting avatar animations for ${avatars.length} avatars`);

      const abilities = avatars.map(a => a.survivor._fc_ability || 0);
      const maxAbility = Math.max(1, ...abilities); // Ensure minimum of 1 to avoid division by zero
      console.log(`Max ability for stage: ${maxAbility}, all abilities:`, abilities);

      // Calculate durations with safety checks
      const durations = avatars.map(({ survivor }) => {
        const ability = Math.max(0, survivor._fc_ability || 0);
        const normalizedAbility = ability / maxAbility;
        return 1500 + (normalizedAbility * 2000);
      });

      const maxDuration = Math.max(3000, ...durations); // Ensure minimum 3 seconds
      console.log(`Animation durations: ${durations.join(', ')}, max: ${maxDuration}`);

      // Apply animations
      avatars.forEach(({ survivor, avatar }, index) => {
        const ability = Math.max(0, survivor._fc_ability || 0);
        const normalizedAbility = ability / maxAbility;
        const duration = durations[index];
        const distance = this.container.clientHeight - 120; // Leave space at top

        avatar.style.transition = `transform ${duration}ms ease-out`;
        avatar.style.transform = `translateY(-${distance * normalizedAbility}px)`;
      });

      // FIXED: Ensure positive timeout value with minimum
      const totalWaitTime = Math.max(4000, maxDuration + 2000);
      console.log(`Setting timeout for ${totalWaitTime}ms before showing Jeff commentary`);

      setTimeout(() => {
        console.log(`Timeout completed for ${stage.name}, showing Jeff commentary now`);
        this._showJeffCommentary(stage);
      }, totalWaitTime);

    }, 100); // Small delay to ensure DOM is ready
  },

  _showJeffCommentary(stage) {
    console.log(`Showing Jeff commentary for stage: ${stage.name}`);

    // Clear existing avatars and change to Jeff background
    const tracks = this.container.querySelectorAll('.fc-track');
    tracks.forEach(track => track.remove());
    console.log(`Removed ${tracks.length} tracks`);

    // Change background to Jeff screen
    this.container.style.backgroundImage = `url('Assets/jeff-screen.png')`;

    // Determine stage winner
    const scores = this.context.stageScores[stage.id];
    if (!scores) {
      console.error(`No scores found for stage ${stage.id}`);
      // If no scores, proceed to next stage
      this.stageIndex++;
      this.runNextStage();
      return;
    }

    const sorted = Object.entries(scores)
      .sort(([,a],[,b]) => b - a)
      .map(([tribeId, score]) => ({ 
        tribe: this.allTribes.find(t => t.id === tribeId), 
        score 
      }));

    const winner = sorted[0];
    const loser = sorted[sorted.length - 1];
    const scoreDiff = winner.score - loser.score;
    const isClose = scoreDiff < 2.0; // Consider it close if less than 2 points difference

    const playerRank = sorted.findIndex(entry => entry.tribe.id === this.playerTribe.id);

    // Generate dynamic Jeff commentary based on the results
    let jeffText = this._generateJeffCommentary(stage, sorted, winner, loser, isClose, playerRank);

    console.log(`Creating Jeff commentary with parchment layout`);

    // Use the exact same method as ChallengeIntroView for Jeff commentary
    this._createJeffParchment(jeffText, () => {
      console.log('Jeff commentary next button clicked - proceeding to stage summary');
      this._showStageSummary(stage);
    });
  },

  _generateJeffCommentary(stage, sorted, winner, loser, isClose, playerRank) {
    const winnerName = winner.tribe.tribeName;
    const loserName = loser.tribe.tribeName;
    const playerName = this.playerTribe.tribeName;
    const stageDesc = stage.description;

    let commentary = "";

    if (this.isThreeTribe) {
      const middle = sorted[1];
      const middleName = middle.tribe.tribeName;

      if (isClose) {
        commentary = `Incredible! All three tribes are neck and neck in ${stageDesc}! ${winnerName} edges out by mere seconds, with ${middleName} right behind them, and ${loserName} struggling to keep up. This challenge is anyone's game!`;
      } else {
        if (playerRank === 0) {
          commentary = `${playerName} dominates the ${stage.name} stage! Your tribe makes ${stageDesc} look effortless while ${middleName} and ${loserName} fall behind. Strong start!`;
        } else if (playerRank === 1) {
          commentary = `${winnerName} takes a commanding lead in ${stageDesc}! ${playerName} fights hard for second place, but ${loserName} is already struggling. The gap is widening!`;
        } else {
          commentary = `${winnerName} crushes the ${stage.name} stage! ${middleName} manages to stay competitive, but ${playerName} is in serious trouble. You need to turn this around fast!`;
        }
      }
    } else {
      // Two tribe scenario
      if (isClose) {
        commentary = `What a battle! Both tribes are giving everything they have in ${stageDesc}! ${winnerName} barely edges out ${loserName} by the slimmest of margins. This is going to be a fight to the finish!`;
      } else {
        if (playerRank === 0) {
          commentary = `${playerName} absolutely destroys ${loserName} in the ${stage.name} stage! Your tribe makes ${stageDesc} look easy while ${loserName} struggles badly. Complete domination!`;
        } else {
          commentary = `${winnerName} takes a commanding lead! ${playerName} is falling behind badly in ${stageDesc}. If you don't turn this around, you'll be seeing me at Tribal Council tonight!`;
        }
      }
    }

    return commentary;
  },

  _createJeffParchment(text, onNext) {
    // Parchment wrapper for Jeff's message
    const parchmentWrapper = createElement('div', {
      style: `
        position: absolute;
        top: 30px;
        left: 50%;
        transform: translateX(-50%);
        width: 100%;
        max-width: 320px;
        z-index: 2;
      `
    });

    const parchment = createElement('img', {
      src: 'Assets/parch-landscape.png',
      style: `
        width: 100%;
        max-width: 320px;
        max-height: 180px;
        display: block;
        margin: 0 auto;
      `
    });

    const jeffTextElement = createElement('div', {
      className: 'parchment-text',
      style: `
        color: white;
        font-family: 'Survivant', sans-serif;
        font-weight: bold;
        text-align: center;
        margin: -160px auto 0;
        max-width: 260px;
        font-size: 0.85rem;
        line-height: 1.2;
        display: flex;
        align-items: center;
        justify-content: center;
        height: 120px;
        text-shadow:
          0 1px 0 #000,
          0 2px 0 #000,
          0 3px 0 #000,
          0 4px 4px rgba(0, 0, 0, 0.5);
        white-space: pre-line;
      `
    }, text);

    parchmentWrapper.append(parchment, jeffTextElement);

    // Next button
    const nextButton = createElement('button', {
      style: `
        position: absolute;
        bottom: 40px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 2;
        width: 130px;
        height: 60px;
        background-image: url('Assets/rect-button.png');
        background-size: contain;
        background-repeat: no-repeat;
        background-position: center;
        border: none;
        color: white;
        font-family: 'Survivant', sans-serif;
        font-size: 1.15rem;
        font-weight: bold;
        text-shadow: 1px 1px 2px black;
        padding: 0;
        cursor: pointer;
      `,
      onclick: onNext
    }, 'Next');

    this.container.append(parchmentWrapper, nextButton);
  },

  _showStageSummary(stage) {
    console.log(`Showing stage summary for: ${stage.name}`);

    clearChildren(this.container);
    this.container.style.backgroundImage = `url('${this.config.background || 'Assets/Screens/challenge.png'}')`;

    // Get survivor performances for this stage
    const stagePerfs = this.context.survivorStagePerformances[stage.id] || [];
    const tribesData = this.allTribes.map(tribe => ({
      tribe,
      survivors: stagePerfs.filter(p => p.tribe.id === tribe.id)
    }));

    // Create ranking display
    this._createSurvivorRankingDisplay(stage, tribesData);
  },

  _createSurvivorRankingDisplay(stage, tribesData) {
    const wrapper = createElement('div', {
      style: `
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 90%;
        max-width: 600px;
        background: rgba(0, 0, 0, 0.8);
        border-radius: 10px;
        padding: 20px;
        z-index: 10;
      `
    });

    // Title
    const title = createElement('div', {
      style: `
        color: #f39c12;
        font-family: 'Survivant', sans-serif;
        font-size: 1.3rem;
        font-weight: bold;
        text-align: center;
        margin-bottom: 20px;
        text-shadow: 1px 1px 2px black;
      `
    }, `${stage.name} Results`);

    wrapper.appendChild(title);

    // Create columns for each tribe
    const tribesContainer = createElement('div', {
      style: `
        display: flex;
        justify-content: space-around;
        gap: 20px;
      `
    });

    tribesData.forEach(({ tribe, survivors }) => {
      const tribeColumn = createElement('div', {
        style: `
          flex: 1;
          text-align: center;
        `
      });

      // Tribe name
      const tribeName = createElement('div', {
        style: `
          color: ${tribe.tribeColor || '#fff'};
          font-family: 'Survivant', sans-serif;
          font-size: 1.1rem;
          font-weight: bold;
          margin-bottom: 15px;
          text-shadow: 1px 1px 2px black;
        `
      }, tribe.tribeName);

      tribeColumn.appendChild(tribeName);

      // Survivors ranked by performance
      survivors.forEach((perf, index) => {
        const survivorDiv = createElement('div', {
          style: `
            display: flex;
            align-items: center;
            justify-content: center;
            margin-bottom: 10px;
            padding: 8px;
            background: rgba(255, 255, 255, 0.1);
            border-radius: 5px;
            border-left: 4px solid ${tribe.tribeColor || '#fff'};
          `
        });

        const avatar = createElement('img', {
          src: perf.survivor.avatarUrl || `Assets/Avatars/${perf.survivor.firstName.toLowerCase()}.jpeg`,
          style: `
            width: 30px;
            height: 30px;
            border-radius: 50%;
            margin-right: 8px;
            border: 2px solid ${tribe.tribeColor || '#fff'};
          `
        });

        const nameScore = createElement('div', {
          style: `
            color: white;
            font-family: 'Survivant', sans-serif;
            font-size: 0.9rem;
            text-shadow: 1px 1px 1px black;
          `
        }, `${perf.survivor.firstName} (${Math.round(perf.normalizedScore)})`);

        survivorDiv.append(avatar, nameScore);
        tribeColumn.appendChild(survivorDiv);
      });

      tribesContainer.appendChild(tribeColumn);
    });

    wrapper.appendChild(tribesContainer);

    // Next button
    const nextBtn = createElement('button', {
      style: `
        position: absolute;
        bottom: -60px;
        left: 50%;
        transform: translateX(-50%);
        width: 140px;
        height: 50px;
        background: url('Assets/rect-button.png') center/cover no-repeat;
        border: none;
        color: white;
        font-family: 'Survivant', sans-serif;
        font-size: 1rem;
        font-weight: bold;
        text-shadow: 1px 1px 2px black;
        cursor: pointer;
        z-index: 10;
        transition: all 0.2s ease;
      `,
      onclick: (e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log(`Next button clicked, advancing from stage ${this.stageIndex}`);
        this.stageIndex++;
        this.runNextStage();
      },
      onmouseover: (e) => {
        e.target.style.transform = 'translateX(-50%) scale(1.05)';
      },
      onmouseout: (e) => {
        e.target.style.transform = 'translateX(-50%) scale(1)';
      }
    }, this.stageIndex < this.stages.length - 1 ? 'Next Stage' : 'Final Results');

    wrapper.appendChild(nextBtn);
    this.container.appendChild(wrapper);
  },

  _showFinalResults() {
    clearChildren(this.container);
    this.container.style.backgroundImage = `url('Assets/jeff-screen.png')`;

    // Determine final standings
    const sorted = Object.entries(this.context.totalScores)
      .sort(([,a],[,b]) => b - a)
      .map(([tribeId, score]) => ({ 
        tribe: this.allTribes.find(t => t.id === tribeId), 
        score 
      }));

    const winners = sorted.slice(0, this.isThreeTribe ? 2 : 1);
    const losers = sorted.slice(this.isThreeTribe ? 2 : 1);

    // Generate final Jeff commentary
    let finalCommentary;
    if (this.isThreeTribe) {
      const winner1 = winners[0].tribe.tribeName;
      const winner2 = winners[1].tribe.tribeName;
      const loser = losers[0].tribe.tribeName;

      if (losers[0].tribe.id === this.playerTribe.id) {
        finalCommentary = `${winner1} and ${winner2} have won immunity! ${this.playerTribe.tribeName}, you struggled in this challenge and will be heading to Tribal Council tonight where one of you will become the first person voted out of Survivor Island.`;
      } else {
        finalCommentary = `${winner1} and ${winner2} have won immunity and are safe from tonight's vote! ${loser}, I'll be seeing you at Tribal Council where one of your tribe members will become the first person voted out.`;
      }
    } else {
      const winner = winners[0].tribe.tribeName;
      const loser = losers[0].tribe.tribeName;

      if (losers[0].tribe.id === this.playerTribe.id) {
        finalCommentary = `${winner} wins immunity! ${this.playerTribe.tribeName}, you have nothing to protect you tonight. One of you will become the first person voted out of Survivor Island.`;
      } else {
        finalCommentary = `${this.playerTribe.tribeName} wins immunity! ${loser}, grab your torches and head to Tribal Council. One of you will be voted out tonight.`;
      }
    }

    this._createJeffParchment(finalCommentary, () => {
      this._showFinalSummary(sorted);
    });
  },

  _showFinalSummary(sortedTribes) {
    clearChildren(this.container);
    this.container.style.backgroundImage = `url('Assets/Screens/challenge.png')`;

    const winners = sortedTribes.slice(0, this.isThreeTribe ? 2 : 1);
    const winnerNames = winners.map(t => t.tribe.tribeName).join(' and ');
    const text = `${winnerNames} win immunity in First Contact!`;

    const parchment = createElement('div', {
      style: `
        position: absolute;
        top: 40%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 320px;
        padding: 25px;
        background: url('Assets/parch-landscape.png') center/cover no-repeat;
        text-align: center;
        color: white;
        font-family: 'Survivant', sans-serif;
        text-shadow: 1px 1px 2px black;
        z-index: 10;
      `,
    }, text);

    const doneBtn = createElement('button', {
      style: `
        position: absolute;
        bottom: 6%;
        left: 50%;
        transform: translateX(-50%);
        width: 160px;
        height: 55px;
        background: url('Assets/rect-button.png') center/cover no-repeat;
        border: none;
        color: white;
        font-family: 'Survivant', sans-serif;
        font-size: 1rem;
        font-weight: bold;
        text-shadow: 1px 1px 2px black;
        cursor: pointer;
        z-index: 10;
        transition: all 0.2s ease;
      `,
      onclick: (e) => {
        e.preventDefault();
        e.stopPropagation();

        const result = {
          challengeName: this.config.name || 'First Contact',
          challengeType: 'tribal',
          stageScores: this.context.stageScores,
          totalScores: this.context.totalScores,
          completed: true,
          completedAt: new Date().toISOString()
        };

        // Try to use challenge screen's completion method
        if (window.challengeScreen && typeof window.challengeScreen.completeChallenge === 'function') {
          window.challengeScreen.completeChallenge(result);
        } else {
          // Fallback method
          console.log('Challenge completed:', result);
          import('../core/GameManager.js').then(({ default: gameManager }) => {
            import('../core/ScreenManager.js').then(({ default: screenManager }) => {
              gameManager.advanceGamePhase();
              gameManager.setGameState('camp');
              screenManager.showScreen('camp');

              if (window.campScreen && typeof window.campScreen.loadView === 'function') {
                window.campScreen.loadView('flag');
              }
            });
          });
        }
      },
      onmouseover: (e) => {
        e.target.style.transform = 'translateX(-50%) scale(1.05)';
      },
      onmouseout: (e) => {
        e.target.style.transform = 'translateX(-50%) scale(1)';
      }
    }, 'Return to Camp');

    this.container.append(parchment, doneBtn);
  },
};

export default FirstContactView;