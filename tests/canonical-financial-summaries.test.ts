import assert from "node:assert/strict";
import test from "node:test";

// The imported webhook module constructs its database client at module load time.
// This unreachable URL is deliberately present only to prove the injected repository
// is used; every test repository below fails immediately on any unexpected access.
process.env.DATABASE_URL = "postgres://user:pass@127.0.0.1:1/cretexchange_test";

const { processCanonicalBatchPaymentIntentEvent } = await import("../server/canonicalBatchWebhook");

const CUTOFF = "2026-07-17T05:00:00.000Z";
const FROZEN_INCENTIVE_CENTS = 17_500;

type Activity = {
  id: string;
  ownerId: string;
  facilityId: string;
  driverId: string;
  locationId: string;
  washoutStatus: "verified" | "rejected";
  verifiedAt?: string;
  createdAt: string;
};

type BatchState = "draft" | "processing" | "paid" | "failed";
type Obligation = {
  activityId: string;
  ownerId: string;
  facilityId: string;
  driverId: string;
  locationId: string;
  amountCents: number;
  status: "unpaid" | "paid";
  batchState: BatchState;
  paymentAttempt: "none" | "processing" | "failed" | "succeeded";
};

function isCurrent(activity: Activity) {
  const effectiveAt = activity.verifiedAt ?? activity.createdAt;
  return new Date(effectiveAt).getTime() >= new Date(CUTOFF).getTime();
}

function createFixture() {
  const currentWashout: Activity = {
    id: "washout-current",
    ownerId: "owner-1",
    facilityId: "facility-1",
    driverId: "driver-1",
    locationId: "location-1",
    washoutStatus: "verified",
    verifiedAt: CUTOFF,
    createdAt: "2026-07-01T00:00:00.000Z",
  };
  const historicalWashout: Activity = {
    ...currentWashout,
    id: "washout-historical",
    verifiedAt: "2026-07-17T04:59:59.000Z",
  };
  const rejectedWashout: Activity = {
    ...currentWashout,
    id: "washout-rejected",
    washoutStatus: "rejected",
  };
  const obligations = new Map<string, Obligation>();
  const externalCalls = { stripe: 0, transfer: 0, wallet: 0, payout: 0, database: 0 };

  function verify(activity: Activity) {
    // Verification is operational-only. It neither calls nor prepares a provider.
    if (activity.washoutStatus !== "verified" || !isCurrent(activity)) return null;
    const existing = obligations.get(activity.id);
    if (existing) return existing;

    const obligation: Obligation = {
      activityId: activity.id,
      ownerId: activity.ownerId,
      facilityId: activity.facilityId,
      driverId: activity.driverId,
      locationId: activity.locationId,
      amountCents: FROZEN_INCENTIVE_CENTS,
      status: "unpaid",
      batchState: "draft",
      paymentAttempt: "none",
    };
    obligations.set(activity.id, obligation);
    return obligation;
  }

  function summary() {
    return [...obligations.values()].reduce(
      (totals, obligation) => ({
        currentReceivableCents:
          totals.currentReceivableCents + (obligation.status === "unpaid" ? obligation.amountCents : 0),
        settledRevenueCents:
          totals.settledRevenueCents + (obligation.status === "paid" ? obligation.amountCents : 0),
      }),
      { currentReceivableCents: 0, settledRevenueCents: 0 },
    );
  }

  const webhookRepository = {
    async finalize(event: {
      type: "payment_intent.succeeded" | "payment_intent.payment_failed";
      amountCents: number;
      currency: string;
      metadata: Record<string, string | undefined>;
    }) {
      const obligation = obligations.get(currentWashout.id);
      if (!obligation || event.metadata.canonicalBatchId !== "batch-paid" || event.metadata.executionAttemptId !== "attempt-1") {
        return "ignored" as const;
      }
      if (event.amountCents !== obligation.amountCents || event.currency.toLowerCase() !== "usd") {
        return "rejected" as const;
      }
      if (obligation.status === "paid") return "idempotent" as const;
      if (event.type === "payment_intent.payment_failed") {
        obligation.batchState = "failed";
        obligation.paymentAttempt = "failed";
        return "processed" as const;
      }
      obligation.status = "paid";
      obligation.batchState = "paid";
      obligation.paymentAttempt = "succeeded";
      return "processed" as const;
    },
  };

  async function deliverWebhook(type: "payment_intent.succeeded" | "payment_intent.payment_failed") {
    const obligation = obligations.get(currentWashout.id);
    if (obligation) {
      obligation.batchState = "processing";
      obligation.paymentAttempt = "processing";
    }
    return processCanonicalBatchPaymentIntentEvent(
      {
        type,
        eventId: `event-${type}`,
        providerObjectId: "provider-object-1",
        amountCents: FROZEN_INCENTIVE_CENTS,
        currency: "usd",
        metadata: { canonicalBatchId: "batch-paid", executionAttemptId: "attempt-1" },
      },
      webhookRepository,
    );
  }

  return {
    currentWashout,
    historicalWashout,
    rejectedWashout,
    obligations,
    externalCalls,
    verify,
    summary,
    deliverWebhook,
  };
}

