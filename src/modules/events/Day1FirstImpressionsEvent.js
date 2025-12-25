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

function describeAssignmentLine(survivor, taskKey, profile, usedLines) {
  const { caps, bossy, proud, strategicFloater, workEthic } = profile;
  const friendly = caps.social > 60;
  const gritty = workEthic > 60;

  const pickUnique = options => {
    const shuffled = shuffleArray(options);
    const choice = shuffled.find(line => !usedLines.has(line)) || shuffled[0];
    usedLines.add(choice);
    return choice;
  };

  const materialsVariants = [
    formatNarrationQuote(`${survivor.firstName} scans the tree line, sizing up what to haul first.`, 'I’ll keep wood and bamboo flowing.'),
    formatNarrationQuote(`${survivor.firstName} loosens their shoulders, ready to move.`, 'Hauling stuff suits me. I’ll keep us stocked.'),
    formatNarrationQuote(`${survivor.firstName} keeps it simple, no big speech.`, 'I’ll gather. Less talk, more work.'),
    formatNarrationQuote(`Eyes track the beach and jungle like a supply map for ${survivor.firstName}.`, 'I can organize materials. Let’s not run empty.'),
    formatNarrationQuote(`${survivor.firstName} grins, already picturing armloads of bamboo.`, 'I’ll roam and haul. If you need me, yell.'),
    formatNarrationQuote(`${survivor.firstName} shrugs, but it’s a confident shrug.`, 'Sure, I’ll bring back wood. Not gonna sit around.'),
    formatNarrationQuote(`${survivor.firstName} chuckles at the looming workload.`, 'Beast of burden coming through. Materials are mine.'),
    formatNarrationQuote(`${survivor.firstName} already picks a direction, eyes sharp.`, 'I’ll keep options open—start with bamboo, pivot if needed.')
  ];

  const floatVariants = [
    formatNarrationQuote(`${survivor.firstName} keeps their stance relaxed, clocking everyone’s roles.`, 'I’ll float and plug holes.'),
    formatNarrationQuote(`${survivor.firstName} smirks like they’re keeping angles open.`, 'I’ll bounce around. Useful to stay flexible.'),
    formatNarrationQuote(`${survivor.firstName} hesitates, then leans on charm.`, 'Let me glide and help where gaps show up.'),
    formatNarrationQuote(`${survivor.firstName} admits it with a half-laugh.`, 'I’m a floater today. Tap me in as needed.'),
    formatNarrationQuote(`${survivor.firstName} sizes up the map of tasks.`, 'I’ll stay loose—fill cracks, keep eyes open.')
  ];

  switch (taskKey) {
    case 'fire':
      return friendly
        ? formatNarrationQuote(`${survivor.firstName} crouches by the cold pit, confident.`, 'I’ve done this on treks. I’ll get a spark.')
        : formatNarrationQuote(`${survivor.firstName} kneels without ceremony.`, 'Fire’s mine. Trust me.');
    case 'shelter':
      if (bossy || proud) return formatNarrationQuote(`${survivor.firstName} claps hands to get motion.`, 'Shelter with me. Let’s frame it right.');
      if (gritty) return formatNarrationQuote(`${survivor.firstName} rolls sleeves with purpose.`, 'I’ll take shelter—need one more set of hands.');
      return formatNarrationQuote(`${survivor.firstName} steps closer, voice steady.`, 'I can help build. Someone pair with me?');
    case 'food':
      return friendly
        ? formatNarrationQuote(`${survivor.firstName} nods toward the treeline.`, 'I’ll hunt for coconuts and fish. Back soon.')
        : formatNarrationQuote(`${survivor.firstName} grabs what passes for a spear.`, 'Food run. I’ll return with something… hopefully.');
    case 'materials':
      if (bossy || proud) return formatNarrationQuote(`${survivor.firstName} points toward the jungle.`, 'I’ll manage materials—keep pace.');
      return pickUnique(materialsVariants);
    default:
      if (strategicFloater) {
        return pickUnique([
          formatNarrationQuote(`${survivor.firstName} hovers at the edge, eyes calculating.`, 'Floating keeps me informed. I’ll step in where it matters.'),
          formatNarrationQuote(`${survivor.firstName} gives a knowing grin.`, 'Let me see the gaps. I’ll cover the weak spots.')
        ]);
      }
      return pickUnique(floatVariants);
  }
}

