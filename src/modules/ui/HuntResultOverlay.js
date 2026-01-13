/**
 * @module HuntResultOverlay
 * Shows results from idol hunting actions.
 */

import { createElement } from '../utils/DOMUtils.js';

function resolveTitle(result) {
  switch (result?.outcome) {
    case 'IDOL_FOUND':
      return 'Hidden Immunity Idol Found!';
    case 'CLUE_FOUND':
      return 'Idol Clue Found!';
    case 'BLOCKED':
      return 'Search Blocked';
    case 'ERROR':
      return 'Search Error';
    case 'NOTHING':
    default:
      return 'Search Results';
  }
}

function resolveMessage(result) {
  if (result?.message) return result.message;
  switch (result?.outcome) {
    case 'IDOL_FOUND':
      return 'You uncovered a Hidden Immunity Idol.';
    case 'CLUE_FOUND':
      return 'You discovered a clue to the idol.';
    case 'BLOCKED':
      return 'You cannot search here right now.';
    case 'ERROR':
      return 'Something went wrong with the search.';
    case 'NOTHING':
    default:
      return 'Nothing unusual turns up this time.';
  }
}

export function showHuntResultOverlay(result, { onReadClue } = {}) {
  const overlay = createElement('div', {
    className: 'hunt-result-overlay',
    style: `
      display: flex;
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background-color: rgba(0, 0, 0, 0.65);
      z-index: 1500;
      align-items: center;
      justify-content: center;
    `
  });

  const panel = createElement('div', {
    style: `
      background-image: url('Assets/parch-landscape.png');
      background-size: contain;
      background-repeat: no-repeat;
      background-position: center;
      width: min(90vw, 620px);
      height: min(70vh, 380px);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 12px;
      padding: 40px 60px;
      text-align: center;
      color: #2b190a;
      font-family: 'Survivant', sans-serif;
      position: relative;
    `
  });

  const title = createElement('div', {
    style: `
      font-size: 1.4rem;
      text-shadow: 1px 1px 2px rgba(255,255,255,0.5);
    `
  }, resolveTitle(result));

  const iconWrapper = createElement('div', {
    style: `
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 80px;
    `
  });

  const shouldShowIdolIcon = result?.foundIdol || result?.outcome === 'IDOL_FOUND';
  const shouldShowClueIcon = result?.foundClue || result?.outcome === 'CLUE_FOUND';

  if (shouldShowIdolIcon) {
    const idolIcon = createElement('img', {
      src: 'Assets/Idols/hidden1.png',
      alt: 'Hidden Immunity Idol',
      style: `
        width: 90px;
        height: 90px;
        object-fit: contain;
        filter: drop-shadow(2px 2px 3px rgba(0,0,0,0.4));
      `
    });
    iconWrapper.appendChild(idolIcon);
  } else if (shouldShowClueIcon) {
    const clueIcon = createElement('img', {
      src: 'Assets/Idols/clue1.png',
      alt: 'Idol Clue',
      style: `
        width: 70px;
        height: 70px;
        object-fit: contain;
        filter: drop-shadow(2px 2px 3px rgba(0,0,0,0.4));
      `
    });
    iconWrapper.appendChild(clueIcon);
  }

  const message = createElement('div', {
    style: `
      font-size: 1rem;
      line-height: 1.4;
      text-shadow: 1px 1px 2px rgba(255,255,255,0.35);
      max-width: 420px;
    `
  }, resolveMessage(result));

  const buttonRow = createElement('div', {
    style: `
      display: flex;
      gap: 12px;
      margin-top: 8px;
    `
  });

  const closeOverlay = () => {
    if (overlay && overlay.parentNode) {
      overlay.parentNode.removeChild(overlay);
    }
  };

  const okButton = createElement('button', { className: 'rect-button small' }, 'OK');
  okButton.addEventListener('click', (event) => {
    event.stopPropagation();
    closeOverlay();
  });
  buttonRow.appendChild(okButton);

  if (result?.outcome === 'CLUE_FOUND' && result?.clueId && typeof onReadClue === 'function') {
    const readButton = createElement('button', { className: 'rect-button small alt' }, 'Read Clue');
    readButton.addEventListener('click', (event) => {
      event.stopPropagation();
      onReadClue(result);
      closeOverlay();
    });
    buttonRow.appendChild(readButton);
  }

  panel.appendChild(title);
  panel.appendChild(iconWrapper);
  panel.appendChild(message);
  panel.appendChild(buttonRow);
  overlay.appendChild(panel);

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) {
      closeOverlay();
    }
  });

  document.body.appendChild(overlay);
  return closeOverlay;
}
