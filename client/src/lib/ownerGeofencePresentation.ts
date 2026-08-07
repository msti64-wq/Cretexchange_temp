export type OwnerGeofencePresentationState =
  | "INSIDE_DELIVERY_BOUNDARY"
  | "JUST_OUTSIDE_DELIVERY_BOUNDARY"
  | "LOCATION_UNCERTAIN"
  | "LOCATION_UNVERIFIED"
  | "BOUNDARY_NOT_CONFIGURED"
  | "NOT_RECORDED";

export type OwnerGeofencePresentation = {
  tone: "green" | "yellow" | "neutral";
  labelKey: string;
  guidanceKey: string;
};

const PRESENTATIONS: Record<OwnerGeofencePresentationState, OwnerGeofencePresentation> = {
  INSIDE_DELIVERY_BOUNDARY: {
    tone: "green",
    labelKey: "geofence.owner.submission.inside",
    guidanceKey: "geofence.owner.submission.insideGuidance",
  },
  JUST_OUTSIDE_DELIVERY_BOUNDARY: {
    tone: "yellow",
    labelKey: "geofence.owner.submission.justOutside",
    guidanceKey: "geofence.owner.submission.justOutsideGuidance",
  },
  LOCATION_UNCERTAIN: {
    tone: "neutral",
    labelKey: "geofence.owner.submission.uncertain",
    guidanceKey: "geofence.owner.submission.uncertainGuidance",
  },
  LOCATION_UNVERIFIED: {
    tone: "neutral",
    labelKey: "geofence.owner.submission.unverified",
    guidanceKey: "geofence.owner.submission.unverifiedGuidance",
  },
  BOUNDARY_NOT_CONFIGURED: {
    tone: "neutral",
    labelKey: "geofence.owner.submission.notConfigured",
    guidanceKey: "geofence.owner.submission.notConfiguredGuidance",
  },
  NOT_RECORDED: {
    tone: "neutral",
    labelKey: "geofence.owner.submission.notRecorded",
    guidanceKey: "geofence.owner.submission.notRecordedGuidance",
  },
};

export function getOwnerGeofencePresentation(
  state: OwnerGeofencePresentationState,
): OwnerGeofencePresentation {
  return PRESENTATIONS[state] ?? PRESENTATIONS.NOT_RECORDED;
}
