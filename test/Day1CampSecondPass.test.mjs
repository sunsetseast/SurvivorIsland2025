import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { inflateSync } from 'node:zlib';
import gameData from '../src/modules/data/GameData.js';
import eventManager, { GameEvents } from '../src/modules/core/EventManager.js';
import TaskSystem from '../src/modules/systems/TaskSystem.js';
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
  buildDay1NpcReference,
  createCanonicalDay1CampMemory,
  deriveDay1FirstImpression,
  resolveDay1CampMood,
  resolveDay1SocialPulse
} from '../src/modules/events/Day1CampMemory.js';
import { DAY1_SPEAKER_PORTRAIT_GEOMETRY } from '../src/modules/events/Day1CampSetupUI.js';

const cast = gameData.getSurvivors();
const byName = name => cast.find(survivor => survivor.firstName === name);
const tribe = (...names) => names.map(byName);

function resolveScenario(members, player) {
  const scan = scanDay1Tribe(members);
  const leadership = resolveDay1Leadership(members, player, scan, {
    getRelationship: () => 50,
    getTrust: () => 50,
    getSuspicion: survivor => survivor?.suspicion ?? 0
  });
  return { scan, leadership };
}

function assignmentOutcome({ members, player, roleKey, leadershipAction = 'automatic' }) {
  const { scan, leadership: initialLeadership } = resolveScenario(members, player);
  const leadership = applyLeadershipDecision(initialLeadership, player, leadershipAction);
  const suggested = buildSuggestedDay1Assignments({
    members,
    playerId: player.id,
    scan,
    leaderId: leadership.operationalLeader.id
  });
  const assignment = rebalanceDay1Assignments({
    members,
    playerId: player.id,
    roleKey: roleKey || suggested.suggestedRole,
    scan,
    leaderId: leadership.operationalLeader.id
  });
  const impression = deriveDay1FirstImpression({
    leadershipAction,
    playerRole: assignment.playerRole,
    suggestedRole: suggested.suggestedRole,
    playerProfile: getDay1Identity(player),
    leadership
  });
  const socialPulse = resolveDay1SocialPulse({
    scan,
    leadership,
    assignments: assignment.assignments,
    playerId: player.id,
    impression
  });
  return { scan, leadership, suggested, assignment, impression, socialPulse };
}

test('the actual 18-person cast has complete Day 1 identity and compact unique dialogue', () => {
  assert.equal(cast.length, 18);
  const lines = new Set();
  cast.forEach(survivor => {
    const profile = getDay1Identity(survivor);
    const line = getDay1LeaderLine(profile);
    const words = line.replace(/[—–]/g, ' ').trim().split(/\s+/);
    assert.ok(profile.leaderStyle, `${survivor.name} is missing a leadership style`);
    assert.ok(profile.expectedRoles.length >= 2, `${survivor.name} is missing role preferences`);
    assert.ok(profile.tags.length >= 3, `${survivor.name} is missing reputation tags`);
    assert.ok(words.length >= 8 && words.length <= 14, `${survivor.name} line is not 8–14 words: ${line}`);
    lines.add(line);
  });
  assert.equal(lines.size, cast.length, 'every current survivor should have identity-specific leader dialogue');
  assert.match(getDay1LeaderLine(getDay1Identity(byName('Andrea'))), /finish|help/i);
});

test('Boston Rob leads naturally, but backing the runner-up actually transfers operational control', () => {
  const rob = byName('Boston Rob');
  const members = tribe('Boston Rob', 'Ozzy', 'Jay', 'Andrea', 'Michele', 'Kelley');
  const { leadership } = resolveScenario(members, rob);
  assert.equal(leadership.operationalLeader.id, rob.id);
  const decision = getContextualLeadershipDecision({ leadership, player: rob });
  assert.deepEqual(decision.options.map(option => option.key), ['take_lead', 'back_leader', 'stay_out']);
  const backed = applyLeadershipDecision(leadership, rob, 'back_leader');
  assert.notEqual(backed.operationalLeader.id, rob.id);
  assert.equal(backed.operationalLeader.id, leadership.runnerUp.id);
  assert.equal(backed.leadershipStatus, 'accepted');
});

