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
  const list = routes.slice(routes.indexOf("app.get('/api/admin/photo-review'"), routes.indexOf("app.post('/api/admin/photo-review/:photoId/decision'"));
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
  assert.match(page, /\/api\/photos\/activity\/\$\{selected!\.submission\.id\}/);
  assert.match(page, /AuthenticatedImage/);
  assert.match(page, /pageSize: "20"/);
  assert.match(page, /value=\{state\}/);
  assert.match(page, /value=\{driverId\}/);
  assert.match(page, /value=\{facilityId\}/);
  assert.match(page, /value=\{from\}/);
  assert.match(page, /value=\{to\}/);
  assert.match(page, /t\("photoReview\.rejectEvidence"\)/);
  assert.match(page, /expectedStatus: selected!\.photo\.verificationStatus/);
  assert.match(page, /t\("photoReview\.confirmation"\)/);
  assert.match(app, /\/admin\/photo-review/);
  assert.match(nav, /label: t\("adminNav\.photoReview"\)/);
});

test("Photo Review workflow strings exist in English and Spanish", () => {
  for (const key of ["photoReview.title", "photoReview.evidenceOnly", "photoReview.rejectEvidence", "photoReview.confirmation", "photoReview.queueError"]) {
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
    (storage as any).getUser = async (id: string) => id === "admin-user" ? { id, role: "admin" } : { id, role: "driver" };
    (storage as any).listAdminPhotoReviewItems = async () => {
      listCalls += 1;
      return { total: 1, items: [{
        photo: { id: "photo-1", activityId: "activity-1", verificationStatus: "needs_review", verificationReason: "Timestamp requires review", photoTakenAt: new Date(), uploadedAt: new Date(), contentType: "image/jpeg" },
        activity: { id: "activity-1", status: "pending", checkInTime: new Date(), createdAt: new Date(), rejectionReason: null },
        location: { id: "facility-1", name: "Pilot Facility", city: "Austin", state: "TX", ownerId: "owner-1" },
        driver: { id: "driver-1", userId: "driver-user", truckNumber: "17" }, driverUser: { firstName: "Driver", lastName: "One" },
        owner: { id: "owner-1", companyName: "Pilot Facility", userId: "owner-user" }, ownerUser: { firstName: "Owner", lastName: "One" }, administrativeReview: null, history: [],
      }] };
    };
    const denied = response();
    await route!({ user: { id: "driver-user" }, query: {} }, denied);
    assert.equal(denied.statusCode, 403);
    assert.equal(listCalls, 0);
    const allowed = response();
    await route!({ user: { id: "admin-user" }, query: { page: "1", pageSize: "20", state: "pending" } }, allowed);
    assert.equal(allowed.statusCode, 200);
    assert.equal((allowed.body as any).items[0].photo.id, "photo-1");
    assert.equal("storageKey" in (allowed.body as any).items[0].photo, false);
    assert.equal((allowed.body as any).pagination.pageSize, 20);
  } finally {
    (storage as any).getUser = originalUser;
    (storage as any).listAdminPhotoReviewItems = originalList;
  }
});
