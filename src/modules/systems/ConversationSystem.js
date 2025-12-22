import eventManager, { GameEvents } from '../core/EventManager.js';
import { GameState, GamePhase } from '../core/GameManager.js';
import challengeManager from '../core/ChallengeManager.js';
import { createElement, clearChildren } from '../utils/DOMUtils.js';
import { getRandomInt } from '../utils/CommonUtils.js';
import timerManager from '../utils/TimerManager.js';

// DEV NOTE (ConversationSystem)
// - Intents: player-facing actions (pre + post) are enumerated below and drive intent -> NPC response templates.
// - NPC stances: computed after each player intent from relationship, alliance, personality, and memory.
// - Phase gating: pre allows personal/light strategy; post only allows strategic intents + vote planning.
// - Memory logging: _logSocialEvent funnels structured records into SocialMemorySystem for later querying.

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
  let redirectName = null;

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

  const locations = [
    'water well',
    'shelter',
    'firewood pile',
    'beach',
    'tree mail',
    'jungle path'
  ];
  const reasons = [
    'challenge threat',
    'social threat',
    'idol fear',
    'revenge',
    'outsider'
  ];

  const motive = context.reason || reasons[getRandomInt(0, reasons.length - 1)];
  const location = context.location || locations[getRandomInt(0, locations.length - 1)];
  const timeHint = ['early this morning', 'right after the challenge', 'last night', 'during water runs'][getRandomInt(0, 3)];

  if (outcome === 'lie' && claimedTarget && trueTarget && claimedTarget !== trueTarget) {
    redirectName = trueTarget;
  }

  const detail = {
    motive,
    location,
    timeHint,
    pusherName: outcome === 'evade' ? null : (context.pusherName || claimedTarget),
    redirectName,
    demand: trustScore < 45 ? 'trade' : null
  };

  return { outcome, claimedTarget, trueTarget, reasonTag, detail };
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

const PRE_PHASE_INTENTS = {
  bond_smalltalk: 'bond_smalltalk',
  bond_personal: 'bond_personal',
  check_trust: 'check_trust',
  light_strategy: 'light_strategy',
  ask_general_info: 'ask_general_info',
  repair_relationship: 'repair_relationship',
  confront_rumor: 'confront_rumor'
};

const POST_PHASE_INTENTS = {
  ask_intel: 'ask_intel',
  talk_specific_person: 'talk_specific_person',
  idol_suspicion: 'idol_suspicion',
  challenge_performance: 'challenge_performance',
  pitch_target: 'pitch_target',
  deflect_target: 'deflect_target',
  offer_deal_vote_together: 'offer_deal_vote_together',
  offer_deal_share_info: 'offer_deal_share_info',
  offer_deal_protect: 'offer_deal_protect',
  offer_deal_final2: 'offer_deal_final2',
  plant_seed: 'plant_seed',
  verify_story: 'verify_story',
  threaten_pressure: 'threaten_pressure',
  alliance_commitment: 'alliance_commitment'
};

const NPC_STANCES = [
  'supportive',
  'neutral',
  'evasive',
  'suspicious',
  'defensive',
  'hostile',
  'intrigued',
  'committal'
];

const NPC_RESPONSE_TEMPLATES = {
  bond_smalltalk: {
    supportive: [
      '{npc} smiles. "Yeah, we can catch a breath. How are you holding up?"',
      '{npc} leans back. "Nice to talk about something that isn’t chaos."'
    ],
    neutral: [
      '{npc} nods. "It’s been a day. I’m just keeping my head down."',
      '{npc} shrugs. "We’re all just trying to get through today."'
    ],
    evasive: [
      '{npc} gives a quick smile. "I’m fine. Just need to keep moving."'
    ]
  },
  bond_personal: {
    supportive: [
      '{npc} softens. "I respect you saying that. It helps."',
      '{npc} exhales. "Thanks for being real with me."'
    ],
    neutral: [
      '{npc} listens, then nods. "I hear you."'
    ],
    suspicious: [
      '{npc} studies you. "That’s a lot to share out here."'
    ]
  },
  check_trust: {
    supportive: [
      '{npc} nods. "I feel good with you. I’m not looking to make waves."'
    ],
    neutral: [
      '{npc} thinks. "I trust a couple people, but I’m still reading the room."'
    ],
    evasive: [
      '{npc} shakes their head. "I don’t rank trust out loud."'
    ]
  },
  light_strategy: {
    supportive: [
      '{npc} leans in. "I want to keep it calm today, but I’m watching a few names."'
    ],
    neutral: [
      '{npc} shrugs. "Nothing wild yet. I’m keeping my options open."'
    ],
    evasive: [
      '{npc} waves it off. "Too early to lock anything."'
    ]
  },
  ask_general_info: {
    supportive: [
      '{npc} lowers their voice. "People are talking, but it’s still fluid."'
    ],
    neutral: [
      '{npc} nods. "I’ve heard a few names, nothing locked."'
    ],
    evasive: [
      '{npc} shrugs. "Not much to share yet."'
    ]
  },
  confront_rumor: {
    supportive: [
      '{npc} holds up a hand. "I wasn’t pushing your name. I’m not doing that."'
    ],
    defensive: [
      '{npc} stiffens. "I didn’t start that. Don’t put it on me."'
    ],
    hostile: [
      '{npc} glares. "Watch how you come at me."'
    ]
  },
  ask_intel: {
    supportive: [
      '{npc} whispers. "A couple names are floating. I’ll tell you what I know."'
    ],
    neutral: [
      '{npc} nods. "I’ve heard some chatter, but it’s messy."'
    ],
    evasive: [
      '{npc} keeps it vague. "Nothing solid yet."'
    ]
  },
  talk_specific_person: {
    supportive: [
      '{npc} nods. "{subjectName} has been on my radar too."'
    ],
    neutral: [
      '{npc} shrugs. "{subjectName} is hard to read right now."'
    ],
    evasive: [
      '{npc} deflects. "I’m not ready to label {subjectName} yet."'
    ]
  },
  idol_suspicion: {
    supportive: [
      '{npc} whispers. "I could see {subjectName} holding something. Keep it quiet."'
    ],
    neutral: [
      '{npc} tilts their head. "Maybe. I don’t have proof."'
    ],
    evasive: [
      '{npc} shrugs. "Idol talk is everywhere. I don’t know."'
    ]
  },
  challenge_performance: {
    supportive: [
      '{npc} nods. "Yeah, {subjectName} stood out out there."'
    ],
    neutral: [
      '{npc} answers. "{subjectName} had a mixed day."'
    ],
    defensive: [
      '{npc} tightens up. "People are too quick to judge challenges."'
    ]
  },
  pitch_target: {
    supportive: [
      '{npc} nods slowly. "I can see it. We keep it quiet."'
    ],
    intrigued: [
      '{npc} studies you. "Interesting. Let me think on that."'
    ],
    evasive: [
      '{npc} hesitates. "I’m not locking in yet."'
    ],
    hostile: [
      '{npc} frowns. "That’s not my plan."'
    ]
  },
  deflect_target: {
    supportive: [
      '{npc} nods. "I can redirect heat off {subjectName}."'
    ],
    neutral: [
      '{npc} shrugs. "I can try, but people have their own agendas."'
    ],
    evasive: [
      '{npc} leans back. "That’s a risk to take."'
    ]
  },
  offer_deal_vote_together: {
    supportive: [
      '{npc} nods. "I’m in. We vote together on {subjectName}."'
    ],
    committal: [
      '{npc} leans in. "Locked. {subjectName} it is."'
    ],
    evasive: [
      '{npc} hesitates. "I can’t promise that yet."'
    ]
  },
  offer_deal_share_info: {
    supportive: [
      '{npc} nods. "Info for info. That works."'
    ],
    neutral: [
      '{npc} shrugs. "Maybe, but I’m not spilling everything."'
    ]
  },
  offer_deal_protect: {
    supportive: [
      '{npc} nods. "We can watch each other’s backs."'
    ],
    neutral: [
      '{npc} hesitates. "I’ll try, but I’m not promising."'
    ]
  },
  offer_deal_final2: {
    supportive: [
      '{npc} leans in. "Final two? That’s big, but I’m listening."'
    ],
    neutral: [
      '{npc} looks wary. "That’s early, but I’ll keep it in mind."'
    ],
    evasive: [
      '{npc} shakes their head. "Too soon for that."'
    ]
  },
  plant_seed: {
    supportive: [
      '{npc} nods. "I can float that quietly."'
    ],
    intrigued: [
      '{npc} tilts their head. "That might land if we’re subtle."'
    ],
    evasive: [
      '{npc} shrugs. "I’m not sure that sticks yet."'
    ]
  },
  verify_story: {
    supportive: [
      '{npc} answers carefully. "I said it, but I’m not trying to torch anyone."'
    ],
    neutral: [
      '{npc} hesitates. "I’ve heard it, but I didn’t start it."'
    ],
    defensive: [
      '{npc} bristles. "Don’t put words in my mouth."'
    ]
  },
  alliance_commitment: {
    supportive: [
      '{npc} nods. "We’re aligned. Let’s sync on the plan."'
    ],
    committal: [
      '{npc} leans in. "We ride this out together."'
    ],
    evasive: [
      '{npc} keeps it vague. "We’ll see where the numbers land."'
    ]
  }
};

const INTENT_TEMPLATES = {
  bonding: {
    playerLead: [
      'You open up about home. {npc} listens, surprised by the honesty.',
      'You share something real, seeing if {npc} meets you halfway.'
    ],
    npcLead: [
      '{npc} opens up about their family back home. It feels genuine.',
      '{npc} smiles and asks about your story, trying to bridge the gap.'
    ]
  },
  personal: {
    playerLead: [
      'You get personal with {npc}, inviting a real moment.',
      'You tell {npc} something vulnerable. The air softens.'
    ],
    npcLead: [
      '{npc} shares a vulnerable moment, eyes on the fire as they talk.',
      'You and {npc} trade personal stories. It feels like a real connection.'
    ]
  },
  lightStrategy: {
    playerLead: [
      'You keep it light. "Where\'s your head at for the next vote?"',
      'You test the waters about alliances in a hushed tone.'
    ],
    npcLead: [
      '{npc} leans in quietly. "What are you thinking for the next vote?"',
      'In a hushed tone, {npc} tests the waters about alliances.'
    ]
  },
  hardStrategy: {
    playerLead: [
      'You get direct. "We might need to make a move."',
      'You float a name and watch {npc}\'s reaction.'
    ],
    npcLead: [
      '{npc} is direct: "Let\'s make a move. I want {target} out."',
      'With intensity, {npc} pushes a plan on {target} and watches your reaction.'
    ]
  },
  trust: {
    playerLead: [
      'You ask carefully, "Who do you trust most right now?"',
      'You check in on where {npc} feels solid.'
    ],
    npcLead: [
      '{npc} thinks for a moment. "Honestly… I probably trust {ally} the most right now."',
      '"If I\'m being straight with you, {ally} feels the most solid to me," {npc} admits.'
    ]
  },
  gossip: {
    playerLead: [
      'You lower your voice: "Did you hear what {target} said?"',
      'You murmur, "Between us, {target} is acting shady, right?"'
    ],
    npcLead: [
      '{npc} lowers their voice: "Did you hear what {target} said?"',
      '{npc} snickers. "Between us, {target} is acting shady."'
    ]
  },
  confrontation: {
    playerLead: [
      'You square up. "Are you throwing my name around?"',
      'You press {npc} about the rumors making the rounds.'
    ],
    npcLead: [
      '{npc} crosses their arms. "You throwing my name around?"',
      'There is tension as {npc} stares you down about rumors.'
    ]
  },
  playerConfront: {
    playerLead: [
      'You pull {npc} aside. "I heard my name came up. Talk to me."',
      'You step toward {npc}. "If you\'re pushing me, own it."'
    ],
    npcLead: [
      '{npc} pulls you aside. "I heard my name came up. Talk to me."',
      '{npc} steps in close. "If you\'re pushing me, own it."'
    ]
  },
  playerAccuse: {
    playerLead: [
      'You hold eye contact with {npc}. "Feels like you lied to me earlier."',
      'Your voice is low. "{npc}, that story didn\'t add up."'
    ],
    npcLead: [
      '{npc} narrows their eyes. "Feels like you lied to me earlier."',
      '{npc}\'s voice is low. "That story you gave me didn\'t add up."'
    ]
  },
  apology: {
    playerLead: [
      'You bring up old tension. {npc} watches to see if you mean it.',
      'You own your part in the past. {npc} listens closely.'
    ],
    npcLead: [
      '{npc} waits for you to address the past before moving on.',
      'You bring up old tension. {npc} watches to see if you mean it.'
    ]
  },
  moodCheck: {
    playerLead: [
      'You check in on {npc}. Their guard shifts as they consider opening up.',
      'You ask {npc} how they\'re really holding up.'
    ],
    npcLead: [
      '{npc} sighs. "It\'s been a lot. You really want to know?"',
      '{npc} looks worn. "You want the real answer?"'
    ]
  },
  campTalk: {
    playerLead: [
      'You talk camp life and the next challenge with {npc}.',
      'You and {npc} evaluate shelter, fire, and the day ahead.'
    ],
    npcLead: [
      '{npc} chats about camp life and the next challenge.',
      'Together you evaluate shelter, fire, and challenge odds.'
    ]
  },
  fun: {
    playerLead: [
      'You crack a joke about camp and {npc} laughs.',
      'You keep it light and the mood lifts.'
    ],
    npcLead: [
      '{npc} jokes about coconut crabs and you both laugh.',
      'The mood lightens as {npc} tells a ridiculous story.'
    ]
  },
  warning: {
    playerLead: [
      'You warn {npc} quietly: "Be careful around {target}."',
      'You glance around, then warn {npc} about a brewing plot.'
    ],
    npcLead: [
      '{npc} whispers: "Be careful around {target}."',
      'Eyes darting, {npc} warns you about a brewing plot.'
    ]
  },
  manipulation: {
    playerLead: [
      'You flatter {npc}, steering toward your agenda.',
      'You soften the tone to guide {npc} where you want.'
    ],
    npcLead: [
      '{npc} flatters you, guiding the talk toward their agenda.',
      'You sense {npc} steering the conversation to benefit them.'
    ]
  },
  protection: {
    playerLead: [
      'You quietly promise to watch {npc}\'s back.',
      'You offer cover if things get messy tonight.'
    ],
    npcLead: [
      'Quietly, {npc} promises to watch your back at the next vote.',
      '{npc} offers cover if things get messy tonight.'
    ]
  },
  wildcard: {
    playerLead: [
      'You ramble about idols, storms, and goats. It\'s chaos.',
      'You bounce between topics; {npc} tries to keep up.'
    ],
    npcLead: [
      'Out of nowhere, {npc} rambles about idols, storms, and goats.',
      '{npc} pivots between topics; the chaos is real.'
    ]
  },
  allianceInvite: {
    playerLead: [
      'You pull {npc} aside. "I think we should lock something in. You game?"'
    ],
    npcLead: [
      '{npc} glances around, voice low. "Look… I think you and I could work together. Want to lock something in?"'
    ]
  },
  deal: {
    playerLead: [
      'You bring up a deal and watch {npc}\'s face.',
      'You pitch a quiet agreement to {npc}.'
    ],
    npcLead: [
      '{npc} narrows their eyes. "So you want to make a deal?"',
      '{npc} folds their arms, weighing your offer carefully.'
    ]
  },
  askIntel: {
    playerLead: [
      'You lean in. "What are you hearing?"',
      'You keep your voice low. "What have you heard?"'
    ],
    npcLead: [
      '{npc} leans in. "Let me tell you what I\'m hearing."',
      '{npc} pulls you aside. "There\'s some chatter you should know."'
    ]
  },
  talkSpecific: {
    playerLead: [
      'You bring up {target}. "{playerPrompt}"',
      'You ask about {target} in a low voice. "{playerPrompt}"'
    ],
    npcLead: [
      '{npc} brings up {target}. "{npcPrompt}"',
      '{npc} steers the talk to {target}. "{npcPrompt}"'
    ]
  },
  targeting: {
    playerLead: [
      'You ask straight up, "Who are you voting for tonight?"',
      'You go direct. "What name are you putting down?"'
    ],
    npcLead: [
      '{npc} asks low, "Who are you voting for tonight?"',
      '{npc} sizes you up. "What name are you putting down?"'
    ]
  }
};

const RESPONSE_LIBRARY = {
  bonding: [
    { label: 'Lean in and share something too', delta: 5, mood: 'happy', followup: 'You trade a real moment. It feels warmer.' },
    { label: 'Nod but stay guarded', delta: -1, mood: 'neutral', followup: 'You keep it light; {npc} notices the distance.' },
    { label: 'Deflect with humor', delta: 1, mood: 'fun', followup: 'You lighten the vibe. {npc} chuckles.' }
  ],
  bonding_playerLead: [
    { label: 'Ask them to open up back', delta: 4, mood: 'calm', followup: '{npc} shares a little more, meeting you halfway.' },
    { label: 'Let the moment breathe', delta: 1, mood: 'neutral', followup: '{npc} sits with it, offering a small nod.' },
    { label: 'Lighten it with a joke', delta: 2, mood: 'fun', followup: '{npc} laughs, tension easing.' }
  ],
  personal: [
    { label: 'Thank them for sharing', delta: 4, mood: 'calm', followup: 'Trust inches forward.' },
    { label: 'Share your own vulnerability', delta: 6, mood: 'happy', followup: 'A deeper bond forms.' },
    { label: 'Change the subject', delta: -4, mood: 'irritated', followup: 'Walls go back up between you.' }
  ],
  personal_playerLead: [
    { label: 'Ask how they relate', delta: 4, mood: 'calm', followup: '{npc} nods, then adds something real in return.' },
    { label: 'Hold the eye contact', delta: 2, mood: 'neutral', followup: '{npc} takes it in, softer than before.' },
    { label: 'Change the subject gently', delta: -2, mood: 'neutral', followup: 'You move on, but the moment lingers.' }
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
  ],
  askIntel: [
    { label: 'Thanks for the heads-up', delta: 2, mood: 'calm', followup: 'You nod and keep it close.' },
    { label: 'Ask for more detail', delta: 1, mood: 'focused', followup: 'You press gently for specifics.' },
    { label: 'Offer to trade info', delta: 2, mood: 'happy', followup: 'You float a small piece of info in return.' }
  ],
  talkSpecific: [
    { label: 'Take it in and move on', delta: 1, mood: 'neutral', followup: 'You absorb the read and keep it quiet.' },
    { label: 'Ask a quick follow-up', delta: 1, mood: 'focused', followup: 'You ask one more pointed question.' },
    { label: 'Back off for now', delta: 0, mood: 'calm', followup: 'You let it sit for now.' }
  ],
  targeting: [
    { label: 'Share your own name', delta: 2, mood: 'focused', followup: 'You give a name and watch for a reaction.' },
    { label: 'Stay vague', delta: -1, mood: 'suspicious', followup: 'You avoid names; {npc} notices.' },
    { label: 'Counter with another target', delta: 1, mood: 'neutral', followup: 'You float a different name.' }
  ],
  allianceInvite: [
    { key: 'acceptFaithful', label: 'I’m in. Let’s work together.' },
    { key: 'acceptFake', label: 'Sure… I’m in.' },
    { key: 'conditional', label: 'Only if we pull in one more person.' },
    { key: 'softDecline', label: 'Not right now.' },
    { key: 'hardDecline', label: 'No chance.' }
  ],
  confrontSourceResponse: [
    { key: 'heardDirect', label: 'I heard it directly.', nextStep: 'confrontResolve' },
    { key: 'throughSomeone', label: 'It came through someone.', nextStep: 'confrontResolve' },
    { key: 'nameSource', label: 'It was [pick a name].', action: 'pickSource', nextStep: 'confrontResolve' },
    { key: 'refuseSource', label: 'I’m not naming names.', nextStep: 'confrontResolve' },
    { key: 'retract', label: 'Never mind — forget I said anything.', nextStep: 'confrontResolve' }
  ],
  nameDropSource: [
    { key: 'heardSelf', label: 'I heard it myself.', nextStep: 'nameDropAskDetails' },
    { key: 'someoneTold', label: 'Someone told me.', action: 'pickSource', nextStep: 'nameDropSourceResolve' },
    { key: 'refuseSource', label: 'I don’t want to name names.', nextStep: 'nameDropRefuse' },
    { key: 'vagueWarn', label: 'It might be nothing, just be careful.', nextStep: 'nameDropCaution' },
    { key: 'backYou', label: 'I’m telling you because I’ve got your back.', nextStep: 'nameDropSupport' }
  ],
  nameDropDetails: [
    { key: 'dangerous', label: 'They said you’re dangerous.', nextStep: 'nameDropDetailResolve' },
    { key: 'running', label: 'They said you’re running things.', nextStep: 'nameDropDetailResolve' },
    { key: 'tonight', label: 'They said your name for tonight.', nextStep: 'nameDropDetailResolve' },
    { key: 'vague', label: 'It was vague.', nextStep: 'nameDropDetailResolve' }
  ],
  answerQuestion: [
    { key: 'answer', label: 'Answer honestly.', nextStep: 'nav' },
    { key: 'deflect', label: 'Deflect the question.', nextStep: 'nav' },
    { key: 'change', label: 'Change the subject.', nextStep: 'nav' }
  ]
};

const CONVERSATION_FLOWS = {
  confront_rumor: {
    start: 'confrontQuestion',
    steps: {
      confrontQuestion: {
        npcLine: (session, system) => system._buildConfrontQuestionLine(session),
        choiceSetKey: 'confrontSourceResponse',
        nextFromChoice: true
      },
      confrontResolve: {
        npcLine: (session, system, choice) => system._buildConfrontResolutionLine(session, choice),
        next: 'nav'
      },
      nav: { nav: true }
    }
  },
  name_drop: {
    start: 'nameDropReact',
    steps: {
      nameDropReact: {
        npcLine: (session, system) => system._buildNameDropReaction(session),
        choiceSetKey: 'nameDropSource',
        nextFromChoice: true
      },
      nameDropAskDetails: {
        npcLine: (session, system) => system._buildNameDropDetailQuestion(session),
        choiceSetKey: 'nameDropDetails',
        nextFromChoice: true
      },
      nameDropSourceResolve: {
        npcLine: (session, system, choice) => system._buildNameDropSourceResolution(session, choice),
        next: 'nav'
      },
      nameDropRefuse: {
        npcLine: (session, system) => system._buildNameDropRefusalResolution(session),
        next: 'nav'
      },
      nameDropCaution: {
        npcLine: (session, system) => system._buildNameDropCautionResolution(session),
        next: 'nav'
      },
      nameDropSupport: {
        npcLine: (session, system) => system._buildNameDropSupportResolution(session),
        next: 'nav'
      },
      nameDropDetailResolve: {
        npcLine: (session, system, choice) => system._buildNameDropDetailResolution(session, choice),
        next: 'nav'
      },
      nav: { nav: true }
    }
  }
};

