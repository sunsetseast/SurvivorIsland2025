import { getRandomInt, shuffleArray } from '../utils/CommonUtils.js';
import eventManager, { GameEvents } from '../core/EventManager.js';

function createOverlay() {
  const overlay = document.createElement('div');
  overlay.id = 'day1-overlay';
  overlay.style.position = 'fixed';
  overlay.style.top = '0';
  overlay.style.left = '0';
  overlay.style.width = '100%';
  overlay.style.height = '100%';
  overlay.style.background = 'rgba(0,0,0,0.7)';
  overlay.style.zIndex = '4000';
  overlay.style.display = 'flex';
  overlay.style.alignItems = 'center';
  overlay.style.justifyContent = 'center';

  const panel = document.createElement('div');
  panel.style.background = '#f3e4c4';
  panel.style.border = '4px solid #8a5a2d';
  panel.style.borderRadius = '12px';
  panel.style.width = '70%';
  panel.style.maxWidth = '900px';
  panel.style.padding = '20px';
  panel.style.boxShadow = '0 6px 16px rgba(0,0,0,0.35)';
  panel.style.fontFamily = 'Survivant, sans-serif';
  panel.style.position = 'relative';

  const speaker = document.createElement('div');
  speaker.id = 'day1-speaker';
  speaker.style.fontWeight = 'bold';
  speaker.style.color = '#3c2415';
  speaker.style.fontSize = '1.3rem';
  speaker.style.marginBottom = '8px';

  const text = document.createElement('div');
  text.id = 'day1-text';
  text.style.color = '#2d1b0d';
  text.style.lineHeight = '1.5';
  text.style.minHeight = '100px';

  const choices = document.createElement('div');
  choices.id = 'day1-choices';
  choices.style.display = 'flex';
  choices.style.flexDirection = 'column';
  choices.style.gap = '10px';
  choices.style.marginTop = '16px';

  const nextBtn = document.createElement('button');
  nextBtn.id = 'day1-next';
  nextBtn.textContent = 'Next';
  nextBtn.style.marginTop = '16px';
  nextBtn.style.alignSelf = 'flex-end';
  nextBtn.style.padding = '10px 18px';
  nextBtn.style.background = '#8a5a2d';
  nextBtn.style.color = '#fff';
  nextBtn.style.border = 'none';
  nextBtn.style.borderRadius = '8px';
  nextBtn.style.cursor = 'pointer';

  panel.appendChild(speaker);
  panel.appendChild(text);
  panel.appendChild(choices);
  panel.appendChild(nextBtn);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);
  return { overlay, speaker, text, choices, nextBtn };
}

function removeOverlay(overlay) {
  overlay?.remove();
}

