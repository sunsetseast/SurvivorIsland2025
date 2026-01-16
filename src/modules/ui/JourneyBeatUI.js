import { createElement, clearChildren } from '../utils/DOMUtils.js';

const FRAME_ASSETS = {
  'beat-ui1': 'Assets/beat-ui1.png',
  'beat-avatar-ui': 'Assets/beat-avatar-ui.png'
};

export function getSurvivorAvatarSrc(survivor) {
  if (!survivor) return 'Assets/Avatars/default.png';
  const candidates = [survivor.avatarUrl, survivor.avatar, survivor.portrait, survivor.image, survivor.img];
  const found = candidates.find(Boolean);
  if (found) return found;
  const first = survivor.firstName ? survivor.firstName.toLowerCase() : '';
  if (first) return `Assets/Avatars/${first}.jpeg`;
  return 'Assets/Avatars/default.png';
}

class JourneyBeatUI {
  constructor(container) {
    this.container = container;
    this.frameMode = 'beat-ui1';
    this.currentBackground = null;
    this.fadeDurationMs = 200;
    this._styleEl = null;
    this.overlayToken = 'true';

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
      style: `position:absolute; inset:0; background:radial-gradient(circle at center, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0.35) 55%, rgba(0,0,0,0.65) 100%); pointer-events:none;`
    });

    this.beatLayer = createElement('div', {
      style: `position:absolute; inset:0; display:flex; align-items:center; justify-content:center;`
    });

    this.panel = createElement('div', {
      style: `position:relative; width:min(92vw, 900px); height:min(72vh, 560px); max-height:72vh; display:flex; align-items:center; justify-content:center;`
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

    this.buttonsArea = createElement('div', {
      style: `position:absolute; left:50%; transform:translateX(-50%); display:flex; flex-direction:column; align-items:center; gap:10px; z-index:2;`
    });

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

    this.overlay.append(this.vignetteLayer, this.beatLayer, this.jeffLayer);

    this.setFrame('beat-ui1');

    container.appendChild(this.backgroundLayer);
    container.appendChild(this.overlay);
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
    this.panel.style.height = 'min(72vh, 560px)';
    this.panel.style.maxHeight = '72vh';
    this.panel.style.aspectRatio = '';
    this.panel.style.transform = 'none';
    this.panel.style.minHeight = '320px';

    this.avatarImg.style.display = 'none';
    this.nameLabel.style.display = 'none';
    this.contentArea.style.top = '18%';
    this.contentArea.style.left = '10%';
    this.contentArea.style.right = '12%';
    this.contentArea.style.bottom = '24%';
    this.buttonsArea.style.bottom = '10%';
    this.buttonsArea.style.width = '62%';
    this.buttonsArea.style.maxWidth = '440px';
  }

  applyAvatarUILayout() {
    this.panel.style.width = 'min(92vw, 900px)';
    this.panel.style.height = 'min(72vh, 560px)';
    this.panel.style.maxHeight = '72vh';
    this.panel.style.aspectRatio = '';
    this.panel.style.transform = 'none';
    this.panel.style.minHeight = '320px';

    this.avatarImg.style.display = 'block';
    this.nameLabel.style.display = 'block';
    this.contentArea.style.top = '26%';
    this.contentArea.style.left = '42%';
    this.contentArea.style.right = '10%';
    this.contentArea.style.bottom = '24%';
    this.buttonsArea.style.bottom = '10%';
    this.buttonsArea.style.width = '48%';
    this.buttonsArea.style.maxWidth = '360px';
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

  clearButtons() {
    this.buttonsArea.innerHTML = '';
  }

  createButton(label, onClick) {
    return createElement('button', {
      className: 'rect-button',
      style: `width:100%; min-width:180px;`,
      onclick: onClick
    }, label);
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
  }

  showJeffLayer() {
    this.vignetteLayer.style.display = 'none';
    this.beatLayer.style.display = 'none';
    this.jeffLayer.style.display = 'flex';
  }

  resetState() {
    this.clearButtons();
    this.titleEl.textContent = '';
    this.titleEl.style.display = 'none';
    this.textArea.innerHTML = '';
    this.avatarImg.style.display = 'none';
    this.nameLabel.style.display = 'none';
    this.jeffText.innerHTML = '';
    this.jeffButtonsArea.innerHTML = '';
    this.setTopMode(false);
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
    } else if (typeof html === 'string') {
      this.textArea.innerHTML = html;
    } else if (Array.isArray(textLines)) {
      textLines.forEach(line => {
        const p = createElement('div', { style: 'margin:4px 0;' });
        p.textContent = line;
        this.textArea.appendChild(p);
      });
    }

    this.clearButtons();
    (buttons || []).forEach(btn => {
      const buttonEl = this.createButton(btn.label, btn.onClick);
      this.buttonsArea.appendChild(buttonEl);
    });
  }

  renderBeat({ title, textLines, html, buttons = [], frameMode, layout = 'center' } = {}) {
    this.resetState();
    this.setFrame(frameMode || 'beat-ui1');
    this.setTopMode(layout === 'top');
    this.renderBeatContent({ title, textLines, html, buttons });
  }

  renderAvatarBeat({ speakerSurvivor, title, textLines, buttons = [] }) {
    this.resetState();
    this.setFrame('beat-avatar-ui');
    this.setSpeaker(speakerSurvivor);
    this.renderBeatContent({ title, textLines, buttons });
  }

  renderJeffBeat({ textLines = [], html, buttons = [], backgroundSrc } = {}) {
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

  destroy() {
    this.overlay?.remove();
    this.backgroundLayer?.remove();
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
