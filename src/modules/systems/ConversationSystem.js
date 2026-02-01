import eventManager, { GameEvents } from '../core/EventManager.js';
import { GameState, GamePhase } from '../core/GameManager.js';
import challengeManager from '../core/ChallengeManager.js';
import { createElement, clearChildren } from '../utils/DOMUtils.js';
import { getRandomInt } from '../utils/CommonUtils.js';
import timerManager from '../utils/TimerManager.js';
import socialEngine from './SocialEngine.js';
import { LocationKeys } from '../core/LocationKeys.js';
import { DealTypes } from './DealSystem.js';

// DEV NOTE (ConversationSystem)
// - Intents: player-facing actions (pre + post) are enumerated below and drive intent -> NPC response templates.
// - NPC stances: computed after each player intent from relationship, alliance, personality, and memory.
// - Phase gating: pre allows personal/light strategy; post only allows strategic intents + vote planning.
// - Memory logging: _logSocialEvent funnels structured records into SocialMemorySystem for later querying.

function resolveNpcDisclosure({ npc, player, kind, context = {} }) {
  const trustSystem = context.trustSystem || player?.gameManager?.systems?.trustSystem || npc?.gameManager?.systems?.trustSystem;
  const trustScore = Math.max(0, Math.min(100, typeof trustSystem?.getTrust === 'function'
    ? (trustSystem.getTrust(player?.id, npc?.id) ?? 50)
    : 50));
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

const CAMP_LOCATIONS = [
  LocationKeys.BEACH,
  LocationKeys.SHELTER,
  LocationKeys.CAMPFIRE,
  LocationKeys.WATER_WELL,
  LocationKeys.ROCKY_SHORE,
  LocationKeys.FORK1,
  LocationKeys.FORK2,
  LocationKeys.FORK3
];

const PRE_PHASE_INTENTS = {
  bond_smalltalk: 'bond_smalltalk',
  bond_personal: 'bond_personal',
  check_trust: 'check_trust',
  light_strategy: 'light_strategy',
  ask_general_info: 'ask_general_info',
  repair_relationship: 'repair_relationship',
  confront_rumor: 'confront_rumor'
};

const FOLLOWUP_ACTIONS = {
  PRESS: { key: 'PRESS', label: 'Press for specifics' },
  REASSURE: { key: 'REASSURE', label: 'Back off, keep it casual' },
  PIVOT: { key: 'PIVOT', label: 'Change the angle' },
  DROP: { key: 'DROP', label: 'Drop it' }
};

const INTEL_QUALITY = {
  NONE: 'NONE',
  VAGUE: 'VAGUE',
  PARTIAL: 'PARTIAL',
  CONCRETE: 'CONCRETE'
};

const PRE_CHALLENGE_TREE = {
  categories: [
    {
      id: 'build_connection',
      label: 'Build Connection',
      choices: [
        {
          id: 'BC1',
          buttonLabel: "Check in",
          tones: ['warm'],
          riskLevel: 0.2,
          responseModes: ['reassure', 'softTruth', 'deflect'],
          lines: [
            'How are you holding up today?',
            'You doing alright out here?',
            'Quick check-in—how’s your head?'
          ],
          outcomeTemplate: 'Result: {relDelta} Relationship. {trustDelta} Trust. You read: {intelVibe}.'
        },
        {
          id: 'BC2',
          buttonLabel: "Open up",
          tones: ['warm', 'personal'],
          riskLevel: 0.3,
          responseModes: ['reassure', 'counterQ', 'softTruth', 'deflect'],
          lines: [
            'This is gonna sound random, but back home I… {share}.',
            'Honestly, this reminds me of home in a weird way.'
          ],
          outcomeTemplate: 'Result: {relDelta} Relationship. {trustDelta} Trust. Risk: {riskLine}.'
        },
        {
          id: 'BC3',
          buttonLabel: "Praise effort",
          tones: ['warm'],
          riskLevel: 0.2,
          responseModes: ['reassure', 'softTruth', 'deflect'],
          lines: [
            'I noticed you’ve been grinding around camp. Respect.',
            'You’ve been pulling your weight—people see that.',
            'You’ve been solid today.'
          ],
          outcomeTemplate: 'Result: {relDelta} Relationship. {trustDelta} Trust. Reputation: helpful {repDeltaHelpful}.'
        },
        {
          id: 'BC4',
          buttonLabel: "Crack a joke",
          tones: ['playful'],
          riskLevel: 0.15,
          responseModes: ['reassure', 'softTruth', 'deflect'],
          lines: [
            'If we survive this rain, we deserve pizza.',
            'This is the glamorous part of Survivor, right?'
          ],
          outcomeTemplate: 'Result: {relDelta} Relationship. You eased tension slightly.'
        },
        {
          id: 'BC5',
          buttonLabel: "Do a task together",
          tones: ['warm', 'helpful'],
          riskLevel: 0.25,
          responseModes: ['truth', 'deflect', 'counterQ', 'reassure'],
          lines: [
            'Want to do a task together right now?',
            'Let’s knock out some work together—two birds.'
          ],
          outcomeTemplate: 'Result: {relDelta} Relationship. Teamwork noticed: helpful {repDeltaHelpful}. {intelIfDeclined}.'
        }
      ]
    },
    {
      id: 'read_room',
      label: 'Read the Room',
      choices: [
        {
          id: 'RR1',
          buttonLabel: "Camp vibe?",
          tones: ['neutral'],
          riskLevel: 0.35,
          responseModes: ['softTruth', 'truth', 'deflect'],
          lines: [
            'What’s the camp vibe today?',
            'How’s everyone feeling?',
            'Are we vibing or spiraling?'
          ],
          outcomeTemplate: 'Result: You learned: {campVibeIntel}. Risk: {riskLineOptional}.'
        },
        {
          id: 'RR2',
          buttonLabel: "Who seems off?",
          tones: ['neutral', 'direct'],
          riskLevel: 0.45,
          responseModes: ['softTruth', 'truth', 'counterQ', 'deflect', 'misdirect'],
          lines: [
            'Anyone seem off lately?',
            'You notice anyone acting different?'
          ],
          outcomeTemplate: 'Result: You learned: {behaviorIntel}. Suspicion {suspDelta}.'
        },
        {
          id: 'RR3',
          buttonLabel: "Where you at?",
          tones: ['warm'],
          riskLevel: 0.4,
          responseModes: ['softTruth', 'deflect', 'counterQ', 'truth'],
          lines: [
            'You feeling okay… game-wise?',
            'You feel alright about where you stand?'
          ],
          outcomeTemplate: 'Result: You learned: {comfortIntel}. Risk: {riskLine}.'
        },
        {
          id: 'RR4',
          buttonLabel: "Are you safe?",
          tones: ['direct'],
          riskLevel: 0.55,
          responseModes: ['deflect', 'counterQ', 'truth', 'misdirect'],
          lines: [
            'If we lose, are you safe?',
            'If we go to Tribal, are you good?'
          ],
          outcomeTemplate: 'Result: You learned: {safetyIntel}. Risk: probing raised suspicion.'
        },
        {
          id: 'RR5',
          buttonLabel: "Closest allies",
          tones: ['neutral'],
          riskLevel: 0.45,
          responseModes: ['softTruth', 'truth', 'deflect', 'misdirect'],
          lines: [
            'Who are you feeling closest to right now?',
            'Who have you been clicking with?'
          ],
          outcomeTemplate: 'Result: You mapped: {allyIntel}. Risk: {riskLineOptional}.'
        },
        {
          id: 'RR6',
          buttonLabel: "Are we good?",
          tones: ['warm'],
          riskLevel: 0.35,
          responseModes: ['reassure', 'softTruth', 'deflect', 'misdirect'],
          lines: [
            'Quick vibe check—are we still good?',
            'We good?'
          ],
          outcomeTemplate: 'Result: {trustDelta} Trust. Read: {toneRead}.'
        },
        {
          id: 'RR7',
          buttonLabel: "Where I stand",
          tones: ['direct'],
          riskLevel: 0.5,
          responseModes: ['truth', 'softTruth', 'deflect', 'counterQ', 'misdirect'],
          lines: [
            'Where do I stand with you?',
            'Be straight—am I good with you?'
          ],
          outcomeTemplate: 'Result: You learned: {standingIntel}. Risk: {riskLine}.'
        }
      ]
    },
    {
      id: 'talk_specific',
      label: 'Talk About Someone',
      targetPrompt: 'Who do you want to talk about?',
      choices: [
        {
          id: 'TS1',
          buttonLabel: "Trust {TARGET}?",
          tones: ['direct'],
          riskLevel: 0.45,
          responseModes: ['truth', 'softTruth', 'deflect', 'misdirect'],
          lines: [
            'Do you trust {TARGET}?'
          ],
          outcomeTemplate: 'Result: You gained a read on {TARGET}: {readIntel}. Risk: {riskLineOptional}.'
        },
        {
          id: 'TS2',
          buttonLabel: "Read on {TARGET}",
          tones: ['neutral'],
          riskLevel: 0.4,
          responseModes: ['softTruth', 'truth', 'deflect'],
          lines: [
            'What’s your real read on {TARGET}?'
          ],
          outcomeTemplate: 'Result: You learned: {targetReadIntel}.'
        },
        {
          id: 'TS3',
          buttonLabel: "Flag long-term",
          tones: ['strategic'],
          riskLevel: 0.55,
          responseModes: ['softTruth', 'truth', 'deflect', 'counterQ'],
          lines: [
            '{TARGET} feels dangerous down the line.'
          ],
          outcomeTemplate: 'Result: You planted a long-term threat idea about {TARGET}. Strategic impression {repDeltaStrategic}.'
        },
        {
          id: 'TS4',
          buttonLabel: "Idol suspicion",
          tones: ['direct'],
          riskLevel: 0.7,
          responseModes: ['deflect', 'softTruth', 'truth', 'misdirect'],
          lines: [
            'Think {TARGET} found something?'
          ],
          outcomeTemplate: 'Result: Idol suspicion around {TARGET} increased. Risk: you looked paranoid.'
        },
        {
          id: 'TS5',
          buttonLabel: "Why {TARGET}'s name?",
          tones: ['neutral'],
          riskLevel: 0.5,
          responseModes: ['softTruth', 'truth', 'deflect', 'misdirect'],
          lines: [
            '{TARGET}’s name keeps coming up—why?'
          ],
          outcomeTemplate: 'Result: You learned: {rumorIntel}. Pressure on {TARGET} increased.'
        },
        {
          id: 'TS6',
          buttonLabel: "Your name came up",
          tones: ['direct'],
          riskLevel: 0.8,
          responseModes: ['escalate', 'counterQ', 'truth', 'misdirect'],
          lines: [
            'I heard {TARGET} mentioned YOUR name.'
          ],
          outcomeTemplate: 'Result: Paranoia spiked. Risk: if this is false and spreads, you take the heat.'
        },
        {
          id: 'TS7',
          buttonLabel: "My name came up",
          tones: ['direct'],
          riskLevel: 0.55,
          responseModes: ['truth', 'softTruth', 'deflect', 'misdirect'],
          lines: [
            'I heard {TARGET} mentioned MY name.'
          ],
          outcomeTemplate: 'Result: You tested loyalty. You learned: {loyaltyIntel}.'
        },
        {
          id: 'TS8',
          buttonLabel: "Test loyalty",
          tones: ['strategic'],
          riskLevel: 0.55,
          responseModes: ['counterQ', 'reassure', 'deflect', 'misdirect'],
          lines: [
            'I might work with {TARGET} more.'
          ],
          outcomeTemplate: 'Result: You tested jealousy/loyalty. Reaction: {reactionIntel}.'
        },
        {
          id: 'TS9',
          buttonLabel: "Use as shield",
          tones: ['strategic'],
          riskLevel: 0.6,
          responseModes: ['softTruth', 'truth', 'deflect'],
          lines: [
            '{TARGET} could be a shield for us.'
          ],
          outcomeTemplate: 'Result: You proposed a shield concept. Strategic impression {repDeltaStrategic}.'
        }
      ]
    },
    {
      id: 'camp_life',
      label: 'Camp Life & Morale',
      choices: [
        {
          id: 'CL1',
          buttonLabel: "How's camp?",
          tones: ['warm'],
          riskLevel: 0.25,
          responseModes: ['truth', 'softTruth', 'deflect'],
          lines: [
            'How’s food/sleep/shelter treating you?'
          ],
          outcomeTemplate: 'Result: You learned: {stateIntel}. Relationship {relDelta}.'
        },
        {
          id: 'CL2',
          buttonLabel: "Morale check",
          tones: ['warm'],
          riskLevel: 0.3,
          responseModes: ['truth', 'softTruth', 'deflect'],
          lines: [
            'What’s your morale like today?'
          ],
          outcomeTemplate: 'Result: Morale read: {moraleIntel}.'
        },
        {
          id: 'CL3',
          buttonLabel: "What's bugging you?",
          tones: ['direct'],
          riskLevel: 0.4,
          responseModes: ['softTruth', 'truth', 'deflect', 'counterQ'],
          lines: [
            'What’s annoying you most right now?'
          ],
          outcomeTemplate: 'Result: You learned: {grievanceIntel}. Risk: {riskLineOptional}.'
        },
        {
          id: 'CL4',
          buttonLabel: "Reward talk",
          tones: ['warm'],
          riskLevel: 0.2,
          responseModes: ['reassure', 'softTruth', 'truth'],
          lines: [
            'If we win reward, what would you want?'
          ],
          outcomeTemplate: 'Result: You learned what drives them: {motiveIntel}.'
        },
        {
          id: 'CL5',
          buttonLabel: "Who’s working?",
          tones: ['strategic'],
          riskLevel: 0.55,
          responseModes: ['softTruth', 'truth', 'deflect', 'misdirect'],
          lines: [
            'Who’s pulling their weight around camp?'
          ],
          outcomeTemplate: 'Result: You got a work-ethic map. Risk: you looked like you’re building a case.'
        }
      ]
    },
    {
      id: 'idols_rumors',
      label: 'Idols & Rumors',
      choices: [
        {
          id: 'IR1',
          buttonLabel: "Anything weird?",
          tones: ['neutral'],
          riskLevel: 0.35,
          responseModes: ['softTruth', 'truth', 'deflect'],
          lines: [
            'Anything weird happening around camp?'
          ],
          outcomeTemplate: 'Result: You learned: {weirdIntel}.'
        },
        {
          id: 'IR2',
          buttonLabel: "Idol chatter",
          tones: ['direct'],
          riskLevel: 0.65,
          responseModes: ['deflect', 'softTruth', 'truth', 'misdirect'],
          lines: [
            'Heard any idol talk?'
          ],
          outcomeTemplate: 'Result: Idol chatter: {idolIntel}. Risk: asking raised suspicion.'
        },
        {
          id: 'IR3',
          buttonLabel: "Idol vibe",
          tones: ['direct'],
          riskLevel: 0.7,
          responseModes: ['deflect', 'counterQ', 'softTruth', 'misdirect', 'truth'],
          lines: [
            'Do you think someone has something?'
          ],
          outcomeTemplate: 'Result: You tested idol climate. Risk: you looked like you’re fishing.'
        },
        {
          id: 'IR4',
          buttonLabel: "Accuse idol",
          tones: ['direct'],
          riskLevel: 0.9,
          responseModes: ['escalate', 'counterQ', 'misdirect'],
          lines: [
            'I think YOU found something.'
          ],
          outcomeTemplate: 'Result: You applied pressure. Relationship suffered. Risk: you may become the target.'
        },
        {
          id: 'IR5',
          buttonLabel: "Clear my name",
          tones: ['neutral'],
          riskLevel: 0.45,
          responseModes: ['reassure', 'softTruth', 'deflect', 'counterQ'],
          lines: [
            'People assume I have something… it’s annoying.'
          ],
          outcomeTemplate: 'Result: You floated a perception play. You learned: {perceptionIntel}.'
        }
      ]
    },
    {
      id: 'strategy',
      label: 'Strategy',
      choices: [
        {
          id: 'ST1',
          buttonLabel: "Vote vibe",
          tones: ['strategic'],
          riskLevel: 0.55,
          responseModes: ['softTruth', 'truth', 'deflect', 'misdirect'],
          lines: [
            'If we lose, what kind of vote do you think it is?'
          ],
          outcomeTemplate: 'Result: You learned: {voteTypeIntel}. Strategic impression {repDeltaStrategic}.'
        },
        {
          id: 'ST2',
          buttonLabel: "Challenge worries",
          tones: ['strategic'],
          riskLevel: 0.5,
          responseModes: ['truth', 'softTruth', 'deflect'],
          lines: [
            'Who do you not want next to you in challenges?'
          ],
          outcomeTemplate: 'Result: You learned who worries them physically: {challengeIntel}.'
        },
        {
          id: 'ST3',
          buttonLabel: "Biggest threat",
          tones: ['strategic'],
          riskLevel: 0.7,
          responseModes: ['softTruth', 'truth', 'deflect', 'counterQ', 'misdirect'],
          lines: [
            'Who’s the biggest threat right now?'
          ],
          outcomeTemplate: 'Result: Threat map updated. Risk: you looked strategic.'
        },
        {
          id: 'ST4',
          buttonLabel: "Your vote?",
          tones: ['direct'],
          riskLevel: 0.85,
          responseModes: ['deflect', 'counterQ', 'misdirect', 'truth'],
          lines: [
            'If we lose, who’s your vote?'
          ],
          outcomeTemplate: 'Result: You pushed for a name. Result: {resultIntel}. Risk: high.'
        },
        {
          id: 'ST5',
          buttonLabel: "Do we have numbers?",
          tones: ['strategic'],
          riskLevel: 0.6,
          responseModes: ['truth', 'softTruth', 'deflect', 'counterQ'],
          lines: [
            'Do we have anything solid?'
          ],
          outcomeTemplate: 'Result: You checked alignment. You learned: {numbersIntel}.'
        },
        {
          id: 'ST6',
          buttonLabel: "Backup plan",
          tones: ['strategic'],
          riskLevel: 0.7,
          responseModes: ['truth', 'softTruth', 'deflect', 'counterQ', 'misdirect'],
          lines: [
            'If the plan blows up, what’s backup?'
          ],
          outcomeTemplate: 'Result: You explored contingencies. Strategic impression {repDeltaStrategic}. Risk: {riskLine}.'
        }
      ]
    },
    {
      id: 'confront_repair',
      label: 'Confront / Repair',
      choices: [
        {
          id: 'CR1',
          buttonLabel: "Call out tension",
          tones: ['direct'],
          riskLevel: 0.55,
          responseModes: ['reassure', 'deflect', 'counterQ', 'escalate', 'softTruth'],
          lines: [
            'Something feels off between us.'
          ],
          outcomeTemplate: 'Result: You surfaced tension. Read: {tensionIntel}.'
        },
        {
          id: 'CR2',
          buttonLabel: "Confront rumor",
          tones: ['direct'],
          riskLevel: 0.8,
          responseModes: ['escalate', 'deflect', 'counterQ', 'truth', 'misdirect'],
          lines: [
            'I heard you said something about me.'
          ],
          outcomeTemplate: 'Result: Confrontation triggered. Risk: high.'
        },
        {
          id: 'CR3',
          buttonLabel: "Clear the air",
          tones: ['warm'],
          riskLevel: 0.4,
          responseModes: ['reassure', 'softTruth', 'deflect'],
          lines: [
            'I want to clear the air.'
          ],
          outcomeTemplate: 'Result: Repair attempt: {repairResult}.'
        },
        {
          id: 'CR4',
          buttonLabel: "Apologize",
          tones: ['warm'],
          riskLevel: 0.35,
          responseModes: ['reassure', 'softTruth', 'deflect'],
          lines: [
            'I’m sorry about earlier.'
          ],
          outcomeTemplate: 'Result: Apology registered. Reliability {reliaDelta}.'
        },
        {
          id: 'CR5',
          buttonLabel: "Are you against me?",
          tones: ['direct'],
          riskLevel: 0.9,
          responseModes: ['deflect', 'counterQ', 'misdirect', 'truth'],
          lines: [
            'Be straight—are you against me?'
          ],
          outcomeTemplate: 'Result: High-pressure question. Result: {resultIntel}. Risk: very high.'
        }
      ]
    }
  ]
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
  offer_split_vote: 'offer_split_vote',
  plant_seed: 'plant_seed',
  verify_story: 'verify_story',
  threaten_pressure: 'threaten_pressure',
  alliance_commitment: 'alliance_commitment',
  challenge_debrief: 'challenge_debrief',
  idol_ask_found: 'idol_ask_found',
  idol_ask_who_has: 'idol_ask_who_has',
  idol_ask_looked_where: 'idol_ask_looked_where',
  idol_claim_have_truth: 'idol_claim_have_truth',
  idol_claim_have_lie: 'idol_claim_have_lie',
  idol_claim_other_has_lie: 'idol_claim_other_has_lie',
  idol_pressure_for_info: 'idol_pressure_for_info'
};

const PRE_CHALLENGE_PERSONAL_SHARES = [
  'ran a youth camp',
  'worked night shifts at a diner',
  'coach a team',
  'take care of my family',
  'restore old bikes',
  'volunteer at a community kitchen'
];

const PRE_CHALLENGE_INTEL_LIBRARY = {
  campVibe: [
    'camp energy feels tight around the water runs',
    'people are quiet and watching each other',
    'the mood is steady, but people are cautious',
    'everyone is smiling, but it feels guarded'
  ],
  behaviorShifts: [
    'someone is pulling away from group chats',
    'a couple people are suddenly very chatty',
    'people are keeping side conversations short'
  ],
  npcComfort: [
    'they feel okay but not locked',
    'they feel decent and don’t want to overplay',
    'they feel shaky and are keeping options open'
  ],
  safety: [
    'they think they’re fine if they keep the day calm',
    'they don’t feel locked and want to stay low',
    'they think it depends on the challenge outcome'
  ],
  closestAllies: [
    'they’re most aligned with a tight duo',
    'they’re clicking with a small core',
    'they feel closest to one person and a floater'
  ],
  playerStanding: [
    'you’re in their orbit but not locked',
    'they see you as a steady number',
    'they’re undecided and watching how you move'
  ],
  campState: [
    'sleep has been rough but manageable',
    'food’s low and tempers are shorter',
    'shelter is holding up, but morale is thin'
  ],
  morale: [
    'morale is steady, just tired',
    'people are on edge but not spiraling',
    'spirits are up but fake smiles linger'
  ],
  grievances: [
    'firewood runs are uneven',
    'someone keeps skipping chores',
    'shelter noise is getting under skin'
  ],
  motives: [
    'food and comfort',
    'a win for tribe pride',
    'a break from the social grind'
  ],
  workEthic: [
    'a couple people are coasting on others’ effort',
    'most are pulling weight, but one person stands out',
    'the workload is uneven and people notice'
  ],
  weirdStuff: [
    'there was a strange scramble near the tree line',
    'someone was up late poking around',
    'there’s a weird hush when idols come up'
  ],
  idolChatter: [
    'people keep circling the well about idols',
    'idol talk is low, but whispers are there',
    'names pop up, but nobody claims proof'
  ],
  perception: [
    'some think you’re playing hard but not obvious',
    'people think you’re social, not sneaky',
    'the tribe is split on whether you’re dangerous'
  ],
  voteType: [
    'an easy vote if things stay calm',
    'a threat-based swing if nerves rise',
    'a messy outsider vote if paranoia spikes'
  ],
  challengeTargets: [
    'a strong physical competitor makes them nervous',
    'they worry about someone who dominates puzzles',
    'they’re watching the stamina threats'
  ],
  threatRead: [
    'a big social connector feels dangerous',
    'a challenge beast is looming',
    'a quiet strategist is the real concern'
  ],
  alignment: [
    'numbers feel soft, but there’s a loose core',
    'there’s a shaky group of four',
    'nothing feels locked yet'
  ],
  contingency: [
    'split the vote if idols are in play',
    'pivot to the backup name quietly',
    'pull in a floater to stabilize'
  ],
  tension: [
    'there’s tension, but it’s repairable',
    'it feels stiff, like trust slipped',
    'there’s a chill they don’t want to name'
  ],
  repair: [
    'they accepted the reset',
    'they listened but stayed guarded',
    'they didn’t fully buy it'
  ],
  read: [
    'trusted',
    'uncertain',
    'slippery'
  ],
  targetRead: [
    'careful and quiet',
    'social but not controlling',
    'anxious and reactive'
  ],
  rumor: [
    'it sounds like small talk, not locked',
    'the story keeps coming from different mouths',
    'it feels like a slow build, not a push yet'
  ],
  loyalty: [
    'they don’t think your name is real',
    'they heard it once but it felt soft',
    'they think your name is in the mix'
  ],
  jealousy: [
    'they looked uneasy but tried to play it cool',
    'they brushed it off, but the pause said enough',
    'they said fine, but the vibe shifted'
  ]
};

const STRATEGY_APPROACHES = {
  TRUTHFUL: 'truthful',
  PERSUASIVE: 'persuasive',
  NEGOTIATE: 'negotiate',
  DEAL_MAKING: 'deal_making',
  MANIPULATE: 'manipulate',
  LIE: 'lie',
  PRESSURE: 'pressure'
};

const DETERMINISTIC_INTENTS = {
  INTEL_HEARING_NAMES: 'intel_hearing_names',
  INTEL_WHO_SEEMS_CLOSE: 'intel_who_seems_close',
  SOCIAL_HOW_DO_YOU_FEEL_ABOUT_ME: 'social_how_do_you_feel_about_me',
  SAFETY_ARE_YOU_SAFE: 'safety_are_you_safe',
  TRUST_WHO_DO_YOU_TRUST: 'trust_who_do_you_trust',
  STRATEGY_WHERE_IS_YOUR_HEAD_AT: 'strategy_where_is_your_head_at',
  RUMOR_SHARE_SMALL: 'rumor_share_small',
  DEAL_PROPOSE: 'deal_propose',
  DEAL_COUNTER: 'deal_counter',
  DEAL_ACCEPT_REJECT: 'deal_accept_reject'
};

const NPC_ACTION_VERBS = [
  'smiles',
  'nods',
  'shrugs',
  'laughs',
  'grins',
  'frowns',
  'leans',
  'exhales',
  'sighs',
  'stiffens',
  'softens',
  'glances',
  'studies',
  'tilts',
  'hesitates',
  'shakes',
  'winces',
  'smirks',
  'blinks',
  'raises',
  'lowers'
];

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
      '{npc} shakes their head. "I don’t put names on trust out loud."'
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
      '{npc} waves it off. "Too early to lock anything in."'
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
      '{npc} nods. "Yeah, {subjectName} really stood out in that challenge."'
    ],
    neutral: [
      '{npc} answers. "{subjectName} had a mixed showing."'
    ],
    defensive: [
      '{npc} tightens up. "People are too quick to judge challenges."'
    ]
  },
  pitch_target: {
    supportive: [
      '{npc} nods slowly. "I can see it. We keep it quiet and clean."'
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
      '{npc} nods. "I can try to redirect heat off {subjectName}."'
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
      '{npc} nods. "I’m in. If it’s you, it’s {subjectName}."'
    ],
    committal: [
      '{npc} leans in. "Alright. If we do it… {subjectName}."'
    ],
    evasive: [
      '{npc} hesitates. "I can’t promise that yet."'
    ]
  },
  offer_deal_share_info: {
    supportive: [
      '{npc} nods. "Info for info. I can do that."'
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
      '{npc} leans in and pushes a plan on {target}, watching your reaction.'
    ]
  },
  trust: {
    playerLead: [
      'You ask carefully, "Who do you trust most right now?"',
      'You check in on where {npc} feels solid.'
    ],
    npcLead: [
      '{npc} thinks for a moment. "Honestly… I probably trust {npcTrusted} the most right now."',
      '"If I\'m being straight with you, {npcTrusted} feels the most solid to me," {npc} admits.'
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
      'The air gets tense as {npc} stares you down about the rumors.'
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
      '{npc} chats about camp life and the next challenge. "We just have to stay steady."',
      'Together you evaluate shelter, fire, and challenge odds. {npc} nods. "We just need to keep the fire going."'
    ]
  },
  fun: {
    playerLead: [
      'You crack a joke about camp and {npc} laughs.',
      'You keep it light and the mood lifts.'
    ],
    npcLead: [
      '{npc} jokes about coconut crabs and you both laugh. "At least they’re not voting."',
      'The mood lightens as {npc} tells a ridiculous story. "You had to be there."'
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
      '{npc} smiles like they’re already a step ahead. "Just hear me out."'
    ]
  },
  protection: {
    playerLead: [
      'You quietly promise to watch {npc}\'s back.',
      'You offer cover if things get messy tonight.'
    ],
    npcLead: [
      'Quietly, {npc} promises to watch your back at the next vote. "I’ve got you."',
      '{npc} offers cover if things get messy tonight. "I’ll take the heat."'
    ]
  },
  wildcard: {
    playerLead: [
      'You ramble about idols, storms, and goats. It\'s chaos.',
      'You bounce between topics; {npc} tries to keep up.'
    ],
    npcLead: [
      'Out of nowhere, {npc} rambles about idols, storms, and goats. "Weird things happen out here."',
      '{npc} pivots between topics; the chaos is real. "Just roll with it."'
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
    { label: 'Lean in and share something too', playerLine: 'You lean in and share something personal to match the moment.', delta: 5, mood: 'happy', followup: '{npc} smiles. "That means a lot. I’m glad we can talk like this."' },
    { label: 'Nod but stay guarded', playerLine: 'You nod but keep your guard up.', delta: -1, mood: 'neutral', followup: '{npc} studies you. "Alright. I’ll keep it in mind."' },
    { label: 'Deflect with humor', playerLine: 'You deflect with a light joke to keep it easy.', delta: 1, mood: 'fun', followup: '{npc} chuckles. "Okay, fair enough."' }
  ],
  bonding_playerLead: [
    { label: 'Ask them to open up back', playerLine: 'You ask them to open up a bit in return.', delta: 4, mood: 'calm', followup: '{npc} nods. "Alright. I’ll give you something real too."' },
    { label: 'Let the moment breathe', playerLine: 'You let the moment breathe without pushing.', delta: 1, mood: 'neutral', followup: '{npc} gives a small nod. "I hear you."' },
    { label: 'Lighten it with a joke', playerLine: 'You lighten it with a quick joke.', delta: 2, mood: 'fun', followup: '{npc} laughs. "Okay, I needed that."' }
  ],
  personal: [
    { label: 'Thank them for sharing', playerLine: 'You thank them and keep your voice steady.', delta: 4, mood: 'calm', followup: '{npc} exhales. "Thanks for saying that."' },
    { label: 'Share your own vulnerability', playerLine: 'You share your own vulnerability in return.', delta: 6, mood: 'happy', followup: '{npc} softens. "I didn’t expect that—thanks for trusting me."' },
    { label: 'Change the subject', playerLine: 'You steer the conversation to something safer.', delta: -4, mood: 'irritated', followup: '{npc} pulls back. "Alright, we can move on."' }
  ],
  personal_playerLead: [
    { label: 'Ask how they relate', playerLine: 'You ask how they relate to what you just shared.', delta: 4, mood: 'calm', followup: '{npc} nods. "I get that. Here’s where I’m at..."' },
    { label: 'Hold the eye contact', playerLine: 'You hold the eye contact and let it land.', delta: 2, mood: 'neutral', followup: '{npc} nods quietly. "I hear you."' },
    { label: 'Change the subject gently', playerLine: 'You gently pivot the topic.', delta: -2, mood: 'neutral', followup: '{npc} accepts it. "Okay, fair."' }
  ],
  lightStrategy: [
    { label: 'Offer a soft take', playerLine: 'You float a soft, noncommittal read.', delta: 2, mood: 'calm', followup: '{npc} nods. "Yeah, that’s roughly where my head is too."' },
    { label: 'Ask who they are eyeing', playerLine: 'You ask who they are eyeing without pressing too hard.', delta: 1, mood: 'neutral', disclosureKind: 'whoAreYouEyeing', followup: '{npc} glances around, then admits, "I’m watching {target}."' },
    { label: 'Stay vague', playerLine: 'You stay vague and avoid names.', delta: -2, mood: 'suspicious', followup: '{npc} frowns. "Hard to know where you’re at if we don’t talk names."' }
  ],
  hardStrategy: [
    { label: 'Agree to push the plan', playerLine: 'You agree to push the plan for now.', delta: 3, mood: 'focused', followup: '{npc} nods. "Alright. Let’s move it."' },
    {
      label: 'Counter with another target',
      playerLine: 'You counter with another name instead.',
      delta: 1,
      mood: 'neutral',
      followup: '{npc} tilts their head. "Okay, tell me why that makes more sense."',
      requiresCounterTarget: true
    },
    { label: 'Refuse to commit', playerLine: 'You refuse to commit and keep it noncommittal.', delta: -5, mood: 'irritated', followup: '{npc} narrows their eyes. "So are you with me or not?"' }
  ],
  trust: [
    { label: 'Name a trusted ally', playerLine: 'You name someone you trust and watch their reaction.', delta: 2, mood: 'calm', followup: '{npc} nods. "Yeah, I feel pretty good about {playerAlly} too."', requiresAllyPicker: true, awaitsPicker: true },
    { label: 'Claim they are your #1', playerLine: 'You tell them they are your number one.', delta: 4, mood: 'happy', followup: '{npc} smiles. "I like hearing that."' },
    { label: 'Dodge the question', playerLine: 'You dodge and keep it vague.', delta: -3, mood: 'suspicious', followup: '{npc} raises a brow. "That’s… not an answer."' }
  ],
  gossip: [
    { label: 'Lean into the tea', playerLine: 'You lean in and trade a bit of gossip about {target}.', delta: 2, mood: 'fun', followup: '{npc} grins. "Yeah, I’ve heard some of that too."' },
    { label: 'Defend the target', playerLine: 'You push back and defend {target}.', delta: -3, mood: 'irritated', followup: '{npc} frowns. "Alright, we see it differently."' },
    { label: 'Steer away', playerLine: 'You steer away from the gossip.', delta: -1, mood: 'neutral', followup: '{npc} nods. "Fair. Let’s move on."' }
  ],
  confrontation: [
    { label: 'Stand your ground', playerLine: 'You stand your ground and don’t blink.', delta: -4, mood: 'angry', followup: '{npc} stiffens. "Alright, then we’re clear."' },
    { label: 'Apologize and explain', playerLine: 'You apologize and give your side calmly.', delta: 3, mood: 'calm', followup: '{npc} exhales. "Okay. I can work with that."' },
    { label: 'Flip it back on them', playerLine: 'You flip it back on them and demand answers.', delta: -2, mood: 'suspicious', followup: '{npc} narrows their eyes. "Easy. I’m not your enemy."' }
  ],
  playerConfront: [
    { label: 'Say you heard it directly', playerLine: 'You say you heard it directly and wait for their response.', delta: -1, mood: 'focused', followup: '{npc} swallows. "From who?" they ask.' },
    { label: 'Say it came through someone', playerLine: 'You say it came through someone else.', delta: 0, mood: 'neutral', followup: '{npc} glances around, trying to read you.' },
    { label: 'Name a source', playerLine: 'You name the source and stand by it.', delta: -2, mood: 'angry', followup: '{npc} bristles but listens. "Alright."', memoryTags: ['confront_source'] },
    { label: 'Back off / laugh it off', playerLine: 'You back off and let it go for now.', delta: 1, mood: 'calm', followup: '{npc} exhales. "Okay, cool."' }
  ],
  playerAccuse: [
    { label: 'Call out the lie directly', playerLine: 'You call out the lie directly.', delta: -3, mood: 'angry', followup: '{npc} denies it, but their eyes dart. "That’s not what I said."', memoryTags: ['accuse_lie'] },
    { label: 'Ask why they twisted things', playerLine: 'You ask why they twisted it.', delta: -1, mood: 'focused', followup: '{npc} fumbles. "It got blown up, that’s all."' },
    { label: 'Give them a chance to come clean', playerLine: 'You give them a chance to come clean.', delta: 2, mood: 'calm', followup: '{npc} hesitates. "Alright, here’s the truth..."' }
  ],
  apology: [
    { label: 'Offer a sincere apology', playerLine: 'You offer a sincere apology.', delta: 4, mood: 'calm', followup: '{npc} softens. "I appreciate that."' },
    { label: 'Clarify your side', playerLine: 'You clarify your side without getting heated.', delta: 0, mood: 'neutral', followup: '{npc} nods slowly. "Okay, I hear you."' },
    { label: 'Downplay the issue', playerLine: 'You downplay it and try to shrug it off.', delta: -3, mood: 'irritated', followup: '{npc} frowns. "Alright… if you say so."' }
  ],
  moodCheck: [
    { label: 'Show real concern', playerLine: 'You show real concern and ask how they are holding up.', delta: 3, mood: 'happy', followup: '{npc} softens. "Thanks for checking in."' },
    { label: 'Encourage them to push through', playerLine: 'You encourage them to push through it.', delta: 1, mood: 'neutral', followup: '{npc} nods. "Yeah, I’ll be alright."' },
    { label: 'Brush it off', playerLine: 'You brush it off and keep it light.', delta: -4, mood: 'irritated', followup: '{npc} tightens. "Okay."'}
  ],
  campTalk: [
    { label: 'Problem-solve together', playerLine: 'You problem-solve together about camp needs.', delta: 2, mood: 'calm', followup: '{npc} nods. "Yeah, let’s knock that out."' },
    { label: 'Praise their effort', playerLine: 'You praise their effort around camp.', delta: 3, mood: 'happy', followup: '{npc} smiles. "Thanks, I’m trying."' },
    { label: 'Complain about others', playerLine: 'You vent about camp frustrations.', delta: -2, mood: 'suspicious', followup: '{npc} shrugs. "Just be careful who hears that."' }
  ],
  fun: [
    { label: 'Add your own joke', playerLine: 'You add your own joke.', delta: 2, mood: 'happy', followup: '{npc} laughs. "Okay, that was good."' },
    { label: 'Play along', playerLine: 'You play along and keep it light.', delta: 1, mood: 'fun', followup: '{npc} grins. "Alright, we needed that."' },
    { label: 'Say it\'s not the time', playerLine: 'You say it’s not the time for jokes.', delta: -3, mood: 'irritated', followup: '{npc} frowns. "Yeah, fair."' }
  ],
  warning: [
    { label: 'Thank them and agree', playerLine: 'You thank them and agree to be cautious.', delta: 3, mood: 'calm', followup: '{npc} nods. "Good. Just keep it tight."' },
    { label: 'Ask for proof', playerLine: 'You ask for proof before buying it.', delta: 0, mood: 'suspicious', followup: '{npc} hesitates. "I don’t have hard proof, but it’s out there."' },
    { label: 'Dismiss the warning', playerLine: 'You dismiss the warning outright.', delta: -4, mood: 'angry', followup: '{npc} stiffens. "Alright, do you."' }
  ],
  manipulation: [
    { label: 'Play along to learn more', playerLine: 'You play along to learn more.', delta: 1, mood: 'neutral', followup: '{npc} nods, thinking they have you. "That’s what I like to hear."' },
    { label: 'Call out the spin', playerLine: 'You call out the spin directly.', delta: -3, mood: 'angry', followup: '{npc} bristles. "I’m just being straight with you."' },
    { label: 'Counter-offer a deal', playerLine: 'You counter-offer a deal instead.', delta: 2, mood: 'focused', followup: '{npc} tilts their head. "Alright, let’s hear it."' }
  ],
  protection: [
    { label: 'Accept the cover', playerLine: 'You accept the cover and nod.', delta: 3, mood: 'happy', followup: '{npc} smiles. "We’ve got each other."' },
    { label: 'Offer protection back', playerLine: 'You offer protection back.', delta: 4, mood: 'calm', followup: '{npc} nods. "Alright, mutual then."' },
    { label: 'Question their motive', playerLine: 'You question their motive carefully.', delta: -2, mood: 'suspicious', followup: '{npc} frowns. "I’m trying to help you, but fine."' }
  ],
  wildcard: [
    { label: 'Just roll with it', playerLine: 'You roll with it and keep the vibe light.', delta: 1, mood: 'fun', followup: '{npc} laughs. "Alright, let’s ride it out."' },
    { label: 'Try to focus them', playerLine: 'You try to focus them back on the point.', delta: -1, mood: 'neutral', followup: '{npc} nods. "Okay, okay—what’s the move?"' },
    { label: 'Back away slowly', playerLine: 'You back away and let the conversation fade.', delta: -2, mood: 'irritated', followup: '{npc} notices. "Alright, then."' }
  ],
  deal: [
    { label: 'Pitch it confidently', playerLine: 'You pitch the deal confidently.', delta: 3, mood: 'focused', followup: '{npc} listens. "Okay, walk me through {dealTopic}."' },
    { label: 'Offer flexibility', playerLine: 'You offer flexibility on the terms.', delta: 2, mood: 'calm', followup: '{npc} nods. "I can work with that."' },
    { label: 'Feel them out first', playerLine: 'You feel them out before locking anything in.', delta: 1, mood: 'neutral', followup: '{npc} says, "Alright, what are you thinking?"' }
  ],
  askIntel: [
    { label: 'Thanks for the heads-up', playerLine: 'You thank them and keep it close to the chest.', delta: 2, mood: 'calm', followup: '{npc} nods. "Just keep it tight."' },
    { label: 'Ask for more detail', playerLine: 'You ask for more detail without pushing too hard.', delta: 1, mood: 'focused', followup: '{npc} says, "Here’s what I heard..."' },
    { label: 'Offer to trade info', playerLine: 'You offer to trade a small piece of info.', delta: 2, mood: 'happy', followup: '{npc} considers it. "Alright, what do you have?"' }
  ],
  talkSpecific: [
    { label: 'Take it in and move on', playerLine: 'You take it in and move on.', delta: 1, mood: 'neutral', followup: '{npc} nods. "Yeah, that’s where I’m at."' },
    { label: 'Ask a quick follow-up', playerLine: 'You ask a quick follow-up.', delta: 1, mood: 'focused', followup: '{npc} answers. "Here’s the detail..."' },
    { label: 'Back off for now', playerLine: 'You back off for now and let it sit.', delta: 0, mood: 'calm', followup: '{npc} says, "Alright, we can leave it there."' }
  ],
  targeting: [
    { label: 'Share your own name', playerLine: 'You share a name and watch for the reaction.', delta: 2, mood: 'focused', followup: '{npc} nods. "Okay, I hear you."', requiresTargetPicker: true },
    { label: 'Stay vague', playerLine: 'You stay vague and avoid naming anyone.', delta: -1, mood: 'suspicious', followup: '{npc} frowns. "That doesn’t tell me much."' },
    { label: 'Counter with another target', playerLine: 'You counter with another target.', delta: 1, mood: 'neutral', followup: '{npc} considers it. "Maybe. Tell me why."', requiresCounterTarget: true }
  ],
  allianceInvite: [
    { key: 'acceptFaithful', label: 'I’m in. Let’s work together.' },
    { key: 'acceptFake', label: 'Sure… I’m in.' },
    { key: 'conditional', label: 'Only if we pull in one more person.' },
    { key: 'softDecline', label: 'Not right now.' },
    { key: 'hardDecline', label: 'No chance.' }
  ],
  confrontSourceResponse: [
    { key: 'protectSource', label: 'I’m not burning my source — just tell me if it’s true.', nextStep: 'confrontResolve' },
    { key: 'nameSource', label: '(Name a source)', action: 'pickSource', awaitsPicker: true, nextStep: 'confrontResolve' },
    { key: 'deescalate', label: 'You know what, forget it.', nextStep: 'confrontResolve' },
    { key: 'escalate', label: 'If you’re coming for me, just say it.', nextStep: 'confrontResolve' }
  ],
  nameDropSource: [
    { key: 'heardSelf', label: 'I heard it myself.', nextStep: 'nameDropAskDetails' },
    { key: 'someoneTold', label: 'Someone told me.', action: 'pickSource', awaitsPicker: true, nextStep: 'nameDropSourceResolve' },
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
    this.activeConversation = null;
    this._nodeIdCounter = 0;
    this._memoryLog = [];
    this.npcMemory = {};
    this.activeExchange = null;
    this.debugStructuredConvo = false;
  }

  initialize() {
    eventManager.subscribe(GameEvents.NPC_CONFRONTATION, this._handleNpcConfrontation.bind(this));
    eventManager.subscribe(GameEvents.GAME_PHASE_CHANGED, this._handlePhaseChange.bind(this));
    eventManager.subscribe(GameEvents.CAMP_VIEW_LOADED, this._handleCampViewLoaded.bind(this));
    eventManager.subscribe(GameEvents.CAMP_EVENT_STARTED, this._pauseForCampEvent.bind(this));
    eventManager.subscribe(GameEvents.CAMP_EVENT_ENDED, this._resumeAfterCampEvent.bind(this));
    if (typeof window !== 'undefined') {
      window.runConversationQA = () => this._runConversationQA();
      window.ConversationSystem = window.ConversationSystem || {};
      window.ConversationSystem.validate = () => this.validate();
      window.ConversationSystem.validateMenus = () => this.validateMenus();
      window.ConversationSystem.runSelfTest = () => this.runSelfTest();
    }
  }

  adjustTrust(idA, idB, delta, reason = 'legacy_adjustTrust') {
    if (!idA || !idB || !Number.isFinite(delta) || delta === 0) return;
    this.gameManager?.changeTrust?.(idA, idB, delta, reason);
  }

  _getConversationSystems() {
    return {
      trustSystem: this.gameManager?.systems?.trustSystem || null,
      relationshipSystem: this.gameManager?.systems?.relationshipSystem || null,
      allianceSystem: this.gameManager?.systems?.allianceSystem || null,
      dealSystem: this.gameManager?.systems?.dealSystem || null,
      dealConsequencesSystem: this.gameManager?.systems?.dealConsequencesSystem || null
    };
  }

  _getPairTrust(playerId, npcId) {
    if (!playerId || !npcId) return 50;
    return this.gameManager?.getTrust?.(playerId, npcId) ?? 50;
  }

  _getRelationshipValue(playerId, npcId) {
    const relationshipSystem = this.gameManager?.systems?.relationshipSystem;
    const rel = relationshipSystem?.getRelationship?.(playerId, npcId);
    return typeof rel?.value === 'number' ? rel.value : 50;
  }

  _clampStat(value, min = 0, max = 100) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return min;
    return Math.max(min, Math.min(max, numeric));
  }

  _applyTrustDelta(playerId, npcId, delta, contextTag = 'conversation') {
    if (!Number.isFinite(delta) || delta === 0) return;
    this.gameManager?.changeTrust?.(playerId, npcId, delta, contextTag);
  }

  _applyRelationshipDelta(playerId, npcId, delta, contextTag = 'conversation') {
    if (!Number.isFinite(delta) || delta === 0) return;
    const relationshipSystem = this.gameManager?.systems?.relationshipSystem;
    relationshipSystem?.changeRelationship?.(playerId, npcId, delta);
    const log = ensureCampSocialChanges();
    log.relationship.push({ id: npcId, with: this._getSurvivorById(npcId)?.firstName || 'NPC', amount: delta, context: contextTag });
  }

  _applySuspicionDelta(survivor, delta, contextTag = 'conversation') {
    if (!survivor || !Number.isFinite(delta) || delta === 0) return;
    survivor.suspicion = this._clampStat((survivor.suspicion ?? 0) + delta);
    const log = ensureCampSocialChanges();
    log.suspicion.push({ id: survivor.id, with: survivor.firstName || 'NPC', amount: delta, context: contextTag });
  }

  _applyThreatDelta(survivor, delta) {
    if (!survivor || !Number.isFinite(delta) || delta === 0) return;
    survivor.threat = this._clampStat((survivor.threat ?? 0) + delta);
  }

  _applyParanoiaDelta(survivor, delta) {
    if (!survivor || !Number.isFinite(delta) || delta === 0) return;
    survivor.paranoia = this._clampStat((survivor.paranoia ?? 0) + delta);
  }

  _getNpcMemory(npcId) {
    if (!npcId) return null;
    if (!this.npcMemory[npcId]) {
      this.npcMemory[npcId] = {
        intel: [],
        flags: {},
        gossipCount: 0,
        lastTargets: []
      };
    }
    return this.npcMemory[npcId];
  }

  _recordIntel(npcId, intel) {
    const memory = this._getNpcMemory(npcId);
    if (!memory) return;
    memory.intel.push({ ...intel, timestamp: Date.now() });
    if (this._isConversationDebugEnabled()) {
      this._debugLog('[CONVO-DEBUG] Intel recorded', intel);
    }
  }

  _setIntelFlag(survivor, flagKey, value = true) {
    if (!survivor) return;
    survivor._intelFlags = survivor._intelFlags || {};
    survivor._intelFlags[flagKey] = value;
  }

  decideNpcResponseMode({ player, npc, topic, riskLevel = 0.3, isAllianceContext = false, isDealRequest = false, askedForNames = false, pressuring = false }) {
    const trustScore = this._getPairTrust(player?.id, npc?.id);
    const relationshipScore = this._getRelationshipValue(player?.id, npc?.id);
    const paranoia = npc?.paranoia ?? 0;
    const suspicion = npc?.suspicion ?? 0;
    const style = (npc?.gameplayStyle || npc?.personality || '').toLowerCase();

    let openness = (trustScore * 0.5 + relationshipScore * 0.4) / 100;
    openness -= (paranoia + suspicion) / 220;
    openness -= riskLevel * 0.25;
    if (style.includes('social')) openness += 0.08;
    if (style.includes('shadow') || style.includes('power')) openness -= 0.08;
    if (isAllianceContext) openness += 0.06;
    if (isDealRequest) openness -= 0.04;
    if (pressuring) openness -= 0.08;
    openness = this._clampStat(openness, 0, 1);

    let mode = 'guarded';
    if (openness >= 0.72) mode = 'truth';
    else if (openness >= 0.58) mode = 'softTruth';
    else if (openness >= 0.45) mode = askedForNames ? 'deflect' : 'guarded';
    else if (pressuring || askedForNames) mode = 'counterQ';
    else mode = style.includes('shadow') || style.includes('power') ? 'lie' : 'deflect';

    if (pressuring && openness < 0.4) mode = 'escalate';
    if (topic === 'build_connection' && openness > 0.6) mode = 'reassure';

    if (this._isConversationDebugEnabled()) {
      this._debugLog('[CONVO-DEBUG] Response mode', { mode, openness, topic, npc: npc?.firstName, trustScore, relationshipScore });
    }

    return { mode, openness };
  }

  _debugLog(...args) {
    if (!this._isConversationDebugEnabled()) return;
    console.log(...args);
  }

  _hasRecentEvent(context = {}) {
    return Boolean(context?.journeyEvent || context?.day1Event || context?.recentEvent || context?.eventJustHappened || context?.journeyResult);
  }

  _getTribeMembers({ includeNpc = true, includePlayer = false, npcId = null } = {}) {
    const tribe = this.gameManager?.getPlayerTribe?.();
    if (!tribe?.members) return [];
    return tribe.members.filter(member => {
      if (!includePlayer && member.id === this.gameManager?.player?.id) return false;
      if (!includeNpc && npcId && member.id === npcId) return false;
      return true;
    });
  }

  _pickWorstStat(npc) {
    if (!npc) return { key: 'steady', line: 'I’m alright. Just trying to stay steady and not overthink everything.' };
    const stats = [
      { key: 'health', value: npc.health ?? 100, badLow: true, line: 'Honestly I’m beat up. I’m trying to push through but my body’s hurting.' },
      { key: 'hunger', value: npc.hunger ?? 100, badLow: true, line: 'I’m starving. It’s hard to think straight when you’re running empty.' },
      { key: 'water', value: npc.water ?? 100, badLow: true, line: 'My mouth’s like sandpaper. I need water bad.' },
      { key: 'rest', value: npc.rest ?? 100, badLow: true, line: 'I’m running on fumes. I barely slept.' }
    ];
    const paranoia = npc.paranoia ?? 0;
    if (paranoia >= 70) {
      return { key: 'paranoia', line: 'I’m hanging in… but I’m not sleeping easy. Out here, you never know.' };
    }
    const sorted = stats.sort((a, b) => a.value - b.value);
    const worst = sorted[0];
    if (worst.value < 45) return worst;
    return { key: 'steady', line: 'I’m alright. Just trying to stay steady and not overthink everything.' };
  }

  _renderMenu(npc, text, options, { onBack = null, showEnd = true } = {}) {
    const overlay = this._buildOverlayShell(npc, { reuse: true });
    const content = this._getConversationContent(overlay);
    this._clearConversationContent(content);
    const parchment = this._buildParchment(text || '');

    const buttonColumn = createElement('div', {
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        marginTop: '12px',
        width: '100%'
      }
    });

    const buttons = [...options];
    if (onBack) buttons.push({ label: 'Back', alt: true, onClick: onBack });
    if (showEnd) buttons.push({ label: 'End chat', alt: true, onClick: () => this.closeConversation('player_end') });

    buttons.forEach(({ label, alt = false, onClick, disabled = false, tooltip = '' }) => {
      const btn = this._createChoiceButton({ label, alt, onClick, fallback: { npc } });
      if (disabled) {
        btn.disabled = true;
        btn.style.opacity = '0.55';
        btn.style.cursor = 'not-allowed';
      }
      if (tooltip) {
        btn.title = tooltip;
      }
      buttonColumn.appendChild(btn);
    });

    parchment.appendChild(buttonColumn);
    content.appendChild(parchment);
  }

  _renderPickList({ npc, title, candidates, onPick, onBack }) {
    const listLines = candidates.map((member, index) => `${index + 1}) ${member.firstName}`).join('<br>');
    const body = `${title}<br><br>${listLines}`;
    const buttons = candidates.map((member, index) => ({
      label: `Pick ${index + 1}`,
      onClick: () => onPick(member)
    }));
    this._renderMenu(npc, body, buttons, { onBack });
  }

  _applyExchangeEffects({ player, npc, deltas = {}, contextTag = 'conversation' }) {
    const trustDelta = deltas.trust ?? 0;
    const relationshipDelta = deltas.relationship ?? 0;
    const suspicionDelta = deltas.suspicion ?? 0;
    const threatDelta = deltas.threat ?? 0;
    const paranoiaDelta = deltas.paranoia ?? 0;

    if (relationshipDelta) this._applyRelationshipDelta(player.id, npc.id, relationshipDelta, contextTag);
    if (trustDelta) {
      this._applyTrustDelta(player.id, npc.id, trustDelta, contextTag);
      const log = ensureCampSocialChanges();
      log.trust.push({ id: npc.id, with: npc.firstName || 'NPC', amount: trustDelta, context: contextTag });
    }
    if (suspicionDelta) this._applySuspicionDelta(player, suspicionDelta, contextTag);
    if (threatDelta) this._applyThreatDelta(player, threatDelta);
    if (paranoiaDelta) this._applyParanoiaDelta(npc, paranoiaDelta);

    if (this._isConversationDebugEnabled()) {
      this._debugLog('[CONVO-DEBUG] Effects applied', { trustDelta, relationshipDelta, suspicionDelta, threatDelta, paranoiaDelta });
    }
  }

  _runConversationNode({ npc, player, node, context, returnTo }) {
    if (!node) return;
    const responseMode = this.decideNpcResponseMode({
      player,
      npc,
      topic: context.mainTopicId,
      riskLevel: node.riskLevel ?? 0.3,
      isAllianceContext: context.mainTopicId === 'strategy' && context.subTopicId === 'alliances',
      isDealRequest: context.subTopicId === 'offer_deal',
      askedForNames: Boolean(node.askedForNames),
      pressuring: Boolean(node.pressuring)
    });

    const playerLine = typeof node.playerLine === 'function'
      ? node.playerLine({ player, npc, context })
      : node.playerLine;
    const npcReply = node.npcResponseGenerator({ player, npc, context, responseMode });

    const followupNodes = typeof node.nextNodes === 'function'
      ? node.nextNodes({ player, npc, context, responseMode })
      : (node.nextNodes || []);

    const afterReply = () => {
      if (typeof node.effects === 'function') {
        node.effects({ player, npc, context, responseMode });
      }
      if (typeof node.afterReply === 'function') {
        node.afterReply({ player, npc, context, responseMode });
        return;
      }
      const followupButtons = followupNodes.map(nextNode => ({
        label: nextNode.buttonText,
        onClick: () => this._runConversationNode({
          npc,
          player,
          node: nextNode,
          context,
          returnTo
        })
      }));
      this._renderMenu(npc, npcReply, followupButtons, { onBack: returnTo, showEnd: true });
    };

    this._renderConversationOverlay(npc, playerLine, [
      { label: 'Continue', onClick: afterReply }
    ]);
  }

  /**
   * Allow other systems (e.g., SocialEngine) to start a conversation using
   * the shared conversation UI and memory/relationship hooks.
   * @param {Object} survivor - The NPC initiating the talk
   * @param {string} type - High-level conversation type from SocialEngine
   * @param {Object} options - Additional optional data
   */
  startNpcConversation(survivor, type, options = {}) {
    if (!survivor || !this._isInCamp() || this.gameManager.flags?.campEventActive) return;
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
    if (!npcId || !this._isInCamp() || this.gameManager.flags?.campEventActive) return;
    const survivor = this._getSurvivorById(npcId);
    if (!survivor) return;

    const normalizedPhase = this._normalizePhase(phase);
    const location = context.location || (typeof window !== 'undefined' ? window?.campScreen?.currentView : null);
    const initiator = context.initiatedByNpc ? 'npc' : (context.initiator || 'player');
    if (initiator === 'player' && !context.initiatedByNpc) {
      this.startPlayerConversation({ npcId, phase: normalizedPhase, socialType, context: { ...context, initiator } });
      return;
    }
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

  /**
   * Entry point for player-initiated conversations.
   */
  startPlayerConversation({ npcId, phase, socialType = null, context = {} }) {
    if (!npcId || !this._isInCamp() || this.gameManager.flags?.campEventActive) return;
    const survivor = this._getSurvivorById(npcId);
    if (!survivor) return;

    const normalizedPhase = this._normalizePhase(phase);
    const location = context.location || (typeof window !== 'undefined' ? window?.campScreen?.currentView : null);
    const intent = socialType ? this._mapSocialTypeToIntent(socialType, normalizedPhase) : null;
    const seededContext = {
      ...context,
      initiator: 'player',
      initiatedByNpc: false,
      phase: normalizedPhase,
      location,
      forceNodeFlow: true
    };

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
          context: { ...(seededContext || {}), initiator: 'player', phase: normalizedPhase }
        });
      } else {
        this._showTopicSelection(survivor, location);
      }
    };

    beginConversation();
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
    if (!this._isInCamp() || !survivor || this.gameManager.flags?.campEventActive) return;

    const normalizedLocation = this._normalizeLocationKey(location);
    const pending = this.pendingMeetings.find(
      meeting => meeting.npcId === survivor.id && meeting.normalizedLocation === normalizedLocation && !meeting.hasTriggered
    );
    if (pending) {
      pending.hasTriggered = true;
      const intentOverride = pending.intent?.intent
        ? this._mapSocialTypeToIntent(pending.intent.intent, this._normalizePhase(pending.phase))
        : null;
      this._startConversation(survivor, {
        isPurpose: true,
        meeting: pending,
        location,
        intentOverride,
        context: {
          initiator: 'npc',
          initiatedByNpc: true,
          location: pending.intent?.location || location || null,
          reasons: pending.intent?.reasons || [],
          targetId: pending.intent?.targetId || null,
          targetName: pending.intent?.targetName || null,
          socialType: pending.intent?.intent || null,
          phase: this._normalizePhase(pending.phase),
          lastChallengeSummary: this.gameManager.lastChallengeSummary || null
        }
      });
      return;
    }

    this._showTopicSelection(survivor, location);
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

    if (phase === GamePhase.PRE_CHALLENGE || phase === GamePhase.POST_CHALLENGE) {
      this._clearPendingMeetings(false);
      this._queuePhaseInvitations(phase);
    } else {
      this._clearPendingMeetings(true);
    }
  }

  _handleCampViewLoaded({ viewName }) {
    if (!this._isInCamp() || this.gameManager.flags?.campEventActive) return;

    const normalizedView = this._normalizeLocationKey(viewName);
    const meeting = this.pendingMeetings.find(
      item => item.normalizedLocation === normalizedView && !item.hasTriggered
    );
    if (meeting) {
      meeting.hasTriggered = true;
      const survivor = this._getSurvivorById(meeting.npcId);
      if (survivor) {
        const intentOverride = meeting.intent?.intent
          ? this._mapSocialTypeToIntent(meeting.intent.intent, this._normalizePhase(meeting.phase))
          : null;
        this._startConversation(survivor, {
          isPurpose: true,
          meeting,
          location: viewName,
          intentOverride,
          context: {
            initiator: 'npc',
            initiatedByNpc: true,
            location: meeting.intent?.location || viewName || null,
            reasons: meeting.intent?.reasons || [],
            targetId: meeting.intent?.targetId || null,
            targetName: meeting.intent?.targetName || null,
            socialType: meeting.intent?.intent || null,
            phase: this._normalizePhase(meeting.phase),
            lastChallengeSummary: this.gameManager.lastChallengeSummary || null
          }
        });
      }
    }
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

  _queuePhaseInvitations(phase) {
    if (this.gameManager.flags?.campEventActive) return;
    const phaseType = this._normalizePhase(phase);
    socialEngine?.runOffscreenNpcChatter?.({ phaseType, beatId: 'phaseIntro' });
    this._scheduleMeetingInvitation(phase, 'phaseIntro');

    if (this.midPhaseTimerId) {
      timerManager.clearTimeout(this.midPhaseTimerId);
    }

    this.midPhaseTimerId = timerManager.setTimeout(
      `conversation-mid-${phase}-${this.gameManager.day}`,
      () => {
        if (this._isInCamp() && this.gameManager.gamePhase === phase) {
          socialEngine?.runOffscreenNpcChatter?.({ phaseType, beatId: 'midPhase' });
          this._scheduleMeetingInvitation(phase, 'midPhase');
        }
      },
      60000
    );
  }

  _scheduleMeetingInvitation(phase, type) {
    if (this.gameManager.flags?.campEventActive) return;
    const phaseType = this._normalizePhase(phase);
    const currentView = typeof window !== 'undefined' ? window?.campScreen?.currentView : null;
    const plannedIntent = socialEngine?.shouldTriggerBeatNow?.({ phaseType })
      ? socialEngine?.pickBestIntentForPlayer?.({ phaseType, currentView })
      : null;
    const npc = plannedIntent?.npcId ? this._getSurvivorById(plannedIntent.npcId) : this._pickConversationNpc();
    if (!npc) return;

    const fallbackLocation = CAMP_LOCATIONS[getRandomInt(0, CAMP_LOCATIONS.length - 1)];
    const location = plannedIntent?.location || fallbackLocation;
    const normalizedLocation = this._normalizeLocationKey(location);
    const meeting = {
      phase: phaseType,
      npcId: npc.id,
      location,
      normalizedLocation,
      hasTriggered: false,
      type,
      socialType: plannedIntent?.intent || null,
      intent: plannedIntent || null
    };

    this.pendingMeetings.push(meeting);
    this._highlightNpcIcon(npc.id, true);
    this._showInvitationToast(npc, location, type);

    if (
      this._normalizeLocationKey(currentView) === normalizedLocation &&
      this._isInCamp() &&
      !this.gameManager.flags?.campEventActive
    ) {
      this._handleCampViewLoaded({ viewName: location });
    }
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
    const player = this.gameManager.getPlayerSurvivor?.();
    if (!player || !survivor) return;
    const context = this._normalizeConversationContext({
      ...(this.activeConversationContext || {}),
      location,
      phase: this._getConversationPhase()
    });

    this.nodeSession = {
      npcId: survivor.id,
      context,
      menuStack: []
    };

    const mainTopics = this._buildMainTopics({ player, npc: survivor, context });
    this._renderMainMenu({ player, npc: survivor, context, mainTopics });
  }

  _renderMainMenu({ player, npc, context, mainTopics }) {
    const menuText = `Pick a main topic with ${npc.firstName}.`;
    const buttons = mainTopics.map(topic => ({
      label: topic.label,
      onClick: () => {
        if (typeof topic.onSelect === 'function') {
          topic.onSelect();
          return;
        }
        this._renderSubMenu({ player, npc, context, topic });
      }
    }));
    this._renderMenu(npc, menuText, buttons, { onBack: null, showEnd: true });
  }

  _renderSubMenu({ player, npc, context, topic }) {
    const menuText = `What do you want to talk about?`;
    const buttons = (topic.nodes || []).map(node => ({
      label: node.buttonText,
      disabled: Boolean(node.disabled),
      tooltip: node.tooltip || '',
      onClick: node.disabled
        ? null
        : () => this._runConversationNode({
          npc,
          player,
          node,
          context: { ...context, mainTopicId: topic.id, subTopicId: node.id },
          returnTo: () => this._renderSubMenu({ player, npc, context, topic })
        })
    }));
    this._renderMenu(npc, menuText, buttons, {
      onBack: () => this._renderMainMenu({ player, npc, context, mainTopics: this._buildMainTopics({ player, npc, context }) }),
      showEnd: true
    });
  }

  _buildMainTopics({ player, npc, context }) {
    const topics = [
      {
        id: 'build_connection',
        label: 'Build Connection',
        nodes: this._buildBuildConnectionNodes({ player, npc, context })
      },
      {
        id: 'vibe_check',
        label: 'Vibe Check',
        nodes: this._buildVibeCheckNodes({ player, npc, context })
      },
      {
        id: 'gossip',
        label: 'Gossip',
        nodes: this._buildGossipNodes({ player, npc, context })
      },
      {
        id: 'idol_talk',
        label: 'Idol Talk',
        nodes: this._buildIdolTalkNodes({ player, npc, context })
      },
      {
        id: 'strategy',
        label: 'Strategy',
        nodes: this._buildStrategyNodes({ player, npc, context })
      },
      {
        id: 'confront',
        label: 'Confront',
        nodes: this._buildConfrontNodes({ player, npc, context })
      },
      {
        id: 'talk_about_someone',
        label: 'Talk about Someone',
        nodes: [
          {
            id: 'talk_someone',
            buttonText: 'Pick a person',
            playerLine: 'Can we talk about someone specific?',
            npcResponseGenerator: () => 'Sure. Who do you want to focus on?',
            afterReply: () => {
              this._showTalkAboutSomeoneSelect({ player, npc, context });
            }
          }
        ]
      }
    ];

    if (this._hasRecentEvent(context)) {
      topics.splice(1, 0, {
        id: 'event',
        label: 'Talk about the event',
        nodes: [
          {
            id: 'event_talk',
            buttonText: 'Talk about the event',
            playerLine: 'That event earlier… what’s your read on it?',
            npcResponseGenerator: () => 'It shifted the energy. People are recalibrating fast.',
            effects: ({ player, npc }) => {
              this._applyExchangeEffects({
                player,
                npc,
                deltas: { relationship: getRandomInt(1, 3), trust: getRandomInt(1, 2) },
                contextTag: 'event_chat'
              });
            }
          }
        ]
      });
    }

    return topics;
  }

  _buildBuildConnectionNodes({ player, npc, context }) {
    return [
      {
        id: 'check_in',
        buttonText: 'Check in',
        playerLine: 'How you holding up? Just checking in — you good?',
        npcResponseGenerator: () => {
          const worst = this._pickWorstStat(npc);
          if (worst.key === 'paranoia') return worst.line;
          if (worst.key !== 'steady') return worst.line;
          return 'I’m alright. Just trying to stay steady and not overthink everything.';
        },
        effects: ({ player, npc }) => {
          const paranoia = npc.paranoia ?? 0;
          const relationshipDelta = getRandomInt(2, 5);
          const trustDelta = paranoia >= 70 ? getRandomInt(0, 1) : getRandomInt(1, 3);
          this._applyExchangeEffects({
            player,
            npc,
            deltas: { relationship: relationshipDelta, trust: trustDelta },
            contextTag: 'build_check_in'
          });
        },
        nextNodes: () => {
          if ((npc.paranoia ?? 0) < 70) return [];
          return [
            {
              id: 'check_in_push',
              buttonText: 'Push further',
              playerLine: 'You’re sure? It feels heavier than that.',
              npcResponseGenerator: () => 'I said I’m fine. Just let me breathe.',
              effects: ({ player, npc }) => {
                this._applyExchangeEffects({ player, npc, deltas: { suspicion: 1, trust: 0 }, contextTag: 'build_check_in_push' });
              }
            }
          ];
        }
      },
      {
        id: 'share_laugh',
        buttonText: 'Share a laugh',
        playerLine: 'We’ve gotta laugh out here or we’ll go crazy. What’s the funniest thing you’ve seen today?',
        npcResponseGenerator: ({ responseMode }) => {
          const lowMood = (npc.rest ?? 100) < 40 && (npc.paranoia ?? 0) > 60;
          const style = (npc.gameplayStyle || '').toLowerCase();
          if (lowMood) return 'I’m not really in a laughing mood… but yeah, I get it.';
          if (style.includes('charmer')) return 'Honestly? The side-eyes. Everybody’s pretending they’re calm and it’s kind of adorable.';
          if (responseMode.mode === 'guarded') return 'People trying not to lose it. That’s the comedy out here.';
          return 'Honestly? Watching everyone pretend they’re not losing it. It’s kind of hilarious.';
        },
        effects: ({ player, npc }) => {
          const lowMood = (npc.rest ?? 100) < 40 && (npc.paranoia ?? 0) > 60;
          const relationshipDelta = lowMood ? getRandomInt(-2, -1) : getRandomInt(3, 6);
          this._applyExchangeEffects({
            player,
            npc,
            deltas: { relationship: relationshipDelta },
            contextTag: 'build_laugh'
          });
        }
      },
      {
        id: 'compliment',
        buttonText: 'Compliment',
        playerLine: 'Real talk — you’ve been solid out here. I respect how you’re playing this.',
        npcResponseGenerator: ({ responseMode }) => {
          if (responseMode.mode === 'counterQ' || responseMode.mode === 'guarded') {
            return 'Why are you laying it on thick right now?';
          }
          if (responseMode.mode === 'deflect') {
            return 'We’ll see. It’s early. Anybody can look good on day one.';
          }
          return 'I appreciate that. It means something coming from you.';
        },
        effects: ({ player, npc, responseMode }) => {
          const relationshipDelta = getRandomInt(2, 5);
          const trustDelta = responseMode.mode === 'counterQ' || responseMode.mode === 'guarded' ? 0 : getRandomInt(1, 3);
          this._applyExchangeEffects({
            player,
            npc,
            deltas: { relationship: relationshipDelta, trust: trustDelta },
            contextTag: 'build_compliment'
          });
        },
        nextNodes: ({ responseMode }) => {
          if (responseMode.mode !== 'counterQ' && responseMode.mode !== 'guarded') return [];
          return [
            {
              id: 'compliment_real',
              buttonText: 'Just being real',
              playerLine: 'Just being real. I’m not trying to play you.',
              npcResponseGenerator: () => 'Alright. I can respect straight talk.',
              effects: ({ player, npc }) => {
                this._applyExchangeEffects({
                  player,
                  npc,
                  deltas: { trust: getRandomInt(1, 2), relationship: getRandomInt(1, 3), suspicion: -1 },
                  contextTag: 'build_compliment_real'
                });
              }
            },
            {
              id: 'compliment_build',
              buttonText: 'Building something',
              playerLine: 'I’m building something. I don’t want to pretend.',
              npcResponseGenerator: () => 'Okay. Just know I’m watching how you move.',
              effects: ({ player, npc }) => {
                this._applyExchangeEffects({
                  player,
                  npc,
                  deltas: { trust: getRandomInt(0, 2), relationship: getRandomInt(1, 3), suspicion: 1 },
                  contextTag: 'build_compliment_build'
                });
              }
            }
          ];
        }
      },
      {
        id: 'bond_one_on_one',
        buttonText: 'Bond one-on-one',
        playerLine: 'I want us on the same wavelength out here. Not big strategy — just… good energy.',
        npcResponseGenerator: ({ responseMode }) => {
          if (responseMode.mode === 'guarded' || responseMode.mode === 'deflect') {
            return 'I hear you. I’m just keeping my head down for now.';
          }
          return 'Yeah. I can do that. I’d rather have real people around me than chaos.';
        },
        effects: ({ player, npc, responseMode }) => {
          const relationshipDelta = getRandomInt(3, 7);
          const trustDelta = responseMode.mode === 'guarded' ? getRandomInt(0, 1) : getRandomInt(1, 3);
          this._applyExchangeEffects({
            player,
            npc,
            deltas: { relationship: relationshipDelta, trust: trustDelta },
            contextTag: 'build_bond'
          });
        }
      }
    ];
  }

  _buildVibeCheckNodes({ player, npc, context }) {
    const tribe = this.gameManager.getPlayerTribe?.();
    const day1Mood = tribe?.day1Mood || tribe?.closingMood || 'tentative';
    return [
      {
        id: 'camp_vibe',
        buttonText: 'Camp vibe',
        playerLine: 'What’s the vibe like right now? This tribe feels… something.',
        npcResponseGenerator: () => {
          if (day1Mood === 'chaotic') return 'It’s chaotic. People are smiling, but it feels like everyone’s taking notes.';
          if (day1Mood === 'confident') return 'It’s confident. Like people think we’ve got this… which makes me nervous.';
          return 'It’s tentative. Nobody wants to be the first person to show their cards.';
        },
        nextNodes: () => [
          {
            id: 'camp_calm',
            buttonText: 'Calm it down',
            playerLine: 'Let’s calm it down. We can keep this tribe steady.',
            npcResponseGenerator: () => 'That would help. Less noise, more trust.',
            effects: ({ player, npc }) => {
              player.teamPlayer = this._clampStat((player.teamPlayer ?? 50) + getRandomInt(1, 3));
              this._applyExchangeEffects({
                player,
                npc,
                deltas: { trust: 1, suspicion: -1 },
                contextTag: 'vibe_calm'
              });
            }
          },
          {
            id: 'camp_chaos',
            buttonText: 'Use the chaos',
            playerLine: 'Chaos is opportunity. We can use it.',
            npcResponseGenerator: ({ responseMode }) => {
              const style = (npc.gameplayStyle || '').toLowerCase();
              const likes = style.includes('shadow') || style.includes('power');
              return likes && responseMode.openness > 0.5
                ? 'Maybe. If we steer it, it could work.'
                : 'That’s risky. Chaos burns people who touch it.';
            },
            effects: ({ player, npc }) => {
              const style = (npc.gameplayStyle || '').toLowerCase();
              const likes = style.includes('shadow') || style.includes('power');
              const deltas = likes ? { trust: getRandomInt(1, 2) } : { suspicion: getRandomInt(1, 2) };
              this._applyExchangeEffects({ player, npc, deltas, contextTag: 'vibe_chaos' });
            }
          }
        ]
      },
      {
        id: 'holding_up',
        buttonText: 'How are you holding up?',
        playerLine: 'Be honest — how are you holding up physically and mentally?',
        npcResponseGenerator: () => {
          if ((npc.paranoia ?? 0) >= 70) return 'Mentally I’m on edge. I keep replaying conversations in my head.';
          const worst = this._pickWorstStat(npc);
          if (worst.key === 'hunger') return 'My hunger is wrecking me. I’m running on empty.';
          if (worst.key === 'water') return 'I’m dehydrated. That’s the main thing.';
          if (worst.key === 'rest') return 'I’m exhausted. I can’t recover.';
          if (worst.key === 'health') return 'I’m banged up. It’s harder than I expected.';
          return 'I’m managing. Some parts are rough, but I’m holding it together.';
        },
        effects: ({ player, npc, responseMode }) => {
          const relationshipDelta = getRandomInt(1, 3);
          const trustDelta = responseMode.mode === 'truth' || responseMode.mode === 'softTruth' ? getRandomInt(1, 2) : 0;
          this._applyExchangeEffects({ player, npc, deltas: { relationship: relationshipDelta, trust: trustDelta }, contextTag: 'vibe_holding' });
        }
      },
      {
        id: 'whats_bugging',
        buttonText: 'What’s bugging you?',
        playerLine: 'What’s been bugging you out here? Like… what’s the thing you can’t ignore?',
        npcResponseGenerator: ({ responseMode }) => {
          const mood = day1Mood;
          const lowResources = (npc.hunger ?? 100) < 45 || (npc.water ?? 100) < 45;
          const lowRel = this._getRelationshipValue(player.id, npc.id) < 45;
          const trust = this._getPairTrust(player.id, npc.id);
          const paranoia = npc.paranoia ?? 0;
          const candidates = this._getTribeMembers({ includeNpc: false, npcId: npc.id });
          const named = trust > 65 && paranoia < 55 && candidates.length
            ? candidates[getRandomInt(0, Math.max(0, candidates.length - 1))]
            : null;
          if (responseMode.mode === 'guarded' || responseMode.mode === 'deflect') {
            return 'I’m keeping my head down for now. It’s early to gripe.';
          }
          const tag = named ? ` ${named.firstName} stands out to me.` : '';
          if (named) {
            this._recordIntel(npc.id, { type: 'bugging', targetId: named.id, targetName: named.firstName });
          }
          if (mood === 'chaotic') return `Everyone’s “fine” … but nobody’s honest. It’s getting weird.${tag}`;
          if (lowResources) return `I’m watching who actually works… and who magically disappears.${tag}`;
          if (lowRel) return `It’s like there’s already a circle… and I’m not sure I’m in it.${tag}`;
          return `I feel like one mistake and people decide you’re dead weight.${tag}`;
        },
        nextNodes: ({ responseMode }) => [
          {
            id: 'bugging_align',
            buttonText: 'I see it too',
            playerLine: 'I see it too. It’s not just you.',
            npcResponseGenerator: () => 'Good. I needed to hear that.',
            effects: ({ player, npc }) => {
              this._applyExchangeEffects({ player, npc, deltas: { trust: getRandomInt(1, 2), relationship: getRandomInt(1, 2) }, contextTag: 'vibe_bugging_align' });
            }
          },
          {
            id: 'bugging_disagree',
            buttonText: 'Not my read',
            playerLine: 'That’s not my read, but I’m listening.',
            npcResponseGenerator: ({ responseMode }) => responseMode.mode === 'guarded'
              ? 'Alright. Just be careful who you trust.'
              : 'Fair. We might be seeing different corners.',
            effects: ({ player, npc }) => {
              this._applyExchangeEffects({ player, npc, deltas: { suspicion: 1 }, contextTag: 'vibe_bugging_disagree' });
            }
          },
          {
            id: 'bugging_names',
            buttonText: 'Who do you mean?',
            playerLine: 'Who do you mean?',
            npcResponseGenerator: () => 'Let’s talk about someone specific.',
            afterReply: () => {
              this._showTalkAboutSomeoneSelect({ player, npc, context });
            }
          }
        ]
      },
      {
        id: 'feel_safe',
        buttonText: 'Do you feel safe?',
        playerLine: 'Do you feel safe right now?',
        npcResponseGenerator: ({ responseMode }) => {
          const paranoia = npc.paranoia ?? 0;
          const threat = npc.threat ?? 0;
          if (responseMode.mode === 'deflect') return 'Nobody’s safe. That’s the whole game.';
          if (paranoia >= 60 || threat >= 65) return 'No. I don’t. I feel my name floating.';
          return 'For now… yeah. But I’m not relaxing.';
        },
        nextNodes: () => [
          {
            id: 'safe_protect',
            buttonText: 'I’ve got you',
            playerLine: 'I’ve got you. I don’t want you in danger.',
            npcResponseGenerator: ({ responseMode }) => responseMode.mode === 'guarded'
              ? 'I appreciate it, but I hear promises all day.'
              : 'Alright. That helps.',
            effects: ({ player, npc }) => {
              const manipulative = (npc.paranoia ?? 0) > 65;
              this._applyExchangeEffects({
                player,
                npc,
                deltas: { trust: manipulative ? 1 : 2, paranoia: manipulative ? 1 : 0 },
                contextTag: 'vibe_safe_protect'
              });
            },
            nextNodes: () => [
              {
                id: 'safe_protect_deal',
                buttonText: 'Make it a deal',
                playerLine: 'Let’s make it a protection deal.',
                npcResponseGenerator: () => 'Alright. If we lock it in, we lock it in.',
                afterReply: () => this._resolveDealOutcome({ player, npc, context, dealType: 'protect', target: null })
              }
            ]
          },
          {
            id: 'safe_names',
            buttonText: 'Who’s pushing it?',
            playerLine: 'Who’s pushing it?',
            npcResponseGenerator: () => 'Let’s talk about someone specific.',
            afterReply: () => {
              this._showTalkAboutSomeoneSelect({ player, npc, context });
            }
          }
        ]
      },
      {
        id: 'strategy_style',
        buttonText: 'What’s your strategy?',
        playerLine: 'What’s your strategy out here — like, your real approach?',
        npcResponseGenerator: () => {
          switch (npc.gameplayStyle) {
            case 'Competitive':
              return 'Win when I can, stay useful, and make it hard to write my name down.';
            case 'Power Player':
              return 'I want influence. I don’t need chaos — I need control.';
            case 'Social Genius':
              return 'Relationships first. The vote comes from the vibe.';
            case 'Shadow Strategist':
              return 'Information. Quiet positioning. Let other people take heat.';
            case 'Wildcard':
              return 'I’m adapting. If the tribe moves, I move with it.';
            case 'Lethal Charmer':
              return 'People underestimate what a conversation can do. That’s where I live.';
            default:
              return 'I’m keeping my options open and trying to stay useful.';
          }
        },
        nextNodes: () => [
          {
            id: 'strategy_respect',
            buttonText: 'Respect',
            playerLine: 'Respect. That’s a smart read.',
            npcResponseGenerator: () => 'Appreciate it.',
            effects: ({ player, npc }) => this._applyExchangeEffects({ player, npc, deltas: { trust: getRandomInt(1, 2) }, contextTag: 'vibe_strategy_respect' })
          },
          {
            id: 'strategy_help_us',
            buttonText: 'Help us',
            playerLine: 'How does that help us out here?',
            npcResponseGenerator: () => 'If we align our approach, we stay ahead of the vote.',
            afterReply: () => {
              this._renderSubMenu({ player, npc, context, topic: { id: 'strategy', nodes: this._buildStrategyNodes({ player, npc, context }) } });
            }
          },
          {
            id: 'strategy_risky',
            buttonText: 'Sounds risky',
            playerLine: 'Sounds dangerous if it goes sideways.',
            npcResponseGenerator: () => 'Everything out here is dangerous. That’s why we pick our spots.',
            effects: ({ player, npc }) => this._applyExchangeEffects({ player, npc, deltas: { suspicion: 1 }, contextTag: 'vibe_strategy_risky' })
          }
        ]
      },
      {
        id: 'are_we_good',
        buttonText: 'Are we good?',
        playerLine: 'You and me — are we good?',
        npcResponseGenerator: () => {
          const trust = this._getPairTrust(player.id, npc.id);
          const relationship = this._getRelationshipValue(player.id, npc.id);
          const memory = this._getNpcMemory(npc.id);
          const hasNegative = memory?.flags?.nameDrop || memory?.flags?.pressured;
          if (trust > 65 && relationship > 60 && !hasNegative) return 'Yeah, we’re good. Don’t overthink it.';
          if (trust > 45) return 'We’re okay… but I’m watching how you move.';
          return 'Honestly? I’ve got questions.';
        },
        nextNodes: () => [
          {
            id: 'good_hear',
            buttonText: 'What did you hear?',
            playerLine: 'What did you hear?',
            npcResponseGenerator: ({ responseMode }) => responseMode.mode === 'truth'
              ? 'I heard my name linked to you. I’m checking if it’s real.'
              : 'Nothing specific. Just the vibe.',
            effects: ({ player, npc }) => this._applyExchangeEffects({ player, npc, deltas: { suspicion: responseMode.mode === 'truth' ? 0 : 1 }, contextTag: 'vibe_good_hear' })
          },
          {
            id: 'good_fix',
            buttonText: 'Fix it',
            playerLine: 'I want to fix it. Tell me what you need.',
            npcResponseGenerator: () => 'Own your moves and don’t blindside me.',
            effects: ({ player, npc }) => this._applyExchangeEffects({ player, npc, deltas: { trust: getRandomInt(2, 6), relationship: getRandomInt(1, 4) }, contextTag: 'vibe_good_fix' })
          },
          {
            id: 'good_defensive',
            buttonText: 'Say it',
            playerLine: 'If you’re against me, say it.',
            npcResponseGenerator: () => 'That’s a little aggressive. I’m not doing that.',
            effects: ({ player, npc }) => this._applyExchangeEffects({ player, npc, deltas: { trust: -3, suspicion: 2 }, contextTag: 'vibe_good_defensive' })
          }
        ]
      }
    ];
  }

  _buildGossipNodes({ player, npc, context }) {
    const memory = this._getNpcMemory(npc.id);
    const applyGossipRisk = () => {
      memory.gossipCount = (memory.gossipCount || 0) + 1;
      if (memory.gossipCount > 2) {
        this._applySuspicionDelta(player, getRandomInt(0, 1), 'gossip_repeat');
      }
    };
    const buildNameReply = ({ mode, truthLine, lieLine, deflectLine }) => {
      if (mode === 'truth' || mode === 'softTruth') return truthLine;
      if (mode === 'lie') return lieLine || truthLine;
      if (mode === 'counterQ') return 'Why — did you hear my name?';
      return deflectLine || 'It’s early. I’m not putting names on anything.';
    };
    const candidates = this._getTribeMembers({ includeNpc: false, npcId: npc.id });
    const topThreat = [...candidates].sort((a, b) => (b.threat ?? 0) - (a.threat ?? 0))[0];
    const altThreat = [...candidates].sort((a, b) => (b.threat ?? 0) - (a.threat ?? 0))[1];
    const topSuspicious = [...candidates].sort((a, b) => (b.suspicion ?? 0) - (a.suspicion ?? 0))[0];
    const topAsset = [...candidates].sort((a, b) => (b.teamPlayer ?? 50) - (a.teamPlayer ?? 50))[0];
    const lowAsset = [...candidates].sort((a, b) => (a.teamPlayer ?? 50) - (b.teamPlayer ?? 50))[0];
    const relationships = candidates.map(member => ({
      member,
      value: this._getRelationshipValue(npc.id, member.id)
    })).sort((a, b) => b.value - a.value);
    const closeWith = relationships[0]?.member;

    return [
      {
        id: 'close_with',
        buttonText: 'Who are you close with?',
        playerLine: 'Who do you actually feel good with around here?',
        askedForNames: true,
        npcResponseGenerator: ({ responseMode }) => {
          applyGossipRisk();
          const line = buildNameReply({
            mode: responseMode.mode,
            truthLine: closeWith ? `I vibe most with ${closeWith.firstName}. We just click.` : 'A couple people. I’m keeping it quiet.',
            deflectLine: 'It’s early. I’m not putting labels on anything.'
          });
          if (responseMode.mode === 'truth' && closeWith) {
            this._recordIntel(npc.id, { type: 'close_with', targetId: closeWith.id, targetName: closeWith.firstName });
            this._applyExchangeEffects({ player, npc, deltas: { trust: 1 }, contextTag: 'gossip_close' });
          }
          if (responseMode.mode === 'lie') {
            this._recordIntel(npc.id, { type: 'possible_lie', topic: 'close_with' });
          }
          return line;
        }
      },
      {
        id: 'threat',
        buttonText: 'Who’s a threat?',
        playerLine: 'Who do you see as a real threat right now?',
        askedForNames: true,
        npcResponseGenerator: ({ responseMode }) => {
          applyGossipRisk();
          const line = buildNameReply({
            mode: responseMode.mode,
            truthLine: topThreat ? `If we’re talking threat? ${topThreat.firstName}.` : 'Everybody’s a threat in different ways.',
            lieLine: altThreat ? `People think it’s ${topThreat?.firstName || 'someone'}, but I’m watching ${altThreat.firstName}.` : 'Everybody’s a threat in different ways.',
            deflectLine: 'Everybody’s a threat in different ways.'
          });
          if ((responseMode.mode === 'truth' || responseMode.mode === 'softTruth') && topThreat) {
            this._recordIntel(npc.id, { type: 'threat_callout', targetId: topThreat.id, targetName: topThreat.firstName });
          }
          return line;
        },
        effects: ({ player }) => {
          this._applySuspicionDelta(player, getRandomInt(0, 1), 'gossip_threat');
        }
      },
      {
        id: 'asset',
        buttonText: 'Who’s an asset?',
        playerLine: 'Who’s actually an asset to the tribe?',
        askedForNames: true,
        npcResponseGenerator: ({ responseMode }) => {
          applyGossipRisk();
          const line = buildNameReply({
            mode: responseMode.mode,
            truthLine: topAsset ? `${topAsset.firstName} is pulling weight.` : 'A few people are keeping us afloat.',
            deflectLine: 'Hard to say without watching another day.'
          });
          if (responseMode.mode === 'truth' && topAsset) {
            this._recordIntel(npc.id, { type: 'asset', targetId: topAsset.id, targetName: topAsset.firstName });
          }
          return line;
        },
        nextNodes: () => [
          {
            id: 'asset_support',
            buttonText: 'They’re valuable',
            playerLine: 'Yeah, they’re valuable.',
            npcResponseGenerator: () => 'Agreed. We need people like that.',
            effects: ({ player, npc }) => this._applyExchangeEffects({ player, npc, deltas: { trust: 1 }, contextTag: 'gossip_asset_support' })
          },
          {
            id: 'asset_danger',
            buttonText: 'They’re dangerous',
            playerLine: 'Or they’re dangerous long-term.',
            npcResponseGenerator: ({ responseMode }) => responseMode.mode === 'truth'
              ? 'That’s a fair point. Big assets become big targets.'
              : 'Maybe. I’m not there yet.',
            effects: ({ player, npc }) => {
              const agrees = responseMode.mode === 'truth' || responseMode.mode === 'softTruth';
              this._applyExchangeEffects({
                player,
                npc,
                deltas: { suspicion: agrees ? 0 : 1 },
                contextTag: 'gossip_asset_danger'
              });
              if (agrees && topAsset) {
                this._recordIntel(npc.id, { type: 'threat_seeded', targetId: topAsset.id, targetName: topAsset.firstName });
              }
            }
          },
          {
            id: 'asset_neutral',
            buttonText: 'Neutral',
            playerLine: 'Noted.',
            npcResponseGenerator: () => 'We’ll see how it plays.',
            effects: () => {}
          }
        ]
      },
      {
        id: 'dead_weight',
        buttonText: 'Who’s dead weight?',
        playerLine: 'Who feels like dead weight right now?',
        askedForNames: true,
        npcResponseGenerator: ({ responseMode }) => {
          applyGossipRisk();
          const line = buildNameReply({
            mode: responseMode.mode,
            truthLine: lowAsset ? `I hate saying it, but ${lowAsset.firstName} hasn’t contributed.` : 'I’m not calling anyone dead weight.',
            deflectLine: 'I’m not throwing anyone under the bus.'
          });
          if (responseMode.mode === 'truth' && lowAsset) {
            this._recordIntel(npc.id, { type: 'dead_weight', targetId: lowAsset.id, targetName: lowAsset.firstName });
          }
          return line;
        }
      },
      {
        id: 'suspicious',
        buttonText: 'Who’s suspicious?',
        playerLine: 'Who’s giving you sketchy energy?',
        askedForNames: true,
        npcResponseGenerator: ({ responseMode }) => {
          applyGossipRisk();
          const line = buildNameReply({
            mode: responseMode.mode,
            truthLine: topSuspicious ? `${topSuspicious.firstName}… I can’t read them. It doesn’t feel clean.` : 'I’m not saying names.',
            deflectLine: 'I’m not saying names.'
          });
          if (responseMode.mode === 'truth' && topSuspicious) {
            this._recordIntel(npc.id, { type: 'suspicious', targetId: topSuspicious.id, targetName: topSuspicious.firstName });
          }
          return line;
        }
      },
      {
        id: 'name_coming_up',
        buttonText: 'Whose name is coming up?',
        playerLine: 'Whose name is coming up when people whisper?',
        askedForNames: true,
        npcResponseGenerator: ({ responseMode }) => {
          applyGossipRisk();
          const target = topSuspicious || topThreat || closeWith;
          const line = buildNameReply({
            mode: responseMode.mode,
            truthLine: target ? `I’ve heard ${target.firstName} once or twice.` : 'I haven’t heard anything concrete.',
            lieLine: 'Nobody’s saying anything.'
          });
          if (responseMode.mode === 'truth' && target) {
            this._recordIntel(npc.id, { type: 'name_coming_up', targetId: target.id, targetName: target.firstName });
          }
          return line;
        }
      },
      {
        id: 'working_together',
        buttonText: 'Who’s working together?',
        playerLine: 'Who do you think is working together?',
        askedForNames: true,
        npcResponseGenerator: ({ responseMode }) => {
          applyGossipRisk();
          const duo = this._pickLikelyDuo(npc);
          const line = buildNameReply({
            mode: responseMode.mode,
            truthLine: duo ? `If I had to guess? ${duo[0].firstName} and ${duo[1].firstName} keep ending up together.` : 'It’s just a vibe… but watch who pairs up.',
            deflectLine: 'It’s just a vibe… but watch who pairs up.'
          });
          if (responseMode.mode === 'truth' && duo) {
            this._recordIntel(npc.id, { type: 'duo_watch', targetIds: [duo[0].id, duo[1].id], targetNames: [duo[0].firstName, duo[1].firstName] });
          }
          return line;
        }
      },
      {
        id: 'quick_read',
        buttonText: 'Quick read',
        playerLine: 'Give me your quick read. One sentence.',
        npcResponseGenerator: ({ responseMode }) => {
          applyGossipRisk();
          if (responseMode.mode === 'truth') return 'It’s calm on the surface, but every smile feels strategic.';
          if (responseMode.mode === 'deflect') return 'I’m still absorbing. It’s early.';
          return 'People are friendly, but I’m not sleeping easy.';
        }
      }
    ];
  }

  _buildIdolTalkNodes({ player, npc, context }) {
    return [
      {
        id: 'idol_looked',
        buttonText: 'Have you looked?',
        playerLine: 'Be honest — have you looked for an idol?',
        askedForNames: false,
        npcResponseGenerator: ({ responseMode }) => {
          this._setIntelFlag(npc, 'idolTalk', true);
          this._setIntelFlag(player, 'idolTalk', true);
          const paranoia = npc.paranoia ?? 0;
          const style = (npc.gameplayStyle || '').toLowerCase();
          if (responseMode.mode === 'lie' || style.includes('shadow') || paranoia > 70) {
            return 'No. Not yet.';
          }
          return Math.random() < 0.5 ? 'Yeah. I’ve looked a little.' : 'No. Not yet.';
        },
        effects: ({ player, npc }) => {
          this._applyExchangeEffects({ player, npc, deltas: { paranoia: 1 }, contextTag: 'idol_looked' });
        },
        nextNodes: ({ responseMode }) => {
          const saidYes = responseMode.mode === 'truth' && Math.random() < 0.5;
          if (saidYes) {
            return [
              {
                id: 'idol_found',
                buttonText: 'Found anything?',
                playerLine: 'Did you find anything? Even a clue?',
                npcResponseGenerator: ({ responseMode: followMode }) => {
                  if (npc.hasIdol || npc.hasIdolClue) {
                    return followMode.mode === 'truth'
                      ? 'Yeah. I found something. I’m keeping it quiet.'
                      : 'No. Nothing.';
                  }
                  return 'No. Nothing.';
                }
              }
            ];
          }
          return [
            {
              id: 'idol_player_looked',
              buttonText: 'I have',
              playerLine: 'I have. I’m not hiding it.',
              npcResponseGenerator: () => 'Okay. That’s good to know.',
              effects: ({ player, npc }) => {
                this._applyExchangeEffects({ player, npc, deltas: { paranoia: getRandomInt(1, 2), suspicion: getRandomInt(0, 1) }, contextTag: 'idol_player_looked' });
              }
            },
            {
              id: 'idol_player_not',
              buttonText: 'I haven’t',
              playerLine: 'I haven’t. Not yet.',
              npcResponseGenerator: () => 'Alright. Just keep me posted.',
              effects: ({ player, npc }) => {
                this._applyExchangeEffects({ player, npc, deltas: { trust: getRandomInt(1, 2) }, contextTag: 'idol_player_not' });
              }
            }
          ];
        }
      },
      {
        id: 'idol_found_direct',
        buttonText: 'Have you found anything?',
        playerLine: 'Did you find anything? Even a clue?',
        npcResponseGenerator: ({ responseMode }) => {
          this._setIntelFlag(npc, 'idolTalk', true);
          if (npc.hasIdol || npc.hasIdolClue) {
            return responseMode.mode === 'truth'
              ? 'Yeah. I found something. I’m keeping it tight.'
              : 'No. Nothing.';
          }
          return 'No. Nothing.';
        },
        effects: ({ player, npc }) => {
          this._applyExchangeEffects({ player, npc, deltas: { paranoia: 1 }, contextTag: 'idol_found_direct' });
        }
      },
      {
        id: 'idol_chatter',
        buttonText: 'People talking idols?',
        playerLine: 'Are people talking idols? Anyone acting like they found something?',
        askedForNames: true,
        npcResponseGenerator: ({ responseMode }) => {
          this._setIntelFlag(npc, 'idolTalk', true);
          const candidates = this._getTribeMembers({ includeNpc: false, npcId: npc.id });
          const chatter = candidates.find(member => member._intelFlags?.idolTalk);
          const idolSus = candidates.sort((a, b) => (b.idolSuspicion ?? b.suspicion ?? 0) - (a.idolSuspicion ?? a.suspicion ?? 0))[0];
          const named = chatter || idolSus;
          if (responseMode.mode === 'truth' && idolSus && this._getPairTrust(player.id, npc.id) > 60) {
            this._recordIntel(npc.id, { type: 'idol_chatter', targetId: named?.id, targetName: named?.firstName });
            return named
              ? `People are definitely acting weird about it. ${named.firstName} feels jumpy.`
              : 'People are definitely acting weird about it.';
          }
          if (responseMode.mode === 'deflect') return 'I haven’t heard anything solid.';
          return 'I haven’t heard anything.';
        },
        effects: ({ player, npc }) => {
          this._applyExchangeEffects({ player, npc, deltas: { paranoia: 1 }, contextTag: 'idol_chatter' });
        }
      }
    ];
  }

  _buildStrategyNodes({ player, npc, context }) {
    const allianceSystem = this.gameManager.systems?.allianceSystem;
    const sharedAlliances = allianceSystem?.getAlliancesForSurvivor?.(player.id) || [];
    const shared = sharedAlliances.filter(alliance => alliance.memberIds?.includes?.(npc.id));
    return [
      {
        id: 'vote_read',
        buttonText: 'Vote read',
        playerLine: 'What do you think the majority wants next?',
        askedForNames: true,
        npcResponseGenerator: ({ responseMode }) => {
          const candidates = this._getTribeMembers({ includeNpc: false, npcId: npc.id });
          const target = candidates.sort((a, b) => (b.threat ?? 0) - (a.threat ?? 0))[0];
          if (responseMode.mode === 'truth' && target) {
            this._recordIntel(npc.id, { type: 'vote_read', targetId: target.id, targetName: target.firstName });
            return `If I’m guessing… ${target.firstName}.`;
          }
          return 'It’s still forming. I’m watching where it tilts.';
        },
        nextNodes: () => [
          {
            id: 'vote_read_agree',
            buttonText: 'Do you agree?',
            playerLine: 'Do you agree with that?',
            npcResponseGenerator: ({ responseMode }) => responseMode.mode === 'truth'
              ? 'Yeah. It tracks.'
              : 'I’m not locking in yet.',
            effects: ({ player, npc }) => this._applyExchangeEffects({ player, npc, deltas: { trust: getRandomInt(1, 2) }, contextTag: 'strategy_vote_agree' })
          },
          {
            id: 'vote_read_help',
            buttonText: 'Need help',
            playerLine: 'If it’s me, I need help.',
            npcResponseGenerator: ({ responseMode }) => responseMode.mode === 'truth'
              ? 'Then we should talk about a counter.'
              : 'Let’s see what shakes out.',
            afterReply: () => this._showDealTypeMenu({ player, npc, context })
          }
        ]
      },
      {
        id: 'pitch_target',
        buttonText: 'Pitch a target',
        playerLine: 'I want to pitch a target to you.',
        npcResponseGenerator: () => 'Okay. Who are you thinking?',
        afterReply: () => this._showTargetPitchMenu({ player, npc, context })
      },
      {
        id: 'deflect_target',
        buttonText: 'Deflect a target',
        playerLine: 'If my name comes up, I need a deflect plan.',
        npcResponseGenerator: ({ responseMode }) => responseMode.mode === 'truth'
          ? 'Then we line up a safer name.'
          : 'That’s tricky. We’ll have to see.',
        afterReply: () => this._showTargetPitchMenu({ player, npc, context, mode: 'deflect' })
      },
      {
        id: 'backup_plan',
        buttonText: 'Backup plan',
        playerLine: 'If an idol gets played, what’s the backup plan?',
        npcResponseGenerator: ({ responseMode }) => responseMode.mode === 'truth'
          ? 'We need a secondary target in our pocket. Quiet, but real.'
          : 'That’s a lot… but yeah, we need a backup.',
        effects: ({ player, npc }) => {
          const trustDelta = responseMode.mode === 'truth' ? 1 : 0;
          const suspicionDelta = responseMode.mode === 'guarded' ? 1 : 0;
          this._applyExchangeEffects({ player, npc, deltas: { trust: trustDelta, suspicion: suspicionDelta }, contextTag: 'strategy_backup' });
        }
      },
      {
        id: 'offer_deal',
        buttonText: 'Offer a deal',
        playerLine: 'Can we lock something in?',
        npcResponseGenerator: () => 'What kind of deal are you thinking?',
        afterReply: () => this._showDealTypeMenu({ player, npc, context })
      },
      {
        id: 'alliances',
        buttonText: 'Alliances',
        disabled: shared.length === 0,
        tooltip: shared.length === 0 ? 'No shared alliance' : '',
        playerLine: 'Let’s talk alliance.',
        npcResponseGenerator: () => shared.length ? 'Which piece do you want to tighten up?' : 'We don’t share an alliance yet.',
        afterReply: () => {
          if (!shared.length) {
            this._renderMenu(npc, 'No shared alliance yet.', [], { onBack: () => this._renderSubMenu({ player, npc, context, topic: { id: 'strategy', nodes: this._buildStrategyNodes({ player, npc, context }) } }), showEnd: true });
            return;
          }
          this._showAllianceMenu({ player, npc, context, sharedAlliances: shared });
        }
      }
    ];
  }

  _buildConfrontNodes({ player, npc, context }) {
    return [
      {
        id: 'call_out_tension',
        buttonText: 'Call out tension',
        playerLine: 'Something feels off between us. What’s going on?',
        npcResponseGenerator: ({ responseMode }) => {
          const trust = this._getPairTrust(player.id, npc.id);
          const relationship = this._getRelationshipValue(player.id, npc.id);
          if (trust > 60 && relationship > 55) return 'We’re good. It’s just stress out here.';
          if (responseMode.mode === 'truth') return 'I felt like you were circling me in conversations.';
          return 'I heard my name connected to you.';
        },
        nextNodes: () => [
          {
            id: 'tension_deny',
            buttonText: 'That wasn’t me',
            playerLine: 'That wasn’t me.',
            npcResponseGenerator: ({ responseMode }) => responseMode.mode === 'truth'
              ? 'Alright. I’ll watch how it plays out.'
              : 'I’m still not sure.',
            effects: ({ player, npc, responseMode }) => {
              const trustDelta = responseMode.mode === 'truth' ? 0 : -4;
              const suspicionDelta = responseMode.mode === 'truth' ? 0 : 2;
              this._applyExchangeEffects({ player, npc, deltas: { trust: trustDelta, suspicion: suspicionDelta }, contextTag: 'confront_deny' });
            }
          },
          {
            id: 'tension_own',
            buttonText: 'You’re right',
            playerLine: 'You’re right. I got sloppy.',
            npcResponseGenerator: () => 'I respect the honesty. Just tighten it up.',
            effects: ({ player, npc }) => this._applyExchangeEffects({ player, npc, deltas: { trust: 3 }, contextTag: 'confront_own' })
          },
          {
            id: 'tension_source',
            buttonText: 'Who said that?',
            playerLine: 'Who said that?',
            npcResponseGenerator: ({ responseMode }) => responseMode.mode === 'truth'
              ? 'I heard it from someone near the shelter. I’m not naming names.'
              : 'It’s just a vibe. No source.',
            effects: ({ player, npc }) => this._applyExchangeEffects({ player, npc, deltas: { suspicion: responseMode.mode === 'truth' ? 0 : 1 }, contextTag: 'confront_source' })
          }
        ]
      },
      {
        id: 'confront_rumor',
        buttonText: 'Confront rumor',
        playerLine: 'I heard you said my name.',
        npcResponseGenerator: ({ responseMode }) => {
          if (responseMode.mode === 'truth') return 'I did — and here’s why. I was covering myself.';
          if (responseMode.mode === 'deflect') return 'Who told you that?';
          return 'No, I never said that.';
        },
        nextNodes: () => [
          {
            id: 'rumor_no_name',
            buttonText: 'Not naming',
            playerLine: 'I’m not naming names.',
            npcResponseGenerator: () => 'Then we leave it there.',
            effects: ({ player, npc }) => this._applyExchangeEffects({ player, npc, deltas: { suspicion: 1 }, contextTag: 'confront_rumor_noname' })
          },
          {
            id: 'rumor_name',
            buttonText: 'Name source',
            playerLine: 'It was someone else.',
            npcResponseGenerator: () => 'Interesting. I’ll keep my eyes open.',
            effects: ({ player, npc }) => {
              this._applyExchangeEffects({ player, npc, deltas: { trust: getRandomInt(1, 2) }, contextTag: 'confront_rumor_name' });
              this._recordIntel(npc.id, { type: 'source_named', note: 'player_named_source' });
            }
          }
        ]
      },
      {
        id: 'apologize',
        buttonText: 'Apologize',
        playerLine: 'I want to clear the air.',
        npcResponseGenerator: () => 'Alright. What are you owning?',
        afterReply: () => this._showApologyMenu({ player, npc, context })
      }
    ];
  }

  _showTalkAboutSomeoneSelect({ player, npc, context }) {
    const candidates = this._getTribeMembers({ includeNpc: true, includePlayer: false, npcId: npc.id });
    this._renderPickList({
      npc,
      title: 'Pick someone to talk about:',
      candidates,
      onPick: target => this._showTalkAboutSomeoneAngles({ player, npc, context, target }),
      onBack: () => this._renderMainMenu({ player, npc, context, mainTopics: this._buildMainTopics({ player, npc, context }) })
    });
  }

  _showTalkAboutSomeoneAngles({ player, npc, context, target }) {
    const angles = [
      { id: 'trust_them', label: 'Do you trust them?' },
      { id: 'how_you_see', label: 'How do you see them?' },
      { id: 'dangerous', label: 'They’re dangerous long-term' },
      { id: 'idol', label: 'They might have an idol' },
      { id: 'said_your_name', label: 'They said your name' },
      { id: 'said_name', label: 'They said a name…' },
      { id: 'aligned_with', label: 'They’re aligned with…' },
      { id: 'loved', label: 'They’re loved by everyone' }
    ];
    const buttons = angles.map(angle => ({
      label: angle.label,
      onClick: () => this._runConversationNode({
        npc,
        player,
        node: this._buildTalkAboutSomeoneNode({ player, npc, context, target, angle: angle.id }),
        context: { ...context, mainTopicId: 'talk_about_someone', subTopicId: angle.id, targetId: target.id },
        returnTo: () => this._showTalkAboutSomeoneAngles({ player, npc, context, target })
      })
    }));
    this._renderMenu(npc, `Talking about ${target.firstName}. Pick an angle.`, buttons, {
      onBack: () => this._showTalkAboutSomeoneSelect({ player, npc, context }),
      showEnd: true
    });
  }

  _buildTalkAboutSomeoneNode({ player, npc, context, target, angle }) {
    const buildReply = ({ responseMode, truth, lie, deflect }) => {
      if (responseMode.mode === 'truth' || responseMode.mode === 'softTruth') return truth;
      if (responseMode.mode === 'lie') return lie || deflect;
      if (responseMode.mode === 'counterQ') return 'Why are you asking me that?';
      return deflect;
    };
    const rel = this._getRelationshipValue(npc.id, target.id);
    const trust = this._getPairTrust(npc.id, target.id);
    const paranoia = target.paranoia ?? 0;
    const suspicion = target.suspicion ?? 0;
    const idolSuspicion = target.idolSuspicion ?? Math.round((suspicion + (target.threat ?? 0)) / 2);

    const baseNode = {
      id: `talk_${angle}_${target.id}`,
      buttonText: 'Continue',
      playerLine: '',
      npcResponseGenerator: () => '',
      effects: () => {}
    };

    switch (angle) {
      case 'trust_them':
        return {
          ...baseNode,
          buttonText: 'Do you trust them?',
          playerLine: 'Do you trust them?',
          npcResponseGenerator: ({ responseMode }) => buildReply({
            responseMode,
            truth: rel > 60 ? `Yeah, I trust ${target.firstName} more than most.` : `${target.firstName}… I’m not fully there.`,
            lie: `${target.firstName} feels solid. No issues.`,
            deflect: 'I’m not putting trust on anyone out loud.'
          })
        };
      case 'how_you_see':
        return {
          ...baseNode,
          buttonText: 'How do you see them?',
          playerLine: 'How do you see them?',
          npcResponseGenerator: ({ responseMode }) => buildReply({
            responseMode,
            truth: rel > 60 ? 'They’re a connector. People like them.' : 'They’re a wildcard to me.',
            lie: 'They’re not on my radar.',
            deflect: 'It’s early. I’m still reading.'
          })
        };
      case 'dangerous':
        return {
          ...baseNode,
          buttonText: 'They’re dangerous long-term',
          playerLine: 'They’re dangerous long-term.',
          npcResponseGenerator: ({ responseMode }) => buildReply({
            responseMode,
            truth: (target.threat ?? 0) > 60 ? 'I can see that. They’re built for late game.' : 'Maybe. I’m not convinced.',
            lie: 'Nah, not really.',
            deflect: 'Could be, but I’m not calling it yet.'
          })
        };
      case 'idol':
        return {
          ...baseNode,
          buttonText: 'They might have an idol',
          playerLine: 'They might have an idol.',
          npcResponseGenerator: ({ responseMode }) => buildReply({
            responseMode,
            truth: idolSuspicion > 55 ? 'I’ve had that thought too.' : 'I haven’t seen anything that screams idol.',
            lie: 'Yeah, I think so.',
            deflect: 'I’m not speculating on idols.'
          }),
          effects: ({ player, npc }) => {
            this._applyExchangeEffects({ player, npc, deltas: { suspicion: getRandomInt(0, 1) }, contextTag: 'talk_idol' });
          }
        };
      case 'said_your_name':
        return {
          ...baseNode,
          buttonText: 'They said your name',
          playerLine: 'They said your name.',
          npcResponseGenerator: ({ responseMode }) => buildReply({
            responseMode,
            truth: 'If that’s true, I’m glad you told me.',
            lie: 'That doesn’t sound right.',
            deflect: 'Who told you that?'
          })
        };
      case 'said_name':
        return {
          ...baseNode,
          buttonText: 'They said a name…',
          playerLine: 'They said a name…',
          npcResponseGenerator: () => 'Whose name did they say?',
          afterReply: () => {
            const candidates = this._getTribeMembers({ includeNpc: true, includePlayer: false, npcId: npc.id });
            this._renderPickList({
              npc,
              title: 'Pick the name they said:',
              candidates,
              onPick: picked => {
                this._recordIntel(npc.id, { type: 'name_drop', targetId: picked.id, targetName: picked.firstName, sourceId: target.id });
                this._renderMenu(npc, 'Got it. I’ll keep that in mind.', [], {
                  onBack: () => this._showTalkAboutSomeoneAngles({ player, npc, context, target }),
                  showEnd: true
                });
              },
              onBack: () => this._showTalkAboutSomeoneAngles({ player, npc, context, target })
            });
          }
        };
      case 'aligned_with':
        return {
          ...baseNode,
          buttonText: 'They’re aligned with…',
          playerLine: 'They’re aligned with someone.',
          npcResponseGenerator: () => 'Who do you think they’re aligned with?',
          afterReply: () => {
            const candidates = this._getTribeMembers({ includeNpc: true, includePlayer: false, npcId: npc.id }).filter(member => member.id !== target.id);
            this._renderPickList({
              npc,
              title: 'Pick the ally:',
              candidates,
              onPick: picked => {
                this._recordIntel(npc.id, { type: 'alignment_callout', targetId: target.id, targetName: target.firstName, allyId: picked.id, allyName: picked.firstName });
                this._renderMenu(npc, 'Interesting. I’ll watch that.', [], {
                  onBack: () => this._showTalkAboutSomeoneAngles({ player, npc, context, target }),
                  showEnd: true
                });
              },
              onBack: () => this._showTalkAboutSomeoneAngles({ player, npc, context, target })
            });
          }
        };
      case 'loved':
        return {
          ...baseNode,
          buttonText: 'They’re loved by everyone',
          playerLine: 'They’re loved by everyone.',
          npcResponseGenerator: ({ responseMode }) => buildReply({
            responseMode,
            truth: 'That’s the danger. People rally around them.',
            lie: 'I don’t see that.',
            deflect: 'Popular today, target tomorrow.'
          })
        };
      default:
        return {
          ...baseNode,
          buttonText: 'Neutral',
          playerLine: 'Just talking it out.',
          npcResponseGenerator: () => 'Alright.'
        };
    }
  }

  _pickLikelyDuo(npc) {
    const candidates = this._getTribeMembers({ includeNpc: false, npcId: npc.id });
    if (candidates.length < 2) return null;
    let bestPair = null;
    let bestScore = -Infinity;
    for (let i = 0; i < candidates.length; i++) {
      for (let j = i + 1; j < candidates.length; j++) {
        const rel = this._getRelationshipValue(candidates[i].id, candidates[j].id);
        if (rel > bestScore) {
          bestScore = rel;
          bestPair = [candidates[i], candidates[j]];
        }
      }
    }
    return bestPair;
  }

  _showTargetPitchMenu({ player, npc, context, mode = 'pitch' }) {
    const candidates = this._getTribeMembers({ includeNpc: false, npcId: npc.id });
    this._renderPickList({
      npc,
      title: 'Pick a target to discuss:',
      candidates,
      onPick: target => {
        const responseMode = this.decideNpcResponseMode({ player, npc, topic: 'strategy', riskLevel: 0.5, askedForNames: true, pressuring: mode === 'deflect' });
        const reply = responseMode.mode === 'truth'
          ? `That could work. ${target.firstName} is a viable name.`
          : responseMode.mode === 'deflect'
            ? 'That’s a lot to commit to right now.'
            : 'I’m not sure that’s the right move.';
        this._recordIntel(npc.id, { type: mode === 'deflect' ? 'deflect_target' : 'pitch_target', targetId: target.id, targetName: target.firstName });
        this._renderMenu(npc, reply, [], {
          onBack: () => this._renderSubMenu({ player, npc, context, topic: { id: 'strategy', nodes: this._buildStrategyNodes({ player, npc, context }) } }),
          showEnd: true
        });
      },
      onBack: () => this._renderSubMenu({ player, npc, context, topic: { id: 'strategy', nodes: this._buildStrategyNodes({ player, npc, context }) } })
    });
  }

  _showDealTypeMenu({ player, npc, context }) {
    const dealTypes = [
      { id: 'vote_together', label: 'Vote together' },
      { id: 'protect', label: 'Protect each other' },
      { id: 'final2', label: 'Final two' },
      { id: 'share_info', label: 'Share info' },
      { id: 'idol_protect', label: 'Idol protection' }
    ];
    const buttons = dealTypes.map(dealType => ({
      label: dealType.label,
      onClick: () => {
        if (dealType.id === 'vote_together' || dealType.id === 'idol_protect') {
          const candidates = this._getTribeMembers({ includeNpc: false, npcId: npc.id });
          this._renderPickList({
            npc,
            title: 'Pick a target for the deal:',
            candidates,
            onPick: target => this._resolveDealOutcome({ player, npc, context, dealType: dealType.id, target }),
            onBack: () => this._showDealTypeMenu({ player, npc, context })
          });
          return;
        }
        this._resolveDealOutcome({ player, npc, context, dealType: dealType.id, target: null });
      }
    }));
    this._renderMenu(npc, 'What kind of deal do you want to offer?', buttons, {
      onBack: () => this._renderSubMenu({ player, npc, context, topic: { id: 'strategy', nodes: this._buildStrategyNodes({ player, npc, context }) } }),
      showEnd: true
    });
  }

  _resolveDealOutcome({ player, npc, context, dealType, target }) {
    const trust = this._getPairTrust(player.id, npc.id);
    const relationship = this._getRelationshipValue(player.id, npc.id);
    const paranoia = npc.paranoia ?? 0;
    const style = (npc.gameplayStyle || '').toLowerCase();
    let acceptScore = (trust * 0.5 + relationship * 0.4) / 100;
    acceptScore -= paranoia / 200;
    if (style.includes('shadow')) acceptScore -= 0.05;
    if (style.includes('social')) acceptScore += 0.05;

    const roll = Math.random();
    let outcome = 'stall';
    if (roll < acceptScore - 0.1) outcome = 'accept';
    else if (roll < acceptScore + 0.1) outcome = 'counter';
    else outcome = 'decline';

    if (this._isConversationDebugEnabled()) {
      this._debugLog('[CONVO-DEBUG] Deal outcome', { outcome, dealType, npc: npc.firstName });
    }

    if (outcome === 'counter') {
      this._renderMenu(npc, 'I’m not sure. How about we just share info first?', [
        {
          label: 'Accept counter',
          onClick: () => this._createDeal({ player, npc, dealType: 'share_info', target, status: 'accepted' })
        },
        {
          label: 'Walk away',
          onClick: () => {
            this._applyExchangeEffects({ player, npc, deltas: { trust: -1 }, contextTag: 'deal_counter_walk' });
            this._renderSubMenu({ player, npc, context, topic: { id: 'strategy', nodes: this._buildStrategyNodes({ player, npc, context }) } });
          }
        }
      ], {
        onBack: () => this._renderSubMenu({ player, npc, context, topic: { id: 'strategy', nodes: this._buildStrategyNodes({ player, npc, context }) } }),
        showEnd: true
      });
      return;
    }

    if (outcome === 'accept') {
      this._createDeal({ player, npc, dealType, target, status: 'accepted' });
      return;
    }

    this._createDeal({ player, npc, dealType, target, status: 'refused' });
  }

  _createDeal({ player, npc, dealType, target, status }) {
    const dealSystem = this.gameManager?.systems?.dealSystem;
    if (!dealSystem) {
      this._renderMenu(npc, 'No one is taking deals right now.', [], {
        onBack: () => this._renderMainMenu({ player, npc, context: this.activeConversationContext || {}, mainTopics: this._buildMainTopics({ player, npc, context: this.activeConversationContext || {} }) }),
        showEnd: true
      });
      return;
    }
    const typeMap = {
      vote_together: DealTypes.VOTE_TOGETHER,
      protect: DealTypes.MUTUAL_PROTECTION,
      final2: DealTypes.FINAL_TWO,
      share_info: DealTypes.SHARE_INFO,
      idol_protect: DealTypes.IDOL_PROTECTION
    };
    const deal = dealSystem.createDeal({
      type: typeMap[dealType] || 'VOTE_TOGETHER',
      parties: [player.id, npc.id],
      terms: {
        targetId: target?.id ?? null,
        duration: 'next_tribal'
      },
      note: 'conversation_deal'
    });

    if (deal) {
      if (status === 'accepted') {
        dealSystem.acceptDeal(deal.id, npc.id, 'accepted_in_conversation');
        this._applyExchangeEffects({ player, npc, deltas: { trust: getRandomInt(3, 10), relationship: getRandomInt(1, 5) }, contextTag: 'deal_accept' });
      } else if (status === 'refused') {
        dealSystem.refuseDeal(deal.id, npc.id, 'refused_in_conversation');
        this._applyExchangeEffects({ player, npc, deltas: { trust: -getRandomInt(1, 5), suspicion: getRandomInt(0, 2) }, contextTag: 'deal_refuse' });
      }
      if (this._isConversationDebugEnabled()) {
        this._debugLog('[CONVO-DEBUG] Deal created', { id: deal.id, type: deal.type, status });
      }
    }
    const responseText = status === 'accepted'
      ? 'Alright. We have a deal.'
      : 'I’m not going for that.';
    this._renderMenu(npc, responseText, [], {
      onBack: () => this._renderSubMenu({ player, npc, context: this.activeConversationContext || {}, topic: { id: 'strategy', nodes: this._buildStrategyNodes({ player, npc, context: this.activeConversationContext || {} }) } }),
      showEnd: true
    });
  }

  _showAllianceMenu({ player, npc, context, sharedAlliances }) {
    const hasMultiple = sharedAlliances.length > 1;
    const buttons = [
      {
        label: 'Recommit',
        onClick: () => {
          this._applyExchangeEffects({ player, npc, deltas: { trust: getRandomInt(2, 6) }, contextTag: 'alliance_recommit' });
          this._renderMenu(npc, 'We’re good. Let’s keep it tight.', [], {
            onBack: () => this._renderSubMenu({ player, npc, context, topic: { id: 'strategy', nodes: this._buildStrategyNodes({ player, npc, context }) } }),
            showEnd: true
          });
        }
      },
      ...(hasMultiple ? [{
        label: 'Prioritize alliance',
        onClick: () => {
          const best = sharedAlliances.sort((a, b) => (b.cohesion ?? 50) - (a.cohesion ?? 50))[0];
          this._renderMenu(npc, `If I had to pick, I’d prioritize ${best.name}.`, [], {
            onBack: () => this._renderSubMenu({ player, npc, context, topic: { id: 'strategy', nodes: this._buildStrategyNodes({ player, npc, context }) } }),
            showEnd: true
          });
        }
      }] : []),
      {
        label: 'Address doubt',
        onClick: () => this._showAllianceDoubtMenu({ player, npc, context, sharedAlliances })
      },
      {
        label: 'Endgame',
        onClick: () => {
          const alliance = sharedAlliances[0];
          const size = alliance.memberIds?.length || 2;
          const line = size > 2
            ? 'We should keep each other ahead of the group when it counts.'
            : 'It’s us before anyone else. That’s the deal.';
          this._renderMenu(npc, line, [], {
            onBack: () => this._renderSubMenu({ player, npc, context, topic: { id: 'strategy', nodes: this._buildStrategyNodes({ player, npc, context }) } }),
            showEnd: true
          });
        }
      }
    ];
    this._renderMenu(npc, 'Alliance talk:', buttons, {
      onBack: () => this._renderSubMenu({ player, npc, context, topic: { id: 'strategy', nodes: this._buildStrategyNodes({ player, npc, context }) } }),
      showEnd: true
    });
  }

  _showAllianceDoubtMenu({ player, npc, context, sharedAlliances }) {
    const alliance = sharedAlliances[0];
    const members = this._getTribeMembers({ includeNpc: true, includePlayer: false, npcId: npc.id })
      .filter(member => alliance.memberIds?.includes?.(member.id) && member.id !== player.id);
    this._renderMenu(npc, 'What doubt are you addressing?', [
      { label: 'About us', onClick: () => this._resolveAllianceDoubt({ player, npc, context, target: null }) },
      {
        label: 'About a member',
        onClick: () => {
          if (!members.length) {
            this._renderMenu(npc, 'It’s just the two of us right now.', [], {
              onBack: () => this._showAllianceMenu({ player, npc, context, sharedAlliances }),
              showEnd: true
            });
            return;
          }
          this._renderPickList({
            npc,
            title: 'Pick the member you’re concerned about:',
            candidates: members,
            onPick: picked => this._resolveAllianceDoubt({ player, npc, context, target: picked }),
            onBack: () => this._showAllianceMenu({ player, npc, context, sharedAlliances })
          });
        }
      }
    ], {
      onBack: () => this._showAllianceMenu({ player, npc, context, sharedAlliances }),
      showEnd: true
    });
  }

  _resolveAllianceDoubt({ player, npc, context, target }) {
    const trust = this._getPairTrust(player.id, npc.id);
    if (trust < 45) {
      this._applyExchangeEffects({ player, npc, deltas: { trust: -2, suspicion: 1 }, contextTag: 'alliance_doubt_low' });
      this._renderMenu(npc, 'That’s not easing my doubts right now.', [], {
        onBack: () => this._renderSubMenu({ player, npc, context, topic: { id: 'strategy', nodes: this._buildStrategyNodes({ player, npc, context }) } }),
        showEnd: true
      });
      return;
    }
    const line = target
      ? `If ${target.firstName} wobbles, we handle it.`
      : 'We’re solid. Let’s keep it clean.';
    this._applyExchangeEffects({ player, npc, deltas: { trust: 2 }, contextTag: 'alliance_doubt_reassure' });
    this._renderMenu(npc, line, [], {
      onBack: () => this._renderSubMenu({ player, npc, context, topic: { id: 'strategy', nodes: this._buildStrategyNodes({ player, npc, context }) } }),
      showEnd: true
    });
  }

  _showApologyMenu({ player, npc, context }) {
    const buttons = [
      {
        label: 'Said your name',
        onClick: () => this._resolveApology({ player, npc, context, type: 'name' })
      },
      {
        label: 'Voted against you',
        onClick: () => this._resolveApology({ player, npc, context, type: 'vote' })
      },
      {
        label: 'Lied to you',
        onClick: () => this._resolveApology({ player, npc, context, type: 'lie' })
      }
    ];
    this._renderMenu(npc, 'What are you apologizing for?', buttons, {
      onBack: () => this._renderSubMenu({ player, npc, context, topic: { id: 'confront', nodes: this._buildConfrontNodes({ player, npc, context }) } }),
      showEnd: true
    });
  }

  _resolveApology({ player, npc, context, type }) {
    const trust = this._getPairTrust(player.id, npc.id);
    const open = trust > 55;
    const line = open
      ? 'I hear you. Thanks for owning it.'
      : 'I’m listening, but it’s going to take time.';
    this._applyExchangeEffects({
      player,
      npc,
      deltas: { trust: open ? 3 : 1, relationship: open ? 2 : 0 },
      contextTag: `apology_${type}`
    });
    this._renderMenu(npc, line, [], {
      onBack: () => this._renderSubMenu({ player, npc, context, topic: { id: 'confront', nodes: this._buildConfrontNodes({ player, npc, context }) } }),
      showEnd: true
    });
  }

  _showCategoryMenu(survivor, location, category) {
    this._clearOverlay({ preserveSession: true });
    const overlay = this._buildOverlayShell(survivor, { reuse: true });
    const content = this._getConversationContent(overlay);
    this._clearConversationContent(content);
    const parchment = this._buildParchment(`Dig deeper with ${survivor.firstName}`);
    const phase = this._getConversationPhase();
    if (phase === 'pre' && PRE_CHALLENGE_TREE.categories.some(cat => cat.id === category)) {
      this._showPreChallengeCategoryMenu(survivor, location, category);
      return;
    }

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
      const btn = this._createChoiceButton({
        label,
        onClick: handler,
        fallback: { npc: survivor }
      });
      optionColumn.appendChild(btn);
    };

    if (category === 'challengeDebrief') {
      addOption('Lead a debrief', () => this._showChallengeDebriefMenu(survivor, location, { phase }));
    } else if (category === 'tradeInfo') {
      addOption('Ask what they’re hearing', () => this._startConversation(survivor, {
        intentOverride: DETERMINISTIC_INTENTS.INTEL_HEARING_NAMES,
        location,
        context: { phase, initiator: 'player' }
      }));
      addOption('Talk about someone specific', () => this.promptSurvivorPicker({
        title: 'Talk about who?',
        tribeOnly: true,
        excludeIds: [survivor.id, this.gameManager.getPlayerSurvivor?.()?.id]
      }).then(selectedId => {
        if (!selectedId) {
          this._showCategoryMenu(survivor, location, category);
          return;
        }
        const pick = this._getSurvivorById(selectedId);
        if (!pick) {
          this._showCategoryMenu(survivor, location, category);
          return;
        }
        this._showSpecificTopicMenu(survivor, location, pick, { phase, returnCategory: category });
      }));
      addOption('Offer info trade', () => this._showApproachMenu(survivor, location, {
        title: 'How do you want to approach this?',
        onSelect: (approach) => {
          const dealContext = this._buildDealContext('info', survivor);
          this._startConversation(survivor, {
            intentOverride: POST_PHASE_INTENTS.offer_deal_share_info,
            location,
            context: { ...dealContext, phase, approach, initiator: 'player' }
          });
        },
        onBack: () => this._showCategoryMenu(survivor, location, category)
      }));
    } else if (category === 'deal') {
      addOption('Make a deal', () => this._showDealMenu(survivor, location));
    } else if (category === 'seed') {
      addOption('Plant a subtle seed', () => this.promptSurvivorPicker({
        title: 'Plant a seed about who?',
        tribeOnly: true,
        excludeIds: [survivor.id, this.gameManager.getPlayerSurvivor?.()?.id]
      }).then(selectedId => {
        if (!selectedId) {
          this._showCategoryMenu(survivor, location, category);
          return;
        }
        const pick = this._getSurvivorById(selectedId);
        if (!pick) {
          this._showCategoryMenu(survivor, location, category);
          return;
        }
        this._startConversation(survivor, {
          intentOverride: POST_PHASE_INTENTS.plant_seed,
          location,
          context: { topicPerson: pick.firstName, topicId: pick.id, phase, initiator: 'player' }
        });
      }));
    } else if (category === 'deflect') {
      addOption('Counter-pitch a different name', () => this._showDeflectMenu(survivor, location, { phase }));
    } else if (category === 'idolTalk') {
      addOption('Ask about idols', () => this._showIdolTalkMenu(survivor, location, { phase }));
    } else if (category === 'verify') {
      addOption('Verify a story', () => this._showVerifyStoryMenu(survivor, location, { phase }));
    } else if (category === 'pressure') {
      addOption('Apply pressure', () => this._startConversation(survivor, {
        intentOverride: POST_PHASE_INTENTS.threaten_pressure,
        location,
        context: { phase, initiator: 'player', approach: STRATEGY_APPROACHES.PRESSURE }
      }));
    } else if (category === 'alliance') {
      addOption('Check alliance commitment', () => this._startConversation(survivor, {
        intentOverride: POST_PHASE_INTENTS.alliance_commitment,
        location,
        context: { phase, initiator: 'player' }
      }));
      addOption('Plan vote together', () => this._showDealMenu(survivor, location));
      addOption('Swap alliance intel', () => this._startConversation(survivor, {
        intentOverride: POST_PHASE_INTENTS.ask_intel,
        location,
        context: { phase, initiator: 'player' }
      }));
    } else if (category === 'splitVote') {
      addOption('Pitch a split vote', () => this._showSplitVoteMenu(survivor, location, { phase }));
    } else if (category === 'pitch') {
      addOption('Pitch a target', () => this.promptSurvivorPicker({
        title: 'Who do you want to pitch?',
        tribeOnly: true,
        excludeIds: [survivor.id, this.gameManager.getPlayerSurvivor?.()?.id]
      }).then(selectedId => {
        if (!selectedId) {
          this._showCategoryMenu(survivor, location, category);
          return;
        }
        const pick = this._getSurvivorById(selectedId);
        if (!pick) {
          this._showCategoryMenu(survivor, location, category);
          return;
        }
        this._showApproachMenu(survivor, location, {
          title: 'How do you want to approach this?',
          onSelect: (approach) => {
            this._startConversation(survivor, {
              intentOverride: POST_PHASE_INTENTS.pitch_target,
              location,
              context: { topicPerson: pick.firstName, topicId: pick.id, phase, initiator: 'player', approach }
            });
          },
          onBack: () => this._showCategoryMenu(survivor, location, category)
        });
      }));
    }

    this._appendNavButtonsToColumn(optionColumn, {
      canBack: true,
      canChangeTopic: true,
      onBack: () => this._showTopicSelection(survivor, location),
      onChangeTopic: () => this._showTopicSelection(survivor, location),
      session: this.nodeSession || this.conversationSession
    });
    parchment.appendChild(optionColumn);
    content.appendChild(parchment);

    this.state = {
      ...(this.state || {}),
      npcId: survivor.id,
      topic: category
    };
  }

  _showPreChallengeCategoryMenu(survivor, location, categoryId) {
    this._clearOverlay({ preserveSession: true });
    const overlay = this._buildOverlayShell(survivor, { reuse: true });
    const content = this._getConversationContent(overlay);
    this._clearConversationContent(content);
    const category = PRE_CHALLENGE_TREE.categories.find(cat => cat.id === categoryId);
    if (!category) {
      this._showTopicSelection(survivor, location);
      return;
    }

    if (category.id === 'talk_specific') {
      this.promptSurvivorPicker({
        title: category.targetPrompt || 'Who do you want to talk about?',
        tribeOnly: true,
        excludeIds: [survivor.id, this.gameManager.getPlayerSurvivor?.()?.id]
      }).then(selectedId => {
        if (!selectedId) {
          this._showTopicSelection(survivor, location);
          return;
        }
        const pick = this._getSurvivorById(selectedId);
        if (!pick) {
          this._showTopicSelection(survivor, location);
          return;
        }
        this._showPreChallengeSpecificMenu(survivor, location, pick, category);
      });
      return;
    }

    const parchment = this._buildParchment(`${category.label} with ${survivor.firstName}`);
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
      const btn = this._createChoiceButton({
        label,
        onClick: handler,
        fallback: { npc: survivor }
      });
      optionColumn.appendChild(btn);
    };

    category.choices.forEach(choice => {
      const label = this._resolveChoiceActionLabel(choice, null, category.id);
      addOption(label, () => this._handlePreChallengeChoice(survivor, location, choice));
    });

    this._appendNavButtonsToColumn(optionColumn, {
      canBack: true,
      canChangeTopic: true,
      onBack: () => this._showTopicSelection(survivor, location),
      onChangeTopic: () => this._showTopicSelection(survivor, location),
      session: this.nodeSession || this.conversationSession
    });
    parchment.appendChild(optionColumn);
    content.appendChild(parchment);

    this.state = {
      ...(this.state || {}),
      npcId: survivor.id,
      topic: categoryId
    };
  }

  _showPreChallengeSpecificMenu(survivor, location, target, category) {
    this._clearOverlay({ preserveSession: true });
    const overlay = this._buildOverlayShell(survivor, { reuse: true });
    const content = this._getConversationContent(overlay);
    this._clearConversationContent(content);
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

    category.choices.forEach(choice => {
      const label = this._resolveChoiceActionLabel(choice, target, category.id);
      const btn = this._createChoiceButton({
        label,
        onClick: () => this._handlePreChallengeChoice(survivor, location, choice, target),
        fallback: { npc: survivor }
      });
      optionColumn.appendChild(btn);
    });

    this._appendNavButtonsToColumn(optionColumn, {
      canBack: true,
      canChangeTopic: true,
      onBack: () => this._showPreChallengeCategoryMenu(survivor, location, category.id),
      onChangeTopic: () => this._showTopicSelection(survivor, location),
      session: this.nodeSession || this.conversationSession
    });
    parchment.appendChild(optionColumn);
    content.appendChild(parchment);
  }

  _handlePreChallengeChoice(survivor, location, choice, target = null) {
    console.log('[CONVO-DEBUG] _handlePreChallengeChoice ENTRY', { survivorName: survivor?.firstName, choiceId: choice?.id, choiceLabel: choice?.label });
    const player = this.gameManager.getPlayerSurvivor?.();
    if (!player) return;
    this._clearOverlay({ preserveSession: true });

    if (this._isExchangeChoiceEligible(choice?.id)) {
      this.runConversationExchange({
        playerId: player.id,
        npcId: survivor.id,
        choiceId: choice.id,
        targetId: target?.id || null,
        location
      });
      return;
    }

    const trustScore = this._getTrustScore(survivor, player);
    const npcStyle = this._getNpcStyleKey(survivor?.gameplayStyle || survivor?.personality);
    const riskLevel = Number.isFinite(choice.riskLevel) ? choice.riskLevel : 0.4;
    let allowedModes = choice.responseModes || [];
    if (['IR3', 'ST4', 'CR5'].includes(choice.id) && trustScore < 75) {
      allowedModes = allowedModes.filter(mode => mode !== 'truth');
    }
    const responseMode = this._resolveNpcResponseMode({
      npcStyle,
      trustScore,
      npcParanoia: survivor?.paranoia || 0,
      npcSuspicion: survivor?.suspicion || 0,
      npcThreat: survivor?.threat || 0,
      playerSuspicion: player?.suspicion || 0,
      playerThreat: player?.threat || 0,
      topicRisk: riskLevel,
      allowedModes
    });

    const intelPacket = this._getPreChallengeIntel(choice.id, target, responseMode);
    const playerLine = this._resolvePlayerLine(choice, target);
    const npcLine = this._buildNpcResponseLine({
      npc: survivor,
      responseMode,
      choiceId: choice.id,
      choice,
      intelText: intelPacket?.text || null,
      targetName: target?.firstName || null,
      npcStyle
    });

    const resolved = this._resolvePreChallengeEffects({
      choiceId: choice.id,
      trustScore,
      responseMode,
      target,
      npc: survivor
    });

    this._applyConversationEffects({
      player,
      npc: survivor,
      choiceId: choice.id,
      target,
      intelPacket,
      deltas: resolved.deltas,
      responseMode
    });

    const outcomeSummary = this._formatPreChallengeOutcome(choice.outcomeTemplate, {
      npc: survivor,
      target,
      intel: intelPacket?.text || 'a subtle read',
      deltas: resolved.deltas,
      riskLine: resolved.riskLine,
      trustScore,
      responseMode
    });

    if (this._isConversationDebugEnabled() && typeof window !== 'undefined' && typeof window.debugBanner === 'function') {
      const bannerText = `mode=${responseMode} relΔ=${resolved.deltas.relationshipDelta || 0} trustΔ=${resolved.deltas.trustDelta || 0} suspΔ=${resolved.deltas.speakerSuspicionDelta || 0} intel=${intelPacket?.key || 'none'}`;
      window.debugBanner(`PRE-CONVO: ${choice.id}`, bannerText);
    }

    this._showPreChallengeSequence({
      npc: survivor,
      playerLine,
      npcLine,
      outcomeSummary,
      location
    });
  }

  runConversationExchange({ playerId, npcId, choiceId, targetId = null, location = null }) {
    console.log('[CONVO-DEBUG] runConversationExchange ENTRY', { npcId, choiceId, targetId });
    const player = this.gameManager.getPlayerSurvivor?.();
    const npc = this._getSurvivorById(npcId);
    const { choice, category } = this._getPreChallengeChoiceById(choiceId);
    console.log('[CONVO-DEBUG] runConversationExchange data', { hasPlayer: !!player, hasNpc: !!npc, hasChoice: !!choice });
    if (!player || !npc || !choice) return;

    const target = targetId ? this._getSurvivorById(targetId) : null;
    const exchange = this._initializeExchangeState({
      npc,
      player,
      choiceId,
      categoryId: category?.id || choiceId,
      targetId,
      location
    });
    this.activeExchange = exchange;

    this._runExchangeStep({
      exchange,
      action: 'INITIAL',
      choice,
      category,
      npc,
      player,
      target,
      location
    });
  }

  _runExchangeStep({ exchange, action, choice, category, npc, player, target, location }) {
    const stepIndex = exchange.stepIndex;
    const npcStyle = this._getNpcStyleKey(npc?.gameplayStyle || npc?.personality);
    const followupAction = action !== 'INITIAL' ? action : null;
    const playerLine = action === 'INITIAL'
      ? this._resolvePlayerLine(choice, target)
      : this._buildFollowupPlayerLine(action, choice, target);

    const actionPayload = this._applyFollowupActionEffects({ action, exchange, npc });
    const responseResolution = this._resolveExchangeResponse({
      exchange,
      action,
      choice,
      category,
      npc,
      player,
      target,
      npcStyle
    });

    const intelPayload = this._resolveExchangeIntel({
      exchange,
      choice,
      category,
      npc,
      target,
      responseMode: responseResolution.responseMode,
      cave: responseResolution.cave,
      action
    });

    const npcLine = this._buildNpcResponseLine({
      npc,
      responseMode: responseResolution.responseMode,
      choice,
      choiceId: choice.id,
      intelText: intelPayload.intelLine,
      targetName: target?.firstName || null,
      npcStyle,
      stepIndex,
      followupAction
    });

    let resolvedEffects = null;
    const stepDeltas = action === 'INITIAL'
      ? (resolvedEffects = this._resolvePreChallengeEffects({
        choiceId: choice.id,
        trustScore: exchange.trustScore,
        responseMode: responseResolution.responseMode,
        target,
        npc
      })).deltas
      : this._resolveFollowupDeltas({
        action,
        responseMode: responseResolution.responseMode,
        exchange,
        npc,
        backfire: responseResolution.backfire
      });

    const combinedDeltas = this._mergeExchangeDeltas(actionPayload.deltas, stepDeltas);
    this._applyExchangeStepEffects({
      player,
      npc,
      target,
      choiceId: choice.id,
      responseMode: responseResolution.responseMode,
      deltas: combinedDeltas,
      exchange,
      intelPayload,
      action
    });

    exchange.intelQuality = intelPayload.intelQuality;
    exchange.intelSummary = intelPayload.intelSummary;
    exchange.lastResponseMode = responseResolution.responseMode;
    exchange.riskSummary = responseResolution.backfire
      ? 'Backfired — they got defensive.'
      : (resolvedEffects?.riskLine || exchange.riskSummary || 'Low');
    exchange.trustScore = this._getTrustScore(npc, player);
    exchange.suspicionScore = npc?.suspicion || 0;
    exchange.opennessScore = this._clampMetric(exchange.trustScore - exchange.suspicionScore * 0.3);

    this._logExchangeDebug({ exchange, responseMode: responseResolution.responseMode });

    console.log('[CONVO-DEBUG] _runExchangeStep showing playerLine:', playerLine?.substring?.(0, 50));
    this._renderConversationOverlay(npc, playerLine, [
      {
        label: 'Next',
        onClick: () => {
          console.log('[CONVO-DEBUG] Player line Next clicked, showing NPC line:', npcLine?.substring?.(0, 50));
          this._renderConversationOverlay(npc, npcLine, [
            {
              label: 'Next',
              onClick: () => {
                console.log('[CONVO-DEBUG] NPC line Next clicked, checking followup eligibility');
                const followupEligible = this._shouldOfferFollowup({
                  exchange,
                  choice,
                  responseMode: responseResolution.responseMode
                });
                console.log('[CONVO-DEBUG] followupEligible:', followupEligible);

                if (followupEligible) {
                  console.log('[CONVO-DEBUG] Showing followup options');
                  this._showFollowupOptions({
                    exchange,
                    choice,
                    category,
                    npc,
                    player,
                    target,
                    location
                  });
                  return;
                }

                console.log('[CONVO-DEBUG] Showing exchange outcome (no followup)');
                this._showExchangeOutcome({
                  exchange,
                  npc,
                  location
                });
              }
            }
          ]);
        }
      }
    ]);
  }

  _showFollowupOptions({ exchange, choice, category, npc, player, target, location }) {
    const options = [
      FOLLOWUP_ACTIONS.PRESS.label,
      FOLLOWUP_ACTIONS.REASSURE.label,
      FOLLOWUP_ACTIONS.PIVOT.label,
      FOLLOWUP_ACTIONS.DROP.label
    ];

    this._renderConversationOverlay(
      npc,
      'How do you respond?',
      options.map(option => ({
        label: option,
        onClick: () => {
          const action = Object.values(FOLLOWUP_ACTIONS).find(entry => entry.label === option)?.key;
          if (!action) {
            this._showExchangeOutcome({ exchange, npc, location });
            return;
          }

          if (action === 'DROP') {
            this._runExchangeStep({
              exchange,
              action,
              choice,
              category,
              npc,
              player,
              target,
              location
            });
            return;
          }

          exchange.stepIndex += 1;
          this._runExchangeStep({
            exchange,
            action,
            choice,
            category,
            npc,
            player,
            target,
            location
          });
        }
      }))
    );
  }

  _showExchangeOutcome({ exchange, npc, location }) {
    const outcomeSummary = this._formatExchangeOutcome(exchange);
    this._renderConversationOverlay(npc, outcomeSummary, [
      {
        label: 'Ask Another',
        onClick: () => {
          this.activeExchange = null;
          this._showTopicSelection(npc, location);
        }
      },
      {
        label: 'Close',
        alt: true,
        onClick: () => {
          this.activeExchange = null;
          this.closeConversation('player_end');
        }
      }
    ]);
  }

  _initializeExchangeState({ npc, player, choiceId, categoryId, targetId, location }) {
    const socialMemorySystem = this.gameManager.systems?.socialMemorySystem;
    if (socialMemorySystem?.initNPC) {
      socialMemorySystem.initNPC(npc.id);
    }
    const memory = socialMemorySystem?.memory?.[npc.id];
    const now = Date.now();
    let timesPressedRecently = memory?.timesPressedRecently || 0;
    if (memory?.lastPressAt && now - memory.lastPressAt > 120000) {
      timesPressedRecently = 0;
    }
    if (memory) {
      memory.timesPressedRecently = timesPressedRecently;
      memory.lastTopicKey = categoryId;
    }

    const trustScore = this._getTrustScore(npc, player);
    const suspicionScore = npc?.suspicion || 0;
    return {
      exchangeId: `ex-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
      phase: 'pre',
      topicKey: categoryId,
      targetId,
      stepIndex: 0,
      opennessScore: this._clampMetric(trustScore - suspicionScore * 0.3),
      pressureScore: 0,
      suspicionScore,
      trustScore,
      intelQuality: INTEL_QUALITY.NONE,
      intelSummary: 'No clear intel.',
      deltas: {
        relationshipDelta: 0,
        trustDelta: 0,
        suspicionDelta: 0
      },
      riskSummary: 'Low',
      pivotCount: 0,
      timesPressedRecently,
      lastChoiceId: choiceId,
      location
    };
  }

  _getPreChallengeChoiceById(choiceId) {
    for (const category of PRE_CHALLENGE_TREE.categories) {
      const choice = category.choices.find(entry => entry.id === choiceId);
      if (choice) return { choice, category };
    }
    return { choice: null, category: null };
  }

  _isExchangeChoiceEligible(choiceId) {
    const eligibleChoices = new Set([
      'RR2', 'RR3', 'RR4', 'RR5', 'RR6', 'RR7',
      'TS1', 'TS2', 'TS3', 'TS4', 'TS5', 'TS6', 'TS7', 'TS8', 'TS9',
      'IR1', 'IR2', 'IR3', 'IR4', 'IR5',
      'ST1', 'ST2', 'ST3', 'ST4', 'ST5', 'ST6'
    ]);
    return eligibleChoices.has(choiceId);
  }

  _buildFollowupPlayerLine(action, choice, target) {
    switch (action) {
      case 'PRESS':
        return 'You press for specifics.';
      case 'REASSURE':
        return 'You ease up and keep it casual.';
      case 'PIVOT':
        return 'You shift the angle without leaving the topic.';
      case 'DROP':
        return 'You drop the line of questioning.';
      default:
        return this._resolvePlayerLine(choice, target);
    }
  }

  _applyFollowupActionEffects({ action, exchange, npc }) {
    const deltas = {
      relationshipDelta: 0,
      trustDelta: 0,
      reliabilityDelta: 0,
      speakerSuspicionDelta: 0,
      npcParanoiaDelta: 0,
      playerParanoiaDelta: 0,
      repStrategicDelta: 0,
      repParanoidDelta: 0
    };

    if (action === 'PRESS') {
      exchange.pressureScore = this._clampMetric(exchange.pressureScore + 25);
      deltas.repStrategicDelta += 1;
      deltas.speakerSuspicionDelta += 1;
      this._registerPress(npc.id, exchange);
    } else if (action === 'REASSURE') {
      exchange.pressureScore = this._clampMetric(exchange.pressureScore - 15);
      deltas.trustDelta += 1;
      deltas.speakerSuspicionDelta -= 1;
    } else if (action === 'PIVOT') {
      exchange.pivotCount += 1;
      if (exchange.pivotCount > 1) {
        deltas.speakerSuspicionDelta += 1;
      }
    } else if (action === 'DROP') {
      exchange.pressureScore = 0;
      const style = (npc?.gameplayStyle || '').toLowerCase();
      if (style.includes('social') || style.includes('charmer')) {
        deltas.trustDelta += 1;
      }
    }

    return { deltas };
  }

  _resolveExchangeResponse({ exchange, action, choice, category, npc, player, target, npcStyle }) {
    if (action === 'DROP') {
      return { responseMode: 'reassure', cave: false, backfire: false };
    }

    const trustScore = this._getTrustScore(npc, player);
    const backfire = action === 'PRESS' && this._shouldBackfirePress({ exchange, npc, trustScore });
    if (backfire) {
      const options = ['counterQ', 'deflect', 'escalate'];
      const responseMode = options[getRandomInt(0, options.length - 1)];
      return { responseMode, cave: false, backfire: true };
    }

    const cave = action === 'PRESS' && this._shouldCave({ exchange, npc, player, choice, category });
    if (cave) {
      return { responseMode: 'truth', cave: true, backfire: false };
    }

    const responseMode = this._resolveNpcResponseMode({
      npcStyle,
      trustScore,
      npcParanoia: npc?.paranoia || 0,
      npcSuspicion: npc?.suspicion || 0,
      npcThreat: npc?.threat || 0,
      playerSuspicion: player?.suspicion || 0,
      playerThreat: player?.threat || 0,
      topicRisk: Number.isFinite(choice.riskLevel) ? choice.riskLevel : 0.4,
      allowedModes: choice.responseModes || []
    });

    return { responseMode, cave: false, backfire: false };
  }

  _resolveExchangeIntel({ exchange, choice, category, npc, target, responseMode, cave, action }) {
    if (action === 'DROP') {
      return {
        intelLine: 'Let’s keep it calm.',
        intelSummary: exchange.intelSummary || 'No clear intel.',
        intelQuality: exchange.intelQuality || INTEL_QUALITY.NONE
      };
    }

    const intelPacket = action === 'PIVOT'
      ? this._getPivotIntelPacket(category?.id, target)
      : this._getPreChallengeIntel(choice.id, target, responseMode);

    const style = (npc?.gameplayStyle || '').toLowerCase();
    let intelLine = intelPacket?.text || 'a guarded read';
    let intelSummary = intelLine;
    let intelQuality = this._resolveIntelQuality({ responseMode, cave, exchange });

    if (responseMode === 'truth' && cave) {
      const concrete = this._buildConcreteIntel({ npc, target, categoryId: category?.id, choiceId: choice.id });
      intelLine = concrete.line;
      intelSummary = concrete.summary;
      intelQuality = INTEL_QUALITY.CONCRETE;
      if (style.includes('power')) {
        intelLine = `${intelLine} "Here’s what we should do with that."`;
      }
    } else if (responseMode === 'deflect' || responseMode === 'counterQ' || responseMode === 'escalate') {
      intelLine = '';
      intelSummary = 'No clear intel.';
      intelQuality = exchange.intelQuality === INTEL_QUALITY.NONE ? INTEL_QUALITY.NONE : exchange.intelQuality;
    } else if (responseMode === 'misdirect') {
      intelSummary = intelPacket?.text || 'A slippery read that might be off.';
      intelQuality = this._resolveIntelQuality({ responseMode, cave, exchange });
    } else if (responseMode === 'reassure' && action !== 'INITIAL') {
      intelLine = intelPacket?.text || 'Let’s keep it calm.';
      intelSummary = exchange.intelSummary || intelSummary;
      intelQuality = exchange.intelQuality || intelQuality;
    }

    if (exchange.intelQuality && exchange.intelQuality !== INTEL_QUALITY.NONE) {
      intelQuality = this._upgradeIntelQuality(exchange.intelQuality, intelQuality);
    }

    return { intelLine, intelSummary, intelQuality };
  }

  _resolveIntelQuality({ responseMode, cave, exchange }) {
    if (responseMode === 'truth') {
      return cave ? INTEL_QUALITY.CONCRETE : INTEL_QUALITY.PARTIAL;
    }
    if (responseMode === 'softTruth' || responseMode === 'misdirect') {
      return INTEL_QUALITY.VAGUE;
    }
    if (responseMode === 'reassure') {
      return exchange.intelQuality || INTEL_QUALITY.NONE;
    }
    return INTEL_QUALITY.NONE;
  }

  _upgradeIntelQuality(current, incoming) {
    const order = [INTEL_QUALITY.NONE, INTEL_QUALITY.VAGUE, INTEL_QUALITY.PARTIAL, INTEL_QUALITY.CONCRETE];
    const currentIndex = order.indexOf(current);
    const incomingIndex = order.indexOf(incoming);
    return order[Math.max(currentIndex, incomingIndex)] || incoming;
  }

  _buildConcreteIntel({ npc, target, categoryId, choiceId }) {
    const availableNames = this._getAvailableTargetNames(npc);
    const pickName = () => availableNames[getRandomInt(0, Math.max(0, availableNames.length - 1))];
    const firstName = target?.firstName || pickName() || 'someone';
    const secondName = availableNames.length > 1
      ? availableNames.find(name => name !== firstName) || pickName()
      : null;
    const style = (npc?.gameplayStyle || '').toLowerCase();
    const names = style.includes('shadow strategist')
      ? [firstName]
      : (secondName ? [firstName, secondName] : [firstName]);

    const summary = names.length > 1
      ? `Named ${names.join(' and ')}.`
      : `Named ${names[0]}.`;

    if (choiceId === 'RR4') {
      return {
        line: style.includes('shadow strategist')
          ? `Alright. If we lose, maybe ${names[0]} is the one people would write.`
          : `Alright. If we lose, I think ${names[0]} is the one people would write.`,
        summary: `Named ${names[0]} as the likely vote.`
      };
    }

    if (categoryId === 'talk_specific' && target?.firstName) {
      return {
        line: style.includes('shadow strategist')
          ? `Alright. ${target.firstName} is the name people keep circling, maybe.`
          : `Alright. ${target.firstName} is the name people keep circling.`,
        summary: `Called out ${target.firstName} by name.`
      };
    }

    return {
      line: `Alright. If it turns, I’d say ${names.join(' or ')}.`,
      summary
    };
  }

  _getPivotIntelPacket(categoryId, target) {
    const targetName = target?.firstName || 'them';
    const pick = (key) => this._pickFromArray(PRE_CHALLENGE_INTEL_LIBRARY[key] || []);
    switch (categoryId) {
      case 'read_room':
        return { key: 'campVibe', text: pick('campVibe') };
      case 'talk_specific':
        return { key: 'targetRead', text: `${targetName} comes off as ${pick('targetRead')}` };
      case 'idols_rumors':
        return { key: 'idolChatter', text: pick('idolChatter') };
      case 'strategy':
        return { key: 'alignment', text: pick('alignment') };
      default:
        return { key: 'vibe', text: 'a cautious read' };
    }
  }

  _resolveFollowupDeltas({ action, responseMode, exchange, npc, backfire }) {
    const deltas = {
      relationshipDelta: 0,
      trustDelta: 0,
      reliabilityDelta: 0,
      speakerSuspicionDelta: 0,
      npcParanoiaDelta: 0,
      playerParanoiaDelta: 0,
      repStrategicDelta: 0,
      repParanoidDelta: 0
    };

    if (responseMode === 'truth') {
      deltas.trustDelta += 1;
    } else if (responseMode === 'misdirect') {
      deltas.trustDelta -= 1;
    } else if (responseMode === 'deflect' || responseMode === 'counterQ') {
      deltas.speakerSuspicionDelta += 1;
    } else if (responseMode === 'escalate') {
      deltas.relationshipDelta -= 1;
      deltas.trustDelta -= 2;
      deltas.speakerSuspicionDelta += 2;
      deltas.repParanoidDelta += 1;
    }

    if (action === 'PRESS' && responseMode !== 'truth') {
      deltas.speakerSuspicionDelta += 1;
    }

    if (backfire) {
      deltas.trustDelta -= 2;
      deltas.speakerSuspicionDelta += 2;
      deltas.repParanoidDelta += 1;
    }

    if (action === 'REASSURE' && responseMode === 'reassure') {
      deltas.relationshipDelta += 1;
    }

    if (action === 'DROP') {
      deltas.relationshipDelta += 0;
    }

    return deltas;
  }

  _mergeExchangeDeltas(primary = {}, secondary = {}) {
    const merged = { ...primary };
    Object.entries(secondary).forEach(([key, value]) => {
      merged[key] = (merged[key] || 0) + (value || 0);
    });
    return merged;
  }

  _applyExchangeStepEffects({ player, npc, target, choiceId, responseMode, deltas, exchange, intelPayload, action }) {
    const relationshipSystem = this.gameManager.systems?.relationshipSystem;
    const socialMemorySystem = this.gameManager.systems?.socialMemorySystem;
    const playerId = player?.id;

    if (relationshipSystem?.changeRelationship && deltas.relationshipDelta) {
      relationshipSystem.changeRelationship(playerId, npc.id, deltas.relationshipDelta);
    }
    if (deltas.trustDelta) {
      this.gameManager.changeTrust?.(playerId, npc.id, deltas.trustDelta, `exchange:${choiceId || 'conversation'}`);
    }
    if (socialMemorySystem?.adjustReliability && deltas.reliabilityDelta) {
      socialMemorySystem.adjustReliability(npc.id, deltas.reliabilityDelta);
    }

    if (deltas.speakerSuspicionDelta) {
      npc.suspicion = this._clampMetric((npc.suspicion || 0) + deltas.speakerSuspicionDelta);
    }
    if (deltas.npcParanoiaDelta) {
      npc.paranoia = this._clampMetric((npc.paranoia || 0) + deltas.npcParanoiaDelta);
    }
    if (deltas.playerParanoiaDelta) {
      player.paranoia = this._clampMetric((player.paranoia || 0) + deltas.playerParanoiaDelta);
      this._updatePlayerReputation({ paranoid: deltas.playerParanoiaDelta });
    }

    if (target) {
      if (deltas.targetThreatDelta) {
        target.threat = this._clampMetric((target.threat || 0) + deltas.targetThreatDelta);
      }
      if (deltas.targetSuspicionDelta) {
        target.suspicion = this._clampMetric((target.suspicion || 0) + deltas.targetSuspicionDelta);
      }
    }

    if (deltas.repStrategicDelta || deltas.repHelpfulDelta || deltas.repFakeDelta || deltas.repParanoidDelta) {
      this._updatePlayerReputation({
        strategic: deltas.repStrategicDelta,
        helpful: deltas.repHelpfulDelta,
        fake: deltas.repFakeDelta,
        paranoid: deltas.repParanoidDelta
      });
    }

    exchange.deltas.relationshipDelta += deltas.relationshipDelta || 0;
    exchange.deltas.trustDelta += deltas.trustDelta || 0;
    exchange.deltas.suspicionDelta += deltas.speakerSuspicionDelta || 0;

    if (socialMemorySystem?.recordConversationEvent) {
      socialMemorySystem.recordConversationEvent({
        type: 'PRE_CONVO_EXCHANGE',
        speakerId: playerId,
        listenerId: npc.id,
        topicPersonId: target?.id || null,
        data: {
          choiceId,
          action,
          resolvedMode: responseMode,
          intelQuality: intelPayload?.intelQuality,
          intelSummary: intelPayload?.intelSummary,
          deltas,
          exchangeId: exchange.exchangeId
        },
        phase: 'pre'
      });
    }

    if (action === 'INITIAL') {
      this._updateLastTopics(npc.id, choiceId);
    }
  }

  _formatExchangeOutcome(exchange) {
    const formatDelta = (value) => `${value >= 0 ? '+' : ''}${value || 0}`;
    const relDelta = formatDelta(exchange.deltas.relationshipDelta);
    const trustDelta = formatDelta(exchange.deltas.trustDelta);
    const suspDelta = formatDelta(exchange.deltas.suspicionDelta);
    const intelQuality = exchange.intelQuality || INTEL_QUALITY.NONE;
    const intelSummary = exchange.intelSummary || 'No clear intel.';
    const riskSummary = exchange.riskSummary || 'Low';

    return `Outcome: ${relDelta} Relationship. ${trustDelta} Trust. ${suspDelta} Suspicion.\nIntel (${intelQuality}): ${intelSummary}.\nRisk: ${riskSummary}`;
  }

  _shouldOfferFollowup({ exchange, choice, responseMode }) {
    const followupModes = new Set(['softTruth', 'deflect', 'counterQ', 'misdirect']);
    if (!followupModes.has(responseMode)) return false;
    if (exchange.stepIndex >= 2) return false;
    return this._isExchangeChoiceEligible(choice.id);
  }

  _shouldBackfirePress({ exchange, npc, trustScore }) {
    const paranoia = npc?.paranoia || 0;
    const threat = npc?.threat || 0;
    const lowTrust = trustScore < 45;
    const pressSpam = exchange.timesPressedRecently >= 2;
    const extremePressure = exchange.pressureScore >= 70;
    return lowTrust || paranoia >= 70 || threat >= 75 || pressSpam || extremePressure;
  }

  _shouldCave({ exchange, npc, player, choice, category }) {
    const relationshipScore = this._relationshipBetween(player?.id, npc?.id) || 50;
    const socialMemorySystem = this.gameManager.systems?.socialMemorySystem;
    const reliability = socialMemorySystem?.getReliability?.(npc.id) ?? 50;
    const trustScore = this._getTrustScore(npc, player);
    const paranoia = npc?.paranoia || 0;
    const suspicion = npc?.suspicion || 0;
    const pressureScore = exchange.pressureScore;

    let trustGate = trustScore >= 70 || (relationshipScore >= 65 && reliability >= 60);
    const moderatePressure = pressureScore >= 25 && pressureScore <= 55;
    if (!moderatePressure) return false;
    if (paranoia >= 65 || suspicion >= 70) return false;

    const style = (npc?.gameplayStyle || '').toLowerCase();
    if (style.includes('social genius')) {
      trustGate = trustScore >= 60 || (relationshipScore >= 55 && reliability >= 55);
    }
    if (style.includes('shadow strategist')) {
      trustGate = trustScore >= 80 && reliability >= 70;
    }
    if (style.includes('competitive')) {
      const challengeTopics = new Set(['ST2', 'CL5']);
      if (!challengeTopics.has(choice.id)) return false;
    }
    if (style.includes('lethal charmer')) {
      trustGate = trustScore >= 72 || exchange.pressureScore <= 35;
    }
    if (style.includes('wildcard') && trustScore >= 55 && Math.random() < 0.3) {
      return true;
    }

    if (trustScore >= 80 && paranoia < 45 && Math.random() < 0.25) {
      return true;
    }

    return Boolean(trustGate);
  }

  _registerPress(npcId, exchange) {
    const socialMemorySystem = this.gameManager.systems?.socialMemorySystem;
    if (!socialMemorySystem?.initNPC) return;
    socialMemorySystem.initNPC(npcId);
    const memory = socialMemorySystem.memory[npcId];
    const now = Date.now();
    if (memory.lastPressAt && now - memory.lastPressAt > 120000) {
      memory.timesPressedRecently = 0;
    }
    memory.timesPressedRecently = (memory.timesPressedRecently || 0) + 1;
    memory.lastPressAt = now;
    exchange.timesPressedRecently = memory.timesPressedRecently;
  }

  _logExchangeDebug({ exchange, responseMode }) {
    if (!this._isConversationDebugEnabled()) return;
    const line = `EXCHANGE ${exchange.exchangeId} step=${exchange.stepIndex} topic=${exchange.topicKey} mode=${responseMode} pressure=${exchange.pressureScore} trustScore=${exchange.trustScore} susp=${exchange.suspicionScore} intel=${exchange.intelQuality}`;
    if (typeof window !== 'undefined' && typeof window.debugBanner === 'function') {
      window.debugBanner('EXCHANGE', line);
    }
    console.debug(line);
  }

  _showPreChallengeSequence({ npc, playerLine, npcLine, outcomeSummary, location }) {
    console.log('[CONVO-DEBUG] _showPreChallengeSequence ENTRY', { npc: npc?.firstName, playerLine: playerLine?.substring?.(0, 40) });
    console.log('[CONVO-DEBUG] Calling showDialogue for playerLine');
    this._renderConversationOverlay(npc, playerLine, [
      {
        label: 'Next',
        onClick: () => {
          this._renderConversationOverlay(npc, npcLine, [
            {
              label: 'Next',
              onClick: () => {
                this._renderConversationOverlay(npc, outcomeSummary, [
                  {
                    label: 'Ask Another',
                    onClick: () => this._showTopicSelection(npc, location)
                  },
                  {
                    label: 'Close',
                    alt: true,
                    onClick: () => this.closeConversation('player_end')
                  }
                ]);
              }
            }
          ]);
        }
      }
    ]);
  }

  _resolveChoiceActionLabel(choice, target) {
    const targetName = target?.firstName || 'them';

    const explicit =
      choice?.buttonLabel ||
      choice?.buttonText ||
      choice?.button ||
      choice?.shortLabel ||
      choice?.label;

    if (explicit) return String(explicit).replace('{TARGET}', targetName);

    // Fallback: derive a short label from the first line (keep it readable & few words)
    const derivedLine = choice?.lines?.[0] ? String(choice.lines[0]) : this._resolvePlayerLine(choice, target);
    return this._makeButtonLabelFromLine(derivedLine, targetName);
  }

  _makeButtonLabelFromLine(line, targetName = 'them') {
    let s = String(line || '').trim();

    // Remove quotes & punctuation that reads weird on a button
    s = s.replace(/[“”"]/g, '').replace(/[’]/g, "'").replace(/[!?]+$/g, '').trim();
    s = s.replace('{TARGET}', targetName);

    // Common compressions
    if (/quick check-in|how are you holding up|you doing alright/i.test(s)) return 'Check in';
    if (/camp vibe|vibing|spiraling/i.test(s)) return 'Camp vibe';
    if (/anyone seem off|acting different/i.test(s)) return "Who's off?";
    if (/where do i stand|am i good with you/i.test(s)) return 'Where I stand';
    if (/we good\??$/i.test(s)) return 'Are we good?';
    if (/who.*closest|clicking with/i.test(s)) return 'Closest allies';
    if (/who.*biggest threat/i.test(s)) return 'Biggest threat';
    if (/backup/i.test(s)) return 'Backup plan';
    if (/idol/i.test(s) && /heard|talk/i.test(s)) return 'Idol chatter';

    // Keep it short if still long
    const maxLen = 28;
    if (s.length > maxLen) {
      s = s.slice(0, maxLen - 1).trim() + '…';
    }
    return s;
  }

  _resolvePlayerLine(choice, target) {
    const line = this._pickFromArray(choice.lines || []);
    if (!line) return '...';
    const share = this._pickFromArray(PRE_CHALLENGE_PERSONAL_SHARES);
    const targetName = target?.firstName || 'them';
    return line.replace('{share}', share).replace('{TARGET}', targetName);
  }


  _resolveChoiceActionLabel(choice, target, categoryId = '') {
    if (!choice) return '...';

    // Preferred: explicit label fields on the choice
    const raw =
      choice.actionLabel ||
      choice.buttonLabel ||
      choice.shortLabel ||
      null;

    const targetName = target?.firstName || 'them';
    if (raw) return String(raw).replace('{TARGET}', targetName);

    // Heuristic fallback: keep buttons short and clear (what you intend), not the full quote.
    const tones = Array.isArray(choice.tones) ? choice.tones : [];
    if (tones.includes('playful')) return 'Crack a joke';
    if (tones.includes('apology')) return 'Apologize';
    if (tones.includes('deal')) return 'Propose a deal';
    if (tones.includes('confront')) return 'Confront';
    if (tones.includes('helpful')) return 'Team up';
    if (tones.includes('warm') && tones.includes('personal')) return 'Share something';
    if (tones.includes('warm')) return 'Check in';
    if (tones.includes('direct')) return 'Ask straight';
    if (tones.includes('neutral') && /read_room|room|vibe/i.test(categoryId)) return 'Vibe check';

    // ID-based fallback
    const id = String(choice.id || '').toUpperCase();
    if (id.startsWith('BC')) {
      const map = { BC1: 'Check in', BC2: 'Share something', BC3: 'Give props', BC4: 'Crack a joke', BC5: 'Team up' };
      return map[id] || 'Connect';
    }
    if (id.startsWith('RR')) return 'Read the room';
    if (id.startsWith('ST')) return 'Talk strategy';
    if (id.startsWith('ID')) return 'Ask about idols';
    if (id.startsWith('DE')) return 'Make a deal';

    // Absolute fallback: use the first sentence of the player line, trimmed.
    const full = this._resolvePlayerLine(choice, target) || '...';
    return String(full).replace(/[.?!].*$/, '').slice(0, 34);
  }

  _getPreChallengeIntel(choiceId, target, responseMode) {
    const targetName = target?.firstName || 'them';
    const pick = (key) => this._pickFromArray(PRE_CHALLENGE_INTEL_LIBRARY[key] || []);
    switch (choiceId) {
      case 'BC1':
        return { key: 'campVibe', text: pick('campVibe') };
      case 'BC5':
        return { key: 'teamwork', text: responseMode === 'deflect' ? 'they dodged the task invite' : 'they were open to team up' };
      case 'RR1':
        return { key: 'campVibe', text: pick('campVibe') };
      case 'RR2':
        return { key: 'behaviorShifts', text: pick('behaviorShifts') };
      case 'RR3':
        return { key: 'npcComfort', text: pick('npcComfort') };
      case 'RR4':
        return { key: 'safety', text: pick('safety') };
      case 'RR5':
        return { key: 'closestAllies', text: pick('closestAllies') };
      case 'RR7':
        return { key: 'playerStanding', text: pick('playerStanding') };
      case 'TS1':
        return { key: 'targetTrust', text: `${targetName} feels ${pick('read')}` };
      case 'TS2':
        return { key: 'targetRead', text: `${targetName} comes off as ${pick('targetRead')}` };
      case 'TS5':
        return { key: 'rumor', text: pick('rumor') };
      case 'TS7':
        return { key: 'loyaltyRead', text: pick('loyalty') };
      case 'TS8':
        return { key: 'jealousy', text: pick('jealousy') };
      case 'CL1':
        return { key: 'physicalState', text: pick('campState') };
      case 'CL2':
        return { key: 'morale', text: pick('morale') };
      case 'CL3':
        return { key: 'grievances', text: pick('grievances') };
      case 'CL4':
        return { key: 'motive', text: pick('motives') };
      case 'CL5':
        return { key: 'workEthic', text: pick('workEthic') };
      case 'IR1':
        return { key: 'weirdStuff', text: pick('weirdStuff') };
      case 'IR2':
        return { key: 'idolChatter', text: pick('idolChatter') };
      case 'IR3':
        return { key: 'idolClimate', text: pick('idolChatter') };
      case 'IR5':
        return { key: 'perception', text: pick('perception') };
      case 'ST1':
        return { key: 'voteType', text: pick('voteType') };
      case 'ST2':
        return { key: 'challengeTargets', text: pick('challengeTargets') };
      case 'ST3':
        return { key: 'threatRead', text: pick('threatRead') };
      case 'ST4':
        return { key: 'voteName', text: responseMode === 'truth' ? 'they hinted at a specific name' : 'they kept it vague' };
      case 'ST5':
        return { key: 'numbers', text: pick('alignment') };
      case 'ST6':
        return { key: 'contingency', text: pick('contingency') };
      case 'CR1':
        return { key: 'tension', text: pick('tension') };
      case 'CR3':
        return { key: 'repair', text: pick('repair') };
      case 'CR5':
        return { key: 'pressure', text: responseMode === 'truth' ? 'they finally gave a straight answer' : 'they dodged the question' };
      default:
        return { key: 'vibe', text: 'a guarded read' };
    }
  }

  _resolvePreChallengeEffects({ choiceId, trustScore, responseMode, target, npc }) {
    const deltas = {
      relationshipDelta: 0,
      trustDelta: 0,
      reliabilityDelta: 0,
      speakerSuspicionDelta: 0,
      npcParanoiaDelta: 0,
      targetThreatDelta: 0,
      targetSuspicionDelta: 0,
      playerParanoiaDelta: 0,
      repStrategicDelta: 0,
      repHelpfulDelta: 0,
      repFakeDelta: 0,
      repParanoidDelta: 0
    };

    const isLowTrust = trustScore < 40;
    const isHighTrust = trustScore >= 70;
    const isVeryHighTrust = trustScore >= 75;
    const spammy = this._isChoiceSpammy(npc?.id, choiceId);

    switch (choiceId) {
      case 'BC1':
        deltas.relationshipDelta = 1;
        if (isLowTrust) {
          deltas.speakerSuspicionDelta = 1;
        } else {
          deltas.trustDelta = 1;
        }
        break;
      case 'BC2':
        deltas.relationshipDelta = 2;
        if (trustScore >= 60) deltas.trustDelta = 2;
        if (isLowTrust) deltas.speakerSuspicionDelta = 2;
        break;
      case 'BC3':
        deltas.relationshipDelta = 1;
        deltas.npcParanoiaDelta = -1;
        deltas.repHelpfulDelta = 1;
        if (this._isCategoryRepeated(npc?.id, 'build_connection')) {
          deltas.trustDelta = -1;
          deltas.speakerSuspicionDelta = 1;
        }
        break;
      case 'BC4':
        deltas.relationshipDelta = 1;
        if ((npc?.paranoia || 0) < 70) deltas.npcParanoiaDelta = -1;
        break;
      case 'BC5': {
        deltas.relationshipDelta = 1;
        deltas.trustDelta = 1;
        deltas.repHelpfulDelta = 2;
        const declined = responseMode === 'deflect' || responseMode === 'counterQ';
        if (declined) {
          deltas.relationshipDelta = -1;
          deltas.playerParanoiaDelta = 1;
        }
        break;
      }
      case 'RR1':
        if (spammy) deltas.speakerSuspicionDelta = 1;
        break;
      case 'RR2':
        deltas.speakerSuspicionDelta = 1;
        break;
      case 'RR3':
        deltas.speakerSuspicionDelta = 1;
        break;
      case 'RR4':
        deltas.speakerSuspicionDelta = 2;
        deltas.npcParanoiaDelta = 1;
        if (trustScore >= 70) deltas.trustDelta = 1;
        break;
      case 'RR5':
        deltas.speakerSuspicionDelta = 1;
        break;
      case 'RR6':
        if (trustScore >= 50) deltas.trustDelta = 1;
        if (trustScore < 35) deltas.speakerSuspicionDelta = 1;
        break;
      case 'RR7':
        deltas.speakerSuspicionDelta = 1;
        if (trustScore >= 75) deltas.trustDelta = 1;
        if (isLowTrust) {
          deltas.trustDelta = -1;
          deltas.speakerSuspicionDelta = 2;
        }
        break;
      case 'TS1':
        deltas.targetSuspicionDelta = 1;
        deltas.speakerSuspicionDelta = 1;
        break;
      case 'TS2':
        deltas.speakerSuspicionDelta = 1;
        break;
      case 'TS3':
        deltas.targetThreatDelta = 1;
        deltas.repStrategicDelta = 1;
        deltas.speakerSuspicionDelta = 1;
        break;
      case 'TS4':
        deltas.targetSuspicionDelta = 2;
        deltas.playerParanoiaDelta = 1;
        deltas.speakerSuspicionDelta = 2;
        break;
      case 'TS5':
        deltas.targetSuspicionDelta = 1;
        deltas.speakerSuspicionDelta = 1;
        break;
      case 'TS6':
        deltas.npcParanoiaDelta = 2;
        deltas.targetSuspicionDelta = 2;
        deltas.speakerSuspicionDelta = 2;
        break;
      case 'TS7':
        deltas.playerParanoiaDelta = 1;
        deltas.speakerSuspicionDelta = 1;
        break;
      case 'TS8':
        deltas.npcParanoiaDelta = 1;
        deltas.speakerSuspicionDelta = 1;
        if (npc?.gameplayStyle === 'Social Genius' || npc?.gameplayStyle === 'Lethal Charmer') {
          deltas.trustDelta = 1;
        }
        if (npc?.gameplayStyle === 'Power Player' || npc?.gameplayStyle === 'Shadow Strategist') {
          deltas.trustDelta = -1;
        }
        break;
      case 'TS9':
        deltas.repStrategicDelta = 2;
        if (npc?.gameplayStyle === 'Power Player' || npc?.gameplayStyle === 'Shadow Strategist') {
          deltas.trustDelta = 1;
        }
        deltas.speakerSuspicionDelta = 1;
        break;
      case 'CL1':
        deltas.relationshipDelta = 1;
        break;
      case 'CL2':
        deltas.relationshipDelta = 1;
        deltas.npcParanoiaDelta = responseMode === 'reassure' ? -1 : responseMode === 'deflect' ? 1 : 0;
        break;
      case 'CL3':
        if (isLowTrust) deltas.speakerSuspicionDelta = 1;
        break;
      case 'CL4':
        deltas.relationshipDelta = 1;
        break;
      case 'CL5':
        deltas.repStrategicDelta = 1;
        deltas.speakerSuspicionDelta = 1;
        deltas.targetSuspicionDelta = 1;
        break;
      case 'IR1':
        if (spammy) deltas.speakerSuspicionDelta = 1;
        break;
      case 'IR2':
        deltas.speakerSuspicionDelta = 2;
        break;
      case 'IR3':
        deltas.speakerSuspicionDelta = 2;
        deltas.npcParanoiaDelta = 1;
        break;
      case 'IR4':
        deltas.relationshipDelta = -2;
        deltas.trustDelta = -2;
        deltas.speakerSuspicionDelta = 3;
        deltas.npcParanoiaDelta = 2;
        deltas.repParanoidDelta = 2;
        break;
      case 'IR5':
        if (isLowTrust) {
          deltas.speakerSuspicionDelta = 1;
        } else {
          deltas.repFakeDelta = -1;
        }
        break;
      case 'ST1':
        deltas.repStrategicDelta = 1;
        deltas.speakerSuspicionDelta = 1;
        break;
      case 'ST2':
        deltas.targetThreatDelta = 1;
        break;
      case 'ST3':
        deltas.targetThreatDelta = 2;
        deltas.repStrategicDelta = 2;
        deltas.speakerSuspicionDelta = 2;
        break;
      case 'ST4':
        deltas.speakerSuspicionDelta = 3;
        break;
      case 'ST5':
        if (this.gameManager.systems?.allianceSystem?.areAllied?.(this.gameManager.getPlayerSurvivor?.()?.id, npc?.id)) {
          deltas.trustDelta = 1;
          deltas.reliabilityDelta = 1;
        } else {
          deltas.speakerSuspicionDelta = 2;
        }
        break;
      case 'ST6':
        deltas.repStrategicDelta = 2;
        if (npc?.gameplayStyle === 'Shadow Strategist' || npc?.gameplayStyle === 'Power Player') {
          deltas.trustDelta = 1;
        }
        if (isLowTrust) deltas.speakerSuspicionDelta = 2;
        break;
      case 'CR1':
        if (responseMode === 'reassure' || responseMode === 'softTruth') {
          deltas.trustDelta = 1;
        } else if (isLowTrust) {
          deltas.speakerSuspicionDelta = 2;
        }
        break;
      case 'CR2':
        deltas.speakerSuspicionDelta = 2;
        if (responseMode === 'truth') deltas.trustDelta = 1;
        if (responseMode === 'misdirect') {
          deltas.trustDelta = -2;
          deltas.repFakeDelta = 2;
        }
        break;
      case 'CR3':
        if (responseMode === 'reassure') {
          deltas.relationshipDelta = 1;
          deltas.trustDelta = 1;
        } else if (responseMode === 'deflect') {
          deltas.relationshipDelta = -1;
        }
        break;
      case 'CR4':
        deltas.trustDelta = responseMode === 'deflect' ? 0 : 1;
        deltas.reliabilityDelta = responseMode === 'deflect' ? 0 : 1;
        break;
      case 'CR5':
        deltas.speakerSuspicionDelta = 3;
        deltas.npcParanoiaDelta = 2;
        if (responseMode === 'truth') deltas.trustDelta = 1;
        break;
      default:
        break;
    }

    const riskLine = this._buildRiskLine(choiceId, { trustScore, responseMode, deltas });
    return { deltas, riskLine };
  }

  _applyConversationEffects({ player, npc, choiceId, target, intelPacket, deltas, responseMode }) {
    const relationshipSystem = this.gameManager.systems?.relationshipSystem;
    const socialMemorySystem = this.gameManager.systems?.socialMemorySystem;
    const playerId = player?.id;

    if (relationshipSystem?.changeRelationship && deltas.relationshipDelta) {
      relationshipSystem.changeRelationship(playerId, npc.id, deltas.relationshipDelta);
    }
    if (deltas.trustDelta) {
      this.gameManager.changeTrust?.(playerId, npc.id, deltas.trustDelta, `conversation:${choiceId || 'response'}`);
    }
    if (socialMemorySystem?.adjustReliability && deltas.reliabilityDelta) {
      socialMemorySystem.adjustReliability(npc.id, deltas.reliabilityDelta);
    }

    if (deltas.speakerSuspicionDelta) {
      npc.suspicion = this._clampMetric((npc.suspicion || 0) + deltas.speakerSuspicionDelta);
    }
    if (deltas.npcParanoiaDelta) {
      npc.paranoia = this._clampMetric((npc.paranoia || 0) + deltas.npcParanoiaDelta);
    }
    if (deltas.playerParanoiaDelta) {
      player.paranoia = this._clampMetric((player.paranoia || 0) + deltas.playerParanoiaDelta);
      this._updatePlayerReputation({ paranoid: deltas.playerParanoiaDelta });
    }

    if (target) {
      if (deltas.targetThreatDelta) {
        target.threat = this._clampMetric((target.threat || 0) + deltas.targetThreatDelta);
      }
      if (deltas.targetSuspicionDelta) {
        target.suspicion = this._clampMetric((target.suspicion || 0) + deltas.targetSuspicionDelta);
      }
    }

    if (deltas.repStrategicDelta || deltas.repHelpfulDelta || deltas.repFakeDelta || deltas.repParanoidDelta) {
      this._updatePlayerReputation({
        strategic: deltas.repStrategicDelta,
        helpful: deltas.repHelpfulDelta,
        fake: deltas.repFakeDelta,
        paranoid: deltas.repParanoidDelta
      });
    }

    if (socialMemorySystem?.recordConversationEvent) {
      socialMemorySystem.recordConversationEvent({
        type: 'PRE_CONVO',
        speakerId: playerId,
        listenerId: npc.id,
        topicPersonId: target?.id || null,
        data: {
          choiceId,
          resolvedMode: responseMode,
          intelPacket,
          deltas
        },
        phase: 'pre'
      });
    }

    this._updateLastTopics(npc.id, choiceId);
  }

  _resolveNpcResponseMode({ npcStyle, trustScore, npcParanoia, npcSuspicion, npcThreat, playerSuspicion, playerThreat, topicRisk, allowedModes }) {
    const baseWeights = {
      truth: 1,
      softTruth: 1.15,
      deflect: 1,
      counterQ: 0.9,
      misdirect: 0.85,
      reassure: 1,
      escalate: 0.6
    };

    const weights = {};
    const modes = allowedModes.length ? allowedModes : Object.keys(baseWeights);
    modes.forEach(mode => {
      weights[mode] = baseWeights[mode] || 0.8;
    });

    const pressure = (npcParanoia + npcSuspicion + npcThreat + playerSuspicion + playerThreat) / 5;
    if (trustScore >= 75) {
      weights.truth = (weights.truth || 0) + 0.8;
      weights.softTruth = (weights.softTruth || 0) + 0.5;
      weights.reassure = (weights.reassure || 0) + 0.4;
    }
    if (trustScore < 40 || pressure >= 60 || topicRisk >= 0.6) {
      weights.deflect = (weights.deflect || 0) + 0.6;
      weights.misdirect = (weights.misdirect || 0) + 0.5;
      weights.counterQ = (weights.counterQ || 0) + 0.4;
    }
    if (pressure >= 70) {
      weights.escalate = (weights.escalate || 0) + 0.4;
    }

    switch (npcStyle) {
      case 'competitive':
        weights.deflect += 0.5;
        weights.truth -= 0.2;
        break;
      case 'power':
        weights.counterQ += 0.5;
        weights.truth += 0.2;
        break;
      case 'social':
        weights.reassure += 0.6;
        weights.softTruth += 0.4;
        break;
      case 'shadow':
        weights.misdirect += 0.6;
        weights.counterQ += 0.4;
        break;
      case 'charmer':
        weights.reassure += 0.5;
        weights.counterQ += 0.2;
        break;
      case 'wildcard':
        weights.truth += Math.random() * 0.4;
        weights.escalate += Math.random() * 0.4;
        weights.misdirect += Math.random() * 0.4;
        break;
      default:
        break;
    }

    const normalized = Object.entries(weights)
      .filter(([mode]) => modes.includes(mode))
      .map(([mode, weight]) => ({ mode, weight: Math.max(0.05, weight) }));

    const total = normalized.reduce((sum, entry) => sum + entry.weight, 0);
    let roll = Math.random() * total;
    for (const entry of normalized) {
      roll -= entry.weight;
      if (roll <= 0) return entry.mode;
    }
    return normalized[0]?.mode || 'softTruth';
  }

  _buildNpcResponseLine({ npc, responseMode, choice, choiceId, intelText, targetName, npcStyle, stepIndex = 0, followupAction = null }) {
    const styleTag = npcStyle;
    const verb = this._pickNpcVerb(responseMode);
    const targetTag = targetName ? `${targetName}` : 'someone';
    const isPressed = stepIndex > 0 && followupAction === 'PRESS';

    // IMPORTANT: Only ONE spoken quote per NPC line.
    // Any extra flavor is narration (no quotes), otherwise the UI parser will treat it like multiple quotes.
    const styleFlair = {
      competitive: ['Their eyes keep drifting toward the challenge setup, like they’re already preparing.'],
      power: ['They speak like they’re mapping the vote, not just chatting.'],
      social: ['Their tone stays light, trying to keep camp calm.'],
      shadow: ['They lower their voice and glance around before finishing.'],
      charmer: ['They flash a quick smile that doesn’t give much away.'],
      wildcard: ['They laugh under their breath—like anything could flip.']
    };

    // Special-case: playful bonding (pizza / "glamorous Survivor") should never produce a robotic "read" line.
    const humorModeLines = {
      reassure: [
        'laughs. "If pizza shows up, I’m voting for it."',
        'grins. "Deal. Pizza is the real reward out here."',
        'smiles. "Now that’s a plan I can get behind."'
      ],
      softTruth: [
        'smiles. "Honestly, everyone’s just wet and cranky. We’ll be fine."',
        'chuckles. "It’s tense, but the joke helps—people are just tired."',
        'shrugs with a smile. "Early days. Nobody wants to show their cards yet."'
      ],
      deflect: [
        'cracks a quick grin, then looks away. "Let’s just get through today."',
        'forces a half-smile. "Yeah… we’ll see."'
      ]
    };

    const modeLines = {
      truth: [
        targetName ? `"About ${targetTag}? ${intelText || 'I’ll be straight with you.'}"` : `"Straight up—${intelText || 'it’s not locked, but the direction is showing.'}"`,
        `"Here’s what I’m seeing: ${intelText || 'people are connecting quietly'}."`,
        `"Real talk: ${intelText || 'names are floating more than people admit'}."`
      ],
      softTruth: [
        `"My read? ${intelText || 'it feels a little guarded'}."`,
        `"It’s ${intelText || 'still shifting—nothing’s set'}."`,
        targetName ? `"On ${targetTag}, ${intelText || 'I’m still reading it'}."` : `"There’s ${intelText || 'some tension, but it’s not open yet'}."`
      ],
      deflect: [
        '"Too early to lock that in. I’m just playing the day."',
        '"I’m not putting names on that right now."',
        '"Let’s see how today shakes out."'
      ],
      counterQ: [
        '"Why are you asking me that?"',
        '"What’s your angle here?"',
        '"You first—what are you hearing?"'
      ],
      misdirect: [
        targetName ? `"I’ve mostly heard ${targetTag} is fine."` : '"I haven’t heard anything solid."',
        '"I haven’t seen anything real, honestly."',
        targetName ? `"If anything, other names are louder than ${targetTag}."` : '"If anything, it feels like heat is landing elsewhere."'
      ],
      reassure: [
        '"We’re good. I’m not trying to make this messy."',
        '"We’re fine—just keep it clean."',
        `"I’m good with you. ${intelText || 'Let’s stay steady.'}"`
      ],
      escalate: [
        '"What’s with the interrogation?"',
        '"That’s a bold thing to ask."',
        '"You’re digging a little hard right now."'
      ]
    };

    const pressedLines = {
      truth: [
        `"Alright. ${intelText || 'Here’s what I actually think.'}"`,
        `"Okay. ${intelText || 'I’ll give you something real.'}"`,
        `"Look. ${intelText || 'That’s the straight answer.'}"`
      ],
      softTruth: [
        '"Look… I don’t know for sure. It’s just a feel right now."',
        '"I’m not locked. It’s just a vibe."',
        '"That’s all I’ve got. It’s still fuzzy."'
      ],
      deflect: [
        '"I already said what I can."',
        '"I’m not putting more on that."',
        '"That’s as far as I’m going."'
      ],
      counterQ: [
        '"Why are you pushing this so hard? That’s weird."',
        '"What’s with the pressure all of a sudden?"',
        '"Why do you need names right now?"'
      ],
      misdirect: [
        '"If you’re digging, look somewhere else."',
        '"I’m hearing it’s someone other than who you’re thinking."',
        '"That heat isn’t even real from what I saw."'
      ],
      reassure: [
        '"It’s fine. No need to turn it into a thing."',
        '"Relax. I’m not trying to make it messy."'
      ],
      escalate: [
        '"Back off. You’re pushing too hard."',
        '"That’s not cool. Ease up."'
      ]
    };

    const isHumor = choiceId === 'BC4' || (Array.isArray(choice?.tones) && choice.tones.includes('playful'));

    const baseLines = isHumor && humorModeLines[responseMode]
      ? humorModeLines[responseMode]
      : (modeLines[responseMode] || modeLines.softTruth);

    const pool = isPressed && pressedLines[responseMode] ? pressedLines[responseMode] : baseLines;
    const line = this._pickFromArray(pool);

    const flair = this._pickFromArray(styleFlair[styleTag] || []);
    const combined = flair ? `${line} ${flair}` : line;

    return this._npcDoes(npc, verb.singular, verb.plural, combined);
  }

  _formatPreChallengeOutcome(template, { target, intel, deltas, riskLine, responseMode }) {
    const formatDelta = (value) => `${value >= 0 ? '+' : ''}${value || 0}`;
    const safeIntel = intel || 'a cautious read';
    const trustDelta = formatDelta(deltas.trustDelta || 0);
    const relDelta = formatDelta(deltas.relationshipDelta || 0);
    const reliaDelta = formatDelta(deltas.reliabilityDelta || 0);
    const repDeltaStrategic = formatDelta(deltas.repStrategicDelta || 0);
    const repDeltaHelpful = formatDelta(deltas.repHelpfulDelta || 0);
    const suspDelta = formatDelta(deltas.speakerSuspicionDelta || 0);
    const toneRead = responseMode === 'reassure' ? 'they signaled calm' : responseMode === 'deflect' ? 'they shut it down' : 'they gave a measured read';
    const baseRisk = riskLine || 'steady';
    const targetName = target?.firstName || 'them';

    return template
      .replace('{relDelta}', relDelta)
      .replace('{trustDelta}', trustDelta)
      .replace('{reliaDelta}', reliaDelta)
      .replace('{repDeltaStrategic}', repDeltaStrategic)
      .replace('{repDeltaHelpful}', repDeltaHelpful)
      .replace('{campVibeIntel}', safeIntel)
      .replace('{behaviorIntel}', safeIntel)
      .replace('{comfortIntel}', safeIntel)
      .replace('{safetyIntel}', safeIntel)
      .replace('{allyIntel}', safeIntel)
      .replace('{standingIntel}', safeIntel)
      .replace('{readIntel}', safeIntel)
      .replace('{targetReadIntel}', safeIntel)
      .replace('{rumorIntel}', safeIntel)
      .replace('{loyaltyIntel}', safeIntel)
      .replace('{reactionIntel}', safeIntel)
      .replace('{stateIntel}', safeIntel)
      .replace('{moraleIntel}', safeIntel)
      .replace('{grievanceIntel}', safeIntel)
      .replace('{motiveIntel}', safeIntel)
      .replace('{weirdIntel}', safeIntel)
      .replace('{idolIntel}', safeIntel)
      .replace('{perceptionIntel}', safeIntel)
      .replace('{voteTypeIntel}', safeIntel)
      .replace('{challengeIntel}', safeIntel)
      .replace('{numbersIntel}', safeIntel)
      .replace('{resultIntel}', safeIntel)
      .replace('{tensionIntel}', safeIntel)
      .replace('{repairResult}', safeIntel)
      .replace('{toneRead}', toneRead)
      .replace('{riskLineOptional}', baseRisk)
      .replace('{riskLine}', baseRisk)
      .replace('{suspDelta}', suspDelta)
      .replace('{intelVibe}', safeIntel)
      .replace('{intelIfDeclined}', responseMode === 'deflect' || responseMode === 'counterQ' ? 'They brushed off the task invite' : 'They stayed open to teaming up')
      .replace('{TARGET}', targetName);
  }

  _buildRiskLine(choiceId, { deltas }) {
    if (deltas.speakerSuspicionDelta >= 3) return 'major suspicion spike';
    if (deltas.speakerSuspicionDelta >= 2) return 'probing raised suspicion';
    if (deltas.speakerSuspicionDelta >= 1) return 'you looked a little curious';
    if (choiceId.startsWith('IR') || choiceId.startsWith('ST')) return 'low-level risk';
    return 'steady';
  }

  _getTrustScore(npc, player) {
    return Math.round(this.gameManager.getTrust?.(player?.id, npc?.id) ?? 50);
  }

  _getNpcStyleKey(style) {
    const normalized = (style || '').toLowerCase();
    if (normalized.includes('competitive')) return 'competitive';
    if (normalized.includes('power')) return 'power';
    if (normalized.includes('social')) return 'social';
    if (normalized.includes('shadow')) return 'shadow';
    if (normalized.includes('charmer')) return 'charmer';
    if (normalized.includes('wild')) return 'wildcard';
    return 'neutral';
  }

  _pickNpcVerb(mode) {
    const verbMap = {
      truth: ['nods', 'nod'],
      softTruth: ['shrugs', 'shrug'],
      deflect: ['shakes', 'shake'],
      counterQ: ['tilts', 'tilt'],
      misdirect: ['lowers', 'lower'],
      reassure: ['softens', 'soften'],
      escalate: ['narrows', 'narrow']
    };
    const [singular, plural] = verbMap[mode] || ['shrugs', 'shrug'];
    return { singular, plural };
  }

  _pickFromArray(list) {
    if (!Array.isArray(list) || list.length === 0) return '';
    return list[getRandomInt(0, list.length - 1)];
  }

  _clampMetric(value) {
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.min(100, value));
  }

  _updatePlayerReputation(deltas = {}) {
    if (!this.gameManager.playerReputation) {
      this.gameManager.playerReputation = { strategic: 0, paranoid: 0, fake: 0, helpful: 0 };
    }
    const rep = this.gameManager.playerReputation;
    rep.strategic = this._clampMetric(rep.strategic + (deltas.strategic || 0));
    rep.paranoid = this._clampMetric(rep.paranoid + (deltas.paranoid || 0));
    rep.fake = this._clampMetric(rep.fake + (deltas.fake || 0));
    rep.helpful = this._clampMetric(rep.helpful + (deltas.helpful || 0));
  }

  _isChoiceSpammy(npcId, choiceId) {
    const socialMemorySystem = this.gameManager.systems?.socialMemorySystem;
    const memory = socialMemorySystem?.memory?.[npcId];
    if (!memory?.lastTopics) return false;
    const recent = memory.lastTopics.slice(-3);
    return recent.filter(entry => entry?.choiceId === choiceId).length >= 1;
  }

  _isCategoryRepeated(npcId, categoryId) {
    const socialMemorySystem = this.gameManager.systems?.socialMemorySystem;
    const memory = socialMemorySystem?.memory?.[npcId];
    if (!memory?.lastTopics) return false;
    const recent = memory.lastTopics.slice(-2);
    return recent.some(entry => entry?.categoryId === categoryId);
  }

  _updateLastTopics(npcId, choiceId) {
    const socialMemorySystem = this.gameManager.systems?.socialMemorySystem;
    if (!socialMemorySystem?.initNPC) return;
    socialMemorySystem.initNPC(npcId);
    const memory = socialMemorySystem.memory[npcId];
    const category = PRE_CHALLENGE_TREE.categories.find(cat => cat.choices.some(choice => choice.id === choiceId));
    memory.lastTopics = memory.lastTopics || [];
    memory.lastTopics.push({
      choiceId,
      categoryId: category?.id || null,
      at: Date.now()
    });
    if (memory.lastTopics.length > 8) {
      memory.lastTopics.splice(0, memory.lastTopics.length - 8);
    }
  }

  _showApproachMenu(survivor, location, { title = 'How do you want to approach this?', onSelect, onBack } = {}) {
    this._clearOverlay();
    const overlay = this._buildOverlayShell(survivor, { reuse: true });
    const content = this._getConversationContent(overlay);
    this._clearConversationContent(content);
    const parchment = this._buildParchment(title);
    const options = [
      { key: STRATEGY_APPROACHES.TRUTHFUL, label: 'Truthful' },
      { key: STRATEGY_APPROACHES.PERSUASIVE, label: 'Persuasive' },
      { key: STRATEGY_APPROACHES.NEGOTIATE, label: 'Negotiate' },
      { key: STRATEGY_APPROACHES.DEAL_MAKING, label: 'Deal-Making' },
      { key: STRATEGY_APPROACHES.MANIPULATE, label: 'Manipulate' },
      { key: STRATEGY_APPROACHES.LIE, label: 'Lie' },
      { key: STRATEGY_APPROACHES.PRESSURE, label: 'Apply Pressure' }
    ];

    console.log('CONVERSATION APPROACH MENU', { npc: survivor?.firstName || survivor?.id, location, options: options.map(opt => opt.key) });
    if (typeof window !== 'undefined' && typeof window.debugBanner === 'function') {
      window.debugBanner('Approach menu', `${survivor?.firstName || 'NPC'} | ${location || 'camp'}`);
    }

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

    options.forEach(option => {
      const btn = this._createChoiceButton({
        label: option.label,
        onClick: () => {
          this._clearOverlay();
          if (typeof onSelect === 'function') onSelect(option.key);
        },
        fallback: { npc: survivor }
      });
      buttonColumn.appendChild(btn);
    });

    const backBtn = this._createChoiceButton({
      label: 'Back',
      alt: true,
      onClick: () => {
        this._clearOverlay();
        if (typeof onBack === 'function') onBack();
      },
      fallback: { npc: survivor }
    });

    buttonColumn.appendChild(backBtn);
    parchment.appendChild(buttonColumn);
    content.appendChild(parchment);
  }

  promptSurvivorPicker({
    title,
    survivors = null,
    tribeOnly = true,
    excludeIds = [],
    onConfirmLabel = 'Confirm',
    extraOptions = []
  } = {}) {
    return new Promise(resolve => {
      const overlay = this._buildOverlayShell({ firstName: 'Choose' }, { reuse: true });
      const content = this._getConversationContent(overlay);
      this._clearConversationContent(content);
      const parchment = this._buildParchment(title || 'Pick a survivor');

      const tribe = this.gameManager.getPlayerTribe?.();
      const pool = survivors || (tribeOnly ? (tribe?.members || []) : (this.gameManager.survivors || []));
      const filtered = pool.filter(s => !excludeIds.includes(s.id) && !s.isPlayer);

      const grid = createElement('div', {
        style: {
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))',
          gap: '10px',
          marginTop: '10px',
          maxHeight: '42vh',
          overflowY: 'auto',
          width: '100%'
        }
      });

      let selectedId = null;
      const setSelected = (card, id) => {
        selectedId = id;
        const cards = Array.from(grid.querySelectorAll('[data-picker-card="true"]'));
        cards.forEach(el => {
          el.style.outline = el.dataset.survivorId === String(id) ? '3px solid #e6b676' : '2px solid rgba(0,0,0,0.25)';
        });
        confirmBtn.disabled = !selectedId;
      };

      const pickerFallback = {
        session: this.nodeSession || this.conversationSession || null,
        npc: this.state?.npcId ? this._getSurvivorById(this.state.npcId) : null
      };

      filtered.forEach(target => {
        const card = createElement('button', {
          className: 'rect-button full',
          style: {
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            alignItems: 'center',
            padding: '10px',
            outline: '2px solid rgba(0,0,0,0.25)'
          }
        });
        card.dataset.pickerCard = 'true';
        card.dataset.survivorId = String(target.id);
        card.onclick = this._safeClick(() => setSelected(card, target.id), pickerFallback);

        const avatar = createElement('img', {
          src: target.avatarUrl,
          alt: target.firstName,
          style: {
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            objectFit: 'cover',
            border: `2px solid ${target.tribeColor || target.tribe?.tribeColor || '#d0b07b'}`
          }
        });
        const name = createElement('div', {
          style: { fontFamily: 'Survivant, sans-serif', fontSize: '0.95rem' }
        }, target.firstName);
        card.appendChild(avatar);
        card.appendChild(name);
        grid.appendChild(card);
      });

      if (!filtered.length) {
        const empty = createElement('div', { style: { marginTop: '8px' } }, 'No valid targets right now.');
        grid.appendChild(empty);
      }

      const buttonRow = createElement('div', {
        style: {
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          marginTop: '12px',
          width: '100%'
        }
      });

      const confirmBtn = this._createChoiceButton({
        label: onConfirmLabel || 'Confirm',
        onClick: () => {
          this._clearOverlay();
          resolve(selectedId);
        }
      });
      confirmBtn.disabled = true;

      const cancelBtn = this._createChoiceButton({
        label: 'Cancel',
        alt: true,
        onClick: () => {
          this._clearOverlay();
          resolve(null);
        }
      });

      buttonRow.appendChild(confirmBtn);
      buttonRow.appendChild(cancelBtn);

      if (Array.isArray(extraOptions) && extraOptions.length) {
        extraOptions.forEach(option => {
          const extraBtn = this._createChoiceButton({
            label: option.label,
            alt: true,
            onClick: () => {
              this._clearOverlay();
              resolve(null);
              if (option.onSelect) option.onSelect();
            }
          });
          buttonRow.appendChild(extraBtn);
        });
      }

      parchment.appendChild(grid);
      parchment.appendChild(buttonRow);
      content.appendChild(parchment);
    });
  }

  _showSpecificTopicMenu(survivor, location, target, { phase = null, returnCategory = 'exchange' } = {}) {
    this._clearOverlay();
    const overlay = this._buildOverlayShell(survivor, { reuse: true });
    const content = this._getConversationContent(overlay);
    this._clearConversationContent(content);
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
      const btn = this._createChoiceButton({
        label,
        onClick: () => {
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
        },
        fallback: { npc: survivor }
      });
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
      onChangeTopic: () => this._showTopicSelection(survivor, location),
      session: this.nodeSession || this.conversationSession
    });
    parchment.appendChild(optionColumn);
    content.appendChild(parchment);
  }

  _showChallengePerformanceMenu(survivor, location, { phase = null } = {}) {
    this._clearOverlay();
    const overlay = this._buildOverlayShell(survivor, { reuse: true });
    const content = this._getConversationContent(overlay);
    this._clearConversationContent(content);
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
      const btn = this._createChoiceButton({
        label,
        onClick: () => {
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
        },
        fallback: { npc: survivor }
      });
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
      onChangeTopic: () => this._showTopicSelection(survivor, location),
      session: this.nodeSession || this.conversationSession
    });

    parchment.appendChild(optionColumn);
    content.appendChild(parchment);
  }

  _showDeflectMenu(survivor, location, { phase = null } = {}) {
    const excludeIds = [survivor.id, this.gameManager.getPlayerSurvivor?.()?.id];
    this.promptSurvivorPicker({
      title: 'Whose name is coming up?',
      tribeOnly: true,
      excludeIds
    }).then(primaryId => {
      if (!primaryId) {
        this._showCategoryMenu(survivor, location, 'deflect');
        return;
      }
      const primary = this._getSurvivorById(primaryId);
      if (!primary) {
        this._showCategoryMenu(survivor, location, 'deflect');
        return;
      }
      this.promptSurvivorPicker({
        title: 'Who do you want to pivot toward?',
        tribeOnly: true,
        excludeIds: [...excludeIds, primary.id]
      }).then(alternateId => {
        if (!alternateId) {
          this._showCategoryMenu(survivor, location, 'deflect');
          return;
        }
        const alternate = this._getSurvivorById(alternateId);
        if (!alternate) {
          this._showCategoryMenu(survivor, location, 'deflect');
          return;
        }
        this._showApproachMenu(survivor, location, {
          title: 'How do you want to approach this?',
          onSelect: (approach) => {
            this._startConversation(survivor, {
              intentOverride: POST_PHASE_INTENTS.deflect_target,
              location,
              context: {
                topicPerson: primary.firstName,
                topicId: primary.id,
                alternateName: alternate.firstName,
                alternateId: alternate.id,
                phase: phase || this._getConversationPhase(),
                initiator: 'player',
                approach
              }
            });
          },
          onBack: () => this._showCategoryMenu(survivor, location, 'deflect')
        });
      });
    });
  }

  _showVerifyStoryMenu(survivor, location, { phase = null } = {}) {
    const excludeIds = [survivor.id, this.gameManager.getPlayerSurvivor?.()?.id];
    this.promptSurvivorPicker({
      title: 'Verify a story about who?',
      tribeOnly: true,
      excludeIds
    }).then(selectedId => {
      if (!selectedId) {
        this._showCategoryMenu(survivor, location, 'verify');
        return;
      }
      const pick = this._getSurvivorById(selectedId);
      if (!pick) {
        this._showCategoryMenu(survivor, location, 'verify');
        return;
      }
      this._showApproachMenu(survivor, location, {
        title: 'How do you want to approach this?',
        onSelect: (approach) => {
          this._startConversation(survivor, {
            intentOverride: POST_PHASE_INTENTS.verify_story,
            location,
            context: {
              topicPerson: pick.firstName,
              topicId: pick.id,
              phase: phase || this._getConversationPhase(),
              initiator: 'player',
              approach
            }
          });
        },
        onBack: () => this._showCategoryMenu(survivor, location, 'verify')
      });
    });
  }

  _showChallengeDebriefMenu(survivor, location, { phase = null } = {}) {
    this._clearOverlay();
    const overlay = this._buildOverlayShell(survivor, { reuse: true });
    const content = this._getConversationContent(overlay);
    this._clearConversationContent(content);
    const parchment = this._buildParchment('Challenge debrief');
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

    const playerTribe = this.gameManager.getPlayerTribe?.();
    const tribeKey = playerTribe?.id || playerTribe?.tribeName || playerTribe?.name || null;
    const dayValue = this.gameManager.getCurrentDay?.() || this.gameManager.day || 1;
    const standouts = challengeManager.getStageStandoutsForTribe?.(tribeKey, dayValue) || { mvps: [], lvps: [] };
    const mvps = Array.isArray(standouts.mvps) ? standouts.mvps : [];
    const lvps = Array.isArray(standouts.lvps) ? standouts.lvps : [];

    console.log('CHALLENGE DEBRIEF: mvps=', mvps, 'lvps=', lvps);
    if (typeof window !== 'undefined' && typeof window.debugBanner === 'function') {
      window.debugBanner('Challenge debrief', `mvps:${mvps.length} lvps:${lvps.length}`);
    }

    const addOption = (label, handler) => {
      const btn = this._createChoiceButton({
        label,
        onClick: handler,
        fallback: { npc: survivor }
      });
      optionColumn.appendChild(btn);
    };

    const logChoice = (action, targetName) => {
      console.log(`PLAYER CHOICE: ${action} target=${targetName || 'none'}`);
    };

    const startDebrief = ({ action, target }) => {
      logChoice(action, target?.name);
      const launch = (approach) => {
        this._startConversation(survivor, {
          intentOverride: POST_PHASE_INTENTS.challenge_debrief,
          location,
          context: {
            debriefAction: action,
            topicPerson: target?.name || null,
            topicId: target?.id || null,
            phase: phase || this._getConversationPhase(),
            initiator: 'player',
            approach
          }
        });
      };
      if (action === 'neutral') {
        launch(STRATEGY_APPROACHES.TRUTHFUL);
        return;
      }
      this._showApproachMenu(survivor, location, {
        title: 'How do you want to approach this?',
        onSelect: launch,
        onBack: () => this._showChallengeDebriefMenu(survivor, location, { phase })
      });
    };

    const addActionOption = (label, action, target) => {
      const btn = this._createChoiceButton({
        label,
        onClick: () => startDebrief({ action, target }),
        fallback: { npc: survivor }
      });
      optionColumn.appendChild(btn);
    };

    lvps.forEach(lvp => {
      addActionOption(`Blame ${lvp.name}`, 'blame', lvp);
      addActionOption(`Defend ${lvp.name}`, 'defend', lvp);
    });

    mvps.forEach(mvp => {
      addActionOption(`Praise ${mvp.name}`, 'praise', mvp);
      addActionOption(`Call ${mvp.name} a threat`, 'threat', mvp);
    });

    addOption('Who cost us?', () => this.promptSurvivorPicker({
      title: 'Who cost the loss?',
      tribeOnly: true,
      excludeIds: [survivor.id, this.gameManager.getPlayerSurvivor?.()?.id]
    }).then(selectedId => {
      if (!selectedId) {
        this._showChallengeDebriefMenu(survivor, location, { phase });
        return;
      }
      const pick = this._getSurvivorById(selectedId);
      if (!pick) {
        this._showChallengeDebriefMenu(survivor, location, { phase });
        return;
      }
      startDebrief({ action: 'debate', target: { id: pick.id, name: pick.firstName } });
    }));
    addActionOption('Unity talk', 'neutral', null);

    if (!mvps.length && !lvps.length) {
      addActionOption('Talk about the loss', 'neutral', null);
    }

    this._appendNavButtonsToColumn(optionColumn, {
      canBack: true,
      canChangeTopic: true,
      onBack: () => this._showTopicSelection(survivor, location),
      onChangeTopic: () => this._showTopicSelection(survivor, location),
      session: this.nodeSession || this.conversationSession
    });

    parchment.appendChild(optionColumn);
    content.appendChild(parchment);
  }

  _showIdolTalkMenu(survivor, location, { phase = null } = {}) {
    this._clearOverlay();
    const overlay = this._buildOverlayShell(survivor, { reuse: true });
    const content = this._getConversationContent(overlay);
    this._clearConversationContent(content);
    const parchment = this._buildParchment('Idol talk');
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
      const btn = this._createChoiceButton({
        label,
        onClick: handler,
        fallback: { npc: survivor }
      });
      optionColumn.appendChild(btn);
    };

    const askWithApproach = (intentOverride) => {
      this._showApproachMenu(survivor, location, {
        title: 'How do you want to approach this?',
        onSelect: (approach) => {
          this._startConversation(survivor, {
            intentOverride,
            location,
            context: { phase: phase || this._getConversationPhase(), initiator: 'player', approach }
          });
        },
        onBack: () => this._showIdolTalkMenu(survivor, location, { phase })
      });
    };

    addOption('Idol found?', () => askWithApproach(POST_PHASE_INTENTS.idol_ask_found));
    addOption('Who has an idol?', () => askWithApproach(POST_PHASE_INTENTS.idol_ask_who_has));
    addOption('Where did you look?', () => askWithApproach(POST_PHASE_INTENTS.idol_ask_looked_where));

    addOption('Claim you have one', () => {
      const player = this.gameManager.getPlayerSurvivor?.();
      const playerHasIdol = this._survivorHasIdol(player?.id);
      this._startConversation(survivor, {
        intentOverride: playerHasIdol ? POST_PHASE_INTENTS.idol_claim_have_truth : POST_PHASE_INTENTS.idol_claim_have_lie,
        location,
        context: {
          phase: phase || this._getConversationPhase(),
          initiator: 'player',
          approach: playerHasIdol ? STRATEGY_APPROACHES.TRUTHFUL : STRATEGY_APPROACHES.LIE,
          idolClaimTruth: playerHasIdol
        }
      });
    });

    addOption('Bluff an idol', () => {
      this._startConversation(survivor, {
        intentOverride: POST_PHASE_INTENTS.idol_claim_have_lie,
        location,
        context: {
          phase: phase || this._getConversationPhase(),
          initiator: 'player',
          approach: STRATEGY_APPROACHES.LIE,
          forcedBluff: true
        }
      });
    });

    addOption('Plant idol rumor', () => this.promptSurvivorPicker({
      title: 'Plant a rumor about who?',
      tribeOnly: true,
      excludeIds: [survivor.id, this.gameManager.getPlayerSurvivor?.()?.id]
    }).then(selectedId => {
      if (!selectedId) {
        this._showIdolTalkMenu(survivor, location, { phase });
        return;
      }
      const pick = this._getSurvivorById(selectedId);
      if (!pick) {
        this._showIdolTalkMenu(survivor, location, { phase });
        return;
      }
      this._startConversation(survivor, {
        intentOverride: POST_PHASE_INTENTS.idol_claim_other_has_lie,
        location,
        context: {
          phase: phase || this._getConversationPhase(),
          initiator: 'player',
          approach: STRATEGY_APPROACHES.LIE,
          topicPerson: pick.firstName,
          topicId: pick.id
        }
      });
    }));

    addOption('Pressure for info', () => {
      this._startConversation(survivor, {
        intentOverride: POST_PHASE_INTENTS.idol_pressure_for_info,
        location,
        context: {
          phase: phase || this._getConversationPhase(),
          initiator: 'player',
          approach: STRATEGY_APPROACHES.PRESSURE
        }
      });
    });

    this._appendNavButtonsToColumn(optionColumn, {
      canBack: true,
      canChangeTopic: true,
      onBack: () => this._showTopicSelection(survivor, location),
      onChangeTopic: () => this._showTopicSelection(survivor, location),
      session: this.nodeSession || this.conversationSession
    });

    parchment.appendChild(optionColumn);
    content.appendChild(parchment);
  }

  _showSplitVoteMenu(survivor, location, { phase = null } = {}) {
    const excludeIds = [survivor.id, this.gameManager.getPlayerSurvivor?.()?.id];
    this.promptSurvivorPicker({
      title: 'Primary split vote target?',
      tribeOnly: true,
      excludeIds
    }).then(primaryId => {
      if (!primaryId) {
        this._showCategoryMenu(survivor, location, 'splitVote');
        return;
      }
      const primary = this._getSurvivorById(primaryId);
      if (!primary) {
        this._showCategoryMenu(survivor, location, 'splitVote');
        return;
      }
      this.promptSurvivorPicker({
        title: 'Secondary split vote target?',
        tribeOnly: true,
        excludeIds: [...excludeIds, primary.id]
      }).then(secondaryId => {
        if (!secondaryId) {
          this._showCategoryMenu(survivor, location, 'splitVote');
          return;
        }
        const secondary = this._getSurvivorById(secondaryId);
        if (!secondary) {
          this._showCategoryMenu(survivor, location, 'splitVote');
          return;
        }
        this._showApproachMenu(survivor, location, {
          title: 'How do you want to approach this?',
          onSelect: (approach) => {
            const dealTopic = `splitting votes between ${primary.firstName} and ${secondary.firstName}`;
            this._startConversation(survivor, {
              intentOverride: POST_PHASE_INTENTS.offer_split_vote,
              location,
              context: {
                phase: phase || this._getConversationPhase(),
                initiator: 'player',
                approach,
                dealType: 'splitVote',
                dealTopic,
                splitTargets: [primary.firstName, secondary.firstName],
                splitTargetIds: [primary.id, secondary.id],
                topicPerson: primary.firstName,
                topicId: primary.id
              }
            });
          },
          onBack: () => this._showCategoryMenu(survivor, location, 'splitVote')
        });
      });
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
    const overlay = this._buildOverlayShell(survivor, { reuse: true });
    const content = this._getConversationContent(overlay);
    this._clearConversationContent(content);
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
      const btn = this._createChoiceButton({
        label: target.firstName,
        onClick: () => {
          this._clearOverlay();
          this._startConversation(survivor, {
            intentOverride: 'gossip',
            isPurpose: false,
            location,
            context: { topicPerson: target.firstName, phase }
          });
        },
        fallback: { npc: survivor }
      });
      buttonColumn.appendChild(btn);
    });

    const closeBtn = this._createChoiceButton({
      label: 'Cancel',
      alt: true,
      onClick: () => this._clearOverlay(),
      fallback: { npc: survivor }
    });

    buttonColumn.appendChild(closeBtn);
    parchment.appendChild(buttonColumn);
    content.appendChild(parchment);
  }

  _showDealMenu(survivor, location) {
    const overlay = this._buildOverlayShell(survivor, { reuse: true });
    const content = this._getConversationContent(overlay);
    this._clearConversationContent(content);
    const parchment = this._buildParchment('What kind of deal do you offer?');
    const player = this.gameManager.getPlayerSurvivor?.();
    const phase = this._getConversationPhase();

    const options = [
      { key: 'voteTogether', label: 'Vote together' },
      { key: 'info', label: 'Trade info' },
      { key: 'mutualProtection', label: 'Mutual protection' },
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
      const btn = this._createChoiceButton({
        label: opt.label,
        onClick: () => {
          this._clearOverlay();
          if (opt.key === 'voteTogether') {
            const excludeIds = [survivor.id];
            if (player?.id) excludeIds.push(player.id);
            this.promptSurvivorPicker({
              title: 'Vote together on who?',
              tribeOnly: true,
              excludeIds
            }).then(selectedId => {
              if (!selectedId) {
                this._showDealMenu(survivor, location);
                return;
              }
              const pick = this._getSurvivorById(selectedId);
              if (!pick) {
                this._showDealMenu(survivor, location);
                return;
              }
              this._showApproachMenu(survivor, location, {
                title: 'How do you want to approach this?',
                onSelect: (approach) => {
                  const dealContext = this._buildDealContext('voteTogether', survivor, null, pick.firstName);
                  this._startConversation(survivor, {
                    intentOverride: POST_PHASE_INTENTS.offer_deal_vote_together,
                    isPurpose: false,
                    location,
                    context: { ...dealContext, phase, approach }
                  });
                },
                onBack: () => this._showDealMenu(survivor, location)
              });
            });
            return;
          }

          this._showApproachMenu(survivor, location, {
            title: 'How do you want to approach this?',
            onSelect: (approach) => {
              const dealContext = this._buildDealContext(opt.key, survivor);
              this._startConversation(survivor, {
                intentOverride: opt.key === 'info'
                  ? POST_PHASE_INTENTS.offer_deal_share_info
                  : opt.key === 'final2'
                    ? POST_PHASE_INTENTS.offer_deal_final2
                    : POST_PHASE_INTENTS.offer_deal_protect,
                isPurpose: false,
                location,
                context: { ...dealContext, phase, approach }
              });
            },
            onBack: () => this._showDealMenu(survivor, location)
          });
        },
        fallback: { npc: survivor }
      });
      buttonColumn.appendChild(btn);
    });

    this._appendNavButtonsToColumn(buttonColumn, {
      canBack: true,
      canChangeTopic: true,
      onBack: () => this._showCategoryMenu(survivor, location, 'deal'),
      onChangeTopic: () => this._showTopicSelection(survivor, location),
      session: this.nodeSession || this.conversationSession
    });
    parchment.appendChild(buttonColumn);
    content.appendChild(parchment);
  }

  _promptRecruitSelection(survivor, location) {
    const overlay = this._buildOverlayShell(survivor, { reuse: true });
    const content = this._getConversationContent(overlay);
    this._clearConversationContent(content);
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
      const btn = this._createChoiceButton({
        label: target.firstName,
        onClick: () => {
          this._clearOverlay();
          const dealContext = this._buildDealContext('recruit', survivor, target.firstName);
          this._startConversation(survivor, {
            intentOverride: 'deal',
            isPurpose: false,
            location,
            context: { ...dealContext, phase }
          });
        },
        fallback: { npc: survivor }
      });
      buttonColumn.appendChild(btn);
    });

    const cancel = this._createChoiceButton({
      label: 'Cancel',
      alt: true,
      onClick: () => this._clearOverlay(),
      fallback: { npc: survivor }
    });

    buttonColumn.appendChild(cancel);
    parchment.appendChild(buttonColumn);
    content.appendChild(parchment);
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
      case 'splitVote':
        return {
          dealType: 'splitVote',
          dealTopic: 'splitting votes between two targets',
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
    if (this.gameManager.flags?.campEventActive) return;
    this._highlightNpcIcon(survivor.id, true);
    const overlay = this._buildOverlayShell(survivor, { reuse: true });
    const content = this._getConversationContent(overlay);
    this._clearConversationContent(content);
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

    const talkBtn = this._createChoiceButton({
      label: 'Talk now',
      onClick: accept,
      fallback: { npc: survivor }
    });

    const dismissBtn = this._createChoiceButton({
      label: 'Maybe later',
      alt: true,
      onClick: () => this._handleApproachDeclined(survivor),
      fallback: { npc: survivor }
    });

    buttons.appendChild(talkBtn);
    buttons.appendChild(dismissBtn);
    parchment.appendChild(buttons);
    content.appendChild(parchment);

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
    const conversationContext = this._normalizeConversationContext({ ...context, initiator, isPurpose, meeting, location, phase });
    const forceNodeFlow = Boolean(context.forceNodeFlow || initiator === 'player');

    if (this._isInCamp() && !conversationContext.forceLegacyConversation) {
      this.activeConversationContext = conversationContext;
      this._showTopicSelection(survivor, location);
      return;
    }

    if (this._isDeterministicIntent(intent)) {
      if (forceNodeFlow) {
        this._startDeterministicNodeConversation(survivor, intent, conversationContext);
        return;
      }
      this._startDeterministicConversation(survivor, intent, conversationContext);
      return;
    }

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
        excludeIds: exclude
      }).then(selectedId => {
        if (!selectedId) {
          this._showTopicSelection(survivor, location);
          return;
        }
        const pick = this._getSurvivorById(selectedId);
        if (!pick) {
          this._showTopicSelection(survivor, location);
          return;
        }
        this._startConversation(survivor, {
          intentOverride: 'hardStrategy',
          isPurpose,
          meeting,
          location,
          context: { ...conversationContext, topicPerson: pick.firstName, stance: 'push' }
        });
      });
      return;
    }

    this._startNodeConversation(survivor, {
      intent,
      dialogue,
      meeting,
      context: {
        ...conversationContext,
        topicPersonName: dialogue.context?.topicPersonName || dialogue.context?.topicPerson || conversationContext.topicPersonName || conversationContext.topicPerson || null,
        topicPersonId: dialogue.context?.topicPersonId || dialogue.context?.topicId || conversationContext.topicPersonId || conversationContext.topicId || null,
        playerNamedAllyName: dialogue.context?.playerNamedAllyName || conversationContext.playerNamedAllyName || null,
        npcTrustedPersonName: dialogue.context?.npcTrustedPersonName || conversationContext.npcTrustedPersonName || null,
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

    this.activeConversationContext = this._normalizeConversationContext(context);

    const rootChoices = (dialogue.responses || []).map((option, index) => ({
      id: `root-choice-${index}`,
      label: option.label,
      playerLine: option.playerLine || option.label,
      responseOption: option
    }));

    const rootNodeId = this._registerNode(session, {
      id: 'root',
      playerNarration: dialogue.playerNarration || dialogue.playerLine || null,
      npcResponse: dialogue.npcResponse || dialogue.npcLine || null,
      text: null,
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

    this.activeConversationContext = this._normalizeConversationContext({ ...context });
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

  _isDeterministicIntent(intent) {
    return Object.values(DETERMINISTIC_INTENTS).includes(intent);
  }

  _startDeterministicConversation(survivor, intent, context = {}) {
    const nodes = this._buildDeterministicNodes(survivor, context);
    const rootNodeId = nodes.root?.id || 'root';
    this.activeConversation = {
      npcId: survivor.id,
      nodeId: rootNodeId,
      context: { ...context },
      history: [],
      nodes
    };
    this.activeConversationContext = this._normalizeConversationContext(context);

    this._applyDeterministicIntent(intent, { nextNodeId: rootNodeId, initiator: context.initiator });
    this._renderActiveConversation();
  }

  _startDeterministicNodeConversation(survivor, intent, context = {}) {
    const player = this.gameManager.getPlayerSurvivor?.();
    const session = this._initNodeSession({
      npcId: survivor.id,
      playerId: player?.id || null,
      intent,
      meeting: context.meeting || null,
      context: { ...context }
    });

    this.activeConversationContext = this._normalizeConversationContext({ ...context });
    this.nodeSession = session;

    const response = this._generateDeterministicResponse(intent, session.context, {
      npc: survivor,
      player,
      history: session.history
    });
    const exchange = this.formatExchange({
      narration: response.narration,
      npcDoes: response.npcDoes,
      npcSays: response.npcSays,
      npc: survivor,
      intent
    });

    session.history.push({
      nodeId: 'root',
      intent,
      resultSummary: response.summary || null
    });

    const rootNodeId = this._registerNode(session, {
      id: 'root',
      playerNarration: exchange.playerNarration,
      npcResponse: exchange.npcResponse,
      choices: this._buildDefaultFollowupChoices(intent, session.context),
      meta: { speaker: 'npc' }
    });
    session.rootNodeId = rootNodeId;
    this._renderNode(session, rootNodeId);
    if (context.meeting) {
      this._highlightNpcIcon(context.meeting.npcId, false);
    } else {
      this._highlightNpcIcon(survivor.id, false);
    }
  }

  _buildDeterministicNodes(survivor, context = {}) {
    const rootChoices = [
      {
        label: 'What are you hearing?',
        intent: DETERMINISTIC_INTENTS.INTEL_HEARING_NAMES,
        nextNodeId: 'root'
      },
      {
        label: 'Who seems close?',
        intent: DETERMINISTIC_INTENTS.INTEL_WHO_SEEMS_CLOSE,
        nextNodeId: 'root'
      },
      {
        label: 'How do you feel about me?',
        intent: DETERMINISTIC_INTENTS.SOCIAL_HOW_DO_YOU_FEEL_ABOUT_ME,
        nextNodeId: 'root'
      },
      {
        label: 'Are you feeling safe today?',
        intent: DETERMINISTIC_INTENTS.SAFETY_ARE_YOU_SAFE,
        nextNodeId: 'root'
      },
      {
        label: 'Who do you trust most?',
        intent: DETERMINISTIC_INTENTS.TRUST_WHO_DO_YOU_TRUST,
        nextNodeId: 'root'
      },
      {
        label: 'Where is your head at?',
        intent: DETERMINISTIC_INTENTS.STRATEGY_WHERE_IS_YOUR_HEAD_AT,
        nextNodeId: 'root'
      },
      {
        label: 'Share a small rumor',
        intent: DETERMINISTIC_INTENTS.RUMOR_SHARE_SMALL,
        nextNodeId: 'root',
        requiresPick: {
          pickType: 'survivor',
          storeKey: 'rumorTargetName',
          storeIdKey: 'rumorTargetId',
          title: 'Share a rumor about who?'
        }
      },
      {
        label: 'END CONVERSATION',
        intent: 'end_conversation',
        end: true
      }
    ];

    return {
      root: {
        id: 'root',
        promptText: '',
        choices: rootChoices
      }
    };
  }

  _renderActiveConversation() {
    const session = this.activeConversation;
    if (!session) return;
    const node = session.nodes?.[session.nodeId];
    if (!node) {
      console.warn(`ConversationSystem: Missing deterministic node "${session.nodeId}"`);
      this.closeConversation('missing_node');
      return;
    }

    const npc = this._getSurvivorById(session.npcId);
    if (!npc) return;
    const overlay = this._buildOverlayShell(npc, { reuse: true });
    const content = this._getConversationContent(overlay);
    this._clearConversationContent(content);

    const nodeText = this._composeMenuText({
      playerNarration: node.playerNarration || '',
      npcResponse: node.npcResponse || '',
      text: node.promptText || ''
    });

    const parchment = this._buildParchment(nodeText || '');
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

    const choices = Array.isArray(node.choices) && node.choices.length
      ? node.choices
      : [
        {
          label: 'Ask another question',
          intent: DETERMINISTIC_INTENTS.INTEL_HEARING_NAMES,
          nextNodeId: session.nodeId
        },
        {
          label: 'END CONVERSATION',
          intent: 'end_conversation',
          end: true
        }
      ];

    choices.forEach(choice => {
      const btn = this._createChoiceButton({
        label: choice.label,
        alt: choice.alt,
        onClick: () => this.advanceConversation(choice),
        fallback: { session, npc }
      });
      buttonColumn.appendChild(btn);
    });

    parchment.appendChild(buttonColumn);
    content.appendChild(parchment);
  }

  advanceConversation(choice) {
    const session = this.activeConversation;
    if (!session || !choice) return;
    const npc = this._getSurvivorById(session.npcId);
    if (!npc) return;

    const isEndLabel = typeof choice.label === 'string' && /end conversation/i.test(choice.label);
    if (choice.end || isEndLabel) {
      this.closeConversation('player_end');
      return;
    }

    const finalizeAdvance = (picks = null) => {
      const result = this._applyDeterministicIntent(choice.intent, {
        nextNodeId: choice.nextNodeId,
        picks
      });
      if (result?.shouldRender) {
        this._renderActiveConversation();
      }
    };

    if (choice.requiresPick?.pickType === 'survivor') {
      const excludeIds = [session.npcId, this.gameManager.getPlayerSurvivor?.()?.id].filter(Boolean);
      const pickerTitle = choice.requiresPick.title || 'Pick a survivor';
      this.promptSurvivorPicker({
        title: pickerTitle,
        tribeOnly: true,
        excludeIds
      }).then(selectedId => {
        if (!selectedId) {
          this._renderActiveConversation();
          return;
        }
        const pick = this._getSurvivorById(selectedId);
        if (!pick) {
          this._renderActiveConversation();
          return;
        }
        const storeKey = choice.requiresPick.storeKey;
        const storeIdKey = choice.requiresPick.storeIdKey;
        if (storeKey) {
          session.context[storeKey] = pick.firstName;
        }
        if (storeIdKey) {
          session.context[storeIdKey] = pick.id;
        }
        finalizeAdvance({ [storeKey]: pick.firstName, [storeIdKey]: pick.id });
      });
      return;
    }

    finalizeAdvance();
  }

  _applyDeterministicIntent(intent, { nextNodeId = null, picks = null, initiator = null } = {}) {
    const session = this.activeConversation;
    if (!session || !intent) return { shouldRender: false };
    const npc = this._getSurvivorById(session.npcId);
    const player = this.gameManager.getPlayerSurvivor?.();

    const response = this._generateDeterministicResponse(intent, session.context, {
      npc,
      player,
      history: session.history
    });
    const exchange = this.formatExchange({
      narration: response.narration,
      npcDoes: response.npcDoes,
      npcSays: response.npcSays,
      npc,
      intent
    });

    const nodeId = nextNodeId || session.nodeId;
    if (session.nodes[nodeId]) {
      session.nodeId = nodeId;
      session.nodes[nodeId].promptText = this._composeMenuText(exchange);
      session.nodes[nodeId].playerNarration = exchange.playerNarration;
      session.nodes[nodeId].npcResponse = exchange.npcResponse;
    }

    session.history.push({
      nodeId: session.nodeId,
      intent,
      picks,
      resultSummary: response.summary || null
    });

    if (initiator && !session.context.initiator) {
      session.context.initiator = initiator;
    }

    return { shouldRender: true };
  }

  _generateDeterministicResponse(intent, context = {}, { npc, player, history = [] } = {}) {
    const npcName = this._npcDisplayName(npc);
    const disclosureMode = this.getDisclosureMode(npc, player, intent, { history, context });
    const fallbackNoPick = {
      narration: 'You realize you didn’t actually name anyone.',
      npcSays: 'Name names if you want me to react.',
      npcDoes: `${npcName} keeps their tone even.`,
      summary: 'no_pick'
    };

    if (intent === DETERMINISTIC_INTENTS.INTEL_HEARING_NAMES) {
      const intelTarget = this._pickIntelTarget(npc, context);
      const targetName = intelTarget?.targetName || context.lastIntelTargetName;
      if (targetName) {
        context.lastIntelTargetName = targetName;
        context.lastIntelTargetId = intelTarget?.targetId || context.lastIntelTargetId || null;
      }

      if (!targetName) {
        return {
          narration: 'You ask what names are floating around camp.',
          npcDoes: `${npcName} glances around the fire.`,
          npcSays: 'I’m not hearing anything solid yet.',
          summary: 'no_targets'
        };
      }

      if (disclosureMode === 'DODGE') {
        return {
          narration: 'You ask what names are floating around camp.',
          npcDoes: `${npcName} lowers their voice.`,
          npcSays: 'I’m not putting names out there, but watch who keeps disappearing in pairs.',
          summary: 'dodge_intel'
        };
      }

      if (disclosureMode === 'LIE') {
        const alternate = this._pickAlternateName([targetName], npc);
        context.lastLie = {
          intent,
          lieName: alternate || targetName,
          truthName: targetName
        };
        return {
          narration: 'You ask what names are floating around camp.',
          npcDoes: `${npcName} leans in closer.`,
          npcSays: `${alternate || targetName} is the name that keeps coming up.`,
          summary: `lie_intel_${alternate || targetName}`
        };
      }

      if (disclosureMode === 'HALF_TRUTH') {
        return {
          narration: 'You ask what names are floating around camp.',
          npcDoes: `${npcName} nods slowly.`,
          npcSays: `${targetName} has been whispered, but I’m keeping the rest tight.`,
          summary: `half_truth_${targetName}`
        };
      }

      return {
        narration: 'You ask what names are floating around camp.',
        npcDoes: `${npcName} keeps their voice low.`,
        npcSays: `${targetName} is the name I keep hearing.`,
        summary: `truth_intel_${targetName}`
      };
    }

    if (intent === DETERMINISTIC_INTENTS.INTEL_WHO_SEEMS_CLOSE) {
      const duo = this._getClosestDuo(npc, context);
      const duoLabel = duo?.aName && duo?.bName ? `${duo.aName} and ${duo.bName}` : null;
      if (duoLabel) {
        context.duoNameA = duo.aName;
        context.duoNameB = duo.bName;
        context.duoIdA = duo.aId;
        context.duoIdB = duo.bId;
      }

      if (!duoLabel) {
        return {
          narration: 'You ask who seems close out here.',
          npcDoes: `${npcName} exhales.`,
          npcSays: 'It’s messy. I’m still trying to map it.',
          summary: 'no_duo'
        };
      }

      if (disclosureMode === 'DODGE') {
        return {
          narration: 'You ask who seems close out here.',
          npcDoes: `${npcName} tilts their head.`,
          npcSays: 'People are pairing off, but I’m not naming names.',
          summary: 'dodge_duo'
        };
      }

      if (disclosureMode === 'LIE') {
        const alternatePair = this._getClosestDuo(npc, { ...context, avoidIds: [duo.aId, duo.bId] });
        const altLabel = alternatePair?.aName && alternatePair?.bName ? `${alternatePair.aName} and ${alternatePair.bName}` : duoLabel;
        context.lastLie = { intent, lieName: altLabel, truthName: duoLabel };
        return {
          narration: 'You ask who seems close out here.',
          npcDoes: `${npcName} glances toward the shelter.`,
          npcSays: `${altLabel} look tight to me.`,
          summary: `lie_duo_${altLabel}`
        };
      }

      if (disclosureMode === 'HALF_TRUTH') {
        return {
          narration: 'You ask who seems close out here.',
          npcDoes: `${npcName} keeps it vague.`,
          npcSays: `${duo.aName} is locked in with someone, but I’m not saying the second name.`,
          summary: `half_truth_duo_${duo.aName}`
        };
      }

      return {
        narration: 'You ask who seems close out here.',
        npcDoes: `${npcName} nods once.`,
        npcSays: `${duoLabel} look locked in.`,
        summary: `truth_duo_${duoLabel}`
      };
    }

    if (intent === DETERMINISTIC_INTENTS.SOCIAL_HOW_DO_YOU_FEEL_ABOUT_ME) {
      const trustScore = this._getTrustScore(npc, player) ?? 50;
      const tone = trustScore >= 70 ? 'solid' : trustScore >= 55 ? 'steady' : trustScore >= 40 ? 'uncertain' : 'wary';

      if (disclosureMode === 'DODGE') {
        return {
          narration: 'You ask how they feel about you right now.',
          npcDoes: `${npcName} shifts their weight.`,
          npcSays: 'Let’s keep it simple today and just keep talking.',
          summary: 'dodge_feel'
        };
      }

      if (disclosureMode === 'LIE') {
        const lieTone = trustScore >= 60 ? 'wary' : 'solid';
        return {
          narration: 'You ask how they feel about you right now.',
          npcDoes: `${npcName} studies your face.`,
          npcSays: lieTone === 'solid'
            ? 'I feel good with you right now.'
            : 'I’m not sure where we stand yet.',
          summary: `lie_feel_${lieTone}`
        };
      }

      const truthLine = tone === 'solid'
        ? 'I feel solid with you. I want to keep that.'
        : tone === 'steady'
          ? 'I feel decent with you. Keep it steady.'
          : tone === 'uncertain'
            ? 'I’m still figuring it out, but I’m listening.'
            : 'I’m a little wary, but I’m not closed off.';

      return {
        narration: 'You ask how they feel about you right now.',
        npcDoes: `${npcName} answers without looking away.`,
        npcSays: truthLine,
        summary: `truth_feel_${tone}`
      };
    }

    if (intent === DETERMINISTIC_INTENTS.SAFETY_ARE_YOU_SAFE) {
      const paranoia = npc?.paranoia || 0;
      const tribeSafe = this._isPlayerTribeSafeTonight();
      const feelsSafe = tribeSafe || paranoia < 40;
      const safetyLine = feelsSafe
        ? 'I feel okay for now, but nothing is locked.'
        : 'I’m not totally comfortable. I’m keeping my head on a swivel.';

      if (disclosureMode === 'DODGE') {
        return {
          narration: 'You ask if they feel safe today.',
          npcDoes: `${npcName} keeps their voice neutral.`,
          npcSays: 'I’m just taking it hour by hour.',
          summary: 'dodge_safe'
        };
      }

      if (disclosureMode === 'LIE') {
        const lieLine = feelsSafe
          ? 'I’m nervous. I don’t feel locked in anywhere.'
          : 'I feel safe right now. I’m good.';
        context.lastLie = { intent, lieName: lieLine, truthName: safetyLine };
        return {
          narration: 'You ask if they feel safe today.',
          npcDoes: `${npcName} keeps their eyes on the tree line.`,
          npcSays: lieLine,
          summary: 'lie_safe'
        };
      }

      if (disclosureMode === 'HALF_TRUTH') {
        return {
          narration: 'You ask if they feel safe today.',
          npcDoes: `${npcName} exhales slowly.`,
          npcSays: feelsSafe ? 'I feel okay, but I’m still checking the room.' : 'I’m not safe yet, but I have a plan.',
          summary: 'half_truth_safe'
        };
      }

      return {
        narration: 'You ask if they feel safe today.',
        npcDoes: `${npcName} nods once.`,
        npcSays: safetyLine,
        summary: 'truth_safe'
      };
    }

    if (intent === DETERMINISTIC_INTENTS.TRUST_WHO_DO_YOU_TRUST) {
      const trusted = context.npcTrustedPersonName || this._pickTrustedAllyName(npc);
      if (!trusted) {
        return {
          narration: 'You ask who they trust most right now.',
          npcDoes: `${npcName} shrugs.`,
          npcSays: 'I’m keeping that close to my chest.',
          summary: 'no_trust_name'
        };
      }

      if (disclosureMode === 'DODGE') {
        return {
          narration: 'You ask who they trust most right now.',
          npcDoes: `${npcName} smiles thinly.`,
          npcSays: 'I’m not putting that out there yet.',
          summary: 'dodge_trust'
        };
      }

      if (disclosureMode === 'LIE') {
        const alternate = this._pickAlternateName([trusted], npc);
        context.lastLie = { intent, lieName: alternate || trusted, truthName: trusted };
        return {
          narration: 'You ask who they trust most right now.',
          npcDoes: `${npcName} looks toward the campfire.`,
          npcSays: `${alternate || trusted} is who I’m leaning on.`,
          summary: `lie_trust_${alternate || trusted}`
        };
      }

      if (disclosureMode === 'HALF_TRUTH') {
        return {
          narration: 'You ask who they trust most right now.',
          npcDoes: `${npcName} keeps it tight.`,
          npcSays: `${trusted} has my ear, but that’s all I’ll say.`,
          summary: `half_truth_trust_${trusted}`
        };
      }

      context.npcTrustedPersonName = trusted;
      return {
        narration: 'You ask who they trust most right now.',
        npcDoes: `${npcName} answers without hesitation.`,
        npcSays: `${trusted} is the person I feel best with.`,
        summary: `truth_trust_${trusted}`
      };
    }

    if (intent === DETERMINISTIC_INTENTS.STRATEGY_WHERE_IS_YOUR_HEAD_AT) {
      const paranoia = npc?.paranoia || 0;
      const planLine = paranoia > 60
        ? 'I want to keep the vote loose and see who overplays.'
        : 'I want to stay flexible and keep my options open.';

      if (disclosureMode === 'DODGE') {
        return {
          narration: 'You ask where their head is at strategically.',
          npcDoes: `${npcName} gives a quick half-smile.`,
          npcSays: 'I’m still reading the room.',
          summary: 'dodge_strategy'
        };
      }

      if (disclosureMode === 'LIE') {
        return {
          narration: 'You ask where their head is at strategically.',
          npcDoes: `${npcName} keeps it casual.`,
          npcSays: 'I’m locked in on something, but I’ll keep it quiet for now.',
          summary: 'lie_strategy'
        };
      }

      if (disclosureMode === 'HALF_TRUTH') {
        return {
          narration: 'You ask where their head is at strategically.',
          npcDoes: `${npcName} thinks for a beat.`,
          npcSays: `${planLine} That’s as far as I’ll go right now.`,
          summary: 'half_truth_strategy'
        };
      }

      return {
        narration: 'You ask where their head is at strategically.',
        npcDoes: `${npcName} speaks evenly.`,
        npcSays: planLine,
        summary: 'truth_strategy'
      };
    }

    if (intent === DETERMINISTIC_INTENTS.RUMOR_SHARE_SMALL) {
      const targetName = context.rumorTargetName;
      if (!targetName) {
        return fallbackNoPick;
      }

      const trustScore = this._getTrustScore(npc, player) ?? 50;
      const reactionLine = trustScore > 65
        ? `I’ll keep that about ${targetName} in mind.`
        : trustScore > 45
          ? `That’s interesting. I’ll watch ${targetName}.`
          : `I’m not sure I buy that about ${targetName}.`;

      return {
        narration: `You share a small rumor about ${targetName}.`,
        npcDoes: `${npcName} studies you closely.`,
        npcSays: reactionLine,
        summary: `rumor_share_${targetName}`
      };
    }

    return {
      narration: 'You keep the conversation steady.',
      npcDoes: `${npcName} listens.`,
      npcSays: 'I hear you.',
      summary: 'fallback'
    };
  }

  getDisclosureMode(npc, player, topic, context = {}) {
    const trustScore = this._getTrustScore(npc, player) ?? 50;
    const style = this._classifyStyle(npc);
    const paranoia = npc?.paranoia || 0;
    const repeatCount = this._countRepeatedIntent(topic, context.history || []);

    const truthScore = trustScore + (style.isSocial ? 5 : 0) - paranoia * 0.4 - repeatCount * 6;
    const dodgeScore = 45 + paranoia * 0.5 + repeatCount * 10;
    const lieScore = 25 + (style.isVillain ? 15 : 0) + (trustScore < 45 ? 8 : 0);
    const halfScore = 35 + (trustScore - 50) * 0.25;

    const scores = {
      TRUTH: truthScore,
      DODGE: dodgeScore,
      LIE: lieScore,
      HALF_TRUTH: halfScore
    };

    return Object.entries(scores)
      .sort((a, b) => b[1] - a[1])[0][0];
  }

  _countRepeatedIntent(intent, history = []) {
    if (!intent || !history.length) return 0;
    const recent = history.slice(-4);
    return recent.filter(entry => entry.intent === intent).length;
  }

  _getClosestDuo(npc, context = {}) {
    const relationshipSystem = this.gameManager.systems?.relationshipSystem;
    const tribe = this.gameManager.getPlayerTribe?.();
    const pool = (tribe?.members || this.gameManager.survivors || [])
      .filter(s => s && !s.isPlayer && s.id !== npc?.id);

    if (pool.length < 2) return null;

    const avoidIds = new Set(context.avoidIds || []);
    let bestPair = null;
    let bestScore = -Infinity;

    for (let i = 0; i < pool.length; i += 1) {
      for (let j = i + 1; j < pool.length; j += 1) {
        const first = pool[i];
        const second = pool[j];
        if (avoidIds.has(first.id) || avoidIds.has(second.id)) continue;
        const rel = relationshipSystem?.getRelationship?.(first.id, second.id);
        const score = typeof rel?.value === 'number' ? rel.value : this._relationshipBetween(first.id, second.id);
        if (score > bestScore) {
          bestScore = score;
          bestPair = {
            aName: first.firstName,
            bName: second.firstName,
            aId: first.id,
            bId: second.id
          };
        }
      }
    }

    if (!bestPair) {
      const fallback = pool.slice(0, 2);
      return {
        aName: fallback[0]?.firstName || 'someone',
        bName: fallback[1]?.firstName || 'someone',
        aId: fallback[0]?.id || null,
        bId: fallback[1]?.id || null
      };
    }

    return bestPair;
  }

  _pickAlternateName(exclude = [], npc) {
    const excludeSet = new Set(exclude.filter(Boolean));
    const available = this._getAvailableTargetNames(npc).filter(name => !excludeSet.has(name));
    if (!available.length) return null;
    return available[getRandomInt(0, available.length - 1)];
  }

  _initNodeSession({ npcId, playerId, intent, meeting = null, context = {} }) {
    return {
      sessionId: `node-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      npcId,
      playerId,
      intent,
      meeting,
      context: this._normalizeConversationContext({ ...context }),
      npcMemory: this.npcMemory,
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
    this._debugLog('CONVO: register node', {
      nodeId: id,
      intent: session.intent,
      hasChoices: Array.isArray(node.choices) && node.choices.length > 0
    });
    this._debugBanner('CONVO register', id);
    // Enforce standardized step model: store narration + NPC response separately (legacy text is normalized below).
    const legacy = this._normalizeLegacyNodeText(node.text || '');
    const playerNarration = node.playerNarration || legacy.playerNarration || null;
    const npcResponse = node.npcResponse || legacy.npcResponse || null;
    session.nodes[id] = {
      id,
      text: node.text,
      playerNarration,
      npcResponse,
      choices: Array.isArray(node.choices) ? node.choices : [],
      additionalText: node.additionalText || null,
      meta: node.meta || {}
    };
    return id;
  }

  _safeClick(handler, fallback = {}) {
    const wrapped = () => {
      try {
        const result = typeof handler === 'function' ? handler() : null;
        if (result && typeof result.then === 'function') {
          result.catch(error => this._handleConversationError(error, fallback));
        }
      } catch (error) {
        this._handleConversationError(error, fallback);
      }
    };
    wrapped.__safeClick = true;
    return wrapped;
  }

  _getNpcMemoryEntry(survivor, session = null) {
    if (!survivor) return null;
    const store = session?.npcMemory || this.npcMemory || (this.npcMemory = {});
    const key = survivor.firstName || survivor.id || 'npc';
    if (!store[key]) {
      store[key] = {
        eyeTargetName: null,
        trustedName: null,
        idolSuspectName: null,
        lastDiscussedNames: [],
        lastIntentAsked: {},
        lastDisclosureByKind: {},
        lastQuestionTag: null,
        lastAnswerTag: null
      };
    }
    return store[key];
  }

  _normalizeConversationContext(context = {}) {
    const normalized = { ...context };
    normalized.topicPersonName = context.topicPersonName || context.topicPerson || context.targetName || null;
    normalized.topicPersonId = context.topicPersonId || context.topicId || context.targetId || null;
    normalized.playerNamedAllyName = context.playerNamedAllyName || context.playerAllyName || null;
    normalized.playerNamedAllyId = context.playerNamedAllyId || context.playerAllyId || null;
    normalized.npcTrustedPersonName = context.npcTrustedPersonName || context.trustedName || null;
    normalized.npcTrustedPersonId = context.npcTrustedPersonId || context.trustedId || null;
    normalized.suspectedIdolName = context.suspectedIdolName || context.idolSuspectName || null;
    normalized.lastQuestionTag = context.lastQuestionTag || null;
    normalized.lastAnswerTag = context.lastAnswerTag || null;
    normalized.phase = context.phase || this._getConversationPhase();
    normalized.location = context.location || (typeof window !== 'undefined' ? window?.campScreen?.currentView : null);
    return normalized;
  }

  _npcDisplayName(npc) {
    return npc?.firstName || 'Your tribemate';
  }

  _verbAgree(npc, singularVerb, pluralVerb) {
    const name = this._npcDisplayName(npc);
    return /^they$/i.test(String(name).trim()) ? pluralVerb : singularVerb;
  }

  _npcSays(npc, text) {
    const name = this._npcDisplayName(npc);
    const verb = this._verbAgree(npc, 'says', 'say');
    const trimmed = String(text || '').trim();
    if (!trimmed) return `${name} ${verb}.`;
    if (/^["“]/.test(trimmed)) {
      return `${name} ${verb}, ${trimmed}`;
    }
    return `${name} ${verb}, "${trimmed}"`;
  }

  formatNarration(line) {
    if (!line) return '';
    return String(line).replace(/[“”"]/g, '').trim();
  }

  formatDialogue(npc, line, intent = null) {
    const npcName = this._npcDisplayName(npc);
    const sayVerb = this._verbAgree(npc, 'says', 'say');
    const trimmed = String(line || '').trim();
    if (!trimmed) {
      return `${npcName} ${sayVerb}, "${this._getNpcFallbackDialogue(intent)}"`;
    }

    const withName = trimmed.replace('{npc}', npcName);
    if (/["“]/.test(withName)) {
      if (withName.includes(npcName)) {
        return this._normalizeNpcVerbAgreement(withName);
      }
      return this._normalizeNpcVerbAgreement(`${npcName} ${sayVerb}, ${withName}`);
    }

    const narrationLead = new RegExp(`^${npcName}\\b`, 'i').test(withName) || /^they\b/i.test(withName);
    if (narrationLead) {
      const fallbackDialogue = this._getNpcFallbackDialogue(intent);
      return this._normalizeNpcVerbAgreement(`${withName} "${fallbackDialogue}"`);
    }

    const punctuated = /[.?!]$/.test(withName) ? withName : `${withName}.`;
    return this._normalizeNpcVerbAgreement(`${npcName} ${sayVerb}, "${punctuated}"`);
  }

  composeExchange({ narration1 = null, npcLine = null, narration2 = null, npc = null, intent = null } = {}) {
    const narrationParts = [];
    if (narration1) {
      narrationParts.push(narration1);
    }
    if (narration2) {
      narrationParts.push(narration2);
    }
    const combinedNarration = narrationParts.filter(Boolean).join(' ');
    return this.formatExchange({
      narration: combinedNarration || this._fallbackPlayerNarration(intent),
      npcLine,
      npc,
      intent
    });
  }

  formatExchange({ narration = null, npcSays = null, npcDoes = null, npcLine = null, npc = null, intent = null } = {}) {
    const playerNarration = this._formatPlayerNarration(this.formatNarration(narration || ''), intent);
    let resolvedDoes = npcDoes;
    let resolvedSays = npcSays;
    if (npcLine && (!resolvedDoes && !resolvedSays)) {
      const parsed = this._parseNpcLine(npcLine, npc);
      resolvedDoes = parsed.npcDoes;
      resolvedSays = parsed.npcSays;
    }
    const npcResponse = this._formatNpcExchange({ npc, npcDoes: resolvedDoes, npcSays: resolvedSays, intent });
    return { playerNarration, npcResponse };
  }

  _parseNpcLine(line, npc) {
    if (!line) return { npcDoes: null, npcSays: null };
    const normalized = String(line || '').replace(/[“”]/g, '"').trim();
    if (!normalized) return { npcDoes: null, npcSays: null };
    const firstQuote = normalized.indexOf('"');
    if (firstQuote >= 0) {
      const before = normalized.slice(0, firstQuote).trim();
      const after = normalized.slice(firstQuote + 1);
      const lastQuote = after.lastIndexOf('"');
      const quoted = (lastQuote >= 0 ? after.slice(0, lastQuote) : after).trim();
      const speechLead = /(says|say|asks|ask|adds|add|admits|admit|warns|warn|answers|answer)\s*,?\s*$/i;
      const npcDoes = before && !speechLead.test(before) ? before : null;
      return {
        npcDoes,
        npcSays: quoted || null
      };
    }

    const npcName = this._npcDisplayName(npc);
    const actionPattern = new RegExp(`\\b(${NPC_ACTION_VERBS.join('|')})\\b`, 'i');
    if ((new RegExp(`^${npcName}\\b`, 'i').test(normalized) || /^they\b/i.test(normalized)) && actionPattern.test(normalized)) {
      return { npcDoes: normalized, npcSays: null };
    }

    return { npcDoes: null, npcSays: normalized };
  }

  _formatNpcExchange({ npc, npcDoes, npcSays, intent } = {}) {
    const cleanedDoes = npcDoes ? String(npcDoes).replace(/[“”"]/g, '').trim() : '';
    const cleanedSays = npcSays ? String(npcSays).replace(/[“”"]/g, '').trim() : '';
    const outputParts = [];

    if (cleanedDoes) {
      outputParts.push(this._normalizeNpcVerbAgreement(cleanedDoes));
    }

    const finalizeQuote = (raw) => {
      const q = String(raw || '').replace(/[“”"]/g, '').trim();
      if (!q) return '';
      const punctuated = /[.?!]$/.test(q) ? q : `${q}.`;
      return `"${punctuated}"`;
    };

    if (cleanedSays) {
      outputParts.push(finalizeQuote(cleanedSays));
    }

    if (!outputParts.length) {
      outputParts.push(finalizeQuote(this._getNpcFallbackDialogue(intent)));
    }

    return this._normalizeNpcVerbAgreement(outputParts.join(' '));
  }

  _npcDoes(npc, singularVerb, pluralVerb, restOfSentence = '') {
    const name = this._npcDisplayName(npc);
    const verb = this._verbAgree(npc, singularVerb, pluralVerb);
    const suffix = restOfSentence ? (restOfSentence.startsWith(' ') ? restOfSentence : ` ${restOfSentence}`) : '';
    return `${name} ${verb}${suffix}`;
  }

  _normalizeNpcVerbAgreement(line) {
    const text = String(line || '');
    if (!/\bThey\b/.test(text)) return text;
    const verbMap = {
      says: 'say',
      keeps: 'keep',
      nods: 'nod',
      shrugs: 'shrug',
      leans: 'lean',
      exhales: 'exhale',
      frowns: 'frown',
      answers: 'answer',
      claims: 'claim',
      points: 'point',
      adds: 'add',
      agrees: 'agree',
      admits: 'admit',
      cautions: 'caution',
      deflects: 'deflect',
      hedges: 'hedge',
      warns: 'warn',
      recalls: 'recall',
      listens: 'listen',
      considers: 'consider',
      shakes: 'shake',
      narrows: 'narrow',
      stiffens: 'stiffen',
      softens: 'soften',
      sighs: 'sigh',
      smiles: 'smile',
      chuckles: 'chuckle',
      glances: 'glance',
      looks: 'look',
      watches: 'watch',
      meets: 'meet',
      glares: 'glare',
      squints: 'squint',
      blinks: 'blink',
      bristles: 'bristle',
      snaps: 'snap',
      shuts: 'shut',
      squares: 'square',
      holds: 'hold',
      lowers: 'lower',
      raises: 'raise',
      absorbs: 'absorb',
      pivots: 'pivot',
      folds: 'fold',
      tilts: 'tilt',
      whispers: 'whisper',
      asks: 'ask',
      studies: 'study',
      gives: 'give',
      hesitates: 'hesitate'
    };
    let normalized = text;
    Object.entries(verbMap).forEach(([singular, plural]) => {
      const pattern = new RegExp(`\\bThey\\s+${singular}\\b`, 'g');
      normalized = normalized.replace(pattern, `They ${plural}`);
    });
    return normalized;
  }

  _escapeRegExp(value) {
    return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  _normalizeSelfReferenceInQuotes(line, survivor, subjectName, subjectId) {
    if (!line || !survivor) return line;
    const isSelf = (subjectId && survivor?.id && subjectId === survivor.id)
      || (subjectName && survivor?.firstName && subjectName === survivor.firstName);
    if (!isSelf || !subjectName) return line;
    const namePattern = this._escapeRegExp(subjectName);
    return String(line).replace(/"([^"]*)"/g, (match, inner) => {
      let updated = inner;
      updated = updated.replace(new RegExp(`\\b${namePattern}'s\\b`, 'gi'), 'my');
      updated = updated.replace(new RegExp(`\\b${namePattern}\\b`, 'gi'), 'me');
      updated = updated.replace(/^me\\b/i, 'I');
      return `"${updated}"`;
    });
  }

  _normalizeLegacyNodeText(text) {
    const trimmed = String(text || '').trim();
    if (!trimmed) return { playerNarration: null, npcResponse: null };
    const parts = trimmed.split('\n\n').map(part => part.trim()).filter(Boolean);
    if (parts.length >= 2) {
      return { playerNarration: parts[0], npcResponse: parts.slice(1).join('\n\n') };
    }
    if (/^you\b/i.test(trimmed)) {
      return { playerNarration: trimmed, npcResponse: null };
    }
    return { playerNarration: null, npcResponse: trimmed };
  }

  _getNpcSayVerb(npcName) {
    if (!npcName) return 'says';
    if (/^they$/i.test(String(npcName).trim())) return 'say';
    return 'says';
  }

  _composeMenuText({ playerNarration, npcResponse, playerLine, npcLine, text } = {}) {
    const resolvedPlayer = String(playerNarration || playerLine || '').trim();
    const resolvedNpc = String(npcResponse || npcLine || '').trim();
    if (resolvedPlayer && resolvedNpc) return `${resolvedPlayer}\n\n${resolvedNpc}`;
    if (resolvedNpc) return resolvedNpc;
    if (resolvedPlayer) return resolvedPlayer;
    return text || '';
  }

  _formatPlayerNarration(line, intent = null) {
    const trimmed = this.formatNarration(line);
    if (!trimmed) {
      return this._fallbackPlayerNarration(intent);
    }
    if (/^you\b/i.test(trimmed)) return trimmed;
    if (trimmed.endsWith('?') || /^(who|what|why|how|where|when|so)\b/i.test(trimmed)) {
      const cleaned = trimmed.replace(/\?$/, '');
      return `You ask ${cleaned.charAt(0).toLowerCase()}${cleaned.slice(1)}.`;
    }
    if (/^i['\s]/i.test(trimmed) || /^i\b/i.test(trimmed)) {
      return `You say ${trimmed.charAt(0).toLowerCase()}${trimmed.slice(1)}`;
    }
    return `You ${trimmed.charAt(0).toLowerCase()}${trimmed.slice(1)}`;
  }

  _fallbackPlayerNarration(intent = null) {
    const fallbackByIntent = {
      [PRE_PHASE_INTENTS.check_trust]: 'You ask where you stand and keep it low.',
      [PRE_PHASE_INTENTS.light_strategy]: 'You float a light, vague read and watch the reaction.',
      [PRE_PHASE_INTENTS.ask_general_info]: 'You fish for anything they have heard around camp.',
      [PRE_PHASE_INTENTS.repair_relationship]: 'You steady your voice and try to mend the moment.',
      [PRE_PHASE_INTENTS.confront_rumor]: 'You press them about your name without flinching.',
      [POST_PHASE_INTENTS.ask_intel]: 'You ask for the latest reads without overplaying it.',
      [POST_PHASE_INTENTS.pitch_target]: 'You name a target carefully and test their temperature.',
      [POST_PHASE_INTENTS.deflect_target]: 'You try to reroute the heat off the name in play.',
      [POST_PHASE_INTENTS.verify_story]: 'You press for clarity and watch their eyes.',
      [POST_PHASE_INTENTS.plant_seed]: 'You float a seed and let it hang in the air.'
    };
    return fallbackByIntent[intent] || 'You keep your tone calm and see how they react.';
  }

  _formatNpcResponse(line, intent = null) {
    const npc = this._getSurvivorById(this.nodeSession?.npcId || this.conversationSession?.npcId || this.state?.npcId);
    const parsed = this._parseNpcLine(line, npc);
    return this._formatNpcExchange({ npc, npcDoes: parsed.npcDoes, npcSays: parsed.npcSays, intent });
  }

  _getNpcFallbackDialogue(intent = null) {
    const fallbackByIntent = {
      [PRE_PHASE_INTENTS.check_trust]: 'I’m still reading people.',
      [PRE_PHASE_INTENTS.light_strategy]: 'Let’s keep it light for now.',
      [PRE_PHASE_INTENTS.ask_general_info]: 'Things are shifting; I’m watching.',
      [PRE_PHASE_INTENTS.confront_rumor]: 'Let’s talk it through.',
      [POST_PHASE_INTENTS.ask_intel]: 'There’s chatter, but nothing locked.',
      [POST_PHASE_INTENTS.idol_suspicion]: 'No hard proof yet.',
      [POST_PHASE_INTENTS.pitch_target]: 'Let’s see how the day unfolds.',
      [POST_PHASE_INTENTS.verify_story]: 'I’ll be straight with you when I can.'
    };
    return fallbackByIntent[intent] || 'Alright. Let’s see how today shakes out.';
  }

  _handleConversationError(error, { session, npc, fallbackLine } = {}) {
    if (typeof window !== 'undefined') {
      window.__lastConversationError = error;
    }
    console.error('ConversationSystem: click handler failed', error);
    const activeSession = session || this.nodeSession || this.conversationSession;
    const safeNpc = npc || (activeSession ? this._getSurvivorById(activeSession.npcId) : null) || (this.state?.npcId ? this._getSurvivorById(this.state.npcId) : null);
    const line = fallbackLine || `${safeNpc?.firstName || 'They'} nods. "Alright. Let’s see how it lands."`;
    if (activeSession && safeNpc) {
      this._renderRecoveryNode(activeSession, safeNpc, line);
      return;
    }
    if (safeNpc) {
      const player = this.gameManager.getPlayerSurvivor?.();
      const recoverySession = this._initNodeSession({
        npcId: safeNpc.id,
        playerId: player?.id || null,
        intent: this.state?.lastIntent || this.state?.intent || null,
        meeting: null,
        context: this.activeConversationContext || this.state?.context || {}
      });
      this.nodeSession = recoverySession;
      this.activeConversationContext = recoverySession.context;
      const recovered = this._renderRecoveryNode(recoverySession, safeNpc, line, 'error_recovery_session');
      if (recovered) return;
    }
    this._clearOverlay({ reason: 'handleConversationError' });
  }

  _renderRecoveryNode(session, npc, line, reason = null) {
    const activeSession = session || this.nodeSession || this.conversationSession;
    const safeNpc = npc || (activeSession ? this._getSurvivorById(activeSession.npcId) : null);
    if (!activeSession || !safeNpc) {
      return false;
    }
    const canBack = (activeSession.historyStack || []).length > 0;
    const recoveryChoice = canBack
      ? { id: 'recovery-back', label: 'Back', action: 'goBack' }
      : { id: 'recovery-end', label: 'End Conversation', action: 'endConversation' };
    if (reason) {
      this._debugLog('CONVO: recovery node rendered', {
        reason,
        npcId: safeNpc.id,
        nodeId: activeSession.currentNodeId || null
      });
    }
    const recoveryNodeId = this._registerNode(activeSession, {
      playerNarration: activeSession?.context?.lastPlayerNarration || this._fallbackPlayerNarration(activeSession?.intent),
      npcResponse: line,
      choices: [recoveryChoice],
      meta: { speaker: 'npc', showNav: false }
    });
    this._renderNode(activeSession, recoveryNodeId);
    return true;
  }

  _getConversationContent(overlay) {
    if (!overlay) return null;
    let content = overlay.querySelector('.conversation-content');
    if (!content) {
      const center = overlay.querySelector('.conversation-center');
      content = createElement('div', { className: 'conversation-content', style: { width: '100%' } });
      center?.appendChild(content);
    }
    return content;
  }

  _clearConversationContent(content) {
    if (!content) return;
    clearChildren(content);
    const existingNav = content.querySelectorAll('[data-conversation-nav]');
    existingNav.forEach(nav => nav.remove());
  }

  _createChoiceButton({ label, alt = false, onClick, fallback = {} }) {
    const resolvedFallback = { ...fallback };
    if (!resolvedFallback.session) {
      resolvedFallback.session = this.nodeSession || this.conversationSession || null;
    }
    if (!resolvedFallback.npc) {
      const fallbackNpcId = resolvedFallback.session?.npcId || this.state?.npcId || this._activeOverlayNpcId || null;
      resolvedFallback.npc = fallbackNpcId ? this._getSurvivorById(fallbackNpcId) : null;
    }
    const button = createElement('button', {
      className: `rect-button full${alt ? ' alt' : ''}`,
      onclick: this._safeClick(onClick, resolvedFallback)
    }, label);
    button.dataset.safeClick = 'true';
    return button;
  }

  _renderConversationOverlay(npc, text, buttons = []) {
    const overlay = this._buildOverlayShell(npc, { reuse: true });
    const content = this._getConversationContent(overlay);
    this._clearConversationContent(content);
    const parchment = this._buildParchment(text || '');

    if (buttons.length > 0) {
      const buttonColumn = createElement('div', {
        style: {
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
          marginTop: '12px',
          width: '100%'
        }
      });

      buttons.forEach(({ label, alt = false, onClick }) => {
        const btn = this._createChoiceButton({
          label,
          alt,
          onClick,
          fallback: { npc }
        });
        buttonColumn.appendChild(btn);
      });

      parchment.appendChild(buttonColumn);
    }

    content.appendChild(parchment);
  }

  _renderNode(session, nodeId) {
    if (!session || !nodeId) return;
    const node = session.nodes[nodeId];
    if (!node) {
      console.warn(`ConversationSystem: Missing node "${nodeId}"`);
      this._renderRecoveryNode(session, this._getSurvivorById(session.npcId), 'They blink. "Give me a second—let’s reset."', 'missing_node');
      return;
    }
    session.currentNodeId = nodeId;

    const npc = this._getSurvivorById(session.npcId);
    if (!npc) return;
    const overlay = this._buildOverlayShell(npc, { reuse: true });
    const player = this.gameManager.getPlayerSurvivor?.();
    const context = session.context || {};

    const resolvedPlayerNarration = typeof node.playerNarration === 'function'
      ? node.playerNarration(session, this)
      : (node.playerNarration || session.context?.lastPlayerNarration || this._fallbackPlayerNarration(session.intent));
    const resolvedNpcResponse = typeof node.npcResponse === 'function'
      ? node.npcResponse(session, this)
      : (node.npcResponse || '');
    const rawPlayerNarration = this._formatConversationLine(resolvedPlayerNarration || '', npc, context, player);
    const npcResponseText = resolvedNpcResponse && String(resolvedNpcResponse).trim().length > 0
      ? resolvedNpcResponse
      : this._getNpcFallbackDialogue(session.intent);
    const rawNpcResponse = this._formatConversationLine(npcResponseText || '', npc, context, player);
    const exchange = this.formatExchange({
      narration: rawPlayerNarration,
      npcLine: rawNpcResponse || this._buildDefaultNpcResponse({ npc, player, intent: session.intent, context }),
      npc,
      intent: session.intent
    });
    const formattedPlayerNarration = exchange.playerNarration;
    const formattedNpcResponse = exchange.npcResponse;
    let nodeText = this._composeMenuText({
      playerNarration: formattedPlayerNarration,
      npcResponse: formattedNpcResponse
    });

    this._debugValidateRenderedNode({
      playerNarration: formattedPlayerNarration,
      npcResponse: formattedNpcResponse,
      context,
      nodeText
    });

    if (formattedPlayerNarration && !this._wasLastHistoryEntry(session, 'Player', formattedPlayerNarration)) {
      this._appendConversationHistory(session, 'Player', { narration: formattedPlayerNarration }, ['player']);
    }
    if (formattedNpcResponse) {
      this._appendConversationHistory(session, npc?.firstName || 'NPC', { npcResponse: formattedNpcResponse }, ['npc']);
      context.lastSpeaker = node.meta?.speaker || 'npc';
    }

    const content = this._getConversationContent(overlay);
    this._clearConversationContent(content);
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

    const shouldShowNav = node.meta?.showNav !== false;
    let baseChoices = Array.isArray(node.choices) ? node.choices : [];
    const nonNavChoices = baseChoices.filter(choice => !this._isNavChoice(choice));
    if (nonNavChoices.length === 0 && !node.meta?.isEnd) {
      baseChoices = this._dedupeChoices([...baseChoices, ...this._buildAutoContinuationChoices(session)]);
    }

    const choices = shouldShowNav
      ? this._appendNavChoices(baseChoices, {
        canBack: session.historyStack.length > 0,
        canChangeTopic: true,
        onBack: () => this._goBackNode(session),
        onChangeTopic: () => this._showTopicSelection(npc, context.location),
        onEnd: () => this.closeConversation('player_end', session),
        session
      })
      : baseChoices;

    choices.forEach(choice => {
      const btn = this._createChoiceButton({
        label: choice.label,
        alt: choice.alt,
        onClick: () => this._handleNodeChoice(session, nodeId, choice),
        fallback: { session, npc }
      });
      if (this._isNavChoice(choice)) {
        btn.dataset.conversationNav = 'true';
      }
      buttonColumn.appendChild(btn);
    });

    parchment.appendChild(buttonColumn);
    content.appendChild(parchment);
  }

  _debugValidateRenderedNode({ playerNarration, npcResponse, context = {}, nodeText = '' } = {}) {
    if (typeof window === 'undefined') return;
    if (!window.DEBUG_CONVO && !window.DEBUG_CONVERSATION) return;
    const issues = [];
    const grammarPatterns = [
      /\bThey says\b/i,
      /\bThey keeps\b/i,
      /\bThey nods\b/i,
      /\bThey shrugs\b/i,
      /\bThey leans\b/i,
      /\bThey exhales\b/i,
      /\bThey frowns\b/i,
      /\bThey answers\b/i,
      /\bThey claims\b/i,
      /\bThey shakes\b/i
    ];
    const combined = `${playerNarration || ''}\n${npcResponse || ''}\n${nodeText || ''}`;
    if (grammarPatterns.some(pattern => pattern.test(combined))) {
      issues.push('Possible verb disagreement (They says/keeps/nods/etc.).');
    }

    if (npcResponse && /["“][^"”]*\bYou\s+(sense|keep|ask|float|press|watch|lean|pivot|steer)\b/i.test(npcResponse)) {
      issues.push('NPC quote may contain player narration phrasing.');
    }

    if ((context.topicPersonName || context.topicPerson) && npcResponse && /\bsomeone\b/i.test(npcResponse) && !npcResponse.includes(context.topicPersonName || context.topicPerson)) {
      issues.push('Topic person set, but NPC response drifted to "someone".');
    }

    if (issues.length) {
      console.warn('ConversationSystem DEBUG: Rendered node issues detected.', { issues, playerNarration, npcResponse, context });
    }
  }

  _handleNodeChoice(session, nodeId, choice) {
    console.log('[CONVO-DEBUG] _handleNodeChoice ENTRY', { nodeId, choiceId: choice?.id, choiceLabel: choice?.label, hasResponseOption: !!choice?.responseOption });
    if (!session || !choice) return;
    const npc = this._getSurvivorById(session.npcId);
    if (!npc) return;
    try {
      console.log('[CONVO-DEBUG] Processing choice', { intent: session.intent, hasNpcReply: !!choice.npcReply, hasAction: !!choice.action, hasNextNode: !!choice.nextNode, hasNextMenu: !!choice.nextMenu });
      this._debugLog('CONVO: choice selected', {
        nodeId,
        choiceId: choice.id,
        label: choice.label,
        playerLine: choice.playerLine || choice.label || null,
        hasNpcReply: !!choice.npcReply,
        hasResponseOption: !!choice.responseOption,
        action: choice.action,
        nextNode: !!choice.nextNode,
        nextMenu: !!choice.nextMenu,
        nextNodeId: !!choice.nextNodeId
      });
      this._debugBanner('CONVO choice', `${choice.id || 'choice'}: ${choice.label || ''}`);
      const isEndLabel = typeof choice.label === 'string' && /end conversation/i.test(choice.label);
      if (choice.end || (isEndLabel && !choice.action && !choice.responseOption && !choice.nextNode && !choice.nextMenu && !choice.nextNodeId && !choice.onSelect)) {
        this._debugLog('CONVO: choice branch', { branch: 'end', nodeId, choiceId: choice.id });
        this._logEndConversationClick('player_end', session);
        this.closeConversation('player_end', session);
        return;
      }

      const playerNarration = this._resolvePlayerNarration(choice, session.intent, session.context || {});
      const player = this.gameManager.getPlayerSurvivor?.();
      const formattedNarration = this._formatConversationLine(playerNarration || '', npc, session.context || {}, player);
      if (playerNarration) {
        this._appendConversationHistory(session, 'Player', { narration: formattedNarration }, ['player']);
        session.context.lastSpeaker = 'player';
        session.context.lastPlayerNarration = formattedNarration;
      }

      if (choice.memoryEvent) {
        this._recordStructuredSocialEvent(choice.memoryEvent);
      }

      if (choice.effects) {
        this._applyNodeEffects(session, choice.effects);
      }

      if (choice.npcReply) {
        this._debugLog('CONVO: choice branch', { branch: 'npcReply', nodeId, choiceId: choice.id });
        const replyText = typeof choice.npcReply === 'function'
          ? choice.npcReply(session, this, choice)
          : choice.npcReply;
        const resolved = this._formatConversationLine(replyText || '', npc, session.context || {}, this.gameManager.getPlayerSurvivor?.());
        const nextPayload = typeof choice.next === 'function' ? choice.next(session, this, choice) : choice.next;
        if (typeof nextPayload === 'string') {
          this._debugLog('CONVO: npcReply branch -> next node id', { nextNodeId: nextPayload });
          this._transitionToNode(session, nextPayload);
          return;
        }
        const nextNode = nextPayload && typeof nextPayload === 'object'
          ? nextPayload
          : {
            playerNarration: formattedNarration,
            npcResponse: resolved,
            choices: this._buildDefaultFollowupChoices(session.intent, session.context)
        };
        const nextNodeId = this._registerNode(session, nextNode);
        this._debugLog('CONVO: npcReply branch -> registered node', { nextNodeId });
        this._transitionToNode(session, nextNodeId);
        return;
      }

      if (choice.action) {
        const handled = this._handleNodeAction(session, nodeId, choice);
        if (handled) {
          this._debugLog('CONVO: action branch handled', { action: choice.action });
          return;
        }
      }

      if (choice.responseOption) {
        this._debugLog('CONVO: choice branch', { branch: 'responseOption', nodeId, choiceId: choice.id });
        if (choice.responseOption.requiresAllyPicker) {
          this._debugLog('CONVO: responseOption branch -> requires ally picker', { choiceId: choice.id });
          this._promptTrustedAlly(session, npc, nodeId, choice.responseOption, formattedNarration);
          return;
        }
        if (choice.responseOption.requiresTargetPicker) {
          this._debugLog('CONVO: responseOption branch -> requires target picker', { choiceId: choice.id });
          this._promptPlayerNamedTarget(session, npc, nodeId, choice.responseOption, formattedNarration);
          return;
        }
        let response = null;
        console.log('[CONVO-DEBUG] Choice selected with responseOption', { intent: session.intent, choiceId: choice.id });
        try {
          this._debugLog('CONVO: handleResponse start', {
            intent: session.intent,
            responseOptionKeys: Object.keys(choice.responseOption || {})
          });
          response = this._handleResponse(npc, session.intent, choice.responseOption, session.meeting, session);
          console.log('[CONVO-DEBUG] _handleResponse returned', { hasResponse: !!response, responseKeys: response ? Object.keys(response) : [] });
        } catch (error) {
          console.error('ConversationSystem: responseOption handling failed', error);
          const errorMessage = error?.message || String(error);
          this._renderRecoveryNode(
            session,
            npc,
            `${npc.firstName} blinks. "Uh… something broke. (DEBUG: ${errorMessage})"`,
            'response_option_exception'
          );
          return;
        }
        let { menu, endConversation, action } = response || {};
        const hasOnEnd = typeof endConversation === 'function';
        console.log('[CONVO-DEBUG] Response parsed', { hasMenu: !!menu, menuText: menu?.text?.substring?.(0, 50), menuButtons: menu?.buttons?.length, action, hasOnEnd });
        this._debugLog('CONVO: handleResponse result', {
          hasMenu: !!menu,
          menuKeys: menu ? Object.keys(menu) : [],
          action,
          hasEndConversation: hasOnEnd
        });
        this._debugLog(`CONVO NODE: choice=${choice.id || 'unknown'} intent=${session.intent} hasMenu=${!!menu} hasOnEnd=${hasOnEnd}`);
        session.pendingEndConversation = hasOnEnd ? endConversation : null;
        if (action === 'endConversationNow') {
          console.log('[CONVO-DEBUG] Action: endConversationNow - closing');
          this.endConversation(session);
          return;
        }
        if (action === 'offerDealMenu') {
          console.log('[CONVO-DEBUG] Action: offerDealMenu');
          this._debugLog('CONVO: responseOption branch -> offerDealMenu');
          this._showDealMenu(npc, session.context.location);
          return;
        }
        if (action === 'counterTarget') {
          console.log('[CONVO-DEBUG] Action: counterTarget');
          this._debugLog('CONVO: responseOption branch -> counterTarget');
          return;
        }
        if (!menu) {
          console.warn('[CONVO-DEBUG] No menu - using fallback');
          console.warn('ConversationSystem: Missing menu response for choice.', choice);
          menu = this._buildFallbackResponseMenu({
            npc,
            intent: session.intent,
            context: session.context,
            responseOption: choice.responseOption,
            session,
            reason: 'missing_menu_response'
          });
          this._debugLog('CONVO: responseOption branch -> fallback menu used');
        }
        menu.playerNarration = menu.playerNarration || formattedNarration;
        if (!menu.npcResponse && menu.text) {
          menu.npcResponse = menu.text;
        }
        console.log('[CONVO-DEBUG] Building menu node', { npcResponse: menu.npcResponse?.substring?.(0, 50), buttons: menu.buttons?.length });
        const builtNode = this._buildNodeFromMenu(menu, session.intent, session.context);
        console.log('[CONVO-DEBUG] Built node', { hasChoices: !!builtNode.choices, choicesCount: builtNode.choices?.length });
        const menuNodeId = this._registerNode(session, builtNode);
        console.log('[CONVO-DEBUG] Transitioning to node', { menuNodeId });
        this._debugLog('CONVO: responseOption branch -> registered menu node', { menuNodeId });
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
        this._debugLog('CONVO: choice branch', { branch: 'nextMenu', nodeId, choiceId: choice.id });
        choice.nextMenu.playerNarration = choice.nextMenu.playerNarration || formattedNarration;
        if (!choice.nextMenu.npcResponse && choice.nextMenu.text) {
          choice.nextMenu.npcResponse = choice.nextMenu.text;
        }
        const nextNodeId = this._registerNode(session, this._buildNodeFromMenu(choice.nextMenu, session.intent, session.context));
        this._transitionToNode(session, nextNodeId);
        return;
      }

      if (choice.end) {
        this._debugLog('CONVO: choice branch', { branch: 'end', nodeId, choiceId: choice.id });
        this._logEndConversationClick('player_end', session);
        this._endNodeConversation(session);
        return;
      }

      if (choice.nextNode) {
        this._debugLog('CONVO: choice branch', { branch: 'nextNode', nodeId, choiceId: choice.id });
        const patchedNode = {
          ...choice.nextNode,
          playerNarration: choice.nextNode.playerNarration || formattedNarration,
          npcResponse: choice.nextNode.npcResponse || choice.nextNode.text || null
        };
        const nextNodeId = this._registerNode(session, patchedNode);
        this._transitionToNode(session, nextNodeId);
        return;
      }

      if (choice.nextNodeId) {
        this._debugLog('CONVO: choice branch', { branch: 'nextNodeId', nodeId, choiceId: choice.id });
        this._transitionToNode(session, choice.nextNodeId);
        return;
      }

      console.warn('ConversationSystem: Choice did not advance.', choice);
      this._renderRecoveryNode(session, npc, `${npc.firstName} says, "We can talk about something else."`, 'choice_no_advance');
    } catch (error) {
      console.error('ConversationSystem: handleNodeChoice failed', error);
      const errorMessage = error?.message || String(error);
      const recovered = this._renderRecoveryNode(
        session,
        npc,
        `${npc.firstName} blinks. "Uh… something broke. (DEBUG: ${errorMessage})"`,
        'handle_choice_exception'
      );
      if (!recovered) {
        this.closeConversation('handle_choice_exception', session);
      }
    }
  }

  _transitionToNode(session, nextNodeId) {
    if (!session || !nextNodeId) {
      console.warn('ConversationSystem: Missing nextNodeId during transition.');
      if (session) {
        this._renderRecoveryNode(
          session,
          this._getSurvivorById(session.npcId),
          'They pause. "Let’s circle back."',
          'missing_next_node_id'
        );
      }
      return;
    }
    this._debugLog('CONVO: transition requested', {
      nextNodeId,
      currentNodeId: session.currentNodeId || null
    });
    this._debugBanner('CONVO transition', nextNodeId);
    if (!session.nodes[nextNodeId]) {
      console.warn(`ConversationSystem: Invalid node transition to "${nextNodeId}".`);
      this._renderRecoveryNode(
        session,
        this._getSurvivorById(session.npcId),
        'They glance around. "Let’s switch gears."',
        'invalid_next_node_id'
      );
      return;
    }
    if (session.currentNodeId) {
      session.historyStack.push(session.currentNodeId);
    }
    this._debugLog('CONVO: transition to node', {
      nextNodeId,
      hasNpcResponse: !!session.nodes[nextNodeId]?.npcResponse
    });
    this._renderNode(session, nextNodeId);
  }

  _goBackNode(session) {
    if (!session || session.historyStack.length === 0) return;
    const previousNodeId = session.historyStack.pop();
    this._renderNode(session, previousNodeId);
  }

  closeConversation(reason = 'player_end', session = null) {
    const activeSession = session || this.nodeSession || this.conversationSession;
    const npcId = activeSession?.npcId || this.state?.npcId || null;
    if (this._isConversationDebugEnabled()) {
      const stack = new Error().stack;
      this._debugLog('CONVO: closeConversation called', {
        reason,
        npcId,
        stack
      });
      this._debugBanner('CONVO close', reason);
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
          console.error('ConversationSystem: pendingEndConversation failed during closeConversation.', error);
        }
      }
    } finally {
      this._debugLog(`CONVO END: reason=${reason} onEndCalled=${onEndCalled}`);
      try {
        this._clearOverlay({ reason });
      } catch (error) {
        console.error('ConversationSystem: _clearOverlay failed during closeConversation.', error);
      }
      if (activeSession?.meeting) {
        this.pendingMeetings = this.pendingMeetings.filter(m => m !== activeSession.meeting);
      }

      if (typeof activeSession?.onClose === 'function') {
        try {
          activeSession.onClose(reason, activeSession);
        } catch (error) {
          console.error('ConversationSystem: onClose failed during closeConversation.', error);
        }
      }
      if (typeof this.onConversationEnd === 'function') {
        try {
          this.onConversationEnd(reason, activeSession);
        } catch (error) {
          console.error('ConversationSystem: onConversationEnd failed during closeConversation.', error);
        }
      }

      this.activeConversation = null;
      this.activeConversationContext = null;
      this.nodeSession = null;
      this.conversationSession = null;
      this.state = null;

      if (typeof console !== 'undefined') {
        console.debug('ConversationSystem: closeConversation completed.', { reason, npcId });
      }
    }
  }

  endConversation(session = null) {
    this.closeConversation('endConversation', session);
  }

  _endNodeConversation(session) {
    this.closeConversation('node_end', session);
  }

  _buildNodeFromMenu(menu = {}, intent, context) {
    const buttons = Array.isArray(menu.buttons) && menu.buttons.length
      ? [...menu.buttons]
      : this._buildDefaultFollowupChoices(intent, context);
    const fallbackNpcResponse = this._getNpcFallbackDialogue(intent);

    return {
      text: menu.text || null,
      playerNarration: menu.playerNarration || null,
      npcResponse: menu.npcResponse || menu.text || fallbackNpcResponse,
      additionalText: menu.additionalText || null,
      choices: buttons.map((btn, index) => ({
        id: `menu-choice-${index}`,
        label: btn.label,
        playerLine: btn.playerLine || btn.playerNarration || null,
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
    const socialLog = ensureCampSocialChanges();

    if (effects.relationshipDelta && relationshipSystem && player && npc) {
      relationshipSystem.changeRelationship(player.id, npc.id, effects.relationshipDelta);
      socialLog.relationship.push({ id: npc.id, with: npc.firstName, amount: effects.relationshipDelta, context: effects.context || 'node' });
    }

    if (effects.trustDelta && player && npc) {
      this.gameManager.changeTrust?.(player.id, npc.id, effects.trustDelta, `node:${effects.context || 'conversation'}`);
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
      this._logEndConversationClick('player_end', session);
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
      const targetName = session.context.topicPersonName || session.context.topicPerson;
      const targetId = session.context.topicPersonId || session.context.topicId || session.context.targetId || null;
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
        excludeIds: [session.npcId, session.playerId].filter(Boolean)
      }).then(selectedId => {
        if (!selectedId) {
          this._renderNode(session, nodeId);
          return;
        }
        const pick = this._getSurvivorById(selectedId);
        if (!pick) {
          this._renderNode(session, nodeId);
          return;
        }
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
      });
      return true;
    }

    if (choice.action === 'pickSource') {
      const excludeIds = [session.npcId, session.playerId].filter(Boolean);
      const pickerState = { handled: false };
      const extraOptions = (choice.extraOptions || []).map(option => ({
        ...option,
        onSelect: () => {
          pickerState.handled = true;
          option.onSelect?.();
        }
      }));
      this.promptSurvivorPicker({
        title: choice.pickerTitle || 'Name the source',
        tribeOnly: true,
        excludeIds,
        extraOptions
      }).then(selectedId => {
        if (pickerState.handled) return;
        if (!selectedId) {
          this._renderNode(session, nodeId);
          return;
        }
        const pick = this._getSurvivorById(selectedId);
        if (!pick) {
          this._renderNode(session, nodeId);
          return;
        }
        session.context.sourceId = pick.id;
        session.context.sourceName = pick.firstName;
        session.context.sourceLie = !!choice.lie;
        const nextNode = typeof choice.nextNodeBuilder === 'function'
          ? choice.nextNodeBuilder(pick, session, this)
          : choice.nextNode;
        const nextNodeId = this._registerNode(session, nextNode);
        this._transitionToNode(session, nextNodeId);
      });
      return true;
    }

    if (choice.action === 'floatName') {
      this._promptFloatName(session, nodeId);
      return true;
    }

    return false;
  }

  _buildDefaultFollowupChoices(intent, context = {}) {
    const phase = context.phase || this._getConversationPhase();
    const base = [
      { label: 'Ask a follow-up', playerLine: 'You ask for more specifics.', action: 'askFollowup' }
    ];
    if (phase === 'post') {
      base.push({ label: 'Trade info', playerLine: 'You offer to trade a small piece of info.', action: 'tradeInfo' });
      if ([
        POST_PHASE_INTENTS.talk_specific_person,
        POST_PHASE_INTENTS.ask_intel,
        POST_PHASE_INTENTS.plant_seed,
        POST_PHASE_INTENTS.verify_story
      ].includes(intent)) {
        base.push({ label: 'Pitch a plan', playerLine: 'You ask where the plan is leaning tonight.', action: 'pitchPlan', awaitsPicker: true });
      }
    } else {
      base.push({ label: 'Share a small rumor', playerLine: 'You mention you have heard something too.', action: 'tradeInfo' });
    }
    return base;
  }

  _buildAutoContinuationChoices(session) {
    const context = session?.context || {};
    const npc = this._getSurvivorById(session?.npcId);
    const base = this._buildDefaultFollowupChoices(session?.intent, context);
    const nextNode = {
      npcResponse: npc
        ? this._npcDoes(npc, 'nods', 'nod', '"Alright. We can ease up."')
        : 'They nod. "Alright. We can ease up."',
      choices: this._buildDefaultFollowupChoices(session?.intent, context)
    };
    base.push({
      label: 'Ease off and keep it light',
      playerLine: 'You ease off and keep it light.',
      nextNode
    });
    if ((context.phase || this._getConversationPhase()) === 'post') {
      base.push({
        label: 'Offer a small deal',
        playerLine: 'You float a small deal to keep options open.',
        action: 'offerDealMenu'
      });
    }
    return this._dedupeChoices(base);
  }

  _buildTradeInfoNode(session) {
    const npc = this._getSurvivorById(session.npcId);
    return {
      npcResponse: `${npc?.firstName || 'They'} tilts their head. "Alright. What are you offering?"`,
      choices: [
        {
          label: 'Float a name',
          playerLine: 'You float a name you have heard.',
          effects: { trustDelta: 2, context: 'trade_info' },
          action: 'floatName',
          awaitsPicker: true
        },
        {
          label: 'Offer a small rumor',
          playerLine: 'You share a small rumor about idols.',
          effects: { trustDelta: 1, context: 'trade_info' },
          nextNode: {
            npcResponse: `${npc?.firstName || 'They'} leans in. "Okay, that’s useful."`,
            choices: this._buildDefaultFollowupChoices(session.intent, session.context)
          }
        },
        {
          label: 'Hold back',
          playerLine: 'You decide to hold back for now.',
          effects: { trustDelta: -1, context: 'trade_info' },
          nextNode: {
            npcResponse: `${npc?.firstName || 'They'} exhales. "Then I’ll keep it light too."`,
            choices: this._buildDefaultFollowupChoices(session.intent, session.context)
          }
        }
      ]
    };
  }

  _promptFloatName(session, nodeId) {
    const npc = this._getSurvivorById(session.npcId);
    const excludeIds = [session.npcId, session.playerId].filter(Boolean);
    this.promptSurvivorPicker({
      title: 'Float a name',
      tribeOnly: true,
      excludeIds
    }).then(selectedId => {
      if (!selectedId) {
        this._renderNode(session, nodeId);
        return;
      }
      const pick = this._getSurvivorById(selectedId);
      if (!pick) {
        this._renderNode(session, nodeId);
        return;
      }
      session.context.topicPersonName = pick.firstName;
      session.context.topicPersonId = pick.id;
      session.context.topicPerson = pick.firstName;
      session.context.topicId = pick.id;
      session.context = this._normalizeConversationContext(session.context);

      this._logStrategicMemory({
        type: 'RUMOR_TRADE',
        speakerId: session.playerId || null,
        listenerId: session.npcId,
        subjectId: pick.id,
        sourceId: null,
        confidence: 55,
        phase: session.context.phase || this._getConversationPhase()
      });

      const nextNodeId = this._registerNode(session, {
        playerNarration: session.context.lastPlayerNarration || this._fallbackPlayerNarration(session.intent),
        npcResponse: `${npc?.firstName || 'They'} nods. "That tracks. Keep me posted about ${pick.firstName}."`,
        choices: this._buildDefaultFollowupChoices(session.intent, session.context),
        meta: { speaker: 'npc' }
      });
      this._transitionToNode(session, nextNodeId);
    });
  }

  _promptTrustedAlly(session, npc, nodeId, responseOption, playerNarration) {
    const excludeIds = [session.npcId, session.playerId].filter(Boolean);
    this.promptSurvivorPicker({
      title: 'Name a trusted ally',
      tribeOnly: true,
      excludeIds
    }).then(selectedId => {
      if (!selectedId) {
        this._renderNode(session, nodeId);
        return;
      }
      const pick = this._getSurvivorById(selectedId);
      if (!pick) {
        this._renderNode(session, nodeId);
        return;
      }
      session.context.playerNamedAllyName = pick.firstName;
      session.context.playerNamedAllyId = pick.id;
      session.context = this._normalizeConversationContext(session.context);
      this.activeConversationContext = { ...(this.activeConversationContext || {}), ...session.context };
      this._logStrategicMemory({
        type: 'TRUSTED_ALLY_NAMED',
        speakerId: session.playerId || null,
        listenerId: session.npcId,
        subjectId: pick.id,
        sourceId: null,
        confidence: 70,
        phase: session.context.phase || this._getConversationPhase()
      });
      this._debugLog('CONVO: handleResponse start', {
        intent: session.intent,
        responseOptionKeys: Object.keys(responseOption || {})
      });
      let { menu, endConversation } = this._handleResponse(npc, session.intent, responseOption, session.meeting, session);
      this._debugLog('CONVO: handleResponse result', {
        hasMenu: !!menu,
        menuKeys: menu ? Object.keys(menu) : [],
        hasEndConversation: !!endConversation
      });
      session.pendingEndConversation = typeof endConversation === 'function' ? endConversation : null;
      if (!menu) {
        menu = this._buildFallbackResponseMenu({
          npc,
          intent: session.intent,
          context: session.context,
          responseOption,
          session,
          reason: 'missing_menu_response'
        });
      }
      menu.playerNarration = menu.playerNarration || playerNarration || this._fallbackPlayerNarration(session.intent);
      if (!menu.npcResponse && menu.text) {
        menu.npcResponse = menu.text;
      }
      const menuNodeId = this._registerNode(session, this._buildNodeFromMenu(menu, session.intent, session.context));
      this._transitionToNode(session, menuNodeId);
    });
  }

  _promptPlayerNamedTarget(session, npc, nodeId, responseOption, playerNarration) {
    const excludeIds = [session.npcId, session.playerId].filter(Boolean);
    this.promptSurvivorPicker({
      title: responseOption?.targetPrompt || 'Name who?',
      tribeOnly: true,
      excludeIds
    }).then(selectedId => {
      if (!selectedId) {
        this._renderNode(session, nodeId);
        return;
      }
      const pick = this._getSurvivorById(selectedId);
      if (!pick) {
        this._renderNode(session, nodeId);
        return;
      }
      const patch = {
        topicPersonName: pick.firstName,
        topicPersonId: pick.id,
        topicPerson: pick.firstName,
        topicId: pick.id,
        targetName: pick.firstName,
        targetId: pick.id
      };
      this.activeConversationContext = { ...(this.activeConversationContext || {}), ...patch };
      session.context = this._normalizeConversationContext({ ...(session.context || {}), ...patch });

      this._debugLog('CONVO: handleResponse start', {
        intent: session.intent,
        responseOptionKeys: Object.keys(responseOption || {})
      });
      const { menu, endConversation } = this._handleResponse(npc, session.intent, responseOption, session.meeting, session);
      this._debugLog('CONVO: handleResponse result', {
        hasMenu: !!menu,
        menuKeys: menu ? Object.keys(menu) : [],
        hasEndConversation: !!endConversation
      });
      session.pendingEndConversation = typeof endConversation === 'function' ? endConversation : null;
      if (!menu) {
        this._renderRecoveryNode(session, npc, `${npc.firstName} says, "Let’s reset that."`);
        return;
      }
      menu.playerNarration = menu.playerNarration || playerNarration || this._fallbackPlayerNarration(session.intent);
      if (!menu.npcResponse && menu.text) {
        menu.npcResponse = menu.text;
      }
      const menuNodeId = this._registerNode(session, this._buildNodeFromMenu(menu, session.intent, session.context));
      this._transitionToNode(session, menuNodeId);
    });
  }

  _buildDetailNode(session) {
    const npc = this._getSurvivorById(session.npcId);
    const player = this.gameManager.getPlayerSurvivor?.();
    const context = session.context || {};
    const phase = context.phase || this._getConversationPhase();
    const targetName = context.topicPersonName || context.topicPerson || context.targetName || this._pickTargetName(npc, context) || 'someone';
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
          npcDisclosureOutcome: rumor.disclosure?.mode || 'dodge',
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
    return Math.round(this.gameManager.getTrust?.(player?.id, npc?.id) ?? 50);
  }

  _resolveDisclosure({ npc, player, targetId = null, topic = 'general', pressureLevel = 0, context = {} }) {
    const trustScore = this._getTrustScore(npc, player);
    const style = this._classifyStyle(npc);
    const targetRel = targetId ? (this._relationshipBetween(npc?.id, targetId) || 50) : 50;
    const memory = this.gameManager.systems?.socialMemorySystem;
    const npcMemory = this._getNpcMemoryEntry(npc);
    const dangerTopics = new Set(['idol', 'idol_suspicion', 'voteTonight', 'drivingVote', 'target', 'deal', 'nameMentionedPlayer', 'intel_detail', 'warning']);
    const isDanger = dangerTopics.has(topic);
    const repeated = targetId ? memory?.hasTalkedAboutTargetRecently?.(npc?.id, targetId) : false;
    const lastDisclosure = npcMemory?.lastDisclosureByKind?.[topic] || 0;
    const fatigue = repeated || (Date.now() - lastDisclosure < 120000);

    const trustFactor = trustScore / 100;
    const pressureFactor = Math.max(0, Math.min(1, pressureLevel));
    const dangerFactor = isDanger ? 0.25 : 0.05;
    const closenessFactor = targetRel > 70 ? 0.2 : targetRel < 40 ? -0.1 : 0;
    const styleBias = (style.isVillain ? 0.18 : 0)
      + (style.isStrategist ? 0.1 : 0)
      - (style.isSocial ? 0.05 : 0)
      - (style.isWildcard ? 0.02 : 0);

    let truthChance = 0.45 + (trustFactor - 0.5) * 0.6 - dangerFactor - closenessFactor - styleBias;
    let partialChance = 0.25 + pressureFactor * 0.2 + (trustFactor - 0.5) * 0.2 - styleBias * 0.5;
    let dodgeChance = 0.2 + dangerFactor + (fatigue ? 0.15 : 0) + (0.5 - trustFactor) * 0.3 + styleBias * 0.4;
    let lieChance = 0.1 + (0.5 - trustFactor) * 0.3 + styleBias * 0.5 + (closenessFactor > 0 ? 0.1 : 0);
    let counterChance = pressureFactor > 0.5 ? 0.08 + (0.5 - trustFactor) * 0.2 : 0.04;

    const clamp = value => Math.max(0, value);
    truthChance = clamp(truthChance);
    partialChance = clamp(partialChance);
    dodgeChance = clamp(dodgeChance);
    lieChance = clamp(lieChance);
    counterChance = clamp(counterChance);

    const total = truthChance + partialChance + dodgeChance + lieChance + counterChance;
    const roll = Math.random() * total;
    let mode = 'dodge';
    if (roll < truthChance) {
      mode = 'truth';
    } else if (roll < truthChance + partialChance) {
      mode = 'partial';
    } else if (roll < truthChance + partialChance + dodgeChance) {
      mode = 'dodge';
    } else if (roll < truthChance + partialChance + dodgeChance + lieChance) {
      mode = 'lie';
    } else {
      mode = 'counter';
    }

    const availableTargets = context.availableTargets || this._getAvailableTargetNames(npc);
    const trueTarget = context.trueTarget || context.topicPerson || context.targetName || null;
    let claimedTarget = trueTarget;
    let redirectName = null;

    if (mode === 'lie') {
      const filtered = availableTargets.filter(name => name && name !== trueTarget);
      claimedTarget = filtered.length ? filtered[getRandomInt(0, filtered.length - 1)] : trueTarget || null;
    }

    if (mode === 'dodge') {
      claimedTarget = null;
    }

    const locations = ['water well', 'shelter', 'firewood pile', 'beach', 'tree mail', 'jungle path'];
    const reasons = ['challenge threat', 'social threat', 'idol fear', 'revenge', 'outsider'];
    const motive = context.reason || reasons[getRandomInt(0, reasons.length - 1)];
    const location = context.location || locations[getRandomInt(0, locations.length - 1)];
    const timeHint = ['early this morning', 'right after the challenge', 'last night', 'during water runs'][getRandomInt(0, 3)];

    if (mode === 'lie' && claimedTarget && trueTarget && claimedTarget !== trueTarget) {
      redirectName = trueTarget;
    }

    const detail = {
      motive,
      location,
      timeHint,
      pusherName: mode === 'dodge' ? null : (context.pusherName || claimedTarget),
      redirectName,
      demand: trustScore < 45 ? 'trade' : null
    };

    const confidence = Math.max(0.05, Math.min(0.95, trustFactor + (mode === 'truth' ? 0.2 : mode === 'lie' ? -0.2 : -0.05)));
    if (npcMemory) {
      npcMemory.lastDisclosureByKind = { ...(npcMemory.lastDisclosureByKind || {}), [topic]: Date.now() };
    }

    return { mode, confidence, claimedTarget, trueTarget, detail };
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
    const disclosure = this._resolveDisclosure({
      npc,
      player,
      targetId,
      topic: 'warning',
      context: {
        trueTarget: targetName,
        availableTargets,
        reason: context.reason || null,
        location: context.location || null
      }
    });
    const confidence = disclosure.mode === 'truth' ? 75 : disclosure.mode === 'lie' ? 35 : 45;
    const reason = disclosure.detail?.motive || context.reason || 'social threat';
    const pusherName = disclosure.mode === 'dodge' ? null : disclosure.detail?.pusherName;
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

    if (rumor.disclosure?.mode === 'dodge') {
      return `${npc?.firstName || 'They'} lowers their voice. "I can’t burn names, but ${picked.join(' and ')}."`;
    }
    if (rumor.disclosure?.mode === 'lie') {
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
        return `${npc?.firstName || 'They'} answers, "It came up at the ${context.location || LocationKeys.SHELTER}. ${targetName} was floated because of ${targetRel < 45 ? 'trust issues' : 'challenge worries'}."`;
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
    const targetName = context.topicPersonName || context.topicPerson || context.targetName || this._pickTargetName(npc, context) || 'someone';
    const disclosure = this._resolveDisclosure({
      npc,
      player: this.gameManager.getPlayerSurvivor?.(),
      targetId: context.topicId || context.targetId || this._getSurvivorByName(targetName)?.id || null,
      topic: 'intel_detail',
      context: {
        trueTarget: targetName,
        availableTargets: this._getAvailableTargetNames(npc),
        location: context.location
      }
    });

    if (disclosure.mode === 'truth') {
      return `${npc?.firstName || 'They'} says, "It’s coming from ${disclosure.detail?.pusherName || 'a couple people'} near the ${disclosure.detail?.location || LocationKeys.SHELTER}."`;
    }
    if (disclosure.mode === 'lie') {
      return `${npc?.firstName || 'They'} claims, "It’s ${disclosure.detail?.pusherName || 'one person'} pushing it after the challenge."`;
    }
    return `${npc?.firstName || 'They'} says, "I’m not naming names, but watch who keeps peeling off with ${targetName}."`;
  }

  getDisclosureBehavior(npc, player = null, context = {}) {
    const relationshipScore = this._getRelationshipScore(npc) || 50;
    const trustScore = player ? this._getTrustScore(npc, player) : relationshipScore;
    const style = this._classifyStyle(npc);
    const paranoia = context.paranoiaLevel ?? (npc?.paranoia || 0);
    const phase = context.phase || this._getConversationPhase();

    const risk = phase === GamePhase.POST_CHALLENGE ? 0.2 : 0.1;
    let truthChance = 0.35 + (trustScore - 50) / 200 - risk;
    let partialChance = 0.25 + (trustScore - 50) / 300;
    let dodgeChance = 0.25 + (paranoia / 200) + risk;
    let lieChance = 0.15 + (style.isVillain ? 0.1 : 0) + (style.isStrategist ? 0.05 : 0);

    if (style.isLoyal || style.isHero) {
      truthChance += 0.1;
      lieChance -= 0.08;
    }

    const total = Math.max(0.01, truthChance + partialChance + dodgeChance + lieChance);
    truthChance /= total;
    partialChance /= total;
    dodgeChance /= total;
    lieChance /= total;

    const roll = Math.random();
    if (roll < truthChance) return 'truth';
    if (roll < truthChance + partialChance) return 'partial';
    if (roll < truthChance + partialChance + dodgeChance) return 'dodge';
    return 'lie';
  }

  _getFallbackNpcResponseLine(intent, context = {}) {
    const suspiciousIntents = new Set([
      POST_PHASE_INTENTS.ask_intel,
      POST_PHASE_INTENTS.idol_suspicion,
      POST_PHASE_INTENTS.pitch_target,
      POST_PHASE_INTENTS.deflect_target,
      POST_PHASE_INTENTS.verify_story,
      POST_PHASE_INTENTS.plant_seed,
      POST_PHASE_INTENTS.talk_specific_person,
      PRE_PHASE_INTENTS.light_strategy,
      PRE_PHASE_INTENTS.confront_rumor,
      'gossip',
      'warning',
      'confrontation',
      'hardStrategy',
      'deal'
    ]);
    if (suspiciousIntents.has(intent) || context.subTopic === 'idol' || context.socialType === 'idolSuspicion') {
      return 'Why are you digging for that right now?';
    }
    const fallbackLines = [
      'I’m trying to stay focused right now. Hit me with something simple.',
      'Not sure I have a read on that yet. What else?'
    ];
    return fallbackLines[getRandomInt(0, fallbackLines.length - 1)];
  }

  _logResponseFallback({ intent, responseOption, responseMode, reason, error } = {}) {
    const payload = {
      intent: intent || null,
      responseOptionKeys: Object.keys(responseOption || {}),
      responseMode: responseMode || null,
      reason,
      error: error?.message || null
    };
    if (this._isConversationDebugEnabled()) {
      this._debugLog('CONVO: fallback response used', payload);
      this._debugBanner('CONVO fallback', reason || 'unknown');
    } else {
      console.warn('ConversationSystem: fallback response used.', payload);
    }
  }

  _buildFallbackResponseMenu({ npc, intent, context = {}, responseOption = {}, session = null, reason = 'unknown', responseMode = null, error = null } = {}) {
    const npcResponse = this._getFallbackNpcResponseLine(intent, context);
    if (session) {
      this._applyNodeEffects(session, { suspicionDelta: 1, context: 'fallback_response' });
    }
    this._logResponseFallback({ intent, responseOption, responseMode, reason, error });
    return {
      text: npcResponse,
      npcResponse,
      additionalText: 'Outcome: No strong read gained.',
      buttons: [
        { label: 'Ask something else', playerLine: 'You pivot to another topic.', action: 'changeTopic' },
        { label: 'End chat', playerLine: 'You decide to wrap it up.', action: 'endConversation' }
      ]
    };
  }

  _handleResponse(survivor, intent, option, meeting, session) {
    const player = this.gameManager.getPlayerSurvivor?.();
    const relationshipSystem = this.gameManager.systems?.relationshipSystem;
    const socialLog = ensureCampSocialChanges();
    const context = this._normalizeConversationContext({ ...(this.activeConversationContext || {}) });
    const subjectId = context.targetId || context.topicPersonId || context.topicId || this._getSurvivorByName(context.topicPersonName || context.topicPerson)?.id || null;
    const responseOption = option || {};
    const responseMode = responseOption.responseMode || responseOption.mode || responseOption.responseModes?.[0] || null;

    if (responseOption?.action === 'offerDealMenu') {
      return { action: 'offerDealMenu' };
    }

    const applyContextPatch = patch => {
      if (!patch) return;
      this.activeConversationContext = this._normalizeConversationContext({ ...(this.activeConversationContext || {}), ...patch });
    };

    let finalDealOutcome = null;

    const endConversation = () => {
      this._logConversationOutcome(survivor, intent, responseOption, meeting, this.activeConversationContext || context, finalDealOutcome);
    };

    if (!responseOption || Object.keys(responseOption).length === 0) {
      const menu = this._buildFallbackResponseMenu({
        npc: survivor,
        intent,
        context,
        responseOption,
        session,
        reason: 'missing_response_option',
        responseMode
      });
      return { menu, endConversation };
    }

    if (intent === 'allianceInvite') {
      const menu = this._handleAllianceInviteResponse({
        survivor,
        option: responseOption,
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

    if (subjectId || targetName) {
      this._logStrategicMemory({
        type: 'NAMED_TARGET',
        speakerId: player?.id || null,
        listenerId: survivor.id,
        subjectId: subjectId || null,
        confidence: 60,
        phase: context.phase || this._getConversationPhase()
      });
    }

    if (this._isDealIntent(intent)) {
      this._logStrategicMemory({
        type: 'DEAL_PROPOSAL',
        speakerId: player?.id || null,
        listenerId: survivor.id,
        subjectId: subjectId || null,
        confidence: 65,
        phase: context.phase || this._getConversationPhase()
      });
    }

    if (intent === POST_PHASE_INTENTS.idol_suspicion || context.subTopic === 'idol') {
      this._logStrategicMemory({
        type: 'IDOL_SUSPICION',
        speakerId: player?.id || null,
        listenerId: survivor.id,
        subjectId: subjectId || null,
        confidence: Math.min(80, this._getTrustScore(survivor, player)),
        phase: context.phase || this._getConversationPhase()
      });
    }

    const baseDelta = this._getIntentRelationshipDelta(intent, npcStance);
    let appliedDelta = typeof responseOption.delta === 'number' ? responseOption.delta : baseDelta;
    if ([PRE_PHASE_INTENTS.bond_smalltalk, PRE_PHASE_INTENTS.bond_personal].includes(intent) || context.socialType === 'bonding') {
      appliedDelta = typeof appliedDelta === 'number'
        ? Math.min(6, Math.max(2, appliedDelta))
        : getRandomInt(2, 6);
    }

    if (player && relationshipSystem && typeof relationshipSystem.changeRelationship === 'function' && typeof survivor?.id !== 'undefined') {
      relationshipSystem.changeRelationship(player.id, survivor.id, appliedDelta || 0);
    }

    const relationshipDelta = typeof responseOption.relationshipDelta === 'number'
      ? responseOption.relationshipDelta
      : (typeof appliedDelta === 'number' ? appliedDelta : (typeof baseDelta === 'number' ? baseDelta : null));

    if (relationshipDelta !== null) {
      socialLog.relationship.push({
        id: survivor.id,
        with: survivor.firstName,
        amount: relationshipDelta,
        context: context?.intent || intent || 'interaction'
      });
    }

    const trustDelta = typeof responseOption.trustDelta === 'number'
      ? responseOption.trustDelta
      : (intent === 'trust' && typeof appliedDelta === 'number' ? appliedDelta : null);

    if (trustDelta !== null) {
      socialLog.trust.push({
        id: survivor.id,
        with: survivor.firstName,
        amount: trustDelta,
        context: context?.intent || intent || 'interaction'
      });
    }

    const suspicionDelta = typeof responseOption.suspicionDelta === 'number'
      ? responseOption.suspicionDelta
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

    this._shiftMood(survivor.id, responseOption.mood);
    this._rememberConversation(survivor, intent, responseOption, meeting);

    if ((intent === POST_PHASE_INTENTS.idol_suspicion || context.socialType === 'idolSuspicion') && player && relationshipSystem?.changeRelationship) {
      const penalty = -getRandomInt(1, 3);
      relationshipSystem.changeRelationship(player.id, survivor.id, penalty);
      socialLog.relationship.push({
        id: survivor.id,
        with: survivor.firstName,
        amount: penalty,
        context: 'idolSuspicion'
      });
    }

    try {
      let followupText = responseOption.followup || this._pickNpcResponse(intent, npcStance, {
        subjectName: targetName,
        npcName: survivor.firstName
      }, survivor);
      if (!followupText) {
        const menu = this._buildFallbackResponseMenu({
          npc: survivor,
          intent,
          context,
          responseOption,
          session,
          reason: 'template_bank_empty',
          responseMode
        });
        return { menu, endConversation };
      }
      followupText = followupText
        .replace('{npc}', survivor.firstName)
        .replace('{target}', targetName || 'someone')
        .replace('{ally}', allyName || 'someone')
        .replace('{dealTopic}', dealTopic)
        .replace('{subjectName}', targetName || 'someone');
      followupText = this._ensureNpcReplyLine(followupText, survivor, npcStance, {
        subjectName: targetName,
        npcName: survivor.firstName
      }, intent);

      const honestyRoll = this._npcHonestyCheck(survivor);

      const dealOutcome = this._isDealIntent(intent)
        ? this._evaluateDealResponse(survivor, context, responseOption)
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

      if (dealOutcome || responseOption.dealResult) {
        const dealStatus = dealOutcome?.status || responseOption.dealResult;
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

      if (context?.topicPerson && responseOption.gossipEffect) {
        socialLog.gossip.push({
          id: survivor.id,
          with: survivor.firstName,
          about: context.topicPerson,
          effect: responseOption.gossipEffect
        });
      }

      if (responseOption.memoryTags && responseOption.memoryTags.length > 0) {
        socialLog.memory.push({
          id: survivor.id,
          with: survivor.firstName,
          tags: responseOption.memoryTags.slice()
        });
        const socialMemory = this.gameManager.systems?.socialMemory || this.gameManager.systems?.socialMemorySystem;
        responseOption.memoryTags.forEach(t => {
          socialMemory?.storeMemory?.(
            survivor.id,
            t,
            { fromPlayer: true }
          );
        });
      }

      if (responseOption.voteShift) {
        socialLog.voteShifts.push({
          id: survivor.id,
          with: survivor.firstName,
          target: responseOption.voteShift.target,
          weight: responseOption.voteShift.weight
        });
      }

      let menu = {
        text: responseOption.nextMenu?.text || followupText,
        npcResponse: responseOption.nextMenu?.npcResponse || responseOption.nextMenu?.text || followupText,
        buttons: responseOption.nextMenu?.buttons || this._buildDefaultFollowupChoices(intent, context)
      };

      const wantsDetail = typeof responseOption.label === 'string'
        && /more detail|press for detail|ask for detail/i.test(responseOption.label);
      if (wantsDetail && session) {
        const detailNode = this._buildDetailNode(session);
        menu = { text: detailNode.text, buttons: detailNode.choices || this._buildDefaultFollowupChoices(intent, context) };
      }

      if (responseOption.nextContextPatch) {
        applyContextPatch(responseOption.nextContextPatch);
      }

      if (responseOption.disclosureKind) {
        const npcMemory = this._getNpcMemoryEntry(survivor, session);
        const pool = (this.gameManager.getPlayerTribe?.()?.members || this.gameManager.survivors || [])
          .filter(s => s.firstName !== survivor.firstName && !s.isPlayer)
          .map(s => s.firstName);
        const lastDisclosure = npcMemory?.lastDisclosureByKind?.[responseOption.disclosureKind] || null;
        const now = Date.now();
        const lastAskedAt = npcMemory?.lastIntentAsked?.[responseOption.disclosureKind] || 0;
        const trustScore = this._getTrustScore(survivor, player);
        const isRepeat = !!(lastDisclosure && now - lastAskedAt < 1000 * 60 * 10);
        let disclosure = null;
        let claimTarget = null;
        let outcome = null;

        if (isRepeat && lastDisclosure) {
          claimTarget = lastDisclosure.claimedTarget || null;
          outcome = lastDisclosure.outcome;
          if (outcome === 'evade') outcome = 'dodge';
          if (outcome === 'dodge' && trustScore > 70 && !lastDisclosure.upgraded) {
            disclosure = this._resolveDisclosure({
              npc: survivor,
              player,
              targetId: this._getSurvivorByName(targetName)?.id || null,
              topic: responseOption.disclosureKind,
              context: { ...context, trueTarget: targetName, availableTargets: pool, relationshipSystem }
            });
            claimTarget = disclosure.claimedTarget || null;
            outcome = disclosure.mode;
            lastDisclosure.upgraded = true;
            menu.text = `${survivor.firstName} hesitates, then relents. "Alright… if I had to say, ${claimTarget || 'someone'}."`;
          } else if (outcome === 'dodge') {
            menu.text = `${survivor.firstName} shakes their head. "Same answer. I’m not naming names."`;
          } else if (outcome === 'lie') {
            menu.text = `${survivor.firstName} keeps it flat. "I already told you — ${claimTarget || 'someone'}."`;
          } else {
            menu.text = `${survivor.firstName} gives you a look. "I already told you — ${claimTarget || 'someone'}."`;
          }
        }

        if (!menu.text) {
          disclosure = disclosure || this._resolveDisclosure({
            npc: survivor,
            player,
            targetId: this._getSurvivorByName(targetName)?.id || null,
            topic: responseOption.disclosureKind,
            context: { ...context, trueTarget: targetName, availableTargets: pool, relationshipSystem }
          });
          claimTarget = disclosure.claimedTarget || null;
          outcome = disclosure.mode;

          if (outcome === 'truth') {
            menu.text = `${survivor.firstName} lowers their voice. "If it's me, it's ${claimTarget || 'someone'}."`;
          } else if (outcome === 'lie') {
            menu.text = `${survivor.firstName} glances around. "Honestly? ${claimTarget || 'someone'}."`;
          } else {
            menu.text = `${survivor.firstName} shakes their head. "I'm not putting names out yet."`;
          }
        }

        menu.npcResponse = menu.text;

        if (claimTarget) {
          applyContextPatch({ topicPerson: claimTarget });
        }

        if (disclosure) {
          this.gameManager.systems?.socialMemorySystem?.recordIntel?.({
            from: survivor.firstName,
            kind: 'targetClaim',
            claimedTarget: disclosure.claimedTarget,
            outcome: disclosure.mode,
            day: this.gameManager.getCurrentDay?.(),
            verified: false
          });
        }

        if (npcMemory) {
          npcMemory.lastDisclosureByKind = { ...(npcMemory.lastDisclosureByKind || {}), [responseOption.disclosureKind]: {
            outcome: outcome || disclosure?.mode || 'dodge',
            claimedTarget: claimTarget || null,
            timestamp: now,
            upgraded: lastDisclosure?.upgraded || false
          } };
          npcMemory.lastIntentAsked = { ...(npcMemory.lastIntentAsked || {}), [responseOption.disclosureKind]: now };
          if (claimTarget) {
            npcMemory.eyeTargetName = claimTarget;
          }
        }

        const followButtons = (outcome || disclosure?.mode) === 'dodge'
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
              { label: 'Counter with another target', onSelect: () => this._handleCounterTarget(survivor, meeting, context, session), end: false, awaitsPicker: true },
              { label: 'End conversation', alt: true, end: true }
            ];

        menu = { text: menu.text, npcResponse: menu.text, buttons: followButtons };
      }

      if (responseOption.requiresCounterTarget) {
        this._handleCounterTarget(survivor, meeting, context, session);
        return { action: 'counterTarget' };
      }

      if (dealOutcome && dealOutcome.counter) {
        menu.additionalText = dealOutcome.counter;
      }

      if (!menu || (!menu.text && !menu.npcResponse)) {
        menu = this._buildFallbackResponseMenu({
          npc: survivor,
          intent,
          context,
          responseOption,
          session,
          reason: 'missing_menu_content',
          responseMode
        });
      }

      return { menu, endConversation };
    } catch (error) {
      console.error('ConversationSystem: NPC response build failed', error);
      const menu = this._buildFallbackResponseMenu({
        npc: survivor,
        intent,
        context,
        responseOption,
        session,
        reason: 'exception',
        responseMode,
        error
      });
      return { menu, endConversation };
    }
  }

  _evaluateCounterPitch(npc, context = {}) {
    const player = this.gameManager.getPlayerSurvivor?.();
    const relationship = this._relationshipBetween(player?.id, npc?.id) || 50;
    const memory = this.gameManager.systems?.socialMemorySystem;
    const trustScore = this.gameManager.getTrust?.(player?.id, npc?.id) ?? 50;
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

  _handleCounterTarget(survivor, meeting, context = {}, session = null) {
    const player = this.gameManager.getPlayerSurvivor?.();
    const relationshipSystem = this.gameManager.systems?.relationshipSystem;
    const socialMemory = this.gameManager.systems?.socialMemorySystem;
    const socialLog = ensureCampSocialChanges();
    const originalTargetName = context.npcProposedTargetName || context.topicPerson || context.targetName || null;
    if (session) {
      session.counter = {
        ...(session.counter || {}),
        originalTargetName
      };
    }
    const exclude = [survivor.id];
    if (player?.id) exclude.push(player.id);
    if (context.npcProposedTargetId) exclude.push(context.npcProposedTargetId);
    if (context.topicId) exclude.push(context.topicId);
    if (context.targetId) exclude.push(context.targetId);
    if (context.topicPerson) {
      const proposed = this._getSurvivorByName(context.topicPerson);
      if (proposed?.id) exclude.push(proposed.id);
    }
    if (context.npcProposedTargetName) {
      const proposed = this._getSurvivorByName(context.npcProposedTargetName);
      if (proposed?.id) exclude.push(proposed.id);
    }
    if (originalTargetName) {
      const proposed = this._getSurvivorByName(originalTargetName);
      if (proposed?.id) exclude.push(proposed.id);
    }

    this.promptSurvivorPicker({
      title: 'Counter with who?',
      tribeOnly: true,
      excludeIds: exclude
    }).then(selectedId => {
      if (!selectedId) {
        if (session?.currentNodeId) {
          this._renderNode(session, session.currentNodeId);
        }
        return;
      }
      const pick = this._getSurvivorById(selectedId);
      if (!pick) {
        if (session?.currentNodeId) {
          this._renderNode(session, session.currentNodeId);
        }
        return;
      }
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

        if (typeof reaction.trustDelta === 'number' && player) {
          this.gameManager.changeTrust?.(player.id, survivor.id, reaction.trustDelta, 'counter_pitch');
          socialLog.trust.push({ id: survivor.id, with: survivor.firstName, amount: reaction.trustDelta, context: 'counter_pitch' });
        }

        if (typeof reaction.reliabilityDelta === 'number') {
          socialMemory?.adjustReliability?.(survivor.id, reaction.reliabilityDelta);
          socialLog.reliability.push({ id: survivor.id, with: survivor.firstName, amount: reaction.reliabilityDelta, context: 'counter_pitch' });
        }

        if (session) {
          const counterNarration = `You tell ${survivor.firstName} you’d rather go with ${pick.firstName}.`;
          this._appendConversationHistory(session, 'Player', counterNarration, ['player']);
          session.context.lastSpeaker = 'player';
          session.context.lastPlayerNarration = counterNarration;
        }

        this._recordMention({
          speaker: survivor.firstName,
          about: pick.firstName,
          context: 'counter_target',
          tone: mapToneFromOutcome(reaction.outcome)
        });

        const endConversation = () => {
          this._logConversationOutcome(survivor, 'counter_followup', { label: `counter_${reaction.outcome}` }, meeting, this.activeConversationContext, null);
        };

        if (session) {
          session.counter = {
            ...(session.counter || {}),
            counterTargetName: pick.firstName
          };
          const followupNode = {
            playerNarration: session.context.lastPlayerNarration || this._fallbackPlayerNarration('counter_followup'),
            npcResponse: reaction.npcLine,
            choices: [
              {
                label: 'Lock it in and move on',
                playerLine: 'You lock it in and move on.',
                npcReply: () => this._applyCounterCommit({ session, npc: survivor, counterTargetName: pick.firstName })
              },
              {
                label: 'Leave it open for now',
                alt: true,
                playerLine: 'You leave it open for now.',
                npcReply: () => this._applyCounterLeaveOpen({ session, npc: survivor, counterTargetName: pick.firstName })
              }
            ],
            meta: { speaker: 'npc' }
          };
          const followNodeId = this._registerNode(session, followupNode);
          this._transitionToNode(session, followNodeId);
          return;
        }

        const activeSession = session || this.nodeSession || this.conversationSession;
        if (activeSession) {
          activeSession.pendingEndConversation = endConversation;
          this.endConversation(activeSession);
          return;
        }
        endConversation();
      });
  }

  _applyCounterCommit({ session, npc, counterTargetName }) {
    try {
      if (!npc || !counterTargetName) {
        return `${npc?.firstName || 'They'} nods. "Alright."`;
      }
      const player = this.gameManager.getPlayerSurvivor?.();
      const relationshipSystem = this.gameManager.systems?.relationshipSystem;
      const socialMemory = this.gameManager.systems?.socialMemorySystem;
      const socialLog = ensureCampSocialChanges();
      const npcMemory = this._getNpcMemoryEntry(npc, session);

      if (session) {
        session.counter = {
          ...(session.counter || {}),
          counterTargetName,
          status: 'locked'
        };
      }

      if (npcMemory) {
        npcMemory.currentPlan = { target: counterTargetName, status: 'locked', updatedAt: Date.now() };
        if (!npcMemory.lastDiscussedNames.includes(counterTargetName)) {
          npcMemory.lastDiscussedNames.push(counterTargetName);
        }
      }

      if (player && relationshipSystem) {
        relationshipSystem.changeRelationship?.(player.id, npc.id, 2);
        socialLog.relationship.push({ id: npc.id, with: npc.firstName, amount: 2, context: 'counter_lock' });
      }
      if (player) {
        this.gameManager.changeTrust?.(player.id, npc.id, 3, 'counter_lock');
      }
      socialMemory?.adjustReliability?.(npc.id, 2);
      socialLog.trust.push({ id: npc.id, with: npc.firstName, amount: 3, context: 'counter_lock' });
      socialLog.reliability.push({ id: npc.id, with: npc.firstName, amount: 2, context: 'counter_lock' });

      return `${npc.firstName} nods. "Alright. We’re locked on ${counterTargetName}."`;
    } catch (error) {
      console.error('ConversationSystem: counter commit failed', error);
      return `${npc?.firstName || 'They'} exhales. "Okay. We’ll see where it goes."`;
    }
  }

  _applyCounterLeaveOpen({ session, npc, counterTargetName }) {
    try {
      if (!npc || !counterTargetName) {
        return `${npc?.firstName || 'They'} nods. "Alright."`;
      }
      const player = this.gameManager.getPlayerSurvivor?.();
      const relationshipSystem = this.gameManager.systems?.relationshipSystem;
      const socialMemory = this.gameManager.systems?.socialMemorySystem;
      const socialLog = ensureCampSocialChanges();
      const npcMemory = this._getNpcMemoryEntry(npc, session);
      const personality = (npc?.personality || npc?.gameplayStyle || '').toLowerCase();
      const likesFlex = personality.includes('strateg') || personality.includes('wildcard');
      const trustDelta = likesFlex ? 1 : -2;
      const reliabilityDelta = likesFlex ? 1 : -1;

      if (session) {
        session.counter = {
          ...(session.counter || {}),
          counterTargetName,
          status: 'tentative'
        };
      }

      if (npcMemory) {
        npcMemory.currentPlan = { target: counterTargetName, status: 'tentative', updatedAt: Date.now() };
        if (!npcMemory.lastDiscussedNames.includes(counterTargetName)) {
          npcMemory.lastDiscussedNames.push(counterTargetName);
        }
      }

      if (player && relationshipSystem) {
        relationshipSystem.changeRelationship?.(player.id, npc.id, trustDelta > 0 ? 1 : -1);
        socialLog.relationship.push({ id: npc.id, with: npc.firstName, amount: trustDelta > 0 ? 1 : -1, context: 'counter_tentative' });
      }
      if (typeof trustDelta === 'number' && player) {
        this.gameManager.changeTrust?.(player.id, npc.id, trustDelta, 'counter_tentative');
        socialLog.trust.push({ id: npc.id, with: npc.firstName, amount: trustDelta, context: 'counter_tentative' });
      }
      if (typeof reliabilityDelta === 'number') {
        socialMemory?.adjustReliability?.(npc.id, reliabilityDelta);
        socialLog.reliability.push({ id: npc.id, with: npc.firstName, amount: reliabilityDelta, context: 'counter_tentative' });
      }

      return likesFlex
        ? `${npc.firstName} nods. "We’ll keep it fluid, but I’m in."`
        : `${npc.firstName} hesitates. "Alright… but I don’t love staying vague."`;
    } catch (error) {
      console.error('ConversationSystem: counter tentative failed', error);
      return `${npc?.firstName || 'They'} nods slowly. "We’ll keep it open for now."`;
    }
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
        excludeIds: exclude
      }).then(selectedId => {
        if (!selectedId) {
          this._startConversation(survivor, {
            intentOverride: 'allianceInvite',
            location,
            context: { ...(this.activeConversationContext || {}), initiator: this.activeConversationContext?.initiator || 'npc' }
          });
          return;
        }
        const pick = this._getSurvivorById(selectedId);
        if (!pick) {
          this._startConversation(survivor, {
            intentOverride: 'allianceInvite',
            location,
            context: { ...(this.activeConversationContext || {}), initiator: this.activeConversationContext?.initiator || 'npc' }
          });
          return;
        }
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

  _buildOverlayShell(survivor, { reuse = false } = {}) {
    if (
      reuse
      && this.activeOverlay
      && document.body.contains(this.activeOverlay)
      && (this._activeOverlayNpcId === survivor?.id || !survivor?.id)
    ) {
      return this.activeOverlay;
    }
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
    const content = createElement('div', { className: 'conversation-content', style: { width: '100%' } });
    center.appendChild(content);
    overlay.appendChild(center);
    document.body.appendChild(overlay);

    this.activeOverlay = overlay;
    this._activeOverlayNpcId = survivor?.id || null;
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
        fontWeight: 'bold',
        whiteSpace: 'pre-line'
      }
    });
    if (typeof text === 'string' && text.includes('<br>')) {
      textEl.innerHTML = text;
    } else {
      textEl.textContent = text;
    }

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

  _debugLog(message, payload = null) {
    if (!this._isConversationDebugEnabled()) return;
    if (typeof console === 'undefined') return;
    if (payload !== null && payload !== undefined) {
      console.debug(message, payload);
      return;
    }
    console.debug(message);
  }

  _debugBanner(message, detail = '') {
    if (!this._isConversationDebugEnabled()) return;
    if (typeof window === 'undefined') return;
    if (typeof window.debugBanner !== 'function') return;
    window.debugBanner(message, detail);
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
      case 'challengeDebrief':
        return POST_PHASE_INTENTS.challenge_debrief;
      case 'dealMaking':
        return POST_PHASE_INTENTS.offer_deal_vote_together;
      case 'informationPlay':
        return POST_PHASE_INTENTS.ask_intel;
      case 'idolTalk':
      case 'idolSuspicion':
        return POST_PHASE_INTENTS.idol_suspicion;
      case 'allianceInvite':
        return 'allianceInvite';
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
    if (intent === POST_PHASE_INTENTS.challenge_debrief) {
      return this._buildChallengeDebriefDialogue(survivor, context);
    }
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
    if ([
      POST_PHASE_INTENTS.idol_ask_found,
      POST_PHASE_INTENTS.idol_ask_who_has,
      POST_PHASE_INTENTS.idol_ask_looked_where,
      POST_PHASE_INTENTS.idol_claim_have_truth,
      POST_PHASE_INTENTS.idol_claim_have_lie,
      POST_PHASE_INTENTS.idol_claim_other_has_lie,
      POST_PHASE_INTENTS.idol_pressure_for_info
    ].includes(intent)) {
      return this._buildIdolTalkDialogue(survivor, { ...context, intent });
    }
    if (intent === POST_PHASE_INTENTS.offer_split_vote) {
      return this._buildSplitVoteDialogue(survivor, context);
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
      POST_PHASE_INTENTS.offer_deal_final2,
      POST_PHASE_INTENTS.offer_split_vote
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
    let playerLine = initiator === 'player' ? this._pickIntentTemplate(resolvedIntent, 'player') : '';
    let npcLine = this._pickIntentTemplate(resolvedIntent, 'npc');
    let safety = 0;
    while (memory?.recentlyUsed?.(survivor.id, npcLine) && safety < 3) {
      npcLine = this._pickIntentTemplate(resolvedIntent, 'npc');
      safety += 1;
    }
    const targetName = context.topicPersonName || context.topicPerson || this._pickTargetName(survivor, context);
    const allyName = context.allyName || this._pickTrustedAllyName(survivor);
    if (resolvedIntent === 'gossip' && targetName) {
      context.topicPerson = targetName;
    }
    if ((resolvedIntent === 'hardStrategy' || resolvedIntent === 'lightStrategy') && targetName) {
      context.topicPerson = targetName;
    }

    context.lastSpeaker = initiator === 'npc' ? 'npc' : 'player';
    let responses = this._selectIntentResponses(resolvedIntent, context);
    const npcMemory = this._getNpcMemoryEntry(survivor);

    if (resolvedIntent === 'deal') {
      const dealTopic = this._describeDeal(context, survivor);
      context.dealTopic = dealTopic;
      npcLine = `${survivor.firstName} considers your pitch about ${dealTopic}.`;
    } else if (resolvedIntent === 'hardStrategy') {
      if (initiator === 'player') {
        playerLine = this._buildHardStrategyLine(playerLine, initiator, survivor, targetName, allyName, context);
        npcLine = this._pickIntentTemplate('hardStrategy', 'npc');
      } else {
        npcLine = this._buildHardStrategyLine(npcLine, initiator, survivor, targetName, allyName, context);
      }
      responses = this._buildHardStrategyResponses(initiator, context);
    } else if (resolvedIntent === 'lightStrategy' && context.lightIntelTag === 'rubbing_wrong') {
      const intel = this._buildRubbingWrongResponse(survivor, context);
      npcLine = intel.responseLine;
      if (intel.targetName) {
        context.topicPersonName = intel.targetName;
        context.topicPerson = intel.targetName;
        context.topicPersonId = this._getSurvivorByName(intel.targetName)?.id || null;
      }
      context.lastQuestionTag = 'rubbing_wrong';
      context.lastAnswerTag = intel.targetName || null;
      playerLine = 'You ask if anyone is rubbing people the wrong way.';
    } else if (resolvedIntent === 'trust' && npcMemory) {
      const questionTag = context.trustCheck ? 'trust_me' : 'trust_who';
      const trustedName = context.npcTrustedPersonName || npcMemory.trustedName || allyName;
      if (trustedName) {
        context.npcTrustedPersonName = trustedName;
        if (!npcMemory.trustedName) {
          npcMemory.trustedName = trustedName;
        }
      }
      context.lastQuestionTag = questionTag;
      context.lastAnswerTag = trustedName || null;
      const isRepeat = npcMemory.lastQuestionTag === questionTag && npcMemory.lastAnswerTag;
      npcLine = isRepeat && trustedName
        ? `${survivor.firstName} gives a knowing look. "I already said ${trustedName} feels the most solid."`
        : npcLine;
      npcMemory.lastQuestionTag = questionTag;
      npcMemory.lastAnswerTag = trustedName || null;
      npcMemory.lastIntentAsked = { ...(npcMemory.lastIntentAsked || {}), trust: Date.now() };
    } else {
      playerLine = (playerLine || '')
        .replace('{npc}', survivor.firstName)
        .replace('{target}', targetName || 'someone')
        .replace('{npcTrusted}', context.npcTrustedPersonName || allyName || 'no one fully yet')
        .replace('{playerAlly}', context.playerNamedAllyName || allyName || 'no one fully yet')
        .replace('{ally}', allyName || 'no one fully yet');
      npcLine = (npcLine || '')
        .replace('{npc}', survivor.firstName)
        .replace('{target}', targetName || 'someone')
        .replace('{npcTrusted}', context.npcTrustedPersonName || allyName || 'no one fully yet')
        .replace('{playerAlly}', context.playerNamedAllyName || allyName || 'no one fully yet')
        .replace('{ally}', allyName || 'no one fully yet');
    }

    playerLine = (playerLine || '')
      .replace('{npc}', survivor.firstName)
      .replace('{target}', targetName || 'someone')
      .replace('{npcTrusted}', context.npcTrustedPersonName || allyName || 'no one fully yet')
      .replace('{playerAlly}', context.playerNamedAllyName || allyName || 'no one fully yet')
      .replace('{ally}', allyName || 'no one fully yet');
    npcLine = (npcLine || '')
      .replace('{npc}', survivor.firstName)
      .replace('{target}', targetName || 'someone')
      .replace('{npcTrusted}', context.npcTrustedPersonName || allyName || 'no one fully yet')
      .replace('{playerAlly}', context.playerNamedAllyName || allyName || 'no one fully yet')
      .replace('{ally}', allyName || 'no one fully yet');

    if (memory && typeof memory.getMemory === 'function') {
      const mem = memory.getMemory(survivor.id);
      const lastDeal = memory.getLatestDeal?.(survivor.id);
      if (resolvedIntent === 'deal' && lastDeal) {
        npcLine += ` They remember your last ${lastDeal.type} (${lastDeal.status}).`;
      }
      if (mem?.gossip?.length && resolvedIntent === 'gossip' && context.topicPerson) {
        npcLine += ` They recall you bringing up ${context.topicPerson} before.`;
      }
    }

    const { playerNarration, npcResponse } = this.composeExchange({
      narration1: playerLine,
      npcLine,
      npc: survivor,
      intent: resolvedIntent
    });
    const combined = this._composeMenuText({ playerNarration, npcResponse });
    memory?.rememberBeat?.(survivor.id, resolvedIntent, combined);
    return { playerNarration, npcResponse, playerLine, npcLine, text: null, responses, context };
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
      context: this._normalizeConversationContext({ ...context }),
      turnIndex: 0,
      lastNpcQuestionKey: null,
      awaitingPlayerResponse: false,
      history: []
    };

    this.conversationSession = session;

    if (flowKey === 'confront_rumor') {
      const opener = context.pressure ? 'Why did you say that about me?' : 'I heard you said my name.';
      session.context.entryNarration = context.pressure
        ? 'You step in close and press them about why your name is out there.'
        : 'You pull them aside and mention that your name is coming up.';
      this._appendConversationHistory(session, 'Player', session.context.entryNarration, ['confront']);
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
      const targetName = session.context.topicPersonName || session.context.topicPerson || 'someone';
      session.context.entryNarration = `You mention that you heard ${targetName} said ${survivor.firstName}'s name.`;
      this._appendConversationHistory(session, 'Player', session.context.entryNarration, ['name_drop']);
      const nameDropEvent = this._recordStructuredSocialEvent({
        type: 'NAME_DROP',
        speakerId: player?.id || null,
        listenerId: survivor.id,
        subjectId: session.context.topicPersonId || session.context.topicId || null,
        data: {
          targetId: session.context.topicPersonId || session.context.topicId || null,
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
    const overlay = this._buildOverlayShell(npc, { reuse: true });
    const player = this.gameManager.getPlayerSurvivor?.();
    const context = session.context || {};
    const errorMeta = {
      flowKey: session.flowKey,
      stepKey,
      choiceKey: fromChoice?.key || fromChoice?.id || null,
      npcId: npc?.id || null,
      npcName: npc?.firstName || null
    };
    const formatContext = { ...context, _conversationMeta: errorMeta };

    let playerNarration = null;
    const npcLine = this._safeBuildNpcLine({
      step,
      session,
      npc,
      player,
      context,
      fromChoice
    });
    if (step.nav) {
      playerNarration = 'You gather your thoughts and keep the door open.';
    }
    const formattedNpcLine = this._safeFormatConversationLine(npcLine, npc, formatContext, player);
    if (!playerNarration && fromChoice?.playerNarration) {
      playerNarration = fromChoice.playerNarration;
    }
    if (!playerNarration && stepKey === flow.start && session.context?.entryNarration) {
      playerNarration = session.context.entryNarration;
    }

    const fallbackNpcLine = formattedNpcLine || this._buildDefaultNpcResponse({
      npc,
      player,
      intent: session.intent || session.flowKey,
      context
    });
    const formattedNarration = this._safeFormatConversationLine(playerNarration || '', npc, formatContext, player);
    let exchange = null;
    try {
      exchange = this.formatExchange({
        narration: formattedNarration,
        npcLine: fallbackNpcLine,
        npc,
        intent: session.intent || session.flowKey
      });
    } catch (error) {
      console.error('[ConversationSystem] formatExchange error', {
        ...errorMeta,
        error
      });
      this._debugBanner('NPC response fallback used', 'error in exchange formatting. See console.');
      const safeNarration = this._formatPlayerNarration(this.formatNarration(formattedNarration || ''), session.intent || session.flowKey);
      let safeNpcResponse = fallbackNpcLine;
      try {
        safeNpcResponse = this._formatNpcResponse(fallbackNpcLine, session.intent || session.flowKey);
      } catch (npcError) {
        console.error('[ConversationSystem] npcResponse format error', {
          ...errorMeta,
          error: npcError
        });
      }
      exchange = { playerNarration: safeNarration, npcResponse: safeNpcResponse };
    }
    const formattedPlayerNarration = exchange.playerNarration;
    const resolvedNpcResponse = exchange.npcResponse || this._buildDefaultNpcResponse({
      npc,
      player,
      intent: session.intent || session.flowKey,
      context
    });

    const combinedText = this._composeMenuText({
      playerNarration: formattedPlayerNarration,
      npcResponse: resolvedNpcResponse
    });

    if (!step.nav && resolvedNpcResponse) {
      this._appendConversationHistory(session, npc?.firstName || 'NPC', { npcResponse: resolvedNpcResponse }, ['npc']);
      context.lastSpeaker = 'npc';
    }

    const content = this._getConversationContent(overlay);
    this._clearConversationContent(content);
    const parchment = this._buildParchment(combinedText || '');
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
      try {
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
          this._logEndConversationClick('player_end', session);
          this.endConversation(session);
          return;
        }

        if (choice.action === 'pickSource') {
          const excludeIds = [session.npcId, session.playerId].filter(Boolean);
          const pickerState = { handled: false };
          const extraOptions = [{
            label: 'I’m not naming names.',
            onSelect: () => {
              pickerState.handled = true;
              session.context.sourceId = null;
              session.context.sourceName = null;
              session.context.sourceRefused = true;
              const refusalStep = session.flowKey === 'name_drop' ? 'nameDropRefuse' : 'confrontResolve';
              this._advanceConversation(session, { ...choice, key: 'refuseSource', nextStep: refusalStep });
            }
          }];
          this.promptSurvivorPicker({
            title: 'Name the source',
            tribeOnly: true,
            excludeIds,
            extraOptions
          }).then(selectedId => {
            if (pickerState.handled) return;
            if (!selectedId) {
              this._renderConversationStep(session, stepKey, fromChoice);
              return;
            }
            const pick = this._getSurvivorById(selectedId);
            if (!pick) {
              this._renderConversationStep(session, stepKey, fromChoice);
              return;
            }
            session.context.sourceId = pick.id;
            session.context.sourceName = pick.firstName;
            session.context.sourceRefused = false;
            this._advanceConversation(session, { ...choice, pickedSource: pick });
          });
          return;
        }

        if (choice.requiresAllyPicker) {
          const excludeIds = [session.npcId, session.playerId].filter(Boolean);
          this.promptSurvivorPicker({
            title: 'Name a trusted ally',
            tribeOnly: true,
            excludeIds
          }).then(selectedId => {
            if (!selectedId) {
              this._renderConversationStep(session, stepKey, fromChoice);
              return;
            }
            const pick = this._getSurvivorById(selectedId);
            if (!pick) {
              this._renderConversationStep(session, stepKey, fromChoice);
              return;
            }
            session.context.playerNamedAllyName = pick.firstName;
            session.context.playerNamedAllyId = pick.id;
            session.context = this._normalizeConversationContext(session.context);
            this._advanceConversation(session, { ...choice, allyName: pick.firstName });
          });
          return;
        }

        if (choice.requiresTargetPicker) {
          const excludeIds = [session.npcId, session.playerId].filter(Boolean);
          this.promptSurvivorPicker({
            title: choice.targetPrompt || 'Name who?',
            tribeOnly: true,
            excludeIds
          }).then(selectedId => {
            if (!selectedId) {
              this._renderConversationStep(session, stepKey, fromChoice);
              return;
            }
            const pick = this._getSurvivorById(selectedId);
            if (!pick) {
              this._renderConversationStep(session, stepKey, fromChoice);
              return;
            }
            session.context.topicPerson = pick.firstName;
            session.context.topicId = pick.id;
            this._advanceConversation(session, { ...choice, targetName: pick.firstName });
          });
          return;
        }

        this._advanceConversation(session, choice);
      } catch (error) {
        console.error('ConversationSystem: flow choice handler failed', error);
        this.closeConversation('error_exit', session);
      }
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
      onEnd: () => this.closeConversation('player_end', session),
      session
    });

    finalChoices.forEach(option => {
      const btn = this._createChoiceButton({
        label: option.label,
        alt: option.alt,
        onClick: () => handleChoice(option),
        fallback: { session, npc }
      });
      if (this._isNavChoice(option)) {
        btn.dataset.conversationNav = 'true';
      }
      buttonColumn.appendChild(btn);
    });

    parchment.appendChild(buttonColumn);
    content.appendChild(parchment);
  }

  _advanceConversation(session, selectedChoice) {
    if (!session || !selectedChoice) return;
    if (selectedChoice.end || (typeof selectedChoice.label === 'string' && /end conversation/i.test(selectedChoice.label))) {
      this._logEndConversationClick('player_end', session);
      this.closeConversation('player_end', session);
      return;
    }
    const flow = CONVERSATION_FLOWS[session.flowKey];
    if (!flow) return;
    const npc = this._getSurvivorById(session.npcId);
    const player = this.gameManager.getPlayerSurvivor?.();

    const playerNarration = this._resolvePlayerNarration(selectedChoice, session.intent, session.context || {});
    const formattedNarration = this._formatConversationLine(playerNarration || '', npc, session.context || {}, player);
    this._appendConversationHistory(session, 'Player', { narration: formattedNarration }, ['player']);
    session.context.lastSpeaker = 'player';
    session.context.lastPlayerNarration = formattedNarration;
    this._applyFlowChoiceEffects(session, selectedChoice);
    selectedChoice.playerNarration = formattedNarration;

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
        this.gameManager.changeTrust?.(player.id, npc.id, -6, 'source_refused');
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
        this.gameManager.changeTrust?.(player.id, npc.id, -5, 'name_drop_no_source');
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

  _appendConversationHistory(session, speaker, payload, tags = []) {
    if (!session || !payload) return;
    const entry = {
      speaker,
      text: '',
      narration: null,
      npcResponse: null,
      tags: Array.isArray(tags) ? tags : [],
      timestamp: Date.now()
    };

    if (typeof payload === 'string') {
      entry.text = payload;
      if (speaker === 'Player') {
        entry.narration = payload;
      } else {
        entry.npcResponse = payload;
      }
    } else if (typeof payload === 'object') {
      entry.narration = payload.narration || null;
      entry.npcResponse = payload.npcResponse || null;
      entry.text = payload.text || payload.narration || payload.npcResponse || '';
    }

    if (!entry.text) return;
    session.history.push(entry);
  }

  _safeBuildNpcLine({ step, session, npc, player, context, fromChoice }) {
    try {
      if (step?.nav) {
        return `What do you want to do next with ${npc?.firstName || 'them'}?`;
      }
      if (typeof step?.npcLine === 'function') {
        return step.npcLine(session, this, fromChoice);
      }
      if (typeof step?.npcLine === 'string') {
        return step.npcLine;
      }
      return '';
    } catch (error) {
      console.error('[ConversationSystem] npcLine error', {
        flowKey: session?.flowKey || null,
        stepKey: session?.currentStepKey || null,
        choiceKey: fromChoice?.key || fromChoice?.id || null,
        npcId: npc?.id || null,
        npcName: npc?.firstName || null,
        error
      });
      this._debugBanner('NPC response fallback used', 'error in npcLine. See console.');
      return this._buildDefaultNpcResponse({
        npc,
        player,
        intent: session?.intent || session?.flowKey,
        context
      });
    }
  }

  _safeFormatConversationLine(line, npc, context = {}, player = null) {
    try {
      return this._formatConversationLine(line, npc, context, player);
    } catch (error) {
      const meta = context?._conversationMeta || {};
      console.error('[ConversationSystem] conversation line format error', {
        ...meta,
        npcId: npc?.id || null,
        npcName: npc?.firstName || null,
        error
      });
      this._debugBanner('NPC response fallback used', 'error formatting npcLine. See console.');
      return '';
    }
  }

  _formatConversationLine(line, npc, context = {}, player = null) {
    if (!line) return '';
    const topicPersonName = context.topicPersonName || context.topicPerson || context.targetName || 'someone';
    const playerNamedAllyName = context.playerNamedAllyName || context.playerAllyName || null;
    const npcTrustedPersonName = context.npcTrustedPersonName || context.trustedName || null;
    const allyName = playerNamedAllyName || npcTrustedPersonName || context.allyName || 'someone';
    const sourceName = context.sourceName || 'someone';
    const replaced = line
      .replace('{npc}', this._npcDisplayName(npc))
      .replace('{target}', topicPersonName)
      .replace('{source}', sourceName)
      .replace('{player}', player?.firstName || 'you')
      .replace('{ally}', allyName)
      .replace('{playerAlly}', playerNamedAllyName || allyName)
      .replace('{npcTrusted}', npcTrustedPersonName || allyName)
      .replace('{topicPerson}', topicPersonName);
    return this._normalizeNpcVerbAgreement(replaced);
  }

  _wasLastHistoryEntry(session, speaker, text) {
    if (!session?.history?.length) return false;
    const last = session.history[session.history.length - 1];
    return last?.speaker === speaker && last?.text === text;
  }

  _buildDefaultNpcResponse({ npc, player, intent, context = {} } = {}) {
    if (!npc) return 'Your tribemate says, "Alright."';
    const relationshipSystem = this.gameManager.systems?.relationshipSystem;
    const npcName = this._npcDisplayName(npc);
    const sayVerb = this._verbAgree(npc, 'says', 'say');
    const availableTargets = this._getAvailableTargetNames(npc);
    const targetName = context.topicPersonName || context.topicPerson || context.targetName || null;
    const disclosure = this._resolveDisclosure({
      npc,
      player,
      targetId: context.topicId || context.targetId || (targetName ? this._getSurvivorByName(targetName)?.id || null : null),
      topic: intent || context.subTopic || 'general',
      context: { availableTargets, relationshipSystem }
    });
    const claim = targetName || availableTargets[getRandomInt(0, Math.max(0, availableTargets.length - 1))] || null;

    const isIdol = intent === POST_PHASE_INTENTS.idol_suspicion || context.subTopic === 'idol';
    const isTrust = intent === PRE_PHASE_INTENTS.check_trust || intent === 'trust';
    const isIntel = intent === POST_PHASE_INTENTS.ask_intel || intent === PRE_PHASE_INTENTS.ask_general_info;
    const isEyeing = intent === PRE_PHASE_INTENTS.light_strategy || intent === POST_PHASE_INTENTS.talk_specific_person;

    if (isIdol) {
      if (disclosure.mode === 'truth' && claim) {
        const truths = [
          `If I had to guess, it’s ${claim}.`,
          `${claim} is the name I keep hearing.`,
          `Low key? People whisper about ${claim}.`
        ];
        return this._npcSays(npc, truths[getRandomInt(0, truths.length - 1)]);
      }
      if (disclosure.mode === 'lie' && claim) {
        const lies = [
          `I heard ${claim} was looking around, but I’m not sure.`,
          `Maybe ${claim}. That’s the chatter, not me.`,
          `${claim} gives idol vibes, but I can’t swear to it.`
        ];
        return this._npcSays(npc, lies[getRandomInt(0, lies.length - 1)]);
      }
      const evades = [
        `I don’t have proof. It’s just vibes.`,
        `I’m not saying names without proof.`,
        `No hard proof—just noise.`
      ];
      return this._npcSays(npc, evades[getRandomInt(0, evades.length - 1)]);
    }

    if (isTrust) {
      if (disclosure.mode === 'truth' && claim) {
        const truths = [
          `Honestly, I feel best with ${claim}.`,
          `${claim} feels the most solid to me.`,
          `If I’m honest, ${claim} is who I trust.`
        ];
        return this._npcSays(npc, truths[getRandomInt(0, truths.length - 1)]);
      }
      if (disclosure.mode === 'lie' && claim) {
        const lies = [
          `I’m good with ${claim}… for now.`,
          `I’m closest with ${claim}, I guess.`,
          `Maybe ${claim}. I’m still reading people.`
        ];
        return this._npcSays(npc, lies[getRandomInt(0, lies.length - 1)]);
      }
      const evades = [
        `I’m keeping it tight. Not naming names.`,
        `I’m not putting names out like that.`,
        `I’d rather keep that to myself.`
      ];
      return this._npcSays(npc, evades[getRandomInt(0, evades.length - 1)]);
    }

    if (isIntel || isEyeing) {
      if (disclosure.mode === 'truth' && claim) {
        const truths = [
          `If it’s me, it’s ${claim}.`,
          `If I had to put a name down, it’s ${claim}.`,
          `If I’m leaning, it’s ${claim}.`
        ];
        return this._npcSays(npc, truths[getRandomInt(0, truths.length - 1)]);
      }
      if (disclosure.mode === 'lie' && claim) {
        const lies = [
          `Probably ${claim}, but nothing locked.`,
          `${claim} keeps coming up, but I’m not locked.`,
          `Maybe ${claim}. It’s early.`
        ];
        return this._npcSays(npc, lies[getRandomInt(0, lies.length - 1)]);
      }
      const evades = [
        `I’m not putting names out yet.`,
        `I’m keeping it vague for now.`,
        `I’m not saying a name yet.`
      ];
      return this._npcSays(npc, evades[getRandomInt(0, evades.length - 1)]);
    }

    const stance = this._computeNpcStance({
      npc,
      player,
      intent,
      subjectId: context.topicId || context.targetId || null,
      context
    });
    return this._pickNpcResponse(intent, stance, { npcName }, npc);
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
      playerNarration: 'You pull them aside and bring up your name coming up.',
      npcResponse: () => this._buildConfrontQuestionLine(session),
      choices: [
        {
          label: 'I’m not burning my source — just tell me if it’s true.',
          playerLine: 'You refuse to burn your source and ask if it is true.',
          nextNode: this._buildConfrontWhyNameNode(session)
        },
        {
          label: '(Name a source)',
          playerLine: 'You decide to name a source.',
          action: 'pickSource',
          awaitsPicker: true,
          nextNodeBuilder: (pick) => this._buildConfrontSourceResponse(session, pick, { isLie: false })
        },
        {
          label: 'You know what, forget it.',
          playerLine: 'You back off and try to defuse the moment.',
          nextNode: {
            npcResponse: `${npc?.firstName || 'They'} nods cautiously. "Alright. If it’s a mix-up, let’s reset."`,
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
        },
        {
          label: 'If you’re coming for me, just say it.',
          playerLine: 'You challenge them to say it to your face.',
          nextNode: this._buildConfrontEscalateNode(session)
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
      npcResponse: line,
      choices: [
        {
          label: 'So are you targeting me?',
          playerLine: 'You ask if they are actually targeting you.',
          nextNode: {
            npcResponse: `${npc?.firstName || 'They'} answers, "I’m not locked on you, but I’m watching the vote."`,
            choices: this._buildDefaultFollowupChoices(PRE_PHASE_INTENTS.confront_rumor, session.context),
            meta: { speaker: 'npc' }
          }
        },
        {
          label: 'Who else is involved?',
          playerLine: 'You ask who else was involved.',
          nextNode: {
            npcResponse: `${npc?.firstName || 'They'} says, "${explanationTarget} was the other name in the mix."`,
            choices: this._buildDefaultFollowupChoices(PRE_PHASE_INTENTS.confront_rumor, session.context),
            meta: { speaker: 'npc' }
          }
        },
        {
          label: 'Let’s squash it',
          playerLine: 'You suggest squashing it and moving forward.',
          nextNode: {
            npcResponse: `${npc?.firstName || 'They'} nods. "I’m good with that if you are."`,
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
      this.gameManager.changeTrust?.(player?.id, npc?.id, -3, 'confrontation_ally');
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
    const disclosure = this._resolveDisclosure({
      npc,
      player,
      topic: 'confront_followup',
      context: {
        availableTargets: this._getAvailableTargetNames(npc),
        relationshipSystem: this.gameManager.systems?.relationshipSystem
      }
    });
    const involvedName = disclosure.claimedTarget || 'a couple people';
    const involvedLine = disclosure.mode === 'dodge'
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

  _buildConfrontEscalateNode(session) {
    const npc = this._getSurvivorById(session.npcId);
    const player = this.gameManager.getPlayerSurvivor?.();
    const trustScore = this._getTrustScore(npc, player);
    const style = this._classifyStyle(npc);
    let didMention = this._npcHasMentionedPlayer(npc?.id, player?.id);
    if (!didMention) {
      const chance = trustScore < 40 ? 0.6 : trustScore > 70 ? 0.25 : 0.4;
      didMention = Math.random() < chance;
    }

    let line = '';
    if (didMention && trustScore > 60) {
      line = `${npc?.firstName || 'They'} holds your gaze. "Your name floated, but I’m not the one driving it. I’m not coming for you."`;
    } else if (didMention) {
      line = `${npc?.firstName || 'They'} stiffens. "Your name came up, but it wasn’t me trying to bury you."`;
    } else if (style?.isVillain || style?.isStrategist) {
      line = `${npc?.firstName || 'They'} says, "If I wanted you out, I’d tell you. I’m not on that."`;
    } else if (trustScore < 45) {
      line = `${npc?.firstName || 'They'} frowns. "Don’t come at me like that. I’m not after you."`;
    } else {
      line = `${npc?.firstName || 'They'} shakes their head. "I’m not coming for you. Let’s keep it calm."`;
    }

    return {
      text: line,
      choices: this._buildDefaultFollowupChoices(PRE_PHASE_INTENTS.confront_rumor, session.context),
      meta: { speaker: 'npc' }
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

    const disclosure = this._resolveDisclosure({
      npc,
      player,
      targetId,
      topic: 'nameMentionedPlayer',
      context: {
        trueTarget: targetName,
        availableTargets: this._getAvailableTargetNames(npc),
        relationshipSystem: this.gameManager.systems?.relationshipSystem
      }
    });
    const sourceName = disclosure.mode === 'dodge' ? null : (disclosure.detail?.pusherName || null);
    const sourceId = sourceName ? this._getSurvivorByName(sourceName)?.id || null : null;
    const confidence = Math.max(20, Math.min(90, Math.round(trustScore + (disclosure.mode === 'truth' ? 12 : disclosure.mode === 'lie' ? -12 : -4))));
    const location = disclosure.detail?.location || context.location || LocationKeys.SHELTER;
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

    this._logStrategicMemory({
      type: 'NAME_MENTIONED',
      speakerId: npc?.id || null,
      listenerId: player?.id || null,
      subjectId: targetId || null,
      sourceId,
      confidence,
      phase: context.phase || this._getConversationPhase()
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
        npcDisclosureOutcome: rumor.disclosure?.mode || 'dodge',
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

    this._logStrategicMemory({
      type: 'PLOT_WARNING',
      speakerId: npc?.id || null,
      listenerId: session.playerId || null,
      subjectId: rumor.targetId || null,
      confidence: rumor.confidence,
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

    const buildProofNode = (type, label, playerLine) => ({
      label,
      playerLine,
      memoryEvent: {
        type: 'PLOT_PROOF_REQUESTED',
        speakerId: session.playerId || null,
        listenerId: npc?.id || null,
        subjectId: rumor.targetId || null,
        data: { inquiry: type, targetName: rumor.targetName }
      },
      nextNode: {
        text: this._buildWarningProofDetail(session, rumor, type),
        choices: this._buildDefaultFollowupChoices(POST_PHASE_INTENTS.plant_seed, session.context),
        meta: { speaker: 'npc' }
      }
    });

    return {
      id: 'warning_proof',
      text: proofLine,
      choices: [
        buildProofNode('pushers', 'Who exactly is pushing it?', 'Who exactly is pushing it?'),
        buildProofNode('source', 'Where did you hear it?', 'Where did you hear it?'),
        buildProofNode('solidity', 'How solid is it — one person or multiple?', 'How solid is it — one person or multiple?'),
        buildProofNode('motive', 'What do they want from you?', 'What do they want from you?'),
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

  _buildWarningProofDetail(session, rumor, inquiryType) {
    const npc = this._getSurvivorById(session.npcId);
    const player = this.gameManager.getPlayerSurvivor?.();
    const trustScore = this._getTrustScore(npc, player);
    const style = this._classifyStyle(npc);
    const targetRel = rumor.targetId ? this._relationshipBetween(npc?.id, rumor.targetId) : 50;
    const planners = Array.isArray(rumor.plotPacket?.planners) ? rumor.plotPacket.planners.filter(Boolean) : [];
    const pusherList = planners.length ? planners : [rumor.pusherName].filter(Boolean);
    const location = rumor.plotPacket?.location || rumor.location || session.context.location || 'camp';
    const timeHint = rumor.plotPacket?.timeHint || rumor.timeHint || 'earlier';
    const sourceType = rumor.plotPacket?.sourceType || rumor.sourceType || 'heard it in passing';

    const cautious = trustScore < 50 || targetRel > 65;
    const aggressive = style?.isStrategist || style?.isVillain;
    const chaotic = style?.isWildcard;

    switch (inquiryType) {
      case 'pushers': {
        if (!pusherList.length || cautious) {
          return `${npc?.firstName || 'They'} keeps it vague. "It’s a couple people. I’m not burning names yet."`;
        }
        if (aggressive) {
          return `${npc?.firstName || 'They'} answers, "${pusherList.join(' & ')} are pushing it hard."`;
        }
        return `${npc?.firstName || 'They'} says, "Mostly ${pusherList.join(' & ')} — they’re the loudest voices."`;
      }
      case 'source': {
        if (cautious) {
          return `${npc?.firstName || 'They'} shrugs. "Just around camp. I don’t want to pin it to a spot."`;
        }
        return `${npc?.firstName || 'They'} says, "I got it at the ${location} ${timeHint} — I ${sourceType}."`;
      }
      case 'solidity': {
        if (pusherList.length > 1) {
          return chaotic
            ? `${npc?.firstName || 'They'} admits, "It’s multiple people, but it shifts. It’s messy."`
            : `${npc?.firstName || 'They'} nods. "It’s multiple people. That’s why I’m taking it seriously."`;
        }
        return cautious
          ? `${npc?.firstName || 'They'} says, "Feels like one person pushing, but I’m not calling it locked."`
          : `${npc?.firstName || 'They'} says, "It’s mostly one person pushing, but others could jump on."`;
      }
      case 'motive': {
        const reason = rumor.reason || 'a threat read';
        return trustScore > 60
          ? `${npc?.firstName || 'They'} answers, "They want you as a number for a ${reason} move — and to keep it quiet."`
          : `${npc?.firstName || 'They'} hedges. "They want you calm and on board. That’s all I’m comfortable saying."`;
      }
      default:
        return `${npc?.firstName || 'They'} shrugs. "That’s what I’ve got."`;
    }
  }

  _npcHasMentionedPlayer(npcId, playerId) {
    if (!npcId || !playerId) return false;
    const memory = this.gameManager.systems?.socialMemorySystem;
    const day = this.gameManager.getCurrentDay?.() || 1;
    const events = memory?.getStructuredEvents?.() || [];
    return events.some(event => event.speakerId === npcId && event.subjectId === playerId && (day - (event.day || day)) <= 2);
  }

  validate() {
    const report = { errors: [], warnings: [] };
    const npc = (this.gameManager.survivors || []).find(s => !s.isPlayer) || this.gameManager.survivors?.[0];
    const player = this.gameManager.getPlayerSurvivor?.();
    if (!npc) {
      console.warn('ConversationSystem.validate: No NPC available for validation.');
      return report;
    }

    const baseContext = { location: LocationKeys.CAMPFIRE, phase: this._getConversationPhase() };
    const pickerActions = new Set(['pickSource', 'pitchPlan', 'floatName']);
    const registerNode = (map, node) => {
      if (!node) return null;
      const id = node.id || this._createNodeId('validate');
      map[id] = { ...node, id };
      return id;
    };

    const checkChoice = (choice, nodeId) => {
      const hasNext = !!(choice.nextNode || choice.nextNodeId || choice.nextMenu || choice.responseOption || choice.onSelect || choice.action || choice.end || choice.next);
      const hasNpcReply = !!(choice.npcReply || choice.responseOption || choice.nextNode || choice.nextNodeId || choice.nextMenu || choice.action);
      if (!hasNext) {
        report.errors.push(`Node "${nodeId}" choice "${choice.label || choice.id}" missing next/action/end.`);
      }
      if (!hasNpcReply) {
        report.errors.push(`Node "${nodeId}" choice "${choice.label || choice.id}" missing npcReply/next.`);
      }
      if (pickerActions.has(choice.action) && !choice.awaitsPicker) {
        report.warnings.push(`Node "${nodeId}" choice "${choice.label || choice.id}" uses picker but isn't marked awaited.`);
      }
    };

    const walkNodes = (nodes, nodeId, visited = new Set()) => {
      if (!nodeId || visited.has(nodeId)) return;
      const node = nodes[nodeId];
      if (!node) {
        report.errors.push(`Missing nodeId "${nodeId}".`);
        return;
      }
      visited.add(nodeId);
      const choices = Array.isArray(node.choices) ? node.choices : [];
      if (!node.text && !node.nav) {
        report.errors.push(`Node "${nodeId}" missing npc text.`);
      }
      if (choices.length === 0 && !node.meta?.isEnd) {
        report.warnings.push(`Node "${nodeId}" has no choices.`);
      }
      if (node.meta?.showNav !== false && choices.some(choice => this._isNavChoice(choice))) {
        report.warnings.push(`Node "${nodeId}" includes nav choices while render adds nav.`);
      }
      choices.forEach(choice => {
        checkChoice(choice, nodeId);
        if (choice.nextNode) {
          const nextId = registerNode(nodes, choice.nextNode);
          walkNodes(nodes, nextId, visited);
        } else if (choice.nextNodeId) {
          walkNodes(nodes, choice.nextNodeId, visited);
        } else if (choice.next && typeof choice.next === 'object') {
          const nextId = registerNode(nodes, choice.next);
          walkNodes(nodes, nextId, visited);
        }
      });
    };

    const flows = [
      { session: this._initNodeSession({ npcId: npc.id, playerId: player?.id || null, intent: PRE_PHASE_INTENTS.confront_rumor, context: { ...baseContext, phase: 'pre' } }), builder: this._buildConfrontNodeRoot.bind(this) },
      { session: this._initNodeSession({ npcId: npc.id, playerId: player?.id || null, intent: POST_PHASE_INTENTS.plant_seed, context: { ...baseContext, phase: 'post' } }), builder: this._buildWarningNodeRoot.bind(this) },
      { session: this._initNodeSession({ npcId: npc.id, playerId: player?.id || null, intent: POST_PHASE_INTENTS.talk_specific_person, context: { ...baseContext, phase: 'post', subTopic: 'nameDrop', topicPerson: npc.firstName, topicId: npc.id } }), builder: this._buildNameDropNodeRoot.bind(this) }
    ];

    flows.forEach(flow => {
      const nodes = {};
      const root = flow.builder(flow.session);
      const rootId = registerNode(nodes, root);
      walkNodes(nodes, rootId);
    });

    const intents = [...Object.values(PRE_PHASE_INTENTS), ...Object.values(POST_PHASE_INTENTS)];
    intents.forEach(intent => {
      const context = intent === POST_PHASE_INTENTS.talk_specific_person
        ? { phase: 'post', topicPerson: npc.firstName, topicId: npc.id, subTopic: 'trustCheck' }
        : { phase: intent === PRE_PHASE_INTENTS.bond_smalltalk ? 'pre' : 'post' };
      const dialogue = this._buildDialogue(intent, npc, { ...baseContext, ...context });
      const rootChoices = (dialogue.responses || []).map((option, index) => ({
        id: `validate-choice-${index}`,
        label: option.label,
        responseOption: option
      }));
      rootChoices.forEach(choice => {
        if (!choice.responseOption) {
          report.errors.push(`Intent "${intent}" missing response option for "${choice.label}".`);
        }
        if (choice.responseOption?.requiresAllyPicker && !choice.responseOption?.awaitsPicker) {
          report.warnings.push(`Intent "${intent}" choice "${choice.label}" uses picker but isn't marked awaited.`);
        }
      });
    });

    const sampleSession = this._initNodeSession({
      npcId: npc.id,
      playerId: player?.id || null,
      intent: 'validate',
      context: { ...baseContext }
    });
    const sampleNodeId = this._registerNode(sampleSession, {
      text: 'Validation check.',
      choices: [{ label: 'Test', end: true }]
    });
    this._renderNode(sampleSession, sampleNodeId);
    const overlay = this.activeOverlay;
    if (overlay) {
      const unsafeButtons = overlay.querySelectorAll('button:not([data-safe-click])');
      if (unsafeButtons.length) {
        report.errors.push('Detected buttons without Safe Click wrapper.');
      }
    }
    this._clearOverlay();

    const header = 'ConversationSystem.validate';
    console.group(header);
    if (report.errors.length) {
      console.warn('Errors:', report.errors);
    } else {
      console.log('No errors detected.');
    }
    if (report.warnings.length) {
      console.warn('Warnings:', report.warnings);
    } else {
      console.log('No warnings detected.');
    }
    console.groupEnd();
    return report;
  }

  validateMenus() {
    if (!this._isConversationDebugEnabled()) {
      console.warn('ConversationSystem.validateMenus: Debug flag not enabled. Set window.DEBUG_CONVERSATION = true to run.');
      return;
    }

    const npc = (this.gameManager.survivors || []).find(s => !s.isPlayer) || this.gameManager.survivors?.[0];
    if (!npc) {
      console.warn('ConversationSystem.validateMenus: No NPC available for validation.');
      return;
    }

    const baseContext = { location: LocationKeys.CAMPFIRE, phase: this._getConversationPhase() };
    const validActions = new Set(['changeTopic', 'endConversation', 'askFollowup', 'tradeInfo', 'offerDealMenu', 'pitchPlan', 'pickSource', 'goBack']);

    const checkOption = (intent, option) => {
      const label = option?.label || option?.key || 'unknown';
      if (option?.action && !validActions.has(option.action)) {
        console.warn(`ConversationSystem.validateMenus: Intent "${intent}" uses unknown action "${option.action}" on "${label}".`);
      }
      const producesState = Boolean(
        option?.end
        || option?.nextMenu
        || option?.followup
        || option?.disclosureKind
        || option?.requiresCounterTarget
        || option?.requiresAllyPicker
        || option?.action
      );
      if (!producesState) {
        console.warn(`ConversationSystem.validateMenus: Intent "${intent}" option "${label}" does not advance to a new menu/state.`);
      }
    };

    const intents = [...Object.values(PRE_PHASE_INTENTS), ...Object.values(POST_PHASE_INTENTS)];
    intents.forEach(intent => {
      const context = intent === POST_PHASE_INTENTS.talk_specific_person
        ? { phase: 'post', topicPerson: npc.firstName, topicId: npc.id, subTopic: 'trustCheck' }
        : { phase: intent === PRE_PHASE_INTENTS.bond_smalltalk ? 'pre' : 'post' };
      const dialogue = this._buildDialogue(intent, npc, { ...baseContext, ...context });
      const responses = dialogue.responses || [];
      responses.forEach(option => checkOption(intent, option));
    });
  }

  runSelfTest(iterations = 8) {
    const npc = (this.gameManager.survivors || []).find(s => !s.isPlayer) || this.gameManager.survivors?.[0];
    if (!npc) {
      console.warn('ConversationSystem.runSelfTest: No NPC available for self-test.');
      return;
    }
    const player = this.gameManager.getPlayerSurvivor?.();
    if (!player) {
      console.warn('ConversationSystem.runSelfTest: No player available for self-test.');
      return;
    }

    const context = { phase: this._getConversationPhase() };
    const topics = this._buildMainTopics({ player, npc, context });
    const results = [];

    topics.forEach(topic => {
      const node = topic.nodes?.[0];
      if (!node) return;
      const responseMode = this.decideNpcResponseMode({
        player,
        npc,
        topic: topic.id,
        riskLevel: node.riskLevel ?? 0.3,
        askedForNames: Boolean(node.askedForNames),
        pressuring: Boolean(node.pressuring)
      });
      const playerLine = typeof node.playerLine === 'function'
        ? node.playerLine({ player, npc, context })
        : node.playerLine;
      const npcLine = node.npcResponseGenerator({ player, npc, context, responseMode });
      results.push({
        topic: topic.label,
        playerLine,
        npcLine
      });
    });

    console.info('ConversationSystem.runSelfTest: structured conversation sample', results);
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
    const baseContext = { location: LocationKeys.CAMPFIRE, phase: this._getConversationPhase() };
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
      POST_PHASE_INTENTS.offer_split_vote,
      POST_PHASE_INTENTS.challenge_performance,
      POST_PHASE_INTENTS.challenge_debrief,
      POST_PHASE_INTENTS.idol_suspicion,
      POST_PHASE_INTENTS.idol_ask_found,
      POST_PHASE_INTENTS.idol_ask_who_has,
      POST_PHASE_INTENTS.idol_ask_looked_where,
      POST_PHASE_INTENTS.idol_claim_have_truth,
      POST_PHASE_INTENTS.idol_claim_have_lie,
      POST_PHASE_INTENTS.idol_claim_other_has_lie,
      POST_PHASE_INTENTS.idol_pressure_for_info,
      POST_PHASE_INTENTS.verify_story,
      POST_PHASE_INTENTS.plant_seed
    ];

    [...preIntents, ...postIntents].forEach(intent => {
      const context = intent === POST_PHASE_INTENTS.talk_specific_person
        ? { phase: 'post', topicPerson: npc.firstName, topicId: npc.id, subTopic: 'trustCheck' }
        : intent === POST_PHASE_INTENTS.pitch_target
          ? { phase: 'post', topicPerson: npc.firstName, topicId: npc.id }
          : intent === POST_PHASE_INTENTS.challenge_debrief
            ? { phase: 'post', topicPerson: npc.firstName, topicId: npc.id, debriefAction: 'blame' }
            : intent === POST_PHASE_INTENTS.idol_claim_other_has_lie
              ? { phase: 'post', topicPerson: npc.firstName, topicId: npc.id }
              : intent === POST_PHASE_INTENTS.offer_split_vote
                ? { phase: 'post', splitTargets: [npc.firstName], splitTargetIds: [npc.id], dealType: 'splitVote', dealTopic: 'split vote plan' }
                : { phase: intent === PRE_PHASE_INTENTS.bond_smalltalk ? 'pre' : 'post' };
      const session = buildSession(intent, context);
      const dialogue = this._buildDialogue(intent, npc, context);
      const choices = (dialogue.responses || []);
      if (choices.length < 2) {
        console.warn(`ConversationSystem QA: Intent "${intent}" has only ${choices.length} root choices`);
      }
      const rootNode = {
        id: `qa-root-${intent}`,
        playerNarration: dialogue.playerNarration || dialogue.playerLine || null,
        npcResponse: dialogue.npcResponse || dialogue.npcLine || null,
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
    const player = this.gameManager.getPlayerSurvivor?.();
    const sourceName = session.context.sourceName;
    const trustScore = this._getTrustScore(npc, player);
    const style = this._classifyStyle(npc);
    let didMention = this._npcHasMentionedPlayer(npc?.id, player?.id);
    if (!didMention) {
      let chance = trustScore < 40 ? 0.55 : trustScore > 70 ? 0.25 : 0.4;
      if (style?.isStrategist || style?.isVillain) chance += 0.1;
      if (style?.isLoyalist) chance -= 0.05;
      didMention = Math.random() < Math.max(0.1, Math.min(0.75, chance));
    }
    switch (choice.key) {
      case 'nameSource':
        if (didMention) {
          return `${npc?.firstName || 'They'} nods slowly. "So ${sourceName || 'someone'} said it. Your name did get floated, but I’m not driving it."`;
        }
        return `${npc?.firstName || 'They'} shakes their head. "I haven’t said your name. If ${sourceName || 'they'} did, that’s on them."`;
      case 'protectSource':
        if (didMention) {
          return style?.isChaotic
            ? `${npc?.firstName || 'They'} shrugs. "Names get tossed. Yours was in the mix, but I’m not locked."`
            : `${npc?.firstName || 'They'} lowers their voice. "Your name came up, but I’m not pushing it. Keep your source."`;
        }
        return style?.isAggressive
          ? `${npc?.firstName || 'They'} snaps. "I haven’t said your name. Don’t pin that on me."`
          : `${npc?.firstName || 'They'} says, "I haven’t said your name. If you’re worried, just keep your guard up."`;
      case 'deescalate':
        return `${npc?.firstName || 'They'} exhales. "Alright. Let’s drop it."`;
      case 'escalate':
        if (didMention) {
          return style?.isAggressive
            ? `${npc?.firstName || 'They'} squares up. "If I was coming for you, you’d know. This was chatter."`
            : `${npc?.firstName || 'They'} meets your eyes. "I’m not coming for you. But names move fast out here."`;
        }
        return `${npc?.firstName || 'They'} glares. "I’m not coming for you. Don’t make it a thing."`;
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

  _logStrategicMemory(entry = {}) {
    const payload = {
      type: entry.type || 'STRATEGY',
      speakerId: entry.speakerId || null,
      listenerId: entry.listenerId || null,
      subjectId: entry.subjectId || null,
      sourceId: entry.sourceId || null,
      confidence: entry.confidence ?? 50,
      timestamp: entry.timestamp || Date.now(),
      phase: entry.phase || this._getConversationPhase()
    };
    this._memoryLog.push(payload);
    return payload;
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

  _buildRubbingWrongResponse(survivor, context = {}) {
    const player = this.gameManager.getPlayerSurvivor?.();
    const behavior = this.getDisclosureBehavior(survivor, player, context);
    const available = this._getAvailableTargetNames(survivor)
      .filter(name => name && name !== survivor.firstName && name !== player?.firstName);
    const baseTarget = available.length ? available[getRandomInt(0, available.length - 1)] : null;
    const altTargets = available.filter(name => name !== baseTarget);
    const reasonBank = [
      'they keep barking orders at camp',
      'their tone rubs people the wrong way',
      'they’ve been a little too slippery in talks',
      'they’re pushing too hard after challenges',
      'they hover and it makes people uneasy'
    ];
    const pickReason = () => reasonBank[getRandomInt(0, reasonBank.length - 1)];

    if (!baseTarget) {
      return {
        responseLine: this._npcDoes(survivor, 'shrugs', 'shrug', '"Hard to tell. People are keeping it close."'),
        targetName: null,
        behavior: 'dodge'
      };
    }

    switch (behavior) {
      case 'truth':
      case 'partial': {
        const reason = pickReason();
        return {
          responseLine: this._npcDoes(survivor, 'lowers', 'lower', `their voice. "${baseTarget} is rubbing people wrong because ${reason}."`),
          targetName: baseTarget,
          behavior
        };
      }
      case 'lie': {
        const lieTarget = altTargets.length ? altTargets[getRandomInt(0, altTargets.length - 1)] : baseTarget;
        const reason = pickReason();
        return {
          responseLine: this._npcDoes(survivor, 'shrugs', 'shrug', `"People are annoyed with ${lieTarget} lately—${reason}."`),
          targetName: lieTarget,
          behavior
        };
      }
      case 'dodge':
      default:
        return {
          responseLine: this._npcDoes(survivor, 'shakes', 'shake', 'their head. "I’m not putting names on that."'),
          targetName: null,
          behavior: 'dodge'
        };
    }
  }

  _buildAskIntelDialogue(survivor, context = {}) {
    const player = this.gameManager.getPlayerSurvivor?.();
    const memory = this.gameManager.systems?.socialMemorySystem;
    const relationshipSystem = this.gameManager.systems?.relationshipSystem;
    const initiator = context.initiator || 'player';
    const phase = context.phase || this._getConversationPhase();
    const npcMemory = this._getNpcMemoryEntry(survivor);

    let targetId = null;
    let targetName = null;
    let repeated = false;
    const existingTopic = context.topicPersonName || context.topicPerson || null;
    if (!existingTopic && npcMemory?.eyeTargetName) {
      targetName = npcMemory.eyeTargetName;
      targetId = this._getSurvivorByName(targetName)?.id || null;
      repeated = true;
    } else {
      const picked = this._pickIntelTarget(survivor, context);
      targetId = picked.targetId;
      targetName = picked.targetName;
    }
    const relationshipValue = this._relationshipBetween(player?.id, survivor?.id) || 50;
    const trustScore = Math.round(this.gameManager.getTrust?.(player?.id, survivor?.id) ?? 50);
    const targetRel = targetId ? this._relationshipBetween(survivor?.id, targetId) : 50;
    const style = this._classifyStyle(survivor);
    const disclosure = this._resolveDisclosure({
      npc: survivor,
      player,
      targetId,
      topic: 'askIntel',
      pressureLevel: context.pressureLevel || 0
    });

    repeated = repeated || (targetId
      ? memory?.hasTalkedAboutTargetRecently?.(survivor.id, targetId)
      : false);

    let responseLine = '';
    let intelContext = 'heard_rumor';
    let confidence = Math.max(15, Math.min(90, Math.round(trustScore + (style.isVillain ? -10 : 5))));

    if (repeated && targetName) {
      responseLine = this._npcDoes(survivor, 'exhales', 'exhale', `"You already asked about ${targetName}. I don’t have much more."`);
      confidence = Math.max(15, confidence - 15);
    } else if (disclosure.mode === 'dodge') {
      responseLine = this._npcDoes(survivor, 'shakes', 'shake', 'their head. "Nothing solid. It’s all noise right now."');
      intelContext = 'heard_rumor';
      confidence = Math.max(10, confidence - 10);
      context.skipIntel = true;
    } else if (disclosure.mode === 'counter') {
      responseLine = this._npcDoes(survivor, 'tilts', 'tilt', 'their head. "Why, what are you hearing?"');
      intelContext = 'heard_rumor';
      confidence = Math.max(10, confidence - 5);
      context.skipIntel = true;
    } else if (targetName) {
      const intel = this._getBestIntelForTarget(targetId, targetName);
      if (intel?.type === 'idol') {
        intelContext = 'idol_suspicion';
        responseLine = this._npcDoes(survivor, 'lowers', 'lower', `their voice. "I keep hearing ${targetName} might have an idol."`);
      } else if (intel?.type === 'alliance') {
        intelContext = 'working_with';
        responseLine = this._npcDoes(survivor, 'nods', 'nod', `"${targetName} feels tight with ${intel?.allyName || 'someone'}. That\'s the vibe."`);
      } else if (intel?.type === 'target') {
        intelContext = 'target';
        responseLine = this._npcDoes(survivor, 'watches', 'watch', `the camp. "Names are floating and ${targetName} keeps coming up."`);
      } else {
        intelContext = 'heard_rumor';
        responseLine = this._npcDoes(survivor, 'shrugs', 'shrug', `"I\'m hearing ${targetName}\'s name more than once."`);
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
      responseLine = this._npcDoes(survivor, 'shakes', 'shake', 'their head. "It\'s quiet… just a lot of side-eyes."');
      intelContext = 'heard_rumor';
      confidence = Math.max(10, confidence - 10);
    }

    const leadLine = this._pickIntentTemplate('askIntel', initiator)
      .replace('{npc}', survivor.firstName);
    const playerLine = initiator === 'npc'
      ? `You let ${survivor.firstName} lead, then ask for the latest read.`
      : leadLine;
    const npcLine = `${responseLine}`.trim();
    const line = npcLine;
    if (npcMemory && targetName && !npcMemory.eyeTargetName) {
      npcMemory.eyeTargetName = targetName;
    }
    if (npcMemory?.lastDiscussedNames && targetName) {
      if (!npcMemory.lastDiscussedNames.includes(targetName)) {
        npcMemory.lastDiscussedNames.push(targetName);
      }
    }
    if (npcMemory) {
      npcMemory.lastIntentAsked = { ...(npcMemory.lastIntentAsked || {}), askIntel: Date.now() };
    }

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
      playerLine,
      npcLine,
      text: line,
      responses: RESPONSE_LIBRARY.askIntel || RESPONSE_LIBRARY.bonding,
      context: {
        ...context,
        topicPersonName: targetName || null,
        topicPersonId: targetId || null,
        topicPerson: targetName || null,
        topicId: targetId || null,
        targetId: targetId || null,
        phase,
        intelPayload: payload
      }
    };
  }

  _buildTalkSpecificDialogue(survivor, context = {}) {
    const player = this.gameManager.getPlayerSurvivor?.();
    const memory = this.gameManager.systems?.socialMemorySystem;
    const initiator = context.initiator || 'player';
    const phase = context.phase || this._getConversationPhase();
    const npcMemory = this._getNpcMemoryEntry(survivor);
    const subTopic = context.subTopic || 'trustCheck';
    const playerSelectedTopicPerson = Boolean(context.topicPersonName || context.topicPerson);
    let targetName = context.topicPersonName || context.topicPerson || (subTopic === 'idol' ? null : (this._pickTargetName(survivor, context) || 'someone'));
    if (context.subTopic === 'idol' && !playerSelectedTopicPerson && npcMemory?.idolSuspectName) {
      targetName = npcMemory.idolSuspectName;
    }
    const targetId = targetName ? (context.topicPersonId || context.topicId || this._getSurvivorByName(targetName)?.id || null) : null;

    const relationshipValue = this._relationshipBetween(player?.id, survivor?.id) || 50;
    const trustScore = Math.round(this.gameManager.getTrust?.(player?.id, survivor?.id) ?? 50);
    const targetRel = targetId ? this._relationshipBetween(survivor?.id, targetId) : 50;
    const style = this._classifyStyle(survivor);
    const repeated = targetId ? memory?.hasTalkedAboutTargetRecently?.(survivor.id, targetId) : false;
    const repeatedByMemory = subTopic === 'idol' && !playerSelectedTopicPerson && !!npcMemory?.idolSuspectName;

    const playerPromptMap = {
      trustCheck: () => `You ask where ${targetName} stands for them.`,
      challengePraise: () => `You bring up ${targetName} doing well in the challenge.`,
      challengeCritique: () => `You point out ${targetName} struggling in the challenge.`,
      idol: () => playerSelectedTopicPerson && targetName
        ? `You float that ${targetName} might have an idol.`
        : 'You ask if anyone has an idol.',
      nameHeard: () => `You mention hearing ${targetName}’s name.`,
      nameMentionedPlayer: () => `You ask if ${targetName} has been saying your name.`,
      nameDrop: () => `You say you heard ${targetName} mentioned their name.`,
      considerWork: () => `You tell them you’re considering working with ${targetName}.`,
      dangerLater: () => `You admit you’re worried about ${targetName} later.`,
      voteTonight: () => `You ask if they’d vote ${targetName} tonight.`,
      drivingVote: () => `You ask if ${targetName} is driving the vote.`,
      haveDeal: () => `You ask if ${targetName} has a deal in motion.`
    };
    const playerNarrationBase = playerPromptMap[subTopic]
      ? playerPromptMap[subTopic]()
      : `You ask for their read on ${targetName || 'someone'}.`;

    let responseLine = '';
    let intelContext = 'heard_rumor';
    let confidence = Math.max(10, Math.min(95, Math.round(trustScore + (style.isStrategist ? 5 : 0) - (style.isVillain ? 5 : 0))));
    let mentionedNames = [];
    let dealOutcome = null;
    const disclosure = this._resolveDisclosure({
      npc: survivor,
      player,
      targetId,
      topic: subTopic,
      pressureLevel: context.pressureLevel || 0
    });

    if ((repeated || repeatedByMemory) && targetName) {
      responseLine = this._npcDoes(survivor, 'shakes', 'shake', `their head. "You already asked about ${targetName}. I don’t have more."`);
      confidence = Math.max(10, confidence - 15);
    } else {
      switch (subTopic) {
        case 'trustCheck': {
          intelContext = 'trust_check';
          responseLine = targetRel > 65
            ? this._npcDoes(survivor, 'nods', 'nod', `"I trust ${targetName} more than most."`)
            : this._npcDoes(survivor, 'shrugs', 'shrug', `"I’m still reading ${targetName}."`);
          break;
        }
        case 'challengePraise':
        case 'challengeCritique': {
          intelContext = 'challenge_comment';
          const performance = this._getChallengePerformanceTag(targetId);
          const isPraise = subTopic === 'challengePraise';
          if (performance === 'mvp') {
            responseLine = isPraise
              ? this._npcDoes(survivor, 'nods', 'nod', `"${targetName} carried a lot out there."`)
              : this._npcDoes(survivor, 'frowns', 'frown', `"${targetName} actually carried us, I’m not sure I’d say struggled."`);
          } else if (performance === 'lvp') {
            responseLine = isPraise
              ? this._npcDoes(survivor, 'hesitates', 'hesitate', `"${targetName} struggled more than they want to admit."`)
              : this._npcDoes(survivor, 'agrees', 'agree', `"${targetName} had a rough one."`);
          } else {
            responseLine = isPraise
              ? this._npcDoes(survivor, 'nods', 'nod', `"${targetName} was solid, not flashy."`)
              : this._npcDoes(survivor, 'shrugs', 'shrug', `"${targetName} wasn’t great, wasn’t terrible."`);
          }
          break;
        }
        case 'idol': {
          intelContext = 'idol_suspicion';
          if (!targetName) {
            const available = this._getAvailableTargetNames(survivor);
            const claim = available.length ? available[getRandomInt(0, available.length - 1)] : null;
            if (disclosure.mode === 'truth' && claim) {
              responseLine = this._npcDoes(survivor, 'lowers', 'lower', `their voice. "If I had to guess, ${claim}."`);
            } else if (disclosure.mode === 'lie' && claim) {
              responseLine = this._npcDoes(survivor, 'shrugs', 'shrug', `"Maybe ${claim}, but that might be noise."`);
            } else {
              responseLine = this._npcDoes(survivor, 'shakes', 'shake', 'their head. "No proof. I’m not naming names."');
              context.skipIntel = true;
            }
            if (claim) {
              targetName = claim;
              context.suspectedIdolName = claim;
              context.topicPersonName = claim;
              context.topicPerson = claim;
              context.topicPersonId = this._getSurvivorByName(claim)?.id || null;
              context.topicId = context.topicPersonId;
            }
          } else {
            responseLine = trustScore > 65
              ? this._npcDoes(survivor, 'lowers', 'lower', `their voice. "${targetName} is the one people whisper about with idols."`)
              : this._npcDoes(survivor, 'shrugs', 'shrug', `"Maybe. ${targetName} gives idol vibes, but I don’t know."`);
          }
          if (npcMemory && !npcMemory.idolSuspectName && targetName) {
            npcMemory.idolSuspectName = targetName;
          }
          break;
        }
        case 'nameHeard': {
          intelContext = 'name_thrown_out';
          if (disclosure.mode === 'truth') {
            responseLine = this._npcDoes(survivor, 'admits', 'admit', `"Yeah, ${targetName}’s name keeps coming up."`);
          } else if (disclosure.mode === 'partial') {
            responseLine = this._npcDoes(survivor, 'hedges', 'hedge', `"I’ve heard whispers, but it’s not locked."`);
          } else {
            responseLine = this._npcDoes(survivor, 'shrugs', 'shrug', `"I’ve heard it, but I’m not getting into the weeds."`);
          }
          confidence = Math.max(10, confidence - (trustScore < 50 ? 10 : 0));
          break;
        }
        case 'nameMentionedPlayer': {
          intelContext = 'player_name_mentioned';
          if (trustScore > 65 && targetRel < 60) {
            responseLine = this._npcDoes(survivor, 'nods', 'nod', `slowly. "I did hear your name with ${targetName}. It wasn’t locked, but it was real."`);
          } else if (targetRel > 70) {
            responseLine = this._npcDoes(survivor, 'hesitates', 'hesitate', `"${targetName} and I are tight. If your name came up, it might’ve been smoke."`);
          } else if (trustScore < 45) {
            responseLine = this._npcDoes(survivor, 'narrows', 'narrow', 'their eyes. "That’s a big claim. I haven’t heard it myself."');
            confidence = Math.max(10, confidence - 15);
          } else {
            responseLine = this._npcSays(survivor, `I’ve heard your name in the mix with ${targetName}, but it’s not locked.`);
          }
          break;
        }
        case 'considerWork': {
          intelContext = 'working_with';
          responseLine = targetRel > 60
            ? this._npcDoes(survivor, 'nods', 'nod', `"${targetName} would be a steady number if you can lock it in."`)
            : this._npcDoes(survivor, 'cautions', 'caution', `"${targetName} might be slippery. Keep your eyes open."`);
          break;
        }
        case 'dangerLater': {
          intelContext = 'threat';
          responseLine = targetRel < 45
            ? this._npcDoes(survivor, 'agrees', 'agree', `"${targetName} could be a problem later."`)
            : this._npcDoes(survivor, 'hesitates', 'hesitate', `"${targetName}’s dangerous, but there are bigger threats too."`);
          break;
        }
        case 'voteTonight': {
          intelContext = 'target';
          if (this._isTooEarlyForVoteTalk()) {
            responseLine = this._npcDoes(survivor, 'exhales', 'exhale', `"It’s too early to lock that. Let’s see how today goes."`);
            context.skipIntel = true;
          } else if (this._isPlayerTribeSafeTonight()) {
            responseLine = this._npcDoes(survivor, 'shrugs', 'shrug', `"We’re safe tonight. I’m thinking longer-term."`);
            context.skipIntel = true;
          } else {
            const available = this._getAvailableTargetNames(survivor);
            const claim = targetName || (available.length ? available[getRandomInt(0, available.length - 1)] : null);
            if (disclosure.mode === 'truth' && claim) {
              responseLine = this._npcDoes(survivor, 'keeps', 'keep', `it low. "If it’s me, it’s ${claim}."`);
            } else if (disclosure.mode === 'lie' && claim) {
              responseLine = this._npcDoes(survivor, 'shrugs', 'shrug', `"Probably ${claim}."`);
              confidence = Math.max(10, confidence - 15);
            } else if (disclosure.mode === 'counter' && targetName) {
              const counterName = this._pickTargetName(survivor, { topicPerson: targetName }) || targetName;
              responseLine = this._npcDoes(survivor, 'tilts', 'tilt', `their head. "Why ${targetName}? What about ${counterName}?"`);
            } else {
              responseLine = this._npcDoes(survivor, 'shakes', 'shake', 'their head. "I’m not putting names out yet."');
              confidence = Math.max(10, confidence - 20);
              context.skipIntel = true;
            }
            if (claim && !context.topicPerson) {
              context.topicPerson = claim;
              context.topicId = this._getSurvivorByName(claim)?.id || null;
            }
          }
          break;
        }
        case 'drivingVote': {
          intelContext = 'driving_vote';
          const driving = targetRel < 45 || trustScore > 55;
          if (disclosure.mode === 'dodge') {
            responseLine = this._npcDoes(survivor, 'shrugs', 'shrug', `"Hard to say who’s steering it."`);
          } else {
            responseLine = driving
              ? this._npcDoes(survivor, 'nods', 'nod', `"${targetName} has been steering the chatter."`)
              : this._npcDoes(survivor, 'shrugs', 'shrug', `"I don’t see ${targetName} running it."`);
          }
          break;
        }
        case 'haveDeal': {
          intelContext = 'deal';
          const deals = this.gameManager.systems?.socialMemorySystem?.getDealsBetween?.(survivor.id, targetId) || [];
          if (disclosure.mode === 'truth' && deals.length) {
            responseLine = this._npcDoes(survivor, 'admits', 'admit', `"${targetName} has a couple deals floating."`);
          } else if (disclosure.mode === 'lie' && !deals.length) {
            responseLine = this._npcDoes(survivor, 'shrugs', 'shrug', `"Maybe. ${targetName} works people."`);
          } else {
            responseLine = this._npcDoes(survivor, 'shakes', 'shake', 'their head. "Not that I’ve seen."');
          }
          break;
        }
        default: {
          intelContext = 'heard_rumor';
          responseLine = this._npcDoes(survivor, 'shrugs', 'shrug', `"Hard to read ${targetName} right now."`);
          break;
        }
      }
    }

    const playerLine = initiator === 'npc'
      ? `You let ${survivor.firstName} lead for a beat, then ${playerNarrationBase.charAt(0).toLowerCase()}${playerNarrationBase.slice(1)}`
      : playerNarrationBase;
    const npcLine = responseLine;
    const line = npcLine;
    const finalTopicName = context.topicPersonName || context.topicPerson || targetName;
    const finalTargetId = context.targetId || context.topicPersonId || targetId || (finalTopicName ? this._getSurvivorByName(finalTopicName)?.id || null : null);
    if (npcMemory?.lastDiscussedNames && finalTopicName) {
      if (!npcMemory.lastDiscussedNames.includes(finalTopicName)) {
        npcMemory.lastDiscussedNames.push(finalTopicName);
      }
    }
    if (npcMemory && subTopic === 'idol') {
      npcMemory.lastIntentAsked = { ...(npcMemory.lastIntentAsked || {}), idol: Date.now() };
    }

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

    const responses = [
      { label: 'Press for more detail', mood: 'focused' },
      { label: 'Back off for now', mood: 'calm' },
      { label: 'Ask who else they trust', mood: 'curious', action: 'askFollowup' },
      { label: 'Offer a deal', mood: 'neutral', action: 'offerDealMenu' }
    ];
    if (subTopic === 'idol' && !playerSelectedTopicPerson) {
      responses.unshift({
        label: 'Name someone you suspect',
        mood: 'curious',
        requiresTargetPicker: true,
        awaitsPicker: true,
        targetPrompt: 'Who are you thinking?'
      });
    }

    return {
      playerLine,
      npcLine,
      text: line,
      responses,
      context: {
        ...context,
        topicPersonName: finalTopicName,
        topicPersonId: finalTargetId,
        topicPerson: finalTopicName,
        topicId: finalTargetId,
        targetId: finalTargetId,
        subTopic,
        phase,
        intelPayload: payload
      }
    };
  }

  _buildPitchTargetDialogue(survivor, context = {}) {
    const player = this.gameManager.getPlayerSurvivor?.();
    const phase = context.phase || this._getConversationPhase();
    const targetName = context.topicPerson || this._pickTargetName(survivor, context) || 'someone';
    const targetId = context.topicId || this._getSurvivorByName(targetName)?.id || null;
    const baseStance = this._computeNpcStance({ npc: survivor, player, intent: POST_PHASE_INTENTS.pitch_target, subjectId: targetId, context });
    const approachOutcome = this._resolveApproachInfluence({
      npc: survivor,
      player,
      intent: POST_PHASE_INTENTS.pitch_target,
      context,
      baseStance
    });
    const stance = approachOutcome.stance;

    let responseLine = '';
    let rejected = false;
    if (this._isTooEarlyForVoteTalk()) {
      responseLine = `${survivor.firstName} shakes their head. "Too early to lock a vote. Let’s read the day."`;
      rejected = true;
    } else if (this._isPlayerTribeSafeTonight()) {
      responseLine = `${survivor.firstName} shrugs. "We’re safe tonight. Let’s think long-term."`;
      rejected = true;
    } else if (approachOutcome.approachAccepted === false) {
      responseLine = `${survivor.firstName} narrows their eyes. "I’m not taking that bait right now."`;
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

    responseLine = this._normalizeSelfReferenceInQuotes(responseLine, survivor, targetName, targetId);

    return {
      playerLine: `You pitch ${targetName} as a possible vote.`,
      npcLine: responseLine,
      text: responseLine,
      responses: [
        { label: 'Press for commitment', mood: 'focused' },
        { label: 'Ask who else they’d consider', mood: 'neutral' },
        { label: 'Back off for now', mood: 'calm' },
        { label: 'Offer a deal', mood: 'focused', action: 'offerDealMenu' }
      ],
      context: {
        ...context,
        topicPerson: targetName,
        targetId,
        phase,
        targetRejected: rejected,
        approachAccepted: approachOutcome.approachAccepted ?? null,
        approachScore: approachOutcome.approachScore || null
      }
    };
  }

  _buildDeflectDialogue(survivor, context = {}) {
    const player = this.gameManager.getPlayerSurvivor?.();
    const phase = context.phase || this._getConversationPhase();
    const subjectName = context.topicPerson || 'someone';
    const subjectId = context.topicId || this._getSurvivorByName(subjectName)?.id || null;
    const alternateName = context.alternateName || 'someone else';
    const baseStance = this._computeNpcStance({ npc: survivor, player, intent: POST_PHASE_INTENTS.deflect_target, subjectId, context });
    const approachOutcome = this._resolveApproachInfluence({
      npc: survivor,
      player,
      intent: POST_PHASE_INTENTS.deflect_target,
      context,
      baseStance
    });
    const stance = approachOutcome.stance;
    const responseLine = approachOutcome.approachAccepted === false
      ? `${survivor.firstName} stiffens. "I’m not shifting votes like that."`
      : this._pickNpcResponse(POST_PHASE_INTENTS.deflect_target, stance, {
      subjectName,
      npcName: survivor.firstName
    }, survivor);

    return {
      playerLine: `You try to lower heat on ${subjectName} and float ${alternateName} instead.`,
      npcLine: responseLine,
      text: responseLine,
      responses: [
        { label: 'Ask if they’ll help redirect', mood: 'focused' },
        { label: 'Back off for now', mood: 'calm' },
        { label: 'Offer a deal', mood: 'neutral', action: 'offerDealMenu' }
      ],
      context: {
        ...context,
        topicPerson: subjectName,
        targetId: subjectId,
        phase,
        approachAccepted: approachOutcome.approachAccepted ?? null,
        approachScore: approachOutcome.approachScore || null
      }
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
    const baseStance = this._computeNpcStance({ npc: survivor, player, intent: POST_PHASE_INTENTS.verify_story, subjectId: targetId, context });
    const approachOutcome = this._resolveApproachInfluence({
      npc: survivor,
      player,
      intent: POST_PHASE_INTENTS.verify_story,
      context,
      baseStance
    });
    const stance = approachOutcome.stance;

    let responseLine = this._pickNpcResponse(POST_PHASE_INTENTS.verify_story, stance, {
      subjectName: targetName,
      npcName: survivor.firstName
    }, survivor);

    if (approachOutcome.approachAccepted === false) {
      responseLine = `${survivor.firstName} shakes their head. "I’m not getting dragged into that."`;
    }

    if (npcMentioned && stance !== 'hostile') {
      responseLine = `${survivor.firstName} nods. "Yeah, I said ${targetName}’s name, but I didn’t start it."`;
    }

    responseLine = this._normalizeSelfReferenceInQuotes(responseLine, survivor, targetName, targetId);

    return {
      playerLine: `You ask if they were talking about ${targetName}.`,
      npcLine: responseLine,
      text: responseLine,
      responses: [
        { label: 'Press for details', mood: 'focused' },
        { label: 'Let it go', mood: 'calm' },
        { label: 'Offer a deal instead', mood: 'neutral', action: 'offerDealMenu' }
      ],
      context: {
        ...context,
        topicPerson: targetName,
        targetId,
        phase,
        approachAccepted: approachOutcome.approachAccepted ?? null,
        approachScore: approachOutcome.approachScore || null
      }
    };
  }

  _buildChallengeDebriefDialogue(survivor, context = {}) {
    const player = this.gameManager.getPlayerSurvivor?.();
    const phase = context.phase || this._getConversationPhase();
    const action = context.debriefAction || 'neutral';
    const targetName = context.topicPerson || context.targetName || 'someone';
    const targetId = context.topicId || context.targetId || this._getSurvivorByName(targetName)?.id || null;
    const relationshipSystem = this.gameManager.systems?.relationshipSystem;
    const targetRel = targetId ? (relationshipSystem?.getRelationship?.(survivor.id, targetId)?.value ?? 50) : 50;
    const trustScore = this._getTrustScore(survivor, player);
    const target = targetId ? this._getSurvivorById(targetId) : null;
    const threat = target?.challengeThreat ?? 50;
    const approachOutcome = this._resolveApproachInfluence({
      npc: survivor,
      player,
      intent: POST_PHASE_INTENTS.challenge_debrief,
      context,
      baseStance: targetRel > 60 ? 'defensive' : 'neutral'
    });

    let npcLine = '';
    if (action === 'blame') {
      npcLine = targetRel > 65
        ? `${survivor.firstName} stiffens. "We’re not pinning everything on ${targetName}."`
        : `${survivor.firstName} nods. "${targetName} did slow us down."`;
    } else if (action === 'defend') {
      npcLine = targetRel > 65
        ? `${survivor.firstName} nods. "I’m with you—${targetName} doesn’t deserve the heat."`
        : `${survivor.firstName} hesitates. "I don’t know if I’d go to bat for ${targetName}."`;
    } else if (action === 'praise') {
      npcLine = threat > 65
        ? `${survivor.firstName} agrees. "${targetName} was big out there... and that’s dangerous later."`
        : `${survivor.firstName} smiles. "${targetName} really showed up."`;
    } else if (action === 'threat') {
      npcLine = targetRel > 60
        ? `${survivor.firstName} frowns. "${targetName} isn’t the threat you think."`
        : `${survivor.firstName} nods slowly. "${targetName} is a threat if we let them roll."`;
    } else if (action === 'debate') {
      npcLine = `${survivor.firstName} sighs. "Everyone had a hand in it, but ${targetName} did struggle."`;
    } else {
      npcLine = `${survivor.firstName} takes a breath. "We lost, but we can reset and stick together."`;
    }

    if (approachOutcome.approachAccepted === false) {
      npcLine = `${survivor.firstName} narrows their eyes. "I’m not going there right now."`;
    }

    return {
      playerLine: action === 'neutral'
        ? 'You call for calm and unity after the challenge.'
        : `You ${action === 'threat' ? 'frame' : action} ${targetName} in the debrief.`,
      npcLine,
      text: npcLine,
      responses: [
        { label: 'Hold the line', mood: 'focused' },
        { label: 'Back off', mood: 'calm' },
        { label: 'Pivot to strategy', mood: 'neutral', action: 'offerDealMenu' }
      ],
      context: {
        ...context,
        topicPerson: targetName,
        targetId,
        phase,
        approachAccepted: approachOutcome.approachAccepted ?? null,
        approachScore: approachOutcome.approachScore || null,
        debriefAction: action,
        trustScore
      }
    };
  }

  _buildIdolTalkDialogue(survivor, context = {}) {
    const player = this.gameManager.getPlayerSurvivor?.();
    const phase = context.phase || this._getConversationPhase();
    const intent = context.intent || context.socialType || null;
    const targetName = context.topicPerson || 'someone';
    const targetId = context.topicId || this._getSurvivorByName(targetName)?.id || null;
    const trustScore = this._getTrustScore(survivor, player);
    const disclosure = this._resolveDisclosure({
      npc: survivor,
      player,
      targetId,
      topic: 'idol',
      pressureLevel: context.approach === STRATEGY_APPROACHES.PRESSURE ? 0.7 : 0.3,
      context: {
        trueTarget: targetName,
        availableTargets: this._getAvailableTargetNames(survivor),
        location: context.location
      }
    });

    let playerLine = '';
    let npcLine = '';
    let idolPayload = null;

    if (intent === POST_PHASE_INTENTS.idol_ask_found) {
      playerLine = 'You ask if they found an idol.';
      const npcHasIdol = this._survivorHasIdol(survivor.id);
      if (disclosure.mode === 'truth') {
        npcLine = npcHasIdol
          ? `${survivor.firstName} admits quietly, "Yeah. I found one."`
          : `${survivor.firstName} shakes their head. "No idol for me."`;
      } else if (disclosure.mode === 'lie') {
        npcLine = npcHasIdol
          ? `${survivor.firstName} shrugs. "Nope, nothing."`
          : `${survivor.firstName} lowers their voice. "Maybe."`;
      } else {
        npcLine = `${survivor.firstName} deflects. "Why are you asking?"`;
      }
      idolPayload = { type: 'found', truthiness: disclosure.mode };
    } else if (intent === POST_PHASE_INTENTS.idol_ask_who_has) {
      playerLine = 'You ask who has an idol.';
      const availableTargets = this._getAvailableTargetNames(survivor);
      const knownHolder = this._findIdolHolderInTribe();
      const disclosureForWho = this._resolveDisclosure({
        npc: survivor,
        player,
        targetId: knownHolder?.id || null,
        topic: 'idol',
        pressureLevel: context.approach === STRATEGY_APPROACHES.PRESSURE ? 0.7 : 0.25,
        context: {
          trueTarget: knownHolder?.firstName || null,
          availableTargets,
          location: context.location
        }
      });
      const claim = disclosureForWho.claimedTarget || (availableTargets.length ? availableTargets[getRandomInt(0, availableTargets.length - 1)] : null);
      if (disclosureForWho.mode === 'truth' && claim) {
        npcLine = `${survivor.firstName} whispers, "I’ve heard ${claim} might have one."`;
      } else if (disclosureForWho.mode === 'lie' && claim) {
        npcLine = `${survivor.firstName} says, "It’s probably ${claim}."`;
      } else {
        npcLine = `${survivor.firstName} shakes their head. "I can’t pin it on anyone."`;
      }
      idolPayload = { type: 'who', claim, truthiness: disclosureForWho.mode };
    } else if (intent === POST_PHASE_INTENTS.idol_ask_looked_where) {
      playerLine = 'You ask where they have looked for idols.';
      if (disclosure.mode === 'truth' || disclosure.mode === 'partial') {
        npcLine = `${survivor.firstName} says, "I poked around the ${disclosure.detail?.location || 'jungle path'}."`;
        idolPayload = { type: 'where', location: disclosure.detail?.location || 'jungle path', truthiness: disclosure.mode };
      } else if (disclosure.mode === 'lie') {
        npcLine = `${survivor.firstName} claims, "Mostly by the ${disclosure.detail?.location || 'water well'}."`;
        idolPayload = { type: 'where', location: disclosure.detail?.location || 'water well', truthiness: 'lie' };
      } else {
        npcLine = `${survivor.firstName} shrugs. "I’m not giving up spots."`;
        idolPayload = { type: 'where', location: null, truthiness: 'refused' };
      }
    } else if (intent === POST_PHASE_INTENTS.idol_claim_have_truth) {
      playerLine = 'You tell them you have an idol.';
      npcLine = trustScore > 65
        ? `${survivor.firstName} nods, impressed. "That’s a big get."`
        : `${survivor.firstName} watches you carefully. "Okay. Good to know."`;
      idolPayload = { type: 'player_claim', truthiness: 'truth' };
    } else if (intent === POST_PHASE_INTENTS.idol_claim_have_lie) {
      playerLine = 'You bluff that you have an idol.';
      npcLine = `${survivor.firstName} raises a brow. "Alright... I hear you."`;
      idolPayload = { type: 'player_claim', truthiness: 'lie' };
    } else if (intent === POST_PHASE_INTENTS.idol_claim_other_has_lie) {
      playerLine = `You plant a rumor that ${targetName} has an idol.`;
      npcLine = targetName
        ? `${survivor.firstName} whispers, "If ${targetName} has it, that changes everything."`
        : `${survivor.firstName} whispers, "That’s dangerous info."`;
      idolPayload = { type: 'rumor', targetName, targetId };
    } else if (intent === POST_PHASE_INTENTS.idol_pressure_for_info) {
      playerLine = 'You push for the truth about idols.';
      if (disclosure.mode === 'truth') {
        npcLine = `${survivor.firstName} exhales. "Fine. I heard it might be near the ${disclosure.detail?.location || 'water well'}."`;
        idolPayload = { type: 'pressure', location: disclosure.detail?.location || 'water well', truthiness: 'truth' };
      } else if (disclosure.mode === 'lie') {
        npcLine = `${survivor.firstName} shrugs. "It’s probably at the ${disclosure.detail?.location || 'beach'}."`;
        idolPayload = { type: 'pressure', location: disclosure.detail?.location || 'beach', truthiness: 'lie' };
      } else {
        npcLine = `${survivor.firstName} pulls back. "Back off."`;
        idolPayload = { type: 'pressure', location: null, truthiness: 'refused' };
      }
    } else {
      playerLine = 'You ask about idols in camp.';
      npcLine = `${survivor.firstName} shrugs. "Idol talk is everywhere right now."`;
    }

    console.log('IDOL TALK OUTCOME', { intent, npc: survivor?.firstName || survivor?.id, idolPayload });
    if (typeof window !== 'undefined' && typeof window.debugBanner === 'function') {
      window.debugBanner('Idol talk', intent || 'idol');
    }

    return {
      playerLine,
      npcLine,
      text: npcLine,
      responses: [
        { label: 'Press for more', mood: 'focused' },
        { label: 'Back off', mood: 'calm' },
        { label: 'Change topic', mood: 'neutral' }
      ],
      context: {
        ...context,
        topicPerson: targetName,
        targetId,
        phase,
        idolPayload,
        intent: intent || null
      }
    };
  }

  _buildSplitVoteDialogue(survivor, context = {}) {
    const phase = context.phase || this._getConversationPhase();
    const splitTargets = Array.isArray(context.splitTargets) ? context.splitTargets : [];
    const targetLabel = splitTargets.filter(Boolean).join(' and ') || context.topicPerson || 'two names';
    const responseLine = `${survivor.firstName} weighs the split. "That’s risky, but I’ll hear you out."`;

    return {
      playerLine: `You pitch a split vote between ${targetLabel}.`,
      npcLine: responseLine,
      text: responseLine,
      responses: [
        { label: 'Lock the split', mood: 'focused' },
        { label: 'Offer flexibility', mood: 'neutral' },
        { label: 'Back off', mood: 'calm' }
      ],
      context: {
        ...context,
        dealType: context.dealType || 'splitVote',
        phase
      }
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

    responseLine = this._normalizeSelfReferenceInQuotes(responseLine, survivor, subjectName, subjectId);

    return {
      playerLine: `You ask about ${subjectName} in the challenge.`,
      npcLine: responseLine,
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

    const disclosure = this._resolveDisclosure({
      npc: survivor,
      player,
      topic: 'voteTonight',
      context: { availableTargets: this._getAvailableTargetNames(survivor), relationshipSystem }
    });

    let responseLine = '';
    const claim = disclosure.claimedTarget || null;
    if (disclosure.mode === 'truth') {
      responseLine = this._npcDoes(survivor, 'answers', 'answer', `directly. "If I\'m voting, it\'s ${claim || 'someone'}."`);
    } else if (disclosure.mode === 'lie') {
      responseLine = this._npcDoes(survivor, 'glances', 'glance', `away. "Probably ${claim || 'someone'}."`);
    } else {
      responseLine = this._npcDoes(survivor, 'shuts', 'shut', `it down. "I\'m not saying names yet."`);
    }

    const payload = claim
      ? {
          aboutName: claim,
          context: 'target',
          fromId: survivor.id,
          fromName: survivor.firstName,
          toId: player?.id || null,
          phase,
          confidence: disclosure.mode === 'truth' ? 70 : disclosure.mode === 'lie' ? 35 : 20,
          shortText: responseLine
        }
      : null;

    const playerLine = initiator === 'player' ? leadLine : '';
    const npcLine = initiator === 'npc' ? `${leadLine} ${responseLine}`.trim() : responseLine;

    return {
      playerLine,
      npcLine,
      text: npcLine,
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
    const latest = challengeManager.getLatestChallengeResult?.() || results[results.length - 1];
    if (!latest) return 'neutral';
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
      case 'splitVote': {
        const splitTargets = Array.isArray(context.splitTargets) ? context.splitTargets.filter(Boolean) : [];
        return splitTargets.length ? `splitting votes between ${splitTargets.join(' and ')}` : 'a split vote plan';
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
      POST_PHASE_INTENTS.offer_deal_final2,
      POST_PHASE_INTENTS.offer_split_vote
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
    const approach = context.approach;
    if (approach) {
      const approachScore = this.scoreStrategicApproach({ npc: survivor, player, intent: context.intent || 'deal', approach, context });
      context.approachScore = context.approachScore || approachScore;
      score += (approachScore.acceptChance - 0.5) * 20;
    }

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
    if (context.dealType === 'splitVote') {
      score -= 10;
      const allianceSystem = this.gameManager.systems?.allianceSystem;
      if (allianceSystem?.areAllied?.(player?.id, survivor.id)) score += 6;
      if (this._getTrustScore(survivor, player) > 70) score += 4;
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

  _clamp01(value) {
    const num = typeof value === 'number' ? value : 0;
    return Math.max(0, Math.min(1, num));
  }

  _applyApproachStanceBias(stance, stanceBias = 0) {
    if (!stanceBias) return stance;
    const order = ['hostile', 'defensive', 'suspicious', 'evasive', 'neutral', 'intrigued', 'supportive', 'committal'];
    const index = order.indexOf(stance);
    if (index === -1) return stance;
    const nextIndex = Math.max(0, Math.min(order.length - 1, index + stanceBias));
    return order[nextIndex];
  }

  scoreStrategicApproach({ npc, player, intent, approach, context = {} }) {
    const relationshipSystem = this.gameManager.systems?.relationshipSystem;
    const socialMemory = this.gameManager.systems?.socialMemorySystem;
    const allianceSystem = this.gameManager.systems?.allianceSystem;
    const relationship = relationshipSystem?.getRelationship?.(player?.id, npc?.id)?.value ?? 50;
    const trust = this.gameManager.getTrust?.(player?.id, npc?.id) ?? 50;
    const reliability = socialMemory?.getReliability?.(player?.id) ?? 50;
    const personality = (npc?.personality || npc?.gameplayStyle || '').toLowerCase();
    const loyal = personality.includes('loyal') || personality.includes('honest');
    const deceptive = personality.includes('deceptive') || personality.includes('shadow') || personality.includes('strategic');
    const willpower = npc?.willpower ?? 50;

    let acceptChance = this._clamp01(((relationship * 0.55) + (trust * 0.35) + (reliability * 0.1)) / 100);
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
        const dealScore = allianceSystem?.scoreDealAcceptance?.({ offererId: player?.id, receiverId: npc?.id }) ?? acceptChance;
        acceptChance = this._clamp01(dealScore + 0.05);
        stanceBias = 1;
        trustDelta = 1;
        reliabilityDelta = 1;
        break;
      }
      case STRATEGY_APPROACHES.DEAL_MAKING: {
        const dealScore = allianceSystem?.scoreDealAcceptance?.({ offererId: player?.id, receiverId: npc?.id }) ?? acceptChance;
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
        memoryEvents.push({ type: 'lie', lieType: intent });
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
      memoryEvents
    };
  }

  _resolveApproachInfluence({ npc, player, intent, context, baseStance }) {
    const approach = context.approach;
    if (!approach) return { stance: baseStance, approachScore: null, approachAccepted: null };
    const score = this.scoreStrategicApproach({ npc, player, intent, approach, context });
    console.log('RESOLVE APPROACH SCORE', { intent, approach, npc: npc?.firstName || npc?.id, score });
    if (typeof window !== 'undefined' && typeof window.debugBanner === 'function') {
      window.debugBanner('Approach score', `${approach} (${Math.round(score.acceptChance * 100)}%)`);
    }
    const roll = Math.random();
    const accepted = roll < score.acceptChance;
    let stance = this._applyApproachStanceBias(baseStance, score.stanceBias + (accepted ? 1 : -1));
    if (!accepted && ['committal', 'supportive', 'neutral'].includes(stance)) {
      stance = 'evasive';
    }
    return { stance, approachScore: score, approachAccepted: accepted };
  }

  _computeNpcStance({ npc, player, intent, subjectId = null, context = {} }) {
    const relationshipSystem = this.gameManager.systems?.relationshipSystem;
    const socialMemory = this.gameManager.systems?.socialMemorySystem;
    const allianceSystem = this.gameManager.systems?.allianceSystem;
    const relationship = relationshipSystem?.getRelationship?.(player?.id, npc?.id)?.value ?? 50;
    const memoryTrust = this.gameManager.getTrust?.(player?.id, npc?.id) ?? 50;
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
    if ([POST_PHASE_INTENTS.offer_deal_vote_together, POST_PHASE_INTENTS.offer_deal_share_info, POST_PHASE_INTENTS.offer_deal_protect, POST_PHASE_INTENTS.offer_deal_final2, POST_PHASE_INTENTS.offer_split_vote].includes(intent)) {
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

  _ensureNpcReplyLine(line, survivor, stance, context = {}, intent) {
    const trimmed = String(line || '').trim();
    if (!trimmed) {
      return this._pickNpcResponse(intent, stance, context, survivor);
    }
    const withNames = trimmed
      .replace('{npc}', this._npcDisplayName(survivor) || context.npcName || 'They')
      .replace('{subjectName}', context.subjectName || 'someone');
    const normalized = this._normalizeSelfReferenceInQuotes(
      withNames,
      survivor,
      context.subjectName,
      context.subjectId || context.topicPersonId || context.topicId
    );
    if (normalized.includes(survivor?.firstName || '') || /["“]/.test(normalized)) {
      return this._normalizeNpcVerbAgreement(normalized);
    }
    return this._npcSays(survivor, normalized);
  }

  _pickNpcResponse(intent, stance, context = {}, survivor) {
    const templates = NPC_RESPONSE_TEMPLATES[intent];
    if (!templates) {
      return `{npc} hesitates. "I’m not ready to commit to that yet."`;
    }

    const pool = templates[stance] || templates.neutral || templates.supportive || Object.values(templates)[0] || [];
    if (!Array.isArray(pool) || pool.length === 0) {
      return `{npc} exhales. "I need a little more time before I commit."`;
    }

    let line = pool[getRandomInt(0, pool.length - 1)];
    const memory = this.gameManager.systems?.socialMemorySystem;
    let safety = 0;
    while (memory?.recentlyUsed?.(survivor?.id, line) && safety < 3) {
      line = pool[getRandomInt(0, pool.length - 1)];
      safety += 1;
    }
    memory?.rememberBeat?.(survivor?.id, intent, line);
    const subjectName = context.subjectName || context.topicPersonName || context.topicPerson || null;
    const subjectId = context.subjectId || context.topicPersonId || context.topicId || null;
    const resolved = line
      .replace('{npc}', context.npcName || survivor?.firstName || 'They')
      .replace('{subjectName}', subjectName || 'them');
    return this._normalizeSelfReferenceInQuotes(resolved, survivor, subjectName, subjectId);
  }

  _resolvePlayerNarration(choice, intent, context = {}) {
    const raw = choice?.playerLine || choice?.playerNarration || null;
    if (raw) {
      return this._formatPlayerNarration(raw, intent);
    }
    const label = choice?.label || '';
    const inferred = this._inferNarrationFromLabel(label, intent, context);
    return this._formatPlayerNarration(inferred, intent);
  }

  _inferNarrationFromLabel(label, intent, context = {}) {
    const lower = String(label || '').toLowerCase();
    if (!lower) return this._fallbackPlayerNarration(intent);
    if (lower.includes('apologize')) return 'You apologize and keep your eyes steady.';
    if (lower.includes('thank')) return 'You thank them and keep it warm.';
    if (lower.includes('ask') || lower.includes('press') || lower.includes('detail')) return 'You press for more detail, careful not to overdo it.';
    if (lower.includes('deflect') || lower.includes('dodge')) return 'You dodge the answer and keep it vague.';
    if (lower.includes('counter')) return 'You float a different name and watch their reaction.';
    if (lower.includes('share') || lower.includes('name')) return 'You share a name quietly and read their face.';
    if (lower.includes('commit') || lower.includes('lock')) return 'You commit to the plan without hesitation.';
    if (lower.includes('back off') || lower.includes('leave it')) return 'You back off and let the moment breathe.';
    if (lower.includes('end')) return 'You signal that you are done talking for now.';
    if (lower.includes('joke') || lower.includes('humor')) return 'You crack a light joke to ease the tension.';
    return this._fallbackPlayerNarration(intent);
  }

  _choiceKey(choice) {
    if (!choice) return '';
    const key = choice.id || choice.label || choice.action || '';
    return String(key).trim().toLowerCase();
  }

  _logEndConversationClick(reason, session) {
    if (typeof console === 'undefined') return;
    console.debug('ConversationSystem: End Conversation clicked.', {
      reason,
      npcId: session?.npcId || this.state?.npcId || null
    });
  }

  _isEndConversationChoice(choice) {
    if (!choice) return false;
    if (choice.end || choice.action === 'endConversation') return true;
    const label = typeof choice.label === 'string' ? choice.label : '';
    if (/end conversation/i.test(label)) return true;
    const id = typeof choice.id === 'string' ? choice.id.replace(/[-_]/g, ' ') : '';
    if (id && /end conversation/i.test(id)) return true;
    const key = this._choiceKey(choice);
    return /end conversation/i.test(key);
  }

  _wrapNavHandler(handler, session) {
    return () => {
      try {
        return typeof handler === 'function' ? handler() : null;
      } catch (error) {
        console.error('ConversationSystem: nav handler failed', error);
        this.closeConversation('error_exit', session);
        return null;
      }
    };
  }

  _buildEndConversationHandler(session, onSelect = null) {
    return () => {
      this._logEndConversationClick('player_end', session);
      try {
        if (typeof onSelect === 'function') {
          onSelect();
        }
      } catch (error) {
        console.error('ConversationSystem: end conversation handler failed', error);
        this.closeConversation('error_exit', session);
        return;
      }
      this.closeConversation('player_end', session);
    };
  }

  _isNavChoice(choice) {
    const key = this._choiceKey(choice);
    return ['nav-back', 'nav-change-topic', 'nav-end-conversation', 'back', 'change topic', 'end conversation'].includes(key);
  }

  _buildNavChoices({ canBack, canChangeTopic, onBack, onChangeTopic, onEnd, session, includeEnd = true }) {
    const buttons = [];
    if (canBack) {
      buttons.push({
        id: 'nav-back',
        label: 'Back',
        alt: true,
        action: 'goBack',
        playerLine: 'You circle back in the conversation.',
        onSelect: this._wrapNavHandler(onBack, session)
      });
    }
    if (canChangeTopic) {
      buttons.push({
        id: 'nav-change-topic',
        label: 'Change Topic',
        alt: true,
        action: 'changeTopic',
        playerLine: 'You steer the conversation to a new topic.',
        onSelect: this._wrapNavHandler(onChangeTopic, session)
      });
    }
    if (includeEnd) {
      buttons.push({
        id: 'nav-end-conversation',
        label: 'End Conversation',
        alt: true,
        end: true,
        action: 'endConversation',
        playerLine: 'You wrap up the conversation for now.',
        onSelect: this._buildEndConversationHandler(session, onEnd)
      });
    }
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
    const normalized = (Array.isArray(choices) ? choices : []).map(choice => {
      if (!this._isEndConversationChoice(choice)) return choice;
      return {
        ...choice,
        end: true,
        action: choice.action || 'endConversation',
        onSelect: this._buildEndConversationHandler(navOptions.session, choice.onSelect)
      };
    });
    const hasEndChoice = normalized.some(choice => this._isEndConversationChoice(choice));
    const trimmed = normalized.filter(choice => !this._isNavChoice(choice) || this._isEndConversationChoice(choice));
    const navChoices = this._buildNavChoices({ ...navOptions, includeEnd: !hasEndChoice });
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
      const buttonEl = this._createChoiceButton({
        label: choice.label,
        alt: choice.alt,
        onClick: () => {
          try {
            if (choice.onSelect) {
              choice.onSelect();
              return;
            }
            if (choice.end) {
              this._logEndConversationClick('player_end', navOptions.session);
              this.closeConversation('player_end', navOptions.session);
            }
          } catch (error) {
            console.error('ConversationSystem: nav button handler failed', error);
            this.closeConversation('error_exit', navOptions.session);
          }
        }
      });
      buttonEl.dataset.conversationNav = 'true';
      buttonColumn.appendChild(buttonEl);
    });
  }

  _buildNavOptions({ canBack, canChangeTopic, onBack, onChangeTopic, onEnd, session }) {
    return this._buildNavChoices({ canBack, canChangeTopic, onBack, onChangeTopic, onEnd, session });
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

  _applyStrategicApproachOutcome({ survivor, player, intent, context = {}, dealOutcome = null }) {
    const memory = this.gameManager.systems?.socialMemorySystem;
    if (!memory || !context.approach) return null;

    const approachScore = context.approachScore || this.scoreStrategicApproach({
      npc: survivor,
      player,
      intent,
      approach: context.approach,
      context
    });

    let accepted = context.approachAccepted;
    if (accepted == null && dealOutcome?.status) {
      accepted = dealOutcome.status === 'accepted' || dealOutcome.status === 'tentative';
    }
    if (accepted == null && typeof context.targetRejected === 'boolean') {
      accepted = !context.targetRejected;
    }

    let trustDelta = approachScore.trustDelta || 0;
    let reliabilityDelta = approachScore.reliabilityDelta || 0;
    let suspicionDelta = approachScore.suspicionDelta || 0;

    if (accepted === false) {
      trustDelta = Math.min(0, trustDelta) - 1;
      if (context.approach === STRATEGY_APPROACHES.TRUTHFUL) {
        trustDelta -= 1;
      }
    }
    if (accepted === true && context.approach === STRATEGY_APPROACHES.TRUTHFUL) {
      trustDelta = Math.max(1, trustDelta);
    }

    if (trustDelta) {
      this.gameManager.changeTrust?.(player?.id, survivor.id, trustDelta, `approach_${context.approach}`);
    }
    if (reliabilityDelta && player?.id) {
      memory.adjustReliability?.(player.id, reliabilityDelta);
    }

    const socialLog = ensureCampSocialChanges();
    if (trustDelta) {
      socialLog.trust.push({ id: survivor.id, with: survivor.firstName, amount: trustDelta, context: `approach_${context.approach}` });
    }
    if (reliabilityDelta && player?.id) {
      socialLog.reliability.push({ id: player.id, with: player.firstName, amount: reliabilityDelta, context: `approach_${context.approach}` });
    }
    if (suspicionDelta) {
      socialLog.suspicion.push({ id: survivor.id, with: survivor.firstName, amount: suspicionDelta, context: `approach_${context.approach}` });
    }

    console.log('NPC REACTION: trustDelta=', trustDelta, 'reliabilityDelta=', reliabilityDelta, 'suspicionDelta=', suspicionDelta);
    if (typeof window !== 'undefined' && typeof window.debugBanner === 'function') {
      window.debugBanner('Approach deltas', `T${trustDelta} R${reliabilityDelta} S${suspicionDelta}`);
    }

    const targetId = context.targetId || context.topicId || context.topicPersonId || null;
    if (Array.isArray(approachScore.memoryEvents)) {
      approachScore.memoryEvents.forEach(event => {
        if (event.type === 'lie' && player?.id) {
          memory.recordLie?.(player.id, targetId || survivor.id, event.lieType || intent, context.topicPersonName || context.topicPerson || '');
        }
      });
    }

    return { trustDelta, reliabilityDelta, suspicionDelta, accepted, approachScore };
  }

  _logConversationOutcome(survivor, intent, option, meeting, context = {}, dealOutcome = null) {
    const memory = this.gameManager.systems?.socialMemorySystem;
    if (!memory) return;
    if (context.location) {
      memory.recordMeetingContext(survivor.id, context.location);
    }

    const topicName = context.topicPersonName || context.topicPerson || context.targetName;
    const topicSurvivor = this._getSurvivorByName(topicName);
    const player = this.gameManager.getPlayerSurvivor?.();
    const playerId = player?.id;
    const targetId = topicSurvivor?.id;
    const ally = this._getSurvivorByName(context.playerNamedAllyName || context.npcTrustedPersonName || context.allyName);
    const speakerName = context?.initiator === 'player' ? 'Player' : survivor.firstName;
    const dayValue = this.gameManager.getCurrentDay?.() || this.gameManager.day || 1;
    const phase = context.phase || this._getConversationPhase();
    const npcName = survivor.firstName;
    const targetLabel = topicName || this._getSurvivorById(targetId)?.firstName || null;
    const socialType = context.socialType || intent;

    const strategicIntents = new Set([
      POST_PHASE_INTENTS.pitch_target,
      POST_PHASE_INTENTS.deflect_target,
      POST_PHASE_INTENTS.verify_story,
      POST_PHASE_INTENTS.offer_deal_vote_together,
      POST_PHASE_INTENTS.offer_deal_share_info,
      POST_PHASE_INTENTS.offer_deal_protect,
      POST_PHASE_INTENTS.offer_deal_final2,
      POST_PHASE_INTENTS.offer_split_vote,
      POST_PHASE_INTENTS.challenge_debrief,
      POST_PHASE_INTENTS.idol_ask_found,
      POST_PHASE_INTENTS.idol_ask_who_has,
      POST_PHASE_INTENTS.idol_ask_looked_where,
      POST_PHASE_INTENTS.idol_claim_have_truth,
      POST_PHASE_INTENTS.idol_claim_have_lie,
      POST_PHASE_INTENTS.idol_claim_other_has_lie,
      POST_PHASE_INTENTS.idol_pressure_for_info
    ]);

    if (strategicIntents.has(intent)) {
      this._applyStrategicApproachOutcome({
        survivor,
        player,
        intent,
        context,
        dealOutcome
      });
    }

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
      } else if (intent === 'warning' || intent === POST_PHASE_INTENTS.plant_seed) {
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
      case PRE_PHASE_INTENTS.bond_smalltalk:
      case PRE_PHASE_INTENTS.bond_personal:
      case 'bonding':
        logSocial('BONDING_MOMENT');
        this._recordStructuredSocialEvent({
          type: 'BONDING_MOMENT',
          speakerId: playerId || survivor.id,
          listenerId: survivor.id,
          data: { tone: 'positive' },
          summary: `You shared a bonding moment with ${npcName}.`
        });
        break;
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
          memory.recordTargetRequest?.(
            playerId || survivor.id,
            survivor.id,
            targetId,
            context.approach === STRATEGY_APPROACHES.PRESSURE ? 'high' : 'normal',
            context.approachAccepted === false ? 'reject' : 'agree'
          );
          if (context.approach === STRATEGY_APPROACHES.LIE && playerId) {
            memory.recordLie?.(playerId, targetId, 'pitch_target', targetLabel || '');
          }
        }
        if (targetLabel) {
          memory.recordNamedIntel?.({
            about: targetLabel,
            context: 'target',
            from: speakerName,
            day: dayValue,
            phase,
            confidence: 55
          });
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
      case POST_PHASE_INTENTS.plant_seed:
      case 'warning':
        if (targetLabel) {
          memory.recordNamedIntel?.({
            about: targetLabel,
            context: 'warning',
            from: speakerName,
            day: dayValue,
            phase,
            confidence: 50
          });
        }
        break;
      case POST_PHASE_INTENTS.offer_deal_vote_together:
      case POST_PHASE_INTENTS.offer_deal_share_info:
      case POST_PHASE_INTENTS.offer_deal_protect:
      case POST_PHASE_INTENTS.offer_deal_final2:
      case POST_PHASE_INTENTS.offer_split_vote: {
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
          if (playerId) {
            memory.recordPromise?.(survivor.id, playerId, context.dealType || intent);
          }
          memory.storeMemory?.(survivor.id, 'deal_made', { dealType: context.dealType || intent, day: dayValue, phase });
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
        if (intent === POST_PHASE_INTENTS.offer_split_vote) {
          memory.storeMemory?.(survivor.id, 'split_vote_pitch', {
            targets: context.splitTargets || [],
            day: dayValue,
            phase
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
        if (targetLabel) {
          memory.recordNamedIntel?.({
            about: targetLabel,
            context: 'idol_suspicion',
            from: speakerName,
            day: dayValue,
            phase,
            confidence: context.intelPayload?.confidence || 50
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
      case PRE_PHASE_INTENTS.light_strategy:
      case 'softStrategy':
        if (targetLabel && Math.random() < 0.6) {
          memory.recordNamedIntel?.({
            about: targetLabel,
            context: 'name_thrown_out',
            from: speakerName,
            day: dayValue,
            phase,
            confidence: 50
          });
        }
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
      case POST_PHASE_INTENTS.challenge_debrief: {
        const action = context.debriefAction || 'neutral';
        if (action === 'blame' && targetId) {
          memory.recordPlayerBlamedSurvivor?.(survivor.id, targetId, dayValue);
        }
        if (action === 'defend' && targetId) {
          memory.recordPlayerDefendedSurvivor?.(survivor.id, targetId, dayValue);
        }
        if (action === 'praise' && targetId) {
          memory.recordPlayerPraisedSurvivor?.(survivor.id, targetId, dayValue);
        }
        if (action === 'threat' && targetId) {
          memory.recordPlayerCalledThreat?.(survivor.id, targetId, dayValue);
        }
        memory.recordPlayerStrategizedWithNpc?.({
          npcId: survivor.id,
          claimedTargetId: targetId || null,
          promisedDeal: false,
          liedFlag: context.approach === STRATEGY_APPROACHES.LIE,
          day: dayValue
        });
        break;
      }
      case POST_PHASE_INTENTS.idol_ask_found:
      case POST_PHASE_INTENTS.idol_ask_who_has:
      case POST_PHASE_INTENTS.idol_ask_looked_where:
      case POST_PHASE_INTENTS.idol_claim_have_truth:
      case POST_PHASE_INTENTS.idol_claim_have_lie:
      case POST_PHASE_INTENTS.idol_claim_other_has_lie:
      case POST_PHASE_INTENTS.idol_pressure_for_info: {
        const idolPayload = context.idolPayload || null;
        if (intent === POST_PHASE_INTENTS.idol_claim_have_truth) {
          memory.recordPlayerClaimedIdolTruth?.(survivor.id, dayValue);
        }
        if (intent === POST_PHASE_INTENTS.idol_claim_have_lie) {
          memory.recordPlayerClaimedIdolLie?.(survivor.id, dayValue);
          if (playerId) {
            memory.recordLie?.(playerId, survivor.id, 'idol_claim', 'player_claimed_idol');
          }
        }
        if (intent === POST_PHASE_INTENTS.idol_claim_other_has_lie && targetId) {
          memory.recordPlayerPlantedIdolRumor?.(survivor.id, targetId, dayValue);
          if (playerId) {
            memory.recordLie?.(playerId, targetId, 'idol_rumor', targetLabel || '');
          }
        }
        if (intent === POST_PHASE_INTENTS.idol_ask_who_has && idolPayload?.claim) {
          memory.recordNpcSharedIdolInfo?.(survivor.id, 'who', idolPayload.claim, dayValue);
        }
        if (intent === POST_PHASE_INTENTS.idol_ask_found && idolPayload) {
          memory.recordNpcSharedIdolInfo?.(survivor.id, 'found', idolPayload.truthiness || null, dayValue);
        }
        if (intent === POST_PHASE_INTENTS.idol_ask_looked_where && idolPayload?.location) {
          memory.recordNpcSharedIdolInfo?.(survivor.id, 'where', idolPayload.location, dayValue);
        }
        if (intent === POST_PHASE_INTENTS.idol_pressure_for_info && idolPayload?.location) {
          memory.recordNpcSharedIdolInfo?.(survivor.id, 'where', idolPayload.location, dayValue);
        }
        if (idolPayload?.truthiness === 'refused') {
          memory.recordNpcRefusedIdolInfo?.(survivor.id, dayValue);
        }
        break;
      }
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
        if (intent === 'targeting' && targetLabel) {
          memory.recordNamedIntel?.({
            about: targetLabel,
            context: 'target',
            from: speakerName,
            day: dayValue,
            phase,
            confidence: 55
          });
        }
        if (intent === 'warning' && targetLabel) {
          memory.recordNamedIntel?.({
            about: targetLabel,
            context: 'warning',
            from: speakerName,
            day: dayValue,
            phase,
            confidence: 50
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

  _survivorHasIdol(survivorId) {
    if (!survivorId) return false;
    const idolSystem = this.gameManager.systems?.idolSystem;
    if (!idolSystem || typeof idolSystem.getSurvivorInventory !== 'function') return false;
    const inventory = idolSystem.getSurvivorInventory(survivorId);
    return Array.isArray(inventory?.idols) && inventory.idols.length > 0;
  }

  _findIdolHolderInTribe() {
    const tribe = this.gameManager.getPlayerTribe?.();
    const members = tribe?.members || this.gameManager.survivors || [];
    return members.find(member => this._survivorHasIdol(member?.id)) || null;
  }

  _clearOverlay(options = {}) {
    const { preserveSession = false, reason = null } = options;
    if (this._isConversationDebugEnabled()) {
      const stack = new Error().stack;
      this._debugLog('CONVO: clear overlay', {
        reason,
        preserveSession,
        npcId: this._activeOverlayNpcId || this.state?.npcId || null,
        stack
      });
      this._debugBanner('CONVO clear', reason || 'unknown');
    }
    this._clearApproachTimer();
    if (this.activeOverlay) {
      this.activeOverlay.remove();
      this.activeOverlay = null;
    }
    this._activeOverlayNpcId = null;
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
    if (!location) return '';
    const normalized = this._normalizeLocationKey(location);
    const labels = {
      [LocationKeys.BEACH.toLowerCase()]: 'beach',
      [LocationKeys.SHELTER.toLowerCase()]: 'shelter',
      [LocationKeys.CAMPFIRE.toLowerCase()]: 'campfire',
      [LocationKeys.WATER_WELL.toLowerCase()]: 'water well',
      [LocationKeys.ROCKY_SHORE.toLowerCase()]: 'rocky shore',
      [LocationKeys.FORK1.toLowerCase()]: 'jungle fork',
      [LocationKeys.FORK2.toLowerCase()]: 'jungle path',
      [LocationKeys.FORK3.toLowerCase()]: 'hidden trail',
      [LocationKeys.TREE_MAIL.toLowerCase()]: 'tree mail',
      [LocationKeys.MOUNTAIN_TRAIL.toLowerCase()]: 'mountain trail',
      [LocationKeys.JUNGLE_TRAIL.toLowerCase()]: 'jungle trail',
      [LocationKeys.WATERFALL_TRAIL.toLowerCase()]: 'waterfall trail',
      [LocationKeys.FIREWOOD.toLowerCase()]: 'firewood pile',
      [LocationKeys.BAMBOO.toLowerCase()]: 'bamboo grove',
      [LocationKeys.FISHING.toLowerCase()]: 'fishing spot'
    };
    return labels[normalized] || location;
  }

  _normalizeLocationKey(value) {
    return typeof value === 'string'
      ? value.trim().toLowerCase().replace(/[\s_-]+/g, '')
      : (value == null ? '' : String(value).trim().toLowerCase().replace(/[\s_-]+/g, ''));
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
