import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAdminPlatformActivity,
  filterAdminPlatformActivityRange,
} from "../client/src/lib/adminPlatformActivity";

test("platform activity aggregates operational activity, participation, rewards, and geography", () => {
  const result = buildAdminPlatformActivity(
    [
      { washoutStatus: "verified", checkInTime: "2026-07-10T14:00:00.000Z", driverId: "driver-1", ownerId: "owner-1", locationId: "location-1", ticketNumber: "T-1" },
      { washoutStatus: "verified", checkInTime: "2026-07-10T16:00:00.000Z", driverId: "driver-2", ownerId: "owner-1", locationId: "location-1" },
      { washoutStatus: "pending", checkInTime: "2026-07-11T14:00:00.000Z", driverId: "driver-2", ownerId: "owner-2", locationId: "location-2", ticketNumber: "T-2" },
      { washoutStatus: "rejected", checkInTime: "2026-07-12T14:00:00.000Z", driverId: "driver-3", ownerId: "owner-2", locationId: "location-2" },
    ],
    [
      { id: "location-1", city: "Austin", state: "TX" },
      { id: "location-2", city: "Dallas", state: "TX" },
      { id: "location-3", city: "Houston", state: "TX" },
    ],
    3,
  );

  assert.equal(result.totalActivities, 4);
  assert.equal(result.verifiedActivities, 2);
  assert.equal(result.pendingActivities, 1);
  assert.equal(result.rejectedActivities, 1);
  assert.equal(result.activeDrivers, 3);
  assert.equal(result.activeOwners, 2);
  assert.equal(result.ownersWithoutActivity, 1);
  assert.equal(result.participatingLocations, 1);
  assert.equal(result.participatingLocationPercentage, 33);
  assert.equal(result.rewardEntries, 2);
  assert.equal(result.rewardDrivers, 2);
  assert.deepEqual(result.activityByCity, [{ label: "Austin", count: 2 }]);
  assert.deepEqual(result.activityByState, [{ label: "TX", count: 2 }]);
  assert.deepEqual(result.verifiedTrend, [{ label: "2026-07-10", count: 2 }]);
});

test("missing sources remain unavailable while valid partial activity data remains useful", () => {
  const unavailable = buildAdminPlatformActivity(undefined, undefined);
  assert.equal(unavailable.totalActivities, null);
  assert.equal(unavailable.activeDrivers, null);
  assert.equal(unavailable.participatingLocations, null);

  const partial = buildAdminPlatformActivity(
    [{ washoutStatus: "verified", checkInTime: "2026-07-10T14:00:00.000Z", driverId: "driver-1", locationId: "location-1" }],
    undefined,
  );
  assert.equal(partial.verifiedActivities, 1);
  assert.equal(partial.activeDrivers, 1);
  assert.equal(partial.participatingLocations, 1);
  assert.equal(partial.participatingLocationPercentage, null);
  assert.deepEqual(partial.activityByCity, []);
});

test("malformed activity rows do not produce false participation or trend values", () => {
  const result = buildAdminPlatformActivity(
    [
      { washoutStatus: "verified", checkInTime: "invalid", driverId: "", ownerId: " ", locationId: null, ticketNumber: "" },
      { washoutStatus: null, checkInTime: "2026-07-10", driverId: 42, ownerId: {}, locationId: [], ticketNumber: null },
    ],
    [],
    1,
  );

  assert.equal(result.totalActivities, 2);
  assert.equal(result.verifiedActivities, 1);
  assert.equal(result.activeDrivers, 0);
  assert.equal(result.activeOwners, 0);
  assert.equal(result.participatingLocations, 0);
  assert.equal(result.rewardEntries, 0);
  assert.deepEqual(result.verifiedTrend, []);
});

