import NarrativeEventRunner from '../systems/NarrativeEventRunner.js';

const EVENT_ID = 'first_win_event';

const choiceTriplet = (publicText, whisperText) => ({
  public: publicText,
  whisper: whisperText,
  silent: null
});

const TEMPLATES = {
  unifiedCelebration: {
    opening: 'Your tribe returns to camp riding the rush of the first immunity win. For the first time all day, people feel less like strangers on a beach and more like a tribe.',
    npc: 'That’s how you start this game. First challenge, first win.',
    choices: choiceTriplet('That’s what I’m talking about. We needed this.', 'This is good... but wins like this make people relax fast.'),
    resolution: {
      public: 'The mood lifts even more. A few people smile, nod, and settle into the feeling that the tribe might really have something.',
      whisper: 'You share the thought quietly, planting a more strategic tone beneath the celebration.',
      silent: 'You let the celebration breathe and watch who leans in, who hangs back, and who already seems to be calculating.'
    }
  },
  mvpPraise_nonMvp: {
    opening: 'Back at camp, the tribe is still buzzing from the win. One name starts coming up more than the others.',
    npc: '[MVP_NAME] really stepped up out there.',
    choices: choiceTriplet('Yeah, they were huge for us.', 'Strong players get noticed quickly.'),
    resolution: {
      public: 'The comment adds to the praise around [MVP_NAME], raising their stock in the tribe’s eyes.',
      whisper: 'The private remark shifts the moment from admiration to strategy, if only a little.',
      silent: 'You say nothing, letting the tribe reveal whether they see [MVP_NAME] as an asset, a shield, or a threat.'
    }
  },
  mvpPraise_mvp: {
    opening: 'The tribe gets back to camp still energized from the win, and before long the attention starts turning toward you.',
    npc: 'You were huge for us out there.',
    choices: choiceTriplet('We all did our part. I just came through when I needed to.', 'People notice challenge strength early. I know that.'),
    resolution: {
      public: 'Your answer lands well. The praise stays on the win instead of becoming all about you.',
      whisper: 'The private response shows you already understand how quickly a good performance can become a target.',
      silent: 'You let the praise hang in the air. Some seem impressed. Others already seem to be filing it away.'
    }
  },
  mvpSuspicion_nonMvp: {
    opening: 'As the celebration settles, not everyone is thinking about the win the same way.',
    npc: '[MVP_NAME] looked really strong out there. That kind of player gets hard to beat later.',
    choices: choiceTriplet('If we’re already talking about threats after one win, we’re doing too much.', 'Yeah... people remember who stands out.'),
    resolution: {
      public: 'Your comment pushes the mood back toward tribe unity, at least on the surface.',
      whisper: 'The private agreement creates a subtle strategic link between you and the speaker.',
      silent: 'You keep your thoughts to yourself and let the first seeds of challenge paranoia take root without your help.'
    }
  },
  mvpSuspicion_mvp: {
    opening: 'The tribe won, but you can already feel that a strong performance comes with eyes on you.',
    npc: 'People are going to remember what you did out there.',
    choices: choiceTriplet('Good. Let them remember the tribe won.', 'That’s exactly why I’m not getting comfortable.'),
    resolution: {
      public: 'You redirect the spotlight back onto the tribe, softening the edge of the moment.',
      whisper: 'The whisper makes it clear you understand the game beneath the celebration.',
      silent: 'You say nothing, and the silence does little to stop people from drawing their own conclusions.'
    }
  },
  lvpCriticism_nonLvp: {
    opening: 'The win helps, but it doesn’t erase every moment from the challenge.',
    npc: 'We won, sure, but [LVP_NAME] really struggled out there.',
    choices: choiceTriplet('It’s Day 1. One rough challenge doesn’t define anybody.', 'People do notice weak spots. That part’s true.'),
    resolution: {
      public: 'The comment cools the criticism a little and makes the tribe sound more patient.',
      whisper: 'Your quiet agreement turns the conversation into something more strategic than emotional.',
      silent: 'You stay out of it, learning who is quick to judge and who is willing to protect.'
    }
  },
  lvpCriticism_lvp: {
    opening: 'The tribe has the win, but you can still feel the weight of your roughest moments following you back to camp.',
    npc: 'We got the win, but you can’t have a round like that again.',
    choices: choiceTriplet('That’s fair. I had a rough stretch. I’ll be better next time.', 'One bad stretch doesn’t define me. You know that.'),
    resolution: {
      public: 'The response takes some of the heat out of the moment by showing accountability.',
      whisper: 'The quiet pushback keeps your pride intact and turns the exchange into a more personal read.',
      silent: 'The silence makes the comment land even harder, and the tribe fills in the blanks for itself.'
    }
  },
  lvpDefense_nonLvp: {
    opening: 'The conversation starts drifting toward who struggled, but someone cuts in before it goes too far.',
    npc: 'Come on. It’s the first challenge on the first day. [LVP_NAME] wasn’t the whole story out there.',
    choices: choiceTriplet('Exactly. Too early to pile on anybody.', 'Maybe, but people still keep score.'),
    resolution: {
      public: 'Your response reinforces the defense and helps the tribe pull back from turning one moment into a label.',
      whisper: 'The whisper keeps the criticism alive beneath the calmer public mood.',
      silent: 'You stay quiet and clock who rushed to defend, and who seemed disappointed that the criticism stopped.'
    }
  },
  lvpDefense_lvp: {
    opening: 'The conversation starts leaning your way, but someone steps in before the criticism can settle.',
    npc: 'Come on. It’s Day 1. Nobody’s going to be perfect right away.',
    choices: choiceTriplet('I appreciate that. I’ll prove it next time.', 'I don’t need saving, but I won’t forget that.'),
    resolution: {
      public: 'The answer makes you seem grateful and steady, and the moment loses some of its sting.',
      whisper: 'The private reply creates a more personal bond, mixed with a little pride.',
      silent: 'You let the defense stand on its own and watch carefully to see who agrees with it.'
    }
  },
  lvpReassurance_nonLvp: {
    opening: 'The win gives the tribe room to breathe, but the rougher performance still lingers in the air.',
    npc: '[LVP_NAME] says they’ll be better next time.',
    choices: choiceTriplet('That’s all anybody can ask.', 'We’ll see if they mean it.'),
    resolution: {
      public: 'Your response gives the tribe a path to move forward without dwelling on the weakness.',
      whisper: 'The private doubt keeps the concern alive, just not out in the open.',
      silent: 'You let the reassurance hang there and study who buys it.'
    }
  },
  lvpReassurance_lvp: {
    opening: 'The tribe won, but you know people noticed your rough stretch. How you handle it now matters.',
    npc: 'Everyone has rough moments. What matters is what happens next.',
    choices: choiceTriplet('I know I was off. I’ll bounce back.', 'One bad stretch doesn’t mean I’m weak.'),
    resolution: {
      public: 'The honesty takes some of the heat out of the moment and helps you begin to recover socially.',
      whisper: 'The private defense protects your pride, but it keeps the conversation strategic instead of healing.',
      silent: 'You keep your thoughts to yourself and let the tribe decide what your silence means.'
    }
  }
};

