import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildDriverPaymentLifecycle } from "../client/src/lib/driverPaymentLifecycle";

test("keeps pending activity in Awaiting Review and out of payment states", () => {
  const result = buildDriverPaymentLifecycle([{ status: "pending" }], []);
  assert.equal(result.awaitingReviewCount, 1);
  assert.equal(result.verifiedAwaitingPaymentCount, 0);
});

test("verified activity alone does not create a payment obligation", () => {
  const result = buildDriverPaymentLifecycle([{ status: "verified" }], []);
  assert.equal(result.awaitingReviewCount, 0);
  assert.equal(result.verifiedAwaitingPaymentCount, 0);
});

test("rejected activity is financially ineligible", () => {
  const result = buildDriverPaymentLifecycle([{ status: "rejected" }], [
    { status: "pending", activity: { status: "rejected" } },
  ]);
  assert.equal(result.awaitingReviewCount, 0);
  assert.equal(result.verifiedAwaitingPaymentCount, 0);
});

test("requires a verified linked unpaid payment record for Verified Awaiting Payment", () => {
  const result = buildDriverPaymentLifecycle([], [
    { status: "pending", activity: { status: "verified" } },
    { status: "pending", activity: { status: "pending" } },
  ]);
  assert.equal(result.verifiedAwaitingPaymentCount, 1);
});

test("unknown and legacy activity aliases remain unavailable instead of becoming payable", () => {
  for (const status of ["approved", "completed", "submitted", "malformed"]) {
    const activityResult = buildDriverPaymentLifecycle([{ status }], []);
    const paymentResult = buildDriverPaymentLifecycle([], [{ status: "pending", activity: { status } }]);
    assert.equal(activityResult.awaitingReviewCount, null, status);
    assert.equal(paymentResult.verifiedAwaitingPaymentCount, null, status);
  }
});

test("payment exceptions require a payment exception or defer indicator", () => {
  const result = buildDriverPaymentLifecycle([], [
    { status: "failed", activity: { status: "verified" } },
    { status: "pending", deferReason: "held", activity: { status: "verified" } },
    { status: "pending", activity: { status: "verified" } },
  ]);
  assert.equal(result.paymentExceptionCount, 2);
});

test("activity amounts, configured incentives, wallet balances, and cadence do not create financial states", () => {
  const result = buildDriverPaymentLifecycle(
    [{ status: "verified", amount: "175.00", configuredIncentive: 175 } as any],
    [{ status: "paid", activity: { status: "verified" }, walletBalance: 900, payoutCadence: "weekly" } as any],
  );
  assert.equal(result.verifiedAwaitingPaymentCount, 0);
  assert.equal(result.scheduledPaymentCount, null);
  assert.equal(result.paidCount, null);
});

test("does not fabricate scheduled or paid history without canonical payout records", () => {
  const result = buildDriverPaymentLifecycle([], [{ status: "completed", activity: { status: "verified" } }]);
  assert.equal(result.scheduledPaymentCount, null);
  assert.equal(result.paidCount, null);
});

test("keeps partial sources distinct from confirmed zero", () => {
  const activityOnly = buildDriverPaymentLifecycle([{ status: "pending" }], undefined);
  assert.equal(activityOnly.awaitingReviewCount, 1);
  assert.equal(activityOnly.verifiedAwaitingPaymentCount, null);

  const financialOnly = buildDriverPaymentLifecycle(undefined, [{ status: "pending", activity: { status: "verified" } }]);
  assert.equal(financialOnly.awaitingReviewCount, null);
  assert.equal(financialOnly.verifiedAwaitingPaymentCount, 1);
});

test("keeps unavailable sources unavailable rather than rendering zero", () => {
  const result = buildDriverPaymentLifecycle(undefined, undefined);
  assert.equal(result.awaitingReviewCount, null);
  assert.equal(result.verifiedAwaitingPaymentCount, null);
  assert.equal(result.financialSource, "unavailable");
});

