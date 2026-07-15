import { getDay1Identity, scanDay1Tribe } from './Day1CampIdentity.js';

export const DAY1_ROLE_DEFINITIONS = Object.freeze({
  fire: { label: 'Fire', title: 'Fire Builder', description: 'Build and maintain the tribe’s fire.' },
  shelter: { label: 'Shelter', title: 'Shelter Builder', description: 'Construct the sleeping shelter.' },
  wood: { label: 'Wood', title: 'Wood Gatherer', description: 'Gather bamboo and firewood.' },
  resources: { label: 'Resources', title: 'Resource Gatherer', description: 'Search for food, water, and usable materials.' },
  float: { label: 'Flex', title: 'Flex', description: 'Fill whichever task needs help.' }
});

export const DAY1_ROLE_KEYS = Object.freeze(Object.keys(DAY1_ROLE_DEFINITIONS));

function normalizeId(value) {
  return value == null ? null : String(typeof value === 'object' ? value.id : value);
}

function roleConfiguration(tribeSize) {
  const large = tribeSize >= 9;
  return {
    capacity: {
      fire: 1,
      shelter: 2,
      wood: large ? 3 : 2,
      resources: large ? 2 : 1,
      float: tribeSize
    },
    required: {
      fire: 1,
      shelter: Math.min(2, Math.max(1, tribeSize - 3)),
      wood: 1,
      resources: 1,
      float: tribeSize >= 6 ? 1 : 0
    },
    preferred: {
      fire: 1,
      shelter: 2,
      wood: large ? 2 : 1,
      resources: large ? 2 : 1,
      float: large ? 2 : 1
    }
  };
}

function roleScore(profile, roleKey, { leaderId = null, currentRoleProfiles = [] } = {}) {
  const base = profile.scores?.[roleKey] ?? 50;
  let score = base;
  if (profile.practicalRole === roleKey) score += 20;
  if (profile.expectedRoles?.includes(roleKey)) score += 12;
  if (roleKey === 'resources' && profile.tags.includes('provider_reputation')) score += 15;
  if (roleKey === 'shelter' && normalizeId(profile.id) === normalizeId(leaderId)) score += 10;
  if (roleKey === 'fire' && ['command', 'forceful', 'chaotic'].includes(profile.leaderStyle)) score += 4;
  if (roleKey === 'float') {
    score = profile.scores.observer * 0.48 + profile.scores.social * 0.32 + (100 - profile.scores.worker) * 0.2;
    if (profile.tags.includes('under_the_radar_survival')) score += 18;
  }
  if (roleKey === 'shelter' && currentRoleProfiles.length) {
    const partner = currentRoleProfiles[0];
    const workBalance = 100 - Math.abs(profile.scores.worker - partner.scores.worker);
    const socialBalance = (profile.scores.social + partner.scores.social) / 2;
    score += workBalance * 0.08 + socialBalance * 0.07;
  }
  return score;
}

function sortCandidates(candidates, roleKey, context) {
  return [...candidates].sort((a, b) => {
    const scoreDelta = roleScore(b, roleKey, context) - roleScore(a, roleKey, context);
    if (Math.abs(scoreDelta) > 0.0001) return scoreDelta;
    return normalizeId(a.id).localeCompare(normalizeId(b.id));
  });
}

function emptyAssignments() {
  return { fire: [], shelter: [], wood: [], resources: [], float: [] };
}

// Reserve specialized providers and builders before the general work roles.
// This prevents a strong provider (for example Ozzy) from being consumed by
// the first adequate Fire slot before Resources is evaluated.
const ASSIGNMENT_PRIORITY = Object.freeze(['resources', 'shelter', 'fire', 'wood', 'float']);

function assignProfile(assignments, profile, roleKey) {
  if (!profile || !DAY1_ROLE_KEYS.includes(roleKey)) return false;
  if (Object.values(assignments).some(list => list.some(entry => normalizeId(entry.id) === normalizeId(profile.id)))) return false;
  assignments[roleKey].push(profile);
  return true;
}

function fillRole({ assignments, unassigned, roleKey, target, config, leaderId }) {
  while (assignments[roleKey].length < target && assignments[roleKey].length < config.capacity[roleKey] && unassigned.length) {
    const currentRoleProfiles = assignments[roleKey];
    const candidate = sortCandidates(unassigned, roleKey, { leaderId, currentRoleProfiles })[0];
    if (!candidate) break;
    assignProfile(assignments, candidate, roleKey);
    const index = unassigned.findIndex(profile => normalizeId(profile.id) === normalizeId(candidate.id));
    if (index >= 0) unassigned.splice(index, 1);
  }
}

function assignmentIds(assignments) {
  return Object.fromEntries(DAY1_ROLE_KEYS.map(roleKey => [roleKey, assignments[roleKey].map(profile => profile.id)]));
}

