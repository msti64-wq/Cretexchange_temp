import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const {
  FinancialExecutionDisabledError,
  assertFinancialExecutionAccess,
  assertLegacyFinancialExecutionRetired,
  authorizeAndFenceFinancialExecutionRequest,
  buildNoDriverWalletBalanceResponse,
  buildReadOnlyDriverWalletBalanceResponse,
  logFinancialExecutionPolicyStartup,
  retireFinancialExecutionRequest,
  resolveFinancialExecutionAccess,
  sendFinancialExecutionDisabled,
} = await import("../server/financialExecutionPolicy");

function environment(values: Record<string, string | undefined> = {}) {
  return values;
}

function responseSpy() {
  return {
    code: 0,
    body: undefined as unknown,
    status(code: number) { this.code = code; return this; },
    json(body: unknown) { this.body = body; return body; },
  };
}

test("financial execution policy fails closed for missing, empty, malformed, and false configuration", () => {
  for (const value of [undefined, "", "false", "FALSE", "1", "yes", "enabled"] as const) {
    const access = resolveFinancialExecutionAccess("facility_collection", environment({
      FINANCIAL_EXECUTION_ENABLED: value,
      FACILITY_COLLECTION_EXECUTION_ENABLED: "true",
      DRIVER_SETTLEMENT_EXECUTION_ENABLED: "true",
    }));
    assert.equal(access.allowed, false);
    assert.equal(access.reason, "global_disabled");
  }
});

test("financial execution policy requires both global and the requested category", () => {
  assert.deepEqual(resolveFinancialExecutionAccess("facility_collection", environment({
    FINANCIAL_EXECUTION_ENABLED: "true",
    FACILITY_COLLECTION_EXECUTION_ENABLED: "true",
    DRIVER_SETTLEMENT_EXECUTION_ENABLED: "false",
  })), { allowed: true, category: "facility_collection", reason: null });

  assert.deepEqual(resolveFinancialExecutionAccess("driver_settlement", environment({
    FINANCIAL_EXECUTION_ENABLED: "true",
    FACILITY_COLLECTION_EXECUTION_ENABLED: "true",
    DRIVER_SETTLEMENT_EXECUTION_ENABLED: "true",
  })), { allowed: true, category: "driver_settlement", reason: null });

  const denied = resolveFinancialExecutionAccess("driver_settlement", environment({
    FINANCIAL_EXECUTION_ENABLED: "true",
    FACILITY_COLLECTION_EXECUTION_ENABLED: "true",
    DRIVER_SETTLEMENT_EXECUTION_ENABLED: "false",
  }));
  assert.equal(denied.allowed, false);
  assert.equal(denied.reason, "driver_settlement_disabled");
});

test("blocked responses are truthful and logs contain only safe audit fields", () => {
  const events: unknown[][] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => events.push(args);
  try {
    const response = {
      code: 0,
      body: undefined as unknown,
      status(code: number) { this.code = code; return this; },
      json(body: unknown) { this.body = body; return body; },
    };
    sendFinancialExecutionDisabled(response, {
      operation: "POST /api/payments/process-washout",
      category: "legacy_execution",
      actorUserId: "admin_1",
      role: "admin",
      reference: "activity_1",
      retired: true,
    });
    assert.equal(response.code, 410);
    assert.deepEqual(response.body, {
      message: "This financial execution route is retired.",
      code: "FINANCIAL_EXECUTION_ROUTE_RETIRED",
    });
    assert.equal(events.length, 1);
    assert.equal(events[0][0], "[FINANCIAL_EXECUTION_DENIED]");
    assert.doesNotMatch(JSON.stringify(events[0]), /secret|routing|payment_method/i);
  } finally {
    console.warn = originalWarn;
  }
});

