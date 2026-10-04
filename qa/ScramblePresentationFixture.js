import './LivingCampPresentationFixture.js';
const { default: strategy } = await import('../src/modules/systems/StrategyPhaseSystem.js');
const { default: ScrambleActivityPlan, ScrambleState } = await import('../src/modules/systems/ScrambleActivityPlan.js');
const { default: AllianceSystem } = await import('../src/modules/systems/AllianceSystem.js');
const { default: DealSystem } = await import('../src/modules/systems/DealSystem.js');
const { gm, screen, renderer, activity } = window.campQa;
gm.systems.strategyPhaseSystem = strategy;
gm.systems.allianceSystem = new AllianceSystem(gm); gm.systems.dealSystem = new DealSystem(gm);
window.scrambleQa = {
  gm, screen, renderer, activity, strategy,
  reset(seed = 79) {
    gm.systems.conversationSystem.closeConversation('qa_reset'); renderer.closeSheet(false); strategy.reset();
    gm.gamePhase = 'postChallenge'; gm.dayTimer = 3600; gm.flags = {}; gm.campNeedElapsed = { water: 0, hunger: 0, rest: 0 };
    strategy.isActive = true; strategy.scrambleState = ScrambleState.ACTIVE; strategy.startedForPhaseKey = `${gm.day}-postChallenge`;
    strategy.scramble = new ScrambleActivityPlan(gm, strategy, { rngState: seed });
    activity.phaseId = activity.phase; activity.resolved.clear(); activity.conversation = null; activity.nextId = 1;
    const npcs = activity.npcs();
    for (const person of npcs) { person.campActivity = null; activity.start(person, { type: 'idle_at_camp', location: 'beach', duration: 3000 }); }
    gm.player.campActivity = null; gm.player.location = 'beach';
    gm.systems.allianceSystem.deserialize({ alliances: [{ id: 'qa-core', name: 'Camp allies', memberIds: [gm.player.id, ...npcs.slice(0, 3).map(s => s.id)], active: true, tribeId: 1 }] });
    strategy.seedNpcIntentTargetsForPhase(); strategy.scramble.scheduleAlliances();
    screen.currentView = 'beach'; screen.loadView('beach', { travelPaid: true }); screen.renderClockUI(); renderer.signature = null; renderer.refresh();
  },
  natural(seed = 79) { this.reset(seed); for (const npc of activity.npcs()) npc.campActivity = null; activity.ensureStarted(); renderer.refresh(); },
  wait(seconds = 60) { gm.consumeCampTime(seconds, { source: 'scramble_wait' }); renderer.refresh(); },
  local(view = 'beach') {
    this.reset(); strategy.scramble.meetings = []; strategy.scramble.nextApproachAt = -1;
    const [a, b, c] = activity.npcs();
    for (const person of activity.npcs()) { person.campActivity = null; activity.start(person, { type: 'idle_at_camp', location: 'mountainTrail', duration: 3000 }); }
    activity.start(b, { type: 'idle_at_camp', location: view, duration: 3000 });
    activity.start(a, { type: 'strategy_conversation', location: view, targetId: b.id, duration: 300 });
    activity.start(c, { type: 'observe', location: view, duration: 3000 });
    gm.player.location = view; screen.currentView = view; screen.loadView(view, { travelPaid: true }); renderer.refresh();
    return { aId: a.id, bId: b.id, cId: c.id };
  },
  meeting() {
    this.reset(); const meeting = strategy.scramble.meetings[0]; meeting.dueAt = 3600;
    strategy.onActivityBoundary(3600); this.wait(180); gm.player.location = meeting.location;
    screen.currentView = meeting.location; screen.loadView(meeting.location, { travelPaid: true }); renderer.refresh();
    return { id: meeting.id, status: meeting.status };
  },
  invite() { this.reset(); strategy.scramble.meetings = []; strategy.scramble.nextApproachAt = 3600;
    strategy.onActivityBoundary(3600); this.wait(45); renderer.refresh(); return strategy.scramble.invitation; },
  restore() { const save = JSON.parse(JSON.stringify(gm.createSavePayload())); gm.restoreSavePayload(save);
    screen.loadView(gm.player.location, { travelPaid: true }); renderer.signature = null; renderer.refresh(); }
};
window.scrambleQa.natural(); window.scrambleQaReady = true;
