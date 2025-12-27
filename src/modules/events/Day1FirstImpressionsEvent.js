import { getRandomInt, shuffleArray } from '../utils/CommonUtils.js';
import eventManager, { GameEvents } from '../core/EventManager.js';
import { GamePhase } from '../core/GameManager.js';

// What changed:
// - Fixed dead choice buttons (ReferenceError: applyPlayerChoice was missing) causing clicks to do nothing.
// - Hardened choice flow with guarded handlers, deterministic beat insertion, and status updates.
// - Rebuilt applyPlayerChoice to respect player intent, enforce coverage, and keep recap/state consistent.
// - Locked player identity to a single source of truth, prevented duplicate assignments, and stabilized leadership/choice flows.

const DEBUG_DAY1_EVENT = false;

function logDebug(message, payload = null) {
  if (!DEBUG_DAY1_EVENT) return;
  // eslint-disable-next-line no-console
  console.log(`[Day1FirstImpressions] ${message}`, payload);
}

function logSkip(reason, payload = null) {
  if (!DEBUG_DAY1_EVENT) return;
  // eslint-disable-next-line no-console
  console.info(`[Day1FirstImpressions] Skipped: ${reason}`, payload);
}

logDebug('module_loaded');

function resolvePlayerIdentity(gameManager, playerTribe, members = []) {
  const gm = gameManager || {};
  const tribe = playerTribe || gm.playerTribe || gm.getPlayerTribe?.();
  const roster = members.length ? members : tribe?.members || [];
  const warnings = [];

  const matchCandidate = (candidate, source) => {
    if (!candidate) return null;
    const candidateId = typeof candidate === 'object' ? candidate.id : candidate;
    if (!candidateId) {
      warnings.push(`Candidate missing id for source: ${source}`);
      return null;
    }
    const player = roster.find(m => m.id === candidateId);
    if (player) return { playerId: player.id, player, source, warnings };
    warnings.push(`No roster match for source ${source} with id ${candidateId}`);
    return null;
  };

  const attempts = [
    { value: gm.getPlayerSurvivor?.(), source: 'gm.getPlayerSurvivor' },
    { value: gm.getPlayer?.() || gm.player, source: 'gm.getPlayer|player' },
    { value: gm.playerId, source: 'gm.playerId' },
    { value: gm.playerSurvivorId, source: 'gm.playerSurvivorId' },
    { value: gm.selectedSurvivorId, source: 'gm.selectedSurvivorId' },
    { value: gm.activeSurvivorId, source: 'gm.activeSurvivorId' },
    { value: tribe?.playerId, source: 'tribe.playerId' },
    { value: tribe?.selectedSurvivorId, source: 'tribe.selectedSurvivorId' }
  ];

  for (const attempt of attempts) {
    const resolved = matchCandidate(attempt.value, attempt.source);
    if (resolved) return resolved;
  }

  if (roster.length) {
    warnings.push('Falling back to first tribe member.');
    return { playerId: roster[0].id, player: roster[0], source: 'fallback_roster_first', warnings };
  }

  warnings.push('Unable to resolve player identity from any source.');
  return { playerId: null, player: null, source: null, warnings };
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

function formatContestedLeaderLineWithPlayer({ topLeader, runnerUp, members = [], playerId }) {
  const topIsPlayer = topLeader?.id === playerId;
  const runnerIsPlayer = runnerUp?.id === playerId;
  if (!topIsPlayer && !runnerIsPlayer) return null;

  const opponent = topIsPlayer ? runnerUp : topLeader;
  const pairNames = formatPair([topLeader?.id, runnerUp?.id].filter(Boolean), members, playerId);
  if (!opponent || opponent.id === playerId || !pairNames) {
    return 'You lean forward to claim direction. Nobody challenges it.';
  }

  const opponentName = displayName(opponent, members, playerId);
  const pairLine = pairNames.includes('You') && opponentName !== pairNames
    ? pairNames
    : topIsPlayer
      ? `You and ${opponentName}`
      : `${opponentName} and You`;
  return `${pairLine} both lean forward to claim direction. Neither wants to fade.`;
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
    default:
      return { key: choiceKey, posture: 'float/flex', preferredRole: null, assertiveness: 25 };
  }
}

