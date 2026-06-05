import assert from "node:assert/strict";
import express from "express";
import jwt from "jsonwebtoken";
import { HeadBucketCommand, S3Client } from "@aws-sdk/client-s3";
import Stripe from "stripe";
import { ObjectStorageService } from "../server/objectStorage";
import { processOwnerBillingRun } from "../server/ownerBillingRuns";
import { resolveBillingPolicy } from "../shared/billingPolicy";
import { FEATURE_FLAGS, FEATURE_FLAG_DEFINITIONS } from "../shared/featureFlags";
import { resolveLocationDriverIncentiveTipCents } from "../shared/locationBilling";
import { buildWashoutLedgerRepairPlan } from "../shared/washoutLedgerRepair";
import { buildWashoutBillingVerificationReport } from "../shared/washoutBillingVerification";
import { summarizeWashoutRevenue, summarizeWashoutRevenueFromActivities } from "../shared/washoutRevenue";
import { insertWashoutLocationSchema, updateSystemSettingsSchema } from "../shared/schema";

type TestCase = {
  name: string;
  run: () => Promise<void> | void;
};

const tests: TestCase[] = [];

function test(name: string, run: TestCase["run"]) {
  tests.push({ name, run });
}

process.env.NODE_ENV = process.env.NODE_ENV || "test";
process.env.JWT_SECRET =
  process.env.JWT_SECRET || "test-only-jwt-secret-32-characters-minimum";
process.env.SESSION_SECRET =
  process.env.SESSION_SECRET || "test-only-session-secret";
process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgres://user:pass@127.0.0.1:1/test";
process.env.STRIPE_SECRET_KEY =
  process.env.STRIPE_SECRET_KEY || "sk_test_unit_test_secret";
process.env.PRIVATE_OBJECT_DIR =
  process.env.PRIVATE_OBJECT_DIR || "private";
process.env.PUBLIC_OBJECT_SEARCH_PATHS =
  process.env.PUBLIC_OBJECT_SEARCH_PATHS || "public";

await import("./reports.test.ts");
await import("./owner-access.test.ts");

test("billing policy resolver treats blank and null as defaults and zero as an override", () => {
  const platform = {
    enableAnnualMembership: true,
    enableMonthlyLocationDues: true,
    defaultAnnualMembershipAmount: "15.00",
    defaultMonthlyLocationDuesAmount: "10.00",
    defaultPerWashoutFee: "5.00",
  };

  const defaultPolicy = resolveBillingPolicy(
    platform,
    {
      annualMembershipEnabledOverride: null,
      monthlyLocationDuesEnabledOverride: null,
      membershipFeeOverride: "",
      perWashoutFeeOverride: null,
    },
    {
      monthlyLocationFeeOverride: null,
    },
  );

  assert.equal(defaultPolicy.annualMembershipAmountCents, 1500);
  assert.equal(defaultPolicy.monthlyLocationDuesAmountCents, 1000);
  assert.equal(defaultPolicy.perWashoutFeeCents, 500);

  const zeroPolicy = resolveBillingPolicy(
    platform,
    {
      membershipFeeOverride: 0,
      perWashoutFeeOverride: 0,
    },
    {
      monthlyLocationFeeOverride: 0,
    },
  );

  assert.equal(zeroPolicy.annualMembershipAmountCents, 0);
  assert.equal(zeroPolicy.monthlyLocationDuesAmountCents, 0);
  assert.equal(zeroPolicy.perWashoutFeeCents, 0);

  const positivePolicy = resolveBillingPolicy(
    platform,
    {
      membershipFeeOverride: "12.34",
      perWashoutFeeOverride: "1.25",
    },
    {
      monthlyLocationFeeOverride: 250,
    },
  );

  assert.equal(positivePolicy.annualMembershipAmountCents, 1234);
  assert.equal(positivePolicy.monthlyLocationDuesAmountCents, 250);
  assert.equal(positivePolicy.perWashoutFeeCents, 125);
});

test("driver incentive tip helper treats blank as zero and positive values as cents", () => {
  assert.equal(resolveLocationDriverIncentiveTipCents(undefined), 0);
  assert.equal(resolveLocationDriverIncentiveTipCents(null), 0);
  assert.equal(resolveLocationDriverIncentiveTipCents("0.00"), 0);
  assert.equal(resolveLocationDriverIncentiveTipCents("1.75"), 175);
  assert.equal(resolveLocationDriverIncentiveTipCents(175), 175);
});

test("driver Stripe payouts feature flag is defined and disabled by default", () => {
  const definition = FEATURE_FLAG_DEFINITIONS.find((flag) => flag.key === FEATURE_FLAGS.DRIVER_STRIPE_PAYOUTS);
  assert.ok(definition);
  assert.equal(definition?.enabled, false);
});

test("system settings schema allows zero and rejects negative platform fees", () => {
  assert.equal(updateSystemSettingsSchema.safeParse({ platformWashoutFee: "0.00" }).success, true);
  assert.equal(updateSystemSettingsSchema.safeParse({ platformWashoutFee: "7.25" }).success, true);
  assert.equal(updateSystemSettingsSchema.safeParse({ platformWashoutFee: "-1.00" }).success, false);
});

test("washout location schema rejects negative driver incentive tips", () => {
  const baseLocation = {
    ownerId: "owner_1",
    name: "Site A",
    street: "1 Main St",
    city: "Austin",
    state: "TX",
    zip: "78701",
    latitude: "30.2672",
    longitude: "-97.7431",
    rate: 5,
    driverIncentiveTip: 0,
  };

  const positive = insertWashoutLocationSchema.safeParse({ ...baseLocation, driverIncentiveTip: 1.5 });
  assert.equal(positive.success, true);
  assert.equal(positive.success && positive.data.driverIncentiveTip, 150);

  const zero = insertWashoutLocationSchema.safeParse({ ...baseLocation, driverIncentiveTip: 0 });
  assert.equal(zero.success, true);
  assert.equal(zero.success && zero.data.driverIncentiveTip, 0);

  assert.equal(insertWashoutLocationSchema.safeParse({ ...baseLocation, driverIncentiveTip: -0.01 }).success, false);
});

test("washout revenue summary separates platform revenue, driver tips, and pending washouts", () => {
  const summary = summarizeWashoutRevenue([
    { status: "completed", processingFee: "5.00", tipAmountCents: 200 },
    { status: "posted", processingFee: "5.00", tipAmountCents: 0 },
    { status: "pending", processingFee: "5.00", tipAmountCents: 500 },
    { status: "failed", processingFee: "5.00", tipAmountCents: 100 },
    { status: "refunded", processingFee: "5.00", tipAmountCents: 300 },
    { status: "disputed", processingFee: "5.00", tipAmountCents: 300 },
  ]);

  assert.equal(summary.platformWashoutRevenue, 10);
  assert.equal(summary.driverTipTotal, 2);
  assert.equal(summary.billedWashouts, 2);
  assert.equal(summary.pendingWashouts, 1);
  assert.equal(summary.failedWashouts, 1);
  assert.equal(summary.refundedWashouts, 1);
  assert.equal(summary.disputedWashouts, 1);
});

test("approved washout revenue summary uses stored platform fee cents and excludes driver tips", () => {
  const summary = summarizeWashoutRevenueFromActivities([
    {
      activityStatus: "verified",
      paymentStatus: "completed",
      activityFeeCentsPlatform: 500,
      locationDriverIncentiveTipCents: 0,
      paymentTipAmountCents: 0,
    },
    {
      activityStatus: "approved",
      paymentStatus: "completed",
      activityFeeCentsPlatform: 500,
      locationDriverIncentiveTipCents: 150,
      paymentTipAmountCents: 150,
    },
    {
      activityStatus: "completed",
      paymentStatus: "pending",
      activityFeeCentsPlatform: 500,
      locationDriverIncentiveTipCents: 0,
      paymentTipAmountCents: 0,
    },
    {
      activityStatus: "settled",
      paymentStatus: "completed",
      activityFeeCentsPlatform: 500,
      locationDriverIncentiveTipCents: 0,
      paymentTipAmountCents: 0,
    },
    {
      activityStatus: "pending",
      paymentStatus: "pending",
      activityFeeCentsPlatform: 500,
      locationDriverIncentiveTipCents: 300,
      paymentTipAmountCents: 300,
    },
  ]);

  assert.equal(summary.platformWashoutRevenue, 15);
  assert.equal(summary.platformWashoutPaidRevenue, 10);
  assert.equal(summary.driverTipTotal, 1.5);
  assert.equal(summary.approvedWashouts, 3);
  assert.equal(summary.billedWashouts, 2);
  assert.equal(summary.pendingWashouts, 2);
  assert.equal(summary.failedWashouts, 0);
  assert.equal(summary.refundedWashouts, 0);
  assert.equal(summary.disputedWashouts, 0);
});

test("approved washout revenue summary defaults null platform fee rows to five dollars", () => {
  const summary = summarizeWashoutRevenueFromActivities([
    ...Array.from({ length: 7 }, () => ({
      activityStatus: "verified",
      paymentStatus: "pending",
      activityFeeCentsPlatform: null,
      locationDriverIncentiveTipCents: 0,
      paymentTipAmountCents: 0,
    })),
  ]);

  assert.equal(summary.platformWashoutRevenue, 35);
  assert.equal(summary.platformWashoutPaidRevenue, 0);
  assert.equal(summary.driverTipTotal, 0);
  assert.equal(summary.approvedWashouts, 7);
  assert.equal(summary.billedWashouts, 0);
  assert.equal(summary.pendingWashouts, 7);
});

test("approved washout revenue summary uses explicit five dollar platform fee on seven records", () => {
  const summary = summarizeWashoutRevenueFromActivities([
    ...Array.from({ length: 7 }, () => ({
      activityStatus: "approved",
      paymentStatus: "pending",
      activityFeeCentsPlatform: 500,
      locationDriverIncentiveTipCents: 0,
      paymentTipAmountCents: 0,
    })),
  ]);

  assert.equal(summary.platformWashoutRevenue, 35);
  assert.equal(summary.platformWashoutPaidRevenue, 0);
  assert.equal(summary.driverTipTotal, 0);
  assert.equal(summary.approvedWashouts, 7);
  assert.equal(summary.billedWashouts, 0);
  assert.equal(summary.pendingWashouts, 7);
});

test("washout billing verification report groups statuses and computes owed platform fees", () => {
  const report = buildWashoutBillingVerificationReport([
    {
      activityId: "washout-1",
      ownerId: "owner-1",
      ownerCompanyName: "Alpha Washouts",
      locationId: "location-1",
      locationName: "North Site",
      status: "verified",
      paymentStatus: "pending",
      feeCentsPlatform: null,
      ownerCustomPlatformFeeCents: null,
      driverIncentiveTipCents: 0,
    },
    {
      activityId: "washout-2",
      ownerId: "owner-1",
      ownerCompanyName: "Alpha Washouts",
      locationId: "location-1",
      locationName: "North Site",
      status: "approved",
      paymentStatus: "paid",
      feeCentsPlatform: 500,
      ownerCustomPlatformFeeCents: null,
      driverIncentiveTipCents: 200,
    },
    {
      activityId: "washout-3",
      ownerId: "owner-1",
      ownerCompanyName: "Alpha Washouts",
      locationId: "location-1",
      locationName: "North Site",
      status: "rejected",
      paymentStatus: null,
      feeCentsPlatform: null,
      ownerCustomPlatformFeeCents: null,
      driverIncentiveTipCents: 0,
    },
    {
      activityId: "washout-4",
      ownerId: "owner-1",
      ownerCompanyName: "Alpha Washouts",
      locationId: "location-2",
      locationName: "South Site",
      status: "declined",
      paymentStatus: null,
      feeCentsPlatform: null,
      ownerCustomPlatformFeeCents: null,
      driverIncentiveTipCents: 0,
    },
    {
      activityId: "washout-5",
      ownerId: "owner-2",
      ownerCompanyName: "Bravo Washouts",
      locationId: "location-3",
      locationName: "West Site",
      status: "cancelled",
      paymentStatus: null,
      feeCentsPlatform: null,
      ownerCustomPlatformFeeCents: null,
      driverIncentiveTipCents: 0,
    },
    {
      activityId: "washout-6",
      ownerId: "owner-2",
      ownerCompanyName: "Bravo Washouts",
      locationId: "location-3",
      locationName: "West Site",
      status: "pending_owner_approval",
      paymentStatus: "pending",
      feeCentsPlatform: null,
      ownerCustomPlatformFeeCents: null,
      driverIncentiveTipCents: 0,
    },
    {
      activityId: "washout-7",
      ownerId: "owner-2",
      ownerCompanyName: "Bravo Washouts",
      locationId: "location-4",
      locationName: "East Site",
      status: "photo_pending",
      paymentStatus: "pending",
      feeCentsPlatform: null,
      ownerCustomPlatformFeeCents: null,
      driverIncentiveTipCents: 0,
    },
  ]);

  assert.equal(report.totalWashouts, 7);
  assert.equal(report.approvedWashouts, 2);
  assert.equal(report.alreadyBilledWashouts, 1);
  assert.equal(report.unbilledApprovedWashouts, 1);
  assert.equal(report.declinedWashouts, 1);
  assert.equal(report.rejectedWashouts, 1);
  assert.equal(report.cancelledWashouts, 1);
  assert.equal(report.pendingWashouts, 1);
  assert.equal(report.needsReviewWashouts, 1);
  assert.equal(report.platformFeeReceivableCents, 1000);
  assert.equal(report.platformFeeOwedCents, 500);
  assert.equal(report.platformFeeBilledCents, 500);
  assert.equal(report.driverIncentiveTipTotalCents, 200);
  assert.deepEqual(report.washoutIdsByStatus.verified, ["washout-1"]);
  assert.deepEqual(report.washoutIdsByStatus.approved, ["washout-2"]);
  assert.equal(report.breakdownByOwnerLocation.length, 4);
  assert.equal(report.breakdownByOwnerLocation[0].ownerCompanyName, "Alpha Washouts");
  assert.equal(report.breakdownByOwnerLocation[0].platformFeeReceivableCents, 1000);
});

test("washout ledger repair plan backfills missing platform fees and lottery tickets idempotently", () => {
  const firstPlan = buildWashoutLedgerRepairPlan([
    {
      activityId: "activity-1",
      driverId: "driver-1",
      ownerId: "owner-1",
      locationId: "location-1",
      status: "verified",
      serviceType: "washout",
      feeCentsPlatform: 0,
      platformFeeCents: null,
      lotteryEntryExists: false,
    },
    {
      activityId: "activity-2",
      driverId: "driver-2",
      ownerId: "owner-1",
      locationId: "location-2",
      status: "approved",
      serviceType: "washout",
      feeCentsPlatform: 500,
      platformFeeCents: null,
      lotteryEntryExists: true,
    },
    {
      activityId: "activity-3",
      driverId: "driver-3",
      ownerId: "owner-1",
      locationId: "location-3",
      status: "pending",
      serviceType: "washout",
      feeCentsPlatform: 0,
      platformFeeCents: null,
      lotteryEntryExists: false,
    },
    {
      activityId: "activity-4",
      driverId: "driver-4",
      ownerId: "owner-1",
      locationId: "location-4",
      status: "verified",
      serviceType: "rubble_dropoff",
      feeCentsPlatform: 200,
      platformFeeCents: null,
      lotteryEntryExists: false,
    },
  ], 500);

  assert.equal(firstPlan.scanned, 4);
  assert.deepEqual(firstPlan.platformFeeBackfills, [
    { activityId: "activity-1", platformFeeCents: 500 },
  ]);
  assert.deepEqual(firstPlan.lotteryEntriesToCreate, [
    { activityId: "activity-1", driverId: "driver-1", ownerId: "owner-1" },
  ]);

  const secondPlan = buildWashoutLedgerRepairPlan([
    {
      activityId: "activity-1",
      driverId: "driver-1",
      ownerId: "owner-1",
      locationId: "location-1",
      status: "verified",
      serviceType: "washout",
      feeCentsPlatform: 500,
      platformFeeCents: null,
      lotteryEntryExists: true,
    },
  ], 500);

  assert.equal(secondPlan.platformFeeBackfills.length, 0);
  assert.equal(secondPlan.lotteryEntriesToCreate.length, 0);
});

test("admin custom billing route accepts zero and blank washout rates", async () => {
  const { app, puts } = createRouteRegistry();
  const calls: Array<{ ownerId: string; useCustomBillingModel: boolean; customWashoutRate: string | null }> = [];

  await withPatchedStorage(
    {
      getUser: async () => ({ id: "admin_1", role: "super_admin" }),
      getOwnerById: async () => ({ id: "owner_1", userId: "owner_user_1" }),
      updateOwnerCustomBillingSettings: async (ownerId: string, useCustomBillingModel: boolean, customWashoutRate: string | null) => {
        calls.push({ ownerId, useCustomBillingModel, customWashoutRate });
        return {
          id: "owner_1",
          userId: "owner_user_1",
          useCustomBillingModel,
          customWashoutRate,
        } as any;
      },
      getUserById: async () => ({ id: "owner_user_1", username: "owner", firstName: "Owner", lastName: "One" }),
    },
    async () => {
      const { registerRoutes } = await import("../server/routes");
      await registerRoutes(app as never);
      const route = puts.get("/api/admin/owners/:id/custom-billing");
      assert.equal(typeof route, "function");

      const zeroRes = createResponse();
      await route!(
        {
          params: { id: "owner_1" },
          user: { id: "admin_1" },
          body: { useCustomBillingModel: true, customWashoutRate: "0.00" },
        },
        zeroRes,
      );
      assert.equal(zeroRes.statusCode, 200);
      assert.equal(calls[0].customWashoutRate, "0.00");

      const blankRes = createResponse();
      await route!(
        {
          params: { id: "owner_1" },
          user: { id: "admin_1" },
          body: { useCustomBillingModel: true, customWashoutRate: "" },
        },
        blankRes,
      );
      assert.equal(blankRes.statusCode, 200);
      assert.equal(calls[1].customWashoutRate, null);

      const negativeRes = createResponse();
      await route!(
        {
          params: { id: "owner_1" },
          user: { id: "admin_1" },
          body: { useCustomBillingModel: true, customWashoutRate: "-1.00" },
        },
        negativeRes,
      );
      assert.equal(negativeRes.statusCode, 400);
      assert.match(String((negativeRes.body as { message?: string }).message || ""), /zero or greater/i);
    },
  );
});

test("owner can create location with default driver tip and no monthly billing rollback", async () => {
  const { app, posts } = createRouteRegistry();
  const createdLocations: any[] = [];

  await withPatchedStorage(
    {
      getOwner: async () => ({
        id: "owner_1",
        userId: "owner_user_1",
        companyName: "Alpha Concrete",
        membershipStatus: "active",
        isApproved: false,
        stripePaymentMethodId: "pm_123",
        stripeCustomerId: "cus_123",
        profileCompleted: true,
        locationSetupOverride: false,
        businessLicense: "BL-100",
        taxId: "12-3456789",
      }),
      getUser: async () => ({
        id: "owner_user_1",
        role: "owner",
        firstName: "Olivia",
        lastName: "Owner",
        email: "olivia@example.com",
        phone: "555-0100",
        street: "1 Main St",
        city: "Austin",
        state: "TX",
        zip: "78701",
      }),
      createWashoutLocation: async (locationData: any) => {
        createdLocations.push(locationData);
        return { id: "location_1", ...locationData } as any;
      },
      createFeeLedgerEntry: async () => {
        throw new Error("fee ledger should not be called during owner location creation");
      },
    },
    async () => {
      const { registerRoutes } = await import("../server/routes");
      await registerRoutes(app as never);
      const route = posts.get("/api/owners/locations");
      assert.equal(typeof route, "function");

      const res = createResponse();
      await route!(
        {
          user: { id: "owner_user_1" },
          body: {
            name: "Site A",
            street: "1 Main St",
            city: "Austin",
            state: "TX",
            zip: "78701",
            latitude: "30.2672",
            longitude: "-97.7431",
            rate: 5,
            description: "Test site",
          },
        },
        res,
      );

      assert.equal(res.statusCode, 201);
      assert.equal(createdLocations[0].driverIncentiveTip, 0);
      assert.equal((res.body as { location?: { id?: string } }).location?.id, "location_1");
    },
  );
});

test("auth user response includes derived owner profile completion state", async () => {
  const { app, gets } = createRouteRegistry();

  await withPatchedStorage(
    {
      getUser: async () => ({
        id: "owner_user_1",
        role: "owner",
        firstName: "Olivia",
        lastName: "Owner",
        email: "olivia@example.com",
        phone: "555-0100",
        street: "1 Main St",
        city: "Austin",
        state: "TX",
        zip: "78701",
      }),
      getOwner: async () => ({
        id: "owner_1",
        userId: "owner_user_1",
        companyName: "Alpha Concrete",
        businessLicense: "BL-100",
        taxId: "12-3456789",
        stripePaymentMethodId: "pm_123",
        membershipStatus: "active",
        isApproved: false,
        locationSetupOverride: false,
      }),
    },
    async () => {
      const { registerRoutes } = await import("../server/routes");
      await registerRoutes(app as never);
      const route = gets.get("/api/auth/user");
      assert.equal(typeof route, "function");

      const res = createResponse();
      await route!(
        {
          user: { id: "owner_user_1" },
        },
        res,
      );

      assert.equal(res.statusCode, 200);
      const body = res.body as { roleData?: { profileCompleted?: boolean; missingProfileFields?: string[]; missingProfileFieldLabels?: string[]; canManageLocations?: boolean; paymentMethodOnFile?: boolean } };
      assert.equal(body.roleData?.profileCompleted, true);
      assert.equal(body.roleData?.canManageLocations, true);
      assert.equal(body.roleData?.paymentMethodOnFile, true);
      assert.deepEqual(body.roleData?.missingProfileFields, []);
    },
  );
});

test("owner add location returns missing profile fields when blocked", async () => {
  const { app, posts } = createRouteRegistry();

  await withPatchedStorage(
    {
      getOwner: async () => ({
        id: "owner_1",
        userId: "owner_user_1",
        companyName: "",
        businessLicense: "",
        taxId: "",
        stripePaymentMethodId: "pm_123",
        membershipStatus: "active",
        isApproved: false,
        locationSetupOverride: false,
      }),
      getUser: async () => ({
        id: "owner_user_1",
        role: "owner",
        firstName: "",
        lastName: "",
        email: "",
        phone: "",
        street: "",
        city: "",
        state: "",
        zip: "",
      }),
    },
    async () => {
      const { registerRoutes } = await import("../server/routes");
      await registerRoutes(app as never);
      const route = posts.get("/api/owners/locations");
      assert.equal(typeof route, "function");

      const res = createResponse();
      await route!(
        {
          user: { id: "owner_user_1" },
          body: {
            name: "Site A",
            street: "1 Main St",
            city: "Austin",
            state: "TX",
            zip: "78701",
            latitude: "30.2672",
            longitude: "-97.7431",
            rate: 5,
          },
        },
        res,
      );

      assert.equal(res.statusCode, 403);
      const body = res.body as { missingFields?: string[]; missingFieldLabels?: string[]; message?: string };
      assert.ok(Array.isArray(body.missingFields));
      assert.ok(body.missingFields?.includes("firstName"));
      assert.ok(body.missingFields?.includes("companyName"));
      assert.ok(body.missingFieldLabels?.includes("First name"));
      assert.ok(body.missingFieldLabels?.includes("Company name"));
      assert.match(body.message || "", /complete your owner profile/i);
    },
  );
});

test("superadmin can see owner locations and membership status in admin list", async () => {
  const { app, gets } = createRouteRegistry();

  await withPatchedStorage(
    {
      getUser: async () => ({
        id: "admin_1",
        role: "super_admin",
      }),
      getAllLocations: async () => ([
        {
          id: "location_1",
          ownerId: "owner_1",
          name: "Site A",
          street: "1 Main St",
          city: "Austin",
          state: "TX",
          zip: "78701",
          rate: "5.00",
          driverIncentiveTip: "0.00",
          isActive: true,
          isVisible: true,
          owner: {
            id: "owner_1",
            userId: "owner_user_1",
            companyName: "Alpha Concrete",
            isApproved: false,
            membershipStatus: "active",
            dashboardAccessAllowed: true,
            user: {
              id: "owner_user_1",
              firstName: "Olivia",
              lastName: "Owner",
              email: "olivia@example.com",
            },
          },
        },
      ]),
    },
    async () => {
      const { registerRoutes } = await import("../server/routes");
      await registerRoutes(app as never);
      const route = gets.get("/api/admin/locations");
      assert.equal(typeof route, "function");

      const res = createResponse();
      await route!(
        {
          user: { id: "admin_1" },
        },
        res,
      );

      assert.equal(res.statusCode, 200);
      const locations = res.body as Array<{ owner?: { membershipStatus?: string } }>;
      assert.equal(locations.length, 1);
      assert.equal(locations[0].owner?.membershipStatus, "active");
    },
  );
});

