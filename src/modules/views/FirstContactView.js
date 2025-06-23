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
    // Build horizontal “tracks” for each tribe
    const laneCount = this.allTribes.length;
    const containerHeight = this.container.clientHeight;
    const laneHeight = containerHeight / laneCount;
    const avatars = [];

    this.allTribes.forEach((tribe, tIndex) => {
      // Track container
      const track = createElement('div', {
        className: 'fc-track',
        style: `
          top: ${tIndex * laneHeight}px;
          height: ${laneHeight}px;
        `,
      });
      this.container.appendChild(track);

      // Survivors on this track
      tribe.members
        .filter(s => s.roles.includes(stage.id))
        .forEach((survivor, i) => {
          const avatar = createElement('img', {
            className: 'fc-avatar',
            src: survivor.avatarUrl || `Assets/Avatars/${survivor.firstName.toLowerCase()}.jpeg`,
            style: `
              left: ${10 + i * 60}px;
              top: ${(laneHeight - 50) / 2}px;
            `,
          });
          track.appendChild(avatar);
          avatars.push({ survivor, avatar });
        });
    });

    // Animate avatars from left → right
    requestAnimationFrame(() => {
      const maxAbility = Math.max(...avatars.map(a => a.survivor._fc_ability));
      avatars.forEach(({ survivor, avatar }) => {
        const duration = 1000 + ((survivor._fc_ability / maxAbility) * 2000);
        avatar.style.transition = `transform ${duration}ms ease-out`;
        // move to right edge:
        avatar.style.transform = `translateX(${this.container.clientWidth - 80}px)`;
      });
    });

    // When the slowest avatar finishes, show summary
    setTimeout(() => this._showStageSummary(stage), 3300);
  },

  _showStageSummary(stage) {
    clearChildren(this.container);
    this.container.style.backgroundImage = `url('${this.config.background || 'Assets/Screens/challenge.png'}')`;

    // “Jeff” commentary above parchment
    const jeffMsg = this.isThreeTribe
      ? `Jeff: ${stage.name} shakes up all three tribes!`
      : `Jeff: Only two tribes left—this ${stage.name.toLowerCase()} matters!`;
    const jeffDiv = createElement('div', {
      className: 'jeff-commentary',
    }, jeffMsg);
    this.container.appendChild(jeffDiv);

    // Build summary text
    const scores = this.context.stageScores[stage.id];
    const sorted = Object.entries(scores)
      .sort(([,a],[,b]) => b - a)
      .map(([tribeId]) => this.allTribes.find(t => t.id === tribeId));

    const rank = sorted.findIndex(t => t.id === this.playerTribe.id);
    let text;
    if (rank === 0) {
      text = `Your tribe rockets ahead in the ${stage.name.toLowerCase()}!`;
    } else if (this.isThreeTribe && rank === 1) {
      text = `Your tribe holds strong for second place in the ${stage.name.toLowerCase()}.`;
    } else {
      const leader = sorted[0].tribeName;
      text = `Tough run—${leader} outpaces you in the ${stage.name.toLowerCase()}.`;
    }

    // Parchment summary
    const parchment = createElement('div', {
      style: `
        position: absolute;
        top: 35%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 300px;
        padding: 20px;
        background: url('Assets/parch-landscape.png') center/cover no-repeat;
        text-align: center;
        color: white;
        font-family: 'Survivant', sans-serif;
        text-shadow: 1px 1px 2px black;
        z-index: 10;
      `,
    }, text);

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
        cursor: pointer;
        z-index: 10;
      `,
      onclick: () => {
        this.stageIndex++;
        this.runNextStage();
      }
    }, this.stageIndex < this.stages.length - 1 ? 'Next Stage' : 'Finish');

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
        cursor: pointer;
        z-index: 10;
      `,
      onclick: () => {
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
      }
    }, 'Return to Camp');

    this.container.append(parchment, doneBtn);
  },
};

export default FirstContactView;