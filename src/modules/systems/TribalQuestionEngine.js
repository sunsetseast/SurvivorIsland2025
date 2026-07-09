/**
 * Builds deterministic Tribal Council dialogue from the current game state.
 * This is intentionally a template system: game logic remains the source of
 * truth and no remote or generative AI service is required to run Tribal.
 */
export default class TribalQuestionEngine {
  constructor(gameManager) {
    this.gameManager = gameManager;
  }

  createContext({ attendingTribeId = null } = {}) {
    const tribe = this._getTribe(attendingTribeId);
    const members = (tribe?.members || []).filter(member => member && !member.isOut);
    const player = this.gameManager?.getPlayerSurvivor?.() || this.gameManager?.player || null;
    const strategy = this.gameManager?.systems?.strategyPhaseSystem;
    const board = strategy?.getTribalTargetBoard?.() || this.gameManager?.flags?.tribalTargetBoard || {};
    const heatMap = { ...(board?.heatMap || {}) };
    const rankedHeat = Object.entries(heatMap)
      .map(([id, heat]) => ({ id: String(id), heat: Number(heat) || 0 }))
      .sort((a, b) => b.heat - a.heat || a.id.localeCompare(b.id));
    const alliances = (this.gameManager?.systems?.allianceSystem?.getAlliances?.() || [])
      .filter(alliance => (alliance.memberIds || []).some(id => members.some(member => this._idsEqual(member.id, id))));
    const activeDeals = Object.values(this.gameManager?.systems?.dealSystem?.dealsById || {})
      .filter(deal => ['PROPOSED', 'ACCEPTED'].includes(deal?.status))
      .filter(deal => (deal.parties || []).some(id => members.some(member => this._idsEqual(member.id, id))));
    const facts = strategy?.getSummaryFacts?.() || strategy?.strategyFacts || [];
    const playerId = this._normalizeId(player?.id);
    const playerHeat = Number(heatMap[playerId]) || 0;
    const playerNameWasFloated = facts.some(fact => (
      fact?.type === 'playerNameFloated'
      || (this._idsEqual(fact?.targetId, playerId) && /target|scramble|intent/i.test(String(fact?.type || '')))
    ));

    return {
      attendingTribeId: tribe?.tribeId ?? tribe?.id ?? attendingTribeId ?? null,
      tribe,
      members,
      player,
      playerId,
      strategy,
      board,
      heatMap,
      rankedHeat,
      alliances,
      activeDeals,
      facts,
      playerHeat,
      playerNameWasFloated,
      primaryTargetId: this._normalizeId(board?.primaryTargetId || rankedHeat[0]?.id),
      secondaryTargetId: this._normalizeId(board?.secondaryTargetId || rankedHeat[1]?.id)
    };
  }

  getOpeningLine(context = this.createContext()) {
    const primary = this._getMember(context.primaryTargetId, context.members);
    const player = context.player;

    if (context.playerNameWasFloated || context.playerHeat >= 2) {
      return `${this._name(player)}, tonight your name has been in the air. At Tribal, a name can become a plan very quickly.`;
    }
    if (primary) {
      return `${this._name(primary)} has carried a lot of heat into this fire. The question is whether the easy vote is ever really easy.`;
    }
    return 'Tonight, the fire brings every promise, every rumor, and every uneasy silence into the open.';
  }