test("superadmin can update platform fee to five dollars, zero, and rejects negative values", async () => {
  const { app, puts } = createRouteRegistry();
  const updates: Array<string | undefined> = [];

  await withPatchedStorage(
    {
      getUser: async () => ({ id: "admin_1", role: "super_admin" }),
      getSystemSettings: async () => ({
        id: "settings_1",
        automaticTaxEnabled: false,
        platformWashoutFee: "5.00",
        updatedAt: new Date(),
        updatedBy: "admin_1",
      }),
      updateSystemSettings: async (settings: any, updatedBy: string) => {
        updates.push(settings.platformWashoutFee);
        return {
          id: "settings_1",
          automaticTaxEnabled: settings.automaticTaxEnabled ?? false,
          platformWashoutFee: settings.platformWashoutFee ?? "5.00",
          updatedAt: new Date(),
          updatedBy,
        } as any;
      },
    },
    async () => {
      const { registerRoutes } = await import("../server/routes");
      await registerRoutes(app as never);
      const route = puts.get("/api/admin/settings");
      assert.equal(typeof route, "function");

      const fiveRes = createResponse();
      await route!(
        {
          user: { id: "admin_1" },
          body: { platformWashoutFee: "5.00" },
        },
        fiveRes,
      );
      assert.equal(fiveRes.statusCode, 200);
      assert.equal(updates[0], "5.00");

      const zeroRes = createResponse();
      await route!(
        {
          user: { id: "admin_1" },
          body: { platformWashoutFee: "0.00" },
        },
        zeroRes,
      );
      assert.equal(zeroRes.statusCode, 200);
      assert.equal(updates[1], "0.00");

      const negativeRes = createResponse();
      await route!(
        {
          user: { id: "admin_1" },
          body: { platformWashoutFee: "-1.00" },
        },
        negativeRes,
      );
      assert.equal(negativeRes.statusCode, 400);
      assert.match(String((negativeRes.body as { message?: string }).message || ""), /zero or greater/i);
    },
  );
});

function createResponse() {
  return {
    statusCode: 200,
    body: undefined as unknown,
    headers: {} as Record<string, string>,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
    redirect(statusOrUrl: number | string, url?: string) {
      if (typeof statusOrUrl === "number") {
        this.statusCode = statusOrUrl;
        this.headers.location = url || "";
      } else {
        this.statusCode = 302;
        this.headers.location = statusOrUrl;
      }
      return this;
    },
    set(headers: Record<string, string>) {
      this.headers = { ...this.headers, ...headers };
      return this;
    },
    sendStatus(code: number) {
      this.statusCode = code;
      this.body = code;
      return this;
    },
  };
}

function createRouteRegistry() {
  const posts = new Map<string, Function>();
  const gets = new Map<string, Function>();
  const puts = new Map<string, Function>();
  const deletes = new Map<string, Function>();
  const patches = new Map<string, Function>();
  const app = {
    get(path: string, ...handlers: Function[]) {
      gets.set(path, handlers[handlers.length - 1]);
    },
    post(path: string, ...handlers: Function[]) {
      posts.set(path, handlers[handlers.length - 1]);
    },
    put(path: string, ...handlers: Function[]) {
      puts.set(path, handlers[handlers.length - 1]);
    },
    delete(path: string, ...handlers: Function[]) {
      deletes.set(path, handlers[handlers.length - 1]);
    },
    patch(path: string, ...handlers: Function[]) {
      patches.set(path, handlers[handlers.length - 1]);
    },
    use() {},
  };

  return { app, posts, gets, puts, deletes, patches };
}

async function withPatchedStorage(
  patch: Record<string, unknown>,
  run: () => Promise<void>,
) {
  const { storage } = await import("../server/storage");
  const original = new Map<string, unknown>();

  for (const [key, value] of Object.entries(patch)) {
    original.set(key, storage[key]);
    storage[key] = value;
  }

  try {
    await run();
  } finally {
    for (const [key, value] of original.entries()) {
      storage[key] = value;
    }
  }
}

async function withPatchedStripe(
  patch: Record<string, unknown>,
  run: () => Promise<void>,
) {
  const stripeService = await import("../server/stripeService");
  const stripeObject = stripeService.stripe as unknown as Record<string, unknown>;
  const original = new Map<string, unknown>();

  for (const [key, value] of Object.entries(patch)) {
    original.set(key, stripeObject[key]);
    stripeObject[key] = value;
  }

  try {
    await run();
  } finally {
    for (const [key, value] of original.entries()) {
      stripeObject[key] = value;
    }
  }
}

function createOwnerBillingRunFixture(params: {
  ownerId?: string;
  ownerCompanyName?: string;
  ownerUsername?: string;
  ownerStripeCustomerId?: string | null;
  ownerStripePaymentMethodId?: string | null;
  ownerUserStripeCustomerId?: string | null;
  ownerUserStripePaymentMethodId?: string | null;
  ownerCustomPlatformFee?: string | number | null;
  billingCadence?: string;
  billingCutoffTime?: string;
  billingTimezone?: string;
  billingDayOfWeek?: number;
  payments: Array<Record<string, unknown>>;
  approvedWashouts?: Array<Record<string, unknown>>;
  stripeMode?: "succeeded" | "processing" | "throw";
}) {
  const ownerId = params.ownerId || "owner_1";
  const owner = {
    id: ownerId,
    userId: "user_owner_1",
    companyName: params.ownerCompanyName || "Owner Co",
    customPlatformFee: Object.prototype.hasOwnProperty.call(params, "ownerCustomPlatformFee")
      ? params.ownerCustomPlatformFee
      : null,
    stripeCustomerId: Object.prototype.hasOwnProperty.call(params, "ownerStripeCustomerId")
      ? params.ownerStripeCustomerId
      : null,
    stripePaymentMethodId: Object.prototype.hasOwnProperty.call(params, "ownerStripePaymentMethodId")
      ? params.ownerStripePaymentMethodId
      : "pm_owner_1",
    billingCutoffTime: params.billingCutoffTime || "23:59:00",
    billingTimezone: params.billingTimezone || "America/Chicago",
    billingDayOfWeek: params.billingDayOfWeek ?? 1,
  };
  const ownerUser = {
    id: "user_owner_1",
    username: params.ownerUsername || "owner1",
    firstName: "Owner",
    lastName: "One",
    stripePaymentMethodId: Object.prototype.hasOwnProperty.call(params, "ownerUserStripePaymentMethodId")
      ? params.ownerUserStripePaymentMethodId
      : (Object.prototype.hasOwnProperty.call(params, "ownerStripePaymentMethodId")
        ? params.ownerStripePaymentMethodId
        : "pm_owner_1"),
    stripeCustomerId: Object.prototype.hasOwnProperty.call(params, "ownerUserStripeCustomerId")
      ? params.ownerUserStripeCustomerId
      : (Object.prototype.hasOwnProperty.call(params, "ownerStripeCustomerId")
        ? params.ownerStripeCustomerId
        : "cus_owner_1"),
  };

  let batch: Record<string, unknown> | null = null;
  let chargeCount = 0;
  let lastIntent: Record<string, unknown> | null = null;
  let lastIntentOptions: Record<string, unknown> | null = null;
  let payments = params.payments.map((payment, index) => ({
    id: payment.id || `payment_${index + 1}`,
    ownerId,
    driverId: payment.driverId || `driver_${index + 1}`,
    activityId: payment.activityId || `activity_${index + 1}`,
    amount: payment.amount || "10.00",
    processingFee: payment.processingFee || "5.00",
    washoutServiceFee: payment.washoutServiceFee || "0.00",
    tipAmountCents: payment.tipAmountCents ?? Math.round(Number(payment.washoutServiceFee || 0) * 100),
    status: payment.status || "pending",
    batchId: payment.batchId ?? null,
    businessDate: payment.businessDate || "2026-05-28",
    createdAt: payment.createdAt || new Date("2026-05-28T12:00:00Z"),
    activity: payment.activity || { id: payment.activityId || `activity_${index + 1}` },
    driver: payment.driver || {
      id: payment.driverId || `driver_${index + 1}`,
      user: {
        id: `driver_user_${index + 1}`,
        username: `driver${index + 1}`,
        firstName: "Driver",
        lastName: String(index + 1),
        stripeConnectAccountId: payment.stripeConnectAccountId ?? "acct_driver_1",
      },
    },
  }));
  let approvedWashouts = (params.approvedWashouts || params.payments).map((row, index) => ({
    activityId: String(row.activityId || `activity_${index + 1}`),
    ownerId,
    driverId: String(row.driverId || `driver_${index + 1}`),
    locationId: String(row.locationId || `location_${index + 1}`),
    activityStatus: String(row.activityStatus || "verified"),
    activityFeeCentsPlatform: row.activityFeeCentsPlatform === undefined || row.activityFeeCentsPlatform === null
      ? null
      : Number(row.activityFeeCentsPlatform),
    locationDriverIncentiveTip: row.locationDriverIncentiveTip === undefined || row.locationDriverIncentiveTip === null
      ? 0
      : Number(row.locationDriverIncentiveTip),
    verifiedAt: row.verifiedAt || new Date("2026-05-28T12:00:00Z"),
    createdAt: row.createdAt || new Date("2026-05-28T12:00:00Z"),
  }));

  const storage = {
    getOwnerById: async (id: string) => (id === ownerId ? owner : undefined),
    getUser: async (id: string) => (id === owner.userId ? ownerUser : undefined),
    getAllOwnersBillingSettings: async () => [
      {
        ownerId,
        companyName: owner.companyName || ownerUser.username,
        username: ownerUser.username,
        billingCadence: params.billingCadence || "weekly",
        billingCutoffTime: owner.billingCutoffTime,
        billingTimezone: owner.billingTimezone,
        billingDayOfWeek: owner.billingDayOfWeek,
      },
    ],
    getPendingPaymentsForOwnerBilling: async (_ownerId: string, startDate?: Date, endDate?: Date) => {
      const startKey = startDate ? startDate.toISOString().split("T")[0] : undefined;
      const endKey = endDate ? endDate.toISOString().split("T")[0] : undefined;
      return payments.filter((payment) => {
        if (payment.ownerId !== ownerId) return false;
        if (payment.status !== "pending") return false;
        if (payment.batchId) return false;
        if (startKey && String(payment.businessDate) < startKey) return false;
        if (endKey && String(payment.businessDate) > endKey) return false;
        return true;
      }) as any;
    },
    getApprovedWashoutsForOwnerBilling: async (_ownerId: string, startDate?: Date, endDate?: Date) => {
      const startKey = startDate ? startDate.toISOString().split("T")[0] : undefined;
      const endKey = endDate ? endDate.toISOString().split("T")[0] : undefined;
      return approvedWashouts.filter((row) => {
        if (row.ownerId !== ownerId) return false;
        if (!["verified", "approved", "completed"].includes(String(row.activityStatus || "").toLowerCase())) return false;
        const rowDate = row.verifiedAt || row.createdAt;
        const rowKey = rowDate ? new Date(rowDate as string | Date).toISOString().split("T")[0] : "";
        if (startKey && rowKey < startKey) return false;
        if (endKey && rowKey > endKey) return false;
        return true;
      }) as any;
    },
    getBillingBatch: async (id: string) => batch?.id === id ? batch : undefined,
    getBillingBatchByOwnerAndDate: async (id: string, businessDate: string) => {
      if (!batch) return undefined;
      return batch.ownerId === id && batch.businessDate === businessDate ? batch : undefined;
    },
    createBillingBatch: async (input: Record<string, unknown>) => {
      batch = {
        id: batch?.id || "batch_1",
        stripePaymentIntentId: batch?.stripePaymentIntentId || null,
        failureReason: batch?.failureReason || null,
        completedAt: batch?.completedAt || null,
        processingStartedAt: batch?.processingStartedAt || null,
        retryCount: batch?.retryCount || 0,
        ...input,
      };
      return batch as any;
    },
    assignPaymentsToBatch: async (paymentIds: string[], batchId: string, businessDate: string) => {
      payments = payments.map((payment) => paymentIds.includes(String(payment.id)) ? {
        ...payment,
        batchId,
        businessDate,
      } : payment);
    },
    getPaymentsByBatchId: async (batchId: string) => {
      return payments.filter((payment) => payment.batchId === batchId).map((payment) => ({
        ...payment,
        activity: payment.activity,
        driver: payment.driver,
      })) as any;
    },
    updateBillingBatchStatus: async (batchId: string, status: string, stripePaymentIntentId?: string, failureReason?: string) => {
      batch = {
        ...(batch || { id: batchId }),
        id: batchId,
        status,
        stripePaymentIntentId: stripePaymentIntentId || batch?.stripePaymentIntentId || null,
        failureReason: failureReason || null,
        completedAt: status === "completed" ? new Date("2026-05-28T14:00:00Z") : batch?.completedAt || null,
        updatedAt: new Date("2026-05-28T14:00:00Z"),
      };
      if (status === "completed") {
        payments = payments.map((payment) => payment.batchId === batchId ? {
          ...payment,
          status: "completed",
          stripePaymentIntentId: stripePaymentIntentId || payment.stripePaymentIntentId || null,
          paidAt: new Date("2026-05-28T14:00:00Z"),
        } : payment);
      }
      return batch as any;
    },
    updateBillingBatchProcessing: async (batchId: string, totalAmount: string, totalFees: string, paymentCount: number, stripePaymentIntentId?: string) => {
      batch = {
        ...(batch || { id: batchId }),
        id: batchId,
        totalAmount,
        totalFees,
        paymentCount,
        status: "processing",
        processingStartedAt: new Date("2026-05-28T13:00:00Z"),
        stripePaymentIntentId: stripePaymentIntentId || batch?.stripePaymentIntentId || null,
      };
      return batch as any;
    },
    updateBillingBatchMetadata: async (batchId: string, metadataPatch: Record<string, unknown>) => {
      batch = {
        ...(batch || { id: batchId }),
        id: batchId,
        metadata: {
          ...(typeof batch?.metadata === "object" && batch?.metadata ? batch.metadata : {}),
          ...metadataPatch,
        },
      };
      return batch as any;
    },
    markBillingBatchCompleted: async (batchId: string) => {
      batch = {
        ...(batch || { id: batchId }),
        id: batchId,
        status: "completed",
        completedAt: new Date("2026-05-28T14:00:00Z"),
      };
      return batch as any;
    },
    completeBatchPayment: async (batchId: string, stripePaymentIntentId: string) => {
      batch = {
        ...(batch || { id: batchId }),
        id: batchId,
        status: "completed",
        stripePaymentIntentId,
        completedAt: new Date("2026-05-28T14:00:00Z"),
      };
    },
    markBillingBatchFailed: async (batchId: string, failureReason: string) => {
      batch = {
        ...(batch || { id: batchId }),
        id: batchId,
        status: "failed",
        failureReason,
      };
    },
  } as const;

  const stripeClient = params.stripeMode
    ? {
        paymentIntents: {
          create: async (intent: Record<string, unknown>, options?: Record<string, unknown>) => {
            chargeCount++;
            lastIntent = intent;
            lastIntentOptions = options || null;
            if (params.stripeMode === "throw") {
              throw new Error("Stripe charge failed");
            }
            return {
              id: `pi_${chargeCount}`,
              status: params.stripeMode,
              amount: intent.amount,
              latest_charge: `ch_${chargeCount}`,
            };
          },
        },
      }
    : null;

  return {
    storage: storage as any,
    stripeClient: stripeClient as any,
    getBatch: () => batch,
    getChargeCount: () => chargeCount,
    getLastIntent: () => lastIntent,
    getLastIntentOptions: () => lastIntentOptions,
    setApprovedWashouts: (nextApprovedWashouts: typeof approvedWashouts) => {
      approvedWashouts = nextApprovedWashouts.map((row, index) => ({
        activityId: String(row.activityId || `activity_${index + 1}`),
        ownerId,
        driverId: String(row.driverId || `driver_${index + 1}`),
        locationId: String(row.locationId || `location_${index + 1}`),
        activityStatus: String(row.activityStatus || "verified"),
        activityFeeCentsPlatform: row.activityFeeCentsPlatform === undefined || row.activityFeeCentsPlatform === null
          ? null
          : Number(row.activityFeeCentsPlatform),
        locationDriverIncentiveTip: row.locationDriverIncentiveTip === undefined || row.locationDriverIncentiveTip === null
          ? 0
          : Number(row.locationDriverIncentiveTip),
        verifiedAt: row.verifiedAt || new Date("2026-05-28T12:00:00Z"),
        createdAt: row.createdAt || new Date("2026-05-28T12:00:00Z"),
      })) as typeof approvedWashouts;
    },
    setPaymentsStatus: (status: string) => {
      payments = payments.map((payment) => ({ ...payment, status }));
    },
    getPayments: () => payments,
  };
}

function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: "user_1",
    username: "testuser",
    email: "test@example.com",
    passwordHash: "hashed-password",
    firstName: "Test",
    lastName: "User",
    phone: "555-0100",
    street: "1 Test Way",
    city: "Testville",
    state: "TX",
    zip: "75001",
    role: "driver",
    isActive: true,
    ...overrides,
  };
}

test("public registration rejects privileged roles", async () => {
  const { setupAuth } = await import("../server/tokenAuth");
  const { app, posts } = createRouteRegistry();
  await setupAuth(app as never);

  const register = posts.get("/api/register");
  assert.equal(typeof register, "function");

  let storageTouched = false;
  await withPatchedStorage(
    {
      getUserByUsernameInsensitive: async () => {
        storageTouched = true;
        return undefined;
      },
      getUserByEmail: async () => {
        storageTouched = true;
        return undefined;
      },
      createUser: async () => {
        storageTouched = true;
        return makeUser();
      },
    },
    async () => {
      for (const role of [undefined, "admin", "super_admin"]) {
        const res = createResponse();
        await register!(
          {
            body: {
              username: "blocked",
              email: "blocked@example.com",
              password: "password",
              firstName: "Blocked",
              lastName: "User",
              role,
            },
          },
          res,
        );

        assert.equal(res.statusCode, 400);
        assert.match((res.body as { message: string }).message, /Invalid role/);
      }
    },
  );

  assert.equal(storageTouched, false);
});

test("public registration allows driver and owner profiles only", async () => {
  const { setupAuth } = await import("../server/tokenAuth");
  const { app, posts } = createRouteRegistry();
  await setupAuth(app as never);

  const register = posts.get("/api/register");
  assert.equal(typeof register, "function");

  const createdProfiles: Array<{ type: string; userId: string }> = [];

  await withPatchedStorage(
    {
      getUserByUsernameInsensitive: async () => undefined,
      getUserByEmail: async () => undefined,
      createUser: async (userData: Record<string, unknown>) =>
        makeUser({
          id: `user_${userData.role}`,
          username: userData.username,
          email: userData.email,
          firstName: userData.firstName,
          lastName: userData.lastName,
          role: userData.role,
          passwordHash: userData.passwordHash,
        }),
      createDriver: async (driverData: { userId: string }) => {
        createdProfiles.push({ type: "driver", userId: driverData.userId });
        return { id: "driver_1", ...driverData };
      },
      createOwner: async (ownerData: { userId: string }) => {
        createdProfiles.push({ type: "owner", userId: ownerData.userId });
        return { id: "owner_1", ...ownerData };
      },
    },
    async () => {
      for (const role of ["driver", "owner"]) {
        const res = createResponse();
        await register!(
          {
            body: {
              username: `${role}user`,
              email: `${role}@example.com`,
              password: "password",
              firstName: "Allowed",
              lastName: "User",
              role,
            },
          },
          res,
        );

        assert.equal(res.statusCode, 200);
        assert.equal((res.body as { user: { role: string } }).user.role, role);
        assert.equal(
          "passwordHash" in (res.body as { user: Record<string, unknown> }).user,
          false,
        );
        assert.equal(typeof (res.body as { token: string }).token, "string");
      }
    },
  );

  assert.deepEqual(createdProfiles, [
    { type: "driver", userId: "user_driver" },
    { type: "owner", userId: "user_owner" },
  ]);
});

test("JWT auth rejects inactive users and strips password hashes", async () => {
  const { isAuthenticated } = await import("../server/tokenAuth");
  const token = jwt.sign(
    { userId: "user_1", username: "testuser" },
    process.env.JWT_SECRET!,
  );

  await withPatchedStorage(
    {
      getUserById: async () => makeUser({ isActive: false }),
    },
    async () => {
      const req = {
        method: "GET",
        path: "/api/me",
        headers: { authorization: `Bearer ${token}` },
      };
      const res = createResponse();
      let nextCalled = false;

      await isAuthenticated(req as never, res as never, () => {
        nextCalled = true;
      });

      assert.equal(res.statusCode, 403);
      assert.equal((res.body as { message: string }).message, "Account is inactive");
      assert.equal(nextCalled, false);
    },
  );

  await withPatchedStorage(
    {
      getUserById: async () => makeUser({ role: "owner" }),
    },
    async () => {
      const req = {
        method: "GET",
        path: "/api/me",
        headers: { authorization: `Bearer ${token}` },
        user: undefined as unknown,
      };
      const res = createResponse();
      let nextCalled = false;

      await isAuthenticated(req as never, res as never, () => {
        nextCalled = true;
      });

      assert.equal(nextCalled, true);
      assert.equal(res.statusCode, 200);
      assert.equal((req.user as { role: string }).role, "owner");
      assert.equal(
        "passwordHash" in (req.user as Record<string, unknown>),
        false,
      );
    },
  );
});

class FakeObjectFile {
  public metadata: Record<string, string> = {};
  public existsValue = true;

  constructor(public readonly name: string) {}

  async exists() {
    return [this.existsValue];
  }

  async getMetadata() {
    return [{ metadata: this.metadata }];
  }

  async setMetadata(input: { metadata: Record<string, string> }) {
    this.metadata = { ...this.metadata, ...input.metadata };
  }
}

test("object ACL policy metadata can be set and read", async () => {
  const { getObjectAclPolicy, setObjectAclPolicy } = await import(
    "../server/objectAcl"
  );
  const file = new FakeObjectFile("photos/test.jpg");
  const policy = {
    owner: "owner_1",
    visibility: "private" as const,
  };

  await setObjectAclPolicy(file as never, policy);

  assert.deepEqual(await getObjectAclPolicy(file as never), policy);
  assert.ok(file.metadata["custom:aclPolicy"]);

  const missing = new FakeObjectFile("photos/missing.jpg");
  missing.existsValue = false;
  await assert.rejects(
    () => setObjectAclPolicy(missing as never, policy),
    /Object not found: photos\/missing\.jpg/,
  );
});

test("object ACL enforces public read, private owner access, and default deny", async () => {
  const { ObjectPermission, canAccessObject } = await import("../server/objectAcl");

  const noPolicy = new FakeObjectFile("photos/no-policy.jpg");
  assert.equal(
    await canAccessObject({
      objectFile: noPolicy as never,
      requestedPermission: ObjectPermission.READ,
    }),
    false,
  );

  const publicFile = new FakeObjectFile("photos/public.jpg");
  publicFile.metadata["custom:aclPolicy"] = JSON.stringify({
    owner: "owner_1",
    visibility: "public",
  });

  assert.equal(
    await canAccessObject({
      objectFile: publicFile as never,
      requestedPermission: ObjectPermission.READ,
    }),
    true,
  );
  assert.equal(
    await canAccessObject({
      objectFile: publicFile as never,
      requestedPermission: ObjectPermission.WRITE,
    }),
    false,
  );

  const privateFile = new FakeObjectFile("photos/private.jpg");
  privateFile.metadata["custom:aclPolicy"] = JSON.stringify({
    owner: "owner_1",
    visibility: "private",
  });

  assert.equal(
    await canAccessObject({
      userId: "owner_1",
      objectFile: privateFile as never,
      requestedPermission: ObjectPermission.WRITE,
    }),
    true,
  );
  assert.equal(
    await canAccessObject({
      userId: "other_user",
      objectFile: privateFile as never,
      requestedPermission: ObjectPermission.READ,
    }),
    false,
  );

  assert.equal(
    await canAccessObject({
      userRole: "admin",
      objectFile: noPolicy as never,
      requestedPermission: ObjectPermission.READ,
    }),
    true,
  );
});

