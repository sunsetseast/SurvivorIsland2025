import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDay1Reactions,
  createDay1MemoryRecords,
  getDay1Identity,
  resolveDay1Leadership,
  resolveFirstImpression,
  scanDay1Tribe
} from '../src/modules/events/Day1CampIdentity.js';
import socialMemorySystem from '../src/modules/systems/SocialMemorySystem.js';

function survivor(id, name, overrides = {}) {
  return {
    id,
    name,
    firstName: name.split(' ').slice(0, 2).join(' '),
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

test('Day 1 identity scan distinguishes Survivor identities and practical expectations', () => {
  const rob = survivor('rob', 'Boston Rob Mariano', { leader: 10, connections: 9, aggression: 8, gameplayStyle: 'Power Player' });
  const sandra = survivor('sandra', 'Sandra Diaz-Twine', { likeability: 8, awareness: 8, gameplayStyle: 'Under the Radar' });
  const ozzy = survivor('ozzy', 'Ozzy Lusth', { strength: 9, endurance: 10, fishing: 10, firemaking: 8, gameplayStyle: 'Competitive' });
  const cirie = survivor('cirie', 'Cirie Fields', { connections: 9, likeability: 9, awareness: 8, gameplayStyle: 'Social Genius' });

  const robIdentity = getDay1Identity(rob);
  const sandraIdentity = getDay1Identity(sandra);
  const ozzyIdentity = getDay1Identity(ozzy);
  const cirieIdentity = getDay1Identity(cirie);

  assert.ok(robIdentity.tags.includes('command_leader'));
  assert.equal(sandraIdentity.leaderStyle, 'under_the_radar');
  assert.ok(ozzyIdentity.tags.includes('provider_reputation'));
  assert.ok(cirieIdentity.tags.includes('quiet_influence'));
});

test('first impression creates a non-cosmetic leadership read, reactions, and structured memories', () => {
  const rob = survivor('rob', 'Boston Rob Mariano', { leader: 10, connections: 9, aggression: 8, gameplayStyle: 'Power Player' });
  const sandra = survivor('sandra', 'Sandra Diaz-Twine', { likeability: 8, awareness: 9, gameplayStyle: 'Under the Radar' });
  const ozzy = survivor('ozzy', 'Ozzy Lusth', { strength: 9, endurance: 10, fishing: 10, firemaking: 8, gameplayStyle: 'Competitive' });
  const cirie = survivor('cirie', 'Cirie Fields', { connections: 9, likeability: 9, awareness: 8, gameplayStyle: 'Social Genius' });
  const members = [rob, sandra, ozzy, cirie];
  const scan = scanDay1Tribe(members);
  const leadership = resolveDay1Leadership(members, rob, scan);
  const firstImpression = resolveFirstImpression({ player: rob, choiceKey: 'take_charge', scan, leadership });
  firstImpression.roleKey = 'shelter';
  firstImpression.combinedRead = 'Take charge + Shelter Builder';
  const reactions = buildDay1Reactions({ members, player: rob, scan, leadership, firstImpression });
  const memories = createDay1MemoryRecords({
    day: 1,
    phase: 'pre_challenge',
    player: rob,
    leadership,
    firstImpression,
    playerRoleKey: 'shelter',
    reactions,
    mood: 'tentative'
  });

  assert.ok(['player_leads', 'contested', 'npc_leads'].includes(leadership.scenario));
  assert.equal(firstImpression.effects.teamPlayer, 3);
  assert.ok(reactions.length >= 2 && reactions.length <= 4);
  assert.ok(memories.some(memory => memory.type === 'player_first_impression'));
  assert.ok(memories.every(memory => memory.eventId === 'day1_first_impressions' && Array.isArray(memory.tags) && memory.futureHook));
});

test('every first-impression posture and camp role produces a durable, role-aware scene payload', () => {
  const player = survivor('tony', 'Tony Vlachos', { leader: 8, bigmove: 10, deception: 9, risk: 10, aggression: 8, gameplayStyle: 'Wildcard' });
  const members = [
    player,
    survivor('yul', 'Yul Kwon', { leader: 8, connections: 8, honesty: 8, gameplayStyle: 'Strategic' }),
    survivor('ozzy', 'Ozzy Lusth', { strength: 9, endurance: 10, fishing: 10, firemaking: 8, gameplayStyle: 'Competitive' }),
    survivor('parvati', 'Parvati Shallow', { connections: 9, likeability: 9, deception: 8, gameplayStyle: 'Social' })
  ];
  const scan = scanDay1Tribe(members);
  const leadership = resolveDay1Leadership(members, player, scan);
  const postures = ['take_charge', 'work_hard', 'support_leader', 'observe', 'bond_early', 'push_back'];
  const roles = ['fire', 'shelter', 'wood', 'resources', 'float'];

  postures.forEach(posture => {
    const firstImpression = resolveFirstImpression({ player, choiceKey: posture, scan, leadership });
    roles.forEach(roleKey => {
      const roleAware = { ...firstImpression, roleKey, combinedRead: `${firstImpression.label} + ${roleKey}` };
      const reactions = buildDay1Reactions({ members, player, scan, leadership, firstImpression: roleAware });
      const memories = createDay1MemoryRecords({ player, leadership, firstImpression: roleAware, playerRoleKey: roleKey, reactions });
      assert.ok(memories.some(memory => memory.type === 'camp_role'));
      assert.ok(memories.some(memory => memory.type === 'player_first_impression'));
    });
  });
});

test('NPC Day 1 memories are queryable for later conversation logic', () => {
  socialMemorySystem.deserialize(null);
  const memory = {
    id: 'day1_first_impressions:early_tension:player:npc',
    eventId: 'day1_first_impressions',
    type: 'early_tension',
    tags: ['day1_camp_opening', 'early_tension']
  };
  socialMemorySystem.recordStructuredEvent({
    type: 'day1_camp_memory',
    speakerId: 'player',
    listenerId: 'npc',
    subjectId: 'player',
    data: memory,
    day: 1,
    phase: 'pre_challenge'
  });

  assert.deepEqual(socialMemorySystem.getDay1CampMemories('npc'), [memory]);
});
