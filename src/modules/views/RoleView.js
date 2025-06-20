
import { createElement, clearChildren } from '../utils/DOMUtils.js';

const RoleView = {
  render(container, onComplete = null) {
    if (!container) {
      console.error('RoleView: No container provided');
      return;
    }

    this.onComplete = onComplete;
    clearChildren(container);

    // Set background
    container.style.backgroundImage = "url('Assets/Screens/challenge.png')";
    container.style.backgroundSize = 'cover';
    container.style.backgroundPosition = 'center';
    container.style.backgroundRepeat = 'no-repeat';

    // Challenge stages data
    const challengeStages = [
      {
        id: 'mud-crawl',
        name: 'Mud Crawl',
        cardImage: 'Assets/Challenge/mud-crawl-card.png'
      },
      {
        id: 'untie-knots',
        name: 'Untie Knots',
        cardImage: 'Assets/Challenge/untie-knots-card.png'
      },
      {
        id: 'bean-bag-toss',
        name: 'Bean Bag Toss',
        cardImage: 'Assets/Challenge/bean-bag-toss-card.png'
      },
      {
        id: 'vertical-puzzle',
        name: 'Vertical Puzzle',
        cardImage: 'Assets/Challenge/vertical-puzzle-card.png'
      }
    ];

    // Create scrollable card wrapper (horizontal like character selection)
    const scrollableCardWrapper = createElement('div', {
      style: `
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 90%;
        height: 70%;
        overflow-x: auto;
        overflow-y: hidden;
        display: flex;
        align-items: center;
        gap: 20px;
        padding: 20px;
        scroll-behavior: smooth;
      `
    });

    challengeStages.forEach((stage, index) => {
      const cardWrapper = this._createStageCard(stage, index);
      scrollableCardWrapper.appendChild(cardWrapper);
    });

    container.appendChild(scrollableCardWrapper);

    // Add navigation button to continue
    const continueButton = createElement('button', {
      style: `
        position: absolute;
        bottom: 40px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 2;
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
      `,
      onclick: () => {
        if (this.onComplete && typeof this.onComplete === 'function') {
          this.onComplete();
        }
      }
    }, 'Continue');

    container.appendChild(continueButton);
  },

  _createStageCard(stage, index) {
    const cardWrapper = createElement('div', {
      className: 'card-wrapper',
      style: `
        position: relative;
        width: 250px;
        height: 350px;
        flex-shrink: 0;
        perspective: 1000px;
      `
    });

    const card = createElement('div', {
      className: 'stage-card',
      style: `
        position: relative;
        width: 100%;
        height: 100%;
        transform-style: preserve-3d;
        transition: transform 0.6s;
      `
    });

    // FRONT of card
    const cardFront = createElement('div', {
      className: 'card-front',
      style: `
        position: absolute;
        width: 100%;
        height: 100%;
        backface-visibility: hidden;
        background-image: url('${stage.cardImage}');
        background-size: cover;
        background-position: center;
        background-repeat: no-repeat;
        border-radius: 10px;
        border: 2px solid rgba(255, 255, 255, 0.3);
        box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
      `
    });

    // Flip button
    const flipButton = createElement('button', {
      className: 'flip-button',
      style: `
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 80%;
        height: 80%;
        background: rgba(255, 0, 0, 0.1);
        border: 2px solid red;
        cursor: pointer;
        z-index: 10;
        color: white;
        font-family: 'Survivant', sans-serif;
        font-weight: bold;
        font-size: 1.2rem;
      `,
      onclick: (e) => {
        e.stopPropagation();
        card.style.transform = 'rotateY(180deg)';
      }
    }, 'FLIP');

    cardFront.appendChild(flipButton);

    // BACK of card
    const cardBack = createElement('div', {
      className: 'card-back',
      style: `
        position: absolute;
        width: 100%;
        height: 100%;
        backface-visibility: hidden;
        transform: rotateY(180deg);
        background-image: url('Assets/card-back.png');
        background-size: cover;
        background-position: center;
        background-repeat: no-repeat;
        border-radius: 10px;
        border: 2px solid rgba(255, 255, 255, 0.3);
        box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: space-between;
        padding: 20px;
        box-sizing: border-box;
      `
    });

    // Stage name on back
    const stageName = createElement('h3', {
      style: `
        color: white;
        font-family: 'Survivant', sans-serif;
        font-size: 1.5rem;
        text-align: center;
        text-shadow: 2px 2px 4px black;
        margin: 0;
        margin-top: 20px;
      `
    }, stage.name);

    // Back button
    const backButton = createElement('img', {
      src: 'Assets/Buttons/left.png',
      className: 'back-button',
      style: `
        width: 40px;
        height: 40px;
        cursor: pointer;
        margin-bottom: 20px;
      `,
      onclick: (e) => {
        e.stopPropagation();
        card.style.transform = 'rotateY(0deg)';
      }
    });

    cardBack.appendChild(stageName);
    cardBack.appendChild(backButton);

    card.appendChild(cardFront);
    card.appendChild(cardBack);
    cardWrapper.appendChild(card);

    return cardWrapper;
  }
};

export default RoleView;
