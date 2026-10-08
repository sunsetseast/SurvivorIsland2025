import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

// QA-only aggregation. Never imported by gameplay; private task truth belongs
// only in certification output, never a player-facing status or NPC belief.
const input = process.argv[2], destination = process.argv[3];
if (!input || !destination) throw Error('Usage: node qa/SummarizeStrategicDelegation.mjs results.json output-directory');
const rows = JSON.parse(fs.readFileSync(input, 'utf8'));
const maps = ['generated', 'selected', 'executed', 'self', 'npcDelegation', 'playerDelegation',
  'responses', 'reports', 'status', 'strategy', 'obligations'];
const scalars = ['plannerCalls', 'candidateCalls', 'candidateCount', 'movement', 'impossibleTravel',
  'repeatedRequests', 'redundantVerification', 'repeatedAgenda', 'playerActions', 'counterAttempts',
  'disputes', 'reassignments', 'objectiveAbandoned', 'followups', 'reportsDelivered', 'quietPlannerCalls',
  'targetFlips', 'attemptedTasks', 'reportedTasks'];
const add = (target, source = {}) => { for (const [key, n] of Object.entries(source)) target[key] = (target[key] || 0) + n; };
const rounded = n => Math.round(n * 100) / 100;
function aggregate(cases) {
  const a = { runs: cases.length, replays: 0, playerSurvived: 0, ballotCount: 0, ballotIntentAgreement: 0,
    majorityOutcomes: 0, competingObjectiveRuns: 0, backups: 0, splits: 0, maxQueue: 0, maxCandidates: 0,
    maxSaveBytes: 0, runtimeMs: 0, restoreMs: 0, restoreBoundaries: {}, styles: {} };
  maps.forEach(k => a[k] = {}); scalars.forEach(k => a[k] = 0);
  const runtimes = [];
  for (const c of cases) {
    assert.equal(c.restoreEquivalent, true); a.replays++;
    for (const k of maps) add(a[k], c.metrics[k]);
    for (const k of scalars) a[k] += c.metrics[k] || 0;
    for (const [style, values] of Object.entries(c.metrics.style)) {
      const s = a.styles[style] ||= { selected: {}, self: 0, delegated: 0, private: 0 };
      add(s.selected, values.selected); for (const k of ['self', 'delegated', 'private']) s[k] += values[k];
    }
    for (const label of c.restoreBoundaries) a.restoreBoundaries[label] = (a.restoreBoundaries[label] || 0) + 1;
    a.playerSurvived += Number(c.outcome.playerSurvived);
    a.ballotCount += c.outcome.npcBallots; a.ballotIntentAgreement += c.outcome.npcIntentAlignment;
    a.majorityOutcomes += Number(c.outcome.leadingVotes > c.ballots.length / 2);
    a.competingObjectiveRuns += Number(c.outcome.competingObjectives > 1);
    a.backups += c.outcome.backups; a.splits += c.outcome.splits;
    a.maxQueue = Math.max(a.maxQueue, c.metrics.maxQueue);
    a.maxCandidates = Math.max(a.maxCandidates, c.metrics.maxCandidateSet);
    a.maxSaveBytes = Math.max(a.maxSaveBytes, c.metrics.saveBytes);
    a.runtimeMs += c.metrics.runtimeMs; runtimes.push(c.metrics.runtimeMs); a.restoreMs += c.restoreMs;
  }
  runtimes.sort((a,b) => a-b);
  a.averageRuntimeMs = rounded(a.runtimeMs / cases.length);
  a.p95RuntimeMs = rounded(runtimes[Math.floor((runtimes.length - 1) * .95)]);
  a.meanCandidatesPerCall = rounded(a.candidateCount / Math.max(1, a.candidateCalls));
  a.runtimeMs = rounded(a.runtimeMs); a.restoreMs = rounded(a.restoreMs);
  return a;
}
assert.equal(new Set(rows.map(r => r.job.seed)).size, rows.length);
const summary = { schema: 1, baselineCommit: '96e632e0d1b5ea16787e6976e766737f5937d70e',
  pairs: rows.length, gamesIncludingJsonReplays: rows.length * 4, fingerprints: {}, totals: {}, families: {}, policies: {},
  definitions: {
    generated: 'Candidate appearances at semantic planning calls; not unique jobs or task quotas.',
    selected: 'Selected approaches; may repeat while travel/reservation is pending.',
    executed: 'Task-linked semantic attempt events, not unique successes.',
    attemptedTasks: 'Unique tasks with an actual conversation execution receipt.',
    reportedTasks: 'Tasks with a spoken report; a report is not proof of successful work.',
    ballotIntentAgreement: 'Diagnostic agreement with persistent intention after Tribal; certified resolver may legally adapt at Tribal.',
    majorityOutcomes: 'Actual initial Tribal tally has a strict majority; not an omniscient NPC belief.',
    repeatedAgenda: 'Repeated selection of the same work key; includes normal continuing travel.',
    maxQueue: 'Camp-wide unresolved task records, not one contestant issuing all those requests.',
    restoreMs: 'Total synchronous restore time in paired replay runs; includes snapshot checks.',
    style: 'Observed production cast behavior in differing circumstances, not a matched-pair personality experiment.' } };
