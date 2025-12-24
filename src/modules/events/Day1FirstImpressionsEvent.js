import { getRandomInt, shuffleArray } from '../utils/CommonUtils.js';
import eventManager, { GameEvents } from '../core/EventManager.js';

const DEBUG = false;

function logDebug(message, data = null) {
  if (!DEBUG) return;
  console.log(`[Day1FirstImpressions] ${message}`, data);
}

function getTrait(survivor, keys, fallback = 0) {
  if (!survivor) return fallback;
  for (const key of keys) {
    const val = survivor[key];
    if (typeof val === 'number' && !Number.isNaN(val)) {
      return val;
    }
  }
  return fallback;
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
  panel.style.width = '80%';
  panel.style.maxWidth = '980px';
  panel.style.maxHeight = '85%';
  panel.style.display = 'flex';
  panel.style.flexDirection = 'column';
  panel.style.padding = '20px';
  panel.style.boxShadow = '0 8px 20px rgba(0,0,0,0.45)';
  panel.style.fontFamily = "'Survivant', sans-serif";

  const header = document.createElement('div');
  header.style.display = 'flex';
  header.style.justifyContent = 'space-between';
  header.style.alignItems = 'center';
  header.style.marginBottom = '8px';

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
  textArea.style.background = 'rgba(255,255,255,0.75)';
  textArea.style.border = '1px solid #d2b48c';
  textArea.style.borderRadius = '12px';
  textArea.style.color = '#2d1b0d';
  textArea.style.lineHeight = '1.5';

  const choices = document.createElement('div');
  choices.id = 'day1-choices';
  choices.style.display = 'flex';
  choices.style.flexDirection = 'column';
  choices.style.gap = '10px';
  choices.style.marginTop = '14px';

  const footer = document.createElement('div');
  footer.style.display = 'flex';
  footer.style.justifyContent = 'flex-end';
  footer.style.marginTop = '12px';

  const nextBtn = document.createElement('button');
  nextBtn.id = 'day1-next';
  nextBtn.className = 'rect-button';
  nextBtn.textContent = 'Next';

  footer.appendChild(nextBtn);

  panel.appendChild(header);
  panel.appendChild(textArea);
  panel.appendChild(choices);
  panel.appendChild(footer);
  overlay.appendChild(panel);

  document.body.appendChild(overlay);
  return { overlay, speaker, textArea, choices, nextBtn, phaseLabel };
}

function removeOverlay(overlay) {
  overlay?.remove();
}

function ensureLazinessField(members) {
  members.forEach(m => {
    if (m.laziness == null) m.laziness = 0;
  });
}

function leadershipScore(member) {
  const dominance = getTrait(member, ['leader', 'leadership'], 0) * 3;
  const presence = getTrait(member, ['likeability', 'alliances', 'connections'], 0) * 1.2;
  const confidence = getTrait(member, ['risk', 'aggression', 'fortitude'], 0);
  return dominance + presence + confidence;
}

function resolveLeadershipScenario(members, player) {
  const scored = members.map(m => ({ member: m, score: leadershipScore(m) }));
  scored.sort((a, b) => b.score - a.score);
  const top = scored[0];
  const runner = scored[1];
  const contested = runner && Math.abs(top.score - runner.score) <= 4;
  const playerTop = player && top.member.id === player.id;
  const scenario = playerTop ? 'player_leads' : contested ? 'contested' : 'npc_leads';
  return { topLeader: top.member, runnerUp: runner?.member || null, scenario, contestedPair: contested ? [top.member, runner.member] : null };
}

function taskDefinitions() {
  return [
    { key: 'fire', label: 'Fire', cap: 1, assignedIds: [] },
    { key: 'shelter', label: 'Shelter', cap: 2, assignedIds: [] },
    { key: 'food', label: 'Food', cap: 3, assignedIds: [] },
    { key: 'materials', label: 'Materials', cap: 99, assignedIds: [] },
    { key: 'float', label: 'Float', cap: 99, assignedIds: [] }
  ];
}

function getTask(tasks, key) {
  return tasks.find(t => t.key === key);
}

function canAssign(task) {
  return task && task.assignedIds.length < task.cap;
}

