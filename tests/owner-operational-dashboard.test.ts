import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  OWNER_OPERATIONAL_ATTENTION_FACILITY_LIMIT,
  buildOwnerOperationalSummary,
  OWNER_OPERATIONAL_PENDING_AGE_HOURS,
  OWNER_OPERATIONAL_PREVIEW_LIMIT,
  OwnerOperationalDashboardError,
} from "../server/ownerOperationalDashboard";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-only-jwt-secret-32-characters-minimum";
process.env.SESSION_SECRET = "test-only-session-secret";
process.env.DATABASE_URL = "postgres://user:pass@127.0.0.1:1/owner_operational_dashboard_test";
process.env.FINANCIAL_EXECUTION_ENABLED = "false";

const readyAccess = {
  profileCompleted: true,
  approvalCompleted: true,
  accessStatus: "operationally_ready" as const,
  canManageLocations: true,
  missingProfileFields: [],
  missingProfileFieldLabels: [],
};

function notifications(items: any[] = [], unreadCount = 0) {
  return {
    async unreadCount(userId: string) {
      assert.equal(userId, "owner-user");
      return unreadCount;
    },
    async list(userId: string, page: number, pageSize: number) {
      assert.equal(userId, "owner-user");
      assert.equal(page, 1);
      assert.equal(pageSize, OWNER_OPERATIONAL_PREVIEW_LIMIT);
      return { items, pagination: { page, pageSize, total: items.length, hasMore: false } };
    },
  };
}

function databaseWithResults(results: unknown[]) {
  let call = 0;
  return {
    async execute() {
      const value = results[call];
      call += 1;
      return { rows: value || [] };
    },
    calls() { return call; },
  };
}

function activityRow(id: string, createdAt: string, status = "pending") {
  return {
    id,
    location_id: "facility-one",
    facility_name: "Revel Patio Grill",
    status,
    service_type: "washout",
    material_custom_label: null,
    material_display_name: null,
    created_at: new Date(createdAt),
    first_name: "Alex",
    last_name: "Rivera",
    photo_count: 1,
    failed_photo_count: 0,
    returned_from_admin_review: false,
  };
}

test("single-Facility operational summary defaults to Owner-wide scope and projects canonical today with bounded previews", async () => {
  const pendingRows = Array.from({ length: 8 }, (_, index) => activityRow(`pending-${index}`, `2026-08-03T${String(20 - index).padStart(2, "0")}:00:00Z`));
  const recentRows = [
    activityRow("recent-newest", "2026-08-03T20:00:00Z", "verified"),
    activityRow("recent-older", "2026-08-03T19:00:00Z", "rejected"),
  ];
  const database = databaseWithResults([
    [{ id: "facility-one", name: "Revel Patio Grill", is_active: true, is_visible: true, operating_hours: { monday: "open" }, accepted_material_count: "2" }],
    [{ submitted: "4", awaiting_review: "2", verified: "1", rejected: "1", active_drivers: "3", latest_activity_at: new Date("2026-08-03T20:00:00Z") }],
    [{ pending_reviews: "2", all_pending_reviews: "6", aged_pending_reviews: "1", missing_evidence: "1", failed_evidence: "0", returned_from_admin_review: "1" }],
    pendingRows,
    recentRows,
  ]);
  const result = await buildOwnerOperationalSummary({
    database,
    notificationService: notifications([{ id: "n1", title: "Review needed", message: "Open the activity", templateKey: null, category: "operational", priority: "high", isRead: false, deepLink: "/dashboard", metadata: {}, createdAt: new Date("2026-08-03T18:00:00Z") }] as any, 1),
    ownerId: "owner-one",
    ownerUserId: "owner-user",
    ownerApproved: true,
    accessState: readyAccess,
    termsAcceptanceRequired: false,
    now: new Date("2026-08-03T21:00:00Z"),
  });

  assert.equal(result.selection.state, "all");
  assert.equal(result.selection.source, null);
  assert.equal(result.selection.selectedFacilityId, null);
  assert.deepEqual(result.today, { submitted: 4, awaitingReview: 2, verified: 1, rejected: 1, activeDrivers: 3, latestActivityAt: "2026-08-03T20:00:00.000Z", timezone: "UTC" });
  assert.equal(result.attention?.pendingReviews, 2);
  assert.equal(result.attention?.allPendingReviews, 6);
  assert.equal(result.attention?.agedPendingReviews, 1);
  assert.equal(result.attention?.returnedFromAdministrativeReview, 1);
  assert.equal(result.pendingReviews.length, OWNER_OPERATIONAL_PREVIEW_LIMIT);
  assert.equal(result.pendingReviews[0].driverDisplayName, "Alex R.");
  assert.equal(result.pendingReviews[0].material, "Concrete Washout");
  assert.match(result.pendingReviews[0].reviewLink, /^\/dashboard\/reviews\?/);
  assert.deepEqual(result.recentActivity.map((row) => row.id), ["recent-newest", "recent-older"]);
  assert.equal(result.facilityStatus, null);
  assert.deepEqual(result.attention?.facilitiesNeedingAttention, []);
  assert.equal(result.notifications.unreadCount, 1);
  assert.equal(database.calls(), 5);
});

