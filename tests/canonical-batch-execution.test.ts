import assert from "node:assert/strict";
import test from "node:test";

process.env.DATABASE_URL = "postgres://user:pass@127.0.0.1:1/cretexchange_test";

const { canonicalBatchExecutionAccess, canonicalBatchExecutionIdempotencyKey, executeApprovedCanonicalBatch } = await import("../server/canonicalBatchExecution");

function fixture(overrides: Record<string, unknown> = {}) {
  const batch: any = { id: "batch_1", reference: "CTX-FB-1", state: "approved", ownerId: "owner_1", currency: "usd", frozenFacilityChargeCents: 17500, executionProviderId: null, historical: false, ...overrides };
  const calls: any[] = [];
  const repository: any = {
    transaction: async (run: any) => run({
      findBatch: async () => batch,
      findOwner: async () => ({ id: "owner_1", stripeCustomerId: "cus_test", stripePaymentMethodId: "pm_test" }),
      markProcessing: async (input: any) => { calls.push({ kind: "processing", input }); batch.state = "processing"; batch.executionProviderId = input.providerId; return true; },
      appendAudit: async (input: any) => calls.push({ kind: "audit", input }),
    }),
  };
  const provider: any = { createPaymentIntent: async (input: any) => { calls.push({ kind: "provider", input }); return { id: "pi_test_1" }; } };
  return { batch, calls, repository, provider };
}

const enabled = { NODE_ENV: "test", STRIPE_SECRET_KEY: "sk_test_example", FINANCIAL_EXECUTION_ENABLED: "true", FACILITY_COLLECTION_EXECUTION_ENABLED: "true" } as NodeJS.ProcessEnv;

test("execution fails closed unless explicitly enabled in Stripe test mode", () => {
  assert.equal(canonicalBatchExecutionAccess({ NODE_ENV: "test", STRIPE_SECRET_KEY: "sk_test_example" } as NodeJS.ProcessEnv).allowed, false);
  assert.equal(canonicalBatchExecutionAccess({ ...enabled, STRIPE_SECRET_KEY: "sk_live_example" } as NodeJS.ProcessEnv).allowed, false);
});

test("only an approved current canonical batch creates a processing Stripe request from frozen cents", async () => {
  const state = fixture();
  const result = await executeApprovedCanonicalBatch({ batchId: "batch_1", actorId: "admin_1", reason: "Approved pilot batch", provider: state.provider, repository: state.repository, environment: enabled });
  assert.equal(result.status, "processing");
  assert.equal(state.calls[0].input.amount, 17500);
  assert.equal(state.calls[0].input.currency, "usd");
  assert.equal(state.calls[0].input.idempotencyKey, canonicalBatchExecutionIdempotencyKey(state.batch));
  assert.equal(state.calls[1].input.providerId, "pi_test_1");
  assert.equal(state.batch.state, "processing");
});

test("draft, historical, zero-value, and previously executed batches never call the provider", async () => {
  for (const values of [{ state: "draft" }, { historical: true }, { frozenFacilityChargeCents: 0 }, { executionProviderId: "pi_previous" }]) {
    const state = fixture(values);
    await assert.rejects(executeApprovedCanonicalBatch({ batchId: "batch_1", actorId: "admin_1", reason: "Attempt", provider: state.provider, repository: state.repository, environment: enabled }));
    assert.equal(state.calls.filter((call) => call.kind === "provider").length, 0);
  }
});