function resolveLeaderCandidate(members, player) {
  const sorted = [...members].sort((a, b) => {
    if (a.leader !== b.leader) return b.leader - a.leader;
    if (a.teamPlayer !== b.teamPlayer) return b.teamPlayer - a.teamPlayer;
    if (a.likeability !== b.likeability) return b.likeability - a.likeability;
    return Math.random() - 0.5;
  });
  const top = sorted[0];
  const playerTop = player && sorted.some(s => s.id === player.id && s.leader === top.leader);
  if (playerTop && player.leader >= top.leader) return player;
  return top;
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

function calculateScores(s) {
  const shelterSkill = (s.strength || 0) * 1.5 + (s.endurance || 0) * 1.0 + (s.dexterity || 0) * 0.8;
  return {
    fire: (s.firemaking || 0) * 3 + (s.leader || 0) * 1.2 + (s.teamPlayer || 0) * 0.8 + (s.aggression || 0) * 0.3 - (s.risk || 0) * 0.2,
    shelter: shelterSkill * 2 + (s.leader || 0) * 1.0 + (s.teamPlayer || 0) * 1.0,
    food: (s.fishing || 0) * 3 + (s.endurance || 0) * 0.8 + (s.risk || 0) * 0.5 + (s.idolhunt || 0) * 0.3,
    materials: (s.strength || 0) * 1.0 + (s.endurance || 0) * 1.0 + (s.dexterity || 0) * 1.0 + (s.teamPlayer || 0) * 1.2,
    float: (s.bigmove || 0) * 1.0 + (s.idolhunt || 0) * 1.0 + (s.risk || 0) * 1.0 - (s.teamPlayer || 0) * 1.2
  };
}

function getTask(tasks, key) {
  return tasks.find(t => t.key === key);
}

function canAssign(task) {
  return task.assignedIds.length < task.cap;
}

function assignToTask(tasks, survivor, preferred) {
  const available = tasks.filter(t => canAssign(t));
  const primary = preferred && getTask(tasks, preferred);
  if (primary && canAssign(primary)) {
    primary.assignedIds.push(survivor.id);
    return primary.key;
  }
  // fallback: choose first available (materials before float)
  const ordered = ['fire', 'shelter', 'food', 'materials', 'float'];
  for (const key of ordered) {
    const task = getTask(tasks, key);
    if (task && canAssign(task)) {
      task.assignedIds.push(survivor.id);
      return task.key;
    }
  }
  const floater = getTask(tasks, 'float');
  floater.assignedIds.push(survivor.id);
  return 'float';
}

function pickTaskByScore(tasks, survivor) {
  const scores = calculateScores(survivor);
  const entries = ['fire', 'shelter', 'food', 'materials', 'float'].map(key => ({ key, score: scores[key] + Math.random() * 2 }));
  const sorted = entries.sort((a, b) => b.score - a.score);
  for (const entry of sorted) {
    const task = getTask(tasks, entry.key);
    if (task && canAssign(task)) {
      task.assignedIds.push(survivor.id);
      return entry.key;
    }
  }
  return 'float';
}

function buildLine(speaker, text) {
  return { speaker, text };
}

function generateLeadershipClaim(tasks, leader) {
  const scores = calculateScores(leader);
  let choice = 'materials';
  if (canAssign(getTask(tasks, 'fire')) && (scores.fire >= scores.shelter)) {
    choice = 'fire';
  } else if (canAssign(getTask(tasks, 'shelter'))) {
    choice = 'shelter';
  }
  assignToTask(tasks, leader, choice);
  const line = choice === 'fire'
    ? `${leader.firstName} steps up: "I'll take point on getting a fire going. We need warmth and morale."`
    : `${leader.firstName} takes charge: "Shelter first. I'll anchor that so we have cover tonight."`;
  return { choice, line };
}

function summarizePlan(tasks) {
  const result = {};
  tasks.forEach(t => {
    result[t.key] = [...t.assignedIds];
  });
  return result;
}

function evaluateBondAndFriction(tasks, tribeMembers, relationshipSystem, socialMemorySystem, day) {
  const bond = null;
  const friction = null;
  const summary = { bond: null, friction: null };
  const shelterTask = getTask(tasks, 'shelter');
  if (shelterTask && shelterTask.assignedIds.length === 2) {
    const [aId, bId] = shelterTask.assignedIds;
    const a = tribeMembers.find(m => m.id === aId);
    const b = tribeMembers.find(m => m.id === bId);
    const compatibility = ((a.teamPlayer || 0) + (b.teamPlayer || 0) + (a.likeability || 0) + (b.likeability || 0) + (a.alliances || 0) + (b.alliances || 0)) / 6;
    const aggressionCombo = (a.aggression || 0) + (b.aggression || 0);
    if (compatibility >= 6 && aggressionCombo < 10) {
      const delta = getRandomInt(10, 15);
      relationshipSystem?.changeRelationship(a.id, b.id, delta);
      socialMemorySystem?.addMemory?.(a.id, { type: 'bond', text: `Day 1 bond with ${b.firstName}`, day, tags: ['day1', 'bond'] });
      socialMemorySystem?.addMemory?.(b.id, { type: 'bond', text: `Day 1 bond with ${a.firstName}`, day, tags: ['day1', 'bond'] });
      summary.bond = { pair: [a, b], delta };
    } else {
      const delta = -getRandomInt(5, 10);
      relationshipSystem?.changeRelationship(a.id, b.id, delta);
      socialMemorySystem?.addMemory?.(a.id, { type: 'friction', text: `Clashed with ${b.firstName} on shelter approach`, day, tags: ['day1', 'friction'] });
      socialMemorySystem?.addMemory?.(b.id, { type: 'friction', text: `Clashed with ${a.firstName} on shelter approach`, day, tags: ['day1', 'friction'] });
      summary.friction = { pair: [a, b], delta };
    }
  }

  if (!summary.friction) {
    const floatTask = getTask(tasks, 'float');
    if (floatTask && floatTask.assignedIds.length > 0) {
      const caller = tribeMembers.find(m => m.id === floatTask.assignedIds[0]);
      const workerTask = getTask(tasks, 'materials');
      const workerId = workerTask.assignedIds[0];
      const worker = tribeMembers.find(m => m.id === workerId);
      if (caller && worker) {
        const delta = -getRandomInt(5, 10);
        relationshipSystem?.changeRelationship(caller.id, worker.id, delta);
        socialMemorySystem?.addMemory?.(caller.id, { type: 'friction', text: `Called out for floating by ${worker.firstName}`, day, tags: ['day1', 'friction'] });
        socialMemorySystem?.addMemory?.(worker.id, { type: 'friction', text: `Annoyed that ${caller.firstName} floated`, day, tags: ['day1', 'friction'] });
        summary.friction = { pair: [caller, worker], delta };
      }
    }
  }

  if (summary.bond) {
    summary.bond.pair[0].connections = (summary.bond.pair[0].connections || 0) + 1;
    summary.bond.pair[1].connections = (summary.bond.pair[1].connections || 0) + 1;
  }

  return summary;
}

function planToText(plan, tribeMembers) {
  const nameList = ids => ids.map(id => tribeMembers.find(m => m.id === id)?.firstName || 'Unknown').join(', ');
  return [
    `Fire: ${nameList(plan.fire) || 'None'}`,
    `Shelter: ${nameList(plan.shelter) || 'None'}`,
    `Food: ${nameList(plan.food) || 'None'}`,
    `Materials: ${nameList(plan.materials) || 'None'}`,
    `Floaters: ${nameList(plan.float) || 'None'}`
  ].join(' | ');
}

export async function runDay1FirstImpressions({ gameManager, campScreen }) {
  return new Promise(resolve => {
    const playerTribe = gameManager.getPlayerTribe();
    if (!playerTribe) return resolve(null);
    const tribeMembers = [...playerTribe.members];
    const player = gameManager.getPlayerSurvivor();
    const overlayElements = createOverlay();
    const { overlay, speaker, text, choices, nextBtn } = overlayElements;

    const tasks = taskDefinitions();
    const leaderCandidate = resolveLeaderCandidate(tribeMembers, player);
    const beats = [];

    const leadership = generateLeadershipClaim(tasks, leaderCandidate);
    beats.push(buildLine(leaderCandidate.firstName, leadership.line));

    const remaining = tribeMembers.filter(m => m.id !== leaderCandidate.id && !m.isPlayer);
    const earlyVolunteers = shuffleArray(remaining).slice(0, Math.min(2, remaining.length));
    earlyVolunteers.forEach(vol => {
      const role = pickTaskByScore(tasks, vol);
      beats.push(buildLine(vol.firstName, `${vol.firstName} offers to handle ${role === 'materials' ? 'gathering materials' : role}.`));
    });

    let currentBeat = 0;
    let awaitingChoice = false;

    const renderBeat = () => {
      if (currentBeat < beats.length) {
        const beat = beats[currentBeat];
        speaker.textContent = beat.speaker;
        text.textContent = beat.text;
        choices.innerHTML = '';
        nextBtn.style.display = 'inline-block';
        awaitingChoice = false;
      } else {
        renderPlayerChoice();
      }
    };

    const renderPlayerChoice = () => {
      speaker.textContent = player.firstName;
      text.textContent = 'Where do you want to pitch in?';
      choices.innerHTML = '';
      nextBtn.style.display = 'none';
      awaitingChoice = true;

      const addChoice = (label, handler) => {
        const btn = document.createElement('button');
        btn.textContent = label;
        btn.style.padding = '10px 14px';
        btn.style.background = '#c17f3f';
        btn.style.color = '#fff';
        btn.style.border = 'none';
        btn.style.borderRadius = '8px';
        btn.style.cursor = 'pointer';
        btn.addEventListener('click', handler);
        choices.appendChild(btn);
      };

      const availableKeys = tasks.filter(t => canAssign(t)).map(t => t.key);
      if (availableKeys.includes('fire')) addChoice('Tackle Fire', () => commitPlayer('fire'));
      if (availableKeys.includes('shelter')) addChoice('Build Shelter', () => commitPlayer('shelter'));
      addChoice('Find Food', () => commitPlayer('food'));
      addChoice('Gather Materials', () => commitPlayer('materials'));
      addChoice('Float/Scout', () => commitPlayer('float'));
      addChoice('Where do you need me most?', () => commitPlayer(findNeededTask(tasks)));
    };

    const findNeededTask = (tasksList) => {
      const priorities = ['fire', 'shelter', 'food', 'materials'];
      for (const key of priorities) {
        const task = getTask(tasksList, key);
        if (task && canAssign(task)) return key;
      }
      return 'float';
    };

    const finalizeAssignments = () => {
      const remainingSurvivors = tribeMembers.filter(m => !tasks.some(t => t.assignedIds.includes(m.id)));
      remainingSurvivors.forEach(survivor => {
        pickTaskByScore(tasks, survivor);
      });

      const plan = summarizePlan(tasks);
      playerTribe.day1Plan = plan;
      playerTribe.day1PlanCreated = true;

      const bondFriction = evaluateBondAndFriction(tasks, tribeMembers, gameManager.systems.relationshipSystem, gameManager.systems.socialMemorySystem, gameManager.day);

      const summaryEntries = [
        {
          day: gameManager.day,
          phase: gameManager.gamePhase,
          type: 'day1',
          title: 'First Impressions',
          text: planToText(plan, tribeMembers),
          meta: {
            leader: leaderCandidate.firstName,
            playerChoice: plan.fire.includes(player.id) || plan.shelter.includes(player.id) || plan.food.includes(player.id) || plan.materials.includes(player.id) || plan.float.includes(player.id)
          }
        }
      ];

      if (bondFriction.bond) {
        const [a, b] = bondFriction.bond.pair;
        summaryEntries.push({ day: gameManager.day, phase: gameManager.gamePhase, type: 'bond', title: 'Early Bond', text: `${a.firstName} and ${b.firstName} clicked while planning shelter.` });
      }
      if (bondFriction.friction) {
        const [a, b] = bondFriction.friction.pair;
        summaryEntries.push({ day: gameManager.day, phase: gameManager.gamePhase, type: 'friction', title: 'Tension', text: `${a.firstName} and ${b.firstName} rubbed each other the wrong way.` });
      }

      gameManager.campLog = gameManager.campLog || [];
      gameManager.campLog.push(...summaryEntries);

      eventManager.publish(GameEvents.DIALOGUE_HIDDEN, { source: 'day1-first-impressions' });
      removeOverlay(overlay);
      resolve({ plan, bond: bondFriction.bond, friction: bondFriction.friction, leadershipMeta: { leader: leaderCandidate.id }, summaryEntries });
    };

    const commitPlayer = (taskKey) => {
      assignToTask(tasks, player, taskKey);
      beats.push(buildLine(player.firstName, `You commit to ${taskKey === 'materials' ? 'gathering materials' : taskKey}.`));
      awaitingChoice = false;
      choices.innerHTML = '';
      nextBtn.style.display = 'inline-block';
      currentBeat = beats.length; // move to cascade
      text.textContent = `${player.firstName} steps in to help with ${taskKey}.`;
      speaker.textContent = player.firstName;
      // continue cascade after brief pause
      setTimeout(() => {
        cascadeVolunteers();
      }, 200);
    };

    const cascadeVolunteers = () => {
      const unassigned = tribeMembers.filter(m => !tasks.some(t => t.assignedIds.includes(m.id)));
      shuffleArray(unassigned).forEach(survivor => {
        pickTaskByScore(tasks, survivor);
      });
      finalizeAssignments();
    };

    nextBtn.addEventListener('click', () => {
      if (awaitingChoice) return;
      currentBeat += 1;
      if (currentBeat <= beats.length) {
        renderBeat();
      }
      if (currentBeat === beats.length) {
        renderPlayerChoice();
      }
    });

    eventManager.publish(GameEvents.DIALOGUE_SHOWN, { source: 'day1-first-impressions' });
    renderBeat();
  });
}

export default { runDay1FirstImpressions };
