import { createElement, clearChildren } from '../utils/DOMUtils.js';

const FRAME_ASSETS = {
  'beat-ui1': 'Assets/beat-ui1.png',
  'beat-avatar-ui': 'Assets/beat-avatar-ui.png'
};

export function getSurvivorAvatarSrc(survivor) {
  if (!survivor) return 'Assets/logo.png';
  const candidates = [survivor.avatarUrl, survivor.avatar, survivor.portrait, survivor.image, survivor.img];
  const found = candidates.find(Boolean);
  if (found) return found;
  const first = survivor.firstName ? survivor.firstName.toLowerCase() : '';
  if (first) return `Assets/Avatars/${first}.jpeg`;
  return 'Assets/logo.png';
}

class JourneyBeatUI {
  constructor(container) {
    this.container = container;
    this.frameMode = 'beat-ui1';
    this.currentBackground = null;
    this.fadeDurationMs = 200;
    this._styleEl = null;
    this.overlayToken = 'true';
    this._defaultPanelMinHeight = '320px';
    this._clickAnywhereHandler = null;
    this._clickAnywhereTarget = null;
    this._buttonHandlers = new Map();
    this._timeouts = new Set();
    this._beatToken = 0;
    this._advanceLocked = false;
    this.onAdvance = null;

    this.backgroundLayer = createElement('div', {
      dataset: { journeyOverlay: this.overlayToken },
      style: `
        position:absolute;
        inset:0;
        background-size:cover;
        background-position:center;
        background-repeat:no-repeat;
        opacity:1;
        transition: opacity ${this.fadeDurationMs}ms ease;
        z-index:0;
        pointer-events:none;
      `
    });

    this.overlay = createElement('div', {
      className: 'journey-overlay-root',
      dataset: { journeyOverlay: this.overlayToken },
      style: `position:absolute; inset:0; display:flex; align-items:center; justify-content:center; z-index:7000;`
    });

    this.vignetteLayer = createElement('div', {
      dataset: { journeyOverlay: this.overlayToken },
      style: `position:absolute; inset:0; background:radial-gradient(circle at center, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0.35) 55%, rgba(0,0,0,0.65) 100%); pointer-events:none;`
    });

    this.beatLayer = createElement('div', {
      style: `position:absolute; inset:0; display:flex; align-items:center; justify-content:center;`
    });

    this.panel = createElement('div', {
      style: `position:relative; width:min(92vw, 900px); height:min(74vh, 600px); max-height:74vh; display:flex; align-items:center; justify-content:center;`
    });

    this.avatarImg = createElement('img', {
      style: `position:absolute; width:36%; height:auto; top:10%; left:9%; border-radius:50%; object-fit:cover; border:4px solid #caa15a; display:none; z-index:0;`
    });

    this.frameImg = createElement('img', {
      style: `position:absolute; inset:0; width:100%; height:100%; object-fit:contain; pointer-events:none; z-index:1;`
    });

    this.nameLabel = createElement('div', {
      style: `position:absolute; top:11%; left:40%; right:10%; text-align:center; font-family:'Survivant', sans-serif; font-weight:700; letter-spacing:1px; color:#f7e6c5; text-shadow:0 2px 4px rgba(0,0,0,0.55); display:none; z-index:2; font-size:clamp(0.9rem, 2.6vw, 1.15rem);`
    });

    this.contentArea = createElement('div', {
      style: `position:absolute; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; font-family:'Survivant', sans-serif; color:#2b1b0f; text-shadow:0 1px 0 rgba(255,255,255,0.6); gap:clamp(8px, 2vw, 14px); z-index:2;`
    });

    this.titleEl = createElement('div', {
      style: `font-size:clamp(0.95rem, 3vw, 1.2rem); font-weight:700; text-transform:uppercase; letter-spacing:1px;`
    });

    this.textArea = createElement('div', {
      style: `width:100%; display:flex; flex-direction:column; gap:8px; font-size:clamp(0.9rem, 2.6vw, 1.08rem); line-height:1.4;`
    });

    this.buttonsArea = this.createButtonsArea();

    this.contentArea.append(this.titleEl, this.textArea);
    this.panel.append(this.avatarImg, this.frameImg, this.nameLabel, this.contentArea, this.buttonsArea);
    this.beatLayer.append(this.panel);

    this.jeffLayer = createElement('div', {
      style: `position:absolute; inset:0; display:none; align-items:flex-start; justify-content:flex-start; flex-direction:column; padding-top:clamp(24px, 6vh, 72px);`
    });

    this.jeffContent = createElement('div', {
      style: `width:100%; display:flex; flex-direction:column; align-items:center; justify-content:flex-start; gap:clamp(12px, 3vh, 22px);`
    });

    this.parchmentWrapper = createElement('div', {
      style: `position:relative; width:min(92vw, 900px); max-width:900px;`
    });

    this.parchmentImg = createElement('img', {
      src: 'Assets/parch-landscape.png',
      style: `width:100%; height:auto; display:block; margin:0 auto;`
    });

    this.jeffText = createElement('div', {
      className: 'parchment-text',
      style: `
        position:absolute;
        inset:12% 8% 12% 8%;
        display:flex;
        flex-direction:column;
        justify-content:center;
        align-items:center;
        color: #fff;
        font-family: 'Survivant', sans-serif;
        font-weight: 700;
        text-align: center;
        font-size: clamp(0.95rem, 2.6vw, 1.1rem);
        line-height: 1.4;
        text-shadow:
          0 1px 0 #000,
          0 2px 0 #000,
          0 3px 0 #000,
          0 4px 6px rgba(0, 0, 0, 0.6);
      `
    });

    this.jeffButtonsArea = createElement('div', {
      style: `display:flex; flex-direction:column; align-items:center; gap:10px; width:min(70vw, 360px);`
    });

    this.parchmentWrapper.append(this.parchmentImg, this.jeffText);
    this.jeffContent.append(this.parchmentWrapper, this.jeffButtonsArea);
    this.jeffLayer.append(this.jeffContent);

    this.topParchmentLayer = createElement('div', {
      style: 'position:absolute; inset:0; display:none; pointer-events:auto;'
    });

    this.topParchmentWrapper = createElement('div', {
      style: `
        position: relative;
        width: 100%;
        max-width: 320px;
        margin: 30px auto 0;
      `
    });

    this.topParchmentImg = createElement('img', {
      src: 'Assets/parch-landscape.png',
      style: `
        width: 100%;
        max-width: 320px;
        max-height: 180px;
        display: block;
        margin: 0 auto;
      `
    });

    this.topParchmentText = createElement('div', {
      style: `
        color: white;
        font-family: 'Survivant', sans-serif;
        font-weight: bold;
        text-align: center;
        margin: -160px auto 0;
        max-width: 260px;
        font-size: 0.95rem;
        line-height: 1.3;
        text-shadow:
          0 1px 0 #000,
          0 2px 0 #000,
          0 3px 0 #000,
          0 4px 4px rgba(0, 0, 0, 0.5);
      `
    });

    this.topParchmentButton = createElement('button', {
      style: `
        position: absolute;
        bottom: 40px;
        left: 50%;
        transform: translateX(-50%);
        width: 130px;
        height: 60px;
        background-image: url('Assets/rect-button.png');
        background-size: contain;
        background-repeat: no-repeat;
        background-position: center;
        border: none;
        color: white;
        font-family: 'Survivant', sans-serif;
        font-weight: bold;
        text-shadow: 1px 1px 2px #000;
        cursor: pointer;
      `
    }, 'Continue');

    this.topParchmentWrapper.append(this.topParchmentImg, this.topParchmentText);
    this.topParchmentLayer.append(this.topParchmentWrapper, this.topParchmentButton);

    this.parchTopLayer = createElement('div', {
      style: `position:absolute; inset:0; display:none; align-items:flex-start; justify-content:center; padding-top:clamp(16px, 5vh, 56px); pointer-events:auto;`
    });

    this.parchTopContent = createElement('div', {
      style: `display:flex; flex-direction:column; align-items:center; width:100%;`
    });

    this.parchTopWrapper = createElement('div', {
      style: `position:relative; width:min(75vw, 760px); max-width:760px;`
    });

    this.parchTopImg = createElement('img', {
      src: 'Assets/parch-landscape.png',
      style: `width:100%; height:auto; display:block; margin:0 auto;`
    });

    this.parchTopText = createElement('div', {
      style: `
        position:absolute;
        inset:12% 8% 12% 8%;
        padding:clamp(8px, 2vw, 18px);
        box-sizing:border-box;
        display:flex;
        flex-direction:column;
        justify-content:center;
        align-items:center;
        color:#fff;
        font-family:'Survivant', sans-serif;
        font-weight:700;
        text-align:center;
        font-size:clamp(0.9rem, 2.6vw, 1.08rem);
        line-height:1.4;
        text-shadow:
          0 1px 0 #000,
          0 2px 0 #000,
          0 3px 0 #000,
          0 4px 6px rgba(0, 0, 0, 0.6);
      `
    });

    this.parchTopButtons = createElement('div', {
      style: `margin:12px auto 0; display:flex; flex-direction:column; align-items:center; gap:10px; width:min(70vw, 360px);`
    });

    this.parchTopWrapper.append(this.parchTopImg, this.parchTopText);
    this.parchTopContent.append(this.parchTopWrapper, this.parchTopButtons);
    this.parchTopLayer.append(this.parchTopContent);

    this.sceneFirstLayer = createElement('div', {
      style: `position:absolute; inset:0; display:none; pointer-events:none;`
    });

    this.sceneFirstButton = createElement('img', {
      src: 'Assets/Buttons/up.png',
      alt: 'Continue',
      style: `
        position:absolute;
        left:50%;
        bottom:clamp(18px, 4vh, 36px);
        transform:translateX(-50%);
        width:min(220px, 46vw);
        height:auto;
        max-width:240px;
        cursor: pointer;
        pointer-events:auto;
        transition: transform 0.08s ease;
      `,
      role: 'button',
      tabIndex: 0
    });

    this.sceneFirstLayer.append(this.sceneFirstButton);

    this.bottomChoiceLayer = createElement('div', {
      style: `position:absolute; inset:0; display:none; align-items:flex-end; justify-content:center; padding-bottom:clamp(24px, 6vh, 64px); pointer-events:auto;`
    });

    this.bottomChoiceBar = createElement('div', {
      style: `display:flex; gap:clamp(16px, 4vw, 40px); align-items:center; justify-content:center;`
    });

    this.bottomChoiceLayer.append(this.bottomChoiceBar);

    this.overlay.append(
      this.vignetteLayer,
      this.beatLayer,
      this.jeffLayer,
      this.topParchmentLayer,
      this.parchTopLayer,
      this.sceneFirstLayer,
      this.bottomChoiceLayer
    );

    this.setFrame('beat-ui1');

    container.appendChild(this.backgroundLayer);
    container.appendChild(this.overlay);

    this._sceneAdvancePressHandlers = {
      down: () => {
        this.sceneFirstButton.style.transform = 'translateX(-50%) scale(0.98)';
      },
      up: () => {
        this.sceneFirstButton.style.transform = 'translateX(-50%)';
      }
    };
    this.sceneFirstButton.addEventListener('pointerdown', this._sceneAdvancePressHandlers.down);
    this.sceneFirstButton.addEventListener('pointerup', this._sceneAdvancePressHandlers.up);
    this.sceneFirstButton.addEventListener('pointerleave', this._sceneAdvancePressHandlers.up);
  }

