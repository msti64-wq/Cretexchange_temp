import { eq } from "drizzle-orm";
import { drivers, owners, payments, systemSettings, washoutActivities, washoutLocations } from "../shared/schema";
import { resolveConfiguredWashoutPlatformFeeCents } from "../shared/billingPolicy";
import { formatCentsToDollars } from "../shared/money";
import { db } from "./db";

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
  stripePaymentIntentId?: string | null;
  stripeTransferId?: string | null;
  stripeChargeId?: string | null;
  obligationCreatedBy?: string | null;
  obligationCreationReason?: string | null;
};

export type FinancialObligationActivity = {
  id: string;
  driverId: string;
  locationId: string;
  status: string;
  amount: string | number | null;
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
  findSystemSettings(): Promise<{ platformWashoutFee?: string | number | null } | null>;
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
      | "driver_not_found"
      | "location_not_found"
      | "owner_not_found"
      | "invalid_frozen_activity_amount"
      | "invalid_platform_fee"
      | "duplicate_financial_obligation"
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
  return parseStrictDollarCents(value, "invalid_frozen_activity_amount", "Verified activity has an invalid frozen driver incentive", "Verified activity has no frozen driver incentive");
}

function parseStrictDollarCents(
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
    ? parseStrictDollarCents(ownerCustomPlatformFee, "invalid_platform_fee", "Applicable platform fee configuration is invalid")
    : null;
  const systemFeeCents = hasConfiguredValue(systemPlatformWashoutFee)
    ? parseStrictDollarCents(systemPlatformWashoutFee, "invalid_platform_fee", "Applicable platform fee configuration is invalid")
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

function assertExistingObligation(existing: FinancialObligationPayment[]): FinancialObligationPayment | null {
  if (existing.length === 0) return null;
  if (existing.length > 1) {
    throw new FinancialObligationError("duplicate_financial_obligation", "Multiple payment rows already reference this activity; reconciliation is required");
  }
  if (existing[0].status !== "pending") {
    throw new FinancialObligationError("existing_financial_state_requires_review", "Existing payment is not a canonical unpaid obligation; reconciliation is required");
  }
  return existing[0];
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
    const existing = assertExistingObligation(await tx.findPaymentsByActivityId(activityId));
    if (existing) return fromExisting(existing);

    const activity = await tx.findActivityById(activityId);
    if (!activity) {
      throw new FinancialObligationError("activity_not_found", "Activity not found");
    }
    if (activity.status !== "verified") {
      throw new FinancialObligationError("activity_not_verified", "Only verified activities may create a financial obligation");
    }

    const [driver, location] = await Promise.all([
      tx.findDriverById(activity.driverId),
      tx.findLocationById(activity.locationId),
    ]);
    if (!driver) throw new FinancialObligationError("driver_not_found", "Verified activity has no valid driver");
    if (!location) throw new FinancialObligationError("location_not_found", "Verified activity has no valid facility location");

    const [owner, settings] = await Promise.all([
      tx.findOwnerById(location.ownerId),
      tx.findSystemSettings(),
    ]);
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
      stripePaymentIntentId: null,
      stripeTransferId: null,
      stripeChargeId: null,
      obligationCreatedBy: context.actorUserId || null,
      obligationCreationReason: context.reason || null,
    };
    const created = await tx.insertPendingObligation(input);
    const obligation = created ?? assertExistingObligation(await tx.findPaymentsByActivityId(activity.id));
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

const databaseFinancialObligationRepository: FinancialObligationRepository = {
  transaction: (run) => db.transaction(async (tx) => run({
    findPaymentsByActivityId: async (activityId) => tx.select().from(payments).where(eq(payments.activityId, activityId)) as Promise<FinancialObligationPayment[]>,
    findActivityById: async (activityId) => {
      const [activity] = await tx.select().from(washoutActivities).where(eq(washoutActivities.id, activityId));
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
      const [settings] = await tx.select({ platformWashoutFee: systemSettings.platformWashoutFee }).from(systemSettings).limit(1);
      return settings ?? null;
    },
    insertPendingObligation: async (input) => {
      const [payment] = await tx
        .insert(payments)
        .values(input)
        .onConflictDoNothing({ target: payments.activityId })
        .returning();
      return payment ?? null;
    },
  })),
};
