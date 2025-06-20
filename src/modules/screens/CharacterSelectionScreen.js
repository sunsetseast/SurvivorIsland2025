  /**
   * @module CharacterSelectionScreen
   * Character selection screen for the game (ES6+ class version)
   */

  import { getElement, createElement, clearChildren } from '../utils/index.js';
  import { gameManager, eventManager } from '../core/index.js';
  import { GameEvents } from '../core/EventManager.js';
  import gameData from '../data/index.js';
  import { setupScrollReveal } from '../utils/ScrollReveal.js';

  export default class CharacterSelectionScreen {
    constructor() {
      this.selectedCharacter = null;
      this.availableSurvivors = [];
      this.genderFilter = null;
      this.traitClassFilter = null;
    }

    initialize() {
      console.log('CharacterSelectionScreen initialized');
      document.addEventListener('click', (e) => {
        const filterOptions = getElement('filter-options');
        const filterButton = getElement('filter-button');
        
        // Only execute if elements exist (we're on character selection screen)
        if (!filterOptions || !filterButton) return;
        
        filterButton.classList.add('rect-button');

        // Delay checking for outside click until after button logic
        setTimeout(() => {
          if (!filterOptions.contains(e.target) && e.target !== filterButton) {
            this._toggleFilterOptions(true);
          }
        }, 0);
      });
    }

    setup(data = {}) {
      const characterSelectionScreen = getElement('character-selection-screen');
      const gameContainer = getElement('game-container');
      if (!characterSelectionScreen || !gameContainer) return;

      gameContainer.style.backgroundImage = "url('Assets/jungle1.png')";
      gameContainer.style.backgroundSize = 'cover';
      gameContainer.style.backgroundPosition = 'center';
      gameContainer.style.backgroundRepeat = 'no-repeat';

      document.querySelectorAll('.game-screen').forEach(screen => screen.classList.remove('active'));
      characterSelectionScreen.classList.add('active');

      clearChildren(characterSelectionScreen);
      this.selectedCharacter = null;

      try {
        const survivors = gameData.getSurvivors();
        this.availableSurvivors = Array.isArray(survivors)
        ? [...survivors].sort(() => Math.random() - 0.5)
        : [];
      } catch (e) {
        return;
      }

      const survivorArea = createElement('div', { id: 'survivor-stack' });
      this.availableSurvivors.forEach((survivor, index) => {
        const card = this._createSurvivorCard(survivor, index);
        survivorArea.appendChild(card);
      });

      const filterOptions = createElement('div', { id: 'filter-options', className: 'hidden filter-options' });
      ['all', 'male', 'female', 'physical', 'mental', 'social'].forEach(type => {
        const optionBtn = createElement('button', {
          onclick: () => this._applyFilter(type)
        }, type.charAt(0).toUpperCase() + type.slice(1));
        filterOptions.appendChild(optionBtn);
      });

      const buttonRow = createElement('div', { className: 'button-row', id: 'character-selection-buttons' });

      const backButton = createElement('button', {
        id: 'back-button',
        className: 'rect-button',
        onclick: () => gameManager.setGameState('welcome')
      }, 'Back');

      const continueButton = createElement('button', {
        id: 'continue-button',
        className: 'rect-button',
        disabled: true,
        onclick: () => {
          // Ensure gameManager.survivors is initialized BEFORE selecting character
          gameManager.survivors = [...gameData.getSurvivors()];
          const selectedCard = document.querySelector('.survivor-card.selected');
          if (selectedCard) {
            const selectedId = selectedCard.dataset.id;
            const selectedSurvivor = gameManager.survivors.find(s => s.id.toString() === selectedId);
            if (selectedSurvivor) {
              this.selectedCharacter = selectedSurvivor; // now properly from gameManager.survivors
              gameManager.selectCharacter(this.selectedCharacter);
            
            }
          }
        }
      }, 'Continue');

      const filterButton = createElement('button', {
        id: 'filter-button',
        className: 'rect-button',
        onclick: () => this._toggleFilterOptions()
      }, 'Filter');

      buttonRow.appendChild(backButton);
      buttonRow.appendChild(continueButton);
      buttonRow.appendChild(filterButton);

      characterSelectionScreen.appendChild(survivorArea);
      gameContainer.appendChild(filterOptions);
      gameContainer.appendChild(buttonRow);

      setupScrollReveal();

      eventManager.publish(GameEvents.SCREEN_CHANGED, {
        screenId: 'characterSelection',
        data
      });
    }

  _createSurvivorCard(survivor, index) {
    const cardWrapper = createElement('div', { className: 'card-wrapper' });

    const avatarFrame = createElement('div', { className: 'avatar-frame' });
    const avatarImg = createElement('img', {
      src: survivor.avatarUrl || 'Assets/Avatars/default.jpeg',
      alt: `${survivor.firstName}'s avatar`
    });
    avatarFrame.appendChild(avatarImg);
    cardWrapper.appendChild(avatarFrame);

    const card = createElement('div', { className: 'survivor-card' });
    card.dataset.id = survivor.id;

    // FRONT
    const cardFront = createElement('div', { className: 'card-front' });
    const name = createElement('h3', { className: 'survivor-header' });
    name.innerHTML = `${survivor.firstName}<br>${survivor.lastName}`;

    const moreInfoButton = createElement('button', { className: 'card-button' }, 'More Info');
    const chooseButton = createElement('button', { className: 'card-button choose-button' });
    const textSpan = createElement('span', { className: 'button-text' }, 'Choose Survivor');
    chooseButton.appendChild(textSpan);
    chooseButton.style.transition = 'opacity 0.3s ease';

    const buttonContainer = createElement('div', { className: 'card-buttons' });
    buttonContainer.appendChild(moreInfoButton);
    buttonContainer.appendChild(chooseButton);
    cardFront.appendChild(name);
    cardFront.appendChild(buttonContainer);

    // BACK
    const cardBack = createElement('div', { className: 'card-back' });
    cardBack.style.backgroundImage = `url('Assets/card-back-${survivor.traitClass.toLowerCase()}.png')`;

    const nameBox = createElement('div', { className: 'name-box' });
    nameBox.innerHTML = `<strong>${survivor.firstName}<br>${survivor.lastName}</strong><br><small>${survivor.season || 'Unknown'}</small>`;

    const gameplayStyleBox = createElement('div', {
      className: `gameplay-style-box${['Lethal Charmer', 'Shadow Strategist'].includes(survivor.gameplayStyle) ? ' small-text' : ''}`
    }, survivor.gameplayStyle || 'Unknown');

    const traitBox = createElement('div', {
      className: `trait-values ${survivor.traitClass.toLowerCase()}-layout`
    });
    traitBox.innerHTML = `
      <div class="trait-row physical-value">${survivor.physical}</div>
      <div class="trait-row mental-value">${survivor.mental}</div>
      <div class="trait-row social-value">${survivor.social}</div>
    `;

    const buttonWrap = createElement('div', { className: 'card-buttons-back' });
    const backButton = createElement('button', { className: 'rect-button' }, 'Back');
    const moreTraitsButton = createElement('button', { className: 'rect-button' }, 'Traits');
    buttonWrap.appendChild(backButton);
    buttonWrap.appendChild(moreTraitsButton);

    cardBack.appendChild(nameBox);
    cardBack.appendChild(gameplayStyleBox);
    cardBack.appendChild(traitBox);
    cardBack.appendChild(buttonWrap);

    // TRAIT CARD OVERLAY
    const traitCardOverlay = createElement('div', { className: 'trait-card-overlay hidden' });
    const traitCardWrapper = createElement('div', { className: 'trait-card-wrapper' });
    traitCardOverlay.appendChild(traitCardWrapper);

    const traitCardBg = createElement('img', { className: 'trait-card-bg' });
    traitCardBg.src = 'Assets/card-back-traits.png';
    traitCardWrapper.appendChild(traitCardBg);

    const traitCoordinates = {
      physical: [75, 141],
      mental: [168, 141],
      social: [261, 141],
      strength: [75, 201],
      memory: [168, 201],
      connections: [261, 201],
      speed: [75, 266],
      puzzles: [168, 266],
      likeability: [261, 266],
      endurance: [75, 328],
      fortitude: [168, 328],
      interrogation: [261, 328],
      dexterity: [75, 392],
      awareness: [168, 392],
      deception: [261, 392],
      balance: [75, 457],
      focus: [168, 457],
      alliances: [261, 457]
    };

    Object.entries(traitCoordinates).forEach(([key, [x, y]]) => {
      const value = survivor[key];
      const el = createElement('div', {
        className: 'trait-element',
        style: `left: ${x}px; top: ${y}px;`
      }, value?.toString() ?? '?');
      traitCardWrapper.appendChild(el);
    });

    const closeTraitCardButton = createElement('button', {
      className: 'rect-button small close-trait-card'
    }, 'Back');
    closeTraitCardButton.style.position = 'absolute';
    closeTraitCardButton.style.left = '50%';
    closeTraitCardButton.style.bottom = '30px';
    closeTraitCardButton.style.transform = 'translateX(-50%)';
    closeTraitCardButton.style.zIndex = '5';

    closeTraitCardButton.addEventListener('click', () => {
      traitCardOverlay.classList.add('hidden');
    });

    traitCardWrapper.appendChild(closeTraitCardButton);
    cardBack.appendChild(traitCardOverlay);

    moreTraitsButton.addEventListener('click', () => {
      traitCardOverlay.classList.remove('hidden');
    });

    // Combine front/back
    card.appendChild(cardFront);
    card.appendChild(cardBack);
    cardWrapper.appendChild(card);

    // Flip logic
    moreInfoButton.addEventListener('click', () => cardWrapper.classList.toggle('flipped'));
    backButton.addEventListener('click', () => cardWrapper.classList.remove('flipped'));

    // Choose logic
    chooseButton.addEventListener('click', () => {
      const isSelected = card.classList.contains('selected');
      const allCards = document.querySelectorAll('.survivor-card');
      const allButtons = document.querySelectorAll('.choose-button');

      allCards.forEach(c => c.classList.remove('selected'));
      allButtons.forEach(btn => btn.classList.remove('glow-gold'));

      const textSpan = chooseButton.querySelector('.button-text');

      if (isSelected) {
        this.selectedCharacter = null;
        if (textSpan) {
          textSpan.textContent = 'Choose Survivor';
          // Explicitly reapply rect-button styles
          chooseButton.style.backgroundImage = 'url(\'Assets/rect-button.png\')';
          chooseButton.style.backgroundSize = '100% 100%';
          chooseButton.style.backgroundRepeat = 'no-repeat';
          chooseButton.style.backgroundPosition = 'center';
        }
        chooseButton.classList.remove('glow-gold');
        document.getElementById('continue-button').disabled = true;
      } else {
        card.classList.add('selected');
        this.selectedCharacter = survivor;
        if (textSpan) {
          textSpan.textContent = 'Unselect Survivor';
        }
        chooseButton.classList.add('glow-gold');
        document.getElementById('continue-button').disabled = false;
      }
    });

    return cardWrapper;
  }

  _stat(label, value) {
    const statLine = createElement('div', { className: 'stat-line' });
    const labelEl = createElement('span', {}, label);
    const bar = createElement('div', { className: 'stat-bar' });
    const fill = createElement('div', {
      className: 'stat-bar-fill',
      style: `width: ${Math.min(value * 10, 100)}%`
    });
    bar.appendChild(fill);
    statLine.appendChild(labelEl);
    statLine.appendChild(bar);
    return statLine;
  }

  _fadeButtonText(button, newText) {
    const textSpan = button.querySelector('.button-text');
    if (!textSpan) return;

    textSpan.style.transition = 'opacity 0.2s ease';
    textSpan.style.opacity = '0';

    setTimeout(() => {
      textSpan.textContent = newText;
      textSpan.style.opacity = '1';
    }, 200);
  }

  _isFilterActive(type) {
    if (type === 'all') {
      return !this.genderFilter && !this.traitClassFilter;
    }
    return type === this.genderFilter || type === this.traitClassFilter;
  }

  _applyFilter(type) {
    if (type === 'all') {
      this.genderFilter = null;
      this.traitClassFilter = null;
      this._toggleFilterOptions(true); // Close popup when selecting "all"
    } else if (['male', 'female'].includes(type)) {
      this.genderFilter = this.genderFilter === type ? null : type;
    } else if (['physical', 'mental', 'social'].includes(type)) {
      this.traitClassFilter = this.traitClassFilter === type ? null : type;
    }

    this._applyFilters();

    // Update button states
    const filterOptions = document.querySelectorAll('#filter-options button');
    filterOptions.forEach(button => {
      const buttonType = button.textContent.toLowerCase();
      const isActive = this._isFilterActive(buttonType);
      button.classList.toggle('active', isActive);
    });

    // Update filter button state
    const filterButton = document.getElementById('filter-button');
    if (filterButton) {
      const isAnyFilterActive = this.genderFilter || this.traitClassFilter;
      filterButton.classList.toggle('active-filter', isAnyFilterActive);
      if (isAnyFilterActive) {
        filterButton.style.border = '2px solid gold';
      } else {
        filterButton.style.border = '';
      }
    }
  }

  _toggleFilterOptions(forceHide = false) {
    const filterOptions = getElement('filter-options');
    const filterButton = getElement('filter-button');
    if (!filterOptions || !filterButton) return;

    if (forceHide) {
      filterOptions.classList.add('hidden');

      // Check if actual filters are active
      const isAnyFilterActive = this.genderFilter || this.traitClassFilter;
      filterButton.classList.toggle('active-filter', !!isAnyFilterActive);
    } else {
      const nowHidden = filterOptions.classList.toggle('hidden');

      // Make button look active while popup is visible, regardless of filters
      filterButton.classList.add('active-filter');
    }
  }


  _applyFilters() {
    const wrappers = document.querySelectorAll('.card-wrapper');
    wrappers.forEach(wrapper => {
      const card = wrapper.querySelector('.survivor-card');
      const id = card?.dataset.id;
      const survivor = this.availableSurvivors.find(s => s.id == id);
      if (!survivor) return;

      const matchesGender = !this.genderFilter || survivor.gender === this.genderFilter;
      const matchesTrait = !this.traitClassFilter || survivor.traitClass?.toLowerCase() === this.traitClassFilter;

      wrapper.style.display = matchesGender && matchesTrait ? 'block' : 'none';
    });

    // Keep Filter button highlighted if filters are active
    const filterButton = getElement('filter-button');
    if (filterButton) {
      const isActive = this.genderFilter || this.traitClassFilter;
      filterButton.classList.toggle('active-filter', !!isActive);
    }
  }

  teardown() {
    console.log('CharacterSelectionScreen teardown');
    this.selectedCharacter = null;

    const gameContainer = getElement('game-container');
    if (gameContainer) {
      gameContainer.style.backgroundImage = '';
      gameContainer.style.backgroundSize = '';
      gameContainer.style.backgroundPosition = '';
      gameContainer.style.backgroundRepeat = '';
    }

    const buttonRow = getElement('character-selection-buttons');
    if (buttonRow) buttonRow.remove();

    const filterOptions = getElement('filter-options');
    if (filterOptions) filterOptions.remove();
  }
}