test("photo upload storage selection requires complete S3 config", async () => {
  const { getUploadStorageSelection } = await import("../server/objectStorage");
  const originalEnv = {
    S3_ENDPOINT: process.env.S3_ENDPOINT,
    S3_REGION: process.env.S3_REGION,
    S3_ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID,
    S3_SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY,
    S3_BUCKET: process.env.S3_BUCKET,
    PRIVATE_OBJECT_DIR: process.env.PRIVATE_OBJECT_DIR,
  };

  process.env.S3_ENDPOINT = "https://example.r2.cloudflarestorage.com";
  process.env.S3_REGION = "auto";
  process.env.S3_ACCESS_KEY_ID = "test-access-key";
  process.env.S3_SECRET_ACCESS_KEY = "test-secret-key";
  process.env.S3_BUCKET = "test-bucket";
  process.env.PRIVATE_OBJECT_DIR = "private";

  assert.deepEqual(getUploadStorageSelection(), {
    provider: "s3",
    bucket: "test-bucket",
    s3EndpointPresent: true,
  });

  delete process.env.S3_BUCKET;
  assert.throws(
    () => getUploadStorageSelection(),
    /Missing object storage env vars: S3_BUCKET/,
  );

  if (originalEnv.S3_ENDPOINT === undefined) delete process.env.S3_ENDPOINT;
  else process.env.S3_ENDPOINT = originalEnv.S3_ENDPOINT;
  if (originalEnv.S3_REGION === undefined) delete process.env.S3_REGION;
  else process.env.S3_REGION = originalEnv.S3_REGION;
  if (originalEnv.S3_ACCESS_KEY_ID === undefined) delete process.env.S3_ACCESS_KEY_ID;
  else process.env.S3_ACCESS_KEY_ID = originalEnv.S3_ACCESS_KEY_ID;
  if (originalEnv.S3_SECRET_ACCESS_KEY === undefined) delete process.env.S3_SECRET_ACCESS_KEY;
  else process.env.S3_SECRET_ACCESS_KEY = originalEnv.S3_SECRET_ACCESS_KEY;
  if (originalEnv.S3_BUCKET === undefined) delete process.env.S3_BUCKET;
  else process.env.S3_BUCKET = originalEnv.S3_BUCKET;
});

test("photo upload route uses S3 provider when S3 env vars are present", async () => {
  const originalEnv = {
    S3_ENDPOINT: process.env.S3_ENDPOINT,
    S3_REGION: process.env.S3_REGION,
    S3_ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID,
    S3_SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY,
    S3_BUCKET: process.env.S3_BUCKET,
    PRIVATE_OBJECT_DIR: process.env.PRIVATE_OBJECT_DIR,
  };
  const originalSend = S3Client.prototype.send;
  const originalLog = console.log;
  const logs: string[] = [];

  process.env.S3_ENDPOINT = "https://example.r2.cloudflarestorage.com";
  process.env.S3_REGION = "auto";
  process.env.S3_ACCESS_KEY_ID = "test-access-key";
  process.env.S3_SECRET_ACCESS_KEY = "test-secret-key";
  process.env.S3_BUCKET = "test-bucket";
  process.env.PRIVATE_OBJECT_DIR = "private";

  S3Client.prototype.send = (async (command: unknown) => {
    if (command instanceof HeadBucketCommand) {
      return {};
    }
    throw new Error(`Unexpected S3 command in test: ${command?.constructor?.name || "unknown"}`);
  }) as typeof S3Client.prototype.send;

  console.log = (...args: unknown[]) => {
    logs.push(args.map((value) => String(value)).join(" "));
  };

  try {
    const expressApp = express();
    const routes = new Map<string, Function>();
    const originalPost = expressApp.post.bind(expressApp);
    (expressApp as typeof expressApp & { post: typeof expressApp.post }).post = ((path: string, ...handlers: Function[]) => {
      routes.set(path, handlers[handlers.length - 1]);
      return originalPost(path, ...handlers);
    }) as typeof expressApp.post;

    const { registerRoutes } = await import("../server/routes");
    await registerRoutes(expressApp as never);

    const uploadRoute = routes.get("/api/photos/upload-url");
    assert.equal(typeof uploadRoute, "function");

    const req = {
      body: { contentType: "image/jpeg" },
      user: { id: "driver_1" },
    };
    const res = createResponse();

    await uploadRoute!(req as never, res as never);

    assert.equal(res.statusCode, 200);
    assert.equal(typeof (res.body as { uploadUrl: string }).uploadUrl, "string");
    assert.equal((res.body as { contentType: string }).contentType, "image/jpeg");
    assert.ok(
      logs.some((line) => line.includes("Photo upload provider selected: s3")),
    );
    assert.ok(
      logs.some((line) => line.includes("Signed URL generation succeeded")),
    );
  } finally {
    S3Client.prototype.send = originalSend;
    console.log = originalLog;
    if (originalEnv.S3_ENDPOINT === undefined) delete process.env.S3_ENDPOINT;
    else process.env.S3_ENDPOINT = originalEnv.S3_ENDPOINT;
    if (originalEnv.S3_REGION === undefined) delete process.env.S3_REGION;
    else process.env.S3_REGION = originalEnv.S3_REGION;
    if (originalEnv.S3_ACCESS_KEY_ID === undefined) delete process.env.S3_ACCESS_KEY_ID;
    else process.env.S3_ACCESS_KEY_ID = originalEnv.S3_ACCESS_KEY_ID;
    if (originalEnv.S3_SECRET_ACCESS_KEY === undefined) delete process.env.S3_SECRET_ACCESS_KEY;
    else process.env.S3_SECRET_ACCESS_KEY = originalEnv.S3_SECRET_ACCESS_KEY;
    if (originalEnv.S3_BUCKET === undefined) delete process.env.S3_BUCKET;
    else process.env.S3_BUCKET = originalEnv.S3_BUCKET;
    if (originalEnv.PRIVATE_OBJECT_DIR === undefined) delete process.env.PRIVATE_OBJECT_DIR;
    else process.env.PRIVATE_OBJECT_DIR = originalEnv.PRIVATE_OBJECT_DIR;
  }
});

test("photo upload route rejects unsupported formats and oversized files", async () => {
  const originalEnv = {
    S3_ENDPOINT: process.env.S3_ENDPOINT,
    S3_REGION: process.env.S3_REGION,
    S3_ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID,
    S3_SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY,
    S3_BUCKET: process.env.S3_BUCKET,
    PRIVATE_OBJECT_DIR: process.env.PRIVATE_OBJECT_DIR,
  };
  const originalSend = S3Client.prototype.send;
  process.env.S3_ENDPOINT = "https://example.r2.cloudflarestorage.com";
  process.env.S3_REGION = "auto";
  process.env.S3_ACCESS_KEY_ID = "test-access-key";
  process.env.S3_SECRET_ACCESS_KEY = "test-secret-key";
  process.env.S3_BUCKET = "test-bucket";
  process.env.PRIVATE_OBJECT_DIR = "private";

  S3Client.prototype.send = (async (command: unknown) => {
    if (command instanceof HeadBucketCommand) {
      return {};
    }
    throw new Error(`Unexpected S3 command in test: ${command?.constructor?.name || "unknown"}`);
  }) as typeof S3Client.prototype.send;

  try {
    const expressApp = express();
    const routes = new Map<string, Function>();
    const originalPost = expressApp.post.bind(expressApp);
    (expressApp as typeof expressApp & { post: typeof expressApp.post }).post = ((path: string, ...handlers: Function[]) => {
      routes.set(path, handlers[handlers.length - 1]);
      return originalPost(path, ...handlers);
    }) as typeof expressApp.post;

    const { registerRoutes } = await import("../server/routes");
    await registerRoutes(expressApp as never);

    const uploadRoute = routes.get("/api/photos/upload-url");
    assert.equal(typeof uploadRoute, "function");

    const unsupportedRes = createResponse();
    await uploadRoute!(
      {
        body: { contentType: "image/gif", fileSize: 12345 },
        user: { id: "driver_1" },
      },
      unsupportedRes as never,
    );
    assert.equal(unsupportedRes.statusCode, 400);
    assert.match(
      String((unsupportedRes.body as { message?: string }).message || ""),
      /Unsupported photo format/,
    );

    const oversizedRes = createResponse();
    await uploadRoute!(
      {
        body: { contentType: "image/jpeg", fileSize: 20 * 1024 * 1024 },
        user: { id: "driver_1" },
      },
      oversizedRes as never,
    );
    assert.equal(oversizedRes.statusCode, 400);
    assert.match(
      String((oversizedRes.body as { message?: string }).message || ""),
      /Photo is too large/,
    );
  } finally {
    S3Client.prototype.send = originalSend;
    if (originalEnv.S3_ENDPOINT === undefined) delete process.env.S3_ENDPOINT;
    else process.env.S3_ENDPOINT = originalEnv.S3_ENDPOINT;
    if (originalEnv.S3_REGION === undefined) delete process.env.S3_REGION;
    else process.env.S3_REGION = originalEnv.S3_REGION;
    if (originalEnv.S3_ACCESS_KEY_ID === undefined) delete process.env.S3_ACCESS_KEY_ID;
    else process.env.S3_ACCESS_KEY_ID = originalEnv.S3_ACCESS_KEY_ID;
    if (originalEnv.S3_SECRET_ACCESS_KEY === undefined) delete process.env.S3_SECRET_ACCESS_KEY;
    else process.env.S3_SECRET_ACCESS_KEY = originalEnv.S3_SECRET_ACCESS_KEY;
    if (originalEnv.S3_BUCKET === undefined) delete process.env.S3_BUCKET;
    else process.env.S3_BUCKET = originalEnv.S3_BUCKET;
    if (originalEnv.PRIVATE_OBJECT_DIR === undefined) delete process.env.PRIVATE_OBJECT_DIR;
    else process.env.PRIVATE_OBJECT_DIR = originalEnv.PRIVATE_OBJECT_DIR;
  }
});

test("activity photo route returns signed GET URLs for authorized viewers when S3 is configured", async () => {
  const { app, gets } = createRouteRegistry();
  const originalEnv = {
    S3_ENDPOINT: process.env.S3_ENDPOINT,
    S3_REGION: process.env.S3_REGION,
    S3_ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID,
    S3_SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY,
    S3_BUCKET: process.env.S3_BUCKET,
  };
  const originalSend = S3Client.prototype.send;
  process.env.S3_ENDPOINT = "https://example.r2.cloudflarestorage.com";
  process.env.S3_REGION = "auto";
  process.env.S3_ACCESS_KEY_ID = "test-access-key";
  process.env.S3_SECRET_ACCESS_KEY = "test-secret-key";
  process.env.S3_BUCKET = "test-bucket";

  await withPatchedStorage(
    {
      getWashoutActivity: async () => ({
        id: "activity_1",
        locationId: "location_1",
        driverId: "driver_row_1",
      }),
      getWashoutLocation: async () => ({
        id: "location_1",
        ownerId: "owner_row_1",
      }),
      getOwner: async (userId: string) =>
        userId === "owner_user_1" ? { id: "owner_row_1", userId } : undefined,
      getDriver: async (userId: string) =>
        userId === "driver_user_1" ? { id: "driver_row_1", userId } : undefined,
      getUser: async (userId: string) =>
        userId === "admin_user_1"
          ? makeUser({ id: userId, role: "admin" })
          : makeUser({
              id: userId,
              role: userId === "owner_user_1" ? "owner" : "driver",
            }),
      getPhotosByActivity: async () => [
        {
          id: "photo_1",
          storageKey: "photo-1.jpg",
          uploadedAt: new Date("2025-01-01T00:00:00.000Z"),
          contentType: "image/jpeg",
          imageFingerprint: "ffffffffffffffff",
        },
      ],
      getRecentWashoutPhotoDuplicateCandidates: async () => [
        {
          photoId: "prior_photo_1",
          activityId: "activity_0",
          driverId: "driver_row_0",
          driverName: "Prior Driver",
          locationId: "location_0",
          locationName: "Prior Location",
          priorUploadedAt: "2024-12-01T00:00:00.000Z",
          imageFingerprint: "ffffffffffffffff",
        },
      ],
    },
    async () => {
      S3Client.prototype.send = (async () => ({})) as never;
      const { registerRoutes } = await import("../server/routes");
      await registerRoutes(app as never);
      const route = gets.get("/api/photos/activity/:activityId");
      assert.equal(typeof route, "function");

      const ownerRes = createResponse();
      await route!(
        {
          params: { activityId: "activity_1" },
          user: { id: "owner_user_1", role: "owner" },
        },
        ownerRes,
      );
      assert.equal(ownerRes.statusCode, 200);
      assert.equal((ownerRes.body as { photos: Array<{ duplicateMatches?: unknown }> }).photos[0].duplicateMatches, undefined);
      assert.match(
        (ownerRes.body as { photos: Array<{ url: string }> }).photos[0].url,
        /^https:\/\/example\.r2\.cloudflarestorage\.com/,
      );
      assert.match(
        (ownerRes.body as { photos: Array<{ url: string }> }).photos[0].url,
        /X-Amz-Signature=/,
      );
      assert.match(
        (ownerRes.body as { photos: Array<{ url: string }> }).photos[0].url,
        /X-Amz-Credential=/,
      );

      const adminRes = createResponse();
      await route!(
        {
          params: { activityId: "activity_1" },
          user: { id: "admin_user_1", role: "admin" },
        },
        adminRes,
      );
      assert.equal(adminRes.statusCode, 200);
      assert.equal(
        ((adminRes.body as { photos: Array<{ duplicateMatches: Array<{ confidence: number }> }> }).photos[0].duplicateMatches || []).length,
        1,
      );
      assert.match(
        (adminRes.body as { photos: Array<{ url: string }> }).photos[0].url,
        /^https:\/\/example\.r2\.cloudflarestorage\.com/,
      );
    },
  );

  S3Client.prototype.send = originalSend;
  if (originalEnv.S3_ENDPOINT === undefined) delete process.env.S3_ENDPOINT;
  else process.env.S3_ENDPOINT = originalEnv.S3_ENDPOINT;
  if (originalEnv.S3_REGION === undefined) delete process.env.S3_REGION;
  else process.env.S3_REGION = originalEnv.S3_REGION;
  if (originalEnv.S3_ACCESS_KEY_ID === undefined) delete process.env.S3_ACCESS_KEY_ID;
  else process.env.S3_ACCESS_KEY_ID = originalEnv.S3_ACCESS_KEY_ID;
  if (originalEnv.S3_SECRET_ACCESS_KEY === undefined) delete process.env.S3_SECRET_ACCESS_KEY;
  else process.env.S3_SECRET_ACCESS_KEY = originalEnv.S3_SECRET_ACCESS_KEY;
  if (originalEnv.S3_BUCKET === undefined) delete process.env.S3_BUCKET;
  else process.env.S3_BUCKET = originalEnv.S3_BUCKET;
  if (originalEnv.PRIVATE_OBJECT_DIR === undefined) delete process.env.PRIVATE_OBJECT_DIR;
  else process.env.PRIVATE_OBJECT_DIR = originalEnv.PRIVATE_OBJECT_DIR;
});

test("create-with-photos applies ACL metadata for location owners", async () => {
  const { app, posts } = createRouteRegistry();
  const originalTrySetObjectEntityAclPolicy = ObjectStorageService.prototype.trySetObjectEntityAclPolicy;
  const aclCalls: Array<{ rawPath: string; aclPolicy: { owner: string; visibility: string; aclRules?: Array<{ group: { type: string; id: string }; permission: string }> } }> = [];

  ObjectStorageService.prototype.trySetObjectEntityAclPolicy = (async function (
    this: unknown,
    rawPath: string,
    aclPolicy: { owner: string; visibility: string; aclRules?: Array<{ group: { type: string; id: string }; permission: string }> },
  ) {
    aclCalls.push({ rawPath, aclPolicy });
    return rawPath;
  }) as never;

  try {
    await withPatchedStorage(
      {
        getDriver: async (userId: string) => (userId === "driver_user_1" ? { id: "driver_row_1", userId } : undefined),
        getWashoutLocation: async (locationId: string) =>
          locationId === "location_1"
            ? { id: "location_1", ownerId: "owner_row_1", latitude: "40.000000", longitude: "-100.000000" }
            : undefined,
        getRecentWashoutPhotoDuplicateCandidates: async () => [],
        createWashoutActivityWithPhotos: async (_activity: Record<string, unknown>, photos: Array<Record<string, unknown>>) => ({
          activity: { id: "activity_1", locationId: "location_1" },
          photos: photos.map((photo, index) => ({
            id: `photo_${index + 1}`,
            storageKey: photo.storageKey,
            contentType: photo.contentType,
            uploadedAt: new Date("2025-01-01T00:00:00.000Z"),
          })),
        }),
      },
      async () => {
        const originalPrivateObjectDir = process.env.PRIVATE_OBJECT_DIR;
        process.env.PRIVATE_OBJECT_DIR = "private";
        try {
          const { registerRoutes } = await import("../server/routes");
          await registerRoutes(app as never);
          const route = posts.get("/api/activities/create-with-photos");
          assert.equal(typeof route, "function");

          const res = createResponse();
          await route!(
            {
              user: { id: "driver_user_1", role: "driver" },
              body: {
                activityData: {
                  locationId: "location_1",
                  amount: "4.00",
                  checkInTime: "2025-01-01T00:00:00.000Z",
                  status: "pending",
                },
                photoData: [
                {
                  storageKey: "photo-1.jpg",
                  contentType: "image/jpeg",
                  fileSize: 12345,
                  photoTakenAt: "2025-01-01T00:00:00.000Z",
                  uploadedAt: "2025-01-01T00:05:00.000Z",
                  gpsLatitude: 40,
                  gpsLongitude: -100,
                  imageFingerprint: "0123456789abcdef",
                },
              ],
            },
          },
            res,
          );

          assert.equal(res.statusCode, 200);
          assert.equal(aclCalls.length, 1);
          assert.equal(aclCalls[0].rawPath, "/objects/photos/photo-1.jpg");
          assert.equal(aclCalls[0].aclPolicy.owner, "driver_user_1");
          assert.equal(aclCalls[0].aclPolicy.visibility, "private");
          assert.equal(aclCalls[0].aclPolicy.aclRules?.[0].group.type, "LOCATION_OWNER");
          assert.equal(aclCalls[0].aclPolicy.aclRules?.[0].group.id, "location_1");
          assert.equal(aclCalls[0].aclPolicy.aclRules?.[0].permission, "read");
        } finally {
          if (originalPrivateObjectDir === undefined) delete process.env.PRIVATE_OBJECT_DIR;
          else process.env.PRIVATE_OBJECT_DIR = originalPrivateObjectDir;
        }
      },
    );
  } finally {
    ObjectStorageService.prototype.trySetObjectEntityAclPolicy = originalTrySetObjectEntityAclPolicy;
  }
});

test("create-with-photos rejects missing photo data with 400", async () => {
  const { app, posts } = createRouteRegistry();

  await withPatchedStorage(
    {
      getDriver: async (userId: string) => (userId === "driver_user_1" ? { id: "driver_row_1", userId } : undefined),
      getWashoutLocation: async (locationId: string) =>
        locationId === "location_1"
          ? { id: "location_1", ownerId: "owner_row_1", latitude: "40.000000", longitude: "-100.000000" }
          : undefined,
      getRecentWashoutPhotoDuplicateCandidates: async () => [],
      createWashoutActivityWithPhotos: async () => {
        throw new Error("should not be called");
      },
    },
    async () => {
      const originalPrivateObjectDir = process.env.PRIVATE_OBJECT_DIR;
      process.env.PRIVATE_OBJECT_DIR = "private";
      try {
        const { registerRoutes } = await import("../server/routes");
        await registerRoutes(app as never);
        const route = posts.get("/api/activities/create-with-photos");
        assert.equal(typeof route, "function");

        const res = createResponse();
        await route!(
          {
            user: { id: "driver_user_1", role: "driver" },
            body: {
              activityData: {
                locationId: "location_1",
                amount: "4.00",
                checkInTime: "2025-01-01T00:00:00.000Z",
                status: "pending",
              },
              photoData: [],
            },
          },
          res,
        );

        assert.equal(res.statusCode, 400);
        assert.match(String((res.body as { message?: string }).message || ""), /At least one photo is required/i);
      } finally {
        if (originalPrivateObjectDir === undefined) delete process.env.PRIVATE_OBJECT_DIR;
        else process.env.PRIVATE_OBJECT_DIR = originalPrivateObjectDir;
      }
    },
  );
});

test("create-with-photos rejects invalid status with 400", async () => {
  const { app, posts } = createRouteRegistry();

  await withPatchedStorage(
    {
      getDriver: async (userId: string) => (userId === "driver_user_1" ? { id: "driver_row_1", userId } : undefined),
      getWashoutLocation: async (locationId: string) =>
        locationId === "location_1"
          ? { id: "location_1", ownerId: "owner_row_1", latitude: "40.000000", longitude: "-100.000000" }
          : undefined,
      getRecentWashoutPhotoDuplicateCandidates: async () => [],
      createWashoutActivityWithPhotos: async () => {
        throw new Error("should not be called");
      },
    },
    async () => {
      const originalPrivateObjectDir = process.env.PRIVATE_OBJECT_DIR;
      process.env.PRIVATE_OBJECT_DIR = "private";
      try {
        const { registerRoutes } = await import("../server/routes");
        await registerRoutes(app as never);
        const route = posts.get("/api/activities/create-with-photos");
        assert.equal(typeof route, "function");

        const res = createResponse();
        await route!(
          {
            user: { id: "driver_user_1", role: "driver" },
            body: {
              activityData: {
                locationId: "location_1",
                amount: "4.00",
                checkInTime: "2025-01-01T00:00:00.000Z",
                status: "verified",
              },
              photoData: [
                {
                  storageKey: "photo-1.jpg",
                  contentType: "image/jpeg",
                  fileSize: 12345,
                  photoTakenAt: "2025-01-01T00:00:00.000Z",
                  uploadedAt: "2025-01-01T00:05:00.000Z",
                  gpsLatitude: 40,
                  gpsLongitude: -100,
                  imageFingerprint: "0123456789abcdef",
                },
              ],
            },
          },
          res,
        );

        assert.equal(res.statusCode, 400);
        assert.match(String((res.body as { message?: string }).message || ""), /Checkout must start in pending status/i);
      } finally {
        if (originalPrivateObjectDir === undefined) delete process.env.PRIVATE_OBJECT_DIR;
        else process.env.PRIVATE_OBJECT_DIR = originalPrivateObjectDir;
      }
    },
  );
});

test("create-with-photos rejects missing gps metadata with 400", async () => {
  const { app, posts } = createRouteRegistry();

  await withPatchedStorage(
    {
      getDriver: async (userId: string) => (userId === "driver_user_1" ? { id: "driver_row_1", userId } : undefined),
      getWashoutLocation: async (locationId: string) =>
        locationId === "location_1"
          ? { id: "location_1", ownerId: "owner_row_1", latitude: "40.000000", longitude: "-100.000000" }
          : undefined,
      getRecentWashoutPhotoDuplicateCandidates: async () => [],
      createWashoutActivityWithPhotos: async () => {
        throw new Error("should not be called");
      },
    },
    async () => {
      const originalPrivateObjectDir = process.env.PRIVATE_OBJECT_DIR;
      process.env.PRIVATE_OBJECT_DIR = "private";
      try {
        const { registerRoutes } = await import("../server/routes");
        await registerRoutes(app as never);
        const route = posts.get("/api/activities/create-with-photos");
        assert.equal(typeof route, "function");

        const res = createResponse();
        await route!(
          {
            user: { id: "driver_user_1", role: "driver" },
            body: {
              activityData: {
                locationId: "location_1",
                amount: "4.00",
                checkInTime: "2025-01-01T00:00:00.000Z",
                status: "pending",
              },
              photoData: [
                {
                  storageKey: "photo-1.jpg",
                  contentType: "image/jpeg",
                  fileSize: 12345,
                  photoTakenAt: "2025-01-01T00:00:00.000Z",
                  uploadedAt: "2025-01-01T00:05:00.000Z",
                  gpsLatitude: null,
                  gpsLongitude: null,
                  imageFingerprint: "0123456789abcdef",
                },
              ],
            },
          },
          res,
        );

        assert.equal(res.statusCode, 400);
        assert.match(
          String((res.body as { message?: string }).message || ""),
          /enable GPS/i,
        );
      } finally {
        if (originalPrivateObjectDir === undefined) delete process.env.PRIVATE_OBJECT_DIR;
        else process.env.PRIVATE_OBJECT_DIR = originalPrivateObjectDir;
      }
    },
  );
});

