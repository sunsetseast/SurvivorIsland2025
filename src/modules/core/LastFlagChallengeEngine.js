const tribeKey = tribe => tribe?.tribeId ?? tribe?.id;

function hash(value) {
  let result = 2166136261;
  for (const char of String(value)) {
    result = Math.imul(result ^ char.charCodeAt(0), 16777619);
  }
  return result >>> 0;
}

const activeMembers = tribe => (tribe?.members || []).filter(member => !member.isOut);
const same = (a, b) => String(a) === String(b);
const seedFor = (tribes, day) => hash(`${day}|${tribes.map(tribe => `${tribeKey(tribe)}:${activeMembers(tribe).map(member => member.id).join(',')}`).join('|')}`);

export function selectLastFlagHeat2Tribe(tribes, day = 2) {
  const active = (tribes || []).filter(tribe => activeMembers(tribe).length);
  return active.length === 3 ? tribeKey(active[hash(`${seedFor(active, day)}|bye`) % 3]) : null;
}

// Plan against every active tribe so the two heats use the same sized lineups.
// Player choices remain pending until Jeff's sit-out ceremony is complete.
export function planLastFlagSitOuts({ tribes, playerId, day = 2, playerSitOutIds = [] }) {
  const active = (tribes || []).filter(tribe => activeMembers(tribe).length);
  const minimum = Math.min(...active.map(tribe => activeMembers(tribe).length));
  const selected = [...playerSitOutIds];
  if (new Set(selected.map(String)).size !== selected.length) throw new Error('Duplicate Last Flag sit-out.');
  const playerTribe = active.find(tribe => activeMembers(tribe).some(member => same(member.id, playerId)));
  if (!playerTribe) throw new Error('The player must be active for Last Flag.');
  const playerOptions = activeMembers(playerTribe).filter(member => !same(member.id, playerId));
  const playerCount = activeMembers(playerTribe).length - minimum;
  if (selected.length > playerCount || selected.some(id => !playerOptions.some(member => same(member.id, id)))) {
    throw new Error('Invalid player tribe sit-out choice.');
  }
  const seed = seedFor(active, day);
  const byTribe = {};
  for (const tribe of active) {
    const key = String(tribeKey(tribe));
    if (tribe === playerTribe) {
      byTribe[key] = [...selected];
    } else {
      const fit = member => (Number(member.mental) || 35) * .9
        + (Number(member.puzzles) || 5) * 2.6 + (Number(member.focus) || 5) * 1.5;
      byTribe[key] = activeMembers(tribe).slice().sort((a, b) =>
        fit(a) - fit(b) || hash(`${seed}|sit|${a.id}`) - hash(`${seed}|sit|${b.id}`)
      ).slice(0, activeMembers(tribe).length - minimum).map(member => member.id);
    }
  }
  return {
    targetSize: minimum, byTribe,
    sitOutIds: Object.values(byTribe).flat(),
    playerChoicesNeeded: playerCount - selected.length,
    playerOptions: playerOptions.filter(member => !selected.some(id => same(member.id, id)))
  };
}

function lineup(members, playerId) {
  const ids = members.map(member => member.id);
  const playerIndex = ids.findIndex(id => String(id) === String(playerId));
  if (playerIndex > 1) {
    const [player] = ids.splice(playerIndex, 1);
    ids.splice(1, 0, player);
  }
  return ids;
}

export default class LastFlagChallengeEngine {
  constructor({ tribes, playerId, day = 2, playerSitOutIds = [] }) {
    const activeTribes = (tribes || []).filter(tribe => activeMembers(tribe).length);
    const sitOutPlan = planLastFlagSitOuts({ tribes: activeTribes, playerId, day, playerSitOutIds });
    if (sitOutPlan.playerChoicesNeeded) throw new Error('Choose the player tribe sit-outs before starting Last Flag.');
    this.tribes = (tribes || []).filter(tribe => (tribe?.members || []).some(member => !member.isOut)).map(tribe => ({
      key: tribeKey(tribe),
      name: tribe.tribeName || tribe.name || 'Tribe',
      color: tribe.tribeColor || tribe.color || '#f4ca78',
      members: (tribe.members || []).filter(member => !member.isOut).map(member => ({
        id: member.id, name: member.firstName || member.name || 'Survivor',
        portrait: member.avatarUrl || member.portraitUrl || null,
        mental: member.mental, puzzles: member.puzzles, focus: member.focus,
        gameplayStyle: member.gameplayStyle, risk: member.risk,
        leader: member.leader, teamPlayer: member.teamPlayer
      }))
    }));
    if (![2, 3].includes(this.tribes.length) || this.tribes.some(tribe => !tribe.members.length)) {
      throw new Error('Last Flag requires two or three active tribes with contestants.');
    }
    if (!this.tribes.some(tribe => tribe.members.some(member => String(member.id) === String(playerId)))) {
      throw new Error('The player must be an active Last Flag contestant.');
    }
    this.playerId = playerId;
    this.day = day;
    this.seed = seedFor(activeTribes, day);
    this.sitOutIds = [...sitOutPlan.sitOutIds];
    this.sitOutByTribe = sitOutPlan.byTribe;
    this.lineups = Object.fromEntries(this.tribes.map(tribe => [String(tribe.key), lineup(
      tribe.members.filter(member => !this.sitOutIds.some(id => same(id, member.id))), playerId
    )]));
    this.byeTribeKey = selectLastFlagHeat2Tribe(activeTribes, day);
    const opening = this.tribes.filter(tribe => String(tribe.key) !== String(this.byeTribeKey));
    this.heat = this.createHeat(opening.map(tribe => tribe.key), 0);
    this.heatResults = [];
    this.moves = [];
    this.winningTribeKeys = [];
    this.losingTribeKey = null;
    this.completed = false;
    this.tribeAwareness = Object.fromEntries(this.tribes.map(tribe => [String(tribe.key), null]));
  }

