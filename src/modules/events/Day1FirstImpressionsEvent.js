import { getRandomInt, shuffleArray } from '../utils/CommonUtils.js';
import eventManager, { GameEvents } from '../core/EventManager.js';

const DEBUG_DAY1_EVENT = false;

function logDebug(message, payload = null) {
  if (!DEBUG_DAY1_EVENT) return;
  // eslint-disable-next-line no-console
  console.log(`[Day1FirstImpressions] ${message}`, payload);
}

function logSkip(reason, payload = null) {
  // eslint-disable-next-line no-console
  console.info(`[Day1FirstImpressions] Skipped: ${reason}`, payload);
  logDebug(reason, payload);
}

// Name helpers kept simple but consistently hide the player identity.
function displayName(survivorOrId, members, playerId) {
  const survivor = typeof survivorOrId === 'object' ? survivorOrId : members.find(m => m.id === survivorOrId);
  if (!survivor) return 'Someone';
  return survivor.id === playerId ? 'You' : survivor.firstName || 'Someone';
}

function formatIdsAsNameList(ids = [], members = [], playerId) {
  const seen = new Set();
  const names = ids
    .map(id => displayName(id, members, playerId))
    .filter(name => {
      if (!name) return false;
      if (name === 'You' && seen.has('You')) return false;
      seen.add(name);
      return true;
    });
  if (!names.length) return '';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
}

function formatPair(ids = [], members = [], playerId) {
  const uniqueIds = ids.filter((id, idx) => ids.indexOf(id) === idx);
  return formatIdsAsNameList(uniqueIds, members, playerId);
}

function clamp(value, min = 0, max = 100) {
  const num = Number.isFinite(value) ? value : min;
  return Math.max(min, Math.min(max, num));
}

function normalize0to100(value, fallback = 50) {
  if (value == null) return fallback;
  const num = Number.isFinite(value) ? value : fallback;
  if (num <= 1) return clamp(num * 100, 0, 100);
  return clamp(num, 0, 100);
}

function getNestedValue(obj, path) {
  return path.split('.').reduce((acc, key) => (acc && acc[key] != null ? acc[key] : undefined), obj);
}

function getTraitValue(survivor, traitKeyCandidates = [], fallback = 50) {
  if (!survivor) return fallback;
  for (const key of traitKeyCandidates) {
    const direct = survivor[key];
    if (Number.isFinite(direct)) return normalize0to100(direct, fallback);
    if (typeof key === 'string' && key.includes('.')) {
      const nested = getNestedValue(survivor, key);
      if (Number.isFinite(nested)) return normalize0to100(nested, fallback);
    }
  }
  return fallback;
}

function buildCapabilities(survivor) {
  const leadership = getTraitValue(survivor, ['leader', 'leadership', 'social.leadership', 'connections', 'alliances'], 45);
  const confidence = getTraitValue(survivor, ['fortitude', 'risk', 'aggression', 'confidence'], 45);
  const social = getTraitValue(survivor, ['likeability', 'social', 'charisma', 'alliances', 'connections'], 50);
  const survival = getTraitValue(survivor, ['survival', 'firemaking', 'idolhunt', 'awareness', 'fishing'], 40);
  const strength = getTraitValue(survivor, ['strength', 'endurance', 'dexterity', 'physical'], 40);
  const practicality = getTraitValue(survivor, ['focus', 'memory', 'puzzles'], 40);
  const laziness = getTraitValue(survivor, ['laziness', 'energy', 'stamina'], 50);

  const capability = {
    leadership: leadership + confidence * 0.35 + social * 0.3,
    fire: survival * 1.3 + confidence * 0.6 + leadership * 0.2,
    shelter: strength * 1.05 + practicality * 0.6 + leadership * 0.25,
    food: survival * 1.15 + strength * 0.35 + confidence * 0.25,
    materials: strength * 0.95 + practicality * 0.45 + social * 0.1,
    workEthic: clamp(100 - laziness + confidence * 0.25, 0, 100),
    social,
    stubbornness: getTraitValue(survivor, ['aggression', 'risk', 'pride', 'fortitude'], 45)
  };
  return capability;
}

function getPersonalityProfile(survivor) {
  const caps = buildCapabilities(survivor);
  const workEthic = caps.workEthic;
  const bossy = caps.leadership > 65 && caps.stubbornness > 55;
  const proud = caps.stubbornness > 65;
  const strategicFloater = caps.social > 60 && workEthic < 55;
  return { caps, workEthic, bossy, proud, strategicFloater };
}

