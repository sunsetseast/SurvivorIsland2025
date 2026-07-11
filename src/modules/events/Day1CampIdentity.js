// Day 1 needs to read a cast as people, not as a single leadership number.
// This module stays data-first so the cinematic can use the same read for
// narration, consequences, memory, and later systems.

const IDENTITY_BLUEPRINTS = {
  'boston rob': {
    leaderStyle: 'command', command: 26, strategic: 16, reputation: 24,
    tags: ['command_leader', 'controlling_leader', 'strategic_legend'], expectedRoles: ['shelter', 'fire']
  },
  sandra: {
    leaderStyle: 'under_the_radar', social: 18, observer: 25, reputation: 18,
    tags: ['quiet_observer', 'under_the_radar_survival', 'social_instinct'], expectedRoles: ['float', 'shelter']
  },
  cirie: {
    leaderStyle: 'social', social: 28, consensus: 24, observer: 18, reputation: 20,
    tags: ['social_connector', 'quiet_influence', 'strategic_threat'], expectedRoles: ['shelter', 'float']
  },
  ozzy: {
    leaderStyle: 'provider', provider: 32, worker: 18, reputation: 17,
    tags: ['provider_reputation', 'challenge_provider', 'useful_worker'], expectedRoles: ['resources', 'fire']
  },
  tony: {
    leaderStyle: 'chaotic', command: 14, strategic: 25, chaos: 31, reputation: 23,
    tags: ['chaotic_control', 'strategic_threat', 'idol_paranoia'], expectedRoles: ['wood', 'fire']
  },
  parvati: {
    leaderStyle: 'social', social: 27, strategic: 18, reputation: 24,
    tags: ['social_magnetism', 'charming_social_threat', 'pairing_concern'], expectedRoles: ['resources', 'float']
  },
  russell: {
    leaderStyle: 'forceful', command: 18, strategic: 25, chaos: 27, reputation: 25,
    tags: ['forceful_control', 'strategic_threat', 'mistrust'], expectedRoles: ['fire', 'wood']
  },
  kim: {
    leaderStyle: 'consensus', consensus: 28, social: 19, strategic: 17, reputation: 20,
    tags: ['calm_consensus_leader', 'quiet_control', 'social_threat'], expectedRoles: ['shelter', 'wood']
  },
  yul: {
    leaderStyle: 'structured', consensus: 25, strategic: 23, social: 13, reputation: 20,
    tags: ['calm_structured_leader', 'strategic_threat', 'trusted_planner'], expectedRoles: ['shelter', 'fire']
  },
  jeremy: {
    leaderStyle: 'steady', consensus: 23, social: 21, worker: 11, reputation: 17,
    tags: ['steady_group_leader', 'social_connector', 'trusted_presence'], expectedRoles: ['shelter', 'wood']
  },
  michele: {
    leaderStyle: 'under_the_radar', social: 20, observer: 16, reputation: 14,
    tags: ['social_connector', 'quiet_observer', 'underestimated'], expectedRoles: ['shelter', 'float']
  },
  carolyn: {
    leaderStyle: 'emotional', social: 18, observer: 17, chaos: 10, reputation: 15,
    tags: ['emotional_honesty', 'social_connector', 'unpredictable_energy'], expectedRoles: ['resources', 'shelter']
  },
  tyson: {
    leaderStyle: 'dry_social', social: 15, observer: 18, strategic: 14, reputation: 17,
    tags: ['wry_observer', 'strategic_threat', 'provider_reputation'], expectedRoles: ['wood', 'resources']
  },
  natalie: {
    leaderStyle: 'forceful', command: 14, worker: 19, strategic: 16, reputation: 17,
    tags: ['competitive_worker', 'forceful_presence', 'strategic_threat'], expectedRoles: ['wood', 'resources']
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

export function resolveDay1Leadership(members = [], player = null, scan = scanDay1Tribe(members)) {
  const leaders = scan.profiles.map(profile => ({
    profile,
    score: clamp(
      profile.scores.command * 0.44
      + profile.scores.consensus * 0.34
      + profile.scores.provider * 0.12
      + profile.scores.social * 0.1
      - Math.max(0, profile.scores.chaos - 68) * 0.12
    )
  })).sort((a, b) => b.score - a.score || String(a.profile.id).localeCompare(String(b.profile.id)));
  const top = leaders[0];
  const runner = leaders[1] || null;
  const playerEntry = leaders.find(entry => String(entry.profile.id) === String(player?.id));
  const contested = Boolean(runner && Math.abs(top.score - runner.score) <= 9 && top.score >= 54);
  const scattered = Boolean(top && top.score < 51);
  const playerLeads = Boolean(playerEntry && top && String(top.profile.id) === String(player.id) && !contested && !scattered);
  const scenario = scattered ? 'scattered' : playerLeads ? 'player_leads' : contested ? 'contested' : 'npc_leads';
  const style = top?.profile.leaderStyle || 'under_the_radar';
  const acceptance = top?.profile.scores.chaos >= 72
    ? 'useful, but people are already wary of where the energy could go'
    : top?.profile.scores.reputation >= 72 || top?.profile.scores.command >= 75
      ? 'people listen, while a few quietly measure the cost of giving up control'
      : 'the group accepts the direction without making it official';

  return {
    topLeader: top?.profile?.survivor || null,
    runnerUp: runner?.profile?.survivor || null,
    topProfile: top?.profile || null,
    runnerProfile: runner?.profile || null,
    scenario,
    contestedPair: contested ? [top.profile.survivor, runner.profile.survivor] : null,
    style,
    score: top?.score || 0,
    acceptance,
    leadershipRead: scattered
      ? 'No one has claimed the center of camp yet; the tribe is moving before it agrees on how.'
      : `${top?.profile?.name || 'Someone'} is setting the first tempo — ${acceptance}.`
  };
}

function closestProfile(scan, playerId, predicate) {
  return scan.profiles.filter(profile => String(profile.id) !== String(playerId)).filter(predicate)
    .sort((a, b) => (b.scores.social + b.scores.observer) - (a.scores.social + a.scores.observer))[0] || null;
}

export function resolveFirstImpression({ player, choiceKey, scan, leadership }) {
  const profile = scan.profiles.find(item => String(item.id) === String(player?.id)) || getDay1Identity(player);
  const leader = leadership.topProfile;
  const socialTarget = closestProfile(scan, player?.id, item => item.scores.social >= 55) || leader;
  const opposition = closestProfile(scan, player?.id, item => item.scores.observer >= 60 || item.scores.strategic >= 60) || leader;
  const identityDanger = profile.scores.reputation >= 70 || profile.scores.strategic >= 72;
  const templates = {
    take_charge: {
      label: 'Take charge', posture: 'visible_leader', summary: 'You gave the tribe a plan before the silence could harden.',
      tags: ['first_impression', 'day1_leadership', 'visible_leader'], effects: { teamPlayer: 3, threat: identityDanger ? 2 : 1, suspicion: identityDanger ? 2 : 1, visibility: 3 },
      strategicMeaning: 'You became part of the tribe’s early power map.', futureHook: 'People will remember whether your leadership solved a problem or claimed too much space.'
    },
    work_hard: {
      label: 'Work hard and stay useful', posture: 'useful_worker', summary: 'You made usefulness the first thing people could say about you.',
      tags: ['first_impression', 'useful_worker'], effects: { teamPlayer: 4, threat: profile.scores.provider >= 70 ? 1 : 0, suspicion: 0, visibility: 1 },
      strategicMeaning: 'You bought social capital through labor, with expectations attached.', futureHook: 'The tribe will notice if the work stops matching the promise.'
    },
    support_leader: {
      label: 'Support the emerging leader', posture: 'steady_support', summary: 'You reinforced momentum without demanding the center of the frame.',
      tags: ['first_impression', 'steady_support', 'team_player'], effects: { teamPlayer: 2, threat: -1, suspicion: -1, visibility: 0 },
      strategicMeaning: 'You are easier to work with now, but someone else has the visible authority.', futureHook: 'Your support can become trust — or a debt the leader expects you to honor.'
    },
    observe: {
      label: 'Hang back and observe', posture: 'quiet_observer', summary: 'You let everyone else show their hand first.',
      tags: ['first_impression', 'quiet_observer', 'under_the_radar'], effects: { teamPlayer: profile.leaderStyle === 'under_the_radar' ? 1 : -1, threat: -1, suspicion: profile.scores.worker < 55 ? 1 : 0, visibility: -2 },
      strategicMeaning: 'You kept your profile low while collecting information.', futureHook: 'A watcher can look smart later — or look absent if camp work goes sideways.'
    },
    bond_early: {
      label: 'Bond with someone early', posture: 'social_connector', summary: 'You found one person in the noise and made camp feel smaller.',
      tags: ['first_impression', 'early_bond', 'social_connector'], effects: { teamPlayer: 1, threat: profile.scores.reputation >= 70 ? 1 : 0, suspicion: profile.tags.includes('social_magnetism') ? 1 : 0, visibility: 1 },
      strategicMeaning: 'You created a private line before the tribe had a public structure.', futureHook: 'That first connection may become trust — and may draw attention as a pairing.'
    },
    push_back: {
      label: 'Push back on the loudest voice', posture: 'independent', summary: 'You refused to let the first loud plan become the only plan.',
      tags: ['first_impression', 'contested_leadership', 'independent'], effects: { teamPlayer: 0, threat: 1, suspicion: 2, visibility: 2 },
      strategicMeaning: 'You made it clear that authority will be negotiated, not assumed.', futureHook: 'The disagreement can become mutual respect or the first name people compare against the leader.'
    }
  };
  const selected = templates[choiceKey] || templates.observe;
  return {
    ...selected,
    key: choiceKey in templates ? choiceKey : 'observe',
    playerProfile: profile,
    socialTarget: socialTarget?.survivor || null,
    opposition: opposition?.survivor || null,
    leadershipStyleFit: profile.leaderStyle,
    identityNote: profile.leaderStyle === 'provider' && choiceKey === 'work_hard'
      ? 'It matches what this tribe already expects from you — which raises the bar for delivery.'
      : profile.leaderStyle === 'under_the_radar' && choiceKey === 'observe'
        ? 'It reads as patience rather than disappearance.'
        : profile.leaderStyle === 'social' && choiceKey === 'bond_early'
          ? 'It puts your natural social gravity on display early.'
          : identityDanger && ['take_charge', 'push_back'].includes(choiceKey)
            ? 'Your reputation makes the same move feel bigger than it would from someone unknown.'
            : 'The tribe is already deciding what this signal means.'
  };
}

function reactionText(reaction, firstImpression, npcName) {
  const name = npcName || 'Someone';
  const byPosture = {
    take_charge: {
      respect: `${name} gives a small nod. The plan has a shape now.`,
      wary: `${name} watches the way you take space. Useful is one thing; control is another.`,
      tension: `${name} does not argue, but the look says they will not be managed.`
    },
    work_hard: {
      respect: `${name} notices that you are already carrying your share.`,
      wary: `${name} likes the effort, but clocks how visible it makes you.`,
      tension: `${name} matches your pace without giving you much credit for it.`
    },
    support_leader: {
      respect: `${name} relaxes a little when you help the group move.`,
      wary: `${name} wonders whether your support is loyalty or positioning.`,
      tension: `${name} hears the agreement and still keeps their own counsel.`
    },
    observe: {
      respect: `${name} catches you listening before you speak.`,
      wary: `${name} notices you are watching more than you are volunteering.`,
      tension: `${name} glances your way when the work starts and you stay quiet.`
    },
    bond_early: {
      respect: `${name} answers your opening with an easy rhythm.`,
      wary: `${name} notices how quickly people are drawn into your orbit.`,
      tension: `${name} sees the connection forming and makes a note of it.`
    },
    push_back: {
      respect: `${name} appreciates that someone said the quiet part out loud.`,
      wary: `${name} watches for the argument to become a pattern.`,
      tension: `${name} hears the challenge and files it away as an early fault line.`
    }
  };
  return byPosture[firstImpression.key]?.[reaction] || `${name} takes in the moment without showing much.`;
}

export function buildDay1Reactions({ members = [], player, scan, leadership, firstImpression }) {
  const playerId = player?.id;
  const candidates = scan.profiles.filter(profile => String(profile.id) !== String(playerId));
  const leaderId = leadership.topLeader?.id;
  const picks = [];
  const add = (profile, reason) => {
    if (!profile || picks.some(item => String(item.profile.id) === String(profile.id))) return;
    picks.push({ profile, reason });
  };
  add(candidates.find(profile => String(profile.id) === String(leaderId)), 'leader');
  add(firstImpression.socialTarget && candidates.find(profile => String(profile.id) === String(firstImpression.socialTarget.id)), 'connector');
  add(candidates.slice().sort((a, b) => b.scores.observer - a.scores.observer)[0], 'observer');
  add(candidates.slice().sort((a, b) => b.scores.provider - a.scores.provider)[0], 'provider');
  add(candidates.slice().sort((a, b) => b.scores.strategic - a.scores.strategic)[0], 'strategist');

  return picks.slice(0, 4).map(({ profile, reason }) => {
    let score = profile.scores.social * 0.05 + profile.scores.worker * 0.02;
    if (firstImpression.key === 'work_hard') score += profile.scores.worker * 0.06;
    if (firstImpression.key === 'bond_early') score += profile.scores.social * 0.06;
    if (firstImpression.key === 'observe') score += profile.scores.observer * 0.03 - profile.scores.worker * 0.03;
    if (['take_charge', 'push_back'].includes(firstImpression.key)) score -= profile.scores.strategic * 0.04;
    if (String(profile.id) === String(leaderId) && ['take_charge', 'push_back'].includes(firstImpression.key)) score -= 3;
    if (firstImpression.key === 'bond_early' && profile.tags.includes('pairing_concern')) score -= 3;
    if (['fire', 'resources'].includes(firstImpression.roleKey) && firstImpression.playerProfile?.scores.provider >= 65) {
      score += profile.scores.provider >= 60 ? 3 : 1;
    }
    if (firstImpression.roleKey === 'float' && firstImpression.key === 'observe' && profile.scores.worker >= 65) score -= 3;
    if (firstImpression.roleKey === 'shelter' && firstImpression.key === 'take_charge' && String(profile.id) === String(leaderId)) score -= 3;
    const type = score >= 5 ? 'respect' : score <= -4 ? 'tension' : 'wary';
    const relationshipImpact = type === 'respect' ? 4 : type === 'tension' ? -4 : -1;
    const trustImpact = type === 'respect' ? 3 : type === 'tension' ? -3 : -1;
    const suspicionImpact = type === 'respect' ? 0 : type === 'tension' ? 3 : 1;
    return {
      type,
      reason,
      npc: profile.survivor,
      npcProfile: profile,
      text: reactionText(type, firstImpression, profile.name),
      relationshipImpact,
      trustImpact,
      suspicionImpact,
      visibilityImpact: type === 'respect' ? 1 : type === 'tension' ? 2 : 1,
      tag: type === 'respect' ? 'early_respect' : type === 'tension' ? 'early_tension' : 'dangerous_first_impression'
    };
  });
}

export function createDay1MemoryRecords({ day = 1, phase = null, player, leadership, firstImpression, playerRoleKey, reactions = [], chemistryMoments = [], mood = 'tentative' }) {
  const eventId = 'day1_first_impressions';
  const leader = leadership.topLeader;
  const records = [];
  const add = ({ type, actorId, targetId = null, relatedIds = [], summary, tags = [], emotionalTone = mood, strategicMeaning, relationshipImpact = 0, trustImpact = 0, suspicionImpact = 0, visibilityImpact = 0, futureHook }) => {
    records.push({
      id: `${eventId}:${type}:${actorId ?? 'tribe'}:${targetId ?? (relatedIds.join('-') || 'none')}`,
      eventId,
      day,
      phase,
      type,
      actorId,
      targetId,
      relatedIds: [...new Set(relatedIds.filter(id => id != null))],
      summary,
      tags: [...new Set(['day1_camp_opening', ...tags])],
      emotionalTone,
      strategicMeaning,
      relationshipImpact,
      trustImpact,
      suspicionImpact,
      visibilityImpact,
      futureHook
    });
  };

  if (leader?.id != null) {
    add({
      type: 'unofficial_leader', actorId: leader.id, targetId: player?.id,
      relatedIds: [leadership.runnerUp?.id].filter(Boolean),
      summary: leadership.leadershipRead,
      tags: ['day1_leadership', leadership.scenario, leadership.style],
      strategicMeaning: leadership.scenario === 'contested' ? 'Authority is already contested.' : 'The tribe has an early reference point for direction.',
      suspicionImpact: leadership.style === 'chaotic' || leadership.style === 'forceful' ? 1 : 0,
      futureHook: 'Leadership at camp can become a source of trust, resentment, or a future target.'
    });
  }

  add({
    type: 'player_first_impression', actorId: player?.id, targetId: firstImpression.socialTarget?.id || null,
    relatedIds: [leader?.id].filter(Boolean), summary: firstImpression.summary,
    tags: firstImpression.tags,
    strategicMeaning: firstImpression.strategicMeaning,
    relationshipImpact: firstImpression.key === 'bond_early' ? 4 : 0,
    trustImpact: firstImpression.key === 'support_leader' ? 2 : 0,
    suspicionImpact: firstImpression.effects.suspicion,
    visibilityImpact: firstImpression.effects.visibility,
    futureHook: firstImpression.futureHook
  });
  add({
    type: 'camp_role', actorId: player?.id, relatedIds: [leader?.id].filter(Boolean),
    summary: `The player took the ${ROLE_LABELS[playerRoleKey] || playerRoleKey || 'camp'} role after choosing to ${firstImpression.label.toLowerCase()}. ${firstImpression.combinedRead || ''}`.trim(),
    tags: ['camp_role', playerRoleKey || 'float', firstImpression.posture],
    strategicMeaning: 'The role creates a visible expectation for how the player contributes.',
    futureHook: 'Camp work will either validate the first impression or give the tribe a reason to revise it.'
  });
  reactions.forEach(reaction => add({
    type: reaction.type === 'respect' ? 'early_respect' : reaction.type === 'tension' ? 'early_tension' : 'first_impression_watch',
    actorId: player?.id, targetId: reaction.npc?.id, relatedIds: [leader?.id].filter(Boolean), summary: reaction.text,
    tags: ['first_impression', reaction.tag, ...reaction.npcProfile.tags.slice(0, 2)],
    strategicMeaning: reaction.type === 'respect' ? 'An early relationship gained momentum.' : reaction.type === 'tension' ? 'A social fault line appeared before the tribe settled.' : 'The player’s first move is being watched for a pattern.',
    relationshipImpact: reaction.relationshipImpact, trustImpact: reaction.trustImpact,
    suspicionImpact: reaction.suspicionImpact, visibilityImpact: reaction.visibilityImpact,
    futureHook: reaction.type === 'respect' ? 'This person may be easier to approach later.' : 'This person will remember the signal behind the choice.'
  }));
  chemistryMoments.forEach(moment => add({
    type: moment.type === 'bond' ? 'early_bond' : 'camp_tension', actorId: moment.pair?.[0]?.id,
    targetId: moment.pair?.[1]?.id, relatedIds: (moment.pair || []).map(person => person?.id),
    summary: moment.type === 'bond' ? 'Working together created an early camp bond.' : 'The first camp assignments exposed tension.',
    tags: [moment.tag || moment.type],
    strategicMeaning: moment.type === 'bond' ? 'Shared labor created a possible social bridge.' : 'Shared labor created a possible pressure point.',
    relationshipImpact: moment.delta || 0, trustImpact: moment.type === 'bond' ? 2 : -2,
    futureHook: 'The camp partnership can surface again in later conversations and decisions.'
  }));
  return records;
}

export { ROLE_LABELS };