test('a strong player can support or resist NPC Boston Rob contextually', () => {
  const kim = byName('Kim');
  const members = tribe('Kim', 'Boston Rob', 'Andrea', 'Ozzy', 'Michele', 'Tyson');
  const { leadership } = resolveScenario(members, kim);
  assert.ok([byName('Kim').id, byName('Boston Rob').id].includes(leadership.operationalLeader.id));
  const decision = getContextualLeadershipDecision({ leadership, player: kim });
  assert.ok(decision);
  assert.ok(decision.options.some(option => option.key === 'take_lead'));
  assert.ok(decision.options.some(option => option.key === 'back_leader'));
});

test('Sandra on Flex stays low-profile while Cirie on Flex forms an early connection', () => {
  const sandra = byName('Sandra');
  const sandraResult = assignmentOutcome({
    members: tribe('Sandra', 'Boston Rob', 'Ozzy', 'Andrea', 'Michele', 'Kelley'),
    player: sandra,
    roleKey: 'float'
  });
  assert.equal(sandraResult.impression.key, 'low_profile');
  assert.ok(sandraResult.socialPulse.some(pulse => pulse.label === 'Quiet respect'));

  const cirie = byName('Cirie');
  const cirieResult = assignmentOutcome({
    members: tribe('Cirie', 'Andrea', 'Michele', 'Kim', 'Yul', 'Wendell'),
    player: cirie,
    roleKey: 'float'
  });
  const bond = cirieResult.socialPulse.find(pulse => pulse.type === 'bond');
  assert.ok(bond?.people.some(id => String(id) === String(cirie.id)));
  assert.equal(cirieResult.impression.key, 'low_profile');
});

test('Ozzy is reserved for Resources and receives provider pressure', () => {
  const ozzy = byName('Ozzy');
  const result = assignmentOutcome({
    members: tribe('Ozzy', 'Boston Rob', 'Natalie', 'Andrea', 'Jeremy', 'Jay'),
    player: ozzy,
    roleKey: 'resources'
  });
  assert.equal(result.suggested.suggestedRole, 'resources');
  assert.equal(result.impression.key, 'provider');
  assert.ok(result.socialPulse.some(pulse => pulse.label === 'Provider pressure'));
});

test('Tony can create useful leadership momentum and increased suspicion', () => {
  const tony = byName('Tony');
  const members = tribe('Tony', 'Jay', 'Andrea', 'Carolyn', 'Ozzy', 'Kelley');
  const result = assignmentOutcome({ members, player: tony, roleKey: 'wood', leadershipAction: 'take_lead' });
  assert.equal(result.leadership.operationalLeader.id, tony.id);
  assert.equal(result.impression.key, 'visible_leader');
  assert.ok(result.impression.effects.teamPlayer > 0);
  assert.ok(result.impression.effects.suspicion > 0);
  assert.ok(result.socialPulse.some(pulse => pulse.label === 'Being watched'));
});

test('strong NPC rivals resolve one leader, while a low-command tribe still finds a practical leader', () => {
  const andrea = byName('Andrea');
  const rivalMembers = tribe('Andrea', 'Boston Rob', 'Kim', 'Ozzy', 'Michele', 'Kelley');
  const first = resolveScenario(rivalMembers, andrea).leadership;
  const second = resolveScenario(rivalMembers, andrea).leadership;
  assert.ok(first.operationalLeader?.id);
  assert.deepEqual(first, second, 'leadership and social roles must be deterministic across reloads');
  assert.notEqual(first.operationalLeader.id, first.runnerUp.id);

  const consensusMembers = tribe('Sandra', 'Cirie', 'Michele', 'Wendell', 'Andrea', 'Tyson');
  const consensus = resolveScenario(consensusMembers, byName('Sandra')).leadership;
  assert.ok(consensus.operationalLeader?.id);
  assert.ok(['consensus', 'provider', 'social', 'steady', 'under_the_radar', 'dry_social'].includes(consensus.style));
});

