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
    this.reset();
    this.beatIntervalId = null;
    this.timerWatcherId = null;
  }

  initialize() {
    eventManager.subscribe(GameEvents.GAME_PHASE_CHANGED, ({ phase }) => {
      if (phase === GamePhase.POST_CHALLENGE) {
        this.startPostChallengePhase();
      } else {
        this.reset();
      }
    });
  }

  reset() {
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
  }

  startPostChallengePhase() {
    // Set the timer for a 1-hour in-game scramble and freeze survival decay expectations
    gameManager.dayTimer = 3600;
    this.isActive = true;
    this.playerTribeSafe = this.didPlayerTribeWinImmunity();

    window.debugBanner?.('POST-CHALLENGE', this.playerTribeSafe ? 'IMMUNE' : 'VULNERABLE');

    if (!this.playerTribeSafe) {
      this.promptPersonalTarget();
    }

    this.beginStrategyBeats();
    this.startTimerWatcher();
  }

  didPlayerTribeWinImmunity() {
    const result = challengeManager.getChallengeResult(gameManager.getDay());
    const winningKeys = new Set();

    if (Array.isArray(result?.winningTribeKeys)) {
      result.winningTribeKeys.forEach((k) => winningKeys.add(k));
    }
    if (result?.winningTribeKey) {
      winningKeys.add(result.winningTribeKey);
    }

    const playerTribe = gameManager.getPlayerTribe();
    const playerKey = playerTribe?.id ?? playerTribe?.tribeName;
    return playerKey != null && winningKeys.has(playerKey);
  }

  promptPersonalTarget() {
    const tribe = gameManager.getPlayerTribe();
    if (!tribe) return;

    const options = tribe.members.filter((m) => !m.isPlayer);
    if (!options.length) return;

    const modal = this.buildTargetModal({
      title: 'Choose your personal target',
      confirmLabel: 'Set Target',
      options,
      defaultSelection: this.personalTargetId || options[0].id,
      onConfirm: (targetId) => {
        this.personalTargetId = targetId;
        this.logFact({ type: 'personalTargetSet', speakerId: gameManager.player?.id, targetId });
      },
    });

    document.body.appendChild(modal.overlay);
  }

  lockPersonalTarget() {
    if (this.playerTribeSafe) return Promise.resolve();

    return new Promise((resolve) => {
      const tribe = gameManager.getPlayerTribe();
      const options = tribe?.members?.filter((m) => !m.isPlayer) || [];
      const modal = this.buildTargetModal({
        title: 'Lock your vote',
        confirmLabel: 'Confirm Target',
        options,
        defaultSelection: this.personalTargetId || options[0]?.id,
        onConfirm: (targetId) => {
          this.personalTargetId = targetId;
          this.logFact({ type: 'personalTargetLocked', speakerId: gameManager.player?.id, targetId });
          resolve();
        },
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
      overlay.innerHTML = `
        <div class="strategy-modal">
          <h2>Alliance Lock-In</h2>
          <div id="strategy-alliance-list" class="strategy-list"></div>
          <div class="strategy-actions">
            <button id="strategy-alliance-save">Save Choices</button>
          </div>
        </div>
      `;

      const list = overlay.querySelector('#strategy-alliance-list');
      alliances.forEach((alliance) => {
        const entry = document.createElement('div');
        entry.className = 'strategy-entry';
        const heading = document.createElement('div');
        heading.className = 'strategy-entry-title';
        heading.textContent = alliance.name || 'Alliance';

        const select = document.createElement('select');
        const memberIds = alliance.memberIds || [];
        memberIds
          .map((id) => gameManager.survivors.find((s) => s.id === id))
          .filter(Boolean)
          .forEach((member) => {
            const opt = document.createElement('option');
            opt.value = member.id;
            opt.textContent = member.firstName || member.name || 'Survivor';
            select.appendChild(opt);
          });

        if (this.allianceTargets.has(alliance.id)) {
          select.value = this.allianceTargets.get(alliance.id);
        }

        select.addEventListener('change', () => {
          this.allianceTargets.set(alliance.id, select.value);
          this.logFact({ type: 'allianceTarget', allianceId: alliance.id, targetId: select.value });
        });

        entry.appendChild(heading);
        entry.appendChild(select);
        list.appendChild(entry);
      });

      overlay.querySelector('#strategy-alliance-save')?.addEventListener('click', () => {
        document.body.removeChild(overlay);
        resolve();
      });

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

  logFact(fact) {
    const enriched = { ...fact, timestamp: Date.now() };
    this.strategyFacts.push(enriched);
    if (fact.toPlayer || fact.speakerId === gameManager.player?.id) {
      this.playerVisibleFacts.push(enriched);
    }

    const debugLabel = fact.type?.toUpperCase?.() || 'FACT';
    const detail = [fact.action, fact.targetId, fact.allianceId].filter(Boolean).join(' | ');
    window.debugBanner?.(debugLabel, detail || '');
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

  buildTargetModal({ title, confirmLabel, options, defaultSelection, onConfirm }) {
    const overlay = document.createElement('div');
    overlay.className = 'strategy-overlay';

    const modal = document.createElement('div');
    modal.className = 'strategy-modal';

    const header = document.createElement('h2');
    header.textContent = title;

    const select = document.createElement('select');
    options.forEach((opt) => {
      const option = document.createElement('option');
      option.value = opt.id;
      option.textContent = opt.firstName || opt.name || 'Target';
      select.appendChild(option);
    });
    select.value = defaultSelection;

    const buttons = document.createElement('div');
    buttons.className = 'strategy-actions';
    const confirm = document.createElement('button');
    confirm.textContent = confirmLabel;
    confirm.addEventListener('click', () => {
      onConfirm?.(select.value);
      document.body.removeChild(overlay);
    });

    const cancel = document.createElement('button');
    cancel.textContent = 'Cancel';
    cancel.addEventListener('click', () => document.body.removeChild(overlay));

    buttons.appendChild(confirm);
    buttons.appendChild(cancel);

    modal.appendChild(header);
    modal.appendChild(select);
    modal.appendChild(buttons);
    overlay.appendChild(modal);

    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) {
        document.body.removeChild(overlay);
      }
    });

    return { overlay, modal };
  }
}

const strategyPhaseSystem = new StrategyPhaseSystem();

export default strategyPhaseSystem;
