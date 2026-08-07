import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { registerFacilityGeofenceRoutes } from "../server/facilityGeofenceRoutes";
import { calculateFacilityGeofenceChecksum } from "../server/facilityGeofenceService";
import { DriverGeofenceIndicator } from "../client/src/components/driver/DriverGeofenceIndicator";
import { getDriverGeofencePresentation, indexDriverGeofenceResults } from "../client/src/lib/driverGeofenceAdvisory";
import { translate } from "../client/src/lib/i18n";
import { FEATURE_FLAGS } from "../shared/featureFlags";

type Handler = (req: any, res: any) => Promise<unknown>;
const locationId = "11111111-1111-4111-8111-111111111111";
const unconfiguredLocationId = "44444444-4444-4444-8444-444444444444";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

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
      getActiveLocationsAcceptingMaterial: async () => [{ id: locationId }, { id: unconfiguredLocationId }],
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

test("Driver batch advisory returns one explicit safe result for every requested eligible Facility", async () => {
  const h = routeHarness();
  const res = response();
  await h.handler({
    user: { id: "driver-user" },
    body: {
      locationIds: [locationId, unconfiguredLocationId],
      materialSlug: "concrete-washout",
      observation: { latitude: 30.1, longitude: -97.7, accuracyMeters: 5, observedAt: new Date().toISOString() },
    },
  }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.complete, true);
  assert.equal(res.body.results.length, 2);
  assert.deepEqual(res.body.results.map((result: any) => result.locationId), [locationId, unconfiguredLocationId]);
  assert.deepEqual(res.body.results[1], {
    locationId: unconfiguredLocationId,
    boundaryVersionId: null,
    state: "GEOMETRY_UNAVAILABLE",
    evaluatedAt: res.body.results[1].evaluatedAt,
    observationTimestamp: res.body.results[1].observationTimestamp,
    advisory: true,
    reasonCode: "NO_ACTIVE_PRIMARY_BOUNDARY",
    canSubmitException: false,
  });
  assert.equal(h.persistenceCalls(), 0);
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

test("green, yellow, red, and each neutral advisory presentation is bilingual and explicit", () => {
  const cases = [
    ["INSIDE_APPROVED_BOUNDARY", null, "green", "Inside delivery boundary", "Dentro del límite de entrega", "none"],
    ["OUTSIDE_BOUNDARY_WITHIN_EXCEPTION_ZONE", null, "yellow", "Just outside delivery boundary", "Justo fuera del límite de entrega", "none"],
    ["OUTSIDE_EXCEPTION_ZONE", null, "red", "Outside delivery area", "Fuera del área de entrega", "none"],
    ["LOCATION_UNAVAILABLE", "LOCATION_COORDINATES_UNAVAILABLE", "neutral", "Device location unavailable", "Ubicación del dispositivo no disponible", "gps"],
    ["LOCATION_ACCURACY_INSUFFICIENT", "LOCATION_ACCURACY_EXCEEDS_LIMIT", "neutral", "GPS precision is still too low.", "La precisión del GPS aún es demasiado baja.", "gps"],
    ["LOCATION_ACCURACY_INSUFFICIENT", "LOCATION_TIMESTAMP_OUTSIDE_WINDOW", "neutral", "The location reading is out of date.", "La lectura de ubicación está desactualizada.", "gps"],
    ["LOCATION_ACCURACY_INSUFFICIENT", "LOCATION_UNCERTAINTY_OVERLAPS_BOUNDARY", "neutral", "Your location appears close to the delivery boundary.", "Tu ubicación parece estar cerca del límite de entrega.", "gps"],
    ["LOCATION_ACCURACY_INSUFFICIENT", "LOCATION_UNCERTAINTY_OVERLAPS_EXCEPTION_THRESHOLD", "neutral", "Your location appears close to the advisory limit.", "Tu ubicación parece estar cerca del límite de aviso.", "gps"],
    ["GEOMETRY_UNAVAILABLE", "NO_ACTIVE_PRIMARY_BOUNDARY", "neutral", "Delivery boundary not configured", "Límite de entrega no configurado", "none"],
    ["GEOMETRY_INVALID", "GEOMETRY_CHECKSUM_MISMATCH", "neutral", "Delivery boundary temporarily unavailable", "Límite de entrega no disponible temporalmente", "none"],
    ["ADVISORY_REQUEST_FAILED", null, "neutral", "Boundary status temporarily unavailable", "Estado del límite no disponible temporalmente", "status"],
    ["ADVISORY_RESULT_MISSING", null, "neutral", "Boundary status temporarily unavailable", "Estado del límite no disponible temporalmente", "status"],
  ] as const;

  for (const [state, reasonCode, tone, english, spanish, retry] of cases) {
    const presentation = getDriverGeofencePresentation(state, reasonCode);
    assert.equal(presentation.tone, tone);
    assert.equal(presentation.retry, retry);
    assert.equal(translate(presentation.labelKey, "en"), english);
    assert.equal(translate(presentation.labelKey, "es"), spanish);
    assert.notEqual(translate(presentation.guidanceKey, "en"), presentation.guidanceKey);
    assert.notEqual(translate(presentation.guidanceKey, "es"), presentation.guidanceKey);
  }
});

test("traffic-light indicator renders accessible color lights while neutral uses one solid gray light and text", () => {
  const cases = [
    ["INSIDE_APPROVED_BOUNDARY", "green", "Inside delivery boundary"],
    ["OUTSIDE_BOUNDARY_WITHIN_EXCEPTION_ZONE", "yellow", "Just outside delivery boundary"],
    ["OUTSIDE_EXCEPTION_ZONE", "red", "Outside delivery area"],
    ["LOCATION_UNAVAILABLE", "neutral", "Device location unavailable"],
  ] as const;
  for (const [state, tone, label] of cases) {
    const html = renderToStaticMarkup(React.createElement(DriverGeofenceIndicator, { state }));
    assert.match(html, new RegExp(`data-geofence-tone="${tone}"`));
    assert.match(html, new RegExp(`data-testid="driver-geofence-light-${tone}"`));
    assert.match(html, new RegExp(label));
    assert.match(html, /role="status"/);
    assert.match(html, /aria-label=/);
    assert.match(html, /rounded-full/);
  }
  const neutral = renderToStaticMarkup(React.createElement(DriverGeofenceIndicator, { state: "LOCATION_UNAVAILABLE" }));
  assert.doesNotMatch(neutral, /lucide-circle-help|lucide-help-circle/);
});

test("missing boundary never recommends retrying GPS, while request failure requests status retry", () => {
  const missingBoundary = getDriverGeofencePresentation("GEOMETRY_UNAVAILABLE", "NO_ACTIVE_PRIMARY_BOUNDARY");
  assert.equal(missingBoundary.retry, "none");
  assert.doesNotMatch(translate(missingBoundary.guidanceKey, "en"), /GPS/i);

  const requestFailure = getDriverGeofencePresentation("ADVISORY_REQUEST_FAILED");
  assert.equal(requestFailure.retry, "status");
  assert.match(translate(requestFailure.guidanceKey, "en"), /Retry the boundary status/i);
});

test("missing Facility results are detected explicitly instead of becoming missing geometry", () => {
  const indexed = indexDriverGeofenceResults(
    [locationId, unconfiguredLocationId],
    [{ locationId, state: "INSIDE_APPROVED_BOUNDARY", reasonCode: "INSIDE_APPROVED_BOUNDARY" }],
  );
  assert.equal(indexed.byLocation.get(locationId)?.state, "INSIDE_APPROVED_BOUNDARY");
  assert.deepEqual(indexed.missingLocationIds, [unconfiguredLocationId]);
  assert.equal(indexed.byLocation.has(unconfiguredLocationId), false);
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
  assert.match(checkIn, /fresh: isRetry \|\| forceRefresh/);
  assert.match(checkIn, /gpsLocation\?\.observedAt/);
  assert.match(checkIn, /button-retry-geofence-gps/);
  assert.match(checkIn, /geofence\.driver\.improving/);
  assert.match(checkIn, /pilot\.gps\.timeout/);
  assert.match(locations, /pilot\.gps\.timeout/);
  assert.match(locations, /locationAttempt/);
  assert.match(locations, /retry: false/);
  assert.match(locations, /driver-geofence-gps-improving/);
  assert.match(gps, /maximumAge: options\.fresh \? 0 : INITIAL_MAXIMUM_AGE_MS/);
  assert.match(gps, /watchPosition/);
  assert.doesNotMatch(`${locations}\n${checkIn}\n${gps}`, /Denver|fallbackLatitude|fallbackLongitude/i);
  assert.doesNotMatch(`${locations}\n${checkIn}\n${gps}`, /console\.(log|info|debug).*latitude|console\.(log|info|debug).*longitude/i);
});

test("reason-specific neutral wording does not give stale or overlap cases outdoor-signal guidance", () => {
  const stale = getDriverGeofencePresentation("LOCATION_ACCURACY_INSUFFICIENT", "LOCATION_TIMESTAMP_OUTSIDE_WINDOW");
  const boundary = getDriverGeofencePresentation("LOCATION_ACCURACY_INSUFFICIENT", "LOCATION_UNCERTAINTY_OVERLAPS_BOUNDARY");
  const exception = getDriverGeofencePresentation("LOCATION_ACCURACY_INSUFFICIENT", "LOCATION_UNCERTAINTY_OVERLAPS_EXCEPTION_THRESHOLD");
  assert.doesNotMatch(translate(stale.guidanceKey, "en"), /open area|outdoors/i);
  assert.doesNotMatch(translate(boundary.guidanceKey, "en"), /open area|outdoors/i);
  assert.doesNotMatch(translate(exception.guidanceKey, "en"), /open area|outdoors/i);
});

test("Driver advisory UI preserves Facility ordering, material eligibility, and advisory-only selection", async () => {
  const locations = await readFile(new URL("../client/src/pages/driver/locations.tsx", import.meta.url), "utf8");
  assert.match(locations, /sortBy === "distance"/);
  assert.match(locations, /materialSlug=\$\{encodeURIComponent\(activeMaterialSlug\)\}/);
  assert.match(locations, /setLocation\(`\/check-in\/\$\{location\.id\}`\)/);
  assert.doesNotMatch(locations, /disabled=.*geofence|geofence.*disabled=/i);
});
