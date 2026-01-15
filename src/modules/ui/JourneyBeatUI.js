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

    this.backgroundLayer = createElement('div', {
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
      style: `position:absolute; inset:0; display:flex; align-items:center; justify-content:center; z-index:7000;`
    });

    this.vignetteLayer = createElement('div', {
      style: `position:absolute; inset:0; background:radial-gradient(circle at center, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0.35) 55%, rgba(0,0,0,0.65) 100%);`
    });

    this.beatLayer = createElement('div', {
      style: `position:absolute; inset:0; display:flex; align-items:center; justify-content:center;`
    });

    this.panel = createElement('div', {
      style: `position:relative; width:min(960px, 94vw); aspect-ratio: 16 / 9; max-height: 86vh; display:flex; align-items:center; justify-content:center;`
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
      style: `position:absolute; inset:0; display:none; align-items:center; justify-content:center; flex-direction:column;`
    });

    this.parchmentWrapper = createElement('div', {
      style: `position:relative; width:min(90vw, 360px); margin:20px auto 0;`
    });

    this.parchmentImg = createElement('img', {
      src: 'Assets/parch-landscape.png',
      style: `width:100%; max-width:360px; max-height:200px; display:block; margin:0 auto;`
    });

    this.jeffText = createElement('div', {
      className: 'parchment-text',
      style: `
        color: white;
        font-family: 'Survivant', sans-serif;
        font-weight: bold;
        text-align: center;
        margin: -150px auto 0;
        max-width: 280px;
        font-size: clamp(0.9rem, 2.9vw, 1.05rem);
        line-height: 1.35;
        text-shadow:
          0 1px 0 #000,
          0 2px 0 #000,
          0 3px 0 #000,
          0 4px 4px rgba(0, 0, 0, 0.5);
      `
    });

    this.jeffButton = createElement('button', {
      className: 'rect-button',
      style: `
        position: absolute;
        bottom: 40px;
        left: 50%;
        transform: translateX(-50%);
      `
    }, 'Continue');

    this.parchmentWrapper.append(this.parchmentImg, this.jeffText);
    this.jeffLayer.append(this.parchmentWrapper, this.jeffButton);

    this.overlay.append(this.vignetteLayer, this.beatLayer, this.jeffLayer);

    this.setFrame('beat-ui1');

    container.appendChild(this.backgroundLayer);
    container.appendChild(this.overlay);
  }

  setSceneBackground(src) {
    if (!this.container) return;
    if (src) {
      this.container.style.backgroundImage = `url('${src}')`;
      this.container.style.backgroundSize = 'cover';
      this.container.style.backgroundPosition = 'center';
      this.container.style.backgroundRepeat = 'no-repeat';
      if (this.backgroundLayer) {
        this.backgroundLayer.style.backgroundImage = `url('${src}')`;
      }
    } else {
      this.container.style.backgroundImage = 'none';
      if (this.backgroundLayer) {
        this.backgroundLayer.style.backgroundImage = 'none';
      }
    }
    this.currentBackground = src || null;
  }

  transitionBackground(src) {
    if (!this.backgroundLayer) {
      this.setSceneBackground(src);
      return Promise.resolve();
    }
    if (src === this.currentBackground) {
      return Promise.resolve();
    }

    return new Promise(resolve => {
      this.backgroundLayer.style.opacity = '0';
      setTimeout(() => {
        this.setSceneBackground(src);
        requestAnimationFrame(() => {
          this.backgroundLayer.style.opacity = '1';
          setTimeout(resolve, this.fadeDurationMs);
        });
      }, this.fadeDurationMs);
    });
  }

  setFrame(mode) {
    this.frameMode = mode;
    const frameSrc = FRAME_ASSETS[mode] || FRAME_ASSETS['beat-ui1'];
    this.frameImg.src = frameSrc;

    if (mode === 'beat-avatar-ui') {
      this.avatarImg.style.display = 'block';
      this.nameLabel.style.display = 'block';
      this.contentArea.style.top = '26%';
      this.contentArea.style.left = '42%';
      this.contentArea.style.right = '10%';
      this.contentArea.style.bottom = '24%';
      this.buttonsArea.style.bottom = '10%';
      this.buttonsArea.style.width = '48%';
      this.buttonsArea.style.maxWidth = '360px';
    } else {
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

  renderBeat({ title, textLines, html, buttons = [] }) {
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

  renderAvatarBeat({ speakerSurvivor, title, textLines, buttons = [] }) {
    this.setFrame('beat-avatar-ui');
    this.setSpeaker(speakerSurvivor);
    this.renderBeat({ title, textLines, buttons });
  }

  renderJeffBeat({ textLines = [], html, buttonLabel = 'Continue', onContinue }) {
    this.showOverlay();
    this.showJeffLayer();
    if (html instanceof HTMLElement) {
      clearChildren(this.jeffText);
      this.jeffText.appendChild(html);
    } else {
      const lines = Array.isArray(textLines) ? textLines : [String(textLines)];
      this.jeffText.innerHTML = lines.map(line => `<div>${line}</div>`).join('<div style="height:8px;"></div>');
    }
    this.jeffButton.textContent = buttonLabel;
    this.jeffButton.onclick = onContinue;
  }

  destroy() {
    this.overlay?.remove();
    this.backgroundLayer?.remove();
    if (this.container) {
      this.container.style.backgroundImage = 'none';
    }
  }
}

export default JourneyBeatUI;
