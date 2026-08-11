import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import type { ActivityGeofenceEvaluation } from "../shared/schema";
import {
  notificationTemplateDefinitions,
  sanitizeNotificationMetadata,
  type NotificationRole,
} from "../shared/notifications";
import { translate } from "../client/src/lib/i18n";
import { localizeCenterNotification, type CenterNotification } from "../client/src/lib/notificationLocalization";
import {
  classifyCompletedSubmissionGeofenceNotification,
  deliverCompletedSubmissionGeofenceNotifications,
  GEOFENCE_GRAY_NOTIFICATION_CONDITIONS,
} from "../server/geofenceCompletedSubmissionNotifications";
import type { CreateStructuredNotification } from "../server/notificationService";

type Captured = CreateStructuredNotification | (Omit<CreateStructuredNotification, "userId" | "recipientRole"> & { recipientRole: NotificationRole });
const ACTIVITY_ID = "323528bb-bc19-4e88-9f66-ce383ab591cf";
const FACILITY_ID = "1367c68a-e12b-46a4-a417-6f21febe5640";
const ADMIN_EVIDENCE_LINK = `/admin/photo-review?view=all&activityId=${ACTIVITY_ID}#activity-${ACTIVITY_ID}`;

function evaluation(
  resultState: string,
  reasonCode = resultState,
  overrides: Partial<ActivityGeofenceEvaluation> = {},
): ActivityGeofenceEvaluation {
  return {
    id: "evaluation-1",
    activityId: ACTIVITY_ID,
    workflowReference: null,
    locationId: FACILITY_ID,
    boundaryVersionId: "boundary-1",
    boundaryVersion: 3,
    evaluationPurpose: "submission",
    resultState,
    reasonCode,
    observationLatitude: "30.00000000",
    observationLongitude: "-97.00000000",
    accuracyMeters: "12.000",
    observedAt: new Date("2026-08-08T20:00:00Z"),
    evaluatedAt: new Date("2026-08-08T20:00:01Z"),
    signedDistanceMeters: "1.000",
    outsideDistanceMeters: "1.000",
    exceptionDistanceMeters: "1609.344",
    exceptionAcknowledgementCode: null,
    driverNote: null,
    evidenceComplete: true,
    idempotencyKey: "geofence:submission-1:submission",
    createdAt: new Date("2026-08-08T20:00:01Z"),
    ...overrides,
  };
}

function harness(currentEvaluation: ActivityGeofenceEvaluation | null, enabled = true) {
  const captured: Captured[] = [];
  const failures: unknown[] = [];
  const input = {
    enabled,
    activity: { id: ACTIVITY_ID, status: "pending", driverUserId: "driver-user-1" },
    facility: { id: FACILITY_ID, name: "Controlled Facility", resolveOwnerUserId: async () => "owner-user-1" },
    retainedPhotoCount: 1,
    evaluation: currentEvaluation,
    emitUser: async (notification: CreateStructuredNotification) => { captured.push(notification); },
    emitRole: async (notification: Omit<CreateStructuredNotification, "userId" | "recipientRole"> & { recipientRole: NotificationRole }) => { captured.push(notification); },
    recordFailure: (evidence: unknown) => failures.push(evidence),
  };
  return { input, captured, failures };
}

test("completed-submission classification retains seven states and derives six Gray conditions from state plus reason", () => {
  assert.deepEqual(classifyCompletedSubmissionGeofenceNotification(evaluation("OUTSIDE_BOUNDARY_WITHIN_EXCEPTION_ZONE")), { kind: "yellow" });
  const cases = [
    ["LOCATION_UNAVAILABLE", "LOCATION_COORDINATES_UNAVAILABLE", "gps_unavailable"],
    ["LOCATION_ACCURACY_INSUFFICIENT", "LOCATION_ACCURACY_EXCEEDS_LIMIT", "gps_accuracy_insufficient"],
    ["LOCATION_ACCURACY_INSUFFICIENT", "LOCATION_UNCERTAINTY_OVERLAPS_BOUNDARY", "near_boundary_uncertainty"],
    ["LOCATION_ACCURACY_INSUFFICIENT", "LOCATION_UNCERTAINTY_OVERLAPS_EXCEPTION_THRESHOLD", "near_advisory_limit_uncertainty"],
    ["GEOMETRY_UNAVAILABLE", "NO_ACTIVE_PRIMARY_BOUNDARY", "boundary_unavailable"],
    ["GEOMETRY_INVALID", "GEOMETRY_CHECKSUM_MISMATCH", "boundary_invalid"],
  ] as const;
  assert.equal(cases.length, GEOFENCE_GRAY_NOTIFICATION_CONDITIONS.length);
  for (const [state, reason, condition] of cases) {
    assert.deepEqual(classifyCompletedSubmissionGeofenceNotification(evaluation(state, reason)), { kind: "gray", condition });
  }
  assert.equal(classifyCompletedSubmissionGeofenceNotification(evaluation("INSIDE_APPROVED_BOUNDARY")), null);
  assert.equal(classifyCompletedSubmissionGeofenceNotification(evaluation("OUTSIDE_EXCEPTION_ZONE")), null);
});