test("rubble complete rejects missing GPS coordinates with 400", async () => {
  const { app, posts } = createRouteRegistry();

  await withPatchedStorage(
    {
      getDriver: async (userId: string) => (userId === "driver_user_1" ? { id: "driver_row_1", userId } : undefined),
      getWashoutActivity: async (visitId: string) =>
        visitId === "visit_1"
          ? { id: "visit_1", driverId: "driver_row_1", locationId: "location_1", serviceType: "rubble_dropoff", status: "in_progress", materialSlug: "dirt", materialCustomLabel: null }
          : undefined,
      getWashoutLocation: async (locationId: string) =>
        locationId === "location_1"
          ? { id: "location_1", ownerId: "owner_row_1", latitude: "40.000000", longitude: "-100.000000" }
          : undefined,
      updateWashoutActivityStatus: async () => ({ id: "visit_1", locationId: "location_1" }),
      getLocationMaterialIntents: async () => [{ materialSlug: "dirt", driverPayCents: 100 }],
    },
    async () => {
      const { registerRoutes } = await import("../server/routes");
      await registerRoutes(app as never);
      const route = posts.get("/api/rubble/visits/:visitId/complete");
      assert.equal(typeof route, "function");

      const res = createResponse();
      await route!(
        {
          user: { id: "driver_user_1", role: "driver" },
          params: { visitId: "visit_1" },
          body: {
            beforePhotoUrl: "/objects/photos/before.jpg",
            afterPhotoUrl: "/objects/photos/after.jpg",
          },
        },
        res,
      );

      assert.equal(res.statusCode, 400);
      assert.match(String((res.body as { message?: string }).message || ""), /GPS coordinates are required/i);
    },
  );
});

test("photo verification helper flags missing gps and out-of-range photos", async () => {
  const { evaluatePhotoVerification } = await import("../shared/photoVerification");

  const missingGps = evaluatePhotoVerification({
    gpsLatitude: null,
    gpsLongitude: null,
    locationLatitude: 40,
    locationLongitude: -100,
  });
  assert.equal(missingGps.status, "needs_review");
  assert.equal(missingGps.distanceMiles, null);

  const outOfRange = evaluatePhotoVerification({
    gpsLatitude: 41,
    gpsLongitude: -100,
    locationLatitude: 40,
    locationLongitude: -100,
  });
  assert.equal(outOfRange.status, "failed");
  assert.ok(outOfRange.distanceMiles != null);
});

test("photo fingerprint helper builds stable hashes and detects duplicates", async () => {
  const {
    buildAverageHashFromGrayscaleValues,
    calculatePhotoFingerprintHammingDistance,
    findLikelyDuplicatePhotoMatches,
  } = await import("../shared/photoFingerprint");

  const grayscale = Array.from({ length: 64 }, (_, index) => index);
  const fingerprint = buildAverageHashFromGrayscaleValues(grayscale);
  assert.equal(fingerprint.length, 16);

  const identicalDistance = calculatePhotoFingerprintHammingDistance(fingerprint, fingerprint);
  assert.equal(identicalDistance, 0);

  const matches = findLikelyDuplicatePhotoMatches(fingerprint, [
    {
      photoId: "photo_prior",
      activityId: "activity_prior",
      driverId: "driver_prior",
      driverName: "Prior Driver",
      locationId: "location_prior",
      locationName: "Prior Location",
      priorUploadedAt: "2025-01-01T00:00:00.000Z",
      imageFingerprint: fingerprint,
    },
  ]);

  assert.equal(matches.length, 1);
  assert.equal(matches[0].confidence, 100);
  assert.equal(matches[0].hashDistance, 0);
});

test("create-with-photos stores verification metadata from driver gps", async () => {
  const { app, posts } = createRouteRegistry();
  let capturedPhotos: Array<Record<string, unknown>> = [];
  const originalTrySetObjectEntityAclPolicy = ObjectStorageService.prototype.trySetObjectEntityAclPolicy;
  ObjectStorageService.prototype.trySetObjectEntityAclPolicy = (async function (
    this: unknown,
    rawPath: string,
  ) {
    return rawPath;
  }) as never;

  await withPatchedStorage(
    {
      getDriver: async (userId: string) => (userId === "driver_user_1" ? { id: "driver_row_1", userId } : undefined),
      getWashoutLocation: async (locationId: string) =>
        locationId === "location_1"
          ? { id: "location_1", ownerId: "owner_row_1", latitude: "40.000000", longitude: "-100.000000" }
          : undefined,
      getRecentWashoutPhotoDuplicateCandidates: async () => [],
      createWashoutActivityWithPhotos: async (_activity: Record<string, unknown>, photos: Array<Record<string, unknown>>) => {
        capturedPhotos = photos;
        return {
          activity: { id: "activity_1", locationId: "location_1" },
          photos: photos.map((photo, index) => ({
            id: `photo_${index + 1}`,
            storageKey: photo.storageKey,
            contentType: photo.contentType,
            uploadedAt: new Date("2025-01-01T00:00:00.000Z"),
            photoTakenAt: photo.photoTakenAt,
            gpsLatitude: photo.gpsLatitude,
            gpsLongitude: photo.gpsLongitude,
            verificationStatus: photo.verificationStatus,
            verificationDistanceMiles: photo.verificationDistanceMiles,
            verificationReason: photo.verificationReason,
            driverId: photo.driverId,
            locationId: photo.locationId,
          })),
        };
      },
    },
    async () => {
      const originalPrivateObjectDir = process.env.PRIVATE_OBJECT_DIR;
      process.env.PRIVATE_OBJECT_DIR = "private";
      try {
        const { registerRoutes } = await import("../server/routes");
        await registerRoutes(app as never);
        const route = posts.get("/api/activities/create-with-photos");
        assert.equal(typeof route, "function");

        const res = createResponse();
        await route!(
          {
            user: { id: "driver_user_1", role: "driver" },
            body: {
              activityData: {
                locationId: "location_1",
                amount: "4.00",
                checkInTime: "2025-01-01T00:00:00.000Z",
                status: "pending",
              },
              photoData: [
                {
                  storageKey: "photo-1.jpg",
                  contentType: "image/jpeg",
                  fileSize: 12345,
                  photoTakenAt: "2025-01-01T00:00:00.000Z",
                  uploadedAt: "2025-01-01T00:05:00.000Z",
                  gpsLatitude: 40,
                  gpsLongitude: -100,
                  imageFingerprint: "0123456789abcdef",
                },
              ],
            },
          },
          res,
        );

        assert.equal(res.statusCode, 200);
        assert.equal(capturedPhotos.length, 1);
        assert.equal(capturedPhotos[0].driverId, "driver_row_1");
        assert.equal(capturedPhotos[0].locationId, "location_1");
        assert.equal(capturedPhotos[0].verificationStatus, "verified");
        assert.equal(capturedPhotos[0].verificationDistanceMiles, "0.000");
        assert.equal(capturedPhotos[0].verificationReason, "Within 1 mile of the washout location.");
      } finally {
        if (originalPrivateObjectDir === undefined) delete process.env.PRIVATE_OBJECT_DIR;
        else process.env.PRIVATE_OBJECT_DIR = originalPrivateObjectDir;
      }
    },
  );

  ObjectStorageService.prototype.trySetObjectEntityAclPolicy = originalTrySetObjectEntityAclPolicy;
});

test("create-with-photos marks moderately stale photos for review", async () => {
  const { app, posts } = createRouteRegistry();
  let capturedPhotos: Array<Record<string, unknown>> = [];
  let lotteryEntryCalls = 0;
  const originalTrySetObjectEntityAclPolicy = ObjectStorageService.prototype.trySetObjectEntityAclPolicy;
  ObjectStorageService.prototype.trySetObjectEntityAclPolicy = (async function (
    this: unknown,
    rawPath: string,
  ) {
    return rawPath;
  }) as never;

  await withPatchedStorage(
    {
      getDriver: async (userId: string) => (userId === "driver_user_1" ? { id: "driver_row_1", userId } : undefined),
      getWashoutLocation: async (locationId: string) =>
        locationId === "location_1"
          ? { id: "location_1", ownerId: "owner_row_1", latitude: "40.000000", longitude: "-100.000000" }
          : undefined,
      getRecentWashoutPhotoDuplicateCandidates: async () => [],
      createDriverLotteryEntry: async () => {
        lotteryEntryCalls += 1;
        return { id: "lottery_1" };
      },
      createWashoutActivityWithPhotos: async (_activity: Record<string, unknown>, photos: Array<Record<string, unknown>>) => {
        capturedPhotos = photos;
        return {
          activity: { id: "activity_1", locationId: "location_1" },
          photos: photos.map((photo, index) => ({
            id: `photo_${index + 1}`,
            storageKey: photo.storageKey,
            contentType: photo.contentType,
            uploadedAt: new Date("2026-05-22T21:23:05.084Z"),
            photoTakenAt: photo.photoTakenAt,
            gpsLatitude: photo.gpsLatitude,
            gpsLongitude: photo.gpsLongitude,
            verificationStatus: photo.verificationStatus,
            verificationDistanceMiles: photo.verificationDistanceMiles,
            verificationReason: photo.verificationReason,
            driverId: photo.driverId,
            locationId: photo.locationId,
          })),
        };
      },
    },
    async () => {
      const originalPrivateObjectDir = process.env.PRIVATE_OBJECT_DIR;
      process.env.PRIVATE_OBJECT_DIR = "private";
      try {
        const { registerRoutes } = await import("../server/routes");
        await registerRoutes(app as never);
        const route = posts.get("/api/activities/create-with-photos");
        assert.equal(typeof route, "function");

        const res = createResponse();
        await route!(
          {
            user: { id: "driver_user_1", role: "driver" },
            body: {
              activityData: {
                locationId: "location_1",
                amount: "0.01",
                checkInTime: "2026-05-22T21:23:05.084Z",
                status: "pending",
              },
              photoData: [
                {
                  storageKey: "photo-1.jpg",
                  contentType: "image/jpeg",
                  fileSize: 12345,
                  photoTakenAt: "2026-05-22T13:00:00.000Z",
                  uploadedAt: "2026-05-22T21:23:05.084Z",
                  gpsLatitude: 40,
                  gpsLongitude: -100,
                  imageFingerprint: "0123456789abcdef",
                },
              ],
            },
          },
          res,
        );

        assert.equal(res.statusCode, 200);
        assert.equal(capturedPhotos.length, 1);
        assert.equal(capturedPhotos[0].verificationStatus, "needs_review");
        assert.match(String(capturedPhotos[0].verificationReason), /marked for review/i);
        assert.equal(lotteryEntryCalls, 0);
      } finally {
        if (originalPrivateObjectDir === undefined) delete process.env.PRIVATE_OBJECT_DIR;
        else process.env.PRIVATE_OBJECT_DIR = originalPrivateObjectDir;
      }
    },
  );

  ObjectStorageService.prototype.trySetObjectEntityAclPolicy = originalTrySetObjectEntityAclPolicy;
});

test("create-with-photos rejects stale photo metadata", async () => {
  const { app, posts } = createRouteRegistry();
  const originalTrySetObjectEntityAclPolicy = ObjectStorageService.prototype.trySetObjectEntityAclPolicy;
  ObjectStorageService.prototype.trySetObjectEntityAclPolicy = (async function (
    this: unknown,
    rawPath: string,
  ) {
    return rawPath;
  }) as never;

  await withPatchedStorage(
    {
      getDriver: async (userId: string) => (userId === "driver_user_1" ? { id: "driver_row_1", userId } : undefined),
      getWashoutLocation: async (locationId: string) =>
        locationId === "location_1"
          ? { id: "location_1", ownerId: "owner_row_1", latitude: "40.000000", longitude: "-100.000000" }
          : undefined,
      getRecentWashoutPhotoDuplicateCandidates: async () => [],
      createWashoutActivityWithPhotos: async () => {
        throw new Error("should not be called");
      },
    },
    async () => {
      const originalPrivateObjectDir = process.env.PRIVATE_OBJECT_DIR;
      process.env.PRIVATE_OBJECT_DIR = "private";
      try {
        const { registerRoutes } = await import("../server/routes");
        await registerRoutes(app as never);
        const route = posts.get("/api/activities/create-with-photos");
        assert.equal(typeof route, "function");

        const res = createResponse();
        await route!(
          {
            user: { id: "driver_user_1", role: "driver" },
            body: {
              activityData: {
                locationId: "location_1",
                amount: "0.01",
                checkInTime: "2026-05-22T21:23:05.084Z",
                status: "pending",
              },
              photoData: [
                {
                  storageKey: "photo-1779484984494-yl95qr87o.jpg",
                  contentType: "image/jpeg",
                  fileSize: 12345,
                  photoTakenAt: "2026-04-08T15:05:31.590Z",
                  uploadedAt: "2026-05-22T21:23:05.084Z",
                  gpsLatitude: 40,
                  gpsLongitude: -100,
                  imageFingerprint: "0123456789abcdef",
                },
              ],
            },
          },
          res,
        );

        assert.equal(res.statusCode, 400);
        assert.match(
          String((res.body as { message?: string }).message || ""),
          /Please take a new photo at the washout site before completing checkout\./,
        );
      } finally {
        if (originalPrivateObjectDir === undefined) delete process.env.PRIVATE_OBJECT_DIR;
        else process.env.PRIVATE_OBJECT_DIR = originalPrivateObjectDir;
      }
    },
  );

  ObjectStorageService.prototype.trySetObjectEntityAclPolicy = originalTrySetObjectEntityAclPolicy;
});

test("create-with-photos marks duplicate lookup failures for review instead of crashing", async () => {
  const { app, posts } = createRouteRegistry();
  let capturedPhotos: Array<Record<string, unknown>> = [];
  const originalTrySetObjectEntityAclPolicy = ObjectStorageService.prototype.trySetObjectEntityAclPolicy;
  ObjectStorageService.prototype.trySetObjectEntityAclPolicy = (async function (
    this: unknown,
    rawPath: string,
  ) {
    return rawPath;
  }) as never;

  await withPatchedStorage(
    {
      getDriver: async (userId: string) => (userId === "driver_user_1" ? { id: "driver_row_1", userId } : undefined),
      getWashoutLocation: async (locationId: string) =>
        locationId === "location_1"
          ? { id: "location_1", ownerId: "owner_row_1", latitude: "40.000000", longitude: "-100.000000" }
          : undefined,
      getRecentWashoutPhotoDuplicateCandidates: async () => {
        throw new Error("duplicate lookup offline");
      },
      createWashoutActivityWithPhotos: async (_activity: Record<string, unknown>, photos: Array<Record<string, unknown>>) => {
        capturedPhotos = photos;
        return {
          activity: { id: "activity_1", locationId: "location_1" },
          photos: photos.map((photo, index) => ({
            id: `photo_${index + 1}`,
            storageKey: photo.storageKey,
            contentType: photo.contentType,
            uploadedAt: new Date("2026-05-22T21:23:05.084Z"),
            photoTakenAt: photo.photoTakenAt,
            gpsLatitude: photo.gpsLatitude,
            gpsLongitude: photo.gpsLongitude,
            verificationStatus: photo.verificationStatus,
            verificationDistanceMiles: photo.verificationDistanceMiles,
            verificationReason: photo.verificationReason,
            driverId: photo.driverId,
            locationId: photo.locationId,
          })),
        };
      },
    },
    async () => {
      const originalPrivateObjectDir = process.env.PRIVATE_OBJECT_DIR;
      process.env.PRIVATE_OBJECT_DIR = "private";
      try {
        const { registerRoutes } = await import("../server/routes");
        await registerRoutes(app as never);
        const route = posts.get("/api/activities/create-with-photos");
        assert.equal(typeof route, "function");

        const res = createResponse();
        await route!(
          {
            user: { id: "driver_user_1", role: "driver" },
            body: {
              activityData: {
                locationId: "location_1",
                amount: "0.01",
                latitude: "40.000000",
                longitude: "-100.000000",
                notes: "Mobile checkout",
                checkInTime: "2026-05-22T21:23:05.084Z",
                status: "pending",
              },
              photoData: [
                {
                  storageKey: "photo-1.jpg",
                  contentType: "image/jpeg",
                  fileSize: 12345,
                  photoTakenAt: "2026-05-22T20:55:31.590Z",
                  uploadedAt: "2026-05-22T21:23:05.084Z",
                  gpsLatitude: 40,
                  gpsLongitude: -100,
                  imageFingerprint: "0123456789abcdef",
                },
              ],
            },
          },
          res,
        );

        assert.equal(res.statusCode, 200);
        assert.equal(capturedPhotos.length, 1);
        assert.equal(capturedPhotos[0].verificationStatus, "needs_review");
        assert.match(String(capturedPhotos[0].verificationReason), /duplicate verification unavailable/i);
      } finally {
        if (originalPrivateObjectDir === undefined) delete process.env.PRIVATE_OBJECT_DIR;
        else process.env.PRIVATE_OBJECT_DIR = originalPrivateObjectDir;
      }
    },
  );

  ObjectStorageService.prototype.trySetObjectEntityAclPolicy = originalTrySetObjectEntityAclPolicy;
});

test("create-with-photos rejects missing photo metadata", async () => {
  const { app, posts } = createRouteRegistry();

  await withPatchedStorage(
    {
      getDriver: async (userId: string) => (userId === "driver_user_1" ? { id: "driver_row_1", userId } : undefined),
      getWashoutLocation: async (locationId: string) =>
        locationId === "location_1"
          ? { id: "location_1", ownerId: "owner_row_1", latitude: "40.000000", longitude: "-100.000000" }
          : undefined,
      getRecentWashoutPhotoDuplicateCandidates: async () => [],
      createWashoutActivityWithPhotos: async () => {
        throw new Error("should not be called");
      },
    },
    async () => {
      const originalPrivateObjectDir = process.env.PRIVATE_OBJECT_DIR;
      process.env.PRIVATE_OBJECT_DIR = "private";
      try {
        const { registerRoutes } = await import("../server/routes");
        await registerRoutes(app as never);
        const route = posts.get("/api/activities/create-with-photos");
        assert.equal(typeof route, "function");

        const res = createResponse();
        await route!(
          {
            user: { id: "driver_user_1", role: "driver" },
            body: {
              activityData: {
                locationId: "location_1",
                amount: "0.01",
                checkInTime: "2026-05-22T21:23:05.084Z",
                status: "pending",
              },
              photoData: [
                {
                  contentType: "image/jpeg",
                  fileSize: 12345,
                  photoTakenAt: "2026-05-22T15:05:31.590Z",
                  uploadedAt: "2026-05-22T21:23:05.084Z",
                  gpsLatitude: 40,
                  gpsLongitude: -100,
                  imageFingerprint: "0123456789abcdef",
                },
              ],
            },
          },
          res,
        );

        assert.equal(res.statusCode, 400);
        assert.match(
          String((res.body as { message?: string }).message || ""),
          /missing its storage key/i,
        );
      } finally {
        if (originalPrivateObjectDir === undefined) delete process.env.PRIVATE_OBJECT_DIR;
        else process.env.PRIVATE_OBJECT_DIR = originalPrivateObjectDir;
      }
    },
  );
});

test("create-with-photos returns a schema message when the db insert fails", async () => {
  const { app, posts } = createRouteRegistry();

  await withPatchedStorage(
    {
      getDriver: async (userId: string) => (userId === "driver_user_1" ? { id: "driver_row_1", userId } : undefined),
      getWashoutLocation: async (locationId: string) =>
        locationId === "location_1"
          ? { id: "location_1", ownerId: "owner_row_1", latitude: "40.000000", longitude: "-100.000000" }
          : undefined,
      getRecentWashoutPhotoDuplicateCandidates: async () => [],
      createWashoutActivityWithPhotos: async () => {
        const error = new Error('column "photo_taken_at" of relation "washout_photos" does not exist') as Error & {
          code?: string;
          table?: string;
          column?: string;
        };
        error.code = "42703";
        error.table = "washout_photos";
        error.column = "photo_taken_at";
        throw error;
      },
    },
    async () => {
      const originalPrivateObjectDir = process.env.PRIVATE_OBJECT_DIR;
      process.env.PRIVATE_OBJECT_DIR = "private";
      try {
        const { registerRoutes } = await import("../server/routes");
        await registerRoutes(app as never);
        const route = posts.get("/api/activities/create-with-photos");
        assert.equal(typeof route, "function");

        const res = createResponse();
        await route!(
          {
            user: { id: "driver_user_1", role: "driver" },
            body: {
              activityData: {
                locationId: "location_1",
                amount: "0.01",
                latitude: "40.000000",
                longitude: "-100.000000",
                notes: "Mobile checkout",
                checkInTime: "2026-05-22T21:23:05.084Z",
                status: "pending",
              },
              photoData: [
                {
                  storageKey: "photo-1.jpg",
                  contentType: "image/jpeg",
                  fileSize: 12345,
                  photoTakenAt: "2026-05-22T20:55:31.590Z",
                  uploadedAt: "2026-05-22T21:23:05.084Z",
                  gpsLatitude: 40,
                  gpsLongitude: -100,
                  imageFingerprint: "0123456789abcdef",
                },
              ],
            },
          },
          res,
        );

        assert.equal(res.statusCode, 500);
        assert.match(
          String((res.body as { message?: string }).message || ""),
          /Database schema is missing required photo metadata fields\. Please deploy the latest migration\./,
        );
      } finally {
        if (originalPrivateObjectDir === undefined) delete process.env.PRIVATE_OBJECT_DIR;
        else process.env.PRIVATE_OBJECT_DIR = originalPrivateObjectDir;
      }
    },
  );
});

test("create-with-photos flags duplicate fingerprints for review", async () => {
  const { app, posts } = createRouteRegistry();
  let capturedPhotos: Array<Record<string, unknown>> = [];
  let duplicateWindowStart: Date | null = null;
  const originalTrySetObjectEntityAclPolicy = ObjectStorageService.prototype.trySetObjectEntityAclPolicy;
  ObjectStorageService.prototype.trySetObjectEntityAclPolicy = (async function (
    this: unknown,
    rawPath: string,
  ) {
    return rawPath;
  }) as never;

  await withPatchedStorage(
    {
      getDriver: async (userId: string) => (userId === "driver_user_1" ? { id: "driver_row_1", userId } : undefined),
      getWashoutLocation: async (locationId: string) =>
        locationId === "location_1"
          ? { id: "location_1", ownerId: "owner_row_1", latitude: "40.000000", longitude: "-100.000000" }
          : undefined,
      getRecentWashoutPhotoDuplicateCandidates: async (since: Date) => {
        duplicateWindowStart = since;
        return [
        {
          photoId: "prior_photo_1",
          activityId: "activity_prior",
          driverId: "driver_row_9",
          driverName: "Prior Driver",
          locationId: "location_prior",
          locationName: "Prior Location",
          priorUploadedAt: "2025-01-01T00:00:00.000Z",
          imageFingerprint: "ffffffffffffffff",
        },
      ];
      },
      createWashoutActivityWithPhotos: async (_activity: Record<string, unknown>, photos: Array<Record<string, unknown>>) => {
        capturedPhotos = photos;
        return {
          activity: { id: "activity_1", locationId: "location_1" },
          photos: photos.map((photo, index) => ({
            id: `photo_${index + 1}`,
            storageKey: photo.storageKey,
            contentType: photo.contentType,
            uploadedAt: new Date("2025-01-01T00:00:00.000Z"),
            photoTakenAt: photo.photoTakenAt,
            gpsLatitude: photo.gpsLatitude,
            gpsLongitude: photo.gpsLongitude,
            verificationStatus: photo.verificationStatus,
            verificationDistanceMiles: photo.verificationDistanceMiles,
            verificationReason: photo.verificationReason,
            driverId: photo.driverId,
            locationId: photo.locationId,
            duplicateMatches: photo.duplicateMatches,
            imageFingerprint: photo.imageFingerprint,
          })),
        };
      },
    },
    async () => {
      const originalPrivateObjectDir = process.env.PRIVATE_OBJECT_DIR;
      process.env.PRIVATE_OBJECT_DIR = "private";
      try {
        const { registerRoutes } = await import("../server/routes");
        await registerRoutes(app as never);
        const route = posts.get("/api/activities/create-with-photos");
        assert.equal(typeof route, "function");

        const res = createResponse();
        await route!(
          {
            user: { id: "driver_user_1", role: "driver" },
            body: {
              activityData: {
                locationId: "location_1",
                amount: "4.00",
                checkInTime: "2025-01-01T00:00:00.000Z",
                status: "pending",
              },
              photoData: [
                {
                  storageKey: "photo-1.jpg",
                  contentType: "image/jpeg",
                  fileSize: 12345,
                  photoTakenAt: "2025-01-01T00:00:00.000Z",
                  uploadedAt: "2025-01-01T00:05:00.000Z",
                  gpsLatitude: 40,
                  gpsLongitude: -100,
                  imageFingerprint: "ffffffffffffffff",
                },
              ],
            },
          },
          res,
        );

        assert.equal(res.statusCode, 200);
        assert.equal(capturedPhotos.length, 1);
        assert.ok(duplicateWindowStart instanceof Date);
        const lookbackDays =
          (Date.now() - duplicateWindowStart.getTime()) / (24 * 60 * 60 * 1000);
        assert.ok(lookbackDays > 89 && lookbackDays < 91);
        assert.equal(capturedPhotos[0].verificationStatus, "needs_review");
        assert.equal(capturedPhotos[0].duplicateMatchedPhotoId, "prior_photo_1");
        assert.equal(capturedPhotos[0].duplicateSimilarityScore, 100);
        assert.equal(capturedPhotos[0].duplicateHashDistance, 0);
        assert.match(
          String(capturedPhotos[0].verificationReason),
          /Possible duplicate photo detected/,
        );
      } finally {
        if (originalPrivateObjectDir === undefined) delete process.env.PRIVATE_OBJECT_DIR;
        else process.env.PRIVATE_OBJECT_DIR = originalPrivateObjectDir;
      }
    },
  );

  ObjectStorageService.prototype.trySetObjectEntityAclPolicy = originalTrySetObjectEntityAclPolicy;
});

