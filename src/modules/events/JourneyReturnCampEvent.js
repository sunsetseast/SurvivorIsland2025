import eventManager, { GameEvents } from '../core/EventManager.js';

function clamp(value, min = 0, max = 100) {
  const n = Number.isFinite(value) ? value : min;
  return Math.max(min, Math.min(max, n));
}

function firstName(survivor) {
  return survivor?.firstName || survivor?.name || 'Someone';
}

function getAvatar(survivor) {
  return survivor?.avatarUrl || survivor?.avatar || survivor?.portrait || survivor?.image || 'Assets/logo.png';
}

function hasDescriptor(survivor, keywords = []) {
  const bucket = [];
  const push = (value) => {
    if (!value) return;
    if (Array.isArray(value)) value.forEach(v => bucket.push(String(v).toLowerCase()));
    else bucket.push(String(value).toLowerCase());
  };
  push(survivor?.personalityTraits);
  push(survivor?.gameplayStyle);
  push(survivor?.archetype);
  push(survivor?.personality);
  return keywords.some(keyword => bucket.some(v => v.includes(keyword)));
}

function getPlayer(gameManager) {
  return gameManager?.getPlayerSurvivor?.() || gameManager?.getPlayer?.() || gameManager?.player || null;
}

function findSurvivor(gameManager, id) {
  return (gameManager?.survivors || []).find(s => s.id === id) || null;
}

function ensureAbsentSet(gameManager) {
  gameManager.flags = gameManager.flags || {};
  if (!(gameManager.flags.absentFromCampIds instanceof Set)) {
    gameManager.flags.absentFromCampIds = new Set(gameManager.flags.absentFromCampIds || []);
  }
  return gameManager.flags.absentFromCampIds;
}

function pushSummaryFact(strategyPhaseSystem, fact) {
  if (!strategyPhaseSystem || !fact) return;
  try {
    if (typeof strategyPhaseSystem.addSummaryFact === 'function') return strategyPhaseSystem.addSummaryFact(fact);
    if (typeof strategyPhaseSystem.addFact === 'function') return strategyPhaseSystem.addFact(fact);
    if (typeof strategyPhaseSystem.recordSummaryFact === 'function') return strategyPhaseSystem.recordSummaryFact(fact);
    if (Array.isArray(strategyPhaseSystem.summaryFacts)) {
      strategyPhaseSystem.summaryFacts.push(fact);
      return;
    }
    if (Array.isArray(strategyPhaseSystem.playerVisibleFacts)) {
      strategyPhaseSystem.playerVisibleFacts.push({ ...fact, timestamp: fact.timestamp || Date.now() });
      return;
    }
    const gm = strategyPhaseSystem.gameManager || strategyPhaseSystem.gm || null;
    if (gm) {
      gm.flags = gm.flags || {};
      gm.flags.summaryFacts = gm.flags.summaryFacts || [];
      gm.flags.summaryFacts.push(fact);
    }
  } catch (_) {}
}

function campLog(gameManager, message, payload = {}) {
  gameManager.campLog = gameManager.campLog || [];
  gameManager.campLog.push({
    type: 'journey_return_camp_event',
    day: gameManager.getCurrentDay?.() ?? gameManager.day,
    timestamp: Date.now(),
    message,
    ...payload,
  });
}

function pickUnique(items = [], count = 1) {
  const pool = [...items];
  const picked = [];
  while (pool.length && picked.length < count) {
    const idx = Math.floor(Math.random() * pool.length);
    picked.push(pool.splice(idx, 1)[0]);
  }
  return picked;
}

