// Deadlock consequences operate only on the surviving cast at this Tribal.
export function eligibleRockDrawers(members = [], tiedIds = [], protectedIds = []) {
  const tied = new Set(tiedIds.map(String));
  const protectedSet = new Set(protectedIds.map(String));
  return members.filter(member => !member.isOut && !tied.has(String(member.id)) && !protectedSet.has(String(member.id)))
    .map(member => String(member.id));
}

export function resolveFireMaking(participants = [], random = Math.random) {
  if (participants.length < 2 || participants.some(member => !member || member.isOut)) return null;
  // A small attribute edge matters; bounded luck still leaves an upset possible.
  const scores = participants.map(member => ({
    id: String(member.id),
    score: (Number(member.physical) || 50) * 0.55 + (Number(member.mental) || 50) * 0.45
      + (random() - 0.5) * 24
  }));
  scores.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  return {
    participants: participants.map(member => String(member.id)),
    winnerId: scores[0].id,
    eliminatedId: scores.at(-1).id
  };
}
