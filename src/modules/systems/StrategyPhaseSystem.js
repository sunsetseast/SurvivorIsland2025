import eventManager, { GameEvents } from '../core/EventManager.js';
import { gameManager, GamePhase, GameState } from '../core/GameManager.js';
import challengeManager from '../core/ChallengeManager.js';
import { LocationKeys } from '../core/LocationKeys.js';
import ScrambleActivityPlan, { ScrambleState, SCRAMBLE_SECONDS } from './ScrambleActivityPlan.js';
import { campTargetPreference } from './CampKnowledge.js';

/**
 * StrategyPhaseSystem
 * Handles post-challenge strategy-specific rules, logging, and UI hooks.
 * Keeps CampScreen slim by centralizing logic here.
 */
class StrategyPhaseSystem {
  constructor() {
    this.reset({ skipGameManager: true });
  }

  initialize() {
    eventManager.subscribe(GameEvents.GAME_PHASE_CHANGED, ({ phase }) => {
      if (phase === GamePhase.POST_CHALLENGE) {
        // PostChallengeEventSystem owns return narratives before activation.
        if (!this.startedForPhaseKey) this.scrambleState = ScrambleState.RETURN_EVENT;
      } else {
        this.reset();
      }
    });

    eventManager.subscribe(GameEvents.CAMP_VIEW_LOADED, ({ viewName }) => {
      if (!this.isActive || this.playerTribeSafe) return;
      this.handleCampViewNavigation(viewName);
    });
  }

  normalizeViewKey(viewName) {
    if (!viewName) return '';
    return String(viewName)
      .trim()
      .toLowerCase()
      .replace(/[\s_-]+/g, '')
      .replace(/view$/i, '');
  }

  getAllianceKey(allianceOrId) {
    if (!allianceOrId) return null;
    if (typeof allianceOrId === 'string' || typeof allianceOrId === 'number') {
      return String(allianceOrId);
    }
    return allianceOrId.id ?? allianceOrId.allianceId ?? null;
  }

  reset({ skipGameManager = false } = {}) {
    this.scrambleState = ScrambleState.RETURN_EVENT;
    this.scramble = null;
    this.transitioned = false;
    this.isActive = false;
    this.playerTribeSafe = false;
    this.personalTargetId = null;
    this.allianceTargets = new Map();
    this.npcIntentTargets = new Map();
    this.npcIntentMeta = new Map();
    this.tribalTargetBoard = null;
    this.strategyFacts = [];
    this.playerVisibleFacts = [];
    this.firstTargetIntroduced = false;
    this.beatIntervalId && clearInterval(this.beatIntervalId);
    this.timerWatcherId && clearInterval(this.timerWatcherId);
    this.beatIntervalId = null;
    this.timerWatcherId = null;
    this.startedForPhaseKey = null;
    this.activeModalId = null;
    this.pendingAllianceMeetings = [];
    this.completedAllianceMeetings = new Set();
    this.meetingAlertQueue = [];
    this.loggedFactKeys = new Set();
    this.journeyerIdForPhase = null;
    this.journeyPart2Running = false;
    this.lastStrategyTimerValue = null;
    if (!skipGameManager) {
      gameManager.conversationPhaseOverride = null;
    }
  }

  serialize() {
    return JSON.parse(JSON.stringify({
      scrambleState: this.scrambleState, scramble: this.scramble?.serialize(), transitioned: this.transitioned,
      isActive: this.isActive,
      playerTribeSafe: this.playerTribeSafe,
      personalTargetId: this.personalTargetId,
      allianceTargets: Array.from(this.allianceTargets.entries()),
      npcIntentTargets: Array.from(this.npcIntentTargets.entries()),
      npcIntentMeta: Array.from(this.npcIntentMeta.entries()),
      tribalTargetBoard: this.tribalTargetBoard,
      strategyFacts: this.strategyFacts,
      playerVisibleFacts: this.playerVisibleFacts,
      firstTargetIntroduced: this.firstTargetIntroduced,
      startedForPhaseKey: this.startedForPhaseKey,
      pendingAllianceMeetings: this.pendingAllianceMeetings,
      completedAllianceMeetings: Array.from(this.completedAllianceMeetings.values()),
      meetingAlertQueue: this.meetingAlertQueue,
      loggedFactKeys: Array.from(this.loggedFactKeys.values()),
      journeyerIdForPhase: this.journeyerIdForPhase,
      journeyPart2Running: this.journeyPart2Running,
      lastStrategyTimerValue: this.lastStrategyTimerValue
    }));
  }

