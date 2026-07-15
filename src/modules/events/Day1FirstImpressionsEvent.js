import eventManager, { GameEvents } from '../core/EventManager.js';
import { GamePhase } from '../core/GameManager.js';
import { gameManager as sharedGameManager } from '../core/index.js';
import { getSurvivorAvatarSrc } from '../ui/JourneyBeatUI.js';
import {
  applyLeadershipDecision,
  getContextualLeadershipDecision,
  getDay1LeaderLine,
  resolveDay1Leadership,
  scanDay1Tribe
} from './Day1CampIdentity.js';
import {
  buildDay1Plan,
  buildSuggestedDay1Assignments,
  rebalanceDay1Assignments
} from './Day1CampAssignmentResolver.js';
import Day1CampSetupUI from './Day1CampSetupUI.js';
import {
  applyDay1CampConsequences,
  createCanonicalDay1CampMemory,
  deriveDay1FirstImpression,
  recordDay1CampOutcome,
  resolveDay1CampMood,
  resolveDay1SocialPulse
} from './Day1CampMemory.js';
import { resolveDay1Player } from './Day1CampPlayer.js';

export {
  runDay1FirstImpressionsPart2FromCheckpoint,
  runPart2FromCheckpointReport
} from './Day1CampCheckpointEvent.js';

const EVENT_ID = 'day1_first_impressions';
const SUPPORTED_TRIBE_SIZES = new Set([6, 9]);

function cloneJson(value) {
  if (value == null) return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
}

function getPlayerTribe(gameManager) {
  return gameManager?.getPlayerTribe?.() || gameManager?.playerTribe || null;
}

function hasCompletedDay1(gameManager, tribe) {
  const logged = (gameManager?.campLog || []).some(entry => entry?.id === EVENT_ID);
  const flagged = Boolean(
    gameManager?.flags?.day1FirstImpressionsCompleted
    || gameManager?.flags?.day1FirstImpressionsDone
  );
  return Boolean(flagged || logged || tribe?.day1PlanCreated || tribe?.day1Plan);
}

export function canRunDay1FirstImpressions(gameManager) {
  const tribe = getPlayerTribe(gameManager);
  const members = tribe?.members || [];
  const player = resolveDay1Player(gameManager, tribe);
  const overlayExists = typeof document !== 'undefined' && Boolean(document.getElementById('day1-event-overlay'));
  const details = {
    day: gameManager?.getCurrentDay?.() ?? gameManager?.day,
    phase: gameManager?.getGamePhase?.() || gameManager?.gamePhase,
    tribeId: tribe?.id || null,
    tribeSize: members.length,
    playerId: player?.id || null
  };

  if (!gameManager || !tribe || !members.length) return { ok: false, reason: 'missing_game_state', details };
  if (!player) return { ok: false, reason: 'missing_player', details };
  if (overlayExists) return { ok: false, reason: 'overlay_exists', details };
  if (gameManager.flags?.campEventActive) return { ok: false, reason: 'camp_event_active', details };
  if (hasCompletedDay1(gameManager, tribe)) return { ok: false, reason: 'already_completed', details };
  if (details.day !== 1) return { ok: false, reason: 'wrong_day', details };
  if (details.phase && details.phase !== GamePhase.PRE_CHALLENGE) return { ok: false, reason: 'wrong_phase', details };
  if (!SUPPORTED_TRIBE_SIZES.has(members.length)) return { ok: false, reason: 'unsupported_tribe_size', details };
  return { ok: true, reason: 'ready', details };
}

function leadershipContext(gameManager) {
  const relationships = gameManager?.systems?.relationshipSystem;
  const trust = gameManager?.systems?.trustSystem;
  return {
    getRelationship: (aId, bId) => relationships?.getRelationship?.(aId, bId)?.value ?? 50,
    getTrust: (aId, bId) => {
      const direct = gameManager?.getTrust?.(aId, bId);
      if (Number.isFinite(direct)) return direct;
      const systemValue = trust?.getTrust?.(aId, bId);
      return Number.isFinite(systemValue) ? systemValue : 50;
    },
    getSuspicion: survivor => survivor?.suspicion ?? 0
  };
}

