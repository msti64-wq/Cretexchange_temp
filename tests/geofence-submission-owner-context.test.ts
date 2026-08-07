import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { translate } from "../client/src/lib/i18n";
import { getOwnerGeofencePresentation } from "../client/src/lib/ownerGeofencePresentation";
import { FacilityGeofenceService, calculateFacilityGeofenceChecksum } from "../server/facilityGeofenceService";
import { resolveSubmissionGeofenceRouting, shouldCaptureSubmissionGeofenceEvidence } from "../server/geofenceSubmissionCapture";
import { resolveGeofenceSubmissionDecision } from "../server/geofenceSubmissionPolicy";
import { projectOwnerGeofenceContext, stripPrivateOwnerActivityEvidence } from "../server/ownerGeofenceContext";

const evaluatedAt = new Date("2026-08-07T18:00:00.000Z");

function evaluation(resultState: string, reasonCode = resultState, overrides: Record<string, unknown> = {}) {
  return {
    id: "evaluation-1",
    activityId: "activity-1",
    workflowReference: null,
    locationId: "facility-1",
    boundaryVersionId: "boundary-v3",
    boundaryVersion: 3,
    evaluationPurpose: "submission",
    resultState,
    reasonCode,
    observationLatitude: "30.10000000",
    observationLongitude: "-97.70000000",
    accuracyMeters: "5.000",
    observedAt: new Date("2026-08-07T17:59:59.000Z"),
    evaluatedAt,
    signedDistanceMeters: "-10.000",
    outsideDistanceMeters: "0.000",
    exceptionDistanceMeters: "1609.344",
    exceptionAcknowledgementCode: null,
    driverNote: null,
    evidenceComplete: true,
    idempotencyKey: "geofence:submission-1:submission",
    createdAt: evaluatedAt,
    ...overrides,
  } as any;
}

test("existing schema is sufficient for the complete immutable submission snapshot", async () => {
  const schema = await readFile(new URL("../shared/schema.ts", import.meta.url), "utf8");
  const table = schema.slice(
    schema.indexOf('pgTable("activity_geofence_evaluations"'),
    schema.indexOf("// Owner approval is an explicit"),
  );
  for (const field of [
    "activityId", "locationId", "boundaryVersionId", "boundaryVersion", "resultState", "reasonCode",
    "observedAt", "evaluatedAt", "accuracyMeters", "evidenceComplete", "idempotencyKey",
  ]) assert.match(table, new RegExp(field));
  assert.match(table, /idempotencyKey:.*\.unique\(\)/);
});

test("fresh canonical evaluation binds the boundary version effective at submission", async () => {
  const boundary = {
    id: "boundary-v3", locationId: "facility-1", zoneKey: "primary", version: 3,
    mode: "radius", centerLatitude: "30.1", centerLongitude: "-97.7", radiusMeters: "100",
    geometryGeojson: null, exceptionDistanceMeters: "1609.344",
    geometryChecksum: calculateFacilityGeofenceChecksum({ mode: "radius", center: [-97.7, 30.1], radiusMeters: 100, exceptionDistanceMeters: 1609.344 }),
    status: "active", effectiveFrom: new Date("2026-08-01T00:00:00Z"), effectiveTo: null,
  } as any;
  const service = new FacilityGeofenceService({
    listActiveBoundaries: async () => [boundary],
    createActivityEvaluation: async (input: any) => input,
  } as any, undefined, () => evaluatedAt);
  const result = await service.evaluateLocation({
    locationId: "facility-1",
    purpose: "submission",
    observation: { latitude: 30.1, longitude: -97.7, accuracyMeters: 5, observedAt: "2026-08-07T17:59:59.000Z" },
  });
  const prepared = service.prepareActivityEvaluation({
    result, purpose: "submission", workflowReference: "submission-1",
    idempotencyKey: "geofence:submission-1:submission", evidenceComplete: true,
  });
  assert.equal(result.state, "INSIDE_APPROVED_BOUNDARY");
  assert.equal(prepared.evidence?.boundaryVersionId, "boundary-v3");
  assert.equal(prepared.evidence?.boundaryVersion, 3);
  assert.equal(prepared.evidence?.evaluatedAt.toISOString(), evaluatedAt.toISOString());
  assert.equal(prepared.evidence?.observedAt?.toISOString(), "2026-08-07T17:59:59.000Z");
});

