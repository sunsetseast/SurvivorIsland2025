/**
 * @module TribeDivisionScreen
 * Combined Marooning + Tribe Division Screen
 */
import {
  getElement,
  createElement,
  clearChildren,
  addDebugBanner,
  timerManager
} from '../utils/index.js';
import { gameManager, eventManager, GameEvents } from '../core/index.js';
import { GamePhase, GameState } from '../core/GameManager.js';
import gameData from '../data/index.js';

export default class TribeDivisionScreen {
  initialize() {
    console.log('TribeDivisionScreen initialized');
  }

  setup(data = {}) {
    const container = getElement('tribe-division-screen');
    clearChildren(container);

    container.style.backgroundImage = "url('Assets/marooning.jpeg')";
    container.style.backgroundSize = 'cover';
    container.style.backgroundPosition = 'center';
    container.style.backgroundRepeat = 'no-repeat';

    const startButton = createElement('button', {
      className: 'rect-button alt',
      style: `
        position: absolute;
        bottom: 40px;
        left: 50%;
        transform: translateX(-50%);
      `
    }, 'Start Game');

    startButton.addEventListener('click', () => this._showTribeModePopup(container));
    container.appendChild(startButton);
  }

  _showTribeModePopup(container) {
    const tribePopup = createElement('div', {
      id: 'tribe-popup',
      style: {
        display: 'flex',
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: '1rem',
        zIndex: 999
      }
    });

    const title = createElement('h2', {
      style: {
        color: '#fff',
        fontFamily: 'Survivant, sans-serif',
        marginBottom: '1rem'
      }
    }, 'Choose Game Mode');

    const twoTribeButton = createElement('button', {
      className: 'rect-button',
      onclick: () => {
        gameManager.tribeCount = 2;
        gameManager.gameMode = '2-tribe';
        tribePopup.remove();
        this._showJeffIntro(container);
      }
    }, '2 Tribes');

    const threeTribeButton = createElement('button', {
      className: 'rect-button',
      onclick: () => {
        gameManager.tribeCount = 3;
        gameManager.gameMode = '3-tribe';
        tribePopup.remove();
        this._showJeffIntro(container);
      }
    }, '3 Tribes');

    const bvbButton = createElement('button', {
      className: 'rect-button',
      onclick: () => {
        gameManager.tribeCount = 3;
        gameManager.gameMode = 'brains-brawn-beauty';
        tribePopup.remove();
        this._showJeffIntro(container);
      }
    }, 'Brains vs. Brawn vs. Beauty');

    const sexesButton = createElement('button', {
      className: 'rect-button',
      onclick: () => {
        gameManager.tribeCount = 2;
        gameManager.gameMode = 'battle-sexes';
        tribePopup.remove();
        this._showJeffIntro(container);
      }
    }, 'Battle of the Sexes');

    tribePopup.append(title, twoTribeButton, threeTribeButton, bvbButton, sexesButton);
    container.appendChild(tribePopup);
  }

  _showJeffIntro(container, stage = 0) {
    clearChildren(container);

    container.style.backgroundImage = "url('Assets/jeff-screen.png')";
    container.style.backgroundSize = 'cover';
    container.style.backgroundPosition = 'center';
    container.style.backgroundRepeat = 'no-repeat';

    const parchmentWrapper = createElement('div', {
      style: `
        position: relative;
        width: 100%;
        max-width: 320px;
        margin: 30px auto 0;
      `
    });

    const parchment = createElement('img', {
      src: 'Assets/parch-landscape.png',
      style: `
        width: 100%;
        max-width: ${stage === 0 ? '320px' : '300px'};
        max-height: ${stage === 0 ? '180px' : '140px'};
        display: block;
        margin: 0 auto;
      `
    });

    const text = createElement('div', {
      className: 'parchment-text',
      style: `
        color: white;
        font-family: 'Survivant', sans-serif;
        font-weight: bold;
        text-align: center;
        margin: ${stage === 0 ? '-160px auto 0' : '-80px auto 0'};
        max-width: 260px;
        font-size: ${stage === 0 ? '0.95rem' : '1.1rem'};
        line-height: 1.3;
        text-shadow:
          0 1px 0 #000,
          0 2px 0 #000,
          0 3px 0 #000,
          0 4px 4px rgba(0, 0, 0, 0.5);
      `
    });

    text.innerHTML = stage === 0
      ? `<div style="font-size: 1.2rem; margin-bottom: 0.4rem;">WELCOME TO SURVIVOR ISLAND!</div>
         18 castaways will compete to outwit, outplay, and outlast each other to be crowned the Sole Survivor!`
      : `LET’S DIVIDE INTO TRIBES!`;

    parchmentWrapper.append(parchment, text);
    container.appendChild(parchmentWrapper);

    if (stage === 0) {
      const nextButtonStage0 = createElement('button', {
        className: 'card-button',
        style: `
          position: absolute;
          bottom: 40px;
          left: 50%;
          transform: translateX(-50%);
        `
      }, 'Next');

      nextButtonStage0.addEventListener('click', () => {
        this._showJeffIntro(container, 1);
      });

      container.appendChild(nextButtonStage0);
    } else {
      const nextButtonStage1 = createElement('button', {
        className: 'card-button',
        style: `
          position: absolute;
          bottom: 40px;
          left: 50%;
          transform: translateX(-50%);
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
        `
      }, 'Next');

      nextButtonStage1.addEventListener('click', () => {
        this._divideTribes(container);
      });

      container.appendChild(nextButtonStage1);
    }
  }

