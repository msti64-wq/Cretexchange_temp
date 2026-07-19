import { eq, sql } from "drizzle-orm";
import { drivers, owners, payments, systemSettings, washoutActivities, washoutLocations } from "../shared/schema";
import { resolveConfiguredWashoutPlatformFeeCents } from "../shared/billingPolicy";
import { formatCentsToDollars } from "../shared/money";
import { db } from "./db";
import { isHistoricalFinancialRecord } from "./financialCutoff";

export const CANONICAL_VERIFIED_ACTIVITY_OBLIGATION_KIND = "canonical_verified_activity_v1";
export const CANONICAL_OBLIGATION_REASON_CATEGORIES = ["missing_canonical_obligation"] as const;
export type CanonicalObligationReasonCategory = typeof CANONICAL_OBLIGATION_REASON_CATEGORIES[number];

export type FinancialObligationPayment = {
  id: string;
  activityId: string;
  driverId: string;
  ownerId: string;
  amount: string;
  processingFee: string;
  washoutServiceFee: string;
  status: string;
  batchId?: string | null;
  paidAt?: Date | null;
  obligationKind?: string | null;
  obligationCreatedBy?: string | null;
  obligationCreationReason?: string | null;
};

export type FinancialObligationActivity = {
  id: string;
  driverId: string;
  locationId: string;
  status: string;
  amount: string | number | null;
  verifiedAt?: Date | string | null;
  createdAt?: Date | string | null;
};

export type FinancialObligationRepository = {
  transaction<T>(run: (tx: FinancialObligationRepositoryOperations) => Promise<T>): Promise<T>;
};

export type FinancialObligationRepositoryOperations = {
  findPaymentsByActivityId(activityId: string): Promise<FinancialObligationPayment[]>;
  findActivityById(activityId: string): Promise<FinancialObligationActivity | null>;
  findDriverById(driverId: string): Promise<{ id: string } | null>;
  findLocationById(locationId: string): Promise<{ id: string; ownerId: string } | null>;
  findOwnerById(ownerId: string): Promise<{ id: string; customPlatformFee?: string | number | null } | null>;
  findSystemSettings(): Promise<{ platformWashoutFee?: string | number | null; financialHistoryCutoffAt?: Date | string | null } | null>;
  insertPendingObligation(input: Omit<FinancialObligationPayment, "id">): Promise<FinancialObligationPayment | null>;
};

export type FinancialObligationResult = {
  obligation: FinancialObligationPayment;
  created: boolean;
  driverIncentiveCents: number;
  platformFeeCents: number;
  facilityChargeCents: number;
};

export type FinancialObligationCreationContext = {
  actorUserId?: string | null;
  reason?: string | null;
};

export class FinancialObligationError extends Error {
  constructor(
    readonly code:
      | "activity_not_found"
      | "activity_not_verified"
      | "historical_activity"
      | "driver_not_found"
      | "location_not_found"
      | "owner_not_found"
      | "invalid_frozen_activity_amount"
      | "invalid_platform_fee"
      | "invalid_creation_reason"
      | "duplicate_financial_obligation"
      | "legacy_financial_record_requires_review"
      | "existing_financial_state_requires_review",
    message: string,
  ) {
    super(message);
  }
}

export function isPlatformFinancialOperationsRole(role: unknown): boolean {
  return role === "admin" || role === "super_admin";
}

/**
 * `washout_activities.amount` is stored as dollars with two decimal places. This
 * parser deliberately rejects malformed or fractional-cent values instead of
 * allowing a money helper's fallback to turn bad input into a small obligation.
 */
export function parseFrozenActivityIncentiveCents(value: unknown): number {
  return parseFrozenDollarCents(value, "invalid_frozen_activity_amount", "Verified activity has an invalid frozen driver incentive", "Verified activity has no frozen driver incentive");
}

export function parseFrozenDollarCents(
  value: unknown,
  code: "invalid_frozen_activity_amount" | "invalid_platform_fee",
  invalidMessage: string,
  missingMessage = invalidMessage,
): number {
  if (value === null || value === undefined || value === "") {
    throw new FinancialObligationError(code, missingMessage);
  }

  const raw = typeof value === "number" ? String(value) : String(value).trim();
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(raw)) {
    throw new FinancialObligationError(code, invalidMessage);
  }

  const dollars = Number(raw);
  const cents = Math.round(dollars * 100);
  if (!Number.isSafeInteger(cents) || cents < 0 || Math.abs(dollars * 100 - cents) > Number.EPSILON) {
    throw new FinancialObligationError(code, invalidMessage);
  }
  return cents;
}

