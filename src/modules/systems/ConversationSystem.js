import eventManager, { GameEvents } from '../core/EventManager.js';
import { GameState, GamePhase } from '../core/GameManager.js';
import { createElement, clearChildren } from '../utils/DOMUtils.js';
import { getRandomInt } from '../utils/CommonUtils.js';
import timerManager from '../utils/TimerManager.js';

function resolveNpcDisclosure({ npc, player, kind, context = {} }) {
  const relationshipSystem = context.relationshipSystem || player?.gameManager?.systems?.relationshipSystem || npc?.gameManager?.systems?.relationshipSystem;
  const baseRelationship = typeof relationshipSystem?.getRelationship === 'function'
    ? (relationshipSystem.getRelationship(player?.id, npc?.id)?.value ?? 50)
    : (typeof npc?.trust === 'number' ? npc.trust : 50);

  const trustScore = Math.max(0, Math.min(100, baseRelationship));
  const personality = (npc?.personality || npc?.gameplayStyle || '').toLowerCase();

  let evadeChance = trustScore < 40 ? 0.45 : 0.2;
  let truthChance = trustScore > 70 ? 0.55 : 0.35;
  let lieChance = 1 - (evadeChance + truthChance);

  if (personality.includes('deceptive') || personality.includes('strategic')) {
    lieChance += 0.12;
    evadeChance -= 0.05;
  }

  if (personality.includes('loyal') || personality.includes('honest')) {
    lieChance -= 0.1;
    evadeChance += 0.08;
  }

  if (trustScore > 80) {
    truthChance += 0.1;
    lieChance -= 0.05;
  } else if (trustScore < 30) {
    lieChance += 0.1;
    truthChance -= 0.05;
  }

  const normalize = (v) => Math.max(0, v);
  evadeChance = normalize(evadeChance);
  lieChance = normalize(lieChance);
  truthChance = normalize(truthChance);
  const total = evadeChance + lieChance + truthChance;
  evadeChance /= total;
  lieChance /= total;
  truthChance /= total;

  const roll = Math.random();
  let outcome = 'evade';
  if (roll < evadeChance) {
    outcome = 'evade';
  } else if (roll < evadeChance + truthChance) {
    outcome = 'truth';
  } else {
    outcome = 'lie';
  }

  const availableTargets = context.availableTargets || [];
  const trueTarget = context.trueTarget || context.topicPerson || context.targetName || null;
  let claimedTarget = trueTarget;

  if (outcome === 'lie') {
    const filtered = availableTargets.filter(t => t && t !== trueTarget);
    claimedTarget = filtered.length > 0 ? filtered[getRandomInt(0, filtered.length - 1)] : trueTarget || null;
  }

  if (outcome === 'evade') {
    claimedTarget = null;
  }

  let reasonTag = 'neutral_disclosure';
  if (trustScore < 30) {
    reasonTag = 'low_trust';
  } else if (trustScore > 75) {
    reasonTag = 'high_trust';
  }
  if (outcome === 'lie' && personality.includes('deceptive')) {
    reasonTag = 'deceptive_tendency';
  } else if (outcome === 'evade' && personality.includes('loyal')) {
    reasonTag = 'cautious_loyalty';
  }

  return { outcome, claimedTarget, trueTarget, reasonTag };
}

function ensureCampSocialChanges() {
  if (!window.campSocialChanges) {
    window.campSocialChanges = {};
  }

  const buckets = ['relationship', 'trust', 'suspicion', 'deals', 'gossip', 'memory', 'voteShifts', 'reliability'];
  buckets.forEach(key => {
    if (!Array.isArray(window.campSocialChanges[key])) {
      window.campSocialChanges[key] = [];
    }
  });

  return window.campSocialChanges;
}

ensureCampSocialChanges();

function mapToneFromOutcome(outcome) {
  switch (outcome) {
    case 'playAlong':
    case 'tentative':
      return 'hedging';
    case 'declined_suspicious':
      return 'deceptive';
    case 'accepted':
    case 'agree':
      return 'truthful';
    default:
      return 'unknown';
  }
}

function normalizeDealType(dealType) {
  switch (dealType) {
    case 'voteTogether':
      return 'voteTogether';
    case 'mutualProtection':
    case 'protection':
      return 'protection';
    case 'info':
      return 'information';
    case 'recruit':
    case 'longPact':
      return 'allianceInterest';
    default:
      return 'voteTogether';
  }
}

const TOPIC_TO_INTENT = {
  bonding: 'bonding',
  personal: 'personal',
  lightStrategy: 'lightStrategy',
  hardStrategy: 'hardStrategy',
  trust: 'trust',
  talkTarget: 'gossip',
  deal: 'deal',
  confront: 'confrontation',
  apologize: 'apology',
  mood: 'moodCheck',
  camp: 'campTalk',
  humor: 'fun'
};

const CAMP_LOCATIONS = ['beach', 'shelter', 'campfire', 'waterWell', 'rocky', 'fork1', 'fork2', 'fork3'];

const INTENT_TEMPLATES = {
  bonding: [
    '{npc} opens up about their family back home. It feels genuine.',
    '{npc} smiles and asks about your story, trying to bridge the gap.'
  ],
  personal: [
    '{npc} shares a vulnerable moment, eyes on the fire as they talk.',
    'You and {npc} trade personal stories. It feels like a real connection.'
  ],
  lightStrategy: [
    '{npc} leans in quietly. "What are you thinking for the next vote?"',
    'In a hushed tone, {npc} tests the waters about alliances.'
  ],
  hardStrategy: [
    '{npc} is direct: "Let\'s make a move. I want {target} out."',
    'With intensity, {npc} pushes a plan on {target} and watches your reaction.'
  ],
  trust: [
    '{npc} thinks for a moment. "Honestly… I probably trust {ally} the most right now."',
    '"If I\'m being straight with you, {ally} feels the most solid to me," {npc} admits.'
  ],
  gossip: [
    '{npc} lowers their voice: "Did you hear what {target} said?"',
    '{npc} snickers. "Between us, {target} is acting shady."'
  ],
  confrontation: [
    '{npc} crosses their arms. "You throwing my name around?"',
    'There is tension as {npc} stares you down about rumors.'
  ],
  playerConfront: [
    'You pull {npc} aside. "I heard my name came up. Talk to me."',
    'You step toward {npc}. "If you\'re pushing me, own it."'
  ],
  playerAccuse: [
    'You hold eye contact with {npc}. "Feels like you lied to me earlier."',
    'Your voice is low. "{npc}, that story didn\'t add up."'
  ],
  apology: [
    '{npc} waits for you to address the past before moving on.',
    'You bring up old tension. {npc} watches to see if you mean it.'
  ],
  moodCheck: [
    'You check in on {npc}. Their guard shifts as they consider opening up.',
    '{npc} sighs. "It\'s been a lot. You really want to know?"'
  ],
  campTalk: [
    '{npc} chats about camp life and the next challenge.',
    'Together you evaluate shelter, fire, and challenge odds.'
  ],
  fun: [
    '{npc} jokes about coconut crabs and you both laugh.',
    'The mood lightens as {npc} tells a ridiculous story.'
  ],
  warning: [
    '{npc} whispers: "Be careful around {target}."',
    'Eyes darting, {npc} warns you about a brewing plot.'
  ],
  manipulation: [
    '{npc} flatters you, guiding the talk toward their agenda.',
    'You sense {npc} steering the conversation to benefit them.'
  ],
  protection: [
    'Quietly, {npc} promises to watch your back at the next vote.',
    '{npc} offers cover if things get messy tonight.'
  ],
  wildcard: [
    'Out of nowhere, {npc} rambles about idols, storms, and goats.',
    '{npc} pivots between topics; the chaos is real.'
  ],
  deal: [
    '{npc} narrows their eyes. "So you want to make a deal?"',
    '{npc} folds their arms, weighing your offer carefully.'
  ]
};

