import { createElement, clearChildren } from '../utils/DOMUtils.js';
import { DialogueSystem } from '../systems/index.js';
import eventManager, { GameEvents } from '../core/EventManager.js';

class FirstContactView {
  constructor() {
    this.container = null;
    this.context = null;
    this.currentStage = 0;
    this.dialogueSystem = new DialogueSystem();

    // Commentary memory system
    this.commentaryMemory = {
      standoutPerformers: new Map(), // playerId -> {stages: [], type: 'star'|'flop'}
      consistentPerformers: new Set(),
      comebackPlayers: new Set(),
      strugglingPlayers: new Set()
    };

    // Jeff's Commentary Phrase Library
    this.jeffPhrases = {
      stageIntros: [
        "Here we go with {stageName}!",
        "Time for {stageName} — this could change everything!",
        "Next up: {stageName}. Who's got what it takes?",
        "Moving on to {stageName}. The pressure's building!",
        "{stageName} is up next — let's see who steps up!"
      ],

      closeWins: [
        "That was neck and neck! Just inches separating these tribes!",
        "What a photo finish! These tribes are evenly matched!",
        "That's as close as it gets, folks! Neither tribe giving an inch!",
        "Razor-thin margins here — every second counts!",
        "Dead heat! These survivors are leaving it all out there!"
      ],

      blowouts: [
        "{winnerTribe} absolutely crushing it here!",
        "This is complete domination by {winnerTribe}!",
        "{winnerTribe} making this look effortless!",
        "What a steamroll! {winnerTribe} is firing on all cylinders!",
        "{loserTribe} getting left in the dust by {winnerTribe}!"
      ],

      comebacks: [
        "{tribe} mounting an incredible comeback!",
        "Don't count {tribe} out yet — they're surging back!",
        "{tribe} clawing their way back into this thing!",
        "What a turnaround from {tribe}! They're not done yet!",
        "{tribe} showing tremendous heart with this rally!"
      ],

      takingLead: [
        "{tribe} takes the overall lead!",
        "And just like that, {tribe} is in the driver's seat!",
        "{tribe} seizes control of this challenge!",
        "The momentum has shifted — {tribe} now leads!",
        "{tribe} moves into first place!"
      ],

      losingLead: [
        "{tribe} loses their grip on the lead!",
        "That lead just evaporated for {tribe}!",
        "{tribe} falls from the top spot!",
        "The tables have turned on {tribe}!",
        "{tribe} can't hold their advantage!"
      ],

      individualStars: [
        "{player} was absolutely on fire in {stage}!",
        "{player} crushed that {stage} — what a performance!",
        "{player} showing why they're here to win in {stage}!",
        "Incredible effort from {player} in {stage}!",
        "{player} just blazed through {stage}!",
        "{player} making it look easy in {stage}!",
        "Standout performance from {player} in {stage}!"
      ],

      individualFlops: [
        "{player} really struggled in {stage} — costing their tribe!",
        "{player} had trouble with {stage}, falling way behind!",
        "{player} couldn't find their rhythm in {stage}!",
        "That was a tough {stage} for {player} — way off the pace!",
        "{player} completely choked on {stage}!",
        "{player} looking lost in {stage}!"
      ],

      consistency: [
        "{player} has been rock solid throughout!",
        "Another strong showing for {player} — proving to be a real asset!",
        "{player} is the definition of consistent performance!",
        "{player} just keeps delivering for their tribe!"
      ],

      struggles: [
        "That's {count} bad stages in a row for {player} — they gotta get it together!",
        "{player} is having a rough challenge — their tribe needs more from them!",
        "{player} can't seem to find their groove today!"
      ],

      finalResults: {
        winners: [
          "{winnerTribe} wins the first immunity challenge!",
          "Victory goes to {winnerTribe} in a {closeness} challenge!",
          "{winnerTribe} earns their spot in the next round!",
          "{winnerTribe} takes home the first immunity of the season!"
        ],

        losers: [
          "{loserTribe} will be heading to the first Tribal Council!",
          "The puzzle wasn't enough to save {loserTribe} — they're going to Tribal!",
          "{loserTribe} falls short and will face elimination tonight!",
          "Someone from {loserTribe} will be the first person voted out!"
        ],

        narratives: {
          comeback: [
            "An incredible comeback story across four stages!",
            "What a rally from behind to secure the win!",
            "They were down but never out — amazing turnaround!"
          ],

          consistent: [
            "Consistent performances from {tribe} earn them the win!",
            "{tribe} stayed steady throughout — that's how you win challenges!",
            "Methodical, consistent effort pays off for {tribe}!"
          ],

          collapse: [
            "{tribe} had the lead but couldn't hold on!",
            "A late collapse costs {tribe} their chance at immunity!",
            "{tribe} was so close but fell apart at the end!"
          ]
        }
      }
    };
  }

