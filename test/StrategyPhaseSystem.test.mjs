import test from 'node:test';
import assert from 'node:assert/strict';
import SeasonEngine from '../src/modules/core/SeasonEngine.js';

globalThis.window = globalThis.window || {};
const { gameManager } = await import('../src/modules/core/GameManager.js');
const { default: strategy } = await import('../src/modules/systems/StrategyPhaseSystem.js');
const { default: TribalCouncilSystem } = await import('../src/modules/systems/TribalCouncilSystem.js');
const { default: TribalCouncilView } = await import('../src/modules/screens/TribalCouncilView.js');

function element() {
  return {
    children: [], style: {}, dataset: {}, classList: { add() {} },
    appendChild(child) { this.children.push(child); child.parentElement = this; return child; },
    removeChild(child) { this.children.splice(this.children.indexOf(child), 1); },
    addEventListener(name, callback) { this.listeners ||= {}; this.listeners[name] = callback; },
    click() { this.listeners?.click?.(); }
  };
}

function find(root, predicate) {
  if (predicate(root)) return root;
  for (const child of root.children || []) {
    const match = find(child, predicate);
    if (match) return match;
  }
  return null;
}

async function withGame(run) {
  const keys = ['day', 'dayTimer', 'gamePhase', 'gameState', 'survivors', 'tribes', 'player',
    'isMerged', 'flags', 'systems', 'lastChallengeResult', 'seasonEngine',
    'eliminateSurvivor', '_publishPhaseChange', 'setGameState', 'requestAutoSave',
    'resetTaskSimFlags', 'updateTribeHealth'];
  const saved = Object.fromEntries(keys.map(key => [key, gameManager[key]]));
  const oldDocument = globalThis.document;
  const oldCampScreen = window.campScreen;
  const oldPicker = strategy.buildAvatarGridPickerModal;
  const members = Array.from({ length: 8 }, (_, index) => ({
    id: `member-${index}`, name: `Member ${index}`, firstName: `Member ${index}`,
    tribeId: index < 4 ? 1 : 2, isPlayer: index === 0,
    physical: 50, mental: 50, social: 50
  }));
  gameManager.day = 1;
  gameManager.dayTimer = 3600;
  gameManager.gamePhase = 'postChallenge';
  gameManager.gameState = 'camp';
  gameManager.survivors = members;
  gameManager.tribes = [1, 2].map(id => ({
    id, tribeId: id, tribeName: `Tribe ${id}`,
    members: members.filter(member => member.tribeId === id),
    resources: { water: 50, fire: 50, shelter: 50 }
  }));
  gameManager.player = members[0];
  gameManager.isMerged = false;
  gameManager.flags = {};
  gameManager.systems = {};
  globalThis.document = { body: element(), createElement: element, getElementById: () => null };
  window.campScreen = null;
  strategy.reset();
  try {
    await run(members);
  } finally {
    strategy.reset();
    strategy.buildAvatarGridPickerModal = oldPicker;
    for (const key of keys) gameManager[key] = saved[key];
    globalThis.document = oldDocument;
    window.campScreen = oldCampScreen;
  }
}

test('player immunity keeps the player in strategy but out of NPC targets and target heat', async () => {
  await withGame(async members => {
    gameManager.isMerged = true;
    members[0].hasImmunity = true;
    strategy.seedNpcIntentTargetsForPhase();
    assert.equal(strategy.npcIntentTargets.size, 3);
    assert.equal([...strategy.npcIntentTargets.values()].includes(members[0].id), false);
    assert.notEqual(strategy.pickTargetForAction('SOFT_COUNTER', gameManager.getPlayerTribe().members, members[1]), members[0].id);
    assert.equal(strategy.updateNpcIntentTarget(members[1].id, members[0].id), null);
    strategy.npcIntentTargets.set(members[1].id, members[0].id);
    assert.equal(strategy.getNpcTargetIntent(members[1].id), null);
    strategy.personalTargetId = members[0].id;
    assert.equal(strategy.computeTribalTargetBoard().heatMap[members[0].id], undefined);
    assert.ok(gameManager.getPlayerTribe().members.includes(members[0]));
  });
});

