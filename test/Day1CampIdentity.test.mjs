import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyLeadershipDecision,
  getContextualLeadershipDecision,
  getDay1Identity,
  getDay1LeaderLine,
  resolveDay1Leadership,
  scanDay1Tribe
} from '../src/modules/events/Day1CampIdentity.js';
import {
  DAY1_ROLE_KEYS,
  buildDay1Plan,
  buildSuggestedDay1Assignments,
  rebalanceDay1Assignments,
  validateDay1Assignments
} from '../src/modules/events/Day1CampAssignmentResolver.js';
import {
  createCanonicalDay1CampMemory,
  deriveDay1FirstImpression,
  recordDay1CampOutcome,
  resolveDay1CampMood,
  resolveDay1SocialPulse
} from '../src/modules/events/Day1CampMemory.js';
import TaskSystem from '../src/modules/systems/TaskSystem.js';

function survivor(id, name, overrides = {}) {
  return {
    id,
    name,
    firstName: name === 'Boston Rob Mariano' ? 'Boston Rob' : name.split(' ')[0],
    gameplayStyle: 'Balanced',
    threat: 5,
    leader: 5,
    connections: 5,
    likeability: 5,
    strength: 5,
    endurance: 5,
    fishing: 5,
    firemaking: 5,
    awareness: 5,
    focus: 5,
    bigmove: 5,
    deception: 5,
    risk: 5,
    aggression: 5,
    paratend: 5,
    honesty: 5,
    laziness: 3,
    ...overrides
  };
}

const roster = [
  survivor('ozzy', 'Ozzy Lusth', { strength: 9, endurance: 10, fishing: 10, firemaking: 8, gameplayStyle: 'Competitive' }),
  survivor('jay', 'Jay Starrett', { strength: 8, connections: 7, gameplayStyle: 'Social' }),
  survivor('natalie', 'Natalie Anderson', { leader: 8, strength: 9, aggression: 8, gameplayStyle: 'Competitive' }),
  survivor('rob', 'Boston Rob Mariano', { leader: 10, connections: 9, aggression: 8, gameplayStyle: 'Power Player' }),
  survivor('andrea', 'Andrea Boehlke', { connections: 8, awareness: 7, gameplayStyle: 'Balanced' }),
  survivor('jeremy', 'Jeremy Collins', { leader: 8, connections: 9, honesty: 8, gameplayStyle: 'Social' }),
  survivor('yul', 'Yul Kwon', { leader: 8, connections: 8, honesty: 9, awareness: 9, gameplayStyle: 'Strategic' }),
  survivor('kim', 'Kim Spradlin', { leader: 9, connections: 9, honesty: 8, gameplayStyle: 'Strategic Social' }),
  survivor('tony', 'Tony Vlachos', { leader: 8, bigmove: 10, deception: 9, risk: 10, aggression: 9, gameplayStyle: 'Wildcard' }),
  survivor('cirie', 'Cirie Fields', { connections: 10, likeability: 10, awareness: 9, gameplayStyle: 'Social Genius' }),
  survivor('sandra', 'Sandra Diaz-Twine', { likeability: 8, awareness: 9, gameplayStyle: 'Under the Radar' }),
  survivor('kelley', 'Kelley Wentworth', { awareness: 9, bigmove: 9, gameplayStyle: 'Strategic' }),
  survivor('parvati', 'Parvati Shallow', { connections: 10, likeability: 9, deception: 9, gameplayStyle: 'Social' }),
  survivor('michele', 'Michele Fitzgerald', { connections: 9, likeability: 9, gameplayStyle: 'Social' }),
  survivor('wendell', 'Wendell Holland', { strength: 8, focus: 9, leader: 7, gameplayStyle: 'Balanced' }),
  survivor('tyson', 'Tyson Apostol', { strength: 8, awareness: 8, gameplayStyle: 'Strategic' }),
  survivor('carolyn', 'Carolyn Wiger', { connections: 8, awareness: 8, gameplayStyle: 'Wildcard' }),
  survivor('russell', 'Russell Hantz', { leader: 8, bigmove: 10, deception: 10, risk: 10, aggression: 10, honesty: 2, gameplayStyle: 'Power Player' })
];

function six(playerId = 'rob') {
  const player = roster.find(member => member.id === playerId);
  const supporting = roster.filter(member => member.id !== playerId).slice(0, 5);
  return [player, ...supporting];
}

test('all 18 cast identities have explicit behavior, practical expectations, and deterministic leader lines', () => {
  assert.equal(roster.length, 18);
  const profiles = roster.map(getDay1Identity);
  profiles.forEach(profile => {
    assert.ok(profile.leaderStyle);
    assert.ok(profile.expectedRoles.length >= 2, `${profile.name} lacks role expectations`);
    assert.ok(profile.tags.length >= 3, `${profile.name} lacks identity tags`);
    const line = getDay1LeaderLine(profile);
    const words = line.replace(/[—–]/g, ' ').trim().split(/\s+/);
    assert.ok(words.length >= 7 && words.length <= 14, `${profile.name} leader line is not compact: ${line}`);
  });
  assert.equal(getDay1Identity(roster.find(member => member.id === 'sandra')).leaderStyle, 'under_the_radar');
  assert.ok(getDay1Identity(roster.find(member => member.id === 'ozzy')).tags.includes('provider_reputation'));
  assert.ok(getDay1Identity(roster.find(member => member.id === 'cirie')).tags.includes('quiet_influence'));
  assert.ok(getDay1Identity(roster.find(member => member.id === 'rob')).tags.includes('command_leader'));
});