function fill(text, vars) {
  if (!text) return text;
  return text.replaceAll('[MVP_NAME]', vars.mvpName || 'Someone').replaceAll('[LVP_NAME]', vars.lvpName || 'Someone');
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

function chooseScenario(result, gameManager, playerId) {
  const hasMvp = !!result.playerTribeOverallMvp;
  const hasLvp = !!result.playerTribeOverallLvp;
  const tribe = gameManager.getPlayerTribe?.();
  const members = (tribe?.members || []).filter((m) => String(m.id) !== String(playerId));
  const mvpId = result.playerTribeOverallMvp;
  const lvpId = result.playerTribeOverallLvp;

  const positivity = (targetId) => {
    if (!targetId || !members.length) return 0;
    return members.reduce((sum, member) => sum + (relScore(gameManager, member.id, targetId) - 50), 0);
  };

  const mvpMood = positivity(mvpId);
  const lvpMood = positivity(lvpId);

  if (hasMvp && hasLvp) {
    if (mvpMood >= 10) return 'mvpPraise';
    if (mvpMood <= -10) return 'mvpSuspicion';
    if (lvpMood <= -5) return 'lvpCriticism';
    return 'lvpDefense';
  }
  if (hasMvp) return mvpMood >= 0 ? 'mvpPraise' : 'mvpSuspicion';
  if (hasLvp) {
    if (lvpMood <= -8) return 'lvpCriticism';
    if (lvpMood >= 8) return 'lvpDefense';
    return 'lvpReassurance';
  }
  return 'unifiedCelebration';
}

function getTemplateForScenario(scenario, role) {
  if (scenario === 'unifiedCelebration') return TEMPLATES.unifiedCelebration;
  if (scenario === 'mvpPraise') return role === 'mvp' ? TEMPLATES.mvpPraise_mvp : TEMPLATES.mvpPraise_nonMvp;
  if (scenario === 'mvpSuspicion') return role === 'mvp' ? TEMPLATES.mvpSuspicion_mvp : TEMPLATES.mvpSuspicion_nonMvp;
  if (scenario === 'lvpCriticism') return role === 'lvp' ? TEMPLATES.lvpCriticism_lvp : TEMPLATES.lvpCriticism_nonLvp;
  if (scenario === 'lvpDefense') return role === 'lvp' ? TEMPLATES.lvpDefense_lvp : TEMPLATES.lvpDefense_nonLvp;
  if (scenario === 'lvpReassurance') return role === 'lvp' ? TEMPLATES.lvpReassurance_lvp : TEMPLATES.lvpReassurance_nonLvp;
  return TEMPLATES.unifiedCelebration;
}

const FirstWinEvent = {
  id: EVENT_ID,

  isEligible(result, gameManager) {
    if (!result) return false;
    if (!result.playerTribeWon) return false;
    if (result.challengeDay !== 1) return false;
    if (result.challengeKey !== 'first_contact') return false;
    if (gameManager.postChallengeMode !== 'scripted') return false;
    if (gameManager.flags?.firstWinEventSeen) return false;
    return true;
  },

  resolveSpeaker({ gameManager, result, scenario, playerId, mvpId, lvpId }) {
    const tribe = gameManager.getPlayerTribe?.();
    const members = (tribe?.members || []).filter((member) => String(member.id) !== String(playerId));
    if (!members.length) return null;

    switch (scenario) {
      case 'mvpPraise':
        return pickByRelationship(gameManager, members, mvpId, 'high', playerId) || members[0];
      case 'mvpSuspicion':
        return pickByRelationship(gameManager, members, mvpId, 'low', mvpId) || members[0];
      case 'lvpCriticism':
        return pickByRelationship(gameManager, members, lvpId, 'low', lvpId) || members[0];
      case 'lvpDefense':
      case 'lvpReassurance':
        return pickByRelationship(gameManager, members, lvpId, 'high', lvpId) || members[0];
      default:
        return members[0];
    }
  },

  buildEffects({ scenario, role, playerId, speakerId, mvpId, lvpId }) {
    const shared = {
      public: [{ type: 'teamPlayer', targetId: playerId, value: 3 }],
      whisper: [{ type: 'trust', aId: playerId, bId: speakerId, value: 3 }],
      silent: [{ type: 'suspicion', targetId: playerId, value: -1 }]
    };

    if (scenario.startsWith('mvp') && mvpId) {
      shared.public.push({ type: 'relationship', fromId: playerId, toId: mvpId, value: role === 'mvp' ? 0 : 3 });
      shared.whisper.push({ type: 'challengeThreat', targetId: mvpId, value: role === 'mvp' ? 4 : 3 });
      shared.silent.push({ type: 'challengeThreat', targetId: mvpId, value: 2 });
    }

    if (scenario.startsWith('lvp') && lvpId) {
      shared.public.push({ type: 'relationship', fromId: playerId, toId: lvpId, value: 3 });
      shared.whisper.push({ type: 'relationship', fromId: playerId, toId: lvpId, value: role === 'lvp' ? 1 : -2 });
    }

    return shared;
  },

  async runScripted({ gameManager, challengeManager, campScreen }) {
    const result = challengeManager.getLastChallengeResult?.();
    console.log('[FirstWinEvent] eligibility check mode =', gameManager?.postChallengeMode);
    if (!this.isEligible(result, gameManager)) return;

    const player = gameManager.getPlayerSurvivor?.();
    const playerId = player?.id;
    const mvpId = result.playerTribeOverallMvp || null;
    const lvpId = result.playerTribeOverallLvp || null;
    const playerIsMvp = mvpId && String(mvpId) === String(playerId);
    const playerIsLvp = lvpId && String(lvpId) === String(playerId);
    const role = playerIsMvp ? 'mvp' : playerIsLvp ? 'lvp' : 'neutral';

    let scenario = chooseScenario(result, gameManager, playerId);
    const speaker = this.resolveSpeaker({ gameManager, result, scenario, playerId, mvpId, lvpId });
    if (!speaker) scenario = 'unifiedCelebration';
    const finalSpeaker = speaker || this.resolveSpeaker({ gameManager, result, scenario: 'unifiedCelebration', playerId, mvpId, lvpId });
    if (!finalSpeaker) return;

    const template = getTemplateForScenario(scenario, role);

    const vars = {
      mvpName: (gameManager.survivors || []).find((s) => String(s.id) === String(mvpId))?.firstName,
      lvpName: (gameManager.survivors || []).find((s) => String(s.id) === String(lvpId))?.firstName
    };

    const effects = this.buildEffects({ scenario, role, playerId, speakerId: finalSpeaker.id, mvpId, lvpId });

    console.info('[FirstWinEvent] scenario + speaker selected', {
      scenario,
      speakerId: finalSpeaker.id,
      speakerName: finalSpeaker.firstName,
      role
    });

    const script = {
      id: EVENT_ID,
      beats: [
        { type: 'narration', text: fill(template.opening, vars) },
        { type: 'npcDialogue', speakerId: finalSpeaker.id, text: fill(template.npc, vars) },
        {
          type: 'playerChoice',
          options: [
            { id: 'public', label: 'Public response', text: fill(template.choices.public, vars), visibility: 'public', effects: effects.public },
            { id: 'whisper', label: 'Whisper response', text: fill(template.choices.whisper, vars), visibility: 'private', targetId: finalSpeaker.id, effects: effects.whisper },
            { id: 'silent', label: 'Stay quiet', text: null, visibility: 'silent', effects: effects.silent }
          ]
        },
        { type: 'resolution', textByChoice: {
          public: fill(template.resolution.public, vars),
          whisper: fill(template.resolution.whisper, vars),
          silent: fill(template.resolution.silent, vars)
        } }
      ]
    };

    const runner = new NarrativeEventRunner({ gameManager, challengeManager, campScreen });
    const outcome = await runner.run(script);
    console.info('[FirstWinEvent] player choice selected', {
      selectedChoiceId: outcome?.selectedChoiceId
    });
    gameManager.flags = gameManager.flags || {};
    gameManager.flags.firstWinEventSeen = true;
  }
};

export default FirstWinEvent;
