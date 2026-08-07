import type { GeofenceSubmissionDecision } from "./geofenceSubmissionPolicy";

export function shouldCaptureSubmissionGeofenceEvidence(input: {
  advisoryEnabled: boolean;
  enforcementEnabled: boolean;
}): boolean {
  return input.advisoryEnabled || input.enforcementEnabled;
}

export function resolveSubmissionGeofenceRouting(
  decision: GeofenceSubmissionDecision,
  enforcementEnabled: boolean,
): {
  recover: boolean;
  yellowOwnerReview: boolean;
  redPlatformQuarantine: boolean;
} {
  if (!enforcementEnabled || decision.action === "legacy") {
    return { recover: false, yellowOwnerReview: false, redPlatformQuarantine: false };
  }
  return {
    recover: decision.action === "recover",
    yellowOwnerReview: decision.action === "exception_review",
    redPlatformQuarantine: decision.action === "quarantine",
  };
}