test('assignment board covers every survivor exactly once for every player role', () => {
  const members = six('andrea');
  const player = members[0];
  const scan = scanDay1Tribe(members);
  const leadership = resolveDay1Leadership(members, player, scan);
  const suggestion = buildSuggestedDay1Assignments({ members, playerId: player.id, scan, leaderId: leadership.topLeader.id });
  assert.ok(DAY1_ROLE_KEYS.includes(suggestion.suggestedRole));

  DAY1_ROLE_KEYS.forEach(roleKey => {
    const result = rebalanceDay1Assignments({ members, playerId: player.id, roleKey, scan, leaderId: leadership.topLeader.id });
    assert.equal(result.playerRole, roleKey);
    assert.equal(result.integrity.valid, true);
    assert.deepEqual(validateDay1Assignments(result.assignments, members).duplicates, []);
    assert.equal(Object.values(result.assignments).flat().length, members.length);
  });
});

test('nine-person tribes remain complete, covered, and deterministic', () => {
  const members = roster.slice(0, 9);
  const player = members[4];
  const scan = scanDay1Tribe(members);
  const leadership = resolveDay1Leadership(members, player, scan);
  const input = { members, playerId: player.id, roleKey: 'resources', scan, leaderId: leadership.topLeader.id };
  const first = rebalanceDay1Assignments(input);
  const second = rebalanceDay1Assignments(input);
  assert.equal(first.integrity.valid, true);
  assert.deepEqual(first.assignments, second.assignments);
  assert.equal(Object.values(first.assignments).flat().length, 9);
  assert.ok(first.assignments.shelter.length >= 2);
  assert.ok(first.assignments.float.length >= 1);
});

test('leadership always resolves one operational leader and only offers a choice when the player is involved', () => {
  const members = [roster[3], roster[6], roster[7], roster[5], roster[9], roster[2]];
  const player = members[1];
  const scan = scanDay1Tribe(members);
  const leadership = resolveDay1Leadership(members, player, scan, {
    getRelationship: () => 50,
    getTrust: () => 50,
    getSuspicion: member => member.id === 'tony' ? 12 : 0
  });
  assert.ok(leadership.operationalLeader?.id);
  assert.ok(['accepted', 'contested', 'resisted'].includes(leadership.leadershipStatus));
  const decision = getContextualLeadershipDecision({ leadership, player });
  if (decision) {
    assert.ok(decision.options.length >= 2 && decision.options.length <= 3);
    const changed = applyLeadershipDecision(leadership, player, 'take_lead');
    assert.equal(changed.operationalLeader.id, player.id);
  }

  const outsider = survivor('outsider', 'Anonymous Player', { leader: 1, connections: 1, strength: 2 });
  const outsiderMembers = [outsider, ...members.slice(0, 5)];
  const outsiderLeadership = resolveDay1Leadership(outsiderMembers, outsider, scanDay1Tribe(outsiderMembers));
  assert.equal(getContextualLeadershipDecision({ leadership: outsiderLeadership, player: outsider }), null);
});

test('identity-aware outcomes distinguish Sandra, Ozzy, Tony, and an anonymous floater', () => {
  const rob = roster.find(member => member.id === 'rob');
  const leadership = { topLeader: rob, operationalLeader: rob };
  const sandraProfile = getDay1Identity(roster.find(member => member.id === 'sandra'));
  const ozzyProfile = getDay1Identity(roster.find(member => member.id === 'ozzy'));
  const tonyProfile = getDay1Identity(roster.find(member => member.id === 'tony'));
  const anonymousProfile = getDay1Identity(survivor('anonymous', 'Anonymous Player', { awareness: 2, connections: 2, laziness: 8 }));

  assert.equal(deriveDay1FirstImpression({ playerRole: 'float', suggestedRole: 'float', playerProfile: sandraProfile, leadership }).key, 'low_profile');
  assert.equal(deriveDay1FirstImpression({ playerRole: 'resources', suggestedRole: 'resources', playerProfile: ozzyProfile, leadership }).key, 'provider');
  assert.equal(deriveDay1FirstImpression({ leadershipAction: 'take_lead', playerRole: 'wood', suggestedRole: 'wood', playerProfile: tonyProfile, leadership: { topLeader: roster.find(member => member.id === 'tony') } }).key, 'visible_leader');
  assert.equal(deriveDay1FirstImpression({ playerRole: 'float', suggestedRole: 'float', playerProfile: anonymousProfile, leadership }).key, 'watched_floater');
});

