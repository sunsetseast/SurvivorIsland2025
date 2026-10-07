import { getCampBehaviorProfile } from "./CampBehaviorProfile.js";
const clamp = (n) => Math.max(0, Math.min(1, n));
// Production ratings remain untouched. Style changes decisions, not only copy.
export function conversationCharacter(person = {}) {
  const p = getCampBehaviorProfile(person),
    style = String(
      person.gameplayStyle || person.personality || "",
    ).toLowerCase();
  const social = style.includes("social genius"),
    power = style.includes("power"),
    shadow = style.includes("shadow"),
    competitive = style.includes("competitive"),
    wild = style.includes("wild"),
    charmer = style.includes("lethal");
  return {
    ...p,
    loyalty: clamp(
      (Number(person.loyalty) || 5) / (Number(person.loyalty) > 10 ? 100 : 10),
    ),
    visibilityTolerance: clamp(
      p.riskTolerance * 0.45 +
        p.leadershipDrive * 0.25 +
        (power ? 0.25 : 0) -
        (shadow ? 0.3 : 0) -
        (social ? 0.1 : 0),
    ),
    delegationDrive: clamp(
      p.strategyDrive * 0.5 + (shadow ? 0.45 : 0) + (power ? 0.3 : 0),
    ),
    pressureDrive: clamp(
      p.confrontationDrive * 0.6 +
        (power ? 0.3 : 0) -
        (social ? 0.25 : 0) -
        (charmer ? 0.15 : 0),
    ),
    consensusNeed: clamp(
      0.25 +
        p.paranoiaDrive * 0.3 +
        (social ? 0.3 : 0) +
        (competitive ? 0.15 : 0) -
        (wild ? 0.2 : 0),
    ),
    coverDrive: clamp(
      (1 - p.honesty) * 0.5 + (charmer ? 0.4 : 0) + (shadow ? 0.25 : 0),
    ),
    shieldValue: competitive ? 0.35 : 0.05,
    repairDrive: clamp(
      p.socialDrive * 0.6 + (social ? 0.35 : 0) + (charmer ? 0.2 : 0),
    ),
    flexibility: clamp(
      p.riskTolerance * 0.5 + (wild ? 0.4 : 0) - (competitive ? 0.1 : 0),
    ),
    style,
  };
}
