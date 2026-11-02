import assert from "node:assert/strict";
import test from "node:test";
import { compareSyntheticBaselines, summarizeComparison } from "../research/recovery-state/comparison";
import { syntheticCases } from "../research/recovery-state/fixtures";

test("comparison reports false confirmations and coverage without hiding denominators", () => {
  const [naive, gated] = compareSyntheticBaselines();
  assert.equal(naive.totalCases, 10);
  assert.equal(naive.referenceRecovered, 1);
  assert.equal(naive.predictedRecovered, 5);
  assert.equal(naive.falseRecoveryConfirmations, 4);
  assert.equal(naive.trueRecoveryConfirmations, 1);
  assert.equal(naive.recoveryDecisionCoverage, 0.5);
  assert.equal(gated.predictedRecovered, 1);
  assert.equal(gated.falseRecoveryConfirmations, 0);
  assert.equal(gated.trueRecoveryConfirmations, 1);
  assert.equal(gated.recoveryDecisionCoverage, 0.1);
  assert.equal(gated.stateAgreementCount, 10);
});
test("zero recovery predictions yield null precision rather than a misleading perfect score", () => {
  const result = summarizeComparison(syntheticCases, "always_abstain", () => ({
    highestSupportedState: null, recoveryEstablished: false, reviewRequired: true, reasons: ["ABSTAIN"],
  }));
  assert.equal(result.recoveryConfirmationPrecision, null);
  assert.equal(result.recoveryDecisionCoverage, 0);
  assert.equal(result.missedRecoveryConfirmations, 1);
});
test("comparison rejects empty datasets", () => {
  assert.throws(() => summarizeComparison([], "empty", () => { throw new Error("unreachable"); }), /at least one case/);
});