const RESPONSE_LIBRARY = {
  bonding: [
    { label: 'Lean in and share something too', delta: 5, mood: 'happy', followup: 'You trade a real moment. It feels warmer.' },
    { label: 'Nod but stay guarded', delta: -1, mood: 'neutral', followup: 'You keep it light; {npc} notices the distance.' },
    { label: 'Deflect with humor', delta: 1, mood: 'fun', followup: 'You lighten the vibe. {npc} chuckles.' }
  ],
  personal: [
    { label: 'Thank them for sharing', delta: 4, mood: 'calm', followup: 'Trust inches forward.' },
    { label: 'Share your own vulnerability', delta: 6, mood: 'happy', followup: 'A deeper bond forms.' },
    { label: 'Change the subject', delta: -4, mood: 'irritated', followup: 'Walls go back up between you.' }
  ],
  lightStrategy: [
    { label: 'Offer a soft take', delta: 2, mood: 'calm', followup: 'You test the waters together.' },
    { label: 'Ask who they are eyeing', delta: 1, mood: 'neutral', disclosureKind: 'whoAreYouEyeing', followup: '{npc} glances around, then admits they\'re watching {target}.' },
    { label: 'Stay vague', delta: -2, mood: 'suspicious', followup: '{npc} isn\'t sure if you are with them.' }
  ],
  hardStrategy: [
    { label: 'Agree to push the plan', delta: 3, mood: 'focused', followup: 'A pact forms for now.' },
    {
      label: 'Counter with another target',
      delta: 1,
      mood: 'neutral',
      followup: 'You redirect the heat elsewhere.',
      requiresCounterTarget: true
    },
    { label: 'Refuse to commit', delta: -5, mood: 'irritated', followup: '{npc} questions your loyalty.' }
  ],
  trust: [
    { label: 'Name a trusted ally', delta: 2, mood: 'calm', followup: '{npc} nods. "Yeah, I feel pretty good about {ally} too."' },
    { label: 'Claim they are your #1', delta: 4, mood: 'happy', followup: '{npc} smiles, clearly liking that you trust them most.' },
    { label: 'Dodge the question', delta: -3, mood: 'suspicious', followup: '{npc} raises a brow, clearly noticing you won\'t name anyone.' }
  ],
  gossip: [
    { label: 'Lean into the tea', delta: 2, mood: 'fun', followup: 'You both gossip quietly about {target}.' },
    { label: 'Defend the target', delta: -3, mood: 'irritated', followup: 'You stick up for {target}. {npc} doesn\'t love that.' },
    { label: 'Steer away', delta: -1, mood: 'neutral', followup: 'You change the subject and the moment fizzles out.' }
  ],
  confrontation: [
    { label: 'Stand your ground', delta: -4, mood: 'angry', followup: 'Tension spikes.' },
    { label: 'Apologize and explain', delta: 3, mood: 'calm', followup: 'It cools the air.' },
    { label: 'Flip it back on them', delta: -2, mood: 'suspicious', followup: 'Now both of you are wary.' }
  ],
  playerConfront: [
    { label: 'Say you heard it directly', delta: -1, mood: 'focused', followup: '{npc} swallows. "From who?" they ask.' },
    { label: 'Say it came through someone', delta: 0, mood: 'neutral', followup: '{npc} glances around, trying to read you.' },
    { label: 'Name a source', delta: -2, mood: 'angry', followup: '{npc} bristles but listens. The air is heavy.', memoryTags: ['confront_source'] },
    { label: 'Back off / laugh it off', delta: 1, mood: 'calm', followup: '{npc} exhales, tension easing just a little.' }
  ],
  playerAccuse: [
    { label: 'Call out the lie directly', delta: -3, mood: 'angry', followup: '{npc} denies it, but their eyes dart.', memoryTags: ['accuse_lie'] },
    { label: 'Ask why they twisted things', delta: -1, mood: 'focused', followup: '{npc} fumbles for an explanation.' },
    { label: 'Give them a chance to come clean', delta: 2, mood: 'calm', followup: '{npc} considers softening their stance.' }
  ],
  apology: [
    { label: 'Offer a sincere apology', delta: 4, mood: 'calm', followup: '{npc} softens a bit.' },
    { label: 'Clarify your side', delta: 0, mood: 'neutral', followup: 'You both agree to move on… maybe.' },
    { label: 'Downplay the issue', delta: -3, mood: 'irritated', followup: 'That did not land well.' }
  ],
  moodCheck: [
    { label: 'Show real concern', delta: 3, mood: 'happy', followup: '{npc} feels seen.' },
    { label: 'Encourage them to push through', delta: 1, mood: 'neutral', followup: 'They nod, still processing.' },
    { label: 'Brush it off', delta: -4, mood: 'irritated', followup: 'You miss the cue and it stings.' }
  ],
  campTalk: [
    { label: 'Problem-solve together', delta: 2, mood: 'calm', followup: 'You align on camp needs.' },
    { label: 'Praise their effort', delta: 3, mood: 'happy', followup: '{npc} appreciates the credit.' },
    { label: 'Complain about others', delta: -2, mood: 'suspicious', followup: 'Negativity hangs in the air.' }
  ],
  fun: [
    { label: 'Add your own joke', delta: 2, mood: 'happy', followup: 'Laughter spreads.' },
    { label: 'Play along', delta: 1, mood: 'fun', followup: 'The vibe stays light.' },
    { label: 'Say it\'s not the time', delta: -3, mood: 'irritated', followup: 'The mood dips instantly.' }
  ],
  warning: [
    { label: 'Thank them and agree', delta: 3, mood: 'calm', followup: 'You take the warning seriously.' },
    { label: 'Ask for proof', delta: 0, mood: 'suspicious', followup: '{npc} hesitates but stays engaged.' },
    { label: 'Dismiss the warning', delta: -4, mood: 'angry', followup: 'Trust erodes quickly.' }
  ],
  manipulation: [
    { label: 'Play along to learn more', delta: 1, mood: 'neutral', followup: 'You let them feel in control.' },
    { label: 'Call out the spin', delta: -3, mood: 'angry', followup: '{npc} bristles at the pushback.' },
    { label: 'Counter-offer a deal', delta: 2, mood: 'focused', followup: 'Now you both have leverage.' }
  ],
  protection: [
    { label: 'Accept the cover', delta: 3, mood: 'happy', followup: '{npc} likes that you trust them.' },
    { label: 'Offer protection back', delta: 4, mood: 'calm', followup: 'A mutual pact forms.' },
    { label: 'Question their motive', delta: -2, mood: 'suspicious', followup: 'They wonder if you doubt them.' }
  ],
  wildcard: [
    { label: 'Just roll with it', delta: 1, mood: 'fun', followup: 'Chaos shared is chaos loved.' },
    { label: 'Try to focus them', delta: -1, mood: 'neutral', followup: '{npc} drifts but tries.' },
    { label: 'Back away slowly', delta: -2, mood: 'irritated', followup: 'They notice you disengaging.' }
  ],
  deal: [
    { label: 'Pitch it confidently', delta: 3, mood: 'focused', followup: '{npc} hears you out on {dealTopic}.' },
    { label: 'Offer flexibility', delta: 2, mood: 'calm', followup: 'You make room for their concerns about {dealTopic}.' },
    { label: 'Feel them out first', delta: 1, mood: 'neutral', followup: 'You probe gently to see if {npc} will accept {dealTopic}.' }
  ]
};

class ConversationSystem {
  constructor(gameManager) {
    this.gameManager = gameManager;
    this.pendingMeetings = [];
    this.activeOverlay = null;
    this.midPhaseTimerId = null;
    this.moods = new Map();
    this.approachTimerId = null;
    this.activeConversationContext = null;
    this._stylesInjected = false;
  }

  initialize() {
    eventManager.subscribe(GameEvents.NPC_CONFRONTATION, this._handleNpcConfrontation.bind(this));
    eventManager.subscribe(GameEvents.GAME_PHASE_CHANGED, this._handlePhaseChange.bind(this));
    eventManager.subscribe(GameEvents.CAMP_VIEW_LOADED, this._handleCampViewLoaded.bind(this));
  }

  /**
   * Allow other systems (e.g., SocialEngine) to start a conversation using
   * the shared conversation UI and memory/relationship hooks.
   * @param {Object} survivor - The NPC initiating the talk
   * @param {string} type - High-level conversation type from SocialEngine
   * @param {Object} options - Additional optional data
   */
  startNpcConversation(survivor, type, options = {}) {
    if (!survivor || !this._isInCamp()) return;

    const intent = this._mapSocialTypeToIntent(type);
    const location = options.location || (typeof window !== 'undefined' ? window?.campScreen?.currentView : null);
    const initiator = options.initiatedByNpc ? 'npc' : (options.initiator || 'player');

    const beginConversation = () => {
      this._startConversation(survivor, {
        intentOverride: intent,
        isPurpose: true,
        meeting: null,
        location,
        context: { ...(options.context || {}), initiator }
      });
    };

    if (options.initiatedByNpc) {
      this._showNpcApproachOverlay(survivor, location, beginConversation);
    } else {
      beginConversation();
    }
  }

  reset() {
    this._clearOverlay();
    this._clearPendingMeetings(true);
    if (this.midPhaseTimerId) {
      timerManager.clearTimeout(this.midPhaseTimerId);
      this.midPhaseTimerId = null;
    }
  }

  _handleNpcConfrontation({ survivor, location }) {
    if (!this._isInCamp() || !survivor) return;

    const pending = this.pendingMeetings.find(meeting => meeting.npcId === survivor.id && meeting.location === location && !meeting.hasTriggered);
    if (pending) {
      pending.hasTriggered = true;
      this._startConversation(survivor, { isPurpose: true, meeting: pending, location, context: { initiator: 'npc' } });
      return;
    }

    this._showTopicSelection(survivor, location);
  }

  _handlePhaseChange({ phase }) {
    if (!this._isInCamp()) {
      this._clearPendingMeetings(false);
      return;
    }

    if (phase === GamePhase.PRE_CHALLENGE || phase === GamePhase.POST_CHALLENGE) {
      this._clearPendingMeetings(false);
      this._queuePhaseInvitations(phase);
    } else {
      this._clearPendingMeetings(true);
    }
  }

  _handleCampViewLoaded({ viewName }) {
    if (!this._isInCamp()) return;

    const meeting = this.pendingMeetings.find(item => item.location === viewName && !item.hasTriggered);
    if (meeting) {
      meeting.hasTriggered = true;
      const survivor = this._getSurvivorById(meeting.npcId);
      if (survivor) {
        this._startConversation(survivor, { isPurpose: true, meeting, location: viewName, context: { initiator: 'npc' } });
      }
    }
  }

  _queuePhaseInvitations(phase) {
    this._scheduleMeetingInvitation(phase, 'phaseIntro');

    if (this.midPhaseTimerId) {
      timerManager.clearTimeout(this.midPhaseTimerId);
    }

    this.midPhaseTimerId = timerManager.setTimeout(
      `conversation-mid-${phase}-${this.gameManager.day}`,
      () => {
        if (this._isInCamp() && this.gameManager.gamePhase === phase) {
          this._scheduleMeetingInvitation(phase, 'midPhase');
        }
      },
      60000
    );
  }

  _scheduleMeetingInvitation(phase, type) {
    const npc = this._pickConversationNpc();
    if (!npc) return;

    const location = CAMP_LOCATIONS[getRandomInt(0, CAMP_LOCATIONS.length - 1)];
    const meeting = {
      phase,
      npcId: npc.id,
      location,
      hasTriggered: false,
      type
    };

    this.pendingMeetings.push(meeting);
    this._highlightNpcIcon(npc.id, true);
    this._showInvitationToast(npc, location, type);
  }