  deserialize(payload) {
    this.reset();
    if (!payload || typeof payload !== 'object') return;

    this.isActive = Boolean(payload.isActive);
    this.scrambleState = payload.scrambleState || (this.isActive ? ScrambleState.ACTIVE : ScrambleState.BEFORE_TRIBAL);
    this.transitioned = Boolean(payload.transitioned);
    this.scramble = payload.scramble ? new ScrambleActivityPlan(gameManager, this, payload.scramble) :
      this.isActive ? new ScrambleActivityPlan(gameManager, this) : null;
    this.playerTribeSafe = Boolean(payload.playerTribeSafe);
    this.personalTargetId = payload.personalTargetId ?? null;
    this.allianceTargets = new Map(Array.isArray(payload.allianceTargets) ? payload.allianceTargets : []);
    this.npcIntentTargets = new Map(Array.isArray(payload.npcIntentTargets) ? payload.npcIntentTargets : []);
    this.npcIntentMeta = new Map(Array.isArray(payload.npcIntentMeta) ? payload.npcIntentMeta : []);
    this.tribalTargetBoard = payload.tribalTargetBoard ?? null;
    this.strategyFacts = Array.isArray(payload.strategyFacts) ? payload.strategyFacts : [];
    this.playerVisibleFacts = Array.isArray(payload.playerVisibleFacts) ? payload.playerVisibleFacts : [];
    this.firstTargetIntroduced = Boolean(payload.firstTargetIntroduced);
    this.startedForPhaseKey = payload.startedForPhaseKey ?? null;
    this.pendingAllianceMeetings = Array.isArray(payload.pendingAllianceMeetings) ? payload.pendingAllianceMeetings : [];
    this.completedAllianceMeetings = new Set(Array.isArray(payload.completedAllianceMeetings) ? payload.completedAllianceMeetings : []);
    this.meetingAlertQueue = Array.isArray(payload.meetingAlertQueue) ? payload.meetingAlertQueue : [];
    this.loggedFactKeys = new Set(Array.isArray(payload.loggedFactKeys) ? payload.loggedFactKeys : []);
    this.journeyerIdForPhase = payload.journeyerIdForPhase ?? null;
    this.journeyPart2Running = Boolean(payload.journeyPart2Running);
    this.lastStrategyTimerValue = Number.isFinite(payload.lastStrategyTimerValue) ? payload.lastStrategyTimerValue : null;
    if (this.isActive) {
      gameManager.conversationPhaseOverride = 'POST_CHALLENGE';
      this.startedForPhaseKey ||= `${gameManager.day}-${gameManager.gamePhase}`;
      if (!payload.scramble && !this.playerTribeSafe) {
        // Adopt existing saves without restarting their clock, targets or alliances.
        this.scramble.scheduleAlliances();
        for (const meeting of this.scramble.meetings) {
          const legacy = this.pendingAllianceMeetings.find(m => String(m.allianceId) === String(meeting.allianceId));
          if (legacy?.locationView && Object.values(LocationKeys).includes(legacy.locationView)) meeting.location = legacy.locationView;
          meeting.dueAt = Math.min(gameManager.dayTimer, meeting.dueAt);
          if (this.completedAllianceMeetings.has(meeting.allianceId)) meeting.status = 'completed';
        }
      }
    }
  }

  async startPostChallengePhase({ source = 'unspecified' } = {}) {
    const phaseKey = `${gameManager.day}-${gameManager.gamePhase}`;
    if (gameManager.gamePhase !== GamePhase.POST_CHALLENGE || this.startedForPhaseKey === phaseKey) return false;
    this.startedForPhaseKey = phaseKey;
    this.scrambleState = ScrambleState.ACTIVE;
    this.isActive = true; this.transitioned = false;
    gameManager.conversationPhaseOverride = 'POST_CHALLENGE';
    gameManager.dayTimer = SCRAMBLE_SECONDS;
    this.playerTribeSafe = this.didPlayerTribeWinImmunity();
    this.scramble = new ScrambleActivityPlan(gameManager, this);
    if (!this.playerTribeSafe) {
      this.seedNpcIntentTargetsForPhase();
      this.scramble.scheduleAlliances();
    }
    gameManager.systems?.campActivitySystem?.ensureStarted();
    gameManager.requestAutoSave?.(`scramble:start:${source}`);
    return true;
  }

  random() { return this.scramble ? this.scramble.random() : Math.random(); }
  semanticTimestamp() { return this.scramble ? this.getCurrentDay() * 20000 + 10000 +
    SCRAMBLE_SECONDS - gameManager.dayTimer : Date.now(); }
  planActivity(npc, now) { return this.scramble?.plan(npc, now); }
  resolveActivity(actor, activity, at) { return this.scramble?.resolve(actor, activity, at); }
  onActivityBoundary(now) { this.scramble?.onBoundary(now); }
  nextActivityBoundaries(cursor, after) { return this.scramble?.nextBoundary(cursor, after) || []; }

  didPlayerTribeWinImmunity() {
    const day = gameManager.getCurrentDay?.() ?? gameManager.getDay?.() ?? gameManager.day;
    const result = challengeManager?.getChallengeResult?.(day);
    // Individual immunity protects the contestant, not their tribe. They still
    // need to strategize and attend the playable Tribal Council.
    if (result?.challengeType === 'individual' || result?.playerWonIndividualImmunity || result?.individualWinnerId) {
      return false;
    }
    const winningKeys = new Set();
    const normalizedWinningKeys = new Set();

    const addKeyVariants = (value, set, normalizedSet) => {
      if (value == null) return;
      const trimmed = typeof value === 'string' ? value.trim() : value;
      const lower = typeof trimmed === 'string' ? trimmed.toLowerCase() : null;

      set.add(trimmed);
      if (typeof trimmed === 'number') {
        set.add(String(trimmed));
        normalizedSet.add(String(trimmed).trim().toLowerCase());
      }
      if (typeof trimmed === 'string') {
        set.add(trimmed);
        normalizedSet.add(trimmed.toLowerCase());
      }
      if (lower != null) {
        set.add(lower);
      }
    };

    if (Array.isArray(result?.winningTribeKeys)) {
      result.winningTribeKeys.forEach((k) => addKeyVariants(k, winningKeys, normalizedWinningKeys));
    }
    if (result?.winningTribeKey) {
      addKeyVariants(result.winningTribeKey, winningKeys, normalizedWinningKeys);
    }

    const playerTribe = gameManager.getPlayerTribe?.();
    const playerKeys = new Set();
    const normalizedPlayerKeys = new Set();
    addKeyVariants(playerTribe?.id, playerKeys, normalizedPlayerKeys);
    addKeyVariants(playerTribe?.tribeName, playerKeys, normalizedPlayerKeys);
    addKeyVariants(playerTribe?.tribeColor, playerKeys, normalizedPlayerKeys);

    window.debugBanner?.(
      'IMMUNITY-CHECK',
      `Day ${day} | playerKeys: ${Array.from(playerKeys).join(', ')} | winners: ${
        Array.from(winningKeys).join(', ')
      }`
    );

    for (const key of playerKeys) {
      if (winningKeys.has(key)) return true;
      const normalized = typeof key === 'string' ? key.trim().toLowerCase() : String(key).trim().toLowerCase();
      if (normalizedWinningKeys.has(normalized)) return true;
    }

    for (const normalizedKey of normalizedPlayerKeys) {
      if (normalizedWinningKeys.has(normalizedKey)) return true;
    }

    return false;
  }

