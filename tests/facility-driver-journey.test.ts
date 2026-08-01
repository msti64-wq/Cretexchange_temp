import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { translate } from "../client/src/lib/i18n";
import {
  calculateFacilityDriverJourney,
  calculateJourneyReport,
  FACILITY_DRIVER_JOURNEY_STAGE_RULES,
  PLATFORM_JOURNEYS_BY_KEY,
  selectFacilityDriverParticipation,
  type FacilityDriverJourneyEvidence,
} from "../server/platformAnalytics";

const completeDriver: FacilityDriverJourneyEvidence = {
  driverId: "driver-1",
  registration: true,
  profileCompletion: true,
  firstLogin: true,
  checkIn: true,
  photoUpload: true,
  verification: true,
  repeatActivity: false,
};

function stage(report: ReturnType<typeof calculateFacilityDriverJourney>, key: string) {
  return report.stages.find((entry) => entry.key === key)!;
}

test("one participating Driver produces Registration = 1", () => {
  const report = calculateFacilityDriverJourney([completeDriver]);
  assert.equal(report.entryCount, 1);
  assert.deepEqual(stage(report, "registration"), {
    key: "registration",
    name: "Registration",
    reachedCount: 1,
    conversionFromPrevious: 1,
    abandonmentFromPrevious: 0,
    optional: false,
    dataStatus: "available",
  });
});

test("the same Driver is counted once across duplicate participation rows", () => {
  const report = calculateFacilityDriverJourney([completeDriver, { ...completeDriver }]);
  assert.equal(report.entryCount, 1);
  assert.equal(stage(report, "registration").reachedCount, 1);
});

test("Facility participation excludes unrelated Drivers and other Facilities", () => {
  const start = new Date("2026-07-01T00:00:00.000Z");
  const end = new Date("2026-07-31T23:59:59.999Z");
  const participation = selectFacilityDriverParticipation([
    { driverId: "driver-a", activityId: "activity-a", locationId: "facility-a", occurredAt: start },
    { driverId: "driver-b", activityId: "activity-b", locationId: "facility-b", occurredAt: start },
    { driverId: "unrelated", activityId: null, locationId: "facility-a", occurredAt: start },
  ], "facility-a", start, end);
  assert.deepEqual(participation.driverIds, ["driver-a"]);
  assert.deepEqual(participation.activityIds, ["activity-a"]);
});

test("Facility participation deduplicates activities and observes inclusive date boundaries", () => {
  const start = new Date("2026-07-01T00:00:00.000Z");
  const end = new Date("2026-07-31T23:59:59.999Z");
  const participation = selectFacilityDriverParticipation([
    { driverId: "driver-a", activityId: "start", locationId: "facility-a", occurredAt: start },
    { driverId: "driver-a", activityId: "start", locationId: "facility-a", occurredAt: start },
    { driverId: "driver-a", activityId: "end", locationId: "facility-a", occurredAt: end },
    { driverId: "driver-a", activityId: "before", locationId: "facility-a", occurredAt: new Date(start.getTime() - 1) },
    { driverId: "driver-a", activityId: "after", locationId: "facility-a", occurredAt: new Date(end.getTime() + 1) },
  ], "facility-a", start, end);
  assert.deepEqual(participation.activityIds, ["start", "end"]);
  assert.deepEqual(participation.submissionsByDriver, [{ driverId: "driver-a", activityIds: ["start", "end"] }]);
});

test("profile completion uses an independent authoritative stage result", () => {
  assert.equal(stage(calculateFacilityDriverJourney([completeDriver]), "profile_completion").reachedCount, 1);
  assert.equal(stage(calculateFacilityDriverJourney([{ ...completeDriver, profileCompletion: false }]), "profile_completion").reachedCount, 0);
});

test("first login is available when recorded and insufficient when history is absent", () => {
  assert.equal(stage(calculateFacilityDriverJourney([completeDriver]), "first_login").reachedCount, 1);
  assert.deepEqual(stage(calculateFacilityDriverJourney([{ ...completeDriver, firstLogin: null }]), "first_login"), {
    key: "first_login",
    name: "First Login",
    reachedCount: null,
    conversionFromPrevious: null,
    abandonmentFromPrevious: null,
    optional: false,
    dataStatus: "insufficient_data",
  });
});