  render(container, challenge, callback) {
    this.container = container;
    this.callback = callback;
    this.context = {
      challenge,
      tribes: challenge.tribes || [],
      stages: challenge.stages || [],
      scores: {},
      totalScores: {},
      stageResults: []
    };

    clearChildren(container);
    this._initializeScores();
    this._createChallengeLayout();
    this._startChallenge();
  }

  _initializeScores() {
    this.context.tribes.forEach(tribe => {
      this.context.scores[tribe.name] = [];
      this.context.totalScores[tribe.name] = 0;
    });
  }

  _createChallengeLayout() {
    const challengeContainer = createElement('div', {
      className: 'first-contact-challenge',
      style: `
        width: 100%;
        height: 100vh;
        background-image: url('Assets/Screens/challenge.png');
        background-size: cover;
        background-position: center;
        position: relative;
        display: flex;
        flex-direction: column;
      `
    });

    // Challenge title
    const titleElement = createElement('div', {
      className: 'challenge-title',
      textContent: this.context.challenge.name,
      style: `
        text-align: center;
        font-size: 2.5em;
        font-weight: bold;
        color: #8d5524;
        margin: 20px 0;
        text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
      `
    });

    // Tribe positions area
    const tribeArea = createElement('div', {
      className: 'tribe-area',
      style: `
        flex: 1;
        position: relative;
        margin: 20px;
        display: flex;
        justify-content: stretch;
        align-items: stretch;
        min-height: 400px;
      `
    });

    challengeContainer.appendChild(titleElement);
    challengeContainer.appendChild(tribeArea);
    this.container.appendChild(challengeContainer);

    this._createTribePositions(tribeArea);
  }

