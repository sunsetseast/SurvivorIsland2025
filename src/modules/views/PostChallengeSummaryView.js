import strategyPhaseSystem from '../systems/StrategyPhaseSystem.js';
import gameManager from '../core/GameManager.js';
import { clearChildren } from '../utils/index.js';

export default function renderPostChallengeSummaryView(container) {
  clearChildren(container);

  const wrapper = document.createElement('div');
  wrapper.className = 'post-challenge-summary';

  const title = document.createElement('h1');
  title.textContent = 'Post-Challenge Summary';
  wrapper.appendChild(title);

  const scroll = document.createElement('div');
  scroll.className = 'post-challenge-summary-scroll';

  const facts = strategyPhaseSystem.getSummaryFacts();

  const sections = buildSections(facts);
  sections.forEach(({ title: heading, lines }) => {
    const section = document.createElement('div');
    section.className = 'summary-section';

    const h2 = document.createElement('h2');
    h2.textContent = heading;
    section.appendChild(h2);

    if (!lines.length) {
      const empty = document.createElement('p');
      empty.textContent = 'No notes.';
      section.appendChild(empty);
    } else {
      lines.forEach((line) => {
        const row = document.createElement('div');
        row.className = 'summary-row';
        row.textContent = line;
        section.appendChild(row);
      });
    }
    scroll.appendChild(section);
  });

  wrapper.appendChild(scroll);

  container.appendChild(wrapper);

  const proceedLabel = strategyPhaseSystem.playerTribeSafe
    ? 'Proceed to Next Day'
    : 'Proceed to Tribal Council';

  const proceedAfterSummary = () => {
    const currentState = gameManager.getGameState?.() || gameManager.gameState;
    const currentPhase = gameManager.getGamePhase?.() || gameManager.gamePhase;
    const intendedNextState = strategyPhaseSystem.playerTribeSafe ? 'camp' : 'tribalCouncil';

    console.log('[PostChallengeSummaryView] Proceed clicked', {
      playerTribeSafe: strategyPhaseSystem.playerTribeSafe,
      currentState,
      currentPhase,
      intendedNextState
    });

    try {
      strategyPhaseSystem.proceedAfterSummary();
      console.log('[PostChallengeSummaryView] Proceed completed', {
        newState: gameManager.getGameState?.() || gameManager.gameState,
        newPhase: gameManager.getGamePhase?.() || gameManager.gamePhase
      });
    } catch (error) {
      console.error('[PostChallengeSummaryView] Failed to proceed after summary', {
        error,
        playerTribeSafe: strategyPhaseSystem.playerTribeSafe,
        currentState,
        currentPhase,
        intendedNextState
      });
    }
  };

  const actionButtons = document.getElementById('action-buttons');
  if (actionButtons) {
    const actionBar = document.getElementById('camp-action-bar');
    if (actionBar) {
      actionBar.style.zIndex = '2100';
      actionBar.style.pointerEvents = 'auto';
    }

    clearChildren(actionButtons);

    const buttonWrapper = document.createElement('div');
    buttonWrapper.style.cssText = `
      width: 260px;
      height: 150px;
      display: inline-block;
      overflow: hidden;
      cursor: pointer;
      position: relative;
    `;

    const background = document.createElement('img');
    background.src = 'Assets/Buttons/blank.png';
    background.alt = 'Continue';
    background.style.cssText = `
      width: 100%;
      height: 100%;
      display: block;
      object-fit: contain;
      pointer-events: none;
    `;

    const label = document.createElement('div');
    label.textContent = proceedLabel;
    label.style.cssText = `
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      color: white;
      font-family: 'Survivant', sans-serif;
      font-size: 1.1rem;
      text-shadow: 1px 1px 2px black;
      text-align: center;
      pointer-events: none;
      width: 90%;
    `;

    buttonWrapper.appendChild(background);
    buttonWrapper.appendChild(label);
    buttonWrapper.addEventListener('click', proceedAfterSummary);
    actionButtons.appendChild(buttonWrapper);
  }
}


