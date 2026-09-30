// ===============================
// SocialMemorySystem.js
// Manages memory of social events for NPCs
// ===============================

import { campEvidenceRank, campEvidenceConfidence, campProvenance } from './CampKnowledge.js';

class SocialMemorySystem {
    constructor() {
        this.memory = {};
        this.intelEvents = [];
        this.socialEvents = [];
        this.structuredEvents = [];
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
                allianceInvites: [],
                playerSecrets: [],
                intel: [],
                namedIntel: [],
                intelEvents: [],
                conversationIntents: [],
                structuredEvents: [],
                plotPackets: [],
                accusations: [],
                nameMentions: [],
                dailyCounters: {},
                misc: [],
                lastTopics: [],
                lastLines: [],
                committedAllianceId: null,
                lastTopicKey: null,
                timesPressedRecently: 0,
                lastPressAt: 0
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

    addMemory(survivorId, entry = {}) {
        if (!survivorId) return;
        this.initNPC(survivorId);
        const list = Array.isArray(this.memory[survivorId].memory)
            ? this.memory[survivorId].memory
            : (this.memory[survivorId].memory = []);
        list.push({ ...entry, createdAt: Date.now() });
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
    // STRUCTURED SOCIAL EVENTS
    // ===============================
    recordSocialEvent({ type, speakerId, listenerId = null, subjectId = null, data = {}, day = null, phase = null }) {
        const dayValue = day || window.gameManager?.getCurrentDay?.() || 1;
        const payload = {
            type,
            speakerId,
            listenerId,
            subjectId,
            data,
            day: dayValue,
            phase: phase || window.gameManager?.getGamePhase?.() || null,
            time: Date.now()
        };

        this.socialEvents.push(payload);

        if (listenerId != null) {
            this.initNPC(listenerId);
            this.memory[listenerId].intelEvents.push(payload);
        }

        if (speakerId != null) {
            this.initNPC(speakerId);
            this.memory[speakerId].intelEvents.push({ ...payload, perspective: 'speaker' });
        }
    }

    recordStructuredEvent({ type, speakerId, listenerId = null, subjectId = null, data = {}, day = null, phase = null }) {
        const dayValue = day || window.gameManager?.getCurrentDay?.() || 1;
        const entry = {
            id: `evt-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
            type,
            speakerId,
            listenerId,
            subjectId,
            data,
            day: dayValue,
            phase: phase || window.gameManager?.getGamePhase?.() || null,
            time: Date.now()
        };

        this.structuredEvents.push(entry);

        const pushTo = (npcId, perspective = null) => {
            if (npcId == null) return;
            this.initNPC(npcId);
            this.memory[npcId].structuredEvents.push(perspective ? { ...entry, perspective } : entry);
        };

        pushTo(listenerId, 'listener');
        pushTo(speakerId, 'speaker');
        return entry;
    }

    recordConversationEvent({ type, speakerId, listenerId = null, topicPersonId = null, targetName = null, stance = null, confidence = null, location = null, day = null, phase = null, data = {} }) {
        const payload = {
            topicPersonId,
            targetName,
            stance,
            confidence,
            location,
            ...data
        };
        return this.recordStructuredEvent({
            type,
            speakerId,
            listenerId,
            subjectId: topicPersonId,
            data: payload,
            day,
            phase
        });
    }

    recordPlotPacket({ speakerId, listenerId = null, targetId = null, packet = {}, day = null, phase = null }) {
        const dayValue = day || window.gameManager?.getCurrentDay?.() || 1;
        const entry = {
            type: 'plot_packet',
            speakerId,
            listenerId,
            targetId,
            packet: { ...packet },
            day: dayValue,
            phase: phase || window.gameManager?.getGamePhase?.() || null,
            time: Date.now()
        };

        if (listenerId != null) {
            this.initNPC(listenerId);
            this.memory[listenerId].plotPackets.push(entry);
        }
        if (speakerId != null) {
            this.initNPC(speakerId);
            this.memory[speakerId].plotPackets.push({ ...entry, perspective: 'speaker' });
        }

        this.recordStructuredEvent({
            type: 'PLOT_PACKET',
            speakerId,
            listenerId,
            subjectId: targetId,
            data: { packet }
        });

        return entry;
    }

    recordAccusation({ speakerId, listenerId = null, accusedId = null, sourceId = null, confidence = null, day = null, phase = null, data = {} }) {
        const dayValue = day || window.gameManager?.getCurrentDay?.() || 1;
        const entry = {
            type: 'accusation',
            speakerId,
            listenerId,
            accusedId,
            sourceId,
            confidence,
            day: dayValue,
            phase: phase || window.gameManager?.getGamePhase?.() || null,
            time: Date.now(),
            data: { ...data }
        };

        if (listenerId != null) {
            this.initNPC(listenerId);
            this.memory[listenerId].accusations.push(entry);
        }
        if (speakerId != null) {
            this.initNPC(speakerId);
            this.memory[speakerId].accusations.push({ ...entry, perspective: 'speaker' });
        }

        this.recordStructuredEvent({
            type: 'ACCUSATION_LOGGED',
            speakerId,
            listenerId,
            subjectId: accusedId,
            data: { sourceId, confidence, ...data },
            day: dayValue,
            phase: phase || window.gameManager?.getGamePhase?.() || null
        });

        return entry;
    }

    recordNameMention({ speakerId, listenerId = null, subjectId = null, contextTag = 'general', confidence = null, day = null, phase = null, data = {} }) {
        const dayValue = day || window.gameManager?.getCurrentDay?.() || 1;
        const entry = {
            type: 'name_mention',
            speakerId,
            listenerId,
            subjectId,
            contextTag,
            confidence,
            day: dayValue,
            phase: phase || window.gameManager?.getGamePhase?.() || null,
            time: Date.now(),
            data: { ...data }
        };

        if (listenerId != null) {
            this.initNPC(listenerId);
            this.memory[listenerId].nameMentions.push(entry);
        }
        if (speakerId != null) {
            this.initNPC(speakerId);
            this.memory[speakerId].nameMentions.push({ ...entry, perspective: 'speaker' });
        }

        this.recordStructuredEvent({
            type: 'NAME_MENTION',
            speakerId,
            listenerId,
            subjectId,
            data: { contextTag, confidence, ...data },
            day: dayValue,
            phase: phase || window.gameManager?.getGamePhase?.() || null
        });

        return entry;
    }

    getStructuredEvents() {
        return this.structuredEvents.slice();
    }

    getStructuredEventsByType(type) {
        return this.structuredEvents.filter(event => event.type === type);
    }

    getSocialEvents() {
        return this.socialEvents.slice();
    }

    getSocialEventsByType(type) {
        return this.socialEvents.filter(event => event.type === type);
    }

    getRecentSocialEvents(limit = 10) {
        return this.socialEvents.slice(-limit);
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

    recordPlayerBlamedSurvivor(npcId, targetId, day = null) {
        if (npcId == null || targetId == null) return;
        const dayValue = day || window.gameManager?.getCurrentDay?.() || 1;
        this.recordStructuredEvent({
            type: 'playerBlamedSurvivor',
            speakerId: window.gameManager?.getPlayerSurvivor?.()?.id || null,
            listenerId: npcId,
            subjectId: targetId,
            data: { targetId },
            day: dayValue
        });
        this.storeMemory(npcId, 'playerBlamedSurvivor', { targetId, day: dayValue });
    }

    recordPlayerDefendedSurvivor(npcId, targetId, day = null) {
        if (npcId == null || targetId == null) return;
        const dayValue = day || window.gameManager?.getCurrentDay?.() || 1;
        this.recordStructuredEvent({
            type: 'playerDefendedSurvivor',
            speakerId: window.gameManager?.getPlayerSurvivor?.()?.id || null,
            listenerId: npcId,
            subjectId: targetId,
            data: { targetId },
            day: dayValue
        });
        this.storeMemory(npcId, 'playerDefendedSurvivor', { targetId, day: dayValue });
    }

    recordPlayerPraisedSurvivor(npcId, targetId, day = null) {
        if (npcId == null || targetId == null) return;
        const dayValue = day || window.gameManager?.getCurrentDay?.() || 1;
        this.recordStructuredEvent({
            type: 'playerPraisedSurvivor',
            speakerId: window.gameManager?.getPlayerSurvivor?.()?.id || null,
            listenerId: npcId,
            subjectId: targetId,
            data: { targetId },
            day: dayValue
        });
        this.storeMemory(npcId, 'playerPraisedSurvivor', { targetId, day: dayValue });
    }

    recordPlayerCalledThreat(npcId, targetId, day = null) {
        if (npcId == null || targetId == null) return;
        const dayValue = day || window.gameManager?.getCurrentDay?.() || 1;
        this.recordStructuredEvent({
            type: 'playerCalledThreat',
            speakerId: window.gameManager?.getPlayerSurvivor?.()?.id || null,
            listenerId: npcId,
            subjectId: targetId,
            data: { targetId },
            day: dayValue
        });
        this.storeMemory(npcId, 'playerCalledThreat', { targetId, day: dayValue });
    }

    recordPlayerStrategizedWithNpc({ npcId, claimedTargetId = null, promisedDeal = false, liedFlag = false, day = null }) {
        if (npcId == null) return;
        const dayValue = day || window.gameManager?.getCurrentDay?.() || 1;
        this.recordStructuredEvent({
            type: 'playerStrategizedWithNpc',
            speakerId: window.gameManager?.getPlayerSurvivor?.()?.id || null,
            listenerId: npcId,
            subjectId: claimedTargetId,
            data: { claimedTargetId, promisedDeal, liedFlag },
            day: dayValue
        });
        this.storeMemory(npcId, 'playerStrategizedWithNpc', { claimedTargetId, promisedDeal, liedFlag, day: dayValue });
    }

    getLastClaimedTargetByPlayer() {
        const playerId = window.gameManager?.getPlayerSurvivor?.()?.id;
        if (!playerId) return null;
        const matches = this.structuredEvents
            .filter(event => event.type === 'playerStrategizedWithNpc' && event.speakerId === playerId)
            .sort((a, b) => (b.time || 0) - (a.time || 0));
        return matches[0]?.subjectId || null;
    }

    npcRemembersPlayerBlaming(targetId, npcId = null) {
        if (targetId == null) return false;
        const matchesNpc = (entry) => entry.type === 'playerBlamedSurvivor' && String(entry.subjectId) === String(targetId);
        if (npcId != null) {
            this.initNPC(npcId);
            return (this.memory[npcId].structuredEvents || []).some(matchesNpc);
        }
        return this.structuredEvents.some(matchesNpc);
    }

    getPlayerCredibilityScore(npcId) {
        const playerId = window.gameManager?.getPlayerSurvivor?.()?.id;
        if (!playerId) return 50;
        this.initNPC(playerId);
        const lieCount = (this.memory[playerId].lies || []).length;
        const discoveredCount = (this.memory[playerId].lies || []).filter(lie => lie.discovered).length;
        const trust = npcId != null ? (this.getTrust(npcId) ?? 50) : 50;
        const base = 70 + (trust - 50) * 0.3;
        const penalty = lieCount * 6 + discoveredCount * 4;
        return this.clampValue(base - penalty);
    }

    recordPlayerClaimedIdolTruth(npcId, day = null) {
        if (npcId == null) return;
        const dayValue = day || window.gameManager?.getCurrentDay?.() || 1;
        this.recordStructuredEvent({
            type: 'player_claimed_idol_truth',
            speakerId: window.gameManager?.getPlayerSurvivor?.()?.id || null,
            listenerId: npcId,
            day: dayValue
        });
        this.storeMemory(npcId, 'player_claimed_idol_truth', { day: dayValue });
    }

    recordPlayerClaimedIdolLie(npcId, day = null) {
        if (npcId == null) return;
        const dayValue = day || window.gameManager?.getCurrentDay?.() || 1;
        this.recordStructuredEvent({
            type: 'player_claimed_idol_lie',
            speakerId: window.gameManager?.getPlayerSurvivor?.()?.id || null,
            listenerId: npcId,
            day: dayValue
        });
        this.storeMemory(npcId, 'player_claimed_idol_lie', { day: dayValue });
    }

    recordPlayerPlantedIdolRumor(npcId, targetId, day = null) {
        if (npcId == null || targetId == null) return;
        const dayValue = day || window.gameManager?.getCurrentDay?.() || 1;
        this.recordStructuredEvent({
            type: 'player_planted_idol_rumor',
            speakerId: window.gameManager?.getPlayerSurvivor?.()?.id || null,
            listenerId: npcId,
            subjectId: targetId,
            data: { targetId },
            day: dayValue
        });
        this.storeMemory(npcId, 'player_planted_idol_rumor', { targetId, day: dayValue });
    }

    recordNpcSharedIdolInfo(npcId, infoType, payload, day = null) {
        if (npcId == null) return;
        const dayValue = day || window.gameManager?.getCurrentDay?.() || 1;
        this.recordStructuredEvent({
            type: 'npc_shared_idol_info',
            speakerId: npcId,
            listenerId: window.gameManager?.getPlayerSurvivor?.()?.id || null,
            data: { infoType, payload },
            day: dayValue
        });
        this.storeMemory(npcId, 'npc_shared_idol_info', { infoType, payload, day: dayValue });
    }

    recordNpcRefusedIdolInfo(npcId, day = null) {
        if (npcId == null) return;
        const dayValue = day || window.gameManager?.getCurrentDay?.() || 1;
        this.recordStructuredEvent({
            type: 'npc_refused_idol_info',
            speakerId: npcId,
            listenerId: window.gameManager?.getPlayerSurvivor?.()?.id || null,
            day: dayValue
        });
        this.storeMemory(npcId, 'npc_refused_idol_info', { day: dayValue });
    }

    getIdolRumorsAboutSurvivor(targetId) {
        if (targetId == null) return [];
        return this.structuredEvents.filter(event => event.type === 'player_planted_idol_rumor' && String(event.subjectId) === String(targetId));
    }

    npcHeardPlayerIdolClaim(npcId) {
        if (npcId == null) return false;
        this.initNPC(npcId);
        return (this.memory[npcId].structuredEvents || []).some(event =>
            event.type === 'player_claimed_idol_truth' || event.type === 'player_claimed_idol_lie'
        );
    }

    npcSharedIdolInfo(npcId) {
        if (npcId == null) return [];
        this.initNPC(npcId);
        return (this.memory[npcId].structuredEvents || []).filter(event =>
            event.type === 'npc_shared_idol_info' || event.type === 'npc_refused_idol_info'
        );
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

    getCommittedAllianceId(npcId) {
        this.initNPC(npcId);
        return this.memory[npcId].committedAllianceId ?? null;
    }

    setCommittedAllianceId(npcId, allianceIdOrNull) {
        this.initNPC(npcId);
        this.memory[npcId].committedAllianceId = allianceIdOrNull || null;
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

    recordIntel({ from, to = null, kind, claimedTarget = null, outcome = "evade", day = 1, verified = false }) {

        const dayValue = day || window.gameManager?.getCurrentDay?.() || 1;
        const entry = { from, kind, claimedTarget, outcome, day: dayValue, verified };

        [...new Set([from, to].filter(id => id != null))].forEach(npcId => {
            this.initNPC(npcId);
            this.memory[npcId].intel = this.memory[npcId].intel || [];
            this.memory[npcId].intel.push(entry);
        });

        this.recordIntelEvent({
            type: kind === 'targetClaim' ? 'target' : 'gossip',
            about: claimedTarget || null,
            from,
            to,
            day: dayValue,
            phase: window.gameManager?.getGamePhase?.(),
            confidence: outcome === 'truth' ? 70 : outcome === 'lie' ? 30 : 45,
            shortText: claimedTarget ? `${from || 'Someone'} mentioned ${claimedTarget}.` : `${from || 'Someone'} hedged on names.`
        });
    }

    recordNamedIntel({ about, context, from, to = null, day, confidence = null, phase = null, shortText = null }) {
        if (!about || !context) return;
        const dayValue = day || window.gameManager?.getCurrentDay?.() || 1;
        const entry = { about, context, from: from || 'Unknown', day: dayValue };
        const gm = typeof window !== 'undefined' ? window.gameManager : null;
        const speaker = gm?.survivors?.find(s => String(s.id) === String(from) || s.firstName === from) ||
            (from === 'Player' ? gm?.player : null);
        const sourceId = speaker?.id || (this.memory[from] ? from : null);
        [...new Set([sourceId, to].filter(id => id != null))].forEach(npcId => {
            this.initNPC(npcId);
            this.memory[npcId].namedIntel = this.memory[npcId].namedIntel || [];
            this.memory[npcId].namedIntel.push(entry);
        });

        const typeMap = {
            heard_rumor: 'gossip',
            target: 'target',
            idol_suspicion: 'idol',
            alliance: 'alliance',
            working_with: 'alliance',
            name_thrown_out: 'gossip',
            challenge_comment: 'challenge_comment',
            verify_rumor: 'warning',
            warning: 'warning'
        };

        this.recordIntelEvent({
            type: typeMap[context] || 'gossip',
            about,
            from: sourceId,
            to,
            day: dayValue,
            phase: phase || window.gameManager?.getGamePhase?.() || null,
            confidence,
            shortText: shortText || `${from || 'Someone'} mentioned ${about} (${context}).`
        });
        if (to != null && sourceId != null && gm?.gamePhase === 'preChallenge') {
            const subject = gm.survivors?.find(s => String(s.id) === String(about) || s.firstName === about);
            if (subject) this.recordCampClaim({ id: `named:${dayValue}:${this.intelEvents.length}`,
                speakerId: sourceId, listenerIds: [to], subjectId: subject.id,
                topic: context === 'idol_suspicion' ? 'idol_suspicion' : context,
                stance: context === 'idol_suspicion' ? 'possible' : 'mentioned',
                confidence: typeof confidence === 'number' ? confidence / 100 : 0.55,
                day: dayValue, campTime: gm.dayTimer, salience: context === 'target' || context === 'warning' ? 'high' : 'medium' });
        }
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

    getDailyCounters(npcId, day) {
        if (npcId == null) {
            return { playerTalks: 0, npcTalks: 0 };
        }
        this.initNPC(npcId);
        const dayValue = day || window.gameManager?.getCurrentDay?.() || 1;
        const counters = this.memory[npcId].dailyCounters || {};
        const bucket = counters[dayValue] || { playerTalks: 0, npcTalks: 0 };
        return {
            playerTalks: bucket.playerTalks || 0,
            npcTalks: bucket.npcTalks || 0
        };
    }

    incrementDailyCounter(npcId, key, day) {
        if (npcId == null || !key) return;
        this.initNPC(npcId);
        const dayValue = day || window.gameManager?.getCurrentDay?.() || 1;
        const memory = this.memory[npcId];
        if (!memory.dailyCounters || typeof memory.dailyCounters !== 'object') {
            memory.dailyCounters = {};
        }
        if (!memory.dailyCounters[dayValue]) {
            memory.dailyCounters[dayValue] = { playerTalks: 0, npcTalks: 0 };
        }
        const bucket = memory.dailyCounters[dayValue];
        bucket[key] = (bucket[key] || 0) + 1;
    }

    wasRecentIntent(npcId, intent, withinDays = 1, phase = null) {
        if (npcId == null || !intent) return false;
        this.initNPC(npcId);
        const day = window.gameManager?.getCurrentDay?.() || 1;
        const intents = Array.isArray(this.memory[npcId].conversationIntents)
            ? this.memory[npcId].conversationIntents
            : [];
        return intents.some(entry => {
            if (entry.intent !== intent) return false;
            if (phase != null && entry.phase !== phase) return false;
            if (entry.day == null) return true;
            return day - entry.day <= withinDays;
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

    recordAllianceInvite({ day, location, npcId, playerId, outcome, pickedThirdId = null, isFake = false, accepted = false, declineType = null, pitchType = null, proposedBy = 'player' }) {
      const dayValue = day || window.gameManager?.getCurrentDay?.() || 1;
      const gm = window.gameManager;
      const getName = (id) => {
          if (!id) return null;
          const survivor = gm?.survivors?.find(s => s.id === id);
          return survivor?.firstName || null;
      };

      const entry = {
          day: dayValue,
          location: location || 'camp',
          npcId,
          npcName: getName(npcId) || 'Unknown',
          playerId,
          playerName: getName(playerId) || 'You',
          outcome,
          pickedThirdId: pickedThirdId || null,
          pickedThirdName: getName(pickedThirdId) || null,
          isFake: !!isFake,
          accepted: !!accepted,
          declineType: declineType || null,
          pitchType: pitchType || null,
          proposedBy: proposedBy || 'player'
      };

      if (npcId) {
          this.initNPC(npcId);
          this.memory[npcId].allianceInvites.push(entry);
      }

      if (playerId) {
          this.initNPC(playerId);
          this.memory[playerId].allianceInvites.push({ ...entry, perspective: 'player' });
          if (isFake) {
              this.memory[playerId].playerSecrets.push({
                  day: dayValue,
                  type: 'fake_alliance_accept',
                  npcId,
                  npcName: entry.npcName
              });
          }
      }
  }

    // ===============================
    // STRUCTURED INTEL EVENTS
    // ===============================
    recordIntelEvent({ type, about, from, to, day, phase = null, confidence = null, shortText = '' }) {
        const dayValue = day || window.gameManager?.getCurrentDay?.() || 1;
        const entry = {
            type: type || 'gossip',
            about,
            from: from ?? null,
            to: to ?? null,
            day: dayValue,
            phase: phase ?? window.gameManager?.getGamePhase?.() ?? null,
            confidence: typeof confidence === 'number' ? this.clampValue(confidence) : null,
            shortText: shortText || ''
        };

        this.intelEvents.push(entry);

        const pushToNpc = (npcId) => {
            if (npcId == null) return;
            this.initNPC(npcId);
            this.memory[npcId].intelEvents = this.memory[npcId].intelEvents || [];
            this.memory[npcId].intelEvents.push(entry);
        };

        pushToNpc(from);
        pushToNpc(to);
    }

    // The event is owned by its participants and direct witnesses. A witness
    // knows the visible meeting, not the private words. Repetition merges into
    // bounded impressions; the concrete trail is capped per owner.
    recordCampObservation({ id, actorId, participantIds = [], witnessIds = [], type, location,
        day, campTime, detail = '', visibility = 'visible' } = {}) {
        if (!id || actorId == null || !type) return [];
        const owners = new Map([[String(actorId), 'participant']]);
        for (const owner of participantIds) if (owner != null) owners.set(String(owner), 'participant');
        for (const owner of witnessIds) if (owner != null && !owners.has(String(owner))) owners.set(String(owner), 'witness');
        for (const [ownerId, origin] of owners) {
            this.initNPC(ownerId);
            const mem = this.memory[ownerId];
            mem.campObservations ||= []; mem.campImpressions ||= {};
            mem.lastCampDecayDay ??= day;
            if (mem.campObservations.some(entry => entry.id === id)) continue;
            const salience = ['betrayal', 'confirmed_lie', 'public_conflict', 'promise', 'idol_search_seen'].includes(type) ? 'high' :
                ['absence', 'role_neglect', 'seen_together'].includes(type) ? 'medium' : 'low';
            mem.campObservations.push({ id, actorId, participantIds: [...participantIds], type, location,
                day, campTime, origin, sourceId: origin === 'participant' ? actorId : null,
                confidence: origin === 'participant' ? 1 : visibility === 'inference' ? 0.55 : 0.85,
                salience, visibility, detail: visibility === 'private' && origin === 'witness' ? '' : detail });
            this.pruneCampObservations(mem);
            if (String(ownerId) === String(actorId)) continue;
            const patterns = mem.campImpressions[String(actorId)] ||= {};
            const pattern = patterns[type] ||= { count: 0, confidence: 0, lastDay: day };
            pattern.count = Math.min(20, pattern.count + 1);
            pattern.confidence = Math.min(1, pattern.confidence + (origin === 'witness' ? 0.17 : 0.1));
            pattern.lastDay = day;
            const contrary = type === 'work' ? patterns.role_neglect : type === 'role_neglect' ? patterns.work : null;
            if (contrary) { contrary.count = Math.max(0, contrary.count - 1); contrary.confidence = Math.max(0, contrary.confidence - 0.15); }
        }
        return [...owners.keys()];
    }

    shareCampObservation({ fromId, toId, observationId } = {}) {
        if (fromId == null || toId == null || !observationId) return false;
        this.initNPC(fromId); this.initNPC(toId);
        const known = this.memory[fromId].campObservations?.find(entry => entry.id === observationId);
        if (!known) return false;
        const mem = this.memory[toId]; mem.campObservations ||= [];
        if (mem.campObservations.some(entry => entry.id === observationId)) return false;
        mem.campObservations.push({ ...known, origin: 'hearsay', sourceId: fromId,
            sourceChain: [...(known.sourceChain || []), fromId].slice(-5),
            confidence: Math.min(0.55, known.confidence * 0.65), detail: known.visibility === 'private' ? '' : known.detail });
        this.pruneCampObservations(mem);
        if (['absence', 'work', 'role_neglect'].includes(known.type)) {
            mem.campImpressions ||= {};
            const patterns = mem.campImpressions[String(known.actorId)] ||= {};
            const pattern = patterns[known.type] ||= { count: 0, confidence: 0, lastDay: known.day };
            pattern.count = Math.min(20, pattern.count + 0.5);
            pattern.confidence = Math.min(0.6, pattern.confidence + 0.07);
            pattern.lastDay = known.day;
        }
        return true;
    }

    pruneCampObservations(mem) {
        while (mem.campObservations.length > 48) {
            mem.campObservations.splice(this.leastUsefulCampEvidence(mem.campObservations), 1);
        }
    }

    leastUsefulCampEvidence(entries) {
        const ordinary = entries.map((entry, index) => ({ entry, index })).filter(({ entry }) => entry.salience !== 'high');
        const pool = ordinary.length ? ordinary : entries.map((entry, index) => ({ entry, index }));
        return pool.sort((a, b) => campEvidenceRank(a.entry) - campEvidenceRank(b.entry) ||
            campEvidenceConfidence(a.entry) - campEvidenceConfidence(b.entry))[0].index;
    }

    // A camp claim is owned by its speaker and actual listeners. The speaker's
    // knowledge of a deliberate lie never crosses to a listener by implication.
    recordCampClaim({ id, speakerId, listenerIds = [], subjectId, topic, stance,
        origin = 'participant', sourceId = null, confidence = 0.8, day = 1, campTime = null,
        salience = 'medium', truthfulness = null } = {}) {
        if (!id || speakerId == null || subjectId == null || !topic || !stance) return false;
        const owners = [speakerId, ...listenerIds];
        let added = false;
        for (const ownerId of new Set(owners.map(String))) {
            this.initNPC(ownerId);
            const mem = this.memory[ownerId]; mem.campClaims ||= [];
            mem.lastCampDecayDay ??= day;
            if (mem.campClaims.some(entry => entry.id === id)) continue;
            const speaker = String(ownerId) === String(speakerId);
            const entry = { id, speakerId, subjectId, topic, stance, day, campTime, salience,
                origin: speaker ? origin : 'direct_statement', sourceId: speaker ? sourceId : speakerId,
                ...(origin === 'inference' ? { evidenceOrigin: 'inference' } : {}),
                sourceChain: speaker ? [speakerId] : [sourceId, speakerId].filter(id => id != null),
                confidence: speaker ? campEvidenceConfidence({ origin, confidence, topic }) :
                    this.campClaimConfidence(ownerId, speakerId, confidence),
                ...(speaker && truthfulness != null ? { truthfulness } : {}) };
            this.addOwnedCampClaim(mem, entry);
            added = true;
        }
        return added;
    }

    campClaimConfidence(ownerId, sourceId, original) {
        this.initNPC(ownerId);
        const gm = typeof window !== 'undefined' ? window.gameManager : null;
        const trust = gm?.getTrust?.(ownerId, sourceId) ?? 50;
        const reliability = this.memory[ownerId].campSourceReliability?.[String(sourceId)] ?? 0.75;
        return Math.max(0.05, Math.min(0.8, original, original * (0.55 + trust / 250) * reliability));
    }

    addOwnedCampClaim(mem, entry) {
        mem.campClaims ||= []; mem.campSourceReliability ||= {};
        if (entry.origin === 'firsthand') for (const prior of mem.campClaims) {
            if (prior.sourceId == null || !['hearsay', 'direct_statement'].includes(prior.origin) ||
                String(prior.subjectId) !== String(entry.subjectId) || prior.topic !== entry.topic ||
                prior.stance !== entry.stance) continue;
            const key = String(prior.sourceId);
            mem.campSourceReliability[key] = Math.min(1, (mem.campSourceReliability[key] ?? 0.75) + 0.05);
            prior.challenged = false;
        }
        const opposites = { yes: ['no'], no: ['yes'], possible: ['unlikely'],
            unlikely: ['possible', 'searching'], searching: ['unlikely', 'denied'],
            mentioned: ['denied'], denied: ['mentioned', 'searching'],
            warned: ['denied'] };
        const contradicts = mem.campClaims.filter(previous => entry.truthfulness !== false &&
            String(previous.subjectId) === String(entry.subjectId) && previous.topic === entry.topic &&
            (opposites[previous.stance]?.includes(entry.stance) || opposites[entry.stance]?.includes(previous.stance)) &&
            previous.confidence > 0.15);
        for (const prior of contradicts) {
            if (campEvidenceRank(prior) > campEvidenceRank(entry)) {
                // Hearing the same weak rumor repeatedly cannot erase what this
                // person saw. It does create uncertainty about the new claim.
                entry.challenged = true;
                entry.confidence = Math.max(0.05, entry.confidence * .55);
                continue;
            }
            prior.challenged = true;
            prior.confidence = Math.max(0.05, prior.confidence * (entry.origin === 'firsthand' ? 0.4 : 0.78));
            if (campEvidenceRank(prior) === campEvidenceRank(entry)) entry.challenged = true;
            // Only direct evidence can discredit a source; conflicting rumors are uncertainty.
            if (entry.origin === 'firsthand' && entry.confidence >= .7 && prior.sourceId != null) {
                const key = String(prior.sourceId);
                mem.campSourceReliability[key] = Math.max(0.2, (mem.campSourceReliability[key] ?? 0.75) - 0.18);
            }
        }
        entry.contradicts = contradicts.map(previous => previous.id).slice(-4);
        mem.campClaims.push(entry);
        while (mem.campClaims.length > 40) {
            mem.campClaims.splice(this.leastUsefulCampEvidence(mem.campClaims), 1);
        }
    }

    shareCampClaim({ fromId, toId, claimId } = {}) {
        if (fromId == null || toId == null || String(fromId) === String(toId)) return false;
        this.initNPC(fromId); this.initNPC(toId);
        const known = (this.memory[fromId].campClaims || []).find(claim => claim.id === claimId);
        if (!known || this.memory[toId].campClaims?.some(claim => claim.id === claimId)) return false;
        const confidence = Math.min(.55, campEvidenceConfidence(known) * 0.72,
            this.campClaimConfidence(toId, fromId, known.confidence));
        this.addOwnedCampClaim(this.memory[toId], { ...known, origin: 'hearsay', sourceId: fromId,
            sourceChain: [...(known.sourceChain || []), fromId].slice(-5), confidence,
            truthfulness: undefined, evidenceOrigin: campProvenance(known) === 'inference' ? 'inference' : undefined,
            challenged: Boolean(known.challenged) });
        return true;
    }

    getCampClaims(ownerId, { subjectId = null, topic = null } = {}) {
        if (ownerId == null) return [];
        this.initNPC(ownerId);
        return (this.memory[ownerId].campClaims || []).filter(entry =>
            (subjectId == null || String(entry.subjectId) === String(subjectId)) &&
            (topic == null || entry.topic === topic));
    }

    getCampSourceReliability(ownerId, sourceId) {
        if (ownerId == null || sourceId == null) return 0.75;
        this.initNPC(ownerId);
        return this.memory[ownerId].campSourceReliability?.[String(sourceId)] ?? 0.75;
    }

    // Called at the start of a new camp day, and safe to call more than once.
    advanceCampMemoryDay(day) {
        if (!Number.isInteger(day)) return;
        for (const mem of Object.values(this.memory)) {
            const dated = [...(mem.campObservations || []), ...(mem.campClaims || [])]
                .map(entry => entry.day).filter(Number.isInteger);
            const prior = Number.isInteger(mem.lastCampDecayDay) ? mem.lastCampDecayDay :
                (dated.length ? Math.min(day, ...dated) : day);
            const days = Math.max(0, day - prior);
            if (!days) { mem.lastCampDecayDay = day; continue; }
            mem.campObservations = (mem.campObservations || []).filter(entry =>
                entry.salience === 'high' || day - (entry.day || day) <= (entry.salience === 'medium' ? 5 : 2));
            for (const entry of mem.campObservations) if (entry.salience !== 'high')
                entry.confidence = Math.max(0.05, entry.confidence * Math.pow(entry.salience === 'medium' ? 0.88 : 0.7, days));
            mem.campClaims = (mem.campClaims || []).filter(entry =>
                entry.salience === 'high' || day - (entry.day || day) <= (entry.salience === 'medium' ? 8 : 3));
            for (const entry of mem.campClaims) if (entry.salience !== 'high')
                entry.confidence = Math.max(0.05, entry.confidence * Math.pow(entry.salience === 'medium' ? 0.92 : 0.7, days));
            for (const patterns of Object.values(mem.campImpressions || {})) for (const pattern of Object.values(patterns)) {
                pattern.count = Math.max(0, pattern.count - days * 0.35);
                pattern.confidence = Math.max(0, pattern.confidence * Math.pow(0.9, days));
            }
            mem.lastCampDecayDay = day;
        }
    }

    getCampObservations(ownerId, { day = null } = {}) {
        if (ownerId == null) return [];
        this.initNPC(ownerId);
        return (this.memory[ownerId].campObservations || []).filter(entry => day == null || entry.day === day);
    }
    getCampImpression(ownerId, subjectId, type) {
        if (ownerId == null || subjectId == null) return null;
        this.initNPC(ownerId);
        const patterns = this.memory[ownerId].campImpressions?.[String(subjectId)] || {};
        return type ? patterns[type] || null : patterns;
    }
    getKnownTargeters(ownerId, subjectId) {
        if (ownerId == null || subjectId == null) return [];
        this.initNPC(ownerId);
        return [...new Set((this.memory[ownerId].intelEvents || [])
            .filter(entry => entry.type === 'target' && String(entry.about) === String(subjectId))
            .map(entry => entry.from).filter(id => id != null))];
    }
    getRecentKnownIntelAbout(ownerId, subjectId, limit = 4) {
        if (ownerId == null || subjectId == null) return [];
        this.initNPC(ownerId);
        return (this.memory[ownerId].intelEvents || []).filter(entry => String(entry.about) === String(subjectId)).slice(-limit);
    }
    getKnownNamesRecently(ownerId, limit = 3, daysBack = 2) {
        if (ownerId == null) return [];
        this.initNPC(ownerId);
        const today = window.gameManager?.day || 1, counts = new Map();
        for (const entry of this.memory[ownerId].intelEvents || []) {
            if (entry.day != null && entry.day < today - daysBack) continue;
            for (const id of Array.isArray(entry.about) ? entry.about : [entry.about])
                if (id != null) counts.set(String(id), (counts.get(String(id)) || 0) + 1);
        }
        for (const claim of this.memory[ownerId].campClaims || []) {
            if (claim.day < today - daysBack || claim.confidence < 0.2) continue;
            const key = String(claim.subjectId);
            counts.set(key, (counts.get(key) || 0) + 1);
        }
        return [...counts].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([id, count]) => ({ id, count }));
    }

    recordConversationIntent({ npcId, withId = null, intent, targetId = null, targetName = null, day = null, phase = null, campTime = null, urgency = 0, salience = 'medium' }) {
        if (npcId == null) return;
        this.initNPC(npcId);
        const entry = {
            day: day || window.gameManager?.getCurrentDay?.() || 1,
            phase: phase || window.gameManager?.getGamePhase?.() || null,
            campTime: campTime ?? window.gameManager?.dayTimer ?? null,
            withId,
            intent,
            targetId,
            targetName,
            urgency,
            salience
        };
        this.memory[npcId].conversationIntents = this.memory[npcId].conversationIntents || [];
        this.memory[npcId].conversationIntents.push(entry);
        if (this.memory[npcId].conversationIntents.length > 8) {
            this.memory[npcId].conversationIntents.shift();
        }
    }

    getNpcConversationIntents(npcId, { day = null, phase = null, limit = 8 } = {}) {
        if (npcId == null) return [];
        this.initNPC(npcId);
        const intents = Array.isArray(this.memory[npcId].conversationIntents)
            ? this.memory[npcId].conversationIntents
            : [];
        const filtered = intents.filter(entry => {
            if (day != null && entry.day !== day) return false;
            if (phase != null && entry.phase !== phase) return false;
            return true;
        });
        if (limit == null) return filtered.slice();
        return filtered.slice(-Math.max(0, limit));
    }

    getLatestConversationIntent(npcId, { phase = null } = {}) {
        const intents = this.getNpcConversationIntents(npcId, { phase, limit: 1 });
        return intents.length ? intents[intents.length - 1] : null;
    }

    clearOldConversationIntents({ beforeDay } = {}) {
        if (beforeDay == null) return 0;
        let removed = 0;
        Object.keys(this.memory || {}).forEach(npcId => {
            const intents = Array.isArray(this.memory[npcId].conversationIntents)
                ? this.memory[npcId].conversationIntents
                : [];
            const filtered = intents.filter(entry => entry.day == null || entry.day >= beforeDay);
            removed += intents.length - filtered.length;
            this.memory[npcId].conversationIntents = filtered;
        });
        return removed;
    }

    getRecentIntelAbout(survivorId, limit = 6, ownerId = null) {
        if (survivorId == null) return [];
        const compare = String(survivorId);
        const gm = window.gameManager;
        const resolved = gm?.survivors?.find?.((s) => String(s.id) === compare || s.firstName === survivorId);
        const compareAlt = resolved ? String(resolved.id) : null;
        const compareName = resolved?.firstName || null;
        const resolveMatch = (about) => {
            if (about == null) return false;
            if (Array.isArray(about)) {
                return about.some((item) => String(item) === compare ||
                    (compareAlt && String(item) === compareAlt) || (compareName && String(item) === compareName));
            }
            return String(about) === compare || (compareAlt && String(about) === compareAlt) ||
                (compareName && String(about) === compareName);
        };
        const source = ownerId == null ? this.intelEvents : (this.memory[String(ownerId)]?.intelEvents || []);
        return [...source]
            .filter((entry) => resolveMatch(entry.about) && (ownerId == null || gm?.gamePhase !== 'preChallenge' ||
                entry.day == null || entry.day >= (gm?.day || 1) - 3))
            .sort((a, b) => (b.day || 0) - (a.day || 0))
            .slice(0, limit);
    }

    getWhoIsTargeting(survivorId) {
        if (survivorId == null) return [];
        const compare = String(survivorId);
        const result = new Set();
        this.intelEvents.forEach((entry) => {
            const about = entry.about;
            const matches = Array.isArray(about)
                ? about.some((id) => String(id) === compare)
                : String(about) === compare;
            if (matches && entry.type === 'target' && entry.from != null) {
                result.add(entry.from);
            }
        });
        return Array.from(result);
    }

    getTargetsMentioned() {
        const mentions = new Map();
        this.intelEvents.forEach((entry) => {
            if (!entry.about) return;
            if (entry.type !== 'target' && entry.type !== 'gossip' && entry.type !== 'idol' && entry.type !== 'warning') return;
            const add = (about) => {
                const key = String(about);
                mentions.set(key, (mentions.get(key) || 0) + 1);
            };
            if (Array.isArray(entry.about)) {
                entry.about.forEach(add);
            } else {
                add(entry.about);
            }
        });
        return Array.from(mentions.entries()).map(([id, count]) => ({ id, count }));
    }

    getDealsBetween(aId, bId) {
        if (aId == null || bId == null) return [];
        const results = [];
        Object.values(this.memory || {}).forEach((mem) => {
            (mem.deals || []).forEach((deal) => {
                const match =
                    (String(deal.offererId) === String(aId) && String(deal.receiverId) === String(bId)) ||
                    (String(deal.offererId) === String(bId) && String(deal.receiverId) === String(aId));
                if (match) results.push(deal);
            });
        });
        return results;
    }

    getMostMentionedNamesRecently(limit = 3, daysBack = 2) {
        const currentDay = window.gameManager?.getCurrentDay?.() || 1;
        const cutoff = currentDay - daysBack;
        const counts = new Map();
        this.intelEvents.forEach((entry) => {
            if (entry.day != null && entry.day < cutoff) return;
            const add = (about) => {
                const key = String(about);
                counts.set(key, (counts.get(key) || 0) + 1);
            };
            if (Array.isArray(entry.about)) {
                entry.about.forEach(add);
            } else if (entry.about != null) {
                add(entry.about);
            }
        });
        return Array.from(counts.entries())
            .map(([id, count]) => ({ id, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, limit);
    }

    hasTalkedAboutTargetRecently(npcId, targetId, withinDays = 1) {
        if (npcId == null || targetId == null) return false;
        this.initNPC(npcId);
        const day = window.gameManager?.getCurrentDay?.() || 1;
        const compare = String(targetId);
        return (this.memory[npcId].conversationIntents || []).some((entry) => {
            const matchesId = entry.targetId != null && String(entry.targetId) === compare;
            const matchesName = entry.targetName != null && String(entry.targetName) === compare;
            if (!matchesId && !matchesName) return false;
            if (entry.day == null) return true;
            return day - entry.day <= withinDays;
        });
    }

    getIntelEvents({ day = null, phase = null } = {}) {
        return this.intelEvents.filter((entry) => {
            if (day != null && entry.day !== day) return false;
            if (phase != null && entry.phase !== phase) return false;
            return true;
        });
    }

    getDay1CampMemories(npcId, { limit = 6 } = {}) {
        if (npcId == null) return [];
        this.initNPC(npcId);
        return (this.memory[npcId].structuredEvents || [])
            .filter(entry => entry.type === 'day1_camp_memory' && entry.data?.eventId === 'day1_first_impressions')
            .map(entry => entry.data)
            .filter((entry, index, all) => all.findIndex(candidate => candidate.id === entry.id) === index)
            .slice(-limit);
    }

    serialize() {
        return JSON.parse(JSON.stringify({
            memory: this.memory,
            intelEvents: this.intelEvents,
            socialEvents: this.socialEvents,
            structuredEvents: this.structuredEvents
        }));
    }

    deserialize(payload) {
        if (!payload || typeof payload !== 'object') {
            this.memory = {};
            this.intelEvents = [];
            this.socialEvents = [];
            this.structuredEvents = [];
            return;
        }

        this.memory = payload.memory && typeof payload.memory === 'object' ? payload.memory : {};
        this.intelEvents = Array.isArray(payload.intelEvents) ? payload.intelEvents : [];
        this.socialEvents = Array.isArray(payload.socialEvents) ? payload.socialEvents : [];
        this.structuredEvents = Array.isArray(payload.structuredEvents) ? payload.structuredEvents : [];
    }
}

// GLOBAL EXPORT
const socialMemorySystem = new SocialMemorySystem();

if (typeof window !== "undefined") {
    window.socialMemorySystem = socialMemorySystem;
}

export default socialMemorySystem;
