/**
 * Builds deterministic Tribal Council dialogue from the current game state.
 * Plans dialogue once per session from what people can plausibly observe.
 */
import TribalKnowledgeModel from './TribalKnowledgeModel.js';
import { composeNpcAnswer } from './TribalDialogueComposer.js';
export default class TribalQuestionEngine {
  constructor(gameManager) {
    this.gameManager = gameManager;
  }

  createContext({ attendingTribeId = null } = {}) {
    const tribe = this._getTribe(attendingTribeId);
    const members = (tribe?.members || []).filter(member => member && !member.isOut);
    const player = this.gameManager?.getPlayerSurvivor?.() || this.gameManager?.player || null;
    const strategy = this.gameManager?.systems?.strategyPhaseSystem;
    const knowledge = new TribalKnowledgeModel(this.gameManager, members);
    const alliances = (this.gameManager?.systems?.allianceSystem?.getAlliances?.() || [])
      .filter(alliance => alliance.public === true && (alliance.memberIds || []).some(id => members.some(member => this._idsEqual(member.id, id))));
    const facts = knowledge.publicFacts();
    const playerId = this._normalizeId(player?.id);
    const playerNameWasFloated = facts.some(fact => this._idsEqual(fact.subjectId, playerId)
      && ['playerNameFloated', 'NAME_MENTION'].includes(fact.type));
    const publicTargets = facts.filter(fact => ['NAME_MENTION', 'targetProposed', 'playerNameFloated'].includes(fact.type)
      && members.some(member => this._idsEqual(member.id, fact.subjectId)));

    return {
      attendingTribeId: tribe?.tribeId ?? tribe?.id ?? attendingTribeId ?? null,
      tribe,
      members,
      player,
      playerId,
      strategy,
      knowledge,
      alliances,
      activeDeals: [],
      facts,
      playerNameWasFloated,
      primaryTargetId: this._normalizeId(publicTargets.at(-1)?.subjectId),
      secondaryTargetId: this._normalizeId(publicTargets.at(-2)?.subjectId),
      liveSignal: (strategy?.getSummaryFacts?.() || strategy?.strategyFacts || [])
        .findLast(fact => ['lateTargetSwitch', 'lateVolatility'].includes(fact.type) && fact.severity >= .6)
    };
  }

  getOpeningLine(context = this.createContext()) {
    return context?.knowledge?.publicFacts().some(fact => fact.type === 'previousTie')
      ? 'The last vote reminded this tribe how quickly certainty can disappear. Where are you tonight?'
      : 'You lost the chance to stay together another day. What has changed since you left camp?';
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

    const others = state.members.filter(member => !this._idsEqual(member.id, player?.id));
    const day = Number(this.gameManager?.getDay?.() ?? 1);
    const broadFocus = others.length ? others[day % others.length] : player;
    if (broadFocus) add(this._npcQuestion({ id: 'tribe-tonight', topic: 'tribe_state', severity: 1,
      focus: broadFocus, questionText: `${this._name(broadFocus)}, what did the trip back from the challenge feel like for this tribe?`, state }));

    if (player && state.playerNameWasFloated) {
      add(this._playerQuestion({
        id: 'player-name-mentioned',
        topic: 'player_name_thrown_out',
        severity: 3,
        questionText: `${this._name(player)}, when you hear your name, how do you decide what to believe?`,
        counterpart,
        ally: playerAlly,
        state
      }));
    }

    const previous = state.facts.findLast(fact => ['previousTie', 'revealedIdol'].includes(fact.type));
    const historyFocus = others.find(member => !this._idsEqual(member.id, broadFocus?.id));
    if (previous && historyFocus) add(this._npcQuestion({ id: 'previous-tribal', topic: 'tribal_history',
      severity: 2, focus: historyFocus,
      questionText: previous.type === 'previousTie'
        ? `${this._name(historyFocus)}, after a tie, can anyone be certain where loyalty sits?`
        : `${this._name(historyFocus)}, after an idol changed a vote before, how does that memory affect tonight?`, state }));

    if (primary && !this._idsEqual(primary.id, player?.id)) {
      add(this._npcQuestion({
        id: 'target-heat',
        topic: 'obvious_boot',
        severity: 2,
        focus: primary,
        questionText: `${this._name(primary)}, how much can anyone really know about where the votes are going tonight?`,
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
          questionText: `${this._name(focus)}, what does loyalty mean when someone from this tribe is leaving tonight?`,
          state
        }));
      }
    }

    const idolFact = state.facts.find(fact => ['revealedIdol', 'publicIdolRumor', 'idolSearch'].includes(fact.type));
    const idolConcern = idolFact ? this._getMember(idolFact.subjectId, state.members)
      || state.members.find(member => !this._idsEqual(member.id, player?.id)) : null;
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

