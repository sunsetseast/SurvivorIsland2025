import { DAY1_ROLE_DEFINITIONS } from './Day1CampAssignmentResolver.js';

function clamp(value, min = 0, max = 100) {
  const number = Number(value);
  return Math.max(min, Math.min(max, Number.isFinite(number) ? number : min));
}

function sameId(a, b) {
  return a != null && b != null && String(a) === String(b);
}

function displayName(survivor) {
  return survivor?.firstName || survivor?.name || 'Someone';
}

function profileById(scan, id) {
  return scan?.profiles?.find(profile => sameId(profile.id, id)) || null;
}

function memberById(members, id) {
  return (members || []).find(member => sameId(member?.id, id)) || null;
}

export function buildDay1NpcReference({ memory, speakerId, members = [] } = {}) {
  if (!memory || speakerId == null) return null;
  const playerId = memory.playerId;
  const speaker = memberById(members, speakerId);
  const leader = memberById(members, memory.operationalLeaderId);
  const provider = memberById(members, memory.practicalProviderId);
  const bondPeople = memory.strongestBond?.people || [];
  const tensionPeople = memory.strongestTension?.people || [];

  if (bondPeople.some(id => sameId(id, speakerId)) && bondPeople.some(id => sameId(id, playerId))) {
    return 'You and I worked well together from the start.';
  }
  if (sameId(speakerId, memory.operationalLeaderId) && memory.leadershipAction === 'back_leader') {
    return 'You backed me when everyone was deciding how to start camp.';
  }
  if (tensionPeople.some(id => sameId(id, speakerId))) {
    const otherId = tensionPeople.find(id => !sameId(id, speakerId));
    const other = memberById(members, otherId);
    return `${displayName(other)} and I had friction over camp direction immediately.`;
  }
  if (provider && memory.assignments?.resources?.some(id => sameId(id, provider.id))) {
    return `${displayName(provider)} took Resources, so everyone expected results.`;
  }
  if (leader) {
    const controlling = ['command', 'forceful', 'chaotic'].includes(memory.leadershipStyle);
    if (controlling && memory.leadershipStatus !== 'accepted') {
      return `${displayName(leader)} took control of camp immediately. People noticed.`;
    }
    if (sameId(speaker?.id, leader.id)) {
      return 'I set the first camp plan, and people followed it.';
    }
  }
  return memory.firstImpression?.summary || null;
}

export function deriveDay1FirstImpression({ leadershipAction = 'automatic', playerRole, suggestedRole, playerProfile, leadership } = {}) {
  const role = DAY1_ROLE_DEFINITIONS[playerRole] || DAY1_ROLE_DEFINITIONS.float;
  const changedRole = Boolean(suggestedRole && playerRole && suggestedRole !== playerRole);
  const playerIsLeader = sameId(leadership?.topLeader?.id, playerProfile?.id);
  let result;

  if (leadershipAction === 'take_lead' || (playerIsLeader && leadershipAction !== 'stay_out')) {
    result = {
      key: 'visible_leader', posture: 'visible_leader', label: 'Visible leader',
      summary: `You directed camp and took ${role.label}.`,
      tags: ['first_impression', 'day1_leadership', 'visible_leader'],
      effects: { teamPlayer: 2, threat: 1, suspicion: playerProfile?.scores?.reputation >= 70 ? 2 : 1, visibility: 3 }
    };
  } else if (leadershipAction === 'back_leader') {
    result = {
      key: 'cooperative', posture: 'steady_support', label: 'Cooperative',
      summary: `You backed the camp leader and took ${role.label}.`,
      tags: ['first_impression', 'steady_support', 'team_player'],
      effects: { teamPlayer: 3, threat: -1, suspicion: -1, visibility: 0 }
    };
  } else if (playerRole === 'resources' && playerProfile?.scores?.provider >= 65) {
    result = {
      key: 'provider', posture: 'useful_worker', label: 'Provider',
      summary: changedRole
        ? 'You volunteered for the survival job the tribe expected you to handle.'
        : 'You accepted the job the tribe expects a provider to handle.',
      tags: ['first_impression', 'provider_reputation', 'useful_worker', ...(changedRole ? ['volunteered'] : [])],
      effects: { teamPlayer: 4, threat: 1, suspicion: 0, visibility: 2 }
    };
  } else if (changedRole) {
    result = {
      key: 'team_player', posture: 'responsive_worker', label: 'Steps up',
      summary: `You left the suggested job and volunteered for ${role.label}.`,
      tags: ['first_impression', 'team_player', 'volunteered'],
      effects: { teamPlayer: 4, threat: 0, suspicion: 0, visibility: 1 }
    };
  } else if (playerRole === 'float') {
    const authentic = playerProfile?.tags?.includes('under_the_radar_survival')
      || playerProfile?.scores?.observer >= 70
      || playerProfile?.scores?.social >= 72;
    result = authentic
      ? {
          key: 'low_profile', posture: 'quiet_observer', label: 'Low profile',
          summary: 'You stayed flexible, useful, and difficult to pin down.',
          tags: ['first_impression', 'quiet_observer', 'under_the_radar'],
          effects: { teamPlayer: 1, threat: -1, suspicion: 0, visibility: -2 }
        }
      : {
          key: 'watched_floater', posture: 'suspicious_floater', label: 'Being watched',
          summary: 'You chose flexibility while others committed to visible work.',
          tags: ['first_impression', 'suspicious_floater'],
          effects: { teamPlayer: -1, threat: -1, suspicion: 2, visibility: -1 }
        };
  } else {
    result = {
      key: 'useful_worker', posture: 'useful_worker', label: 'Useful worker',
      summary: `You accepted ${role.label} and got to work.`,
      tags: ['first_impression', 'useful_worker', playerRole],
      effects: { teamPlayer: 3, threat: 0, suspicion: 0, visibility: 1 }
    };
  }

  return {
    ...result,
    roleKey: playerRole,
    roleLabel: role.label,
    strategicMeaning: result.key === 'visible_leader'
      ? 'The player is part of the tribe’s early power structure.'
      : result.key === 'cooperative'
        ? 'The player created trust by helping the operational leader establish order.'
        : result.key === 'provider'
          ? 'The tribe now expects the player to deliver practical value.'
          : result.key === 'watched_floater'
            ? 'The player reduced visibility but created questions about effort.'
            : 'The player’s camp contribution established their first social value.',
    futureHook: 'Later camp work can confirm or overturn this first impression.'
  };
}