  _pickConversationNpc() {
    const tribe = this.gameManager.getPlayerTribe?.() || null;
    const survivors = tribe?.members || this.gameManager.survivors || [];
    const candidates = survivors.filter(s => !s.isPlayer);
    if (candidates.length === 0) return null;

    const sorted = [...candidates].sort((a, b) => {
      return (this._getRelationshipScore(b) || 50) - (this._getRelationshipScore(a) || 50);
    });

    const slice = sorted.slice(0, Math.max(1, Math.ceil(sorted.length / 2)));
    return slice[getRandomInt(0, slice.length - 1)];
  }

  _showInvitationToast(npc, location, type) {
    const toast = createElement('div', {
      className: 'conversation-invite-toast',
      style: {
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        zIndex: 1200,
        backgroundImage: "url('Assets/parch-landscape.png')",
        backgroundSize: 'cover',
        padding: '14px 18px',
        color: '#2b190a',
        fontFamily: 'Survivant, sans-serif',
        boxShadow: '0 6px 12px rgba(0,0,0,0.35)',
        borderRadius: '8px',
        maxWidth: '280px'
      }
    });

    const note = type === 'phaseIntro'
      ? `${npc.firstName} wants to talk to you at the ${location}.`
      : `${npc.firstName} whispers: meet me at the ${location} soon.`;

    toast.textContent = note;
    document.body.appendChild(toast);

    setTimeout(() => toast.remove(), 6000);
  }

  _showTopicSelection(survivor, location) {
    const overlay = this._buildOverlayShell(survivor);
    const parchment = this._buildParchment(`Choose a direction with ${survivor.firstName}`);

    const buttonColumn = createElement('div', {
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        marginTop: '8px',
        maxHeight: '46vh',
        overflowY: 'auto',
        width: '100%'
      }
    });

    const categories = [
      { key: 'personal', label: 'Personal' },
      { key: 'strategy', label: 'Strategy' },
      { key: 'exchange', label: 'Exchange Info' },
      { key: 'confront', label: 'Confront' }
    ];

    categories.forEach(cat => {
      const btn = createElement('button', {
        className: 'rect-button full',
        onclick: () => this._showCategoryMenu(survivor, location, cat.key)
      }, cat.label);
      buttonColumn.appendChild(btn);
    });

    const closeBtn = createElement('button', {
      className: 'rect-button alt full',
      onclick: () => this._clearOverlay()
    }, 'End Conversation');

