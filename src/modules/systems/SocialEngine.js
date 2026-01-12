// ===============================
// SocialEngine.js
// NPC intent planning (decision-only)
// ===============================

import gameManager from "../core/GameManager.js";
import npcLocationSystem from "./NpcLocationSystem.js";
import socialMemorySystem from "./SocialMemorySystem.js";

class NpcIntentPlanner {
    constructor() {
        this.phaseType = "pre";
    }

    // RESET at start of camp phase
    resetForNewPhase(phaseType = "pre") {
        if (gameManager.flags?.campEventActive) return;
        this.phaseType = this._normalizePhase(phaseType);
    }

    planPhaseIntents({ phaseType } = {}) {
        const phase = this._normalizePhase(phaseType || this.phaseType);
        const player = gameManager.getPlayerSurvivor?.();
        if (!player) return [];

        const tribeMembers =
            gameManager.getCurrentTribeMembers?.() ||
            gameManager.getPlayerTribe?.()?.members ||
            gameManager.survivors || [];
        const candidates = tribeMembers.filter(npc => npc && npc.id && npc.id !== player.id && !npc.isPlayer);

        return candidates
            .map(npc => this._planIntentForNpc(npc, { phase, player }))
            .filter(Boolean);
    }

    pickBestIntentForPlayer({ phaseType } = {}) {
        const phase = this._normalizePhase(phaseType || this.phaseType);
        const intents = this.planPhaseIntents({ phaseType: phase });
        if (intents.length === 0) return null;

        const sorted = [...intents].sort((a, b) => b.urgency - a.urgency);
        const top = sorted.slice(0, Math.min(3, sorted.length));
        const totalWeight = top.reduce((sum, intent) => sum + (intent.urgency || 0) + 0.05, 0);
        let roll = Math.random() * totalWeight;
        let picked = top[0];
        for (const intent of top) {
            roll -= (intent.urgency || 0) + 0.05;
            if (roll <= 0) {
                picked = intent;
                break;
            }
        }

        const targetName = this._resolveName(picked.targetId);
        socialMemorySystem?.recordConversationIntent?.({
            npcId: picked.npcId,
            withId: picked.withId,
            intent: picked.intent,
            targetId: picked.targetId,
            targetName,
            day: gameManager.getCurrentDay?.(),
            phase
        });

        if (picked.location) {
            socialMemorySystem?.recordMeetingContext?.(picked.npcId, picked.location);
        }

        this._debugLog("picked", {
            npc: picked.npcId,
            intent: picked.intent,
            urgency: picked.urgency,
            reasons: picked.reasons,
            location: picked.location
        });

        return { ...picked, targetName };
    }

    _planIntentForNpc(npc, { phase, player }) {
        const relationshipSystem = gameManager.systems?.relationshipSystem;
        const allianceSystem = gameManager.systems?.allianceSystem;
        const memorySystem = gameManager.systems?.socialMemorySystem || socialMemorySystem;
        const locationSystem = gameManager.systems?.npcLocationSystem || npcLocationSystem;

        const relValue = relationshipSystem?.getRelationship?.(player.id, npc.id)?.value ?? 50;
        const trust = memorySystem?.getTrust?.(npc.id) ?? 50;
        const reliability = memorySystem?.getReliability?.(npc.id) ?? 50;

        const reasons = [];
        reasons.push(`relationship ${Math.round(relValue)}`);
        if (typeof trust === "number") reasons.push(`trust ${Math.round(trust)}`);
        if (typeof reliability === "number") reasons.push(`reliability ${Math.round(reliability)}`);

        const alliedWithPlayer = allianceSystem?.areAllied?.(player.id, npc.id) ?? false;
        if (alliedWithPlayer) {
            reasons.push("already allied with you");
        }

        const alliances = allianceSystem?.getAlliancesForSurvivor?.(npc.id) || [];
        const allianceTarget = alliances.find(entry => entry?.targetId)?.targetId || null;
        const votingBlocTarget = alliances.find(entry => entry?.type === "votingBloc" && entry?.targetId)?.targetId || null;

        let targetId = votingBlocTarget || allianceTarget || null;
        if (targetId) {
            reasons.push(`alliance target ${this._resolveName(targetId) || targetId}`);
        }

        const whoTargetsPlayer = memorySystem?.getWhoIsTargeting?.(player.id) || [];
        const npcTargetsPlayer = whoTargetsPlayer.includes(npc.id);
        if (npcTargetsPlayer) {
            reasons.push("target chatter mentions you");
        }

        const recentMentions = memorySystem?.getMostMentionedNamesRecently?.(3, 2) || [];
        const suggestedTarget = this._resolveMentionTarget(recentMentions, [npc.id, player.id]);
        if (!targetId && suggestedTarget) {
            const alreadyDiscussed = memorySystem?.hasTalkedAboutTargetRecently?.(npc.id, suggestedTarget, 1);
            if (!alreadyDiscussed) {
                targetId = suggestedTarget;
                reasons.push(`recent name chatter ${this._resolveName(suggestedTarget) || suggestedTarget}`);
            }
        }

        const weights = this._buildIntentWeights({ phase, relValue, trust, reliability, alliedWithPlayer });

        if (!alliedWithPlayer && relValue >= 60) {
            weights.allianceInvite += phase === "post" ? 0.3 : 0.1;
            reasons.push("relationship ripe for alliance invite");
        }

        if (targetId) {
            weights.targeting += phase === "post" ? 0.25 : 0.08;
            weights.warning += phase === "post" ? 0.12 : 0.05;
        }

        if (npcTargetsPlayer) {
            weights.warning += phase === "post" ? 0.2 : 0.1;
        }

        const intent = this._pickWeightedIntent(weights, phase);
        const urgency = this._computeUrgency({
            phase,
            intent,
            relValue,
            trust,
            reliability,
            targetId,
            npcTargetsPlayer
        });

        const location = locationSystem?.getLocation?.(npc.id) || window?.campScreen?.currentView || null;
        if (location) {
            reasons.push(`location ${location}`);
        }

        return {
            npcId: npc.id,
            withId: player.id,
            intent,
            targetId: targetId || null,
            urgency,
            location: location || null,
            reasons
        };
    }

