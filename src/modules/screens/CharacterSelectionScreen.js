/**
 * @module CharacterSelectionScreen
 * Character selection screen for the game (refactored, with flip scroll-guard)
 */

import { getElement, createElement, clearChildren } from '../utils/index.js';
import { gameManager, eventManager } from '../core/index.js';
import { GameEvents } from '../core/EventManager.js';
import gameData from '../data/index.js';
import { createSurvivorCard } from '../ui/SurvivorCardFactory.js';
import { shuffleArray } from '../utils/CommonUtils.js';

export default class CharacterSelectionScreen {
  constructor() {
    // state
    this.selectedCharacter = null;
    this.availableSurvivors = [];
    this.genderFilter = null;
    this.traitClassFilter = null;

    // DOM refs
    this.screenEl = null;
    this.containerEl = null;   // #game-container
    this.stackEl = null;       // #survivor-stack
    this.scrollHintEl = null;
    this._stackScrollHandler = null;
    this._scrollHintTimer = null;

    // scroll guard state
    this._savedScrollTop = 0;
    this._unlockTimer = null;
    this._touchBlocker = null;
    this._keyBlocker = null;

    // filter menu listeners
    this._outsideClickHandler = null;
    this._escapeKeyHandler = null;
  }

  initialize() {
    // no-op; filter listeners are managed when the menu opens/closes
  }

  // ---------- Public lifecycle ----------

  setup(data = {}) {
    this.screenEl = getElement('character-selection-screen');
    this.containerEl = getElement('game-container');
    if (!this.screenEl || !this.containerEl) return;

    // Background
    this._applyBackground();

    // Activate screen
    document.querySelectorAll('.game-screen').forEach(s => s.classList.remove('active'));
    this.screenEl.classList.add('active');

    // Reset & load survivors
    clearChildren(this.screenEl);
    this.selectedCharacter = null;
    this._loadSurvivors();

    // Build UI
    this._buildUI();
    this._buildButtons();
    this._wireFilters();

    this._setupBrowsingHint();

    // Done
    eventManager.publish(GameEvents.SCREEN_CHANGED, {
      screenId: 'characterSelection',
      data
    });
  }

  teardown() {
    this.selectedCharacter = null;

    // remove background
    if (this.containerEl) {
      this.containerEl.style.backgroundImage = '';
      this.containerEl.style.backgroundSize = '';
      this.containerEl.style.backgroundPosition = '';
      this.containerEl.style.backgroundRepeat = '';
    }

    // remove floating UI
    const buttonRow = getElement('character-selection-buttons');
    if (buttonRow) buttonRow.remove();

    const filterOptions = getElement('filter-options');
    if (filterOptions) filterOptions.remove();

    this._removeFilterMenuListeners();
    this._removeBrowsingHint();

    // ensure scroll is unlocked if we left mid-flip
    this._unlockScroll();
  }

  // ---------- Build / Wire ----------

  _applyBackground() {
    this.containerEl.style.backgroundImage = "url('Assets/jungle1.png')";
    this.containerEl.style.backgroundSize = 'cover';
    this.containerEl.style.backgroundPosition = 'center';
    this.containerEl.style.backgroundRepeat = 'no-repeat';
  }

  _loadSurvivors() {
    try {
      const survivors = gameData.getSurvivors();
      this.availableSurvivors = Array.isArray(survivors)
        ? shuffleArray(survivors)
        : [];
    } catch (e) {
      this.availableSurvivors = [];
    }
  }

  _buildUI() {
    // Scroll stack
    this.stackEl = createElement('div', {
      id: 'survivor-stack',
      className: 'stable-card-stack'
    });
    this.availableSurvivors.forEach((survivor, index) => {
      const card = this._createSurvivorCard(survivor, index);
      this.stackEl.appendChild(card);
    });
    this.screenEl.appendChild(this.stackEl);

    this.scrollHintEl = createElement('div', {
      id: 'survivor-scroll-hint',
      className: 'survivor-scroll-hint',
      'aria-hidden': 'true'
    }, 'Swipe up/down to browse');
    this.screenEl.appendChild(this.scrollHintEl);

    // Floating filter panel
    const filterOptions = createElement('div', { id: 'filter-options', className: 'hidden filter-options' });
    const filterOptionsConfig = [
      { label: 'All', filterType: 'all', filter: 'all' },
      { label: 'Male', filterType: 'gender', filter: 'male' },
      { label: 'Female', filterType: 'gender', filter: 'female' },
      { label: 'Physical', filterType: 'trait', filter: 'physical' },
      { label: 'Mental', filterType: 'trait', filter: 'mental' },
      { label: 'Social', filterType: 'trait', filter: 'social' }
    ];

    filterOptionsConfig.forEach((config) => {
      filterOptions.appendChild(this._createFilterOption(config));
    });

    this.containerEl.appendChild(filterOptions);
  }

