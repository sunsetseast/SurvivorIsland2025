export function normalizeChallengeResult(raw = {}, { challenge = null, gameManager = null } = {}) {
  const result = { ...(raw || {}) };
  const day = result.challengeDay ?? challenge?.day ?? gameManager?.getDay?.() ?? gameManager?.day ?? 1;
  const challengeType = result.challengeType ?? challenge?.type ?? 'tribal';
  const playerTribe = gameManager?.getPlayerTribe?.();
  const playerTribeKey = result.playerTribeKey ?? playerTribe?.id ?? playerTribe?.tribeId ?? null;
  const winningTribeKeys = Array.isArray(result.winningTribeKeys)
    ? [...result.winningTribeKeys]
    : result.winningTribeKey != null ? [result.winningTribeKey] : [];
  const playerTribeWon = challengeType === 'individual'
    ? false
    : typeof result.playerTribeWon === 'boolean'
      ? result.playerTribeWon
      : winningTribeKeys.some(key => String(key) === String(playerTribeKey));
  const individualWinnerId = result.individualWinnerId ?? null;
  return {
    ...result,
    challengeKey: result.challengeKey ?? (day === 1 ? 'first_contact' : (challenge?.name || 'immunity_challenge').toLowerCase().replace(/\s+/g, '_')),
    challengeName: result.challengeName ?? challenge?.name ?? null,
    challengeDay: day,
    challengeType,
    playerTribeKey,
    winningTribeKeys,
    winningTribeKey: result.winningTribeKey ?? winningTribeKeys[0] ?? null,
    losingTribeKey: result.losingTribeKey ?? null,
    playerTribeWon,
    individualWinnerId,
    playerWonIndividualImmunity: challengeType === 'individual'
      ? Boolean(result.playerWonIndividualImmunity ?? (individualWinnerId != null && String(individualWinnerId) === String(gameManager?.player?.id)))
      : false,
    completed: result.completed !== false
  };
}

export default normalizeChallengeResult;