  createButtonsArea() {
    return createElement('div', {
      style: `position:absolute; left:50%; transform:translateX(-50%); display:flex; flex-direction:column; align-items:center; gap:10px; z-index:2; max-height:32%; overflow-y:auto; padding:4px 0;`
    });
  }

  setBackground(src) {
    if (!this.backgroundLayer) return;
    this.backgroundLayer.style.backgroundImage = src ? `url('${src}')` : 'none';
    this.currentBackground = src || null;
  }

  setSceneBackground(src) {
    this.setBackground(src);
  }

  transitionBackground(src) {
    if (!this.backgroundLayer) {
      this.setSceneBackground(src);
      return Promise.resolve();
    }
    if (src === this.currentBackground) {
      return Promise.resolve();
    }

    const waitForTransition = () => new Promise(resolve => {
      const duration = window.getComputedStyle(this.backgroundLayer).transitionDuration || '0s';
      const maxDuration = duration
        .split(',')
        .map(value => parseFloat(value) || 0)
        .reduce((max, value) => Math.max(max, value), 0);
      if (!maxDuration) {
        resolve();
        return;
      }
      const handleTransition = (event) => {
        if (event.target !== this.backgroundLayer || event.propertyName !== 'opacity') return;
        this.backgroundLayer.removeEventListener('transitionend', handleTransition);
        resolve();
      };
      this.backgroundLayer.addEventListener('transitionend', handleTransition, { once: true });
    });

    return new Promise(resolve => {
      this.backgroundLayer.style.opacity = '0';
      waitForTransition().then(() => {
        this.setSceneBackground(src);
        requestAnimationFrame(() => {
          this.backgroundLayer.style.opacity = '1';
          waitForTransition().then(resolve);
        });
      });
    });
  }

