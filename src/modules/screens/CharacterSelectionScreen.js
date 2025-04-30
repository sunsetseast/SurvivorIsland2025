/**
 * @module CharacterSelectionScreen
 * Character selection screen for the game (ES6+ class version)
 */

import { getElement, createElement, clearChildren } from '../utils/index.js';
import { gameManager, eventManager } from '../core/index.js';
import { GameEvents } from '../core/EventManager.js';
import gameData from '../data/index.js';
import { setupScrollReveal } from '../utils/ScrollReveal.js'; // Correct import at top

export default class CharacterSelectionScreen {
  constructor() {
    this.selectedCharacter = null;
    this.availableSurvivors = [];
    this.activeFilter = 'all';
  }

  initialize() {
    console.log('CharacterSelectionScreen initialized');
  }

  setup(data = {}) {
    this._addDebugBanner('CharacterSelectionScreen setup triggered!', 'blue', 40);
    const characterSelectionScreen = getElement('character-selection-screen');
    this._addDebugBanner(characterSelectionScreen ? 'Element FOUND!' : 'Element NOT found!', characterSelectionScreen ? 'green' : 'red', 130);
    if (!characterSelectionScreen) return;

    // --- Switch screens properly ---
    document.querySelectorAll('.game-screen').forEach(screen => screen.classList.remove('active'));
    characterSelectionScreen.classList.add('active');
    // --- End Switch ---

    clearChildren(characterSelectionScreen);
    this.selectedCharacter = null;

    this._addDebugBanner('Attempting GameData.getSurvivors()...', 'orange', 70);
    try {
      const survivors = gameData.getSurvivors();
      this.availableSurvivors = Array.isArray(survivors) ? [...survivors] : [];
      this._addDebugBanner(`Loaded ${this.availableSurvivors.length} survivors`, 'green', 100);
    } catch (e) {
      this._addDebugBanner('Error accessing GameData: ' + e.message, 'red', 100);
      return;
    }

    // --- Survivor scrollable area ---
    const survivorArea = createElement('div', { id: 'survivor-stack' });
    const cardWrapper = createElement('div', { className: 'card-wrapper' });

    this.availableSurvivors.forEach((survivor, index) => {
      const card = this._createSurvivorCard(survivor, index);
      cardWrapper.appendChild(card);
    });

    survivorArea.appendChild(cardWrapper);

    // --- Fixed button row ---
    const buttonRow = createElement('div', { className: 'button-row' });

    const backButton = createElement('button', {
      id: 'back-button',
      onclick: () => gameManager.setGameState('welcome')
    }, 'Back');

    const continueButton = createElement('button', {
      id: 'continue-button',
      disabled: true,
      onclick: () => {
        if (this.selectedCharacter) {
          gameManager.selectCharacter(this.selectedCharacter);
        }
      }
    }, 'Continue');

    const filterButton = createElement('button', {
      id: 'filter-button',
      onclick: () => this._toggleFilterOptions()
    }, 'Filter');

    buttonRow.appendChild(backButton);
    buttonRow.appendChild(continueButton);
    buttonRow.appendChild(filterButton);

    // --- Filter options ---
    const filterOptions = createElement('div', { id: 'filter-options', className: 'hidden filter-options' });
    ['all', 'male', 'female', 'physical', 'mental', 'social'].forEach(type => {
      const optionBtn = createElement('button', {
        onclick: () => this._applyFilter(type)
      }, type.charAt(0).toUpperCase() + type.slice(1));
      filterOptions.appendChild(optionBtn);
    });

    // --- Assemble ---
    characterSelectionScreen.appendChild(survivorArea); // Scrollable cards
    characterSelectionScreen.appendChild(buttonRow);    // Fixed buttons
    characterSelectionScreen.appendChild(filterOptions);

    setupScrollReveal(); // AFTER cards are inserted

    eventManager.publish(GameEvents.SCREEN_CHANGED, {
      screenId: 'characterSelection',
      data
    });
  }

