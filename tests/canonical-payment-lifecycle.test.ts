import assert from "node:assert/strict";
import test from "node:test";

type State = "approved" | "processing" | "paid" | "failed" | "cancelled";
type Attempt = { id: string; amountCents: number; currency: "usd"; status: "created" | "processing" | "succeeded" | "failed"; providerId?: string };
type Actor = { id: string; role: "admin" | "owner" | "driver"; canExecute?: boolean };

const admin: Actor = { id: "admin-1", role: "admin", canExecute: true };
const owner: Actor = { id: "owner-1", role: "owner" };

function fixture() {
  const batch = { id: "batch-1", state: "approved" as State, frozenTotalCents: 17_500, currency: "usd" as const, memberIds: ["obligation-1"], ownerBillingState: "pending", driverPayoutState: "pending" };
  const obligations = new Map([["obligation-1", { id: "obligation-1", status: "unpaid" as "unpaid" | "settled" }]]);
  const attempts: Attempt[] = [];
  const externalCalls = { database: 0, stripeTransfer: 0, wallet: 0, driverPayout: 0 };
  const external = {
    database() { externalCalls.database += 1; throw new Error("unexpected database access"); },
    stripeTransfer() { externalCalls.stripeTransfer += 1; throw new Error("unexpected Stripe transfer"); },
    wallet() { externalCalls.wallet += 1; throw new Error("unexpected wallet execution"); },
    driverPayout() { externalCalls.driverPayout += 1; throw new Error("unexpected driver payout execution"); },
  };
  const idempotencyKey = () => `canonical:${batch.id}:attempt:${attempts.length}`;

  async function execute(actor: Actor, provider: { create(input: { amount: number; currency: string; idempotencyKey: string }): Promise<{ id: string }> }) {
    if (actor.role !== "admin" || actor.canExecute !== true) return { code: "FINANCIAL_UNAUTHORIZED" as const };
    if (batch.state !== "approved") return { code: "FINANCIAL_BATCH_NOT_EXECUTABLE" as const };
    const attempt: Attempt = { id: `attempt-${attempts.length + 1}`, amountCents: batch.frozenTotalCents, currency: batch.currency, status: "created" };
    attempts.push(attempt);
    batch.state = "processing";
    const providerResult = await provider.create({ amount: attempt.amountCents, currency: attempt.currency, idempotencyKey: idempotencyKey() });
    attempt.providerId = providerResult.id;
    attempt.status = "processing";
    return { code: "processing" as const, attempt };
  }

  function webhook(event: { signed: boolean; type: "succeeded" | "failed"; providerId?: string; amountCents: number; currency: string; batchId?: string; attemptId?: string; error?: string }) {
    if (!event.signed) return { code: "WEBHOOK_SIGNATURE_INVALID" as const };
    if (event.batchId !== batch.id || !event.attemptId) return { code: "WEBHOOK_METADATA_INVALID" as const };
    const attempt = attempts.find((item) => item.id === event.attemptId && item.providerId === event.providerId);
    if (!attempt) return { code: "WEBHOOK_PROVIDER_OBJECT_UNKNOWN" as const };
    if (event.amountCents !== attempt.amountCents) return { code: "WEBHOOK_AMOUNT_MISMATCH" as const };
    if (event.currency.toLowerCase() !== attempt.currency) return { code: "WEBHOOK_CURRENCY_MISMATCH" as const };
    if (batch.state === "paid") return { code: "idempotent" as const };
    if (event.type === "failed") {
      attempt.status = "failed";
      batch.state = "failed";
      return { code: "failed" as const, errorCode: "provider_payment_failed" };
    }
    attempt.status = "succeeded";
    batch.state = "paid";
    obligations.forEach((obligation) => { obligation.status = "settled"; });
    return { code: "paid" as const };
  }

  async function retry(actor: Actor, reason: string, provider: { create(input: { amount: number; currency: string; idempotencyKey: string }): Promise<{ id: string }> }) {
    if (actor.role !== "admin" || actor.canExecute !== true) return { code: "FINANCIAL_UNAUTHORIZED" as const };
    if (!reason.trim()) return { code: "FINANCIAL_RETRY_REASON_REQUIRED" as const };
    if (batch.state !== "failed") return { code: "FINANCIAL_BATCH_NOT_RETRYABLE" as const };
    batch.state = "approved";
    return execute(actor, provider);
  }

  return { batch, obligations, attempts, externalCalls, external, execute, webhook, retry };
}

function provider(recorder: Array<{ amount: number; currency: string; idempotencyKey: string }>) {
  return { create: async (input: { amount: number; currency: string; idempotencyKey: string }) => { recorder.push(input); return { id: `provider-${recorder.length}` }; } };
}
function event(state: ReturnType<typeof fixture>, type: "succeeded" | "failed", overrides: Record<string, unknown> = {}) {
  const attempt = state.attempts[0];
  return { signed: true, type, providerId: attempt?.providerId, amountCents: 17_500, currency: "usd", batchId: "batch-1", attemptId: attempt?.id, ...overrides } as any;
}
function assertNoPayoutExecution(state: ReturnType<typeof fixture>) {
  assert.deepEqual(state.externalCalls, { database: 0, stripeTransfer: 0, wallet: 0, driverPayout: 0 });
}

