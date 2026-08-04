import { FEATURE_FLAG_DEFINITIONS, type FeatureFlagKey } from "@shared/featureFlags";
import type { IStorage } from "./storage";

export async function isGeofenceFeatureEnabled(
  storage: Pick<IStorage, "checkFeatureFlag">,
  flagKey: FeatureFlagKey,
  userId: string,
  userRole: string,
): Promise<boolean> {
  try {
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
