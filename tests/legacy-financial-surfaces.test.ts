import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { translations, translate } from "../client/src/lib/i18n";

const page = (name: string) => readFile(new URL(`../client/src/pages/admin/${name}.tsx`, import.meta.url), "utf8");

test("legacy financial translations remain bilingual and point operators to Financial Workspace", () => {
  const keys = [
    "legacyFinancial.payments.title", "legacyFinancial.payments.notice", "legacyFinancial.fees.title",
    "legacyFinancial.fees.zeroExplanation", "legacyFinancial.billing.title", "legacyFinancial.billing.notice",
    "legacyFinancial.workspaceLink", "legacyFinancial.legacyStatus", "legacyFinancial.readOnly",
    "legacyFinancial.status.completed", "legacyFinancial.status.pending", "legacyFinancial.status.failed",
    "legacyFinancial.status.paid", "legacyFinancial.status.past_due", "legacyFinancial.status.processing",
    "legacyFinancial.status.cancelled", "legacyFinancial.status.approved", "legacyFinancial.status.settled",
  ];
  for (const key of keys) {
    assert.ok(translations.en[key], `English ${key}`);
    assert.ok(translations.es[key], `Spanish ${key}`);
    assert.notEqual(translate(key, "es"), key);
  }
  assert.match(translate("legacyFinancial.billing.notice", "en"), /No Facility is charged and no payment is scheduled/i);
  assert.match(translate("legacyFinancial.fees.zeroExplanation", "es"), /no tiene filas/i);
});

test("fees page shows canonical components separately from historical records and has no mutation control", async () => {
  const source = await page("fees");
  assert.match(source, /financialVisibility\.canonicalFees/);
  assert.match(source, /financialVisibility\.canonicalIncentives/);
  assert.match(source, /financialVisibility\.historical/);
  assert.match(source, /api\/admin\/financial-workspace\/summary/);
  assert.match(source, /api\/admin\/financial-obligations\/unbatched/);
  assert.match(source, /href="\/financial-workspace"/);
  assert.match(source, /enabled: allowed/);
  assert.doesNotMatch(source, /fees\/generate|useMutation|retryFee|Generate Fees|Export CSV|button-retry|legacyReference|legacy_fee_/i);
});

test("legacy fee generation endpoint retires before reaching the write helper and scheduler remains fenced", async () => {
  const [routes, storage] = await Promise.all([
    readFile(new URL("../server/routes.ts", import.meta.url), "utf8"),
    readFile(new URL("../server/storage.ts", import.meta.url), "utf8"),
  ]);
  const start = routes.indexOf("app.post('/api/admin/fees/generate'");
  const end = routes.indexOf("app.", start + 40);
  const handler = routes.slice(start, end === -1 ? undefined : end);
  assert.ok(start >= 0, "fee-generation route is registered to return a stable retirement response");
  assert.match(handler, /retireFinancialExecutionRoute/);
  assert.ok(handler.indexOf("retireFinancialExecutionRoute") < handler.indexOf("storage.generateMonthlyFeesForDate"));
  const schedulerStart = storage.indexOf("async processDailyBatches");
  const scheduler = storage.slice(schedulerStart, storage.indexOf("private async processOwnerBatch", schedulerStart));
  assert.ok(scheduler.indexOf("isLegacyFinancialExecutionFenced") < scheduler.indexOf("generateMonthlyFeesForDate"));
});

test("legacy read endpoints allow Platform Operations roles while retaining backend role checks", async () => {
  const routes = await readFile(new URL("../server/routes.ts", import.meta.url), "utf8");
  for (const route of ["/api/admin/payments", "/api/admin/fees/ledger", "/api/admin/fees/summary", "/api/admin/billing/settings"]) {
    const start = routes.indexOf(`app.get('${route}'`);
    const end = routes.indexOf("app.", start + route.length);
    const handler = routes.slice(start, end === -1 ? undefined : end);
    assert.ok(start >= 0, `missing ${route}`);
    assert.match(handler, /user\?\.role !== 'super_admin' && user\?\.role !== 'admin'/);
    assert.match(handler, /return res\.status\(403\)/);
  }
});

