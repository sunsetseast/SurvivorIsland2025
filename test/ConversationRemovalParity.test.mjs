import test from "node:test";
import assert from "node:assert/strict";
import { validateRemovalParity } from "../qa/ConversationRemovalParityAudit.mjs";
test("every removed conversation method has a disposition, replacement coverage and no unreviewed repository reference", () => {
  const a = validateRemovalParity();
  assert.deepEqual(a.errors, []);
  assert.equal(a.baselineDefinitions, 421);
  assert.equal(a.headDefinitions, 116);
  assert.equal(a.removedUnique, 304);
  assert.equal(a.obsolete + a.replaced, a.removedUnique);
});
