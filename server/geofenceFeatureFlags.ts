import {
  FEATURE_FLAG_DEFINITIONS,
  isFacilityScopedGeofenceFeatureFlag,
  type FeatureFlagKey,
} from "@shared/featureFlags";
import type { IStorage } from "./storage";

export async function isGeofenceFeatureEnabled(
  storage: Pick<IStorage, "checkFeatureFlag" | "checkFacilityFeatureFlag">,
  flagKey: FeatureFlagKey,
  userId: string,
  userRole: string,
  verifiedFacilityId?: string | null,
): Promise<boolean> {
  try {
    if (isFacilityScopedGeofenceFeatureFlag(flagKey)) {
      if (!verifiedFacilityId) return false;
      return await storage.checkFacilityFeatureFlag(
        flagKey,
        userId,
        userRole,
        verifiedFacilityId,
      );
    }
    return await storage.checkFeatureFlag(flagKey, userId, userRole);
  } catch (error) {
    console.error("Geofence feature flag lookup failed", {
      flagKey,
      userId,
      message: error instanceof Error ? error.message : "unknown error",
    });
    return false;
  }
}

export function geofenceFeatureDefault(flagKey: FeatureFlagKey): boolean {
  return FEATURE_FLAG_DEFINITIONS.find((definition) => definition.key === flagKey)?.enabled ?? false;
}
