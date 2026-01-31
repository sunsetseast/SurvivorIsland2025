import eventManager, { GameEvents } from '../core/EventManager.js';

const STAKES_MULTIPLIERS = {
  minor: 0.5,
  standard: 1.0,
  major: 1.6
};

class DealConsequencesSystem {
  constructor(gameManager) {
    this.gameManager = gameManager;
    this.debug = false;
  }

  initialize() {
    eventManager.subscribe(GameEvents.DEAL_ACCEPTED, this._handleDealAccepted.bind(this));
    eventManager.subscribe(GameEvents.DEAL_REFUSED, this._handleDealRefused.bind(this));
    eventManager.subscribe(GameEvents.DEAL_BROKEN, this._handleDealBroken.bind(this));
    eventManager.subscribe(GameEvents.DEAL_COMPLETED, this._handleDealCompleted.bind(this));
  }

  reset() {
    // No persistent state yet.
  }

  setDebug(enabled) {
    this.debug = Boolean(enabled);
  }

  _handleDealAccepted({ deal }) {
    if (!deal) return;
    const [aId, bId] = deal.parties || [];
    if (!aId || !bId) return;
    const delta = this._scaleDelta(5, deal.stakes);
    this._applyTrustDelta(aId, bId, delta);
    this._applyTrustDelta(bId, aId, delta);
  }

  _handleDealRefused({ deal, byId }) {
    if (!deal) return;
    const proposerId = this._getProposerId(deal);
    if (!proposerId) return;
    const otherId = byId || this._getOtherPartyId(deal, proposerId);
    if (!otherId) return;
    const delta = this._scaleDelta(-3, deal.stakes);
    this._applyTrustDelta(proposerId, otherId, delta);
  }

  _handleDealBroken({ deal, byId, otherId }) {
    if (!deal || !byId) return;
    const breakerId = byId;
    const victimId = otherId || this._getOtherPartyId(deal, breakerId);
    if (!victimId) return;

    const victimDelta = this._scaleDelta(-15, deal.stakes);
    const breakerDelta = this._scaleDelta(-5, deal.stakes);
    this._applyTrustDelta(victimId, breakerId, victimDelta);
    this._applyTrustDelta(breakerId, victimId, breakerDelta);
    this._applySuspicionDelta(breakerId, this._scaleDelta(8, deal.stakes), 'broken deal');
  }

  _handleDealCompleted({ deal }) {
    if (!deal) return;
    const [aId, bId] = deal.parties || [];
    if (!aId || !bId) return;
    const delta = this._scaleDelta(8, deal.stakes);
    this._applyTrustDelta(aId, bId, delta);
    this._applyTrustDelta(bId, aId, delta);
    this._applySuspicionDelta(aId, this._scaleDelta(-1, deal.stakes), 'completed deal');
    this._applySuspicionDelta(bId, this._scaleDelta(-1, deal.stakes), 'completed deal');
  }

  _applyTrustDelta(fromId, toId, delta) {
    if (!fromId || !toId || !delta) return;
    const relationshipSystem = this.gameManager?.systems?.relationshipSystem;
    if (!relationshipSystem || typeof relationshipSystem.changeRelationship !== 'function') return;
    relationshipSystem.changeRelationship(fromId, toId, delta);
    const fromName = this._getSurvivorDisplayName(fromId);
    const toName = this._getSurvivorDisplayName(toId);
    this._log(`[DealConseq] ${fromName} trust ${delta >= 0 ? '+' : ''}${delta} toward ${toName}`);
  }

  _applySuspicionDelta(survivorId, delta, reason) {
    if (!survivorId || !delta) return;
    const survivor = this._getSurvivorById(survivorId);
    if (!survivor) return;
    const current = typeof survivor.suspicion === 'number' ? survivor.suspicion : 0;
    survivor.suspicion = this._clamp(current + delta);
    const name = this._getSurvivorDisplayName(survivorId);
    this._log(`[DealConseq] ${name} suspicion ${delta >= 0 ? '+' : ''}${delta} (${reason})`);
  }

  _getProposerId(deal) {
    const proposed = Array.isArray(deal.history)
      ? deal.history.find(entry => entry?.action === 'PROPOSED')
      : null;
    return proposed?.by || deal.parties?.[0] || null;
  }

  _getOtherPartyId(deal, survivorId) {
    if (!deal || !survivorId) return null;
    return (deal.parties || []).find(id => id?.toString?.() !== survivorId?.toString?.()) || null;
  }

  _getSurvivorById(id) {
    if (!id) return null;
    const idString = id.toString();
    const survivors = this.gameManager?.survivors || [];
    const direct = survivors.find(survivor => survivor.id?.toString() === idString);
    if (direct) return direct;

    const tribes = this.gameManager?.tribes || [];
    for (const tribe of tribes) {
      const member = (tribe.members || []).find(survivor => survivor.id?.toString() === idString);
      if (member) return member;
    }

    return null;
  }

  _getSurvivorDisplayName(id) {
    const survivor = this._getSurvivorById(id);
    if (!survivor) return id?.toString?.() || 'Unknown';
    return survivor.name || survivor.firstName || survivor.nickname || survivor.id?.toString?.() || 'Unknown';
  }

  _scaleDelta(delta, stakes = 'standard') {
    const multiplier = STAKES_MULTIPLIERS[stakes] ?? 1;
    return Math.round(delta * multiplier);
  }

  _clamp(value) {
    return Math.max(0, Math.min(100, Number(value) || 0));
  }

  _log(message) {
    if (this.debug) {
      console.log(message);
    }
  }
}

export default DealConsequencesSystem;