  scheduleAllianceMeetings() { this.scramble?.scheduleAlliances(); return this.scramble?.meetings.length || 0; }

  resolveAllianceById(allianceId) {
    if (!allianceId) return null;
    const allianceSystem = gameManager?.systems?.allianceSystem;
    if (!allianceSystem) return null;
    if (typeof allianceSystem.getAllianceById === 'function') {
      return allianceSystem.getAllianceById(allianceId);
    }
    const all = allianceSystem.getAllAlliances?.() || [];
    return all.find((a) => a?.id === allianceId || a?.allianceId === allianceId) || null;
  }

  // Legacy navigation/alert entry points no longer teleport or auto-open meetings.
  queueMeetingAlert() {}
  handleCampViewNavigation() {}

  promptPersonalTarget() {
    const tribe = gameManager.getPlayerTribe();
    if (!tribe) return;

    const options = tribe.members.filter((m) => !m.isPlayer && this.isMemberAvailableForTargeting(m));
    if (!options.length) return;
    if (this.activeModalId === 'personalTarget') return;

    const modal = this.buildAvatarGridPickerModal({
      title: 'Choose your personal target',
      confirmLabel: 'Set Target',
      options,
      tribeColor: tribe.color || tribe.tribeColor,
      defaultSelection: this.personalTargetId || options[0].id,
      onConfirm: (targetId) => {
        this.personalTargetId = targetId;
        const key = `personalTargetSet:${this.getCurrentDay()}:${targetId}`;
        this.logFactOnce({ type: 'personalTargetSet', speakerId: gameManager.player?.id, targetId }, key);
        this.activeModalId = null;
      },
      onCancel: () => {
        this.activeModalId = null;
      },
    });

    this.activeModalId = 'personalTarget';
    document.body.appendChild(modal.overlay);
  }

  lockPersonalTarget() {
    if (this.playerTribeSafe) return Promise.resolve();

    return new Promise((resolve) => {
      const tribe = gameManager.getPlayerTribe();
      const options = tribe?.members?.filter((m) => !m.isPlayer && this.isMemberAvailableForTargeting(m)) || [];
      const modal = this.buildAvatarGridPickerModal({
        title: 'Lock your target',
        confirmLabel: 'Confirm Target',
        options,
        tribeColor: tribe?.color || tribe?.tribeColor,
        defaultSelection: this.personalTargetId || options[0]?.id,
        onConfirm: (targetId) => {
          this.personalTargetId = targetId;
          const key = `personalTargetLocked:${this.getCurrentDay()}:${targetId}`;
          this.logFactOnce({ type: 'personalTargetLocked', speakerId: gameManager.player?.id, targetId }, key);
          resolve();
        },
        onCancel: () => resolve(),
      });
      document.body.appendChild(modal.overlay);
    });
  }