test('social pulse is capped at three and carries into one canonical outcome', () => {
  const members = [
    roster.find(member => member.id === 'tony'),
    roster.find(member => member.id === 'russell'),
    roster.find(member => member.id === 'cirie'),
    roster.find(member => member.id === 'parvati'),
    roster.find(member => member.id === 'ozzy'),
    roster.find(member => member.id === 'sandra')
  ];
  const player = members[0];
  const scan = scanDay1Tribe(members);
  let leadership = resolveDay1Leadership(members, player, scan);
  leadership = applyLeadershipDecision(leadership, player, 'take_lead');
  const assignment = rebalanceDay1Assignments({ members, playerId: player.id, roleKey: 'wood', scan, leaderId: player.id });
  const impression = deriveDay1FirstImpression({ leadershipAction: 'take_lead', playerRole: 'wood', suggestedRole: 'fire', playerProfile: getDay1Identity(player), leadership });
  const pulse = resolveDay1SocialPulse({ scan, leadership, assignments: assignment.assignments, playerId: player.id, impression });
  const mood = resolveDay1CampMood({ leadership, socialPulse: pulse });
  const memory = createCanonicalDay1CampMemory({ day: 1, phase: 'pre_challenge', tribeId: 'tribe-a', leadership, leadershipAction: 'take_lead', assignments: assignment.assignments, player, playerRole: 'wood', impression, socialPulse: pulse, mood });

  assert.ok(pulse.length >= 1 && pulse.length <= 3);
  assert.equal(memory.type, 'day1_camp_setup');
  assert.equal(memory.assignments.wood.includes(player.id), true);
  assert.equal(memory.firstImpression.key, 'visible_leader');
  assert.ok(['chaotic', 'confident', 'tentative'].includes(memory.campMood));
});

test('canonical memory is written once only to meaningfully involved NPCs', () => {
  const player = roster.find(member => member.id === 'andrea');
  const members = [player, roster[3], roster[9], roster[17], roster[0], roster[10]];
  const records = new Map();
  const socialMemorySystem = {
    getDay1CampMemories(npcId) { return records.get(npcId) || []; },
    recordStructuredEvent(entry) {
      const list = records.get(entry.listenerId) || [];
      list.push(entry.data);
      records.set(entry.listenerId, list);
    }
  };
  const gameManager = { systems: { socialMemorySystem }, campLog: [], day1Memories: [] };
  const tribe = { id: 'tribe-a', day1Memories: [] };
  const canonicalMemory = {
    id: 'day1_first_impressions:canonical:1:tribe-a', eventId: 'day1_first_impressions', day: 1, phase: 'pre_challenge',
    type: 'day1_camp_setup', operationalLeaderId: 'rob', leadershipStatus: 'contested', leadershipRivalId: 'russell',
    quietResistorId: 'sandra', playerId: player.id, playerRole: 'shelter', assignments: {}, firstImpression: { key: 'useful_worker' },
    strongestBond: { people: [player.id, 'cirie'], label: 'Bond forming' }, strongestTension: { people: ['rob', 'russell'], label: 'Leadership friction' },
    reputationExpectation: null, campMood: 'chaotic', tags: ['day1_camp_opening'], futureHooks: ['Watch the rivalry.']
  };

  recordDay1CampOutcome({ gameManager, tribe, members, canonicalMemory });
  recordDay1CampOutcome({ gameManager, tribe, members, canonicalMemory });
  assert.deepEqual([...records.keys()].sort(), ['cirie', 'rob', 'russell']);
  assert.ok([...records.values()].every(list => list.length === 1));
  assert.equal(tribe.day1Memories.length, 1);
  assert.equal(gameManager.day1Memories.length, 1);
  assert.equal(gameManager.campLog.length, 1);
});

test('new assignment plan remains compatible with TaskSystem contracts', () => {
  const members = roster.slice(0, 6);
  const player = members[1];
  const scan = scanDay1Tribe(members);
  const leadership = resolveDay1Leadership(members, player, scan);
  const result = rebalanceDay1Assignments({ members, playerId: player.id, roleKey: 'resources', scan, leaderId: leadership.topLeader.id });
  const plan = buildDay1Plan({ assignments: result.assignments, leadership, playerId: player.id, playerRole: result.playerRole, suggestedRole: 'wood', impression: { key: 'team_player', posture: 'responsive_worker' }, socialPulse: [], mood: 'tentative' });
  const tribe = { id: 'tribe-a', members, shelter: 0, fire: 0, day1Plan: plan };
  const taskSystem = new TaskSystem({ day: 1 });
  taskSystem.startPhaseForTribe(tribe, 'day1_phase1');
  taskSystem.createDay1TasksFromPlan(tribe, 'day1_phase1', { force: true });

  assert.deepEqual(plan.resourcesIds, result.assignments.resources);
  assert.deepEqual(plan.floaterIds, result.assignments.float);
  assert.ok(tribe.taskState.tasks.length > 0);
  assert.ok(tribe.taskState.tasks.every(task => Array.isArray(task.assignees)));
  const assignedAcrossTasks = new Set(tribe.taskState.tasks.flatMap(task => task.assignees));
  Object.values(result.assignments).flat().forEach(id => assert.ok(assignedAcrossTasks.has(String(id))));
});
