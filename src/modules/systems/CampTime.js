// Remaining clock seconds and fractional tick progress are serialized together.
// Processing boundaries in elapsed-time order makes a single action equivalent
// to the same number of natural clock ticks, even over a shelter change.
export function advanceCampNeeds(gameManager, seconds) {
  const amount = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const elapsed = gameManager.campNeedElapsed ||= { water: 0, hunger: 0, rest: 0 };
  const intervals = { water: 300, hunger: 360 };
  let changed = false;
  for (const [need, interval] of Object.entries(intervals)) {
    const total = (Number.isFinite(elapsed[need]) ? elapsed[need] : 0) + amount;
    const ticks = Math.floor(total / interval);
    elapsed[need] = total % interval;
    if (!ticks) continue;
    const method = { water: 'decreaseWaterForAll', hunger: 'decreaseHungerForAll', rest: 'decreaseRestForAll' }[need];
    gameManager[method]?.(ticks);
    changed = true;
  }
  const tribes = gameManager.tribes || [];
  if (tribes.length) {
    elapsed.restByTribe ||= {};
    for (const tribe of tribes) {
      const id = String(tribe.id ?? tribe.tribeId ?? tribe.name);
      const interval = 240 + (tribe.shelter || 0) * 120;
      const prior = Number.isFinite(elapsed.restByTribe[id]) ? elapsed.restByTribe[id] : (elapsed.rest || 0);
      const total = prior + amount, ticks = Math.floor(total / interval);
      elapsed.restByTribe[id] = total % interval;
      for (const member of tribe.members || []) if (!member?.isOut && Number.isFinite(member?.rest))
        member.rest = Math.max(0, member.rest - ticks);
      if (ticks) changed = true;
    }
    elapsed.rest = 0;
  } else {
    const interval = 240 + (gameManager.getPlayerTribe?.()?.shelter || 0) * 120;
    const total = (elapsed.rest || 0) + amount, ticks = Math.floor(total / interval);
    elapsed.rest = total % interval;
    if (ticks) { gameManager.decreaseRestForAll?.(ticks); changed = true; }
  }
  if (changed) gameManager.updateHealthForAll?.();
  return changed;
}
