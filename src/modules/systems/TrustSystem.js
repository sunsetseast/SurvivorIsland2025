import eventManager, { GameEvents } from '../core/EventManager.js';

class TrustSystem {
  constructor(gameManager) {
    this.gameManager = gameManager;
    this.trust = {};
    this.ownedTrust = {};
    this.defaultValue = 50;
  }

  initialize() {
    this.trust = {}; this.ownedTrust = {};
  }

  reset() {
    this.trust = {}; this.ownedTrust = {};
  }

  getPairKey(idA, idB) {
    if (idA == null || idB == null) return null;
    const a = idA.toString();
    const b = idB.toString();
    return a < b ? `${a}_${b}` : `${b}_${a}`;
  }

  _clamp(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return this.defaultValue;
    return Math.max(0, Math.min(100, num));
  }

  getTrust(idA, idB) {
    const owned = this.ownedTrust?.[`${idA}>${idB}`]; if (owned != null) return this._clamp(owned);
    const key = this.getPairKey(idA, idB);
    if (!key) return this.defaultValue;
    if (this.trust[key] == null) return this.defaultValue;
    return this._clamp(this.trust[key]);
  }

  setTrust(idA, idB, value, reason = null) {
    const key = this.getPairKey(idA, idB);
    if (!key) return;
    const oldValue = this._clamp(this.trust[key] ?? this.defaultValue);
    const newValue = this._clamp(value);
    if (oldValue === newValue) return;
    this.trust[key] = newValue;
    for (const direction of [`${idA}>${idB}`, `${idB}>${idA}`]) if (this.ownedTrust[direction] != null) this.ownedTrust[direction] = this._clamp(this.ownedTrust[direction] + newValue - oldValue);

    eventManager.publish(GameEvents.TRUST_CHANGED, {
      aId: idA,
      bId: idB,
      pairKey: key,
      oldValue,
      newValue,
      delta: newValue - oldValue,
      reason: reason || null
    });
  }

  changeTrust(idA, idB, delta, reason = null) {
    if (!Number.isFinite(delta) || delta === 0) return;
    const current = this._clamp(this.trust[this.getPairKey(idA,idB)] ?? this.defaultValue);
    this.setTrust(idA, idB, current + delta, reason);
  }

  serialize() {
    return {
      trust: { ...this.trust }, ownedTrust: { ...this.ownedTrust }
    };
  }

  deserialize(payload) {
    this.ownedTrust = { ...(payload?.ownedTrust || {}) };
    if (!payload) {
      this.trust = {};
      return;
    }

    if (payload.trust && typeof payload.trust === 'object') {
      this.trust = { ...payload.trust };
      return;
    }

    if (typeof payload === 'object') {
      this.trust = { ...payload };
      return;
    }

    this.trust = {}; this.ownedTrust = {};
  }
  changeOwnedTrust(fromId, toId, delta, reason = null) {
    if (fromId == null || toId == null || !Number.isFinite(delta)) return;
    const oldValue = this.getTrust(fromId,toId), newValue = this._clamp(oldValue+delta);
    this.ownedTrust[`${fromId}>${toId}`] = newValue;
    eventManager.publish(GameEvents.TRUST_CHANGED,{aId:fromId,bId:toId,ownerId:fromId,oldValue,newValue,delta:newValue-oldValue,reason});
  }
}

export default TrustSystem;
