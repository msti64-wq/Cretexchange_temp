import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgres://user:pass@127.0.0.1:1/cretexchange_test";
process.env.JWT_SECRET = "test-only-jwt-secret-32-characters-minimum";
process.env.SESSION_SECRET = "test-only-session-secret";
process.env.STRIPE_SECRET_KEY = "sk_test_unit_test_secret";
process.env.PRIVATE_OBJECT_DIR = "private";
process.env.PUBLIC_OBJECT_SEARCH_PATHS = "public";

const {
  FinancialObligationError,
  CANONICAL_VERIFIED_ACTIVITY_OBLIGATION_KIND,
  createFinancialObligationForVerifiedActivity,
  isPlatformFinancialOperationsRole,
  parseFrozenActivityIncentiveCents,
  buildCanonicalObligationCreationReason,
} = await import("../server/financialObligations");
const { storage } = await import("../server/storage");
const { registerRoutes } = await import("../server/routes");
const { isAuthenticated } = await import("../server/tokenAuth");

type StoredPayment = {
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
  obligationCreatedBy?: string | null;
  obligationCreationReason?: string | null;
  obligationKind?: string | null;
};

function repositoryFixture(options: {
  activity?: Partial<{ id: string; driverId: string; locationId: string; status: string; amount: string | number | null }> | null;
  driver?: boolean;
  location?: boolean;
  owner?: boolean;
  ownerFee?: string | null;
  systemFee?: string | null;
  existing?: StoredPayment[];
} = {}) {
  const records = (options.existing || []).map((record) => ({
    ...record,
    obligationKind: Object.prototype.hasOwnProperty.call(record, "obligationKind")
      ? record.obligationKind
      : CANONICAL_VERIFIED_ACTIVITY_OBLIGATION_KIND,
  }));
  let nextId = 1;
  const activity = options.activity === null ? null : {
    id: "activity_1",
    driverId: "driver_1",
    locationId: "location_1",
    status: "verified",
    amount: "12.34",
    ...options.activity,
  };
  const calls = { stripe: 0, transfer: 0, payout: 0, billing: 0, wallet: 0, withdrawal: 0, insert: 0 };
  return {
    records,
    calls,
    repository: {
      transaction: async (run: any) => run({
        findPaymentsByActivityId: async (activityId: string) => records.filter((record) => record.activityId === activityId),
        findActivityById: async (activityId: string) => activity?.id === activityId ? activity : null,
        findDriverById: async (driverId: string) => options.driver === false || driverId !== "driver_1" ? null : { id: driverId },
        findLocationById: async (locationId: string) => options.location === false || locationId !== "location_1" ? null : { id: locationId, ownerId: "owner_1" },
        findOwnerById: async (ownerId: string) => options.owner === false || ownerId !== "owner_1" ? null : { id: ownerId, customPlatformFee: options.ownerFee ?? null },
        findSystemSettings: async () => options.systemFee === undefined ? { platformWashoutFee: "5.00" } : options.systemFee === null ? null : { platformWashoutFee: options.systemFee },
        insertPendingObligation: async (input: Omit<StoredPayment, "id">) => {
          calls.insert += 1;
          if (records.some((record) => record.activityId === input.activityId)) return null;
          const payment: StoredPayment = { ...input, id: `payment_${nextId++}` };
          records.push(payment);
          return payment;
        },
      }),
    },
  };
}

async function expectCode(promise: Promise<unknown>, code: string) {
  await assert.rejects(promise, (error: any) => error instanceof FinancialObligationError && error.code === code);
}

function createResponse() {
  return {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
  };
}

async function withStoragePatch(patch: Record<string, unknown>, run: () => Promise<void>) {
  const original = new Map<string, unknown>();
  for (const [key, value] of Object.entries(patch)) {
    original.set(key, (storage as any)[key]);
    (storage as any)[key] = value;
  }
  try {
    await run();
  } finally {
    for (const [key, value] of original) (storage as any)[key] = value;
  }
}

