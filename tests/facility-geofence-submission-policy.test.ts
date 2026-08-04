import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolveGeofenceSubmissionDecision } from "../server/geofenceSubmissionPolicy";
import type { FacilityGeofenceResult, FacilityGeofenceState } from "../server/facilityGeofenceService";
import { notificationTemplateDefinitions, sanitizeNotificationMetadata } from "../shared/notifications";

function result(state: FacilityGeofenceState, reasonCode = state): FacilityGeofenceResult {
  return {
    locationId: "facility-1", boundaryVersionId: state === "GEOMETRY_UNAVAILABLE" ? null : "boundary-1", boundaryVersion: state === "GEOMETRY_UNAVAILABLE" ? null : 3,
    state, evaluatedAt: new Date().toISOString(), observationTimestamp: new Date().toISOString(), advisory: false,
    reasonCode, canSubmitException: state === "OUTSIDE_BOUNDARY_WITHIN_EXCEPTION_ZONE", signedDistanceMeters: 10,
    outsideDistanceMeters: 10, accuracyMeters: 5, observationLatitude: 30, observationLongitude: -97, exceptionDistanceMeters: 1609.344,
  };
}

test("submission policy preserves unconfigured legacy Facilities and permits green", () => {
  assert.equal(resolveGeofenceSubmissionDecision({ result: result("GEOMETRY_UNAVAILABLE", "NO_ACTIVE_PRIMARY_BOUNDARY"), hasRequiredEvidence: true }).action, "legacy");
  assert.equal(resolveGeofenceSubmissionDecision({ result: result("INSIDE_APPROVED_BOUNDARY"), hasRequiredEvidence: true }).action, "continue");
});

test("yellow submission requires complete evidence, acknowledgement, and governed reason", () => {
  const yellow = result("OUTSIDE_BOUNDARY_WITHIN_EXCEPTION_ZONE");
  assert.deepEqual(resolveGeofenceSubmissionDecision({ result: yellow, hasRequiredEvidence: false }), { action: "recover", code: "GEOFENCE_EXCEPTION_EVIDENCE_REQUIRED", reasonCode: "REQUIRED_EVIDENCE_MISSING" });
  assert.equal(resolveGeofenceSubmissionDecision({ result: yellow, hasRequiredEvidence: true }).action, "recover");
  assert.equal(resolveGeofenceSubmissionDecision({ result: yellow, hasRequiredEvidence: true, acknowledgement: { confirmed: true, reasonCode: "FACILITY_PERSONNEL_DIRECTED" } }).action, "exception_review");
});

test("red quarantines while neutral confidence states recover without activity", () => {
  assert.equal(resolveGeofenceSubmissionDecision({ result: result("OUTSIDE_EXCEPTION_ZONE"), hasRequiredEvidence: true }).action, "quarantine");
  for (const state of ["LOCATION_UNAVAILABLE", "LOCATION_ACCURACY_INSUFFICIENT", "GEOMETRY_INVALID"] as const) {
    assert.equal(resolveGeofenceSubmissionDecision({ result: result(state), hasRequiredEvidence: true }).action, "recover");
  }
});

test("activity, private evidence, and geofence evaluation share one transaction", () => {
  const storage = readFileSync(new URL("../server/storage.ts", import.meta.url), "utf8");
  const transaction = storage.slice(storage.indexOf("async createWashoutActivityWithPhotos("), storage.indexOf("async verifyWashoutActivity("));
  assert.match(transaction, /db\.transaction/);
  assert.match(transaction, /tx\.insert\(washoutActivities\)/);
  assert.match(transaction, /tx\.insert\(washoutPhotos\)/);
  assert.match(transaction, /tx\.insert\(activityGeofenceEvaluations\)/);
  assert.match(transaction, /activityId: newActivity\.id/);
});

test("geofence notification templates are role-scoped and metadata excludes precise location", () => {
  assert.deepEqual(notificationTemplateDefinitions.owner_geofence_exception_review.roles, ["owner"]);
  assert.deepEqual(notificationTemplateDefinitions.admin_geofence_exception_attention.roles, ["admin", "super_admin"]);
  assert.deepEqual(notificationTemplateDefinitions.geofence_exception_submitted.roles, ["driver"]);
  assert.deepEqual(sanitizeNotificationMetadata({ facilityName: "Facility", status: "pending", latitude: 30, longitude: -97, gpsAccuracy: 4 }), { facilityName: "Facility", status: "pending" });
});