  _createTribePositions(container) {
    // Create lanes for each tribe
    this.context.tribes.forEach((tribe, index) => {
      const laneContainer = createElement('div', {
        className: `tribe-lane tribe-lane-${tribe.name.toLowerCase()}`,
        style: `
          width: ${100 / this.context.tribes.length}%;
          height: 100%;
          position: relative;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: flex-start;
          padding: 20px 10px;
          border-right: ${index < this.context.tribes.length - 1 ? '2px solid rgba(141, 85, 36, 0.3)' : 'none'};
        `
      });

      // Tribe banner at top
      const banner = createElement('div', {
        className: 'tribe-banner',
        textContent: tribe.name,
        style: `
          background-color: ${tribe.color};
          color: white;
          padding: 8px 16px;
          border-radius: 5px;
          font-weight: bold;
          margin-bottom: 30px;
          box-shadow: 0 2px 5px rgba(0,0,0,0.3);
          font-size: 1.2em;
          min-width: 120px;
          text-align: center;
        `
      });

      // Starting line area
      const startingLine = createElement('div', {
        className: 'starting-line',
        style: `
          width: 100%;
          height: 3px;
          background-color: rgba(141, 85, 36, 0.8);
          margin-bottom: 20px;
          position: relative;
        `
      });

      // Survivors area - positioned at starting line
      const survivorsArea = createElement('div', {
        className: 'survivors-area',
        style: `
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          justify-content: center;
          max-width: 200px;
          position: relative;
        `
      });

      // Create survivor avatars
      tribe.members.forEach((survivor, memberIndex) => {
        const survivorElement = createElement('div', {
          className: `survivor survivor-${survivor.id}`,
          style: `
            width: 50px;
            height: 50px;
            border-radius: 50%;
            background-image: url('${survivor.avatar}');
            background-size: cover;
            background-position: center;
            border: 3px solid ${tribe.color};
            box-shadow: 0 2px 5px rgba(0,0,0,0.3);
            transition: all 0.3s ease;
            position: relative;
            cursor: pointer;
          `
        });

        // Name label
        const nameLabel = createElement('div', {
          textContent: survivor.name,
          style: `
            position: absolute;
            bottom: -20px;
            left: 50%;
            transform: translateX(-50%);
            font-size: 0.7em;
            font-weight: bold;
            color: #8d5524;
            text-shadow: 1px 1px 2px rgba(255,255,255,0.8);
            white-space: nowrap;
            pointer-events: none;
          `
        });

        survivorElement.appendChild(nameLabel);
        survivorsArea.appendChild(survivorElement);
      });

      // Performance track - visual indicator of progress
      const performanceTrack = createElement('div', {
        className: 'performance-track',
        style: `
          width: 80%;
          height: 200px;
          margin-top: 40px;
          border: 2px dashed rgba(141, 85, 36, 0.4);
          position: relative;
          background: linear-gradient(to top, rgba(255,0,0,0.1) 0%, rgba(255,255,0,0.1) 50%, rgba(0,255,0,0.1) 100%);
        `
      });

      // Assemble lane
      laneContainer.appendChild(banner);
      laneContainer.appendChild(startingLine);
      laneContainer.appendChild(survivorsArea);
      laneContainer.appendChild(performanceTrack);
      
      container.appendChild(laneContainer);
    });
  }

  _startChallenge() {
    this._showJeffIntro();
  }

  _showJeffIntro() {
    const introMessage = `Welcome to your first immunity challenge! Today's challenge will test your physical abilities across four grueling stages: mud crawl, untying knots, bean bag toss, and finally, a vertical puzzle. The tribe that performs best overall wins immunity and is safe from tonight's vote. For the losing tribe... I'll see you at Tribal Council where somebody will be the first person voted out of Survivor. Let's get started!`;

    this.dialogueSystem.showDialogue(introMessage, ["Let's do this!"], () => {
      this._runStage(0);
    });
  }

  _runStage(stageIndex) {
    if (stageIndex >= this.context.stages.length) {
      this._showFinalResults();
      return;
    }

    this.currentStage = stageIndex;
    const stage = this.context.stages[stageIndex];

    // Show stage introduction
    const stageIntro = this._getRandomPhrase('stageIntros').replace('{stageName}', stage.name);

    this.dialogueSystem.showDialogue(stageIntro, ["Go!"], () => {
      this._simulateStage(stageIndex);
    });
  }

  _simulateStage(stageIndex) {
    const stage = this.context.stages[stageIndex];
    const stageScores = {};
    const individualPerformances = {};

    // Calculate scores for each tribe and track individual performances
    this.context.tribes.forEach(tribe => {
      let tribeScore = 0;
      const memberPerformances = [];

      tribe.members.forEach(member => {
        // Base performance calculation
        let memberScore = this._calculateMemberPerformance(member, stage);
        memberPerformances.push({
          survivor: member,
          score: memberScore,
          normalized: this._normalizeScore(memberScore, 50, 100) // Normalize to 0-100 scale
        });
        tribeScore += memberScore;
      });

      const avgScore = tribeScore / tribe.members.length;
      stageScores[tribe.name] = avgScore;
      individualPerformances[tribe.name] = memberPerformances;

      this.context.scores[tribe.name].push(avgScore);
      this.context.totalScores[tribe.name] += avgScore;
    });

    // Store stage results
    this.context.stageResults.push({
      stage: stage.name,
      scores: { ...stageScores },
      individualPerformances: { ...individualPerformances }
    });

    // Update commentary memory
    this._updateCommentaryMemory(stageIndex, individualPerformances);

    // Animate the stage
    this._animateStage(stageIndex, stageScores, () => {
      // Show stage commentary
      this._showStageCommentary(stageIndex, stageScores, individualPerformances, () => {
        // Move to next stage
        this._runStage(stageIndex + 1);
      });
    });
  }