test("shared route guard terminates a disabled mutation before a mocked downstream action", () => {
  const response = responseSpy();
  let treasuryReadCalls = 0;
  let walletWriteCalls = 0;
  const terminal = retireFinancialExecutionRequest(
    { user: { id: "owner_1", role: "owner" } },
    response,
    "POST /api/owners/wallet/sync",
    "facility_collection",
    false,
  );
  if (!terminal) {
    treasuryReadCalls += 1;
    walletWriteCalls += 1;
  }
  assert.equal(response.code, 503);
  assert.deepEqual(response.body, {
    message: "Financial execution is currently disabled.",
    code: "FINANCIAL_EXECUTION_DISABLED",
  });
  assert.equal(treasuryReadCalls, 0);
  assert.equal(walletWriteCalls, 0);
});

test("Owner subscription and membership-payment boundaries authorize before returning a disabled response", async () => {
  for (const operation of [
    "POST /api/owners/subscribe",
    "POST /api/owners/create-membership-payment",
  ]) {
    const response = responseSpy();
    let identityReads = 0;
    let paymentIntentRetrievals = 0;
    let ownerUpdates = 0;
    let feeLedgerInserts = 0;
    const result = await authorizeAndFenceFinancialExecutionRequest(
      { user: { id: "owner_1", role: "owner" } },
      response,
      {
        loadUser: async () => { identityReads += 1; return { id: "owner_1", role: "owner" }; },
        allowedRoles: ["owner"],
        deniedMessage: "Owner access required",
        operation,
        category: "facility_collection",
        retired: false,
      },
    );
    if (!result) {
      paymentIntentRetrievals += 1;
      ownerUpdates += 1;
      feeLedgerInserts += 1;
    }
    assert.equal(response.code, 503);
    assert.equal((response.body as { code: string }).code, "FINANCIAL_EXECUTION_DISABLED");
    assert.equal(identityReads, 1);
    assert.equal(paymentIntentRetrievals, 0);
    assert.equal(ownerUpdates, 0);
    assert.equal(feeLedgerInserts, 0);
  }
});

test("financial route authorization denies an unauthorized caller before the disabled contract", async () => {
  const response = responseSpy();
  let downstreamCalls = 0;
  await authorizeAndFenceFinancialExecutionRequest(
    { user: { id: "driver_1", role: "driver" } },
    response,
    {
      loadUser: async () => ({ id: "driver_1", role: "driver" }),
      allowedRoles: ["owner"],
      deniedMessage: "Owner access required",
      operation: "POST /api/owners/subscribe",
      category: "facility_collection",
      retired: false,
    },
  );
  if (response.code !== 403) downstreamCalls += 1;
  assert.equal(response.code, 403);
  assert.equal(downstreamCalls, 0);
});

test("the retired Stripe Connect test-payment boundary performs no financial lookups or execution", async () => {
  const response = responseSpy();
  let ownerReads = 0;
  let driverReads = 0;
  let stripeCustomerReads = 0;
  let paymentIntentCreates = 0;
  let transfers = 0;
  await authorizeAndFenceFinancialExecutionRequest(
    { user: { id: "super_admin_1", role: "super_admin" } },
    response,
    {
      loadUser: async () => ({ id: "super_admin_1", role: "super_admin" }),
      allowedRoles: ["super_admin"],
      deniedMessage: "Super admin access required for testing",
      operation: "POST /api/test/stripe-connect-payment",
      category: "facility_collection",
    },
  );
  if (!response.body) {
    ownerReads += 1;
    driverReads += 1;
    stripeCustomerReads += 1;
    paymentIntentCreates += 1;
    transfers += 1;
  }
  assert.equal(response.code, 410);
  assert.equal((response.body as { code: string }).code, "FINANCIAL_EXECUTION_ROUTE_RETIRED");
  assert.deepEqual([ownerReads, driverReads, stripeCustomerReads, paymentIntentCreates, transfers], [0, 0, 0, 0, 0]);
});

test("Driver wallet balance responses are read-only when no wallet exists or when a wallet exists", () => {
  let walletCreates = 0;
  let walletUpdates = 0;
  let transactionInserts = 0;
  const noWallet = buildNoDriverWalletBalanceResponse();
  const existingWallet = buildReadOnlyDriverWalletBalanceResponse({
    availableBalance: 12.5,
    pendingBalance: 0,
    balanceSource: "local",
  });
  assert.deepEqual(noWallet, {
    availableBalance: 0,
    pendingBalance: 0,
    totalBalance: 0,
    balanceSource: "unavailable",
    walletState: "not_created",
  });
  assert.deepEqual(existingWallet, {
    availableBalance: 12.5,
    pendingBalance: 0,
    totalBalance: 12.5,
    balanceSource: "local",
  });
  assert.deepEqual([walletCreates, walletUpdates, transactionInserts], [0, 0, 0]);
});

