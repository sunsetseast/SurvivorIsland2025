import { createElement } from '../utils/index.js';

/**
 * Creates a survivor card element.
 * @param {object} survivor
 * @param {object} options
 * @param {'select'|'view'} [options.mode='select']
 * @param {Function} [options.onSelect] - Called with survivor or null when selection changes.
 * @param {Function} [options.onFlipStart]
 * @param {Function} [options.onFlipEnd]
 * @returns {HTMLElement}
 */
export function createSurvivorCard(survivor, options = {}) {
  const {
    mode = 'select',
    onSelect,
    onFlipStart,
    onFlipEnd
  } = options;

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
  if (mode === 'view') {
    card.classList.add('reveal');
    card.classList.remove('focused');
    cardWrapper.classList.remove('focused');
    card.style.margin = '0 auto';
  }
  card.dataset.id = survivor.id;

  // FRONT
  const cardFront = createElement('div', { className: 'card-front' });
  const name = createElement('h3', { className: 'survivor-header' });
  name.innerHTML = `${survivor.firstName}<br>${survivor.lastName}`;

  const moreInfoButton = createElement('button', { className: 'card-button' }, 'More Info');

  const chooseButton = mode === 'select'
    ? createElement('button', { className: 'card-button choose-button' })
    : null;

  if (chooseButton) {
    const textSpan = createElement('span', { className: 'button-text' }, 'Choose Survivor');
    chooseButton.appendChild(textSpan);
    chooseButton.style.transition = 'opacity 0.3s ease';
  }

  const buttonContainer = createElement('div', { className: 'card-buttons' });
  buttonContainer.appendChild(moreInfoButton);
  if (chooseButton) buttonContainer.appendChild(chooseButton);
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
    physical: [19.8, 15.7], mental: [50, 15.7], social: [80.2, 15.7],
    strength: [19.8, 30.2], memory: [50, 30.2], connections: [80.2, 30.2],
    speed: [19.8, 45], puzzles: [50, 45], likeability: [80.2, 45],
    endurance: [19.8, 59.8], fortitude: [50, 59.8], interrogation: [80.2, 59.8],
    dexterity: [19.8, 74.6], awareness: [50, 74.6], deception: [80.2, 74.6],
    balance: [19.8, 88.4], focus: [50, 88.4], alliances: [80.2, 88.4]
  };

  Object.entries(traitCoordinates).forEach(([key, [x, y]]) => {
    const value = survivor[key];
    const el = createElement('div', {
      className: 'trait-element',
      style: `--trait-x: ${x}%; --trait-y: ${y}%;`
    }, value?.toString() ?? '?');
    traitCardWrapper.appendChild(el);
  });

  const closeTraitCardButton = createElement('button', {
    className: 'rect-button small close-trait-card'
  }, 'Back');

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

  // --- Flip logic ---
  let flipFallbackTimer = null;
  const flip = (on) => {
    onFlipStart?.();
    if (on) cardWrapper.classList.add('flipped');
    else cardWrapper.classList.remove('flipped');

    const onEnd = () => {
      cardWrapper.removeEventListener('transitionend', onEnd, true);
      clearTimeout(flipFallbackTimer);
      flipFallbackTimer = null;
      onFlipEnd?.();
    };

    cardWrapper.addEventListener('transitionend', onEnd, true);

    clearTimeout(flipFallbackTimer);
    flipFallbackTimer = setTimeout(() => {
      cardWrapper.removeEventListener('transitionend', onEnd, true);
      flipFallbackTimer = null;
      onFlipEnd?.();
    }, 700);
  };

  const moreInfoButtonHandler = () => flip(true);
  const backButtonHandler = () => flip(false);

  moreInfoButton.addEventListener('click', moreInfoButtonHandler);
  backButton.addEventListener('click', backButtonHandler);

  // Choose logic (select mode only)
  if (chooseButton) {
    chooseButton.addEventListener('click', () => {
      const isSelected = card.classList.contains('selected');
      const allCards = document.querySelectorAll('.survivor-card');
      const allButtons = document.querySelectorAll('.choose-button');

      allCards.forEach(c => c.classList.remove('selected'));
      allButtons.forEach(btn => {
        btn.classList.remove('glow-gold');
        const span = btn.querySelector('.button-text');
        if (span) span.textContent = 'Choose Survivor';
        btn.style.backgroundImage = 'url("Assets/rect-button.png")';
        btn.style.backgroundSize = '100% 100%';
        btn.style.backgroundRepeat = 'no-repeat';
        btn.style.backgroundPosition = 'center';
      });

      const textSpan = chooseButton.querySelector('.button-text');

      if (isSelected) {
        if (textSpan) {
          textSpan.textContent = 'Choose Survivor';
          chooseButton.style.backgroundImage = 'url("Assets/rect-button.png")';
          chooseButton.style.backgroundSize = '100% 100%';
          chooseButton.style.backgroundRepeat = 'no-repeat';
          chooseButton.style.backgroundPosition = 'center';
        }
        chooseButton.classList.remove('glow-gold');
        card.classList.remove('selected');
        onSelect?.(null, { card, chooseButton });
      } else {
        card.classList.add('selected');
        if (textSpan) textSpan.textContent = 'Unselect Survivor';
        chooseButton.classList.add('glow-gold');
        onSelect?.(survivor, { card, chooseButton });
      }
    });
  }

  return cardWrapper;
}

export default createSurvivorCard;
