import { createElement, clearChildren } from '../utils/DOMUtils.js';
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
  pushValue(npc?.archetype);
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

  const baseExpectation = playerApproach === 'mergeSoft' ? 0.55 : playerApproach === 'danger' ? 0.25 : 0.35;
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
    const { gameManager, journey, player, relationshipSystem } = options;
    if (container) {
      clearChildren(container);
      container.style.position = 'relative';
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

    const wheelImage = createElement('img', {
      style: `position:absolute; left:50%; top:50%; transform:translate(-50%, -50%); width:min(360px, 70vw); height:auto; z-index:2000; display:none; opacity:0; transition:opacity 200ms ease; pointer-events:none;`
    });
    container.appendChild(wheelImage);

    const waitForTransition = (element) => new Promise(resolve => {
      if (!element) {
        resolve();
        return;
      }
      const duration = window.getComputedStyle(element).transitionDuration || '0s';
      const maxDuration = duration
        .split(',')
        .map(value => parseFloat(value) || 0)
        .reduce((max, value) => Math.max(max, value), 0);
      if (!maxDuration) {
        resolve();
        return;
      }
      const handleTransition = (event) => {
        if (event.target !== element || event.propertyName !== 'opacity') return;
        element.removeEventListener('transitionend', handleTransition);
        resolve();
      };
      element.addEventListener('transitionend', handleTransition, { once: true });
    });

    const showWheel = async (src) => {
      if (src) {
        wheelImage.src = src;
      }
      wheelImage.style.display = 'block';
      wheelImage.style.opacity = '0';
      requestAnimationFrame(() => {
        wheelImage.style.opacity = '1';
      });
      await waitForTransition(wheelImage);
    };

    const hideWheel = async () => {
      wheelImage.style.opacity = '0';
      await waitForTransition(wheelImage);
      wheelImage.style.display = 'none';
    };

    const transitionBackground = async (background) => {
      if (background && background !== currentBackground) {
        await ui.transitionBackground(background);
        currentBackground = background;
      }
    };

    const awaitJeffBeat = async (lines) => new Promise(resolve => {
      transitionBackground('Assets/jeff-screen.png').then(async () => {
        await hideWheel();
        ui.renderJeffBeat({ textLines: lines, onContinue: () => resolve() });
      });
    });

    const awaitBeat = async ({ background, title, textLines, html }) => {
      if (background) {
        await transitionBackground(background);
      }
      await hideWheel();
      return new Promise(resolve => {
        ui.setFrame('beat-ui1');
        ui.renderBeat({
          title,
          textLines,
          html,
          buttons: [{ label: 'Continue', onClick: () => resolve() }]
        });
      });
    };

    try {
      await awaitJeffBeat([
        'Survivors… this is where the journey begins.',
        'You’ll travel away from camp and face a private decision that could change the game.'
      ]);

      await awaitJeffBeat([
        'You’ll have a brief moment to talk, and then you’ll choose to protect your vote… or risk it for an advantage.'
      ]);

      const arrivalList = createElement('div', {
        style: 'display:flex; flex-direction:column; gap:10px; width:100%;'
      });

      resolvedParticipantIds.forEach(id => {
        const survivor = findSurvivor(gameManager, id);
        if (!survivor) return;
        const tribe = findTribeForSurvivor(gameManager, id);
        const tribeName = tribe?.tribeName || tribe?.name || 'Tribe';
        const tribeColor = tribe?.tribeColor || tribe?.color || '#8d6b3f';
        const row = createElement('div', {
          style: `display:flex; align-items:center; gap:12px; padding:8px 10px; background:rgba(231,214,182,0.75); border-radius:12px; border:1px solid rgba(94,63,32,0.35); box-shadow:0 3px 10px rgba(0,0,0,0.18);`
        });
        const avatar = createElement('img', {
          src: getSurvivorAvatarSrc(survivor),
          style: 'width:50px; height:50px; border-radius:50%; object-fit:cover; border:3px solid #7a4a1e;'
        });
        const name = createElement('div', {
          style: 'font-weight:bold; font-size:clamp(0.95rem, 2.6vw, 1.05rem); color:#2b1b0f;'
        }, survivor?.firstName || survivor?.name || 'Unknown');
        const tribeLabel = createElement('div', {
          style: `margin-left:auto; font-weight:700; font-size:clamp(0.8rem, 2.4vw, 0.95rem); color:${tribeColor}; text-transform:uppercase; letter-spacing:0.5px;`
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
        background: 'Assets/Journey/boat.png',
        textLines: ['Grab your things. Your journey starts now.']
      });

      ui.hideOverlay();

      await new Promise(resolve => {
        const button = createElement('button', {
          className: 'rect-button',
          style: 'position:absolute; bottom:40px; left:50%; transform:translateX(-50%); z-index:3000;'
        }, 'Continue');
        button.addEventListener('click', () => {
          button.remove();
          resolve();
        }, { once: true });
        container.appendChild(button);
      });


      await awaitBeat({
        background: 'Assets/Journey/trail.png',
        textLines: ['You’re given a short walk together. It’s the only time you can speak freely.']
      });

      const playerApproach = await new Promise(resolve => {
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
        await new Promise(resolve => {
          ui.renderAvatarBeat({
            speakerSurvivor: npc,
            textLines: [generateNpcReactionLine(npc, playerApproach, socialContext)],
            buttons: [{ label: 'Continue', onClick: () => resolve() }]
          });
        });
      }

      journey.socialContext = socialContext;

      if ('Assets/Journey/arrival.png' !== currentBackground) {
        await transitionBackground('Assets/Journey/arrival.png');
        currentBackground = 'Assets/Journey/arrival.png';
      }
      ui.hideOverlay();
      await showWheel('Assets/Journey/risk-protect.png');

      const playerChoice = await new Promise(resolve => {
        ui.setFrame('beat-ui1');
        ui.renderBeat({
          textLines: [
            'Now you’ll make your choices in private.',
            'Protect your vote… or risk it?'
          ],
          buttons: [
            { label: 'Protect your vote', onClick: () => resolve('protect') },
            { label: 'Risk your vote', onClick: () => resolve('risk') }
          ]
        });
      });

      ui.hideOverlay();
      await showWheel('Assets/Journey/risk-protect.png');
      await showWheel(playerChoice === 'risk' ? 'Assets/Journey/risk.png' : 'Assets/Journey/protect.png');

      const decisions = resolvedParticipantIds.map(id => {
        if (id === player?.id) {
          return { survivorId: id, choice: playerChoice };
        }
        const npc = findSurvivor(gameManager, id);
        const npcChoice = npc ? computeNpcChoice(npc, socialContext, relationshipSystem, player?.id) : 'protect';
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

      await hideWheel();

      const resultsList = createElement('div', {
        style: 'display:flex; flex-direction:column; gap:10px; width:100%;'
      });

      decisions.forEach(decision => {
        const survivor = findSurvivor(gameManager, decision.survivorId);
        const row = createElement('div', {
          style: `display:flex; align-items:center; gap:14px; padding:10px 12px; background:rgba(231,214,182,0.75); border-radius:12px; border:1px solid rgba(94,63,32,0.35); box-shadow:0 3px 10px rgba(0,0,0,0.18);`
        });
        const avatar = createElement('img', {
          src: getSurvivorAvatarSrc(survivor),
          style: 'width:52px; height:52px; border-radius:50%; object-fit:cover; border:3px solid #7a4a1e;'
        });
        const name = createElement('div', {
          style: 'flex:1; text-align:left; font-weight:bold; font-size:clamp(0.95rem, 2.6vw, 1.05rem); color:#2b1b0f;'
        }, survivor?.firstName || survivor?.name || 'Unknown');
        const outcome = createElement('div', {
          style: 'text-align:right; min-width:150px; font-weight:bold; color:#5a2d12;'
        });
        const choice = createElement('div', { style: 'font-size:0.95rem; letter-spacing:0.5px;' }, decision.choice.toUpperCase());
        let detailText = 'VOTE PROTECTED';
        if (allRisk) {
          detailText = 'LOST VOTE';
        } else if (mixed && decision.choice === 'risk') {
          detailText = 'EXTRA VOTE EARNED';
        }
        const detail = createElement('div', { style: 'font-size:0.8rem; font-weight:600; color:#3c2a1a;' }, detailText);
        outcome.append(choice, detail);
        row.append(avatar, name, outcome);
        resultsList.appendChild(row);
      });

      await awaitBeat({
        background: 'Assets/Journey/arrival.png',
        title: 'Journey Results',
        html: resultsList
      });

      wheelImage.remove();

      return {
        results: journey.results,
        playerChoice
      };
    } finally {
      if (wheelImage && wheelImage.isConnected) {
        wheelImage.remove();
      }
      if (this.ui) {
        this.ui.destroy();
        this.ui = null;
      }
    }
  }
};

export default RiskProtectJourneyEvent;