    buttonColumn.appendChild(closeBtn);
    parchment.appendChild(buttonColumn);
    overlay.querySelector('.conversation-center').appendChild(parchment);
  }

  _showCategoryMenu(survivor, location, category) {
    this._clearOverlay();
    const overlay = this._buildOverlayShell(survivor);
    const parchment = this._buildParchment(`Dig deeper with ${survivor.firstName}`);

    const optionColumn = createElement('div', {
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        marginTop: '8px',
        maxHeight: '46vh',
        overflowY: 'auto',
        width: '100%'
      }
    });

    const addOption = (label, handler) => {
      const btn = createElement('button', {
        className: 'rect-button full',
        onclick: handler
      }, label);
      optionColumn.appendChild(btn);
    };

    const tribe = this.gameManager.getPlayerTribe?.();
    const pool = tribe?.members || this.gameManager.survivors || [];

    if (category === 'personal') {
      addOption('Bond / Get to know', () => this._startConversation(survivor, { intentOverride: 'bonding', location }));
      addOption('Share a personal story', () => this._startConversation(survivor, { intentOverride: 'personal', location }));
      addOption('Joke around', () => this._startConversation(survivor, { intentOverride: 'fun', location }));
      addOption('Check on their mood', () => this._startConversation(survivor, { intentOverride: 'moodCheck', location }));
    } else if (category === 'strategy') {
      addOption('Light strategy (general)', () => this._startConversation(survivor, { intentOverride: 'lightStrategy', location }));
      addOption('Push a target', () => this.promptSurvivorPicker({
        title: 'Who do you want to push?',
        tribeOnly: true,
        excludeIds: [survivor.id, this.gameManager.getPlayerSurvivor?.()?.id],
        onPick: pick => this._startConversation(survivor, { intentOverride: 'hardStrategy', location, context: { topicPerson: pick.firstName, stance: 'push', initiator: 'player' } })
      }));
      addOption('Offer a deal', () => this._showDealMenu(survivor, location));
      addOption('Ask who they trust', () => this.promptSurvivorPicker({
        title: 'Who do they trust?',
        tribeOnly: true,
        excludeIds: [survivor.id, this.gameManager.getPlayerSurvivor?.()?.id],
        onPick: pick => this._startConversation(survivor, { intentOverride: 'trust', location, context: { allyName: pick.firstName } })
      }));
    } else if (category === 'exchange') {
      addOption('Ask what they’ve heard', () => this._startConversation(survivor, { intentOverride: 'gossip', location }));
      addOption('Talk about someone specific', () => this.promptSurvivorPicker({
        title: 'Talk about who?',
        tribeOnly: true,
        excludeIds: [survivor.id, this.gameManager.getPlayerSurvivor?.()?.id],
        onPick: pick => this._startConversation(survivor, { intentOverride: 'gossip', location, context: { topicPerson: pick.firstName } })
      }));
      addOption('Share a suspicion', () => this.promptSurvivorPicker({
        title: 'Suspicious of who?',
        tribeOnly: true,
        excludeIds: [survivor.id, this.gameManager.getPlayerSurvivor?.()?.id],
        onPick: pick => this._startConversation(survivor, { intentOverride: 'warning', location, context: { topicPerson: pick.firstName } })
      }));
    } else if (category === 'confront') {
      addOption('Confront them about your name coming up', () => this._startConversation(survivor, { intentOverride: 'playerConfront', location }));
      addOption('Confront them about someone else', () => this.promptSurvivorPicker({
        title: 'Confront about who?',
        tribeOnly: true,
        excludeIds: [survivor.id, this.gameManager.getPlayerSurvivor?.()?.id],
        onPick: pick => this._startConversation(survivor, { intentOverride: 'playerConfront', location, context: { topicPerson: pick.firstName } })
      }));
      addOption('Accuse them of lying', () => this._startConversation(survivor, { intentOverride: 'playerAccuse', location }));
    }

    const backBtn = createElement('button', {
      className: 'rect-button alt full',
      onclick: () => this._showTopicSelection(survivor, location)
    }, 'Back');

    optionColumn.appendChild(backBtn);
    parchment.appendChild(optionColumn);
    overlay.querySelector('.conversation-center').appendChild(parchment);
  }

  promptSurvivorPicker({ title, tribeOnly = true, excludeIds = [], onPick, onCancel }) {
    const overlay = this._buildOverlayShell({ firstName: 'Choose' });
    const parchment = this._buildParchment(title || 'Pick a survivor');

    const tribe = this.gameManager.getPlayerTribe?.();
    const pool = tribeOnly ? (tribe?.members || []) : (this.gameManager.survivors || []);

    const buttonColumn = createElement('div', {
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        marginTop: '8px',
        maxHeight: '46vh',
        overflowY: 'auto',
        width: '100%'
      }
    });

    const filtered = pool.filter(s => !excludeIds.includes(s.id) && !s.isPlayer);
    filtered.forEach(target => {
      const btn = createElement('button', {
        className: 'rect-button full',
        onclick: () => {
          this._clearOverlay();
          if (onPick) onPick(target);
        }
      }, target.firstName);
      buttonColumn.appendChild(btn);
    });

    const cancel = createElement('button', {
      className: 'rect-button alt full',
      onclick: () => {
        this._clearOverlay();
        if (onCancel) onCancel();
      }
    }, 'Cancel');

    buttonColumn.appendChild(cancel);
    parchment.appendChild(buttonColumn);
    overlay.querySelector('.conversation-center').appendChild(parchment);
  }

  _promptTargetSelection(survivor, location) {
    const overlay = this._buildOverlayShell(survivor);
    const parchment = this._buildParchment('Who do you want to talk about?');

    const tribe = this.gameManager.getPlayerTribe?.();
    const pool = tribe?.members || this.gameManager.survivors || [];
    const targets = pool.filter(s => s.id !== survivor.id);

    const buttonColumn = createElement('div', {
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        marginTop: '8px',
        maxHeight: '46vh',
        overflowY: 'auto',
        width: '100%'
      }
    });

    targets.forEach(target => {
      const btn = createElement('button', {
        className: 'rect-button full',
        onclick: () => {
          this._clearOverlay();
          this._startConversation(survivor, {
            intentOverride: 'gossip',
            isPurpose: false,
            location,
            context: { topicPerson: target.firstName }
          });
        }
      }, target.firstName);
      buttonColumn.appendChild(btn);
    });

    const closeBtn = createElement('button', {
      className: 'rect-button alt full',
      onclick: () => this._clearOverlay()
    }, 'Cancel');

    buttonColumn.appendChild(closeBtn);
    parchment.appendChild(buttonColumn);
    overlay.querySelector('.conversation-center').appendChild(parchment);
  }

  _showDealMenu(survivor, location) {
    const overlay = this._buildOverlayShell(survivor);
    const parchment = this._buildParchment('What kind of deal do you offer?');
    const player = this.gameManager.getPlayerSurvivor?.();

    const options = [
      { key: 'mutualProtection', label: 'Mutual protection' },
      { key: 'voteTogether', label: 'Vote together tonight' },
      { key: 'recruit', label: 'Recruit someone' },
      { key: 'info', label: 'Share information exchange' },
      { key: 'longPact', label: 'Long-term pact' }
    ];

    const buttonColumn = createElement('div', {
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        marginTop: '8px',
        width: '100%'
      }
    });

    options.forEach(opt => {
      const btn = createElement('button', {
        className: 'rect-button full',
        onclick: () => {
          this._clearOverlay();
          if (opt.key === 'recruit') {
            this._promptRecruitSelection(survivor, location);
            return;
          }

          if (opt.key === 'voteTogether') {
            const excludeIds = [survivor.id];
            if (player?.id) excludeIds.push(player.id);
            this.promptSurvivorPicker({
              title: 'Vote together on who?',
              tribeOnly: true,
              excludeIds,
              onPick: pick => {
                const dealContext = this._buildDealContext('voteTogether', survivor, null, pick.firstName);
                this._startConversation(survivor, {
                  intentOverride: 'deal',
                  isPurpose: false,
                  location,
                  context: dealContext
                });
              },
              onCancel: () => this._showDealMenu(survivor, location)
            });
            return;
          }

          const dealContext = this._buildDealContext(opt.key, survivor);
          this._startConversation(survivor, {
            intentOverride: 'deal',
            isPurpose: false,
            location,
            context: dealContext
          });
        }
      }, opt.label);
      buttonColumn.appendChild(btn);
    });

    const cancel = createElement('button', {
      className: 'rect-button alt full',
      onclick: () => this._clearOverlay()
    }, 'Cancel');

    buttonColumn.appendChild(cancel);
    parchment.appendChild(buttonColumn);
    overlay.querySelector('.conversation-center').appendChild(parchment);
  }

  _promptRecruitSelection(survivor, location) {
    const overlay = this._buildOverlayShell(survivor);
    const parchment = this._buildParchment('Who do you want to recruit?');
    const tribe = this.gameManager.getPlayerTribe?.();
    const pool = tribe?.members || this.gameManager.survivors || [];
    const candidates = pool.filter(s => s.id !== survivor.id);

    const buttonColumn = createElement('div', {
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        marginTop: '8px',
        maxHeight: '46vh',
        overflowY: 'auto',
        width: '100%'
      }
    });

    candidates.forEach(target => {
      const btn = createElement('button', {
        className: 'rect-button full',
        onclick: () => {
          this._clearOverlay();
          const dealContext = this._buildDealContext('recruit', survivor, target.firstName);
          this._startConversation(survivor, {
            intentOverride: 'deal',
            isPurpose: false,
            location,
            context: dealContext
          });
        }
      }, target.firstName);
      buttonColumn.appendChild(btn);
    });

    const cancel = createElement('button', {
      className: 'rect-button alt full',
      onclick: () => this._clearOverlay()
    }, 'Cancel');

    buttonColumn.appendChild(cancel);
    parchment.appendChild(buttonColumn);
    overlay.querySelector('.conversation-center').appendChild(parchment);
  }

  _buildDealContext(key, survivor, recruitName = null, voteTarget = null) {
    switch (key) {
      case 'mutualProtection':
        return { dealType: 'mutualProtection', dealTopic: 'watching each other\'s backs', topicPerson: survivor.firstName };
      case 'voteTogether':
        return {
          dealType: 'voteTogether',
          dealTopic: voteTarget ? `voting together tonight on ${voteTarget}` : 'voting together tonight',
          topicPerson: voteTarget || null
        };
      case 'recruit':
        return {
          dealType: 'recruit',
          dealTopic: `bringing ${recruitName} into an alliance`,
          topicPerson: recruitName
        };
      case 'info':
        return { dealType: 'info', dealTopic: 'trading information', topicPerson: null };
      case 'longPact':
      default:
        return { dealType: 'longPact', dealTopic: 'a longer-term pact', topicPerson: null };
    }
  }

  _showNpcApproachOverlay(survivor, location, onAccept) {
    this._highlightNpcIcon(survivor.id, true);
    const overlay = this._buildOverlayShell(survivor);
    const locationLabel = this._formatLocation(location);

    const parchment = this._buildParchment(
      `${survivor.firstName} approaches you${locationLabel ? ` from the ${locationLabel}` : ''}. They want a word.`
    );

    const prompt = createElement('div', {
      style: {
        marginTop: '6px',
        color: '#2b190a',
        fontFamily: 'Survivant, sans-serif',
        lineHeight: 1.4
      }
    }, 'You can talk now or wave them off—but they might take it personally.');
    parchment.appendChild(prompt);

    const buttons = createElement('div', {
      style: {
        display: 'flex',
        gap: '10px',
        marginTop: '12px',
        justifyContent: 'center'
      }
    });

    const accept = () => {
      this._clearApproachTimer();
      onAccept();
    };

    const talkBtn = createElement('button', {
      className: 'rect-button full',
      onclick: accept
    }, 'Talk now');

    const dismissBtn = createElement('button', {
      className: 'rect-button alt full',
      onclick: () => this._handleApproachDeclined(survivor)
    }, 'Maybe later');

    buttons.appendChild(talkBtn);
    buttons.appendChild(dismissBtn);
    parchment.appendChild(buttons);
    overlay.querySelector('.conversation-center').appendChild(parchment);

    this._clearApproachTimer();
    this.approachTimerId = timerManager.setTimeout(`npc-approach-${survivor.id}`, accept, 1800);
  }

  _handleApproachDeclined(survivor) {
    const player = this.gameManager.getPlayerSurvivor?.();
    const relationshipSystem = this.gameManager.systems?.relationshipSystem;
    if (player && relationshipSystem && typeof relationshipSystem.changeRelationship === 'function') {
      relationshipSystem.changeRelationship(player.id, survivor.id, -2);
    }

    this._shiftMood(survivor.id, 'irritated');
    this._highlightNpcIcon(survivor.id, false);
    this._clearOverlay();
  }

  _startConversation(
    survivor,
    { intentOverride = null, isPurpose = false, meeting = null, location = null, context = {} } = {}
  ) {
    const intent = intentOverride || this._chooseIntent(survivor, isPurpose);
    const initiator = context.initiator || 'player';
    const conversationContext = { ...context, initiator, isPurpose, meeting, location };
    const dialogue = this._buildDialogue(intent, survivor, conversationContext);

    if (intent === 'hardStrategy' && !dialogue.context?.topicPerson) {
      const exclude = [survivor.id, this.gameManager.getPlayerSurvivor?.()?.id];
      this.promptSurvivorPicker({
        title: `${survivor.firstName} wants a target. Who do you suggest?`,
        excludeIds: exclude,
        onPick: pick => this._startConversation(survivor, {
          intentOverride: 'hardStrategy',
          isPurpose,
          meeting,
          location,
          context: { ...conversationContext, topicPerson: pick.firstName, stance: 'push' }
        })
      });
      return;
    }

    const overlay = this._buildOverlayShell(survivor);
    const parchment = this._buildParchment(dialogue.text);

    this.activeConversationContext = {
      ...conversationContext,
      topicPerson: dialogue.context?.topicPerson || conversationContext.topicPerson || null,
      allyName: dialogue.context?.allyName || null,
      targetName: dialogue.context?.targetName || null,
      dealTopic: dialogue.context?.dealTopic || null
    };

    const groupArea = createElement('div', {
      style: {
        display: 'flex',
        gap: '6px',
        justifyContent: 'center',
        marginTop: '6px',
        minHeight: '36px'
      }
    });
    parchment.appendChild(groupArea);

    const buttonColumn = createElement('div', {
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        marginTop: '10px',
        maxHeight: '42vh',
        overflowY: 'auto',
        width: '100%'
      }
    });

    dialogue.responses.forEach(option => {
      const btn = createElement('button', {
        className: 'rect-button full',
        onclick: () => this._handleResponse(survivor, intent, option, parchment, meeting)
      }, option.label);
      buttonColumn.appendChild(btn);
    });

    parchment.appendChild(buttonColumn);
    overlay.querySelector('.conversation-center').appendChild(parchment);

    if (meeting) {
      this._highlightNpcIcon(meeting.npcId, false);
    } else {
      this._highlightNpcIcon(survivor.id, false);
    }
  }

  _handleResponse(survivor, intent, option, parchment, meeting) {
    const player = this.gameManager.getPlayerSurvivor?.();
    const relationshipSystem = this.gameManager.systems?.relationshipSystem;
    const socialLog = ensureCampSocialChanges();
    const context = { ...(this.activeConversationContext || {}) };

    const applyContextPatch = patch => {
      if (!patch) return;
      this.activeConversationContext = { ...(this.activeConversationContext || {}), ...patch };
    };

    let finalDealOutcome = null;

    const endConversation = () => {
      this._logConversationOutcome(survivor, intent, option, meeting, this.activeConversationContext || context, finalDealOutcome);
      parchment.style.opacity = 0;
      parchment.style.transform = 'translateY(6px) scale(0.98)';
      setTimeout(() => this._clearOverlay(), 220);
      if (meeting) {
        this.pendingMeetings = this.pendingMeetings.filter(m => m !== meeting);
      }
    };

    const renderMenu = (menu) => {
      clearChildren(parchment);

      const summary = createElement('div', {
        style: {
          marginTop: '12px',
          color: '#2b190a',
          fontFamily: 'Survivant, sans-serif',
          fontSize: '1rem'
        }
      }, menu.text || '');

      parchment.appendChild(summary);

      if (menu.additionalText) {
        const extra = createElement('div', { style: { marginTop: '8px', fontStyle: 'italic' } }, menu.additionalText);
        parchment.appendChild(extra);
      }

      const buttonColumn = createElement('div', {
        style: {
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          marginTop: '12px',
          maxHeight: '46vh',
          overflowY: 'auto',
          width: '100%'
        }
      });

      const buttons = menu.buttons && menu.buttons.length > 0 ? menu.buttons : [
        { label: 'End Conversation', alt: true, end: true }
      ];

      buttons.forEach(btn => {
        const buttonEl = createElement('button', {
          className: `rect-button full${btn.alt ? ' alt' : ''}`,
          onclick: () => {
            if (btn.nextContextPatch) applyContextPatch(btn.nextContextPatch);
            if (typeof btn.onSelect === 'function') {
              btn.onSelect();
            }
            if (btn.nextMenu) {
              renderMenu({ text: btn.nextMenu.text || menu.text, buttons: btn.nextMenu.buttons || [] });
              return;
            }
            if (btn.end) {
              endConversation();
            }
          }
        }, btn.label);
        buttonColumn.appendChild(buttonEl);
      });

      parchment.appendChild(buttonColumn);
    };

    if (player && relationshipSystem && typeof relationshipSystem.changeRelationship === 'function' && typeof survivor?.id !== 'undefined') {
      relationshipSystem.changeRelationship(player.id, survivor.id, option.delta || 0);
    }

    const relationshipDelta = typeof option.relationshipDelta === 'number'
      ? option.relationshipDelta
      : (typeof option.delta === 'number' ? option.delta : null);

    if (relationshipDelta !== null) {
      socialLog.relationship.push({
        id: survivor.id,
        with: survivor.firstName,
        amount: relationshipDelta,
        context: context?.intent || intent || 'interaction'
      });
    }

    const trustDelta = typeof option.trustDelta === 'number'
      ? option.trustDelta
      : (intent === 'trust' && typeof option.delta === 'number' ? option.delta : null);

    if (trustDelta !== null) {
      socialLog.trust.push({
        id: survivor.id,
        with: survivor.firstName,
        amount: trustDelta,
        context: context?.intent || intent || 'interaction'
      });
    }

    const suspicionDelta = typeof option.suspicionDelta === 'number'
      ? option.suspicionDelta
      : ((intent === 'gossip' || intent === 'warning' || intent === 'confrontation') && typeof option.delta === 'number'
        ? option.delta
        : null);

    if (suspicionDelta !== null) {
      socialLog.suspicion.push({
        id: survivor.id,
        with: survivor.firstName,
        amount: suspicionDelta,
        context: context?.intent || intent || 'interaction'
      });
    }

    this._shiftMood(survivor.id, option.mood);
    this._rememberConversation(survivor, intent, option, meeting);

    const targetName = context.topicPerson || context.targetName || this._pickTargetName(survivor, context);
    const allyName = context.allyName || this._pickTrustedAllyName(survivor);
    const dealTopic = context.dealTopic || 'the deal';

    let followupText = option.followup || '';
    followupText = followupText
      .replace('{npc}', survivor.firstName)
      .replace('{target}', targetName || 'someone')
      .replace('{ally}', allyName || 'someone')
      .replace('{dealTopic}', dealTopic);

    const honestyRoll = this._npcHonestyCheck(survivor);

    const dealOutcome = intent === 'deal'
      ? this._evaluateDealResponse(survivor, context, option)
      : null;

    finalDealOutcome = dealOutcome;

    if (!honestyRoll && intent === 'deal' && player?.id) {
      this.gameManager.systems?.socialMemorySystem?.recordLie(survivor.id, player.id, 'fake_agreement', followupText);
    }

    if (dealOutcome) {
      followupText = `${dealOutcome.summary}`;
      if (dealOutcome.delta) {
        relationshipSystem?.changeRelationship?.(player?.id, survivor.id, dealOutcome.delta);
      }
    }

    // Log a deal
    if (dealOutcome || option.dealResult) {
      const dealStatus = dealOutcome?.status || option.dealResult;
      const outcomeMap = {
        accepted: 'agreed',
        agree: 'agreed',
        tentative: 'played_along',
        playAlong: 'played_along',
        declined_politely: 'rejected',
        declined_suspicious: 'rejected',
        counter: 'noncommittal'
      };
      const outcome = outcomeMap[dealStatus] || 'noncommittal';
      const targetName = context?.topicPerson || null;
      socialLog.deals.push({
        with: survivor.firstName,
        dealType: normalizeDealType(context?.dealType || context?.intent || 'voteTogether'),
        target: targetName || null,
        outcome
      });
    }

    // Log gossip
    if (context?.topicPerson && option.gossipEffect) {
      socialLog.gossip.push({
        id: survivor.id,
        with: survivor.firstName,
        about: context.topicPerson,
        effect: option.gossipEffect
      });
    }

    // Log memory tags
    if (option.memoryTags && option.memoryTags.length > 0) {
      socialLog.memory.push({
        id: survivor.id,
        with: survivor.firstName,
        tags: option.memoryTags.slice()
      });
      const socialMemory = this.gameManager.systems?.socialMemory || this.gameManager.systems?.socialMemorySystem;
      option.memoryTags.forEach(t => {
        socialMemory?.storeMemory?.(
          survivor.id,
          t,
          { fromPlayer: true }
        );
      });
    }

    // Log vote shifts
    if (option.voteShift) {
      socialLog.voteShifts.push({
        id: survivor.id,
        with: survivor.firstName,
        target: option.voteShift.target,
        weight: option.voteShift.weight
      });
    }

    let menu = { text: option.nextMenu?.text || followupText, buttons: option.nextMenu?.buttons || null };

    if (option.nextContextPatch) {
      applyContextPatch(option.nextContextPatch);
    }

    if (option.disclosureKind) {
      const pool = (this.gameManager.getPlayerTribe?.()?.members || this.gameManager.survivors || [])
        .filter(s => s.firstName !== survivor.firstName && !s.isPlayer)
        .map(s => s.firstName);
      const disclosure = resolveNpcDisclosure({
        npc: survivor,
        player,
        kind: option.disclosureKind,
        context: { ...context, trueTarget: targetName, availableTargets: pool, relationshipSystem }
      });
      const claimTarget = disclosure.claimedTarget || 'anyone yet';

      if (disclosure.outcome === 'truth') {
        menu.text = `${survivor.firstName} lowers their voice. "If it's me, it's ${claimTarget}."`;
      } else if (disclosure.outcome === 'lie') {
        menu.text = `${survivor.firstName} glances around. "Honestly? ${claimTarget}."`;
      } else {
        menu.text = `${survivor.firstName} shakes their head. "I'm not putting names out yet."`;
      }

      if (disclosure.claimedTarget) {
        applyContextPatch({ topicPerson: disclosure.claimedTarget });
      }

      this.gameManager.systems?.socialMemorySystem?.recordIntel?.({
        from: survivor.firstName,
        kind: 'targetClaim',
        claimedTarget: disclosure.claimedTarget,
        outcome: disclosure.outcome,
        day: this.gameManager.getCurrentDay?.(),
        verified: false
      });

      const followButtons = disclosure.outcome === 'evade'
        ? [
            { label: 'Reassure them', end: true },
            { label: 'Back off', end: true },
            { label: 'Try a different angle', end: true },
            { label: 'End conversation', alt: true, end: true }
          ]
        : [
            { label: 'Encourage the idea (no commitment)', end: true },
            { label: 'Commit to the plan', end: true },
            { label: 'Question it / ask why', end: true },
            { label: 'Counter with another target', onSelect: () => this._handleCounterTarget(survivor, parchment, meeting, context), end: false },
            { label: 'End conversation', alt: true, end: true }
          ];

      menu = { text: menu.text, buttons: followButtons };
    }

    if (option.requiresCounterTarget) {
      this._handleCounterTarget(survivor, parchment, meeting, context);
      return;
    }

    if (dealOutcome && dealOutcome.counter) {
      menu.additionalText = dealOutcome.counter;
    }

    renderMenu(menu);
  }

  _evaluateCounterPitch(npc, context = {}) {
    const player = this.gameManager.getPlayerSurvivor?.();
    const relationship = this._relationshipBetween(player?.id, npc?.id) || 50;
    const memory = this.gameManager.systems?.socialMemorySystem;
    const trustScore = memory?.getTrust?.(npc?.id) ?? 50;
    const reliabilityScore = memory?.getReliability?.(npc?.id) ?? 50;
    const personality = (npc?.personality || npc?.gameplayStyle || '').toLowerCase();
    const deceptive = personality.includes('deceptive') || personality.includes('strategic');
    const loyal = personality.includes('loyal') || personality.includes('honest');

    let score = (relationship * 0.6) + (trustScore * 0.4) + ((reliabilityScore - 50) * 0.15);
    if (context.npcPitchedTarget) score -= 5;
    if (context.counterTarget === context.topicPerson) score += 6;
    score += getRandomInt(-10, 12);

    const roll = Math.random();
    let outcome = 'reject';
    if (score >= 72) {
      outcome = 'agree';
    } else if (score >= 48) {
      if (deceptive && roll < 0.65) outcome = 'playAlong';
      else if (loyal && roll < 0.35) outcome = 'agree';
      else outcome = 'playAlong';
    }

    const agreeLines = [
      `Okay… I can get behind that. But we keep it quiet.`,
      `Fine. ${context.counterTarget} can go. I\'ll push it carefully.`,
      `Sure, that works. Let\'s make it happen.`
    ];
    const hedgeLines = [
      `Maybe. I\'m not promising anything yet—let\'s see how today goes.`,
      `I hear you. I\'ll float it, but I\'m keeping options open.`,
      `Interesting. I\'ll nod along for now, no guarantees.`
    ];
    const rejectLines = [
      `No. That\'s not happening. I\'m set on my name.`,
      `Not buying it. I\'m sticking with my plan.`,
      `I can\'t co-sign that. Pick someone else.`
    ];

    const pickLine = (lines) => lines[getRandomInt(0, lines.length - 1)];

    const outcomeMap = {
      agree: {
        npcLine: pickLine(agreeLines),
        relationshipDelta: 3,
        trustDelta: 4,
        reliabilityDelta: 3
      },
      playAlong: {
        npcLine: pickLine(hedgeLines),
        relationshipDelta: 1,
        trustDelta: 1,
        reliabilityDelta: 2
      },
      reject: {
        npcLine: pickLine(rejectLines),
        relationshipDelta: -3,
        trustDelta: -3,
        reliabilityDelta: -1
      }
    };

    return { outcome, ...outcomeMap[outcome] };
  }

  _handleCounterTarget(survivor, parchment, meeting, context = {}) {
    const player = this.gameManager.getPlayerSurvivor?.();
    const relationshipSystem = this.gameManager.systems?.relationshipSystem;
    const socialMemory = this.gameManager.systems?.socialMemorySystem;
    const socialLog = ensureCampSocialChanges();
    const exclude = [survivor.id];
    if (player?.id) exclude.push(player.id);

    this.promptSurvivorPicker({
      title: 'Counter with who?',
      tribeOnly: true,
      excludeIds: exclude,
      onPick: pick => {
        this.activeConversationContext = {
          ...(this.activeConversationContext || {}),
          ...context,
          topicPerson: pick.firstName,
          stance: 'counter',
          initiator: 'player'
        };

        const counterContext = { ...this.activeConversationContext, counterTarget: pick.firstName };
        const reaction = this._evaluateCounterPitch(survivor, counterContext);

        this._recordMention({
          speaker: 'Player',
          about: pick.firstName,
          context: 'counter_target',
          tone: 'truthful'
        });

        if (player && relationshipSystem && typeof reaction.relationshipDelta === 'number') {
          relationshipSystem.changeRelationship(player.id, survivor.id, reaction.relationshipDelta);
          socialLog.relationship.push({ id: survivor.id, with: survivor.firstName, amount: reaction.relationshipDelta, context: 'counter_pitch' });
        }

        if (typeof reaction.trustDelta === 'number') {
          socialMemory?.adjustTrust?.(survivor.id, reaction.trustDelta);
          socialLog.trust.push({ id: survivor.id, with: survivor.firstName, amount: reaction.trustDelta, context: 'counter_pitch' });
        }

        if (typeof reaction.reliabilityDelta === 'number') {
          socialMemory?.adjustReliability?.(survivor.id, reaction.reliabilityDelta);
          socialLog.reliability.push({ id: survivor.id, with: survivor.firstName, amount: reaction.reliabilityDelta, context: 'counter_pitch' });
        }

        const overlay = this._buildOverlayShell(survivor);
        const parchmentNode = this._buildParchment(
          `You counter with ${pick.firstName} instead. ${survivor.firstName} studies you carefully…`
        );

        const summary = createElement('div', {
          style: {
            marginTop: '12px',
            color: '#2b190a',
            fontFamily: 'Survivant, sans-serif',
            fontSize: '1rem'
          }
        }, `${reaction.npcLine}`);
        parchmentNode.appendChild(summary);

        this._recordMention({
          speaker: survivor.firstName,
          about: pick.firstName,
          context: 'counter_target',
          tone: mapToneFromOutcome(reaction.outcome)
        });

        const column = createElement('div', {
          style: {
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            marginTop: '12px',
            maxHeight: '46vh',
            overflowY: 'auto',
            width: '100%'
          }
        });

        const endConversation = () => {
          this._logConversationOutcome(survivor, 'counter_followup', { label: `counter_${reaction.outcome}` }, meeting, this.activeConversationContext, null);
          this._clearOverlay();
          if (meeting) {
            this.pendingMeetings = this.pendingMeetings.filter(m => m !== meeting);
          }
        };

        const buttons = [
          { label: 'Lock it in and move on', end: true },
          { label: 'Leave it open for now', alt: true, end: true }
        ];

        buttons.forEach(btn => {
          const btnEl = createElement('button', {
            className: `rect-button full${btn.alt ? ' alt' : ''}`,
            onclick: endConversation
          }, btn.label);
          column.appendChild(btnEl);
        });

        parchmentNode.appendChild(column);

        overlay.querySelector('.conversation-center').appendChild(parchmentNode);
        if (meeting) {
          this._highlightNpcIcon(meeting.npcId, false);
        } else {
          this._highlightNpcIcon(survivor.id, false);
        }
      }
    });
  }

  _buildOverlayShell(survivor) {
    this._clearOverlay();
    this._injectConversationStyles();

    const overlay = createElement('div', {
      id: 'conversation-overlay',
      style: {
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        background: 'rgba(0,0,0,0.65)',
        zIndex: 1100,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
        paddingTop: '10px',
        overflowY: 'auto'
      }
    });

    const center = createElement('div', {
      className: 'conversation-center',
      style: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '12px',
        width: 'min(720px, 94%)',
        maxWidth: '720px',
        margin: '0 auto',
        padding: '6px 10px',
        boxSizing: 'border-box'
      }
    });

    const avatarWrapper = createElement('div', {
      style: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center'
      }
    });

    const tribeColor = survivor.tribeColor || survivor.tribe?.tribeColor || '#f8e7c0';
    const avatar = createElement('div', {
      style: {
        width: 'min(120px, 28vw)',
        height: 'min(120px, 28vw)',
        minWidth: '90px',
        minHeight: '90px',
        borderRadius: '50%',
        overflow: 'hidden',
        border: `4px solid ${tribeColor}`,
        boxShadow: '0 4px 10px rgba(0,0,0,0.35)',
        background: '#000'
      }
    });

    const img = createElement('img', {
      src: survivor.avatarUrl,
      alt: survivor.firstName,
      style: {
        width: '100%',
        height: '100%',
        objectFit: 'cover'
      }
    });

    avatar.appendChild(img);

    const name = createElement('div', {
      style: {
        marginTop: '6px',
        color: '#f5d7a0',
        fontFamily: 'Survivant, sans-serif',
        fontSize: '1.1rem',
        textShadow: '0 2px 4px rgba(0,0,0,0.6)'
      }
    }, survivor.firstName);

    avatarWrapper.appendChild(avatar);
    avatarWrapper.appendChild(name);

    center.appendChild(avatarWrapper);
    overlay.appendChild(center);
    document.body.appendChild(overlay);

    this.activeOverlay = overlay;
    return overlay;
  }

  _buildParchment(text) {
    const parchment = createElement('div', {
      className: 'conversation-parchment',
      style: {
        backgroundImage: "url('Assets/parch-portrait.png')",
        backgroundSize: 'cover',
        backgroundRepeat: 'no-repeat',
        padding: '22px 20px 18px',
        width: 'min(92%, 380px)',
        maxWidth: '420px',
        minHeight: '160px',
        maxHeight: '70vh',
        margin: '0 auto',
        boxShadow: '0 10px 20px rgba(0,0,0,0.45)',
        color: '#2b190a',
        fontFamily: 'Survivant, sans-serif',
        fontSize: '1rem',
        lineHeight: '1.4',
        aspectRatio: '3 / 4',
        overflowY: 'auto',
        animation: 'parchmentFadeIn 0.35s ease'
      }
    });

    const textEl = createElement('div', {
      style: {
        textAlign: 'center',
        marginBottom: '8px',
        fontWeight: 'bold'
      }
    }, text);

    parchment.appendChild(textEl);
    return parchment;
  }

  _chooseIntent(survivor, isPurpose) {
    const relationship = this._getRelationshipScore(survivor);
    const mood = this._getMood(survivor.id);
    const gameplayStyle = survivor.gameplayStyle || 'Competitive';

    if (relationship !== null && relationship < 20 && ['angry', 'irritated', 'suspicious'].includes(mood)) {
      return 'confrontation';
    }
    if (relationship !== null && relationship > 65) {
      return isPurpose ? 'protection' : 'bonding';
    }
    if (isPurpose) {
      return this._weightedIntent(['hardStrategy', 'warning', 'manipulation', 'trust'], mood, gameplayStyle);
    }

    return this._weightedIntent(['bonding', 'fun', 'personal', 'lightStrategy', 'gossip', 'campTalk', 'moodCheck', 'wildcard'], mood, gameplayStyle);
  }

  _mapSocialTypeToIntent(type) {
    switch (type) {
      case 'softStrategy':
        return 'lightStrategy';
      case 'bonding':
        return 'bonding';
      case 'targeting':
      case 'groupStrategy':
        return 'hardStrategy';
      case 'warning':
      case 'idolSuspicion':
        return 'warning';
      default:
        return 'bonding';
    }
  }

  _weightedIntent(base, mood, gameplayStyle) {
    const weights = base.reduce((acc, key) => {
      acc[key] = 1;
      return acc;
    }, {});

    if (['Happy', 'happy', 'calm'].includes(mood)) {
      weights.bonding = (weights.bonding || 0) + 2;
      weights.fun = (weights.fun || 0) + 1;
    }
    if (['Paranoid', 'Worried', 'paranoid', 'worried', 'suspicious'].includes(mood)) {
      weights.warning = (weights.warning || 0) + 2;
      weights.gossip = (weights.gossip || 0) + 1;
      weights.hardStrategy = (weights.hardStrategy || 0) + 1;
    }
    if (['Angry', 'angry', 'irritated'].includes(mood)) {
      weights.confrontation = (weights.confrontation || 0) + 3;
    }

    if (gameplayStyle === 'Social Genius') {
      weights.bonding = (weights.bonding || 0) + 2;
      weights.personal = (weights.personal || 0) + 1;
    }
    if (gameplayStyle === 'Shadow Strategist') {
      weights.lightStrategy = (weights.lightStrategy || 0) + 2;
      weights.warning = (weights.warning || 0) + 1;
      weights.manipulation = (weights.manipulation || 0) + 1;
    }
    if (gameplayStyle === 'Competitive' || gameplayStyle === 'Power Player') {
      weights.hardStrategy = (weights.hardStrategy || 0) + 2;
      weights.campTalk = (weights.campTalk || 0) + 1;
    }
    if (gameplayStyle === 'Wildcard') {
      weights.wildcard = (weights.wildcard || 0) + 2;
    }
    if (gameplayStyle === 'Lethal Charmer') {
      weights.manipulation = (weights.manipulation || 0) + 2;
      weights.protection = (weights.protection || 0) + 1;
    }

    const weighted = Object.entries(weights).flatMap(([key, weight]) => Array(Math.max(1, weight)).fill(key));
    return weighted.length ? weighted[getRandomInt(0, weighted.length - 1)] : base[0];
  }

  _buildDialogue(intent, survivor, context = {}) {
    const templatePool = INTENT_TEMPLATES[intent] || ['{npc} talks about the game.'];
    const memory = this.gameManager.systems?.socialMemorySystem;
    const initiator = context.initiator || 'player';
    context.initiator = initiator;
    let line = templatePool[getRandomInt(0, templatePool.length - 1)];
    let safety = 0;
    while (memory?.recentlyUsed?.(survivor.id, line) && safety < 3) {
      line = templatePool[getRandomInt(0, templatePool.length - 1)];
      safety += 1;
    }
    const targetName = context.topicPerson || this._pickTargetName(survivor, context);
    const allyName = context.allyName || this._pickTrustedAllyName(survivor);

    if (intent === 'trust' && allyName) {
      context.allyName = allyName;
    }
    if (intent === 'gossip' && targetName) {
      context.topicPerson = targetName;
    }
    if ((intent === 'hardStrategy' || intent === 'lightStrategy') && targetName) {
      context.topicPerson = targetName;
    }

    let responses = RESPONSE_LIBRARY[intent] || RESPONSE_LIBRARY.bonding;

    if (intent === 'deal') {
      const dealTopic = this._describeDeal(context, survivor);
      context.dealTopic = dealTopic;
      line = `${survivor.firstName} considers your pitch about ${dealTopic}.`;
    } else if (intent === 'hardStrategy') {
      line = this._buildHardStrategyLine(line, initiator, survivor, targetName, allyName, context);
      responses = this._buildHardStrategyResponses(initiator, context);
    } else {
      line = line
        .replace('{npc}', survivor.firstName)
        .replace('{target}', targetName || 'someone')
        .replace('{ally}', allyName || 'no one fully yet');
    }

    if (memory && typeof memory.getMemory === 'function') {
      const mem = memory.getMemory(survivor.id);
      const lastDeal = memory.getLatestDeal?.(survivor.id);
      if (intent === 'deal' && lastDeal) {
        line += ` They remember your last ${lastDeal.type} (${lastDeal.status}).`;
      }
      if (mem?.gossip?.length && intent === 'gossip' && context.topicPerson) {
        line += ` They recall you bringing up ${context.topicPerson} before.`;
      }
    }

    memory?.rememberBeat?.(survivor.id, intent, line);
    return { text: line, responses, context };
  }

  _buildHardStrategyLine(baseLine, initiator, survivor, targetName, allyName, context) {
    const safeTarget = targetName || 'someone';
    if (initiator === 'player') {
      context.npcPitchedTarget = false;
      if (context.stance === 'push') {
        return `You float ${safeTarget} as a potential vote. ${survivor.firstName} reacts, weighing your pitch.`;
      }
      return `You steer the talk toward ${safeTarget}. ${survivor.firstName} listens carefully.`;
    }

    context.npcPitchedTarget = true;
    return baseLine
      .replace('{npc}', survivor.firstName)
      .replace('{target}', safeTarget)
      .replace('{ally}', allyName || 'no one fully yet');
  }

  _buildHardStrategyResponses(initiator, context) {
    if (initiator === 'player') {
      return [
        { label: 'Press the idea', delta: 3, mood: 'focused', followup: 'You push harder on {target}. {npc} gauges your intensity.' },
        { label: 'Play it casual', delta: 1, mood: 'neutral', followup: 'You float {target} more lightly, watching {npc}\'s reaction.' },
        { label: 'Back off', delta: -2, mood: 'calm', followup: 'You ease off the pitch about {target}. {npc} notes your flexibility.' },
        { label: 'Ask who they trust', delta: 0, mood: 'curious', followup: 'You pivot to ask who {npc} trusts right now.' }
      ];
    }

    const base = RESPONSE_LIBRARY.hardStrategy || [];
    if (context.npcPitchedTarget) {
      return base;
    }

    return base.filter(option => option.label !== 'Counter with another target');
  }

  _pickTargetName(survivor, context = {}) {
    if (context.topicPerson) return context.topicPerson;
    const relationshipSystem = this.gameManager.systems?.relationshipSystem;
    const tribe = this.gameManager.getPlayerTribe?.();
    const pool = tribe?.members || this.gameManager.survivors || [];
    const alliance = Array.isArray(survivor.alliance) ? survivor.alliance : [];
    const candidates = pool.filter(s => s.id !== survivor.id && !s.isPlayer);
    if (!candidates.length) return null;

    let worst = null;
    let worstScore = Infinity;
    candidates.forEach(other => {
      if (alliance.includes(other.id)) return;
      const rel = relationshipSystem?.getRelationship?.(survivor.id, other.id);
      const value = typeof rel?.value === 'number' ? rel.value : relationshipSystem?.defaultValue || 50;
      if (value < worstScore) {
        worstScore = value;
        worst = other;
      }
    });

    return (worst && worst.firstName) || null;
  }

  _pickTrustedAllyName(survivor) {
    const relationshipSystem = this.gameManager.systems?.relationshipSystem;
    const tribes = this.gameManager.getTribes?.() || [];
    if (!relationshipSystem || !survivor) return null;

    // Prefer same tribe if possible
    const tribeMembers = tribes.flatMap(t => t.members || []);
    const pool = (tribeMembers.length ? tribeMembers : (this.gameManager.survivors || []))
      .filter(s => s && s.id !== survivor.id);

    if (!pool.length) return null;

    let best = null;
    let bestScore = -Infinity;

    pool.forEach(other => {
      if (!other.id) return;
      const rel = relationshipSystem.getRelationship
        ? relationshipSystem.getRelationship(survivor.id, other.id)
        : null;
      const value = rel ? rel.value : (relationshipSystem.defaultValue || 50);
      if (value > bestScore) {
        bestScore = value;
        best = other;
      }
    });

    if (!best || bestScore < 55) return null;
    return best.firstName;
  }

  _describeDeal(context, survivor) {
    switch (context.dealType) {
      case 'mutualProtection':
        return 'mutual protection until the vote';
      case 'voteTogether': {
        const target = context.topicPerson;
        return target ? `voting together on ${target}` : 'voting together tonight';
      }
      case 'recruit':
        return `bringing ${context.topicPerson || 'someone'} into a pact`;
      case 'info':
        return 'exchanging information and secrets';
      case 'longPact':
      default:
        return 'a longer-term pact';
    }
  }

  _determinePreferredTarget(survivor) {
    const relationshipSystem = this.gameManager.systems?.relationshipSystem;
    const tribe = this.gameManager.getPlayerTribe?.();
    const pool = tribe?.members || this.gameManager.survivors || [];
    const alliance = Array.isArray(survivor.alliance) ? survivor.alliance : [];
    let choice = null;
    let lowest = Infinity;
    pool.forEach(other => {
      if (other.id === survivor.id || other.isPlayer || alliance.includes(other.id)) return;
      const rel = relationshipSystem?.getRelationship?.(survivor.id, other.id);
      const value = typeof rel?.value === 'number' ? rel.value : relationshipSystem?.defaultValue || 50;
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
    return typeof rel?.value === 'number' ? rel.value : relationshipSystem.defaultValue || 50;
  }

  _evaluateDealResponse(survivor, context, option) {
    const player = this.gameManager.getPlayerSurvivor?.();
    const paranoia = survivor.paranoia || 0;
    const awareness = survivor.awareness || 50;
    let score = this._relationshipBetween(player?.id, survivor.id) + (option.delta || 0);

    score -= paranoia * 0.35;
    score += (awareness - 50) * 0.1;

    const preferredTarget = this._determinePreferredTarget(survivor);
    if (context.dealType === 'voteTogether') {
      if (context.topicPerson && context.topicPerson === preferredTarget) score += 10;
      else score -= 6;
    }
    if (context.dealType === 'mutualProtection') {
      score += 5 - Math.max(0, paranoia * 0.2);
    }
    if (context.dealType === 'recruit' && context.topicPerson) {
      const recruitRel = this._relationshipBetween(survivor.id, this._getSurvivorByName(context.topicPerson)?.id);
      score += recruitRel > 55 ? 6 : -4;
    }
    if (context.dealType === 'info') {
      score += awareness > 55 ? 4 : -2;
    }
    if (context.dealType === 'longPact') {
      score += this._relationshipBetween(player?.id, survivor.id) > 60 ? 6 : -3;
    }

    const statuses = [
      { threshold: 78, status: 'accepted', summary: `${survivor.firstName} nods firmly. "I\'m in on ${context.dealTopic}."`, delta: 4 },
      {
        threshold: 62,
        status: 'tentative',
        summary: `${survivor.firstName} cautiously agrees to ${context.dealTopic}, but wants proof.`,
        delta: 2
      },
      {
        threshold: 48,
        status: 'declined_politely',
        summary: `${survivor.firstName} declines ${context.dealTopic} without burning the bridge.`,
        delta: -1
      },
      {
        threshold: 35,
        status: 'counter',
        summary: `${survivor.firstName} seems unsure about ${context.dealTopic}.`,
        delta: 0,
        counter: '"What if we loop in someone else or wait a round?"'
      }
    ];

    let outcome = statuses.find(s => score >= s.threshold);
    if (!outcome) outcome = {
      status: 'declined_suspicious',
      summary: `${survivor.firstName} eyes you warily. "Feels risky. No deal."`,
      delta: -4
    };

    return outcome;
  }

  _getSurvivorByName(name) {
    if (!name) return null;
    const pool = this.gameManager.survivors || [];
    return pool.find(s => s.firstName === name) || null;
  }

  _getRelationshipScore(survivor) {
    const player = this.gameManager.getPlayerSurvivor?.();
    const relationshipSystem = this.gameManager.systems?.relationshipSystem;
    if (!player || !relationshipSystem || typeof relationshipSystem.getRelationship !== 'function') return null;
    const rel = relationshipSystem.getRelationship(player.id, survivor.id);
    return rel ? rel.value : null;
  }

  _getMood(npcId) {
    return this.moods.get(npcId) || 'neutral';
  }

  _recordMention({ speaker, about, context, tone = 'unknown', dayOverride }) {
    if (!about && context !== 'vague_vote') return;
    const socialLog = ensureCampSocialChanges();
    const entry = {
      type: 'mention',
      speaker: speaker || 'Unknown',
      about: about || null,
      context,
      tone
    };
    socialLog.memory.push(entry);

    const memory = this.gameManager.systems?.socialMemorySystem;
    if (memory && typeof memory.recordNamedIntel === 'function' && about) {
      memory.recordNamedIntel({
        about,
        context,
        from: entry.speaker,
        day: dayOverride || this.gameManager.getCurrentDay?.() || this.gameManager.day || 1
      });
    }
  }

  _recordStrategicContext({ speaker, context }) {
    if (!context) return;
    const socialLog = ensureCampSocialChanges();
    socialLog.memory.push({
      type: 'strategic_context',
      speaker: speaker || 'Unknown',
      context,
      tone: 'unknown'
    });
  }

  _npcHonestyCheck(survivor) {
    const player = this.gameManager.getPlayerSurvivor?.();
    const relationship = this._relationshipBetween(player?.id, survivor?.id) || 50;
    let chance = 0.55 + ((relationship - 50) / 100) * 0.3;
    const style = survivor?.gameplayStyle || '';
    if (style.includes('Shadow')) chance -= 0.15;
    if (style.includes('Power') || style.includes('Competitive')) chance -= 0.05;
    if (style.includes('Honest') || style.includes('Loyal')) chance += 0.1;
    chance = Math.min(0.95, Math.max(0.1, chance));
    return Math.random() < chance;
  }

  _shiftMood(npcId, newMood) {
    if (!npcId || !newMood) return;
    this.moods.set(npcId, newMood);
  }

  _rememberConversation(survivor, intent, option, meeting) {
    const memory = this.gameManager.systems?.socialMemorySystem;
    if (!memory || typeof memory.initNPC !== 'function') return;
    memory.initNPC(survivor.id);
    const bucket = memory.memory?.[survivor.id]?.misc;
    if (Array.isArray(bucket)) {
      bucket.push({
        day: this.gameManager.getCurrentDay?.() || this.gameManager.day || 1,
        intent,
        response: option.label,
        meetingType: meeting?.type || 'ad-hoc'
      });
    }
  }

  _logConversationOutcome(survivor, intent, option, meeting, context = {}, dealOutcome = null) {
    const memory = this.gameManager.systems?.socialMemorySystem;
    if (!memory) return;
    if (context.location) {
      memory.recordMeetingContext(survivor.id, context.location);
    }

    const topicName = context.topicPerson || context.targetName;
    const topicSurvivor = this._getSurvivorByName(topicName);
    const player = this.gameManager.getPlayerSurvivor?.();
    const playerId = player?.id;
    const targetId = topicSurvivor?.id;
    const ally = this._getSurvivorByName(context.allyName);
    const speakerName = context?.initiator === 'player' ? 'Player' : survivor.firstName;

    if (topicName) {
      if (intent === 'hardStrategy' || intent === 'lightStrategy') {
        this._recordMention({ speaker: speakerName, about: topicName, context: 'pushed_target', tone: 'truthful' });
      } else if (intent === 'warning') {
        this._recordMention({ speaker: speakerName, about: topicName, context: 'warned_about', tone: 'truthful' });
      } else if (intent === 'gossip') {
        this._recordMention({ speaker: speakerName, about: topicName, context: 'gossip', tone: 'unknown' });
      } else if (intent === 'deal') {
        this._recordMention({ speaker: speakerName, about: topicName, context: 'deal_proposed', tone: mapToneFromOutcome(dealOutcome?.status) });
      }
    } else if (intent === 'lightStrategy' || intent === 'hardStrategy') {
      this._recordStrategicContext({ speaker: speakerName, context: 'vague_vote' });
    }
    switch (intent) {
      case 'trust':
        if (ally?.id) memory.recordTrustStatement(playerId || survivor.id, ally.id, 'positive', 'player_prompt');
        break;
      case 'gossip':
        if (topicSurvivor) {
          const stance = option.label.toLowerCase().includes('defend') ? 'defend' : 'share';
          memory.recordGossip(playerId || survivor.id, survivor.id, targetId, stance, option.memoryTags ? 'flag' : 'rumor');
        }
        break;
      case 'lightStrategy':
      case 'hardStrategy':
        if (targetId) {
          memory.recordTargetRequest(playerId || survivor.id, survivor.id, targetId, intent === 'hardStrategy' ? 'high' : 'soft', context.stance || 'push');
          memory.recordTargetPreference(playerId || survivor.id, targetId, intent === 'hardStrategy' ? 'high' : 'soft', context.stance || 'push');
        }
        break;
      case 'confrontation':
    case 'playerConfront':
    case 'playerAccuse':
        memory.recordConfrontation(survivor.id, playerId, 'tense');
        if (intent === 'playerAccuse' && playerId) {
          memory.recordLie(survivor.id, playerId, 'accusation', option.followup);
        }
        break;
      case 'apology':
        memory.recordApology(survivor.id, playerId, 'sincere');
        break;
      case 'deal': {
        const status = dealOutcome?.status || 'offered';
        memory.recordDeal(playerId || survivor.id, survivor.id, context.dealType || 'unspecified', targetId, status === 'accepted');
        if (status === 'accepted') memory.recordPromise(survivor.id, this.gameManager.getPlayerSurvivor?.().id, context.dealType);
        break;
      }
      default:
        break;
    }
  }

  _highlightNpcIcon(npcId, enable) {
    const icons = document.querySelectorAll(`.npc-icon[data-npc-id="${npcId}"]`);
    icons.forEach(icon => {
      icon.style.boxShadow = enable
        ? '0 0 12px 4px rgba(255, 215, 0, 0.8)'
        : '0 0 6px rgba(0,0,0,0.65)';
    });
  }

  _clearPendingMeetings(applyConsequences) {
    if (applyConsequences) {
      this.pendingMeetings.filter(m => !m.hasTriggered).forEach(m => {
        const npc = this._getSurvivorById(m.npcId);
        if (npc) {
          this._applyMissedMeetingConsequence(npc);
        }
      });
    }
    this.pendingMeetings.forEach(m => this._highlightNpcIcon(m.npcId, false));
    this.pendingMeetings = [];
  }

  _applyMissedMeetingConsequence(npc) {
    const player = this.gameManager.getPlayerSurvivor?.();
    const relationshipSystem = this.gameManager.systems?.relationshipSystem;
    if (!player || !relationshipSystem || typeof relationshipSystem.changeRelationship !== 'function') return;
    relationshipSystem.changeRelationship(player.id, npc.id, -3);
    this._shiftMood(npc.id, 'irritated');
  }

  _getSurvivorById(id) {
    return (this.gameManager.survivors || []).find(s => s.id === id) || null;
  }

  _clearOverlay() {
    this._clearApproachTimer();
    if (this.activeOverlay) {
      this.activeOverlay.remove();
      this.activeOverlay = null;
    }
    this.activeConversationContext = null;
  }

  _clearApproachTimer() {
    if (this.approachTimerId) {
      timerManager.clearTimeout(this.approachTimerId);
      this.approachTimerId = null;
    }
  }

  _formatLocation(location) {
    if (!location) return '';
    const labels = {
      beach: 'beach',
      shelter: 'shelter',
      campfire: 'campfire',
      waterWell: 'water well',
      rocky: 'rocky shore',
      fork1: 'jungle fork',
      fork2: 'jungle path',
      fork3: 'hidden trail',
      treemail: 'tree mail',
      mountainTrail: 'mountain trail',
      jungleTrail: 'jungle trail',
      waterfallTrail: 'waterfall trail',
      firewood: 'firewood pile',
      bamboo: 'bamboo grove',
      fishing: 'fishing spot'
    };
    return labels[location] || location;
  }

  _injectConversationStyles() {
    if (this._stylesInjected || typeof document === 'undefined') return;
    const style = document.createElement('style');
    style.textContent = `
      @keyframes parchmentFadeIn { from { opacity: 0; transform: translateY(8px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
      #conversation-overlay .rect-button { padding: 8px 10px; }
      #conversation-overlay .conversation-parchment { max-width: 440px; }
      @media (max-width: 600px) {
        #conversation-overlay .conversation-parchment { width: 94%; padding: 18px 16px 16px; max-height: 66vh; }
        #conversation-overlay .rect-button { font-size: 0.95rem; }
      }
    `;
    document.head.appendChild(style);
    this._stylesInjected = true;
  }

  _isInCamp() {
    return this.gameManager.gameState === GameState.CAMP;
  }
}

export default ConversationSystem;
