import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { registerFacilityGeofenceRoutes } from "../server/facilityGeofenceRoutes";
import { calculateFacilityGeofenceChecksum } from "../server/facilityGeofenceService";
import { getDriverGeofencePresentation } from "../client/src/lib/driverGeofenceAdvisory";
import { translate } from "../client/src/lib/i18n";
import { FEATURE_FLAGS } from "../shared/featureFlags";

type Handler = (req: any, res: any) => Promise<unknown>;
const locationId = "11111111-1111-4111-8111-111111111111";

function response() {
  return { statusCode: 200, body: undefined as any, status(code: number) { this.statusCode = code; return this; }, json(body: any) { this.body = body; return this; } };
}

function routeHarness(featureEnabled = true, userRole = "driver") {
  const posts = new Map<string, Handler>();
  const active = {
    id: "22222222-2222-4222-8222-222222222222", locationId, zoneKey: "primary", version: 1,
    mode: "radius", centerLatitude: "30.1", centerLongitude: "-97.7", radiusMeters: "100", geometryGeojson: null,
    exceptionDistanceMeters: "1609.344", geometryChecksum: calculateFacilityGeofenceChecksum({ mode: "radius", center: [-97.7, 30.1], radiusMeters: 100, exceptionDistanceMeters: 1609.344 }),
    status: "active", effectiveFrom: new Date("2026-01-01T00:00:00Z"), effectiveTo: null, activatedAt: new Date("2026-01-01T00:00:00Z"),
  };
  let persistenceCalls = 0;
  const requestedFlags: string[] = [];
  const app = { get() {}, post(path: string, ...handlers: Handler[]) { posts.set(path, handlers.at(-1)!); } };
  registerFacilityGeofenceRoutes(app as any, {
    storage: {
      getUser: async () => ({ id: "driver-user", role: userRole }),
      checkFeatureFlag: async (flagKey: string) => { requestedFlags.push(flagKey); return featureEnabled; },
      getDriver: async () => ({ id: "driver-profile", userId: "driver-user", activeMaterialSlug: "concrete-washout" }),
      getActiveLocationsAcceptingMaterial: async () => [{ id: locationId }],
    } as any,
    repository: {
      listActiveBoundaries: async () => [active],
      createActivityEvaluation: async () => { persistenceCalls += 1; throw new Error("advisory must not persist"); },
      listBoundaryVersions: async () => [], listRevisionEvents: async () => [], getBoundaryVersion: async () => undefined,
      createDraft: async () => { throw new Error("not used"); }, activateDraft: async () => { throw new Error("not used"); }, appendRevisionEvent: async () => { throw new Error("not used"); },
    } as any,
  });
  return { posts, handler: posts.get("/api/drivers/locations/geofence-status")!, persistenceCalls: () => persistenceCalls, requestedFlags };
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

test("fresh check-in advisory uses the advisory control and remains side-effect free", async () => {
  const h = routeHarness();
  const res = response();
  await h.posts.get("/api/drivers/locations/:locationId/geofence-advisory")!({
    user: { id: "driver-user" },
    params: { locationId },
    body: { observation: { latitude: 30.1, longitude: -97.7, accuracyMeters: 5, observedAt: new Date().toISOString() } },
  }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.state, "INSIDE_APPROVED_BOUNDARY");
  assert.equal(res.body.advisory, true);
  assert.deepEqual(h.requestedFlags, [FEATURE_FLAGS.GEOFENCE_ADVISORY_EVALUATION]);
  assert.equal(h.persistenceCalls(), 0);
});

test("fresh check-in advisory returns neutral when GPS is unavailable", async () => {
  const h = routeHarness();
  const res = response();
  await h.posts.get("/api/drivers/locations/:locationId/geofence-advisory")!({
    user: { id: "driver-user" }, params: { locationId }, body: { observation: null },
  }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.state, "LOCATION_UNAVAILABLE");
  assert.equal(h.persistenceCalls(), 0);
});

test("fresh check-in advisory preserves Driver RBAC", async () => {
  const h = routeHarness(true, "owner");
  const res = response();
  await h.posts.get("/api/drivers/locations/:locationId/geofence-advisory")!({
    user: { id: "owner-user" }, params: { locationId }, body: { observation: null },
  }, res);
  assert.equal(res.statusCode, 403);
  assert.equal(h.persistenceCalls(), 0);
});

test("green, yellow, red, and neutral advisory presentations are bilingual and explicit", () => {
  const cases = [
    ["INSIDE_APPROVED_BOUNDARY", "green", "Inside delivery boundary", "Dentro del límite de entrega"],
    ["OUTSIDE_BOUNDARY_WITHIN_EXCEPTION_ZONE", "yellow", "Just outside delivery boundary", "Justo fuera del límite de entrega"],
    ["OUTSIDE_EXCEPTION_ZONE", "red", "Outside delivery area", "Fuera del área de entrega"],
    ["LOCATION_UNAVAILABLE", "neutral", "Location could not be verified", "No se pudo verificar la ubicación"],
    ["LOCATION_ACCURACY_INSUFFICIENT", "neutral", "Location could not be verified", "No se pudo verificar la ubicación"],
    ["GEOMETRY_UNAVAILABLE", "neutral", "Location could not be verified", "No se pudo verificar la ubicación"],
  ] as const;

  for (const [state, tone, english, spanish] of cases) {
    const presentation = getDriverGeofencePresentation(state);
    assert.equal(presentation.tone, tone);
    assert.equal(translate(presentation.labelKey, "en"), english);
    assert.equal(translate(presentation.labelKey, "es"), spanish);
    assert.notEqual(translate(presentation.guidanceKey, "en"), presentation.guidanceKey);
    assert.notEqual(translate(presentation.guidanceKey, "es"), presentation.guidanceKey);
  }
});

test("Driver advisory UI is visible, accessible, retryable, and reevaluates fresh GPS without fallback coordinates", async () => {
  const [indicator, locations, checkIn, gps] = await Promise.all([
    readFile(new URL("../client/src/components/driver/DriverGeofenceIndicator.tsx", import.meta.url), "utf8"),
    readFile(new URL("../client/src/pages/driver/locations.tsx", import.meta.url), "utf8"),
    readFile(new URL("../client/src/components/WashoutForm.tsx", import.meta.url), "utf8"),
    readFile(new URL("../client/src/lib/gps.ts", import.meta.url), "utf8"),
  ]);

  assert.match(indicator, /role="status"/);
  assert.match(indicator, /aria-label=/);
  assert.match(indicator, /data-geofence-tone/);
  assert.match(indicator, /min-h-11/);
  assert.match(locations, /DriverGeofenceIndicator/);
  assert.match(locations, /button-refresh-facility-advisory/);
  assert.match(locations, /\/api\/drivers\/locations\/geofence-status/);
  assert.match(checkIn, /\/geofence-advisory/);
  assert.match(checkIn, /forceRefresh: true/);
  assert.match(checkIn, /gpsLocation\?\.observedAt/);
  assert.match(checkIn, /button-retry-geofence-gps/);
  assert.doesNotMatch(`${locations}\n${checkIn}\n${gps}`, /Denver|fallbackLatitude|fallbackLongitude/i);
});

test("Driver advisory UI preserves Facility ordering, material eligibility, and advisory-only selection", async () => {
  const locations = await readFile(new URL("../client/src/pages/driver/locations.tsx", import.meta.url), "utf8");
  assert.match(locations, /sortBy === "distance"/);
  assert.match(locations, /materialSlug=\$\{encodeURIComponent\(activeMaterialSlug\)\}/);
  assert.match(locations, /setLocation\(`\/check-in\/\$\{location\.id\}`\)/);
  assert.doesNotMatch(locations, /disabled=.*geofence|geofence.*disabled=/i);
});
