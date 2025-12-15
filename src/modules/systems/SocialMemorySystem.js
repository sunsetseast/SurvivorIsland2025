// ===============================
// SocialMemorySystem.js
// Manages memory of social events for NPCs
// ===============================

class SocialMemorySystem {
    constructor() {
        this.memory = {};
        // structure:
        // memory[npcId] = {
        //   targetRequests: [],
        //   lies: [],
        //   secretsShared: [],
        //   idolInfo: [],
        //   warningsGiven: [],
        //   betrayals: [],
        //   promises: [],
        //   voteHistory: [],
        //   misc: []
        // }
    }

    // Ensure NPC memory object exists
    initNPC(npcId) {
        if (!this.memory[npcId]) {
            this.memory[npcId] = {
                targetRequests: [],
                lies: [],
                secretsShared: [],
                idolInfo: [],
                warningsGiven: [],
                betrayals: [],
                promises: [],
                voteHistory: [],
                trust: 50,
                reliability: 50,
                gossip: [],
                trustStatements: [],
                targetPreferences: [],
                deals: [],
                confrontations: [],
                apologies: [],
                meetingNotes: [],
                intel: [],
                namedIntel: [],
                misc: [],
                lastTopics: [],
                lastLines: []
            };
        }
    }

    clampValue(value) {
        const num = typeof value === 'number' ? value : 0;
        return Math.max(0, Math.min(100, num));
    }

    adjustTrust(npcId, delta = 0) {
        this.initNPC(npcId);
        const current = this.memory[npcId].trust ?? 50;
        this.memory[npcId].trust = this.clampValue(current + delta);
    }

    adjustReliability(npcId, delta = 0) {
        this.initNPC(npcId);
        const current = this.memory[npcId].reliability ?? 50;
        this.memory[npcId].reliability = this.clampValue(current + delta);
    }

    getTrust(npcId) {
        this.initNPC(npcId);
        return this.clampValue(this.memory[npcId].trust ?? 50);
    }

    getReliability(npcId) {
        this.initNPC(npcId);
        return this.clampValue(this.memory[npcId].reliability ?? 50);
    }

    storeMemory(survivorId, tag, data = null) {
        this.initNPC?.(survivorId);
        const entry = { tag, data, time: Date.now() };

        if (!this.memory[survivorId]) {
            this.memory[survivorId] = [];
        }

        if (Array.isArray(this.memory[survivorId])) {
            this.memory[survivorId].push(entry);
        } else {
            this.memory[survivorId].misc = this.memory[survivorId].misc || [];
            this.memory[survivorId].misc.push(entry);
        }
    }

    // ===============================
    // TARGETING MEMORY
    // ===============================
    recordTargetRequest(speakerId, listenerId, targetId, intensity = "normal", stance = "agree") {
        this.initNPC(listenerId);
        this.memory[listenerId].targetRequests.push({
            day: window.gameManager?.getCurrentDay() || 1,
            speakerId,
            listenerId,
            targetId,
            intensity,
            stance,
            revealedTo: [],
            keptSecret: true
        });
    }

    // When an NPC spreads the info
    revealTargetRequest(npcId, targetId, toWhom) {
        this.initNPC(npcId);
        const entry = this.memory[npcId].targetRequests.find(
            e => e.target === targetId && e.keptSecret === true
        );
        if (entry) {
            entry.keptSecret = false;
            entry.revealedTo.push(toWhom);
        }
    }

    // ===============================
    // LIE MEMORY
    // ===============================
    recordLie(liarId, targetId, lieType = "generic", details = "") {
        this.initNPC(liarId);

        this.memory[liarId].lies.push({
            day: window.gameManager?.getCurrentDay() || 1,
            liarId,
            targetId,
            lieType,
            details,
            discovered: false
        });
    }

    markLieDiscovered(npcId, liarId, topic) {
        this.initNPC(npcId);
        const lie = this.memory[npcId].lies.find(
            l => l.liarId === liarId && l.lieType === topic && !l.discovered
        );
        if (lie) {
            lie.discovered = true;
            lie.discoveredDay = window.gameManager?.getCurrentDay() || 1;
        }
    }

    // ===============================
    // IDOL INFORMATION
    // ===============================
    recordIdolInfo(npcId, infoType, aboutWho) {
        this.initNPC(npcId);
        this.memory[npcId].idolInfo.push({
            day: window.gameManager?.getCurrentDay() || 1,
            infoType,
            aboutWho
        });
    }

    // ===============================
    // BETRAYALS
    // ===============================
    recordBetrayal(npcId, betrayedBy, reason) {
        this.initNPC(npcId);
        this.memory[npcId].betrayals.push({
            day: window.gameManager?.getCurrentDay() || 1,
            betrayedBy,
            reason
        });
    }

    // ===============================
    // PROMISES
    // ===============================
    recordPromise(npcId, withWho, type) {
        this.initNPC(npcId);
        this.memory[npcId].promises.push({
            day: window.gameManager?.getCurrentDay() || 1,
            withWho,
            type,
            broken: false
        });
    }

    markPromiseBroken(npcId, withWho, type) {
        this.initNPC(npcId);
        const promise = this.memory[npcId].promises.find(
            p => p.withWho === withWho && p.type === type && !p.broken
        );
        if (promise) promise.broken = true;
    }

