import strategyPhaseSystem from '../systems/StrategyPhaseSystem.js';
import gameManager from '../core/GameManager.js';
import { clearChildren } from '../utils/index.js';

export default function renderPostChallengeSummaryView(container) {
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

  const button = document.createElement('button');
  button.className = 'summary-button';
  button.textContent = strategyPhaseSystem.playerTribeSafe
    ? 'Proceed to Next Day'
    : 'Proceed to Tribal Council';
  button.addEventListener('click', () => strategyPhaseSystem.proceedAfterSummary());

  wrapper.appendChild(button);
  container.appendChild(wrapper);

  const actionButtons = document.getElementById('action-buttons');
  if (actionButtons) {
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
    label.textContent = button.textContent;
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
    buttonWrapper.addEventListener('click', () => strategyPhaseSystem.proceedAfterSummary());
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
        notable.push(`The tribe speculated about ${target}: the vibe was ${fact.consensus === 'suspicious' ? 'suspicious' : 'mostly calm'}.`);
        break;
      case 'journeySpeculationPlayerStance':
        notable.push(`You reacted to the missing journeyer: ${fact.stance === 'stoke' ? 'you stoked suspicion' : fact.stance === 'defend' ? 'you defended them' : 'you stayed neutral'}.`);
        break;
      case 'journeySpeculationSuspicionDelta':
        notable.push(`Suspicion on ${target} shifted during speculation (${formatSigned(fact.delta)} → now ${fact.newSuspicion ?? '?' }).`);
        break;
      case 'journeyReturnStory':
        notable.push(`${speaker} returned from the journey and told a ${fact.rulesTold === 'truth' ? 'clear' : 'shaky'} story about the rules, and was ${fact.outcomeTold === 'truth' ? 'straight' : 'dodgy'} about the outcome.`);
        break;
      case 'journeyReturnReactions':
        notable.push(`Reaction to ${target}: ${fact.believers ?? 0} believed, ${fact.doubters ?? 0} doubted (${fact.mood || 'mixed'}).`);
        break;
      case 'journeyReturnStatDeltas':
        notable.push(`After the return story: trust net ${formatSigned(fact.trustNet)}, idol-suspicion net ${formatSigned(fact.idolSuspicionNet)}, suspicion ${formatSigned(fact.suspicionDelta)} (now ${fact.newSuspicion ?? '?'}).`);
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

  return [
    { title: 'Your Locked Personal Target', lines: dedupe(personal) },
    { title: 'Alliance Targets', lines: dedupe(alliance) },
    { title: 'Rumors You Heard', lines: dedupe(rumors) },
    { title: 'Deals / Pacts', lines: dedupe(deals) },
    { title: 'Notable Moments', lines: dedupe(notable) },
  ];
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
