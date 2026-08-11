import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-only-jwt-secret-32-characters-minimum";
process.env.SESSION_SECRET = "test-only-session-secret";
process.env.DATABASE_URL = "postgres://user:pass@127.0.0.1:1/cretexchange_test";

const schema = readFileSync(new URL("../shared/schema.ts", import.meta.url), "utf8");
const migration = readFileSync(new URL("../migrations/0037_add_washout_photo_review_audit.sql", import.meta.url), "utf8");
const storage = readFileSync(new URL("../server/storage.ts", import.meta.url), "utf8");
const retention = readFileSync(new URL("../server/adminPhotoReviewRetention.ts", import.meta.url), "utf8");
const routes = readFileSync(new URL("../server/routes.ts", import.meta.url), "utf8");
const page = readFileSync(new URL("../client/src/pages/admin/photo-review.tsx", import.meta.url), "utf8");
const app = readFileSync(new URL("../client/src/App.tsx", import.meta.url), "utf8");
const nav = readFileSync(new URL("../client/src/components/MobileNav.tsx", import.meta.url), "utf8");
const translations = readFileSync(new URL("../client/src/lib/i18n.ts", import.meta.url), "utf8");

test("photo review migration is additive, auditable, and contains no financial changes", () => {
  assert.match(schema, /washoutPhotoReviewEvents/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS washout_photo_review_events/);
  assert.match(migration, /previous_verification_status photo_verification_status NOT NULL/);
  assert.match(migration, /new_verification_status photo_verification_status NOT NULL/);
  assert.match(migration, /washout_photo_review_events_rejection_reason_check/);
  assert.match(migration, /washout_photo_review_events_photo_created_idx/);
  assert.doesNotMatch(migration, /\b(?:payments|wallet|stripe|payout|settlement|ALTER TABLE washout_activities)\b/i);
});

