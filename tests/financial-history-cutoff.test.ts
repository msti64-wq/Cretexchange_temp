import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgres://user:pass@127.0.0.1:1/cretexchange_test";

const history = await import("../server/financialHistory");
const obligations = await import("../server/financialObligations");

test("the cutoff is the explicit America/Chicago midnight boundary", () => {
  assert.equal(history.FINANCIAL_HISTORY_CUTOFF_TIME_ZONE, "America/Chicago");
  assert.equal(history.isHistoricalFinancialTestActivity({ verifiedAt: "2026-07-17T04:59:59.999Z" }), true);
  assert.equal(history.isHistoricalFinancialTestActivity({ verifiedAt: "2026-07-17T05:00:00.000Z" }), false);
  assert.equal(history.isHistoricalFinancialTestActivity({ verifiedAt: null, createdAt: "2026-07-16T23:00:00.000Z" }), true);
  assert.equal(history.isHistoricalFinancialTestActivity({ verifiedAt: "bad-date", createdAt: null }), false);
});

test("a historical activity returns a terminal business result and writes no obligation", async () => {
  let inserts = 0;
  const repository: any = {
    transaction: async (run: any) => run({
      findPaymentsByActivityId: async () => [{ id: "legacy", activityId: "activity", driverId: "driver", ownerId: "owner", amount: "0.00", processingFee: "0.01", washoutServiceFee: "0.00", status: "pending", obligationKind: null }],
      findActivityById: async () => ({ id: "activity", driverId: "driver", locationId: "location", status: "verified", amount: "12.00", financialHistoryClassification: history.HISTORICAL_TEST_DATA_CLASSIFICATION }),
      findDriverById: async () => ({ id: "driver" }), findLocationById: async () => ({ id: "location", ownerId: "owner" }), findOwnerById: async () => ({ id: "owner" }), findSystemSettings: async () => null,
      insertPendingObligation: async () => { inserts += 1; return null; },
    }),
  };
  const result = await obligations.createFinancialObligationForVerifiedActivity("activity", repository);
  assert.deepEqual(result, { outcome: "historical_test_activity", created: false, code: "historical_test_activity" });
  assert.equal(inserts, 0);
});

test("the guarded migration is Central-Time explicit, baseline-checked, idempotent-safe, and non-executing", async () => {
  const migration = await readFile(new URL("../migrations/0026_classify_pre_clean_slate_financial_history.sql", import.meta.url), "utf8");
  for (const expected of ["BEGIN;", "COMMIT;", "America/Chicago", "2026-07-17 00:00:00 America/Chicago", "count(*) FROM washout_activities) <> 36", "status = 'verified') <> 29", "count(*) FROM payments) <> 1", "count(*) FROM billing_batches WHERE status = 'completed') <> 3", "pending_washout_payments", "washout_payment_batches", "owner_wallet_transactions", "wallet_transactions", "driver_lottery_entries", "lottery_drawing_winners", "lottery_drawing_fulfillments", "lottery_notifications", "financial_history_records", "historical_test_data", "financial_batch_memberships) <> 0"]) assert.match(migration, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  for (const forbidden of ["INSERT INTO payments", "UPDATE payments", "UPDATE washout_activities", "stripe", "treasury", "paid_at"]) assert.doesNotMatch(migration.toLowerCase(), new RegExp(forbidden.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("the migration distinguishes a verified completed mapping from incomplete or contradictory state", async () => {
  const migration = await readFile(new URL("../migrations/0026_classify_pre_clean_slate_financial_history.sql", import.meta.url), "utf8");
  assert.match(migration, /classification table already exists but contains no complete mapping/);
  assert.match(migration, /existing classification does not match the complete expected historical mapping/);
  assert.match(migration, /count\(\*\) FROM financial_history_records\) <> 76/);
  assert.match(migration, /count\(\*\) FROM expected_financial_history_records\) <> 76/);
  assert.match(migration, /FULL OUTER JOIN expected_financial_history_records/);
  assert.match(migration, /already applied; no additional classification was attempted/);
});

test("current post-cutoff activities retain canonical creation and duplicate protection", async () => {
  const records: any[] = [];
  const repository: any = {
    transaction: async (run: any) => run({
      findPaymentsByActivityId: async () => records,
      findActivityById: async () => ({ id: "current", driverId: "driver", locationId: "location", status: "verified", amount: "12.00", financialHistoryClassification: null }),
      findDriverById: async () => ({ id: "driver" }), findLocationById: async () => ({ id: "location", ownerId: "owner" }), findOwnerById: async () => ({ id: "owner" }), findSystemSettings: async () => null,
      insertPendingObligation: async (input: any) => { if (records.length) return null; const row = { ...input, id: "canonical" }; records.push(row); return row; },
    }),
  };
  const first: any = await obligations.createFinancialObligationForVerifiedActivity("current", repository);
  const second: any = await obligations.createFinancialObligationForVerifiedActivity("current", repository);
  assert.equal(first.created, true); assert.equal(second.created, false); assert.equal(records.length, 1);
});
