import { sameSurvivorId } from '../utils/SurvivorIds.js';

const id = value => value == null ? '' : String(value);
const clamp = value => Math.max(0, Math.min(1, value));

/** A session snapshot of witnessed events, private conversations and uncertain rumors.
 * Engine target boards, unrevealed ballots and inventory ownership are deliberately
 * absent: their presence in a GameManager is not evidence that a person knows them.
 */
export default class TribalKnowledgeModel {
  constructor(gameManager, members = []) {
    this.gameManager = gameManager;
    this.members = members;
    this.facts = [];
    this._collect();
  }

  add({ type, subjectId = null, actorId = null, targetId = null, visibility = 'PRIVATE',
    knownTo = [], confidence = 1, source = null, day = null } = {}) {
    if (!type) return null;
    const fact = { type, subjectId: id(subjectId), actorId: id(actorId), targetId: id(targetId),
      visibility, knownTo: [...new Set(knownTo.filter(value => value != null).map(id))],
      confidence: clamp(Number(confidence) || 0), source, day };
    this.facts.push(fact);
    return fact;
  }

  _collect() {
    const gm = this.gameManager;
    const strategy = gm?.systems?.strategyPhaseSystem;
    const raw = strategy?.getSummaryFacts?.() || strategy?.strategyFacts || [];
    const playerId = gm?.getPlayerSurvivor?.()?.id;
    const alliances = gm?.systems?.allianceSystem?.getAlliances?.() || [];
    for (const alliance of alliances) {
      const parties = alliance.memberIds || alliance.members || [];
      this.add({ type: 'allianceMembership', subjectId: alliance.id, visibility: alliance.public === true ? 'PUBLIC' : 'PRIVATE',
        knownTo: parties, source: 'alliance' });
    }
    for (const deal of Object.values(gm?.systems?.dealSystem?.dealsById || {})) {
      if (!['PROPOSED', 'ACCEPTED'].includes(deal?.status)) continue;
      this.add({ type: 'deal', subjectId: deal.protectedTargetId ?? deal.targetId,
        visibility: deal.public === true ? 'PUBLIC' : 'PRIVATE', knownTo: deal.parties || [], source: 'deal' });
    }
    for (const fact of raw) {
      if (!fact?.type || fact.type === 'tribalTargetBoardComputed') continue;
      const alliance = alliances.find(entry => id(entry.id) === id(fact.allianceId));
      const knownTo = [fact.speakerId];
      if (fact.toPlayer || fact.type === 'personalTargetSet' || fact.type === 'personalTargetLocked') knownTo.push(playerId);
      if (fact.allianceId) knownTo.push(...(alliance?.memberIds || alliance?.members || []));
      if (fact.listenerId != null) knownTo.push(fact.listenerId);
      this.add({ type: fact.type, subjectId: fact.aboutId ?? fact.targetId, actorId: fact.speakerId,
        targetId: fact.targetId, visibility: fact.public === true ? 'PUBLIC'
          : fact.type === 'rumor' || fact.type === 'playerNameFloated' ? 'RUMOR' : 'PRIVATE',
        knownTo, confidence: fact.confidence ?? (fact.type === 'rumor' ? .55 : 1),
        source: 'strategy', day: fact.day });
    }
    const memory = gm?.systems?.socialMemorySystem;
    for (const entry of memory?.getStructuredEvents?.() || memory?.structuredEvents || []) {
      if (!entry?.type) continue;
      this.add({ type: entry.type, subjectId: entry.subjectId ?? entry.data?.targetId,
        actorId: entry.speakerId, targetId: entry.subjectId, knownTo: [entry.speakerId, entry.listenerId],
        visibility: entry.data?.public === true ? 'PUBLIC' : 'PRIVATE', source: 'memory', day: entry.day });
    }
    for (const member of this.members) {
      if (gm?.hasImmunity?.(member) || member.hasImmunity) {
        this.add({ type: 'individualImmunity', subjectId: member.id, visibility: 'PUBLIC', source: 'challenge' });
      }
    }
    for (const tribal of (gm?.tribalCouncilLog || gm?.gameHistory?.tribals || [])) {
      if (tribal.eliminatedId != null) this.add({ type: 'previousElimination', subjectId: tribal.eliminatedId,
        visibility: 'PUBLIC', source: 'history', day: tribal.day });
      if (tribal.wasTie || tribal.initialTie) this.add({ type: 'previousTie', visibility: 'PUBLIC', source: 'history', day: tribal.day });
      for (const play of tribal.idolPlays || []) this.add({ type: 'revealedIdol',
        subjectId: play.playerId ?? play.playedById, visibility: 'PUBLIC', source: 'history', day: tribal.day });
    }
  }

  isPublic(fact) { return fact?.visibility === 'PUBLIC'; }
  jeffCanReference(fact) { return this.isPublic(fact); }
  knows(survivorId, fact) { return Boolean(fact && fact.visibility !== 'RUMOR' &&
    (this.isPublic(fact) || fact.knownTo.some(person => sameSurvivorId(person, survivorId)))); }
  suspects(survivorId, fact) { return Boolean(fact && fact.visibility === 'RUMOR' &&
    fact.knownTo.some(person => sameSurvivorId(person, survivorId))); }
  confidence(survivorId, fact) {
    return this.knows(survivorId, fact) || this.suspects(survivorId, fact) ? fact.confidence : 0;
  }
  factsFor(survivorId) { return this.facts.filter(fact => this.knows(survivorId, fact) || this.suspects(survivorId, fact)); }
  publicFacts() { return this.facts.filter(fact => this.jeffCanReference(fact)); }

  perceivedDanger(survivor) {
    if (!survivor) return 0;
    const mentions = this.factsFor(survivor.id).filter(fact => sameSurvivorId(fact.subjectId, survivor.id)
      && ['playerNameFloated', 'rumor', 'NAME_MENTION', 'targetProposed', 'targetResponse',
        'npcIntentTargetUpdated', 'playerStrategizedWithNpc'].includes(fact.type));
    const suspicion = Number(survivor.suspicion ?? survivor.personality?.paranoia ?? survivor.traits?.paranoia ?? 0);
    const trait = suspicion > 1 ? suspicion / 100 : suspicion;
    const trust = Number(survivor.trustSignals?.recent ?? survivor.socialSignals?.trust ?? .5);
    const normalizedTrust = trust > 1 ? trust / 100 : trust;
    return clamp(.12 + Math.min(.54, mentions.reduce((sum, fact) => sum + .19 * fact.confidence, 0))
      + Math.max(0, .5 - normalizedTrust) * .34 + clamp(trait) * .28);
  }

  debugSnapshot(survivorId) {
    return { publicFacts: this.publicFacts(), privateFacts: this.factsFor(survivorId)
      .filter(fact => fact.visibility === 'PRIVATE'), rumors: this.factsFor(survivorId)
      .filter(fact => fact.visibility === 'RUMOR'), perceivedDanger: this.perceivedDanger(
        this.members.find(member => sameSurvivorId(member.id, survivorId))) };
  }
}