test("multi-Facility Owner receives an all-Facilities summary with distinct Driver aggregation and Facility attention", async () => {
  const database = databaseWithResults([
    [
      { id: "facility-one", name: "One", is_active: true, is_visible: true, operating_hours: {}, accepted_material_count: "0" },
      { id: "facility-two", name: "Two", is_active: true, is_visible: true, operating_hours: { weekdays: "open" }, accepted_material_count: "1" },
    ],
    [{ submitted: "3", awaiting_review: "2", verified: "1", rejected: "0", active_drivers: "2", latest_activity_at: new Date("2026-08-21T19:56:00Z") }],
    [{ pending_reviews: "7", all_pending_reviews: "7", aged_pending_reviews: "1", missing_evidence: "0", failed_evidence: "0", returned_from_admin_review: "0" }],
    [activityRow("pending-other", "2026-08-21T19:56:00Z")],
    [activityRow("recent-other", "2026-08-21T19:56:00Z", "verified")],
  ]);
  const result = await buildOwnerOperationalSummary({
    database,
    notificationService: notifications(),
    ownerId: "owner-one",
    ownerUserId: "owner-user",
    ownerApproved: true,
    accessState: readyAccess,
    termsAcceptanceRequired: false,
  });
  assert.equal(result.selection.state, "all");
  assert.deepEqual(result.today, { submitted: 3, awaitingReview: 2, verified: 1, rejected: 0, activeDrivers: 2, latestActivityAt: "2026-08-21T19:56:00.000Z", timezone: "UTC" });
  assert.equal(result.attention?.pendingReviews, 7);
  assert.equal(result.attention?.allPendingReviews, 7);
  assert.deepEqual(result.attention?.facilitiesNeedingAttention.map((facility) => facility.id), ["facility-one"]);
  assert.equal(result.facilityStatus, null);
  assert.equal(result.pendingReviews[0].facilityName, "Revel Patio Grill");
  assert.equal(database.calls(), 5);
});

test("an explicitly selected owned Facility is honored while another Owner's Facility is denied", async () => {
  const selectedDatabase = databaseWithResults([
    [
      { id: "facility-one", name: "One", is_active: true, is_visible: true, operating_hours: {} },
      { id: "facility-two", name: "Two", is_active: false, is_visible: false, operating_hours: null, accepted_material_count: "0" },
    ],
    [{}], [{}], [], [], [],
  ]);
  const selected = await buildOwnerOperationalSummary({
    database: selectedDatabase,
    notificationService: notifications(),
    ownerId: "owner-one",
    ownerUserId: "owner-user",
    requestedFacilityId: "facility-two",
    ownerApproved: true,
    accessState: readyAccess,
    termsAcceptanceRequired: true,
  });
  assert.equal(selected.selection.selectedFacilityId, "facility-two");
  assert.deepEqual(selected.facilityStatus?.issues, ["facility_inactive", "facility_hidden", "accepted_materials_missing", "operating_hours_missing", "terms_acceptance_required"]);

  const deniedDatabase = databaseWithResults([[
    { id: "facility-one", name: "One", is_active: true, is_visible: true, operating_hours: {} },
  ]]);
  await assert.rejects(
    buildOwnerOperationalSummary({ database: deniedDatabase, notificationService: notifications(), ownerId: "owner-one", ownerUserId: "owner-user", requestedFacilityId: "00000000-0000-4000-8000-000000000099", ownerApproved: true, accessState: readyAccess, termsAcceptanceRequired: false }),
    (error: unknown) => error instanceof OwnerOperationalDashboardError && error.status === 403,
  );
});

