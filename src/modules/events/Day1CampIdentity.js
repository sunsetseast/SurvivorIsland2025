// Day 1 needs to read a cast as people, not as a single leadership number.
// This module stays data-first so the cinematic can use the same read for
// narration, consequences, memory, and later systems.

const IDENTITY_BLUEPRINTS = {
  'boston rob': {
    leaderStyle: 'command', command: 26, strategic: 16, reputation: 24, resistance: 18,
    tags: ['command_leader', 'controlling_leader', 'strategic_legend'], expectedRoles: ['shelter', 'fire'],
    leaderLine: 'Shelter first. Fire, food, and wood move at the same time.'
  },
  sandra: {
    leaderStyle: 'under_the_radar', social: 18, observer: 25, reputation: 18, resistance: 20,
    tags: ['quiet_observer', 'under_the_radar_survival', 'social_instinct'], expectedRoles: ['float', 'shelter'],
    leaderLine: 'Nobody needs a title. Cover the essentials and keep moving.'
  },
  cirie: {
    leaderStyle: 'social', social: 28, consensus: 24, observer: 18, reputation: 20, resistance: 10,
    tags: ['social_connector', 'quiet_influence', 'strategic_threat'], expectedRoles: ['shelter', 'float'],
    leaderLine: 'Let’s pair up smart and make sure nobody gets left out.'
  },
  ozzy: {
    leaderStyle: 'provider', provider: 32, worker: 18, reputation: 17, resistance: 12,
    tags: ['provider_reputation', 'challenge_provider', 'useful_worker'], expectedRoles: ['resources', 'fire'],
    leaderLine: 'I’ll handle survival work. Get shelter moving beside me.'
  },
  tony: {
    leaderStyle: 'chaotic', command: 14, strategic: 25, chaos: 31, reputation: 23, resistance: 28,
    tags: ['chaotic_control', 'strategic_threat', 'idol_paranoia'], expectedRoles: ['wood', 'fire'],
    leaderLine: 'Move fast. I’ll keep every part of camp moving.'
  },
  parvati: {
    leaderStyle: 'social', social: 27, strategic: 18, reputation: 24, resistance: 14,
    tags: ['social_magnetism', 'charming_social_threat', 'pairing_concern'], expectedRoles: ['resources', 'float'],
    leaderLine: 'Pick your strength, find a partner, and make camp work.'
  },
  russell: {
    leaderStyle: 'forceful', command: 18, strategic: 25, chaos: 27, reputation: 25, resistance: 30,
    tags: ['forceful_control', 'strategic_threat', 'mistrust'], expectedRoles: ['fire', 'wood'],
    leaderLine: 'Stop standing around. Fire, shelter, wood, food—get moving.'
  },
  kim: {
    leaderStyle: 'consensus', consensus: 28, social: 19, strategic: 17, reputation: 20, resistance: 10,
    tags: ['calm_consensus_leader', 'quiet_control', 'social_threat'], expectedRoles: ['shelter', 'wood'],
    leaderLine: 'Let’s split the work and give every job enough support.'
  },
  yul: {
    leaderStyle: 'structured', consensus: 25, strategic: 23, social: 13, reputation: 20, resistance: 12,
    tags: ['calm_structured_leader', 'strategic_threat', 'trusted_planner'], expectedRoles: ['shelter', 'fire'],
    leaderLine: 'Shelter anchors camp. We’ll organize every other job around it.'
  },
  jeremy: {
    leaderStyle: 'steady', consensus: 23, social: 21, worker: 11, reputation: 17, resistance: 8,
    tags: ['steady_group_leader', 'social_connector', 'trusted_presence'], expectedRoles: ['shelter', 'wood'],
    leaderLine: 'Everybody take a lane. We’ll help wherever work falls behind.'
  },
  michele: {
    leaderStyle: 'under_the_radar', social: 20, observer: 16, reputation: 14, resistance: 10,
    tags: ['social_connector', 'quiet_observer', 'underestimated'], expectedRoles: ['shelter', 'float'],
    leaderLine: 'Let’s cover the basics and keep checking on each other.'
  },
  carolyn: {
    leaderStyle: 'emotional', social: 18, observer: 17, chaos: 10, reputation: 15, resistance: 18,
    tags: ['emotional_honesty', 'social_connector', 'unpredictable_energy'], expectedRoles: ['resources', 'shelter'],
    leaderLine: 'Say what you can do, then show everybody you mean it.'
  },
  tyson: {
    leaderStyle: 'dry_social', social: 15, observer: 18, strategic: 14, reputation: 17, resistance: 16,
    tags: ['wry_observer', 'strategic_threat', 'provider_reputation'], expectedRoles: ['wood', 'resources'],
    leaderLine: 'Five jobs, one camp. This should not require a committee.'
  },
  natalie: {
    leaderStyle: 'forceful', command: 14, worker: 19, strategic: 16, reputation: 17, resistance: 20,
    tags: ['competitive_worker', 'forceful_presence', 'strategic_threat'], expectedRoles: ['wood', 'resources'],
    leaderLine: 'Choose a job and attack it. We can adjust later.'
  },
  jay: {
    leaderStyle: 'social', social: 14, provider: 10, resistance: 14, reputation: 11,
    tags: ['social_connector', 'competitive_worker', 'adaptable'], expectedRoles: ['resources', 'wood'],
    leaderLine: 'Grab a job you’re good at and keep camp moving.'
  },
  andrea: {
    leaderStyle: 'steady', consensus: 12, social: 16, worker: 14, resistance: 10, reputation: 13,
    tags: ['balanced_worker', 'social_connector', 'quiet_competitor'], expectedRoles: ['shelter', 'resources'],
    leaderLine: 'Pick what you can finish. I’ll help wherever camp needs it.'
  },
  kelley: {
    leaderStyle: 'independent', observer: 18, strategic: 18, social: 12, resistance: 22, reputation: 18,
    tags: ['quiet_observer', 'independent_strategist', 'strategic_threat'], expectedRoles: ['wood', 'float'],
    leaderLine: 'Pick a job you can finish. Results matter more than titles.'
  },
  wendell: {
    leaderStyle: 'provider', provider: 20, worker: 20, consensus: 14, resistance: 8, reputation: 13,
    tags: ['shelter_specialist', 'useful_worker', 'steady_group_leader'], expectedRoles: ['shelter', 'wood'],
    leaderLine: 'Let’s build this right once and keep materials coming.'
  }
};

