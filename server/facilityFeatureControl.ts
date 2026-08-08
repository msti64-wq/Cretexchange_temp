import {
  isFacilityScopedGeofenceFeatureFlag,
  type FacilityScopedGeofenceFeatureFlag,
} from "@shared/featureFlags";

type FeatureState = {
  enabled: boolean;
  allowedRoles?: string[] | null;
};

type OverrideState = { enabled: boolean };

export type FacilityFeatureControlResolution = {
  enabled: boolean;
  source: "facility" | "user" | "global" | "denied";
  facilityContextVerified: boolean;
};

export type FacilityFeatureControlLookup = {
  getWashoutLocation(locationId: string): Promise<unknown | undefined>;
  getFeatureFlag(flagKey: string): Promise<FeatureState | undefined>;
  getFeatureFlagOverride(flagKey: string, userId: string): Promise<OverrideState | undefined>;
  getFacilityFeatureFlagOverride(
    flagKey: FacilityScopedGeofenceFeatureFlag,
    locationId: string,
  ): Promise<OverrideState | undefined>;
};

/**
 * Deterministic precedence for the three Facility-pilot controls:
 * 1. Missing/invalid Facility context or a denied role fails closed.
 * 2. An explicit Facility override is authoritative for that Facility.
 * 3. Otherwise an existing user override applies.
 * 4. Otherwise the global state applies.
 *
 * This order permits one explicitly governed Facility pilot while the global
 * default remains off. The resolver cannot be used for financial controls.
 */
export async function resolveFacilityFeatureControl(
  lookup: FacilityFeatureControlLookup,
  input: {
    flagKey: string;
    userId: string;
    userRole: string;
    verifiedFacilityId?: string | null;
  },
): Promise<FacilityFeatureControlResolution> {
  if (!isFacilityScopedGeofenceFeatureFlag(input.flagKey) || !input.verifiedFacilityId) {
    return { enabled: false, source: "denied", facilityContextVerified: false };
  }

  const [facility, globalFlag] = await Promise.all([
    lookup.getWashoutLocation(input.verifiedFacilityId),
    lookup.getFeatureFlag(input.flagKey),
  ]);
  if (!facility || !globalFlag) {
    return { enabled: false, source: "denied", facilityContextVerified: false };
  }
  if (globalFlag.allowedRoles?.length && !globalFlag.allowedRoles.includes(input.userRole)) {
    return { enabled: false, source: "denied", facilityContextVerified: true };
  }

  const facilityOverride = await lookup.getFacilityFeatureFlagOverride(
    input.flagKey,
    input.verifiedFacilityId,
  );
  if (facilityOverride) {
    return {
      enabled: facilityOverride.enabled,
      source: "facility",
      facilityContextVerified: true,
    };
  }

  const userOverride = await lookup.getFeatureFlagOverride(input.flagKey, input.userId);
  if (userOverride) {
    return {
      enabled: userOverride.enabled,
      source: "user",
      facilityContextVerified: true,
    };
  }

  return {
    enabled: globalFlag.enabled,
    source: "global",
    facilityContextVerified: true,
  };
}