function buildScores(s) {
  const fire = getTrait(s, ['firemaking'], 0) * 3 + getTrait(s, ['focus', 'patience'], 0) + getTrait(s, ['leader'], 0) - getTrait(s, ['laziness'], 0);
  const shelter = getTrait(s, ['strength'], 0) * 1.5 + getTrait(s, ['endurance'], 0) * 1.2 + getTrait(s, ['dexterity'], 0) + getTrait(s, ['teamPlayer'], 0) + getTrait(s, ['leader'], 0);
  const food = getTrait(s, ['fishing', 'foraging', 'survival'], 0) * 2.5 + getTrait(s, ['endurance'], 0) + getTrait(s, ['risk', 'idolhunt'], 0);
  const materials = getTrait(s, ['strength'], 0) + getTrait(s, ['endurance'], 0) + getTrait(s, ['dexterity'], 0) + getTrait(s, ['teamPlayer'], 0);
  const floater = getTrait(s, ['bigmove', 'idolhunt', 'risk'], 0) + (50 - getTrait(s, ['teamPlayer'], 50)) + (s.laziness || 0);
  return { fire, shelter, food, materials, float: floater };
}

function weightedPick(tasks, survivor) {
  const scores = buildScores(survivor);
  const entries = Object.keys(scores).map(key => ({ key, score: scores[key] + Math.random() * 5 }));
  entries.sort((a, b) => b.score - a.score);
  for (const entry of entries) {
    const task = getTask(tasks, entry.key);
    if (canAssign(task)) {
      task.assignedIds.push(survivor.id);
      return entry.key;
    }
  }
  const floatTask = getTask(tasks, 'float');
  floatTask.assignedIds.push(survivor.id);
  return 'float';
}

function guaranteeTask(tasks, key, candidates) {
  const task = getTask(tasks, key);
  if (!task) return [];
  const added = [];
  while (task.assignedIds.length < task.cap && candidates.length) {
    const next = candidates.shift();
    if (task.assignedIds.includes(next.id)) continue;
    task.assignedIds.push(next.id);
    added.push(next);
  }
  return added;
}

function enforceShelter(tasks, members) {
  const shelterTask = getTask(tasks, 'shelter');
  if (shelterTask.assignedIds.length === 2) return [];
  const unassigned = members.filter(m => !tasks.some(t => t.assignedIds.includes(m.id)));
  const ranked = unassigned
    .map(m => ({ member: m, score: buildScores(m).shelter + Math.random() * 3 }))
    .sort((a, b) => b.score - a.score)
    .map(r => r.member);
  const fillers = guaranteeTask(tasks, 'shelter', ranked);
  if (shelterTask.assignedIds.length < 2) {
    const stealableOrder = ['float', 'materials', 'food'];
    for (const fromKey of stealableOrder) {
      const task = getTask(tasks, fromKey);
      while (task.assignedIds.length > 0 && shelterTask.assignedIds.length < shelterTask.cap) {
        const reassignedId = task.assignedIds.shift();
        shelterTask.assignedIds.push(reassignedId);
        fillers.push(members.find(m => m.id === reassignedId));
      }
      if (shelterTask.assignedIds.length === shelterTask.cap) break;
    }
  }
  return fillers;
}

function enforceFire(tasks, members) {
  const fireTask = getTask(tasks, 'fire');
  if (fireTask.assignedIds.length === 1) return null;
  const unassigned = members.filter(m => !tasks.some(t => t.assignedIds.includes(m.id)));
  const ranked = unassigned
    .map(m => ({ member: m, score: buildScores(m).fire + Math.random() * 3 }))
    .sort((a, b) => b.score - a.score)
    .map(r => r.member);
  const added = guaranteeTask(tasks, 'fire', ranked);
  if (!added.length && fireTask.assignedIds.length < 1) {
    const stealOrder = ['float', 'materials', 'food', 'shelter'];
    for (const fromKey of stealOrder) {
      const task = getTask(tasks, fromKey);
      if (task.assignedIds.length > (fromKey === 'shelter' ? 1 : 0)) {
        const reassignedId = task.assignedIds.shift();
        fireTask.assignedIds.push(reassignedId);
        return members.find(m => m.id === reassignedId);
      }
    }
  }
  return added[0] || null;
}