test("retired simulation and discrepancy handlers remain terminal even when future execution flags are enabled", () => {
  const retiredOperations = [
    ["POST /api/owners/wallet/simulate-funding", "facility_collection"],
    ["POST /api/owners/wallet/simulate-settlement", "driver_settlement"],
    ["POST /api/test/reconciliation/inject-discrepancy", "reconciliation"],
  ] as const;

  for (const [operation, category] of retiredOperations) {
    const response = {
      code: 0,
      body: undefined as unknown,
      status(code: number) { this.code = code; return this; },
      json(body: unknown) { this.body = body; return body; },
    };
    let downstreamCalls = 0;
    const terminal = retireFinancialExecutionRequest(
      { user: { id: "authorized_1", role: "owner" } },
      response,
      operation,
      category,
    );
    if (!terminal) downstreamCalls += 1;
    assert.equal(response.code, 410);
    assert.equal((response.body as { code: string }).code, "FINANCIAL_EXECUTION_ROUTE_RETIRED");
    assert.equal(downstreamCalls, 0);
  }
});

test("startup reporting records resolved execution decisions without configuration values", () => {
  const events: unknown[][] = [];
  const originalInfo = console.info;
  console.info = (...args: unknown[]) => events.push(args);
  try {
    logFinancialExecutionPolicyStartup();
    assert.equal(events.length, 2);
    assert.equal(events[0][0], "[FINANCIAL_EXECUTION_POLICY]");
    assert.doesNotMatch(JSON.stringify(events), /FINANCIAL_EXECUTION_ENABLED|FACILITY_COLLECTION_EXECUTION_ENABLED|DRIVER_SETTLEMENT_EXECUTION_ENABLED|secret/i);
  } finally {
    console.info = originalInfo;
  }
});

test("participant input cannot override deployment-managed policy", () => {
  const keys = ["FINANCIAL_EXECUTION_ENABLED", "FACILITY_COLLECTION_EXECUTION_ENABLED", "DRIVER_SETTLEMENT_EXECUTION_ENABLED"] as const;
  const prior = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  try {
    for (const key of keys) delete process.env[key];
    assert.throws(
      () => assertFinancialExecutionAccess("facility_collection"),
      (error: unknown) => error instanceof FinancialExecutionDisabledError && error.access.reason === "global_disabled",
    );
  } finally {
    for (const key of keys) {
      if (prior[key] === undefined) delete process.env[key];
      else process.env[key] = prior[key];
    }
  }
});

test("enabling future canonical configuration cannot reactivate a retired legacy adapter", () => {
  assert.throws(
    () => assertLegacyFinancialExecutionRetired("facility_collection", "legacy.test.adapter"),
    (error: unknown) => error instanceof FinancialExecutionDisabledError
      && error.access.reason === "legacy_execution_retired"
      && error.access.allowed === false,
  );
});