  generateQuestions({ attendingTribeId = null, maxQuestions = 5, context = null } = {}) {
    const state = context || this.createContext({ attendingTribeId });
    const questions = [];
    const add = question => {
      if (!question || questions.some(existing => existing.topic === question.topic)) return;
      questions.push(question);
    };

    const player = state.player;
    const primary = this._getMember(state.primaryTargetId, state.members);
    const secondary = this._getMember(state.secondaryTargetId, state.members);
    const playerAlliance = state.alliances.find(alliance => (alliance.memberIds || []).some(id => this._idsEqual(id, player?.id)));
    const playerAlly = (playerAlliance?.memberIds || [])
      .map(id => this._getMember(id, state.members))
      .find(member => member && !this._idsEqual(member.id, player?.id));
    const counterpart = primary && !this._idsEqual(primary.id, player?.id)
      ? primary
      : secondary && !this._idsEqual(secondary.id, player?.id)
        ? secondary
        : state.members.find(member => !this._idsEqual(member.id, player?.id));

    if (player && (state.playerNameWasFloated || state.playerHeat >= 2)) {
      add(this._playerQuestion({
        id: 'player-name-mentioned',
        topic: 'player_name_thrown_out',
        severity: 3,
        questionText: `${this._name(player)}, your name came up before anyone sat down. Do you hear that as danger, or as people trying to make you panic?`,
        counterpart,
        ally: playerAlly,
        state
      }));
    }

    if (primary && !this._idsEqual(primary.id, player?.id)) {
      add(this._npcQuestion({
        id: 'target-heat',
        topic: 'obvious_boot',
        severity: this._heatSeverity(primary.id, state),
        focus: primary,
        questionText: `${this._name(primary)}, your name has been attached to this vote all day. Is the tribe voting on certainty, or are people hiding behind an easy answer?`,
        state
      }));
    }

    if (playerAlliance && player) {
      add(this._playerQuestion({
        id: 'alliance-pressure',
        topic: 'alliance_cracks',
        severity: 2,
        questionText: `${this._name(player)}, alliances are useful right up until the moment self-preservation takes over. How solid is the group you came here trusting?`,
        counterpart: playerAlly || counterpart,
        ally: playerAlly,
        state,
        responseSet: 'alliance'
      }));
    } else if (state.alliances.length) {
      const alliance = state.alliances[0];
      const focus = (alliance.memberIds || []).map(id => this._getMember(id, state.members)).find(Boolean);
      if (focus) {
        add(this._npcQuestion({
          id: 'alliance-pressure',
          topic: 'alliance_cracks',
          severity: 2,
          focus,
          questionText: `${this._name(focus)}, can anyone honestly say tonight is about loyalty when every alliance has a backup plan?`,
          state
        }));
      }
    }

    const idolConcern = state.members.find(member => this._hasIdol(member))
      || state.members.find(member => Number(member?.idolSuspicion ?? member?.suspicion ?? 0) >= 60);
    if (idolConcern) {
      const playerFocus = this._idsEqual(idolConcern.id, player?.id) ? player : null;
      add(playerFocus
        ? this._playerQuestion({
          id: 'idol-paranoia',
          topic: 'idol_paranoia',
          severity: 2,
          questionText: `${this._name(player)}, when people worry there could be an idol in play, does it make the vote more honest or just make everybody less willing to show their hand?`,
          counterpart,
          ally: playerAlly,
          state,
          responseSet: 'idol'
        })
        : this._npcQuestion({
          id: 'idol-paranoia',
          topic: 'idol_paranoia',
          severity: 2,
          focus: idolConcern,
          questionText: `${this._name(idolConcern)}, does the possibility of an idol make people more cautious tonight, or does it make them more reckless?`,
          state
        }));
    }

    const threat = [...state.members]
      .filter(member => !this._idsEqual(member.id, primary?.id))
      .sort((a, b) => this._threat(b) - this._threat(a) || this._normalizeId(a.id).localeCompare(this._normalizeId(b.id)))[0];
    if (threat && this._threat(threat) >= 65) {
      add(this._npcQuestion({
        id: 'threat-question',
        topic: 'big_threat',
        severity: 2,
        focus: threat,
        questionText: `${this._name(threat)}, is tonight about who caused the loss, or about removing the person nobody wants to sit next to at the end?`,
        state
      }));
    }

    if (secondary && primary && Math.abs(this._heat(primary.id, state) - this._heat(secondary.id, state)) <= 1) {
      const focus = player || secondary;
      add(this._idsEqual(focus?.id, player?.id)
        ? this._playerQuestion({
          id: 'swing-vote-pressure',
          topic: 'swing_vote_pressure',
          severity: 3,
          questionText: `${this._name(player)}, when the tribe is split, the quietest person can suddenly hold all the power. Is silence a strategy tonight?`,
          counterpart: secondary,
          ally: playerAlly,
          state,
          responseSet: 'swing'
        })
        : this._npcQuestion({
          id: 'swing-vote-pressure',
          topic: 'swing_vote_pressure',
          severity: 3,
          focus,
          questionText: `${this._name(focus)}, when a vote is this close, can anyone afford to be comfortable?`,
          state
        }));
    }

    if (player && !questions.some(question => this._idsEqual(question.focusSurvivorId, player.id))) {
      add(this._playerQuestion({
        id: 'loyalty-or-survival',
        topic: 'loyalty_vs_survival',
        severity: 1,
        questionText: `${this._name(player)}, is tonight's vote about honoring a promise, or proving you can survive when promises stop protecting you?`,
        counterpart,
        ally: playerAlly,
        state,
        responseSet: 'survival'
      }));
    }

    const fallbackFocus = state.members.find(member => !this._idsEqual(member.id, player?.id)) || player;
    while (questions.length < Math.min(3, maxQuestions) && fallbackFocus) {
      const fallbackLines = [
        `${this._name(fallbackFocus)}, everybody says trust matters. Is that still true when the vote is only a few minutes away?`,
        `${this._name(fallbackFocus)}, is this vote about what happened at the challenge, or about who people are afraid to face later?`,
        `${this._name(fallbackFocus)}, can a tribe ever call a vote simple when nobody is willing to say a name with confidence?`
      ];
      add(this._npcQuestion({
        id: `trust-fallback-${questions.length + 1}`,
        topic: `trust_paranoia_${questions.length + 1}`,
        severity: 1,
        focus: fallbackFocus,
        questionText: fallbackLines[questions.length % fallbackLines.length],
        state
      }));
    }

    return questions.slice(0, Math.max(3, Math.min(6, Number(maxQuestions) || 5)));
  }

