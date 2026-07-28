import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateJourneyReport,
  calculateDriverActivityStreaks,
  calculateFacilityHealthScore,
  deriveDriverJourneyMetrics,
  buildFacilityOwnerIndicators,
  canAccessFacilityOperationalIntelligence,
  PLATFORM_JOURNEYS_BY_KEY,
  PLATFORM_ANALYTICS_EVENT_TYPES,
  PLATFORM_METRIC_REGISTRY,
  PlatformAnalyticsQueryError,
  canAccessPlatformAnalytics,
  parsePlatformAnalyticsQuery,
  parseFacilityIntelligenceQuery,
  parseDriverIntelligenceQuery,
  recordPlatformAnalyticsEvent,
} from "../server/platformAnalytics";
import { registerRoutes } from "../server/routes";
import { storage } from "../server/storage";

test("platform analytics has a bounded operational vocabulary without financial events", () => {
  assert.ok(PLATFORM_ANALYTICS_EVENT_TYPES.includes("driver.registered"));
  assert.ok(PLATFORM_ANALYTICS_EVENT_TYPES.includes("photo.uploaded"));
  assert.ok(PLATFORM_ANALYTICS_EVENT_TYPES.includes("facility.first_verified"));
  assert.ok(PLATFORM_ANALYTICS_EVENT_TYPES.includes("activity.owner_reviewed"));
  assert.ok(PLATFORM_ANALYTICS_EVENT_TYPES.includes("admin_review.returned_to_owner_review"));
  assert.equal(PLATFORM_ANALYTICS_EVENT_TYPES.some((event) => /payment|wallet|stripe|payout/i.test(event)), false);
});

test("metric registry is complete, role-scoped, and contains no financial source", () => {
  assert.deepEqual(PLATFORM_METRIC_REGISTRY.map((metric) => metric.key), [
    "submitted_activity", "verified_activity", "rejected_activity", "administrative_review_requested",
    "administrative_review_completed", "active_drivers", "active_facilities", "driver_retention",
    "facility_utilization", "verification_rate",
  ]);
  for (const metric of PLATFORM_METRIC_REGISTRY) {
    assert.ok(metric.name && metric.description && metric.businessPurpose && metric.calculation);
    assert.ok(metric.sourceEvents.length > 0 && metric.sourceOperationalTables.length > 0);
    assert.ok(metric.inclusionRules && metric.exclusionRules && metric.timeAttribution && metric.timezonePolicy);
    assert.equal(metric.securityClassification, "internal_operational");
    assert.equal(metric.sourceEvents.join("|").match(/payment|wallet|stripe|payout/i), null);
  }
});

test("journey calculations use recorded facts for conversion, drop-off, and duration", () => {
  const report = calculateJourneyReport(PLATFORM_JOURNEYS_BY_KEY.driver, [
    { eventType: "driver.registered", driverId: "one", occurredAt: new Date("2026-07-01T00:00:00Z") },
    { eventType: "driver.profile_completed", driverId: "one", occurredAt: new Date("2026-07-01T00:01:00Z") },
    { eventType: "driver.first_logged_in", driverId: "one", occurredAt: new Date("2026-07-01T00:02:00Z") },
    { eventType: "activity.checked_in", driverId: "one", occurredAt: new Date("2026-07-01T00:03:00Z") },
    { eventType: "photo.uploaded", driverId: "one", occurredAt: new Date("2026-07-01T00:04:00Z") },
    { eventType: "activity.verified", driverId: "one", occurredAt: new Date("2026-07-01T00:05:00Z") },
    { eventType: "activity.repeat_submitted", driverId: "one", occurredAt: new Date("2026-07-01T00:06:00Z") },
    { eventType: "driver.registered", driverId: "two", occurredAt: new Date("2026-07-01T00:00:00Z") },
    { eventType: "driver.profile_completed", driverId: "two", occurredAt: new Date("2026-07-01T00:01:00Z") },
  ]);
  assert.equal(report.entryCount, 2);
  assert.equal(report.exitCount, 1);
  assert.equal(report.conversionRate, 0.5);
  assert.equal(report.abandonmentRate, 0.5);
  assert.equal(report.averageDurationMs, 360_000);
  assert.equal(report.medianDurationMs, 360_000);
  assert.equal(report.stages[1].abandonmentFromPrevious, 0.5);
  assert.equal(report.stages.at(-1)?.reachedCount, 1);
});

test("washout journey records Owner Review and leaves Administrative Review optional", () => {
  const report = calculateJourneyReport(PLATFORM_JOURNEYS_BY_KEY.washout, [
    { eventType: "activity.checked_in", activityId: "activity-1", occurredAt: new Date("2026-07-01T00:00:00Z") },
    { eventType: "photo.uploaded", activityId: "activity-1", occurredAt: new Date("2026-07-01T00:02:00Z") },
    { eventType: "activity.owner_reviewed", activityId: "activity-1", occurredAt: new Date("2026-07-01T00:03:00Z") },
    { eventType: "activity.verified", activityId: "activity-1", occurredAt: new Date("2026-07-01T00:04:00Z") },
  ]);
  assert.equal(report.entryCount, 1);
  assert.equal(report.exitCount, 1);
  assert.equal(report.stages.find((stage) => stage.key === "owner_review")?.reachedCount, 1);
  assert.equal(report.stages.find((stage) => stage.key === "administrative_review")?.optional, true);
});