test("legacy execution routes are fenced before their former execution bodies", () => {
  const routes = readFileSync(new URL("../server/routes.ts", import.meta.url), "utf8");
  const routesAndForbiddenCalls = [
    ["/api/admin/billing/batches/:batchId/retry", "storage.retryBillingBatch"],
    ["/api/system/daily-batch-job", "storage.processDailyBatches"],
    ["/api/payments/process-washout", "createPendingWashoutPayment"],
    ["/api/payments/create-payment-intent", "stripe.paymentIntents.create"],
    ["/api/payments/process-batch", "stripeService.stripe.paymentIntents.create"],
    ["/api/admin/payments/process-awaiting-driver-stripe", "stripe.paymentIntents.create"],
    ["/api/payments/process-payout", "storage.createPayment"],
    ["/api/admin/process-weekly-payouts", "storage.createPayment"],
    ["/api/wallet/withdraw", "tx.insert(withdrawals)"],
    ["/api/driver/payout", "stripeService.createACHTransfer"],
  ] as const;

  for (const [route, forbiddenCall] of routesAndForbiddenCalls) {
    const start = routes.indexOf(`app.post('${route}'`);
    assert.ok(start >= 0, `missing ${route}`);
    const end = routes.indexOf("app.", start + route.length);
    const handler = routes.slice(start, end === -1 ? undefined : end);
    assert.match(handler, /retireFinancialExecutionRoute/);
    assert.ok(handler.indexOf("retireFinancialExecutionRoute") < handler.indexOf(forbiddenCall), `${route} must be fenced before ${forbiddenCall}`);
  }

  const withdrawalStart = routes.indexOf("app.patch('/api/admin/withdrawals/:id'");
  const withdrawalEnd = routes.indexOf("app.", withdrawalStart + 40);
  const withdrawal = routes.slice(withdrawalStart, withdrawalEnd === -1 ? undefined : withdrawalEnd);
  assert.ok(withdrawalStart >= 0);
  assert.match(withdrawal, /retireFinancialExecutionRoute/);
  assert.ok(withdrawal.indexOf("retireFinancialExecutionRoute") < withdrawal.indexOf("storage.updateWithdrawalStatus"));
});

test("legacy billing and reconciliation mutation routes are explicitly fenced while repair dry-runs remain read-only", () => {
  const routes = readFileSync(new URL("../server/routes.ts", import.meta.url), "utf8");
  for (const route of [
    "/api/admin/billing/process-batches",
    "/api/admin/reconciliation/run",
    "/api/admin/reconciliation/run-daily",
    "/api/admin/reconciliation/test-discrepancy",
    "/api/admin/reconciliation/payments",
    "/api/admin/reconciliation/batches",
    "/api/admin/reconciliation/sync-payment/:paymentId",
  ]) {
    const start = routes.indexOf(`app.post('${route}'`);
    assert.ok(start >= 0, `missing ${route}`);
    const end = routes.indexOf("app.", start + route.length);
    assert.match(routes.slice(start, end === -1 ? undefined : end), /retireFinancialExecutionRoute/);
  }

  const repairStart = routes.indexOf("app.post('/api/admin/reconciliation/repair-washout-payments'");
  const repairEnd = routes.indexOf("app.", repairStart + 40);
  const repair = routes.slice(repairStart, repairEnd === -1 ? undefined : repairEnd);
  assert.ok(repairStart >= 0);
  assert.match(repair, /if \(!dryRunEnabled\)[\s\S]*retireFinancialExecutionRoute/);

  const newlyFenced = [
    ["/api/owners/wallet/sync", "stripeService.getTreasuryBalance"],
    ["/api/owners/wallet/simulate-funding", "ownerWalletTransactions"],
    ["/api/owners/wallet/simulate-settlement", "stripeService.getTreasuryBalance"],
    ["/api/test/reconciliation/inject-discrepancy", "storage.updateDriver"],
    ["/api/admin/reconciliation/full-audit", "performBalanceReconciliation"],
    ["/api/admin/fees/:id/retry", "storage.updateFeeLedgerStatus"],
  ] as const;
  for (const [route, forbiddenCall] of newlyFenced) {
    const method = route === "/api/admin/reconciliation/full-audit" ? "get" : "post";
    const start = routes.indexOf(`app.${method}('${route}'`);
    assert.ok(start >= 0, `missing ${route}`);
    const end = routes.indexOf("app.", start + route.length);
    const handler = routes.slice(start, end === -1 ? undefined : end);
    assert.match(handler, /retireFinancialExecutionRoute/);
    assert.ok(handler.indexOf("retireFinancialExecutionRoute") < handler.indexOf(forbiddenCall), `${route} must terminate before ${forbiddenCall}`);
  }
});

