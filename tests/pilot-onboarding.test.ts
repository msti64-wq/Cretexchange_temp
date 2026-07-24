import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { translations, translate } from "../client/src/lib/i18n";
import {
  createSubmissionConfirmationRecord,
  resolveDriverAccountReadiness,
  resolveFacilityReadinessChecklist,
  resolveFacilityOperationalReadiness,
  resolveGpsPreflightStatus,
  resolvePhotoUploadRecoveryState,
  resolveSubmittedActivityConfirmation,
  SUBMISSION_CONFIRMATION_TTL_MS,
} from "../client/src/lib/pilotOnboarding";

test("GPS preflight distinguishes denied permission from unavailable location", () => {
  assert.equal(resolveGpsPreflightStatus(new Error("Location access denied by user.")), "permission_denied");
  assert.equal(resolveGpsPreflightStatus(new Error("Location request timed out.")), "unavailable");
  assert.equal(resolveGpsPreflightStatus(null), "required");
});

test("photo upload recovery keeps partial and failed evidence ineligible until every selected file succeeds", () => {
  const partial = resolvePhotoUploadRecoveryState({ successfulCount: 1, failedCount: 1, isProcessing: false });
  assert.deepEqual(partial, {
    state: "partial_failure",
    successfulCount: 1,
    failedCount: 1,
    totalCount: 2,
    canSubmit: false,
  });

  const retryFailed = resolvePhotoUploadRecoveryState({ successfulCount: 1, failedCount: 1, isProcessing: false });
  assert.equal(retryFailed.state, "partial_failure");
  assert.equal(retryFailed.canSubmit, false);

  const retrySucceeded = resolvePhotoUploadRecoveryState({ successfulCount: 2, failedCount: 0, isProcessing: false });
  assert.equal(retrySucceeded.state, "complete");
  assert.equal(retrySucceeded.canSubmit, true);

  const retryStillFailed = resolvePhotoUploadRecoveryState({ successfulCount: 1, failedCount: 1, isProcessing: false });
  assert.equal(retryStillFailed.canSubmit, false);
  assert.equal(resolvePhotoUploadRecoveryState({ successfulCount: 1, failedCount: 0, isProcessing: true }).state, "uploading");
  assert.equal(resolvePhotoUploadRecoveryState({ successfulCount: 0, failedCount: 1, isProcessing: false }).state, "failed");
});

test("driver account readiness identifies the next required pilot onboarding step without financial prerequisites", () => {
  const incompleteProfile = resolveDriverAccountReadiness({
    user: { firstName: "Ava", lastName: "Driver", roleData: { employerName: "Crete Co", truckNumber: "12" } },
    termsAccepted: false,
  });
  assert.deepEqual(incompleteProfile, {
    profileComplete: false,
    termsAccepted: false,
    ready: false,
    nextStep: "complete_profile",
  });

  const missingTerms = resolveDriverAccountReadiness({
    user: {
      firstName: "Ava", lastName: "Driver", phone: "555-0100", street: "1 Main", city: "Austin", state: "TX", zip: "78701",
      roleData: { employerName: "Crete Co", truckNumber: "12" },
    },
    termsAccepted: false,
  });
  assert.equal(missingTerms.nextStep, "accept_terms");
  assert.equal(missingTerms.ready, false);

  const ready = resolveDriverAccountReadiness({
    user: {
      firstName: "Ava", lastName: "Driver", phone: "555-0100", street: "1 Main", city: "Austin", state: "TX", zip: "78701",
      roleData: { employerName: "Crete Co", truckNumber: "12" },
    },
    termsAccepted: true,
  });
  assert.deepEqual(ready, { profileComplete: true, termsAccepted: true, ready: true, nextStep: null });
  assert.doesNotMatch(JSON.stringify(ready), /stripe|wallet|payment|settlement/i);

  for (const missingName of ["firstName", "lastName"] as const) {
    const user = {
      firstName: "Ava", lastName: "Driver", phone: "555-0100", street: "1 Main", city: "Austin", state: "TX", zip: "78701",
      roleData: { employerName: "Crete Co", truckNumber: "12" },
    };
    user[missingName] = "";
    const incomplete = resolveDriverAccountReadiness({ user, termsAccepted: true });
    assert.equal(incomplete.profileComplete, false);
    assert.equal(incomplete.ready, false);
    assert.equal(incomplete.nextStep, "complete_profile");
  }
});

