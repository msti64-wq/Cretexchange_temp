import type { Driver, User } from "@shared/schema";

export type DriverStripeStatus =
  | "not_started"
  | "setup_started"
  | "action_required"
  | "payout_ready"
  | "status_unavailable"
  | "account_conflict";

export type DriverStripeCandidateSource =
  | "users.stripeConnectAccountId"
  | "drivers.stripeConnectAccountId"
  | "drivers.connectedAccountId";

export type DriverStripeErrorCode =
  | "STRIPE_ACCOUNT_CONFLICT"
  | "STRIPE_ACCOUNT_INVALID"
  | "STRIPE_ACCOUNT_NOT_FOUND"
  | "STRIPE_ACCOUNT_IDENTITY_MISMATCH"
  | "STRIPE_ACCOUNT_IDENTITY_UNVERIFIED"
  | "STRIPE_ACCOUNT_MATCH_AMBIGUOUS"
  | "STRIPE_DISCOVERY_UNAVAILABLE"
  | "STRIPE_STATUS_UNAVAILABLE";

export type DriverStripeValidationResult =
  | "not_applicable"
  | "valid"
  | "invalid"
  | "unavailable"
  | "identity_mismatch"
  | "identity_unverified";

export type DriverStripeDiscoveryOutcome =
  | "not_attempted"
  | "no_matches"
  | "one_verified_match"
  | "invalid_matches_found"
  | "identity_mismatch"
  | "identity_unverified"
  | "ambiguous_matches"
  | "discovery_unavailable";

export type DriverStripeAccountSnapshot = {
  id: string;
  deleted?: boolean;
  email?: string | null;
  metadata?: Record<string, string | undefined> | null;
  details_submitted?: boolean;
  payouts_enabled?: boolean;
  charges_enabled?: boolean;
  capabilities?: { transfers?: string | null } | null;
  requirements?: {
    currently_due?: string[] | null;
    past_due?: string[] | null;
  } | null;
  external_accounts?: {
    data?: Array<{ object?: string; type?: string }>;
    total_count?: number;
  } | null;
};

export type DriverStripeErrorState = {
  code: DriverStripeErrorCode;
  retryable: boolean;
  supportRequired: boolean;
};

export type DriverStripeReconciliationField =
  | "users.stripeConnectAccountId"
  | "drivers.stripeConnectAccountId"
  | "drivers.connectedAccountId";

export type DriverStripeReconciliationResult = {
  conflict: boolean;
  updatedFields: DriverStripeReconciliationField[];
  currentValues?: Partial<Record<DriverStripeReconciliationField, string | null>>;
};

export type DriverStripeAuditEvent =
  | "driver.stripe.resolution"
  | "driver.stripe.discovery_classified"
  | "driver.stripe.reconciliation_planned"
  | "driver.stripe.reconciled"
  | "driver.stripe.conflict"
  | "driver.stripe.identity_verification_failed"
  | "driver.stripe.status_unavailable";

export type DriverStripeServiceDependencies = {
  retrieveAccount: (accountId: string) => Promise<DriverStripeAccountSnapshot>;
  findAccountsByIdentity?: (params: {
    userId: string;
    driverId: string | null;
    email: string | null;
  }) => Promise<DriverStripeAccountSnapshot[]>;
  reconcileAccountIds?: (params: {
    userId: string;
    driverId: string;
    expectedAccountId: string;
  }) => Promise<DriverStripeReconciliationResult>;
  auditLogger?: (event: DriverStripeAuditEvent, details: Record<string, unknown>) => void;
  now?: () => Date;
};

type Candidate = {
  accountId: string;
  sources: DriverStripeCandidateSource[];
};

export type DriverStripeAccountResolution = {
  status: DriverStripeStatus;
  hasAccount: boolean;
  accountIdPresent: boolean;
  accountId: string | null;
  maskedAccountId: string | null;
  candidateSource: DriverStripeCandidateSource | null;
  candidateSources: DriverStripeCandidateSource[];
  conflicts: Array<{ maskedAccountId: string; sources: DriverStripeCandidateSource[] }>;
  validationResult: DriverStripeValidationResult;
  account: DriverStripeAccountSnapshot | null;
  errorState: DriverStripeErrorState | null;
};

