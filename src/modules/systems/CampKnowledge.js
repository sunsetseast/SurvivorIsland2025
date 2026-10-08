// Read-only projections of a person's existing SocialMemory. These never
// publish camp knowledge or create a second store of beliefs.
const same = (a, b) => a != null && b != null && String(a) === String(b);
const clamp = n => Math.max(0, Math.min(1, Number(n) || 0));
export const CAMP_EVIDENCE_RANK = Object.freeze({ inference: 1, hearsay: 2, direct_statement: 3, firsthand: 4 });

export function campProvenance(entry) {
  if (entry?.evidenceOrigin === 'inference' || ['inference', 'speculation'].includes(entry?.origin) || entry?.visibility === 'inference') return 'inference';
  if (entry?.origin === 'witness') return 'firsthand';
  if (entry?.origin === 'participant') return entry.topic ? 'direct_statement' : 'firsthand';
  return CAMP_EVIDENCE_RANK[entry?.origin] ? entry.origin : 'hearsay';
}
export const campEvidenceRank = entry => CAMP_EVIDENCE_RANK[campProvenance(entry)];
export const campEvidenceConfidence = entry => Math.min(clamp(entry?.confidence),
  { firsthand: 1, direct_statement: .8, hearsay: .55, inference: .4 }[campProvenance(entry)]);

export function ownedCampKnowledge(memory, ownerId, day = 1) {
  const project = (entry, kind) => ({
    id: entry.id, ownerId, kind, subjectId: kind === 'claim' ? entry.subjectId : entry.actorId,
    speakerId: entry.speakerId ?? entry.actorId, attributedId: entry.attributedId ?? entry.speakerId,
    allianceId: entry.allianceId ?? null, memberIds: [...(entry.memberIds || [])], objectiveReference: entry.objectiveReference ?? null, evidenceIds: [...(entry.evidenceIds || [])],
    proposition: entry.proposition ?? null, conditions: JSON.parse(JSON.stringify(entry.conditions || [])), commitmentStatus: entry.commitmentStatus ?? null, secrecy: entry.secrecy ?? null, delegationId: entry.delegationId ?? null, location: entry.location ?? null, activityId: entry.activityId ?? null,
    refutesClaimId:entry.refutesClaimId, speechAct: entry.speechAct, audienceIds: [...(entry.audienceIds || [])], topic: entry.topic ?? entry.type, stance: entry.stance,
    sourceId: entry.sourceId ?? null, sourceChain: [...(entry.sourceChain || [])],
    provenance: campProvenance(entry), confidence: campEvidenceConfidence(entry),
    challenged: Boolean(entry.challenged), day: entry.day, campTime: entry.campTime, semanticOrder: entry.semanticOrder ?? null, phase: entry.phase ?? null,
    salience: entry.salience, visibility: entry.visibility || 'private',
    recency: Math.pow(.8, Math.max(0, day - (entry.day ?? day)))
    // Deliberate lie truthfulness and private transcript details never leave the store.
  });
  return [...(memory?.getCampClaims?.(ownerId) || []).filter(e => e.truthfulness !== false).map(e => project(e, 'claim')),
    ...(memory?.getCampObservations?.(ownerId) || []).map(e => project(e, 'observation'))];
}

export function campTargetPreference(memory, ownerId, targetId, day = 1) {
  // Prefer the strongest owned evidence per topic, not the loudest repeated rumor.
  const strongest = new Map();
  for (const entry of ownedCampKnowledge(memory, ownerId, day)) {
    if (!same(entry.subjectId, targetId) || entry.confidence < .15) continue;
    const key = `${entry.kind}:${entry.topic}`;
    const prior = strongest.get(key);
    if (!prior || CAMP_EVIDENCE_RANK[entry.provenance] > CAMP_EVIDENCE_RANK[prior.provenance] ||
      entry.provenance === prior.provenance && entry.confidence * entry.recency > prior.confidence * prior.recency)
      strongest.set(key, entry);
  }
  let preference = 0;
  for (const entry of strongest.values()) {
    let direction = 0;
    if (entry.topic === 'target') direction = ['no', 'denied', 'protect'].includes(entry.stance) ? -.5 : .85;
    if (['idol_suspicion', 'idol_possession'].includes(entry.topic)) direction = ['unlikely', 'denied', 'no'].includes(entry.stance) ? -.25 : .45;
    if (entry.topic === 'role_neglect') direction = .15;
    if (entry.topic === 'work') direction = -.1;
    preference += direction * entry.confidence * entry.recency * (entry.challenged ? .4 : 1);
  }
  // A credible outsider claim is a small strategic concern, not proof or a vote command.
  const coalitionClaims=ownedCampKnowledge(memory,ownerId,day).filter(e=>e.topic==='alliance_disclosure'&&!['no','denied'].includes(e.stance)&&!e.challenged&&e.confidence>=.5&&e.memberIds.length>=3&&e.memberIds.some(id=>same(id,targetId))&&!e.memberIds.some(id=>same(id,ownerId)));
  if(coalitionClaims.length)preference+=Math.min(.12,Math.max(...coalitionClaims.map(e=>e.confidence*e.recency))*.12);
  const patterns = memory?.getCampImpression?.(ownerId, targetId) || {};
  preference += .2 * clamp(patterns.role_neglect?.confidence) * Math.min(1, (patterns.role_neglect?.count || 0) / 4);
  preference -= .15 * clamp(patterns.work?.confidence) * Math.min(1, (patterns.work?.count || 0) / 4);
  return Math.max(-1, Math.min(1, preference));
}

export function selectCampStrategicIntent(intents, gm, listenerId = null) {
  const members = gm?.getPlayerTribe?.()?.members || gm?.survivors || [];
  return intents.map((entry, index) => ({ ...entry, index })).filter(entry =>
    ['warning', 'targeting', 'vote_pitch', 'alliance_pitch'].includes(entry.intent) &&
    !same(entry.targetId, listenerId) && members.some(s => same(s.id, entry.targetId) &&
      !s.isOut && !s.eliminated && !s.isEliminated && !s.outOfGame))
    .sort((a, b) => Number(b.day === gm.day) - Number(a.day === gm.day) ||
      (b.day || 0) - (a.day || 0) ||
      (Number.isFinite(a.campTime) ? a.campTime : Infinity) - (Number.isFinite(b.campTime) ? b.campTime : Infinity) ||
      (Number(b.urgency) || (b.salience === 'high' ? 1 : 0)) - (Number(a.urgency) || (a.salience === 'high' ? 1 : 0)) || b.index - a.index)[0] || null;
}
