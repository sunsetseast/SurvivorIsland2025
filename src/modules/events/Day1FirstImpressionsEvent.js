import { getRandomInt, shuffleArray } from '../utils/CommonUtils.js';
import eventManager, { GameEvents } from '../core/EventManager.js';
import { GamePhase } from '../core/GameManager.js';
import { gameManager as sharedGameManager } from '../core/index.js';

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

function normalizeRoleKey(key) {
  if (!key) return key;
  const k = String(key).toLowerCase();
  if (k === 'materials') return 'wood';
  if (k === 'food') return 'resources';
  if (k === 'flex') return 'float';
  return k;
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
    resources: survival * 1.15 + strength * 0.35 + confidence * 0.25,
    wood: strength * 0.95 + practicality * 0.45 + social * 0.1,
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
  overlay.id = 'day1-event-overlay';
  overlay.className = 'conversation-overlay';
  overlay.style.position = 'fixed';
  overlay.style.inset = '0';
  overlay.style.background = 'rgba(0,0,0,0.75)';
  overlay.style.zIndex = '5000';
  overlay.style.display = 'flex';
  overlay.style.alignItems = 'center';
  overlay.style.justifyContent = 'center';

  const beatFrame = document.createElement('div');
  beatFrame.id = 'day1-beat-frame';
  beatFrame.className = 'day1-frame';
  beatFrame.style.position = 'relative';
  beatFrame.style.width = 'min(92vw, 520px)';
  beatFrame.style.maxHeight = '92vh';
  beatFrame.style.aspectRatio = '2 / 3';
  beatFrame.style.display = 'flex';
  beatFrame.style.alignItems = 'stretch';
  beatFrame.style.justifyContent = 'center';
  beatFrame.style.fontFamily = "'Survivant', sans-serif";

  const avatar = document.createElement('img');
  avatar.id = 'day1-avatar';
  avatar.className = 'day1-speaker-avatar';
  avatar.alt = 'Speaker avatar';
  avatar.style.position = 'absolute';
  avatar.style.aspectRatio = '1 / 1';
  avatar.style.width = '36%';
  avatar.style.height = 'auto';
  avatar.style.top = '10%';
  avatar.style.left = '9%';
  avatar.style.objectFit = 'cover';
  avatar.style.borderRadius = '50%';
  avatar.style.border = 'none';
  avatar.style.boxShadow = 'none';
  avatar.style.display = 'none';
  avatar.style.zIndex = '1';

  const templateImg = document.createElement('img');
  templateImg.id = 'day1-template-img';
  templateImg.className = 'day1-frame-img';
  templateImg.src = 'Assets/beat-ui.png';
  templateImg.alt = 'Beat template';
  templateImg.style.position = 'absolute';
  templateImg.style.inset = '0';
  templateImg.style.width = '100%';
  templateImg.style.height = '100%';
  templateImg.style.objectFit = 'contain';
  templateImg.style.pointerEvents = 'none';
  templateImg.style.zIndex = '2';

  const contentLayer = document.createElement('div');
  contentLayer.style.position = 'absolute';
  contentLayer.style.inset = '0';
  contentLayer.style.display = 'flex';
  contentLayer.style.flexDirection = 'column';
  contentLayer.style.justifyContent = 'flex-start';
  contentLayer.style.zIndex = '3';

  const headerTileText = document.createElement('div');
  headerTileText.id = 'day1-header-tile';
  headerTileText.className = 'day1-header';
  headerTileText.style.position = 'absolute';
  headerTileText.style.top = '7.5%';
  headerTileText.style.left = '30%';
  headerTileText.style.right = '30%';
  headerTileText.style.textAlign = 'center';
  headerTileText.style.fontSize = '1.02rem';
  headerTileText.style.fontWeight = '700';
  headerTileText.style.color = '#fdf2d4';
  headerTileText.style.textShadow = '0 1px 2px rgba(0,0,0,0.6)';
  headerTileText.style.letterSpacing = '1px';

  const contentArea = document.createElement('div');
  contentArea.style.position = 'absolute';
  contentArea.style.top = '23%';
  contentArea.style.left = '16%';
  contentArea.style.right = '16%';
  contentArea.style.bottom = '26%';
  contentArea.style.display = 'flex';
  contentArea.style.flexDirection = 'column';
  contentArea.style.alignItems = 'stretch';
  contentArea.style.gap = '10px';
  contentArea.style.padding = '0';
  contentArea.style.color = '#2b1a0f';
  contentArea.style.textShadow = '0 1px 1px rgba(255,255,255,0.35)';
  contentArea.style.pointerEvents = 'auto';
  contentArea.style.overflow = 'hidden';

  const textArea = document.createElement('div');
  textArea.id = 'day1-text';
  textArea.className = 'day1-text';
  textArea.style.position = 'absolute';
  textArea.style.left = '0';
  textArea.style.right = '0';
  textArea.style.top = '0';
  textArea.style.bottom = '0';
  textArea.style.padding = '0';
  textArea.style.background = 'transparent';
  textArea.style.border = 'none';
  textArea.style.borderRadius = '0';
  textArea.style.color = '#2d1b0d';
  textArea.style.lineHeight = '1.5';
  textArea.style.fontSize = '0.96rem';
  textArea.style.maxWidth = '100%';
  textArea.style.margin = '0 auto';
  textArea.style.pointerEvents = 'auto';
  textArea.style.display = 'flex';
  textArea.style.alignItems = 'center';
  textArea.style.justifyContent = 'center';
  textArea.style.textAlign = 'center';
  textArea.style.padding = '0 2%';
  textArea.style.overflow = 'hidden';
  textArea.style.wordBreak = 'break-word';

  const choices = document.createElement('div');
  choices.id = 'day1-choices';
  choices.className = 'day1-choices';
  choices.style.display = 'none';
  choices.style.position = 'absolute';
  choices.style.left = '8%';
  choices.style.right = '6%';
  choices.style.bottom = '4%';
  choices.style.flexDirection = 'column';
  choices.style.gap = '10px';
  choices.style.maxHeight = '40%';
  choices.style.overflowY = 'auto';
  choices.style.pointerEvents = 'auto';

  contentArea.appendChild(textArea);
  contentArea.appendChild(choices);

  const rolesPanel = document.createElement('div');
  rolesPanel.id = 'day1-roles-panel';
  rolesPanel.style.position = 'absolute';
  rolesPanel.style.left = '14%';
  rolesPanel.style.bottom = '11%';
  rolesPanel.style.width = '40%';
  rolesPanel.style.height = '18%';
  rolesPanel.style.display = 'flex';
  rolesPanel.style.flexDirection = 'column';
  rolesPanel.style.gap = '2px';
  rolesPanel.style.fontSize = '0.68rem';
  rolesPanel.style.lineHeight = '1.05';
  rolesPanel.style.color = '#f6e4c1';
  rolesPanel.style.textShadow = '0 1px 2px rgba(0,0,0,0.65)';
  rolesPanel.style.pointerEvents = 'none';
  rolesPanel.style.overflow = 'hidden';

  const nextBtn = document.createElement('button');
  nextBtn.id = 'day1-next';
  nextBtn.textContent = 'Next';
  nextBtn.style.position = 'absolute';
  nextBtn.style.right = '10%';
  nextBtn.style.bottom = '10%';
  nextBtn.style.width = '28%';
  nextBtn.style.height = '11%';
  nextBtn.style.padding = '0';
  nextBtn.style.background = 'transparent';
  nextBtn.style.color = '#fef3d9';
  nextBtn.style.border = 'none';
  nextBtn.style.borderRadius = '0';
  nextBtn.style.fontWeight = '700';
  nextBtn.style.fontSize = '0.98rem';
  nextBtn.style.textTransform = 'uppercase';
  nextBtn.style.boxShadow = 'none';
  nextBtn.style.cursor = 'pointer';
  nextBtn.style.pointerEvents = 'auto';
  nextBtn.style.minWidth = '0';
  nextBtn.style.display = 'flex';
  nextBtn.style.alignItems = 'center';
  nextBtn.style.justifyContent = 'center';
  nextBtn.style.letterSpacing = '0.5px';
  nextBtn.style.textShadow = '0 1px 2px rgba(0,0,0,0.55)';

  contentLayer.appendChild(headerTileText);
  contentLayer.appendChild(contentArea);
  contentLayer.appendChild(rolesPanel);
  contentLayer.appendChild(nextBtn);

  beatFrame.appendChild(avatar);
  beatFrame.appendChild(templateImg);
  beatFrame.appendChild(contentLayer);
  overlay.appendChild(beatFrame);

  // eslint-disable-next-line no-console
  console.log('[Day1Event] Using beat-ui.png / beat-avatar-ui.png frame layout');

  document.body.appendChild(overlay);
  return { overlay, beatFrame, templateImg, headerTileText, avatar, textArea, choices, nextBtn, rolesPanel, contentArea };
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

function resolveTribeColor(survivor, gameManager, fallback = '#caa15a') {
  if (!survivor) return fallback;
  if (survivor.tribeColor) return survivor.tribeColor;
  if (survivor.tribe?.color) return survivor.tribe.color;
  if (gameManager?.getTribes) {
    const tribes = gameManager.getTribes();
    const match = tribes?.find(t => (t.members || []).some(m => m.id === survivor.id));
    if (match?.color) return match.color;
  }
  if (survivor.color) return survivor.color;
  return fallback;
}

function resolveSpeakerSurvivor(beat, members = []) {
  if (!beat) return null;
  if (beat.speakerRef) return beat.speakerRef;
  if (beat.speakerId) return members.find(m => m.id === beat.speakerId) || null;
  return null;
}

function setNarratorBeatUI({ templateImg, headerTileText, avatarEl }) {
  templateImg.src = 'Assets/beat-ui.png';
  headerTileText.textContent = 'DAY 1';
  headerTileText.style.top = '7.5%';
  headerTileText.style.left = '26%';
  headerTileText.style.right = '26%';
  headerTileText.style.textAlign = 'center';
  avatarEl.style.display = 'none';
}

function setSpeakerBeatUI({ templateImg, headerTileText, avatarEl, survivor, tribeColor }) {
  templateImg.src = 'Assets/beat-avatar-ui.png';
  headerTileText.textContent = (survivor?.firstName || survivor?.name || 'SURVIVOR').toUpperCase();
  headerTileText.style.top = '7.5%';
  headerTileText.style.left = '54%';
  headerTileText.style.right = '10%';
  headerTileText.style.textAlign = 'center';
  avatarEl.style.display = 'block';
  avatarEl.style.width = '36%';
  avatarEl.style.height = 'auto';
  avatarEl.style.top = '10%';
  avatarEl.style.left = '9%';
  avatarEl.src = getSurvivorAvatarSrc(survivor);
  avatarEl.style.borderColor = tribeColor;
}

function applyBeatModeStyles({ textArea, contentArea }) {
  contentArea.style.alignItems = 'stretch';
  contentArea.style.justifyContent = 'flex-start';
  textArea.style.background = 'transparent';
  textArea.style.border = 'none';
  textArea.style.boxShadow = 'none';
  textArea.style.padding = '0';
  textArea.style.maxWidth = '100%';
  textArea.style.margin = '0 auto';
  textArea.style.textAlign = 'center';
  textArea.style.overflow = 'hidden';
  textArea.style.wordBreak = 'break-word';
  textArea.style.alignItems = 'center';
  textArea.style.justifyContent = 'center';
}

function applySummaryModeStyles({ textArea, contentArea }) {
  contentArea.style.alignItems = 'stretch';
  contentArea.style.justifyContent = 'flex-start';
  textArea.style.background = 'transparent';
  textArea.style.border = 'none';
  textArea.style.boxShadow = 'none';
  textArea.style.padding = '0 2%';
  textArea.style.maxWidth = '100%';
  textArea.style.margin = '0 auto';
  textArea.style.textAlign = 'left';
  textArea.style.alignItems = 'flex-start';
  textArea.style.justifyContent = 'flex-start';
  textArea.style.overflow = 'auto';
  textArea.style.wordBreak = 'break-word';
}

function styleChoiceButton(btn) {
  btn.style.background = 'transparent';
  btn.style.border = 'none';
  btn.style.borderRadius = '0';
  btn.style.boxShadow = 'none';
  btn.style.setProperty('padding', '10px 12px', 'important');
  btn.style.setProperty('margin', '0', 'important');
  btn.style.width = '100%';
  btn.style.cursor = 'pointer';
  btn.style.fontWeight = '700';
  btn.style.fontSize = '0.95rem';
  btn.style.color = '#2d1b0d';
  btn.style.textAlign = 'center';
  btn.style.textShadow = '0 1px 2px rgba(255,255,255,0.5)';
}

function applyRelationshipDeltas(gameManager, checkpointReport, deltas) {
  const gm = gameManager || sharedGameManager;
  const relationshipSystem = gm?.systems?.relationshipSystem;
  const applied = [];
  (deltas || []).forEach(delta => {
    if (!delta?.fromId || !delta?.toId || !delta?.delta) return;
    if (relationshipSystem?.changeRelationship) {
      relationshipSystem.changeRelationship(delta.fromId, delta.toId, delta.delta);
    } else {
      gm.campLog = gm.campLog || [];
      gm.campLog.push({
        type: 'relationship_delta',
        day: gm.getCurrentDay?.() ?? gm.day ?? 1,
        timestamp: Date.now(),
        ...delta
      });
    }
    applied.push({ ...delta });
  });
  checkpointReport.relationshipDeltasApplied = applied;
  return applied;
}

function createAvatarBadge(survivor, gameManager) {
  const wrap = document.createElement('div');
  wrap.style.width = '24px';
  wrap.style.height = '24px';
  wrap.style.borderRadius = '50%';
  wrap.style.overflow = 'hidden';
  wrap.style.border = `2px solid ${resolveTribeColor(survivor, gameManager)}`;
  wrap.style.background = 'rgba(0,0,0,0.2)';
  wrap.style.boxShadow = '0 2px 6px rgba(0,0,0,0.35)';

  const img = document.createElement('img');
  img.src = getSurvivorAvatarSrc(survivor);
  img.alt = survivor?.firstName || 'Survivor';
  img.style.width = '100%';
  img.style.height = '100%';
  img.style.objectFit = 'cover';

  wrap.appendChild(img);
  return wrap;
}

function createPlaceholderBadge() {
  const placeholder = document.createElement('div');
  placeholder.textContent = '—';
  placeholder.style.width = '24px';
  placeholder.style.height = '24px';
  placeholder.style.borderRadius = '50%';
  placeholder.style.border = '2px dashed rgba(255,255,255,0.35)';
  placeholder.style.display = 'flex';
  placeholder.style.alignItems = 'center';
  placeholder.style.justifyContent = 'center';
  placeholder.style.color = '#f6e4c1';
  placeholder.style.fontWeight = '700';
  placeholder.style.opacity = '0.85';
  return placeholder;
}

function buildRoleRows(rolesPanel, tasks) {
  const map = new Map();
  rolesPanel.innerHTML = '';
  tasks.forEach(task => {
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.flexWrap = 'wrap';
    row.style.gap = '6px';

    const label = document.createElement('div');
    label.textContent = `${task.label.toUpperCase()}:`;
    label.style.minWidth = '0';
    label.style.maxWidth = '100%';
    label.style.fontWeight = '800';
    label.style.letterSpacing = '0.5px';
    label.style.wordBreak = 'break-word';

    const slot = document.createElement('div');
    slot.style.display = 'flex';
    slot.style.flexWrap = 'wrap';
    slot.style.gap = '5px';
    slot.style.maxWidth = '100%';

    row.appendChild(label);
    row.appendChild(slot);
    rolesPanel.appendChild(row);
    map.set(task.key, slot);
  });
  return map;
}

function renderRoleAssignments(roleSlots, revealedTasks, members, gameManager) {
  revealedTasks.forEach(task => {
    const slot = roleSlots.get(task.key);
    if (!slot) return;
    slot.innerHTML = '';
    if (!task.assignedIds.length) {
      slot.appendChild(createPlaceholderBadge());
      return;
    }
    task.assignedIds.forEach(id => {
      const survivor = members.find(m => m.id === id);
      if (survivor) {
        slot.appendChild(createAvatarBadge(survivor, gameManager));
      }
    });
    if (!slot.children.length) slot.appendChild(createPlaceholderBadge());
  });
}

function taskDefinitions(tribeSize = 6) {
  const woodCap = tribeSize === 9 ? 3 : 2;
  const resourcesCap = tribeSize === 9 ? 2 : 1;
  return [
    { key: 'fire', label: 'Fire Builder', cap: 1, assignedIds: [] },
    { key: 'shelter', label: 'Shelter Builder', cap: 2, assignedIds: [] },
    { key: 'wood', label: 'Wood Gatherer', cap: woodCap, assignedIds: [] },
    { key: 'resources', label: 'Resource Gatherer', cap: resourcesCap, assignedIds: [] },
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
  const taskList = Array.isArray(tasks) ? tasks : [];
  const fireAssignedCount = getTask(taskList, 'fire')?.assignedIds?.length ?? 0;
  const shelterAssignedCount = getTask(taskList, 'shelter')?.assignedIds?.length ?? 0;
  const woodAssignedCount = getTask(taskList, 'wood')?.assignedIds?.length ?? 0;
  const resourcesAssignedCount = getTask(taskList, 'resources')?.assignedIds?.length ?? 0;
  return {
    fire: fireAssignedCount >= 1,
    shelter: shelterAssignedCount >= 2,
    wood: woodAssignedCount >= 1,
    resources: resourcesAssignedCount >= 1
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
    case 'wood':
      return { key: choiceKey, posture: 'support/wood', preferredRole: 'wood', assertiveness: 60 };
    case 'resources':
      return { key: choiceKey, posture: 'support/resources', preferredRole: 'resources', assertiveness: 60 };
    case 'float':
      return { key: choiceKey, posture: 'float/flex', preferredRole: 'float', assertiveness: 20 };
    default:
      return { key: choiceKey, posture: 'float/flex', preferredRole: null, assertiveness: 25 };
  }
}

function groupBeatsByRole(assignments, members, playerId, describeLine, usedLines) {
  // Groups large clusters into combined narration and spotlights.
  const beats = [];
  const roleLabels = {
    fire: 'the fire build',
    shelter: 'the shelter build',
    wood: 'wood gathering',
    resources: 'resource gathering',
    float: 'a flexible stance'
  };
  const withReveal = (beat, roleKey, ids = []) => ({ ...beat, reveal: { roleKey, ids } });
  assignments.forEach(({ role, survivors }) => {
    const roleIds = survivors.map(s => s.id).filter(Boolean);
    if (survivors.length >= 3) {
      const names = formatIdsAsNameList(roleIds, members, playerId);
      const roleText = roleLabels[role] || role;
      beats.push(withReveal({ speaker: 'Narrator', text: `${names} all keep to ${roleText}. They cluster together before splitting up.` }, role, roleIds));
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

  const resourcesPool = [
    withQuote('You shoulder a woven bag.', `${name} shoulders a woven bag.`, 'I’ll get palms and coconuts. Back soon.'),
    withQuote('You scan the tide line.', `${name} scans the tide line.`, 'I’m on palms and coconuts. Don’t wait up.')
  ];

  const woodPool = [
    withQuote('You eye the tree line like a supply map.', `${name} eyes the tree line like a supply map.`, 'I’ll keep bamboo and firewood flowing.'),
    withQuote('You loosen your shoulders, ready to haul.', `${name} loosens their shoulders, ready to haul.`, 'Less talk, more wood. I’ve got it.')
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
    case 'resources':
      return pick(resourcesPool);
    case 'wood':
      return pick(woodPool);
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
  const overlayExists = typeof document !== 'undefined' && document.getElementById('day1-event-overlay');
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

export function runDay1FirstImpressionsPart2FromCheckpoint(gameManager, checkpointReport) {
  const gm = gameManager || sharedGameManager;
  const intent = checkpointReport?.uiIntent;
  if (!gm || !intent) {
    return Promise.resolve({ skipped: true, reason: 'no_intent' });
  }

  const tribe = gm.getPlayerTribe?.() || gm.playerTribe;
  if (!tribe) return Promise.resolve({ skipped: true, reason: 'missing_tribe' });

  gm.flags = gm.flags || {};
  if (gm.flags.campEventActive) {
    return Promise.resolve({ skipped: true, reason: 'camp_event_active' });
  }

  gm.flags.campEventActive = true;
  eventManager.publish(GameEvents.CAMP_EVENT_STARTED, { eventId: 'day1_first_impressions_part2', id: 'day1_first_impressions_part2' });

  const members = tribe.members || [];
  const resolution = resolvePlayerIdentity(gm, tribe, members);
  const playerId = resolution.playerId;

  const candidate = checkpointReport.drama.candidates?.[0] || {};
  const builder = members.find(m => m.id === (intent.builderId ?? candidate.builderId));
  const blamed = members.find(m => m.id === (intent.blamedId ?? candidate.blamedId));
  const builderName = displayName(builder, members, playerId);
  const blamedName = displayName(blamed, members, playerId);
  const missing = intent.missing || candidate.missing || {};
  const resourceNames = {
    bamboo: 'bamboo',
    firewood: 'firewood',
    palms: 'palms',
    coconuts: 'coconuts'
  };
  const missingResources = Object.keys(missing).filter(key => missing[key] > 0);
  const formatResourceList = resources => {
    if (!resources.length) return 'supplies';
    if (resources.length === 1) return resourceNames[resources[0]] || resources[0];
    if (resources.length === 2) return `${resourceNames[resources[0]] || resources[0]} and ${resourceNames[resources[1]] || resources[1]}`;
    const names = resources.map(resource => resourceNames[resource] || resource);
    return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
  };
  const missingSummary = formatResourceList(missingResources);

  const playerIsBuilder = playerId && String(intent.builderId ?? candidate.builderId) === String(playerId);
  const playerIsBlamed = playerId && String(intent.blamedId ?? candidate.blamedId) === String(playerId);

  const beats = [];
  if (intent.type === 'drama') {
    beats.push(
      { speaker: 'Narrator', text: 'About an hour in, the camp tempo hits a snag.' },
      {
        speaker: builderName,
        speakerId: builder?.id,
        speakerRef: builder,
        text: formatNarrationQuote(
          `${builderName} squares up, eyes on ${blamedName}.`,
          `${blamedName}, we needed ${missingSummary}. You were on it.`
        )
      },
      {
        speaker: 'Narrator',
        text: `${blamedName === 'You' ? 'All eyes swing your way.' : `${blamedName} stiffens.`} The air goes thin for a beat.`
      }
    );
  } else if (intent.type === 'builder_ready') {
    const buildMaterialText = intent.buildType === 'fire' ? 'firewood' : 'bamboo and palm';
    beats.push({
      speaker: 'Narrator',
      text: `${builderName} returns with enough ${buildMaterialText}. You can finally start the ${intent.buildType === 'fire' ? 'fire' : 'shelter frame'}.`
    });
  }

  const overlayEls = buildOverlay();
  const { overlay, templateImg, headerTileText, avatar, textArea, choices, nextBtn, contentArea } = overlayEls;

  let awaitingChoice = false;
  let choiceLocked = false;
  let currentIndex = 0;
  let choiceResult = null;

  const applyChoice = choiceKey => {
    const base = checkpointReport.relationshipDeltasProposed || [];
    const modified = base.map(delta => {
      let shift = 0;
      if (playerIsBuilder && String(delta.fromId) === String(playerId)) {
        if (choiceKey === 'callout') shift = -2;
        if (choiceKey === 'keep_cool') shift = 2;
        if (choiceKey === 'do_it') shift = 1;
      }
      if (playerIsBlamed && String(delta.toId) === String(playerId)) {
        if (choiceKey === 'apologetic') shift = 3;
        if (choiceKey === 'defensive') shift = -4;
        if (choiceKey === 'counter_accuse') shift = -6;
      }
      return { ...delta, delta: delta.delta + shift };
    });

    const extraDeltas = [];
    if (playerIsBlamed && builder?.id) {
      if (choiceKey === 'apologetic') {
        extraDeltas.push({ fromId: builder.id, toId: playerId, delta: 2, reason: 'apology_landed', tags: ['midpoint', 'apology'] });
      }
      if (choiceKey === 'defensive') {
        extraDeltas.push({ fromId: builder.id, toId: playerId, delta: -3, reason: 'defensive_pushback', tags: ['midpoint', 'defensive'] });
      }
      if (choiceKey === 'counter_accuse') {
        extraDeltas.push({ fromId: builder.id, toId: playerId, delta: -5, reason: 'counter_accusation', tags: ['midpoint', 'counter'] });
      }
    }

    const merged = [...modified, ...extraDeltas];
    checkpointReport.relationshipDeltasProposed = merged;
    applyRelationshipDeltas(gm, checkpointReport, merged);

    const choiceLogText = (() => {
      if (playerIsBuilder) {
        if (choiceKey === 'keep_cool') return `${builderName} cooled the temperature and pushed everyone back toward the ${missingSummary}.`;
        if (choiceKey === 'do_it') return `${builderName} decided to grab the ${missingSummary} alone, leaving a hush behind.`;
        return `${builderName} drew a hard line, calling ${blamedName} out over the missing ${missingSummary}.`;
      }
      if (choiceKey === 'apologetic') return `${blamedName} owned the miss on the ${missingSummary}, trying to steady the mood.`;
      if (choiceKey === 'defensive') return `${blamedName} bristled and pushed back on the blame for the ${missingSummary}.`;
      return `${blamedName} fired back, turning the blame over the missing ${missingSummary} toward ${builderName}.`;
    })();
    gm.campLog = gm.campLog || [];
    gm.campLog.push({
      type: 'day1_midpoint_choice',
      day: gm.getCurrentDay?.() ?? gm.day ?? 1,
      title: 'Midpoint Tension',
      text: choiceLogText,
      timestamp: Date.now(),
      data: {
        choiceKey,
        builderId: builder?.id,
        blamedId: blamed?.id,
        buildType: intent.buildType || candidate.buildType,
        missing: { ...missing }
      }
    });
  };

  const buildChoiceBeats = choiceKey => {
    if (playerIsBuilder) {
      if (choiceKey === 'callout') {
        return [
          { speaker: 'You', speakerId: playerId, speakerRef: builder, text: formatNarrationQuote('You hold the stare.', `${blamedName}, this is on you. We needed ${missingSummary}.`) },
          { speaker: 'Narrator', text: `${blamedName} shifts under the heat, and a few heads nod with you.` }
        ];
      }
      if (choiceKey === 'keep_cool') {
        return [
          { speaker: 'You', speakerId: playerId, speakerRef: builder, text: formatNarrationQuote('You lower your voice.', `We’re short on ${missingSummary}. Let’s fix it, not fight.`) },
          { speaker: 'Narrator', text: 'The edge softens, but the tension hangs like smoke.' }
        ];
      }
      return [
        { speaker: 'You', speakerId: playerId, speakerRef: builder, text: formatNarrationQuote('You exhale and grab your pack.', `I’ll go get the ${missingSummary} myself.`) },
        { speaker: 'Narrator', text: 'A few people exchange looks—impressed, but uneasy about the tone.' }
      ];
    }

    if (choiceKey === 'apologetic') {
      return [
        { speaker: 'You', speakerId: playerId, speakerRef: blamed, text: formatNarrationQuote('You own it before anyone else can.', `You’re right. I came up short on the ${missingSummary}. I’ll make it right.`) },
        { speaker: 'Narrator', text: `${builderName} studies you for a beat, then gives a short nod.` }
      ];
    }
    if (choiceKey === 'defensive') {
      return [
        { speaker: 'You', speakerId: playerId, speakerRef: blamed, text: formatNarrationQuote('You bristle, voice sharp.', `I didn’t have help. Don’t pin all of ${missingSummary} on me.`) },
        { speaker: 'Narrator', text: 'The circle tightens. A few survivors look away.' }
      ];
    }
    return [
      { speaker: 'You', speakerId: playerId, speakerRef: blamed, text: formatNarrationQuote('You snap back, eyes locked on the builder.', `Maybe if you actually checked the stockpile, you’d see why we’re short on ${missingSummary}.`) },
      { speaker: 'Narrator', text: `${builderName} stiffens, and the camp splits between staring and pretending not to.` }
    ];
  };

  if (intent.type === 'drama' && (playerIsBuilder || playerIsBlamed)) {
    beats.push({
      speaker: 'Narrator',
      type: 'choice',
      text: 'How do you handle it?',
      renderChoices: () => {
        choices.innerHTML = '';
        const options = playerIsBuilder
          ? [
              { key: 'callout', label: 'Call them out' },
              { key: 'keep_cool', label: 'Keep cool' },
              { key: 'do_it', label: 'Do it yourself' }
            ]
          : [
              { key: 'defensive', label: 'Defensive' },
              { key: 'apologetic', label: 'Apologetic' },
              { key: 'counter_accuse', label: 'Counter-accuse' }
            ];
        options.forEach(option => {
          const btn = document.createElement('button');
          btn.textContent = option.label;
          styleChoiceButton(btn);
          btn.addEventListener('click', () => {
            if (!awaitingChoice || choiceLocked) return;
            choiceLocked = true;
            choices.querySelectorAll('button').forEach(button => {
              button.disabled = true;
              button.style.opacity = '0.8';
              button.style.pointerEvents = 'none';
            });
            choiceResult = option.key;
            applyChoice(option.key);
            const inserted = buildChoiceBeats(option.key);
            if (inserted.length) {
              beats.splice(currentIndex + 1, 0, ...inserted);
            }
            awaitingChoice = false;
            currentIndex += 1;
            renderBeat();
          });
          choices.appendChild(btn);
        });
      }
    });
  }

  if (intent.type === 'drama') {
    beats.push({ speaker: 'Narrator', text: 'The work picks back up, but the mood has shifted.' });
  }

  const cleanup = () => {
    if (overlay) removeOverlay(overlay);
    try {
      eventManager.publish(GameEvents.DIALOGUE_HIDDEN);
    } catch (e) {
      logDebug('Failed to publish bare dialogue hidden event during checkpoint cleanup.', e);
    }
    try {
      eventManager.publish(GameEvents.DIALOGUE_HIDDEN, { source: 'day1-first-impressions-checkpoint' });
    } catch (e) {
      logDebug('Failed to publish dialogue hidden event during checkpoint cleanup.', e);
    }
  };

  const finish = () => {
    let cleanedUp = false;
    try {
      cleanup();
      cleanedUp = true;
      document.getElementById('day1-event-overlay')?.remove();
      gm.flags.campEventActive = false;
      eventManager.publish(GameEvents.CAMP_EVENT_ENDED, { eventId: 'day1_first_impressions_part2', id: 'day1_first_impressions_part2' });

      const campContainer = document?.getElementById('camp-screen');
      if (campContainer) {
        campContainer.style.pointerEvents = '';
      }
      const campContent = document?.getElementById('camp-content');
      if (campContent) {
        campContent.style.pointerEvents = '';
      }

      if (typeof window?.refreshMenuCard === 'function') {
        window.refreshMenuCard();
      }
      const campScreen = window?.campScreen;
      campScreen?.refreshHUD?.();
      campScreen?.updateHUD?.();
      gm.saveGame?.();
    } finally {
      if (!cleanedUp) {
        cleanup();
      }
      gm.flags.campEventActive = false;
    }
  };

  const renderBeat = () => {
    const beat = beats[currentIndex];
    if (!beat) return;
    const speakerSurvivor = resolveSpeakerSurvivor(beat, members);
    const isNarratorBeat = !speakerSurvivor && (beat.speaker === 'Narrator' || !beat.speakerId);
    if (isNarratorBeat) {
      setNarratorBeatUI({ templateImg, headerTileText, avatarEl: avatar });
    } else {
      const speakerColor = resolveTribeColor(speakerSurvivor, gm);
      setSpeakerBeatUI({ templateImg, headerTileText, avatarEl: avatar, survivor: speakerSurvivor, tribeColor: speakerColor });
    }
    applyBeatModeStyles({ textArea, contentArea });
    textArea.textContent = beat.text || '';
    if (beat.type === 'choice') {
      awaitingChoice = true;
      choices.style.display = 'flex';
      nextBtn.style.display = 'none';
      beat.renderChoices?.();
    } else {
      awaitingChoice = false;
      choices.style.display = 'none';
      nextBtn.style.display = 'inline-block';
      nextBtn.textContent = currentIndex === beats.length - 1 ? 'Continue' : 'Next';
    }
  };

  nextBtn.addEventListener('click', () => {
    if (awaitingChoice) return;
    if (currentIndex >= beats.length - 1) {
      if (!checkpointReport.relationshipDeltasApplied?.length && !choiceResult) {
        applyRelationshipDeltas(gm, checkpointReport, checkpointReport.relationshipDeltasProposed);
      }
      finish();
      return;
    }
    currentIndex += 1;
    renderBeat();
  });

  renderBeat();
  return Promise.resolve({ started: true });
}

export function runPart2FromCheckpointReport(report) {
  return runDay1FirstImpressionsPart2FromCheckpoint(sharedGameManager, report);
}

// Ensures core coverage happens before mass floating.
function enforceMinimumCoverage(tasks, members, player, playerIntent, leaderIds = []) {
  const coverageOrder = [
    { key: 'fire', need: 1 },
    { key: 'shelter', need: 2 },
    { key: 'wood', need: 1 },
    { key: 'resources', need: 1 }
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
  const beforeCoverageFloats = coverageMet.fire && coverageMet.shelter && coverageMet.wood && coverageMet.resources ? Infinity : 1;

  // Remove excess floaters before coverage.
  if (!coverageMet.fire || !coverageMet.shelter || !coverageMet.wood || !coverageMet.resources) {
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

function resolvePlayerRole(tasks = [], player) {
  if (!player?.id) return 'Float';
  const playerTask = tasks.find(t => (t.assignedIds || []).includes(player.id));
  return playerTask ? playerTask.label : 'Float';
}

function getRoleLabel(roleKey) {
  const normalizedKey = normalizeRoleKey(roleKey);
  const labels = {
    fire: 'Fire Builder',
    shelter: 'Shelter Builder',
    wood: 'Wood Gatherer',
    resources: 'Resource Gatherer',
    float: 'Float'
  };
  return labels[normalizedKey] || normalizedKey || '';
}

function formatTaskSummaryTitle(title) {
  if (!title) return '';
  const trimmed = String(title).trim().replace(/\.$/, '');
  const lower = trimmed.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

function buildRoleTaskSummary({ tribe, roleKey, phaseId }) {
  const normalizedKey = normalizeRoleKey(roleKey);
  const fallback = {
    fire: 'Build fire once enough firewood is gathered',
    shelter: 'Build shelter once materials are gathered',
    wood: 'Gather 5 bamboo and gather 10 firewood',
    resources: 'Gather 3 coconuts and gather 1 palm',
    float: 'Assist the tribe where needed'
  };

  const stateTasks = tribe?.taskState?.tasks || [];
  const roleTasks = stateTasks.filter(task => task.role === normalizedKey && task.deadline === 'phase' && (!phaseId || task.phaseId === phaseId));
  const titles = roleTasks.map(task => task.title || task.description).filter(Boolean);
  if (!titles.length) return fallback[normalizedKey] || '';

  const formatted = titles.map(formatTaskSummaryTitle).filter(Boolean);
  if (!formatted.length) return fallback[normalizedKey] || '';
  return formatted.join(' and ');
}

function buildRecapSections(player, members, tasks, leadership, chemistryMoments, closingMood, playerChoiceKey, roleTaskSummary) {
  const roleAssignments = key => {
    const task = getTask(tasks, key) || { assignedIds: [] };
    return formatIdsAsNameList(task.assignedIds, members, player.id) || 'None';
  };
  const normalizedChoiceKey = normalizeRoleKey(playerChoiceKey);
  const choiceLabel = normalizedChoiceKey ? (getTask(tasks, normalizedChoiceKey)?.label || getRoleLabel(normalizedChoiceKey)) : '';

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

  const playerRole = resolvePlayerRole(tasks, player);
  const taskLine = roleTaskSummary ? `• Your task: ${roleTaskSummary}.` : null;

  return {
    leadership: [`• ${leadershipLines[0]}`, clashLine],
    assignments: [
      `• Fire: ${roleAssignments('fire')}`,
      `• Shelter: ${roleAssignments('shelter')}`,
      `• Wood: ${roleAssignments('wood')}`,
      `• Resources: ${roleAssignments('resources')}`,
      `• Float: ${roleAssignments('float')}`
    ],
    chemistry: chemistryLines,
    tone: [`• ${toneLine}`],
    yourRole: [`• You end up on ${playerRole}${choiceLabel ? ` (you chose ${choiceLabel})` : ''}.`, taskLine].filter(Boolean),
    playerRole
  };
}

function buildRecapText(player, members, tasks, leadership, chemistryMoments, closingMood, playerChoiceKey, roleTaskSummary) {
  const sections = buildRecapSections(player, members, tasks, leadership, chemistryMoments, closingMood, playerChoiceKey, roleTaskSummary);
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

function buildRecapHtml(player, members, tasks, leadership, chemistryMoments, closingMood, playerChoiceKey, roleTaskSummary) {
  const sections = buildRecapSections(player, members, tasks, leadership, chemistryMoments, closingMood, playerChoiceKey, roleTaskSummary);
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
    { label: 'Fire Builder', ids: getTask(tasks, 'fire')?.assignedIds || [] },
    { label: 'Shelter Builder', ids: getTask(tasks, 'shelter')?.assignedIds || [] },
    { label: 'Wood Gatherer', ids: getTask(tasks, 'wood')?.assignedIds || [] },
    { label: 'Resource Gatherer', ids: getTask(tasks, 'resources')?.assignedIds || [] },
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
function buildFinalizeBeat({ player, members, tasks, leadership, chemistryMoments, closingMood, playerChoiceKey, overlay, resolve, gameManager, cleanup, revealAllAssignments, finishEvent }) {
  const chemistryMomentsDetailed = chemistryMoments.map(m => ({
    type: m.type,
    pair: m.pair,
    pairIds: m.pair.map(p => p.id),
    delta: m.delta || 0,
    tag: m.tag
  }));
  const chemistryMomentsCompact = chemistryMomentsDetailed.map(({ type, pairIds, delta, tag }) => ({ type, pairIds, delta, tag }));
  let finalized = false;

  const finalizeBeat = {
    speaker: 'Narrator',
    type: 'finalize',
    text: '',
    htmlText: null,
    onEnter() {
      if (typeof revealAllAssignments === 'function') revealAllAssignments();
      const ensurePlayerLockedOnce = () => {
        const pid = player?.id;
        if (!pid) return;
        const normalizedChoiceKey = normalizeRoleKey(playerChoiceKey);
        const desiredKey = ['fire', 'shelter', 'wood', 'resources', 'float'].includes(normalizedChoiceKey)
          ? normalizedChoiceKey
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
      const tribe = gameManager.playerTribe || gameManager.getPlayerTribe?.();
      gameManager.playerTribe = tribe;

      gameManager.flags = gameManager.flags || {};
      gameManager.campLog = gameManager.campLog || [];

      // eslint-disable-next-line no-console
      console.error('[Day1Finalize] onEnter sanity', { hasTribe: !!gameManager.playerTribe, hasFlags: !!gameManager.flags, day: gameManager.day });

      if (!gameManager.playerTribe) throw new Error('Finalize failed: missing gameManager.playerTribe');

      const normalizedPlayerChoiceKey = normalizeRoleKey(playerChoiceKey);
      const playerRole = resolvePlayerRole(tasks, player);
      const playerRoleKey = normalizeRoleKey(tasks.find(t => (t.assignedIds || []).includes(player?.id))?.key || 'float');
      const plan = {
        leaderId: leadership.topLeader?.id,
        runnerUpId: leadership.runnerUp?.id,
        fireIds: getTask(tasks, 'fire').assignedIds,
        shelterIds: getTask(tasks, 'shelter').assignedIds,
        woodIds: getTask(tasks, 'wood').assignedIds,
        resourcesIds: getTask(tasks, 'resources').assignedIds,
        floatIds: getTask(tasks, 'float').assignedIds,
        floaterIds: getTask(tasks, 'float').assignedIds,
        assignments: {
          fire: getTask(tasks, 'fire').assignedIds,
          shelter: getTask(tasks, 'shelter').assignedIds,
          wood: getTask(tasks, 'wood').assignedIds,
          resources: getTask(tasks, 'resources').assignedIds,
          float: getTask(tasks, 'float').assignedIds
        },
        chemistryMoments: chemistryMomentsCompact,
        leadershipScenario: leadership.scenario,
        mood: closingMood,
        choice: normalizedPlayerChoiceKey,
        playerId: player?.id,
        playerRole,
        playerChoice: normalizedPlayerChoiceKey
      };

      tribe.day1Plan = plan;
      tribe.day1PlanCreated = true;
      tribe.day1Mood = closingMood;
      tribe.day1Choice = normalizedPlayerChoiceKey;
      gameManager.flags.day1FirstImpressionsDone = true;
      gameManager.flags.day1FirstImpressionsCompleted = true;

      const phaseId = gameManager.taskSystem?.getCurrentPhaseId?.(gameManager) ?? gameManager.getCurrentCampPhaseId?.();
      gameManager.taskSystem?.startPhaseForTribe?.(tribe, phaseId);
      gameManager.taskSystem?.createDay1TasksFromPlan?.(tribe, phaseId);
      const roleTaskSummary = buildRoleTaskSummary({ tribe, roleKey: playerRoleKey, phaseId });

      const recapHtml = buildRecapHtml(player, members, tasks, leadership, chemistryMoments, closingMood, normalizedPlayerChoiceKey, roleTaskSummary);
      const recapText = buildRecapText(player, members, tasks, leadership, chemistryMoments, closingMood, normalizedPlayerChoiceKey, roleTaskSummary);
      const assignmentsByRole = {
        fire: getTask(tasks, 'fire').assignedIds,
        shelter: getTask(tasks, 'shelter').assignedIds,
        wood: getTask(tasks, 'wood').assignedIds,
        resources: getTask(tasks, 'resources').assignedIds,
        float: getTask(tasks, 'float').assignedIds
      };

      const summaryContainer = overlay?.querySelector('#day1-text') || document.getElementById('day1-text');
      if (summaryContainer) {
        summaryContainer.innerHTML = '';
        if (recapHtml?.element) {
          summaryContainer.appendChild(recapHtml.element);
        } else if (recapHtml?.htmlString) {
          summaryContainer.innerHTML = recapHtml.htmlString;
        }
      }

      finalizeBeat.text = recapText;
      finalizeBeat.htmlText = recapHtml?.element || null;

      const summaryPayload = {
        mood: closingMood,
        leadershipScenario: leadership.scenario,
        leaderId: leadership.topLeader?.id,
        runnerUpId: leadership.runnerUp?.id,
        playerId: player?.id,
        playerRole,
        playerChoiceKey: normalizedPlayerChoiceKey,
        assignmentsByRole,
        chemistryMoments: chemistryMomentsCompact,
        chemistryMomentsDetailed,
        tribeId: gameManager.playerTribe?.id,
        tone: closingMood,
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
          playerChoiceKey: normalizedPlayerChoiceKey,
          playerRole,
          runnerUpId: leadership.runnerUp?.id,
          playerId: player?.id,
          assignments: {
            fire: plan.fireIds,
            shelter: plan.shelterIds,
            wood: plan.woodIds,
            resources: plan.resourcesIds,
            float: plan.floatIds
          },
          assignmentsByRole,
          chemistryMoments: chemistryMomentsCompact,
          tone: closingMood,
          mood: closingMood,
          summaryText: recapText,
          summaryHtml: recapHtml.htmlString,
          day1FirstImpressions: summaryPayload
        },
        isCinematicEventSummary: true
      };

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
      finishEvent({ plan: gameManager.playerTribe.day1Plan });
    }
  };

  return finalizeBeat;
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

  const woodTask = getTask(tasks, 'wood');
  const floatTask = getTask(tasks, 'float');
  if (woodTask.assignedIds.length && floatTask.assignedIds.length) {
    const worker = members.find(m => m.id === woodTask.assignedIds[0]);
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
  const tribeAccentColor = playerTribe?.color || '#c17f34';
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
    let overlay;
    let nextBtn;
    let nextBtnHandler;
    let templateImg;
    let headerTileText;
    let avatar;
    let textArea;
    let choices;
    let rolesPanel;
    let contentArea;
    let roleSlots;
    let awaitingChoice = { value: false };
    let beatQueue = [];
    let currentIndex = 0;
    let finalizeRendered = false;
    let finalizeBeat;
    let renderBeatUI;
    let ensureFinalizeBeat;
    const cleanup = () => {
      if (nextBtn && nextBtnHandler) nextBtn.removeEventListener('click', nextBtnHandler);
      if (overlay) removeOverlay(overlay);
      assignmentStatusUpdater = null;
      try {
        eventManager.publish(GameEvents.DIALOGUE_HIDDEN);
      } catch (e) {
        logDebug('Failed to publish bare dialogue hidden event during cleanup.', e);
      }
      try {
        eventManager.publish(GameEvents.DIALOGUE_HIDDEN, { source: 'day1-first-impressions' });
      } catch (e) {
        logDebug('Failed to publish dialogue hidden event during cleanup.', e);
      }
    };

    const finishEvent = (payload = {}) => {
      if (finished) return;
      finished = true;
      try {
        if (nextBtn) {
          nextBtn.disabled = true;
          if (nextBtnHandler) nextBtn.removeEventListener('click', nextBtnHandler);
        }
        gm.flags = gm.flags || {};
        gm.flags.campEventActive = false;
        cleanup?.();

        // Hand control back to the CampScreen clock so the UI countdown resumes.
        const campScreen = context?.campScreen || window.campScreen;
        if (campScreen) {
          campScreen.clockRunning = false;
          campScreen.startDayClockTimer?.();
        }

        const completed = !payload?.error;
        gm.flags.day1FirstImpressionsCompleted = completed;
        gm.flags.day1FirstImpressionsDone = completed;

        const tribe = gm.getPlayerTribe?.() || gm.playerTribe;
        const phaseId = gm.taskSystem?.getCurrentPhaseId?.() ?? gm.getCurrentCampPhaseId?.();
        gm.taskSystem?.startPhaseForTribe?.(tribe, phaseId);
        gm.taskSystem?.createDay1TasksFromPlan?.(tribe, phaseId, { force: true });
      } catch (error) {
        console.error('[Day1FirstImpressions] Error during finishEvent', error);
      } finally {
        console.info('[Day1FirstImpressions] Event finished');
        eventManager.publish(GameEvents.CAMP_EVENT_ENDED, { eventId: 'day1_first_impressions', id: 'day1_first_impressions' });
        resolve(payload);
      }
    };

    const requestFinishEvent = (payload = {}) => {
      if (finished) return;
      if (finalizeRendered) {
        finishEvent(payload);
        return;
      }

      // eslint-disable-next-line no-console
      console.warn('[Day1FirstImpressions] Finish requested before finalize rendered', payload);
      if (typeof ensureFinalizeBeat !== 'function' || typeof renderBeatUI !== 'function') {
        finishEvent(payload);
        return;
      }
      const finalizeIndex = ensureFinalizeBeat('finish_request_guard');
      currentIndex = finalizeIndex;
      renderBeatUI();
    };

    const showBlockingError = (message, meta = {}) => {
      logDebug('fatal_error', { message, meta });
      if (!overlay) {
        const overlayEls = buildOverlay();
        overlay = overlayEls.overlay;
        templateImg = overlayEls.templateImg;
        headerTileText = overlayEls.headerTileText;
        avatar = overlayEls.avatar;
        textArea = overlayEls.textArea;
        choices = overlayEls.choices;
        nextBtn = overlayEls.nextBtn;
        rolesPanel = overlayEls.rolesPanel;
        contentArea = overlayEls.contentArea;
      }
      if (nextBtn && nextBtnHandler) nextBtn.removeEventListener('click', nextBtnHandler);
      awaitingChoice.value = false;
      if (choices) choices.style.display = 'none';
      if (nextBtn) nextBtn.style.display = 'inline-block';
      if (nextBtn) nextBtn.textContent = 'Close';
      if (rolesPanel) rolesPanel.innerHTML = '';
      if (templateImg && headerTileText && avatar) setNarratorBeatUI({ templateImg, headerTileText, avatarEl: avatar });
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
      templateImg = overlayEls.templateImg;
      headerTileText = overlayEls.headerTileText;
      avatar = overlayEls.avatar;
      textArea = overlayEls.textArea;
      choices = overlayEls.choices;
      rolesPanel = overlayEls.rolesPanel;
      contentArea = overlayEls.contentArea;
      const usedLines = new Set();

      const tasks = taskDefinitions(tribeSize);
      const revealedTasks = taskDefinitions(tribeSize).map(t => ({ ...t, assignedIds: [] }));
      roleSlots = buildRoleRows(rolesPanel, revealedTasks);
      if (avatar) {
        avatar.style.borderColor = tribeAccentColor;
      }
      const leadership = resolveLeadershipScenario(members, PLAYER);
      awaitingChoice = { value: false };
      let choiceLocked = false;
      let chemistryMoments = [];
      let playerChoiceKey = null;
      let closingMood = 'tentative';

      if (!PLAYER) {
        showBlockingError('Internal error: could not identify the player.', { resolution });
        return;
      }

      const updateStatusLine = () => {
        if (!rolesPanel || !roleSlots) return;
        renderRoleAssignments(roleSlots, revealedTasks, members, gm);
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

      const renderedLogIndices = new Set();
      const logRender = (beat) => {
        if (renderedLogIndices.has(currentIndex)) return;
        renderedLogIndices.add(currentIndex);
        // eslint-disable-next-line no-console
        console.info('[Day1FirstImpressions] Render beat', { index: currentIndex, type: beat?.type });
      };

      ensureFinalizeBeat = (reason = 'auto') => {
        const existingIndexes = beatQueue.reduce((acc, beat, idx) => (beat?.type === 'finalize' ? [...acc, idx] : acc), []);
        if (existingIndexes.length === 0) {
          finalizeBeat = finalizeBeat || buildFinalizeBeat({
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
          beatQueue.push(finalizeBeat);
          // eslint-disable-next-line no-console
          console.info('[Day1FirstImpressions] Finalize beat appended', { reason, queueLength: beatQueue.length });
          return beatQueue.length - 1;
        }

        const lastIndex = existingIndexes[existingIndexes.length - 1];
        finalizeBeat = beatQueue[lastIndex] || finalizeBeat;
        const extraIndexes = existingIndexes.slice(0, -1);
        for (let i = extraIndexes.length - 1; i >= 0; i -= 1) {
          beatQueue.splice(extraIndexes[i], 1);
        }
        const finalIndex = beatQueue.findIndex(b => b?.type === 'finalize');
        if (finalIndex !== beatQueue.length - 1) {
          const [beat] = beatQueue.splice(finalIndex, 1);
          beatQueue.push(beat);
          // eslint-disable-next-line no-console
          console.info('[Day1FirstImpressions] Finalize beat moved to end', { reason, queueLength: beatQueue.length });
          return beatQueue.length - 1;
        }
        return finalIndex;
      };

      renderBeatUI = () => {
        const beat = beatQueue[currentIndex];
        if (!beat) return;
        if (beat.type === 'finalize') {
          // eslint-disable-next-line no-console
          console.info('[Day1FirstImpressions] Rendering finalize beat', { index: currentIndex, queueLen: beatQueue.length });
        }
        const speakerSurvivor = resolveSpeakerSurvivor(beat, members);
        const isNarratorBeat = !speakerSurvivor && (beat.speaker === 'Narrator' || !beat.speakerId);
        if (isNarratorBeat) {
          setNarratorBeatUI({ templateImg, headerTileText, avatarEl: avatar });
        } else {
          const speakerColor = resolveTribeColor(speakerSurvivor, gm, tribeAccentColor);
          setSpeakerBeatUI({ templateImg, headerTileText, avatarEl: avatar, survivor: speakerSurvivor, tribeColor: speakerColor });
        }
        if (beat.type === 'finalize') {
          applySummaryModeStyles({ textArea, contentArea });
        } else {
          applyBeatModeStyles({ textArea, contentArea });
        }
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
        if (beat.reveal) revealRoleGroup(beat.reveal.roleKey, beat.reveal.ids);
        try {
          if (beat.onEnter) beat.onEnter();
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error('[Day1FirstImpressions] beat.onEnter failed', { index: currentIndex, type: beat?.type, err });
          showBlockingError('Day 1 summary failed to load due to an internal error.', { reason: 'finalize_onEnter_failed', err });
          return;
        }
        if (beat.type === 'finalize') finalizeRendered = true;
        updateStatusLine();
        logRender(beat);
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

      let resetChoiceButtons = null;

      const addChoiceBeat = () => {
        awaitingChoice.value = true;
        const beat = {
          speaker: 'Narrator',
          type: 'choice',
          text: 'Where do you plant your flag?',
          renderChoices: () => {
            choices.innerHTML = '';
            const setChoiceButtonsDisabled = isDisabled => {
              choices.querySelectorAll('button').forEach(b => {
                b.disabled = isDisabled;
                b.style.opacity = isDisabled ? '0.8' : '1';
                b.style.pointerEvents = isDisabled ? 'none' : 'auto';
              });
            };
            const options = [
              { key: 'fire', label: 'Fire Builder' },
              { key: 'shelter', label: 'Shelter Builder' },
              { key: 'wood', label: 'Wood Gatherer' },
              { key: 'resources', label: 'Resource Gatherer' },
              { key: 'float', label: 'Float' }
            ];
            logDebug('renderChoices', { options: options.map(o => o.key) });
            options.forEach(option => {
              const btn = document.createElement('button');
              btn.textContent = option.label;
              styleChoiceButton(btn);
              btn.addEventListener('click', () => {
                if (!awaitingChoice.value || choiceLocked) return;
                choiceLocked = true;
                logDebug('choice_clicked', { key: option.key });
                setChoiceButtonsDisabled(true);
                commitChoice(option.key, option.label);
              });
              choices.appendChild(btn);
            });
            resetChoiceButtons = () => setChoiceButtonsDisabled(false);
          }
        };
        addBeat(beat);
      };

      const applyPlayerChoice = choiceKey => {
        const normalizedChoiceKey = normalizeRoleKey(choiceKey);
        logDebug('applyPlayerChoice_enter', { choiceKey, normalizedChoiceKey });
        // Reset assignments to keep the function idempotent if triggered twice.
        tasks.forEach(task => {
          task.assignedIds = [];
        });

        const intent = playerIntentFromChoice(normalizedChoiceKey);
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
        const normalizedChoiceKey = normalizeRoleKey(choiceKey);
        logDebug('commitChoice_enter', { choiceKey, normalizedChoiceKey, awaiting: awaitingChoice.value });
        if (!awaitingChoice.value && !choiceLocked) return;

        try {
          playerChoiceKey = normalizedChoiceKey;
          const intent = applyPlayerChoice(normalizedChoiceKey);
          const choiceBeat = { speaker: 'Narrator', text: `You claim: ${label || normalizedChoiceKey}.` };
          const beats = [
            choiceBeat,
            ...buildAssignmentBeats(intent),
            ...addChemistryBeats(),
            ...addClosingBeat(),
            buildFinalizeBeat({ player: PLAYER, members, tasks, leadership, chemistryMoments, closingMood, playerChoiceKey: normalizedChoiceKey, overlay, resolve, gameManager: gm, cleanup, revealAllAssignments, finishEvent: requestFinishEvent })
          ];
          logDebug('commitChoice_inserting_beats', { insertAt: currentIndex + 1, count: beats.length });
          beatQueue.splice(currentIndex + 1, 0, ...beats);
          ensureFinalizeBeat('commit_choice');
          awaitingChoice.value = false;
          currentIndex += 1;
          renderBeatUI();
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error('[Day1FirstImpressions] commitChoice failed', err);
          if (err?.stack) {
            // eslint-disable-next-line no-console
            console.error('[Day1FirstImpressions] commitChoice stack', err.stack);
          }
          awaitingChoice.value = true;
          choiceLocked = false;
          if (typeof resetChoiceButtons === 'function') resetChoiceButtons();
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
            const roleLabel = target?.label ? target.label.toLowerCase() : intent.preferredRole;
            beats.push({ speaker: 'You', speakerId: PLAYER_ID, speakerRef: PLAYER, text: formatNarrationQuote('You keep your tone steady.', `We need two hands on ${roleLabel}. I’m in.`) });
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
        const coverageMet = coverageState.fire && coverageState.shelter && coverageState.wood && coverageState.resources;
        const ids = tasks.flatMap(t => t.assignedIds);
        const scores = ids.map(id => buildCapabilities(members.find(m => m.id === id)).workEthic);
        const averageWork = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 50;
        closingMood = (clarityScore && frictionCount === 0 && averageWork > 55 && coverageMet) ? 'confident' : (frictionCount >= 1 || leadership.scenario === 'contested') ? 'chaotic' : 'tentative';

        return [{ speaker: 'Narrator', text: closingMood === 'confident' ? 'The plan feels solid. People break with purpose.' : closingMood === 'chaotic' ? 'Energy stays jagged, but everyone moves before another argument sparks.' : 'Assignments exist, but eyes stay watchful to see if they hold.' }];
      };

      buildLeadershipBeats().forEach(addBeat);
      addChoiceBeat();
      ensureFinalizeBeat('initial_queue');

      nextBtnHandler = () => {
        try {
          const beat = beatQueue[currentIndex];

          if (awaitingChoice.value) return;

          if (currentIndex < beatQueue.length - 1) {
            currentIndex += 1;
            renderBeatUI();
            return;
          }

          const lastBeat = beatQueue[beatQueue.length - 1];
          if (!lastBeat || lastBeat.type !== 'finalize') {
            const finalizeIndex = ensureFinalizeBeat('next_at_end');
            currentIndex = finalizeIndex;
            renderBeatUI();
            return;
          }

          if (beat?.type !== 'finalize') {
            currentIndex = beatQueue.length - 1;
            renderBeatUI();
            return;
          }

          try {
            if (beat.onComplete) beat.onComplete();
            else requestFinishEvent({ plan: gm.playerTribe?.day1Plan });
          } finally {
            if (!finished) requestFinishEvent({ plan: gm.playerTribe?.day1Plan, meta: { reason: 'finalize_guard' } });
          }
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error('[Day1FirstImpressions] next button failed', err);
          showBlockingError('Something went wrong advancing the event.', { reason: 'next_handler_failed', err });
          return;
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