export type CanonicalDriverStripeStatus = {
  status: DriverStripeStatus;
  hasAccount: boolean;
  accountIdPresent: boolean;
  onboardingComplete: boolean | null;
  payoutReady: boolean | null;
  actionRequired: boolean;
  requirementsDue: string[];
  requirementsPastDue: string[];
  bankAccountPresent: boolean | null;
  lastStatusCheck: string;
  errorState: DriverStripeErrorState | null;
  detailsSubmitted: boolean | null;
  payoutsEnabled: boolean | null;
  chargesEnabled: boolean | null;
  transfersActive: boolean | null;
};

export type DriverStripeReconciliationPlan = {
  safeToReconcile: boolean;
  maskedAccountId: string | null;
  candidateSource: DriverStripeCandidateSource | null;
  candidateSources: DriverStripeCandidateSource[];
  wouldUpdate: DriverStripeReconciliationField[];
  conflicts: DriverStripeAccountResolution["conflicts"];
  validationResult: DriverStripeAccountResolution["validationResult"];
  supportReviewRequired: boolean;
  errorState: DriverStripeErrorState | null;
};

export type DriverStripeOnboardingResolution = DriverStripeAccountResolution & {
  safeToCreateAccount: boolean;
  discoveredExistingAccount: boolean;
  discoveryOutcome: DriverStripeDiscoveryOutcome;
  matchesFound: number;
  validMatches: number;
  invalidMatches: number;
  identityMismatches: number;
  identityUnverified: number;
  supportRequired: boolean;
};

export type DriverStripeOnboardingDecision = {
  action: "reuse" | "create" | "blocked";
  user: User;
  driver: Driver;
  resolution: DriverStripeOnboardingResolution;
};

export function buildDriverStripeStatusApiResponse(status: CanonicalDriverStripeStatus) {
  const requirementsDue = [...status.requirementsDue];
  const requirementsPastDue = [...status.requirementsPastDue];
  const compatibilityStatus = status.status === "payout_ready" ? "payouts_ready" : status.status;

  return {
    // Canonical fields. New consumers should use these names and status values.
    ...status,
    canonicalStatus: status.status,

    // Compatibility-only aliases retained until the Phase 3 frontend migration.
    compatibilityStatus,
    connectedAccountIdExists: status.accountIdPresent,
    detailsSubmitted: status.detailsSubmitted,
    details_submitted: status.detailsSubmitted,
    payoutsEnabled: status.payoutsEnabled,
    payouts_enabled: status.payoutsEnabled,
    chargesEnabled: status.chargesEnabled,
    charges_enabled: status.chargesEnabled,
    transfersActive: status.transfersActive,
    requirementsCurrentlyDue: requirementsDue,
    requirementsPastDue,
    currentlyDue: requirementsDue,
    pastDue: requirementsPastDue,
    requirements: {
      currently_due: requirementsDue,
      past_due: requirementsPastDue,
    },
    isVerified: status.payoutReady === true,
    hasBlockingRequirements: requirementsDue.length > 0 || requirementsPastDue.length > 0,
    stripeStatusUnavailable: status.status === "status_unavailable",
  };
}

export function buildLegacyDriverStripeAccountStatusResponse(status: CanonicalDriverStripeStatus) {
  const legacyStatus = status.status === "payout_ready"
    ? "active"
    : status.status === "not_started"
      ? "no_account"
      : status.status === "setup_started"
        ? "incomplete"
        : status.status === "action_required"
          ? "pending"
          : status.status === "account_conflict"
            ? "conflict"
            : "unavailable";

  return {
    hasConnectedAccount: status.hasAccount,
    status: legacyStatus,
    canonicalStatus: status.status,
    accountIdPresent: status.accountIdPresent,
    onboardingComplete: status.onboardingComplete,
    payoutReady: status.payoutReady,
    actionRequired: status.actionRequired,
    chargesEnabled: status.chargesEnabled,
    payoutsEnabled: status.payoutsEnabled,
    detailsSubmitted: status.detailsSubmitted,
    transfersActive: status.transfersActive,
    bankAccountPresent: status.bankAccountPresent,
    requirementsCurrentlyDue: [...status.requirementsDue],
    requirementsPastDue: [...status.requirementsPastDue],
    requirementsEventuallyDue: [],
    disabled: status.errorState?.code || null,
    errorState: status.errorState,
    lastStatusCheck: status.lastStatusCheck,
  };
}

