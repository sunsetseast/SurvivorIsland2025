// ===============================
// SocialMemorySystem.js
// Manages memory of social events for NPCs
// ===============================

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

        this.recordIntelEvent({
            type: kind === 'targetClaim' ? 'target' : 'gossip',
            about: claimedTarget || null,
            from,
            to: null,
            day: dayValue,
            phase: window.gameManager?.getGamePhase?.(),
            confidence: outcome === 'truth' ? 70 : outcome === 'lie' ? 30 : 45,
            shortText: claimedTarget ? `${from || 'Someone'} mentioned ${claimedTarget}.` : `${from || 'Someone'} hedged on names.`
        });
    }

    recordNamedIntel({ about, context, from, day, confidence = null, phase = null, shortText = null }) {
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
            from,
            to: null,
            day: dayValue,
            phase: phase || window.gameManager?.getGamePhase?.() || null,
            confidence,
            shortText: shortText || `${from || 'Someone'} mentioned ${about} (${context}).`
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

    recordConversationIntent({ npcId, withId = null, intent, targetId = null, targetName = null, day = null, phase = null }) {
        if (npcId == null) return;
        this.initNPC(npcId);
        const entry = {
            day: day || window.gameManager?.getCurrentDay?.() || 1,
            phase: phase || window.gameManager?.getGamePhase?.() || null,
            withId,
            intent,
            targetId,
            targetName
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

    getRecentIntelAbout(survivorId, limit = 6) {
        if (survivorId == null) return [];
        const compare = String(survivorId);
        const gm = window.gameManager;
        const resolved = gm?.survivors?.find?.((s) => String(s.id) === compare || s.firstName === survivorId);
        const compareAlt = resolved ? String(resolved.id) : null;
        const resolveMatch = (about) => {
            if (about == null) return false;
            if (Array.isArray(about)) {
                return about.some((item) => String(item) === compare || (compareAlt && String(item) === compareAlt));
            }
            return String(about) === compare || (compareAlt && String(about) === compareAlt);
        };
        return [...this.intelEvents]
            .filter((entry) => resolveMatch(entry.about))
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
}

// GLOBAL EXPORT
const socialMemorySystem = new SocialMemorySystem();

if (typeof window !== "undefined") {
    window.socialMemorySystem = socialMemorySystem;
}

export default socialMemorySystem;