test("financial-looking fields do not affect platform activity results", () => {
  const baseline = buildAdminPlatformActivity(
    [{ washoutStatus: "verified", checkInTime: "2026-07-10T14:00:00.000Z", driverId: "driver-1", ownerId: "owner-1", locationId: "location-1" }],
    [{ id: "location-1", city: "Austin", state: "TX" }],
    1,
  );
  const withFinancialLookingFields = buildAdminPlatformActivity(
    [{
      washoutStatus: "verified", checkInTime: "2026-07-10T14:00:00.000Z", driverId: "driver-1", ownerId: "owner-1", locationId: "location-1",
      walletBalance: "999", paymentAmount: "100", processingFee: "1", ownerReceivable: "101", stripeConnectAccountId: "acct_sensitive",
    } as any],
    [{
      id: "location-1", city: "Austin", state: "TX", walletBalance: "10", paymentAmount: "20", stripeCustomerId: "cus_sensitive",
    } as any],
    1,
  );

  assert.deepEqual(withFinancialLookingFields, baseline);
  assert.deepEqual(Object.keys(withFinancialLookingFields).sort(), [
    "activeDrivers", "activeOwners", "activityByCity", "activityByState", "ownersWithoutActivity", "participatingLocationPercentage",
    "participatingLocations", "pendingActivities", "rejectedActivities", "rewardDrivers", "rewardEntries", "totalActivities", "verifiedActivities", "verifiedTrend",
  ]);
});

function localTimestamp(year: number, month: number, day: number, hour = 12): string {
  return new Date(year, month - 1, day, hour).toISOString();
}

function rangeFixture(date: string, suffix: string) {
  return {
    washoutStatus: "verified",
    checkInTime: date,
    driverId: `driver-${suffix}`,
    ownerId: `owner-${suffix}`,
    locationId: `location-${suffix}`,
    ticketNumber: `ticket-${suffix}`,
  };
}

const rangeLocations = [
  { id: "location-today", city: "Austin", state: "TX" },
  { id: "location-seven", city: "Dallas", state: "TX" },
  { id: "location-thirty", city: "Houston", state: "TX" },
];

test("today uses the local calendar boundary for cards and chart", () => {
  const now = new Date(2026, 6, 13, 12);
  const rows = [
    rangeFixture(localTimestamp(2026, 7, 13, 0), "today"),
    rangeFixture(localTimestamp(2026, 7, 12, 23), "before-today"),
  ];
  const result = buildAdminPlatformActivity(filterAdminPlatformActivityRange(rows, "today", now), rangeLocations, 2);

  assert.equal(result.verifiedActivities, 1);
  assert.equal(result.activeDrivers, 1);
  assert.equal(result.participatingLocations, 1);
  assert.equal(result.rewardEntries, 1);
  assert.deepEqual(result.activityByCity, [{ label: "Austin", count: 1 }]);
  assert.deepEqual(result.verifiedTrend, [{ label: "2026-07-13", count: 1 }]);
});

test("last 7 days includes today plus six prior local dates without an eighth day", () => {
  const now = new Date(2026, 6, 13, 12);
  const rows = [
    rangeFixture(localTimestamp(2026, 7, 13), "today"),
    rangeFixture(localTimestamp(2026, 7, 7), "seven"),
    rangeFixture(localTimestamp(2026, 7, 6), "eighth"),
  ];
  const result = buildAdminPlatformActivity(filterAdminPlatformActivityRange(rows, "last_7_days", now), rangeLocations, 3);

  assert.equal(result.verifiedActivities, 2);
  assert.equal(result.activeDrivers, 2);
  assert.equal(result.activeOwners, 2);
  assert.equal(result.ownersWithoutActivity, 1);
  assert.equal(result.participatingLocations, 2);
  assert.equal(result.rewardEntries, 2);
  assert.deepEqual(result.activityByCity, [{ label: "Austin", count: 1 }, { label: "Dallas", count: 1 }]);
  assert.deepEqual(result.verifiedTrend, [{ label: "2026-07-07", count: 1 }, { label: "2026-07-13", count: 1 }]);
});

test("last 30 days includes today plus twenty-nine prior local dates without a thirty-first day", () => {
  const now = new Date(2026, 6, 13, 12);
  const rows = [
    rangeFixture(localTimestamp(2026, 7, 13), "today"),
    rangeFixture(localTimestamp(2026, 6, 14), "thirty"),
    rangeFixture(localTimestamp(2026, 6, 13), "thirty-first"),
  ];
  const result = buildAdminPlatformActivity(filterAdminPlatformActivityRange(rows, "last_30_days", now), rangeLocations, 3);

  assert.equal(result.verifiedActivities, 2);
  assert.equal(result.activeDrivers, 2);
  assert.equal(result.participatingLocations, 2);
  assert.equal(result.rewardEntries, 2);
  assert.deepEqual(result.activityByState, [{ label: "TX", count: 2 }]);
  assert.deepEqual(result.verifiedTrend, [{ label: "2026-06-14", count: 1 }, { label: "2026-07-13", count: 1 }]);
});
