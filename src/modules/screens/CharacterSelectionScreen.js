/**
 * @module CharacterSelectionScreen
 * Character selection screen for the game (ES6+ class version)
 */

import { getElement, createElement, clearChildren } from '../utils/index.js';
import { gameManager, eventManager } from '../core/index.js';
import { GameEvents } from '../core/EventManager.js';
import { GameData } from '../data/index.js';

export default class CharacterSelectionScreen {
  constructor() {
    this.selectedCharacter = null;
    this.availableSurvivors = [];
  }

  initialize() {
    console.log('CharacterSelectionScreen initialized');
  }

  setup(data = {}) {
    const characterSelectionScreen = getElement('character-selection-screen');
    if (!characterSelectionScreen) {
      console.error('Character selection screen element not found');
      return;
    }

    clearChildren(characterSelectionScreen);
    this.selectedCharacter = null;
    this.availableSurvivors = [...GameData.getSurvivors()];

    const title = createElement('h1', { className: 'screen-title' }, 'Choose Your Character');
    const subtitle = createElement('p', { className: 'screen-subtitle' }, 'Select the survivor that will represent you in the game');

    const searchInput = createElement('input', {
      id: 'character-search',
      placeholder: 'Search by name...',
      oninput: (e) => this._filterSurvivors(e.target.value, filterSelect.value)
    });

    const filterSelect = createElement('select', {
      id: 'character-filter',
      onchange: (e) => this._filterSurvivors(searchInput.value, e.target.value)
    });

    ['all', 'male', 'female', 'physical', 'mental', 'social'].forEach(value => {
      const option = createElement('option', { value }, value[0].toUpperCase() + value.slice(1));
      filterSelect.appendChild(option);
    });

    const randomButton = createElement('button', {
      onclick: () => this._selectRandomCharacter()
    }, 'Random');

    const filterControls = createElement('div', {}, [searchInput, filterSelect, randomButton]);

    const charactersGrid = createElement('div', { className: 'characters-grid' });
    this.charactersGrid = charactersGrid;

    this.availableSurvivors.forEach(survivor => {
      const card = this._createCharacterCard(survivor);
      charactersGrid.appendChild(card);
    });

    const confirmButton = createElement('button', {
      id: 'confirm-character-button',
      disabled: true,
      onclick: () => {
        if (this.selectedCharacter) {
          gameManager.selectCharacter(this.selectedCharacter);
        }
      }
    }, 'Confirm');

    const backButton = createElement('button', {
      onclick: () => gameManager.setGameState('welcome')
    }, 'Back');

    const buttons = createElement('div', {}, [backButton, confirmButton]);

    characterSelectionScreen.appendChild(title);
    characterSelectionScreen.appendChild(subtitle);
    characterSelectionScreen.appendChild(filterControls);
    characterSelectionScreen.appendChild(charactersGrid);
    characterSelectionScreen.appendChild(buttons);

    eventManager.publish(GameEvents.SCREEN_CHANGED, {
      screenId: 'characterSelection',
      data
    });
  }

  _createCharacterCard(survivor) {
    const card = createElement('div', {
      className: 'character-card',
      dataset: { id: survivor.id, gender: survivor.gender },
      onclick: () => this._selectCharacter(survivor)
    }, survivor.name);

    return card;
  }

  _selectCharacter(survivor) {
    this.selectedCharacter = survivor;

    document.querySelectorAll('.character-card').forEach(card => {
      card.classList.remove('selected');
      if (parseInt(card.dataset.id) === survivor.id) {
        card.classList.add('selected');
      }
    });

    const confirmButton = getElement('confirm-character-button');
    if (confirmButton) {
      confirmButton.disabled = false;
    }
  }

  _filterSurvivors(searchTerm, filter) {
    const cards = document.querySelectorAll('.character-card');

    searchTerm = searchTerm.toLowerCase().trim();

    cards.forEach(card => {
      const survivor = this.availableSurvivors.find(s => s.id == card.dataset.id);
      if (!survivor) return;

      const matchesSearch = survivor.name.toLowerCase().includes(searchTerm);
      let matchesFilter = true;

      if (filter !== 'all') {
        matchesFilter =
          (filter === 'male' && survivor.gender === 'male') ||
          (filter === 'female' && survivor.gender === 'female') ||
          (filter === 'physical' && survivor.physical >= 7) ||
          (filter === 'mental' && survivor.mental >= 7) ||
          (filter === 'social' && survivor.personality >= 7);
      }

      card.style.display = matchesSearch && matchesFilter ? 'block' : 'none';
    });
  }

  _selectRandomCharacter() {
    const visibleCards = Array.from(document.querySelectorAll('.character-card')).filter(
      (card) => card.style.display !== 'none'
    );

    if (visibleCards.length === 0) return;

    const randomCard = visibleCards[Math.floor(Math.random() * visibleCards.length)];
    const survivorId = parseInt(randomCard.dataset.id, 10);
    const survivor = this.availableSurvivors.find(s => s.id === survivorId);

    if (survivor) {
      this._selectCharacter(survivor);
      randomCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  teardown() {
    console.log('CharacterSelectionScreen teardown');
    this.selectedCharacter = null;
  }
}