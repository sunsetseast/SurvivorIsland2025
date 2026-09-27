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
  const decisiveIndex = decisiveVoteIndex(votes, options);
  return decisiveIndex < 0 ? [...votes] : votes.slice(0, decisiveIndex + 1);
}