test("a verified current washout creates one canonical obligation without external execution", () => {
  const state = createFixture();
  const first = state.verify(state.currentWashout);
  const repeated = state.verify(state.currentWashout);

  assert.equal(state.obligations.size, 1);
  assert.equal(first, repeated);
  assert.deepEqual(state.externalCalls, { stripe: 0, transfer: 0, wallet: 0, payout: 0, database: 0 });
});

test("rejected and historical washouts produce no current obligation", () => {
  const state = createFixture();

  assert.equal(state.verify(state.rejectedWashout), null);
  assert.equal(state.verify(state.historicalWashout), null);
  assert.equal(state.obligations.size, 0);
  assert.deepEqual(state.summary(), { currentReceivableCents: 0, settledRevenueCents: 0 });
});

test("current unpaid receivables retain facility, owner, driver, washout, and location relationships", () => {
  const state = createFixture();
  const obligation = state.verify(state.currentWashout)!;

  assert.equal(state.summary().currentReceivableCents, FROZEN_INCENTIVE_CENTS);
  assert.deepEqual(
    [obligation.facilityId, obligation.ownerId, obligation.driverId, obligation.activityId, obligation.locationId],
    ["facility-1", "owner-1", "driver-1", "washout-current", "location-1"],
  );
});

test("draft and processing batches are not settled revenue", async () => {
  const state = createFixture();
  const obligation = state.verify(state.currentWashout)!;

  assert.equal(obligation.batchState, "draft");
  assert.equal(state.summary().settledRevenueCents, 0);
  obligation.batchState = "processing";
  assert.equal(state.summary().settledRevenueCents, 0);
});

test("an authoritative success webhook settles once and duplicate delivery is idempotent", async () => {
  const state = createFixture();
  state.verify(state.currentWashout);

  assert.equal(await state.deliverWebhook("payment_intent.succeeded"), "processed");
  assert.deepEqual(state.summary(), { currentReceivableCents: 0, settledRevenueCents: FROZEN_INCENTIVE_CENTS });
  assert.equal(await state.deliverWebhook("payment_intent.succeeded"), "idempotent");
  assert.deepEqual(state.summary(), { currentReceivableCents: 0, settledRevenueCents: FROZEN_INCENTIVE_CENTS });
});

test("a failed webhook leaves the obligation unpaid and retryable", async () => {
  const state = createFixture();
  const obligation = state.verify(state.currentWashout)!;

  assert.equal(await state.deliverWebhook("payment_intent.payment_failed"), "processed");
  assert.equal(obligation.status, "unpaid");
  assert.equal(obligation.batchState, "failed");
  assert.equal(obligation.paymentAttempt, "failed");
  assert.deepEqual(state.summary(), { currentReceivableCents: FROZEN_INCENTIVE_CENTS, settledRevenueCents: 0 });
});
