import assert from "node:assert/strict";
import test from "node:test";

import { buildAdminPlatformGrowth, buildRegistrationBuckets } from "../client/src/lib/adminPlatformGrowth";

const now = new Date(2026, 6, 13, 16, 0, 0);

test("platform growth counts roles, pending owner approvals, and independent location states", () => {
  const growth = buildAdminPlatformGrowth(
    [
      { id: "driver-new", role: "driver", createdAt: new Date(2026, 6, 12, 10) },
      { id: "driver-existing", role: "driver", createdAt: new Date(2026, 5, 1, 10), isActive: false },
      { id: "owner-new", role: "owner", createdAt: new Date(2026, 6, 13, 9), ownerApproved: false },
      { id: "owner-approved", role: "owner", createdAt: new Date(2026, 5, 1, 10), ownerApproved: true, isActive: true },
      { id: "admin", role: "admin", createdAt: new Date(2026, 6, 13, 9) },
    ],
    [
      { id: "active-visible", isActive: true, isVisible: true },
      { id: "active-hidden", isActive: true, isVisible: false },
      { id: "inactive-visible", isActive: false, isVisible: true },
    ],
    "last_7_days",
    now,
  );

  assert.equal(growth.totalUsers, 5);
  assert.equal(growth.totalDrivers, 2);
  assert.equal(growth.totalOwners, 2);
  assert.equal(growth.activeDrivers, 0);
  assert.equal(growth.activeOwners, 1);
  assert.equal(growth.inactiveDriverAccounts, 1);
  assert.equal(growth.pendingOwnerApprovals, 1);
  assert.equal(growth.newDrivers, 1);
  assert.equal(growth.newOwners, 1);
  assert.equal(growth.totalLocations, 3);
  assert.equal(growth.activeLocations, 2);
  assert.equal(growth.visibleLocations, 2);
});

test("registration cohorts include the selected calendar-day boundaries", () => {
  const buckets = buildRegistrationBuckets(
    [
      { id: "at-start", role: "driver", createdAt: new Date(2026, 6, 7, 0) },
      { id: "today", role: "owner", createdAt: new Date(2026, 6, 13, 12) },
      { id: "before-range", role: "driver", createdAt: new Date(2026, 6, 6, 23, 59, 59) },
    ],
    "last_7_days",
    now,
  );

  assert.equal(buckets.length, 7);
  assert.equal(buckets[0].drivers, 1);
  assert.equal(buckets.at(-1)?.owners, 1);
  assert.equal(buckets.reduce((sum, bucket) => sum + bucket.drivers + bucket.owners, 0), 2);
});

test("missing and invalid creation timestamps are ignored without affecting valid registrations", () => {
  const growth = buildAdminPlatformGrowth(
    [
      { id: "valid-driver", role: "driver", createdAt: new Date(2026, 6, 13, 8) },
      { id: "missing-owner", role: "owner", createdAt: null },
      { id: "invalid-driver", role: "driver", createdAt: "not-a-date" },
      { id: "malformed-owner", role: "owner", createdAt: "2026-99-99" },
    ],
    [],
    "today",
    now,
  );

  assert.equal(growth.totalUsers, 4);
  assert.equal(growth.newDrivers, 1);
  assert.equal(growth.newOwners, 0);
  assert.equal(growth.registrationBuckets.reduce((sum, bucket) => sum + bucket.drivers + bucket.owners, 0), 1);
});

test("today includes local-midnight registrations and excludes the preceding day", () => {
  const growth = buildAdminPlatformGrowth(
    [
      { id: "at-midnight", role: "driver", createdAt: new Date(2026, 6, 13, 0, 0, 0) },
      { id: "later-today", role: "owner", createdAt: new Date(2026, 6, 13, 15, 59, 59) },
      { id: "before-midnight", role: "driver", createdAt: new Date(2026, 6, 12, 23, 59, 59) },
    ],
    [],
    "today",
    now,
  );

  assert.equal(growth.newDrivers, 1);
  assert.equal(growth.newOwners, 1);
  assert.equal(growth.registrationBuckets.length, 1);
});