const ROLE_LABELS = {
  fire: 'Fire Builder',
  shelter: 'Shelter Builder',
  wood: 'Wood Gatherer',
  resources: 'Resource Gatherer',
  float: 'Float / Gap Filler'
};

function clamp(value, min = 0, max = 100) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, number));
}

function scoreValue(survivor, keys, fallback = 50) {
  for (const key of keys) {
    const value = key.split('.').reduce((result, part) => result?.[part], survivor);
    if (!Number.isFinite(value)) continue;
    // Most legacy cast attributes are 1–10, while a few derived values are 0–100.
    return clamp(value <= 10 ? value * 10 : value);
  }
  return fallback;
}

function descriptorText(survivor = {}) {
  return [
    survivor.name,
    survivor.firstName,
    survivor.gameplayStyle,
    survivor.personality,
    survivor.archetype,
    survivor.traitClass,
    ...(Array.isArray(survivor.personalityTraits) ? survivor.personalityTraits : [])
  ].filter(Boolean).join(' ').toLowerCase();
}

function blueprintFor(survivor = {}) {
  const firstName = String(survivor.firstName || survivor.name || '').toLowerCase();
  const exact = String(survivor.name || '').toLowerCase();
  return Object.entries(IDENTITY_BLUEPRINTS).find(([name]) => exact.includes(name) || firstName === name)?.[1] || {};
}

function highestRole(scores, expectedRoles = []) {
  const ranked = [
    ['fire', scores.fire],
    ['shelter', scores.shelter],
    ['wood', scores.wood],
    ['resources', scores.resources]
  ].sort((a, b) => b[1] - a[1]);
  const expected = expectedRoles.find(role => ranked.some(([rankedRole]) => rankedRole === role));
  return expected || ranked[0][0];
}