test("submission confirmation requires a fresh server-confirmed pending activity in the Driver activity rows", () => {
  const now = 1_700_000_000_000;
  const pendingActivity = { washout_activities: { id: "activity-pending", status: "pending" } };
  const verifiedActivity = { washout_activities: { id: "activity-verified", status: "verified" } };
  const record = createSubmissionConfirmationRecord("activity-pending", now);

  assert.ok(record);
  assert.equal(resolveSubmittedActivityConfirmation({
    referencedActivityId: "activity-pending",
    record,
    activities: [pendingActivity, verifiedActivity],
    now: now + 1,
  }), pendingActivity);
  assert.equal(resolveSubmittedActivityConfirmation({
    referencedActivityId: "activity-verified",
    record,
    activities: [pendingActivity, verifiedActivity],
    now: now + 1,
  }), null);
  assert.equal(resolveSubmittedActivityConfirmation({
    referencedActivityId: "missing-activity",
    record: createSubmissionConfirmationRecord("missing-activity", now),
    activities: [pendingActivity],
    now: now + 1,
  }), null);
  assert.equal(resolveSubmittedActivityConfirmation({
    referencedActivityId: null,
    record,
    activities: [pendingActivity],
    now: now + 1,
  }), null);
});

test("submission confirmation rejects stale, noncanonical, and manually mismatched references", () => {
  const now = 1_700_000_000_000;
  const approvedAlias = { id: "activity-alias", status: "approved" };
  const pendingActivity = { id: "activity-pending", status: "pending" };

  assert.equal(createSubmissionConfirmationRecord("", now), null);
  assert.equal(resolveSubmittedActivityConfirmation({
    referencedActivityId: "activity-alias",
    record: createSubmissionConfirmationRecord("activity-alias", now),
    activities: [approvedAlias],
    now,
  }), null);
  assert.equal(resolveSubmittedActivityConfirmation({
    referencedActivityId: "activity-pending",
    record: createSubmissionConfirmationRecord("activity-pending", now - SUBMISSION_CONFIRMATION_TTL_MS - 1),
    activities: [pendingActivity],
    now,
  }), null);
  assert.equal(resolveSubmittedActivityConfirmation({
    referencedActivityId: "activity-pending",
    record: createSubmissionConfirmationRecord("another-activity", now),
    activities: [pendingActivity],
    now,
  }), null);
});

test("facility readiness contains only operational requirements", () => {
  const readiness = resolveFacilityOperationalReadiness({
    owner: { isApproved: true, profileCompleted: true, companyName: "North Yard", businessLicense: "BL-1", taxId: "12" },
    user: { firstName: "Ana", lastName: "Lopez", email: "ana@example.com", phone: "555", street: "1 Main", city: "Austin", state: "TX", zip: "78701" },
    locations: [{ isActive: true, isVisible: true, operatingHours: "7am–5pm" }],
  });

  assert.deepEqual(readiness, {
    accountExists: true,
    profileComplete: true,
    approved: true,
    hasLocation: true,
    hasActiveLocation: true,
    hasVisibleLocation: true,
    hasOperatingInfo: true,
    hasDriverAvailableLocation: true,
    hasDriverAvailableLocationWithOperatingInfo: true,
    marketplaceReady: true,
  });
  assert.doesNotMatch(JSON.stringify(readiness), /stripe|wallet|payment|settlement/i);
});

test("facility checklist prioritizes the first blocking onboarding action", () => {
  const profileIncomplete = resolveFacilityReadinessChecklist({
    owner: { isApproved: false, profileCompleted: false, companyName: "", businessLicense: "", taxId: "" },
    user: { firstName: "Ana", lastName: "Lopez" },
  });
  assert.equal(profileIncomplete.nextStep, "profile");
  assert.equal(profileIncomplete.marketplaceReady, false);

  const approvalPending = resolveFacilityReadinessChecklist({
    owner: { isApproved: false, profileCompleted: true, companyName: "North Yard", businessLicense: "BL-1", taxId: "12" },
    user: { firstName: "Ana", lastName: "Lopez", email: "ana@example.com", phone: "555", street: "1 Main", city: "Austin", state: "TX", zip: "78701" },
  });
  assert.equal(approvalPending.nextStep, "approval");

  const missingLocation = resolveFacilityReadinessChecklist({
    owner: { isApproved: true, profileCompleted: true, companyName: "North Yard", businessLicense: "BL-1", taxId: "12" },
    user: { firstName: "Ana", lastName: "Lopez", email: "ana@example.com", phone: "555", street: "1 Main", city: "Austin", state: "TX", zip: "78701" },
  });
  assert.equal(missingLocation.nextStep, "location");
});

