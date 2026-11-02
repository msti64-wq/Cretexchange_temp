import { syntheticCases } from "./fixtures";
import { evidenceGatedBaseline, naiveOperationalProxy } from "./models";
import type { ResearchCase, ResearchDecision } from "./types";

export type ComparisonSummary = {
  method: string;
  totalCases: number;
  referenceRecovered: number;
  predictedRecovered: number;
  falseRecoveryConfirmations: number;
  trueRecoveryConfirmations: number;
  missedRecoveryConfirmations: number;
  recoveryDecisionCoverage: number;
  recoveryConfirmationPrecision: number | null;
  recoveryConfirmationRecall: number | null;
  stateAgreementCount: number;
  stateAgreementRate: number;
  reviewRequiredCount: number;
};
export function summarizeComparison(cases: readonly ResearchCase[], method: string, predict: (e: ResearchCase["evidence"]) => ResearchDecision): ComparisonSummary {
  if (cases.length === 0) throw new Error("Comparison requires at least one case");
  if (!cases.every(c => c.synthetic === true)) throw new Error("Only explicitly synthetic fixtures are permitted");
  let referenceRecovered = 0, predictedRecovered = 0, falseRecoveryConfirmations = 0;
  let trueRecoveryConfirmations = 0, missedRecoveryConfirmations = 0, stateAgreementCount = 0, reviewRequiredCount = 0;
  for (const c of cases) {
    const result = predict(c.evidence);
    if (c.reference.recoveryEstablished) referenceRecovered++;
    if (result.recoveryEstablished) predictedRecovered++;
    if (result.recoveryEstablished && !c.reference.recoveryEstablished) falseRecoveryConfirmations++;
    if (result.recoveryEstablished && c.reference.recoveryEstablished) trueRecoveryConfirmations++;
    if (!result.recoveryEstablished && c.reference.recoveryEstablished) missedRecoveryConfirmations++;
    if (result.highestSupportedState === c.reference.highestSupportedState) stateAgreementCount++;
    if (result.reviewRequired) reviewRequiredCount++;
  }
  return {
    method, totalCases: cases.length, referenceRecovered, predictedRecovered,
    falseRecoveryConfirmations, trueRecoveryConfirmations, missedRecoveryConfirmations,
    recoveryDecisionCoverage: predictedRecovered / cases.length,
    recoveryConfirmationPrecision: predictedRecovered ? trueRecoveryConfirmations / predictedRecovered : null,
    recoveryConfirmationRecall: referenceRecovered ? trueRecoveryConfirmations / referenceRecovered : null,
    stateAgreementCount, stateAgreementRate: stateAgreementCount / cases.length, reviewRequiredCount,
  };
}
export function compareSyntheticBaselines(cases: readonly ResearchCase[] = syntheticCases): ComparisonSummary[] {
  return [
    summarizeComparison(cases, "illustrative_naive_operational_proxy", naiveOperationalProxy),
    summarizeComparison(cases, "deterministic_evidence_gated", evidenceGatedBaseline),
  ];
}
