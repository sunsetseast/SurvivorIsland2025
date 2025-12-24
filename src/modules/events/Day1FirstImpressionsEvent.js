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

function minCoverageState(tasks) {
  return {
    fire: getTask(tasks, 'fire').assignedIds.length >= 1,
    shelter: getTask(tasks, 'shelter').assignedIds.length >= 2,
    materials: getTask(tasks, 'materials').assignedIds.length >= 1,
    food: getTask(tasks, 'food').assignedIds.length >= 1
  };
}

function enforceMinimumCoverage(tasks, survivors, playerChoiceKey = null) {
  const state = minCoverageState(tasks);
  const orderedPool = survivors
    .filter(m => !tasks.some(t => t.assignedIds.includes(m.id)))
    .map(m => ({ member: m, caps: buildCapabilities(m) }))
    .sort((a, b) => (b.caps.workEthic + b.caps.leadership) - (a.caps.workEthic + a.caps.leadership));

  const forceFill = (key, scorer) => {
    if (key === 'shelter') {
      while (getTask(tasks, 'shelter').assignedIds.length < 2) {
        const candidate = orderedPool.shift();
        if (!candidate) break;
        addAssignment(tasks, 'shelter', candidate.member);
      }
      return;
    }
    if (key === 'fire') {
      if (getTask(tasks, 'fire').assignedIds.length) return;
      orderedPool.sort((a, b) => scorer(b) - scorer(a));
      const pick = orderedPool.shift();
      if (pick) addAssignment(tasks, 'fire', pick.member);
      return;
    }

    while (getTask(tasks, key).assignedIds.length < 1) {
      orderedPool.sort((a, b) => scorer(b) - scorer(a));
      const pick = orderedPool.shift();
      if (!pick) break;
      addAssignment(tasks, key, pick.member);
    }
  };

  if (!state.fire) forceFill('fire', entry => entry.caps.fire + entry.caps.confidence);
  if (!state.shelter) forceFill('shelter', entry => entry.caps.shelter);
  if (!state.materials) forceFill('materials', entry => entry.caps.materials + entry.caps.workEthic);
  if (!state.food) forceFill('food', entry => entry.caps.food);

  // If shelter still short, steal from float/materials/food
  if (getTask(tasks, 'shelter').assignedIds.length < 2) {
    const stealOrder = ['float', 'materials', 'food'];
    stealOrder.forEach(key => {
      const task = getTask(tasks, key);
      while (task.assignedIds.length && getTask(tasks, 'shelter').assignedIds.length < 2) {
        const reassigned = task.assignedIds.shift();
        getTask(tasks, 'shelter').assignedIds.push(reassigned);
      }
    });
  }

  // Ensure player choice respected if forced elsewhere
  if (playerChoiceKey && !getTask(tasks, playerChoiceKey)?.assignedIds.includes(survivors.find(s => s.isPlayer)?.id)) {
    const player = survivors.find(s => s.isPlayer);
    if (player && canAssign(getTask(tasks, playerChoiceKey))) {
      addAssignment(tasks, playerChoiceKey, player);
    }
  }
}

function formatNames(ids, members) {
  return ids.map(id => members.find(m => m.id === id)?.firstName || 'Unknown').join(', ') || 'None';
}

