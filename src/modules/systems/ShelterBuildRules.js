const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const attribute = value => {
  const number = Number(value);
  return Number.isFinite(number) ? clamp(number <= 10 ? number * 10 : number, 0, 100) : 50;
};

// Relationships use the RelationshipSystem's 0..100 `value` scale.
export function shelterBuildOdds({ player, partner, relationshipValue = 50, style = 'together', leader = false }) {
  const ability = (attribute(player?.strength ?? player?.physical) + attribute(partner?.strength ?? partner?.physical)) / 2;
  const fatigue = (Number(player?.rest ?? 75) + Number(partner?.rest ?? 75)) / 2;
  const teamwork = clamp(Number(relationshipValue) || 0, 0, 100);
  const laziness = (Number(player?.laziness) || 0) + (Number(partner?.laziness) || 0);
  const styleBonus = style === 'together' ? 0.06 : style === 'lead' ? (leader ? 0.05 : 0) : -0.02;
  return clamp(0.24 + ability * 0.0025 + fatigue * 0.001 + teamwork * 0.0025 - laziness * 0.001 + styleBonus, 0.25, 0.88);
}
