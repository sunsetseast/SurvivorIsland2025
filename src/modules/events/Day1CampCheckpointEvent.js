import eventManager, { GameEvents } from '../core/EventManager.js';
import { gameManager as sharedGameManager } from '../core/index.js';
import { getSurvivorAvatarSrc } from '../ui/JourneyBeatUI.js';
import { getAvatarPresentation } from './Day1CampSetupUI.js';
import { day1DisplayName, resolveDay1Player, sameDay1Id } from './Day1CampPlayer.js';

const EVENT_ID = 'day1_first_impressions_part2';

function formatMissingResources(missing = {}) {
  const names = Object.entries(missing)
    .filter(([, amount]) => Number(amount) > 0)
    .map(([resource]) => resource === 'coconuts' ? 'coconuts' : resource);
  if (!names.length) return 'supplies';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')}, and ${names.at(-1)}`;
}

function applyRelationshipDeltas(gameManager, report, deltas = []) {
  const relationships = gameManager?.systems?.relationshipSystem;
  const applied = [];
  deltas.forEach(delta => {
    if (delta?.fromId == null || delta?.toId == null || !Number(delta?.delta)) return;
    if (relationships?.changeRelationship) {
      relationships.changeRelationship(delta.fromId, delta.toId, delta.delta);
    } else {
      gameManager.campLog = gameManager.campLog || [];
      gameManager.campLog.push({
        type: 'relationship_delta',
        day: gameManager.getCurrentDay?.() ?? gameManager.day ?? 1,
        timestamp: Date.now(),
        ...delta
      });
    }
    applied.push({ ...delta });
  });
  report.relationshipDeltasApplied = applied;
  return applied;
}

function choiceOptions(playerIsBuilder) {
  return playerIsBuilder
    ? [
        { key: 'callout', label: 'Call them out' },
        { key: 'keep_cool', label: 'Keep camp moving' },
        { key: 'do_it', label: 'Handle it yourself' }
      ]
    : [
        { key: 'apologetic', label: 'Own the miss' },
        { key: 'defensive', label: 'Push back' },
        { key: 'counter_accuse', label: 'Turn it around' }
      ];
}

function choiceLine({ choiceKey, playerIsBuilder, builderName, blamedName, missingSummary }) {
  if (playerIsBuilder) {
    if (choiceKey === 'keep_cool') return `We’re short on ${missingSummary}. Let’s fix it, not fight.`;
    if (choiceKey === 'do_it') return `I’ll get the ${missingSummary}. Keep the build moving.`;
    return `${blamedName}, we needed ${missingSummary}. That was your job.`;
  }
  if (choiceKey === 'apologetic') return `You’re right. I missed the ${missingSummary}. I’ll fix it.`;
  if (choiceKey === 'defensive') return `I had no help. Don’t put all of this on me.`;
  return `${builderName}, check the stockpile before you blame me.`;
}

function adjustDeltas(report, { choiceKey, playerId, builder, blamed, playerIsBuilder, playerIsBlamed }) {
  const modified = (report.relationshipDeltasProposed || []).map(delta => {
    let shift = 0;
    if (playerIsBuilder && sameDay1Id(delta.fromId, playerId)) {
      if (choiceKey === 'callout') shift = -2;
      if (choiceKey === 'keep_cool') shift = 2;
      if (choiceKey === 'do_it') shift = 1;
    }
    if (playerIsBlamed && sameDay1Id(delta.toId, playerId)) {
      if (choiceKey === 'apologetic') shift = 3;
      if (choiceKey === 'defensive') shift = -4;
      if (choiceKey === 'counter_accuse') shift = -6;
    }
    return { ...delta, delta: delta.delta + shift };
  });
  if (playerIsBlamed && builder?.id != null) {
    const extra = {
      apologetic: { delta: 2, reason: 'apology_landed' },
      defensive: { delta: -3, reason: 'defensive_pushback' },
      counter_accuse: { delta: -5, reason: 'counter_accusation' }
    }[choiceKey];
    if (extra) modified.push({ fromId: builder.id, toId: blamed.id, ...extra, tags: ['midpoint', choiceKey] });
  }
  report.relationshipDeltasProposed = modified;
  return modified;
}

function createCheckpointOverlay({ speaker, heading, line, options = [] }) {
  document.getElementById('day1-checkpoint-overlay')?.remove();
  const overlay = document.createElement('section');
  overlay.id = 'day1-checkpoint-overlay';
  overlay.className = 'day1-checkpoint';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'day1-checkpoint-heading');
  const presentation = getAvatarPresentation(speaker);
  overlay.innerHTML = `
    <div class="day1-checkpoint__card">
      <span class="day1-checkpoint__eyebrow">DAY 1 · CAMP CHECK-IN</span>
      <div class="day1-checkpoint__speaker">
        <span class="day1-checkpoint__portrait-crop">
          <img class="day1-checkpoint__portrait" alt="" />
        </span>
        <div>
          <strong id="day1-checkpoint-heading"></strong>
          <p></p>
        </div>
      </div>
      <div class="day1-checkpoint__choices"></div>
    </div>`;
  const img = overlay.querySelector('.day1-checkpoint__portrait');
  img.src = getSurvivorAvatarSrc(speaker);
  img.alt = `${speaker?.firstName || speaker?.name || 'Survivor'} portrait`;
  img.style.objectPosition = presentation.position;
  img.style.setProperty('--avatar-scale', presentation.scale);
  img.addEventListener('error', () => { img.src = 'Assets/logo.png'; }, { once: true });
  overlay.querySelector('#day1-checkpoint-heading').textContent = heading;
  overlay.querySelector('p').textContent = line;
  const choices = overlay.querySelector('.day1-checkpoint__choices');
  options.forEach(option => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.choice = option.key;
    button.textContent = option.label;
    choices.appendChild(button);
  });
  document.body.appendChild(overlay);
  return overlay;
}

