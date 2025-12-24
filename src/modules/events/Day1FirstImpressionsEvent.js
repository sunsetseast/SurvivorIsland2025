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
  return getTrait(member, ['leader', 'leadership'], 0) * 3 + getTrait(member, ['likeability', 'alliances', 'connections'], 0);
}

function resolveLeadershipScenario(members, player) {
  const scored = members.map(m => ({ member: m, score: leadershipScore(m) }));
  scored.sort((a, b) => b.score - a.score);
  const top = scored[0];
  const runner = scored[1];
  const contested = runner && Math.abs(top.score - runner.score) <= 5;
  const playerTop = player && top.member.id === player.id;
  const scenario = playerTop ? 'player_leads' : contested ? 'contested' : 'npc_leads';
  return { topLeader: top.member, runnerUp: runner?.member || null, scenario };
}

function taskDefinitions() {
  return [
    { key: 'fire', label: 'Fire', cap: 1, assignedIds: [] },
    { key: 'shelter', label: 'Shelter', cap: 2, assignedIds: [] },
    { key: 'food', label: 'Food', cap: 2, assignedIds: [] },
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
  const fire = getTrait(s, ['firemaking'], 0) * 3 + getTrait(s, ['focus', 'patience'], 0) + getTrait(s, ['leader'], 0);
  const shelter = getTrait(s, ['strength'], 0) * 1.5 + getTrait(s, ['endurance'], 0) * 1.2 + getTrait(s, ['dexterity'], 0) + getTrait(s, ['teamPlayer'], 0);
  const food = getTrait(s, ['fishing', 'foraging', 'survival'], 0) * 2.5 + getTrait(s, ['endurance'], 0) + getTrait(s, ['risk', 'idolhunt'], 0);
  const materials = getTrait(s, ['strength'], 0) + getTrait(s, ['endurance'], 0) + getTrait(s, ['dexterity'], 0) + getTrait(s, ['teamPlayer'], 0);
  const floater = getTrait(s, ['bigmove', 'idolhunt', 'risk'], 0) + (50 - getTrait(s, ['teamPlayer'], 50)) + s.laziness;
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
    task.assignedIds.push(next.id);
    added.push(next);
  }
  return added;
}