export function getDay1Identity(survivor = {}) {
  const blueprint = blueprintFor(survivor);
  const descriptors = descriptorText(survivor);
  const leadership = scoreValue(survivor, ['leader', 'leadership', 'social.leadership'], 45);
  const social = scoreValue(survivor, ['connections', 'likeability', 'charisma', 'social'], 50);
  const strength = scoreValue(survivor, ['strength', 'endurance', 'physical'], 45);
  const survival = scoreValue(survivor, ['fishing', 'firemaking', 'survival', 'awareness'], 45);
  const strategic = scoreValue(survivor, ['bigmove', 'deception', 'idolhunt', 'awareness'], 45);
  const risk = scoreValue(survivor, ['risk', 'aggression', 'paratend'], 45);
  const honesty = scoreValue(survivor, ['honesty'], 50);
  const workEthic = clamp(100 - scoreValue(survivor, ['laziness'], 45) + strength * 0.2);
  const styleBoost = {
    social: descriptors.includes('social') || descriptors.includes('charmer') ? 10 : 0,
    strategic: descriptors.includes('strateg') || descriptors.includes('power player') ? 9 : 0,
    provider: descriptors.includes('competitive') || descriptors.includes('physical') ? 8 : 0,
    chaos: descriptors.includes('wildcard') || descriptors.includes('paranoid') ? 12 : 0
  };
  const scores = {
    command: clamp(leadership * 0.62 + risk * 0.22 + social * 0.16 + (blueprint.command || 0)),
    consensus: clamp(leadership * 0.34 + social * 0.5 + honesty * 0.16 + (blueprint.consensus || 0)),
    social: clamp(social * 0.68 + strategic * 0.12 + (blueprint.social || 0) + styleBoost.social),
    provider: clamp(survival * 0.58 + strength * 0.42 + (blueprint.provider || 0) + styleBoost.provider),
    strategic: clamp(strategic * 0.73 + social * 0.12 + (blueprint.strategic || 0) + styleBoost.strategic),
    chaos: clamp(risk * 0.62 + (100 - honesty) * 0.18 + (blueprint.chaos || 0) + styleBoost.chaos),
    observer: clamp(scoreValue(survivor, ['awareness', 'focus', 'memory'], 50) * 0.63 + strategic * 0.2 + (blueprint.observer || 0)),
    worker: clamp(workEthic * 0.56 + strength * 0.27 + survival * 0.17 + (blueprint.worker || 0)),
    reputation: clamp((survivor.threat ?? 5) * 5 + strategic * 0.2 + (blueprint.reputation || 0)),
    fire: clamp(survival * 0.74 + leadership * 0.12 + risk * 0.14),
    shelter: clamp(strength * 0.55 + leadership * 0.27 + scoreValue(survivor, ['focus', 'memory'], 45) * 0.18),
    wood: clamp(strength * 0.64 + workEthic * 0.25 + survival * 0.11),
    resources: clamp(survival * 0.65 + strength * 0.2 + social * 0.15)
  };
  scores.resistance = clamp(risk * 0.38 + strategic * 0.27 + (100 - honesty) * 0.15 + (blueprint.resistance || 0));
  const tags = new Set(blueprint.tags || []);
  if (scores.command >= 70) tags.add('loud_command_leadership');
  if (scores.consensus >= 70) tags.add('calm_consensus_leadership');
  if (scores.social >= 70) tags.add('social_connector');
  if (scores.provider >= 70) tags.add('provider_reputation');
  if (scores.strategic >= 72 || scores.reputation >= 72) tags.add('strategic_threat');
  if (scores.chaos >= 72) tags.add('chaos_source');
  if (scores.observer >= 72) tags.add('quiet_observer');
  if (scores.worker >= 70) tags.add('useful_worker');

  const leaderStyle = blueprint.leaderStyle
    || (scores.command >= scores.consensus + 12 ? 'command'
      : scores.consensus >= 70 ? 'consensus'
        : scores.provider >= 72 ? 'provider'
          : scores.social >= 72 ? 'social'
            : 'under_the_radar');
  const practicalRole = highestRole(scores, blueprint.expectedRoles || []);

  return {
    survivor,
    id: survivor.id,
    name: survivor.firstName || survivor.name || 'Someone',
    leaderStyle,
    scores,
    tags: [...tags],
    expectedRoles: [...(blueprint.expectedRoles || [])],
    leaderLine: blueprint.leaderLine || null,
    practicalRole,
    practicalRoleLabel: ROLE_LABELS[practicalRole],
    reputationRead: scores.reputation >= 72
      ? 'already carries a reputation that makes people look twice'
      : scores.provider >= 72
        ? 'looks like someone the tribe expects to help immediately'
        : scores.social >= 72
          ? 'draws people in without needing to announce it'
          : 'has room to define their own first impression'
  };
}

function highestDistinct(profiles, metric, excluded) {
  return profiles
    .filter(profile => !excluded.has(profile.id))
    .sort((a, b) => b.scores[metric] - a.scores[metric] || String(a.id).localeCompare(String(b.id)))[0] || null;
}