test("owner verify rejects washouts outside the owner's locations", async () => {
  const { app, puts } = createRouteRegistry();

  await withPatchedStorage(
    {
      getOwner: async () => ({
        id: "owner_1",
        userId: "user_1",
        useCustomBillingModel: true,
        customWashoutRate: "12.00",
      }),
      getWashoutActivity: async () => ({
        id: "activity_1",
        locationId: "location_other",
        status: "pending",
        amount: "10.00",
        driverId: "driver_row_1",
        serviceType: "washout",
      }),
      getWashoutLocation: async () => ({
        id: "location_other",
        ownerId: "owner_other",
      }),
    },
    async () => {
      const { registerRoutes } = await import("../server/routes");
      await registerRoutes(app as never);
      const route = puts.get("/api/owners/activities/:id/verify");
      assert.equal(typeof route, "function");

      const res = createResponse();
      await route!(
        {
          params: { id: "activity_1" },
          user: { id: "user_1" },
        },
        res,
      );

      assert.equal(res.statusCode, 403);
      assert.match(
        String((res.body as { message?: string }).message || ""),
        /does not belong to your location/i,
      );
    },
  );
});

test("owner verify rejects already processed washouts", async () => {
  const { app, puts } = createRouteRegistry();

  await withPatchedStorage(
    {
      getOwner: async () => ({
        id: "owner_1",
        userId: "user_1",
        useCustomBillingModel: true,
        customWashoutRate: "12.00",
      }),
      getWashoutActivity: async () => ({
        id: "activity_1",
        locationId: "location_1",
        status: "rejected",
        amount: "10.00",
        driverId: "driver_row_1",
        serviceType: "washout",
      }),
      getWashoutLocation: async () => ({
        id: "location_1",
        ownerId: "owner_1",
      }),
    },
    async () => {
      const { registerRoutes } = await import("../server/routes");
      await registerRoutes(app as never);
      const route = puts.get("/api/owners/activities/:id/verify");
      assert.equal(typeof route, "function");

      const res = createResponse();
      await route!(
        {
          params: { id: "activity_1" },
          user: { id: "user_1" },
        },
        res,
      );

      assert.equal(res.statusCode, 409);
      assert.match(
        String((res.body as { message?: string }).message || ""),
        /already been processed/i,
      );
      assert.equal((res.body as { details?: { currentStatus?: string } }).details?.currentStatus, "rejected");
    },
  );
});

test("owner verify approves legacy pending washouts and falls back when driver Stripe is missing", async () => {
  const { app, puts } = createRouteRegistry();
  let verified = false;
  let createdPayment = false;

  await withPatchedStorage(
    {
      getOwner: async () => ({
        id: "owner_1",
        userId: "user_1",
        useCustomBillingModel: false,
        customWashoutRate: null,
        stripeCustomerId: "cus_owner_1",
        stripePaymentMethodId: "pm_owner_1",
      }),
      getWashoutActivity: async () => ({
        id: "activity_1",
        locationId: "location_1",
        status: "pending_owner_approval",
        amount: "10.00",
        driverId: "driver_row_1",
        serviceType: "washout",
      }),
      getWashoutLocation: async () => ({
        id: "location_1",
        ownerId: "owner_1",
      }),
      getOwnerBillingSettings: async () => null,
      getDriverById: async () => ({
        id: "driver_row_1",
        userId: "driver_user_1",
      }),
      getUserById: async () => ({
        id: "driver_user_1",
        username: "driver1",
        firstName: "Driver",
        lastName: "One",
        stripeConnectAccountId: null,
      }),
            createPayment: async () => {
              createdPayment = true;
              return {
                id: "payment_1",
                status: "awaiting_driver_stripe",
                payoutStatus: "held_for_onboarding",
              };
            },
      verifyWashoutActivity: async () => {
        verified = true;
        return {
          id: "activity_1",
          locationId: "location_1",
          status: "verified",
          amount: "10.00",
          driverId: "driver_row_1",
          serviceType: "washout",
        };
      },
    },
    async () => {
      const { registerRoutes } = await import("../server/routes");
      await registerRoutes(app as never);
      const route = puts.get("/api/owners/activities/:id/verify");
      assert.equal(typeof route, "function");

      const res = createResponse();
      await route!(
        {
          params: { id: "activity_1" },
          user: { id: "user_1" },
        },
        res,
      );

      assert.equal(res.statusCode, 200);
      assert.equal(verified, true);
      assert.equal(createdPayment, true);
      assert.equal((res.body as { status?: string }).status, "verified");
      assert.equal((res.body as { paymentStatus?: string }).paymentStatus, "awaiting_driver_stripe");
      assert.equal((res.body as { payoutStatus?: string }).payoutStatus, "held_for_onboarding");
      assert.equal((res.body as { verifiedBy?: string }).verifiedBy, "user_1");
      assert.ok((res.body as { verifiedAt?: string }).verifiedAt);
      assert.match(String((res.body as { message?: string }).message || ""), /payment will be processed once the driver completes payment setup/i);
    },
  );
});

test("owner verify still succeeds when deferred payment persistence fails after approval", async () => {
  const { app, puts } = createRouteRegistry();
  let verified = false;

  await withPatchedStorage(
    {
      getOwner: async () => ({
        id: "owner_1",
        userId: "user_1",
        useCustomBillingModel: false,
        customWashoutRate: null,
        stripeCustomerId: "cus_owner_1",
        stripePaymentMethodId: "pm_owner_1",
      }),
      getWashoutActivity: async () => ({
        id: "activity_1",
        locationId: "location_1",
        status: "pending_owner_approval",
        amount: "10.00",
        driverId: "driver_row_1",
        serviceType: "washout",
      }),
      getWashoutLocation: async () => ({
        id: "location_1",
        ownerId: "owner_1",
      }),
      getOwnerBillingSettings: async () => null,
      getDriverById: async () => ({
        id: "driver_row_1",
        userId: "driver_user_1",
      }),
      getUserById: async () => ({
        id: "driver_user_1",
        username: "driver1",
        firstName: "Driver",
        lastName: "One",
        stripeConnectAccountId: null,
      }),
      createPayment: async () => {
        throw new Error("deferred payment record failed");
      },
      verifyWashoutActivity: async () => {
        verified = true;
        return {
          id: "activity_1",
          locationId: "location_1",
          status: "verified",
          amount: "10.00",
          driverId: "driver_row_1",
          serviceType: "washout",
        };
      },
    },
    async () => {
      const { registerRoutes } = await import("../server/routes");
      await registerRoutes(app as never);
      const route = puts.get("/api/owners/activities/:id/verify");
      assert.equal(typeof route, "function");

      const res = createResponse();
      await route!(
        {
          params: { id: "activity_1" },
          user: { id: "user_1" },
        },
        res,
      );

      assert.equal(res.statusCode, 200);
      assert.equal(verified, true);
      assert.equal((res.body as { status?: string }).status, "verified");
      assert.equal((res.body as { verifiedBy?: string }).verifiedBy, "user_1");
      assert.ok((res.body as { verifiedAt?: string }).verifiedAt);
      assert.match(String((res.body as { message?: string }).message || ""), /washout approved/i);
      assert.match(String((res.body as { warning?: string }).warning || ""), /deferred payment record failed/i);
    },
  );
});

test("owner verify charges normally when driver Stripe is ready", async () => {
  const { app, puts } = createRouteRegistry();
  let createdPayment: Record<string, unknown> | null = null;
  let walletCredits = 0;

  await withMockedDb([[]], async (mock) => {
    await withPatchedStripe(
      {
        accounts: {
          retrieve: async () => ({
            id: "acct_driver_1",
            capabilities: { transfers: "active" },
          }),
        },
        paymentMethods: {
          retrieve: async () => ({
            id: "pm_owner_1",
            type: "card",
            card: { brand: "visa", last4: "4242" },
          }),
        },
        paymentIntents: {
          create: async () => ({
            id: "pi_1",
            status: "succeeded",
          }),
        },
      },
      async () => {
        await withPatchedStorage(
          {
            getOwner: async () => ({
              id: "owner_1",
              userId: "user_1",
              useCustomBillingModel: false,
              customWashoutRate: null,
              stripeCustomerId: "cus_owner_1",
              stripePaymentMethodId: "pm_owner_1",
            }),
            getWashoutActivity: async () => ({
              id: "activity_1",
              locationId: "location_1",
              status: "pending",
              amount: "10.00",
              driverId: "driver_row_1",
              serviceType: "washout",
            }),
            getWashoutLocation: async () => ({
              id: "location_1",
              ownerId: "owner_1",
              name: "Site A",
            }),
            getOwnerBillingSettings: async () => ({
              billingCadence: "immediate",
              billingTimezone: "America/Chicago",
              billingCutoffTime: "23:59:00",
            }),
            calculateBusinessDateForOwner: async () => "2026-05-28",
            getDriverById: async () => ({
              id: "driver_row_1",
              userId: "driver_user_1",
            }),
            getUserById: async () => ({
              id: "driver_user_1",
              username: "driver1",
              firstName: "Driver",
              lastName: "One",
              stripeConnectAccountId: "acct_driver_1",
            }),
            getDriverWallet: async () => null,
            createDriverWallet: async () => ({ id: "wallet_1" }),
            adjustDriverWalletBalance: async () => undefined,
            createWalletTransaction: async () => undefined,
            createPayment: async (payment: Record<string, unknown>) => {
              createdPayment = payment;
              return {
                id: "payment_1",
                ...payment,
              } as any;
            },
            updatePaymentStatus: async () => ({
              id: "payment_1",
              status: "completed",
            }),
            verifyWashoutActivity: async () => ({
              id: "activity_1",
              locationId: "location_1",
              status: "verified",
              amount: "10.00",
              driverId: "driver_row_1",
              serviceType: "washout",
            }),
          },
          async () => {
            const { registerRoutes } = await import("../server/routes");
            await registerRoutes(app as never);
            const route = puts.get("/api/owners/activities/:id/verify");
            assert.equal(typeof route, "function");

            const res = createResponse();
            await route!(
              {
                params: { id: "activity_1" },
                user: { id: "user_1" },
              },
              res,
            );

            assert.equal(res.statusCode, 200);
            assert.equal((res.body as { status?: string }).status, "verified");
            assert.equal(createdPayment?.status, "completed");
          },
        );
      },
    );
  });
});

test("driver dashboard shows approved washouts awaiting tip payout setup", async () => {
  const { app, gets } = createRouteRegistry();

  await withPatchedStorage(
    {
      getDriver: async () => ({
        id: "driver_row_1",
        userId: "driver_user_1",
        truckNumber: "Truck 1",
      }),
      getActivitiesByDriver: async () => [],
      getDriverStats: async () => ({ totalEarnings: 0, totalWashouts: 0, avgPerWashout: 0 }),
      getRecentActivitiesByDriver: async () => [],
      getUser: async () => ({
        id: "driver_user_1",
        username: "driver1",
        firstName: "Driver",
        lastName: "One",
      }),
      getFeatureFlag: async () => ({ enabled: false }),
      getDriverLotteryEntryCount: async () => 0,
      getPaymentsAwaitingDriverStripeByDriver: async () => ([
        {
          id: "payment_1",
          amount: "10.00",
          processingFee: "5.00",
          status: "awaiting_driver_stripe",
          payoutStatus: "held_for_onboarding",
          location: { name: "Site A" },
          activity: { locationId: "location_1" },
        },
      ]),
    },
    async () => {
      const { registerRoutes } = await import("../server/routes");
      await registerRoutes(app as never);
      const route = gets.get("/api/drivers/dashboard");
      assert.equal(typeof route, "function");

      const res = createResponse();
      await route!(
        {
          user: { id: "driver_user_1" },
        },
        res,
      );

      assert.equal(res.statusCode, 200);
      assert.equal((res.body as { awaitingDriverStripeCount?: number }).awaitingDriverStripeCount, 1);
      assert.equal(
        (res.body as { awaitingDriverStripePayments?: Array<{ status?: string }> }).awaitingDriverStripePayments?.[0]?.status,
        "awaiting_driver_stripe",
      );
    },
  );
});

test("driver dashboard shows lottery as active by default", async () => {
  const { app, gets } = createRouteRegistry();

  await withPatchedStorage(
    {
      getDriver: async () => ({
        id: "driver_row_1",
        userId: "driver_user_1",
        truckNumber: "Truck 1",
      }),
      getActivitiesByDriver: async () => [],
      getDriverStats: async () => ({ totalEarnings: 0, totalWashouts: 0, avgPerWashout: 0 }),
      getRecentActivitiesByDriver: async () => [],
      getUser: async () => ({
        id: "driver_user_1",
        username: "driver1",
        firstName: "Driver",
        lastName: "One",
      }),
      getFeatureFlag: async () => undefined,
      getDriverLotteryEntryCount: async () => 7,
      getLotteryDrawingByMonthYear: async () => ({
        id: "drawing_1",
        lotteryMonth: new Date().getMonth() + 1,
        lotteryYear: new Date().getFullYear(),
        drawingDate: new Date().toISOString(),
      }),
      getPaymentsAwaitingDriverStripeByDriver: async () => [],
    },
    async () => {
      const { registerRoutes } = await import("../server/routes");
      await registerRoutes(app as never);
      const route = gets.get("/api/drivers/dashboard");
      assert.equal(typeof route, "function");

      const res = createResponse();
      await route!(
        {
          user: { id: "driver_user_1" },
        },
        res,
      );

      assert.equal(res.statusCode, 200);
      assert.equal((res.body as { lotteryActive?: boolean }).lotteryActive, true);
      assert.equal((res.body as { lotteryEntryCount?: number }).lotteryEntryCount, 7);
      assert.equal((res.body as { lotteryStatus?: { enabled?: boolean } }).lotteryStatus?.enabled, true);
    },
  );
});

test("driver locations endpoint returns active visible owner locations", async () => {
  const { app, gets } = createRouteRegistry();

  await withPatchedStorage(
    {
      getActiveLocations: async () => ([
        {
          id: "location_1",
          ownerId: "owner_1",
          name: "Site A",
          street: "1 Main St",
          city: "Austin",
          state: "TX",
          zip: "78701",
          latitude: "30.2672",
          longitude: "-97.7431",
          rate: "5.00",
          driverIncentiveTip: "0.00",
          isActive: true,
          isVisible: true,
          owner: {
            id: "owner_1",
            userId: "owner_user_1",
            companyName: "Alpha Concrete",
            isApproved: false,
            membershipStatus: "active",
            user: {
              id: "owner_user_1",
              firstName: "Olivia",
              lastName: "Owner",
              email: "olivia@example.com",
            },
          },
        },
      ]),
      getLocationMaterialIntents: async () => [],
      getMaterialBySlug: async () => null,
    },
    async () => {
      const { registerRoutes } = await import("../server/routes");
      await registerRoutes(app as never);
      const route = gets.get("/api/drivers/locations");
      assert.equal(typeof route, "function");

      const res = createResponse();
      await route!(
        {
          user: { id: "driver_user_1" },
        },
        res,
      );

      assert.equal(res.statusCode, 200);
      const locations = res.body as Array<{ id?: string; owner?: { id?: string } }>;
      assert.equal(locations.length, 1);
      assert.equal(locations[0].id, "location_1");
      assert.equal(locations[0].owner?.id, "owner_1");
    },
  );
});

test("lottery status endpoint defaults to active and returns drawing context", async () => {
  const { app, gets } = createRouteRegistry();

  await withPatchedStorage(
    {
      getUser: async () => ({
        id: "driver_user_1",
        username: "driver1",
        role: "driver",
      }),
      getDriver: async () => ({
        id: "driver_row_1",
        userId: "driver_user_1",
        truckNumber: "Truck 1",
      }),
      getFeatureFlag: async () => undefined,
      getDriverLotteryEntryCount: async () => 4,
      getLotteryDrawingByMonthYear: async () => ({
        id: "drawing_1",
        lotteryMonth: new Date().getMonth() + 1,
        lotteryYear: new Date().getFullYear(),
        drawingDate: new Date().toISOString(),
      }),
    },
    async () => {
      const { registerRoutes } = await import("../server/routes");
      await registerRoutes(app as never);
      const route = gets.get("/api/lottery/status");
      assert.equal(typeof route, "function");

      const res = createResponse();
      await route!(
        {
          user: { id: "driver_user_1" },
        },
        res,
      );

      assert.equal(res.statusCode, 200);
      assert.equal((res.body as { enabled?: boolean }).enabled, true);
      assert.equal((res.body as { driverEntryCount?: number }).driverEntryCount, 4);
      assert.match((res.body as { currentDrawingMessage?: string }).currentDrawingMessage || "", /Current drawing is open|Lottery is active/i);
    },
  );
});

test("weekly owner billing charges via the unified engine", async () => {
  const fixture = createOwnerBillingRunFixture({
    billingCadence: "weekly",
    payments: [
      {
        id: "payment_1",
        amount: "10.00",
        processingFee: "5.00",
        washoutServiceFee: "0.00",
      },
    ],
    stripeMode: "succeeded",
  });

  const result = await processOwnerBillingRun({
    ownerId: "owner_1",
    runType: "weekly_scheduled",
    startDate: new Date("2026-05-28T00:00:00.000Z"),
    endDate: new Date("2026-05-28T23:59:59.999Z"),
    storage: fixture.storage,
    stripeClient: fixture.stripeClient,
  });

  assert.equal(result.runs.length, 1);
  assert.equal(result.runs[0].status, "paid");
  assert.equal(result.totalWashoutCount, 1);
  assert.equal(fixture.getChargeCount(), 1);
  assert.equal((fixture.getLastIntent() as { amount?: number } | null)?.amount, 1500);
  assert.equal((fixture.getLastIntent() as { metadata?: Record<string, string> } | null)?.metadata?.platformFeeTotal, "5.00");
  assert.equal((fixture.getLastIntent() as { metadata?: Record<string, string> } | null)?.metadata?.driverTipTotal, "0.00");
  assert.equal((fixture.getBatch() as { metadata?: Record<string, string> } | null)?.metadata?.platformFeeTotal, "5.00");
  assert.equal((fixture.getBatch() as { metadata?: Record<string, string> } | null)?.metadata?.driverTipTotal, "0.00");
  assert.equal((fixture.getBatch() as { status?: string } | null)?.status, "completed");
});

test("owner billing charges platform fee plus driver tip separately", async () => {
  const fixture = createOwnerBillingRunFixture({
    billingCadence: "weekly",
    payments: [
      {
        id: "payment_1",
        amount: "10.00",
        processingFee: "5.00",
        washoutServiceFee: "1.50",
      },
    ],
    stripeMode: "succeeded",
  });

  const result = await processOwnerBillingRun({
    ownerId: "owner_1",
    runType: "weekly_scheduled",
    startDate: new Date("2026-05-28T00:00:00.000Z"),
    endDate: new Date("2026-05-28T23:59:59.999Z"),
    storage: fixture.storage,
    stripeClient: fixture.stripeClient,
  });

  assert.equal(result.runs[0].status, "paid");
  assert.equal((fixture.getLastIntent() as { amount?: number } | null)?.amount, 1650);
  assert.equal((fixture.getLastIntent() as { metadata?: Record<string, string> } | null)?.metadata?.platformFeeTotal, "5.00");
  assert.equal((fixture.getLastIntent() as { metadata?: Record<string, string> } | null)?.metadata?.driverTipTotal, "1.50");
});

test("manual owner billing charges approved washout platform fees only", async () => {
  const fixture = createOwnerBillingRunFixture({
    billingCadence: "weekly",
    approvedWashouts: [
      {
        activityId: "activity_1",
        activityFeeCentsPlatform: 300,
        activityStatus: "verified",
        locationDriverIncentiveTip: 150,
      },
      {
        activityId: "activity_2",
        activityFeeCentsPlatform: 200,
        activityStatus: "verified",
        locationDriverIncentiveTip: 350,
      },
    ],
    payments: [],
    stripeMode: "succeeded",
  });

  const result = await processOwnerBillingRun({
    ownerId: "owner_1",
    runType: "admin_manual",
    startDate: new Date("2026-05-28T00:00:00.000Z"),
    endDate: new Date("2026-05-29T23:59:59.999Z"),
    triggeredByAdminId: "admin_1",
    storage: fixture.storage,
    stripeClient: fixture.stripeClient,
  });

  assert.equal(result.runs[0].status, "paid");
  assert.equal(result.totalWashoutCount, 2);
  assert.equal((fixture.getLastIntent() as { amount?: number } | null)?.amount, 500);
  assert.equal((fixture.getLastIntent() as { off_session?: boolean } | null)?.off_session, true);
  assert.deepEqual((fixture.getLastIntentOptions() as { idempotencyKey?: string } | null)?.idempotencyKey?.startsWith("owner_platform_billing_"), true);
  assert.equal((fixture.getBatch() as { metadata?: { runType?: string; triggeredByAdminId?: string; platformFeeTotal?: string; driverTipTotal?: string; washoutActivityIds?: string } } | null)?.metadata?.runType, "admin_manual");
  assert.equal((fixture.getBatch() as { metadata?: { runType?: string; triggeredByAdminId?: string; platformFeeTotal?: string; driverTipTotal?: string; washoutActivityIds?: string } } | null)?.metadata?.triggeredByAdminId, "admin_1");
  assert.equal((fixture.getBatch() as { metadata?: { platformFeeTotal?: string; driverTipTotal?: string; washoutActivityIds?: string } } | null)?.metadata?.platformFeeTotal, "5.00");
  assert.equal((fixture.getBatch() as { metadata?: { platformFeeTotal?: string; driverTipTotal?: string; washoutActivityIds?: string } } | null)?.metadata?.driverTipTotal, "5.00");
  assert.equal((fixture.getBatch() as { metadata?: { platformFeeTotal?: string; driverTipTotal?: string; washoutActivityIds?: string } } | null)?.metadata?.washoutActivityIds, "activity_1,activity_2");
});

test("manual owner billing bills only approved washouts and excludes declined washouts", async () => {
  const fixture = createOwnerBillingRunFixture({
    billingCadence: "weekly",
    approvedWashouts: [
      { activityId: "activity_1", activityFeeCentsPlatform: null, activityStatus: "verified" },
      { activityId: "activity_2", activityFeeCentsPlatform: null, activityStatus: "verified" },
      { activityId: "activity_3", activityFeeCentsPlatform: null, activityStatus: "verified" },
      { activityId: "activity_4", activityFeeCentsPlatform: null, activityStatus: "verified" },
      { activityId: "activity_5", activityFeeCentsPlatform: null, activityStatus: "approved" },
      { activityId: "activity_6", activityFeeCentsPlatform: null, activityStatus: "declined" },
      { activityId: "activity_7", activityFeeCentsPlatform: null, activityStatus: "rejected" },
    ],
    payments: [],
    stripeMode: "succeeded",
  });

  const result = await processOwnerBillingRun({
    ownerId: "owner_1",
    runType: "admin_manual",
    startDate: new Date("2026-05-28T00:00:00.000Z"),
    endDate: new Date("2026-05-29T23:59:59.999Z"),
    triggeredByAdminId: "admin_1",
    storage: fixture.storage,
    stripeClient: fixture.stripeClient,
  });

  assert.equal(result.runs[0].status, "paid");
  assert.equal(result.totalWashoutCount, 5);
  assert.equal((fixture.getLastIntent() as { amount?: number } | null)?.amount, 2500);
  assert.equal((fixture.getLastIntent() as { off_session?: boolean } | null)?.off_session, true);
  assert.deepEqual((fixture.getLastIntent() as { payment_method_types?: string[] } | null)?.payment_method_types, ["card"]);
  assert.equal((fixture.getBatch() as { metadata?: { stripeChargeId?: string } } | null)?.metadata?.stripeChargeId, "ch_1");
  assert.equal((fixture.getBatch() as { metadata?: { platformFeeTotal?: string; driverTipTotal?: string; washoutActivityIds?: string } } | null)?.metadata?.platformFeeTotal, "25.00");
  assert.equal((fixture.getBatch() as { metadata?: { platformFeeTotal?: string; driverTipTotal?: string; washoutActivityIds?: string } } | null)?.metadata?.driverTipTotal, "0.00");
  assert.equal((fixture.getBatch() as { metadata?: { platformFeeTotal?: string; driverTipTotal?: string; washoutActivityIds?: string } } | null)?.metadata?.washoutActivityIds, "activity_1,activity_2,activity_3,activity_4,activity_5");
  assert.ok(!String((fixture.getBatch() as { metadata?: { washoutActivityIds?: string } } | null)?.metadata?.washoutActivityIds || "").includes("activity_6"));
  assert.ok(!String((fixture.getBatch() as { metadata?: { washoutActivityIds?: string } } | null)?.metadata?.washoutActivityIds || "").includes("activity_7"));
});

