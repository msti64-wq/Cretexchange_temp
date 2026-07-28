import { ApiRequestError } from "@/lib/queryClient";

export type DriverOperationalRecoveryAction =
  | "reauthenticate"
  | "none"
  | "profile"
  | "terms"
  | "material"
  | "locations"
  | "retry";

export interface DriverOperationalErrorPresentation {
  kind: "reauthenticate" | "access_denied" | "readiness" | "location" | "material" | "unavailable";
  titleKey: string;
  descriptionKey: string;
  action: DriverOperationalRecoveryAction;
}

const PROFILE_REASONS = new Set([
  "driver_profile_required",
  "driver_profile_not_owned",
  "driver_profile_incomplete",
]);

const MATERIAL_REASONS = new Set([
  "active_material_required",
  "active_material_invalid",
  "active_material_retired",
]);

/**
 * Presentation-only mapping over the stable server response contract. This
 * never decides authorization or operational eligibility; the server remains
 * authoritative for both.
 */
export function resolveDriverOperationalErrorPresentation(error: unknown): DriverOperationalErrorPresentation {
  if (!(error instanceof ApiRequestError)) {
    return { kind: "unavailable", titleKey: "driver.error.unavailableTitle", descriptionKey: "driver.error.unavailableDescription", action: "retry" };
  }

  const { code, readinessReasonCodes = [] } = error.details;
  if (code === "UNAUTHENTICATED" || error.details.status === 401) {
    return { kind: "reauthenticate", titleKey: "driver.error.sessionTitle", descriptionKey: "driver.error.sessionDescription", action: "reauthenticate" };
  }
  if (code === "DRIVER_ROLE_REQUIRED") {
    return { kind: "access_denied", titleKey: "driver.error.accessTitle", descriptionKey: "driver.error.accessDescription", action: "none" };
  }
  if (code === "DRIVER_OPERATIONAL_READINESS_REQUIRED") {
    if (readinessReasonCodes.some((reason) => PROFILE_REASONS.has(reason))) {
      return { kind: "readiness", titleKey: "driver.error.profileTitle", descriptionKey: "driver.error.profileDescription", action: "profile" };
    }
    if (readinessReasonCodes.includes("current_terms_required")) {
      return { kind: "readiness", titleKey: "driver.error.termsTitle", descriptionKey: "driver.error.termsDescription", action: "terms" };
    }
    if (readinessReasonCodes.some((reason) => MATERIAL_REASONS.has(reason))) {
      return { kind: "material", titleKey: "driver.error.materialTitle", descriptionKey: "driver.error.materialDescription", action: "material" };
    }
  }
  if (code === "DRIVER_LOCATION_NOT_ELIGIBLE") {
    return { kind: "location", titleKey: "driver.error.locationTitle", descriptionKey: "driver.error.locationDescription", action: "locations" };
  }
  if (code === "DRIVER_MATERIAL_MISMATCH") {
    return { kind: "material", titleKey: "driver.error.materialMismatchTitle", descriptionKey: "driver.error.materialMismatchDescription", action: "material" };
  }
  return { kind: "unavailable", titleKey: "driver.error.unavailableTitle", descriptionKey: "driver.error.unavailableDescription", action: "retry" };
}

/**
 * Keeps the presentation mapping pure while allowing the caller to hand an
 * expired session back to the application's established authentication flow.
 */
export function presentDriverOperationalError(
  error: unknown,
  onReauthenticate: () => void,
): DriverOperationalErrorPresentation {
  const presentation = resolveDriverOperationalErrorPresentation(error);
  if (presentation.action === "reauthenticate") onReauthenticate();
  return presentation;
}