/** Server-controlled, bounded audit wording for the only currently safe category. */
export function buildCanonicalObligationCreationReason(category: unknown, supportingDetail: unknown): string {
  if (!CANONICAL_OBLIGATION_REASON_CATEGORIES.includes(category as CanonicalObligationReasonCategory)) {
    throw new FinancialObligationError("invalid_creation_reason", "Use an approved obligation-creation reason category");
  }
  const detail = typeof supportingDetail === "string" ? supportingDetail.trim().replace(/\s+/g, " ") : "";
  const vague = ["manual entry", "billing issue", "create it", "adjustment", "correction", "missing", "fix", "fee"];
  const words = detail.split(/\s+/).filter(Boolean);
  const providerIdentifier = /\b(?:pi|pm|cus|acct|ch|tr)_[A-Za-z0-9_]+\b/i;
  const normalized = detail.toLocaleLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const onlyVagueLanguage = vague.reduce((remaining, phrase) => remaining.replaceAll(phrase, " "), normalized).replace(/\s+/g, "").length === 0;
  if (detail.length < 20 || detail.length > 420 || onlyVagueLanguage || words.length < 4 || providerIdentifier.test(detail) || /[<>]/.test(detail) || detail.startsWith("[")) {
    throw new FinancialObligationError("invalid_creation_reason", "Provide meaningful supporting detail without provider identifiers");
  }
  return `[${category}] ${detail}`;
}

function hasConfiguredValue(value: unknown): boolean {
  return value !== null && value !== undefined && value !== "";
}

function resolveFrozenPlatformFeeCents(
  ownerCustomPlatformFee: string | number | null | undefined,
  systemPlatformWashoutFee: string | number | null | undefined,
): number {
  // Validate first because the shared policy helper intentionally supplies
  // fallbacks for general billing views. Obligation creation must not turn a
  // malformed or negative authoritative configuration into a zero-dollar fee.
  const ownerFeeCents = hasConfiguredValue(ownerCustomPlatformFee)
    ? parseFrozenDollarCents(ownerCustomPlatformFee, "invalid_platform_fee", "Applicable platform fee configuration is invalid")
    : null;
  const systemFeeCents = hasConfiguredValue(systemPlatformWashoutFee)
    ? parseFrozenDollarCents(systemPlatformWashoutFee, "invalid_platform_fee", "Applicable platform fee configuration is invalid")
    : null;
  const resolved = resolveConfiguredWashoutPlatformFeeCents({
    ownerCustomPlatformFee,
    systemPlatformWashoutFee,
  });
  const expected = ownerFeeCents ?? systemFeeCents ?? 500;
  if (!Number.isSafeInteger(resolved) || resolved < 0 || resolved !== expected) {
    throw new FinancialObligationError("invalid_platform_fee", "Applicable platform fee configuration is invalid");
  }
  return resolved;
}

function resolveExistingCanonicalObligation(existing: FinancialObligationPayment[]): FinancialObligationPayment | null {
  const canonical = existing.filter((payment) => payment.obligationKind === CANONICAL_VERIFIED_ACTIVITY_OBLIGATION_KIND);
  const legacy = existing.filter((payment) => payment.obligationKind !== CANONICAL_VERIFIED_ACTIVITY_OBLIGATION_KIND);
  if (canonical.length > 1) {
    throw new FinancialObligationError("duplicate_financial_obligation", "Multiple payment rows already reference this activity; reconciliation is required");
  }
  if (legacy.length > 0) {
    throw new FinancialObligationError("legacy_financial_record_requires_review", "A legacy or unclassified payment record is linked to this activity; canonical creation is blocked pending review");
  }
  if (canonical.length === 0) return null;
  if (canonical[0].status !== "pending") {
    throw new FinancialObligationError("existing_financial_state_requires_review", "Existing payment is not a canonical unpaid obligation; reconciliation is required");
  }
  return canonical[0];
}

function fromExisting(obligation: FinancialObligationPayment): FinancialObligationResult {
  const driverIncentiveCents = parseFrozenActivityIncentiveCents(obligation.amount);
  const platformFeeCents = parseFrozenActivityIncentiveCents(obligation.processingFee);
  return {
    obligation,
    created: false,
    driverIncentiveCents,
    platformFeeCents,
    facilityChargeCents: driverIncentiveCents + platformFeeCents,
  };
}

