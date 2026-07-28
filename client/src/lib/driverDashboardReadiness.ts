import type { resolveDriverOperationalReadiness } from "@shared/driverOperationalReadiness";

type DriverOperationalReadiness = ReturnType<typeof resolveDriverOperationalReadiness>;

export type DriverDashboardGpsState = "checking" | "available" | "permission_needed" | "unavailable";
export type DriverDashboardReadinessAction = "complete_profile" | "accept_terms" | "select_material" | "find_locations" | "retry_readiness";
export type DriverDashboardUnavailableSource = "authentication" | "terms" | "material";

export interface DriverDashboardReadinessSources {
  authenticationLoading?: boolean;
  termsLoading?: boolean;
  materialLoading?: boolean;
  authenticationUnavailable?: boolean;
  termsUnavailable?: boolean;
  materialUnavailable?: boolean;
}

export interface DriverDashboardReadinessPresentation {
  state: "loading" | "unavailable" | "action_required" | "ready";
  action: DriverDashboardReadinessAction | null;
  route: "/profile" | "/locations" | null;
  unavailableSource?: DriverDashboardUnavailableSource;
}

/**
 * Presentation-only prioritization over the shared readiness contract. This
 * intentionally never decides whether a Driver may perform an operation; the
 * server remains authoritative for that decision.
 */
export function resolveDriverDashboardReadinessPresentation(
  readiness: DriverOperationalReadiness,
  sources: DriverDashboardReadinessSources = {},
): DriverDashboardReadinessPresentation {
  if (sources.authenticationLoading || sources.termsLoading || sources.materialLoading) {
    return { state: "loading", action: null, route: null };
  }
  if (sources.authenticationUnavailable) {
    return { state: "unavailable", action: "retry_readiness", route: null, unavailableSource: "authentication" };
  }
  if (sources.termsUnavailable) {
    return { state: "unavailable", action: "retry_readiness", route: null, unavailableSource: "terms" };
  }
  if (sources.materialUnavailable) {
    return { state: "unavailable", action: "retry_readiness", route: null, unavailableSource: "material" };
  }

  if (!readiness.profileComplete) {
    return { state: "action_required", action: "complete_profile", route: "/profile" };
  }
  if (!readiness.termsAccepted) {
    return { state: "action_required", action: "accept_terms", route: "/profile" };
  }
  if (readiness.activeMaterialState !== "valid") {
    return { state: "action_required", action: "select_material", route: null };
  }

  return { state: "ready", action: "find_locations", route: "/locations" };
}

export function resolveDriverDashboardGpsState({
  checking,
  hasCurrentLocation,
  error,
}: {
  checking: boolean;
  hasCurrentLocation: boolean;
  error?: unknown;
}): DriverDashboardGpsState {
  if (checking) return "checking";
  if (hasCurrentLocation) return "available";
  const message = error instanceof Error ? error.message : String(error || "");
  return /denied/i.test(message) ? "permission_needed" : "unavailable";
}
