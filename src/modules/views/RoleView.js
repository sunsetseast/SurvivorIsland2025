
import { createElement, clearChildren } from '../utils/DOMUtils.js';
import gameManager from '../core/GameManager.js';

const RoleView = {
  assignedRoles: new Map(), // stage-id -> survivor-id mapping (or array for multi-survivor stages)
  
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
      id: 'confirm-roles-button',
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
        opacity: 0.5;
        pointer-events: none;
      `,
      onclick: () => {
        console.log('Confirm button clicked, assigned roles:', this.assignedRoles);
        const challengeStages = ['mud-crawl', 'untie-knots', 'bean-bag-toss', 'vertical-puzzle'];
        const allAssigned = challengeStages.every(stageId => {
          const assignment = this.assignedRoles.get(stageId);
          const maxAssignments = this._getMaxAssignmentsForStage(stageId);
          return assignment && Array.isArray(assignment) && assignment.length === maxAssignments;
        });
        
        if (allAssigned) {
          console.log('All roles properly assigned, proceeding to matchup screen');
          this._assignRolesToSurvivors();
          this._assignRolesToOpposingTribes();
          this._showMatchupScreen(container);
        } else {
          console.log('Not all roles assigned properly:', this.assignedRoles);
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

    if (stageId === 'mud-crawl') {
      // Special handling for mud crawl - just text and assign button
      const messageText = createElement('div', {
        style: `
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          color: white;
          font-family: 'Survivant', sans-serif;
          font-size: 1rem;
          text-align: center;
          text-shadow: 2px 2px 4px black;
          z-index: 15;
          max-width: 80%;
          line-height: 1.3;
        `
      }, 'All tribe members must compete in this stage.');
      cardBack.appendChild(messageText);

      // Assign role button
      const assignButton = createElement('button', {
        style: `
          position: absolute;
          bottom: 50px;
          left: 50%;
          transform: translateX(-50%);
          width: 100px;
          height: 35px;
          background-image: url('Assets/rect-button.png');
          background-size: 100% 100%;
          background-repeat: no-repeat;
          background-position: center;
          border: none;
          color: white;
          font-family: 'Survivant', sans-serif;
          font-size: 12px;
          font-weight: bold;
          cursor: pointer;
          text-shadow: 1px 1px 2px black;
          z-index: 15;
        `,
        onclick: () => {
          // Assign all survivors to mud crawl
          const allSurvivorIds = playerTribe.members.map(s => s.id);
          this.assignedRoles.set(stageId, allSurvivorIds);
          console.log('Assigned all survivors to mud crawl:', allSurvivorIds);
          this._refreshAllCardBacks(mainContainer);
          this._updateConfirmButton(mainContainer);
        }
      }, 'Assign Role');
      cardBack.appendChild(assignButton);

    } else {
      // Other stages - show survivor grid with individual selection
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

      // Get available survivors (not already assigned to other non-mud-crawl roles)
      const availableSurvivors = this._getAvailableSurvivors(stageId);
      
      availableSurvivors.forEach(survivor => {
        const survivorWrapper = this._createSurvivorAvatar(survivor, stageId, mainContainer);
        survivorGrid.appendChild(survivorWrapper);
      });

      cardBack.appendChild(survivorGrid);
    }
  },

  _getAvailableSurvivors(currentStageId) {
    const playerTribe = gameManager.getPlayerTribe();
    const assignedSurvivorIds = new Set();
    
    // Get all survivors already assigned to other stages (excluding mud-crawl)
    for (const [stageId, assignment] of this.assignedRoles) {
      if (stageId !== currentStageId && stageId !== 'mud-crawl') {
        if (Array.isArray(assignment)) {
          assignment.forEach(id => assignedSurvivorIds.add(id));
        } else {
          assignedSurvivorIds.add(assignment);
        }
      }
    }
    
    // Return survivors not assigned to other non-mud-crawl stages
    return playerTribe.members.filter(survivor => !assignedSurvivorIds.has(survivor.id));
  },

  _createSurvivorAvatar(survivor, stageId, mainContainer) {
    const assignment = this.assignedRoles.get(stageId);
    const isAssigned = Array.isArray(assignment) ? 
      assignment.includes(survivor.id) : 
      assignment === survivor.id;
    
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

    // Get traits that should be highlighted for this stage
    const highlightedTraits = this._getHighlightedTraitsForStage(stageId);

    // Add all trait values to the card
    Object.entries(traitCoordinates).forEach(([key, [x, y]]) => {
      const value = survivor[key];
      const isHighlighted = highlightedTraits.includes(key);
      const traitElement = createElement('div', {
        className: 'trait-element',
        style: `
          position: absolute;
          left: ${x}px;
          top: ${y}px;
          font-size: 18px;
          font-weight: bold;
          color: ${isHighlighted ? 'gold' : 'white'};
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
      if (stageId === 'mud-crawl') {
        // Mud crawl assigns all survivors
        const playerTribe = gameManager.getPlayerTribe();
        const allSurvivorIds = playerTribe.members.map(s => s.id);
        this.assignedRoles.set(stageId, allSurvivorIds);
        console.log('Assigned all survivors to mud crawl from traits popup:', allSurvivorIds);
      } else {
        // Other stages - check if we can assign more survivors
        const currentAssignment = this.assignedRoles.get(stageId) || [];
        const maxAssignments = this._getMaxAssignmentsForStage(stageId);
        
        if (Array.isArray(currentAssignment)) {
          if (currentAssignment.length < maxAssignments) {
            currentAssignment.push(survivor.id);
            this.assignedRoles.set(stageId, currentAssignment);
            console.log(`Assigned ${survivor.firstName} to ${stageId}:`, currentAssignment);
          }
        } else if (!currentAssignment) {
          this.assignedRoles.set(stageId, [survivor.id]);
          console.log(`Assigned ${survivor.firstName} to ${stageId}: [${survivor.id}]`);
        }
      }
      
      document.body.removeChild(overlay);
      // Refresh ALL card backs to update avatar grids across all open cards
      this._refreshAllCardBacks(mainContainer);
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
        if (stageId === 'mud-crawl') {
          this.assignedRoles.delete(stageId);
        } else {
          const assignment = this.assignedRoles.get(stageId);
          if (Array.isArray(assignment)) {
            const newAssignment = assignment.filter(id => id !== survivor.id);
            if (newAssignment.length > 0) {
              this.assignedRoles.set(stageId, newAssignment);
            } else {
              this.assignedRoles.delete(stageId);
            }
          } else {
            this.assignedRoles.delete(stageId);
          }
        }
        document.body.removeChild(overlay);
        // Refresh ALL card backs to update avatar grids across all open cards
        this._refreshAllCardBacks(mainContainer);
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
    const confirmButton = mainContainer.querySelector('#confirm-roles-button'); // Target the confirm button specifically
    const challengeStages = ['mud-crawl', 'untie-knots', 'bean-bag-toss', 'vertical-puzzle'];
    
    if (confirmButton) {
      // Check if all stages have the required number of assignments
      const allAssigned = challengeStages.every(stageId => {
        const assignment = this.assignedRoles.get(stageId);
        const maxAssignments = this._getMaxAssignmentsForStage(stageId);
        
        if (assignment && Array.isArray(assignment)) {
          const isValid = assignment.length === maxAssignments;
          console.log(`Stage ${stageId}: assigned ${assignment.length}, required ${maxAssignments}, valid: ${isValid}`);
          return isValid;
        }
        console.log(`Stage ${stageId}: no valid assignment found, assignment:`, assignment);
        return false;
      });
      
      console.log('All stages assigned:', allAssigned, 'Total assignments:', this.assignedRoles.size);
      confirmButton.style.opacity = allAssigned ? '1' : '0.5';
      confirmButton.style.pointerEvents = allAssigned ? 'auto' : 'none';
    } else {
      console.log('Confirm button not found in container');
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
  },

  _getMaxAssignmentsForStage(stageId) {
    const playerTribe = gameManager.getPlayerTribe();
    const tribeSize = playerTribe.members.length;
    
    if (stageId === 'mud-crawl') {
      return tribeSize; // All survivors
    }
    
    // Distribution rules for other three stages
    if (tribeSize >= 9) {
      return 3; // 3 on each
    } else if (tribeSize === 8) {
      return stageId === 'untie-knots' ? 2 : 3; // 2 on untie, 3 on others
    } else if (tribeSize === 7) {
      return stageId === 'untie-knots' ? 2 : 3; // 2 on untie, 3 on others  
    } else if (tribeSize === 6) {
      return 2; // 2 on each
    } else if (tribeSize === 5) {
      return stageId === 'untie-knots' ? 1 : 2; // 1 on untie, 2 on others
    } else if (tribeSize === 4) {
      return stageId === 'vertical-puzzle' ? 2 : 1; // 2 on puzzle, 1 on others
    } else if (tribeSize === 3) {
      return 1; // 1 on each
    } else if (tribeSize === 2) {
      return 1; // 1 survivor will need to be assigned twice
    }
    
    return 1; // Default fallback
  },

  _getHighlightedTraitsForStage(stageId) {
    // Based on the challenge stage requirements from the attached image
    const stageTraits = {
      'mud-crawl': ['strength', 'endurance', 'dexterity', 'balance'],
      'untie-knots': ['dexterity', 'puzzles', 'focus', 'endurance'],
      'bean-bag-toss': ['dexterity', 'focus', 'strength'],
      'vertical-puzzle': ['puzzles', 'memory', 'focus']
    };
    return stageTraits[stageId] || [];
  },

  _refreshAllCardBacks(mainContainer) {
    // Find all flipped cards (cards with rotateY(180deg)) and refresh their backs
    const allCards = mainContainer.querySelectorAll('.stage-card');
    allCards.forEach((card, index) => {
      const isFlipped = card.style.transform === 'rotateY(180deg)';
      if (isFlipped) {
        const cardBack = card.querySelector('.card-back');
        const stageId = this._getStageIdByIndex(index);
        if (cardBack && stageId) {
          this._updateCardBack(stageId, cardBack, mainContainer);
        }
      }
    });
  },

  _getStageIdByIndex(index) {
    const stages = ['mud-crawl', 'untie-knots', 'bean-bag-toss', 'vertical-puzzle'];
    return stages[index];
  },

  _assignRolesToSurvivors() {
    const playerTribe = gameManager.getPlayerTribe();
    
    // Clear existing roles for all tribe members
    playerTribe.members.forEach(survivor => {
      survivor.roles = [];
    });

    // Assign roles based on stage assignments
    for (const [stageId, assignedSurvivorIds] of this.assignedRoles) {
      const roleMap = {
        'mud-crawl': 'mud',
        'untie-knots': 'knots', 
        'bean-bag-toss': 'toss',
        'vertical-puzzle': 'puzzle'
      };
      
      const role = roleMap[stageId];
      if (role && Array.isArray(assignedSurvivorIds)) {
        assignedSurvivorIds.forEach(survivorId => {
          const survivor = playerTribe.members.find(s => s.id === survivorId);
          if (survivor) {
            survivor.roles.push(role);
          }
        });
      }
    }
  },

  _assignRolesToOpposingTribes() {
    // Use same logic as TribeFlagView - access tribes directly from gameManager
    const gameManagerTribes = gameManager.tribes || [];
    const playerSurvivor = gameManager.getPlayerSurvivor();
    const playerTribe = gameManagerTribes.find(t => 
      t.members && t.members.some(m => m.id === playerSurvivor?.id)
    );
    
    if (!gameManagerTribes || !playerTribe) {
      console.error('Could not find tribes for role assignment');
      return;
    }

    const opposingTribes = gameManagerTribes.filter(tribe => tribe.id !== playerTribe.id);
    console.log('Found opposing tribes:', opposingTribes.length);

    opposingTribes.forEach(tribe => {
      console.log(`Assigning roles to opposing tribe: ${tribe.tribeName || tribe.name} with ${tribe.members.length} members`);
      
      // Clear existing roles
      tribe.members.forEach(survivor => {
        survivor.roles = [];
      });

      // Get assignment counts from player tribe
      const assignmentCounts = {};
      for (const [stageId, assignedSurvivorIds] of this.assignedRoles) {
        if (stageId === 'mud-crawl') {
          assignmentCounts[stageId] = tribe.members.length; // All members for mud crawl
        } else {
          assignmentCounts[stageId] = Array.isArray(assignedSurvivorIds) ? assignedSurvivorIds.length : 0;
        }
      }

      console.log('Assignment counts for opposing tribe:', assignmentCounts);

      // Assign roles to opposing tribe members using trait-based logic
      const roleMap = {
        'mud-crawl': 'mud',
        'untie-knots': 'knots',
        'bean-bag-toss': 'toss', 
        'vertical-puzzle': 'puzzle'
      };

      // Start with mud crawl - assign all members
      tribe.members.forEach(survivor => {
        if (!survivor.roles) survivor.roles = [];
        survivor.roles.push('mud');
      });

      // Smart assignment for other roles based on traits
      const getTraitScore = (survivor, traits) => {
        return traits.reduce((sum, trait) => sum + (survivor[trait] || 0), 0);
      };

      // Define traits for each stage
      const stageTraits = {
        'untie-knots': ['dexterity', 'puzzles', 'focus', 'endurance'],
        'bean-bag-toss': ['dexterity', 'focus', 'strength'],
        'vertical-puzzle': ['puzzles', 'memory', 'focus']
      };

      // Assign other roles based on trait scores
      ['untie-knots', 'bean-bag-toss', 'vertical-puzzle'].forEach(stageId => {
        const count = assignmentCounts[stageId] || 0;
        const role = roleMap[stageId];
        const traits = stageTraits[stageId] || [];
        
        if (count > 0) {
          // Sort members by trait score for this stage (excluding those already assigned to non-mud roles)
          const availableMembers = tribe.members.filter(survivor => 
            !survivor.roles.some(r => r !== 'mud')
          );
          
          const sortedMembers = availableMembers
            .map(survivor => ({
              survivor,
              score: getTraitScore(survivor, traits)
            }))
            .sort((a, b) => b.score - a.score)
            .map(item => item.survivor);

          // Assign the top members for this role
          for (let i = 0; i < Math.min(count, sortedMembers.length); i++) {
            const survivor = sortedMembers[i];
            if (survivor && !survivor.roles.includes(role)) {
              survivor.roles.push(role);
              console.log(`Assigned ${survivor.firstName} to ${role} with trait score:`, getTraitScore(survivor, traits));
            }
          }
        }
      });

      console.log('Opposing tribe final assignments:', tribe.members.map(s => `${s.firstName}: ${s.roles}`));
    });
  },

  _showMatchupScreen(container) {
    clearChildren(container);

    // Set background
    container.style.backgroundImage = "url('Assets/Screens/challenge.png')";
    container.style.backgroundSize = 'cover';
    container.style.backgroundPosition = 'center';
    container.style.backgroundRepeat = 'no-repeat';

    const allTribes = gameManager.getTribes();
    const playerTribe = gameManager.getPlayerTribe();
    
    console.log('All tribes from gameManager:', allTribes);
    console.log('Player tribe from gameManager:', playerTribe);
    
    // Use same logic as TribeFlagView - access tribes directly from gameManager
    const gameManagerTribes = gameManager.tribes || [];
    const playerSurvivor = gameManager.getPlayerSurvivor();
    const playerTribeFromManager = gameManagerTribes.find(t => 
      t.members && t.members.some(m => m.id === playerSurvivor?.id)
    );
    
    // Debug the tribe structure
    console.log('GameManager tribe IDs:', gameManagerTribes.map(t => ({ id: t.id, name: t.tribeName || t.name })));
    console.log('Player tribe ID:', playerTribeFromManager?.id);
    
    const opposingTribes = gameManagerTribes.filter(tribe => {
      const isOpposing = tribe.id !== playerTribeFromManager?.id;
      console.log(`Tribe ${tribe.tribeName || tribe.name} (ID: ${tribe.id}) - isOpposing: ${isOpposing}`);
      return isOpposing;
    });
    const opposingTribe = opposingTribes.length > 0 ? opposingTribes[0] : null;

    console.log('GameManager tribes:', gameManagerTribes.length);
    console.log('Player tribe:', playerTribeFromManager?.tribeName || playerTribeFromManager?.name);
    console.log('Opposing tribes found:', opposingTribes.length);
    console.log('Opposing tribe:', opposingTribe?.tribeName || opposingTribe?.name);
    console.log('Player tribe members:', playerTribeFromManager?.members?.map(s => `${s.firstName}: roles=${s.roles}`));
    console.log('Opposing tribe members:', opposingTribe?.members?.map(s => `${s.firstName}: roles=${s.roles}`));

    // Main container for matchups
    const matchupsContainer = createElement('div', {
      style: `
        position: absolute;
        top: 10%;
        left: 50%;
        transform: translateX(-50%);
        width: 90%;
        max-width: 700px;
        height: 80%;
        overflow-y: auto;
        padding: 20px;
        z-index: 1;
      `
    });

    // Challenge stages data
    const stages = [
      { id: 'mud-crawl', name: 'Mud Crawl', role: 'mud', matchupImage: 'Assets/Challenge/matchup1.png' },
      { id: 'untie-knots', name: 'Untie Knots', role: 'knots', matchupImage: 'Assets/Challenge/matchup2.png' },
      { id: 'bean-bag-toss', name: 'Bean Bag Toss', role: 'toss', matchupImage: 'Assets/Challenge/matchup3.png' },
      { id: 'vertical-puzzle', name: 'Vertical Puzzle', role: 'puzzle', matchupImage: 'Assets/Challenge/matchup4.png' }
    ];

    stages.forEach((stage, index) => {
      console.log(`Creating stage ${index + 1}: ${stage.name} with role ${stage.role}`);
      
      const stageContainer = createElement('div', {
        style: `
          display: flex;
          flex-direction: column;
          align-items: center;
          margin-bottom: 30px;
        `
      });

      // Stage name
      const stageName = createElement('h3', {
        style: `
          color: white;
          font-family: 'Survivant', sans-serif;
          font-size: 1.4rem;
          text-align: center;
          text-shadow: 2px 2px 4px black;
          margin-bottom: 15px;
          margin-top: 0;
        `
      }, stage.name);

      // Matchup container with proper sizing
      const matchupContainer = createElement('div', {
        style: `
          position: relative;
          width: 100%;
          max-width: 500px;
          height: 100px;
          display: flex;
          align-items: center;
          justify-content: center;
        `
      });

      // Matchup background image
      const matchupBg = createElement('img', {
        src: stage.matchupImage,
        style: `
          width: 100%;
          height: 100%;
          object-fit: contain;
          display: block;
        `,
        onload: () => {
          console.log(`Matchup image loaded: ${stage.matchupImage}`);
        },
        onerror: () => {
          console.error(`Failed to load matchup image: ${stage.matchupImage}`);
        }
      });

      // Get survivors for this role
      const playerSurvivors = playerTribeFromManager.members.filter(s => s.roles && s.roles.includes(stage.role));
      const opposingSurvivors = opposingTribe ? opposingTribe.members.filter(s => s.roles && s.roles.includes(stage.role)) : [];

      console.log(`${stage.name} - Player survivors:`, playerSurvivors.map(s => s.firstName));
      console.log(`${stage.name} - Opposing survivors:`, opposingSurvivors.map(s => s.firstName));

      if (stage.id === 'mud-crawl') {
        // For mud crawl, show "Entire Tribe" text overlaid on the image
        const leftText = createElement('div', {
          style: `
            position: absolute;
            left: 20%;
            top: 50%;
            transform: translate(-50%, -50%);
            color: white;
            font-family: 'Survivant', sans-serif;
            font-size: 1rem;
            font-weight: bold;
            text-shadow: 2px 2px 4px black;
            text-align: center;
            z-index: 10;
            padding: 5px 10px;
            border-radius: 5px;
          `
        }, 'Entire Tribe');

        const rightText = createElement('div', {
          style: `
            position: absolute;
            right: 20%;
            top: 50%;
            transform: translate(50%, -50%);
            color: white;
            font-family: 'Survivant', sans-serif;
            font-size: 1rem;
            font-weight: bold;
            text-shadow: 2px 2px 4px black;
            text-align: center;
            z-index: 10;
            padding: 5px 10px;
            border-radius: 5px;
          `
        }, 'Entire Tribe');

        matchupContainer.appendChild(matchupBg);
        matchupContainer.appendChild(leftText);
        matchupContainer.appendChild(rightText);
      } else {
        // For other stages, show survivor avatars overlaid on the image
        const leftContainer = createElement('div', {
          style: `
            position: absolute;
            left: 20%;
            top: 50%;
            transform: translate(-50%, -50%);
            display: flex;
            flex-wrap: wrap;
            gap: 3px;
            max-width: 120px;
            justify-content: center;
            z-index: 10;
          `
        });

        const rightContainer = createElement('div', {
          style: `
            position: absolute;
            right: 20%;
            top: 50%;
            transform: translate(50%, -50%);
            display: flex;
            flex-wrap: wrap;
            gap: 3px;
            max-width: 120px;
            justify-content: center;
            z-index: 10;
          `
        });

        // Add player tribe survivors (left side)
        playerSurvivors.forEach(survivor => {
          const avatar = createElement('img', {
            src: survivor.avatarUrl || `Assets/Avatars/${survivor.firstName.toLowerCase()}.jpeg`,
            style: `
              width: 32px;
              height: 32px;
              border-radius: 50%;
              object-fit: cover;
              border: 2px solid ${this._getTribeColorHex(playerTribeFromManager.tribeColor || playerTribeFromManager.color)};
              background-color: white;
            `,
            onload: () => {
              console.log(`Player avatar loaded: ${survivor.firstName}`);
            },
            onerror: () => {
              console.error(`Failed to load player avatar: ${survivor.firstName}`);
            }
          });
          leftContainer.appendChild(avatar);
        });

        // Add opposing tribe survivors (right side)
        opposingSurvivors.forEach(survivor => {
          const avatar = createElement('img', {
            src: survivor.avatarUrl || `Assets/Avatars/${survivor.firstName.toLowerCase()}.jpeg`,
            style: `
              width: 32px;
              height: 32px;
              border-radius: 50%;
              object-fit: cover;
              border: 2px solid ${this._getTribeColorHex(opposingTribe.tribeColor || opposingTribe.color)};
              background-color: white;
            `,
            onload: () => {
              console.log(`Opposing avatar loaded: ${survivor.firstName}`);
            },
            onerror: () => {
              console.error(`Failed to load opposing avatar: ${survivor.firstName}`);
            }
          });
          rightContainer.appendChild(avatar);
        });

        matchupContainer.appendChild(matchupBg);
        matchupContainer.appendChild(leftContainer);
        matchupContainer.appendChild(rightContainer);
      }

      stageContainer.appendChild(stageName);
      stageContainer.appendChild(matchupContainer);
      matchupsContainer.appendChild(stageContainer);
    });

    container.appendChild(matchupsContainer);

    // Survivors Ready button
    const readyButton = createElement('button', {
      style: `
        position: absolute;
        bottom: 40px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 2;
        width: 150px;
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
      `,
      onclick: () => {
        console.log('Survivors Ready button clicked');
        if (this.onComplete && typeof this.onComplete === 'function') {
          this.onComplete();
        }
      }
    }, 'Survivors Ready?');

    container.appendChild(readyButton);
  },

  _getTribeColorHex(colorName) {
    const colorMap = {
      'red': '#FF0000',
      'blue': '#0000FF', 
      'orange': '#FFA500',
      'purple': '#800080',
      'green': '#008000'
    };
    return colorMap[colorName] || '#FFFFFF';
  }
};

export default RoleView;
