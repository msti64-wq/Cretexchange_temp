import assert from "node:assert/strict";
import test from "node:test";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgres://user:pass@127.0.0.1:1/cretexchange_test";
process.env.JWT_SECRET = "test-only-jwt-secret-32-characters-minimum";

const { CANONICAL_VERIFIED_ACTIVITY_OBLIGATION_KIND } = await import("../server/financialObligations");
const {
  CANONICAL_FINANCIAL_BATCH_MODEL_VERSION,
  CanonicalBatchDraftError,
  calculateCanonicalDateRangePeriod,
  calculateCanonicalWeeklyPeriod,
  createAdminFinancialBatchDraftHandler,
  createAdminFinancialBatchPreviewHandler,
  createAdminFinancialBatchListHandler,
  createCanonicalFinancialBatchDraft,
  previewCanonicalFinancialBatchSelection,
} = await import("../server/financialBatchDrafts");

const PERIOD_ANCHOR = "2026-07-15T18:00:00.000Z";

function candidate(overrides: Record<string, any> = {}) {
  const base = {
    payment: {
      id: "payment_1", activityId: "activity_1", driverId: "driver_1", ownerId: "owner_1",
      amount: "12.34", processingFee: "5.00", status: "pending",
      obligationKind: CANONICAL_VERIFIED_ACTIVITY_OBLIGATION_KIND, batchId: null, paidAt: null,
      createdAt: "2026-07-14T12:00:00.000Z", hasExecutionIdentifiers: false,
    },
    activity: { id: "activity_1", driverId: "driver_1", locationId: "location_1", status: "verified", verifiedAt: "2026-07-14T11:00:00.000Z" },
    driver: { id: "driver_1" },
    location: { id: "location_1", ownerId: "owner_1", name: "North Facility" },
    facility: { id: "owner_1", name: "North Recovery", billingTimezone: "America/Chicago" },
    activeMembershipId: null,
  };
  return {
    ...base,
    ...overrides,
    payment: { ...base.payment, ...(overrides.payment || {}) },
    activity: overrides.activity === null ? null : { ...base.activity, ...(overrides.activity || {}) },
    driver: overrides.driver === null ? null : { ...base.driver, ...(overrides.driver || {}) },
    location: overrides.location === null ? null : { ...base.location, ...(overrides.location || {}) },
    facility: overrides.facility === null ? null : { ...base.facility, ...(overrides.facility || {}) },
  };
}

function inMemoryRepository(seed: any[], financialHistoryCutoffAt?: string) {
  const batches = new Map<string, any>();
  const idempotency = new Map<string, any>();
  const memberships = new Map<string, any>();
  const events: any[] = [];
  const exceptions: any[] = [];
  let transactionTail = Promise.resolve();
  const state = { batches, memberships, events, exceptions, writes: { providers: 0, wallets: 0, execution: 0, legacyBatchLinks: 0 } };
  const repo: any = {
    async transaction(run: any) {
      // Serializing the in-memory transaction emulates the database uniqueness
      // boundary used by the real partial active-membership index.
      const prior = transactionTail;
      let release!: () => void;
      transactionTail = new Promise<void>((resolve) => { release = resolve; });
      await prior;
      try {
        return await run({
          findBatchByIdempotencyKey: async (key: string) => idempotency.get(key) || null,
          findBatchByFacilityPeriod: async (ownerId: string, periodStart: Date, periodEnd: Date) => Array.from(batches.values()).find((batch: any) => batch.ownerId === ownerId && batch.period.start.getTime() === periodStart.getTime() && batch.period.end.getTime() === periodEnd.getTime()) || null,
          listCandidates: async (ownerId: string) => seed.filter((row) => row.facility?.id === ownerId),
          getFinancialHistoryCutoff: async () => financialHistoryCutoffAt,
          createDraftBatch: async (input: any) => {
            if (Array.from(batches.values()).some((batch: any) => batch.ownerId === input.ownerId && batch.period.start.getTime() === input.period.start.getTime())) throw new Error("period conflict");
            batches.set(input.id, input); idempotency.set(input.idempotencyKey, input); return input;
          },
          claimMemberships: async (batch: any, inputs: any[]) => {
            for (const membership of inputs) {
              if (memberships.has(membership.paymentId)) throw new Error("active membership conflict");
            }
            inputs.forEach((membership) => memberships.set(membership.paymentId, { ...membership, batchId: batch.id }));
          },
          appendAuditEvents: async (batch: any, claimed: any[], actor: any, reason: string) => {
            events.push({ batchId: batch.id, actor, reason, eventType: "draft_created" });
            claimed.forEach((membership) => events.push({ batchId: batch.id, actor, reason, eventType: "obligation_joined", paymentId: membership.paymentId }));
          },
          recordExceptions: async (items: any[]) => { exceptions.push(...items); },
        });
      } finally { release(); }
    },
    listBatches: async () => Array.from(batches.values()),
    findBatchDetail: async () => null,
  };
  return { repo, state };
}

