import assert from 'node:assert/strict';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { makeLivingCampQa, quiet } from './LivingCampSimulationHarness.mjs';
const { default: CampActivitySystem, routeBetween } = await import('../src/modules/systems/CampActivitySystem.js');
const { default: ScrambleActivityPlan, ScrambleState } = await import('../src/modules/systems/ScrambleActivityPlan.js');
const { default: strategy } = await import('../src/modules/systems/StrategyPhaseSystem.js');
const { default: social } = await import('../src/modules/systems/SocialEngine.js');
const { default: ConversationSystem } = await import('../src/modules/systems/ConversationSystem.js');
const { default: TribalCouncilSystem } = await import('../src/modules/systems/TribalCouncilSystem.js');
import { isCampPhysicallyPresent } from '../src/modules/locations/CampPresence.js';
import { campGroups } from '../src/modules/ui/CampPresentation.js';

export const SCRAMBLE_SCENARIOS = ['clear-majority', 'divided', 'player-danger', 'swing-player', 'alliance-disagreement', 'late-change'];
export function makeScrambleQa({ seed = 73, scenario = 'divided', start = true, names = undefined } = {}) {
  const setup = quiet(() => makeLivingCampQa({ seed, ...(names?{names}:{}) }));
  const gm = setup.gm;
  strategy.reset(); gm.gamePhase = 'postChallenge'; gm.dayTimer = 3600;
  gm.flags = {}; gm.lastChallengeResult = null;
  gm.systems.strategyPhaseSystem = strategy; gm.systems.socialEngine = social;
  gm.systems.campActivitySystem = new CampActivitySystem(gm);
  gm.systems.conversationSystem = new ConversationSystem(gm);
  // Disable screen/auto-save boundaries, not production simulation logic.
  gm.requestAutoSave = () => {}; gm._updateScreenForState = () => {};
  window.campScreen = { currentView: 'beach', loadView(view) { this.currentView = view; } };
  gm.systems.npcLocationSystem.phaseAssigned = true;
  const npcs = gm.getPlayerTribe().members.filter(s => !s.isPlayer);
  const [a, b, c] = npcs;
  gm.systems.allianceSystem.deserialize({ alliances: [
    { id: 'qa-core', name: 'Core', active: true, memberIds: [gm.player.id, a.id, b.id, c.id], tribeId: 1 }
  ] });
  if (scenario === 'swing-player') gm.systems.allianceSystem.deserialize({ alliances: [
    { id: 'qa-left', name: 'Left', active: true, memberIds: [gm.player.id, a.id, b.id], tribeId: 1 },
    { id: 'qa-right', name: 'Right', active: true, memberIds: [gm.player.id, c.id, npcs[3].id], tribeId: 1 }
  ] });
  if (start) {
    strategy.startedForPhaseKey = `${gm.day}-postChallenge`; strategy.isActive = true;
    strategy.playerTribeSafe = false; strategy.scrambleState = ScrambleState.ACTIVE;
    strategy.scramble = new ScrambleActivityPlan(gm, strategy, { rngState: seed });
    strategy.seedNpcIntentTargetsForPhase();
    npcs.forEach((npc, i) => strategy.updateNpcIntentTarget(npc.id,
      scenario === 'player-danger' ? gm.player.id : scenario === 'clear-majority' ? npcs.at(-1).id === npc.id ? b.id : npcs.at(-1).id :
        scenario === 'alliance-disagreement' ? npcs[(i + 1) % npcs.length].id :
        scenario === 'swing-player' ? i < 3 ? npcs[4].id : npcs[1].id : i % 2 ? a.id : b.id,
      { reason: 'qa:initial', absoluteConfidence: .35 }));
    strategy.scramble.scheduleAlliances(); gm.systems.campActivitySystem.ensureStarted();
  }
  const activity = gm.systems.campActivitySystem;
  return { gm, strategy, activity, conversation: gm.systems.conversationSystem, npcs,
    get memory() { return gm.systems.socialMemorySystem; },
    present: (person, location) => isCampPhysicallyPresent(person, gm.systems.npcLocationSystem, location, gm),
    wait(seconds = 60) { return quiet(() => gm.consumeCampTime(seconds, { source: 'scramble_wait' })); },
    restore() { const payload = JSON.parse(JSON.stringify(gm.createSavePayload()));
      assert.ok(quiet(() => gm.restoreSavePayload(payload))); return payload; },
    idle(place = 'beach') { for (const person of activity.npcs()) {
      person.campActivity = null; activity.start(person, { type: 'idle_at_camp', location: place, duration: 3000 });
    } },
    move(place) {
      const seconds = routeBetween(gm.player.location, place).length * 30;
      if (!seconds) return;
      const travel = activity.start(gm.player, { type: 'travel', location: place, duration: seconds, external: true });
      gm.consumeCampTime(seconds, { source: 'camp_travel' }); activity.finishPlayerBlock(travel);
      if (!strategy.isActive) return;
      gm.player.location = place;
      window.campScreen.currentView = place;
    }
  };
}
export function scrambleProjection(s) {
  const gm = s.gm;
  return { remaining: gm.dayTimer, phase: s.strategy.scrambleState,
    intents: [...s.strategy.npcIntentTargets], confidence: [...s.strategy.npcIntentMeta], board: s.strategy.tribalTargetBoard,
    activities: gm.getPlayerTribe().members.map(p => [p.id, p.location, p.campActivity]),
    plan: s.strategy.scramble?.serialize(), facts: s.strategy.strategyFacts,
    memory: gm.systems.socialMemorySystem.serialize(), alliances: gm.systems.allianceSystem.serialize(),
    deals: gm.systems.dealSystem.serialize() };
}
export function runScrambleScenario(scenario, { seed = 73, reload = false } = {}) {
  const s = makeScrambleQa({ seed, scenario }), actions = [];
  const activityTypes = new Set(); let transitViolations = 0, movement = 0, savedAt = null;
  const initialIntents = [...s.strategy.npcIntentTargets];
  const original = s.activity.start.bind(s.activity);
  s.activity.start = (actor, plan, now) => {
    activityTypes.add(plan.type); const block = original(actor, plan, now);
    if (block?.type === 'travel') { movement++; if (s.present(actor, block.location)) transitViolations++; }
    return block;
  };
  for (let i = 0; s.gm.dayTimer > 0 && i < 80; i++) {
    if (savedAt === null && s.gm.dayTimer < 2100) {
      s.wait(s.gm.dayTimer - 1800); actions.push('halfway_wait');
      savedAt = s.gm.dayTimer; if (reload) s.restore();
    }
    if (i % 8 === 2) { s.move(['beach', 'waterWell', 'shelter'][Math.floor(i / 8) % 3]); actions.push('travel'); }
    else {
      const nearby = s.activity.npcs().find(npc => s.present(npc, s.gm.player.location) && npc.campActivity?.interruptible !== false);
      if (i % 6 === 3 && nearby && s.activity.beginConversation(nearby, { location: s.gm.player.location })) {
        s.activity.finishConversation({ turns: 2, strategy: true, topics: 'verify_story' }); actions.push('strategic_conversation');
      } else { s.wait(45); actions.push('wait'); }
    }
    if (scenario === 'late-change' && s.gm.dayTimer <= 600 && s.gm.dayTimer > 90 && !actions.includes('late_counter')) {
      const npc = s.activity.npcs().find(p => p.campActivity?.interruptible !== false && s.present(p, s.gm.systems.npcLocationSystem.getLocation(p.id)));
      const target = s.activity.npcs().find(p => p.id !== npc?.id && p.id !== s.strategy.getNpcTargetIntent(npc?.id)?.targetId);
      if (npc && target) {
        s.move(s.gm.systems.npcLocationSystem.getLocation(npc.id));
        if (s.activity.beginConversation(npc, { location: s.gm.player.location })) {
          // Real accepted-counter dialogue callback, UI rendering stubbed only.
          s.conversation._renderMenu = () => {}; s.conversation._getActiveTranscriptSession = () => ({ addYou() {}, addNpc() {} });
          s.gm.systems.relationshipSystem.setRelationship(npc.id, target.id, 0);
          s.conversation._resolveNpcIntentCounter({ npc, player: s.gm.player, intent: { type: 'vote_pitch', targetId: s.strategy.getNpcTargetIntent(npc.id)?.targetId }, context: { phase: 'post' }, counterTarget: target });
          s.activity.finishConversation({ turns: 1, strategy: true, topics: 'pitch_target' }); actions.push('late_counter');
        }
      }
    }
  }
  assert.equal(s.gm.dayTimer, 0); assert.equal(s.strategy.scrambleState, ScrambleState.BEFORE_TRIBAL);
  assert.equal(transitViolations, 0);
  const tribal = new TribalCouncilSystem(s.gm, { publish() {} }); tribal.buildTribeContext(1);
  return { scenario, seed, elapsedMinutes: 60, actions, activityTypes: [...activityTypes],
    movement, savedAt, initialIntents, npcApproaches: s.strategy.scramble.history.filter(h => h.type === 'npc_approach').length,
    meetingEvents: s.strategy.scramble.history.filter(h => h.type.startsWith('meeting_')),
    meetings: s.strategy.scramble.meetings.map(m => ({ id: m.id, status: m.status })),
    conversations: s.strategy.scramble.history.filter(h => h.type === 'conversation_resolved').length,
    intentChanges: s.strategy.strategyFacts.filter(f => f.type === 'npcIntentTargetUpdated').length,
    facts: s.strategy.strategyFacts.length, rumors: Object.values(s.memory.memory).reduce((n, mem) => n + (mem.campClaims?.filter(c => c.origin === 'hearsay').length || 0), 0),
    deals: Object.keys(s.gm.systems.dealSystem.dealsById).length,
    finalBoard: s.strategy.tribalTargetBoard,
    tribalInputs: tribal.voters.filter(v => !v.isPlayer).map(v => ({ id: v.id, intent: s.strategy.getNpcTargetIntent(v.id) })),
    projection: scrambleProjection(s) };
}
export function validateScrambleHarness() {
  return quiet(() => SCRAMBLE_SCENARIOS.map((scenario, index) => {
    const uninterrupted = runScrambleScenario(scenario, { seed: 73 + index });
    const restored = runScrambleScenario(scenario, { seed: 73 + index, reload: true });
    assert.deepEqual(restored.projection, uninterrupted.projection, `${scenario} save equivalence`);
    const { projection, ...report } = restored;
    return { ...report, saveLoadEquivalent: true };
  }));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const report = validateScrambleHarness();
  if (process.env.SCRAMBLE_QA_OUTPUT) fs.writeFileSync(process.env.SCRAMBLE_QA_OUTPUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