test("last 30 days includes today and the prior 29 calendar days without an off-by-one", () => {
  const growth = buildAdminPlatformGrowth(
    [
      { id: "range-start", role: "driver", createdAt: new Date(2026, 5, 14, 0, 0, 0) },
      { id: "today", role: "owner", createdAt: new Date(2026, 6, 13, 12) },
      { id: "outside-range", role: "driver", createdAt: new Date(2026, 5, 13, 23, 59, 59) },
    ],
    [],
    "last_30_days",
    now,
  );

  assert.equal(growth.newDrivers, 1);
  assert.equal(growth.newOwners, 1);
  assert.equal(growth.registrationBuckets.length, 30);
  assert.equal(growth.registrationBuckets.reduce((sum, bucket) => sum + bucket.drivers + bucket.owners, 0), 2);
});

test("current month includes the first local day and excludes the preceding month", () => {
  const growth = buildAdminPlatformGrowth(
    [
      { id: "month-start", role: "driver", createdAt: new Date(2026, 6, 1, 0, 0, 0) },
      { id: "in-month", role: "owner", createdAt: new Date(2026, 6, 13, 8) },
      { id: "previous-month", role: "owner", createdAt: new Date(2026, 5, 30, 23, 59, 59) },
    ],
    [],
    "current_month",
    now,
  );

  assert.equal(growth.newDrivers, 1);
  assert.equal(growth.newOwners, 1);
  assert.equal(growth.registrationBuckets.length, 13);
});

test("financial-looking fixture fields do not change operational growth aggregation", () => {
  const baseline = buildAdminPlatformGrowth(
    [
      { id: "driver", role: "driver", createdAt: new Date(2026, 6, 13, 9), isActive: true },
      { id: "owner", role: "owner", createdAt: new Date(2026, 6, 13, 10), ownerApproved: true },
    ],
    [{ id: "location", isActive: true, isVisible: false }],
    "today",
    now,
  );
  const withFinancialLookingFields = buildAdminPlatformGrowth(
    [
      {
        id: "driver", role: "driver", createdAt: new Date(2026, 6, 13, 9), isActive: true,
        walletBalance: "999999", availableBalance: "500", pendingBalance: "499",
        stripeCustomerId: "cus_sensitive", stripeConnectAccountId: "acct_sensitive",
        paymentAmount: "42", processingFee: "3", ownerReceivable: "45",
      } as any,
      {
        id: "owner", role: "owner", createdAt: new Date(2026, 6, 13, 10), ownerApproved: true,
        walletBalance: "1", availableBalance: "2", pendingBalance: "3",
        stripeCustomerId: "cus_other", stripeConnectAccountId: "acct_other",
        paymentAmount: "4", processingFee: "5", ownerReceivable: "6",
      } as any,
    ],
    [{
      id: "location", isActive: true, isVisible: false,
      walletBalance: "100", paymentAmount: "50", processingFee: "2", ownerReceivable: "52",
    } as any],
    "today",
    now,
  );

  assert.deepEqual(withFinancialLookingFields, baseline);
  assert.deepEqual(Object.keys(withFinancialLookingFields).sort(), [
    "activeDrivers", "activeLocations", "activeOwners", "inactiveDriverAccounts", "inactiveOwnerAccounts",
    "newDrivers", "newOwners", "pendingOwnerApprovals", "registrationBuckets", "totalDrivers",
    "totalLocations", "totalOwners", "totalUsers", "visibleLocations",
  ]);
});

test("only owner approval status contributes to pending owner approvals", () => {
  const growth = buildAdminPlatformGrowth(
    [
      { id: "pending-owner", role: "owner", createdAt: now, ownerApproved: false },
      { id: "unknown-owner", role: "owner", createdAt: now, ownerApproved: null },
      { id: "approved-owner", role: "owner", createdAt: now, ownerApproved: true },
      { id: "driver", role: "driver", createdAt: now, ownerApproved: false } as any,
      { id: "admin", role: "admin", createdAt: now, ownerApproved: false } as any,
    ],
    [],
    "today",
    now,
  );

  assert.equal(growth.pendingOwnerApprovals, 2);
});
