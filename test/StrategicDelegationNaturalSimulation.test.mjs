import test from 'node:test';
import assert from 'node:assert/strict';
import { runNaturalDelegation, FAMILIES, POLICIES } from '../qa/StrategicDelegationNaturalSimulation.mjs';
for (const [i, family] of FAMILIES.entries())
  test(`natural ${family}: production scheduling, independent intentions and physical conversations`, () => {
    const r = runNaturalDelegation({ family, policy: POLICIES[i % POLICIES.length], seed: 358000 + i * 100, traceLimit: 1000 });
    assert.equal(new Set(r.initial.cast.map(p => p.id)).size, r.initial.cast.length);
    assert.equal(r.metrics.impossibleTravel, 0);
    assert.ok(r.metrics.plannerCalls > 0);
    assert.ok(r.ballots.length > 0);
    assert.ok(r.trace.some(t => t.type === 'Tribal'));
    assert.equal(r.initial.information.some(k => k.topic === 'commitment'), false);
    assert.equal(r.initial.cast.some(p => p.gameplayStyle === 'QA generic agent'), false);
  });
for (const [i, policy] of POLICIES.entries())
  test(`natural player policy ${policy}: only owned information and explicit human actions`, () => {
    const r = runNaturalDelegation({ family: 'conflicted-loyalties', policy, seed: 358900 + i, traceLimit: 1000 });
    assert.equal(r.metrics.impossibleTravel, 0);
    if (policy === 'passive') assert.equal(r.metrics.playerActions, 0);
    assert.ok(r.metrics.maxQueue <= r.initial.cast.length * 2, 'bounded total divided labor');
    assert.ok(r.metrics.candidateCount <= r.metrics.candidateCalls * 5);
  });
for (const [family, policy, seed] of [['stable-majority', 'reliable', 358005], ['conflicted-loyalties', 'deceptive', 358903]])
  test(`natural full JSON replay ${family}/${policy}: knowledge, tasks, positions, intentions and ballots`, () => {
    const a = runNaturalDelegation({ family, policy, seed, traceLimit: 0 });
    const b = runNaturalDelegation({ family, policy, seed, traceLimit: 0, reload: true });
    assert.deepEqual(b.projection, a.projection);
    assert.deepEqual(b.ballots, a.ballots);
    assert.equal(b.rngState, a.rngState);
    assert.ok(b.restoreCount >= 4);
  });
