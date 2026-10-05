import "./ScramblePresentationFixture.js";
const { openAlliancesOverlay, closeAlliancesOverlay } =
  await import("../src/modules/screens/camp/AlliancesOverlay.js");
const { openCreateAllianceOverlay, closeCreateAllianceOverlay } =
  await import("../src/modules/screens/camp/CreateAllianceOverlay.js");
const { openManageAllianceOverlay, closeManageAllianceOverlay } =
  await import("../src/modules/screens/camp/ManageAllianceOverlay.js");
const q = window.scrambleQa,
  { gm, activity, strategy } = q;
window.allianceQa = {
  gm,
  activity,
  strategy,
  scene(kind) {
    closeAlliancesOverlay();
    closeCreateAllianceOverlay();
    closeManageAllianceOverlay();
    gm.tribes=[{...gm.tribes[0],members:gm.survivors}];
    gm.isMerged=false;
    q.reset();
    gm.systems.socialMemorySystem.deserialize({});
    const A = gm.systems.allianceSystem,
      npcs = activity.npcs(),
      ids = [gm.player.id, ...npcs.map((p) => p.id)];
    A.reset();
    strategy.scramble.meetings = [];
    strategy.scramble.nextApproachAt = -1;
    for (const npc of npcs) {
      npc.campActivity = null;
      activity.start(npc, {
        type: "idle_at_camp",
        location: "beach",
        duration: 3000,
      });
    }
    gm.player.location = "beach";
    const majority = A.createAlliance({
        id: "qa:majority",
        name: "Coastal Five",
        memberIds: ids.slice(0, 5),
        type: "core",
      }),
      core = A.createAlliance({
        id: "qa:core",
        name: "Private Three",
        memberIds: ids.slice(0, 3),
        type: "core",
        secrecy: "secret",
      }),
      pair = A.createAlliance({
        id: "qa:pair",
        name: "You and Sandra",
        memberIds: [ids[0], ids[4]],
        type: "final_two",
      });
    for (const p of npcs) {
      strategy.updateNpcIntentTarget(p.id, ids[5], { absoluteConfidence: 0.6 });
      strategy.reasoning.state(p.id).preferredTargetId = ids[5];
    }
    A.recordClaim({
      id: "qa:discussed",
      speakerId: ids[1],
      listenerIds: [ids[0], ids[2]],
      subjectId: ids[5],
      topic: "alliance_plan",
      allianceId: core.id,
      stance: "yes",
    });
    let focus = core;
    if (kind === "strained") {
      core.memberStates[ids[0]].perceivedHealth = 0.35;
      A.recordClaim({
        speakerId: ids[1],
        listenerIds: [ids[0]],
        subjectId: ids[2],
        topic: "alliance_doubt",
        allianceId: core.id,
        stance: "uncertain",
      });
    }
    if (kind === "bottom") {
      A.exclude({
        allianceId: majority.id,
        proposerId: ids[1],
        memberId: ids[0],
        participantIds: ids.slice(1, 5),
      });
      focus = majority;
    }
    if (kind === "dormant") {
      for (const p of npcs.slice(0, 2)) p.campActivity = null;
      gm.tribes[0].members = gm.tribes[0].members.filter(
        (p) => !ids.slice(1, 3).includes(p.id),
      );
      gm.tribes.push({ id: 2, members: npcs.slice(0, 2) });
      A.onTribeSwap();
    }
    if (kind === "overview" || kind === "bottom" || kind === "dormant")
      openAlliancesOverlay();
    else if (kind === "detail" || kind === "strained")
      openManageAllianceOverlay(focus.id);
    else if (kind === "starter") openCreateAllianceOverlay();
    else if (kind === "offer") {
      const offer = A.propose({
        id: "qa:offer",
        proposerId: ids[3],
        receiverId: ids[0],
        type: "final_two",
        sincerity: "fake",
      });
      gm.systems.conversationSystem.startAllianceConversation(ids[3], null, {
        allianceProposalId: offer.id,
      });
    } else if (kind === "recruitment") {
      const invitation = A.proposeRecruitment({
        allianceId: core.id,
        proposerId: ids[0],
        candidateId: ids[3],
        participantIds: [ids[1], ids[2]],
      });
      gm.systems.conversationSystem.startAllianceConversation(ids[3], core.id);
      const cp = activity.conversation.checkpoint;
      cp.allianceMore = true;
      gm.systems.conversationSystem._renderAllianceConversation({
        player: gm.player,
        npc: npcs[2],
        context: { allianceId: core.id },
      });
      // The proposed candidate has not joined; this scene shows the member's
      // separate recruitment discussion, not an administrative roster change.
      cp.recruitmentIntentionId = invitation.id;
    } else {
      if (kind === "disagreement") {
        strategy.updateNpcIntentTarget(ids[2], ids[6], {
          absoluteConfidence: 0.95,
        });
        const mind = strategy.reasoning.state(ids[2]);
        mind.preferredTargetId = ids[6];
        mind.committedTargetId = ids[6];
      }
      gm.systems.conversationSystem.startAllianceConversation(ids[1], core.id, {
        groupParticipantIds: [ids[1], ids[2]],
      });
    }
    document.getElementById("qa-open-notebook").onclick = openAlliancesOverlay;
    return {
      allianceCount: A.alliances.length,
      coreId: core.id,
      playerId: ids[0],
      ids,
      kind,
    };
  },
  restore() {
    const save = JSON.parse(JSON.stringify(gm.createSavePayload()));
    gm.restoreSavePayload(save);
    return save;
  },
};
window.allianceQaReady = true;
