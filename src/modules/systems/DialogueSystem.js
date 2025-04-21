/**
 * @module DialogueSystem
 * Handles in-game dialogues, messages, and popups
 */

import { getElement, createElement, clearChildren } from '../utils/DOMUtils.js';
import eventManager, { GameEvents } from '../core/EventManager.js';
import timerManager from '../utils/TimerManager.js';

class DialogueSystem {
  constructor(gameManager) {
    this.gameManager = gameManager;
    this.dialogueContainer = null;
    this.isDialogueShowing = false;
    this.dialogueQueue = [];
    this.dialogueAnimationInProgress = false;
    this.processDialogueTimeout = null;
    this.callbacks = new Map(); // Map of dialogue IDs to callbacks
    this.defaultCloseCallback = () => {}; // Default callback when a dialogue is closed
  }
  
  /**
   * Initialize the dialogue system
   */
  initialize() {
    console.log('Initializing DialogueSystem');
    
    // Create dialogue container if it doesn't exist
    if (!getElement('dialogue-container')) {
      this._createDialogueContainer();
    }
    
    this.dialogueContainer = getElement('dialogue-container');
    
    if (!this.dialogueContainer) {
      console.error('Failed to create dialogue container');
      return;
    }
    
    // Hide the container initially
    this.dialogueContainer.style.display = 'none';
    
    // Subscribe to game events if needed
    eventManager.subscribe(GameEvents.GAME_STATE_CHANGED, this._handleGameStateChanged.bind(this));
  }
  
  /**
   * Handle game state changed event
   * @param {Object} data - Event data
   * @private
   */
  _handleGameStateChanged(data) {
    // Clear any existing dialogues when game state changes
    this.clearAllDialogues();
  }
  
  /**
   * Create the dialogue container
   * @private
   */
  _createDialogueContainer() {
    const body = document.body;
    
    const container = createElement('div', {
      id: 'dialogue-container',
      style: {
        position: 'fixed',
        top: '0',
        left: '0',
        width: '100%',
        height: '100%',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        zIndex: '1000',
        opacity: '0',
        transition: 'opacity 0.3s ease',
        backdropFilter: 'blur(2px)',
        WebkitBackdropFilter: 'blur(2px)'
      }
    });
    
    body.appendChild(container);
  }
  
  /**
   * Show a dialogue
   * @param {string} message - The message to display
   * @param {Array} options - Array of option strings
   * @param {Function} callback - Function to call when dialogue is closed
   * @param {Object} styles - Additional styles for the dialogue
   * @returns {string} Dialogue ID
   */
  showDialogue(message, options = ["OK"], callback = null, styles = {}) {
    if (!this.dialogueContainer) {
      console.error('Dialogue container not found');
      return null;
    }
    
    const dialogueId = `dialogue-${Date.now()}`;
    
    // If a dialogue is already showing, queue this one
    if (this.isDialogueShowing || this.dialogueAnimationInProgress) {
      this.dialogueQueue.push({
        id: dialogueId,
        message,
        options,
        callback,
        styles
      });
      
      return dialogueId;
    }
    
    // Set flags
    this.isDialogueShowing = true;
    this.dialogueAnimationInProgress = true;
    
    // Store callback if provided
    if (callback) {
      this.callbacks.set(dialogueId, callback);
    }
    
    // Clear container
    clearChildren(this.dialogueContainer);
    
    // Create dialogue box
    const dialogueBox = createElement('div', {
      className: 'dialogue-box',
      style: {
        backgroundColor: styles.backgroundColor || 'rgba(40, 40, 40, 0.95)',
        borderRadius: '8px',
        padding: '1.5rem',
        maxWidth: '80%',
        maxHeight: '80%',
        overflow: 'auto',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5)',
        transform: 'translateY(20px)',
        opacity: '0',
        transition: 'transform 0.3s ease, opacity 0.3s ease',
        ...styles
      }
    });
    
    // Add message
    const messageElement = createElement('div', {
      className: 'dialogue-message',
      style: {
        color: '#fff',
        marginBottom: '1.5rem',
        lineHeight: '1.5',
        fontSize: '1.1rem'
      }
    });
    
    // Support HTML in messages if flagged as safe
    if (styles.isHtml) {
      messageElement.innerHTML = message;
    } else {
      messageElement.textContent = message;
    }
    
    dialogueBox.appendChild(messageElement);
    
    // Add options
    const optionsContainer = createElement('div', {
      className: 'dialogue-options',
      style: {
        display: 'flex',
        justifyContent: 'flex-end',
        gap: '0.5rem',
        flexWrap: 'wrap'
      }
    });
    