test("manual owner billing changes idempotency key when the approved washout set changes", async () => {
  const fixture = createOwnerBillingRunFixture({
    billingCadence: "weekly",
    approvedWashouts: [
      { activityId: "activity_1", activityFeeCentsPlatform: 500, activityStatus: "verified" },
    ],
    payments: [],
    stripeMode: "throw",
  });

  const first = await processOwnerBillingRun({
    ownerId: "owner_1",
    runType: "admin_manual",
    startDate: new Date("2026-05-28T00:00:00.000Z"),
    endDate: new Date("2026-05-29T23:59:59.999Z"),
    triggeredByAdminId: "admin_1",
    storage: fixture.storage,
    stripeClient: fixture.stripeClient,
  });

  const firstOptions = fixture.getLastIntentOptions() as { idempotencyKey?: string } | null;
  assert.equal(first.runs[0].status, "failed");
  assert.ok(firstOptions?.idempotencyKey);

  fixture.setApprovedWashouts([
    { activityId: "activity_1", activityFeeCentsPlatform: 500, activityStatus: "verified" },
    { activityId: "activity_2", activityFeeCentsPlatform: 500, activityStatus: "verified" },
  ]);

  let secondIntentOptions: { idempotencyKey?: string } | null = null;
  const retryStripeClient = {
    paymentIntents: {
      create: async (intent: Record<string, unknown>, options?: Record<string, unknown>) => {
        secondIntentOptions = (options || null) as { idempotencyKey?: string } | null;
        return {
          id: "pi_retry",
          status: "succeeded",
          amount: intent.amount,
          latest_charge: "ch_retry",
        };
      },
    },
  };

  const second = await processOwnerBillingRun({
    ownerId: "owner_1",
    runType: "admin_manual",
    startDate: new Date("2026-05-28T00:00:00.000Z"),
    endDate: new Date("2026-05-29T23:59:59.999Z"),
    triggeredByAdminId: "admin_1",
    storage: fixture.storage,
    stripeClient: retryStripeClient as any,
  });

  assert.equal(second.runs[0].status, "paid");
  assert.notEqual(firstOptions?.idempotencyKey, secondIntentOptions?.idempotencyKey);
  assert.equal(second.runs[0].washoutCount, 2);
});

test("manual owner billing accepts a Stripe customer stored on the user record", async () => {
  const fixture = createOwnerBillingRunFixture({
    billingCadence: "weekly",
    ownerStripeCustomerId: null,
    ownerUserStripeCustomerId: "cus_owner_1",
    approvedWashouts: [
      {
        activityId: "activity_1",
        activityFeeCentsPlatform: null,
        activityStatus: "verified",
      },
    ],
    payments: [],
    stripeMode: "succeeded",
  });

  const result = await processOwnerBillingRun({
    ownerId: "owner_1",
    runType: "admin_manual",
    startDate: new Date("2026-05-28T00:00:00.000Z"),
    endDate: new Date("2026-05-29T23:59:59.999Z"),
    triggeredByAdminId: "admin_1",
    storage: fixture.storage,
    stripeClient: fixture.stripeClient,
  });

  assert.equal(result.runs[0].status, "paid");
  assert.equal((fixture.getLastIntent() as { customer?: string } | null)?.customer, "cus_owner_1");
  assert.equal((fixture.getLastIntent() as { off_session?: boolean } | null)?.off_session, true);
  assert.deepEqual((fixture.getLastIntent() as { payment_method_types?: string[] } | null)?.payment_method_types, ["card"]);
});

test("manual owner billing accepts a Stripe customer stored on the owner record", async () => {
  const fixture = createOwnerBillingRunFixture({
    billingCadence: "weekly",
    ownerStripeCustomerId: "cus_owner_1",
    ownerUserStripeCustomerId: null,
    approvedWashouts: [
      {
        activityId: "activity_1",
        activityFeeCentsPlatform: null,
        activityStatus: "verified",
      },
    ],
    payments: [],
    stripeMode: "succeeded",
  });

  const result = await processOwnerBillingRun({
    ownerId: "owner_1",
    runType: "admin_manual",
    startDate: new Date("2026-05-28T00:00:00.000Z"),
    endDate: new Date("2026-05-29T23:59:59.999Z"),
    triggeredByAdminId: "admin_1",
    storage: fixture.storage,
    stripeClient: fixture.stripeClient,
  });

  assert.equal(result.runs[0].status, "paid");
  assert.equal((fixture.getLastIntent() as { customer?: string } | null)?.customer, "cus_owner_1");
  assert.equal((fixture.getLastIntent() as { off_session?: boolean } | null)?.off_session, true);
  assert.deepEqual((fixture.getLastIntent() as { payment_method_types?: string[] } | null)?.payment_method_types, ["card"]);
});

test("manual owner billing returns a clear error when the owner has no payment method", async () => {
  const fixture = createOwnerBillingRunFixture({
    billingCadence: "weekly",
    ownerStripePaymentMethodId: null,
    approvedWashouts: [
      {
        activityId: "activity_1",
        activityFeeCentsPlatform: 500,
        activityStatus: "verified",
      },
    ],
    payments: [],
    stripeMode: "succeeded",
  });

  const result = await processOwnerBillingRun({
    ownerId: "owner_1",
    runType: "admin_manual",
    startDate: new Date("2026-05-28T00:00:00.000Z"),
    endDate: new Date("2026-05-29T23:59:59.999Z"),
    triggeredByAdminId: "admin_1",
    storage: fixture.storage,
    stripeClient: fixture.stripeClient,
  });

  assert.equal(result.runs[0].status, "failed");
  assert.match(result.runs[0].message, /payment method/i);
  assert.equal(fixture.getChargeCount(), 0);
});

test("manual owner billing treats null fees as the default five dollars and explicit zero overrides as zero", async () => {
  const defaultFixture = createOwnerBillingRunFixture({
    billingCadence: "weekly",
    approvedWashouts: Array.from({ length: 7 }, (_, index) => ({
      activityId: `activity_${index + 1}`,
      activityFeeCentsPlatform: null,
      activityStatus: "verified",
    })),
    payments: [],
    stripeMode: "succeeded",
  });

  const defaultResult = await processOwnerBillingRun({
    ownerId: "owner_1",
    runType: "admin_manual",
    startDate: new Date("2026-05-28T00:00:00.000Z"),
    endDate: new Date("2026-05-29T23:59:59.999Z"),
    triggeredByAdminId: "admin_1",
    storage: defaultFixture.storage,
    stripeClient: defaultFixture.stripeClient,
  });

  assert.equal(defaultResult.runs[0].status, "paid");
  assert.equal((defaultFixture.getLastIntent() as { amount?: number } | null)?.amount, 3500);

  const zeroFixture = createOwnerBillingRunFixture({
    billingCadence: "weekly",
    ownerCustomPlatformFee: "0.00",
    approvedWashouts: [
      {
        activityId: "activity_1",
        activityFeeCentsPlatform: 0,
        activityStatus: "verified",
      },
    ],
    payments: [],
    stripeMode: "succeeded",
  });

  const zeroResult = await processOwnerBillingRun({
    ownerId: "owner_1",
    runType: "admin_manual",
    startDate: new Date("2026-05-28T00:00:00.000Z"),
    endDate: new Date("2026-05-29T23:59:59.999Z"),
    triggeredByAdminId: "admin_1",
    storage: zeroFixture.storage,
    stripeClient: zeroFixture.stripeClient,
  });

  assert.equal(zeroResult.runs[0].status, "skipped");
  assert.equal((zeroFixture.getLastIntent() as Record<string, unknown> | null), null);
});

test("manual owner billing excludes pending washouts and remains idempotent on retry", async () => {
  const fixture = createOwnerBillingRunFixture({
    billingCadence: "weekly",
    approvedWashouts: [
      { activityId: "activity_1", activityFeeCentsPlatform: 500, activityStatus: "verified" },
      { activityId: "activity_2", activityFeeCentsPlatform: 500, activityStatus: "pending" },
    ],
    payments: [],
    stripeMode: "succeeded",
  });

  const first = await processOwnerBillingRun({
    ownerId: "owner_1",
    runType: "admin_manual",
    startDate: new Date("2026-05-28T00:00:00.000Z"),
    endDate: new Date("2026-05-29T23:59:59.999Z"),
    triggeredByAdminId: "admin_1",
    storage: fixture.storage,
    stripeClient: fixture.stripeClient,
  });
  const second = await processOwnerBillingRun({
    ownerId: "owner_1",
    runType: "admin_manual",
    startDate: new Date("2026-05-28T00:00:00.000Z"),
    endDate: new Date("2026-05-29T23:59:59.999Z"),
    triggeredByAdminId: "admin_1",
    storage: fixture.storage,
    stripeClient: fixture.stripeClient,
  });

  assert.equal(first.runs[0].status, "paid");
  assert.equal(first.runs[0].washoutCount, 1);
  assert.equal(second.runs[0].status, "skipped");
  assert.equal(fixture.getChargeCount(), 1);
});

test("manual owner billing succeeds without driver Stripe onboarding data", async () => {
  const fixture = createOwnerBillingRunFixture({
    billingCadence: "weekly",
    approvedWashouts: [
      { activityId: "activity_1", activityFeeCentsPlatform: 500, activityStatus: "verified" },
    ],
    payments: [],
    stripeMode: "succeeded",
  });

  const result = await processOwnerBillingRun({
    ownerId: "owner_1",
    runType: "admin_manual",
    startDate: new Date("2026-05-28T00:00:00.000Z"),
    endDate: new Date("2026-05-28T23:59:59.999Z"),
    triggeredByAdminId: "admin_1",
    storage: fixture.storage,
    stripeClient: fixture.stripeClient,
  });

  assert.equal(result.runs[0].status, "paid");
  assert.equal((fixture.getLastIntent() as { amount?: number } | null)?.amount, 500);
});

test("duplicate owner billing run does not double charge", async () => {
  const fixture = createOwnerBillingRunFixture({
    billingCadence: "weekly",
    payments: [
      {
        id: "payment_1",
        amount: "10.00",
        processingFee: "5.00",
        washoutServiceFee: "0.00",
      },
    ],
    stripeMode: "succeeded",
  });

  const first = await processOwnerBillingRun({
    ownerId: "owner_1",
    runType: "weekly_scheduled",
    startDate: new Date("2026-05-28T00:00:00.000Z"),
    endDate: new Date("2026-05-28T23:59:59.999Z"),
    storage: fixture.storage,
    stripeClient: fixture.stripeClient,
  });
  const second = await processOwnerBillingRun({
    ownerId: "owner_1",
    runType: "weekly_scheduled",
    startDate: new Date("2026-05-28T00:00:00.000Z"),
    endDate: new Date("2026-05-28T23:59:59.999Z"),
    storage: fixture.storage,
    stripeClient: fixture.stripeClient,
  });

  assert.equal(first.runs[0].status, "paid");
  assert.equal(second.runs[0].status, "skipped");
  assert.equal(fixture.getChargeCount(), 1);
});

test("failed Stripe charge records failure without double charging", async () => {
  const fixture = createOwnerBillingRunFixture({
    billingCadence: "weekly",
    payments: [
      {
        id: "payment_1",
        amount: "10.00",
        processingFee: "5.00",
        washoutServiceFee: "0.00",
      },
    ],
    stripeMode: "throw",
  });

  const result = await processOwnerBillingRun({
    ownerId: "owner_1",
    runType: "weekly_scheduled",
    startDate: new Date("2026-05-28T00:00:00.000Z"),
    endDate: new Date("2026-05-28T23:59:59.999Z"),
    storage: fixture.storage,
    stripeClient: fixture.stripeClient,
  });

  assert.equal(result.runs[0].status, "failed");
  assert.equal((fixture.getBatch() as { status?: string; failureReason?: string } | null)?.status, "failed");
  assert.match(String((fixture.getBatch() as { failureReason?: string } | null)?.failureReason || ""), /Stripe charge failed/);
  assert.equal(fixture.getChargeCount(), 1);
});

test("owner billing skips cleanly when there are no billable washouts", async () => {
  const fixture = createOwnerBillingRunFixture({
    billingCadence: "weekly",
    payments: [],
    stripeMode: "succeeded",
  });

  const result = await processOwnerBillingRun({
    ownerId: "owner_1",
    runType: "weekly_scheduled",
    startDate: new Date("2026-05-28T00:00:00.000Z"),
    endDate: new Date("2026-05-28T23:59:59.999Z"),
    storage: fixture.storage,
    stripeClient: fixture.stripeClient,
  });

  assert.equal(result.runs[0].status, "skipped");
  assert.equal(result.runs[0].washoutCount, 0);
  assert.equal(fixture.getChargeCount(), 0);
});

test("superadmin lottery endpoints return data and draw alias is registered", async () => {
  const { app, gets, posts } = createRouteRegistry();

  await withPatchedStorage(
    {
      getUser: async () => ({
        id: "admin_1",
        username: "admin1",
        role: "super_admin",
      }),
      getFeatureFlag: async () => ({ enabled: true }),
      getLotteryDrawingByMonthYear: async () => null,
      getDriverLotteryEntryTotals: async () => ([{ driverId: "driver_1", driverName: "Driver One", totalEntries: 3 }]),
      getLotteryMonths: async () => ([{ month: 5, year: 2026, isArchived: false, totalEntries: 3 }]),
      getLotteryDrawings: async () => ([{ id: "drawing_1", lotteryMonth: 5, lotteryYear: 2026 }]),
      getPendingLotteryDrawings: async () => ([]),
      getAllDriverLotteryEntries: async () => ([{ id: "entry_1" }, { id: "entry_2" }]),
    },
    async () => {
      const { registerRoutes } = await import("../server/routes");
      await registerRoutes(app as never);

      const overviewRoute = gets.get("/api/admin/lottery");
      assert.equal(typeof overviewRoute, "function");
      const overviewRes = createResponse();
      await overviewRoute!(
        {
          user: { id: "admin_1" },
          query: { month: "5", year: "2026" },
        },
        overviewRes,
      );
      assert.equal(overviewRes.statusCode, 200);
      assert.equal((overviewRes.body as { totalEligibleWashouts?: number }).totalEligibleWashouts, 2);
      assert.equal((overviewRes.body as { totalTickets?: number }).totalTickets, 3);
      assert.equal((overviewRes.body as { driversEntered?: number }).driversEntered, 1);

      const totalsRoute = gets.get("/api/admin/lottery/totals");
      assert.equal(typeof totalsRoute, "function");
      const totalsRes = createResponse();
      await totalsRoute!(
        {
          user: { id: "admin_1" },
          query: { month: "5", year: "2026" },
        },
        totalsRes,
      );
      assert.equal(totalsRes.statusCode, 200);

      const entriesRoute = gets.get("/api/admin/lottery/entries");
      assert.equal(typeof entriesRoute, "function");
      const entriesRes = createResponse();
      await entriesRoute!(
        {
          user: { id: "admin_1" },
          query: { startDate: "2026-05-01T00:00:00.000Z", endDate: "2026-05-31T23:59:59.999Z" },
        },
        entriesRes,
      );
      assert.equal(entriesRes.statusCode, 200);

      const drawRoute = posts.get("/api/admin/lottery/draw");
      assert.equal(typeof drawRoute, "function");
      const drawRes = createResponse();
      await drawRoute!(
        {
          user: { id: "admin_1" },
        },
        drawRes,
      );
      assert.equal(drawRes.statusCode, 307);
      assert.equal(drawRes.headers.location, "/api/admin/lottery/execute");
    },
  );
});

test("superadmin lottery overview falls back when drawing status lookup fails", async () => {
  const { app, gets } = createRouteRegistry();

  await withPatchedStorage(
    {
      getUser: async () => ({
        id: "admin_1",
        username: "admin1",
        role: "super_admin",
      }),
      getLotteryDrawingByMonthYear: async () => {
        throw new Error("drawing lookup failed");
      },
      getDriverLotteryEntryTotals: async () => ([
        { driverId: "driver_1", driverName: "Driver One", totalEntries: 3 },
      ]),
      getLotteryMonths: async () => ([
        { month: 6, year: 2026, isArchived: false, totalEntries: 3 },
      ]),
      getLotteryDrawings: async () => ([
        { id: "drawing_1", lotteryMonth: 6, lotteryYear: 2026 },
      ]),
      getPendingLotteryDrawings: async () => ([]),
      getAllDriverLotteryEntries: async () => ([
        { id: "entry_1" },
        { id: "entry_2" },
      ]),
    },
    async () => {
      const { registerRoutes } = await import("../server/routes");
      await registerRoutes(app as never);
      const route = gets.get("/api/admin/lottery");
      assert.equal(typeof route, "function");

      const res = createResponse();
      await route!(
        {
          user: { id: "admin_1" },
          query: { month: "6", year: "2026" },
        },
        res,
      );

      assert.equal(res.statusCode, 200);
      assert.equal((res.body as { totalEligibleWashouts?: number }).totalEligibleWashouts, 2);
      assert.equal((res.body as { totalTickets?: number }).totalTickets, 3);
      assert.equal((res.body as { driversEntered?: number }).driversEntered, 1);
      assert.equal((res.body as { status?: { currentDrawing?: unknown } }).status?.currentDrawing, null);
    },
  );
});

test("driver and owner cannot access admin lottery endpoints", async () => {
  const { app, gets } = createRouteRegistry();

  await withPatchedStorage(
    {
      getUser: async (id: string) => {
        if (id === "admin_1") {
          return { id, username: "admin1", role: "super_admin" } as any;
        }
        if (id === "owner_user_1") {
          return { id, username: "owner1", role: "owner" } as any;
        }
        return { id, username: "driver1", role: "driver" } as any;
      },
    },
    async () => {
      const { registerRoutes } = await import("../server/routes");
      await registerRoutes(app as never);
      const route = gets.get("/api/admin/lottery");
      assert.equal(typeof route, "function");

      for (const user of [
        { id: "driver_user_1", role: "driver" },
        { id: "owner_user_1", role: "owner" },
      ]) {
        const res = createResponse();
        await route!(
          {
            user: { id: user.id },
          },
          res,
        );
        assert.equal(res.statusCode, 403);
      }
    },
  );
});

test("admin dashboard shows payments awaiting driver tip payout setup", async () => {
  const { app, gets } = createRouteRegistry();

  await withPatchedStorage(
    {
      getUser: async () => ({
        id: "admin_1",
        username: "admin1",
        role: "admin",
      }),
      getSystemStats: async () => ({ totalEarnings: 0, totalWashouts: 0, totalDrivers: 0, totalOwners: 0 }),
      getPaymentsAwaitingDriverStripe: async () => ([
        {
          id: "payment_1",
          amount: "10.00",
          processingFee: "5.00",
          status: "awaiting_driver_stripe",
          payoutStatus: "held_for_onboarding",
          driverUser: { username: "driver1" },
          activity: { location: { name: "Site A", street: "1 Main St" } },
          location: { name: "Site A", street: "1 Main St" },
        },
      ]),
    },
    async () => {
      const { registerRoutes } = await import("../server/routes");
      await registerRoutes(app as never);
      const route = gets.get("/api/admin/dashboard");
      assert.equal(typeof route, "function");

      const res = createResponse();
      await route!(
        {
          user: { id: "admin_1" },
        },
        res,
      );

      assert.equal(res.statusCode, 200);
      assert.equal((res.body as { awaitingDriverStripeCount?: number }).awaitingDriverStripeCount, 1);
    },
  );
});

test("admin dashboard surfaces repaired washout fee and lottery metrics", async () => {
  const { app, gets } = createRouteRegistry();

  await withPatchedStorage(
    {
      getUser: async () => ({
        id: "admin_1",
        username: "admin1",
        role: "super_admin",
      }),
      getSystemStats: async (days: number) => ({
        totalEarnings: 0,
        totalWashouts: 6,
        totalDrivers: 3,
        totalOwners: 2,
        platformWashoutRevenue: days === 7 ? 25 : 25,
        platformWashoutRevenueCents: days === 7 ? 2500 : 2500,
        platformFeeRecordCount: days === 7 ? 5 : 5,
        driverTipTotal: 0,
        billedWashouts: 5,
        pendingWashouts: 1,
        failedWashouts: 0,
        refundedWashouts: 0,
        disputedWashouts: 0,
        lotteryTicketCount: days === 7 ? 5 : 5,
        lotteryDriverCount: days === 7 ? 3 : 3,
        subscriptionRevenue: 0,
        activeLicenses: 0,
        licenseRenewals: 0,
      }),
      getPaymentsAwaitingDriverStripe: async () => [],
    },
    async () => {
      const { registerRoutes } = await import("../server/routes");
      await registerRoutes(app as never);
      const route = gets.get("/api/admin/dashboard");
      assert.equal(typeof route, "function");

      const res = createResponse();
      await route!(
        {
          user: { id: "admin_1" },
        },
        res,
      );

      assert.equal(res.statusCode, 200);
      const body = res.body as {
        weekStats?: {
          platformWashoutRevenue?: number;
          platformWashoutRevenueCents?: number;
          platformFeeRecordCount?: number;
          lotteryTicketCount?: number;
          lotteryDriverCount?: number;
        };
        dashboardMeta?: {
          httpStatus?: number;
          coreSources?: {
            platformWashoutRevenue?: string;
            lotteryTickets?: string;
          };
          readsFeeCentsPlatform?: boolean;
          readsDriverLotteryEntries?: boolean;
          weekStatsWindow?: { days?: number };
        };
      };
      assert.equal(body.weekStats?.platformWashoutRevenue, 25);
      assert.equal(body.weekStats?.platformWashoutRevenueCents, 2500);
      assert.equal(body.weekStats?.platformFeeRecordCount, 5);
      assert.equal(body.weekStats?.lotteryTicketCount, 5);
      assert.equal(body.weekStats?.lotteryDriverCount, 3);
      assert.equal(body.dashboardMeta?.httpStatus, 200);
      assert.equal(body.dashboardMeta?.coreSources?.platformWashoutRevenue, "washout_activities.fee_cents_platform");
      assert.equal(body.dashboardMeta?.coreSources?.lotteryTickets, "driver_lottery_entries");
      assert.equal(body.dashboardMeta?.readsFeeCentsPlatform, true);
      assert.equal(body.dashboardMeta?.readsDriverLotteryEntries, true);
      assert.equal(body.dashboardMeta?.weekStatsWindow?.days, 7);
    },
  );
});

test("admin dashboard surfaces metric-specific errors for core stats without global fallback", async () => {
  const { app, gets } = createRouteRegistry();

  await withPatchedStorage(
    {
      getUser: async () => ({
        id: "admin_1",
        username: "admin1",
        role: "super_admin",
      }),
      getSystemStats: async () => ({
        totalEarnings: 0,
        totalWashouts: 0,
        totalDrivers: 0,
        totalOwners: 0,
        platformWashoutRevenue: null,
        platformWashoutRevenueCents: null,
        platformFeeRecordCount: null,
        approvedWashouts: null,
        driverTipTotal: null,
        billedWashouts: null,
        pendingWashouts: null,
        failedWashouts: null,
        refundedWashouts: null,
        disputedWashouts: null,
        lotteryTicketCount: 0,
        lotteryDriverCount: 0,
        subscriptionRevenue: 0,
        activeLicenses: 0,
        licenseRenewals: 0,
        washoutRevenueError: "Unable to load washout revenue metrics.",
      }),
      getPaymentsAwaitingDriverStripe: async () => [],
    },
    async () => {
      const { registerRoutes } = await import("../server/routes");
      await registerRoutes(app as never);
      const route = gets.get("/api/admin/dashboard");
      assert.equal(typeof route, "function");

      const res = createResponse();
      await route!(
        {
          user: { id: "admin_1" },
        },
        res,
      );

      assert.equal(res.statusCode, 200);
      const body = res.body as {
        weekStats?: {
          platformWashoutRevenue?: number | null;
          platformWashoutRevenueCents?: number | null;
          platformFeeRecordCount?: number | null;
          approvedWashouts?: number | null;
          washoutRevenueError?: string;
        };
        dashboardErrors?: Record<string, string>;
      };
      assert.equal(body.weekStats?.platformWashoutRevenue, null);
      assert.equal(body.weekStats?.platformWashoutRevenueCents, null);
      assert.equal(body.weekStats?.platformFeeRecordCount, null);
      assert.equal(body.weekStats?.approvedWashouts, null);
      assert.equal(body.weekStats?.washoutRevenueError, "Unable to load washout revenue metrics.");
      assert.ok(!body.dashboardErrors?.weekStats);
    },
  );
});