test("approved execution reserves one frozen-cent USD attempt with deterministic provider idempotency", async () => {
  const state = fixture();
  const calls: Array<{ amount: number; currency: string; idempotencyKey: string }> = [];
  const result = await state.execute(admin, provider(calls));
  assert.equal(result.code, "processing");
  assert.equal(state.attempts.length, 1);
  assert.deepEqual(calls, [{ amount: 17_500, currency: "usd", idempotencyKey: "canonical:batch-1:attempt:1" }]);
  assert.equal(state.batch.state, "processing");
  assert.equal(state.obligations.get("obligation-1")?.status, "unpaid");
});

test("concurrent execution cannot create duplicate active attempts or provider objects", async () => {
  const state = fixture();
  const calls: Array<{ amount: number; currency: string; idempotencyKey: string }> = [];
  const [first, second] = await Promise.all([state.execute(admin, provider(calls)), state.execute(admin, provider(calls))]);
  assert.equal([first.code, second.code].filter((code) => code === "processing").length, 1);
  assert.equal(state.attempts.length, 1);
  assert.equal(calls.length, 1);
});

test("provider acceptance records only a processing attempt and never settles synchronously", async () => {
  const state = fixture();
  await state.execute(admin, provider([]));
  assert.equal(state.batch.state, "processing");
  assert.equal(state.attempts[0].providerId, "provider-1");
  assert.equal(state.attempts[0].status, "processing");
  assert.equal(state.obligations.get("obligation-1")?.status, "unpaid");
});

test("only a signed, correlated successful webhook settles the batch and obligations once", async () => {
  const state = fixture();
  await state.execute(admin, provider([]));
  assert.deepEqual(state.webhook(event(state, "succeeded")), { code: "paid" });
  assert.equal(state.batch.state, "paid");
  assert.equal(state.obligations.get("obligation-1")?.status, "settled");
  assert.deepEqual(state.webhook(event(state, "succeeded")), { code: "idempotent" });
  assert.equal(state.obligations.get("obligation-1")?.status, "settled");
  assert.deepEqual(state.webhook(event(state, "failed")), { code: "idempotent" });
});

test("failed signed webhook leaves obligations unsettled and supports authorized reasoned retry", async () => {
  const state = fixture();
  const calls: Array<{ amount: number; currency: string; idempotencyKey: string }> = [];
  await state.execute(admin, provider(calls));
  assert.equal(state.webhook(event(state, "failed")).code, "failed");
  assert.equal(state.batch.state, "failed");
  assert.equal(state.obligations.get("obligation-1")?.status, "unpaid");
  assert.equal((await state.retry(owner, "retry", provider(calls))).code, "FINANCIAL_UNAUTHORIZED");
  assert.equal((await state.retry(admin, "", provider(calls))).code, "FINANCIAL_RETRY_REASON_REQUIRED");
  assert.equal((await state.retry(admin, "provider error resolved", provider(calls))).code, "processing");
  assert.equal(state.attempts.length, 2);
  assert.deepEqual(state.attempts.map((item) => [item.amountCents, item.currency]), [[17_500, "usd"], [17_500, "usd"]]);
  assert.deepEqual(state.batch.memberIds, ["obligation-1"]);
});

test("processing and paid batches cannot retry", async () => {
  const processing = fixture();
  await processing.execute(admin, provider([]));
  assert.equal((await processing.retry(admin, "reason", provider([]))).code, "FINANCIAL_BATCH_NOT_RETRYABLE");
  const paid = fixture();
  await paid.execute(admin, provider([]));
  paid.webhook(event(paid, "succeeded"));
  assert.equal((await paid.retry(admin, "reason", provider([]))).code, "FINANCIAL_BATCH_NOT_RETRYABLE");
});

test("signature, metadata, provider identity, amount, and currency mismatches cannot settle", async () => {
  const state = fixture();
  await state.execute(admin, provider([]));
  assert.equal(state.webhook(event(state, "succeeded", { signed: false })).code, "WEBHOOK_SIGNATURE_INVALID");
  assert.equal(state.webhook(event(state, "succeeded", { batchId: "other-batch" })).code, "WEBHOOK_METADATA_INVALID");
  assert.equal(state.webhook(event(state, "succeeded", { providerId: "unknown" })).code, "WEBHOOK_PROVIDER_OBJECT_UNKNOWN");
  assert.equal(state.webhook(event(state, "succeeded", { amountCents: 1 })).code, "WEBHOOK_AMOUNT_MISMATCH");
  assert.equal(state.webhook(event(state, "succeeded", { currency: "eur" })).code, "WEBHOOK_CURRENCY_MISMATCH");
  assert.equal(state.batch.state, "processing");
});

test("owner billing completion remains separate from pending driver payout and no transfer or wallet execution occurs", async () => {
  const state = fixture();
  await state.execute(admin, provider([]));
  state.webhook(event(state, "succeeded"));
  assert.equal(state.batch.ownerBillingState, "pending");
  assert.equal(state.batch.driverPayoutState, "pending");
  assertNoPayoutExecution(state);
});

test("unexpected database and external provider access fails immediately", () => {
  const state = fixture();
  assert.throws(() => state.external.database(), /unexpected database access/);
  assert.throws(() => state.external.stripeTransfer(), /unexpected Stripe transfer/);
  assert.throws(() => state.external.wallet(), /unexpected wallet execution/);
  assert.throws(() => state.external.driverPayout(), /unexpected driver payout execution/);
});