test('all five player roles and a nine-person tribe preserve assignment and simulation contracts', () => {
  const members = tribe('Andrea', 'Boston Rob', 'Ozzy', 'Cirie', 'Sandra', 'Tony', 'Kim', 'Yul', 'Wendell');
  const player = byName('Andrea');
  const { scan, leadership } = resolveScenario(members, player);
  DAY1_ROLE_KEYS.forEach(roleKey => {
    const result = rebalanceDay1Assignments({ members, playerId: player.id, roleKey, scan, leaderId: leadership.operationalLeader.id });
    assert.equal(result.playerRole, roleKey);
    assert.equal(result.integrity.valid, true);
    assert.equal(Object.values(result.assignments).flat().length, 9);
    assert.deepEqual(validateDay1Assignments(result.assignments, members).duplicates, []);
  });

  const result = rebalanceDay1Assignments({ members, playerId: player.id, roleKey: 'shelter', scan, leaderId: leadership.operationalLeader.id });
  const plan = buildDay1Plan({
    assignments: result.assignments,
    leadership,
    playerId: player.id,
    playerRole: result.playerRole,
    suggestedRole: result.playerRole,
    impression: { key: 'useful_worker', posture: 'useful_worker' },
    socialPulse: [],
    mood: 'tentative'
  });
  const gameTribe = { id: 'nine', members, day1Plan: plan, fire: 0, shelter: 0 };
  const taskSystem = new TaskSystem({ day: 1 });
  taskSystem.startPhaseForTribe(gameTribe, 'day1_phase1');
  taskSystem.createDay1TasksFromPlan(gameTribe, 'day1_phase1', { force: true });
  assert.ok(gameTribe.taskState.tasks.every(task => Array.isArray(task.assignees)));
  const simulationSource = fs.readFileSync(path.resolve('src/modules/systems/TaskSimulationSystem.js'), 'utf8');
  assert.match(simulationSource, /const planAssignments = plan\.assignments \|\| \{\}/);
  assert.match(simulationSource, /mergeIds\('float', plan\.floatIds \|\| plan\.floaterIds/);
});

test('structured memory creates natural future conversation references', () => {
  const members = tribe('Andrea', 'Cirie', 'Boston Rob', 'Ozzy', 'Sandra', 'Tony');
  const memory = {
    playerId: byName('Andrea').id,
    operationalLeaderId: byName('Boston Rob').id,
    practicalProviderId: byName('Ozzy').id,
    leadershipStyle: 'command',
    leadershipStatus: 'contested',
    leadershipAction: 'back_leader',
    assignments: { resources: [byName('Ozzy').id] },
    strongestBond: { people: [byName('Andrea').id, byName('Cirie').id] },
    strongestTension: { people: [byName('Boston Rob').id, byName('Tony').id] },
    firstImpression: { summary: 'You worked hard.' }
  };
  assert.match(buildDay1NpcReference({ memory, speakerId: byName('Cirie').id, members }), /You and I worked well/i);
  assert.match(buildDay1NpcReference({ memory, speakerId: byName('Boston Rob').id, members }), /You backed me/i);
  assert.match(buildDay1NpcReference({ memory, speakerId: byName('Sandra').id, members }), /Ozzy.*Resources/i);
});

test('opening lifecycle finalizes once, saves, creates tasks, cleans up, and will not replay', async () => {
  globalThis.window ||= {};
  globalThis.document ||= { getElementById: () => null };
  globalThis.localStorage ||= { getItem: () => null, setItem: () => {} };
  const { runDay1FirstImpressions } = await import('../src/modules/events/Day1FirstImpressionsEvent.js');
  const members = tribe('Andrea', 'Boston Rob', 'Ozzy', 'Cirie', 'Sandra', 'Tony').map(member => ({ ...member }));
  const player = members[0];
  const gameTribe = { id: 'lifecycle', members, fire: 0, shelter: 0 };
  const records = new Map();
  let saveCount = 0;
  let destroyCount = 0;
  const taskSystem = new TaskSystem({ day: 1 });
  const gameManager = {
    day: 1,
    gamePhase: 'preChallenge',
    flags: {},
    campLog: [],
    systems: {
      relationshipSystem: { getRelationship: () => ({ value: 50 }), setRelationship: () => {} },
      trustSystem: { getTrust: () => 50, changeTrust: () => {} },
      socialMemorySystem: {
        getDay1CampMemories: npcId => records.get(npcId) || [],
        recordStructuredEvent(entry) {
          const list = records.get(entry.listenerId) || [];
          list.push(entry.data);
          records.set(entry.listenerId, list);
        }
      }
    },
    taskSystem,
    getPlayerTribe: () => gameTribe,
    getPlayerSurvivor: () => player,
    getCurrentDay: () => 1,
    getGamePhase: () => 'preChallenge',
    getCurrentCampPhaseId: () => 'day1_phase1',
    saveGame: () => { saveCount += 1; return true; }
  };
  const starts = [];
  const ends = [];
  const stopStart = eventManager.subscribe(GameEvents.CAMP_EVENT_STARTED, payload => starts.push(payload));
  const stopEnd = eventManager.subscribe(GameEvents.CAMP_EVENT_ENDED, payload => ends.push(payload));
  const uiFactory = () => ({
    showArrival: async () => {},
    chooseLeadership: async () => 'automatic',
    settleLeader: async () => {},
    chooseAssignment: async ({ suggestedRole, calculateState }) => calculateState(suggestedRole),
    destroy: () => { destroyCount += 1; }
  });
  try {
    const result = await runDay1FirstImpressions({ gameManager, uiFactory });
    assert.ok(result.plan);
    assert.equal(gameManager.flags.campEventActive, false);
    assert.equal(gameManager.flags.day1FirstImpressionsCompleted, true);
    assert.equal(gameTribe.day1PlanCreated, true);
    assert.ok(gameTribe.taskState.tasks.length > 0);
    assert.equal(gameManager.campLog.filter(entry => entry.id === 'day1_first_impressions').length, 1);
    assert.equal(saveCount, 1);
    assert.equal(destroyCount, 1);
    assert.equal(starts.length, 1);
    assert.equal(ends.length, 1);
    assert.equal(ends[0].completed, true);

    const replay = await runDay1FirstImpressions({ gameManager, uiFactory });
    assert.equal(replay.skipped, true);
    assert.equal(replay.reason, 'already_completed');
    assert.equal(saveCount, 1);
    assert.equal(starts.length, 1);
  } finally {
    stopStart();
    stopEnd();
  }
});

test('camp entry leaves event ownership to CampScreen so Day 1 cannot deadlock before opening', async () => {
  globalThis.window ||= {};
  globalThis.document ||= { getElementById: () => null };
  globalThis.localStorage ||= { getItem: () => null, setItem: () => {} };
  const { canRunDay1FirstImpressions } = await import('../src/modules/events/Day1FirstImpressionsEvent.js');
  const gameManagerSource = fs.readFileSync(path.resolve('src/modules/core/GameManager.js'), 'utf8');
  const campScreenSource = fs.readFileSync(path.resolve('src/modules/screens/CampScreen.js'), 'utf8');
  const members = tribe('Andrea', 'Boston Rob', 'Ozzy', 'Cirie', 'Sandra', 'Tony').map(member => ({ ...member }));
  const player = members[0];
  const gameTribe = { id: 'entry-regression', members };
  const pendingGame = {
    day: 1,
    gamePhase: 'preChallenge',
    flags: {},
    campLog: [],
    getPlayerTribe: () => gameTribe,
    getPlayerSurvivor: () => player,
    getCurrentDay: () => 1,
    getGamePhase: () => 'preChallenge'
  };

  assert.equal(canRunDay1FirstImpressions(pendingGame).ok, true);
  pendingGame.flags.campEventActive = true;
  assert.equal(canRunDay1FirstImpressions(pendingGame).reason, 'camp_event_active');
  assert.doesNotMatch(gameManagerSource, /canRunDay1FirstImpressions/);
  assert.doesNotMatch(gameManagerSource, /Camp systems paused for pending camp event/);

  const setupBody = campScreenSource.match(/setup\(data = \{\}\) \{([\s\S]*?)\n  \}\n\n  async runScriptedPostChallengeFlow/)?.[1] || '';
  assert.equal((setupBody.match(/_startCampClockAfterDay1\(/g) || []).length, 1);
  assert.doesNotMatch(setupBody, /this\.startCampClockTick\(\);\s*\}\s*this\._startCampClockAfterDay1/);
});

test('camp event completion uses one clock restart path', () => {
  const campScreenSource = fs.readFileSync(path.resolve('src/modules/screens/CampScreen.js'), 'utf8');
  const endedHandler = campScreenSource.match(/subscribe\(GameEvents\.CAMP_EVENT_ENDED, \(\{ eventId \}\) => \{([\s\S]*?)\n    \}\);/)?.[1] || '';
  const resumeMethod = campScreenSource.match(/_resumeCampClock\(\) \{([\s\S]*?)\n  \}/)?.[1] || '';
  assert.equal((endedHandler.match(/_resumeCampClock\(/g) || []).length, 1);
  assert.match(resumeMethod, /this\.stopCampClockTick\(\)/);
  assert.equal((resumeMethod.match(/startCampClockTick\(/g) || []).length, 1);
  assert.doesNotMatch(endedHandler, /startDayClockTimer\(/);
});

test('game initialization preserves lifecycle subscribers and camp completion advances the clock', async () => {
  globalThis.window ||= {};
  globalThis.window.setInterval ||= globalThis.setInterval;
  globalThis.window.clearInterval ||= globalThis.clearInterval;
  globalThis.window.setTimeout ||= globalThis.setTimeout;
  globalThis.window.clearTimeout ||= globalThis.clearTimeout;
  globalThis.HTMLElement ||= class HTMLElement {};
  globalThis.document ||= {
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: () => {}
  };
  globalThis.document.getElementById ||= () => null;
  globalThis.document.querySelector ||= () => null;
  globalThis.document.querySelectorAll ||= () => [];
  globalThis.document.addEventListener ||= () => {};
  globalThis.localStorage ||= { getItem: () => null, setItem: () => {} };

  const [{ default: CampScreen }, { gameManager }, { default: timerManager }] = await Promise.all([
    import('../src/modules/screens/CampScreen.js'),
    import('../src/modules/core/GameManager.js'),
    import('../src/modules/utils/TimerManager.js')
  ]);
  const gameManagerSource = fs.readFileSync(path.resolve('src/modules/core/GameManager.js'), 'utf8');
  const player = { ...byName('Andrea') };
  const gameTribe = { id: 'clock-regression', members: [player], shelter: 0 };
  const snapshot = {
    flags: gameManager.flags,
    day: gameManager.day,
    dayTimer: gameManager.dayTimer,
    timeSpeed: gameManager.timeSpeed,
    gamePhase: gameManager.gamePhase,
    survivors: gameManager.survivors,
    tribes: gameManager.tribes,
    player: gameManager.player,
    systems: gameManager.systems
  };
  const previousWindowCampScreen = globalThis.window.campScreen;
  const originalSetInterval = timerManager.setInterval;
  const originalClearInterval = timerManager.clearInterval;
  let intervalCallback = null;
  let intervalStarts = 0;
  const screen = new CampScreen();

  try {
    Object.assign(gameManager, {
      flags: { campEventActive: true, day1FirstImpressionsCompleted: true },
      day: 1,
      dayTimer: 7200,
      timeSpeed: 8,
      gamePhase: 'preChallenge',
      survivors: [player],
      tribes: [gameTribe],
      player,
      systems: {}
    });
    screen.isActive = true;
    screen.currentView = 'tribeFlag';
    screen.ensureClockUI = () => null;
    screen.refreshTaskIconState = () => {};
    screen.updateInventoryDisplay = () => {};

    timerManager.clearInterval = () => true;
    timerManager.setInterval = (id, callback) => {
      assert.equal(id, 'campClockTick');
      intervalCallback = callback;
      intervalStarts += 1;
      return id;
    };

    const subscriberCount = eventManager.getSubscriberCount(GameEvents.CAMP_EVENT_ENDED);
    eventManager.publish(GameEvents.GAME_STARTED, { marker: 'old-history' });
    eventManager.clearHistory();
    assert.equal(eventManager.getHistory().length, 0);
    assert.equal(eventManager.getSubscriberCount(GameEvents.CAMP_EVENT_ENDED), subscriberCount);
    assert.match(gameManagerSource, /eventManager\.clearHistory\(\)/);
    assert.doesNotMatch(gameManagerSource, /eventManager\.clear\(\)/);

    eventManager.publish(GameEvents.CAMP_EVENT_ENDED, {
      eventId: 'day1_first_impressions',
      completed: true
    });
    await screen.clockStartPromise;
    assert.equal(intervalStarts, 1);
    assert.equal(typeof intervalCallback, 'function');

    intervalCallback();
    assert.equal(gameManager.dayTimer, 7192);
  } finally {
    screen.stopCampClockTick();
    screen.unsubscribeFromCampEventStarted?.();
    screen.unsubscribeFromCampEventEnded?.();
    timerManager.setInterval = originalSetInterval;
    timerManager.clearInterval = originalClearInterval;
    Object.assign(gameManager, snapshot);
    globalThis.window.campScreen = previousWindowCampScreen;
  }
});

test('failed task creation rolls back the plan and always releases the camp event flag', async () => {
  globalThis.window ||= {};
  globalThis.document ||= { getElementById: () => null };
  globalThis.localStorage ||= { getItem: () => null, setItem: () => {} };
  const { runDay1FirstImpressions } = await import('../src/modules/events/Day1FirstImpressionsEvent.js');
  const members = tribe('Andrea', 'Boston Rob', 'Ozzy', 'Cirie', 'Sandra', 'Tony').map(member => ({ ...member }));
  const player = members[0];
  const gameTribe = { id: 'rollback', members };
  const gameManager = {
    day: 1,
    gamePhase: 'preChallenge',
    flags: {},
    campLog: [],
    systems: {},
    taskSystem: {
      startPhaseForTribe: () => {},
      createDay1TasksFromPlan: () => { throw new Error('task failure'); }
    },
    getPlayerTribe: () => gameTribe,
    getPlayerSurvivor: () => player,
    getCurrentDay: () => 1,
    getGamePhase: () => 'preChallenge'
  };
  const uiFactory = () => ({
    showArrival: async () => {},
    chooseLeadership: async () => 'automatic',
    settleLeader: async () => {},
    chooseAssignment: async ({ suggestedRole, calculateState }) => calculateState(suggestedRole),
    destroy: () => {}
  });
  await assert.rejects(runDay1FirstImpressions({ gameManager, uiFactory }), /task failure/);
  assert.equal(gameManager.flags.campEventActive, false);
  assert.equal(gameManager.flags.day1FirstImpressionsCompleted, undefined);
  assert.equal(gameTribe.day1Plan, undefined);
  assert.equal(gameTribe.day1PlanCreated, undefined);
  assert.equal(gameManager.campLog.length, 0);
});

function readRgbaPng(filePath) {
  const buffer = fs.readFileSync(filePath);
  assert.equal(buffer.subarray(1, 4).toString(), 'PNG');
  let offset = 8;
  let width;
  let height;
  let colorType;
  const idat = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString();
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      assert.equal(data[8], 8);
      colorType = data[9];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    offset += length + 12;
  }
  assert.equal(colorType, 6, 'asset must remain 8-bit RGBA');
  const packed = inflateSync(Buffer.concat(idat));
  const stride = width * 4;
  const pixels = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y += 1) {
    const filter = packed[y * (stride + 1)];
    const row = packed.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x += 1) {
      const left = x >= 4 ? pixels[y * stride + x - 4] : 0;
      const up = y > 0 ? pixels[(y - 1) * stride + x] : 0;
      const upLeft = y > 0 && x >= 4 ? pixels[(y - 1) * stride + x - 4] : 0;
      let value = row[x];
      if (filter === 1) value = (value + left) & 255;
      if (filter === 2) value = (value + up) & 255;
      if (filter === 3) value = (value + Math.floor((left + up) / 2)) & 255;
      if (filter === 4) {
        const p = left + up - upLeft;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - upLeft);
        value = (value + (pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft)) & 255;
      }
      pixels[y * stride + x] = value;
    }
  }
  return { width, height, pixels };
}

