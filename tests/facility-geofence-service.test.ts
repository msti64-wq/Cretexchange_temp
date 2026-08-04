import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_FACILITY_GEOFENCE_CONFIG,
  FacilityGeofenceService,
  calculateFacilityGeofenceChecksum,
  projectFacilityGeofenceResultForDriver,
  validateFacilityGeofenceBoundary,
  type FacilityGeofenceBoundaryRecord,
  type FacilityGeofenceObservation,
  type FacilityGeofenceRepository,
  type GeoJsonPolygon,
  type Position,
} from "../server/facilityGeofenceService";

const NOW = new Date("2026-08-04T18:00:00.000Z");
const LOCATION_ID = "facility-1";
const EXCEPTION_METERS = DEFAULT_FACILITY_GEOFENCE_CONFIG.exceptionDistanceMeters;

const repository: FacilityGeofenceRepository = {
  listActiveBoundaries: async () => [],
  createActivityEvaluation: async () => { throw new Error("not used"); },
};

const service = new FacilityGeofenceService(repository, DEFAULT_FACILITY_GEOFENCE_CONFIG, () => NOW);

function observation(
  latitude: number,
  longitude: number,
  overrides: Partial<FacilityGeofenceObservation> = {},
): FacilityGeofenceObservation {
  return {
    latitude,
    longitude,
    accuracyMeters: 0,
    observedAt: NOW,
    ...overrides,
  };
}

function radiusBoundary(overrides: Partial<FacilityGeofenceBoundaryRecord> = {}): FacilityGeofenceBoundaryRecord {
  const center: Position = [0, 0];
  const radiusMeters = 100;
  return {
    id: "radius-v1",
    locationId: LOCATION_ID,
    zoneKey: "primary",
    version: 1,
    mode: "radius",
    centerLatitude: center[1],
    centerLongitude: center[0],
    radiusMeters,
    geometryGeojson: null,
    exceptionDistanceMeters: EXCEPTION_METERS,
    geometryChecksum: calculateFacilityGeofenceChecksum({
      mode: "radius",
      center,
      radiusMeters,
      exceptionDistanceMeters: EXCEPTION_METERS,
    }),
    status: "active",
    effectiveFrom: new Date("2026-08-01T00:00:00.000Z"),
    effectiveTo: null,
    activatedAt: new Date("2026-08-01T00:00:00.000Z"),
    ...overrides,
  };
}

const SMALL_SQUARE: GeoJsonPolygon = {
  type: "Polygon",
  coordinates: [[
    [0, 0],
    [0.001, 0],
    [0.001, 0.001],
    [0, 0.001],
    [0, 0],
  ]],
};

function polygonBoundary(
  geometry: GeoJsonPolygon = SMALL_SQUARE,
  overrides: Partial<FacilityGeofenceBoundaryRecord> = {},
): FacilityGeofenceBoundaryRecord {
  return {
    id: "polygon-v1",
    locationId: LOCATION_ID,
    zoneKey: "primary",
    version: 1,
    mode: "polygon",
    centerLatitude: null,
    centerLongitude: null,
    radiusMeters: null,
    geometryGeojson: geometry,
    exceptionDistanceMeters: EXCEPTION_METERS,
    geometryChecksum: calculateFacilityGeofenceChecksum({
      mode: "polygon",
      polygon: geometry,
      exceptionDistanceMeters: EXCEPTION_METERS,
    }),
    status: "active",
    effectiveFrom: new Date("2026-08-01T00:00:00.000Z"),
    effectiveTo: null,
    activatedAt: new Date("2026-08-01T00:00:00.000Z"),
    ...overrides,
  };
}

function evaluate(
  boundary: FacilityGeofenceBoundaryRecord | null,
  gps: FacilityGeofenceObservation | null,
  purpose: "selection_advisory" | "check_in" | "submission" = "submission",
) {
  return service.evaluateBoundary({
    locationId: LOCATION_ID,
    boundary,
    observation: gps,
    purpose,
    evaluatedAt: NOW,
  });
}

function destinationNorth(center: Position, distanceMeters: number): Position {
  const latitudeDeltaDegrees = (distanceMeters / 6_371_008.8) * (180 / Math.PI);
  return [center[0], center[1] + latitudeDeltaDegrees];
}

test("valid radius and polygon definitions pass governed validation", () => {
  assert.equal(validateFacilityGeofenceBoundary(radiusBoundary()).valid, true);
  assert.equal(validateFacilityGeofenceBoundary(polygonBoundary()).valid, true);
});

test("minimum three-vertex closed polygon is valid", () => {
  const triangle: GeoJsonPolygon = {
    type: "Polygon",
    coordinates: [[[0, 0], [0.001, 0], [0, 0.001], [0, 0]]],
  };
  assert.equal(validateFacilityGeofenceBoundary(polygonBoundary(triangle)).valid, true);
});

