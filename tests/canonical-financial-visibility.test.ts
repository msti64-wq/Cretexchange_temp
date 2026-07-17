import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgres://user:pass@127.0.0.1:1/cretexchange_test";
const { buildCanonicalFinancialMetric } = await import("../server/canonicalFinancialVisibility");

test("canonical metric totals frozen components and marks malformed records unavailable instead of zero", () => {
  assert.deepEqual(buildCanonicalFinancialMetric([{ incentive: 1250, fee: 500, facility: 1750 }, { incentive: 250, fee: 0, facility: 250 }]), { count: 2, driverIncentiveCents: 1500, platformFeeCents: 500, facilityChargeCents: 2000 });
  assert.deepEqual(buildCanonicalFinancialMetric([{ incentive: 1250, fee: 500, facility: 1700 }]), { count: 1, driverIncentiveCents: null, platformFeeCents: null, facilityChargeCents: null });
});

test("canonical financial visibility is confined to versioned canonical sources and preserves unavailable totals", async () => {
  const source = await readFile(new URL("../server/canonicalFinancialVisibility.ts", import.meta.url), "utf8");
  assert.match(source, /CANONICAL_VERIFIED_ACTIVITY_OBLIGATION_KIND/);
  assert.match(source, /CANONICAL_FINANCIAL_BATCH_MODEL_VERSION/);
  assert.match(source, /financialBatchMemberships/);
  assert.match(source, /financialBatchExceptions/);
  assert.match(source, /driverIncentiveCents: valid \? driver : null/);
  assert.doesNotMatch(source, /ownerBillingReceivables|feesLedger|pendingWashoutPayments|treasury|wallet/i);
  assert.match(source, /isNull\(payments\.stripeTransferId\)/);
  assert.doesNotMatch(source, /payments\.stripePaymentIntentId|payments\.stripeChargeId/);
});

test("summary and selection routes are admin-only non-provider routes", async () => {
  const source = await readFile(new URL("../server/routes.ts", import.meta.url), "utf8");
  assert.match(source, /\/api\/admin\/financial-workspace\/summary/);
  assert.match(source, /\/api\/admin\/financial-obligations\/create/);
  assert.match(source, /client_amount_override/);
  assert.match(source, /resolveFinancialWorkspaceSelectionToken/);
  const financialRoutes = source.slice(source.indexOf("financialObligationErrorResponse"), source.indexOf("// Phase 3B.1 discovery"));
  assert.doesNotMatch(financialRoutes, /stripe(?:Client|Service)|paymentIntents\.create|charges\.create|transfers\.create|treasury|wallet|process-payout|process-batch/i);
});
