import type { ResearchCase, ResearchEvidence } from "./types";
const base: ResearchEvidence = {
  destinationSelected: true, gpsWithinBoundary: true, gpsUsable: true,
  freshPhoto: true, duplicatePhoto: false, facilityApproved: false,
  independentReceipt: false, independentProcessingRecord: false,
  independentRecoveredOutput: false, batchReconciled: false,
};
function sample(id: string, patch: Partial<ResearchEvidence>, highestSupportedState: ResearchCase["reference"]["highestSupportedState"]): ResearchCase {
  return { id, synthetic: true, evidence: { ...base, ...patch }, reference: { highestSupportedState, recoveryEstablished: highestSupportedState === "recovery_established" } };
}
export const syntheticCases: ResearchCase[] = [
  sample("arrival-only", {}, "arrival_supported"),
  sample("owner-approved-no-receipt", { facilityApproved: true }, "arrival_supported"),
  sample("stale-gps", { gpsUsable: false }, "destination_intended"),
  sample("boundary-uncertainty", { gpsWithinBoundary: null }, "destination_intended"),
  sample("duplicate-photo", { duplicatePhoto: true }, "arrival_supported"),
  sample("receipt-no-approval", { independentReceipt: true }, "delivery_supported"),
  sample("accepted-not-processed", { independentReceipt: true, facilityApproved: true }, "acceptance_confirmed"),
  sample("processed-no-output", { independentReceipt: true, facilityApproved: true, independentProcessingRecord: true }, "acceptance_confirmed"),
  sample("batch-recovered", { independentReceipt: true, facilityApproved: true, independentProcessingRecord: true, independentRecoveredOutput: true, batchReconciled: true }, "recovery_established"),
  sample("output-unreconciled", { independentReceipt: true, facilityApproved: true, independentProcessingRecord: true, independentRecoveredOutput: true }, "acceptance_confirmed"),
];