function buildOverlay() {
  const overlay = document.createElement('div');
  overlay.id = 'day1-overlay';
  overlay.className = 'conversation-overlay';
  overlay.style.position = 'fixed';
  overlay.style.inset = '0';
  overlay.style.background = 'rgba(0,0,0,0.75)';
  overlay.style.zIndex = '5000';
  overlay.style.display = 'flex';
  overlay.style.alignItems = 'center';
  overlay.style.justifyContent = 'center';

  const panel = document.createElement('div');
  panel.className = 'parchment-panel';
  panel.style.background = "url('Assets/parchment-bg.png'), #f5e6c5";
  panel.style.backgroundSize = 'cover';
  panel.style.border = '4px solid #7a4a1e';
  panel.style.borderRadius = '18px';
  panel.style.width = '88%';
  panel.style.maxWidth = '1020px';
  panel.style.maxHeight = '88%';
  panel.style.display = 'flex';
  panel.style.flexDirection = 'column';
  panel.style.padding = '18px';
  panel.style.boxShadow = '0 8px 20px rgba(0,0,0,0.45)';
  panel.style.fontFamily = "'Survivant', sans-serif";

  const header = document.createElement('div');
  header.style.display = 'flex';
  header.style.justifyContent = 'space-between';
  header.style.alignItems = 'center';
  header.style.marginBottom = '10px';

  const speakerWrap = document.createElement('div');
  speakerWrap.style.display = 'flex';
  speakerWrap.style.alignItems = 'center';
  speakerWrap.style.gap = '10px';

  const avatar = document.createElement('img');
  avatar.id = 'day1-avatar';
  avatar.style.width = '52px';
  avatar.style.height = '52px';
  avatar.style.borderRadius = '50%';
  avatar.style.objectFit = 'cover';
  avatar.style.border = '3px solid #c17f34';
  avatar.style.boxShadow = '0 2px 6px rgba(0,0,0,0.35)';
  avatar.style.background = '#f8ead4';
  avatar.alt = 'Speaker avatar';

  const speaker = document.createElement('div');
  speaker.id = 'day1-speaker';
  speaker.style.fontWeight = 'bold';
  speaker.style.fontSize = '1.3rem';
  speaker.style.color = '#3c2415';

  speakerWrap.appendChild(avatar);
  speakerWrap.appendChild(speaker);

  const phaseLabel = document.createElement('div');
  phaseLabel.id = 'day1-phase-label';
  phaseLabel.style.fontSize = '0.95rem';
  phaseLabel.style.color = '#6b4c2b';
  phaseLabel.textContent = 'First Impressions';

  header.appendChild(speakerWrap);
  header.appendChild(phaseLabel);

  const textArea = document.createElement('div');
  textArea.id = 'day1-text';
  textArea.style.flex = '1';
  textArea.style.overflowY = 'auto';
  textArea.style.padding = '12px';
  textArea.style.background = 'rgba(255,255,255,0.8)';
  textArea.style.border = '1px solid #d2b48c';
  textArea.style.borderRadius = '12px';
  textArea.style.color = '#2d1b0d';
  textArea.style.lineHeight = '1.5';

  const choices = document.createElement('div');
  choices.id = 'day1-choices';
  choices.style.display = 'flex';
  choices.style.flexDirection = 'column';
  choices.style.gap = '10px';
  choices.style.marginTop = '12px';
  choices.style.maxHeight = '220px';
  choices.style.overflowY = 'auto';

  const footer = document.createElement('div');
  footer.style.display = 'flex';
  footer.style.justifyContent = 'space-between';
  footer.style.alignItems = 'center';
  footer.style.marginTop = '12px';

  const statusLine = document.createElement('div');
  statusLine.id = 'day1-status';
  statusLine.style.color = '#4a2c0a';
  statusLine.style.fontSize = '0.9rem';

  const nextBtn = document.createElement('button');
  nextBtn.id = 'day1-next';
  nextBtn.className = 'rect-button';
  nextBtn.textContent = 'Next';
  nextBtn.style.alignSelf = 'flex-end';

  footer.appendChild(statusLine);
  footer.appendChild(nextBtn);

  panel.appendChild(header);
  panel.appendChild(textArea);
  panel.appendChild(choices);
  panel.appendChild(footer);
  overlay.appendChild(panel);

  document.body.appendChild(overlay);
  return { overlay, speaker, avatar, textArea, choices, nextBtn, phaseLabel, statusLine };
}

function removeOverlay(overlay) {
  overlay?.remove();
}

function getSurvivorAvatarSrc(survivor) {
  if (!survivor) return 'Assets/logo.png';
  const candidates = [survivor.avatarUrl, survivor.avatar, survivor.portrait, survivor.image, survivor.img];
  const found = candidates.find(Boolean);
  if (found) return found;
  const first = survivor.firstName ? survivor.firstName.toLowerCase() : '';
  if (first) return `Assets/Avatars/${first}.jpeg`;
  return 'Assets/logo.png';
}

function setHeaderSpeakerUI({ beat, members, player, speakerEl, avatarEl }) {
  const isNarrator = !beat.speakerId && beat.speaker === 'Narrator';
  let survivor = beat.speakerRef;
  if (!survivor && beat.speakerId) survivor = members.find(m => m.id === beat.speakerId);
  const name = survivor ? displayName(survivor, members, player.id) : beat.speaker || 'Narrator';
  speakerEl.textContent = name;

  if (isNarrator) {
    avatarEl.style.visibility = 'hidden';
    avatarEl.src = 'Assets/logo.png';
    return;
  }

  avatarEl.style.visibility = 'visible';
  const avatarSrc = survivor ? getSurvivorAvatarSrc(survivor) : 'Assets/logo.png';
  avatarEl.src = avatarSrc;
}

function taskDefinitions(tribeSize = 6) {
  const materialsCap = tribeSize === 9 ? 3 : 2;
  const foodCap = tribeSize === 9 ? 2 : 1;
  return [
    { key: 'fire', label: 'Fire', cap: 1, assignedIds: [] },
    { key: 'shelter', label: 'Shelter', cap: 2, assignedIds: [] },
    { key: 'materials', label: 'Materials', cap: materialsCap, assignedIds: [] },
    { key: 'food', label: 'Food', cap: foodCap, assignedIds: [] },
    { key: 'float', label: 'Float', cap: tribeSize, assignedIds: [] }
  ];
}

function cloneTaskState(tasks) {
  return tasks.map(t => ({ key: t.key, label: t.label, cap: t.cap, assignedIds: [...t.assignedIds] }));
}

function getTask(tasks, key) {
  return tasks.find(t => t.key === key);
}

function canAssign(task) {
  return task && task.assignedIds.length < task.cap;
}

let assignmentStatusUpdater = null;

function addAssignment(tasks, key, survivor) {
  const task = getTask(tasks, key);
  if (!task || !survivor) return false;
  if (task.assignedIds.includes(survivor.id) || !canAssign(task)) return false;
  task.assignedIds.push(survivor.id);
  if (assignmentStatusUpdater) assignmentStatusUpdater();
  return true;
}

// Avoid repeating lines within a single run.
function pickUniqueLine(pool, usedLines, fallback) {
  const shuffled = shuffleArray([...pool]);
  const found = shuffled.find(line => !usedLines.has(line));
  if (found) {
    usedLines.add(found);
    return found;
  }
  if (fallback) usedLines.add(fallback);
  return fallback || pool[0];
}

function formatNarrationQuote(narration, quote) {
  return `${narration}\n\n“${quote}”`;
}

