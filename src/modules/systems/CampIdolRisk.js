export function witnessedHuntSuspicion({ witnesses = 0, repeatVisits = 0, priorSuspicion = 0, seconds = 900 } = {}) {
  const visible = Math.max(0, witnesses);
  const repeat = Math.max(0, repeatVisits);
  // A quiet first search can pass unnoticed; repeated absences and witnesses
  // make even a secluded search harder to explain.
  return Math.min(12, Math.max(0, Math.round(
    (visible ? 2 + Math.min(3, visible) : 0) + Math.min(3, repeat) +
    (seconds >= 900 && visible ? 1 : 0) + (priorSuspicion >= 50 ? 1 : 0)
  )));
}
