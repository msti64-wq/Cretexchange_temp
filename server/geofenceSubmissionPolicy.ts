import type { FacilityGeofenceResult } from "./facilityGeofenceService";

export const GEOFENCE_EXCEPTION_REASON_CODES = [
  "FACILITY_PERSONNEL_DIRECTED",
  "APPROVED_AREA_INACCESSIBLE",
  "BOUNDARY_APPEARS_INCORRECT",
  "GPS_APPEARS_INACCURATE",
  "OTHER",
] as const;

export type GeofenceExceptionReasonCode = typeof GEOFENCE_EXCEPTION_REASON_CODES[number];

export type GeofenceSubmissionDecision =
  | { action: "legacy"; code: "NO_ACTIVE_PRIMARY_BOUNDARY" }
  | { action: "continue"; code: "INSIDE_APPROVED_BOUNDARY" }
  | { action: "exception_review"; code: "OUTSIDE_BOUNDARY_WITHIN_EXCEPTION_ZONE" }
  | { action: "quarantine"; code: "OUTSIDE_EXCEPTION_ZONE" }
  | { action: "recover"; code: string; reasonCode: string };

export function resolveGeofenceSubmissionDecision(input: {
  result: FacilityGeofenceResult;
  acknowledgement?: { confirmed: true; reasonCode: GeofenceExceptionReasonCode; note?: string };
  hasRequiredEvidence: boolean;
}): GeofenceSubmissionDecision {
  const { result } = input;
  if (result.state === "GEOMETRY_UNAVAILABLE" && result.reasonCode === "NO_ACTIVE_PRIMARY_BOUNDARY") {
    return { action: "legacy", code: "NO_ACTIVE_PRIMARY_BOUNDARY" };
  }
  if (result.state === "INSIDE_APPROVED_BOUNDARY") {
    return { action: "continue", code: result.state };
  }
  if (result.state === "OUTSIDE_EXCEPTION_ZONE") {
    return { action: "quarantine", code: result.state };
  }
  if (result.state === "OUTSIDE_BOUNDARY_WITHIN_EXCEPTION_ZONE") {
    if (!input.hasRequiredEvidence) {
      return { action: "recover", code: "GEOFENCE_EXCEPTION_EVIDENCE_REQUIRED", reasonCode: "REQUIRED_EVIDENCE_MISSING" };
    }
    if (!input.acknowledgement?.confirmed || !GEOFENCE_EXCEPTION_REASON_CODES.includes(input.acknowledgement.reasonCode)) {
      return { action: "recover", code: "GEOFENCE_EXCEPTION_ACKNOWLEDGEMENT_REQUIRED", reasonCode: "ACKNOWLEDGEMENT_MISSING" };
    }
    return { action: "exception_review", code: result.state };
  }
  return { action: "recover", code: result.state, reasonCode: result.reasonCode };
}
