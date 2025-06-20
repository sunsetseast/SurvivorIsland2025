
import { createElement, clearChildren } from '../utils/DOMUtils.js';
import gameManager from '../core/GameManager.js';

const RoleView = {
  assignedRoles: new Map(), // stage-id -> survivor-id mapping
  
  render(container, onComplete = null) {
    if (!container) {
      console.error('RoleView: No container provided');
      return;
    }

    this.onComplete = onComplete;
    this.assignedRoles.clear(); // Reset assignments for new challenge
    
    // Show initial popup first
    this.showInitialPopup(container);
  },

  showInitialPopup(container) {
    clearChildren(container);

    // Set background
    container.style.backgroundImage = "url('Assets/Screens/challenge.png')";
    container.style.backgroundSize = 'cover';
    container.style.backgroundPosition = 'center';
    container.style.backgroundRepeat = 'no-repeat';

    // Semi-transparent overlay
    const overlay = createElement('div', {
      style: `
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background-color: rgba(0, 0, 0, 0.7);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        z-index: 1000;
      `,
      onclick: () => {
        this.showRoleView(container);
      }
    });

    const playerTribe = gameManager.getPlayerTribe();
    
    // Container for tribe portrait and text overlay
    const portraitContainer = createElement('div', {
      style: `
        position: relative;
        width: 300px;
        max-width: 80vw;
        margin-bottom: 30px;
      `
    });

    // Tribe portrait
    const tribePortrait = createElement('img', {
      src: `Assets/Tribe/${playerTribe.color}-portrait.png`,
      style: `
        width: 100%;
        display: block;
      `
    });

    // Text overlay positioned on top of the image
    const textOverlay = createElement('div', {
      style: `
        position: absolute;
        top: 50px;
        left: 50%;
        transform: translateX(-50%);
        color: white;
        font-family: 'Survivant', sans-serif;
        font-size: 0.8rem;
        text-align: center;
        max-width: 85%;
        text-shadow: 2px 2px 4px black;
        line-height: 1.3;
        padding: 0 5px;
      `
    }, 'In your first Immunity Challenge, your tribe must complete a series of obstacles. Each stage will test the traits of your tribe against the traits of your opponents. Choose carefully because each Survivor may only be assigned one role in this challenge.');

    portraitContainer.append(tribePortrait, textOverlay);

    const clickText = createElement('div', {
      style: `
        color: #f39c12;
        font-family: 'Survivant', sans-serif;
        font-size: 0.9rem;
        text-align: center;
        margin-top: 20px;
        text-shadow: 2px 2px 4px black;
      `
    }, 'Click anywhere to continue');

    overlay.append(portraitContainer, clickText);
    container.appendChild(overlay);
  },

  showRoleView(container) {
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

    // Create scrollable card wrapper
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
      const cardWrapper = this._createStageCard(stage, index, container);
      scrollableCardWrapper.appendChild(cardWrapper);
    });

    container.appendChild(scrollableCardWrapper);

    // Add confirm roles button
    const confirmButton = createElement('button', {
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
        font-size: 1rem;
        font-weight: bold;
        text-shadow: 1px 1px 2px black;
        padding: 0;
        cursor: pointer;
        opacity: ${this.assignedRoles.size >= challengeStages.length ? 1 : 0.5};
        pointer-events: ${this.assignedRoles.size >= challengeStages.length ? 'auto' : 'none'};
      `,
      onclick: () => {
        if (this.assignedRoles.size >= challengeStages.length) {
          if (this.onComplete && typeof this.onComplete === 'function') {
            this.onComplete();
          }
        }
      }
    }, 'Confirm Roles');

    container.appendChild(confirmButton);
  },

  _createStageCard(stage, index, mainContainer) {
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

    // Front of card
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
        this._updateCardBack(stage.id, cardBack, mainContainer);
      }
    }, 'FLIP');

    cardFront.appendChild(flipButton);

    // Back of card with tribe banner and survivor grid
    const cardBack = createElement('div', {
      className: 'card-back',
      style: `
        position: absolute;
        width: 100%;
        height: 100%;
        backface-visibility: hidden;
        transform: rotateY(180deg);
        border-radius: 10px;
        border: 2px solid rgba(255, 255, 255, 0.3);
        box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
        overflow: hidden;
      `
    });

    // Back button
    const backButton = createElement('img', {
      src: 'Assets/Buttons/left.png',
      className: 'back-button',
      style: `
        position: absolute;
        bottom: 10px;
        left: 50%;
        transform: translateX(-50%);
        width: 30px;
        height: 30px;
        cursor: pointer;
        z-index: 20;
      `,
      onclick: (e) => {
        e.stopPropagation();
        card.style.transform = 'rotateY(0deg)';
      }
    });

    cardBack.appendChild(backButton);

    card.appendChild(cardFront);
    card.appendChild(cardBack);
    cardWrapper.appendChild(card);

    return cardWrapper;
  },

  _updateCardBack(stageId, cardBack, mainContainer) {
    // Clear existing content except back button
    const backButton = cardBack.querySelector('.back-button');
    clearChildren(cardBack);
    if (backButton) {
      cardBack.appendChild(backButton);
    }

    const playerTribe = gameManager.getPlayerTribe();
    
    // Add tribe banner background, stretched to fit card
    const bannerBg = createElement('div', {
      style: `
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background-image: url('Assets/Tribe/${playerTribe.color}-banner.png');
        background-size: 100% 100%;
        background-position: center;
        background-repeat: no-repeat;
      `
    });
    cardBack.appendChild(bannerBg);

    // Stage name overlay
    const stageName = createElement('h3', {
      style: `
        position: absolute;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        color: white;
        font-family: 'Survivant', sans-serif;
        font-size: 1.2rem;
        text-align: center;
        text-shadow: 2px 2px 4px black;
        margin: 0;
        z-index: 15;
      `
    }, this._getStageNameById(stageId));
    cardBack.appendChild(stageName);

    // Survivor grid
    const survivorGrid = createElement('div', {
      style: `
        position: absolute;
        top: 60px;
        left: 50%;
        transform: translateX(-50%);
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 8px;
        width: 90%;
        max-width: 200px;
        z-index: 15;
      `
    });

    // Get available survivors (not already assigned to other roles)
    const availableSurvivors = this._getAvailableSurvivors(stageId);
    
    availableSurvivors.forEach(survivor => {
      const survivorWrapper = this._createSurvivorAvatar(survivor, stageId, mainContainer);
      survivorGrid.appendChild(survivorWrapper);
    });

    cardBack.appendChild(survivorGrid);
  },

  _getAvailableSurvivors(currentStageId) {
    const playerTribe = gameManager.getPlayerTribe();
    const assignedSurvivorIds = new Set();
    
    // Get all survivors already assigned to other stages
    for (const [stageId, survivorId] of this.assignedRoles) {
      if (stageId !== currentStageId) {
        assignedSurvivorIds.add(survivorId);
      }
    }
    
    // Return survivors not assigned to other stages
    return playerTribe.members.filter(survivor => !assignedSurvivorIds.has(survivor.id));
  },

  _createSurvivorAvatar(survivor, stageId, mainContainer) {
    const isAssigned = this.assignedRoles.get(stageId) === survivor.id;
    
    const avatarWrapper = createElement('div', {
      style: `
        display: flex;
        flex-direction: column;
        align-items: center;
        cursor: pointer;
        padding: 3px;
        border-radius: 5px;
        transition: background-color 0.3s;
      `
    });

    // Add hover effect like in ShelterView
    avatarWrapper.addEventListener('mouseenter', () => {
      avatarWrapper.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
    });

    avatarWrapper.addEventListener('mouseleave', () => {
      avatarWrapper.style.backgroundColor = 'transparent';
    });

    const avatar = createElement('img', {
      src: survivor.avatarUrl || `Assets/Avatars/${survivor.firstName.toLowerCase()}.jpeg`,
      alt: survivor.firstName,
      style: `
        width: 45px;
        height: 45px;
        border-radius: 50%;
        object-fit: cover;
        border: 3px solid ${isAssigned ? 'gold' : 'white'};
        background: #000;
        transition: border-color 0.3s;
        pointer-events: none;
      `
    });

    const name = createElement('span', {
      style: `
        font-family: 'Survivant', sans-serif;
        font-size: 0.7rem;
        color: white;
        margin-top: 2px;
        text-align: center;
        text-shadow: 1px 1px 2px black;
        line-height: 1;
        pointer-events: none;
      `
    }, survivor.firstName.toUpperCase());

    // Single click handler on the wrapper like ShelterView
    avatarWrapper.addEventListener('click', (e) => {
      e.stopPropagation();
      console.log('Avatar clicked:', survivor.firstName, 'isAssigned:', isAssigned);
      if (isAssigned) {
        console.log('Showing unassign popup');
        this._showUnassignPopup(survivor, stageId, mainContainer);
      } else {
        console.log('Showing traits popup');
        this._showTraitsPopup(survivor, stageId, mainContainer);
      }
    });

    avatarWrapper.append(avatar, name);
    return avatarWrapper;
  },

  _showTraitsPopup(survivor, stageId, mainContainer) {
    console.log('Creating traits popup for:', survivor.firstName);
    
    // Create overlay similar to ShelterView technique
    const overlay = createElement('div', {
      id: 'traits-popup',
      style: `
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background-color: rgba(0, 0, 0, 0.8);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 2000;
      `
    });

    // Create traits card wrapper similar to CharacterSelectionScreen
    const traitsCardWrapper = createElement('div', {
      style: `
        position: relative;
        width: 334px;
        height: 550px;
        background-image: url('Assets/card-back-traits.png');
        background-size: 100% 100%;
        background-repeat: no-repeat;
        background-position: center;
        border-radius: 15px;
        overflow: hidden;
      `,
      onclick: (e) => {
        e.stopPropagation();
      }
    });

    // Use the same trait coordinates as CharacterSelectionScreen
    const traitCoordinates = {
      physical: [75, 71],
      mental: [168, 71],
      social: [261, 71],
      strength: [75, 141],
      memory: [168, 141],
      connections: [261, 141],
      speed: [75, 220],
      puzzles: [168, 220],
      likeability: [261, 220],
      endurance: [75, 297],
      fortitude: [168, 297],
      interrogation: [261, 297],
      dexterity: [75, 370],
      awareness: [168, 370],
      deception: [261, 370],
      balance: [75, 445],
      focus: [168, 445],
      alliances: [261, 445]
    };

    // Add all trait values to the card
    Object.entries(traitCoordinates).forEach(([key, [x, y]]) => {
      const value = survivor[key];
      const traitElement = createElement('div', {
        className: 'trait-element',
        style: `
          position: absolute;
          left: ${x}px;
          top: ${y}px;
          font-size: 18px;
          font-weight: bold;
          color: white;
          text-align: center;
          transform: translate(-50%, -50%);
          text-shadow: 1px 1px 3px black;
          pointer-events: none;
        `
      }, value?.toString() ?? '?');
      traitsCardWrapper.appendChild(traitElement);
    });

    // Add buttons container at bottom
    const buttonsContainer = createElement('div', {
      style: `
        position: absolute;
        bottom: 30px;
        left: 50%;
        transform: translateX(-50%);
        display: flex;
        gap: 20px;
        z-index: 5;
      `
    });

    // Back button using same style as ShelterView
    const backButton = createElement('button', {
      className: 'rect-button small',
      style: `
        background-image: url('Assets/rect-button.png');
        background-size: 100% 100%;
        background-repeat: no-repeat;
        background-position: center;
        width: 80px;
        height: 35px;
        border: none;
        color: white;
        font-family: 'Survivant', serif;
        font-size: 12px;
        font-weight: bold;
        cursor: pointer;
        text-shadow: 1px 1px 2px black;
      `
    }, 'Back');

    // Assign role button
    const assignButton = createElement('button', {
      className: 'rect-button small',
      style: `
        background-image: url('Assets/rect-button.png');
        background-size: 100% 100%;
        background-repeat: no-repeat;
        background-position: center;
        width: 100px;
        height: 35px;
        border: none;
        color: white;
        font-family: 'Survivant', serif;
        font-size: 12px;
        font-weight: bold;
        cursor: pointer;
        text-shadow: 1px 1px 2px black;
      `
    }, 'Assign Role');

    // Event handlers
    backButton.addEventListener('click', () => {
      document.body.removeChild(overlay);
    });

    assignButton.addEventListener('click', () => {
      this.assignedRoles.set(stageId, survivor.id);
      document.body.removeChild(overlay);
      // Refresh the card back and confirm button
      this._refreshCardBack(stageId, mainContainer);
      this._updateConfirmButton(mainContainer);
    });

    // Close on overlay click
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        document.body.removeChild(overlay);
      }
    });

    buttonsContainer.appendChild(backButton);
    buttonsContainer.appendChild(assignButton);
    traitsCardWrapper.appendChild(buttonsContainer);
    overlay.appendChild(traitsCardWrapper);
    
    console.log('Appending traits popup to document body');
    document.body.appendChild(overlay);
  },

  _showUnassignPopup(survivor, stageId, mainContainer) {
    // Semi-transparent overlay
    const overlay = createElement('div', {
      style: `
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background-color: rgba(0, 0, 0, 0.7);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 2000;
      `
    });

    // Buttons container
    const buttonsContainer = createElement('div', {
      style: `
        display: flex;
        gap: 20px;
      `
    });

    // Unassign button
    const unassignBtn = createElement('button', {
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
        font-size: 1rem;
        font-weight: bold;
        text-shadow: 1px 1px 2px black;
        cursor: pointer;
      `,
      onclick: () => {
        this.assignedRoles.delete(stageId);
        document.body.removeChild(overlay);
        // Refresh the card back and confirm button
        this._refreshCardBack(stageId, mainContainer);
        this._updateConfirmButton(mainContainer);
      }
    }, 'Un-Assign Role');

    // Cancel button
    const cancelBtn = createElement('button', {
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
        font-size: 1rem;
        font-weight: bold;
        text-shadow: 1px 1px 2px black;
        cursor: pointer;
      `,
      onclick: () => {
        document.body.removeChild(overlay);
      }
    }, 'Cancel');

    buttonsContainer.append(unassignBtn, cancelBtn);
    overlay.appendChild(buttonsContainer);
    document.body.appendChild(overlay);
  },

  _refreshCardBack(stageId, mainContainer) {
    const cardBack = mainContainer.querySelector(`.stage-card:nth-child(${this._getStageIndex(stageId) + 1}) .card-back`);
    if (cardBack) {
      this._updateCardBack(stageId, cardBack, mainContainer);
    }
  },

  _updateConfirmButton(mainContainer) {
    const confirmButton = mainContainer.querySelector('button');
    const challengeStages = 4; // Total number of stages
    
    if (confirmButton) {
      const allAssigned = this.assignedRoles.size >= challengeStages;
      confirmButton.style.opacity = allAssigned ? '1' : '0.5';
      confirmButton.style.pointerEvents = allAssigned ? 'auto' : 'none';
    }
  },

  _getStageNameById(stageId) {
    const names = {
      'mud-crawl': 'Mud Crawl',
      'untie-knots': 'Untie Knots',
      'bean-bag-toss': 'Bean Bag Toss',
      'vertical-puzzle': 'Vertical Puzzle'
    };
    return names[stageId] || 'Unknown Stage';
  },

  _getStageIndex(stageId) {
    const stages = ['mud-crawl', 'untie-knots', 'bean-bag-toss', 'vertical-puzzle'];
    return stages.indexOf(stageId);
  }
};

export default RoleView;
