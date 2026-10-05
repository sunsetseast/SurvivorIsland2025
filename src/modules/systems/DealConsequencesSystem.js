import { ownedCampKnowledge } from './CampKnowledge.js';
import eventManager, { GameEvents } from '../core/EventManager.js';

const STAKES_MULTIPLIERS = {
  low: 0.75,
  standard: 1.0,
  high: 1.25,
  minor: 0.75,
  major: 1.25
};

class DealConsequencesSystem {
  constructor(gameManager) {
    this.gameManager = gameManager;
    this.debug = false;
    this._initialized = false; this.applied = [];
  }

  initialize() {
    if (this._initialized) return;
    this._initialized = true;
    eventManager.subscribe(GameEvents.DEAL_ACCEPTED, this._handleDealAccepted.bind(this));
    eventManager.subscribe(GameEvents.DEAL_REFUSED, this._handleDealRefused.bind(this));
    eventManager.subscribe(GameEvents.DEAL_BROKEN, this._handleDealBroken.bind(this));
    eventManager.subscribe(GameEvents.DEAL_COMPLETED, this._handleDealCompleted.bind(this));
  }

  reset() {
    this.applied = [];
  }

  setDebug(enabled) {
    this.debug = Boolean(enabled);
  }

  _handleDealAccepted({ deal }) {
    if (!deal) return;
    const [aId, bId] = deal.parties || [];
    if (!aId || !bId) return;
    const delta = this._scaleDelta(5, deal.stakes);
    this._applyTrustDelta(aId, bId, delta, 'deal accepted');
  }

  _handleDealRefused({ deal, byId }) {
    if (!deal) return;
    const proposerId = this._getProposerId(deal);
    if (!proposerId) return;
    const otherId = byId || this._getOtherPartyId(deal, proposerId);
    if (!otherId) return;
    const delta = this._scaleDelta(-3, deal.stakes);
    this._applyTrustDelta(proposerId, otherId, delta, 'deal refused');
  }

  _handleDealBroken({deal}) {
    if(!deal)return;
    for(const ownerId of deal.parties||[])for(const e of ownedCampKnowledge(this.gameManager.systems.socialMemorySystem,ownerId,this.gameManager.day))this.learnBreach(deal.id,ownerId,e.id);
  }
  serialize(){return{applied:[...this.applied]};}
  deserialize(payload){this.applied=[...(payload?.applied||[])];}
  learnBreach(dealId,ownerId,evidenceId){
    const deal=this.gameManager.systems.dealSystem?.getDealById(dealId),e=ownedCampKnowledge(this.gameManager.systems.socialMemorySystem,ownerId,this.gameManager.day).find(e=>e.id===evidenceId),broken=deal?.history?.filter(e=>e.action==='BROKEN').at(-1),breaker=broken?.by;
    if(!deal||!e||!breaker||!deal.parties.some(id=>String(id)===String(ownerId))||String(ownerId)===String(breaker)||String(e.subjectId)!==String(breaker)||e.confidence<.55||e.challenged||!['vote_attribution','deal_breach','withheld_information'].includes(e.topic)||
      ((e.objectiveReference==null||![deal.id,deal.objectiveReference].includes(e.objectiveReference))&&e.day!==broken.at?.day))return false;
    const key=`${dealId}:${ownerId}`;if(this.applied.includes(key))return false;this.applied.push(key);
    this._applyTrustDelta(ownerId,breaker,this._scaleDelta(-15,deal.stakes),'learned deal breach');this.gameManager.systems.socialMemorySystem.recordBetrayal(ownerId,breaker,'believed broken deal');return true;
  }

  _handleDealCompleted({ deal }) {
    if(deal?.objectiveOnly)return;
    if (!deal) return;
    const [aId, bId] = deal.parties || [];
    if (!aId || !bId) return;
    const delta = this._scaleDelta(8, deal.stakes);
    this._applyTrustDelta(aId, bId, delta, 'deal completed');
    this._applySuspicionDelta(aId, this._scaleDelta(-1, deal.stakes), 'completed deal');
    this._applySuspicionDelta(bId, this._scaleDelta(-1, deal.stakes), 'completed deal');
  }

  _applyTrustDelta(fromId, toId, delta, reason = null) {
    if (!fromId || !toId || !delta) return;
    const trustSystem = this.gameManager?.systems?.trustSystem;
    if (!trustSystem || typeof trustSystem.changeTrust !== 'function') {
      console.warn('[DealConsequencesSystem] TrustSystem unavailable; trust change skipped.');
      return;
    }
    (trustSystem.changeOwnedTrust || trustSystem.changeTrust).call(trustSystem,fromId,toId,delta,reason);
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