    // ===============================
    // VOTE HISTORY
    // ===============================
    recordVote(npcId, votedFor) {
        this.initNPC(npcId);
        this.memory[npcId].voteHistory.push({
            day: window.gameManager?.getCurrentDay() || 1,
            votedFor
        });
    }

    // ===============================
    // GETTER FUNCTIONS
    // ===============================
    getMemory(npcId) {
        this.initNPC(npcId);
        return this.memory[npcId];
    }

    // ===============================
    // TRUST + TARGET PREFERENCES
    // ===============================
    recordTrustStatement(speakerId, targetId, trustLevel = "neutral", contextTag = "general") {
        this.initNPC(speakerId);
        this.memory[speakerId].trustStatements.push({
            day: window.gameManager?.getCurrentDay() || 1,
            targetId,
            trustLevel,
            contextTag
        });
    }

    recordTargetPreference(speakerId, targetId, strength = "normal", reasonTag = "") {
        this.initNPC(speakerId);
        this.memory[speakerId].targetPreferences.push({
            day: window.gameManager?.getCurrentDay() || 1,
            targetId,
            strength,
            reasonTag
        });
    }

    // ===============================
    // DEAL MAKING
    // ===============================
    recordDeal(offererId, receiverId, dealType, targetId = null, accepted = false) {
        this.initNPC(offererId);
        this.memory[offererId].deals.push({
            day: window.gameManager?.getCurrentDay() || 1,
            offererId,
            receiverId,
            dealType,
            targetId,
            accepted
        });
    }

    // ===============================
    // GOSSIP + SOCIAL BEATS
    // ===============================
    recordGossip(sourceId, receiverId, aboutId, topicTag = "general", reliability = "unknown") {
        this.initNPC(receiverId);
        this.memory[receiverId].gossip.push({
            day: window.gameManager?.getCurrentDay() || 1,
            sourceId,
            receiverId,
            aboutId,
            topicTag,
            reliability
        });
    }

    recordIntel({ from, kind, claimedTarget = null, outcome = "evade", day = 1, verified = false }) {
        if (from) {
            this.initNPC(from);
        }

        const keys = Object.keys(this.memory);
        if (keys.length === 0 && from) {
            keys.push(from);
        }

        const dayValue = day || window.gameManager?.getCurrentDay?.() || 1;
        const entry = { from, kind, claimedTarget, outcome, day: dayValue, verified };

        keys.forEach(npcId => {
            this.initNPC(npcId);
            this.memory[npcId].intel = this.memory[npcId].intel || [];
            this.memory[npcId].intel.push(entry);
        });
    }

    recordNamedIntel({ about, context, from, day }) {
        if (!about || !context) return;
        const dayValue = day || window.gameManager?.getCurrentDay?.() || 1;
        const entry = { about, context, from: from || 'Unknown', day: dayValue };
        let keys = Object.keys(this.memory || {});

        if (keys.length === 0) {
            const survivors = window.gameManager?.survivors || [];
            if (survivors.length) {
                survivors.forEach(s => this.initNPC(s.id));
            } else if (from) {
                keys.push(from);
            }
        }

        keys = Object.keys(this.memory || {});

        keys.forEach(npcId => {
            this.initNPC(npcId);
            this.memory[npcId].namedIntel = this.memory[npcId].namedIntel || [];
            this.memory[npcId].namedIntel.push(entry);
        });
    }

    recordConfrontation(npcId, withWho, tone = "tense") {
        this.initNPC(npcId);
        this.memory[npcId].confrontations.push({
            day: window.gameManager?.getCurrentDay() || 1,
            withWho,
            tone
        });
    }

    recordApology(npcId, withWho, sincerity = "uncertain") {
        this.initNPC(npcId);
        this.memory[npcId].apologies.push({
            day: window.gameManager?.getCurrentDay() || 1,
            withWho,
            sincerity
        });
    }

    recordMeetingContext(npcId, location) {
        this.initNPC(npcId);
        this.memory[npcId].meetingNotes.push({
            day: window.gameManager?.getCurrentDay() || 1,
            location
        });
    }

    // ===============================
    // QUICK LOOKUPS
    // ===============================
  getLatestDeal(npcId) {
      this.initNPC(npcId);
      const deals = this.memory[npcId].deals;
      return deals.length ? deals[deals.length - 1] : null;
  }

  rememberBeat(npcId, topicKey, line) {
      this.initNPC(npcId);
      const holder = this.memory[npcId];
      holder.lastTopics.push(topicKey);
      holder.lastLines.push(line);
      if (holder.lastTopics.length > 3) holder.lastTopics.shift();
      if (holder.lastLines.length > 3) holder.lastLines.shift();
  }

  recentlyUsed(npcId, line) {
      this.initNPC(npcId);
      const holder = this.memory[npcId];
      return holder.lastLines.includes(line);
  }
}

// GLOBAL EXPORT
const socialMemorySystem = new SocialMemorySystem();

if (typeof window !== "undefined") {
    window.socialMemorySystem = socialMemorySystem;
}

export default socialMemorySystem;