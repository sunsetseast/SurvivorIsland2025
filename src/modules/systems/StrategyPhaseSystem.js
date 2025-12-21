import eventManager, { GameEvents } from '../core/EventManager.js';
import gameManager, { GamePhase, GameState } from '../core/GameManager.js';
import challengeManager from '../core/ChallengeManager.js';

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
      .replace(/\s+/g, '')
      .replace(/view$/i, '');
  }

  reset({ skipGameManager = false } = {}) {
    this.isActive = false;
    this.playerTribeSafe = false;
    this.personalTargetId = null;
    this.allianceTargets = new Map();
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
    if (!skipGameManager) {
      gameManager.conversationPhaseOverride = null;
    }
  }

  startPostChallengePhase() {
    const phaseKey = `${gameManager.getDay?.() ?? gameManager.day}-${gameManager.getGamePhase?.() ?? gameManager.gamePhase}`;
    if (this.startedForPhaseKey === phaseKey) return;
    this.startedForPhaseKey = phaseKey;
    gameManager.conversationPhaseOverride = 'POST_CHALLENGE';

    // Set the timer for a 1-hour in-game scramble and freeze survival decay expectations
    gameManager.dayTimer = 3600;
    this.isActive = true;
    this.playerTribeSafe = this.didPlayerTribeWinImmunity();

    window.debugBanner?.('POST-CHALLENGE', this.playerTribeSafe ? 'IMMUNE' : 'VULNERABLE');

    if (!this.playerTribeSafe) {
      this.promptPersonalTarget();
      this.scheduleAllianceMeetings();
    }

    this.beginStrategyBeats();
    this.startTimerWatcher();
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

    const meetingSpots = ['ShelterView', 'CampfireView', 'WaterWellView', 'BeachView', 'Fork1View', 'Fork2View', 'Fork3View'];

    this.pendingAllianceMeetings = alliances
      .map((alliance) => {
        const memberIds = toMemberIds(alliance);
        const isPlayerMember = memberIds.some((id) => String(id) === String(playerId));
        if (!isPlayerMember || memberIds.length < 2) return null;
        const allianceId = alliance.id ?? alliance.allianceId ?? `alliance-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
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

      alliances.forEach((alliance) => {
        const entry = document.createElement('div');
        entry.className = 'strategy-entry';

        const title = document.createElement('div');
        title.className = 'strategy-entry-title';
        title.textContent = alliance.name || 'Alliance';
        entry.appendChild(title);

        const targetRow = document.createElement('div');
        targetRow.className = 'strategy-entry-row';
        const targetId = this.allianceTargets.get(alliance.id);
        const target = gameManager.survivors?.find((s) => s.id === targetId);
        const targetLabel = document.createElement('div');
        targetLabel.textContent = target ? `${target.firstName}` : 'No target chosen';
        targetRow.appendChild(targetLabel);

        const buttonRow = document.createElement('div');
        buttonRow.className = 'strategy-entry-actions';
        const keepBtn = document.createElement('button');
        keepBtn.textContent = 'Keep';
        keepBtn.className = 'rect-button';
        keepBtn.addEventListener('click', () => {
          if (targetId) {
            this.logFact({ type: 'allianceTargetConfirmed', allianceId: alliance.id, targetId });
          }
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
            defaultSelection: targetId || options[0]?.id,
            onConfirm: (selected) => {
              this.allianceTargets.set(alliance.id, selected);
              this.logFact({ type: 'allianceTarget', allianceId: alliance.id, targetId: selected });
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
    this.beatIntervalId = setInterval(() => this.runStrategyBeat(), 12000);
  }

  runStrategyBeat() {
    if (!this.isActive || gameManager.gameState !== GameState.CAMP) return;

    const tribe = gameManager.getPlayerTribe();
    if (!tribe) return;

    const speaker = this.pickSpeaker(tribe.members);
    if (!speaker) return;

    const action = this.pickAction(speaker);
    const targetId = this.pickTargetForAction(action, tribe.members, speaker);

    if (targetId) {
      this.firstTargetIntroduced = true;
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
      const stances = new Map();
      const proposedBy = initial.by;
      stances.set(initial.targetId, [{ speakerId: proposedBy.id, stance: 'propose' }]);
      this.logFact({ type: 'targetProposed', allianceId: alliance.id, speakerId: proposedBy.id, targetId: initial.targetId });

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
        this.logFact({ type: 'targetResponse', allianceId: alliance.id, speakerId: npc.id, stance, targetId });
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

      this.logFact({ type: 'allianceTargetLocked', allianceId: alliance.id, targetId: chosenTarget });
      this.allianceTargets.set(alliance.id, chosenTarget);
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
          const success = Math.random() < 0.45;
          this.logFact({ type: 'playerSwayAttempt', allianceId: alliance.id, targetId, success });
          if (success) {
            addLine(`You sway them toward ${this.getName(targetId)}!`);
            this.allianceTargets.set(alliance.id, targetId);
            this.logFact({ type: 'allianceTargetLocked', allianceId: alliance.id, targetId });
            finishMeeting(targetId);
          } else {
            addLine('They hesitate and stick with the original plan.');
            this.logFact({ type: 'suspicionGained', allianceId: alliance.id, speakerId: alliance.id, aboutId: gameManager.player?.id, reason: 'pushed against majority' });
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
    const rel = relSystem?.getRelationship?.(player?.id, speaker?.id)?.value ?? 50;
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
      if (gameManager.getDayTimer() <= 0) {
        this.handleTimerExpired();
      }
    }, 1000);
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
        }
      });
  }

  showSummaryView() {
    if (window.campScreen && typeof window.campScreen.loadView === 'function') {
      window.campScreen.loadView('strategySummary');
    }
  }

  getSummaryFacts() {
    return this.playerVisibleFacts;
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
