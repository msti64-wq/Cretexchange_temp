import assert from "node:assert/strict";
import test from "node:test";
import { syntheticCases } from "../research/recovery-state/fixtures";
import { evidenceGatedBaseline, naiveOperationalProxy } from "../research/recovery-state/models";

test("all research fixtures are explicitly synthetic and uniquely identified", () => {
  assert.equal(new Set(syntheticCases.map(x => x.id)).size, syntheticCases.length);
  assert.ok(syntheticCases.every(x => x.synthetic === true));
});
test("evidence-gated baseline agrees with independently authored synthetic labels", () => {
  for (const sample of syntheticCases) {
    const result = evidenceGatedBaseline(sample.evidence);
    assert.equal(result.highestSupportedState, sample.reference.highestSupportedState, sample.id);
    assert.equal(result.recoveryEstablished, sample.reference.recoveryEstablished, sample.id);
  }
});
test("operational approval alone creates a false recovery inference in naive proxy", () => {
  const sample = syntheticCases.find(x => x.id === "owner-approved-no-receipt")!;
  assert.equal(naiveOperationalProxy(sample.evidence).recoveryEstablished, true);
  assert.equal(evidenceGatedBaseline(sample.evidence).recoveryEstablished, false);
});
test("recovery cannot be established without independent processing, output, and reconciliation", () => {
  for (const sample of syntheticCases) {
    if (!sample.evidence.independentProcessingRecord || !sample.evidence.independentRecoveredOutput || !sample.evidence.batchReconciled) {
      assert.equal(evidenceGatedBaseline(sample.evidence).recoveryEstablished, false, sample.id);
    }
  }
});