function pairCompatibility(a, b) {
  const workMatch = 100 - Math.abs(a.scores.worker - b.scores.worker);
  const socialEase = (a.scores.social + b.scores.social) / 2;
  const chaosPenalty = Math.max(0, a.scores.chaos + b.scores.chaos - 140) * 0.25;
  return workMatch * 0.45 + socialEase * 0.55 - chaosPenalty;
}

export function resolveDay1SocialPulse({ scan, leadership, assignments, playerId, impression } = {}) {
  const pulses = [];
  const rolePairs = [];
  Object.entries(assignments || {}).forEach(([roleKey, ids]) => {
    for (let i = 0; i < ids.length; i += 1) {
      for (let j = i + 1; j < ids.length; j += 1) {
        const a = profileById(scan, ids[i]);
        const b = profileById(scan, ids[j]);
        if (a && b) rolePairs.push({ a, b, roleKey, score: pairCompatibility(a, b) });
      }
    }
  });
  const playerProfile = profileById(scan, playerId);
  const playerRole = Object.entries(assignments || {}).find(([, ids]) => ids.some(id => sameId(id, playerId)))?.[0];
  if (playerRole === 'float' && (playerProfile?.scores.social >= 72 || playerProfile?.tags.includes('quiet_influence'))) {
    const partner = scan.profiles
      .filter(profile => !sameId(profile.id, playerId))
      .map(profile => ({ profile, score: pairCompatibility(playerProfile, profile) + playerProfile.scores.social * 0.12 }))
      .sort((a, b) => b.score - a.score || String(a.profile.id).localeCompare(String(b.profile.id)))[0];
    if (partner) rolePairs.push({ a: playerProfile, b: partner.profile, roleKey: 'float', score: partner.score });
  }
  const bond = rolePairs.sort((a, b) => b.score - a.score || String(a.a.id).localeCompare(String(b.a.id)))[0];
  if (bond && bond.score >= 58) {
    pulses.push({
      type: 'bond', label: 'Bond forming', icon: 'bond', people: [bond.a.id, bond.b.id], tone: 'positive',
      explanation: `${bond.a.name} and ${bond.b.name} find an easy rhythm on ${DAY1_ROLE_DEFINITIONS[bond.roleKey].label}.`
    });
  }

  const leader = leadership?.topLeader;
  const resistor = leadership?.leadershipStatus === 'contested' ? leadership?.runnerUp : leadership?.quietResistor;
  if (leader && resistor && !sameId(leader.id, resistor.id) && leadership.leadershipStatus !== 'accepted') {
    pulses.push({
      type: 'tension', label: 'Leadership friction', icon: 'friction', people: [leader.id, resistor.id], tone: 'negative',
      explanation: `${displayName(resistor)} follows the plan without fully accepting ${displayName(leader)}’s control.`
    });
  }

  if (impression?.key === 'provider') {
    pulses.push({
      type: 'reputation', label: 'Provider pressure', icon: 'watched', people: [playerId], tone: 'watch',
      explanation: 'The tribe expects the player’s survival work to produce results.'
    });
  } else if (impression?.key === 'visible_leader' && (playerProfile?.scores.reputation >= 65 || playerProfile?.scores.chaos >= 72)) {
    pulses.push({
      type: 'reputation', label: 'Being watched', icon: 'watched', people: [playerId], tone: 'watch',
      explanation: 'Taking charge created momentum and made the player more visible.'
    });
  } else if (impression?.key === 'low_profile') {
    pulses.push({
      type: 'reputation', label: 'Quiet respect', icon: 'respect', people: [playerId], tone: 'positive',
      explanation: 'The flexible role reads as awareness rather than avoidance.'
    });
  } else if (impression?.key === 'watched_floater') {
    pulses.push({
      type: 'reputation', label: 'Being watched', icon: 'watched', people: [playerId], tone: 'watch',
      explanation: 'Some workers are waiting to see whether Flex means adaptable or absent.'
    });
  }

  return pulses.slice(0, 3);
}