test("polygon validation rejects too few vertices, collinearity, and an unclosed ring", () => {
  const tooFew = polygonBoundary({ type: "Polygon", coordinates: [[[0, 0], [0.001, 0], [0, 0]]] });
  const collinear = polygonBoundary({ type: "Polygon", coordinates: [[[0, 0], [0.001, 0], [0.002, 0], [0, 0]]] });
  const unclosedGeometry = { type: "Polygon", coordinates: [[[0, 0], [0.001, 0], [0, 0.001], [0.0001, 0.0001]]] } as GeoJsonPolygon;
  const unclosed = polygonBoundary(unclosedGeometry);
  assert.equal(validateFacilityGeofenceBoundary(tooFew).valid, false);
  assert.deepEqual(validateFacilityGeofenceBoundary(collinear), { valid: false, reasonCode: "POLYGON_AREA_INSUFFICIENT" });
  assert.deepEqual(validateFacilityGeofenceBoundary(unclosed), { valid: false, reasonCode: "POLYGON_RING_NOT_CLOSED" });
});

test("polygon validation rejects invalid coordinates and self-intersection", () => {
  const invalidCoordinate = polygonBoundary({
    type: "Polygon",
    coordinates: [[[181, 0], [181, 1], [180, 1], [181, 0]]],
  });
  const bowTie = polygonBoundary({
    type: "Polygon",
    coordinates: [[[0, 0], [0.002, 0.002], [0, 0.002], [0.002, 0], [0, 0]]],
  });
  assert.equal(validateFacilityGeofenceBoundary(invalidCoordinate).valid, false);
  assert.deepEqual(validateFacilityGeofenceBoundary(bowTie), { valid: false, reasonCode: "POLYGON_SELF_INTERSECTION" });
});

test("polygon validation enforces 200 vertices, two square miles, and five miles span", () => {
  const excessiveRing: Position[] = Array.from({ length: 201 }, (_, index) => {
    const angle = (index / 201) * Math.PI * 2;
    return [Math.cos(angle) * 0.001, Math.sin(angle) * 0.001];
  });
  excessiveRing.push(excessiveRing[0]);
  const tooLarge: GeoJsonPolygon = {
    type: "Polygon",
    coordinates: [[[0, 0], [0.03, 0], [0.03, 0.03], [0, 0.03], [0, 0]]],
  };
  const tooWide: GeoJsonPolygon = {
    type: "Polygon",
    coordinates: [[[0, 0], [0.09, 0], [0.09, 0.001], [0, 0.001], [0, 0]]],
  };
  assert.deepEqual(
    validateFacilityGeofenceBoundary(polygonBoundary({ type: "Polygon", coordinates: [excessiveRing] })),
    { valid: false, reasonCode: "POLYGON_VERTEX_LIMIT_EXCEEDED" },
  );
  assert.deepEqual(validateFacilityGeofenceBoundary(polygonBoundary(tooLarge)), { valid: false, reasonCode: "POLYGON_AREA_LIMIT_EXCEEDED" });
  assert.deepEqual(validateFacilityGeofenceBoundary(polygonBoundary(tooWide)), { valid: false, reasonCode: "POLYGON_SPAN_LIMIT_EXCEEDED" });
});

test("radius classification covers inside, exact edge, just outside, exact exception, and beyond", () => {
  const boundary = radiusBoundary();
  const inside = destinationNorth([0, 0], 50);
  const edge = destinationNorth([0, 0], 100);
  const outside = destinationNorth([0, 0], 101);
  const exactException = destinationNorth([0, 0], 100 + EXCEPTION_METERS);
  const beyond = destinationNorth([0, 0], 100 + EXCEPTION_METERS + 1);
  assert.equal(evaluate(boundary, observation(inside[1], inside[0])).state, "INSIDE_APPROVED_BOUNDARY");
  assert.equal(evaluate(boundary, observation(edge[1], edge[0])).state, "INSIDE_APPROVED_BOUNDARY");
  assert.equal(evaluate(boundary, observation(outside[1], outside[0])).state, "OUTSIDE_BOUNDARY_WITHIN_EXCEPTION_ZONE");
  assert.equal(evaluate(boundary, observation(exactException[1], exactException[0])).state, "OUTSIDE_BOUNDARY_WITHIN_EXCEPTION_ZONE");
  assert.equal(evaluate(boundary, observation(beyond[1], beyond[0])).state, "OUTSIDE_EXCEPTION_ZONE");
});

test("polygon classification includes edge contact and uses nearest edge outside distance", () => {
  const boundary = polygonBoundary();
  assert.equal(evaluate(boundary, observation(0.0005, 0.0005)).state, "INSIDE_APPROVED_BOUNDARY");
  assert.equal(evaluate(boundary, observation(0.0005, 0)).state, "INSIDE_APPROVED_BOUNDARY");
  const outside = evaluate(boundary, observation(0.0005, -0.00001));
  assert.equal(outside.state, "OUTSIDE_BOUNDARY_WITHIN_EXCEPTION_ZONE");
  assert.ok((outside.outsideDistanceMeters ?? 0) > 0);
  assert.ok((outside.outsideDistanceMeters ?? Infinity) < 2);
});