function buildOverlay() {
  const overlay = document.createElement('div');
  overlay.style.position = 'fixed';
  overlay.style.inset = '0';
  overlay.style.background = 'rgba(0,0,0,0.78)';
  overlay.style.zIndex = '5200';
  overlay.style.display = 'flex';
  overlay.style.alignItems = 'center';
  overlay.style.justifyContent = 'center';

  const card = document.createElement('div');
  card.style.width = 'min(92vw, 560px)';
  card.style.minHeight = '360px';
  card.style.background = 'linear-gradient(180deg, #f0debf 0%, #dfc89f 100%)';
  card.style.border = '4px solid #5b3c1f';
  card.style.borderRadius = '14px';
  card.style.padding = '18px';
  card.style.display = 'flex';
  card.style.flexDirection = 'column';
  card.style.gap = '12px';
  card.style.boxShadow = '0 16px 40px rgba(0,0,0,0.45)';

  const header = document.createElement('div');
  header.style.display = 'flex';
  header.style.alignItems = 'center';
  header.style.gap = '10px';

  const avatar = document.createElement('img');
  avatar.style.width = '66px';
  avatar.style.height = '66px';
  avatar.style.borderRadius = '50%';
  avatar.style.objectFit = 'cover';
  avatar.style.border = '3px solid #4e3218';
  avatar.style.display = 'none';

  const speaker = document.createElement('div');
  speaker.style.fontFamily = "'Survivant', sans-serif";
  speaker.style.fontSize = '1.15rem';
  speaker.style.fontWeight = '700';

  const quote = document.createElement('div');
  quote.style.flex = '1';
  quote.style.fontSize = '1rem';
  quote.style.lineHeight = '1.5';
  quote.style.color = '#2b1a0f';

  const choices = document.createElement('div');
  choices.style.display = 'none';
  choices.style.flexDirection = 'column';
  choices.style.gap = '8px';

  const nextBtn = document.createElement('button');
  nextBtn.textContent = 'Next';
  nextBtn.style.alignSelf = 'flex-end';
  nextBtn.className = 'rect-button';

  header.append(avatar, speaker);
  card.append(header, quote, choices, nextBtn);
  overlay.appendChild(card);
  document.body.appendChild(overlay);

  return { overlay, avatar, speaker, quote, choices, nextBtn };
}

function renderChoiceButtons(container, options = [], onPick) {
  container.innerHTML = '';
  container.style.display = 'flex';
  options.forEach((option) => {
    const btn = document.createElement('button');
    btn.className = 'rect-button';
    btn.textContent = option.label;
    btn.addEventListener('click', () => onPick(option.value));
    container.appendChild(btn);
  });
}

async function runBeats(gameManager, beats) {
  return new Promise((resolve) => {
    const ui = buildOverlay();
    let index = 0;

    const showBeat = () => {
      const beat = beats[index];
      if (!beat) {
        ui.overlay.remove();
        resolve();
        return;
      }

      if (beat.speaker) {
        ui.avatar.style.display = 'block';
        ui.avatar.src = getAvatar(beat.speaker);
        ui.speaker.textContent = firstName(beat.speaker);
      } else {
        ui.avatar.style.display = 'none';
        ui.speaker.textContent = beat.title || 'Camp';
      }
      ui.quote.textContent = beat.text || '';

      if (beat.choices?.length) {
        ui.nextBtn.style.display = 'none';
        renderChoiceButtons(ui.choices, beat.choices, (value) => {
          beat.onChoice?.(value);
          index += 1;
          showBeat();
        });
      } else {
        ui.choices.style.display = 'none';
        ui.nextBtn.style.display = 'inline-flex';
      }
    };

    ui.nextBtn.addEventListener('click', () => {
      index += 1;
      showBeat();
    });

    showBeat();
  });
}

function resolveEligibleNpcs(gameManager, journeyerId, includePlayer = false) {
  const tribe = gameManager.getPlayerTribe?.();
  const player = getPlayer(gameManager);
  const playerId = player?.id || gameManager.playerId;
  const members = tribe?.members || [];
  return members.filter(member => {
    if (!member || member.id === journeyerId) return false;
    if (!includePlayer && member.id === playerId) return false;
    return true;
  });
}

function computeConsensus(eligibleNpcs = [], playerStance = 'neutral') {
  let npcLeanScore = 0;
  eligibleNpcs.forEach((npc) => {
    if (hasDescriptor(npc, ['paranoid', 'schemer', 'cautious', 'strategist', 'strategic'])) npcLeanScore += 1;
    if (hasDescriptor(npc, ['loyal', 'social', 'optimistic', 'calming'])) npcLeanScore -= 1;
  });
  npcLeanScore = clamp(npcLeanScore, -2, 2);
  const stanceMod = playerStance === 'stoke' ? 1 : playerStance === 'defend' ? -1 : 0;
  const finalScore = npcLeanScore + stanceMod;
  const consensus = finalScore >= 1 ? 'suspicious' : 'supportive';
  return { consensus, finalScore, npcLeanScore };
}

