// Deadlock consequences operate only on the surviving cast at this Tribal.
export function eligibleRockDrawers(members = [], tiedIds = [], protectedIds = []) {
  const tied = new Set(tiedIds.map(String));
  const protectedSet = new Set(protectedIds.map(String));
  return members.filter(member => !member.isOut && !tied.has(String(member.id)) && !protectedSet.has(String(member.id)))
    .map(member => String(member.id));
}

export function resolveFireMaking(participants = [], random = Math.random) {
  if (participants.length !== 2 || participants.some(member => !member || member.isOut)
    || String(participants[0].id) === String(participants[1].id)) return null;
  // Production firemaking/focus/dexterity/fortitude are on a 1–10 scale.
  // Firemaking dominates; bounded luck can still overturn a modest skill edge.
  const skill = (member, key, fallback = 5) => Math.max(0, Math.min(10, Number(member[key] ?? fallback) || 0));
  const scores = participants.map(member => ({
    id: String(member.id),
    score: skill(member, 'firemaking') * 0.72
      + (skill(member, 'focus') + skill(member, 'dexterity') + skill(member, 'fortitude')) / 3 * 0.28
      + (random() - 0.5) * 4
  }));
  scores.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  return {
    participants: participants.map(member => String(member.id)),
    winnerId: scores[0].id,
    eliminatedId: scores[1].id
  };
}

export function resolveMultiWayFireMaking(participants = [], random = Math.random) {
  if (participants.length < 3 || participants.some(member => !member || member.isOut)
    || new Set(participants.map(member => String(member.id))).size !== participants.length) return null;
  // Random seating gives every tied contestant the same bracket chance. Each
  // duel has exactly two people: its loser faces the next entrant; the last
  // loser leaves. No contestant is silently eliminated from a 3+ person race.
  const lineup = [...participants];
  for (let i = lineup.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [lineup[i], lineup[j]] = [lineup[j], lineup[i]];
  }
  const rounds = [];
  let atRisk = lineup[0];
  for (const entrant of lineup.slice(1)) {
    const duel = resolveFireMaking([atRisk, entrant], random);
    rounds.push(duel);
    atRisk = [atRisk, entrant].find(member => String(member.id) === duel.eliminatedId);
  }
  return { participants: participants.map(member => String(member.id)), rounds,
    winnerId: rounds.at(-1).winnerId, eliminatedId: rounds.at(-1).eliminatedId };
}
