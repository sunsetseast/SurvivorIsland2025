import eventManager, { GameEvents } from '../core/EventManager.js';

class TrustSystem {
  constructor(gameManager) {
    this.gameManager = gameManager;
    this.trust = {};
    this.defaultValue = 50;
  }

  initialize() {
    this.trust = {};
  }

  reset() {
    this.trust = {};
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
    const key = this.getPairKey(idA, idB);
    if (!key) return this.defaultValue;
    if (this.trust[key] == null) return this.defaultValue;
    return this._clamp(this.trust[key]);
  }

  setTrust(idA, idB, value, reason = null) {
    const key = this.getPairKey(idA, idB);
    if (!key) return;
    const oldValue = this.getTrust(idA, idB);
    const newValue = this._clamp(value);
    if (oldValue === newValue) return;
    this.trust[key] = newValue;

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
    const current = this.getTrust(idA, idB);
    this.setTrust(idA, idB, current + delta, reason);
  }

  serialize() {
    return {
      trust: { ...this.trust }
    };
  }

  deserialize(payload) {
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

    this.trust = {};
  }
}

export default TrustSystem;
