/**
 * @module TribeDivisionScreen
 * Combined Marooning + Tribe Division Screen
 */

import { getElement, createElement, clearChildren } from '../utils/index.js';
import { gameManager } from '../core/index.js';
import gameData from '../data/index.js';

export default class TribeDivisionScreen {
  initialize() {
    console.log('TribeDivisionScreen initialized');
  }

  setup(data = {}) {
    const container = getElement('game-container');
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

    startButton.addEventListener('click', () => this._showJeffIntro(container));
    container.appendChild(startButton);
  }

  _showJeffIntro(container, stage = 0) {
    if (stage === 0) {
      clearChildren(container);

      container.style.backgroundImage = "url('Assets/jeff-screen.png')";
      container.style.backgroundSize = 'cover';
      container.style.backgroundPosition = 'center';
      container.style.backgroundRepeat = 'no-repeat';

      // Parchment wrapper
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
          max-width: 320px;
          max-height: 180px;
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
          margin: -160px auto 0;
          max-width: 260px;
          font-size: 0.95rem;
          line-height: 1.3;
          text-shadow:
            0 1px 0 #000,
            0 2px 0 #000,
            0 3px 0 #000,
            0 4px 4px rgba(0, 0, 0, 0.5);
        `
      });

      text.innerHTML = `<div style="font-size: 1.2rem; margin-bottom: 0.4rem;">WELCOME TO SURVIVOR ISLAND!</div>
           18 castaways will compete to outwit, outplay, and outlast each other to be crowned the Sole Survivor!`;

      const nextButton = createElement('button', {
        className: 'rect-button',
        style: `
          position: absolute;
          bottom: 40px;
          left: 50%;
          transform: translateX(-50%);
        `
      }, 'Next');

      nextButton.addEventListener('click', () => {
        const text = container.querySelector('.parchment-text');
        text.innerHTML = `LET'S DIVIDE INTO TRIBES!`;
        this._showJeffIntro(container, 1);
      });

      parchmentWrapper.append(parchment, text);
      container.append(parchmentWrapper, nextButton);
    } else {
      const nextButton = container.querySelector('button');
      nextButton.addEventListener('click', () => this._divideTribes(container));
    }
  }

  _advanceJeffIntro(container) {
    // Update parchment and text styling only, do not recreate elements
    this.parchment.style.maxWidth = '300px';
    this.parchment.style.maxHeight = '140px';
    this.text.style.margin = '-120px auto 0';
    this.text.style.fontSize = '1.1rem';
    this.text.innerHTML = `LET’S DIVIDE INTO TRIBES!`;

    this.nextButton.textContent = 'Next';
    const newHandler = () => this._divideTribes(container);
    this.nextButton.replaceWith(this.nextButton.cloneNode(true));
    this.nextButton = container.querySelector('.card-button');
    this.nextButton.textContent = 'Next';
    this.nextButton.addEventListener('click', newHandler);
  }

  _divideTribes(container) {
    clearChildren(container);
    container.style.backgroundImage = "url('Assets/water-bg.png')";

    const mode = gameManager.getTribeMode();
    const allSurvivors = gameManager.getAllSurvivors();
    const playerSurvivor = gameManager.getPlayerSurvivor();

    const tribeCount = mode === '3tribe' ? 3 : 2;
    const tribeSize = Math.floor(allSurvivors.length / tribeCount);

    const colorPool = ['red', 'orange', 'blue', 'purple', 'green'];
    const namePool = [...gameData.DEFAULT_TRIBE_NAMES];

    let chosenColors;
    while (true) {
      const shuffledColors = [...colorPool].sort(() => Math.random() - 0.5);
      chosenColors = shuffledColors.slice(0, tribeCount);
      if (!(chosenColors.includes('red') && chosenColors.includes('orange'))) break;
    }

    const shuffledNames = namePool.sort(() => Math.random() - 0.5).slice(0, tribeCount);
    const shuffledSurvivors = [...allSurvivors].sort(() => Math.random() - 0.5);

    const tribes = [];
    for (let i = 0; i < tribeCount; i++) {
      tribes.push({
        color: chosenColors[i],
        name: shuffledNames[i],
        members: shuffledSurvivors.slice(i * tribeSize, (i + 1) * tribeSize)
      });
    }

    const playerTribeIndex = tribes.findIndex(tribe =>
      tribe.members.some(m => m.id === playerSurvivor.id)
    );
    const [playerTribe] = tribes.splice(playerTribeIndex, 1);
    tribes.unshift(playerTribe);

    tribes.forEach(tribe => {
      const tribeImage = createElement('img', {
        src: `Assets/Tribe/${tribe.color}-portrait.png`,
        style: `
          width: 100%;
          max-width: 500px;
          display: block;
          margin: 30px auto 10px;
        `
      });

      const nameLabel = createElement('div', {
        style: `
          text-align: center;
          font-size: 22px;
          font-weight: bold;
          font-family: 'Survivant', sans-serif;
          color: white;
          margin-bottom: 10px;
        `
      }, tribe.name);

      const nameList = createElement('div', {
        style: `
          text-align: center;
          font-family: 'Survivant', sans-serif;
          color: white;
          font-size: 20px;
          margin-bottom: 20px;
        `
      }, tribe.members.map(m => m.firstName).join(', '));

      container.append(nameLabel, tribeImage, nameList);
    });

    const day1Button = createElement('button', {
      className: 'rect-button',
      style: 'margin: 40px auto 80px; display: block;'
    }, 'Begin Day 1');

    container.appendChild(day1Button);
  }

  teardown() {
    console.log('TribeDivisionScreen teardown');
  }
}