  _calculateMemberPerformance(member, stage) {
    // Enhanced performance calculation
    const basePerformance = Math.random() * 50 + 25; // 25-75 base

    // Apply trait bonuses
    let bonus = 0;
    if (stage.primaryTrait && member.traits[stage.primaryTrait]) {
      bonus += member.traits[stage.primaryTrait] * 0.3;
    }
    if (stage.secondaryTrait && member.traits[stage.secondaryTrait]) {
      bonus += member.traits[stage.secondaryTrait] * 0.2;
    }

    // Add some variability for realism
    const variability = (Math.random() - 0.5) * 20; // ±10 points

    return Math.max(10, Math.min(100, basePerformance + bonus + variability));
  }

  _normalizeScore(score, min, max) {
    return Math.round(((score - min) / (max - min)) * 100);
  }

  _updateCommentaryMemory(stageIndex, individualPerformances) {
    Object.values(individualPerformances).forEach(tribePerformances => {
      tribePerformances.forEach(perf => {
        const playerId = perf.survivor.id;
        const normalized = perf.normalized;

        if (!this.commentaryMemory.standoutPerformers.has(playerId)) {
          this.commentaryMemory.standoutPerformers.set(playerId, { stages: [], type: null });
        }

        const playerMemory = this.commentaryMemory.standoutPerformers.get(playerId);

        // Track standout performances
        if (normalized >= 95) {
          playerMemory.stages.push({ stage: stageIndex, type: 'star' });
          if (playerMemory.stages.filter(s => s.type === 'star').length >= 2) {
            this.commentaryMemory.consistentPerformers.add(playerId);
          }
        } else if (normalized <= 30) {
          playerMemory.stages.push({ stage: stageIndex, type: 'flop' });
          if (playerMemory.stages.filter(s => s.type === 'flop').length >= 2) {
            this.commentaryMemory.strugglingPlayers.add(playerId);
          }
        }

        // Track comebacks (bad -> good performance)
        if (playerMemory.stages.length >= 2) {
          const lastTwo = playerMemory.stages.slice(-2);
          if (lastTwo[0].type === 'flop' && lastTwo[1].type === 'star') {
            this.commentaryMemory.comebackPlayers.add(playerId);
          }
        }
      });
    });
  }

  _animateStage(stageIndex, stageScores, callback) {
    const stage = this.context.stages[stageIndex];

    // Sort tribes by performance for this stage
    const sortedTribes = Object.entries(stageScores)
      .sort(([,a], [,b]) => b - a)
      .map(([name]) => name);

    // Animate based on performance
    this.context.tribes.forEach(tribe => {
      const position = sortedTribes.indexOf(tribe.name);
      const performance = stageScores[tribe.name];

      // Calculate animation distance based on performance
      const maxDistance = 100; // pixels
      const relativePerformance = performance / Math.max(...Object.values(stageScores));
      const distance = relativePerformance * maxDistance;

      this._animateTribeMembers(tribe, distance, stage.ability);
    });

    // Special handling for final stage (vertical puzzle)
    if (stageIndex === this.context.stages.length - 1) {
      setTimeout(() => {
        this._animateFinalPositions(callback);
      }, 2000);
    } else {
      setTimeout(callback, 2000);
    }
  }