  setFrame(mode) {
    const resolvedMode = mode || 'beat-ui1';
    this.frameMode = resolvedMode;
    const frameSrc = FRAME_ASSETS[resolvedMode] || FRAME_ASSETS['beat-ui1'];
    this.frameImg.src = frameSrc;

    if (resolvedMode === 'beat-avatar-ui') {
      this.applyAvatarUILayout();
    } else {
      this.applyBeatUI1Layout();
    }
  }

  applyBeatUI1Layout() {
    this.panel.style.width = 'min(92vw, 900px)';
    this.panel.style.height = 'min(74vh, 600px)';
    this.panel.style.maxHeight = '74vh';
    this.panel.style.aspectRatio = '';
    this.panel.style.transform = 'none';
    this.panel.style.minHeight = this._defaultPanelMinHeight;
    this.panel.style.maxWidth = '900px';
    this.panel.style.backgroundSize = 'contain';
    this.panel.style.backgroundRepeat = 'no-repeat';

    this.avatarImg.style.display = 'none';
    this.nameLabel.style.display = 'none';
    this.contentArea.style.top = '18%';
    this.contentArea.style.left = '10%';
    this.contentArea.style.right = '12%';
    this.contentArea.style.bottom = '30%';
    this.buttonsArea.style.bottom = '10%';
    this.buttonsArea.style.width = '62%';
    this.buttonsArea.style.maxWidth = '440px';
    this.buttonsArea.style.maxHeight = '28%';
  }

