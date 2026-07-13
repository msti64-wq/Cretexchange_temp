import assert from "node:assert/strict";
import test from "node:test";

import { buildAdminMarketplaceHealth } from "../client/src/lib/adminMarketplaceHealth";

const locations = [
  { id: "ready-austin", isActive: true, isVisible: true, city: "Austin", state: "TX" },
  { id: "ready-dallas", isActive: true, isVisible: true, city: "Dallas", state: "TX" },
  { id: "active-hidden", isActive: true, isVisible: false, city: "Austin", state: "TX" },
  { id: "inactive-visible", isActive: false, isVisible: true, city: "Houston", state: "TX" },
];

test("marketplace health keeps active, visible, and driver-accessible configuration distinct", () => {
  const result = buildAdminMarketplaceHealth(locations, [
    { washoutStatus: "verified", locationId: "ready-austin" },
    { washoutStatus: "verified", locationId: "active-hidden" },
    { washoutStatus: "pending", locationId: "ready-dallas" },
  ]);

  assert.equal(result.totalLocations, 4);
  assert.equal(result.activeLocations, 3);
  assert.equal(result.visibleLocations, 3);
  assert.equal(result.driverAccessibleLocations, 2);
  assert.equal(result.locationsNeedingConfiguration, 2);
  assert.equal(result.marketplaceReadinessPercentage, 50);
  assert.equal(result.verifiedParticipatingLocations, 2);
  assert.equal(result.utilizedReadyLocations, 1);
  assert.equal(result.readyLocationsWithoutVerifiedActivity, 1);
  assert.equal(result.readyLocationUtilizationPercentage, 50);
});

test("empty locations retain useful zero counts without percentage claims", () => {
  const result = buildAdminMarketplaceHealth([], []);

  assert.equal(result.totalLocations, 0);
  assert.equal(result.activeLocations, 0);
  assert.equal(result.visibleLocations, 0);
  assert.equal(result.driverAccessibleLocations, 0);
  assert.equal(result.locationsNeedingConfiguration, 0);
  assert.equal(result.marketplaceReadinessPercentage, null);
  assert.equal(result.readyLocationUtilizationPercentage, null);
  assert.deepEqual(result.cityRegions, []);
  assert.deepEqual(result.stateRegions, []);
});

test("zero ready locations has a valid readiness rate but no utilization denominator", () => {
  const result = buildAdminMarketplaceHealth([
    { id: "active-hidden", isActive: true, isVisible: false },
    { id: "inactive-visible", isActive: false, isVisible: true },
  ], []);

  assert.equal(result.marketplaceReadinessPercentage, 0);
  assert.equal(result.driverAccessibleLocations, 0);
  assert.equal(result.utilizedReadyLocations, 0);
  assert.equal(result.readyLocationsWithoutVerifiedActivity, 0);
  assert.equal(result.readyLocationUtilizationPercentage, null);
});

test("valid ready-facility utilization ranges from zero to full participation", () => {
  const ready = locations.slice(0, 2);
  const noActivity = buildAdminMarketplaceHealth(ready, []);
  const fullActivity = buildAdminMarketplaceHealth(ready, [
    { washoutStatus: "verified", locationId: "ready-austin" },
    { washoutStatus: "verified", locationId: "ready-dallas" },
  ]);

  assert.equal(noActivity.readyLocationUtilizationPercentage, 0);
  assert.equal(noActivity.readyLocationsWithoutVerifiedActivity, 2);
  assert.equal(fullActivity.readyLocationUtilizationPercentage, 100);
  assert.equal(fullActivity.utilizedReadyLocations, 2);
});

test("duplicate verified rows do not inflate selected-range ready participation", () => {
  const selectedRangeRows = [
    { washoutStatus: "verified", locationId: "ready-austin" },
    { washoutStatus: "verified", locationId: "ready-austin" },
    { washoutStatus: "pending", locationId: "ready-dallas" },
  ];
  const result = buildAdminMarketplaceHealth(locations, selectedRangeRows);

  assert.equal(result.verifiedParticipatingLocations, 1);
  assert.equal(result.utilizedReadyLocations, 1);
  assert.equal(result.readyLocationUtilizationPercentage, 50);
});

