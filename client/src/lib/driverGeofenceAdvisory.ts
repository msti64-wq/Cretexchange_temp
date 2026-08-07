export type DriverGeofenceState =
  | "INSIDE_APPROVED_BOUNDARY"
  | "OUTSIDE_BOUNDARY_WITHIN_EXCEPTION_ZONE"
  | "OUTSIDE_EXCEPTION_ZONE"
  | "LOCATION_UNAVAILABLE"
  | "LOCATION_ACCURACY_INSUFFICIENT"
  | "GEOMETRY_UNAVAILABLE"
  | "GEOMETRY_INVALID";

export type DriverGeofenceDisplayState =
  | DriverGeofenceState
  | "ADVISORY_REQUEST_FAILED"
  | "ADVISORY_RESULT_MISSING";

export interface DriverGeofenceResult {
  locationId: string;
  state: DriverGeofenceState;
  reasonCode: string;
  boundaryVersionId?: string | null;
  evaluatedAt?: string;
  observationTimestamp?: string | null;
  advisory?: boolean;
  canSubmitException?: boolean;
}

export type DriverGeofenceTone = "green" | "yellow" | "red" | "neutral";

export interface DriverGeofencePresentation {
  tone: DriverGeofenceTone;
  labelKey: string;
  guidanceKey: string;
  retry: "gps" | "status" | "none";
}

export function getDriverGeofencePresentation(
  state: DriverGeofenceDisplayState,
  reasonCode?: string | null,
): DriverGeofencePresentation {
  if (state === "INSIDE_APPROVED_BOUNDARY") {
    return { tone: "green", labelKey: "geofence.driver.inside", guidanceKey: "geofence.driver.insideGuidance", retry: "none" };
  }
  if (state === "OUTSIDE_BOUNDARY_WITHIN_EXCEPTION_ZONE") {
    return { tone: "yellow", labelKey: "geofence.driver.confirm", guidanceKey: "geofence.driver.confirmGuidance", retry: "none" };
  }
  if (state === "OUTSIDE_EXCEPTION_ZONE") {
    return { tone: "red", labelKey: "geofence.driver.tooFar", guidanceKey: "geofence.driver.tooFarGuidance", retry: "none" };
  }
  if (state === "LOCATION_UNAVAILABLE") {
    return { tone: "neutral", labelKey: "geofence.driver.deviceUnavailable", guidanceKey: "geofence.driver.deviceUnavailableGuidance", retry: "gps" };
  }
  if (state === "LOCATION_ACCURACY_INSUFFICIENT" && reasonCode === "LOCATION_ACCURACY_EXCEEDS_LIMIT") {
    return { tone: "neutral", labelKey: "geofence.driver.gpsPrecisionLow", guidanceKey: "geofence.driver.gpsPrecisionLowGuidance", retry: "gps" };
  }
  if (state === "LOCATION_ACCURACY_INSUFFICIENT" && reasonCode === "LOCATION_TIMESTAMP_OUTSIDE_WINDOW") {
    return { tone: "neutral", labelKey: "geofence.driver.locationOutOfDate", guidanceKey: "geofence.driver.locationOutOfDateGuidance", retry: "gps" };
  }
  if (state === "LOCATION_ACCURACY_INSUFFICIENT" && reasonCode === "LOCATION_UNCERTAINTY_OVERLAPS_BOUNDARY") {
    return { tone: "neutral", labelKey: "geofence.driver.boundaryOverlap", guidanceKey: "geofence.driver.boundaryOverlapGuidance", retry: "gps" };
  }
  if (state === "LOCATION_ACCURACY_INSUFFICIENT" && reasonCode === "LOCATION_UNCERTAINTY_OVERLAPS_EXCEPTION_THRESHOLD") {
    return { tone: "neutral", labelKey: "geofence.driver.advisoryLimitOverlap", guidanceKey: "geofence.driver.advisoryLimitOverlapGuidance", retry: "gps" };
  }
  if (state === "LOCATION_ACCURACY_INSUFFICIENT") {
    return { tone: "neutral", labelKey: "geofence.driver.accuracyInsufficient", guidanceKey: "geofence.driver.accuracyInsufficientGuidance", retry: "gps" };
  }
  if (state === "GEOMETRY_UNAVAILABLE" && reasonCode === "NO_ACTIVE_PRIMARY_BOUNDARY") {
    return { tone: "neutral", labelKey: "geofence.driver.boundaryNotConfigured", guidanceKey: "geofence.driver.boundaryNotConfiguredGuidance", retry: "none" };
  }
  if (state === "GEOMETRY_UNAVAILABLE" || state === "GEOMETRY_INVALID") {
    return { tone: "neutral", labelKey: "geofence.driver.boundaryTemporarilyUnavailable", guidanceKey: "geofence.driver.boundaryTemporarilyUnavailableGuidance", retry: "none" };
  }
  return { tone: "neutral", labelKey: "geofence.driver.statusTemporarilyUnavailable", guidanceKey: "geofence.driver.statusTemporarilyUnavailableGuidance", retry: "status" };
}

export function indexDriverGeofenceResults(
  requestedLocationIds: string[],
  results: DriverGeofenceResult[] | undefined,
): { byLocation: Map<string, DriverGeofenceResult>; missingLocationIds: string[] } {
  const requested = new Set(requestedLocationIds);
  const byLocation = new Map<string, DriverGeofenceResult>();
  for (const result of results || []) {
    if (requested.has(result.locationId) && !byLocation.has(result.locationId)) {
      byLocation.set(result.locationId, result);
    }
  }
  return {
    byLocation,
    missingLocationIds: requestedLocationIds.filter((locationId) => !byLocation.has(locationId)),
  };
}
