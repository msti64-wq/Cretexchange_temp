import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { registerFacilityGeofenceRoutes } from "../server/facilityGeofenceRoutes";
import { calculateFacilityGeofenceChecksum } from "../server/facilityGeofenceService";

type Handler = (req: any, res: any) => Promise<unknown>;

function harness(options: { locationOwnerId?: string; userRole?: string; featureEnabled?: boolean } = {}) {
  const gets = new Map<string, Handler>();
  const posts = new Map<string, Handler>();
  const app = {
    get(path: string, ...handlers: Handler[]) { gets.set(path, handlers.at(-1)!); },
    post(path: string, ...handlers: Handler[]) { posts.set(path, handlers.at(-1)!); },
  };
  const location = { id: "11111111-1111-4111-8111-111111111111", ownerId: options.locationOwnerId || "owner-1", name: "Test Facility", latitude: "30.1", longitude: "-97.7" };
  const radius = {
    id: "22222222-2222-4222-8222-222222222222", locationId: location.id, zoneKey: "primary", version: 1,
    mode: "radius", centerLatitude: "30.1", centerLongitude: "-97.7", radiusMeters: "100", geometryGeojson: null,
    exceptionDistanceMeters: "1609.344", geometryChecksum: calculateFacilityGeofenceChecksum({ mode: "radius", center: [-97.7, 30.1], radiusMeters: 100, exceptionDistanceMeters: 1609.344 }),
    status: "active", effectiveFrom: new Date("2026-08-01T00:00:00Z"), effectiveTo: null, previousVersionId: null,
    createdBy: "user-1", createdAt: new Date("2026-08-01T00:00:00Z"), activatedBy: "user-1", activatedAt: new Date("2026-08-01T00:00:00Z"),
  };
  let repositoryReads = 0;
  registerFacilityGeofenceRoutes(app as any, {
    storage: {
      getUser: async () => ({ id: "user-1", role: options.userRole || "owner" }),
      checkFeatureFlag: async () => options.featureEnabled !== false,
      getOwner: async () => ({ id: "owner-1", userId: "user-1" }),
      getWashoutLocation: async () => location,
      getWashoutActivity: async () => ({ id: "activity-1", locationId: location.id }),
      getDriver: async () => undefined,
      getActiveLocationsAcceptingMaterial: async () => [],
    } as any,
    repository: {
      listBoundaryVersions: async () => { repositoryReads += 1; return [radius]; },
      listRevisionEvents: async () => [],
      getBoundaryVersion: async () => radius,
      getLatestActivityEvaluation: async () => ({
        activityId: "activity-1", locationId: location.id, boundaryVersionId: radius.id, boundaryVersion: 1,
        resultState: "OUTSIDE_BOUNDARY_WITHIN_EXCEPTION_ZONE", reasonCode: "OUTSIDE_BOUNDARY_WITHIN_EXCEPTION_ZONE",
        exceptionAcknowledgementCode: "FACILITY_PERSONNEL_DIRECTED", driverNote: "Directed here", evidenceComplete: true,
        evaluatedAt: new Date("2026-08-01T01:00:00Z"), observationLatitude: "30.2", observationLongitude: "-97.8", accuracyMeters: "5",
      }),
      createDraft: async () => ({ ...radius, status: "draft", activatedAt: null, activatedBy: null, effectiveFrom: null }),
      activateDraft: async () => radius,
      appendRevisionEvent: async () => ({ id: "event-1" }),
    } as any,
  });
  return { gets, posts, location, radius, repositoryReads: () => repositoryReads };
}

function response() {
  return {
    statusCode: 200,
    body: undefined as any,
    status(code: number) { this.statusCode = code; return this; },
    json(body: any) { this.body = body; return this; },
  };
}

test("Owner boundary read is Facility-scoped and privacy-reduced", async () => {
  const h = harness();
  const res = response();
  await h.gets.get("/api/owners/locations/:locationId/geofence")!({ user: { id: "user-1" }, params: { locationId: h.location.id }, header: () => null }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.readiness, "configured");
  assert.equal(res.body.active.version, 1);
  assert.equal("geometryChecksum" in res.body.active, false);
  assert.equal("createdBy" in res.body.active, false);
});