function formatSigned(n) {
  const value = Number(n) || 0;
  return value >= 0 ? `+${value}` : `${value}`;
}

function buildSections(facts = []) {
  const personal = [];
  const alliance = [];
  const rumors = [];
  const deals = [];
  const notable = [];
  const journeySpeculation = [];
  const journeyReturn = [];

  const latestFactByType = new Map();
  facts.forEach((fact) => {
    if (fact?.type) {
      latestFactByType.set(fact.type, fact);
    }
  });

  facts.forEach((fact) => {
    const speaker = nameOrId(fact.speakerId);
    const target = nameOrId(fact.targetId);

    switch (fact.type) {
      case 'personalTargetSet':
      case 'personalTargetLocked':
        personal.push(`You locked ${target} as your target.`);
        break;
      case 'allianceTarget':
      case 'allianceTargetLocked':
      case 'allianceTargetConfirmed':
        alliance.push(`Alliance aimed at ${target}.`);
        break;
      case 'rumor':
        rumors.push(`${speaker} said people are throwing out ${target}.`);
        break;
      case 'targetProposed':
        alliance.push(`${speaker} pitched ${target}.`);
        break;
      case 'targetResponse':
        alliance.push(`${speaker} (${fact.stance}) on ${target}.`);
        break;
      case 'playerSwayAttempt':
        notable.push(`You tried to sway toward ${target} (${fact.success ? 'success' : 'failed'}).`);
        break;
      case 'suspicionGained':
        notable.push(`Suspicion rose after you pushed against the majority.`);
        break;
      case 'npcScramble':
        notable.push(`${speaker} floated ${target} in the scramble.`);
        break;
      case 'journeySpeculationConsensus':
      case 'journeySpeculationPlayerStance':
      case 'journeySpeculationSuspicionDelta':
      case 'journeySpeculationSummary':
      case 'journeyReturnStory':
      case 'journeyReturnReactions':
      case 'journeyReturnStatDeltas':
      case 'journeyReturnSummary':
        break;
      case 'dealProposed':
      case 'dealAccepted':
      case 'dealRejected':
      case 'voteTogether':
      case 'promise':
      case 'counterOffer':
      case 'mutualProtection':
      case 'longPact':
      case 'info':
        const topic = fact.topic || fact.dealTopic || fact.topicPerson;
        deals.push(
          `${speaker} ${describeDealOutcome(fact.type, fact)}${topic ? ` about ${topic}` : ''}.`.trim()
        );
        break;
      default:
        break;
    }
  });

  const part1 = latestFactByType.get('journeySpeculationSummary');
  const part1Consensus = latestFactByType.get('journeySpeculationConsensus');
  const part1Stance = latestFactByType.get('journeySpeculationPlayerStance');
  const part1Suspicion = latestFactByType.get('journeySpeculationSuspicionDelta');
  if (part1 || part1Consensus || part1Stance || part1Suspicion) {
    const journeyerId = part1?.journeyerId || part1Consensus?.targetId || part1Suspicion?.targetId;
    const missingName = nameOrId(journeyerId);
    const consensusValue = part1?.consensus || part1Consensus?.consensus;
    const stanceValue = part1?.playerStance || part1Stance?.stance || 'neutral';
    const suspicionDelta = part1?.suspicionDelta ?? part1Suspicion?.delta ?? 0;
    const newSuspicion = part1?.newSuspicion ?? part1Suspicion?.newSuspicion ?? '?';

    journeySpeculation.push(`Missing journeyer: ${missingName}.`);
    journeySpeculation.push(`Tribe consensus: ${consensusValue === 'suspicious' ? 'mostly suspicious' : 'mostly calm'}.`);
    journeySpeculation.push(`Your stance: ${stanceValue === 'stoke' ? 'stoked suspicion' : stanceValue === 'defend' ? 'defended the journeyer' : 'stayed neutral'}.`);
    journeySpeculation.push(`Suspicion shift: ${formatSigned(suspicionDelta)} (now ${newSuspicion}).`);
  }

  const part2 = latestFactByType.get('journeyReturnSummary');
  const part2Story = latestFactByType.get('journeyReturnStory');
  const part2Reactions = latestFactByType.get('journeyReturnReactions');
  const part2Deltas = latestFactByType.get('journeyReturnStatDeltas');
  if (part2 || part2Story || part2Reactions || part2Deltas) {
    const journeyerId = part2?.journeyerId || part2Story?.speakerId || part2Reactions?.targetId || part2Deltas?.targetId;
    const journeyerName = nameOrId(journeyerId);
    const rulesTold = part2?.rulesTold || part2Story?.rulesTold || 'unknown';
    const outcomeTold = part2?.outcomeTold || part2Story?.outcomeTold || 'unknown';
    const believers = part2?.believers ?? part2Reactions?.believers ?? 0;
    const doubters = part2?.doubters ?? part2Reactions?.doubters ?? 0;
    const trustNet = part2?.trustNet ?? part2Deltas?.trustNet ?? 0;
    const idolSuspicionNet = part2?.idolSuspicionNet ?? part2Deltas?.idolSuspicionNet ?? 0;
    const suspicionDelta = part2?.suspicionDelta ?? part2Deltas?.suspicionDelta ?? 0;
    const newSuspicion = part2?.newSuspicion ?? part2Deltas?.newSuspicion ?? '?';
    const claimedOutcome = describeClaimedOutcome(part2?.claimed || part2Story?.claimed);

    journeyReturn.push(`${journeyerName} on return: rules were ${rulesTold}, outcome was ${outcomeTold}.`);
    if (claimedOutcome) journeyReturn.push(`Claimed outcome: ${claimedOutcome}.`);
    journeyReturn.push(`Believers vs doubters: ${believers} / ${doubters}.`);
    journeyReturn.push(`Trust net: ${formatSigned(trustNet)} | Idol suspicion net: ${formatSigned(idolSuspicionNet)}.`);
    journeyReturn.push(`Suspicion shift: ${formatSigned(suspicionDelta)} (now ${newSuspicion}).`);
  }

  return [
    { title: 'Your Locked Personal Target', lines: dedupe(personal) },
    { title: 'Alliance Targets', lines: dedupe(alliance) },
    { title: 'Rumors You Heard', lines: dedupe(rumors) },
    { title: 'Deals / Pacts', lines: dedupe(deals) },
    { title: 'Journey Speculation (Part 1)', lines: dedupe(journeySpeculation) },
    { title: 'Journey Return (Part 2)', lines: dedupe(journeyReturn) },
    { title: 'Notable Moments', lines: dedupe(notable) },
  ];
}


