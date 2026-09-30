import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import data from '../src/modules/data/GameData.js';
import { LocationKeys as L } from '../src/modules/core/LocationKeys.js';
import { normalizeCampState } from '../src/modules/systems/CampState.js';
import { isNeededCampContribution } from '../src/modules/systems/CampState.js';

// UI boundaries only. All decisions, work, needs, knowledge, locations and save
// restoration below use production systems. Runs are synchronous and isolated.
globalThis.window ||= { debugBanner() {} };
globalThis.window.debugBanner ||= () => {};
globalThis.document ||= { getElementById: () => null, querySelector: () => null };
globalThis.HTMLElement ||= class HTMLElement {};
const { gameManager: gm } = await import('../src/modules/core/GameManager.js');
const { default: CampActivitySystem } = await import('../src/modules/systems/CampActivitySystem.js');
const { default: memoryTemplate } = await import('../src/modules/systems/SocialMemorySystem.js');
const { default: locationTemplate } = await import('../src/modules/systems/NpcLocationSystem.js');
const { default: RelationshipSystem } = await import('../src/modules/systems/RelationshipSystem.js');
const { default: TrustSystem } = await import('../src/modules/systems/TrustSystem.js');
const { default: AllianceSystem } = await import('../src/modules/systems/AllianceSystem.js');
const { default: DealSystem } = await import('../src/modules/systems/DealSystem.js');
const { default: IdolSystem } = await import('../src/modules/systems/IdolSystem.js');
const { default: TaskSystem } = await import('../src/modules/systems/TaskSystem.js');
const { default: TaskSimulationSystem } = await import('../src/modules/systems/TaskSimulationSystem.js');
const { default: strategy } = await import('../src/modules/systems/StrategyPhaseSystem.js');
const { default: TribalKnowledgeModel } = await import('../src/modules/systems/TribalKnowledgeModel.js');

export const CAST = data.getSurvivors();
export const SCENARIOS = Object.freeze(['normal', 'shortage', 'shelter', 'exhausted', 'idol',
  'volatility', 'paranoia', 'alliance', 'mixed']);
export const TRIBE_MIXES = Object.freeze({
  provider: ['Ozzy', 'Wendell', 'Boston Rob', 'Kim', 'Jeremy', 'Sandra'],
  strategist: ['Cirie', 'Parvati', 'Tony', 'Natalie', 'Carolyn', 'Yul'],
  lowWork: ['Russell', 'Tyson', 'Cirie', 'Parvati', 'Carolyn', 'Michele'],
  lowCampcraft: ['Jay', 'Cirie', 'Andrea', 'Kelley', 'Michele', 'Carolyn'],
  balanced: ['Ozzy', 'Tony', 'Cirie', 'Sandra', 'Wendell', 'Jeremy']
});
export function rotatedCastTribes(seed) {
  const names = CAST.map(s => s.firstName), offset = (seed * 5) % names.length;
  const rotated = [...names.slice(offset), ...names.slice(0, offset)];
  return [rotated.slice(0, 6), rotated.slice(6, 12), rotated.slice(12)];
}
const WORK = new Set(['gather_firewood', 'gather_bamboo', 'gather_food', 'collect_water', 'fish',
  'build_fire', 'build_shelter', 'tend_fire']);
const DUTY_WORK = { fire: ['build_fire','tend_fire','gather_firewood'],
  shelter: ['build_shelter','gather_bamboo'], wood: ['gather_firewood','gather_bamboo'],
  resources: ['gather_food','fish','collect_water'] };
const OUTPUT = { gather_firewood: 'firewood', gather_bamboo: 'bamboo', gather_food: 'coconuts',
  fish: 'fish1', collect_water: 'water' };
const CATEGORIES = ['work', 'social', 'strategy', 'rest', 'idol', 'observe', 'investigate', 'travel', 'idle'];
const category = type => WORK.has(type) ? 'work' : ({ socialize: 'social', strategy_conversation: 'strategy',
  idol_hunt: 'idol', idle_at_camp: 'idle' }[type] || type);
