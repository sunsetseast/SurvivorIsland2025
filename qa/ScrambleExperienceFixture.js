import eventManager from "../src/modules/core/EventManager.js";
import {
  buildPlayerScrambleRead,
  buildNearbyScramble,
} from "../src/modules/ui/ScramblePresentation.js";
await import("./ScramblePresentationFixture.js");
const { gm, activity, strategy, screen, renderer } = window.scrambleQa;
await import("../src/modules/screens/camp/AlliancesOverlay.js");
const html = new DOMParser().parseFromString(
  await (await fetch("/index.html")).text(),
  "text/html",
);
for (const id of [
  "alliances-overlay",
  "create-alliance-overlay",
  "manage-alliance-overlay",
])
  document.body.appendChild(html.getElementById(id));
const baseNames = new Map(gm.survivors.map((p) => [String(p.id), p.firstName]));
let claimNumber = 0;
const say = (speaker, subject, topic = "target", stance = "lean", extra = {}) =>
  gm.systems.socialMemorySystem.recordCampClaim({
    id: `experience:${claimNumber++}`,
    speakerId: speaker.id,
    listenerIds: [gm.player.id],
    subjectId: subject.id,
    topic,
    stance,
    day: gm.day,
    campTime: gm.dayTimer,
    ...extra,
  });