/** Read-only eligibility and frozen-component preview. It never records an obligation. */
export async function previewFinancialObligationForVerifiedActivity(
  activityId: string,
  repository: FinancialObligationRepository = databaseFinancialObligationRepository,
): Promise<Pick<FinancialObligationResult, "driverIncentiveCents" | "platformFeeCents" | "facilityChargeCents">> {
  return repository.transaction(async (tx) => {
    const activity = await tx.findActivityById(activityId);
    if (!activity) throw new FinancialObligationError("activity_not_found", "Activity not found");
    if (activity.status !== "verified") throw new FinancialObligationError("activity_not_verified", "Only verified activities may create a financial obligation");
    const settings = await tx.findSystemSettings();
    if (isHistoricalFinancialRecord(activity, settings?.financialHistoryCutoffAt)) {
      throw new FinancialObligationError("historical_activity", "Historical activities are available for audit only and cannot create current financial obligations");
    }
    const existing = resolveExistingCanonicalObligation(await tx.findPaymentsByActivityId(activityId));
    if (existing) {
      const resolved = fromExisting(existing);
      return resolved;
    }
    const [driver, location] = await Promise.all([tx.findDriverById(activity.driverId), tx.findLocationById(activity.locationId)]);
    if (!driver) throw new FinancialObligationError("driver_not_found", "Verified activity has no valid driver");
    if (!location) throw new FinancialObligationError("location_not_found", "Verified activity has no valid facility location");
    const owner = await tx.findOwnerById(location.ownerId);
    if (!owner || owner.id !== location.ownerId) throw new FinancialObligationError("owner_not_found", "Verified activity has no valid facility owner");
    const driverIncentiveCents = parseFrozenActivityIncentiveCents(activity.amount);
    const platformFeeCents = resolveFrozenPlatformFeeCents(owner.customPlatformFee, settings?.platformWashoutFee);
    const facilityChargeCents = driverIncentiveCents + platformFeeCents;
    if (!Number.isSafeInteger(facilityChargeCents)) throw new FinancialObligationError("invalid_platform_fee", "Facility charge exceeds safe integer cents");
    return { driverIncentiveCents, platformFeeCents, facilityChargeCents };
  });
}

/**
 * Creates the canonical unpaid payment obligation for one already-verified
 * activity. This service only records frozen values. It never invokes Stripe,
 * billing runs, wallet credits, payouts, notifications, or settlement.
 */
export async function createFinancialObligationForVerifiedActivity(
  activityId: string,
  repository: FinancialObligationRepository = databaseFinancialObligationRepository,
  context: FinancialObligationCreationContext = {},
): Promise<FinancialObligationResult> {
  return repository.transaction(async (tx) => {
    const activity = await tx.findActivityById(activityId);
    if (!activity) {
      throw new FinancialObligationError("activity_not_found", "Activity not found");
    }
    if (activity.status !== "verified") {
      throw new FinancialObligationError("activity_not_verified", "Only verified activities may create a financial obligation");
    }
    const settings = await tx.findSystemSettings();
    if (isHistoricalFinancialRecord(activity, settings?.financialHistoryCutoffAt)) {
      throw new FinancialObligationError("historical_activity", "Historical activities are available for audit only and cannot create current financial obligations");
    }
    const existing = resolveExistingCanonicalObligation(await tx.findPaymentsByActivityId(activityId));
    if (existing) return fromExisting(existing);

    const [driver, location] = await Promise.all([
      tx.findDriverById(activity.driverId),
      tx.findLocationById(activity.locationId),
    ]);
    if (!driver) throw new FinancialObligationError("driver_not_found", "Verified activity has no valid driver");
    if (!location) throw new FinancialObligationError("location_not_found", "Verified activity has no valid facility location");

    const owner = await tx.findOwnerById(location.ownerId);
    if (!owner || owner.id !== location.ownerId) {
      throw new FinancialObligationError("owner_not_found", "Verified activity has no valid facility owner");
    }

    const driverIncentiveCents = parseFrozenActivityIncentiveCents(activity.amount);
    const platformFeeCents = resolveFrozenPlatformFeeCents(
      owner.customPlatformFee,
      settings?.platformWashoutFee,
    );
    const facilityChargeCents = driverIncentiveCents + platformFeeCents;
    if (!Number.isSafeInteger(facilityChargeCents)) {
      throw new FinancialObligationError("invalid_platform_fee", "Facility charge exceeds safe integer cents");
    }

    const input: Omit<FinancialObligationPayment, "id"> = {
      activityId: activity.id,
      driverId: driver.id,
      ownerId: owner.id,
      amount: formatCentsToDollars(driverIncentiveCents),
      processingFee: formatCentsToDollars(platformFeeCents),
      // This non-null legacy compatibility column mirrors only the driver
      // incentive. `amount` and `processingFee` remain the canonical fields.
      washoutServiceFee: formatCentsToDollars(driverIncentiveCents),
      status: "pending",
      batchId: null,
      paidAt: null,
      obligationKind: CANONICAL_VERIFIED_ACTIVITY_OBLIGATION_KIND,
      // A canonical obligation must retain the server-derived actor and reason.
      // If the separately approved audit-column migration is absent, the
      // database rejects creation rather than silently discarding audit data.
      obligationCreatedBy: context.actorUserId || null,
      obligationCreationReason: context.reason || null,
    };
    const created = await tx.insertPendingObligation(input);
    const obligation = created ?? resolveExistingCanonicalObligation(await tx.findPaymentsByActivityId(activity.id));
    if (!obligation) {
      throw new FinancialObligationError("duplicate_financial_obligation", "Unable to create or retrieve the canonical financial obligation");
    }
    return {
      obligation,
      created: created !== null,
      driverIncentiveCents,
      platformFeeCents,
      facilityChargeCents,
    };
  });
}

