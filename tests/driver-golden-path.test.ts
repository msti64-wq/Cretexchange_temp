import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { resolveDriverOperationalReadiness } from "../shared/driverOperationalReadiness";
import { findLikelyDuplicatePhotoMatches } from "../shared/photoFingerprint";
import { evaluatePhotoVerification } from "../shared/photoVerification";
import {
  createSubmissionConfirmationRecord,
  resolveDriverCheckInButtonState,
  resolveGpsPreflightStatus,
  resolvePhotoUploadRecoveryState,
  resolveSubmittedActivityConfirmation,
} from "../client/src/lib/pilotOnboarding";
import { findPhotoUploadCorsIssues } from "../scripts/verify-photo-upload-cors";

const user = {
  id: "driver-user",
  role: "driver",
  firstName: "Ava",
  lastName: "Driver",
  email: "ava@example.com",
  phone: "555-0100",
  street: "1 Main",
  city: "Austin",
  state: "TX",
  zip: "78701",
};
const profile = {
  userId: user.id,
  employerName: "Crete Co",
  truckNumber: "12",
  activeMaterialSlug: "concrete-washout",
};
const material = { slug: "concrete-washout", isActive: true, retiredAt: null };

test("Driver golden path reaches an enabled private-photo submission and server-confirmed pending history", () => {
  const readiness = resolveDriverOperationalReadiness({ user, profile, termsAccepted: true, activeMaterial: material });
  assert.equal(readiness.ready, true, "login, current terms, complete profile, and active material must be ready");

  const gps = evaluatePhotoVerification({ gpsLatitude: 30, gpsLongitude: -97, locationLatitude: 30, locationLongitude: -97 });
  assert.equal(gps.status, "verified", "GPS must resolve at the eligible facility");

  const corsIssues = findPhotoUploadCorsIssues([{
    AllowedOrigins: ["https://cretexchange.app"],
    AllowedMethods: ["GET", "PUT", "HEAD"],
    AllowedHeaders: ["*"],
  }], "https://cretexchange.app");
  assert.deepEqual(corsIssues, [], "the Production app origin must be able to complete the private direct upload");

  const upload = resolvePhotoUploadRecoveryState({ successfulCount: 1, failedCount: 0, isProcessing: false });
  assert.equal(upload.canSubmit, true, "Check-In must enable after the private upload succeeds");
  assert.equal(resolveDriverCheckInButtonState({
    gpsStatus: "ready",
    hasGpsLocation: true,
    successfulPhotoCount: 1,
    failedPhotoCount: 0,
    isProcessingPhotos: false,
    isSubmitting: false,
    hasInvalidPhotoUrls: false,
  }).enabled, true, "the primary Check-In button must be enabled for a ready, eligible, in-range Driver");

  const createdAt = 1_700_000_000_000;
  const confirmation = createSubmissionConfirmationRecord("activity-1", createdAt);
  const pending = { washout_activities: { id: "activity-1", status: "pending" } };
  assert.equal(resolveSubmittedActivityConfirmation({
    referencedActivityId: "activity-1",
    record: confirmation,
    activities: [pending],
    now: createdAt + 1,
  }), pending, "the Driver must see the server-created pending activity in confirmation/history");
});

test("Driver golden path blocks incomplete terms, profile, invalid material, GPS failure, and upload failure", () => {
  const missingTerms = resolveDriverOperationalReadiness({ user, profile, termsAccepted: false, activeMaterial: material });
  assert.equal(missingTerms.ready, false);
  assert.equal(missingTerms.reasons[0]?.code, "current_terms_required");

  const incompleteProfile = resolveDriverOperationalReadiness({ user: { ...user, phone: "" }, profile, termsAccepted: true, activeMaterial: material });
  assert.equal(incompleteProfile.ready, false);
  assert.equal(incompleteProfile.reasons[0]?.code, "driver_profile_incomplete");

  const materialMismatch = resolveDriverOperationalReadiness({ user, profile, termsAccepted: true, activeMaterial: { ...material, slug: "aggregate" } });
  assert.equal(materialMismatch.ready, false);
  assert.equal(materialMismatch.reasons[0]?.code, "active_material_invalid");

  assert.equal(resolveGpsPreflightStatus(new Error("Location access denied by user.")), "permission_denied");
  assert.equal(resolveGpsPreflightStatus(new Error("Location request timed out.")), "timeout");
  assert.equal(resolvePhotoUploadRecoveryState({ successfulCount: 0, failedCount: 1, isProcessing: false }).canSubmit, false);
  for (const blocked of [
    { gpsStatus: "unavailable" as const, hasGpsLocation: false, failedPhotoCount: 0, isProcessingPhotos: false, hasInvalidPhotoUrls: false },
    { gpsStatus: "ready" as const, hasGpsLocation: true, failedPhotoCount: 1, isProcessingPhotos: false, hasInvalidPhotoUrls: false },
    { gpsStatus: "ready" as const, hasGpsLocation: true, failedPhotoCount: 0, isProcessingPhotos: true, hasInvalidPhotoUrls: false },
    { gpsStatus: "ready" as const, hasGpsLocation: true, failedPhotoCount: 0, isProcessingPhotos: false, hasInvalidPhotoUrls: true },
  ]) {
    assert.equal(resolveDriverCheckInButtonState({
      ...blocked,
      successfulPhotoCount: 1,
      isSubmitting: false,
    }).enabled, false);
  }
  assert.notDeepEqual(findPhotoUploadCorsIssues([{
    AllowedOrigins: ["https://cretexchangetemp-production.up.railway.app"],
    AllowedMethods: ["PUT"],
    AllowedHeaders: ["*"],
  }], "https://cretexchange.app"), []);
});