  _animateTribeMembers(tribe, distance, ability) {
    const tribeLane = this.container.querySelector(`.tribe-lane-${tribe.name.toLowerCase()}`);
    if (!tribeLane) {
      console.warn(`Could not find tribe lane for ${tribe.name}`);
      return;
    }

    const survivorsArea = tribeLane.querySelector('.survivors-area');
    const survivors = tribeLane.querySelectorAll('.survivor');

    if (!survivors.length) {
      console.warn(`No survivors found for ${tribe.name}`);
      return;
    }

    // Animate the entire survivors area
    setTimeout(() => {
      survivorsArea.style.transform = `translateY(-${distance}px)`;
      survivorsArea.style.transition = 'transform 1.5s ease-out';
    }, 300);

    // Individual survivor effects
    survivors.forEach((survivorEl, index) => {
      setTimeout(() => {
        // Add performance-based visual effects
        if (distance > 80) {
          survivorEl.style.boxShadow = '0 0 15px rgba(0, 255, 0, 0.6)'; // Green glow for good performance
          survivorEl.style.border = `3px solid rgba(0, 255, 0, 0.8)`;
        } else if (distance < 30) {
          survivorEl.style.boxShadow = '0 0 15px rgba(255, 0, 0, 0.6)'; // Red glow for poor performance
          survivorEl.style.border = `3px solid rgba(255, 0, 0, 0.8)`;
        } else {
          survivorEl.style.boxShadow = '0 0 10px rgba(255, 255, 0, 0.4)'; // Yellow glow for average
        }
      }, index * 100);
    });
  }

  _animateFinalPositions(callback) {
    // Second animation: move winning tribe to top based on total scores
    const sortedTribes = Object.entries(this.context.totalScores)
      .sort(([,a], [,b]) => b - a)
      .map(([name]) => name);

    this.context.tribes.forEach((tribe, index) => {
      const finalPosition = sortedTribes.indexOf(tribe.name);
      const finalDistance = (this.context.tribes.length - finalPosition - 1) * 150 + 50;

      const tribeLane = this.container.querySelector(`.tribe-lane-${tribe.name.toLowerCase()}`);
      if (!tribeLane) return;

      const survivorsArea = tribeLane.querySelector('.survivors-area');
      const survivors = tribeLane.querySelectorAll('.survivor');

      // Animate survivors area to final position
      setTimeout(() => {
        survivorsArea.style.transform = `translateY(-${finalDistance}px)`;
        survivorsArea.style.transition = 'transform 2s ease-in-out';
      }, 500);

      // Add winner effects
      survivors.forEach((survivorEl, memberIndex) => {
        setTimeout(() => {
          if (finalPosition === 0) {
            // Winner effects
            survivorEl.style.boxShadow = '0 0 20px rgba(255, 215, 0, 0.8)';
            survivorEl.style.border = '3px solid rgba(255, 215, 0, 1)';
            survivorEl.style.transform = 'scale(1.1)';
          } else if (finalPosition === sortedTribes.length - 1) {
            // Loser effects
            survivorEl.style.boxShadow = '0 0 15px rgba(255, 0, 0, 0.6)';
            survivorEl.style.filter = 'brightness(0.8)';
          }
        }, memberIndex * 100);
      });
    });

    setTimeout(callback, 3000);
  }

  _showStageCommentary(stageIndex, stageScores, individualPerformances, callback) {
    const commentary = this._generateStageCommentary(stageIndex, stageScores, individualPerformances);

    this.dialogueSystem.showDialogue(commentary, ["Continue"], callback);
  }

  _generateStageCommentary(stageIndex, stageScores, individualPerformances) {
    const stage = this.context.stages[stageIndex];
    const commentary = [];

    // Determine race closeness
    const scores = Object.values(stageScores);
    const maxScore = Math.max(...scores);
    const minScore = Math.min(...scores);
    const isClose = (maxScore - minScore) < 15;
    const isBlowout = (maxScore - minScore) > 40;

    // Stage performance commentary
    if (isClose) {
      commentary.push(this._getRandomPhrase('closeWins'));
    } else if (isBlowout) {
      const winner = Object.keys(stageScores).find(key => stageScores[key] === maxScore);
      const loser = Object.keys(stageScores).find(key => stageScores[key] === minScore);
      commentary.push(this._getRandomPhrase('blowouts')
        .replace('{winnerTribe}', winner)
        .replace('{loserTribe}', loser));
    }

    // Individual performance commentary
    const individualCommentary = this._generateIndividualCommentary(stageIndex, individualPerformances);
    if (individualCommentary) {
      commentary.push(individualCommentary);
    }

    // Overall position commentary
    const positionCommentary = this._generatePositionCommentary();
    if (positionCommentary) {
      commentary.push(positionCommentary);
    }

    return commentary.join(' ');
  }

