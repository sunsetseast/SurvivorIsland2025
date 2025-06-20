
import { createElement, clearChildren } from '../utils/DOMUtils.js';
import { setupScrollReveal } from '../utils/ScrollReveal.js';

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

    // Create scrollable card stack
    const stageArea = createElement('div', { 
      id: 'stage-stack',
      style: `
        display: flex;
        flex-direction: column;
        gap: 20px;
        padding: 20px;
        overflow-y: auto;
        height: calc(100vh - 40px);
        align-items: center;
      `
    });

    challengeStages.forEach((stage, index) => {
      const card = this._createStageCard(stage, index);
      stageArea.appendChild(card);
    });

    container.appendChild(stageArea);
    
    if (setupScrollReveal) {
      setupScrollReveal();
    }
  },

  _createStageCard(stage, index) {
    const cardWrapper = createElement('div', { 
      className: 'card-wrapper',
      style: `
        position: relative;
        width: 300px;
        height: 400px;
        perspective: 1000px;
        margin-bottom: 20px;
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
    card.dataset.id = stage.id;

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
        display: flex;
        align-items: center;
        justify-content: center;
      `
    });

    // Visible button for positioning (as requested)
    const flipButton = createElement('button', {
      className: 'flip-button',
      style: `
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 80%;
        height: 80%;
        background: rgba(255, 0, 0, 0.3);
        border: 2px solid red;
        cursor: pointer;
        z-index: 10;
      `,
      onclick: (e) => {
        e.stopPropagation();
        cardWrapper.classList.add('flipped');
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
      `
    }, stage.name);

    // Back button
    const backButton = createElement('button', {
      className: 'back-button',
      style: `
        width: 40px;
        height: 40px;
        background-image: url('Assets/Buttons/left.png');
        background-size: contain;
        background-repeat: no-repeat;
        background-position: center;
        border: none;
        cursor: pointer;
        margin-bottom: 20px;
      `,
      onclick: (e) => {
        e.stopPropagation();
        cardWrapper.classList.remove('flipped');
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

// Add CSS for card flipping
const style = createElement('style');
style.textContent = `
  .card-wrapper.flipped .stage-card {
    transform: rotateY(180deg);
  }
  
  .stage-card .card-front,
  .stage-card .card-back {
    border: 2px solid rgba(255, 255, 255, 0.3);
    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
  }
`;
document.head.appendChild(style);

export default RoleView;
