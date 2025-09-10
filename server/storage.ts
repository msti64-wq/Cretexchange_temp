import {
  users,
  drivers,
  owners,
  washoutLocations,
  washoutActivities,
  payments,
  notifications,
  messages,
  passwordResetTokens,
  ownerPaymentMethods,
  driverWallets,
  walletTransactions,
  withdrawals,
  type User,
  type UpsertUser,
  type Driver,
  type Owner,
  type WashoutLocation,
  type WashoutActivity,
  type Payment,
  type Notification,
  type Message,
  type PasswordResetToken,
  type OwnerPaymentMethod,
  type DriverWallet,
  type WalletTransaction,
  type Withdrawal,
  type InsertDriver,
  type InsertOwner,
  type InsertWashoutLocation,
  type InsertWashoutActivity,
  type InsertPayment,
  type InsertNotification,
  type InsertMessage,
  type InsertPasswordResetToken,
  type InsertOwnerPaymentMethod,
  type InsertDriverWallet,
  type InsertWalletTransaction,
  type InsertWithdrawal,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, gte, lte, desc, sql, count, ne, or, getTableColumns } from "drizzle-orm";

export interface IStorage {
  // User operations - local authentication
  getUser(id: string): Promise<User | undefined>;
  getUserById(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByUsernameInsensitive(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: { username: string; email: string; passwordHash: string; firstName: string; lastName: string; phone?: string; address?: string; role: string }): Promise<User>;
  upsertUser(user: UpsertUser): Promise<User>;
  updateUserStripeInfo(userId: string, stripeCustomerId: string, stripeSubscriptionId?: string): Promise<User>;
  updateUserPassword(userId: string, passwordHash: string): Promise<User>;

  // Password reset operations
  createPasswordResetToken(token: InsertPasswordResetToken): Promise<PasswordResetToken>;
  getPasswordResetToken(token: string): Promise<PasswordResetToken | undefined>;
  deletePasswordResetToken(tokenId: string): Promise<void>;

  // Driver operations
  createDriver(driver: InsertDriver): Promise<Driver>;
  getDriver(userId: string): Promise<Driver | undefined>;
  getDriverById(id: string): Promise<Driver | undefined>;
  updateDriver(driverId: string, driverData: Partial<InsertDriver>): Promise<Driver>;
  updateDriverLocation(driverId: string, latitude: number, longitude: number): Promise<void>;
  getAllDrivers(): Promise<(Driver & { user: User })[]>;
  getAllAdmins(): Promise<User[]>;
  createAdminUser(adminData: { username: string; email: string; passwordHash: string; firstName: string; lastName: string }): Promise<User>;

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

  // Message operations
  createMessage(message: InsertMessage): Promise<Message>;
  getAllMessages(): Promise<(Message & { user: User })[]>;
  getMessageById(messageId: string): Promise<(Message & { user: User }) | undefined>;
  updateMessageStatus(messageId: string, status: string): Promise<Message>;

  // Payment methods operations
  createOwnerPaymentMethod(paymentMethod: InsertOwnerPaymentMethod): Promise<OwnerPaymentMethod>;
  getOwnerPaymentMethods(ownerId: string): Promise<OwnerPaymentMethod[]>;
  getOwnerPaymentMethodById(id: string): Promise<OwnerPaymentMethod | undefined>;
  deleteOwnerPaymentMethod(id: string): Promise<void>;
  setDefaultPaymentMethod(ownerId: string, paymentMethodId: string): Promise<void>;

  // Wallet operations
  createDriverWallet(wallet: InsertDriverWallet): Promise<DriverWallet>;
  getDriverWallet(driverId: string): Promise<DriverWallet | undefined>;
  updateWalletBalance(driverId: string, availableBalance: string, pendingBalance: string): Promise<DriverWallet>;
  
  // Wallet transaction operations
  createWalletTransaction(transaction: InsertWalletTransaction): Promise<WalletTransaction>;
  getWalletTransactionsByDriver(driverId: string, startDate?: Date, endDate?: Date): Promise<WalletTransaction[]>;
  getWalletTransaction(id: string): Promise<WalletTransaction | undefined>;
  updateWalletTransactionStatus(transactionId: string, status: string): Promise<WalletTransaction>;
  
  // Withdrawal operations
  createWithdrawal(withdrawal: InsertWithdrawal): Promise<Withdrawal>;
  getWithdrawalsByDriver(driverId: string, startDate?: Date, endDate?: Date): Promise<Withdrawal[]>;
  getWithdrawal(id: string): Promise<Withdrawal | undefined>;
  updateWithdrawalStatus(withdrawalId: string, status: string, stripeTransferId?: string, stripePayoutId?: string, failureReason?: string): Promise<Withdrawal>;
  getAllWithdrawals(startDate?: Date, endDate?: Date): Promise<(Withdrawal & { driver: Driver & { user: User } })[]>;
  
  // Wallet statistics
  getWalletStats(driverId: string, days: number): Promise<{ totalCredits: number; totalDebits: number; totalFees: number; transactionCount: number }>;
  
  // Debug operations
  getUserCount(): Promise<number>;
  getTestUsers(): Promise<string[]>;
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

  async getUserByUsernameInsensitive(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(sql`LOWER(${users.username}) = LOWER(${username})`);
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async createUser(userData: { username: string; email: string; passwordHash: string; firstName: string; lastName: string; phone?: string; address?: string; role: string }): Promise<User> {
    try {
      const [user] = await db
        .insert(users)
        .values({
          username: userData.username,
          email: userData.email,
          passwordHash: userData.passwordHash,
          firstName: userData.firstName,
          lastName: userData.lastName,
          phone: userData.phone,
          address: userData.address,
          role: userData.role as any, // Cast to handle enum validation
        })
        .returning();
      return user;
    } catch (error) {
      console.error('Database createUser error:', error);
      throw new Error(`User creation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
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

  async updateUserPassword(userId: string, passwordHash: string): Promise<User> {
    const [user] = await db
      .update(users)
      .set({ 
        passwordHash,
        updatedAt: new Date() 
      })
      .where(eq(users.id, userId))
      .returning();
    return user;
  }

  // Password reset operations
  async createPasswordResetToken(tokenData: InsertPasswordResetToken): Promise<PasswordResetToken> {
    const [token] = await db
      .insert(passwordResetTokens)
      .values(tokenData)
      .returning();
    return token;
  }

  async getPasswordResetToken(token: string): Promise<PasswordResetToken | undefined> {
    const [resetToken] = await db
      .select()
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.token, token));
    return resetToken;
  }

  async deletePasswordResetToken(tokenId: string): Promise<void> {
    await db
      .delete(passwordResetTokens)
      .where(eq(passwordResetTokens.id, tokenId));
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
    const result = await db
      .select({
        id: drivers.id,
        userId: drivers.userId,
        employerName: drivers.employerName,
        employerAddress: drivers.employerAddress,
        employerPhone: drivers.employerPhone,
        licenseNumber: drivers.licenseNumber,
        isGpsEnabled: drivers.isGpsEnabled,
        currentLatitude: drivers.currentLatitude,
        currentLongitude: drivers.currentLongitude,
        lastLocationUpdate: drivers.lastLocationUpdate,
        connectedAccountId: drivers.connectedAccountId,
        createdAt: drivers.createdAt,
        updatedAt: drivers.updatedAt,
        user: {
          id: users.id,
          username: users.username,
          email: users.email,
          passwordHash: users.passwordHash,
          firstName: users.firstName,
          lastName: users.lastName,
          profileImageUrl: users.profileImageUrl,
          role: users.role,
          phone: users.phone,
          address: users.address,
          paymentMethod: users.paymentMethod,
          paymentFrequency: users.paymentFrequency,
          stripeCustomerId: users.stripeCustomerId,
          stripeSubscriptionId: users.stripeSubscriptionId,
          isActive: users.isActive,
          createdAt: users.createdAt,
          updatedAt: users.updatedAt,
        },
      })
      .from(drivers)
      .innerJoin(users, eq(drivers.userId, users.id));
    return result;
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
    const result = await db
      .select({
        id: owners.id,
        userId: owners.userId,
        companyName: owners.companyName,
        businessLicense: owners.businessLicense,
        taxId: owners.taxId,
        subscriptionStatus: owners.subscriptionStatus,
        subscriptionPlan: owners.subscriptionPlan,
        subscriptionEndsAt: owners.subscriptionEndsAt,
        isApproved: owners.isApproved,
        hasAgreedToTerms: owners.hasAgreedToTerms,
        termsAgreedAt: owners.termsAgreedAt,
        createdAt: owners.createdAt,
        updatedAt: owners.updatedAt,
        user: {
          id: users.id,
          username: users.username,
          email: users.email,
          passwordHash: users.passwordHash,
          firstName: users.firstName,
          lastName: users.lastName,
          profileImageUrl: users.profileImageUrl,
          role: users.role,
          phone: users.phone,
          address: users.address,
          paymentMethod: users.paymentMethod,
          paymentFrequency: users.paymentFrequency,
          stripeCustomerId: users.stripeCustomerId,
          stripeSubscriptionId: users.stripeSubscriptionId,
          isActive: users.isActive,
          createdAt: users.createdAt,
          updatedAt: users.updatedAt,
        },
      })
      .from(owners)
      .innerJoin(users, eq(owners.userId, users.id));
    return result;
  }

  async getAllAdmins(): Promise<User[]> {
    return await db
      .select()
      .from(users)
      .where(or(eq(users.role, 'admin'), eq(users.role, 'super_admin')))
      .orderBy(desc(users.createdAt));
  }

  async createAdminUser(adminData: { username: string; email: string; passwordHash: string; firstName: string; lastName: string }): Promise<User> {
    const [newAdmin] = await db
      .insert(users)
      .values({
        ...adminData,
        role: 'admin',
        isActive: true,
      })
      .returning();
    return newAdmin;
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
    const results = await db
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
    
    return results.map((row: any) => ({
      ...row.washout_locations,
      owner: {
        ...row.owners,
        user: row.users
      }
    }));
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

    const results = await db
      .select()
      .from(washoutActivities)
      .innerJoin(washoutLocations, eq(washoutActivities.locationId, washoutLocations.id))
      .where(and(...conditions))
      .orderBy(desc(washoutActivities.checkInTime));

    return results.map((row: any) => ({
      ...row.washout_activities,
      location: row.washout_locations
    }));
  }

  async getActivitiesByLocation(locationId: string, startDate?: Date, endDate?: Date): Promise<(WashoutActivity & { driver: Driver & { user: User } })[]> {
    const conditions = [eq(washoutActivities.locationId, locationId)];
    
    if (startDate) {
      conditions.push(gte(washoutActivities.checkInTime, startDate));
    }
    
    if (endDate) {
      conditions.push(lte(washoutActivities.checkInTime, endDate));
    }

    const results = await db
      .select()
      .from(washoutActivities)
      .innerJoin(drivers, eq(washoutActivities.driverId, drivers.id))
      .innerJoin(users, eq(drivers.userId, users.id))
      .where(and(...conditions))
      .orderBy(desc(washoutActivities.checkInTime));

    return results.map((row: any) => ({
      ...row.washout_activities,
      driver: {
        ...row.drivers,
        user: row.users
      }
    }));
  }

  async getActivitiesByOwner(ownerId: string, startDate?: Date, endDate?: Date): Promise<(WashoutActivity & { location: WashoutLocation; driver: Driver & { user: User } })[]> {
    const conditions = [eq(washoutLocations.ownerId, ownerId)];
    
    if (startDate) {
      conditions.push(gte(washoutActivities.checkInTime, startDate));
    }
    
    if (endDate) {
      conditions.push(lte(washoutActivities.checkInTime, endDate));
    }

    const results = await db
      .select()
      .from(washoutActivities)
      .innerJoin(washoutLocations, eq(washoutActivities.locationId, washoutLocations.id))
      .innerJoin(drivers, eq(washoutActivities.driverId, drivers.id))
      .innerJoin(users, eq(drivers.userId, users.id))
      .where(and(...conditions))
      .orderBy(desc(washoutActivities.checkInTime));

    return results.map((row: any) => ({
      ...row.washout_activities,
      location: row.washout_locations,
      driver: {
        ...row.drivers,
        user: row.users
      }
    }));
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
    const results = await db
      .select()
      .from(washoutActivities)
      .innerJoin(washoutLocations, eq(washoutActivities.locationId, washoutLocations.id))
      .where(eq(washoutActivities.driverId, driverId))
      .orderBy(desc(washoutActivities.checkInTime))
      .limit(limit);
    
    return results.map((row: any) => ({
      ...row.washout_activities,
      location: row.washout_locations
    }));
  }

  async getAllActivities(startDate?: Date, endDate?: Date): Promise<(WashoutActivity & { location: WashoutLocation; driver: Driver & { user: User } })[]> {
    const conditions = [eq(washoutActivities.id, washoutActivities.id)]; // Always true condition
    
    if (startDate) {
      conditions.push(gte(washoutActivities.checkInTime, startDate));
    }
    
    if (endDate) {
      conditions.push(lte(washoutActivities.checkInTime, endDate));
    }

    const results = await db
      .select()
      .from(washoutActivities)
      .innerJoin(washoutLocations, eq(washoutActivities.locationId, washoutLocations.id))
      .innerJoin(drivers, eq(washoutActivities.driverId, drivers.id))
      .innerJoin(users, eq(drivers.userId, users.id))
      .where(and(...conditions))
      .orderBy(desc(washoutActivities.checkInTime));
    
    return results.map((row: any) => ({
      ...row.washout_activities,
      location: row.washout_locations,
      driver: {
        ...row.drivers,
        user: row.users
      }
    }));
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

    const results = await db
      .select()
      .from(payments)
      .innerJoin(washoutActivities, eq(payments.activityId, washoutActivities.id))
      .innerJoin(washoutLocations, eq(washoutActivities.locationId, washoutLocations.id))
      .where(and(...conditions))
      .orderBy(desc(payments.createdAt));

    return results.map((row: any) => ({
      ...row.payments,
      activity: {
        ...row.washout_activities,
        location: row.washout_locations
      }
    }));
  }

  async getPaymentsByOwner(ownerId: string, startDate?: Date, endDate?: Date): Promise<(Payment & { activity: WashoutActivity & { driver: Driver & { user: User } } })[]> {
    const conditions = [eq(payments.ownerId, ownerId)];
    
    if (startDate) {
      conditions.push(gte(payments.createdAt, startDate));
    }
    
    if (endDate) {
      conditions.push(lte(payments.createdAt, endDate));
    }

    const results = await db
      .select()
      .from(payments)
      .innerJoin(washoutActivities, eq(payments.activityId, washoutActivities.id))
      .innerJoin(drivers, eq(washoutActivities.driverId, drivers.id))
      .innerJoin(users, eq(drivers.userId, users.id))
      .where(and(...conditions))
      .orderBy(desc(payments.createdAt));

    return results.map((row: any) => ({
      ...row.payments,
      activity: {
        ...row.washout_activities,
        driver: {
          ...row.drivers,
          user: row.users
        }
      }
    }));
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
    const conditions = [eq(payments.id, payments.id)]; // Always true condition
    
    if (startDate) {
      conditions.push(gte(payments.createdAt, startDate));
    }
    
    if (endDate) {
      conditions.push(lte(payments.createdAt, endDate));
    }

    const results = await db
      .select()
      .from(payments)
      .innerJoin(drivers, eq(payments.driverId, drivers.id))
      .innerJoin(users, eq(drivers.userId, users.id))
      .innerJoin(owners, eq(payments.ownerId, owners.id))
      .innerJoin(washoutActivities, eq(payments.activityId, washoutActivities.id))
      .where(and(...conditions))
      .orderBy(desc(payments.createdAt));

    // Transform the results to handle the owner user relationship
    const transformedResults: any[] = [];
    
    for (const row of results) {
      // Get the owner's user information
      const [ownerUser] = await db
        .select()
        .from(users)
        .where(eq(users.id, row.owners.userId));

      transformedResults.push({
        ...row.payments,
        driver: {
          ...row.drivers,
          user: row.users
        },
        owner: {
          ...row.owners,
          user: ownerUser
        },
        activity: row.washout_activities
      });
    }

    return transformedResults;
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

  async getSystemStats(days: number): Promise<{ 
    totalEarnings: number; 
    totalWashouts: number; 
    totalDrivers: number; 
    totalOwners: number;
    subscriptionRevenue: number;
    activeLicenses: number;
    licenseRenewals: number;
  }> {
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

    // Get subscription statistics
    const subscriptionStats = await db
      .select({
        activeLicenses: sql<number>`COUNT(*) FILTER (WHERE ${owners.subscriptionStatus} = 'active')`,
        licenseRenewals: sql<number>`COUNT(*) FILTER (WHERE ${owners.subscriptionStatus} = 'active' AND ${owners.updatedAt} >= ${startDate})`,
      })
      .from(owners);

    // Calculate subscription revenue based on active licenses
    // For now, using a placeholder amount of $50/month per license until Stripe integration
    const monthlyRatePerLicense = 50;
    const activeLicenseCount = subscriptionStats[0]?.activeLicenses || 0;
    const subscriptionRevenue = Number(activeLicenseCount) * monthlyRatePerLicense;

    const stats = activityStats[0] || { totalEarnings: 0, totalWashouts: 0, totalDrivers: 0 };
    const ownerCount = ownerStats[0]?.totalOwners || 0;
    const subStats = subscriptionStats[0] || { activeLicenses: 0, licenseRenewals: 0 };

    return {
      totalEarnings: Number(stats.totalEarnings),
      totalWashouts: Number(stats.totalWashouts),
      totalDrivers: Number(stats.totalDrivers),
      totalOwners: Number(ownerCount),
      subscriptionRevenue: subscriptionRevenue,
      activeLicenses: Number(subStats.activeLicenses),
      licenseRenewals: Number(subStats.licenseRenewals),
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

  // Message operations
  async createMessage(message: InsertMessage): Promise<Message> {
    const [newMessage] = await db.insert(messages).values(message).returning();
    return newMessage;
  }

  async getAllMessages(): Promise<(Message & { user: User })[]> {
    const results = await db
      .select()
      .from(messages)
      .innerJoin(users, eq(messages.userId, users.id))
      .orderBy(desc(messages.createdAt));
    
    return results.map((row: any) => ({
      ...row.messages,
      user: row.users
    }));
  }

  async getMessageById(messageId: string): Promise<(Message & { user: User }) | undefined> {
    const results = await db
      .select()
      .from(messages)
      .innerJoin(users, eq(messages.userId, users.id))
      .where(eq(messages.id, messageId));
    
    if (results.length === 0) return undefined;
    
    const row = results[0] as any;
    return {
      ...row.messages,
      user: row.users
    };
  }

  async updateMessageStatus(messageId: string, status: string): Promise<Message> {
    const resolvedAt = status === 'resolved' ? new Date() : null;
    const [message] = await db
      .update(messages)
      .set({ status: status as any, resolvedAt })
      .where(eq(messages.id, messageId))
      .returning();
    return message;
  }

  // Debug operations
  async getUserCount(): Promise<number> {
    const result = await db.select({ count: count() }).from(users);
    return result[0]?.count || 0;
  }

  async getTestUsers(): Promise<string[]> {
    const testUsers = await db
      .select({ username: users.username })
      .from(users)
      .where(or(
        eq(users.username, 'deploytest'),
        eq(users.username, 'prodtest'),
        eq(users.username, 'D1'),
        eq(users.username, 'O1'),
        eq(users.username, 'admin')
      ));
    return testUsers.map(u => u.username);
  }

  // Payment methods operations
  async createOwnerPaymentMethod(paymentMethod: InsertOwnerPaymentMethod): Promise<OwnerPaymentMethod> {
    // If this is set as default, unset all other defaults for this owner
    if (paymentMethod.isDefault) {
      await db
        .update(ownerPaymentMethods)
        .set({ isDefault: false })
        .where(eq(ownerPaymentMethods.ownerId, paymentMethod.ownerId));
    }

    const [newPaymentMethod] = await db.insert(ownerPaymentMethods).values(paymentMethod).returning();
    return newPaymentMethod;
  }

  async getOwnerPaymentMethods(ownerId: string): Promise<OwnerPaymentMethod[]> {
    return await db
      .select()
      .from(ownerPaymentMethods)
      .where(and(
        eq(ownerPaymentMethods.ownerId, ownerId),
        eq(ownerPaymentMethods.isActive, true)
      ))
      .orderBy(desc(ownerPaymentMethods.isDefault), desc(ownerPaymentMethods.createdAt));
  }

  async getOwnerPaymentMethodById(id: string): Promise<OwnerPaymentMethod | undefined> {
    const [paymentMethod] = await db
      .select()
      .from(ownerPaymentMethods)
      .where(eq(ownerPaymentMethods.id, id));
    return paymentMethod;
  }

  async deleteOwnerPaymentMethod(id: string): Promise<void> {
    await db
      .update(ownerPaymentMethods)
      .set({ isActive: false })
      .where(eq(ownerPaymentMethods.id, id));
  }

  async setDefaultPaymentMethod(ownerId: string, paymentMethodId: string): Promise<void> {
    // First, unset all defaults for this owner
    await db
      .update(ownerPaymentMethods)
      .set({ isDefault: false })
      .where(eq(ownerPaymentMethods.ownerId, ownerId));

    // Then set the specified one as default
    await db
      .update(ownerPaymentMethods)
      .set({ isDefault: true })
      .where(eq(ownerPaymentMethods.id, paymentMethodId));
  }

  // Wallet operations
  async createDriverWallet(wallet: InsertDriverWallet): Promise<DriverWallet> {
    const [newWallet] = await db.insert(driverWallets).values(wallet).returning();
    return newWallet;
  }

  async getDriverWallet(driverId: string): Promise<DriverWallet | undefined> {
    const [wallet] = await db
      .select()
      .from(driverWallets)
      .where(eq(driverWallets.driverId, driverId));
    return wallet;
  }

  async updateWalletBalance(driverId: string, availableBalance: string, pendingBalance: string): Promise<DriverWallet> {
    const [wallet] = await db
      .update(driverWallets)
      .set({
        availableBalance,
        pendingBalance,
        updatedAt: new Date(),
      })
      .where(eq(driverWallets.driverId, driverId))
      .returning();
    return wallet;
  }

  // Wallet transaction operations
  async createWalletTransaction(transaction: InsertWalletTransaction): Promise<WalletTransaction> {
    const [newTransaction] = await db.insert(walletTransactions).values(transaction).returning();
    return newTransaction;
  }

  async getWalletTransactionsByDriver(driverId: string, startDate?: Date, endDate?: Date): Promise<WalletTransaction[]> {
    const conditions = [eq(walletTransactions.driverId, driverId)];
    
    if (startDate) {
      conditions.push(gte(walletTransactions.createdAt, startDate));
    }
    
    if (endDate) {
      conditions.push(lte(walletTransactions.createdAt, endDate));
    }

    return await db
      .select()
      .from(walletTransactions)
      .where(and(...conditions))
      .orderBy(desc(walletTransactions.createdAt));
  }

  async getWalletTransaction(id: string): Promise<WalletTransaction | undefined> {
    const [transaction] = await db
      .select()
      .from(walletTransactions)
      .where(eq(walletTransactions.id, id));
    return transaction;
  }

  async updateWalletTransactionStatus(transactionId: string, status: string): Promise<WalletTransaction> {
    const [transaction] = await db
      .update(walletTransactions)
      .set({ status: status as any })
      .where(eq(walletTransactions.id, transactionId))
      .returning();
    return transaction;
  }

  // Withdrawal operations
  async createWithdrawal(withdrawal: InsertWithdrawal): Promise<Withdrawal> {
    const [newWithdrawal] = await db.insert(withdrawals).values(withdrawal).returning();
    return newWithdrawal;
  }

  async getWithdrawalsByDriver(driverId: string, startDate?: Date, endDate?: Date): Promise<Withdrawal[]> {
    const conditions = [eq(withdrawals.driverId, driverId)];
    
    if (startDate) {
      conditions.push(gte(withdrawals.createdAt, startDate));
    }
    
    if (endDate) {
      conditions.push(lte(withdrawals.createdAt, endDate));
    }

    return await db
      .select()
      .from(withdrawals)
      .where(and(...conditions))
      .orderBy(desc(withdrawals.createdAt));
  }

  async getWithdrawal(id: string): Promise<Withdrawal | undefined> {
    const [withdrawal] = await db
      .select()
      .from(withdrawals)
      .where(eq(withdrawals.id, id));
    return withdrawal;
  }

  async updateWithdrawalStatus(
    withdrawalId: string, 
    status: string, 
    stripeTransferId?: string, 
    stripePayoutId?: string, 
    failureReason?: string
  ): Promise<Withdrawal> {
    const updateData: any = {
      status: status as any,
    };

    if (stripeTransferId) updateData.stripeTransferId = stripeTransferId;
    if (stripePayoutId) updateData.stripePayoutId = stripePayoutId;
    if (failureReason) updateData.failureReason = failureReason;
    if (status === 'paid' || status === 'failed') updateData.processedAt = new Date();

    const [withdrawal] = await db
      .update(withdrawals)
      .set(updateData)
      .where(eq(withdrawals.id, withdrawalId))
      .returning();
    return withdrawal;
  }

  async getAllWithdrawals(startDate?: Date, endDate?: Date): Promise<(Withdrawal & { driver: Driver & { user: User } })[]> {
    const conditions = [eq(withdrawals.id, withdrawals.id)]; // Always true condition
    
    if (startDate) {
      conditions.push(gte(withdrawals.createdAt, startDate));
    }
    
    if (endDate) {
      conditions.push(lte(withdrawals.createdAt, endDate));
    }

    const results = await db
      .select()
      .from(withdrawals)
      .innerJoin(drivers, eq(withdrawals.driverId, drivers.id))
      .innerJoin(users, eq(drivers.userId, users.id))
      .where(and(...conditions))
      .orderBy(desc(withdrawals.createdAt));
    
    return results.map((row: any) => ({
      ...row.withdrawals,
      driver: {
        ...row.drivers,
        user: row.users
      }
    }));
  }

  // Wallet statistics
  async getWalletStats(driverId: string, days: number): Promise<{ totalCredits: number; totalDebits: number; totalFees: number; transactionCount: number }> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const transactions = await db
      .select({
        amount: walletTransactions.amount,
        direction: walletTransactions.direction,
      })
      .from(walletTransactions)
      .where(
        and(
          eq(walletTransactions.driverId, driverId),
          gte(walletTransactions.createdAt, startDate),
          eq(walletTransactions.status, 'posted')
        )
      );

    let totalCredits = 0;
    let totalDebits = 0;
    let totalFees = 0;

    transactions.forEach(transaction => {
      const amount = parseFloat(transaction.amount);
      switch (transaction.direction) {
        case 'credit':
          totalCredits += amount;
          break;
        case 'debit':
          totalDebits += amount;
          break;
        case 'fee':
          totalFees += amount;
          break;
      }
    });

    return {
      totalCredits,
      totalDebits,
      totalFees,
      transactionCount: transactions.length,
    };
  }
}

export const storage = new DatabaseStorage();
