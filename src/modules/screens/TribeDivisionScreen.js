/**
 * @module TribeDivisionScreen
 * Screen for dividing survivors into tribes
 */

import { getElement, createElement, clearChildren } from '../utils/DOMUtils.js';
import { shuffleArray } from '../utils/CommonUtils.js';
import { GameManager } from '../core/GameManager.js';
import eventManager, { GameEvents } from '../core/EventManager.js';
import { GameData } from '../data/index.js';

const TribeDivisionScreen = {
  /**
   * Initialize the screen
   */
  initialize() {
    // Any one-time initialization code
    console.log('TribeDivisionScreen initialized');
  },
  
  /**
   * Set up the screen when it's shown
   * @param {Object} data - Additional data passed to the screen
   */
  setup(data = {}) {
    const tribeDivisionScreen = getElement('tribe-division-screen');
    if (!tribeDivisionScreen) {
      console.error('Tribe division screen element not found');
      return;
    }
    
    // Clear the screen
    clearChildren(tribeDivisionScreen);
    
    // Create screen title
    const title = createElement('h1', {
      className: 'screen-title',
      style: {
        fontSize: '2rem',
        color: '#fff',
        marginBottom: '1.5rem',
        textAlign: 'center'
      }
    }, 'Tribe Division');
    
    // Create subtitle
    const subtitle = createElement('p', {
      className: 'screen-subtitle',
      style: {
        fontSize: '1.1rem',
        color: '#ddd',
        marginBottom: '2rem',
        textAlign: 'center'
      }
    }, `Day 1: The ${GameManager.tribeCount} tribes are being formed!`);
    
    // Create tribes container
    const tribesContainer = createElement('div', {
      className: 'tribes-container',
      style: {
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'center',
        gap: '30px',
        marginBottom: '2rem'
      }
    });
    
    // Create loading message
    const loadingMessage = createElement('p', {
      id: 'loading-message',
      style: {
        fontSize: '1.2rem',
        color: '#fff',
        textAlign: 'center',
        width: '100%'
      }
    }, 'Drawing tribes...');
    
    tribesContainer.appendChild(loadingMessage);
    
    // Create continue button (hidden initially)
    const continueButton = createElement('button', {
      className: 'primary-button',
      id: 'continue-button',
      style: {
        display: 'none',
        marginTop: '2rem'
      },
      onclick: () => {
        GameManager.setGameState('camp');
      }
    }, 'Go to Camp');
    
    // Add elements to the screen
    tribeDivisionScreen.appendChild(title);
    tribeDivisionScreen.appendChild(subtitle);
    tribeDivisionScreen.appendChild(tribesContainer);
    tribeDivisionScreen.appendChild(continueButton);
    
    // Simulate time for tribe division animation
    setTimeout(() => {
      this._displayTribes(tribesContainer);
    }, 1500);
    
    // Publish screen setup event
    eventManager.publish(GameEvents.SCREEN_CHANGED, {
      screenId: 'tribeDivision',
      data
    });
  },
  
  /**
   * Display tribes after division
   * @param {HTMLElement} container - Tribes container element
   * @private
   */
  _displayTribes(container) {
    // Remove loading message
    const loadingMessage = getElement('loading-message');
    if (loadingMessage) {
      loadingMessage.remove();
    }
    
    // Get tribes from game manager
    const tribes = GameManager.getTribes();
    
    if (!tribes || tribes.length === 0) {
      console.error('No tribes available');
      container.appendChild(
        createElement('p', { style: { color: 'red' } }, 'Error: Could not load tribes')
      );
      return;
    }
    
    // Create tribe cards
    tribes.forEach(tribe => {
      const tribeCard = this._createTribeCard(tribe);
      container.appendChild(tribeCard);
    });
    
    // Show continue button
    const continueButton = getElement('continue-button');
    if (continueButton) {
      continueButton.style.display = 'block';
    }
    
    // Trigger tribe animation
    setTimeout(() => {
      const tribeMembers = document.querySelectorAll('.tribe-member');
      tribeMembers.forEach((member, index) => {
        setTimeout(() => {
          member.style.opacity = '1';
          member.style.transform = 'translateY(0)';
        }, index * 100); // Stagger animation
      });
    }, 500);
  },
  
  /**
   * Create a tribe card element
   * @param {Object} tribe - Tribe data
   * @returns {HTMLElement} Tribe card element
   * @private
   */
  _createTribeCard(tribe) {
    const card = createElement('div', {
      className: 'tribe-card',
      style: {
        backgroundColor: 'rgba(30, 30, 30, 0.7)',
        borderRadius: '8px',
        padding: '20px',
        minWidth: '280px',
        maxWidth: '340px',
        border: `3px solid ${tribe.tribeColor}`,
        boxShadow: `0 4px 12px rgba(0, 0, 0, 0.2), 0 0 8px ${tribe.tribeColor}`,
        transition: 'transform 0.3s ease',
        animationName: 'fadeIn',
        animationDuration: '0.5s'
      }
    });
    
    // Create tribe name
    const tribeName = createElement('h2', {
      className: 'tribe-name',
      style: {
        color: tribe.tribeColor,
        fontSize: '1.5rem',
        marginBottom: '15px',
        textAlign: 'center',
        textShadow: '1px 1px 2px rgba(0, 0, 0, 0.5)'
      }
    }, tribe.tribeName);
    
    // Create tribe info
    const tribeInfo = createElement('div', {
      className: 'tribe-info',
      style: {
        display: 'flex',
        justifyContent: 'space-between',
        marginBottom: '15px',
        fontSize: '0.9rem',
        color: '#ddd'
      }
    });
    
    // Tribe members count
    tribeInfo.appendChild(
      createElement('span', {}, `Members: ${tribe.members.length}`)
    );
    
    // Create members list
    const membersList = createElement('div', {
      className: 'members-list',
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: '8px'
      }
    });
    
    // Add members
    tribe.members.forEach(member => {
      const memberItem = createElement('div', {
        className: 'tribe-member',
        style: {
          display: 'flex',
          alignItems: 'center',
          padding: '8px',
          backgroundColor: member.isPlayer ? `${tribe.tribeColor}30` : 'rgba(50, 50, 50, 0.5)',
          borderRadius: '4px',
          opacity: '0',
          transform: 'translateY(10px)',
          transition: 'opacity 0.3s ease, transform 0.3s ease'
        }
      });
      
      // Member avatar
      const avatar = createElement('div', {
        className: 'member-avatar',
        style: {
          width: '36px',
          height: '36px',
          borderRadius: '50%',
          backgroundColor: '#555',
          marginRight: '10px',
          overflow: 'hidden',
          border: member.isPlayer ? `2px solid ${tribe.tribeColor}` : '2px solid #666'
        }
      });
      
      // Add avatar image if available
      if (member.avatarUrl) {
        avatar.style.backgroundImage = `url(${member.avatarUrl})`;
        avatar.style.backgroundSize = 'cover';
        avatar.style.backgroundPosition = 'center';
      }
      
      // Member info
      const memberInfo = createElement('div', {
        className: 'member-info',
        style: {
          flex: '1'
        }
      });
      
      // Member name
      const memberName = createElement('div', {
        className: 'member-name',
        style: {
          fontWeight: 'bold',
          color: member.isPlayer ? '#fff' : '#ddd',
          fontSize: '1rem'
        }
      }, member.name + (member.isPlayer ? ' (You)' : ''));
      
      // Member archetype
      const memberArchetype = createElement('div', {
        className: 'member-archetype',
        style: {
          fontSize: '0.8rem',
          color: '#aaa'
        }
      }, `${member.archetype || 'Survivor'}, ${member.age}`);
      
      memberInfo.appendChild(memberName);
      memberInfo.appendChild(memberArchetype);
      
      memberItem.appendChild(avatar);
      memberItem.appendChild(memberInfo);
      membersList.appendChild(memberItem);
    });
    
    // Create tribe attributes
    const attributesContainer = createElement('div', {
      className: 'tribe-attributes',
      style: {
        marginTop: '15px',
        padding: '10px',
        backgroundColor: 'rgba(0, 0, 0, 0.2)',
        borderRadius: '4px'
      }
    });
    
    // Create attribute list
    const attributesList = createElement('div', {
      className: 'attributes-list',
      style: {
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '8px',
        fontSize: '0.9rem'
      }
    });
    
    // Add attributes
    if (tribe.attributes) {
      Object.entries(tribe.attributes).forEach(([key, value]) => {
        const attributeItem = createElement('div', {
          className: 'attribute-item',
          style: {
            display: 'flex',
            justifyContent: 'space-between'
          }
        });
        
        attributeItem.appendChild(
          createElement('span', { style: { color: '#bbb' } }, key.charAt(0).toUpperCase() + key.slice(1))
        );
        
        attributeItem.appendChild(
          createElement('span', { style: { color: '#fff' } }, value.toString())
        );
        
        attributesList.appendChild(attributeItem);
      });
      
      attributesContainer.appendChild(attributesList);
    }
    
    // Assemble card
    card.appendChild(tribeName);
    card.appendChild(tribeInfo);
    card.appendChild(membersList);
    
    if (tribe.attributes) {
      card.appendChild(attributesContainer);
    }
    
    return card;
  },
  
  /**
   * Clean up the screen when it's hidden
   */
  teardown() {
    // Any cleanup code when leaving the screen
    console.log('TribeDivisionScreen teardown');
  }
};

export default TribeDivisionScreen;