function describeClaimedOutcome(claimed) {
  if (!claimed) return '';
  if (claimed.extraVote) return 'earned an extra vote';
  if (claimed.lostVote) return 'lost their vote';
  if (claimed.protected) return 'protected and kept their vote';
  if (claimed.risked) return 'risked but outcome unclear';
  return '';
}

function dedupe(list) {
  return Array.from(new Set(list));
}

function describeDealOutcome(type, fact = {}) {
  const dealTypeLabel = fact.dealType || fact.intent || type;
  switch (type) {
    case 'dealAccepted':
      return `accepted a deal${dealTypeLabel ? ` (${dealTypeLabel})` : ''}`;
    case 'dealRejected':
      return `declined a deal${dealTypeLabel ? ` (${dealTypeLabel})` : ''}`;
    case 'voteTogether':
      return 'wants to vote together';
    case 'promise':
      return 'made a promise';
    case 'counterOffer':
      return `countered with ${dealTypeLabel || 'another idea'}`;
    case 'mutualProtection':
      return 'discussed mutual protection';
    case 'longPact':
      return 'talked long-term pact';
    case 'info':
      return 'offered to trade info';
    case 'dealProposed':
    default:
      return `proposed ${dealTypeLabel || 'a deal'}`;
  }
}

function nameOrId(id) {
  const match = gameManager?.survivors?.find?.((s) => s.id === id);
  return match?.firstName || match?.name || id || 'someone';
}
