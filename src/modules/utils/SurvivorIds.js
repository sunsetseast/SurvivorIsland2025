// Tribal tallies have string keys while the production cast retains numeric IDs.
export function sameSurvivorId(a, b) {
  return a != null && b != null && String(a) === String(b);
}