test("Facility Health Score is advisory, bounded, and omits internal weighting", () => {
  const health = calculateFacilityHealthScore({
    activityVolume: 12, finalDecisionCount: 10, verificationRate: 0.9,
    repeatDriverPercentage: 0.6, administrativeReviewRate: 0.05,
    operationalConsistency: 0.8, profileComplete: true,
  });
  assert.equal(health.state, "strong");
  assert.ok(health.score && health.score <= 100);
  assert.deepEqual(Object.keys(health).sort(), ["score", "state"]);
  assert.deepEqual(calculateFacilityHealthScore({ activityVolume: 0, finalDecisionCount: 0, verificationRate: null, repeatDriverPercentage: null, administrativeReviewRate: null, operationalConsistency: null, profileComplete: false }), { score: null, state: "insufficient_data" });
});

test("facility date parser stays bounded and owner indicators provide direct operational guidance", () => {
  const parsed = parseFacilityIntelligenceQuery({ start: "2026-07-01T00:00:00.000Z", end: "2026-07-31T00:00:00.000Z" });
  assert.equal(parsed.start.toISOString(), "2026-07-01T00:00:00.000Z");
  assert.throws(() => parseFacilityIntelligenceQuery({ start: "2026-01-01T00:00:00.000Z", end: "2026-07-31T00:00:00.000Z" }), PlatformAnalyticsQueryError);
  assert.deepEqual(buildFacilityOwnerIndicators({ context: { profileComplete: false, hasOperatingHours: false }, finalDecisionCount: 2, verificationRate: 0.5, activityVolume: 3, administrativeReviewRate: 0.5 }).map((indicator) => indicator.code), ["profile_incomplete", "operating_hours_missing", "verification_rate_low", "administrative_review_rate_high"]);
});

test("driver intelligence bounds its trend window and defines UTC activity streaks from submitted days", () => {
  const parsed = parseDriverIntelligenceQuery({ start: "2026-07-01T00:00:00.000Z", end: "2026-07-31T00:00:00.000Z" });
  assert.equal(parsed.start.toISOString(), "2026-07-01T00:00:00.000Z");
  assert.throws(() => parseDriverIntelligenceQuery({ start: "2026-01-01T00:00:00.000Z", end: "2026-07-31T00:00:00.000Z" }), PlatformAnalyticsQueryError);
  assert.deepEqual(calculateDriverActivityStreaks([
    new Date("2026-07-01T08:00:00.000Z"), new Date("2026-07-02T21:00:00.000Z"),
    new Date("2026-07-04T08:00:00.000Z"), new Date("2026-07-05T08:00:00.000Z"), new Date("2026-07-06T08:00:00.000Z"),
  ]), { consecutiveActiveDays: 3, longestActivityStreak: 3 });
});

test("driver journey metrics derive direct conversions from the canonical Washout journey", () => {
  const journey = calculateJourneyReport(PLATFORM_JOURNEYS_BY_KEY.washout, [
    { eventType: "activity.checked_in", activityId: "one", occurredAt: new Date("2026-07-01T00:00:00Z") },
    { eventType: "photo.uploaded", activityId: "one", occurredAt: new Date("2026-07-01T00:01:00Z") },
    { eventType: "activity.owner_reviewed", activityId: "one", occurredAt: new Date("2026-07-01T00:02:00Z") },
    { eventType: "activity.verified", activityId: "one", occurredAt: new Date("2026-07-01T00:03:00Z") },
    { eventType: "activity.checked_in", activityId: "two", occurredAt: new Date("2026-07-01T00:00:00Z") },
    { eventType: "photo.uploaded", activityId: "two", occurredAt: new Date("2026-07-01T00:01:00Z") },
  ]);
  const metrics = deriveDriverJourneyMetrics(journey);
  assert.equal(metrics.checkInToUploadRate, 1);
  assert.equal(metrics.uploadToVerificationRate, 0.5);
  assert.equal(metrics.overallCompletionRate, 0.5);
  assert.equal(metrics.averageCompletionDurationMs, 180_000);
});

test("analytics query parser bounds pagination and rejects unsupported inputs", () => {
  const parsed = parsePlatformAnalyticsQuery({ eventType: "activity.verified", page: "4", pageSize: "1000", start: "2026-07-01T00:00:00.000Z" });
  assert.equal(parsed.page, 4);
  assert.equal(parsed.pageSize, 100);
  assert.equal(parsed.eventType, "activity.verified");
  assert.throws(() => parsePlatformAnalyticsQuery({ eventType: "payment.completed" }), PlatformAnalyticsQueryError);
  assert.throws(() => parsePlatformAnalyticsQuery({ start: "2026-07-03", end: "2026-07-01" }), PlatformAnalyticsQueryError);
});

