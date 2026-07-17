import assert from "node:assert/strict";
import test from "node:test";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgres://user:pass@127.0.0.1:1/cretexchange_test";
process.env.JWT_SECRET = "test-only-jwt-secret-32-characters-minimum";

const {
  CANONICAL_VERIFIED_ACTIVITY_OBLIGATION_KIND,
} = await import("../server/financialObligations");
const {
  createAdminFinancialDiscoveryHandler,
  listCanonicalFinancialExceptions,
  listUnbatchedCanonicalObligations,
  listVerifiedActivitiesWithoutCanonicalObligations,
  parseFinancialDiscoveryFilters,
} = await import("../server/financialDiscovery");
const { createFinancialWorkspaceSelectionToken, resolveFinancialWorkspaceSelectionToken } = await import("../server/financialWorkspaceSelection");

const NOW = new Date("2026-07-16T12:00:00.000Z");

function record(overrides: Record<string, unknown> = {}) {
  const base: any = {
    activity: {
      id: "activity_1",
      status: "verified",
      amount: "12.34",
      verifiedAt: "2026-07-15T12:00:00.000Z",
      createdAt: "2026-07-15T11:00:00.000Z",
      driverId: "driver_1",
      locationId: "location_1",
    },
    payment: null,
    driver: { id: "driver_1", displayName: "Driver One" },
    location: { id: "location_1", ownerId: "owner_1", name: "North Facility" },
    facility: { id: "owner_1", name: "North Recovery", billingTimezone: "America/Chicago" },
  };
  return {
    ...base,
    ...overrides,
    activity: overrides.activity === null ? null : { ...base.activity, ...(overrides.activity as object || {}) },
    payment: overrides.payment === null ? null : overrides.payment ? {
      id: "payment_1",
      activityId: "activity_1",
      driverId: "driver_1",
      ownerId: "owner_1",
      amount: "12.34",
      processingFee: "5.00",
      status: "pending",
      obligationKind: CANONICAL_VERIFIED_ACTIVITY_OBLIGATION_KIND,
      batchId: null,
      paidAt: null,
      createdAt: "2026-07-15T12:05:00.000Z",
      hasExecutionIdentifiers: false,
      obligationCreatedBy: "admin_1",
      ...(overrides.payment as object),
    } : null,
  };
}

function repository(records: any[]) {
  const calls = { list: 0, insert: 0, update: 0, delete: 0, stripe: 0, treasury: 0, wallet: 0, batch: 0, reconciliation: 0 };
  return {
    calls,
    repository: {
      listRecords: async ({ facilityId, locationId }: any) => {
        calls.list += 1;
        return records.filter((item) =>
          (!facilityId || item.facility?.id === facilityId) &&
          (!locationId || item.location?.id === locationId));
      },
    },
  };
}

function filters(overrides: Record<string, unknown> = {}) {
  return { page: 1, pageSize: 25, ageOrder: "oldest_first", ...overrides } as any;
}

function responseSpy() {
  return {
    statusCode: 200,
    body: undefined as unknown,
    status(statusCode: number) { this.statusCode = statusCode; return this; },
    json(body: unknown) { this.body = body; return body; },
  };
}

test("includes only exactly verified activities with no financial row in the missing-obligation queue", async () => {
  const fixture = repository([
    record({ activity: { id: "oldest", verifiedAt: "2026-07-10T00:00:00.000Z" } }),
    record({ activity: { id: "pending", status: "pending" } }),
    record({ activity: { id: "rejected", status: "rejected" } }),
    record({ activity: { id: "legacy_alias", status: "approved" } }),
    record({ activity: { id: "canonical" }, payment: { id: "payment_canonical", activityId: "canonical" } }),
  ]);
  const result = await listVerifiedActivitiesWithoutCanonicalObligations(filters(), fixture.repository, NOW);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].classification, "missing_canonical_obligation");
  assert.equal(result.items[0].activityReference, "activity_oldest");
  assert.equal(resolveFinancialWorkspaceSelectionToken((result.items[0] as any).selectionToken, NOW.getTime()), "oldest");
});