function resolveLeadershipScenario(members, player) {
  const scored = members.map(m => ({ member: m, cap: buildCapabilities(m), score: buildCapabilities(m).leadership || 0 }));
  scored.sort((a, b) => b.score - a.score);
  const top = scored[0];
  const runner = scored[1];
  const contested = runner && Math.abs(top.score - runner.score) <= 8;
  const playerTop = player && top.member.id === player.id;
  const scenario = playerTop ? 'player_leads' : contested ? 'contested' : 'npc_leads';
  return { topLeader: top.member, runnerUp: runner?.member || null, scenario, contestedPair: contested ? [top.member, runner.member] : null };
}

function minCoverageState(tasks) {
  return {
    fire: getTask(tasks, 'fire').assignedIds.length >= 1,
    shelter: getTask(tasks, 'shelter').assignedIds.length >= 2,
    materials: getTask(tasks, 'materials').assignedIds.length >= 1,
    food: getTask(tasks, 'food').assignedIds.length >= 1
  };
}

function pickBestCandidate(candidates, roleKey) {
  const scoreKey = roleKey;
  return candidates
    .map(m => ({ member: m, caps: buildCapabilities(m) }))
    .sort((a, b) => b.caps[scoreKey] - a.caps[scoreKey])
    .map(entry => entry.member)[0] || null;
}

function playerIntentFromChoice(choiceKey) {
  switch (choiceKey) {
    case 'fire':
      return { key: choiceKey, posture: 'claim', preferredRole: 'fire', assertiveness: 80 };
    case 'shelter':
      return { key: choiceKey, posture: 'claim', preferredRole: 'shelter', assertiveness: 75 };
    case 'materials':
      return { key: choiceKey, posture: 'support/materials', preferredRole: 'materials', assertiveness: 60 };
    case 'food':
      return { key: choiceKey, posture: 'support/food', preferredRole: 'food', assertiveness: 60 };
    case 'float':
      return { key: choiceKey, posture: 'float/flex', preferredRole: 'float', assertiveness: 20 };
    case 'flex':
      return { key: choiceKey, posture: 'float/flex', preferredRole: null, assertiveness: 25 };
    case 'mediate':
      return { key: choiceKey, posture: 'mediate', preferredRole: null, assertiveness: 45 };
    default:
      return { key: choiceKey, posture: 'float/flex', preferredRole: null, assertiveness: 25 };
  }
}

function groupBeatsByRole(assignments, members, playerId, describeLine, usedLines) {
  // Groups large clusters into combined narration and spotlights.
  const beats = [];
  assignments.forEach(({ role, survivors }) => {
    if (survivors.length >= 3) {
      const names = formatIdsAsNameList(survivors.map(s => s.id), members, playerId);
      beats.push({ speaker: 'Narrator', text: `${names} all keep to ${role === 'float' ? 'a flexible stance' : role}. They cluster together before splitting up.` });
      shuffleArray(survivors).slice(0, 2).forEach(survivor => {
        beats.push({ speaker: displayName(survivor, members, playerId), speakerId: survivor.id, speakerRef: survivor, text: describeLine(survivor, role, usedLines, members, playerId) });
      });
    } else {
      survivors.forEach(survivor => {
        beats.push({ speaker: displayName(survivor, members, playerId), speakerId: survivor.id, speakerRef: survivor, text: describeLine(survivor, role, usedLines, members, playerId) });
      });
    }
  });
  return beats;
}

function describeAssignmentLine(survivor, taskKey, usedLines, members, playerId) {
  const profile = getPersonalityProfile(survivor);
  const { bossy, proud, strategicFloater } = profile;
  const name = displayName(survivor, members, playerId);
  const you = survivor.id === playerId;

  const narrate = (youText, otherText) => (you ? youText : otherText);
  const withQuote = (youLine, otherLine, quote) => formatNarrationQuote(narrate(youLine, otherLine), quote);

  const firePool = [
    withQuote('You crouch by the pit, confident.', `${name} crouches by the pit, confident.`, 'I’ll coax this into a flame.'),
    withQuote('You kneel without ceremony.', `${name} kneels without ceremony.`, 'Fire’s mine. Trust me.'),
    withQuote('You check the wind and clear sand.', `${name} checks the wind and clears sand.`, 'Give me a minute. I can get a spark.')
  ];

  const shelterLeadPool = [
    withQuote('You clap hands to get motion.', `${name} claps hands to get motion.`, 'Shelter with me. Let’s frame it right.'),
    withQuote('You drag a log into place.', `${name} drags a log into place.`, 'I’ll anchor shelter. Keep it level.')
  ];

  const shelterHelperPool = [
    withQuote('You steady a post, matching pace.', `${name} steadies a post, matching pace.`, 'I’ll back whoever’s leading shelter.'),
    withQuote('You slot in beside the builder.', `${name} slots in beside the builder.`, 'I’ll keep this side tight.')
  ];

  const foodPool = [
    withQuote('You shoulder a woven bag.', `${name} shoulders a woven bag.`, 'I’ll forage and fish. Back soon.'),
    withQuote('You scan the tide line.', `${name} scans the tide line.`, 'Let me hunt for crabs and coconuts.')
  ];

  const materialsPool = [
    withQuote('You eye the tree line like a supply map.', `${name} eyes the tree line like a supply map.`, 'I’ll keep bamboo and wood flowing.'),
    withQuote('You loosen your shoulders, ready to haul.', `${name} loosens their shoulders, ready to haul.`, 'Less talk, more wood. I’m on materials.')
  ];

  const floatPool = [
    withQuote('You stay loose, clocking everyone’s roles.', `${name} stays loose, clocking everyone’s roles.`, 'I’ll float and cover gaps.'),
    withQuote('You keep posture open, easy smile on.', `${name} keeps posture open, easy smile on.`, 'Put me where you need me. I’ll float for now.')
  ];

  const pick = pool => pickUniqueLine(pool, usedLines, pool[0]);

  switch (taskKey) {
    case 'fire':
      return pick(firePool);
    case 'shelter':
      return bossy || proud ? pick(shelterLeadPool) : pick(shelterHelperPool);
    case 'food':
      return pick(foodPool);
    case 'materials':
      return pick(materialsPool);
    default:
      return strategicFloater ? withQuote('You hover near conversations.', `${name} hovers near conversations.`, 'Floating keeps me informed.') : pick(floatPool);
  }
}