function request(overrides: Record<string, unknown> = {}) {
  return { facilityId: "owner_1", fromDate: "2026-07-12", throughDate: "2026-07-18", idempotencyKey: "draft-owner-1-range-20260712-20260718", reason: "Create pilot draft after canonical obligation review", ...overrides } as any;
}

const actor = { actorUserId: "admin_1", actorRole: "admin" };

test("constructs a non-executing canonical draft with frozen membership totals and append-only audit", async () => {
  const second = candidate({ payment: { id: "payment_2", activityId: "activity_2", amount: "7.66", processingFee: "2.00", createdAt: "2026-07-13T12:00:00.000Z" }, activity: { id: "activity_2" } });
  const otherFacility = candidate({ payment: { id: "other_payment", activityId: "other_activity", ownerId: "owner_2" }, activity: { id: "other_activity" }, location: { ownerId: "owner_2" }, facility: { id: "owner_2", billingTimezone: "America/Chicago" } });
  const fixture = inMemoryRepository([candidate(), second, otherFacility]);
  const result = await createCanonicalFinancialBatchDraft(request(), actor, fixture.repo);
  assert.equal(result.created, true);
  assert.equal(result.batch.modelVersion, CANONICAL_FINANCIAL_BATCH_MODEL_VERSION);
  assert.equal(result.batch.state, "draft");
  assert.equal(result.batch.obligationCount, 2);
  assert.equal(result.batch.frozenDriverIncentiveCents, 2000);
  assert.equal(result.batch.frozenPlatformFeeCents, 700);
  assert.equal(result.batch.frozenFacilityChargeCents, 2700);
  assert.equal(fixture.state.memberships.size, 2);
  assert.deepEqual(fixture.state.events.map((event: any) => event.eventType), ["draft_created", "obligation_joined", "obligation_joined"]);
  assert.deepEqual(fixture.state.writes, { providers: 0, wallets: 0, execution: 0, legacyBatchLinks: 0 });
});

test("retries are deterministic and a concurrent Facility-period request cannot create duplicate batches or memberships", async () => {
  const fixture = inMemoryRepository([candidate()]);
  const [first, second] = await Promise.all([
    createCanonicalFinancialBatchDraft(request(), actor, fixture.repo),
    createCanonicalFinancialBatchDraft(request(), actor, fixture.repo),
  ]);
  assert.equal(first.batch.id, second.batch.id);
  assert.equal([first.created, second.created].filter(Boolean).length, 1);
  assert.equal(fixture.state.batches.size, 1);
  assert.equal(fixture.state.memberships.size, 1);
  const periodRetry = await createCanonicalFinancialBatchDraft(request({ idempotencyKey: "different-key-same-period" }), actor, fixture.repo);
  assert.equal(periodRetry.batch.id, first.batch.id);
  assert.equal(periodRetry.created, false);
});

test("uses Facility-local Sunday boundaries and handles spring and fall DST weeks without fixed-hour assumptions", () => {
  const spring = calculateCanonicalWeeklyPeriod("2026-03-10T18:00:00.000Z", "America/Chicago");
  const fall = calculateCanonicalWeeklyPeriod("2026-11-04T18:00:00.000Z", "America/Chicago");
  assert.equal(spring.startLocalDate, "2026-03-08");
  assert.equal(spring.endLocalDate, "2026-03-15");
  assert.equal((spring.end.getTime() - spring.start.getTime()) / 3_600_000, 167);
  assert.equal(fall.startLocalDate, "2026-11-01");
  assert.equal(fall.endLocalDate, "2026-11-08");
  assert.equal((fall.end.getTime() - fall.start.getTime()) / 3_600_000, 169);
});