export function resolveDay1CampMood({ leadership, socialPulse = [] } = {}) {
  if (leadership?.leadershipStatus === 'contested' || socialPulse.some(pulse => pulse.type === 'tension')) return 'chaotic';
  if (leadership?.leadershipStatus === 'accepted' && socialPulse.some(pulse => pulse.type === 'bond')) return 'confident';
  return 'tentative';
}

export function createCanonicalDay1CampMemory({ day = 1, phase = null, tribeId = null, leadership, leadershipAction, assignments, player, playerRole, impression, socialPulse, mood }) {
  const bond = socialPulse.find(pulse => pulse.type === 'bond') || null;
  const tension = socialPulse.find(pulse => pulse.type === 'tension') || null;
  const reputation = socialPulse.find(pulse => pulse.type === 'reputation') || null;
  return {
    id: `day1_first_impressions:canonical:${day}:${tribeId || 'tribe'}`,
    eventId: 'day1_first_impressions',
    day,
    phase,
    type: 'day1_camp_setup',
    tribeId,
    operationalLeaderId: leadership?.topLeader?.id || null,
    leadershipStyle: leadership?.style || null,
    leadershipStatus: leadership?.leadershipStatus || 'accepted',
    leadershipRivalId: leadership?.leadershipStatus === 'contested' ? leadership?.runnerUp?.id || null : null,
    quietResistorId: leadership?.leadershipStatus === 'resisted' ? leadership?.quietResistor?.id || null : null,
    socialCenterId: leadership?.socialCenter?.id || null,
    practicalProviderId: leadership?.practicalProvider?.id || null,
    playerId: player?.id || null,
    leadershipAction: leadershipAction || 'automatic',
    playerRole,
    assignments: Object.fromEntries(Object.entries(assignments || {}).map(([role, ids]) => [role, [...ids]])),
    firstImpression: {
      key: impression?.key || null,
      label: impression?.label || null,
      summary: impression?.summary || null,
      tags: [...(impression?.tags || [])],
      strategicMeaning: impression?.strategicMeaning || null
    },
    strongestBond: bond,
    strongestTension: tension,
    reputationExpectation: reputation,
    campMood: mood,
    tags: ['day1_camp_opening', 'camp_role', impression?.key, leadership?.leadershipStatus].filter(Boolean),
    futureHooks: [
      impression?.futureHook,
      tension?.explanation,
      reputation?.explanation
    ].filter(Boolean)
  };
}

function addCampSocialChange(bucket, entry) {
  if (typeof window === 'undefined') return;
  window.campSocialChanges = window.campSocialChanges || {};
  window.campSocialChanges[bucket] = Array.isArray(window.campSocialChanges[bucket]) ? window.campSocialChanges[bucket] : [];
  window.campSocialChanges[bucket].push(entry);
}

function changePair(gameManager, aId, bId, relationshipDelta, trustDelta, reason) {
  if (aId == null || bId == null || sameId(aId, bId)) return;
  const relationships = gameManager.systems?.relationshipSystem;
  const trust = gameManager.systems?.trustSystem;
  if (relationshipDelta && relationships?.getRelationship && relationships?.setRelationship) {
    const current = relationships.getRelationship(aId, bId)?.value ?? 50;
    relationships.setRelationship(aId, bId, clamp(current + relationshipDelta));
    addCampSocialChange('relationship', { from: aId, to: bId, amount: relationshipDelta, reason });
  }
  if (trustDelta && trust?.changeTrust) {
    trust.changeTrust(aId, bId, trustDelta, reason);
    addCampSocialChange('trust', { from: aId, to: bId, amount: trustDelta, reason });
  }
}