const suspiciousLines = [
  'Journeys are never “just a walk.” If {journeyerName} comes back with power, we need to know.',
  'The timing is weird. Why pull ONE person? That’s advantage energy.',
  'If they risked something, that means there’s a reward. I’m not ignoring that.',
  'This is how extra votes sneak into the game — quietly.',
  'I’m not saying {journeyerName} is shady… but I’m not pretending this is nothing.',
  'If they come back acting weird, that’s our answer.',
  'Someone leaves, comes back with leverage, and suddenly everyone’s in trouble.',
  'Journeys create targets. Whether they want it or not.'
];

const supportiveLines = [
  'They might lose their vote. Everyone jumping to paranoia is how you hand someone a target.',
  'We don’t know what happened. Let’s not punish {journeyerName} for leaving.',
  'Whatever it is, we’ll hear the story. I’m not panicking yet.',
  'If it’s anything, we should figure out how to use it… not explode over it.',
  'I don’t love the unknown, but I’m not doing the witch-hunt thing.',
  'It’s Survivor — twists happen. Doesn’t mean {journeyerName} asked for it.',
  'Let’s save the paranoia until there’s a reason.',
  'If they look stressed, that might mean it went badly. Give them a second.'
];

const believingLines = [
  'I mean… that tracks. Journeys are messy. I’m not freaking out.',
  'If you kept your vote, fine. Let’s just move forward.',
  'I appreciate you saying it straight. Secrets make people spiral.',
  'Okay. Not my favorite twist, but I get it.',
  'It sounds like you didn’t ask for this. I’m not blaming you.',
  'Let’s just play the day we have.'
];

const doubtingLines = [
  'You’re skipping details. That’s what makes me nervous.',
  'So you’re saying nothing happened? On Survivor? Come on.',
  'I’m not accusing you… but I’m not buying it either.',
  'That explanation feels rehearsed.',
  'If it was harmless, why does it sound like you’re dodging?',
  'I’m hearing a story… not the whole truth.'
];

function resolveJourneyTruth(gameManager, journeyerId) {
  const result = gameManager?.journey?.results?.find(r => r.survivorId === journeyerId) || null;
  const didRisk = result?.choice === 'risk';
  const extraVote = Number(result?.extraVotesGained || 0) > 0;
  const hasVoteAfter = result?.hasVoteAfter;
  return { result, didRisk, extraVote, hasVoteAfter };
}

function getPart2Story(gameManager, journeyer, isPlayerJourneyer) {
  const truth = resolveJourneyTruth(gameManager, journeyer?.id);
  const lieRulesPool = [
    'I had a choice: risk my vote and do a puzzle for an advantage, or decline and keep my vote. I chose to keep my vote and didn’t play.',
    'It was basically a temptation — risk your vote for a shot at something. I didn’t go for it.',
    'It wasn’t a group rule thing. It was just me deciding whether to gamble my vote.',
    'It was a simple decision island: either take a chance for an advantage or keep it safe. That was it.'
  ];
  const truthRulesLine = 'It was Risk Your Vote or Protect Your Vote. If everyone risks, everyone loses their vote. If it’s mixed, the riskers can win an advantage.';

  const truthfulOutcome = !truth.didRisk
    ? 'I protected. I kept my vote.'
    : truth.extraVote
      ? 'I risked… and I earned an extra vote.'
      : 'I risked… and I lost my vote.';

  const lieOutcomes = [
    'I protected. Nothing came of it.',
    'I’m good — I kept my vote.',
    'I risked and I lost my vote.',
    'No advantage. No penalty. Just a scary decision.'
  ];

  let rulesTold = 'truth';
  let outcomeTold = 'truth';

  if (!isPlayerJourneyer) {
    const liarBias = hasDescriptor(journeyer, ['paranoid', 'strategist', 'schemer']) ? 0.65 : hasDescriptor(journeyer, ['social', 'loyal']) ? 0.3 : hasDescriptor(journeyer, ['bold', 'chaotic']) ? 0.45 : 0.5;
    rulesTold = Math.random() < liarBias ? 'lie' : 'truth';
    outcomeTold = Math.random() < liarBias ? 'lie' : 'truth';
  }

  const rulesLine = rulesTold === 'truth' ? truthRulesLine : pickUnique(lieRulesPool, 1)[0];
  const outcomeLine = outcomeTold === 'truth' ? truthfulOutcome : pickUnique(lieOutcomes, 1)[0];

  const lower = outcomeLine.toLowerCase();
  const claimed = {
    risked: lower.includes('risked') ? true : lower.includes('protected') ? false : null,
    protected: lower.includes('protected') ? true : null,
    extraVote: lower.includes('extra vote') ? true : null,
    lostVote: lower.includes('lost my vote') ? true : null,
  };

  return { rulesTold, outcomeTold, rulesLine, outcomeLine, claimed, truth };
}