async function getObligationRoute() {
  const posts = new Map<string, Array<(req: any, res: any) => Promise<unknown>>>();
  const app = {
    get() {}, post(path: string, ...handlers: Array<(req: any, res: any) => Promise<unknown>>) { posts.set(path, handlers); }, put() {}, delete() {}, patch() {}, use() {},
  };
  await registerRoutes(app as never);
  const handlers = posts.get("/api/admin/financial-obligations/activities/:id");
  assert.ok(handlers && handlers.length >= 2);
  return handlers!;
}

test("runtime preview repository selects a pre-0020-safe projection and avoids unknown provider columns", () => {
  const source = readFileSync(new URL("../server/financialObligations.ts", import.meta.url), "utf8");
  const repository = source.slice(source.indexOf("export function createDatabaseFinancialObligationRepository"));
  const paymentLookup = repository.slice(repository.indexOf("findPaymentsByActivityId"), repository.indexOf("findActivityById"));
  assert.match(paymentLookup, /tx\.select\(\{/);
  assert.doesNotMatch(paymentLookup, /select\(\)\.from\(payments\)/);
  assert.doesNotMatch(paymentLookup, /obligationCreatedBy:\s*payments\.obligationCreatedBy/);
  assert.doesNotMatch(paymentLookup, /obligationCreationReason:\s*payments\.obligationCreationReason/);
  assert.doesNotMatch(paymentLookup, /stripePaymentIntentId:\s*payments\.stripePaymentIntentId/);
  assert.doesNotMatch(paymentLookup, /stripeChargeId:\s*payments\.stripeChargeId/);
  assert.match(repository, /onConflictDoNothing\(\{ target: payments\.activityId \}\)/);
});

test("actual route registration authorizes preview before opaque token resolution and logs only safe runtime metadata", { concurrency: false }, async () => {
  const gets = new Map<string, Array<(req: any, res: any) => Promise<unknown>>>();
  const app = { get(path: string, ...handlers: Array<(req: any, res: any) => Promise<unknown>>) { gets.set(path, handlers); }, post() {}, put() {}, delete() {}, patch() {}, use() {} };
  await registerRoutes(app as never);
  const handlers = gets.get("/api/admin/financial-obligations/preview/:selectionToken");
  assert.ok(handlers && handlers.length >= 2);
  assert.equal(handlers![0], isAuthenticated);
  await withStoragePatch({ getUser: async () => ({ id: "driver_1", role: "driver" }) }, async () => {
    const response = createResponse();
    await handlers![1]({ user: { id: "driver_1" }, params: { selectionToken: "opaque" } }, response);
    assert.equal(response.statusCode, 403);
  });
  const source = readFileSync(new URL("../server/routes.ts", import.meta.url), "utf8");
  const start = source.indexOf("app.get('/api/admin/financial-obligations/preview/:selectionToken'");
  const end = source.indexOf("app.post('/api/admin/financial-obligations/create'", start);
  const route = source.slice(start, end);
  assert.match(route, /requireFinancialOperationsActor/);
  assert.match(route, /resolveFinancialWorkspaceSelectionToken/);
  assert.match(route, /previewFinancialObligationForVerifiedActivity/);
  assert.match(source, /FINANCIAL_OBLIGATION_UNAVAILABLE/);
  assert.doesNotMatch(source.slice(source.indexOf("const financialObligationErrorResponse"), start), /selectionToken.*console\.error|console\.error.*selectionToken/);
});

test("runtime capability reporting is admin-only and creation fails closed before a payment write", () => {
  const source = readFileSync(new URL("../server/routes.ts", import.meta.url), "utf8");
  const start = source.indexOf("app.get('/api/admin/financial-workspace/capabilities'");
  const end = source.indexOf("app.get('/api/admin/financial-obligations/preview", start);
  const capabilityRoute = source.slice(start, end);
  const createStart = source.indexOf("app.post('/api/admin/financial-obligations/create'");
  const createEnd = source.indexOf("app.post('/api/admin/financial-obligations/activities/:id'", createStart);
  const createRoute = source.slice(createStart, createEnd);
  assert.match(capabilityRoute, /requireFinancialOperationsActor/);
  assert.match(capabilityRoute, /creationAvailable/);
  assert.match(createRoute, /getFinancialSchemaCapabilities/);
  assert.match(createRoute, /financialAuditSchemaUnavailable/);
  assert.ok(createRoute.indexOf("financialAuditSchemaUnavailable") < createRoute.indexOf("createFinancialObligationForVerifiedActivity"));
});

test("creates one unpaid obligation from the verified activity's frozen amount", async () => {
  const fixture = repositoryFixture();
  const result = await createFinancialObligationForVerifiedActivity("activity_1", fixture.repository, { actorUserId: "admin_1", reason: "verified activity review" });

  assert.equal(result.created, true);
  assert.equal(result.obligation.status, "pending");
  assert.equal(result.obligation.obligationKind, CANONICAL_VERIFIED_ACTIVITY_OBLIGATION_KIND);
  assert.equal(result.obligation.amount, "12.34");
  assert.equal(result.obligation.processingFee, "5.00");
  assert.equal(result.obligation.washoutServiceFee, "12.34");
  assert.equal(result.obligation.batchId, null);
  assert.equal(result.obligation.paidAt, null);
  assert.equal(result.obligation.obligationCreatedBy, "admin_1");
  assert.equal(result.obligation.obligationCreationReason, "verified activity review");
  assert.equal(result.driverIncentiveCents, 1234);
  assert.equal(result.platformFeeCents, 500);
  assert.equal(result.facilityChargeCents, 1734);
  assert.deepEqual(fixture.calls, { stripe: 0, transfer: 0, payout: 0, billing: 0, wallet: 0, withdrawal: 0, insert: 1 });
});

test("PD-054 accepts only the safe structured reason category and server-controlled prefix", () => {
  assert.equal(buildCanonicalObligationCreationReason("missing_canonical_obligation", "Reviewed the queue and found no conflicting canonical obligation."), "[missing_canonical_obligation] Reviewed the queue and found no conflicting canonical obligation.");
  assert.match(buildCanonicalObligationCreationReason("missing_canonical_obligation", "Revisé la cola y no encontré una obligación canónica en conflicto."), /^\[missing_canonical_obligation\]/);
  for (const detail of ["fix", "billing issue", "fix, FIX; fix! fix", "too short", "Reviewed pi_secret_123 and found no conflict in this activity.", "<script>alert(1)</script> reviewed this queue item properly"]) {
    assert.throws(() => buildCanonicalObligationCreationReason("missing_canonical_obligation", detail), FinancialObligationError);
  }
  assert.throws(() => buildCanonicalObligationCreationReason("adjustment", "Reviewed the queue and found no conflicting canonical obligation."), FinancialObligationError);
});

test("uses authoritative owner fee precedence and does not add it to the driver incentive", async () => {
  const fixture = repositoryFixture({ ownerFee: "2.50", systemFee: "9.99" });
  const result = await createFinancialObligationForVerifiedActivity("activity_1", fixture.repository);
  assert.equal(result.obligation.amount, "12.34");
  assert.equal(result.obligation.processingFee, "2.50");
  assert.equal(result.driverIncentiveCents, 1234);
  assert.equal(result.platformFeeCents, 250);
  assert.equal(result.facilityChargeCents, 1484);
});

test("uses the system fee only when no owner override exists, then intentionally falls back to 500 cents", async () => {
  const systemFixture = repositoryFixture({ systemFee: "3.75" });
  const systemResult = await createFinancialObligationForVerifiedActivity("activity_1", systemFixture.repository);
  assert.equal(systemResult.platformFeeCents, 375);

  const defaultFixture = repositoryFixture({ systemFee: null });
  const defaultResult = await createFinancialObligationForVerifiedActivity("activity_1", defaultFixture.repository);
  assert.equal(defaultResult.platformFeeCents, 500);
});

test("does not reread a mutable facility rate because only the activity amount is provided to the service", async () => {
  const fixture = repositoryFixture({ activity: { amount: "7.25" } });
  const result = await createFinancialObligationForVerifiedActivity("activity_1", fixture.repository);
  assert.equal(result.driverIncentiveCents, 725);
  assert.equal(result.obligation.amount, "7.25");
});

test("denies non-verified activities and incomplete relationships", async () => {
  for (const status of ["pending", "rejected", "approved", "completed", "submitted"] as const) {
    await expectCode(createFinancialObligationForVerifiedActivity("activity_1", repositoryFixture({ activity: { status } }).repository), "activity_not_verified");
  }
  await expectCode(createFinancialObligationForVerifiedActivity("activity_1", repositoryFixture({ activity: null }).repository), "activity_not_found");
  await expectCode(createFinancialObligationForVerifiedActivity("activity_1", repositoryFixture({ driver: false }).repository), "driver_not_found");
  await expectCode(createFinancialObligationForVerifiedActivity("activity_1", repositoryFixture({ location: false }).repository), "location_not_found");
  await expectCode(createFinancialObligationForVerifiedActivity("activity_1", repositoryFixture({ owner: false }).repository), "owner_not_found");
});

test("rejects malformed, negative, or fractional-cent frozen amounts without a fallback", async () => {
  for (const amount of [null, "", "abc", "-1.00", "1.001", "1e2"] as const) {
    await expectCode(createFinancialObligationForVerifiedActivity("activity_1", repositoryFixture({ activity: { amount } }).repository), "invalid_frozen_activity_amount");
  }
  assert.equal(parseFrozenActivityIncentiveCents("1"), 100);
  assert.equal(parseFrozenActivityIncentiveCents("175"), 17500);
});

test("rejects malformed, negative, or fractional-cent authoritative platform fees instead of normalizing them", async () => {
  for (const ownerFee of ["bad", "-5.00", "1.001"] as const) {
    await expectCode(createFinancialObligationForVerifiedActivity("activity_1", repositoryFixture({ ownerFee }).repository), "invalid_platform_fee");
  }
  for (const systemFee of ["bad", "-5.00", "1.001"] as const) {
    await expectCode(createFinancialObligationForVerifiedActivity("activity_1", repositoryFixture({ systemFee }).repository), "invalid_platform_fee");
  }
  const zeroFee = await createFinancialObligationForVerifiedActivity("activity_1", repositoryFixture({ ownerFee: "0" }).repository);
  assert.equal(zeroFee.platformFeeCents, 0);
});

test("is idempotent for a canonical pending obligation and rejects legacy duplicate or processed states", async () => {
  const fixture = repositoryFixture();
  const first = await createFinancialObligationForVerifiedActivity("activity_1", fixture.repository, { actorUserId: "admin_original", reason: "original review" });
  const repeated = await createFinancialObligationForVerifiedActivity("activity_1", fixture.repository, { actorUserId: "admin_retry", reason: "retry must not overwrite" });
  assert.equal(repeated.created, false);
  assert.equal(repeated.obligation.id, first.obligation.id);
  assert.equal(repeated.obligation.obligationCreatedBy, "admin_original");
  assert.equal(repeated.obligation.obligationCreationReason, "original review");
  assert.equal(fixture.records.length, 1);

  await expectCode(createFinancialObligationForVerifiedActivity("activity_1", repositoryFixture({ existing: [{ ...first.obligation, status: "paid" }] }).repository), "existing_financial_state_requires_review");
  await expectCode(createFinancialObligationForVerifiedActivity("activity_1", repositoryFixture({ existing: [{ ...first.obligation, obligationKind: null }] }).repository), "existing_financial_state_requires_review");
  await expectCode(createFinancialObligationForVerifiedActivity("activity_1", repositoryFixture({ existing: [first.obligation, { ...first.obligation, id: "duplicate" }] }).repository), "duplicate_financial_obligation");
});

test("concurrent generation produces one obligation and no side records", async () => {
  const fixture = repositoryFixture();
  const [left, right] = await Promise.all([
    createFinancialObligationForVerifiedActivity("activity_1", fixture.repository),
    createFinancialObligationForVerifiedActivity("activity_1", fixture.repository),
  ]);
  assert.equal(fixture.records.length, 1);
  assert.equal(left.obligation.id, right.obligation.id);
  assert.deepEqual(fixture.calls, { stripe: 0, transfer: 0, payout: 0, billing: 0, wallet: 0, withdrawal: 0, insert: 2 });
});

test("financial obligation generation is admin-only and legacy raw-activity creation is fenced", () => {
  assert.equal(isPlatformFinancialOperationsRole("admin"), true);
  assert.equal(isPlatformFinancialOperationsRole("super_admin"), true);
  assert.equal(isPlatformFinancialOperationsRole("owner"), false);
  assert.equal(isPlatformFinancialOperationsRole("driver"), false);

  const routes = readFileSync(new URL("../server/routes.ts", import.meta.url), "utf8");
  const start = routes.indexOf("app.post('/api/admin/financial-obligations/activities/:id', isAuthenticated");
  const end = routes.indexOf("app.post", start + 10);
  const handler = routes.slice(start, end === -1 ? undefined : end);
  assert.match(handler, /isAuthenticated/);
  assert.match(handler, /isPlatformFinancialOperationsRole/);
  assert.match(handler, /selected_record_required/);
  assert.doesNotMatch(handler, /createFinancialObligationForVerifiedActivity/);
  for (const forbidden of ["paymentIntents.create", "charges.create", "transfers.create", "payouts.create", "processDailyBatches", "processOwnerBillingRun", "adjustDriverWalletBalance", "createWalletTransaction", "createWithdrawal"]) {
    assert.doesNotMatch(handler, new RegExp(forbidden.replace(/[.()]/g, "\\$&")));
  }
});

test("the retired raw-ID route retains authentication, rejects participant roles, and performs no creation", { concurrency: false }, async () => {
  const [authMiddleware, handler] = await getObligationRoute();
  const unauthenticated = createResponse();
  let nextCalled = false;
  await isAuthenticated(
    { method: "POST", path: "/api/admin/financial-obligations/activities/activity_1", headers: {} } as any,
    unauthenticated as any,
    () => { nextCalled = true; },
  );
  assert.equal(authMiddleware, isAuthenticated);
  assert.equal(unauthenticated.statusCode, 401);
  assert.equal(nextCalled, false);

  for (const role of ["driver", "owner"] as const) {
    await withStoragePatch({ getUser: async () => ({ id: `${role}_1`, role }) }, async () => {
      const response = createResponse();
      await handler({ user: { id: `${role}_1` }, params: { id: "activity_1" }, body: { reasonCategory: "missing_canonical_obligation", supportingDetail: "Reviewed the queue and found no conflicting canonical obligation." } }, response);
      assert.equal(response.statusCode, 403);
    });
  }

  await withStoragePatch({ getUser: async () => ({ id: "admin_1", role: "admin" }) }, async () => {
    const response = createResponse();
    await handler({ user: { id: "admin_1" }, params: { id: "activity_1" }, body: { reasonCategory: "missing_canonical_obligation", supportingDetail: "fix" } }, response);
    assert.equal(response.statusCode, 410);
    assert.deepEqual(response.body, { message: "Use a selected Missing Obligations record to create a canonical obligation.", code: "selected_record_required" });
  });
});

test("the migration refuses legacy duplicates before adding the database uniqueness boundary", () => {
  const migration = readFileSync(new URL("../migrations/0020_unique_payment_obligation_per_activity.sql", import.meta.url), "utf8");
  assert.match(migration, /GROUP BY activity_id/);
  assert.match(migration, /HAVING COUNT\(\*\) > 1/);
  assert.match(migration, /RAISE EXCEPTION/);
  assert.match(migration, /obligation_created_by/);
  assert.match(migration, /obligation_creation_reason/);
  assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS "uniq_payments_activity_obligation"/);
});