const json = value => JSON.parse(JSON.stringify(value));
export function seeded(seed) {
  let state = seed >>> 0;
  const random = () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296);
  random.state = () => state;
  random.restore = saved => { state = saved >>> 0; };
  return random;
}
export function withQaRandom(random, work) {
  const previous = Math.random;
  Math.random = random;
  try { return work(); } finally { Math.random = previous; }
}
export function quiet(work) {
  const log = console.log, info = console.info, debug = console.debug;
  console.log = console.info = console.debug = () => {};
  try { return work(); } finally { console.log = log; console.info = info; console.debug = debug; }
}
const personMetrics = () => ({ seconds: Object.fromEntries(CATEGORIES.map(k => [k, 0])),
  choices: {}, fishingAttempts: 0, fishingOutput: 0, fireAttempts: 0, fireSuccess: 0,
  shelterAttempts: 0, shelterSuccess: 0, resources: 0, conversations: 0, strategyConversations: 0,
  informationShared: 0, directShared: 0, hearsayShared: 0, gossip: 0, lies: 0, disclosures: 0,
  strategyInterruptions: 0, responsibilityPhases: 0, responsibilitySeconds: 0, responsibilityEffortPhases: 0,
  effortPhases: 0, neglect: 0, relationshipDelta: 0, trustDelta: 0 });

/** The production singleton is required by existing Location/Strategy modules.
 * No renderers, lifecycle subscriptions, save storage or challenge/vote execution
 * are started. The human observes from camp and contributes no resources. */