test("facility checklist requires a single active, visible location with operating hours before marketplace readiness", () => {
  const input = {
    owner: { isApproved: true, profileCompleted: true, companyName: "North Yard", businessLicense: "BL-1", taxId: "12" },
    user: { firstName: "Ana", lastName: "Lopez", email: "ana@example.com", phone: "555", street: "1 Main", city: "Austin", state: "TX", zip: "78701" },
  };
  const splitAvailability = resolveFacilityReadinessChecklist({
    ...input,
    locations: [
      { isActive: true, isVisible: false, operatingHours: "7am–5pm" },
      { isActive: false, isVisible: true, operatingHours: "7am–5pm" },
    ],
  });
  assert.equal(splitAvailability.nextStep, "driver_availability");
  assert.equal(splitAvailability.marketplaceReady, false);

  const ready = resolveFacilityReadinessChecklist({
    ...input,
    locations: [{ isActive: true, isVisible: true, operatingHours: "7am–5pm" }],
  });
  assert.equal(ready.marketplaceReady, true);
  assert.equal(ready.nextStep, null);
  assert.ok(ready.steps.every((step) => step.complete));
});

test("pilot onboarding copy exists in English and Spanish without financial promises", () => {
  const keys = [
    "pilot.gps.required",
    "pilot.gps.permissionDenied",
    "pilot.gps.retry",
    "pilot.gps.retrying",
    "pilot.upload.failed",
    "pilot.upload.progressUploading",
    "pilot.upload.progressUploaded",
    "pilot.upload.complete",
    "pilot.upload.partial",
    "pilot.upload.incomplete",
    "pilot.upload.incompleteHelp",
    "pilot.submission.pendingReview",
    "pilot.facility.approvalPending",
    "pilot.facility.createFirstLocation",
    "pilot.facility.marketplaceReady",
    "pilot.facility.marketplaceActionNeeded",
    "pilot.facility.nextStep.profile",
    "pilot.facility.nextStep.approval",
    "pilot.facility.nextStep.location",
    "pilot.facility.nextStep.driver_availability",
    "pilot.facility.nextStep.operating_hours",
    "pilot.facility.readyForDrivers",
    "driver.dashboard.optionalFinancialStatusUnavailable",
  ];

  for (const language of ["en", "es"] as const) {
    for (const key of keys) {
      const value = translate(key, language);
      assert.notEqual(value, key);
      assert.ok(value.trim().length > 0);
    }
  }

  const copy = keys.flatMap((key) => [translations.en[key], translations.es[key]]).join(" ");
  assert.doesNotMatch(copy, /paid|settled|payment|stripe|wallet|pagad|liquidad|pago|billetera/i);
});

