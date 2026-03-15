import JourneyBeatUI from '../ui/JourneyBeatUI.js';

function survivorName(gameManager, survivorId) {
  const survivor = (gameManager?.survivors || []).find((entry) => String(entry.id) === String(survivorId));
  return survivor?.firstName || survivor?.name || 'Someone';
}

function getContainer(campScreen) {
  return campScreen?.container || document.getElementById('camp-screen') || document.body;
}

export default class NarrativeEventRunner {
  constructor({ gameManager, campScreen, challengeManager } = {}) {
    this.gameManager = gameManager;
    this.campScreen = campScreen;
    this.challengeManager = challengeManager;
  }

  applyEffect(effect = {}) {
    const gm = this.gameManager;
    if (!gm || !effect?.type) return;
    const value = Number(effect.value || 0);
    const target = (gm.survivors || []).find((entry) => String(entry.id) === String(effect.targetId));

    if (effect.type === 'relationship' && effect.fromId && effect.toId) {
      gm.systems?.relationshipSystem?.changeRelationship?.(effect.fromId, effect.toId, value);
      return;
    }

    if (effect.type === 'trust' && effect.aId && effect.bId) {
      gm.systems?.trustSystem?.changeTrust?.(effect.aId, effect.bId, value, effect.reason || 'narrative_event');
      return;
    }

    if (!target) return;
    if (effect.type === 'teamPlayer') {
      target.teamPlayer = Math.max(0, Math.min(100, (target.teamPlayer ?? 50) + value));
    }
    if (effect.type === 'challengeThreat') {
      target.challengeThreat = Math.max(0, Math.min(100, (target.challengeThreat ?? 50) + value));
    }
    if (effect.type === 'suspicion') {
      target.suspicion = Math.max(0, (target.suspicion ?? 0) + value);
    }
  }

  async waitForContinue(ui, config = {}) {
    return new Promise((resolve) => {
      ui.renderBeat({
        title: config.title,
        textLines: config.text,
        buttons: [{ label: 'Continue', onClick: () => resolve() }]
      });
    });
  }

  async waitForChoice(ui, beat = {}) {
    return new Promise((resolve) => {
      ui.renderBeat({
        title: beat.title || 'Your response',
        textLines: beat.prompt || 'How do you respond?',
        buttons: (beat.options || []).map((option) => ({
          label: option.text ? `${option.label}: ${option.text}` : option.label,
          onClick: () => resolve(option)
        }))
      });
    });
  }

  async run(script = {}) {
    const container = getContainer(this.campScreen);
    const ui = new JourneyBeatUI(container);
    const context = {
      scriptId: script.id || 'narrative_event',
      selectedChoiceId: null,
      selectedChoice: null
    };

    try {
      for (const beat of script.beats || []) {
        if (beat.type === 'narration') {
          await this.waitForContinue(ui, { title: beat.title || 'Camp', text: beat.text });
        } else if (beat.type === 'npcDialogue') {
          await this.waitForContinue(ui, {
            title: survivorName(this.gameManager, beat.speakerId),
            text: beat.text
          });
        } else if (beat.type === 'playerChoice') {
          const choice = await this.waitForChoice(ui, beat);
          context.selectedChoiceId = choice?.id || null;
          context.selectedChoice = choice || null;
          (choice?.effects || []).forEach((effect) => this.applyEffect(effect));
        } else if (beat.type === 'resolution') {
          const text = beat.textByChoice?.[context.selectedChoiceId] || beat.text || '';
          await this.waitForContinue(ui, { title: beat.title || 'Camp', text });
        }
      }
    } finally {
      ui.destroy();
      JourneyBeatUI.forceCleanup(container);
    }

    return context;
  }
}
