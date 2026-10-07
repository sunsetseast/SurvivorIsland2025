import { ownedCampKnowledge } from "./CampKnowledge.js";
import { conversationCharacter } from "./ConversationCharacter.js";
const same = (a, b) => String(a) === String(b);
// An explicit protection promise can motivate an idol play. Only the holder's
// heard warnings/positions count; this adapter never receives ballots or tallies.
export function promisedIdolProtectionTarget(
  gm,
  holder,
  { selfDanger = 0 } = {},
) {
  const profile = conversationCharacter(holder),
    memory = gm.systems.socialMemorySystem,
    known = ownedCampKnowledge(memory, holder.id, gm.day),
    deals = gm.systems.dealSystem?.getKnownDealsForSurvivor?.(holder.id) || [];
  for (const deal of deals.filter(
    (d) =>
      d.status === "ACCEPTED" &&
      d.type === "IDOL_PROTECTION" &&
      d.terms.action === "play_idol" &&
      same(d.terms.ownerId ?? d.parties[0], holder.id),
  )) {
    const protectedId = deal.terms.protectedId ?? deal.parties[1],
      target = (gm.survivors || []).find((p) => same(p.id, protectedId));
    if (!target || target.isOut) continue;
    const accounts = new Map();
    for (const claim of known.filter(
      (k) =>
        same(k.subjectId, protectedId) &&
        !["no", "denied", "protect"].includes(k.stance) &&
        !k.challenged &&
        k.confidence >= 0.45,
    )) {
      if (
        ["target", "commitment"].includes(claim.topic) ||
        (claim.topic === "safety" && claim.stance === "warned")
      )
        accounts.set(
          String(claim.attributedId || claim.speakerId),
          claim.confidence * (claim.topic === "safety" ? 0.5 : 0.3),
        );
    }
    const danger = Math.min(
      1,
      [...accounts.values()].reduce((n, v) => n + v, 0),
    );
    if (danger < 0.35 || (selfDanger > 0.65 && profile.loyalty < 0.85))
      continue;
    const trust = (gm.getTrust?.(holder.id, protectedId) ?? 50) / 100;
    if (
      profile.loyalty * 0.35 +
        profile.honesty * 0.3 +
        trust * 0.35 -
        profile.coverDrive * 0.2 >=
      0.5
    )
      return protectedId;
  }
  return null;
}
