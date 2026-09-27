export const TRIBAL_PACING = Object.freeze({
  minimumAutoHold: 220,
  arrivalHold: 1250,
  seatingHold: 1350,
  openingHold: 650,
  discussionTransition: 850,
  voteWalk: 850,
  ballotConfirmation: 550,
  votesCollected: 900,
  urnAway: 1100,
  urnReturn: 1200,
  idolPrompt: 600,
  advantageReveal: 1050,
  parchmentRaise: 400,
  parchmentReadMin: 180,
  voteNormal: 700,
  voteTense: 980,
  voteNullified: 1120,
  voteDecisive: 1450,
  tieHold: 1200,
  deadlockHold: 1250,
  rockReveal: 1100,
  fireReveal: 1150,
  snuffHold: 1250,
  exitHold: 650
});

export function tribalMotionDelay(ms) {
  return globalThis.window?.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    ? Math.min(ms, 160) : ms;
}