function captureFinalizationState(gameManager, tribe, player) {
  return {
    tribe: {
      day1Plan: tribe.day1Plan,
      day1PlanCreated: tribe.day1PlanCreated,
      day1Mood: tribe.day1Mood,
      day1Choice: tribe.day1Choice,
      day1Memories: cloneJson(tribe.day1Memories),
      taskState: cloneJson(tribe.taskState)
    },
    game: {
      campLog: cloneJson(gameManager.campLog),
      day1Memories: cloneJson(gameManager.day1Memories),
      done: gameManager.flags?.day1FirstImpressionsDone,
      completed: gameManager.flags?.day1FirstImpressionsCompleted
    },
    player: {
      teamPlayer: player.teamPlayer,
      suspicion: player.suspicion,
      threat: player.threat
    }
  };
}

function restoreFinalizationState(gameManager, tribe, player, snapshot) {
  Object.assign(tribe, snapshot.tribe);
  gameManager.campLog = snapshot.game.campLog;
  gameManager.day1Memories = snapshot.game.day1Memories;
  gameManager.flags.day1FirstImpressionsDone = snapshot.game.done;
  gameManager.flags.day1FirstImpressionsCompleted = snapshot.game.completed;
  Object.assign(player, snapshot.player);
}

export function finalizeDay1CampSetup({
  gameManager,
  tribe,
  members,
  player,
  leadership,
  leadershipAction,
  suggestedRole,
  finalState
}) {
  const snapshot = captureFinalizationState(gameManager, tribe, player);
  const plan = buildDay1Plan({
    assignments: finalState.assignments,
    leadership,
    playerId: player.id,
    playerRole: finalState.playerRole,
    suggestedRole,
    leadershipAction,
    impression: finalState.impression,
    socialPulse: finalState.socialPulse,
    mood: finalState.mood
  });

  try {
    tribe.day1Plan = plan;
    tribe.day1PlanCreated = true;
    tribe.day1Mood = finalState.mood;
    tribe.day1Choice = finalState.playerRole;

    const taskSystem = gameManager.taskSystem || gameManager.systems?.taskSystem;
    const phaseId = taskSystem?.getCurrentPhaseId?.(gameManager)
      ?? gameManager.getCurrentCampPhaseId?.()
      ?? 'day1_phase1';
    taskSystem?.startPhaseForTribe?.(tribe, phaseId);
    taskSystem?.createDay1TasksFromPlan?.(tribe, phaseId, { force: true });

    applyDay1CampConsequences({
      gameManager,
      player,
      impression: finalState.impression,
      socialPulse: finalState.socialPulse
    });
    const canonicalMemory = createCanonicalDay1CampMemory({
      day: gameManager.getCurrentDay?.() ?? gameManager.day ?? 1,
      phase: gameManager.getGamePhase?.() || gameManager.gamePhase,
      tribeId: tribe.id,
      leadership,
      leadershipAction,
      assignments: finalState.assignments,
      player,
      playerRole: finalState.playerRole,
      impression: finalState.impression,
      socialPulse: finalState.socialPulse,
      mood: finalState.mood
    });
    recordDay1CampOutcome({ gameManager, tribe, members, canonicalMemory });

    gameManager.flags.day1FirstImpressionsDone = true;
    gameManager.flags.day1FirstImpressionsCompleted = true;
    let saved = true;
    try {
      const saveResult = gameManager.saveGame?.();
      if (saveResult === false) saved = false;
    } catch {
      saved = false;
    }
    return { plan, canonicalMemory, saved };
  } catch (error) {
    restoreFinalizationState(gameManager, tribe, player, snapshot);
    throw error;
  }
}