export function scanDay1Tribe(members = []) {
  const profiles = members.map(getDay1Identity);
  const used = new Set();
  const spotlights = [
    ['leader', 'command'],
    ['provider', 'provider'],
    ['connector', 'social'],
    ['observer', 'observer'],
    ['wildcard', 'chaos']
  ].map(([kind, metric]) => {
    const profile = highestDistinct(profiles, metric, used);
    if (!profile) return null;
    used.add(profile.id);
    return { kind, profile };
  }).filter(Boolean);

  return { profiles, spotlights };
}

export function resolveDay1Leadership(members = [], player = null, scan = scanDay1Tribe(members), context = {}) {
  const averagePairValue = (profile, getter, fallback = 50) => {
    if (typeof getter !== 'function') return fallback;
    const others = members.filter(member => String(member.id) !== String(profile.id));
    if (!others.length) return fallback;
    const values = others.map(member => Number(getter(profile.id, member.id))).filter(Number.isFinite);
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : fallback;
  };
  const leaders = scan.profiles.map(profile => {
    const relationship = averagePairValue(profile, context.getRelationship);
    const trust = averagePairValue(profile, context.getTrust);
    const suspicion = Number(context.getSuspicion?.(profile.survivor) ?? profile.survivor?.suspicion ?? 0);
    const operationalFit = ['command', 'forceful', 'chaotic'].includes(profile.leaderStyle)
      ? 8
      : ['consensus', 'structured', 'steady', 'provider'].includes(profile.leaderStyle)
        ? 6
        : profile.leaderStyle === 'social'
          ? -2
          : -7;
    return {
      profile,
      score: clamp(
        profile.scores.command * 0.38
        + profile.scores.consensus * 0.3
        + profile.scores.provider * 0.17
        + profile.scores.worker * 0.08
        + profile.scores.social * 0.07
        + (relationship - 50) * 0.08
        + (trust - 50) * 0.08
        + operationalFit
        - Math.max(0, profile.scores.chaos - 72) * 0.12
        - Math.max(0, suspicion) * 0.05
      )
    };
  }).sort((a, b) => b.score - a.score || String(a.profile.id).localeCompare(String(b.profile.id)));
  const top = leaders[0];
  const runner = leaders[1] || null;
  const playerEntry = leaders.find(entry => String(entry.profile.id) === String(player?.id));
  const contested = Boolean(runner && Math.abs(top.score - runner.score) <= 8);
  const playerLeads = Boolean(playerEntry && top && String(top.profile.id) === String(player.id) && !contested);
  const scenario = playerLeads ? 'player_leads' : contested ? 'contested' : 'npc_leads';
  const style = top?.profile.leaderStyle || 'under_the_radar';
  const quietResistor = scan.profiles
    .filter(profile => String(profile.id) !== String(top?.profile.id))
    .sort((a, b) => b.scores.resistance - a.scores.resistance || b.scores.observer - a.scores.observer || String(a.id).localeCompare(String(b.id)))[0] || null;
  const leadershipStatus = contested
    ? 'contested'
    : quietResistor?.scores.resistance >= 78 || top?.profile.scores.chaos >= 82
      ? 'resisted'
      : 'accepted';
  const acceptance = top?.profile.scores.chaos >= 72
    ? 'useful, but people are already wary of where the energy could go'
    : top?.profile.scores.reputation >= 72 || top?.profile.scores.command >= 75
      ? 'people listen, while a few quietly measure the cost of giving up control'
      : 'the group accepts the direction without making it official';

  return {
    topLeader: top?.profile?.survivor || null,
    operationalLeader: top?.profile?.survivor || null,
    runnerUp: runner?.profile?.survivor || null,
    rival: runner?.profile?.survivor || null,
    quietResistor: quietResistor?.survivor || null,
    socialCenter: [...scan.profiles].sort((a, b) => b.scores.social - a.scores.social || String(a.id).localeCompare(String(b.id)))[0]?.survivor || null,
    practicalProvider: [...scan.profiles].sort((a, b) => b.scores.provider - a.scores.provider || String(a.id).localeCompare(String(b.id)))[0]?.survivor || null,
    topProfile: top?.profile || null,
    runnerProfile: runner?.profile || null,
    candidates: leaders,
    scenario,
    leadershipStatus,
    contestedPair: contested ? [top.profile.survivor, runner.profile.survivor] : null,
    style,
    score: top?.score || 0,
    acceptance,
    leadershipRead: `${top?.profile?.name || 'Someone'} is setting the first tempo — ${acceptance}.`
  };
}

