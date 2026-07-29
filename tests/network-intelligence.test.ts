import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { calculateNetworkIntelligence, parseNetworkIntelligenceQuery, type NetworkEvent } from "../server/networkIntelligence";
import { canAccessPlatformAnalytics } from "../server/platformAnalytics";

const event = (eventType: NetworkEvent["eventType"], occurredAt: string, extra: Partial<NetworkEvent> = {}): NetworkEvent => ({
  eventType, occurredAt: new Date(occurredAt), activityId: null, driverId: null, locationId: null, ...extra,
});

test("Network Intelligence calculates canonical activity, adoption, retention, density, quality, and deterministic geography", () => {
  const result = calculateNetworkIntelligence({
    start: new Date("2026-07-01T00:00:00.000Z"), end: new Date("2026-07-30T23:59:59.999Z"), now: new Date("2026-07-30T12:00:00.000Z"),
    drivers: [{ id: "d1", createdAt: new Date("2026-06-01") }, { id: "d2", createdAt: new Date("2026-07-05") }],
    facilities: [
      { id: "f1", state: "TX", createdAt: new Date("2026-06-01"), approved: true, active: true },
      { id: "f2", state: "OK", createdAt: new Date("2026-07-02"), approved: true, active: true },
    ],
    events: [
      event("activity.submitted", "2026-06-15T10:00:00Z", { driverId: "d1", locationId: "f1", activityId: "old" }),
      event("activity.checked_in", "2026-07-10T10:00:00Z", { driverId: "d1", locationId: "f1", activityId: "a1" }),
      event("activity.submitted", "2026-07-10T10:02:00Z", { driverId: "d1", locationId: "f1", activityId: "a1" }),
      event("activity.repeat_submitted", "2026-07-10T10:02:00Z", { driverId: "d1", locationId: "f1", activityId: "a1" }),
      event("activity.verified", "2026-07-10T10:10:00Z", { driverId: "d1", locationId: "f1", activityId: "a1" }),
      event("activity.submitted", "2026-07-20T10:00:00Z", { driverId: "d2", locationId: "f2", activityId: "a2" }),
      event("activity.rejected", "2026-07-20T10:10:00Z", { driverId: "d2", locationId: "f2", activityId: "a2" }),
      event("admin_review.requested", "2026-07-20T10:12:00Z", { driverId: "d2", locationId: "f2", activityId: "a2" }),
    ],
  });
  assert.deepEqual({
    activeDrivers: result.overview.activeDrivers,
    activeFacilities: result.overview.activeFacilities,
    newDrivers: result.overview.newDrivers,
    returningDrivers: result.overview.returningDrivers,
    retainedDrivers: result.overview.retainedDrivers,
    newFacilities: result.overview.newFacilities,
  }, { activeDrivers: 2, activeFacilities: 2, newDrivers: 1, returningDrivers: 1, retainedDrivers: 1, newFacilities: 1 });
  assert.equal(result.engagement.repeatDriverRate, 0.5);
  assert.equal(result.engagement.activeDriverToActiveFacilityRatio, 1);
  assert.equal(result.quality.verificationRate, 0.5);
  assert.equal(result.quality.rejectionRate, 0.5);
  assert.equal(result.quality.journeyCompletionRate, 1);
  assert.deepEqual(result.geography.rows.map((row) => row.state), ["TX", "OK"]);
  assert.equal(result.privacy.includesFinancialData, false);
  assert.equal(result.privacy.includesPreciseGps, false);
});

test("retention avoids false churn and empty/partial history states remain explicit", () => {
  const result = calculateNetworkIntelligence({
    start: new Date("2026-07-01T00:00:00Z"), end: new Date("2026-07-30T23:59:59Z"),
    drivers: [], facilities: [], events: [],
  });
  assert.equal(result.adoption.retainedDriverRate, null);
  assert.equal(result.growth.yearOverYearStatus, "insufficient_history");
  assert.equal(result.engagement.averageVerifiedPerActiveDriver, null);
  assert.equal(result.geography.rows.length, 0);
});

test("network filters, date boundaries, pagination, and sorting are bounded", () => {
  const parsed = parseNetworkIntelligenceQuery({ state: "tx", page: "99999", pageSize: "999", sort: "state", direction: "asc" }, new Date("2026-07-30T00:00:00Z"));
  assert.deepEqual({ state: parsed.state, page: parsed.page, pageSize: parsed.pageSize, sort: parsed.sort, direction: parsed.direction }, { state: "TX", page: 10_000, pageSize: 50, sort: "state", direction: "asc" });
  assert.throws(() => parseNetworkIntelligenceQuery({ start: "2024-01-01", end: "2026-01-01" }), /366 days/);
  assert.throws(() => parseNetworkIntelligenceQuery({ state: "Texas" }), /Invalid state/);
});

test("route preserves anonymous 401 and Driver/Owner 403 while allowing Admin roles", async () => {
  assert.equal(canAccessPlatformAnalytics("admin"), true);
  assert.equal(canAccessPlatformAnalytics("super_admin"), true);
  assert.equal(canAccessPlatformAnalytics("driver"), false);
  assert.equal(canAccessPlatformAnalytics("owner"), false);
  const source = await readFile(new URL("../server/routes.ts", import.meta.url), "utf8");
  const route = source.match(/app\.get\("\/api\/admin\/analytics\/network\/overview"[\s\S]{0,900}/)?.[0] || "";
  assert.match(route, /isAuthenticated/);
  assert.match(route, /canAccessPlatformAnalytics\(user\.role\)/);
  assert.match(route, /status\(403\)/);
});

test("Admin UI and navigation are bilingual and omit prohibited data", async () => {
  const [page, i18n, nav] = await Promise.all([
    readFile(new URL("../client/src/pages/admin/network-intelligence.tsx", import.meta.url), "utf8"),
    readFile(new URL("../client/src/lib/i18n.ts", import.meta.url), "utf8"),
    readFile(new URL("../client/src/components/MobileNav.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(nav, /network-intelligence/);
  assert.match(page, /api\/admin\/analytics\/network\/overview/);
  assert.match(i18n, /"network\.title": "Network Intelligence"/);
  assert.match(i18n, /"network\.title": "Inteligencia de la red"/);
  assert.doesNotMatch(page, /latitude|longitude|email|phone|stripe|wallet|payout/i);
});