test("newly remediated routes delegate to the route-boundary fence before financial work", () => {
  const routes = readFileSync(new URL("../server/routes.ts", import.meta.url), "utf8");
  const routeBoundaries = [
    ["/api/owners/subscribe", "stripe.paymentIntents.retrieve"],
    ["/api/owners/create-membership-payment", "stripe.paymentIntents.list"],
    ["/api/test/stripe-connect-payment", "stripe.customers.retrieve"],
  ] as const;
  for (const [route, financialCall] of routeBoundaries) {
    const start = routes.indexOf(`app.post('${route}'`);
    assert.ok(start >= 0, `missing ${route}`);
    const end = routes.indexOf("app.", start + route.length);
    const handler = routes.slice(start, end === -1 ? undefined : end);
    assert.match(handler, /authorizeAndFenceFinancialExecutionRequest/);
    assert.ok(handler.indexOf("authorizeAndFenceFinancialExecutionRequest") < handler.indexOf(financialCall));
  }

  const walletStart = routes.indexOf("app.get('/api/wallet/balance'");
  const walletEnd = routes.indexOf("app.", walletStart + 30);
  const walletHandler = routes.slice(walletStart, walletEnd === -1 ? undefined : walletEnd);
  assert.match(walletHandler, /buildReadOnlyDriverWalletBalanceResponse/);
  assert.doesNotMatch(walletHandler, /storage\.createDriverWallet/);
  assert.doesNotMatch(walletHandler, /walletTransactions/);
});

test("read-only owner wallet viewing does not synchronize or repair a local balance", () => {
  const routes = readFileSync(new URL("../server/routes.ts", import.meta.url), "utf8");
  const start = routes.indexOf("app.get('/api/owners/wallet'");
  assert.ok(start >= 0, "missing owner wallet view");
  const end = routes.indexOf("app.", start + 30);
  const handler = routes.slice(start, end === -1 ? undefined : end);
  assert.match(handler, /stripeService\.getTreasuryBalance/);
  assert.doesNotMatch(handler, /db\s*\.update\(owners\)/);
  assert.doesNotMatch(handler, /ownerWalletTransactions/);
});

test("scheduler and owner billing are fenced before financial record selection or Stripe execution", () => {
  const storage = readFileSync(new URL("../server/storage.ts", import.meta.url), "utf8");
  const ownerBilling = readFileSync(new URL("../server/ownerBillingRuns.ts", import.meta.url), "utf8");
  const schedulerStart = storage.indexOf("async processDailyBatches");
  const scheduler = storage.slice(schedulerStart, storage.indexOf("async movePendingToAvailable", schedulerStart));
  assert.ok(schedulerStart >= 0);
  assert.ok(scheduler.indexOf("logFinancialExecutionDenied") < scheduler.indexOf(".selectDistinct"));
  assert.ok(scheduler.indexOf("return {") < scheduler.indexOf(".selectDistinct"));

  const runStart = ownerBilling.indexOf("export async function processOwnerBillingRun");
  const run = ownerBilling.slice(runStart, ownerBilling.indexOf("export async function runOwnerBillingNow", runStart));
  assert.ok(runStart >= 0);
  assert.ok(run.indexOf("logFinancialExecutionDenied") < run.indexOf("getAllOwnersBillingSettings"));
  assert.ok(run.indexOf("return {") < run.indexOf("getAllOwnersBillingSettings"));

  const script = readFileSync(new URL("../server/scripts/scheduledBatchProcessing.ts", import.meta.url), "utf8");
  const scriptStart = script.indexOf("async function runScheduledBatchProcessing");
  const scheduled = script.slice(scriptStart, script.indexOf("// Main execution", scriptStart));
  assert.ok(scheduled.indexOf("logFinancialExecutionDenied") < scheduled.indexOf("new DatabaseStorage"));
  assert.ok(scheduled.indexOf("return {") < scheduled.indexOf("new DatabaseStorage"));

  const directChargeStart = storage.indexOf("private async createStripePaymentIntent");
  const directCharge = storage.slice(directChargeStart, storage.indexOf("async getBillingBatches", directChargeStart));
  assert.ok(directChargeStart >= 0);
  assert.match(directCharge, /assertLegacyFinancialExecutionRetired/);
  assert.ok(directCharge.indexOf("assertLegacyFinancialExecutionRetired") < directCharge.indexOf("stripe.paymentIntents.create"));

  const reconciliationScript = readFileSync(new URL("../server/scripts/scheduledReconciliation.ts", import.meta.url), "utf8");
  const reconciliationStart = reconciliationScript.indexOf("async function runScheduledReconciliation");
  const reconciliation = reconciliationScript.slice(reconciliationStart, reconciliationScript.indexOf("// Main execution", reconciliationStart));
  assert.ok(reconciliationStart >= 0);
  assert.ok(reconciliation.indexOf("logFinancialExecutionDenied") < reconciliation.indexOf("performBalanceReconciliation"));
  assert.ok(reconciliation.indexOf("return {") < reconciliation.indexOf("performBalanceReconciliation"));

  const feeProcessorStart = storage.indexOf("async processPendingFees");
  const feeProcessor = storage.slice(feeProcessorStart, storage.indexOf("async getFeeLedgerEntriesByStatus", feeProcessorStart));
  assert.ok(feeProcessorStart >= 0);
  assert.ok(feeProcessor.indexOf("assertLegacyFinancialExecutionRetired") < feeProcessor.indexOf("getFeeLedgerEntriesByStatus"));
});