export function getContextualLeadershipDecision({ leadership, player } = {}) {
  const playerEntry = leadership?.candidates?.find(entry => String(entry.profile.id) === String(player?.id));
  const topEntry = leadership?.candidates?.[0];
  if (!playerEntry || !topEntry) return null;
  const rank = leadership.candidates.findIndex(entry => entry === playerEntry);
  const involved = rank <= 1 && topEntry.score - playerEntry.score <= 12;
  if (!involved) return null;
  const playerProfile = playerEntry.profile;
  const currentLeader = leadership.topLeader;
  const playerIsLeader = String(currentLeader?.id) === String(player?.id);
  const alternate = playerIsLeader ? leadership.runnerUp : currentLeader;
  const leadLabel = playerProfile.leaderStyle === 'provider'
    ? 'Direct survival work'
    : ['social', 'consensus', 'steady'].includes(playerProfile.leaderStyle)
      ? 'Guide the group'
      : 'Take the lead';
  const options = [{ key: 'take_lead', label: leadLabel }];
  if (alternate) options.push({ key: 'back_leader', label: `Back ${alternate.firstName || alternate.name}` });
  options.push({ key: 'stay_out', label: 'Stay out of it' });
  return { options: options.slice(0, 3), playerIsLeader, alternateLeader: alternate || null };
}

export function applyLeadershipDecision(leadership, player, action = 'automatic') {
  if (!leadership || !player || action === 'automatic') return { ...leadership, leadershipAction: action };
  if (action !== 'take_lead') {
    const playerWasLeader = String(leadership.topLeader?.id) === String(player.id);
    if (playerWasLeader && leadership.runnerUp) {
      const alternate = leadership.runnerUp;
      const alternateEntry = leadership.candidates?.find(entry => String(entry.profile.id) === String(alternate.id));
      return {
        ...leadership,
        topLeader: alternate,
        operationalLeader: alternate,
        topProfile: alternateEntry?.profile || getDay1Identity(alternate),
        runnerUp: player,
        rival: player,
        scenario: 'npc_leads',
        style: alternateEntry?.profile?.leaderStyle || getDay1Identity(alternate).leaderStyle,
        leadershipAction: action,
        leadershipStatus: action === 'back_leader' ? 'accepted' : 'resisted',
        leadershipRead: `${alternate.firstName || alternate.name} took over camp direction after the player stepped aside.`
      };
    }
    return {
      ...leadership,
      leadershipAction: action,
      leadershipStatus: action === 'back_leader' ? 'accepted' : leadership.leadershipStatus
    };
  }
  const previousLeader = leadership.topLeader;
  const playerEntry = leadership.candidates?.find(entry => String(entry.profile.id) === String(player.id));
  return {
    ...leadership,
    topLeader: player,
    operationalLeader: player,
    topProfile: playerEntry?.profile || getDay1Identity(player),
    runnerUp: String(previousLeader?.id) === String(player.id) ? leadership.runnerUp : previousLeader,
    rival: String(previousLeader?.id) === String(player.id) ? leadership.rival : previousLeader,
    scenario: 'player_leads',
    style: playerEntry?.profile?.leaderStyle || getDay1Identity(player).leaderStyle,
    leadershipStatus: String(previousLeader?.id) === String(player.id) ? leadership.leadershipStatus : 'contested',
    leadershipAction: action,
    leadershipRead: `${player.firstName || player.name} took responsibility for directing the first camp setup.`
  };
}

export function getDay1LeaderLine(profileOrSurvivor) {
  const profile = profileOrSurvivor?.scores ? profileOrSurvivor : getDay1Identity(profileOrSurvivor);
  if (profile.leaderLine) return profile.leaderLine;
  const lines = {
    command: 'Shelter first. Fire and food move at the same time.',
    forceful: 'Split up now. Shelter, fire, wood, and food—move.',
    chaotic: 'Let’s move fast. I’ll keep the pieces from falling apart.',
    consensus: 'Let’s split the work and make sure every job has support.',
    structured: 'Shelter anchors camp. Let’s assign the rest around it.',
    steady: 'Everybody take a lane. We’ll check in once camp is moving.',
    provider: 'I’ll handle survival work. Let’s get shelter and fire covered.',
    social: 'Nobody needs a title. We just need every job covered.',
    emotional: 'Say what you can do, then let’s actually do it.',
    independent: 'Pick a job you can finish. We need results, not titles.',
    dry_social: 'Five jobs, one camp. This should not require a committee.',
    under_the_radar: 'Let’s cover the essentials and keep everybody moving.'
  };
  return lines[profile.leaderStyle] || lines.under_the_radar;
}