test("Owner projection covers green, yellow, every neutral state, historical evidence, and neutral red", () => {
  assert.equal(projectOwnerGeofenceContext(evaluation("INSIDE_APPROVED_BOUNDARY")).presentationState, "INSIDE_DELIVERY_BOUNDARY");
  const yellow = projectOwnerGeofenceContext(evaluation("OUTSIDE_BOUNDARY_WITHIN_EXCEPTION_ZONE", undefined, {
    exceptionAcknowledgementCode: "FACILITY_PERSONNEL_DIRECTED",
    driverNote: "Directed to the marked lane",
  }));
  assert.equal(yellow.presentationState, "JUST_OUTSIDE_DELIVERY_BOUNDARY");
  assert.equal(yellow.acknowledgementCode, "FACILITY_PERSONNEL_DIRECTED");
  assert.equal(yellow.driverNote, "Directed to the marked lane");
  assert.equal(projectOwnerGeofenceContext(evaluation("LOCATION_ACCURACY_INSUFFICIENT", "LOCATION_UNCERTAINTY_OVERLAPS_BOUNDARY")).presentationState, "LOCATION_UNCERTAIN");
  assert.equal(projectOwnerGeofenceContext(evaluation("LOCATION_UNAVAILABLE")).presentationState, "LOCATION_UNVERIFIED");
  assert.equal(projectOwnerGeofenceContext(evaluation("GEOMETRY_INVALID")).presentationState, "LOCATION_UNVERIFIED");
  assert.equal(projectOwnerGeofenceContext(evaluation("GEOMETRY_UNAVAILABLE", "NO_ACTIVE_PRIMARY_BOUNDARY")).presentationState, "BOUNDARY_NOT_CONFIGURED");
  assert.equal(projectOwnerGeofenceContext(undefined).presentationState, "NOT_RECORDED");
  assert.equal(projectOwnerGeofenceContext(evaluation("OUTSIDE_EXCEPTION_ZONE")).presentationState, "LOCATION_UNVERIFIED");
});

test("Owner context is privacy-safe and activity projection removes precise coordinates and storage paths", () => {
  const context = projectOwnerGeofenceContext(evaluation("INSIDE_APPROVED_BOUNDARY"));
  const serialized = JSON.stringify(context);
  for (const forbidden of ["observationLatitude", "observationLongitude", "accuracyMeters", "outsideDistanceMeters", "signedDistanceMeters", "geometry", "reasonCode"]) {
    assert.doesNotMatch(serialized, new RegExp(forbidden));
  }
  const activity = stripPrivateOwnerActivityEvidence({ id: "activity-1", latitude: "30.1", longitude: "-97.7", photoUrls: ["private/key"], status: "pending" });
  assert.deepEqual(activity, { id: "activity-1", status: "pending" });
});

test("evidence capture follows the existing advisory capability while routing remains governed by enforcement", () => {
  assert.equal(shouldCaptureSubmissionGeofenceEvidence({ advisoryEnabled: true, enforcementEnabled: false }), true);
  assert.equal(shouldCaptureSubmissionGeofenceEvidence({ advisoryEnabled: false, enforcementEnabled: true }), true);
  assert.equal(shouldCaptureSubmissionGeofenceEvidence({ advisoryEnabled: false, enforcementEnabled: false }), false);

  const redDecision = resolveGeofenceSubmissionDecision({ result: {
    locationId: "facility-1", boundaryVersionId: "boundary-v3", boundaryVersion: 3,
    state: "OUTSIDE_EXCEPTION_ZONE", evaluatedAt: evaluatedAt.toISOString(), observationTimestamp: evaluatedAt.toISOString(),
    advisory: false, reasonCode: "OUTSIDE_EXCEPTION_ZONE", canSubmitException: false,
    signedDistanceMeters: 2000, outsideDistanceMeters: 2000, accuracyMeters: 5,
    observationLatitude: 30.2, observationLongitude: -97.7, exceptionDistanceMeters: 1609.344,
  }, hasRequiredEvidence: true });
  assert.deepEqual(resolveSubmissionGeofenceRouting(redDecision, false), { recover: false, yellowOwnerReview: false, redPlatformQuarantine: false });
  assert.deepEqual(resolveSubmissionGeofenceRouting(redDecision, true), { recover: false, yellowOwnerReview: false, redPlatformQuarantine: true });
});

