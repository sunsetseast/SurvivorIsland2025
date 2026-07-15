import { DAY1_ROLE_DEFINITIONS, DAY1_ROLE_KEYS } from './Day1CampAssignmentResolver.js';

const SVG_PATHS = {
  fire: '<path d="M12 2c1 4-2 5-1 8 1-1 2-2 3-4 4 4 5 8 3 12-2 4-8 5-11 1-3-4-1-8 2-11 0 4 3 5 4 7-1-5 3-7 2-13Z"/>',
  shelter: '<path d="M3 11 12 4l9 7-2 2-2-2v9h-4v-6h-2v6H7v-9l-2 2-2-2Z"/>',
  wood: '<path d="M5 4h14v5H5V4Zm-2 7h14v5H3v-5Zm4 7h14v3H7v-3Z"/><path d="M8 4v5m6 2v5m-3 2v3" fill="none" stroke="currentColor" stroke-width="1.5"/>',
  resources: '<path d="M12 7c5 0 8 3 8 7s-3 7-8 7-8-3-8-7 3-7 8-7Z"/><path d="M12 7c-1-3 1-5 4-5-1 3-2 4-4 5Zm-1 0C9 4 7 3 5 4c1 2 3 3 6 3Z"/>',
  float: '<path d="M12 3 8 8h3v4H7V9l-5 3 5 3v-3h4v4H8l4 5 4-5h-3v-4h4v3l5-3-5-3v3h-4V8h3l-4-5Z"/>',
  bond: '<path d="M12 21S3 16 3 9a4 4 0 0 1 7-3 4 4 0 0 1 7 3c0 7-5 12-5 12Z"/><path d="M12 21s9-5 9-12a4 4 0 0 0-7-3" opacity=".55"/>',
  friction: '<path d="m4 5 6 6-3 3-5-5 2-4Zm16 0-6 6 3 3 5-5-2-4ZM9 16l3-3 3 3-3 5-3-5Z"/>',
  watched: '<path d="M2 12s4-6 10-6 10 6 10 6-4 6-10 6S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"/>',
  respect: '<path d="m4 13 5 5L20 6l-2-2-9 9-3-3-2 3Z"/>'
};

const AVATAR_PRESENTATION = {
  'boston rob': { position: '50% 30%', scale: 1.05 },
  sandra: { position: '50% 33%', scale: 1.05 },
  cirie: { position: '50% 31%', scale: 1.04 },
  ozzy: { position: '50% 28%', scale: 1.08 },
  tony: { position: '50% 30%', scale: 1.06 },
  parvati: { position: '50% 30%', scale: 1.05 },
  russell: { position: '50% 30%', scale: 1.07 },
  carolyn: { position: '50% 30%', scale: 1.05 }
};

// Measured from the transparent interior component of the 1024 × 1536
// beat-avatar-ui.png asset: x 201–481, y 166–456. The square crop stays
// inside that opening while the decorative frame renders above it.
export const DAY1_SPEAKER_PORTRAIT_GEOMETRY = Object.freeze({
  leftPercent: 19.63,
  topPercent: 10.81,
  widthPercent: 27.34
});

function sameId(a, b) {
  return a != null && b != null && String(a) === String(b);
}

function createIcon(key, className = '') {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('day1-setup__icon');
  if (className) svg.classList.add(className);
  svg.innerHTML = SVG_PATHS[key] || SVG_PATHS.float;
  return svg;
}

