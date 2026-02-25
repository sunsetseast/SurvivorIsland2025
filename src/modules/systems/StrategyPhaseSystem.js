import eventManager, { GameEvents } from '../core/EventManager.js';
import gameManager, { GamePhase, GameState } from '../core/GameManager.js';
import challengeManager from '../core/ChallengeManager.js';
import { LocationKeys } from '../core/LocationKeys.js';
import JourneyReturnCampEvent from '../events/JourneyReturnCampEvent.js';

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
        this.startPostChallengePhase();
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

  async startPostChallengePhase(options = {}) {
    const { force = false, source = 'unspecified' } = options;
    const phaseKey = `${gameManager.getDay?.() ?? gameManager.day}-${gameManager.getGamePhase?.() ?? gameManager.gamePhase}`;
    const existingTimer = gameManager.getDayTimer?.() ?? gameManager.dayTimer ?? 0;
    const shouldReinitializeBecauseTimerMissing = existingTimer <= 0;

    console.info('[StrategyPhaseSystem] startPostChallengePhase', {
      source,
      phaseKey,
      existingTimer,
      force
    });
    window.debugBanner?.('POST-CH START', `src:${source} | t:${existingTimer}`);

    if (this.startedForPhaseKey === phaseKey && !force && !shouldReinitializeBecauseTimerMissing) {
      return;
    }

    if (this.startedForPhaseKey === phaseKey && (force || shouldReinitializeBecauseTimerMissing)) {
      console.info('[StrategyPhaseSystem] Re-initializing post-challenge phase', {
        source,
        force,
        existingTimer,
        phaseKey
      });
    }

    this.startedForPhaseKey = phaseKey;
    gameManager.conversationPhaseOverride = 'POST_CHALLENGE';
    gameManager.flags = gameManager.flags || {};
    if (!(gameManager.flags.absentFromCampIds instanceof Set)) {
      gameManager.flags.absentFromCampIds = new Set(gameManager.flags.absentFromCampIds || []);
    }
    gameManager.flags.journeyReturnPart2Fired = false;
    gameManager.flags.journeyReturnPart2PlayerResponseLogged = false;
    this.journeyerIdForPhase = null;

    // Set the timer for a 1-hour in-game scramble and freeze survival decay expectations.
    // The clock should not actually tick until blocking intro beats (Journey Return Part 1) complete.
    gameManager.dayTimer = 3600;
    window.debugBanner?.('POST-CH TIMER', `phase:${gameManager.getGamePhase?.() ?? gameManager.gamePhase} | t:${gameManager.getDayTimer?.() ?? gameManager.dayTimer}`);
    this.isActive = true;
    this.playerTribeSafe = this.didPlayerTribeWinImmunity();

    window.debugBanner?.('POST-CHALLENGE', this.playerTribeSafe ? 'IMMUNE' : 'VULNERABLE');

    const journeyIsEligibleForReturnCamp = this.isRiskProtectJourneyPendingForThisPostChallenge();
    window.debugBanner?.('JOURNEY-RETURN CHECK', journeyIsEligibleForReturnCamp ? 'riskProtect pending' : 'not pending');
    const journeyerId = journeyIsEligibleForReturnCamp ? this.resolveJourneyerFromPlayerTribe() : null;
    this.journeyerIdForPhase = journeyerId;
    const playerId = gameManager.getPlayerSurvivor?.()?.id || gameManager.getPlayer?.()?.id || gameManager.playerId;
    const isPlayerJourneyer = !!journeyerId && String(journeyerId) === String(playerId);
    window.debugBanner?.('POST-CH JOURNEY', `before return logic | t:${gameManager.getDayTimer?.() ?? gameManager.dayTimer}`);

    if (journeyerId && isPlayerJourneyer) {
      console.info('[StrategyPhaseSystem] Player is the journeyer; simulating part 1 then running part 2 immediately', {
        journeyerId
      });
      await JourneyReturnCampEvent.simulatePart1IfPlayerAway({
        gameManager,
        strategyPhaseSystem: this,
        journeyerId,
      });
      // Player returns late from the journey: post-challenge strategy begins with 40 minutes left.
      gameManager.dayTimer = 2400;
      gameManager.flags.startCampAtBeachOnce = true;
      gameManager.flags.journeyReturnPart2Fired = true;
      window.debugBanner?.('POST-CHALLENGE', `playerJourneyer=true timer=${gameManager.getDayTimer?.() ?? gameManager.dayTimer}`);
      window.debugBanner?.('CAMP START FLAG', 'startCampAtBeachOnce=true');
      await JourneyReturnCampEvent.startPart2({
        gameManager,
        strategyPhaseSystem: this,
        journeyerId,
        isPlayerJourneyer: true,
      });
      this.markRiskProtectJourneyReturnHandled();
    } else if (journeyerId) {
      console.info('[StrategyPhaseSystem] Running JourneyReturnCampEvent part 1 for non-player journeyer', {
        journeyerId
      });
      // Non-journeyer player should begin strategy with 1 hour while the journeyer is still absent.
      gameManager.dayTimer = 3600;
      gameManager.flags.absentFromCampIds.add(journeyerId);
      await JourneyReturnCampEvent.startPart1({
        gameManager,
        strategyPhaseSystem: this,
        journeyerId,
      });
    }
    window.debugBanner?.('POST-CH JOURNEY', `after return logic | t:${gameManager.getDayTimer?.() ?? gameManager.dayTimer}`);

    if (!this.playerTribeSafe) {
      this.promptPersonalTarget();
      this.scheduleAllianceMeetings();
      this.seedNpcIntentTargetsForPhase();
    }

    this.beginStrategyBeats();
    this.lastStrategyTimerValue = gameManager.getDayTimer?.() ?? gameManager.dayTimer ?? 3600;
    this.startTimerWatcher();
    console.info('[StrategyPhaseSystem] Post-challenge phase initialized', {
      dayTimer: gameManager.getDayTimer?.() ?? gameManager.dayTimer,
      journeyerIdForPhase: this.journeyerIdForPhase,
      playerTribeSafe: this.playerTribeSafe
    });
  }

  didPlayerTribeWinImmunity() {
    const day = gameManager.getCurrentDay?.() ?? gameManager.getDay?.() ?? gameManager.day;
    const result = challengeManager?.getChallengeResult?.(day);
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

  scheduleAllianceMeetings() {
    const allianceSystem = gameManager?.systems?.allianceSystem;
    if (!allianceSystem) return;

    const playerId = gameManager.player?.id;
    if (!playerId) return;

    let alliances = [];
    if (typeof allianceSystem.getAlliancesForMember === 'function') {
      alliances = allianceSystem.getAlliancesForMember(playerId) || [];
    } else if (typeof allianceSystem.getAlliancesForSurvivor === 'function') {
      alliances = allianceSystem.getAlliancesForSurvivor(playerId) || [];
    } else if (typeof allianceSystem.getAllAlliances === 'function') {
      alliances = allianceSystem.getAllAlliances() || [];
    }

    const toMemberIds = (alliance) => {
      const members = alliance?.memberIds ?? alliance?.members ?? [];
      if (!Array.isArray(members)) return [];
      if (members.length && typeof members[0] === 'object') {
        return members.map((m) => m?.id).filter(Boolean);
      }
      return members.filter((m) => m != null);
    };

    const meetingSpots = [
      LocationKeys.SHELTER,
      LocationKeys.CAMPFIRE,
      LocationKeys.WATER_WELL,
      LocationKeys.BEACH,
      LocationKeys.FORK1,
      LocationKeys.FORK2,
      LocationKeys.FORK3
    ];

    this.pendingAllianceMeetings = alliances
      .map((alliance) => {
        const memberIds = toMemberIds(alliance);
        const isPlayerMember = memberIds.some((id) => String(id) === String(playerId));
        if (!isPlayerMember || memberIds.length < 2) return null;
        const allianceId = this.getAllianceKey(alliance) ?? `alliance-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        const spot = meetingSpots[Math.floor(Math.random() * meetingSpots.length)];
        this.logFact({ type: 'allianceMeetingStart', allianceId, location: spot });
        const locationKey = this.normalizeViewKey(spot);
        window.debugBanner?.('ALLIANCE-MEETING', `locationView: ${spot} | locationKey: ${locationKey}`);
        return { allianceId, alliance, locationView: spot, locationKey, memberIds };
      })
      .filter(Boolean);

    this.queueMeetingAlert();
    return this.pendingAllianceMeetings.length;
  }

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

  queueMeetingAlert() {
    if (!this.pendingAllianceMeetings.length) return;
    const next = this.pendingAllianceMeetings[0];
    if (!next) return;

    const toast = document.createElement('div');
    toast.className = 'strategy-meeting-toast';
    toast.textContent = `Your alliance wants to meet at the ${next.locationView}.`;

    const button = document.createElement('button');
    button.className = 'rect-button';
    button.textContent = 'Go Now';
    button.addEventListener('click', () => {
      document.body.removeChild(toast);
      const tryKeys = [
        next.locationView,
        `${next.locationView}View`,
        `${next.locationView.charAt(0).toUpperCase()}${next.locationView.slice(1)}View`,
      ];

      for (const k of tryKeys) {
        try {
          window.campScreen?.loadView?.(k);
          break;
        } catch (e) {}
      }
    });

    toast.appendChild(button);
    document.body.appendChild(toast);

    setTimeout(() => {
      if (toast.parentElement) toast.remove();
    }, 7000);
  }

  handleCampViewNavigation(viewName) {
    const loadedKey = this.normalizeViewKey(viewName);
    const pendingIndex = this.pendingAllianceMeetings.findIndex((m) => m.locationKey === loadedKey);
    const pendingKeys = this.pendingAllianceMeetings.map((m) => m.locationKey).join(', ');
    window.debugBanner?.('CAMP-NAV', `view: ${viewName} | loadedKey: ${loadedKey} | pendingKeys: ${pendingKeys}`);
    const pending = pendingIndex >= 0 ? this.pendingAllianceMeetings[pendingIndex] : null;
    if (!pending) return;
    const meetingKey = `${pending.allianceId}-${pending.locationKey || loadedKey}`;
    if (this.completedAllianceMeetings.has(meetingKey)) return;

    const alliance = pending.alliance || this.resolveAllianceById(pending.allianceId);
    if (!alliance) {
      this.completedAllianceMeetings.add(meetingKey);
      this.pendingAllianceMeetings.splice(pendingIndex, 1);
      this.queueMeetingAlert();
      return;
    }

    alliance.memberIds = pending.memberIds || alliance.memberIds;
    this.launchAllianceConversation(alliance, viewName);
    this.completedAllianceMeetings.add(meetingKey);
    this.pendingAllianceMeetings.splice(pendingIndex, 1);
    this.queueMeetingAlert();
  }

  promptPersonalTarget() {
    const tribe = gameManager.getPlayerTribe();
    if (!tribe) return;

    const options = tribe.members.filter((m) => !m.isPlayer);
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
      const options = tribe?.members?.filter((m) => !m.isPlayer) || [];
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
    const alliances = allianceSystem?.getAlliancesForMember?.(player?.id) || [];

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
        const target = gameManager.survivors?.find((s) => s.id === resolveCurrentTargetId());
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
          this.logFact({ type: 'allianceTargetConfirmed', allianceId: allianceKey, targetId: resolveCurrentTargetId() || null });
        });

        const changeBtn = document.createElement('button');
        changeBtn.textContent = 'Change';
        changeBtn.className = 'rect-button alt';
        changeBtn.addEventListener('click', () => {
          const tribe = gameManager.getPlayerTribe();
          const options = tribe?.members?.filter((m) => !m.isPlayer) || [];
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

  beginStrategyBeats() {
    this.beatIntervalId && clearInterval(this.beatIntervalId);
    if (this.playerTribeSafe) return;
    this.beatIntervalId = setInterval(() => this.runStrategyBeat(), 12000);
  }

  updateNpcIntentTarget(npcId, targetId, { reason = 'unknown', confidenceDelta = 0, absoluteConfidence = null } = {}) {
    if (!npcId || !targetId) return null;
    const priorMeta = this.npcIntentMeta.get(npcId) || { confidence: 0.5, reason: 'seed', updatedAt: Date.now() };
    const fallbackConfidence = (Number(priorMeta.confidence) || 0.5) + (Number(confidenceDelta) || 0);
    const seededConfidence = absoluteConfidence == null ? fallbackConfidence : Number(absoluteConfidence);
    const nextConfidence = Math.min(1, Math.max(0, seededConfidence));

    this.npcIntentTargets.set(npcId, targetId);
    const meta = {
      confidence: Number(nextConfidence.toFixed(2)),
      reason,
      updatedAt: Date.now(),
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
    window.debugBanner?.('NPC-INTENT', `${npcName} -> ${targetName} (${meta.confidence.toFixed(2)})`);
    return meta;
  }

  seedNpcIntentTargetsForPhase() {
    if (this.playerTribeSafe) return 0;
    const tribe = gameManager.getPlayerTribe?.();
    if (!tribe) return 0;

    const npcMembers = (tribe.members || []).filter((m) => m && !m.isPlayer);
    if (!npcMembers.length) return 0;

    const pickThreatTargetForNpc = (npc) => {
      const candidates = npcMembers.filter((m) => String(m.id) !== String(npc.id));
      if (!candidates.length) return null;

      let best = null;
      let bestScore = -Infinity;
      const relationshipSystem = gameManager?.systems?.relationshipSystem;
      candidates.forEach((candidate) => {
        const threatScore = ((Number(candidate.physical) || 50) + (Number(candidate.mental) || 50)) / 2;
        const relationshipValue = this.resolveRelationshipValue(relationshipSystem, npc.id, candidate.id);
        const score = threatScore + (100 - relationshipValue);
        if (score > bestScore) {
          best = candidate;
          bestScore = score;
        }
      });

      return best?.id || null;
    };

    let seededCount = 0;
    npcMembers.forEach((npc) => {
      const seededTargetId = this.personalTargetId || pickThreatTargetForNpc(npc);
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

  computeTribalTargetBoard() {
    const heatMap = {};
    const increment = (targetId, weight = 1) => {
      if (!targetId) return;
      const key = String(targetId);
      heatMap[key] = (heatMap[key] || 0) + weight;
    };

    this.npcIntentTargets.forEach((targetId) => increment(targetId));

    if (this.personalTargetId) {
      increment(this.personalTargetId);
    }

    const playerId = gameManager.getPlayerSurvivor?.()?.id || gameManager.player?.id;
    const allianceSystem = gameManager?.systems?.allianceSystem;
    const alliances = allianceSystem?.getAlliancesForMember?.(playerId) || [];
    alliances.forEach((alliance) => {
      const allianceId = this.getAllianceKey(alliance);
      increment(this.allianceTargets.get(allianceId));
    });

    const ranked = Object.entries(heatMap).sort((a, b) => b[1] - a[1]);
    const primaryTargetId = ranked[0]?.[0] ?? null;
    const secondaryTargetId = ranked[1]?.[0] ?? null;
    const computedAt = Date.now();

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

  runStrategyBeat() {
    if (!this.isActive || gameManager.gameState !== GameState.CAMP) return;
    if (this.playerTribeSafe) return;
    if (gameManager.flags?.campEventActive) return;

    const tribe = gameManager.getPlayerTribe();
    if (!tribe) return;

    const speaker = this.pickSpeaker(tribe.members);
    if (!speaker) return;

    const action = this.pickAction(speaker);
    const targetId = this.pickTargetForAction(action, tribe.members, speaker);

    if (targetId) {
      this.firstTargetIntroduced = true;
      this.updateNpcIntentTarget(speaker.id, targetId, {
        reason: `strategyBeat:${action}`,
        confidenceDelta: action === 'HARD_COUNTER' ? 0.12 : action === 'SOFT_COUNTER' ? 0.08 : 0.05,
      });
    }

    this.logFact({
      type: 'strategyBeat',
      speakerId: speaker.id,
      gameplayStyle: speaker.gameplayStyle,
      action,
      targetId,
    });

    if (Math.random() < this.getRumorLeakChance(speaker)) {
      this.logFact({ type: 'rumor', speakerId: speaker.id, targetId, toPlayer: true });
      if (targetId) {
        this.updateNpcIntentTarget(speaker.id, targetId, {
          reason: `rumorLeak:${action}`,
          confidenceDelta: 0.03,
        });
      }
    }
  }

  launchAllianceConversation(alliance, location) {
    const overlay = document.createElement('div');
    overlay.className = 'strategy-overlay';

    const modal = document.createElement('div');
    modal.className = 'strategy-modal strategy-convo-modal';

    const title = document.createElement('h2');
    title.textContent = `${alliance.name || 'Alliance'} meeting (${location})`;
    modal.appendChild(title);

    const logArea = document.createElement('div');
    logArea.className = 'strategy-convo-log';
    modal.appendChild(logArea);

    const actions = document.createElement('div');
    actions.className = 'strategy-actions';
    modal.appendChild(actions);

    const members = (alliance.memberIds || [])
      .map((id) => gameManager.survivors?.find((s) => s.id === id))
      .filter(Boolean);
    const tribe = gameManager.getPlayerTribe();
    const tribeMembers = tribe?.members || [];

    const npcMembers = members.filter((m) => !m.isPlayer);
    const player = gameManager.getPlayerSurvivor();

    const addLine = (text) => {
      const line = document.createElement('div');
      line.textContent = text;
      logArea.appendChild(line);
      logArea.scrollTop = logArea.scrollHeight;
    };

    const proposeTarget = (speaker) => {
      return this.pickTargetForAction('SOFT_COUNTER', tribeMembers, speaker) || tribeMembers.find((m) => !m.isPlayer)?.id;
    };

    const runDiscussion = (initial) => {
      const allianceKey = this.getAllianceKey(alliance) ?? `alliance-${alliance.name || 'unnamed'}`;
      const stances = new Map();
      const proposedBy = initial.by;
      stances.set(initial.targetId, [{ speakerId: proposedBy.id, stance: 'propose' }]);
      this.logFact({ type: 'targetProposed', allianceId: allianceKey, speakerId: proposedBy.id, targetId: initial.targetId });

      npcMembers.forEach((npc) => {
        if (npc.id === proposedBy.id) return;
        const stanceRoll = Math.random();
        let stance = 'agree';
        if (npc.gameplayStyle === 'Wildcard' && stanceRoll < 0.3) stance = 'counter';
        else if (stanceRoll < 0.15) stance = 'silent';
        else if (stanceRoll < 0.3) stance = 'reluctant';

        let targetId = initial.targetId;
        if (stance === 'counter') {
          targetId = proposeTarget(npc) || targetId;
        }
        const bucket = stances.get(targetId) || [];
        bucket.push({ speakerId: npc.id, stance });
        stances.set(targetId, bucket);
        this.logFact({ type: 'targetResponse', allianceId: allianceKey, speakerId: npc.id, stance, targetId });
        addLine(`${npc.firstName} ${stance === 'counter' ? 'counters with' : stance === 'reluctant' ? 'softly agrees on' : stance === 'silent' ? 'stays quiet about' : 'backs'} ${this.getName(targetId)}.`);
      });

      let chosenTarget = initial.targetId;
      let bestScore = 0;
      stances.forEach((entries, target) => {
        const score = entries.length;
        if (score > bestScore) {
          bestScore = score;
          chosenTarget = target;
        }
      });

      this.logFact({ type: 'allianceTargetLocked', allianceId: allianceKey, targetId: chosenTarget });
      this.allianceTargets.set(allianceKey, chosenTarget);
      npcMembers.forEach((npc) => {
        this.updateNpcIntentTarget(npc.id, chosenTarget, {
          reason: `allianceLock:${allianceKey}`,
          confidenceDelta: 0.04,
        });
      });
      return chosenTarget;
    };

    const finishMeeting = (targetId) => {
      const finalActions = document.createElement('div');
      finalActions.className = 'strategy-actions';
      const closeBtn = document.createElement('button');
      closeBtn.textContent = 'Wrap up';
      closeBtn.className = 'rect-button';
      closeBtn.addEventListener('click', () => {
        document.body.removeChild(overlay);
      });
      finalActions.appendChild(closeBtn);
      modal.appendChild(finalActions);
    };

    const startFlow = () => {
      addLine('Your alliance huddles up. Who speaks first?');
      const speakBtn = document.createElement('button');
      speakBtn.textContent = "I'll speak first";
      speakBtn.className = 'rect-button';
      speakBtn.addEventListener('click', () => {
        actions.innerHTML = '';
        const tribeOptions = tribeMembers.filter((m) => !m.isPlayer);
        const picker = this.buildAvatarGridPickerModal({
          title: 'Who do you pitch?',
          confirmLabel: 'Propose',
          options: tribeOptions,
          tribeColor: tribe?.color || tribe?.tribeColor,
          defaultSelection: this.personalTargetId || tribeOptions[0]?.id,
          onConfirm: (targetId) => {
            addLine(`You put out ${this.getName(targetId)}.`);
            const finalTarget = runDiscussion({ by: player, targetId });
            addLine(`Group leans toward ${this.getName(finalTarget)}.`);
            this.offerSway(finalTarget, alliance, modal, overlay, addLine, finishMeeting);
          },
        });
        document.body.appendChild(picker.overlay);
      });

      const npcBtn = document.createElement('button');
      npcBtn.textContent = 'Let someone else speak';
      npcBtn.className = 'rect-button alt';
      npcBtn.addEventListener('click', () => {
        actions.innerHTML = '';
        const npc = npcMembers[Math.floor(Math.random() * npcMembers.length)];
        const targetId = proposeTarget(npc);
        addLine(`${npc.firstName} starts: "What about ${this.getName(targetId)}?"`);
        const finalTarget = runDiscussion({ by: npc, targetId });
        addLine(`Group leans toward ${this.getName(finalTarget)}.`);
        this.offerSway(finalTarget, alliance, modal, overlay, addLine, finishMeeting);
      });

      actions.appendChild(speakBtn);
      actions.appendChild(npcBtn);
    };

    modal.appendChild(actions);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    startFlow();
  }

  offerSway(currentTarget, alliance, modal, overlay, addLine, finishMeeting) {
    const allianceKey = this.getAllianceKey(alliance) ?? `alliance-${alliance.name || 'unnamed'}`;
    const actionRow = document.createElement('div');
    actionRow.className = 'strategy-actions';

    const goWithGroup = document.createElement('button');
    goWithGroup.textContent = 'Go with the group';
    goWithGroup.className = 'rect-button';
    goWithGroup.addEventListener('click', () => {
      addLine(`You stick with ${this.getName(currentTarget)}.`);
      modal.removeChild(actionRow);
      finishMeeting(currentTarget);
    });

    const pushDifferent = document.createElement('button');
    pushDifferent.textContent = 'Push a different name';
    pushDifferent.className = 'rect-button alt';
    pushDifferent.addEventListener('click', () => {
      const tribe = gameManager.getPlayerTribe();
      const options = tribe?.members?.filter((m) => !m.isPlayer) || [];
      const picker = this.buildAvatarGridPickerModal({
        title: 'Who do you push?',
        confirmLabel: 'Push',
        options,
        tribeColor: tribe?.color || tribe?.tribeColor,
        defaultSelection: options[0]?.id,
        onConfirm: (targetId) => {
          const sway = this.calculateSwayProbability(alliance);
          const roll = Math.random();
          const success = roll < sway.probability;
          this.logFact({
            type: 'playerSwayAttempt',
            allianceId: allianceKey,
            targetId,
            probability: sway.probability,
            success,
            trustAvg: sway.trustAvg,
            relAvg: sway.relAvg,
            styleModifier: sway.styleModifier,
            breakdown: sway.breakdown,
          });
          window.debugBanner?.(
            'SWAY-PROB',
            `${(sway.probability * 100).toFixed(0)}% roll:${roll.toFixed(3)} ${success ? 'success' : 'fail'} (${this.getName(targetId)})`
          );
          window.debugBanner?.(
            'SWAY-ATTEMPT',
            `p:${sway.probability.toFixed(3)} result:${success ? 'success' : 'fail'} trustAvg:${sway.trustAvg.toFixed(1)} relAvg:${sway.relAvg.toFixed(1)} style:${sway.styleModifier.toFixed(3)} social:${sway.breakdown.socialComponent.toFixed(3)}`
          );
          if (success) {
            addLine(`You sway them toward ${this.getName(targetId)}!`);
            this.allianceTargets.set(allianceKey, targetId);
            this.logFact({ type: 'allianceTargetLocked', allianceId: allianceKey, targetId });
            const memberIds = alliance.memberIds || [];
            memberIds
              .map((id) => gameManager.survivors?.find((s) => s.id === id))
              .filter((s) => s && !s.isPlayer)
              .forEach((npc) => {
                this.updateNpcIntentTarget(npc.id, targetId, {
                  reason: `playerSwaySuccess:${allianceKey}`,
                  confidenceDelta: 0.05,
                });
              });
            finishMeeting(targetId);
          } else {
            addLine('They hesitate and stick with the original plan.');
            this.logFact({ type: 'suspicionGained', allianceId: allianceKey, speakerId: allianceKey, aboutId: gameManager.player?.id, reason: 'pushed against majority' });
            finishMeeting(currentTarget);
          }
          modal.removeChild(actionRow);
        },
      });
      document.body.appendChild(picker.overlay);
    });

    actionRow.appendChild(goWithGroup);
    actionRow.appendChild(pushDifferent);
    modal.appendChild(actionRow);
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

    members.forEach((npc) => {
      const trustValue = this.resolveTrustValue(trustSystem, player?.id, npc.id);
      const relationshipValue = this.resolveRelationshipValue(relationshipSystem, player?.id, npc.id);
      trustTotal += trustValue;
      relTotal += relationshipValue;
      styleBonus += this.calculateStyleModifierForSwayMember(npc);
    });

    const memberCount = Math.max(1, members.length);
    const trustAvg = trustTotal / memberCount;
    const relAvg = relTotal / memberCount;
    const trustDelta = trustAvg - 50;
    const relDelta = relAvg - 50;
    const socialComponent = ((trustDelta * 0.6) + (relDelta * 0.4)) / 250;
    const rawProbability = 0.35 + socialComponent + styleBonus;
    const probability = Math.min(0.8, Math.max(0.15, rawProbability));

    window.debugBanner?.(
      'SWAY-CALC',
      `base:0.35 trustAvg:${trustAvg.toFixed(1)} relAvg:${relAvg.toFixed(1)} social:${socialComponent.toFixed(3)} style:${styleBonus.toFixed(3)} => ${(probability * 100).toFixed(0)}%`
    );

    return {
      probability,
      trustAvg,
      relAvg,
      styleModifier: styleBonus,
      breakdown: {
        base: 0.35,
        trustWeight: 0.6,
        relationshipWeight: 0.4,
        socialComponent,
        styleModifier: styleBonus,
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
    return candidates[Math.floor(Math.random() * candidates.length)];
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
    let roll = Math.random() * total;
    for (const item of weighted) {
      roll -= item.weight;
      if (roll <= 0) return item.key;
    }
    return 'DEFLECT';
  }

  pickTargetForAction(action, members, speaker) {
    if (action === 'DEFLECT' || action === 'SILENT') return null;

    const others = members.filter((m) => m.id !== speaker.id && !m.isPlayer);
    if (!others.length) return null;

    if (!this.firstTargetIntroduced && action === 'ENDORSE') {
      // If no one has named a name yet, prefer proposing instead of endorsing nothing
      action = 'SOFT_COUNTER';
    }

    const competitiveBias = speaker.gameplayStyle === 'Competitive';
    if (competitiveBias) {
      const challengeThreats = others.filter((m) => m.physical >= 70 || m.mental >= 70);
      if (challengeThreats.length && Math.random() < 0.6) {
        return challengeThreats[Math.floor(Math.random() * challengeThreats.length)].id;
      }
    }

    return others[Math.floor(Math.random() * others.length)].id;
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
    const enriched = { ...fact, timestamp: Date.now() };
    this.strategyFacts.push(enriched);
    this.playerVisibleFacts.push(enriched);

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

  startTimerWatcher() {
    this.timerWatcherId && clearInterval(this.timerWatcherId);
    this.timerWatcherId = setInterval(() => {
      if (!this.isActive) return;
      if (gameManager.flags?.campEventActive) return;

      const currentTimer = gameManager.getDayTimer();
      const previousTimer = Number.isFinite(this.lastStrategyTimerValue) ? this.lastStrategyTimerValue : currentTimer;

      if (
        this.journeyerIdForPhase &&
        !gameManager.flags?.journeyReturnPart2Fired &&
        previousTimer > 2400 &&
        currentTimer <= 2400
      ) {
        gameManager.flags.journeyReturnPart2Fired = true;
        this.journeyPart2Running = true;
        JourneyReturnCampEvent.startPart2({
          gameManager,
          strategyPhaseSystem: this,
          journeyerId: this.journeyerIdForPhase,
          isPlayerJourneyer: false,
        }).finally(() => {
          this.markRiskProtectJourneyReturnHandled();
          this.journeyPart2Running = false;
        });
        this.lastStrategyTimerValue = currentTimer;
        return;
      }

      this.lastStrategyTimerValue = currentTimer;

      if (currentTimer <= 0) {
        this.handleTimerExpired();
      }
    }, 1000);
  }

  resolveJourneyerFromPlayerTribe() {
    const journey = gameManager?.journey;
    const tribe = gameManager.getPlayerTribe?.();
    if (!journey || !tribe) return null;
    const members = tribe.members || [];
    const memberIds = new Set(members.map(m => String(m.id)));
    const tribeKeys = [tribe.id, tribe.tribeName, tribe.name, tribe.tribeColor, tribe.color]
      .filter(Boolean)
      .map(v => String(v));

    if (journey.participantsByTribe) {
      for (const key of tribeKeys) {
        const hit = journey.participantsByTribe[key];
        if (hit && memberIds.has(String(hit))) return hit;
      }
      for (const id of Object.values(journey.participantsByTribe)) {
        if (id && memberIds.has(String(id))) return id;
      }
    }

    if (Array.isArray(journey.participants)) {
      const found = journey.participants.find(id => memberIds.has(String(id)));
      if (found) return found;
    }
    return null;
  }

  isRiskProtectJourneyPendingForThisPostChallenge() {
    const journey = gameManager?.journey;
    const marker = gameManager?.flags?.lastJourneyEvent;
    const currentDay = gameManager.getDay?.() ?? gameManager.day;

    const journeyPending = journey?.type === 'riskProtect' && journey?.returnCampEventPending === true;
    const markerPending = marker?.type === 'riskProtect' && marker?.pendingReturnCampEvent === true;
    if (!journeyPending && !markerPending) {
      return false;
    }

    const markerDayMatches = marker?.day != null && Number(marker.day) === Number(currentDay);
    const journeyDayMatches = journey?.day != null && Number(journey.day) === Number(currentDay);
    if (markerPending && markerDayMatches) return true;
    if (journeyPending && journeyDayMatches) return true;

    // Fallback for older saves that may not have day metadata on journey state.
    if (journeyPending && journey?.participantsByTribe) {
      return true;
    }

    if (markerPending && marker?.day == null && journeyPending) {
      return true;
    }

    if (markerPending && marker.day != null && Number(marker.day) !== Number(currentDay)) {
      return false;
    }

    return journeyPending;
  }

  markRiskProtectJourneyReturnHandled() {
    const marker = gameManager?.flags?.lastJourneyEvent;
    if (marker?.type === 'riskProtect') {
      marker.pendingReturnCampEvent = false;
      marker.handledAt = Date.now();
    }
    if (gameManager?.journey) {
      gameManager.journey.returnCampEventPending = false;
      gameManager.journey.returnCampEventHandledAt = Date.now();
    }
  }

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
    if (!this.isActive) return;
    this.isActive = false;
    this.beatIntervalId && clearInterval(this.beatIntervalId);
    this.timerWatcherId && clearInterval(this.timerWatcherId);

    if (!this.playerTribeSafe) {
      await this.lockPersonalTarget();
      await this.lockAlliances();
      this.triggerNpcScramble();
      this.computeTribalTargetBoard();
    }

    this.showSummaryView();
  }

  triggerNpcScramble() {
    const tribe = gameManager.getPlayerTribe();
    if (!tribe) return;

    tribe.members
      .filter((m) => !m.isPlayer)
      .forEach((npc) => {
        if (Math.random() < 0.4) {
          const action = this.pickAction(npc);
          const targetId = this.pickTargetForAction(action, tribe.members, npc);
          this.logFact({
            type: 'npcScramble',
            speakerId: npc.id,
            action,
            targetId,
          });
          if (targetId) {
            this.updateNpcIntentTarget(npc.id, targetId, {
              reason: `npcScramble:${action}`,
              confidenceDelta: 0.06,
            });
          }
        }
      });
  }

  showSummaryView() {
    if (window.campScreen && typeof window.campScreen.loadView === 'function') {
      window.campScreen.loadView(LocationKeys.STRATEGY_SUMMARY);
    }
  }

  getSummaryFacts() {
    return this.strategyFacts;
  }

  proceedAfterSummary() {
    if (this.playerTribeSafe) {
      gameManager.day += 1;
      gameManager.gamePhase = GamePhase.PRE_CHALLENGE;
      gameManager.dayTimer = 7200;
      eventManager.publish(GameEvents.GAME_PHASE_CHANGED, { phase: GamePhase.PRE_CHALLENGE });
      const existingClock = document.getElementById('camp-clock');
      if (existingClock) existingClock.remove();
      window.campScreen?.renderClockUI?.();
      return;
    }

    // TODO: Wire Tribal Council transition when available
  }

  buildAvatarGridPickerModal({ title, confirmLabel, options, tribeColor = '#f5c76a', defaultSelection, onConfirm, onCancel }) {
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
          confirmBtn.disabled = false;
        });

        grid.appendChild(tile);
      });
    };

    const buttons = document.createElement('div');
    buttons.className = 'strategy-actions';
    const confirmBtn = document.createElement('button');
    confirmBtn.textContent = confirmLabel;
    confirmBtn.disabled = !selectedId;
    confirmBtn.addEventListener('click', () => {
      if (!selectedId) return;
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
