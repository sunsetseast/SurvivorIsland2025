import { ownedCampKnowledge } from "../systems/CampKnowledge.js";
import { campGroups } from "./CampPresentation.js";
const same = (a, b) => a != null && b != null && String(a) === String(b);
const voteTopics = new Set([
  "target",
  "commitment",
  "alliance_plan",
  "backup",
  "split_assignment",
]);
const affirmative = (e) =>
  !["no", "denied", "protect", "refuse"].includes(e.stance);
const promised = (e) =>
  e.topic === "commitment" && ["yes", "commit"].includes(e.stance);
export const isScramble = (gm) =>
  gm?.gamePhase === "postChallenge" &&
  !gm.systems?.strategyPhaseSystem?.playerTribeSafe;
export function scrambleCountdown(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  return {
    text: `${Math.floor(total / 60)
      .toString()
      .padStart(2, "0")}:${(total % 60).toString().padStart(2, "0")}`,
    tier:
      total <= 120
        ? "last"
        : total <= 300
          ? "final"
          : total <= 600
            ? "urgent"
            : total <= 1200
              ? "close"
              : "open",
    label: total <= 300 ? "Final scramble" : "Tribal in",
  };
}
// Allowlisted read-only projection: physical identities and the owner's memory.
// Never reads NPC minds, objective lies, target boards or raw alliance states.
export function buildPlayerScrambleRead(gm) {
  const owner = gm.player?.id,
    memory = gm.systems?.socialMemorySystem,
    people = gm.survivors || gm.getPlayerTribe?.()?.members || [];
  const name = (id) =>
    same(id, owner)
      ? "You"
      : people.find((p) => same(p.id, id))?.firstName || "Someone";
  const claims = ownedCampKnowledge(memory, owner, gm.day).filter(
      (e) => e.kind === "claim" && e.day === gm.day,
    ),
    heard = claims.filter((e) => !same(e.speakerId, owner));
  const source = (e) =>
    e.provenance === "hearsay" || !same(e.attributedId, e.speakerId)
      ? `${name(e.sourceId || e.speakerId)} says ${name(e.attributedId || e.speakerId)}`
      : name(e.speakerId);
  const tone = (e) =>
    e.challenged
      ? "Conflicting"
      : e.provenance === "hearsay"
        ? "Heard secondhand"
        : e.provenance === "inference"
          ? "Unclear"
          : "Direct";
  const row = (e, text) => ({ key: e.id, text, source: tone(e) });
  const voteLine = (e) =>
    `${source(e)} ${promised(e) ? "said they’re voting" : e.topic === "backup" ? "mentioned a possible backup:" : e.topic === "split_assignment" ? "discussed an assignment:" : e.stance === "lean" ? "is leaning" : e.stance === "intend" ? "said their current plan is" : "mentioned"} ${name(e.subjectId)}.`;
  const names = new Map();
  for (const e of heard.filter(
    (e) => voteTopics.has(e.topic) && affirmative(e),
  )) {
    const key = String(e.subjectId);
    if (!names.has(key)) names.set(key, { name: name(e.subjectId), lines: [] });
    const g = names.get(key);
    if (!g.lines.some((r) => r.text === voteLine(e)))
      g.lines.push(row(e, voteLine(e)));
  }
  // Self-authored bluffs are still the player's own remembered promises.
  const ownPromises = (memory?.getCampClaims?.(owner) || []).filter(
    (e) => e.day === gm.day && same(e.speakerId, owner) && promised(e),
  );
  const contradictions = [],
    compared = new Set();
  const positions = heard.filter(
    (e) => ["target", "commitment"].includes(e.topic) && affirmative(e),
  );
  for (let i = 0; i < positions.length; i++)
    for (let j = i + 1; j < positions.length; j++) {
      const a = positions[i],
        b = positions[j];
      if (
        !same(a.attributedId || a.speakerId, b.attributedId || b.speakerId) ||
        same(a.subjectId, b.subjectId)
      )
        continue;
      const key = [String(a.id), String(b.id)].sort().join("|");
      if (compared.has(key)) continue;
      compared.add(key);
      contradictions.push({
        key,
        text: `${voteLine(a)} ${voteLine(b)}`,
        source: "Different stories — plans can change.",
      });
    }
  const patterns = new Map();
  for (const e of (memory?.getCampObservations?.(owner) || []).filter(
    (e) =>
      e.day === gm.day &&
      ["seen_together", "departed"].includes(e.type) &&
      e.participantIds?.length,
  )) {
    const ids = [...new Set([e.actorId, ...e.participantIds].map(String))]
      .filter((id) => !same(id, owner))
      .sort();
    if (ids.length < 2) continue;
    const key = `${e.type}:${ids.join("|")}`;
    patterns.set(key, {
      key,
      ids,
      type: e.type,
      count: (patterns.get(key)?.count || 0) + 1,
    });
  }
  const observations = [...patterns.values()]
    .filter((p) => p.type === "departed" || p.count > 1)
    .slice(-6)
    .map((p) => ({
      key: p.key,
      text: `You saw ${p.ids.map(name).join(" · ")} ${p.type === "departed" ? "leave together" : "talking together"}${p.count > 1 ? " more than once" : ""}.`,
      source: "You noticed",
    }));
  const alliances = (
    gm.systems?.allianceSystem?.getKnownAlliances?.(owner) || []
  ).map((a) => ({
    key: a.id,
    name: a.name,
    roster: a.memberIds.map(name).join(" · "),
    type:
      {
        core: "Core alliance",
        final_two: "Final two",
        voting_bloc: "Voting bloc",
        temporary: "Working together",
      }[a.type] || "Working together",
    read: a.read,
    lastDiscussed: a.lastDiscussedTargetId
      ? name(a.lastDiscussedTargetId)
      : null,
    recent: a.recent?.at(-1) || null,
  }));
  const warnings = heard
    .filter((e) => e.topic === "safety" && same(e.subjectId, owner))
    .map((e) =>
      row(
        e,
        e.stance === "yes"
          ? `${source(e)} said you’re safe.`
          : `${source(e)} ${["warned", "targeted"].includes(e.stance) ? "warned that your name came up" : "raised a concern about tonight"}.`,
      ),
    );
  const coalitionClaims = heard
    .filter((e) =>
      [
        "alliance_disclosure",
        "alliance_membership",
        "alliance_denial",
        "social_pair",
      ].includes(e.topic),
    )
    .map((e) =>
      row(
        e,
        `${source(e)} ${e.provenance === "inference" ? "thinks" : "said"} ${(e.memberIds?.length ? e.memberIds : [e.subjectId]).map(name).join(" · ")} ${["denied", "no"].includes(e.stance) ? "aren’t" : "may be"} working together.`,
      ),
    );
  const idols = heard
    .filter((e) =>
      ["idol_suspicion", "idol_possession", "idol_search"].includes(e.topic),
    )
    .map((e) =>
      row(
        e,
        `${source(e)} ${["denied", "no", "unlikely"].includes(e.stance) ? "doesn’t think there is an idol with" : "mentioned idol information about"} ${name(e.subjectId)}.`,
      ),
    );
  const current =
    gm.systems?.strategyPhaseSystem?.reasoning?.states?.[String(owner)]
      ?.intendedVoteId;
  return {
    names: [...names.values()].map((g) => ({ ...g, lines: g.lines.slice(-6) })),
    promisesToYou: heard
      .filter(
        (e) =>
          promised(e) &&
          e.provenance === "direct_statement" &&
          same(e.attributedId, e.speakerId) &&
          e.audienceIds?.some((id) => same(id, owner)),
      )
      .map((e) =>
        row(e, `${source(e)} told you: “I’m voting ${name(e.subjectId)}.”`),
      ),
    yourPromises: ownPromises.map((e) =>
      row(
        e,
        `You told ${(e.audienceIds || []).map(name).join(" · ") || "someone"}: “I’m voting ${name(e.subjectId)}.”`,
      ),
    ),
    warnings,
    contradictions: contradictions.slice(-6),
    alliances,
    coalitionClaims,
    idols,
    observations,
    currentPlan: current != null ? name(current) : null,
  };
}
export function knownMeetingForGroup(
  gm,
  group,
  known = gm.systems?.allianceSystem?.getKnownAlliances?.(gm.player?.id) || [],
) {
  const m = gm.systems?.strategyPhaseSystem?.scramble?.meetings?.find(
    (m) =>
      m.status === "active" &&
      m.location === group.location &&
      m.memberIds.some((id) => same(id, gm.player?.id)) &&
      known.some((a) => a.id === m.allianceId) &&
      group.members.some((p) => m.memberIds.some((id) => same(id, p.id))),
  );
  return m ? { id: m.id } : null;
}
export function buildNearbyScramble(gm, view) {
  const known =
    gm.systems?.allianceSystem?.getKnownAlliances?.(gm.player?.id) || [];
  const groups = campGroups(gm, view).map((g) => {
    const m = knownMeetingForGroup(gm, g, known);
    return {
      ...g,
      label: m ? "Your alliance is talking quietly" : g.label,
      names: g.members.map((p) => p.name).join(" · "),
      meetingId: m?.id || null,
    };
  });
  const invite = gm.systems?.strategyPhaseSystem?.scramble?.invitation,
    p = groups.flatMap((g) => g.members).find((p) => same(p.id, invite?.npcId));
  return {
    groups,
    invitation: p
      ? { name: p.name, npcId: p.id, activityId: invite.activityId }
      : null,
  };
}
export function contextualScrambleChoices(nodes, owned, npcId, resolved = {}) {
  const known = [...owned]
    .reverse()
    .find(
      (e) =>
        same(e.speakerId, npcId) &&
        ["target", "commitment"].includes(e.topic) &&
        affirmative(e),
    );
  const alternate = [...owned]
    .reverse()
    .find(
      (e) =>
        voteTopics.has(e.topic) &&
        affirmative(e) &&
        !same(e.subjectId, known?.subjectId) &&
        nodes.some((n) => n.id === `counter:${e.subjectId}`),
    );
  const concern =
    nodes.findLast((n) => n.id.startsWith("verify:")) ||
    nodes.findLast((n) => n.id.startsWith("confront:"));
  const ids = [
    "numbers_read",
    "vote_read",
    concern?.id,
    ...(known ? [`commit:${known.subjectId}`] : ["safety_read"]),
    alternate
      ? `counter:${alternate.subjectId}`
      : nodes.find(
          (n) =>
            n.id.startsWith("counter:") &&
            (!known || n.id !== `counter:${known.subjectId}`),
        )?.id,
    nodes.findLast((n) => n.id.startsWith("share:"))?.id,
  ];
  const selected = [...new Set(ids)]
    .map((id) => nodes.find((n) => n.id === id))
    .filter((n) => n && !resolved[n.id])
    .slice(0, 5);
  const open = nodes.find((n) => n.id === "not_commit");
  if (open && !resolved.not_commit) selected.push(open);
  return selected.map((n) => ({
    ...n,
    buttonText: n.id.startsWith("commit:") ? n.playerLine : n.buttonText,
  }));
}

// Human wording only; the saved statement and strategic speech act stay intact.
export const formatScrambleSpeech = (text) =>
  String(text)
    .replace(/\bYou is where my head is/g, "Your name is where my head is")
    .replace(/I’m voting You\b/g, "I’m voting for you")
    .replace(/I’m leaning You\b/g, "I’m leaning toward you");
