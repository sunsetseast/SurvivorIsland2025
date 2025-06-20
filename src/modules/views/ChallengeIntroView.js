import { createElement, clearChildren } from '../utils/DOMUtils.js';
import gameManager from '../core/GameManager.js';
import RoleView from './RoleView.js';

const ChallengeIntroView = {
  onComplete: null,

  render(container, config = null, onComplete = null) {
    if (!container) {
      console.error('ChallengeIntroView: No container provided');
      return;
    }

    this.onComplete = onComplete;
    clearChildren(container);

    // Use provided config or get default
    const challengeConfig = config || this.getDefaultConfig();

    // Set background
    container.style.backgroundImage = `url('${challengeConfig.background || 'Assets/jeff-screen.png'}')`;
    container.style.backgroundSize = 'cover';
    container.style.backgroundPosition = 'center';
    container.style.backgroundRepeat = 'no-repeat';

    // Create main intro wrapper
    const introWrapper = createElement('div', {
      style: `
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        text-align: center;
        color: white;
        z-index: 1;
        max-width: 800px;
        padding: 40px;
        background: rgba(0, 0, 0, 0.7);
        border-radius: 15px;
        backdrop-filter: blur(5px);
      `
    });

    // Challenge title
    const challengeTitle = createElement('h1', {
      style: `
        font-family: 'Survivant', serif;
        font-size: 2.5rem;
        margin-bottom: 20px;
        text-shadow: 2px 2px 4px rgba(0,0,0,0.5);
      `
    }, challengeConfig.name);

    // Challenge day subtitle
    const daySubtitle = createElement('h2', {
      style: `
        font-family: 'Survivant', serif;
        font-size: 1.5rem;
        margin-bottom: 20px;
        color: #f39c12;
        text-shadow: 2px 2px 4px rgba(0,0,0,0.5);
      `
    }, `Day ${challengeConfig.day} Immunity Challenge`);

    // Challenge description
    const challengeDescription = createElement('p', {
      style: `
        font-size: 1.2rem;
        margin-bottom: 30px;
        max-width: 600px;
        line-height: 1.6;
      `
    }, challengeConfig.description);

    // Continue button
    const continueButton = createElement('button', {
      style: `
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
        cursor: pointer;
        margin-top: 30px;
      `,
      onclick: () => {
        RoleView.render(container, this.onComplete);
      }
    }, 'Next');

    introWrapper.append(challengeTitle, daySubtitle, challengeDescription, continueButton);
    container.appendChild(introWrapper);
  },

  completeIntro() {
    console.log('Challenge introduction completed');
    if (this.onComplete && typeof this.onComplete === 'function') {
      this.onComplete();
    }
  },

  getDefaultConfig() {
    return {
      name: 'Immunity Challenge',
      description: 'Compete for immunity and safety from tribal council.',
      background: 'Assets/jeff-screen.png',
      mechanics: 'endurance',
      day: gameManager.getDay(),
      isSpecial: false,
      showJeff: false
    };
  }
};

export default ChallengeIntroView;