import {
  users,
  drivers,
  owners,
  washoutLocations,
  washoutActivities,
  payments,
  notifications,
  type User,
  type UpsertUser,
  type Driver,
  type Owner,
  type WashoutLocation,
  type WashoutActivity,
  type Payment,
  type Notification,
  type InsertDriver,
  type InsertOwner,
  type InsertWashoutLocation,
  type InsertWashoutActivity,
  type InsertPayment,
  type InsertNotification,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, gte, lte, desc, sql, count, ne } from "drizzle-orm";

export interface IStorage {
  // User operations - local authentication
  getUser(id: string): Promise<User | undefined>;
  getUserById(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: { username: string; email: string; passwordHash: string; firstName: string; lastName: string; role: string }): Promise<User>;
  upsertUser(user: UpsertUser): Promise<User>;
  updateUserStripeInfo(userId: string, stripeCustomerId: string, stripeSubscriptionId?: string): Promise<User>;

  // Driver operations
  createDriver(driver: InsertDriver): Promise<Driver>;
  getDriver(userId: string): Promise<Driver | undefined>;
  getDriverById(id: string): Promise<Driver | undefined>;
  updateDriver(driverId: string, driverData: Partial<InsertDriver>): Promise<Driver>;
  updateDriverLocation(driverId: string, latitude: number, longitude: number): Promise<void>;
  getAllDrivers(): Promise<(Driver & { user: User })[]>;
  getAllAdmins(): Promise<User[]>;

  // Owner operations
  createOwner(owner: InsertOwner): Promise<Owner>;
  getOwner(userId: string): Promise<Owner | undefined>;
  getOwnerById(id: string): Promise<Owner | undefined>;
  updateOwner(ownerId: string, ownerData: Partial<InsertOwner>): Promise<Owner>;
  updateOwnerSubscription(ownerId: string, status: string, subscriptionId?: string): Promise<Owner>;
  approveOwner(ownerId: string): Promise<Owner>;
  getAllOwners(): Promise<(Owner & { user: User })[]>;

  // Location operations
  createWashoutLocation(location: InsertWashoutLocation): Promise<WashoutLocation>;
  getWashoutLocation(id: string): Promise<WashoutLocation | undefined>;
  getLocationsByOwner(ownerId: string): Promise<WashoutLocation[]>;
  getActiveLocations(): Promise<(WashoutLocation & { owner: Owner & { user: User } })[]>;
  updateLocationVisibility(locationId: string, isVisible: boolean): Promise<WashoutLocation>;
  updateLocationRate(locationId: string, rate: string): Promise<WashoutLocation>;
  deleteWashoutLocation(locationId: string, ownerId: string): Promise<boolean>;
  getAllLocations(): Promise<(WashoutLocation & { owner: Owner & { user: User } })[]>;

  // Activity operations
  createWashoutActivity(activity: InsertWashoutActivity): Promise<WashoutActivity>;
  getWashoutActivity(id: string): Promise<WashoutActivity | undefined>;
  getActivitiesByDriver(driverId: string, startDate?: Date, endDate?: Date): Promise<(WashoutActivity & { location: WashoutLocation })[]>;
  getActivitiesByLocation(locationId: string, startDate?: Date, endDate?: Date): Promise<(WashoutActivity & { driver: Driver & { user: User } })[]>;
  getActivitiesByOwner(ownerId: string, startDate?: Date, endDate?: Date): Promise<(WashoutActivity & { location: WashoutLocation; driver: Driver & { user: User } })[]>;
  verifyWashoutActivity(activityId: string, verifiedBy: string): Promise<WashoutActivity>;
  rejectWashoutActivity(activityId: string, rejectedBy: string): Promise<WashoutActivity>;
  getRecentActivitiesByDriver(driverId: string, limit?: number): Promise<(WashoutActivity & { location: WashoutLocation })[]>;
  getAllActivities(startDate?: Date, endDate?: Date): Promise<(WashoutActivity & { location: WashoutLocation; driver: Driver & { user: User } })[]>;

