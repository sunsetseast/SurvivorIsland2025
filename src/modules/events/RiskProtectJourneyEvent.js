import { createElement } from '../utils/DOMUtils.js';
import JourneyBeatUI, { getSurvivorAvatarSrc } from './JourneyBeatUI.js';

function findSurvivor(gameManager, id) {
  const pool = gameManager?.survivors || [];
  return pool.find(s => s.id === id) || null;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getRelationshipValue(relationshipSystem, playerId, npcId) {
  if (!playerId || !npcId) return 50;
  if (typeof relationshipSystem?.getRelationshipValue === 'function') {
    return relationshipSystem.getRelationshipValue(playerId, npcId) ?? 50;
  }
  const rel = relationshipSystem?.getRelationship?.(playerId, npcId);
  if (rel && typeof rel.value === 'number') return rel.value;
  if (rel && typeof rel.score === 'number') return rel.score;
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
  pushValue(npc?.personality);
  pushValue(npc?.traits?.mental);
  pushValue(npc?.traits?.social);
  pushValue(npc?.strategy);

  return descriptors;
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

function buildSocialContext({ playerApproach, npcSurvivors, relationshipSystem, playerId, journey }) {
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

  const baseExpectation = playerApproach === 'mergeSoft' ? 0.6 : playerApproach === 'danger' ? 0.25 : 0.3;
  const avgTrust = npcSurvivors.length
    ? npcSurvivors.reduce((sum, npc) => sum + getRelationshipValue(relationshipSystem, playerId, npc.id), 0) / npcSurvivors.length
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

function computeNpcChoice(npcSurvivor, socialContext, relationshipSystem, playerId) {
  const profile = getNpcProfile(npcSurvivor);
  const trustValue = getRelationshipValue(relationshipSystem, playerId, npcSurvivor?.id);
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

  riskProbability += (Math.random() - 0.5) * 0.08;
  riskProbability = clamp(riskProbability, 0.05, 0.95);

  return Math.random() < riskProbability ? 'risk' : 'protect';
}

function awardExtraVote(survivor, journey) {
  const legacyCount = Array.isArray(survivor.extraVotes)
    ? survivor.extraVotes.length
    : (Number.isFinite(survivor.extraVotes) ? survivor.extraVotes : 0);

  if (!Array.isArray(survivor.extraVotes)) {
    survivor.extraVotes = [];
    for (let i = 0; i < legacyCount; i += 1) {
      survivor.extraVotes.push({
        type: 'LEGACY_EXTRA_VOTE',
        createdDay: journey?.day,
        createdChallengeKey: journey?.challengeKey,
        expiresAtSurvivorsRemaining: 6,
        used: false,
        legacy: true
      });
    }
  }

  survivor.extraVotes.push({
    type: 'JOURNEY_EXTRA_VOTE',
    createdDay: journey?.day,
    createdChallengeKey: journey?.challengeKey,
    expiresAtSurvivorsRemaining: 6,
    used: false
  });

  survivor.extraVoteCount = (survivor.extraVoteCount || 0) + 1;
}

const RiskProtectJourneyEvent = {
  async run(container, options = {}) {
    const { gameManager, journey, player, relationshipSystem } = options;
    const ui = new JourneyBeatUI(container);

    const participantIds = Array.from(new Set(journey?.participants || [])).filter(Boolean);
    const otherParticipants = participantIds.filter(id => id !== player?.id);
    const npcSurvivors = otherParticipants.map(id => findSurvivor(gameManager, id)).filter(Boolean);

    const awaitContinue = async (lines, { background, frame, title } = {}) => new Promise(resolve => {
      if (background !== undefined) {
        ui.setBackground(background);
      }
      if (frame) {
        ui.setFrame(frame);
      } else {
        ui.setFrame('beat-ui1');
      }
      ui.renderBeat({
        title,
        textLines: lines,
        buttons: [{ label: 'Continue', onClick: resolve }]
      });
    });

    await awaitContinue([
      'Welcome to the journey.',
      'You’ve been brought here because every choice in this game has consequences — and today, that choice belongs to you.'
    ], { background: 'Assets/Journey/arrival.png' });

    await awaitContinue([
      'You’ll each decide whether to protect your vote… or risk it for a potential advantage.',
      'You’ll make that decision privately. No discussion when it’s time.'
    ], { background: 'Assets/Journey/arrival.png' });

    await awaitContinue([
      'Before you decide, you’re given time to talk. This is the only moment you’ll have together.'
    ], { background: 'Assets/Journey/trail.png' });

    const playerApproach = await new Promise(resolve => {
      ui.setBackground('Assets/Journey/trail.png');
      ui.setFrame('beat-ui1');
      ui.renderBeat({
        title: 'How do you handle the brief conversation?',
        textLines: ['Choose your approach wisely.'],
        buttons: [
          { label: 'Talk about how dangerous this twist is.', onClick: () => resolve('danger') },
          { label: 'Float the idea of protecting each other at the merge.', onClick: () => resolve('mergeSoft') },
          { label: 'Stay vague and noncommittal.', onClick: () => resolve('vague') }
        ]
      });
    });

    const socialContext = buildSocialContext({
      playerApproach,
      npcSurvivors,
      relationshipSystem,
      playerId: player?.id,
      journey
    });

    for (const npc of npcSurvivors) {
      ui.setBackground('Assets/Journey/trail.png');
      await new Promise(resolve => {
        ui.renderAvatarBeat({
          speakerSurvivor: npc,
          textLines: [generateNpcReactionLine(npc, playerApproach, socialContext)],
          buttons: [{ label: 'Continue', onClick: resolve }]
        });
      });
    }

    const summaryLines = playerApproach === 'danger'
      ? [
        'The conversation turns cautious. Hesitation rises about risking votes, and most keep their guard up.'
      ]
      : playerApproach === 'mergeSoft'
        ? [
          'A quiet pact feels possible. Cooperation increases, but trust varies from person to person.'
        ]
        : [
          'Nobody reveals anything. Trust feels thin, and a little paranoia hangs in the air.'
        ];

    await awaitContinue(summaryLines, { background: 'Assets/Journey/trail.png' });

    journey.socialContext = socialContext;

    const playerChoice = await new Promise(resolve => {
      ui.setBackground('Assets/Journey/risk-protect.png');
      ui.setFrame('beat-ui1');
      ui.renderBeat({
        textLines: [
          'Privately, you face the decision: protect your vote… or risk it?'
        ],
        buttons: [
          { label: 'Protect your vote', onClick: () => resolve('protect') },
          { label: 'Risk your vote', onClick: () => resolve('risk') }
        ]
      });
    });

    await awaitContinue([
      playerChoice === 'protect'
        ? 'You keep your vote safe for the next Tribal Council.'
        : 'You decide to gamble for the advantage.'
    ], { background: playerChoice === 'protect' ? 'Assets/Journey/protect.png' : 'Assets/Journey/risk.png' });

    const decisions = [];
    participantIds.forEach(id => {
      if (id === player?.id) {
        decisions.push({ survivorId: id, choice: playerChoice });
      } else {
        const npc = findSurvivor(gameManager, id);
        const npcChoice = computeNpcChoice(npc, socialContext, relationshipSystem, player?.id);
        decisions.push({ survivorId: id, choice: npcChoice });
      }
    });

    const allRisk = decisions.every(d => d.choice === 'risk');

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
        if (decision.choice === 'risk') {
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
        extraVotesGained: !allRisk && decision.choice === 'risk' ? 1 : 0
      };
    });

    ui.setBackground('Assets/Journey/arrival.png');
    ui.setFrame('beat-ui1');

    const resultsList = createElement('div', {
      style: 'display:flex; flex-direction:column; gap:12px; width:100%;'
    });

    decisions.forEach(decision => {
      const survivor = findSurvivor(gameManager, decision.survivorId);
      const row = createElement('div', {
        style: `display:flex; align-items:center; gap:14px; padding:10px 14px; background:rgba(231,214,182,0.75); border-radius:12px; border:1px solid rgba(94,63,32,0.35); box-shadow:0 3px 10px rgba(0,0,0,0.18);`
      });
      const avatar = createElement('img', {
        src: getSurvivorAvatarSrc(survivor),
        style: 'width:54px; height:54px; border-radius:50%; object-fit:cover; border:3px solid #7a4a1e;'
      });
      const name = createElement('div', {
        style: 'flex:1; text-align:left; font-weight:bold; font-size:1.05rem; color:#2b1b0f;'
      }, survivor?.name || survivor?.firstName || 'Unknown');
      const outcome = createElement('div', {
        style: 'text-align:right; min-width:160px; font-weight:bold; color:#5a2d12;'
      });
      const choice = createElement('div', { style: 'font-size:1rem; letter-spacing:0.5px;' }, decision.choice.toUpperCase());
      const detailText = allRisk
        ? 'LOST VOTE'
        : decision.choice === 'risk'
          ? '+1 Extra Vote (until Final 6)'
          : 'Vote protected';
      const detail = createElement('div', { style: 'font-size:0.85rem; font-weight:600; color:#3c2a1a;' }, detailText);
      outcome.append(choice, detail);
      row.append(avatar, name, outcome);
      resultsList.appendChild(row);
    });

    await new Promise(resolve => {
      ui.renderBeat({
        title: 'Journey Results',
        html: resultsList,
        buttons: [{ label: 'Continue', onClick: resolve }]
      });
    });

    ui.destroy();

    return {
      results: journey.results,
      playerChoice
    };
  }
};

export default RiskProtectJourneyEvent;