  generateLiveTribalMoment({ attendingTribeId = null, context = null } = {}) {
    const state = context || this.createContext({ attendingTribeId });
    const [first, second] = state.rankedHeat;
    const closeVote = first && second && first.heat > 0 && Math.abs(first.heat - second.heat) <= 1;
    const playerUnderPressure = state.playerHeat >= 2 || state.playerNameWasFloated;
    if (!closeVote && !playerUnderPressure) return null;

    const player = state.player;
    const counterpart = this._getMember(second?.id, state.members)
      || this._getMember(first?.id, state.members)
      || state.members.find(member => !this._idsEqual(member.id, player?.id));
    if (!player) return null;

    return this._playerQuestion({
      id: 'live-tribal-tension',
      topic: 'live_tribal_tension',
      severity: 3,
      questionText: 'Whispers start moving across the fire. The vote is no longer sitting still.',
      counterpart,
      ally: null,
      state,
      responseSet: 'live'
    });
  }

  getMood(survivor, { context = null } = {}) {
    const state = context || this.createContext();
    if (!survivor) return { id: 'calm', label: 'Calm' };

    const heat = this._heat(survivor.id, state);
    const maxHeat = Math.max(...state.rankedHeat.map(entry => entry.heat), 0);
    const suspicion = Number(survivor.suspicion ?? survivor.idolSuspicion ?? 0) || 0;
    const trust = this._averageTrust(survivor, state.members);
    const protectedByAlliance = state.alliances.some(alliance => (
      (alliance.memberIds || []).filter(id => state.members.some(member => this._idsEqual(member.id, id))).length >= 2
      && (alliance.memberIds || []).some(id => this._idsEqual(id, survivor.id))
    ));

    if (maxHeat > 0 && heat === maxHeat) return { id: suspicion >= 45 ? 'paranoid' : 'exposed', label: suspicion >= 45 ? 'Paranoid' : 'Exposed' };
    if (suspicion >= 60 || trust <= 38) return { id: 'paranoid', label: 'Paranoid' };
    if (heat > 0 || trust <= 45) return { id: 'nervous', label: 'Nervous' };
    if (this._threat(survivor) >= 75 && !protectedByAlliance) return { id: 'smug', label: 'Smug' };
    if (protectedByAlliance) return { id: 'confident', label: 'Confident' };
    if (Number(survivor.health) > 0 && Number(survivor.health) < 30) return { id: 'defeated', label: 'Defeated' };
    return { id: 'calm', label: 'Calm' };
  }