    if (secondary && primary && state.facts.some(fact => ['publicDisagreement', 'publicSwing'].includes(fact.type))) {
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

    if (!questions.length && state.members.length) {
      const focus = state.members.find(member => !this._idsEqual(member.id, player?.id)) || player;
      add(this._npcQuestion({ id: 'trust', topic: 'trust', severity: 1, focus,
        questionText: `${this._name(focus)}, what does trust mean this close to a vote?`, state }));
    }

    const limit = Math.min(Math.max(1, Number(maxQuestions) || 5),
      state.members.length <= 3 ? 2 : state.members.length <= 6 ? 3 : state.members.length <= 9 ? 4 : 5);
    const weights = { player_name_thrown_out: 4, tribal_history: 3, obvious_boot: 3,
      swing_vote_pressure: 3, idol_paranoia: 2.5, alliance_cracks: 2, big_threat: 1.5,
      loyalty_vs_survival: 1, trust: .5 };
    const broad = questions.find(question => question.topic === 'tribe_state');
    const ranked = questions.filter(question => question !== broad).sort((a, b) =>
      (weights[b.topic] || 0) + b.severity * .2 - ((weights[a.topic] || 0) + a.severity * .2)
      || a.id.localeCompare(b.id));
    const chosen = [];
    for (const question of ranked) {
      if (chosen.length >= Math.max(0, limit - Number(Boolean(broad)))) break;
      if (this._idsEqual(question.focusSurvivorId, player?.id)
        && chosen.filter(entry => this._idsEqual(entry.focusSurvivorId, player?.id)).length >= 2) continue;
      chosen.push(question);
    }
    if (limit >= 3 && player && (weights[chosen.at(-1)?.topic] || 0) <= 1.5
      && !chosen.some(question => this._idsEqual(question.focusSurvivorId, player.id))) {
      const playerQuestion = ranked.find(question => this._idsEqual(question.focusSurvivorId, player.id));
      if (playerQuestion) chosen[chosen.length - 1] = playerQuestion;
    }
    // Jeff opens wide, follows the strongest witnessed storyline, and then
    // leaves a little uncertainty. This ranking never receives the secret boot.
    const arc = { tribal_history: 1, alliance_cracks: 2, big_threat: 2,
      idol_paranoia: 2, obvious_boot: 3, player_name_thrown_out: 3,
      swing_vote_pressure: 3, loyalty_vs_survival: 4 };
    return [...(broad ? [broad] : []), ...chosen.sort((a, b) =>
      (arc[a.topic] || 3) - (arc[b.topic] || 3) || a.id.localeCompare(b.id))].slice(0, limit);
  }

  generateLiveTribalMoment({ attendingTribeId = null, context = null } = {}) {
    const state = context || this.createContext({ attendingTribeId });
    const signal = state.liveSignal;
    if (!signal) return null;

    const player = state.player;
    const counterpart = this._getMember(signal.toTargetId, state.members)
      || state.members.find(member => !this._idsEqual(member.id, player?.id));
    if (!player) return null;
    const actor = this._getMember(signal.speakerId, state.members);
    if (!actor) return null;
    const recipient = state.members.filter(member => !this._idsEqual(member.id, actor.id)
      && (signal.toPlayer === true || !this._idsEqual(member.id, player.id)))
      .sort((a, b) => (Number(this.gameManager?.getTrust?.(actor.id, b.id)) || 50)
        - (Number(this.gameManager?.getTrust?.(actor.id, a.id)) || 50)
        || this._normalizeId(a.id).localeCompare(this._normalizeId(b.id)))[0];

    const involved = this._idsEqual(signal.speakerId, player.id) || signal.toPlayer === true;
    const moment = this._playerQuestion({
      id: 'live-tribal-tension',
      topic: 'live_tribal_tension',
      severity: 3,
      questionText: `${this._name(actor)} leans toward ${this._name(recipient)} for a quiet conversation. Others notice the shift.`,
      counterpart,
      ally: null,
      state,
      responseSet: 'live'
    });
    moment.liveParticipants = [actor.id, recipient?.id].filter(Boolean);
    moment.liveSignal = signal;
    moment.focusSurvivorId = signal.speakerId;
    if (!involved) moment.responseOptions = [];
    return moment;
  }

