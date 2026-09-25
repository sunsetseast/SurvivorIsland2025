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

// Estimate who can take the final flag with three different tribes rotating.
// Each future contestant favors their own best move but sometimes deviates;
// this is a small challenge-local evaluator, not the two-tribe remainder rule.
export function evaluateThreeTribeTakes(remaining, actingIndex) {
  const cache = new Map();
  const project = (flags, turn) => {
    const cacheKey = `${flags}:${turn}`;
    if (cache.has(cacheKey)) return cache.get(cacheKey);
    const options = [1, 2, 3].filter(take => take <= flags).map(take => {
      if (take === flags) return [0, 1, 2].map(index => Number(index === turn));
      return project(flags - take, (turn + 1) % 3);
    });
    const best = Math.max(...options.map(distribution => distribution[turn]));
    const favorites = options.filter(distribution => Math.abs(distribution[turn] - best) < 1e-8);
    const distribution = [0, 1, 2].map(index => options.reduce((sum, option) =>
      sum + option[index] * (.25 / options.length + (favorites.includes(option) ? .75 / favorites.length : 0)), 0));
    cache.set(cacheKey, distribution);
    return distribution;
  };
  return [1, 2, 3].filter(take => take <= remaining).map(take => ({
    take, chances: take === remaining
      ? [0, 1, 2].map(index => Number(index === actingIndex))
      : project(remaining - take, (actingIndex + 1) % 3)
  }));
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
    this.hasSecondHeat = this.tribes.length === 3;
    this.heat = this.createHeat(this.tribes.map(tribe => tribe.key), 0);
    this.heatResults = [];
    this.moves = [];
    this.winningTribeKeys = [];
    this.losingTribeKey = null;
    this.completed = false;
    this.tribeAwareness = Object.fromEntries(this.tribes.map(tribe => [String(tribe.key), null]));
  }

  createHeat(keys, index) {
    const starter = hash(`${this.seed}|start|${index}|${keys.join(':')}`) % keys.length;
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

  get nextTribeKey() {
    const keys = this.heat.tribeKeys;
    return keys[(keys.findIndex(key => same(key, this.heat.turnTribeKey)) + 1) % keys.length];
  }

  bestTakes(heat, remaining) {
    if (heat.tribeKeys.length === 2) {
      const ideal = remaining % 4;
      return ideal ? [ideal] : [];
    }
    const turn = heat.tribeKeys.findIndex(key => same(key, heat.turnTribeKey));
    const moves = evaluateThreeTribeTakes(remaining, turn);
    const best = Math.max(...moves.map(move => move.chances[turn]));
    return moves.filter(move => Math.abs(move.chances[turn] - best) < 1e-8).map(move => move.take);
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
    const best = this.bestTakes(this.heat, remaining);
    const ideal = best.length ? best[hash(`${this.seed}|best|${this.heat.index}|${this.heat.moves.length}|${actor.id}|${remaining}`) % best.length] : 0;
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
    const best = this.bestTakes(heat, remainingBefore);
    const isStrong = best.includes(count);
    const ideal = heat.tribeKeys.length === 2 ? remainingBefore % 4 : (best.length ? count : 0);
    const move = {
      heat: heat.index + 1, turn: heat.moves.length + 1,
      actorId: actor.id, actorName: actor.name, tribeKey: heat.turnTribeKey,
      taken: count, remaining: heat.flagsRemaining,
      strongMove: heat.flagsRemaining === 0 || isStrong,
      mistake: best.length > 0 && !isStrong && remainingBefore > 3,
      recognizedPattern: String(actor.id) !== String(this.playerId)
        && this.lastNpcDecision?.recognized === true
        && String(this.lastNpcDecision.actorId) === String(actor.id)
        && this.lastNpcDecision.heat === heat.index
        && this.lastNpcDecision.turn === heat.moves.length
        && isStrong,
      followedPlan: this.lastNpcDecision?.followedPlan === true
        && same(this.lastNpcDecision.actorId, actor.id)
        && this.lastNpcDecision.heat === heat.index
        && this.lastNpcDecision.turn === heat.moves.length && isStrong,
      finalMove: heat.flagsRemaining === 0
    };
    // Only an NPC who personally spotted the pattern can announce it.
    if (move.recognizedPattern && !move.finalMove) {
      const leader = Number(actor.leader) || 5;
      const teamwork = Number(actor.teamPlayer) || 50;
      const speaks = hash(`${this.seed}|speak|${heat.index}|${heat.moves.length}|${actor.id}`) / 4294967296
        < Math.min(.95, .15 + leader * .055 + teamwork * .003);
      if (speaks) {
        move.callout = heat.tribeKeys.length === 2 && heat.flagsRemaining <= 12 && heat.flagsRemaining >= 4
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
      const remainingTribeKeys = heat.tribeKeys.filter(key => !same(key, heat.turnTribeKey));
      heat.winnerKey = heat.turnTribeKey;
      this.heatResults.push({
        heat: heat.index + 1, tribeKeys: [...heat.tribeKeys],
        startingTribeKey: heat.startingTribeKey,
        winningTribeKey: heat.winnerKey, remainingTribeKeys: [...remainingTribeKeys],
        finalActorId: actor.id, turns: heat.moves.length
      });
      this.winningTribeKeys.push(heat.winnerKey);
      if (this.hasSecondHeat && heat.index === 0) {
        this.heat = this.createHeat(remainingTribeKeys, 1);
      } else {
        this.losingTribeKey = remainingTribeKeys[0];
        this.heatResults.at(-1).losingTribeKey = this.losingTribeKey;
        this.completed = true;
      }
    } else {
      heat.turnTribeKey = this.nextTribeKey;
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