  lockAlliances() {
    if (this.playerTribeSafe) return Promise.resolve();

    const allianceSystem = gameManager?.systems?.allianceSystem;
    const player = gameManager.getPlayerSurvivor();
    const alliances = allianceSystem?.getAlliancesForSurvivor?.(player?.id) || [];

    if (!alliances.length) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'strategy-overlay';

      const modal = document.createElement('div');
      modal.className = 'strategy-modal';

      const heading = document.createElement('h2');
      heading.textContent = 'Alliance Lock-In';
      modal.appendChild(heading);

      const list = document.createElement('div');
      list.className = 'strategy-list';

      const keepLoggedByAlliance = new Set();

      alliances.forEach((alliance) => {
        const allianceKey = this.getAllianceKey(alliance) ?? `alliance-${alliance.name || 'unnamed'}`;
        const entry = document.createElement('div');
        entry.className = 'strategy-entry';

        const title = document.createElement('div');
        title.className = 'strategy-entry-title';
        title.textContent = alliance.name || 'Alliance';
        entry.appendChild(title);

        const targetRow = document.createElement('div');
        targetRow.className = 'strategy-entry-row';
        const resolveCurrentTargetId = () => this.allianceTargets.get(allianceKey);
        const target = gameManager.survivors?.find((s) => s.id === resolveCurrentTargetId() && this.isMemberAvailableForTargeting(s));
        const targetLabel = document.createElement('div');
        targetLabel.textContent = target ? `${target.firstName}` : 'No target chosen';
        targetRow.appendChild(targetLabel);

        const buttonRow = document.createElement('div');
        buttonRow.className = 'strategy-entry-actions';
        const keepBtn = document.createElement('button');
        keepBtn.textContent = 'Keep';
        keepBtn.className = 'rect-button';
        keepBtn.addEventListener('click', () => {
          if (keepLoggedByAlliance.has(allianceKey)) return;
          keepLoggedByAlliance.add(allianceKey);
          this.logFact({ type: 'allianceTargetConfirmed', allianceId: allianceKey, targetId: target?.id || null });
        });

        const changeBtn = document.createElement('button');
        changeBtn.textContent = 'Change';
        changeBtn.className = 'rect-button alt';
        changeBtn.addEventListener('click', () => {
          const tribe = gameManager.getPlayerTribe();
          const options = tribe?.members?.filter((m) => !m.isPlayer && this.isMemberAvailableForTargeting(m)) || [];
          const picker = this.buildAvatarGridPickerModal({
            title: `Set target for ${alliance.name || 'alliance'}`,
            confirmLabel: 'Choose',
            options,
            tribeColor: tribe?.color || tribe?.tribeColor,
            defaultSelection: resolveCurrentTargetId() || options[0]?.id,
            onConfirm: (selected) => {
              this.allianceTargets.set(allianceKey, selected);
              this.logFact({ type: 'allianceTarget', allianceId: allianceKey, targetId: selected });
              targetLabel.textContent = gameManager.survivors?.find((s) => s.id === selected)?.firstName || 'Target chosen';
            },
          });
          document.body.appendChild(picker.overlay);
        });

        buttonRow.appendChild(keepBtn);
        buttonRow.appendChild(changeBtn);
        entry.appendChild(targetRow);
        entry.appendChild(buttonRow);
        list.appendChild(entry);
      });

      const actions = document.createElement('div');
      actions.className = 'strategy-actions';
      const saveBtn = document.createElement('button');
      saveBtn.id = 'strategy-alliance-save';
      saveBtn.textContent = 'Save choices';
      saveBtn.addEventListener('click', () => {
        document.body.removeChild(overlay);
        resolve();
      });
      actions.appendChild(saveBtn);

      modal.appendChild(list);
      modal.appendChild(actions);
      overlay.appendChild(modal);

      overlay.addEventListener('click', (event) => {
        if (event.target === overlay) {
          document.body.removeChild(overlay);
          resolve();
        }
      });

      document.body.appendChild(overlay);
    });
  }

  // Compatibility only: the semantic CampActivitySystem is the sole heartbeat.
  beginStrategyBeats() {}

  updateNpcIntentTarget(npcId, targetId, { reason = 'unknown', confidenceDelta = 0, absoluteConfidence = null,
    lateVolatility = false } = {}) {
    if (!npcId || !this.isTargetIdAvailable(targetId)) return null;
    const previousTargetId = this.getNpcTargetIntent(npcId)?.targetId;
    const priorMeta = this.npcIntentMeta.get(npcId) || { confidence: 0.5, reason: 'seed', updatedAt: this.semanticTimestamp() };
    const fallbackConfidence = (Number(priorMeta.confidence) || 0.5) + (Number(confidenceDelta) || 0);
    const seededConfidence = absoluteConfidence == null ? fallbackConfidence : Number(absoluteConfidence);
    const nextConfidence = Math.min(1, Math.max(0, seededConfidence));

    this.npcIntentTargets.set(npcId, targetId);
    const meta = {
      confidence: Number(nextConfidence.toFixed(2)),
      reason,
      updatedAt: this.semanticTimestamp(),
    };
    this.npcIntentMeta.set(npcId, meta);

    const npcName = this.getName(npcId);
    const targetName = this.getName(targetId);
    this.logFact({
      type: 'npcIntentTargetUpdated',
      speakerId: npcId,
      targetId,
      reason,
      confidence: meta.confidence,
    });
    if (lateVolatility && previousTargetId != null && String(previousTargetId) !== String(targetId)) {
      // Only an actual late target switch can stage a Live Tribal. The target
      // names stay private; the visible event is the late scramble itself.
      this.strategyFacts.push({ type: 'lateTargetSwitch', speakerId: npcId,
        fromTargetId: previousTargetId, toTargetId: targetId, severity: .75,
        source: reason, timestamp: this.semanticTimestamp() });
    }
    window.debugBanner?.('NPC-INTENT', `${npcName} -> ${targetName} (${meta.confidence.toFixed(2)})`);
    return meta;
  }

  getNpcTargetIntent(npcId) {
    if (!npcId) return null;
    const targetId = this.npcIntentTargets.get(npcId)
      || this.npcIntentTargets.get(String(npcId))
      || this.npcIntentTargets.get(Number(npcId));
    if (!this.isTargetIdAvailable(targetId)) return null;
    const meta = this.npcIntentMeta.get(npcId)
      || this.npcIntentMeta.get(String(npcId))
      || this.npcIntentMeta.get(Number(npcId))
      || {};
    return {
      targetId,
      confidence: Number.isFinite(meta.confidence) ? meta.confidence : 0.5,
      reason: meta.reason || 'unknown',
      updatedAt: meta.updatedAt || null
    };
  }

  seedNpcIntentTargetsForPhase() {
    if (this.playerTribeSafe) return 0;
    const tribe = gameManager.getPlayerTribe?.();
    if (!tribe) return 0;

    const npcMembers = (tribe.members || []).filter((m) => m && !m.isPlayer && !m.isOut);
    if (!npcMembers.length) return 0;

    const pickThreatTargetForNpc = (npc) => {
      const candidates = (tribe.members || []).filter(
        (m) => m && String(m.id) !== String(npc.id) && this.isMemberAvailableForTargeting(m)
      );
      if (!candidates.length) return null;

      const relationshipSystem = gameManager?.systems?.relationshipSystem;
      const weighted = candidates.map((candidate) => {
        const threatScore = ((Number(candidate.physical) || 50) + (Number(candidate.mental) || 50)) / 2;
        const relationshipValue = this.resolveRelationshipValue(relationshipSystem, npc.id, candidate.id);
        // Camp beliefs are a bounded preference, alongside the existing threat
        // and relationship inputs. An owned pitch never forces a vote.
        const score = threatScore + (100 - relationshipValue) + this.campPreference(npc.id, candidate.id) * 12;
        return { candidate, weight: Math.exp(Math.min(200, score) / 35) };
      });
      let roll = this.random() * weighted.reduce((n, entry) => n + entry.weight, 0);
      return (weighted.find(entry => (roll -= entry.weight) <= 0) || weighted.at(-1))?.candidate.id ?? null;
    };

    let seededCount = 0;
    npcMembers.forEach((npc) => {
      // The player's private picker is not an NPC disclosure. NPCs enter the
      // phase with their own preferences and what they actually heard at camp.
      const seededTargetId = pickThreatTargetForNpc(npc);
      if (!seededTargetId) return;
      this.updateNpcIntentTarget(npc.id, seededTargetId, {
        reason: 'seed:startPhase',
        confidenceDelta: 0,
        absoluteConfidence: 0.35,
      });
      seededCount += 1;
    });

    window.debugBanner?.('NPC-SEED', `${seededCount} intents seeded`);
    return seededCount;
  }

  campPreference(ownerId, targetId) {
    return campTargetPreference(gameManager.systems?.socialMemorySystem, ownerId, targetId,
      gameManager.getCurrentDay?.() ?? gameManager.day ?? 1);
  }

  computeTribalTargetBoard() {
    const heatMap = {};
    const increment = (targetId, weight = 1) => {
      if (!this.isTargetIdAvailable(targetId)) return;
      const key = String(targetId);
      heatMap[key] = (heatMap[key] || 0) + weight;
    };

    this.npcIntentTargets.forEach((targetId) => increment(targetId));

    if (this.personalTargetId) {
      increment(this.personalTargetId);
    }

    const playerId = gameManager.getPlayerSurvivor?.()?.id || gameManager.player?.id;
    const allianceSystem = gameManager?.systems?.allianceSystem;
    const alliances = allianceSystem?.getAlliancesForSurvivor?.(playerId) || [];
    alliances.forEach((alliance) => {
      const allianceId = this.getAllianceKey(alliance);
      increment(this.allianceTargets.get(allianceId));
    });

    const ranked = Object.entries(heatMap).sort((a, b) => b[1] - a[1]);
    const primaryTargetId = ranked[0]?.[0] ?? null;
    const secondaryTargetId = ranked[1]?.[0] ?? null;
    const computedAt = this.semanticTimestamp();

    this.tribalTargetBoard = {
      primaryTargetId,
      secondaryTargetId,
      heatMap,
      computedAt,
    };

    gameManager.flags = gameManager.flags || {};
    gameManager.flags.tribalTargetBoard = this.tribalTargetBoard;

    this.logFact({
      type: 'tribalTargetBoardComputed',
      primaryTargetId,
      secondaryTargetId,
      heatMap,
      computedAt,
    });

    window.debugBanner?.(
      'TARGET-BOARD',
      `primary:${this.getName(primaryTargetId)} | secondary:${secondaryTargetId ? this.getName(secondaryTargetId) : 'none'} | ${JSON.stringify(heatMap)}`
    );

    return this.tribalTargetBoard;
  }

  getTribalTargetBoard() {
    return this.tribalTargetBoard || gameManager.flags?.tribalTargetBoard || null;
  }

  runStrategyBeat() { return false; }
  launchAllianceConversation(alliance, location) {
    const meeting = this.scramble?.meetings.find(m => m.status === 'active' &&
      String(m.allianceId) === String(this.getAllianceKey(alliance)) && m.location === location);
    return meeting ? this.scramble.attend(meeting.id) : false;
  }

  calculateSwayProbability(alliance) {
    const trustSystem = gameManager?.systems?.trustSystem;
    const relationshipSystem = gameManager?.systems?.relationshipSystem;
    const player = gameManager.getPlayerSurvivor?.();
    const members = (alliance?.memberIds || [])
      .map((id) => gameManager.survivors?.find((s) => s.id === id))
      .filter((s) => s && !s.isPlayer);

    let trustTotal = 0;
    let relTotal = 0;
    let styleBonus = 0;
    let memberCount = 0;

    members.forEach((npc) => {
      const trustValue = this.resolveTrustValue(trustSystem, player?.id, npc.id);
      const relationshipValue = this.resolveRelationshipValue(relationshipSystem, player?.id, npc.id);
      trustTotal += trustValue;
      relTotal += relationshipValue;
      styleBonus += this.calculateStyleModifierForSwayMember(npc);
      memberCount += 1;
    });

    const socialDivisor = Math.max(1, members.length);
    const trustAvg = trustTotal / socialDivisor;
    const relAvg = relTotal / socialDivisor;
    const styleModifierAvg = memberCount > 0 ? (styleBonus / memberCount) : 0;
    const trustDelta = trustAvg - 50;
    const relDelta = relAvg - 50;
    const socialComponent = ((trustDelta * 0.6) + (relDelta * 0.4)) / 250;
    const rawProbability = 0.35 + socialComponent + styleModifierAvg;
    const probability = Math.min(0.8, Math.max(0.15, rawProbability));

    window.debugBanner?.(
      'SWAY-CALC',
      `base:0.35 trustAvg:${trustAvg.toFixed(1)} relAvg:${relAvg.toFixed(1)} social:${socialComponent.toFixed(3)} styleAvg:${styleModifierAvg.toFixed(3)} => ${(probability * 100).toFixed(0)}%`
    );

    return {
      probability,
      trustAvg,
      relAvg,
      styleModifier: styleModifierAvg,
      breakdown: {
        base: 0.35,
        trustWeight: 0.6,
        relationshipWeight: 0.4,
        socialComponent,
        styleModifier: styleModifierAvg,
        unclampedProbability: rawProbability,
      },
    };
  }

  calculateStyleModifierForSwayMember(npc) {
    const style = npc?.gameplayStyle || 'Competitive';
    const hasTrait = (key) => this.resolveSwayTraitValue(npc, key) != null;
    const trait = (key, fallback = 50) => {
      const value = this.resolveSwayTraitValue(npc, key);
      return value == null ? fallback : value;
    };

    if (style === 'Wildcard') {
      const hasAnyWildcardTrait = ['paratend', 'risk', 'honesty', 'loyalty', 'bigmove', 'aggression'].some(hasTrait);
      if (!hasAnyWildcardTrait) return 0.05;

      const risk = trait('risk');
      const bigmove = trait('bigmove');
      const aggression = trait('aggression');
      const loyalty = trait('loyalty');
      const honesty = trait('honesty');
      const paratend = trait('paratend');
      const modifier =
        ((risk - 50) * 0.0007)
        + ((bigmove - 50) * 0.0006)
        + ((aggression - 50) * 0.0005)
        - ((loyalty - 50) * 0.0004)
        - ((honesty - 50) * 0.0003)
        + ((paratend - 50) * 0.0004);
      return Math.max(-0.08, Math.min(0.08, modifier));
    }

    if (style === 'Power Player') {
      const bigmove = trait('bigmove');
      const aggression = trait('aggression');
      const loyalty = trait('loyalty');
      return Math.max(-0.07, Math.min(0.02, -0.05 + ((bigmove - 50) * -0.0002) + ((aggression - 50) * -0.0002) + ((loyalty - 50) * 0.0002)));
    }

    if (style === 'Shadow Strategist') {
      const paratend = trait('paratend');
      const honesty = trait('honesty');
      return Math.max(-0.03, Math.min(0.05, 0.01 + ((paratend - 50) * 0.0003) - ((honesty - 50) * 0.0002)));
    }

    if (style === 'Social Genius') {
      const honesty = trait('honesty');
      const loyalty = trait('loyalty');
      return Math.max(0.01, Math.min(0.06, 0.04 + ((honesty - 50) * 0.0002) + ((loyalty - 50) * 0.0002)));
    }

    return 0;
  }

  resolveSwayTraitValue(npc, key) {
    const candidates = [
      npc?.[key],
      npc?.traits?.[key],
      npc?.personality?.[key],
      npc?.personalityTraits?.[key],
    ];

    for (const candidate of candidates) {
      if (typeof candidate !== 'number' || Number.isNaN(candidate)) continue;
      if (candidate >= 0 && candidate <= 1) return Math.max(0, Math.min(100, candidate * 100));
      return Math.max(0, Math.min(100, candidate));
    }

    return null;
  }

  resolveTrustValue(trustSystem, fromId, toId) {
    if (!trustSystem || !fromId || !toId) return 50;
    const direct = trustSystem.getTrust?.(fromId, toId);
    if (typeof direct === 'number') return direct;
    if (direct && typeof direct === 'object') {
      if (typeof direct.value === 'number') return direct.value;
      if (typeof direct.score === 'number') return direct.score;
    }
    return 50;
  }

  resolveRelationshipValue(relationshipSystem, fromId, toId) {
    if (!relationshipSystem || !fromId || !toId) return 50;
    const rel = relationshipSystem.getRelationship?.(fromId, toId);
    if (typeof rel === 'number') return rel;
    if (rel && typeof rel === 'object' && typeof rel.value === 'number') return rel.value;
    return 50;
  }

  pickSpeaker(members) {
    const candidates = members.filter((m) => !m.isPlayer);
    if (!candidates.length) return null;
    return candidates[Math.floor(this.random() * candidates.length)];
  }

  pickAction(speaker) {
    const style = speaker?.gameplayStyle || 'Competitive';
    const base = {
      ENDORSE: 0.25,
      SOFT_COUNTER: 0.2,
      HARD_COUNTER: 0.15,
      DEFLECT: 0.25,
      SILENT: 0.15,
    };

    const tweaks = {
      Wildcard: { ENDORSE: -0.1, SOFT_COUNTER: 0.05, HARD_COUNTER: 0.1, DEFLECT: -0.05 },
      'Power Player': { ENDORSE: -0.05, SOFT_COUNTER: 0.1, HARD_COUNTER: 0.05, DEFLECT: -0.05 },
      'Shadow Strategist': { ENDORSE: -0.05, DEFLECT: 0.1, SILENT: 0.05 },
      'Social Genius': { ENDORSE: 0.1, SOFT_COUNTER: 0.05, HARD_COUNTER: -0.05 },
      'Lethal Charmer': { ENDORSE: 0.05, DEFLECT: 0.05, HARD_COUNTER: -0.05 },
      Competitive: { ENDORSE: 0.05, HARD_COUNTER: 0.05, DEFLECT: -0.05 },
    };

    const styleTweaks = tweaks[style] || {};
    const weighted = Object.entries(base).map(([key, value]) => ({
      key,
      weight: Math.max(0, value + (styleTweaks[key] || 0)),
    }));

    const total = weighted.reduce((sum, item) => sum + item.weight, 0);
    let roll = this.random() * total;
    for (const item of weighted) {
      roll -= item.weight;
      if (roll <= 0) return item.key;
    }
    return 'DEFLECT';
  }

  pickTargetForAction(action, members, speaker) {
    if (action === 'DEFLECT' || action === 'SILENT') return null;

    const others = (members || []).filter(
      (m) => m && String(m.id) !== String(speaker?.id) && this.isMemberAvailableForTargeting(m)
    );
    if (!others.length) return null;

    if (!this.firstTargetIntroduced && action === 'ENDORSE') {
      // If no one has named a name yet, prefer proposing instead of endorsing nothing
      action = 'SOFT_COUNTER';
    }

    const player = others.find((m) => m.isPlayer);
    const trustSystem = gameManager?.systems?.trustSystem;
    const relationshipSystem = gameManager?.systems?.relationshipSystem;
    const trustToPlayer = player ? this.resolveTrustValue(trustSystem, speaker?.id, player.id) : null;
    const relToPlayer = player ? this.resolveRelationshipValue(relationshipSystem, speaker?.id, player.id) : null;
    const rankedThreats = others
      .map((member) => ({ id: member.id, threat: this.calculateThreatScore(member) }))
      .sort((a, b) => b.threat - a.threat);
    const playerThreatRank = player ? rankedThreats.findIndex((entry) => String(entry.id) === String(player.id)) + 1 : -1;
    const playerIsTopThreat = playerThreatRank > 0 && playerThreatRank <= Math.min(3, rankedThreats.length);
    const scrambleAction = this.isScrambleLikeAction(action);
    const playerGateOpen = !!player && (
      trustToPlayer < 45
      || relToPlayer < 45
      || playerIsTopThreat
      || scrambleAction
    );

    const weightedCandidates = others.map((candidate) => {
      let weight = 1 + this.campPreference(speaker.id, candidate.id) * .5;
      if (candidate.isPlayer && !playerGateOpen) {
        weight *= 0.15;
      }
      return { candidate, weight };
    }).filter((entry) => entry.weight > 0);

    if (!weightedCandidates.length) return null;

    const competitiveBias = speaker.gameplayStyle === 'Competitive';
    if (competitiveBias) {
      const challengeThreats = weightedCandidates
        .map((entry) => entry.candidate)
        .filter((m) => m.physical >= 70 || m.mental >= 70 || this.calculateThreatScore(m) >= 70);
      if (challengeThreats.length && this.random() < 0.6) {
        return challengeThreats[Math.floor(this.random() * challengeThreats.length)].id;
      }
    }

    const totalWeight = weightedCandidates.reduce((sum, entry) => sum + entry.weight, 0);
    let roll = this.random() * totalWeight;
    for (const entry of weightedCandidates) {
      roll -= entry.weight;
      if (roll <= 0) {
        return entry.candidate.id;
      }
    }

    const fallback = weightedCandidates[weightedCandidates.length - 1]?.candidate || null;
    return fallback?.id || null;
  }

  isMemberAvailableForTargeting(member) {
    if (!member) return false;
    return !(
      member.eliminated
      || member.isEliminated
      || member.out
      || member.isOut
      || member.outOfGame
      || member.isOutOfGame
      || gameManager.hasImmunity(member)
    );
  }

  isTargetIdAvailable(targetId) {
    if (targetId == null) return false;
    const member = gameManager.getPlayerTribe?.()?.members?.find((entry) => String(entry.id) === String(targetId));
    return this.isMemberAvailableForTargeting(member);
  }

  calculateThreatScore(member) {
    if (!member) return 50;
    const physical = Number(member.physical);
    const mental = Number(member.mental);
    const social = Number(member.social);
    const normalize = (value) => (Number.isFinite(value) ? value : 50);
    return (normalize(physical) + normalize(mental) + normalize(social)) / 3;
  }

  isScrambleLikeAction(action) {
    const normalized = String(action || '').trim().toUpperCase();
    return normalized === 'HARD_COUNTER' || normalized === 'SOFT_COUNTER';
  }

  addDebugBanner(message, color = 'orange', duration = 70) {
    if (typeof window.addDebugBanner === 'function') {
      window.addDebugBanner(message, color, duration);
      return;
    }
    window.debugBanner?.('PLAYER-TARGET', message);
  }

  logPlayerNameFloatedIfNeeded({ speaker, targetId, action } = {}) {
    if (!speaker || !targetId) return;
    const player = gameManager.getPlayerSurvivor?.();
    if (!player || !this.isMemberAvailableForTargeting(player) || String(targetId) !== String(player.id)) return;

    const trustSystem = gameManager?.systems?.trustSystem;
    const relationshipSystem = gameManager?.systems?.relationshipSystem;
    const trustToPlayer = this.resolveTrustValue(trustSystem, speaker?.id, player.id);
    const relToPlayer = this.resolveRelationshipValue(relationshipSystem, speaker?.id, player.id);
    const playerThreat = this.calculateThreatScore(player);

    this.addDebugBanner(`🎯 Player name floated by ${speaker.firstName} -> ${player.firstName} (${action})`, 'orange', 70);
    this.logFact({
      type: 'playerNameFloated',
      speakerId: speaker.id,
      targetId: player.id,
      action,
      trustToPlayer,
      relToPlayer,
      playerThreat,
    });
  }

  getRumorLeakChance(speaker) {
    const relSystem = gameManager.systems?.relationshipSystem;
    const player = gameManager.getPlayerSurvivor();
    const rel = this.resolveRelationshipValue(relSystem, player?.id, speaker?.id);
    const base = rel >= 70 ? 0.35 : rel >= 50 ? 0.25 : 0.15;

    if (speaker?.gameplayStyle === 'Lethal Charmer') return base + 0.1;
    if (speaker?.gameplayStyle === 'Wildcard') return base + 0.05;
    if (speaker?.gameplayStyle === 'Shadow Strategist') return base + 0.08;
    return base;
  }

  getName(id) {
    const survivor = gameManager.survivors?.find((s) => s.id === id);
    return survivor?.firstName || survivor?.name || 'someone';
  }

  logFact(fact) {
    const enriched = { ...fact, day: this.getCurrentDay(), campTime: gameManager.dayTimer, timestamp: this.semanticTimestamp() };
    this.strategyFacts.push(enriched);
    // Facts are simulation reality. Only participants/direct disclosures belong
    // in the player's recap; visual co-presence alone grants no secret content.
    if (fact.toPlayer || fact.playerVisible || String(fact.speakerId) === String(gameManager.player?.id) ||
      fact.participantIds?.some(id => String(id) === String(gameManager.player?.id))) this.playerVisibleFacts.push(enriched);

    const debugLabel = fact.type?.toUpperCase?.() || 'FACT';
    const detail = [fact.action, fact.targetId, fact.allianceId].filter(Boolean).join(' | ');
    window.debugBanner?.(debugLabel, detail || '');
  }

  logFactOnce(fact, key) {
    if (key && this.loggedFactKeys.has(key)) return;
    if (key) this.loggedFactKeys.add(key);
    this.logFact(fact);
  }

  getCurrentDay() {
    return gameManager.getCurrentDay?.() ?? gameManager.getDay?.() ?? gameManager.day;
  }

  startTimerWatcher() {}

  addSummaryFact(fact) {
    this.logFact(fact);
  }

  addFact(fact) {
    this.logFact(fact);
  }

  recordSummaryFact(fact) {
    this.logFact(fact);
  }

  async handleTimerExpired() {
    if (!this.isActive || this.scrambleState === ScrambleState.RESOLVING || gameManager.dayTimer > 0) return false;
    this.scrambleState = ScrambleState.RESOLVING;
    this.isActive = false;
    this.scramble?.clearInvitation();
    gameManager.systems?.campActivitySystem?.releasePhaseReservations?.();
    if (!this.playerTribeSafe) this.computeTribalTargetBoard();
    this.scrambleState = ScrambleState.BEFORE_TRIBAL;
    this.showSummaryView();
    gameManager.requestAutoSave?.('scramble:resolved');
    return true;
  }

  // No free-floating last-second target reroll. Final-minute activities resolve
  // through the same physical loop as the rest of the hour.
  triggerNpcScramble() { return false; }

  showSummaryView() {
    if (window.campScreen && typeof window.campScreen.loadView === 'function') {
      window.campScreen.loadView(LocationKeys.STRATEGY_SUMMARY);
    }
  }

  getPlayerSummaryFacts() { return this.playerVisibleFacts; }

  getSummaryFacts() {
    return this.strategyFacts;
  }

  proceedAfterSummary() {
    if (this.transitioned) return;
    this.transitioned = true; this.scrambleState = ScrambleState.COMPLETE;
    const currentState = gameManager.getGameState?.() || gameManager.gameState;
    const currentPhase = gameManager.getGamePhase?.() || gameManager.gamePhase;
    console.log('[StrategyPhaseSystem] proceedAfterSummary start', {
      playerTribeSafe: this.playerTribeSafe,
      currentState,
      currentPhase
    });

    if (this.playerTribeSafe) {
      gameManager.endPostChallengePhase();
      const existingClock = document.getElementById('camp-clock');
      if (existingClock) existingClock.remove();
      window.campScreen?.renderClockUI?.();
      console.log('[StrategyPhaseSystem] proceedAfterSummary safe branch complete', {
        day: gameManager.day,
        gamePhase: gameManager.gamePhase,
        gameState: gameManager.getGameState?.() || gameManager.gameState
      });
      return;
    }

    const attendingTribeId = gameManager.getPlayerTribe?.()?.tribeId || gameManager.getPlayerTribe?.()?.id || null;
    gameManager.gamePhase = GamePhase.TRIBAL_COUNCIL;
    eventManager.publish(GameEvents.TRIBAL_COUNCIL_STARTED, {
      day: gameManager.getDay?.() || gameManager.day,
      tribeId: attendingTribeId
    });
    gameManager.setGameState(GameState.TRIBAL_COUNCIL, { attendingTribeId });

    console.log('[StrategyPhaseSystem] proceedAfterSummary tribal branch complete', {
      gamePhase: gameManager.gamePhase,
      gameState: gameManager.getGameState?.() || gameManager.gameState
    });
  }

  buildAvatarGridPickerModal({ title, confirmLabel, options, tribeColor = '#f5c76a', defaultSelection, onConfirm, onCancel }) {
    options = (options || []).filter((member) => this.isMemberAvailableForTargeting(member));
    defaultSelection = options.some((member) => String(member.id) === String(defaultSelection))
      ? defaultSelection : options[0]?.id;
    const overlay = document.createElement('div');
    overlay.className = 'strategy-overlay';

    const modal = document.createElement('div');
    modal.className = 'strategy-modal avatar-grid-modal';

    const header = document.createElement('h2');
    header.textContent = title;

    const grid = document.createElement('div');
    grid.className = 'avatar-grid';

    let selectedId = defaultSelection;

    const renderTiles = () => {
      grid.innerHTML = '';
      options.forEach((opt) => {
        const tile = document.createElement('button');
        tile.className = 'avatar-grid-tile';
        tile.dataset.id = opt.id;
        if (selectedId === opt.id) tile.classList.add('selected');

        const frame = document.createElement('div');
        frame.className = 'avatar-frame';
        frame.style.borderColor = tribeColor;

        const img = document.createElement('img');
        img.src = opt.avatarUrl || opt.portraitUrl || opt.avatar || 'Assets/Resources/default-portrait.png';
        img.alt = opt.firstName || opt.name || 'Survivor';
        frame.appendChild(img);

        const name = document.createElement('div');
        name.className = 'avatar-name';
        name.textContent = opt.firstName || opt.name || 'Survivor';

        tile.appendChild(frame);
        tile.appendChild(name);

        tile.addEventListener('click', () => {
          selectedId = opt.id;
          renderTiles();
          confirmBtn.disabled = !this.isTargetIdAvailable(selectedId);
        });

        grid.appendChild(tile);
      });
    };

    const buttons = document.createElement('div');
    buttons.className = 'strategy-actions';
    const confirmBtn = document.createElement('button');
    confirmBtn.textContent = confirmLabel;
    confirmBtn.disabled = !this.isTargetIdAvailable(selectedId);
    confirmBtn.addEventListener('click', () => {
      if (!this.isTargetIdAvailable(selectedId)) return;
      onConfirm?.(selectedId);
      document.body.removeChild(overlay);
    });

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => {
      onCancel?.();
      document.body.removeChild(overlay);
    });

    buttons.appendChild(confirmBtn);
    buttons.appendChild(cancelBtn);

    modal.appendChild(header);
    modal.appendChild(grid);
    modal.appendChild(buttons);
    overlay.appendChild(modal);

    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) {
        onCancel?.();
        document.body.removeChild(overlay);
      }
    });

    renderTiles();
    return { overlay, modal };
  }
}

const strategyPhaseSystem = new StrategyPhaseSystem();

export default strategyPhaseSystem;
