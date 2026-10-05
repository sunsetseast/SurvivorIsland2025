import assert from "node:assert/strict";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { makeScrambleQa } from "./ScrambleSimulationHarness.mjs";
import { quiet, seeded, withQaRandom } from "./LivingCampSimulationHarness.mjs";
const { finishTribal } = await import("./TribalQaHarness.mjs");
const { default: ScrambleActivityPlan, ScrambleState } =
  await import("../src/modules/systems/ScrambleActivityPlan.js");
const { default: TribalCouncilSystem } =
  await import("../src/modules/systems/TribalCouncilSystem.js");
import {
  allianceOpening,
  allianceChoices,
} from "../src/modules/systems/AllianceConversation.js";

export const ALLIANCE_SCENARIOS = [
  "tight-core",
  "majority-inner-core",
  "competing-blocs",
  "fake-alliance",
  "player-bottom",
  "split-vote",
  "hidden-defection",
  "discovered-betrayal",
  "tribe-swap",
  "merge-reunion",
  "final-two-majority",
  "recruitment",
];
const clone = (x) => JSON.parse(JSON.stringify(x));
// Production state contains wall-clock audit metadata in older surrounding systems.
// Keep semantic time, histories, ownership, RNG and vote attribution; omit only
// their nonsemantic timestamp decoration from equality comparisons.
function semantic(x) {
  if (Array.isArray(x)) return x.map(semantic);
  if (x && typeof x === "object")
    return Object.fromEntries(
      Object.entries(x)
        .filter(
          ([k]) =>
            ![
              "timestamp",
              "updatedAt",
              "startedAt",
              "recordedAt",
              "savedAt",
            ].includes(k),
        )
        .map(([k, v]) => [k, semantic(v)]),
    );
  return x;
}
function projection(s) {
  const gm = s.gm;
  return semantic({
    day: gm.day,
    remaining: gm.dayTimer,
    phase: gm.gamePhase,
    flags: { ...gm.flags, campEventActive: Boolean(gm.flags.campEventActive) },
    alliances: gm.systems.allianceSystem.serialize(),
    memory: gm.systems.socialMemorySystem.serialize(),
    trust: gm.systems.trustSystem.serialize(),
    deals: gm.systems.dealSystem.serialize(),
    strategy: s.strategy.serialize(),
    camp: s.activity.serialize(),
    tribals: gm.tribalCouncilLog,
    survivors: gm.survivors.map((p) => ({
      id: p.id,
      isOut: p.isOut,
      tribeId: p.tribeId,
      campActivity: p.campActivity,
      dealIds: p.dealIds,
    })),
    completionStages: [...(gm._tribalCompletionStages || [])],
    completed: [...(gm._completedTribalKeys || [])],
  });
}
function run(scenario, reload, seed) {
  return quiet(() =>
    withQaRandom(seeded(seed), () => {
      const oldNow = Date.now;
      let clock = 1800000000000 + seed;
      Date.now = () => clock;
      try {
        const s = makeScrambleQa({ seed }),
          gm = s.gm,
          A = gm.systems.allianceSystem,
          ids = [gm.player.id, ...s.activity.npcs().map((p) => p.id)],
          milestones = [],
          rounds = [];
        gm.isMerged = false;
        gm.jury = [];
        gm.showGameOverScreen = () => {
          gm.gameState = "gameover";
        };
        gm._completedTribalKeys = new Set();
        gm._tribalCompletionStages = new Map();
        gm._tribalCompletionInFlight = new Set();
        A.reset();
        s.strategy.scramble.meetings = [];
        s.strategy.scramble.nextApproachAt = -1;
        s.idle();
        const checkpoint = (label) => {
          milestones.push(label);
          if (reload) s.restore();
        };
        const form = (members, type = "core", extra = {}) =>
          A.createAlliance({
            id: `qa:${scenario}:${A.alliances.length}`,
            memberIds: members,
            type,
            ...extra,
          });
        let core;
        if (
          scenario === "majority-inner-core" ||
          scenario === "final-two-majority" ||
          scenario === "player-bottom"
        ) {
          form(ids.slice(0, 5), "core", { name: "Coastal Five" });
          core = form(
            scenario === "player-bottom" ? ids.slice(1, 4) : ids.slice(0, 3),
            "core",
            { name: "Private Three", secrecy: "secret" },
          );
          for (const id of core.memberIds) core.memberStates[id].priority = 0.9;
          if (scenario === "final-two-majority") {
            const pair = form(ids.slice(0, 2), "final_two");
            A.linkEndgame(pair);
            for (const id of pair.memberIds)
              pair.memberStates[id].priority = 0.98;
          }
        } else if (scenario === "competing-blocs") {
          core = form(ids.slice(0, 3), "voting_bloc");
          const other = form([ids[1], ids[3], ids[4]], "voting_bloc");
          core.memberStates[ids[1]].priority = 0.8;
          other.memberStates[ids[1]].priority = 0.35;
          assert.equal(
            A.chooseMeeting(ids[1], [
              { id: "first", allianceId: core.id, memberIds: core.memberIds },
              {
                id: "second",
                allianceId: other.id,
                memberIds: other.memberIds,
              },
            ]).id,
            "first",
          );
        } else if (scenario === "fake-alliance") {
          const offer = A.propose({
            id: "fake-offer",
            proposerId: ids[1],
            receiverId: ids[0],
            type: "final_two",
            sincerity: "fake",
          });
          checkpoint("pending-alliance-proposal");
          const accepted = A.respond(offer.id, { choice: "accept" });
          core = A.getAlliance(accepted.allianceId);
          assert.ok(A.getAllianceAffinity(ids[1], ids[0]) < 0.02);
        } else core = form(ids.slice(0, 3));
        if (scenario === "recruitment") {
          const intent = A.proposeRecruitment({
            allianceId: core.id,
            proposerId: ids[0],
            candidateId: ids[3],
          });
          checkpoint("recruitment-before-consent");
          assert.equal(core.memberIds.includes(ids[3]), false);
          A.respondRecruitment(intent.id, { choice: "accept" });
        }
        if (scenario === "tribe-swap" || scenario === "merge-reunion") {
          let ally = gm.survivors.find((p) => p.id === ids[1]);
          gm.tribes[0].members = gm.tribes[0].members.filter(
            (p) => p.id !== ally.id,
          );
          gm.tribes.push({ id: 2, members: [ally] });
          ally.tribeId = 2;
          A.onTribeSwap();
          assert.equal(core.lifecycle, "dormant");
          assert.equal(A.together(ids[0], ids[1]), false);
          checkpoint("separated-alliance");
          ally=gm.survivors.find(p=>p.id===ids[1]);
      gm.tribes[0].members.push(ally);
          gm.tribes.pop();
          ally.tribeId = 1;
          gm.systems.npcLocationSystem.updateNpcLocation(ally.id,"beach");
          gm.isMerged = true;
          A.onMerge();
          assert.equal(A.getAlliance(core.id).lifecycle, "dormant");
          A.resolveNpcMotive(
            ids[1],
            ids[0],
            { purpose: "alliance_reunion", allianceId: core.id },
            "reunion",
            () => 0.5,
          );
          if (scenario === "merge-reunion") {
            const side = form([ids[1], ids[3]], "final_two");
            side.memberStates[ids[1]].priority = 0.99;
          }
        }
        for (let round = 0; round < 3; round++) {
          clock = 1800000000000 + seed + round * 10000;
          const tribe = gm.tribes[0],
            live = tribe.members.filter((p) => !p.isOut);
          if (live.length < 3) break;
          gm.gamePhase = "postChallenge";
          gm.gameState = "camp";
          gm.dayTimer = 3600;
          gm.flags = {};
          s.strategy.reset();
          s.strategy.isActive = true;
          s.strategy.startedForPhaseKey = `${gm.day}-postChallenge`;
          s.strategy.scrambleState = ScrambleState.ACTIVE;
          s.strategy.scramble = new ScrambleActivityPlan(gm, s.strategy, {
            rngState: seed + round,
          });
          s.activity.phaseId = s.activity.phase;
          s.activity.conversation = null;
          const npcs = live.filter((p) => !p.isPlayer);
          for (const p of live) {
            p.campActivity = null;
            p.hasImmunity = false;
            p.hasVote = true;
            p.tribeId = 1;
            if (!p.isPlayer)
              s.activity.start(p, {
                type: "idle_at_camp",
                location: "beach",
                duration: 3000,
              });
          }
          gm.player.location = "beach";
          // Fixed challenge safety lets the three-round relationship scenarios reach
          // three actual eliminations. Player-bottom deliberately gets no protection.
          gm.player.hasImmunity = scenario !== "player-bottom";
          s.strategy.seedNpcIntentTargetsForPhase();
          const primary = npcs.at(-1)?.id,
            backup = npcs.at(-2)?.id;
          for (const npc of npcs) {
            const target =
              scenario === "player-bottom" && round === 0
                ? gm.player.id
                : npc.id === primary
                  ? backup
                  : primary;
            s.strategy.updateNpcIntentTarget(npc.id, target, {
              absoluteConfidence: 0.9,
              reason: "qa:round-position",
            });
            const mind = s.strategy.reasoning.state(npc.id);
            mind.preferredTargetId = target;
            mind.committedTargetId = target;
          }
          const group =
            A.getAlliance(core.id)?.memberIds.filter(
              (id) => !gm.survivors.find((p) => p.id === id)?.isOut,
            ) || [];
          if (scenario === "player-bottom" && round === 0) {
            const majority = A.alliances.find((a) => a.name === "Coastal Five");
            A.exclude({
              allianceId: majority.id,
              proposerId: ids[1],
              memberId: ids[0],
              participantIds: ids.slice(1, 5),
            });
            assert.equal(
              A.getKnownAlliances(ids[0]).find((a) => a.id === majority.id)
                .read,
              "Working",
            );
          }
          // A real bounded group conversation; checkpoint preserves multiple speakers.
          if (
            !gm.player.isOut &&
            group.includes(gm.player.id) &&
            npcs.length >= 2
          ) {
            const first = npcs.find((p) => group.includes(p.id));
            const extras = npcs
              .filter((p) => group.includes(p.id) && p !== first)
              .map((p) => p.id);
            if (
              first &&
              s.activity.beginConversation(first, {
                strategy: true,
                location: "beach",
              })
            ) {
              s.activity.reserveConversationGroup(extras);
              let cp = s.strategy.reasoning.checkpoint(s.activity.conversation);
              cp.allianceId = core.id;
              cp.allianceTranscript = allianceOpening({
                gm,
                player: gm.player,
                npc: first,
                context: {},
                cp,
              });
              checkpoint("during-group-meeting");
              cp = s.activity.conversation.checkpoint;
              const nodes = allianceChoices({
                  gm,
                  player: gm.player,
                  npc: gm.survivors.find((p) => p.id === first.id),
                  context: {},
                  cp,
                }),
                node = nodes.find((n) => n.id === "not-commit");
              if (node)
                s.strategy.reasoning.choice(`qa:${node.id}`, node.resolve);
              s.activity.finishConversation({ strategy: true });
            }
          }
          const current = A.getAlliance(core.id),
            participants = group
              .map((id) => gm.survivors.find((p) => p.id === id))
              .filter((p) => p && !p.isPlayer && !p.isOut);
          if (participants.length >= 2)
            A.resolveMeeting(
              current.id,
              participants,
              { id: `meeting:${round}`, allianceId: current.id },
              () => 0.99,
            );
          if (scenario === "split-vote" && round === 0 && primary !== backup) {
            const assignments = Object.fromEntries(
              npcs
                .filter((p) => p.id !== primary && p.id !== backup)
                .map((p, i) => [p.id, i % 2 ? backup : primary]),
            );
            const owner = Object.keys(assignments)[0];
            if (owner) {
              s.strategy.reasoning.split(
                Number(owner),
                primary,
                backup,
                assignments,
                [Number(owner)],
              );
              for (const id of Object.keys(assignments))
                s.strategy.reasoning.acceptSplit(Number(id));
              A.captureRoundPlan(
                current.id,
                Object.keys(assignments).map((id) =>
                  gm.survivors.find((p) => String(p.id) === id),
                ),
                {
                  targetId: primary,
                  outcome: "split",
                  participantCommitments: Object.fromEntries(
                    Object.entries(assignments).map(([id, targetId]) => [
                      id,
                      { targetId, status: "committed" },
                    ]),
                  ),
                },
                `split:${round}`,
              );
            }
          }
          let defector;
          if (
            ["hidden-defection", "discovered-betrayal"].includes(scenario) &&
            round === 0
          ) {
            defector = ids[1];
            current.roundPlan = {
              day: gm.day,
              primaryTargetId: primary,
              status: "consensus",
              participantIds: [ids[0], ids[1], ids[2]],
              participantCommitments: {
                [defector]: { targetId: primary, status: "committed" },
              },
            };
            s.strategy.updateNpcIntentTarget(defector, backup, {
              absoluteConfidence: 1,
              reason: "qa:deliberate-flip",
            });
            s.strategy.reasoning.state(defector).committedTargetId = backup;
          }
          checkpoint("mid-post-immunity-scramble");
          // Preserve actual camp and mind progression, including autonomous proposals.
          s.strategy.scramble.scheduleAlliances();
          s.wait(Math.min(300, gm.dayTimer));
          checkpoint("after-autonomous-camp");
          s.wait(gm.dayTimer);
          if (defector) {
            s.strategy.updateNpcIntentTarget(defector, backup, {
              absoluteConfidence: 1,
              reason: "qa:deliberate-flip-before-Tribal",
            });
            s.strategy.reasoning.state(defector).committedTargetId = backup;
          }
          const tribal = new TribalCouncilSystem(gm, { publish() {} }),
            members = gm.tribes[0].members.filter((p) => !p.isOut);
          let summary = finishTribal(
            { gm, tribal, members },
            { playerTargetId: primary },
          );
          assert.ok(summary.eliminatedId != null);
          assert.ok(summary.initialVotes.length);
          for (const v of summary.initialVotes)
            assert.notEqual(String(v.voterId), String(v.targetId));
          // Interrupt the real completion between deal outcome and alliance fallout.
          const originalFallout = A.processPostTribalFallout.bind(A);
          let interrupted = false;
          if (reload)
            A.processPostTribalFallout = () => {
              interrupted = true;
              throw Error("QA fallout boundary");
            };
          try {
            gm.handleTribalCouncilComplete(summary);
          } catch (error) {
            if (error.message !== "QA fallout boundary") throw error;
          }
          A.processPostTribalFallout = originalFallout;
          if (interrupted) {
            checkpoint("Tribal-after-deals-before-alliance-fallout");
            gm.handleTribalCouncilComplete(summary);
          }
          if (scenario === "discovered-betrayal" && defector) {
            const actual = summary.initialVotes.find(
              (v) => String(v.voterId) === String(defector),
            );
            if (actual && actual.targetId !== primary) {
              A.recordClaim({
                id: "later-evidence",
                speakerId: gm.player.id,
                subjectId: defector,
                topic: "vote_attribution",
                stance: "yes",
                confidence: 0.85,
                allianceId: current.id,
                objectiveReference: gm.tribalCouncilLog.at(-1).id,
              });
              A.reactToOwnedEvidence();
            }
          }
          rounds.push({
            round: round + 1,
            day: summary.day,
            eliminatedId: summary.eliminatedId,
            votes: summary.initialVotes.map((v) => ({
              voterId: v.voterId,
              targetId: v.targetId,
            })),
            live: gm.survivors.filter((p) => !p.isOut).length,
          });
          checkpoint("post-Tribal-complete");
          if (gm.player.isOut) break;
        }
        const metrics = {
          ...A.metrics,
          averageAlliancesPerContestant:
            gm.survivors.reduce(
              (n, p) => n + A.getAlliancesForSurvivor(p.id).length,
              0,
            ) / gm.survivors.length,
          playerBottomFailure: scenario === "player-bottom" && gm.player.isOut,
          playerBottomRecovery:
            scenario === "player-bottom" && !gm.player.isOut,
        };
        return {
          scenario,
          seed,
          rounds,
          milestones,
          metrics,
          projection: projection(s),
        };
      } finally {
        Date.now = oldNow;
      }
    }),
  );
}
export function validateAllianceHarness() {
  return ALLIANCE_SCENARIOS.map((scenario, i) => {
    const seed = 191 + i,
      normal = run(scenario, false, seed),
      restored = run(scenario, true, seed);
    assert.deepEqual(
      restored.projection,
      normal.projection,
      `${scenario}: production restore equivalence`,
    );
    const { projection, ...report } = normal;
    return {
      ...report,
      saveLoadEquivalent: true,
      restoreMilestones: restored.milestones,
    };
  });
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const report = validateAllianceHarness();
  if (process.env.ALLIANCE_QA_OUTPUT)
    fs.writeFileSync(
      process.env.ALLIANCE_QA_OUTPUT,
      JSON.stringify(report, null, 2),
    );
  console.log(JSON.stringify(report, null, 2));
}
