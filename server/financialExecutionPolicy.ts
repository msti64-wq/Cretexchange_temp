/**
 * Phase 3A financial execution safety boundary.
 *
 * These deployment-managed settings are intentionally separate from product
 * feature flags. Missing, malformed, or unavailable configuration always
 * disables money movement and execution-related ledger writes.
 */
export type FinancialExecutionCategory = "facility_collection" | "driver_settlement";
export type FinancialExecutionLogCategory = FinancialExecutionCategory | "legacy_execution" | "scheduler" | "reconciliation";

export type FinancialExecutionAccess = {
  allowed: boolean;
  category: FinancialExecutionCategory;
  reason: "global_disabled" | "facility_collection_disabled" | "driver_settlement_disabled" | "legacy_execution_retired" | null;
};

export type FinancialExecutionEnvironment = Partial<Record<
  "FINANCIAL_EXECUTION_ENABLED" | "FACILITY_COLLECTION_EXECUTION_ENABLED" | "DRIVER_SETTLEMENT_EXECUTION_ENABLED",
  string | undefined
>>;

function isExplicitlyEnabled(value: unknown): boolean {
  return typeof value === "string" && value.trim().toLowerCase() === "true";
}

export function resolveFinancialExecutionAccess(
  category: FinancialExecutionCategory,
  environment: FinancialExecutionEnvironment = process.env as FinancialExecutionEnvironment,
): FinancialExecutionAccess {
  if (!isExplicitlyEnabled(environment.FINANCIAL_EXECUTION_ENABLED)) {
    return { allowed: false, category, reason: "global_disabled" };
  }

  const categoryEnabled = category === "facility_collection"
    ? isExplicitlyEnabled(environment.FACILITY_COLLECTION_EXECUTION_ENABLED)
    : isExplicitlyEnabled(environment.DRIVER_SETTLEMENT_EXECUTION_ENABLED);

  return categoryEnabled
    ? { allowed: true, category, reason: null }
    : {
        allowed: false,
        category,
        reason: category === "facility_collection" ? "facility_collection_disabled" : "driver_settlement_disabled",
      };
}

export class FinancialExecutionDisabledError extends Error {
  constructor(readonly access: FinancialExecutionAccess) {
    super("Financial execution is disabled");
  }
}

export function assertFinancialExecutionAccess(category: FinancialExecutionCategory): void {
  const access = resolveFinancialExecutionAccess(category);
  if (!access.allowed) throw new FinancialExecutionDisabledError(access);
}

/**
 * Phase 3A permanently fences pre-canonical execution adapters. This is
 * deliberately stricter than the deployment-managed policy above: enabling a
 * future canonical rail must never reactivate an unsafe legacy rail.
 */
export function assertLegacyFinancialExecutionRetired(
  category: FinancialExecutionCategory,
  operation: string,
): void {
  const access: FinancialExecutionAccess = { allowed: false, category, reason: "legacy_execution_retired" };
  logFinancialExecutionDenied({ operation, category, reason: access.reason });
  throw new FinancialExecutionDisabledError(access);
}

/**
 * The retained adapters are intentionally and permanently fenced in Phase 3A.
 * A boolean return keeps retained legacy code type-checkable without making the
 * runtime safety decision configurable.
 */
export function isLegacyFinancialExecutionFenced(): boolean {
  return true;
}

/** Logs resolved decisions only; it never logs environment values or secrets. */
export function logFinancialExecutionPolicyStartup(): void {
  for (const category of ["facility_collection", "driver_settlement"] as const) {
    const access = resolveFinancialExecutionAccess(category);
    console.info("[FINANCIAL_EXECUTION_POLICY]", {
      category,
      allowed: access.allowed,
      reason: access.reason,
    });
  }
}