  _generateIndividualCommentary(stageIndex, individualPerformances) {
    const commentary = [];
    const stageName = this.context.stages[stageIndex].name;

    // Find standout performers across all tribes
    let bestPerformer = null;
    let worstPerformer = null;
    let bestScore = 0;
    let worstScore = 100;

    Object.values(individualPerformances).forEach(tribePerformances => {
      tribePerformances.forEach(perf => {
        if (perf.normalized > bestScore) {
          bestScore = perf.normalized;
          bestPerformer = perf.survivor;
        }
        if (perf.normalized < worstScore) {
          worstScore = perf.normalized;
          worstPerformer = perf.survivor;
        }
      });
    });

    // Comment on exceptional performances
    if (bestScore >= 95 && bestPerformer) {
      const phrase = this._getRandomPhrase('individualStars')
        .replace('{player}', bestPerformer.name)
        .replace('{stage}', stageName);
      commentary.push(phrase);
    }

    if (worstScore <= 30 && worstPerformer && Math.random() > 0.5) {
      const phrase = this._getRandomPhrase('individualFlops')
        .replace('{player}', worstPerformer.name)
        .replace('{stage}', stageName);
      commentary.push(phrase);
    }

    // Commentary memory references
    const memoryCommentary = this._generateMemoryCommentary();
    if (memoryCommentary) {
      commentary.push(memoryCommentary);
    }

    return commentary.join(' ');
  }

  _generateMemoryCommentary() {
    const commentary = [];

    // Consistent performers
    if (this.commentaryMemory.consistentPerformers.size > 0 && Math.random() > 0.6) {
      const playerId = Array.from(this.commentaryMemory.consistentPerformers)[0];
      const player = this._findPlayerById(playerId);
      if (player) {
        commentary.push(this._getRandomPhrase('consistency').replace('{player}', player.name));
      }
    }

    // Struggling players
    if (this.commentaryMemory.strugglingPlayers.size > 0 && Math.random() > 0.7) {
      const playerId = Array.from(this.commentaryMemory.strugglingPlayers)[0];
      const player = this._findPlayerById(playerId);
      if (player) {
        const playerMemory = this.commentaryMemory.standoutPerformers.get(playerId);
        const flopCount = playerMemory.stages.filter(s => s.type === 'flop').length;
        commentary.push(this._getRandomPhrase('struggles')
          .replace('{player}', player.name)
          .replace('{count}', this._numberToWord(flopCount)));
      }
    }

    return commentary.join(' ');
  }

  _generatePositionCommentary() {
    if (this.currentStage === 0) return null;

    const currentLeader = this._getCurrentLeader();
    const previousLeader = this._getPreviousLeader();

    if (currentLeader !== previousLeader) {
      if (this._isComeback(currentLeader)) {
        return this._getRandomPhrase('comebacks').replace('{tribe}', currentLeader);
      } else {
        return this._getRandomPhrase('takingLead').replace('{tribe}', currentLeader);
      }
    }

    return null;
  }

  _showFinalResults() {
    const finalCommentary = this._generateFinalCommentary();

    this.dialogueSystem.showDialogue(finalCommentary, ["Back to Camp"], () => {
      if (this.callback) {
        this.callback();
      }
    });
  }