export function validateDay1Assignments(assignments, members = [], { requireCoverage = true } = {}) {
  const ids = DAY1_ROLE_KEYS.flatMap(roleKey => assignments?.[roleKey] || []).map(normalizeId);
  const memberIds = members.map(normalizeId);
  const unique = new Set(ids);
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
  const missing = memberIds.filter(id => !unique.has(id));
  const extras = ids.filter(id => !memberIds.includes(id));
  const coverage = {
    fire: (assignments?.fire || []).length >= 1,
    shelter: (assignments?.shelter || []).length >= Math.min(2, Math.max(1, members.length - 3)),
    wood: (assignments?.wood || []).length >= 1,
    resources: (assignments?.resources || []).length >= 1,
    float: members.length < 6 || (assignments?.float || []).length >= 1
  };
  return {
    valid: duplicates.length === 0 && missing.length === 0 && extras.length === 0 && (!requireCoverage || Object.values(coverage).every(Boolean)),
    duplicates: [...new Set(duplicates)],
    missing,
    extras,
    coverage
  };
}

export function resolveDay1Assignments({ members = [], playerId = null, requestedRole = null, scan = null, leaderId = null } = {}) {
  const resolvedScan = scan || scanDay1Tribe(members);
  const profiles = resolvedScan.profiles || members.map(getDay1Identity);
  const config = roleConfiguration(members.length);
  const assignments = emptyAssignments();
  const normalizedRequestedRole = DAY1_ROLE_KEYS.includes(requestedRole) ? requestedRole : null;
  const playerProfile = profiles.find(profile => normalizeId(profile.id) === normalizeId(playerId)) || null;
  const unassigned = [...profiles];

  if (playerProfile && normalizedRequestedRole) {
    assignProfile(assignments, playerProfile, normalizedRequestedRole);
    const playerIndex = unassigned.findIndex(profile => normalizeId(profile.id) === normalizeId(playerId));
    if (playerIndex >= 0) unassigned.splice(playerIndex, 1);
  }

  ASSIGNMENT_PRIORITY.forEach(roleKey => {
    fillRole({ assignments, unassigned, roleKey, target: config.required[roleKey], config, leaderId });
  });
  ASSIGNMENT_PRIORITY.forEach(roleKey => {
    fillRole({ assignments, unassigned, roleKey, target: config.preferred[roleKey], config, leaderId });
  });
  while (unassigned.length) {
    const profile = unassigned.shift();
    const openRole = DAY1_ROLE_KEYS
      .filter(roleKey => assignments[roleKey].length < config.capacity[roleKey])
      .sort((a, b) => roleScore(profile, b, { leaderId, currentRoleProfiles: assignments[b] }) - roleScore(profile, a, { leaderId, currentRoleProfiles: assignments[a] }))[0]
      || 'float';
    assignProfile(assignments, profile, openRole);
  }

  const ids = assignmentIds(assignments);
  const integrity = validateDay1Assignments(ids, members);
  if (!integrity.valid) {
    throw new Error(`Invalid Day 1 assignments: ${JSON.stringify(integrity)}`);
  }
  const playerRole = DAY1_ROLE_KEYS.find(roleKey => ids[roleKey].some(id => normalizeId(id) === normalizeId(playerId))) || null;
  return { assignments: ids, profilesByRole: assignments, playerRole, integrity, config };
}

export function buildSuggestedDay1Assignments({ members = [], playerId = null, scan = null, leaderId = null } = {}) {
  const automatic = resolveDay1Assignments({ members, playerId, scan, leaderId });
  return { ...automatic, suggestedRole: automatic.playerRole };
}

export function rebalanceDay1Assignments({ members = [], playerId = null, roleKey, scan = null, leaderId = null } = {}) {
  return resolveDay1Assignments({ members, playerId, requestedRole: roleKey, scan, leaderId });
}

export function buildDay1Plan({ assignments, leadership, playerId, playerRole, suggestedRole, leadershipAction, impression, socialPulse, mood }) {
  const safe = Object.fromEntries(DAY1_ROLE_KEYS.map(roleKey => [roleKey, [...(assignments?.[roleKey] || [])]]));
  return {
    leaderId: leadership?.topLeader?.id ?? leadership?.operationalLeader?.id ?? null,
    runnerUpId: leadership?.runnerUp?.id ?? leadership?.rival?.id ?? null,
    fireIds: safe.fire,
    shelterIds: safe.shelter,
    woodIds: safe.wood,
    resourcesIds: safe.resources,
    floatIds: safe.float,
    floaterIds: safe.float,
    assignments: safe,
    leadershipScenario: leadership?.scenario || 'npc_leads',
    leadershipStatus: leadership?.leadershipStatus || 'accepted',
    leadershipStyle: leadership?.style || null,
    leadershipAction: leadershipAction || 'automatic',
    mood: mood || 'tentative',
    choice: playerRole,
    playerId,
    playerRole: DAY1_ROLE_DEFINITIONS[playerRole]?.title || 'Flex',
    playerChoice: playerRole,
    suggestedRole,
    firstImpression: impression?.key || null,
    firstImpressionPosture: impression?.posture || null,
    socialPulse: (socialPulse || []).map(pulse => ({ ...pulse, people: [...(pulse.people || [])] }))
  };
}