export function logFinancialExecutionDenied(input: {
  operation: string;
  category: FinancialExecutionLogCategory;
  actorUserId?: string | null;
  role?: string | null;
  reference?: string | null;
  reason?: string | null;
}): void {
  console.warn("[FINANCIAL_EXECUTION_DENIED]", {
    operation: input.operation,
    category: input.category,
    actorUserId: input.actorUserId || null,
    role: input.role || null,
    reference: input.reference || null,
    reason: input.reason || "legacy_execution_fenced",
  });
}

export function sendFinancialExecutionDisabled(
  res: { status: (statusCode: number) => { json: (body: unknown) => unknown } },
  input: {
    operation: string;
    category: FinancialExecutionLogCategory;
    actorUserId?: string | null;
    role?: string | null;
    reference?: string | null;
    retired?: boolean;
  },
): unknown {
  logFinancialExecutionDenied({
    ...input,
    reason: input.retired ? "financial_route_retired" : "financial_execution_disabled",
  });
  return res.status(input.retired ? 410 : 503).json({
    message: input.retired
      ? "This financial execution route is retired."
      : "Financial execution is currently disabled.",
    code: input.retired ? "FINANCIAL_EXECUTION_ROUTE_RETIRED" : "FINANCIAL_EXECUTION_DISABLED",
  });
}

/**
 * Shared route guard for retired and temporarily disabled financial mutations.
 * It intentionally accepts only request metadata needed for safe audit logs.
 */
export function retireFinancialExecutionRequest(
  req: { user?: { id?: string | null; role?: string | null }; params?: Record<string, unknown>; body?: Record<string, unknown> },
  res: { status: (statusCode: number) => { json: (body: unknown) => unknown } },
  operation: string,
  category: FinancialExecutionLogCategory = "legacy_execution",
  retired = true,
): unknown {
  return sendFinancialExecutionDisabled(res, {
    operation,
    category,
    actorUserId: req.user?.id || null,
    role: req.user?.role || null,
    reference: typeof req.params?.id === "string"
      ? req.params.id
      : typeof req.body?.paymentId === "string"
        ? req.body.paymentId
        : typeof req.body?.batchId === "string"
          ? req.body.batchId
          : null,
    retired,
  });
}

/**
 * Route-boundary authorization for financial execution adapters. The identity
 * lookup is the only permitted lookup before a disabled or retired response.
 */
export async function authorizeAndFenceFinancialExecutionRequest(
  req: { user?: { id?: string | null; role?: string | null }; params?: Record<string, unknown>; body?: Record<string, unknown> },
  res: { status: (statusCode: number) => { json: (body: unknown) => unknown } },
  options: {
    loadUser: (userId: string) => Promise<{ id?: string | null; role?: string | null } | undefined | null>;
    allowedRoles: readonly string[];
    deniedMessage: string;
    operation: string;
    category: FinancialExecutionLogCategory;
    retired?: boolean;
  },
): Promise<unknown> {
  const actorId = req.user?.id;
  if (!actorId) {
    return res.status(401).json({ message: "Authentication required" });
  }

  const actor = await options.loadUser(actorId);
  if (!actor || !actor.role || !options.allowedRoles.includes(actor.role)) {
    return res.status(403).json({ message: options.deniedMessage });
  }

  return retireFinancialExecutionRequest(
    { ...req, user: { id: actorId, role: actor.role } },
    res,
    options.operation,
    options.category,
    options.retired,
  );
}

/** A wallet read must not bootstrap a financial record or imply entitlement. */
export function buildNoDriverWalletBalanceResponse() {
  return buildReadOnlyDriverWalletBalanceResponse({
    availableBalance: 0,
    pendingBalance: 0,
    balanceSource: "unavailable",
    walletState: "not_created",
  });
}

export function buildReadOnlyDriverWalletBalanceResponse(input: {
  availableBalance: number;
  pendingBalance: number;
  balanceSource: string;
  walletState?: "not_created";
}) {
  return {
    availableBalance: input.availableBalance,
    pendingBalance: input.pendingBalance,
    totalBalance: input.availableBalance + input.pendingBalance,
    balanceSource: input.balanceSource,
    ...(input.walletState ? { walletState: input.walletState } : {}),
  };
}
