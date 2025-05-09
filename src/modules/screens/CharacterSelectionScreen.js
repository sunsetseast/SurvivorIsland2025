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
      if (!filterOptions || filterOptions.classList.contains('hidden')) return;

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
      this.availableSurvivors = Array.isArray(survivors) ? [...survivors] : [];
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
        if (this.selectedCharacter) {
          gameManager.selectCharacter(this.selectedCharacter);
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

    const card = createElement('div', {
      className: 'survivor-card',
      dataset: { id: survivor.id }
    });

    // FRONT
    const cardFront = createElement('div', { className: 'card-front' });
    const name = createElement('h3', { className: 'survivor-header' });
    name.innerHTML = `${survivor.firstName}<br>${survivor.lastName}`;

    const moreInfoButton = createElement('button', { className: 'card-button' }, 'More Info');
    const chooseButton = createElement('button', { className: 'card-button' }, 'Choose Survivor');
    chooseButton.style.transition = 'opacity 0.3s ease';

    const buttonContainer = createElement('div', { className: 'card-buttons' });
    buttonContainer.appendChild(moreInfoButton);
    buttonContainer.appendChild(chooseButton);
    cardFront.appendChild(name);
    cardFront.appendChild(buttonContainer);

    // BACK
    const cardBack = createElement('div', {
      className: 'card-back',
      style: `background-image: url('Assets/card-back-${survivor.traitClass.toLowerCase()}.png');`
    });

    const nameBox = createElement('div', { className: 'name-box' });
    nameBox.innerHTML = `<strong>${survivor.firstName}<br>${survivor.lastName}</strong><br><small>${survivor.season || 'Unknown'}</small>`;

    const gameplayStyleBox = createElement('div', {
      className: `gameplay-style-box${['Lethal Charmer', 'Shadow Strategist'].includes(survivor.gameplayStyle) ? ' small-text' : ''}`
    }, survivor.gameplayStyle || 'Unknown');

    const traitBox = createElement('div', {
      className: `trait-values ${survivor.traitClass.toLowerCase()}-layout`
    });
    traitBox.innerHTML = `
      <div class="trait-row physical-value">${survivor.physical || 0}</div>
      <div class="trait-row mental-value">${survivor.mental || 0}</div>
      <div class="trait-row social-value">${survivor.social || 0}</div>
    `;

    const buttonWrap = createElement('div', { className: 'card-buttons-back' });

    const backButton = createElement('button', {
      className: 'rect-button',
    }, 'Back');

    const moreTraitsButton = createElement('button', {
      className: 'rect-button'
    }, 'Traits');

    buttonWrap.appendChild(backButton);
    buttonWrap.appendChild(moreTraitsButton);

    cardBack.appendChild(nameBox);
    cardBack.appendChild(gameplayStyleBox);
    cardBack.appendChild(traitBox);
    cardBack.appendChild(buttonWrap);

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
      allCards.forEach(c => c.classList.remove('selected'));

      if (isSelected) {
        this.selectedCharacter = null;
        this._fadeButtonText(chooseButton, 'Choose Survivor');
        document.getElementById('continue-button').disabled = true;
      } else {
        card.classList.add('selected');
        this.selectedCharacter = survivor;
        this._fadeButtonText(chooseButton, 'Unselect Survivor');
        document.getElementById('continue-button').disabled = false;
      }
    });

    // Placeholder for future More Traits functionality
    moreTraitsButton.addEventListener('click', () => {
      console.log(`Show more traits for ${survivor.firstName}`);
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
    button.style.opacity = '0';
    setTimeout(() => {
      button.textContent = newText;
      button.style.opacity = '1';
    }, 200);
  }

  _applyFilter(type) {
    if (type === 'all') {
      this.genderFilter = null;
      this.traitClassFilter = null;
    } else if (['male', 'female'].includes(type)) {
      this.genderFilter = type;
    } else if (['physical', 'mental', 'social'].includes(type)) {
      this.traitClassFilter = type;
    }
    
    this._applyFilters();
    
    // Update button states
    const filterOptions = document.querySelectorAll('#filter-options button');
    filterOptions.forEach(button => {
      const buttonType = button.textContent.toLowerCase();
      const isActive = this._isFilterActive(buttonType);
      button.classList.toggle('active', isActive);
    });
  }

  _toggleFilterOptions(forceHide = false) {
    const filterOptions = getElement('filter-options');
    const filterButton = getElement('filter-button');
    if (!filterOptions || !filterButton) return;

    if (forceHide) {
      filterOptions.classList.add('hidden');
      filterButton.classList.remove('active-filter');
    } else {
      const nowHidden = filterOptions.classList.toggle('hidden');
      filterButton.classList.toggle('active-filter', !nowHidden);
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