test("marketplace coverage uses unique normalized ready-location geography only", () => {
  const result = buildAdminMarketplaceHealth([
    { id: "one", isActive: true, isVisible: true, city: " Austin ", state: "TX" },
    { id: "two", isActive: true, isVisible: true, city: "austin", state: " tx " },
    { id: "three", isActive: true, isVisible: true, city: "Dallas", state: "TX" },
    { id: "four", isActive: true, isVisible: false, city: "Houston", state: "TX" },
    { id: "five", isActive: true, isVisible: true, city: " ", state: null },
  ], []);

  assert.equal(result.cityCoverage, 2);
  assert.equal(result.stateCoverage, 1);
  assert.deepEqual(result.cityRegions, [{ label: "Austin" }, { label: "Dallas" }]);
  assert.deepEqual(result.stateRegions, [{ label: "TX" }]);
});

test("missing data remains unavailable while valid partial sources retain their scope", () => {
  const locationsOnly = buildAdminMarketplaceHealth(locations, undefined);
  assert.equal(locationsOnly.driverAccessibleLocations, 2);
  assert.equal(locationsOnly.utilizedReadyLocations, null);
  assert.equal(locationsOnly.readyLocationUtilizationPercentage, null);

  const activitiesOnly = buildAdminMarketplaceHealth(undefined, [{ washoutStatus: "verified", locationId: "known" }]);
  assert.equal(activitiesOnly.driverAccessibleLocations, null);
  assert.equal(activitiesOnly.verifiedParticipatingLocations, null);
  assert.equal(activitiesOnly.utilizedReadyLocations, null);
  assert.equal(activitiesOnly.cityCoverage, null);

  const activityUnavailable = buildAdminMarketplaceHealth(locations, undefined);
  assert.equal(activityUnavailable.driverAccessibleLocations, 2);
  assert.equal(activityUnavailable.marketplaceReadinessPercentage, 50);
  assert.equal(activityUnavailable.verifiedParticipatingLocations, null);
  assert.equal(activityUnavailable.readyLocationUtilizationPercentage, null);
});

test("financial-looking fields do not affect operational marketplace health", () => {
  const baseline = buildAdminMarketplaceHealth(
    [{ id: "ready", isActive: true, isVisible: true, city: "Austin", state: "TX" }],
    [{ washoutStatus: "verified", locationId: "ready" }],
  );
  const withExtraFields = buildAdminMarketplaceHealth(
    [{
      id: "ready", isActive: true, isVisible: true, city: "Austin", state: "TX",
      walletBalance: "999", stripeConnectAccountId: "acct_sensitive", paymentAmount: "12",
    } as any],
    [{
      washoutStatus: "verified", locationId: "ready", ownerReceivable: "12", processingFee: "1", paymentStatus: "paid",
    } as any, { washoutStatus: "unknown", locationId: [] } as any],
  );

  assert.deepEqual(withExtraFields, baseline);
  assert.deepEqual(Object.keys(withExtraFields).sort(), [
    "activeLocations", "cityCoverage", "cityRegions", "driverAccessibleLocations", "locationsNeedingConfiguration",
    "marketplaceReadinessPercentage", "readyLocationUtilizationPercentage", "readyLocationsWithoutVerifiedActivity",
    "stateCoverage", "stateRegions", "totalLocations", "utilizedReadyLocations", "verifiedParticipatingLocations", "visibleLocations",
  ]);
});

test("malformed location values do not become ready or valid geographic coverage", () => {
  const result = buildAdminMarketplaceHealth(
    [{ id: " ", isActive: "true", isVisible: 1, city: " ", state: null } as any],
    [{ washoutStatus: "verified", locationId: [] } as any],
  );

  assert.equal(result.totalLocations, 1);
  assert.equal(result.driverAccessibleLocations, 0);
  assert.equal(result.verifiedParticipatingLocations, 0);
  assert.equal(result.cityCoverage, 0);
  assert.equal(result.stateCoverage, 0);
  assert.deepEqual(result.cityRegions, []);
  assert.deepEqual(result.stateRegions, []);
});