  _buildButtons() {
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
        // ensure same array instance as gameManager uses
        gameManager.survivors = [...gameData.getSurvivors()];
        const selectedCard = document.querySelector('.survivor-card.selected');
        if (!selectedCard) return;

        const selectedId = selectedCard.dataset.id;
        const selectedSurvivor = gameManager.survivors.find(s => s.id.toString() === selectedId);
        if (selectedSurvivor) {
          this.selectedCharacter = selectedSurvivor;
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

    this.containerEl.appendChild(buttonRow);
  }

  _wireFilters() {
    // nothing else required here; buttons are already wired in _buildUI
  }

  _setupBrowsingHint() {
    if (!this.stackEl || !this.scrollHintEl) return;

    this._stackScrollHandler = () => this._hideBrowsingHint();
    this.stackEl.addEventListener('scroll', this._stackScrollHandler, { passive: true });

    clearTimeout(this._scrollHintTimer);
    this._scrollHintTimer = setTimeout(() => this._hideBrowsingHint(), 3500);
  }

  _hideBrowsingHint() {
    if (this.scrollHintEl) {
      this.scrollHintEl.classList.add('hidden');
    }
    clearTimeout(this._scrollHintTimer);
    this._scrollHintTimer = null;
  }

  _removeBrowsingHint() {
    if (this.stackEl && this._stackScrollHandler) {
      this.stackEl.removeEventListener('scroll', this._stackScrollHandler);
    }
    this._stackScrollHandler = null;
    clearTimeout(this._scrollHintTimer);
    this._scrollHintTimer = null;
    this.scrollHintEl = null;
  }

  _createFilterOption({ label, filterType, filter }) {
    const optionBtn = createElement('button', {
      onclick: () => this._applyFilter(optionBtn)
    }, label);

    optionBtn.dataset.filterType = filterType;
    optionBtn.dataset.filter = filter;

    return optionBtn;
  }

  // ---------- Cards ----------

  _createSurvivorCard(survivor, index) {
    const traitClass = (survivor.traitClass || 'social').toLowerCase();
    const normalizedSurvivor = {
      ...survivor,
      traitClass
    };

    return createSurvivorCard(normalizedSurvivor, {
      mode: 'select',
      onFlipStart: () => this._lockScroll(),
      onFlipEnd: () => this._unlockScroll(),
      onSelect: (selected) => {
        this.selectedCharacter = selected;
        const cont = document.getElementById('continue-button');
        if (cont) cont.disabled = !selected;
      }
    });
  }

  // ---------- Filters ----------

  _isFilterActive(type, value) {
    if (type === 'all' || value === 'all') {
      return !this.genderFilter && !this.traitClassFilter;
    }
    if (type === 'gender') {
      return value === this.genderFilter;
    }

    if (type === 'trait') {
      return value === this.traitClassFilter;
    }

    return false;
  }

  _applyFilter(button) {
    if (!button?.dataset) return;

    const type = button.dataset.filterType;
    const value = button.dataset.filter;

    if (value === 'all') {
      this.genderFilter = null;
      this.traitClassFilter = null;
    } else if (type === 'gender') {
      this.genderFilter = this.genderFilter === value ? null : value;
    } else if (type === 'trait') {
      this.traitClassFilter = this.traitClassFilter === value ? null : value;
    }

    this._applyFilters();
    this._updateFilterOptionStates();
    this._updateFilterButtonState();
  }

  _toggleFilterOptions(forceHide = false) {
    const filterOptions = getElement('filter-options');
    const filterButton = getElement('filter-button');
    if (!filterOptions || !filterButton) return;

    if (forceHide) {
      filterOptions.classList.add('hidden');
      filterButton.classList.remove('filter-open');
      this._removeFilterMenuListeners();
    } else {
      filterOptions.classList.toggle('hidden');
      const isOpen = !filterOptions.classList.contains('hidden');
      filterButton.classList.toggle('filter-open', isOpen);

      if (isOpen) {
        this._addFilterMenuListeners();
      } else {
        this._removeFilterMenuListeners();
      }
    }

    this._updateFilterButtonState();
  }

  _addFilterMenuListeners() {
    if (!this._outsideClickHandler) {
      this._outsideClickHandler = (event) => {
        const filterOptions = getElement('filter-options');
        const filterButton = getElement('filter-button');
        if (!filterOptions || !filterButton) return;

        if (!filterOptions.contains(event.target) && !filterButton.contains(event.target)) {
          this._toggleFilterOptions(true);
        }
      };
      document.addEventListener('click', this._outsideClickHandler);
    }

    if (!this._escapeKeyHandler) {
      this._escapeKeyHandler = (event) => {
        if (event.key === 'Escape') {
          this._toggleFilterOptions(true);
        }
      };
      document.addEventListener('keydown', this._escapeKeyHandler);
    }
  }

  _removeFilterMenuListeners() {
    if (this._outsideClickHandler) {
      document.removeEventListener('click', this._outsideClickHandler);
      this._outsideClickHandler = null;
    }

    if (this._escapeKeyHandler) {
      document.removeEventListener('keydown', this._escapeKeyHandler);
      this._escapeKeyHandler = null;
    }
  }

  _updateFilterOptionStates() {
    const filterOptions = document.querySelectorAll('#filter-options button');
    filterOptions.forEach((button) => {
      const buttonType = button.dataset.filterType;
      const buttonFilter = button.dataset.filter;
      const isActive = this._isFilterActive(buttonType, buttonFilter);
      button.classList.toggle('active', isActive);
    });
  }

  _updateFilterButtonState() {
    const filterButton = getElement('filter-button');
    if (!filterButton) return;

    const isAnyFilterActive = this.genderFilter || this.traitClassFilter;
    filterButton.classList.toggle('active-filter', !!isAnyFilterActive);
  }

  _applyFilters() {
    const wrappers = document.querySelectorAll('.card-wrapper');
    wrappers.forEach(wrapper => {
      const card = wrapper.querySelector('.survivor-card');
      const id = card?.dataset.id;
      const survivor = this.availableSurvivors.find(s => s.id == id);
      if (!survivor) return;

      const survivorGender = String(survivor.gender || '').toLowerCase();
      const survivorTraitClass = String(survivor.traitClass || '').toLowerCase();
      const matchesGender = !this.genderFilter || survivorGender === this.genderFilter;
      const matchesTrait = !this.traitClassFilter || survivorTraitClass === this.traitClassFilter;

      wrapper.style.display = matchesGender && matchesTrait ? 'block' : 'none';
    });

    const firstVisibleWrapper = Array.from(wrappers).find((wrapper) => wrapper.style.display !== 'none');
    if (firstVisibleWrapper) {
      firstVisibleWrapper.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    this._updateFilterButtonState();
  }

  // ---------- Scroll guard (JS-only, no CSS needed) ----------

  _lockScroll() {
    if (!this.stackEl || window.__siFlipping) return;
    window.__siFlipping = true;

    this._savedScrollTop = this.stackEl.scrollTop;

    // freeze overflow without relying on external CSS
    this._prevOverflowY = this.stackEl.style.overflowY;
    this.stackEl.style.overflowY = 'hidden';

    // block touch scroll (iOS)
    this._touchBlocker = (e) => e.preventDefault();
    this.stackEl.addEventListener('touchmove', this._touchBlocker, { passive: false });

    // block keyboard scroll (arrows/space/PageUp/PageDown)
    this._keyBlocker = (e) => {
      const keys = ['ArrowUp','ArrowDown','PageUp','PageDown','Home','End',' '];
      if (keys.includes(e.key)) e.preventDefault();
    };
    window.addEventListener('keydown', this._keyBlocker, { capture: true });

    // keep position stable
    this.stackEl.scrollTop = this._savedScrollTop;
  }

  _unlockScroll() {
    if (!this.stackEl) return;

    // restore overflow
    this.stackEl.style.overflowY = this._prevOverflowY ?? 'auto';

    // remove blockers
    if (this._touchBlocker) {
      this.stackEl.removeEventListener('touchmove', this._touchBlocker, { passive: false });
      this._touchBlocker = null;
    }
    if (this._keyBlocker) {
      window.removeEventListener('keydown', this._keyBlocker, { capture: true });
      this._keyBlocker = null;
    }

    // restore exact scroll position
    this.stackEl.scrollTop = this._savedScrollTop;

    // clear flag
    window.__siFlipping = false;

    // clear any fallback timer
    clearTimeout(this._unlockTimer);
    this._unlockTimer = null;
  }
}