test("submission retry and atomic lifecycle are enforced before duplicate creation", async () => {
  const [storage, routes, client] = await Promise.all([
    readFile(new URL("../server/storage.ts", import.meta.url), "utf8"),
    readFile(new URL("../server/routes.ts", import.meta.url), "utf8"),
    readFile(new URL("../client/src/components/WashoutForm.tsx", import.meta.url), "utf8"),
  ]);
  const transaction = storage.slice(storage.indexOf("async createWashoutActivityWithPhotos("), storage.indexOf("async verifyWashoutActivity("));
  assert.match(transaction, /pg_advisory_xact_lock/);
  assert.match(transaction, /activityGeofenceEvaluations\.idempotencyKey/);
  assert.match(transaction, /reused: true/);
  assert.match(transaction, /tx\.insert\(washoutActivities\)/);
  assert.match(transaction, /tx\.insert\(washoutPhotos\)/);
  assert.match(transaction, /tx\.insert\(activityGeofenceEvaluations\)/);
  assert.ok(routes.indexOf("At least one photo is required") < routes.indexOf("createWashoutActivityWithPhotos("));
  assert.match(routes, /geofenceEvidenceCaptureEnabled/);
  assert.match(routes, /resolveSubmissionGeofenceRouting\(geofenceDecision, geofenceEnforcementEnabled\)/);
  assert.match(client, /geofenceEvidenceCaptureEnabled \? await gpsAcquirer\.current\.acquire\(\{ fresh: true \}\)/);
  assert.match(client, /geofenceEvidence: geofenceEvidenceCaptureEnabled \?/);
});

test("Owner presentation is bilingual, icon-plus-text, accessible, and responsive without color-only meaning", async () => {
  const states = [
    ["INSIDE_DELIVERY_BOUNDARY", "Inside delivery boundary", "Dentro del límite de entrega"],
    ["JUST_OUTSIDE_DELIVERY_BOUNDARY", "Just outside delivery boundary", "Justo fuera del límite de entrega"],
    ["LOCATION_UNCERTAIN", "Close to boundary; location uncertain", "Cerca del límite; ubicación incierta"],
    ["LOCATION_UNVERIFIED", "Location could not be verified", "No se pudo verificar la ubicación"],
    ["BOUNDARY_NOT_CONFIGURED", "Boundary was not configured", "El límite no estaba configurado"],
    ["NOT_RECORDED", "Location verification not recorded", "Verificación de ubicación no registrada"],
  ] as const;
  for (const [state, english, spanish] of states) {
    const presentation = getOwnerGeofencePresentation(state);
    assert.equal(translate(presentation.labelKey, "en"), english);
    assert.equal(translate(presentation.labelKey, "es"), spanish);
    assert.notEqual(translate(presentation.guidanceKey, "en"), presentation.guidanceKey);
    assert.notEqual(translate(presentation.guidanceKey, "es"), presentation.guidanceKey);
  }
  const page = await readFile(new URL("../client/src/pages/owner/dashboard.tsx", import.meta.url), "utf8");
  assert.match(page, /role="status"/);
  assert.match(page, /aria-label=\{t\(presentation\.labelKey\)\}/);
  assert.match(page, /<Icon .*aria-hidden="true"/);
  assert.match(page, /data-geofence-tone=\{presentation\.tone\}/);
  assert.doesNotMatch(page, /text-gps-coordinates/);
});

test("new capture and Owner projection modules have no financial, reward, competition, or notification side effects", async () => {
  const sources = (await Promise.all([
    readFile(new URL("../server/geofenceSubmissionCapture.ts", import.meta.url), "utf8"),
    readFile(new URL("../server/ownerGeofenceContext.ts", import.meta.url), "utf8"),
    readFile(new URL("../client/src/lib/ownerGeofencePresentation.ts", import.meta.url), "utf8"),
  ])).join("\n");
  assert.doesNotMatch(sources, /wallet|payment|settlement|stripe|reward|competition|notificationService/i);
});