test("Dashboard and Wallet use the shared lifecycle contract and separate review from payment", () => {
  const dashboardSource = readFileSync(new URL("../client/src/pages/driver/dashboard.tsx", import.meta.url), "utf8");
  const walletSource = readFileSync(new URL("../client/src/pages/driver/wallet.tsx", import.meta.url), "utf8");
  const summarySource = readFileSync(new URL("../client/src/components/driver/DriverLifecycleSummary.tsx", import.meta.url), "utf8");

  for (const source of [dashboardSource, walletSource]) {
    assert.match(source, /useDriverPaymentLifecycle/);
    assert.match(source, /DriverLifecycleSummary/);
  }
  assert.match(summarySource, /driver\.lifecycle\.awaitingReview/);
  assert.match(summarySource, /driver\.lifecycle\.verifiedAwaitingPayment/);
  assert.match(summarySource, /driver\.lifecycle\.loading/);
  assert.doesNotMatch(summarySource, /driver\.lifecycle\.noPaymentScheduled/);
  assert.doesNotMatch(dashboardSource, /text-dashboard-pending-balance/);
  assert.doesNotMatch(walletSource, /text-pending-balance/);
});

test("Dashboard removes ambiguous activity-derived financial cards and the legacy history query", () => {
  const source = readFileSync(new URL("../client/src/pages/driver/dashboard.tsx", import.meta.url), "utf8");
  const summarySource = readFileSync(new URL("../client/src/components/driver/DriverLifecycleSummary.tsx", import.meta.url), "utf8");
  for (const label of ["Today Earnings Net", "7-day Paid Washouts", "Total Paid Net", "/api/payments/driver-history"]) {
    assert.doesNotMatch(source, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(summarySource, /driver\.lifecycle\.paymentScheduled/);
  assert.match(summarySource, /driver\.lifecycle\.schedulingUnavailable/);
  assert.match(summarySource, /driver\.lifecycle\.paymentHistory/);
  assert.match(summarySource, /driver\.lifecycle\.paymentHistoryUnavailable/);
});

test("Dashboard refreshes dashboard, lifecycle, and wallet sources without rendering raw payment identifiers", () => {
  const source = readFileSync(new URL("../client/src/pages/driver/dashboard.tsx", import.meta.url), "utf8");
  const hookSource = readFileSync(new URL("../client/src/hooks/useDriverPaymentLifecycle.ts", import.meta.url), "utf8");
  assert.match(source, /driverLifecycle\.refresh/);
  assert.match(source, /refetchWalletBalance/);
  assert.match(hookSource, /\/api\/drivers\/activities/);
  assert.match(hookSource, /\/api\/drivers\/payments/);
  for (const sensitiveField of ["stripePaymentIntentId", "stripeTransferId", "stripeChargeId", "bankAccountId"]) {
    assert.doesNotMatch(source, new RegExp(sensitiveField));
  }
});

test("Driver lifecycle views use only driver-scoped operational and obligation endpoints", () => {
  const source = readFileSync(new URL("../client/src/hooks/useDriverPaymentLifecycle.ts", import.meta.url), "utf8");
  assert.match(source, /\/api\/drivers\/activities/);
  assert.match(source, /\/api\/drivers\/payments/);
  assert.doesNotMatch(source, /\/api\/admin\//);
  assert.doesNotMatch(source, /stripePaymentIntentId|stripeTransferId|stripeChargeId|bankAccountId/);
});

test("English and Spanish lifecycle copy supplies explicit unavailable schedule and history states", () => {
  const i18nSource = readFileSync(new URL("../client/src/lib/i18n.ts", import.meta.url), "utf8");
  for (const copy of [
    '"driver.lifecycle.awaitingReview": "Awaiting Review"',
    '"driver.lifecycle.awaitingReview": "Pendiente de revisión"',
    '"driver.lifecycle.schedulingUnavailable": "Scheduling information is unavailable."',
    '"driver.lifecycle.schedulingUnavailable": "La información de programación no está disponible."',
    '"driver.lifecycle.paymentHistoryUnavailable": "Payment history is unavailable."',
    '"driver.lifecycle.paymentHistoryUnavailable": "El historial de pagos no está disponible."',
  ]) {
    assert.match(i18nSource, new RegExp(copy.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.doesNotMatch(i18nSource, /driver\.lifecycle\.noPaymentScheduled/);
});
