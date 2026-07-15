export function sameDay1Id(a, b) {
  return a != null && b != null && String(a) === String(b);
}

export function resolveDay1Player(gameManager, tribe = null) {
  const members = tribe?.members || gameManager?.getPlayerTribe?.()?.members || [];
  const candidates = [
    gameManager?.getPlayerSurvivor?.(),
    gameManager?.getPlayer?.(),
    gameManager?.player,
    gameManager?.playerId,
    gameManager?.playerSurvivorId,
    gameManager?.selectedSurvivorId,
    gameManager?.activeSurvivorId,
    tribe?.playerId,
    tribe?.selectedSurvivorId
  ];
  for (const candidate of candidates) {
    const id = typeof candidate === 'object' ? candidate?.id : candidate;
    const match = members.find(member => sameDay1Id(member?.id, id));
    if (match) return match;
  }
  return members.find(member => member?.isPlayer === true) || null;
}

export function day1DisplayName(survivor, playerId = null) {
  if (!survivor) return 'Someone';
  if (sameDay1Id(survivor.id, playerId)) return 'You';
  return survivor.firstName || survivor.name || 'Someone';
}