test("passive, incomplete, disabled, green, and red inputs create no governed geofence notification", async () => {
  const disabled = harness(evaluation("OUTSIDE_BOUNDARY_WITHIN_EXCEPTION_ZONE"), false);
  assert.equal((await deliverCompletedSubmissionGeofenceNotifications(disabled.input)).handled, false);
  const incomplete = harness(evaluation("LOCATION_UNAVAILABLE"));
  incomplete.input.retainedPhotoCount = 0;
  assert.equal((await deliverCompletedSubmissionGeofenceNotifications(incomplete.input)).handled, false);
  const passive = harness(evaluation("LOCATION_UNAVAILABLE", "LOCATION_COORDINATES_UNAVAILABLE", { evaluationPurpose: "selection_advisory" }));
  assert.equal((await deliverCompletedSubmissionGeofenceNotifications(passive.input)).handled, false);
  for (const state of ["INSIDE_APPROVED_BOUNDARY", "OUTSIDE_EXCEPTION_ZONE"]) {
    const ignored = harness(evaluation(state));
    assert.equal((await deliverCompletedSubmissionGeofenceNotifications(ignored.input)).handled, false);
    assert.equal(ignored.captured.length, 0);
  }
});

test("yellow routes once to Driver, Owner, Admin, and Super Admin with safe acknowledgement context", async () => {
  const notification = harness(evaluation("OUTSIDE_BOUNDARY_WITHIN_EXCEPTION_ZONE", undefined, {
    exceptionAcknowledgementCode: "BOUNDARY_APPEARS_INCORRECT",
    driverNote: "Call me at 512-555-1212; photo is s3://private/path and fee is $25",
  }));
  const result = await deliverCompletedSubmissionGeofenceNotifications(notification.input);
  assert.deepEqual(result, { handled: true, classification: { kind: "yellow" }, attempted: 4, failed: 0 });
  assert.deepEqual(notification.captured.map((item) => item.recipientRole).sort(), ["admin", "driver", "owner", "super_admin"]);
  assert.equal(new Set(notification.captured.map((item) => item.idempotencyKey)).size, 4);
  for (const item of notification.captured) {
    assert.equal(item.sourceEntityId, ACTIVITY_ID);
    assert.doesNotMatch(JSON.stringify(item), /512-555-1212|s3:\/\/private|\$25/);
    const safe = sanitizeNotificationMetadata(item.metadata);
    assert.equal(safe.boundaryCorrection, "true");
    assert.equal(safe.acknowledgementReasonCode, "BOUNDARY_APPEARS_INCORRECT");
  }
  assert.match(notification.captured.find((item) => item.recipientRole === "owner")!.message, /boundary-correction request/i);
  assert.doesNotMatch(notification.captured.map((item) => item.message).join(" "), /fraud|misconduct|accus/i);
});

test("all six Gray conditions route neutral state-specific notices to governed recipients", async () => {
  const cases = [
    evaluation("LOCATION_UNAVAILABLE", "LOCATION_COORDINATES_UNAVAILABLE"),
    evaluation("LOCATION_ACCURACY_INSUFFICIENT", "LOCATION_ACCURACY_EXCEEDS_LIMIT"),
    evaluation("LOCATION_ACCURACY_INSUFFICIENT", "LOCATION_UNCERTAINTY_OVERLAPS_BOUNDARY"),
    evaluation("LOCATION_ACCURACY_INSUFFICIENT", "LOCATION_UNCERTAINTY_OVERLAPS_EXCEPTION_THRESHOLD"),
    evaluation("GEOMETRY_UNAVAILABLE", "NO_ACTIVE_PRIMARY_BOUNDARY", { boundaryVersionId: null, boundaryVersion: null }),
    evaluation("GEOMETRY_INVALID", "GEOMETRY_CHECKSUM_MISMATCH"),
  ];
  const seenTitles = new Set<string>();
  for (const current of cases) {
    const notification = harness(current);
    const result = await deliverCompletedSubmissionGeofenceNotifications(notification.input);
    assert.equal(result.handled, true);
    assert.equal(result.attempted, 4);
    assert.deepEqual(notification.captured.map((item) => item.recipientRole).sort(), ["admin", "driver", "owner", "super_admin"]);
    assert.equal(notification.captured.find((item) => item.recipientRole === "admin")!.priority, "normal");
    notification.captured.forEach((item) => {
      seenTitles.add(item.title);
      const localizedInput: CenterNotification = {
        id: `${current.resultState}-${item.recipientRole}`,
        title: item.title,
        message: item.message,
        type: item.templateKey,
        category: item.recipientRole === "admin" || item.recipientRole === "super_admin" ? "administrative" : "operational",
        templateKey: item.templateKey,
        isRead: false,
        deepLink: item.deepLink || null,
        priority: item.priority || "normal",
        metadata: sanitizeNotificationMetadata(item.metadata),
        createdAt: null,
      };
      for (const language of ["en", "es"] as const) {
        const localized = localizeCenterNotification(localizedInput, language, (key, values) => translate(key, language, values));
        assert.doesNotMatch(localized.title, /^notification\./);
        assert.doesNotMatch(localized.message, /^notification\./);
        assert.match(localized.message, /Controlled Facility/);
      }
    });
    assert.doesNotMatch(JSON.stringify(notification.captured), /fraud|rejection|misconduct|latitude|longitude|polygon|storage path/i);
  }
  assert.ok(seenTitles.size >= cases.length * 2);
});

