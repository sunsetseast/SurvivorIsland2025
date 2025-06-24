// src/views/FirstContactView.js

import { createElement, clearChildren } from '../utils/DOMUtils.js';
import gameManager from '../core/GameManager.js';

const FirstContactView = {
  render(container, config = {}) {
    this.container = container;
    this.config = config;

    // Make container a containing block for absolutely positioned elements
    this.container.style.position = 'relative';
    this.container.style.width = '100%';
    this.container.style.height = '100%';

    this.playerTribe = gameManager.getPlayerTribe();
    this.allTribes = gameManager.getTribes();
    this.isThreeTribe = this.allTribes.length === 3;
    this.stageIndex = 0;
    this.context = { 
      stageScores: {}, 
      totalScores: {},
      survivorStagePerformances: {} // Track individual performances
    };

    // Define the four stages - IDs must match the role names from RoleView
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
    console.log(`Calculating stage: ${stage.name} with ID: ${stage.id}`);

    // Store individual survivor performances for this stage
    this.context.survivorStagePerformances[stage.id] = [];

    this.allTribes.forEach(tribe => {
      const participants = tribe.members.filter(s => s.roles && s.roles.includes(stage.id));
      console.log(`${tribe.tribeName || tribe.name} participants for ${stage.id}:`, participants.map(p => p.firstName));
      console.log(`All tribe member roles for ${tribe.tribeName || tribe.name}:`, tribe.members.map(m => `${m.firstName}: ${m.roles}`));

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
      const tribeKey = tribe.id || tribe.name;
      this.context.stageScores[stage.id][tribeKey] = finalPoints;
      this.context.totalScores[tribeKey] = (this.context.totalScores[tribeKey] || 0) + finalPoints;
    });

    // Normalize individual scores for ranking
    const stagePerfs = this.context.survivorStagePerformances[stage.id];
    if (stagePerfs && stagePerfs.length > 0) {
      const maxAbility = Math.max(...stagePerfs.map(p => p.ability));
      stagePerfs.forEach(perf => {
        perf.normalizedScore = (perf.ability / maxAbility) * 100;
      });
      stagePerfs.sort((a, b) => b.normalizedScore - a.normalizedScore);
      console.log(`Stage ${stage.id} performances stored:`, stagePerfs.length);
    } else {
      console.warn(`No performances found for stage ${stage.id}`);
    }
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

    // Clear all existing elements first
    clearChildren(this.container);

    // Change background to Jeff screen
    this.container.style.backgroundImage = `url('Assets/jeff-screen.png')`;

    // Determine stage winner
    const scores = this.context.stageScores[stage.id];
    console.log(`Stage scores for ${stage.id}:`, scores);

    if (!scores) {
      console.error(`No scores found for stage ${stage.id}`);
      // If no scores, proceed to next stage
      this.stageIndex++;
      this.runNextStage();
      return;
    }

    const sorted = Object.entries(scores)
      .sort(([,a],[,b]) => b - a)
      .map(([tribeKey, score]) => ({ 
        tribe: this.allTribes.find(t => (t.id || t.name) === tribeKey), 
        score 
      }));

    console.log('Sorted tribe results:', sorted.map(s => ({ name: s.tribe?.tribeName, score: s.score })));

    const winner = sorted[0];
    const loser = sorted[sorted.length - 1];
    const scoreDiff = winner.score - loser.score;
    const isClose = scoreDiff < 2.0; // Consider it close if less than 2 points difference

    const playerRank = sorted.findIndex(entry => entry.tribe?.id === this.playerTribe?.id);
    console.log(`Player tribe rank: ${playerRank}`);

    // Generate dynamic Jeff commentary based on the results
    let jeffText = this._generateJeffCommentary(stage, sorted, winner, loser, isClose, playerRank);

    console.log(`Jeff text generated: "${jeffText}"`);
    console.log(`Creating Jeff commentary with parchment layout`);

    // Use the exact same method as ChallengeIntroView for Jeff commentary
    this._createJeffParchment(jeffText, () => {
      console.log('Jeff commentary next button clicked - proceeding to stage summary');
      this._showStageSummary(stage);
    });
  },

  _generateJeffCommentary(stage, sorted, winner, loser, isClose, playerRank) {
    const winnerName = winner?.tribe?.tribeName || 'Unknown Tribe';
    const loserName = loser?.tribe?.tribeName || 'Unknown Tribe';
    const playerName = this.playerTribe?.tribeName || 'Your Tribe';
    const stageDesc = stage?.description || 'this challenge';

    console.log('Generating Jeff commentary:', {
      stageName: stage?.name,
      winnerName,
      loserName,
      playerName,
      playerRank,
      isClose,
      isThreeTribe: this.isThreeTribe
    });

    let commentary = "";

    if (this.isThreeTribe && sorted.length >= 3) {
      const middle = sorted[1];
      const middleName = middle?.tribe?.tribeName || 'Middle Tribe';

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
      // Two tribe scenario or fallback
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

    console.log('Generated commentary:', commentary);
    return commentary;
  },

  _createJeffParchment(text, onNext) {
    console.log('Creating Jeff parchment with text:', text);

    // Parchment wrapper positioned absolutely within the container
    const parchmentWrapper = createElement('div', {
      style: `
        position: absolute;
        top: 30px;
        left: 50%;
        transform: translateX(-50%);
        width: 100%;
        max-width: 320px;
        z-index: 1000;
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
        z-index: 1001;
        position: relative;
      `
    });

    // Text positioned absolutely on top of the parchment
    const jeffTextElement = createElement('div', {
      className: 'parchment-text',
      style: `
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 80%;
        max-width: 260px;
        color: white;
        font-family: 'Survivant', sans-serif;
        font-size: 0.85rem;
        font-weight: bold;
        line-height: 1.2;
        text-align: center;
        text-shadow: 0 1px 0 #000, 0 2px 0 #000, 0 3px 0 #000, 0 4px 4px rgba(0,0,0,0.5);
        z-index: 1002;
        white-space: pre-line;
      `
    }, text);

    parchmentWrapper.append(parchment, jeffTextElement);

    // Next button positioned at bottom center of the game container
    const nextButton = createElement('button', {
      style: `
        position: absolute;
        bottom: 40px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 1003;
        width: 130px;
        height: 60px;
        background: url('Assets/rect-button.png') center/cover no-repeat;
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

    console.log('Appending parchment wrapper and next button to container');
    this.container.append(parchmentWrapper, nextButton);

    // Force a repaint to ensure elements are visible
    setTimeout(() => {
      console.log('Parchment elements should now be visible');
    }, 100);
  },

  _showStageSummary(stage) {
    console.log(`Showing stage summary for: ${stage.name}`);
    console.log(`Stage ID: ${stage.id}`);
    console.log(`All performance data:`, this.context.survivorStagePerformances);
    console.log(`Available stage IDs:`, Object.keys(this.context.survivorStagePerformances));

    clearChildren(this.container);
    this.container.style.backgroundImage = `url('${this.config.background || 'Assets/Screens/challenge.png'}')`;

    // Get survivor performances for this stage
    const stagePerfs = this.context.survivorStagePerformances[stage.id] || [];
    console.log(`Stage performances for ${stage.id}:`, stagePerfs.length, stagePerfs);

    if (stagePerfs.length === 0) {
      console.error(`No performance data found for stage ${stage.id}`);
      console.log(`Available performance data keys:`, Object.keys(this.context.survivorStagePerformances));

      // Try to find performances with a similar stage name
      const availableKeys = Object.keys(this.context.survivorStagePerformances);
      const matchingKey = availableKeys.find(key => 
        key.includes(stage.id) || 
        stage.id.includes(key) || 
        key.toLowerCase().includes(stage.name.toLowerCase().replace(/\s+/g, ''))
      );

      if (matchingKey) {
        console.log(`Found matching key: ${matchingKey}, using that instead`);
        const fallbackPerfs = this.context.survivorStagePerformances[matchingKey];
        this._createSurvivorRankingDisplay(stage, this.allTribes.map(tribe => ({
          tribe,
          survivors: fallbackPerfs.filter(p => p.tribe.id === tribe.id)
        })));
        return;
      }

      // Create a fallback message
      this._createFallbackSummary(stage);
      return;
    }

    const tribesData = this.allTribes.map(tribe => ({
      tribe,
      survivors: stagePerfs.filter(p => (p.tribe.id === tribe.id || p.tribe.name === tribe.name))
    }));

    console.log(`Tribes data:`, tribesData);

    // Create ranking display
    this._createSurvivorRankingDisplay(stage, tribesData);
  },

  _createFallbackSummary(stage) {
    const wrapper = createElement('div', {
      style: `
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: rgba(0, 0, 0, 0.8);
        border-radius: 10px;
        padding: 20px;
        color: white;
        text-align: center;
        font-family: 'Survivant', sans-serif;
      `
    });

    const title = createElement('div', {
      style: `
        color: #f39c12;
        font-size: 1.3rem;
        margin-bottom: 20px;
      `
    }, `${stage.name} Results`);

    const message = createElement('div', {
      style: `
        color: white;
        margin-bottom: 20px;
      `
    }, 'No performance data available for this stage.');

    const nextBtn = createElement('button', {
      style: `
        width: 140px;
        height: 50px;
        background: url('Assets/rect-button.png') center/cover no-repeat;
        border: none;
        color: white;
        font-family: 'Survivant', sans-serif;
        font-size: 1rem;
        font-weight: bold;
        cursor: pointer;
      `,
      onclick: () => {
        console.log(`Fallback next button clicked, advancing from stage ${this.stageIndex}`);
        this.stageIndex++;
        this.runNextStage();
      }
    }, this.stageIndex < this.stages.length - 1 ? 'Next Stage' : 'Final Results');

    wrapper.append(title, message, nextBtn);
    this.container.appendChild(wrapper);
  },

  _createSurvivorRankingDisplay(stage, tribesData) {
    // Create a scrollable container that takes the full height
    const scrollContainer = createElement('div', {
      style: `
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        overflow-y: auto;
        overflow-x: hidden;
        z-index: 10;
        padding: 20px;
        box-sizing: border-box;
      `
    });

    const wrapper = createElement('div', {
      style: `
        width: 100%;
        max-width: 600px;
        margin: 0 auto;
        background: rgba(0, 0, 0, 0.8);
        border-radius: 10px;
        padding: 20px;
        margin-bottom: 100px;
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

    const allSurvivorPerfs = this.context.survivorStagePerformances[stage.id] || [];

    console.log(`Creating survivor ranking display for stage:`, stage.name);
    console.log(`Stage ${stage.id} performances:`, allSurvivorPerfs.length);
    console.log(`Full performance data:`, allSurvivorPerfs);

    if (allSurvivorPerfs.length === 0) {
      const noDataMsg = createElement('div', {
        style: `
          color: white;
          text-align: center;
          font-family: 'Survivant', sans-serif;
          margin: 20px 0;
        `
      }, 'No performance data available for this stage.');
      wrapper.appendChild(noDataMsg);
    } else {
      // Create a single list of all survivors sorted by performance
      const allSurvivorsContainer = createElement('div', {
        style: `
          display: flex;
          flex-direction: column;
          gap: 8px;
        `
      });

      allSurvivorPerfs.forEach((perf, index) => {
        const position = index + 1;
        const isPlayerTribe = (perf.tribe.id || perf.tribe.name) === (this.playerTribe?.id || this.playerTribe?.name);

        const survivorDiv = createElement('div', {
          style: `
            display: flex;
            align-items: center;
            padding: 12px;
            background: ${isPlayerTribe ? 'rgba(255, 215, 0, 0.2)' : 'rgba(255, 255, 255, 0.1)'};
            border-radius: 8px;
            border-left: 4px solid ${perf.tribe.tribeColor || perf.tribe.color || '#fff'};
            ${isPlayerTribe ? 'box-shadow: 0 0 10px rgba(255, 215, 0, 0.3);' : ''}
          `
        });

        // Position number
        const positionElement = createElement('div', {
          style: `
            color: #f39c12;
            font-family: 'Survivant', sans-serif;
            font-size: 1.1rem;
            font-weight: bold;
            margin-right: 12px;
            min-width: 25px;
            text-align: center;
          `
        }, `${position}.`);

        // Avatar
        const avatar = createElement('img', {
          src: perf.survivor.avatarUrl || `Assets/Avatars/${perf.survivor.firstName.toLowerCase()}.jpeg`,
          style: `
            width: 35px;
            height: 35px;
            border-radius: 50%;
            margin-right: 12px;
            border: 2px solid ${perf.tribe.tribeColor || perf.tribe.color || '#fff'};
          `
        });

        // Name and tribe info
        const infoContainer = createElement('div', {
          style: `
            flex: 1;
            display: flex;
            flex-direction: column;
          `
        });

        const nameElement = createElement('div', {
          style: `
            color: white;
            font-family: 'Survivant', sans-serif;
            font-size: 1rem;
            font-weight: bold;
            text-shadow: 1px 1px 1px black;
          `
        }, perf.survivor.firstName);

        const tribeElement = createElement('div', {
          style: `
            color: ${perf.tribe.tribeColor || perf.tribe.color || '#ccc'};
            font-family: 'Survivant', sans-serif;
            font-size: 0.8rem;
            text-shadow: 1px 1px 1px black;
          `
        }, perf.tribe.tribeName || perf.tribe.name);

        infoContainer.append(nameElement, tribeElement);

        // Score
        const scoreElement = createElement('div', {
          style: `
            color: #f39c12;
            font-family: 'Survivant', sans-serif;
            font-size: 1rem;
            font-weight: bold;
            text-shadow: 1px 1px 1px black;
          `
        }, Math.round(perf.normalizedScore));

        survivorDiv.append(positionElement, avatar, infoContainer, scoreElement);
        allSurvivorsContainer.appendChild(survivorDiv);
      });

      wrapper.appendChild(allSurvivorsContainer);
    }

    // Next button - positioned within the wrapper so it scrolls with content
    const nextBtn = createElement('button', {
      style: `
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
        margin: 30px auto 0;
        display: block;
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
        e.target.style.transform = 'scale(1.05)';
      },
      onmouseout: (e) => {
        e.target.style.transform = 'scale(1)';
      }
    }, this.stageIndex < this.stages.length - 1 ? 'Next Stage' : 'Final Results');

    wrapper.appendChild(nextBtn);
    scrollContainer.appendChild(wrapper);
    this.container.appendChild(scrollContainer);
  },

  _showFinalResults() {
    clearChildren(this.container);
    this.container.style.backgroundImage = `url('Assets/jeff-screen.png')`;

    // Determine final standings
    const sorted = Object.entries(this.context.totalScores)
      .sort(([,a],[,b]) => b - a)
      .map(([tribeKey, score]) => ({ 
        tribe: this.allTribes.find(t => (t.id || t.name) === tribeKey), 
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

      if ((losers[0].tribe.id || losers[0].tribe.name) === (this.playerTribe.id || this.playerTribe.name)) {
        finalCommentary = `${winner1} and ${winner2} have won immunity! ${this.playerTribe.tribeName}, you struggled in this challenge and will be heading to Tribal Council tonight where one of you will become the first person voted out of Survivor Island.`;
      } else {
        finalCommentary = `${winner1} and ${winner2} have won immunity and are safe from tonight's vote! ${loser}, I'll be seeing you at Tribal Council where one of your tribe members will become the first person voted out.`;
      }
    } else {
      const winner = winners[0].tribe.tribeName;
      const loser = losers[0].tribe.tribeName;

      if ((losers[0].tribe.id || losers[0].tribe.name) === (this.playerTribe.id || this.playerTribe.name)) {
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