  applyAvatarUILayout() {
    this.panel.style.width = 'min(92vw, 900px)';
    this.panel.style.height = 'min(74vh, 620px)';
    this.panel.style.maxHeight = '74vh';
    this.panel.style.aspectRatio = '';
    this.panel.style.transform = 'none';
    this.panel.style.minHeight = this._defaultPanelMinHeight;
    this.panel.style.maxWidth = '900px';
    this.panel.style.backgroundSize = 'contain';
    this.panel.style.backgroundRepeat = 'no-repeat';

    this.avatarImg.style.display = 'block';
    this.nameLabel.style.display = 'block';
    this.contentArea.style.top = '26%';
    this.contentArea.style.left = '42%';
    this.contentArea.style.right = '10%';
    this.contentArea.style.bottom = '30%';
    this.buttonsArea.style.bottom = '10%';
    this.buttonsArea.style.width = '48%';
    this.buttonsArea.style.maxWidth = '360px';
    this.buttonsArea.style.maxHeight = '28%';
  }

  setTopMode(enabled) {
    this.isTopMode = Boolean(enabled);
    if (this.isTopMode) {
      this.beatLayer.style.alignItems = 'flex-start';
      this.beatLayer.style.paddingTop = 'clamp(16px, 4vh, 48px)';
      this.beatLayer.style.paddingBottom = '0';
    } else {
      this.beatLayer.style.alignItems = 'center';
      this.beatLayer.style.paddingTop = '0';
      this.beatLayer.style.paddingBottom = '0';
    }
  }

  setSpeaker(survivor) {
    this.avatarImg.src = getSurvivorAvatarSrc(survivor);
    this.nameLabel.textContent = (survivor?.firstName || survivor?.name || 'SURVIVOR').toUpperCase();
  }

  setButtonHandler(button, handler) {
    const existing = this._buttonHandlers.get(button);
    if (existing) {
      button.removeEventListener('click', existing);
      this._buttonHandlers.delete(button);
    }
    if (handler) {
      const wrapped = (event) => {
        this.onAdvance = handler;
        this.safeAdvance(event);
      };
      button.addEventListener('click', wrapped);
      this._buttonHandlers.set(button, wrapped);
    }
  }

