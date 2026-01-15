import { createElement } from '../utils/DOMUtils.js';

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

    this.overlay = createElement('div', {
      style: `position:absolute; inset:0; display:flex; align-items:center; justify-content:center; z-index:7000;`
    });

    this.backgroundLayer = createElement('div', {
      style: `position:absolute; inset:0; background:#000; background-size:cover; background-position:center;`
    });

    this.vignetteLayer = createElement('div', {
      style: `position:absolute; inset:0; background:radial-gradient(circle at center, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0.35) 55%, rgba(0,0,0,0.6) 100%);`
    });

    this.panel = createElement('div', {
      style: `position:relative; width:min(980px, 95vw); min-height:420px; display:flex; align-items:center; justify-content:center;`
    });

    this.avatarImg = createElement('img', {
      style: `position:absolute; width:36%; height:auto; top:10%; left:9%; border-radius:50%; object-fit:cover; border:5px solid #caa15a; display:none; z-index:0;`
    });

    this.frameImg = createElement('img', {
      style: `position:absolute; inset:0; width:100%; height:100%; object-fit:contain; pointer-events:none; z-index:1;`
    });

    this.nameLabel = createElement('div', {
      style: `position:absolute; top:7.5%; left:54%; right:10%; text-align:center; font-family:'Survivant', sans-serif; font-weight:700; letter-spacing:1px; color:#f7e6c5; text-shadow:0 2px 4px rgba(0,0,0,0.55); display:none; z-index:2;`
    });

    this.contentArea = createElement('div', {
      style: `position:absolute; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; font-family:'Survivant', sans-serif; color:#2b1b0f; text-shadow:0 1px 0 rgba(255,255,255,0.6); gap:12px; z-index:2;`
    });

    this.titleEl = createElement('div', {
      style: `font-size:1.25rem; font-weight:700; text-transform:uppercase; letter-spacing:1px;`
    });

    this.textArea = createElement('div', {
      style: `width:100%; display:flex; flex-direction:column; gap:8px; font-size:1.05rem; line-height:1.4;`
    });

    this.buttonsArea = createElement('div', {
      style: `position:absolute; left:50%; transform:translateX(-50%); display:flex; flex-direction:column; align-items:center; gap:12px; z-index:2;`
    });

    this.contentArea.append(this.titleEl, this.textArea);
    this.panel.append(this.avatarImg, this.frameImg, this.nameLabel, this.contentArea, this.buttonsArea);
    this.overlay.append(this.backgroundLayer, this.vignetteLayer, this.panel);

    this.setFrame('beat-ui1');

    container.appendChild(this.overlay);
  }

  setBackground(src) {
    if (src) {
      this.backgroundLayer.style.backgroundImage = `url('${src}')`;
    } else {
      this.backgroundLayer.style.backgroundImage = 'none';
    }
  }

  setFrame(mode) {
    this.frameMode = mode;
    const frameSrc = FRAME_ASSETS[mode] || FRAME_ASSETS['beat-ui1'];
    this.frameImg.src = frameSrc;

    if (mode === 'beat-avatar-ui') {
      this.avatarImg.style.display = 'block';
      this.nameLabel.style.display = 'block';
      this.contentArea.style.top = '22%';
      this.contentArea.style.left = '45%';
      this.contentArea.style.right = '10%';
      this.contentArea.style.bottom = '24%';
      this.buttonsArea.style.bottom = '10%';
      this.buttonsArea.style.width = '45%';
      this.buttonsArea.style.maxWidth = '380px';
    } else {
      this.avatarImg.style.display = 'none';
      this.nameLabel.style.display = 'none';
      this.contentArea.style.top = '20%';
      this.contentArea.style.left = '12%';
      this.contentArea.style.right = '12%';
      this.contentArea.style.bottom = '24%';
      this.buttonsArea.style.bottom = '10%';
      this.buttonsArea.style.width = '60%';
      this.buttonsArea.style.maxWidth = '460px';
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
      style: `width:100%; min-width:180px; padding:12px 18px; background:url('Assets/rect-button.png') center/cover no-repeat; border:none; color:#fff; font-family:'Survivant',sans-serif; font-size:1rem; font-weight:bold; cursor:pointer; text-shadow:1px 1px 2px black;`,
      onclick: onClick
    }, label);
  }

  renderBeat({ title, textLines, html, buttons = [] }) {
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

  destroy() {
    this.overlay?.remove();
  }
}

export default JourneyBeatUI;