function describeAssignmentLine(survivor, taskKey, profile, usedLines) {
  const { caps, bossy, proud, strategicFloater, workEthic } = profile;
  const friendly = caps.social > 60;
  const gritty = workEthic > 60;
  const bossyLine = bossy || proud;

  const pickUnique = options => {
    const shuffled = shuffleArray(options);
    const choice = shuffled.find(line => !usedLines.has(line)) || shuffled[0];
    usedLines.add(choice);
    return choice;
  };

  const materialsVariants = [
    formatNarrationQuote(
      `${survivor.firstName} scans the tree line, sizing up what to haul first.`,
      "I’ll keep wood and bamboo flowing."),
    formatNarrationQuote(
      `${survivor.firstName} loosens their shoulders, ready to move.`,
      "Hauling stuff suits me. I’ll keep us stocked."),
    formatNarrationQuote(
      `${survivor.firstName} keeps it simple, no big speech.`,
      "I’ll gather. Less talk, more work."),
    formatNarrationQuote(
      `Eyes track the beach and jungle like a supply map for ${survivor.firstName}.`,
      "I can organize materials. Let’s not run empty."),
    formatNarrationQuote(
      `${survivor.firstName} grins, already picturing armloads of bamboo.`,
      "I’ll roam and haul. If you need me, yell."),
    formatNarrationQuote(
      `${survivor.firstName} shrugs, but it’s a confident shrug.`,
      "Sure, I’ll bring back wood. Not gonna sit around."),
    formatNarrationQuote(
      `${survivor.firstName} chuckles at the looming workload.`,
      "Beast of burden coming through. Materials are mine."),
    formatNarrationQuote(
      `${survivor.firstName} already picks a direction, eyes sharp.`,
      "I’ll keep options open—start with bamboo, pivot if needed.")
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
      if (bossyLine) return formatNarrationQuote(`${survivor.firstName} claps hands to get motion.`, 'Shelter with me. Let’s frame it right.');
      if (gritty) return formatNarrationQuote(`${survivor.firstName} rolls sleeves with purpose.`, 'I’ll take shelter—need one more set of hands.');
      return formatNarrationQuote(`${survivor.firstName} steps closer, voice steady.`, 'I can help build. Someone pair with me?');
    case 'food':
      return friendly
        ? formatNarrationQuote(`${survivor.firstName} nods toward the treeline.`, 'I’ll hunt for coconuts and fish. Back soon.')
        : formatNarrationQuote(`${survivor.firstName} grabs what passes for a spear.`, 'Food run. I’ll return with something… hopefully.');
    case 'materials':
      if (bossyLine) return formatNarrationQuote(`${survivor.firstName} points toward the jungle.`, 'I’ll manage materials—keep pace.');
      return pickUnique(materialsVariants);
    default:
      if (strategicFloater) {
        return pickUnique([
          formatNarrationQuote(`${survivor.firstName} keeps an eye on the moving pieces.`, 'Floating helps me read people. I’ll pop in where it counts.'),
          formatNarrationQuote(`${survivor.firstName} leans back, observing.`, 'I’ll drift and plug holes. Better to see the full picture first.')
        ]);
      }
      if (workEthic < 45) {
        return pickUnique([
          formatNarrationQuote(`${survivor.firstName} offers a sheepish grin.`, 'I’m overwhelmed—gonna hover and jump in when I can.'),
          formatNarrationQuote(`${survivor.firstName} half-laughs, half-apologizes.`, 'Let me float a bit. Promise I’ll be around.')
        ]);
      }
      return pickUnique(floatVariants);
  }
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

  if (leadershipScenario === 'contested' && tasks.some(t => t.key === 'fire')) {
    const leaderIds = tasks.flatMap(t => t.assignedIds);
    const [a, b] = leaderIds
      .map(id => members.find(m => m.id === id))
      .filter(Boolean)
      .slice(0, 2);
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

  return moments.slice(0, 2); // Max one bond and one tension
}

export async function runDay1FirstImpressions({ gameManager }) {
  return new Promise(resolve => {
    const playerTribe = gameManager.getPlayerTribe();
    const player = gameManager.getPlayerSurvivor();
    if (!playerTribe || !player) return resolve(null);
    if (![6, 9].includes(playerTribe.members.length)) return resolve(null);

    const overlayEls = buildOverlay();
    const { overlay, speaker, textArea, choices, nextBtn, phaseLabel, statusLine } = overlayEls;

    const tasks = taskDefinitions(playerTribe.members.length);
    const leadership = resolveLeadershipScenario(playerTribe.members, player);
    const usedLines = new Set();
    logDebug('Leadership scenario', leadership);

    const beatQueue = [];
    let currentIndex = 0;
    let awaitingChoice = false;
    let playerRoleChoice = null;
    let playerLeadershipTone = 'claimed';
    let chemistryMoments = [];
    let finalized = false;

    const addBeat = beat => beatQueue.push(beat);

    // Phase 0 - Arrival
    addBeat({ speaker: 'Narrator', text: 'Bags hit the sand. The tribe sizes each other up—no shelter, no fire, just first impressions.' });

    // Phase 1 - Leadership emergence
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

    // Phase 2 - Player choice
    addBeat({
      type: 'choice',
      speaker: player.firstName,
      text: leadership.scenario === 'player_leads'
        ? 'They’re waiting on you. What do you claim first?'
        : 'You get the first volunteer slot. Where do you jump in?'
    });

    function setStatusLine() {
      const fire = formatNames(getTask(tasks, 'fire').assignedIds, playerTribe.members);
      const shelter = formatNames(getTask(tasks, 'shelter').assignedIds, playerTribe.members);
      const food = formatNames(getTask(tasks, 'food').assignedIds, playerTribe.members);
      const materials = formatNames(getTask(tasks, 'materials').assignedIds, playerTribe.members);
      statusLine.textContent = `Roles so far • Fire: ${fire} | Shelter: ${shelter} | Food: ${food} | Materials: ${materials}`;
    }

    function ensureNoDuplicateAssignments() {
      const seen = new Set();
      tasks.forEach(task => {
        task.assignedIds = task.assignedIds.filter(id => {
          if (seen.has(id)) return false;
          seen.add(id);
          return true;
        });
      });
    }

    function addBeatAfterChoice(beat) {
      beatQueue.splice(currentIndex + 1, 0, beat);
      currentIndex += 1;
    }

    function commitPlayer(taskKey, leadershipTone) {
      playerLeadershipTone = leadershipTone;
      if (taskKey !== 'defer') {
        const chosen = canAssign(getTask(tasks, taskKey)) ? taskKey : 'float';
        addAssignment(tasks, chosen, player);
        playerRoleChoice = chosen;
        addBeatAfterChoice({ speaker: player.firstName, text: chosen === 'float' ? formatNarrationQuote('You keep your options open.', 'I’ll float and plug holes.') : formatNarrationQuote('You claim a lane before anyone else moves.', `I’ve got ${chosen}.`) });
      } else {
        playerRoleChoice = 'defer';
        addBeatAfterChoice({ speaker: player.firstName, text: formatNarrationQuote('You throw the question back to the group.', 'What do you all think? Pitch me ideas.') });
      }
      ensureNoDuplicateAssignments();
      awaitingChoice = false;
      nextBtn.style.display = 'inline-block';
      renderBeat();
      cascadeVolunteers();
    }

    function addChoiceButton(label, handler) {
      const btn = document.createElement('button');
      btn.className = 'rect-button';
      btn.textContent = label;
      btn.style.minHeight = '42px';
      btn.style.fontSize = '1rem';
      btn.addEventListener('click', handler);
      choices.appendChild(btn);
    }

    function renderBeat() {
      if (!beatQueue.length) return;
      const beat = beatQueue[Math.min(currentIndex, beatQueue.length - 1)];
      phaseLabel.textContent = `First Impressions • Beat ${Math.min(currentIndex + 1, beatQueue.length)}`;
      if (beat.type === 'finalize') {
        speaker.textContent = 'Narrator';
        textArea.textContent = 'The group fans out—camp life truly begins.';
        choices.innerHTML = '';
        nextBtn.style.display = 'none';
        setStatusLine();
        finalizePlan();
        return;
      }
      if (beat.type === 'choice') {
        awaitingChoice = true;
        speaker.textContent = beat.speaker;
        textArea.textContent = beat.text;
        choices.innerHTML = '';
        nextBtn.style.display = 'none';

        const available = tasks.filter(t => canAssign(t)).map(t => t.key);
        if (available.includes('fire')) addChoiceButton('I’ll handle fire.', () => commitPlayer('fire', 'claimed'));
        if (available.includes('shelter')) addChoiceButton('I’ll start shelter. Need someone with me.', () => commitPlayer('shelter', 'claimed'));
        if (available.includes('fire') && available.includes('shelter')) addChoiceButton('Who’s good with fire? I can take shelter.', () => commitPlayer('shelter', 'facilitates'));
        if (available.includes('materials')) addChoiceButton('I’ll gather materials.', () => commitPlayer('materials', 'claimed'));
        if (available.includes('food')) addChoiceButton('I’ll hunt for food.', () => commitPlayer('food', 'claimed'));
        addChoiceButton('I’ll float and help wherever.', () => commitPlayer('float', 'claimed'));
        if (leadership.scenario === 'player_leads') addChoiceButton('What do you all think?', () => commitPlayer('defer', 'defers'));
        addChoiceButton('Where do you need me most?', () => commitPlayer(available.includes('fire') ? 'fire' : available.includes('shelter') ? 'shelter' : 'materials', 'facilitates'));
      } else {
        awaitingChoice = false;
        speaker.textContent = beat.speaker;
        textArea.textContent = beat.text;
        choices.innerHTML = '';
        nextBtn.style.display = beat.type === 'finalize' ? 'none' : 'inline-block';
      }
      setStatusLine();
    }

    function assignNPC(survivor, allowFloatEarly) {
      const profile = getPersonalityProfile(survivor);
      const priorities = [
        { key: 'fire', score: profile.caps.fire },
        { key: 'shelter', score: profile.caps.shelter },
        { key: 'materials', score: profile.caps.materials },
        { key: 'food', score: profile.caps.food },
        { key: 'float', score: allowFloatEarly ? 40 + (100 - profile.workEthic) / 2 : -Infinity }
      ];
      priorities.sort((a, b) => b.score - a.score + Math.random() * 4);
      for (const p of priorities) {
        const task = getTask(tasks, p.key);
        if (canAssign(task)) {
          addAssignment(tasks, p.key, survivor);
          addBeat({ speaker: survivor.firstName, text: describeAssignmentLine(survivor, p.key, profile, usedLines) });
          return p.key;
        }
      }
      return 'float';
    }

    function cascadeVolunteers() {
      // If player deferred, nudge top two leaders into fire/shelter
      if (playerRoleChoice === 'defer') {
        const npcCandidates = playerTribe.members.filter(m => m.id !== player.id);
        const ranked = npcCandidates
          .map(m => ({ member: m, score: buildCapabilities(m).leadership }))
          .sort((a, b) => b.score - a.score);
        const proactive = ranked[0]?.member || npcCandidates[0];
        const helper = ranked[1]?.member || npcCandidates[1] || npcCandidates[0];
        if (proactive) {
          addAssignment(tasks, 'fire', proactive);
          addBeat({ speaker: proactive.firstName, text: formatNarrationQuote('Someone finally claims the flint.', 'Fine—I’ll lock fire then.') });
        }
        if (helper && canAssign(getTask(tasks, 'shelter'))) {
          addAssignment(tasks, 'shelter', helper);
          addBeat({ speaker: helper.firstName, text: formatNarrationQuote('A second voice anchors the build crew.', 'I’ll start the shelter frame.') });
        }
      }

      const remaining = playerTribe.members.filter(m => !tasks.some(t => t.assignedIds.includes(m.id)));
      const minState = minCoverageState(tasks);
      const allowFloatEarly = Object.values(minState).every(Boolean) ? true : getTask(tasks, 'float').assignedIds.length < 1;
      shuffleArray(remaining).forEach(survivor => assignNPC(survivor, allowFloatEarly));

      ensureNoDuplicateAssignments();
      enforceMinimumCoverage(tasks, playerTribe.members, playerRoleChoice);

      chemistryMoments = pickChemistryMoments(tasks, playerTribe.members, leadership.scenario);
      const limitedChemistry = [];
      const bondAdded = chemistryMoments.find(m => m.type === 'bond');
      const tensionAdded = chemistryMoments.find(m => m.type !== 'bond');
      if (bondAdded) limitedChemistry.push(bondAdded);
      if (tensionAdded) limitedChemistry.push(tensionAdded);
      chemistryMoments = limitedChemistry;

      chemistryMoments.forEach(m => {
        addBeat({ speaker: m.pair[0].firstName, text: m.textA });
        addBeat({ speaker: m.pair[1].firstName, text: m.textB });
      });

      addSendOffBeats();
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
      if (awaitingChoice) return;
      const beat = beatQueue[currentIndex];
      if (beat?.type === 'finalize') {
        finalizePlan();
        return;
      }
      if (currentIndex < beatQueue.length - 1) {
        currentIndex += 1;
        renderBeat();
      }
    });

    eventManager.publish(GameEvents.DIALOGUE_SHOWN, { source: 'day1-first-impressions' });
    renderBeat();
  });
}

export default { runDay1FirstImpressions };
