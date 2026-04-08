import NarrativeEventRunner from '../systems/NarrativeEventRunner.js';

const EVENT_ID = 'first_loss_event';

const choiceTriplet = (publicText, whisperText) => ({
  public: publicText,
  whisper: whisperText,
  silent: null
});

const TEMPLATES = {
  steady: {
    opening: 'Your tribe returns to camp after a tough immunity loss. The energy is heavy, and nobody is pretending this feels good.',
    npc: 'That stings. We need to reset fast.',
    choices: choiceTriplet('We take the hit and move. No panic.', 'Losses expose cracks quickly. We should pay attention.'),
    resolution: {
      public: 'The response helps settle nerves and keeps the tribe from spiraling.',
      whisper: 'The private comment shifts the moment from emotion to strategy.',
      silent: 'You stay quiet and watch who looks rattled versus who looks ready.'
    }
  },
  blame: {
    opening: 'Back at camp, disappointment turns into finger-pointing faster than anyone wants to admit.',
    npc: '[LVP_NAME] really hurt us out there.',
    choices: choiceTriplet('One challenge doesn’t define anybody.', 'People remember weak links. That part is real.'),
    resolution: {
      public: 'You cool things down and push the tribe away from a pile-on.',
      whisper: 'Your private agreement deepens the strategic undertone of the conversation.',
      silent: 'You let others talk and log who wants unity versus a target.'
    }
  },
  shield: {
    opening: 'The tribe is frustrated, but someone steps in before the blame gains momentum.',
    npc: 'We all had misses. Don’t dump this on one person.',
    choices: choiceTriplet('Exactly. We fix it together.', 'Maybe, but this game still keeps score.'),
    resolution: {
      public: 'Your response reinforces a team-first tone after the loss.',
      whisper: 'The whisper leaves room for doubt while the public mood stays calm.',
      silent: 'You stay neutral and keep your read on the social fallout.'
    }
  }
};

function fill(text, vars) {
  if (!text) return text;
  return text.replaceAll('[LVP_NAME]', vars.lvpName || 'Someone');
}

function relScore(gameManager, fromId, toId) {
  return gameManager.systems?.relationshipSystem?.getRelationship?.(fromId, toId)?.value ?? 50;
}

function pickByRelationship(gameManager, candidates, targetId, mode = 'high', excludeId = null) {
  const pool = (candidates || []).filter((c) => c?.id && String(c.id) !== String(excludeId));
  if (!pool.length) return null;
  const sorted = [...pool].sort((a, b) => relScore(gameManager, a.id, targetId) - relScore(gameManager, b.id, targetId));
  return mode === 'high' ? sorted[sorted.length - 1] : sorted[0];
}

const FirstLossEvent = {
  id: EVENT_ID,

  isEligible(result, gameManager) {
    if (!result) return false;
    if (result.playerTribeWon) return false;
    if (gameManager?.journey?.selection?.playerWasSelected) return false;
    if (gameManager.flags?.firstLossEventSeen) return false;
    return true;
  },

  resolveSpeaker({ gameManager, playerId, lvpId }) {
    const tribe = gameManager.getPlayerTribe?.();
    const members = (tribe?.members || []).filter((member) => String(member.id) !== String(playerId));
    if (!members.length) return null;

    if (lvpId) {
      return pickByRelationship(gameManager, members, lvpId, 'low', lvpId) || members[0];
    }

    return members[0];
  },

  async runScripted({ gameManager, challengeManager, campScreen }) {
    const result = challengeManager.getLastChallengeResult?.();
    if (!this.isEligible(result, gameManager)) return;

    const player = gameManager.getPlayerSurvivor?.();
    const playerId = player?.id;
    const lvpId = result.playerTribeOverallLvp || null;

    const speaker = this.resolveSpeaker({ gameManager, playerId, lvpId });
    if (!speaker) return;

    const vars = {
      lvpName: (gameManager.survivors || []).find((s) => String(s.id) === String(lvpId))?.firstName
    };

    const scenario = lvpId ? (Math.random() < 0.5 ? 'blame' : 'shield') : 'steady';
    const template = TEMPLATES[scenario] || TEMPLATES.steady;

    const script = {
      id: EVENT_ID,
      beats: [
        { type: 'narration', text: fill(template.opening, vars) },
        { type: 'npcDialogue', speakerId: speaker.id, text: fill(template.npc, vars) },
        {
          type: 'playerChoice',
          options: [
            {
              id: 'public',
              label: 'Public response',
              text: fill(template.choices.public, vars),
              visibility: 'public',
              effects: [{ type: 'teamPlayer', targetId: playerId, value: 2 }]
            },
            {
              id: 'whisper',
              label: 'Whisper response',
              text: fill(template.choices.whisper, vars),
              visibility: 'private',
              targetId: speaker.id,
              effects: [{ type: 'trust', aId: playerId, bId: speaker.id, value: 2 }]
            },
            {
              id: 'silent',
              label: 'Stay quiet',
              text: null,
              visibility: 'silent',
              effects: [{ type: 'suspicion', targetId: playerId, value: -1 }]
            }
          ]
        },
        {
          type: 'resolution',
          textByChoice: {
            public: fill(template.resolution.public, vars),
            whisper: fill(template.resolution.whisper, vars),
            silent: fill(template.resolution.silent, vars)
          }
        }
      ]
    };

    const runner = new NarrativeEventRunner({ gameManager, challengeManager, campScreen });
    await runner.run(script);
    gameManager.flags = gameManager.flags || {};
    gameManager.flags.firstLossEventSeen = true;
  }
};

export default FirstLossEvent;
