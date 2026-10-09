import test from "node:test";
import assert from "node:assert/strict";
import { runNaturalDelegation } from "../qa/StrategicDelegationNaturalSimulation.mjs";

for (const [family, policy, seed] of [
  ["stable-majority", "passive", 359000],
  ["fluid", "active", 359302],
  ["time-pressure", "counter", 359706],
]) {
  test(`natural initiative ${family}/${policy}: actual exchanges, lawful movement and independent ballots`, () => {
    const r = runNaturalDelegation({
      family,
      policy,
      seed,
      approachQa: true,
      traceLimit: 160,
    });
    const stages = r.approaches.observed;
    assert.ok(
      Object.entries(stages).some(
        ([key, n]) => key.endsWith(":npc:semantic_action") && n > 0,
      ),
      "NPCs actually speak without requiring human participation",
    );
    // The pressure family starts directly in its final six-minute scramble.
    if (family !== "time-pressure")
      assert.ok(
        Object.entries(stages).some(
          ([key, n]) =>
            key.startsWith("preChallenge:") &&
            key.endsWith(":semantic_action") &&
            n > 0,
        ),
      );
    assert.equal(r.metrics.impossibleTravel, 0);
    assert.equal(r.metrics.nonPresentActions, 0);
    assert.ok(r.approaches.maxPending <= r.initial.cast.length - 1);
    assert.ok(r.ballots.length > 0);
    assert.equal(
      r.initial.information.some((k) => k.topic === "commitment"),
      false,
      "no seeded agreement or desired ballot",
    );
    if (policy === "passive") {
      assert.equal(r.metrics.playerActions, 0);
      assert.equal(
        Object.entries(stages)
          .filter(([key]) => key.endsWith(":player:invitation_accepted"))
          .reduce((n, [, value]) => n + value, 0),
        0,
      );
    }
  });
}

test("natural initiative JSON replay preserves actual approach receipts, response history and ballots", () => {
  const options = {
    family: "fragile-majority",
    policy: "reliable",
    seed: 359105,
    approachQa: true,
    traceLimit: 160,
  };
  const a = runNaturalDelegation(options);
  const b = runNaturalDelegation({ ...options, reload: true });
  assert.deepEqual(b.projection, a.projection);
  assert.deepEqual(b.ballots, a.ballots);
  assert.deepEqual(b.approaches, a.approaches);
  assert.deepEqual(b.approachTrace, a.approachTrace);
  assert.equal(b.rngState, a.rngState);
  assert.ok(b.restoreCount >= 4);
});
