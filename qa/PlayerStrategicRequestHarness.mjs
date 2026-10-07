import assert from "node:assert/strict";
import { makeConversationStrategyQa } from "./ConversationStrategyHarness.mjs";
import { suggestedConversationActions } from "../src/modules/systems/ConversationActionCatalog.js";
export function naturalPlayerRequest({
  purpose = null,
  lowReliability = false,
} = {}) {
  const s = makeConversationStrategyQa(),
    e = s.e,
    player = s.gm.player,
    sand = s.by("Sandra"),
    j = s.by("Jeremy"),
    m = s.by("Michele"),
    t = s.by("Tony");
  s.act("promise", player, sand, { subjectId: t.id });
  s.act("promise", j, sand, { subjectId: t.id });
  for (const p of [player, j])
    s.gm.systems.trustSystem.setTrust(sand.id, p.id, p.isPlayer ? 98 : 65);
  s.gm.systems.trustSystem.setTrust(sand.id, m.id, 90);
  s.gm.systems.trustSystem.setTrust(sand.id, s.by("Parvati").id, 55);
  s.gm.systems.trustSystem.setTrust(m.id, player.id, 95);
  s.gm.systems.trustSystem.setTrust(m.id, sand.id, 85);
  for (let i = 0; i < 3; i++)
    s.memory.recordCampObservation({
      id: `player-connection:${i}`,
      actorId: player.id,
      participantIds: [m.id],
      witnessIds: [sand.id],
      type: "seen_together",
      location: "beach",
      day: s.gm.day,
      campTime: s.gm.dayTimer,
    });
  if (lowReliability)
    for (let i = 0; i < 5; i++)
      s.memory.recordConversationObligation(
        {
          id: `known-failure:${i}`,
          kind: "task",
          speakerId: player.id,
          requesterId: sand.id,
          targetId: m.id,
          status: "reported:not_done",
          day: s.gm.day,
        },
        [sand.id],
      );
  s.move("waterWell");
  s.wait(210);
  const o = e.objectives.establish(sand.id, {
    type: "blindside",
    targetId: t.id,
    explicit: true,
  });
  if (purpose) {
    o.work = { purpose, targetId: m.id, subjectId: t.id };
    if (
      ["verify_rumor", "pass_info", "leak", "protect_source"].includes(purpose)
    ) {
      s.memory.recordCampClaim({
        id: "owned-work-story",
        speakerId: sand.id,
        subjectId: t.id,
        listenerIds: [sand.id],
        topic: "target",
        stance: "possible",
        origin: "inference",
        day: s.gm.day,
        campTime: s.gm.dayTimer,
      });
      o.work.claimId = "owned-work-story";
    }
    if (purpose === "repair") {
      s.memory.recordCampClaim({
        id: "owned-work-argument",
        speakerId: sand.id,
        subjectId: m.id,
        listenerIds: [sand.id],
        topic: "public_conflict",
        stance: "argument",
        origin: "firsthand",
        day: s.gm.day,
        campTime: s.gm.dayTimer,
      });
      o.work.eventId = "owned-work-argument";
    }
  }
  s.objective = o;
  s.plan = e.objectives.plan(sand, s.gm.dayTimer);
  s.activity.interrupt(sand, "strategic_priority");
  s.activity.chooseNext(sand, s.gm.dayTimer);
  s.initialActivity = JSON.parse(JSON.stringify(sand.campActivity));
  s.openIncoming = () => {
    for (let i = 0; i < 12 && !s.strategy.scramble.invitation; i++) s.wait(45);
    const invitation = s.strategy.scramble.invitation;
    assert.ok(invitation, "NPC physically reaches player");
    assert.equal(e.together(sand.id, player.id), true);
    assert.equal(
      Object.keys(e.tasks.records).length,
      0,
      "no task before conversation",
    );
    s.strategy.scramble.clearInvitation();
    assert.ok(
      s.activity.beginConversation(sand, {
        location: player.location,
        strategy: true,
      }),
    );
    s.conversation._renderMenu = (npc, body, buttons) => {
      s.buttons = buttons;
    };
    s.conversation._clearOverlay = () => {};
    s.conversation.view.startNpc(sand, { agenda: invitation.agenda });
    return s.task();
  };
  s.suggestions = (npc) => suggestedConversationActions(e, player.id, [npc.id]);
  return s;
}