export function buildDriverColumnStatusResponse(
  status: CanonicalDriverStripeStatus,
  stripeTreasuryAccountId: string | null | undefined,
) {
  const treasuryAccountId = stripeTreasuryAccountId?.trim() || null;
  return {
    // Legacy compatibility: this means Connect payout readiness for drivers.
    isOnboarded: status.payoutReady === true,
    entityId: null,
    bankAccountId: treasuryAccountId,
    accountLast4: null,
    requiresSetup: !treasuryAccountId,
    stripeStatus: status.status,
    stripePayoutReady: status.payoutReady,
    stripeAccountPresent: status.hasAccount,
    treasuryAccountPresent: Boolean(treasuryAccountId),
    errorState: status.errorState,
  };
}

export function getDriverStripeOnboardingHttpStatus(errorCode: DriverStripeErrorCode | null | undefined): number {
  switch (errorCode) {
    case "STRIPE_ACCOUNT_CONFLICT":
    case "STRIPE_ACCOUNT_MATCH_AMBIGUOUS":
      return 409;
    case "STRIPE_ACCOUNT_INVALID":
    case "STRIPE_ACCOUNT_NOT_FOUND":
    case "STRIPE_ACCOUNT_IDENTITY_MISMATCH":
    case "STRIPE_ACCOUNT_IDENTITY_UNVERIFIED":
      return 422;
    case "STRIPE_DISCOVERY_UNAVAILABLE":
    case "STRIPE_STATUS_UNAVAILABLE":
      return 503;
    default:
      return 409;
  }
}

export async function coordinateDriverStripeOnboarding(params: {
  user: User;
  driver: Driver;
  resolve: (user: User, driver: Driver) => Promise<DriverStripeOnboardingResolution>;
  beforeFinalResolution?: () => Promise<void>;
  reload: () => Promise<{ user: User; driver: Driver } | null>;
}): Promise<DriverStripeOnboardingDecision> {
  const decide = (user: User, driver: Driver, resolution: DriverStripeOnboardingResolution): DriverStripeOnboardingDecision => {
    if (resolution.validationResult === "valid" && resolution.accountId) {
      return { action: "reuse", user, driver, resolution };
    }
    if (resolution.safeToCreateAccount && resolution.discoveryOutcome === "no_matches") {
      return { action: "create", user, driver, resolution };
    }
    return { action: "blocked", user, driver, resolution };
  };

  const initialDecision = decide(params.user, params.driver, await params.resolve(params.user, params.driver));
  if (initialDecision.action !== "create") {
    return initialDecision;
  }

  // Complete any non-Stripe prerequisites before the final race-sensitive check.
  await params.beforeFinalResolution?.();

  // Creation requires a final database re-read and a second complete resolution.
  // A concurrent local or external candidate changes this decision to reuse/block.
  const freshIdentity = await params.reload();
  if (!freshIdentity) {
    return {
      ...initialDecision,
      action: "blocked",
      resolution: {
        ...initialDecision.resolution,
        safeToCreateAccount: false,
        supportRequired: true,
        discoveryOutcome: "discovery_unavailable",
        status: "status_unavailable",
        validationResult: "unavailable",
        errorState: {
          code: "STRIPE_DISCOVERY_UNAVAILABLE",
          retryable: true,
          supportRequired: true,
        },
      },
    };
  }

  return decide(
    freshIdentity.user,
    freshIdentity.driver,
    await params.resolve(freshIdentity.user, freshIdentity.driver),
  );
}