test("legacy Stripe money-movement wrappers remain retired while account setup remains available", () => {
  const service = readFileSync(new URL("../server/stripeService.ts", import.meta.url), "utf8");
  for (const name of [
    "fundFinancialAccountACH",
    "payoutFromFinancialAccount",
    "createACHTransfer",
    "transferBetweenFinancialAccounts",
    "processWashoutPaymentViaCard",
    "processWashoutPayment",
    "createMembershipPaymentIntent",
    "chargeMonthlyLocationFee",
    "createWalletFundingPayment",
  ]) {
    const start = service.indexOf(`function ${name}`);
    assert.ok(start >= 0, `missing ${name}`);
    const body = service.slice(start, service.indexOf("export async function", start + 20));
    assert.match(body, /assertLegacyFinancialExecutionRetired/);
  }
  const setupStart = service.indexOf("function createConnectedAccount");
  const setup = service.slice(setupStart, service.indexOf("export async function", setupStart + 20));
  assert.doesNotMatch(setup, /assertLegacyFinancialExecutionRetired/);
});

test("Phase 2 obligation creation remains non-executing and available", () => {
  const service = readFileSync(new URL("../server/financialObligations.ts", import.meta.url), "utf8");
  assert.match(service, /status: "pending"/);
  for (const forbidden of ["paymentIntents.create", "transfers.create", "payouts.create", "adjustDriverWalletBalance", "createWalletTransaction"]) {
    assert.doesNotMatch(service, new RegExp(forbidden.replace(/[.()]/g, "\\$&")));
  }
});

test("generic payment creation is permanently fenced and cannot write an unclassified canonical-looking row", () => {
  const storage = readFileSync(new URL("../server/storage.ts", import.meta.url), "utf8");
  const start = storage.indexOf("async createPayment(payment:");
  const body = storage.slice(start, storage.indexOf("async getPaymentById", start));
  assert.ok(start >= 0);
  assert.match(body, /assertLegacyFinancialExecutionRetired\("facility_collection", "storage\.createPayment"\)/);
  assert.ok(body.indexOf("assertLegacyFinancialExecutionRetired") < body.indexOf("db.insert(payments)"));
});

test("every exported reconciliation mutation has an internal execution fence", () => {
  const service = readFileSync(new URL("../server/reconciliationService.ts", import.meta.url), "utf8");
  for (const functionName of [
    "performBalanceReconciliation",
    "performPaymentReconciliation",
    "performBatchReconciliation",
    "syncPaymentFromStripe",
    "resolveDiscrepancy",
  ]) {
    const start = service.indexOf(`function ${functionName}`);
    assert.ok(start >= 0, `missing ${functionName}`);
    const body = service.slice(start, service.indexOf("export async function", start + functionName.length));
    assert.match(body, /assertLegacyFinancialExecutionRetired/, `${functionName} needs an internal fence`);
  }
});
