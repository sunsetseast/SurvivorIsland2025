/**
 * @module ChallengeIntroView
 * Challenge introduction view - handles Jeff's introduction, tribe flags, and challenge setup
 */

import { createElement, getElement, clearChildren } from '../utils/DOMUtils.js';
import { gameManager } from '../core/index.js';

export default class ChallengeIntroView {
  constructor() {
    this.container = null;
  }

  setup(container) {
    this.container = container;
    this.render();
  }

  render() {
    clearChildren(this.container);

    const content = createElement('div', {
      className: 'challenge-intro-content',
      style: `
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 100vh;
        background-image: url('Assets/challenge.png');
        background-size: cover;
        background-position: center;
        color: white;
        text-align: center;
        font-family: 'Survivant', sans-serif;
      `
    });

    // Jeff's introduction
    const jeffIntro = createElement('div', {
      className: 'jeff-intro',
      style: `
        background-color: rgba(0, 0, 0, 0.8);
        padding: 20px;
        border-radius: 10px;
        margin-bottom: 20px;
        max-width: 80%;
      `
    });

    const jeffText = createElement('p', {
      style: 'font-size: 1.2rem; line-height: 1.5;'
    }, "Come on in, guys! Today's challenge will test your tribe's strength, endurance, and teamwork.");

    jeffIntro.appendChild(jeffText);

    // Player tribe flag
    const playerTribe = gameManager.getPlayerTribe();
    if (playerTribe) {
      const tribeFlag = createElement('img', {
        src: `Assets/Tribe/${playerTribe.color}-banner.png`,
        alt: `${playerTribe.name} tribe flag`,
        style: `
          width: 150px;
          height: auto;
          margin: 10px;
          border: 3px solid white;
          border-radius: 5px;
        `
      });
      content.appendChild(tribeFlag);
    }

    // Continue button
    const continueButton = createElement('button', {
      className: 'rect-button',
      style: `
        background-image: url('Assets/rect-button.png');
        background-size: contain;
        background-repeat: no-repeat;
        width: 200px;
        height: 60px;
        border: none;
        color: white;
        font-family: 'Survivant', sans-serif;
        font-size: 1rem;
        cursor: pointer;
        margin-top: 20px;
      `
    }, 'Continue to Challenge');

    continueButton.addEventListener('click', () => {
      this.proceedToChallenge();
    });

    content.appendChild(jeffIntro);
    content.appendChild(continueButton);
    this.container.appendChild(content);
  }

  proceedToChallenge() {
    // Navigate to the actual challenge view
    const challengeScreen = gameManager.screenManager.screens['challenge'];
    if (challengeScreen && challengeScreen.loadTribeChallengeView) {
      challengeScreen.loadTribeChallengeView();
    }
  }

  teardown() {
    if (this.container) {
      clearChildren(this.container);
    }
  }
}