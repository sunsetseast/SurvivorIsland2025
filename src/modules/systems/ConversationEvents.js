// Public outcomes become owned memories for actual attendees. Secret ballots
// remain private: a contestant knows their own vote, not everyone else's.
export function rememberConversationTribal(engine, summary = {}) {
  const day = summary.day ?? engine.gm.day;
  const attendees = (summary.membersAtTribal || []).map((p) => p.id ?? p);
  for (const ownerId of attendees) {
    engine.memory.recordCampClaim({
      id: `tribal:${day}:outcome:${ownerId}`,
      speakerId: ownerId,
      subjectId: summary.eliminatedId ?? ownerId,
      topic: "previous_tribal",
      stance: "witnessed",
      origin: "firsthand",
      day,
      proposition: {
        eliminatedId: summary.eliminatedId ?? null,
        revote: Boolean(summary.revoteOccurred),
        resolution: summary.resolutionType,
      },
      confidence: 1,
    });
    const vote = (summary.initialVotes || summary.votes || []).find(
      (v) => String(v.voterId) === String(ownerId),
    );
    if (vote)
      engine.memory.recordCampClaim({
        id: `tribal:${day}:own-vote:${ownerId}`,
        speakerId: ownerId,
        subjectId: ownerId,
        topic: "vote_attribution",
        stance: "voted",
        origin: "firsthand",
        day,
        proposition: { targetId: vote.targetId },
        confidence: 1,
      });
    for (const play of summary.idolPlays || [])
      engine.memory.recordCampClaim({
        id: `tribal:${day}:idol:${play.playedById ?? play.playerId}:${ownerId}`,
        speakerId: ownerId,
        subjectId: play.playedById ?? play.playerId,
        topic: "idol_play",
        stance: "witnessed",
        origin: "firsthand",
        day,
        proposition: { protectedId: play.playedOnId ?? play.targetId },
        confidence: 1,
      });
  }
}
export function rememberConversationChallenge(engine, result) {
  if (!result?.completed) return;
  const day = result.challengeDay ?? engine.gm.day;
  for (const person of engine.gm.getPlayerTribe()?.members || []) {
    if (person.isOut || person.isOnJourney || person.atJourney) continue;
    engine.memory.recordCampClaim({
      id: `challenge:${day}:${result.challengeKey}:${person.id}`,
      speakerId: person.id,
      subjectId: result.individualWinnerId ?? person.id,
      topic: "challenge_result",
      stance: "witnessed",
      origin: "firsthand",
      day,
      confidence: 1,
      proposition: {
        name: result.challengeName || "the immunity challenge",
        won: result.playerTribeWon,
        winnerId: result.individualWinnerId ?? null,
      },
    });
  }
}