test("selected inclusive boundaries use qualifying activity dates, not payment creation", async () => {
  const period = calculateCanonicalDateRangePeriod("2026-07-12", "2026-07-18", "America/Chicago");
  const included = candidate({ payment: { id: "at_start", createdAt: "2026-01-01T00:00:00.000Z" }, activity: { verifiedAt: period.start.toISOString() } });
  const fixture = inMemoryRepository([included]);
  assert.equal((await createCanonicalFinancialBatchDraft(request(), actor, fixture.repo)).batch.obligationCount, 1);
  const excluded = inMemoryRepository([candidate({ payment: { id: "at_end" }, activity: { verifiedAt: period.end.toISOString() } })]);
  await assert.rejects(createCanonicalFinancialBatchDraft(request(), actor, excluded.repo), { code: "no_eligible_obligations" });
});

test("verified_at takes precedence, while activity created_at is the explicit fallback service date", async () => {
  const verifiedBefore = candidate({ payment: { id: "verified_before" }, activity: { verifiedAt: "2026-07-12T04:59:59.000Z", createdAt: "2026-07-13T12:00:00.000Z" } });
  const createdFallback = candidate({ payment: { id: "created_fallback" }, activity: { verifiedAt: null, createdAt: "2026-07-12T05:00:00.000Z" } });
  const before = inMemoryRepository([verifiedBefore]);
  await assert.rejects(createCanonicalFinancialBatchDraft(request(), actor, before.repo), { code: "no_eligible_obligations" });
  const fallback = inMemoryRepository([createdFallback]);
  assert.equal((await createCanonicalFinancialBatchDraft(request(), actor, fallback.repo)).batch.obligationCount, 1);
});

test("administrator preview includes only selected inclusive service dates and reports exclusions without provider work", async () => {
  const inside = candidate({ payment: { id: "inside", activityId: "activity_inside" }, activity: { id: "activity_inside", verifiedAt: "2026-07-12T05:00:00.000Z" } });
  const before = candidate({ payment: { id: "before", activityId: "activity_before" }, activity: { id: "activity_before", verifiedAt: "2026-07-12T04:59:59.000Z" } });
  const after = candidate({ payment: { id: "after", activityId: "activity_after" }, activity: { id: "activity_after", verifiedAt: "2026-07-19T05:00:00.000Z" } });
  const rejected = candidate({ payment: { id: "rejected", activityId: "activity_rejected" }, activity: { id: "activity_rejected", status: "rejected" } });
  const assigned = candidate({ payment: { id: "assigned", activityId: "activity_assigned" }, activity: { id: "activity_assigned" }, activeMembershipId: "active_batch_membership" });
  const fixture = inMemoryRepository([inside, before, after, rejected, assigned]);
  const preview = await previewCanonicalFinancialBatchSelection({ facilityId: "owner_1", fromDate: "2026-07-12", throughDate: "2026-07-18" }, actor, fixture.repo);
  assert.equal(preview.eligibleCount, 1);
  assert.equal(preview.excludedCount, 4);
  assert.equal(preview.alreadyBatchedCount, 1);
  assert.equal(preview.ineligibleCount, 3);
  assert.equal(preview.frozenFacilityChargeCents, 1734);
  assert.match(preview.selectionHash, /^[a-f0-9]{64}$/);
  assert.deepEqual(fixture.state.writes, { providers: 0, wallets: 0, execution: 0, legacyBatchLinks: 0 });
});

test("draft creation freezes the exact server preview selection and rejects a changed selection", async () => {
  const fixture = inMemoryRepository([candidate()]);
  const preview = await previewCanonicalFinancialBatchSelection({ facilityId: "owner_1", fromDate: "2026-07-12", throughDate: "2026-07-18" }, actor, fixture.repo);
  const result = await createCanonicalFinancialBatchDraft(request({ selectionHash: preview.selectionHash }), actor, fixture.repo);
  assert.equal(result.batch.obligationCount, preview.eligibleCount);
  assert.equal(result.batch.frozenFacilityChargeCents, preview.frozenFacilityChargeCents);
  const changed = inMemoryRepository([candidate({ payment: { id: "another_payment" }, activity: { id: "another_activity" } })]);
  await assert.rejects(createCanonicalFinancialBatchDraft(request({ selectionHash: preview.selectionHash }), actor, changed.repo), { code: "canonical_batch_conflict" });
  assert.equal(changed.state.memberships.size, 0);
});