function groupBeatsByRole(assignments, members, playerId, describeLine, usedLines) {
  // Groups large clusters into combined narration and spotlights.
  const beats = [];
  const withReveal = (beat, roleKey, ids = []) => ({ ...beat, reveal: { roleKey, ids } });
  assignments.forEach(({ role, survivors }) => {
    const roleIds = survivors.map(s => s.id).filter(Boolean);
    if (survivors.length >= 3) {
      const names = formatIdsAsNameList(roleIds, members, playerId);
      beats.push(withReveal({ speaker: 'Narrator', text: `${names} all keep to ${role === 'float' ? 'a flexible stance' : role}. They cluster together before splitting up.` }, role, roleIds));
      shuffleArray(survivors).slice(0, 2).forEach(survivor => {
        beats.push(withReveal({ speaker: displayName(survivor, members, playerId), speakerId: survivor.id, speakerRef: survivor, text: describeLine(survivor, role, usedLines, members, playerId) }, role, [survivor.id]));
      });
    } else {
      survivors.forEach(survivor => {
        beats.push(withReveal({ speaker: displayName(survivor, members, playerId), speakerId: survivor.id, speakerRef: survivor, text: describeLine(survivor, role, usedLines, members, playerId) }, role, [survivor.id]));
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

export function canRunDay1FirstImpressions(gameManager) {
  const gm = gameManager;
  const playerTribe = gm?.playerTribe || gm?.getPlayerTribe?.();
  const members = playerTribe?.members || [];
  const tribeSize = members.length;
  const resolution = resolvePlayerIdentity(gm, playerTribe, members);
  logDebug('resolved_player', {
    source: resolution.source,
    playerId: resolution.playerId,
    playerName: resolution.player?.firstName,
    warnings: resolution.warnings
  });
  const overlayExists = typeof document !== 'undefined' && document.getElementById('day1-overlay');
  const campLogHasEntry = (gm?.campLog || []).some(entry => entry.id === 'day1_first_impressions');
  const alreadyPlanned = playerTribe?.day1Plan || playerTribe?.day1PlanCreated;
  const alreadyDone = gm?.flags?.day1FirstImpressionsCompleted || gm?.flags?.day1FirstImpressionsDone;
  const unsupportedTribe = tribeSize && ![6, 9].includes(tribeSize);
  const wrongPhase = gm?.gamePhase && gm.gamePhase !== GamePhase.PRE_CHALLENGE;

  const details = {
    day: gm?.day,
    phase: gm?.gamePhase,
    tribe: playerTribe?.name || playerTribe?.id,
    tribeSize,
    hasOverlay: Boolean(overlayExists),
    hasCampLog: campLogHasEntry,
    hasPlan: Boolean(alreadyPlanned),
    flags: gm?.flags,
    playerId: resolution.playerId,
    resolutionWarnings: resolution.warnings
  };

  if (!gm || !playerTribe || !members.length) {
    logDebug('gate_fail', { reason: 'missing_game_manager', details });
    return { ok: false, reason: 'missing_game_manager', details };
  }
  if (overlayExists) {
    logDebug('gate_fail', { reason: 'overlay_exists', details });
    return { ok: false, reason: 'overlay_exists', details };
  }
  if (alreadyDone || alreadyPlanned || campLogHasEntry) {
    logDebug('gate_fail', { reason: 'already_completed', details });
    return { ok: false, reason: 'already_completed', details };
  }
  if (gm.day !== 1) {
    logDebug('gate_fail', { reason: 'wrong_day', details });
    return { ok: false, reason: 'wrong_day', details };
  }
  if (wrongPhase) {
    logDebug('gate_fail', { reason: 'wrong_phase', details });
    return { ok: false, reason: 'wrong_phase', details };
  }
  if (unsupportedTribe) {
    logDebug('gate_fail', { reason: 'unsupported_tribe_size', details });
    return { ok: false, reason: 'unsupported_tribe_size', details };
  }

  return { ok: true, reason: 'ready', details: { ...details, playerTribeId: playerTribe?.id } };
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
    const contestedIds = [leadership.topLeader?.id, leadership.runnerUp?.id].filter(Boolean);
    const contestedPair = formatPair(contestedIds, members, player.id) || 'They';
    const contestedUniqueCount = [...new Set(contestedIds)].length;
    if (contestedUniqueCount >= 2) {
      leadershipLines.push(`${contestedPair} both angle for control before it settles.`);
    } else {
      leadershipLines.push(`${contestedPair} angles for control before it settles.`);
    }
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
  container.style.gap = '14px';
  container.style.lineHeight = '1.5';
  container.style.padding = '4px 0';

  const addSection = (title, lines) => {
    const section = document.createElement('div');
    section.style.display = 'flex';
    section.style.flexDirection = 'column';
    section.style.gap = '6px';
    section.style.padding = '8px 10px';
    section.style.background = '#fff8eb';
    section.style.border = '1px solid #e2c9a3';
    section.style.borderRadius = '10px';
    section.style.boxShadow = 'inset 0 1px 0 rgba(255,255,255,0.6)';
    const heading = document.createElement('div');
    heading.style.fontWeight = 'bold';
    heading.style.color = '#3c2415';
    heading.style.marginBottom = '2px';
    heading.textContent = title;
    section.appendChild(heading);
    const lineList = document.createElement('div');
    lineList.style.display = 'flex';
    lineList.style.flexDirection = 'column';
    lineList.style.gap = '4px';
    lines.forEach(line => {
      const row = document.createElement('div');
      row.style.display = 'flex';
      row.style.alignItems = 'flex-start';
      row.style.gap = '6px';

      const bullet = document.createElement('span');
      bullet.textContent = '•';
      bullet.style.color = '#3c2415';
      bullet.style.minWidth = '12px';

      const text = document.createElement('span');
      text.textContent = line;
      text.style.display = 'inline-block';

      row.appendChild(bullet);
      row.appendChild(text);
      lineList.appendChild(row);
    });
    section.appendChild(lineList);
    container.appendChild(section);
  };

  addSection('Leadership', sections.leadership);

  const assignmentsSection = document.createElement('div');
  assignmentsSection.style.display = 'flex';
  assignmentsSection.style.flexDirection = 'column';
  assignmentsSection.style.gap = '8px';
  assignmentsSection.style.padding = '8px 10px';
  assignmentsSection.style.background = '#fff8eb';
  assignmentsSection.style.border = '1px solid #e2c9a3';
  assignmentsSection.style.borderRadius = '10px';
  assignmentsSection.style.boxShadow = 'inset 0 1px 0 rgba(255,255,255,0.6)';

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
    row.style.gap = '10px';

    const bullet = document.createElement('span');
    bullet.textContent = '•';
    bullet.style.color = '#3c2415';
    bullet.style.minWidth = '12px';
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
      avatarRow.style.flexWrap = 'wrap';
      avatarRow.style.marginLeft = '2px';
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
function buildFinalizeBeat({ player, members, tasks, leadership, chemistryMoments, closingMood, playerChoiceKey, overlay, resolve, gameManager, cleanup, revealAllAssignments, finishEvent: requestFinishEvent }) {
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
      if (typeof revealAllAssignments === 'function') revealAllAssignments();
      const ensurePlayerLockedOnce = () => {
        const pid = player?.id;
        if (!pid) return;
        const desiredKey = ['fire', 'shelter', 'materials', 'food', 'float'].includes(playerChoiceKey)
          ? playerChoiceKey
          : playerChoiceKey === 'flex'
            ? 'float'
            : null;
        let occurrences = 0;
        tasks.forEach(task => {
          if (task.assignedIds.includes(pid)) occurrences += 1;
        });
        if (occurrences !== 1 || (desiredKey && !getTask(tasks, desiredKey)?.assignedIds.includes(pid))) {
          tasks.forEach(task => {
            task.assignedIds = task.assignedIds.filter(id => id !== pid);
          });
          const targetTask = desiredKey ? getTask(tasks, desiredKey) : getTask(tasks, 'float');
          const fallbackTask = targetTask || getTask(tasks, 'float') || tasks[0];
          if (fallbackTask) {
            if (canAssign(fallbackTask)) {
              fallbackTask.assignedIds.unshift(pid);
            } else {
              fallbackTask.assignedIds.push(pid);
            }
          }
        }
      };

      ensurePlayerLockedOnce();
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
      logDebug('runDay1FirstImpressions completed');
      requestFinishEvent({ plan: gameManager.playerTribe.day1Plan });
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


export async function runDay1FirstImpressions({ gameManager } = {}) {
  const context = arguments[0];
  const gm = gameManager || context?.gameManager || context;
  const gate = canRunDay1FirstImpressions(gm);
  logDebug('Attempting runDay1FirstImpressions', gate.details);

  if (!gate.ok) {
    logSkip(gate.reason, gate.details);
    return { skipped: true, reason: gate.reason, details: gate.details };
  }

  const playerTribe = gm?.playerTribe || gm?.getPlayerTribe?.();
  const members = playerTribe?.members || [];
  const tribeSize = members.length;
  const resolution = resolvePlayerIdentity(gm, playerTribe, members);
  const PLAYER_ID = resolution.playerId;
  const PLAYER = resolution.player;

  if (PLAYER && !gm.playerId) {
    gm.playerId = PLAYER.id;
  }

  logDebug('Player identity', {
    playerId: PLAYER_ID,
    playerName: PLAYER?.firstName,
    source: resolution.source,
    warnings: resolution.warnings
  });

  gm.flags = gm.flags || {};

  return new Promise(resolve => {
    gm.flags.campEventActive = true;
    eventManager.publish(GameEvents.CAMP_EVENT_STARTED, { eventId: 'day1_first_impressions', id: 'day1_first_impressions' });
    let finished = false;
    let finalizeRendered = false;
    let overlay;
    let nextBtn;
    let nextBtnHandler;
    let speaker;
    let avatar;
    let textArea;
    let choices;
    let statusLine;
    let awaitingChoice = { value: false };
    let beatQueue = [];
    let currentIndex = 0;
    let forceFinalizeBeat = () => {};
    let renderBeatUI = () => {};
    let finalizeBeatExists = () => beatQueue.some(beat => beat?.type === 'finalize');
    const cleanup = () => {
      if (nextBtn && nextBtnHandler) nextBtn.removeEventListener('click', nextBtnHandler);
      if (overlay) removeOverlay(overlay);
      assignmentStatusUpdater = null;
      try {
        eventManager.publish(GameEvents.DIALOGUE_HIDDEN, { source: 'day1-first-impressions' });
      } catch (e) {
        logDebug('Failed to publish dialogue hidden event during cleanup.', e);
      }
    };

    const actuallyFinishEvent = (payload = {}) => {
      if (finished) return;
      finished = true;
      try {
        if (nextBtn) {
          nextBtn.disabled = true;
          if (nextBtnHandler) nextBtn.removeEventListener('click', nextBtnHandler);
        }
        cleanup?.();
        gm.flags = gm.flags || {};
        const completed = !payload?.error;
        gm.flags.day1FirstImpressionsCompleted = completed;
        gm.flags.day1FirstImpressionsDone = completed;
        gm.flags.campEventActive = false;
      } catch (error) {
        console.error('[Day1FirstImpressions] Error during finishEvent', error);
      } finally {
        console.info('[Day1FirstImpressions] Event finished');
        eventManager.publish(GameEvents.CAMP_EVENT_ENDED, { eventId: 'day1_first_impressions', id: 'day1_first_impressions' });
        resolve(payload);
      }
    };

    function requestFinishEvent(payload = {}) {
      if (!finalizeRendered) {
        console.warn('[Day1FirstImpressions] Blocked finish: finalize not rendered yet', { currentIndex, beatQueueLen: beatQueue.length });
        if (!finalizeBeatExists()) {
          forceFinalizeBeat('finish_requested_without_finalize');
        } else {
          const finalizeIndex = beatQueue.findIndex(beat => beat?.type === 'finalize');
          if (finalizeIndex >= 0) {
            currentIndex = finalizeIndex;
            renderBeatUI();
          }
        }
        return;
      }

      actuallyFinishEvent(payload);
    }

    const showBlockingError = (message, meta = {}) => {
      logDebug('fatal_error', { message, meta });
      if (!overlay) {
        const overlayEls = buildOverlay();
        overlay = overlayEls.overlay;
        speaker = overlayEls.speaker;
        avatar = overlayEls.avatar;
        textArea = overlayEls.textArea;
        choices = overlayEls.choices;
        nextBtn = overlayEls.nextBtn;
        statusLine = overlayEls.statusLine;
      }
      if (nextBtn && nextBtnHandler) nextBtn.removeEventListener('click', nextBtnHandler);
      awaitingChoice.value = false;
      if (choices) choices.style.display = 'none';
      if (nextBtn) nextBtn.style.display = 'inline-block';
      if (nextBtn) nextBtn.textContent = 'Close';
      if (statusLine) statusLine.textContent = '';
      if (speaker) speaker.textContent = 'Narrator';
      if (avatar) {
        avatar.src = 'Assets/logo.png';
        avatar.style.visibility = 'hidden';
      }
      if (textArea) {
        textArea.textContent = `${message}\n(Please report this.)`;
      }
      if (nextBtn) {
        nextBtnHandler = () => {
          const reason = meta?.reason || 'player_unresolved';
          requestFinishEvent({ error: true, reason, warnings: resolution.warnings, meta });
        };
        nextBtn.addEventListener('click', nextBtnHandler);
      }
      try {
        eventManager.publish(GameEvents.DIALOGUE_SHOWN, { source: 'day1-first-impressions' });
      } catch (e) {
        logDebug('Failed to publish dialogue shown after error.', e);
      }
    };

    try {
      const overlayEls = buildOverlay();
      overlay = overlayEls.overlay;
      nextBtn = overlayEls.nextBtn;
      speaker = overlayEls.speaker;
      avatar = overlayEls.avatar;
      textArea = overlayEls.textArea;
      choices = overlayEls.choices;
      statusLine = overlayEls.statusLine;
      const usedLines = new Set();

      const tasks = taskDefinitions(tribeSize);
      const revealedTasks = taskDefinitions(tribeSize).map(t => ({ ...t, assignedIds: [] }));
      const leadership = resolveLeadershipScenario(members, PLAYER);
      awaitingChoice = { value: false };
      let choiceLocked = false;
      let chemistryMoments = [];
      let playerChoiceKey = null;
      let closingMood = 'tentative';

      finalizeBeatExists = () => beatQueue.some(beat => beat?.type === 'finalize');

      const buildFinalizeBeatSafe = metaReason => {
        try {
          const finalizeBeat = buildFinalizeBeat({
            player: PLAYER,
            members,
            tasks,
            leadership,
            chemistryMoments,
            closingMood,
            playerChoiceKey,
            overlay,
            resolve,
            gameManager: gm,
            cleanup,
            revealAllAssignments,
            finishEvent: requestFinishEvent
          });
          if (metaReason) finalizeBeat.meta = { ...(finalizeBeat.meta || {}), reason: metaReason };
          return finalizeBeat;
        } catch (finalizeError) {
          // eslint-disable-next-line no-console
          console.error('[Day1FirstImpressions] Failed to build finalize beat', finalizeError);
          return {
            speaker: 'Narrator',
            type: 'finalize',
            text: 'Day 1 Summary (error building recap).',
            onComplete: () => requestFinishEvent({
              plan: gm.playerTribe?.day1Plan,
              meta: { reason: 'finalize_build_failed', metaReason, message: finalizeError?.message }
            })
          };
        }
      };

      forceFinalizeBeat = metaReason => {
        const finalizeBeat = buildFinalizeBeatSafe(metaReason || 'forced_finalize');
        const existingIndex = beatQueue.findIndex(beat => beat?.type === 'finalize');
        if (existingIndex >= 0) {
          currentIndex = existingIndex;
        } else if (currentIndex < beatQueue.length - 1) {
          beatQueue.splice(currentIndex + 1, 0, finalizeBeat);
          currentIndex += 1;
        } else {
          beatQueue.push(finalizeBeat);
          currentIndex = beatQueue.length - 1;
        }
        renderBeatUI();
      };

      if (!PLAYER) {
        showBlockingError('Internal error: could not identify the player.', { resolution });
        return;
      }

      const updateStatusLine = () => {
        const pieces = revealedTasks.map(t => `${t.label}: ${formatIdsAsNameList(t.assignedIds, members, PLAYER_ID) || '—'}`);
        statusLine.textContent = pieces.join(' | ');
      };
      const revealAssignment = (roleKey, survivorId) => {
        if (!roleKey || !survivorId) return;
        const task = getTask(revealedTasks, roleKey);
        if (!task) return;
        if (!task.assignedIds.includes(survivorId)) task.assignedIds.push(survivorId);
        updateStatusLine();
      };
      const revealRoleGroup = (roleKey, survivorIds = []) => {
        if (!roleKey) return;
        survivorIds.filter(Boolean).forEach(id => revealAssignment(roleKey, id));
      };
      const revealAllAssignments = () => {
        tasks.forEach(task => {
          const revealed = getTask(revealedTasks, task.key);
          if (revealed) revealed.assignedIds = [...task.assignedIds];
        });
        updateStatusLine();
      };
      assignmentStatusUpdater = updateStatusLine;

      renderBeatUI = () => {
        console.log('[Day1] render index/type', currentIndex, beatQueue[currentIndex]?.type);
        const beat = beatQueue[currentIndex];
        if (!beat) return;
        setHeaderSpeakerUI({ beat, members, player: PLAYER, speakerEl: speaker, avatarEl: avatar });
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
        if (beat?.type === 'finalize') {
          finalizeRendered = true;
        }
        if (beat.renderChoices && beat.type === 'choice') beat.renderChoices();
        if (beat.reveal) revealRoleGroup(beat.reveal.roleKey, beat.reveal.ids);
        if (beat.onEnter) beat.onEnter();
        updateStatusLine();
        logDebug('renderBeatUI', { index: currentIndex, type: beat.type, awaitingChoice: awaitingChoice.value });
      };

      const addBeat = beat => beatQueue.push(beat);

      // Leadership opening beats
      const buildLeadershipBeats = () => {
        const beats = [];
        const { scenario, topLeader, runnerUp } = leadership;
        const topName = displayName(topLeader, members, PLAYER_ID);
        const runnerName = displayName(runnerUp, members, PLAYER_ID);

        beats.push({ speaker: 'Narrator', text: 'Bags hit the sand. Voices overlap as everyone sizes each other up.' });

        if (scenario === 'contested') {
          if (topLeader.id === runnerUp.id) {
            beats.push({ speaker: 'Narrator', text: `${topName} talks through a plan, and the tribe listens.` });
          } else if (topLeader.id === PLAYER_ID || runnerUp?.id === PLAYER_ID) {
            const contestedLine = formatContestedLeaderLineWithPlayer({
              topLeader,
              runnerUp,
              members,
              playerId: PLAYER_ID
            });
            const pairNames = formatPair([topLeader?.id, runnerUp?.id].filter(Boolean), members, PLAYER_ID) || `${topName} and ${runnerName}`;
            const fallbackLine = `${pairNames} both lean forward to claim direction. Neither wants to fade.`;
            beats.push({ speaker: 'Narrator', text: contestedLine || fallbackLine });
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
              { key: 'flex', label: 'Stay flexible' }
            ];
            logDebug('renderChoices', { options: options.map(o => o.key) });
            options.forEach(option => {
              const btn = document.createElement('button');
              btn.textContent = option.label;
              btn.className = 'rect-button';
              btn.style.textAlign = 'left';
              btn.addEventListener('click', () => {
                if (!awaitingChoice.value || choiceLocked) return;
                choiceLocked = true;
                logDebug('choice_clicked', { key: option.key });
                choices.querySelectorAll('button').forEach(b => {
                  b.disabled = true;
                  b.style.opacity = '0.8';
                  b.style.pointerEvents = 'none';
                });
                commitChoice(option.key, option.label);
              });
              choices.appendChild(btn);
            });
          }
        };
        addBeat(beat);
      };

      const applyPlayerChoice = choiceKey => {
        logDebug('applyPlayerChoice_enter', { choiceKey });
        // Reset assignments to keep the function idempotent if triggered twice.
        tasks.forEach(task => {
          task.assignedIds = [];
        });

        const intent = playerIntentFromChoice(choiceKey);
        const leaderIds = [leadership.topLeader?.id, leadership.runnerUp?.id].filter(Boolean);
        const leaderIdsForCoverage = leaderIds.filter(id => !(PLAYER && id === PLAYER_ID && intent.posture === 'float/flex' && !intent.preferredRole));
        const safeAssign = (roleKey, survivor) => {
          if (!survivor) return false;
          const success = addAssignment(tasks, roleKey, survivor);
          return success;
        };

        if (intent.preferredRole) {
          safeAssign(intent.preferredRole, PLAYER);
        } else if (intent.posture === 'float/flex') {
          safeAssign('float', PLAYER);
        }

        const coverageMembers = intent.posture === 'float/flex'
          ? [...members.filter(m => m.id !== PLAYER_ID), PLAYER].filter(Boolean)
          : members.filter(m => m.id !== PLAYER_ID);
        enforceMinimumCoverage(tasks, coverageMembers, PLAYER, intent, leaderIdsForCoverage);

        const assignedIds = new Set(tasks.flatMap(t => t.assignedIds));
        members.forEach(survivor => {
          if (survivor.id === PLAYER_ID) return;
          if (!assignedIds.has(survivor.id)) {
            addAssignment(tasks, 'float', survivor);
          }
        });

        const finalPlayerTask = tasks.find(t => t.assignedIds.includes(PLAYER_ID));
        const finalPlayerTaskKey = intent.preferredRole || (intent.posture === 'float/flex' ? 'float' : null) || finalPlayerTask?.key;

        tasks.forEach(task => {
          task.assignedIds = [...new Set(task.assignedIds)];
        });

        if (finalPlayerTaskKey) {
          tasks.forEach(task => {
            if (task.key !== finalPlayerTaskKey) {
              task.assignedIds = task.assignedIds.filter(id => id !== PLAYER_ID);
            }
          });
        }

        const seen = new Set();
        tasks.forEach(task => {
          task.assignedIds = task.assignedIds.filter(id => {
            if (id === PLAYER_ID) return true;
            if (seen.has(id)) return false;
            seen.add(id);
            return true;
          });
        });

        if (finalPlayerTaskKey) {
          const playerTask = getTask(tasks, finalPlayerTaskKey);
          if (playerTask && !playerTask.assignedIds.includes(PLAYER_ID)) {
            if (canAssign(playerTask)) {
              playerTask.assignedIds.unshift(PLAYER_ID);
            } else {
              const removedNpc = playerTask.assignedIds.find(id => id !== PLAYER_ID);
              if (removedNpc) {
                playerTask.assignedIds = [PLAYER_ID, ...playerTask.assignedIds.filter(id => id !== removedNpc)];
              }
            }
          }
        }

        const ensurePlayerPlacement = preferredKey => {
          let occurrences = 0;
          tasks.forEach(task => {
            if (task.assignedIds.includes(PLAYER_ID)) occurrences += 1;
          });
          const targetKey = preferredKey || finalPlayerTaskKey;
          if (occurrences !== 1 || (targetKey && !getTask(tasks, targetKey)?.assignedIds.includes(PLAYER_ID))) {
            tasks.forEach(task => {
              task.assignedIds = task.assignedIds.filter(id => id !== PLAYER_ID);
            });
            const targetTask = targetKey ? getTask(tasks, targetKey) : getTask(tasks, 'float');
            const fallbackTask = targetTask || getTask(tasks, 'float') || tasks[0];
            if (fallbackTask) {
              if (canAssign(fallbackTask)) {
                fallbackTask.assignedIds.unshift(PLAYER_ID);
              } else {
                fallbackTask.assignedIds.push(PLAYER_ID);
              }
            }
          }
        };

        ensurePlayerPlacement(finalPlayerTaskKey);

        if (assignmentStatusUpdater) assignmentStatusUpdater();
        logDebug('applyPlayerChoice_complete', { intent, tasks: cloneTaskState(tasks) });
        logDebug('Final assignments', cloneTaskState(tasks));
        return intent;
      };

      const commitChoice = (choiceKey, label) => {
        logDebug('commitChoice_enter', { choiceKey, awaiting: awaitingChoice.value });
        if (!awaitingChoice.value && !choiceLocked) return;

        try {
          playerChoiceKey = choiceKey;
          const intent = applyPlayerChoice(choiceKey);
          const choiceBeat = { speaker: 'Narrator', text: `You claim: ${label || choiceKey}.` };
          const finalizeBeat = buildFinalizeBeatSafe('commit_choice_finalize');
          const beats = [
            choiceBeat,
            ...buildAssignmentBeats(intent),
            ...addChemistryBeats(),
            ...addClosingBeat(),
            finalizeBeat
          ];
          logDebug('commitChoice_inserting_beats', { insertAt: currentIndex + 1, count: beats.length });
          beatQueue.splice(currentIndex + 1, 0, ...beats);
          console.log('[Day1] beats inserted', beatQueue.map(b => b.type));
          awaitingChoice.value = false;
          currentIndex += 1;
          renderBeatUI();
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error('[Day1FirstImpressions] commitChoice failed', err);
          awaitingChoice.value = false;
        } finally {
          choiceLocked = false;
        }
      };

      const buildAssignmentBeats = intent => {
        const beats = [];

        if (intent.preferredRole && intent.posture === 'claim') {
          const target = getTask(tasks, intent.preferredRole);
          const leaderInLane = target.assignedIds.find(id => leadership.topLeader && leadership.topLeader.id === id);
          if (leaderInLane && leadership.topLeader.id !== PLAYER_ID) {
            beats.push({ speaker: displayName(leadership.topLeader, members, PLAYER_ID), speakerId: leadership.topLeader.id, speakerRef: leadership.topLeader, text: formatNarrationQuote(`${displayName(leadership.topLeader, members, PLAYER_ID)} stiffens when you speak up.`, 'I called this lane already.') });
            beats.push({ speaker: 'You', speakerId: PLAYER_ID, speakerRef: PLAYER, text: formatNarrationQuote('You keep your tone steady.', `We need two hands on ${intent.preferredRole}. I’m in.`) });
          }
        }

        const grouped = groupAssignmentsByRole(tasks, members);
        beats.push(...groupBeatsByRole(grouped, members, PLAYER_ID, describeAssignmentLine, usedLines));
        beats.push({ speaker: 'Narrator', text: 'Plans settle into place. People echo assignments back to be sure.', onEnter: updateStatusLine });
        return beats;
      };

      const addChemistryBeats = () => {
        chemistryMoments = pickChemistryMoments(tasks, members, leadership.scenario, PLAYER_ID);
        const beats = [];
        chemistryMoments.forEach(m => {
          beats.push({ speaker: displayName(m.pair[0], members, PLAYER_ID), speakerId: m.pair[0].id, speakerRef: m.pair[0], text: m.textA });
          beats.push({ speaker: displayName(m.pair[1], members, PLAYER_ID), speakerId: m.pair[1].id, speakerRef: m.pair[1], text: m.textB });
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

      nextBtnHandler = () => {
        try {
          const beat = beatQueue[currentIndex];

          if (beat?.type === 'finalize') {
            try {
              if (beat.onComplete) beat.onComplete();
              else requestFinishEvent({ plan: gm.playerTribe?.day1Plan });
            } finally {
              // If something prevented the callback from completing, make sure the overlay closes.
              if (!finished) requestFinishEvent({ plan: gm.playerTribe?.day1Plan, meta: { reason: 'finalize_guard' } });
            }
            return;
          }

          if (awaitingChoice.value) return;

          if (currentIndex < beatQueue.length - 1) {
            currentIndex += 1;
            renderBeatUI();
          } else {
            console.log('[Day1] end-of-queue', { len: beatQueue.length, finalizeExists: finalizeBeatExists() });
            if (!finalizeBeatExists()) {
              forceFinalizeBeat('next_end_without_finalize');
              return;
            }

            const finalizeIndex = beatQueue.findIndex(b => b?.type === 'finalize');
            if (finalizeIndex >= 0) {
              currentIndex = finalizeIndex;
              renderBeatUI();
            }
          }
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error('[Day1FirstImpressions] next button failed', err);
          console.warn('[Day1FirstImpressions] nextBtnHandler failed; ending event early', err);
          requestFinishEvent({ error: true, reason: 'next_handler_failed', meta: { message: err?.message } });
        }
      };

      nextBtn.addEventListener('click', nextBtnHandler);

      eventManager.publish(GameEvents.DIALOGUE_SHOWN, { source: 'day1-first-impressions' });
      renderBeatUI();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[Day1FirstImpressions] Error during event setup', error);
      showBlockingError('Something went wrong preparing the scene.', { error, reason: 'setup_failed' });
    }
  });
}

export default runDay1FirstImpressions;
