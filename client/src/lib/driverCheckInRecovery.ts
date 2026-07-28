export type DriverCheckInRecoveryState =
  | "loading"
  | "missing_material"
  | "location_unavailable"
  | "location_missing_or_ineligible"
  | "ready";

export function resolveDriverCheckInRecoveryState(input: {
  materialIntentLoading: boolean;
  activeMaterialSlug: string | null;
  locationLoading: boolean;
  locationError: boolean;
  hasLocation: boolean;
}): DriverCheckInRecoveryState {
  if (input.materialIntentLoading || input.locationLoading) return "loading";
  if (!input.activeMaterialSlug) return "missing_material";
  if (input.locationError) return "location_unavailable";
  return input.hasLocation ? "ready" : "location_missing_or_ineligible";
}