  clearButtonHandlers() {
    this._buttonHandlers.forEach((handler, button) => {
      button.removeEventListener('click', handler);
    });
    this._buttonHandlers.clear();
  }

  clearClickAnywhere() {
    if (this._clickAnywhereHandler && this._clickAnywhereTarget) {
      this._clickAnywhereTarget.removeEventListener('click', this._clickAnywhereHandler);
    }
    this._clickAnywhereHandler = null;
    this._clickAnywhereTarget = null;
  }

  removeAllAdvanceListeners() {
    this.clearClickAnywhere();
    this.clearButtonHandlers();
    this._timeouts.forEach(id => window.clearTimeout(id));
    this._timeouts.clear();
  }

  safeAdvance(event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    if (this._advanceLocked) return;
    this._advanceLocked = true;

    this.removeAllAdvanceListeners();

    if (typeof this.onAdvance === 'function') {
      this.onAdvance();
    }
  }

  enableClickAnywhere(onAdvance) {
    if (typeof onAdvance !== 'function') return;
    this.clearClickAnywhere();
    this.onAdvance = onAdvance;
    const handler = (event) => {
      if (event.target.closest('button')) return;
      this.safeAdvance(event);
    };
    this._clickAnywhereHandler = handler;
    this._clickAnywhereTarget = this.overlay;
    this._clickAnywhereTarget.addEventListener('click', handler);
  }

  clearButtons() {
    this.buttonsArea.innerHTML = '';
  }

  createButton(label, onClick) {
    const button = createElement('button', {
      className: 'rect-button',
      style: `width:100%; min-width:180px;`,
      type: 'button'
    }, label);
    this.setButtonHandler(button, onClick);
    return button;
  }

  showOverlay() {
    this.overlay.style.display = 'flex';
  }

  hideOverlay() {
    this.overlay.style.display = 'none';
  }

  showBeatLayer() {
    this.vignetteLayer.style.display = 'block';
    this.beatLayer.style.display = 'flex';
    this.jeffLayer.style.display = 'none';
    this.topParchmentLayer.style.display = 'none';
    this.parchTopLayer.style.display = 'none';
    this.sceneFirstLayer.style.display = 'none';
    this.bottomChoiceLayer.style.display = 'none';
  }

  showJeffLayer() {
    this.vignetteLayer.style.display = 'none';
    this.beatLayer.style.display = 'none';
    this.jeffLayer.style.display = 'flex';
    this.topParchmentLayer.style.display = 'none';
    this.parchTopLayer.style.display = 'none';
    this.sceneFirstLayer.style.display = 'none';
    this.bottomChoiceLayer.style.display = 'none';
  }

  showTopParchmentLayer() {
    this.vignetteLayer.style.display = 'none';
    this.beatLayer.style.display = 'none';
    this.jeffLayer.style.display = 'none';
    this.topParchmentLayer.style.display = 'block';
    this.parchTopLayer.style.display = 'none';
    this.sceneFirstLayer.style.display = 'none';
    this.bottomChoiceLayer.style.display = 'none';
  }

  showParchTopLayer() {
    this.vignetteLayer.style.display = 'none';
    this.beatLayer.style.display = 'none';
    this.jeffLayer.style.display = 'none';
    this.topParchmentLayer.style.display = 'none';
    this.parchTopLayer.style.display = 'flex';
    this.sceneFirstLayer.style.display = 'none';
    this.bottomChoiceLayer.style.display = 'none';
  }

  showSceneFirstLayer() {
    this.vignetteLayer.style.display = 'none';
    this.beatLayer.style.display = 'none';
    this.jeffLayer.style.display = 'none';
    this.topParchmentLayer.style.display = 'none';
    this.parchTopLayer.style.display = 'none';
    this.sceneFirstLayer.style.display = 'flex';
    this.bottomChoiceLayer.style.display = 'none';
  }