test("admin dashboard keeps core metrics online when optional widgets fail", async () => {
  const { app, gets } = createRouteRegistry();

  await withPatchedStorage(
    {
      getUser: async () => ({
        id: "admin_1",
        username: "admin1",
        role: "super_admin",
      }),
      getSystemStats: async (days: number) => {
        if (days === 7) {
          return {
            totalEarnings: 0,
            totalWashouts: 4,
            totalDrivers: 2,
            totalOwners: 1,
            platformWashoutRevenue: 25,
            platformWashoutRevenueCents: 2500,
            platformFeeRecordCount: 5,
            driverTipTotal: 3.5,
            billedWashouts: 4,
            pendingWashouts: 0,
            failedWashouts: 0,
            refundedWashouts: 0,
            disputedWashouts: 0,
            lotteryTicketCount: 5,
            lotteryDriverCount: 3,
            subscriptionRevenue: 0,
            activeLicenses: 0,
            licenseRenewals: 0,
          };
        }
        throw new Error("monthly stats unavailable");
      },
      getPaymentsAwaitingDriverStripe: async () => {
        throw new Error("stripe queue unavailable");
      },
    },
    async () => {
      const { registerRoutes } = await import("../server/routes");
      await registerRoutes(app as never);
      const route = gets.get("/api/admin/dashboard");
      assert.equal(typeof route, "function");

      const res = createResponse();
      await route!(
        {
          user: { id: "admin_1" },
        },
        res,
      );

      assert.equal(res.statusCode, 200);
      const body = res.body as {
        weekStats?: {
          platformWashoutRevenue?: number;
          platformWashoutRevenueCents?: number;
          platformFeeRecordCount?: number;
          lotteryTicketCount?: number;
          lotteryDriverCount?: number;
        };
        monthStats?: { totalWashouts?: number };
        awaitingDriverStripeCount?: number;
        dashboardErrors?: Record<string, string>;
      };
      assert.equal(body.weekStats?.platformWashoutRevenue, 25);
      assert.equal(body.weekStats?.platformWashoutRevenueCents, 2500);
      assert.equal(body.weekStats?.platformFeeRecordCount, 5);
      assert.equal(body.weekStats?.lotteryTicketCount, 5);
      assert.equal(body.weekStats?.lotteryDriverCount, 3);
      assert.equal(body.monthStats?.totalWashouts, 0);
      assert.equal(body.awaitingDriverStripeCount, 0);
      assert.ok(!body.dashboardErrors?.weekStats);
      assert.ok(body.dashboardErrors?.monthStats);
      assert.ok(body.dashboardErrors?.awaitingDriverStripePayments);
    },
  );
});

test("admin dashboard stays online when awaiting driver stripe query hits missing payout_status column", async () => {
  const { app, gets } = createRouteRegistry();

  await withPatchedStorage(
    {
      getUser: async () => ({
        id: "admin_1",
        username: "admin1",
        role: "super_admin",
      }),
      getSystemStats: async () => ({
        totalEarnings: 0,
        totalWashouts: 0,
        totalDrivers: 0,
        totalOwners: 0,
        platformWashoutRevenue: 25,
        platformWashoutRevenueCents: 2500,
        platformFeeRecordCount: 5,
        approvedWashouts: 5,
        driverTipTotal: 0,
        billedWashouts: 5,
        pendingWashouts: 0,
        failedWashouts: 0,
        refundedWashouts: 0,
        disputedWashouts: 0,
        lotteryTicketCount: 5,
        lotteryDriverCount: 3,
        subscriptionRevenue: 0,
        activeLicenses: 0,
        licenseRenewals: 0,
      }),
      getPaymentsAwaitingDriverStripe: async () => {
        throw new Error("column payments.payout_status does not exist");
      },
    },
    async () => {
      const { registerRoutes } = await import("../server/routes");
      await registerRoutes(app as never);
      const route = gets.get("/api/admin/dashboard");
      assert.equal(typeof route, "function");

      const res = createResponse();
      await route!(
        {
          user: { id: "admin_1" },
        },
        res,
      );

      assert.equal(res.statusCode, 200);
      const body = res.body as {
        weekStats?: {
          platformWashoutRevenue?: number;
          approvedWashouts?: number;
          lotteryTicketCount?: number;
        };
        awaitingDriverStripeCount?: number;
        dashboardErrors?: Record<string, string>;
      };
      assert.equal(body.weekStats?.platformWashoutRevenue, 25);
      assert.equal(body.weekStats?.approvedWashouts, 5);
      assert.equal(body.weekStats?.lotteryTicketCount, 5);
      assert.equal(body.awaitingDriverStripeCount, 0);
      assert.ok(body.dashboardErrors?.awaitingDriverStripePayments);
    },
  );
});

test("admin billing settings endpoint exposes daily weekly monthly cadence options", async () => {
  const { app, gets } = createRouteRegistry();

  await withPatchedStorage(
    {
      getUser: async () => ({
        id: "admin_1",
        username: "admin1",
        role: "super_admin",
      }),
      getAllOwnersBillingSettings: async () => [
        {
          ownerId: "owner_1",
          companyName: "Owner Co",
          username: "owner1",
          billingCadence: "weekly",
          billingCutoffTime: "23:59:00",
          billingTimezone: "America/Chicago",
          billingDayOfWeek: 1,
        },
      ],
    },
    async () => {
      const { registerRoutes } = await import("../server/routes");
      await registerRoutes(app as never);
      const route = gets.get("/api/admin/billing/settings");
      assert.equal(typeof route, "function");

      const res = createResponse();
      await route!(
        {
          user: { id: "admin_1" },
          query: {},
        },
        res,
      );

      assert.equal(res.statusCode, 200);
      const body = res.body as {
        owners?: Array<{ billingCadence?: string }>;
        billingCadenceOptions?: Array<{ value?: string }>;
      };
      assert.equal(body.owners?.[0]?.billingCadence, "weekly");
      assert.deepEqual(body.billingCadenceOptions?.map((option) => option.value), ["immediate", "daily", "weekly", "monthly"]);
    },
  );
});

test("admin billing settings endpoint exposes immediate billing owners and history", async () => {
  const { app, gets } = createRouteRegistry();

  await withPatchedStorage(
    {
      getUser: async () => ({
        id: "admin_1",
        username: "admin1",
        role: "super_admin",
      }),
      getAllOwnersBillingSettings: async () => [
        {
          ownerId: "owner_1",
          companyName: "Immediate Co",
          username: "immediate1",
          billingCadence: "immediate",
          billingCutoffTime: "23:59:00",
          billingTimezone: "America/Chicago",
          billingDayOfWeek: 1,
        },
      ],
      getOwnerById: async () => ({
        id: "owner_1",
        userId: "owner_user_1",
        companyName: "Immediate Co",
        stripePaymentMethodId: "pm_owner_1",
      }),
      getApprovedWashoutsForOwnerBilling: async () => ([
        {
          activityId: "activity_1",
          ownerId: "owner_1",
          driverId: "driver_1",
          locationId: "location_1",
          activityStatus: "verified",
          activityFeeCentsPlatform: null,
          locationDriverIncentiveTip: 0,
          verifiedAt: new Date("2026-05-28T12:00:00Z"),
        },
      ]),
      getBillingBatchesByOwner: async () => ([
        {
          id: "batch_1",
          ownerId: "owner_1",
          businessDate: "2026-05-28",
          status: "completed",
          totalAmount: "5.00",
          totalFees: "0.00",
          paymentCount: 1,
          stripePaymentIntentId: "pi_1",
          failureReason: null,
          metadata: {
            stripeChargeId: "ch_1",
          },
          createdAt: new Date("2026-05-28T14:00:00Z"),
          updatedAt: new Date("2026-05-28T14:05:00Z"),
        } as any,
      ]),
    },
    async () => {
      const { registerRoutes } = await import("../server/routes");
      await registerRoutes(app as never);
      const route = gets.get("/api/admin/billing/settings");
      assert.equal(typeof route, "function");

      const res = createResponse();
      await route!(
        {
          user: { id: "admin_1" },
          query: {},
        },
        res,
      );

      assert.equal(res.statusCode, 200);
      const body = res.body as {
        immediateBillingOwners?: Array<{
          ownerId?: string;
          approvedWashoutCount?: number;
          platformFeesOwedCents?: number;
          lastStripePaymentIntentId?: string | null;
          lastStripeChargeId?: string | null;
          lastBillingStatus?: string;
        }>;
        immediateBillingHistory?: Array<{
          batchId?: string;
          stripePaymentIntentId?: string | null;
          stripeChargeId?: string | null;
        }>;
      };
      assert.equal(body.immediateBillingOwners?.length, 1);
      assert.equal(body.immediateBillingOwners?.[0]?.ownerId, "owner_1");
      assert.equal(body.immediateBillingOwners?.[0]?.approvedWashoutCount, 1);
      assert.equal(body.immediateBillingOwners?.[0]?.platformFeesOwedCents, 500);
      assert.equal(body.immediateBillingOwners?.[0]?.lastStripePaymentIntentId, "pi_1");
      assert.equal(body.immediateBillingOwners?.[0]?.lastStripeChargeId, "ch_1");
      assert.equal(body.immediateBillingOwners?.[0]?.lastBillingStatus, "completed");
      assert.equal(body.immediateBillingHistory?.[0]?.batchId, "batch_1");
      assert.equal(body.immediateBillingHistory?.[0]?.stripePaymentIntentId, "pi_1");
      assert.equal(body.immediateBillingHistory?.[0]?.stripeChargeId, "ch_1");
    },
  );
});

test("admin billing settings endpoint shows reconciliation notes for overcharged runs", async () => {
  const { app, gets } = createRouteRegistry();

  await withPatchedStorage(
    {
      getUser: async () => ({
        id: "admin_1",
        username: "admin1",
        role: "super_admin",
      }),
      getAllOwnersBillingSettings: async () => [
        {
          ownerId: "owner_1",
          companyName: "Immediate Co",
          username: "immediate1",
          billingCadence: "immediate",
          billingCutoffTime: "23:59:00",
          billingTimezone: "America/Chicago",
          billingDayOfWeek: 1,
        },
      ],
      getOwnerById: async () => ({
        id: "owner_1",
        userId: "owner_user_1",
        companyName: "Immediate Co",
        stripePaymentMethodId: "pm_owner_1",
      }),
      getApprovedWashoutsForOwnerBilling: async () => ([
        { activityId: "activity_1", activityFeeCentsPlatform: null },
        { activityId: "activity_2", activityFeeCentsPlatform: null },
        { activityId: "activity_3", activityFeeCentsPlatform: null },
        { activityId: "activity_4", activityFeeCentsPlatform: null },
        { activityId: "activity_5", activityFeeCentsPlatform: null },
      ]),
      getBillingBatchesByOwner: async () => ([
        {
          id: "batch_1",
          ownerId: "owner_1",
          businessDate: "2026-05-28",
          status: "completed",
          totalAmount: "35.00",
          totalFees: "0.00",
          paymentCount: 7,
          stripePaymentIntentId: "pi_1",
          failureReason: null,
          metadata: {
            stripeChargeId: "ch_1",
            washoutActivityIds: "activity_1,activity_2,activity_3,activity_4,activity_5,activity_6,activity_7",
          },
          createdAt: new Date("2026-05-28T14:00:00Z"),
          updatedAt: new Date("2026-05-28T14:05:00Z"),
        } as any,
      ]),
    },
    async () => {
      const { registerRoutes } = await import("../server/routes");
      await registerRoutes(app as never);
      const route = gets.get("/api/admin/billing/settings");
      assert.equal(typeof route, "function");

      const res = createResponse();
      await route!(
        {
          user: { id: "admin_1" },
          query: {},
        },
        res,
      );

      assert.equal(res.statusCode, 200);
      const body = res.body as {
        immediateBillingOwners?: Array<{
          platformFeesOwedCents?: number;
          lastBillingAmountCents?: number;
          billingReconciliationStatus?: string | null;
          billingReconciliationNote?: string | null;
        }>;
      };
      assert.equal(body.immediateBillingOwners?.[0]?.platformFeesOwedCents, 2500);
      assert.equal(body.immediateBillingOwners?.[0]?.lastBillingAmountCents, 3500);
      assert.equal(body.immediateBillingOwners?.[0]?.billingReconciliationStatus, "overcharged");
      assert.match(body.immediateBillingOwners?.[0]?.billingReconciliationNote || "", /Expected \$25\.00, actual Stripe charge was \$35\.00\./);
    },
  );
});

test("admin billing settings update accepts daily weekly and monthly cadences", async () => {
  const { app, puts } = createRouteRegistry();
  const updates: Array<Record<string, unknown>> = [];

  await withPatchedStorage(
    {
      getUser: async () => ({
        id: "admin_1",
        username: "admin1",
        role: "super_admin",
      }),
      getOwnerById: async () => ({
        id: "owner_1",
        userId: "owner_user_1",
        companyName: "Owner Co",
      }),
      updateOwnerBillingSettings: async (_ownerId: string, settings: Record<string, unknown>) => {
        updates.push(settings);
        return {
          id: "owner_1",
          userId: "owner_user_1",
          companyName: "Owner Co",
          billingCadence: settings.billingCadence || "weekly",
          billingCutoffTime: settings.billingCutoffTime || "23:59:00",
          billingTimezone: settings.billingTimezone || "America/Chicago",
          billingDayOfWeek: settings.billingDayOfWeek ?? 0,
        } as any;
      },
    },
    async () => {
      const { registerRoutes } = await import("../server/routes");
      await registerRoutes(app as never);
      const route = puts.get("/api/admin/billing/settings/:ownerId");
      assert.equal(typeof route, "function");

      for (const billingCadence of ["immediate", "daily", "weekly", "monthly"] as const) {
        const res = createResponse();
        await route!(
          {
            params: { ownerId: "owner_1" },
            user: { id: "admin_1" },
            body: {
              billingCadence,
              billingCutoffTime: "23:59",
              billingTimezone: "America/Chicago",
              billingDayOfWeek: 1,
            },
          },
          res,
        );

        assert.equal(res.statusCode, 200);
        const body = res.body as { settings?: { billingCadence?: string } };
        assert.equal(body.settings?.billingCadence, billingCadence);
      }

      assert.deepEqual(
        updates.map((entry) => entry.billingCadence),
        ["immediate", "daily", "weekly", "monthly"],
      );
    },
  );
});

test("admin billing settings rejects invalid cadence values", async () => {
  const { app, puts } = createRouteRegistry();

  await withPatchedStorage(
    {
      getUser: async () => ({
        id: "admin_1",
        username: "admin1",
        role: "super_admin",
      }),
      getOwnerById: async () => ({
        id: "owner_1",
        userId: "owner_user_1",
        companyName: "Owner Co",
      }),
    },
    async () => {
      const { registerRoutes } = await import("../server/routes");
      await registerRoutes(app as never);
      const route = puts.get("/api/admin/billing/settings/:ownerId");
      assert.equal(typeof route, "function");

      const res = createResponse();
      await route!(
        {
          params: { ownerId: "owner_1" },
          user: { id: "admin_1" },
          body: {
            billingCadence: "hourly",
          },
        },
        res,
      );

      assert.equal(res.statusCode, 400);
      assert.match(String((res.body as { message?: string }).message || ""), /immediate.*daily.*weekly.*monthly/i);
    },
  );
});

test("admin payments endpoint stays online when the payments query fails", async () => {
  const { app, gets } = createRouteRegistry();

  await withPatchedStorage(
    {
      getUser: async () => ({
        id: "admin_1",
        username: "admin1",
        role: "super_admin",
      }),
      getAllPayments: async () => {
        throw new Error("payments query failed");
      },
    },
    async () => {
      const { registerRoutes } = await import("../server/routes");
      await registerRoutes(app as never);
      const route = gets.get("/api/admin/payments");
      assert.equal(typeof route, "function");

      const res = createResponse();
      await route!(
        {
          user: { id: "admin_1" },
          query: {},
        },
        res,
      );

      assert.equal(res.statusCode, 200);
      assert.deepEqual(res.body, []);
    },
  );
});

test("admin payments endpoint returns an empty array when there are no payment rows", async () => {
  const { app, gets } = createRouteRegistry();

  await withPatchedStorage(
    {
      getUser: async () => ({
        id: "admin_1",
        username: "admin1",
        role: "super_admin",
      }),
      getAllPayments: async () => [],
    },
    async () => {
      const { registerRoutes } = await import("../server/routes");
      await registerRoutes(app as never);
      const route = gets.get("/api/admin/payments");
      assert.equal(typeof route, "function");

      const res = createResponse();
      await route!(
        {
          user: { id: "admin_1" },
          query: {},
        },
        res,
      );

      assert.equal(res.statusCode, 200);
      assert.deepEqual(res.body, []);
    },
  );
});

test("admin payments endpoint returns minimal payment rows without legacy fields", async () => {
  const { app, gets } = createRouteRegistry();

  await withPatchedStorage(
    {
      getUser: async () => ({
        id: "admin_1",
        username: "admin1",
        role: "super_admin",
      }),
      getAllPayments: async () => [
        {
          id: "payment_1",
          driverId: "driver_1",
          ownerId: "owner_1",
          activityId: "activity_1",
          amount: "25.00",
          processingFee: "5.00",
          platformFee: "5.00",
          tipAmountCents: 150,
          status: "completed",
          stripePaymentIntentId: "pi_123",
          stripeChargeId: "ch_123",
          createdAt: new Date("2025-06-01T12:00:00.000Z"),
          paidAt: new Date("2025-06-01T12:05:00.000Z"),
          driver: {
            id: "driver_1",
            userId: "driver_user_1",
            truckNumber: "Truck 1",
            user: {
              id: "driver_user_1",
              firstName: "Driver",
              lastName: "One",
              email: "driver@example.com",
            },
          },
          owner: {
            id: "owner_1",
            userId: "owner_user_1",
            companyName: "Alpha Concrete",
            user: {
              id: "owner_user_1",
              firstName: "Owner",
              lastName: "One",
              email: "owner@example.com",
            },
          },
          activity: {
            id: "activity_1",
            locationId: "location_1",
            checkInTime: new Date("2025-06-01T11:00:00.000Z"),
            status: "verified",
            amount: "20.00",
            notes: "approved washout",
          },
        } as any,
      ],
    },
    async () => {
      const { registerRoutes } = await import("../server/routes");
      await registerRoutes(app as never);
      const route = gets.get("/api/admin/payments");
      assert.equal(typeof route, "function");

      const res = createResponse();
      await route!(
        {
          user: { id: "admin_1" },
          query: {},
        },
        res,
      );

      assert.equal(res.statusCode, 200);
      assert.equal(Array.isArray(res.body), true);
      assert.equal((res.body as Array<{ id?: string }>).length, 1);
      const payment = (res.body as Array<any>)[0];
      assert.equal(payment.id, "payment_1");
      assert.equal(payment.platformFee, "5.00");
      assert.equal(payment.tipAmountCents, 150);
      assert.equal(payment.washoutServiceFee, undefined);
      assert.equal(payment.businessDate, undefined);
      assert.equal(payment.driver?.user?.firstName, "Driver");
      assert.equal(payment.owner?.companyName, "Alpha Concrete");
      assert.equal(payment.activity?.id, "activity_1");
    },
  );
});

test("admin dashboard returns partial data when one widget query fails", async () => {
  const { app, gets } = createRouteRegistry();

  await withPatchedStorage(
    {
      getUser: async () => ({
        id: "admin_1",
        username: "admin1",
        role: "super_admin",
      }),
      getSystemStats: async (days: number) => {
        if (days === 7) {
          throw new Error("weekly stats unavailable");
        }
        return {
          totalEarnings: 0,
          totalWashouts: 0,
          totalDrivers: 0,
          totalOwners: 0,
          platformWashoutRevenue: 0,
          driverTipTotal: 0,
          billedWashouts: 0,
          pendingWashouts: 0,
          failedWashouts: 0,
          refundedWashouts: 0,
          disputedWashouts: 0,
          subscriptionRevenue: 0,
          activeLicenses: 0,
          licenseRenewals: 0,
        };
      },
      getPaymentsAwaitingDriverStripe: async () => {
        throw new Error("stripe queue unavailable");
      },
    },
    async () => {
      const { registerRoutes } = await import("../server/routes");
      await registerRoutes(app as never);
      const route = gets.get("/api/admin/dashboard");
      assert.equal(typeof route, "function");

      const res = createResponse();
      await route!(
        {
          user: { id: "admin_1" },
        },
        res,
      );

      assert.equal(res.statusCode, 200);
      const body = res.body as {
        weekStats?: { platformWashoutRevenue?: number };
        monthStats?: { totalWashouts?: number };
        awaitingDriverStripeCount?: number;
        dashboardErrors?: Record<string, string>;
      };
      assert.equal(body.weekStats?.platformWashoutRevenue, 0);
      assert.equal(body.monthStats?.totalWashouts, 0);
      assert.equal(body.awaitingDriverStripeCount, 0);
      assert.ok(body.dashboardErrors?.weekStats);
      assert.ok(body.dashboardErrors?.awaitingDriverStripePayments);
    },
  );
});

test("deferred driver Stripe payment can be processed once the driver is ready", async () => {
  const { app, posts } = createRouteRegistry();
  let paymentStatusUpdates: Array<Record<string, unknown>> = [];

  await withMockedDb([[]], async (mock) => {
    await withPatchedStripe(
      {
        accounts: {
          retrieve: async () => ({
            id: "acct_driver_1",
            capabilities: { transfers: "active" },
          }),
        },
        paymentMethods: {
          retrieve: async () => ({
            id: "pm_owner_1",
            type: "card",
            card: { brand: "visa", last4: "4242" },
          }),
        },
        paymentIntents: {
          create: async () => ({
            id: "pi_deferred_1",
            status: "succeeded",
          }),
        },
      },
      async () => {
        await withPatchedStorage(
          {
            getPaymentById: async () => ({
              id: "payment_1",
              activityId: "activity_1",
              driverId: "driver_row_1",
              ownerId: "owner_1",
              amount: "10.00",
              processingFee: "5.00",
              washoutServiceFee: "5.00",
              tipAmountCents: 500,
              payoutStatus: "held_for_onboarding",
              status: "awaiting_driver_stripe",
              businessDate: "2026-05-28",
            }),
            getWashoutActivity: async () => ({
              id: "activity_1",
              locationId: "location_1",
              status: "verified",
              amount: "10.00",
              driverId: "driver_row_1",
              serviceType: "washout",
            }),
            getWashoutLocation: async () => ({
              id: "location_1",
              ownerId: "owner_1",
              name: "Site A",
              street: "1 Main St",
            }),
            getOwnerById: async () => ({
              id: "owner_1",
              userId: "user_owner_1",
              useCustomBillingModel: false,
              customWashoutRate: null,
              stripeCustomerId: "cus_owner_1",
              stripePaymentMethodId: "pm_owner_1",
            }),
            getUser: async (id: string) => {
              if (id === "admin_1") {
                return {
                  id: "admin_1",
                  username: "admin1",
                  role: "admin",
                };
              }
              if (id === "user_owner_1") {
                return {
                  id: "user_owner_1",
                  username: "owner1",
                  firstName: "Owner",
                  lastName: "One",
                  stripeCustomerId: "cus_owner_1",
                  stripePaymentMethodId: "pm_owner_1",
                };
              }
              return {
                id: "driver_user_1",
                username: "driver1",
                firstName: "Driver",
                lastName: "One",
                stripeConnectAccountId: "acct_driver_1",
              };
            },
            getDriverById: async () => ({
              id: "driver_row_1",
              userId: "driver_user_1",
            }),
            getDriverWallet: async () => null,
            createDriverWallet: async () => ({ id: "wallet_1" }),
            adjustDriverWalletBalance: async () => undefined,
            createWalletTransaction: async () => undefined,
            createDriverLotteryEntry: async () => ({ id: "lottery_1" }),
            updatePaymentStatus: async () => ({
              id: "payment_1",
              status: "completed",
            }),
          },
          async () => {
            const { registerRoutes } = await import("../server/routes");
            await registerRoutes(app as never);
            const route = posts.get("/api/admin/payments/process-awaiting-driver-stripe");
            assert.equal(typeof route, "function");

            const res = createResponse();
            await route!(
              {
                body: { paymentId: "payment_1" },
                user: { id: "admin_1", role: "admin" },
              },
              res,
            );

            assert.equal(res.statusCode, 200);
            assert.equal((res.body as { processed?: number }).processed, 1);
            assert.equal((res.body as { skipped?: number }).skipped, 0);
            assert.equal((res.body as { failed?: number }).failed, 0);
            paymentStatusUpdates = mock.updates;
          },
        );
      },
    );
  });

  assert.ok(paymentStatusUpdates.length > 0);
});

