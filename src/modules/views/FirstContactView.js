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
    this.context = { stageScores: {}, totalScores: {} };

    // Define the four stages
    this.stages = [
      {
        id: 'mud',
        name: 'Mud Crawl',
        weights: { strength: 0.30, endurance: 0.30, dexterity: 0.20, balance: 0.20 },
        background: 'Assets/Challenge/mud-crawl.png',
      },
      {
        id: 'knots',
        name: 'Untie Knots',
        weights: { dexterity: 0.45, puzzles: 0.25, focus: 0.20, endurance: 0.10 },
        background: 'Assets/Challenge/untie-knots.png',
      },
      {
        id: 'toss',
        name: 'Bean-Bag Toss',
        weights: { dexterity: 0.50, focus: 0.30, strength: 0.20 },
        background: 'Assets/Challenge/bean-bag-toss.png',
      },
      {
        id: 'puzzle',
        name: 'Vertical Puzzle',
        weights: { puzzles: 0.50, memory: 0.30, focus: 0.20 },
        background: 'Assets/Challenge/vertical-puzzle.png',
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

      const maxAbility = Math.max(...avatars.map(a => a.survivor._fc_ability));
      console.log(`Max ability for stage: ${maxAbility}`);

      // Calculate all durations first
      const durations = avatars.map(({ survivor }) => {
        const normalizedAbility = maxAbility > 0 ? survivor._fc_ability / maxAbility : 0.5;
        return 1500 + (normalizedAbility * 2000);
      });

      const maxDuration = Math.max(...durations);
      console.log(`Animation durations: ${durations.join(', ')}, max: ${maxDuration}`);

      // Apply animations
      avatars.forEach(({ survivor, avatar }, index) => {
        const normalizedAbility = maxAbility > 0 ? survivor._fc_ability / maxAbility : 0.5;
        const duration = durations[index];
        const distance = this.container.clientHeight - 120; // Leave space at top

        avatar.style.transition = `transform ${duration}ms ease-out`;
        avatar.style.transform = `translateY(-${distance * normalizedAbility}px)`;
      });

      // Wait for all animations to complete, then show Jeff
      const totalWaitTime = maxDuration + 2000; // Animation + 2 second pause
      console.log(`Setting timeout for ${totalWaitTime}ms before showing Jeff commentary`);

      setTimeout(() => {
        console.log(`Timeout completed for ${stage.name}, showing Jeff commentary now`);
        this._showJeffCommentary(stage);
      }, totalWaitTime);

    }, 100); // Small delay to ensure DOM is ready
  },

  _showJeffCommentary(stage) {
    console.log(`Showing Jeff commentary for stage: ${stage.name}`);

    // Clear existing avatars but keep background
    const tracks = this.container.querySelectorAll('.fc-track');
    tracks.forEach(track => track.remove());
    console.log(`Removed ${tracks.length} tracks`);

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
    const playerRank = sorted.findIndex(entry => entry.tribe.id === this.playerTribe.id);

    let jeffText;
    if (playerRank === 0) {
      jeffText = `${this.playerTribe.tribeName} takes the lead in the ${stage.name} stage! Strong performance by your tribe!`;
    } else {
      jeffText = `${winner.tribe.tribeName} emerges first in the ${stage.name} stage! ${this.playerTribe.tribeName} is trailing behind and needs to step it up!`;
    }

    console.log(`Creating Jeff overlay with text: ${jeffText}`);

    // Remove any existing Jeff overlays first
    const existingOverlays = document.querySelectorAll('.jeff-overlay');
    existingOverlays.forEach(overlay => overlay.remove());

    // Jeff commentary overlay - clickable
    const jeffOverlay = createElement('div', {
      className: 'jeff-overlay',
      style: `
        position: fixed !important;
        top: 0 !important;
        left: 0 !important;
        width: 100vw !important;
        height: 100vh !important;
        background: rgba(0,0,0,0.7) !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        cursor: pointer !important;
        z-index: 10000 !important;
        pointer-events: all !important;
      `,
      onclick: (e) => {
        console.log('Jeff overlay clicked - proceeding to stage summary');
        e.preventDefault();
        e.stopPropagation();
        jeffOverlay.remove();
        this._showStageSummary(stage);
      }
    });

    const jeffBubble = createElement('div', {
      style: `
        background: rgba(139, 69, 19, 0.95) !important;
        border: 3px solid #f39c12 !important;
        border-radius: 15px !important;
        padding: 25px 35px !important;
        max-width: 550px !important;
        text-align: center !important;
        color: white !important;
        font-family: 'Survivant', sans-serif !important;
        font-size: 1.3rem !important;
        text-shadow: 2px 2px 4px rgba(0,0,0,0.8) !important;
        position: relative !important;
        pointer-events: none !important;
        box-shadow: 0 0 20px rgba(0,0,0,0.5) !important;
      `
    });

    const jeffName = createElement('div', {
      style: `
        font-size: 1rem !important;
        color: #f39c12 !important;
        margin-bottom: 10px !important;
        font-weight: bold !important;
      `
    }, 'JEFF PROBST:');

    const jeffMessage = createElement('div', {
      style: `
        line-height: 1.4 !important;
        margin-bottom: 15px !important;
      `
    }, jeffText);

    const clickHint = createElement('div', {
      style: `
        font-size: 0.9rem !important;
        color: #ccc !important;
        margin-top: 15px !important;
        font-style: italic !important;
        animation: pulse 2s infinite !important;
      `
    }, 'Click anywhere to continue...');

    // Add pulse animation if not already present
    if (!document.querySelector('#pulse-animation')) {
      const style = createElement('style', { id: 'pulse-animation' }, `
        @keyframes pulse {
          0% { opacity: 1; }
          50% { opacity: 0.5; }
          100% { opacity: 1; }
        }
      `);
      document.head.appendChild(style);
    }

    jeffBubble.append(jeffName, jeffMessage, clickHint);
    jeffOverlay.appendChild(jeffBubble);

    // Force append to body and log success
    document.body.appendChild(jeffOverlay);
    console.log(`Jeff overlay created and appended. Overlay element:`, jeffOverlay);
    console.log(`Jeff overlay is visible:`, jeffOverlay.offsetWidth > 0 && jeffOverlay.offsetHeight > 0);

    // Force a reflow to ensure the overlay appears
    jeffOverlay.offsetHeight;
  },

  _showStageSummary(stage) {
    console.log(`Showing stage summary for: ${stage.name}`);

    clearChildren(this.container);
    this.container.style.backgroundImage = `url('${this.config.background || 'Assets/Screens/challenge.png'}')`;

    // Build summary text with specific tribe results
    const scores = this.context.stageScores[stage.id];
    const sorted = Object.entries(scores)
      .sort(([,a],[,b]) => b - a)
      .map(([tribeId, score]) => ({ 
        tribe: this.allTribes.find(t => t.id === tribeId), 
        score: Math.round(score * 10) / 10 
      }));

    const playerRank = sorted.findIndex(entry => entry.tribe.id === this.playerTribe.id);
    const winner = sorted[0];

    let text;
    let detailText = '';

    if (playerRank === 0) {
      text = `${this.playerTribe.tribeName} dominates ${stage.name}!`;
      detailText = `Strong performance gives you the edge going into the next stage.`;
    } else {
      text = `${winner.tribe.tribeName} wins ${stage.name}`;
      if (this.isThreeTribe && playerRank === 1) {
        detailText = `${this.playerTribe.tribeName} finishes second - still in the fight!`;
      } else {
        const scoreDiff = Math.round((winner.score - sorted[playerRank].score) * 10) / 10;
        detailText = `${this.playerTribe.tribeName} trails by ${scoreDiff} points. Time to make up ground!`;
      }
    }

    // Parchment summary
    const parchment = createElement('div', {
      style: `
        position: absolute;
        top: 35%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 350px;
        padding: 25px;
        background: url('Assets/parch-landscape.png') center/cover no-repeat;
        text-align: center;
        color: white;
        font-family: 'Survivant', sans-serif;
        text-shadow: 1px 1px 2px black;
        z-index: 10;
      `
    });

    const titleText = createElement('div', {
      style: `
        font-size: 1.1rem;
        font-weight: bold;
        margin-bottom: 15px;
        color: #f39c12;
      `
    }, text);

    const detailDiv = createElement('div', {
      style: `
        font-size: 0.95rem;
        line-height: 1.4;
      `
    }, detailText);

    parchment.append(titleText, detailDiv);

    // Next button
    const nextBtn = createElement('button', {
      style: `
        position: absolute;
        bottom: 8%;
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
    }, this.stageIndex < this.stages.length - 1 ? 'Next Stage' : 'Finish Challenge');

    this.container.append(parchment, nextBtn);
  },

  _showFinalResults() {
    clearChildren(this.container);
    this.container.style.backgroundImage = `url('Assets/Screens/jeff-screen.png')`;

    // Jeff commentary
    const finalJeff = this.isThreeTribe
      ? 'Jeff: Two tribes will sleep safe tonight!'
      : 'Jeff: Only one tribe keeps their torch burning!';
    const jeffDiv = createElement('div', {
      className: 'jeff-commentary',
    }, finalJeff);
    this.container.appendChild(jeffDiv);

    // Determine winners
    const sorted = Object.entries(this.context.totalScores)
      .sort(([,a],[,b]) => b - a)
      .map(([tribeId]) => this.allTribes.find(t => t.id === tribeId));

    const winners = sorted
      .slice(0, this.isThreeTribe ? 2 : 1)
      .map(t => t.tribeName)
      .join(' and ');
    const text = `${winners} win immunity in First Contact!`;

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