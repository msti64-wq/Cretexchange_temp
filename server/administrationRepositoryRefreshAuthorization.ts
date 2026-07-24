import { resolveImmutableSourceCommit, type SourceCommitResolution } from "./administrationRepositorySourceCommit";

export const ADMIN_REPOSITORY_SYNCHRONIZATION_TARGET_ENV = "SYNCHRONIZATION_TARGET";
export const RAILWAY_ENVIRONMENT_NAME_ENV = "RAILWAY_ENVIRONMENT_NAME";
export const ADMIN_REPOSITORY_PRODUCTION_SYNC_AUTHORIZATION_ENV = "ADMIN_REPOSITORY_PRODUCTION_SYNC_AUTHORIZATION";

export type AdministrationRepositoryRefreshAuthorizationCode =
  | "administration_repository_environment_identity_invalid"
  | "administration_repository_source_commit_invalid"
  | "administration_repository_production_authorization_missing"
  | "administration_repository_production_authorization_mismatch";

export type AdministrationRepositoryRefreshAuthorization =
  | { allowed: true; environment: "production" | "staging" | "development" | "test" | "local"; sourceCommit: SourceCommitResolution }
  | { allowed: false; environment: "unknown" | "production"; code: AdministrationRepositoryRefreshAuthorizationCode };

type Environment = Record<string, string | undefined>;
type NonProductionEnvironment = "staging" | "development" | "test" | "local";
export type AdministrationRepositoryRefreshAuthorizationOptions = { allowedNonProductionEnvironments?: readonly NonProductionEnvironment[] };

/**
 * Classifies a synchronization request solely from the explicit target and Railway
 * environment identity. NODE_ENV intentionally is not used: Railway services may
 * run production Node builds in a staging environment. Any absent, conflicting, or
 * unsupported pair is ambiguous and therefore denied.
 */
function classifyEnvironment(environment: Environment): "production" | "staging" | "development" | "test" | "local" | "unknown" {
  const target = environment[ADMIN_REPOSITORY_SYNCHRONIZATION_TARGET_ENV]?.trim().toLowerCase();
  const railwayEnvironment = environment[RAILWAY_ENVIRONMENT_NAME_ENV]?.trim().toLowerCase();
  if (!target || !railwayEnvironment || target !== railwayEnvironment) return "unknown";
  return target === "production" || target === "staging" || target === "development" || target === "test" || target === "local"
    ? target
    : "unknown";
}

/**
 * Single fail-closed control shared by the CLI and the HTTP refresh path. It never
 * returns environment values or authorization material, only stable reason codes.
 */
export function authorizeAdministrationRepositoryRefresh(environment: Environment = process.env, options: AdministrationRepositoryRefreshAuthorizationOptions = {}): AdministrationRepositoryRefreshAuthorization {
  const classified = classifyEnvironment(environment);
  if (classified === "unknown") return { allowed: false, environment: "unknown", code: "administration_repository_environment_identity_invalid" };

  let sourceCommit: SourceCommitResolution;
  try {
    sourceCommit = resolveImmutableSourceCommit(environment);
  } catch {
    return { allowed: false, environment: classified === "production" ? "production" : "unknown", code: "administration_repository_source_commit_invalid" };
  }

  if (classified !== "production") {
    // CLI synchronization historically allows staging only. HTTP may additionally
    // opt into explicitly named local development/test environments without ever
    // relaxing production controls.
    const allowed = options.allowedNonProductionEnvironments || ["staging"];
    if (!allowed.includes(classified)) return { allowed: false, environment: "unknown", code: "administration_repository_environment_identity_invalid" };
    return { allowed: true, environment: classified, sourceCommit };
  }
  const authorization = environment[ADMIN_REPOSITORY_PRODUCTION_SYNC_AUTHORIZATION_ENV];
  if (!authorization?.trim()) return { allowed: false, environment: "production", code: "administration_repository_production_authorization_missing" };
  if (authorization.trim().toLowerCase() !== sourceCommit.commitSha) return { allowed: false, environment: "production", code: "administration_repository_production_authorization_mismatch" };
  return { allowed: true, environment: "production", sourceCommit };
}
