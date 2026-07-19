import assert from "node:assert/strict";
import test from "node:test";

process.env.DATABASE_URL = "postgres://user:pass@127.0.0.1:1/cretexchange_test";
const { processCanonicalBatchPaymentIntentEvent } = await import("../server/canonicalBatchWebhook");

function event(type: "payment_intent.succeeded" | "payment_intent.payment_failed", overrides: Record<string, unknown> = {}) {
  return { type, eventId: "evt_1", providerObjectId: "pi_1", amountCents: 17500, currency: "usd", metadata: { canonicalBatchId: "batch_1", executionAttemptId: "attempt_1" }, ...overrides } as any;
}

test("canonical success is delegated only for a fully correlated provider object", async () => {
  const events: any[] = [];
  const result = await processCanonicalBatchPaymentIntentEvent(event("payment_intent.succeeded"), { finalize: async (input: any) => { events.push(input); return "processed"; } });
  assert.equal(result, "processed");
  assert.equal(events.length, 1);
  assert.equal(events[0].amountCents, 17500);
});

test("unrelated or manipulated metadata is ignored before any finalization", async () => {
  let calls = 0;
  const repository = { finalize: async () => { calls += 1; return "processed" as const; } };
  assert.equal(await processCanonicalBatchPaymentIntentEvent(event("payment_intent.succeeded", { metadata: { canonicalBatchId: "batch_1" } }), repository), "ignored");
  assert.equal(await processCanonicalBatchPaymentIntentEvent(event("payment_intent.payment_failed", { metadata: {} }), repository), "ignored");
  assert.equal(calls, 0);
});

test("webhook result preserves final-state precedence supplied by the transactional repository", async () => {
  assert.equal(await processCanonicalBatchPaymentIntentEvent(event("payment_intent.payment_failed"), { finalize: async () => "idempotent" as const }), "idempotent");
  assert.equal(await processCanonicalBatchPaymentIntentEvent(event("payment_intent.succeeded", { amountCents: 1 }), { finalize: async () => "rejected" as const }), "rejected");
});