test("geometry unavailable and invalid return stable safe states", () => {
  assert.equal(evaluate(null, observation(0, 0)).state, "GEOMETRY_UNAVAILABLE");
  const invalid = radiusBoundary({ geometryChecksum: "0".repeat(64) });
  const result = evaluate(invalid, observation(0, 0));
  assert.equal(result.state, "GEOMETRY_INVALID");
  assert.equal(result.reasonCode, "GEOMETRY_CHECKSUM_MISMATCH");
});

test("GPS confidence rejects stale, inaccurate, missing, and unavailable observations", () => {
  const boundary = radiusBoundary();
  assert.equal(evaluate(boundary, observation(0, 0, { accuracyMeters: 5 })).state, "INSIDE_APPROVED_BOUNDARY");
  assert.equal(evaluate(boundary, observation(0, 0, { observedAt: new Date(NOW.getTime() - 60_001) })).state, "LOCATION_ACCURACY_INSUFFICIENT");
  assert.equal(evaluate(boundary, observation(0, 0, { accuracyMeters: 100.001 })).state, "LOCATION_ACCURACY_INSUFFICIENT");
  assert.equal(evaluate(boundary, observation(0, 0, { accuracyMeters: null })).state, "LOCATION_ACCURACY_INSUFFICIENT");
  assert.equal(evaluate(boundary, null).state, "LOCATION_UNAVAILABLE");
});

test("GPS uncertainty overlapping the boundary or exception threshold is insufficient", () => {
  const boundary = radiusBoundary();
  const nearInside = destinationNorth([0, 0], 95);
  const nearException = destinationNorth([0, 0], 100 + EXCEPTION_METERS - 5);
  const boundaryOverlap = evaluate(boundary, observation(nearInside[1], nearInside[0], { accuracyMeters: 10 }));
  const exceptionOverlap = evaluate(boundary, observation(nearException[1], nearException[0], { accuracyMeters: 10 }));
  assert.equal(boundaryOverlap.reasonCode, "LOCATION_UNCERTAINTY_OVERLAPS_BOUNDARY");
  assert.equal(exceptionOverlap.reasonCode, "LOCATION_UNCERTAINTY_OVERLAPS_EXCEPTION_THRESHOLD");
});

test("Driver projection omits precise geometry and observation evidence", () => {
  const result = evaluate(radiusBoundary(), observation(0, 0), "selection_advisory");
  const projection = projectFacilityGeofenceResultForDriver(result);
  assert.equal(projection.state, "INSIDE_APPROVED_BOUNDARY");
  assert.equal("observationLatitude" in projection, false);
  assert.equal("outsideDistanceMeters" in projection, false);
  assert.equal("boundaryVersion" in projection, false);
});

test("selection advisories remain side-effect free and durable evidence is versioned and idempotent", () => {
  const result = evaluate(radiusBoundary(), observation(0, 0), "check_in");
  const advisory = service.prepareActivityEvaluation({
    result: { ...result, advisory: true },
    purpose: "selection_advisory",
    idempotencyKey: "advisory-not-persisted",
    workflowReference: "workflow-1",
    evidenceComplete: true,
  });
  const durable = service.prepareActivityEvaluation({
    result,
    purpose: "check_in",
    idempotencyKey: "workflow-1:check-in:radius-v1",
    workflowReference: "workflow-1",
    evidenceComplete: true,
  });
  assert.deepEqual(advisory, { persist: false, evidence: null });
  assert.equal(durable.persist, true);
  assert.equal(durable.evidence?.boundaryVersionId, "radius-v1");
  assert.equal(durable.evidence?.boundaryVersion, 1);
  assert.equal(durable.evidence?.idempotencyKey, "workflow-1:check-in:radius-v1");
});

test("active boundary loading is batch-bounded, effective-time aware, and version deterministic", async () => {
  const older = radiusBoundary({ id: "old", version: 1 });
  const newer = radiusBoundary({ id: "new", version: 2 });
  const draft = radiusBoundary({ id: "draft", version: 3, status: "draft", effectiveFrom: null, activatedAt: null });
  const loadingService = new FacilityGeofenceService({
    listActiveBoundaries: async () => [older, draft, newer],
    createActivityEvaluation: async () => { throw new Error("not used"); },
  }, DEFAULT_FACILITY_GEOFENCE_CONFIG, () => NOW);
  const selected = await loadingService.loadActiveBoundaries([LOCATION_ID, LOCATION_ID], NOW);
  assert.equal(selected.get(LOCATION_ID)?.id, "new");
  await assert.rejects(
    () => loadingService.loadActiveBoundaries(Array.from({ length: 101 }, (_, index) => `facility-${index}`), NOW),
    /governed batch limit/,
  );
});
