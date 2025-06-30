// src/views/FirstContactView.js

import { createElement, clearChildren } from '../utils/DOMUtils.js';
import gameManager from '../core/GameManager.js';

/**
 * Helper to get a consistent tribe key
 */
function getTribeKey(tribe) {
  return tribe.id ?? tribe.name ?? tribe.tribeName;
}

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
    console.log(`Calculating stage: ${stage.id}`);

    // Initialize storage
    this.context.survivorStagePerformances[stage.id] = [];

    this.allTribes.forEach(tribe => {
      const tribeKey = getTribeKey(tribe);
      const participants = tribe.members.filter(s => s.roles?.includes(stage.id));

      // ⚠️ Fallback for missing assignments
      if (participants.length === 0) {
        console.warn(`No participants for stage '${stage.id}' in tribe '${tribeKey}'`);
      }

      console.log(`${tribeKey} participants for ${stage.id}:`, participants.map(p => p.firstName));

      // Compute totalAbility
      let totalAbility = 0;
      participants.forEach(survivor => {
        const healthFactor     = 0.7 + ((survivor.health ?? 100) / 100) * 0.3;
        const tribeAvgHealth   = tribe.members.reduce((sum,m)=>sum+(m.health??100),0)/tribe.members.length;
        const tribeHealthFactor= 0.9 + (tribeAvgHealth/100)*0.1;
        const luckFactor       = 0.75 + Math.random()*0.5;

        let traitAbility = 0;
        for (let [trait, weight] of Object.entries(stage.weights)) {
          traitAbility += (survivor[trait] ?? 0) * weight;
        }

        // Apply all factors: traits are most important, but modified by health and luck
        const ability = traitAbility * healthFactor * tribeHealthFactor * luckFactor;

        survivor._fc_ability = ability;
        totalAbility += ability;

        console.log(`${survivor.firstName} - Traits: ${traitAbility.toFixed(2)}, Health: ${healthFactor.toFixed(2)}, Tribe Health: ${tribeHealthFactor.toFixed(2)}, Luck: ${luckFactor.toFixed(2)}, Final: ${ability.toFixed(2)}`);

        this.context.survivorStagePerformances[stage.id].push({
          survivor,
          tribe,
          ability,
          normalizedScore: ability
        });
      });

      // Scale tribe score
      const maxPossible = participants.length * Object.values(stage.weights).reduce((a,b)=>a+b,0) * 10;
      const basePoints  = maxPossible > 0 ? (totalAbility / maxPossible) * 25 : 0;
      const tribeLuck   = 0.90 + Math.random()*0.20;
      const finalPoints = basePoints * tribeLuck;

      this.context.stageScores[stage.id]      = this.context.stageScores[stage.id] || {};
      this.context.stageScores[stage.id][tribeKey] = finalPoints;
      this.context.totalScores[tribeKey]      = (this.context.totalScores[tribeKey] || 0) + finalPoints;
    });

    // Normalize individual performances, with divide-by-zero check
    const perfs = this.context.survivorStagePerformances[stage.id] || [];
    const maxAbility = perfs.length ? Math.max(...perfs.map(p=>p.ability)) : 0;
    perfs.forEach(p => {
      p.normalizedScore = maxAbility > 0
        ? (p.ability / maxAbility) * 100
        : 0;
    });
    perfs.sort((a,b)=>b.normalizedScore - a.normalizedScore);
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
                console.log('Starting phase 2 - moving overall challenge winners to finish line');

                // Find overall challenge winners based on total scores
                const overallStandings = Object.entries(this.context.totalScores)
                  .sort(([,a],[,b]) => b - a)
                  .map(([tribeKey, score]) => ({ tribeKey, score }));

                if (overallStandings.length > 0) {
                  const phase2Distance = fullDistance * 0.25;
                  const phase2Duration = 1000; // 1 second for final push

                  if (this.isThreeTribe && overallStandings.length >= 2) {
                    // Three tribe mode: overall first place moves first, then overall second place
                    const overallWinnerKey = overallStandings[0].tribeKey;
                    const overallSecondKey = overallStandings[1].tribeKey;

                    console.log(`Three tribe mode - Overall Winner: ${overallWinnerKey}, Overall Second: ${overallSecondKey}`);

                    // Phase 2a: Move overall winning tribe avatars the remaining 25%
                    avatars.forEach(({ survivor, avatar, tribe }) => {
                      const tribeKey = tribe.id || tribe.name || tribe.tribeName;
                      if (tribeKey === overallWinnerKey) {
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
                      console.log('Overall winner finished, moving overall second place tribe');

                      // Phase 2b: Move overall second place tribe avatars the remaining 25%
                      avatars.forEach(({ survivor, avatar, tribe }) => {
                        const tribeKey = tribe.id || tribe.name || tribe.tribeName;
                        if (tribeKey === overallSecondKey) {
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
                        console.log('Overall second place finished, going directly to final results');
                        this._showFinalResults();
                      }, phase2Duration + 500);

                    }, phase2Duration + 300); // Small delay between winner and second place

                  } else {
                    // Two tribe mode: only overall winner moves
                    const overallWinnerKey = overallStandings[0].tribeKey;
                    console.log(`Two tribe mode - Overall Winner: ${overallWinnerKey}`);

                    // Phase 2: Move only overall winning tribe avatars the remaining 25%
                    avatars.forEach(({ survivor, avatar, tribe }) => {
                      const tribeKey = tribe.id || tribe.name || tribe.tribeName;
                      if (tribeKey === overallWinnerKey) {
                        const ability = Math.max(0, survivor._fc_ability || 0);
                        const normalizedAbility = ability / maxAbility;
                        const currentDistance = phase1Distance * normalizedAbility;
                        const finalDistance = currentDistance + phase2Distance;

                        avatar.style.transition = `transform ${phase2Duration}ms ease-out`;
                        avatar.style.transform = `translateY(-${finalDistance}px)`;
                      }
                    });

                    // Wait for winner to finish before showing final results
                    setTimeout(() => {
                      console.log('Overall winner finished, going directly to final results');
                      this._showFinalResults();
                    }, phase2Duration + 500);
                  }
                } else {
                  console.warn('No overall standings available for puzzle stage');
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

    // Calculate better horizontal distribution to prevent overlaps
    const getHorizontalPosition = (overallRank, totalCount) => {
      // For large numbers of survivors, use a more distributed layout
      if (totalCount > 12) {
        // Use a grid-like approach for many survivors
        const columns = 3;
        const column = overallRank % columns;
        const columnWidth = containerWidth / columns;
        return (columnWidth * column) + (columnWidth / 2) - (avatarSize / 2);
      } else if (totalCount > 6) {
        // Use two columns for medium numbers
        const columns = 2;
        const column = overallRank % columns;
        const columnWidth = containerWidth / columns;
        return (columnWidth * column) + (columnWidth / 2) - (avatarSize / 2);
      } else {
        // Single column for small numbers, but with better spacing
        return centerX - (avatarSize / 2);
      }
    };

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

      // Get base horizontal position
      let baseX = getHorizontalPosition(overallRank, stagePerfs.length);

      if (tiedSurvivors.length > 1) {
        // Find this survivor's position within the tied group
        const positionInTie = tiedSurvivors.findIndex(s => s.survivor.id === perf.survivor.id);
        const totalTied = tiedSurvivors.length;

        // Add small vertical offset to prevent exact overlap
        targetY += positionInTie * 2;

        // Calculate horizontal offset to spread tied survivors
        const spacing = Math.min(45, containerWidth / (totalTied + 2)); // Adaptive spacing
        const startOffset = -(totalTied - 1) * spacing / 2;
        horizontalOffset = startOffset + (positionInTie * spacing);
      }

      // Add some randomness to prevent perfect overlap for survivors with very similar scores
      const jitter = (Math.random() - 0.5) * 8; // Small random offset
      const targetX = Math.max(5, Math.min(containerWidth - avatarSize - 5, baseX + horizontalOffset + jitter));

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

        // Add overall ranking badge with black background for better visibility
        const existingBadge = rankingContainer.querySelector(`.rank-badge-${survivor.id}`);
        if (existingBadge) {
          existingBadge.remove();
        }

        const badge = createElement('div', {
          className: `rank-badge rank-badge-${survivor.id}`,
          style: `
            position: absolute;
            left: ${targetX + avatarSize + 2}px;
            top: ${targetY + (avatarSize / 2) - 12}px;
            width: 24px;
            height: 24px;
            background: ${overallRank === 0 ? 'gold' : overallRank === 1 ? 'silver' : overallRank === 2 ? '#cd7f32' : '#333'};
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-family: 'Survivant', sans-serif;
            font-size: 0.75rem;
            font-weight: bold;
            color: ${overallRank < 3 ? 'black' : 'white'};
            z-index: ${zIndex + 100};
            border: 2px solid white;
            text-shadow: ${overallRank < 3 ? 'none' : '1px 1px 1px black'};
          `
        }, (overallRank + 1).toString());

        rankingContainer.appendChild(badge);

      }, overallRank * 100); // Slightly faster stagger for better flow
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

    const playerTribeKey = this.playerTribe?.id || this.playerTribe?.name || this.playerTribe?.tribeName;
    const playerRank = sorted.findIndex(entry => {
      const entryTribeKey = entry.tribe?.id || entry.tribe?.name || entry.tribe?.tribeName;
      return entryTribeKey === playerTribeKey;
    });
    console.log(`Player tribe key: ${playerTribeKey}, Player tribe rank: ${playerRank}`);
    console.log(`Player tribe object:`, this.playerTribe);

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
    const winnerKey = getTribeKey(winner.tribe);
    const loserKey = getTribeKey(loser.tribe);
    const playerKey = getTribeKey(this.playerTribe);

    const winnerName = winner?.tribe?.name || winner?.tribe?.tribeName || 'Unknown Tribe';
    const loserName = loser?.tribe?.name || loser?.tribe?.tribeName || 'Unknown Tribe';
    const playerName = this.playerTribe?.name || this.playerTribe?.tribeName || 'Your Tribe';
    const stageDesc = stage.description;
    const isFirst = this.stageIndex === 0;

    // Helper function to get hex color from tribe color name
    const getTribeColorHex = (colorName) => {
      const colorMap = {
        'red': '#FF0000',
        'blue': '#0066FF',
        'orange': '#FF8C00',
        'green': '#228B22',
        'purple': '#8A2BE2'
      };
      return colorMap[colorName] || '#FFFFFF';
    };

    // Helper function to wrap tribe names with color
    const colorTribeName = (tribeName, tribe) => {
      const color = getTribeColorHex(tribe?.color || tribe?.tribeColor);
      return `<span style="color: ${color}; font-weight: bold; text-shadow: 1px 1px 2px black;">${tribeName}</span>`;
    };

    // Helper function to wrap survivor names with their tribe color
    const colorSurvivorName = (survivorName, tribe) => {
      const color = getTribeColorHex(tribe?.color || tribe?.tribeColor);
      const tribeName = tribe?.name || tribe?.tribeName || 'Unknown';
      return `<span style="color: ${color}; font-weight: bold; text-shadow: 1px 1px 2px black;">${survivorName} from ${tribeName}</span>`;
    };

    // Build overall standings
    const overallStandings = Object.entries(this.context.totalScores)
      .sort(([,a],[,b]) => b - a)
      .map(([tribeKey, score]) => ({ tribeKey, score }));

    const overallLeaderKey = overallStandings[0]?.tribeKey;
    const winnerOverallRank = overallStandings.findIndex(s => s.tribeKey === winnerKey);
    const loserOverallRank = overallStandings.findIndex(s => s.tribeKey === loserKey);

    // Check for stage ties
    const stageScores = this.context.stageScores[stage.id] || {};
    const stageHasTies = Object.values(stageScores).some((score, i, arr) => 
      arr.filter(s => Math.abs(s - score) < 0.01).length > 1
    );

    // Calculate score difference for dynamic reactions
    const scoreDiff = winner.score - loser.score;
    const isBlowout = scoreDiff > 8;
    const isNailBiter = scoreDiff < 2;

    // Fixed losing streak detection
    let lossStreakInfo = null;
    if (this.stageIndex >= 2) {
      let consecutiveLosses = 0;

      for (let i = this.stageIndex - 1; i >= 0; i--) {
        const prevStage = this.stages[i];
        const prevScores = this.context.stageScores[prevStage.id] || {};
        const prevWinners = this.isThreeTribe ? 
          Object.entries(prevScores).sort(([,a],[,b]) => b