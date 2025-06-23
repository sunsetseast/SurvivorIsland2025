import { createElement, clearChildren } from '../utils/DOMUtils.js';
import gameManager from '../core/GameManager.js';
import screenManager from '../core/ScreenManager.js';

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

    this.currentStage = config.currentStage || 0;
    this.stageData = config.stageData || this._getDefaultStageData();
    this.currentCommentaryIndex = 0;

    console.log('Loaded First Contact challenge view');
    this._showJeffCommentary();
  },

  _getDefaultStageData() {
    return {
      name: 'First Contact',
      commentary: [
        "Welcome to your first challenge as merged tribes!",
        "This will test everything you've learned so far.",
        "Good luck, survivors!"
      ]
    };
  },

  _showJeffCommentary() {
    clearChildren(this.container);
    this.container.style.backgroundImage = `url('Assets/jeff-screen.png')`;
    this.container.style.backgroundSize = 'cover';
    this.container.style.backgroundPosition = 'center';
    this.container.style.backgroundRepeat = 'no-repeat';

    const currentCommentary = this.stageData.commentary[this.currentCommentaryIndex];

    if (currentCommentary) {
      console.log(`Showing Jeff commentary for stage: ${this.stageData.name}`);

      const parchment = this._createJeffParchment(currentCommentary, () => {
        this.currentCommentaryIndex++;
        if (this.currentCommentaryIndex < this.stageData.commentary.length) {
          this._showJeffCommentary();
        } else {
          this._completeChallenge();
        }
      });

      this.container.appendChild(parchment);
    } else {
      this._completeChallenge();
    }
  },

  _createJeffParchment(text, onNext) {
    const parchmentWrapper = createElement('div', {
      style: `
        position: absolute;
        top: 30px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 1000;
        width: 300px;
        height: 200px;
      `
    });

    const parchmentImage = createElement('img', {
      src: 'Assets/parch-landscape.png',
      style: `
        width: 100%;
        height: 100%;
        object-fit: contain;
        z-index: 1001;
      `
    });

    const jeffTextElement = createElement('div', {
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
      `
    }, text);

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
        cursor: pointer;
      `,
      onclick: onNext
    }, 'Next');

    parchmentWrapper.appendChild(parchmentImage);
    parchmentWrapper.appendChild(jeffTextElement);
    this.container.appendChild(nextButton);

    return parchmentWrapper;
  },

  _completeChallenge() {
    console.log('First Contact challenge completed');

    // Return to camp or next screen
    gameManager.setGameState('camp');
    screenManager.showScreen('camp');

    if (window.campScreen && typeof window.campScreen.loadView === 'function') {
      window.campScreen.loadView('flag');
    }
  }
};

export default FirstContactView;