  _divideTribes(container) {
    clearChildren(container);
    container.style.backgroundImage = "url('Assets/water-bg.png')";
    container.style.backgroundSize = 'cover';
    container.style.backgroundPosition = 'center';
    container.style.backgroundRepeat = 'no-repeat';

    const scrollWrapper = createElement('div', {
      style: `
        max-height: 100vh;
        overflow-y: auto;
        padding: 10px;
      `
    });

    const allSurvivors = gameManager.survivors;
    const playerSurvivor = gameManager.getPlayerSurvivor();
    const gameMode = gameManager.gameMode;
    const tribeCount = gameManager.tribeCount;
    const colorPool = ['red', 'orange', 'blue', 'purple', 'green'];
    const namePool = [...gameData.DEFAULT_TRIBE_NAMES];

    let chosenColors;
    while (true) {
      const shuffledColors = [...colorPool].sort(() => Math.random() - 0.5);
      chosenColors = shuffledColors.slice(0, tribeCount);
      if (!(chosenColors.includes('red') && chosenColors.includes('orange'))) break;
    }

    let shuffledNames;
    if (gameMode === 'brains-brawn-beauty') {
      shuffledNames = ['Brains', 'Brawn', 'Beauty'];
    } else {
      shuffledNames = namePool.sort(() => Math.random() - 0.5).slice(0, tribeCount);
    }

    let tribes = [];

    if (gameMode === 'brains-brawn-beauty') {
      const brains = allSurvivors.filter(s => s.traitClass === 'Mental');
      const brawn = allSurvivors.filter(s => s.traitClass === 'Physical');
      const beauty = allSurvivors.filter(s => s.traitClass === 'Social');

      const groups = [brains, brawn, beauty];

      tribes = groups.map((group, i) => ({
        color: chosenColors[i],
        name: shuffledNames[i],
        members: group
      }));
    } else if (gameMode === 'battle-sexes') {
      const males = allSurvivors.filter(s => s.gender.toLowerCase() === 'male');
      const females = allSurvivors.filter(s => s.gender.toLowerCase() === 'female');

      const groups = [males, females];

      tribes = groups.map((group, i) => ({
        color: chosenColors[i],
        name: shuffledNames[i],
        members: group
      }));
    } else {
      const males = allSurvivors.filter(s => s.gender.toLowerCase() === 'male').sort(() => Math.random() - 0.5);
      const females = allSurvivors.filter(s => s.gender.toLowerCase() === 'female').sort(() => Math.random() - 0.5);

      const interleaved = [];
      let mi = 0, fi = 0;
      while (mi < males.length || fi < females.length) {
        if (fi < females.length) interleaved.push(females[fi++]);
        if (mi < males.length) interleaved.push(males[mi++]);
      }

      const shuffledSurvivors = interleaved;
      const tribeSize = Math.floor(shuffledSurvivors.length / tribeCount);
      let index = 0;

      for (let i = 0; i < tribeCount; i++) {
        const size = i === tribeCount - 1
          ? shuffledSurvivors.length - index
          : tribeSize;

        const members = shuffledSurvivors.slice(index, index + size);
        index += size;

        tribes.push({
          color: chosenColors[i],
          name: shuffledNames[i],
          members
        });
      }
    }

    tribes.forEach((tribe, i) => {
      tribe.members.forEach(member => {
        member.tribeId = i + 1;
        member.tribeColor = tribe.color;
      });
    });

    gameManager.tribes = tribes;
    gameManager.survivors = tribes.flatMap(t => t.members);
    gameManager.player = gameManager.survivors.find(s => s.isPlayer);
    

    const playerTribeIndex = tribes.findIndex(tribe =>
      tribe.members.some(m => playerSurvivor && m.id === playerSurvivor.id)
    );
    if (playerTribeIndex !== -1) {
      const [playerTribe] = tribes.splice(playerTribeIndex, 1);
      tribes.unshift(playerTribe);
    }

    tribes.forEach(tribe => {
      const wrapper = createElement('div', {
        className: 'tribe-wrapper',
        style: `
          text-align: center;
          margin-bottom: 30px;
          position: relative;
          display: inline-block;
        `
      });

      const nameLabel = createElement('h2', {
        style: `
          font-family: 'Survivant', sans-serif;
          font-size: 2rem;
          margin-bottom: 5px;
          color: ${tribe.color};
          -webkit-text-stroke: 1px white;
          text-shadow: 1px 1px 3px rgba(0,0,0,0.7);
        `
      }, tribe.name);

      const image = createElement('img', {
        src: `Assets/Tribe/${tribe.color}-portrait.png`,
        alt: `${tribe.name} portrait`,
        style: `
          width: 100%;
          max-width: 400px;
          display: block;
          margin: 0 auto;
          position: relative;
          z-index: 1;
        `
      });

      const avatarGrid = createElement('div', {
        style: `
          position: absolute;
          top: 33%;
          left: 50%;
          transform: translateX(-50%) scale(${tribeCount === 3 ? 1.1 : 1});
          display: grid;
          grid-template-columns: repeat(${tribeCount === 3 ? 2 : 3}, auto);
          grid-template-rows: repeat(${tribeCount === 3 ? 3 : 3}, auto);
          column-gap: 4px;
          row-gap: 8px;
          z-index: 2;
        `
      });

      tribe.members.forEach(member => {
        const memberWrapper = createElement('div', {
          style: 'display: flex; flex-direction: column; align-items: center;'
        });

        const avatar = createElement('img', {
          src: member.avatarUrl || `Assets/Avatars/${member.firstName.toLowerCase()}.jpeg`,
          alt: member.firstName,
          style: `
            width: 64px;
            height: 64px;
            border-radius: 50%;
            object-fit: cover;
            border: 3px solid ${tribe.color};
            background: #000;
          `
        });

        const name = createElement('span', {
          style: `
            font-family: 'Survivant', sans-serif;
            font-size: 0.85rem;
            color: white;
            margin-top: 4px;
            text-align: center;
            text-shadow: 1px 1px 2px black;
            width: 80px;
            white-space: normal;
            word-break: keep-all;
            line-height: 1.1;
          `
        }, member.firstName.toUpperCase());

        memberWrapper.appendChild(avatar);
        memberWrapper.appendChild(name);
        avatarGrid.appendChild(memberWrapper);
      });

      wrapper.append(nameLabel, image, avatarGrid);
      scrollWrapper.appendChild(wrapper);
    });

    const button = createElement('button', {
      className: 'rect-button',
      style: `
        margin: 20px auto 40px;
        display: block;
        box-shadow: none;
        filter: none;
        font-size: 1.3rem;
      `
    }, 'Begin Day 1');

    // Removed green border
    // button.style.border = '4px solid lime';

    button.addEventListener('click', () => {
      console.log('Begin Day 1 clicked');
      addDebugBanner('Begin Day 1 clicked', 'purple', 40);
      addDebugBanner('Starting game clock and entering CAMP phase', 'purple', 30);

      try {
        // Set phase
        gameManager.gamePhase = GamePhase.PRE_CHALLENGE;
        gameManager.dayTimer = 7200; // 2 in-game hours
        gameManager.timeSpeed = 8;   // 8 seconds per real second

        // Move into CAMP using GameManager (this triggers correct events)
        gameManager.setGameState(GameState.CAMP);

        // Publish the phase change (ConversationSystem relies on this)
        if (typeof gameManager._publishPhaseChange === 'function') {
          gameManager._publishPhaseChange();
        }

        // Start the in-game day clock (keep your existing logic)
        timerManager.setInterval('dayClock', () => {
          gameManager.decreaseDayTimer();

          const clockElement = document.getElementById('day-timer');
          const dayElement = document.getElementById('day-label');
          if (clockElement && dayElement) {
            const min = Math.floor(gameManager.dayTimer / 60);
            const sec = gameManager.dayTimer % 60;
            clockElement.textContent = `${min}:${sec.toString().padStart(2, '0')}`;
            dayElement.textContent = `Day ${gameManager.day}`;
          }

          if (gameManager.dayTimer <= 0) {
            timerManager.clearInterval('dayClock');
            gameManager.advanceGamePhase();
          }
        }, 1000);

        // ⭐ TELL THE GAME "TRIBES ARE FINAL" → NPCs can be placed now
        eventManager.publish(GameEvents.TRIBES_CREATED, {
          tribes: gameManager.tribes
        });
        addDebugBanner('TRIBES_CREATED fired from Begin Day 1', 'teal', 50);

        // Reveal hamburger icon
        const hamburger = document.getElementById('hamburger-icon');
        if (hamburger) hamburger.style.display = 'block';

        addDebugBanner('GameManager.setGameState(CAMP) executed', 'gold', 50);
      } catch (e) {
        console.error('Error starting camp phase:', e);
        addDebugBanner('Error starting camp phase', 'red', 50);
      }
    });

    scrollWrapper.appendChild(button);
    container.appendChild(scrollWrapper);
  }

  teardown() {
    console.log('TribeDivisionScreen teardown');
  }
}