// Ensures core coverage happens before mass floating.
function enforceMinimumCoverage(tasks, members, player, playerIntent, leaderIds = []) {
  const coverageOrder = [
    { key: 'fire', need: 1 },
    { key: 'shelter', need: 2 },
    { key: 'materials', need: 1 },
    { key: 'food', need: 1 }
  ];

  const unassigned = members.filter(m => !tasks.some(t => t.assignedIds.includes(m.id)));
  const isLeader = id => leaderIds.includes(id);

  coverageOrder.forEach(entry => {
    const task = getTask(tasks, entry.key);
    while (task.assignedIds.length < entry.need) {
      const pool = unassigned.filter(m => !isLeader(m.id) || task.key !== 'float');
      if (!pool.length) break;
      const candidate = pickBestCandidate(pool, entry.key) || pool[0];
      addAssignment(tasks, entry.key, candidate);
      const idx = unassigned.findIndex(u => u.id === candidate.id);
      if (idx >= 0) unassigned.splice(idx, 1);
    }
  });

  // Only after coverage allow floaters; before that, cap one floater and keep leaders in lanes.
  const coverageMet = minCoverageState(tasks);
  const floatTask = getTask(tasks, 'float');
  const currentFloaters = floatTask.assignedIds.map(id => members.find(m => m.id === id)).filter(Boolean);
  const beforeCoverageFloats = coverageMet.fire && coverageMet.shelter && coverageMet.materials && coverageMet.food ? Infinity : 1;

  // Remove excess floaters before coverage.
  if (!coverageMet.fire || !coverageMet.shelter || !coverageMet.materials || !coverageMet.food) {
    while (currentFloaters.length > beforeCoverageFloats) {
      const pulled = currentFloaters.shift();
      floatTask.assignedIds = floatTask.assignedIds.filter(id => id !== pulled.id);
      unassigned.push(pulled);
    }
  }

  // If player chose float/flex, keep them unassigned unless last resort.
  if (player && playerIntent.posture === 'float/flex' && !coverageMet.fire) {
    floatTask.assignedIds = floatTask.assignedIds.filter(id => id !== player.id);
    if (!unassigned.find(u => u.id === player.id)) unassigned.push(player);
  }

  // Fill remaining gaps using available survivors, preferring non-floaters first.
  coverageOrder.forEach(entry => {
    const task = getTask(tasks, entry.key);
    while (task.assignedIds.length < entry.need && unassigned.length) {
      const candidate = pickBestCandidate(unassigned, entry.key) || unassigned[0];
      addAssignment(tasks, entry.key, candidate);
      const idx = unassigned.findIndex(u => u.id === candidate.id);
      if (idx >= 0) unassigned.splice(idx, 1);
    }
  });

  // Assign player to claimed task if they selected one.
  if (playerIntent.preferredRole && player) {
    const target = getTask(tasks, playerIntent.preferredRole);
    if (target && !target.assignedIds.includes(player.id) && canAssign(target)) {
      // Respect conflicts: if a leader already claimed, allow both only when cap allows, else push leader elsewhere later.
      addAssignment(tasks, playerIntent.preferredRole, player);
    }
  }

  return { tasks, remainingPool: unassigned };
}

function groupAssignmentsByRole(tasks, members) {
  return tasks.filter(t => t.assignedIds.length).map(task => ({
    role: task.key,
    survivors: task.assignedIds.map(id => members.find(m => m.id === id)).filter(Boolean)
  }));
}

function buildRecapSections(player, members, tasks, leadership, chemistryMoments, closingMood, playerChoiceKey) {
  const roleAssignments = key => {
    const task = getTask(tasks, key) || { assignedIds: [] };
    return formatIdsAsNameList(task.assignedIds, members, player.id) || 'None';
  };

  const leadershipLines = [];
  if (leadership.scenario === 'player_leads') {
    leadershipLines.push('You steer the early talk, and people follow your tempo.');
  } else if (leadership.scenario === 'contested') {
    const contestedPair = formatPair([leadership.topLeader?.id, leadership.runnerUp?.id].filter(Boolean), members, player.id);
    leadershipLines.push(`${contestedPair} both angle for control before it settles.`);
  } else {
    leadershipLines.push(`${displayName(leadership.topLeader, members, player.id)} steps up first, shaping the flow.`);
  }

  const tensionMoment = chemistryMoments.find(m => m.type !== 'bond');
  const clashLine = (() => {
    if (!tensionMoment && leadership.scenario !== 'contested') return '• No major clashes—just quick adjustments.';
    if (leadership.scenario === 'contested') {
      const contestedNames = formatPair([leadership.topLeader?.id, leadership.runnerUp?.id].filter(Boolean), members, player.id);
      return `• Clash: ${contestedNames} trade pitches before the group moves.`;
    }
    if (tensionMoment) {
      const pair = formatPair(tensionMoment.pair.map(p => p.id), members, player.id);
      return `• Sparks: ${pair} bump heads over pace.`;
    }
    return '• Sparks: Brief, then gone.';
  })();

  const chemistryLines = chemistryMoments.length
    ? chemistryMoments.slice(0, 2).map(m => {
        const pair = formatPair(m.pair.map(p => p.id), members, player.id);
        if (m.type === 'bond') return `• ${pair} find easy rhythm.`;
        if (m.type === 'leadership_tension') return `• ${pair} trade barbs about who leads.`;
        if (m.type === 'lazy_callout') return `• ${pair} has a quick call-out about effort.`;
        return `• ${pair} stay wary.`;
      })
    : ['• Small talk stays surface-level—no sparks yet.'];

  const toneLine = closingMood === 'confident'
    ? 'Confident pulse—people move with purpose.'
    : closingMood === 'chaotic'
      ? 'Chaotic energy—sharp edges but action happens.'
      : 'Tentative calm—plans set, eyes watch to see if they hold.';

  const playerTask = tasks.find(t => (t.assignedIds || []).includes(player.id));
  const playerRole = playerTask ? playerTask.label : 'Float';

  return {
    leadership: [`• ${leadershipLines[0]}`, clashLine],
    assignments: [
      `• Fire: ${roleAssignments('fire')}`,
      `• Shelter: ${roleAssignments('shelter')}`,
      `• Food: ${roleAssignments('food')}`,
      `• Materials: ${roleAssignments('materials')}`,
      `• Float: ${roleAssignments('float')}`
    ],
    chemistry: chemistryLines,
    tone: [`• ${toneLine}`],
    yourRole: [`• You end up on ${playerRole}${playerChoiceKey ? ` (you chose ${playerChoiceKey})` : ''}.`],
    playerRole
  };
}

