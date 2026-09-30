// Production ratings are 1–10; needs are runtime 0–100 values. This adapter
// interprets them without adding another persistent personality schema.
const clamp = (n, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));
const rating = (survivor, key) => {
  const value = survivor?.[key];
  return clamp(typeof value === 'number' && Number.isFinite(value) ? value : 5, 1, 10) / 10;
};

export function getCampBehaviorProfile(survivor = {}) {
  const r = key => rating(survivor, key);
  const workDrive = 1.1 - r('laziness');
  return Object.freeze({
    workDrive,
    socialDrive: (r('connections') + r('likeability')) / 2,
    strategyDrive: r('bigmove') * .7 + r('risk') * .3,
    idolDrive: r('idolhunt'),
    paranoiaDrive: r('paratend'),
    leadershipDrive: r('leader'),
    riskTolerance: r('risk'),
    confrontationDrive: r('aggression'), // strategic pressure, never physical aggression
    honesty: r('honesty'),
    deception: r('deception'), // effectiveness of delivery, independent of willingness to lie
    advantageSharing: r('idolshare'),
    fireSkill: r('firemaking') * .8 + r('focus') * .1 + r('dexterity') * .1,
    fishingSkill: r('fishing') * .85 + r('dexterity') * .1 + r('endurance') * .05,
    gatheringSkill: r('strength') * .4 + r('endurance') * .3 + workDrive * .3,
    // Construction expertise dominates; neither leadership nor effort substitutes
    // for knowing how to build. A reluctant skilled builder retains their ability.
    shelterSkill: r('campcraft') * .75 + r('dexterity') * .1 + r('strength') * .1 + workDrive * .05
  });
}

export const campLieAttemptChance = profile => (.003 + (1 - profile.honesty) * .077)
  * (.5 + profile.riskTolerance * .5);
// Apply to truthful and false delivery alike: listeners do not receive a hidden
// truth flag or magically detect a lie from a poor deception rating.
export const campStatementConfidence = (base, profile) => base * (.7 + profile.deception * .3);

export function campWorkSkill(survivor, type) {
  const profile = getCampBehaviorProfile(survivor);
  const skill = type === 'fish' ? profile.fishingSkill : ['build_fire', 'tend_fire'].includes(type) ? profile.fireSkill
    : type === 'build_shelter' ? profile.shelterSkill : profile.gatheringSkill;
  const condition = ['rest', 'water', 'hunger'].reduce((sum, key) => sum +
    clamp(Number.isFinite(survivor?.[key]) ? survivor[key] / 100 : .75), 0) / 3;
  return skill * (.75 + .25 * condition);
}

export function campBuildSuccessChance(survivor, type, { responsible = false } = {}) {
  const skill = campWorkSkill(survivor, type);
  return clamp((type.includes('fire') ? .3 + skill * .55 : .4 + skill * .4)
    + (responsible ? .03 : 0), .3, .88);
}
