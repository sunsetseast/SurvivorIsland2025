import strategyPhaseSystem from '../systems/StrategyPhaseSystem.js';
import gameManager from '../core/GameManager.js';

export default function renderPostChallengeSummaryView(container) {
  const wrapper = document.createElement('div');
  wrapper.className = 'post-challenge-summary';

  const title = document.createElement('h1');
  title.textContent = 'Post-Challenge Summary';

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
    wrapper.appendChild(section);
  });

  const button = document.createElement('button');
  button.className = 'summary-button';
  button.textContent = strategyPhaseSystem.playerTribeSafe
    ? 'Proceed to Next Day'
    : 'Proceed to Tribal Council';
  button.addEventListener('click', () => strategyPhaseSystem.proceedAfterSummary());

  wrapper.appendChild(title);
  wrapper.appendChild(list);
  wrapper.appendChild(button);
  container.appendChild(wrapper);
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

function nameOrId(id) {
  const match = gameManager?.survivors?.find?.((s) => s.id === id);
  return match?.firstName || match?.name || id || 'someone';
}
