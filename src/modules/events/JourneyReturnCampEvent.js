import eventManager, { GameEvents } from '../core/EventManager.js';
import { LocationKeys } from '../core/LocationKeys.js';

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

function resolveBeatText(beat) {
  // Lazy beat text lets us reflect final player lie/truth choices at render time.
  return typeof beat?.text === 'function' ? beat.text() : (beat?.text || '');
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

function markJourneyReturnHandled(gameManager) {
  if (!gameManager) return;
  gameManager.flags = gameManager.flags || {};
  const marker = gameManager.flags.lastJourneyEvent;
  if (marker?.type === 'riskProtect') {
    marker.pendingReturnCampEvent = false;
    marker.handledAt = Date.now();
  }
  if (gameManager.journey?.type === 'riskProtect') {
    gameManager.journey.returnCampEventPending = false;
    gameManager.journey.returnCampEventHandledAt = Date.now();
  }
}

function resolvePendingJourneyReturnContext(gameManager) {
  if (!gameManager) return null;
  const currentJourney = gameManager?.journey || null;
  const marker = gameManager?.flags?.lastJourneyEvent || null;
  const hasJourneyContext = Boolean(currentJourney || marker);
  if (!hasJourneyContext) return null;

  const pendingFromJourney = currentJourney?.returnCampEventPending === true;
  const pendingFromMarker = marker?.pendingReturnCampEvent === true;
  if (!pendingFromJourney && !pendingFromMarker) return null;

  const tribe = gameManager.getPlayerTribe?.();
  const tribeMemberIds = new Set((tribe?.members || []).map((member) => String(member?.id)));
  const candidateJourneyerIds = [
    ...(currentJourney?.participants || []),
    ...(currentJourney?.results || []).map((entry) => entry?.survivorId),
    ...(marker?.participants || []),
    marker?.survivorId,
    marker?.journeyerId,
  ].filter(Boolean);

  const uniqueCandidates = Array.from(new Set(candidateJourneyerIds.map((id) => String(id))));
  const tribeJourneyerId = uniqueCandidates.find((id) => tribeMemberIds.has(id)) || null;
  const fallbackJourneyerId = uniqueCandidates[0] || null;
  const journeyerId = tribeJourneyerId || fallbackJourneyerId;
  if (!journeyerId || !findSurvivor(gameManager, journeyerId)) return null;

  const playerId = gameManager.getPlayerSurvivor?.()?.id || gameManager.getPlayer?.()?.id || gameManager.playerId;

  return {
    journeyerId,
    isPlayerJourneyer: Boolean(playerId) && String(journeyerId) === String(playerId),
    pendingFromJourney,
    pendingFromMarker
  };
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
  // Reuse the exact Day 1 frame layout so this event matches beat UI styling 1:1.
  const overlay = document.createElement('div');
  overlay.id = 'journey-return-overlay';
  overlay.className = 'conversation-overlay';
  overlay.style.position = 'fixed';
  overlay.style.inset = '0';
  overlay.style.background = 'rgba(0,0,0,0.75)';
  overlay.style.zIndex = '5000';
  overlay.style.display = 'flex';
  overlay.style.alignItems = 'center';
  overlay.style.justifyContent = 'center';

  const beatFrame = document.createElement('div');
  beatFrame.id = 'journey-return-beat-frame';
  beatFrame.className = 'day1-frame';
  beatFrame.style.position = 'relative';
  beatFrame.style.width = 'min(92vw, 520px)';
  beatFrame.style.maxHeight = '92vh';
  beatFrame.style.aspectRatio = '2 / 3';
  beatFrame.style.display = 'flex';
  beatFrame.style.alignItems = 'stretch';
  beatFrame.style.justifyContent = 'center';
  beatFrame.style.fontFamily = "'Survivant', sans-serif";

  const avatar = document.createElement('img');
  avatar.id = 'journey-return-avatar';
  avatar.className = 'day1-speaker-avatar';
  avatar.alt = 'Speaker avatar';
  avatar.style.position = 'absolute';
  avatar.style.aspectRatio = '1 / 1';
  avatar.style.width = '36%';
  avatar.style.height = 'auto';
  avatar.style.top = '10%';
  avatar.style.left = '9%';
  avatar.style.objectFit = 'cover';
  avatar.style.borderRadius = '50%';
  avatar.style.border = 'none';
  avatar.style.boxShadow = 'none';
  avatar.style.display = 'none';
  avatar.style.zIndex = '1';

  const templateImg = document.createElement('img');
  templateImg.id = 'journey-return-template';
  templateImg.src = 'Assets/beat-ui.png';
  templateImg.alt = 'Beat template';
  templateImg.style.position = 'absolute';
  templateImg.style.inset = '0';
  templateImg.style.width = '100%';
  templateImg.style.height = '100%';
  templateImg.style.objectFit = 'contain';
  templateImg.style.pointerEvents = 'none';
  templateImg.style.zIndex = '2';

  const contentLayer = document.createElement('div');
  contentLayer.style.position = 'absolute';
  contentLayer.style.inset = '0';
  contentLayer.style.display = 'flex';
  contentLayer.style.flexDirection = 'column';
  contentLayer.style.justifyContent = 'flex-start';
  contentLayer.style.zIndex = '3';

  const headerTileText = document.createElement('div');
  headerTileText.id = 'journey-return-header';
  headerTileText.className = 'day1-header';
  headerTileText.style.position = 'absolute';
  headerTileText.style.top = '7.5%';
  headerTileText.style.left = '30%';
  headerTileText.style.right = '30%';
  headerTileText.style.textAlign = 'center';
  headerTileText.style.fontSize = '1.02rem';
  headerTileText.style.fontWeight = '700';
  headerTileText.style.color = '#fdf2d4';
  headerTileText.style.textShadow = '0 1px 2px rgba(0,0,0,0.6)';
  headerTileText.style.letterSpacing = '1px';

  const contentArea = document.createElement('div');
  contentArea.style.position = 'absolute';
  contentArea.style.top = '23%';
  contentArea.style.left = '16%';
  contentArea.style.right = '16%';
  contentArea.style.bottom = '26%';
  contentArea.style.display = 'flex';
  contentArea.style.flexDirection = 'column';
  contentArea.style.alignItems = 'stretch';
  contentArea.style.gap = '10px';
  contentArea.style.padding = '0';
  contentArea.style.color = '#2b1a0f';
  contentArea.style.textShadow = '0 1px 1px rgba(255,255,255,0.35)';
  contentArea.style.pointerEvents = 'auto';
  contentArea.style.overflow = 'hidden';

  const quote = document.createElement('div');
  quote.id = 'journey-return-text';
  quote.className = 'day1-text';
  quote.style.position = 'absolute';
  quote.style.left = '0';
  quote.style.right = '0';
  quote.style.top = '0';
  quote.style.bottom = '0';
  quote.style.padding = '0 2%';
  quote.style.background = 'transparent';
  quote.style.border = 'none';
  quote.style.borderRadius = '0';
  quote.style.color = '#2d1b0d';
  quote.style.lineHeight = '1.5';
  quote.style.fontSize = '0.96rem';
  quote.style.maxWidth = '100%';
  quote.style.margin = '0 auto';
  quote.style.pointerEvents = 'auto';
  quote.style.display = 'flex';
  quote.style.alignItems = 'center';
  quote.style.justifyContent = 'center';
  quote.style.textAlign = 'center';
  quote.style.overflow = 'hidden';
  quote.style.wordBreak = 'break-word';

  const choices = document.createElement('div');
  choices.id = 'journey-return-choices';
  choices.className = 'day1-choices';
  choices.style.display = 'none';
  choices.style.position = 'absolute';
  choices.style.left = '8%';
  choices.style.right = '6%';
  choices.style.bottom = '4%';
  choices.style.flexDirection = 'column';
  choices.style.gap = '10px';
  choices.style.maxHeight = '40%';
  choices.style.overflowY = 'auto';
  choices.style.pointerEvents = 'auto';

  const nextButton = document.createElement('button');
  nextButton.id = 'journey-return-next';
  nextButton.textContent = 'Next';
  nextButton.style.position = 'absolute';
  nextButton.style.right = '10%';
  nextButton.style.bottom = '10%';
  nextButton.style.width = '28%';
  nextButton.style.height = '11%';
  nextButton.style.padding = '0';
  nextButton.style.background = 'transparent';
  nextButton.style.color = '#fef3d9';
  nextButton.style.border = 'none';
  nextButton.style.borderRadius = '0';
  nextButton.style.fontWeight = '700';
  nextButton.style.fontSize = '0.98rem';
  nextButton.style.textTransform = 'uppercase';
  nextButton.style.boxShadow = 'none';
  nextButton.style.cursor = 'pointer';
  nextButton.style.pointerEvents = 'auto';
  nextButton.style.minWidth = '0';
  nextButton.style.display = 'flex';
  nextButton.style.alignItems = 'center';
  nextButton.style.justifyContent = 'center';
  nextButton.style.letterSpacing = '0.5px';
  nextButton.style.textShadow = '0 1px 2px rgba(0,0,0,0.55)';

  contentArea.append(quote, choices);
  contentLayer.append(headerTileText, contentArea, nextButton);

  beatFrame.append(avatar, templateImg, contentLayer);
  overlay.appendChild(beatFrame);
  document.body.appendChild(overlay);

  return { overlay, avatar, templateImg, headerTileText, quote, choices, nextButton };
}

function renderChoiceButtons(container, options = [], onPick) {
  container.innerHTML = '';
  container.style.display = 'flex';
  options.forEach((option) => {
    const button = document.createElement('button');
    button.style.background = 'transparent';
    button.style.border = 'none';
    button.style.borderRadius = '0';
    button.style.boxShadow = 'none';
    button.style.setProperty('padding', '10px 12px', 'important');
    button.style.setProperty('margin', '0', 'important');
    button.style.width = '100%';
    button.style.cursor = 'pointer';
    button.style.fontWeight = '700';
    button.style.fontSize = '0.95rem';
    button.style.color = '#2d1b0d';
    button.style.textAlign = 'center';
    button.style.textShadow = '0 1px 2px rgba(255,255,255,0.5)';
    button.textContent = option.label;
    button.addEventListener('click', () => onPick(option.value));
    container.appendChild(button);
  });
}

async function runBeats(gameManager, beats) {
  return new Promise((resolve) => {
    const ui = buildOverlay();
    let index = 0;
    let isAdvancing = false;

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
        ui.templateImg.src = 'Assets/beat-avatar-ui.png';
        ui.headerTileText.textContent = firstName(beat.speaker).toUpperCase();
        ui.headerTileText.style.left = '54%';
        ui.headerTileText.style.right = '10%';
      } else {
        ui.avatar.style.display = 'none';
        ui.templateImg.src = 'Assets/beat-ui.png';
        ui.headerTileText.textContent = (beat.title || 'Camp').toUpperCase();
        ui.headerTileText.style.left = '26%';
        ui.headerTileText.style.right = '26%';
      }
      ui.quote.textContent = resolveBeatText(beat);
      isAdvancing = false;

      if (beat.choices?.length) {
        ui.nextButton.style.display = 'none';
        renderChoiceButtons(ui.choices, beat.choices, (value) => {
          if (isAdvancing) return;
          isAdvancing = true;
          beat.onChoice?.(value);
          ui.choices.style.display = 'none';
          ui.nextButton.style.display = 'flex';
          index += 1;
          showBeat();
        });
      } else {
        ui.choices.style.display = 'none';
        ui.nextButton.style.display = 'flex';
      }
    };

    ui.nextButton.addEventListener('click', () => {
      if (isAdvancing) return;
      isAdvancing = true;
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

  const claimed = recomputeClaimedFromOutcomeLine(outcomeLine);

  return { rulesTold, outcomeTold, rulesLine, outcomeLine, claimed, truth };
}

function recomputeClaimedFromOutcomeLine(outcomeLine = '') {
  const lower = String(outcomeLine).toLowerCase();
  return {
    risked: lower.includes('risked') ? true : lower.includes('protected') ? false : null,
    protected: lower.includes('protected') ? true : null,
    extraVote: lower.includes('extra vote') ? true : null,
    lostVote: lower.includes('lost my vote') ? true : null,
  };
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
    const addReactionBeats = () => {
      const postChoiceConsensus = computeConsensus(eligibleNpcs, stance).consensus;
      const majorityPool = postChoiceConsensus === 'suspicious' ? suspiciousLines : supportiveLines;
      const minorityPool = postChoiceConsensus === 'suspicious' ? supportiveLines : suspiciousLines;
      const majorityLines = pickUnique(majorityPool, 2).map(text => ({ text, tone: 'majority' }));
      const minorityLines = pickUnique(minorityPool, 1).map(text => ({ text, tone: 'minority' }));
      const candidateLines = [...majorityLines, ...minorityLines];
      const speakers = pickUnique(eligibleNpcs, candidateLines.length);
      candidateLines.forEach((line, idx) => {
        if (!speakers[idx]) return;
        beats.push({ speaker: speakers[idx], text: line.text.replaceAll('{journeyerName}', journeyerName) });
      });
    };

    beats[1].onChoice = (value) => {
      stance = value;
      addReactionBeats();
    };

    if (!playerCanChoose) {
      addReactionBeats();
    }

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
  pushSummaryFact(strategyPhaseSystem, {
    type: 'journeySpeculationSummary',
    journeyerId,
    journeyerAbsent: true,
    playerStance: playerCanChoose ? stance : 'neutral',
    consensus: finalConsensus,
    suspicionDelta: finalDelta,
    newSuspicion: journeyer.suspicion,
    timestamp,
  });

  window.debugBanner?.('JOURNEY-RETURN P1', `${journeyerName} | ${finalConsensus} | suspicion +${finalDelta}`);

  const consensusText = finalConsensus === 'suspicious' ? 'mostly suspicious' : 'mostly calm';
  const playerStanceText = playerCanChoose ? stance : 'neutral (away)';
  campLog(gameManager, playerCanChoose
    ? `${journeyerName} was absent from camp. Consensus felt ${consensusText}. Player stance: ${playerStanceText}. Suspicion delta: +${finalDelta}, now ${journeyer.suspicion}.`
    : `While you were away on the journey, ${journeyerName} was absent from camp and the tribe speculated (${consensusText}). Suspicion delta: +${finalDelta}, now ${journeyer.suspicion}.`,
  { journeyerId, consensus: finalConsensus, stance: playerStanceText, suspicionDelta: finalDelta, newSuspicion: journeyer.suspicion });
}

const JourneyReturnCampEvent = {
  id: 'journey_return_camp_event',

  isEligible(result, gameManager) {
    if (!result) return false;
    if (!gameManager?.journey && !gameManager?.flags?.lastJourneyEvent) return false;
    return Boolean(resolvePendingJourneyReturnContext(gameManager));
  },

  async runScripted({ gameManager, challengeManager, campScreen }) {
    const result = challengeManager?.getLastChallengeResult?.();
    console.log('[JourneyReturnCampEvent] eligibility check');
    if (!this.isEligible(result, gameManager)) return;

    const context = resolvePendingJourneyReturnContext(gameManager);
    const journeyerId = context?.journeyerId;
    const isPlayerJourneyer = context?.isPlayerJourneyer;
    if (!journeyerId) return;

    // In scripted post-challenge mode, reuse the canonical part-2 flow when the
    // player is the journeyer so they still get the truth/lie decisions.
    if (isPlayerJourneyer) {
      await this.simulatePart1IfPlayerAway({
        gameManager,
        strategyPhaseSystem: null,
        journeyerId,
      });
      await this.startPart2({
        gameManager,
        strategyPhaseSystem: null,
        journeyerId,
        isPlayerJourneyer: true,
      });
      markJourneyReturnHandled(gameManager);
      return;
    }

    await this.startPart1({
      gameManager,
      strategyPhaseSystem: null,
      journeyerId,
    });
    await this.startPart2({
      gameManager,
      strategyPhaseSystem: null,
      journeyerId,
      isPlayerJourneyer: false,
    });
    markJourneyReturnHandled(gameManager);
  },

  async startPart1({ gameManager, strategyPhaseSystem, journeyerId }) {
    if (!gameManager || !journeyerId) return;
    console.info('[JourneyReturnCampEvent] startPart1', {
      journeyerId,
      day: gameManager.getCurrentDay?.() ?? gameManager.day,
      timer: gameManager.getDayTimer?.() ?? gameManager.dayTimer
    });
    window.debugBanner?.('JOURNEY-RETURN P1', `start | ${journeyerId}`);
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
    console.info('[JourneyReturnCampEvent] simulatePart1IfPlayerAway', {
      journeyerId,
      day: gameManager.getCurrentDay?.() ?? gameManager.day,
      timer: gameManager.getDayTimer?.() ?? gameManager.dayTimer
    });
    ensureAbsentSet(gameManager).add(journeyerId);
    await runPart1Core({ gameManager, strategyPhaseSystem, journeyerId, showOverlay: false, playerCanChoose: false });
  },

  async startPart2({ gameManager, strategyPhaseSystem, journeyerId, isPlayerJourneyer = false }) {
    if (!gameManager || !journeyerId) return;
    const absentSet = ensureAbsentSet(gameManager);
    absentSet.delete(journeyerId);

    const journeyer = findSurvivor(gameManager, journeyerId);
    if (!journeyer) return;

    // Keep the return cinematic grounded at camp beach for the post-challenge arrival beat.
    window.campScreen?.loadView?.(LocationKeys.BEACH);

    gameManager.flags.campEventActive = true;
    eventManager.publish(GameEvents.CAMP_EVENT_STARTED, { eventId: 'journey_return_part2', id: 'journey_return_part2' });

    try {
      let story = getPart2Story(gameManager, journeyer, isPlayerJourneyer);
      const reactions = [];
      const player = getPlayer(gameManager);
      const playerId = player?.id || gameManager.playerId;

      const beats = [
        { title: 'Camp', text: 'The tribe drifts back into camp after the challenge… but one person still isn’t here.' },
        { title: 'Camp', text: 'A boat pulls up to the beach. The missing castaway finally returns.' },
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

      beats.push({ speaker: journeyer, text: () => story.rulesLine });
      beats.push({ speaker: journeyer, text: () => story.outcomeLine });

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
      const reactors = pickUnique(eligibleReactors, Math.min(3, eligibleReactors.length));

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
      story.claimed = recomputeClaimedFromOutcomeLine(story.outcomeLine);

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
      pushSummaryFact(strategyPhaseSystem, {
        type: 'journeyReturnSummary',
        journeyerId,
        rulesTold: story.rulesTold,
        outcomeTold: story.outcomeTold,
        claimed: story.claimed,
        believers,
        doubters,
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