function buildRecapText(player, members, tasks, leadership, chemistryMoments, closingMood, playerChoiceKey) {
  const sections = buildRecapSections(player, members, tasks, leadership, chemistryMoments, closingMood, playerChoiceKey);
  return [
    'Leadership:',
    ...sections.leadership,
    '',
    'Assignments:',
    ...sections.assignments,
    '',
    'Chemistry:',
    ...sections.chemistry,
    '',
    'Tone:',
    ...sections.tone,
    '',
    'Your Role:',
    ...sections.yourRole
  ].join('\n');
}

function buildRecapHtml(player, members, tasks, leadership, chemistryMoments, closingMood, playerChoiceKey) {
  const sections = buildRecapSections(player, members, tasks, leadership, chemistryMoments, closingMood, playerChoiceKey);
  const container = document.createElement('div');
  container.style.display = 'flex';
  container.style.flexDirection = 'column';
  container.style.gap = '10px';
  container.style.lineHeight = '1.5';

  const addSection = (title, lines) => {
    const section = document.createElement('div');
    section.style.display = 'flex';
    section.style.flexDirection = 'column';
    section.style.gap = '4px';
    const heading = document.createElement('div');
    heading.style.fontWeight = 'bold';
    heading.style.color = '#3c2415';
    heading.textContent = title;
    section.appendChild(heading);
    lines.forEach(line => {
      const lineEl = document.createElement('div');
      lineEl.textContent = line;
      section.appendChild(lineEl);
    });
    container.appendChild(section);
  };

  addSection('Leadership', sections.leadership);

  const assignmentsSection = document.createElement('div');
  assignmentsSection.style.display = 'flex';
  assignmentsSection.style.flexDirection = 'column';
  assignmentsSection.style.gap = '6px';

  const assignmentsHeading = document.createElement('div');
  assignmentsHeading.style.fontWeight = 'bold';
  assignmentsHeading.style.color = '#3c2415';
  assignmentsHeading.textContent = 'Assignments';
  assignmentsSection.appendChild(assignmentsHeading);

  const assignmentRoles = [
    { label: 'Fire', ids: getTask(tasks, 'fire')?.assignedIds || [] },
    { label: 'Shelter', ids: getTask(tasks, 'shelter')?.assignedIds || [] },
    { label: 'Food', ids: getTask(tasks, 'food')?.assignedIds || [] },
    { label: 'Materials', ids: getTask(tasks, 'materials')?.assignedIds || [] },
    { label: 'Float', ids: getTask(tasks, 'float')?.assignedIds || [] }
  ];

  assignmentRoles.forEach(role => {
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.gap = '8px';

    const bullet = document.createElement('span');
    bullet.textContent = '•';
    bullet.style.color = '#3c2415';
    row.appendChild(bullet);

    const label = document.createElement('span');
    label.style.fontWeight = '600';
    label.style.color = '#2d1b0d';
    label.textContent = `${role.label}: ${formatIdsAsNameList(role.ids, members, player.id) || '—'}`;
    row.appendChild(label);

    if (role.ids.length) {
      const avatarRow = document.createElement('div');
      avatarRow.style.display = 'flex';
      avatarRow.style.gap = '6px';
      role.ids.forEach(id => {
        const survivor = members.find(m => m.id === id);
        if (!survivor) return;
        const img = document.createElement('img');
        img.src = getSurvivorAvatarSrc(survivor);
        img.alt = displayName(survivor, members, player.id);
        img.style.width = '28px';
        img.style.height = '28px';
        img.style.borderRadius = '50%';
        img.style.objectFit = 'cover';
        img.style.border = '2px solid #c17f34';
        img.style.boxShadow = '0 1px 4px rgba(0,0,0,0.25)';
        avatarRow.appendChild(img);
      });
      row.appendChild(avatarRow);
    }

    assignmentsSection.appendChild(row);
  });

  container.appendChild(assignmentsSection);
  addSection('Chemistry', sections.chemistry);
  addSection('Tone', sections.tone);
  addSection('Your Role', sections.yourRole);

  return { element: container, htmlString: container.outerHTML, sections };
}