function enforceShelter(tasks, members) {
  const shelterTask = getTask(tasks, 'shelter');
  if (shelterTask.assignedIds.length === 2) return [];
  const unassigned = members.filter(m => !tasks.some(t => t.assignedIds.includes(m.id)));
  const ranked = unassigned.map(m => ({ member: m, score: buildScores(m).shelter + Math.random() * 3 }))
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
  const ranked = unassigned.map(m => ({ member: m, score: buildScores(m).fire + Math.random() * 3 }))
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

function evaluateChemistry(tasks, members, systems, day, contestedPair) {
  const summary = { bond: null, tension: null };
  const shelter = getTask(tasks, 'shelter');
  if (shelter.assignedIds.length === 2) {
    const [aId, bId] = shelter.assignedIds;
    const a = members.find(m => m.id === aId);
    const b = members.find(m => m.id === bId);
    const compatibility = (getTrait(a, ['teamPlayer', 'likeability', 'alliances', 'connections'], 0) + getTrait(b, ['teamPlayer', 'likeability', 'alliances', 'connections'], 0)) / 2;
    if (compatibility >= 12) {
      const delta = getRandomInt(10, 15);
      systems.relationshipSystem?.changeRelationship?.(a.id, b.id, delta);
      addMemoryPair(systems.socialMemorySystem, a.id, b.id, 'bond', `Day 1 bond with ${compatibility >= 12 ? b.firstName : a.firstName}`, day, ['day1', 'bond']);
      summary.bond = { pairIds: [a.id, b.id], delta };
    }
  }

  if (!summary.tension && contestedPair) {
    systems.relationshipSystem?.changeRelationship?.(contestedPair[0].id, contestedPair[1].id, -10);
    addMemoryPair(systems.socialMemorySystem, contestedPair[0].id, contestedPair[1].id, 'tension', 'Leadership friction Day 1', day, ['day1', 'tension']);
    summary.tension = { pairIds: [contestedPair[0].id, contestedPair[1].id], delta: -10 };
  }

  if (!summary.tension) {
    const floaters = getTask(tasks, 'float');
    if (floaters.assignedIds.length) {
      const callerId = floaters.assignedIds[0];
      const workerTask = getTask(tasks, 'materials');
      if (workerTask.assignedIds.length) {
        const workerId = workerTask.assignedIds[0];
        systems.relationshipSystem?.changeRelationship?.(callerId, workerId, -6);
        addMemoryPair(systems.socialMemorySystem, callerId, workerId, 'tension', 'Friction over effort Day 1', day, ['day1', 'tension']);
        summary.tension = { pairIds: [callerId, workerId], delta: -6 };
      }
    }
  }
  return summary;
}

function planToText(plan, members) {
  const nameList = ids => ids.map(id => members.find(m => m.id === id)?.firstName || 'Unknown').join(', ') || 'None';
  return `Fire: ${nameList(plan.fire)} | Shelter: ${nameList(plan.shelter)} | Food: ${nameList(plan.food)} | Materials: ${nameList(plan.materials)} | Floaters: ${nameList(plan.float)}`;
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

    const beats = [];
    beats.push({ speaker: 'Narrator', text: `${playerTribe.name} gathers under fading light, sizing each other up.` });

    if (leadership.scenario === 'npc_leads') {
      const claim = weightedPick(tasks, leadership.topLeader);
      beats.push({ speaker: leadership.topLeader.firstName, text: claim === 'fire' ? "I'll get fire going so we can see what we're working with." : "Shelter first. I'll anchor that so we have cover tonight." });
    } else if (leadership.scenario === 'player_leads') {
      beats.push({ speaker: 'Narrator', text: `Eyes settle on you—${player.firstName} clearly has the strongest presence.` });
    } else {
      beats.push({ speaker: leadership.topLeader.firstName, text: 'We should get organized fast.' });
      beats.push({ speaker: leadership.runnerUp.firstName, text: "Agreed—let's pick roles and get moving." });
    }

    let currentBeat = 0;
    let awaitingChoice = false;
    let cascadeStarted = false;

    const renderBeat = () => {
      if (currentBeat < beats.length) {
        const beat = beats[currentBeat];
        speaker.textContent = beat.speaker;
        textArea.textContent = beat.text;
        choices.innerHTML = '';
        nextBtn.style.display = 'inline-block';
        awaitingChoice = false;
      } else if (!cascadeStarted) {
        renderPlayerChoice();
      }
    };

    const addChoiceButton = (label, handler) => {
      const btn = document.createElement('button');
      btn.className = 'rect-button';
      btn.textContent = label;
      btn.addEventListener('click', handler);
      choices.appendChild(btn);
    };

    const commitPlayer = key => {
      if (!canAssign(getTask(tasks, key))) key = 'float';
      getTask(tasks, key).assignedIds.push(player.id);
      logDebug('Player committed', key);
      choices.innerHTML = '';
      nextBtn.style.display = 'inline-block';
      awaitingChoice = false;
      textArea.textContent = `You commit to ${key === 'materials' ? 'gathering materials' : key}.`;
      speaker.textContent = player.firstName;
      cascadeVolunteers();
    };

    const renderPlayerChoice = () => {
      awaitingChoice = true;
      cascadeStarted = true;
      choices.innerHTML = '';
      nextBtn.style.display = 'none';
      speaker.textContent = player.firstName;
      textArea.textContent = leadership.scenario === 'player_leads'
        ? 'They wait for your call. What will you take on first?'
        : 'Where do you want to pitch in? You get first pick.';

      const available = tasks.filter(t => canAssign(t)).map(t => t.key);
      if (available.includes('fire')) addChoiceButton('I will handle fire', () => commitPlayer('fire'));
      if (available.includes('shelter')) addChoiceButton('I will start shelter', () => commitPlayer('shelter'));
      addChoiceButton('I will find food', () => commitPlayer('food'));
      addChoiceButton('I will gather materials', () => commitPlayer('materials'));
      addChoiceButton('I will scout/float', () => commitPlayer('float'));
      addChoiceButton('Where do you need me most?', () => commitPlayer(available.includes('fire') ? 'fire' : available.includes('shelter') ? 'shelter' : 'materials'));
    };

    const cascadeVolunteers = () => {
      const remaining = playerTribe.members.filter(m => !tasks.some(t => t.assignedIds.includes(m.id)));
      const order = shuffleArray(remaining);
      order.forEach(survivor => {
        weightedPick(tasks, survivor);
      });

      const filledShelter = enforceShelter(tasks, playerTribe.members);
      const filledFire = enforceFire(tasks, playerTribe.members);
      if (filledShelter.length || filledFire) {
        beats.push({ speaker: 'Narrator', text: 'The tribe adjusts to make sure fire and shelter are covered.' });
      }
      finalizePlan();
    };

    const finalizePlan = () => {
      const plan = tasks.reduce((acc, task) => {
        acc[task.key] = [...task.assignedIds];
        return acc;
      }, {});

      const bondTension = evaluateChemistry(tasks, playerTribe.members, gameManager.systems, gameManager.day, leadership.scenario === 'contested' ? [leadership.topLeader, leadership.runnerUp] : null);
      const mood = bondTension.tension ? 'chaotic' : bondTension.bond ? 'confident' : 'tentative';

      playerTribe.day1Plan = {
        createdDay: gameManager.day,
        leaderId: leadership.topLeader.id,
        leadershipScenario: leadership.scenario,
        playerDeferredLeadership: leadership.scenario === 'player_leads' && !tasks.some(t => t.assignedIds.includes(player.id)),
        fireIds: plan.fire,
        shelterIds: plan.shelter,
        foodIds: plan.food,
        materialsIds: plan.materials,
        floaterIds: plan.float,
        bondPairIds: bondTension.bond?.pairIds || [],
        tensionPairIds: bondTension.tension?.pairIds || [],
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
        text: planToText(plan, playerTribe.members)
      });

      if (bondTension.bond) {
        gameManager.campLog.push({ day: gameManager.day, phase: gameManager.gamePhase, type: 'bond', title: 'Day 1 Bond', text: `${plan.shelter.map(id => playerTribe.members.find(m => m.id === id)?.firstName).join(' & ')} found a rhythm working together.` });
      }
      if (bondTension.tension) {
        const [aId, bId] = bondTension.tension.pairIds;
        const a = playerTribe.members.find(m => m.id === aId);
        const b = playerTribe.members.find(m => m.id === bId);
        gameManager.campLog.push({ day: gameManager.day, phase: gameManager.gamePhase, type: 'tension', title: 'Day 1 Tension', text: `${a?.firstName || 'Someone'} and ${b?.firstName || 'someone'} butted heads early.` });
      }

      logDebug('Plan saved', playerTribe.day1Plan);
      eventManager.publish(GameEvents.DIALOGUE_HIDDEN, { source: 'day1-first-impressions' });
      removeOverlay(overlay);
      resolve({ plan: playerTribe.day1Plan });
    };

    nextBtn.addEventListener('click', () => {
      if (awaitingChoice) return;
      currentBeat += 1;
      renderBeat();
    });

    eventManager.publish(GameEvents.DIALOGUE_SHOWN, { source: 'day1-first-impressions' });
    renderBeat();
  });
}

export default { runDay1FirstImpressions };