    options.forEach((option, index) => {
      const optionButton = createElement('button', {
        className: `dialogue-option ${index === 0 ? 'primary-option' : 'secondary-option'}`,
        style: {
          padding: '0.6rem 1rem',
          backgroundColor: index === 0 ? '#ff9800' : '#607d8b',
          color: '#fff',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer',
          transition: 'background-color 0.2s'
        },
        onclick: () => {
          // Close dialog
          this.hideDialogue();
          
          // Execute callback with selected option
          const storedCallback = this.callbacks.get(dialogueId) || this.defaultCloseCallback;
          storedCallback(option, index);
          
          // Remove callback
          this.callbacks.delete(dialogueId);
        }
      }, option);
      
      optionsContainer.appendChild(optionButton);
    });
    
    dialogueBox.appendChild(optionsContainer);
    
    // Add to container
    this.dialogueContainer.appendChild(dialogueBox);
    
    // Show container
    this.dialogueContainer.style.display = 'flex';
    
    // Trigger animation
    setTimeout(() => {
      this.dialogueContainer.style.opacity = '1';
      dialogueBox.style.transform = 'translateY(0)';
      dialogueBox.style.opacity = '1';
      
      // Mark animation as complete
      setTimeout(() => {
        this.dialogueAnimationInProgress = false;
      }, 300);
    }, 10);
    
    // Publish event
    eventManager.publish(GameEvents.DIALOGUE_SHOWN, {
      dialogueId,
      message
    });
    