  _generateFinalCommentary() {
    const sortedTribes = Object.entries(this.context.totalScores)
      .sort(([,a], [,b]) => b - a);

    const winner = sortedTribes[0][0];
    const loser = sortedTribes[sortedTribes.length - 1][0];

    const commentary = [];

    // Determine narrative type
    const narrative = this._determineFinalNarrative(winner);

    // Winner announcement
    const closeness = this._getClosenessDescription();
    commentary.push(this._getRandomPhrase('finalResults.winners')
      .replace('{winnerTribe}', winner)
      .replace('{closeness}', closeness));

    // Narrative commentary
    if (narrative) {
      commentary.push(this._getRandomPhrase(`finalResults.narratives.${narrative}`)
        .replace('{tribe}', winner));
    }

    // Loser commentary
    commentary.push(this._getRandomPhrase('finalResults.losers')
      .replace('{loserTribe}', loser));

    return commentary.join(' ');
  }

  _determineFinalNarrative(winner) {
    const winnerScores = this.context.scores[winner];

    // Check for comeback (started poorly, finished strong)
    if (winnerScores.length >= 3) {
      const firstHalf = winnerScores.slice(0, Math.ceil(winnerScores.length / 2));
      const secondHalf = winnerScores.slice(Math.ceil(winnerScores.length / 2));
      const firstAvg = firstHalf.reduce((a, b) => a + b) / firstHalf.length;
      const secondAvg = secondHalf.reduce((a, b) => a + b) / secondHalf.length;

      if (secondAvg > firstAvg * 1.2) {
        return 'comeback';
      }
    }

    // Check for consistency (low variance)
    const avgScore = winnerScores.reduce((a, b) => a + b) / winnerScores.length;
    const variance = winnerScores.reduce((acc, score) => acc + Math.pow(score - avgScore, 2), 0) / winnerScores.length;

    if (variance < 100) {
      return 'consistent';
    }

    return null;
  }

  // Helper methods
  _getRandomPhrase(category) {
    const categories = category.split('.');
    let phrases = this.jeffPhrases;

    for (const cat of categories) {
      phrases = phrases[cat];
      if (!phrases) return "Great performance out there!";
    }

    if (Array.isArray(phrases)) {
      return phrases[Math.floor(Math.random() * phrases.length)];
    }

    return phrases;
  }

  _findPlayerById(playerId) {
    for (const tribe of this.context.tribes) {
      const player = tribe.members.find(m => m.id === playerId);
      if (player) return player;
    }
    return null;
  }

  _getCurrentLeader() {
    return Object.entries(this.context.totalScores)
      .sort(([,a], [,b]) => b - a)[0][0];
  }

  _getPreviousLeader() {
    if (this.currentStage === 0) return null;

    const previousTotals = {};
    this.context.tribes.forEach(tribe => {
      previousTotals[tribe.name] = this.context.scores[tribe.name]
        .slice(0, this.currentStage)
        .reduce((sum, score) => sum + score, 0);
    });

    return Object.entries(previousTotals)
      .sort(([,a], [,b]) => b - a)[0][0];
  }

  _isComeback(tribeName) {
    const scores = this.context.scores[tribeName];
    if (scores.length < 2) return false;

    const recentImprovement = scores[scores.length - 1] > scores[scores.length - 2] * 1.3;
    const wasStruggling = scores.slice(0, -1).some(score => 
      score < Object.values(this.context.scores).flat().reduce((a, b) => a + b) / Object.values(this.context.scores).flat().length * 0.8
    );

    return recentImprovement && wasStruggling;
  }

  _getClosenessDescription() {
    const scores = Object.values(this.context.totalScores);
    const maxScore = Math.max(...scores);
    const minScore = Math.min(...scores);
    const diff = maxScore - minScore;

    if (diff < 30) return "incredibly close";
    if (diff < 60) return "hard-fought";
    if (diff < 100) return "competitive";
    return "decisive";
  }

  _numberToWord(num) {
    const words = ['zero', 'one', 'two', 'three', 'four', 'five'];
    return words[num] || num.toString();
  }

  destroy() {
    if (this.container) {
      clearChildren(this.container);
    }
    this.container = null;
    this.context = null;
    this.commentaryMemory = null;
  }
}

export default FirstContactView;