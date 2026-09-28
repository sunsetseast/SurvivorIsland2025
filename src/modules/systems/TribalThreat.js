/** Production threat is stored on a 0–10 scale. The optional threatScore
 * already uses 0–100; challengeThreat is a separate challenge metric. */
export function normalizedThreat(member) {
  const score = Number(member?.threatScore);
  if (member?.threatScore != null && Number.isFinite(score)) return Math.max(0, Math.min(100, score));
  const raw = Number(member?.threat);
  if (member?.threat != null && Number.isFinite(raw)) {
    return Math.max(0, Math.min(100, raw <= 10 ? raw * 10 : raw));
  }
  return 50;
}