  showBottomChoiceLayer() {
    this.vignetteLayer.style.display = 'none';
    this.beatLayer.style.display = 'none';
    this.jeffLayer.style.display = 'none';
    this.topParchmentLayer.style.display = 'none';
    this.parchTopLayer.style.display = 'none';
    this.sceneFirstLayer.style.display = 'none';
    this.bottomChoiceLayer.style.display = 'flex';
  }

  resetState() {
    this.removeAllAdvanceListeners();
    this.onAdvance = null;
    if (this.buttonsArea) {
      this.buttonsArea.remove();
    }
    this.buttonsArea = this.createButtonsArea();
    this.panel.appendChild(this.buttonsArea);
    this.titleEl.textContent = '';
    this.titleEl.style.display = 'none';
    this.textArea.innerHTML = '';
    this.textArea.style.width = '100%';
    this.textArea.style.textAlign = 'center';
    this.contentArea.style.justifyContent = 'center';
    this.contentArea.style.alignItems = 'center';
    this.avatarImg.style.display = 'none';
    this.nameLabel.style.display = 'none';
    this.jeffText.innerHTML = '';
    this.jeffButtonsArea.innerHTML = '';
    this.topParchmentText.innerHTML = '';
    this.topParchmentButton.textContent = 'Continue';
    this.setButtonHandler(this.topParchmentButton, null);
    this.topParchmentLayer.style.display = 'none';
    this.parchTopText.innerHTML = '';
    this.parchTopText.style.alignItems = 'center';
    this.parchTopText.style.textAlign = 'center';
    this.parchTopButtons.innerHTML = '';
    this.setButtonHandler(this.sceneFirstButton, null);
    this.bottomChoiceBar.innerHTML = '';
    this.setTopMode(false);
    this.applyParchTopLayout({ centered: false });
    this.frameMode = 'beat-ui1';
    this.applyBeatUI1Layout();
  }

  renderBeatContent({ title, textLines, html, buttons = [] }) {
    this.showOverlay();
    this.showBeatLayer();
    if (title) {
      this.titleEl.textContent = title;
      this.titleEl.style.display = 'block';
    } else {
      this.titleEl.textContent = '';
      this.titleEl.style.display = 'none';
    }

    this.textArea.innerHTML = '';
    if (html instanceof HTMLElement) {
      this.textArea.appendChild(html);
    } else if (Array.isArray(html)) {
      this.textArea.innerHTML = html.join('');
    } else if (typeof html === 'string') {
      this.textArea.innerHTML = html;
    } else if (Array.isArray(textLines)) {
      textLines.forEach(line => {
        const p = createElement('div', { style: 'margin:4px 0;' });
        p.textContent = line;
        this.textArea.appendChild(p);
      });
    } else if (typeof textLines === 'string') {
      const p = createElement('div', { style: 'margin:4px 0;' });
      p.textContent = textLines;
      this.textArea.appendChild(p);
    }

    this.clearButtons();
    (buttons || []).forEach(btn => {
      const buttonEl = this.createButton(btn.label, btn.onClick);
      this.buttonsArea.appendChild(buttonEl);
    });
  }

  renderBeat({ title, textLines, html, buttons = [], frameMode, layout = 'center' } = {}) {
    this._beatToken += 1;
    this._advanceLocked = false;
    this.resetState();
    this.setFrame(frameMode || 'beat-ui1');
    if (layout === 'top') {
      this.setTopMode(true);
    } else if (layout === 'choiceColumnTop') {
      this.applyChoiceColumnTopLayout();
    } else {
      this.setTopMode(false);
    }
    this.renderBeatContent({ title, textLines, html, buttons });
  }

  renderAvatarBeat({ speakerSurvivor, title, textLines, buttons = [] }) {
    this._beatToken += 1;
    this._advanceLocked = false;
    this.resetState();
    this.setFrame('beat-avatar-ui');
    this.setSpeaker(speakerSurvivor);
    this.renderBeatContent({ title, textLines, buttons });
  }

