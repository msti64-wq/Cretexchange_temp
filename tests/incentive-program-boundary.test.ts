import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgres://user:pass@127.0.0.1:1/cretexchange_test";

const history = await import("../server/financialHistory");
const [storageSource, routesSource, migrationSource, schemaSource, ledgerSource] = await Promise.all([
  readFile(new URL("../server/storage.ts", import.meta.url), "utf8"),
  readFile(new URL("../server/routes.ts", import.meta.url), "utf8"),
  readFile(new URL("../migrations/0026_classify_pre_clean_slate_financial_history.sql", import.meta.url), "utf8"),
  readFile(new URL("../shared/schema.ts", import.meta.url), "utf8"),
  readFile(new URL("../server/billing/ownerWashoutLedger.ts", import.meta.url), "utf8"),
]);

test("the Central-time cutoff classifies before, at, and after correctly", () => {
  assert.equal(history.isHistoricalFinancialTestActivity({ verifiedAt: "2026-07-17T04:59:59.000Z" }), true);
  assert.equal(history.isHistoricalFinancialTestActivity({ verifiedAt: "2026-07-17T05:00:00.000Z" }), false);
  assert.equal(history.isHistoricalFinancialTestActivity({ verifiedAt: "2026-07-17T05:00:01.000Z" }), false);
});

test("a linked post-cutoff record inherits the historical source-activity classification", () => {
  assert.equal(history.isHistoricalFinancialTestActivity({ verifiedAt: "2026-07-16T18:00:00.000Z", createdAt: "2026-07-17T12:00:00.000Z" }), true);
});

test("current driver activities, payments, statistics, and notifications are history-filtered server-side", () => {
  for (const method of ["getActivitiesByDriver", "getRecentActivitiesByDriver", "getPaymentsByDriver", "getDriverStats", "getNotificationsByUser", "getUnreadNotificationsByUser"]) {
    assert.match(storageSource, new RegExp(`(?:async )?${method}`));
  }
  assert.match(storageSource, /financialHistoryRecords\.recordType} = 'washout_activity'/);
  assert.match(storageSource, /financialHistoryRecords\.recordType} = 'notification'/);
  assert.match(routesSource, /app\.get\('\/api\/drivers\/activities'/);
  assert.match(routesSource, /requireCurrentProgramHistorySchema\(res\)/);
});

test("historical activities cannot create new active reward entries", () => {
  const createStart = storageSource.indexOf("async createDriverLotteryEntry");
  const createEnd = storageSource.indexOf("async getDriverLotteryEntryByActivity", createStart);
  const createMethod = storageSource.slice(createStart, createEnd);
  assert.match(createMethod, /historical_reward_suppressed/);
  assert.match(createMethod, /financialHistoryRecords\.recordType, "washout_activity"/);
});

test("active reward counts, lifetime totals, leaderboards, and drawing candidates exclude historical entries", () => {
  for (const method of ["getDriverLotteryEntriesWithDetails", "getDriverLotteryEntryCount", "getAllDriverLotteryEntries", "getDriverLotteryEntryTotals", "getLotteryMonths"]) {
    const start = storageSource.indexOf(`async ${method}`);
    const next = storageSource.indexOf("\n  async ", start + 1);
    assert.ok(start >= 0, `${method} exists`);
    assert.match(storageSource.slice(start, next < 0 ? undefined : next), /isNull\(financialHistoryRecords\.id\)/);
  }
});

test("lottery drawing and notification routes fail closed until history protections are present", () => {
  for (const route of ["/api/lottery/status", "/api/drivers/lottery-entries", "/api/admin/lottery", "/api/admin/lottery/drawings", "/api/admin/lottery/drawings/pending", "/api/admin/lottery/drawings/:id/mark-delivered", "/api/admin/lottery/drawings/preview", "/api/admin/lottery/execute", "/api/admin/lottery/drawings/:id/winners", "/api/admin/lottery/drawings/history", "/api/admin/rewards/fulfillment/:id/history"]) {
    const start = route === "/api/admin/lottery/execute" ? routesSource.lastIndexOf(route) : routesSource.indexOf(route);
    assert.ok(start >= 0, `${route} route exists`);
    assert.match(routesSource.slice(start, start + 500), /requireCurrentProgramHistorySchema\(res\)/);
  }
});

