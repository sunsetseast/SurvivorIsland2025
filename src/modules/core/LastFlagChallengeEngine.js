const tribeKey = tribe => tribe?.tribeId ?? tribe?.id;

function hash(value) {
  let result = 2166136261;
  for (const char of String(value)) {
    result = Math.imul(result ^ char.charCodeAt(0), 16777619);
  }
  return result >>> 0;
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
  constructor({ tribes, playerId, day = 2 }) {
    this.tribes = (tribes || []).filter(tribe => (tribe?.members || []).some(member => !member.isOut)).map(tribe => ({
      key: tribeKey(tribe),
      name: tribe.tribeName || tribe.name || 'Tribe',
      color: tribe.tribeColor || tribe.color || '#f4ca78',
      members: (tribe.members || []).filter(member => !member.isOut).map(member => ({
        id: member.id, name: member.firstName || member.name || 'Survivor',
        portrait: member.avatarUrl || member.portraitUrl || null,
        mental: member.mental, puzzles: member.puzzles, focus: member.focus,
        gameplayStyle: member.gameplayStyle, risk: member.risk
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
    this.seed = hash(`${day}|${this.tribes.map(tribe => `${tribe.key}:${tribe.members.map(member => member.id).join(',')}`).join('|')}`);
    this.lineups = Object.fromEntries(this.tribes.map(tribe => [String(tribe.key), lineup(tribe.members, playerId)]));
    const byeIndex = this.tribes.length === 3 ? hash(`${this.seed}|bye`) % 3 : -1;
    this.byeTribeKey = byeIndex < 0 ? null : this.tribes[byeIndex].key;
    const opening = this.tribes.filter(tribe => String(tribe.key) !== String(this.byeTribeKey));
    this.heat = this.createHeat(opening.map(tribe => tribe.key), 0);
    this.heatResults = [];
    this.moves = [];
    this.winningTribeKeys = [];
    this.losingTribeKey = null;
    this.completed = false;
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
    if (remaining <= 3) return remaining;

    const mind = Number(actor.mental) || 35;
    const puzzles = Number(actor.puzzles) || 5;
    const focus = Number(actor.focus) || 5;
    const style = actor.gameplayStyle || '';
    const ability = mind * 0.9 + puzzles * 2.6 + focus * 1.5
      + (style === 'Shadow Strategist' ? 9 : 0);
    const roll = hash(`${this.seed}|think|${this.heat.index}|${this.heat.moves.length}|${actor.id}|${remaining}`) / 4294967296;
    const recognition = ability >= 90 ? 0.97 : ability >= 70 ? 0.72 : ability >= 53 ? 0.35 : 0.08;
    const seesPattern = roll < Math.min(0.99, recognition + (remaining <= 8 ? 0.2 : 0));
    const ideal = remaining % 4;
    this.lastNpcDecision = {
      actorId: actor.id, heat: this.heat.index, turn: this.heat.moves.length,
      recognized: seesPattern && ideal > 0
    };
    if (seesPattern && ideal > 0 && legal.includes(ideal)) return ideal;

    const risk = Number(actor.risk) || 5;
    const aggressive = style === 'Wildcard' || style === 'Power Player';
    const pick = hash(`${this.seed}|instinct|${this.heat.index}|${this.heat.moves.length}|${actor.id}`) % legal.length;
    if (aggressive && risk >= 7) return legal[Math.max(pick, legal.length - 1)];
    if (style === 'Shadow Strategist' && !seesPattern) return legal[Math.min(pick, 1)];
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
      finalMove: heat.flagsRemaining === 0
    };
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
      heatResults: this.heatResults.map(heat => ({ ...heat })),
      contestantPerformance: performance
    };
  }
}
