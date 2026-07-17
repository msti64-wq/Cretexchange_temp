import assert from "node:assert/strict";
import test from "node:test";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgres://user:pass@127.0.0.1:1/cretexchange_test";
process.env.JWT_SECRET = "test-only-jwt-secret-32-characters-minimum";

const { CANONICAL_VERIFIED_ACTIVITY_OBLIGATION_KIND } = await import("../server/financialObligations");
const {
  CANONICAL_FINANCIAL_BATCH_MODEL_VERSION,
  FinancialBatchLifecycleError,
  calculateCanonicalWeeklyPeriod,
  createAdminFinancialBatchLifecycleHandler,
  transitionCanonicalFinancialBatch,
} = await import("../server/financialBatchDrafts");

const actor = { actorUserId: "admin_1", actorRole: "admin" };

function fixture(overrides: Record<string, any> = {}) {
  const period = calculateCanonicalWeeklyPeriod("2026-07-15T18:00:00.000Z", "America/Chicago");
  const batch: any = {
    id: "batch_1", reference: "CTX-FB-2026-W29-ABC12345", ownerId: "owner_1", state: "draft",
    modelVersion: CANONICAL_FINANCIAL_BATCH_MODEL_VERSION, period, revision: 1, obligationCount: 1,
    frozenDriverIncentiveCents: 1234, frozenPlatformFeeCents: 500, frozenFacilityChargeCents: 1734,
    exceptionCount: 0, createdAt: new Date("2026-07-15T18:00:00.000Z"), createdBy: "admin_0", creationReason: "Create draft",
    legacyStatus: "cancelled", hasExecutionIdentifiers: false, processingStartedAt: null, completedAt: null,
    ...overrides.batch,
  };
  const memberships: any[] = overrides.memberships ?? [{ id: "membership_1", paymentId: "payment_1", state: "active", batchRevision: 1, frozenDriverIncentiveCents: 1234, frozenPlatformFeeCents: 500, frozenFacilityChargeCents: 1734 }];
  const candidates = overrides.candidates ?? [{
    payment: { id: "payment_1", activityId: "activity_1", driverId: "driver_1", ownerId: "owner_1", amount: "12.34", processingFee: "5.00", status: "pending", obligationKind: CANONICAL_VERIFIED_ACTIVITY_OBLIGATION_KIND, batchId: null, paidAt: null, createdAt: "2026-07-14T12:00:00.000Z", hasExecutionIdentifiers: false },
    activity: { id: "activity_1", driverId: "driver_1", locationId: "location_1", status: "verified", verifiedAt: "2026-07-14T11:00:00.000Z" },
    driver: { id: "driver_1" }, location: { id: "location_1", ownerId: "owner_1", name: "Facility" },
    facility: { id: "owner_1", name: "Facility", billingTimezone: "America/Chicago" }, activeMembershipId: "membership_1",
  }];
  const events: any[] = [];
  const exceptions: any[] = [];
  let unresolved = overrides.unresolved ?? 0;
  let tail = Promise.resolve();
  const repo: any = {
    async transaction(run: any) {
      const before = tail; let release!: () => void;
      tail = new Promise<void>((resolve) => { release = resolve; });
      await before;
      try {
        return await run({
          findBatch: async () => batch,
          listMemberships: async () => memberships.map((entry) => ({ ...entry })),
          listCandidates: async () => candidates.map((entry: any) => ({ ...entry, payment: { ...entry.payment }, activity: entry.activity && { ...entry.activity } })),
          unresolvedExceptionCount: async () => unresolved,
          guardedTransition: async ({ expectedState, nextState, actor: transitionActor, reason }: any) => {
            if (batch.state !== expectedState) return null;
            batch.state = nextState;
            if (nextState === "ready_for_review") { batch.reviewedBy = transitionActor.actorUserId; batch.reviewReason = reason; batch.reviewedAt = new Date(); }
            if (nextState === "approved") { batch.approvedBy = transitionActor.actorUserId; batch.approvalReason = reason; batch.approvedAt = new Date(); }
            if (nextState === "cancelled") { batch.cancelledBy = transitionActor.actorUserId; batch.cancellationReason = reason; batch.cancelledAt = new Date(); }
            return { ...batch };
          },
          releaseMemberships: async () => {
            const active = memberships.filter((entry) => entry.state === "active");
            active.forEach((entry) => { entry.state = "released"; });
            return active.map((entry) => ({ ...entry }));
          },
          appendEvent: async (eventBatch: any, eventType: string, eventActor: any, reason: string, priorState: string, safeMetadata?: any) => {
            events.push({ eventType, actor: eventActor.actorUserId, reason, priorState, state: eventBatch.state, safeMetadata });
          },
          recordExceptions: async (_: any, items: any[]) => { exceptions.push(...items); unresolved += items.length; },
        });
      } finally { release(); }
    },
  };
  return { repo, batch, memberships, candidates, events, exceptions };
}