test("Check-In, Photo Upload, and Verification use independent canonical evidence", () => {
  const report = calculateFacilityDriverJourney([completeDriver]);
  assert.equal(stage(report, "check_in").reachedCount, 1);
  assert.equal(stage(report, "photo_upload").reachedCount, 1);
  assert.equal(stage(report, "verification").reachedCount, 1);
});

test("a missing operational source returns insufficient data instead of false zero", () => {
  const report = calculateFacilityDriverJourney([{ ...completeDriver, checkIn: null, photoUpload: null, verification: null }]);
  for (const key of ["check_in", "photo_upload", "verification"]) {
    assert.equal(stage(report, key).reachedCount, null);
    assert.equal(stage(report, key).dataStatus, "insufficient_data");
  }
});

test("Repeat Activity is zero for one submission and one for distinct repeated participation", () => {
  assert.equal(stage(calculateFacilityDriverJourney([completeDriver]), "repeat_activity").reachedCount, 0);
  assert.equal(stage(calculateFacilityDriverJourney([{ ...completeDriver, repeatActivity: true }]), "repeat_activity").reachedCount, 1);
});

test("an unavailable earlier account fact does not erase downstream activity stages", () => {
  const report = calculateFacilityDriverJourney([{ ...completeDriver, firstLogin: null }]);
  assert.equal(stage(report, "first_login").dataStatus, "insufficient_data");
  assert.equal(stage(report, "check_in").reachedCount, 1);
  assert.equal(stage(report, "photo_upload").reachedCount, 1);
  assert.equal(stage(report, "verification").reachedCount, 1);
});

test("stage governance declares source, scope, dates, inclusion, exclusion, and insufficient-history behavior", () => {
  assert.deepEqual(FACILITY_DRIVER_JOURNEY_STAGE_RULES.map((rule) => rule.key), [
    "registration", "profile_completion", "first_login", "check_in", "photo_upload", "verification", "repeat_activity",
  ]);
  for (const rule of FACILITY_DRIVER_JOURNEY_STAGE_RULES) {
    assert.ok(rule.authoritativeSource && rule.facilityAttribution && rule.dateAttribution);
    assert.ok(rule.inclusionCriteria && rule.exclusionCriteria && rule.insufficientHistoryBehavior);
    assert.doesNotMatch(rule.authoritativeSource, /wallet|stripe|payout|gps|latitude|longitude/i);
  }
});

test("Material Recovery Activity journey remains on its canonical calculation", () => {
  const report = calculateJourneyReport(PLATFORM_JOURNEYS_BY_KEY.washout, [
    { eventType: "activity.checked_in", activityId: "activity-1", occurredAt: new Date("2026-07-01T00:00:00Z") },
    { eventType: "photo.uploaded", activityId: "activity-1", occurredAt: new Date("2026-07-01T00:01:00Z") },
    { eventType: "activity.owner_reviewed", activityId: "activity-1", occurredAt: new Date("2026-07-01T00:02:00Z") },
    { eventType: "activity.verified", activityId: "activity-1", occurredAt: new Date("2026-07-01T00:03:00Z") },
  ]);
  assert.equal(report.entryCount, 1);
  assert.equal(report.exitCount, 1);
  assert.equal(report.conversionRate, 1);
  assert.equal(stage(report, "verification").reachedCount, 1);
});

test("English and Spanish label Profile Completion and insufficient history", () => {
  assert.equal(translate("owner.intelligence.stage.profile_completion", "en"), "Profile Completion");
  assert.equal(translate("owner.intelligence.stage.profile_completion", "es"), "Perfil completado");
  assert.equal(translate("owner.intelligence.insufficientData", "en"), "Insufficient data");
  assert.equal(translate("owner.intelligence.insufficientData", "es"), "Datos insuficientes");
});

test("Owner Intelligence renders explicit insufficient data and does not expose private stage details", async () => {
  const page = await readFile(new URL("../client/src/pages/owner/facility-intelligence.tsx", import.meta.url), "utf8");
  const journeyProjection = page.slice(page.indexOf("type Journey"), page.indexOf("type Translate"));
  assert.match(page, /stage\.dataStatus === "insufficient_data"/);
  assert.match(page, /owner\.intelligence\.insufficientData/);
  assert.doesNotMatch(journeyProjection, /storageKey|gpsLatitude|gpsLongitude|firstName|lastName/);
});