test("selected Missing Obligations tokens are opaque, activity-bound, tamper-safe, and expire", () => {
  const issuedAt = NOW.getTime();
  const token = createFinancialWorkspaceSelectionToken("activity_private_uuid", issuedAt);
  assert.ok(token);
  assert.equal(token?.includes("activity_private_uuid"), false);
  assert.equal(resolveFinancialWorkspaceSelectionToken(token, issuedAt), "activity_private_uuid");
  assert.equal(resolveFinancialWorkspaceSelectionToken(`${token}x`, issuedAt), null);
  assert.equal(resolveFinancialWorkspaceSelectionToken(token, issuedAt + (15 * 60 * 1000)), null);
  assert.equal(resolveFinancialWorkspaceSelectionToken(token, issuedAt + (15 * 60 * 1000) + 1), null);
});

test("legacy, unknown, duplicate, malformed, and relationship-conflicted financial rows are exceptions, not missing work", async () => {
  const fixtures = [
    record({ payment: { obligationKind: null } }),
    record({ activity: { id: "unknown" }, payment: { id: "unknown_payment", activityId: "unknown", obligationKind: "future_model" } }),
    record({ activity: { id: "duplicate" }, payment: { id: "payment_a", activityId: "duplicate" } }),
    record({ activity: { id: "duplicate" }, payment: { id: "payment_b", activityId: "duplicate" } }),
    record({ activity: { id: "malformed" }, payment: { id: "bad_amount", activityId: "malformed", amount: "1.234" } }),
    record({ activity: { id: "missing_driver", driverId: "missing" }, driver: null }),
    record({ activity: { id: "missing_location", locationId: "missing" }, location: null }),
    record({ activity: { id: "missing_facility" }, facility: null }),
  ];
  const repo = repository(fixtures);
  const missing = await listVerifiedActivitiesWithoutCanonicalObligations(filters(), repo.repository, NOW);
  assert.equal(missing.items.length, 0);
  const exceptions = await listCanonicalFinancialExceptions(filters(), repo.repository, NOW);
  const categories = new Set(exceptions.items.map((item: any) => item.exceptionCategory));
  for (const category of ["legacy_payment_conflict", "unknown_obligation_version", "duplicate_activity_linked_financial_rows", "invalid_frozen_driver_incentive", "missing_driver_relationship", "missing_location_relationship", "missing_facility_relationship"]) {
    assert.ok(categories.has(category));
  }
});

test("unbatched queue accepts only a canonical, pending, clean obligation and preserves separate cents", async () => {
  const fixture = repository([record({ payment: { amount: "12.34", processingFee: "5.00" } })]);
  const result = await listUnbatchedCanonicalObligations(filters(), fixture.repository, NOW);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].frozenDriverIncentiveCents, 1234);
  assert.equal(result.items[0].frozenPlatformFeeCents, 500);
  assert.equal(result.items[0].facilityChargeCents, 1734);
  assert.equal(result.items[0].periodEligibility, "unavailable");
  assert.equal(result.items[0].batchMembershipState, "unbatched_provisional");
});

test("legacy, unknown, non-pending, batch-linked, execution-contaminated, malformed, and invalid-timezone obligations never enter unbatched", async () => {
  const records = [
    record({ activity: { id: "legacy" }, payment: { id: "legacy_p", activityId: "legacy", obligationKind: null } }),
    record({ activity: { id: "unknown" }, payment: { id: "unknown_p", activityId: "unknown", obligationKind: "other" } }),
    record({ activity: { id: "paid" }, payment: { id: "paid_p", activityId: "paid", status: "paid" } }),
    record({ activity: { id: "batch" }, payment: { id: "batch_p", activityId: "batch", batchId: "legacy_batch" } }),
    record({ activity: { id: "execution" }, payment: { id: "execution_p", activityId: "execution", hasExecutionIdentifiers: true } }),
    record({ activity: { id: "fee" }, payment: { id: "fee_p", activityId: "fee", processingFee: "broken" } }),
    record({ activity: { id: "timezone" }, payment: { id: "timezone_p", activityId: "timezone" }, facility: { id: "owner_1", name: "North", billingTimezone: "Not/A_Timezone" } }),
  ];
  const repo = repository(records);
  const result = await listUnbatchedCanonicalObligations(filters(), repo.repository, NOW);
  assert.equal(result.items.length, 0);
  const exceptions = await listCanonicalFinancialExceptions(filters(), repo.repository, NOW);
  const categories = new Set(exceptions.items.map((item: any) => item.exceptionCategory));
  for (const category of ["legacy_payment_conflict", "unknown_obligation_version", "canonical_obligation_not_pending", "unexpected_batch_link", "pending_obligation_has_execution_fields", "invalid_platform_fee", "invalid_facility_billing_timezone"]) {
    assert.ok(categories.has(category));
  }
});

