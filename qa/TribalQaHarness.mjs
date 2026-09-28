import gameData from '../src/modules/data/GameData.js';
import AllianceSystem from '../src/modules/systems/AllianceSystem.js';
import DealSystem from '../src/modules/systems/DealSystem.js';
import socialMemory from '../src/modules/systems/SocialMemorySystem.js';
import TribalCouncilSystem from '../src/modules/systems/TribalCouncilSystem.js';
import TribalKnowledgeModel from '../src/modules/systems/TribalKnowledgeModel.js';
import TribalQuestionEngine from '../src/modules/systems/TribalQuestionEngine.js';
import { assignTribalSeats } from '../src/modules/screens/TribalSceneLayout.js';

export const id = value => String(value);
export const same = (a, b) => id(a) === id(b);

export function seeded(seed) {
  let state = seed >>> 0;
  return () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296);
}

export function withRandom(random, work) {
  const previous = Math.random;
  Math.random = random;
  try { return work(); } finally { Math.random = previous; }
}

/** Uses real cast data and production social systems, with a narrow GameManager
 * boundary for controllable vote power, inventory and immunity. No Tribal rules
 * or resolution algorithms are reimplemented here. */
export function makeTribalQa({ size = 6, playerId = 1, day = 4, immuneIds = [], lostVoteIds = [],
  idolIds = [], suspicionById = {}, facts = [], history = [], trustPairs = [],
  alliances = [], deals = [], scoreNpcTarget = null } = {}) {
  const members = gameData.getSurvivors().slice(0, size).map(member => ({ ...member,
    roles: [...(member.roles || [])], advantages: { ...(member.advantages || {}) },
    isOut: false, isPlayer: same(member.id, playerId), hasVote: !lostVoteIds.some(id => same(id, member.id)),
    hasImmunity: immuneIds.some(id => same(id, member.id)),
    hasIdol: idolIds.some(id => same(id, member.id)),
    suspicion: suspicionById[id(member.id)] ?? 0, dealIds: [] }));
  const tribe = { id: 1, tribeId: 1, members, resources: { food: 50, water: 50, fire: 50, shelter: 50 } };
  const trust = new Map(trustPairs.map(([a, b, value]) => [[id(a), id(b)].sort().join(':'), value]));
  const trustKey = (a, b) => [id(a), id(b)].sort().join(':');
  const memory = new socialMemory.constructor();
  const consumption = { idols: new Map(), sitd: new Map() };
  const gm = {
    day, survivors: members, player: members.find(member => member.isPlayer) || null,
    tribes: [tribe], tribalCouncilLog: history, flags: {}, systems: {},
    getDay: () => day, getCurrentDay: () => day, getTribes: () => [tribe],
    getPlayerTribe: () => tribe, getPlayerSurvivor: () => gm.player,
    hasVote: member => Boolean(member?.hasVote), hasLostVote: member => !member?.hasVote,
    hasImmunity: member => Boolean(member?.hasImmunity),
    getTrust: (a, b) => trust.get(trustKey(a, b)) ?? 50,
    changeTrust(a, b, delta) { trust.set(trustKey(a, b), Math.max(0, Math.min(100, this.getTrust(a, b) + delta))); },
    canPlayShotInTheDark: member => Boolean(member?.advantages?.shotInTheDarkAvailable && member.hasVote),
    consumeShotInTheDarkForSurvivor(voterId) {
      const member = members.find(candidate => same(candidate.id, voterId));
      if (!member?.advantages?.shotInTheDarkAvailable) return false;
      member.advantages.shotInTheDarkAvailable = false;
      consumption.sitd.set(id(voterId), (consumption.sitd.get(id(voterId)) || 0) + 1);
      return true;
    },
    consumeIdolForSurvivor(holderId) {
      const member = members.find(candidate => same(candidate.id, holderId));
      if (!member?.hasIdol) return false;
      member.hasIdol = false;
      consumption.idols.set(id(holderId), (consumption.idols.get(id(holderId)) || 0) + 1);
      return true;
    }
  };
  gm.systems.strategyPhaseSystem = { strategyFacts: facts, getSummaryFacts: () => facts,
    getNpcTargetIntent: () => null };
  gm.systems.socialMemorySystem = memory;
  gm.systems.idolSystem = { survivorInventories: new Map() };
  gm.systems.allianceSystem = new AllianceSystem(gm);
  gm.systems.dealSystem = new DealSystem(gm);
  for (const alliance of alliances) gm.systems.allianceSystem.createAlliance(alliance);
  for (const deal of deals) {
    const created = gm.systems.dealSystem.createDeal(deal);
    if (created && deal.accepted) gm.systems.dealSystem.acceptDeal(created.id, deal.parties[1]);
  }
  const tribal = new TribalCouncilSystem(gm, { publish() {} });
  if (scoreNpcTarget) tribal._scoreNpcTarget = scoreNpcTarget;
  return { gm, tribe, members, trust, memory, consumption, tribal,
    knowledge: () => new TribalKnowledgeModel(gm, members.filter(member => !member.isOut)),
    questions: () => new TribalQuestionEngine(gm), seats: () => assignTribalSeats(members.filter(member => !member.isOut)) };
}

export function finishTribal(setup, { playerTargetId = null, sitd = false, maxSteps = 12 } = {}) {
  const { gm, tribal, members } = setup;
  const player = gm.player;
  if (player && player.hasVote) {
    if (sitd) tribal.registerPlayerShotInTheDark(player.id);
    else if (playerTargetId != null) tribal.registerPlayerVote(player.id, playerTargetId);
    else {
      const target = members.find(member => !same(member.id, player.id) && !member.hasImmunity && !member.isOut);
      if (target) tribal.registerPlayerVote(player.id, target.id);
    }
  }
  let summary = tribal.runPreMergeTribal({ attendingTribeId: 1 });
  let steps = 0;
  while (['REVOTE_PENDING', 'DEADLOCK_DISCUSSION'].includes(summary.tribalState) && steps++ < maxSteps) {
    if (summary.tribalState === 'REVOTE_PENDING') {
      const target = summary.playerRevoteTargetIds?.[0];
      summary = tribal.resolveRevoteWithPlayerChoice({ playerChoiceTargetId: target });
    } else {
      const target = summary.playerCanDecideConsensus ? summary.currentDeadlockTiedIds?.[0] : null;
      summary = tribal.resolveDeadlockConsensus({ playerChoiceTargetId: target });
    }
  }
  if (steps >= maxSteps) throw new Error(`Tribal did not terminate in ${maxSteps} steps`);
  return summary;
}
