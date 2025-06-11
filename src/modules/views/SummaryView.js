/**
 * @module SummaryView
 * Renders the summary of camp activities after the 2-hour timer expires
 */

import { createElement, clearChildren, addDebugBanner } from '../utils/index.js';
import { gameManager } from '../core/index.js';
import { getActivitySummary } from '../utils/ActivityTracker.js';

export default function renderSummary(container) {
  console.log('renderSummary() called');
  addDebugBanner('renderSummary() called', 'purple', 40);

  clearChildren(container);

  container.style.backgroundImage = "url('Assets/parch-landscape.png')";
  container.style.backgroundSize = 'contain';
  container.style.backgroundPosition = 'center';
  container.style.backgroundRepeat = 'no-repeat';
  container.style.backgroundColor = '#8B4513';

  const wrapper = createElement('div', {
    className: 'summary-wrapper',
    style: `
      position: relative;
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: flex-start;
      overflow-y: auto;
      padding: 20px;
      box-sizing: border-box;
    `
  });

  // Get activity data
  const summary = getActivitySummary();

  // Title
  const title = createElement('h1', {
    style: `
      color: #2d1810;
      text-shadow: 1px 1px 2px rgba(255,255,255,0.3);
      font-size: 2.5rem;
      font-family: 'Survivant', serif;
      text-align: center;
      margin: 20px 0;
      font-weight: bold;
    `
  }, 'Camp Activity Summary');

  wrapper.appendChild(title);

  // Create sections for different activities
  const sections = [
    {
      title: '🎣 Fishing Activities',
      data: summary.fishing,
      render: (data) => [
        `Total Fishing Attempts: ${data.totalAttempts}`,
        `Successful Catches: ${data.successfulAttempts}`,
        `Total Fish Caught: ${data.totalFishCaught}`,
        `Success Rate: ${data.totalAttempts > 0 ? Math.round((data.successfulAttempts / data.totalAttempts) * 100) : 0}%`,
        `Fish Types: ${data.fishByType.common} Common, ${data.fishByType.uncommon} Uncommon, ${data.fishByType.rare} Rare`
      ]
    },
    {
      title: '🔥 Fire Management',
      data: summary.fire,
      render: (data) => [
        `Fire Attempts: ${data.totalAttempts}`,
        `Successful Fire Actions: ${data.successfulAttempts}`,
        `Fire Builds: ${data.builds}`,
        `Fire Tending: ${data.tends}`,
        `Firewood Used: ${data.totalFirewoodUsed}`,
        `Success Rate: ${data.totalAttempts > 0 ? Math.round((data.successfulAttempts / data.totalAttempts) * 100) : 0}%`
      ]
    },
    {
      title: '🍳 Cooking Activities',
      data: summary.cooking,
      render: (data) => {
        const items = Object.entries(data.itemsCooked).map(([item, count]) => `${item}: ${count}`).join(', ');
        return [
          `Cooking Attempts: ${data.totalAttempts}`,
          `Successful Cooks: ${data.successfulCooks}`,
          `Items Cooked: ${items || 'None'}`
        ];
      }
    },
    {
      title: '🏠 Shelter Building',
      data: summary.shelter,
      render: (data) => [
        `Shelter Builds: ${data.totalBuilds}`,
        `Co-builders: ${data.coBuilders.join(', ') || 'None'}`,
        `Bamboo Used: ${data.totalBambooUsed}`,
        `Palm Fronds Used: ${data.totalPalmsUsed}`
      ]
    },
    {
      title: '🌿 Resource Gathering',
      data: summary.resources,
      render: (data) => {
        return Object.entries(data).map(([resource, info]) => 
          `${resource}: ${info.total} (from ${info.locations.join(', ')})`
        );
      }
    },
    {
      title: '💧 Water Collection',
      data: summary.water,
      render: (data) => [
        `Total Water Gathered: ${data.totalGathered}`,
        `For Personal Use: ${data.forSelf}`,
        `For Tribe: ${data.forTribe}`
      ]
    },
    {
      title: '🤝 Team Player Actions',
      data: summary.teamPlayer,
      render: (data) => [
        `Team Player Changes: ${data.totalChanges}`,
        `Net Team Player Points: ${data.netGain > 0 ? '+' : ''}${data.netGain}`,
        `Actions: ${[...new Set(data.reasons)].join(', ') || 'None'}`
      ]
    }
  ];

  // Create summary cards
  sections.forEach(section => {
    if (section.data && (
      (typeof section.data === 'object' && Object.keys(section.data).length > 0) ||
      (typeof section.data === 'number' && section.data > 0) ||
      (Array.isArray(section.data) && section.data.length > 0)
    )) {
      const card = createElement('div', {
        style: `
          background: rgba(255, 248, 231, 0.9);
          border: 2px solid #8B4513;
          border-radius: 10px;
          padding: 15px;
          margin: 10px 0;
          width: 100%;
          max-width: 600px;
          box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
        `
      });

      const cardTitle = createElement('h3', {
        style: `
          color: #2d1810;
          font-family: 'Survivant', serif;
          font-size: 1.4rem;
          margin: 0 0 10px 0;
          text-align: center;
          font-weight: bold;
        `
      }, section.title);

      card.appendChild(cardTitle);

      const details = section.render(section.data);
      details.forEach(detail => {
        const detailElement = createElement('div', {
          style: `
            color: #2d1810;
            font-family: 'Survivant', serif;
            font-size: 1rem;
            margin: 5px 0;
            padding: 3px 0;
            border-bottom: 1px solid rgba(139, 69, 19, 0.2);
          `
        }, detail);
        card.appendChild(detailElement);
      });

      wrapper.appendChild(card);
    }
  });

  // Session summary
  const sessionCard = createElement('div', {
    style: `
      background: rgba(255, 215, 0, 0.2);
      border: 2px solid #DAA520;
      border-radius: 10px;
      padding: 15px;
      margin: 20px 0;
      width: 100%;
      max-width: 600px;
      box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
    `
  });

  const sessionTitle = createElement('h3', {
    style: `
      color: #2d1810;
      font-family: 'Survivant', serif;
      font-size: 1.4rem;
      margin: 0 0 10px 0;
      text-align: center;
      font-weight: bold;
    `
  }, '⏱️ Session Summary');

  sessionCard.appendChild(sessionTitle);

  const sessionDuration = Math.round(summary.session.duration / 1000 / 60); // minutes
  const sessionDetails = [
    `Session Duration: ${sessionDuration} minutes`,
    `Unique Areas Visited: ${summary.session.uniqueViewsVisited}`,
    `Current Day: ${gameManager.getCurrentDay()}`
  ];

  sessionDetails.forEach(detail => {
    const detailElement = createElement('div', {
      style: `
        color: #2d1810;
        font-family: 'Survivant', serif;
        font-size: 1rem;
        margin: 5px 0;
        padding: 3px 0;
        border-bottom: 1px solid rgba(218, 165, 32, 0.3);
      `
    }, detail);
    sessionCard.appendChild(detailElement);
  });

  wrapper.appendChild(sessionCard);

  container.appendChild(wrapper);

  // Action Bar Buttons
  const actionButtons = document.getElementById('action-buttons');
  if (actionButtons) {
    clearChildren(actionButtons);

    actionButtons.style.justifyContent = 'center';
    actionButtons.style.gap = '20px';
    actionButtons.style.padding = '0';

    const createIconButton = (src, alt, onClick) => {
      const wrapper = createElement('div', {
        style: `
          width: 240px;
          height: 135px;
          display: inline-block;
          overflow: hidden;
          cursor: pointer;
          position: relative;
        `
      });

      const image = createElement('img', {
        src,
        alt,
        style: `
          width: 100%;
          height: 100%;
          display: block;
          object-fit: contain;
          pointer-events: none;
        `
      });

      wrapper.appendChild(image);
      if (onClick) wrapper.addEventListener('click', onClick);
      return wrapper;
    };

    const continueButton = createIconButton('Assets/Buttons/blank.png', 'Continue', () => {
      console.log('Continue button clicked - proceeding to next phase');
      // This would typically advance to the next game phase
      alert('Summary complete! Game would continue to next phase.');
    });

    // Add "Continue" text overlay
    const textOverlay = createElement('div', {
      style: `
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        color: white;
        font-size: 1.3rem;
        font-family: 'Survivant', sans-serif;
        text-shadow: 1px 1px 2px black;
        pointer-events: none;
      `
    }, 'Continue');
    continueButton.appendChild(textOverlay);

    actionButtons.appendChild(continueButton);
  }

  addDebugBanner('Summary view rendered!', 'purple', 170);
}