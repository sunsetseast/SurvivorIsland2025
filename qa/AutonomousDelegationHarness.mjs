import { makeConversationStrategyQa } from "./ConversationStrategyHarness.mjs";
// Fixtures configure circumstances, never objective.work or a requested result.
export function autonomousSituation(situation) {
  const s = makeConversationStrategyQa(),
    e = s.e,
    S = s.by("Sandra"),
    J = s.by("Jeremy"),
    M = s.by("Michele"),
    T = s.by("Tony"),
    P = s.by("Parvati");
  s.gm.dayTimer = 3000;
  S.gameplayStyle = "Social Genius";
  S.honesty = 9;
  S.paratend = 5;
  for (const person of s.activity.members())
    if (person.id !== S.id)
      s.gm.systems.trustSystem.setTrust(S.id, person.id, 55);
  s.gm.systems.trustSystem.setTrust(S.id, M.id, 90);
  s.gm.systems.trustSystem.setTrust(S.id, J.id, 80);
  for (const person of [J, M, P])
    s.activity.start(person, {
      type: "idle_at_camp",
      location: "waterWell",
      duration: 3000,
    });
  const claim = (name, speaker, subject, topic, stance = "yes", extra = {}) => {
    const id = `situation:${name}`;
    s.memory.recordCampClaim({
      id,
      speakerId: speaker.id,
      subjectId: subject.id,
      topic,
      stance,
      listenerIds: [S.id],
      origin: "participant",
      confidenceByListener: { [S.id]: 0.9 },
      day: s.gm.day,
      campTime: s.gm.dayTimer,
      ...extra,
    });
    return id;
  };
  const sighting = () =>
    s.memory.recordCampObservation({
      id: "connected-voter",
      actorId: s.gm.player.id,
      participantIds: [M.id],
      witnessIds: [S.id],
      type: "seen_together",
      day: s.gm.day,
      campTime: s.gm.dayTimer,
      location: "beach",
    });
  if (situation === "recruit") {
    S.gameplayStyle = "Power Player";
    for (const person of s.activity.members())
      if (![S.id, T.id].includes(person.id))
        claim(`lean:${person.id}`, person, P, "target", "lean");
  }
  if (situation === "verify_vote")
    claim("secondhand-vote", J, T, "commitment", "yes", {
      attributedId: M.id,
      origin: "hearsay",
      sourceChain: [M.id, J.id],
    });
  if (situation === "verify_rumor")
    claim("weak-idol", J, T, "idol_suspicion", "possible", {
      attributedId: P.id,
      origin: "hearsay",
      confidenceByListener: { [S.id]: 0.35 },
    });
  if (situation === "warn") claim("ally-danger", P, J, "target", "consider");
  if (["reassure", "decoy", "leak"].includes(situation))
    claim("target-nerves", T, T, "suspicion", "nervous");
  if (situation === "decoy") {
    S.gameplayStyle = "Shadow Strategist";
    S.honesty = 2;
  }
  if (situation === "leak") {
    S.gameplayStyle = "Wildcard";
    S.honesty = 1;
    S.risk = 10;
    s.gm.systems.trustSystem.setTrust(S.id, P.id, 20);
    claim("plausible-cover", J, P, "target", "consider");
  }
  if (situation === "bring") {
    S.gameplayStyle = "Shadow Strategist";
    sighting();
  }
  if (situation === "repair")
    claim("real-conflict", M, J, "public_conflict", "argument");
  if (["pass_info", "protect_source"].includes(situation)) {
    const id = claim("important-commitment", J, T, "commitment");
    if (situation === "protect_source") {
      S.gameplayStyle = "Shadow Strategist";
      s.memory.recordConversationObligation(
        {
          id: "protect-real-source",
          kind: "secrecy",
          speakerId: S.id,
          requesterId: J.id,
          claimId: id,
          status: "accepted",
          useWithoutName: true,
          allowedIds: [S.id, J.id],
        },
        [S.id],
      );
    }
  }
  if (situation === "check_loyalty")
    claim("ally-doubt", M, M, "alliance_doubt", "uncertain");
  if (["backup", "split"].includes(situation))
    claim("direct-idol-evidence", T, T, "idol_possession");
  if (situation === "split") {
    for (const name of ["Aubry", "Cirie"]) {
      const x = {
        ...J,
        campActivity: null,
        id: Math.max(...s.gm.survivors.map((x) => Number(x.id))) + 1,
        firstName: name,
        isPlayer: false,
      };
      s.gm.survivors.push(x);
      const tribe = s.gm.tribes.find((t) =>
        t.members.some((x) => x.id === S.id),
      );
      if (tribe.members !== s.gm.survivors) tribe.members.push(x);
      s.activity.start(x, {
        type: "idle_at_camp",
        location: "beach",
        duration: 3000,
      });
      s.gm.systems.trustSystem.setTrust(S.id, x.id, 80);
    }
    s.gm.systems.trustSystem.setTrust(S.id, P.id, 20);
    for (const person of s.activity
      .members()
      .filter((x) => ![S.id, T.id, P.id].includes(x.id)))
      claim(`firm:${person.id}`, person, T, "commitment");
  }
  if (situation === "bring")
    s.gm.systems.trustSystem.setTrust(S.id, s.gm.player.id, 98);
  s.objective = e.objectives.establish(S.id, {
    type: ["bring", "reassure", "decoy", "leak"].includes(situation)
      ? "blindside"
      : "build_majority",
    targetId: T.id,
    explicit: true,
  });
  s.claim = claim;
  s.sighting = sighting;
  s.owner = S;
  return s;
}