export function applyDay1CampConsequences({ gameManager, player, impression, socialPulse = [] }) {
  const effects = impression?.effects || {};
  player.teamPlayer = clamp((player.teamPlayer ?? 50) + (effects.teamPlayer || 0));
  player.suspicion = clamp((player.suspicion ?? 0) + (effects.suspicion || 0));
  player.threat = clamp((player.threat ?? 5) + (effects.threat || 0), 0, 10);
  if (effects.suspicion) addCampSocialChange('suspicion', { with: player.id, amount: effects.suspicion, reason: 'day1_first_impression' });
  socialPulse.forEach(pulse => {
    if (pulse.people?.length < 2) return;
    if (pulse.type === 'bond') changePair(gameManager, pulse.people[0], pulse.people[1], 4, 3, 'day1_early_bond');
    if (pulse.type === 'tension') changePair(gameManager, pulse.people[0], pulse.people[1], -3, -2, 'day1_leadership_friction');
  });
}

export function recordDay1CampOutcome({ gameManager, tribe, members, canonicalMemory }) {
  const upsert = (list, entry) => {
    const safe = Array.isArray(list) ? list : [];
    const index = safe.findIndex(item => item?.id === entry.id);
    if (index >= 0) safe[index] = entry;
    else safe.push(entry);
    return safe;
  };
  tribe.day1Memories = upsert(tribe.day1Memories, canonicalMemory);
  gameManager.day1Memories = upsert(gameManager.day1Memories, canonicalMemory);

  const involvedIds = new Set([
    canonicalMemory.operationalLeaderId,
    canonicalMemory.leadershipStatus !== 'accepted' ? canonicalMemory.leadershipRivalId : null,
    canonicalMemory.leadershipStatus === 'resisted' ? canonicalMemory.quietResistorId : null,
    ...(canonicalMemory.strongestBond?.people || []),
    ...(canonicalMemory.strongestTension?.people || []),
    ...(canonicalMemory.reputationExpectation?.people || [])
  ].filter(id => id != null && !sameId(id, canonicalMemory.playerId)));

  const socialMemory = gameManager.systems?.socialMemorySystem;
  involvedIds.forEach(npcId => {
    if (!members.some(member => sameId(member.id, npcId))) return;
    const alreadyRecorded = socialMemory?.getDay1CampMemories?.(npcId)
      ?.some(memory => memory?.id === canonicalMemory.id);
    if (alreadyRecorded) return;
    const personal = {
      ...canonicalMemory,
      perspective: 'npc',
      personalHooks: [
        buildDay1NpcReference({ memory: canonicalMemory, speakerId: npcId, members }),
        ...canonicalMemory.futureHooks
      ].filter(Boolean)
    };
    socialMemory?.recordStructuredEvent?.({
      type: 'day1_camp_memory',
      speakerId: canonicalMemory.playerId,
      listenerId: npcId,
      subjectId: canonicalMemory.playerId,
      data: personal,
      day: canonicalMemory.day,
      phase: canonicalMemory.phase
    });
  });

  const playerRoleLabel = DAY1_ROLE_DEFINITIONS[canonicalMemory.playerRole]?.label || 'Flex';
  const leader = members.find(member => sameId(member.id, canonicalMemory.operationalLeaderId));
  const pulseText = [canonicalMemory.strongestBond?.label, canonicalMemory.strongestTension?.label, canonicalMemory.reputationExpectation?.label].filter(Boolean).join(' · ');
  const text = `${displayName(leader)} directed camp setup. You took ${playerRoleLabel}.${pulseText ? ` ${pulseText}.` : ''}`;
  const summaryEntry = {
    id: 'day1_first_impressions',
    day: canonicalMemory.day,
    phase: canonicalMemory.phase,
    type: 'cinematic_event',
    title: 'Day 1: Camp Setup',
    text,
    data: {
      leadershipScenario: canonicalMemory.leadershipStatus,
      leaderId: canonicalMemory.operationalLeaderId,
      playerId: canonicalMemory.playerId,
      playerRole: canonicalMemory.playerRole,
      assignmentsByRole: canonicalMemory.assignments,
      tone: canonicalMemory.campMood,
      mood: canonicalMemory.campMood,
      day1CampOutcome: canonicalMemory
    },
    isCinematicEventSummary: true
  };
  gameManager.campLog = Array.isArray(gameManager.campLog) ? gameManager.campLog : [];
  const existingIndex = gameManager.campLog.findIndex(entry => entry?.id === summaryEntry.id);
  if (existingIndex >= 0) gameManager.campLog[existingIndex] = summaryEntry;
  else gameManager.campLog.push(summaryEntry);
  addCampSocialChange('memory', { with: canonicalMemory.operationalLeaderId, tags: canonicalMemory.tags, summary: text });
  return summaryEntry;
}