function addMemoryPair(system, aId, bId, type, text, day, tags) {
  system?.addMemory?.(aId, { type, text, day, tags });
  system?.addMemory?.(bId, { type, text, day, tags });
}

function pickBondPair(tasks, members) {
  const shelter = getTask(tasks, 'shelter');
  if (shelter.assignedIds.length < 2) return null;
  const [aId, bId] = shelter.assignedIds;
  const a = members.find(m => m.id === aId);
  const b = members.find(m => m.id === bId);
  const compatibility = (getTrait(a, ['teamPlayer', 'likeability', 'alliances', 'connections'], 0) + getTrait(b, ['teamPlayer', 'likeability', 'alliances', 'connections'], 0)) / 2;
  return { pair: [a, b], compatibility };
}

function pickTensionPair(tasks, members, contestedPair) {
  if (contestedPair) return { pair: contestedPair, reason: 'leadership' };
  const floaters = getTask(tasks, 'float');
  if (floaters.assignedIds.length) {
    const floaterId = floaters.assignedIds[0];
    const workerTask = getTask(tasks, 'materials');
    if (workerTask.assignedIds.length) {
      return { pair: [members.find(m => m.id === floaterId), members.find(m => m.id === workerTask.assignedIds[0])], reason: 'work' };
    }
  }
  return null;
}

function planToText(plan, members) {
  const nameList = ids => ids.map(id => members.find(m => m.id === id)?.firstName || 'Unknown').join(', ') || 'None';
  return `Fire: ${nameList(plan.fireIds)} | Shelter: ${nameList(plan.shelterIds)} | Food: ${nameList(plan.foodIds)} | Materials: ${nameList(plan.materialsIds)} | Floaters: ${nameList(plan.floaterIds)}`;
}