    return dialogueId;
  }
  
  /**
   * Hide the current dialogue
   * @param {Function} callback - Optional callback to run after hiding
   */
  hideDialogue(callback = null) {
    if (!this.isDialogueShowing || !this.dialogueContainer) {
      if (callback) callback();
      return;
    }
    
    // Get dialogue box
    const dialogueBox = this.dialogueContainer.querySelector('.dialogue-box');
    
    if (!dialogueBox) {
      this.isDialogueShowing = false;
      this.dialogueContainer.style.display = 'none';
      if (callback) callback();
      return;
    }
    
    // Set animation flag
    this.dialogueAnimationInProgress = true;
    
    // Trigger hide animation
    this.dialogueContainer.style.opacity = '0';
    dialogueBox.style.transform = 'translateY(20px)';
    dialogueBox.style.opacity = '0';
    
    // Wait for animation to complete
    setTimeout(() => {
      // Hide container
      this.dialogueContainer.style.display = 'none';
      clearChildren(this.dialogueContainer);
      
      // Reset flags
      this.isDialogueShowing = false;
      this.dialogueAnimationInProgress = false;
      
      // Publish event
      eventManager.publish(GameEvents.DIALOGUE_HIDDEN);
      
      // Process next dialogue in queue
      if (this.dialogueQueue.length > 0) {
        const nextDialogue = this.dialogueQueue.shift();
        this.processDialogueTimeout = timerManager.setTimeout(
          'process_next_dialogue',
          () => {
            this.showDialogue(
              nextDialogue.message,
              nextDialogue.options,
              nextDialogue.callback,
              nextDialogue.styles
            );
          },
          250
        );
      }
      
      // Run callback if provided
      if (callback) callback();
    }, 300);
  }
  
  /**
   * Show a notification message
   * @param {string} message - Message to display
   * @param {string} type - Notification type (info, success, warning, error)
   * @param {number} duration - Duration in ms (0 for no auto-close)
   * @returns {string} Notification ID
   */
  showNotification(message, type = 'info', duration = 5000) {
    // Create notification container if it doesn't exist
    let notifContainer = getElement('notification-container');
    
    if (!notifContainer) {
      notifContainer = createElement('div', {
        id: 'notification-container',
        style: {
          position: 'fixed',
          top: '1rem',
          right: '1rem',
          width: '300px',
          zIndex: '900'
        }
      });
      
      document.body.appendChild(notifContainer);
    }
    
    // Notification ID
    const notificationId = `notification-${Date.now()}`;
    
    // Determine styles based on type
    const typeStyles = {
      info: {
        backgroundColor: 'rgba(33, 150, 243, 0.9)',
        icon: 'ℹ️'
      },
      success: {
        backgroundColor: 'rgba(76, 175, 80, 0.9)',
        icon: '✓'
      },
      warning: {
        backgroundColor: 'rgba(255, 152, 0, 0.9)',
        icon: '⚠️'
      },
      error: {
        backgroundColor: 'rgba(244, 67, 54, 0.9)',
        icon: '❌'
      }
    };
    
    const style = typeStyles[type] || typeStyles.info;
    
    // Create notification element
    const notification = createElement('div', {
      id: notificationId,
      className: 'notification',
      style: {
        backgroundColor: style.backgroundColor,
        color: '#fff',
        padding: '0.8rem 1rem',
        marginBottom: '0.5rem',
        borderRadius: '4px',
        boxShadow: '0 2px 10px rgba(0, 0, 0, 0.2)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        opacity: '0',
        transform: 'translateX(100%)',
        transition: 'opacity 0.3s ease, transform 0.3s ease'
      }
    });
    
    // Notification content
    const content = createElement('div', {
      style: {
        display: 'flex',
        alignItems: 'flex-start',
        gap: '0.5rem',
        flex: '1'
      }
    });
    
    // Icon
    const icon = createElement('div', {
      className: 'notification-icon',
      style: {
        flexShrink: '0',
        marginTop: '0.1rem'
      }
    }, style.icon);
    
    // Message
    const messageElement = createElement('div', {
      className: 'notification-message',
      style: {
        lineHeight: '1.4'
      }
    }, message);
    
    // Close button
    const closeButton = createElement('button', {
      className: 'notification-close',
      style: {
        background: 'none',
        border: 'none',
        color: '#fff',
        cursor: 'pointer',
        marginLeft: '0.5rem',
        opacity: '0.7',
        fontSize: '1.1rem',
        padding: '0',
        flexShrink: '0'
      },
      onmouseover: (e) => { e.target.style.opacity = '1'; },
      onmouseout: (e) => { e.target.style.opacity = '0.7'; },
      onclick: () => { this.hideNotification(notificationId); }
    }, '×');
    
    // Assemble notification
    content.appendChild(icon);
    content.appendChild(messageElement);
    notification.appendChild(content);
    notification.appendChild(closeButton);
    
    // Add to container
    notifContainer.appendChild(notification);
    
    // Show with animation
    setTimeout(() => {
      notification.style.opacity = '1';
      notification.style.transform = 'translateX(0)';
    }, 10);
    
    // Auto-close if duration is set
    if (duration > 0) {
      timerManager.setTimeout(`close-notification-${notificationId}`, () => {
        this.hideNotification(notificationId);
      }, duration);
    }
    
    return notificationId;
  }
  
  /**
   * Hide a notification
   * @param {string} notificationId - Notification ID
   */
  hideNotification(notificationId) {
    const notification = getElement(notificationId);
    
    if (!notification) return;
    
    // Hide with animation
    notification.style.opacity = '0';
    notification.style.transform = 'translateX(100%)';
    
    // Remove after animation completes
    setTimeout(() => {
      notification.remove();
      
      // Check if container is empty and remove it if so
      const container = getElement('notification-container');
      if (container && container.children.length === 0) {
        container.remove();
      }
    }, 300);
    
    // Clear any auto-close timer
    timerManager.clearTimeout(`close-notification-${notificationId}`);
  }
  
  /**
   * Show a confirmation dialog
   * @param {string} message - Message to display
   * @param {Function} onConfirm - Function to call when confirmed
   * @param {Function} onCancel - Function to call when canceled
   * @param {Object} options - Custom options
   * @returns {string} Dialog ID
   */
  showConfirmation(message, onConfirm, onCancel = null, options = {}) {
    const confirmText = options.confirmText || 'Confirm';
    const cancelText = options.cancelText || 'Cancel';
    const dialogOptions = [cancelText, confirmText];
    
    const callback = (option, index) => {
      if (index === 1 && onConfirm) {
        onConfirm();
      } else if (index === 0 && onCancel) {
        onCancel();
      }
    };
    
    const styles = {
      backgroundColor: 'rgba(40, 40, 40, 0.95)',
      ...options.styles
    };
    
    return this.showDialogue(message, dialogOptions, callback, styles);
  }
  
  /**
   * Clear all dialogues and the queue
   */
  clearAllDialogues() {
    // Hide current dialogue
    this.hideDialogue();
    
    // Clear queue
    this.dialogueQueue = [];
    
    // Clear timeouts
    timerManager.clearTimeout('process_next_dialogue');
  }
  
  /**
   * Set default callback for dialogues
   * @param {Function} callback - Default callback
   */
  setDefaultCloseCallback(callback) {
    this.defaultCloseCallback = callback;
  }
  
  /**
   * Check if a dialogue is currently showing
   * @returns {boolean} Whether a dialogue is showing
   */
  isShowing() {
    return this.isDialogueShowing;
  }
  
  /**
   * Get the number of queued dialogues
   * @returns {number} Number of queued dialogues
   */
  getQueueLength() {
    return this.dialogueQueue.length;
  }
  
  /**
   * Reset the dialogue system
   */
  reset() {
    this.clearAllDialogues();
    this.callbacks.clear();
    this.defaultCloseCallback = () => {};
  }
}

export default DialogueSystem;