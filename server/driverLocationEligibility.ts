import { storage } from "./storage";

export const DRIVER_LOCATION_NOT_ELIGIBLE = "DRIVER_LOCATION_NOT_ELIGIBLE" as const;
export const DRIVER_MATERIAL_MISMATCH = "DRIVER_MATERIAL_MISMATCH" as const;

export interface DriverLocationEligibilityDenial {
  message: string;
  code: typeof DRIVER_LOCATION_NOT_ELIGIBLE;
}

export interface DriverMaterialMismatchDenial {
  message: string;
  code: typeof DRIVER_MATERIAL_MISMATCH;
}

interface DriverLocationEligibilityContext {
  location: { id: string };
  materialSlug: string;
}

/**
 * Resolves a submission location from the same material-aware server query used
 * by Driver discovery. This intentionally returns only whether the requested
 * identifier is currently in that eligible result; it never reveals why an
 * unavailable location was excluded.
 */
async function resolveDriverLocationEligibilityContext(userId: string, locationId: unknown): Promise<DriverLocationEligibilityContext | null> {
  const normalizedLocationId = typeof locationId === "string" ? locationId.trim() : "";
  const driver = await storage.getDriver(userId);
  const materialSlug = driver?.activeMaterialSlug?.trim() || "";
  if (!normalizedLocationId || !materialSlug) return null;

  const material = await storage.getMaterialBySlug(materialSlug);
  if (!material || material.isActive === false || material.retiredAt) return null;

  const eligibleLocations = await storage.getActiveLocationsAcceptingMaterial(materialSlug);
  const location = eligibleLocations.find((candidate: { id: string }) => candidate.id === normalizedLocationId);
  return location ? { location, materialSlug } : null;
}

export async function resolveDriverLocationEligibility(userId: string, locationId: unknown) {
  return (await resolveDriverLocationEligibilityContext(userId, locationId))?.location || null;
}

export function buildDriverLocationEligibilityDenial(): DriverLocationEligibilityDenial {
  return {
    message: "This facility is no longer available for your selected material. Refresh available locations and select an eligible facility.",
    code: DRIVER_LOCATION_NOT_ELIGIBLE,
  };
}

export async function requireDriverLocationEligibility(req: any, res: any, locationId: unknown) {
  const eligibility = await resolveDriverLocationEligibilityContext(req.user?.id || "", locationId);
  if (!eligibility) {
    res.status(409).json(buildDriverLocationEligibilityDenial());
    return null;
  }
  return eligibility.location;
}

export function buildDriverMaterialMismatchDenial(): DriverMaterialMismatchDenial {
  return {
    message: "The submitted material does not match your selected active material. Refresh your material selection and try again.",
    code: DRIVER_MATERIAL_MISMATCH,
  };
}

export async function requireDriverLocationEligibilityWithMaterial(req: any, res: any, locationId: unknown, suppliedMaterialSlug: unknown) {
  const eligibility = await resolveDriverLocationEligibilityContext(req.user?.id || "", locationId);
  if (!eligibility || (typeof suppliedMaterialSlug === "string" && suppliedMaterialSlug.trim() && suppliedMaterialSlug.trim() !== eligibility.materialSlug)) {
    if (!eligibility) {
      res.status(409).json(buildDriverLocationEligibilityDenial());
      return null;
    }
    res.status(409).json(buildDriverMaterialMismatchDenial());
    return null;
  }
  return eligibility;
}
