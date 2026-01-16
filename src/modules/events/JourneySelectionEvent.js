import { clearChildren } from '../utils/DOMUtils.js';
import JourneyBeatUI from '../ui/JourneyBeatUI.js';

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
    if (container) {
      clearChildren(container);
      container.style.position = 'relative';
      JourneyBeatUI.forceCleanup(container);
    }
    if (this.ui) {
      this.ui.destroy();
    }
    const ui = new JourneyBeatUI(container);
    this.ui = ui;
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

    const showBeatAndWait = async (config) => new Promise(resolve => {
      if (config?.background !== undefined) {
        ui.setSceneBackground(config.background);
      }
      ui.renderBeat({
        title: config?.title,
        textLines: config?.textLines,
        html: config?.html,
        frameMode: config?.frameMode,
        layout: config?.layout,
        buttons: [{ label: 'Continue', onClick: () => resolve() }]
      });
    });

    const showChoiceBeat = async (config) => new Promise(resolve => {
      if (config?.background !== undefined) {
        ui.setSceneBackground(config.background);
      }
      ui.renderBeat({
        title: config?.title,
        textLines: config?.textLines,
        html: config?.html,
        frameMode: config?.frameMode,
        layout: config?.layout,
        buttons: (config?.buttons || []).map(btn => ({
          label: btn.label,
          onClick: () => resolve(btn.value)
        }))
      });
    });

    try {
      await showBeatAndWait({
        background: 'Assets/jeff-screen.png',
        textLines: [
        'Survivors… that was a hard-fought challenge. One tribe comes away with immunity — and safety tonight. But for the rest of you… the game doesn’t stop here.'
        ]
      });
      await showBeatAndWait({
        background: 'Assets/jeff-screen.png',
        textLines: [
        'In this game, advantages can change everything. Today, the next twist begins right now.',
        'Each tribe is going to send one person on a journey — away from camp… and straight into a decision that could affect your vote at Tribal Council.'
        ]
      });

      await showBeatAndWait({
        background: 'Assets/jeff-screen.png',
        textLines: [
        'On this journey, you’ll face a choice: protect your vote… or risk it for a possible advantage.',
        'But here’s the catch — you won’t know what the others choose until it’s over.'
        ]
      });

      const playerChoice = await showChoiceBeat({
        background: 'Assets/jeff-screen.png',
        title: 'How do you respond?',
        textLines: ['This is the moment to decide how badly you want that journey slot.'],
        buttons: [
          { label: 'Push hard to go on the journey.', value: 'push' },
          { label: 'Sit this one out.', value: 'sitout' },
          { label: 'Suggest drawing rocks.', value: 'rocks' }
        ]
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

      await showBeatAndWait({
        background: 'Assets/jeff-screen.png',
        textLines: [
        'Alright. Decision made.',
        ...tribes.map((tribe, idx) => {
          const selectedId = participantsByTribe[resolveTribeKey(tribe, idx)];
          const selectedSurvivor = (tribe?.members || []).find(m => m.id === selectedId) ||
            (gameManager?.survivors || []).find(s => s.id === selectedId);
          const tribeName = tribe?.tribeName || tribe?.name || 'Tribe';
          const name = selectedSurvivor?.name || selectedSurvivor?.firstName || selectedId || 'Someone';
          return `From the ${tribeName} — ${name}. …`;
        })
        ]
      });

      await showBeatAndWait({
        background: 'Assets/Journey/boat.png',
        textLines: [
        'Grab your things. Your journey starts now.'
        ]
      });

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

      return {
        playerWasSelected,
        journey: gameManager.journey
      };
    } finally {
      if (this.ui) {
        this.ui.destroy();
        this.ui = null;
      }
      if (container) {
        JourneyBeatUI.forceCleanup(container);
      }
    }
  }
};

export default JourneySelectionEvent;
