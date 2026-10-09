import {
  ACTION_DEFINITIONS,
  CONVERSATION_CATEGORIES,
  conversationCapabilities,
  validateConversationCatalog,
} from "./ConversationActionCatalog.js";
import ConversationResolver, {
  CONVERSATION_RESOLVER_TYPES,
} from "./ConversationResolver.js";
import ConversationView from "./ConversationView.js";
import { allianceChoices, allianceOpening } from "./AllianceConversation.js";
import eventManager, { GameEvents } from "../core/EventManager.js";
import { gameManager, GameState, GamePhase } from "../core/GameManager.js";
import challengeManager from "../core/ChallengeManager.js";
import { createElement, clearChildren } from "../utils/DOMUtils.js";
import { getRandomInt } from "../utils/CommonUtils.js";
import timerManager from "../utils/TimerManager.js";
import socialEngine from "./SocialEngine.js";
import { LocationKeys } from "../core/LocationKeys.js";
import { scrambleNodes, resolveScrambleNode } from "./ScrambleConversation.js";
import { DealTypes } from "./DealSystem.js";
import { physicalCampLocation } from "../locations/LocationUtils.js";
import { isCampPhysicallyPresent } from "../locations/CampPresence.js";
import { campEvidenceRank, campEvidenceConfidence } from "./CampKnowledge.js";
import {
  contextualScrambleChoices,
  formatScrambleSpeech,
  buildPlayerScrambleRead,
} from "../ui/ScramblePresentation.js";
import {
  rememberConversationTribal,
  rememberConversationChallenge,
} from "./ConversationEvents.js";

// DEV NOTE (ConversationSystem)
// - NPC stances: computed per exchange from relationship, paranoia, gameplay style, and risk.
// - Phase gating: pre allows personal/light strategy; post emphasizes strategic topics + vote planning.
// - Memory logging: _logSocialEvent funnels structured records into SocialMemorySystem for later querying.

const NPC_APPROACH_PURPOSES = Object.freeze({
  BUILD_CONNECTION: "BUILD_CONNECTION",
  GOSSIP: "GOSSIP",
  STRATEGY: "STRATEGY",
  OFFER_DEAL: "OFFER_DEAL",
  REASSURE_CHECKIN: "REASSURE_CHECKIN",
  PRESSURE_SOFT: "PRESSURE_SOFT",
});

const CAMP_LOCATIONS = [
  LocationKeys.BEACH,
  LocationKeys.SHELTER,
  LocationKeys.CAMPFIRE,
  LocationKeys.WATER_WELL,
  LocationKeys.ROCKY_SHORE,
  LocationKeys.FORK1,
  LocationKeys.FORK2,
  LocationKeys.FORK3,
];

// Compatibility constants for existing stance/evaluation helper contracts.

const POST_PHASE_INTENTS = Object.freeze({
  ask_intel: "ask_intel",
  pitch_target: "pitch_target",
  deflect_target: "deflect_target",
  verify_story: "verify_story",
  plant_seed: "plant_seed",
  threaten_pressure: "threaten_pressure",
  alliance_commitment: "alliance_commitment",
  talk_specific_person: "talk_specific_person",
  challenge_performance: "challenge_performance",
  challenge_debrief: "challenge_debrief",
  idol_suspicion: "idol_suspicion",
  idol_ask_found: "idol_ask_found",
  idol_ask_who_has: "idol_ask_who_has",
  idol_ask_looked_where: "idol_ask_looked_where",
  idol_claim_have_truth: "idol_claim_have_truth",
  idol_claim_have_lie: "idol_claim_have_lie",
  idol_claim_other_has_lie: "idol_claim_other_has_lie",
  idol_pressure_for_info: "idol_pressure_for_info",
  offer_deal_vote_together: "offer_deal_vote_together",
  offer_deal_share_info: "offer_deal_share_info",
  offer_deal_protect: "offer_deal_protect",
  offer_deal_final2: "offer_deal_final2",
  offer_split_vote: "offer_split_vote",
});

const STRATEGY_APPROACHES = Object.freeze({});

class ConversationSystem {
  constructor(gameManager) {
    this.gameManager = gameManager;
    this.engine = new ConversationResolver(gameManager);
    this.view = new ConversationView(this);
    this.pendingMeetings = [];
    this.activeOverlay = null;
    this.midPhaseTimerId = null;
    this.moods = new Map();
    this.approachTimerId = null;
    this.activeConversationContext = null;
    this._stylesInjected = false;
    this.state = null;
    this.conversationSession = null;
    this.nodeSession = null;
    this.activeConversation = null;
    this._nodeIdCounter = 0;
    this._memoryLog = [];
    this.npcMemory = {};
    this.activeExchange = null;
    this.debugStructuredConvo = false;
    this.debugConvo = false;
    this.convoContext = this._createConvoContext();
  }

  _campGameplayTimestamp() {
    if (this.gameManager?.gameState !== GameState.CAMP) return Date.now();
    return (
      ((this.gameManager.day || 1) * 20000 +
        (this.gameManager.gamePhase === GamePhase.POST_CHALLENGE ? 10000 : 0) +
        Math.max(0, 7200 - (this.gameManager.dayTimer ?? 7200))) *
      1000
    );
  }

  _createConvoContext() {
    return {
      lastVoteReadTargetId: null,
      lastVoteReadTargetName: null,
      lastVoteReadNpcAgreed: false,
      lastVoteReadTurnIndex: null,
      lastVoteReadTimestamp: null,
    };
  }

  _resetConvoContext() {
    this.convoContext = this._createConvoContext();
  }

  _isVoteReadContextFresh() {
    const ctx = this.convoContext;
    if (!ctx?.lastVoteReadTargetId || !ctx?.lastVoteReadTimestamp) return false;
    const ageMs = this._campGameplayTimestamp() - ctx.lastVoteReadTimestamp;
    return ageMs >= 0 && ageMs <= 180000;
  }

  initialize() {
    eventManager.subscribe(GameEvents.TRIBAL_COUNCIL_COMPLETE, (summary) => {
      this.engine.settlePromises(summary);
      rememberConversationTribal(this.engine, summary);
    });
    eventManager.subscribe(
      GameEvents.NPC_CONFRONTATION,
      this._handleNpcConfrontation.bind(this),
    );
    eventManager.subscribe(
      GameEvents.GAME_PHASE_CHANGED,
      this._handlePhaseChange.bind(this),
    );
    eventManager.subscribe(
      GameEvents.CAMP_VIEW_LOADED,
      this._handleCampViewLoaded.bind(this),
    );
    eventManager.subscribe(
      GameEvents.CAMP_EVENT_STARTED,
      this._pauseForCampEvent.bind(this),
    );
    eventManager.subscribe(
      GameEvents.CAMP_EVENT_ENDED,
      this._resumeAfterCampEvent.bind(this),
    );
    if (typeof window !== "undefined") {
      window.runConversationQA = () => this._runConversationQA();
      window.ConversationSystem = window.ConversationSystem || {};
      window.ConversationSystem.validate = () => this.validate();
      window.ConversationSystem.validateMenus = () => this.validateMenus();
      window.ConversationSystem.validateConversationNodes = () =>
        this.validateConversationNodes();
      window.ConversationSystem.runSelfTest = () => this.runSelfTest();
      window.ConversationDebug = window.ConversationDebug || {};
      window.ConversationDebug.testNpcApproach = () =>
        this._debugStartNpcApproach();
      window.ConversationDebug.testVotePitch = () =>
        this._debugStartNpcApproach({ intentType: "vote_pitch" });
      window.ConversationDebug.testAlliancePitch = () =>
        this._debugStartNpcApproach({ intentType: "alliance_pitch" });
      window.ConversationDebug.testWarning = () =>
        this._debugStartNpcApproach({ intentType: "warning" });
    }
  }

  _getConversationSystems() {
    return {
      trustSystem: this.gameManager?.systems?.trustSystem || null,
      relationshipSystem: this.gameManager?.systems?.relationshipSystem || null,
      allianceSystem: this.gameManager?.systems?.allianceSystem || null,
      dealSystem: this.gameManager?.systems?.dealSystem || null,
      dealConsequencesSystem:
        this.gameManager?.systems?.dealConsequencesSystem || null,
    };
  }

  _getPairTrust(ownerId, subjectId) {
    if (!ownerId || !subjectId) return 50;
    return this.gameManager?.getTrust?.(ownerId, subjectId) ?? 50;
  }

  _getRelationshipValue(playerId, npcId) {
    const relationshipSystem = this.gameManager?.systems?.relationshipSystem;
    const rel = relationshipSystem?.getRelationship?.(playerId, npcId);
    return typeof rel?.value === "number" ? rel.value : 50;
  }