  // Payment operations
  createPayment(payment: InsertPayment): Promise<Payment>;
  getPaymentsByDriver(driverId: string, startDate?: Date, endDate?: Date): Promise<(Payment & { activity: WashoutActivity & { location: WashoutLocation } })[]>;
  getPaymentsByOwner(ownerId: string, startDate?: Date, endDate?: Date): Promise<(Payment & { activity: WashoutActivity & { driver: Driver & { user: User } } })[]>;
  updatePaymentStatus(paymentId: string, status: string, stripePaymentIntentId?: string): Promise<Payment>;
  getAllPayments(startDate?: Date, endDate?: Date): Promise<(Payment & { driver: Driver & { user: User }; owner: Owner & { user: User }; activity: WashoutActivity })[]>;

  // Statistics operations
  getDriverStats(driverId: string, days: number): Promise<{ totalEarnings: number; totalWashouts: number; avgPerWashout: number }>;
  getOwnerStats(ownerId: string, days: number): Promise<{ totalPayments: number; totalWashouts: number; totalDrivers: number }>;
  getSystemStats(days: number): Promise<{ totalEarnings: number; totalWashouts: number; totalDrivers: number; totalOwners: number }>;

  // Notification operations
  createNotification(notification: InsertNotification): Promise<Notification>;
  getNotificationsByUser(userId: string): Promise<Notification[]>;
  markNotificationAsRead(notificationId: string): Promise<Notification>;
}

