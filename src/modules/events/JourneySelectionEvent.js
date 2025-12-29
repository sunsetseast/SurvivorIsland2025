import { createElement } from '../utils/DOMUtils.js';

function buildOverlay(container) {
  const overlay = createElement('div', {
    style: `position:absolute; inset:0; background:rgba(0,0,0,0.8); display:flex; align-items:center; justify-content:center; z-index:7000;`
  });

  const panel = createElement('div', {
    style: `background: url('Assets/parch-landscape.png') center/contain no-repeat, #f0e2c2; width: min(900px, 92vw); min-height: 340px; padding: 40px 32px; box-shadow: 0 8px 30px rgba(0,0,0,0.5); border-radius: 14px; position: relative; display:flex; flex-direction:column; align-items:center; gap:24px; font-family:'Survivant', sans-serif; color:#2b1b0f; text-align:center;`
  });

  const textWrap = createElement('div', {
    style: `width:100%; max-width:700px; font-size:1.05rem; line-height:1.4; text-shadow:0 1px 0 rgba(255,255,255,0.6);`
  });

  const buttons = createElement('div', {
    style: `display:flex; flex-wrap:wrap; gap:12px; justify-content:center; width:100%;`
  });

  panel.append(textWrap, buttons);
  overlay.appendChild(panel);
  container.appendChild(overlay);

  return { overlay, textWrap, buttons };
}

function renderLines(textWrap, lines = []) {
  textWrap.innerHTML = '';
  lines.forEach(line => {
    const p = createElement('div', { style: 'margin:6px 0;' });
    p.textContent = line;
    textWrap.appendChild(p);
  });
}

function clearButtons(buttons) {
  buttons.innerHTML = '';
}

function createButton(label, onClick) {
  return createElement('button', {
    style: `min-width:180px; padding:12px 18px; background:url('Assets/rect-button.png') center/cover no-repeat; border:none; color:#fff; font-family:'Survivant',sans-serif; font-size:1rem; font-weight:bold; cursor:pointer; text-shadow:1px 1px 2px black;`,
    onclick: onClick
  }, label);
}

function clampSuspicion(value) {
  const num = Number.isFinite(value) ? value : 0;
  return Math.max(0, num);
}

function getTribeKey(tribe, index) {
  if (tribe?.id != null) return String(tribe.id);
  if (typeof tribe?.tribeName === 'string') return tribe.tribeName;
  if (typeof tribe?.name === 'string') return tribe.name;
  if (typeof tribe?.name?.name === 'string') return tribe.name.name;
  if (typeof tribe?.color === 'string') return tribe.color;
  return `tribe_${index}`;
}

function pickRandom(arr = []) {
  if (!arr.length) return null;
  const idx = Math.floor(Math.random() * arr.length);
  return arr[idx];
}

const JourneySelectionEvent = {
  async run(container, options = {}) {
    const { gameManager, tribes = [], player, playerTribe, challengeKey, day } = options;
    const ui = buildOverlay(container);
    const tribeKeyCache = new Map();

    const resolveTribeKey = (tribe, index) => {
      if (tribeKeyCache.has(tribe)) return tribeKeyCache.get(tribe);
      const key = getTribeKey(tribe, index);
      tribeKeyCache.set(tribe, key);
      return key;
    };

    const actualPlayerTribe =
      playerTribe ||
      tribes.find(t => (t.members || []).some(m => m.id === player?.id)) ||
      null;

    const isPlayerTribe = (tribe) => (tribe?.members || []).some(m => m.id === player?.id);

    const awaitContinue = async (lines) => new Promise(resolve => {
      renderLines(ui.textWrap, lines);
      clearButtons(ui.buttons);
      const btn = createButton('Continue', () => resolve());
      ui.buttons.appendChild(btn);
    });

    await awaitContinue([
      'Survivors… that was a hard-fought challenge. One tribe comes away with immunity — and safety tonight. But for the rest of you… the game doesn’t stop here.'
    ]);

    await awaitContinue([
      'In this game, advantages can change everything. Today, the next twist begins right now.',
      'Each tribe is going to send one person on a journey — away from camp… and straight into a decision that could affect your vote at Tribal Council.'
    ]);

    await awaitContinue([
      'On this journey, you’ll face a choice: protect your vote… or risk it for a possible advantage.',
      'But here’s the catch — you won’t know what the others choose until it’s over.'
    ]);

    const playerChoice = await new Promise(resolve => {
      renderLines(ui.textWrap, [
        'How do you respond?',
        'This is the moment to decide how badly you want that journey slot.'
      ]);
      clearButtons(ui.buttons);

      const pushBtn = createButton('Push hard to go on the journey.', () => resolve('push'));
      const sitBtn = createButton('Sit this one out.', () => resolve('sitout'));
      const rocksBtn = createButton('Suggest drawing rocks.', () => resolve('rocks'));

      ui.buttons.append(pushBtn, sitBtn, rocksBtn);
    });

    if (playerChoice === 'push') {
      player.suspicion = clampSuspicion((player.suspicion ?? 0) + 1);
    } else if (playerChoice === 'sitout') {
      player.suspicion = clampSuspicion((player.suspicion ?? 0) - 1);
    }

    const participantsByTribe = {};
    const participantsSet = new Set();
    const tribeKeys = [];
    let playerWasSelected = false;

    tribes.forEach((tribe, idx) => {
      const key = resolveTribeKey(tribe, idx);
      tribeKeys.push(key);
      const members = (tribe?.members || []).filter(m => m?.id);
      let selected = null;

      if (isPlayerTribe(tribe)) {
        if (playerChoice === 'push') {
          selected = player;
          playerWasSelected = true;
        } else if (playerChoice === 'sitout') {
          const others = members.filter(m => m.id !== player?.id);
          selected = pickRandom(others);
          playerWasSelected = selected?.id === player?.id;
        } else {
          selected = pickRandom(members);
          playerWasSelected = selected?.id === player?.id;
        }
      } else {
        selected = pickRandom(members.filter(m => m.id !== player?.id));
      }

      if (!selected && members.length) {
        selected = members[0];
      }

      if (selected?.id === player?.id) {
        playerWasSelected = true;
      }

      participantsByTribe[key] = selected?.id || null;
      if (selected?.id) {
        participantsSet.add(selected.id);
      }
    });

    const participants = Array.from(participantsSet);

    await awaitContinue([
      'Alright. Decision made.',
      ...tribes.map((tribe, idx) => {
        const selectedId = participantsByTribe[resolveTribeKey(tribe, idx)];
        const selectedSurvivor = (tribe?.members || []).find(m => m.id === selectedId) ||
          (gameManager?.survivors || []).find(s => s.id === selectedId);
        const tribeName = tribe?.tribeName || tribe?.name || 'Tribe';
        const name = selectedSurvivor?.name || selectedSurvivor?.firstName || selectedId || 'Someone';
        return `From the ${tribeName} — ${name}. …`;
      })
    ]);

    await awaitContinue([
      'Grab your things. Your journey starts now.'
    ]);

    gameManager.journey = {
      active: true,
      challengeKey,
      day,
      phase: 'postChallenge',
      participantsByTribe,
      participants,
      selection: {
        playerChoice,
        playerWasSelected
      }
    };

    console.log('[JourneySelectionEvent] selection summary', {
      playerTribeResolved: actualPlayerTribe?.tribeName || actualPlayerTribe?.name || actualPlayerTribe?.id || null,
      tribeKeys,
      participantsByTribe,
      participants
    });

    ui.overlay.remove();

    return {
      playerWasSelected,
      journey: gameManager.journey
    };
  }
};

export default JourneySelectionEvent;
