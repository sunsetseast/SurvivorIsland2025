// Resolves the content of an existing timed camp block. Knowledge is read and
// written through SocialMemory's owner-scoped observations and claims.
const same = (a, b) => a != null && b != null && String(a) === String(b);

export function resolveNpcCampExchange({ gm, memory, speaker, listener, activity, random = Math.random }) {
  if (!memory || !speaker || !listener || !activity || !same(activity.targetId, listener.id)) return null;
  const day = gm.day || 1, campTime = activity.endsAt;
  const allied = gm.systems?.allianceSystem?.areAllied?.(speaker.id, listener.id) || false;
  const trust = gm.getTrust?.(speaker.id, listener.id) ?? 50;
  const traits = `${(speaker.personalityTraits || []).join(' ')} ${speaker.gameplayStyle || ''}`.toLowerCase();
  const strategic = activity.type === 'strategy_conversation' || activity.socialPurpose === 'strategy';
  const ownedClaims = memory.getCampClaims?.(speaker.id) || [];
  const ownedObservations = memory.getCampObservations?.(speaker.id) || [];
  const listenerClaims = memory.getCampClaims?.(listener.id) || [];
  const listenerObservations = memory.getCampObservations?.(listener.id) || [];
  const relevant = ownedClaims.filter(claim => !same(claim.subjectId, listener.id) &&
    !listenerClaims.some(known => known.id === claim.id) && claim.confidence >= 0.18 &&
    (claim.day == null || day - claim.day < 4));
  const witnessed = ownedObservations.filter(obs => !same(obs.actorId, listener.id) &&
    !same(obs.actorId, speaker.id) && !listenerObservations.some(known => known.id === obs.id) &&
    ['absence', 'role_neglect', 'work', 'seen_together'].includes(obs.type) &&
    obs.origin !== 'participant' && obs.confidence >= 0.18 && (obs.day == null || day - obs.day < 3));
  // A public group may notice the conversation, but private content requires
  // a participant. A sensitive speaker waits for privacy rather than leaking.
  const bystanders = (gm.getPlayerTribe?.()?.members || []).filter(person =>
    !person.isOut && !same(person.id, speaker.id) && !same(person.id, listener.id) &&
    (person.isPlayer ? globalThis.window?.campScreen?.currentView : gm.systems?.npcLocationSystem?.getLocation?.(person.id)) === activity.location);
  const discreet = bystanders.length === 0;
  const shareChance = Math.min(0.72, 0.2 + (strategic ? 0.22 : 0) + (allied ? 0.12 : 0) +
    (trust > 65 ? 0.1 : 0) + (/\bsocial\b|gossip|strategic/.test(traits) ? 0.08 : 0) -
    (discreet ? 0 : 0.22));
  let outcome = { type: 'bond', speakerId: speaker.id, listenerId: listener.id, activityId: activity.id };
  const cover = strategic && discreet && /deceptive|sneaky|shadow/.test(traits) &&
    relevant.find(claim => ['idol_suspicion', 'target'].includes(claim.topic));
  if (cover && random() < 0.08) {
    const lie = cover.stance === 'possible' ? 'unlikely' : cover.stance === 'mentioned' ? 'denied' : 'possible';
    memory.recordCampClaim({ id: `${activity.id}:claim`, speakerId: speaker.id,
      listenerIds: [listener.id], subjectId: cover.subjectId, topic: cover.topic, stance: lie,
      truthfulness: false, confidence: 0.55, salience: 'high', day, campTime });
    outcome = { ...outcome, type: 'lie', subjectId: cover.subjectId, topic: cover.topic };
  } else if (random() < shareChance && (relevant.length || witnessed.length)) {
    const claim = relevant.sort((a, b) => (b.salience === 'high') - (a.salience === 'high') ||
      (b.day || 0) - (a.day || 0))[0];
    if (claim && (strategic || random() < 0.55)) {
      if (memory.shareCampClaim({ fromId: speaker.id, toId: listener.id, claimId: claim.id })) {
        outcome = { ...outcome, type: 'claim', subjectId: claim.subjectId, topic: claim.topic };
      }
    } else if (witnessed.length) {
      const observation = witnessed.sort((a, b) => (b.day || 0) - (a.day || 0))[0];
      if (memory.shareCampObservation({ fromId: speaker.id, toId: listener.id, observationId: observation.id })) {
        outcome = { ...outcome, type: 'gossip', subjectId: observation.actorId, topic: observation.type };
        // Repeated absences support suspicion, never proof of an idol.
        const repeated = memory.getCampImpression?.(speaker.id, observation.actorId, 'absence');
        if (observation.type === 'absence' && repeated?.count >= 3 && random() < 0.45)
          memory.recordCampClaim({ id: `${activity.id}:inference`, speakerId: speaker.id,
            listenerIds: [listener.id], subjectId: observation.actorId, topic: 'idol_suspicion',
            stance: 'possible', origin: 'inference', confidence: 0.4, day, campTime });
      }
    }
  }
  if (strategic && outcome.type === 'bond' && discreet) {
    const intent = (memory.getNpcConversationIntents?.(speaker.id, { day, limit: 4 }) || [])
      .find(entry => entry.targetId != null && ['warning', 'targeting', 'vote_pitch', 'alliance_pitch'].includes(entry.intent));
    if (intent && !same(intent.targetId, listener.id) && random() < (allied ? 0.6 : 0.3)) {
      memory.recordCampClaim({ id: `${activity.id}:pitch`, speakerId: speaker.id,
        listenerIds: [listener.id], subjectId: intent.targetId, topic: 'target',
        stance: intent.intent === 'warning' ? 'warned' : 'consider', confidence: 0.65,
        salience: 'high', day, campTime });
      outcome = { ...outcome, type: 'pitch', subjectId: intent.targetId, topic: 'target' };
    }
  }
  if (strategic && outcome.type === 'bond' && allied) {
    memory.recordConversationIntent?.({ npcId: listener.id, withId: speaker.id, intent: 'alliance_maintenance', day, campTime });
    outcome.type = 'reassurance';
  }
  if (outcome.type === 'bond' || outcome.type === 'reassurance' ||
      (activity.socialPurpose && !['strategy_conversation', 'socialize'].includes(activity.type)))
    gm.systems?.relationshipSystem?.changeRelationship?.(speaker.id, listener.id, 1);
  if (outcome.type === 'claim' && allied) gm.systems?.trustSystem?.changeTrust?.(listener.id, speaker.id, 1, 'camp_information');
  return outcome;
}