export function makeLivingCampQa({ seed = 1, names = TRIBE_MIXES.balanced, scenario = 'normal' } = {}) {
  if (!SCENARIOS.includes(scenario)) throw Error(`Unknown scenario: ${scenario}`);
  const rng = seeded(seed);
  const members = names.map(name => structuredClone(CAST.find(s => s.firstName === name)));
  if (members.some(s => !s)) throw Error('Unknown production contestant');
  const player = { ...structuredClone(CAST[0]), id: 1001, firstName: 'Observer', name: 'QA Observer', isPlayer: true };
  members.push(player);
  for (const member of members) Object.assign(member, { isOut: false, isPlayer: member === player,
    location: L.BEACH, tribeId: 1, tribeName: 'QA', tribeColor: '#c44', campActivity: null, dealIds: [] });
  const tribe = normalizeCampState({ id: 1, tribeId: 1, name: 'QA', color: '#c44', members,
    fire: scenario === 'shortage' || scenario === 'mixed' ? 0 : 1,
    shelter: scenario === 'shelter' ? 0 : 2,
    stockpile: { firewood: 15, bamboo: 10, palms: 2, water: 22, coconuts: 3 },
    day1Plan: { assignments: { fire: [], shelter: [], wood: [], resources: [], float: [] } } });
  Object.assign(gm, { day: 1, dayTimer: 7200, gameState: 'camp', gamePhase: 'preChallenge', flags: {},
    tribes: [tribe], survivors: members, player, campLog: [], state: { seasonValidation: null }, campSocialChanges: {}, day1Memories: [],
    campNeedElapsed: { water: 0, hunger: 0, rest: 0 }, gameSettings: { enableIdols: true },
    gameHistory: { tribals: [] }, tribalCouncilLog: [], seasonEngine: null,
    // Disable persistence/UI hooks, not simulation.
    saveGame: () => true, requestAutoSave() {}, _updateScreenForState() {} });
  const memory = new memoryTemplate.constructor();
  gm.systems = { socialMemorySystem: memory, npcLocationSystem: new locationTemplate.constructor(),
    relationshipSystem: new RelationshipSystem(gm), trustSystem: new TrustSystem(gm) };
  gm.systems.allianceSystem = new AllianceSystem(gm);
  gm.systems.dealSystem = new DealSystem(gm);
  gm.systems.idolSystem = new IdolSystem(gm);
  gm.systems.taskSimulationSystem = new TaskSimulationSystem(gm);
  gm.taskSystem = new TaskSystem(gm);
  gm.systems.campActivitySystem = new CampActivitySystem(gm, rng);
  window.gameManager = gm; window.campScreen = { currentView: L.BEACH };
  gm.initializeWaterPlanForTribe(tribe);
  gm.systems.npcLocationSystem.lastRoamTimer = 7200;
  gm.systems.npcLocationSystem.lastPhaseUsed = 'preChallenge';
  for (const member of members.filter(s => !s.isPlayer)) gm.systems.npcLocationSystem.updateNpcLocation(member.id, L.BEACH);
  // Real alliances/trust, deterministic IDs; no compatibility-generated wall IDs.
  for (let i = 0; i + 1 < names.length; i += 2) {
    const a = members[i], b = members[i + 1];
    gm.systems.trustSystem.setTrust(a.id, b.id, 75);
    gm.systems.relationshipSystem.setRelationship(a.id, b.id, 70);
    // Normalization is the production save/load path; explicit IDs keep QA
    // independent of generateId's nonsemantic wall-clock component.
    gm.systems.allianceSystem.deserialize({ alliances: [...gm.systems.allianceSystem.alliances,
      { id: `qa-alliance-${i}`, name: `QA ${i}`, memberIds: [a.id, b.id], tribeId: 1, active: true }] });
  }
  const metrics = Object.fromEntries(members.filter(s => !s.isPlayer).map(s => [s.id, personMetrics()]));
  const setup = { gm, rng, scenario, metrics, daily: [], choiceCount: 0, checkpoints: 0, strategyHandoffs: [],
    get tribe() { return gm.getPlayerTribe(); }, get activity() { return gm.systems.campActivitySystem; },
    get memory() { return gm.systems.socialMemorySystem; } };
  attachMetrics(setup);
  return setup;
}
function attachMetrics(setup) {
  const activity = setup.activity, gm = setup.gm;
  const start = activity.start.bind(activity), advance = activity.advance.bind(activity), interrupt = activity.interrupt.bind(activity);
  const complete = activity.complete.bind(activity);
  activity.start = (actor, plan, now) => {
    const a = start(actor, plan, now), m = setup.metrics[actor.id];
    if (a && m && plan.type !== 'travel') {
      m.choices[plan.type] = (m.choices[plan.type] || 0) + 1; setup.choiceCount++;
      if (['socialize', 'strategy_conversation'].includes(plan.type)) m.conversations++;
      if (plan.type === 'strategy_conversation' || plan.socialPurpose === 'strategy') m.strategyConversations++;
    }
    return a;
  };
  activity.advance = (before, after, elapsed = () => {}) => advance(before, after, seconds => {
    for (const npc of activity.npcs()) {
      const type = npc.campActivity?.type, bucket = category(type || 'idle_at_camp');
      if (bucket in setup.metrics[npc.id].seconds) setup.metrics[npc.id].seconds[bucket] += seconds;
      const role = npc.campActivity?.role;
      const fillsNeed = OUTPUT[type] ? isNeededCampContribution(setup.tribe,OUTPUT[type]) :
        type?.includes('fire') ? setup.tribe.fire < 3 : type === 'build_shelter' && setup.tribe.shelter < 4;
      if (DUTY_WORK[role]?.includes(type) || role === 'float' && WORK.has(type) && fillsNeed)
        setup.metrics[npc.id].responsibilitySeconds += seconds;
    }
    elapsed(seconds);
  });
  activity.interrupt = (actor, reason, at) => {
    const result = interrupt(actor, reason, at);
    if (result && reason === 'urgent_information') setup.metrics[actor.id].strategyInterruptions++;
    return result;
  };
  activity.complete = (actor, a, at) => {
    const startLog = gm.campLog.length;
    const known = new Set(Object.entries(setup.memory.memory).flatMap(([owner, mem]) =>
      (mem.campClaims || []).map(c => `${owner}:${c.id}`)));
    const observations = new Set(Object.entries(setup.memory.memory).flatMap(([owner, mem]) =>
      (mem.campObservations || []).map(c => `${owner}:${c.id}`)));
    const result = complete(actor, a, at);
    if (!result) return result;
    for (const entry of gm.campLog.slice(startLog)) {
      const m = setup.metrics[entry.actorId]; if (!m) continue;
      if (entry.resource === 'fish1') { m.fishingAttempts++; m.fishingOutput += entry.amount; }
      if (entry.type === 'camp_fire_build') { m.fireAttempts++; m.fireSuccess += Number(entry.success); }
      if (entry.type === 'camp_shelter_build') { m.shelterAttempts++; m.shelterSuccess += Number(entry.success); }
      m.resources += entry.amount || 0;
    }
    for (const [owner, mem] of Object.entries(setup.memory.memory)) for (const claim of mem.campClaims || []) {
      if (known.has(`${owner}:${claim.id}`)) continue;
      if (claim.truthfulness === false) setup.metrics[claim.speakerId].lies++;
      if (String(owner) === String(claim.speakerId) || claim.sourceId == null) continue;
      const m = setup.metrics[claim.sourceId]; if (!m) continue;
      m.informationShared++;
      if (claim.origin === 'direct_statement') m.directShared++;
      if (claim.origin === 'hearsay') m.hearsayShared++;
      if (claim.topic === 'idol_possession') m.disclosures++;
    }
    for (const [owner, mem] of Object.entries(setup.memory.memory)) for (const obs of mem.campObservations || []) {
      if (!observations.has(`${owner}:${obs.id}`) && obs.origin === 'hearsay' && setup.metrics[obs.sourceId])
        setup.metrics[obs.sourceId].gossip++;
    }
    return result;
  };
}

