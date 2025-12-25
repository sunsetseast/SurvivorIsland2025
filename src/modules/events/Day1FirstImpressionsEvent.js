import { getRandomInt, shuffleArray } from '../utils/CommonUtils.js';
import eventManager, { GameEvents } from '../core/EventManager.js';

const DEBUG_DAY1_EVENT = false;

function logDebug(message, payload = null) {
  if (!DEBUG_DAY1_EVENT) return;
  // eslint-disable-next-line no-console
  console.log(`[Day1FirstImpressions] ${message}`, payload);
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

  logDebug('Capabilities', { name: survivor.firstName, capability });
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

function formatNarrationQuote(narration, quote) {
  return `${narration}\n\n“${quote}”`;
}

function isPlayer(survivor, player) {
  return survivor?.id === player?.id;
}

function displayName(survivor, player) {
  if (!survivor) return 'Someone';
  return isPlayer(survivor, player) ? 'You' : survivor.firstName;
}

function formatNameList(survivors = [], player) {
  const names = survivors.map(s => displayName(s, player)).filter(Boolean);
  if (!names.length) return '';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
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

  const speaker = document.createElement('div');
  speaker.id = 'day1-speaker';
  speaker.style.fontWeight = 'bold';
  speaker.style.fontSize = '1.3rem';
  speaker.style.color = '#3c2415';

  const phaseLabel = document.createElement('div');
  phaseLabel.id = 'day1-phase-label';
  phaseLabel.style.fontSize = '0.95rem';
  phaseLabel.style.color = '#6b4c2b';
  phaseLabel.textContent = 'First Impressions';

  header.appendChild(speaker);
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
  return { overlay, speaker, textArea, choices, nextBtn, phaseLabel, statusLine };
}

function removeOverlay(overlay) {
  overlay?.remove();
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

function addAssignment(tasks, key, survivor) {
  const task = getTask(tasks, key);
  if (!task || task.assignedIds.includes(survivor.id) || !canAssign(task)) return false;
  task.assignedIds.push(survivor.id);
  return true;
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

function formatNames(ids, members) {
  return ids.map(id => members.find(m => m.id === id)?.firstName || 'Unknown').join(', ') || 'None';
}

function describeAssignmentLine(survivor, taskKey, profile, usedLines, player) {
  const { caps, bossy, proud, strategicFloater } = profile;
  const name = displayName(survivor, player);
  const you = isPlayer(survivor, player);

  const pickUnique = options => {
    const shuffled = shuffleArray(options);
    const choice = shuffled.find(line => !usedLines.has(typeof line === 'function' ? line() : line)) || shuffled[0];
    const resolved = typeof choice === 'function' ? choice() : choice;
    usedLines.add(resolved);
    return resolved;
  };

  const narrate = (youText, otherText) => (you ? youText : otherText);
  const withQuote = (youLine, otherLine, quote) => formatNarrationQuote(narrate(youLine, otherLine), quote);

  const fireVariants = [
    withQuote('You crouch by the cold pit, confident.', `${name} crouches by the cold pit, confident.`, 'I’ve done this on treks. I’ll get a spark.'),
    withQuote('You kneel without ceremony.', `${name} kneels without ceremony.`, 'Fire’s mine. Trust me.'),
    withQuote('You toss sand aside, measuring wind.', `${name} tosses sand aside, measuring wind.`, 'Let me set the pit. One shot, one flame.'),
    withQuote('You study the damp sticks.', `${name} studies the damp sticks.`, 'Give me a minute. I can coax this to life.'),
    withQuote('You tap the flint like an old friend.', `${name} taps the flint like an old friend.`, 'I’ll own fire. Check back when you smell smoke.'),
    withQuote('You snap to the task.', `${name} snaps to the task.`, 'Fire first. I’ll get us warmth.'),
    withQuote('You set your pack down by the pit.', `${name} sets their pack down by the pit.`, 'I’ve wanted this job. I won’t blow it.'),
    withQuote('You claim a patch of sand with a nod.', `${name} claims a patch of sand with a nod.`, 'Let me baby the embers. We’ll be good.')
  ];

  const shelterVariants = [
    withQuote('You clap hands to get motion.', `${name} claps hands to get motion.`, 'Shelter with me. Let’s frame it right.'),
    withQuote('You roll your sleeves with purpose.', `${name} rolls sleeves with purpose.`, 'I’ll take shelter—need one more set of hands.'),
    withQuote('You drag a log into position.', `${name} drags a log into position.`, 'If we angle the roof, we’ll stay dry. I’m on shelter.'),
    withQuote('You gesture to the treeline.', `${name} gestures to the treeline.`, 'Grab bamboo with me. Let’s build clean.'),
    withQuote('You check spacing in the sand.', `${name} checks spacing in the sand.`, 'I’ll help frame this. Someone keep it level with me.'),
    withQuote('You plant your feet.', `${name} plants their feet.`, 'I’m good with structure. I’ll anchor shelter.'),
    withQuote('You knock on a trunk like a builder.', `${name} knocks on a trunk like a builder.`, 'This one’s solid. I’ll start the posts.'),
    withQuote('You draw lines in the sand.', `${name} draws lines in the sand.`, 'Two posts here, crossbeam there. I’m on shelter.')
  ];

  const foodVariants = [
    withQuote('You nod toward the treeline.', `${name} nods toward the treeline.`, 'I’ll hunt for coconuts and fish. Back soon.'),
    withQuote('You grab what passes for a spear.', `${name} grabs what passes for a spear.`, 'Food run. I’ll return with something… hopefully.'),
    withQuote('You scan the waterline.', `${name} scans the waterline.`, 'Tide’s decent. I’ll try for crabs and coconuts.'),
    withQuote('You shoulder a woven bag.', `${name} shoulders a woven bag.`, 'Let me forage. I’ll bring back whatever I can.'),
    withQuote('You taste the wind like a hunter.', `${name} tastes the wind like a hunter.`, 'I’ll chase protein. If it moves, I’ll find it.'),
    withQuote('You eye the horizon.', `${name} eyes the horizon.`, 'I’ll fish the shallows. Someone join if you want fresh dinner.'),
    withQuote('You trace tracks in the sand.', `${name} traces tracks in the sand.`, 'Something dragged through here. I’m on food.'),
    withQuote('You cinch a headband.', `${name} cinches a headband.`, 'Food duty for me. I’ll hustle back.')
  ];

  const materialsVariants = [
    withQuote('You scan the tree line, sizing up what to haul first.', `${name} scans the tree line, sizing up what to haul first.`, 'I’ll keep wood and bamboo flowing.'),
    withQuote('You loosen your shoulders, ready to move.', `${name} loosens their shoulders, ready to move.`, 'Hauling stuff suits me. I’ll keep us stocked.'),
    withQuote('You keep it simple, no big speech.', `${name} keeps it simple, no big speech.`, 'I’ll gather. Less talk, more work.'),
    withQuote('You track the beach and jungle like a supply map.', `Eyes track the beach and jungle like a supply map for ${name}.`, 'I can organize materials. Let’s not run empty.'),
    withQuote('You grin, already picturing armloads of bamboo.', `${name} grins, already picturing armloads of bamboo.`, 'I’ll roam and haul. If you need me, yell.'),
    withQuote('You shrug, but it’s a confident shrug.', `${name} shrugs, but it’s a confident shrug.`, 'Sure, I’ll bring back wood. Not gonna sit around.'),
    withQuote('You chuckle at the looming workload.', `${name} chuckles at the looming workload.`, 'Beast of burden coming through. Materials are mine.'),
    withQuote('You already pick a direction, eyes sharp.', `${name} already picks a direction, eyes sharp.`, 'I’ll keep options open—start with bamboo, pivot if needed.')
  ];

  const floatVariants = [
    withQuote('You keep your stance relaxed, clocking everyone’s roles.', `${name} keeps their stance relaxed, clocking everyone’s roles.`, 'I’ll float and plug holes.'),
    withQuote('You smirk like you’re keeping angles open.', `${name} smirks like they’re keeping angles open.`, 'I’ll bounce around. Useful to stay flexible.'),
    withQuote('You hesitate, then lean on charm.', `${name} hesitates, then leans on charm.`, 'Let me glide and help where gaps show up.'),
    withQuote('You admit it with a half-laugh.', `${name} admits it with a half-laugh.`, 'I’m a floater today. Tap me in as needed.'),
    withQuote('You size up the map of tasks.', `${name} sizes up the map of tasks.`, 'I’ll stay loose—fill cracks, keep eyes open.'),
    withQuote('You raise a hand halfway.', `${name} raises a hand halfway.`, 'Put me where you need me. I’ll float for now.'),
    withQuote('You lean against a pack.', `${name} leans against a pack.`, 'I can bounce around, keep morale up, cover gaps.'),
    withQuote('You flash an easy smile.', `${name} flashes an easy smile.`, 'I’ll float to start—promise I’m not disappearing.')
  ];

  switch (taskKey) {
    case 'fire':
      return pickUnique(fireVariants);
    case 'shelter':
      return pickUnique(shelterVariants);
    case 'food':
      return pickUnique(foodVariants);
    case 'materials':
      if (bossy || proud) return formatNarrationQuote(narrate('You point toward the jungle.', `${name} points toward the jungle.`), 'I’ll manage materials—keep pace.');
      return pickUnique(materialsVariants);
    default:
      if (strategicFloater) {
        return pickUnique([
          withQuote('You hover at the edge, eyes calculating.', `${name} hovers at the edge, eyes calculating.`, 'Floating keeps me informed. I’ll step in where it matters.'),
          withQuote('You give a knowing grin.', `${name} gives a knowing grin.`, 'Let me see the gaps. I’ll cover the weak spots.')
        ]);
      }
      return pickUnique(floatVariants);
  }
}

function buildPlayerIntent(choiceKey) {
  switch (choiceKey) {
    case 'fire':
      return { posture: 'claim', preferredRole: 'fire', energy: 'high', assertiveness: 80 };
    case 'shelter':
      return { posture: 'claim', preferredRole: 'shelter', energy: 'high', assertiveness: 75 };
    case 'materials':
      return { posture: 'support', preferredRole: 'materials', energy: 'medium', assertiveness: 60 };
    case 'food':
      return { posture: 'support', preferredRole: 'food', energy: 'medium', assertiveness: 60 };
    case 'float':
      return { posture: 'hang_back', preferredRole: 'float', energy: 'low', assertiveness: 20 };
    case 'mediate':
      return { posture: 'mediate', preferredRole: null, energy: 'medium', assertiveness: 45 };
    case 'flex':
      return { posture: 'support', preferredRole: null, energy: 'medium', assertiveness: 50 };
    default:
      return { posture: 'support', preferredRole: null, energy: 'medium', assertiveness: 50 };
  }
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

function selectDeferredPlayerRole(plannedTasks, player, tribeMembers) {
  const coverage = minCoverageState(plannedTasks);
  const order = ['materials', 'food', 'shelter', 'fire'];
  for (const role of order) {
    const task = getTask(plannedTasks, role);
    if (role === 'shelter' && task.assignedIds.length >= 2) continue;
    if (role !== 'shelter' && coverage[role]) continue;
    return role;
  }
  const floatTask = getTask(plannedTasks, 'float');
  return floatTask.assignedIds.includes(player.id) ? 'float' : null;
}

function pickChemistryMoments(tasks, members, leadershipScenario) {
  const moments = [];
  const shelter = getTask(tasks, 'shelter');
  if (shelter.assignedIds.length === 2) {
    const [aId, bId] = shelter.assignedIds;
    const a = members.find(m => m.id === aId);
    const b = members.find(m => m.id === bId);
    const aCap = buildCapabilities(a);
    const bCap = buildCapabilities(b);
    const compatibility = (aCap.social + bCap.social + aCap.workEthic + bCap.workEthic) / 4;
    if (compatibility > 65) {
      moments.push({
        type: 'bond',
        pair: [a, b],
        textA: formatNarrationQuote(`${a.firstName} and ${b.firstName} fall into rhythm measuring bamboo.`, 'We build clean, we get some sleep.'),
        textB: formatNarrationQuote(`${b.firstName} appreciates the pace.`, 'Feels good working with someone who hustles.'),
        delta: getRandomInt(8, 15),
        tag: 'day1_bond'
      });
    } else if (compatibility < 45) {
      const pushy = aCap.stubbornness >= bCap.stubbornness ? a : b;
      const proud = pushy === a ? b : a;
      moments.push({
        type: 'tension',
        pair: [pushy, proud],
        textA: formatNarrationQuote(`${pushy.firstName} tightens a lash, not loving feedback.`, 'Angle it my way. Sturdier.'),
        textB: formatNarrationQuote(`${proud.firstName} bristles.`, 'Relax, I’ve built stuff before.'),
        delta: -getRandomInt(8, 15),
        tag: 'shelter_friction'
      });
    }
  }

  if (leadershipScenario === 'contested') {
    const candidates = [getTask(tasks, 'fire'), getTask(tasks, 'shelter')].flatMap(t => t.assignedIds);
    const [a, b] = candidates.map(id => members.find(m => m.id === id)).filter(Boolean).slice(0, 2);
    if (a && b) {
      moments.push({
        type: 'leadership_tension',
        pair: [a, b],
        textA: formatNarrationQuote(`${a.firstName} checks the other’s tone.`, 'Who’s actually calling shots?'),
        textB: formatNarrationQuote(`${b.firstName} keeps it cool.`, 'We’ll see whose plan works.'),
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
        textA: formatNarrationQuote(`${worker.firstName} notices the floater hanging back.`, 'Floating is fine, just don’t disappear.'),
        textB: formatNarrationQuote(`${floater.firstName} answers lightly.`, 'I’m here. Just keeping flexible.'),
        delta: -getRandomInt(5, 8),
        tag: 'lazy_signal'
      });
    }
  }

  const bond = moments.find(m => m.type === 'bond');
  const tension = moments.find(m => m.type !== 'bond');
  return [bond, tension].filter(Boolean);
}

function buildEventSummaryText({ player, members, leadership, tasks, chemistryMoments, closingMood, playerEndingRole, playerContestedLeader }) {
  const roleAssignments = key => {
    const task = getTask(tasks, key) || { assignedIds: [] };
    const roster = task.assignedIds.map(id => members.find(m => m.id === id)).filter(Boolean);
    return formatNameList(roster, player) || 'None';
  };

  const leadershipLine = (() => {
    if (leadership.scenario === 'player_leads') return 'You guide the early talk, and people follow your tempo.';
    if (leadership.scenario === 'contested') return `${displayName(leadership.topLeader, player)} and ${displayName(leadership.runnerUp, player)} both angle for control before it settles.`;
    return `${displayName(leadership.topLeader, player)} steps up first, shaping the flow.`;
  })();

  const clashLine = (() => {
    if (playerContestedLeader) return `Clash: You press back against ${displayName(leadership.topLeader, player)} until the plan moves.`;
    if (leadership.scenario === 'contested') return `Clash: ${displayName(leadership.topLeader, player)} and ${displayName(leadership.runnerUp, player)} trade pitches before the tribe picks a path.`;
    const tensionMoment = chemistryMoments.find(m => m.type !== 'bond');
    if (tensionMoment) {
      const [a, b] = tensionMoment.pair.map(p => displayName(p, player));
      return `Clash: ${a} and ${b} bump heads while everyone pretends not to notice.`;
    }
    return 'Clash: None—just a few sharp looks before people move on.';
  })();

  const chemistryLines = (() => {
    if (!chemistryMoments.length) return ['Small talk stays surface-level—no sparks yet.'];
    return chemistryMoments.slice(0, 2).map(m => {
      const [a, b] = m.pair.map(p => displayName(p, player));
      if (m.type === 'bond') return `${a} and ${b} find easy rhythm as they work.`;
      if (m.type === 'leadership_tension') return `${a} and ${b} trade barbs about who leads.`;
      if (m.type === 'lazy_callout') return `${a} calls out ${b} for hanging back.`;
      return `${a} and ${b} circle each other, wary.`;
    });
  })();

  const moodLine = closingMood === 'confident'
    ? 'The tribe feels confident—purposeful footsteps heading to the tasks.'
    : closingMood === 'chaotic'
      ? 'The tribe feels chaotic—energy high, patience thin, everyone hustling before another argument.'
      : 'The tribe feels tentative—plans exist, but everyone watches to see if they’ll hold.';

  const playerLine = (() => {
    const labelMap = { fire: 'Fire', shelter: 'Shelter', food: 'Food', materials: 'Materials', float: 'Float' };
    const roleLabel = labelMap[playerEndingRole] || 'Float';
    return `You end up on ${roleLabel}${roleLabel === 'Float' ? ', keeping flexible eyes on the gaps.' : ', and the tribe will remember how you handle it.'}`;
  })();

  return [
    'Bags hit the sand and the group conversation finally feels connected.',
    '',
    'Leadership:',
    `• ${leadershipLine}`,
    `• ${clashLine}`,
    '',
    'Assignments:',
    `• Fire: ${roleAssignments('fire')}`,
    `• Shelter: ${roleAssignments('shelter')}`,
    `• Food: ${roleAssignments('food')}`,
    `• Materials: ${roleAssignments('materials')}`,
    `• Float: ${roleAssignments('float')}`,
    '',
    'Chemistry:',
    ...chemistryLines.map(line => `• ${line}`),
    '',
    'Tone:',
    moodLine,
    '',
    playerLine
  ].join('\n');
}

export async function runDay1FirstImpressions({ gameManager }) {
  return new Promise(resolve => {
    const playerTribe = gameManager.getPlayerTribe();
    const player = gameManager.getPlayerSurvivor();
    if (!playerTribe || !player) return resolve(null);
    if (![6, 9].includes(playerTribe.members.length)) return resolve(null);

    const overlayEls = buildOverlay();
    const { overlay, speaker, textArea, choices, nextBtn, statusLine } = overlayEls;

    const tasks = taskDefinitions(playerTribe.members.length);
    const leadership = resolveLeadershipScenario(playerTribe.members, player);
    const usedLines = new Set();
    const trackLine = line => {
      if (line) usedLines.add(line);
      return line;
    };
    const leaderClaims = new Map();
    const pickLeaderRole = leader => {
      const caps = buildCapabilities(leader);
      return caps.fire >= caps.shelter ? 'fire' : 'shelter';
    };
    if (leadership.scenario === 'npc_leads') {
      leaderClaims.set(leadership.topLeader.id, pickLeaderRole(leadership.topLeader));
    }
    if (leadership.scenario === 'contested') {
      const topRole = pickLeaderRole(leadership.topLeader);
      const runnerRole = pickLeaderRole(leadership.runnerUp) === topRole ? (topRole === 'fire' ? 'shelter' : 'fire') : pickLeaderRole(leadership.runnerUp);
      leaderClaims.set(leadership.topLeader.id, topRole);
      leaderClaims.set(leadership.runnerUp.id, runnerRole);
    }

    const beatQueue = [];
    let currentIndex = 0;
    const awaitingChoice = { value: false };
    const enteredBeats = new WeakSet();
    let playerIntent = null;
    let playerRoleChoice = null;
    let chemistryMoments = [];
    let playerLeadershipTone = 'support';
    let playerDeferred = false;
    let playerCommittedRole = null;
    let playerContestedLeader = false;
    let closingMood = 'tentative';
    let playerEndingRole = null;
    let finalized = false;

    const leaders = leadership.contestedPair || [leadership.topLeader, leadership.runnerUp].filter(Boolean).slice(0, 2);

    const addBeat = beat => beatQueue.push(beat);

    const updateStatus = () => {
      const fire = formatNames(getTask(tasks, 'fire').assignedIds, playerTribe.members);
      const shelter = formatNames(getTask(tasks, 'shelter').assignedIds, playerTribe.members);
      const food = formatNames(getTask(tasks, 'food').assignedIds, playerTribe.members);
      const materials = formatNames(getTask(tasks, 'materials').assignedIds, playerTribe.members);
      statusLine.textContent = `Roles • Fire: ${fire} | Shelter: ${shelter} | Food: ${food} | Materials: ${materials}`;
    };

    const applyBeatSideEffects = beat => {
      if (enteredBeats.has(beat)) return;
      if (typeof beat.onEnter === 'function') {
        beat.onEnter();
        updateStatus();
      }
      enteredBeats.add(beat);
    };

    function renderBeatUI({ beatQueue: queue, currentIndex: index, overlayEls: els, awaitingChoice: choiceState, renderChoiceUI }) {
      if (!queue.length) return;
      const beat = queue[Math.min(index, queue.length - 1)];
      applyBeatSideEffects(beat);
      const { speaker: speakerEl, textArea: textEl, choices: choicesEl, nextBtn: nextButton, phaseLabel } = els;
      phaseLabel.textContent = 'First Impressions';

      if (beat.type === 'choice') {
        choiceState.value = true;
        speakerEl.textContent = beat.speaker;
        textEl.textContent = beat.text;
        choicesEl.innerHTML = '';
        nextButton.style.display = 'none';
        renderChoiceUI();
        return;
      }

      choiceState.value = false;
      speakerEl.textContent = beat.speaker;
      textEl.textContent = beat.text;
      choicesEl.innerHTML = '';
      nextButton.style.display = 'inline-block';
      nextButton.textContent = beat.nextLabel || (beat.type === 'finalize' ? 'Done' : 'Next');
    }

    // Opening
    addBeat({ speaker: 'Narrator', text: 'Bags hit the sand. The tribe sizes each other up—no shelter, no fire, just first impressions.' });

    // Leadership emergence
    if (leadership.scenario === 'npc_leads') {
      const claimFire = buildCapabilities(leadership.topLeader).fire >= buildCapabilities(leadership.topLeader).shelter;
      const line = claimFire
        ? trackLine(formatNarrationQuote('A steady voice cuts through the quiet.', 'Fire first. I’ll work the pit. Who’s pairing for shelter?'))
        : trackLine(formatNarrationQuote('One voice takes charge, eyes on the trees.', 'Shelter’s priority. I’ll start a frame—need a strong partner. Who wants fire?'));
      addBeat({ speaker: leadership.topLeader.firstName, text: line });
    } else if (leadership.scenario === 'player_leads') {
      addBeat({ speaker: 'Narrator', text: 'Eyes land on you. You feel like the clearest presence here.' });
      const promptVoice = shuffleArray(playerTribe.members.filter(m => m.id !== player.id))[0];
      addBeat({ speaker: promptVoice?.firstName || 'Someone', text: formatNarrationQuote('The circle waits for direction.', 'So… what’s the move?') });
    } else {
      addBeat({ speaker: leadership.topLeader.firstName, text: formatNarrationQuote('One voice is already angling for fire.', 'I’ll call fire—') });
      addBeat({ speaker: leadership.runnerUp.firstName, text: formatNarrationQuote('Another voice overlaps, pointing at the trees.', 'Shelter matters more. We need a roof fast.') });
    }

    // Player decision
    addBeat({
      type: 'choice',
      speaker: 'You',
      text: leadership.scenario === 'player_leads'
        ? 'They’re waiting on you. What do you claim first?'
        : 'You get the first volunteer slot. Where do you jump in?'
    });

    function addChoiceButton(label, onClick) {
      const btn = document.createElement('button');
      btn.className = 'rect-button';
      btn.textContent = label;
      btn.style.minHeight = '42px';
      btn.style.fontSize = '1rem';
      btn.addEventListener('click', onClick);
      choices.appendChild(btn);
    }

    function renderChoiceUI() {
      choices.innerHTML = '';
      const available = ['fire', 'shelter', 'materials', 'food'];
      if (available.includes('fire')) addChoiceButton('I’ll handle fire.', () => commitPlayer('fire'));
      if (available.includes('shelter')) addChoiceButton('I’ll start shelter. Need someone with me.', () => commitPlayer('shelter'));
      if (available.includes('materials')) addChoiceButton('I’ll gather materials.', () => commitPlayer('materials'));
      if (available.includes('food')) addChoiceButton('I’ll hunt for food.', () => commitPlayer('food'));
      addChoiceButton('Wherever I’m needed.', () => commitPlayer('flex'));
      addChoiceButton('I’ll float and feel it out.', () => commitPlayer('float'));
      addChoiceButton('Let’s talk it through.', () => commitPlayer('mediate'));
    }

    function spliceBeatsAfterChoice(newBeats) {
      beatQueue.splice(currentIndex + 1, beatQueue.length - currentIndex - 1, ...newBeats);
    }

    function makeAssignmentBeat({ survivor, role, text, speakerOverride }) {
      return {
        speaker: speakerOverride || displayName(survivor, player),
        text,
        onEnter: () => addAssignment(tasks, role, survivor)
      };
    }

    function addGroupAssignmentBeat({ narratorText, survivors, role }) {
      const names = formatNameList(survivors, player);
      const resolvedText = narratorText && narratorText.includes(names)
        ? narratorText
        : `${names} ${narratorText || 'huddle around the task.'}`;
      const beat = {
        speaker: 'Narrator',
        text: resolvedText,
        onEnter: () => {
          survivors.forEach(survivor => addAssignment(tasks, role, survivor));
        }
      };
      return beat;
    }

    function buildNegotiationBeats(choiceKey) {
      const plannedTasks = cloneTaskState(tasks);
      const beats = [];
      const unassigned = playerTribe.members.slice();
      const pullUnassigned = survivor => {
        const idx = unassigned.findIndex(m => m.id === survivor.id);
        if (idx >= 0) unassigned.splice(idx, 1);
      };

      const registerPlan = (role, survivor) => {
        const task = getTask(plannedTasks, role);
        if (task && !task.assignedIds.includes(survivor.id) && canAssign(task)) {
          task.assignedIds.push(survivor.id);
          pullUnassigned(survivor);
        }
      };

      const playerChoiceIntent = buildPlayerIntent(choiceKey);
      playerIntent = playerChoiceIntent;
      playerLeadershipTone = playerIntent.posture === 'claim' ? 'claimed' : playerIntent.posture === 'mediate' ? 'defers' : 'support';
      playerDeferred = choiceKey === 'flex' || choiceKey === 'mediate';
      playerCommittedRole = null;
      playerRoleChoice = choiceKey;

      // Leader claims resolved first
      const leadershipBeats = [];
      leaderClaims.forEach((role, id) => {
        const leader = leaders.find(l => l.id === id);
        if (!leader) return;
        const declaredRole = role;
        const pushText = declaredRole === 'fire'
          ? trackLine(formatNarrationQuote(`${leader.firstName} is already at the fire pit.`, 'Let me own this. One firemaker, clean process.'))
          : trackLine(formatNarrationQuote(`${leader.firstName} taps the sand where posts should go.`, 'Shelter with me. Keep it straight.'));
        leadershipBeats.push(makeAssignmentBeat({ survivor: leader, role: declaredRole, text: pushText }));
        registerPlan(declaredRole, leader);
      });

      // Player response beat
      const choiceBeats = [];
      if (choiceKey === 'flex' || choiceKey === 'mediate') {
        const line = choiceKey === 'mediate'
          ? formatNarrationQuote('You open space for others to speak.', 'Let’s talk it through. I’ll plug in where it helps most.')
          : formatNarrationQuote('You keep posture open.', 'Wherever I’m needed. Point me and I’ll move.');
        choiceBeats.push({ speaker: 'You', text: line });
      } else if (choiceKey === 'float') {
        choiceBeats.push({ speaker: 'You', text: formatNarrationQuote('You promise to stay flexible.', 'I’ll float to start—if a gap opens, I’ll jump.') });
        registerPlan('float', player);
      } else if (playerIntent.preferredRole) {
        const chosenRole = playerIntent.preferredRole;
        const conflictingLeader = leadershipBeats.find(b => b.onEnter && leaderClaims.get(playerTribe.members.find(m => m.firstName === b.speaker)?.id) === chosenRole);
        if (conflictingLeader && playerIntent.assertiveness < 70) {
          playerDeferred = true;
          const firmLeader = leaders.find(l => leaderClaims.get(l.id) === chosenRole);
          choiceBeats.push({ speaker: 'Narrator', text: `${displayName(firmLeader, player)} is already firm on ${chosenRole}. You read the room and stay flexible.` });
        } else {
          const conflictOwner = leaders.find(l => leaderClaims.get(l.id) === chosenRole);
          if (conflictOwner && playerIntent.assertiveness >= 70) {
            playerContestedLeader = true;
            choiceBeats.push({ speaker: 'Narrator', text: `You and ${displayName(conflictOwner, player)} lock eyes over ${chosenRole}.` });
            choiceBeats.push(makeAssignmentBeat({ survivor: player, role: chosenRole, text: formatNarrationQuote('You don’t back down.', `I’m taking ${chosenRole}. We need it solid.`) }));
            registerPlan(chosenRole, player);
          } else {
            choiceBeats.push(makeAssignmentBeat({ survivor: player, role: chosenRole, text: formatNarrationQuote('You stake an early claim.', `I’ll handle ${chosenRole}. I’ve got it.`) }));
            registerPlan(chosenRole, player);
          }
        }
      }

      const sequenceIntro = { speaker: 'Narrator', text: 'Voices bounce around the circle as jobs get sorted.' };

      const assignRoleInOrder = (role, countNeeded) => {
        const already = getTask(plannedTasks, role).assignedIds.length;
        const need = Math.max(0, countNeeded - already);
        const pool = unassigned.slice();
        const planned = [];
        while (planned.length < need && pool.length) {
          let pick = null;
          if (playerDeferred && role === 'materials' && unassigned.includes(player)) pick = player;
          if (!pick && playerDeferred && role === 'food' && unassigned.includes(player) && !minCoverageState(plannedTasks).materials) pick = player;
          if (!pick && playerDeferred && role === 'shelter' && unassigned.includes(player) && getTask(plannedTasks, 'shelter').assignedIds.length < 1 && minCoverageState(plannedTasks).materials && minCoverageState(plannedTasks).food) pick = player;
          if (!pick) {
            const cautiousPool = (playerDeferred && role === 'fire')
              ? pool.filter(m => m.id !== player.id || pool.length === 1)
              : pool;
            pick = pickBestCandidate(cautiousPool, role) || cautiousPool[0];
            if (!pick && pool.includes(player)) pick = player;
          }
          registerPlan(role, pick);
          planned.push(pick);
          const idx = pool.findIndex(m => m.id === pick.id);
          if (idx >= 0) pool.splice(idx, 1);
        }
        if (!planned.length) return [];
        if (planned.length >= 3 && role !== 'fire') {
          const names = formatNameList(planned, player);
          const narratorText = `${names} lean toward ${role}. A quick huddle settles who actually does it.`;
          const spotlight = shuffleArray(planned).slice(0, 2);
          return [
            addGroupAssignmentBeat({ narratorText, survivors: planned, role }),
            ...spotlight.map(survivor => makeAssignmentBeat({ survivor, role, text: describeAssignmentLine(survivor, role, getPersonalityProfile(survivor), usedLines, player) }))
          ];
        }
        return planned.map(survivor => makeAssignmentBeat({ survivor, role, text: describeAssignmentLine(survivor, role, getPersonalityProfile(survivor), usedLines, player) }));
      };

      const requiredBeats = [];
      requiredBeats.push(...assignRoleInOrder('fire', 1));
      requiredBeats.push(...assignRoleInOrder('shelter', 2));
      requiredBeats.push(...assignRoleInOrder('materials', 1));
      requiredBeats.push(...assignRoleInOrder('food', 1));

      const coverageAfter = minCoverageState(plannedTasks);
      const allowFloat = coverageAfter.fire && coverageAfter.shelter && coverageAfter.materials && coverageAfter.food;

      const remainingPool = unassigned.slice();
      const floaters = [];
      remainingPool.forEach(member => {
        if (allowFloat && floaters.length < 2) {
          registerPlan('float', member);
          floaters.push(member);
        } else if (canAssign(getTask(plannedTasks, 'materials'))) {
          registerPlan('materials', member);
        } else if (canAssign(getTask(plannedTasks, 'food'))) {
          registerPlan('food', member);
        } else if (canAssign(getTask(plannedTasks, 'shelter'))) {
          registerPlan('shelter', member);
        } else {
          registerPlan('float', member);
          floaters.push(member);
        }
      });

      const floatBeats = [];
      if (floaters.length) {
        const floaterNames = formatNameList(floaters, player);
        const narratorText = allowFloat
          ? `${floaterNames} keep it loose—floating once core jobs are covered.`
          : `${floaterNames} try to float, but the gaps glare back at them.`;
        floatBeats.push(addGroupAssignmentBeat({ narratorText, survivors: floaters, role: 'float' }));
        const spot = shuffleArray(floaters).slice(0, 1);
        spot.forEach(survivor => floatBeats.push(makeAssignmentBeat({ survivor, role: 'float', text: describeAssignmentLine(survivor, 'float', getPersonalityProfile(survivor), usedLines, player) })));
      }

      const steeringBeats = [];
      const stillMissing = () => {
        const state = minCoverageState(plannedTasks);
        return Object.entries({ fire: 1, shelter: 2, materials: 1, food: 1 })
          .filter(([key, needed]) => getTask(plannedTasks, key).assignedIds.length < needed)
          .map(([key]) => key);
      };
      const missingNow = stillMissing();
      if (missingNow.length) {
        missingNow.forEach(role => {
          const floatIds = getTask(plannedTasks, 'float').assignedIds.slice();
          const redirectTargetId = floatIds.shift();
          if (!redirectTargetId) return;
          const survivor = playerTribe.members.find(m => m.id === redirectTargetId);
          getTask(plannedTasks, 'float').assignedIds = floatIds;
          registerPlan(role, survivor);
          steeringBeats.push({
            speaker: 'Narrator',
            text: `Someone flags the gap at ${role}. ${displayName(survivor, player)} gets nudged into it.`,
            onEnter: () => {
              getTask(tasks, 'float').assignedIds = getTask(tasks, 'float').assignedIds.filter(id => id !== survivor.id);
              addAssignment(tasks, role, survivor);
            }
          });
          steeringBeats.push(makeAssignmentBeat({ survivor, role, text: describeAssignmentLine(survivor, role, getPersonalityProfile(survivor), usedLines, player) }));
        });
      }

      if (playerDeferred && !getTask(plannedTasks, 'fire').assignedIds.includes(player.id) && !getTask(plannedTasks, 'shelter').assignedIds.includes(player.id) && !getTask(plannedTasks, 'materials').assignedIds.includes(player.id) && !getTask(plannedTasks, 'food').assignedIds.includes(player.id)) {
        const deferredRole = selectDeferredPlayerRole(plannedTasks, player, playerTribe.members) || 'float';
        registerPlan(deferredRole, player);
        steeringBeats.push(makeAssignmentBeat({ survivor: player, role: deferredRole, text: formatNarrationQuote('You finally step into a slot.', `I’ll cover ${deferredRole}. Let’s keep moving.`) }));
      }

      const assignmentBeats = [
        sequenceIntro,
        ...leadershipBeats,
        ...choiceBeats,
        ...requiredBeats,
        ...steeringBeats,
        ...floatBeats
      ].filter(Boolean);

      assignmentBeats.push({
        speaker: 'Narrator',
        text: 'Plans settle into place. People echo assignments back to be sure.',
        onEnter: () => updateStatus()
      });

      return assignmentBeats;
    }

    function addChemistryMoments() {
      const selected = pickChemistryMoments(tasks, playerTribe.members, leadership.scenario);
      chemistryMoments = selected;
      const beats = [];
      selected.forEach(m => {
        beats.push({ speaker: displayName(m.pair[0], player), text: m.textA });
        beats.push({ speaker: displayName(m.pair[1], player), text: m.textB });
      });
      return beats;
    }

    function addSendOffBeats() {
      const frictionCount = chemistryMoments.filter(m => m.type !== 'bond').length;
      const clarityScore = leadership.scenario === 'npc_leads' || leadership.scenario === 'player_leads' ? 1 : 0;
      const coverageState = minCoverageState(tasks);
      const coverageMet = coverageState.fire && coverageState.shelter && coverageState.materials && coverageState.food;
      const averageWork = (() => {
        const ids = tasks.flatMap(t => t.assignedIds);
        const scores = ids.map(id => buildCapabilities(playerTribe.members.find(m => m.id === id)).workEthic);
        if (!scores.length) return 50;
        return scores.reduce((a, b) => a + b, 0) / scores.length;
      })();

      const mood = (clarityScore && frictionCount === 0 && averageWork > 55 && coverageMet)
        ? 'confident'
        : (frictionCount >= 1 || leadership.scenario === 'contested' || playerContestedLeader)
          ? 'chaotic'
          : 'tentative';
      closingMood = mood;

      const beats = [];
      beats.push({ speaker: 'Narrator', text: 'Plans finally get locked. People grab bags and start moving.' });

      const moodText = mood === 'confident'
        ? 'The plan actually sounds solid. People split off with purpose.'
        : mood === 'chaotic'
          ? 'Voices overlap again. Everyone scatters before more sparks fly.'
          : 'It’s a plan, kind of. People wander toward their tasks, glancing back.';

      beats.push({ speaker: 'Narrator', text: `Tribe mood: ${mood}. ${moodText}` });

      const finalRole = tasks.find(t => t.assignedIds.includes(player.id))?.key || playerCommittedRole || playerRoleChoice || 'float';
      playerRoleChoice = finalRole;
      playerEndingRole = finalRole;
      const reflectionMap = {
        fire: 'Fire is a spotlight. If it fails, everyone will remember who owned it.',
        shelter: 'Shelter is intimate. How you vibe with your partner will stick.',
        materials: 'Hauling materials is thankless but steady. Maybe that steadiness is the point.',
        food: 'Food is a gamble. Success is glory; failure is silence.',
        float: 'Floating keeps you flexible—and visible if you disappear.',
        flex: 'You offered flexibility; now people will watch if you actually plug gaps.',
        defer: 'You asked for input. Collaborative… or non-committal?'
      };

      const deferredNote = playerDeferred && finalRole !== 'float'
        ? `You waited, then filled the gap at ${finalRole}.`
        : null;
      const contestedNote = playerContestedLeader ? 'You already crossed a leader—eyes will track how you deliver.' : null;
      const floatNote = finalRole === 'float' ? 'Floating keeps you flexible—and looks slippery if you vanish.' : null;
      const reflection = deferredNote || contestedNote || floatNote || reflectionMap[finalRole] || reflectionMap.flex;
      beats.push({ speaker: 'Narrator', text: reflection });

      const summaryBeat = {
        type: 'summary',
        speaker: 'Narrator',
        text: '',
        nextLabel: 'Next',
        onEnter: () => {
          summaryBeat.text = buildEventSummaryText({
            player,
            members: playerTribe.members,
            leadership,
            tasks,
            chemistryMoments,
            closingMood: mood,
            playerEndingRole,
            playerContestedLeader
          });
        }
      };
      beats.push(summaryBeat);

      beats.push({ type: 'finalize', speaker: 'Narrator', text: 'Everyone heads to their spots. Time to get to work.', nextLabel: 'Back to camp' });
      return beats;
    }

    function finalizePlan() {
      if (finalized) return;
      finalized = true;
      const mood = closingMood;

      const plan = tasks.reduce((acc, task) => {
        acc[`${task.key}Ids`] = [...task.assignedIds];
        return acc;
      }, {});

      playerTribe.day1Plan = {
        createdDay: gameManager.day,
        leaderId: leadership.topLeader?.id,
        leadershipScenario: leadership.scenario,
        playerLeadershipTone,
        playerRoleChoice,
        fireIds: plan.fireIds || [],
        shelterIds: plan.shelterIds || [],
        foodIds: plan.foodIds || [],
        materialsIds: plan.materialsIds || [],
        floaterIds: plan.floatIds || [],
        chemistryMoments: chemistryMoments.map(m => ({ type: m.type, pairIds: m.pair.map(p => p.id), tag: m.tag })),
        mood
      };
      playerTribe.day1PlanCreated = true;
      playerTribe.day1PlanEvaluated = playerTribe.day1PlanEvaluated || false;

      logDebug('Final Plan', playerTribe.day1Plan);

      const socialSystem = gameManager.systems.socialMemorySystem;
      const relationshipSystem = gameManager.systems.relationshipSystem;

      chemistryMoments.forEach(m => {
        const [a, b] = m.pair;
        const delta = clamp(m.delta || 0, -20, 20);
        relationshipSystem?.changeRelationship?.(a.id, b.id, delta);
        socialSystem?.addMemory?.(a.id, { type: 'first_impressions', text: `${m.type} with ${b.firstName}`, day: gameManager.day, tags: ['day1', m.tag, `with_${b.firstName}`] });
        socialSystem?.addMemory?.(b.id, { type: 'first_impressions', text: `${m.type} with ${a.firstName}`, day: gameManager.day, tags: ['day1', m.tag, `with_${a.firstName}`] });
      });

      const roleSummary = `Leader: ${playerTribe.members.find(m => m.id === playerTribe.day1Plan.leaderId)?.firstName || 'None'} | Fire: ${formatNames(plan.fireIds || [], playerTribe.members)} | Shelter: ${formatNames(plan.shelterIds || [], playerTribe.members)} | Food: ${formatNames(plan.foodIds || [], playerTribe.members)} | Materials: ${formatNames(plan.materialsIds || [], playerTribe.members)}`;
      socialSystem?.addMemory?.(player.id, { type: 'day1_first_impressions', text: roleSummary, day: gameManager.day, tags: ['day1', 'first_impressions', `role_${playerRoleChoice || 'float'}`, playerLeadershipTone === 'defers' ? 'deferred_leadership_day1' : 'took_charge_day1'] });

      playerTribe.members.forEach(member => {
        const inShelter = plan.shelterIds?.includes(member.id);
        const inFire = plan.fireIds?.includes(member.id);
        const inFood = plan.foodIds?.includes(member.id);
        const inMaterials = plan.materialsIds?.includes(member.id);
        const floaty = plan.floatIds?.includes(member.id);
        const tags = [];
        if (inShelter) tags.push('shelter_day1', 'shelter_pair_day1');
        if (inFire) tags.push('claimed_fire_day1');
        if (inFood) tags.push('food_day1');
        if (inMaterials) tags.push('materials_day1');
        if (floaty) tags.push('float_day1');
        if (member.id === player.id && playerLeadershipTone === 'defers') tags.push('deferred_leadership_day1');
        if (member.id === player.id && playerLeadershipTone !== 'defers') tags.push('took_charge_day1');
        if (tags.length) socialSystem?.addMemory?.(member.id, { type: 'role', text: 'Day 1 role assignment', day: gameManager.day, tags });
      });

      if ((plan.shelterIds || []).length === 2) {
        const [aId, bId] = plan.shelterIds;
        const a = playerTribe.members.find(m => m.id === aId);
        const b = playerTribe.members.find(m => m.id === bId);
        if (a && b) {
          socialSystem?.addMemory?.(a.id, { type: 'shelter_pair', text: `Shelter partner ${b.firstName}`, day: gameManager.day, tags: [`shelter_pair_day1_${b.firstName}`] });
          socialSystem?.addMemory?.(b.id, { type: 'shelter_pair', text: `Shelter partner ${a.firstName}`, day: gameManager.day, tags: [`shelter_pair_day1_${a.firstName}`] });
        }
      }

      chemistryMoments.forEach(m => {
        const [a, b] = m.pair;
        const tagBase = m.type === 'bond' ? 'day1_bond' : m.type;
        socialSystem?.addMemory?.(a.id, { type: 'moment', text: `${m.type} with ${b.firstName}`, day: gameManager.day, tags: [tagBase, `with_${b.firstName}`] });
        socialSystem?.addMemory?.(b.id, { type: 'moment', text: `${m.type} with ${a.firstName}`, day: gameManager.day, tags: [tagBase, `with_${a.firstName}`] });
      });

      const summaryEntry = {
        id: 'day1_first_impressions',
        day: gameManager.day,
        phase: gameManager.gamePhase,
        type: 'day1_first_impressions',
        title: 'Day 1: First Impressions',
        text: roleSummary,
        data: {
          mood,
          leadershipScenario: leadership.scenario,
          playerLeadershipTone,
          playerRoleChoice,
          chemistryMoments: playerTribe.day1Plan.chemistryMoments
        },
        isCinematicEventSummary: true
      };

      const sharedTags = ['day1', 'first_impressions', leadership.scenario, `player_tone_${playerLeadershipTone}`];
      playerTribe.members.forEach(member => {
        socialSystem?.addMemory?.(member.id, { type: 'day1_first_impressions', text: roleSummary, day: gameManager.day, tags: sharedTags });
      });

      gameManager.campLog = gameManager.campLog || [];
      const existingIndex = gameManager.campLog.findIndex(entry => entry.id === summaryEntry.id);
      if (existingIndex >= 0) {
        gameManager.campLog[existingIndex] = summaryEntry;
      } else {
        gameManager.campLog.push(summaryEntry);
      }

      eventManager.publish(GameEvents.DIALOGUE_HIDDEN, { source: 'day1-first-impressions' });
      removeOverlay(overlay);
      resolve({ plan: playerTribe.day1Plan });
    }

    function commitPlayer(choiceKey) {
      if (!awaitingChoice.value) return;
      const assignmentBeats = buildNegotiationBeats(choiceKey);
      const chemistryBeats = addChemistryMoments;
      const finaleBeats = addSendOffBeats;

      const plannedBeats = [
        ...assignmentBeats,
        ...chemistryBeats(),
        ...finaleBeats()
      ];

      spliceBeatsAfterChoice(plannedBeats);
      awaitingChoice.value = false;
      currentIndex += 1;
      renderBeatUI({ beatQueue, currentIndex, overlayEls, awaitingChoice, renderChoiceUI });
      updateStatus();
    }

    nextBtn.addEventListener('click', () => {
      if (awaitingChoice.value) return;
      const beat = beatQueue[currentIndex];
      if (beat?.type === 'finalize') {
        finalizePlan();
        return;
      }
      if (currentIndex < beatQueue.length - 1) {
        currentIndex += 1;
        renderBeatUI({ beatQueue, currentIndex, overlayEls, awaitingChoice, renderChoiceUI });
      }
    });

    eventManager.publish(GameEvents.DIALOGUE_SHOWN, { source: 'day1-first-impressions' });
    renderBeatUI({ beatQueue, currentIndex, overlayEls, awaitingChoice, renderChoiceUI });
    updateStatus();
  });
}

export default { runDay1FirstImpressions };