function buildPlayerIntent(choiceKey) {
  switch (choiceKey) {
    case 'fire':
      return { posture: 'claim', preferredRole: 'fire', energy: 'high', assertiveness: 75 };
    case 'shelter':
      return { posture: 'claim', preferredRole: 'shelter', energy: 'high', assertiveness: 70 };
    case 'materials':
      return { posture: 'support', preferredRole: 'materials', energy: 'medium', assertiveness: 55 };
    case 'food':
      return { posture: 'support', preferredRole: 'food', energy: 'medium', assertiveness: 55 };
    case 'float':
      return { posture: 'hang_back', preferredRole: 'float', energy: 'low', assertiveness: 25 };
    case 'mediate':
      return { posture: 'mediate', preferredRole: null, energy: 'medium', assertiveness: 40 };
    case 'flex':
    default:
      return { posture: 'support', preferredRole: null, energy: 'medium', assertiveness: 45 };
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

function enforceCoverage(tasks, survivors, leaders) {
  const state = minCoverageState(tasks);
  const unassigned = survivors.filter(m => !tasks.some(t => t.assignedIds.includes(m.id)));
  const pool = unassigned
    .map(member => ({ member, caps: buildCapabilities(member) }))
    .sort((a, b) => (b.caps.workEthic + b.caps.leadership) - (a.caps.workEthic + a.caps.leadership));

  const forceRole = (key, scoreFn, count = 1) => {
    while (getTask(tasks, key).assignedIds.length < count) {
      pool.sort((a, b) => scoreFn(b) - scoreFn(a));
      const pick = pool.shift();
      if (!pick) break;
      addAssignment(tasks, key, pick.member);
    }
  };

  if (!state.fire) forceRole('fire', entry => entry.caps.fire + entry.caps.confidence, 1);
  if (!state.shelter) forceRole('shelter', entry => entry.caps.shelter, 2);
  if (!state.materials) forceRole('materials', entry => entry.caps.materials + entry.caps.workEthic, 1);
  if (!state.food) forceRole('food', entry => entry.caps.food, 1);

  // Restrict float until minimums met
  const floatTask = getTask(tasks, 'float');
  if (!minCoverageState(tasks).materials || !minCoverageState(tasks).food || !minCoverageState(tasks).fire || !minCoverageState(tasks).shelter) {
    if (floatTask.assignedIds.length > 1) {
      const reclaimIds = floatTask.assignedIds.slice(1);
      floatTask.assignedIds = floatTask.assignedIds.slice(0, 1);
      reclaimIds.forEach(id => pool.unshift({ member: survivors.find(m => m.id === id), caps: buildCapabilities(survivors.find(m => m.id === id)) }));
    }
  }

  // Leaders cannot both be float if roles missing
  const missingCritical = !minCoverageState(tasks).fire || !minCoverageState(tasks).shelter;
  if (missingCritical && leaders) {
    leaders.forEach(leader => {
      if (getTask(tasks, 'float').assignedIds.includes(leader.id)) {
        getTask(tasks, 'float').assignedIds = getTask(tasks, 'float').assignedIds.filter(id => id !== leader.id);
        pool.unshift({ member: leader, caps: buildCapabilities(leader) });
      }
    });
  }

  // Fill remaining gaps again with reclaimed pool
  const refreshedPool = pool.filter(Boolean);
  if (!minCoverageState(tasks).fire) forceRole('fire', entry => entry.caps.fire + entry.caps.confidence, 1);
  if (!minCoverageState(tasks).shelter) forceRole('shelter', entry => entry.caps.shelter, 2);
  if (!minCoverageState(tasks).materials) forceRole('materials', entry => entry.caps.materials + entry.caps.workEthic, 1);
  if (!minCoverageState(tasks).food) forceRole('food', entry => entry.caps.food, 1);

  // Send extra to materials/food before float
  refreshedPool.forEach(entry => {
    if (!minCoverageState(tasks).materials && canAssign(getTask(tasks, 'materials'))) {
      addAssignment(tasks, 'materials', entry.member);
    } else if (!minCoverageState(tasks).food && canAssign(getTask(tasks, 'food'))) {
      addAssignment(tasks, 'food', entry.member);
    } else {
      addAssignment(tasks, 'float', entry.member);
    }
  });
}

function groupBeatsByRole(assignments, members, usedLines) {
  const beats = [];
  const roleMap = assignments.reduce((acc, { role, survivor }) => {
    acc[role] = acc[role] || [];
    acc[role].push(survivor);
    return acc;
  }, {});

  Object.entries(roleMap).forEach(([role, group]) => {
    if (group.length >= 3) {
      const narratorLine = role === 'float'
        ? 'A wave of “I’ll float” hits the sand… until someone points at the empty fire pit.'
        : `${group.length} voices echo the same plan for ${role}. The beach buzzes with agreement.`;
      beats.push({ speaker: 'Narrator', text: narratorLine });
      const spotlights = shuffleArray(group).slice(0, 2);
      spotlights.forEach(survivor => {
        const profile = getPersonalityProfile(survivor);
        beats.push({ speaker: survivor.firstName, text: describeAssignmentLine(survivor, role, profile, usedLines) });
      });
    } else {
      group.forEach(survivor => {
        const profile = getPersonalityProfile(survivor);
        beats.push({ speaker: survivor.firstName, text: describeAssignmentLine(survivor, role, profile, usedLines) });
      });
    }
  });
  return beats;
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

function renderBeatUI({ beatQueue, currentIndex, overlayEls, awaitingChoice, renderChoiceUI }) {
  if (!beatQueue.length) return;
  const beat = beatQueue[Math.min(currentIndex, beatQueue.length - 1)];
  const { speaker, textArea, choices, nextBtn, phaseLabel } = overlayEls;
  phaseLabel.textContent = 'First Impressions';

  if (beat.type === 'choice') {
    awaitingChoice.value = true;
    speaker.textContent = beat.speaker;
    textArea.textContent = beat.text;
    choices.innerHTML = '';
    nextBtn.style.display = 'none';
    renderChoiceUI();
    return;
  }

  awaitingChoice.value = false;
  speaker.textContent = beat.speaker;
  textArea.textContent = beat.text;
  choices.innerHTML = '';
  nextBtn.style.display = beat.type === 'finalize' ? 'none' : 'inline-block';
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

    const beatQueue = [];
    let currentIndex = 0;
    const awaitingChoice = { value: false };
    let playerIntent = null;
    let playerRoleChoice = null;
    let chemistryMoments = [];
    let playerLeadershipTone = 'support';
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

    // Opening
    addBeat({ speaker: 'Narrator', text: 'Bags hit the sand. The tribe sizes each other up—no shelter, no fire, just first impressions.' });

    // Leadership emergence
    if (leadership.scenario === 'npc_leads') {
      const claimFire = buildCapabilities(leadership.topLeader).fire >= buildCapabilities(leadership.topLeader).shelter;
      const line = claimFire
        ? formatNarrationQuote('A steady voice cuts through the quiet.', 'Fire first. I’ll work the pit. Who’s pairing for shelter?')
        : formatNarrationQuote('One voice takes charge, eyes on the trees.', 'Shelter’s priority. I’ll start a frame—need a strong partner. Who wants fire?');
      addBeat({ speaker: leadership.topLeader.firstName, text: line });
    } else if (leadership.scenario === 'player_leads') {
      addBeat({ speaker: 'Narrator', text: `Eyes land on you. ${player.firstName} feels like the clearest presence here.` });
      const promptVoice = shuffleArray(playerTribe.members.filter(m => m.id !== player.id))[0];
      addBeat({ speaker: promptVoice?.firstName || 'Someone', text: formatNarrationQuote('The circle waits for direction.', 'So… what’s the move?') });
    } else {
      addBeat({ speaker: leadership.topLeader.firstName, text: formatNarrationQuote('One voice is already angling for fire.', 'I’ll call fire—') });
      addBeat({ speaker: leadership.runnerUp.firstName, text: formatNarrationQuote('Another counters, pointing to the empty sand.', 'Shelter needs to start now, I’ll lead that—') });
      addBeat({ speaker: 'Narrator', text: 'Two voices overlap. Everyone clocks the tension.' });
    }

    // Player decision
    addBeat({
      type: 'choice',
      speaker: player.firstName,
      text: leadership.scenario === 'player_leads'
        ? 'They’re waiting on you. What do you claim first?'
        : 'You get the first volunteer slot. Where do you jump in?'
    });

    function ensureUniqueAssignments() {
      const seen = new Set();
      tasks.forEach(task => {
        task.assignedIds = task.assignedIds.filter(id => {
          if (seen.has(id)) return false;
          seen.add(id);
          return true;
        });
      });
    }

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
      const available = tasks.filter(t => canAssign(t)).map(t => t.key);
      if (available.includes('fire')) addChoiceButton('I’ll handle fire.', () => commitPlayer('fire'));
      if (available.includes('shelter')) addChoiceButton('I’ll start shelter. Need someone with me.', () => commitPlayer('shelter'));
      if (available.includes('materials')) addChoiceButton('I’ll gather materials.', () => commitPlayer('materials'));
      if (available.includes('food')) addChoiceButton('I’ll hunt for food.', () => commitPlayer('food'));
      addChoiceButton('Wherever I’m needed.', () => commitPlayer('flex'));
      addChoiceButton('I’ll float and feel it out.', () => commitPlayer('float'));
      addChoiceButton('Let’s talk it through.', () => commitPlayer('mediate'));
    }

    function addBeatAfterChoice(beat) {
      beatQueue.splice(currentIndex + 1, 0, beat);
      currentIndex += 1;
    }

    function addResistanceBeat(conflictOwner, taskKey, resolution) {
      const taskLabel = taskKey === 'fire' ? 'fire pit' : 'shelter frame';
      const response = resolution === 'player_wins'
        ? `${conflictOwner.firstName} yields with a look.`
        : resolution === 'player_yields'
          ? `${conflictOwner.firstName} doesn’t budge, so you pivot.`
          : `${conflictOwner.firstName} proposes a split.`;
      addBeatAfterChoice({ speaker: 'Narrator', text: `${conflictOwner.firstName} pushes back on you taking ${taskLabel}. ${response}` });
    }

    function commitPlayer(choiceKey) {
      playerIntent = buildPlayerIntent(choiceKey);
      playerLeadershipTone = playerIntent.posture === 'claim' ? 'claimed' : playerIntent.posture === 'mediate' ? 'defers' : 'support';

      if (playerIntent.preferredRole) {
        const chosenTask = getTask(tasks, playerIntent.preferredRole);
        const conflictingLeader = leaders?.find(l => chosenTask.assignedIds.includes(l.id));
        if (!conflictingLeader && canAssign(chosenTask)) {
          addAssignment(tasks, playerIntent.preferredRole, player);
          playerRoleChoice = playerIntent.preferredRole;
          addBeatAfterChoice({ speaker: player.firstName, text: formatNarrationQuote('You stake your claim before the scramble starts.', `I’ve got ${playerIntent.preferredRole}.`) });
        } else if (conflictingLeader) {
          const playerWins = playerIntent.posture === 'claim' && buildCapabilities(player).leadership >= buildCapabilities(conflictingLeader).leadership + 5;
          if (playerWins && canAssign(chosenTask)) {
            addResistanceBeat(conflictingLeader, playerIntent.preferredRole, 'player_wins');
            getTask(tasks, playerIntent.preferredRole).assignedIds = getTask(tasks, playerIntent.preferredRole).assignedIds.filter(id => id !== conflictingLeader.id);
            addAssignment(tasks, playerIntent.preferredRole, player);
            addAssignment(tasks, 'materials', conflictingLeader);
            playerRoleChoice = playerIntent.preferredRole;
            addBeatAfterChoice({ speaker: player.firstName, text: formatNarrationQuote('You don’t back down.', `I’m holding ${playerIntent.preferredRole}.`) });
          } else {
            addResistanceBeat(conflictingLeader, playerIntent.preferredRole, 'player_yields');
            addAssignment(tasks, 'materials', player);
            playerRoleChoice = 'materials';
            addBeatAfterChoice({ speaker: player.firstName, text: formatNarrationQuote('You redirect without killing the mood.', 'Materials works. I’ll feed your fire.') });
          }
        } else {
          addAssignment(tasks, 'float', player);
          playerRoleChoice = 'float';
          addBeatAfterChoice({ speaker: player.firstName, text: formatNarrationQuote('You keep your options open.', 'I’ll float and plug holes.') });
        }
      } else if (playerIntent.posture === 'hang_back') {
        addAssignment(tasks, 'float', player);
        playerRoleChoice = 'float';
        addBeatAfterChoice({ speaker: player.firstName, text: formatNarrationQuote('You hang back, watching currents form.', 'I’ll stay loose for now.') });
      } else {
        playerRoleChoice = 'flex';
        addBeatAfterChoice({ speaker: player.firstName, text: formatNarrationQuote('You wait, reading the room before jumping.', 'Wherever I’m needed, just point me.') });
      }

      ensureUniqueAssignments();
      awaitingChoice.value = false;
      nextBtn.style.display = 'inline-block';
      renderBeatUI({ beatQueue, currentIndex, overlayEls, awaitingChoice, renderChoiceUI });
      cascadeAssignments();
    }

    function assignNPC(survivor, allowFloatEarly) {
      const profile = getPersonalityProfile(survivor);
      const priorities = [
        { key: 'fire', score: profile.caps.fire },
        { key: 'shelter', score: profile.caps.shelter },
        { key: 'materials', score: profile.caps.materials },
        { key: 'food', score: profile.caps.food },
        { key: 'float', score: allowFloatEarly ? profile.caps.social : -1 }
      ];

      priorities.sort((a, b) => b.score - a.score);
      for (const p of priorities) {
        if (p.key === 'float' && !allowFloatEarly) continue;
        if (addAssignment(tasks, p.key, survivor)) return p.key;
      }
      return 'float';
    }

    function cascadeAssignments() {
      // Immediate consequence beat
      addBeatAfterChoice({ speaker: 'Narrator', text: 'The circle breaks as people rush to claim lanes—or avoid them.' });

      // Leaders claim if not already
      leaders?.forEach((leader, idx) => {
        if (tasks.some(t => t.assignedIds.includes(leader.id))) return;
        const preferFire = idx === 0;
        const target = preferFire ? 'fire' : 'shelter';
        if (!addAssignment(tasks, target, leader)) {
          addAssignment(tasks, 'shelter', leader) || addAssignment(tasks, 'materials', leader);
        }
      });

      // NPC volunteers
      const order = shuffleArray(playerTribe.members.filter(m => m.id !== player.id));
      order.forEach(npc => {
        if (tasks.some(t => t.assignedIds.includes(npc.id))) return;
        const allowFloatEarly = minCoverageState(tasks).fire && minCoverageState(tasks).shelter;
        assignNPC(npc, allowFloatEarly);
      });

      // Flexible player assignment after NPCs
      if (playerRoleChoice === 'flex') {
        const coverage = minCoverageState(tasks);
        const preferredGap = !coverage.fire ? 'fire' : !coverage.shelter ? 'shelter' : !coverage.materials ? 'materials' : !coverage.food ? 'food' : null;
        if (preferredGap) {
          addAssignment(tasks, preferredGap, player);
          playerRoleChoice = preferredGap;
          addBeat({ speaker: 'Narrator', text: `You slide toward ${preferredGap}, filling the obvious gap.` });
        } else {
          addAssignment(tasks, 'float', player);
          playerRoleChoice = 'float';
          addBeat({ speaker: 'Narrator', text: 'Coverage looks solid, so you stay flexible on purpose.' });
        }
      }

      enforceCoverage(tasks, playerTribe.members, leaders);

      // Role assignment cascade beats
      const assignments = tasks.flatMap(task => task.assignedIds.map(id => ({ role: task.key, survivor: playerTribe.members.find(m => m.id === id) })));
      const groupBeats = groupBeatsByRole(assignments, playerTribe.members, usedLines);
      groupBeats.forEach(beat => addBeat(beat));

      // Chemistry moments
      chemistryMoments = pickChemistryMoments(tasks, playerTribe.members, leadership.scenario);
      chemistryMoments.forEach(m => {
        addBeat({ speaker: m.pair[0].firstName, text: m.textA });
        addBeat({ speaker: m.pair[1].firstName, text: m.textB });
      });

      addSendOffBeats();
      updateStatus();
    }

    function addSendOffBeats() {
      const frictionCount = chemistryMoments.filter(m => m.type !== 'bond').length;
      const clarityScore = leadership.scenario === 'npc_leads' || leadership.scenario === 'player_leads' ? 1 : 0;
      const averageWork = (() => {
        const ids = tasks.flatMap(t => t.assignedIds);
        const scores = ids.map(id => buildCapabilities(playerTribe.members.find(m => m.id === id)).workEthic);
        if (!scores.length) return 50;
        return scores.reduce((a, b) => a + b, 0) / scores.length;
      })();

      const mood = clarityScore && frictionCount === 0 && averageWork > 55
        ? 'confident'
        : frictionCount >= 1
          ? 'chaotic'
          : 'tentative';

      const moodText = mood === 'confident'
        ? 'The plan actually sounds solid. People split off with purpose.'
        : mood === 'chaotic'
          ? 'Voices overlap again. Everyone scatters before more sparks fly.'
          : 'It’s a plan, kind of. People wander toward their tasks, glancing back.';

      addBeat({ speaker: 'Narrator', text: moodText });

      const reflectionMap = {
        fire: 'Fire is a spotlight. If it fails, everyone will remember who owned it.',
        shelter: 'Shelter is intimate. How you vibe with your partner will stick.',
        materials: 'Hauling materials is thankless but steady. Maybe that steadiness is the point.',
        food: 'Food is a gamble. Success is glory; failure is silence.',
        float: 'Floating keeps you flexible—and visible if you disappear.',
        flex: 'You offered flexibility; now people will watch if you actually plug gaps.',
        defer: 'You asked for input. Collaborative… or non-committal?'
      };

      addBeat({ speaker: 'Narrator', text: reflectionMap[playerRoleChoice || 'float'] });
      addBeat({ type: 'finalize' });
    }

    function finalizePlan() {
      if (finalized) return;
      finalized = true;
      const mood = chemistryMoments.some(m => m.type !== 'bond')
        ? 'chaotic'
        : chemistryMoments.some(m => m.type === 'bond') ? 'confident' : 'tentative';

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
        updateStatus();
      }
    });

    eventManager.publish(GameEvents.DIALOGUE_SHOWN, { source: 'day1-first-impressions' });
    renderBeatUI({ beatQueue, currentIndex, overlayEls, awaitingChoice, renderChoiceUI });
  });
}

export default { runDay1FirstImpressions };