  renderJeffBeat({ textLines = [], html, buttons = [], backgroundSrc } = {}) {
    this._beatToken += 1;
    this._advanceLocked = false;
    this.resetState();
    this.showOverlay();
    this.showJeffLayer();
    if (backgroundSrc) {
      this.setSceneBackground(backgroundSrc);
    }
    if (html instanceof HTMLElement) {
      clearChildren(this.jeffText);
      this.jeffText.appendChild(html);
    } else {
      const lines = Array.isArray(textLines) ? textLines : [String(textLines)];
      this.jeffText.innerHTML = lines.map(line => `<div>${line}</div>`).join('<div style="height:8px;"></div>');
    }
    this.jeffButtonsArea.innerHTML = '';
    (buttons || []).forEach(btn => {
      const buttonEl = this.createButton(btn.label, btn.onClick);
      this.jeffButtonsArea.appendChild(buttonEl);
    });
  }

  renderTopParchmentBeat({ background, title, textLines, html, buttonLabel = 'Continue', onContinue } = {}) {
    this._beatToken += 1;
    this._advanceLocked = false;
    this.resetState();
    this.showOverlay();
    this.showTopParchmentLayer();
    if (background) {
      this.setSceneBackground(background);
    }

    this.topParchmentText.innerHTML = '';
    if (title) {
      const titleEl = createElement('div', { style: 'font-size:1.05rem; margin-bottom:0.35rem;' });
      titleEl.textContent = title;
      this.topParchmentText.appendChild(titleEl);
    }

    if (html instanceof HTMLElement) {
      this.topParchmentText.appendChild(html);
    } else if (typeof html === 'string') {
      const htmlWrapper = createElement('div');
      htmlWrapper.innerHTML = html;
      this.topParchmentText.appendChild(htmlWrapper);
    } else if (Array.isArray(textLines)) {
      textLines.forEach(line => {
        const lineEl = createElement('div', { style: 'margin:4px 0;' });
        lineEl.textContent = line;
        this.topParchmentText.appendChild(lineEl);
      });
    } else if (typeof textLines === 'string') {
      this.topParchmentText.textContent = textLines;
    }
    this.topParchmentButton.textContent = buttonLabel;
    this.setButtonHandler(this.topParchmentButton, onContinue);
  }

  renderParchTopBeat({ background, title, textLines = [], html, buttons = [], onAdvance } = {}) {
    this._beatToken += 1;
    this._advanceLocked = false;
    this.resetState();
    this.showOverlay();
    this.showParchTopLayer();
    if (background) {
      this.setSceneBackground(background);
    }

    clearChildren(this.parchTopText);
    const shouldCenterPanel = html instanceof HTMLElement && html.dataset?.journeyPanel === 'centered';
    this.applyParchTopLayout({ centered: shouldCenterPanel });
    this.parchTopText.style.alignItems = shouldCenterPanel ? 'stretch' : 'center';
    if (title) {
      const titleEl = createElement('div', { style: 'font-size:1.05rem; margin-bottom:0.35rem; text-transform:uppercase; letter-spacing:0.5px;' });
      titleEl.textContent = title;
      this.parchTopText.appendChild(titleEl);
    }

    if (html instanceof HTMLElement) {
      this.parchTopText.appendChild(html);
    } else if (typeof html === 'string') {
      const htmlWrapper = createElement('div');
      htmlWrapper.innerHTML = html;
      this.parchTopText.appendChild(htmlWrapper);
    } else {
      const lines = Array.isArray(textLines) ? textLines : [String(textLines)];
      lines.forEach(line => {
        const lineEl = createElement('div', { style: 'margin:4px 0;' });
        lineEl.textContent = line;
        this.parchTopText.appendChild(lineEl);
      });
    }

    this.parchTopButtons.innerHTML = '';
    (buttons || []).forEach(btn => {
      const buttonEl = this.createButton(btn.label, btn.onClick);
      this.parchTopButtons.appendChild(buttonEl);
    });
    if ((buttons || []).length > 1) {
      this.parchTopButtons.querySelectorAll('button').forEach(button => {
        button.style.fontSize = 'clamp(14px, 2.2vw, 22px)';
        button.style.lineHeight = '1.2';
        button.style.whiteSpace = 'normal';
        button.style.textAlign = 'center';
      });
    }

    if ((buttons || []).length <= 1 && typeof onAdvance === 'function') {
      this.enableClickAnywhere(onAdvance);
    }
  }

  renderSceneFirst({ backgroundSrc, onAdvance } = {}) {
    this._beatToken += 1;
    this._advanceLocked = false;
    this.resetState();
    this.showOverlay();
    this.showSceneFirstLayer();
    if (backgroundSrc) {
      this.setSceneBackground(backgroundSrc);
    }
    this.setButtonHandler(this.sceneFirstButton, onAdvance);
  }

