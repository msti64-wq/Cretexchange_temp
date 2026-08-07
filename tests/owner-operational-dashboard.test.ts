import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
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

test("single-Facility operational summary auto-selects and projects canonical today, attention, status, and bounded previews", async () => {
  const pendingRows = Array.from({ length: 8 }, (_, index) => activityRow(`pending-${index}`, `2026-08-03T${String(20 - index).padStart(2, "0")}:00:00Z`));
  const recentRows = [
    activityRow("recent-newest", "2026-08-03T20:00:00Z", "verified"),
    activityRow("recent-older", "2026-08-03T19:00:00Z", "rejected"),
  ];
  const database = databaseWithResults([
    [{ id: "facility-one", name: "Revel Patio Grill", is_active: true, is_visible: true, operating_hours: { monday: "open" } }],
    [{ submitted: "4", awaiting_review: "2", verified: "1", rejected: "1", active_drivers: "3", latest_activity_at: new Date("2026-08-03T20:00:00Z") }],
    [{ pending_reviews: "2", aged_pending_reviews: "1", missing_evidence: "1", failed_evidence: "0", returned_from_admin_review: "1" }],
    pendingRows,
    recentRows,
    [{ label: "Concrete Washout" }, { label: "Asphalt" }],
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

  assert.equal(result.selection.state, "selected");
  assert.equal(result.selection.source, "single");
  assert.deepEqual(result.today, { submitted: 4, awaitingReview: 2, verified: 1, rejected: 1, activeDrivers: 3, latestActivityAt: "2026-08-03T20:00:00.000Z", timezone: "UTC" });
  assert.equal(result.attention?.pendingReviews, 2);
  assert.equal(result.attention?.agedPendingReviews, 1);
  assert.equal(result.attention?.returnedFromAdministrativeReview, 1);
  assert.equal(result.pendingReviews.length, OWNER_OPERATIONAL_PREVIEW_LIMIT);
  assert.equal(result.pendingReviews[0].driverDisplayName, "Alex R.");
  assert.equal(result.pendingReviews[0].material, "Concrete Washout");
  assert.match(result.pendingReviews[0].reviewLink, /^\/dashboard\/reviews\?/);
  assert.deepEqual(result.recentActivity.map((row) => row.id), ["recent-newest", "recent-older"]);
  assert.deepEqual(result.facilityStatus?.acceptedMaterials, ["Concrete Washout", "Asphalt"]);
  assert.equal(result.facilityStatus?.operational, true);
  assert.equal(result.notifications.unreadCount, 1);
  assert.equal(database.calls(), 6);
});

test("multi-Facility Owner receives a selection-required state with no misleading zero metrics", async () => {
  const database = databaseWithResults([[
    { id: "facility-one", name: "One", is_active: true, is_visible: true, operating_hours: {} },
    { id: "facility-two", name: "Two", is_active: true, is_visible: true, operating_hours: {} },
  ]]);
  const result = await buildOwnerOperationalSummary({
    database,
    notificationService: notifications(),
    ownerId: "owner-one",
    ownerUserId: "owner-user",
    ownerApproved: true,
    accessState: readyAccess,
    termsAcceptanceRequired: false,
  });
  assert.equal(result.selection.state, "required");
  assert.equal(result.today, null);
  assert.equal(result.attention, null);
  assert.equal(result.facilityStatus, null);
  assert.deepEqual(result.pendingReviews, []);
  assert.equal(database.calls(), 1);
});

test("an explicitly selected owned Facility is honored while another Owner's Facility is denied", async () => {
  const selectedDatabase = databaseWithResults([
    [
      { id: "facility-one", name: "One", is_active: true, is_visible: true, operating_hours: {} },
      { id: "facility-two", name: "Two", is_active: false, is_visible: false, operating_hours: null },
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
    buildOwnerOperationalSummary({ database: deniedDatabase, notificationService: notifications(), ownerId: "owner-one", ownerUserId: "owner-user", requestedFacilityId: "not-owned", ownerApproved: true, accessState: readyAccess, termsAcceptanceRequired: false }),
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

test("operational summary contract contains no financial, contact, precise GPS, storage, or raw analytics fields", async () => {
  const source = await readFile(new URL("../server/ownerOperationalDashboard.ts", import.meta.url), "utf8");
  const publicType = source.slice(source.indexOf("export type OwnerOperationalSummary"), source.indexOf("export class OwnerOperationalDashboardError"));
  assert.doesNotMatch(publicType, /amount|payment|wallet|stripe|phone|email|latitude|longitude|storageKey|photoUrl|analytics/i);
  assert.match(source, /privacySafeDriverName/);
  assert.match(source, /OWNER_OPERATIONAL_PREVIEW_LIMIT = 5/);
  assert.match(source, new RegExp(`OWNER_OPERATIONAL_PENDING_AGE_HOURS = ${OWNER_OPERATIONAL_PENDING_AGE_HOURS}`));
});

test("route and client enforce Owner RBAC, Facility selection, loading, refresh, retry, deep links, and separate Facility Intelligence", async () => {
  const [routes, app, page] = await Promise.all([
    readFile(new URL("../server/routes.ts", import.meta.url), "utf8"),
    readFile(new URL("../client/src/App.tsx", import.meta.url), "utf8"),
    readFile(new URL("../client/src/pages/owner/operational-dashboard.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(routes, /\/api\/owners\/dashboard\/operational-summary/);
  assert.match(routes, /user\.role !== "owner"/);
  assert.match(routes, /requestedFacilityId/);
  assert.match(app, /path="\/dashboard\/reviews" component=\{OwnerReviewDashboard\}/);
  assert.match(page, /owner-operational-selection-required/);
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
  assert.match(page, /min-h-11/);
  assert.match(page, /aria-live="polite"/);
  assert.doesNotMatch(page, /locations\[0\]/);
});

test("operational-summary route returns 401 anonymously, 403 to a Driver, and 400 for an invalid Facility identifier", { concurrency: false }, async () => {
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