  _clampStat(value, min = 0, max = 100) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return min;
    return Math.max(min, Math.min(max, numeric));
  }

  _ensureConversationStyles() {
    if (this._stylesInjected || typeof document === "undefined") return;
    const style = document.createElement("style");
    style.dataset.conversationStyles = "true";
    style.textContent = `
      @keyframes parchmentFadeIn { from { opacity: 0; transform: translateY(8px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
      #conversation-overlay .rect-button { padding: 8px 10px; }
      .convo-line { margin-bottom: 12px; display: flex; gap: 12px; align-items: flex-start; }
      .convo-line:last-child { margin-bottom: 0; }
      .convo-speaker { font-weight: 700; letter-spacing: 0.6px; opacity: 1; min-width: 92px; text-shadow: 0 1px 1px rgba(0, 0, 0, 0.35); }
      .convo-npc .convo-speaker { color: #ffd28a; }
      .convo-player .convo-speaker { color: #7dd7ff; font-weight: 800; }
      .convo-text { line-height: 1.45; flex: 1; }
      .convo-player .convo-text { color: #f3fbff; font-weight: 600; }
      .convo-name { font-weight: 700; color: #2b190a; }
      .convo-narration { opacity: 0.75; color: #e0e0e0; font-style: italic; }
      .convo-narration .convo-speaker { color: #c7c7c7; text-transform: uppercase; }
      .convo-narration .convo-text { font-size: 0.92em; color: #d4d4d4; }
      #conversation-overlay .conversation-parchment {
        display: flex;
        flex-direction: column;
        width: min(92%, 380px);
        max-width: 420px;
        max-height: calc(100vh - 190px);
        min-height: 0;
        box-sizing: border-box;
        padding-bottom: calc(16px + env(safe-area-inset-bottom, 0px));
      }
      /* Nested flex scroll requires min-height:0 on children or mobile Safari can lock scrolling. */
      #conversation-overlay .conversation-transcript-region,
      #conversation-overlay .convo-transcript {
        flex: 1 1 auto;
        min-height: 140px;
        overflow-y: auto;
        padding-right: 4px;
        padding-bottom: 8px;
        scrollbar-gutter: stable;
        -webkit-overflow-scrolling: touch;
      }
      #conversation-overlay .conversation-options-region,
      #conversation-overlay .convo-options {
        flex: 0 0 auto;
        min-height: 0;
        max-height: 32vh;
        overflow-y: auto;
        margin-top: 10px;
        padding-right: 4px;
        scrollbar-gutter: stable;
        -webkit-overflow-scrolling: touch;
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      #conversation-overlay .conversation-nav-row,
      #conversation-overlay .convo-footer {
        flex: 0 0 auto;
        display: flex;
        gap: 10px;
        justify-content: space-between;
        margin-top: 10px;
        padding-bottom: env(safe-area-inset-bottom, 0px);
      }
      #conversation-overlay .conversation-nav-row button,
      #conversation-overlay .convo-footer button {
        flex: 1 1 0;
        min-width: 0;
        font-size: 0.8rem;
        line-height: 1.15;
        padding: 4px 8px;
      }
      @media (max-width: 600px) {
        #conversation-overlay .conversation-parchment {
          width: min(94%, 380px);
          max-width: 400px;
          max-height: calc(100vh - 180px);
          padding: 18px 16px 16px;
        }
        #conversation-overlay .rect-button { font-size: 0.95rem; }
        #conversation-overlay .conversation-nav-row button,
        #conversation-overlay .convo-footer button {
          font-size: 0.76rem;
          padding: 4px 7px;
        }
      }
    `;
    document.head.appendChild(style);
    this._stylesInjected = true;
  }

  _scrambleModel() {
    const strategy = this.gameManager.systems.strategyPhaseSystem;
    return this.gameManager.gamePhase === GamePhase.POST_CHALLENGE &&
      strategy?.isActive &&
      !strategy.playerTribeSafe
      ? strategy.reasoning
      : null;
  }
  _scrambleRandom(key) {
    const model = this._scrambleModel();
    return model && this.gameManager.systems.campActivitySystem.conversation
      ? model.choice(`roll:${key}`, (random) => ({ value: random() })).value
      : Math.random();
  }

  _fmtNpcLine(npc, text) {
    if (!text) return "";
    const name = npc?.firstName || "NPC";
    if (this.gameManager.gamePhase === GamePhase.POST_CHALLENGE)
      text = formatScrambleSpeech(text);
    return `<div class="convo-line convo-npc"><div class="convo-speaker">${name}</div><div class="convo-text">"${text}"</div></div>`;
  }

  _fmtPlayerLine(player, text) {
    if (!text) return "";
    return `<div class="convo-line convo-player"><div class="convo-speaker">YOU</div><div class="convo-text">"${text}"</div></div>`;
  }

  _fmtNarration(text) {
    if (!text) return "";
    return `<div class="convo-line convo-narration"><div class="convo-speaker">NARRATION</div><div class="convo-text"><em>${text}</em></div></div>`;
  }

  _formatMenuBody(text) {
    const transcript = this._wrapTranscriptHtml(
      this._renderTranscriptHtml(this._getActiveTranscriptSession()),
    );
    if (!text) return transcript;
    const raw = String(text);
    if (raw.includes("data-conversation-transcript")) return raw;
    if (raw.includes("convo-line")) {
      return `${transcript}${raw}`;
    }
    return `${transcript}${this._fmtNarration(raw)}`;
  }

  _renderMenu(
    npc,
    text,
    options,
    { onBack = null, showEnd = true, autoScrollMode = "ifNearBottom" } = {},
  ) {
    this._ensureConversationStyles();
    const body = this._formatMenuBody(text || "");
    const mainButtons = [...options];
    const navButtons = [];
    if (onBack)
      navButtons.push({
        label: "Back",
        alt: true,
        onClick: onBack,
        navButton: true,
      });
    if (showEnd)
      navButtons.push({
        label: "End chat",
        alt: true,
        onClick: () => this.closeConversation("player_end"),
        navButton: true,
      });
    this._renderParchmentLayout({
      npc,
      transcriptHtml: body,
      optionButtons: mainButtons,
      navButtons,
      autoScrollMode,
      optionsScrollable: true,
    });
    const session = this._getActiveTranscriptSession();
    if (session) session._justLoggedYou = false;
    if (
      this.gameManager.gamePhase === GamePhase.POST_CHALLENGE &&
      this.activeOverlay &&
      !this.activeOverlay.contains(document.activeElement)
    )
      this.activeOverlay
        .querySelector("button:not(:disabled)")
        ?.focus({ preventScroll: true });
  }

  _initTranscript(session) {
    if (!session) return null;
    if (!Array.isArray(session.transcript)) session.transcript = [];
    session.transcript = session.transcript
      .map((entry) => this._coerceTranscriptEntry(entry))
      .filter(Boolean);
    this._ensureTranscriptHelpers(session);
    return session.transcript;
  }

  _buildTranscriptBody({ session = null, narration = null } = {}) {
    const transcript = this._wrapTranscriptHtml(
      this._renderTranscriptHtml(session),
    );
    const narrationLine = narration ? this._fmtNarration(narration) : "";
    return `${transcript}${narrationLine}`;
  }

  _ensureTranscriptHelpers(session) {
    if (!session || session.addYou || session.addNpc || session.addNarration)
      return;
    session.addYou = (text) => {
      session._justLoggedYou = true;
      this._addTranscriptEntry(session, { speaker: "YOU", text });
    };
    session.addNpc = (text) => {
      const npc = session.npcId ? this._getSurvivorById(session.npcId) : null;
      this._addTranscriptEntry(session, {
        speaker: "NPC",
        text,
        name: npc?.firstName || "NPC",
      });
      session._justLoggedYou = false;
    };
    session.addNarration = (text) =>
      this._addTranscriptEntry(session, { speaker: "NARRATION", text });
  }

  _addTranscriptEntry(session, entry) {
    if (!session || !entry?.text) return;
    this._initTranscript(session);
    session.transcript.push({
      speaker: entry.speaker || "NARRATION",
      text: String(entry.text),
      name: entry.name || null,
      isHtml: entry.isHtml || false,
    });
    this._refreshTranscriptUI(session, { autoScrollMode: "ifNearBottom" });
  }

  _coerceTranscriptEntry(entry) {
    if (!entry) return null;
    if (typeof entry === "string") {
      return { speaker: "NARRATION", text: entry, isHtml: true };
    }
    if (entry?.speaker && entry?.text) return entry;
    return null;
  }

  _renderTranscriptHtml(session) {
    const entries = Array.isArray(session?.transcript)
      ? session.transcript
      : [];
    return entries
      .map((entry) => this._formatTranscriptEntry(entry, session))
      .join("");
  }

  _formatTranscriptEntry(entry, session) {
    if (!entry) return "";
    if (typeof entry === "string") return entry;
    if (entry.isHtml) return entry.text;
    const speaker = entry.speaker || "NARRATION";
    if (speaker === "YOU") {
      return this._fmtPlayerLine(
        this.gameManager?.getPlayerSurvivor?.(),
        entry.text,
      );
    }
    if (speaker === "NPC") {
      const npcName =
        entry.name ||
        this._getSurvivorById(session?.npcId || null)?.firstName ||
        "NPC";
      return this._fmtNpcLine({ firstName: npcName }, entry.text);
    }
    return this._fmtNarration(entry.text);
  }

  _wrapTranscriptHtml(transcriptHtml = "") {
    return `<div class="conversation-transcript" data-conversation-transcript="true">${transcriptHtml || ""}</div>`;
  }

  _isNearBottom(el, thresholdPx = 40) {
    if (!el) return true;
    const remaining = el.scrollHeight - el.scrollTop - el.clientHeight;
    return remaining <= thresholdPx;
  }

  _scrollToBottom(el) {
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }

  _getTranscriptScrollElement() {
    const overlay = this.activeOverlay;
    if (!overlay) return null;
    return overlay.querySelector?.(".conversation-transcript-region") || null;
  }

  _refreshTranscriptUI(session, { autoScrollMode = "ifNearBottom" } = {}) {
    const overlay = this.activeOverlay;
    const transcriptEl = overlay?.querySelector?.(
      "[data-conversation-transcript]",
    );
    if (!transcriptEl) return;
    const scrollEl = this._getTranscriptScrollElement();
    const wasNearBottom = this._isNearBottom(scrollEl);
    const previousScrollTop = scrollEl?.scrollTop ?? 0;
    transcriptEl.innerHTML = this._renderTranscriptHtml(session);
    this._maybeAutoScrollTranscript({
      mode: autoScrollMode,
      wasNearBottom,
      previousScrollTop,
    });
  }

  _maybeAutoScrollTranscript({
    mode = "none",
    wasNearBottom = null,
    previousScrollTop = null,
  } = {}) {
    const scrollEl = this._getTranscriptScrollElement();
    if (!scrollEl) return;
    if (mode === "forceBottom") {
      this._scrollToBottom(scrollEl);
      return;
    }
    if (mode === "ifNearBottom") {
      if (typeof wasNearBottom === "boolean") {
        if (wasNearBottom) {
          this._scrollToBottom(scrollEl);
          return;
        }
      } else if (this._isNearBottom(scrollEl)) {
        this._scrollToBottom(scrollEl);
        return;
      }
    }
    if (Number.isFinite(previousScrollTop)) {
      scrollEl.scrollTop = previousScrollTop;
    }
  }

  _buildChoiceButton({ npc = null, entry = {}, fallback = {} } = {}) {
    const {
      label,
      alt = false,
      onClick,
      disabled = false,
      tooltip = "",
      navButton = false,
    } = entry;
    const btn = this._createChoiceButton({
      label,
      alt,
      onClick,
      fallback: { npc, ...fallback },
    });
    if (disabled) {
      btn.disabled = true;
      btn.style.opacity = "0.55";
      btn.style.cursor = "not-allowed";
    }
    if (tooltip) {
      btn.title = tooltip;
    }
    if (navButton) {
      btn.dataset.nav = "true";
    }
    return btn;
  }

  _renderParchmentLayout({
    npc,
    transcriptHtml = "",
    optionButtons = [],
    navButtons = [],
    autoScrollMode = "ifNearBottom",
    optionsScrollable = true,
  } = {}) {
    this._ensureConversationStyles();
    const previousTranscriptScrollEl = this._getTranscriptScrollElement();
    const transcriptWasNearBottom = this._isNearBottom(
      previousTranscriptScrollEl,
    );
    const previousTranscriptScrollTop =
      previousTranscriptScrollEl?.scrollTop ?? 0;

    const overlay = this._buildOverlayShell(npc, { reuse: true });
    const content = this._getConversationContent(overlay);
    this._clearConversationContent(content);

    const parchment = this._buildParchment();
    const { transcriptDiv, transcriptContent, optionsDiv, navRowDiv } =
      parchment._conversationRegions || {};
    if (!transcriptDiv || !transcriptContent || !optionsDiv || !navRowDiv)
      return null;
    transcriptContent.innerHTML = transcriptHtml || "";
    if (!transcriptContent.querySelector?.("[data-conversation-transcript]")) {
      transcriptContent.innerHTML = this._wrapTranscriptHtml(
        transcriptContent.innerHTML || "",
      );
    }

    (Array.isArray(optionButtons) ? optionButtons : []).forEach((entry) => {
      optionsDiv.appendChild(this._buildChoiceButton({ npc, entry }));
    });

    (Array.isArray(navButtons) ? navButtons : []).forEach((entry) => {
      navRowDiv.appendChild(
        this._buildChoiceButton({ npc, entry: { ...entry, navButton: true } }),
      );
    });

    content.appendChild(parchment);
    if (
      [GamePhase.PRE_CHALLENGE, GamePhase.POST_CHALLENGE].includes(
        this.gameManager.gamePhase,
      )
    )
      this._renderScrambleParticipants(overlay, npc);

    if (!optionsScrollable) {
      optionsDiv.style.overflowY = "visible";
      optionsDiv.style.maxHeight = "none";
    }

    this._maybeAutoScrollTranscript({
      mode: autoScrollMode,
      wasNearBottom: transcriptWasNearBottom,
      previousScrollTop: previousTranscriptScrollTop,
    });

    return {
      overlay,
      content,
      parchment,
      transcriptDiv,
      transcriptContent,
      optionsDiv,
      navRowDiv,
    };
  }

  _getActiveTranscriptSession(preferred = null) {
    return preferred || this.nodeSession || this.conversationSession || null;
  }

  _runConversationNode({ npc, player, node, context = {} }) {
    if (node.semanticResolve && this._scrambleModel()) {
      const r = resolveScrambleNode(this._scrambleModel(), node, npc.id);
      if (!r) return;
      this._initTranscript(this.nodeSession);
      if (!r.replay) {
        this.nodeSession?.addYou?.(node.playerLine || node.buttonText);
        this.nodeSession?.addNpc?.(r.line);
      }
      eventManager.publish("camp:readUpdated");
      return this.view.show(npc, context);
    }
    const def = ACTION_DEFINITIONS[node.type || node.id];
    if (def) return this.view.choose(npc, context, def, {});
  }

  /**
   * Allow other systems (e.g., SocialEngine) to start a conversation using
   * the shared conversation UI and memory/relationship hooks.
   * @param {Object} survivor - The NPC initiating the talk
   * @param {string} type - High-level conversation type from SocialEngine
   * @param {Object} options - Additional optional data
   */
  startNpcConversation(survivor, type, options = {}) {
    if (
      !survivor ||
      !this._isInCamp() ||
      this.gameManager.flags?.campEventActive
    )
      return;
    if (
      (!options.initiatedByNpc || options.context?.approachAccepted || options.approachAccepted) &&
      this.gameManager.gamePhase === GamePhase.POST_CHALLENGE &&
      !isCampPhysicallyPresent(
        survivor,
        this.gameManager.systems.npcLocationSystem,
        this.gameManager.player?.location,
        this.gameManager,
      )
    )
      return;
    if (options.initiatedByNpc && !options.context?.approachAccepted && !options.approachAccepted) {
      const initiative=this.engine.initiative;
      const existing=initiative.active(survivor.id);
      const incident=type==='confrontation'?this.engine.events(survivor.id).find(k=>
        k.subjectId===this.gameManager.player.id||k.speakerId===this.gameManager.player.id):null;
      if (!existing) initiative.create(survivor,this.gameManager.player.id, {
        type: incident ? 'confront' : type === 'confrontation' ? 'loyalty' : 'check_in',
        key:`external:${type}:${this.gameManager.player.id}`,reason:type,
        agenda:options.context?.agenda,fields:incident?{eventId:incident.id,subjectId:this.gameManager.player.id}:{},private:type==='confrontation',
      });
      const camp=this.gameManager.systems.campActivitySystem;
      if(survivor.campActivity?.interruptible!==false) { camp.interrupt(survivor,'social initiative');camp.chooseNext(survivor,this.gameManager.dayTimer); }
      return;
    }
    this.startConversation({
      npcId: survivor.id,
      phase: options.context?.phase || this._getConversationPhase(),
      socialType: type,
      context: {
        ...(options.context || {}),
        initiatedByNpc: options.initiatedByNpc,
        approachAccepted: options.approachAccepted || options.context?.approachAccepted,
        location:
          options.location ||
          (typeof window !== "undefined"
            ? window?.campScreen?.currentView
            : null),
      },
    });
  }

  /**
   * Entry point for all conversation flows.
   */
  startConversation({ npcId, phase, socialType = null, context = {} }) {
    if (!npcId || !this._isInCamp() || this.gameManager.flags?.campEventActive)
      return;
    const survivor = this._getSurvivorById(npcId);
    if (!survivor) return;
    if (
      survivor.campActivity?.type === "approach_wait" &&
      !context.initiatedByNpc
    )
      this.gameManager.systems.strategyPhaseSystem?.scramble?.clearInvitation();
    const reservation =
      this.gameManager.systems?.campActivitySystem?.conversation;
    if (reservation && String(reservation.npcId) !== String(survivor.id))
      return;
    if (
      survivor.campActivity?.interruptible === false &&
      !reservation &&
      survivor.campActivity.type !== "approach_wait" &&
      !context.scripted
    )
      return;

    const normalizedPhase = this._normalizePhase(phase);
    const location =
      context.location ||
      (typeof window !== "undefined" ? window?.campScreen?.currentView : null);
    const initiator = context.initiatedByNpc
      ? "npc"
      : context.initiator || "player";
    if (initiator === "player" && !context.initiatedByNpc) {
      this.startPlayerConversation({
        npcId,
        phase: normalizedPhase,
        socialType,
        context: { ...context, initiator },
      });
      return;
    }
    const seededContext = { ...context };
    this._resetConvoContext();

    this.state = {
      npcId: survivor.id,
      phase: normalizedPhase,
      topic: null,
      lastIntent: null,
      lastSubjectId: null,
      lastNpcStance: null,
      history: [],
      initiator,
      context: { ...seededContext, initiator },
    };

    const beginConversation = () => {
      if (survivor.campActivity?.type === "approach_wait") {
        seededContext.agenda ||= survivor.campActivity.agenda;
        this.gameManager.systems.strategyPhaseSystem?.scramble?.clearInvitation();
      }
      if (
        this.gameManager.systems?.campActivitySystem?.active &&
        (!isCampPhysicallyPresent(
          survivor,
          this.gameManager.systems.npcLocationSystem,
          location,
          this.gameManager,
        ) ||
          !isCampPhysicallyPresent(
            this.gameManager.getPlayerSurvivor?.(),
            this.gameManager.systems.npcLocationSystem,
            location,
            this.gameManager,
          ))
      )
        return;
      this._logConversationStart({
        initiator,
        phase: normalizedPhase,
        survivor,
        location,
      });
      this._validateConversationTreeOnStart({
        player: this.gameManager.getPlayerSurvivor?.(),
        npc: survivor,
        context: {
          ...(seededContext || {}),
          initiator,
          phase: normalizedPhase,
          location,
        },
      });
      this._startNpcInitiatedConversation({
        player: this.gameManager.getPlayerSurvivor?.(),
        npc: survivor,
        context: {
          ...(seededContext || {}),
          initiator,
          phase: normalizedPhase,
          location,
        },
      });
    };

    if (seededContext.initiatedByNpc && !seededContext.approachAccepted) {
      this._showNpcApproachOverlay(survivor, location, beginConversation);
    } else {
      beginConversation();
    }
  }

  /**
   * Entry point for player-initiated conversations.
   */
  startAllianceConversation(npcId, allianceId = null, extra = {}) {
    const gm = this.gameManager,
      npc = this._getSurvivorById(npcId),
      player = gm.getPlayerSurvivor?.();
    if (
      !npc ||
      !player ||
      !gm.systems.allianceSystem?.together(player.id, npc.id)
    )
      return false;
    const camp = gm.systems.campActivitySystem;
    if (
      !camp.conversation &&
      !camp.beginConversation(npc, {
        strategy: true,
        location: player.location,
      })
    )
      return false;
    if (String(camp.conversation.npcId) !== String(npcId)) return false;
    camp.reserveConversationGroup(
      (extra.groupParticipantIds || []).filter(
        (id) => String(id) !== String(npcId),
      ),
    );
    const context = {
      ...extra,
      allianceId,
      location: player.location,
      phase: this._normalizePhase(gm.gamePhase),
    };
    this.activeConversationContext = context;
    this.nodeSession = { npcId, context, menuStack: [], transcript: [] };
    this._initTranscript(this.nodeSession);
    return this._renderAllianceConversation({ player, npc, context });
  }
  _renderAllianceConversation({ player, npc, context = {} }) {
    const gm = this.gameManager,
      camp = gm.systems.campActivitySystem,
      reservation = camp.conversation;
    if (!reservation || !gm.systems.allianceSystem?.together(player.id, npc.id))
      return false;
    const model = gm.systems.strategyPhaseSystem.reasoning,
      cp = model.checkpoint(reservation);
    cp.allianceId ||= context.allianceId;
    cp.allianceProposalId ||= context.allianceProposalId;
    cp.allianceRecruitmentId ||= context.allianceRecruitmentId;
    const session = this._getActiveTranscriptSession();
    this._initTranscript(session);
    if (!session.transcript.length && cp.allianceTranscript)
      session.transcript = JSON.parse(JSON.stringify(cp.allianceTranscript));
    if (!cp.allianceOpened) {
      for (const line of allianceOpening({ gm, player, npc, context, cp }))
        session.transcript.push(line);
      cp.allianceOpened = true;
    }
    const render = () =>
      this._renderAllianceConversation({ player, npc, context });
    const buttons = allianceChoices({ gm, player, npc, context, cp }).map(
      (node) => ({
        label: node.label,
        onClick: () => {
          const result = model.choice(`alliance:${node.id}`, (random) =>
            node.resolve(random),
          );
          if (!result.replay) {
            session?.addYou?.(node.label);
            for (const line of result.lines || [])
              session.transcript.push(line);
          }
          eventManager.publish("camp:readUpdated");
          render();
        },
      }),
    );
    buttons.push({
      label: "Talk about something else",
      onClick: () =>
        this._renderMainMenu({
          player,
          npc,
          context: { ...context, scrambleMore: true },
          mainTopics: this._buildMainTopics({ player, npc, context }),
        }),
    });
    cp.allianceTranscript = JSON.parse(JSON.stringify(session.transcript));
    this._renderMenu(npc, this._buildTranscriptBody({ session }), buttons, {
      showEnd: true,
    });
    if (typeof document !== "undefined")
      document
        .getElementById("conversation-overlay")
        ?.setAttribute("data-alliance-dialog", "true");
    return true;
  }
  _renderScrambleParticipants(overlay, npc) {
    const reservation =
      this.gameManager.systems.campActivitySystem?.conversation;
    const ids = [npc.id, ...(reservation?.groupIds || [])];
    const participants = ids
      .filter((id, i) => ids.findIndex((x) => String(x) === String(id)) === i)
      .map((id) => this._getSurvivorById(id))
      .filter(Boolean);
    const center = overlay.querySelector(".conversation-center");
    if (!center) return;
    [...center.children]
      .find(
        (e) =>
          !e.classList.contains("conversation-content") &&
          !e.classList.contains("scramble-speakers"),
      )
      ?.classList.add("scramble-primary-avatar");
    let header = center.querySelector(".scramble-speakers");
    if (!header) {
      header = document.createElement("header");
      header.className = "scramble-speakers";
      center.prepend(header);
    }
    header.replaceChildren();
    const title = document.createElement("p");
    title.className = "scramble-dialog-title";
    title.textContent =
      participants.length > 1
        ? "Talking quietly together"
        : this.gameManager.gamePhase === GamePhase.POST_CHALLENGE
          ? "A word before Tribal"
          : "A word at camp";
    header.appendChild(title);
    const rail = document.createElement("div");
    rail.className = "scramble-participants";
    const last = [...(this._getActiveTranscriptSession()?.transcript || [])]
      .reverse()
      .find((e) => e.speaker === "NPC");
    for (const p of participants) {
      const person = document.createElement("span");
      person.className = `scramble-participant${last?.name === p.firstName ? " speaking" : ""}`;
      const img = document.createElement("img");
      img.src = p.avatarUrl || "";
      img.alt = "";
      person.appendChild(img);
      const label = document.createElement("span");
      label.textContent = p.firstName;
      person.title = p.firstName;
      person.setAttribute("aria-label", p.firstName);
      person.appendChild(label);
      rail.appendChild(person);
    }
    header.appendChild(rail);
    center.style.setProperty(
      "--scramble-speaker-height",
      `${header.getBoundingClientRect().height}px`,
    );
    overlay.setAttribute(
      "aria-label",
      `Conversation with ${participants.map((p) => p.firstName).join(", ")}`,
    );
  }
  startPlayerConversation({ npcId, phase, socialType = null, context = {} }) {
    if (!npcId || !this._isInCamp() || this.gameManager.flags?.campEventActive)
      return;
    const survivor = this._getSurvivorById(npcId);
    if (!survivor) return;
    if (survivor.campActivity?.type === "approach_wait")
      this.gameManager.systems.strategyPhaseSystem?.scramble?.clearInvitation();
    const reservation =
      this.gameManager.systems?.campActivitySystem?.conversation;
    if (reservation && String(reservation.npcId) !== String(survivor.id))
      return;
    if (
      survivor.campActivity?.interruptible === false &&
      !reservation &&
      survivor.campActivity.type !== "approach_wait" &&
      !context.scripted
    )
      return;

    const normalizedPhase = this._normalizePhase(phase);
    const requested =
      context.location ||
      (typeof window !== "undefined" ? window?.campScreen?.currentView : null);
    const location = physicalCampLocation(requested) || requested;
    const locations = this.gameManager.systems?.npcLocationSystem;
    if (
      location &&
      locations?.phaseAssigned &&
      locations.getLocation(npcId) &&
      !isCampPhysicallyPresent(
        survivor,
        locations,
        location,
        this.gameManager,
      ) &&
      !context.scripted &&
      !context.forceMeeting
    )
      return;
    if (
      this.gameManager.systems?.campActivitySystem?.active &&
      (!isCampPhysicallyPresent(
        survivor,
        locations,
        location,
        this.gameManager,
      ) ||
        !isCampPhysicallyPresent(
          this.gameManager.getPlayerSurvivor?.(),
          locations,
          location,
          this.gameManager,
        ))
    )
      return;
    const seededContext = {
      ...context,
      initiator: "player",
      initiatedByNpc: false,
      phase: normalizedPhase,
      location,
      resetTranscript: true,
      forceNodeFlow: true,
    };

    this.state = {
      npcId: survivor.id,
      phase: normalizedPhase,
      topic: null,
      lastIntent: null,
      lastSubjectId: null,
      lastNpcStance: null,
      history: [],
      initiator: "player",
      context: { ...seededContext, initiator: "player" },
    };

    this._validateConversationTreeOnStart({
      player: this.gameManager.getPlayerSurvivor?.(),
      npc: survivor,
      context: {
        ...(seededContext || {}),
        initiator: "player",
        phase: normalizedPhase,
        location,
      },
    });

    this._startConversation(survivor, {
      isPurpose: true,
      meeting: null,
      location,
      context: {
        ...(seededContext || {}),
        initiator: "player",
        phase: normalizedPhase,
      },
    });
  }

  reset() {
    this._clearOverlay();
    this.engine.deserialize();
    this._clearPendingMeetings(true);
    if (this.midPhaseTimerId) {
      timerManager.clearTimeout(this.midPhaseTimerId);
      this.midPhaseTimerId = null;
    }
  }

  serialize() {
    return JSON.parse(
      JSON.stringify({
        semantic: this.engine.serialize(),
        moods: Array.from(this.moods.entries()),
        memoryLog: this._memoryLog,
        npcMemory: this.npcMemory,
        debugStructuredConvo: this.debugStructuredConvo,
        debugConvo: this.debugConvo,
        lastCampInvitationKey: this._lastCampInvitationKey || null,
        lastCampIntroKey: this._lastCampIntroKey || null,
      }),
    );
  }

  deserialize(payload) {
    this.reset();
    this.engine.deserialize(payload?.semantic);
    if (!payload || typeof payload !== "object") {
      this._lastCampInvitationKey = null;
      this._lastCampIntroKey = null;
      this.moods = new Map();
      this._memoryLog = [];
      this.npcMemory = {};
      return;
    }

    this.moods = new Map(Array.isArray(payload.moods) ? payload.moods : []);
    this._lastCampInvitationKey = payload.lastCampInvitationKey || null;
    this._lastCampIntroKey = payload.lastCampIntroKey || null;
    this._memoryLog = Array.isArray(payload.memoryLog) ? payload.memoryLog : [];
    this.npcMemory =
      payload.npcMemory && typeof payload.npcMemory === "object"
        ? payload.npcMemory
        : {};
    this.debugStructuredConvo = Boolean(payload.debugStructuredConvo);
    this.debugConvo = Boolean(payload.debugConvo);
  }

  _handleNpcConfrontation({ survivor, location }) {
    if (survivor)
      this.startNpcConversation(survivor, "confrontation", {
        initiatedByNpc: true,
        location,
      });
  }

  _handlePhaseChange({ phase }) {
    if (!this._isInCamp()) {
      this._clearPendingMeetings(false);
      return;
    }

    if (this.gameManager.flags?.campEventActive) {
      this._clearPendingMeetings(false);
      return;
    }

    if (
      phase === GamePhase.PRE_CHALLENGE ||
      phase === GamePhase.POST_CHALLENGE
    ) {
      if (phase === GamePhase.POST_CHALLENGE)
        rememberConversationChallenge(
          this.engine,
          this.gameManager.lastChallengeResult,
        );
      this._clearPendingMeetings(false);
      this._queuePhaseInvitations(phase);
    } else {
      this._clearPendingMeetings(true);
    }
  }

  _handleCampViewLoaded() {
    // Screen navigation reveals nearby encounters; it never generates or
    // starts an NPC invitation. The camp coordinator owns selected intentions.
    if(this._isInCamp())eventManager.publish('camp:readUpdated');
  }

  _pauseForCampEvent() {
    this._clearOverlay();
    this._clearPendingMeetings(false);
    if (this.midPhaseTimerId) {
      timerManager.clearTimeout(this.midPhaseTimerId);
      this.midPhaseTimerId = null;
    }
  }

  _resumeAfterCampEvent() {
    if (!this._isInCamp()) return;
    this._clearApproachTimer();
    this._clearPendingMeetings(false);
    this._queuePhaseInvitations(this.gameManager.gamePhase);
  }

  _queuePhaseInvitations() {
    // Screen navigation is not a social motivation. Semantic camp decisions own initiation.
    this.gameManager.systems.campActivitySystem?.ensureStarted?.();
  }

  _scheduleMeetingInvitation() { this._queuePhaseInvitations(); }

  _pickConversationNpc() {
    const tribe = this.gameManager.getPlayerTribe?.() || null;
    const survivors = tribe?.members || this.gameManager.survivors || [];
    const absent = this.gameManager.flags?.absentFromCampIds;
    const candidates = survivors.filter(
      (s) =>
        !s.isPlayer &&
        !s.isOut &&
        !(absent instanceof Set
          ? [...absent].some((id) => String(id) === String(s.id))
          : (absent || []).some?.((id) => String(id) === String(s.id))) &&
        !(
          this.gameManager.systems?.campActivitySystem?.active &&
          s.campActivity &&
          !["idle_at_camp", "rest", "socialize", "observe"].includes(
            s.campActivity.type,
          )
        ),
    );
    if (candidates.length === 0) return null;

    const sorted = [...candidates].sort((a, b) => {
      return (
        (this._getRelationshipScore(b) || 50) -
        (this._getRelationshipScore(a) || 50)
      );
    });

    const slice = sorted.slice(0, Math.max(1, Math.ceil(sorted.length / 2)));
    return slice[getRandomInt(0, slice.length - 1)];
  }

  _showInvitationToast(npc, location, type) {
    const locationLabel = this._formatLocation(location) || location;
    const toast = createElement("div", {
      className: "conversation-invite-toast",
      style: {
        position: "fixed",
        bottom: "20px",
        right: "20px",
        zIndex: 1200,
        backgroundImage: "url('Assets/parch-landscape.png')",
        backgroundSize: "cover",
        padding: "14px 18px",
        color: "#2b190a",
        fontFamily: "Survivant, sans-serif",
        boxShadow: "0 6px 12px rgba(0,0,0,0.35)",
        borderRadius: "8px",
        maxWidth: "280px",
      },
    });

    const note =
      type === "phaseIntro"
        ? `${npc.firstName} wants to talk to you at the ${locationLabel}.`
        : `${npc.firstName} whispers: meet me at the ${locationLabel} soon.`;

    toast.textContent = note;
    document.body.appendChild(toast);

    setTimeout(() => toast.remove(), 6000);
  }

  _showTopicSelection(survivor, location) {
    return this.view.show(
      survivor,
      this.activeConversationContext || { location },
    );
  }

  getMainTopics() {
    return CONVERSATION_CATEGORIES.map(([id, label]) => ({ id, label }));
  }

  _renderMainMenu({ npc, context = {} }) {
    return this.view.show(npc, context);
  }

  _buildMainTopics({ player, npc }) {
    return this.getMainTopics().map((topic) => ({
      ...topic,
      nodes: conversationCapabilities(this.engine, player.id, [npc.id])
        .filter((d) => d.category === topic.id)
        .map((d) => ({ ...d, id: d.type, buttonText: d.label })),
    }));
  }

  decideNpcApproachPurpose({ player, npc, context = {} }) {
    const phase = context?.phase || this._getConversationPhase();
    const { trustSystem, relationshipSystem, allianceSystem, dealSystem } =
      this._getConversationSystems();
    const trustValue = trustSystem?.getTrust?.(npc?.id, player?.id);
    const relationshipValue = relationshipSystem?.getRelationship?.(
      player?.id,
      npc?.id,
    )?.value;
    let trust = Number.isFinite(trustValue)
      ? trustValue
      : this._getPairTrust?.(npc?.id, player?.id);
    if (!Number.isFinite(trust)) {
      trust = this.gameManager?.getTrust?.(npc?.id, player?.id);
    }
    const relationship = this._clampStat(
      Number.isFinite(relationshipValue)
        ? relationshipValue
        : this._getRelationshipValue(player?.id, npc?.id),
    );
    if (!Number.isFinite(trust)) {
      trust = relationship;
    }
    trust = this._clampStat(trust);
    const paranoia = npc?.paranoia ?? 0;
    const threat = npc?.threatLevel ?? npc?.threat ?? 0;
    const style = npc?.gameplayStyle || "";
    const reasons = [];

    const allianceAffinity =
      allianceSystem?.getAllianceAffinity?.(npc?.id, player?.id) || 0;
    const activeDeals =
      dealSystem?.getActiveDealsBetween?.(player?.id, npc?.id) || [];
    const hasActiveDeal = activeDeals.length > 0;

    const weights = {
      [NPC_APPROACH_PURPOSES.BUILD_CONNECTION]: 1,
      [NPC_APPROACH_PURPOSES.GOSSIP]: 1,
      [NPC_APPROACH_PURPOSES.STRATEGY]: 1,
      [NPC_APPROACH_PURPOSES.OFFER_DEAL]: 1,
      [NPC_APPROACH_PURPOSES.REASSURE_CHECKIN]: 1,
      [NPC_APPROACH_PURPOSES.PRESSURE_SOFT]: 1,
    };

    switch (style) {
      case "Competitive":
        weights[NPC_APPROACH_PURPOSES.STRATEGY] += 2;
        weights[NPC_APPROACH_PURPOSES.PRESSURE_SOFT] += 2;
        weights[NPC_APPROACH_PURPOSES.OFFER_DEAL] += 1;
        reasons.push("style:Competitive");
        break;
      case "Power Player":
        weights[NPC_APPROACH_PURPOSES.OFFER_DEAL] += 3;
        weights[NPC_APPROACH_PURPOSES.STRATEGY] += 2;
        weights[NPC_APPROACH_PURPOSES.PRESSURE_SOFT] += 1;
        reasons.push("style:Power Player");
        break;
      case "Social Genius":
        weights[NPC_APPROACH_PURPOSES.BUILD_CONNECTION] += 3;
        weights[NPC_APPROACH_PURPOSES.REASSURE_CHECKIN] += 2;
        weights[NPC_APPROACH_PURPOSES.GOSSIP] += 1;
        reasons.push("style:Social Genius");
        break;
      case "Shadow Strategist":
        weights[NPC_APPROACH_PURPOSES.GOSSIP] += 3;
        weights[NPC_APPROACH_PURPOSES.STRATEGY] += 2;
        weights[NPC_APPROACH_PURPOSES.OFFER_DEAL] += 1;
        reasons.push("style:Shadow Strategist");
        break;
      case "Wildcard": {
        const wildcardBoost = getRandomInt(0, 2);
        Object.keys(weights).forEach((key) => {
          weights[key] += wildcardBoost;
        });
        reasons.push(`style:Wildcard +${wildcardBoost}`);
        break;
      }
      case "Lethal Charmer":
        weights[NPC_APPROACH_PURPOSES.BUILD_CONNECTION] += 3;
        weights[NPC_APPROACH_PURPOSES.REASSURE_CHECKIN] += 2;
        weights[NPC_APPROACH_PURPOSES.OFFER_DEAL] += 1;
        reasons.push("style:Lethal Charmer");
        break;
      default:
        break;
    }

    if (paranoia >= 60) {
      weights[NPC_APPROACH_PURPOSES.REASSURE_CHECKIN] += 2;
      weights[NPC_APPROACH_PURPOSES.GOSSIP] += 1;
      weights[NPC_APPROACH_PURPOSES.PRESSURE_SOFT] += 1;
      reasons.push("paranoia");
    }

    if (threat >= 60) {
      weights[NPC_APPROACH_PURPOSES.STRATEGY] += 2;
      weights[NPC_APPROACH_PURPOSES.OFFER_DEAL] += 1;
      reasons.push("threat");
    }

    if (
      this._normalizePhase(phase) === "post" ||
      String(phase).toUpperCase().includes("POST")
    ) {
      weights[NPC_APPROACH_PURPOSES.STRATEGY] += 2;
      weights[NPC_APPROACH_PURPOSES.OFFER_DEAL] += 2;
      reasons.push("phase:post");
    } else {
      weights[NPC_APPROACH_PURPOSES.BUILD_CONNECTION] += 1;
      reasons.push("phase:pre");
    }

    if (allianceAffinity > 0.35) {
      weights[NPC_APPROACH_PURPOSES.OFFER_DEAL] += allianceAffinity;
      weights[NPC_APPROACH_PURPOSES.STRATEGY] += allianceAffinity;
      weights[NPC_APPROACH_PURPOSES.REASSURE_CHECKIN] += allianceAffinity;
      reasons.push("valuesAlliance");
    }

    if (hasActiveDeal) {
      weights[NPC_APPROACH_PURPOSES.STRATEGY] += 1;
      weights[NPC_APPROACH_PURPOSES.REASSURE_CHECKIN] += 1;
      reasons.push("activeDeal");
    }

    if (trust <= 40 && relationship <= 40) {
      weights[NPC_APPROACH_PURPOSES.PRESSURE_SOFT] += 3;
      reasons.push("lowTrustAndRel");
    }

    const sorted = Object.entries(weights).sort((a, b) => b[1] - a[1]);
    const topSlice = sorted.slice(0, Math.min(3, sorted.length));
    const topTotal = topSlice.reduce((sum, [, value]) => sum + value, 0);
    let roll = Math.random() * topTotal;
    let purposeId = topSlice[0][0];
    for (const [key, value] of topSlice) {
      roll -= value;
      if (roll <= 0) {
        purposeId = key;
        break;
      }
    }

    if (this.debugConvo) {
      this._debugLog("[CONVO-DEBUG] NPC approach purpose", {
        npc: npc?.firstName || npc?.id,
        purposeId,
        topWeights: topSlice,
        reasons,
      });
    }

    return {
      purposeId,
      weights,
      reason: reasons.join(",") || "baseline",
    };
  }

  _startNpcInitiatedConversation({ npc, context = {} }) {
    this.activeConversationContext = context;
    return this.view.startNpc(npc, context);
  }

  _resolveNpcIntentCounter({ npc, player, context = {}, counterTarget }) {
    if (this._scrambleModel()) {
      const node = scrambleNodes(this._scrambleModel(), {
        player,
        npc,
        context,
      }).find((n) => n.id === `counter:${counterTarget?.id}`);
      if (!node) return;
      const result = resolveScrambleNode(this._scrambleModel(), node, npc.id);
      this._getActiveTranscriptSession()?.addNpc?.(result?.line);
      this._renderMenu(
        npc,
        this._buildTranscriptBody({
          session: this._getActiveTranscriptSession(),
        }),
        [],
        { showEnd: true },
      );
      return result;
    }
    if (!counterTarget) return;
    const result = this.engine.resolve(
      this.engine.action("pitch", {
        speakerId: player.id,
        listenerIds: [npc.id],
        subjectId: counterTarget.id,
      }),
    );
    this.view.append(npc, context, result);
    return result;
  }

  _resolveNpcAllianceIntentState({ npc, player, intent, option, result }) {
    // Compatibility dialogue can consent to a pair, never consent for absent
    // third parties. Living Scramble uses the richer semantic entry point.
    const system = this.gameManager.systems.allianceSystem;
    if (
      option.key !== "accept_alliance" ||
      !system?.together(player.id, npc.id)
    )
      return;
    if (intent.alliancePlan?.mode === "recommit") {
      const shared = (system.getKnownAlliances(npc.id) || []).find((a) =>
        a.memberIds.some((id) => String(id) === String(player.id)),
      );
      if (shared) system.recommit(npc.id, shared.id);
      return;
    }
    const proposal = system.propose({
      proposerId: npc.id,
      receiverId: player.id,
      type: intent.alliancePlan?.type || "temporary",
      sincerity: intent.alliancePlan?.sincerity || "real",
    });
    const accepted =
      proposal && system.respond(proposal.id, { choice: "accept" });
    if (!accepted?.allianceId) return;
    for (const candidateId of intent.alliancePlan?.memberIds || [])
      if (![npc.id, player.id].some((id) => String(id) === String(candidateId)))
        system.proposeRecruitment({
          allianceId: accepted.allianceId,
          proposerId: npc.id,
          candidateId,
          participantIds: [npc.id, player.id],
        });
    this.gameManager.systems.socialMemorySystem?.recordAllianceInvite?.({
      day: this.gameManager.day,
      npcId: npc.id,
      playerId: player.id,
      accepted: true,
      outcome: "accepted",
      proposedBy: "npc",
    });
  }

  _logConversationStart({
    initiator,
    phase,
    survivor = null,
    location = null,
  }) {
    if (
      [GamePhase.PRE_CHALLENGE, GamePhase.POST_CHALLENGE].includes(
        this.gameManager.gamePhase,
      )
    ) {
      const npc = survivor || this._getSurvivorById?.(this.state?.npcId);
      this.gameManager.systems?.campActivitySystem?.beginConversation?.(npc, {
        location:
          location ||
          this.activeConversationContext?.location ||
          this.state?.context?.location ||
          (typeof window !== "undefined"
            ? window.campScreen?.currentView
            : null),
      });
    }
    const ids =
      this.activeConversationContext?.groupParticipantIds ||
      this.state?.context?.groupParticipantIds ||
      [];
    this.gameManager.systems.campActivitySystem?.reserveConversationGroup(ids);
    if (!this.debugConvo) return;
    console.log("[CONVO-DEBUG] NEW TREE ACTIVE", { initiator, phase });
  }

  _validateConversationTreeOnStart() {
    return this.validate();
  }

  _buildStrategyNodes({ player, npc, context = {} }) {
    if (this._scrambleModel())
      return scrambleNodes(this._scrambleModel(), { player, npc, context });
    return [
      { id: "pitch_target", buttonText: "Pitch a target", type: "pitch" },
    ];
  }

  _createDeal({ player, npc, dealType, target, status }) {
    if (["vote_together", "core_alliance", "final2"].includes(dealType))
      return this._renderAllianceConversation({
        player,
        npc,
        context: this.activeConversationContext || {},
      });
    const cp = this._scrambleModel()?.checkpoint(
        this.gameManager.systems.campActivitySystem.conversation,
      ),
      key = `created:deal:${dealType}:${target?.id || "none"}`;
    if (cp?.choices[key]) return;
    const type =
      {
        protect: DealTypes.MUTUAL_PROTECTION,
        share_info: DealTypes.SHARE_INFO,
        idol_protect: DealTypes.IDOL_PROTECTION,
      }[dealType] || DealTypes.VOTE_TOGETHER;
    const deal = this.gameManager.systems.dealSystem?.createDeal({
      id: cp ? `${cp.activityId}:${key}` : null,
      type,
      parties: [player.id, npc.id],
      terms: { targetId: target?.id || null, duration: "next_tribal" },
      note: "conversation_deal",
    });
    if (deal) {
      const D = this.gameManager.systems.dealSystem;
      (status === "accepted" ? D.acceptDeal : D.refuseDeal).call(
        D,
        deal.id,
        npc.id,
        "conversation",
      );
    }
    if (cp) cp.choices[key] = { status };
    this._getActiveTranscriptSession()?.addNpc?.(
      status === "accepted" ? "We have a deal." : "I am not agreeing.",
    );
  }

  _getTrustScore(npc, player) {
    return Math.round(this.gameManager.getTrust?.(npc?.id, player?.id) ?? 50);
  }

  _showNpcApproachOverlay(survivor, location, onAccept) {
    // Compatibility for explicit callers: never accept on elapsed wall time.
    this._renderMenu(survivor, `${survivor.firstName}: “Do you have a second?”`, [
      {label:'Talk now',onClick:onAccept},
      {label:'Give me a minute',onClick:()=>{this.engine.initiative.respond('defer');this.closeConversation('approach_deferred');}},
      {label:'Not right now',onClick:()=>this._handleApproachDeclined(survivor)},
    ],{showEnd:false,onBack:null});
  }

  _handleApproachDeclined() {
    this.engine.initiative.respond('decline');
    this._clearOverlay();
  }

  _startConversation(
    survivor,
    { isPurpose = false, meeting = null, location = null, context = {} } = {},
  ) {
    const camp = this.gameManager.systems?.campActivitySystem;
    const place =
      location ||
      context.location ||
      globalThis.window?.campScreen?.currentView;
    if (
      camp?.active &&
      (!isCampPhysicallyPresent(
        survivor,
        this.gameManager.systems.npcLocationSystem,
        place,
        this.gameManager,
      ) ||
        !isCampPhysicallyPresent(
          this.gameManager.player,
          this.gameManager.systems.npcLocationSystem,
          place,
          this.gameManager,
        ) ||
        (camp.conversation &&
          String(camp.conversation.npcId) !== String(survivor.id)) ||
        (survivor.campActivity?.interruptible === false && !camp.conversation))
    )
      return;
    const initiator = context.initiator || "player";
    const phase = context.phase || this._getConversationPhase();
    const conversationContext = this._normalizeConversationContext({
      ...context,
      initiator,
      isPurpose,
      meeting,
      location,
      phase,
    });
    const occupied = this.gameManager.systems?.campActivitySystem?.conversation;
    if (occupied)
      occupied.topics = `${occupied.topics || ""} ${context.intent || context.socialType || ""}`;
    this.activeConversationContext = conversationContext;
    if (initiator === "npc") {
      this._logConversationStart({ initiator, phase, survivor, location });
      this._startNpcInitiatedConversation({
        player: this.gameManager.getPlayerSurvivor?.(),
        npc: survivor,
        context: conversationContext,
      });
    } else {
      this._logConversationStart({ initiator, phase, survivor, location });
      this._showTopicSelection(survivor, location);
    }
  }

  _safeClick(handler) {
    return (event) => {
      if (typeof handler !== "function") return;
      try {
        handler(event);
      } catch (error) {
        console.error("Conversation action failed", error);
        if (typeof window !== "undefined")
          window.__lastConversationError = error;
        const npc = this._getSurvivorById(this.nodeSession?.npcId);
        if (npc) this.view.show(npc, this.activeConversationContext || {});
      }
    };
  }

  _normalizeConversationContext(context = {}) {
    const normalized = { ...context };
    normalized.topicPersonName =
      context.topicPersonName ||
      context.topicPerson ||
      context.targetName ||
      null;
    normalized.topicPersonId =
      context.topicPersonId || context.topicId || context.targetId || null;
    normalized.playerNamedAllyName =
      context.playerNamedAllyName || context.playerAllyName || null;
    normalized.playerNamedAllyId =
      context.playerNamedAllyId || context.playerAllyId || null;
    normalized.npcTrustedPersonName =
      context.npcTrustedPersonName || context.trustedName || null;
    normalized.npcTrustedPersonId =
      context.npcTrustedPersonId || context.trustedId || null;
    normalized.suspectedIdolName =
      context.suspectedIdolName || context.idolSuspectName || null;
    normalized.lastQuestionTag = context.lastQuestionTag || null;
    normalized.lastAnswerTag = context.lastAnswerTag || null;
    normalized.phase = context.phase || this._getConversationPhase();
    normalized.location =
      context.location ||
      (typeof window !== "undefined" ? window?.campScreen?.currentView : null);
    return normalized;
  }

  _getConversationContent(overlay) {
    if (!overlay) return null;
    let content = overlay.querySelector(".conversation-content");
    if (!content) {
      const center = overlay.querySelector(".conversation-center");
      content = createElement("div", {
        className: "conversation-content",
        style: { width: "100%" },
      });
      center?.appendChild(content);
    }
    return content;
  }

  _clearConversationContent(content) {
    if (!content) return;
    clearChildren(content);
    const existingNav = content.querySelectorAll("[data-conversation-nav]");
    existingNav.forEach((nav) => nav.remove());
  }

  _createChoiceButton({ label, alt = false, onClick, fallback = {} }) {
    const resolvedFallback = { ...fallback };
    if (!resolvedFallback.session) {
      resolvedFallback.session =
        this.nodeSession || this.conversationSession || null;
    }
    if (!resolvedFallback.npc) {
      const fallbackNpcId =
        resolvedFallback.session?.npcId ||
        this.state?.npcId ||
        this._activeOverlayNpcId ||
        null;
      resolvedFallback.npc = fallbackNpcId
        ? this._getSurvivorById(fallbackNpcId)
        : null;
    }
    const button = createElement(
      "button",
      {
        className: `rect-button full${alt ? " alt" : ""}`,
        onclick: this._safeClick(onClick, resolvedFallback),
      },
      label,
    );
    const compactLabelKey = this._choiceKey({ label });
    if (
      [
        "back",
        "continue",
        "change topic",
        "end chat",
        "end conversation",
        "close",
      ].includes(compactLabelKey)
    ) {
      button.classList.add("conversation-compact-button");
    }
    button.dataset.safeClick = "true";
    return button;
  }

  closeConversation(reason = "player_end", session = null) {
    const activeSession =
      session || this.nodeSession || this.conversationSession;
    const npcId = activeSession?.npcId || this.state?.npcId || null;
    if (this._isConversationDebugEnabled()) {
      const stack = new Error().stack;
      this._debugLog("CONVO: closeConversation called", {
        reason,
        npcId,
        stack,
      });
      this._debugBanner("CONVO close", reason);
    }
    let onEndCalled = false;
    try {
      if (activeSession?.pendingEndConversation) {
        const callback = activeSession.pendingEndConversation;
        activeSession.pendingEndConversation = null; // Clear BEFORE invoking to prevent recursive calls
        try {
          callback();
          onEndCalled = true;
        } catch (error) {
          console.error(
            "ConversationSystem: pendingEndConversation failed during closeConversation.",
            error,
          );
        }
      }
    } finally {
      this._debugLog(`CONVO END: reason=${reason} onEndCalled=${onEndCalled}`);
      try {
        this._clearOverlay({ reason });
      } catch (error) {
        console.error(
          "ConversationSystem: _clearOverlay failed during closeConversation.",
          error,
        );
      }
      if (activeSession?.meeting) {
        this.pendingMeetings = this.pendingMeetings.filter(
          (m) => m !== activeSession.meeting,
        );
      }

      if (typeof activeSession?.onClose === "function") {
        try {
          activeSession.onClose(reason, activeSession);
        } catch (error) {
          console.error(
            "ConversationSystem: onClose failed during closeConversation.",
            error,
          );
        }
      }
      if (typeof this.onConversationEnd === "function") {
        try {
          this.onConversationEnd(reason, activeSession);
        } catch (error) {
          console.error(
            "ConversationSystem: onConversationEnd failed during closeConversation.",
            error,
          );
        }
      }

      if (
        [GamePhase.PRE_CHALLENGE, GamePhase.POST_CHALLENGE].includes(
          this.gameManager.gamePhase,
        )
      ) {
        const topics = [
          activeSession?.intent,
          activeSession?.topic,
          this.state?.topic,
          this.state?.lastIntent,
          this.activeConversationContext?.intent,
        ]
          .filter(Boolean)
          .join(" ");
        this.gameManager.systems?.campActivitySystem?.finishConversation?.({
          turns: Math.min(
            8,
            activeSession?.turnIndex ||
              activeSession?.history?.length ||
              this.state?.history?.length ||
              0,
          ),
          topics,
          strategy:
            /strateg|vote|alliance|target|warning|idol|deal|gossip|rumor|name/i.test(
              topics,
            ),
        });
      }
      this.activeConversation = null;
      this._resetConvoContext();
      this.activeConversationContext = null;
      this.nodeSession = null;
      this.conversationSession = null;
      this.state = null;

      if (typeof console !== "undefined") {
        console.debug("ConversationSystem: closeConversation completed.", {
          reason,
          npcId,
        });
      }
    }
  }

  endConversation(session = null) {
    this.closeConversation("endConversation", session);
  }

  _getTrustScore(npc, player) {
    return Math.round(this.gameManager.getTrust?.(npc?.id, player?.id) ?? 50);
  }

  _buildOverlayShell(survivor, { reuse = false } = {}) {
    if (
      reuse &&
      this.activeOverlay &&
      document.body.contains(this.activeOverlay) &&
      (this._activeOverlayNpcId === survivor?.id || !survivor?.id)
    ) {
      return this.activeOverlay;
    }
    // Rebuilding the UI must retain an active encounter/group context.
    this._clearOverlay({ preserveSession: reuse });
    this._injectConversationStyles();

    const overlay = createElement("div", {
      id: "conversation-overlay",
      style: {
        position: "fixed",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        background: "rgba(0,0,0,0.65)",
        zIndex: 1100,
        display: "flex",
        justifyContent: "center",
        alignItems: "flex-start",
        paddingTop: "10px",
        overflow: "hidden",
      },
    });

    const center = createElement("div", {
      className: "conversation-center",
      style: {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "12px",
        width: "min(720px, 94%)",
        maxWidth: "720px",
        margin: "0 auto",
        padding: "6px 10px",
        boxSizing: "border-box",
      },
    });

    const avatarWrapper = createElement("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
      },
    });

    const tribeColor =
      survivor.tribeColor || survivor.tribe?.tribeColor || "#f8e7c0";
    const avatar = createElement("div", {
      style: {
        width: "min(120px, 28vw)",
        height: "min(120px, 28vw)",
        minWidth: "90px",
        minHeight: "90px",
        borderRadius: "50%",
        overflow: "hidden",
        border: `4px solid ${tribeColor}`,
        boxShadow: "0 4px 10px rgba(0,0,0,0.35)",
        background: "#000",
      },
    });

    const img = createElement("img", {
      src: survivor.avatarUrl,
      alt: survivor.firstName,
      style: {
        width: "100%",
        height: "100%",
        objectFit: "cover",
      },
    });

    avatar.appendChild(img);

    const name = createElement(
      "div",
      {
        style: {
          marginTop: "6px",
          color: "#f5d7a0",
          fontFamily: "Survivant, sans-serif",
          fontSize: "1.1rem",
          textShadow: "0 2px 4px rgba(0,0,0,0.6)",
        },
      },
      survivor.firstName,
    );

    avatarWrapper.appendChild(avatar);
    avatarWrapper.appendChild(name);

    center.appendChild(avatarWrapper);
    const content = createElement("div", {
      className: "conversation-content",
      style: { width: "100%" },
    });
    center.appendChild(content);
    overlay.appendChild(center);
    document.body.appendChild(overlay);
    if (
      [GamePhase.PRE_CHALLENGE, GamePhase.POST_CHALLENGE].includes(
        this.gameManager.gamePhase,
      )
    ) {
      overlay.classList.add("scramble-dialog");
      overlay.setAttribute("role", "dialog");
      overlay.setAttribute("aria-modal", "true");
      overlay.setAttribute(
        "aria-label",
        `Conversation with ${survivor.firstName}`,
      );
      this._scrambleReturnFocus ||= document.activeElement;
      overlay.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          this.gameManager.systems.strategyPhaseSystem?.scramble?.clearInvitation();
          this.closeConversation("escape");
        }
        if (event.key === "Tab") {
          const buttons = [
            ...overlay.querySelectorAll("button:not(:disabled)"),
          ];
          const first = buttons[0],
            last = buttons.at(-1);
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
          }
        }
      });
      queueMicrotask(() =>
        overlay
          .querySelector("button:not(:disabled)")
          ?.focus({ preventScroll: true }),
      );
    }

    this.activeOverlay = overlay;
    this._activeOverlayNpcId = survivor?.id || null;
    return overlay;
  }

  _buildParchment(text = "") {
    this._ensureConversationStyles();
    const parchment = createElement("div", {
      className: "conversation-parchment",
      style: {
        backgroundImage: "url('Assets/parch-portrait.png')",
        backgroundSize: "cover",
        backgroundRepeat: "no-repeat",
        padding: "22px 20px 18px",
        margin: "0 auto",
        boxShadow: "0 10px 20px rgba(0,0,0,0.45)",
        color: "#2b190a",
        fontFamily: "Survivant, sans-serif",
        fontSize: "1rem",
        lineHeight: "1.4",
        overflow: "hidden",
        animation: "parchmentFadeIn 0.35s ease",
      },
    });

    // Keep transcript/options in dedicated flex children with min-height:0 for mobile scroll reliability.
    const transcriptDiv = createElement("div", {
      className: "conversation-transcript-region convo-transcript",
    });
    const transcriptContent = createElement("div", {
      className: "conversation-transcript-content",
    });
    transcriptDiv.appendChild(transcriptContent);
    const optionsDiv = createElement("div", {
      className: "conversation-options-region convo-options",
    });
    const navRowDiv = createElement("div", {
      className: "conversation-nav-row convo-footer",
    });

    parchment.appendChild(transcriptDiv);
    parchment.appendChild(optionsDiv);
    parchment.appendChild(navRowDiv);

    parchment._conversationRegions = {
      transcriptDiv,
      transcriptContent,
      optionsDiv,
      navRowDiv,
    };

    const hasHtml = typeof text === "string" && /<\/?[a-z][\s\S]*>/i.test(text);
    if (hasHtml) {
      transcriptContent.innerHTML = text;
    } else if (text) {
      transcriptContent.innerHTML = this._fmtNarration(String(text));
    }

    return parchment;
  }

  _isConversationDebugEnabled() {
    if (this.debugConvo) return true;
    if (typeof window === "undefined") return false;
    return Boolean(
      window.DEBUG_CONVERSATION ||
      window.DEBUG_CONVO ||
      window.gameManager?.debugConversation,
    );
  }

  _debugLog(message, payload = null) {
    if (!this._isConversationDebugEnabled()) return;
    if (typeof console === "undefined") return;
    if (payload !== null && payload !== undefined) {
      console.debug(message, payload);
      return;
    }
    console.debug(message);
  }

  _debugBanner(message, detail = "") {
    if (!this._isConversationDebugEnabled()) return;
    if (typeof window === "undefined") return;
    if (typeof window.debugBanner !== "function") return;
    window.debugBanner(message, detail);
  }

  _getConversationPhase() {
    const override = this.gameManager.conversationPhaseOverride;
    if (override) return this._normalizePhase(override);
    const phase =
      this.gameManager.getGamePhase?.() || this.gameManager.gamePhase;
    if (phase === GamePhase.POST_CHALLENGE) return "post";
    if (phase === GamePhase.PRE_CHALLENGE) return "pre";
    return "pre";
  }

  _normalizePhase(phase) {
    if (!phase) return this._getConversationPhase();
    const raw = typeof phase === "string" ? phase.toLowerCase() : phase;
    if (
      raw === "post" ||
      raw === GamePhase.POST_CHALLENGE ||
      raw === "post_challenge"
    )
      return "post";
    if (
      raw === "pre" ||
      raw === GamePhase.PRE_CHALLENGE ||
      raw === "pre_challenge"
    )
      return "pre";
    return "pre";
  }

  validate() {
    return {
      errors: validateConversationCatalog(CONVERSATION_RESOLVER_TYPES),
      warnings: [],
    };
  }

  validateConversationNodes() {
    return this.validate();
  }

  validateMenus() {
    return this.validate();
  }

  runSelfTest() {
    return this.validate();
  }

  _runConversationQA() {
    return this.validate();
  }

  _isPlayerTribeSafeTonight() {
    const strategyPhaseSystem = this.gameManager.systems?.strategyPhaseSystem;
    if (typeof strategyPhaseSystem?.playerTribeSafe === "boolean") {
      return strategyPhaseSystem.playerTribeSafe;
    }
    if (this.gameManager.getGamePhase?.() !== GamePhase.POST_CHALLENGE)
      return false;
    const day = this.gameManager.getCurrentDay?.() ?? this.gameManager.day;
    const result = challengeManager?.getChallengeResult?.(day);
    const winningKeys = new Set(
      Array.isArray(result?.winningTribeKeys)
        ? result.winningTribeKeys
        : [result?.winningTribeKey].filter(Boolean),
    );
    const playerTribe = this.gameManager.getPlayerTribe?.();
    if (playerTribe?.id && winningKeys.has(playerTribe.id)) return true;
    if (playerTribe?.tribeName && winningKeys.has(playerTribe.tribeName))
      return true;
    return false;
  }

  _pickIntelTarget(survivor, context = {}) {
    if (context.topicPerson) {
      const target = this._getSurvivorByName(context.topicPerson);
      return { targetId: target?.id || null, targetName: context.topicPerson };
    }

    const memory = this.gameManager.systems?.socialMemorySystem;
    const recent = memory?.getKnownNamesRecently?.(survivor.id, 3, 2) || [];
    const pool = recent
      .map(
        (entry) =>
          this._getSurvivorById(entry.id) || this._getSurvivorByName(entry.id),
      )
      .filter((s) => s && !s.isPlayer && s.id !== survivor.id);

    if (pool.length) {
      const pick = pool[getRandomInt(0, pool.length - 1)];
      return { targetId: pick.id || null, targetName: pick.firstName };
    }

    if (this.gameManager.systems?.campActivitySystem?.active)
      return { targetId: null, targetName: null };

    const fallback = this._pickTargetName(survivor, context);
    const fallbackSurvivor = this._getSurvivorByName(fallback);
    return {
      targetId: fallbackSurvivor?.id || null,
      targetName: fallback || null,
    };
  }

  _getBestIntelForTarget(targetId, targetName, ownerId = null) {
    const memory = this.gameManager.systems?.socialMemorySystem;
    if (!memory) return null;
    const idKey = targetId != null ? String(targetId) : null;
    const intel =
      memory.getRecentIntelAbout?.(idKey || targetName, 6, ownerId) || [];
    if (!intel.length && ownerId != null) {
      const subjectId = idKey || this._getSurvivorByName(targetName)?.id;
      const claim = memory
        .getCampClaims?.(ownerId, { subjectId })
        ?.filter((entry) => entry.confidence >= 0.2 && !entry.challenged)
        .sort(
          (a, b) =>
            campEvidenceRank(b) - campEvidenceRank(a) ||
            (b.day || 0) - (a.day || 0) ||
            (a.campTime ?? Infinity) - (b.campTime ?? Infinity),
        )[0];
      if (claim)
        return {
          type:
            claim.topic === "idol_suspicion"
              ? "idol"
              : claim.topic === "alliance"
                ? "alliance"
                : claim.topic === "target" || claim.topic === "warning"
                  ? "target"
                  : "gossip",
          about: claim.subjectId,
          from: claim.sourceId,
          confidence: campEvidenceConfidence(claim) * 100,
          provenance: claim.origin,
        };
    }
    if (!intel.length) return null;
    const top = intel[0];
    if (top.type === "alliance" && targetId) {
      const ally = this._pickAlliesForTarget(targetId, null)[0];
      return { ...top, allyName: ally?.firstName || null };
    }
    return top;
  }

  _pickAlliesForTarget(targetId, excludeId = null) {
    const relationshipSystem = this.gameManager.systems?.relationshipSystem;
    const pool = (
      this.gameManager.getPlayerTribe?.()?.members ||
      this.gameManager.survivors ||
      []
    ).filter((s) => s.id !== targetId && !s.isPlayer && s.id !== excludeId);
    if (!pool.length) return [];

    const sorted = [...pool].sort((a, b) => {
      const relA =
        relationshipSystem?.getRelationship?.(targetId, a.id)?.value ?? 50;
      const relB =
        relationshipSystem?.getRelationship?.(targetId, b.id)?.value ?? 50;
      return relB - relA;
    });

    return sorted.slice(0, 2);
  }

  _pickTargetName(survivor, context = {}) {
    if (context.topicPerson) return context.topicPerson;
    const relationshipSystem = this.gameManager.systems?.relationshipSystem;
    const tribe = this.gameManager.getPlayerTribe?.();
    const pool = tribe?.members || this.gameManager.survivors || [];
    const alliance = Array.isArray(survivor.alliance) ? survivor.alliance : [];
    const candidates = pool.filter((s) => s.id !== survivor.id && !s.isPlayer);
    if (!candidates.length) return null;

    let worst = null;
    let worstScore = Infinity;
    candidates.forEach((other) => {
      if (alliance.includes(other.id)) return;
      const rel = relationshipSystem?.getRelationship?.(survivor.id, other.id);
      const value =
        typeof rel?.value === "number"
          ? rel.value
          : relationshipSystem?.defaultValue || 50;
      if (value < worstScore) {
        worstScore = value;
        worst = other;
      }
    });

    return (worst && worst.firstName) || null;
  }

  _determinePreferredTarget(survivor) {
    const relationshipSystem = this.gameManager.systems?.relationshipSystem;
    const tribe = this.gameManager.getPlayerTribe?.();
    const pool = tribe?.members || this.gameManager.survivors || [];
    const alliance = Array.isArray(survivor.alliance) ? survivor.alliance : [];
    let choice = null;
    let lowest = Infinity;
    pool.forEach((other) => {
      if (
        other.id === survivor.id ||
        other.isPlayer ||
        alliance.includes(other.id)
      )
        return;
      const rel = relationshipSystem?.getRelationship?.(survivor.id, other.id);
      const value =
        typeof rel?.value === "number"
          ? rel.value
          : relationshipSystem?.defaultValue || 50;
      if (value < lowest) {
        lowest = value;
        choice = other.firstName;
      }
    });
    return choice;
  }

  _relationshipBetween(aId, bId) {
    const relationshipSystem = this.gameManager.systems?.relationshipSystem;
    if (!aId || !bId || !relationshipSystem?.getRelationship) {
      return relationshipSystem?.defaultValue || 50;
    }
    const rel = relationshipSystem.getRelationship(aId, bId);
    return typeof rel?.value === "number"
      ? rel.value
      : relationshipSystem.defaultValue || 50;
  }

  _getVoteTogetherContextBonus({ context, target = null, dealType = null }) {
    const normalizedDealType = String(
      dealType || context?.dealType || "",
    ).toLowerCase();
    const isVoteTogether =
      normalizedDealType === "vote_together" ||
      normalizedDealType === "votetogether";
    if (!isVoteTogether || !this._isVoteReadContextFresh()) return 0;

    const targetId =
      target?.id || this._getSurvivorByName(context?.topicPerson)?.id || null;
    if (!targetId || targetId !== this.convoContext?.lastVoteReadTargetId)
      return 0;

    let bonus = 0.04;
    if (this.convoContext?.lastVoteReadNpcAgreed) bonus += 0.03;
    return bonus;
  }

  _evaluateDealResponse(survivor, context, option) {
    const player = this.gameManager.getPlayerSurvivor?.();
    const paranoia = survivor.paranoia || 0;
    const awareness = survivor.awareness || 50;
    let score =
      this._relationshipBetween(player?.id, survivor.id) + (option.delta || 0);
    const approach = context.approach;
    if (approach) {
      const approachScore = this.scoreStrategicApproach({
        npc: survivor,
        player,
        intent: context.intent || "deal",
        approach,
        context,
      });
      context.approachScore = context.approachScore || approachScore;
      score += (approachScore.acceptChance - 0.5) * 20;
    }

    if (
      context.dealType === "voteTogether" &&
      this._isPlayerTribeSafeTonight()
    ) {
      return {
        status: "declined_politely",
        summary: `${survivor.firstName} shakes their head. "We’re safe tonight. I’m not locking votes yet."`,
        delta: -1,
      };
    }

    score -= paranoia * 0.35;
    score += (awareness - 50) * 0.1;

    const preferredTarget = this._determinePreferredTarget(survivor);
    if (context.dealType === "voteTogether") {
      if (context.topicPerson && context.topicPerson === preferredTarget)
        score += 10;
      else score -= 6;
      score += this._getVoteTogetherContextBonus({ context }) * 100;
    }
    if (context.dealType === "splitVote") {
      score -= 10;
      const allianceSystem = this.gameManager.systems?.allianceSystem;
      score +=
        6 *
        (allianceSystem?.getAllianceAffinity?.(survivor.id, player?.id) || 0);
      if (this._getTrustScore(survivor, player) > 70) score += 4;
    }
    if (context.dealType === "mutualProtection") {
      score += 5 - Math.max(0, paranoia * 0.2);
    }
    if (context.dealType === "recruit" && context.topicPerson) {
      const recruitRel = this._relationshipBetween(
        survivor.id,
        this._getSurvivorByName(context.topicPerson)?.id,
      );
      score += recruitRel > 55 ? 6 : -4;
    }
    if (context.dealType === "info") {
      score += awareness > 55 ? 4 : -2;
    }
    if (context.dealType === "final2") {
      score += this._relationshipBetween(player?.id, survivor.id) > 70 ? 8 : -6;
    }
    if (context.dealType === "longPact") {
      score += this._relationshipBetween(player?.id, survivor.id) > 60 ? 6 : -3;
    }

    const statuses = [
      {
        threshold: 78,
        status: "accepted",
        summary: `${survivor.firstName} nods firmly. "I\'m in on ${context.dealTopic}."`,
        delta: 4,
      },
      {
        threshold: 62,
        status: "tentative",
        summary: `${survivor.firstName} cautiously agrees to ${context.dealTopic}, but wants proof.`,
        delta: 2,
      },
      {
        threshold: 48,
        status: "declined_politely",
        summary: `${survivor.firstName} declines ${context.dealTopic} without burning the bridge.`,
        delta: -1,
      },
      {
        threshold: 35,
        status: "counter",
        summary: `${survivor.firstName} seems unsure about ${context.dealTopic}.`,
        delta: 0,
        counter: '"What if we loop in someone else or wait a round?"',
      },
    ];

    let outcome = statuses.find((s) => score >= s.threshold);
    if (!outcome)
      outcome = {
        status: "declined_suspicious",
        summary: `${survivor.firstName} eyes you warily. "Feels risky. No deal."`,
        delta: -4,
      };

    return outcome;
  }

  _getSurvivorByName(name) {
    if (!name) return null;
    const pool = this.gameManager.survivors || [];
    return pool.find((s) => s.firstName === name) || null;
  }

  _getRelationshipScore(survivor) {
    const player = this.gameManager.getPlayerSurvivor?.();
    const relationshipSystem = this.gameManager.systems?.relationshipSystem;
    if (
      !player ||
      !relationshipSystem ||
      typeof relationshipSystem.getRelationship !== "function"
    )
      return null;
    const rel = relationshipSystem.getRelationship(player.id, survivor.id);
    return rel ? rel.value : null;
  }

  _clamp01(value) {
    const num = typeof value === "number" ? value : 0;
    return Math.max(0, Math.min(1, num));
  }

  scoreStrategicApproach({ npc, player, intent, approach, context = {} }) {
    const relationshipSystem = this.gameManager.systems?.relationshipSystem;
    const socialMemory = this.gameManager.systems?.socialMemorySystem;
    const allianceSystem = this.gameManager.systems?.allianceSystem;
    const relationship =
      relationshipSystem?.getRelationship?.(player?.id, npc?.id)?.value ?? 50;
    const trust = this.gameManager.getTrust?.(npc?.id, player?.id) ?? 50;
    const reliability = socialMemory?.getReliability?.(player?.id) ?? 50;
    const personality = (
      npc?.personality ||
      npc?.gameplayStyle ||
      ""
    ).toLowerCase();
    const loyal =
      personality.includes("loyal") || personality.includes("honest");
    const deceptive =
      personality.includes("deceptive") ||
      personality.includes("shadow") ||
      personality.includes("strategic");
    const willpower = npc?.willpower ?? 50;

    let acceptChance = this._clamp01(
      (relationship * 0.55 + trust * 0.35 + reliability * 0.1) / 100,
    );
    let stanceBias = 0;
    let trustDelta = 0;
    let reliabilityDelta = 0;
    let suspicionDelta = 0;
    const memoryEvents = [];

    switch (approach) {
      case STRATEGY_APPROACHES.TRUTHFUL:
        acceptChance += 0.05;
        stanceBias = 1;
        trustDelta = 2;
        reliabilityDelta = 1;
        if (deceptive) trustDelta -= 1;
        break;
      case STRATEGY_APPROACHES.PERSUASIVE:
        acceptChance += 0.08;
        stanceBias = 1;
        trustDelta = 1;
        reliabilityDelta = 0;
        break;
      case STRATEGY_APPROACHES.NEGOTIATE: {
        const dealScore =
          allianceSystem?.scoreDealAcceptance?.({
            offererId: player?.id,
            receiverId: npc?.id,
          }) ?? acceptChance;
        acceptChance = this._clamp01(dealScore + 0.05);
        stanceBias = 1;
        trustDelta = 1;
        reliabilityDelta = 1;
        break;
      }
      case STRATEGY_APPROACHES.DEAL_MAKING: {
        const dealScore =
          allianceSystem?.scoreDealAcceptance?.({
            offererId: player?.id,
            receiverId: npc?.id,
          }) ?? acceptChance;
        acceptChance = this._clamp01(dealScore + 0.12);
        stanceBias = 2;
        trustDelta = 2;
        reliabilityDelta = 1;
        break;
      }
      case STRATEGY_APPROACHES.MANIPULATE:
        acceptChance += 0.12;
        stanceBias = deceptive ? 1 : 0;
        trustDelta = loyal ? -4 : -2;
        reliabilityDelta = -1;
        suspicionDelta = loyal ? 4 : 3;
        break;
      case STRATEGY_APPROACHES.LIE:
        acceptChance += 0.1;
        trustDelta = -3;
        reliabilityDelta = -4;
        suspicionDelta = 4;
        memoryEvents.push({ type: "lie", lieType: intent });
        break;
      case STRATEGY_APPROACHES.PRESSURE:
        acceptChance += willpower < 45 ? 0.18 : 0.05;
        stanceBias = willpower < 45 ? 1 : -1;
        trustDelta = -6;
        reliabilityDelta = -1;
        suspicionDelta = 5;
        break;
      default:
        break;
    }

    return {
      acceptChance: this._clamp01(acceptChance),
      stanceBias,
      trustDelta,
      reliabilityDelta,
      suspicionDelta,
      memoryEvents,
    };
  }

  _computeNpcStance({ npc, player, intent, subjectId = null, context = {} }) {
    const relationshipSystem = this.gameManager.systems?.relationshipSystem;
    const socialMemory = this.gameManager.systems?.socialMemorySystem;
    const allianceSystem = this.gameManager.systems?.allianceSystem;
    const relationship =
      relationshipSystem?.getRelationship?.(player?.id, npc?.id)?.value ?? 50;
    const memoryTrust = this.gameManager.getTrust?.(npc?.id, player?.id) ?? 50;
    const reliability = socialMemory?.getReliability?.(npc?.id) ?? 50;
    const allianceAffinity =
      allianceSystem?.getAllianceAffinity?.(npc?.id, player?.id) || 0;
    const personality = (
      npc?.personality ||
      npc?.gameplayStyle ||
      ""
    ).toLowerCase();

    let score =
      relationship * 0.6 + memoryTrust * 0.3 + (reliability - 50) * 0.1;
    score += allianceAffinity * 8;
    if (personality.includes("paranoid")) score -= 6;
    if (personality.includes("deceptive") || personality.includes("shadow"))
      score -= 4;
    if (personality.includes("loyal") || personality.includes("honest"))
      score += 5;

    if (
      subjectId &&
      [
        POST_PHASE_INTENTS.pitch_target,
        POST_PHASE_INTENTS.deflect_target,
        POST_PHASE_INTENTS.plant_seed,
      ].includes(intent)
    ) {
      const subjectRel =
        relationshipSystem?.getRelationship?.(npc?.id, subjectId)?.value ?? 50;
      if (subjectRel > 65) score -= 15;
      if (subjectRel < 35) score += 8;
    }

    const memory = socialMemory?.getMemory?.(npc?.id);
    const recentLie = memory?.lies?.some(
      (lie) => lie.liarId === player?.id && !lie.discovered,
    );
    if (recentLie) score -= 10;

    if (score >= 82) return "committal";
    if (score >= 72) return "supportive";
    if (score >= 62)
      return intent === POST_PHASE_INTENTS.plant_seed ? "intrigued" : "neutral";
    if (score >= 50) return "evasive";
    if (score >= 40) return "suspicious";
    if (score >= 30) return "defensive";
    return "hostile";
  }

  _choiceKey(choice) {
    if (!choice) return "";
    const key = choice.id || choice.label || choice.action || "";
    return String(key).trim().toLowerCase();
  }

  _shiftMood(npcId, newMood) {
    if (!npcId || !newMood) return;
    this.moods.set(npcId, newMood);
  }

  _highlightNpcIcon(npcId, enable) {
    const icons = document.querySelectorAll(
      `.npc-icon[data-npc-id="${npcId}"]`,
    );
    icons.forEach((icon) => {
      icon.style.boxShadow = enable
        ? "0 0 12px 4px rgba(255, 215, 0, 0.8)"
        : "0 0 6px rgba(0,0,0,0.65)";
    });
  }

  _clearPendingMeetings(applyConsequences) {
    if (applyConsequences) {
      this.pendingMeetings
        .filter((m) => !m.hasTriggered)
        .forEach((m) => {
          const npc = this._getSurvivorById(m.npcId);
          if (npc) {
            this._applyMissedMeetingConsequence(npc);
          }
        });
    }
    this.pendingMeetings.forEach((m) => this._highlightNpcIcon(m.npcId, false));
    this.pendingMeetings.forEach((m) => {
      if (!m.hasTriggered) {
        this.gameManager.systems?.npcLocationSystem?.releaseNpcMeetingReservation?.(
          m.npcId,
          {
            reason: applyConsequences ? "meeting_missed" : "meeting_cleared",
          },
        );
      }
    });
    this.pendingMeetings = [];
  }

  _applyMissedMeetingConsequence(npc) {
    const player = this.gameManager.getPlayerSurvivor?.();
    const relationshipSystem = this.gameManager.systems?.relationshipSystem;
    if (
      !player ||
      !relationshipSystem ||
      typeof relationshipSystem.changeRelationship !== "function"
    )
      return;
    relationshipSystem.changeRelationship(player.id, npc.id, -3);
    this._shiftMood(npc.id, "irritated");
  }

  _getSurvivorById(id) {
    if (id == null) return null;
    return (
      (this.gameManager.survivors || []).find(
        (s) => String(s.id) === String(id),
      ) || null
    );
  }

  _debugStartNpcApproach() {
    const npc = this._pickConversationNpc();
    if (npc)
      this.startNpcConversation(npc, "check_in", { initiatedByNpc: true });
    return npc;
  }

  _clearOverlay(options = {}) {
    const { preserveSession = false, reason = null } = options;
    if (this._isConversationDebugEnabled()) {
      const stack = new Error().stack;
      this._debugLog("CONVO: clear overlay", {
        reason,
        preserveSession,
        npcId: this._activeOverlayNpcId || this.state?.npcId || null,
        stack,
      });
      this._debugBanner("CONVO clear", reason || "unknown");
    }
    this._clearApproachTimer();
    if (this.activeOverlay) {
      this.activeOverlay.remove();
      this.activeOverlay = null;
    }
    this._activeOverlayNpcId = null;
    if (!preserveSession && this._scrambleReturnFocus) {
      const focus = this._scrambleReturnFocus;
      this._scrambleReturnFocus = null;
      queueMicrotask(() => {
        if (
          !document.querySelector("#conversation-overlay") &&
          focus.isConnected
        )
          focus.focus?.({ preventScroll: true });
      });
    }
    if (!preserveSession) {
      this.activeConversationContext = null;
      this.conversationSession = null;
      this.nodeSession = null;
    }
  }

  _clearApproachTimer() {
    if (this.approachTimerId) {
      timerManager.clearTimeout(this.approachTimerId);
      this.approachTimerId = null;
    }
  }

  _formatLocation(location) {
    if (!location) return "";
    const normalized = this._normalizeLocationKey(location);
    const labels = {
      [LocationKeys.BEACH.toLowerCase()]: "beach",
      [LocationKeys.SHELTER.toLowerCase()]: "shelter",
      [LocationKeys.CAMPFIRE.toLowerCase()]: "campfire",
      [LocationKeys.WATER_WELL.toLowerCase()]: "water well",
      [LocationKeys.ROCKY_SHORE.toLowerCase()]: "rocky shore",
      [LocationKeys.FORK1.toLowerCase()]: "jungle fork",
      [LocationKeys.FORK2.toLowerCase()]: "jungle path",
      [LocationKeys.FORK3.toLowerCase()]: "hidden trail",
      [LocationKeys.TREE_MAIL.toLowerCase()]: "tree mail",
      [LocationKeys.MOUNTAIN_TRAIL.toLowerCase()]: "mountain trail",
      [LocationKeys.JUNGLE_TRAIL.toLowerCase()]: "jungle trail",
      [LocationKeys.WATERFALL_TRAIL.toLowerCase()]: "waterfall trail",
      [LocationKeys.FIREWOOD.toLowerCase()]: "firewood pile",
      [LocationKeys.BAMBOO.toLowerCase()]: "bamboo grove",
      [LocationKeys.FISHING.toLowerCase()]: "fishing spot",
    };
    return labels[normalized] || location;
  }

  _normalizeLocationKey(value) {
    return typeof value === "string"
      ? value
          .trim()
          .toLowerCase()
          .replace(/[\s_-]+/g, "")
      : value == null
        ? ""
        : String(value)
            .trim()
            .toLowerCase()
            .replace(/[\s_-]+/g, "");
  }

  _injectConversationStyles() {
    this._ensureConversationStyles();
  }

  _isInCamp() {
    return this.gameManager.gameState === GameState.CAMP;
  }
}

export default ConversationSystem;