function request(expectedState: any, overrides: Record<string, any> = {}) {
  return { batchId: "batch_1", expectedState, reason: "Documented Platform Operations lifecycle decision", ...overrides };
}

test("ready-for-review freezes a valid draft, records a separate audit event, and is idempotent", async () => {
  const state = fixture();
  const first = await transitionCanonicalFinancialBatch("ready_for_review", request("draft"), actor, state.repo);
  const retry = await transitionCanonicalFinancialBatch("ready_for_review", request("draft", { reason: "Different retry reason" }), actor, state.repo);
  assert.equal(first.transitioned, true);
  assert.equal(retry.transitioned, false);
  assert.equal(state.batch.state, "ready_for_review");
  assert.equal(state.batch.reviewedBy, "admin_1");
  assert.equal(state.events.filter((event) => event.eventType === "ready_for_review").length, 1);
  assert.equal(state.memberships[0].state, "active");
  assert.equal(state.batch.frozenFacilityChargeCents, 1734);
});

test("approval requires ready-for-review and remains a distinct same-admin action", async () => {
  const state = fixture();
  await assert.rejects(transitionCanonicalFinancialBatch("approve", request("draft"), actor, state.repo), { code: "FINANCIAL_BATCH_INVALID_STATE" });
  await transitionCanonicalFinancialBatch("ready_for_review", request("draft", { reason: "Review reason" }), actor, state.repo);
  const approved = await transitionCanonicalFinancialBatch("approve", request("ready_for_review", { reason: "Approval reason" }), actor, state.repo);
  assert.equal(approved.transitioned, true);
  assert.equal(state.batch.state, "approved");
  assert.equal(state.batch.approvedBy, "admin_1");
  assert.equal(state.events.map((event) => event.eventType).join(","), "ready_for_review,approved");
  assert.equal(state.memberships[0].state, "active");
});

test("approval retries and concurrent approval keep the original audit and approval context", async () => {
  const state = fixture();
  await transitionCanonicalFinancialBatch("ready_for_review", request("draft", { reason: "Review" }), actor, state.repo);
  const [first, second] = await Promise.all([
    transitionCanonicalFinancialBatch("approve", request("ready_for_review", { reason: "Approve once" }), actor, state.repo),
    transitionCanonicalFinancialBatch("approve", request("ready_for_review", { reason: "Do not overwrite" }), { actorUserId: "admin_2", actorRole: "admin" }, state.repo),
  ]);
  assert.equal([first.transitioned, second.transitioned].filter(Boolean).length, 1);
  assert.equal(state.events.filter((event) => event.eventType === "approved").length, 1);
  assert.ok(["admin_1", "admin_2"].includes(state.batch.approvedBy));
  const originalReason = state.batch.approvalReason;
  const retry = await transitionCanonicalFinancialBatch("approve", request("ready_for_review", { reason: "Retry must not overwrite" }), actor, state.repo);
  assert.equal(retry.transitioned, false);
  assert.equal(state.batch.approvalReason, originalReason);
});