  renderBottomChoiceBar({ leftButton, rightButton } = {}) {
    this._beatToken += 1;
    this._advanceLocked = false;
    this.resetState();
    this.showOverlay();
    this.showBottomChoiceLayer();
    this.bottomChoiceBar.innerHTML = '';

    const createBottomButton = (label, handler) => {
      const button = createElement('button', {
        style: `
          width:clamp(200px, 32vw, 320px);
          height:clamp(60px, 9vh, 90px);
          background-image: url('Assets/rect-button.png');
          background-size: contain;
          background-repeat: no-repeat;
          background-position: center;
          border: none;
          color: white;
          font-family: 'Survivant', sans-serif;
          font-weight: bold;
          font-size: clamp(0.9rem, 2.4vw, 1.1rem);
          text-shadow: 1px 1px 2px #000;
          cursor: pointer;
        `,
        type: 'button'
      }, label);
      this.setButtonHandler(button, handler);
      return button;
    };

    if (leftButton) {
      this.bottomChoiceBar.appendChild(createBottomButton(leftButton.label, leftButton.onClick));
    }
    if (rightButton) {
      this.bottomChoiceBar.appendChild(createBottomButton(rightButton.label, rightButton.onClick));
    }
  }

  applyParchTopLayout({ centered = false } = {}) {
    if (centered) {
      this.parchTopLayer.style.alignItems = 'center';
      this.parchTopLayer.style.justifyContent = 'center';
      this.parchTopLayer.style.paddingTop = '0';
      this.parchTopContent.style.position = 'absolute';
      this.parchTopContent.style.left = '50%';
      this.parchTopContent.style.top = '50%';
      this.parchTopContent.style.transform = 'translate(-50%, -50%)';
      this.parchTopContent.style.width = 'min(92vw, 760px)';
    } else {
      this.parchTopLayer.style.alignItems = 'flex-start';
      this.parchTopLayer.style.justifyContent = 'center';
      this.parchTopLayer.style.paddingTop = 'clamp(16px, 5vh, 56px)';
      this.parchTopContent.style.position = 'relative';
      this.parchTopContent.style.left = '';
      this.parchTopContent.style.top = '';
      this.parchTopContent.style.transform = '';
      this.parchTopContent.style.width = '100%';
    }
  }

  applyChoiceColumnTopLayout() {
    this.setTopMode(true);
    this.contentArea.style.top = '12%';
    this.contentArea.style.left = '10%';
    this.contentArea.style.right = '10%';
    this.contentArea.style.bottom = '56%';
    this.contentArea.style.justifyContent = 'flex-start';
    this.textArea.style.textAlign = 'center';
    this.buttonsArea.style.top = '44%';
    this.buttonsArea.style.bottom = '10%';
    this.buttonsArea.style.width = '68%';
    this.buttonsArea.style.maxWidth = '520px';
    this.buttonsArea.style.maxHeight = '44%';
  }

  scheduleTimeout(callback, delayMs) {
    const id = window.setTimeout(() => {
      this._timeouts.delete(id);
      callback();
    }, delayMs);
    this._timeouts.add(id);
    return id;
  }

  destroy() {
    this.removeAllAdvanceListeners();
    if (this._sceneAdvancePressHandlers) {
      this.sceneFirstButton?.removeEventListener('pointerdown', this._sceneAdvancePressHandlers.down);
      this.sceneFirstButton?.removeEventListener('pointerup', this._sceneAdvancePressHandlers.up);
      this.sceneFirstButton?.removeEventListener('pointerleave', this._sceneAdvancePressHandlers.up);
      this._sceneAdvancePressHandlers = null;
    }
    this.overlay?.remove();
    this.backgroundLayer?.remove();
    this.vignetteLayer?.remove();
    if (this._styleEl) {
      this._styleEl.remove();
      this._styleEl = null;
    }
    this.container = null;
  }

  static forceCleanup(container) {
    if (!container) return;
    container.querySelectorAll('[data-journey-overlay="true"]').forEach(el => el.remove());
  }
}

export default JourneyBeatUI;