  applyResponse(question, response) {
    const player = this.gameManager?.getPlayerSurvivor?.() || this.gameManager?.player;
    if (!player?.id || !response?.effects) return { applied: false, summary: '' };

    const effects = response.effects;
    const applyToSurvivor = (entries, callback) => {
      (entries || []).forEach(entry => {
        const survivor = this._getSurvivor(entry?.survivorId);
        const delta = Number(entry?.delta) || 0;
        if (survivor && delta) callback(survivor, delta);
      });
    };

    applyToSurvivor(effects.trust, (survivor, delta) => {
      this.gameManager?.changeTrust?.(player.id, survivor.id, delta, `tribal:${question?.topic || 'response'}:${response.id}`);
    });
    applyToSurvivor(effects.relationship, (survivor, delta) => {
      this.gameManager?.systems?.relationshipSystem?.changeRelationship?.(player.id, survivor.id, delta);
    });
    applyToSurvivor(effects.suspicion, (survivor, delta) => {
      survivor.suspicion = this._clamp((Number(survivor.suspicion) || 0) + delta);
    });
    applyToSurvivor(effects.threat, (survivor, delta) => {
      const key = Number.isFinite(Number(survivor.threatScore)) ? 'threatScore' : 'threat';
      survivor[key] = this._clamp((Number(survivor[key]) || this._threat(survivor)) + delta);
    });
    (effects.targetHeat || []).forEach(entry => this._changeTargetHeat(entry?.survivorId, entry?.delta));

    return { applied: true, summary: response.text || response.label || 'You answer carefully.' };
  }

  _playerQuestion({ id, topic, severity, questionText, counterpart, ally, state, responseSet = 'name' }) {
    return {
      id,
      speaker: 'jeff',
      questionText,
      focusSurvivorId: state.player?.id || null,
      topic,
      severity,
      responseOptions: this._responseOptions({ responseSet, counterpart, ally, player: state.player }),
      mood: this.getMood(state.player, { context: state }),
      reactions: this._reactions({ focus: state.player, counterpart, state, topic })
    };
  }

  _npcQuestion({ id, topic, severity, focus, questionText, state }) {
    const mood = this.getMood(focus, { context: state });
    return {
      id,
      speaker: 'jeff',
      questionText,
      focusSurvivorId: focus?.id || null,
      topic,
      severity,
      responseOptions: [],
      mood,
      npcAnswer: this._npcAnswer(focus, mood.id, topic),
      reactions: this._reactions({ focus, state, topic })
    };
  }

