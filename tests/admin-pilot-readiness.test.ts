import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildAdminPilotReadiness } from "../client/src/lib/adminPilotReadiness";

const readyDriver = {
  users: {
    firstName: "Ava", lastName: "Driver", phone: "555-0100", street: "1 Main", city: "Dallas", state: "TX", zip: "75001",
  },
  drivers: { employerName: "Concrete Co", truckNumber: "Truck 1", hasAgreedToTerms: true },
};

const readyOwner = {
  users: {
    firstName: "Olivia", lastName: "Owner", email: "owner@example.test", phone: "555-0101", street: "2 Main", city: "Dallas", state: "TX", zip: "75001",
  },
  owners: { id: "owner-1", isApproved: true, companyName: "Yard Co", businessLicense: "BL-1", taxId: "TX-1" },
};

test("pilot readiness reuses canonical driver and facility readiness criteria", () => {
  const result = buildAdminPilotReadiness({
    drivers: [readyDriver, { ...readyDriver, drivers: { ...readyDriver.drivers, hasAgreedToTerms: false } }],
    owners: [readyOwner, { ...readyOwner, owners: { ...readyOwner.owners, id: "owner-2", isApproved: false } }],
    locations: [{ ownerId: "owner-1", isActive: true, isVisible: true, operatingHours: "8-5" }],
    trust: { pending: 2, olderThan24h: 1, exceptions: 0 },
    supportMessages: [{ status: "unread" }, { status: "resolved" }],
  });

  assert.equal(result.driversTotal, 2);
  assert.equal(result.driversReady, 1);
  assert.equal(result.driversNeedingOnboarding, 1);
  assert.equal(result.facilitiesTotal, 2);
  assert.equal(result.facilitiesReady, 1);
  assert.equal(result.facilitiesNeedingReadiness, 1);
  assert.equal(result.pendingReview, 2);
  assert.equal(result.pendingReviewOver24h, 1);
  assert.equal(result.activeSupportMessages, 1);
  assert.equal(result.unreadSupportMessages, 1);
  assert.equal(result.currentSignal, "attention");
});

test("pilot readiness fails visibly rather than inferring unavailable operational data", () => {
  const result = buildAdminPilotReadiness({
    drivers: [{ users: readyDriver.users, drivers: { employerName: "Concrete Co", truckNumber: "Truck 1" } }],
    owners: undefined,
    locations: undefined,
    trust: undefined,
    supportMessages: undefined,
  });

  assert.equal(result.driversReady, null);
  assert.equal(result.facilitiesReady, null);
  assert.equal(result.pendingReview, null);
  assert.equal(result.activeSupportMessages, null);
  assert.equal(result.currentSignal, "unavailable");
});

test("pilot operations dashboard stays read-only and uses existing operator paths", async () => {
  const [dashboardSource, routeSource] = await Promise.all([
    readFile("client/src/pages/admin/dashboard.tsx", "utf8"),
    readFile("server/routes.ts", "utf8"),
  ]);

  assert.match(dashboardSource, /buildAdminPilotReadiness/);
  assert.match(dashboardSource, /section-pilot-operations-readiness/);
  assert.match(dashboardSource, /button-pilot-operations-users/);
  assert.match(dashboardSource, /button-pilot-operations-locations/);
  assert.match(dashboardSource, /Do not use payment, wallet, payout, or settlement surfaces/);
  assert.doesNotMatch(dashboardSource.match(/title="Pilot Operations Readiness"[\s\S]*?\{trustReportLoading/)?.[0] || "", /apiRequest\("(?:POST|PUT|PATCH|DELETE)/);
  assert.match(routeSource, /hasAgreedToTerms: d\.hasAgreedToTerms/);
});