test("review and approval fail closed on mismatched totals, members, or material exceptions", async () => {
  const totalMismatch = fixture({ batch: { frozenFacilityChargeCents: 1700 } });
  await assert.rejects(transitionCanonicalFinancialBatch("ready_for_review", request("draft"), actor, totalMismatch.repo), { code: "FINANCIAL_BATCH_TOTAL_MISMATCH" });
  const membershipMismatch = fixture({ batch: { obligationCount: 2 } });
  await assert.rejects(transitionCanonicalFinancialBatch("ready_for_review", request("draft"), actor, membershipMismatch.repo), { code: "FINANCIAL_BATCH_MEMBERSHIP_MISMATCH" });
  const exceptionBlocked = fixture({ unresolved: 1 });
  await assert.rejects(transitionCanonicalFinancialBatch("ready_for_review", request("draft"), actor, exceptionBlocked.repo), { code: "FINANCIAL_BATCH_EXCEPTION_BLOCKED" });
  const noMembers = fixture({ memberships: [], batch: { obligationCount: 0, frozenDriverIncentiveCents: 0, frozenPlatformFeeCents: 0, frozenFacilityChargeCents: 0 } });
  await assert.rejects(transitionCanonicalFinancialBatch("ready_for_review", request("draft"), actor, noMembers.repo), { code: "FINANCIAL_BATCH_MEMBERSHIP_MISMATCH" });
  const unknownModel = fixture({ batch: { modelVersion: "legacy" } });
  await assert.rejects(transitionCanonicalFinancialBatch("ready_for_review", request("draft"), actor, unknownModel.repo), { code: "FINANCIAL_BATCH_MODEL_UNSUPPORTED" });
});

test("approved non-executed cancellation requires explicit confirmation, releases membership once, and preserves history", async () => {
  const state = fixture();
  await transitionCanonicalFinancialBatch("ready_for_review", request("draft"), actor, state.repo);
  await transitionCanonicalFinancialBatch("approve", request("ready_for_review"), actor, state.repo);
  await assert.rejects(transitionCanonicalFinancialBatch("cancel", request("approved"), actor, state.repo), { code: "FINANCIAL_BATCH_INVALID_REQUEST" });
  const cancelled = await transitionCanonicalFinancialBatch("cancel", request("approved", { approvedCancellationConfirmed: true, cancellationCategory: "pilot_correction" }), actor, state.repo);
  const retry = await transitionCanonicalFinancialBatch("cancel", request("approved", { approvedCancellationConfirmed: true, cancellationCategory: "pilot_correction" }), actor, state.repo);
  assert.equal(cancelled.releasedMemberships, 1);
  assert.equal(retry.transitioned, false);
  assert.equal(state.batch.state, "cancelled");
  assert.equal(state.memberships[0].state, "released");
  assert.equal(state.events.filter((event) => event.eventType === "membership_released").length, 1);
  assert.equal(state.events.filter((event) => event.eventType === "cancelled").length, 1);
  assert.equal(state.batch.reference, "CTX-FB-2026-W29-ABC12345");
});

test("draft and review-ready cancellation are permitted, while cancelled records cannot approve or reopen", async () => {
  const draft = fixture();
  await transitionCanonicalFinancialBatch("cancel", request("draft", { reason: "Cancel draft" }), actor, draft.repo);
  assert.equal(draft.batch.state, "cancelled");
  assert.equal(draft.memberships[0].state, "released");
  await assert.rejects(transitionCanonicalFinancialBatch("approve", request("cancelled"), actor, draft.repo), { code: "FINANCIAL_BATCH_ALREADY_CANCELLED" });
  const review = fixture();
  await transitionCanonicalFinancialBatch("ready_for_review", request("draft"), actor, review.repo);
  await transitionCanonicalFinancialBatch("cancel", request("ready_for_review", { reason: "Cancel reviewed draft" }), actor, review.repo);
  assert.equal(review.batch.state, "cancelled");
  assert.equal(review.events.filter((event) => event.eventType === "cancelled").length, 1);
});

test("cancellation quarantines an invalid released obligation instead of silently returning it to normal eligibility", async () => {
  const state = fixture();
  state.candidates[0].activity.status = "rejected";
  const result = await transitionCanonicalFinancialBatch("cancel", request("draft", { reason: "Cancel invalid grouping" }), actor, state.repo);
  assert.equal(result.releasedMemberships, 1);
  assert.equal(state.memberships[0].state, "released");
  assert.deepEqual(state.exceptions.map((exception) => exception.category), ["activity_no_longer_verified"]);
});