function getTrust(gameManager, observerId, targetId) {
  const relSystem = gameManager?.systems?.relationshipSystem;
  if (typeof relSystem?.getTrust === 'function') return relSystem.getTrust(observerId, targetId) ?? 50;
  if (typeof relSystem?.getRelationship === 'function') return relSystem.getRelationship(observerId, targetId)?.value ?? 50;
  gameManager.flags = gameManager.flags || {};
  gameManager.flags.pairTrustMap = gameManager.flags.pairTrustMap || new Map();
  return gameManager.flags.pairTrustMap.get(`${observerId}__${targetId}`) ?? 50;
}

function adjustTrust(gameManager, observerId, targetId, delta) {
  const relSystem = gameManager?.systems?.relationshipSystem;
  if (typeof relSystem?.adjustTrust === 'function') return relSystem.adjustTrust(observerId, targetId, delta);
  if (typeof relSystem?.getTrust === 'function' && typeof relSystem?.setTrust === 'function') {
    const next = clamp((relSystem.getTrust(observerId, targetId) ?? 50) + delta, 0, 100);
    return relSystem.setTrust(observerId, targetId, next);
  }
  gameManager.flags = gameManager.flags || {};
  gameManager.flags.pairTrustMap = gameManager.flags.pairTrustMap || new Map();
  const key = `${observerId}__${targetId}`;
  const next = clamp((gameManager.flags.pairTrustMap.get(key) ?? 50) + delta, 0, 100);
  gameManager.flags.pairTrustMap.set(key, next);
  return next;
}

function adjustIdolSuspicion(gameManager, observerId, targetId, delta) {
  const idolSystem = gameManager?.systems?.idolSystem;
  if (typeof idolSystem?.adjustIdolSuspicion === 'function') return idolSystem.adjustIdolSuspicion(observerId, targetId, delta);
  gameManager.flags = gameManager.flags || {};
  gameManager.flags.pairIdolSuspicionMap = gameManager.flags.pairIdolSuspicionMap || new Map();
  const key = `${observerId}__${targetId}`;
  const next = clamp((gameManager.flags.pairIdolSuspicionMap.get(key) ?? 50) + delta, 0, 100);
  gameManager.flags.pairIdolSuspicionMap.set(key, next);
  return next;
}