function clean() {
  gm.gameState = "camp";
  renderer.notebook?.close(false);
  for (const id of [
    "alliances-overlay",
    "create-alliance-overlay",
    "manage-alliance-overlay",
  ])
    document.getElementById(id).style.display = "none";
  window.scrambleQa.reset(79);
  for (const p of gm.survivors)
    p.firstName = baseNames.get(String(p.id)) || p.firstName;
  gm.systems.socialMemorySystem.deserialize({});
  claimNumber = 0;
  renderer.restoredAt = null;
  renderer.livePresentationCue = null;
  renderer.lastCountdownTier = null;
  renderer.readCueKeys = null;
  strategy.scramble.nextApproachAt = -1;
  strategy.scramble.meetings = [];
  for (const p of activity.npcs()) {
    p.campActivity = null;
    activity.start(p, {
      type: "idle_at_camp",
      location: "beach",
      duration: 3000,
    });
  }
  renderer.resetNarration();
  renderer.signature = null;
  renderer.refresh();
}
function dense() {
  const [a, b, c, d, e] = activity.npcs();
  say(a, d);
  say(a, e, "target", "consider", { attributedId: b.id });
  say(b, d, "commitment", "yes");
  say(c, e, "backup", "possible");
  say(c, a, "target", "lean");
  say(a, d, "target", "consider", { attributedId: c.id });
  say(a, gm.player, "safety", "yes");
  say(b, gm.player, "safety", "warned");
  for (const [listener, target] of [
    [a, d],
    [b, e],
  ])
    gm.systems.socialMemorySystem.recordCampClaim({
      id: `experience:${claimNumber++}`,
      speakerId: gm.player.id,
      listenerIds: [listener.id],
      subjectId: target.id,
      topic: "commitment",
      stance: "yes",
      day: gm.day,
      campTime: gm.dayTimer,
    });
  say(c, e, "commitment", "yes");
  say(a, a, "alliance_disclosure", "yes", { memberIds: [a.id, b.id] });
  say(c, c, "alliance_disclosure", "yes", { memberIds: [c.id, d.id] });
  say(b, d, "idol_suspicion", "possible");
  for (let i = 0; i < 3; i++)
    gm.systems.socialMemorySystem.recordCampObservation({
      id: `experience:seen:${i}`,
      actorId: a.id,
      participantIds: [b.id],
      witnessIds: [gm.player.id],
      type: "seen_together",
      location: "waterWell",
      day: gm.day,
      campTime: 3600 - i * 90,
    });
  const A = gm.systems.allianceSystem;
  A.createAlliance({
    memberIds: [gm.player.id, a.id],
    type: "final_two",
    name: "Between us",
  });
  A.createAlliance({
    memberIds: [gm.player.id, a.id, b.id],
    type: "core",
    name: "The Three",
  });
  eventManager.publish("camp:readUpdated");
}
window.experienceQa = {
  gm,
  activity,
  strategy,
  renderer,
  screen,
  read: () => buildPlayerScrambleRead(gm),
  nearby: () => buildNearbyScramble(gm, gm.player.location),
  scene(name) {
    clean();
    const people = activity.npcs(),
      [a, b, c] = people;
    if (name === "departures") {
      activity.moveTogether(a, b, "rockyShore");
      activity.start(c, {
        type: "travel",
        location: "shelter",
        goal: { type: "idle_at_camp", location: "shelter", duration: 300 },
      });
    }
    if (["pair", "three", "outsider"].includes(name)) {
      const [speaker, listener, third] =
        name === "outsider" ? people.slice(3) : [a, b, c];
      const block = activity.start(speaker, {
        type: "strategy_conversation",
        location: "beach",
        targetId: listener.id,
        duration: 600,
      });
      if (name !== "pair") third.campActivity = { ...block };
    }
    if (
      [
        "knowledge",
        "contradiction",
        "alliances",
        "before",
        "restore",
        "bottom",
      ].includes(name)
    )
      dense();
    if (name === "invitation") {
      strategy.scramble.nextApproachAt = 3600;
      strategy.onActivityBoundary(3600);
      window.scrambleQa.wait(45);
    }
    if (name === "meeting" || name === "group-dialogue") {
      window.scrambleQa.meeting();
      renderer.restoredAt = null;
      const meeting = strategy.scramble.meetings[0];
      if (name === "group-dialogue") strategy.scramble.attend(meeting.id);
    }
    if (
      [
        "conversation",
        "verification",
        "warning",
        "landscape-dialogue",
      ].includes(name)
    )
      window.scrambleQa.intelligence();
    if (name === "bottom") {
      const A = gm.systems.allianceSystem,
        core = A.getAlliance("qa-core");
      core.memberStates[a.id].sincerity = "fake";
      A.exclude({
        allianceId: core.id,
        proposerId: a.id,
        memberId: gm.player.id,
        participantIds: [a.id, b.id, c.id],
      });
      gm.systems.conversationSystem.startPlayerConversation({
        npcId: b.id,
        phase: "post",
        context: { location: "beach" },
      });
    }
    if (name === "final-five") {
      gm.dayTimer = 330;
      screen.renderClockUI();
      renderer.lastCountdownTier = "urgent";
      window.scrambleQa.wait(60);
    }
    if (name === "dense-long") {
      dense();
      a.firstName = "Alexandria Montgomery-Wellington";
      b.firstName = "Christopher Alexander";
      renderer.notebook.open();
    }
    if (name === "before") {
      gm.dayTimer = 60;
      window.scrambleQa.wait(60);
    }
    if (name === "restore") {
      gm.dayTimer = 1110;
      gm.player.location = "waterWell";
      screen.loadView("waterWell", { travelPaid: true });
      for (const p of [a, b, c])
        activity.start(p, {
          type: "idle_at_camp",
          location: "waterWell",
          duration: 1000,
        });
      activity.start(a, {
        type: "strategy_conversation",
        location: "waterWell",
        targetId: b.id,
        duration: 600,
      });
      const invitation = activity.start(c, {
        type: "approach_wait",
        location: "waterWell",
        duration: 600,
        agenda: strategy.reasoning.agenda(c.id, gm.player.id, { plan: true }),
      });
      strategy.scramble.invitation = {
        npcId: c.id,
        activityId: invitation.id,
        purpose: "strategy",
        location: "waterWell",
      };
      screen.renderClockUI();
      renderer.refresh();
    }
    if (!["before", "group-dialogue"].includes(name)) {
      renderer.signature = null;
      renderer.refresh();
    }
    if (["knowledge", "contradiction"].includes(name)) renderer.notebook.open();
    if (name === "verification")
      document.querySelectorAll("#conversation-overlay button").forEach((b) => {
        if (b.textContent.startsWith("Did you mention")) b.click();
      });
    if (name === "warning")
      document.querySelectorAll("#conversation-overlay button").forEach((b) => {
        if (b.textContent === "I heard my name is coming up.") b.click();
      });
    if (name === "alliances") window.openAlliancesOverlay();
    return { name, timer: gm.dayTimer };
  },
  addNote() {
    const [a, b] = activity.npcs();
    say(a, b, "commitment", "yes");
    eventManager.publish("camp:readUpdated");
  },
  restore: () => window.scrambleQa.restore(),
  plannedMeeting() {
    clean();
    window.scrambleQa.reset(83);
    const meeting = strategy.scramble.meetings[0];
    meeting.dueAt = 3600;
    strategy.onActivityBoundary(3600);
    window.scrambleQa.wait(180);
    return meeting.location;
  },
  natural(seed) {
    clean();
    window.scrambleQa.natural(seed);
  },
  snapshot() {
    return {
      timer: gm.dayTimer,
      location: gm.player.location,
      read: buildPlayerScrambleRead(gm),
      nearby: buildNearbyScramble(gm, gm.player.location),
      checkpoint: activity.conversation?.checkpoint || null,
    };
  },
};
window.experienceQa.scene("start");
window.experienceQaReady = true;