// Builds the final recap beat and ensures overlay closes cleanly.
function buildFinalizeBeat({ player, members, tasks, leadership, chemistryMoments, closingMood, playerChoiceKey, overlay, resolve, gameManager, cleanup }) {
  const recapHtml = buildRecapHtml(player, members, tasks, leadership, chemistryMoments, closingMood, playerChoiceKey);
  const recapText = buildRecapText(player, members, tasks, leadership, chemistryMoments, closingMood, playerChoiceKey);
  const assignmentsByRole = {
    fire: getTask(tasks, 'fire').assignedIds,
    shelter: getTask(tasks, 'shelter').assignedIds,
    food: getTask(tasks, 'food').assignedIds,
    materials: getTask(tasks, 'materials').assignedIds,
    float: getTask(tasks, 'float').assignedIds
  };
  const chemistryMomentsDetailed = chemistryMoments.map(m => ({
    type: m.type,
    pair: m.pair,
    pairIds: m.pair.map(p => p.id),
    delta: m.delta || 0,
    tag: m.tag
  }));
  let finalized = false;

  return {
    speaker: 'Narrator',
    type: 'finalize',
    text: recapText,
    htmlText: recapHtml.element,
    onEnter: () => {
      const plan = {
        leaderId: leadership.topLeader?.id,
        fireIds: getTask(tasks, 'fire').assignedIds,
        shelterIds: getTask(tasks, 'shelter').assignedIds,
        foodIds: getTask(tasks, 'food').assignedIds,
        materialsIds: getTask(tasks, 'materials').assignedIds,
        floatIds: getTask(tasks, 'float').assignedIds,
        floaterIds: getTask(tasks, 'float').assignedIds,
        chemistryMoments: chemistryMomentsDetailed,
        leadershipScenario: leadership.scenario,
        mood: closingMood,
        choice: playerChoiceKey
      };

      gameManager.playerTribe.day1Plan = plan;
      gameManager.playerTribe.day1PlanCreated = true;
      gameManager.playerTribe.day1Mood = closingMood;
      gameManager.playerTribe.day1Choice = playerChoiceKey;
      gameManager.flags.day1FirstImpressionsDone = true;
      gameManager.flags.day1FirstImpressionsCompleted = true;

      const summaryPayload = {
        mood: closingMood,
        leadershipScenario: leadership.scenario,
        leaderId: leadership.topLeader?.id,
        playerRole: recapHtml.sections.playerRole,
        assignmentsByRole,
        chemistryMomentsDetailed,
        summaryText: recapText,
        summaryHtml: recapHtml.htmlString
      };

      const summaryEntry = {
        id: 'day1_first_impressions',
        day: gameManager.day,
        phase: gameManager.gamePhase,
        type: 'cinematic_event',
        title: 'Day 1: First Impressions',
        text: recapText,
        data: {
          leadershipScenario: leadership.scenario,
          leaders: [leadership.topLeader?.id, leadership.runnerUp?.id].filter(Boolean),
          clashOccurred: leadership.scenario === 'contested',
          playerChoiceKey,
          assignments: {
            fire: plan.fireIds,
            shelter: plan.shelterIds,
            food: plan.foodIds,
            materials: plan.materialsIds,
            float: plan.floatIds
          },
          chemistryMoments: chemistryMoments.map(m => ({ type: m.type, pair: m.pair.map(p => p.id), delta: m.delta || 0, tag: m.tag })),
          tone: closingMood,
          summaryText: recapText,
          summaryHtml: recapHtml.htmlString,
          day1FirstImpressions: summaryPayload
        },
        isCinematicEventSummary: true
      };

      gameManager.campLog = gameManager.campLog || [];
      const existingIndex = gameManager.campLog.findIndex(entry => entry.id === summaryEntry.id);
      if (existingIndex >= 0) {
        gameManager.campLog[existingIndex] = summaryEntry;
      } else {
        gameManager.campLog.push(summaryEntry);
      }
    },
    onComplete: () => {
      if (finalized) return;
      finalized = true;
      cleanup?.();
      resolve({ plan: gameManager.playerTribe.day1Plan });
    }
  };
}

function pickChemistryMoments(tasks, members, leadershipScenario, playerId) {
  const moments = [];
  const shelter = getTask(tasks, 'shelter');
  if (shelter.assignedIds.length === 2) {
    const [aId, bId] = shelter.assignedIds;
    const a = members.find(m => m.id === aId);
    const b = members.find(m => m.id === bId);
    if (a && b) {
      const aCap = buildCapabilities(a);
      const bCap = buildCapabilities(b);
      const compatibility = (aCap.social + bCap.social + aCap.workEthic + bCap.workEthic) / 4;
      if (compatibility > 65) {
        moments.push({
          type: 'bond',
          pair: [a, b],
          textA: formatNarrationQuote(`${displayName(a, members, playerId)} and ${displayName(b, members, playerId)} fall into rhythm measuring bamboo.`, 'We build clean, we get some sleep.'),
          textB: formatNarrationQuote(`${displayName(b, members, playerId)} appreciates the pace.`, 'Feels good working with someone who hustles.'),
          delta: getRandomInt(8, 15),
          tag: 'day1_bond'
        });
      } else if (compatibility < 45) {
        const pushy = aCap.stubbornness >= bCap.stubbornness ? a : b;
        const proud = pushy === a ? b : a;
        moments.push({
          type: 'tension',
          pair: [pushy, proud],
          textA: formatNarrationQuote(`${displayName(pushy, members, playerId)} tightens a lash, not loving feedback.`, 'Angle it my way. Sturdier.'),
          textB: formatNarrationQuote(`${displayName(proud, members, playerId)} bristles.`, 'Relax, I’ve built stuff before.'),
          delta: -getRandomInt(8, 15),
          tag: 'shelter_friction'
        });
      }
    }
  }

  if (leadershipScenario === 'contested') {
    const candidates = [getTask(tasks, 'fire'), getTask(tasks, 'shelter')].flatMap(t => t.assignedIds);
    const [a, b] = candidates.map(id => members.find(m => m.id === id)).filter(Boolean).slice(0, 2);
    if (a && b) {
      moments.push({
        type: 'leadership_tension',
        pair: [a, b],
        textA: formatNarrationQuote(`${displayName(a, members, playerId)} checks the other’s tone.`, 'Who’s actually calling shots?'),
        textB: formatNarrationQuote(`${displayName(b, members, playerId)} keeps it cool.`, 'We’ll see whose plan works.'),
        delta: -getRandomInt(5, 10),
        tag: 'challenged_authority'
      });
    }
  }

  const materialsTask = getTask(tasks, 'materials');
  const floatTask = getTask(tasks, 'float');
  if (materialsTask.assignedIds.length && floatTask.assignedIds.length) {
    const worker = members.find(m => m.id === materialsTask.assignedIds[0]);
    const floater = members.find(m => m.id === floatTask.assignedIds[0]);
    if (worker && floater) {
      moments.push({
        type: 'lazy_callout',
        pair: [worker, floater],
        textA: formatNarrationQuote(`${displayName(worker, members, playerId)} notices the floater hanging back.`, 'Floating is fine, just don’t disappear.'),
        textB: formatNarrationQuote(`${displayName(floater, members, playerId)} answers lightly.`, 'I’m here. Just keeping flexible.'),
        delta: -getRandomInt(5, 8),
        tag: 'lazy_signal'
      });
    }
  }

  const bond = moments.find(m => m.type === 'bond');
  const tension = moments.find(m => m.type !== 'bond');
  return [bond, tension].filter(Boolean);
}