async function runPart1Core({ gameManager, strategyPhaseSystem, journeyerId, showOverlay = true, playerCanChoose = true }) {
  const journeyer = findSurvivor(gameManager, journeyerId);
  if (!journeyer) return;
  const journeyerName = firstName(journeyer);
  const player = getPlayer(gameManager);
  const playerId = player?.id || gameManager.playerId;
  const eligibleNpcs = resolveEligibleNpcs(gameManager, journeyerId, false);

  let stance = 'neutral';
  const introText = 'Back at camp, one person is missing. Eyes keep drifting toward the treeline.';

  const { consensus } = computeConsensus(eligibleNpcs, playerCanChoose ? stance : 'neutral');

  if (showOverlay) {
    const stanceChoices = [
      { label: 'They don’t send you out there for nothing. I’m watching this.', value: 'stoke' },
      { label: 'Let’s not spiral. We’ll hear it from them.', value: 'neutral' },
      { label: 'If they got something, maybe it helps us. I’m not assuming the worst.', value: 'defend' },
    ];

    const beats = [
      { title: 'Camp', text: introText },
      {
        title: 'You',
        text: 'How do you respond to the missing journeyer?',
        choices: stanceChoices,
        onChoice: (value) => {
          stance = value;
        }
      }
    ];

    const postChoiceConsensus = computeConsensus(eligibleNpcs, stance).consensus;
    const majorityPool = postChoiceConsensus === 'suspicious' ? suspiciousLines : supportiveLines;
    const minorityPool = postChoiceConsensus === 'suspicious' ? supportiveLines : suspiciousLines;
    const candidateLines = [...pickUnique(majorityPool, 2).map(text => ({ text, tone: 'majority' })), ...pickUnique(minorityPool, 1).map(text => ({ text, tone: 'minority' }))];
    const speakers = pickUnique(eligibleNpcs, candidateLines.length);
    candidateLines.forEach((line, idx) => {
      if (!speakers[idx]) return;
      beats.push({ speaker: speakers[idx], text: line.text.replaceAll('{journeyerName}', journeyerName) });
    });

    await runBeats(gameManager, beats);
  }

  const finalConsensus = computeConsensus(eligibleNpcs, playerCanChoose ? stance : 'neutral').consensus;
  const baseDelta = finalConsensus === 'suspicious' ? 3 : 1;
  const nudge = playerCanChoose ? (stance === 'stoke' ? 1 : stance === 'defend' ? -1 : 0) : 0;
  const finalDelta = Math.max(0, baseDelta + nudge);
  journeyer.suspicion = clamp((journeyer.suspicion || 0) + finalDelta, 0, 100);

  const suspiciousCount = finalConsensus === 'suspicious' ? Math.min(2, eligibleNpcs.length) : Math.min(1, eligibleNpcs.length);
  const supportiveCount = Math.max(0, Math.min(eligibleNpcs.length, 3) - suspiciousCount);
  const timestamp = Date.now();

  pushSummaryFact(strategyPhaseSystem, { type: 'journeySpeculationConsensus', targetId: journeyerId, consensus: finalConsensus, suspiciousCount, supportiveCount, timestamp });
  if (playerCanChoose && playerId) {
    pushSummaryFact(strategyPhaseSystem, { type: 'journeySpeculationPlayerStance', speakerId: playerId, targetId: journeyerId, stance, timestamp });
  }
  pushSummaryFact(strategyPhaseSystem, { type: 'journeySpeculationSuspicionDelta', targetId: journeyerId, delta: finalDelta, newSuspicion: journeyer.suspicion, timestamp });

  window.debugBanner?.('JOURNEY-RETURN P1', `${journeyerName} | ${finalConsensus} | suspicion +${finalDelta}`);

  const consensusText = finalConsensus === 'suspicious' ? 'mostly suspicious' : 'mostly calm';
  const playerStanceText = playerCanChoose ? stance : 'neutral (away)';
  campLog(gameManager, playerCanChoose
    ? `${journeyerName} was absent from camp. Consensus felt ${consensusText}. Player stance: ${playerStanceText}. Suspicion delta: +${finalDelta}, now ${journeyer.suspicion}.`
    : `While you were away on the journey, ${journeyerName} was absent from camp and the tribe speculated (${consensusText}). Suspicion delta: +${finalDelta}, now ${journeyer.suspicion}.`,
  { journeyerId, consensus: finalConsensus, stance: playerStanceText, suspicionDelta: finalDelta, newSuspicion: journeyer.suspicion });
}