  getMood(survivor, { context = null } = {}) {
    const state = context || this.createContext();
    if (!survivor) return { id: 'calm', label: 'Calm' };

    const danger = state.knowledge?.perceivedDanger(survivor) ?? 0;
    const protectedByAlliance = state.alliances.some(alliance => (
      (alliance.memberIds || []).filter(id => state.members.some(member => this._idsEqual(member.id, id))).length >= 2
      && (alliance.memberIds || []).some(id => this._idsEqual(id, survivor.id))
    ));

    if (danger >= .65) return { id: 'paranoid', label: 'Paranoid' };
    if (danger >= .4) return { id: 'nervous', label: 'Nervous' };
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
        const delta = Math.max(-3, Math.min(3, Number(entry?.delta) || 0));
        if (survivor && delta) callback(survivor, delta);
      });
    };

    applyToSurvivor(effects.trust, (survivor, delta) => {
      this.gameManager?.changeTrust?.(player.id, survivor.id, Math.max(-3, Math.min(3, delta)), `tribal:${question?.topic || 'response'}:${response.id}`);
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

    const members = this._getTribe(null)?.members?.filter(member => !member.isOut) || [];
    const knowledge = new TribalKnowledgeModel(this.gameManager, members);
    const subjectId = response.subjectId;
    if (response.id === 'deny-target' && subjectId) {
      for (const listener of members.filter(member => !this._idsEqual(member.id, player.id))) {
        const knowsContradiction = knowledge.factsFor(listener.id).some(fact =>
          fact.type === 'playerStrategizedWithNpc' && this._idsEqual(fact.actorId, player.id)
          && this._idsEqual(fact.subjectId, subjectId));
        if (knowsContradiction) this.gameManager?.changeTrust?.(player.id, listener.id, -3, 'tribal:knownContradiction');
      }
    }
    const memory = this.gameManager?.systems?.socialMemorySystem;
    if (['call-out', 'deny-target', 'reassure-alliance'].includes(response.id) && subjectId) {
      memory?.recordStructuredEvent?.({ type: `tribal_${response.id}`, speakerId: player.id,
        subjectId, data: { public: true }, day: this.gameManager?.getDay?.(), phase: 'tribalCouncil' });
    }
    if (question?.topic === 'live_tribal_tension' && response.id === 'press-swing') {
      const signal = question.liveSignal;
      const strategy = this.gameManager?.systems?.strategyPhaseSystem;
      const current = strategy?.getNpcTargetIntent?.(signal?.speakerId);
      if (signal?.speakerId && signal?.toTargetId && Number(current?.confidence ?? 1) < .65) {
        strategy.updateNpcIntentTarget?.(signal.speakerId, signal.toTargetId,
          { reason: 'liveTribalPlayerPitch', confidenceDelta: .08 });
      }
    }

    return { applied: true, summary: response.text || response.label || 'You answer carefully.' };
  }

  createFollowUp(question, response, context = this.createContext()) {
    if (!question || !response || response.id !== 'deny-target' || !response.subjectId) return null;
    const counterpart = this._getMember(response.subjectId, context.members);
    if (!counterpart) return null;
    const remembers = member => context.knowledge.factsFor(member.id).some(fact =>
      fact.type === 'playerStrategizedWithNpc' && this._idsEqual(fact.subjectId, counterpart.id)
      && this._idsEqual(fact.actorId, context.playerId));
    // A listener who remembers the private pitch can visibly react. Jeff asks
    // about that reaction, not about a private conversation he could not know.
    const witness = context.members.find(member => !this._idsEqual(member.id, context.playerId) && remembers(member));
    const focus = witness || counterpart;
    const follow = this._npcQuestion({ id: `${question.id}-follow-up`, topic: 'public_denial', severity: 2,
      focus, questionText: `${this._name(focus)}, you reacted. How does that answer land with you?`, state: context });
    if (witness) follow.npcAnswer = `${this._name(focus)}: “I remember that conversation differently.”`;
    follow.reactions = context.player ? [{ survivorId: context.player.id, cue: 'glance' }] : [];
    return follow;
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
      npcAnswer: this._npcAnswer(focus, mood.id, topic, state),
      reactions: this._reactions({ focus, state, topic })
    };
  }

  _responseOptions({ responseSet, counterpart, ally }) {
    const counterpartId = counterpart?.id || null;
    const allyId = ally?.id || null;
    const option = (id, label, text, effects) => ({ id, label, text, effects: this._normalizeEffects(effects) });

    const base = [
      option('deflect', 'Stay vague', 'I can only speak for the conversations I had.', {
        suspicion: [{ survivorId: this.gameManager?.getPlayerSurvivor?.()?.id, delta: -1 }]
      }),
      option('honest', 'Admit concern', 'I have heard my name. I would be foolish to ignore that.', {
        trust: allyId ? [{ survivorId: allyId, delta: 1 }] : [],
        relationship: allyId ? [{ survivorId: allyId, delta: 1 }] : [],
        suspicion: [{ survivorId: this.gameManager?.getPlayerSurvivor?.()?.id, delta: -1 }]
      }),
      option('call-out', `Name ${this._name(counterpart)}`, `${this._name(counterpart)} has been talking to people. I want to know where they stand.`, {
        targetHeat: counterpartId ? [{ survivorId: counterpartId, delta: 1 }] : [],
        suspicion: [{ survivorId: this.gameManager?.getPlayerSurvivor?.()?.id, delta: 2 }],
        threat: [{ survivorId: this.gameManager?.getPlayerSurvivor?.()?.id, delta: 1 }]
      }),
      option('deny-target', `Deny targeting ${this._name(counterpart)}`, `I have not been pushing ${this._name(counterpart)}'s name.`, {
        suspicion: [{ survivorId: this.gameManager?.getPlayerSurvivor?.()?.id, delta: -1 }]
      })
    ];
    base[2].subjectId = counterpartId;
    base[3].subjectId = counterpartId;

    if (responseSet === 'alliance') {
      base[1] = option('reassure-alliance', 'Stand by your people', 'I still trust the people who got me here.', {
        trust: allyId ? [{ survivorId: allyId, delta: 2 }] : [],
        relationship: allyId ? [{ survivorId: allyId, delta: 1 }] : [],
        suspicion: [{ survivorId: this.gameManager?.getPlayerSurvivor?.()?.id, delta: 1 }]
      });
      base[1].subjectId = allyId;
    }
    if (responseSet === 'idol') {
      base[1] = option('play-dumb', 'Brush it off', 'I cannot plan my whole game around a rumor.', {
        suspicion: [{ survivorId: this.gameManager?.getPlayerSurvivor?.()?.id, delta: 1 }]
      });
    }
    if (responseSet === 'swing') {
      base[1] = option('make-pitch', 'Make your case', `${this._name(counterpart)} deserves a closer look tonight.`, {
        targetHeat: counterpartId ? [{ survivorId: counterpartId, delta: 1 }] : [],
        threat: [{ survivorId: this.gameManager?.getPlayerSurvivor?.()?.id, delta: 1 }]
      });
    }
    if (responseSet === 'live') {
      return [
        option('stay-seated', 'Stay Seated', 'I am going to let people show me where they stand.', {
          suspicion: [{ survivorId: this.gameManager?.getPlayerSurvivor?.()?.id, delta: -1 }]
        }),
        option('press-swing', 'Talk to someone', `You quietly make one last case against ${this._name(counterpart)}.`, {
          targetHeat: counterpartId ? [{ survivorId: counterpartId, delta: 1 }] : [],
          suspicion: [{ survivorId: this.gameManager?.getPlayerSurvivor?.()?.id, delta: 1 }]
        }),
        option('lock-ally', 'Check in with an ally', 'You use the moment to lock in someone you trust.', {
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

  _npcAnswer(focus, mood, topic, state) {
    return composeNpcAnswer({ speaker: focus, topic, mood, knowledge: state.knowledge,
      strategy: state.strategy, members: state.members, day: this.gameManager?.getDay?.() }).text;
  }

  _reactions({ focus, counterpart = null, state, topic }) {
    const candidates = state.members
      .filter(member => !this._idsEqual(member.id, focus?.id))
      .sort((a, b) => this._normalizeId(a.id).localeCompare(this._normalizeId(b.id)));
    const reactions = [];
    const first = counterpart && !this._idsEqual(counterpart.id, focus?.id) ? counterpart
      : candidates.find(member => state.knowledge?.factsFor(member.id)
        .some(fact => this._idsEqual(fact.subjectId, focus?.id)));
    const second = candidates.find(member => !this._idsEqual(member.id, first?.id)
      && state.knowledge?.factsFor(member.id).some(fact => this._idsEqual(fact.subjectId, focus?.id)));
    if (first) reactions.push({ survivorId: first.id, cue: 'glance' });
    if (second) reactions.push({ survivorId: second.id, cue: 'concern' });
    return reactions;
  }

  _changeTargetHeat(survivorId, delta) {
    const id = this._normalizeId(survivorId);
    const amount = Math.max(-1, Math.min(1, Number(delta) || 0));
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

  _threat(member) {
    const direct = Number(member?.threatScore ?? member?.threat);
    if (Number.isFinite(direct) && direct > 0) return direct > 1 ? direct : direct * 100;
    const stats = [member?.physical, member?.mental, member?.social]
      .map(value => Number(value))
      .filter(Number.isFinite);
    return stats.length ? stats.reduce((total, value) => total + value, 0) / stats.length : 50;
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