function normalizeAccountId(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

export function maskStripeAccountId(accountId: string | null | undefined): string | null {
  const normalized = normalizeAccountId(accountId);
  if (!normalized) return null;
  if (normalized.length <= 8) return `${normalized.slice(0, 2)}…${normalized.slice(-2)}`;
  return `${normalized.slice(0, 7)}…${normalized.slice(-4)}`;
}

function collectCandidates(user: User, driver: Driver | null | undefined): Candidate[] {
  const values: Array<{ source: DriverStripeCandidateSource; accountId: string | null }> = [
    { source: "users.stripeConnectAccountId", accountId: normalizeAccountId(user.stripeConnectAccountId) },
    { source: "drivers.stripeConnectAccountId", accountId: normalizeAccountId(driver?.stripeConnectAccountId) },
    { source: "drivers.connectedAccountId", accountId: normalizeAccountId(driver?.connectedAccountId) },
  ];
  const byId = new Map<string, DriverStripeCandidateSource[]>();
  for (const value of values) {
    if (!value.accountId) continue;
    byId.set(value.accountId, [...(byId.get(value.accountId) || []), value.source]);
  }
  return Array.from(byId.entries()).map(([accountId, sources]) => ({ accountId, sources }));
}

function selectedSource(candidate: Candidate): DriverStripeCandidateSource {
  const precedence: DriverStripeCandidateSource[] = [
    "users.stripeConnectAccountId",
    "drivers.stripeConnectAccountId",
    "drivers.connectedAccountId",
  ];
  return precedence.find((source) => candidate.sources.includes(source)) || candidate.sources[0];
}

type DriverStripeIdentityResult = "compatible" | "mismatch" | "unverified";

function normalizeEmail(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase();
  return normalized ? normalized : null;
}

function verifyAccountIdentity(
  account: DriverStripeAccountSnapshot,
  user: User,
  driver: Driver | null | undefined,
): DriverStripeIdentityResult {
  const metadata = account.metadata || {};
  const metadataUserId = (metadata.userId || metadata.user_id)?.trim() || null;
  const metadataDriverId = (metadata.driverId || metadata.driver_id)?.trim() || null;

  if (metadataUserId && metadataUserId !== user.id) return "mismatch";
  if (metadataDriverId && (!driver?.id || metadataDriverId !== driver.id)) return "mismatch";
  if (metadataUserId === user.id || (metadataDriverId && metadataDriverId === driver?.id)) {
    return "compatible";
  }

  const userEmail = normalizeEmail(user.email);
  const accountEmail = normalizeEmail(account.email);
  if (userEmail && accountEmail) {
    return userEmail === accountEmail ? "compatible" : "mismatch";
  }

  return "unverified";
}

function safeStripeError(error: unknown): { code?: string; type?: string; statusCode?: number } {
  const candidate = error as { code?: unknown; type?: unknown; statusCode?: unknown };
  return {
    code: typeof candidate?.code === "string" ? candidate.code : undefined,
    type: typeof candidate?.type === "string" ? candidate.type : undefined,
    statusCode: typeof candidate?.statusCode === "number" ? candidate.statusCode : undefined,
  };
}

function isInvalidAccountError(error: unknown): boolean {
  const safe = safeStripeError(error);
  return safe.code === "resource_missing" || safe.statusCode === 404;
}

function getBankAccountPresent(account: DriverStripeAccountSnapshot): boolean | null {
  const externalAccounts = account.external_accounts;
  if (!externalAccounts) return null;
  const data = externalAccounts.data;
  if (!Array.isArray(data)) return typeof externalAccounts.total_count === "number" ? externalAccounts.total_count > 0 : null;
  return data.some((externalAccount) =>
    externalAccount.object === "bank_account"
    || externalAccount.type === "bank_account"
    || externalAccount.type === "us_bank_account",
  );
}

function auditDetails(params: {
  user: User;
  driver: Driver | null | undefined;
  source: string;
  candidateSources?: DriverStripeCandidateSource[];
  selectedSource?: DriverStripeCandidateSource | null;
  accountId?: string | null;
  validationResult?: string;
  updatedFields?: string[];
  errorCode?: DriverStripeErrorCode;
  agreement?: boolean;
}) {
  return {
    userId: params.user.id,
    driverId: params.driver?.id || null,
    source: params.source,
    candidateSources: params.candidateSources || [],
    selectedSource: params.selectedSource || null,
    maskedAccountId: maskStripeAccountId(params.accountId),
    validationResult: params.validationResult || null,
    updatedFields: params.updatedFields || [],
    errorCode: params.errorCode || null,
    agreement: params.agreement ?? null,
  };
}

export function createDriverStripeService(dependencies: DriverStripeServiceDependencies) {
  const log = dependencies.auditLogger || ((event: DriverStripeAuditEvent, details: Record<string, unknown>) => {
    console.info(event, details);
  });
  const now = dependencies.now || (() => new Date());

  async function resolveDriverStripeAccount(params: {
    user: User;
    driver?: Driver | null;
    source: string;
    reconcile?: boolean;
  }): Promise<DriverStripeAccountResolution> {
    const { user, driver, source } = params;
    const candidates = collectCandidates(user, driver);
    const candidateSources = candidates.flatMap((candidate) => candidate.sources);

    if (candidates.length === 0) {
      const resolution: DriverStripeAccountResolution = {
        status: "not_started",
        hasAccount: false,
        accountIdPresent: false,
        accountId: null,
        maskedAccountId: null,
        candidateSource: null,
        candidateSources: [],
        conflicts: [],
        validationResult: "not_applicable",
        account: null,
        errorState: null,
      };
      log("driver.stripe.resolution", auditDetails({ user, driver, source, agreement: true }));
      return resolution;
    }

    if (candidates.length > 1) {
      const conflicts = candidates.map((candidate) => ({
        maskedAccountId: maskStripeAccountId(candidate.accountId) || "masked",
        sources: candidate.sources,
      }));
      const errorState: DriverStripeErrorState = {
        code: "STRIPE_ACCOUNT_CONFLICT",
        retryable: false,
        supportRequired: true,
      };
      log("driver.stripe.conflict", auditDetails({
        user,
        driver,
        source,
        candidateSources,
        errorCode: errorState.code,
        agreement: false,
      }));
      return {
        status: "account_conflict",
        hasAccount: true,
        accountIdPresent: true,
        accountId: null,
        maskedAccountId: null,
        candidateSource: null,
        candidateSources,
        conflicts,
        validationResult: "invalid",
        account: null,
        errorState,
      };
    }

    const candidate = candidates[0];
    const sourceField = selectedSource(candidate);
    try {
      const account = await dependencies.retrieveAccount(candidate.accountId);
      if (!account || account.deleted || account.id !== candidate.accountId) {
        const errorState: DriverStripeErrorState = {
          code: "STRIPE_ACCOUNT_INVALID",
          retryable: false,
          supportRequired: true,
        };
        log("driver.stripe.resolution", auditDetails({
          user,
          driver,
          source,
          candidateSources,
          selectedSource: sourceField,
          accountId: candidate.accountId,
          validationResult: "invalid",
          errorCode: errorState.code,
          agreement: true,
        }));
        return {
          status: "status_unavailable",
          hasAccount: true,
          accountIdPresent: true,
          accountId: candidate.accountId,
          maskedAccountId: maskStripeAccountId(candidate.accountId),
          candidateSource: sourceField,
          candidateSources,
          conflicts: [],
          validationResult: "invalid",
          account: null,
          errorState,
        };
      }

      const identityResult = verifyAccountIdentity(account, user, driver);
      if (identityResult !== "compatible") {
        const errorState: DriverStripeErrorState = {
          code: identityResult === "mismatch"
            ? "STRIPE_ACCOUNT_IDENTITY_MISMATCH"
            : "STRIPE_ACCOUNT_IDENTITY_UNVERIFIED",
          retryable: false,
          supportRequired: true,
        };
        log("driver.stripe.identity_verification_failed", auditDetails({
          user,
          driver,
          source,
          candidateSources,
          selectedSource: sourceField,
          accountId: candidate.accountId,
          validationResult: identityResult === "mismatch" ? "identity_mismatch" : "identity_unverified",
          errorCode: errorState.code,
          agreement: true,
        }));
        return {
          status: "status_unavailable",
          hasAccount: true,
          accountIdPresent: true,
          accountId: candidate.accountId,
          maskedAccountId: maskStripeAccountId(candidate.accountId),
          candidateSource: sourceField,
          candidateSources,
          conflicts: [],
          validationResult: identityResult === "mismatch" ? "identity_mismatch" : "identity_unverified",
          account: null,
          errorState,
        };
      }

      const resolution: DriverStripeAccountResolution = {
        status: "action_required",
        hasAccount: true,
        accountIdPresent: true,
        accountId: account.id,
        maskedAccountId: maskStripeAccountId(account.id),
        candidateSource: sourceField,
        candidateSources,
        conflicts: [],
        validationResult: "valid",
        account,
        errorState: null,
      };
      log("driver.stripe.resolution", auditDetails({
        user,
        driver,
        source,
        candidateSources,
        selectedSource: sourceField,
        accountId: account.id,
        validationResult: "valid",
        agreement: true,
      }));

      if (params.reconcile === true) {
        await executeDriverStripeReconciliation({ user, driver, source, resolution });
      }
      return resolution;
    } catch (error) {
      const invalid = isInvalidAccountError(error);
      const errorState: DriverStripeErrorState = {
        code: invalid ? "STRIPE_ACCOUNT_NOT_FOUND" : "STRIPE_STATUS_UNAVAILABLE",
        retryable: !invalid,
        supportRequired: invalid,
      };
      log(invalid ? "driver.stripe.resolution" : "driver.stripe.status_unavailable", auditDetails({
        user,
        driver,
        source,
        candidateSources,
        selectedSource: sourceField,
        accountId: candidate.accountId,
        validationResult: invalid ? "invalid" : "unavailable",
        errorCode: errorState.code,
        agreement: true,
      }));
      return {
        status: "status_unavailable",
        hasAccount: true,
        accountIdPresent: true,
        accountId: candidate.accountId,
        maskedAccountId: maskStripeAccountId(candidate.accountId),
        candidateSource: sourceField,
        candidateSources,
        conflicts: [],
        validationResult: invalid ? "invalid" : "unavailable",
        account: null,
        errorState,
      };
    }
  }

  async function getDriverStripeStatus(params: {
    user: User;
    driver?: Driver | null;
    source: string;
  }): Promise<CanonicalDriverStripeStatus> {
    const resolution = await resolveDriverStripeAccount({ ...params, reconcile: false });
    const checkedAt = now().toISOString();
    if (!resolution.account) {
      return {
        status: resolution.status,
        hasAccount: resolution.hasAccount,
        accountIdPresent: resolution.accountIdPresent,
        onboardingComplete: resolution.status === "not_started" ? false : null,
        payoutReady: resolution.status === "not_started" ? false : null,
        actionRequired: resolution.status === "account_conflict",
        requirementsDue: [],
        requirementsPastDue: [],
        bankAccountPresent: null,
        lastStatusCheck: checkedAt,
        errorState: resolution.errorState,
        detailsSubmitted: null,
        payoutsEnabled: null,
        chargesEnabled: null,
        transfersActive: null,
      };
    }

    const account = resolution.account;
    const detailsSubmitted = Boolean(account.details_submitted);
    const payoutsEnabled = Boolean(account.payouts_enabled);
    const chargesEnabled = Boolean(account.charges_enabled);
    const transfersCapability = account.capabilities?.transfers;
    const transfersActive = transfersCapability == null ? null : transfersCapability === "active";
    const payoutReady = payoutsEnabled && transfersActive !== false;
    const requirementsDue = account.requirements?.currently_due || [];
    const requirementsPastDue = account.requirements?.past_due || [];
    const status: DriverStripeStatus = payoutReady
      ? "payout_ready"
      : !detailsSubmitted
        ? "setup_started"
        : "action_required";

    return {
      status,
      hasAccount: true,
      accountIdPresent: true,
      onboardingComplete: detailsSubmitted,
      payoutReady,
      actionRequired: status === "action_required" || status === "setup_started",
      requirementsDue,
      requirementsPastDue,
      bankAccountPresent: getBankAccountPresent(account),
      lastStatusCheck: checkedAt,
      errorState: null,
      detailsSubmitted,
      payoutsEnabled,
      chargesEnabled,
      transfersActive,
    };
  }

  async function planDriverStripeReconciliation(params: {
    user: User;
    driver?: Driver | null;
    source: string;
  }): Promise<DriverStripeReconciliationPlan> {
    const resolution = await resolveDriverStripeAccount({ ...params, reconcile: false });
    const wouldUpdate: DriverStripeReconciliationField[] = [];
    if (resolution.validationResult === "valid" && resolution.accountId && params.driver) {
      if (!normalizeAccountId(params.user.stripeConnectAccountId)) wouldUpdate.push("users.stripeConnectAccountId");
      if (!normalizeAccountId(params.driver.stripeConnectAccountId)) wouldUpdate.push("drivers.stripeConnectAccountId");
      if (!normalizeAccountId(params.driver.connectedAccountId)) wouldUpdate.push("drivers.connectedAccountId");
    }
    const safeToReconcile = Boolean(
      params.driver
      && resolution.validationResult === "valid"
      && resolution.accountId
      && resolution.conflicts.length === 0,
    );
    const plan: DriverStripeReconciliationPlan = {
      safeToReconcile,
      maskedAccountId: resolution.maskedAccountId,
      candidateSource: resolution.candidateSource,
      candidateSources: resolution.candidateSources,
      wouldUpdate,
      conflicts: resolution.conflicts,
      validationResult: resolution.validationResult,
      supportReviewRequired: Boolean(resolution.errorState?.supportRequired || resolution.conflicts.length > 0),
      errorState: resolution.errorState,
    };
    log("driver.stripe.reconciliation_planned", auditDetails({
      user: params.user,
      driver: params.driver,
      source: params.source,
      candidateSources: resolution.candidateSources,
      selectedSource: resolution.candidateSource,
      accountId: resolution.accountId,
      validationResult: resolution.validationResult,
      updatedFields: wouldUpdate,
      errorCode: resolution.errorState?.code,
      agreement: resolution.conflicts.length === 0,
    }));
    return plan;
  }

  async function executeDriverStripeReconciliation(params: {
    user: User;
    driver?: Driver | null;
    source: string;
    resolution?: DriverStripeAccountResolution;
  }): Promise<DriverStripeReconciliationResult> {
    const resolution = params.resolution || await resolveDriverStripeAccount({ ...params, reconcile: false });
    if (!params.driver || !resolution.accountId || resolution.validationResult !== "valid" || resolution.conflicts.length > 0) {
      return { conflict: resolution.conflicts.length > 0, updatedFields: [] };
    }
    if (!dependencies.reconcileAccountIds) {
      throw new Error("Driver Stripe reconciliation persistence is not configured");
    }
    const result = await dependencies.reconcileAccountIds({
      userId: params.user.id,
      driverId: params.driver.id,
      expectedAccountId: resolution.accountId,
    });
    log(result.conflict ? "driver.stripe.conflict" : "driver.stripe.reconciled", auditDetails({
      user: params.user,
      driver: params.driver,
      source: params.source,
      candidateSources: resolution.candidateSources,
      selectedSource: resolution.candidateSource,
      accountId: resolution.accountId,
      validationResult: resolution.validationResult,
      updatedFields: result.updatedFields,
      errorCode: result.conflict ? "STRIPE_ACCOUNT_CONFLICT" : undefined,
      agreement: !result.conflict,
    }));
    return result;
  }

  async function resolveDriverStripeAccountForOnboarding(params: {
    user: User;
    driver?: Driver | null;
    source: string;
  }): Promise<DriverStripeOnboardingResolution> {
    const localResolution = await resolveDriverStripeAccount({ ...params, reconcile: false });
    const finalize = (result: DriverStripeOnboardingResolution): DriverStripeOnboardingResolution => {
      log("driver.stripe.discovery_classified", {
        ...auditDetails({
          user: params.user,
          driver: params.driver,
          source: params.source,
          accountId: result.accountId,
          validationResult: result.validationResult,
          errorCode: result.errorState?.code,
        }),
        discoveryOutcome: result.discoveryOutcome,
        matchesFound: result.matchesFound,
        validMatches: result.validMatches,
        invalidMatches: result.invalidMatches,
        identityMismatches: result.identityMismatches,
        identityUnverified: result.identityUnverified,
        safeToCreateAccount: result.safeToCreateAccount,
        supportRequired: result.supportRequired,
      });
      return result;
    };

    if (localResolution.accountIdPresent || localResolution.status !== "not_started") {
      return finalize({
        ...localResolution,
        safeToCreateAccount: false,
        discoveredExistingAccount: false,
        discoveryOutcome: "not_attempted",
        matchesFound: 0,
        validMatches: 0,
        invalidMatches: 0,
        identityMismatches: 0,
        identityUnverified: 0,
        supportRequired: Boolean(localResolution.errorState?.supportRequired || localResolution.conflicts.length > 0),
      });
    }

    if (!dependencies.findAccountsByIdentity) {
      return finalize({
        ...localResolution,
        status: "status_unavailable",
        validationResult: "unavailable",
        errorState: { code: "STRIPE_DISCOVERY_UNAVAILABLE", retryable: true, supportRequired: false },
        safeToCreateAccount: false,
        discoveredExistingAccount: false,
        discoveryOutcome: "discovery_unavailable",
        matchesFound: 0,
        validMatches: 0,
        invalidMatches: 0,
        identityMismatches: 0,
        identityUnverified: 0,
        supportRequired: false,
      });
    }

    let matches: DriverStripeAccountSnapshot[];
    try {
      matches = await dependencies.findAccountsByIdentity({
        userId: params.user.id,
        driverId: params.driver?.id || null,
        email: params.user.email || null,
      });
      if (!Array.isArray(matches)) {
        throw new Error("Stripe discovery returned an invalid result");
      }
    } catch {
      log("driver.stripe.status_unavailable", auditDetails({
        user: params.user,
        driver: params.driver,
        source: params.source,
        validationResult: "unavailable",
        errorCode: "STRIPE_DISCOVERY_UNAVAILABLE",
      }));
      return finalize({
        ...localResolution,
        status: "status_unavailable",
        validationResult: "unavailable",
        errorState: { code: "STRIPE_DISCOVERY_UNAVAILABLE", retryable: true, supportRequired: false },
        safeToCreateAccount: false,
        discoveredExistingAccount: false,
        discoveryOutcome: "discovery_unavailable",
        matchesFound: 0,
        validMatches: 0,
        invalidMatches: 0,
        identityMismatches: 0,
        identityUnverified: 0,
        supportRequired: false,
      });
    }

    const invalidAccounts: DriverStripeAccountSnapshot[] = [];
    const validAccounts: DriverStripeAccountSnapshot[] = [];
    const identityMismatchAccounts: DriverStripeAccountSnapshot[] = [];
    const identityUnverifiedAccounts: DriverStripeAccountSnapshot[] = [];
    for (const account of matches) {
      if (!account || account.deleted || !normalizeAccountId(account.id)) {
        invalidAccounts.push(account);
        continue;
      }
      const identityResult = verifyAccountIdentity(account, params.user, params.driver);
      if (identityResult === "compatible") {
        validAccounts.push(account);
      } else if (identityResult === "mismatch") {
        identityMismatchAccounts.push(account);
      } else {
        identityUnverifiedAccounts.push(account);
      }
    }

    const discoveryCounts = {
      matchesFound: matches.length,
      validMatches: validAccounts.length,
      invalidMatches: invalidAccounts.length,
      identityMismatches: identityMismatchAccounts.length,
      identityUnverified: identityUnverifiedAccounts.length,
    };

    if (matches.length === 0) {
      return finalize({
        ...localResolution,
        safeToCreateAccount: true,
        discoveredExistingAccount: false,
        discoveryOutcome: "no_matches",
        ...discoveryCounts,
        supportRequired: false,
      });
    }

    if (identityMismatchAccounts.length > 0) {
      return finalize({
        ...localResolution,
        status: validAccounts.length > 0 ? "account_conflict" : "status_unavailable",
        hasAccount: true,
        validationResult: "identity_mismatch",
        errorState: { code: "STRIPE_ACCOUNT_IDENTITY_MISMATCH", retryable: false, supportRequired: true },
        safeToCreateAccount: false,
        discoveredExistingAccount: false,
        discoveryOutcome: "identity_mismatch",
        ...discoveryCounts,
        supportRequired: true,
      });
    }

    if (identityUnverifiedAccounts.length > 0) {
      return finalize({
        ...localResolution,
        status: validAccounts.length > 0 ? "account_conflict" : "status_unavailable",
        hasAccount: true,
        validationResult: "identity_unverified",
        errorState: { code: "STRIPE_ACCOUNT_IDENTITY_UNVERIFIED", retryable: false, supportRequired: true },
        safeToCreateAccount: false,
        discoveredExistingAccount: false,
        discoveryOutcome: "identity_unverified",
        ...discoveryCounts,
        supportRequired: true,
      });
    }

    if (validAccounts.length > 1) {
      return finalize({
        ...localResolution,
        status: "account_conflict",
        hasAccount: true,
        validationResult: "invalid",
        errorState: { code: "STRIPE_ACCOUNT_MATCH_AMBIGUOUS", retryable: false, supportRequired: true },
        safeToCreateAccount: false,
        discoveredExistingAccount: false,
        discoveryOutcome: "ambiguous_matches",
        ...discoveryCounts,
        supportRequired: true,
      });
    }

    if (validAccounts.length === 1) {
      const match = validAccounts[0];
      // Clearly deleted/non-usable records do not compete for identity. Reuse the
      // sole verified account, but never permit creation while any result exists.
      return finalize({
        ...localResolution,
        status: "action_required",
        hasAccount: true,
        accountIdPresent: false,
        accountId: match.id,
        maskedAccountId: maskStripeAccountId(match.id),
        validationResult: "valid",
        account: null,
        safeToCreateAccount: false,
        discoveredExistingAccount: true,
        discoveryOutcome: "one_verified_match",
        ...discoveryCounts,
        supportRequired: false,
      });
    }

    return finalize({
      ...localResolution,
      status: "status_unavailable",
      hasAccount: true,
      validationResult: "invalid",
      errorState: { code: "STRIPE_ACCOUNT_INVALID", retryable: false, supportRequired: true },
      safeToCreateAccount: false,
      discoveredExistingAccount: false,
      discoveryOutcome: "invalid_matches_found",
      ...discoveryCounts,
      supportRequired: true,
    });
  }

  return {
    resolveDriverStripeAccount,
    getDriverStripeStatus,
    planDriverStripeReconciliation,
    executeDriverStripeReconciliation,
    resolveDriverStripeAccountForOnboarding,
  };
}