  _createSurvivorCard(survivor, index) {
    const card = createElement('div', {
      className: 'survivor-card',
      dataset: { id: survivor.id }
    });

    const cardFront = createElement('div', { className: 'card-front' });
    const name = createElement('h3', { className: 'survivor-header' }, survivor.name);

    const stat = (label, value) => {
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
    };

    const stats = [
      stat('Health', survivor.health || 10),
      stat('Strength', survivor.physical || 0),
      stat('Mental', survivor.mental || 0),
      stat('Social', survivor.personality || 0),
      stat('Luck', survivor.luck || 0),
    ];

    const moreInfoBtn = createElement('button', { className: 'more-info-button' }, 'More Info');
    const chooseBtn = createElement('button', { className: 'choose-button' }, 'Choose Survivor');

    cardFront.appendChild(name);
    stats.forEach(s => cardFront.appendChild(s));
    cardFront.appendChild(moreInfoBtn);
    cardFront.appendChild(chooseBtn);

    const cardBack = createElement('div', { className: 'card-back' });
    const infoText = createElement('p', {}, `Season: ${survivor.season || 'Unknown'}, Archetype: ${survivor.archetype || 'Unknown'}`);
    const backBtn = createElement('button', { className: 'back-to-front' }, 'Back');

    cardBack.appendChild(infoText);
    cardBack.appendChild(backBtn);

    card.appendChild(cardFront);
    card.appendChild(cardBack);

    moreInfoBtn.addEventListener('click', () => card.classList.add('flipped'));
    backBtn.addEventListener('click', () => card.classList.remove('flipped'));

    chooseBtn.addEventListener('click', () => {
      const allCards = document.querySelectorAll('.survivor-card');
      allCards.forEach(c => c.classList.remove('selected'));

      card.classList.add('selected');
      this.selectedCharacter = survivor;

      const continueButton = document.getElementById('continue-button');
      if (continueButton) {
        continueButton.disabled = false;
      }
    });

    return card;
  }

  _selectCharacter(survivor, cardElement) {
    this.selectedCharacter = survivor;

    const allCards = document.querySelectorAll('.survivor-card');
    allCards.forEach(card => card.classList.remove('selected'));

    cardElement.classList.add('selected');

    const continueButton = getElement('continue-button');
    if (continueButton) continueButton.disabled = false;
  }

  _applyFilter(type) {
    this.activeFilter = type;
    const survivors = document.querySelectorAll('.survivor-card');

    survivors.forEach(card => {
      const survivor = this.availableSurvivors.find(s => s.id == card.dataset.id);
      if (!survivor) return;

      let matches = true;
      if (type === 'male') matches = survivor.gender === 'male';
      else if (type === 'female') matches = survivor.gender === 'female';
      else if (type === 'physical') matches = survivor.physical >= 7;
      else if (type === 'mental') matches = survivor.mental >= 7;
      else if (type === 'social') matches = survivor.personality >= 7;

      card.style.display = (type === 'all' || matches) ? 'block' : 'none';
    });

    this._toggleFilterOptions(true);
  }

  _toggleFilterOptions(forceHide = false) {
    const filterOptions = getElement('filter-options');
    if (!filterOptions) return;
    if (forceHide) {
      filterOptions.classList.add('hidden');
    } else {
      filterOptions.classList.toggle('hidden');
    }
  }

  _addDebugBanner(text, bgColor, top) {
    const banner = document.createElement('div');
    banner.textContent = text;
    banner.style.position = 'fixed';
    banner.style.top = `${top}px`;
    banner.style.left = '0';
    banner.style.backgroundColor = bgColor;
    banner.style.color = 'white';
    banner.style.padding = '5px 10px';
    banner.style.zIndex = '9999';
    document.body.appendChild(banner);
  }

  teardown() {
    console.log('CharacterSelectionScreen teardown');
    this.selectedCharacter = null;
  }
}