test("analytics events are written with a source-event idempotency key and safe metadata only", async () => {
  let values: Record<string, unknown> | undefined;
  let target: unknown;
  const executor = {
    insert() {
      return {
        values(input: Record<string, unknown>) {
          values = input;
          return { onConflictDoNothing(input: { target: unknown }) { target = input.target; return Promise.resolve(); } };
        },
      };
    },
  };
  await recordPlatformAnalyticsEvent(executor as never, {
    eventType: "activity.submitted", sourceRecordType: "washout_activity", sourceRecordId: "activity-1",
    sourceEventKey: "activity:activity-1:submitted", occurredAt: new Date("2026-07-27T00:00:00.000Z"),
    activityId: "activity-1", driverId: "driver-1", locationId: "location-1",
  });
  assert.equal(values?.sourceEventKey, "activity:activity-1:submitted");
  assert.deepEqual(values?.metadata, {});
  assert.ok(target);
});

test("analytics read access remains Admin and Super Admin only", () => {
  assert.equal(canAccessPlatformAnalytics("admin"), true);
  assert.equal(canAccessPlatformAnalytics("super_admin"), true);
  assert.equal(canAccessPlatformAnalytics("driver"), false);
  assert.equal(canAccessPlatformAnalytics("owner"), false);
  assert.equal(canAccessPlatformAnalytics(undefined), false);
  assert.equal(canAccessFacilityOperationalIntelligence("owner"), true);
  assert.equal(canAccessFacilityOperationalIntelligence("driver"), false);
});

test("analytics APIs are registered and deny non-admin callers before analytics queries", async () => {
  const gets = new Map<string, Function>();
  const app = { get(path: string, ...handlers: Function[]) { gets.set(path, handlers.at(-1)!); }, post() {}, put() {}, delete() {}, patch() {}, use() {} };
  await registerRoutes(app as never);
  const eventsRoute = gets.get("/api/admin/analytics/events");
  const metricsRoute = gets.get("/api/admin/analytics/metrics/operational");
  const journeyRoute = gets.get("/api/admin/analytics/journeys");
  const facilityRoute = gets.get("/api/owners/facilities/:locationId/intelligence");
  const facilityDashboardRoute = gets.get("/api/owners/facilities/:locationId/intelligence/dashboard");
  const driverDashboardRoute = gets.get("/api/drivers/intelligence/dashboard");
  assert.equal(typeof eventsRoute, "function");
  assert.equal(typeof metricsRoute, "function");
  assert.equal(typeof journeyRoute, "function");
  assert.equal(typeof facilityRoute, "function");
  assert.equal(typeof facilityDashboardRoute, "function");
  assert.equal(typeof driverDashboardRoute, "function");
  const originalGetUser = storage.getUser;
  const originalGetOwner = storage.getOwner;
  const originalGetWashoutLocation = storage.getWashoutLocation;
  try {
    (storage as any).getUser = async () => ({ id: "driver-user", role: "driver" });
    let statusCode = 200;
    let payload: unknown;
    const response = { status(code: number) { statusCode = code; return this; }, json(value: unknown) { payload = value; return this; } };
    await eventsRoute!({ user: { id: "driver-user" }, query: {} }, response);
    assert.equal(statusCode, 403);
    assert.deepEqual(payload, { message: "Admin access required" });
    await metricsRoute!({ user: { id: "driver-user" }, query: {} }, response);
    assert.equal(statusCode, 403);
    statusCode = 200;
    payload = undefined;
    await facilityDashboardRoute!({ user: { id: "driver-user" }, params: { locationId: "location-1" }, query: {} }, response);
    assert.equal(statusCode, 403);
    assert.deepEqual(payload, { message: "Facility intelligence access required" });
    statusCode = 200;
    payload = undefined;
    (storage as any).getUser = async () => ({ id: "owner-user", role: "owner" });
    await driverDashboardRoute!({ user: { id: "owner-user" }, query: {} }, response);
    assert.equal(statusCode, 403);
    assert.deepEqual(payload, { message: "Driver intelligence access required" });
    (storage as any).getOwner = async () => ({ id: "owner-a" });
    (storage as any).getWashoutLocation = async () => ({ id: "location-1", ownerId: "owner-b" });
    statusCode = 200;
    payload = undefined;
    await facilityDashboardRoute!({ user: { id: "owner-user" }, params: { locationId: "location-1" }, query: {} }, response);
    assert.equal(statusCode, 403);
    assert.deepEqual(payload, { message: "Facility intelligence access required" });
  } finally {
    (storage as any).getUser = originalGetUser;
    (storage as any).getOwner = originalGetOwner;
    (storage as any).getWashoutLocation = originalGetWashoutLocation;
  }
});