test("deterministic keys make replay and duplicate worker execution idempotent", async () => {
  const notification = harness(evaluation("LOCATION_ACCURACY_INSUFFICIENT", "LOCATION_UNCERTAINTY_OVERLAPS_BOUNDARY"));
  await deliverCompletedSubmissionGeofenceNotifications(notification.input);
  const firstKeys = notification.captured.map((item) => item.idempotencyKey);
  notification.captured.length = 0;
  await deliverCompletedSubmissionGeofenceNotifications(notification.input);
  assert.deepEqual(notification.captured.map((item) => item.idempotencyKey), firstKeys);
  assert.equal(new Set(firstKeys).size, firstKeys.length);
});

test("notification delivery failure is isolated after canonical evidence persistence", async () => {
  const notification = harness(evaluation("LOCATION_UNAVAILABLE"));
  notification.input.emitUser = async (item) => {
    if (item.recipientRole === "driver") throw new Error("delivery unavailable");
    notification.captured.push(item);
  };
  const result = await deliverCompletedSubmissionGeofenceNotifications(notification.input);
  assert.equal(result.handled, true);
  assert.equal(result.failed, 1);
  assert.equal(notification.failures.length, 1);
  assert.deepEqual(notification.input.activity, { id: ACTIVITY_ID, status: "pending", driverUserId: "driver-user-1" });
});

test("templates, deep links, metadata, English, and Spanish remain role- and privacy-safe", async () => {
  assert.deepEqual(notificationTemplateDefinitions.geofence_uncertainty_submitted.roles, ["driver"]);
  assert.deepEqual(notificationTemplateDefinitions.owner_geofence_uncertainty_review.roles, ["owner"]);
  assert.deepEqual(notificationTemplateDefinitions.admin_geofence_uncertainty_attention.roles, ["admin", "super_admin"]);
  const notification = harness(evaluation("GEOMETRY_INVALID", "GEOMETRY_CHECKSUM_MISMATCH"));
  await deliverCompletedSubmissionGeofenceNotifications(notification.input);
  const driver = notification.captured[0] as CreateStructuredNotification;
  const centerItem: CenterNotification = {
    id: "notice-1", title: driver.title, message: driver.message, type: driver.templateKey,
    category: "operational", templateKey: driver.templateKey, isRead: false, deepLink: driver.deepLink || null,
    priority: driver.priority || "normal", metadata: sanitizeNotificationMetadata(driver.metadata), createdAt: null,
  };
  const english = localizeCenterNotification(centerItem, "en", (key, values) => translate(key, "en", values));
  const spanish = localizeCenterNotification(centerItem, "es", (key, values) => translate(key, "es", values));
  assert.match(english.title, /boundary needed correction/i);
  assert.match(spanish.title, /límite necesitaba corrección/i);
  assert.equal(driver.deepLink, `/activity?submittedActivityId=${ACTIVITY_ID}`);
  assert.equal(notification.captured.find((item) => item.recipientRole === "owner")!.deepLink, `/dashboard/reviews?facilityId=${FACILITY_ID}&activityId=${ACTIVITY_ID}#activity-${ACTIVITY_ID}`);
  assert.equal(notification.captured.find((item) => item.recipientRole === "admin")!.deepLink, ADMIN_EVIDENCE_LINK);
  assert.equal(notification.captured.find((item) => item.recipientRole === "super_admin")!.deepLink, ADMIN_EVIDENCE_LINK);
});

test("route trigger occurs only after atomic activity, photo, and evaluation persistence and is independent of enforcement", async () => {
  const [routes, workflow] = await Promise.all([
    readFile(new URL("../server/routes.ts", import.meta.url), "utf8"),
    readFile(new URL("../server/geofenceCompletedSubmissionNotifications.ts", import.meta.url), "utf8"),
  ]);
  const route = routes.slice(routes.indexOf("app.post('/api/activities/create-with-photos'"), routes.indexOf("// ===== OLD COMPLEX PHOTO SYSTEM"));
  assert.ok(route.indexOf("createWashoutActivityWithPhotos(") < route.indexOf("deliverCompletedSubmissionGeofenceNotifications({"));
  assert.match(route, /retainedPhotoCount: result\.photos\.length/);
  assert.match(route, /evaluation: result\.geofenceEvaluation/);
  assert.match(route, /enabled: geofenceNotificationsEnabled/);
  assert.doesNotMatch(workflow, /SUBMISSION_ENFORCEMENT|enforcementEnabled|wallet|payment|reward|competition|settlement/i);
  assert.match(route, /if \(platformIntegrityDetected\)/);
});
