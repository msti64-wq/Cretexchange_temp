/** Research-only synthetic evidence states; never operational approval or payment logic. */
export type PhysicalState = "destination_intended" | "arrival_supported" | "delivery_supported" | "acceptance_confirmed" | "recovery_established";
export type EvidenceSource = "driver_device" | "facility_operator" | "independent_facility_record";
export type ResearchEvidence = {
  destinationSelected: boolean;
  gpsWithinBoundary: boolean | null;
  gpsUsable: boolean;
  freshPhoto: boolean;
  duplicatePhoto: boolean;
  facilityApproved: boolean;
  independentReceipt: boolean;
  independentProcessingRecord: boolean;
  independentRecoveredOutput: boolean;
  batchReconciled: boolean;
};
export type ResearchCase = {
  id: string;
  synthetic: true;
  evidence: ResearchEvidence;
  reference: { highestSupportedState: PhysicalState | null; recoveryEstablished: boolean };
};
export type ResearchDecision = {
  highestSupportedState: PhysicalState | null;
  recoveryEstablished: boolean;
  reviewRequired: boolean;
  reasons: string[];
};