function calculateAssignmentOutcome({ roleKey, members, player, scan, leadership, leadershipAction, suggestedRole }) {
  const assignmentState = rebalanceDay1Assignments({
    members,
    playerId: player.id,
    roleKey,
    scan,
    leaderId: leadership.operationalLeader?.id
  });
  const playerProfile = scan.profiles.find(profile => String(profile.id) === String(player.id));
  const impression = deriveDay1FirstImpression({
    leadershipAction,
    playerRole: assignmentState.playerRole,
    suggestedRole,
    playerProfile,
    leadership
  });
  const socialPulse = resolveDay1SocialPulse({
    scan,
    leadership,
    assignments: assignmentState.assignments,
    playerId: player.id,
    impression
  });
  return {
    ...assignmentState,
    impression,
    socialPulse,
    mood: resolveDay1CampMood({ leadership, socialPulse })
  };
}

export async function runDay1FirstImpressions({ gameManager, uiFactory } = {}) {
  const gm = gameManager || sharedGameManager;
  const gate = canRunDay1FirstImpressions(gm);
  if (!gate.ok) return { skipped: true, reason: gate.reason, details: gate.details };

  const tribe = getPlayerTribe(gm);
  const members = tribe.members || [];
  const player = resolveDay1Player(gm, tribe);
  gm.flags = gm.flags || {};
  gm.flags.campEventActive = true;
  eventManager.publish(GameEvents.CAMP_EVENT_STARTED, { eventId: EVENT_ID, id: EVENT_ID });
  eventManager.publish(GameEvents.DIALOGUE_SHOWN, { source: 'day1-camp-setup' });

  let ui = null;
  let completed = false;
  try {
    const createUI = uiFactory || (options => new Day1CampSetupUI(options));
    ui = createUI({
      members,
      player,
      tribeColor: tribe.color || tribe.tribeColor || '#c17f34',
      avatarResolver: getSurvivorAvatarSrc
    });
    const scan = scanDay1Tribe(members);
    const initialLeadership = resolveDay1Leadership(members, player, scan, leadershipContext(gm));
    const decision = getContextualLeadershipDecision({ leadership: initialLeadership, player });

    await ui.showArrival();
    const leadershipAction = await ui.chooseLeadership({
      leader: initialLeadership.operationalLeader,
      line: getDay1LeaderLine(initialLeadership.topProfile),
      decision
    });
    const leadership = applyLeadershipDecision(initialLeadership, player, leadershipAction);
    if (decision) {
      await ui.settleLeader(
        leadership.operationalLeader,
        getDay1LeaderLine(leadership.topProfile)
      );
    }

    const suggested = buildSuggestedDay1Assignments({
      members,
      playerId: player.id,
      scan,
      leaderId: leadership.operationalLeader?.id
    });
    const calculateState = roleKey => calculateAssignmentOutcome({
      roleKey,
      members,
      player,
      scan,
      leadership,
      leadershipAction,
      suggestedRole: suggested.suggestedRole
    });
    const initialState = {
      ...suggested,
      impression: null,
      socialPulse: [],
      mood: resolveDay1CampMood({ leadership, socialPulse: [] })
    };
    const finalState = await ui.chooseAssignment({
      leader: leadership.operationalLeader,
      assignmentState: initialState,
      suggestedRole: suggested.suggestedRole,
      calculateState
    });
    const result = finalizeDay1CampSetup({
      gameManager: gm,
      tribe,
      members,
      player,
      leadership,
      leadershipAction,
      suggestedRole: suggested.suggestedRole,
      finalState
    });
    completed = true;
    return result;
  } finally {
    ui?.destroy?.();
    gm.flags.campEventActive = false;
    eventManager.publish(GameEvents.DIALOGUE_HIDDEN, { source: 'day1-camp-setup' });
    eventManager.publish(GameEvents.CAMP_EVENT_ENDED, {
      eventId: EVENT_ID,
      id: EVENT_ID,
      completed
    });
  }
}

export default runDay1FirstImpressions;
