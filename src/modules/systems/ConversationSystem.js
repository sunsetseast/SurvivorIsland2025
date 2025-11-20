import eventManager, { GameEvents } from '../core/EventManager.js';
import { GameState, GamePhase } from '../core/GameManager.js';
import { createElement, clearChildren } from '../utils/DOMUtils.js';
import { getRandomInt } from '../utils/CommonUtils.js';
import timerManager from '../utils/TimerManager.js';

const TOPIC_TO_INTENT = {
  bonding: 'bonding',
  personal: 'personal',
  lightStrategy: 'lightStrategy',
  hardStrategy: 'hardStrategy',
  trust: 'trust',
  talkTarget: 'gossip',
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
    'With intensity, {npc} pushes a plan and watches your reaction.'
  ],
  trust: [
    '{npc} asks softly, "Who do you really trust out here?"',
    '"Give it to me straight," {npc} says. "Who\'s got your back?"'
  ],
  gossip: [
    '{npc} lowers their voice: "Did you hear what {target} said?"',
    '{npc} snickers. "Between us, {target} is acting shady."'
  ],
  confrontation: [
    '{npc} crosses their arms. "You throwing my name around?"',
    'There is tension as {npc} stares you down about rumors.'
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
    { label: 'Ask who they are eyeing', delta: 1, mood: 'neutral', followup: '{npc} keeps cards close but shares a hint.' },
    { label: 'Stay vague', delta: -2, mood: 'suspicious', followup: '{npc} isn\'t sure if you are with them.' }
  ],
  hardStrategy: [
    { label: 'Agree to push the plan', delta: 3, mood: 'focused', followup: 'A pact forms for now.' },
    { label: 'Counter with another target', delta: 1, mood: 'neutral', followup: 'You redirect the heat elsewhere.' },
    { label: 'Refuse to commit', delta: -5, mood: 'irritated', followup: '{npc} questions your loyalty.' }
  ],
  trust: [
    { label: 'Name a trusted ally', delta: 2, mood: 'calm', followup: 'You trade intel carefully.' },
    { label: 'Claim they are your #1', delta: 4, mood: 'happy', followup: '{npc} feels reassured.' },
    { label: 'Dodge the question', delta: -3, mood: 'suspicious', followup: 'Doubt creeps in.' }
  ],
  gossip: [
    { label: 'Lean into the tea', delta: 2, mood: 'fun', followup: 'You both gossip quietly.' },
    { label: 'Defend the target', delta: -3, mood: 'irritated', followup: '{npc} wonders whose side you are on.' },
    { label: 'Steer away', delta: -1, mood: 'neutral', followup: 'The moment fizzles out.' }
  ],
  confrontation: [
    { label: 'Stand your ground', delta: -4, mood: 'angry', followup: 'Tension spikes.' },
    { label: 'Apologize and explain', delta: 3, mood: 'calm', followup: 'It cools the air.' },
    { label: 'Flip it back on them', delta: -2, mood: 'suspicious', followup: 'Now both of you are wary.' }
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
  ]
};

class ConversationSystem {
  constructor(gameManager) {
    this.gameManager = gameManager;
    this.pendingMeetings = [];
    this.activeOverlay = null;
    this.midPhaseTimerId = null;
    this.moods = new Map();
  }

  initialize() {
    eventManager.subscribe(GameEvents.NPC_CONFRONTATION, this._handleNpcConfrontation.bind(this));
    eventManager.subscribe(GameEvents.GAME_PHASE_CHANGED, this._handlePhaseChange.bind(this));
    eventManager.subscribe(GameEvents.CAMP_VIEW_LOADED, this._handleCampViewLoaded.bind(this));
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
      this._startConversation(survivor, { isPurpose: true, meeting: pending, location });
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
        this._startConversation(survivor, { isPurpose: true, meeting, location: viewName });
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
    const topics = [
      { key: 'bonding', label: 'Bonding / get to know them' },
      { key: 'personal', label: 'Share a personal story' },
      { key: 'lightStrategy', label: 'Light strategy' },
      { key: 'hardStrategy', label: 'Hard strategy' },
      { key: 'trust', label: 'Ask who they trust' },
      { key: 'talkTarget', label: 'Talk about someone specific' },
      { key: 'confront', label: 'Confront them' },
      { key: 'apologize', label: 'Apologize' },
      { key: 'mood', label: 'Check on their mood' },
      { key: 'camp', label: 'Talk about camp / challenges' },
      { key: 'humor', label: 'Joke around' }
    ];

    const overlay = this._buildOverlayShell(survivor);
    const parchment = this._buildParchment(`What do you want to talk about with ${survivor.firstName}?`);

    const buttonColumn = createElement('div', {
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        marginTop: '12px'
      }
    });

