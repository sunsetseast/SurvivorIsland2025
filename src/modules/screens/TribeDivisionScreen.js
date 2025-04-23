/**
 * @module TribeDivisionScreen
 * Screen for dividing survivors into tribes
 */

import { getElement, createElement, clearChildren } from '../utils/index.js';
import { gameManager, eventManager } from '../core/index.js';
import { GameEvents } from '../core/EventManager.js';

export default class TribeDivisionScreen {
  initialize() {
    console.log('TribeDivisionScreen initialized');
  }

  setup(data = {}) {
    const screen = getElement('tribe-division-screen');
    if (!screen) {
      console.error('Tribe division screen element not found');
      return;
    }

    clearChildren(screen);

    const title = createElement('h1', { className: 'screen-title' }, 'Tribe Division');
    const subtitle = createElement('p', { className: 'screen-subtitle' }, `Day 1: The tribes are being formed!`);

    const tribesContainer = createElement('div', { className: 'tribes-container' });
    const loadingMessage = createElement('p', { id: 'loading-message' }, 'Drawing tribes...');
    tribesContainer.appendChild(loadingMessage);

    const continueButton = createElement('button', {
      id: 'continue-button',
      style: { display: 'none' },
      onclick: () => gameManager.setGameState('camp')
    }, 'Go to Camp');

    screen.appendChild(title);
    screen.appendChild(subtitle);
    screen.appendChild(tribesContainer);
    screen.appendChild(continueButton);

    setTimeout(() => this._displayTribes(tribesContainer), 1500);

    eventManager.publish(GameEvents.SCREEN_CHANGED, {
      screenId: 'tribeDivision',
      data
    });
  }

  _displayTribes(container) {
    const loading = getElement('loading-message');
    if (loading) loading.remove();

    const tribes = gameManager.getTribes();
    if (!tribes || tribes.length === 0) {
      container.appendChild(createElement('p', {}, 'Error loading tribes'));
      return;
    }

    tribes.forEach(tribe => {
      const card = this._createTribeCard(tribe);
      container.appendChild(card);
    });

    const continueButton = getElement('continue-button');
    if (continueButton) continueButton.style.display = 'block';

    setTimeout(() => {
      const members = document.querySelectorAll('.tribe-member');
      members.forEach((el, i) => {
        setTimeout(() => {
          el.style.opacity = '1';
          el.style.transform = 'translateY(0)';
        }, i * 100);
      });
    }, 500);
  }

  _createTribeCard(tribe) {
    const card = createElement('div', {
      className: 'tribe-card',
      style: {
        border: `3px solid ${tribe.tribeColor}`
      }
    });

    const name = createElement('h2', {
      className: 'tribe-name'
    }, tribe.tribeName);

    const info = createElement('div', { className: 'tribe-info' }, [
      createElement('span', {}, `Members: ${tribe.members.length}`)
    ]);

    const membersList = createElement('div', { className: 'members-list' });

    tribe.members.forEach(member => {
      const memberEl = createElement('div', {
        className: 'tribe-member',
        style: {
          opacity: '0',
          transform: 'translateY(10px)'
        }
      });

      const avatar = createElement('div', {
        className: 'member-avatar',
        style: {
          backgroundImage: member.avatarUrl ? `url(${member.avatarUrl})` : '',
          backgroundSize: 'cover'
        }
      });

      const name = createElement('div', { className: 'member-name' },
        member.name + (member.isPlayer ? ' (You)' : '')
      );

      const archetype = createElement('div', { className: 'member-archetype' },
        `${member.archetype || 'Survivor'}, ${member.age}`
      );

      const info = createElement('div', { className: 'member-info' }, [name, archetype]);
      memberEl.appendChild(avatar);
      memberEl.appendChild(info);
      membersList.appendChild(memberEl);
    });

    const attributes = createElement('div', { className: 'tribe-attributes' });

    if (tribe.attributes) {
      Object.entries(tribe.attributes).forEach(([key, val]) => {
        attributes.appendChild(createElement('div', { className: 'attribute-item' }, [
          createElement('span', {}, key),
          createElement('span', {}, val.toString())
        ]));
      });
    }

    card.appendChild(name);
    card.appendChild(info);
    card.appendChild(membersList);
    if (tribe.attributes) card.appendChild(attributes);

    return card;
  }

  teardown() {
    console.log('TribeDivisionScreen teardown');
  }
}