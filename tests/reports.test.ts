import assert from "node:assert/strict";
import test from "node:test";
import { buildDriverReport, buildOwnerReport } from "../server/reportService";
import { buildBillingAuditReport, billingAuditReportToCsv } from "../server/billingAuditReport";
import type { BillingBatch, Driver, Owner, Payment, User, WashoutActivity, WashoutLocation, WashoutPhoto } from "../shared/schema";
import { registerRoutes } from "../server/routes";

function makeUser(overrides: Partial<User> & { id: string; role: "driver" | "owner" | "admin" | "super_admin" }): User {
  return {
    id: overrides.id,
    username: overrides.username || overrides.id,
    email: overrides.email || `${overrides.id}@example.com`,
    passwordHash: "hash",
    firstName: overrides.firstName || overrides.id,
    lastName: overrides.lastName || "User",
    role: overrides.role,
    phone: overrides.phone || "5551234567",
    street: overrides.street || "1 Main St",
    city: overrides.city || "Austin",
    state: overrides.state || "TX",
    zip: overrides.zip || "78701",
    paymentMethod: overrides.paymentMethod || "ach",
    paymentFrequency: overrides.paymentFrequency || "weekly",
    stripeConnectAccountId: overrides.stripeConnectAccountId || null,
    columnCustomerId: overrides.columnCustomerId || null,
    stripeCustomerId: overrides.stripeCustomerId || null,
    stripeConnectBalance: overrides.stripeConnectBalance || null,
    isActive: overrides.isActive ?? true,
    createdAt: overrides.createdAt || new Date(),
    updatedAt: overrides.updatedAt || new Date(),
    profileImageUrl: overrides.profileImageUrl || null,
  } as User;
}

