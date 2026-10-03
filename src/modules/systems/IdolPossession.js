// Personal possession only: never consult the hidden tribe idol's spawn state.
export function ownsUsableIdol(survivor, idolSystem) {
  if (!survivor) return false;
  return Boolean(survivor.hasIdol || idolSystem?.getSurvivorInventory?.(survivor.id)?.idols
    ?.some(item => !item.isUsed && !item.played));
}
