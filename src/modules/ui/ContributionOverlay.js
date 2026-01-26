import { createElement } from '../utils/index.js';

export function openContributionOverlay({
  overlayId,
  resources,
  initialResourceKey,
  getResourceData,
  onConfirm,
  onInvalid,
  onCancel,
  appendTo = document.body
}) {
  if (!resources || resources.length === 0) {
    console.warn('[ContributionOverlay] No resources supplied.');
    return null;
  }

  const existing = document.getElementById(overlayId);
  if (existing) existing.remove();

  let selectedResourceKey = initialResourceKey || resources[0].key;
  let selectedAmount = 0;

  const overlay = createElement('div', {
    id: overlayId,
    style: `
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.7);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1900;
    `
  });

  const selector = createElement('div', {
    style: `
      width: 260px;
      height: 300px;
      background-image: url('Assets/card-back.png');
      background-size: 100% 100%;
      background-repeat: no-repeat;
      background-position: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 20px 15px;
      box-sizing: border-box;
      gap: 8px;
    `
  });

  const icon = createElement('img', {
    alt: 'Contribution icon',
    style: `
      width: 60px;
      height: 60px;
      object-fit: contain;
    `
  });

  const title = createElement('h3', {
    style: `
      margin: 0;
      font-size: 18px;
      font-weight: bold;
      color: #fff8e7;
      text-shadow: 2px 2px 4px black;
      font-family: 'Survivant', fantasy;
      text-align: center;
      line-height: 1.2;
    `
  });

  const resourceRow = createElement('div', {
    style: `
      display: flex;
      gap: 10px;
      align-items: center;
      justify-content: center;
      flex-wrap: wrap;
    `
  });

  const availableDisplay = createElement('div', {
    style: `
      font-size: 14px;
      color: #fff8e7;
      text-shadow: 1px 1px 2px black;
      font-family: 'Survivant', fantasy;
      text-align: center;
    `
  });

  const controls = createElement('div', {
    style: `
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 15px;
      margin: 8px 0;
    `
  });

  const minusBtn = createElement('img', {
    src: 'Assets/Buttons/minus.png',
    alt: 'Decrease',
    style: `
      width: 40px;
      height: 40px;
      cursor: pointer;
      transition: transform 0.2s;
    `
  });

  const amountDisplay = createElement('span', {
    style: `
      font-size: 28px;
      font-weight: bold;
      color: #fff8e7;
      text-shadow: 2px 2px 4px black;
      font-family: 'Survivant', fantasy;
      min-width: 50px;
      text-align: center;
      display: inline-block;
    `
  }, '0');

  const plusBtn = createElement('img', {
    src: 'Assets/Buttons/add.png',
    alt: 'Increase',
    style: `
      width: 40px;
      height: 40px;
      cursor: pointer;
      transition: transform 0.2s;
    `
  });

  const buttonContainer = createElement('div', {
    style: `
      display: flex;
      gap: 10px;
      margin-top: 6px;
      justify-content: center;
    `
  });

  const contributeButton = createElement('button', {
    className: 'rect-button small',
    style: `
      background-image: url('Assets/rect-button.png');
      background-size: 100% 100%;
      background-repeat: no-repeat;
      background-position: center;
      width: 120px;
      height: 35px;
      border: none;
      color: #fff8e7;
      font-family: 'Survivant', fantasy;
      cursor: pointer;
    `
  }, 'Contribute');

  const cancelButton = createElement('button', {
    className: 'rect-button small',
    style: `
      background-image: url('Assets/rect-button.png');
      background-size: 100% 100%;
      background-repeat: no-repeat;
      background-position: center;
      width: 70px;
      height: 35px;
      border: none;
      color: #fff8e7;
      font-family: 'Survivant', fantasy;
      cursor: pointer;
    `
  }, 'Cancel');

  const updateDisplay = () => {
    const data = getResourceData(selectedResourceKey);
    const available = data?.available ?? 0;
    icon.src = data?.iconSrc || '';
    title.innerHTML = data?.titleHTML || '';
    availableDisplay.textContent = `Available: ${available}`;
    amountDisplay.textContent = String(selectedAmount);

    Array.from(resourceRow.children).forEach(child => {
      const isSelected = child.dataset.resourceKey === selectedResourceKey;
      child.style.border = isSelected ? '2px solid gold' : '2px solid transparent';
      child.style.boxShadow = isSelected ? '0 0 12px rgba(255, 215, 0, 0.7)' : 'none';
    });
  };

  const updateAmount = (delta) => {
    const data = getResourceData(selectedResourceKey);
    const available = data?.available ?? 0;
    selectedAmount = Math.max(0, Math.min(available, selectedAmount + delta));
    amountDisplay.textContent = String(selectedAmount);
  };

  resources.forEach(resource => {
    const button = createElement('button', {
      type: 'button',
      style: `
        width: 46px;
        height: 46px;
        background: transparent;
        border: 2px solid transparent;
        border-radius: 8px;
        padding: 0;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
      `
    });
    button.dataset.resourceKey = resource.key;
    const img = createElement('img', {
      src: resource.iconSrc,
      alt: resource.label || resource.key,
      style: `
        width: 100%;
        height: 100%;
        object-fit: contain;
        pointer-events: none;
      `
    });
    button.appendChild(img);
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      if (selectedResourceKey === resource.key) return;
      selectedResourceKey = resource.key;
      selectedAmount = 0;
      updateDisplay();
    });
    resourceRow.appendChild(button);
  });

  minusBtn.addEventListener('click', () => updateAmount(-1));
  plusBtn.addEventListener('click', () => updateAmount(1));

  contributeButton.addEventListener('click', () => {
    if (selectedAmount <= 0) {
      onInvalid?.(selectedResourceKey);
      return;
    }
    onConfirm?.({ resourceKey: selectedResourceKey, amount: selectedAmount });
    overlay.remove();
  });

  cancelButton.addEventListener('click', () => {
    onCancel?.();
    overlay.remove();
  });

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) {
      onCancel?.();
      overlay.remove();
    }
  });

  controls.appendChild(minusBtn);
  controls.appendChild(amountDisplay);
  controls.appendChild(plusBtn);

  buttonContainer.appendChild(contributeButton);
  buttonContainer.appendChild(cancelButton);

  selector.appendChild(icon);
  selector.appendChild(title);
  if (resources.length > 1) {
    selector.appendChild(resourceRow);
  }
  selector.appendChild(availableDisplay);
  selector.appendChild(controls);
  selector.appendChild(buttonContainer);

  overlay.appendChild(selector);
  appendTo.appendChild(overlay);

  updateDisplay();
  return overlay;
}
