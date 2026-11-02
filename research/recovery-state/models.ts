import type { ResearchDecision, ResearchEvidence, PhysicalState } from "./types";

const states: PhysicalState[] = ["destination_intended", "arrival_supported", "delivery_supported", "acceptance_confirmed", "recovery_established"];
function decision(index: number, reasons: string[]): ResearchDecision {
  return { highestSupportedState: index >= 0 ? states[index] : null, recoveryEstablished: index === 4, reviewRequired: reasons.length > 0, reasons };
}
/** Illustrative operational-proxy baseline. NOT the application's production rules. */
export function naiveOperationalProxy(e: ResearchEvidence): ResearchDecision {
  if (!e.destinationSelected) return decision(-1, ["NO_DESTINATION"]);
  if (e.facilityApproved && e.freshPhoto && e.gpsUsable && e.gpsWithinBoundary === true && !e.duplicatePhoto) return decision(4, []);
  if (e.gpsUsable && e.gpsWithinBoundary === true) return decision(1, ["NO_APPROVAL_OR_PHOTO"]);
  return decision(0, ["INSUFFICIENT_LOCATION_EVIDENCE"]);
}
/** Conservative evidence-gated state baseline. Not a probabilistic model or a novelty claim. */
export function evidenceGatedBaseline(e: ResearchEvidence): ResearchDecision {
  if (!e.destinationSelected) return decision(-1, ["NO_DESTINATION"]);
  const reasons: string[] = [];
  let index = 0;
  if (!e.gpsUsable || e.gpsWithinBoundary !== true) { reasons.push("ARRIVAL_NOT_SUPPORTED"); return decision(index, reasons); }
  index = 1;
  if (!e.freshPhoto || e.duplicatePhoto) { reasons.push("DELIVERY_EVIDENCE_INSUFFICIENT"); return decision(index, reasons); }
  // A photograph alone does not establish unloading; independent receipt provides delivery support.
  if (!e.independentReceipt) { reasons.push("INDEPENDENT_DELIVERY_EVIDENCE_MISSING"); return decision(index, reasons); }
  index = 2;
  if (!e.facilityApproved) { reasons.push("ACCEPTANCE_NOT_CONFIRMED"); return decision(index, reasons); }
  index = 3;
  if (!(e.independentProcessingRecord && e.independentRecoveredOutput && e.batchReconciled)) {
    reasons.push("RECOVERY_OUTCOME_NOT_ESTABLISHED");
    return decision(index, reasons);
  }
  return decision(4, reasons);
}