const DEFAULT_ALLIANCE_INVITE_THRESHOLD = 60;
const DEFAULT_ALLIANCE_ACCEPT_SCORE_TARGET = 65;

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
    this.state = null;
    this.conversationSession = null;
    this.nodeSession = null;
    this._nodeIdCounter = 0;
  }

  initialize() {
    eventManager.subscribe(GameEvents.NPC_CONFRONTATION, this._handleNpcConfrontation.bind(this));
    eventManager.subscribe(GameEvents.GAME_PHASE_CHANGED, this._handlePhaseChange.bind(this));
    eventManager.subscribe(GameEvents.CAMP_VIEW_LOADED, this._handleCampViewLoaded.bind(this));
    if (typeof window !== 'undefined') {
      window.runConversationQA = () => this._runConversationQA();
    }
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
    this.startConversation({
      npcId: survivor.id,
      phase: options.context?.phase || this._getConversationPhase(),
      socialType: type,
      context: {
        ...(options.context || {}),
        initiatedByNpc: options.initiatedByNpc,
        location: options.location || (typeof window !== 'undefined' ? window?.campScreen?.currentView : null)
      }
    });
  }

  /**
   * Entry point for all conversation flows.
   */
  startConversation({ npcId, phase, socialType = null, context = {} }) {
    if (!npcId || !this._isInCamp()) return;
    const survivor = this._getSurvivorById(npcId);
    if (!survivor) return;

    const normalizedPhase = this._normalizePhase(phase);
    const location = context.location || (typeof window !== 'undefined' ? window?.campScreen?.currentView : null);
    const initiator = context.initiatedByNpc ? 'npc' : (context.initiator || 'player');
    const intent = socialType ? this._mapSocialTypeToIntent(socialType, normalizedPhase) : null;
    const seededContext = { ...context };
    if (intent === POST_PHASE_INTENTS.idol_suspicion && !seededContext.subTopic) {
      seededContext.subTopic = 'idol';
    }

    this.state = {
      npcId: survivor.id,
      phase: normalizedPhase,
      topic: null,
      lastIntent: null,
      lastSubjectId: null,
      lastNpcStance: null,
      history: [],
      context: { ...seededContext }
    };

    const beginConversation = () => {
      if (intent) {
        this._startConversation(survivor, {
          intentOverride: intent,
          isPurpose: true,
          meeting: null,
          location,
          context: { ...(seededContext || {}), initiator, phase: normalizedPhase }
        });
      } else {
        this._showTopicSelection(survivor, location);
      }
    };

    if (seededContext.initiatedByNpc) {
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

    const isPostChallenge = this.gameManager.getGamePhase?.() === GamePhase.POST_CHALLENGE;
    const player = this.gameManager.getPlayerSurvivor?.();
    const allianceSystem = this.gameManager.systems?.allianceSystem;
    const hasAlliance = !!(player?.id && allianceSystem?.areAllied?.(player.id, survivor.id));
    const categories = isPostChallenge
      ? [
          { key: 'askIntel', label: 'Ask What They’re Hearing' },
          { key: 'talkSpecific', label: 'Talk About Someone Specific' },
          { key: 'pitch', label: 'Pitch a Target' },
          { key: 'deflect', label: 'Deflect Your Name' },
          { key: 'idol', label: 'Idol Suspicion' },
          { key: 'challenge', label: 'Challenge Performance Talk' },
          { key: 'deal', label: 'Offer a Deal' },
          { key: 'verify', label: 'Verify a Story / Press Details' },
          { key: 'seed', label: 'Plant a Seed' },
          ...(hasAlliance ? [{ key: 'alliance', label: 'Alliance Commitment' }] : [])
        ]
      : [
          { key: 'bonding', label: 'Personal / Bonding' },
          { key: 'trust', label: 'Trust Check' },
          { key: 'light', label: 'Light Strategy' },
          { key: 'rumors', label: 'General Rumors' },
          { key: 'camp', label: 'Camp Life / Morale' },
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

    this.state = {
      ...(this.state || {}),
      npcId: survivor.id,
      topic: null
    };
  }

  _showCategoryMenu(survivor, location, category) {
    this._clearOverlay();
    const overlay = this._buildOverlayShell(survivor);
    const parchment = this._buildParchment(`Dig deeper with ${survivor.firstName}`);
    const phase = this._getConversationPhase();

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

    if (category === 'bonding') {
      addOption('Short bonding line', () => this._startConversation(survivor, { intentOverride: PRE_PHASE_INTENTS.bond_smalltalk, location, context: { phase } }));
      addOption('Share something personal', () => this._startConversation(survivor, { intentOverride: PRE_PHASE_INTENTS.bond_personal, location, context: { phase } }));
      addOption('Thank them for help', () => this._startConversation(survivor, { intentOverride: PRE_PHASE_INTENTS.bond_personal, location, context: { phase, gratitude: true } }));
      addOption('Want to chat later?', () => this._startConversation(survivor, { intentOverride: PRE_PHASE_INTENTS.bond_smalltalk, location, context: { phase, followUpLater: true } }));
    } else if (category === 'trust') {
      addOption('Who do you feel good with?', () => this._startConversation(survivor, { intentOverride: PRE_PHASE_INTENTS.check_trust, location, context: { phase } }));
      addOption('How do you feel about me?', () => this._startConversation(survivor, { intentOverride: PRE_PHASE_INTENTS.check_trust, location, context: { phase, trustCheck: true } }));
      addOption('Vibe check', () => this._startConversation(survivor, { intentOverride: 'moodCheck', location, context: { phase } }));
    } else if (category === 'light') {
      addOption('Anyone rubbing people wrong?', () => this._startConversation(survivor, { intentOverride: PRE_PHASE_INTENTS.light_strategy, location, context: { phase } }));
      addOption('Are you feeling safe today?', () => this._startConversation(survivor, { intentOverride: PRE_PHASE_INTENTS.light_strategy, location, context: { phase, safetyCheck: true } }));
      addOption('Quick strategy pulse', () => this._startConversation(survivor, { intentOverride: PRE_PHASE_INTENTS.light_strategy, location, context: { phase, pulseCheck: true } }));
    } else if (category === 'rumors') {
      addOption('What have you heard?', () => this._startConversation(survivor, { intentOverride: PRE_PHASE_INTENTS.ask_general_info, location, context: { phase, initiator: 'player' } }));
      addOption('Any idol rumors?', () => this._startConversation(survivor, {
        intentOverride: POST_PHASE_INTENTS.idol_suspicion,
        location,
        context: { phase, initiator: 'player', subTopic: 'idol' }
      }));
      addOption('Who’s close?', () => this._startConversation(survivor, { intentOverride: PRE_PHASE_INTENTS.ask_general_info, location, context: { phase, initiator: 'player', closenessCheck: true } }));
      addOption('Talk about someone specific', () => this.promptSurvivorPicker({
        title: 'Talk about who?',
        tribeOnly: true,
        excludeIds: [survivor.id, this.gameManager.getPlayerSurvivor?.()?.id],
        onPick: pick => this._showSpecificTopicMenu(survivor, location, pick, { phase, returnCategory: category })
      }));
    } else if (category === 'camp') {
      addOption('Talk camp life', () => this._startConversation(survivor, { intentOverride: 'campTalk', location, context: { phase } }));
      addOption('Check morale', () => this._startConversation(survivor, { intentOverride: 'moodCheck', location, context: { phase } }));
      addOption('Keep it light', () => this._startConversation(survivor, { intentOverride: 'fun', location, context: { phase } }));
    } else if (category === 'askIntel') {
      addOption('Ask what they’ve heard', () => this._startConversation(survivor, { intentOverride: POST_PHASE_INTENTS.ask_intel, location, context: { phase, initiator: 'player' } }));
    } else if (category === 'talkSpecific') {
      addOption('Pick a name to discuss', () => this.promptSurvivorPicker({
        title: 'Talk about who?',
        tribeOnly: true,
        excludeIds: [survivor.id, this.gameManager.getPlayerSurvivor?.()?.id],
        onPick: pick => this._showSpecificTopicMenu(survivor, location, pick, { phase, returnCategory: category })
      }));
    } else if (category === 'deal') {
      addOption('Offer a deal', () => this._showDealMenu(survivor, location));
    } else if (category === 'seed') {
      addOption('Plant a subtle seed', () => this.promptSurvivorPicker({
        title: 'Plant a seed about who?',
        tribeOnly: true,
        excludeIds: [survivor.id, this.gameManager.getPlayerSurvivor?.()?.id],
        onPick: pick => this._startConversation(survivor, {
          intentOverride: POST_PHASE_INTENTS.plant_seed,
          location,
          context: { topicPerson: pick.firstName, topicId: pick.id, phase, initiator: 'player' }
        })
      }));
    } else if (category === 'deflect') {
      addOption('Deflect heat from someone', () => this._showDeflectMenu(survivor, location, { phase }));
    } else if (category === 'idol') {
      addOption('Compare idol suspicions', () => this.promptSurvivorPicker({
        title: 'Suspicious about who?',
        tribeOnly: true,
        excludeIds: [survivor.id, this.gameManager.getPlayerSurvivor?.()?.id],
        onPick: pick => this._startConversation(survivor, {
          intentOverride: POST_PHASE_INTENTS.idol_suspicion,
          location,
          context: { topicPerson: pick.firstName, topicId: pick.id, phase, initiator: 'player', subTopic: 'idol' }
        })
      }));
    } else if (category === 'verify') {
      addOption('Verify a story', () => this._showVerifyStoryMenu(survivor, location, { phase }));
    } else if (category === 'challenge') {
      addOption('Talk challenge performance', () => this._showChallengePerformanceMenu(survivor, location, { phase }));
    } else if (category === 'alliance') {
      addOption('Check alliance commitment', () => this._startConversation(survivor, { intentOverride: POST_PHASE_INTENTS.alliance_commitment, location, context: { phase, initiator: 'player' } }));
      addOption('Plan vote together', () => this._showDealMenu(survivor, location));
      addOption('Swap alliance intel', () => this._startConversation(survivor, { intentOverride: POST_PHASE_INTENTS.ask_intel, location, context: { phase, initiator: 'player' } }));
    } else if (category === 'confront') {
      const canApologize = this._playerHasRecentNegativeAction();
      if (canApologize) {
        addOption('Apologize', () => this._startConversation(survivor, { intentOverride: PRE_PHASE_INTENTS.repair_relationship, location, context: { phase } }));
      }
      addOption('I heard you mentioned my name', () => this._startConversation(survivor, { intentOverride: PRE_PHASE_INTENTS.confront_rumor, location, context: { phase } }));
      addOption('Why did you say that about me?', () => this._startConversation(survivor, { intentOverride: PRE_PHASE_INTENTS.confront_rumor, location, context: { phase, pressure: true } }));
    } else if (category === 'pitch') {
      addOption('Pitch a target', () => this.promptSurvivorPicker({
        title: 'Who do you want to pitch?',
        tribeOnly: true,
        excludeIds: [survivor.id, this.gameManager.getPlayerSurvivor?.()?.id],
        onPick: pick => this._startConversation(survivor, {
          intentOverride: POST_PHASE_INTENTS.pitch_target,
          location,
          context: { topicPerson: pick.firstName, topicId: pick.id, phase, initiator: 'player' }
        })
      }));
    }

    this._appendNavButtonsToColumn(optionColumn, {
      canBack: true,
      canChangeTopic: true,
      onBack: () => this._showTopicSelection(survivor, location),
      onChangeTopic: () => this._showTopicSelection(survivor, location)
    });
    parchment.appendChild(optionColumn);
    overlay.querySelector('.conversation-center').appendChild(parchment);

    this.state = {
      ...(this.state || {}),
      npcId: survivor.id,
      topic: category
    };
  }

  promptSurvivorPicker({ title, tribeOnly = true, excludeIds = [], onPick, onCancel, extraOptions = [] }) {
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

    if (!filtered.length) {
      const empty = createElement('div', { style: { marginTop: '8px' } }, 'No valid targets right now.');
      buttonColumn.appendChild(empty);
    }

    if (Array.isArray(extraOptions) && extraOptions.length) {
      extraOptions.forEach(option => {
        const btn = createElement('button', {
          className: 'rect-button full alt',
          onclick: () => {
            this._clearOverlay();
            if (option.onSelect) option.onSelect();
          }
        }, option.label);
        buttonColumn.appendChild(btn);
      });
    }

    this._appendNavButtonsToColumn(buttonColumn, {
      canBack: true,
      canChangeTopic: true,
      onBack: () => {
        this._clearOverlay();
        if (onCancel) onCancel();
      },
      onChangeTopic: () => {
        this._clearOverlay();
        if (onCancel) onCancel();
      }
    });
    parchment.appendChild(buttonColumn);
    overlay.querySelector('.conversation-center').appendChild(parchment);
  }

  _showSpecificTopicMenu(survivor, location, target, { phase = null, returnCategory = 'exchange' } = {}) {
    this._clearOverlay();
    const overlay = this._buildOverlayShell(survivor);
    const parchment = this._buildParchment(`What do you want to say about ${target.firstName}?`);

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

    const addOption = (label, subTopic) => {
      const btn = createElement('button', {
        className: 'rect-button full',
        onclick: () => {
          this._clearOverlay();
          this._startConversation(survivor, {
            intentOverride: POST_PHASE_INTENTS.talk_specific_person,
            location,
            context: {
              topicPerson: target.firstName,
              topicId: target.id,
              subTopic,
              phase: phase || this._getConversationPhase(),
              initiator: 'player'
            }
          });
        }
      }, label);
      optionColumn.appendChild(btn);
    };

    addOption('Do you trust them?', 'trustCheck');
    addOption('They did well in the challenge', 'challengePraise');
    addOption('They struggled in the challenge', 'challengeCritique');
    addOption('I think they might have an idol', 'idol');
    addOption('I’ve heard their name', 'nameHeard');
    addOption('I heard they said my name', 'nameMentionedPlayer');
    addOption('I heard they said your name', 'nameDrop');
    addOption('I’m considering working with them', 'considerWork');
    addOption('I’m worried they’re dangerous later', 'dangerLater');

    const isPost = (phase || this._getConversationPhase()) === 'post';
    if (isPost) {
      addOption('Would you vote them tonight?', 'voteTonight');
      addOption('Are they driving the vote?', 'drivingVote');
      addOption('Do they have a deal?', 'haveDeal');
    }

    this._appendNavButtonsToColumn(optionColumn, {
      canBack: true,
      canChangeTopic: true,
      onBack: () => this._showCategoryMenu(survivor, location, returnCategory),
      onChangeTopic: () => this._showTopicSelection(survivor, location)
    });
    parchment.appendChild(optionColumn);
    overlay.querySelector('.conversation-center').appendChild(parchment);
  }

  _showChallengePerformanceMenu(survivor, location, { phase = null } = {}) {
    this._clearOverlay();
    const overlay = this._buildOverlayShell(survivor);
    const parchment = this._buildParchment('Talk challenge performance');

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

    const addOption = (label, target = null, tone = null) => {
      const btn = createElement('button', {
        className: 'rect-button full',
        onclick: () => {
          this._clearOverlay();
          this._startConversation(survivor, {
            intentOverride: POST_PHASE_INTENTS.challenge_performance,
            location,
            context: {
              topicPerson: target?.firstName || survivor.firstName,
              topicId: target?.id || survivor.id,
              performanceTone: tone,
              phase: phase || this._getConversationPhase(),
              initiator: 'player'
            }
          });
        }
      }, label);
      optionColumn.appendChild(btn);
    };

    addOption('You crushed it out there.', survivor, 'praise_self');
    addOption('You struggled out there.', survivor, 'critique_self');

    const excludeIds = [survivor.id, this.gameManager.getPlayerSurvivor?.()?.id];
    const tribe = this.gameManager.getPlayerTribe?.();
    const targets = (tribe?.members || []).filter(member => !excludeIds.includes(member.id) && !member.isPlayer);
    targets.forEach(target => {
      addOption(`${target.firstName} really carried us.`, target, 'praise_other');
      addOption(`${target.firstName} slowed us down.`, target, 'critique_other');
    });

    if (!targets.length) {
      const empty = createElement('div', { style: { marginTop: '8px' } }, 'No one else to compare yet.');
      optionColumn.appendChild(empty);
    }

    this._appendNavButtonsToColumn(optionColumn, {
      canBack: true,
      canChangeTopic: true,
      onBack: () => this._showCategoryMenu(survivor, location, 'challenge'),
      onChangeTopic: () => this._showTopicSelection(survivor, location)
    });

    parchment.appendChild(optionColumn);
    overlay.querySelector('.conversation-center').appendChild(parchment);
  }

  _showDeflectMenu(survivor, location, { phase = null } = {}) {
    const excludeIds = [survivor.id, this.gameManager.getPlayerSurvivor?.()?.id];
    this.promptSurvivorPicker({
      title: 'Whose name is coming up?',
      tribeOnly: true,
      excludeIds,
      onPick: (primary) => {
        this.promptSurvivorPicker({
          title: 'Who do you want to pivot toward?',
          tribeOnly: true,
          excludeIds: [...excludeIds, primary.id],
          onPick: (alternate) => {
            this._startConversation(survivor, {
              intentOverride: POST_PHASE_INTENTS.deflect_target,
              location,
              context: {
                topicPerson: primary.firstName,
                topicId: primary.id,
                alternateName: alternate.firstName,
                alternateId: alternate.id,
                phase: phase || this._getConversationPhase(),
                initiator: 'player'
              }
            });
          },
          onCancel: () => this._showCategoryMenu(survivor, location, 'deflect')
        });
      },
      onCancel: () => this._showCategoryMenu(survivor, location, 'deflect')
    });
  }

  _showVerifyStoryMenu(survivor, location, { phase = null } = {}) {
    const excludeIds = [survivor.id, this.gameManager.getPlayerSurvivor?.()?.id];
    this.promptSurvivorPicker({
      title: 'Verify a story about who?',
      tribeOnly: true,
      excludeIds,
      onPick: pick => {
        this._startConversation(survivor, {
          intentOverride: POST_PHASE_INTENTS.verify_story,
          location,
          context: {
            topicPerson: pick.firstName,
            topicId: pick.id,
            phase: phase || this._getConversationPhase(),
            initiator: 'player'
          }
        });
      },
      onCancel: () => this._showCategoryMenu(survivor, location, 'verify')
    });
  }

  _playerHasRecentNegativeAction() {
    const memory = this.gameManager.systems?.socialMemorySystem;
    const player = this.gameManager.getPlayerSurvivor?.();
    if (!memory || !player?.id) return false;
    const record = memory.getMemory?.(player.id);
    const hasLie = record?.lies?.some(lie => !lie.discovered);
    const hasConfront = record?.confrontations?.length;
    const hasPromise = record?.promises?.some(promise => promise.broken);
    return !!(hasLie || hasConfront || hasPromise);
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

    const phase = this._getConversationPhase();
    targets.forEach(target => {
      const btn = createElement('button', {
        className: 'rect-button full',
        onclick: () => {
          this._clearOverlay();
          this._startConversation(survivor, {
            intentOverride: 'gossip',
            isPurpose: false,
            location,
            context: { topicPerson: target.firstName, phase }
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
    const phase = this._getConversationPhase();

    const options = [
      { key: 'voteTogether', label: 'Vote together tonight' },
      { key: 'info', label: 'Share info' },
      { key: 'mutualProtection', label: 'Protect each other' },
      { key: 'final2', label: 'Final 2' }
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
                  intentOverride: POST_PHASE_INTENTS.offer_deal_vote_together,
                  isPurpose: false,
                  location,
                  context: { ...dealContext, phase }
                });
              },
              onCancel: () => this._showDealMenu(survivor, location)
            });
            return;
          }

          const dealContext = this._buildDealContext(opt.key, survivor);
          this._startConversation(survivor, {
            intentOverride: opt.key === 'info'
              ? POST_PHASE_INTENTS.offer_deal_share_info
              : opt.key === 'final2'
                ? POST_PHASE_INTENTS.offer_deal_final2
                : POST_PHASE_INTENTS.offer_deal_protect,
            isPurpose: false,
            location,
            context: { ...dealContext, phase }
          });
        }
      }, opt.label);
      buttonColumn.appendChild(btn);
    });

    this._appendNavButtonsToColumn(buttonColumn, {
      canBack: true,
      canChangeTopic: true,
      onBack: () => this._showCategoryMenu(survivor, location, 'deal'),
      onChangeTopic: () => this._showTopicSelection(survivor, location)
    });
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

    const phase = this._getConversationPhase();
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
            context: { ...dealContext, phase }
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
      case 'info':
        return { dealType: 'info', dealTopic: 'sharing information', topicPerson: null };
      case 'final2':
        return { dealType: 'final2', dealTopic: 'a final two deal', topicPerson: null };
      default:
        return { dealType: 'mutualProtection', dealTopic: 'watching each other\'s backs', topicPerson: survivor.firstName };
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
    const phase = context.phase || this._getConversationPhase();
    const conversationContext = { ...context, initiator, isPurpose, meeting, location, phase };

    const flowKey = this._resolveConversationFlow(intent, conversationContext);
    if (flowKey) {
      this._startNodeFlowConversation(survivor, flowKey, conversationContext, intent);
      return;
    }

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

    this._startNodeConversation(survivor, {
      intent,
      dialogue,
      meeting,
      context: {
        ...conversationContext,
        topicPerson: dialogue.context?.topicPerson || conversationContext.topicPerson || null,
        allyName: dialogue.context?.allyName || null,
        targetName: dialogue.context?.targetName || null,
        dealTopic: dialogue.context?.dealTopic || null,
        intelPayload: dialogue.context?.intelPayload || null,
        subTopic: dialogue.context?.subTopic || conversationContext.subTopic || null,
        targetId: dialogue.context?.targetId || conversationContext.targetId || null
      }
    });
  }

  _startNodeConversation(survivor, { intent, dialogue, meeting = null, context = {} }) {
    const player = this.gameManager.getPlayerSurvivor?.();
    const session = this._initNodeSession({
      npcId: survivor.id,
      playerId: player?.id || null,
      intent,
      meeting,
      context
    });

    this.activeConversationContext = context;

    const rootChoices = (dialogue.responses || []).map((option, index) => ({
      id: `root-choice-${index}`,
      label: option.label,
      playerLine: option.playerLine || option.label,
      responseOption: option
    }));

    const rootNodeId = this._registerNode(session, {
      id: 'root',
      text: dialogue.text,
      choices: rootChoices,
      meta: { speaker: context.lastSpeaker || (context.initiator === 'npc' ? 'npc' : 'player') }
    });

    session.rootNodeId = rootNodeId;
    this.nodeSession = session;
    this._renderNode(session, rootNodeId);

    if (meeting) {
      this._highlightNpcIcon(meeting.npcId, false);
    } else {
      this._highlightNpcIcon(survivor.id, false);
    }
  }

  _startNodeFlowConversation(survivor, flowKey, context = {}, intent = null) {
    const player = this.gameManager.getPlayerSurvivor?.();
    const session = this._initNodeSession({
      npcId: survivor.id,
      playerId: player?.id || null,
      intent: intent || flowKey,
      meeting: context.meeting || null,
      context: { ...context }
    });

    this.activeConversationContext = { ...context };
    this.nodeSession = session;
    session.pendingEndConversation = () => {
      this._logConversationOutcome(
        survivor,
        intent || flowKey,
        { label: 'flow_end' },
        session.meeting || null,
        this.activeConversationContext || context,
        null
      );
      this._clearOverlay();
      if (session.meeting) {
        this.pendingMeetings = this.pendingMeetings.filter(m => m !== session.meeting);
      }
    };

    let rootNode = null;
    if (flowKey === 'confront_rumor_nodes') {
      rootNode = this._buildConfrontNodeRoot(session);
    } else if (flowKey === 'name_drop_nodes') {
      rootNode = this._buildNameDropNodeRoot(session);
    } else if (flowKey === 'warning_nodes') {
      rootNode = this._buildWarningNodeRoot(session);
    }

    if (!rootNode) return;
    const rootNodeId = this._registerNode(session, rootNode);
    session.rootNodeId = rootNodeId;
    this._renderNode(session, rootNodeId);

    if (context.meeting) {
      this._highlightNpcIcon(context.meeting.npcId, false);
    } else {
      this._highlightNpcIcon(survivor.id, false);
    }
  }

  _initNodeSession({ npcId, playerId, intent, meeting = null, context = {} }) {
    return {
      sessionId: `node-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      npcId,
      playerId,
      intent,
      meeting,
      context: { ...context },
      nodes: {},
      historyStack: [],
      currentNodeId: null,
      rootNodeId: null,
      history: []
    };
  }

  _createNodeId(prefix = 'node') {
    this._nodeIdCounter += 1;
    return `${prefix}-${Date.now()}-${this._nodeIdCounter}`;
  }

  _registerNode(session, node) {
    if (!session || !node) return null;
    const id = node.id || this._createNodeId();
    session.nodes[id] = {
      id,
      text: node.text,
      choices: Array.isArray(node.choices) ? node.choices : [],
      additionalText: node.additionalText || null,
      meta: node.meta || {}
    };
    return id;
  }

  _renderNode(session, nodeId) {
    if (!session || !nodeId) return;
    const node = session.nodes[nodeId];
    if (!node) return;
    session.currentNodeId = nodeId;

    const npc = this._getSurvivorById(session.npcId);
    if (!npc) return;
    const overlay = this._buildOverlayShell(npc);
    const player = this.gameManager.getPlayerSurvivor?.();
    const context = session.context || {};

    let nodeText = typeof node.text === 'function' ? node.text(session, this) : node.text;
    nodeText = this._formatConversationLine(nodeText || '', npc, context, player);

    if (nodeText) {
      this._appendConversationHistory(session, npc?.firstName || 'NPC', nodeText, ['npc']);
      context.lastSpeaker = node.meta?.speaker || 'npc';
    }

    const parchment = this._buildParchment(nodeText || '');
    if (node.additionalText) {
      const extra = createElement('div', { style: { marginTop: '8px', fontStyle: 'italic' } }, node.additionalText);
      parchment.appendChild(extra);
    }

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

    const choices = this._appendNavChoices(Array.isArray(node.choices) ? node.choices : [], {
      canBack: session.historyStack.length > 0,
      canChangeTopic: true,
      onBack: () => this._goBackNode(session),
      onChangeTopic: () => this._showTopicSelection(npc, context.location),
      onEnd: () => this._endNodeConversation(session)
    });

    choices.forEach(choice => {
      const btn = createElement('button', {
        className: `rect-button full${choice.alt ? ' alt' : ''}`,
        onclick: () => this._handleNodeChoice(session, nodeId, choice)
      }, choice.label);
      buttonColumn.appendChild(btn);
    });

    parchment.appendChild(buttonColumn);
    overlay.querySelector('.conversation-center').appendChild(parchment);
  }

  _handleNodeChoice(session, nodeId, choice) {
    if (!session || !choice) return;
    const npc = this._getSurvivorById(session.npcId);
    if (!npc) return;

    if (choice.playerLine) {
      this._appendConversationHistory(session, 'Player', choice.playerLine, ['player']);
      session.context.lastSpeaker = 'player';
    }

    if (choice.memoryEvent) {
      this._recordStructuredSocialEvent(choice.memoryEvent);
    }

    if (choice.effects) {
      this._applyNodeEffects(session, choice.effects);
    }

    if (choice.action) {
      const handled = this._handleNodeAction(session, nodeId, choice);
      if (handled) return;
    }

    if (choice.responseOption) {
      const { menu, endConversation, action } = this._handleResponse(npc, session.intent, choice.responseOption, session.meeting, session);
      session.pendingEndConversation = endConversation || null;
      if (action === 'offerDealMenu') {
        this._showDealMenu(npc, session.context.location);
        return;
      }
      if (action === 'counterTarget') {
        return;
      }
      if (!menu) {
        return;
      }
      const menuNodeId = this._registerNode(session, this._buildNodeFromMenu(menu, session.intent, session.context));
      this._transitionToNode(session, menuNodeId);
      return;
    }

    if (choice.nextContextPatch) {
      this.activeConversationContext = { ...(this.activeConversationContext || {}), ...choice.nextContextPatch };
      session.context = { ...(session.context || {}), ...choice.nextContextPatch };
    }

    if (typeof choice.onSelect === 'function') {
      const result = choice.onSelect();
      if (result && typeof result === 'object' && (result.text || result.buttons)) {
        const nextNodeId = this._registerNode(session, this._buildNodeFromMenu(result, session.intent, session.context));
        this._transitionToNode(session, nextNodeId);
        return;
      }
    }

    if (choice.nextMenu) {
      const nextNodeId = this._registerNode(session, this._buildNodeFromMenu(choice.nextMenu, session.intent, session.context));
      this._transitionToNode(session, nextNodeId);
      return;
    }

    if (choice.end) {
      this._endNodeConversation(session);
      return;
    }

    if (choice.nextNode) {
      const nextNodeId = this._registerNode(session, choice.nextNode);
      this._transitionToNode(session, nextNodeId);
      return;
    }

    if (choice.nextNodeId) {
      this._transitionToNode(session, choice.nextNodeId);
      return;
    }
  }

  _transitionToNode(session, nextNodeId) {
    if (!session || !nextNodeId) return;
    if (session.currentNodeId) {
      session.historyStack.push(session.currentNodeId);
    }
    this._renderNode(session, nextNodeId);
  }

  _goBackNode(session) {
    if (!session || session.historyStack.length === 0) return;
    const previousNodeId = session.historyStack.pop();
    this._renderNode(session, previousNodeId);
  }

  _endNodeConversation(session) {
    if (session?.pendingEndConversation) {
      session.pendingEndConversation();
      session.pendingEndConversation = null;
      return;
    }
    this._clearOverlay();
    if (session?.meeting) {
      this.pendingMeetings = this.pendingMeetings.filter(m => m !== session.meeting);
    }
  }

  _buildNodeFromMenu(menu = {}, intent, context) {
    const buttons = Array.isArray(menu.buttons) && menu.buttons.length
      ? [...menu.buttons]
      : this._buildDefaultFollowupChoices(intent, context);

    return {
      text: menu.text || '',
      additionalText: menu.additionalText || null,
      choices: buttons.map((btn, index) => ({
        id: `menu-choice-${index}`,
        label: btn.label,
        playerLine: btn.playerLine || btn.label,
        nextMenu: btn.nextMenu || null,
        onSelect: btn.onSelect,
        end: btn.end,
        action: btn.action,
        nextContextPatch: btn.nextContextPatch,
        nextNode: btn.nextNode || null
      }))
    };
  }

  _applyNodeEffects(session, effects = {}) {
    const npc = this._getSurvivorById(session.npcId);
    const player = this.gameManager.getPlayerSurvivor?.();
    const relationshipSystem = this.gameManager.systems?.relationshipSystem;
    const memory = this.gameManager.systems?.socialMemorySystem;
    const socialLog = ensureCampSocialChanges();

    if (effects.relationshipDelta && relationshipSystem && player && npc) {
      relationshipSystem.changeRelationship(player.id, npc.id, effects.relationshipDelta);
      socialLog.relationship.push({ id: npc.id, with: npc.firstName, amount: effects.relationshipDelta, context: effects.context || 'node' });
    }

    if (effects.trustDelta && memory && npc) {
      memory.adjustTrust?.(npc.id, effects.trustDelta);
      socialLog.trust.push({ id: npc.id, with: npc.firstName, amount: effects.trustDelta, context: effects.context || 'node' });
    }

    if (effects.suspicionDelta && npc) {
      socialLog.suspicion.push({ id: npc.id, with: npc.firstName, amount: effects.suspicionDelta, context: effects.context || 'node' });
    }
  }

  _handleNodeAction(session, nodeId, choice) {
    if (choice.action === 'goBack') {
      this._goBackNode(session);
      return true;
    }

    if (choice.action === 'changeTopic') {
      const npc = this._getSurvivorById(session.npcId);
      this._showTopicSelection(npc, session.context.location);
      return true;
    }

    if (choice.action === 'endConversation') {
      this._endNodeConversation(session);
      return true;
    }

    if (choice.action === 'askFollowup') {
      const followNode = this._buildDetailNode(session);
      const nextNodeId = this._registerNode(session, followNode);
      this._transitionToNode(session, nextNodeId);
      return true;
    }

    if (choice.action === 'tradeInfo') {
      const tradeNodeId = this._registerNode(session, this._buildTradeInfoNode(session));
      this._transitionToNode(session, tradeNodeId);
      return true;
    }

    if (choice.action === 'offerDealMenu') {
      const npc = this._getSurvivorById(session.npcId);
      this._showDealMenu(npc, session.context.location);
      return true;
    }

    if (choice.action === 'pitchPlan') {
      const npc = this._getSurvivorById(session.npcId);
      const targetName = session.context.topicPerson;
      const targetId = session.context.topicId || session.context.targetId || null;
      if (targetName) {
        this._startConversation(npc, {
          intentOverride: POST_PHASE_INTENTS.pitch_target,
          location: session.context.location,
          context: {
            topicPerson: targetName,
            topicId: targetId,
            phase: session.context.phase || this._getConversationPhase(),
            initiator: 'player'
          }
        });
        return true;
      }
      this.promptSurvivorPicker({
        title: 'Pitch who?',
        tribeOnly: true,
        excludeIds: [session.npcId, session.playerId].filter(Boolean),
        onPick: pick => {
          this._startConversation(npc, {
            intentOverride: POST_PHASE_INTENTS.pitch_target,
            location: session.context.location,
            context: {
              topicPerson: pick.firstName,
              topicId: pick.id,
              phase: session.context.phase || this._getConversationPhase(),
              initiator: 'player'
            }
          });
        },
        onCancel: () => this._renderNode(session, nodeId)
      });
      return true;
    }

    if (choice.action === 'pickSource') {
      const excludeIds = [session.npcId, session.playerId].filter(Boolean);
      this.promptSurvivorPicker({
        title: choice.pickerTitle || 'Name the source',
        tribeOnly: true,
        excludeIds,
        extraOptions: choice.extraOptions || [],
        onPick: pick => {
          session.context.sourceId = pick.id;
          session.context.sourceName = pick.firstName;
          session.context.sourceLie = !!choice.lie;
          const nextNode = typeof choice.nextNodeBuilder === 'function'
            ? choice.nextNodeBuilder(pick, session, this)
            : choice.nextNode;
          const nextNodeId = this._registerNode(session, nextNode);
          this._transitionToNode(session, nextNodeId);
        },
        onCancel: () => this._renderNode(session, nodeId)
      });
      return true;
    }

    return false;
  }

  _buildDefaultFollowupChoices(intent, context = {}) {
    const phase = context.phase || this._getConversationPhase();
    const base = [
      { label: 'Ask a follow-up', playerLine: 'Can you be more specific?', action: 'askFollowup' }
    ];
    if (phase === 'post') {
      base.push({ label: 'Trade info', playerLine: 'I can trade info.', action: 'tradeInfo' });
      if ([
        POST_PHASE_INTENTS.talk_specific_person,
        POST_PHASE_INTENTS.ask_intel,
        POST_PHASE_INTENTS.plant_seed,
        POST_PHASE_INTENTS.verify_story
      ].includes(intent)) {
        base.push({ label: 'Pitch a plan', playerLine: 'So what’s the plan?', action: 'pitchPlan' });
      }
    } else {
      base.push({ label: 'Share a small rumor', playerLine: 'I’ve heard something too.', action: 'tradeInfo' });
    }
    return base;
  }

  _buildTradeInfoNode(session) {
    const npc = this._getSurvivorById(session.npcId);
    const targetName = session.context.topicPerson || session.context.targetName || 'someone';
    return {
      text: `${npc?.firstName || 'They'} tilts their head. "Alright. What are you offering?"`,
      choices: [
        {
          label: `Float a name (${targetName})`,
          playerLine: `I’ve heard ${targetName} too.`,
          effects: { trustDelta: 2, context: 'trade_info' },
          nextNode: {
            text: `${npc?.firstName || 'They'} nods. "That tracks. Keep me posted."`,
            choices: this._buildDefaultFollowupChoices(session.intent, session.context)
          }
        },
        {
          label: 'Offer a small rumor',
          playerLine: 'There’s a whisper about idols.',
          effects: { trustDelta: 1, context: 'trade_info' },
          nextNode: {
            text: `${npc?.firstName || 'They'} leans in. "Okay, that’s useful."`,
            choices: this._buildDefaultFollowupChoices(session.intent, session.context)
          }
        },
        {
          label: 'Hold back',
          playerLine: 'Let’s keep it light for now.',
          effects: { trustDelta: -1, context: 'trade_info' },
          nextNode: {
            text: `${npc?.firstName || 'They'} exhales. "Then I’ll keep it light too."`,
            choices: this._buildDefaultFollowupChoices(session.intent, session.context)
          }
        }
      ]
    };
  }

  _buildDetailNode(session) {
    const npc = this._getSurvivorById(session.npcId);
    const player = this.gameManager.getPlayerSurvivor?.();
    const context = session.context || {};
    const phase = context.phase || this._getConversationPhase();
    const targetName = context.topicPerson || context.targetName || this._pickTargetName(npc, context) || 'someone';
    const targetId = context.targetId || this._getSurvivorByName(targetName)?.id || null;
    const trustScore = this._getTrustScore(npc, player);

    if (session.intent === POST_PHASE_INTENTS.plant_seed || session.intent === 'warning') {
      const rumor = this._buildRumorPayload(npc, context);
      const proofLine = this._buildWarningProofLine(npc, rumor, trustScore);
      this._recordStructuredSocialEvent({
        type: 'RUMOR_SHARED',
        speakerId: npc?.id || null,
        listenerId: player?.id || null,
        subjectId: rumor.targetId || null,
        data: {
          targetName: rumor.targetName,
          reason: rumor.reason,
          pusherName: rumor.pusherName || null,
          sourceName: rumor.sourceName || null,
          plotPacket: rumor.plotPacket || null,
          confidence: rumor.confidence,
          npcDisclosureOutcome: rumor.disclosure?.outcome || 'evade',
          location: rumor.location || context.location || null
        }
      });
      return {
        text: proofLine,
        choices: this._buildDefaultFollowupChoices(session.intent, context)
      };
    }

    if (session.intent === POST_PHASE_INTENTS.talk_specific_person || session.intent === POST_PHASE_INTENTS.idol_suspicion) {
      if (context.subTopic === 'nameMentionedPlayer') {
        return this._buildNameMentionedPlayerNode(session, { trustScore });
      }

      const detailLine = this._buildTalkSpecificDetailLine(npc, context, { trustScore });
      if (context.subTopic === 'idol' || session.intent === POST_PHASE_INTENTS.idol_suspicion) {
        this._recordStructuredSocialEvent({
          type: 'IDOL_SUSPICION_RAISED',
          speakerId: player?.id || null,
          listenerId: npc?.id || null,
          subjectId: targetId,
          data: { targetName, confidence: Math.min(80, trustScore + 10) }
        });
      }
      if (context.subTopic === 'nameHeard') {
        return {
          text: detailLine,
          choices: [
            {
              label: 'From who?',
              playerLine: 'From who?',
              nextNode: {
                text: `${npc?.firstName || 'They'} says, "${context.location ? `I heard it at the ${context.location}.` : 'It was floating around camp.'}"`,
                choices: this._buildDefaultFollowupChoices(session.intent, context)
              }
            },
            {
              label: 'What are you hearing?',
              playerLine: 'What are you hearing?',
              nextNode: {
                text: `${npc?.firstName || 'They'} answers, "Mostly ${targetName} as a ${trustScore > 60 ? 'late-game threat' : 'safe option'}."`,
                choices: this._buildDefaultFollowupChoices(session.intent, context)
              }
            },
            {
              label: 'Do you buy it?',
              playerLine: 'Do you buy it?',
              nextNode: {
                text: `${npc?.firstName || 'They'} shrugs. "I’m watching it, but nothing locked yet."`,
                choices: this._buildDefaultFollowupChoices(session.intent, context)
              }
            }
          ]
        };
      }
      return {
        text: detailLine,
        choices: this._buildDefaultFollowupChoices(session.intent, context)
      };
    }

    if (session.intent === POST_PHASE_INTENTS.ask_intel || session.intent === PRE_PHASE_INTENTS.ask_general_info || session.intent === 'askIntel') {
      const intelLine = this._buildIntelDetailLine(npc, context, { trustScore });
      this._recordStructuredSocialEvent({
        type: 'RUMOR_SHARED',
        speakerId: npc?.id || null,
        listenerId: player?.id || null,
        subjectId: targetId,
        data: {
          targetName,
          confidence: Math.min(80, trustScore + 5),
          location: context.location || null
        }
      });
      return {
        text: intelLine,
        choices: this._buildDefaultFollowupChoices(session.intent, context)
      };
    }

    if (session.intent === POST_PHASE_INTENTS.challenge_performance) {
      const performance = this._getChallengePerformanceTag(targetId);
      const line = performance === 'mvp'
        ? `${npc?.firstName || 'They'} points out, "${targetName} was the one carrying that puzzle."`
        : performance === 'lvp'
          ? `${npc?.firstName || 'They'} admits, "${targetName} got stuck on the key section."`
          : `${npc?.firstName || 'They'} shrugs. "${targetName} was middle of the pack."`;
      return { text: line, choices: this._buildDefaultFollowupChoices(session.intent, context) };
    }

    return {
      text: `${npc?.firstName || 'They'} shakes their head. "That’s all I’ve got right now."`,
      choices: this._buildDefaultFollowupChoices(session.intent, context)
    };
  }

  _getTrustScore(npc, player) {
    const relationship = this._relationshipBetween(player?.id, npc?.id) || 50;
    const memoryTrust = this.gameManager.systems?.socialMemorySystem?.getTrust?.(npc?.id) ?? 50;
    return Math.round((relationship + memoryTrust) / 2);
  }

  _buildRumorPayload(npc, context = {}) {
    const player = this.gameManager.getPlayerSurvivor?.();
    const availableTargets = this._getAvailableTargetNames(npc);
    const randomTarget = availableTargets.length
      ? availableTargets[getRandomInt(0, availableTargets.length - 1)]
      : 'someone';
    const targetName = context.topicPerson || context.targetName || randomTarget;
    const targetId = context.topicId || this._getSurvivorByName(targetName)?.id || null;
    const timelineOptions = ['tonight', 'next tribal', 'after the merge'];
    const sourceTypes = ['overheard it', 'got told by an ally', 'picked it up in a side chat', 'gut feeling'];
    const plannerPool = availableTargets.filter(name => name && name !== targetName && name !== npc?.firstName);
    const plannerCount = plannerPool.length > 1 ? (Math.random() < 0.55 ? 2 : 1) : (plannerPool.length ? 1 : 0);
    const planners = plannerPool.length
      ? plannerPool.slice(0, plannerCount)
      : [];
    const disclosure = resolveNpcDisclosure({
      npc,
      player,
      kind: 'warning',
      context: {
        trueTarget: targetName,
        availableTargets,
        reason: context.reason || null,
        location: context.location || null
      }
    });
    const confidence = disclosure.outcome === 'truth' ? 75 : disclosure.outcome === 'lie' ? 35 : 45;
    const reason = disclosure.detail?.motive || context.reason || 'social threat';
    const pusherName = disclosure.outcome === 'evade' ? null : disclosure.detail?.pusherName;
    const timeline = context.timeline || timelineOptions[getRandomInt(0, timelineOptions.length - 1)];
    const sourceType = context.sourceType || sourceTypes[getRandomInt(0, sourceTypes.length - 1)];
    const plotPacket = {
      targetName,
      targetId,
      planners: planners.length ? planners : (pusherName ? [pusherName] : []),
      reason,
      timeline,
      sourceType,
      location: disclosure.detail?.location || context.location || null,
      timeHint: disclosure.detail?.timeHint || null,
      confidence
    };

    return {
      targetName,
      targetId,
      reason,
      pusherName,
      sourceName: disclosure.detail?.redirectName || null,
      location: disclosure.detail?.location || context.location || null,
      timeHint: disclosure.detail?.timeHint || null,
      disclosure,
      confidence,
      timeline,
      sourceType,
      plotPacket
    };
  }

  _buildWarningProofLine(npc, rumor, trustScore) {
    if (!rumor) return `${npc?.firstName || 'They'} hesitates. "I can’t go into that."`;
    const packet = rumor.plotPacket || {};
    const details = [];
    const planners = Array.isArray(packet.planners) ? packet.planners.filter(Boolean) : [];
    if (planners.length) {
      details.push(`${planners.join(' & ')} are pushing it`);
    } else if (rumor.pusherName) {
      details.push(`${rumor.pusherName} is pushing it`);
    }
    if (packet.reason) details.push(`it’s about a ${packet.reason} read`);
    if (packet.timeline) details.push(`they’re thinking ${packet.timeline}`);
    if (packet.sourceType) details.push(`I got it because I ${packet.sourceType}`);
    if (packet.location) details.push(`at the ${packet.location}`);
    if (packet.timeHint) details.push(`${packet.timeHint}`);

    const detailCount = trustScore > 70 ? 4 : trustScore > 50 ? 3 : 2;
    const picked = details.filter(Boolean).slice(0, Math.max(2, detailCount));

    if (rumor.disclosure?.outcome === 'evade') {
      return `${npc?.firstName || 'They'} lowers their voice. "I can’t burn names, but ${picked.join(' and ')}."`;
    }
    if (rumor.disclosure?.outcome === 'lie') {
      return `${npc?.firstName || 'They'} leans in. "I heard ${picked.join(' and ')}."`;
    }
    return `${npc?.firstName || 'They'} nods. "Here’s what I know: ${picked.join(' and ')}."`;
  }

  _buildTalkSpecificDetailLine(npc, context = {}, { trustScore = 50 } = {}) {
    const targetName = context.topicPerson || 'someone';
    const subTopic = context.subTopic || 'trustCheck';
    const targetId = context.targetId || this._getSurvivorByName(targetName)?.id || null;
    const targetRel = targetId ? this._relationshipBetween(npc?.id, targetId) : 50;
    const performance = this._getChallengePerformanceTag(targetId);

    if (subTopic === 'nameHeard') {
      if (trustScore > 60) {
        return `${npc?.firstName || 'They'} answers, "It came up at the ${context.location || 'shelter'}. ${targetName} was floated because of ${targetRel < 45 ? 'trust issues' : 'challenge worries'}."`;
      }
      return `${npc?.firstName || 'They'} deflects. "Just scattered whispers. Keep your ears open at the water runs."`;
    }

    if (subTopic === 'idol') {
      return trustScore > 60
        ? `${npc?.firstName || 'They'} says, "I heard ${targetName} was poking around the jungle early."`
        : `${npc?.firstName || 'They'} shrugs. "No proof—just vibes."`;
    }

    if (subTopic === 'challengeCritique' || subTopic === 'challengePraise') {
      if (performance === 'mvp') return `${npc?.firstName || 'They'} adds, "${targetName} was the standout on the puzzle."`;
      if (performance === 'lvp') return `${npc?.firstName || 'They'} adds, "${targetName} got stuck on that last section."`;
      return `${npc?.firstName || 'They'} adds, "${targetName} was steady, nothing wild."`;
    }

    if (subTopic === 'considerWork') {
      return targetRel > 60
        ? `${npc?.firstName || 'They'} says, "${targetName} values loyalty. If you loop them in, make it clean."`
        : `${npc?.firstName || 'They'} warns, "${targetName} drifts. Keep it structured."`;
    }

    if (subTopic === 'dangerLater') {
      if (performance === 'mvp') {
        return `${npc?.firstName || 'They'} agrees. "${targetName} is a challenge threat if we let them go deep."`;
      }
      return targetRel < 45
        ? `${npc?.firstName || 'They'} agrees. "${targetName} beats people at the end if they stay."`
        : `${npc?.firstName || 'They'} hedges. "${targetName} can be scary, but there are bigger threats too."`;
    }

    return `${npc?.firstName || 'They'} adds, "That’s the read I’ve got on ${targetName}."`;
  }

  _buildIntelDetailLine(npc, context = {}, { trustScore = 50 } = {}) {
    const targetName = context.topicPerson || context.targetName || this._pickTargetName(npc, context) || 'someone';
    const disclosure = resolveNpcDisclosure({
      npc,
      player: this.gameManager.getPlayerSurvivor?.(),
      kind: 'intel_detail',
      context: {
        trueTarget: targetName,
        availableTargets: this._getAvailableTargetNames(npc),
        location: context.location
      }
    });

    if (disclosure.outcome === 'truth') {
      return `${npc?.firstName || 'They'} says, "It’s coming from ${disclosure.detail?.pusherName || 'a couple people'} near the ${disclosure.detail?.location || 'shelter'}."`;
    }
    if (disclosure.outcome === 'lie') {
      return `${npc?.firstName || 'They'} claims, "It’s ${disclosure.detail?.pusherName || 'one person'} pushing it after the challenge."`;
    }
    return `${npc?.firstName || 'They'} says, "I’m not naming names, but watch who keeps peeling off with ${targetName}."`;
  }

  _handleResponse(survivor, intent, option, meeting, session) {
    const player = this.gameManager.getPlayerSurvivor?.();
    const relationshipSystem = this.gameManager.systems?.relationshipSystem;
    const socialLog = ensureCampSocialChanges();
    const context = { ...(this.activeConversationContext || {}) };
    const subjectId = context.targetId || context.topicId || this._getSurvivorByName(context.topicPerson)?.id || null;

    if (option?.action === 'offerDealMenu') {
      return { action: 'offerDealMenu' };
    }

    const applyContextPatch = patch => {
      if (!patch) return;
      this.activeConversationContext = { ...(this.activeConversationContext || {}), ...patch };
    };

    let finalDealOutcome = null;

    const endConversation = () => {
      this._logConversationOutcome(survivor, intent, option, meeting, this.activeConversationContext || context, finalDealOutcome);
      this._clearOverlay();
      if (meeting) {
        this.pendingMeetings = this.pendingMeetings.filter(m => m !== meeting);
      }
    };

    if (intent === 'allianceInvite') {
      const menu = this._handleAllianceInviteResponse({
        survivor,
        option,
        meeting,
        context,
        socialLog,
        relationshipSystem,
        player,
        applyContextPatch,
        session
      });
      return { menu, endConversation };
    }

    const targetName = context.topicPerson || context.targetName || this._pickTargetName(survivor, context);
    const allyName = context.allyName || this._pickTrustedAllyName(survivor);
    const dealTopic = context.dealTopic || 'the deal';

    const npcStance = this._computeNpcStance({
      npc: survivor,
      player,
      intent,
      subjectId,
      context
    });

    this.state = {
      ...(this.state || {}),
      lastIntent: intent,
      lastSubjectId: subjectId,
      lastNpcStance: npcStance
    };

    const baseDelta = this._getIntentRelationshipDelta(intent, npcStance);
    const appliedDelta = typeof option.delta === 'number' ? option.delta : baseDelta;

    if (player && relationshipSystem && typeof relationshipSystem.changeRelationship === 'function' && typeof survivor?.id !== 'undefined') {
      relationshipSystem.changeRelationship(player.id, survivor.id, appliedDelta || 0);
    }

    const relationshipDelta = typeof option.relationshipDelta === 'number'
      ? option.relationshipDelta
      : (typeof option.delta === 'number' ? option.delta : (typeof baseDelta === 'number' ? baseDelta : null));

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
      : (intent === 'trust' && typeof appliedDelta === 'number' ? appliedDelta : null);

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
      : ((intent === 'gossip' || intent === 'warning' || intent === 'confrontation') && typeof appliedDelta === 'number'
        ? appliedDelta
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

    let followupText = option.followup || this._pickNpcResponse(intent, npcStance, {
      subjectName: targetName,
      npcName: survivor.firstName
    }, survivor);
    followupText = followupText
      .replace('{npc}', survivor.firstName)
      .replace('{target}', targetName || 'someone')
      .replace('{ally}', allyName || 'someone')
      .replace('{dealTopic}', dealTopic)
      .replace('{subjectName}', targetName || 'someone');

    const honestyRoll = this._npcHonestyCheck(survivor);

    const dealOutcome = this._isDealIntent(intent)
      ? this._evaluateDealResponse(survivor, context, option)
      : null;

    finalDealOutcome = dealOutcome;

    if (!honestyRoll && this._isDealIntent(intent) && player?.id) {
      this.gameManager.systems?.socialMemorySystem?.recordLie(survivor.id, player.id, 'fake_agreement', followupText);
      this._logSocialEvent({
        type: 'LIE_TOLD',
        speakerId: survivor.id,
        listenerId: player.id,
        subjectId,
        data: { context: 'fake_agreement' }
      });
    }

    if (dealOutcome) {
      followupText = `${dealOutcome.summary}`;
      if (dealOutcome.delta) {
        relationshipSystem?.changeRelationship?.(player?.id, survivor.id, dealOutcome.delta);
      }
    }

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

    if (context?.topicPerson && option.gossipEffect) {
      socialLog.gossip.push({
        id: survivor.id,
        with: survivor.firstName,
        about: context.topicPerson,
        effect: option.gossipEffect
      });
    }

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

    if (option.voteShift) {
      socialLog.voteShifts.push({
        id: survivor.id,
        with: survivor.firstName,
        target: option.voteShift.target,
        weight: option.voteShift.weight
      });
    }

    let menu = { text: option.nextMenu?.text || followupText, buttons: option.nextMenu?.buttons || null };

    const wantsDetail = typeof option.label === 'string'
      && /more detail|press for detail|ask for detail/i.test(option.label);
    if (wantsDetail && session) {
      const detailNode = this._buildDetailNode(session);
      menu = { text: detailNode.text, buttons: detailNode.choices || null };
    }

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
            { label: 'Counter with another target', onSelect: () => this._handleCounterTarget(survivor, meeting, context), end: false },
            { label: 'End conversation', alt: true, end: true }
          ];

      menu = { text: menu.text, buttons: followButtons };
    }

    if (option.requiresCounterTarget) {
      this._handleCounterTarget(survivor, meeting, context);
      return { action: 'counterTarget' };
    }

    if (dealOutcome && dealOutcome.counter) {
      menu.additionalText = dealOutcome.counter;
    }

    return { menu, endConversation };
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

  _handleCounterTarget(survivor, meeting, context = {}) {
    const player = this.gameManager.getPlayerSurvivor?.();
    const relationshipSystem = this.gameManager.systems?.relationshipSystem;
    const socialMemory = this.gameManager.systems?.socialMemorySystem;
    const socialLog = ensureCampSocialChanges();
    const exclude = [survivor.id];
    if (player?.id) exclude.push(player.id);
    if (context.npcProposedTargetId) exclude.push(context.npcProposedTargetId);
    if (context.npcProposedTargetName) {
      const proposed = this._getSurvivorByName(context.npcProposedTargetName);
      if (proposed?.id) exclude.push(proposed.id);
    }

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

  computeAllianceAcceptChance(npc, player, context = {}) {
    const allianceSystem = this.gameManager.systems?.allianceSystem;
    const relationshipSystem = this.gameManager.systems?.relationshipSystem;
    const socialMemory = this.gameManager.systems?.socialMemorySystem;
    const relationship = relationshipSystem?.getRelationship?.(player?.id, npc?.id)?.value;
    let score = typeof relationship === 'number' ? relationship : DEFAULT_ALLIANCE_ACCEPT_SCORE_TARGET;

    if (this.gameManager?.gamePhase === GamePhase.POST_CHALLENGE) {
      score += 10;
    }

    if (context.initiatedByNpc || context.initiator === 'npc') {
      score += 5;
    }

    const alliances = allianceSystem?.getAlliancesForSurvivor?.(npc?.id) || [];
    const hasOtherAlliance = alliances.some(alliance => !alliance.memberIds.includes(player?.id));
    if (hasOtherAlliance) {
      score -= 10;
    }

    const committedAllianceId = allianceSystem?.getCommittedAllianceId?.(npc?.id);
    if (committedAllianceId) {
      const committedAlliance = allianceSystem?.getAlliance?.(committedAllianceId);
      const playerInCommitted = committedAlliance?.memberIds?.includes?.(player?.id);
      if (!playerInCommitted) {
        score -= 10;
      }
    }

    const day = this.gameManager.getCurrentDay?.();
    const recentMemory = socialMemory?.getMemory?.(npc?.id)?.allianceInvites || [];
    const recentRefusal = [...recentMemory].reverse().find(entry => entry.playerId === player?.id && (entry.accepted === false || entry.declineType || (typeof entry.outcome === 'string' && entry.outcome.includes('decline'))));
    if (recentRefusal) {
      const dayDiff = typeof day === 'number' && typeof recentRefusal.day === 'number'
        ? day - recentRefusal.day
        : null;
      if (dayDiff === null || dayDiff <= 2) {
        score -= 15;
      }
    }

    score = Math.max(0, Math.min(100, score));

    let chance = 0.1;
    if (score >= 80) {
      chance = 0.95;
    } else if (score >= 70) {
      chance = 0.8;
    } else if (score >= 60) {
      chance = 0.6;
    } else if (score >= 50) {
      chance = 0.3;
    }

    return { score, chance };
  }

  _handleAllianceInviteResponse({
    survivor,
    option,
    meeting,
    context,
    socialLog,
    relationshipSystem,
    player,
    applyContextPatch,
    session
  }) {
    const allianceSystem = this.gameManager.systems?.allianceSystem;
    const socialMemory = this.gameManager.systems?.socialMemorySystem;
    const playerId = player?.id;
    const location = (this.activeConversationContext?.location || context?.location || null);
    const day = this.gameManager.getCurrentDay?.();
    const alreadyAllied = allianceSystem?.areAllied?.(playerId, survivor.id);
    const initiator = context.initiator || this.activeConversationContext?.initiator || (context.initiatedByNpc ? 'npc' : 'player');
    const initiatedByNpc = initiator === 'npc';
    const relationshipValue = relationshipSystem?.getRelationship?.(playerId, survivor.id)?.value ?? DEFAULT_ALLIANCE_ACCEPT_SCORE_TARGET;
    const computeChance = () => this.computeAllianceAcceptChance(
      survivor,
      player,
      { ...context, initiator, initiatedByNpc }
    );

    const logMemory = ({ outcome, pickedThirdId = null, isFake = false, accepted = false, declineType = null, pitchType = null }) => {
      socialMemory?.recordAllianceInvite?.({
        day,
        location,
        npcId: survivor.id,
        playerId,
        outcome,
        pickedThirdId,
        isFake,
        accepted,
        declineType,
        pitchType,
        proposedBy: initiator
      });
    };

    const bumpRelationship = (fromId, toId, delta, logName) => {
      if (typeof delta !== 'number') return;
      if (relationshipSystem?.changeRelationship && fromId && toId) {
        relationshipSystem.changeRelationship(fromId, toId, delta);
      }
      socialLog.relationship.push({ id: toId, with: logName, amount: delta, context: 'allianceInvite' });
    };

    const createAlliance = (memberIds = []) => {
      if (!allianceSystem?.createAlliance) return null;
      const tribeId = this.gameManager.getPlayerTribe?.()?.id || null;
      const name = this._generateAllianceName();
      return allianceSystem.createAlliance({
        name,
        memberIds,
        tribeId,
        leaderId: survivor.id
      });
    };

    const finishAllianceMenu = ({ text, buttons = [], memoryOutcomePatch = null }) => {
      if (memoryOutcomePatch) {
        logMemory(memoryOutcomePatch);
      }

      const finalButtons = Array.isArray(buttons) ? [...buttons] : [];
      const hasEndConversation = finalButtons.some(btn => btn?.end && btn?.label === 'End Conversation');
      if (!hasEndConversation) {
        finalButtons.push({ label: 'End Conversation', alt: true, end: true });
      }

      return { text, buttons: finalButtons };
    };

    const pushMenu = (menu) => {
      if (!session || !menu) return menu;
      const nodeId = this._registerNode(session, this._buildNodeFromMenu(menu, session.intent, session.context));
      this._transitionToNode(session, nodeId);
      return menu;
    };

    const npcName = survivor.firstName;

    const refuseAlliance = ({ text, declineType = 'soft_decline', pitchType = null }) => {
      this._rememberConversation(survivor, 'allianceInvite', option, meeting);
      this._shiftMood(survivor.id, declineType === 'hard_decline' ? 'irritated' : 'neutral');
      return finishAllianceMenu({
        text,
        memoryOutcomePatch: { outcome: declineType, accepted: false, declineType, pitchType }
      });
    };

    const gateAndRollAcceptance = (pitchType = null) => {
      const rel = relationshipValue;
      if (rel < 40 && !(initiatedByNpc && rel >= 30)) {
        return refuseAlliance({
          text: `${npcName} shakes their head. "I’m not there with you yet."`,
          declineType: 'hard_decline',
          pitchType
        });
      }

      const { chance } = computeChance();
      const roll = Math.random();
      if (roll >= chance) {
        const refusalLine = rel < DEFAULT_ALLIANCE_INVITE_THRESHOLD
          ? `${npcName} frowns. "That’s moving too fast. I don’t fully trust this."`
          : `${npcName} hesitates. "Not sure this is the right move."`;
        return refuseAlliance({ text: refusalLine, declineType: 'soft_decline', pitchType });
      }
      return true;
    };

    if (option.key === 'alreadyAllied' || alreadyAllied) {
      this._rememberConversation(survivor, 'allianceInvite', option, meeting);
      return finishAllianceMenu({
        text: `${npcName} nods. "We’re already locked in. Let’s keep it quiet."`,
        memoryOutcomePatch: { outcome: 'already_allied', accepted: true, pitchType: 'existing' }
      });
    }

    if (option.key === 'acceptFaithful') {
      const gateResult = gateAndRollAcceptance('tight');
      if (gateResult !== true) return gateResult;
      createAlliance([playerId, survivor.id]);
      bumpRelationship(playerId, survivor.id, 6, npcName);
      this._rememberConversation(survivor, 'allianceInvite', option, meeting);
      this._shiftMood(survivor.id, 'happy');
      return finishAllianceMenu({
        text: relationshipValue >= 75
          ? `${npcName} leans in. "I’m with you. Tight."`
          : `${npcName} nods. "Yeah. Let’s do it — quietly."`,
        memoryOutcomePatch: { outcome: 'faithful', accepted: true, pitchType: 'tight' }
      });
    }

    if (option.key === 'acceptFake') {
      const gateResult = gateAndRollAcceptance('casual');
      if (gateResult !== true) return gateResult;
      createAlliance([playerId, survivor.id]);
      bumpRelationship(playerId, survivor.id, 3, npcName);
      this._rememberConversation(survivor, 'allianceInvite', option, meeting);
      this._shiftMood(survivor.id, 'calm');
      return finishAllianceMenu({
        text: `${npcName} smiles, satisfied. "Alright, let’s watch each other’s backs."`,
        memoryOutcomePatch: { outcome: 'fake', isFake: true, accepted: true, pitchType: 'casual' }
      });
    }

    if (option.key === 'conditional') {
      const gateResult = gateAndRollAcceptance('conditional');
      if (gateResult !== true) return gateResult;
      const exclude = [survivor.id];
      if (playerId) exclude.push(playerId);
      this.promptSurvivorPicker({
        title: 'Who do you want to loop in?',
        tribeOnly: true,
        excludeIds: exclude,
        onPick: pick => {
          const thirdId = pick.id;
          const rel = relationshipSystem?.getRelationship?.(survivor.id, thirdId);
          const threshold = allianceSystem?.minRelationshipForInvite || 60;
          const value = typeof rel?.value === 'number' ? rel.value : 50;
          const accepts = value >= threshold;

          if (accepts) {
            createAlliance([playerId, survivor.id, thirdId]);
            bumpRelationship(playerId, survivor.id, 5, npcName);
            bumpRelationship(playerId, thirdId, 2, pick.firstName);
            bumpRelationship(survivor.id, thirdId, 2, pick.firstName);
            this._rememberConversation(survivor, 'allianceInvite', option, meeting);
            this._shiftMood(survivor.id, 'focused');
            pushMenu(finishAllianceMenu({
              text: `${npcName} nods. "${pick.firstName} works. Let’s lock this in."`,
              memoryOutcomePatch: { outcome: 'conditional_accepted', pickedThirdId: thirdId, accepted: true, pitchType: 'conditional' }
            }));
            return;
          }

          applyContextPatch({ topicPerson: pick.firstName });
          const menu = {
            text: `${npcName} shakes their head. "I don’t trust ${pick.firstName}… not yet."`,
            buttons: [
              {
                label: 'Fine, just us.',
                onSelect: () => {
                  createAlliance([playerId, survivor.id]);
                  bumpRelationship(playerId, survivor.id, 5, npcName);
                  this._rememberConversation(survivor, 'allianceInvite', option, meeting);
                  this._shiftMood(survivor.id, 'focused');
                  return finishAllianceMenu({
                    text: `${npcName} exhales. "Just us then. Let’s stay tight."`,
                    memoryOutcomePatch: { outcome: 'conditional_refused_duo', pickedThirdId: thirdId, accepted: true, pitchType: 'duo' }
                  });
                }
              },
              {
                label: 'Then never mind.',
                alt: true,
                onSelect: () => {
                  bumpRelationship(playerId, survivor.id, -2, npcName);
                  this._rememberConversation(survivor, 'allianceInvite', option, meeting);
                  this._shiftMood(survivor.id, 'irritated');
                  return finishAllianceMenu({
                    text: `${npcName} shrugs. "Then let’s drop it."`,
                    memoryOutcomePatch: { outcome: 'conditional_refused_decline', pickedThirdId: thirdId, accepted: false, declineType: 'soft_decline', pitchType: 'conditional' }
                  });
                }
              }
            ]
          };
          pushMenu(menu);
        },
        onCancel: () => {
          this._startConversation(survivor, {
            intentOverride: 'allianceInvite',
            location,
            context: { ...(this.activeConversationContext || {}), initiator: this.activeConversationContext?.initiator || 'npc' }
          });
        }
      });
      return null;
    }

    if (option.key === 'softDecline') {
      bumpRelationship(playerId, survivor.id, -2, npcName);
      this._rememberConversation(survivor, 'allianceInvite', option, meeting);
      this._shiftMood(survivor.id, 'neutral');
      return finishAllianceMenu({
        text: `${npcName} exhales. "Alright, maybe another time."`,
        memoryOutcomePatch: { outcome: 'soft_decline', accepted: false, declineType: 'soft_decline' }
      });
    }

    if (option.key === 'hardDecline') {
      bumpRelationship(playerId, survivor.id, -6, npcName);
      this._rememberConversation(survivor, 'allianceInvite', option, meeting);
      this._shiftMood(survivor.id, 'irritated');
      return finishAllianceMenu({
        text: `${npcName} narrows their eyes. "Got it. I’ll remember that."`,
        memoryOutcomePatch: { outcome: 'hard_decline', accepted: false, declineType: 'hard_decline' }
      });
    }
  }

  _buildAllianceInviteDialogue(survivor, context = {}) {
    const allianceSystem = this.gameManager.systems?.allianceSystem;
    const player = this.gameManager.getPlayerSurvivor?.();
    const alreadyAllied = allianceSystem?.areAllied?.(player?.id, survivor.id);
    const initiator = context.initiator || 'player';
    const text = alreadyAllied
      ? `${survivor.firstName} grins. "We’re already good, right?"`
      : this._pickIntentTemplate('allianceInvite', initiator).replace('{npc}', survivor.firstName);

    const playerInitiatedResponses = [
      { key: 'acceptFaithful', label: 'Ask for a tight alliance together.' },
      { key: 'acceptFake', label: 'Propose working together but keep it casual.' },
      { key: 'conditional', label: 'Suggest looping in one more person.' },
      { key: 'softDecline', label: 'Back off for now.' },
      { key: 'hardDecline', label: 'Never mind, not a fit.' }
    ];

    const responses = alreadyAllied
      ? [{ key: 'alreadyAllied', label: 'Right, we’re solid.' }]
      : (initiator === 'player' ? playerInitiatedResponses : RESPONSE_LIBRARY.allianceInvite);

    return { text, responses, context: { ...context, intent: 'allianceInvite', location: context.location, alreadyAllied } };
  }

  _generateAllianceName() {
    const allianceSystem = this.gameManager.systems?.allianceSystem;
    const alliances = allianceSystem?.getAllAlliances?.() || allianceSystem?.alliances || [];
    let maxNum = 0;
    alliances.forEach(a => {
      const match = typeof a?.name === 'string' ? a.name.match(/Alliance\s+(\d+)/i) : null;
      const num = match ? parseInt(match[1], 10) : 0;
      if (num > maxNum) maxNum = num;
    });
    return `Alliance ${maxNum + 1}`;
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
    const phase = this._getConversationPhase();

    if (relationship !== null && relationship < 20 && ['angry', 'irritated', 'suspicious'].includes(mood)) {
      return 'confrontation';
    }
    if (phase === 'post') {
      const postPool = isPurpose
        ? ['hardStrategy', 'warning', 'manipulation', 'trust', 'targeting', 'askIntel']
        : ['askIntel', 'targeting', 'hardStrategy', 'warning', 'trust', 'manipulation'];
      if (relationship !== null && relationship > 80 && !isPurpose) {
        postPool.push('bonding');
        if (relationship > 88) postPool.push('personal');
      }
      return this._weightedIntent(postPool, mood, gameplayStyle);
    }
    if (relationship !== null && relationship > 65) {
      return isPurpose ? 'protection' : 'bonding';
    }
    if (isPurpose) {
      return this._weightedIntent(['hardStrategy', 'warning', 'manipulation', 'trust'], mood, gameplayStyle);
    }

    return this._weightedIntent(['bonding', 'fun', 'personal', 'lightStrategy', 'gossip', 'campTalk', 'moodCheck', 'wildcard'], mood, gameplayStyle);
  }

  _isConversationDebugEnabled() {
    if (typeof window === 'undefined') return false;
    return Boolean(window.DEBUG_CONVERSATION || window.DEBUG_CONVO || window.gameManager?.debugConversation);
  }

  _getConversationPhase() {
    const override = this.gameManager.conversationPhaseOverride;
    if (override) return this._normalizePhase(override);
    const phase = this.gameManager.getGamePhase?.() || this.gameManager.gamePhase;
    if (phase === GamePhase.POST_CHALLENGE) return 'post';
    if (phase === GamePhase.PRE_CHALLENGE) return 'pre';
    return 'pre';
  }

  _normalizePhase(phase) {
    if (!phase) return this._getConversationPhase();
    const raw = typeof phase === 'string' ? phase.toLowerCase() : phase;
    if (raw === 'post' || raw === GamePhase.POST_CHALLENGE || raw === 'post_challenge') return 'post';
    if (raw === 'pre' || raw === GamePhase.PRE_CHALLENGE || raw === 'pre_challenge') return 'pre';
    return 'pre';
  }

  _mapSocialTypeToIntent(type, phase = 'pre') {
    switch (type) {
      case 'softStrategy':
      case 'lightStrategy':
        return PRE_PHASE_INTENTS.light_strategy;
      case 'bonding':
        return PRE_PHASE_INTENTS.bond_smalltalk;
      case 'personal':
        return PRE_PHASE_INTENTS.bond_personal;
      case 'targeting':
        return POST_PHASE_INTENTS.pitch_target;
      case 'groupStrategy':
        return POST_PHASE_INTENTS.pitch_target;
      case 'warning':
        return POST_PHASE_INTENTS.plant_seed;
      case 'idolSuspicion':
        return POST_PHASE_INTENTS.idol_suspicion;
      case 'allianceInvite':
        return POST_PHASE_INTENTS.alliance_commitment;
      case 'askIntel':
        return POST_PHASE_INTENTS.ask_intel;
      default:
        return phase === 'post' ? POST_PHASE_INTENTS.ask_intel : PRE_PHASE_INTENTS.bond_smalltalk;
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
      weights.askIntel = (weights.askIntel || 0) + 1;
      weights.targeting = (weights.targeting || 0) + 1;
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
    if (intent === POST_PHASE_INTENTS.pitch_target) {
      return this._buildPitchTargetDialogue(survivor, context);
    }
    if (intent === POST_PHASE_INTENTS.deflect_target) {
      return this._buildDeflectDialogue(survivor, context);
    }
    if (intent === POST_PHASE_INTENTS.verify_story) {
      return this._buildVerifyStoryDialogue(survivor, context);
    }
    if (intent === POST_PHASE_INTENTS.challenge_performance) {
      return this._buildChallengePerformanceDialogue(survivor, context);
    }
    if (intent === POST_PHASE_INTENTS.ask_intel) {
      return this._buildAskIntelDialogue(survivor, context);
    }
    if (intent === POST_PHASE_INTENTS.talk_specific_person || intent === POST_PHASE_INTENTS.idol_suspicion) {
      return this._buildTalkSpecificDialogue(survivor, context);
    }
    if (intent === POST_PHASE_INTENTS.alliance_commitment) {
      return this._buildAllianceInviteDialogue(survivor, context);
    }

    const dealIntents = new Set([
      POST_PHASE_INTENTS.offer_deal_vote_together,
      POST_PHASE_INTENTS.offer_deal_share_info,
      POST_PHASE_INTENTS.offer_deal_protect,
      POST_PHASE_INTENTS.offer_deal_final2
    ]);

    if (dealIntents.has(intent)) {
      return this._buildDialogue('deal', survivor, context);
    }

    const legacyIntentMap = {
      [PRE_PHASE_INTENTS.bond_smalltalk]: 'bonding',
      [PRE_PHASE_INTENTS.bond_personal]: 'personal',
      [PRE_PHASE_INTENTS.check_trust]: 'trust',
      [PRE_PHASE_INTENTS.light_strategy]: 'lightStrategy',
      [PRE_PHASE_INTENTS.ask_general_info]: 'askIntel',
      [PRE_PHASE_INTENTS.repair_relationship]: 'apology',
      [PRE_PHASE_INTENTS.confront_rumor]: 'playerConfront',
      [POST_PHASE_INTENTS.plant_seed]: 'warning'
    };

    const resolvedIntent = legacyIntentMap[intent] || intent;

    if (resolvedIntent === 'allianceInvite') {
      return this._buildAllianceInviteDialogue(survivor, context);
    }
    if (resolvedIntent === 'askIntel') {
      return this._buildAskIntelDialogue(survivor, context);
    }
    if (resolvedIntent === 'talkSpecific') {
      return this._buildTalkSpecificDialogue(survivor, context);
    }
    if (resolvedIntent === 'targeting') {
      return this._buildTargetingDialogue(survivor, context);
    }

    const memory = this.gameManager.systems?.socialMemorySystem;
    const initiator = context.initiator || 'player';
    context.initiator = initiator;
    let line = this._pickIntentTemplate(resolvedIntent, initiator);
    let safety = 0;
    while (memory?.recentlyUsed?.(survivor.id, line) && safety < 3) {
      line = this._pickIntentTemplate(resolvedIntent, initiator);
      safety += 1;
    }
    const targetName = context.topicPerson || this._pickTargetName(survivor, context);
    const allyName = context.allyName || this._pickTrustedAllyName(survivor);

    if (resolvedIntent === 'trust' && allyName) {
      context.allyName = allyName;
    }
    if (resolvedIntent === 'gossip' && targetName) {
      context.topicPerson = targetName;
    }
    if ((resolvedIntent === 'hardStrategy' || resolvedIntent === 'lightStrategy') && targetName) {
      context.topicPerson = targetName;
    }

    context.lastSpeaker = initiator === 'npc' ? 'npc' : 'player';
    let responses = this._selectIntentResponses(resolvedIntent, context);

    if (resolvedIntent === 'deal') {
      const dealTopic = this._describeDeal(context, survivor);
      context.dealTopic = dealTopic;
      line = `${survivor.firstName} considers your pitch about ${dealTopic}.`;
    } else if (resolvedIntent === 'hardStrategy') {
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
      if (resolvedIntent === 'deal' && lastDeal) {
        line += ` They remember your last ${lastDeal.type} (${lastDeal.status}).`;
      }
      if (mem?.gossip?.length && resolvedIntent === 'gossip' && context.topicPerson) {
        line += ` They recall you bringing up ${context.topicPerson} before.`;
      }
    }

    memory?.rememberBeat?.(survivor.id, resolvedIntent, line);
    return { text: line, responses, context };
  }

  _selectIntentResponses(resolvedIntent, context = {}) {
    if ((resolvedIntent === 'bonding' || resolvedIntent === 'personal') && context.lastSpeaker === 'player') {
      return RESPONSE_LIBRARY[`${resolvedIntent}_playerLead`] || RESPONSE_LIBRARY[resolvedIntent] || RESPONSE_LIBRARY.bonding;
    }
    return RESPONSE_LIBRARY[resolvedIntent] || RESPONSE_LIBRARY.bonding;
  }

  _resolveConversationFlow(intent, context = {}) {
    if (intent === PRE_PHASE_INTENTS.confront_rumor) return 'confront_rumor_nodes';
    if (intent === POST_PHASE_INTENTS.talk_specific_person && context.subTopic === 'nameDrop') return 'name_drop_nodes';
    if (intent === POST_PHASE_INTENTS.plant_seed || intent === 'warning') return 'warning_nodes';
    return null;
  }

  _startConversationFlow(survivor, flowKey, context = {}) {
    const player = this.gameManager.getPlayerSurvivor?.();
    const session = {
      sessionId: `session-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      phase: context.phase || this._getConversationPhase(),
      npcId: survivor.id,
      playerId: player?.id || null,
      topic: flowKey,
      flowKey,
      context: { ...context },
      turnIndex: 0,
      lastNpcQuestionKey: null,
      awaitingPlayerResponse: false,
      history: []
    };

    this.conversationSession = session;

    if (flowKey === 'confront_rumor') {
      const opener = context.pressure ? 'Why did you say that about me?' : 'I heard you said my name.';
      this._appendConversationHistory(session, 'Player', opener, ['confront']);
      const accuseEvent = this._recordStructuredSocialEvent({
        type: 'ACCUSE_NAME',
        speakerId: player?.id || null,
        listenerId: survivor.id,
        subjectId: survivor.id,
        data: { aboutId: player?.id || null, aboutName: player?.firstName || 'you' },
        summary: `You confronted ${survivor.firstName} about your name coming up.`
      });
      session.context.accuseEventId = accuseEvent?.id || null;
    }

    if (flowKey === 'name_drop') {
      const targetName = context.topicPerson || 'someone';
      this._appendConversationHistory(session, 'Player', `I heard ${targetName} said your name.`, ['name_drop']);
      const nameDropEvent = this._recordStructuredSocialEvent({
        type: 'NAME_DROP',
        speakerId: player?.id || null,
        listenerId: survivor.id,
        subjectId: context.topicId || null,
        data: {
          targetId: context.topicId || null,
          npcId: survivor.id,
          sourceId: null,
          confidence: 55,
          phase: session.phase
        },
        summary: `You told ${survivor.firstName} you heard ${targetName} said their name.`
      });
      session.context.nameDropEventId = nameDropEvent?.id || null;
    }

    this._renderConversationStep(session, CONVERSATION_FLOWS[flowKey]?.start);
  }

  _renderConversationStep(session, stepKey, fromChoice = null) {
    if (!session || !stepKey) return;
    const flow = CONVERSATION_FLOWS[session.flowKey];
    if (!flow) return;
    const step = flow.steps[stepKey];
    if (!step) return;

    session.currentStepKey = stepKey;

    const npc = this._getSurvivorById(session.npcId);
    if (!npc) return;
    const overlay = this._buildOverlayShell(npc);
    const player = this.gameManager.getPlayerSurvivor?.();
    const context = session.context || {};

    let npcLine = '';
    if (step.nav) {
      npcLine = `What do you want to do next with ${npc?.firstName || 'them'}?`;
    } else if (typeof step.npcLine === 'function') {
      npcLine = step.npcLine(session, this, fromChoice);
    } else if (typeof step.npcLine === 'string') {
      npcLine = step.npcLine;
    }

    npcLine = this._formatConversationLine(npcLine, npc, context, player);

    if (!step.nav && npcLine) {
      this._appendConversationHistory(session, npc?.firstName || 'NPC', npcLine, ['npc']);
      context.lastSpeaker = 'npc';
    }

    const parchment = this._buildParchment(npcLine || '');
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

    let choices = [];
    if (step.choiceSetKey) {
      choices = (RESPONSE_LIBRARY[step.choiceSetKey] || []).map(choice => ({ ...choice }));
    }

    if (!choices.length && npcLine && npcLine.trim().endsWith('?')) {
      choices = (RESPONSE_LIBRARY.answerQuestion || []).map(choice => ({ ...choice }));
    }

    const handleChoice = (choice) => {
      if (choice.action === 'goBack') {
        if (this.state?.topic) {
          this._showCategoryMenu(npc, context.location, this.state?.topic);
        } else {
          this._showTopicSelection(npc, context.location);
        }
        return;
      }

      if (choice.action === 'changeTopic') {
        this._showTopicSelection(npc, context.location);
        return;
      }

      if (choice.action === 'endConversation') {
        this._clearOverlay();
        return;
      }

      if (choice.action === 'pickSource') {
        const excludeIds = [session.npcId, session.playerId].filter(Boolean);
        this.promptSurvivorPicker({
          title: 'Name the source',
          tribeOnly: true,
          excludeIds,
          extraOptions: [{
            label: 'I’m not naming names.',
            onSelect: () => {
              session.context.sourceId = null;
              session.context.sourceName = null;
              session.context.sourceRefused = true;
              const refusalStep = session.flowKey === 'name_drop' ? 'nameDropRefuse' : 'confrontResolve';
              this._advanceConversation(session, { ...choice, key: 'refuseSource', nextStep: refusalStep });
            }
          }],
          onPick: pick => {
            session.context.sourceId = pick.id;
            session.context.sourceName = pick.firstName;
            session.context.sourceRefused = false;
            this._advanceConversation(session, { ...choice, pickedSource: pick });
          },
          onCancel: () => this._renderConversationStep(session, stepKey, fromChoice)
        });
        return;
      }

      this._advanceConversation(session, choice);
    };

    const finalChoices = this._appendNavChoices(choices, {
      canBack: false,
      canChangeTopic: true,
      onBack: () => {
        if (this.state?.topic) {
          this._showCategoryMenu(npc, context.location, this.state?.topic);
        } else {
          this._showTopicSelection(npc, context.location);
        }
      },
      onChangeTopic: () => this._showTopicSelection(npc, context.location),
      onEnd: () => this._clearOverlay()
    });

    finalChoices.forEach(option => {
      const btn = createElement('button', {
        className: `rect-button full${option.alt ? ' alt' : ''}`,
        onclick: () => handleChoice(option)
      }, option.label);
      buttonColumn.appendChild(btn);
    });

    parchment.appendChild(buttonColumn);
    overlay.querySelector('.conversation-center').appendChild(parchment);
  }

  _advanceConversation(session, selectedChoice) {
    if (!session || !selectedChoice) return;
    const flow = CONVERSATION_FLOWS[session.flowKey];
    if (!flow) return;

    this._appendConversationHistory(session, 'Player', selectedChoice.label, ['player']);
    session.context.lastSpeaker = 'player';
    this._applyFlowChoiceEffects(session, selectedChoice);

    session.turnIndex += 1;

    const step = flow.steps[session.currentStepKey];
    const nextStep = selectedChoice.nextStep
      || (step?.nextFromChoice ? selectedChoice.nextStep : step?.next)
      || 'nav';

    this._renderConversationStep(session, nextStep, selectedChoice);
  }

  _applyFlowChoiceEffects(session, choice) {
    const npc = this._getSurvivorById(session.npcId);
    const player = this.gameManager.getPlayerSurvivor?.();
    const relationshipSystem = this.gameManager.systems?.relationshipSystem;
    const socialMemory = this.gameManager.systems?.socialMemorySystem;
    const socialLog = ensureCampSocialChanges();

    if (!npc || !player) return;

    if (session.flowKey === 'confront_rumor') {
      if (choice.key === 'nameSource' && session.context.sourceId) {
        const delta = this._resolveSnitchImpact(npc);
        relationshipSystem?.changeRelationship?.(player.id, npc.id, delta);
        socialLog.relationship.push({ id: npc.id, with: npc.firstName, amount: delta, context: 'confront_source_named' });
        relationshipSystem?.changeRelationship?.(npc.id, session.context.sourceId, -4);
        socialLog.relationship.push({
          id: session.context.sourceId,
          with: this._getSurvivorById(session.context.sourceId)?.firstName || 'someone',
          amount: -4,
          context: 'source_named'
        });
        const event = this._recordStructuredSocialEvent({
          type: 'SOURCE_NAMED',
          speakerId: player.id,
          listenerId: npc.id,
          subjectId: session.context.sourceId,
          data: { contextEventId: session.context.accuseEventId || null },
          summary: `You named ${session.context.sourceName} as the source for ${npc.firstName}.`
        });
        this._recordStructuredSocialEvent({
          type: 'ACCUSATION_SOURCE_NAMED',
          speakerId: player.id,
          listenerId: npc.id,
          subjectId: session.context.sourceId,
          data: { contextEventId: session.context.accuseEventId || null },
          summary: `You named a source for the accusation with ${npc.firstName}.`
        });
        session.context.lastSourceEventId = event?.id || null;
      } else if (choice.key === 'refuseSource') {
        socialMemory?.adjustTrust?.(npc.id, -6);
        socialLog.trust.push({ id: npc.id, with: npc.firstName, amount: -6, context: 'source_refused' });
        socialLog.suspicion.push({ id: npc.id, with: npc.firstName, amount: 3, context: 'source_refused' });
        this._recordStructuredSocialEvent({
          type: 'SOURCE_REFUSED',
          speakerId: player.id,
          listenerId: npc.id,
          subjectId: null,
          data: { contextEventId: session.context.accuseEventId || null },
          summary: `You refused to name a source to ${npc.firstName}.`
        });
        this._recordStructuredSocialEvent({
          type: 'ACCUSATION_SOURCE_REFUSED',
          speakerId: player.id,
          listenerId: npc.id,
          subjectId: null,
          data: { contextEventId: session.context.accuseEventId || null },
          summary: `You refused to name a source for the accusation with ${npc.firstName}.`
        });
      } else if (choice.key === 'retract') {
        this._recordStructuredSocialEvent({
          type: 'ACCUSE_RETRACTED',
          speakerId: player.id,
          listenerId: npc.id,
          subjectId: npc.id,
          data: { contextEventId: session.context.accuseEventId || null },
          summary: `You backed off your accusation with ${npc.firstName}.`
        });
        this._recordStructuredSocialEvent({
          type: 'ACCUSATION_RETRACTED',
          speakerId: player.id,
          listenerId: npc.id,
          subjectId: npc.id,
          data: { contextEventId: session.context.accuseEventId || null },
          summary: `You retracted the accusation about ${npc.firstName}.`
        });
      }
    }

    if (session.flowKey === 'name_drop') {
      if (choice.key === 'someoneTold' && session.context.sourceId) {
        const delta = this._resolveSnitchImpact(npc);
        relationshipSystem?.changeRelationship?.(player.id, npc.id, delta);
        socialLog.relationship.push({ id: npc.id, with: npc.firstName, amount: delta, context: 'name_drop_source' });
        relationshipSystem?.changeRelationship?.(npc.id, session.context.sourceId, -3);
        socialLog.relationship.push({
          id: session.context.sourceId,
          with: this._getSurvivorById(session.context.sourceId)?.firstName || 'someone',
          amount: -3,
          context: 'name_drop_source'
        });
        this._recordStructuredSocialEvent({
          type: 'SOURCE_NAMED',
          speakerId: player.id,
          listenerId: npc.id,
          subjectId: session.context.sourceId,
          data: { contextEventId: session.context.nameDropEventId || null },
          summary: `You told ${npc.firstName} the source was ${session.context.sourceName}.`
        });
        this._recordStructuredSocialEvent({
          type: 'NAME_DROP',
          speakerId: player.id,
          listenerId: npc.id,
          subjectId: session.context.topicId || null,
          data: {
            targetId: session.context.topicId || null,
            npcId: npc.id,
            sourceId: session.context.sourceId,
            confidence: 65,
            phase: session.phase
          },
          summary: `You told ${npc.firstName} the source for the name drop was ${session.context.sourceName}.`
        });
      }

      if (choice.key === 'refuseSource') {
        socialMemory?.adjustTrust?.(npc.id, -5);
        socialLog.trust.push({ id: npc.id, with: npc.firstName, amount: -5, context: 'name_drop_no_source' });
        socialLog.suspicion.push({ id: npc.id, with: npc.firstName, amount: 2, context: 'name_drop_no_source' });
        this._recordStructuredSocialEvent({
          type: 'NAME_DROP_NO_SOURCE',
          speakerId: player.id,
          listenerId: npc.id,
          subjectId: session.context.topicId || null,
          data: { contextEventId: session.context.nameDropEventId || null },
          summary: `You warned ${npc.firstName} but refused to name the source.`
        });
      }

      if (choice.key === 'heardSelf') {
        this._recordStructuredSocialEvent({
          type: 'NAME_DROP_DIRECT',
          speakerId: player.id,
          listenerId: npc.id,
          subjectId: session.context.topicId || null,
          data: { contextEventId: session.context.nameDropEventId || null },
          summary: `You told ${npc.firstName} you heard it yourself.`
        });
      }

      if (choice.key && ['dangerous', 'running', 'tonight', 'vague'].includes(choice.key)) {
        this._recordStructuredSocialEvent({
          type: 'MENTION_NAME',
          speakerId: player.id,
          listenerId: npc.id,
          subjectId: session.context.topicId || null,
          data: { sentiment: choice.key === 'dangerous' || choice.key === 'tonight' ? 'negative' : 'neutral' },
          summary: `You clarified the rumor about ${session.context.topicPerson || 'them'} to ${npc.firstName}.`
        });
      }
    }
  }

  _appendConversationHistory(session, speaker, text, tags = []) {
    if (!session || !text) return;
    session.history.push({
      speaker,
      text,
      tags: Array.isArray(tags) ? tags : [],
      timestamp: Date.now()
    });
  }

  _formatConversationLine(line, npc, context = {}, player = null) {
    if (!line) return '';
    const targetName = context.topicPerson || context.targetName || 'someone';
    const sourceName = context.sourceName || 'someone';
    return line
      .replace('{npc}', npc?.firstName || 'they')
      .replace('{target}', targetName)
      .replace('{source}', sourceName)
      .replace('{player}', player?.firstName || 'you');
  }

  _getSessionNpcStance(session, intent) {
    if (!session) return 'neutral';
    if (session.context?.npcStance) return session.context.npcStance;
    const npc = this._getSurvivorById(session.npcId);
    const player = this.gameManager.getPlayerSurvivor?.();
    const stance = this._computeNpcStance({
      npc,
      player,
      intent,
      subjectId: session.context.topicId || null,
      context: session.context
    });
    session.context.npcStance = stance;
    return stance;
  }

  _buildConfrontNodeRoot(session) {
    const npc = this._getSurvivorById(session.npcId);
    const player = this.gameManager.getPlayerSurvivor?.();
    const stance = this._getSessionNpcStance(session, PRE_PHASE_INTENTS.confront_rumor);
    const accuseEvent = this._recordStructuredSocialEvent({
      type: 'CONFRONTATION',
      speakerId: player?.id || null,
      listenerId: npc?.id || null,
      subjectId: player?.id || null,
      data: {
        topicPersonId: player?.id || null,
        stance,
        location: session.context.location || null
      },
      summary: `You confronted ${npc?.firstName || 'them'} about your name coming up.`
    });
    session.context.accuseEventId = accuseEvent?.id || null;

    return {
      id: 'confront_fromWho',
      text: () => this._buildConfrontQuestionLine(session),
      choices: [
        {
          label: 'Name a source',
          playerLine: 'It was…',
          action: 'pickSource',
          nextNodeBuilder: (pick) => this._buildConfrontSourceResponse(session, pick, { isLie: false })
        },
        {
          label: 'I’m not burning my source',
          playerLine: 'I’m not burning my source.',
          nextNode: this._buildConfrontRefusalNode(session)
        },
        {
          label: 'You tell me why my name came up',
          playerLine: 'You tell me why my name came up.',
          nextNode: this._buildConfrontWhyNameNode(session)
        },
        {
          label: 'Maybe I misheard. Let’s move on.',
          playerLine: 'Maybe I misheard. Let’s move on.',
          nextNode: {
            text: `${npc?.firstName || 'They'} nods cautiously. "Alright. If it’s a mix-up, let’s reset."`,
            choices: this._buildDefaultFollowupChoices(PRE_PHASE_INTENTS.confront_rumor, session.context),
            meta: { speaker: 'npc' }
          },
          memoryEvent: {
            type: 'ACCUSATION_DEESCALATED',
            speakerId: player?.id || null,
            listenerId: npc?.id || null,
            subjectId: player?.id || null,
            data: {
              contextEventId: session.context.accuseEventId || null,
              location: session.context.location || null
            }
          },
          onSelect: () => {
            this.gameManager.systems?.socialMemorySystem?.recordAccusation?.({
              speakerId: player?.id || null,
              listenerId: npc?.id || null,
              accusedId: npc?.id || null,
              sourceId: null,
              confidence: 35,
              day: this.gameManager.getCurrentDay?.(),
              phase: session.context.phase || this._getConversationPhase(),
              data: { deescalated: true }
            });
          }
        }
      ]
    };
  }

  _buildConfrontWhyNameNode(session) {
    const npc = this._getSurvivorById(session.npcId);
    const player = this.gameManager.getPlayerSurvivor?.();
    const trustScore = this._getTrustScore(npc, player);
    const style = (npc?.gameplayStyle || npc?.personality || '').toLowerCase();
    const discussedPlayer = this._npcHasMentionedPlayer(npc?.id, player?.id);
    const targetNames = this._getAvailableTargetNames(npc);
    const explanationTarget = targetNames.length ? targetNames[getRandomInt(0, targetNames.length - 1)] : 'someone';

    let line = '';
    if (trustScore > 65 && discussedPlayer) {
      line = `${npc?.firstName || 'They'} exhales. "Your name came up because people are nervous about you and ${explanationTarget} as a pair. It wasn’t personal."`;
    } else if (style.includes('strategic') || style.includes('villain')) {
      line = `${npc?.firstName || 'They'} keeps it sharp. "Because you’re a threat, and people are weighing the board. That’s it."`;
    } else if (trustScore < 40) {
      line = `${npc?.firstName || 'They'} stiffens. "You’re coming in hot. I heard chatter, I didn’t start it."`;
    } else {
      line = `${npc?.firstName || 'They'} nods. "It was a general vote read. Your name surfaced with ${explanationTarget} as an option."`;
    }

    this._recordStructuredSocialEvent({
      type: 'ACCUSATION_EXPLANATION',
      speakerId: npc?.id || null,
      listenerId: player?.id || null,
      subjectId: player?.id || null,
      data: {
        explanationTarget: explanationTarget || null,
        confidence: Math.min(85, Math.max(25, trustScore)),
        location: session.context.location || null,
        contextEventId: session.context.accuseEventId || null
      }
    });

    this.gameManager.systems?.socialMemorySystem?.recordAccusation?.({
      speakerId: player?.id || null,
      listenerId: npc?.id || null,
      accusedId: npc?.id || null,
      sourceId: null,
      confidence: Math.min(85, Math.max(25, trustScore)),
      day: this.gameManager.getCurrentDay?.(),
      phase: session.context.phase || this._getConversationPhase(),
      data: { explanationTarget }
    });

    return {
      text: line,
      choices: [
        {
          label: 'So are you targeting me?',
          playerLine: 'So are you targeting me?',
          nextNode: {
            text: `${npc?.firstName || 'They'} answers, "I’m not locked on you, but I’m watching the vote."`,
            choices: this._buildDefaultFollowupChoices(PRE_PHASE_INTENTS.confront_rumor, session.context),
            meta: { speaker: 'npc' }
          }
        },
        {
          label: 'Who else is involved?',
          playerLine: 'Who else is involved?',
          nextNode: {
            text: `${npc?.firstName || 'They'} says, "${explanationTarget} was the other name in the mix."`,
            choices: this._buildDefaultFollowupChoices(PRE_PHASE_INTENTS.confront_rumor, session.context),
            meta: { speaker: 'npc' }
          }
        },
        {
          label: 'Let’s squash it',
          playerLine: 'Let’s squash it.',
          nextNode: {
            text: `${npc?.firstName || 'They'} nods. "I’m good with that if you are."`,
            choices: this._buildDefaultFollowupChoices(PRE_PHASE_INTENTS.confront_rumor, session.context),
            meta: { speaker: 'npc' }
          }
        }
      ],
      meta: { speaker: 'npc' }
    };
  }

  _buildConfrontSourceResponse(session, pick, { isLie = false } = {}) {
    const npc = this._getSurvivorById(session.npcId);
    const player = this.gameManager.getPlayerSurvivor?.();
    const trustScore = this._getTrustScore(npc, player);
    const targetRel = pick?.id ? this._relationshipBetween(npc?.id, pick.id) : 50;
    const npcStyle = (npc?.gameplayStyle || npc?.personality || '').toLowerCase();
    const discussedPlayer = this._npcHasMentionedPlayer(npc?.id, player?.id);
    const isAlly = targetRel >= 70;

    let line = '';
    if (isLie) {
      if (trustScore > 65 && !npcStyle.includes('perceptive')) {
        line = `${npc?.firstName || 'They'} nods slowly. "Okay… if ${pick.firstName} said it, I’ll watch them."`;
      } else {
        line = `${npc?.firstName || 'They'} squints. "That doesn’t add up. Why would ${pick.firstName} tell you?"`;
      }
    } else if (trustScore > 65) {
      line = `${npc?.firstName || 'They'} exhales. "Okay… I did say your name, but here’s why."`;
    } else if (npcStyle.includes('deceptive') || trustScore < 45) {
      line = `${npc?.firstName || 'They'} bristles. "No, they’re twisting this. Why are you coming at me?"`;
    } else {
      line = `${npc?.firstName || 'They'} nods. "Alright. I said your name, but it wasn’t personal."`;
    }

    if (isAlly) {
      line += ` "${pick.firstName} is close to me. Don’t drag them into this."`;
    } else if (targetRel < 40) {
      line += ` "And if it was ${pick.firstName}, we’re not exactly close."`;
    }

    if (discussedPlayer) {
      line += ` "I did talk about you earlier, but it was strategic, not personal."`;
    }

    const confidence = Math.max(20, Math.min(90, trustScore + (isLie ? -25 : 10)));
    const memoryType = isLie ? 'CONFRONTATION_SOURCE_LIE' : 'CONFRONTATION_SOURCE_NAMED';
    this._recordStructuredSocialEvent({
      type: memoryType,
      speakerId: player?.id || null,
      listenerId: npc?.id || null,
      subjectId: pick?.id || null,
      data: {
        sourceName: pick?.firstName || null,
        accusedNpcId: npc?.id || null,
        topicPlayerName: true,
        isLie,
        reliabilityImpact: isLie ? -6 : 2,
        confidence,
        contextEventId: session.context.accuseEventId || null,
        location: session.context.location || null
      }
    });

    this.gameManager.systems?.socialMemorySystem?.recordAccusation?.({
      speakerId: player?.id || null,
      listenerId: npc?.id || null,
      accusedId: npc?.id || null,
      sourceId: pick?.id || null,
      confidence,
      day: this.gameManager.getCurrentDay?.(),
      phase: session.context.phase || this._getConversationPhase(),
      data: { sourceName: pick?.firstName || null, isLie }
    });

    if (isLie) {
      this.gameManager.systems?.socialMemorySystem?.adjustReliability?.(npc?.id, -6);
    }
    if (isAlly) {
      this.gameManager.systems?.socialMemorySystem?.adjustTrust?.(npc?.id, -3);
    }

    return {
      text: line,
      choices: this._buildConfrontFollowupChoices(session, { sourceName: pick?.firstName, isLie }),
      meta: { speaker: 'npc' }
    };
  }

  _buildConfrontRefusalNode(session) {
    const npc = this._getSurvivorById(session.npcId);
    const style = (npc?.gameplayStyle || npc?.personality || '').toLowerCase();
    const line = style.includes('suspicious') || style.includes('strategic')
      ? `${npc?.firstName || 'They'} narrows their eyes. "Convenient. Sounds like you’re fishing."`
      : `${npc?.firstName || 'They'} sighs. "I get it… but this puts me on edge."`;

    const player = this.gameManager.getPlayerSurvivor?.();
    const trustScore = this._getTrustScore(npc, player);
    this._recordStructuredSocialEvent({
      type: 'CONFRONTATION_SOURCE_REFUSED',
      speakerId: player?.id || null,
      listenerId: npc?.id || null,
      subjectId: null,
      data: {
        contextEventId: session.context.accuseEventId || null,
        location: session.context.location || null,
        confidence: Math.max(15, Math.min(75, trustScore - 10))
      }
    });

    this.gameManager.systems?.socialMemorySystem?.recordAccusation?.({
      speakerId: player?.id || null,
      listenerId: npc?.id || null,
      accusedId: npc?.id || null,
      sourceId: null,
      confidence: Math.max(15, Math.min(75, trustScore - 10)),
      day: this.gameManager.getCurrentDay?.(),
      phase: session.context.phase || this._getConversationPhase(),
      data: { sourceNamed: false }
    });

    return {
      text: line,
      choices: [
        {
          label: 'I just want to know if it’s true.',
          playerLine: 'I just want to know if it’s true.',
          nextNode: {
            text: `${npc?.firstName || 'They'} holds your gaze. "Then be straight with me too."`,
            choices: this._buildDefaultFollowupChoices(PRE_PHASE_INTENTS.confront_rumor, session.context),
            meta: { speaker: 'npc' }
          }
        },
        {
          label: 'Drop my name and we’re good.',
          playerLine: 'Drop my name and we’re good.',
          nextNode: {
            text: `${npc?.firstName || 'They'} nods. "Fine. I’ll cool it."`,
            choices: this._buildDefaultFollowupChoices(PRE_PHASE_INTENTS.confront_rumor, session.context),
            meta: { speaker: 'npc' }
          }
        },
        {
          label: 'Fine. I’ll remember this.',
          playerLine: 'Fine. I’ll remember this.',
          nextNode: {
            text: `${npc?.firstName || 'They'} frowns. "Do what you need to do."`,
            choices: this._buildDefaultFollowupChoices(PRE_PHASE_INTENTS.confront_rumor, session.context),
            meta: { speaker: 'npc' }
          }
        }
      ],
      meta: { speaker: 'npc' }
    };
  }

  _buildConfrontFollowupChoices(session, { sourceName = null } = {}) {
    const npc = this._getSurvivorById(session.npcId);
    const player = this.gameManager.getPlayerSurvivor?.();
    const disclosure = resolveNpcDisclosure({
      npc,
      player,
      kind: 'confront_followup',
      context: {
        availableTargets: this._getAvailableTargetNames(npc),
        relationshipSystem: this.gameManager.systems?.relationshipSystem
      }
    });
    const involvedName = disclosure.claimedTarget || 'a couple people';
    const involvedLine = disclosure.outcome === 'evade'
      ? `${npc?.firstName || 'They'} shakes their head. "I’m not naming names."`
      : `${npc?.firstName || 'They'} says, "${involvedName} is definitely in the mix."`;
    return [
      {
        label: 'So are you targeting me?',
        playerLine: 'So are you targeting me?',
        nextNode: {
          text: `${npc?.firstName || 'They'} answers, "I’m not locked on you, but I’m watching the vote."`,
          choices: this._buildDefaultFollowupChoices(PRE_PHASE_INTENTS.confront_rumor, session.context)
        }
      },
      {
        label: 'Who else is involved?',
        playerLine: 'Who else is involved?',
        nextNode: {
          text: involvedLine,
          choices: this._buildDefaultFollowupChoices(PRE_PHASE_INTENTS.confront_rumor, session.context)
        }
      },
      {
        label: 'Let’s squash it / work together',
        playerLine: 'Let’s squash it and work together.',
        nextNode: {
          text: `${npc?.firstName || 'They'} nods. "I’m good with that if you are."`,
          choices: this._buildDefaultFollowupChoices(PRE_PHASE_INTENTS.confront_rumor, session.context)
        }
      },
      {
        label: 'I don’t believe you.',
        playerLine: 'I don’t believe you.',
        nextNode: {
          text: `${npc?.firstName || 'They'} stiffens. "Then we’re done here."`,
          choices: this._buildDefaultFollowupChoices(PRE_PHASE_INTENTS.confront_rumor, session.context)
        }
      }
    ];
  }

  _buildNameDropNodeRoot(session) {
    const npc = this._getSurvivorById(session.npcId);
    return {
      id: 'name_drop_start',
      text: () => this._buildNameDropReaction(session),
      choices: [
        {
          label: 'I heard it myself.',
          playerLine: 'I heard it myself.',
          nextNode: this._buildNameDropDetailNode(session, { sourceType: 'direct' })
        },
        {
          label: 'Someone told me.',
          playerLine: 'Someone told me.',
          action: 'pickSource',
          nextNodeBuilder: (pick) => this._buildNameDropDetailNode(session, { sourceType: 'named', pick })
        },
        {
          label: 'I’m not naming names.',
          playerLine: 'I’m not naming names.',
          nextNode: this._buildNameDropDetailNode(session, { sourceType: 'refuse' })
        },
        {
          label: 'It might be nothing, just be careful.',
          playerLine: 'It might be nothing, just be careful.',
          nextNode: this._buildNameDropDetailNode(session, { sourceType: 'caution' })
        },
        {
          label: 'I’ve got your back.',
          playerLine: 'I’m telling you because I’ve got your back.',
          nextNode: this._buildNameDropDetailNode(session, { sourceType: 'support' })
        }
      ]
    };
  }

  _buildNameDropDetailNode(session, { sourceType, pick = null } = {}) {
    const npc = this._getSurvivorById(session.npcId);
    const targetName = session.context.topicPerson || 'someone';
    let line = '';
    if (sourceType === 'named' && pick) {
      line = `${npc?.firstName || 'They'} nods slowly. "So ${pick.firstName} said it. Got it."`;
      this._recordStructuredSocialEvent({
        type: 'RUMOR_SHARED',
        speakerId: this.gameManager.getPlayerSurvivor?.()?.id || null,
        listenerId: npc?.id || null,
        subjectId: session.context.topicId || null,
        data: {
          targetName,
          sourceName: pick.firstName,
          confidence: 65,
          location: session.context.location || null
        }
      });
    } else if (sourceType === 'refuse') {
      line = `${npc?.firstName || 'They'} frowns. "If you won’t say who, that makes me nervous."`;
      this._recordStructuredSocialEvent({
        type: 'CONFRONTATION_SOURCE_REFUSED',
        speakerId: this.gameManager.getPlayerSurvivor?.()?.id || null,
        listenerId: npc?.id || null,
        subjectId: session.context.topicId || null,
        data: { targetName, location: session.context.location || null }
      });
    } else if (sourceType === 'caution') {
      line = `${npc?.firstName || 'They'} nods. "Alright. I’ll keep my guard up."`;
    } else if (sourceType === 'support') {
      line = `${npc?.firstName || 'They'} softens. "I appreciate you telling me."`;
    } else if (sourceType === 'direct') {
      line = `${npc?.firstName || 'They'} nods. "Alright. If you heard it yourself, I’ll take that seriously."`;
      this._recordStructuredSocialEvent({
        type: 'RUMOR_SHARED',
        speakerId: this.gameManager.getPlayerSurvivor?.()?.id || null,
        listenerId: npc?.id || null,
        subjectId: session.context.topicId || null,
        data: {
          targetName,
          confidence: 70,
          location: session.context.location || null
        }
      });
    } else {
      line = `${npc?.firstName || 'They'} narrows their eyes. "Okay… that’s something."`;
    }

    return {
      text: line,
      choices: [
        {
          label: 'What did they say exactly?',
          playerLine: 'What did they say exactly?',
          nextNode: {
            text: `${npc?.firstName || 'They'} listens. "So ${targetName} said my name? That’s the vibe then."`,
            choices: this._buildDefaultFollowupChoices(POST_PHASE_INTENTS.talk_specific_person, session.context),
            meta: { speaker: 'npc' }
          }
        },
        {
          label: 'Do you buy it?',
          playerLine: 'Do you buy it?',
          nextNode: {
            text: `${npc?.firstName || 'They'} considers it. "It’s possible. I’ll watch ${targetName}."`,
            choices: this._buildDefaultFollowupChoices(POST_PHASE_INTENTS.talk_specific_person, session.context),
            meta: { speaker: 'npc' }
          }
        },
        {
          label: 'Let’s compare notes',
          playerLine: 'Let’s compare notes.',
          action: 'tradeInfo'
        }
      ],
      meta: { speaker: 'npc' }
    };
  }

  _buildNameMentionedPlayerNode(session, { trustScore = 50 } = {}) {
    const npc = this._getSurvivorById(session.npcId);
    const player = this.gameManager.getPlayerSurvivor?.();
    const memory = this.gameManager.systems?.socialMemorySystem;
    const context = session.context || {};
    const targetName = context.topicPerson || 'someone';
    const targetId = context.topicId || context.targetId || this._getSurvivorByName(targetName)?.id || null;
    const targetRel = targetId ? this._relationshipBetween(npc?.id, targetId) : 50;
    const style = this._classifyStyle(npc);
    const repeated = targetId ? memory?.hasTalkedAboutTargetRecently?.(npc?.id, targetId) : false;

    const disclosure = resolveNpcDisclosure({
      npc,
      player,
      kind: 'nameMentionedPlayer',
      context: {
        trueTarget: targetName,
        availableTargets: this._getAvailableTargetNames(npc),
        relationshipSystem: this.gameManager.systems?.relationshipSystem
      }
    });
    const sourceName = disclosure.outcome === 'evade' ? null : (disclosure.detail?.pusherName || null);
    const sourceId = sourceName ? this._getSurvivorByName(sourceName)?.id || null : null;
    const confidence = Math.max(20, Math.min(90, Math.round(trustScore + (disclosure.outcome === 'truth' ? 12 : disclosure.outcome === 'lie' ? -12 : -4))));
    const location = disclosure.detail?.location || context.location || 'shelter';
    const timeHint = disclosure.detail?.timeHint || 'earlier';

    let line = '';
    if (repeated) {
      line = `${npc?.firstName || 'They'} exhales. "You already asked me about ${targetName}. I don’t have much more."`;
    } else if (trustScore > 65 && targetRel < 60) {
      line = `${npc?.firstName || 'They'} nods. "Yeah, your name came up with ${targetName}. It wasn’t locked, but it was real."`;
    } else if (targetRel > 70) {
      line = `${npc?.firstName || 'They'} hesitates. "${targetName} is close to me. If your name came up, it could’ve been smoke."`;
    } else if (trustScore < 45) {
      line = `${npc?.firstName || 'They'} narrows their eyes. "That’s a big claim. I didn’t hear it myself."`;
    } else if (style.isStrategist || style.isVillain) {
      line = `${npc?.firstName || 'They'} keeps it clipped. "It was mentioned. People are sizing you up, that’s all."`;
    } else {
      line = `${npc?.firstName || 'They'} says, "I heard your name in the mix with ${targetName}, but nothing was locked."`;
    }

    this._recordStructuredSocialEvent({
      type: 'PLAYER_NAME_MENTIONED',
      speakerId: npc?.id || null,
      listenerId: player?.id || null,
      subjectId: targetId || null,
      data: {
        targetName,
        claimantId: npc?.id || null,
        claimantName: npc?.firstName || null,
        sourceName,
        sourceId,
        confidence,
        phase: context.phase || this._getConversationPhase(),
        location: context.location || null
      }
    });

    memory?.recordNameMention?.({
      speakerId: npc?.id || null,
      listenerId: player?.id || null,
      subjectId: targetId || null,
      contextTag: 'player_name_mentioned',
      confidence,
      phase: context.phase || this._getConversationPhase(),
      data: { targetName, sourceName, sourceId }
    });

    return {
      text: line,
      choices: [
        {
          label: 'Who said it?',
          playerLine: 'Who said it?',
          nextNode: {
            text: sourceName
              ? `${npc?.firstName || 'They'} answers, "It was ${sourceName} at the ${location} ${timeHint}."`
              : `${npc?.firstName || 'They'} says, "I’m not burning a name, but it was around the ${location} ${timeHint}."`,
            choices: this._buildDefaultFollowupChoices(POST_PHASE_INTENTS.talk_specific_person, context),
            meta: { speaker: 'npc' }
          }
        },
        {
          label: 'What exactly did they say?',
          playerLine: 'What exactly did they say?',
          nextNode: {
            text: `${npc?.firstName || 'They'} recalls, "It was basically, ‘${player?.firstName || 'you'} is a threat with ${targetName}.’"`,
            choices: this._buildDefaultFollowupChoices(POST_PHASE_INTENTS.talk_specific_person, context),
            meta: { speaker: 'npc' }
          }
        },
        {
          label: 'Do you think it’s real or smoke?',
          playerLine: 'Do you think it’s real or smoke?',
          nextNode: {
            text: targetRel > 70
              ? `${npc?.firstName || 'They'} shrugs. "Could be smoke. ${targetName} plays a long game."`
              : `${npc?.firstName || 'They'} nods slightly. "It felt real enough that I’m watching it."`,
            choices: this._buildDefaultFollowupChoices(POST_PHASE_INTENTS.talk_specific_person, context),
            meta: { speaker: 'npc' }
          }
        },
        {
          label: 'Should we push them tonight?',
          playerLine: 'Should we push them tonight?',
          nextNode: {
            text: this._isTooEarlyForVoteTalk()
              ? `${npc?.firstName || 'They'} shakes their head. "Too early. Let’s read the day."`
              : targetRel > 65
                ? `${npc?.firstName || 'They'} frowns. "Not tonight. I’m not ready to go at ${targetName}."`
                : `${npc?.firstName || 'They'} nods. "If numbers are there, I’m open to it."`,
            choices: this._buildDefaultFollowupChoices(POST_PHASE_INTENTS.talk_specific_person, context),
            meta: { speaker: 'npc' }
          }
        },
        {
          label: 'Let it go',
          playerLine: 'Let it go.',
          nextNode: {
            text: `${npc?.firstName || 'They'} nods. "Alright. We’ll watch it quietly."`,
            choices: this._buildDefaultFollowupChoices(POST_PHASE_INTENTS.talk_specific_person, context),
            meta: { speaker: 'npc' }
          }
        }
      ],
      meta: { speaker: 'npc' }
    };
  }

  _buildWarningNodeRoot(session) {
    const npc = this._getSurvivorById(session.npcId);
    const rumor = this._buildRumorPayload(npc, session.context);
    session.context.rumorPayload = rumor;
    const trustScore = this._getTrustScore(npc, this.gameManager.getPlayerSurvivor?.());
    const pusherTag = trustScore > 70 && rumor.pusherName ? ` ${rumor.pusherName} is pushing it.` : '';
    const introLine = `${npc?.firstName || 'They'} whispers, "Heads up — ${rumor.targetName} is in danger because of ${rumor.reason}.${pusherTag}"`;

    this._recordStructuredSocialEvent({
      type: 'RUMOR_SHARED',
      speakerId: npc?.id || null,
      listenerId: session.playerId || null,
      subjectId: rumor.targetId || null,
      data: {
        targetName: rumor.targetName,
        reason: rumor.reason,
        pusherName: rumor.pusherName || null,
        plotPacket: rumor.plotPacket || null,
        confidence: rumor.confidence,
        npcDisclosureOutcome: rumor.disclosure?.outcome || 'evade',
        location: session.context.location || null
      }
    });

    this.gameManager.systems?.socialMemorySystem?.recordPlotPacket?.({
      speakerId: npc?.id || null,
      listenerId: session.playerId || null,
      targetId: rumor.targetId || null,
      packet: rumor.plotPacket || null,
      day: this.gameManager.getCurrentDay?.(),
      phase: session.context.phase || this._getConversationPhase()
    });

    return {
      id: 'warning_intro',
      text: introLine,
      choices: [
        {
          label: 'Thanks, I agree.',
          playerLine: 'Thanks, I agree.',
          nextNode: {
            text: `${npc?.firstName || 'They'} nods. "So what’s the plan tonight?"`,
            choices: [
              { label: 'What are you thinking?', playerLine: 'What are you thinking?', action: 'askFollowup' },
              { label: 'Let’s compare notes', playerLine: 'Let’s compare notes', action: 'tradeInfo' },
              { label: 'Change topic', action: 'changeTopic' },
              { label: 'End conversation', end: true, action: 'endConversation' }
            ]
          }
        },
        {
          label: 'Ask for proof',
          playerLine: 'Ask for proof.',
          nextNode: this._buildWarningProofNode(session)
        },
        {
          label: 'Dismiss it',
          playerLine: 'That sounds like noise.',
          nextNode: {
            text: `${npc?.firstName || 'They'} frowns. "Alright. Just don’t say I didn’t warn you."`,
            choices: [
              { label: 'Apologize for snapping', playerLine: 'Sorry, I’m just on edge.', action: 'askFollowup' },
              { label: 'Pivot to another name', playerLine: 'What about someone else?', action: 'askFollowup' },
              { label: 'Change topic', action: 'changeTopic' },
              { label: 'End conversation', end: true, action: 'endConversation' }
            ]
          }
        }
      ]
    };
  }

  _buildWarningProofNode(session) {
    const npc = this._getSurvivorById(session.npcId);
    const rumor = session.context.rumorPayload || this._buildRumorPayload(npc, session.context);
    this._recordStructuredSocialEvent({
      type: 'RUMOR_SOURCE_REQUESTED',
      speakerId: session.playerId || null,
      listenerId: npc?.id || null,
      subjectId: rumor.targetId || null,
      data: { targetName: rumor.targetName, location: session.context.location || null }
    });

    const trustScore = this._getTrustScore(npc, this.gameManager.getPlayerSurvivor?.());
    const proofLine = this._buildWarningProofLine(npc, rumor, trustScore);

    return {
      id: 'warning_proof',
      text: proofLine,
      choices: [
        {
          label: 'Who exactly is driving it?',
          playerLine: 'Who exactly is driving it?',
          nextNode: {
            text: `${npc?.firstName || 'They'} answers, "${(Array.isArray(rumor.plotPacket?.planners) && rumor.plotPacket.planners.length ? rumor.plotPacket.planners : [rumor.pusherName || 'a couple people']).filter(Boolean).join(' & ')} are pushing it hardest."`,
            choices: this._buildDefaultFollowupChoices(POST_PHASE_INTENTS.plant_seed, session.context),
            meta: { speaker: 'npc' }
          }
        },
        {
          label: 'What did they say exactly?',
          playerLine: 'What did they say exactly?',
          nextNode: {
            text: `${npc?.firstName || 'They'} explains, "They said ${rumor.targetName} is a ${rumor.reason} problem and it should be ${rumor.timeline || 'soon'}."`,
            choices: this._buildDefaultFollowupChoices(POST_PHASE_INTENTS.plant_seed, session.context),
            meta: { speaker: 'npc' }
          }
        },
        {
          label: 'I can trade info—what do you want?',
          playerLine: 'I can trade info—what do you want?',
          action: 'tradeInfo'
        },
        {
          label: 'Okay, I’ll be careful.',
          playerLine: 'Okay, I’ll be careful.',
          end: true,
          action: 'endConversation'
        }
      ],
      meta: { speaker: 'npc' }
    };
  }

  _npcHasMentionedPlayer(npcId, playerId) {
    if (!npcId || !playerId) return false;
    const memory = this.gameManager.systems?.socialMemorySystem;
    const day = this.gameManager.getCurrentDay?.() || 1;
    const events = memory?.getStructuredEvents?.() || [];
    return events.some(event => event.speakerId === npcId && event.subjectId === playerId && (day - (event.day || day)) <= 2);
  }

  _runConversationQA() {
    if (!this._isConversationDebugEnabled()) {
      console.warn('ConversationSystem QA: Debug flag not enabled. Set window.DEBUG_CONVERSATION = true to run.');
      return;
    }

    const npc = (this.gameManager.survivors || []).find(s => !s.isPlayer) || this.gameManager.survivors?.[0];
    if (!npc) {
      console.warn('ConversationSystem QA: No NPC available for QA traversal.');
      return;
    }
    const player = this.gameManager.getPlayerSurvivor?.();
    const baseContext = { location: 'campfire', phase: this._getConversationPhase() };
    const maxDepth = 6;
    const validActions = new Set(['changeTopic', 'endConversation', 'askFollowup', 'tradeInfo', 'offerDealMenu', 'pitchPlan', 'pickSource', 'goBack']);

    const buildSession = (intent, context) => this._initNodeSession({
      npcId: npc.id,
      playerId: player?.id || null,
      intent,
      meeting: null,
      context: { ...baseContext, ...context }
    });

    const flows = [
      { key: 'pre_confront', session: buildSession(PRE_PHASE_INTENTS.confront_rumor, { phase: 'pre' }), builder: this._buildConfrontNodeRoot.bind(this) },
      { key: 'post_warning', session: buildSession(POST_PHASE_INTENTS.plant_seed, { phase: 'post' }), builder: this._buildWarningNodeRoot.bind(this) },
      { key: 'post_name_drop', session: buildSession(POST_PHASE_INTENTS.talk_specific_person, { phase: 'post', subTopic: 'nameDrop', topicPerson: npc.firstName, topicId: npc.id }), builder: this._buildNameDropNodeRoot.bind(this) }
    ];

    flows.forEach(flow => {
      const { session, builder } = flow;
      const root = builder(session);
      const nodes = {};
      const register = (node) => {
        if (!node) return null;
        const id = node.id || this._createNodeId('qa');
        nodes[id] = { ...node, id };
        return id;
      };
      const rootId = register(root);
      const visited = new Set();
      const walk = (nodeId, depth = 0) => {
        if (!nodeId || visited.has(nodeId) || depth > maxDepth) return;
        const node = nodes[nodeId];
        if (!node) {
          console.warn(`ConversationSystem QA: Missing nodeId "${nodeId}"`);
          return;
        }
        visited.add(nodeId);
        const choices = Array.isArray(node.choices) ? node.choices : [];
        const choiceKeys = new Set();
        choices.forEach(choice => {
          const key = this._choiceKey(choice);
          if (choiceKeys.has(key)) {
            console.warn(`ConversationSystem QA: Node "${nodeId}" has duplicate choice "${choice.label}"`);
          }
          choiceKeys.add(key);
        });
        if (choices.length === 0) {
          console.warn(`ConversationSystem QA: Node "${nodeId}" has no choices`);
        } else if (choices.length === 1 && !node.meta?.isEnd) {
          console.warn(`ConversationSystem QA: Node "${nodeId}" has only 1 choice`);
        }
        const nonNavChoices = choices.filter(choice => !this._isNavChoice(choice));
        if (nonNavChoices.length === 0 && !node.meta?.isEnd) {
          console.warn(`ConversationSystem QA: Node "${nodeId}" has only nav choices`);
        }
        choices.forEach(choice => {
          if (choice.nextNode) {
            const nextId = register(choice.nextNode);
            walk(nextId, depth + 1);
            return;
          }
          if (choice.nextNodeId) {
            walk(choice.nextNodeId, depth + 1);
            return;
          }
          if (choice.action && !validActions.has(choice.action)) {
            console.warn(`ConversationSystem QA: Node "${nodeId}" has unknown action "${choice.action}"`);
          }
          if (!choice.action && !choice.end && !choice.onSelect) {
            console.warn(`ConversationSystem QA: Node "${nodeId}" has a dangling choice "${choice.label}"`);
          }
        });
      };
      walk(rootId, 0);
    });

    const preIntents = [
      PRE_PHASE_INTENTS.bond_smalltalk,
      PRE_PHASE_INTENTS.bond_personal,
      PRE_PHASE_INTENTS.check_trust,
      PRE_PHASE_INTENTS.light_strategy,
      PRE_PHASE_INTENTS.ask_general_info,
      PRE_PHASE_INTENTS.repair_relationship
    ];

    const postIntents = [
      POST_PHASE_INTENTS.ask_intel,
      POST_PHASE_INTENTS.talk_specific_person,
      POST_PHASE_INTENTS.pitch_target,
      POST_PHASE_INTENTS.deflect_target,
      POST_PHASE_INTENTS.offer_deal_vote_together,
      POST_PHASE_INTENTS.offer_deal_share_info,
      POST_PHASE_INTENTS.offer_deal_protect,
      POST_PHASE_INTENTS.offer_deal_final2,
      POST_PHASE_INTENTS.challenge_performance,
      POST_PHASE_INTENTS.idol_suspicion,
      POST_PHASE_INTENTS.verify_story,
      POST_PHASE_INTENTS.plant_seed
    ];

    [...preIntents, ...postIntents].forEach(intent => {
      const context = intent === POST_PHASE_INTENTS.talk_specific_person
        ? { phase: 'post', topicPerson: npc.firstName, topicId: npc.id, subTopic: 'trustCheck' }
        : intent === POST_PHASE_INTENTS.pitch_target
          ? { phase: 'post', topicPerson: npc.firstName, topicId: npc.id }
          : { phase: intent === PRE_PHASE_INTENTS.bond_smalltalk ? 'pre' : 'post' };
      const session = buildSession(intent, context);
      const dialogue = this._buildDialogue(intent, npc, context);
      const choices = (dialogue.responses || []);
      if (choices.length < 2) {
        console.warn(`ConversationSystem QA: Intent "${intent}" has only ${choices.length} root choices`);
      }
      const rootNode = {
        id: `qa-root-${intent}`,
        text: dialogue.text,
        choices: choices.map((option, index) => ({
          id: `qa-choice-${index}`,
          label: option.label,
          responseOption: option
        }))
      };
      session.nodes[rootNode.id] = rootNode;
    });
  }

  _buildConfrontQuestionLine(session) {
    const npc = this._getSurvivorById(session.npcId);
    const stance = this._getSessionNpcStance(session, PRE_PHASE_INTENTS.confront_rumor);
    const lines = {
      supportive: `${npc?.firstName || 'They'} looks surprised. "From who?"`,
      defensive: `${npc?.firstName || 'They'} stiffens. "From who?"`,
      hostile: `${npc?.firstName || 'They'} glares. "From who?"`,
      suspicious: `${npc?.firstName || 'They'} narrows their eyes. "From who?"`,
      evasive: `${npc?.firstName || 'They'} shakes their head. "From who?"`,
      neutral: `${npc?.firstName || 'They'} tilts their head. "From who?"`
    };
    return lines[stance] || lines.neutral;
  }

  _buildConfrontResolutionLine(session, choice) {
    const npc = this._getSurvivorById(session.npcId);
    const sourceName = session.context.sourceName;
    switch (choice.key) {
      case 'heardDirect':
        return `${npc?.firstName || 'They'} exhales. "Alright. Just say that then."`;
      case 'throughSomeone':
        return `${npc?.firstName || 'They'} studies you. "Okay… I’m not thrilled, but noted."`;
      case 'nameSource':
        return `${npc?.firstName || 'They'} nods slowly. "So ${sourceName || 'someone'} said it. Got it."`;
      case 'refuseSource':
        return `${npc?.firstName || 'They'} frowns. "If you won’t name a source, it’s hard to trust."`;
      case 'retract':
        return `${npc?.firstName || 'They'} shrugs. "Fine. Then let’s drop it."`;
      default:
        return `${npc?.firstName || 'They'} keeps their guard up.`;
    }
  }

  _buildNameDropReaction(session) {
    const npc = this._getSurvivorById(session.npcId);
    const stance = this._getSessionNpcStance(session, POST_PHASE_INTENTS.talk_specific_person);
    const lines = {
      supportive: `${npc?.firstName || 'They'} leans in. "Wait—who told you that?"`,
      neutral: `${npc?.firstName || 'They'} blinks. "From who?"`,
      suspicious: `${npc?.firstName || 'They'} squints. "Did you hear it yourself?"`,
      defensive: `${npc?.firstName || 'They'} frowns. "What exactly did they say?"`,
      hostile: `${npc?.firstName || 'They'} snaps. "From who?"`
    };
    return lines[stance] || lines.neutral;
  }

  _buildNameDropDetailQuestion(session) {
    const npc = this._getSurvivorById(session.npcId);
    return `${npc?.firstName || 'They'} asks, "What did they say?"`;
  }

  _buildNameDropSourceResolution(session, choice) {
    const npc = this._getSurvivorById(session.npcId);
    const sourceName = session.context.sourceName;
    if (choice.key === 'someoneTold' && sourceName) {
      return `${npc?.firstName || 'They'} nods slowly. "Okay. I’ll watch ${sourceName}."`;
    }
    return `${npc?.firstName || 'They'} absorbs it, eyes narrowing slightly.`;
  }

  _buildNameDropRefusalResolution(session) {
    const npc = this._getSurvivorById(session.npcId);
    return `${npc?.firstName || 'They'} frowns. "If you won’t say who, that makes me nervous."`;
  }

  _buildNameDropCautionResolution(session) {
    const npc = this._getSurvivorById(session.npcId);
    return `${npc?.firstName || 'They'} nods. "Alright. I’ll keep my guard up."`;
  }

  _buildNameDropSupportResolution(session) {
    const npc = this._getSurvivorById(session.npcId);
    return `${npc?.firstName || 'They'} softens. "I appreciate you telling me."`;
  }

  _buildNameDropDetailResolution(session, choice) {
    const npc = this._getSurvivorById(session.npcId);
    const targetName = session.context.topicPerson || 'they';
    const detailLines = {
      dangerous: `"${targetName} is dangerous."`,
      running: `"${targetName} is running things."`,
      tonight: `"${targetName} said your name for tonight."`,
      vague: `"It was vague—just your name in the mix."`
    };
    return `${npc?.firstName || 'They'} nods slowly. ${detailLines[choice.key] || '"Okay, noted."'}`;
  }

  _resolveSnitchImpact(npc) {
    const personality = (npc?.personality || npc?.gameplayStyle || '').toLowerCase();
    if (personality.includes('loyal') || personality.includes('honest') || personality.includes('social')) {
      return 2;
    }
    if (personality.includes('deceptive') || personality.includes('strategic') || personality.includes('shadow')) {
      return -2;
    }
    return 1;
  }

  _recordStructuredSocialEvent({ type, speakerId, listenerId, subjectId = null, data = {}, summary = null }) {
    const memory = this.gameManager.systems?.socialMemorySystem;
    const day = this.gameManager.getCurrentDay?.() || this.gameManager.day || 1;
    const phase = this._getConversationPhase();
    const recordFn = memory?.recordConversationEvent || memory?.recordStructuredEvent;
    const entry = recordFn
      ? recordFn({
          type,
          speakerId,
          listenerId,
          subjectId,
          data,
          day,
          phase,
          topicPersonId: data?.topicPersonId || subjectId || null,
          targetName: data?.targetName || null,
          stance: data?.stance || data?.outcome || null,
          confidence: data?.confidence || null,
          location: data?.location || null
        })
      : null;

    if (summary) {
      const socialLog = ensureCampSocialChanges();
      socialLog.memory.push({ type: 'structured_summary', text: summary });
    }

    return entry;
  }

  _pickIntentTemplate(intent, initiator = 'player') {
    const entry = INTENT_TEMPLATES[intent];
    if (!entry) return '{npc} talks about the game.';
    if (Array.isArray(entry)) {
      return entry[getRandomInt(0, entry.length - 1)];
    }
    const pool = initiator === 'npc' ? entry.npcLead : entry.playerLead;
    const fallback = entry.playerLead || entry.npcLead || [];
    const usePool = Array.isArray(pool) && pool.length ? pool : fallback;
    return usePool.length ? usePool[getRandomInt(0, usePool.length - 1)] : '{npc} talks about the game.';
  }

  _buildAskIntelDialogue(survivor, context = {}) {
    const player = this.gameManager.getPlayerSurvivor?.();
    const memory = this.gameManager.systems?.socialMemorySystem;
    const relationshipSystem = this.gameManager.systems?.relationshipSystem;
    const initiator = context.initiator || 'player';
    const phase = context.phase || this._getConversationPhase();

    const { targetId, targetName } = this._pickIntelTarget(survivor, context);
    const relationshipValue = this._relationshipBetween(player?.id, survivor?.id) || 50;
    const memoryTrust = memory?.getTrust?.(survivor.id) ?? 50;
    const trustScore = Math.round((relationshipValue + memoryTrust) / 2);
    const targetRel = targetId ? this._relationshipBetween(survivor?.id, targetId) : 50;
    const style = this._classifyStyle(survivor);

    const repeated = targetId
      ? memory?.hasTalkedAboutTargetRecently?.(survivor.id, targetId)
      : false;

    let responseLine = '';
    let intelContext = 'heard_rumor';
    let confidence = Math.max(15, Math.min(90, Math.round(trustScore + (style.isVillain ? -10 : 5))));

    if (repeated && targetName) {
      responseLine = `${survivor.firstName} exhales. "You already asked about ${targetName}. I don’t have much more."`;
      confidence = Math.max(15, confidence - 15);
    } else if (targetName) {
      const intel = this._getBestIntelForTarget(targetId, targetName);
      if (intel?.type === 'idol') {
        intelContext = 'idol_suspicion';
        responseLine = `${survivor.firstName} lowers their voice. "I keep hearing ${targetName} might have an idol."`;
      } else if (intel?.type === 'alliance') {
        intelContext = 'working_with';
        responseLine = `${survivor.firstName} nods. "${targetName} feels tight with ${intel?.allyName || 'someone'}. That\'s the vibe."`;
      } else if (intel?.type === 'target') {
        intelContext = 'target';
        responseLine = `${survivor.firstName} watches the camp. "Names are floating and ${targetName} keeps coming up."`;
      } else {
        intelContext = 'heard_rumor';
        responseLine = `${survivor.firstName} shrugs. "I\'m hearing ${targetName}\'s name more than once."`;
      }

      if (targetRel > 70) {
        responseLine += ` "But I don’t think they’re the real problem."`;
        confidence = Math.max(10, confidence - 10);
      } else if (targetRel < 40) {
        responseLine += style.isStrategist
          ? ` "They\'re a problem long-term."`
          : ` "People are over it."`;
        confidence = Math.min(95, confidence + 5);
      }

      if (trustScore < 45 && (style.isStrategist || style.isVillain)) {
        responseLine += ` "If I\'m giving you this, I want something back later."`;
      }
    } else {
      responseLine = `${survivor.firstName} shakes their head. "It\'s quiet… just a lot of side-eyes."`;
      intelContext = 'heard_rumor';
      confidence = Math.max(10, confidence - 10);
    }

    const leadLine = this._pickIntentTemplate('askIntel', initiator)
      .replace('{npc}', survivor.firstName);
    const line = `${leadLine} ${responseLine}`.trim();

    const payload = targetName
      ? {
          aboutId: targetId,
          aboutName: targetName,
          context: intelContext,
          fromId: survivor.id,
          fromName: survivor.firstName,
          toId: player?.id || null,
          phase,
          confidence,
          shortText: responseLine
        }
      : null;

    return {
      text: line,
      responses: RESPONSE_LIBRARY.askIntel || RESPONSE_LIBRARY.bonding,
      context: { ...context, topicPerson: targetName || null, targetId: targetId || null, phase, intelPayload: payload }
    };
  }

  _buildTalkSpecificDialogue(survivor, context = {}) {
    const player = this.gameManager.getPlayerSurvivor?.();
    const memory = this.gameManager.systems?.socialMemorySystem;
    const relationshipSystem = this.gameManager.systems?.relationshipSystem;
    const initiator = context.initiator || 'player';
    const phase = context.phase || this._getConversationPhase();
    const targetName = context.topicPerson || this._pickTargetName(survivor, context) || 'someone';
    const targetId = context.topicId || this._getSurvivorByName(targetName)?.id || null;
    const subTopic = context.subTopic || 'trustCheck';

    const relationshipValue = this._relationshipBetween(player?.id, survivor?.id) || 50;
    const memoryTrust = memory?.getTrust?.(survivor.id) ?? 50;
    const trustScore = Math.round((relationshipValue + memoryTrust) / 2);
    const targetRel = targetId ? this._relationshipBetween(survivor?.id, targetId) : 50;
    const style = this._classifyStyle(survivor);
    const repeated = targetId ? memory?.hasTalkedAboutTargetRecently?.(survivor.id, targetId) : false;

    const promptMap = {
      trustCheck: {
        playerPrompt: 'Do you trust them?',
        npcPrompt: 'Do you trust them?'
      },
      challengePraise: {
        playerPrompt: 'They did well in the challenge.',
        npcPrompt: 'They did well in the challenge.'
      },
      challengeCritique: {
        playerPrompt: 'They struggled in the challenge.',
        npcPrompt: 'They struggled in the challenge.'
      },
      idol: {
        playerPrompt: 'I think they might have an idol.',
        npcPrompt: 'I think they might have an idol.'
      },
      nameHeard: {
        playerPrompt: 'I’ve heard their name.',
        npcPrompt: 'I’ve heard their name.'
      },
      nameMentionedPlayer: {
        playerPrompt: 'I heard they said my name.',
        npcPrompt: 'I heard they said my name.'
      },
      considerWork: {
        playerPrompt: 'I’m considering working with them.',
        npcPrompt: 'I’m considering working with them.'
      },
      dangerLater: {
        playerPrompt: 'I’m worried they’re dangerous later.',
        npcPrompt: 'I’m worried they’re dangerous later.'
      },
      voteTonight: {
        playerPrompt: 'Would you vote them tonight?',
        npcPrompt: 'Would you vote them tonight?'
      },
      drivingVote: {
        playerPrompt: 'Are they driving the vote?',
        npcPrompt: 'Are they driving the vote?'
      },
      haveDeal: {
        playerPrompt: 'Do they have a deal?',
        npcPrompt: 'Do they have a deal?'
      }
    };

    const prompt = promptMap[subTopic] || promptMap.workingWith;
    let responseLine = '';
    let intelContext = 'heard_rumor';
    let confidence = Math.max(10, Math.min(95, Math.round(trustScore + (style.isStrategist ? 5 : 0) - (style.isVillain ? 5 : 0))));
    let mentionedNames = [];
    let dealOutcome = null;

    if (repeated) {
      responseLine = `${survivor.firstName} shakes their head. "You already asked about ${targetName}. I don’t have more."`;
      confidence = Math.max(10, confidence - 15);
    } else {
      switch (subTopic) {
        case 'trustCheck': {
          intelContext = 'trust_check';
          responseLine = targetRel > 65
            ? `${survivor.firstName} nods. "I trust ${targetName} more than most."`
            : `${survivor.firstName} shrugs. "I’m still reading ${targetName}."`;
          break;
        }
        case 'challengePraise':
        case 'challengeCritique': {
          intelContext = 'challenge_comment';
          const performance = this._getChallengePerformanceTag(targetId);
          const isPraise = subTopic === 'challengePraise';
          if (performance === 'mvp') {
            responseLine = isPraise
              ? `${survivor.firstName} nods. "${targetName} carried a lot out there."`
              : `${survivor.firstName} frowns. "${targetName} actually carried us, I’m not sure I’d say struggled."`;
          } else if (performance === 'lvp') {
            responseLine = isPraise
              ? `${survivor.firstName} hesitates. "${targetName} struggled more than they want to admit."`
              : `${survivor.firstName} agrees. "${targetName} had a rough one."`;
          } else {
            responseLine = isPraise
              ? `${survivor.firstName} nods. "${targetName} was solid, not flashy."`
              : `${survivor.firstName} shrugs. "${targetName} wasn’t great, wasn’t terrible."`;
          }
          break;
        }
        case 'idol': {
          intelContext = 'idol_suspicion';
          responseLine = trustScore > 65
            ? `${survivor.firstName} lowers their voice. "${targetName} is the one people whisper about with idols."`
            : `${survivor.firstName} shrugs. "Maybe. ${targetName} gives idol vibes, but I don’t know."`;
          break;
        }
        case 'nameHeard': {
          intelContext = 'name_thrown_out';
          responseLine = trustScore > 60
            ? `${survivor.firstName} admits, "Yeah, ${targetName}’s name keeps coming up."`
            : `${survivor.firstName} hedges. "I’ve heard whispers, but nothing solid."`;
          confidence = Math.max(10, confidence - (trustScore < 50 ? 10 : 0));
          break;
        }
        case 'nameMentionedPlayer': {
          intelContext = 'player_name_mentioned';
          if (trustScore > 65 && targetRel < 60) {
            responseLine = `${survivor.firstName} nods slowly. "I did hear your name with ${targetName}. It wasn’t locked, but it was real."`;
          } else if (targetRel > 70) {
            responseLine = `${survivor.firstName} hesitates. "${targetName} and I are tight. If your name came up, it might’ve been smoke."`;
          } else if (trustScore < 45) {
            responseLine = `${survivor.firstName} narrows their eyes. "That’s a big claim. I haven’t heard it myself."`;
            confidence = Math.max(10, confidence - 15);
          } else {
            responseLine = `${survivor.firstName} says, "I’ve heard your name in the mix with ${targetName}, but it’s not locked."`;
          }
          break;
        }
        case 'considerWork': {
          intelContext = 'working_with';
          responseLine = targetRel > 60
            ? `${survivor.firstName} nods. "${targetName} would be a steady number if you can lock it in."`
            : `${survivor.firstName} cautions. "${targetName} might be slippery. Keep your eyes open."`;
          break;
        }
        case 'dangerLater': {
          intelContext = 'threat';
          responseLine = targetRel < 45
            ? `${survivor.firstName} agrees. "${targetName} could be a problem later."`
            : `${survivor.firstName} hesitates. "${targetName}’s dangerous, but there are bigger threats too."`;
          break;
        }
        case 'voteTonight': {
          intelContext = 'target';
          if (this._isTooEarlyForVoteTalk()) {
            responseLine = `${survivor.firstName} exhales. "It’s too early to lock that. Let’s see how today goes."`;
            context.skipIntel = true;
          } else if (this._isPlayerTribeSafeTonight()) {
            responseLine = `${survivor.firstName} shrugs. "We’re safe tonight. I’m thinking longer-term."`;
            context.skipIntel = true;
          } else {
            const disclosure = resolveNpcDisclosure({
              npc: survivor,
              player,
              kind: 'voteTonight',
              context: { trueTarget: targetName, availableTargets: this._getAvailableTargetNames(survivor), relationshipSystem }
            });
            const claim = disclosure.claimedTarget || null;
            if (disclosure.outcome === 'truth') {
              responseLine = `${survivor.firstName} keeps it low. "If it’s me, it’s ${claim || targetName}."`;
            } else if (disclosure.outcome === 'lie') {
              responseLine = `${survivor.firstName} shrugs. "Probably ${claim || targetName}."`;
              confidence = Math.max(10, confidence - 15);
            } else {
              responseLine = `${survivor.firstName} shakes their head. "I’m not putting names out yet."`;
              confidence = Math.max(10, confidence - 20);
              context.skipIntel = true;
            }
            if (claim) {
              context.topicPerson = claim;
            }
          }
          break;
        }
        case 'drivingVote': {
          intelContext = 'driving_vote';
          const driving = targetRel < 45 || trustScore > 55;
          responseLine = driving
            ? `${survivor.firstName} nods. "${targetName} has been steering the chatter."`
            : `${survivor.firstName} shrugs. "I don’t see ${targetName} running it."`;
          break;
        }
        case 'haveDeal': {
          intelContext = 'deal';
          const deals = this.gameManager.systems?.socialMemorySystem?.getDealsBetween?.(survivor.id, targetId) || [];
          responseLine = deals.length
            ? `${survivor.firstName} admits, "${targetName} has a couple deals floating."`
            : `${survivor.firstName} shakes their head. "Not that I’ve seen."`;
          break;
        }
        default: {
          intelContext = 'heard_rumor';
          responseLine = `${survivor.firstName} shrugs. "Hard to read ${targetName} right now."`;
          break;
        }
      }
    }

    const baseLine = this._pickIntentTemplate('talkSpecific', initiator)
      .replace('{npc}', survivor.firstName)
      .replace('{target}', targetName)
      .replace('{playerPrompt}', prompt.playerPrompt)
      .replace('{npcPrompt}', prompt.npcPrompt);

    const line = `${baseLine} ${responseLine}`.trim();
    const finalTopicName = context.topicPerson || targetName;
    const finalTargetId = context.targetId || targetId;

    const payload = context.skipIntel
      ? null
      : {
          aboutId: finalTargetId,
          aboutName: finalTopicName,
          context: intelContext,
          fromId: survivor.id,
          fromName: survivor.firstName,
          toId: player?.id || null,
          phase,
          confidence,
          shortText: responseLine,
          mentionedNames,
          dealOutcome,
          subTopic
        };

    return {
      text: line,
      responses: [
        { label: 'Press for more detail', mood: 'focused' },
        { label: 'Back off for now', mood: 'calm' },
        { label: 'Offer a deal', mood: 'neutral', action: 'offerDealMenu' }
      ],
      context: { ...context, topicPerson: finalTopicName, targetId: finalTargetId, subTopic, phase, intelPayload: payload }
    };
  }

  _buildPitchTargetDialogue(survivor, context = {}) {
    const player = this.gameManager.getPlayerSurvivor?.();
    const phase = context.phase || this._getConversationPhase();
    const targetName = context.topicPerson || this._pickTargetName(survivor, context) || 'someone';
    const targetId = context.topicId || this._getSurvivorByName(targetName)?.id || null;
    const stance = this._computeNpcStance({ npc: survivor, player, intent: POST_PHASE_INTENTS.pitch_target, subjectId: targetId, context });

    let responseLine = '';
    let rejected = false;
    if (this._isTooEarlyForVoteTalk()) {
      responseLine = `${survivor.firstName} shakes their head. "Too early to lock a vote. Let’s read the day."`;
      rejected = true;
    } else if (this._isPlayerTribeSafeTonight()) {
      responseLine = `${survivor.firstName} shrugs. "We’re safe tonight. Let’s think long-term."`;
      rejected = true;
    } else {
      if (['committal', 'supportive'].includes(stance)) {
        responseLine = `${survivor.firstName} nods. "I can get behind ${targetName}."`;
      } else if (stance === 'intrigued') {
        const counter = this._pickTargetName(survivor, { topicPerson: targetName }) || targetName;
        responseLine = `${survivor.firstName} considers it. "Maybe… but what about ${counter} instead?"`;
      } else if (['defensive', 'hostile'].includes(stance)) {
        responseLine = `${survivor.firstName} frowns. "That’s not my plan."`;
        rejected = true;
      } else {
        responseLine = this._pickNpcResponse(POST_PHASE_INTENTS.pitch_target, stance, {
          subjectName: targetName,
          npcName: survivor.firstName
        }, survivor);
      }
    }

    return {
      text: `You pitch ${targetName} as a possible vote. ${responseLine}`.trim(),
      responses: [
        { label: 'Press for commitment', mood: 'focused' },
        { label: 'Ask who else they’d consider', mood: 'neutral' },
        { label: 'Back off for now', mood: 'calm' },
        { label: 'Offer a deal', mood: 'focused', action: 'offerDealMenu' }
      ],
      context: { ...context, topicPerson: targetName, targetId, phase, targetRejected: rejected }
    };
  }

  _buildDeflectDialogue(survivor, context = {}) {
    const player = this.gameManager.getPlayerSurvivor?.();
    const phase = context.phase || this._getConversationPhase();
    const subjectName = context.topicPerson || 'someone';
    const subjectId = context.topicId || this._getSurvivorByName(subjectName)?.id || null;
    const alternateName = context.alternateName || 'someone else';
    const stance = this._computeNpcStance({ npc: survivor, player, intent: POST_PHASE_INTENTS.deflect_target, subjectId, context });
    const responseLine = this._pickNpcResponse(POST_PHASE_INTENTS.deflect_target, stance, {
      subjectName,
      npcName: survivor.firstName
    }, survivor);

    return {
      text: `You try to lower heat on ${subjectName} and float ${alternateName} instead. ${responseLine}`.trim(),
      responses: [
        { label: 'Ask if they’ll help redirect', mood: 'focused' },
        { label: 'Back off for now', mood: 'calm' },
        { label: 'Offer a deal', mood: 'neutral', action: 'offerDealMenu' }
      ],
      context: { ...context, topicPerson: subjectName, targetId: subjectId, phase }
    };
  }

  _buildVerifyStoryDialogue(survivor, context = {}) {
    const player = this.gameManager.getPlayerSurvivor?.();
    const phase = context.phase || this._getConversationPhase();
    const targetName = context.topicPerson || 'someone';
    const targetId = context.topicId || this._getSurvivorByName(targetName)?.id || null;
    const memory = this.gameManager.systems?.socialMemorySystem;
    const recentIntel = memory?.getRecentIntelAbout?.(targetId || targetName, 3) || [];
    const npcMentioned = recentIntel.some(entry => entry.from === survivor.id || entry.fromName === survivor.firstName);
    const stance = this._computeNpcStance({ npc: survivor, player, intent: POST_PHASE_INTENTS.verify_story, subjectId: targetId, context });

    let responseLine = this._pickNpcResponse(POST_PHASE_INTENTS.verify_story, stance, {
      subjectName: targetName,
      npcName: survivor.firstName
    }, survivor);

    if (npcMentioned && stance !== 'hostile') {
      responseLine = `${survivor.firstName} nods. "Yeah, I said ${targetName}’s name, but I didn’t start it."`;
    }

    return {
      text: `You ask if they were talking about ${targetName}. ${responseLine}`.trim(),
      responses: [
        { label: 'Press for details', mood: 'focused' },
        { label: 'Let it go', mood: 'calm' },
        { label: 'Offer a deal instead', mood: 'neutral', action: 'offerDealMenu' }
      ],
      context: { ...context, topicPerson: targetName, targetId, phase }
    };
  }

  _buildChallengePerformanceDialogue(survivor, context = {}) {
    const phase = context.phase || this._getConversationPhase();
    const subjectName = context.topicPerson || survivor.firstName;
    const subjectId = context.topicId || survivor.id;
    const tone = context.performanceTone || 'neutral';
    const performance = this._getChallengePerformanceTag(subjectId);

    let responseLine = '';
    if (tone === 'praise_self' || tone === 'praise_other') {
      responseLine = performance === 'lvp'
        ? `${survivor.firstName} hesitates. "${subjectName} had a rough one, but I hear you."`
        : `${survivor.firstName} nods. "${subjectName} did stand out."`;
    } else if (tone === 'critique_self' || tone === 'critique_other') {
      responseLine = performance === 'mvp'
        ? `${survivor.firstName} frowns. "${subjectName} actually carried us. I wouldn’t call it struggling."`
        : `${survivor.firstName} nods. "${subjectName} struggled out there."`;
    } else {
      responseLine = `${survivor.firstName} shrugs. "${subjectName} was middle of the pack."`;
    }

    return {
      text: responseLine,
      responses: [
        { label: 'Agree and move on', mood: 'neutral' },
        { label: 'Ask how that affects the vote', mood: 'focused' },
        { label: 'Change topic', mood: 'calm' }
      ],
      context: { ...context, topicPerson: subjectName, targetId: subjectId, phase }
    };
  }

  _buildTargetingDialogue(survivor, context = {}) {
    const player = this.gameManager.getPlayerSurvivor?.();
    const relationshipSystem = this.gameManager.systems?.relationshipSystem;
    const initiator = context.initiator || 'player';
    const phase = context.phase || this._getConversationPhase();
    const leadLine = this._pickIntentTemplate('targeting', initiator)
      .replace('{npc}', survivor.firstName);

    const disclosure = resolveNpcDisclosure({
      npc: survivor,
      player,
      kind: 'voteTonight',
      context: { availableTargets: this._getAvailableTargetNames(survivor), relationshipSystem }
    });

    let responseLine = '';
    const claim = disclosure.claimedTarget || null;
    if (disclosure.outcome === 'truth') {
      responseLine = `${survivor.firstName} answers directly. "If I\'m voting, it\'s ${claim || 'someone'}."`;
    } else if (disclosure.outcome === 'lie') {
      responseLine = `${survivor.firstName} glances away. "Probably ${claim || 'someone'}."`;
    } else {
      responseLine = `${survivor.firstName} shuts it down. "I\'m not saying names yet."`;
    }

    const payload = claim
      ? {
          aboutName: claim,
          context: 'target',
          fromId: survivor.id,
          fromName: survivor.firstName,
          toId: player?.id || null,
          phase,
          confidence: disclosure.outcome === 'truth' ? 70 : disclosure.outcome === 'lie' ? 35 : 20,
          shortText: responseLine
        }
      : null;

    return {
      text: `${leadLine} ${responseLine}`.trim(),
      responses: RESPONSE_LIBRARY.targeting || RESPONSE_LIBRARY.bonding,
      context: {
        ...context,
        phase,
        topicPerson: claim || null,
        npcProposedTargetName: claim || null,
        npcProposedTargetId: claim ? this._getSurvivorByName(claim)?.id || null : null,
        intelPayload: payload
      }
    };
  }

  _classifyStyle(survivor) {
    const style = (survivor?.gameplayStyle || survivor?.personality || '').toLowerCase();
    return {
      isStrategist: style.includes('strateg') || style.includes('power'),
      isSocial: style.includes('social') || style.includes('charmer'),
      isVillain: style.includes('villain') || style.includes('shadow') || style.includes('deceptive'),
      isWildcard: style.includes('wildcard')
    };
  }

  _getAvailableTargetNames(survivor) {
    return (this.gameManager.getPlayerTribe?.()?.members || this.gameManager.survivors || [])
      .filter(s => s.firstName !== survivor.firstName && !s.isPlayer)
      .map(s => s.firstName);
  }

  _isPlayerTribeSafeTonight() {
    const strategyPhaseSystem = this.gameManager.systems?.strategyPhaseSystem;
    if (typeof strategyPhaseSystem?.playerTribeSafe === 'boolean') {
      return strategyPhaseSystem.playerTribeSafe;
    }
    if (this.gameManager.getGamePhase?.() !== GamePhase.POST_CHALLENGE) return false;
    const day = this.gameManager.getCurrentDay?.() ?? this.gameManager.day;
    const result = challengeManager?.getChallengeResult?.(day);
    const winningKeys = new Set(Array.isArray(result?.winningTribeKeys) ? result.winningTribeKeys : [result?.winningTribeKey].filter(Boolean));
    const playerTribe = this.gameManager.getPlayerTribe?.();
    if (playerTribe?.id && winningKeys.has(playerTribe.id)) return true;
    if (playerTribe?.tribeName && winningKeys.has(playerTribe.tribeName)) return true;
    return false;
  }

  _isTooEarlyForVoteTalk() {
    const day = this.gameManager.getCurrentDay?.() || this.gameManager.day || 1;
    return day <= 1 && this._getConversationPhase() === 'pre';
  }

  _pickIntelTarget(survivor, context = {}) {
    if (context.topicPerson) {
      const target = this._getSurvivorByName(context.topicPerson);
      return { targetId: target?.id || null, targetName: context.topicPerson };
    }

    const memory = this.gameManager.systems?.socialMemorySystem;
    const recent = memory?.getMostMentionedNamesRecently?.(3, 2) || [];
    const pool = recent
      .map(entry => this._getSurvivorById(entry.id) || this._getSurvivorByName(entry.id))
      .filter(s => s && !s.isPlayer && s.id !== survivor.id);

    if (pool.length) {
      const pick = pool[getRandomInt(0, pool.length - 1)];
      return { targetId: pick.id || null, targetName: pick.firstName };
    }

    const fallback = this._pickTargetName(survivor, context);
    const fallbackSurvivor = this._getSurvivorByName(fallback);
    return { targetId: fallbackSurvivor?.id || null, targetName: fallback || null };
  }

  _getBestIntelForTarget(targetId, targetName) {
    const memory = this.gameManager.systems?.socialMemorySystem;
    if (!memory) return null;
    const idKey = targetId != null ? String(targetId) : null;
    const intel = memory.getRecentIntelAbout?.(idKey || targetName) || [];
    if (!intel.length) return null;
    const top = intel[0];
    if (top.type === 'alliance' && targetId) {
      const ally = this._pickAlliesForTarget(targetId, null)[0];
      return { ...top, allyName: ally?.firstName || null };
    }
    return top;
  }

  _pickAlliesForTarget(targetId, excludeId = null) {
    const relationshipSystem = this.gameManager.systems?.relationshipSystem;
    const pool = (this.gameManager.getPlayerTribe?.()?.members || this.gameManager.survivors || [])
      .filter(s => s.id !== targetId && !s.isPlayer && s.id !== excludeId);
    if (!pool.length) return [];

    const sorted = [...pool].sort((a, b) => {
      const relA = relationshipSystem?.getRelationship?.(targetId, a.id)?.value ?? 50;
      const relB = relationshipSystem?.getRelationship?.(targetId, b.id)?.value ?? 50;
      return relB - relA;
    });

    return sorted.slice(0, 2);
  }

  _getChallengePerformanceTag(targetId) {
    if (!targetId) return 'neutral';
    const results = challengeManager.getAllChallengeResults?.() || [];
    if (!results.length) return 'neutral';
    const latest = results[results.length - 1];
    const stagePerformance = latest?.stagePerformance || {};
    for (const info of Object.values(stagePerformance)) {
      if (info?.mvp?.survivorId === targetId) return 'mvp';
      if (info?.lvp?.survivorId === targetId) return 'lvp';
    }
    return 'neutral';
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
    context.npcProposedTargetName = safeTarget;
    context.npcProposedTargetId = context.topicId || context.targetId || this._getSurvivorByName(safeTarget)?.id || null;
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
      case 'info':
        return 'sharing information';
      case 'final2':
        return 'a final two deal';
      default:
        return 'mutual protection';
    }
  }

  _isDealIntent(intent) {
    return intent === 'deal' || [
      POST_PHASE_INTENTS.offer_deal_vote_together,
      POST_PHASE_INTENTS.offer_deal_share_info,
      POST_PHASE_INTENTS.offer_deal_protect,
      POST_PHASE_INTENTS.offer_deal_final2
    ].includes(intent);
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

    if (context.dealType === 'voteTogether' && this._isPlayerTribeSafeTonight()) {
      return {
        status: 'declined_politely',
        summary: `${survivor.firstName} shakes their head. "We’re safe tonight. I’m not locking votes yet."`,
        delta: -1
      };
    }

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
    if (context.dealType === 'final2') {
      score += this._relationshipBetween(player?.id, survivor.id) > 70 ? 8 : -6;
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

    const speakerId = speaker === 'Player' ? this.gameManager.getPlayerSurvivor?.()?.id : this._getSurvivorByName(speaker)?.id;
    const subjectId = this._getSurvivorByName(about)?.id || null;
    this._logSocialEvent({
      type: 'MENTION',
      speakerId,
      listenerId: null,
      subjectId,
      data: { context, tone }
    });

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

  _logSocialEvent({ type, speakerId, listenerId, subjectId = null, data = {} }) {
    const memory = this.gameManager.systems?.socialMemorySystem;
    const phase = this._getConversationPhase();
    const day = this.gameManager.getCurrentDay?.() || this.gameManager.day || 1;
    if (memory?.recordSocialEvent) {
      memory.recordSocialEvent({ type, speakerId, listenerId, subjectId, data, day, phase });
      return;
    }
    if (memory?.storeMemory) {
      memory.storeMemory(listenerId || speakerId, type, { speakerId, listenerId, subjectId, data, day, phase });
    }
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

  _computeNpcStance({ npc, player, intent, subjectId = null, context = {} }) {
    const relationshipSystem = this.gameManager.systems?.relationshipSystem;
    const socialMemory = this.gameManager.systems?.socialMemorySystem;
    const allianceSystem = this.gameManager.systems?.allianceSystem;
    const relationship = relationshipSystem?.getRelationship?.(player?.id, npc?.id)?.value ?? 50;
    const memoryTrust = socialMemory?.getTrust?.(npc?.id) ?? 50;
    const reliability = socialMemory?.getReliability?.(npc?.id) ?? 50;
    const allied = allianceSystem?.areAllied?.(player?.id, npc?.id) || false;
    const personality = (npc?.personality || npc?.gameplayStyle || '').toLowerCase();

    let score = (relationship * 0.6) + (memoryTrust * 0.3) + ((reliability - 50) * 0.1);
    if (allied) score += 8;
    if (personality.includes('paranoid')) score -= 6;
    if (personality.includes('deceptive') || personality.includes('shadow')) score -= 4;
    if (personality.includes('loyal') || personality.includes('honest')) score += 5;

    if (subjectId && [POST_PHASE_INTENTS.pitch_target, POST_PHASE_INTENTS.deflect_target, POST_PHASE_INTENTS.plant_seed].includes(intent)) {
      const subjectRel = relationshipSystem?.getRelationship?.(npc?.id, subjectId)?.value ?? 50;
      if (subjectRel > 65) score -= 15;
      if (subjectRel < 35) score += 8;
    }

    const memory = socialMemory?.getMemory?.(npc?.id);
    const recentLie = memory?.lies?.some(lie => lie.liarId === player?.id && !lie.discovered);
    if (recentLie) score -= 10;

    if (score >= 82) return 'committal';
    if (score >= 72) return 'supportive';
    if (score >= 62) return intent === POST_PHASE_INTENTS.plant_seed ? 'intrigued' : 'neutral';
    if (score >= 50) return 'evasive';
    if (score >= 40) return 'suspicious';
    if (score >= 30) return 'defensive';
    return 'hostile';
  }

  _getIntentRelationshipDelta(intent, stance) {
    if ([PRE_PHASE_INTENTS.bond_smalltalk, PRE_PHASE_INTENTS.bond_personal].includes(intent)) {
      return stance === 'supportive' || stance === 'committal' ? 2 : 1;
    }
    if ([PRE_PHASE_INTENTS.ask_general_info, POST_PHASE_INTENTS.ask_intel].includes(intent)) {
      return 1;
    }
    if ([POST_PHASE_INTENTS.offer_deal_vote_together, POST_PHASE_INTENTS.offer_deal_share_info, POST_PHASE_INTENTS.offer_deal_protect, POST_PHASE_INTENTS.offer_deal_final2].includes(intent)) {
      if (['committal', 'supportive'].includes(stance)) return 2;
      if (['hostile', 'defensive'].includes(stance)) return -2;
      return 0;
    }
    if ([PRE_PHASE_INTENTS.confront_rumor, PRE_PHASE_INTENTS.repair_relationship, POST_PHASE_INTENTS.verify_story].includes(intent)) {
      return intent === PRE_PHASE_INTENTS.repair_relationship ? 1 : -2;
    }
    if ([POST_PHASE_INTENTS.pitch_target, POST_PHASE_INTENTS.deflect_target, POST_PHASE_INTENTS.plant_seed].includes(intent)) {
      if (['committal', 'supportive'].includes(stance)) return 1;
      if (['hostile', 'defensive'].includes(stance)) return -3;
      return 0;
    }
    if (intent === POST_PHASE_INTENTS.threaten_pressure) return -4;
    return 0;
  }

  _pickNpcResponse(intent, stance, context = {}, survivor) {
    const templates = NPC_RESPONSE_TEMPLATES[intent];
    if (!templates) {
      return `${context.npcName || 'They'} consider it and stay noncommittal.`;
    }

    const pool = templates[stance] || templates.neutral || templates.supportive || Object.values(templates)[0] || [];
    if (!Array.isArray(pool) || pool.length === 0) {
      return `${context.npcName || 'They'} weigh the idea without committing.`;
    }

    let line = pool[getRandomInt(0, pool.length - 1)];
    const memory = this.gameManager.systems?.socialMemorySystem;
    let safety = 0;
    while (memory?.recentlyUsed?.(survivor?.id, line) && safety < 3) {
      line = pool[getRandomInt(0, pool.length - 1)];
      safety += 1;
    }
    memory?.rememberBeat?.(survivor?.id, intent, line);
    return line
      .replace('{npc}', context.npcName || survivor?.firstName || 'They')
      .replace('{subjectName}', context.subjectName || 'them');
  }

  _choiceKey(choice) {
    if (!choice) return '';
    const key = choice.id || choice.label || choice.action || '';
    return String(key).trim().toLowerCase();
  }

  _isNavChoice(choice) {
    const key = this._choiceKey(choice);
    return ['nav-back', 'nav-change-topic', 'nav-end-conversation', 'back', 'change topic', 'end conversation'].includes(key);
  }

  _buildNavChoices({ canBack, canChangeTopic, onBack, onChangeTopic, onEnd }) {
    const buttons = [];
    if (canBack) {
      buttons.push({ id: 'nav-back', label: 'Back', alt: true, action: 'goBack', onSelect: onBack });
    }
    if (canChangeTopic) {
      buttons.push({ id: 'nav-change-topic', label: 'Change Topic', alt: true, action: 'changeTopic', onSelect: onChangeTopic });
    }
    buttons.push({ id: 'nav-end-conversation', label: 'End Conversation', alt: true, end: true, action: 'endConversation', onSelect: onEnd || null });
    return buttons;
  }

  _dedupeChoices(choices = []) {
    const seen = new Set();
    const result = [];
    choices.forEach(choice => {
      const key = this._choiceKey(choice);
      if (!key || seen.has(key)) return;
      seen.add(key);
      result.push(choice);
    });
    return result;
  }

  _appendNavChoices(choices = [], navOptions = {}) {
    const trimmed = (Array.isArray(choices) ? choices : []).filter(choice => !this._isNavChoice(choice));
    const navChoices = this._buildNavChoices(navOptions);
    return this._dedupeChoices([...trimmed, ...navChoices]);
  }

  _appendNavButtonsToColumn(buttonColumn, navOptions = {}) {
    if (!buttonColumn) return;
    const existing = Array.from(buttonColumn.querySelectorAll('button'))
      .map(btn => String(btn.textContent || '').trim().toLowerCase())
      .filter(Boolean);
    const navChoices = this._buildNavChoices(navOptions);
    navChoices.forEach(choice => {
      const labelKey = this._choiceKey({ label: choice.label });
      if (existing.includes(labelKey)) return;
      const buttonEl = createElement('button', {
        className: `rect-button full${choice.alt ? ' alt' : ''}`,
        onclick: () => {
          if (choice.onSelect) choice.onSelect();
          if (choice.end && !choice.onSelect) this._clearOverlay();
        }
      }, choice.label);
      buttonColumn.appendChild(buttonEl);
    });
  }

  _buildNavOptions({ canBack, canChangeTopic, onBack, onChangeTopic, onEnd }) {
    return this._buildNavChoices({ canBack, canChangeTopic, onBack, onChangeTopic, onEnd });
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
    const dayValue = this.gameManager.getCurrentDay?.() || this.gameManager.day || 1;
    const phase = context.phase || this._getConversationPhase();
    const npcName = survivor.firstName;
    const targetLabel = topicName || this._getSurvivorById(targetId)?.firstName || null;

    memory.recordConversationIntent?.({
      npcId: survivor.id,
      withId: playerId,
      intent,
      targetId: targetId || context.targetId || null,
      targetName: topicName || null,
      day: dayValue,
      phase
    });

    const logSocial = (type, data = {}) => {
      this._logSocialEvent({
        type,
        speakerId: playerId || survivor.id,
        listenerId: survivor.id,
        subjectId: targetId || null,
        data: { ...data, intent, phase }
      });
    };

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
      case PRE_PHASE_INTENTS.check_trust:
        logSocial('TRUST_CHECK');
        break;
      case PRE_PHASE_INTENTS.confront_rumor:
        logSocial('CONFRONTATION');
        this._recordStructuredSocialEvent({
          type: 'ACCUSE_NAME',
          speakerId: playerId || survivor.id,
          listenerId: survivor.id,
          subjectId: survivor.id,
          data: { aboutId: playerId || null },
          summary: `You confronted ${npcName} about your name coming up.`
        });
        break;
      case PRE_PHASE_INTENTS.repair_relationship:
        logSocial('APOLOGY');
        break;
      case POST_PHASE_INTENTS.pitch_target:
        if (targetId) logSocial('TARGET_PUSH');
        if (targetId) {
          this._recordStructuredSocialEvent({
            type: 'PITCH_TARGET',
            speakerId: playerId || survivor.id,
            listenerId: survivor.id,
            subjectId: targetId,
            data: { strength: context.stance || 'soft' },
            summary: `You pitched ${targetLabel || 'a target'} to ${npcName}.`
          });
          this._recordStructuredSocialEvent({
            type: 'TARGET_PITCHED',
            speakerId: playerId || survivor.id,
            listenerId: survivor.id,
            subjectId: targetId,
            data: { targetName: targetLabel || null, outcome: this.state?.lastNpcStance || null },
            summary: `You pitched ${targetLabel || 'a target'} to ${npcName}.`
          });
          if (context.targetRejected) {
            this._recordStructuredSocialEvent({
              type: 'TARGET_REJECTED',
              speakerId: survivor.id,
              listenerId: playerId || survivor.id,
              subjectId: targetId,
              data: { targetName: targetLabel || null },
              summary: `${npcName} rejected the target pitch.`
            });
          }
        }
        break;
      case POST_PHASE_INTENTS.deflect_target:
        if (targetId) logSocial('TARGET_DEFLECT', { alternateId: context.alternateId, alternateName: context.alternateName });
        if (targetId) {
          this._recordStructuredSocialEvent({
            type: 'DEFLECT_TARGET',
            speakerId: playerId || survivor.id,
            listenerId: survivor.id,
            subjectId: targetId,
            data: { alternateId: context.alternateId || null },
            summary: `You tried to deflect heat off ${targetLabel || 'someone'} with ${npcName}.`
          });
        }
        break;
      case POST_PHASE_INTENTS.offer_deal_vote_together:
      case POST_PHASE_INTENTS.offer_deal_share_info:
      case POST_PHASE_INTENTS.offer_deal_protect:
      case POST_PHASE_INTENTS.offer_deal_final2: {
        logSocial('DEAL_OFFERED', { dealType: context.dealType || intent });
        if (dealOutcome?.status === 'accepted') logSocial('DEAL_ACCEPTED', { dealType: context.dealType || intent });
        if (dealOutcome?.status && dealOutcome.status.startsWith('declined')) logSocial('DEAL_DECLINED', { dealType: context.dealType || intent });
        this._recordStructuredSocialEvent({
          type: 'DEAL_OFFERED',
          speakerId: playerId || survivor.id,
          listenerId: survivor.id,
          subjectId: targetId || null,
          data: {
            participants: [playerId || survivor.id, survivor.id],
            dealType: context.dealType || intent,
            strength: dealOutcome?.status || 'offered'
          },
          summary: `You offered a deal to ${npcName}.`
        });
        if (dealOutcome?.status === 'accepted') {
          this._recordStructuredSocialEvent({
            type: 'DEAL_ACCEPTED',
            speakerId: survivor.id,
            listenerId: playerId || survivor.id,
            subjectId: targetId || null,
            data: { participants: [playerId || survivor.id, survivor.id], dealType: context.dealType || intent },
            summary: `${npcName} accepted your deal.`
          });
        }
        if (dealOutcome?.status && dealOutcome.status.startsWith('declined')) {
          this._recordStructuredSocialEvent({
            type: 'DEAL_REJECTED',
            speakerId: survivor.id,
            listenerId: playerId || survivor.id,
            subjectId: targetId || null,
            data: { participants: [playerId || survivor.id, survivor.id], dealType: context.dealType || intent },
            summary: `${npcName} declined your deal.`
          });
        }
        break;
      }
      case POST_PHASE_INTENTS.idol_suspicion:
        if (targetId) logSocial('IDOL_SUSPICION');
        if (targetId) {
          this._recordStructuredSocialEvent({
            type: 'IDOL_SUSPECTED',
            speakerId: playerId || survivor.id,
            listenerId: survivor.id,
            subjectId: targetId,
            data: { confidence: context.intelPayload?.confidence || 50 },
            summary: `You shared idol suspicion about ${targetLabel || 'someone'} with ${npcName}.`
          });
        }
        break;
      case POST_PHASE_INTENTS.verify_story:
        logSocial('RUMOR_SHARED', { verified: false });
        break;
      case POST_PHASE_INTENTS.alliance_commitment:
        logSocial('ALLIANCE_PLAN');
        break;
      case POST_PHASE_INTENTS.talk_specific_person: {
        if (context.subTopic === 'idol') logSocial('IDOL_SUSPICION');
        if (context.subTopic === 'nameHeard') logSocial('RUMOR_SHARED');
        if (context.subTopic === 'nameMentionedPlayer') logSocial('RUMOR_SHARED');
        if (context.subTopic === 'voteTonight') logSocial('TARGET_PUSH');
        if (targetId) {
          const sentiment = context.subTopic === 'dangerLater' ? 'negative' : context.subTopic === 'considerWork' ? 'positive' : 'neutral';
          this._recordStructuredSocialEvent({
            type: 'MENTION_NAME',
            speakerId: playerId || survivor.id,
            listenerId: survivor.id,
            subjectId: targetId,
            data: { sentiment },
            summary: `You talked about ${targetLabel || 'someone'} with ${npcName}.`
          });
          if (context.subTopic === 'idol') {
            this._recordStructuredSocialEvent({
              type: 'IDOL_SUSPICION_RAISED',
              speakerId: playerId || survivor.id,
              listenerId: survivor.id,
              subjectId: targetId,
              data: { targetName: targetLabel || null, confidence: context.intelPayload?.confidence || 50 },
              summary: `You raised idol suspicion about ${targetLabel || 'someone'} with ${npcName}.`
            });
          }
        }
        break;
      }
      case POST_PHASE_INTENTS.ask_intel:
      case PRE_PHASE_INTENTS.ask_general_info:
        logSocial('RUMOR_SHARED');
        break;
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
        logSocial('DEAL_OFFERED', { dealType: context.dealType || 'unspecified' });
        if (status === 'accepted') logSocial('DEAL_ACCEPTED', { dealType: context.dealType || 'unspecified' });
        if (status && status.startsWith('declined')) logSocial('DEAL_DECLINED', { dealType: context.dealType || 'unspecified' });
        break;
      }
      case POST_PHASE_INTENTS.challenge_performance:
        if (targetId) {
          logSocial('MENTION', { context: 'challenge_performance' });
          this._recordStructuredSocialEvent({
            type: 'CHALLENGE_PERFORMANCE_MENTIONED',
            speakerId: playerId || survivor.id,
            listenerId: survivor.id,
            subjectId: targetId,
            data: { targetName: targetLabel || null, location: context.location || null },
            summary: `You mentioned challenge performance about ${targetLabel || 'someone'} with ${npcName}.`
          });
        }
        break;
      case 'askIntel':
      case 'talkSpecific':
      case 'targeting':
        if (context.intelPayload?.aboutName) {
          this._logIntelPayload({
            payload: context.intelPayload,
            memory,
            playerId,
            survivorId: survivor.id,
            day: dayValue,
            phase
          });
        }
        break;
      default:
        break;
    }
  }

  _logIntelPayload({ payload, memory, playerId, survivorId, day, phase }) {
    if (!payload) return;
    const aboutName = payload.aboutName;
    const aboutId = payload.aboutId || this._getSurvivorByName(aboutName)?.id || null;
    const contextTag = payload.context || 'heard_rumor';
    const confidence = payload.confidence ?? null;
    const shortText = payload.shortText || '';

    const logNamed = (name, contextOverride = contextTag) => {
      memory.recordNamedIntel?.({
        about: name,
        context: contextOverride,
        from: payload.fromName || 'Unknown',
        day,
        phase,
        confidence,
        shortText
      });
    };

    if (aboutName) {
      logNamed(aboutName, contextTag);
    }

    if (contextTag === 'working_with' && Array.isArray(payload.mentionedNames)) {
      payload.mentionedNames.forEach(name => logNamed(name, 'working_with'));
    }

    if (contextTag === 'defend' || contextTag === 'bury') {
      if (aboutId) {
        memory.recordGossip?.(playerId || survivorId, survivorId, aboutId, contextTag, confidence ?? 'unknown');
      }
    }

    if (contextTag === 'target' && aboutId) {
      memory.recordTargetPreference?.(survivorId, aboutId, 'high', 'vote_tonight');
      memory.recordIntelEvent?.({
        type: 'target',
        about: aboutId,
        from: survivorId,
        to: playerId,
        day,
        phase,
        confidence,
        shortText
      });
    }

    if (payload.subTopic === 'voteIfAsked' && aboutId) {
      const accepted = payload.dealOutcome === 'accepted';
      memory.recordDeal?.(playerId || survivorId, survivorId, 'voteTogether', aboutId, accepted);
      if (accepted) {
        memory.recordPromise?.(survivorId, playerId, 'voteTogether');
      }
    }

    if (contextTag === 'idol_suspicion' || contextTag === 'challenge_comment' || contextTag === 'verify_rumor') {
      memory.recordIntelEvent?.({
        type: contextTag === 'idol_suspicion' ? 'idol' : contextTag === 'challenge_comment' ? 'challenge_comment' : 'warning',
        about: aboutId || aboutName,
        from: survivorId,
        to: playerId,
        day,
        phase,
        confidence,
        shortText
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
    this._clearApproachTimer();
    if (this.activeOverlay) {
      this.activeOverlay.remove();
      this.activeOverlay = null;
    }
    this.activeConversationContext = null;
    this.conversationSession = null;
    this.nodeSession = null;
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
