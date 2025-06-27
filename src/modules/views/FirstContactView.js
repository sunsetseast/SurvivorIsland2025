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
      console.log(`Processing tribe:`, tribe);
      console.log(`Tribe properties:`, Object.keys(tribe));
      const tribeName = tribe.name || tribe.tribeName || `Tribe-${tribe.id}`;

      const participants = tribe.members.filter(s => s.roles && s.roles.includes(stage.id));
      console.log(`${tribeName} participants for ${stage.id}:`, participants.map(p => p.firstName));
      console.log(`All tribe member roles for ${tribeName}:`, tribe.members.map(m => `${m.firstName}: ${m.roles}`));

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
      const tribeKey = tribe.id || tribe.name || tribe.tribeName;
      console.log(`Storing score for tribe key: ${tribeKey}, points: ${finalPoints}`);
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
    const containerHeight = this.container.clientHeight;
    const laneWidth = Math.floor(containerWidth / laneCount);
    const avatars = [];

    this.allTribes.forEach((tribe, tIndex) => {
      // Ensure lane positioning stays within container bounds
      const laneLeft = Math.min(tIndex * laneWidth, containerWidth - laneWidth);

      // Track container with proper bounds
      const track = createElement('div', {
        className: 'fc-track',
        style: `
          position: absolute;
          left: ${laneLeft}px;
          width: ${laneWidth}px;
          height: 100%;
          top: 0;
          bottom: 0;
          border-right: ${tIndex < laneCount - 1 ? '2px solid rgba(255,255,255,0.3)' : 'none'};
          overflow: hidden;
          box-sizing: border-box;
        `,
      });
      this.container.appendChild(track);

      // Survivors on this track
      const stageParticipants = tribe.members.filter(s => s.roles.includes(stage.id));
      stageParticipants.forEach((survivor, i) => {
        // Calculate safe positioning within the lane with proper bounds checking
        const avatarSize = Math.min(50, Math.floor(laneWidth / 3)); // Scale avatar size to lane
        const padding = Math.max(5, Math.floor(laneWidth * 0.05)); // 5% padding
        const availableWidth = laneWidth - (padding * 2);
        const maxAvatarsPerRow = Math.max(1, Math.floor(availableWidth / (avatarSize + 5)));
        const row = Math.floor(i / maxAvatarsPerRow);
        const col = i % maxAvatarsPerRow;

        // Center the avatars in the lane with bounds checking
        const actualAvatarsInRow = Math.min(stageParticipants.length - (row * maxAvatarsPerRow), maxAvatarsPerRow);
        const totalRowWidth = actualAvatarsInRow * avatarSize + (actualAvatarsInRow - 1) * 5;
        const startX = Math.max(padding, (laneWidth - totalRowWidth) / 2);
        const xPos = startX + col * (avatarSize + 5);
        const yOffset = row * 10; // Slight vertical offset for multiple rows

        // Ensure avatar stays within lane bounds
        const finalX = Math.max(padding, Math.min(xPos, laneWidth - avatarSize - padding));

        const avatar = createElement('img', {
          className: 'fc-avatar',
          src: survivor.avatarUrl || `Assets/Avatars/${survivor.firstName.toLowerCase()}.jpeg`,
          style: `
            position: absolute;
            width: ${avatarSize}px;
            height: ${avatarSize}px;
            border-radius: 50%;
            object-fit: cover;
            border: 3px solid ${tribe.color || '#fff'};
            left: ${finalX}px;
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

      // Special handling for Stage 4 (puzzle stage)
      if (stage.id === 'puzzle') {
        console.log('Stage 4 detected - implementing special two-phase animation');

        // Phase 1: All avatars animate to 75% of track height
        const fullDistance = this.container.clientHeight - 120;
        const phase1Distance = fullDistance * 0.75;

        avatars.forEach(({ survivor, avatar }, index) => {
          const ability = Math.max(0, survivor._fc_ability || 0);
          const normalizedAbility = ability / maxAbility;
          const duration = durations[index];

          avatar.style.transition = `transform ${duration}ms ease-out`;
          avatar.style.transform = `translateY(-${phase1Distance * normalizedAbility}px)`;
        });

        // Wait for phase 1 to complete, then pause, then phase 2
        setTimeout(() => {
          console.log('Phase 1 complete, starting pause before phase 2');

          // 1.5 second pause
          setTimeout(() => {
            console.log('Starting phase 2 - moving winning tribe to finish line');

            // Find winning tribe(s) for this stage
            const stageScores = this.context.stageScores[stage.id];
            if (stageScores) {
              const sortedScores = Object.entries(stageScores)
                .sort(([,a],[,b]) => b - a);

              if (sortedScores.length > 0) {
                const phase2Distance = fullDistance * 0.25;
                const phase2Duration = 1000; // 1 second for final push

                if (this.isThreeTribe && sortedScores.length >= 2) {
                  // Three tribe mode: winner moves first, then second place
                  const winningTribeKey = sortedScores[0][0];
                  const secondPlaceTribeKey = sortedScores[1][0];

                  console.log(`Three tribe mode - Winner: ${winningTribeKey}, Second: ${secondPlaceTribeKey}`);

                  // Phase 2a: Move winning tribe avatars the remaining 25%
                  avatars.forEach(({ survivor, avatar, tribe }) => {
                    const tribeKey = tribe.id || tribe.name || tribe.tribeName;
                    if (tribeKey === winningTribeKey) {
                      const ability = Math.max(0, survivor._fc_ability || 0);
                      const normalizedAbility = ability / maxAbility;
                      const currentDistance = phase1Distance * normalizedAbility;
                      const finalDistance = currentDistance + phase2Distance;

                      avatar.style.transition = `transform ${phase2Duration}ms ease-out`;
                      avatar.style.transform = `translateY(-${finalDistance}px)`;
                    }
                  });

                  // Wait for winner to finish, then move second place
                  setTimeout(() => {
                    console.log('Winner finished, moving second place tribe');

                    // Phase 2b: Move second place tribe avatars the remaining 25%
                    avatars.forEach(({ survivor, avatar, tribe }) => {
                      const tribeKey = tribe.id || tribe.name || tribe.tribeName;
                      if (tribeKey === secondPlaceTribeKey) {
                        const ability = Math.max(0, survivor._fc_ability || 0);
                        const normalizedAbility = ability / maxAbility;
                        const currentDistance = phase1Distance * normalizedAbility;
                        const finalDistance = currentDistance + phase2Distance;

                        avatar.style.transition = `transform ${phase2Duration}ms ease-out`;
                        avatar.style.transform = `translateY(-${finalDistance}px)`;
                      }
                    });

                    // Wait for second place to finish before showing final results
                    setTimeout(() => {
                      console.log('Second place finished, going directly to final results');
                      this._showFinalResults();
                    }, phase2Duration + 500);

                  }, phase2Duration + 300); // Small delay between winner and second place

                } else {
                  // Two tribe mode: only winner moves
                  const winningTribeKey = sortedScores[0][0];
                  console.log(`Two tribe mode - Winner: ${winningTribeKey}`);

                  // Phase 2: Move only winning tribe avatars the remaining 25%
                  avatars.forEach(({ survivor, avatar, tribe }) => {
                    const tribeKey = tribe.id || tribe.name || tribe.tribeName;
                    if (tribeKey === winningTribeKey) {
                      const ability = Math.max(0, survivor._fc_ability || 0);
                      const normalizedAbility = ability / maxAbility;
                      const currentDistance = phase1Distance * normalizedAbility;
                      const finalDistance = currentDistance + phase2Distance;

                      avatar.style.transition = `transform ${phase2Duration}ms ease-out`;
                      avatar.style.transform = `translateY(-${finalDistance}px)`;
                    }
                  });

                  // Wait for second place to finish before showing final results
                  setTimeout(() => {
                    console.log('Second place finished, going directly to final results');
                    this._showFinalResults();
                  }, phase2Duration + 500);
                }
              } else {
                console.warn('No stage scores found for puzzle stage');
                this._showJeffCommentary(stage);
              }
            } else {
              console.warn('No stage scores available for puzzle stage');
              this._showJeffCommentary(stage);
            }
          }, 1500); // 1.5 second pause
        }, maxDuration + 1000);

      } else {
        // Regular animation for all other stages (1-3)
        avatars.forEach(({ survivor, avatar }, index) => {
          const ability = Math.max(0, survivor._fc_ability || 0);
          const normalizedAbility = ability / maxAbility;
          const duration = durations[index];
          const distance = this.container.clientHeight - 120; // Leave space at top

          avatar.style.transition = `transform ${duration}ms ease-out`;
          avatar.style.transform = `translateY(-${distance * normalizedAbility}px)`;
        });

        // Wait for main animation to complete, then do ranking animation
        setTimeout(() => {
          console.log(`Main animation complete for ${stage.name}, starting ranking animation`);
          this._animateRankingArrangement(stage, avatars, maxAbility);
        }, maxDuration + 1000);
      }

    }, 100); // Small delay to ensure DOM is ready
  },

  _animateRankingArrangement(stage, avatars, maxAbility) {
    console.log(`Starting ranking arrangement animation for ${stage.name}`);

    // Get stage performances and sort by ability across all tribes
    const stagePerfs = this.context.survivorStagePerformances[stage.id] || [];
    if (stagePerfs.length === 0) {
      console.warn(`No performance data for ranking animation, proceeding to Jeff commentary`);
      this._showJeffCommentary(stage);
      return;
    }

    console.log(`Overall ranking order:`, stagePerfs.map((perf, i) => `${i + 1}. ${perf.survivor.firstName} (${perf.ability.toFixed(2)})`));

    // Clear the lane structure and create a new unified container for ranking
    const existingTracks = this.container.querySelectorAll('.fc-track');
    existingTracks.forEach(track => track.remove());

    // Create a new unified container for the ranking animation
    const rankingContainer = createElement('div', {
      className: 'ranking-container',
      style: `
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        z-index: 1000;
        overflow: visible;
      `
    });
    this.container.appendChild(rankingContainer);

    // Move all avatars to the new container and reset their positioning
    const containerWidth = this.container.clientWidth;
    const containerHeight = this.container.clientHeight;
    const centerX = containerWidth / 2;
    const avatarSize = 50;
    const startY = 50; // Start from actual top of screen
    const spacing = Math.min(25, (containerHeight - 100) / Math.max(1, stagePerfs.length - 1));

    // Calculate performance-based positioning
    const maxPerformance = Math.max(...stagePerfs.map(p => p.normalizedScore));
    const minPerformance = Math.min(...stagePerfs.map(p => p.normalizedScore));
    const performanceRange = maxPerformance - minPerformance;
    const availableHeight = containerHeight - 150; // Leave space at top and bottom

    // Group survivors by their normalized score to handle ties
    const scoreGroups = {};
    stagePerfs.forEach((perf, index) => {
      const score = perf.normalizedScore.toFixed(2);
      if (!scoreGroups[score]) {
        scoreGroups[score] = [];
      }
      scoreGroups[score].push({ ...perf, originalIndex: index });
    });

    // Animate each avatar to its performance-based position
    stagePerfs.forEach((perf, overallRank) => {
      // Find the corresponding avatar
      const avatarData = avatars.find(a => a.survivor.id === perf.survivor.id);
      if (!avatarData) return;

      const { avatar, survivor } = avatarData;

      // Calculate position based on normalized performance score
      const performanceRatio = performanceRange > 0 ? 
        (maxPerformance - perf.normalizedScore) / performanceRange : 0;
      let targetY = startY + (performanceRatio * availableHeight);

      // Find if this survivor is tied with others
      const score = perf.normalizedScore.toFixed(2);
      const tiedSurvivors = scoreGroups[score];
      let horizontalOffset = 0;

      if (tiedSurvivors.length > 1) {
        // Find this survivor's position within the tied group
        const positionInTie = tiedSurvivors.findIndex(s => s.survivor.id === perf.survivor.id);
        const totalTied = tiedSurvivors.length;

        // Add small vertical offset to prevent exact overlap
        targetY += positionInTie * 3;

        // Calculate horizontal offset to spread tied survivors
        const spacing = 60; // Space between tied avatars
        const startOffset = -(totalTied - 1) * spacing / 2;
        horizontalOffset = startOffset + (positionInTie * spacing);
      }

      const targetX = centerX - (avatarSize / 2) + horizontalOffset;

      // Higher performers get higher z-index (lower overallRank = higher z-index)
      const zIndex = 1200 - overallRank;

      console.log(`Animating ${survivor.firstName} (rank ${overallRank + 1}, score ${perf.normalizedScore.toFixed(2)}) to Y: ${targetY}, X: ${targetX}, z-index: ${zIndex}`);

      setTimeout(() => {
        // Remove avatar from its current parent and add to ranking container
        if (avatar.parentElement) {
          avatar.parentElement.removeChild(avatar);
        }

        // Reset avatar positioning to be absolutely positioned within ranking container
        avatar.style.position = 'absolute';
        avatar.style.left = `${targetX}px`;
        avatar.style.top = `${targetY}px`;
        avatar.style.transform = 'none';
        avatar.style.transition = 'all 800ms ease-in-out';
        avatar.style.zIndex = zIndex;
        avatar.style.width = `${avatarSize}px`;
        avatar.style.height = `${avatarSize}px`;
        avatar.style.borderRadius = '50%';
        avatar.style.border = `3px solid ${perf.tribe.color || '#fff'}`;

        rankingContainer.appendChild(avatar);

        // Add overall ranking badge
        const existingBadge = rankingContainer.querySelector(`.rank-badge-${survivor.id}`);
        if (existingBadge) {
          existingBadge.remove();
        }

        const badge = createElement('div', {
          className: `rank-badge rank-badge-${survivor.id}`,
          style: `
            position: absolute;
            left: ${targetX + avatarSize + 5}px;
            top: ${targetY + (avatarSize / 2) - 12}px;
            width: 24px;
            height: 24px;
            background: ${overallRank === 0 ? 'gold' : overallRank === 1 ? 'silver' : overallRank === 2 ? '#cd7f32' : '#666'};
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-family: 'Survivant', sans-serif;
            font-size: 0.8rem;
            font-weight: bold;
            color: ${overallRank < 3 ? 'black' : 'white'};
            z-index: ${zIndex + 100};
            border: 2px solid white;
          `
        }, (overallRank + 1).toString());

        rankingContainer.appendChild(badge);

      }, overallRank * 150); // Stagger animations
    });

    // Calculate total animation time and show continue button
    const totalRankingTime = stagePerfs.length * 150 + 800;

    setTimeout(() => {
      console.log(`Overall ranking animation complete for ${stage.name}, showing continue button`);
      this._showRankingContinueButton(stage, rankingContainer);
    }, totalRankingTime);
  },

  _showRankingContinueButton(stage, rankingContainer) {
    // Add continue button at the bottom of the ranking container
    const continueBtn = createElement('button', {
      style: `
        position: absolute;
        bottom: 20px;
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
        z-index: 1500;
        transition: all 0.2s ease;
      `,
      onclick: (e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log(`Continue button clicked for ${stage.name}, showing Jeff commentary`);
        this._showJeffCommentary(stage);
      },
      onmouseover: (e) => {
        e.target.style.transform = 'translateX(-50%) scale(1.05)';
      },
      onmouseout: (e) => {
        e.target.style.transform = 'translateX(-50%) scale(1)';
      }
    }, 'Continue');

    rankingContainer.appendChild(continueBtn);
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
        tribe: this.allTribes.find(t => (t.id || t.name || t.tribeName) === tribeKey), 
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
      console.log(`Stage object being passed to summary:`, stage);
      console.log(`Current stage index:`, this.stageIndex);
      console.log(`Available performance data:`, Object.keys(this.context.survivorStagePerformances));
      this._showStageSummary(stage);
    });
  },

  _generateJeffCommentary(stage, sorted, winner, loser, isClose, playerRank) {
    const winnerName = winner?.tribe?.name || winner?.tribe?.tribeName || 'Unknown Tribe';
    const loserName = loser?.tribe?.name || loser?.tribe?.tribeName || 'Unknown Tribe';
    const playerName = this.playerTribe?.name || this.playerTribe?.tribeName || 'Your Tribe';
    const stageDesc = stage?.description || 'this challenge';

    // Get overall standings to provide context
    const overallStandings = Object.entries(this.context.totalScores)
      .sort(([,a],[,b]) => b - a)
      .map(([tribeKey, score]) => ({ 
        tribe: this.allTribes.find(t => (t.id || t.name || t.tribeName) === tribeKey), 
        score,
        tribeKey 
      }));

    // Determine if this stage changed the overall lead
    const overallLeader = overallStandings[0];
    const overallLeaderName = overallLeader?.tribe?.name || overallLeader?.tribe?.tribeName || 'Unknown';
    const stageWinnerKey = winner?.tribe?.id || winner?.tribe?.name || winner?.tribe?.tribeName;
    const overallLeaderKey = overallLeader?.tribe?.id || overallLeader?.tribe?.name || overallLeader?.tribe?.tribeName;

    const stageWinnerIsOverallLeader = stageWinnerKey === overallLeaderKey;
    const isFirstStage = this.stageIndex === 0;

    // Check if tribe took the lead after this stage (for stages 2-3)
    let tookTheLead = false;
    let previousLeaderName = '';
    if (this.stageIndex >= 1 && this.stageIndex <= 2) { // stages 2-3 (0-indexed)
      // Get previous overall standings (before this stage)
      const previousTotalScores = {};
      Object.keys(this.context.totalScores).forEach(tribeKey => {
        previousTotalScores[tribeKey] = this.context.totalScores[tribeKey] - (this.context.stageScores[stage.id][tribeKey] || 0);
      });

      const previousStandings = Object.entries(previousTotalScores)
        .sort(([,a],[,b]) => b - a)
        .map(([tribeKey, score]) => ({ 
          tribe: this.allTribes.find(t => (t.id || t.name || t.tribeName) === tribeKey), 
          score,
          tribeKey 
        }));

      const previousLeaderKey = previousStandings[0]?.tribeKey;
      previousLeaderName = previousStandings[0]?.tribe?.name || previousStandings[0]?.tribe?.tribeName || 'Unknown';
      
      // Check if the current overall leader is different from the previous leader
      tookTheLead = previousLeaderKey !== overallLeaderKey && stageWinnerIsOverallLeader;
    }

    // Detect if a tribe is dominating (won multiple consecutive stages)
    let isDominating = false;
    if (this.stageIndex > 0) {
      let consecutiveWins = 0;
      for (let i = 0; i < this.stageIndex; i++) {
        const prevStage = this.stages[i];
        const prevScores = this.context.stageScores[prevStage.id];
        if (prevScores) {
          const prevWinnerKey = Object.keys(prevScores).reduce((a, b) => prevScores[a] > prevScores[b] ? a : b);
          if (prevWinnerKey === stageWinnerKey) {
            consecutiveWins++;
          } else {
            break; // Not consecutive
          }
        } else {
          break; // No scores for previous stage
        }
      }
      isDominating = consecutiveWins >= 2;
    }

    console.log('Generating Jeff commentary:', {
      stageName: stage?.name,
      winnerName,
      loserName,
      playerName,
      playerRank,
      isClose,
      isThreeTribe: this.isThreeTribe,
      overallLeaderName,
      stageWinnerIsOverallLeader,
      isFirstStage,
      isDominating
    });

    let commentary = "";

    if (this.isThreeTribe && sorted.length >= 3) {
      const middle = sorted[1];
      const middleName = middle?.tribe?.name || middle?.tribe?.tribeName || 'Middle Tribe';

      // Find overall positions
      const overallWinnerRank = overallStandings.findIndex(s => s.tribeKey === stageWinnerKey);
      const overallMiddleRank = overallStandings.findIndex(s => s.tribeKey === (middle?.tribe?.id || middle?.tribe?.name || middle?.tribe?.tribeName));
      const overallLoserRank = overallStandings.findIndex(s => s.tribeKey === (loser?.tribe?.id || loser?.tribe?.name || loser?.tribe?.tribeName));

      if (isFirstStage) {
        // First stage - focus on stage performance
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
        // Later stages - consider overall context
        if (tookTheLead) {
          // Tribe took the lead after this stage
          commentary = `${winnerName} wins ${stageDesc} and takes the overall lead! What a turnaround! ${previousLeaderName} had been leading but now ${winnerName} is in front. The standings have completely shifted!`;
        } else if (stageWinnerIsOverallLeader) {
          if (overallWinnerRank === 0) {
            commentary = `${winnerName} extends their overall lead with another strong performance in ${stageDesc}! ${middleName} and ${loserName} are running out of time to catch up. ${winnerName} is pulling away!`;
          }
        } else {
          // Stage winner is not overall leader - comeback story
          if (overallWinnerRank === 1) {
            commentary = `${winnerName} wins ${stageDesc} and closes the gap on overall leader ${overallLeaderName}! This challenge is far from over - ${winnerName} is making their move!`;
          } else if (overallWinnerRank === 2) {
            commentary = `${winnerName} makes a huge comeback in ${stageDesc}! They're fighting their way back from last place, but will it be enough to catch ${overallLeaderName}? Every second counts now!`;
          }
        }

        // Add context about player tribe's situation
        if (playerRank !== 0) {
          const playerOverallRank = overallStandings.findIndex(s => s.tribeKey === (this.playerTribe?.id || this.playerTribe?.name || this.playerTribe?.tribeName));
          if (playerOverallRank === 2) {
            commentary += ` ${playerName}, you're in last place overall - you need to turn this around immediately!`;
          } else if (playerOverallRank === 1 && overallStandings[0].score - overallStandings[1].score > 1.5) {
            commentary += ` ${playerName}, you're falling behind ${overallLeaderName} - time is running out!`;
          }
        }
      }
    } else {
      // Two tribe scenario
      if (isFirstStage) {
        // First stage - focus on stage performance
        if (isClose) {
          commentary = `What a battle! Both tribes are giving everything they have in ${stageDesc}! ${winnerName} barely edges out ${loserName} by the slimmest of margins. This is going to be a fight to the finish!`;
        } else {
          if (playerRank === 0) {
            commentary = `${playerName} absolutely destroys ${loserName} in the ${stage.name} stage! Your tribe makes ${stageDesc} look easy while ${loserName} struggles badly. Complete domination!`;
          } else {
            commentary = `${winnerName} takes a commanding lead! ${playerName} is falling behind badly in ${stageDesc}! If you don't turn this around, you'll be seeing me at Tribal Council tonight!`;
          }
        }
      } else {
        // Later stages - consider overall context
        const overallGap = Math.abs(overallStandings[0].score - overallStandings[1].score);
        const isCloseOverall = overallGap < 2.0;

        if (stageWinnerIsOverallLeader) {
          if (isCloseOverall) {
            commentary = `${winnerName} maintains their overall lead with a win in ${stageDesc}! But ${loserName} is still right there - this challenge could go either way!`;
          } else {
            commentary = `${winnerName} extends their commanding overall lead! They dominate ${stageDesc} while ${loserName} continues to struggle. This is looking like a runaway!`;
          }
        } else {
          // Comeback situation
          if (tookTheLead) {
            // Tribe took the lead after this stage
            commentary = `${winnerName} wins ${stageDesc} and takes the overall lead! What a comeback! ${previousLeaderName} had been leading but now ${winnerName} is in front. Everything has changed!`;
          } else if (isCloseOverall) {
            commentary = `${winnerName} wins ${stageDesc} and closes the gap significantly! They're making up ground on ${overallLeaderName}. This challenge is getting tight!`;
          } else {
            commentary = `${winnerName} wins ${stageDesc} and makes up significant ground! They're fighting back from a big deficit against ${overallLeaderName}. Can they complete the comeback?`;
          }
        }

        // Add player-specific context
        if (playerRank !== 0) {
          const playerOverallRank = overallStandings.findIndex(s => s.tribeKey === (this.playerTribe?.id || this.playerTribe?.name || this.playerTribe?.tribeName));
          if (playerOverallRank === 1 && !isCloseOverall) {
            commentary += ` ${playerName}, you're in serious trouble - you need something special in the remaining stages!`;
          }
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
      onclick: (e) => {
        console.log('Jeff parchment next button clicked');
        e.preventDefault();
        e.stopPropagation();
        if (typeof onNext === 'function') {
          onNext();
        } else {
          console.error('onNext callback is not a function:', onNext);
        }
      }
    }, 'Next');

    console.log('Appending parchment wrapper and next button to container');
    this.container.append(parchmentWrapper, nextButton);

    // Force a repaint to ensure elements are visible
    setTimeout(() => {
      console.log('Parchment elements should now be visible');
    }, 100);
  },

  _showStageSummary(stage) {
    console.log(`=== SHOWING STAGE SUMMARY ===`);
    console.log(`Showing stage summary for: ${stage.name}`);
    console.log(`Stage ID: ${stage.id}`);
    console.log(`All performance data:`, this.context.survivorStagePerformances);
    console.log(`Available stage IDs:`, Object.keys(this.context.survivorStagePerformances));
    console.log(`Container exists:`, !!this.container);
    console.log(`Stage object:`, stage);

    try {
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
        console.log(`Creating fallback summary for stage: ${stage.name}`);
        this._createFallbackSummary(stage);
        return;
      }

      const tribesData = this.allTribes.map(tribe => ({
        tribe,
        survivors: stagePerfs.filter(p => (p.tribe.id === tribe.id || p.tribe.name === tribe.name))
      }));

      console.log(`Tribes data:`, tribesData);

      // Create ranking display
      console.log(`Creating survivor ranking display...`);
      this._createSurvivorRankingDisplay(stage, tribesData);
      console.log(`Survivor ranking display created successfully`);
    } catch (error) {
      console.error(`Error in _showStageSummary:`, error);
      // Force create fallback summary on error
      this._createFallbackSummary(stage);
    }
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
        max-width: 300px;
      `
    });

    const title = createElement('div', {
      style: `
        color: #f39c12;
        font-size: 1.3rem;
        margin-bottom: 20px;
      `
    }, `${stage.name} Results`);

    // Create tribal standings based on total scores
    const sortedTribes = Object.entries(this.context.totalScores)
      .sort(([,a],[,b]) => b - a)
      .map(([tribeKey, score]) => ({ 
        tribe: this.allTribes.find(t => (t.id || t.name || t.tribeName) === tribeKey), 
        score 
      }));

    const standingsContainer = createElement('div', {
      style: `
        margin-bottom: 20px;
        text-align: left;
      `
    });

    const standingsTitle = createElement('div', {
      style: `
        color: #f39c12;
        font-size: 1.1rem;
        margin-bottom: 10px;
        text-align: center;
      `
    }, 'Current Tribal Standings:');

    standingsContainer.appendChild(standingsTitle);

    sortedTribes.forEach((entry, index) => {
      const position = index + 1;
      const tribeName = entry.tribe?.name || entry.tribe?.tribeName || 'Unknown Tribe';
      const tribeColor = entry.tribe?.tribeColor || entry.tribe?.color || '#fff';

      const rankingDiv = createElement('div', {
        style: `
          display: flex;
          align-items: center;
          margin-bottom: 8px;
          padding: 8px;
          background: rgba(255, 255, 255, 0.1);
          border-radius: 5px;
        `
      });

      const positionElement = createElement('span', {
        style: `
          color: #f39c12;
          font-weight: bold;
          margin-right: 10px;
          min-width: 20px;
        `
      }, `${position}.`);

      const tribeElement = createElement('span', {
        style: `
          color: ${tribeColor};
          font-weight: bold;
          text-shadow: 1px 1px 1px black;
        `
      }, tribeName);

      rankingDiv.append(positionElement, tribeElement);
      standingsContainer.appendChild(rankingDiv);
    });

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

    wrapper.append(title, standingsContainer, nextBtn);
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
            border-left: 4px solid ${perf.tribe.color || perf.tribe.tribeColor || '#fff'};
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
            border: 2px solid ${perf.tribe.color || perf.tribe.tribeColor || '#fff'};
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
            color: ${perf.tribe.color || perf.tribe.tribeColor || '#ccc'};
            font-family: 'Survivant', sans-serif;
            font-size: 0.8rem;
            text-shadow: 1px 1px 1px black;
          `
        }, perf.tribe.name || perf.tribe.tribeName);

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
        tribe: this.allTribes.find(t => (t.id || t.name || t.tribeName) === tribeKey), 
        score 
      }));

    const winners = sorted.slice(0, this.isThreeTribe ? 2 : 1);
    const losers = sorted.slice(this.isThreeTribe ? 2 : 1);

    // Generate final Jeff commentary
    let finalCommentary;
    if (this.isThreeTribe) {
      const winner1 = winners[0].tribe.name || winners[0].tribe.tribeName;
      const winner2 = winners[1].tribe.name || winners[1].tribe.tribeName;
      const loser = losers[0].tribe.name || losers[0].tribe.tribeName;

      if ((losers[0].tribe.id || losers[0].tribe.name || losers[0].tribe.tribeName) === (this.playerTribe.id || this.playerTribe.name || this.playerTribe.tribeName)) {
        finalCommentary = `${winner1} and ${winner2} have won immunity! ${this.playerTribe.name || this.playerTribe.tribeName}, you struggled in this challenge and will be heading to Tribal Council tonight where one of you will become the first person voted out of Survivor Island.`;
      } else {
        finalCommentary = `${winner1} and ${winner2} have won immunity and are safe from tonight's vote! ${loser}, I'll be seeing you at Tribal Council where one of your tribe members will become the first person voted out.`;
      }
    } else {
      const winner = winners[0].tribe.name || winners[0].tribe.tribeName;
      const loser = losers[0].tribe.name || losers[0].tribe.tribeName;

      if ((losers[0].tribe.id || losers[0].tribe.name || losers[0].tribe.tribeName) === (this.playerTribe.id || this.playerTribe.name || this.playerTribe.tribeName)) {
        finalCommentary = `${winner} wins immunity! ${this.playerTribe.name || this.playerTribe.tribeName}, you have nothing to protect you tonight. One of you will become the first person voted out of Survivor Island.`;
      } else {
        finalCommentary = `${this.playerTribe.name || this.playerTribe.tribeName} wins immunity! ${loser}, grab your torches and head to Tribal Council. One of you will be voted out tonight.`;
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
    const losers = sortedTribes.slice(this.isThreeTribe ? 2 : 1);
    const winnerNames = winners.map(t => t.tribe.name || t.tribe.tribeName).join(' and ');
    
    // Mark immunity status for all tribes
    this.allTribes.forEach(tribe => {
      const isWinner = winners.some(w => (w.tribe.id || w.tribe.name || w.tribe.tribeName) === (tribe.id || tribe.name || tribe.tribeName));
      tribe.hasImmunity = isWinner;
      tribe.immunityStatus = isWinner ? 'immune' : 'vulnerable';
      console.log(`${tribe.name || tribe.tribeName} immunity status: ${tribe.immunityStatus}`);
    });
    
    // Get all individual performances across all stages
    const allPerformances = [];
    Object.values(this.context.survivorStagePerformances).forEach(stagePerfs => {
      stagePerfs.forEach(perf => {
        const existingPerf = allPerformances.find(p => p.survivor.id === perf.survivor.id);
        if (existingPerf) {
          existingPerf.totalScore += perf.normalizedScore;
          existingPerf.stageCount++;
        } else {
          allPerformances.push({
            survivor: perf.survivor,
            tribe: perf.tribe,
            totalScore: perf.normalizedScore,
            stageCount: 1
          });
        }
      });
    });

    // Calculate average performance and sort
    allPerformances.forEach(perf => {
      perf.averageScore = perf.totalScore / perf.stageCount;
    });
    allPerformances.sort((a, b) => b.averageScore - a.averageScore);

    // Determine how many to show based on total survivors
    const totalSurvivors = allPerformances.length;
    const showTop = totalSurvivors <= 6 ? 2 : 3;
    const showBottom = totalSurvivors <= 6 ? 2 : 3;

    const topPerformers = allPerformances.slice(0, showTop);
    const bottomPerformers = allPerformances.slice(-showBottom).reverse();
    const middlePerformers = allPerformances.slice(showTop, -showBottom);

    // Apply threat adjustments
    const threatAdjustments = totalSurvivors <= 6 ? [5, 3] : [5, 3, 1];
    
    topPerformers.forEach((perf, index) => {
      const adjustment = threatAdjustments[index] || 0;
      perf.survivor.threat = Math.min(10, (perf.survivor.threat || 5) + adjustment);
      perf.threatChange = `+${adjustment} threat`;
    });

    bottomPerformers.forEach((perf, index) => {
      const adjustment = threatAdjustments[index] || 0;
      perf.survivor.threat = Math.max(0, (perf.survivor.threat || 5) - adjustment);
      perf.threatChange = `-${adjustment} threat`;
    });

    // No change for middle performers
    middlePerformers.forEach(perf => {
      perf.threatChange = '-0 threat';
    });

    // Create main parchment container with portrait orientation
    const parchmentContainer = createElement('div', {
      style: `
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 320px;
        height: 520px;
        background: url('Assets/parch-portrait.png') center/cover no-repeat;
        z-index: 10;
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 25px 15px;
        box-sizing: border-box;
      `
    });

    // Title
    const title = createElement('div', {
      style: `
        color: white;
        font-family: 'Survivant', sans-serif;
        font-size: 1.05rem;
        font-weight: bold;
        text-shadow: 2px 2px 4px black;
        text-align: center;
        margin-bottom: 12px;
        line-height: 1.2;
      `
    }, `${winnerNames} wins immunity in First Contact!`);

    // Challenge Performances header
    const performancesHeader = createElement('div', {
      style: `
        color: #f39c12;
        font-family: 'Survivant', sans-serif;
        font-size: 0.95rem;
        font-weight: bold;
        text-shadow: 2px 2px 4px black;
        text-align: center;
        margin-bottom: 10px;
      `
    }, 'Challenge Performances');

    // Create scrollable content area
    const scrollableContent = createElement('div', {
      style: `
        width: 100%;
        flex: 1;
        overflow-y: auto;
        overflow-x: hidden;
        padding-right: 5px;
        margin-bottom: 10px;
      `
    });

    // Best performers section
    const bestSection = createElement('div', {
      style: `
        width: 100%;
        margin-bottom: 12px;
      `
    });

    const bestHeader = createElement('div', {
      style: `
        color: #22c55e;
        font-family: 'Survivant', sans-serif;
        font-size: 0.85rem;
        font-weight: bold;
        text-shadow: 1px 1px 2px black;
        text-align: center;
        margin-bottom: 6px;
      `
    }, 'Best');

    topPerformers.forEach((perf, index) => {
      const performerDiv = createElement('div', {
        style: `
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 5px;
          padding: 3px 6px;
          background: rgba(34, 197, 94, 0.1);
          border-radius: 3px;
        `
      });

      const leftSide = createElement('div', {
        style: `
          display: flex;
          align-items: center;
          gap: 5px;
        `
      });

      const rank = createElement('span', {
        style: `
          color: #f39c12;
          font-family: 'Survivant', sans-serif;
          font-size: 0.75rem;
          font-weight: bold;
          min-width: 12px;
          text-shadow: 1px 1px 2px black;
        `
      }, `${index + 1}.`);

      const avatar = createElement('img', {
        src: perf.survivor.avatarUrl || `Assets/Avatars/${perf.survivor.firstName.toLowerCase()}.jpeg`,
        style: `
          width: 20px;
          height: 20px;
          border-radius: 50%;
          border: 2px solid ${perf.tribe.color || perf.tribe.tribeColor || '#fff'};
        `
      });

      const name = createElement('span', {
        style: `
          color: white;
          font-family: 'Survivant', sans-serif;
          font-size: 0.75rem;
          text-shadow: 1px 1px 2px black;
        `
      }, perf.survivor.firstName);

      const threatChange = createElement('span', {
        style: `
          color: #22c55e;
          font-family: 'Survivant', sans-serif;
          font-size: 0.65rem;
          font-weight: bold;
          text-shadow: 1px 1px 2px black;
        `
      }, perf.threatChange);

      leftSide.append(rank, avatar, name);
      performerDiv.append(leftSide, threatChange);
      bestSection.appendChild(performerDiv);
    });

    // Middle performers section (if any)
    let middleSection = null;
    if (middlePerformers.length > 0) {
      middleSection = createElement('div', {
        style: `
          width: 100%;
          margin-bottom: 12px;
        `
      });

      const middleHeader = createElement('div', {
        style: `
          color: #fbbf24;
          font-family: 'Survivant', sans-serif;
          font-size: 0.85rem;
          font-weight: bold;
          text-shadow: 1px 1px 2px black;
          text-align: center;
          margin-bottom: 6px;
        `
      }, 'Middle');

      middlePerformers.forEach((perf, index) => {
        const overallRank = showTop + index + 1;
        const performerDiv = createElement('div', {
          style: `
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 5px;
            padding: 3px 6px;
            background: rgba(251, 191, 36, 0.1);
            border-radius: 3px;
          `
        });

        const leftSide = createElement('div', {
          style: `
            display: flex;
            align-items: center;
            gap: 5px;
          `
        });

        const rank = createElement('span', {
          style: `
            color: #f39c12;
            font-family: 'Survivant', sans-serif;
            font-size: 0.75rem;
            font-weight: bold;
            min-width: 12px;
            text-shadow: 1px 1px 2px black;
          `
        }, `${overallRank}.`);

        const avatar = createElement('img', {
          src: perf.survivor.avatarUrl || `Assets/Avatars/${perf.survivor.firstName.toLowerCase()}.jpeg`,
          style: `
            width: 20px;
            height: 20px;
            border-radius: 50%;
            border: 2px solid ${perf.tribe.color || perf.tribe.tribeColor || '#fff'};
          `
        });

        const name = createElement('span', {
          style: `
            color: white;
            font-family: 'Survivant', sans-serif;
            font-size: 0.75rem;
            text-shadow: 1px 1px 2px black;
          `
        }, perf.survivor.firstName);

        const threatChange = createElement('span', {
          style: `
            color: #fbbf24;
            font-family: 'Survivant', sans-serif;
            font-size: 0.65rem;
            font-weight: bold;
            text-shadow: 1px 1px 2px black;
          `
        }, perf.threatChange);

        leftSide.append(rank, avatar, name);
        performerDiv.append(leftSide, threatChange);
        middleSection.appendChild(performerDiv);
      });
    }

    // Worst performers section
    const worstSection = createElement('div', {
      style: `
        width: 100%;
        margin-bottom: 5px;
      `
    });

    const worstHeader = createElement('div', {
      style: `
        color: #ef4444;
        font-family: 'Survivant', sans-serif;
        font-size: 0.85rem;
        font-weight: bold;
        text-shadow: 1px 1px 2px black;
        text-align: center;
        margin-bottom: 6px;
      `
    }, 'Worst');

    bottomPerformers.forEach((perf, index) => {
      const overallRank = allPerformances.length - bottomPerformers.length + index + 1;
      const performerDiv = createElement('div', {
        style: `
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 5px;
          padding: 3px 6px;
          background: rgba(239, 68, 68, 0.1);
          border-radius: 3px;
        `
      });

      const leftSide = createElement('div', {
        style: `
          display: flex;
          align-items: center;
          gap: 5px;
        `
      });

      const rank = createElement('span', {
        style: `
          color: #f39c12;
          font-family: 'Survivant', sans-serif;
          font-size: 0.75rem;
          font-weight: bold;
          min-width: 12px;
          text-shadow: 1px 1px 2px black;
        `
      }, `${overallRank}.`);

      const avatar = createElement('img', {
        src: perf.survivor.avatarUrl || `Assets/Avatars/${perf.survivor.firstName.toLowerCase()}.jpeg`,
        style: `
          width: 20px;
          height: 20px;
          border-radius: 50%;
          border: 2px solid ${perf.tribe.color || perf.tribe.tribeColor || '#fff'};
        `
      });

      const name = createElement('span', {
        style: `
          color: white;
          font-family: 'Survivant', sans-serif;
          font-size: 0.75rem;
          text-shadow: 1px 1px 2px black;
        `
      }, perf.survivor.firstName);

      const threatChange = createElement('span', {
        style: `
          color: #ef4444;
          font-family: 'Survivant', sans-serif;
          font-size: 0.65rem;
          font-weight: bold;
          text-shadow: 1px 1px 2px black;
        `
      }, perf.threatChange);

      leftSide.append(rank, avatar, name);
      performerDiv.append(leftSide, threatChange);
      worstSection.appendChild(performerDiv);
    });

    // Append sections to scrollable content
    scrollableContent.appendChild(bestSection);
    if (middleSection) {
      scrollableContent.appendChild(middleSection);
    }
    scrollableContent.appendChild(worstSection);

    parchmentContainer.append(title, performancesHeader, scrollableContent);

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

    this.container.append(parchmentContainer, doneBtn);

    console.log('Threat adjustments applied:', {
      topPerformers: topPerformers.map(p => ({ name: p.survivor.firstName, change: p.threatChange, newThreat: p.survivor.threat })),
      bottomPerformers: bottomPerformers.map(p => ({ name: p.survivor.firstName, change: p.threatChange, newThreat: p.survivor.threat }))
    });
  },
};

export default FirstContactView;