  _responseOptions({ responseSet, counterpart, ally }) {
    const counterpartId = counterpart?.id || null;
    const allyId = ally?.id || null;
    const option = (id, label, text, effects) => ({ id, label, text, effects: this._normalizeEffects(effects) });

    const base = [
      option('deflect', 'Deflect', 'You keep the answer broad and refuse to give the fire a new name.', {
        suspicion: [{ survivorId: this.gameManager?.getPlayerSurvivor?.()?.id, delta: -1 }]
      }),
      option('honest', 'Be Honest', 'You acknowledge the pressure without giving away your vote.', {
        trust: allyId ? [{ survivorId: allyId, delta: 1 }] : [],
        relationship: allyId ? [{ survivorId: allyId, delta: 1 }] : [],
        suspicion: [{ survivorId: this.gameManager?.getPlayerSurvivor?.()?.id, delta: -1 }]
      }),
      option('call-out', 'Call Someone Out', `You put ${this._name(counterpart)} under the spotlight.`, {
        targetHeat: counterpartId ? [{ survivorId: counterpartId, delta: 1 }] : [],
        suspicion: [{ survivorId: this.gameManager?.getPlayerSurvivor?.()?.id, delta: 2 }],
        threat: [{ survivorId: this.gameManager?.getPlayerSurvivor?.()?.id, delta: 1 }]
      }),
      option('quiet', 'Stay Quiet', 'You let the silence do the work and reveal nothing new.', {
        suspicion: [{ survivorId: this.gameManager?.getPlayerSurvivor?.()?.id, delta: -1 }]
      })
    ];

    if (responseSet === 'alliance') {
      base[1] = option('reassure-alliance', 'Reassure Alliance', 'You publicly steady the people you came in with.', {
        trust: allyId ? [{ survivorId: allyId, delta: 2 }] : [],
        relationship: allyId ? [{ survivorId: allyId, delta: 1 }] : [],
        suspicion: [{ survivorId: this.gameManager?.getPlayerSurvivor?.()?.id, delta: 1 }]
      });
    }
    if (responseSet === 'idol') {
      base[1] = option('play-dumb', 'Play Dumb', 'You dismiss the idol talk and keep your body language even.', {
        suspicion: [{ survivorId: this.gameManager?.getPlayerSurvivor?.()?.id, delta: 1 }]
      });
    }
    if (responseSet === 'swing') {
      base[1] = option('make-pitch', 'Make a Pitch', `You make the case for ${this._name(counterpart)} without confirming your vote.`, {
        targetHeat: counterpartId ? [{ survivorId: counterpartId, delta: 1 }] : [],
        threat: [{ survivorId: this.gameManager?.getPlayerSurvivor?.()?.id, delta: 1 }]
      });
    }
    if (responseSet === 'live') {
      return [
        option('stay-seated', 'Stay Seated', 'You hold your position and refuse to chase the whispers.', {
          suspicion: [{ survivorId: this.gameManager?.getPlayerSurvivor?.()?.id, delta: -1 }]
        }),
        option('press-swing', 'Press the Swing', `You quietly make one last case against ${this._name(counterpart)}.`, {
          targetHeat: counterpartId ? [{ survivorId: counterpartId, delta: 1 }] : [],
          suspicion: [{ survivorId: this.gameManager?.getPlayerSurvivor?.()?.id, delta: 1 }]
        }),
        option('lock-ally', 'Reassure an Ally', 'You use the moment to lock in someone you trust.', {
          trust: allyId ? [{ survivorId: allyId, delta: 2 }] : [],
          relationship: allyId ? [{ survivorId: allyId, delta: 1 }] : []
        })
      ];
    }

    return base;
  }

  _normalizeEffects(effects = {}) {
    return {
      trust: effects.trust || [],
      relationship: effects.relationship || [],
      suspicion: effects.suspicion || [],
      threat: effects.threat || [],
      targetHeat: effects.targetHeat || []
    };
  }

  _npcAnswer(focus, mood, topic) {
    const name = this._name(focus);
    const answers = {
      nervous: `${name}: “Nobody is comfortable. If they say they are, they are probably lying.”`,
      paranoid: `${name}: “The vote can change with one conversation. That is what makes tonight dangerous.”`,
      confident: `${name}: “I know where I stand. The question is whether everyone else does.”`,
      exposed: `${name}: “When your name comes up, you find out very quickly who is really with you.”`,
      smug: `${name}: “People can call it strategy if they want. I call it making the move before someone makes it on you.”`,
      defeated: `${name}: “You can only control how you show up. After that, the tribe decides.”`
    };
    if (topic === 'idol_paranoia') return `${name}: “You cannot vote scared. But pretending an idol is not possible is how people get blindsided.”`;
    return answers[mood] || `${name}: “Everybody wants certainty tonight, but nobody is giving it away for free.”`;
  }

