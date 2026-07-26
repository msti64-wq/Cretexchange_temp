import assert from "node:assert/strict";
import test from "node:test";
import {
  ADMIN_ACTIVITY_REPORT_MAX_CSV_ROWS,
  AdminActivityReportExportLimitError,
  adminActivityReportToCsv,
  buildAdminActivityReport,
  buildBoundedAdminActivityCsv,
  canAccessAdminActivityReports,
  parseAdminActivityReportQuery,
  resolveAdminActivityDateRange,
  type AdminActivityQueryExecutor,
} from "../server/adminActivityReporting";
import { registerRoutes } from "../server/routes";
import { storage } from "../server/storage";
import { db } from "../server/db";

const fixedNow = new Date(2026, 6, 26, 14, 30, 0);

test("admin activity reports use bounded server-side filters, pagination, and canonical status values", () => {
  const parsed = parseAdminActivityReportQuery({
    dateRange: "current_month",
    status: "verified",
    driver: "Driver One",
    facility: "North Yard",
    page: "2",
    pageSize: "250",
    sort: "verified",
    direction: "desc",
  }, "driver");

  assert.equal(parsed.page, 2);
  assert.equal(parsed.pageSize, 100);
  assert.equal(parsed.status, "verified");
  assert.equal(parsed.driverQuery, "Driver One");
  assert.equal(parsed.facilityQuery, "North Yard");
  assert.throws(() => parseAdminActivityReportQuery({ status: "approved" }, "driver"), /Unsupported activity status/);
  assert.throws(() => parseAdminActivityReportQuery({ dateRange: "all" }, "driver"), /Unsupported date range/);
});

test("date ranges use the existing server-local date policy and include the requested calendar windows", () => {
  const currentMonth = resolveAdminActivityDateRange({ dateRange: "current_month" }, fixedNow);
  const previousMonth = resolveAdminActivityDateRange({ dateRange: "previous_month" }, fixedNow);
  const currentYear = resolveAdminActivityDateRange({ dateRange: "current_year" }, fixedNow);
  const custom = resolveAdminActivityDateRange({ dateRange: "custom", startDate: "2026-07-01", endDate: "2026-07-05" }, fixedNow);

  assert.equal(currentMonth.start.getDate(), 1);
  assert.equal(currentMonth.end.getMonth(), 7);
  assert.equal(previousMonth.start.getMonth(), 5);
  assert.equal(currentYear.start.getMonth(), 0);
  assert.equal(currentYear.end.getFullYear(), 2027);
  assert.equal(custom.end.getDate(), 6);
  assert.equal(custom.timezoneLabel, "Server local time");
});

test("driver activity aggregation performs a bounded summary and grouped page query without per-row follow-up queries", async () => {
  const queries: unknown[] = [];
  const executor: AdminActivityQueryExecutor = {
    async execute(query) {
      queries.push(query);
      if (queries.length === 1) {
        return { rows: [{ total_activity_count: "12", verified_count: "8", pending_count: "3", rejected_count: "1", admin_review_count: "2", group_count: "4", unique_driver_count: "4" }] };
      }
      return { rows: [{ entity_id: "driver-123456", display_name: "Driver One", total_count: "4", verified_count: "3", pending_count: "1", rejected_count: "0", admin_review_count: "1", first_activity_at: "2026-07-01T12:00:00.000Z", latest_activity_at: "2026-07-24T12:00:00.000Z", total_rows: "4" }] };
    },
  };

  const report = await buildAdminActivityReport(executor, parseAdminActivityReportQuery({ dateRange: "last_30_days" }, "driver"), fixedNow);
  assert.equal(queries.length, 2);
  assert.equal(report.summary.verifiedCount, 8);
  assert.equal(report.summary.uniqueActiveDriverCount, 4);
  assert.equal(report.summary.averageVerifiedPerActiveDriver, 2);
  assert.equal(report.rows[0].reference, "DRIVER-1");
  assert.equal(report.rows[0].adminReviewCount, 1);
  assert.equal(report.pagination.totalRows, 4);
});

