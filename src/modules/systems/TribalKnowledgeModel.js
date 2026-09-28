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
    knownTo = [], confidence = 1, source = null, day = null, details = null } = {}) {
    if (!type) return null;
    const fact = { type, subjectId: id(subjectId), actorId: id(actorId), targetId: id(targetId),
      visibility, knownTo: [...new Set(knownTo.filter(value => value != null).map(id))],
      confidence: clamp(Number(confidence) || 0), source, day, details };
    this.facts.push(fact);
    return fact;
  }

  _collect() {
    const gm = this.gameManager;
    const strategy = gm?.systems?.strategyPhaseSystem;
    const raw = strategy?.getSummaryFacts?.() || strategy?.strategyFacts || [];
    const playerId = gm?.getPlayerSurvivor?.()?.id;
    const alliances = gm?.systems?.allianceSystem?.getAlliances?.() || [];
    for (const alliance of alliances.filter(entry => entry.active !== false)) {
      const parties = (alliance.memberIds || alliance.members || []).filter(memberId => this._active(memberId));
      if (parties.length < 2) continue;
      this.add({ type: 'allianceMembership', subjectId: alliance.id, visibility: alliance.public === true ? 'PUBLIC' : 'PRIVATE',
        knownTo: parties, source: 'alliance', details: { memberIds: parties } });
    }
    for (const deal of Object.values(gm?.systems?.dealSystem?.dealsById || {})) {
      if (!['PROPOSED', 'ACCEPTED'].includes(deal?.status)) continue;
      const terms = deal.terms || {};
      this.add({ type: 'deal', subjectId: deal.id, targetId: terms.protectedId ?? terms.targetId ?? null,
        visibility: deal.public === true || deal.visibility === 'public' ? 'PUBLIC' : 'PRIVATE',
        knownTo: deal.parties || [], source: 'deal', details: {
          dealType: deal.type, parties: (deal.parties || []).map(id), status: deal.status,
          targetId: id(terms.targetId), protectedId: id(terms.protectedId),
          allianceId: terms.allianceId ?? null
        } });
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
    const relevantEvents = new Set(['playerStrategizedWithNpc', 'NAME_MENTION', 'PLOT_PACKET',
      'ACCUSATION_LOGGED', 'playerBlamedSurvivor', 'playerDefendedSurvivor', 'playerCalledThreat',
      'player_planted_idol_rumor', 'tribal_call-out', 'tribal_deny-target',
      'tribal_reassure-alliance', 'tribal_distance-ally', 'visibleLiveWhisper']);
    for (const entry of memory?.getStructuredEvents?.() || memory?.structuredEvents || []) {
      if (!entry?.type) continue;
      if (!relevantEvents.has(entry.type)) continue;
      this.add({ type: entry.type, subjectId: entry.subjectId ?? entry.data?.targetId,
        actorId: entry.speakerId, targetId: entry.subjectId, knownTo: [entry.speakerId, entry.listenerId],
        visibility: entry.data?.public === true ? 'PUBLIC' : 'PRIVATE', source: 'memory', day: entry.day,
        details: { contextTag: entry.data?.contextTag, claimedTargetId: entry.data?.claimedTargetId,
          participants: entry.type === 'visibleLiveWhisper' ? entry.data?.participants : undefined } });
    }
    for (const entry of memory?.getSocialEvents?.() || memory?.socialEvents || []) {
      if (!['MENTION', 'CONFRONTATION'].includes(entry?.type)) continue;
      this.add({ type: `social_${entry.type}`, actorId: entry.speakerId, subjectId: entry.subjectId,
        knownTo: [entry.speakerId, entry.listenerId],
        visibility: entry.data?.public === true ? 'PUBLIC' : 'PRIVATE',
        confidence: entry.type === 'MENTION' ? .55 : 1, source: 'socialMemory', day: entry.day });
    }
    // Legacy saves keep personally owned memories outside structuredEvents. Import
    // only categories with a clear witness; memory existence alone is not publicity.
    for (const [owner, store] of Object.entries(memory?.memory || {})) {
      for (const promise of store?.promises || []) this.add({ type: 'rememberedPromise',
        actorId: promise.withWho, subjectId: promise.withWho, knownTo: [owner, promise.withWho],
        source: 'memory', day: promise.day });
      for (const betrayal of store?.betrayals || []) this.add({ type: 'rememberedBetrayal',
        actorId: betrayal.betrayedBy, subjectId: betrayal.betrayedBy, knownTo: [owner],
        source: 'memory', day: betrayal.day });
      for (const lie of store?.lies || []) if (lie.discovered) this.add({ type: 'discoveredLie',
        actorId: lie.liarId, subjectId: lie.targetId, knownTo: [owner], source: 'memory', day: lie.discoveredDay ?? lie.day });
      for (const request of store?.targetRequests || []) this.add({ type: 'targetRequest',
        actorId: request.speakerId, subjectId: request.targetId, knownTo: [owner, request.speakerId],
        source: 'memory', day: request.day });
      for (const gossip of store?.gossip || []) this.add({ type: 'heardGossip',
        actorId: gossip.sourceId, subjectId: gossip.aboutId, visibility: 'RUMOR',
        knownTo: [owner, gossip.sourceId], confidence: gossip.reliability === 'confirmed' ? .85 : .45,
        source: 'memory', day: gossip.day });
    }
    for (const member of this.members) {
      const inventory = gm?.systems?.idolSystem?.survivorInventories?.get?.(member.id)
        || gm?.systems?.idolSystem?.survivorInventories?.get?.(id(member.id));
      if (member.hasIdol || member.advantages?.idol || member.advantages?.hasIdol
        || inventory?.idols?.some(item => !item.isUsed && !item.played)) {
        this.add({ type: 'ownIdol', subjectId: member.id, visibility: 'PRIVATE',
          knownTo: [member.id], source: 'inventory' });
      }
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

  _active(memberId) { return this.members.some(member => !member.isOut && sameSurvivorId(member.id, memberId)); }
  getKnownAlliances(viewerId) { return this.factsFor(viewerId).filter(fact => fact.type === 'allianceMembership'); }
  getKnownAllies(viewerId) {
    const allied = new Set(this.getKnownAlliances(viewerId)
      .filter(fact => fact.details?.memberIds?.some(memberId => sameSurvivorId(memberId, viewerId)))
      .flatMap(fact => fact.details?.memberIds || []).map(id));
    return this.members.filter(member => !sameSurvivorId(member.id, viewerId) && !member.isOut && allied.has(id(member.id)));
  }
  areKnownAllies(aId, bId, viewerId) { return this.getKnownAlliances(viewerId).some(fact =>
    [aId, bId].every(person => fact.details?.memberIds?.some(memberId => sameSurvivorId(memberId, person)))); }
  getKnownDeals(viewerId) { return this.factsFor(viewerId).filter(fact => fact.type === 'deal'); }

  perceivedDangerBreakdown(survivor) {
    if (!survivor) return { score: 0, factors: [] };
    const facts = this.factsFor(survivor.id);
    const factors = [{ type: 'baseline', delta: .12 }];
    const add = (type, delta) => { if (delta) factors.push({ type, delta }); };
    const self = fact => sameSurvivorId(fact.subjectId, survivor.id);
    const ownAllies = this.getKnownAllies(survivor.id);
    const closeTo = otherId => ownAllies.some(ally => sameSurvivorId(ally.id, otherId))
      || this.getKnownDeals(survivor.id).some(fact => fact.details?.status === 'ACCEPTED'
        && fact.details?.parties?.some(party => sameSurvivorId(party, otherId)));
    const liarKnown = speakerId => facts.some(fact => fact.type === 'discoveredLie'
      && sameSurvivorId(fact.actorId, speakerId));
    const currentDay = Number(this.gameManager?.getDay?.() ?? this.gameManager?.getCurrentDay?.());
    const recency = fact => fact.day != null && Number.isFinite(currentDay)
      && Number(fact.day) < currentDay ? .25 : 1;
    let mentions = 0; let callouts = 0; let distancing = 0; let reassurance = 0;
    let betrayals = 0; let lies = 0; let whispers = 0;
    for (const fact of facts) {
      if (self(fact) && ['playerNameFloated', 'rumor', 'NAME_MENTION', 'targetProposed',
        'targetResponse', 'npcIntentTargetUpdated', 'targetRequest', 'heardGossip',
        'social_MENTION', 'social_CONFRONTATION'].includes(fact.type)) {
        mentions += (['heardGossip', 'social_MENTION'].includes(fact.type) ? .09 : .18)
          * fact.confidence * recency(fact);
      }
      if (self(fact) && fact.type === 'tribal_call-out') callouts += .26 * recency(fact);
      if (self(fact) && fact.type === 'tribal_distance-ally'
        && closeTo(fact.actorId)) distancing += .16 * recency(fact);
      if (self(fact) && fact.type === 'tribal_deny-target' && liarKnown(fact.actorId)) lies += .13 * recency(fact);
      if (self(fact) && fact.type === 'tribal_reassure-alliance'
        && !liarKnown(fact.actorId)) reassurance -= .07 * recency(fact);
      if (fact.type === 'visibleLiveWhisper') {
        const participants = fact.details?.participants || [];
        const allyInWhisper = participants.some(person => ownAllies.some(ally => sameSurvivorId(ally.id, person)));
        const outsiderInWhisper = participants.some(person => !sameSurvivorId(person, survivor.id)
          && !ownAllies.some(ally => sameSurvivorId(ally.id, person)));
        if (self(fact) || (allyInWhisper && outsiderInWhisper)) whispers += .08 * recency(fact);
      }
      if (fact.type === 'rememberedBetrayal' && ownAllies.some(ally => sameSurvivorId(ally.id, fact.actorId)))
        betrayals += .12;
      if (fact.type === 'discoveredLie' && ownAllies.some(ally => sameSurvivorId(ally.id, fact.actorId)))
        lies += .12;
    }
    add('knownNameMention', Math.min(.48, mentions));
    add('publicTribalCallout', Math.min(.35, callouts));
    add('publicAllyDistance', Math.min(.22, distancing));
    add('crediblePublicReassurance', Math.max(-.12, reassurance));
    add('visibleWhisper', Math.min(.16, whispers));
    add('allyBetrayal', Math.min(.18, betrayals));
    add('knownLieOrFalseDenial', Math.min(.22, lies));
    const suspicion = Number(survivor.suspicion ?? survivor.personality?.paranoia ?? survivor.traits?.paranoia ?? 0);
    const trust = Number(survivor.trustSignals?.recent ?? survivor.socialSignals?.trust ?? .5);
    add('paranoia', clamp(suspicion > 1 ? suspicion / 100 : suspicion) * .28);
    add('lowTrust', Math.max(0, .5 - clamp(trust > 1 ? trust / 100 : trust)) * .34);
    const gm = this.gameManager;
    const steadyAllies = ownAllies.filter(ally => Number(gm?.getTrust?.(survivor.id, ally.id) ?? 50) >= 60);
    add('trustedAllies', -Math.min(.10, steadyAllies.length * .05));
    const protectedDeals = this.getKnownDeals(survivor.id).filter(fact => fact.details?.status === 'ACCEPTED'
      && ['MUTUAL_PROTECTION', 'FINAL_TWO', 'IDOL_PROTECTION'].includes(fact.details?.dealType)
      && fact.details.parties.some(party => !sameSurvivorId(party, survivor.id)
        && this._active(party)
        && Number(gm?.getTrust?.(survivor.id, party) ?? 50) >= 60));
    add('trustedPromise', protectedDeals.length ? -.04 : 0);
    return { score: clamp(factors.reduce((total, factor) => total + factor.delta, 0)), factors };
  }

  perceivedDanger(survivor) {
    return this.perceivedDangerBreakdown(survivor).score;
  }

  debugSnapshot(survivorId) {
    return { publicFacts: this.publicFacts(), privateFacts: this.factsFor(survivorId)
      .filter(fact => fact.visibility === 'PRIVATE'), rumors: this.factsFor(survivorId)
      .filter(fact => fact.visibility === 'RUMOR'), perceivedDanger: this.perceivedDanger(
        this.members.find(member => sameSurvivorId(member.id, survivorId))),
      dangerBreakdown: this.perceivedDangerBreakdown(this.members.find(member => sameSurvivorId(member.id, survivorId))),
      knownAlliances: this.getKnownAlliances(survivorId), knownDeals: this.getKnownDeals(survivorId),
      rememberedPromises: this.factsFor(survivorId).filter(fact => fact.type === 'rememberedPromise'),
      knownBetrayals: this.factsFor(survivorId).filter(fact => fact.type === 'rememberedBetrayal'),
      discoveredLies: this.factsFor(survivorId).filter(fact => fact.type === 'discoveredLie') };
  }
}