export class DatabaseStorage implements IStorage {
  // User operations
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }

  async getUserById(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async createUser(userData: { username: string; email: string; passwordHash: string; firstName: string; lastName: string; role: string }): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .returning();
    return user;
  }

  async updateUserStripeInfo(userId: string, stripeCustomerId: string, stripeSubscriptionId?: string): Promise<User> {
    const [user] = await db
      .update(users)
      .set({ 
        stripeCustomerId, 
        stripeSubscriptionId,
        updatedAt: new Date() 
      })
      .where(eq(users.id, userId))
      .returning();
    return user;
  }

  // Driver operations
  async createDriver(driver: InsertDriver): Promise<Driver> {
    const [newDriver] = await db.insert(drivers).values(driver).returning();
    return newDriver;
  }

  async getDriver(userId: string): Promise<Driver | undefined> {
    const [driver] = await db.select().from(drivers).where(eq(drivers.userId, userId));
    return driver;
  }

  async getDriverById(id: string): Promise<Driver | undefined> {
    const [driver] = await db.select().from(drivers).where(eq(drivers.id, id));
    return driver;
  }

  async updateDriver(driverId: string, driverData: Partial<InsertDriver>): Promise<Driver> {
    const [updatedDriver] = await db
      .update(drivers)
      .set({
        ...driverData,
        updatedAt: new Date(),
      })
      .where(eq(drivers.id, driverId))
      .returning();
    return updatedDriver;
  }

  async updateDriverLocation(driverId: string, latitude: number, longitude: number): Promise<void> {
    await db
      .update(drivers)
      .set({
        currentLatitude: latitude.toString(),
        currentLongitude: longitude.toString(),
        lastLocationUpdate: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(drivers.id, driverId));
  }

  async getAllDrivers(): Promise<(Driver & { user: User })[]> {
    return await db
      .select()
      .from(drivers)
      .innerJoin(users, eq(drivers.userId, users.id));
  }

  // Owner operations
  async createOwner(owner: InsertOwner): Promise<Owner> {
    const [newOwner] = await db.insert(owners).values(owner).returning();
    return newOwner;
  }

  async getOwner(userId: string): Promise<Owner | undefined> {
    const [owner] = await db.select().from(owners).where(eq(owners.userId, userId));
    return owner;
  }

  async getOwnerById(id: string): Promise<Owner | undefined> {
    const [owner] = await db.select().from(owners).where(eq(owners.id, id));
    return owner;
  }

  async updateOwner(ownerId: string, ownerData: Partial<InsertOwner>): Promise<Owner> {
    const [updatedOwner] = await db
      .update(owners)
      .set({
        ...ownerData,
        updatedAt: new Date(),
      })
      .where(eq(owners.id, ownerId))
      .returning();
    return updatedOwner;
  }

  async updateOwnerSubscription(ownerId: string, status: string, subscriptionId?: string): Promise<Owner> {
    const updateData: any = {
      subscriptionStatus: status as any,
      updatedAt: new Date(),
    };
    
    if (subscriptionId) {
      updateData.stripeSubscriptionId = subscriptionId;
    }

    const [owner] = await db
      .update(owners)
      .set(updateData)
      .where(eq(owners.id, ownerId))
      .returning();
    return owner;
  }

  async approveOwner(ownerId: string): Promise<Owner> {
    const [owner] = await db
      .update(owners)
      .set({ isApproved: true, updatedAt: new Date() })
      .where(eq(owners.id, ownerId))
      .returning();
    return owner;
  }

  async getAllOwners(): Promise<(Owner & { user: User })[]> {
    return await db
      .select()
      .from(owners)
      .innerJoin(users, eq(owners.userId, users.id));
  }

  async getAllAdmins(): Promise<User[]> {
    return await db
      .select()
      .from(users)
      .where(eq(users.role, 'admin'))
      .orderBy(desc(users.createdAt));
  }

  // Location operations
  async createWashoutLocation(location: InsertWashoutLocation): Promise<WashoutLocation> {
    const [newLocation] = await db.insert(washoutLocations).values(location).returning();
    return newLocation;
  }

  async getWashoutLocation(id: string): Promise<WashoutLocation | undefined> {
    const [location] = await db.select().from(washoutLocations).where(eq(washoutLocations.id, id));
    return location;
  }

  async getLocationsByOwner(ownerId: string): Promise<WashoutLocation[]> {
    return await db
      .select()
      .from(washoutLocations)
      .where(eq(washoutLocations.ownerId, ownerId))
      .orderBy(desc(washoutLocations.createdAt));
  }

  async getActiveLocations(): Promise<(WashoutLocation & { owner: Owner & { user: User } })[]> {
    return await db
      .select()
      .from(washoutLocations)
      .innerJoin(owners, eq(washoutLocations.ownerId, owners.id))
      .innerJoin(users, eq(owners.userId, users.id))
      .where(and(
        eq(washoutLocations.isActive, true),
        eq(washoutLocations.isVisible, true),
        eq(owners.isApproved, true)
      ))
      .orderBy(washoutLocations.name);
  }

  async updateLocationVisibility(locationId: string, isVisible: boolean): Promise<WashoutLocation> {
    const [location] = await db
      .update(washoutLocations)
      .set({ isVisible, updatedAt: new Date() })
      .where(eq(washoutLocations.id, locationId))
      .returning();
    return location;
  }

  async updateLocationRate(locationId: string, rate: string): Promise<WashoutLocation> {
    const [location] = await db
      .update(washoutLocations)
      .set({ rate, updatedAt: new Date() })
      .where(eq(washoutLocations.id, locationId))
      .returning();
    return location;
  }

  async deleteWashoutLocation(locationId: string, ownerId: string): Promise<boolean> {
    const result = await db
      .delete(washoutLocations)
      .where(and(
        eq(washoutLocations.id, locationId),
        eq(washoutLocations.ownerId, ownerId)
      ))
      .returning();
    
    return result.length > 0;
  }

  async getAllLocations(): Promise<(WashoutLocation & { owner: Owner & { user: User } })[]> {
    const results = await db
      .select()
      .from(washoutLocations)
      .innerJoin(owners, eq(washoutLocations.ownerId, owners.id))
      .innerJoin(users, eq(owners.userId, users.id))
      .orderBy(desc(washoutLocations.createdAt));

    // Transform the nested structure to flat structure expected by frontend
    return results.map((row: any) => ({
      ...row.washout_locations,
      owner: {
        ...row.owners,
        user: row.users
      }
    }));
  }

  // Activity operations
  async createWashoutActivity(activity: InsertWashoutActivity): Promise<WashoutActivity> {
    const [newActivity] = await db.insert(washoutActivities).values(activity).returning();
    return newActivity;
  }

  async getWashoutActivity(id: string): Promise<WashoutActivity | undefined> {
    const [activity] = await db.select().from(washoutActivities).where(eq(washoutActivities.id, id));
    return activity;
  }

  async getActivitiesByDriver(driverId: string, startDate?: Date, endDate?: Date): Promise<(WashoutActivity & { location: WashoutLocation })[]> {
    const conditions = [eq(washoutActivities.driverId, driverId)];
    
    if (startDate) {
      conditions.push(gte(washoutActivities.checkInTime, startDate));
    }
    
    if (endDate) {
      conditions.push(lte(washoutActivities.checkInTime, endDate));
    }

    const query = db
      .select()
      .from(washoutActivities)
      .innerJoin(washoutLocations, eq(washoutActivities.locationId, washoutLocations.id))
      .where(and(...conditions));

    return await query.orderBy(desc(washoutActivities.checkInTime));
  }

  async getActivitiesByLocation(locationId: string, startDate?: Date, endDate?: Date): Promise<(WashoutActivity & { driver: Driver & { user: User } })[]> {
    const conditions = [eq(washoutActivities.locationId, locationId)];
    
    if (startDate) {
      conditions.push(gte(washoutActivities.checkInTime, startDate));
    }
    
    if (endDate) {
      conditions.push(lte(washoutActivities.checkInTime, endDate));
    }

    const query = db
      .select()
      .from(washoutActivities)
      .innerJoin(drivers, eq(washoutActivities.driverId, drivers.id))
      .innerJoin(users, eq(drivers.userId, users.id))
      .where(and(...conditions));

    return await query.orderBy(desc(washoutActivities.checkInTime));
  }

  async getActivitiesByOwner(ownerId: string, startDate?: Date, endDate?: Date): Promise<(WashoutActivity & { location: WashoutLocation; driver: Driver & { user: User } })[]> {
    const conditions = [eq(washoutLocations.ownerId, ownerId)];
    
    if (startDate) {
      conditions.push(gte(washoutActivities.checkInTime, startDate));
    }
    
    if (endDate) {
      conditions.push(lte(washoutActivities.checkInTime, endDate));
    }

    const query = db
      .select()
      .from(washoutActivities)
      .innerJoin(washoutLocations, eq(washoutActivities.locationId, washoutLocations.id))
      .innerJoin(drivers, eq(washoutActivities.driverId, drivers.id))
      .innerJoin(users, eq(drivers.userId, users.id))
      .where(and(...conditions));

    return await query.orderBy(desc(washoutActivities.checkInTime));
  }

  async verifyWashoutActivity(activityId: string, verifiedBy: string): Promise<WashoutActivity> {
    const [activity] = await db
      .update(washoutActivities)
      .set({ 
        status: "verified",
        verifiedBy,
        verifiedAt: new Date(),
        updatedAt: new Date()
      })
      .where(eq(washoutActivities.id, activityId))
      .returning();
    return activity;
  }

  async rejectWashoutActivity(activityId: string, rejectedBy: string): Promise<WashoutActivity> {
    const [activity] = await db
      .update(washoutActivities)
      .set({ 
        status: "rejected",
        verifiedBy: rejectedBy,
        verifiedAt: new Date(),
        updatedAt: new Date()
      })
      .where(eq(washoutActivities.id, activityId))
      .returning();
    return activity;
  }

  async getRecentActivitiesByDriver(driverId: string, limit = 5): Promise<(WashoutActivity & { location: WashoutLocation })[]> {
    return await db
      .select()
      .from(washoutActivities)
      .innerJoin(washoutLocations, eq(washoutActivities.locationId, washoutLocations.id))
      .where(eq(washoutActivities.driverId, driverId))
      .orderBy(desc(washoutActivities.checkInTime))
      .limit(limit);
  }

  async getAllActivities(startDate?: Date, endDate?: Date): Promise<(WashoutActivity & { location: WashoutLocation; driver: Driver & { user: User } })[]> {
    const conditions = [];
    
    if (startDate) {
      conditions.push(gte(washoutActivities.checkInTime, startDate));
    }
    
    if (endDate) {
      conditions.push(lte(washoutActivities.checkInTime, endDate));
    }

    let query = db
      .select()
      .from(washoutActivities)
      .innerJoin(washoutLocations, eq(washoutActivities.locationId, washoutLocations.id))
      .innerJoin(drivers, eq(washoutActivities.driverId, drivers.id))
      .innerJoin(users, eq(drivers.userId, users.id));

    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }

    return await query.orderBy(desc(washoutActivities.checkInTime));
  }

  // Payment operations
  async createPayment(payment: InsertPayment): Promise<Payment> {
    const [newPayment] = await db.insert(payments).values(payment).returning();
    return newPayment;
  }

  async getPaymentsByDriver(driverId: string, startDate?: Date, endDate?: Date): Promise<(Payment & { activity: WashoutActivity & { location: WashoutLocation } })[]> {
    const conditions = [eq(payments.driverId, driverId)];
    
    if (startDate) {
      conditions.push(gte(payments.createdAt, startDate));
    }
    
    if (endDate) {
      conditions.push(lte(payments.createdAt, endDate));
    }

    const query = db
      .select()
      .from(payments)
      .innerJoin(washoutActivities, eq(payments.activityId, washoutActivities.id))
      .innerJoin(washoutLocations, eq(washoutActivities.locationId, washoutLocations.id))
      .where(and(...conditions));

    return await query.orderBy(desc(payments.createdAt));
  }

  async getPaymentsByOwner(ownerId: string, startDate?: Date, endDate?: Date): Promise<(Payment & { activity: WashoutActivity & { driver: Driver & { user: User } } })[]> {
    let query = db
      .select()
      .from(payments)
      .innerJoin(washoutActivities, eq(payments.activityId, washoutActivities.id))
      .innerJoin(drivers, eq(washoutActivities.driverId, drivers.id))
      .innerJoin(users, eq(drivers.userId, users.id))
      .where(eq(payments.ownerId, ownerId));

    if (startDate) {
      query = query.where(and(eq(payments.ownerId, ownerId), gte(payments.createdAt, startDate)));
    }
    
    if (endDate) {
      query = query.where(and(eq(payments.ownerId, ownerId), lte(payments.createdAt, endDate)));
    }

    return await query.orderBy(desc(payments.createdAt));
  }

  async updatePaymentStatus(paymentId: string, status: string, stripePaymentIntentId?: string): Promise<Payment> {
    const updateData: any = {
      status,
      updatedAt: new Date(),
    };
    
    if (stripePaymentIntentId) {
      updateData.stripePaymentIntentId = stripePaymentIntentId;
    }
    
    if (status === 'completed') {
      updateData.paidAt = new Date();
    }

    const [payment] = await db
      .update(payments)
      .set(updateData)
      .where(eq(payments.id, paymentId))
      .returning();
    return payment;
  }

  async getAllPayments(startDate?: Date, endDate?: Date): Promise<(Payment & { driver: Driver & { user: User }; owner: Owner & { user: User }; activity: WashoutActivity })[]> {
    let query = db
      .select()
      .from(payments)
      .innerJoin(drivers, eq(payments.driverId, drivers.id))
      .innerJoin(users, eq(drivers.userId, users.id))
      .innerJoin(owners, eq(payments.ownerId, owners.id))
      .innerJoin(washoutActivities, eq(payments.activityId, washoutActivities.id));

    if (startDate) {
      query = query.where(gte(payments.createdAt, startDate));
    }
    
    if (endDate) {
      query = query.where(lte(payments.createdAt, endDate));
    }

    return await query.orderBy(desc(payments.createdAt));
  }

  // Statistics operations
  async getDriverStats(driverId: string, days: number): Promise<{ totalEarnings: number; totalWashouts: number; avgPerWashout: number }> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const result = await db
      .select({
        totalEarnings: sql<number>`COALESCE(SUM(CAST(${washoutActivities.amount} AS DECIMAL)), 0)`,
        totalWashouts: count(washoutActivities.id),
      })
      .from(washoutActivities)
      .where(and(
        eq(washoutActivities.driverId, driverId),
        gte(washoutActivities.checkInTime, startDate)
      ));

    const stats = result[0] || { totalEarnings: 0, totalWashouts: 0 };
    const avgPerWashout = stats.totalWashouts > 0 ? stats.totalEarnings / stats.totalWashouts : 0;

    return {
      totalEarnings: Number(stats.totalEarnings),
      totalWashouts: Number(stats.totalWashouts),
      avgPerWashout: Number(avgPerWashout.toFixed(2)),
    };
  }

  async getOwnerStats(ownerId: string, days: number): Promise<{ totalPayments: number; totalWashouts: number; totalDrivers: number }> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const paymentStats = await db
      .select({
        totalPayments: sql<number>`COALESCE(SUM(CAST(${payments.amount} AS DECIMAL)), 0)`,
        totalWashouts: count(payments.id),
        totalDrivers: sql<number>`COUNT(DISTINCT ${payments.driverId})`,
      })
      .from(payments)
      .where(and(
        eq(payments.ownerId, ownerId),
        gte(payments.createdAt, startDate)
      ));

    const stats = paymentStats[0] || { totalPayments: 0, totalWashouts: 0, totalDrivers: 0 };

    return {
      totalPayments: Number(stats.totalPayments),
      totalWashouts: Number(stats.totalWashouts),
      totalDrivers: Number(stats.totalDrivers),
    };
  }

  async getSystemStats(days: number): Promise<{ totalEarnings: number; totalWashouts: number; totalDrivers: number; totalOwners: number }> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Calculate stats from washout activities (pending and verified, excluding rejected)
    const activityStats = await db
      .select({
        totalEarnings: sql<number>`COALESCE(SUM(CAST(${washoutActivities.amount} AS DECIMAL)), 0)`,
        totalWashouts: count(washoutActivities.id),
        totalDrivers: sql<number>`COUNT(DISTINCT ${washoutActivities.driverId})`,
      })
      .from(washoutActivities)
      .where(and(
        gte(washoutActivities.checkInTime, startDate),
        ne(washoutActivities.status, 'rejected')
      ));

    // Get unique owners from locations used in activities
    const ownerStats = await db
      .select({
        totalOwners: sql<number>`COUNT(DISTINCT ${washoutLocations.ownerId})`,
      })
      .from(washoutActivities)
      .innerJoin(washoutLocations, eq(washoutActivities.locationId, washoutLocations.id))
      .where(and(
        gte(washoutActivities.checkInTime, startDate),
        ne(washoutActivities.status, 'rejected')
      ));

    const stats = activityStats[0] || { totalEarnings: 0, totalWashouts: 0, totalDrivers: 0 };
    const ownerCount = ownerStats[0]?.totalOwners || 0;

    return {
      totalEarnings: Number(stats.totalEarnings),
      totalWashouts: Number(stats.totalWashouts),
      totalDrivers: Number(stats.totalDrivers),
      totalOwners: Number(ownerCount),
    };
  }

  // Notification operations
  async createNotification(notification: InsertNotification): Promise<Notification> {
    const [newNotification] = await db.insert(notifications).values(notification).returning();
    return newNotification;
  }

  async getNotificationsByUser(userId: string): Promise<Notification[]> {
    return await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt));
  }

  async markNotificationAsRead(notificationId: string): Promise<Notification> {
    const [notification] = await db
      .update(notifications)
      .set({ isRead: true })
      .where(eq(notifications.id, notificationId))
      .returning();
    return notification;
  }
}

export const storage = new DatabaseStorage();
