import assert from "node:assert/strict";
import test from "node:test";

type BatchState = "draft" | "ready_for_review" | "approved" | "processing" | "paid" | "cancelled";
type Actor = { id: string; role: "platform_operations_admin" | "owner" | "driver"; canApprove?: boolean };
type Obligation = {
  id: string;
  activityId: string;
  ownerId: string;
  facilityId: string;
  amountCents: number;
  currency: "usd";
  activityStatus: "verified" | "rejected";
  historical: boolean;
  batchId?: string;
};
type Batch = { id: string; ownerId: string; state: BatchState; memberIds: string[]; frozenTotalCents: number; currency: "usd"; paymentAttemptId?: string };

const admin: Actor = { id: "admin-1", role: "platform_operations_admin", canApprove: true };
const owner: Actor = { id: "owner-1", role: "owner" };
const driver: Actor = { id: "driver-1", role: "driver" };

function createFixture() {
  const obligations: Obligation[] = [
    { id: "obligation-current", activityId: "activity-current", ownerId: "owner-1", facilityId: "facility-1", amountCents: 17_500, currency: "usd", activityStatus: "verified", historical: false },
    { id: "obligation-historical", activityId: "activity-historical", ownerId: "owner-1", facilityId: "facility-1", amountCents: 500, currency: "usd", activityStatus: "verified", historical: true },
    { id: "obligation-rejected", activityId: "activity-rejected", ownerId: "owner-1", facilityId: "facility-1", amountCents: 500, currency: "usd", activityStatus: "rejected", historical: false },
  ];
  const batches = new Map<string, Batch>();
  const attempts = new Map<string, { id: string; providerId?: string }>();
  const calls = { database: 0, stripeCharge: 0, stripeTransfer: 0, wallet: 0, payout: 0 };
  const external = {
    database() { calls.database += 1; throw new Error("unexpected database access"); },
    stripeCharge() { calls.stripeCharge += 1; throw new Error("unexpected Stripe charge"); },
    stripeTransfer() { calls.stripeTransfer += 1; throw new Error("unexpected Stripe transfer"); },
    wallet() { calls.wallet += 1; throw new Error("unexpected wallet execution"); },
    payout() { calls.payout += 1; throw new Error("unexpected payout execution"); },
  };

  const discover = () => obligations.filter((item) => item.activityStatus === "verified" && !item.historical && !item.batchId);
  function draft(ownerId: string, clientAmountCents?: number) {
    const members = discover().filter((item) => item.ownerId === ownerId);
    const batch: Batch = {
      id: `batch-${batches.size + 1}`,
      ownerId,
      state: "draft",
      memberIds: members.map((item) => item.id),
      frozenTotalCents: members.reduce((total, item) => total + item.amountCents, 0),
      currency: "usd",
    };
    // Client amounts are deliberately ignored; only canonical obligations freeze totals.
    void clientAmountCents;
    members.forEach((item) => { item.batchId = batch.id; });
    batches.set(batch.id, batch);
    return batch;
  }
  function approve(actor: Actor, batch: Batch) {
    if (actor.role !== "platform_operations_admin" || actor.canApprove !== true) return "forbidden" as const;
    if (batch.state !== "ready_for_review") return "invalid_state" as const;
    batch.state = "approved";
    return "approved" as const;
  }
  async function execute(batch: Batch, options: { enabled: boolean; provider?: { create(input: { amount: number; currency: string; idempotencyKey: string }): Promise<{ id: string }> } }) {
    if (!options.enabled) return { code: "FINANCIAL_EXECUTION_DISABLED" as const };
    if (batch.state === "cancelled") return { code: "FINANCIAL_BATCH_CANCELLED" as const };
    if (batch.state === "paid") return { code: "FINANCIAL_BATCH_ALREADY_EXECUTED" as const };
    if (batch.state !== "approved") return { code: "FINANCIAL_BATCH_NOT_APPROVED" as const };
    const attemptId = `attempt-${batch.id}`;
    if (attempts.has(attemptId)) return { code: "FINANCIAL_BATCH_EXECUTION_CONFLICT" as const };
    attempts.set(attemptId, { id: attemptId });
    batch.paymentAttemptId = attemptId;
    batch.state = "processing";
    const result = await options.provider!.create({ amount: batch.frozenTotalCents, currency: batch.currency, idempotencyKey: `canonical:${batch.id}:attempt:1` });
    attempts.get(attemptId)!.providerId = result.id;
    return { code: "processing" as const, attemptId, providerId: result.id };
  }
  return { obligations, batches, attempts, calls, external, discover, draft, approve, execute };
}

function readyBatch(state: ReturnType<typeof createFixture>) {
  const batch = state.draft("owner-1");
  batch.state = "ready_for_review";
  assert.equal(state.approve(admin, batch), "approved");
  return batch;
}