function makeOwner(id: string, user: User, companyName: string): Owner {
  return {
    id,
    userId: user.id,
    companyName,
    businessLicense: null,
    taxId: null,
    businessWebsite: null,
    stripeConnectAccountId: null,
    stripeCustomerId: null,
    stripePaymentMethodId: "pm_123",
    stripePaymentIntentId: null,
    dateOfBirth: null,
    ssnLast4: null,
    stripePayoutsEnabled: true,
    stripeChargesEnabled: true,
    stripeRequirements: null,
    stripeVerifiedAt: null,
    hasAgreedToTerms: true,
    termsAgreedAt: new Date(),
    payoutPreference: "bank_transfer",
    payoutPreferenceNote: null,
    acceptsOwnerPayments: false,
    membershipStatus: "active",
    profileCompleted: true,
    locationSetupOverride: false,
    annualMembershipEnabledOverride: null,
    monthlyLocationDuesEnabledOverride: null,
    membershipFeeOverride: null,
    perWashoutFeeOverride: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as Owner;
}

function makeDriver(id: string, user: User, truckNumber: string): Driver {
  return {
    id,
    userId: user.id,
    employerName: "Employer",
    employerStreet: "1 Jobsite",
    employerCity: "Austin",
    employerState: "TX",
    employerZip: "78701",
    employerPhone: "5125550000",
    licenseNumber: "D123",
    truckNumber,
    isGpsEnabled: true,
    currentLatitude: null,
    currentLongitude: null,
    lastLocationUpdate: null,
    bankName: null,
    accountHolderName: null,
    routingNumber: null,
    accountNumber: null,
    venmoHandle: null,
    zelleEmail: null,
    paymentMethod: "ach",
    stripeTreasuryAccountId: null,
    stripeTreasuryAccountLast4: null,
    stripeIssuingCardholderId: null,
    dateOfBirth: null,
    ssnLast4: null,
    businessWebsite: null,
    connectedAccountId: null,
    stripeConnectAccountId: null,
    stripeConnectBalance: null,
    columnEntityId: null,
    columnBankAccountId: null,
    columnAccountLast4: null,
    identityDocumentId: null,
    identityVerificationStatus: "pending",
    stripePayoutsEnabled: false,
    stripeChargesEnabled: false,
    stripeRequirements: null,
    stripeVerifiedAt: null,
    hasAgreedToTerms: true,
    termsAgreedAt: new Date(),
    payoutPreference: "bank_transfer",
    payoutPreferenceNote: null,
    acceptsOwnerPayments: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as Driver;
}

function makeLocation(id: string, ownerId: string, name: string): WashoutLocation {
  return {
    id,
    ownerId,
    name,
    address: null,
    street: "100 Site Rd",
    city: "Austin",
    state: "TX",
    zip: "78701",
    latitude: "30.2672",
    longitude: "-97.7431",
    rate: "5.00",
    monthlyFeeCents: 100,
    monthlyLocationFeeOverride: null,
    isActive: true,
    isVisible: true,
    description: null,
    amenities: null,
    operatingHours: null,
    permitUrls: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as WashoutLocation;
}

function makeActivity(
  id: string,
  driver: Driver & { user: User },
  location: WashoutLocation,
  status: WashoutActivity["status"],
  amount: string,
  checkInTime: Date,
  serviceType: "washout" | "rubble_dropoff" = "washout",
): WashoutActivity & { location: WashoutLocation; driver: Driver & { user: User } } {
  return {
    id,
    driverId: driver.id,
    locationId: location.id,
    status,
    amount,
    checkInTime,
    checkOutTime: null,
    photoUrls: [],
    notes: `Notes for ${id}`,
    verifiedBy: null,
    verifiedAt: null,
    latitude: null,
    longitude: null,
    serviceType,
    materialSlug: null,
    materialCustomLabel: null,
    qty: serviceType === "rubble_dropoff" ? "3" : null,
    unit: serviceType === "rubble_dropoff" ? "per_load" : null,
    amountCentsOwnerToDriver: null,
    feeCentsPlatform: 0,
    createdAt: checkInTime,
    updatedAt: checkInTime,
    location,
    driver,
  } as any;
}

function makeBillingBatch(
  id: string,
  owner: Owner,
  businessDate: string,
  status: BillingBatch["status"],
  stripePaymentIntentId: string,
  stripeChargeId?: string | null,
  stripeBatchTransferId?: string | null,
): BillingBatch {
  return {
    id,
    ownerId: owner.id,
    businessDate,
    cutoffTime: "23:59",
    timezone: "America/Chicago",
    totalAmount: "205.00",
    totalFees: "10.00",
    paymentCount: 3,
    stripePaymentIntentId,
    stripeBatchTransferId: stripeBatchTransferId || null,
    status,
    processingStartedAt: null,
    completedAt: status === "completed" ? new Date(`${businessDate}T15:00:00.000Z`) : null,
    failureReason: status === "failed" ? "Stripe payment failed" : null,
    retryCount: 0,
    metadata: null,
    createdAt: new Date(`${businessDate}T12:00:00.000Z`),
    updatedAt: new Date(`${businessDate}T16:00:00.000Z`),
  } as any;
}

function makePhoto(id: string, activityId: string, driverId: string, locationId: string, verificationStatus: string): WashoutPhoto {
  return {
    id,
    activityId,
    driverId,
    locationId,
    storageKey: `${id}.jpg`,
    uploadedAt: new Date(),
    contentType: "image/jpeg",
    imageFingerprint: `${id}-fingerprint`,
    photoTakenAt: new Date(),
    verificationStatus,
    verificationReason: null,
    verificationDistanceMiles: null,
    duplicateMatchedPhotoId: null,
    duplicateMatchedUploadedAt: null,
    duplicateSimilarityScore: null,
    duplicateHashDistance: null,
    gpsLatitude: null,
    gpsLongitude: null,
    fileSize: null,
    createdAt: new Date(),
  } as any;
}

function fixtureDate(daysAgo = 0): Date {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  date.setHours(12, 0, 0, 0);
  return date;
}

function makePayment(id: string, activity: WashoutActivity, driver: Driver & { user: User }, owner: Owner, amount: string, status: string, paidAt?: Date, tipAmountCents?: number | null): Payment & { activity: WashoutActivity } {
  const driverTip = tipAmountCents ?? 0;
  return {
    id,
    driverId: driver.id,
    ownerId: owner.id,
    activityId: activity.id,
    amount,
    processingFee: "0.40",
    washoutServiceFee: (driverTip / 100).toFixed(2),
    tipAmountCents: driverTip,
    stripePaymentIntentId: null,
    stripeTransferId: null,
    stripeChargeId: null,
    status,
    refundedAt: null,
    refundAmount: null,
    refundReason: null,
    batchId: null,
    billingRunId: null,
    businessDate: null,
    paidAt: paidAt || null,
    createdAt: paidAt || new Date(),
    updatedAt: paidAt || new Date(),
    activity,
  } as any;
}

function createStorageFixture() {
  const ownerUser1 = makeUser({ id: "owner-user-1", role: "owner", firstName: "Olivia", lastName: "Owner" });
  const ownerUser2 = makeUser({ id: "owner-user-2", role: "owner", firstName: "Oscar", lastName: "Owner" });
  const driverUser1 = makeUser({ id: "driver-user-1", role: "driver", firstName: "Derek", lastName: "Driver", email: "driver@example.com", phone: "5550001111" });
  const driverUser2 = makeUser({ id: "driver-user-2", role: "driver", firstName: "Dana", lastName: "Driver", email: "dana@example.com", phone: "5550002222" });
  const adminUser = makeUser({ id: "admin-user", role: "admin", firstName: "Ava", lastName: "Admin" });

  const owner1 = makeOwner("owner-1", ownerUser1, "Alpha Concrete");
  const owner2 = makeOwner("owner-2", ownerUser2, "Beta Concrete");
  const driver1 = makeDriver("driver-1", driverUser1, "Truck-100");
  const driver2 = makeDriver("driver-2", driverUser2, "Truck-200");

  const location1 = makeLocation("location-1", owner1.id, "North Yard");
  const location2 = makeLocation("location-2", owner2.id, "South Yard");
  const location3 = makeLocation("location-3", owner1.id, "West Yard");

  const activityToday = makeActivity("activity-today", { ...driver1, user: driverUser1 }, location1, "verified", "100.00", fixtureDate(0));
  const activityWeek = makeActivity("activity-week", { ...driver1, user: driverUser1 }, location1, "pending", "75.00", fixtureDate(3));
  const activityOld = makeActivity("activity-old", { ...driver1, user: driverUser1 }, location1, "pending", "50.00", fixtureDate(10));
  const activityOtherOwner = makeActivity("activity-other", { ...driver2, user: driverUser2 }, location2, "verified", "120.00", fixtureDate(2));
  const activityMultiDriver = makeActivity("activity-multi-driver", { ...driver2, user: driverUser2 }, location3, "verified", "30.00", fixtureDate(2));
  const activityRefunded = makeActivity("activity-refunded", { ...driver1, user: driverUser1 }, location3, "verified", "50.00", fixtureDate(1));
  const activityLegacy = makeActivity("activity-legacy", { ...driver1, user: driverUser1 }, location1, "verified", "55.00", fixtureDate(5));

  const paymentToday = makePayment("payment-today", activityToday, { ...driver1, user: driverUser1 }, owner1, "100.00", "completed", fixtureDate(0), 0);
  const paymentWeek = makePayment("payment-week", activityWeek, { ...driver1, user: driverUser1 }, owner1, "75.00", "completed", fixtureDate(2), 500);
  const paymentMultiDriver = makePayment("payment-multi-driver", activityMultiDriver, { ...driver2, user: driverUser2 }, owner1, "30.00", "completed", fixtureDate(2), 0);
  const paymentRefunded = makePayment("payment-refunded", activityRefunded, { ...driver1, user: driverUser1 }, owner1, "50.00", "refunded", fixtureDate(1), 0);
  paymentRefunded.refundedAt = fixtureDate(1);
  paymentRefunded.refundAmount = "50.00";
  paymentRefunded.refundReason = "Owner dispute";
  paymentRefunded.stripePaymentIntentId = "pi_123";
  paymentRefunded.stripeChargeId = "ch_refund";
  paymentRefunded.batchId = "batch-1";
  paymentRefunded.businessDate = fixtureDate(1).toISOString().split("T")[0];
  const paymentFailed = makePayment("payment-failed", activityOtherOwner, { ...driver2, user: driverUser2 }, owner2, "120.00", "failed", undefined, 0);
  paymentFailed.stripePaymentIntentId = "pi_fail";
  paymentFailed.batchId = "batch-2";
  const paymentLegacy = makePayment("payment-legacy", activityLegacy, { ...driver1, user: driverUser1 }, owner1, "55.00", "pending", fixtureDate(5), 0);
  paymentLegacy.batchId = null;
  paymentLegacy.businessDate = null;
  paymentLegacy.stripePaymentIntentId = null;
  paymentLegacy.stripeChargeId = null;

  const photoToday = makePhoto("photo-today", activityToday.id, driver1.id, location1.id, "verified");
  const photoWeek = makePhoto("photo-week", activityWeek.id, driver1.id, location1.id, "needs_review");
  const photoOther = makePhoto("photo-other", activityOtherOwner.id, driver2.id, location2.id, "verified");
  const photoMulti = makePhoto("photo-multi", activityMultiDriver.id, driver2.id, location3.id, "verified");
  const photoRefunded = makePhoto("photo-refunded", activityRefunded.id, driver1.id, location3.id, "verified");

  const lotteryEntries = [
    { activityId: activityToday.id, ticketNumber: "CX-202605-0001", ownerId: owner1.id, driverId: driver1.id },
    { activityId: activityWeek.id, ticketNumber: "CX-202605-0002", ownerId: owner1.id, driverId: driver1.id },
    { activityId: activityOtherOwner.id, ticketNumber: "CX-202605-0003", ownerId: owner2.id, driverId: driver2.id },
  ];

  const owners = [owner1, owner2];
  const ownerUsers = new Map([
    [owner1.userId, ownerUser1],
    [owner2.userId, ownerUser2],
  ]);
  const driverUsers = new Map([
    [driver1.userId, driverUser1],
    [driver2.userId, driverUser2],
  ]);
  const ownerById = new Map([
    [owner1.id, owner1],
    [owner2.id, owner2],
  ]);
  const driverById = new Map([
    [driver1.id, driver1],
    [driver2.id, driver2],
  ]);
  const activities = [activityToday, activityWeek, activityOld, activityOtherOwner, activityMultiDriver, activityRefunded, activityLegacy];
  const payments = [paymentToday, paymentWeek, paymentMultiDriver, paymentRefunded, paymentFailed, paymentLegacy];
  const billingBatches = [
    makeBillingBatch("batch-1", owner1, fixtureDate(1).toISOString().split("T")[0], "completed", "pi_123", "ch_123", "tr_123"),
    makeBillingBatch("batch-2", owner2, fixtureDate(2).toISOString().split("T")[0], "failed", "pi_fail", null, null),
  ];
  const photosByActivity = new Map<string, WashoutPhoto[]>([
    [activityToday.id, [photoToday]],
    [activityWeek.id, [photoWeek]],
    [activityOtherOwner.id, [photoOther]],
    [activityMultiDriver.id, [photoMulti]],
    [activityRefunded.id, [photoRefunded]],
  ]);

  const storage = {
    async getUser(userId: string) {
      return ownerUsers.get(userId) || driverUsers.get(userId) || adminUser;
    },
    async getOwner(userId: string) {
      return userId === ownerUser1.id ? owner1 : userId === ownerUser2.id ? owner2 : undefined;
    },
    async getDriver(userId: string) {
      return userId === driverUser1.id ? driver1 : userId === driverUser2.id ? driver2 : undefined;
    },
    async getOwnerById(ownerId: string) {
      return ownerId === owner1.id ? owner1 : ownerId === owner2.id ? owner2 : undefined;
    },
    async getDriverById(driverId: string) {
      return driverId === driver1.id ? driver1 : driverId === driver2.id ? driver2 : undefined;
    },
    async getAllOwners() {
      return owners.map((owner) => ({ ...owner, user: ownerUsers.get(owner.userId)! }));
    },
    async getBillingBatches(startDate?: Date, endDate?: Date) {
      return billingBatches.filter((batch) => !startDate || batch.createdAt >= startDate)
        .filter((batch) => !endDate || batch.createdAt <= endDate)
        .map((batch) => {
          const owner = ownerById.get(batch.ownerId)!;
          return {
            ...batch,
            owner: { ...owner, user: ownerUsers.get(owner.userId)! },
          };
        });
    },
    async getActivitiesByOwner(ownerId: string, startDate?: Date, endDate?: Date) {
      return activities
        .filter((activity) => activity.location.ownerId === ownerId)
        .filter((activity) => !startDate || activity.checkInTime >= startDate)
        .filter((activity) => !endDate || activity.checkInTime <= endDate);
    },
    async getActivitiesByDriver(driverId: string, startDate?: Date, endDate?: Date) {
      return activities
        .filter((activity) => activity.driverId === driverId)
        .filter((activity) => !startDate || activity.checkInTime >= startDate)
        .filter((activity) => !endDate || activity.checkInTime <= endDate)
        .map((activity) => ({ ...activity, location: activity.location, driver: activity.driver }));
    },
    async getAllActivities(startDate?: Date, endDate?: Date) {
      return activities
        .filter((activity) => !startDate || activity.checkInTime >= startDate)
        .filter((activity) => !endDate || activity.checkInTime <= endDate)
        .map((activity) => ({ ...activity, location: activity.location, driver: activity.driver }));
    },
    async getPaymentsByOwner(ownerId: string, startDate?: Date, endDate?: Date) {
      return payments
        .filter((payment) => payment.ownerId === ownerId)
        .filter((payment) => !startDate || payment.createdAt >= startDate)
        .filter((payment) => !endDate || payment.createdAt <= endDate)
        .map((payment) => ({ ...payment, activity: activities.find((a) => a.id === payment.activityId)! }));
    },
    async getPaymentsByDriver(driverId: string, startDate?: Date, endDate?: Date) {
      return payments
        .filter((payment) => payment.driverId === driverId)
        .filter((payment) => !startDate || payment.createdAt >= startDate)
        .filter((payment) => !endDate || payment.createdAt <= endDate)
        .map((payment) => ({ ...payment, activity: activities.find((a) => a.id === payment.activityId)! }));
    },
    async getAllPayments(startDate?: Date, endDate?: Date) {
      return payments
        .filter((payment) => !startDate || payment.createdAt >= startDate)
        .filter((payment) => !endDate || payment.createdAt <= endDate)
        .map((payment) => ({
          ...payment,
          activity: activities.find((a) => a.id === payment.activityId)!,
          driver: (() => {
            const driver = driverById.get(payment.driverId)!;
            return { ...driver, user: driverUsers.get(driver.userId)! };
          })() as any,
          owner: (() => {
            const owner = ownerById.get(payment.ownerId)!;
            return { ...owner, user: ownerUsers.get(owner.userId)! };
          })() as any,
        }));
    },
    async getPhotosByActivity(activityId: string) {
      return photosByActivity.get(activityId) || [];
    },
    async getAllDriverLotteryEntries(startDate?: Date, endDate?: Date) {
      return lotteryEntries.filter((entry) => {
        const activity = activities.find((a) => a.id === entry.activityId)!;
        if (startDate && activity.checkInTime < startDate) return false;
        if (endDate && activity.checkInTime > endDate) return false;
        return true;
      });
    },
  };

  return {
    storage,
    owner1,
    owner2,
    ownerUser1,
    ownerUser2,
    driver1,
    driver2,
    driverUser1,
    driverUser2,
    adminUser,
    location1,
    location2,
    location3,
    activityToday,
    activityWeek,
    activityOld,
    activityOtherOwner,
    activityMultiDriver,
    activityRefunded,
    activityLegacy,
    paymentToday,
    paymentWeek,
    paymentMultiDriver,
    paymentRefunded,
    paymentFailed,
    paymentLegacy,
    billingBatches,
    lotteryEntries,
  };
}

test("owner daily report includes only today's washouts", async () => {
  const fixture = createStorageFixture();
  const report = await buildOwnerReport(
    fixture.storage as any,
    { userId: fixture.ownerUser1.id, role: "owner", owner: fixture.owner1 },
    { dateRange: "daily" },
  );

  assert.equal(report.rows.length, 1);
  assert.equal(report.rows[0].washoutId, fixture.activityToday.id);
  assert.equal(report.summary.totalWashouts, 1);
});

test("owner weekly report excludes older washouts", async () => {
  const fixture = createStorageFixture();
  const report = await buildOwnerReport(
    fixture.storage as any,
    { userId: fixture.ownerUser1.id, role: "owner", owner: fixture.owner1 },
    { dateRange: "weekly" },
  );

  assert.equal(report.rows.length, 5);
  assert.deepEqual(
    report.rows.map((row) => row.washoutId).sort(),
    [fixture.activityToday.id, fixture.activityWeek.id, fixture.activityMultiDriver.id, fixture.activityRefunded.id, fixture.activityLegacy.id].sort(),
  );
});

test("owner custom date report filters the requested day", async () => {
  const fixture = createStorageFixture();
  const targetDate = fixture.activityOld.checkInTime.toISOString().split("T")[0];
  const report = await buildOwnerReport(
    fixture.storage as any,
    { userId: fixture.ownerUser1.id, role: "owner", owner: fixture.owner1 },
    { dateRange: "custom", startDate: targetDate, endDate: targetDate },
  );

  assert.equal(report.rows.length, 1);
  assert.equal(report.rows[0].washoutId, fixture.activityOld.id);
});

test("driver daily report includes ticket numbers", async () => {
  const fixture = createStorageFixture();
  const report = await buildDriverReport(
    fixture.storage as any,
    { userId: fixture.driverUser1.id, role: "driver", driver: fixture.driver1 },
    { dateRange: "daily" },
  );

  assert.equal(report.rows.length, 1);
  assert.equal(report.rows[0].ticketNumber, "CX-202605-0001");
  assert.equal(report.rows[0].driverPaymentAmount, "100.00");
  assert.equal(report.rows[0].paymentStatus, "paid");
});

test("driver weekly report includes payment rows and payment status", async () => {
  const fixture = createStorageFixture();
  const report = await buildDriverReport(
    fixture.storage as any,
    { userId: fixture.driverUser1.id, role: "driver", driver: fixture.driver1 },
    { dateRange: "weekly" },
  );

  assert.equal(report.rows.length, 4);
  assert.ok(report.rows.some((row) => row.paymentStatus === "paid"));
  assert.equal(report.summary.totalTips, "5.00");
});

test("admin owner report spans multiple owners", async () => {
  const fixture = createStorageFixture();
  const report = await buildOwnerReport(
    fixture.storage as any,
    { userId: fixture.adminUser.id, role: "admin" },
    { dateRange: "weekly" },
  );

  assert.equal(report.rows.length, 6);
  assert.ok(report.rows.some((row) => row.ownerId === fixture.owner1.id));
  assert.ok(report.rows.some((row) => row.ownerId === fixture.owner2.id));
});

test("permission checks prevent a driver from requesting another driver report", async () => {
  const fixture = createStorageFixture();
  await assert.rejects(
    buildDriverReport(
      fixture.storage as any,
      { userId: fixture.driverUser1.id, role: "driver", driver: fixture.driver1 },
      { dateRange: "daily", driverId: fixture.driver2.id },
    ),
    /Forbidden/i,
  );
});

function createRouteRegistry() {
  const gets = new Map<string, Function>();
  const app = {
    get(path: string, ...handlers: Function[]) {
      gets.set(path, handlers[handlers.length - 1]);
    },
    post() {},
    put() {},
    delete() {},
    patch() {},
    use() {},
  };
  return { app, gets };
}

test("billing audit report filters by owner and groups multiple drivers/locations", async () => {
  const fixture = createStorageFixture();
  const report = await buildBillingAuditReport(
    fixture.storage as any,
    { dateRange: "weekly", ownerId: fixture.owner1.id },
  );

  assert.equal(report.scope, "super_admin");
  assert.ok(report.rows.every((row) => row.ownerId === fixture.owner1.id));
  assert.ok(report.runs.some((run) => run.driverCount === 2));
  assert.ok(report.runs.some((run) => run.locationCount === 2));

  const csv = billingAuditReportToCsv(report);
  assert.match(csv, /Billing Run ID/);
  assert.match(csv, /Stripe PaymentIntent ID/);
  assert.match(csv, /Photo Count/);
  assert.match(csv, /Legacy \/ Unlinked/);
});

test("billing audit report filters by stripe transaction id", async () => {
  const fixture = createStorageFixture();
  const report = await buildBillingAuditReport(
    fixture.storage as any,
    { dateRange: "weekly", stripeTransactionId: "pi_123" },
  );

  assert.equal(report.runs.length, 1);
  assert.ok(report.runs[0].billingRunId.includes("batch-1"));
  assert.ok(report.rows.every((row) => row.stripePaymentIntentId.includes("pi_123") || row.billingBatchId === "batch-1"));
});

test("billing audit report custom date range includes refunded rows and excludes legacy rows outside the window", async () => {
  const fixture = createStorageFixture();
  const targetDate = fixture.activityRefunded.checkInTime.toISOString().split("T")[0];
  const report = await buildBillingAuditReport(
    fixture.storage as any,
    { dateRange: "custom", startDate: targetDate, endDate: targetDate },
  );

  assert.ok(report.rows.some((row) => row.paymentStatus === "refunded"));
  assert.ok(report.summary.totalRefunded > "0.00");
  assert.equal(report.rows.length, 1);
});

test("billing audit report includes failed and legacy/unlinked rows", async () => {
  const fixture = createStorageFixture();
  const report = await buildBillingAuditReport(
    fixture.storage as any,
    { dateRange: "weekly" },
  );

  assert.ok(report.rows.some((row) => row.paymentStatus === "failed"));
  assert.ok(report.rows.some((row) => row.legacyUnlinked));
  assert.ok(report.summary.totalFailed > "0.00");
  assert.ok(report.summary.totalLegacyUnlinked > 0);
});

test("billing audit report builds from minimal safe report fields only", async () => {
  const ownerUser = makeUser({ id: "owner-user-min", role: "owner", firstName: "Owner", lastName: "One", email: "owner@example.com" });
  const driverUser = makeUser({ id: "driver-user-min", role: "driver", firstName: "Driver", lastName: "One", email: "driver@example.com", phone: "5552223333" });
  const owner = {
    id: "owner-min",
    userId: ownerUser.id,
    companyName: "Minimal Owner LLC",
    stripeCustomerId: "cus_min",
    stripePaymentMethodId: "pm_min",
  } as any;
  const driver = {
    id: "driver-min",
    userId: driverUser.id,
    truckNumber: "T-1",
  } as any;
  const location = {
    id: "location-min",
    ownerId: owner.id,
    name: "Minimal Site",
    street: "1 Main St",
    city: "Austin",
    state: "TX",
    zip: "78701",
    rate: "5.00",
    monthlyFeeCents: 100,
  } as any;
  const activity = {
    id: "activity-min",
    driverId: driver.id,
    locationId: location.id,
    status: "verified",
    amount: "5.00",
    checkInTime: new Date("2026-05-01T12:00:00.000Z"),
    checkOutTime: null,
    photoUrls: [],
    notes: "Minimal activity",
    verifiedBy: null,
    verifiedAt: null,
    latitude: null,
    longitude: null,
    serviceType: "washout",
    materialSlug: null,
    materialCustomLabel: null,
    qty: null,
    unit: null,
    amountCentsOwnerToDriver: null,
    feeCentsPlatform: 0,
    createdAt: new Date("2026-05-01T12:00:00.000Z"),
    updatedAt: new Date("2026-05-01T12:00:00.000Z"),
    location,
    driver: { ...driver, user: driverUser },
  } as any;
  const payment = {
    id: "payment-min",
    driverId: driver.id,
    ownerId: owner.id,
    activityId: activity.id,
    amount: "5.00",
    processingFee: "0.30",
    washoutServiceFee: "0.70",
    tipAmountCents: 70,
    payoutStatus: "not_started",
    deferReason: null,
    deferredAt: null,
    stripePaymentIntentId: "pi_min",
    stripeTransferId: null,
    stripeChargeId: "ch_min",
    status: "paid",
    refundedAt: null,
    refundAmount: null,
    refundReason: null,
    batchId: null,
    businessDate: "2026-05-01",
    paidAt: new Date("2026-05-01T12:30:00.000Z"),
    createdAt: new Date("2026-05-01T12:00:00.000Z"),
    updatedAt: new Date("2026-05-01T12:30:00.000Z"),
    driver: { ...driver, user: driverUser },
    owner: { ...owner, user: ownerUser },
    activity,
  } as any;

  const storage = {
    async getAllPayments() {
      return [payment];
    },
    async getAllActivities() {
      return [activity];
    },
    async getBillingBatches() {
      return [];
    },
    async getPhotosByActivity() {
      return [];
    },
  };

  const report = await buildBillingAuditReport(storage as any, { dateRange: "custom", startDate: "2026-05-01", endDate: "2026-05-01" });

  assert.equal(report.rows.length, 1);
  assert.equal(report.rows[0].paymentId, "payment-min");
  assert.equal(report.rows[0].legacyUnlinked, true);
  assert.equal(report.rows[0].ownerCompanyName, "Minimal Owner LLC");
  assert.equal(report.rows[0].driverDisplayName, "Driver One");
  assert.equal(report.rows[0].platformFeeTotal, "0.30");
  assert.equal(report.rows[0].driverIncentiveTip, "0.70");
  assert.equal(report.summary.totalPlatformFeeTotal, "0.30");
  assert.equal(report.summary.totalDriverTips, "0.70");
});

test("billing audit report route is registered", async () => {
  const { app, gets } = createRouteRegistry();
  await registerRoutes(app as never);
  const route = gets.get("/api/reports/billing-audit");
  assert.equal(typeof route, "function");
  assert.ok(gets.has("/api/reports/billing-audit"));
});