test("historical obligations are excluded from canonical batch construction", async () => {
  const historical = candidate({ payment: { id: "historical_payment" }, activity: { id: "historical_activity", verifiedAt: "2026-07-17T04:59:59.000Z" } });
  const current = candidate({ payment: { id: "current_payment", activityId: "current_activity" }, activity: { id: "current_activity", verifiedAt: "2026-07-17T05:00:00.000Z" } });
  const fixture = inMemoryRepository([historical, current], "2026-07-17T05:00:00.000Z");
  const result = await createCanonicalFinancialBatchDraft(request(), actor, fixture.repo);
  assert.equal(result.batch.obligationCount, 1);
  assert.equal(fixture.state.memberships.has("historical_payment"), false);
  assert.equal(fixture.state.memberships.has("current_payment"), true);
});

test("invalid and noncanonical obligations are never selected into a date-range draft", async () => {
  const invalids = [
    candidate({ payment: { id: "legacy", obligationKind: null } }),
    candidate({ payment: { id: "unknown", obligationKind: "future_model" } }),
    candidate({ payment: { id: "bad-amount", amount: "1.234" } }),
    candidate({ payment: { id: "negative-amount", amount: "-1.00" } }),
    candidate({ payment: { id: "unsafe-amount", amount: "90071992547410.00" } }),
    candidate({ payment: { id: "provider", hasExecutionIdentifiers: true } }),
    candidate({ payment: { id: "assigned" }, activeMembershipId: "membership_1" }),
    candidate({ payment: { id: "out-period" }, activity: { verifiedAt: "2026-06-01T12:00:00.000Z" } }),
    candidate({ payment: { id: "missing-location" }, location: null }),
    candidate({ payment: { id: "timezone" }, facility: { billingTimezone: "Not/A_Timezone" } }),
    candidate({ payment: { id: "alias-status" }, activity: { status: "approved" } }),
    candidate({ payment: { id: "rejected-status" }, activity: { status: "rejected" } }),
    candidate({ payment: { id: "malformed-timestamp" }, activity: { verifiedAt: "not-a-timestamp", createdAt: "not-a-timestamp" } }),
  ].map((entry, index) => ({
    ...entry,
    payment: { ...entry.payment, activityId: `invalid_activity_${index}` },
    activity: entry.activity ? { ...entry.activity, id: `invalid_activity_${index}` } : null,
  }));
  const fixture = inMemoryRepository(invalids);
  await assert.rejects(createCanonicalFinancialBatchDraft(request(), actor, fixture.repo), { code: "no_eligible_obligations" });
  assert.equal(fixture.state.batches.size, 0);
  assert.equal(fixture.state.memberships.size, 0);
});

test("duplicate financial rows for one activity are quarantined instead of becoming two canonical memberships", async () => {
  const first = candidate({ payment: { id: "payment_a", activityId: "duplicate_activity" }, activity: { id: "duplicate_activity" } });
  const second = candidate({ payment: { id: "payment_b", activityId: "duplicate_activity" }, activity: { id: "duplicate_activity" } });
  const fixture = inMemoryRepository([first, second]);
  await assert.rejects(createCanonicalFinancialBatchDraft(request(), actor, fixture.repo), { code: "no_eligible_obligations" });
  assert.equal(fixture.state.memberships.size, 0);
});

test("an isolated canonical pending obligation is eligible only during its Facility-local period and no zero-fee fallback is invented", async () => {
  const valid = candidate();
  const fixture = inMemoryRepository([valid]);
  await assert.rejects(createCanonicalFinancialBatchDraft(request({ fromDate: "2026-07-26", throughDate: "2026-07-26" }), actor, fixture.repo), { code: "no_eligible_obligations" });
  const zeroFee = inMemoryRepository([candidate({ payment: { processingFee: "0.00" } })]);
  await assert.rejects(createCanonicalFinancialBatchDraft(request(), actor, zeroFee.repo), { code: "no_eligible_obligations" });
});

