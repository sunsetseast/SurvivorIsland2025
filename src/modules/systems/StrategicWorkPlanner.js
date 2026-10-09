import {
  conversationMembers,
  samePerson as same,
} from "./ConversationActionCatalog.js";
import { conversationCharacter } from "./ConversationCharacter.js";
import { strategicWorkKey } from "./StrategicTaskActions.js";

const negative = (k) =>
  ["no", "denied", "refused", "withdrawn", "unlikely"].includes(k.stance);
const voting = ["target", "commitment"];
// Need selection only. Execution and vote authority remain in the existing systems.
export default class StrategicWorkPlanner {
  constructor(engine) {
    this.engine = engine;
  }
  candidates(owner, objective, now) {
    const e = this.engine,
      p = conversationCharacter(owner),
      post = Boolean(e.model);
    const owned = e.knowledge(owner.id).slice(-80),
      current = owned.filter((k) => k.day === e.gm.day);
    const members = conversationMembers(e.gm),
      own = e.model?.state(owner.id);
    const accounts = e.model?.planSupport(owner.id).accounts || [];
    const tasks = e.tasks
      .knownTasks(owner.id)
      .filter((t) => t.day === e.gm.day && same(t.requesterId, owner.id));
    const active = tasks.filter(
      (t) =>
        !t.report && ["accepted", "pending", "hedged"].includes(t.publicStatus),
    );
    const proposals = [],
      target = objective.targetId;
    const valued = (id) =>
      (e.gm.getTrust?.(owner.id, id) ?? 50) >= 65 ||
      (e.gm.systems.allianceSystem?.getAllianceAffinity(owner.id, id) || 0) >
        0.3;
    const delivered = (claim, id) =>
      (claim.audienceIds || []).some((x) => same(x, id)) ||
      owned.some(
        (k) =>
          same(k.speakerId, owner.id) &&
          k.audienceIds?.some((x) => same(x, id)) &&
          k.evidenceIds?.some((evidenceId) =>
            owned.some(
              (source) =>
                source.id === evidenceId &&
                same(source.subjectId, claim.subjectId) &&
                source.topic === claim.topic &&
                source.stance === claim.stance &&
                same(
                  source.attributedId || source.speakerId,
                  claim.attributedId || claim.speakerId,
                ),
            ),
          ),
      );
    const currentDirect = (id) =>
      accounts.find(
        (a) => same(a.voterId, id) && a.confirmed && same(a.targetId, target),
      );
    const bias = (purpose) =>
      ({
        recruit: p.delegationDrive * 0.6,
        verify_vote: p.consensusNeed * 0.7,
        verify_rumor: p.paranoiaDrive * 0.7,
        warn: p.loyalty * 0.6 + p.shieldValue,
        reassure: p.repairDrive * 0.8 + p.coverDrive * 0.3,
        decoy: p.coverDrive,
        gather: p.socialDrive * 0.7,
        bring: (1 - p.visibilityTolerance) * 0.7,
        repair: p.repairDrive,
        pass_info: p.loyalty * 0.5,
        check_loyalty: p.paranoiaDrive * 0.6,
        backup: p.strategyDrive * 0.7,
        split: p.strategyDrive * 0.9,
        leak: p.coverDrive * 0.7 + p.flexibility * 0.6,
        protect_source: (1 - p.visibilityTolerance) * 0.8,
      })[purpose] || 0;
    const add = (purpose, targetId, value, reason, fields = {}) => {
      if (!e.person(targetId) || same(targetId, owner.id)) return;
      const key = strategicWorkKey(objective.id, {
        purpose, targetId, subjectId: null, primaryTargetId: target, ...fields,
      });
      const sameWork = (t) => t.workKey === key || (!t.workKey &&
        t.objectiveId === objective.id && t.purpose === purpose &&
        same(t.targetId, targetId) && same(t.subjectId, fields.subjectId ?? null) &&
        (!fields.claimId || t.requestedClaimId === fields.claimId));
      if (
        active.some(sameWork)
      )
        return;
      const information = owned.find((k) => k.id === fields.claimId);
      if (
        tasks.some(
          (t) =>
            sameWork(t) &&
            ["open", "committed", "conditional", "leaning", "arrived"].includes(
              t.report?.reported,
            ) &&
            (!information ||
              (t.requestedInformation &&
                t.requestedInformation.topic === information.topic &&
                same(t.requestedInformation.subjectId, information.subjectId) &&
                t.requestedInformation.stance === information.stance)) &&
            !owned.some(
              (k) =>
                k.topic === "task_report_dispute" && k.delegationId === t.id,
            ),
        )
      )
        return;
      const receipt = objective.workReceipts?.[key];
      const rejectedWorker = receipt?.taskId && tasks.some(
        (t) => t.id === receipt.taskId && t.publicStatus === "refused",
      );
      if (receipt?.day === e.gm.day && receipt.at - now < 900 && !rejectedWorker) return;
      if (
        tasks.some(
          (t) =>
            sameWork(t) && t.report?.reported === "refused" &&
            // Countdown: larger remaining time happened earlier. A target's
            // reported refusal discourages repetition, not a worker's refusal.
            (t.report.campTime ?? t.createdAt) - now < 900,
        )
      )
        return;
      proposals.push({
        purpose,
        targetId,
        subjectId: null,
        primaryTargetId: target,
        reason,
        key,
        urgency: post && now < 600 ? 0.8 : 0.3,
        value: value + bias(purpose),
        exposureRisk: 0.25,
        secrecyNeed: Boolean(objective.secrecy),
        requiredKnowledge: [],
        deadline: post ? 0 : null,
        ...fields,
      });
    };
    const protectionRisk = current.find(
      (k) =>
        same(k.subjectId, target) &&
        !negative(k) &&
        !k.challenged &&
        k.confidence >= 0.3 &&
        ["idol_possession", "idol_suspicion", "advantage_possession"].includes(k.topic),
    );
    const suspect = current.find(
      (k) =>
        same(k.subjectId, target) &&
        ((["suspicion", "safety"].includes(k.topic) &&
          !["yes", "no"].includes(k.stance)) ||
          (k.topic === "task_report" && k.stance === "suspicious")),
    );
    const alternative =
      post && e.model?.alternateTarget(owner.id, [owner.id, target]);
    const risk = protectionRisk || suspect;
    for (const k of current) {
      const alleged = k.attributedId || k.speakerId;
      if (
        post &&
        voting.includes(k.topic) &&
        same(k.subjectId, target) &&
        !negative(k) &&
        !same(alleged, owner.id) &&
        !same(alleged, target) &&
        !currentDirect(alleged) &&
        (k.provenance === "hearsay" ||
          k.challenged ||
          (k.stance === "conditional" &&
            !(k.conditions || []).every(
              (c) =>
                c.kind === "known_commitment" && e.conditionTrue(owner.id, c),
            )))
      )
        add(
          "verify_vote",
          alleged,
          5.6,
          "A needed vote is secondhand, conditional or unsettled",
          { claimId: k.id, requiredKnowledge: [k.id] },
        );
      const verifiedReport = tasks.some(
        (t) =>
          t.purpose === "verify_rumor" &&
          t.report &&
          same(t.targetId, alleged) &&
          t.requestedInformation?.topic === k.topic &&
          same(t.requestedInformation.subjectId, k.subjectId) &&
          current.some(
            (answer) =>
              answer.delegationId === t.id &&
              answer.topic === k.topic &&
              answer.campTime <= k.campTime &&
              !answer.challenged &&
              answer.confidence >= 0.5,
          ) &&
          !current.some(
            (d) => d.topic === "task_report_dispute" && d.delegationId === t.id,
          ),
      );
      if (
        [
          "idol_suspicion",
          "idol_possession",
          "alliance_disclosure",
          "safety",
        ].includes(k.topic) &&
        (k.provenance === "hearsay" || k.challenged || k.confidence < 0.5) &&
        !verifiedReport &&
        !current.some(
          (d) =>
            same(d.subjectId, k.subjectId) &&
            d.topic === k.topic &&
            d.provenance === "direct_statement" &&
            !d.challenged &&
            d.campTime <= k.campTime,
        )
      ) {
        const witness = members
          .filter((x) => !same(x.id, owner.id) && !same(x.id, k.speakerId))
          .sort(
            (a, b) =>
              Number(same(b.id, alleged)) - Number(same(a.id, alleged)) ||
              (e.gm.getTrust?.(owner.id, b.id) ?? 50) -
                (e.gm.getTrust?.(owner.id, a.id) ?? 50),
          )[0];
        if (witness)
          add(
            "verify_rumor",
            witness.id,
            k.confidence < 0.5 || k.challenged ? 7.3 : 5.4,
            "An important weak or conflicting account needs checking",
            { claimId: k.id, requiredKnowledge: [k.id] },
          );
      }
      if (
        !same(k.subjectId, target) &&
        !same(k.subjectId, owner.id) &&
        valued(k.subjectId) &&
        k.confidence >= 0.5 &&
        !negative(k) &&
        (voting.includes(k.topic) ||
          (k.topic === "safety" && k.stance === "warned"))
      )
        add(
          "warn",
          k.subjectId,
          7,
          "I heard credible danger concerning someone useful to me",
          { claimId: k.id, requiredKnowledge: [k.id], urgency: 0.95 },
        );
      if (
        ["alliance_doubt", "alliance_exclusion"].includes(k.topic) &&
        valued(k.subjectId)
      )
        add(
          "check_loyalty",
          k.subjectId,
          6,
          "An ally's observed loyalty is uncertain",
          { claimId: k.id, requiredKnowledge: [k.id] },
        );
      for (const condition of k.conditions || [])
        if (
          post &&
          condition.kind === "known_commitment" &&
          !e.conditionTrue(owner.id, condition)
        )
          add(
            "verify_vote",
            condition.voterId,
            7,
            "A conditional supporter needs this voter confirmed first",
            { claimId: k.id, dependencyIds: [k.id], requiredKnowledge: [k.id] },
          );
    }
    for (const incident of e.events(owner.id).slice(-12)) {
      const other = same(incident.speakerId, owner.id)
        ? incident.subjectId
        : incident.speakerId;
      if (
        valued(other) &&
        [
          "betrayal",
          "public_conflict",
          "deal_breach",
          "broken_promise",
          "confront",
          "task_report_dispute",
        ].includes(incident.topic || incident.type)
      )
        add(
          "repair",
          other,
          6,
          "A damaged useful relationship needs attention",
          {
            eventId: incident.id,
            preferredExecutorType: same(incident.speakerId, owner.id)
              ? "self"
              : null,
            requiredKnowledge: [incident.id],
          },
        );
    }
    const stable = post && objective.confidence >= 0.8 && !risk && !suspect;
    const useful = current.filter(
      (k) =>
        (!stable || k.topic !== "commitment") &&
        k.confidence >= 0.5 &&
        !k.challenged &&
        ["commitment", "backup", "safety", "alliance_disclosure"].includes(
          k.topic,
        ) &&
        !same(k.speakerId, owner.id),
    );
    for (const k of useful.slice(-4)) {
      const recipient = members
        .filter(
          (x) =>
            !same(x.id, owner.id) &&
            !same(x.id, target) &&
            !same(x.id, k.speakerId) &&
            valued(x.id) &&
            !delivered(k, x.id),
        )
        .sort(
          (a, b) =>
            Number(
              current.some(
                (c) =>
                  same(c.attributedId || c.speakerId, b.id) &&
                  c.conditions?.some((d) =>
                    same(d.voterId, k.attributedId || k.speakerId),
                  ),
              ),
            ) -
            Number(
              current.some(
                (c) =>
                  same(c.attributedId || c.speakerId, a.id) &&
                  c.conditions?.some((d) =>
                    same(d.voterId, k.attributedId || k.speakerId),
                  ),
              ),
            ),
        )[0];
      if (!recipient) continue;
      const protectedSource =
        e.protectedClaim(owner.id, k) || k.secrecy?.requested;
      add(
        protectedSource ? "protect_source" : "pass_info",
        recipient.id,
        protectedSource ? 6.5 : 4.9,
        protectedSource
          ? "A useful ally needs this account but its source must stay protected"
          : "A useful ally has not heard this relevant account",
        {
          claimId: k.id,
          keepSourcePrivate: Boolean(protectedSource),
          requiredKnowledge: [k.id],
        },
      );
    }
    if (post && risk && alternative) {
      const ally = members.find(
        (x) => !same(x.id, owner.id) && !same(x.id, target) && valued(x.id),
      );
      if (ally && !own?.backup)
        add(
          "backup",
          ally.id,
          6.4,
          "Owned idol or exposure risk needs insurance",
          {
            subjectId: alternative,
            claimId: risk.id,
            requiredKnowledge: [risk.id],
          },
        );
      const confirmed = [
        owner.id,
        ...accounts
          .filter((a) => a.confirmed && same(a.targetId, target))
          .map((a) => a.voterId),
      ];
      const capacity = e.model.splitCapacity?.(confirmed, alternative);
      // Exposure is not protection. Weak hearsay should be checked before
      // precise distribution; urgent credible owned protection can proceed.
      const credibleProtection = protectionRisk && protectionRisk.confidence >= 0.5 &&
        (!protectionRisk.challenged);
      if (ally && credibleProtection && capacity?.viable && !own?.splitPlan)
        add(
          "split",
          ally.id,
          7.2,
          "A confirmed coalition can cover both sides of an idol split",
          {
            subjectId: alternative,
            claimId: risk.id,
            requiredKnowledge: [
              risk.id,
              ...accounts.filter((a) => a.confirmed).map((a) => a.evidenceId),
            ],
            coalitionIds: confirmed,
          },
        );
    }
    if (post && suspect && objective.secrecy) {
      add(
        "reassure",
        target,
        6.3,
        "The target's observed nerves threaten the concealed plan",
        {
          claimId: suspect.id,
          truthMode: "fabrication",
          requiredKnowledge: [suspect.id],
        },
      );
      if (alternative && p.coverDrive > 0.4)
        add(
          "decoy",
          target,
          6.8,
          "A nervous target needs a plausible cover story",
          {
            subjectId: alternative,
            claimId: suspect.id,
            truthMode: "fabrication",
            requiredKnowledge: [suspect.id],
          },
        );
      const story = current.find(
        (k) =>
          same(k.subjectId, alternative) &&
          voting.includes(k.topic) &&
          !negative(k),
      );
      if (story && p.coverDrive + p.flexibility > 1.1)
        add(
          "leak",
          target,
          7,
          "Let a believable alternate story reach the target indirectly",
          {
            claimId: story.id,
            requiredKnowledge: [suspect.id, story.id],
            exposureRisk: 0.7,
          },
        );
    }
    if (!stable)
      for (const other of members
        .filter((x) => !same(x.id, owner.id) && !same(x.id, target))
        .sort(
          (a, b) =>
            (e.gm.getTrust?.(owner.id, b.id) ?? 50) -
            (e.gm.getTrust?.(owner.id, a.id) ?? 50),
        )
        .slice(0, 6)) {
        if (currentDirect(other.id)) continue;
        const account = accounts.find((a) => same(a.voterId, other.id));
        const conditional = current.find(
          (k) =>
            same(k.attributedId || k.speakerId, other.id) &&
            k.stance === "conditional",
        );
        const seen = e.memory
          .getCampObservations(owner.id)
          .filter(
            (k) =>
              k.type === "seen_together" &&
              (same(k.actorId, other.id) ||
                k.participantIds?.some((id) => same(id, other.id))),
          );
        if (post && !account)
          add(
            "gather",
            other.id,
            3.7,
            "We lack a useful read on this potential connection",
          );
        if (
          post &&
          (!account || !same(account.targetId, target) || !account.confirmed)
        )
          add(
            "recruit",
            other.id,
            3.5,
            "The move still needs an independently willing voter",
            { subjectId: target },
          );
        if (
          conditional ||
          (!account &&
            seen.length &&
            objective.secrecy &&
            p.visibilityTolerance < 0.4)
        )
          add(
            "bring",
            other.id,
            conditional ? 6.2 : 4.8,
            "A private meeting can clarify a conditional or connected voter",
            {
              requiredKnowledge: conditional
                ? [conditional.id]
                : seen.map((k) => k.id),
              reasonLine: conditional
                ? "I want to talk about who is really with us."
                : null,
            },
          );
        if (!post && !account)
          add(
            "gather",
            other.id,
            3,
            "Understand social connections before any Tribal commitment",
          );
        if (account?.claim?.challenged && valued(other.id))
          add(
            "reassure",
            other.id,
            5,
            "An uncertain ally needs relationship maintenance",
            { claimId: account.evidenceId },
          );
      }
    // Two outstanding assignments are enough divided labor. Urgent personal work remains possible.
    return proposals
      .filter(
        (w) =>
          !active.some((t) => same(t.targetId, w.targetId) && !t.report) ||
          w.urgency >= 0.9,
      )
      .map((w) => ({
        ...w,
        preferSelf:
          active.length >= 2 ||
          w.preferredExecutorType === "self" ||
          (post && now < 240),
        value: w.value - w.exposureRisk * (1 - p.visibilityTolerance),
      }))
      .sort((a, b) => b.value - a.value || a.key.localeCompare(b.key))
      .slice(0, 5);
  }
}