const JourneyReturnCampEvent = {
  async startPart1({ gameManager, strategyPhaseSystem, journeyerId }) {
    if (!gameManager || !journeyerId) return;
    const absentSet = ensureAbsentSet(gameManager);
    absentSet.add(journeyerId);
    gameManager.flags.campEventActive = true;
    eventManager.publish(GameEvents.CAMP_EVENT_STARTED, { eventId: 'journey_return_part1', id: 'journey_return_part1' });
    try {
      await runPart1Core({ gameManager, strategyPhaseSystem, journeyerId, showOverlay: true, playerCanChoose: true });
    } finally {
      gameManager.flags.campEventActive = false;
      eventManager.publish(GameEvents.CAMP_EVENT_ENDED, { eventId: 'journey_return_part1', id: 'journey_return_part1' });
    }
  },

  async simulatePart1IfPlayerAway({ gameManager, strategyPhaseSystem, journeyerId }) {
    if (!gameManager || !journeyerId) return;
    ensureAbsentSet(gameManager).add(journeyerId);
    await runPart1Core({ gameManager, strategyPhaseSystem, journeyerId, showOverlay: false, playerCanChoose: false });
  },

  async startPart2({ gameManager, strategyPhaseSystem, journeyerId, isPlayerJourneyer = false }) {
    if (!gameManager || !journeyerId) return;
    const absentSet = ensureAbsentSet(gameManager);
    absentSet.delete(journeyerId);

    const journeyer = findSurvivor(gameManager, journeyerId);
    if (!journeyer) return;

    gameManager.flags.campEventActive = true;
    eventManager.publish(GameEvents.CAMP_EVENT_STARTED, { eventId: 'journey_return_part2', id: 'journey_return_part2' });

    try {
      let story = getPart2Story(gameManager, journeyer, isPlayerJourneyer);
      const reactions = [];
      const player = getPlayer(gameManager);
      const playerId = player?.id || gameManager.playerId;

      const beats = [
        { title: 'Camp', text: 'Footsteps hit the sand. The tribe gathers at the beach.' },
        { speaker: journeyer, text: `${firstName(journeyer)} returns from the journey.` },
      ];

      if (isPlayerJourneyer) {
        beats.push({
          title: 'You',
          text: 'How honest are you about the rules?',
          choices: [
            { label: 'Tell the truth about the rules.', value: 'truth' },
            { label: 'Lie about the rules.', value: 'lie' },
          ],
          onChoice: (value) => {
            story.rulesTold = value;
            const fresh = getPart2Story(gameManager, journeyer, true);
            story.rulesLine = value === 'truth' ? fresh.rulesLine : pickUnique([
              'I had a choice: risk my vote and do a puzzle for an advantage, or decline and keep my vote. I chose to keep my vote and didn’t play.',
              'It was basically a temptation — risk your vote for a shot at something. I didn’t go for it.',
              'It wasn’t a group rule thing. It was just me deciding whether to gamble my vote.',
              'It was a simple decision island: either take a chance for an advantage or keep it safe. That was it.'
            ], 1)[0];
          }
        });
        beats.push({
          title: 'You',
          text: 'How honest are you about the outcome?',
          choices: [
            { label: 'Tell the truth about the outcome.', value: 'truth' },
            { label: 'Lie about the outcome.', value: 'lie' },
          ],
          onChoice: (value) => {
            story.outcomeTold = value;
            const truthLine = !story.truth.didRisk ? 'I protected. I kept my vote.' : story.truth.extraVote ? 'I risked… and I earned an extra vote.' : 'I risked… and I lost my vote.';
            const liePool = ['I protected. Nothing came of it.', 'I’m good — I kept my vote.', 'I risked and I lost my vote.', 'No advantage. No penalty. Just a scary decision.'];
            story.outcomeLine = value === 'truth' ? truthLine : pickUnique(liePool, 1)[0];
          }
        });
      }

      beats.push({ speaker: journeyer, text: story.rulesLine });
      beats.push({ speaker: journeyer, text: story.outcomeLine });

      if (!isPlayerJourneyer) {
        beats.push({
          title: 'You',
          text: 'Your read?',
          choices: [
            { label: 'That actually makes sense. Thanks for being straight.', value: 'support' },
            { label: 'Walk me through it again — what EXACTLY were the rules?', value: 'probe' },
            { label: 'I don’t buy it. That feels like half the story.', value: 'doubt' },
          ],
          onChoice: () => {}
        });
      }

      const eligibleReactors = resolveEligibleNpcs(gameManager, journeyerId, false);
      const reactors = pickUnique(eligibleReactors, Math.max(2, Math.min(4, eligibleReactors.length)));

      let believers = 0;
      let doubters = 0;
      let trustNet = 0;
      let idolSuspicionNet = 0;

      reactors.forEach((npc) => {
        const trustIn = getTrust(gameManager, npc.id, journeyerId);
        const paranoid = hasDescriptor(npc, ['paranoid', 'schemer', 'cautious', 'strategist']);
        let doubtScore = 0;
        if (trustIn < 45) doubtScore += 1;
        if (paranoid) doubtScore += 1;
        if (story.rulesTold === 'lie') doubtScore += 1;
        if (story.outcomeTold === 'lie') doubtScore += 1;

        const doubt = doubtScore >= 2;
        if (doubt) {
          doubters += 1;
          adjustTrust(gameManager, npc.id, journeyerId, -2);
          adjustIdolSuspicion(gameManager, npc.id, journeyerId, +2);
          trustNet -= 2;
          idolSuspicionNet += 2;
          reactions.push({ npcId: npc.id, reaction: 'doubt' });
          beats.push({ speaker: npc, text: pickUnique(doubtingLines, 1)[0] });
        } else {
          believers += 1;
          adjustTrust(gameManager, npc.id, journeyerId, +2);
          adjustIdolSuspicion(gameManager, npc.id, journeyerId, -1);
          trustNet += 2;
          idolSuspicionNet -= 1;
          reactions.push({ npcId: npc.id, reaction: 'believe' });
          beats.push({ speaker: npc, text: pickUnique(believingLines, 1)[0] });
        }
      });

      await runBeats(gameManager, beats);

      const total = believers + doubters;
      const mood = doubters > believers ? 'mostly-doubted' : believers > doubters ? 'mostly-believed' : 'mixed';
      const suspicionDelta = total === 0 ? 0 : doubters / total > 0.5 ? 2 : believers > doubters ? -1 : 1;
      journeyer.suspicion = clamp((journeyer.suspicion || 0) + suspicionDelta, 0, 100);

      const timestamp = Date.now();
      pushSummaryFact(strategyPhaseSystem, {
        type: 'journeyReturnStory',
        speakerId: journeyerId,
        targetId: journeyerId,
        rulesTold: story.rulesTold,
        outcomeTold: story.outcomeTold,
        claimed: story.claimed,
        timestamp,
      });
      pushSummaryFact(strategyPhaseSystem, {
        type: 'journeyReturnReactions',
        targetId: journeyerId,
        believers,
        doubters,
        mood,
        timestamp,
      });
      pushSummaryFact(strategyPhaseSystem, {
        type: 'journeyReturnStatDeltas',
        targetId: journeyerId,
        trustNet,
        idolSuspicionNet,
        suspicionDelta,
        newSuspicion: journeyer.suspicion,
        timestamp,
      });

      campLog(gameManager, `${firstName(journeyer)} returned and gave a ${story.rulesTold === 'truth' && story.outcomeTold === 'truth' ? 'clean' : 'dodgy'} story. Believers: ${believers}, doubters: ${doubters}. Deltas -> suspicion ${suspicionDelta >= 0 ? '+' : ''}${suspicionDelta} (now ${journeyer.suspicion}), trust net ${trustNet >= 0 ? '+' : ''}${trustNet}, idol suspicion net ${idolSuspicionNet >= 0 ? '+' : ''}${idolSuspicionNet}.`, {
        journeyerId,
        rulesTold: story.rulesTold,
        outcomeTold: story.outcomeTold,
        believers,
        doubters,
        trustNet,
        idolSuspicionNet,
        suspicionDelta,
        newSuspicion: journeyer.suspicion,
      });

      window.debugBanner?.('JOURNEY-RETURN P2', `${story.rulesTold}/${story.outcomeTold} | B${believers} D${doubters} | T${trustNet} I${idolSuspicionNet} S${suspicionDelta}`);
      if (absentSet.size) {
        window.debugBanner?.('ABSENT NPC ACTIVE', Array.from(absentSet).join(', '));
      }

      if (!isPlayerJourneyer && playerId && !gameManager.flags.journeyReturnPart2PlayerResponseLogged) {
        gameManager.flags.journeyReturnPart2PlayerResponseLogged = true;
      }
    } finally {
      gameManager.flags.campEventActive = false;
      eventManager.publish(GameEvents.CAMP_EVENT_ENDED, { eventId: 'journey_return_part2', id: 'journey_return_part2' });
    }
  }
};

export default JourneyReturnCampEvent;
export { pushSummaryFact };
