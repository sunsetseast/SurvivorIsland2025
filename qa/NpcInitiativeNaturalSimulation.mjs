import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { FAMILIES, POLICIES } from "./StrategicDelegationNaturalSimulation.mjs";
const root = fileURLToPath(new URL("../", import.meta.url));
// The #358 harness supplies production camp, conversations, objectives, tasks,
// knowledge and actual Tribal ballots. This runner adds observers and explicit,
// knowledge-limited human invitation policies. It never scripts an NPC motive.
export async function certifyInitiative({
  baselineRoot,
  outputDir,
  seedsPerFamily = 40,
  workers = 4,
} = {}) {
  assert.ok(baselineRoot && outputDir);
  fs.mkdirSync(outputDir, { recursive: true });
  const jobs = FAMILIES.flatMap((family, f) =>
    Array.from({ length: seedsPerFamily }, (_, n) => ({
      family,
      seed: 359000 + f * 100 + n,
      policy: POLICIES[n % POLICIES.length],
      approachQa: true,
      approachResponse:
        n % 10 === 7 ? "reject" : n % 10 === 9 ? "defer" : "participate",
      traceLimit: 160,
    })),
  );
  let next = 0,
    completed = 0;
  const pairs = [];
  const worker = async () => {
    while (next < jobs.length) {
      const job = jobs[next++],
        pair = { job };
      for (const [version, source] of Object.entries({
        baseline: baselineRoot,
        candidate: root,
      })) {
        const destination = path.join(outputDir, `${version}-${job.seed}.json`);
        await new Promise((resolve, reject) => {
          const child = spawn(
            process.execPath,
            [
              path.join(root, "qa/StrategicDelegationNaturalSimulation.mjs"),
              "--case",
              JSON.stringify(job),
              destination,
            ],
            {
              env: { ...process.env, DELEGATION_SOURCE_ROOT: source },
              stdio: ["ignore", "pipe", "pipe"],
            },
          );
          let diagnostic = "";
          child.stdout.on("data", (d) => (diagnostic += d));
          child.stderr.on("data", (d) => (diagnostic += d));
          child.on("error", reject);
          child.on("exit", (code) =>
            code === 0
              ? resolve()
              : reject(
                  Error(`${version}/${job.seed}\n${diagnostic.slice(-8000)}`),
                ),
          );
        });
        pair[version] = JSON.parse(fs.readFileSync(destination, "utf8"));
      }
      pairs.push(pair);
      console.log(
        JSON.stringify({ completed: ++completed, total: jobs.length, ...job }),
      );
    }
  };
  await Promise.all(Array.from({ length: Math.min(workers, 4) }, worker));
  pairs.sort((a, b) => a.job.seed - b.job.seed);
  const add = (a, b) => {
    for (const [k, v] of Object.entries(b || {}))
      if (typeof v === "number") a[k] = (a[k] || 0) + v;
  };
  const summarize = (records) => {
    const observed = {},
      funnel = {},
      style = {},
      families = {};
    let restored = 0,
      runtime = 0,
      survived = 0,
      alignment = 0,
      ballots = 0,
      maxPending = 0;
    for (const r of records) {
      add(observed, r.approaches.observed);
      add(funnel, r.approaches.funnel);
      restored += r.restoreEquivalent ? 1 : 0;
      runtime += r.metrics.runtimeMs;
      survived += r.outcome.playerSurvived ? 1 : 0;
      alignment += r.outcome.npcIntentAlignment;
      ballots += r.outcome.npcBallots;
      maxPending = Math.max(maxPending, r.approaches.maxPending);
      for (const [key, counts] of Object.entries(r.approaches.styles)) {
        style[key] ||= {};
        add(style[key], counts);
      }
      const f = (families[r.family] ||= {
        runs: 0,
        observed: {},
        funnel: {},
        movement: 0,
        impossibleTravel: 0,
        nonPresentActions: 0,
        plannerCalls: 0,
        playerSurvived: 0,
      });
      f.runs++;
      add(f.observed, r.approaches.observed);
      add(f.funnel, r.approaches.funnel);
      f.movement += r.metrics.movement;
      f.impossibleTravel += r.metrics.impossibleTravel;
      f.nonPresentActions += r.metrics.nonPresentActions;
      f.plannerCalls += r.metrics.plannerCalls;
      f.playerSurvived += r.outcome.playerSurvived ? 1 : 0;
    }
    return {
      runs: records.length,
      restoredEquivalent: restored,
      observed,
      funnel,
      style,
      families,
      maxPending,
      meanRuntimeMs: runtime / records.length,
      playerSurvived: survived,
      npcIntentAlignment: alignment,
      npcBallots: ballots,
    };
  };
  const summary = {
    method:
      "Shared #358 production harness; observer-only funnel; uninterrupted vs production JSON restore in each version.",
    seedsPerFamily,
    jobs: jobs.length,
    scrambles: jobs.length * 4,
    policies: POLICIES,
    baseline: summarize(pairs.map((p) => p.baseline)),
    candidate: summarize(pairs.map((p) => p.candidate)),
    cases: pairs.map(({ job, baseline, candidate }) => ({
      family: job.family,
      seed: job.seed,
      policy: job.policy,
      response: job.approachResponse,
      baseline: {
        observed: baseline.approaches.observed,
        restoreEquivalent: baseline.restoreEquivalent,
      },
      candidate: {
        observed: candidate.approaches.observed,
        restoreEquivalent: candidate.restoreEquivalent,
      },
    })),
    examples: pairs
      .filter((p, n) => n % 40 === 0)
      .map((p) => ({
        job: p.job,
        initial: p.candidate.initial,
        trace: p.candidate.approachTrace,
      })),
  };
  fs.writeFileSync(
    path.join(outputDir, "summary.json"),
    JSON.stringify(summary) + "\n",
  );
  return summary;
}
if (
  process.argv[1] &&
  import.meta.url === new URL(`file://${process.argv[1]}`).href
)
  await certifyInitiative({
    baselineRoot: process.env.INITIATIVE_BASELINE_ROOT,
    outputDir: process.env.INITIATIVE_OUTPUT || "/tmp/npc-initiative",
    seedsPerFamily: Number(process.env.INITIATIVE_SEEDS || 40),
  });
