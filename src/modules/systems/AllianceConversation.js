const same = (a, b) => a != null && b != null && String(a) === String(b);
const name = (p) => p?.firstName || p?.name || "Someone";
const line = (p, text) => ({ speaker: "NPC", name: name(p), text });
const result = (p, text) => ({ lines: [line(p, text)] });
// A public coalition conversation must still respect its audience. Someone
// quietly voting against the listener can maintain cover without announcing it.
const maintainsCover = (system, model, alliance, speakerId, listenerId) =>
  ["fake", "cover"].includes(alliance?.memberStates[speakerId]?.sincerity) ||
  model.hasVotePlan(speakerId, listenerId);
export function allianceOpening({ gm, player, npc, context, cp }) {
  const system = gm.systems.allianceSystem,
    model = gm.systems.strategyPhaseSystem.reasoning;
  const proposal = system.proposals.find((p) => p.id === cp.allianceProposalId);
  if (
    cp.allianceRecruitmentId &&
    system.pendingRecruitment.some(
      (p) => p.id === cp.allianceRecruitmentId && p.status === "pending",
    )
  )
    return [
      line(
        npc,
        "We are looking for another person to work with us. Would you consider joining?",
      ),
    ];
  if (proposal)
    return [
      line(
        npc,
        proposal.type === "final_two"
          ? "You and me. Final two. We keep this between us."
          : "I want us working together. Are you interested?",
      ),
    ];
  const participants = [
    npc.id,
    ...(gm.systems.campActivitySystem.conversation.groupIds || []),
  ]
    .map((id) => system.person(id))
    .filter((p) => system.together(player.id, p.id));
  if (participants.length > 1) {
    const a = system.getAlliance(cp.allianceId);
    cp.groupPositions ||= {};
    const meeting=gm.systems.strategyPhaseSystem.scramble?.meetings.find(m=>m.id===gm.systems.campActivitySystem.conversation.meetingId);
    const purpose=meeting?.reason||system.getMeetingNeed(a?.id)?.reason;
    const introductions={disagreement:"We’re not on the same page. Let’s hear each plan.",recruitment:"Do we need another person? We should talk before approaching anyone.",repair:"Last vote left questions. Are we still doing this?",unresolved_vote:"We need to decide where we stand for tonight."};
    const danger=model.knowledge(npc.id).find(e=>["safety","target"].includes(e.topic)&&e.stance!=="yes"&&!same(e.subjectId,npc.id));
    const intro=purpose==="member_danger"?(danger?`${name(system.person(danger.subjectId))}’s name came up. We need to check whether it’s real.`:"I don’t feel settled. What have people actually heard?"):introductions[purpose];
    const positions=participants.map((p) => {
      const s = model.state(p.id),
        cover = maintainsCover(system, model, a, p.id, player.id);
      const publicPitch = s.pitchesByAudience[player.id];
      const target = cover
        ? ([
            publicPitch?.topic === "target" ? publicPitch.subjectId : null,
            s.decoys.find((d) =>
              d.audienceIds?.some((id) => same(id, player.id)),
            )?.targetId,
            a?.roundPlan?.primaryTargetId,
            s.preferredTargetId,
          ].find(
            (id) =>
              id != null &&
              !same(id, player.id) &&
              gm.systems.strategyPhaseSystem.isTargetIdAvailable(id),
          ) ?? null)
        : s.intendedVoteId;
      cp.groupPositions[p.id] = target;
      const speech=cover
        ? {topic:'target',stance:'consider',line:target?`I can work with ${name(system.person(target))} tonight.`:'I’m still figuring it out.'}
        : model.voteStatement(p.id,target);
      if (target)
        model.statement({
          id: `${cp.activityId}:alliance-opening:${p.id}`,
          speakerId: p.id,
          listenerIds: [
            player.id,
            ...participants.filter((x) => !same(x.id, p.id)).map((x) => x.id),
          ],
          subjectId: target,
          topic: speech.topic,
          stance: speech.stance,
          mode: cover ? "decoy" : "truthful",
        });
      return line(
        p,
        speech.line,
      );
    });
    return intro?[line(npc,intro),...positions]:positions;
  }
  return [
    line(
      npc,
      context.allianceId
        ? "Let’s talk about what we have actually agreed to."
        : "What sort of relationship are you proposing?",
    ),
  ];
}
export function allianceChoices({ gm, player, npc, context, cp }) {
  const system = gm.systems.allianceSystem,
    model = gm.systems.strategyPhaseSystem.reasoning;
  const people = [
    player,
    npc,
    ...(gm.systems.campActivitySystem.conversation.groupIds || []).map((id) =>
      system.person(id),
    ),
  ].filter(
    (p, i, a) =>
      p &&
      a.findIndex((x) => same(x.id, p.id)) === i &&
      system.together(player.id, p.id),
  );
  const ids = people.map((p) => p.id),
    others = people.filter((p) => !p.isPlayer),
    a = system.getAlliance(cp.allianceId),
    nodes = [];
  const add = (id, label, resolve) => nodes.push({ id, label, resolve });
  const pending = system.proposals.find(
    (p) => p.id === cp.allianceProposalId && p.status === "pending",
  );
  const incoming = system.pendingRecruitment.find(
    (p) =>
      p.id === cp.allianceRecruitmentId &&
      same(p.candidateId, player.id) &&
      p.status === "pending",
  );
  if (incoming) {
    for (const [choice, label] of [
      ["accept", "Accept invitation"],
      ["hedge", "Keep options open"],
      ["decline", "Decline invitation"],
    ])
      add(`recruitment:${incoming.id}:${choice}`, label, (random) => {
        const response = system.respondRecruitment(incoming.id, {
          choice,
          random,
        });
        if (response?.status === "accepted")
          cp.allianceId = incoming.allianceId;
        return result(
          npc,
          response?.status === "accepted"
            ? "You have agreed to join. Let’s compare the plan."
            : "I understand. We have not added you to the group.",
        );
      });
    return nodes;
  }
  if (pending) {
    for (const [choice, label] of [
      ["accept", "Accept pact"],
      ["cover", "Agree, but keep your options open"],
      ["question", "Ask about the terms"],
      ["hedge", "Keep options open"],
      ["decline", "Decline pact"],
    ])
      add(`offer:${pending.id}:${choice}`, label, (random) => {
        if (choice === "question")
          return result(
            npc,
            pending.type === "final_two"
              ? "I’m offering an endgame promise. For tonight, we still need to agree on the vote."
              : "Let’s cooperate without assuming every future vote is settled.",
          );
        const response = system.respond(pending.id, { choice, random });
        cp.allianceId = response?.allianceId || null;
        return result(
          npc,
          ["accept", "cover"].includes(choice)
            ? "We agreed to work together. Let’s keep talking about the actual plan."
            : choice === "hedge"
              ? "Fair. We can talk again without a promise."
              : "I hear you. I’ll keep my options open too.",
        );
      });
    return nodes;
  }
  if (a && others.length > 1) {
    const support = (speaker, target) =>
      add(
        `support:${speaker.id}:${target}`,
        `Support ${name(speaker)}`,
        (random) => {
          const commitments = {},
            lines = [];
          model.commit({
            id: `${cp.activityId}:support:${target}:player`,
            speakerId: player.id,
            listenerIds: others.map((p) => p.id),
            targetId: target,
            random,
          });
          commitments[player.id] = { targetId: target, status: "committed" };
          for (const p of others) {
            const cover = maintainsCover(system, model, a, p.id, player.id);
            const decision = cover
              ? random() < 0.65
                ? "cover"
                : "hedge"
              : model.adoption(p.id, player.id, target, { random });
            if (["commit", "cover"].includes(decision)) {
              model.commit({
                id: `${cp.activityId}:support:${target}:${p.id}`,
                speakerId: p.id,
                listenerIds: ids.filter((id) => !same(id, p.id)),
                targetId: target,
                lie: cover,
                random,
              });
              commitments[p.id] = { targetId: target, status: "committed" };
              cp.groupPositions[p.id] = target;
            }
            lines.push(
              line(
                p,
                decision === "commit" || decision === "cover"
                  ? `I’m with ${name(system.person(target))} for this vote.`
                  : decision === "refuse"
                    ? `I’m not sold. I still prefer ${name(system.person(model.state(p.id).preferredTargetId))}.`
                    : "I hear the case, but I’m keeping options open.",
              ),
            );
          }
          const outcome =
            Object.keys(commitments).length === ids.length
              ? "consensus"
              : "disagreement";
          system.captureRoundPlan(
            a.id,
            people,
            { targetId: target, outcome, participantCommitments: commitments },
            cp.activityId,
          );
          return { lines };
        },
      );
    for (const p of others.slice(0, 3)) {
      const target = cp.groupPositions[p.id];
      if (
        target &&
        gm.systems.strategyPhaseSystem.isTargetIdAvailable(target) &&
        !same(target, player.id)
      )
        support(p, target);
    }
    add("commitment-check", "Ask who is actually committed", (random) => ({
      lines: others.map((p) => {
        const s = model.state(p.id);
        return line(
          p,
          ["fake", "cover"].includes(a.memberStates[p.id]?.sincerity)
            ? "I still want us working together."
            : s.committedTargetId
              ? `I have committed to ${name(system.person(s.committedTargetId))}.`
              : "I’m not committing yet.",
        );
      }),
    }));
    add("idol-concern", "Ask about idol concerns", () => ({
      lines: others.map((p) => {
        const e = model
          .knowledge(p.id)
          .find(
            (e) =>
              ["idol_suspicion", "idol_possession"].includes(e.topic) &&
              !["no", "denied", "unlikely"].includes(e.stance),
          );
        if (e)
          gm.systems.socialMemorySystem.shareCampClaim({
            fromId: p.id,
            toId: player.id,
            claimId: e.id,
          });
        return line(
          p,
          e
            ? `I have heard something about ${name(system.person(e.subjectId))}. We should consider a backup.`
            : "I don’t have useful evidence about an idol.",
        );
      }),
    }));
    add("not-commit", "Don’t commit", () =>
      result(
        npc,
        "Then let’s keep talking. Everyone still has their own decision to make.",
      ),
    );
  }
  if (!cp.allianceMore && nodes.length) {
    add("more", "Suggest a plan or other alliance action", () => {
      cp.allianceMore = true;
      return { lines: [] };
    });
    return nodes;
  }
  const recruit = system.pendingRecruitment.find(
    (p) =>
      same(p.approachById, player.id) &&
      same(p.candidateId, npc.id) &&
      p.status === "pending",
  );
  if (recruit)
    add(
      `recruit-response:${recruit.id}`,
      "Invite them into the proposed alliance",
      (random) => {
        const response = system.respondRecruitment(recruit.id, { random });
        if (response?.status === "accepted") cp.allianceId = recruit.allianceId;
        return result(
          npc,
          response?.status === "accepted"
            ? "I’ll join. Tell me what we have agreed to."
            : response?.status === "hedge"
              ? "I’m interested, but I need to think about it."
              : "I’m not joining that group.",
        );
      },
    );
  for (const [type, label] of [
    ["core", "Propose a core alliance"],
    ["final_two", "Propose a Final Two"],
    ["voting_bloc", "Propose a voting bloc"],
    ["temporary", "Work together temporarily"],
  ])
    if (system.canForm(player.id, npc.id, type))
      for(const commitment of ["real","cover"]) add(`form:${type}${commitment==="cover"?":open":""}`, commitment==="cover"?`${label}, keeping options open`:label, (random) => {
        const proposal = system.propose({
            id: `${cp.activityId}:proposal:${type}`,
            proposerId: player.id,
            receiverId: npc.id,
            type,
            secrecy: "private",
            sincerity:commitment,
          }),
          response = proposal && system.respond(proposal.id, { random });
        cp.allianceId = response?.allianceId || cp.allianceId;
        return result(
          npc,
          response?.status === "accepted"
            ? "I agree to that relationship. We should still work through the vote."
            : response?.status === "hedge"
              ? "I want to keep talking, but I’m not promising that yet."
              : "I’m keeping my options open.",
        );
      });
  if (
    others.length === 2 &&
    system.getAlliancesForSurvivor(player.id).length < 5
  )
    add("final-three", "Propose a Final Three to both of them", (random) => {
      const pact = system.formGroup({
        id: `cp:${cp.activityId}:final-three`,
        proposerId: player.id,
        participantIds: others.map((p) => p.id),
        type: "final_three",
        random,
      });
      if (pact) {
        system.linkEndgame(pact);
        cp.allianceId = pact.id;
      }
      return {
        lines: others.map((p) =>
          line(
            p,
            pact
              ? "We have each agreed to a Final Three."
              : "We don’t all agree to that pact yet.",
          ),
        ),
      };
    });
  if (a) {
    add("recommit", "Recommit to this relationship", () => ({
      lines: others.map((p) => line(p, system.recommit(p.id, a.id, player.id))),
    }));
    for(const [id,label,stance] of [["priority-honest","Tell them where this relationship stands","honest"],["priority-hedge","Keep your priorities private","hedge"],["priority-reassure","Tell them they can count on you","reassure"]])
      add(id,label,()=>{
        const top=system.getRankedAlliancesForMember(player.id)[0],honest=same(top?.id,a.id)&&system.getAllianceAffinity(player.id,npc.id)>.35;
        system.recordClaim({id:`${cp.activityId}:${id}`,speakerId:player.id,listenerIds:others.map(p=>p.id),topic:'alliance_priority',allianceId:a.id,stance:stance==='hedge'?'uncertain':stance==='honest'&&!honest?'working':'yes',...(stance==='reassure'&&!honest?{truthfulness:false}:{})});
        return result(npc,stance==='hedge'?"Okay. I still need to know whether you’re with the vote.":"I hear you. I’ll judge by what we do tonight.");
      });
    add("personal-priority", "Which alliance matters most to you?", (random) =>
      result(npc, system.priorityAnswer(npc.id, player.id, random)),
    );
    add("general-concern", "Raise a general concern", () =>
      result(
        npc,
        system.raiseConcern({
          ownerId: player.id,
          memberId: npc.id,
          allianceId: a.id,
        }),
      ),
    );
    for (const e of system.concerns(player.id, a.id))
      add(`concern:${e.id}`, "Ask about something you heard", () =>
        result(
          npc,
          system.raiseConcern({
            ownerId: player.id,
            memberId: npc.id,
            allianceId: a.id,
            evidenceId: e.id,
          }),
        ),
      );
    if (!["final_two", "final_three"].includes(a.type))
      for (const candidate of gm
        .getPlayerTribe()
        .members.filter(
          (p) =>
            system.living(p.id) &&
            !system.knownRoster(player.id, a.id).some((id) => same(id, p.id)),
        )
        .slice(0, 4))
        add(
          `recruit:${candidate.id}`,
          `Propose bringing in ${name(candidate)}`,
          () => {
            const intention = system.proposeRecruitment({
              allianceId: a.id,
              proposerId: player.id,
              candidateId: candidate.id,
              participantIds: ids,
            });
            return {
              lines: others.map((p) =>
                line(
                  p,
                  intention?.objections.some((id) => same(id, p.id))
                    ? "I don’t think they are the right person to bring in."
                    : "Someone still needs to approach them. They have to agree for themselves.",
                ),
              ),
            };
          },
        );
    const targets = gm
      .getPlayerTribe()
      .members.filter(
        (p) =>
          gm.systems.strategyPhaseSystem.isTargetIdAvailable(p.id) &&
          !same(p.id, player.id),
      );
    for (const target of targets.slice(0, 5))
      add(
        `counter:${target.id}`,
        `Suggest ${name(target)} instead`,
        (random) => {
          const lines = [],
            commitments = {};
          for (const p of others) {
            const response = model.adoption(p.id, player.id, target.id, {
              random,
            });
            lines.push(
              line(
                p,
                response === "commit"
                  ? `I can commit to ${name(target)}.`
                  : "I’m not ready to switch my plan.",
              ),
            );
            if (response === "commit")
              commitments[p.id] = { targetId: target.id, status: "committed" };
          }
          system.captureRoundPlan(
            a.id,
            people,
            {
              targetId: target.id,
              outcome: "tentative_consensus",
              participantCommitments: commitments,
            },
            cp.activityId,
          );
          return { lines };
        },
      );
    const primary = a.roundPlan?.primaryTargetId,
      secondary = targets.find(
        (p) => !same(p.id, primary) && !ids.some((id) => same(id, p.id)),
      );
    if (primary && secondary) {
      add(
        `backup:${secondary.id}`,
        `Propose ${name(secondary)} as backup`,
        () => {
          model.backup(
            player.id,
            primary,
            secondary.id,
            others.map((p) => p.id),
          );
          return result(
            npc,
            "We have a backup to discuss if the primary plan becomes unsafe. Knowing it is not the same as promising to switch.",
          );
        },
      );
      if (people.length >= 4)
        add(`split:${secondary.id}`, "Propose a split vote", (random) => {
          const assignments = Object.fromEntries(
            people.map((p, i) => [
              p.id,
              i < Math.ceil(people.length * 0.66) ? primary : secondary.id,
            ]),
          );
          const plan = model.split(
            player.id,
            primary,
            secondary.id,
            assignments,
            [player.id],
          );
          const commitments = {},
            lines = [];
          if (plan)
            for (const p of others) {
              const assigned = assignments[p.id],
                response = model.adoption(p.id, player.id, assigned, {
                  random,
                });
              if (response === "commit") {
                model.acceptSplit(p.id);
                commitments[p.id] = { targetId: assigned, status: "committed" };
              }
              lines.push(
                line(
                  p,
                  response === "commit"
                    ? `I agree to ${name(system.person(assigned))} as my assignment.`
                    : "I’m not accepting that assignment yet.",
                ),
              );
            }
          system.captureRoundPlan(
            a.id,
            people,
            {
              targetId: primary,
              outcome: "split_proposed",
              participantCommitments: commitments,
            },
            cp.activityId,
          );
          return { lines };
        });
    }
    for (const memberId of system
      .knownRoster(player.id, a.id)
      .filter((id) => !ids.some((x) => same(x, id)))
      .slice(0, 3))
      if (others.length >= 1)
        add(
          `exclude:${memberId}`,
          `Discuss leaving ${name(system.person(memberId))} out`,
          () => {
            const p = system.exclude({
              allianceId: a.id,
              proposerId: player.id,
              memberId,
              participantIds: ids,
            });
            return {
              lines: others.map((person) =>
                line(
                  person,
                  p
                    ? "We agreed not to include them in this discussion. They have not been told."
                    : "I’m not agreeing to cut them out.",
                ),
              ),
            };
          },
        );
    add("secrecy", "Ask to keep this private", () => {
      a.secrecy = "secret";
      system.recordClaim({
        speakerId: player.id,
        listenerIds: others.map((p) => p.id),
        topic: "alliance_secrecy",
        allianceId: a.id,
        stance: "secret",
      });
      return result(
        npc,
        "Let’s keep our conversations private. That doesn’t guarantee nobody notices us.",
      );
    });
    if (a.lifecycle === "disbanded" && a.type === "voting_bloc")
      add("renew", "Renew the bloc for this vote", () =>
        result(
          npc,
          system.renew(a.id, people)
            ? "We agreed to discuss another vote together."
            : "We need everyone present to renew it.",
        ),
      );
    add("social-leave", "Tell them you are stepping away", () => {
      system.leave({
        memberId: player.id,
        allianceId: a.id,
        listenerIds: others.map((p) => p.id),
      });
      return result(npc, "I hear you. I’ll make my own plans.");
    });
  }
  for (const known of system.getKnownAlliances(player.id).slice(0, 4))
    if (!system.knownRoster(npc.id, known.id).length) {
      add(`disclose:${known.id}`, `Tell them about ${known.name}`, () => {
        system.disclose({
          speakerId: player.id,
          listenerId: npc.id,
          allianceId: known.id,
        });
        return result(npc, "Thanks for telling me who you are working with.");
      });
      add(
        `deny:${known.id}`,
        `Deny working with ${known.memberIds
          .filter((id) => !same(id, player.id))
          .map((id) => name(system.person(id)))
          .join(" and ")}`,
        () => {
          system.disclose({
            speakerId: player.id,
            listenerId: npc.id,
            allianceId: known.id,
            deny: true,
          });
          return result(
            npc,
            "That is what you are telling me. I’ll keep it in mind.",
          );
        },
      );
    }
  return nodes;
}