test("facility reports retain owner context and distinct-driver counts without exposing financial or contact fields", async () => {
  let call = 0;
  const executor: AdminActivityQueryExecutor = {
    async execute() {
      call += 1;
      return call === 1
        ? { rows: [{ total_activity_count: 7, verified_count: 5, pending_count: 1, rejected_count: 1, admin_review_count: 1, group_count: 2, unique_driver_count: 3 }] }
        : { rows: [{ entity_id: "yard-123456", display_name: "North Yard", owner_display_name: "North Concrete", total_count: 4, verified_count: 3, pending_count: 1, rejected_count: 0, admin_review_count: 1, unique_driver_count: 2, first_activity_at: null, latest_activity_at: null, total_rows: 2 }] };
    },
  };
  const report = await buildAdminActivityReport(executor, parseAdminActivityReportQuery({ dateRange: "today", sort: "unique_drivers" }, "facility"), fixedNow);
  const csv = adminActivityReportToCsv(report);

  assert.equal(report.rows[0].ownerName, "North Concrete");
  assert.equal(report.rows[0].uniqueDriverCount, 2);
  assert.match(csv, /Facility Owner/);
  assert.doesNotMatch(csv, /email|phone|stripe|wallet|payment/i);
});

test("activity reporting access is admin-only and export rejects an unsafe group count", async () => {
  assert.equal(canAccessAdminActivityReports("admin"), true);
  assert.equal(canAccessAdminActivityReports("super_admin"), true);
  assert.equal(canAccessAdminActivityReports("owner"), false);
  assert.equal(canAccessAdminActivityReports("driver"), false);
  assert.equal(canAccessAdminActivityReports(undefined), false);

  const executor: AdminActivityQueryExecutor = {
    async execute() {
      return { rows: [{ total_activity_count: 1, verified_count: 1, pending_count: 0, rejected_count: 0, admin_review_count: 0, group_count: ADMIN_ACTIVITY_REPORT_MAX_CSV_ROWS + 1, unique_driver_count: 1, entity_id: "driver-1", display_name: "Driver", total_count: 1, first_activity_at: null, latest_activity_at: null, total_rows: ADMIN_ACTIVITY_REPORT_MAX_CSV_ROWS + 1 }] };
    },
  };
  await assert.rejects(
    () => buildBoundedAdminActivityCsv(executor, parseAdminActivityReportQuery({ dateRange: "today" }, "driver")),
    AdminActivityReportExportLimitError,
  );
});

test("activity report routes are registered, serve both report types to admins, and deny non-admin roles before querying the database", async () => {
  const gets = new Map<string, Function>();
  const app = {
    get(path: string, ...handlers: Function[]) { gets.set(path, handlers[handlers.length - 1]); },
    post() {}, put() {}, delete() {}, patch() {}, use() {},
  };
  await registerRoutes(app as never);
  const driverRoute = gets.get("/api/admin/activity-reports/drivers");
  const facilityRoute = gets.get("/api/admin/activity-reports/facilities");
  assert.equal(typeof driverRoute, "function");
  assert.equal(typeof facilityRoute, "function");

  const originalGetUser = storage.getUser;
  const originalExecute = (db as any).execute;
  try {
    let statusCode = 200;
    let payload: unknown;
    const response = {
      status(code: number) { statusCode = code; return this; },
      json(value: unknown) { payload = value; return this; },
    };
    (storage as any).getUser = async () => ({ id: "admin-user", role: "admin" });
    let queryCount = 0;
    (db as any).execute = async () => {
      queryCount += 1;
      return queryCount % 2 === 1
        ? { rows: [{ total_activity_count: 1, verified_count: 1, pending_count: 0, rejected_count: 0, admin_review_count: 0, group_count: 1, unique_driver_count: 1 }] }
        : { rows: [{ entity_id: "entity-123", display_name: "Report entity", owner_display_name: "Owner", total_count: 1, verified_count: 1, pending_count: 0, rejected_count: 0, admin_review_count: 0, unique_driver_count: 1, first_activity_at: null, latest_activity_at: null, total_rows: 1 }] };
    };
    await driverRoute({ user: { id: "admin-user" }, query: { dateRange: "today" } }, response);
    assert.equal(statusCode, 200);
    assert.equal((payload as { reportType: string }).reportType, "driver");
    await facilityRoute({ user: { id: "admin-user" }, query: { dateRange: "today" } }, response);
    assert.equal(statusCode, 200);
    assert.equal((payload as { reportType: string }).reportType, "facility");

    (storage as any).getUser = async () => ({ id: "owner-user", role: "owner" });
    await driverRoute({ user: { id: "owner-user" }, query: {} }, response);
    assert.equal(statusCode, 403);
    assert.deepEqual(payload, { message: "Admin access required" });
    (storage as any).getUser = async () => ({ id: "driver-user", role: "driver" });
    await facilityRoute({ user: { id: "driver-user" }, query: {} }, response);
    assert.equal(statusCode, 403);
    assert.deepEqual(payload, { message: "Admin access required" });
  } finally {
    (storage as any).getUser = originalGetUser;
    (db as any).execute = originalExecute;
  }
});
