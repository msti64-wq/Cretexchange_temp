export type DriverGeofenceState =
  | "INSIDE_APPROVED_BOUNDARY"
  | "OUTSIDE_BOUNDARY_WITHIN_EXCEPTION_ZONE"
  | "OUTSIDE_EXCEPTION_ZONE"
  | "LOCATION_UNAVAILABLE"
  | "LOCATION_ACCURACY_INSUFFICIENT"
  | "GEOMETRY_UNAVAILABLE"
  | "GEOMETRY_INVALID";

export type DriverGeofenceTone = "green" | "yellow" | "red" | "neutral";

export interface DriverGeofencePresentation {
  tone: DriverGeofenceTone;
  labelKey: string;
  guidanceKey: string;
}

export function getDriverGeofencePresentation(state: DriverGeofenceState): DriverGeofencePresentation {
  if (state === "INSIDE_APPROVED_BOUNDARY") {
    return { tone: "green", labelKey: "geofence.driver.inside", guidanceKey: "geofence.driver.insideGuidance" };
  }
  if (state === "OUTSIDE_BOUNDARY_WITHIN_EXCEPTION_ZONE") {
    return { tone: "yellow", labelKey: "geofence.driver.confirm", guidanceKey: "geofence.driver.confirmGuidance" };
  }
  if (state === "OUTSIDE_EXCEPTION_ZONE") {
    return { tone: "red", labelKey: "geofence.driver.tooFar", guidanceKey: "geofence.driver.tooFarGuidance" };
  }
  return { tone: "neutral", labelKey: "geofence.driver.unavailable", guidanceKey: "geofence.driver.unavailableGuidance" };
}