test("Driver golden path rejects inactive or ineligible facility inputs and classifies out-of-range and duplicate evidence", () => {
  const eligibilitySource = readFileSync(new URL("../server/driverLocationEligibility.ts", import.meta.url), "utf8");
  const routeSource = readFileSync(new URL("../server/routes.ts", import.meta.url), "utf8");
  assert.match(eligibilitySource, /material\.isActive === false \|\| material\.retiredAt/);
  assert.match(eligibilitySource, /getActiveLocationsAcceptingMaterial/);
  assert.match(eligibilitySource, /DRIVER_LOCATION_NOT_ELIGIBLE/);
  assert.match(routeSource, /create-with-photos', isAuthenticated, driverOperationalReadinessMiddleware/);
  assert.match(routeSource, /requireDriverLocationEligibility\(req, res, activityResult\.data\.locationId\)/);
  assert.match(routeSource, /Unsupported photo format/);
  assert.match(routeSource, /MAX_PHOTO_UPLOAD_BYTES/);

  const outsideRange = evaluatePhotoVerification({ gpsLatitude: 31, gpsLongitude: -97, locationLatitude: 30, locationLongitude: -97 });
  assert.equal(outsideRange.status, "failed");

  const duplicate = findLikelyDuplicatePhotoMatches("abcdef", [{
    photoId: "prior-photo",
    activityId: "prior-activity",
    driverId: "prior-driver",
    driverName: "Prior Driver",
    locationId: "eligible-location",
    locationName: "Eligible Facility",
    priorUploadedAt: "2026-07-31T00:00:00.000Z",
    imageFingerprint: "abcdef",
  }]);
  assert.equal(duplicate.length, 1, "duplicate evidence must be detected and routed for review rather than silently verified");
});

test("expired sessions and stale confirmations cannot produce a false successful Check-In", () => {
  const routeSource = readFileSync(new URL("../server/routes.ts", import.meta.url), "utf8");
  assert.match(routeSource, /upload-url', isAuthenticated/);
  assert.match(routeSource, /create-with-photos', isAuthenticated/);
  assert.match(routeSource, /Unsupported photo format/);
  assert.match(routeSource, /numericFileSize > MAX_PHOTO_UPLOAD_BYTES/);

  const createdAt = 1_700_000_000_000;
  assert.equal(resolveSubmittedActivityConfirmation({
    referencedActivityId: "activity-1",
    record: createSubmissionConfirmationRecord("activity-1", createdAt),
    activities: [{ id: "activity-1", status: "pending" }],
    now: createdAt + 16 * 60 * 1000,
  }), null);
});

test("golden-path wiring preserves private ACL, atomic persistence, Driver history, and Owner pending visibility", () => {
  const routeSource = readFileSync(new URL("../server/routes.ts", import.meta.url), "utf8");
  const formSource = readFileSync(new URL("../client/src/components/WashoutForm.tsx", import.meta.url), "utf8");
  assert.match(routeSource, /createWashoutActivityWithPhotos/);
  assert.match(routeSource, /visibility: "private"/);
  assert.match(routeSource, /ObjectAccessGroupType\.LOCATION_OWNER/);
  assert.match(formSource, /queryKey: \['\/api\/drivers\/activities'\]/);
  assert.match(formSource, /queryKey: \['\/api\/owners\/activities'\]/);
  assert.match(formSource, /queryKey: \['\/api\/owners\/billing\/pending-summary'\]/);
});
