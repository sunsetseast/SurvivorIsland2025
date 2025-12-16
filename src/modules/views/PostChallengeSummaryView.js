import strategyPhaseSystem from '../systems/StrategyPhaseSystem.js';

export default function renderPostChallengeSummaryView(container) {
  const wrapper = document.createElement('div');
  wrapper.className = 'post-challenge-summary';

  const title = document.createElement('h1');
  title.textContent = 'Post-Challenge Summary';

  const facts = strategyPhaseSystem.getSummaryFacts();
  const list = document.createElement('div');
  list.className = 'summary-list';

  if (!facts.length) {
    const empty = document.createElement('p');
    empty.textContent = 'Quiet camp. No strategic intel surfaced directly to you.';
    list.appendChild(empty);
  } else {
    facts.forEach((fact) => {
      const row = document.createElement('div');
      row.className = 'summary-row';
      row.textContent = formatFact(fact);
      list.appendChild(row);
    });
  }

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

function formatFact(fact) {
  const time = new Date(fact.timestamp || Date.now()).toLocaleTimeString();
  if (fact.type === 'rumor') {
    return `${time}: ${nameOrId(fact.speakerId)} shared a rumor about ${nameOrId(fact.targetId)}.`;
  }
  if (fact.type === 'personalTargetSet' || fact.type === 'personalTargetLocked') {
    return `${time}: You locked in ${nameOrId(fact.targetId)} as your personal target.`;
  }
  if (fact.type === 'allianceTarget') {
    return `${time}: Alliance target set on ${nameOrId(fact.targetId)}.`;
  }
  if (fact.type === 'npcScramble') {
    return `${time}: ${nameOrId(fact.speakerId)} floated ${nameOrId(fact.targetId)} in the scramble.`;
  }
  return `${time}: ${nameOrId(fact.speakerId)} ${fact.action?.toLowerCase?.() || 'spoke up'} about ${nameOrId(
    fact.targetId
  ) || 'strategy'}.`;
}

function nameOrId(id) {
  const match = window?.gameManager?.survivors?.find?.((s) => s.id === id);
  return match?.firstName || match?.name || id || 'someone';
}