  createHeat(keys, index) {
    const starter = hash(`${this.seed}|start|${index}|${keys.join(':')}`) % 2;
    return {
      index, tribeKeys: [...keys], startingTribeKey: keys[starter],
      turnTribeKey: keys[starter], flagsRemaining: 21,
      positions: Object.fromEntries(keys.map(key => [String(key), 0])),
      moves: [], winnerKey: null
    };
  }

  get currentActor() {
    if (this.completed || this.heat.winnerKey != null) return null;
    const key = this.heat.turnTribeKey;
    const ids = this.lineups[String(key)];
    const id = ids[this.heat.positions[String(key)] % ids.length];
    return this.tribes.find(tribe => String(tribe.key) === String(key))?.members
      .find(member => String(member.id) === String(id)) || null;
  }

  get awaitingPlayer() {
    return !this.completed && String(this.currentActor?.id) === String(this.playerId);
  }

  get legalTakes() {
    return this.completed ? [] : [1, 2, 3].filter(take => take <= this.heat.flagsRemaining);
  }

  chooseNpcMove() {
    const actor = this.currentActor;
    if (!actor || this.awaitingPlayer) return null;
    const remaining = this.heat.flagsRemaining;
    const legal = this.legalTakes;
    if (remaining <= 3) {
      this.lastNpcDecision = null;
      return remaining;
    }

    const mind = Number(actor.mental) || 35;
    const puzzles = Number(actor.puzzles) || 5;
    const focus = Number(actor.focus) || 5;
    const style = actor.gameplayStyle || '';
    const ability = mind * 0.9 + puzzles * 2.6 + focus * 1.5
      + (style === 'Shadow Strategist' ? 9 : 0);
    const roll = hash(`${this.seed}|think|${this.heat.index}|${this.heat.moves.length}|${actor.id}|${remaining}`) / 4294967296;
    const recognition = ability >= 90 ? 0.97 : ability >= 70 ? 0.72 : ability >= 53 ? 0.35 : 0.08;
    const plan = this.tribeAwareness[String(this.heat.turnTribeKey)];
    const sharedBoost = plan ? plan.strength * Math.max(.25, (Number(actor.focus) || 5) / 10)
      * Math.max(.3, (Number(actor.teamPlayer) || 50) / 70)
      * (style === 'Wildcard' ? .25 : 1) : 0;
    const personalChance = Math.min(.98, recognition + (remaining <= 8 ? 0.2 : 0));
    const seesPattern = roll < personalChance;
    const followsPlan = !seesPattern && Boolean(plan) && roll < Math.min(.99, personalChance + sharedBoost);
    const ideal = remaining % 4;
    this.lastNpcDecision = {
      actorId: actor.id, heat: this.heat.index, turn: this.heat.moves.length,
      recognized: seesPattern && ideal > 0,
      followedPlan: followsPlan && ideal > 0
    };
    if ((seesPattern || followsPlan) && ideal > 0 && legal.includes(ideal)) return ideal;

    const risk = Number(actor.risk) || 5;
    const aggressive = style === 'Wildcard' || style === 'Power Player';
    const pick = hash(`${this.seed}|instinct|${this.heat.index}|${this.heat.moves.length}|${actor.id}`) % legal.length;
    if (aggressive && risk >= 7) return legal[Math.max(pick, legal.length - 1)];
    if (style === 'Shadow Strategist' && !seesPattern && !followsPlan) return legal[Math.min(pick, 1)];
    return legal[pick];
  }

  advanceNpcTurn() {
    if (this.awaitingPlayer || this.completed) return null;
    const actor = this.currentActor;
    return this.take(this.chooseNpcMove(), actor?.id);
  }

