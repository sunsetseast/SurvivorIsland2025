// Only the on-screen read is shortened. The Tribal summary retains every vote.
export function decisiveVoteIndex(votes = [], { mustEstablishTie = false } = {}) {
  if (mustEstablishTie) return -1;
  const countable = votes.filter(vote => !vote.wasNullified);
  if (!countable.length) return -1;
  const candidates = new Set(countable.map(vote => String(vote.targetId)));
  const counts = new Map([...candidates].map(id => [id, 0]));
  let remaining = countable.length;
  for (let index = 0; index < votes.length; index += 1) {
    const vote = votes[index];
    if (!vote.wasNullified) {
      const id = String(vote.targetId);
      counts.set(id, counts.get(id) + 1);
      remaining -= 1;
    }
    const ranked = [...counts.values()].sort((a, b) => b - a);
    if (ranked[0] > (ranked[1] || 0) + remaining) return index;
  }
  return -1;
}

export function planVoteReveals(votes = [], options = {}) {
  let ordered = [...votes];
  const firstDecision = decisiveVoteIndex(ordered, options);
  // Finish the public idol/SITD nullifications before the decisive valid name.
  // The canonical queue and vote history are never mutated by this presentation plan.
  if (firstDecision >= 0 && ordered.slice(firstDecision + 1).some(vote => vote.wasNullified)) {
    const trailingNullified = ordered.slice(firstDecision + 1).filter(vote => vote.wasNullified);
    ordered = [
      ...ordered.slice(0, firstDecision),
      ...trailingNullified,
      ordered[firstDecision],
      ...ordered.slice(firstDecision + 1).filter(vote => !vote.wasNullified)
    ];
  }
  const decisiveIndex = decisiveVoteIndex(ordered, options);
  return decisiveIndex < 0 ? ordered : ordered.slice(0, decisiveIndex + 1);
}
