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
                misc: []
            };
        }
    }

    // ===============================
    // TARGETING MEMORY
    // ===============================
    recordTargetRequest(npcId, requesterId, targetId, intensity = "normal", stance = "agree") {
        this.initNPC(npcId);
        this.memory[npcId].targetRequests.push({
            day: window.gameManager?.getCurrentDay() || 1,
            requester: requesterId,
            target: targetId,
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
    recordLie(npcId, liedBy, topic) {
        this.initNPC(npcId);

        this.memory[npcId].lies.push({
            day: window.gameManager?.getCurrentDay() || 1,
            liar: liedBy,
            topic,
            discovered: false
        });
    }

    markLieDiscovered(npcId, liarId, topic) {
        this.initNPC(npcId);
        const lie = this.memory[npcId].lies.find(
            l => l.liar === liarId && l.topic === topic && !l.discovered
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
}

// GLOBAL EXPORT
const socialMemorySystem = new SocialMemorySystem();

if (typeof window !== "undefined") {
    window.socialMemorySystem = socialMemorySystem;
}

export default socialMemorySystem;