async function runDay1FirstImpressions({ gameManager } = {}) {
  const context = arguments[0];
  const gm = gameManager || context?.gameManager || context;
  const playerTribe = gm?.playerTribe;
  const members = playerTribe?.members || [];
  const player = members.find(m => m.id === gm?.playerId) || members[0];
  const tribeSize = members.length;
  const overlayExists = typeof document !== 'undefined' && document.getElementById('day1-overlay');

  const debugInfo = {
    day: gm?.day,
    phase: gm?.gamePhase,
    tribe: playerTribe?.name || playerTribe?.id,
    tribeSize,
    hasOverlay: Boolean(overlayExists),
    hasCampLog: (gm?.campLog || []).some(entry => entry.id === 'day1_first_impressions'),
    hasPlan: Boolean(playerTribe?.day1Plan || playerTribe?.day1PlanCreated),
    flags: gm?.flags
  };

  logDebug('Attempting runDay1FirstImpressions', debugInfo);

  if (!gm || !playerTribe) {
    logSkip('missing_game_manager', debugInfo);
    return { skipped: true, reason: 'missing_game_manager' };
  }

  if (overlayExists) {
    logSkip('overlay_exists', debugInfo);
    return { skipped: true, reason: 'overlay_exists' };
  }

  gm.flags = gm.flags || {};

  const unsupportedTribe = tribeSize && ![6, 9].includes(tribeSize);
  const alreadyLogged = (gm.campLog || []).some(entry => entry.id === 'day1_first_impressions');
  const alreadyPlanned = playerTribe.day1Plan || playerTribe.day1PlanCreated;
  const alreadyDone = gm.flags.day1FirstImpressionsCompleted || gm.flags.day1FirstImpressionsDone;

  if (alreadyLogged || alreadyPlanned || alreadyDone) {
    logSkip('already_completed', { ...debugInfo, alreadyLogged, alreadyPlanned, alreadyDone });
    return { skipped: true, reason: 'already_completed' };
  }

  if (gm.day !== 1 || unsupportedTribe || !playerTribe) {
    logSkip('conditions_not_met', { ...debugInfo, unsupportedTribe });
    return { skipped: true, reason: 'conditions_not_met' };
  }

  return new Promise(resolve => {
    let overlay;
    const cleanup = () => {
      if (overlay) removeOverlay(overlay);
      assignmentStatusUpdater = null;
      try {
        eventManager.publish(GameEvents.DIALOGUE_HIDDEN, { source: 'day1-first-impressions' });
      } catch (e) {
        logDebug('Failed to publish dialogue hidden event during cleanup.', e);
      }
    };

    try {
      const overlayEls = buildOverlay();
      overlay = overlayEls.overlay;
      const { speaker, avatar, textArea, choices, nextBtn, statusLine } = overlayEls;
      const usedLines = new Set();

      const tasks = taskDefinitions(tribeSize);
      const leadership = resolveLeadershipScenario(members, player);
      const beatQueue = [];
      let currentIndex = 0;
      const awaitingChoice = { value: false };
      let chemistryMoments = [];
      let playerChoiceKey = null;
      let closingMood = 'tentative';

      const updateStatusLine = () => {
        const pieces = tasks.map(t => `${t.label}: ${formatIdsAsNameList(t.assignedIds, members, player.id) || '—'}`);
        statusLine.textContent = pieces.join(' | ');
      };
      assignmentStatusUpdater = updateStatusLine;

      const renderBeatUI = () => {
        const beat = beatQueue[currentIndex];
        if (!beat) return;
        setHeaderSpeakerUI({ beat, members, player, speakerEl: speaker, avatarEl: avatar });
        if (beat.htmlText) {
          textArea.innerHTML = '';
          if (typeof beat.htmlText === 'string') {
            textArea.innerHTML = beat.htmlText;
          } else {
            textArea.appendChild(beat.htmlText);
          }
        } else {
          textArea.textContent = beat.text;
        }
        if (beat.type === 'choice') {
          awaitingChoice.value = true;
          nextBtn.style.display = 'none';
          choices.style.display = 'flex';
        } else {
          awaitingChoice.value = false;
          nextBtn.style.display = 'inline-block';
          nextBtn.textContent = beat.type === 'finalize' ? 'Continue' : 'Next';
          choices.style.display = 'none';
        }
        if (beat.renderChoices && beat.type === 'choice') beat.renderChoices();
        if (beat.onEnter) beat.onEnter();
        updateStatusLine();
      };

      const addBeat = beat => beatQueue.push(beat);

      // Leadership opening beats
      const buildLeadershipBeats = () => {
        const beats = [];
        const { scenario, topLeader, runnerUp } = leadership;
        const topName = displayName(topLeader, members, player.id);
        const runnerName = displayName(runnerUp, members, player.id);

        beats.push({ speaker: 'Narrator', text: 'Bags hit the sand. Voices overlap as everyone sizes each other up.' });

        if (scenario === 'contested') {
          if (topLeader.id === runnerUp.id) {
            beats.push({ speaker: 'Narrator', text: `${topName} talks through a plan, and the tribe listens.` });
          } else if (topLeader.id === player.id || runnerUp?.id === player.id) {
            const opponent = topLeader.id === player.id ? runnerUp : topLeader;
            const contestedNames = formatPair([topLeader.id, opponent?.id].filter(Boolean), members, player.id);
            beats.push({
              speaker: 'Narrator',
              text: `${contestedNames} both lean forward to claim direction. Neither wants to fade.`
            });
          } else {
            beats.push({ speaker: 'Narrator', text: `${topName} and ${runnerName} both angle to steer—voices tightening until others chime in.` });
          }
        } else if (scenario === 'player_leads') {
          beats.push({ speaker: 'Narrator', text: 'You speak first, framing what needs to happen.' });
        } else {
          beats.push({ speaker: 'Narrator', text: `${topName} squares shoulders and starts directing traffic.` });
        }
        return beats;
      };

      const addChoiceBeat = () => {
        awaitingChoice.value = true;
        const beat = {
          speaker: 'Narrator',
          type: 'choice',
          text: 'Where do you plant your flag?',
          renderChoices: () => {
            choices.innerHTML = '';
            const options = [
              { key: 'fire', label: 'Take fire' },
              { key: 'shelter', label: 'Take shelter' },
              { key: 'materials', label: 'Gather materials' },
              { key: 'food', label: 'Hunt/forage' },
              { key: 'float', label: 'Float and observe' },
              { key: 'flex', label: 'Stay flexible' },
              { key: 'mediate', label: 'Mediate the leadership tension' }
            ];
            options.forEach(option => {
              const btn = document.createElement('button');
              btn.textContent = option.label;
              btn.className = 'rect-button';
              btn.style.textAlign = 'left';
              btn.addEventListener('click', () => {
                playerChoiceKey = option.key;
                beatQueue.push({ speaker: 'Narrator', text: `You claim: ${option.label}.` });
                commitChoice(option.key);
              });
              choices.appendChild(btn);
            });
          }
        };
        addBeat(beat);
      };

      const commitChoice = choiceKey => {
        if (awaitingChoice.value) {
          const intent = applyPlayerChoice(choiceKey);
          const beats = [
            ...buildAssignmentBeats(intent),
            ...addChemistryBeats(),
            ...addClosingBeat(),
            buildFinalizeBeat({ player, members, tasks, leadership, chemistryMoments, closingMood, playerChoiceKey: choiceKey, overlay, resolve, gameManager: gm, cleanup })
          ];
          beatQueue.splice(currentIndex + 1, 0, ...beats);
          awaitingChoice.value = false;
          currentIndex += 1;
          renderBeatUI();
        }
      };

      const buildAssignmentBeats = intent => {
        const beats = [];

        if (intent.preferredRole && intent.posture === 'claim') {
          const target = getTask(tasks, intent.preferredRole);
          const leaderInLane = target.assignedIds.find(id => leadership.topLeader && leadership.topLeader.id === id);
          if (leaderInLane && leadership.topLeader.id !== player.id) {
            beats.push({ speaker: displayName(leadership.topLeader, members, player.id), speakerId: leadership.topLeader.id, speakerRef: leadership.topLeader, text: formatNarrationQuote(`${displayName(leadership.topLeader, members, player.id)} stiffens when you speak up.`, 'I called this lane already.') });
            beats.push({ speaker: 'You', speakerId: player.id, speakerRef: player, text: formatNarrationQuote('You keep your tone steady.', `We need two hands on ${intent.preferredRole}. I’m in.`) });
          }
        }

        const grouped = groupAssignmentsByRole(tasks, members);
        beats.push(...groupBeatsByRole(grouped, members, player.id, describeAssignmentLine, usedLines));
        beats.push({ speaker: 'Narrator', text: 'Plans settle into place. People echo assignments back to be sure.', onEnter: updateStatusLine });
        return beats;
      };

      const addChemistryBeats = () => {
        chemistryMoments = pickChemistryMoments(tasks, members, leadership.scenario, player.id);
        const beats = [];
        chemistryMoments.forEach(m => {
          beats.push({ speaker: displayName(m.pair[0], members, player.id), speakerId: m.pair[0].id, speakerRef: m.pair[0], text: m.textA });
          beats.push({ speaker: displayName(m.pair[1], members, player.id), speakerId: m.pair[1].id, speakerRef: m.pair[1], text: m.textB });
        });
        return beats;
      };

      const addClosingBeat = () => {
        const frictionCount = chemistryMoments.filter(m => m.type !== 'bond').length;
        const clarityScore = leadership.scenario === 'npc_leads' || leadership.scenario === 'player_leads' ? 1 : 0;
        const coverageState = minCoverageState(tasks);
        const coverageMet = coverageState.fire && coverageState.shelter && coverageState.materials && coverageState.food;
        const ids = tasks.flatMap(t => t.assignedIds);
        const scores = ids.map(id => buildCapabilities(members.find(m => m.id === id)).workEthic);
        const averageWork = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 50;
        closingMood = (clarityScore && frictionCount === 0 && averageWork > 55 && coverageMet) ? 'confident' : (frictionCount >= 1 || leadership.scenario === 'contested') ? 'chaotic' : 'tentative';

        return [{ speaker: 'Narrator', text: closingMood === 'confident' ? 'The plan feels solid. People break with purpose.' : closingMood === 'chaotic' ? 'Energy stays jagged, but everyone moves before another argument sparks.' : 'Assignments exist, but eyes stay watchful to see if they hold.' }];
      };

      buildLeadershipBeats().forEach(addBeat);
      addChoiceBeat();

      nextBtn.addEventListener('click', () => {
        if (awaitingChoice.value) return;
        const beat = beatQueue[currentIndex];
        if (beat?.type === 'finalize') {
          if (beat.onComplete) beat.onComplete();
          return;
        }
        if (currentIndex < beatQueue.length - 1) {
          currentIndex += 1;
          renderBeatUI();
        }
      });

      eventManager.publish(GameEvents.DIALOGUE_SHOWN, { source: 'day1-first-impressions' });
      renderBeatUI();
    } catch (error) {
      console.error('[Day1FirstImpressions] Error during event setup', error);
      cleanup();
      resolve({ error: true, reason: 'setup_failed' });
    }
  });
}

export { runDay1FirstImpressions };
export default runDay1FirstImpressions;
