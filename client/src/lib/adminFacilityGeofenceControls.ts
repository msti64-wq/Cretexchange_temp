import {
  FACILITY_SCOPED_GEOFENCE_FEATURE_FLAGS,
  type FacilityScopedGeofenceFeatureFlag,
} from "@shared/featureFlags";

export const FACILITY_CONTROL_REASON_MIN = 3;
export const FACILITY_CONTROL_REASON_MAX = 500;
export const FACILITY_CONTROL_REQUEST_MAX = 160;

export type FacilityControlSource = "facility" | "global" | "denied";

export type FacilityControlState = {
  flagKey: FacilityScopedGeofenceFeatureFlag;
  globalEnabled: boolean;
  overrideEnabled: boolean | null;
  effectiveEnabled: boolean;
  source: FacilityControlSource;
  overrideReason: string | null;
  overrideUpdatedAt: string | null;
};

export type FacilityControlHistoryEvent = {
  id: string;
  flagKey: FacilityScopedGeofenceFeatureFlag;
  actorRole: "admin" | "super_admin";
  reason: string;
  priorEnabled: boolean;
  newEnabled: boolean;
  requestId: string;
  createdAt: string;
};

export type FacilityControlResponse = {
  facility: { id: string; name: string };
  controls: FacilityControlState[];
  history: FacilityControlHistoryEvent[];
};

export type FacilityControlDraftError =
  | "facility"
  | "flag"
  | "reason"
  | "requestReference"
  | "confirmation";

export function isGovernedFacilityControl(
  value: string,
): value is FacilityScopedGeofenceFeatureFlag {
  return (FACILITY_SCOPED_GEOFENCE_FEATURE_FLAGS as readonly string[]).includes(value);
}

export function createFacilityControlRequestReference(): string {
  const randomPart = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
  return `facility-geofence-${randomPart}`.slice(0, FACILITY_CONTROL_REQUEST_MAX);
}

export function validateFacilityControlDraft(input: {
  facilityId: string;
  flagKey: string;
  reason: string;
  requestReference: string;
  confirmed: boolean;
}): FacilityControlDraftError | null {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.facilityId)) {
    return "facility";
  }
  if (!isGovernedFacilityControl(input.flagKey)) return "flag";
  const reasonLength = input.reason.trim().length;
  if (reasonLength < FACILITY_CONTROL_REASON_MIN || reasonLength > FACILITY_CONTROL_REASON_MAX) {
    return "reason";
  }
  const requestLength = input.requestReference.trim().length;
  if (requestLength < 1 || requestLength > FACILITY_CONTROL_REQUEST_MAX) {
    return "requestReference";
  }
  if (!input.confirmed) return "confirmation";
  return null;
}

export function buildFacilityControlMutation(input: {
  facilityId: string;
  flagKey: string;
  enabled: boolean;
  reason: string;
  requestReference: string;
  confirmed: boolean;
}) {
  const error = validateFacilityControlDraft(input);
  if (error) throw new Error(`FACILITY_CONTROL_DRAFT_${error.toUpperCase()}`);
  return {
    facilityId: input.facilityId,
    flagKey: input.flagKey as FacilityScopedGeofenceFeatureFlag,
    requestReference: input.requestReference.trim(),
    body: { enabled: input.enabled, reason: input.reason.trim() },
  };
}