function wait(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

export function getAvatarPresentation(survivor) {
  const name = String(survivor?.firstName || survivor?.name || '').toLowerCase();
  const configured = Object.entries(AVATAR_PRESENTATION).find(([key]) => name.includes(key))?.[1] || {};
  return {
    position: survivor?.avatarFocus || configured.position || '50% 32%',
    scale: survivor?.avatarScale || configured.scale || 1.04
  };
}

export default class Day1CampSetupUI {
  constructor({ members, player, tribeColor = '#c17f34', avatarResolver }) {
    this.members = members || [];
    this.player = player;
    this.tribeColor = tribeColor;
    this.avatarResolver = avatarResolver;
    this.cleanupCallbacks = [];
    this.overlay = this.buildOverlay();
    this.installFocusTrap();
  }

  buildOverlay() {
    document.getElementById('day1-event-overlay')?.remove();
    const overlay = document.createElement('section');
    overlay.id = 'day1-event-overlay';
    overlay.className = 'day1-setup';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'day1-setup-title');
    overlay.style.setProperty('--day1-tribe-color', this.tribeColor);
    overlay.style.setProperty('--day1-portrait-left', `${DAY1_SPEAKER_PORTRAIT_GEOMETRY.leftPercent}%`);
    overlay.style.setProperty('--day1-portrait-top', `${DAY1_SPEAKER_PORTRAIT_GEOMETRY.topPercent}%`);
    overlay.style.setProperty('--day1-portrait-size', `${DAY1_SPEAKER_PORTRAIT_GEOMETRY.widthPercent}%`);
    overlay.innerHTML = `
      <div class="day1-setup__scrim" aria-hidden="true"></div>
      <div class="day1-setup__stage" data-stage="arrival">
        <div class="day1-setup__arrival" aria-live="polite">
          <span>DAY 1</span>
          <strong id="day1-setup-title">Camp Setup</strong>
        </div>
        <div class="day1-setup__speaker" hidden>
          <button class="day1-setup__speaker-skip" type="button" aria-label="Skip leader introduction">
            <div class="day1-setup__portrait-crop"><img class="day1-setup__portrait" alt="" /></div>
            <img class="day1-setup__speaker-frame" src="Assets/beat-avatar-ui.png" alt="" aria-hidden="true" />
            <div class="day1-setup__speaker-name"></div>
            <blockquote class="day1-setup__speaker-line"></blockquote>
          </button>
          <div class="day1-setup__leadership-options" aria-label="Leadership decision"></div>
        </div>
        <div class="day1-setup__board" hidden>
          <header class="day1-setup__board-header">
            <div>
              <span class="day1-setup__eyebrow">DAY 1 · CAMP SETUP</span>
              <h2>Choose your task</h2>
            </div>
            <div class="day1-setup__leader-chip"></div>
          </header>
          <div class="day1-setup__tasks" role="group" aria-label="Camp tasks"></div>
          <div class="day1-setup__role-help" aria-live="polite"></div>
          <section class="day1-setup__pulse" aria-label="Social pulse">
            <span class="day1-setup__pulse-placeholder">Choose a task to reveal the social pulse.</span>
          </section>
          <footer class="day1-setup__footer">
            <span class="day1-setup__prompt">Tap a task to accept or volunteer.</span>
            <button class="day1-setup__start" type="button" disabled>Start Camp</button>
          </footer>
          <div class="day1-setup__tooltip" role="tooltip" hidden></div>
        </div>
      </div>`;
    const gameContainer = document.getElementById('game-container');
    this.backgroundState = gameContainer ? {
      element: gameContainer,
      inert: gameContainer.inert,
      ariaHidden: gameContainer.getAttribute('aria-hidden')
    } : null;
    if (gameContainer) {
      gameContainer.inert = true;
      gameContainer.setAttribute('aria-hidden', 'true');
    }
    document.body.classList.add('day1-setup-active');
    document.body.appendChild(overlay);
    return overlay;
  }

  installFocusTrap() {
    const onKeyDown = event => {
      if (event.key !== 'Tab') return;
      const focusable = [...this.overlay.querySelectorAll('button:not([disabled]), [tabindex="0"]')]
        .filter(element => !element.hidden && element.offsetParent !== null);
      if (!focusable.length) {
        event.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    this.overlay.addEventListener('keydown', onKeyDown);
    this.cleanupCallbacks.push(() => this.overlay?.removeEventListener('keydown', onKeyDown));
  }

  focus(selector) {
    window.requestAnimationFrame?.(() => this.overlay?.querySelector(selector)?.focus?.());
  }

  member(id) {
    return this.members.find(member => sameId(member.id, id)) || null;
  }

  avatarSource(survivor) {
    return this.avatarResolver?.(survivor) || survivor?.avatarUrl || 'Assets/logo.png';
  }

  configureImage(img, survivor, alt = '') {
    const presentation = getAvatarPresentation(survivor);
    img.src = this.avatarSource(survivor);
    img.alt = alt;
    img.style.objectPosition = presentation.position;
    img.style.setProperty('--avatar-scale', presentation.scale);
    img.addEventListener('error', () => {
      if (!img.src.endsWith('/Assets/logo.png') && !img.src.endsWith('Assets/logo.png')) img.src = 'Assets/logo.png';
    }, { once: true });
  }

  async showArrival() {
    const stage = this.overlay.querySelector('.day1-setup__stage');
    stage.dataset.stage = 'arrival';
    await new Promise(resolve => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        stage.removeEventListener('pointerup', finish);
        resolve();
      };
      const timer = setTimeout(finish, 850);
      stage.addEventListener('pointerup', finish, { once: true });
    });
  }

  renderLeader(leader, line) {
    const speaker = this.overlay.querySelector('.day1-setup__speaker');
    const portrait = speaker.querySelector('.day1-setup__portrait');
    this.configureImage(portrait, leader, `${leader?.firstName || leader?.name || 'Leader'} portrait`);
    speaker.querySelector('.day1-setup__speaker-name').textContent = leader?.firstName || leader?.name || 'TRIBE LEADER';
    speaker.querySelector('.day1-setup__speaker-line').textContent = line;
  }

  async chooseLeadership({ leader, line, decision = null }) {
    const stage = this.overlay.querySelector('.day1-setup__stage');
    const speaker = this.overlay.querySelector('.day1-setup__speaker');
    const board = this.overlay.querySelector('.day1-setup__board');
    const options = speaker.querySelector('.day1-setup__leadership-options');
    stage.dataset.stage = 'leader';
    speaker.hidden = false;
    board.hidden = true;
    this.renderLeader(leader, line);
    options.innerHTML = '';

    if (decision?.options?.length) {
      return new Promise(resolve => {
        decision.options.forEach(option => {
          const button = document.createElement('button');
          button.type = 'button';
          button.textContent = option.label;
          button.addEventListener('click', () => {
            options.querySelectorAll('button').forEach(candidate => { candidate.disabled = true; });
            resolve(option.key);
          }, { once: true });
          options.appendChild(button);
        });
        this.focus('.day1-setup__leadership-options button');
      });
    }

    return new Promise(resolve => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        resolve('automatic');
      };
      const timer = setTimeout(finish, 1550);
      const skip = speaker.querySelector('.day1-setup__speaker-skip');
      const onSkip = () => {
        clearTimeout(timer);
        finish();
      };
      skip.addEventListener('click', onSkip, { once: true });
      this.focus('.day1-setup__speaker-skip');
      this.cleanupCallbacks.push(() => {
        clearTimeout(timer);
        skip.removeEventListener('click', onSkip);
      });
    });
  }

  async settleLeader(leader, line) {
    this.renderLeader(leader, line);
    const options = this.overlay.querySelector('.day1-setup__leadership-options');
    options.innerHTML = '';
    await wait(650);
  }

  avatarChip(survivor, { isPlayer = false } = {}) {
    const chip = document.createElement('span');
    chip.className = `day1-setup__avatar-chip${isPlayer ? ' is-player' : ''}`;
    chip.title = survivor?.firstName || survivor?.name || 'Survivor';
    const img = document.createElement('img');
    this.configureImage(img, survivor, survivor?.firstName || survivor?.name || 'Survivor');
    chip.appendChild(img);
    if (isPlayer) {
      const marker = document.createElement('span');
      marker.className = 'day1-setup__you-marker';
      marker.textContent = 'YOU';
      chip.appendChild(marker);
    }
    return chip;
  }

  renderTasks({ assignments, selectedRole, suggestedRole, choiceMade, onSelect }) {
    const taskGrid = this.overlay.querySelector('.day1-setup__tasks');
    taskGrid.innerHTML = '';
    DAY1_ROLE_KEYS.forEach(roleKey => {
      const definition = DAY1_ROLE_DEFINITIONS[roleKey];
      const tile = document.createElement('button');
      tile.type = 'button';
      tile.className = 'day1-setup__task';
      tile.dataset.role = roleKey;
      tile.setAttribute('aria-pressed', String(roleKey === selectedRole));
      tile.setAttribute('aria-label', `${definition.label}. ${definition.description}`);
      tile.title = `${definition.title} — ${definition.description}`;
      if (roleKey === selectedRole) tile.classList.add('is-selected');
      if (!choiceMade && roleKey === suggestedRole) tile.classList.add('is-suggested');

      const iconWrap = document.createElement('span');
      iconWrap.className = 'day1-setup__task-icon';
      iconWrap.appendChild(createIcon(roleKey));
      const label = document.createElement('strong');
      label.textContent = definition.label;
      const avatars = document.createElement('span');
      avatars.className = 'day1-setup__task-avatars';
      (assignments[roleKey] || []).forEach(id => {
        const survivor = this.member(id);
        if (survivor) avatars.appendChild(this.avatarChip(survivor, { isPlayer: sameId(id, this.player?.id) }));
      });
      tile.append(iconWrap, label, avatars);

      let holdTimer = null;
      let held = false;
      const showTooltip = () => this.showTooltip(`${definition.title}: ${definition.description}`, tile);
      const clearHold = () => {
        if (holdTimer) clearTimeout(holdTimer);
        holdTimer = null;
      };
      tile.addEventListener('pointerdown', () => {
        held = false;
        holdTimer = setTimeout(() => {
          held = true;
          showTooltip();
        }, 480);
      });
      tile.addEventListener('pointerup', clearHold);
      tile.addEventListener('pointercancel', clearHold);
      tile.addEventListener('blur', () => this.hideTooltip());
      tile.addEventListener('click', event => {
        if (held && event.detail !== 0) {
          held = false;
          event.preventDefault();
          return;
        }
        onSelect(roleKey);
      });
      taskGrid.appendChild(tile);
    });
    const selected = DAY1_ROLE_DEFINITIONS[selectedRole] || DAY1_ROLE_DEFINITIONS.float;
    this.overlay.querySelector('.day1-setup__role-help').textContent = `${selected.title} — ${selected.description}`;
  }

  showTooltip(text, anchor) {
    const tooltip = this.overlay.querySelector('.day1-setup__tooltip');
    tooltip.textContent = text;
    tooltip.hidden = false;
    tooltip.dataset.role = anchor?.dataset?.role || '';
  }

  hideTooltip() {
    this.overlay.querySelector('.day1-setup__tooltip').hidden = true;
  }

  renderPulse(pulses) {
    const pulse = this.overlay.querySelector('.day1-setup__pulse');
    pulse.innerHTML = '';
    if (!pulses?.length) {
      const calm = document.createElement('span');
      calm.className = 'day1-setup__pulse-placeholder';
      calm.textContent = 'Camp starts steady. No clear fault line yet.';
      pulse.appendChild(calm);
      return;
    }
    pulses.forEach(result => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = `day1-setup__pulse-item is-${result.tone || 'neutral'}`;
      item.title = result.explanation;
      item.appendChild(createIcon(result.icon));
      const avatars = document.createElement('span');
      avatars.className = 'day1-setup__pulse-avatars';
      result.people.slice(0, 2).forEach(id => {
        const survivor = this.member(id);
        if (survivor) avatars.appendChild(this.avatarChip(survivor, { isPlayer: sameId(id, this.player?.id) }));
      });
      const label = document.createElement('strong');
      label.textContent = result.label;
      item.append(avatars, label);
      item.addEventListener('click', () => this.showTooltip(result.explanation, item));
      pulse.appendChild(item);
    });
  }

  async chooseAssignment({ leader, assignmentState, suggestedRole, calculateState }) {
    const stage = this.overlay.querySelector('.day1-setup__stage');
    const speaker = this.overlay.querySelector('.day1-setup__speaker');
    const board = this.overlay.querySelector('.day1-setup__board');
    const leaderChip = board.querySelector('.day1-setup__leader-chip');
    const start = board.querySelector('.day1-setup__start');
    const prompt = board.querySelector('.day1-setup__prompt');
    stage.dataset.stage = 'board';
    speaker.hidden = true;
    board.hidden = false;
    leaderChip.innerHTML = '';
    const leaderAvatar = this.avatarChip(leader);
    const leaderLabel = document.createElement('span');
    leaderLabel.innerHTML = `<small>Camp lead</small><strong>${leader?.firstName || leader?.name || '—'}</strong>`;
    leaderChip.append(leaderAvatar, leaderLabel);

    let state = assignmentState;
    let choiceMade = false;
    const render = () => {
      this.renderTasks({
        assignments: state.assignments,
        selectedRole: state.playerRole,
        suggestedRole,
        choiceMade,
        onSelect: selectRole
      });
      start.disabled = !choiceMade;
      prompt.textContent = choiceMade
        ? `${DAY1_ROLE_DEFINITIONS[state.playerRole].label} selected. The tribe rebalanced around you.`
        : `${DAY1_ROLE_DEFINITIONS[suggestedRole].label} is suggested. Tap it to accept or choose another.`;
      if (choiceMade) this.renderPulse(state.socialPulse);
    };
    const selectRole = roleKey => {
      choiceMade = true;
      state = calculateState(roleKey);
      render();
    };
    render();
    this.focus(`.day1-setup__task[data-role="${suggestedRole}"]`);

    return new Promise(resolve => {
      start.addEventListener('click', () => {
        start.disabled = true;
        resolve(state);
      }, { once: true });
    });
  }

  showError(message) {
    const stage = this.overlay.querySelector('.day1-setup__stage');
    stage.dataset.stage = 'error';
    stage.innerHTML = `<div class="day1-setup__error"><strong>Camp setup paused</strong><span>${message}</span></div>`;
  }

  destroy() {
    this.cleanupCallbacks.splice(0).forEach(cleanup => cleanup());
    this.overlay?.remove();
    if (this.backgroundState?.element) {
      this.backgroundState.element.inert = Boolean(this.backgroundState.inert);
      if (this.backgroundState.ariaHidden == null) this.backgroundState.element.removeAttribute('aria-hidden');
      else this.backgroundState.element.setAttribute('aria-hidden', this.backgroundState.ariaHidden);
    }
    document.body.classList.remove('day1-setup-active');
  }
}