function configureDay(setup) {
  const { gm, scenario, tribe, memory } = setup, npcs = tribe.members.filter(s => !s.isPlayer);
  gm.flags = { campEventActive: false }; gm.gamePhase = 'preChallenge'; gm.dayTimer = 7200;
  gm.campNeedElapsed = { water: 0, hunger: 0, rest: 0 };
  gm.systems.idolSystem.startNewCampPhase('qa-day');
  // Boundary stressors, not replacement decisions. Stable camp receives no fake
  // work; crisis scenarios impose a small daily setback and no free outputs.
  if (['shortage', 'mixed'].includes(scenario)) {
    tribe.stockpile.water = Math.min(tribe.stockpile.water, 3);
    tribe.stockpile.coconuts = tribe.stockpile.fish1 = 0;
    tribe.stockpile.firewood = Math.min(tribe.stockpile.firewood, 2);
    tribe.fire = Math.min(tribe.fire, 1);
  }
  if (scenario === 'shelter') {
    tribe.shelter = Math.min(tribe.shelter, 1);
    tribe.stockpile.bamboo = Math.max(10, tribe.stockpile.bamboo);
    // First day includes supplies; later days expose missing material handling.
  }
  if (scenario === 'exhausted' && gm.day === 1) for (const s of npcs) { s.rest = 12; s.hunger = 30; }
  if (['idol', 'alliance'].includes(scenario)) {
    tribe.fire = 3; tribe.shelter = 4;
    tribe.stockpile.water = Math.max(30, tribe.stockpile.water);
    tribe.stockpile.coconuts = Math.max(5, tribe.stockpile.coconuts);
  }
  normalizeCampState(tribe);
  // Rotated duties remove fixed cast/role assignment bias over repeated days.
  const roles = ['fire', 'shelter', 'wood', 'resources', 'float'];
  tribe.day1Plan.assignments = Object.fromEntries(roles.map(r => [r, []]));
  npcs.forEach((s, i) => tribe.day1Plan.assignments[roles[(i + gm.day + setup.rng.state() % 5) % 5]].push(s.id));
  gm.taskSystem.startPhaseForTribe(tribe);
  const idolSystem = gm.systems.idolSystem;
  if (!idolSystem.initialSpawnCompleted) {
    // A fixed hidden location makes supply/search reproducible, without leaking
    // the location to NPC decisions. Production hunt/clue rules resolve it.
    idolSystem.tribeIdolStates.set(1, { id: 'qa-idol', tribeId: 1, locationKey: L.JUNGLE_TRAIL, isFound: false, isUsed: false });
    idolSystem.initialSpawnCompleted = true;
  }
  if (['paranoia', 'mixed'].includes(scenario)) for (const owner of npcs.slice(0, -1))
    for (let i = 0; i < 3; i++) memory.recordCampObservation({ id: `qa:${gm.day}:${owner.id}:${i}`,
      actorId: npcs.at(-1).id, witnessIds: [owner.id], type: 'absence', location: L.BEACH,
      day: gm.day, campTime: 7200 + i * 60, visibility: 'movement' });
  if (['idol', 'alliance'].includes(scenario)) {
    // Expose a legitimate disclosure opportunity; only the holder knows the idol.
    const holder = npcs[0]; holder.hasIdol = true;
    idolSystem.getSurvivorInventory(holder.id).idols = [{ id: 'qa-owned', isUsed: false }];
  }
  setup.activity.ensureStarted();
}
export function semanticSnapshot(setup) {
  const payload = json(setup.gm.createSavePayload());
  delete payload.savedAt;
  // Existing wall-clock logging metadata is not gameplay state.
  const strip = value => {
    if (!value || typeof value !== 'object') return;
    for (const key of Object.keys(value)) {
      if (['timestamp', 'updatedAt', 'createdAt', 'savedAt'].includes(key)) delete value[key];
      else strip(value[key]);
    }
  };
  strip(payload);
  return { payload, rng: setup.rng.state(), metrics: json(setup.metrics), daily: json(setup.daily) };
}
function resume(setup) {
  const payload = json(setup.gm.createSavePayload()), state = setup.rng.state();
  if (!setup.gm.restoreSavePayload(payload)) throw Error('Production save restoration failed');
  setup.rng.restore(state);
}
function validate(setup) {
  const { tribe, activity, gm } = setup;
  for (const [key, value] of Object.entries(tribe.stockpile)) if (!Number.isFinite(value) || value < 0)
    throw Error(`Invalid resource ${key}: ${value}`);
  for (const npc of activity.npcs()) {
    const a = npc.campActivity;
    if (a && gm.systems.npcLocationSystem.getLocation(npc.id) !== a.location) throw Error('Physical activity mismatch');
    if (a && activity.resolved.has(a.id)) throw Error('Resolved activity still active');
    const mem = setup.memory.memory[npc.id];
    if (mem?.campClaims?.length > 40 || mem?.campObservations?.length > 48) throw Error('Unbounded camp memory');
    if (mem?.campClaims?.some(c => c.truthfulness === false && String(c.speakerId) !== String(npc.id))) throw Error('Hidden lie leaked');
  }
  const knowledge = new TribalKnowledgeModel(gm, tribe.members);
  if (knowledge.publicFacts().some(f => f.source === 'campMemory')) throw Error('Private camp memory became public');
}
export function runLivingCamp({ days = 4, reload = false, ...options } = {}) {
  return quiet(() => {
    const setup = makeLivingCampQa(options);
    return withQaRandom(setup.rng, () => {
      for (let day = 1; day <= days; day++) {
        setup.gm.day = day; configureDay(setup);
        const dutyBefore = Object.fromEntries(Object.entries(setup.metrics).map(([id,m]) => [id,m.responsibilitySeconds]));
        let reloaded = false;
        let warned = false;
        while (setup.gm.dayTimer > 0) {
          if (!warned && ['volatility', 'mixed'].includes(setup.scenario) && setup.gm.dayTimer <= 6600) {
            const npcs = setup.activity.npcs();
            for (let i = 0; i < npcs.length; i += 2) setup.memory.recordConversationIntent({
              npcId: npcs[i].id, withId: npcs[(i + 1) % npcs.length].id,
              targetId: npcs[(i + 2) % npcs.length].id, intent: 'warning', day,
              campTime: setup.gm.dayTimer, urgency: 1 });
            warned = true;
          }
          setup.gm.advanceCampTime(Math.min(60, setup.gm.dayTimer), { source: 'clock' });
          if (reload && !reloaded && setup.gm.dayTimer <= 4140) { resume(setup); reloaded = true; }
        }
        validate(setup);
        for (const npc of setup.activity.npcs()) {
          const m = setup.metrics[npc.id]; m.responsibilityPhases++;
          if (m.responsibilitySeconds - dutyBefore[npc.id] >= 180) m.responsibilityEffortPhases++;
          if ((setup.activity.effort[npc.id] || 0) >= 180) m.effortPhases++;
          m.neglect += setup.activity.reputationEvents.has(`neglect:${setup.activity.phaseId}:${npc.id}`) ? 1 : 0;
        }
        const avg = key => setup.activity.npcs().reduce((n, s) => n + s[key], 0) / setup.activity.npcs().length;
        setup.daily.push({ day, fire: setup.tribe.fire, shelter: setup.tribe.shelter, water: setup.tribe.stockpile.water,
          food: ['coconuts', 'fish1', 'fish2', 'fish3'].reduce((n, k) => n + setup.tribe.stockpile[k], 0),
          hunger: avg('hunger'), hydration: avg('water'), rest: avg('rest') });
        setup.gm.gamePhase = 'postChallenge'; strategy.reset({ skipGameManager: true });
        strategy.seedNpcIntentTargetsForPhase();
        setup.strategyHandoffs.push(setup.activity.npcs().map(s => ({ id: s.id, target: strategy.getNpcTargetIntent(s.id)?.targetId })));
        strategy.reset({ skipGameManager: true });
        // Existing inter-day tribe-health consequence; no synthetic meal or sleep
        // replenishment is inserted into the simulation to disguise deficits.
        setup.gm.updateTribeHealth();
      }
      for (const npc of setup.activity.npcs()) {
        const others = setup.activity.npcs().filter(s => s.id !== npc.id);
        const partner = setup.gm.systems.allianceSystem.getAlliancesForSurvivor(npc.id)[0]?.memberIds.find(id => id !== npc.id);
        const initialAverage = baseline => (baseline + 50 * (others.length-1)) / others.length;
        setup.metrics[npc.id].relationshipDelta = others.reduce((n,s) => n + (setup.gm.systems.relationshipSystem.getRelationship(npc.id,s.id)?.value ?? 50),0) / others.length - (partner == null ? 50 : initialAverage(70));
        setup.metrics[npc.id].trustDelta = others.reduce((n,s) => n + setup.gm.getTrust(npc.id,s.id),0) / others.length - (partner == null ? 50 : initialAverage(75));
      }
      return { scenario: setup.scenario, mix: options.mix || 'rotatingCast', names: options.names || TRIBE_MIXES.balanced, days,
        choiceCount: setup.choiceCount, metrics: json(setup.metrics), daily: json(setup.daily),
        handoffs: json(setup.strategyHandoffs), semantic: semanticSnapshot(setup) };
    });
  });
}
export function aggregate(runs) {
  const result = { runs: runs.length, phases: 0, choices: 0, contestants: {}, health: {}, compositions: {} };
  for (const run of runs) {
    result.phases += run.days; result.choices += run.choiceCount;
    for (const [id, m] of Object.entries(run.metrics)) {
      const total = result.contestants[id] ||= personMetrics();
      for (const [key, value] of Object.entries(m)) {
        if (typeof value === 'number') total[key] += value;
        else for (const [sub, n] of Object.entries(value)) total[key][sub] = (total[key][sub] || 0) + n;
      }
    }
    const summary = result.health[run.scenario] ||= { phases: 0, fire: 0, shelter: 0, water: 0, food: 0, hunger: 0, hydration: 0, rest: 0 };
    for (const phase of run.daily) { summary.phases++; for (const key of Object.keys(summary)) if (key !== 'phases') summary[key] += phase[key]; }
    const mix = result.compositions[run.mix] ||= { phases: 0, fire: 0, shelter: 0, water: 0, food: 0, hunger: 0, hydration: 0, rest: 0 };
    for (const phase of run.daily) { mix.phases++; for (const key of Object.keys(mix)) if (key !== 'phases') mix[key] += phase[key]; }
  }
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const seeds = Number(process.argv[process.argv.indexOf('--seeds') + 1]) || 12;
  const days = Number(process.argv[process.argv.indexOf('--days') + 1]) || 4;
  const output = process.argv.includes('--output') ? process.argv[process.argv.indexOf('--output') + 1] : null;
  const runs = [];
  const rotating = [];
  for (const scenario of SCENARIOS) for (let seed = 1; seed <= seeds; seed++) {
    for (const [mix, names] of Object.entries(TRIBE_MIXES)) runs.push(runLivingCamp({ seed, days, names, scenario, mix }));
    for (const names of rotatedCastTribes(seed)) rotating.push(runLivingCamp({ seed, days, names, scenario }));
  }
  const summary = { ...aggregate(runs), production: aggregate(rotating) };
  const text = JSON.stringify(summary, null, 2) + '\n';
  if (output) fs.writeFileSync(output, text); else console.log(text);
}