    _buildIntentWeights({ phase, relValue, trust, reliability, alliedWithPlayer }) {
        const isPost = phase === "post";
        const weights = {
            bonding: isPost ? 0.08 : 0.6,
            softStrategy: isPost ? 0.18 : 0.32,
            warning: isPost ? 0.2 : 0.05,
            targeting: isPost ? 0.3 : 0.05,
            allianceInvite: isPost ? 0.1 : 0.02,
            idolSuspicion: isPost ? 0.12 : 0.02
        };

        if (relValue < 40) {
            weights.warning += 0.05;
            weights.targeting += 0.05;
        }
        if (relValue > 70) {
            weights.bonding += 0.08;
            weights.softStrategy += 0.08;
        }
        if (trust > 65) {
            weights.softStrategy += 0.1;
        }
        if (reliability < 40) {
            weights.warning += 0.05;
        }
        if (alliedWithPlayer) {
            weights.softStrategy += 0.05;
        }

        return weights;
    }

    _pickWeightedIntent(weights, phase) {
        const entries = Object.entries(weights).filter(([, weight]) => weight > 0);
        if (entries.length === 0) return phase === "post" ? "warning" : "bonding";

        const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
        let roll = Math.random() * total;
        for (const [intent, weight] of entries) {
            roll -= weight;
            if (roll <= 0) return intent;
        }
        return entries[0][0];
    }

    _computeUrgency({ phase, intent, relValue, trust, reliability, targetId, npcTargetsPlayer }) {
        let urgency = phase === "post" ? 0.45 : 0.25;
        if (intent === "targeting" || intent === "warning") urgency += 0.2;
        if (intent === "allianceInvite") urgency += 0.12;
        if (intent === "bonding") urgency -= 0.05;
        if (relValue < 35) urgency += 0.05;
        if (relValue > 75) urgency += 0.04;
        if (trust < 40) urgency += 0.05;
        if (reliability < 40) urgency += 0.04;
        if (targetId) urgency += 0.06;
        if (npcTargetsPlayer) urgency += 0.08;
        return this._clamp01(urgency);
    }

    _resolveMentionTarget(mentions = [], excludeIds = []) {
        if (!Array.isArray(mentions)) return null;
        const exclude = new Set(excludeIds.map(id => String(id)));
        for (const entry of mentions) {
            if (!entry?.id) continue;
            const id = String(entry.id);
            if (exclude.has(id)) continue;
            return entry.id;
        }
        return null;
    }

    _resolveName(targetId) {
        if (!targetId) return null;
        const resolved = gameManager.survivors?.find?.(s => String(s.id) === String(targetId));
        return resolved?.firstName || null;
    }

    _normalizePhase(phaseType) {
        if (!phaseType) return "pre";
        const raw = typeof phaseType === "string" ? phaseType.toLowerCase() : phaseType;
        if (raw === "post" || raw === "post_challenge") return "post";
        if (raw === "pre" || raw === "pre_challenge") return "pre";
        return "pre";
    }

    _clamp01(value) {
        const num = typeof value === "number" ? value : 0;
        return Math.max(0, Math.min(1, num));
    }

    _debugLog(label, payload) {
        console.log(`[NpcIntentPlanner] ${label}`, payload);
        if (typeof window !== "undefined" && typeof window.debugBanner === "function") {
            const summary = `${label}: ${payload?.intent || "intent"} (${payload?.npc || "npc"})`;
            window.debugBanner(summary, payload?.reasons?.slice?.(0, 2)?.join(" | ") || "");
        }
    }
}

const socialEngine = new NpcIntentPlanner();

if (typeof window !== "undefined") {
    window.socialEngine = socialEngine;
}

export default socialEngine;