test('NPC immunity excludes personal and alliance picks, NPC intent, and Tribal vote targets', async () => {
  await withGame(async members => {
    gameManager.isMerged = true;
    const immune = members[1];
    immune.hasImmunity = true;
    const picks = [];
    let cancelPicker;
    const realPicker = strategy.buildAvatarGridPickerModal;
    strategy.buildAvatarGridPickerModal = ({ options, onCancel }) => {
      picks.push(options.map(member => member.id));
      cancelPicker = onCancel;
      return { overlay: element() };
    };
    strategy.promptPersonalTarget();
    const lock = strategy.lockPersonalTarget();
    assert.equal(picks.length, 2);
    for (const ids of picks) assert.equal(ids.includes(immune.id), false);
    cancelPicker();
    await lock;

    const alliance = { id: 'alliance-1', name: 'One', memberIds: members.slice(0, 3).map(member => member.id) };
    gameManager.systems.allianceSystem = { getAlliancesForSurvivor: () => [alliance] };
    strategy.allianceTargets.set(alliance.id, immune.id);
    const allianceLock = strategy.lockAlliances();
    const change = find(document.body, node => node.textContent === 'Change');
    assert.ok(change);
    change.click();
    assert.equal(picks.at(-1).includes(immune.id), false);
    find(document.body, node => node.textContent === 'Save choices').click();
    await allianceLock;

    strategy.buildAvatarGridPickerModal = realPicker;
    let selected;
    const picker = strategy.buildAvatarGridPickerModal({
      title: 'Target', confirmLabel: 'Choose', options: gameManager.getPlayerTribe().members.slice(1),
      defaultSelection: immune.id, onConfirm: id => { selected = id; }
    });
    document.body.appendChild(picker.overlay);
    const grid = find(picker.overlay, node => node.className === 'avatar-grid');
    assert.equal(grid.children.some(tile => tile.dataset.id === immune.id), false);
    find(picker.overlay, node => node.textContent === 'Choose').click();
    assert.notEqual(selected, immune.id);

    strategy.seedNpcIntentTargetsForPhase();
    assert.ok(strategy.npcIntentTargets.has(immune.id), 'immune contestant still participates in strategy');
    assert.equal([...strategy.npcIntentTargets.values()].includes(immune.id), false);
    strategy.allianceTargets.set(alliance.id, immune.id);
    assert.equal(strategy.computeTribalTargetBoard().heatMap[immune.id], undefined);

    const tribal = new TribalCouncilSystem(gameManager, { publish() {} });
    tribal.buildTribeContext(1);
    assert.ok(tribal.voters.includes(immune));
    assert.ok(tribal.immunityHolderIds.has(immune.id));
    tribal._scoreNpcTarget = (_voter, target) => target.id === immune.id ? 10000 : 1;
    tribal.computeNpcVotes();
    assert.equal(tribal.initialVotes.some(vote => vote.targetId === immune.id), false);
    assert.equal(tribal._recordVote(members[0].id, immune.id), null);
    const view = new TribalCouncilView({ gameManager, tribalCouncilSystem: tribal });
    view.attendingTribeId = 1;
    assert.equal(view._getVoteTargets().some(member => member.id === immune.id), false);
  });
});

test('safe summary delegates to Season Engine and duplicate completion cannot advance twice', async () => {
  await withGame(async members => {
    gameManager.lastChallengeResult = {
      challengeDay: 1, challengeType: 'tribal',
      winningTribeKeys: [1], losingTribeKey: 2, playerTribeWon: true
    };
    gameManager.seasonEngine = new SeasonEngine(gameManager, { publish() {} }, { mergeAt: 4 });
    gameManager.eliminateSurvivor = target => {
      target.isOut = true;
      gameManager.tribes.forEach(tribe => {
        tribe.members = tribe.members.filter(member => member !== target);
      });
    };
    gameManager._publishPhaseChange = () => {};
    gameManager.setGameState = () => {};
    gameManager.requestAutoSave = () => {};
    gameManager.resetTaskSimFlags = () => {};
    gameManager.updateTribeHealth = () => {};
    strategy.playerTribeSafe = true;
    strategy.proceedAfterSummary();
    assert.equal(members.filter(member => member.isOut).length, 1);
    assert.equal(members.find(member => member.isOut).tribeId, 2);
    assert.equal(gameManager.day, 2);
    strategy.proceedAfterSummary();
    await gameManager.endPostChallengePhase();
    assert.equal(members.filter(member => member.isOut).length, 1);
    assert.equal(gameManager.day, 2);
    assert.equal(gameManager.seasonEngine.state.history.filter(entry => entry.type === 'roundComplete').length, 1);
  });
});