test("draft and list endpoints enforce authorization, bounded filters, and safe draft-only projections", async () => {
  const batch = { id: "batch_1", reference: "CTX-FB-2026-W29-ABCDEF01", ownerId: "owner_1", state: "draft", modelVersion: CANONICAL_FINANCIAL_BATCH_MODEL_VERSION, period: calculateCanonicalWeeklyPeriod(PERIOD_ANCHOR, "America/Chicago"), revision: 1, obligationCount: 1, frozenDriverIncentiveCents: 1234, frozenPlatformFeeCents: 500, frozenFacilityChargeCents: 1734, exceptionCount: 0, createdAt: new Date(), createdBy: "admin_1", creationReason: "Review" } as any;
  const roles: Record<string, string> = { admin: "admin", super: "super_admin", driver: "driver", facility: "owner", support: "support" };
  const handler = createAdminFinancialBatchDraftHandler({ getUser: async (id) => ({ id, role: roles[id] }), create: async () => ({ batch, created: true, exceptions: [] }) });
  const makeRes = () => ({ statusCode: 200, body: undefined as any, status(code: number) { this.statusCode = code; return this; }, json(body: any) { this.body = body; return body; } });
  const unauthenticated = makeRes();
  await handler({ body: request(), get: () => null }, unauthenticated);
  assert.equal(unauthenticated.statusCode, 401);
  const denied = makeRes();
  await handler({ user: { id: "driver" }, body: request(), get: () => null }, denied);
  assert.equal(denied.statusCode, 403);
  const facility = makeRes();
  await handler({ user: { id: "facility" }, body: request(), get: () => null }, facility);
  assert.equal(facility.statusCode, 403);
  const allowed = makeRes();
  await handler({ user: { id: "admin" }, body: request(), get: () => "header-key" }, allowed);
  assert.equal(allowed.statusCode, 201);
  assert.equal(allowed.body.batch.state, "draft");
  assert.equal(JSON.stringify(allowed.body).includes("stripe"), false);
  assert.equal(JSON.stringify(allowed.body).includes("wallet"), false);
  const superAdmin = makeRes();
  await handler({ user: { id: "super" }, body: request(), get: () => "header-key" }, superAdmin);
  assert.equal(superAdmin.statusCode, 201);
  const list = createAdminFinancialBatchListHandler({ getUser: async (id) => ({ id, role: roles[id] }), list: async () => Array.from({ length: 26 }, () => batch) });
  const invalidList = makeRes();
  await list({ user: { id: "admin" }, query: { pageSize: "101" } }, invalidList);
  assert.equal(invalidList.statusCode, 400);
  const validList = makeRes();
  await list({ user: { id: "admin" }, query: {} }, validList);
  assert.equal(validList.body.items.length, 25);
  assert.equal(validList.body.pagination.hasMore, true);
});

test("range preview endpoint is limited to Platform Operations and never invokes creation", async () => {
  const roles: Record<string, string> = { admin: "admin", driver: "driver" };
  let previewCalls = 0;
  const handler = createAdminFinancialBatchPreviewHandler({
    getUser: async (id) => ({ id, role: roles[id] }),
    preview: async () => { previewCalls += 1; return { period: calculateCanonicalDateRangePeriod("2026-07-12", "2026-07-18", "America/Chicago"), eligibleCount: 1, excludedCount: 0, alreadyBatchedCount: 0, ineligibleCount: 0, frozenDriverIncentiveCents: 1234, frozenPlatformFeeCents: 500, frozenFacilityChargeCents: 1734, selectionHash: "a".repeat(64) }; },
  });
  const makeRes = () => ({ statusCode: 200, body: undefined as any, status(code: number) { this.statusCode = code; return this; }, json(body: any) { this.body = body; return body; } });
  const denied = makeRes();
  await handler({ user: { id: "driver" }, body: request() }, denied);
  assert.equal(denied.statusCode, 403);
  const allowed = makeRes();
  await handler({ user: { id: "admin" }, body: request() }, allowed);
  assert.equal(allowed.statusCode, 200);
  assert.equal(allowed.body.eligibleCount, 1);
  assert.equal(previewCalls, 1);
});
