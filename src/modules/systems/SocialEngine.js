// ===============================
// SocialEngine.js
// NPC intent planning (decision-only)
// ===============================

import gameManager, { GamePhase } from "../core/GameManager.js";
import { LocationKeys } from "../core/LocationKeys.js";
import { shuffleArray } from "../utils/CommonUtils.js";

const normalizeLocationValue = (value) => String(value || "")
    .toLowerCase()
    .replace(/[\s_-]+/g, "");

const NORMALIZED_LOCATION_KEYS = {
    BEACH: normalizeLocationValue(LocationKeys.BEACH),
    SHELTER: normalizeLocationValue(LocationKeys.SHELTER),
    CAMPFIRE: normalizeLocationValue(LocationKeys.CAMPFIRE),
    JUNGLE_TRAIL: normalizeLocationValue(LocationKeys.JUNGLE_TRAIL),
    WATERFALL_TRAIL: normalizeLocationValue(LocationKeys.WATERFALL_TRAIL),
    ROCKY_SHORE: normalizeLocationValue(LocationKeys.ROCKY_SHORE)
};
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
        this.chatterKeys = new Set();
    }

    showDialogue(npc, group = [], type = "bonding") {
        if (!npc) return;
        const conversationSystem = gameManager.systems?.conversationSystem
            || (typeof window !== "undefined" ? window?.conversationSystem : null);
        if (!conversationSystem?.startNpcConversation) {
            console.error("SocialEngine: ConversationSystem unavailable; cannot start NPC conversation.");
            return;
        }

        const normalizedPhase = this._normalizePhase(this.phaseType);
        const phase = normalizedPhase === "post" ? GamePhase.POST_CHALLENGE : GamePhase.PRE_CHALLENGE;
        const location = typeof window !== "undefined" ? window?.campScreen?.currentView : null;

        if (typeof window !== "undefined" && window.DEBUG_SOCIAL_SIM) {
            console.log(
                `SocialEngine → ConversationSystem.startNpcConversation npc=${npc?.id} type=${type} phase=${phase}`
            );
        }

        conversationSystem.startNpcConversation(npc, type, {
            initiatedByNpc: true,
            context: {
                phase
            },
            location
        });
    }

    handlePlayerChoice({ npc, group = [], type = "bonding", choiceText = "", choiceIndex = 0 } = {}) {
        const dialogueSystem = gameManager.systems?.dialogueSystem;
        if (!dialogueSystem?.showDialogue || !npc) return;

        const player = gameManager.getPlayerSurvivor?.();
        const playerId = player?.id ?? null;
        const relationshipSystem = gameManager.systems?.relationshipSystem;
        const socialMemory = gameManager.systems?.socialMemorySystem || socialMemorySystem;
        const relationshipValue = relationshipSystem?.getRelationship?.(playerId, npc.id)?.value ?? 50;
        const relationshipDelta = this._resolveRelationshipDelta(type, relationshipValue);
        const npcResponse = this._buildNpcResponse({
            npc,
            type,
            relationshipValue,
            gameplayStyle: npc.gameplayStyle || npc.personality
        });
        const outcomeSummary = this._buildOutcomeSummary(npc, relationshipDelta);

        this._applyConversationEffects({
            npc,
            playerId,
            type,
            relationshipDelta,
            socialMemory,
            choiceText,
            group
        });

        console.log(`[CONVO] type=${type} npc=${npc.id} choice="${choiceText}"`);

        dialogueSystem.showDialogue(`You: ${choiceText}`, ["Next"], () => {
            dialogueSystem.showDialogue(`${npc.firstName}: ${npcResponse}`, ["OK"], () => {
                dialogueSystem.showDialogue(outcomeSummary, ["Close"]);
            }, { backgroundColor: 'rgba(35, 35, 35, 0.95)' });
        }, { backgroundColor: 'rgba(35, 35, 35, 0.95)' });
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
        const locationSystem = gameManager.systems?.npcLocationSystem || npcLocationSystem;
        const resolvedView = currentView || window?.campScreen?.currentView || null;
        const intents = this.planPhaseIntents({ phaseType: phase, currentView: resolvedView });

        let intentsToConsider = intents;
        let usedNearbyFilter = false;
        if (resolvedView && typeof locationSystem?.getSurvivorsAtLocation === "function") {
            const nearby = locationSystem.getSurvivorsAtLocation(resolvedView) || [];
            const nearbyIds = new Set(
                nearby
                    .map(entry => (entry?.id != null ? entry.id : entry))
                    .filter(id => id != null)
                    .map(id => String(id))
            );
            if (nearbyIds.size > 0) {
                const filteredNearby = intents.filter(intent => nearbyIds.has(String(intent.npcId)));
                if (filteredNearby.length > 0) {
                    intentsToConsider = filteredNearby;
                    usedNearbyFilter = true;
                }
            }
        }

        if (!usedNearbyFilter && resolvedView) {
            intentsToConsider = intents.map(intent => {
                const reasons = Array.isArray(intent.reasons) ? [...intent.reasons] : [];
                reasons.push("NPC was not nearby — conversation felt more forced.");
                return {
                    ...intent,
                    urgency: this._clamp01((intent.urgency ?? 0) - 0.15),
                    reasons
                };
            });
        }

        const filtered = intentsToConsider.filter(intent => {
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
            day: dayValue,
            phase,
            direction: `${picked.npcId}→${player.id}`,
            npc: picked.npcId,
            intent: picked.intent,
            target: targetName || picked.targetId || null,
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
        const location = locationSystem?.getLocation?.(npc.id) || null;

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
        const locationBias = this._getLocationBias(location);
        if (locationBias?.reason) {
            reasons.push(locationBias.reason);
        }
        if (locationBias?.weights) {
            Object.entries(locationBias.weights).forEach(([intentKey, delta]) => {
                if (weights[intentKey] != null) {
                    weights[intentKey] += delta;
                }
            });
        }

        if (this._isIsolatedLocation(location)) {
            weights.informationPlay += 0.08;
            weights.idolTalk += 0.08;
            reasons.push("isolated location favors private strategy");
        }

        if (!alliedWithPlayer && relValue >= 60) {
            if (phase === "post") {
                weights.dealMaking += 0.12;
                reasons.push("relationship ripe for a deal pitch");
            } else {
                weights.allianceInvite += 0.1;
                reasons.push("relationship ripe for alliance invite");
            }
        }

        if (committedAllianceId && phase === "post") {
            weights.dealMaking += 0.12;
            weights.targeting += 0.2;
            weights.warning += 0.1;
        }

        if (recentIntelAboutPlayer.length) {
            weights.warning += phase === "post" ? 0.2 : 0.1;
            weights.idolTalk += phase === "post" ? 0.1 : 0.05;
        }

        if (memorySystem?.wasRecentIntent?.(npc.id, "warning", 1, phase)) {
            weights.warning *= 0.6;
        }
        if (memorySystem?.wasRecentIntent?.(npc.id, "targeting", 1, phase)) {
            weights.targeting *= 0.6;
        }
        if (memorySystem?.wasRecentIntent?.(npc.id, "challengeDebrief", 1, phase)) {
            weights.challengeDebrief *= 0.6;
        }
        if (memorySystem?.wasRecentIntent?.(npc.id, "dealMaking", 1, phase)) {
            weights.dealMaking *= 0.6;
        }
        if (memorySystem?.wasRecentIntent?.(npc.id, "informationPlay", 1, phase)) {
            weights.informationPlay *= 0.65;
        }
        if (memorySystem?.wasRecentIntent?.(npc.id, "idolTalk", 1, phase)) {
            weights.idolTalk *= 0.5;
        }

        if (targetId) {
            weights.targeting += phase === "post" ? 0.25 : 0.08;
            weights.warning += phase === "post" ? 0.12 : 0.05;
            weights.dealMaking += phase === "post" ? 0.05 : 0;
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

    _getOpenerLine(type, npc) {
        const openers = {
            bonding: [
                "How's camp treating you?",
                "You holding up okay out here?",
                "Feels like a long day. You good?"
            ],
            softStrategy: [
                "So... if we lose, what's the vibe?",
                "Everyone's a little on edge. What are you feeling?",
                "You hearing anything about where the numbers are?"
            ],
            targeting: [
                "Names are floating. What are you hearing?",
                "If things get messy, who benefits?",
                "Who's catching heat around camp?"
            ],
            warning: [
                "I've got a weird feeling. Anything I should know?",
                "Is my name out there?",
                "Who's pushing what right now?"
            ],
            groupStrategy: [
                "We need a clean plan if we lose.",
                "If things go sideways, what's the backup?",
                "How do we keep this vote simple?"
            ],
            idolSuspicion: [
                "Any idol talk going around?",
                "You think someone found something?",
                "Anything weird happening on the trail?"
            ]
        };

        const options = openers[type] || ["What's the read right now?"];
        return this._pickRandom(options);
    }

    _getPlayerChoices(type) {
        const choicesByType = {
            bonding: [
                "How are you holding up today?",
                "You been sleeping at all?",
                "You’ve been solid around camp — respect."
            ],
            softStrategy: [
                "What’s the vibe if we lose?",
                "Anyone acting sketchy?",
                "Who do you feel closest to right now?"
            ],
            targeting: [
                "Whose name is floating around?",
                "If it’s chaos, who benefits?",
                "Who do you NOT trust?"
            ],
            warning: [
                "Anything I should know?",
                "Who’s pushing what?",
                "Is my name out there?"
            ],
            idolSuspicion: [
                "Heard any idol talk?",
                "Do you think someone found something?",
                "Anything weird happening around camp?"
            ],
            groupStrategy: [
                "If we lose, what’s the clean plan?",
                "What’s the backup?",
                "How do we keep this calm?"
            ]
        };

        return choicesByType[type] || ["What's the read?", "Who do you trust?", "What's next?"];
    }

    _buildNpcResponse({ npc, type, relationshipValue, gameplayStyle }) {
        const styleKey = String(gameplayStyle || "").toLowerCase();
        const warmth = relationshipValue >= 65 ? "warm" : relationshipValue <= 40 ? "cool" : "neutral";
        const responses = {
            bonding: {
                warm: [
                    "I'm tired, but it's good to have someone to talk to.",
                    "Honestly, having you around helps.",
                    "It’s rough, but I feel solid today."
                ],
                neutral: [
                    "It's the usual grind. Keeping my head down.",
                    "I'm hanging in there. Just gotta make it through.",
                    "Trying to stay positive out here."
                ],
                cool: [
                    "I'm fine. Just focused on the game.",
                    "It’s Survivor — you know how it is.",
                    "Just trying to keep things simple."
                ]
            },
            softStrategy: {
                warm: [
                    "I think the vibe is loose, but we should stay tight.",
                    "If we lose, we can keep it clean if we stick together.",
                    "People are nervous. We can use that."
                ],
                neutral: [
                    "Hard to tell. Feels like everyone is waiting.",
                    "There are whispers, but nothing locked.",
                    "It’s fluid. We need to read the room."
                ],
                cool: [
                    "I'm not sure. Everyone's got their own plan.",
                    "Feels like it's up in the air.",
                    "I'm just watching who talks to who."
                ]
            },
            targeting: {
                warm: [
                    "I've heard a couple names, but nothing solid.",
                    "People are tossing ideas. Let's stay sharp.",
                    "If things get messy, we can steer it."
                ],
                neutral: [
                    "Names are floating, but I don't know where it lands.",
                    "It's murky. Everyone's keeping cards close.",
                    "I wouldn't trust the chatter yet."
                ],
                cool: [
                    "I'm not putting names out there.",
                    "It's too early to say.",
                    "I don't want to be the one to start that."
                ]
            },
            warning: {
                warm: [
                    "I haven't heard your name, but stay alert.",
                    "You're good for now, but keep your eyes open.",
                    "If anything shifts, I'll let you know."
                ],
                neutral: [
                    "I haven't heard much, but things change fast.",
                    "Nothing obvious, but I can't promise.",
                    "Just keep an ear out."
                ],
                cool: [
                    "No idea. Everyone's whispering.",
                    "Couldn't tell you.",
                    "I'm not tracking that."
                ]
            },
            idolSuspicion: {
                warm: [
                    "People are snooping. Someone might have something.",
                    "I've seen folks slip off to the trees.",
                    "I'd bet someone found a clue."
                ],
                neutral: [
                    "There's talk, but I haven't seen proof.",
                    "Hard to say. Everyone's watching.",
                    "Maybe. The vibe is weird."
                ],
                cool: [
                    "I haven't seen anything.",
                    "No clue from me.",
                    "If someone has it, they're quiet."
                ]
            },
            groupStrategy: {
                warm: [
                    "If we lose, we keep it simple and stay united.",
                    "Let's lock a clean plan and stick to it.",
                    "We can keep this calm if we hold the line."
                ],
                neutral: [
                    "We need a plan, but nothing's settled yet.",
                    "It's messy. We should get on the same page.",
                    "Let's see who wants to move together."
                ],
                cool: [
                    "Not sure there's a group plan.",
                    "Everyone's playing their own game.",
                    "We’ll see where the numbers land."
                ]
            }
        };

        const list = responses?.[type]?.[warmth];
        let response = list ? this._pickRandom(list) : null;

        if (styleKey.includes("aggressive")) {
            response = response ? `${response} We can't hesitate.` : null;
        } else if (styleKey.includes("strategic")) {
            response = response ? `${response} We need the numbers.` : null;
        } else if (styleKey.includes("loyal")) {
            response = response ? `${response} I value trust out here.` : null;
        }

        return response || "Yeah… I hear you. We’ll see what happens.";
    }

    _resolveRelationshipDelta(type, relationshipValue) {
        if (type === "targeting" || type === "warning") {
            return relationshipValue < 45 ? -1 : 1;
        }
        if (type === "idolSuspicion") {
            return relationshipValue < 50 ? -1 : 1;
        }
        return 1;
    }

    _applyConversationEffects({ npc, playerId, type, relationshipDelta, socialMemory, choiceText, group }) {
        const relationshipSystem = gameManager.systems?.relationshipSystem;
        if (playerId != null) {
            if (typeof relationshipSystem?.adjustRelationship === "function") {
                relationshipSystem.adjustRelationship(playerId, npc.id, relationshipDelta);
            } else if (typeof relationshipSystem?.changeRelationship === "function") {
                console.warn("TODO: relationshipSystem.adjustRelationship missing. Using changeRelationship fallback.");
                relationshipSystem.changeRelationship(playerId, npc.id, relationshipDelta);
            } else {
                console.warn("TODO: relationshipSystem.adjustRelationship missing.");
            }
        }

        if (type === "targeting" && typeof socialMemory?.recordTargetRequest === "function") {
            socialMemory.recordTargetRequest(playerId, npc.id, group?.targetId || null, "normal", relationshipDelta >= 0 ? "agree" : "resist");
            return;
        }

        if (typeof socialMemory?.recordConversationEvent === "function") {
            socialMemory.recordConversationEvent({
                type: `conversation_${type}`,
                speakerId: playerId,
                listenerId: npc.id,
                data: {
                    topic: type,
                    choice: choiceText
                }
            });
            return;
        }

        console.warn("TODO: socialMemorySystem recordConversationEvent/recordTargetRequest missing.");
    }

    _buildOutcomeSummary(npc, relationshipDelta) {
        const mood = relationshipDelta >= 0 ? "a bit more open" : "more guarded";
        return `Outcome: ${npc.firstName} seems ${mood} after the chat.`;
    }

    _pickRandom(list = []) {
        if (!Array.isArray(list) || list.length === 0) return "";
        return list[Math.floor(Math.random() * list.length)];
    }

    _buildIntentWeights({ phase, relValue, trust, reliability, alliedWithPlayer }) {
        const isPost = phase === "post";
        const weights = {
            bonding: isPost ? 0 : 0.6,
            softStrategy: isPost ? 0 : 0.32,
            warning: isPost ? 0.1 : 0.05,
            targeting: isPost ? 0.3 : 0.05,
            allianceInvite: isPost ? 0 : 0.02,
            idolSuspicion: isPost ? 0 : 0.02,
            challengeDebrief: isPost ? 0.2 : 0,
            dealMaking: isPost ? 0.2 : 0,
            informationPlay: isPost ? 0.15 : 0,
            idolTalk: isPost ? 0.05 : 0
        };

        if (relValue < 40) {
            weights.warning += 0.05;
            weights.targeting += 0.05;
        }
        if (relValue > 70) {
            weights.bonding += 0.08;
            weights.softStrategy += 0.08;
            weights.dealMaking += isPost ? 0.05 : 0;
        }
        if (trust > 65) {
            weights.softStrategy += 0.1;
            weights.informationPlay += isPost ? 0.05 : 0;
        }
        if (reliability < 40) {
            weights.warning += 0.05;
            weights.idolTalk += isPost ? 0.03 : 0;
        }
        if (alliedWithPlayer) {
            weights.softStrategy += 0.05;
            weights.dealMaking += isPost ? 0.05 : 0;
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
        if (intent === "challengeDebrief") urgency += 0.12;
        if (intent === "dealMaking") urgency += 0.15;
        if (intent === "informationPlay") urgency += 0.08;
        if (intent === "idolTalk") urgency += 0.05;
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

    runOffscreenNpcChatter({ phaseType, beatId = null } = {}) {
        if (gameManager.flags?.campEventActive) return;
        const phase = this._normalizePhase(phaseType || this.phaseType);
        const dayValue = this._getCurrentDay();
        const chatterKey = `${dayValue}-${phase}-${beatId || "phase"}`;
        if (this.chatterKeys.has(chatterKey)) return;
        this.chatterKeys.add(chatterKey);
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

        const locations = shuffleArray(Array.from(byLocation.keys()));
        locations.forEach(location => {
            if (pickedPairs.length >= maxPairs) return;
            const pair = pickPairFromList(byLocation.get(location));
            if (pair) pickedPairs.push({ pair, location });
        });

        if (pickedPairs.length === 0) return;

        const chatterLogs = [];

        pickedPairs.forEach(({ pair, location }) => {
            const [speaker, listener] = pair;
            const type = this._pickChatterType();
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
            } else if (type === "apology" || type === "confrontation") {
                if (type === "apology") {
                    memorySystem?.recordApology?.(speaker.id, listener.id, "uncertain");
                } else {
                    memorySystem?.recordConfrontation?.(speaker.id, listener.id, "tense");
                }
            }

            const delta = this._rollChatterRelationshipDelta(type);
            if (relationshipSystem?.changeRelationship && delta !== 0) {
                relationshipSystem.changeRelationship(speaker.id, listener.id, delta);
            }
            if (location) {
                memorySystem?.recordMeetingContext?.(speaker.id, location);
                memorySystem?.recordMeetingContext?.(listener.id, location);
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
        this._debugLog("offscreen-chatter", { day: dayValue, phase, chatter: chatterLogs, summary }, { banner: true });
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
        if (banner && typeof window !== "undefined" && window.DEBUG_SOCIAL_SIM && typeof window.debugBanner === "function") {
            const summary = payload?.summary || `${label}: ${payload?.intent || "intent"} (${payload?.npc || "npc"})`;
            window.debugBanner(summary, payload?.reasons?.slice?.(0, 2)?.join(" | ") || "");
        }
    }

    _syncDayState() {
        const dayValue = this._getCurrentDay();
        if (this.dayStamp !== dayValue) {
            this.dayStamp = dayValue;
            this.phaseBeatCounts = { pre: 0, post: 0 };
            this.chatterKeys = new Set();
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

    _getLocationBias(location) {
        const normalized = this._normalizeLocation(location);
        if (!normalized) return null;
        if ([NORMALIZED_LOCATION_KEYS.BEACH, NORMALIZED_LOCATION_KEYS.SHELTER].includes(normalized)) {
            return {
                reason: "camp comfort spot favors bonding",
                weights: { bonding: 0.22, allianceInvite: 0.1 }
            };
        }
        if (normalized === NORMALIZED_LOCATION_KEYS.CAMPFIRE) {
            return {
                reason: "campfire chatter leans strategic",
                weights: { softStrategy: 0.18, warning: 0.12 }
            };
        }
        if ([NORMALIZED_LOCATION_KEYS.JUNGLE_TRAIL, NORMALIZED_LOCATION_KEYS.WATERFALL_TRAIL].includes(normalized)) {
            return {
                reason: "trail meetup feels private",
                weights: { idolSuspicion: 0.18, softStrategy: 0.12 }
            };
        }
        if (normalized === NORMALIZED_LOCATION_KEYS.ROCKY_SHORE) {
            return {
                reason: "rocky stretch invites confrontation",
                weights: { warning: 0.18, targeting: 0.12 }
            };
        }
        return null;
    }

    _isIsolatedLocation(location) {
        const normalized = this._normalizeLocation(location);
        return [
            NORMALIZED_LOCATION_KEYS.JUNGLE_TRAIL,
            NORMALIZED_LOCATION_KEYS.WATERFALL_TRAIL,
            NORMALIZED_LOCATION_KEYS.ROCKY_SHORE
        ].includes(normalized);
    }

    _pickChatterTarget(excludeIds = []) {
        const survivors = gameManager.survivors || [];
        const exclude = new Set(excludeIds.map(id => String(id)));
        const candidates = survivors.filter(s => s && s.id != null && !exclude.has(String(s.id)));
        if (candidates.length === 0) return null;
        const pick = candidates[Math.floor(Math.random() * candidates.length)];
        return { id: pick.id, name: pick.firstName || null };
    }

    _pickChatterType() {
        const weighted = [
            { type: "gossip", weight: 0.28 },
            { type: "name_thrown_out", weight: 0.22 },
            { type: "target", weight: 0.18 },
            { type: "alliance_rumor", weight: 0.16 },
            { type: "warning", weight: 0.12 },
            { type: "apology", weight: 0.02 },
            { type: "confrontation", weight: 0.02 }
        ];
        const total = weighted.reduce((sum, entry) => sum + entry.weight, 0);
        let roll = Math.random() * total;
        for (const entry of weighted) {
            roll -= entry.weight;
            if (roll <= 0) return entry.type;
        }
        return "gossip";
    }

    _rollChatterRelationshipDelta(type) {
        const magnitude = 1 + Math.floor(Math.random() * 3);
        if (type === "alliance_rumor" || type === "warning" || type === "apology") return magnitude;
        if (type === "target") return -magnitude;
        if (type === "confrontation") return -magnitude;
        return Math.random() < 0.5 ? magnitude : -magnitude;
    }
}

const socialEngine = new NpcIntentPlanner();

if (typeof window !== "undefined") {
    window.socialEngine = socialEngine;
}

export default socialEngine;
