import { createElement, clearChildren } from '../utils/DOMUtils.js';
import gameManager from '../core/GameManager.js';
import screenManager from '../core/ScreenManager.js';
import RoleView from './RoleView.js';

const ChallengeIntroView = {
  render(container, challengeConfig = null, onComplete = null) {
    if (!container) {
      console.error('ChallengeIntroView: No container provided');
      return;
    }

    // Reset challenge stage when starting a new challenge
    this.challengeStage = 0;
    this.onComplete = onComplete;

    clearChildren(container);

    // Get current game state
    const currentDay = gameManager.getDay();
    const playerTribe = gameManager.getPlayerTribe();
    const allTribes = gameManager.getTribes();
    const player = gameManager.getPlayerSurvivor();

    // Use provided config or get default
    const config = challengeConfig || this.getDefaultConfig();

    console.log('=== CHALLENGE INTRODUCTION ===');
    console.log('Challenge:', config.name);
    console.log('Day:', config.day);

    // Set background
    container.style.backgroundImage = `url('${config.background}')`;
    container.style.backgroundSize = 'cover';
    container.style.backgroundPosition = 'center';
    container.style.backgroundRepeat = 'no-repeat';

    // Render based on challenge configuration
    if (config.isSpecial && config.showJeff) {
      this.renderSpecialIntro(container, config, playerTribe, allTribes, player);
    } else {
      this.renderStandardIntro(container, config, playerTribe, allTribes, player);
    }
  },

  renderSpecialIntro(container, config, playerTribe, allTribes, player) {
    // Initialize challenge stage if not set
    if (!this.challengeStage) {
      this.challengeStage = 0;
    }

    switch (this.challengeStage) {
      case 0:
        this.renderJeffIntro(container, config);
        break;
      case 1:
        this.renderPlayerTribeFlag(container, config, playerTribe, player);
        break;
      case 2:
        this.renderOtherTribesMessage(container, config, allTribes);
        break;
      default:
        // Show other tribes (stage 3+)
        const otherTribes = allTribes.filter(tribe => tribe.name !== playerTribe.name);
        const tribeIndex = this.challengeStage - 3;
        if (tribeIndex >= 0 && tribeIndex < otherTribes.length) {
          this.renderOtherTribeFlag(container, config, otherTribes[tribeIndex]);
        } else if (this.challengeStage === 3 + otherTribes.length) {
          // Show Jeff's challenge explanation stage 1
          this.renderJeffChallengeExplanation(container, config, 1);
        } else if (this.challengeStage === 4 + otherTribes.length) {
          // Show Jeff's challenge explanation stage 2
          this.renderJeffChallengeExplanation(container, config, 2);
        } else if (this.challengeStage === 5 + otherTribes.length) {
          // Show Jeff's challenge explanation stage 3
          this.renderJeffChallengeExplanation(container, config, 3);
        } else if (this.challengeStage === 6 + otherTribes.length) {
          // Show First Contact popup
          this.renderFirstContactPopup(container, config);
        } else {
          // All stages complete, call completion callback
          this.completeIntro();
        }
        break;
    }
  },

  renderJeffIntro(container, config) {
    // Parchment wrapper for Jeff's message
    const parchmentWrapper = createElement('div', {
      style: `
        position: absolute;
        top: 30px;
        left: 50%;
        transform: translateX(-50%);
        width: 100%;
        max-width: 320px;
        z-index: 2;
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

    const jeffText = createElement('div', {
      className: 'parchment-text',
      style: `
        color: white;
        font-family: 'Survivant', sans-serif;
        font-weight: bold;
        text-align: center;
        margin: -160px auto 0;
        max-width: 260px;
        font-size: 1.8rem;
        line-height: 1.3;
        display: flex;
        align-items: center;
        justify-content: center;
        height: 120px;
        text-shadow:
          0 1px 0 #000,
          0 2px 0 #000,
          0 3px 0 #000,
          0 4px 4px rgba(0, 0, 0, 0.5);
      `
    }, config.jeffMessage || 'COME ON IN, GUYS!');

    parchmentWrapper.append(parchment, jeffText);

    // Next button
    const nextButton = createElement('button', {
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
        this.challengeStage++;
        this.renderSpecialIntro(container, config, gameManager.getPlayerTribe(), gameManager.getTribes(), gameManager.getPlayerSurvivor());
      }
    }, 'Next');

    container.append(parchmentWrapper, nextButton);
  },

  renderJeffChallengeExplanation(container, config, stage = 1) {
    clearChildren(container);

    // Use Jeff background for this explanation
    container.style.backgroundImage = `url('${config.background}')`;

    // Parchment wrapper for Jeff's challenge explanation
    const parchmentWrapper = createElement('div', {
      style: `
        position: absolute;
        top: 30px;
        left: 50%;
        transform: translateX(-50%);
        width: 100%;
        max-width: 320px;
        z-index: 2;
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

    let jeffText, buttonText;

    switch (stage) {
      case 1:
        jeffText = 'Welcome to your first Immunity Challenge of the season! Winning the challenge earns safety for your tribe. Losing tribe will join me tonight for the first Tribal Council of Survivor Island.';
        buttonText = 'Next';
        break;
      case 2:
        jeffText = "Here's how it works: Tribes will compete head to head in a series of stages. Each stage will put each survivor's unique traits to the test.";
        buttonText = 'Next';
        break;
      case 3:
        jeffText = 'First tribes to finish win Immunity.\n\nI\'ll give you a minute to strategize.';
        buttonText = 'Begin Challenge';
        break;
    }

    const textElement = createElement('div', {
      className: 'parchment-text',
      style: `
        color: white;
        font-family: 'Survivant', sans-serif;
        font-weight: bold;
        text-align: center;
        margin: -160px auto 0;
        max-width: 260px;
        font-size: 0.9rem;
        line-height: 1.2;
        display: flex;
        align-items: center;
        justify-content: center;
        height: 120px;
        text-shadow:
          0 1px 0 #000,
          0 2px 0 #000,
          0 3px 0 #000,
          0 4px 4px rgba(0, 0, 0, 0.5);
        white-space: pre-line;
      `
    }, jeffText);

    parchmentWrapper.append(parchment, textElement);

    // Button
    const actionButton = createElement('button', {
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
        this.challengeStage++;
        this.renderSpecialIntro(container, config, gameManager.getPlayerTribe(), gameManager.getTribes(), gameManager.getPlayerSurvivor());
      }
    }, buttonText);

    container.append(parchmentWrapper, actionButton);
  },

  renderPlayerTribeFlag(container, config, playerTribe, player) {
    clearChildren(container);

    // Use challenge background instead of Jeff background
    container.style.backgroundImage = `url('Assets/Screens/challenge.png')`;

    const wrapper = createElement('div', {
      className: 'tribe-wrapper',
      style: `
        position: relative;
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        overflow: hidden;
      `
    });

    const tribeImage = createElement('img', {
      src: `Assets/Tribe/${playerTribe.color}-portrait.png`,
      alt: `${playerTribe.name} portrait`,
      style: `
        width: 100%;
        max-width: 300px;
        display: block;
        margin: 0 auto;
        position: relative;
        z-index: 1;
      `
    });

    const tribeNameOverlay = createElement('div', {
      style: `
        position: absolute;
        top: 15%;
        left: 50%;
        transform: translateX(-50%);
        color: white;
        text-shadow: 2px 2px 4px black;
        font-size: 2.4rem;
        font-family: 'Survivant', sans-serif;
        z-index: 2;
        pointer-events: none;
      `
    }, playerTribe.name.toUpperCase());

    const memberCount = playerTribe.members.length;
    const isTwoTribeMode = memberCount === 9;
    const topOffset = isTwoTribeMode ? '27%' : '28%';
    const scaleValue = isTwoTribeMode ? 0.9 : 1.05;
    const columns = isTwoTribeMode ? 3 : 2;

    const avatarGrid = createElement('div', {
      style: `
        position: absolute;
        top: ${topOffset};
        left: 50%;
        transform: translate(-50%, 0%) scale(${scaleValue});
        display: grid;
        grid-template-columns: repeat(${columns}, auto);
        grid-template-rows: repeat(3, auto);
        column-gap: 4px;
        row-gap: 8px;
        z-index: 2;
      `
    });

    playerTribe.members.forEach(member => {
      const avatarWrapper = createElement('div', {
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
          border: 3px solid ${playerTribe.color};
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

      avatarWrapper.append(avatar, name);
      avatarGrid.appendChild(avatarWrapper);
    });

    const nextButton = createElement('button', {
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
        this.challengeStage++;
        this.renderSpecialIntro(container, config, playerTribe, gameManager.getTribes(), player);
      }
    }, 'Next');

    wrapper.append(tribeImage, tribeNameOverlay, avatarGrid, nextButton);
    container.appendChild(wrapper);
  },

  renderOtherTribesMessage(container, config, allTribes) {
    clearChildren(container);

    // Use challenge background instead of Jeff background
    container.style.backgroundImage = `url('Assets/Screens/challenge.png')`;

    const parchmentWrapper = createElement('div', {
      style: `
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 100%;
        max-width: 320px;
        z-index: 2;
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

    const playerTribe = gameManager.getPlayerTribe();
    const otherTribes = allTribes.filter(tribe => tribe.name !== playerTribe.name);
    const messageText = otherTribes.length > 1 ? 
      'You see the other tribes walk in from the jungle.' : 
      'You see the other tribe walk in from the jungle.';

    const messageTextElement = createElement('div', {
      className: 'parchment-text',
      style: `
        color: white;
        font-family: 'Survivant', sans-serif;
        font-weight: bold;
        text-align: center;
        margin: -140px auto 0;
        max-width: 260px;
        font-size: 1.1rem;
        line-height: 1.3;
        text-shadow:
          0 1px 0 #000,
          0 2px 0 #000,
          0 3px 0 #000,
          0 4px 4px rgba(0, 0, 0, 0.5);
      `
    }, messageText);

    parchmentWrapper.append(parchment, messageTextElement);

    const nextButton = createElement('button', {
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
        this.challengeStage++;
        this.renderSpecialIntro(container, config, playerTribe, allTribes, gameManager.getPlayerSurvivor());
      }
    }, 'Next');

    container.append(parchmentWrapper, nextButton);
  },

  renderOtherTribeFlag(container, config, tribe) {
    clearChildren(container);

    // Use challenge background instead of Jeff background
    container.style.backgroundImage = `url('Assets/Screens/challenge.png')`;

    const wrapper = createElement('div', {
      className: 'tribe-wrapper',
      style: `
        position: relative;
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        overflow: hidden;
      `
    });

    const tribeImage = createElement('img', {
      src: `Assets/Tribe/${tribe.color}-portrait.png`,
      alt: `${tribe.name} portrait`,
      style: `
        width: 100%;
        max-width: 300px;
        display: block;
        margin: 0 auto;
        position: relative;
        z-index: 1;
      `
    });

    const tribeNameOverlay = createElement('div', {
      style: `
        position: absolute;
        top: 15%;
        left: 50%;
        transform: translateX(-50%);
        color: white;
        text-shadow: 2px 2px 4px black;
        font-size: 2.4rem;
        font-family: 'Survivant', sans-serif;
        z-index: 2;
        pointer-events: none;
      `
    }, tribe.name.toUpperCase());

    const memberCount = tribe.members.length;
    const isTwoTribeMode = memberCount === 9;
    const topOffset = isTwoTribeMode ? '27%' : '28%';
    const scaleValue = isTwoTribeMode ? 0.9 : 1.05;
    const columns = isTwoTribeMode ? 3 : 2;

    const avatarGrid = createElement('div', {
      style: `
        position: absolute;
        top: ${topOffset};
        left: 50%;
        transform: translate(-50%, 0%) scale(${scaleValue});
        display: grid;
        grid-template-columns: repeat(${columns}, auto);
        grid-template-rows: repeat(3, auto);
        column-gap: 4px;
        row-gap: 8px;
        z-index: 2;
      `
    });

    tribe.members.forEach(member => {
      const avatarWrapper = createElement('div', {
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

      avatarWrapper.append(avatar, name);
      avatarGrid.appendChild(avatarWrapper);
    });

    const allTribes = gameManager.getTribes();
    const playerTribe = gameManager.getPlayerTribe();
    const otherTribes = allTribes.filter(t => t.name !== playerTribe.name);
    const currentTribeIndex = this.challengeStage - 3;

    const nextButton = createElement('button', {
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
        this.challengeStage++;
        this.renderSpecialIntro(container, config, playerTribe, allTribes, gameManager.getPlayerSurvivor());
      }
    }, 'Next');

    wrapper.append(tribeImage, tribeNameOverlay, avatarGrid, nextButton);
    container.appendChild(wrapper);
  },

  renderFirstContactPopup(container, config) {
    clearChildren(container);

    // Use Jeff background for this explanation
    container.style.backgroundImage = `url('${config.background}')`;

    // Large sideways popup wrapper
    const popupWrapper = createElement('div', {
      style: `
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%) rotate(90deg);
        width: 80vh;
        height: 80vw;
        max-width: 600px;
        max-height: 400px;
        z-index: 2;
        background-image: url('Assets/rect-button-1.png');
        background-size: contain;
        background-repeat: no-repeat;
        background-position: center;
        display: flex;
        align-items: center;
        justify-content: center;
      `
    });

    const popupText = createElement('div', {
      style: `
        color: white;
        font-family: 'Survivant', sans-serif;
        font-weight: bold;
        text-align: center;
        font-size: 2rem;
        line-height: 1.3;
        text-shadow:
          0 2px 0 #000,
          0 4px 0 #000,
          0 6px 0 #000,
          0 8px 8px rgba(0, 0, 0, 0.5);
        transform: rotate(-90deg);
        width: 300px;
        height: 200px;
        display: flex;
        align-items: center;
        justify-content: center;
      `
    }, 'FIRST CONTACT');

    popupWrapper.appendChild(popupText);

    // Close button (positioned outside the rotated popup)
    const closeButton = createElement('button', {
      style: `
        position: absolute;
        bottom: 40px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 3;
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
        this.challengeStage++;
        this.renderSpecialIntro(container, config, gameManager.getPlayerTribe(), gameManager.getTribes(), gameManager.getPlayerSurvivor());
      }
    }, 'Continue');

    container.append(popupWrapper, closeButton);
  },

  renderStandardIntro(container, config, playerTribe, allTribes, player) {
    const introWrapper = createElement('div', {
      style: `
        position: relative;
        width: 100%;
        height: 100vh;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        background-color: rgba(26, 77, 46, 0.8);
        color: white;
        text-align: center;
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
    }, config.name);

    // Challenge day subtitle
    const daySubtitle = createElement('h2', {
      style: `
        font-family: 'Survivant', serif;
        font-size: 1.5rem;
        margin-bottom: 20px;
        color: #f39c12;
        text-shadow: 2px 2px 4px rgba(0,0,0,0.5);
      `
    }, `Day ${config.day} Immunity Challenge`);

    // Challenge description
    const challengeDescription = createElement('p', {
      style: `
        font-size: 1.2rem;
        margin-bottom: 30px;
        max-width: 600px;
        line-height: 1.6;
      `
    }, config.description);

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

// RoleView.js
import { createElement, clearChildren } from '../utils/DOMUtils.js';

const RoleView = {
    render(container, onComplete) {
        if (!container) {
            console.error('RoleView: No container provided');
            return;
        }

        clearChildren(container);

        container.style.backgroundImage = `url('Assets/Screens/challenge.png')`;
        container.style.backgroundSize = 'cover';
        container.style.backgroundPosition = 'center';
        container.style.backgroundRepeat = 'no-repeat';

        const scrollableCardWrapper = createElement('div', {
            style: `
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                width: 90%;
                height: 80%;
                overflow-x: auto;
                display: flex;
                padding-bottom: 20px;
            `
        });

        const stages = [
            { name: 'Mud Crawl', front: 'Assets/mud-crawl-card.png' , back: 'Assets/card-back.png'},
            { name: 'Untie Knots', front: 'Assets/untie-knots-card.png', back: 'Assets/card-back.png' },
            { name: 'Bean Bag Toss', front: 'Assets/bean-bag-toss-card.png', back: 'Assets/card-back.png' },
            { name: 'Vertical Puzzle', front: 'Assets/vertical-puzzle-card.png', back: 'Assets/card-back.png' }
        ];

        stages.forEach(stage => {
            const cardWrapper = createElement('div', {
                style: `
                    position: relative;
                    width: 200px;
                    height: 300px;
                    margin: 0 10px;
                    flex-shrink: 0;
                `
            });

            const cardFront = createElement('img', {
                src: stage.front,
                style: `
                    position: absolute;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    object-fit: contain;
                    backface-visibility: hidden; /* Hide the back side initially */
                    transition: transform 0.6s;
                `
            });

            const cardBack = createElement('img', {
                src: stage.back,
                style: `
                    position: absolute;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    object-fit: contain;
                    backface-visibility: hidden;
                    transform: rotateY(180deg); /* Initially rotate the back side */
                    transition: transform 0.6s;
                `
            });

            const invisibleButton = createElement('button', {
                style: `
                    position: absolute;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    opacity: 0.5; /* Make visible for positioning purposes */
                    cursor: pointer;
                    z-index: 10;
                `,
                onclick: () => {
                    cardFront.style.transform = 'rotateY(180deg)';
                    cardBack.style.transform = 'rotateY(360deg)';
                }
            });

            const backButton = createElement('img', {
                src: 'Assets/left.png',
                style: `
                    position: absolute;
                    bottom: 10px;
                    left: 10px;
                    width: 30px;
                    height: 30px;
                    cursor: pointer;
                    z-index: 11;
                `,
                onclick: () => {
                    cardFront.style.transform = 'rotateY(0deg)';
                    cardBack.style.transform = 'rotateY(180deg)';
                }
            });

            cardBack.appendChild(backButton);
            cardWrapper.appendChild(invisibleButton);
            cardWrapper.appendChild(cardFront);
            cardWrapper.appendChild(cardBack);
            scrollableCardWrapper.appendChild(cardWrapper);
        });

        container.appendChild(scrollableCardWrapper);
    }
};

export default RoleView;