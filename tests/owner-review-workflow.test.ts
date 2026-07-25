import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-only-jwt-secret-32-characters-minimum";
process.env.SESSION_SECRET = "test-only-session-secret";
process.env.DATABASE_URL = "postgres://user:pass@127.0.0.1:1/cretexchange_test";

import {
  filterPendingWashoutApprovals,
  isPendingWashoutApproval,
} from "../shared/washoutApproval";

type Route = (req: any, res: any) => Promise<unknown>;

const { storage } = await import("../server/storage");
const { registerRoutes } = await import("../server/routes");

function createRouteRegistry() {
  const gets = new Map<string, Route>();
  return {
    app: {
      get(path: string, ...handlers: Route[]) { gets.set(path, handlers.at(-1)!); },
      post() {}, put() {}, patch() {}, delete() {}, use() {},
    },
    gets,
  };
}

function response() {
  return {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) { this.statusCode = code; return this; },
    json(body: unknown) { this.body = body; return this; },
  };
}

async function withStoragePatch(patch: Record<string, unknown>, run: () => Promise<void>) {
  const originals = new Map<string, unknown>();
  for (const [key, value] of Object.entries(patch)) {
    originals.set(key, (storage as any)[key]);
    (storage as any)[key] = value;
  }
  try {
    await run();
  } finally {
    for (const [key, value] of originals) (storage as any)[key] = value;
  }
}

test("a submitted washout and its uploaded photo remain pending until owner review", () => {
  const routes = readFileSync(new URL("../server/routes.ts", import.meta.url), "utf8");
  const checkin = routes.slice(
    routes.indexOf("app.post('/api/drivers/checkin'"),
    routes.indexOf("app.get('/api/drivers/activities'"),
  );
  const createWithPhotos = routes.slice(routes.indexOf("app.post('/api/activities/create-with-photos'"));

  assert.match(checkin, /status:\s*'pending' as const/);
  assert.match(checkin, /checkInTime:\s*new Date\(\)\.toISOString\(\)/);
  assert.doesNotMatch(checkin, /checkInTime:\s*new Date\(\)\s*,/);
  assert.match(createWithPhotos, /activityResult\.data\.status !== "pending"/);
  assert.match(createWithPhotos, /storage\.createWashoutActivityWithPhotos\(/);
  assert.doesNotMatch(createWithPhotos, /verifyWashoutActivity\(/);
  assert.equal(isPendingWashoutApproval("pending"), true);
});

test("the correct owner receives a pending activity with normalized photo metadata", { concurrency: false }, async () => {
  const { app, gets } = createRouteRegistry();
  await registerRoutes(app as never);
  const route = gets.get("/api/owners/activities");
  assert.equal(typeof route, "function");

  const pending = {
    id: "activity-production-sequence",
    status: "pending",
    locationId: "location-1",
    driverId: "driver-1",
    checkInTime: new Date("2026-07-21T06:59:33.043Z"),
    photoCount: 1,
    location: { id: "location-1", ownerId: "owner-1", name: "Owner-managed facility" },
    driver: { id: "driver-1", user: { id: "driver-user-1" } },
  };

  await withStoragePatch({
    getOwner: async () => ({ id: "owner-1", userId: "owner-user-1" }),
    getUser: async () => ({ id: "owner-user-1", role: "owner" }),
    getActivitiesByOwner: async () => [pending],
  }, async () => {
    const res = response();
    await route!({ user: { id: "owner-user-1", role: "owner" }, query: { dateRange: "all" } }, res);
    assert.equal(res.statusCode, 200);
    const activities = res.body as typeof pending[];
    assert.equal(filterPendingWashoutApprovals(activities).length, 1);
    assert.equal(activities[0].photoCount, 1);
    assert.equal(activities[0].location.ownerId, "owner-1");
  });
});

test("owner activity projection derives photo counts from washout_photos rather than legacy photoUrls", () => {
  const storageSource = readFileSync(new URL("../server/storage.ts", import.meta.url), "utf8");
  const routes = readFileSync(new URL("../server/routes.ts", import.meta.url), "utf8");
  const ownerActivities = storageSource.slice(storageSource.indexOf("async getActivitiesByOwner"));
  const ownerActivitiesRoute = routes.slice(routes.indexOf("app.get('/api/owners/activities'"), routes.indexOf("app.put('/api/owners/activities/:id/verify'"));

  assert.match(ownerActivities, /from\(washoutPhotos\)/);
  assert.match(ownerActivities, /photoCountByActivityId/);
  assert.match(ownerActivitiesRoute, /activities\.filter\(a => a\.photoCount > 0\)/);
  assert.doesNotMatch(ownerActivitiesRoute, /a\.photoUrls && a\.photoUrls\.length > 0/);
});

test("dashboard pending queue and photo modal use the owner activity response and authorized photo API", () => {
  const dashboard = readFileSync(new URL("../client/src/pages/owner/dashboard.tsx", import.meta.url), "utf8");
  const photoModal = readFileSync(new URL("../client/src/components/PhotoModal.tsx", import.meta.url), "utf8");

  assert.match(dashboard, /queryKey: \['\/api\/owners\/activities\?dateRange=all'\]/);
  assert.match(dashboard, /filterPendingWashoutApprovals\(allActivitiesData\)/);
  assert.match(dashboard, /Number\(activity\.photoCount \|\| 0\) > 0/);
  assert.match(photoModal, /\/api\/photos\/activity\/\$\{activity\.id\}/);
});

test("automatic verification is retired and only the owner approval route may invoke the canonical transition", () => {
  const storageSource = readFileSync(new URL("../server/storage.ts", import.meta.url), "utf8");
  const routes = readFileSync(new URL("../server/routes.ts", import.meta.url), "utf8");
  const automaticVerification = storageSource.slice(storageSource.indexOf("async autoApproveExpiredActivities"));
  const ownerVerification = routes.slice(routes.indexOf("app.put('/api/owners/activities/:id/verify'"), routes.indexOf("app.put('/api/owners/activities/:id/reject'"));

  assert.match(automaticVerification, /Automatic verification is retired/);
  assert.doesNotMatch(automaticVerification, /verifyWashoutActivity\(/);
  assert.match(ownerVerification, /activityDetails\.status !== "pending"/);
  assert.match(ownerVerification, /storage\.verifyWashoutActivityWithApprovalIntent\(/);
});

test("verified and rejected historical records remain outside the pending review queue", () => {
  const activities = [
    { id: "pending", status: "pending" },
    { id: "verified", status: "verified" },
    { id: "rejected", status: "rejected" },
  ];
  assert.deepEqual(filterPendingWashoutApprovals(activities).map((activity) => activity.id), ["pending"]);
});