for (const version of ['baseline','candidate']) {
  const cases = rows.map(r => r[version]);
  const fingerprints = new Set(cases.map(c => c.sourceFingerprint));
  assert.equal(fingerprints.size, 1, 'each version uses frozen source');
  summary.fingerprints[version] = [...fingerprints][0]; summary.totals[version] = aggregate(cases);
  for (const family of new Set(rows.map(r => r.job.family)))
    (summary.families[family] ||= {})[version] = aggregate(cases.filter(c => c.family === family));
  for (const policy of new Set(rows.map(r => r.job.policy)))
    (summary.policies[policy] ||= {})[version] = aggregate(cases.filter(c => c.policy === policy));
}
fs.mkdirSync(destination, { recursive: true });
fs.writeFileSync(path.join(destination, 'SUMMARY.json'), JSON.stringify(summary) + '\n');
const perSeed = rows.map(r => ({ ...r.job, ...Object.fromEntries(['baseline','candidate'].map(v => [v, {
  stateHash: r[v].stateHash, outcome: r[v].outcome, responses: r[v].metrics.responses,
  status: r[v].metrics.status, selected: r[v].metrics.selected,
  attemptedTasks: r[v].metrics.attemptedTasks, reportedTasks: r[v].metrics.reportedTasks,
  repeatedRequests: r[v].metrics.repeatedRequests, impossibleTravel: r[v].metrics.impossibleTravel,
  maxQueue: r[v].metrics.maxQueue, runtimeMs: rounded(r[v].metrics.runtimeMs),
  restoreEquivalent: r[v].restoreEquivalent, restoreBoundaries: r[v].restoreBoundaries,
}])) }));
fs.writeFileSync(path.join(destination, 'SEEDS.json'), JSON.stringify(perSeed) + '\n');
const samples = [];
for (const family of Object.keys(summary.families)) {
  const pair = rows.filter(r => r.job.family === family).sort((a,b) =>
    (b.candidate.metrics.reassignments * 20 + b.candidate.metrics.reportedTasks * 5 + b.candidate.metrics.attemptedTasks) -
    (a.candidate.metrics.reassignments * 20 + a.candidate.metrics.reportedTasks * 5 + a.candidate.metrics.attemptedTasks))[0];
  const { metrics, trace, taskResults, initial, outcome, ballots, traceOmitted } = pair.candidate;
  samples.push({ ...pair.job, initial, metrics, taskResults, trace, traceOmitted, outcome, ballots });
}
fs.writeFileSync(path.join(destination, 'TRACES.json'), JSON.stringify(samples) + '\n');
console.log(JSON.stringify(summary.totals, null, 2));
