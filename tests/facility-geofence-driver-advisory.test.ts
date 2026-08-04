import assert from "node:assert/strict";
import test from "node:test";
import { registerFacilityGeofenceRoutes } from "../server/facilityGeofenceRoutes";
import { calculateFacilityGeofenceChecksum } from "../server/facilityGeofenceService";

type Handler = (req: any, res: any) => Promise<unknown>;
const locationId = "11111111-1111-4111-8111-111111111111";

function response() {
  return { statusCode: 200, body: undefined as any, status(code: number) { this.statusCode = code; return this; }, json(body: any) { this.body = body; return this; } };
}

function routeHarness(featureEnabled = true) {
  const posts = new Map<string, Handler>();
  const active = {
    id: "22222222-2222-4222-8222-222222222222", locationId, zoneKey: "primary", version: 1,
    mode: "radius", centerLatitude: "30.1", centerLongitude: "-97.7", radiusMeters: "100", geometryGeojson: null,
    exceptionDistanceMeters: "1609.344", geometryChecksum: calculateFacilityGeofenceChecksum({ mode: "radius", center: [-97.7, 30.1], radiusMeters: 100, exceptionDistanceMeters: 1609.344 }),
    status: "active", effectiveFrom: new Date("2026-01-01T00:00:00Z"), effectiveTo: null, activatedAt: new Date("2026-01-01T00:00:00Z"),
  };
  let persistenceCalls = 0;
  const app = { get() {}, post(path: string, ...handlers: Handler[]) { posts.set(path, handlers.at(-1)!); } };
  registerFacilityGeofenceRoutes(app as any, {
    storage: {
      getUser: async () => ({ id: "driver-user", role: "driver" }),
      checkFeatureFlag: async () => featureEnabled,
      getActiveLocationsAcceptingMaterial: async () => [{ id: locationId }],
    } as any,
    repository: {
      listActiveBoundaries: async () => [active],
      createActivityEvaluation: async () => { persistenceCalls += 1; throw new Error("advisory must not persist"); },
      listBoundaryVersions: async () => [], listRevisionEvents: async () => [], getBoundaryVersion: async () => undefined,
      createDraft: async () => { throw new Error("not used"); }, activateDraft: async () => { throw new Error("not used"); }, appendRevisionEvent: async () => { throw new Error("not used"); },
    } as any,
  });
  return { handler: posts.get("/api/drivers/locations/geofence-status")!, persistenceCalls: () => persistenceCalls };
}

async function evaluate(latitude: number | null, accuracyMeters = 5) {
  const h = routeHarness();
  const res = response();
  await h.handler({
    user: { id: "driver-user" },
    body: {
      locationIds: [locationId], materialSlug: "concrete-washout",
      observation: latitude === null ? null : { latitude, longitude: -97.7, accuracyMeters, observedAt: new Date().toISOString() },
    },
  }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(h.persistenceCalls(), 0);
  return res.body.results[0];
}

test("Driver batch advisory returns green, yellow, red, and neutral canonical states", async () => {
  assert.equal((await evaluate(30.1)).state, "INSIDE_APPROVED_BOUNDARY");
  assert.equal((await evaluate(30.103)).state, "OUTSIDE_BOUNDARY_WITHIN_EXCEPTION_ZONE");
  assert.equal((await evaluate(30.12)).state, "OUTSIDE_EXCEPTION_ZONE");
  assert.equal((await evaluate(null)).state, "LOCATION_UNAVAILABLE");
});

test("Driver advisory payload omits precise evidence and boundary geometry", async () => {
  const result = await evaluate(30.1);
  for (const forbidden of ["observationLatitude", "observationLongitude", "accuracyMeters", "geometry", "outsideDistanceMeters", "signedDistanceMeters"]) {
    assert.equal(forbidden in result, false, forbidden);
  }
});

test("Driver advisory rejects ineligible Facility IDs", async () => {
  const h = routeHarness();
  const res = response();
  await h.handler({ user: { id: "driver-user" }, body: { locationIds: ["33333333-3333-4333-8333-333333333333"], materialSlug: "concrete-washout", observation: null } }, res);
  assert.equal(res.statusCode, 403);
});

test("disabled Driver advisory flag fails closed without geofence reads", async () => {
  const h = routeHarness(false);
  const res = response();
  await h.handler({ user: { id: "driver-user" }, body: { locationIds: [locationId], materialSlug: "concrete-washout", observation: null } }, res);
  assert.equal(res.statusCode, 404);
});