export function runDay1FirstImpressionsPart2FromCheckpoint(gameManager, checkpointReport) {
  const gm = gameManager || sharedGameManager;
  const intent = checkpointReport?.uiIntent;
  const tribe = gm?.getPlayerTribe?.() || gm?.playerTribe;
  if (!gm || !intent) return Promise.resolve({ skipped: true, reason: 'no_intent' });
  if (!tribe) return Promise.resolve({ skipped: true, reason: 'missing_tribe' });
  gm.flags = gm.flags || {};
  if (gm.flags.campEventActive) return Promise.resolve({ skipped: true, reason: 'camp_event_active' });

  const members = tribe.members || [];
  const player = resolveDay1Player(gm, tribe);
  const playerId = player?.id;
  const candidate = checkpointReport.drama?.candidates?.[0] || {};
  const builderId = intent.builderId ?? candidate.builderId;
  const blamedId = intent.blamedId ?? candidate.blamedId;
  const builder = members.find(member => sameDay1Id(member.id, builderId)) || null;
  const blamed = members.find(member => sameDay1Id(member.id, blamedId)) || null;
  const playerIsBuilder = sameDay1Id(playerId, builderId);
  const playerIsBlamed = sameDay1Id(playerId, blamedId);
  const builderName = day1DisplayName(builder, playerId);
  const blamedName = day1DisplayName(blamed, playerId);
  const missing = intent.missing || candidate.missing || {};
  const missingSummary = formatMissingResources(missing);
  const isDrama = intent.type === 'drama';
  const speaker = builder || blamed || player || members[0];
  const openingLine = isDrama
    ? `${blamedName}, we needed ${missingSummary}. You were on it.`
    : `${builderName} has enough material to start the ${intent.buildType === 'fire' ? 'fire' : 'shelter'}.`;
  const options = isDrama && (playerIsBuilder || playerIsBlamed)
    ? choiceOptions(playerIsBuilder)
    : [{ key: 'continue', label: 'Back to camp' }];

  gm.flags.campEventActive = true;
  eventManager.publish(GameEvents.CAMP_EVENT_STARTED, { eventId: EVENT_ID, id: EVENT_ID });
  const overlay = createCheckpointOverlay({
    speaker,
    heading: isDrama ? `${builderName} calls out ${blamedName}` : 'Work can move again',
    line: openingLine,
    options
  });
  const gameContainer = document.getElementById('game-container');
  const wasInert = gameContainer?.inert;
  if (gameContainer) gameContainer.inert = true;

  return new Promise(resolve => {
    let finished = false;
    const finish = result => {
      if (finished) return;
      finished = true;
      overlay.remove();
      if (gameContainer) gameContainer.inert = Boolean(wasInert);
      gm.flags.campEventActive = false;
      eventManager.publish(GameEvents.CAMP_EVENT_ENDED, { eventId: EVENT_ID, id: EVENT_ID, completed: true });
      try {
        gm.saveGame?.();
      } catch {
        // The completed checkpoint remains valid in memory even if storage is unavailable.
      }
      resolve({ started: true, ...result });
    };

    overlay.querySelector('.day1-checkpoint__choices').addEventListener('click', event => {
      const button = event.target.closest('button[data-choice]');
      if (!button || finished) return;
      overlay.querySelectorAll('button').forEach(choice => { choice.disabled = true; });
      const choiceKey = button.dataset.choice;
      if (choiceKey === 'continue') {
        if (!checkpointReport.relationshipDeltasApplied?.length) {
          applyRelationshipDeltas(gm, checkpointReport, checkpointReport.relationshipDeltasProposed || []);
        }
        finish({ choiceKey: null });
        return;
      }

      const deltas = adjustDeltas(checkpointReport, {
        choiceKey,
        playerId,
        builder,
        blamed,
        playerIsBuilder,
        playerIsBlamed
      });
      applyRelationshipDeltas(gm, checkpointReport, deltas);
      const response = choiceLine({ choiceKey, playerIsBuilder, builderName, blamedName, missingSummary });
      overlay.querySelector('p').textContent = response;
      gm.campLog = gm.campLog || [];
      gm.campLog.push({
        type: 'day1_midpoint_choice',
        day: gm.getCurrentDay?.() ?? gm.day ?? 1,
        title: 'Midpoint Tension',
        text: response,
        timestamp: Date.now(),
        data: { choiceKey, builderId, blamedId, buildType: intent.buildType, missing: { ...missing } }
      });
      window.setTimeout(() => finish({ choiceKey }), 650);
    });
    overlay.querySelector('button')?.focus();
  });
}

export function runPart2FromCheckpointReport(report) {
  return runDay1FirstImpressionsPart2FromCheckpoint(sharedGameManager, report);
}