test("photo evidence decisions use an optimistic, transactional photo-only update and append history", () => {
  const resolver = storage.slice(storage.indexOf("async resolveWashoutPhotoReview"), storage.indexOf("async getRecentWashoutPhotoDuplicateCandidates", storage.indexOf("async resolveWashoutPhotoReview")));
  assert.match(resolver, /db\.transaction/);
  assert.match(resolver, /eq\(washoutPhotos\.verificationStatus, input\.expectedStatus\)/);
  assert.match(resolver, /tx\.insert\(washoutPhotoReviewEvents\)/);
  assert.match(resolver, /previousVerificationStatus: existing\.verificationStatus/);
  assert.match(resolver, /newVerificationStatus: updated\.verificationStatus/);
  assert.doesNotMatch(resolver, /washoutActivities\)\.set\(\{\s*status|createPayment|wallet|stripe|payout|settlement/i);
});

test("the protected Admin queue is paginated, least-privilege, and does not expose object keys or GPS", () => {
  const list = routes.slice(routes.indexOf("app.get('/api/admin/photo-review'"), routes.indexOf("app.get('/api/admin/photo-review/:photoId/evidence'"));
  const decision = routes.slice(routes.indexOf("app.post('/api/admin/photo-review/:photoId/decision'"), routes.indexOf("// Financial obligation creation", routes.indexOf("app.post('/api/admin/photo-review/:photoId/decision'")));
  assert.match(list, /requireAdminPhotoReviewActor/);
  assert.match(list, /pagination:/);
  assert.match(list, /pageSize/);
  assert.match(routes, /verificationReason/);
  assert.doesNotMatch(list, /storageKey|gpsLatitude|gpsLongitude|imageFingerprint|wallet|stripe/i);
  assert.match(routes, /confirmationAcknowledged: z\.literal\(true\)/);
  assert.match(decision, /nextStatus: parsed\.data\.decision === "approve" \? "verified" : "failed"/);
  assert.match(decision, /recovery activity operational status was not changed/);
  assert.doesNotMatch(decision, /createPayment|wallet|stripe|payout|settlement|updateWashoutActivityStatus/i);
});

test("the Admin Photo Review UI uses the existing authorized photo endpoint, practical filters, and evidence-only actions", () => {
  assert.match(page, /\/api\/admin\/photo-review/);
  assert.match(page, /selected\.photo\.evidencePath/);
  assert.doesNotMatch(page, /\/api\/photos\/activity/);
  assert.match(page, /AuthenticatedImage/);
  assert.match(page, /pageSize: "20"/);
  assert.match(page, /role="tablist"/);
  assert.match(page, /value=\{activityStatus\}/);
  assert.match(page, /value=\{escalationState\}/);
  assert.match(page, /value=\{driverId\}/);
  assert.match(page, /value=\{facilityId\}/);
  assert.match(page, /value=\{from\}/);
  assert.match(page, /value=\{to\}/);
  assert.match(page, /query\.set\("activityId", linkedActivityId\)/);
  assert.match(page, /currentItems\.find\(\(item\) => item\.submission\.id === linkedActivityId\)/);
  assert.match(page, /id=\{`activity-\$\{item\.submission\.id\}`\}/);
  assert.match(page, /linkedActivityTriggerRef\.current\?\.focus\(\)/);
  assert.match(page, /t\("photoReview\.rejectEvidence"\)/);
  assert.match(page, /expectedStatus: selected!\.photo\.verificationStatus/);
  assert.match(page, /t\("photoReview\.confirmation"\)/);
  assert.match(app, /\/admin\/photo-review/);
  assert.match(nav, /label: t\("adminNav\.photoReview"\)/);
});

test("retained evidence views distinguish routine Owner rejection from active or disputed review", async () => {
  const { isActiveAdminPhotoReview } = await import("../server/adminPhotoReviewRetention");
  assert.equal(isActiveAdminPhotoReview({ activityStatus: "rejected", rejectedBy: "owner-user", photoStatus: "verified", hasOpenAdministrativeReview: false }), false);
  assert.equal(isActiveAdminPhotoReview({ activityStatus: "rejected", rejectedBy: "owner-user", photoStatus: "failed", hasOpenAdministrativeReview: false }), false);
  assert.equal(isActiveAdminPhotoReview({ activityStatus: "rejected", rejectedBy: "owner-user", photoStatus: "verified", hasOpenAdministrativeReview: true }), true);
  assert.equal(isActiveAdminPhotoReview({ activityStatus: "rejected", rejectedBy: null, photoStatus: "needs_review", hasOpenAdministrativeReview: false }), true);
  assert.equal(isActiveAdminPhotoReview({ activityStatus: "rejected", rejectedBy: null, photoStatus: "failed", hasOpenAdministrativeReview: false }), false);
  assert.match(retention, /a\.status = 'rejected' and a\.rejected_by is not null/);
  assert.match(retention, /p\.activity_id = \$\{filter\.activityId\}/);
  assert.match(retention, /washout_activity_admin_reviews/);
  assert.match(retention, /limit \$\{filter\.pageSize\} offset \$\{offset\}/);
});

test("an exact Gray activity stays in All History without contaminating the active queue", async () => {
  const { listAdminPhotoReviewRetentionItems } = await import("../server/adminPhotoReviewRetention");
  let call = 0;
  const database = {
    execute: async () => {
      call += 1;
      if (call === 1) return { rows: [{ total: 1 }] };
      if (call === 2) return { rows: [{ active_count: 0 }] };
      if (call === 3) return { rows: [{
        photo_id: "43646520-c341-4f52-b2e4-281810da3fef",
        activity_id: "323528bb-bc19-4e88-9f66-ce383ab591cf",
        verification_status: "verified",
        verification_reason: null,
        photo_taken_at: new Date("2026-08-11T18:54:00Z"),
        uploaded_at: new Date("2026-08-11T18:54:09Z"),
        content_type: "image/jpeg",
        activity_status: "pending",
        check_in_time: new Date("2026-08-11T18:53:00Z"),
        submitted_at: new Date("2026-08-11T18:54:09Z"),
        rejection_reason: null,
        rejected_at: null,
        rejected_by: null,
        service_type: "washout",
        material_custom_label: null,
        material_display_name: "Concrete Washout",
        facility_id: "1367c68a-e12b-46a4-a417-6f21febe5640",
        facility_name: "Revel Patio Grill",
        facility_city: null,
        facility_state: null,
        driver_id: "driver-1",
        driver_first_name: "Driver",
        driver_last_name: "One",
        has_administrative_review: false,
        has_open_administrative_review: false,
      }] };
      return { rows: [] };
    },
  };
  const result = await listAdminPhotoReviewRetentionItems(database, {
    view: "all",
    activityId: "323528bb-bc19-4e88-9f66-ce383ab591cf",
    sort: "newest",
    page: 1,
    pageSize: 20,
  });
  assert.equal(result.total, 1);
  assert.equal(result.activeCount, 0);
  assert.equal(result.items[0].activity.id, "323528bb-bc19-4e88-9f66-ce383ab591cf");
  assert.equal(result.items[0].activeAdminAction, false);
});

test("platform-detected evidence failures are retained outside Owner review and use governed notifications", () => {
  const route = routes.slice(routes.indexOf("app.post('/api/activities/create-with-photos'"), routes.indexOf("app.get('/api/objects/photos/:key'"));
  assert.match(route, /platformIntegrityDetected/);
  assert.match(route, /status: "rejected" as const/);
  assert.match(route, /rejectedBy: null/);
  assert.match(route, /templateKey: 'activity_integrity_review'/);
  assert.match(route, /templateKey: 'photo_review_required'/);
  assert.match(route, /if \(platformIntegrityDetected\)[\s\S]*?else \{[\s\S]*?templateKey: 'owner_pending_review'/);
  assert.match(route, /aclRules: platformIntegrityDetected \? \[\] : \[/);
  assert.match(routes, /isPlatformIntegrityRejection = activity\.status === "rejected" && !activity\.rejectedBy/);
  assert.doesNotMatch(route, /fraudulent driver|driver fraud/i);
  assert.match(storage, /platform-evidence-validation/);
  assert.match(storage, /activity:\$\{newActivity\.id\}:platform-integrity-rejected/);
});

test("Photo Review workflow strings exist in English and Spanish", () => {
  for (const key of ["photoReview.title", "photoReview.evidenceOnly", "photoReview.rejectEvidence", "photoReview.confirmation", "photoReview.queueError", "photoReview.linkedActivityMissing", "photoReview.geofenceContextLoading", "photoReview.geofenceContextUnavailable", "geofence.admin.presentation.gray.nearBoundary", "geofence.admin.guidance.gray.nearBoundary"]) {
    assert.equal(translations.split(`\"${key}\"`).length - 1, 2, `${key} must be translated in both locales`);
  }
});

type Route = (req: any, res: any) => Promise<unknown>;

function routeRegistry() {
  const gets = new Map<string, Route>();
  const posts = new Map<string, Route>();
  return {
    app: {
      get(path: string, ...handlers: Route[]) { gets.set(path, handlers.at(-1)!); },
      post(path: string, ...handlers: Route[]) { posts.set(path, handlers.at(-1)!); },
      put() {}, patch() {}, delete() {}, use() {},
    }, gets, posts,
  };
}

function response() {
  return {
    statusCode: 200, body: undefined as unknown,
    status(code: number) { this.statusCode = code; return this; },
    json(body: unknown) { this.body = body; return this; },
  };
}

test("Photo Review list enforces Admin RBAC and returns bounded projected results", { concurrency: false }, async () => {
  const { storage } = await import("../server/storage");
  const { registerRoutes } = await import("../server/routes");
  const { app, gets } = routeRegistry();
  await registerRoutes(app as never);
  const route = gets.get("/api/admin/photo-review");
  assert.equal(typeof route, "function");
  const originalUser = (storage as any).getUser;
  const originalList = (storage as any).listAdminPhotoReviewItems;
  try {
    let listCalls = 0;
    let lastFilter: any = null;
    (storage as any).getUser = async (id: string) => id === "admin-user" ? { id, role: "admin" } : id === "super-user" ? { id, role: "super_admin" } : { id, role: "driver" };
    (storage as any).listAdminPhotoReviewItems = async (filter: any) => {
      listCalls += 1;
      lastFilter = filter;
      return { total: 1, activeCount: 1, items: [{
        photo: { id: "photo-1", activityId: "activity-1", verificationStatus: "needs_review", verificationReason: "Timestamp requires review", photoTakenAt: new Date(), uploadedAt: new Date(), contentType: "image/jpeg" },
        activity: { id: "activity-1", status: "pending", checkInTime: new Date(), submittedAt: new Date(), rejectionReason: null, rejectedAt: null },
        location: { id: "facility-1", name: "Pilot Facility", city: "Austin", state: "TX" },
        driver: { id: "driver-1", displayName: "Driver O." }, material: "Concrete Washout", activeAdminAction: true, escalationState: "none",
        administrativeReview: null, administrativeReviews: [], history: [], activityHistory: [],
      }] };
    };
    const denied = response();
    await route!({ user: { id: "driver-user" }, query: {} }, denied);
    assert.equal(denied.statusCode, 403);
    assert.equal(listCalls, 0);
    const activityId = "323528bb-bc19-4e88-9f66-ce383ab591cf";
    const allowed = response();
    await route!({ user: { id: "admin-user" }, query: { page: "1", pageSize: "20", view: "all", activityId } }, allowed);
    assert.equal(allowed.statusCode, 200);
    assert.equal((allowed.body as any).items[0].photo.id, "photo-1");
    assert.equal("storageKey" in (allowed.body as any).items[0].photo, false);
    assert.equal((allowed.body as any).pagination.pageSize, 20);
    assert.equal((allowed.body as any).summary.activeCount, 1);
    assert.equal(lastFilter.activityId, activityId);
    assert.equal(lastFilter.view, "all");
    const superAllowed = response();
    await route!({ user: { id: "super-user" }, query: { view: "all", activityId } }, superAllowed);
    assert.equal(superAllowed.statusCode, 200);
    const malformed = response();
    await route!({ user: { id: "admin-user" }, query: { view: "all", activityId: "malformed" } }, malformed);
    assert.equal(malformed.statusCode, 400);
    assert.equal(listCalls, 2);
  } finally {
    (storage as any).getUser = originalUser;
    (storage as any).listAdminPhotoReviewItems = originalList;
  }
});

test("private Photo Review evidence is separately authorized for Admin roles", { concurrency: false }, async () => {
  const { storage } = await import("../server/storage");
  const { registerRoutes } = await import("../server/routes");
  const { app, gets } = routeRegistry();
  await registerRoutes(app as never);
  const route = gets.get("/api/admin/photo-review/:photoId/evidence");
  assert.equal(typeof route, "function");
  const originalUser = (storage as any).getUser;
  const originalPhoto = (storage as any).getPhotoById;
  try {
    (storage as any).getUser = async (id: string) => ({ id, role: id.startsWith("admin") ? "admin" : id.startsWith("super") ? "super_admin" : id.startsWith("owner") ? "owner" : "driver" });
    (storage as any).getPhotoById = async () => undefined;
    for (const id of ["driver-user", "owner-user"]) {
      const denied = response();
      await route!({ user: { id }, params: { photoId: "photo-1" } }, denied);
      assert.equal(denied.statusCode, 403);
    }
    for (const id of ["admin-user", "super-user"]) {
      const allowed = response();
      await route!({ user: { id }, params: { photoId: "missing" } }, allowed);
      assert.equal(allowed.statusCode, 404);
    }
    assert.match(routes, /app\.get\('\/api\/admin\/photo-review\/:photoId\/evidence', isAuthenticated/);
  } finally {
    (storage as any).getUser = originalUser;
    (storage as any).getPhotoById = originalPhoto;
  }
});
