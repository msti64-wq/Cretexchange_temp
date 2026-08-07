import type { ActivityGeofenceEvaluation } from "@shared/schema";

export type OwnerGeofencePresentationState =
  | "INSIDE_DELIVERY_BOUNDARY"
  | "JUST_OUTSIDE_DELIVERY_BOUNDARY"
  | "LOCATION_UNCERTAIN"
  | "LOCATION_UNVERIFIED"
  | "BOUNDARY_NOT_CONFIGURED"
  | "NOT_RECORDED";

export type OwnerGeofenceContext = {
  presentationState: OwnerGeofencePresentationState;
  evaluatedAt: string | null;
  boundaryVersion: number | null;
  acknowledgementCode: string | null;
  driverNote: string | null;
  evidenceComplete: boolean;
};

const BOUNDARY_UNCERTAINTY_REASONS = new Set([
  "LOCATION_UNCERTAINTY_OVERLAPS_BOUNDARY",
  "LOCATION_UNCERTAINTY_OVERLAPS_EXCEPTION_THRESHOLD",
]);

/**
 * Projects immutable submission evidence into the minimum Owner-facing shape.
 * Precise coordinates, accuracy, edge distance, geometry, and raw reason codes
 * deliberately remain in the private evidence record.
 */
export function projectOwnerGeofenceContext(
  evaluation?: ActivityGeofenceEvaluation | null,
): OwnerGeofenceContext {
  if (!evaluation || evaluation.evaluationPurpose !== "submission") {
    return {
      presentationState: "NOT_RECORDED",
      evaluatedAt: null,
      boundaryVersion: null,
      acknowledgementCode: null,
      driverNote: null,
      evidenceComplete: false,
    };
  }

  let presentationState: OwnerGeofencePresentationState;
  switch (evaluation.resultState) {
    case "INSIDE_APPROVED_BOUNDARY":
      presentationState = "INSIDE_DELIVERY_BOUNDARY";
      break;
    case "OUTSIDE_BOUNDARY_WITHIN_EXCEPTION_ZONE":
      presentationState = "JUST_OUTSIDE_DELIVERY_BOUNDARY";
      break;
    case "LOCATION_ACCURACY_INSUFFICIENT":
      presentationState = BOUNDARY_UNCERTAINTY_REASONS.has(evaluation.reasonCode)
        ? "LOCATION_UNCERTAIN"
        : "LOCATION_UNVERIFIED";
      break;
    case "GEOMETRY_UNAVAILABLE":
      presentationState = evaluation.reasonCode === "NO_ACTIVE_PRIMARY_BOUNDARY"
        ? "BOUNDARY_NOT_CONFIGURED"
        : "LOCATION_UNVERIFIED";
      break;
    case "LOCATION_UNAVAILABLE":
    case "GEOMETRY_INVALID":
    case "OUTSIDE_EXCEPTION_ZONE":
    default:
      // Red evidence is never framed as an accusation to an Owner. When
      // enforcement is enabled its activity is quarantined outside the
      // ordinary Owner queue; while disabled, its context remains neutral.
      presentationState = "LOCATION_UNVERIFIED";
      break;
  }

  const yellow = presentationState === "JUST_OUTSIDE_DELIVERY_BOUNDARY";
  return {
    presentationState,
    evaluatedAt: evaluation.evaluatedAt instanceof Date
      ? evaluation.evaluatedAt.toISOString()
      : new Date(evaluation.evaluatedAt).toISOString(),
    boundaryVersion: evaluation.boundaryVersion ?? null,
    acknowledgementCode: yellow ? evaluation.exceptionAcknowledgementCode ?? null : null,
    driverNote: yellow ? evaluation.driverNote?.trim() || null : null,
    evidenceComplete: Boolean(evaluation.evidenceComplete),
  };
}

export function stripPrivateOwnerActivityEvidence<T extends Record<string, unknown>>(activity: T): Omit<T, "latitude" | "longitude" | "photoUrls"> {
  const safeActivity = { ...activity };
  delete safeActivity.latitude;
  delete safeActivity.longitude;
  delete safeActivity.photoUrls;
  return safeActivity;
}