test("current drawing history preserves mixed-period drawings but excludes historical participants and winners", () => {
  const drawingsStart = storageSource.indexOf("async getLotteryDrawings");
  const drawingsEnd = storageSource.indexOf("async getLotteryDrawingByMonthYear", drawingsStart);
  const drawings = storageSource.slice(drawingsStart, drawingsEnd);
  assert.match(drawings, /innerJoin\(\s*driverLotteryEntries/);
  assert.match(drawings, /isNull\(financialHistoryRecords\.id\)/);
  assert.match(drawings, /new Map\(rows\.map/);

  const winnersStart = storageSource.indexOf("async getLotteryDrawingWinners");
  const winnersEnd = storageSource.indexOf("async getPendingLotteryDrawings", winnersStart);
  const winners = storageSource.slice(winnersStart, winnersEnd);
  assert.match(winners, /innerJoin\(washoutActivities/);
  assert.match(winners, /isNull\(financialHistoryRecords\.id\)/);
  assert.doesNotMatch(winners, /firstPlaceDriverId/);
});

test("historical fulfillments are absent from operational history and outstanding-work selectors", () => {
  for (const method of ["getDriverLotteryFulfillments", "getLotteryDrawingFulfillments", "getLotteryDrawingFulfillmentById", "getLotteryDrawingFulfillmentHistory"]) {
    const start = storageSource.indexOf(`async ${method}`);
    const next = storageSource.indexOf("\n  async ", start + 1);
    assert.ok(start >= 0, `${method} exists`);
    assert.match(storageSource.slice(start, next < 0 ? undefined : next), /isNull\(financialHistoryRecords\.id\)/);
  }
});

test("manual winner notification requires a current eligible winner and records an idempotent lottery notification", () => {
  const start = routesSource.indexOf("/api/admin/lottery/notify-winner");
  const route = routesSource.slice(start, start + 3500);
  assert.match(route, /requireCurrentProgramHistorySchema\(res\)/);
  assert.match(route, /getLotteryDrawingByMonthYear/);
  assert.match(route, /getLotteryDrawingWinners/);
  assert.match(route, /winner_not_current_program_eligible/);
  assert.match(route, /createLotteryNotificationOnce/);
  assert.match(route, /winner_notification_already_generated/);
});

test("legacy billing schedulers and alternate execution routes remain retired before selecting records", async () => {
  const [scheduledSource, executionSource] = await Promise.all([
    readFile(new URL("../server/scripts/scheduledBatchProcessing.ts", import.meta.url), "utf8"),
    readFile(new URL("../server/financialExecutionPolicy.ts", import.meta.url), "utf8"),
  ]);
  assert.match(scheduledSource, /isLegacyFinancialExecutionFenced\(\)/);
  assert.match(scheduledSource, /legacy_scheduler_retired_pending_canonical_collection/);
  assert.match(routesSource, /retireFinancialExecutionRoute\(req, res, "POST \/api\/system\/daily-batch-job"/);
  assert.match(executionSource, /isLegacyFinancialExecutionFenced\(\): boolean \{\s*return true;/);
});

test("current reports and exports consume filtered storage projections rather than a historical query toggle", async () => {
  const reportSource = await readFile(new URL("../server/reportService.ts", import.meta.url), "utf8");
  assert.match(reportSource, /getActivitiesByOwner|storage\.getActivities/);
  assert.match(routesSource, /reportResponseToCsv/);
  assert.doesNotMatch(routesSource, /includeHistorical.*true/);
});

test("owner receivable and ledger sources use active-only storage projections and support explicit history flags", () => {
  assert.match(storageSource, /async getApprovedWashoutsForOwnerBilling[\s\S]{0,5000}isNull\(financialHistoryRecords\.id\)/);
  assert.match(storageSource, /async getPaymentsByBatchId[\s\S]{0,5000}isNull\(financialHistoryRecords\.id\)/);
  assert.match(ledgerSource, /historicalTestData !== true/);
});

test("the migration classifies the complete supported reward chain without classifying a mixed drawing", () => {
  for (const type of ["driver_lottery_entry", "lottery_drawing_winner", "lottery_drawing_fulfillment", "lottery_notification", "notification"]) {
    assert.match(migrationSource, new RegExp(`'${type}'`));
    assert.match(schemaSource, new RegExp(`'${type}'`));
  }
  assert.doesNotMatch(migrationSource, /SELECT 'lottery_drawing',/);
  assert.match(migrationSource, /n\.notification_kind = 'participant'/);
  for (const literal of ["driver_lottery_entries) <> 29", "lottery_drawings) <> 1", "lottery_drawing_winners) <> 1", "lottery_drawing_fulfillments) <> 1", "lottery_notifications) <> 2"]) {
    assert.match(migrationSource, new RegExp(literal.replace(/[()]/g, "\\$&")));
  }
  assert.match(migrationSource, /already applied; no additional classification was attempted/);
});

test("historical audit access is explicit, aggregate-only, and Platform Operations restricted", () => {
  const start = routesSource.indexOf("/api/admin/financial-history/incentives");
  const route = routesSource.slice(start, start + 2200);
  assert.match(route, /isPlatformFinancialOperationsRole/);
  assert.match(route, /COUNT\(\*\)::integer/);
  assert.match(route, /historical_test_data_audit_only/);
  assert.doesNotMatch(route, /select\(\{[^}]*recordId/);
});

test("the missing history schema is fail-closed for current program APIs without changing washout submission", () => {
  assert.match(routesSource, /financial_history_schema_unavailable/);
  assert.match(routesSource, /Operational check-in and review paths do not call/);
});