test("deferred driver Stripe payment remains held when the driver is not ready", async () => {
  const { app, posts } = createRouteRegistry();

  await withMockedDb([[]], async () => {
    await withPatchedStorage(
      {
        getPaymentById: async () => ({
          id: "payment_held_1",
          activityId: "activity_1",
          driverId: "driver_row_1",
          ownerId: "owner_1",
          amount: "10.00",
          processingFee: "5.00",
          washoutServiceFee: "1.50",
          tipAmountCents: 150,
          payoutStatus: "held_for_onboarding",
          status: "awaiting_driver_stripe",
          businessDate: "2026-05-28",
        }),
        getWashoutActivity: async () => ({
          id: "activity_1",
          locationId: "location_1",
          status: "verified",
          amount: "10.00",
          driverId: "driver_row_1",
          serviceType: "washout",
        }),
        getWashoutLocation: async () => ({
          id: "location_1",
          ownerId: "owner_1",
          name: "Site A",
          street: "1 Main St",
        }),
        getOwnerById: async () => ({
          id: "owner_1",
          userId: "user_owner_1",
          useCustomBillingModel: false,
          customWashoutRate: null,
          stripeCustomerId: "cus_owner_1",
          stripePaymentMethodId: "pm_owner_1",
        }),
        getUser: async (id: string) => {
          if (id === "admin_1") {
            return {
              id: "admin_1",
              username: "admin1",
              role: "admin",
            };
          }
          if (id === "user_owner_1") {
            return {
              id: "user_owner_1",
              username: "owner1",
              firstName: "Owner",
              lastName: "One",
              stripeCustomerId: "cus_owner_1",
              stripePaymentMethodId: "pm_owner_1",
            };
          }
          return {
            id: "driver_user_1",
            username: "driver1",
            firstName: "Driver",
            lastName: "One",
            stripeConnectAccountId: null,
          };
        },
        getDriverById: async () => ({
          id: "driver_row_1",
          userId: "driver_user_1",
        }),
      },
      async () => {
        const { registerRoutes } = await import("../server/routes");
        await registerRoutes(app as never);
        const route = posts.get("/api/admin/payments/process-awaiting-driver-stripe");
        assert.equal(typeof route, "function");

        const res = createResponse();
        await route!(
          {
            body: { paymentId: "payment_held_1" },
            user: { id: "admin_1", role: "admin" },
          },
          res,
        );

        assert.equal(res.statusCode, 200);
        assert.equal((res.body as { processed?: number }).processed, 0);
        assert.equal((res.body as { skipped?: number }).skipped, 1);
        assert.match(String(JSON.stringify(res.body)), /held for onboarding|Stripe not ready/i);
      },
    );
  });
});

test("owner verify is idempotent for lottery entry creation on retry", async () => {
  const { app, puts } = createRouteRegistry();
  let activityStatus: "pending" | "verified" | "rejected" = "pending";
  let lotteryEntryCalls = 0;

  await withMockedDb([[]], async () => {
    await withPatchedStripe(
      {
        accounts: {
          retrieve: async () => ({
            id: "acct_driver_1",
            capabilities: { transfers: "active" },
          }),
        },
      },
      async () => {
        await withPatchedStorage(
          {
            getOwner: async () => ({
              id: "owner_1",
              userId: "user_1",
              useCustomBillingModel: true,
              customWashoutRate: "12.00",
            }),
            getWashoutActivity: async () => ({
              id: "activity_1",
              locationId: "location_1",
              status: activityStatus,
              amount: "10.00",
              driverId: "driver_row_1",
              serviceType: "washout",
            }),
            getWashoutLocation: async () => ({
              id: "location_1",
              ownerId: "owner_1",
            }),
            getOwnerBillingSettings: async () => ({
              billingCadence: "weekly",
              billingTimezone: "America/Chicago",
              billingCutoffTime: "23:59:00",
            }),
            calculateBusinessDateForOwner: async () => "2026-05-22",
            getDriverById: async () => ({
              id: "driver_row_1",
              userId: "driver_user_1",
            }),
            getUserById: async () => ({
              id: "driver_user_1",
              username: "driver1",
              firstName: "Driver",
              lastName: "One",
              stripeConnectAccountId: "acct_driver_1",
            }),
            getFeatureFlag: async () => ({ enabled: true }),
            createPayment: async () => ({
              id: "payment_1",
            }),
            verifyWashoutActivity: async () => {
              activityStatus = "verified";
              return {
                id: "activity_1",
                locationId: "location_1",
                status: "verified",
                amount: "10.00",
                driverId: "driver_row_1",
                serviceType: "washout",
              };
            },
            createDriverLotteryEntry: async () => {
              lotteryEntryCalls += 1;
              return {
                id: "lottery_entry_1",
                driverId: "driver_row_1",
                activityId: "activity_1",
                ownerId: "owner_1",
                ticketNumber: "CX-202605-0001",
                entriesEarned: 1,
                lotteryMonth: 5,
                lotteryYear: 2026,
                isArchived: false,
              };
            },
          },
          async () => {
            const { registerRoutes } = await import("../server/routes");
            await registerRoutes(app as never);
            const route = puts.get("/api/owners/activities/:id/verify");
            assert.equal(typeof route, "function");

            const firstRes = createResponse();
            await route!(
              {
                params: { id: "activity_1" },
                user: { id: "user_1" },
              },
              firstRes,
            );

            assert.equal(firstRes.statusCode, 200);
            assert.equal(lotteryEntryCalls, 1);

            const secondRes = createResponse();
            await route!(
              {
                params: { id: "activity_1" },
                user: { id: "user_1" },
              },
              secondRes,
            );

            assert.equal(secondRes.statusCode, 409);
            assert.equal(lotteryEntryCalls, 1);
          },
        );
      },
    );
  });
});

test("owner verify creates a lottery entry for standard weekly billing and remains idempotent on retry", async () => {
  const { app, puts } = createRouteRegistry();
  let activityStatus: "pending" | "verified" | "rejected" = "pending";
  let lotteryEntryCalls = 0;

  await withMockedDb([[]], async () => {
    await withPatchedStripe(
      {
        accounts: {
          retrieve: async () => ({
            id: "acct_driver_1",
            capabilities: { transfers: "active" },
          }),
        },
      },
      async () => {
        await withPatchedStorage(
          {
            getOwner: async () => ({
              id: "owner_1",
              userId: "user_1",
              useCustomBillingModel: false,
              customWashoutRate: null,
            }),
            getWashoutActivity: async () => ({
              id: "activity_1",
              locationId: "location_1",
              status: activityStatus,
              amount: "10.00",
              driverId: "driver_row_1",
              serviceType: "washout",
            }),
            getWashoutLocation: async () => ({
              id: "location_1",
              ownerId: "owner_1",
            }),
            getOwnerBillingSettings: async () => ({
              billingCadence: "weekly",
              billingTimezone: "America/Chicago",
              billingCutoffTime: "23:59:00",
            }),
            calculateBusinessDateForOwner: async () => "2026-05-22",
            getDriverById: async () => ({
              id: "driver_row_1",
              userId: "driver_user_1",
            }),
            getUserById: async () => ({
              id: "driver_user_1",
              username: "driver1",
              firstName: "Driver",
              lastName: "One",
              stripeConnectAccountId: "acct_driver_1",
            }),
            createPayment: async () => ({
              id: "payment_1",
            }),
            verifyWashoutActivity: async () => {
              activityStatus = "verified";
              return {
                id: "activity_1",
                locationId: "location_1",
                status: "verified",
                amount: "10.00",
                driverId: "driver_row_1",
                serviceType: "washout",
              };
            },
            createDriverLotteryEntry: async () => {
              lotteryEntryCalls += 1;
              return {
                id: "lottery_entry_1",
                driverId: "driver_row_1",
                activityId: "activity_1",
                ownerId: "owner_1",
                ticketNumber: "CX-202605-0001",
                entriesEarned: 1,
                lotteryMonth: 5,
                lotteryYear: 2026,
                isArchived: false,
              };
            },
          },
          async () => {
            const { registerRoutes } = await import("../server/routes");
            await registerRoutes(app as never);
            const route = puts.get("/api/owners/activities/:id/verify");
            assert.equal(typeof route, "function");

            const firstRes = createResponse();
            await route!(
              {
                params: { id: "activity_1" },
                user: { id: "user_1" },
              },
              firstRes,
            );

            assert.equal(firstRes.statusCode, 200);
            assert.equal((firstRes.body as any).status, "verified");
            assert.equal((firstRes.body as any).paymentStatus, "pending");
            assert.equal(lotteryEntryCalls, 1);

            const secondRes = createResponse();
            await route!(
              {
                params: { id: "activity_1" },
                user: { id: "user_1" },
              },
              secondRes,
            );

            assert.equal(secondRes.statusCode, 409);
            assert.equal(lotteryEntryCalls, 1);
          },
        );
      },
    );
  });
});

for (const winnerCount of [1, 2, 3] as const) {
  test(`lottery drawing sends winner and participant messages for ${winnerCount} winner${winnerCount === 1 ? "" : "s"}`, async () => {
    const fixture = createLotteryMessagingFixture(winnerCount);
    const route = await getLotteryExecuteRoute();

    await withPatchedStorage(fixture.patch, async () => {
      await withMockedRandom(0, async () => {
        const res = createResponse();
        await route(
          {
            user: { id: "admin_user_1" },
            body: {
              month: 5,
              year: 2026,
              numberOfWinners: winnerCount,
              firstPrize: "Gold Prize",
              secondPrize: winnerCount >= 2 ? "Silver Prize" : "",
              thirdPrize: winnerCount >= 3 ? "Bronze Prize" : "",
            },
          },
          res,
        );

        assert.equal(res.statusCode, 200);
        const body = res.body as any;
        assert.equal(body.drawing.winnerNotificationCount, winnerCount);
        assert.equal(body.drawing.participantNotificationCount, 3);

        const winnerMessages = fixture.state.notificationCalls.filter((call) => call.notificationKind === "winner");
        const participantMessages = fixture.state.notificationCalls.filter((call) => call.notificationKind === "participant");
        assert.equal(winnerMessages.length, winnerCount);
        assert.equal(participantMessages.length, 3);

        const participantUserIds = new Set(participantMessages.map((call) => call.userId));
        assert.deepEqual(participantUserIds, new Set(["driver_user_1", "driver_user_2", "driver_user_3"]));

        const winnerUserIds = new Set(winnerMessages.map((call) => call.userId));
        for (const userId of winnerUserIds) {
          assert(participantUserIds.has(userId), "winners should receive the general announcement too");
        }

        const participantMessage = participantMessages[0];
        assert(participantMessage.message.includes("Winners:"));
        assert(participantMessage.message.includes("Alex Stone"));
        assert(!participantMessage.message.includes("@"));
        assert(!participantMessage.message.includes("555"));
        assert.deepEqual(
          participantMessage.data.winners,
          winnerMessages.map((call, index) => ({
            place: index + 1,
            driverName: call.data.driverName,
          })),
        );
      });
    });
  });
}

test("lottery drawing retry does not duplicate winner or participant messages", async () => {
  const fixture = createLotteryMessagingFixture(3);
  const route = await getLotteryExecuteRoute();

  await withPatchedStorage(fixture.patch, async () => {
    await withMockedRandom(0, async () => {
      const firstRes = createResponse();
      await route(
        {
          user: { id: "admin_user_1" },
          body: {
            month: 5,
            year: 2026,
            numberOfWinners: 3,
            firstPrize: "Gold Prize",
            secondPrize: "Silver Prize",
            thirdPrize: "Bronze Prize",
          },
        },
        firstRes,
      );

      assert.equal(firstRes.statusCode, 200);
      const firstCount = fixture.state.notificationCalls.length;
      assert.equal(firstCount, 6);

      const secondRes = createResponse();
      await route(
        {
          user: { id: "admin_user_1" },
          body: {
            month: 5,
            year: 2026,
            numberOfWinners: 3,
            firstPrize: "Gold Prize",
            secondPrize: "Silver Prize",
            thirdPrize: "Bronze Prize",
          },
        },
        secondRes,
      );

      assert.equal(secondRes.statusCode, 200);
      assert.equal(fixture.state.notificationCalls.length, firstCount);
      assert.equal((secondRes.body as any).drawing.winnerNotificationCount, 3);
      assert.equal((secondRes.body as any).drawing.participantNotificationCount, 3);
    });
  });
});

type DbMock = {
  selectResults: unknown[][];
  inserts: unknown[];
  updates: Array<{ table: unknown; payload: Record<string, unknown> }>;
};

async function withMockedDb(
  selectResults: unknown[][],
  run: (mock: DbMock) => Promise<void>,
) {
  const { db } = await import("../server/db");
  const dbObject = db as unknown as {
    select: unknown;
    insert: unknown;
    update: unknown;
  };
  const original = {
    select: dbObject.select,
    insert: dbObject.insert,
    update: dbObject.update,
  };
  const mock: DbMock = {
    selectResults: [...selectResults],
    inserts: [],
    updates: [],
  };

  dbObject.select = () => ({
    from: () => ({
      where: () => ({
        limit: async () => mock.selectResults.shift() || [],
      }),
    }),
  });
  dbObject.insert = () => ({
    values: (payload: unknown) => {
      mock.inserts.push(payload);
      return {
        returning: async () => [],
      };
    },
  });
  dbObject.update = (table: unknown) => ({
    set: (payload: Record<string, unknown>) => ({
      where: async () => {
        mock.updates.push({ table, payload });
        return [];
      },
    }),
  });

  try {
    await run(mock);
  } finally {
    dbObject.select = original.select;
    dbObject.insert = original.insert;
    dbObject.update = original.update;
  }
}

type LotteryMessagingFixture = {
  patch: Record<string, unknown>;
  state: {
    notificationCalls: Array<{
      userId: string;
      driverId: string | null;
      notificationKind: "winner" | "participant";
      place: number | null;
      title: string;
      message: string;
      data: any;
    }>;
    currentDrawing: any;
  };
};

function createLotteryMessagingFixture(winnerCount: 1 | 2 | 3): LotteryMessagingFixture {
  const drivers = [
    { id: "driver_row_1", userId: "driver_user_1", username: "alpha", firstName: "Alex", lastName: "Stone" },
    { id: "driver_row_2", userId: "driver_user_2", username: "bravo", firstName: "Blake", lastName: "River" },
    { id: "driver_row_3", userId: "driver_user_3", username: "charlie", firstName: "Casey", lastName: "Lane" },
  ];

  const totals = drivers.map((driver, index) => ({
    driverId: driver.id,
    driverName: `${driver.firstName} ${driver.lastName}`,
    totalEntries: 3 - index,
    payoutPreference: "bank_transfer",
    payoutPreferenceNote: null,
  }));

  const individualEntries = drivers.flatMap((driver, index) => (
    Array.from({ length: 3 - index }, (_, entryIndex) => ({
      id: `entry_${driver.id}_${entryIndex + 1}`,
      driverId: driver.id,
      ticketNumber: `CX-202605-${String(index * 10 + entryIndex + 1).padStart(4, "0")}`,
      entriesEarned: 1,
      lotteryMonth: 5,
      lotteryYear: 2026,
      isArchived: false,
      createdAt: new Date("2026-05-01T00:00:00Z"),
      driver: {
        id: driver.id,
        userId: driver.userId,
        user: {
          id: driver.userId,
          username: driver.username,
          firstName: driver.firstName,
          lastName: driver.lastName,
        },
      },
      owner: { id: "owner_1", userId: "owner_user_1", companyName: "Owner Co" },
      activity: {
        id: `activity_${driver.id}`,
        checkInTime: new Date("2026-05-01T00:00:00Z"),
      },
    }))
  ));

  const state = {
    expectedWinnerCount: winnerCount,
    notificationCalls: [] as LotteryMessagingFixture["state"]["notificationCalls"],
    currentDrawing: null as any,
  };
  const notificationKeySet = new Set<string>();

  const patch: Record<string, unknown> = {
    getUser: async () => ({
      id: "admin_user_1",
      username: "admin1",
      email: "admin@example.com",
      firstName: "Admin",
      lastName: "User",
      role: "admin",
      isActive: true,
    }),
    getDriverLotteryEntryTotals: async () => totals,
    getAllDriverLotteryEntries: async () => individualEntries,
    getAllDrivers: async () => drivers.map((driver) => ({
      id: driver.id,
      userId: driver.userId,
      user: {
        id: driver.userId,
        username: driver.username,
        firstName: driver.firstName,
        lastName: driver.lastName,
      },
    })),
    getLotteryDrawingByMonthYear: async () => state.currentDrawing,
    createLotteryDrawing: async (payload: any) => {
      state.currentDrawing = {
        id: "drawing_1",
        drawingDate: new Date("2026-05-22T00:00:00Z"),
        executedByName: "admin1",
        winnerNotificationCount: 0,
        participantNotificationCount: 0,
        winnerNotificationsSentAt: null,
        participantNotificationsSentAt: null,
        ...payload,
      };
      return state.currentDrawing;
    },
    createLotteryNotificationOnce: async (notification: any) => {
      const key = `${notification.lotteryDrawingId}:${notification.userId}:${notification.notificationKind}`;
      const created = !notificationKeySet.has(key);
      if (created) {
        notificationKeySet.add(key);
        state.notificationCalls.push(notification);
      }
      return {
        created,
        record: {
          id: `lottery_notification_${notificationKeySet.size}`,
          notificationId: created ? `notification_${notificationKeySet.size}` : null,
          sentAt: created ? new Date("2026-05-22T00:00:00Z") : null,
          ...notification,
        },
      };
    },
    getLotteryNotificationSummary: async () => ({
      winnerNotificationCount: state.notificationCalls.filter((n) => n.notificationKind === "winner").length,
      participantNotificationCount: state.notificationCalls.filter((n) => n.notificationKind === "participant").length,
      winnerNotificationsSentAt: state.notificationCalls.some((n) => n.notificationKind === "winner") ? new Date("2026-05-22T00:00:00Z") : null,
      participantNotificationsSentAt: state.notificationCalls.some((n) => n.notificationKind === "participant") ? new Date("2026-05-22T00:00:00Z") : null,
    }),
    updateLotteryDrawingNotificationSummary: async (_drawingId: string, updates: any) => {
      state.currentDrawing = {
        ...state.currentDrawing,
        ...updates,
      };
      return state.currentDrawing;
    },
    archiveLotteryMonth: async () => 0,
  };

  return { patch, state };
}

async function getLotteryExecuteRoute() {
  const { app, posts } = createRouteRegistry();
  const { registerRoutes } = await import("../server/routes");
  await registerRoutes(app as never);
  const route = posts.get("/api/admin/lottery/execute");
  assert.equal(typeof route, "function");
  return route as Function;
}

async function withMockedRandom<T>(value: number, run: () => Promise<T>): Promise<T> {
  const original = Math.random;
  Math.random = () => value;
  try {
    return await run();
  } finally {
    Math.random = original;
  }
}

function signedStripeEvent(type: string, object: Record<string, unknown>, id: string) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET!;
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2025-08-27.basil",
  });
  const payload = JSON.stringify({
    id,
    object: "event",
    api_version: "2025-08-27.basil",
    created: Math.floor(Date.now() / 1000),
    data: { object },
    livemode: false,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    type,
  });
  const signature = stripe.webhooks.generateTestHeaderString({
    payload,
    secret,
  });

  return { payload, signature };
}

test("payment webhooks require a configured secret and valid signature", async () => {
  const { processStripeWebhook } = await import("../server/webhookService");
  const originalSecret = process.env.STRIPE_WEBHOOK_SECRET;

  delete process.env.STRIPE_WEBHOOK_SECRET;
  const missingSecret = await processStripeWebhook("{}", "bad-signature");
  assert.equal(missingSecret.success, false);
  assert.equal(missingSecret.error, "Missing webhook secret");

  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_secret";
  const invalidSignature = await processStripeWebhook("{}", "bad-signature");
  assert.equal(invalidSignature.success, false);
  assert.equal(invalidSignature.message, "Invalid signature");

  if (originalSecret === undefined) {
    delete process.env.STRIPE_WEBHOOK_SECRET;
  } else {
    process.env.STRIPE_WEBHOOK_SECRET = originalSecret;
  }
});

test("payment_intent.succeeded webhooks complete matching payments", async () => {
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_secret";

  await withMockedDb([[], [{ id: "payment_1", activityId: "activity_1" }]], async (mock) => {
    const { processStripeWebhook } = await import("../server/webhookService");
    const { payload, signature } = signedStripeEvent(
      "payment_intent.succeeded",
      {
        id: "pi_succeeded",
        object: "payment_intent",
        amount: 2500,
        currency: "usd",
        metadata: { activity_id: "activity_1" },
        status: "succeeded",
      },
      "evt_payment_succeeded",
    );

    const result = await processStripeWebhook(payload, signature);

    assert.equal(result.success, true);
    assert.equal(result.message, "Payment payment_1 confirmed");
    assert.deepEqual(mock.inserts[0], {
      stripeEventId: "evt_payment_succeeded",
      eventType: "payment_intent.succeeded",
      status: "processing",
      payload: JSON.parse(payload),
      accountId: null,
    });
    assert.ok(
      mock.updates.some(
        ({ payload: update }) =>
          update.status === "completed" &&
          update.stripePaymentIntentId === "pi_succeeded",
      ),
    );
    assert.ok(
      mock.updates.some(
        ({ payload: update }) =>
          update.status === "processed" && update.processedAt instanceof Date,
      ),
    );
  });
});

test("payment_intent.payment_failed webhooks mark matching payments failed", async () => {
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_secret";

  await withMockedDb([[], [{ id: "payment_2", activityId: "activity_2" }]], async (mock) => {
    const { processStripeWebhook } = await import("../server/webhookService");
    const { payload, signature } = signedStripeEvent(
      "payment_intent.payment_failed",
      {
        id: "pi_failed",
        object: "payment_intent",
        amount: 2500,
        currency: "usd",
        metadata: { activity_id: "activity_2" },
        status: "requires_payment_method",
        last_payment_error: { message: "Card declined" },
      },
      "evt_payment_failed",
    );

    const result = await processStripeWebhook(payload, signature);

    assert.equal(result.success, true);
    assert.equal(result.message, "Payment payment_2 marked as failed");
    assert.equal(
      (mock.inserts[0] as { stripeEventId: string }).stripeEventId,
      "evt_payment_failed",
    );
    assert.ok(
      mock.updates.some(
        ({ payload: update }) =>
          update.status === "failed" &&
          update.stripePaymentIntentId === "pi_failed",
      ),
    );
  });
});

test("payment webhooks skip already processed Stripe events", async () => {
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_secret";

  await withMockedDb(
    [[{ stripeEventId: "evt_duplicate", status: "processed" }]],
    async (mock) => {
      const { processStripeWebhook } = await import("../server/webhookService");
      const { payload, signature } = signedStripeEvent(
        "payment_intent.succeeded",
        {
          id: "pi_duplicate",
          object: "payment_intent",
          amount: 2500,
          currency: "usd",
          metadata: { activity_id: "activity_duplicate" },
          status: "succeeded",
        },
        "evt_duplicate",
      );

      const result = await processStripeWebhook(payload, signature);

      assert.equal(result.success, true);
      assert.equal(result.message, "Event already processed (idempotent)");
      assert.equal(mock.inserts.length, 0);
      assert.equal(mock.updates.length, 0);
    },
  );
});

let failures = 0;

for (const { name, run } of tests) {
  try {
    await run();
    console.log(`ok - ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`not ok - ${name}`);
    console.error(error);
  }
}

if (failures > 0) {
  console.error(`${failures}/${tests.length} tests failed`);
  process.exit(1);
}

console.log(`${tests.length} tests passed`);
process.exit(0);