  _reactions({ focus, counterpart = null, state, topic }) {
    const candidates = state.members
      .filter(member => !this._idsEqual(member.id, focus?.id))
      .sort((a, b) => this._normalizeId(a.id).localeCompare(this._normalizeId(b.id)));
    const reactions = [];
    const first = counterpart && !this._idsEqual(counterpart.id, focus?.id) ? counterpart : candidates[0];
    const second = candidates.find(member => !this._idsEqual(member.id, first?.id));
    if (first) reactions.push({ survivorId: first.id, text: `${this._name(first)} watches without giving anything away.` });
    if (second && topic !== 'trust_paranoia_2') reactions.push({ survivorId: second.id, text: `${this._name(second)} shifts in their seat as the answer lands.` });
    return reactions;
  }

  _changeTargetHeat(survivorId, delta) {
    const id = this._normalizeId(survivorId);
    const amount = Number(delta) || 0;
    if (!id || !amount) return;

    const strategy = this.gameManager?.systems?.strategyPhaseSystem;
    const board = strategy?.getTribalTargetBoard?.() || this.gameManager?.flags?.tribalTargetBoard;
    if (!board) return;

    board.heatMap = { ...(board.heatMap || {}) };
    board.heatMap[id] = Math.max(0, (Number(board.heatMap[id]) || 0) + amount);
    const ranked = Object.entries(board.heatMap).sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
    board.primaryTargetId = ranked[0]?.[0] || null;
    board.secondaryTargetId = ranked[1]?.[0] || null;
    this.gameManager.flags = this.gameManager.flags || {};
    this.gameManager.flags.tribalTargetBoard = board;
    if (strategy?.tribalTargetBoard) strategy.tribalTargetBoard = board;
  }

  _getTribe(attendingTribeId) {
    const tribes = this.gameManager?.getTribes?.() || this.gameManager?.tribes || [];
    return tribes.find(tribe => this._idsEqual(tribe?.tribeId ?? tribe?.id, attendingTribeId))
      || this.gameManager?.getPlayerTribe?.()
      || null;
  }

  _getMember(id, members = []) {
    return (members || []).find(member => this._idsEqual(member?.id, id)) || null;
  }

  _getSurvivor(id) {
    return (this.gameManager?.survivors || []).find(member => this._idsEqual(member?.id, id)) || null;
  }

  _averageTrust(survivor, members) {
    const others = (members || []).filter(member => !this._idsEqual(member?.id, survivor?.id));
    if (!others.length) return 50;
    return others.reduce((total, member) => total + (Number(this.gameManager?.getTrust?.(survivor.id, member.id)) || 50), 0) / others.length;
  }

  _heat(id, state) {
    return Number(state?.heatMap?.[this._normalizeId(id)]) || 0;
  }

  _heatSeverity(id, state) {
    const heat = this._heat(id, state);
    return heat >= 3 ? 3 : heat >= 2 ? 2 : 1;
  }

  _threat(member) {
    const direct = Number(member?.threatScore ?? member?.threat);
    if (Number.isFinite(direct) && direct > 0) return direct > 1 ? direct : direct * 100;
    const stats = [member?.physical, member?.mental, member?.social]
      .map(value => Number(value))
      .filter(Number.isFinite);
    return stats.length ? stats.reduce((total, value) => total + value, 0) / stats.length : 50;
  }

  _hasIdol(member) {
    if (!member) return false;
    if (member.hasIdol || member?.advantages?.idol || member?.advantages?.hasIdol) return true;
    const inventory = this.gameManager?.systems?.idolSystem?.survivorInventories?.get?.(member.id);
    return Boolean(inventory?.idols?.some(idol => !idol?.isUsed && !idol?.played));
  }

  _name(survivor) {
    const raw = survivor?.firstName || survivor?.name || 'Someone';
    return String(raw).trim().split(/\s+/)[0] || 'Someone';
  }

  _clamp(value) {
    return Math.max(0, Math.min(100, Number(value) || 0));
  }

  _normalizeId(id) {
    return id === undefined || id === null ? '' : String(id);
  }

  _idsEqual(a, b) {
    return this._normalizeId(a) === this._normalizeId(b);
  }
}