export function createDatabaseFinancialObligationRepository(options: { obligationKindAvailable: boolean; canonicalPartialIndexAvailable?: boolean }): FinancialObligationRepository {
  const paymentFields = {
    id: payments.id,
    activityId: payments.activityId,
    driverId: payments.driverId,
    ownerId: payments.ownerId,
    amount: payments.amount,
    processingFee: payments.processingFee,
    washoutServiceFee: payments.washoutServiceFee,
    status: payments.status,
    batchId: payments.batchId,
    paidAt: payments.paidAt,
  };
  return {
  transaction: (run) => db.transaction(async (tx) => run({
    // The preview projection contains only pre-0020 migration-proven payment
    // columns. Canonical-kind reads are added only after metadata confirms it.
    findPaymentsByActivityId: async (activityId) => {
      if (options.obligationKindAvailable) {
        return tx.select({ ...paymentFields, obligationKind: payments.obligationKind }).from(payments).where(eq(payments.activityId, activityId)) as unknown as FinancialObligationPayment[];
      }
      return tx.select(paymentFields).from(payments).where(eq(payments.activityId, activityId)) as unknown as FinancialObligationPayment[];
    },
    findActivityById: async (activityId) => {
      const [activity] = await tx.select({
        id: washoutActivities.id,
        driverId: washoutActivities.driverId,
        locationId: washoutActivities.locationId,
        status: washoutActivities.status,
        amount: washoutActivities.amount,
        verifiedAt: washoutActivities.verifiedAt,
        createdAt: washoutActivities.createdAt,
      }).from(washoutActivities).where(eq(washoutActivities.id, activityId));
      return activity ?? null;
    },
    findDriverById: async (driverId) => {
      const [driver] = await tx.select({ id: drivers.id }).from(drivers).where(eq(drivers.id, driverId));
      return driver ?? null;
    },
    findLocationById: async (locationId) => {
      const [location] = await tx.select({ id: washoutLocations.id, ownerId: washoutLocations.ownerId }).from(washoutLocations).where(eq(washoutLocations.id, locationId));
      return location ?? null;
    },
    findOwnerById: async (ownerId) => {
      const [owner] = await tx.select({ id: owners.id, customPlatformFee: owners.customPlatformFee }).from(owners).where(eq(owners.id, ownerId));
      return owner ?? null;
    },
    // Read-only: unlike storage.getSystemSettings(), this query never inserts a
    // default configuration while recording an obligation.
    findSystemSettings: async () => {
      const [settings] = await tx.select({ platformWashoutFee: systemSettings.platformWashoutFee, financialHistoryCutoffAt: systemSettings.financialHistoryCutoffAt }).from(systemSettings).limit(1);
      return settings ?? null;
    },
    insertPendingObligation: async (input) => {
      if (options.obligationKindAvailable && options.canonicalPartialIndexAvailable !== false) {
        const [payment] = await tx.insert(payments).values(input).onConflictDoNothing({
          target: payments.activityId,
          // The arbiter predicate must be literal SQL, not a bind parameter:
          // PostgreSQL has to infer the exact partial unique index at plan time.
          where: sql`${payments.activityId} IS NOT NULL AND ${payments.obligationKind} = ${sql.raw(`'${CANONICAL_VERIFIED_ACTIVITY_OBLIGATION_KIND}'`)}`,
        }).returning({ ...paymentFields, obligationKind: payments.obligationKind });
        return payment ? payment as FinancialObligationPayment : null;
      }
      // Creation is blocked by the route capability gate. This branch protects
      // against accidental direct use with a pre-0020 projection.
      throw new FinancialObligationError("existing_financial_state_requires_review", "Canonical financial creation requires verified schema capability");
    },
  })) };
}

// Test-only default. Runtime routes always pass metadata-backed capabilities.
const databaseFinancialObligationRepository = createDatabaseFinancialObligationRepository({ obligationKindAvailable: true, canonicalPartialIndexAvailable: true });