test("legacy page APIs return minimal historical DTOs and generic errors", async () => {
  const routes = await readFile(new URL("../server/routes.ts", import.meta.url), "utf8");
  const between = (startText: string, endText: string) => {
    const start = routes.indexOf(startText);
    return routes.slice(start, routes.indexOf(endText, start));
  };
  const payments = between("app.get('/api/admin/payments'", "app.get('/api/admin/subscriptions'");
  const fees = between("app.get('/api/admin/fees/ledger'", "app.get('/api/admin/fees/summary'");
  const billing = between("app.get('/api/admin/billing/settings'", "app.get('/api/admin/billing/settings/:ownerId'");

  assert.match(payments, /payments\.map/);
  assert.doesNotMatch(payments, /res\.json\(payments\)|processingFee|stripe|activity:|summarizeDatabaseError/i);
  assert.match(payments, /status\(500\)\.json\(\{ message: "Legacy payment records are unavailable" \}\)/);
  assert.match(fees, /fees\.map/);
  assert.doesNotMatch(fees, /res\.json\(fees\)|ownerId|stripe|paymentIntent|fee\.id/i);
  assert.match(fees, /status\(500\)\.json\(\{ message: "Legacy fee ledger is unavailable" \}\)/);
  assert.match(billing, /owners: billingSettings\.map/);
  assert.doesNotMatch(billing, /buildOwnerBillingReceivablesOverview|immediateBilling|stripe|ownerId|companyName|username|logReportingReconciliation/i);
  assert.match(billing, /status\(500\)\.json\(\{ message: "Legacy billing configuration is unavailable" \}\)/);
});

test("legacy billing page removes execution, preview, and configuration mutation controls", async () => {
  const source = await page("billing-settings");
  assert.match(source, /legacyFinancial\.billing\.title/);
  assert.match(source, /role="alert"/);
  assert.match(source, /href="\/financial-workspace"/);
  assert.match(source, /enabled: allowed/);
  assert.doesNotMatch(source, /process-batches|preview-owner-washout|useMutation|Run Billing Now|Stripe ID|Stripe Charge|button-run-billing|legacyReference|legacy_facility_/i);
});

test("legacy payment page is read-only, noncanonical, and avoids raw provider identifiers", async () => {
  const source = await page("payments");
  assert.match(source, /legacyFinancial\.payments\.title/);
  assert.match(source, /legacyFinancial\.legacyStatus/);
  assert.match(source, /role="alert"/);
  assert.match(source, /href="\/financial-workspace"/);
  assert.match(source, /enabled: allowed/);
  assert.doesNotMatch(source, /stripePaymentIntentId|useMutation|process-batch|process-payout|Payment History|Total Revenue|Net Platform Revenue|legacyReference|legacy_payment_/);
});

test("legacy surfaces retain clear headings, alerts, and accessible canonical links", async () => {
  for (const name of ["payments", "fees", "billing-settings"]) {
    const source = await page(name);
    assert.match(source, /<h1/);
    assert.match(source, /role="alert"/);
    assert.match(source, /href="\/financial-workspace"/);
    assert.doesNotMatch(source, /disabled=|onClick=|onKeyDown=|onKeyUp=|onSubmit=/);
  }
});

test("admin navigation preserves Financial Workspace as the primary destination and exposes separate fees and billing readiness", async () => {
  const [nav, app] = await Promise.all([
    readFile(new URL("../client/src/components/MobileNav.tsx", import.meta.url), "utf8"),
    readFile(new URL("../client/src/App.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(nav, /path: "\/financial-workspace"[\s\S]*financialWorkspace\.nav/);
  assert.match(nav, /path: "\/payments"[\s\S]*legacyFinancial\.nav\.payments/);
  assert.match(nav, /path: "\/fees"[\s\S]*financialVisibility\.fees\.title/);
  assert.match(nav, /path: "\/billing"[\s\S]*financialVisibility\.billing\.title/);
  assert.match(app, /path="\/billing" component=\{AdminBilling\}/);
  assert.match(app, /role === 'admin' \|\| \(user as any\)\.role === 'super_admin'/);
});

test("fees and billing readiness remain read-only, bilingual, and available only to Platform Operations", async () => {
  const [fees, billing] = await Promise.all([page("fees"), page("billing")]);
  for (const source of [fees, billing]) {
    assert.match(source, /isPlatformOperationsRole/);
    assert.match(source, /enabled: allowed/);
    assert.match(source, /href="\/financial-workspace"/);
    assert.doesNotMatch(source, /useMutation|process-payout|process-batch|stripePaymentIntentId|treasury|wallet/i);
  }
  assert.match(billing, /financialVisibility\.readiness/);
  assert.match(billing, /financialVisibility\.blockers/);
  assert.match(billing, /financialVisibility\.historical/);
});

test("browser metadata includes the standard mobile capability declaration and login fields expose autocomplete", async () => {
  const [html, login] = await Promise.all([
    readFile(new URL("../client/index.html", import.meta.url), "utf8"),
    readFile(new URL("../client/src/pages/auth/login.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(html, /name="mobile-web-app-capable" content="yes"/);
  assert.match(html, /name="apple-mobile-web-app-capable" content="yes"/);
  assert.match(login, /autoComplete="username"/);
  assert.match(login, /autoComplete="current-password"/);
});
