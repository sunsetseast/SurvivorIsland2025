/** Decide from the holder's perception only. Never pass ballots or a tally here. */
export function decideNpcIdolPlay(holder, knowledge) {
  const perceivedDanger = knowledge.perceivedDanger(holder);
  const risk = Number(holder?.risk ?? holder?.traits?.risk ?? 5);
  const normalizedRisk = Math.max(0, Math.min(10, Number.isFinite(risk) ? risk : 5));
  const score = perceivedDanger + (5 - normalizedRisk) * .018;
  return { play: score >= .53, perceivedDanger, score };
}
