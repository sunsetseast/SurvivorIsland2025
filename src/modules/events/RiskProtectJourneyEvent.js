import { createElement, clearChildren } from '../utils/DOMUtils.js';
import eventManager, { GameEvents } from '../core/EventManager.js';
import { GamePhase } from '../core/GameManager.js';
import JourneyBeatUI, { getSurvivorAvatarSrc } from '../ui/JourneyBeatUI.js';

function findSurvivor(gameManager, id) {
  const pool = gameManager?.survivors || [];
  return pool.find(s => s.id === id) || null;
}

function findTribeForSurvivor(gameManager, survivorId) {
  const tribes = gameManager?.getTribes?.() || gameManager?.tribes || [];
  return tribes.find(tribe => (tribe?.members || []).some(member => member.id === survivorId)) || null;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

const FALLBACK_TRIBE_COLORS = {
  red: '#d64541',
  orange: '#e67e22',
  blue: '#3498db',
  purple: '#9b59b6',
  green: '#27ae60',
  yellow: '#f1c40f',
  teal: '#1abc9c'
};

function resolveTribeColor(tribe) {
  const rawColor = tribe?.tribeColor || tribe?.color || null;
  if (rawColor && /^#([0-9a-f]{3}){1,2}$/i.test(rawColor)) {
    return rawColor;
  }
  const name = (tribe?.tribeName || tribe?.name || rawColor || '').toString().trim().toLowerCase();
  return FALLBACK_TRIBE_COLORS[name] || '#333';
}

function getSurvivorTribeColor(gameManager, survivorId) {
  const tribe = findTribeForSurvivor(gameManager, survivorId);
  return resolveTribeColor(tribe);
}

function getTrustValue(trustSystem, playerId, npcId) {
  if (!playerId || !npcId) return 50;
  if (typeof trustSystem?.getTrust === 'function') {
    return trustSystem.getTrust(playerId, npcId) ?? 50;
  }
  return 50;
}

function gatherDescriptors(npc) {
  const descriptors = [];
  const pushValue = (value) => {
    if (!value) return;
    if (Array.isArray(value)) {
      value.forEach(item => descriptors.push(String(item).toLowerCase()));
    } else {
      descriptors.push(String(value).toLowerCase());
    }
  };

  pushValue(npc?.gameplayStyle);
  pushValue(npc?.archetype);
  pushValue(npc?.personality);
  pushValue(npc?.traits?.mental);
  pushValue(npc?.traits?.social);
  pushValue(npc?.strategy);

  return descriptors;
}

function getFirstName(name) {
  if (!name || typeof name !== 'string') return '';
  return name.trim().split(' ')[0] || '';
}

function getNpcProfile(npc) {
  const descriptors = gatherDescriptors(npc);
  const has = (keywords) => keywords.some(keyword => descriptors.some(desc => desc.includes(keyword)));
  const paranoiaValue = Number.isFinite(npc?.paranoia) ? npc.paranoia : null;
  const loyaltyValue = Number.isFinite(npc?.loyalty) ? npc.loyalty : null;

  return {
    cautious: has(['cautious', 'careful', 'safe', 'risk-averse', 'conservative']),
    paranoid: has(['paranoid', 'suspicious']) || (paranoiaValue !== null && paranoiaValue >= 60),
    bold: has(['bold', 'chaotic', 'aggressive', 'risk', 'gamble']),
    strategist: has(['strategist', 'strategic', 'planner', 'calculating', 'schemer']),
    social: has(['social', 'loyal', 'friendly', 'empathetic']) || (loyaltyValue !== null && loyaltyValue >= 60)
  };
}

function generateNpcReactionLine(npc, approach) {
  const profile = getNpcProfile(npc);

  if (approach === 'danger') {
    if (profile.cautious || profile.paranoid) {
      return 'I don’t love this. Protecting the vote feels smarter than gambling with it.';
    }
    if (profile.bold) {
      return 'I hear you, but this game rewards swings. I’m not here to play scared.';
    }
    if (profile.strategist) {
      return 'Noted. I’ll watch how everyone handles risk before I commit to anything.';
    }
    if (profile.social) {
      return 'Keeping votes intact keeps options open. I’m leaning cautious for now.';
    }
    return 'It’s risky. I’m keeping my guard up until I see how others lean.';
  }

  if (approach === 'mergeSoft') {
    if (profile.social) {
      return 'A quiet promise could help both of us later. I’m open if it’s real.';
    }
    if (profile.strategist) {
      return 'Maybe. I’ll remember this, but I need to see follow-through.';
    }
    if (profile.cautious || profile.paranoid) {
      return 'I’ll listen, but I’m protecting myself first. Trust is earned.';
    }
    if (profile.bold) {
      return 'Sure, but I’m not chaining myself down. I want options.';
    }
    return 'It’s something to keep in mind, but we’ll see where this goes.';
  }

  if (profile.strategist) {
    return 'You’re keeping it vague. That makes me hedge my bets.';
  }
  if (profile.paranoid || profile.cautious) {
    return 'That’s too slippery for me. I’ll assume people are hiding something.';
  }
  if (profile.bold) {
    return 'Alright, keep it vague. I’ll still swing if I want to.';
  }
  if (profile.social) {
    return 'Hard to build trust if no one says anything.';
  }
  return 'Fair enough. I’ll make my own call when the time comes.';
}

function buildSocialContext({ playerApproach, npcSurvivors, trustSystem, playerId, journey }) {
  const trustDeltaByNpcId = {};
  const tagsByNpcId = {};

  npcSurvivors.forEach(npc => {
    const profile = getNpcProfile(npc);
    let delta = 0;
    const tags = [];

    if (playerApproach === 'danger') {
      tags.push('advocated_caution');
      if (profile.cautious || profile.paranoid) delta += 1;
      if (profile.social) delta += 1;
      if (profile.bold) delta -= 1;
    } else if (playerApproach === 'mergeSoft') {
      tags.push('merge_pact_attempt');
      if (profile.social) delta += 2;
      if (profile.strategist) delta += 1;
      if (profile.paranoid) delta -= 1;
    } else {
      tags.push('was_vague');
      delta -= 1;
      if (profile.strategist) delta -= 1;
      if (profile.paranoid || profile.cautious) delta -= 1;
    }

    delta = clamp(delta, -2, 2);
    if (delta > 0) tags.push('seemed_open');
    if (delta < 0) tags.push('seemed_shady');

    trustDeltaByNpcId[npc.id] = delta;
    tagsByNpcId[npc.id] = tags;
  });

  const baseExpectation = playerApproach === 'mergeSoft' ? 0.55 : playerApproach === 'danger' ? 0.25 : 0.35;
  const avgTrust = npcSurvivors.length
    ? npcSurvivors.reduce((sum, npc) => sum + getTrustValue(trustSystem, playerId, npc.id), 0) / npcSurvivors.length
    : 50;
  const avgDelta = npcSurvivors.length
    ? npcSurvivors.reduce((sum, npc) => sum + (trustDeltaByNpcId[npc.id] || 0), 0) / npcSurvivors.length
    : 0;
  const trustBias = (avgTrust - 50) / 50;

  let groupRiskExpectation = baseExpectation;
  if (playerApproach === 'mergeSoft') {
    groupRiskExpectation += trustBias * 0.12 + avgDelta * 0.05;
  } else if (playerApproach === 'danger') {
    groupRiskExpectation += trustBias * 0.04 + avgDelta * 0.04;
  } else {
    groupRiskExpectation += trustBias * 0.03 + avgDelta * 0.04;
  }
  groupRiskExpectation = clamp(groupRiskExpectation, 0.05, 0.95);

  return {
    playerApproach,
    groupRiskExpectation,
    trustDeltaByNpcId,
    tagsByNpcId,
    createdDay: journey?.day,
    createdChallengeKey: journey?.challengeKey
  };
}

function computeNpcChoice(npcSurvivor, socialContext, trustSystem, playerId) {
  const profile = getNpcProfile(npcSurvivor);
  const trustValue = getTrustValue(trustSystem, playerId, npcSurvivor?.id);
  const trustBias = (trustValue - 50) / 50;
  const trustDelta = socialContext?.trustDeltaByNpcId?.[npcSurvivor?.id] ?? 0;
  const tags = socialContext?.tagsByNpcId?.[npcSurvivor?.id] || [];

  let riskProbability = socialContext?.groupRiskExpectation ?? 0.4;
  riskProbability += trustBias * 0.1;
  riskProbability += trustDelta * 0.03;

  if (tags.includes('merge_pact_attempt')) riskProbability += 0.04;
  if (tags.includes('seemed_open')) riskProbability += 0.03;
  if (tags.includes('was_vague')) riskProbability -= 0.06;
  if (tags.includes('seemed_shady')) riskProbability -= 0.05;
  if (tags.includes('advocated_caution')) riskProbability -= 0.05;

  if (profile.bold) riskProbability += 0.15;
  if (profile.cautious) riskProbability -= 0.15;
  if (profile.paranoid) riskProbability -= 0.12;
  if (profile.strategist) riskProbability += 0.05;
  if (profile.social && trustValue >= 55) riskProbability += 0.04;
  if (profile.social && trustValue <= 45) riskProbability -= 0.04;

  if (Number.isFinite(npcSurvivor?.paranoia)) {
    riskProbability -= ((npcSurvivor.paranoia - 50) / 100) * 0.12;
  }
  if (Number.isFinite(npcSurvivor?.loyalty)) {
    riskProbability += ((npcSurvivor.loyalty - 50) / 100) * 0.06;
  }

  riskProbability += (Math.random() - 0.5) * 0.1;
  riskProbability = clamp(riskProbability, 0.05, 0.95);

  return Math.random() < riskProbability ? 'risk' : 'protect';
}

function awardExtraVote(survivor, journey) {
  if (!survivor.advantages) {
    survivor.advantages = {};
  }
  if (!survivor.advantages.extraVote) {
    survivor.advantages.extraVote = { count: 0, expiresAtSurvivorsRemaining: 6 };
  }
  survivor.advantages.extraVote.count += 1;
  survivor.advantages.extraVote.expiresAtSurvivorsRemaining = 6;

  if (Array.isArray(survivor.extraVotes)) {
    survivor.extraVotes.push({
      type: 'JOURNEY_EXTRA_VOTE',
      createdDay: journey?.day,
      createdChallengeKey: journey?.challengeKey,
      expiresAtSurvivorsRemaining: 6,
      used: false
    });
  } else if (Number.isFinite(survivor.extraVotes)) {
    survivor.extraVotes += 1;
  } else {
    survivor.extraVotes = 1;
  }
}

const RiskProtectJourneyEvent = {
  async run(container, options = {}) {
    const { gameManager, journey, player } = options;
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
    let currentBackground = null;
    const participantIds = Array.from(new Set(journey?.participants || [])).filter(Boolean);
    const resolvedParticipantIds = participantIds.length ? participantIds : (player?.id ? [player.id] : []);
    const otherParticipants = resolvedParticipantIds.filter(id => id !== player?.id);
    const npcSurvivors = otherParticipants.map(id => findSurvivor(gameManager, id)).filter(Boolean);

    const setBackground = (background) => {
      if (background && background !== currentBackground) {
        ui.setSceneBackground(background);
        currentBackground = background;
      }
    };

    const awaitBeat = async ({ background, title, textLines, html }) => {
      if (background) {
        setBackground(background);
      }
      return new Promise(resolve => {
        ui.renderParchTopBeat({
          title,
          textLines,
          html,
          onAdvance: () => resolve()
        });
      });
    };

    try {
      await new Promise(resolve => {
        ui.renderSceneFirst({
          backgroundSrc: 'Assets/Journey/arrival.png',
          onAdvance: () => resolve()
        });
      });

      await awaitBeat({
        background: 'Assets/Journey/arrival.png',
        textLines: [
          'Survivors… this is where the journey begins.',
          'You’ll travel away from camp and face a private decision that could change the game.'
        ]
      });

      await awaitBeat({
        background: 'Assets/Journey/arrival.png',
        textLines: [
          'You’ll have a brief moment to talk, and then you’ll choose to protect your vote… or risk it for an advantage.'
        ]
      });

      const arrivalList = createElement('div', {
        dataset: { journeyPanel: 'centered' },
        style: 'display:flex; flex-direction:column; gap:12px; width:100%; max-width:100%; padding:clamp(6px, 1.5vw, 14px); box-sizing:border-box;'
      });

      resolvedParticipantIds.forEach(id => {
        const survivor = findSurvivor(gameManager, id);
        if (!survivor) return;
        const tribe = findTribeForSurvivor(gameManager, id);
        const tribeName = tribe?.tribeName || tribe?.name || 'Tribe';
        const tribeColor = resolveTribeColor(tribe);
        const row = createElement('div', {
          style: `display:flex; align-items:center; gap:12px; width:100%; box-sizing:border-box; padding:8px 12px; background:rgba(231,214,182,0.75); border-radius:12px; border:1px solid rgba(94,63,32,0.35); box-shadow:0 3px 10px rgba(0,0,0,0.18);`
        });
        const avatar = createElement('img', {
          src: getSurvivorAvatarSrc(survivor),
          style: `width:50px; height:50px; border-radius:50%; object-fit:cover; border:4px solid ${tribeColor};`
        });
        const name = createElement('div', {
          style: 'flex:1; min-width:0; text-align:left; font-weight:bold; font-size:clamp(0.9rem, 2.4vw, 1.02rem); color:#fff; text-shadow:0 2px 4px rgba(0,0,0,0.65); white-space:normal; word-break:break-word;'
        }, survivor?.firstName || survivor?.name || 'Unknown');
        const tribeLabel = createElement('div', {
          style: `flex:0 1 40%; min-width:0; margin-left:auto; text-align:right; font-weight:700; font-size:clamp(0.75rem, 2.2vw, 0.9rem); color:${tribeColor}; text-shadow:0 2px 4px rgba(0,0,0,0.65); text-transform:uppercase; letter-spacing:0.5px; white-space:normal; word-break:break-word;`
        }, tribeName);
        row.append(avatar, name, tribeLabel);
        arrivalList.appendChild(row);
      });

      await awaitBeat({
        background: 'Assets/Journey/arrival.png',
        title: 'On the Journey',
        html: arrivalList
      });

      await awaitBeat({
        background: 'Assets/Journey/trail.png',
        textLines: ['You’re given a short walk together. It’s the only time you can speak freely.']
      });

      const playerApproach = await new Promise(resolve => {
        setBackground('Assets/Journey/trail.png');
        ui.renderParchTopBeat({
          title: 'How do you handle the brief conversation?',
          textLines: ['Choose your approach wisely.'],
          buttons: [
            { label: 'Talk about how dangerous this twist is.', onClick: () => resolve('danger') },
            { label: 'Float the idea of protecting each other at the merge.', onClick: () => resolve('mergeSoft') },
            { label: 'Stay vague and noncommittal.', onClick: () => resolve('vague') }
          ]
        });
        ui.parchTopButtons.querySelectorAll('button').forEach(button => {
          button.style.fontSize = 'clamp(14px, 2.2vw, 22px)';
        });
      });

      const socialContext = buildSocialContext({
        playerApproach,
        npcSurvivors,
        trustSystem: gameManager.systems?.trustSystem,
        playerId: player?.id,
        journey
      });

      for (const npc of npcSurvivors) {
        setBackground('Assets/Journey/trail.png');
        const tribeColor = getSurvivorTribeColor(gameManager, npc?.id);
        const npcHeader = createElement('div', {
          style: 'display:flex; align-items:center; gap:10px; justify-content:center; margin-bottom:8px;'
        });
        const npcAvatar = createElement('img', {
          src: getSurvivorAvatarSrc(npc),
          style: `width:46px; height:46px; border-radius:50%; object-fit:cover; border:3px solid ${tribeColor};`
        });
        const npcName = createElement('div', {
          style: 'font-weight:700; letter-spacing:0.5px; text-transform:uppercase;'
        }, getFirstName(npc?.firstName || npc?.name || 'Survivor'));
        npcHeader.append(npcAvatar, npcName);
        const npcDialogue = createElement('div', {
          style: 'display:flex; flex-direction:column; align-items:center;'
        });
        npcDialogue.append(
          npcHeader,
          createElement('div', { style: 'margin-top:2px;' }, generateNpcReactionLine(npc, playerApproach, socialContext))
        );
        await new Promise(resolve => {
          ui.renderParchTopBeat({
            html: npcDialogue,
            onAdvance: () => resolve()
          });
        });
      }

      journey.socialContext = socialContext;

      await awaitBeat({
        background: 'Assets/Journey/trail.png',
        textLines: ['The conversation ends and you move on, knowing the real choice is still ahead.']
      });

      const playerChoice = await new Promise(resolve => {
        setBackground('Assets/Journey/risk-protect.png');
        ui.renderBottomChoiceBar({
          leftButton: { label: 'PROTECT YOUR VOTE', onClick: () => resolve('protect') },
          rightButton: { label: 'RISK YOUR VOTE', onClick: () => resolve('risk') }
        });
      });

      await new Promise(resolve => {
        setBackground(playerChoice === 'risk' ? 'Assets/Journey/risk.png' : 'Assets/Journey/protect.png');
        ui.scheduleTimeout(resolve, 750);
      });

      await awaitBeat({
        background: playerChoice === 'risk' ? 'Assets/Journey/risk.png' : 'Assets/Journey/protect.png',
        textLines: [playerChoice === 'risk' ? 'You choose to risk your vote.' : 'You choose to protect your vote.']
      });

      const decisions = resolvedParticipantIds.map(id => {
        if (id === player?.id) {
          return { survivorId: id, choice: playerChoice };
        }
        const npc = findSurvivor(gameManager, id);
        const npcChoice = npc ? computeNpcChoice(npc, socialContext, gameManager.systems?.trustSystem, player?.id) : 'protect';
        return { survivorId: id, choice: npcChoice };
      });

      const allRisk = decisions.every(d => d.choice === 'risk');
      const allProtect = decisions.every(d => d.choice === 'protect');
      const mixed = !allRisk && !allProtect;

      decisions.forEach(decision => {
        const survivor = findSurvivor(gameManager, decision.survivorId);
        if (!survivor) return;

        if (allRisk) {
          survivor.hasVote = false;
          survivor.votePenalty = {
            type: 'LOST_VOTE_JOURNEY',
            pending: true,
            reason: 'Journey Risk/Protect',
            createdChallengeKey: journey?.challengeKey,
            createdDay: journey?.day
          };
        } else {
          survivor.hasVote = true;
          if (mixed && decision.choice === 'risk') {
            awardExtraVote(survivor, journey);
          }
        }
      });

      journey.results = decisions.map(decision => {
        const survivor = findSurvivor(gameManager, decision.survivorId);
        return {
          survivorId: decision.survivorId,
          choice: decision.choice,
          hasVoteAfter: survivor?.hasVote,
          extraVotesGained: mixed && decision.choice === 'risk' ? 1 : 0
        };
      });

      const resultsList = createElement('div', {
        dataset: { journeyPanel: 'centered' },
        style: 'display:flex; flex-direction:column; gap:12px; width:100%; max-width:100%; padding:clamp(6px, 1.5vw, 14px); box-sizing:border-box;'
      });

      decisions.forEach(decision => {
        const survivor = findSurvivor(gameManager, decision.survivorId);
        const tribeColor = getSurvivorTribeColor(gameManager, decision.survivorId);
        const row = createElement('div', {
          style: `display:flex; align-items:center; gap:14px; width:100%; box-sizing:border-box; padding:10px 12px; background:rgba(231,214,182,0.75); border-radius:12px; border:1px solid rgba(94,63,32,0.35); box-shadow:0 3px 10px rgba(0,0,0,0.18);`
        });
        const avatar = createElement('img', {
          src: getSurvivorAvatarSrc(survivor),
          style: `width:52px; height:52px; border-radius:50%; object-fit:cover; border:4px solid ${tribeColor};`
        });
        const name = createElement('div', {
          style: 'flex:1; min-width:0; text-align:left; font-weight:bold; font-size:clamp(0.9rem, 2.4vw, 1.02rem); color:#fff; text-shadow:0 2px 4px rgba(0,0,0,0.65); white-space:normal; word-break:break-word;'
        }, survivor?.firstName || survivor?.name || 'Unknown');
        const outcome = createElement('div', {
          style: 'flex:0 1 40%; min-width:0; text-align:right; font-weight:bold; color:#fff; display:flex; flex-direction:column; align-items:flex-end; gap:2px;'
        });
        const choiceColor = decision.choice === 'risk' ? '#e14b3b' : '#46b96a';
        const choice = createElement('div', { style: `font-size:0.95rem; letter-spacing:0.5px; color:${choiceColor};` }, decision.choice.toUpperCase());
        let detailText = 'VOTE PROTECTED';
        if (allRisk) {
          detailText = 'LOST VOTE';
        } else if (mixed && decision.choice === 'risk') {
          detailText = 'EXTRA VOTE EARNED';
        }
        const detail = createElement('div', { style: 'font-size:0.8rem; font-weight:600; color:#fff; text-shadow:0 2px 4px rgba(0,0,0,0.65);' }, detailText);
        outcome.append(choice, detail);
        row.append(avatar, name, outcome);
        resultsList.appendChild(row);
      });

      await awaitBeat({
        background: 'Assets/Journey/arrival.png',
        title: 'Journey Results',
        html: resultsList
      });

      if (gameManager) {
        gameManager.gamePhase = GamePhase.POST_CHALLENGE;
        eventManager.publish(GameEvents.GAME_PHASE_CHANGED, {
          phase: GamePhase.POST_CHALLENGE,
          day: gameManager.getDay?.() ?? gameManager.day
        });
        const dayValue = gameManager.getDay?.() ?? gameManager.day;
        window.debugBanner?.(
          'RETURN-TO-CAMP',
          `Day ${dayValue} | Phase ${gameManager.gamePhase} | Timer ${gameManager.dayTimer}`
        );
        console.log(
          `RETURN-TO-CAMP: Day ${dayValue} | Phase ${gameManager.gamePhase} | Timer ${gameManager.dayTimer}`
        );
      }

      return {
        results: journey.results,
        playerChoice
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

export default RiskProtectJourneyEvent;
