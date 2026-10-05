import test from "node:test";
import assert from "node:assert/strict";
import { validateAllianceHarness } from "../qa/AllianceSimulationHarness.mjs";
test("twelve multi-round production alliance families match semantic save/restore at every exercised boundary", () => {
  const results = validateAllianceHarness();
  assert.equal(results.length, 12);
  for (const r of results) {
    assert.ok(r.saveLoadEquivalent);
    assert.ok(
      r.restoreMilestones.includes(
        "Tribal-after-deals-before-alliance-fallout",
      ),
    );
    assert.equal(r.rounds.length, r.scenario === "player-bottom" ? 1 : 3);
  }
  assert.ok(
    results.find((r) => r.scenario === "hidden-defection").metrics
      .hiddenDefections >= 1,
  );
  assert.ok(
    results.find((r) => r.scenario === "discovered-betrayal").metrics
      .discoveredBetrayals >= 1,
  );
  assert.ok(
    results.find((r) => r.scenario === "player-bottom").metrics
      .playerBottomFailure,
  );
});