test("cross-Owner boundary access stops before repository reads", async () => {
  const h = harness({ locationOwnerId: "another-owner" });
  const res = response();
  await h.gets.get("/api/owners/locations/:locationId/geofence")!({ user: { id: "user-1" }, params: { locationId: h.location.id }, header: () => null }, res);
  assert.equal(res.statusCode, 404);
  assert.equal(h.repositoryReads(), 0);
});

test("disabled Owner boundary flag fails closed", async () => {
  const h = harness({ featureEnabled: false });
  const res = response();
  await h.gets.get("/api/owners/locations/:locationId/geofence")!({ user: { id: "user-1" }, params: { locationId: h.location.id }, header: () => null }, res);
  assert.equal(res.statusCode, 404);
  assert.equal(h.repositoryReads(), 0);
});

test("server validation rejects a self-intersecting polygon", async () => {
  const h = harness();
  const res = response();
  await h.posts.get("/api/owners/locations/:locationId/geofence/validate")!({
    user: { id: "user-1" }, params: { locationId: h.location.id }, header: () => null,
    body: { mode: "polygon", exceptionDistanceMeters: 1000, geometry: { type: "Polygon", coordinates: [[[-97.71, 30.09], [-97.69, 30.11], [-97.71, 30.11], [-97.69, 30.09], [-97.71, 30.09]]] } },
  }, res);
  assert.equal(res.statusCode, 422);
  assert.equal(res.body.valid, false);
  assert.match(res.body.reasonCode, /SELF_INTERSECTION|KINK/i);
});

test("activation requires explicit confirmation", async () => {
  const h = harness();
  const res = response();
  await h.posts.get("/api/owners/locations/:locationId/geofence/versions/:boundaryVersionId/activate")!({ user: { id: "user-1" }, params: { locationId: h.location.id, boundaryVersionId: h.radius.id }, header: () => null, body: { reasonCode: "OWNER_CONFIRMED" } }, res);
  assert.equal(res.statusCode, 400);
});

test("temporary context is denied before evaluation access for another Owner", async () => {
  const h = harness({ locationOwnerId: "another-owner" });
  const res = response();
  await h.posts.get("/api/owners/activities/:activityId/geofence/temporary-context")!({ user: { id: "user-1" }, params: { activityId: "activity-1" }, header: () => null, body: { confirmationAcknowledged: true, note: "Temporary delivery routing" } }, res);
  assert.equal(res.statusCode, 404);
});

test("Admin context is role-protected and privacy-reduced", async () => {
  const h = harness({ userRole: "admin" });
  const res = response();
  await h.gets.get("/api/admin/geofence/activities/:activityId/context")!({ user: { id: "admin-user" }, params: { activityId: "activity-1" } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.state, "OUTSIDE_BOUNDARY_WITHIN_EXCEPTION_ZONE");
  for (const forbidden of ["observationLatitude", "observationLongitude", "accuracyMeters", "outsideDistanceMeters", "geometry"]) {
    assert.equal(forbidden in res.body, false, forbidden);
  }
});

test("Owner boundary history and status metadata are bilingual and expose an on-page language control", async () => {
  const [page, i18n] = await Promise.all([
    readFile(new URL("../client/src/pages/owner/facility-geofence.tsx", import.meta.url), "utf8"),
    readFile(new URL("../client/src/lib/i18n.ts", import.meta.url), "utf8"),
  ]);

  assert.match(page, /<LanguageToggle/);
  assert.match(page, /localizedStatus\(boundary\.status\)/);
  assert.match(page, /localizedMode\(boundary\.mode\)/);
  assert.match(page, /localizedEvent\(event\.eventType\)/);
  assert.match(page, /localizedReason\(event\.reasonCode\)/);

  for (const key of [
    "geofence.owner.status.active",
    "geofence.owner.event.activated",
    "geofence.owner.reason.ownerConfirmedOperationalArea",
    "geofence.owner.activationReasonPlaceholder",
  ]) {
    assert.equal(i18n.split(`\"${key}\"`).length - 1, 2, `${key} must exist in English and Spanish`);
  }
});
