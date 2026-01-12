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
        this.globalApproachCooldownMs = 45000;
        this.lastApproachAt = 0;
        this.phaseBeatCounts = { pre: 0, post: 0 };
        this.perPhaseCaps = { pre: 2, post: 3 };
        this.perNpcCooldowns = new Map();
        this.perNpcCooldownRangeMs = [60000, 120000];
        this.perDayNpcApproachCap = 2;
        this.dayStamp = null;
    }

    // RESET at start of camp phase
    resetForNewPhase(phaseType = "pre") {
        if (gameManager.flags?.campEventActive) return;
        this.phaseType = this._normalizePhase(phaseType);
        this._syncDayState();
    }

    shouldTriggerBeatNow({ phaseType } = {}) {
        if (gameManager.flags?.campEventActive) return false;
        const phase = this._normalizePhase(phaseType || this.phaseType);
        this._syncDayState();
        if ((this.phaseBeatCounts[phase] || 0) >= (this.perPhaseCaps[phase] || 0)) return false;
        if (Date.now() - this.lastApproachAt < this.globalApproachCooldownMs) return false;
        const baseChance = phase === "post" ? 0.7 : 0.6;
        return Math.random() < baseChance;
    }

    planPhaseIntents({ phaseType, currentView } = {}) {
        const phase = this._normalizePhase(phaseType || this.phaseType);
        const player = gameManager.getPlayerSurvivor?.();
        if (!player) return [];

        const tribeMembers =
            gameManager.getCurrentTribeMembers?.() ||
            gameManager.getPlayerTribe?.()?.members ||
            gameManager.survivors || [];
        const candidates = tribeMembers.filter(npc => npc && npc.id && npc.id !== player.id && !npc.isPlayer);

        return candidates
            .map(npc => this._planIntentForNpc(npc, { phase, player, currentView }))
            .filter(Boolean);
    }

    pickBestIntentForPlayer({ phaseType, currentView } = {}) {
        if (gameManager.flags?.campEventActive) return null;
        this._syncDayState();
        const phase = this._normalizePhase(phaseType || this.phaseType);
        const player = gameManager.getPlayerSurvivor?.();
        if (!player) return null;
        const dayValue = this._getCurrentDay();
        const memorySystem = gameManager.systems?.socialMemorySystem || socialMemorySystem;
        const intents = this.planPhaseIntents({ phaseType: phase, currentView });
        const filtered = intents.filter(intent => {
            const npcCooldown = this.perNpcCooldowns.get(intent.npcId);
            if (npcCooldown && npcCooldown > Date.now()) return false;
            const counters = memorySystem?.getDailyCounters?.(intent.npcId, dayValue) || { playerTalks: 0 };
            if ((counters.playerTalks || 0) >= this.perDayNpcApproachCap) return false;
            return true;
        });
        if (filtered.length === 0) return null;

        const sorted = [...filtered].sort((a, b) => b.urgency - a.urgency);
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
        const now = Date.now();
        this.lastApproachAt = now;
        this.phaseBeatCounts[phase] = (this.phaseBeatCounts[phase] || 0) + 1;
        this.perNpcCooldowns.set(
            picked.npcId,
            now + this._randomInRange(this.perNpcCooldownRangeMs[0], this.perNpcCooldownRangeMs[1])
        );
        memorySystem?.incrementDailyCounter?.(picked.npcId, "playerTalks", dayValue);

        socialMemorySystem?.recordConversationIntent?.({
            npcId: picked.npcId,
            withId: player.id,
            intent: picked.intent,
            targetId: picked.targetId,
            targetName,
            day: dayValue,
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
        }, { banner: true });

        return { ...picked, withId: player.id, targetName };
    }

    _planIntentForNpc(npc, { phase, player, currentView }) {
        const relationshipSystem = gameManager.systems?.relationshipSystem;
        const allianceSystem = gameManager.systems?.allianceSystem;
        const memorySystem = gameManager.systems?.socialMemorySystem || socialMemorySystem;
        const locationSystem = gameManager.systems?.npcLocationSystem || npcLocationSystem;

        const relValue = relationshipSystem?.getRelationship?.(player.id, npc.id)?.value ?? 50;
        const trust = memorySystem?.getTrust?.(npc.id) ?? 50;
        const reliability = memorySystem?.getReliability?.(npc.id) ?? 50;
        const committedAllianceId = memorySystem?.getCommittedAllianceId?.(npc.id) || null;

        const reasons = [];
        reasons.push(`relationship ${Math.round(relValue)}`);
        if (typeof trust === "number") reasons.push(`trust ${Math.round(trust)}`);
        if (typeof reliability === "number") reasons.push(`reliability ${Math.round(reliability)}`);
        if (committedAllianceId) reasons.push("committed alliance plan");

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

        if (!targetId && Math.random() < 0.45) {
            const recentMentions = memorySystem?.getMostMentionedNamesRecently?.(3, 2) || [];
            const suggestedTarget = this._resolveMentionTarget(recentMentions, [npc.id, player.id]);
            if (suggestedTarget) {
                const alreadyDiscussed = memorySystem?.hasTalkedAboutTargetRecently?.(npc.id, suggestedTarget, 1);
                if (!alreadyDiscussed) {
                    targetId = suggestedTarget;
                    reasons.push(`recent name chatter ${this._resolveName(suggestedTarget) || suggestedTarget}`);
                }
            }
        }

        const recentIntelAboutPlayer = memorySystem?.getRecentIntelAbout?.(player.id, 4) || [];
        if (recentIntelAboutPlayer.length) {
            reasons.push("recent intel about you");
        }

        const weights = this._buildIntentWeights({ phase, relValue, trust, reliability, alliedWithPlayer });

        if (!alliedWithPlayer && relValue >= 60) {
            weights.allianceInvite += phase === "post" ? 0.3 : 0.1;
            reasons.push("relationship ripe for alliance invite");
        }

        if (committedAllianceId && phase === "post") {
            weights.softStrategy += 0.2;
            weights.targeting += 0.2;
            weights.warning += 0.1;
        }

        if (recentIntelAboutPlayer.length) {
            weights.warning += phase === "post" ? 0.2 : 0.1;
            weights.idolSuspicion += phase === "post" ? 0.15 : 0.05;
        }

        if (memorySystem?.wasRecentIntent?.(npc.id, "warning", 1, phase)) {
            weights.warning *= 0.6;
        }
        if (memorySystem?.wasRecentIntent?.(npc.id, "targeting", 1, phase)) {
            weights.targeting *= 0.6;
        }
        if (memorySystem?.wasRecentIntent?.(npc.id, "softStrategy", 1, phase)) {
            weights.softStrategy *= 0.65;
        }
        if (memorySystem?.wasRecentIntent?.(npc.id, "bonding", 1, phase)) {
            weights.bonding *= 0.7;
        }
        if (memorySystem?.wasRecentIntent?.(npc.id, "allianceInvite", 1, phase)) {
            weights.allianceInvite *= 0.4;
        }
        if (memorySystem?.wasRecentIntent?.(npc.id, "idolSuspicion", 1, phase)) {
            weights.idolSuspicion *= 0.5;
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
            npcTargetsPlayer,
            currentView,
            npcId: npc.id
        });

        const location = locationSystem?.getLocation?.(npc.id) || null;
        const view = currentView || window?.campScreen?.currentView || null;
        if (location) {
            reasons.push(`location ${location}`);
        }
        if (view && location) {
            if (this._normalizeLocation(view) === this._normalizeLocation(location)) {
                reasons.push(`nearby at ${location}`);
            } else {
                reasons.push("not nearby");
            }
        }

        return {
            npcId: npc.id,
            withId: player.id,
            intent,
            targetId: targetId || null,
            urgency,
            location: location || view || null,
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

    _computeUrgency({ phase, intent, relValue, trust, reliability, targetId, npcTargetsPlayer, currentView, npcId }) {
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
        if (currentView && npcId != null) {
            const locationSystem = gameManager.systems?.npcLocationSystem || npcLocationSystem;
            const location = locationSystem?.getLocation?.(npcId) || null;
            if (location && this._normalizeLocation(location) !== this._normalizeLocation(currentView)) {
                urgency -= 0.12;
            } else if (location) {
                urgency += 0.08;
            }
        }
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

    runOffscreenNpcChatter({ phaseType } = {}) {
        if (gameManager.flags?.campEventActive) return;
        const phase = this._normalizePhase(phaseType || this.phaseType);
        const memorySystem = gameManager.systems?.socialMemorySystem || socialMemorySystem;
        const relationshipSystem = gameManager.systems?.relationshipSystem;
        const locationSystem = gameManager.systems?.npcLocationSystem || npcLocationSystem;
        const tribeMembers =
            gameManager.getCurrentTribeMembers?.() ||
            gameManager.getPlayerTribe?.()?.members ||
            gameManager.survivors || [];
        const npcs = tribeMembers.filter(npc => npc && npc.id && !npc.isPlayer);
        if (npcs.length < 2) return;

        const maxPairs = npcs.length >= 4 ? 2 : 1;
        const pickedPairs = [];
        const usedIds = new Set();
        const byLocation = new Map();

        npcs.forEach(npc => {
            const location = locationSystem?.getLocation?.(npc.id) || "camp";
            if (!byLocation.has(location)) byLocation.set(location, []);
            byLocation.get(location).push(npc);
        });

        const pickPairFromList = (list) => {
            const available = list.filter(npc => !usedIds.has(npc.id));
            if (available.length < 2) return null;
            const first = available[Math.floor(Math.random() * available.length)];
            usedIds.add(first.id);
            const remaining = available.filter(npc => npc.id !== first.id);
            const second = remaining[Math.floor(Math.random() * remaining.length)];
            usedIds.add(second.id);
            return [first, second];
        };

        const locations = Array.from(byLocation.keys()).sort(() => Math.random() - 0.5);
        locations.forEach(location => {
            if (pickedPairs.length >= maxPairs) return;
            const pair = pickPairFromList(byLocation.get(location));
            if (pair) pickedPairs.push({ pair, location });
        });

        while (pickedPairs.length < maxPairs) {
            const pair = pickPairFromList(npcs);
            if (!pair) break;
            pickedPairs.push({ pair, location: locationSystem?.getLocation?.(pair[0].id) || "camp" });
        }

        if (pickedPairs.length === 0) return;

        const chatterTypes = ["gossip", "name_thrown_out", "target", "alliance_rumor", "warning"];
        const dayValue = this._getCurrentDay();
        const chatterLogs = [];

        pickedPairs.forEach(({ pair, location }) => {
            const [speaker, listener] = pair;
            const type = chatterTypes[Math.floor(Math.random() * chatterTypes.length)];
            const targetPick = this._pickChatterTarget([speaker.id, listener.id]);
            const targetName = targetPick?.name || null;
            const targetId = targetPick?.id || null;
            const confidence = Math.floor(40 + Math.random() * 40);

            if (type === "gossip" || type === "name_thrown_out") {
                if (targetId || targetName) {
                    memorySystem?.recordNameMention?.({
                        speakerId: speaker.id,
                        listenerId: listener.id,
                        subjectId: targetId || targetName,
                        contextTag: type,
                        confidence,
                        day: dayValue,
                        phase
                    });
                }
                if (targetName) {
                    memorySystem?.recordNamedIntel?.({
                        about: targetName,
                        context: type === "name_thrown_out" ? "name_thrown_out" : "heard_rumor",
                        from: speaker.firstName || "Unknown",
                        day: dayValue,
                        phase,
                        confidence
                    });
                }
            } else if (type === "target") {
                if (targetName) {
                    memorySystem?.recordNamedIntel?.({
                        about: targetName,
                        context: "target",
                        from: speaker.firstName || "Unknown",
                        day: dayValue,
                        phase,
                        confidence
                    });
                    memorySystem?.recordIntelEvent?.({
                        type: "target",
                        about: targetId || targetName,
                        from: speaker.id,
                        to: listener.id,
                        day: dayValue,
                        phase,
                        confidence,
                        shortText: `${speaker.firstName || "Someone"} tossed out ${targetName}.`
                    });
                }
            } else if (type === "alliance_rumor") {
                if (targetName) {
                    memorySystem?.recordNamedIntel?.({
                        about: targetName,
                        context: "alliance",
                        from: speaker.firstName || "Unknown",
                        day: dayValue,
                        phase,
                        confidence
                    });
                }
            } else if (type === "warning") {
                if (targetName) {
                    memorySystem?.recordNamedIntel?.({
                        about: targetName,
                        context: "warning",
                        from: speaker.firstName || "Unknown",
                        day: dayValue,
                        phase,
                        confidence
                    });
                    memorySystem?.recordIntelEvent?.({
                        type: "warning",
                        about: targetId || targetName,
                        from: speaker.id,
                        to: listener.id,
                        day: dayValue,
                        phase,
                        confidence,
                        shortText: `${speaker.firstName || "Someone"} warned ${listener.firstName || "someone"} about ${targetName}.`
                    });
                }
            }

            const delta = this._rollChatterRelationshipDelta(type);
            if (relationshipSystem?.changeRelationship && delta !== 0) {
                relationshipSystem.changeRelationship(speaker.id, listener.id, delta);
            }

            memorySystem?.incrementDailyCounter?.(speaker.id, "npcTalks", dayValue);
            memorySystem?.incrementDailyCounter?.(listener.id, "npcTalks", dayValue);

            chatterLogs.push({
                type,
                speaker: speaker.firstName || speaker.id,
                listener: listener.firstName || listener.id,
                target: targetName || null,
                location
            });
        });

        const summary = `offscreen chatter: ${chatterLogs.map(entry => `${entry.speaker}→${entry.listener}`).join(", ")}`;
        this._debugLog("offscreen-chatter", { phase, chatter: chatterLogs, summary }, { banner: true });
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

    _debugLog(label, payload, { banner = false } = {}) {
        console.log(`[NpcIntentPlanner] ${label}`, payload);
        if (banner && typeof window !== "undefined" && typeof window.debugBanner === "function") {
            const summary = payload?.summary || `${label}: ${payload?.intent || "intent"} (${payload?.npc || "npc"})`;
            window.debugBanner(summary, payload?.reasons?.slice?.(0, 2)?.join(" | ") || "");
        }
    }

    _syncDayState() {
        const dayValue = this._getCurrentDay();
        if (this.dayStamp !== dayValue) {
            this.dayStamp = dayValue;
            this.phaseBeatCounts = { pre: 0, post: 0 };
        }
    }

    _getCurrentDay() {
        return gameManager.getCurrentDay?.() || gameManager.day || 1;
    }

    _randomInRange(min, max) {
        const safeMin = Number.isFinite(min) ? min : 0;
        const safeMax = Number.isFinite(max) ? max : safeMin;
        return Math.floor(safeMin + Math.random() * (safeMax - safeMin));
    }

    _normalizeLocation(location) {
        return String(location || "")
            .toLowerCase()
            .replace(/[\s_-]+/g, "");
    }

    _pickChatterTarget(excludeIds = []) {
        const survivors = gameManager.survivors || [];
        const exclude = new Set(excludeIds.map(id => String(id)));
        const candidates = survivors.filter(s => s && s.id != null && !exclude.has(String(s.id)));
        if (candidates.length === 0) return null;
        const pick = candidates[Math.floor(Math.random() * candidates.length)];
        return { id: pick.id, name: pick.firstName || null };
    }

    _rollChatterRelationshipDelta(type) {
        const magnitude = 1 + Math.floor(Math.random() * 3);
        if (type === "alliance_rumor" || type === "warning") return magnitude;
        if (type === "target") return -magnitude;
        return Math.random() < 0.5 ? magnitude : -magnitude;
    }
}

const socialEngine = new NpcIntentPlanner();

if (typeof window !== "undefined") {
    window.socialEngine = socialEngine;
}

export default socialEngine;
