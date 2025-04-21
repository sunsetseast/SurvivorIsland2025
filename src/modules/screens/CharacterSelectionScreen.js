/**
 * @module CharacterSelectionScreen
 * Character selection screen for the game
 */

import { getElement, createElement, clearChildren } from '../utils/DOMUtils.js';
import { gameManager } from '../core/GameManager.js';
import eventManager, { GameEvents } from '../core/EventManager.js';
import { GameData } from '../data/index.js';
import { shuffleArray } from '../utils/CommonUtils.js';

const CharacterSelectionScreen = {
  /**
   * Initialize the screen
   */
  initialize() {
    console.log('CharacterSelectionScreen initialized');
    this.selectedCharacter = null;
    this.availableSurvivors = [];
  },
  
  /**
   * Set up the screen when it's shown
   * @param {Object} data - Additional data passed to the screen
   */
  setup(data = {}) {
    const characterSelectionScreen = getElement('character-selection-screen');
    if (!characterSelectionScreen) {
      console.error('Character selection screen element not found');
      return;
    }
    
    // Clear the screen
    clearChildren(characterSelectionScreen);
    
    // Create screen title
    const title = createElement('h1', {
      className: 'screen-title',
      style: {
        fontSize: '2rem',
        color: '#fff',
        textAlign: 'center',
        marginBottom: '1.5rem',
        textShadow: '2px 2px 4px rgba(0, 0, 0, 0.5)'
      }
    }, 'Choose Your Character');
    
    // Create subtitle
    const subtitle = createElement('p', {
      className: 'screen-subtitle',
      style: {
        fontSize: '1.1rem',
        color: '#ddd',
        textAlign: 'center',
        marginBottom: '2rem'
      }
    }, 'Select the survivor that will represent you in the game');
    
    // Create search/filter controls
    const filterContainer = createElement('div', {
      className: 'filter-container',
      style: {
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        gap: '1rem',
        marginBottom: '1.5rem',
        flexWrap: 'wrap'
      }
    });
    
    // Search input
    const searchContainer = createElement('div', {
      className: 'search-container',
      style: {
        position: 'relative',
        width: '250px'
      }
    });
    
    const searchInput = createElement('input', {
      id: 'character-search',
      type: 'text',
      placeholder: 'Search by name...',
      style: {
        width: '100%',
        padding: '0.6rem 0.8rem',
        paddingLeft: '2rem',
        backgroundColor: 'rgba(30, 30, 30, 0.7)',
        color: '#fff',
        border: '1px solid #555',
        borderRadius: '4px'
      },
      oninput: (e) => {
        this._filterSurvivors(e.target.value, filterSelect.value);
      }
    });
    
    // Search icon
    const searchIcon = createElement('span', {
      className: 'search-icon',
      style: {
        position: 'absolute',
        left: '0.6rem',
        top: '50%',
        transform: 'translateY(-50%)',
        color: '#aaa'
      }
    }, '🔍');
    
    searchContainer.appendChild(searchIcon);
    searchContainer.appendChild(searchInput);
    
    // Filter dropdown
    const filterSelect = createElement('select', {
      id: 'character-filter',
      style: {
        padding: '0.6rem 0.8rem',
        backgroundColor: 'rgba(30, 30, 30, 0.7)',
        color: '#fff',
        border: '1px solid #555',
        borderRadius: '4px'
      },
      onchange: (e) => {
        this._filterSurvivors(searchInput.value, e.target.value);
      }
    });
    
    // Add filter options
    const filterOptions = [
      { value: 'all', label: 'All Characters' },
      { value: 'male', label: 'Male Characters' },
      { value: 'female', label: 'Female Characters' },
      { value: 'physical', label: 'Physical Strength' },
      { value: 'mental', label: 'Mental Strength' },
      { value: 'social', label: 'Social Skills' }
    ];
    
    filterOptions.forEach(option => {
      const optionElement = createElement('option', {
        value: option.value
      }, option.label);
      filterSelect.appendChild(optionElement);
    });
    
    // Random button
    const randomButton = createElement('button', {
      className: 'random-button',
      style: {
        padding: '0.6rem 1rem',
        backgroundColor: '#9c27b0',
        color: '#fff',
        border: 'none',
        borderRadius: '4px',
        cursor: 'pointer'
      },
      onclick: () => {
        this._selectRandomCharacter();
      }
    }, 'Random');
    
    filterContainer.appendChild(searchContainer);
    filterContainer.appendChild(filterSelect);
    filterContainer.appendChild(randomButton);
    
    // Create characters grid
    const charactersGrid = createElement('div', {
      className: 'characters-grid',
      style: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
        gap: '1.5rem',
        marginBottom: '2rem'
      }
    });
    
    // Get survivors from game data
    this.availableSurvivors = [...GameData.getSurvivors()];
    
    // Create character cards
    this.availableSurvivors.forEach(survivor => {
      const card = this._createCharacterCard(survivor);
      charactersGrid.appendChild(card);
    });
    
    // Create character details panel (initially hidden)
    const detailsPanel = createElement('div', {
      id: 'character-details-panel',
      style: {
        backgroundColor: 'rgba(30, 30, 30, 0.9)',
        borderRadius: '8px',
        padding: '1.5rem',
        marginBottom: '2rem',
        display: 'none'
      }
    });
    
    // Create action buttons
    const actionButtons = createElement('div', {
      className: 'action-buttons',
      style: {
        display: 'flex',
        justifyContent: 'center',
        gap: '1rem',
        marginTop: '2rem'
      }
    });
    
    // Back button
    const backButton = createElement('button', {
      className: 'back-button',
      style: {
        padding: '0.8rem 1.5rem',
        backgroundColor: '#607d8b',
        color: '#fff',
        border: 'none',
        borderRadius: '4px',
        cursor: 'pointer',
        fontSize: '1rem'
      },
      onclick: () => {
        gameManager.setGameState('welcome');
      }
    }, 'Back');
    
    // Confirm button (initially disabled)
    const confirmButton = createElement('button', {
      id: 'confirm-character-button',
      className: 'confirm-button',
      style: {
        padding: '0.8rem 1.5rem',
        backgroundColor: '#4caf50',
        color: '#fff',
        border: 'none',
        borderRadius: '4px',
        cursor: 'pointer',
        fontSize: '1rem',
        opacity: '0.6',
        pointerEvents: 'none'
      },
      onclick: () => {
        if (this.selectedCharacter) {
          gameManager.selectCharacter(this.selectedCharacter);
        }
      }
    }, 'Confirm');
    
    actionButtons.appendChild(backButton);
    actionButtons.appendChild(confirmButton);
    
    // Add elements to screen
    characterSelectionScreen.appendChild(title);
    characterSelectionScreen.appendChild(subtitle);
    characterSelectionScreen.appendChild(filterContainer);
    characterSelectionScreen.appendChild(charactersGrid);
    characterSelectionScreen.appendChild(detailsPanel);
    characterSelectionScreen.appendChild(actionButtons);
    
    // Publish screen setup event
    eventManager.publish(GameEvents.SCREEN_CHANGED, {
      screenId: 'characterSelection',
      data
    });
  },
  
  /**
   * Create a character card
   * @param {Object} survivor - Survivor data
   * @returns {HTMLElement} Character card element
   * @private
   */
  _createCharacterCard(survivor) {
    const card = createElement('div', {
      className: 'character-card',
      dataset: {
        id: survivor.id,
        gender: survivor.gender
      },
      style: {
        backgroundColor: 'rgba(40, 40, 40, 0.7)',
        borderRadius: '8px',
        padding: '1rem',
        cursor: 'pointer',
        transition: 'all 0.2s',
        border: '2px solid transparent',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center'
      },
      onmouseover: (e) => {
        e.currentTarget.style.transform = 'translateY(-5px)';
        e.currentTarget.style.boxShadow = '0 5px 15px rgba(0, 0, 0, 0.3)';
        e.currentTarget.style.backgroundColor = 'rgba(50, 50, 50, 0.7)';
      },
      onmouseout: (e) => {
        if (this.selectedCharacter?.id !== survivor.id) {
          e.currentTarget.style.transform = 'translateY(0)';
          e.currentTarget.style.boxShadow = 'none';
          e.currentTarget.style.backgroundColor = 'rgba(40, 40, 40, 0.7)';
        }
      },
      onclick: () => {
        this._selectCharacter(survivor);
      }
    });
    
    // Avatar
    const avatarContainer = createElement('div', {
      className: 'avatar-container',
      style: {
        width: '80px',
        height: '80px',
        borderRadius: '50%',
        backgroundColor: '#555',
        marginBottom: '1rem',
        overflow: 'hidden',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center'
      }
    });
    
    // Handle avatar
    if (survivor.avatarUrl) {
      avatarContainer.style.backgroundImage = `url(${survivor.avatarUrl})`;
      avatarContainer.style.backgroundSize = 'cover';
      avatarContainer.style.backgroundPosition = 'center';
    } else {
      // Default avatar (first letter of name)
      const avatarText = createElement('span', {
        style: {
          fontSize: '2rem',
          color: '#fff'
        }
      }, survivor.name.charAt(0));
      avatarContainer.appendChild(avatarText);
    }
    
    // Character name
    const name = createElement('h3', {
      style: {
        color: '#fff',
        margin: '0 0 0.5rem 0',
        textAlign: 'center'
      }
    }, survivor.name);
    
    // Character brief
    const brief = createElement('div', {
      style: {
        color: '#ddd',
        fontSize: '0.9rem',
        textAlign: 'center',
        marginBottom: '0.5rem'
      }
    }, `${survivor.age}, ${survivor.occupation}`);
    
    // Archetype tag
    const archetype = createElement('div', {
      style: {
        backgroundColor: 'rgba(255, 152, 0, 0.2)',
        color: '#ff9800',
        padding: '0.2rem 0.5rem',
        borderRadius: '4px',
        fontSize: '0.8rem',
        marginBottom: '0.5rem'
      }
    }, survivor.archetype);
    
    // Attributes mini-preview
    const attributes = createElement('div', {
      style: {
        display: 'flex',
        justifyContent: 'space-between',
        width: '100%',
        marginTop: '0.5rem'
      }
    });
    
    // Physical attribute
    const physical = createElement('div', {
      style: {
        textAlign: 'center',
        flex: '1'
      }
    });
    
    const physicalLabel = createElement('div', {
      style: {
        fontSize: '0.7rem',
        color: '#aaa',
        marginBottom: '0.2rem'
      }
    }, 'PHY');
    
    const physicalValue = createElement('div', {
      style: {
        fontSize: '0.9rem',
        color: '#ff5722'
      }
    }, survivor.physical.toString());
    
    physical.appendChild(physicalLabel);
    physical.appendChild(physicalValue);
    
    // Mental attribute
    const mental = createElement('div', {
      style: {
        textAlign: 'center',
        flex: '1'
      }
    });
    
    const mentalLabel = createElement('div', {
      style: {
        fontSize: '0.7rem',
        color: '#aaa',
        marginBottom: '0.2rem'
      }
    }, 'MNT');
    
    const mentalValue = createElement('div', {
      style: {
        fontSize: '0.9rem',
        color: '#2196f3'
      }
    }, survivor.mental.toString());
    
    mental.appendChild(mentalLabel);
    mental.appendChild(mentalValue);
    
    // Social attribute
    const social = createElement('div', {
      style: {
        textAlign: 'center',
        flex: '1'
      }
    });
    
    const socialLabel = createElement('div', {
      style: {
        fontSize: '0.7rem',
        color: '#aaa',
        marginBottom: '0.2rem'
      }
    }, 'SOC');
    
    const socialValue = createElement('div', {
      style: {
        fontSize: '0.9rem',
        color: '#4caf50'
      }
    }, survivor.personality.toString());
    
    social.appendChild(socialLabel);
    social.appendChild(socialValue);
    
    // Add attributes to container
    attributes.appendChild(physical);
    attributes.appendChild(mental);
    attributes.appendChild(social);
    
    // Assemble card
    card.appendChild(avatarContainer);
    card.appendChild(name);
    card.appendChild(brief);
    card.appendChild(archetype);
    card.appendChild(attributes);
    
    return card;
  },
  
  /**
   * Select a character
   * @param {Object} survivor - The survivor to select
   * @private
   */
  _selectCharacter(survivor) {
    this.selectedCharacter = survivor;
    
    // Update character cards
    const cards = document.querySelectorAll('.character-card');
    cards.forEach(card => {
      const cardId = parseInt(card.dataset.id, 10);
      
      if (cardId === survivor.id) {
        // Highlight selected card
        card.style.borderColor = '#ff9800';
        card.style.transform = 'translateY(-5px)';
        card.style.boxShadow = '0 5px 15px rgba(0, 0, 0, 0.3)';
        card.style.backgroundColor = 'rgba(50, 50, 50, 0.7)';
      } else {
        // Reset other cards
        card.style.borderColor = 'transparent';
        card.style.transform = 'translateY(0)';
        card.style.boxShadow = 'none';
        card.style.backgroundColor = 'rgba(40, 40, 40, 0.7)';
      }
    });
    
    // Enable confirm button
    const confirmButton = getElement('confirm-character-button');
    if (confirmButton) {
      confirmButton.style.opacity = '1';
      confirmButton.style.pointerEvents = 'auto';
    }
    
    // Update character details panel
    this._updateCharacterDetails(survivor);
  },
  
  /**
   * Update character details panel
   * @param {Object} survivor - The survivor to display
   * @private
   */
  _updateCharacterDetails(survivor) {
    const detailsPanel = getElement('character-details-panel');
    if (!detailsPanel) return;
    
    // Clear panel
    clearChildren(detailsPanel);
    
    // Create details layout
    const detailsLayout = createElement('div', {
      style: {
        display: 'flex',
        gap: '1.5rem',
        alignItems: 'flex-start'
      }
    });
    
    // Avatar
    const avatar = createElement('div', {
      style: {
        width: '120px',
        height: '120px',
        borderRadius: '60px',
        backgroundColor: '#555',
        flexShrink: '0',
        overflow: 'hidden',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center'
      }
    });
    
    // Handle avatar
    if (survivor.avatarUrl) {
      avatar.style.backgroundImage = `url(${survivor.avatarUrl})`;
      avatar.style.backgroundSize = 'cover';
      avatar.style.backgroundPosition = 'center';
    } else {
      // Default avatar (first letter of name)
      const avatarText = createElement('span', {
        style: {
          fontSize: '3rem',
          color: '#fff'
        }
      }, survivor.name.charAt(0));
      avatar.appendChild(avatarText);
    }
    
    // Info container
    const infoContainer = createElement('div', {
      style: {
        flex: '1'
      }
    });
    
    // Character name
    const name = createElement('h2', {
      style: {
        color: '#fff',
        margin: '0 0 0.5rem 0'
      }
    }, survivor.name);
    
    // Character details
    const details = createElement('div', {
      style: {
        color: '#ddd',
        marginBottom: '1rem'
      }
    });
    
    // Age and occupation
    const ageOccupation = createElement('div', {
      style: {
        marginBottom: '0.3rem'
      }
    }, `${survivor.age} years old, ${survivor.occupation}`);
    
    // Archetype
    const archetype = createElement('div', {
      style: {
        marginBottom: '0.3rem'
      }
    });
    
    const archetypeLabel = createElement('span', {
      style: {
        color: '#aaa'
      }
    }, 'Archetype: ');
    
    const archetypeValue = createElement('span', {
      style: {
        color: '#ff9800'
      }
    }, survivor.archetype);
    
    archetype.appendChild(archetypeLabel);
    archetype.appendChild(archetypeValue);
    
    details.appendChild(ageOccupation);
    details.appendChild(archetype);
    
    // Attributes
    const attributesContainer = createElement('div', {
      style: {
        marginTop: '1rem'
      }
    });
    
    const attributesTitle = createElement('div', {
      style: {
        color: '#aaa',
        marginBottom: '0.5rem',
        fontSize: '0.9rem'
      }
    }, 'ATTRIBUTES');
    
    const attributes = createElement('div', {
      style: {
        display: 'flex',
        gap: '1rem'
      }
    });
    
    // Attribute bars
    const attributesList = [
      { name: 'Physical', value: survivor.physical, color: '#ff5722' },
      { name: 'Mental', value: survivor.mental, color: '#2196f3' },
      { name: 'Social', value: survivor.personality, color: '#4caf50' }
    ];
    
    attributesList.forEach(attr => {
      const attrGroup = createElement('div', {
        style: {
          flex: '1'
        }
      });
      
      const attrLabel = createElement('div', {
        style: {
          display: 'flex',
          justifyContent: 'space-between',
          marginBottom: '0.3rem'
        }
      });
      
      const attrName = createElement('span', {
        style: {
          color: '#ddd',
          fontSize: '0.9rem'
        }
      }, attr.name);
      
      const attrValue = createElement('span', {
        style: {
          color: attr.color,
          fontSize: '0.9rem',
          fontWeight: 'bold'
        }
      }, attr.value.toString());
      
      attrLabel.appendChild(attrName);
      attrLabel.appendChild(attrValue);
      
      const attrBarContainer = createElement('div', {
        style: {
          width: '100%',
          backgroundColor: 'rgba(255, 255, 255, 0.1)',
          height: '8px',
          borderRadius: '4px',
          overflow: 'hidden'
        }
      });
      
      const attrBar = createElement('div', {
        style: {
          width: `${attr.value * 10}%`,
          backgroundColor: attr.color,
          height: '100%',
          borderRadius: '4px'
        }
      });
      
      attrBarContainer.appendChild(attrBar);
      attrGroup.appendChild(attrLabel);
      attrGroup.appendChild(attrBarContainer);
      attributes.appendChild(attrGroup);
    });
    
    attributesContainer.appendChild(attributesTitle);
    attributesContainer.appendChild(attributes);
    
    // Assemble info container
    infoContainer.appendChild(name);
    infoContainer.appendChild(details);
    infoContainer.appendChild(attributesContainer);
    
    // Add to details layout
    detailsLayout.appendChild(avatar);
    detailsLayout.appendChild(infoContainer);
    
    // Add to panel
    detailsPanel.appendChild(detailsLayout);
    
    // Show panel
    detailsPanel.style.display = 'block';
  },
  
  /**
   * Filter survivors based on search term and filter
   * @param {string} searchTerm - Search term
   * @param {string} filter - Filter value
   * @private
   */
  _filterSurvivors(searchTerm, filter) {
    const cards = document.querySelectorAll('.character-card');
    
    searchTerm = searchTerm.toLowerCase().trim();
    
    cards.forEach(card => {
      const cardId = parseInt(card.dataset.id, 10);
      const survivor = this.availableSurvivors.find(s => s.id === cardId);
      
      if (!survivor) return;
      
      let matchesSearch = true;
      let matchesFilter = true;
      
      // Check search term
      if (searchTerm) {
        matchesSearch = survivor.name.toLowerCase().includes(searchTerm) || 
                      survivor.occupation.toLowerCase().includes(searchTerm) || 
                      survivor.archetype.toLowerCase().includes(searchTerm);
      }
      
      // Check filter
      if (filter !== 'all') {
        if (filter === 'male' || filter === 'female') {
          matchesFilter = survivor.gender === filter;
        } else if (filter === 'physical') {
          matchesFilter = survivor.physical >= 7;
        } else if (filter === 'mental') {
          matchesFilter = survivor.mental >= 7;
        } else if (filter === 'social') {
          matchesFilter = survivor.personality >= 7;
        }
      }
      
      // Show or hide card
      if (matchesSearch && matchesFilter) {
        card.style.display = 'flex';
      } else {
        card.style.display = 'none';
      }
    });
  },
  
  /**
   * Select a random character
   * @private
   */
  _selectRandomCharacter() {
    // Get visible characters
    const visibleCards = Array.from(document.querySelectorAll('.character-card')).filter(
      card => card.style.display !== 'none'
    );
    
    if (visibleCards.length === 0) return;
    
    // Select random card
    const randomIndex = Math.floor(Math.random() * visibleCards.length);
    const randomCard = visibleCards[randomIndex];
    const survivorId = parseInt(randomCard.dataset.id, 10);
    const survivor = this.availableSurvivors.find(s => s.id === survivorId);
    
    if (survivor) {
      this._selectCharacter(survivor);
      
      // Scroll to the card
      randomCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  },
  
  /**
   * Clean up the screen when it's hidden
   */
  teardown() {
    // Any cleanup code when leaving the screen
    console.log('CharacterSelectionScreen teardown');
    this.selectedCharacter = null;
  }
};

export default CharacterSelectionScreen;