test("activity no longer verified, missing timestamps, and orphaned payments are safely quarantined", async () => {
  const repo = repository([
    record({ activity: { status: "rejected" }, payment: { id: "rejected_payment" } }),
    record({ activity: { id: "no_timestamp", verifiedAt: null }, payment: null }),
    record({ activity: null, payment: { id: "orphan", activityId: "gone" }, driver: null, location: null, facility: null }),
  ]);
  const exceptions = await listCanonicalFinancialExceptions(filters(), repo.repository, NOW);
  const categories = new Set(exceptions.items.map((item: any) => item.exceptionCategory));
  assert.ok(categories.has("activity_no_longer_verified"));
  assert.ok(categories.has("missing_activity_relationship"));
  assert.ok(categories.has("missing_verification_timestamp"));
  // A verified row without a timestamp is not fabricated as age zero or normal work.
  assert.equal((await listVerifiedActivitiesWithoutCanonicalObligations(filters(), repo.repository, NOW)).items.length, 0);
});

test("responses use whitelisted safe projections and omit provider, bank, notes, evidence, GPS, and contact data", async () => {
  const poisoned = record({ payment: { stripePaymentIntentId: "pi_secret", bankAccount: "bank_secret", notes: "private" } }) as any;
  poisoned.driver.email = "driver@example.com";
  poisoned.driver.phone = "555-0100";
  poisoned.location.latitude = "1";
  poisoned.location.longitude = "2";
  poisoned.activity.photoUrls = ["private"];
  const repo = repository([poisoned]);
  const output = JSON.stringify(await listUnbatchedCanonicalObligations(filters(), repo.repository, NOW));
  for (const secret of ["pi_secret", "bank_secret", "private", "driver@example.com", "555-0100", '"latitude"', '"longitude"']) {
    assert.doesNotMatch(output, new RegExp(secret.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("oldest-first pagination is stable, bounded, filterable, and has no duplicate page rows", async () => {
  const rows = [
    record({ activity: { id: "newer", verifiedAt: "2026-07-14T12:00:00.000Z" } }),
    record({ activity: { id: "older", verifiedAt: "2026-07-10T12:00:00.000Z" } }),
    record({ activity: { id: "other_facility" }, facility: { id: "owner_2", name: "South", billingTimezone: "America/Chicago" }, location: { id: "location_2", ownerId: "owner_2", name: "South Location" } }),
  ];
  const repo = repository(rows);
  const first = await listVerifiedActivitiesWithoutCanonicalObligations(filters({ pageSize: 1 }), repo.repository, NOW);
  const second = await listVerifiedActivitiesWithoutCanonicalObligations(filters({ page: 2, pageSize: 1 }), repo.repository, NOW);
  assert.equal(first.items[0].activityReference, "activity_older");
  assert.equal(second.items[0].activityReference, "activity_newer");
  assert.notEqual(first.items[0].activityReference, second.items[0].activityReference);
  const newest = await listVerifiedActivitiesWithoutCanonicalObligations(filters({ pageSize: 1, ageOrder: "newest_first", facilityId: "owner_1" }), repo.repository, NOW);
  assert.equal(newest.items[0].activityReference, "activity_newer");
  const filtered = await listVerifiedActivitiesWithoutCanonicalObligations(filters({ facilityId: "owner_2" }), repo.repository, NOW);
  assert.equal(filtered.items.length, 1);
  assert.equal(filtered.items[0].activityReference, "activity_facility");
  const locationFiltered = await listVerifiedActivitiesWithoutCanonicalObligations(filters({ locationId: "location_2" }), repo.repository, NOW);
  assert.equal(locationFiltered.items.length, 1);
  assert.equal(locationFiltered.items[0].activityReference, "activity_facility");
  assert.equal(parseFinancialDiscoveryFilters({ limit: "100" }).pageSize, 100);
  assert.throws(() => parseFinancialDiscoveryFilters({ page: "0" }));
  assert.throws(() => parseFinancialDiscoveryFilters({ limit: "101" }));
  assert.throws(() => parseFinancialDiscoveryFilters({ sort: "recent" }));
  assert.throws(() => parseFinancialDiscoveryFilters({ facilityId: "" }));
});

test("read-only discovery invokes only the repository read and cannot call financial mutation dependencies", async () => {
  const fixture = repository([record()]);
  await Promise.all([
    listVerifiedActivitiesWithoutCanonicalObligations(filters(), fixture.repository, NOW),
    listUnbatchedCanonicalObligations(filters(), fixture.repository, NOW),
    listCanonicalFinancialExceptions(filters(), fixture.repository, NOW),
  ]);
  assert.equal(fixture.calls.list, 3);
  assert.deepEqual({ insert: fixture.calls.insert, update: fixture.calls.update, delete: fixture.calls.delete, stripe: fixture.calls.stripe, treasury: fixture.calls.treasury, wallet: fixture.calls.wallet, batch: fixture.calls.batch, reconciliation: fixture.calls.reconciliation }, { insert: 0, update: 0, delete: 0, stripe: 0, treasury: 0, wallet: 0, batch: 0, reconciliation: 0 });
});

test("endpoint authorization denies unauthenticated Drivers and Facilities, allows admin and super-admin, and rejects invalid filters", async () => {
  const roles: Record<string, string> = { driver: "driver", facility: "owner", observer: "support", admin: "admin", super: "super_admin" };
  let listCalls = 0;
  for (const [actorId, role] of Object.entries(roles)) {
    const handler = createAdminFinancialDiscoveryHandler({
      getUser: async (id) => ({ id, role: roles[id] }),
      list: async () => {
        listCalls += 1;
        return { items: [], pagination: { page: 1, pageSize: 25, total: 0, totalPages: 0, hasMore: false, totalScope: "bounded_scan" as const }, filters: { facilityId: null, locationId: null, sort: "oldest_first" as const }, generatedAt: NOW.toISOString() };
      },
      route: "GET /api/admin/financial-obligations/missing",
    });
    const res = responseSpy();
    await handler({ user: { id: actorId }, query: {} }, res);
    assert.equal(res.statusCode, role === "admin" || role === "super_admin" ? 200 : 403);
  }
  assert.equal(listCalls, 2);
  const unauthenticated = responseSpy();
  await createAdminFinancialDiscoveryHandler({ getUser: async () => null, list: async () => { throw new Error("not called"); }, route: "test" })({}, unauthenticated);
  assert.equal(unauthenticated.statusCode, 401);
  const invalid = responseSpy();
  await createAdminFinancialDiscoveryHandler({ getUser: async () => ({ id: "admin", role: "admin" }), list: async () => { throw new Error("not called"); }, route: "test" })({ user: { id: "admin" }, query: { limit: "999" } }, invalid);
  assert.equal(invalid.statusCode, 400);
  const unavailable = responseSpy();
  await createAdminFinancialDiscoveryHandler({ getUser: async () => ({ id: "admin", role: "admin" }), list: async () => { throw new Error("database unavailable"); }, route: "test" })({ user: { id: "admin" }, query: {} }, unavailable);
  assert.equal(unavailable.statusCode, 503);
  assert.equal((unavailable.body as { code: string }).code, "FINANCIAL_DISCOVERY_UNAVAILABLE");
});