export async function runDay1FirstImpressions({ gameManager }) {
  return new Promise(resolve => {
    const playerTribe = gameManager.getPlayerTribe();
    const player = gameManager.getPlayerSurvivor();
    if (!playerTribe || !player) return resolve(null);

    ensureLazinessField(playerTribe.members);
    const overlayEls = buildOverlay();
    const { overlay, speaker, textArea, choices, nextBtn, phaseLabel } = overlayEls;

    const tasks = taskDefinitions();
    const leadership = resolveLeadershipScenario(playerTribe.members, player);
    logDebug('Leadership scenario', leadership);

    const beatQueue = [];
    let awaitingChoice = false;
    let playerDeferredLeadership = false;
    let playerRoleChoice = null;
    let bondMoment = null;
    let tensionMoment = null;

    const pushBeat = beat => beatQueue.push(beat);

    pushBeat({ speaker: 'Narrator', text: 'The tribe arrives at camp. No shelter. No fire. The silence stretches.' });

    if (leadership.scenario === 'npc_leads') {
      const claimScores = buildScores(leadership.topLeader);
      const claimFire = claimScores.fire >= claimScores.shelter;
      const text = claimFire
        ? "Alright, I'll get fire going. We need it before dark. Who wants shelter? Two-person job."
        : "I'm starting shelter. I need one more with me—someone strong. Someone else confident with fire?";
      pushBeat({ speaker: leadership.topLeader.firstName, text });
      const claimTask = getTask(tasks, claimFire ? 'fire' : 'shelter');
      if (canAssign(claimTask)) claimTask.assignedIds.push(leadership.topLeader.id);
    } else if (leadership.scenario === 'player_leads') {
      pushBeat({ speaker: 'Narrator', text: `Eyes settle on you—${player.firstName} carries the strongest presence here.` });
      pushBeat({ speaker: shuffleArray(playerTribe.members.filter(m => m.id !== player.id))[0]?.firstName || 'Someone', text: 'So… what are we thinking?' });
    } else {
      pushBeat({ speaker: leadership.topLeader.firstName, text: "I'll take fire—" });
      pushBeat({ speaker: leadership.runnerUp.firstName, text: "I'm thinking shelter, I’ll need—" });
      pushBeat({ speaker: 'Narrator', text: 'Two voices collide. Everyone feels the friction.' });
      const fireTask = getTask(tasks, 'fire');
      const shelterTask = getTask(tasks, 'shelter');
      if (canAssign(fireTask)) fireTask.assignedIds.push(leadership.topLeader.id);
      if (canAssign(shelterTask)) shelterTask.assignedIds.push(leadership.runnerUp.id);
    }

    pushBeat({ type: 'choice', speaker: player.firstName, text: leadership.scenario === 'player_leads' ? 'They wait for your call. What will you take on first?' : 'Where do you want to pitch in? You get first pick.' });

    const addChoiceButton = (label, handler) => {
      const btn = document.createElement('button');
      btn.className = 'rect-button';
      btn.textContent = label;
      btn.addEventListener('click', handler);
      choices.appendChild(btn);
    };

    const renderBeat = () => {
      if (beatQueue.length === 0) return;
      const beat = beatQueue[Math.min(currentIndex, beatQueue.length - 1)];
      phaseLabel.textContent = `First Impressions • Beat ${Math.min(currentIndex + 1, beatQueue.length)}`;
      if (beat.type === 'choice') {
        awaitingChoice = true;
        speaker.textContent = beat.speaker;
        textArea.textContent = beat.text;
        choices.innerHTML = '';
        nextBtn.style.display = 'none';

        const available = tasks.filter(t => canAssign(t)).map(t => t.key);
        if (available.includes('fire')) addChoiceButton('I’ll handle fire.', () => commitPlayer('fire', false));
        if (available.includes('shelter')) addChoiceButton('I’ll start shelter. Need someone with me.', () => commitPlayer('shelter', false));
        if (available.includes('shelter') && available.includes('fire')) addChoiceButton('Who’s good with fire? I can take shelter.', () => commitPlayer('shelter', false));
        addChoiceButton('I’ll gather materials.', () => commitPlayer('materials', false));
        addChoiceButton('I’ll hunt for food.', () => commitPlayer('food', false));
        addChoiceButton('I’ll float and help wherever.', () => commitPlayer('float', false));
        if (leadership.scenario === 'player_leads') addChoiceButton('What do you all think we should do?', () => commitPlayer('defer', true));
        addChoiceButton('Where do you need me most?', () => commitPlayer(available.includes('fire') ? 'fire' : available.includes('shelter') ? 'shelter' : 'materials', false));
      } else {
        awaitingChoice = false;
        speaker.textContent = beat.speaker;
        textArea.textContent = beat.text;
        choices.innerHTML = '';
        nextBtn.style.display = 'inline-block';
      }
    };

    const ensureNoDuplicate = () => {
      const assigned = new Set();
      tasks.forEach(task => {
        task.assignedIds = task.assignedIds.filter(id => {
          if (assigned.has(id)) return false;
          assigned.add(id);
          return true;
        });
      });
    };

    const commitPlayer = (key, deferred) => {
      playerDeferredLeadership = deferred;
      if (key !== 'defer') {
        const chosenKey = canAssign(getTask(tasks, key)) ? key : 'float';
        getTask(tasks, chosenKey).assignedIds.push(player.id);
        playerRoleChoice = chosenKey;
        pushBeatAfterChoice({ speaker: player.firstName, text: chosenKey === 'float' ? 'I’ll jump in where you need me.' : `I can take ${chosenKey}.` });
      } else {
        playerRoleChoice = 'defer';
        const impatient = shuffleArray(playerTribe.members.filter(m => m.id !== player.id))[0];
        const second = shuffleArray(playerTribe.members.filter(m => m.id !== player.id && m.id !== impatient.id))[0];
        getTask(tasks, 'fire').assignedIds.push(impatient.id);
        getTask(tasks, 'shelter').assignedIds.push(second.id);
        pushBeatAfterChoice({ speaker: impatient.firstName, text: 'Well someone needs to decide. I’ll do fire.' });
        pushBeat({ speaker: second.firstName, text: 'I’ll help with shelter then.' });
      }
      ensureNoDuplicate();
      awaitingChoice = false;
      nextBtn.style.display = 'inline-block';
      renderBeat();
      queueVolunteerCascade();
    };

    const pushBeatAfterChoice = beat => {
      beatQueue.splice(currentIndex + 1, 0, beat);
      currentIndex += 1;
    };

    const describeAssignment = (survivor, taskKey, context) => {
      switch (taskKey) {
        case 'fire':
          return `${survivor.firstName} steps up for fire. "I can do fire. Done it camping before."`;
        case 'shelter':
          return context === 'pair' ? `${survivor.firstName} pairs up on shelter. "Absolutely. Let’s build something solid."` : `${survivor.firstName} claims shelter duty. "I’ll start shelter. Anyone want to help?"`;
        case 'materials':
          return `${survivor.firstName} nods. "I’ll gather firewood and bamboo. Keep materials flowing."`;
        case 'food':
          return `${survivor.firstName} heads toward the treeline. "I’m going for food—coconuts, fish, whatever I can find."`;
        default:
          return `${survivor.firstName} shrugs. "I’ll stay flexible—help where it’s needed most."`;
      }
    };

    const queueVolunteerCascade = () => {
      const remaining = playerTribe.members.filter(m => !tasks.some(t => t.assignedIds.includes(m.id)));
      const order = shuffleArray(remaining);
      order.forEach(survivor => {
        const picked = weightedPick(tasks, survivor);
        const shelterTask = getTask(tasks, 'shelter');
        const beatText = describeAssignment(survivor, picked, picked === 'shelter' && shelterTask.assignedIds.length === 2 ? 'pair' : null);
        pushBeat({ speaker: survivor.firstName, text: beatText });
      });

      const filledShelter = enforceShelter(tasks, playerTribe.members).filter(Boolean);
      const filledFire = enforceFire(tasks, playerTribe.members);
      if (filledShelter.length) {
        const names = filledShelter.map(s => s.firstName).join(' and ');
        pushBeat({ speaker: 'Narrator', text: `We still need shelter locked. ${names}, pair up.` });
      }
      if (filledFire) {
        pushBeat({ speaker: 'Narrator', text: `${filledFire.firstName} is pushed toward the fire pit—someone has to own it.` });
      }

      ensureNoDuplicate();
      queueChemistryMoments();
      queueSendOff();
    };

    const queueChemistryMoments = () => {
      const bond = pickBondPair(tasks, playerTribe.members);
      if (bond && bond.compatibility >= 12) {
        const [a, b] = bond.pair;
        bondMoment = { pairIds: [a.id, b.id], delta: getRandomInt(10, 15) };
        pushBeat({ speaker: a.firstName, text: 'You and me on shelter?' });
        pushBeat({ speaker: b.firstName, text: 'Absolutely. Let’s build something solid.' });
        gameManager.systems.relationshipSystem?.changeRelationship?.(a.id, b.id, bondMoment.delta);
        addMemoryPair(gameManager.systems.socialMemorySystem, a.id, b.id, 'bond', 'Bonded building shelter Day 1', gameManager.day, ['day1', 'bond']);
      }

      const tension = pickTensionPair(tasks, playerTribe.members, leadership.contestedPair);
      if (tension && !tensionMoment) {
        const [a, b] = tension.pair;
        const delta = tension.reason === 'leadership' ? -10 : -6;
        tensionMoment = { pairIds: [a.id, b.id], delta };
        const lineA = tension.reason === 'leadership' ? `${a.firstName}: "I’ll take fire—"` : `${a.firstName}: "Bossy already."`;
        const lineB = tension.reason === 'leadership' ? `${b.firstName}: "I’m thinking shelter, I’ll need—"` : `${b.firstName}: "Follow my lead."`;
        pushBeat({ speaker: a.firstName, text: lineA });
        pushBeat({ speaker: b.firstName, text: lineB });
        gameManager.systems.relationshipSystem?.changeRelationship?.(a.id, b.id, delta);
        addMemoryPair(gameManager.systems.socialMemorySystem, a.id, b.id, 'tension', 'Friction on Day 1 tasks', gameManager.day, ['day1', 'tension']);
      }
    };

    const queueSendOff = () => {
      const fireTask = getTask(tasks, 'fire');
      const shelterTask = getTask(tasks, 'shelter');
      const contested = leadership.scenario === 'contested';
      const hasTension = Boolean(tensionMoment);
      const mood = hasTension || contested ? (fireTask.assignedIds.length && shelterTask.assignedIds.length === 2 ? 'chaotic' : 'tentative') : 'confident';
      const moodText = mood === 'confident'
        ? 'Alright, we’ve got a plan. Execute and meet back before dark.'
        : mood === 'chaotic'
          ? 'So we just… go now? / Yeah, I guess.'
          : 'Okay… I think that’s everyone? Let’s just do our best.';
      pushBeat({ speaker: 'Narrator', text: moodText });

      const reflectionMap = {
        fire: 'High visibility. High pressure.',
        shelter: 'First impressions happen fast with your shelter partner.',
        materials: 'Safe and reliable… but will anyone remember?',
        food: 'Independent—or antisocial?',
        float: 'You kept options open. Flexible or flaky?',
        defer: 'You played it safe. Likable? Or forgettable?'
      };
      const reflection = reflectionMap[playerRoleChoice || 'float'];
      pushBeat({ speaker: 'Narrator', text: reflection });
      pushBeat({ type: 'finalize' });
    };

    const finalizePlan = () => {
      const plan = tasks.reduce((acc, task) => {
        acc[`${task.key}Ids`] = [...task.assignedIds];
        return acc;
      }, {});

      const mood = tensionMoment ? 'chaotic' : bondMoment ? 'confident' : 'tentative';

      playerTribe.day1Plan = {
        createdDay: gameManager.day,
        leaderId: leadership.topLeader.id,
        leadershipScenario: leadership.scenario,
        playerDeferredLeadership,
        contestedLeadershipPairIds: leadership.contestedPair ? leadership.contestedPair.map(p => p.id) : [],
        fireIds: plan.fireIds || [],
        shelterIds: plan.shelterIds || [],
        foodIds: plan.foodIds || [],
        materialsIds: plan.materialsIds || [],
        floaterIds: plan.floatIds || [],
        bondPairIds: bondMoment?.pairIds || [],
        tensionPairIds: tensionMoment?.pairIds || [],
        mood
      };
      playerTribe.day1PlanCreated = true;
      playerTribe.day1PlanEvaluated = playerTribe.day1PlanEvaluated || false;

      gameManager.campLog = gameManager.campLog || [];
      gameManager.campLog.push({
        day: gameManager.day,
        phase: gameManager.gamePhase,
        type: 'day1',
        title: 'First Impressions',
        text: planToText(playerTribe.day1Plan, playerTribe.members)
      });

      if (bondMoment) {
        const [aId, bId] = bondMoment.pairIds;
        const a = playerTribe.members.find(m => m.id === aId);
        const b = playerTribe.members.find(m => m.id === bId);
        gameManager.campLog.push({ day: gameManager.day, phase: gameManager.gamePhase, type: 'bond', title: 'Day 1 Bond', text: `${a?.firstName || 'Someone'} and ${b?.firstName || 'someone'} found a rhythm together.` });
      }
      if (tensionMoment) {
        const [aId, bId] = tensionMoment.pairIds;
        const a = playerTribe.members.find(m => m.id === aId);
        const b = playerTribe.members.find(m => m.id === bId);
        gameManager.campLog.push({ day: gameManager.day, phase: gameManager.gamePhase, type: 'tension', title: 'Day 1 Tension', text: `${a?.firstName || 'Someone'} and ${b?.firstName || 'someone'} butted heads early.` });
      }

      gameManager.systems.socialMemorySystem?.addMemory?.(player.id, { type: 'leadership', text: 'Day 1 leadership moment', day: gameManager.day, tags: ['day1', 'leadership', 'player-reputation'] });

      if (playerDeferredLeadership && leadership.contestedPair) {
        leadership.contestedPair.forEach(npc => {
          gameManager.systems.socialMemorySystem?.addMemory?.(npc.id, { type: 'leadership', text: 'Player deferred leadership', day: gameManager.day, tags: ['day1', 'leadership', 'player-reputation'] });
        });
      }

      logDebug('Plan saved', playerTribe.day1Plan);
      eventManager.publish(GameEvents.DIALOGUE_HIDDEN, { source: 'day1-first-impressions' });
      removeOverlay(overlay);
      resolve({ plan: playerTribe.day1Plan });
    };

    let currentIndex = 0;

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