test("no-Facility state remains actionable and does not query activity projections", async () => {
  const database = databaseWithResults([[]]);
  const result = await buildOwnerOperationalSummary({ database, notificationService: notifications(), ownerId: "owner-one", ownerUserId: "owner-user", ownerApproved: false, accessState: { ...readyAccess, canManageLocations: false }, termsAcceptanceRequired: false });
  assert.equal(result.selection.state, "empty");
  assert.equal(result.dataState, "no_facilities");
  assert.equal(result.today, null);
  assert.equal(database.calls(), 1);
});

test("a partial operational query failure rejects the summary instead of projecting authoritative zeros", async () => {
  let call = 0;
  const database = {
    async execute() {
      call += 1;
      if (call === 1) {
        return { rows: [{ id: "facility-one", name: "One", is_active: true, is_visible: true, operating_hours: {}, accepted_material_count: "0" }] };
      }
      if (call === 3) throw new Error("attention projection unavailable");
      return { rows: [] };
    },
  };
  await assert.rejects(
    buildOwnerOperationalSummary({ database, notificationService: notifications(), ownerId: "owner-one", ownerUserId: "owner-user", ownerApproved: true, accessState: readyAccess, termsAcceptanceRequired: false }),
    /attention projection unavailable/,
  );
});

test("operational summary contract contains no financial, contact, precise GPS, storage, or raw analytics fields", async () => {
  const source = await readFile(new URL("../server/ownerOperationalDashboard.ts", import.meta.url), "utf8");
  const publicType = source.slice(source.indexOf("export type OwnerOperationalSummary"), source.indexOf("export class OwnerOperationalDashboardError"));
  assert.doesNotMatch(publicType, /amount|payment|wallet|stripe|phone|email|latitude|longitude|storageKey|photoUrl|analytics/i);
  assert.match(source, /privacySafeDriverName/);
  assert.match(source, /OWNER_OPERATIONAL_PREVIEW_LIMIT = 5/);
  assert.match(source, new RegExp(`OWNER_OPERATIONAL_ATTENTION_FACILITY_LIMIT = ${OWNER_OPERATIONAL_ATTENTION_FACILITY_LIMIT}`));
  assert.match(source, new RegExp(`OWNER_OPERATIONAL_PENDING_AGE_HOURS = ${OWNER_OPERATIONAL_PENDING_AGE_HOURS}`));
  assert.match(source, /max\(a\.created_at\) filter \(where a\.created_at >= \$\{start\} and a\.created_at < \$\{end\}\) as latest_activity_at/);
  assert.match(source, /a\.status = \$\{WASHOUT_CANONICAL_PENDING_STATUS\}[\s\S]*a\.created_at >= \$\{start\}[\s\S]*a\.created_at < \$\{end\}[\s\S]*as awaiting_review/);
  assert.match(source, /count\(distinct a\.driver_id\)/);
  assert.match(source, /function ownerActivityScope/);
  assert.match(source, /l\.owner_id = \$\{scope\.ownerId\}/);
});