  take(count, actorId) {
    const actor = this.currentActor;
    if (!actor || String(actor.id) !== String(actorId) || !this.legalTakes.includes(count)) return null;
    const heat = this.heat;
    const remainingBefore = heat.flagsRemaining;
    heat.flagsRemaining -= count;
    const ideal = remainingBefore % 4;
    const move = {
      heat: heat.index + 1, turn: heat.moves.length + 1,
      actorId: actor.id, actorName: actor.name, tribeKey: heat.turnTribeKey,
      taken: count, remaining: heat.flagsRemaining,
      strongMove: heat.flagsRemaining === 0 || (ideal > 0 && count === ideal),
      mistake: ideal > 0 && count !== ideal && remainingBefore > 3,
      recognizedPattern: String(actor.id) !== String(this.playerId)
        && this.lastNpcDecision?.recognized === true
        && String(this.lastNpcDecision.actorId) === String(actor.id)
        && this.lastNpcDecision.heat === heat.index
        && this.lastNpcDecision.turn === heat.moves.length
        && count === ideal,
      followedPlan: this.lastNpcDecision?.followedPlan === true
        && same(this.lastNpcDecision.actorId, actor.id)
        && this.lastNpcDecision.heat === heat.index
        && this.lastNpcDecision.turn === heat.moves.length && count === ideal,
      finalMove: heat.flagsRemaining === 0
    };
    // Only an NPC who personally spotted the pattern can announce it.
    if (move.recognizedPattern && !move.finalMove) {
      const leader = Number(actor.leader) || 5;
      const teamwork = Number(actor.teamPlayer) || 50;
      const speaks = hash(`${this.seed}|speak|${heat.index}|${heat.moves.length}|${actor.id}`) / 4294967296
        < Math.min(.95, .15 + leader * .055 + teamwork * .003);
      if (speaks) {
        move.callout = heat.flagsRemaining <= 12 && heat.flagsRemaining >= 4
          ? `“I see it. Leave them ${heat.flagsRemaining}!”` : '“I see it. Stay with me!”';
        this.tribeAwareness[String(heat.turnTribeKey)] = {
          sourceId: actor.id, strength: .12 + leader * .02 + teamwork * .0015
        };
      }
    }
    heat.moves.push(move);
    this.moves.push(move);
    this.lastNpcDecision = null;
    heat.positions[String(heat.turnTribeKey)] += 1;
    if (move.finalMove) {
      const loser = heat.tribeKeys.find(key => String(key) !== String(heat.turnTribeKey));
      heat.winnerKey = heat.turnTribeKey;
      this.heatResults.push({
        heat: heat.index + 1, tribeKeys: [...heat.tribeKeys],
        startingTribeKey: heat.startingTribeKey,
        winningTribeKey: heat.winnerKey, losingTribeKey: loser,
        finalActorId: actor.id, turns: heat.moves.length
      });
      this.winningTribeKeys.push(heat.winnerKey);
      if (this.byeTribeKey != null && heat.index === 0) {
        this.heat = this.createHeat([loser, this.byeTribeKey], 1);
      } else {
        this.losingTribeKey = loser;
        this.completed = true;
      }
    } else {
      heat.turnTribeKey = heat.tribeKeys.find(key => String(key) !== String(heat.turnTribeKey));
    }
    return move;
  }

  getResult() {
    if (!this.completed) return null;
    const playerTribeKey = this.tribes.find(tribe => (
      tribe.members.some(member => String(member.id) === String(this.playerId))
    )).key;
    const performance = {};
    for (const move of this.moves) {
      const entry = performance[String(move.actorId)] ||= {
        contestantId: move.actorId, tribeKey: move.tribeKey,
        turns: 0, flagsRemoved: 0, strongMoves: 0, mistakes: 0,
        recognizedPattern: false, finalWinningMove: false
      };
      entry.turns += 1;
      entry.flagsRemoved += move.taken;
      entry.strongMoves += Number(move.strongMove);
      entry.mistakes += Number(move.mistake);
      entry.recognizedPattern ||= move.recognizedPattern;
      entry.finalWinningMove ||= move.finalMove;
    }
    return {
      challengeDay: this.day, challengeKey: 'last_flag', challengeName: 'Last Flag',
      challengeType: 'tribal', winningTribeKey: this.winningTribeKeys[0],
      winningTribeKeys: [...this.winningTribeKeys], losingTribeKey: this.losingTribeKey,
      playerTribeKey,
      playerTribeWon: this.winningTribeKeys.some(key => String(key) === String(playerTribeKey)),
      completed: true,
      startingFlags: 21, totalTurns: this.moves.length,
      finalMoveCount: this.moves.at(-1).taken, finalActorId: this.moves.at(-1).actorId,
      startingTribeKey: this.heatResults[0].startingTribeKey,
      sitOutIds: [...this.sitOutIds],
      sitOutByTribe: Object.fromEntries(Object.entries(this.sitOutByTribe).map(([key, ids]) => [key, [...ids]])),
      heatResults: this.heatResults.map(heat => ({ ...heat })),
      contestantPerformance: performance
    };
  }
}
