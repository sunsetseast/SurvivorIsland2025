// ===============================
// SocialEngine.js
// Controls NPC behavior, convo triggers, memory usage,
// pre/post challenge behavior, strategy logic
// ===============================

import socialMemorySystem from "./SocialMemorySystem.js";
import relationshipSystem from "./RelationshipSystem.js"; 
import dialogueSystem from "./DialogueSystem.js";
import gameManager from "../core/GameManager.js";

class SocialEngine {
    constructor() {
        this.conversationsThisPhase = 0;
        this.maxConvosPre = 2;
        this.maxConvosPost = 4;

        this.cooldown = false;
        this.cooldownTime = 60000; // 60 seconds real-time
    }

    // RESET at start of camp phase
    resetForNewPhase(phaseType = "pre") {
        this.conversationsThisPhase = 0;

        if (phaseType === "pre") {
            this.currentMaxConvos = this.maxConvosPre;
        } else {
            this.currentMaxConvos = this.maxConvosPost;
        }

        this.phaseType = phaseType;
        this.scheduleNPCApproach();
    }

    // Schedules NPC approach based on phase
    scheduleNPCApproach() {
        // guaranteed first approach for both phases
        setTimeout(() => this.triggerNPCInitiatedConversation(), 1000);

        // optional 2nd approach for mid-phase (post challenge more likely)
        const midTriggerTime = this.phaseType === "pre"
            ? 20000 + Math.random() * 15000
            : 15000 + Math.random() * 10000;

        setTimeout(() => {
            if (this.conversationsThisPhase < this.currentMaxConvos) {
                this.triggerNPCInitiatedConversation();
            }
        }, midTriggerTime);
    }

    // =========================================
    // MAIN: trigger an NPC conversation
    // =========================================
    triggerNPCInitiatedConversation() {
        if (this.cooldown) return;

        const npc = this.pickNPCWhoWantsToTalk();
        if (!npc) return;

        const convoType = this.pickConversationType(npc);

        this.startConversation(npc, convoType);
    }

    // pick NPC who has urgency or memory flags
    pickNPCWhoWantsToTalk() {
        const tribe = gameManager.getCurrentTribeMembers();
        const filtered = tribe.filter(npc => npc.id !== gameManager.getPlayerSurvivor().id);

        // TODO: Add logic later for:
        // - memory urgency
        // - trust breaking
        // - suspicion
        // - idol rumors
        // - targeting pressure

        return filtered[Math.floor(Math.random() * filtered.length)];
    }

    // decide convo type
    pickConversationType(npc) {
        if (this.phaseType === "post") {
            // strategy-heavy
            return this.pickPostStrategyType(npc);
        } else {
            // pre-challenge weighted system
            return this.pickPreSocialType(npc);
        }
    }

    pickPreSocialType(npc) {
        const day = gameManager.getCurrentDay();

        if (day < 5) {
            return Math.random() < 0.15 ? "softStrategy" : "bonding";
        } else if (day < 12) {
            return Math.random() < 0.45 ? "softStrategy" : "bonding";
        } else {
            return Math.random() < 0.70 ? "softStrategy" : "bonding";
        }
    }

    pickPostStrategyType(npc) {
        const r = Math.random();
        if (r < 0.40) return "targeting";
        if (r < 0.65) return "warning";
        if (r < 0.85) return "groupStrategy";
        return "idolSuspicion";
    }

    // =========================================
    // Begin the conversation
    // =========================================
    startConversation(npc, type) {
        this.conversationsThisPhase++;
        this.startCooldown();

        const group = this.determineGroupParticipants(npc, type);
        this.showDialogue(npc, group, type);
    }

    // NPCs join based on strategy weight
    determineGroupParticipants(mainNpc, type) {
        const tribe = gameManager.getCurrentTribeMembers();
        if (type !== "groupStrategy") return [];

        const others = tribe.filter(t => t.id !== mainNpc.id && t.id !== gameManager.getPlayerSurvivor().id);

        // pick 1–3 NPCs for a group chat
        return others.slice(0, Math.floor(1 + Math.random() * 2));
    }

    // =========================================
    // Display dialogue via DialogueSystem
    // =========================================
    showDialogue(npc, group, type) {
        dialogueSystem.startConversation({
            speaker: npc,
            group: group,
            topic: type,
            onChoice: (choice) => {
                this.handlePlayerChoice(npc, group, type, choice);
            }
        });
    }

    handlePlayerChoice(npc, group, type, choice) {
        // Future: tie memory and relationship updates here
        // e.g., if player lies → memorySystem.recordLie(...)
        // if player targets someone → memorySystem.recordTargetRequest(...)

        console.log(`Player chose ${choice} during ${type} conversation.`);

        // apply memory / relationship / alliance changes HERE
    }

    // =========================================
    // COOLDOWN
    // =========================================
    startCooldown() {
        this.cooldown = true;
        setTimeout(() => {
            this.cooldown = false;
        }, this.cooldownTime);
    }
}

const socialEngine = new SocialEngine();

if (typeof window !== "undefined") {
    window.socialEngine = socialEngine;
}

export default socialEngine;