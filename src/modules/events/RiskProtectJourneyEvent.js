import { createElement } from '../utils/DOMUtils.js';

function buildOverlay(container) {
  const overlay = createElement('div', {
    style: `position:absolute; inset:0; background:rgba(0,0,0,0.82); display:flex; align-items:center; justify-content:center; z-index:7000;`
  });

  const panel = createElement('div', {
    style: `background: url('Assets/parch-landscape.png') center/contain no-repeat, #f0e2c2; width: min(980px, 95vw); min-height: 380px; padding: 42px 32px 32px; box-shadow: 0 10px 34px rgba(0,0,0,0.55); border-radius: 16px; position: relative; display:flex; flex-direction:column; align-items:center; gap:24px; font-family:'Survivant', sans-serif; color:#2b1b0f; text-align:center;`
  });

  const textWrap = createElement('div', {
    style: `width:100%; max-width:760px; font-size:1.05rem; line-height:1.4; text-shadow:0 1px 0 rgba(255,255,255,0.6);`
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

function findSurvivor(gameManager, id) {
  const pool = gameManager?.survivors || [];
  return pool.find(s => s.id === id) || null;
}

const RiskProtectJourneyEvent = {
  async run(container, options = {}) {
    const { gameManager, journey, player, relationshipSystem } = options;
    const ui = buildOverlay(container);

    const awaitContinue = async (lines) => new Promise(resolve => {
      renderLines(ui.textWrap, lines);
      clearButtons(ui.buttons);
      const btn = createButton('Continue', () => resolve());
      ui.buttons.appendChild(btn);
    });

    await awaitContinue([
      'Welcome to the journey.',
      'You’ve been brought here because every choice in this game has consequences — and today, that choice belongs to you.'
    ]);

    await awaitContinue([
      'You’ll each decide whether to protect your vote… or risk it for a potential advantage.',
      'You’ll make that decision privately. No discussion when it’s time.'
    ]);

    await awaitContinue([
      'Before you decide, you’re given time to talk. This is the only moment you’ll have together.'
    ]);

    const otherParticipants = (journey?.participants || []).filter(id => id !== player?.id);
    const pactEntries = [];

    await new Promise(resolve => {
      renderLines(ui.textWrap, [
        'How do you handle the brief conversation with the others?',
        'Choose your approach wisely.'
      ]);
      clearButtons(ui.buttons);

      const makeHandler = (type) => () => {
        otherParticipants.forEach(otherId => {
          const delta = type === 'mergeSoft' ? 5 : type === 'danger' ? 3 : 1;
          relationshipSystem?.changeRelationship?.(player.id, otherId, delta);
          if (type === 'mergeSoft') {
            pactEntries.push({ with: otherId, type: 'mergeSoft', day: journey?.day });
          }
        });
        resolve();
      };

      const dangerBtn = createButton('Talk about how dangerous this twist is.', makeHandler('danger'));
      const mergeBtn = createButton('Float the idea of protecting each other at the merge.', makeHandler('mergeSoft'));
      const vagueBtn = createButton('Stay vague and noncommittal.', makeHandler('vague'));

      ui.buttons.append(dangerBtn, mergeBtn, vagueBtn);
    });

    await awaitContinue([
      'Time to decide. From here on out, you’re on your own.'
    ]);

    const playerChoice = await new Promise(resolve => {
      renderLines(ui.textWrap, [
        'Privately, you face the decision.',
        'Protect your vote… or risk it?'
      ]);
      clearButtons(ui.buttons);

      const protectBtn = createButton('Protect your vote', () => resolve('protect'));
      const riskBtn = createButton('Risk your vote', () => resolve('risk'));

      ui.buttons.append(protectBtn, riskBtn);
    });

    const decisions = [];
    const participants = journey?.participants || [];

    participants.forEach(id => {
      if (id === player?.id) {
        decisions.push({ survivorId: id, choice: playerChoice });
      } else {
        decisions.push({ survivorId: id, choice: Math.random() < 0.5 ? 'protect' : 'risk' });
      }
    });

    const allProtect = decisions.every(d => d.choice === 'protect');
    const allRisk = decisions.every(d => d.choice === 'risk');

    decisions.forEach(decision => {
      const survivor = findSurvivor(gameManager, decision.survivorId);
      if (!survivor) return;

      if (allProtect) {
        survivor.hasVote = true;
      } else if (allRisk) {
        survivor.hasVote = false;
        survivor.votePenalty = {
          type: 'LOST_VOTE_JOURNEY',
          pending: true,
          reason: 'Journey Risk/Protect',
          createdChallengeKey: journey?.challengeKey,
          createdDay: journey?.day
        };
      } else {
        if (decision.choice === 'risk') {
          survivor.hasVote = true;
          survivor.extraVotes = (survivor.extraVotes || 0) + 1;
        } else {
          survivor.hasVote = true;
        }
      }
    });

    journey.results = decisions.map(decision => {
      const survivor = findSurvivor(gameManager, decision.survivorId);
      return {
        survivorId: decision.survivorId,
        choice: decision.choice,
        hasVoteAfter: survivor?.hasVote,
        extraVotesGained: decision.choice === 'risk' && !allProtect && !allRisk ? 1 : 0
      };
    });

    if (pactEntries.length) {
      journey.pacts = journey.pacts || [];
      journey.pacts.push(...pactEntries);
    }

    renderLines(ui.textWrap, ['Journey Results']);
    clearButtons(ui.buttons);

    const list = createElement('div', { style: 'display:flex; flex-direction:column; gap:12px; width:100%; max-width:760px;' });

    decisions.forEach(decision => {
      const survivor = findSurvivor(gameManager, decision.survivorId);
      const row = createElement('div', {
        style: `display:flex; align-items:center; gap:14px; padding:10px 14px; background:rgba(255,255,255,0.7); border-radius:12px; box-shadow:0 4px 12px rgba(0,0,0,0.15);`
      });
      const avatar = createElement('img', {
        src: survivor?.avatarUrl || 'Assets/Avatars/default.png',
        style: 'width:56px; height:56px; border-radius:50%; object-fit:cover; border:3px solid #7a4a1e;'
      });
      const name = createElement('div', { style: 'flex:1; text-align:left; font-weight:bold; font-size:1.05rem; color:#2b1b0f;' }, survivor?.name || 'Unknown');
      const choice = createElement('div', { style: 'font-weight:bold; color:#7a1d1d; font-size:1rem; min-width:90px; text-align:right;' }, decision.choice.toUpperCase());
      row.append(avatar, name, choice);
      list.appendChild(row);
    });

    ui.textWrap.appendChild(list);

    await new Promise(resolve => {
      clearButtons(ui.buttons);
      const btn = createButton('Continue', () => resolve());
      ui.buttons.appendChild(btn);
    });

    ui.overlay.remove();

    return {
      results: journey.results,
      playerChoice
    };
  }
};

export default RiskProtectJourneyEvent;