function transparentInteriorBounds(png) {
  const { width, height, pixels } = png;
  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let best = null;
  for (let start = 0; start < width * height; start += 1) {
    if (visited[start] || pixels[start * 4 + 3] >= 8) continue;
    let head = 0;
    let tail = 0;
    let touchesBorder = false;
    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;
    queue[tail++] = start;
    visited[start] = 1;
    while (head < tail) {
      const index = queue[head++];
      const x = index % width;
      const y = Math.floor(index / width);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) touchesBorder = true;
      const neighbors = [index - 1, index + 1, index - width, index + width];
      neighbors.forEach((next, direction) => {
        if (next < 0 || next >= width * height || visited[next]) return;
        if (direction === 0 && x === 0) return;
        if (direction === 1 && x === width - 1) return;
        if (pixels[next * 4 + 3] >= 8) return;
        visited[next] = 1;
        queue[tail++] = next;
      });
    }
    if (!touchesBorder && (!best || tail > best.size)) {
      best = { size: tail, minX, minY, maxX: maxX + 1, maxY: maxY + 1 };
    }
  }
  return best;
}

test('speaker portrait geometry is measured against the real transparent frame opening', () => {
  const asset = path.resolve('Assets/beat-avatar-ui.png');
  const png = readRgbaPng(asset);
  const opening = transparentInteriorBounds(png);
  assert.deepEqual({ width: png.width, height: png.height }, { width: 1024, height: 1536 });
  assert.deepEqual(opening, { size: 61808, minX: 201, minY: 166, maxX: 481, maxY: 456 });
  const crop = {
    x: png.width * DAY1_SPEAKER_PORTRAIT_GEOMETRY.leftPercent / 100,
    y: png.height * DAY1_SPEAKER_PORTRAIT_GEOMETRY.topPercent / 100,
    size: png.width * DAY1_SPEAKER_PORTRAIT_GEOMETRY.widthPercent / 100
  };
  assert.ok(Math.abs(crop.x - opening.minX) < 1);
  assert.ok(Math.abs(crop.y - opening.minY) < 1);
  assert.ok(crop.x + crop.size <= opening.maxX + 1);
  assert.ok(crop.y + crop.size <= opening.maxY + 1);
});

test('scoped setup CSS includes required mobile, landscape, safe-area, and reduced-motion guards', () => {
  const css = fs.readFileSync(path.resolve('src/styles/day1-camp-setup.css'), 'utf8');
  assert.match(css, /height:\s*100dvh/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
  assert.match(css, /max-width:\s*650px/);
  assert.match(css, /orientation:\s*landscape/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /\.day1-setup__board[\s\S]*overflow:\s*auto/);
  assert.match(css, /\.day1-setup__portrait-crop[\s\S]*aspect-ratio:\s*1/);
  assert.match(css, /\.day1-setup__portrait[\s\S]*object-fit:\s*cover/);
});