test("execution-contaminated batches or obligations cannot be cancelled or approved", async () => {
  const batchContaminated = fixture({ batch: { hasExecutionIdentifiers: true } });
  await assert.rejects(transitionCanonicalFinancialBatch("cancel", request("draft"), actor, batchContaminated.repo), { code: "FINANCIAL_BATCH_EXECUTION_CONFLICT" });
  const obligationContaminated = fixture({ candidates: [
    { ...fixture().candidates[0], payment: { ...fixture().candidates[0].payment, hasExecutionIdentifiers: true } },
  ] });
  await assert.rejects(transitionCanonicalFinancialBatch("ready_for_review", request("draft"), actor, obligationContaminated.repo), { code: "FINANCIAL_BATCH_EXECUTION_CONFLICT" });
});

test("concurrent review and cancellation have one guarded winner with no duplicate audit or release", async () => {
  const state = fixture();
  const [review, cancel] = await Promise.allSettled([
    transitionCanonicalFinancialBatch("ready_for_review", request("draft", { reason: "Review" }), actor, state.repo),
    transitionCanonicalFinancialBatch("cancel", request("draft", { reason: "Cancel" }), actor, state.repo),
  ]);
  assert.equal([review, cancel].filter((result) => result.status === "fulfilled").length, 1);
  assert.ok(["ready_for_review", "cancelled"].includes(state.batch.state));
  assert.ok(state.events.length <= 2);
});

test("mutation handlers deny unauthenticated and non-operations roles while allowing admin and super-admin", async () => {
  const batch = fixture().batch;
  const roles: Record<string, string> = { driver: "driver", owner: "owner", admin: "admin", super: "super_admin" };
  const handler = createAdminFinancialBatchLifecycleHandler("ready_for_review", {
    getUser: async (id) => ({ id, role: roles[id] }),
    transition: async (_action, _request, actionActor) => ({ batch: { ...batch, state: "ready_for_review", reviewedAt: new Date(), reviewedBy: actionActor.actorUserId }, transitioned: true, releasedMemberships: 0 }),
  });
  const response = () => ({ statusCode: 200, body: undefined as any, status(code: number) { this.statusCode = code; return this; }, json(body: any) { this.body = body; return body; } });
  const unauthenticated = response(); await handler({ params: { id: "batch_1" }, body: request("draft") }, unauthenticated); assert.equal(unauthenticated.statusCode, 401);
  const driver = response(); await handler({ user: { id: "driver" }, params: { id: "batch_1" }, body: request("draft") }, driver); assert.equal(driver.statusCode, 403);
  const owner = response(); await handler({ user: { id: "owner" }, params: { id: "batch_1" }, body: request("draft") }, owner); assert.equal(owner.statusCode, 403);
  const admin = response(); await handler({ user: { id: "admin" }, params: { id: "batch_1" }, body: request("draft") }, admin); assert.equal(admin.statusCode, 200);
  const superAdmin = response(); await handler({ user: { id: "super" }, params: { id: "batch_1" }, body: request("draft") }, superAdmin); assert.equal(superAdmin.statusCode, 200);
  assert.equal(JSON.stringify(admin.body).match(/stripe|wallet|bank|paymentMethod/i), null);
});

test("canonical lifecycle source contains no execution call and legacy webhooks reject canonical or unknown model rows before mutation", async () => {
  const source = await import("node:fs/promises").then((fs) => fs.readFile(new URL("../server/financialBatchDrafts.ts", import.meta.url), "utf8"));
  const routes = await import("node:fs/promises").then((fs) => fs.readFile(new URL("../server/routes.ts", import.meta.url), "utf8"));
  assert.equal(/stripe\.|treasury|wallet.*(?:insert|update)|process-payout|process-batch|scheduler/i.test(source), false);
  assert.match(routes, /batch\.batchModelVersion\)/);
  assert.match(routes, /batch\?\.batchModelVersion\)/);
  assert.match(routes, /Ignoring legacy webhook for non-legacy batch/);
});
