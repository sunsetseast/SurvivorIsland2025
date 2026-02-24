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
import { gameManager } from '../core/index.js';
import { GamePhase, GameState } from '../core/GameManager.js';

export default class TribeDivisionScreen {
  constructor() {
    this._managedListeners = [];
    this._managedTimers = [];
    this._activeOverlays = new Set();
  }

  initialize() {
    console.log('TribeDivisionScreen initialized');
  }

  setup(data = {}) {
    const container = getElement('tribe-division-screen');
    clearChildren(container);

    container.style.backgroundImage = "url('Assets/marooning.png')";
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

    this._addManagedListener(startButton, 'click', () => this._showTribeModePopup(container));
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
    this._trackOverlay(tribePopup);
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

      this._addManagedListener(nextButtonStage0, 'click', () => {
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

      this._addManagedListener(nextButtonStage1, 'click', () => {
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
    const tribes = gameManager.createTribes({
      tribeCount,
      mode: gameMode,
      survivors: allSurvivors,
      constraints: {
        disallowRedOrangeTogether: true,
        minTribeSize: 1
      }
    });

    const displayTribes = [...tribes];
    const playerTribeIndex = displayTribes.findIndex(tribe =>
      tribe.members.some(m => playerSurvivor && m.id === playerSurvivor.id)
    );
    if (playerTribeIndex !== -1) {
      const [playerTribe] = displayTribes.splice(playerTribeIndex, 1);
      displayTribes.unshift(playerTribe);
    }

    const canonicalPlayerTribe = gameManager.getPlayerTribe();
    console.log('[TribeDivisionScreen] Tribes created', {
      tribeCount: tribes.length,
      colors: tribes.map(tribe => tribe.tribeColor),
      playerTribe: canonicalPlayerTribe?.tribeName || canonicalPlayerTribe?.id || null
    });

    displayTribes.forEach(tribe => {
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
          color: ${tribe.tribeColor};
          -webkit-text-stroke: 1px white;
          text-shadow: 1px 1px 3px rgba(0,0,0,0.7);
        `
      }, tribe.tribeName);

      const image = createElement('img', {
        src: `Assets/Tribe/${tribe.tribeColor}-portrait.png`,
        alt: `${tribe.tribeName} portrait`,
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
          src: this._getAvatarCandidates(member)[0],
          alt: member.firstName,
          style: `
            width: 64px;
            height: 64px;
            border-radius: 50%;
            object-fit: cover;
            border: 3px solid ${tribe.tribeColor};
            background: #000;
          `
        });
        this._wireAvatarFallback(avatar, member);

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

    this._addManagedListener(button, 'click', () => {
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

  _getAvatarCandidates(member) {
    const candidates = [];
    if (member?.avatarUrl) candidates.push(member.avatarUrl);
    if (member?.id) candidates.push(`Assets/Avatars/${member.id}.jpeg`);
    candidates.push('Assets/Avatars/default.jpeg');

    const safeName = this._slugifyAvatarName(member?.firstName);
    if (safeName) {
      candidates.push(`Assets/Avatars/${safeName}.jpeg`);
    }

    return [...new Set(candidates)];
  }

  _wireAvatarFallback(image, member) {
    const candidates = this._getAvatarCandidates(member);
    let candidateIndex = candidates.indexOf(image.src);
    if (candidateIndex < 0) candidateIndex = 0;

    image.addEventListener('error', () => {
      const nextIndex = candidateIndex + 1;
      if (nextIndex >= candidates.length) return;
      candidateIndex = nextIndex;
      image.src = candidates[candidateIndex];
    });
  }

  _slugifyAvatarName(name = '') {
    return String(name)
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9_-]/g, '');
  }

  _trackOverlay(element) {
    if (element) this._activeOverlays.add(element);
    return element;
  }

  _addManagedListener(element, eventName, handler, options) {
    if (!element || !eventName || !handler) return;
    element.addEventListener(eventName, handler, options);
    this._managedListeners.push({ element, eventName, handler, options });
  }

  teardown() {
    this._activeOverlays.forEach(overlay => overlay?.remove?.());
    this._activeOverlays.clear();

    this._managedListeners.forEach(({ element, eventName, handler, options }) => {
      element?.removeEventListener?.(eventName, handler, options);
    });
    this._managedListeners = [];

    this._managedTimers.forEach(timerId => {
      timerManager.clearTimeout(timerId);
      timerManager.clearInterval(timerId);
    });
    this._managedTimers = [];

    console.log('TribeDivisionScreen teardown');
  }
}
