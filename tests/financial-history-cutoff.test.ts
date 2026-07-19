import assert from "node:assert/strict";
import test from "node:test";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgres://user:pass@127.0.0.1:1/cretexchange_test";

const {
  effectiveFinancialTimestamp,
  isCurrentFinancialRecord,
  isHistoricalFinancialRecord,
} = await import("../server/financialCutoff");
const {
  createFinancialObligationForVerifiedActivity,
  FinancialObligationError,
} = await import("../server/financialObligations");
const {
  listUnbatchedCanonicalObligations,
  listVerifiedActivitiesWithoutCanonicalObligations,
} = await import("../server/financialDiscovery");
const {
  buildOwnerWashoutBillingLedgerFromPayments,
  getDriverTipSummaryFromPayments,
} = await import("../server/billing/ownerWashoutLedger");

const CUTOFF = "2026-07-17T05:00:00.000Z";
const BEFORE = "2026-07-17T04:59:59.000Z";
const AT = "2026-07-17T05:00:00.000Z";
const AFTER = "2026-07-17T05:00:01.000Z";

function activity(overrides: Record<string, unknown> = {}) {
  return {
    id: "activity_current",
    driverId: "driver_1",
    locationId: "location_1",
    status: "verified",
    amount: "12.34",
    verifiedAt: AT,
    createdAt: BEFORE,
    ...overrides,
  };
}

function obligationRepository(row: Record<string, unknown>) {
  const inserted: unknown[] = [];
  return {
    inserted,
    transaction: async (run: any) => run({
      findPaymentsByActivityId: async () => [],
      findActivityById: async () => row,
      findDriverById: async () => ({ id: "driver_1" }),
      findLocationById: async () => ({ id: "location_1", ownerId: "owner_1" }),
      findOwnerById: async () => ({ id: "owner_1", customPlatformFee: "5.00" }),
      findSystemSettings: async () => ({ platformWashoutFee: "5.00", financialHistoryCutoffAt: CUTOFF }),
      insertPendingObligation: async (input: unknown) => { inserted.push(input); return { id: "payment_1", ...(input as object) }; },
    }),
  };
}

function discoveryRecord(overrides: Record<string, unknown> = {}) {
  return {
    activity: activity(),
    payment: null,
    driver: { id: "driver_1", displayName: "Driver" },
    location: { id: "location_1", ownerId: "owner_1", name: "Facility" },
    facility: { id: "owner_1", name: "Facility", billingTimezone: "America/Chicago" },
    ...overrides,
  };
}

const filters = { page: 1, pageSize: 25, ageOrder: "oldest_first" as const };

test("uses COALESCE(verified_at, created_at) with an inclusive current cutoff boundary", () => {
  assert.equal(isHistoricalFinancialRecord({ verifiedAt: BEFORE, createdAt: AFTER }, CUTOFF), true);
  assert.equal(isHistoricalFinancialRecord({ verifiedAt: AT, createdAt: BEFORE }, CUTOFF), false);
  assert.equal(isCurrentFinancialRecord({ verifiedAt: AFTER, createdAt: BEFORE }, CUTOFF), true);
  assert.equal(isHistoricalFinancialRecord({ createdAt: BEFORE }, CUTOFF), true);
  assert.equal(effectiveFinancialTimestamp({ verifiedAt: AFTER, createdAt: BEFORE })?.toISOString(), AFTER);
});

test("historical activities cannot create current obligations or provider-preparation records", async () => {
  const fixture = obligationRepository(activity({ verifiedAt: BEFORE }));
  await assert.rejects(
    createFinancialObligationForVerifiedActivity("activity_historical", fixture as any),
    (error: unknown) => error instanceof FinancialObligationError && error.code === "historical_activity",
  );
  assert.equal(fixture.inserted.length, 0);
});

test("historical activities are excluded from current obligation and batch-discovery queues while audit-shaped records remain readable", async () => {
  const historical = discoveryRecord({ activity: activity({ id: "historical", verifiedAt: BEFORE }) });
  const current = discoveryRecord({ activity: activity({ id: "current", verifiedAt: AT }) });
  const repository = {
    getFinancialHistoryCutoff: async () => CUTOFF,
    listRecords: async () => [historical, current],
  };
  const missing = await listVerifiedActivitiesWithoutCanonicalObligations(filters, repository as any, new Date(AFTER));
  assert.equal(missing.items.length, 1);
  assert.equal(missing.items[0].activityReference, "activity_current");

  const unbatched = await listUnbatchedCanonicalObligations(filters, {
    ...repository,
    listRecords: async () => [
      discoveryRecord({ activity: activity({ id: "historical", verifiedAt: BEFORE }), payment: { id: "payment_old", activityId: "historical", driverId: "driver_1", ownerId: "owner_1", amount: "12.34", processingFee: "5.00", status: "pending", obligationKind: "canonical_verified_activity_v1", batchId: null, paidAt: null, createdAt: AT, hasTransferEvidence: false } }),
      discoveryRecord({ activity: activity({ id: "current", verifiedAt: AT }), payment: { id: "payment_current", activityId: "current", driverId: "driver_1", ownerId: "owner_1", amount: "12.34", processingFee: "5.00", status: "pending", obligationKind: "canonical_verified_activity_v1", batchId: null, paidAt: null, createdAt: AT, hasTransferEvidence: false } }),
    ],
  } as any, new Date(AFTER));
  assert.equal(unbatched.items.length, 1);
  assert.equal(unbatched.items[0].activityReference, "activity_current");
  assert.equal(historical.activity.id, "historical");
});

test("historical payments do not affect current receivables, wallet-style driver totals, or payout summaries", () => {
  const payments = [
    { id: "payment_old", ownerId: "owner_1", driverId: "driver_1", activityId: "activity_old", amount: "10.00", processingFee: "5.00", status: "pending", verifiedAt: BEFORE, createdAt: AFTER },
    { id: "payment_current", ownerId: "owner_1", driverId: "driver_1", activityId: "activity_current", amount: "12.00", processingFee: "5.00", status: "pending", verifiedAt: AT, createdAt: BEFORE },
  ];
  const ledger = buildOwnerWashoutBillingLedgerFromPayments({ ownerId: "owner_1", billingBatchId: "batch_1", payments, financialHistoryCutoffAt: CUTOFF });
  assert.deepEqual(ledger.washoutActivityIds, ["activity_current"]);
  assert.equal(ledger.driverTipTotalCents, 1200);
  assert.equal(ledger.ownerChargeAmountCents, 1700);
  const driver = getDriverTipSummaryFromPayments("driver_1", payments, CUTOFF);
  assert.equal(driver.driverTipTotalCents, 1200);
  assert.deepEqual(driver.washoutActivityIds, ["activity_current"]);
});