    topics.forEach(topic => {
      const btn = createElement('button', {
        className: 'rect-button',
        onclick: () => {
          this._clearOverlay();
          const intent = TOPIC_TO_INTENT[topic.key];
          this._startConversation(survivor, { intentOverride: intent, isPurpose: false, location });
        }
      }, topic.label);
      buttonColumn.appendChild(btn);
    });

    const closeBtn = createElement('button', {
      className: 'rect-button alt',
      onclick: () => this._clearOverlay()
    }, 'Never mind');

    buttonColumn.appendChild(closeBtn);
    parchment.appendChild(buttonColumn);
    overlay.querySelector('.conversation-center').appendChild(parchment);
  }

  _startConversation(survivor, { intentOverride = null, isPurpose = false, meeting = null, location = null } = {}) {
    const intent = intentOverride || this._chooseIntent(survivor, isPurpose);
    const dialogue = this._buildDialogue(intent, survivor, { isPurpose, meeting, location });

    const overlay = this._buildOverlayShell(survivor);
    const parchment = this._buildParchment(dialogue.text);

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
        gap: '10px',
        marginTop: '10px'
      }
    });

    dialogue.responses.forEach(option => {
      const btn = createElement('button', {
        className: 'rect-button',
        onclick: () => this._handleResponse(survivor, intent, option, parchment, meeting)
      }, option.label);
      buttonColumn.appendChild(btn);
    });

    parchment.appendChild(buttonColumn);
    overlay.querySelector('.conversation-center').appendChild(parchment);

    if (meeting) {
      this._highlightNpcIcon(meeting.npcId, false);
    }
  }

  _handleResponse(survivor, intent, option, parchment, meeting) {
    const player = this.gameManager.getPlayerSurvivor?.();
    const relationshipSystem = this.gameManager.systems?.relationshipSystem;

    if (player && relationshipSystem && typeof relationshipSystem.changeRelationship === 'function' && typeof survivor?.id !== 'undefined') {
      relationshipSystem.changeRelationship(player.id, survivor.id, option.delta || 0);
    }

    this._shiftMood(survivor.id, option.mood);
    this._rememberConversation(survivor, intent, option, meeting);

    const summary = createElement('div', {
      style: {
        marginTop: '12px',
        color: '#2b190a',
        fontFamily: 'Survivant, sans-serif',
        fontSize: '1rem'
      }
    }, option.followup.replace('{npc}', survivor.firstName));

    clearChildren(parchment);
    parchment.appendChild(summary);

    const closeBtn = createElement('button', {
      className: 'rect-button alt',
      style: { marginTop: '14px' },
      onclick: () => {
        this._clearOverlay();
        if (meeting) {
          this.pendingMeetings = this.pendingMeetings.filter(m => m !== meeting);
        }
      }
    }, 'End Conversation');

    parchment.appendChild(closeBtn);
  }

  _buildOverlayShell(survivor) {
    this._clearOverlay();

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
        paddingTop: '40px'
      }
    });

    const center = createElement('div', {
      className: 'conversation-center',
      style: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '12px',
        width: 'min(720px, 94%)'
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
        width: '110px',
        height: '110px',
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
        padding: '26px 24px 18px',
        width: '100%',
        minHeight: '180px',
        boxShadow: '0 10px 20px rgba(0,0,0,0.45)',
        color: '#2b190a',
        fontFamily: 'Survivant, sans-serif',
        fontSize: '1rem',
        lineHeight: '1.4'
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

  _buildDialogue(intent, survivor, context) {
    const templatePool = INTENT_TEMPLATES[intent] || ['{npc} talks about the game.'];
    const line = templatePool[getRandomInt(0, templatePool.length - 1)];
    const target = this._pickTargetName(survivor);

    const text = line
      .replace('{npc}', survivor.firstName)
      .replace('{target}', target || 'someone');

    const responses = RESPONSE_LIBRARY[intent] || RESPONSE_LIBRARY.bonding;
    return { text, responses };
  }

  _pickTargetName(survivor) {
    const tribe = this.gameManager.getPlayerTribe?.();
    const candidates = tribe?.members?.filter(s => s.id !== survivor.id && !s.isPlayer) || [];
    if (!candidates.length) return null;
    const choice = candidates[getRandomInt(0, candidates.length - 1)];
    return choice.firstName;
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
    if (this.activeOverlay) {
      this.activeOverlay.remove();
      this.activeOverlay = null;
    }
  }

  _isInCamp() {
    return this.gameManager.gameState === GameState.CAMP;
  }
}

export default ConversationSystem;