test("route and client enforce Owner RBAC, default all-Facilities scope, Facility drill-down, refresh, retry, and exact deep links", async () => {
  const [routes, app, page] = await Promise.all([
    readFile(new URL("../server/routes.ts", import.meta.url), "utf8"),
    readFile(new URL("../client/src/App.tsx", import.meta.url), "utf8"),
    readFile(new URL("../client/src/pages/owner/operational-dashboard.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(routes, /\/api\/owners\/dashboard\/operational-summary/);
  assert.match(routes, /user\.role !== "owner"/);
  assert.match(routes, /requestedFacilityId/);
  assert.match(app, /path="\/dashboard\/reviews" component=\{OwnerReviewDashboard\}/);
  assert.match(page, /owner-operational-loading/);
  assert.match(page, /owner-operational-error/);
  assert.match(page, /summary\.refetch\(\)/);
  assert.match(page, /refetchInterval:\s*30_000/);
  assert.match(page, /refetchIntervalInBackground:\s*false/);
  assert.match(page, /refetchOnMount:\s*"always"/);
  assert.match(page, /refetchOnWindowFocus:\s*true/);
  assert.match(page, /reviewLink/);
  assert.match(page, /facility\.intelligenceLink/);
  assert.match(page, /window\.location\.search/);
  assert.match(page, /setUrlSelection\(\{ present: true, facilityId: nextFacilityId \}\)/);
  assert.match(page, /setUrlSelection\(\{ present: false, facilityId: null \}\)/);
  assert.match(page, /setLocation\("\/dashboard"\)/);
  assert.match(page, /setLocation\("\/dashboard\/reviews"\)/);
  assert.match(page, /owner\.operational\.pendingAtFacility/);
  assert.match(page, /owner\.operational\.allPendingReviews/);
  assert.match(page, /owner-operational-all-pending-count/);
  assert.match(page, /!allFacilities && <MetricCard label=\{t\("owner\.operational\.pendingAtFacility"\)\}/);
  assert.match(page, /!allFacilities && pendingAtOtherFacilities > 0/);
  assert.match(page, /owner-operational-other-facilities-pending/);
  assert.match(page, /owner\.operational\.todayAllFacilities/);
  assert.match(page, /owner\.operational\.todayAtFacility/);
  assert.match(page, /owner\.operational\.noActivityAllToday/);
  assert.match(page, /owner-operational-facilities-needing-attention/);
  assert.match(page, /owner-operational-return-all/);
  assert.match(page, /owner\.operational\.latestActivityToday/);
  assert.doesNotMatch(page, /disabled=\{attention\.pendingReviews === 0\}/);
  assert.match(page, /min-h-11/);
  assert.match(page, /aria-live="polite"/);
  assert.doesNotMatch(page, /localStorage/);
});

test("Owner approval and rejection invalidate every selected-Facility operational summary", async () => {
  const reviewPage = await readFile(new URL("../client/src/pages/owner/dashboard.tsx", import.meta.url), "utf8");
  const invalidations = reviewPage.match(/invalidateQueries\(\{ queryKey: \['owner-operational-dashboard'\] \}\)/g) || [];
  assert.equal(invalidations.length, 2);
});

test("operational-summary route returns 401 anonymously, 403 to a Driver, and 400 for invalid or blank Facility identifiers", { concurrency: false }, async () => {
  const { registerRoutes } = await import("../server/routes");
  const { storage } = await import("../server/storage");
  const handlers = new Map<string, (req: any, res: any) => Promise<unknown>>();
  const app = {
    get(path: string, ...routeHandlers: Array<(req: any, res: any) => Promise<unknown>>) { handlers.set(path, routeHandlers.at(-1)!); },
    post() {}, put() {}, patch() {}, delete() {}, use() {},
  };
  await registerRoutes(app as never);
  const route = handlers.get("/api/owners/dashboard/operational-summary")!;
  const createResponse = () => ({
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) { this.statusCode = code; return this; },
    json(body: unknown) { this.body = body; return this; },
    setHeader() { return this; },
  });
  const originalGetUser = storage.getUser;
  const originalGetOwner = storage.getOwner;
  try {
    const anonymous = createResponse();
    await route({ user: null, query: {} }, anonymous);
    assert.equal(anonymous.statusCode, 401);

    storage.getUser = async () => ({ id: "driver-user", role: "driver" }) as never;
    const driver = createResponse();
    await route({ user: { id: "driver-user" }, query: {} }, driver);
    assert.equal(driver.statusCode, 403);

    storage.getUser = async () => ({ id: "owner-user", role: "owner" }) as never;
    storage.getOwner = async () => ({ id: "owner-one", userId: "owner-user" }) as never;
    const invalid = createResponse();
    await route({ user: { id: "owner-user" }, query: { facilityId: "not-a-uuid" } }, invalid);
    assert.equal(invalid.statusCode, 400);

    const blank = createResponse();
    await route({ user: { id: "owner-user" }, query: { facilityId: "" } }, blank);
    assert.equal(blank.statusCode, 400);
  } finally {
    storage.getUser = originalGetUser;
    storage.getOwner = originalGetOwner;
  }
});

test("English and Spanish catalogs contain every operational dashboard key without raw-key fallback", async () => {
  const [catalog, page] = await Promise.all([
    readFile(new URL("../client/src/lib/i18n.ts", import.meta.url), "utf8"),
    readFile(new URL("../client/src/pages/owner/operational-dashboard.tsx", import.meta.url), "utf8"),
  ]);
  const literalKeys = Array.from(page.matchAll(/t\("(owner\.operational\.[^"]+)"/g), (match) => match[1]);
  assert.ok(literalKeys.length > 40);
  for (const key of new Set(literalKeys)) {
    assert.equal((catalog.match(new RegExp(`"${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}":`, "g")) || []).length, 2, `${key} must exist in English and Spanish`);
  }
});