function assertNoExecution(calls: ReturnType<typeof createFixture>["calls"]) {
  assert.deepEqual(calls, { database: 0, stripeCharge: 0, stripeTransfer: 0, wallet: 0, payout: 0 });
}

test("only eligible current unpaid obligations are discoverable and batchable", () => {
  const state = createFixture();
  assert.deepEqual(state.discover().map((item) => item.id), ["obligation-current"]);
  const batch = state.draft("owner-1");
  assert.deepEqual(batch.memberIds, ["obligation-current"]);
  assert.equal(state.discover().length, 0);
});

test("draft freezes membership, integer-cent total, and USD independently of client amounts", () => {
  const state = createFixture();
  const batch = state.draft("owner-1", 1);
  state.obligations[0].amountCents = 1;
  assert.deepEqual(batch.memberIds, ["obligation-current"]);
  assert.equal(batch.frozenTotalCents, 17_500);
  assert.equal(batch.currency, "usd");
});

test("only an authorized Platform Operations administrator can approve a ready batch", () => {
  const state = createFixture();
  const batch = state.draft("owner-1");
  batch.state = "ready_for_review";
  assert.equal(state.approve(owner, batch), "forbidden");
  assert.equal(state.approve(driver, batch), "forbidden");
  assert.equal(state.approve(admin, batch), "approved");
});

test("draft and reviewed batches cannot execute, and disabled execution returns the stable semantic denial", async () => {
  const state = createFixture();
  const draft = state.draft("owner-1");
  assert.deepEqual(await state.execute(draft, { enabled: false }), { code: "FINANCIAL_EXECUTION_DISABLED" });
  assert.deepEqual(await state.execute(draft, { enabled: true, provider: { create: async () => ({ id: "provider-1" }) } }), { code: "FINANCIAL_BATCH_NOT_APPROVED" });
  draft.state = "ready_for_review";
  assert.deepEqual(await state.execute(draft, { enabled: true, provider: { create: async () => ({ id: "provider-1" }) } }), { code: "FINANCIAL_BATCH_NOT_APPROVED" });
  assertNoExecution(state.calls);
});

test("approved test-mode execution reserves one attempt, uses frozen values, and becomes processing rather than paid", async () => {
  const state = createFixture();
  const batch = readyBatch(state);
  const providerInputs: Array<{ amount: number; currency: string; idempotencyKey: string }> = [];
  const result = await state.execute(batch, { enabled: true, provider: { create: async (input) => { providerInputs.push(input); return { id: "provider-1" }; } } });
  assert.equal(result.code, "processing");
  assert.equal(batch.state, "processing");
  assert.notEqual(batch.state, "paid");
  assert.deepEqual(providerInputs, [{ amount: 17_500, currency: "usd", idempotencyKey: "canonical:batch-1:attempt:1" }]);
  assert.equal(state.attempts.size, 1);
  assertNoExecution(state.calls);
});

test("idempotency and concurrent execution requests cannot create duplicate provider objects", async () => {
  const state = createFixture();
  const batch = readyBatch(state);
  let providerCalls = 0;
  const provider = { create: async () => { providerCalls += 1; return { id: "provider-1" }; } };
  const [first, second] = await Promise.all([state.execute(batch, { enabled: true, provider }), state.execute(batch, { enabled: true, provider })]);
  assert.equal([first.code, second.code].filter((code) => code === "processing").length, 1);
  assert.equal(providerCalls, 1);
  assert.equal(state.attempts.size, 1);
});

test("cancelled and paid batches cannot execute", async () => {
  const state = createFixture();
  const cancelled = readyBatch(state);
  cancelled.state = "cancelled";
  assert.deepEqual(await state.execute(cancelled, { enabled: true, provider: { create: async () => ({ id: "provider-1" }) } }), { code: "FINANCIAL_BATCH_CANCELLED" });
  const paidState = createFixture();
  const paid = readyBatch(paidState);
  paid.state = "paid";
  assert.deepEqual(await paidState.execute(paid, { enabled: true, provider: { create: async () => ({ id: "provider-1" }) } }), { code: "FINANCIAL_BATCH_ALREADY_EXECUTED" });
});

test("unexpected database and external-provider access fails immediately", () => {
  const state = createFixture();
  assert.throws(() => state.external.database(), /unexpected database access/);
  assert.throws(() => state.external.stripeCharge(), /unexpected Stripe charge/);
  assert.throws(() => state.external.stripeTransfer(), /unexpected Stripe transfer/);
  assert.throws(() => state.external.wallet(), /unexpected wallet execution/);
  assert.throws(() => state.external.payout(), /unexpected payout execution/);
});
