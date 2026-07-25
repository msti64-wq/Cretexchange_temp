/**
 * Runtime deployment identity is distinct from NODE_ENV. Railway starts the
 * application with NODE_ENV=production in every deployed environment, so it
 * cannot identify whether a release is staging or production.
 */
export type RuntimeEnvironment = "production" | "staging" | "development" | "unknown";

function normalized(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const result = value.trim().toLowerCase();
  return result || null;
}

export function resolveRuntimeEnvironment(environment: NodeJS.ProcessEnv = process.env): RuntimeEnvironment {
  const railway = normalized(environment.RAILWAY_ENVIRONMENT_NAME);
  if (railway === "production" || railway === "staging") return railway;

  const application = normalized(environment.APP_ENV);
  if (application === "production" || application === "staging" || application === "development") return application;

  const synchronization = normalized(environment.SYNCHRONIZATION_TARGET);
  if (synchronization === "production" || synchronization === "staging") return synchronization;

  const node = normalized(environment.NODE_ENV);
  if (node === "development" || node === "test") return "development";
  return "unknown";
}

export function isFinancialExecutionEnabled(environment: NodeJS.ProcessEnv = process.env): boolean {
  const enabled = (name: "FINANCIAL_EXECUTION_ENABLED" | "FACILITY_COLLECTION_EXECUTION_ENABLED" | "DRIVER_SETTLEMENT_EXECUTION_ENABLED") =>
    environment[name]?.trim().toLowerCase() === "true";
  return enabled("FINANCIAL_EXECUTION_ENABLED")
    && (enabled("FACILITY_COLLECTION_EXECUTION_ENABLED") || enabled("DRIVER_SETTLEMENT_EXECUTION_ENABLED"));
}