test("first-activity views provide activity-bound confirmation and GPS retry recovery", () => {
  const formSource = readFileSync(new URL("../client/src/components/WashoutForm.tsx", import.meta.url), "utf8");
  const activitySource = readFileSync(new URL("../client/src/pages/driver/activity.tsx", import.meta.url), "utf8");
  const checkInSource = readFileSync(new URL("../client/src/pages/driver/check-in.tsx", import.meta.url), "utf8");
  const profileSource = readFileSync(new URL("../client/src/pages/owner/profile.tsx", import.meta.url), "utf8");
  const driverProfileSource = readFileSync(new URL("../client/src/pages/driver/profile.tsx", import.meta.url), "utf8");

  assert.match(formSource, /pilot\.gps\.required/);
  assert.match(formSource, /useEffect\(\(\) => \{\s*void ensureGpsLocation\(\);/);
  assert.match(formSource, /pilot\.gps\.retry/);
  assert.match(formSource, /"retrying"/);
  assert.match(formSource, /gps-preflight-retrying[\s\S]*?disabled/);
  assert.match(formSource, /pilot\.upload\.failed/);
  assert.match(formSource, /pilot\.upload\.progressUploading/);
  assert.match(formSource, /pilot\.upload\.progressUploaded/);
  assert.match(formSource, /failedPhotoFiles/);
  assert.match(formSource, /uploadRecovery\.state === "partial_failure"/);
  assert.match(formSource, /failedPhotoFiles\.length > 0 \|\| !uploadRecovery\.canSubmit/);
  assert.match(formSource, /uploadPhotos\(filesToRetry, browserLocation, \{ isRetry: true \}\)/);
  assert.match(formSource, /uploadInFlightRef/);
  assert.doesNotMatch(formSource, /may need manual review/);
  assert.doesNotMatch(formSource, /CORS|signed URL|object storage|R2/);
  assert.match(checkInSource, /submittedActivityId/);
  assert.match(checkInSource, /sessionStorage\.setItem/);
  assert.match(activitySource, /resolveSubmittedActivityConfirmation/);
  assert.match(activitySource, /sessionStorage\.removeItem/);
  assert.match(activitySource, /pilot\.submission\.pendingReview/);
  assert.doesNotMatch(activitySource.match(/resolveSubmittedActivityConfirmation[\s\S]*?function getActivityStatus/)?.[0] || "", /approved|completed|submitted/);
  assert.match(profileSource, /pilot\.facility\.nextStep/);
  assert.match(profileSource, /pilot\.facility\.createFirstLocation/);
  assert.match(profileSource, /resolveFacilityReadinessChecklist/);
  assert.match(profileSource, /facility-readiness-next-step/);
  assert.match(profileSource, /button-configure-facility-location/);
  assert.match(profileSource, /locationAccessState\.canManageLocations/);
  assert.match(profileSource, /separateAccountSetup/);
  assert.doesNotMatch(profileSource, /payment method.*first-location|first-location.*payment method/i);

  const dashboardSource = readFileSync(new URL("../client/src/pages/driver/dashboard.tsx", import.meta.url), "utf8");
  assert.match(dashboardSource, /resolveDriverAccountReadiness/);
  assert.match(dashboardSource, /driver-account-readiness-next-step/);
  assert.match(dashboardSource, /driver\.dashboard\.completeProfileNext/);
  assert.match(dashboardSource, /driver\.dashboard\.acceptTermsNext/);
  const operationalReadinessStart = dashboardSource.indexOf('data-testid="driver-operational-readiness"');
  const optionalFinancialStatusStart = dashboardSource.indexOf('data-testid="driver-optional-financial-status"');
  assert.ok(operationalReadinessStart >= 0);
  assert.ok(optionalFinancialStatusStart > operationalReadinessStart);
  const operationalReadinessSource = dashboardSource.slice(operationalReadinessStart, optionalFinancialStatusStart);
  assert.match(operationalReadinessSource, /authUserLoading \|\| termsStatusLoading/);
  assert.doesNotMatch(operationalReadinessSource, /stripeAccountStatusLoading|debitCardStatusLoading|walletBalanceError/);
  assert.match(dashboardSource.slice(optionalFinancialStatusStart), /stripeAccountStatusLoading/);
  assert.match(dashboardSource.slice(optionalFinancialStatusStart), /debitCardStatusLoading/);
  assert.match(driverProfileSource, /resolveDriverAccountReadiness/);
  assert.match(driverProfileSource, /driverAccountReadiness\.ready/);
  assert.match(driverProfileSource, /termsStatus\?\.hasAgreed \|\| user\?\.roleData\?\.hasAgreedToTerms/);
  assert.doesNotMatch(driverProfileSource, /const isProfileComplete|const hasEssentialInfo/);
});

test("assisted-pilot runbook covers required response boundaries", () => {
  const runbook = readFileSync(new URL("../docs/project/pilot/assisted-pilot-operations-runbook.md", import.meta.url), "utf8");
  for (const scenario of [
    "Facility approval pending",
    "Facility approval rejected or incomplete",
    "Facility unable to create first location",
    "Address verification failure",
    "Driver GPS denied",
    "Driver location unavailable",
    "Photo upload failure",
    "Submission failure",
    "Duplicate or suspected duplicate activity",
    "Activity pending too long",
    "Activity rejected",
    "Driver does not understand status",
    "Facility does not see a submission",
    "Verification does not appear on Driver history",
    "Language or translation problem",
    "Urgent pilot support request",
  ]) {
    assert.match(runbook, new RegExp(scenario));
  }
  assert.match(runbook, /directly edit production database records/i);
  assert.match(runbook, /live Stripe account creation/i);
  assert.match(runbook, /mark activity verified without adequate evidence and authority/i);
  assert.match(runbook, /Escalation criteria/i);
  assert.match(runbook, /saved payment method is not an operational setup prerequisite/i);
  assert.match(runbook, /approved, complete Facility still cannot/i);
});
