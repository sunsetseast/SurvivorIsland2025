/**
 * @module CharacterSelectionScreen
 * Character selection screen for the game (refactored, with flip scroll-guard)
 */

import { getElement, createElement, clearChildren } from '../utils/index.js';
import { gameManager, eventManager } from '../core/index.js';
import { GameEvents } from '../core/EventManager.js';
import gameData from '../data/index.js';
import { setupScrollReveal } from '../utils/ScrollReveal.js';

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

    // scroll guard state
    this._savedScrollTop = 0;
    this._unlockTimer = null;
    this._touchBlocker = null;
    this._keyBlocker = null;
  }

  initialize() {
    // Close filter panel on outside click (only when this screen is active)
    document.addEventListener('click', (e) => {
      const filterOptions = getElement('filter-options');
      const filterButton = getElement('filter-button');
      if (!filterOptions || !filterButton) return;

      filterButton.classList.add('rect-button');

      setTimeout(() => {
        if (!filterOptions.contains(e.target) && e.target !== filterButton) {
          this._toggleFilterOptions(true);
        }
      }, 0);
    });
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

    // Reveal helper
    setupScrollReveal();

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
        ? [...survivors].sort(() => Math.random() - 0.5)
        : [];
    } catch (e) {
      this.availableSurvivors = [];
    }
  }

  _buildUI() {
    // Scroll stack
    this.stackEl = createElement('div', { id: 'survivor-stack' });
    this.availableSurvivors.forEach((survivor, index) => {
      const card = this._createSurvivorCard(survivor, index);
      this.stackEl.appendChild(card);
    });
    this.screenEl.appendChild(this.stackEl);

    // Floating filter panel
    const filterOptions = createElement('div', { id: 'filter-options', className: 'hidden filter-options' });
    ['all', 'male', 'female', 'physical', 'mental', 'social'].forEach(type => {
      const optionBtn = createElement('button', {
        onclick: () => this._applyFilter(type)
      }, type.charAt(0).toUpperCase() + type.slice(1));
      filterOptions.appendChild(optionBtn);
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

  // ---------- Cards ----------

  _createSurvivorCard(survivor, index) {
    const cardWrapper = createElement('div', { className: 'card-wrapper' });

    // Avatar frame
    const avatarFrame = createElement('div', { className: 'avatar-frame' });
    const avatarImg = createElement('img', {
      src: survivor.avatarUrl || 'Assets/Avatars/default.jpeg',
      alt: `${survivor.firstName}'s avatar`
    });
    avatarFrame.appendChild(avatarImg);
    cardWrapper.appendChild(avatarFrame);

    // Card body
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

    // TRAITS overlay (full grid)
    const traitCardOverlay = createElement('div', { className: 'trait-card-overlay hidden' });
    const traitCardWrapper = createElement('div', { className: 'trait-card-wrapper' });
    traitCardOverlay.appendChild(traitCardWrapper);

    const traitCardBg = createElement('img', { className: 'trait-card-bg' });
    traitCardBg.src = 'Assets/card-back-traits.png';
    traitCardWrapper.appendChild(traitCardBg);

    const traitCoordinates = {
      physical: [75, 141],  mental: [168, 141],  social: [261, 141],
      strength: [75, 201],  memory: [168, 201],  connections: [261, 201],
      speed: [75, 266],     puzzles: [168, 266], likeability: [261, 266],
      endurance: [75, 328], fortitude: [168, 328], interrogation: [261, 328],
      dexterity: [75, 392], awareness: [168, 392], deception: [261, 392],
      balance: [75, 457],   focus: [168, 457],   alliances: [261, 457]
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

    // --- Flip logic with per-flip scroll guard ---
    const flip = (on) => {
      // Lock scroll BEFORE toggling to avoid reflow-induced jumps
      this._lockScroll();
      if (on) cardWrapper.classList.add('flipped');
      else cardWrapper.classList.remove('flipped');

      // Use transitionend for robustness, fallback timer for older Safari
      const onEnd = (ev) => {
        // only care about transforms on the wrapper or children
        cardWrapper.removeEventListener('transitionend', onEnd, true);
        this._unlockScroll();
      };
      cardWrapper.addEventListener('transitionend', onEnd, true);

      // Fallback unlock (650ms default flip CSS)
      clearTimeout(this._unlockTimer);
      this._unlockTimer = setTimeout(() => this._unlockScroll(), 700);
    };

    const moreInfoButtonHandler = () => flip(true);
    const backButtonHandler = () => flip(false);

    moreInfoButton.addEventListener('click', moreInfoButtonHandler);
    backButton.addEventListener('click', backButtonHandler);

    // Choose logic (unchanged)
    chooseButton.addEventListener('click', () => {
      const isSelected = card.classList.contains('selected');
      const allCards = document.querySelectorAll('.survivor-card');
      const allButtons = document.querySelectorAll('.choose-button');

      allCards.forEach(c => c.classList.remove('selected'));
      allButtons.forEach(btn => btn.classList.remove('glow-gold'));

      const tSpan = chooseButton.querySelector('.button-text');

      if (isSelected) {
        this.selectedCharacter = null;
        if (tSpan) {
          tSpan.textContent = 'Choose Survivor';
          // Reapply rect-button skin explicitly
          chooseButton.style.backgroundImage = 'url("Assets/rect-button.png")';
          chooseButton.style.backgroundSize = '100% 100%';
          chooseButton.style.backgroundRepeat = 'no-repeat';
          chooseButton.style.backgroundPosition = 'center';
        }
        chooseButton.classList.remove('glow-gold');
        const cont = document.getElementById('continue-button');
        if (cont) cont.disabled = true;
      } else {
        card.classList.add('selected');
        this.selectedCharacter = survivor;
        if (tSpan) tSpan.textContent = 'Unselect Survivor';
        chooseButton.classList.add('glow-gold');
        const cont = document.getElementById('continue-button');
        if (cont) cont.disabled = false;
      }
    });

    return cardWrapper;
  }

  // ---------- Filters ----------

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
      this._toggleFilterOptions(true);
    } else if (['male', 'female'].includes(type)) {
      this.genderFilter = this.genderFilter === type ? null : type;
    } else if (['physical', 'mental', 'social'].includes(type)) {
      this.traitClassFilter = this.traitClassFilter === type ? null : type;
    }

    this._applyFilters();

    // Update option styles
    const filterOptions = document.querySelectorAll('#filter-options button');
    filterOptions.forEach(button => {
      const buttonType = button.textContent.toLowerCase();
      const isActive = this._isFilterActive(buttonType);
      button.classList.toggle('active', isActive);
    });

    // Update main filter button
    const filterButton = document.getElementById('filter-button');
    if (filterButton) {
      const isAnyFilterActive = this.genderFilter || this.traitClassFilter;
      filterButton.classList.toggle('active-filter', !!isAnyFilterActive);
      filterButton.style.border = isAnyFilterActive ? '2px solid gold' : '';
    }
  }

  _toggleFilterOptions(forceHide = false) {
    const filterOptions = getElement('filter-options');
    const filterButton = getElement('filter-button');
    if (!filterOptions || !filterButton) return;

    if (forceHide) {
      filterOptions.classList.add('hidden');
      const isAnyFilterActive = this.genderFilter || this.traitClassFilter;
      filterButton.classList.toggle('active-filter', !!isAnyFilterActive);
    } else {
      filterOptions.classList.toggle('hidden');
      // while open, treat as active for styling
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

    const filterButton = getElement('filter-button');
    if (filterButton) {
      const isActive = this.genderFilter || this.traitClassFilter;
      filterButton.classList.toggle('active-filter', !!isActive);
    }
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