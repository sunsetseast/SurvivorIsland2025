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
      this._updateTribalMomentum(stage.id);
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

  // Initialize commentary memory system
  _initializeCommentaryMemory() {
    if (!this.commentaryMemory) {
      this.commentaryMemory = {
        tribalMomentum: new Map(), // tribe.name -> consecutive good/bad stages
        consistentPerformers: new Set(),
        comebackPlayers: new Set(),
        usedPhrases: new Set()
      };
    }
    
    // Enhanced Jeff phrases object
    this.jeffPhrases = {
      stageIntros: [
        "What a finish to {stageName}!",
        "{stageName} is complete — and what a battle that was!",
        "That {stageName} stage is done — let's break it down!",
        "The {stageName} results are in, and wow!",
        "{stageName} just wrapped up with some incredible performances!",
        "After that {stageName} stage, here's what stood out:",
        "The dust has settled on {stageName} — what a stage!"
      ],
      momentum: [
        "{tribe} is building serious momentum right now!",
        "You can feel the energy shift toward {tribe}!",
        "{tribe} has found their rhythm — they're dangerous now!",
        "The momentum is all {tribe}'s right now!",
        "{tribe} is riding a wave of confidence!"
      ],
      clutchPerformances: [
        "{player} came through when {tribe} needed it most!",
        "That's what champions do — {player} delivered under pressure!",
        "{player} stepped up big time for {tribe} in that stage!",
        "Clutch performance from {player} when it mattered!",
        "{player} proving they're a difference-maker for {tribe}!"
      ],
      teamwork: [
        "{tribe} is working like a well-oiled machine!",
        "Perfect teamwork from {tribe} in that stage!",
        "{tribe} showing what happens when everyone's on the same page!",
        "That's championship-level coordination from {tribe}!",
        "{tribe} executed that flawlessly as a unit!"
      ],
      pressure: [
        "The pressure is mounting on {tribe} — they need to respond!",
        "{tribe} feeling the heat after that performance!",
        "All eyes are on {tribe} now — can they bounce back?",
        "The spotlight is on {tribe} — time to step up!",
        "{tribe} is in a tough spot — they need something special!"
      ],
      closeWins: [
        "That was as close as it gets!",
        "Could not have been any closer!",
        "What a nail-biter that was!",
        "Incredible how tight that finish was!"
      ],
      blowouts: [
        "{winnerTribe} absolutely dominated {loserTribe} in that one!",
        "Complete and total domination by {winnerTribe}!",
        "{winnerTribe} made that look easy against {loserTribe}!",
        "No contest — {winnerTribe} ran away with it!"
      ],
      individualStars: [
        "{player} was on fire in {stage}!",
        "What a performance from {player}!",
        "{player} showing everyone how it's done!",
        "Absolutely brilliant work from {player}!"
      ],
      individualFlops: [
        "{player} really struggled in {stage}!",
        "Not {player}'s finest moment in {stage}!",
        "{player} couldn't find their rhythm in {stage}!",
        "Tough stage for {player} — they'll need to bounce back!"
      ],
      consistency: [
        "{player} has been rock solid all day!",
        "You can always count on {player}!",
        "{player} delivering again and again!",
        "The definition of consistent — {player}!"
      ],
      comebacks: [
        "{tribe} showing incredible resilience!",
        "What a turnaround from {tribe}!",
        "{tribe} proving they're not done yet!",
        "Never count {tribe} out!"
      ],
      takingLead: [
        "{tribe} takes over the lead!",
        "New leaders — {tribe} on top!",
        "{tribe} seizes control!",
        "The lead changes hands to {tribe}!"
      ],
      losingLead: [
        "{tribe} loses their grip on first place!",
        "The lead slips away from {tribe}!",
        "{tribe} no longer in control!",
        "{tribe} falls from the top spot!"
      ]
    };
  }

  // Update tribal momentum tracking
  _updateTribalMomentum(stageId) {
    const stageResults = Object.entries(this.context.stageScores[stageId] || {})
      .sort(([,a], [,b]) => b - a);
    
    if (stageResults.length >= 2) {
      const winner = stageResults[0][0];
      const loser = stageResults[stageResults.length - 1][0];
      
      // Update momentum tracking
      if (!this.commentaryMemory.tribalMomentum.has(winner)) {
        this.commentaryMemory.tribalMomentum.set(winner, 0);
      }
      if (!this.commentaryMemory.tribalMomentum.has(loser)) {
        this.commentaryMemory.tribalMomentum.set(loser, 0);
      }
      
      // Increase winner momentum, reset loser momentum
      this.commentaryMemory.tribalMomentum.set(winner, 
        Math.max(0, this.commentaryMemory.tribalMomentum.get(winner)) + 1);
      this.commentaryMemory.tribalMomentum.set(loser, 
        Math.min(0, this.commentaryMemory.tribalMomentum.get(loser)) - 1);
    }
  }

  _generateJeffCommentary(stage, sorted, winner, loser, isClose, playerRank) {
    // Initialize commentary memory if needed
    this._initializeCommentaryMemory();
    
    const winnerKey = getTribeKey(winner.tribe);
    const loserKey = getTribeKey(loser.tribe);
    const playerKey = getTribeKey(this.playerTribe);

    const winnerName = winner?.tribe?.name || winner?.tribe?.tribeName || 'Unknown Tribe';
    const loserName = loser?.tribe?.name || loser?.tribe?.tribeName || 'Unknown Tribe';
    const playerName = this.playerTribe?.name || this.playerTribe?.tribeName || 'Your Tribe';

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
      return `<span style="color: ${color}; font-weight: bold; text-shadow: 1px 1px 2px black;">${survivorName}</span>`;
    };

    const { jeffPhrases, commentaryMemory } = this;
    const getPhrase = (path) => {
      const arr = path.split('.').reduce((o, k) => o && o[k], jeffPhrases);
      return Array.isArray(arr) ? arr[Math.floor(Math.random()*arr.length)] : '';
    };
    
    const stageName = stage.name;
    let lines = [];

    // Intro (now reflects stage completion)
    lines.push(
      getPhrase('stageIntros')
        .replace('{stageName}', stageName)
    );

    // Performance analysis
    const diff = winner.score - loser.score;
    if (diff < 2) {
      lines.push(getPhrase('closeWins'));
    } else if (diff > 10) {
      lines.push(
        getPhrase('blowouts')
          .replace('{winnerTribe}', colorTribeName(winnerName, winner.tribe))
          .replace('{loserTribe}', colorTribeName(loserName, loser.tribe))
      );
    }

    // Individual standouts
    const perfs = this.context.survivorStagePerformances[stage.id] || [];
    if (perfs.length) {
      const best = perfs[0], worst = perfs[perfs.length-1];
      
      // Star performance
      if (best.normalizedScore >= 95) {
        const tribeName = colorTribeName(winnerName, winner.tribe);
        if (Math.random() > 0.5) {
          lines.push(
            getPhrase('clutchPerformances')
              .replace('{player}', colorSurvivorName(best.survivor.firstName, best.tribe))
              .replace('{tribe}', tribeName)
          );
        } else {
          lines.push(
            getPhrase('individualStars')
              .replace('{player}', colorSurvivorName(best.survivor.firstName, best.tribe))
              .replace('{stage}', stageName)
          );
        }
      }
      
      // Poor performance (less frequent)
      if (worst.normalizedScore <= 30 && Math.random() > 0.7) {
        lines.push(
          getPhrase('individualFlops')
            .replace('{player}', colorSurvivorName(worst.survivor.firstName, worst.tribe))
            .replace('{stage}', stageName)
        );
      }
    }

    // Momentum and storylines
    const winnerMomentum = commentaryMemory.tribalMomentum.get(winnerKey) || 0;
    const loserMomentum = commentaryMemory.tribalMomentum.get(loserKey) || 0;
    
    // Hot streak commentary
    if (winnerMomentum >= 2) {
      lines.push(
        getPhrase('momentum')
          .replace('{tribe}', colorTribeName(winnerName, winner.tribe))
      );
    }
    
    // Struggling team commentary
    if (loserMomentum <= -2) {
      lines.push(
        getPhrase('pressure')
          .replace('{tribe}', colorTribeName(loserName, loser.tribe))
      );
    }

    // Individual consistency/struggles (existing logic but enhanced)
    for (let id of commentaryMemory.consistentPerformers) {
      const s = perfs.find(p=>p.survivor.id===id);
      if (s && Math.random() > 0.4) {
        lines.push(
          getPhrase('consistency')
            .replace('{player}', colorSurvivorName(s.survivor.firstName, s.tribe))
        );
        break;
      }
    }

    // Comeback stories
    for (let id of commentaryMemory.comebackPlayers) {
      const s = perfs.find(p=>p.survivor.id===id);
      if (s) {
        const tribeName = colorTribeName(s.tribe?.name || s.tribe?.tribeName, s.tribe);
        lines.push(
          getPhrase('comebacks')
            .replace('{tribe}', tribeName)
        );
        commentaryMemory.comebackPlayers.delete(id); // Don't repeat
        break;
      }
    }

    // Overall standings shifts
    const overall = Object.entries(this.context.totalScores)
      .sort(([,a],[,b])=>b-a)
      .map(([k])=>k);
    const currLead = overall[0];
    
    if (this._previousLeader && currLead !== this._previousLeader) {
      if (currLead === winnerKey) {
        const winningTribe = this.allTribes.find(t => getTribeKey(t) === currLead);
        lines.push(
          getPhrase('takingLead')
            .replace('{tribe}', colorTribeName(winningTribe?.name || winningTribe?.tribeName, winningTribe))
        );
      } else {
        const previousTribe = this.allTribes.find(t => getTribeKey(t) === this._previousLeader);
        lines.push(
          getPhrase('losingLead')
            .replace('{tribe}', colorTribeName(previousTribe?.name || previousTribe?.tribeName, previousTribe))
        );
      }
    }
    this._previousLeader = currLead;

    // Ensure we don't have too many lines (max 4 for readability)
    if (lines.length > 4) {
      lines = lines.slice(0, 4);
    }

    return lines.join(' ');
  },

  _createJeffParchment(text, onNext) {
    console.log('Creating Jeff parchment with text:', text);

    // Increase character limit and improve splitting to handle HTML tags
    const maxLength = 250;
    let textParts = [];

    if (text.length <= maxLength) {
      textParts = [text];
    } else {
      // Split by sentences first, preserving HTML tags
      const sentences = text.match(/[^\.!?]+[\.!?]+/g) || [text];
      let currentPart = '';

      for (let sentence of sentences) {
        const potentialLength = this._getTextLengthWithoutTags(currentPart + sentence);

        if (potentialLength <= maxLength) {
          currentPart += sentence;
        } else {
          if (currentPart) {
            textParts.push(currentPart.trim());
            currentPart = sentence;
          } else {
            // If single sentence is too long, try to split at a natural break
            const naturalBreak = this._findNaturalBreak(sentence, maxLength);
            if (naturalBreak > 0) {
              textParts.push(sentence.substring(0, naturalBreak).trim());
              currentPart = sentence.substring(naturalBreak);
            } else {
              // Force split as last resort, but try to avoid breaking HTML tags
              const safeBreak = this._findSafeBreakPoint(sentence, maxLength);
              textParts.push(sentence.substring(0, safeBreak).trim());
              currentPart = sentence.substring(safeBreak);
            }
          }
        }
      }

      if (currentPart) {
        textParts.push(currentPart.trim());
      }
    }

    console.log('Text split into parts:', textParts.length, textParts);

    let currentPartIndex = 0;

    const showParchmentPart = () => {
      // Clear existing parchment content
      const existingParchments = this.container.querySelectorAll('.jeff-parchment-wrapper');
      existingParchments.forEach(p => p.remove());

      const currentText = textParts[currentPartIndex];
      const isLastPart = currentPartIndex === textParts.length - 1;

      // Parchment wrapper positioned absolutely within the container
      const parchmentWrapper = createElement('div', {
        className: 'jeff-parchment-wrapper',
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
      });

      // Use innerHTML to support HTML color tags
      jeffTextElement.innerHTML = currentText;

      // Add part indicator if multiple parts
      if (textParts.length > 1) {
        const partIndicator = createElement('div', {
          style: `
            position: absolute;
            bottom: 5px;
            right: 15px;
            color: #f39c12;
            font-family: 'Survivant', sans-serif;
            font-size: 0.7rem;
            font-weight: bold;
            text-shadow: 1px 1px 2px black;
            z-index: 1003;
          `
        }, `${currentPartIndex + 1}/${textParts.length}`);
        parchmentWrapper.appendChild(partIndicator);
      }

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

          if (isLastPart) {
            // Last part, proceed to next stage
            if (typeof onNext === 'function') {
              onNext();
            } else {
              console.error('onNext callback is not a function:', onNext);
            }
          } else {
            // Show next part
            currentPartIndex++;
            showParchmentPart();
          }
        }
      }, isLastPart ? 'Next' : 'Continue');

      console.log('Appending parchment wrapper and next button to container');
      this.container.append(parchmentWrapper, nextButton);
    };

    showParchmentPart();

    // Force a repaint to ensure elements are visible
    setTimeout(() => {
      console.log('Parchment elements should now be visible');
    }, 100);
  },

  // Helper method to get text length without HTML tags
  _getTextLengthWithoutTags(text) {
    return text.replace(/<[^>]*>/g, '').length;
  },

  // Helper method to find natural break points (spaces, punctuation)
  _findNaturalBreak(text, maxLength) {
    const textWithoutTags = text.replace(/<[^>]*>/g, '');
    if (textWithoutTags.length <= maxLength) return text.length;

    // Look for natural breaks like spaces or punctuation
    const breakChars = [' ', ',', ';', ':', '!', '?'];
    let bestBreak = -1;
    let charCount = 0;
    let inTag = false;

    for (let i = 0; i < text.length; i++) {
      if (text[i] === '<') {
        inTag = true;
      } else if (text[i] === '>') {
        inTag = false;
      } else if (!inTag) {
        charCount++;
        if (breakChars.includes(text[i]) && charCount <= maxLength) {
          bestBreak = i + 1;
        }
        if (charCount >= maxLength) {
          break;
        }
      }
    }

    return bestBreak > 0 ? bestBreak : -1;
  },

  // Helper method to find safe break point that doesn't split HTML tags
  _findSafeBreakPoint(text, maxLength) {
    let charCount = 0;
    let inTag = false;

    for (let i = 0; i < text.length; i++) {
      if (text[i] === '<') {
        inTag = true;
      } else if (text[i] === '>') {
        inTag = false;
      } else if (!inTag) {
        charCount++;
        if (charCount >= maxLength && !inTag) {
          return i;
        }
      }
    }

    return text.length;
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

    // Determine final standings - sort by total scores descending
    const sorted = Object.entries(this.context.totalScores)
      .sort(([,a],[,b]) => b - a)
      .map(([tribeKey, score]) => ({ 
        tribe: this.allTribes.find(t => (t.id || t.name || t.tribeName) === tribeKey), 
        score,
        tribeKey 
      }));

    console.log('Final standings:', sorted.map(s => ({ 
      name: s.tribe?.name || s.tribe?.tribeName, 
      score: s.score.toFixed(2) 
    })));

    const winners = sorted.slice(0, this.isThreeTribe ? 2 : 1);
    const losers = sorted.slice(this.isThreeTribe ? 2 : 1);

    console.log('Winners:', winners.map(w => w.tribe?.name || w.tribe?.tribeName));
    console.log('Losers:', losers.map(l => l.tribe?.name || l.tribe?.tribeName));

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

    // Generate final Jeff commentary
    let finalCommentary;
    if (this.isThreeTribe) {
      const winner1Name = winners[0].tribe?.name || winners[0].tribe?.tribeName;
      const winner2Name = winners[1].tribe?.name || winners[1].tribe?.tribeName;
      const loserName = losers[0].tribe?.name || losers[0].tribe?.tribeName;

      const playerTribeKey = this.playerTribe?.id || this.playerTribe?.name || this.playerTribe?.tribeName;
      const loserTribeKey = losers[0].tribeKey;

      console.log('Final commentary debug:', {
        winner1Name, winner2Name, loserName,
        playerTribeKey, loserTribeKey,
        playerIsLoser: loserTribeKey === playerTribeKey,
        winners: winners.map(w => ({ name: w.tribe?.name, key: w.tribeKey })),
        losers: losers.map(l => ({ name: l.tribe?.name, key: l.tribeKey }))
      });

      // Check if player tribe is the loser
      if (loserTribeKey === playerTribeKey) {
        // Player tribe is the loser
        finalCommentary = `${colorTribeName(winner1Name, winners[0].tribe)} and ${colorTribeName(winner2Name, winners[1].tribe)} have won immunity! Your tribe struggled in this challenge and will be heading to Tribal Council tonight where one of you will become the first person voted out of Survivor Island.`;
      } else {
        // Player tribe is a winner
        finalCommentary = `${colorTribeName(winner1Name, winners[0].tribe)} and ${colorTribeName(winner2Name, winners[1].tribe)} have won immunity and are safe from tonight's vote! ${colorTribeName(loserName, losers[0].tribe)}, I'll be seeing you at Tribal Council where one of your tribe members will become the first person voted out.`;
      }
    } else {
      const winnerName = winners[0].tribe?.name || winners[0].tribe?.tribeName;
      const loserName = losers[0].tribe?.name || losers[0].tribe?.tribeName;

      const playerTribeKey = this.playerTribe?.id || this.playerTribe?.name || this.playerTribe?.tribeName;
      const loserTribeKey = losers[0].tribeKey;

      if (loserTribeKey === playerTribeKey) {
        // Player tribe lost
        finalCommentary = `${colorTribeName(winnerName, winners[0].tribe)} wins immunity! Your tribe has nothing to protect you tonight. One of you will become the first person voted out of Survivor Island.`;
      } else {
        // Player tribe won
        finalCommentary = `Your tribe wins immunity! ${colorTribeName(loserName, losers[0].tribe)}, grab your torches and head to Tribal Council. One of you will be voted out tonight.`;
      }
    }

    console.log('Final Jeff commentary:', finalCommentary);

    this._createJeffParchment(finalCommentary, () => {
      this._showFinalSummary(sorted);
    });
  },

  _showFinalSummary(sortedTribes) {
    clearChildren(this.container);
    this.container.style.backgroundImage = `url('Assets/Screens/challenge.png')`;

    const winners = sortedTribes.slice(0, this.isThreeTribe ? 2 : 1);
    const losers = sortedTribes.slice(this.isThreeTribe ? 2 : 1);

    console.log('Final summary - Winners:', winners.map(w => ({ 
      name: w.tribe?.name || w.tribe?.tribeName, 
      key: w.tribeKey, 
      score: w.score 
    })));
    console.log('Final summary - Losers:', losers.map(l => ({ 
      name: l.tribe?.name || l.tribe?.tribeName, 
      key: l.tribeKey, 
      score: l.score 
    })));

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

    // Check if player tribe is among winners and replace with "Your tribe"
    const playerTribeKey = this.playerTribe?.id || this.playerTribe?.name || this.playerTribe?.tribeName;
    const winnerNames = winners.map(w => {
      if (w.tribeKey === playerTribeKey) {
        return 'Your tribe';
      }
      const tribeName = w.tribe?.name || w.tribe?.tribeName;
      return colorTribeName(tribeName, w.tribe);
    }).join(' and ');

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

    // For bottom performers, reverse the order so worst gets highest penalty
    bottomPerformers.forEach((perf, index) => {
      const reverseIndex = bottomPerformers.length - 1 - index; // Reverse the index
      const adjustment = threatAdjustments[reverseIndex] || 0;
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
    });

    // Use innerHTML to support HTML color tags
    title.innerHTML = `${winnerNames} wins immunity in First Contact!`;

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