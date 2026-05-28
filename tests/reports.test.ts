import assert from "node:assert/strict";
import test from "node:test";
import { buildDriverReport, buildOwnerReport } from "../server/reportService";
import type { Driver, Owner, Payment, User, WashoutActivity, WashoutLocation } from "../shared/schema";

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

function makePayment(id: string, activity: WashoutActivity, driver: Driver & { user: User }, owner: Owner, amount: string, status: string, paidAt?: Date, tipAmountCents?: number | null): Payment & { activity: WashoutActivity } {
  return {
    id,
    driverId: driver.id,
    ownerId: owner.id,
    activityId: activity.id,
    amount,
    processingFee: "0.40",
    washoutServiceFee: "4.60",
    tipAmountCents: tipAmountCents ?? null,
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

  const activityToday = makeActivity("activity-today", { ...driver1, user: driverUser1 }, location1, "verified", "100.00", new Date());
  const activityWeek = makeActivity("activity-week", { ...driver1, user: driverUser1 }, location1, "pending", "75.00", new Date(Date.now() - 3 * 24 * 60 * 60 * 1000));
  const activityOld = makeActivity("activity-old", { ...driver1, user: driverUser1 }, location1, "pending", "50.00", new Date(Date.now() - 10 * 24 * 60 * 60 * 1000));
  const activityOtherOwner = makeActivity("activity-other", { ...driver2, user: driverUser2 }, location2, "verified", "120.00", new Date(Date.now() - 2 * 24 * 60 * 60 * 1000));

  const paymentWeek = makePayment("payment-week", activityWeek, { ...driver1, user: driverUser1 }, owner1, "75.00", "completed", new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), 500);
  const paymentOther = makePayment("payment-other", activityOtherOwner, { ...driver2, user: driverUser2 }, owner2, "120.00", "pending", new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), 0);

  const ticketToday = { activityId: activityToday.id, ticketNumber: "CX-202605-0001", ownerId: owner1.id, driverId: driver1.id };
  const ticketWeek = { activityId: activityWeek.id, ticketNumber: "CX-202605-0002", ownerId: owner1.id, driverId: driver1.id };
  const ticketOther = { activityId: activityOtherOwner.id, ticketNumber: "CX-202605-0003", ownerId: owner2.id, driverId: driver2.id };

  const owners = [owner1, owner2];
  const ownerUsers = new Map([
    [owner1.userId, ownerUser1],
    [owner2.userId, ownerUser2],
  ]);
  const driverUsers = new Map([
    [driver1.userId, driverUser1],
    [driver2.userId, driverUser2],
  ]);
  const activities = [activityToday, activityWeek, activityOld, activityOtherOwner];
  const payments = [paymentWeek, paymentOther];
  const lotteryEntries = [ticketToday, ticketWeek, ticketOther];

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
        .map((payment) => ({ ...payment, activity: activities.find((a) => a.id === payment.activityId)! }));
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
    activityToday,
    activityWeek,
    activityOld,
    activityOtherOwner,
    paymentWeek,
    paymentOther,
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

  assert.equal(report.rows.length, 2);
  assert.deepEqual(report.rows.map((row) => row.washoutId).sort(), [fixture.activityToday.id, fixture.activityWeek.id].sort());
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
  assert.equal(report.rows[0].driverPaymentAmount, "");
});

test("driver weekly report includes payment rows and payment status", async () => {
  const fixture = createStorageFixture();
  const report = await buildDriverReport(
    fixture.storage as any,
    { userId: fixture.driverUser1.id, role: "driver", driver: fixture.driver1 },
    { dateRange: "weekly" },
  );

  assert.equal(report.rows.length, 2);
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

  assert.equal(report.rows.length, 3);
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
