import {
  users,
  drivers,
  owners,
  washoutLocations,
  washoutActivities,
  washoutPhotos,
  payments,
  notifications,
  messages,
  passwordResetTokens,
  ownerFundingSources,
  ownerWalletTransactions,
  driverWallets,
  walletTransactions,
  withdrawals,
  debitCardRequests,
  webhookEvents,
  servicePaymentAccounts,
  billingBatches,
  feesLedger,
  featureFlags,
  featureFlagOverrides,
  type User,
  type UpsertUser,
  type Driver,
  type Owner,
  type WashoutLocation,
  type WashoutActivity,
  type WashoutPhoto,
  type Payment,
  type Notification,
  type Message,
  type PasswordResetToken,
  type OwnerFundingSource,
  type OwnerWalletTransaction,
  type DriverWallet,
  type WalletTransaction,
  type Withdrawal,
  type DebitCardRequest,
  type ServicePaymentAccount,
  type BillingBatch,
  type FeeLedger,
  type FeatureFlag,
  type InsertFeatureFlag,
  type FeatureFlagOverride,
  type InsertDriver,
  type InsertOwner,
  type InsertWashoutLocation,
  type InsertWashoutActivity,
  type InsertWashoutPhoto,
  type InsertPayment,
  type InsertNotification,
  type InsertMessage,
  type InsertPasswordResetToken,
  type InsertOwnerFundingSource,
  type InsertDriverWallet,
  type InsertWalletTransaction,
  type InsertWithdrawal,
  type InsertDebitCardRequest,
  type InsertServicePaymentAccount,
  type UpdateServicePaymentAccount,
  type InsertBillingBatch,
  type InsertFeeLedger,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, gte, lte, desc, sql, count, ne, or, getTableColumns, isNull, isNotNull } from "drizzle-orm";

export interface IStorage {
  // User operations - local authentication
  getUser(id: string): Promise<User | undefined>;
  getUserById(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByUsernameInsensitive(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: { username: string; email: string; passwordHash: string; firstName: string; lastName: string; phone?: string; address?: string; role: string }): Promise<User>;
  upsertUser(user: UpsertUser): Promise<User>;
  updateUserColumnInfo(userId: string, columnCustomerId: string): Promise<User>;
  updateUserPassword(userId: string, passwordHash: string): Promise<User>;
  updateUserStatus(userId: string, isActive: boolean): Promise<User | undefined>;

  // Password reset operations
  createPasswordResetToken(token: InsertPasswordResetToken): Promise<PasswordResetToken>;
  getPasswordResetToken(token: string): Promise<PasswordResetToken | undefined>;
  deletePasswordResetToken(tokenId: string): Promise<void>;

  // Driver operations
  createDriver(driver: InsertDriver): Promise<Driver>;
  getDriver(userId: string): Promise<Driver | undefined>;
  getDriverById(id: string): Promise<Driver | undefined>;
  // Removed: getDriverByConnectedAccountId - no longer using Stripe Connect
  updateDriver(driverId: string, driverData: Partial<InsertDriver>): Promise<Driver>;
  updateDriverColumnInfo(driverId: string, columnData: { columnEntityId?: string; columnBankAccountId?: string; columnAccountLast4?: string }): Promise<Driver>;
  updateDriverLithicInfo(driverId: string, lithicData: { lithicAccountHolderToken?: string; lithicFinancialAccountToken?: string }): Promise<Driver>;
  updateDriverPaymentPreferences(driverId: string, paymentData: { paymentMethod: "ach" | "venmo" | "zelle"; bankName?: string; accountHolderName?: string; routingNumber?: string; accountNumber?: string; venmoHandle?: string; zelleEmail?: string }): Promise<Driver>;
  updateDriverLocation(driverId: string, latitude: number, longitude: number): Promise<void>;
  getAllDrivers(): Promise<(Driver & { user: User })[]>;
  getAllAdmins(): Promise<User[]>;
  createAdminUser(adminData: { username: string; email: string; passwordHash: string; firstName: string; lastName: string }): Promise<User>;

  // Owner operations
  createOwner(owner: InsertOwner): Promise<Owner>;
  getOwner(userId: string): Promise<Owner | undefined>;
  getOwnerById(id: string): Promise<Owner | undefined>;
  updateOwner(ownerId: string, ownerData: Partial<InsertOwner>): Promise<Owner>;
  updateOwnerColumnInfo(ownerId: string, columnData: { columnEntityId?: string; columnAccountId?: string }): Promise<Owner>;
  // Owner wallet operations (replacing subscription model)
  getOwnerWalletBalance(ownerId: string): Promise<{ balance: string; status: string } | undefined>;
  updateOwnerWalletBalance(ownerId: string, amount: string, type: string, description?: string): Promise<void>;
  getOwnerWalletTransactions(ownerId: string, startDate?: Date, endDate?: Date): Promise<any[]>;
  approveOwner(ownerId: string): Promise<Owner>;
  activateMembership(ownerId: string, paymentMethod: string, paymentNotes: string | undefined, activatedBy: string): Promise<Owner>;
  getAllOwners(): Promise<(Owner & { user: User })[]>;

  // Location operations
  createWashoutLocation(location: InsertWashoutLocation): Promise<WashoutLocation>;
  getWashoutLocation(id: string): Promise<WashoutLocation | undefined>;
  getLocationsByOwner(ownerId: string): Promise<WashoutLocation[]>;
  getActiveLocations(): Promise<(WashoutLocation & { owner: Owner & { user: User } })[]>;
  updateLocationVisibility(locationId: string, isVisible: boolean): Promise<WashoutLocation>;
  updateLocationRate(locationId: string, rate: string): Promise<WashoutLocation>;
  updateLocation(locationId: string, ownerId: string, locationData: Partial<InsertWashoutLocation>): Promise<WashoutLocation>;
  updateLocationStatus(locationId: string, ownerId: string, isActive: boolean): Promise<WashoutLocation>;
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

  // Photo operations - NEW clean photo system
  createWashoutPhoto(photo: InsertWashoutPhoto): Promise<WashoutPhoto>;
  getPhotosByActivity(activityId: string): Promise<WashoutPhoto[]>;
  getPhotoById(photoId: string): Promise<WashoutPhoto | undefined>;
  deletePhoto(photoId: string): Promise<boolean>;
  // Transactional operation: create activity with photos atomically
  createWashoutActivityWithPhotos(
    activity: InsertWashoutActivity, 
    photos: Omit<InsertWashoutPhoto, 'activityId'>[]
  ): Promise<{ activity: WashoutActivity; photos: WashoutPhoto[] }>;

  // Payment operations
  createPayment(payment: InsertPayment): Promise<Payment>;
  getPaymentsByDriver(driverId: string, startDate?: Date, endDate?: Date): Promise<(Payment & { activity: WashoutActivity & { location: WashoutLocation } })[]>;
  getPaymentsByOwner(ownerId: string, startDate?: Date, endDate?: Date): Promise<(Payment & { activity: WashoutActivity & { driver: Driver & { user: User } } })[]>;
  updatePaymentStatus(paymentId: string, status: string, columnTransferId?: string): Promise<Payment>;
  getAllPayments(startDate?: Date, endDate?: Date): Promise<(Payment & { driver: Driver & { user: User }; owner: Owner & { user: User }; activity: WashoutActivity })[]>;

  // Statistics operations
  getDriverStats(driverId: string, days: number): Promise<{ totalEarnings: number; totalWashouts: number; avgPerWashout: number }>;
  getOwnerStats(ownerId: string, days: number): Promise<{ totalPayments: number; totalWashouts: number; totalDrivers: number }>;
  getSystemStats(days: number): Promise<{ totalEarnings: number; totalWashouts: number; totalDrivers: number; totalOwners: number }>;

  // Notification operations
  createNotification(notification: InsertNotification): Promise<Notification>;
  getNotificationsByUser(userId: string): Promise<Notification[]>;
  getUnreadNotificationsByUser(userId: string): Promise<Notification[]>;
  markNotificationAsRead(notificationId: string): Promise<Notification>;
  clearNotificationsByType(userId: string, type: string): Promise<void>;

  // Message operations
  createMessage(message: InsertMessage): Promise<Message>;
  getAllMessages(): Promise<(Message & { user: User })[]>;
  getMessageById(messageId: string): Promise<(Message & { user: User }) | undefined>;
  updateMessageStatus(messageId: string, status: string): Promise<Message>;

  // Column webhook event operations for idempotency
  createWebhookEvent(columnEventId: string, eventType: string, accountId?: string): Promise<boolean>;
  isWebhookEventProcessed(columnEventId: string): Promise<boolean>;
  markWebhookEventProcessed(columnEventId: string): Promise<void>;
  markWebhookEventFailed(columnEventId: string, errorMessage: string): Promise<void>;

  // Owner funding sources operations (replacing payment methods)
  createOwnerFundingSource(fundingSource: InsertOwnerFundingSource): Promise<OwnerFundingSource>;
  getOwnerFundingSources(ownerId: string): Promise<OwnerFundingSource[]>;
  getOwnerFundingSourceById(id: string): Promise<OwnerFundingSource | undefined>;
  deleteOwnerFundingSource(id: string): Promise<void>;
  setDefaultFundingSource(ownerId: string, fundingSourceId: string): Promise<void>;

  // Wallet operations
  createDriverWallet(wallet: InsertDriverWallet): Promise<DriverWallet>;
  getDriverWallet(driverId: string): Promise<DriverWallet | undefined>;
  updateWalletBalance(driverId: string, availableBalance: string, pendingBalance: string): Promise<DriverWallet>;
  creditDriverWallet(driverId: string, amount: string, sourceType: 'washout' | 'adjustment' | 'withdrawal', sourceId: string, description?: string): Promise<{ wallet: DriverWallet; transaction: WalletTransaction }>;
  creditDriverPendingBalance(driverId: string, amount: string, sourceType: 'washout' | 'adjustment' | 'withdrawal', sourceId: string, description?: string): Promise<{ wallet: DriverWallet; transaction: WalletTransaction }>;
  
  // Wallet transaction operations
  createWalletTransaction(transaction: InsertWalletTransaction): Promise<WalletTransaction>;
  getWalletTransactionsByDriver(driverId: string, startDate?: Date, endDate?: Date): Promise<WalletTransaction[]>;
  getWalletTransaction(id: string): Promise<WalletTransaction | undefined>;
  updateWalletTransactionStatus(transactionId: string, status: string): Promise<WalletTransaction>;
  
  // Withdrawal operations
  createWithdrawal(withdrawal: InsertWithdrawal): Promise<Withdrawal>;
  getWithdrawalsByDriver(driverId: string, startDate?: Date, endDate?: Date): Promise<Withdrawal[]>;
  getWithdrawal(id: string): Promise<Withdrawal | undefined>;
  updateWithdrawalStatus(withdrawalId: string, status: string, columnTransferId?: string, failureReason?: string, columnCounterpartyId?: string): Promise<Withdrawal>;
  getAllWithdrawals(startDate?: Date, endDate?: Date): Promise<(Withdrawal & { driver: Driver & { user: User } })[]>;
  
  // Wallet statistics
  getWalletStats(driverId: string, days: number): Promise<{ totalCredits: number; totalDebits: number; totalFees: number; transactionCount: number }>;
  
  // Dynamic pending balance calculation
  calculatePendingBalance(driverId: string): Promise<number>;
  
  // Debit card request operations
  createDebitCardRequest(request: Partial<InsertDebitCardRequest>): Promise<DebitCardRequest>;
  getDebitCardRequestByDriverId(driverId: string): Promise<DebitCardRequest | undefined>;
  getDebitCardRequest(id: string): Promise<DebitCardRequest | undefined>;
  updateDebitCardRequest(id: string, requestData: Partial<InsertDebitCardRequest>): Promise<DebitCardRequest>;
  
  // Service Payment Account operations (superadmin only)
  createServicePaymentAccount(account: InsertServicePaymentAccount): Promise<ServicePaymentAccount>;
  getServicePaymentAccount(id: string): Promise<ServicePaymentAccount | undefined>;
  getAllServicePaymentAccounts(): Promise<ServicePaymentAccount[]>;
  getDefaultServicePaymentAccount(): Promise<ServicePaymentAccount | undefined>;
  updateServicePaymentAccount(id: string, accountData: UpdateServicePaymentAccount): Promise<ServicePaymentAccount>;
  deleteServicePaymentAccount(id: string): Promise<void>;
  setDefaultServicePaymentAccount(id: string): Promise<ServicePaymentAccount>;
  
  // Grace period and subscription management
  getOwnersWithExpiredGracePeriod(): Promise<Owner[]>;
  getOwnersNeedingReminders(): Promise<Owner[]>;
  updateOwnerReminderSent(ownerId: string): Promise<Owner>;
  getOwnerByStripeCustomerId(customerId: string): Promise<(Owner & { user: User }) | undefined>;

  // Platform performance analytics
  getPlatformPerformanceStats(days: number): Promise<{
    moneyFromOwners: number;
    moneyPaidToDrivers: number;
    withdrawalFees: number;
    subscriptionFees: number;
    totalRevenue: number;
    totalWashouts: number;
    totalWithdrawals: number;
  }>;

  // Billing batch operations for daily batch processing
  createBillingBatch(batch: InsertBillingBatch): Promise<BillingBatch>;
  getBillingBatch(id: string): Promise<BillingBatch | undefined>;
  getBillingBatchByOwnerAndDate(ownerId: string, businessDate: string): Promise<BillingBatch | undefined>;
  getBillingBatchesByOwner(ownerId: string, startDate?: Date, endDate?: Date): Promise<BillingBatch[]>;
  getBillingBatchesByStatus(status: string): Promise<(BillingBatch & { owner: Owner & { user: User } })[]>;
  updateBillingBatchStatus(batchId: string, status: string, stripePaymentIntentId?: string, failureReason?: string): Promise<BillingBatch>;
  updateBillingBatchProcessing(batchId: string, totalAmount: string, totalFees: string, paymentCount: number, stripePaymentIntentId?: string): Promise<BillingBatch>;
  markBillingBatchCompleted(batchId: string): Promise<BillingBatch>;
  getPendingPaymentsForBatch(ownerId: string, businessDate: string): Promise<(Payment & { activity: WashoutActivity; driver: Driver & { user: User } })[]>;
  assignPaymentsToBatch(paymentIds: string[], batchId: string, businessDate: string): Promise<void>;
  getPaymentsByBatchId(batchId: string): Promise<(Payment & { activity: WashoutActivity; driver: Driver & { user: User } })[]>;
  
  // Daily batch processing methods
  processDailyBatches(cutoffDate?: string): Promise<{ processed: number; failed: number; errors: string[] }>;
  movePendingToAvailable(driverId: string, amount: string, sourceTransactionId: string, batchId: string): Promise<{ wallet: DriverWallet; transaction: WalletTransaction }>;
  getOwnerBillingSettings(ownerId: string): Promise<{ billingCadence: string; billingCutoffTime: string; billingTimezone: string } | undefined>;
  updateOwnerBillingSettings(ownerId: string, settings: { billingCadence?: string; billingCutoffTime?: string; billingTimezone?: string }): Promise<Owner>;

  // Monthly fee ledger operations
  createFeeLedgerEntry(fee: InsertFeeLedger): Promise<FeeLedger>;
  getFeeLedgerEntry(id: string): Promise<FeeLedger | undefined>;
  getFeeLedgerEntriesByOwner(ownerId: string, startDate?: string, endDate?: string): Promise<(FeeLedger & { location?: WashoutLocation })[]>;
  getFeeLedgerEntriesByStatus(status: string): Promise<(FeeLedger & { owner: Owner & { user: User }, location?: WashoutLocation })[]>;
  updateFeeLedgerStatus(feeId: string, status: string, walletTxId?: string, columnTransferId?: string, failureReason?: string): Promise<FeeLedger>;
  markFeeLedgerPaid(feeId: string, walletTxId: string, columnTransferId: string): Promise<FeeLedger>;
  updateFeeLedgerRetryCount(feeId: string): Promise<FeeLedger>;
  getOwnerSubscriptionSettings(ownerId: string): Promise<{ subscriptionPlan: string; subscriptionFeeCents: number; feeAnchorDay: number; lastFeeBillingDate: string | null } | undefined>;
  updateOwnerSubscriptionSettings(ownerId: string, settings: { subscriptionPlan?: string; subscriptionFeeCents?: number; feeAnchorDay?: number }): Promise<Owner>;
  generateMonthlyFeesForDate(billingDate: string): Promise<{ created: number; owners: string[] }>;

  // Debug operations
  getUserCount(): Promise<number>;
  getTestUsers(): Promise<string[]>;

  // Feature flag operations
  getFeatureFlag(flagKey: string): Promise<any | undefined>;
  getAllFeatureFlags(): Promise<any[]>;
  createFeatureFlag(flag: { flagKey: string; enabled: boolean; description?: string; allowedRoles?: string[] }): Promise<any>;
  updateFeatureFlag(flagKey: string, enabled: boolean): Promise<any>;
  getFeatureFlagOverride(flagKey: string, userId: string): Promise<any | undefined>;
  setFeatureFlagOverride(flagKey: string, userId: string, enabled: boolean): Promise<any>;
  checkFeatureFlag(flagKey: string, userId: string, userRole: string): Promise<boolean>;
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
    
    // Auto-create driver/owner profiles if role is set and profile doesn't exist
    if (user.role === 'driver') {
      const existingDriver = await this.getDriver(user.id);
      if (!existingDriver) {
        await this.createDriver({
          userId: user.id,
          licenseNumber: '',
          employerName: '',
          employerPhone: '',
          truckNumber: '',
        });
      }
    } else if (user.role === 'owner') {
      const existingOwner = await this.getOwner(user.id);
      if (!existingOwner) {
        await this.createOwner({
          userId: user.id,
          companyName: '',
          businessLicense: '',
          taxId: '',
        });
      }
    }
    
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

  async createUser(userData: { username: string; email: string; passwordHash: string; firstName: string; lastName: string; phone?: string; street?: string; city?: string; state?: string; zip?: string; role: string }): Promise<User> {
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
          street: userData.street,
          city: userData.city,
          state: userData.state,
          zip: userData.zip,
          role: userData.role as any, // Cast to handle enum validation
        })
        .returning();
      return user;
    } catch (error) {
      console.error('Database createUser error:', error);
      throw new Error(`User creation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async updateUserColumnInfo(userId: string, columnCustomerId: string): Promise<User> {
    const [user] = await db
      .update(users)
      .set({ 
        columnCustomerId,
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

  async updateUserStatus(userId: string, isActive: boolean): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set({ 
        isActive,
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

  // Removed: getDriverByConnectedAccountId - no longer using Stripe Connect

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

  async updateDriverColumnInfo(driverId: string, columnData: { columnEntityId?: string; columnBankAccountId?: string; columnAccountLast4?: string }): Promise<Driver> {
    const [updatedDriver] = await db
      .update(drivers)
      .set({
        ...columnData,
        updatedAt: new Date(),
      })
      .where(eq(drivers.id, driverId))
      .returning();
    return updatedDriver;
  }

  async updateDriverLithicInfo(driverId: string, lithicData: { lithicAccountHolderToken?: string; lithicFinancialAccountToken?: string }): Promise<Driver> {
    const [updatedDriver] = await db
      .update(drivers)
      .set({
        ...lithicData,
        updatedAt: new Date(),
      })
      .where(eq(drivers.id, driverId))
      .returning();
    return updatedDriver;
  }

  async updateDriverPaymentPreferences(driverId: string, paymentData: { paymentMethod: "ach" | "venmo" | "zelle"; bankName?: string; accountHolderName?: string; routingNumber?: string; accountNumber?: string; venmoHandle?: string; zelleEmail?: string }): Promise<Driver> {
    const [updatedDriver] = await db
      .update(drivers)
      .set({
        ...paymentData,
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
        employerStreet: drivers.employerStreet,
        employerCity: drivers.employerCity,
        employerState: drivers.employerState,
        employerZip: drivers.employerZip,
        employerPhone: drivers.employerPhone,
        licenseNumber: drivers.licenseNumber,
        truckNumber: drivers.truckNumber,
        isGpsEnabled: drivers.isGpsEnabled,
        currentLatitude: drivers.currentLatitude,
        currentLongitude: drivers.currentLongitude,
        lastLocationUpdate: drivers.lastLocationUpdate,
        paymentMethod: drivers.paymentMethod,
        columnEntityId: drivers.columnEntityId,
        columnBankAccountId: drivers.columnBankAccountId,
        columnAccountLast4: drivers.columnAccountLast4,
        hasAgreedToTerms: drivers.hasAgreedToTerms,
        termsAgreedAt: drivers.termsAgreedAt,
        createdAt: drivers.createdAt,
        updatedAt: drivers.updatedAt,
        user: {
          id: users.id,
          username: users.username,
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
          profileImageUrl: users.profileImageUrl,
          role: users.role,
          phone: users.phone,
          street: users.street,
          city: users.city,
          state: users.state,
          zip: users.zip,
          paymentMethod: users.paymentMethod,
          paymentFrequency: users.paymentFrequency,
          columnCustomerId: users.columnCustomerId,
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

  async updateOwnerColumnInfo(ownerId: string, columnData: { columnEntityId?: string; columnAccountId?: string }): Promise<Owner> {
    const [updatedOwner] = await db
      .update(owners)
      .set({
        ...columnData,
        updatedAt: new Date(),
      })
      .where(eq(owners.id, ownerId))
      .returning();
    return updatedOwner;
  }

  // Owner wallet operations (replacing subscription model)
  async getOwnerWalletBalance(ownerId: string): Promise<{ balance: string; status: string } | undefined> {
    const [owner] = await db
      .select({
        balance: owners.walletBalance,
        status: owners.walletStatus
      })
      .from(owners)
      .where(eq(owners.id, ownerId));
    return owner;
  }

  async updateOwnerWalletBalance(ownerId: string, amount: string, type: string, description?: string): Promise<void> {
    await db.transaction(async (tx) => {
      // Get current balance
      const [currentOwner] = await tx
        .select({ balance: owners.walletBalance })
        .from(owners)
        .where(eq(owners.id, ownerId));
      
      if (!currentOwner) throw new Error('Owner not found');
      
      const currentBalance = parseFloat(currentOwner.balance);
      const changeAmount = parseFloat(amount);
      // Debit types: subtract from balance
      const isDebit = type.includes('debit') || type === 'fee_debit';
      const newBalance = isDebit ? currentBalance - changeAmount : currentBalance + changeAmount;
      
      // Update owner balance
      await tx
        .update(owners)
        .set({ 
          walletBalance: newBalance.toFixed(2),
          updatedAt: new Date() 
        })
        .where(eq(owners.id, ownerId));
      
      // Record transaction
      await tx.insert(ownerWalletTransactions).values({
        ownerId,
        type,
        amount: changeAmount.toFixed(2),
        balanceBefore: currentBalance.toFixed(2),
        balanceAfter: newBalance.toFixed(2),
        description
      });
    });
  }

  async getOwnerWalletTransactions(ownerId: string, startDate?: Date, endDate?: Date): Promise<any[]> {
    let query = db
      .select()
      .from(ownerWalletTransactions)
      .where(eq(ownerWalletTransactions.ownerId, ownerId))
      .orderBy(desc(ownerWalletTransactions.createdAt));

    if (startDate && endDate) {
      query = query.where(
        and(
          eq(ownerWalletTransactions.ownerId, ownerId),
          gte(ownerWalletTransactions.createdAt, startDate),
          lte(ownerWalletTransactions.createdAt, endDate)
        )
      );
    }

    return await query;
  }

  // Removed: getOwnerSubscriptionStatus - replaced by getOwnerWalletBalance

  async approveOwner(ownerId: string): Promise<Owner> {
    const [owner] = await db
      .update(owners)
      .set({ isApproved: true, updatedAt: new Date() })
      .where(eq(owners.id, ownerId))
      .returning();
    return owner;
  }

  async activateMembership(ownerId: string, paymentMethod: string, paymentNotes: string | undefined, activatedBy: string): Promise<Owner> {
    const [owner] = await db
      .update(owners)
      .set({ 
        membershipPaymentMethod: paymentMethod as any,
        membershipPaymentNotes: paymentNotes,
        membershipActivatedBy: activatedBy,
        membershipActivatedAt: new Date(),
        isApproved: true,
        updatedAt: new Date()
      })
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
        // Column BaaS wallet fields (replacing subscription fields)
        columnAccountId: owners.columnAccountId,
        columnEntityId: owners.columnEntityId,
        walletBalance: owners.walletBalance,
        walletStatus: owners.walletStatus,
        billingCadence: owners.billingCadence,
        billingCutoffTime: owners.billingCutoffTime,
        billingTimezone: owners.billingTimezone,
        membershipPaymentMethod: owners.membershipPaymentMethod,
        membershipPaymentNotes: owners.membershipPaymentNotes,
        membershipActivatedBy: owners.membershipActivatedBy,
        membershipActivatedAt: owners.membershipActivatedAt,
        isApproved: owners.isApproved,
        hasAgreedToTerms: owners.hasAgreedToTerms,
        termsAgreedAt: owners.termsAgreedAt,
        createdAt: owners.createdAt,
        updatedAt: owners.updatedAt,
        user: {
          id: users.id,
          username: users.username,
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
          profileImageUrl: users.profileImageUrl,
          role: users.role,
          phone: users.phone,
          street: users.street,
          city: users.city,
          state: users.state,
          zip: users.zip,
          paymentMethod: users.paymentMethod,
          paymentFrequency: users.paymentFrequency,
          columnCustomerId: users.columnCustomerId,
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
      .select({
        id: users.id,
        username: users.username,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        profileImageUrl: users.profileImageUrl,
        role: users.role,
        phone: users.phone,
        street: users.street,
        city: users.city,
        state: users.state,
        zip: users.zip,
        paymentMethod: users.paymentMethod,
        paymentFrequency: users.paymentFrequency,
        columnCustomerId: users.columnCustomerId,
        isActive: users.isActive,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      })
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

  async updateLocation(locationId: string, ownerId: string, locationData: Partial<InsertWashoutLocation>): Promise<WashoutLocation> {
    const [location] = await db
      .update(washoutLocations)
      .set({
        ...locationData,
        updatedAt: new Date(),
      })
      .where(and(
        eq(washoutLocations.id, locationId),
        eq(washoutLocations.ownerId, ownerId)
      ))
      .returning();
    return location;
  }

  async updateLocationStatus(locationId: string, ownerId: string, isActive: boolean): Promise<WashoutLocation> {
    const [location] = await db
      .update(washoutLocations)
      .set({ 
        isActive, 
        updatedAt: new Date() 
      })
      .where(and(
        eq(washoutLocations.id, locationId),
        eq(washoutLocations.ownerId, ownerId)
      ))
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

  // Alias for getWashoutActivity (for compatibility)
  async getActivity(id: string): Promise<WashoutActivity | undefined> {
    return this.getWashoutActivity(id);
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
      },
      location: row.washout_locations
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

    console.log('🔍 getActivitiesByOwner query:', {
      ownerId,
      startDate: startDate?.toISOString(),
      endDate: endDate?.toISOString(),
      conditionsCount: conditions.length
    });

    const results = await db
      .select()
      .from(washoutActivities)
      .innerJoin(washoutLocations, eq(washoutActivities.locationId, washoutLocations.id))
      .innerJoin(drivers, eq(washoutActivities.driverId, drivers.id))
      .innerJoin(users, eq(drivers.userId, users.id))
      .where(and(...conditions))
      .orderBy(desc(washoutActivities.checkInTime));

    // Query results processed

    // Remove post-processing filter - rely on INNER JOIN constraints
    // Add photo validation to prevent phantom activities with missing photos
    const mappedResults = await Promise.all(
      results.map(async (row: any) => {
        const activity = {
          ...row.washout_activities,
          location: row.washout_locations,
          driver: {
            ...row.drivers,
            user: row.users
          }
        };

        // Photo validation removed for performance - phantom activities handled by cleanup job

        return activity;
      })
    );

    return mappedResults;
  }

  // Photo operations - NEW clean photo system
  async createWashoutPhoto(photo: InsertWashoutPhoto): Promise<WashoutPhoto> {
    const [newPhoto] = await db.insert(washoutPhotos).values(photo).returning();
    return newPhoto;
  }

  async getPhotosByActivity(activityId: string): Promise<WashoutPhoto[]> {
    return await db
      .select()
      .from(washoutPhotos)
      .where(eq(washoutPhotos.activityId, activityId))
      .orderBy(washoutPhotos.uploadedAt);
  }

  async getPhotoById(photoId: string): Promise<WashoutPhoto | undefined> {
    const [photo] = await db
      .select()
      .from(washoutPhotos)
      .where(eq(washoutPhotos.id, photoId));
    return photo;
  }

  async deletePhoto(photoId: string): Promise<boolean> {
    const result = await db
      .delete(washoutPhotos)
      .where(eq(washoutPhotos.id, photoId));
    return result.rowCount !== null && result.rowCount > 0;
  }

  // Transactional operation: create activity with photos atomically
  async createWashoutActivityWithPhotos(
    activity: InsertWashoutActivity, 
    photos: Omit<InsertWashoutPhoto, 'activityId'>[]
  ): Promise<{ activity: WashoutActivity; photos: WashoutPhoto[] }> {
    return await db.transaction(async (tx) => {
      // Create the activity first
      const [newActivity] = await tx.insert(washoutActivities).values(activity).returning();
      
      // Create photos with the activity ID
      const photoValues = photos.map(photo => ({
        ...photo,
        activityId: newActivity.id
      }));
      
      const newPhotos = await tx.insert(washoutPhotos).values(photoValues).returning();
      
      return {
        activity: newActivity,
        photos: newPhotos
      };
    });
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
    
    if (status === 'posted') {
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

    // Get owner statistics (using wallet status instead of subscription status)
    const subscriptionStats = await db
      .select({
        activeLicenses: sql<number>`COUNT(*) FILTER (WHERE ${owners.isApproved} = true)`,
        licenseRenewals: sql<number>`COUNT(*) FILTER (WHERE ${owners.isApproved} = true AND ${owners.updatedAt} >= ${startDate})`,
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

  async getUnreadNotificationsByUser(userId: string): Promise<Notification[]> {
    return await db
      .select()
      .from(notifications)
      .where(and(
        eq(notifications.userId, userId),
        eq(notifications.isRead, false)
      ))
      .orderBy(desc(notifications.createdAt));
  }

  async clearNotificationsByType(userId: string, type: string): Promise<void> {
    await db
      .delete(notifications)
      .where(and(
        eq(notifications.userId, userId),
        eq(notifications.type, type)
      ));
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

  // Platform performance analytics
  async getPlatformPerformanceStats(days: number): Promise<{
    moneyFromOwners: number;
    moneyPaidToDrivers: number;
    withdrawalFees: number;
    subscriptionFees: number;
    totalRevenue: number;
    totalWashouts: number;
    totalWithdrawals: number;
  }> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Get payment statistics (money from owners to drivers + service fees)
    const paymentStats = await db
      .select({
        totalDriverPayments: sql<number>`COALESCE(SUM(CAST(${payments.amount} AS DECIMAL)), 0)`,
        totalServiceFees: sql<number>`COALESCE(SUM(CAST(${payments.processingFee} AS DECIMAL)), 0)`,
        totalWashouts: count(payments.id),
      })
      .from(payments)
      .where(gte(payments.createdAt, startDate));

    // Get withdrawal statistics (fees collected)
    const withdrawalStats = await db
      .select({
        totalWithdrawalFees: sql<number>`COALESCE(SUM(CAST(${withdrawals.feeAmount} AS DECIMAL)), 0)`,
        totalWithdrawals: count(withdrawals.id),
      })
      .from(withdrawals)
      .where(gte(withdrawals.createdAt, startDate));

    // Calculate subscription fees (based on approved owners)
    const activeOwners = await db
      .select({
        count: count(owners.id),
      })
      .from(owners)
      .where(eq(owners.isApproved, true));

    const stats = paymentStats[0] || { totalDriverPayments: 0, totalServiceFees: 0, totalWashouts: 0 };
    const wStats = withdrawalStats[0] || { totalWithdrawalFees: 0, totalWithdrawals: 0 };
    const activeOwnerCount = activeOwners[0]?.count || 0;

    // Subscription fees: $29/month for monthly plan based on days in range
    const subscriptionFeePerMonth = 29;
    const dailySubscriptionFee = subscriptionFeePerMonth / 30;
    const subscriptionFees = dailySubscriptionFee * days * Number(activeOwnerCount);

    const moneyFromOwners = Number(stats.totalDriverPayments) + Number(stats.totalServiceFees);
    const moneyPaidToDrivers = Number(stats.totalDriverPayments);
    const withdrawalFees = Number(wStats.totalWithdrawalFees);
    const totalRevenue = moneyFromOwners + withdrawalFees + subscriptionFees;

    return {
      moneyFromOwners,
      moneyPaidToDrivers,
      withdrawalFees,
      subscriptionFees,
      totalRevenue,
      totalWashouts: Number(stats.totalWashouts),
      totalWithdrawals: Number(wStats.totalWithdrawals),
    };
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

  // Owner funding sources operations
  async createOwnerFundingSource(fundingSource: InsertOwnerFundingSource): Promise<OwnerFundingSource> {
    // If this is set as default, unset all other defaults for this owner
    if (fundingSource.isDefault) {
      await db
        .update(ownerFundingSources)
        .set({ isDefault: false })
        .where(eq(ownerFundingSources.ownerId, fundingSource.ownerId));
    }

    const [newFundingSource] = await db.insert(ownerFundingSources).values(fundingSource).returning();
    return newFundingSource;
  }

  async getOwnerFundingSources(ownerId: string): Promise<OwnerFundingSource[]> {
    return await db
      .select()
      .from(ownerFundingSources)
      .where(and(
        eq(ownerFundingSources.ownerId, ownerId),
        eq(ownerFundingSources.isActive, true)
      ))
      .orderBy(desc(ownerFundingSources.isDefault), desc(ownerFundingSources.createdAt));
  }

  async getOwnerFundingSourceById(id: string): Promise<OwnerFundingSource | undefined> {
    const [fundingSource] = await db
      .select()
      .from(ownerFundingSources)
      .where(eq(ownerFundingSources.id, id));
    return fundingSource;
  }

  async deleteOwnerFundingSource(id: string): Promise<void> {
    await db
      .update(ownerFundingSources)
      .set({ isActive: false })
      .where(eq(ownerFundingSources.id, id));
  }

  async setDefaultFundingSource(ownerId: string, fundingSourceId: string): Promise<void> {
    // First, unset all defaults for this owner
    await db
      .update(ownerFundingSources)
      .set({ isDefault: false })
      .where(eq(ownerFundingSources.ownerId, ownerId));

    // Then set the specified one as default
    await db
      .update(ownerFundingSources)
      .set({ isDefault: true })
      .where(eq(ownerFundingSources.id, fundingSourceId));
  }

  // Wallet operations
  async createDriverWallet(wallet: InsertDriverWallet, txHandle?: any): Promise<DriverWallet> {
    const dbHandle = txHandle || db;
    const [newWallet] = await dbHandle.insert(driverWallets).values(wallet).returning();
    return newWallet;
  }

  async getDriverWallet(driverId: string, txHandle?: any, forUpdate = false): Promise<DriverWallet | undefined> {
    const dbHandle = txHandle || db;
    
    // Add FOR UPDATE lock to prevent race conditions during transactions
    if (forUpdate && txHandle) {
      // Use proper Drizzle FOR UPDATE syntax
      const [wallet] = await dbHandle
        .select()
        .from(driverWallets)
        .where(eq(driverWallets.driverId, driverId))
        .for('update');
      return wallet;
    } else {
      const [wallet] = await dbHandle
        .select()
        .from(driverWallets)
        .where(eq(driverWallets.driverId, driverId));
      return wallet;
    }
  }

  async updateWalletBalance(driverId: string, availableBalance: string, pendingBalance: string, txHandle?: any): Promise<DriverWallet> {
    const dbHandle = txHandle || db;
    const [wallet] = await dbHandle
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

  async adjustDriverWalletBalance(driverId: string, availableChange: number, pendingChange: number): Promise<void> {
    await db.transaction(async (tx) => {
      // Get current wallet with lock
      const [wallet] = await tx
        .select()
        .from(driverWallets)
        .where(eq(driverWallets.driverId, driverId))
        .for('update');
      
      if (!wallet) {
        throw new Error('Driver wallet not found');
      }
      
      const newAvailable = parseFloat(wallet.availableBalance) + availableChange;
      const newPending = parseFloat(wallet.pendingBalance) + pendingChange;
      
      // Update wallet
      await tx
        .update(driverWallets)
        .set({
          availableBalance: newAvailable.toFixed(2),
          pendingBalance: newPending.toFixed(2),
          updatedAt: new Date(),
        })
        .where(eq(driverWallets.driverId, driverId));
    });
  }

  async creditDriverWallet(
    driverId: string, 
    amount: string, 
    sourceType: 'washout' | 'adjustment' | 'withdrawal', 
    sourceId: string, 
    description?: string
  ): Promise<{ wallet: DriverWallet; transaction: WalletTransaction }> {
    return await db.transaction(async (tx) => {
      try {
        // CRITICAL FIX: Get or create driver wallet with FOR UPDATE lock FIRST
        // This prevents race conditions by locking the row before checking for duplicates
        let wallet = await this.getDriverWallet(driverId, tx, true);
        if (!wallet) {
          wallet = await this.createDriverWallet({
            driverId,
            availableBalance: "0.00",
            pendingBalance: "0.00"
          }, tx);
          // Re-fetch with lock after creation
          wallet = await this.getDriverWallet(driverId, tx, true);
          if (!wallet) {
            throw new Error('Failed to create or retrieve wallet');
          }
        }

        // IDEMPOTENCY CHECK: Now check if this exact credit already exists
        // This check is AFTER acquiring the lock to prevent race conditions
        const existingTransaction = await tx
          .select()
          .from(walletTransactions)
          .where(and(
            eq(walletTransactions.driverId, driverId),
            eq(walletTransactions.sourceType, sourceType),
            eq(walletTransactions.sourceId, sourceId),
            eq(walletTransactions.direction, 'credit')
          ))
          .limit(1);

        if (existingTransaction.length > 0) {
          console.log(`Idempotent credit attempt detected for driver ${driverId}, source ${sourceType}:${sourceId}`);
          // Return the existing transaction and current wallet state
          return { wallet, transaction: existingTransaction[0] };
        }

        // CENT-SAFE ARITHMETIC: Convert to cents to avoid floating point precision issues
        const amountCents = Math.round(parseFloat(amount) * 100);
        const currentAvailableCents = Math.round(parseFloat(wallet.availableBalance) * 100);
        const newAvailableCents = currentAvailableCents + amountCents;
        const newAvailableBalance = (newAvailableCents / 100).toFixed(2);
        
        // Validate amounts
        if (amountCents <= 0) {
          throw new Error(`Invalid credit amount: ${amount}`);
        }
        
        // Create wallet transaction record first (for better error tracing)
        const transaction = await this.createWalletTransaction({
          driverId,
          amount: amount,
          direction: 'credit',
          balanceAfter: newAvailableBalance,
          sourceType: sourceType,
          sourceId: sourceId,
          status: 'posted',
          description: description || `${sourceType} credit: $${amount}`,
          metadata: {
            creditType: sourceType,
            sourceActivityId: sourceId,
            originalBalanceCents: currentAvailableCents,
            creditCents: amountCents,
            newBalanceCents: newAvailableCents
          }
        }, tx);

        // ATOMIC UPDATE: Update wallet balance using the transaction handle
        const updatedWallet = await this.updateWalletBalance(
          driverId,
          newAvailableBalance,
          wallet.pendingBalance,
          tx
        );

        console.log(`✅ Wallet credited: Driver ${driverId}, Amount $${amount}, New Balance $${newAvailableBalance}, Source: ${sourceType}:${sourceId}`);
        return { wallet: updatedWallet, transaction };

      } catch (error) {
        console.error(`❌ Wallet credit failed for driver ${driverId}:`, error);
        throw error; // Let transaction auto-rollback
      }
    });
  }

  async creditDriverPendingBalance(
    driverId: string, 
    amount: string, 
    sourceType: 'washout' | 'adjustment' | 'withdrawal', 
    sourceId: string, 
    description?: string
  ): Promise<{ wallet: DriverWallet; transaction: WalletTransaction }> {
    return await db.transaction(async (tx) => {
      try {
        // CRITICAL FIX: Get or create driver wallet with FOR UPDATE lock FIRST
        // This prevents race conditions by locking the row before checking for duplicates
        let wallet = await this.getDriverWallet(driverId, tx, true);
        if (!wallet) {
          wallet = await this.createDriverWallet({
            driverId,
            availableBalance: "0.00",
            pendingBalance: "0.00"
          }, tx);
          // Re-fetch with lock after creation
          wallet = await this.getDriverWallet(driverId, tx, true);
          if (!wallet) {
            throw new Error('Failed to create or retrieve wallet');
          }
        }

        // IDEMPOTENCY CHECK: Now check if this exact credit already exists
        // This check is AFTER acquiring the lock to prevent race conditions
        const existingTransaction = await tx
          .select()
          .from(walletTransactions)
          .where(and(
            eq(walletTransactions.driverId, driverId),
            eq(walletTransactions.sourceType, sourceType),
            eq(walletTransactions.sourceId, sourceId),
            eq(walletTransactions.direction, 'credit'),
            eq(walletTransactions.status, 'pending') // Only check pending transactions
          ))
          .limit(1);

        if (existingTransaction.length > 0) {
          console.log(`Idempotent pending credit attempt detected for driver ${driverId}, source ${sourceType}:${sourceId}`);
          // Return the existing transaction and current wallet state
          return { wallet, transaction: existingTransaction[0] };
        }

        // CENT-SAFE ARITHMETIC: Convert to cents to avoid floating point precision issues
        const amountCents = Math.round(parseFloat(amount) * 100);
        const currentPendingCents = Math.round(parseFloat(wallet.pendingBalance) * 100);
        const newPendingCents = currentPendingCents + amountCents;
        const newPendingBalance = (newPendingCents / 100).toFixed(2);
        
        // Validate amounts
        if (amountCents <= 0) {
          throw new Error(`Invalid pending credit amount: ${amount}`);
        }
        
        // Create wallet transaction record first (for better error tracing)
        const transaction = await this.createWalletTransaction({
          driverId,
          amount: amount,
          direction: 'credit',
          balanceAfter: newPendingBalance, // Balance after this pending transaction
          sourceType: sourceType,
          sourceId: sourceId,
          status: 'pending', // Will be 'posted' when batch completes
          description: description || `${sourceType} pending credit: $${amount}`,
          metadata: {
            creditType: sourceType,
            sourceActivityId: sourceId,
            originalPendingBalanceCents: currentPendingCents,
            creditCents: amountCents,
            newPendingBalanceCents: newPendingCents,
            balanceType: 'pending'
          }
        }, tx);

        // ATOMIC UPDATE: Update wallet pending balance using the transaction handle
        const updatedWallet = await this.updateWalletBalance(
          driverId,
          wallet.availableBalance, // Keep available balance unchanged
          newPendingBalance,       // Update pending balance
          tx
        );

        console.log(`✅ Wallet pending balance credited: Driver ${driverId}, Amount $${amount}, New Pending Balance $${newPendingBalance}, Source: ${sourceType}:${sourceId}`);
        return { wallet: updatedWallet, transaction };

      } catch (error) {
        console.error(`❌ Wallet pending credit failed for driver ${driverId}:`, error);
        throw error; // Let transaction auto-rollback
      }
    });
  }

  // Wallet transaction operations
  async createWalletTransaction(transaction: InsertWalletTransaction, txHandle?: any): Promise<WalletTransaction> {
    const dbHandle = txHandle || db;
    const [newTransaction] = await dbHandle.insert(walletTransactions).values(transaction).returning();
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
    columnTransferId?: string, 
    failureReason?: string,
    columnCounterpartyId?: string
  ): Promise<Withdrawal> {
    const updateData: any = {
      status: status as any,
    };

    if (columnTransferId) updateData.columnTransferId = columnTransferId;
    if (columnCounterpartyId) updateData.columnCounterpartyId = columnCounterpartyId;
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

  // Calculate pending balance from wallet transactions with status='pending'
  async calculatePendingBalance(driverId: string): Promise<number> {
    const pendingTransactions = await db
      .select({
        amount: walletTransactions.amount
      })
      .from(walletTransactions)
      .where(
        and(
          eq(walletTransactions.driverId, driverId),
          eq(walletTransactions.status, 'pending'),
          eq(walletTransactions.direction, 'credit')
        )
      );

    // Sum up all pending credit transactions
    const totalPendingAmount = pendingTransactions.reduce((total, transaction) => {
      return total + parseFloat(transaction.amount);
    }, 0);

    return Number(totalPendingAmount.toFixed(2));
  }

  // Debit card request operations
  async createDebitCardRequest(request: Partial<InsertDebitCardRequest>): Promise<DebitCardRequest> {
    const [newRequest] = await db
      .insert(debitCardRequests)
      .values(request as any)
      .returning();
    return newRequest;
  }

  async getDebitCardRequestByDriverId(driverId: string): Promise<DebitCardRequest | undefined> {
    const [request] = await db
      .select()
      .from(debitCardRequests)
      .where(eq(debitCardRequests.driverId, driverId))
      .orderBy(desc(debitCardRequests.createdAt));
    return request;
  }

  async getDebitCardRequest(id: string): Promise<DebitCardRequest | undefined> {
    const [request] = await db
      .select()
      .from(debitCardRequests)
      .where(eq(debitCardRequests.id, id));
    return request;
  }

  async updateDebitCardRequest(id: string, requestData: Partial<InsertDebitCardRequest>): Promise<DebitCardRequest> {
    const [updated] = await db
      .update(debitCardRequests)
      .set(requestData as any)
      .where(eq(debitCardRequests.id, id))
      .returning();
    return updated;
  }

  // Webhook event operations for idempotency
  async createWebhookEvent(stripeEventId: string, eventType: string, accountId?: string): Promise<boolean> {
    try {
      await db.insert(webhookEvents).values({
        stripeEventId,
        eventType,
        accountId,
        processed: false,
      });
      return true;
    } catch (error) {
      // If the event already exists (unique constraint violation), return false
      return false;
    }
  }

  async isWebhookEventProcessed(stripeEventId: string): Promise<boolean> {
    const [event] = await db.select().from(webhookEvents)
      .where(eq(webhookEvents.stripeEventId, stripeEventId));
    return event?.processed || false;
  }

  async markWebhookEventProcessed(stripeEventId: string): Promise<void> {
    await db.update(webhookEvents)
      .set({ processed: true, processedAt: new Date() })
      .where(eq(webhookEvents.stripeEventId, stripeEventId));
  }

  async markWebhookEventFailed(stripeEventId: string, errorMessage: string): Promise<void> {
    await db.update(webhookEvents)
      .set({ 
        errorMessage,
        retryCount: sql`${webhookEvents.retryCount} + 1`,
      })
      .where(eq(webhookEvents.stripeEventId, stripeEventId));
  }

  // Service Payment Account operations (superadmin only)
  async createServicePaymentAccount(account: InsertServicePaymentAccount): Promise<ServicePaymentAccount> {
    const [newAccount] = await db
      .insert(servicePaymentAccounts)
      .values(account)
      .returning();
    return newAccount;
  }

  async getServicePaymentAccount(id: string): Promise<ServicePaymentAccount | undefined> {
    const [account] = await db
      .select()
      .from(servicePaymentAccounts)
      .where(eq(servicePaymentAccounts.id, id));
    return account;
  }

  async getAllServicePaymentAccounts(): Promise<ServicePaymentAccount[]> {
    return await db
      .select()
      .from(servicePaymentAccounts)
      .orderBy(desc(servicePaymentAccounts.createdAt));
  }

  async getDefaultServicePaymentAccount(): Promise<ServicePaymentAccount | undefined> {
    const [account] = await db
      .select()
      .from(servicePaymentAccounts)
      .where(and(
        eq(servicePaymentAccounts.isDefault, true),
        eq(servicePaymentAccounts.isActive, true)
      ));
    return account;
  }

  async updateServicePaymentAccount(id: string, accountData: UpdateServicePaymentAccount): Promise<ServicePaymentAccount> {
    const [account] = await db
      .update(servicePaymentAccounts)
      .set({
        ...accountData,
        updatedAt: new Date(),
      })
      .where(eq(servicePaymentAccounts.id, id))
      .returning();
    return account;
  }

  async deleteServicePaymentAccount(id: string): Promise<void> {
    await db
      .delete(servicePaymentAccounts)
      .where(eq(servicePaymentAccounts.id, id));
  }

  async setDefaultServicePaymentAccount(id: string): Promise<ServicePaymentAccount> {
    // Use a transaction to prevent race conditions where multiple accounts could become default
    return await db.transaction(async (tx) => {
      // First, unset all other default accounts
      await tx
        .update(servicePaymentAccounts)
        .set({ isDefault: false, updatedAt: new Date() })
        .where(eq(servicePaymentAccounts.isDefault, true));

      // Then set the specified account as default
      const [account] = await tx
        .update(servicePaymentAccounts)
        .set({ isDefault: true, updatedAt: new Date() })
        .where(eq(servicePaymentAccounts.id, id))
        .returning();
      
      if (!account) {
        throw new Error(`Service payment account with ID ${id} not found`);
      }
      
      return account;
    });
  }

  // Grace period and subscription management
  async getOwnersWithExpiredGracePeriod(): Promise<Owner[]> {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const expiredOwners = await db
      .select()
      .from(owners)
      .where(
        and(
          eq(owners.subscriptionStatus, 'past_due'),
          isNotNull(owners.gracePeriodStartDate),
          lte(owners.gracePeriodStartDate, sevenDaysAgo)
        )
      );
    return expiredOwners;
  }

  async getOwnersNeedingReminders(): Promise<Owner[]> {
    // Get owners who need 7-day advance warning (subscription ending in 7 days)
    const sevenDaysFromNow = new Date();
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
    
    const remindersNeeded = await db
      .select()
      .from(owners)
      .where(
        and(
          eq(owners.subscriptionStatus, 'active'),
          isNotNull(owners.subscriptionEndsAt),
          lte(owners.subscriptionEndsAt, sevenDaysFromNow),
          or(
            isNull(owners.lastReminderSent),
            lte(owners.lastReminderSent, new Date(Date.now() - 24 * 60 * 60 * 1000)) // Haven't sent reminder in 24h
          )
        )
      );
    return remindersNeeded;
  }

  async updateOwnerReminderSent(ownerId: string): Promise<Owner> {
    const [owner] = await db
      .update(owners)
      .set({ 
        lastReminderSent: new Date(),
        updatedAt: new Date()
      })
      .where(eq(owners.id, ownerId))
      .returning();
    return owner;
  }

  async getOwnerByStripeCustomerId(customerId: string): Promise<(Owner & { user: User }) | undefined> {
    const result = await db
      .select({
        id: owners.id,
        userId: owners.userId,
        companyName: owners.companyName,
        businessLicense: owners.businessLicense,
        taxId: owners.taxId,
        // Column BaaS wallet fields (replacing subscription fields)
        columnAccountId: owners.columnAccountId,
        columnEntityId: owners.columnEntityId,
        walletBalance: owners.walletBalance,
        walletStatus: owners.walletStatus,
        isApproved: owners.isApproved,
        hasAgreedToTerms: owners.hasAgreedToTerms,
        termsAgreedAt: owners.termsAgreedAt,
        createdAt: owners.createdAt,
        updatedAt: owners.updatedAt,
        user: {
          id: users.id,
          username: users.username,
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
          phone: users.phone,
          street: users.street,
          city: users.city,
          state: users.state,
          zip: users.zip,
          role: users.role,
          columnCustomerId: users.columnCustomerId,
          // Removed stripeSubscriptionId - using Column BaaS now
          isActive: users.isActive,
          createdAt: users.createdAt,
          updatedAt: users.updatedAt,
        }
      })
      .from(owners)
      .innerJoin(users, eq(owners.userId, users.id))
      .where(eq(users.stripeCustomerId, customerId));
    
    return result[0];
  }

  // Billing batch operations for daily batch processing
  async createBillingBatch(batch: InsertBillingBatch): Promise<BillingBatch> {
    const [createdBatch] = await db
      .insert(billingBatches)
      .values(batch)
      .returning();
    return createdBatch;
  }

  async getBillingBatch(id: string): Promise<BillingBatch | undefined> {
    const [batch] = await db
      .select()
      .from(billingBatches)
      .where(eq(billingBatches.id, id));
    return batch;
  }

  async getBillingBatchByOwnerAndDate(ownerId: string, businessDate: string): Promise<BillingBatch | undefined> {
    const [batch] = await db
      .select()
      .from(billingBatches)
      .where(
        and(
          eq(billingBatches.ownerId, ownerId),
          eq(billingBatches.businessDate, businessDate)
        )
      );
    return batch;
  }

  async getBillingBatchesByOwner(ownerId: string, startDate?: Date, endDate?: Date): Promise<BillingBatch[]> {
    const conditions = [eq(billingBatches.ownerId, ownerId)];
    
    if (startDate) {
      conditions.push(gte(billingBatches.createdAt, startDate));
    }
    if (endDate) {
      conditions.push(lte(billingBatches.createdAt, endDate));
    }

    const batches = await db
      .select()
      .from(billingBatches)
      .where(and(...conditions))
      .orderBy(desc(billingBatches.businessDate));
    
    return batches;
  }

  async getBillingBatchesByStatus(status: string): Promise<(BillingBatch & { owner: Owner & { user: User } })[]> {
    const batches = await db
      .select({
        id: billingBatches.id,
        ownerId: billingBatches.ownerId,
        businessDate: billingBatches.businessDate,
        cutoffTime: billingBatches.cutoffTime,
        timezone: billingBatches.timezone,
        totalAmount: billingBatches.totalAmount,
        totalFees: billingBatches.totalFees,
        paymentCount: billingBatches.paymentCount,
        stripePaymentIntentId: billingBatches.stripePaymentIntentId,
        status: billingBatches.status,
        processingStartedAt: billingBatches.processingStartedAt,
        completedAt: billingBatches.completedAt,
        failureReason: billingBatches.failureReason,
        retryCount: billingBatches.retryCount,
        metadata: billingBatches.metadata,
        createdAt: billingBatches.createdAt,
        updatedAt: billingBatches.updatedAt,
        owner: {
          id: owners.id,
          userId: owners.userId,
          companyName: owners.companyName,
          businessLicense: owners.businessLicense,
          taxId: owners.taxId,
          walletStatus: owners.walletStatus,
          // Removed subscriptionPlan - using Column wallet model
          // Removed subscriptionEndsAt - using Column wallet model
          pastDueDate: owners.pastDueDate,
          gracePeriodStartDate: owners.gracePeriodStartDate,
          lastReminderSent: owners.lastReminderSent,
          billingCadence: owners.billingCadence,
          billingCutoffTime: owners.billingCutoffTime,
          billingTimezone: owners.billingTimezone,
          isApproved: owners.isApproved,
          hasAgreedToTerms: owners.hasAgreedToTerms,
          termsAgreedAt: owners.termsAgreedAt,
          createdAt: owners.createdAt,
          updatedAt: owners.updatedAt,
          user: {
            id: users.id,
            username: users.username,
            email: users.email,
            firstName: users.firstName,
            lastName: users.lastName,
            phone: users.phone,
            street: users.street,
            city: users.city,
            state: users.state,
            zip: users.zip,
            role: users.role,
            columnCustomerId: users.columnCustomerId,
            // Removed stripeSubscriptionId - using Column BaaS now
            isActive: users.isActive,
            createdAt: users.createdAt,
            updatedAt: users.updatedAt,
          }
        }
      })
      .from(billingBatches)
      .innerJoin(owners, eq(billingBatches.ownerId, owners.id))
      .innerJoin(users, eq(owners.userId, users.id))
      .where(eq(billingBatches.status, status as any))
      .orderBy(desc(billingBatches.createdAt));

    return batches;
  }

  async updateBillingBatchStatus(batchId: string, status: string, stripePaymentIntentId?: string, failureReason?: string): Promise<BillingBatch> {
    const updateData: any = {
      status,
      updatedAt: new Date(),
    };

    if (status === 'processing') {
      updateData.processingStartedAt = new Date();
    } else if (status === 'completed') {
      updateData.completedAt = new Date();
    }

    if (stripePaymentIntentId) {
      updateData.stripePaymentIntentId = stripePaymentIntentId;
    }

    if (failureReason) {
      updateData.failureReason = failureReason;
      updateData.retryCount = sql`${billingBatches.retryCount} + 1`;
    }

    const [batch] = await db
      .update(billingBatches)
      .set(updateData)
      .where(eq(billingBatches.id, batchId))
      .returning();
    
    return batch;
  }

  async updateBillingBatchProcessing(batchId: string, totalAmount: string, totalFees: string, paymentCount: number, stripePaymentIntentId?: string): Promise<BillingBatch> {
    const updateData: any = {
      totalAmount,
      totalFees,
      paymentCount,
      status: 'processing',
      processingStartedAt: new Date(),
      updatedAt: new Date(),
    };

    if (stripePaymentIntentId) {
      updateData.stripePaymentIntentId = stripePaymentIntentId;
    }

    const [batch] = await db
      .update(billingBatches)
      .set(updateData)
      .where(eq(billingBatches.id, batchId))
      .returning();
    
    return batch;
  }

  async markBillingBatchCompleted(batchId: string): Promise<BillingBatch> {
    const [batch] = await db
      .update(billingBatches)
      .set({
        status: 'completed',
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(billingBatches.id, batchId))
      .returning();
    
    return batch;
  }

  // Get Stripe instance (similar to routes.ts but accessible from storage)
  private async getStripeInstance() {
    // Import Stripe dynamically to avoid issues in environments without it
    if (!process.env.STRIPE_SECRET_KEY) {
      return null; // Development mode
    }
    
    try {
      const Stripe = (await import('stripe')).default;
      return new Stripe(process.env.STRIPE_SECRET_KEY, {
        apiVersion: "2025-08-27.basil",
      });
    } catch (error) {
      console.warn('Stripe not available:', error);
      return null;
    }
  }

  // Create Stripe PaymentIntent for a billing batch
  private async createStripePaymentIntent(
    batchId: string,
    ownerId: string,
    totalAmount: number,
    totalFees: number,
    paymentCount: number,
    billingSettings: { billingCadence: string; billingCutoffTime: string; billingTimezone: string }
  ): Promise<string> {
    const stripe = await this.getStripeInstance();
    if (!stripe) {
      throw new Error('Stripe not available');
    }

    // Get owner's user information
    const ownerResult = await db
      .select({
        owner: {
          id: owners.id,
          userId: owners.userId,
          companyName: owners.companyName,
          walletStatus: owners.walletStatus,
        },
        user: {
          id: users.id,
          columnCustomerId: users.columnCustomerId,
          firstName: users.firstName,
          lastName: users.lastName,
        }
      })
      .from(owners)
      .innerJoin(users, eq(owners.userId, users.id))
      .where(eq(owners.id, ownerId));
    
    if (ownerResult.length === 0 || !ownerResult[0].user.stripeCustomerId) {
      throw new Error(`No Stripe customer ID found for owner ${ownerId}`);
    }
    
    const owner = { ...ownerResult[0].owner, user: ownerResult[0].user };

    // Convert to cents for Stripe - CRITICAL FIX: charge FULL amount (driver payouts + fees)
    const fullChargeAmount = totalAmount + totalFees;
    const amountCents = Math.round(fullChargeAmount * 100);
    
    // Create idempotency key based on batch - use full amount for consistency
    const idempotencyKey = `batch_payment_${batchId}_${Math.round(fullChargeAmount * 100)}`;
    
    // Create PaymentIntent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: 'usd',
      customer: owner.user.stripeCustomerId,
      description: `Daily batch payment - ${paymentCount} washouts (Driver payouts: $${totalAmount.toFixed(2)}, Fees: $${totalFees.toFixed(2)})`,
      metadata: {
        batchId,
        ownerId,
        paymentCount: paymentCount.toString(),
        driverPayouts: totalAmount.toFixed(2),
        totalFees: totalFees.toFixed(2),
        fullChargeAmount: fullChargeAmount.toFixed(2),
        timezone: billingSettings.billingTimezone,
        cutoffTime: billingSettings.billingCutoffTime,
        type: 'daily_batch_payment'
      },
      confirm: true, // Automatically confirm the payment
      automatic_payment_methods: {
        enabled: true,
      },
    }, {
      idempotencyKey
    });

    return paymentIntent.id;
  }

  // Mark billing batch as failed
  async markBillingBatchFailed(batchId: string, failureReason: string): Promise<void> {
    await db
      .update(billingBatches)
      .set({
        status: 'failed',
        failureReason,
        updatedAt: new Date(),
      })
      .where(eq(billingBatches.id, batchId));
  }

  // Get billing batches with filters and pagination
  async getBillingBatchesWithFilters(filters: {
    status?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  }): Promise<(BillingBatch & { owner: Owner & { user: User } })[]> {
    const conditions = [];
    
    if (filters.status) {
      conditions.push(eq(billingBatches.status, filters.status as any));
    }
    if (filters.startDate) {
      conditions.push(gte(billingBatches.createdAt, filters.startDate));
    }
    if (filters.endDate) {
      conditions.push(lte(billingBatches.createdAt, filters.endDate));
    }

    const batches = await db
      .select({
        id: billingBatches.id,
        ownerId: billingBatches.ownerId,
        businessDate: billingBatches.businessDate,
        cutoffTime: billingBatches.cutoffTime,
        timezone: billingBatches.timezone,
        totalAmount: billingBatches.totalAmount,
        totalFees: billingBatches.totalFees,
        paymentCount: billingBatches.paymentCount,
        stripePaymentIntentId: billingBatches.stripePaymentIntentId,
        status: billingBatches.status,
        processingStartedAt: billingBatches.processingStartedAt,
        completedAt: billingBatches.completedAt,
        failureReason: billingBatches.failureReason,
        retryCount: billingBatches.retryCount,
        metadata: billingBatches.metadata,
        createdAt: billingBatches.createdAt,
        updatedAt: billingBatches.updatedAt,
        owner: {
          id: owners.id,
          userId: owners.userId,
          companyName: owners.companyName,
          businessLicense: owners.businessLicense,
          taxId: owners.taxId,
          walletStatus: owners.walletStatus,
          // Removed subscriptionPlan - using Column wallet model
          // Removed subscriptionEndsAt - using Column wallet model
          pastDueDate: owners.pastDueDate,
          gracePeriodStartDate: owners.gracePeriodStartDate,
          lastReminderSent: owners.lastReminderSent,
          billingCadence: owners.billingCadence,
          billingCutoffTime: owners.billingCutoffTime,
          billingTimezone: owners.billingTimezone,
          isApproved: owners.isApproved,
          hasAgreedToTerms: owners.hasAgreedToTerms,
          termsAgreedAt: owners.termsAgreedAt,
          createdAt: owners.createdAt,
          updatedAt: owners.updatedAt,
          user: {
            id: users.id,
            username: users.username,
            email: users.email,
            firstName: users.firstName,
            lastName: users.lastName,
            phone: users.phone,
            street: users.street,
            city: users.city,
            state: users.state,
            zip: users.zip,
            role: users.role,
            columnCustomerId: users.columnCustomerId,
            // Removed stripeSubscriptionId - using Column BaaS now
            isActive: users.isActive,
            createdAt: users.createdAt,
            updatedAt: users.updatedAt,
          }
        }
      })
      .from(billingBatches)
      .innerJoin(owners, eq(billingBatches.ownerId, owners.id))
      .innerJoin(users, eq(owners.userId, users.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(billingBatches.createdAt))
      .limit(filters.limit || 50)
      .offset(filters.offset || 0);

    return batches;
  }

  // Retry a failed billing batch
  async retryBillingBatch(batchId: string): Promise<void> {
    return await db.transaction(async (tx) => {
      // Reset batch status to pending and increment retry count
      await db
        .update(billingBatches)
        .set({
          status: 'pending',
          failureReason: null,
          stripePaymentIntentId: null,
          processingStartedAt: null,
          retryCount: sql`${billingBatches.retryCount} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(billingBatches.id, batchId));

      // Get batch details for processing
      const batch = await this.getBillingBatch(batchId);
      if (!batch) {
        throw new Error(`Batch ${batchId} not found after reset`);
      }

      // Process the batch again
      await this.processOwnerBatch(batch.ownerId, batch.businessDate);
    });
  }

  // Get a dry run preview of batch processing without execution
  async getDryRunBatchPreview(cutoffDate?: string): Promise<{
    businessDate: string;
    ownerBatches: Array<{
      ownerId: string;
      ownerName: string;
      timezone: string;
      cutoffTime: string;
      paymentCount: number;
      totalAmount: number;
      totalFees: number;
      pendingPayments: Array<{
        id: string;
        amount: string;
        driverName: string;
        activityId: string;
      }>;
    }>;
    summary: {
      totalOwners: number;
      totalPayments: number;
      totalAmount: number;
      totalFees: number;
    };
  }> {
    const businessDate = cutoffDate || new Date().toISOString().split('T')[0];
    
    // Get all owners with pending payments
    const ownersWithPayments = await db
      .selectDistinct({ 
        ownerId: payments.ownerId
      })
      .from(payments)
      .where(
        and(
          eq(payments.status, 'pending'),
          isNull(payments.batchId)
        )
      );

    const ownerBatches = [];
    let totalPayments = 0;
    let totalAmount = 0;
    let totalFees = 0;

    for (const { ownerId } of ownersWithPayments) {
      // Get billing settings
      const billingSettings = await this.getOwnerBillingSettings(ownerId);
      if (!billingSettings) continue;

      // Calculate business date for this owner
      const ownerBusinessDate = cutoffDate || this.calculateBusinessDate(
        billingSettings.billingTimezone,
        billingSettings.billingCutoffTime
      );

      // Get pending payments for this owner and business date
      const pendingPayments = await this.getPendingPaymentsForBatch(ownerId, ownerBusinessDate);
      
      if (pendingPayments.length === 0) continue;

      // Get owner details
      const owner = await this.getOwnerById(ownerId);
      if (!owner) continue;

      // Calculate totals
      const batchTotal = pendingPayments.reduce((sum, payment) => sum + parseFloat(payment.amount), 0);
      const batchFees = pendingPayments.reduce((sum, payment) => sum + parseFloat(payment.processingFee) + parseFloat(payment.washoutServiceFee), 0);

      ownerBatches.push({
        ownerId,
        ownerName: owner.companyName || `${owner.user.firstName} ${owner.user.lastName}`,
        timezone: billingSettings.billingTimezone,
        cutoffTime: billingSettings.billingCutoffTime,
        paymentCount: pendingPayments.length,
        totalAmount: batchTotal,
        totalFees: batchFees,
        pendingPayments: pendingPayments.map(p => ({
          id: p.id,
          amount: p.amount,
          driverName: `${p.driver.user.firstName} ${p.driver.user.lastName}`,
          activityId: p.activityId
        }))
      });

      totalPayments += pendingPayments.length;
      totalAmount += batchTotal;
      totalFees += batchFees;
    }

    return {
      businessDate,
      ownerBatches,
      summary: {
        totalOwners: ownerBatches.length,
        totalPayments,
        totalAmount,
        totalFees
      }
    };
  }

  async getPendingPaymentsForBatch(ownerId: string, businessDate: string): Promise<(Payment & { activity: WashoutActivity; driver: Driver & { user: User } })[]> {
    const pendingPayments = await db
      .select({
        id: payments.id,
        driverId: payments.driverId,
        ownerId: payments.ownerId,
        activityId: payments.activityId,
        amount: payments.amount,
        processingFee: payments.processingFee,
        washoutServiceFee: payments.washoutServiceFee,
        stripePaymentIntentId: payments.stripePaymentIntentId,
        status: payments.status,
        batchId: payments.batchId,
        businessDate: payments.businessDate,
        paidAt: payments.paidAt,
        createdAt: payments.createdAt,
        updatedAt: payments.updatedAt,
        activity: {
          id: washoutActivities.id,
          driverId: washoutActivities.driverId,
          locationId: washoutActivities.locationId,
          status: washoutActivities.status,
          amount: washoutActivities.amount,
          checkInTime: washoutActivities.checkInTime,
          checkOutTime: washoutActivities.checkOutTime,
          photoUrls: washoutActivities.photoUrls,
          notes: washoutActivities.notes,
          verifiedBy: washoutActivities.verifiedBy,
          verifiedAt: washoutActivities.verifiedAt,
          latitude: washoutActivities.latitude,
          longitude: washoutActivities.longitude,
          createdAt: washoutActivities.createdAt,
          updatedAt: washoutActivities.updatedAt,
        },
        driver: {
          id: drivers.id,
          userId: drivers.userId,
          employerName: drivers.employerName,
          employerStreet: drivers.employerStreet,
          employerCity: drivers.employerCity,
          employerState: drivers.employerState,
          employerZip: drivers.employerZip,
          employerPhone: drivers.employerPhone,
          licenseNumber: drivers.licenseNumber,
          truckNumber: drivers.truckNumber,
          isGpsEnabled: drivers.isGpsEnabled,
          currentLatitude: drivers.currentLatitude,
          currentLongitude: drivers.currentLongitude,
          lastLocationUpdate: drivers.lastLocationUpdate,
          // Removed connectedAccountId - no longer using Stripe Connect
          hasAgreedToTerms: drivers.hasAgreedToTerms,
          termsAgreedAt: drivers.termsAgreedAt,
          createdAt: drivers.createdAt,
          updatedAt: drivers.updatedAt,
          user: {
            id: users.id,
            username: users.username,
            email: users.email,
            firstName: users.firstName,
            lastName: users.lastName,
            phone: users.phone,
            street: users.street,
            city: users.city,
            state: users.state,
            zip: users.zip,
            role: users.role,
            columnCustomerId: users.columnCustomerId,
            // Removed stripeSubscriptionId - using Column BaaS now
            isActive: users.isActive,
            createdAt: users.createdAt,
            updatedAt: users.updatedAt,
          }
        }
      })
      .from(payments)
      .innerJoin(washoutActivities, eq(payments.activityId, washoutActivities.id))
      .innerJoin(drivers, eq(payments.driverId, drivers.id))
      .innerJoin(users, eq(drivers.userId, users.id))
      .where(
        and(
          eq(payments.ownerId, ownerId),
          eq(payments.businessDate, businessDate),
          eq(payments.status, 'pending'),
          isNull(payments.batchId)
        )
      )
      .orderBy(payments.createdAt);

    return pendingPayments;
  }

  async assignPaymentsToBatch(paymentIds: string[], batchId: string, businessDate: string): Promise<void> {
    if (paymentIds.length === 0) return;

    await db
      .update(payments)
      .set({
        batchId,
        businessDate,
        updatedAt: new Date(),
      })
      .where(and(
        sql`${payments.id} = ANY(${paymentIds})`,
        eq(payments.status, 'pending')
      ));
  }

  async getPaymentsByBatchId(batchId: string): Promise<(Payment & { activity: WashoutActivity; driver: Driver & { user: User } })[]> {
    const batchPayments = await db
      .select({
        id: payments.id,
        driverId: payments.driverId,
        ownerId: payments.ownerId,
        activityId: payments.activityId,
        amount: payments.amount,
        processingFee: payments.processingFee,
        washoutServiceFee: payments.washoutServiceFee,
        stripePaymentIntentId: payments.stripePaymentIntentId,
        status: payments.status,
        batchId: payments.batchId,
        businessDate: payments.businessDate,
        paidAt: payments.paidAt,
        createdAt: payments.createdAt,
        updatedAt: payments.updatedAt,
        activity: {
          id: washoutActivities.id,
          driverId: washoutActivities.driverId,
          locationId: washoutActivities.locationId,
          status: washoutActivities.status,
          amount: washoutActivities.amount,
          checkInTime: washoutActivities.checkInTime,
          checkOutTime: washoutActivities.checkOutTime,
          photoUrls: washoutActivities.photoUrls,
          notes: washoutActivities.notes,
          verifiedBy: washoutActivities.verifiedBy,
          verifiedAt: washoutActivities.verifiedAt,
          latitude: washoutActivities.latitude,
          longitude: washoutActivities.longitude,
          createdAt: washoutActivities.createdAt,
          updatedAt: washoutActivities.updatedAt,
        },
        driver: {
          id: drivers.id,
          userId: drivers.userId,
          employerName: drivers.employerName,
          employerStreet: drivers.employerStreet,
          employerCity: drivers.employerCity,
          employerState: drivers.employerState,
          employerZip: drivers.employerZip,
          employerPhone: drivers.employerPhone,
          licenseNumber: drivers.licenseNumber,
          truckNumber: drivers.truckNumber,
          isGpsEnabled: drivers.isGpsEnabled,
          currentLatitude: drivers.currentLatitude,
          currentLongitude: drivers.currentLongitude,
          lastLocationUpdate: drivers.lastLocationUpdate,
          // Removed connectedAccountId - no longer using Stripe Connect
          hasAgreedToTerms: drivers.hasAgreedToTerms,
          termsAgreedAt: drivers.termsAgreedAt,
          createdAt: drivers.createdAt,
          updatedAt: drivers.updatedAt,
          user: {
            id: users.id,
            username: users.username,
            firstName: users.firstName,
            lastName: users.lastName,
            email: users.email,
            phone: users.phone,
            role: users.role,
            createdAt: users.createdAt,
            updatedAt: users.updatedAt,
          },
        },
      })
      .from(payments)
      .innerJoin(washoutActivities, eq(payments.activityId, washoutActivities.id))
      .innerJoin(drivers, eq(payments.driverId, drivers.id))
      .innerJoin(users, eq(drivers.userId, users.id))
      .where(eq(payments.batchId, batchId))
      .orderBy(payments.createdAt);

    return batchPayments;
  }

  async getOwnerBillingSettings(ownerId: string): Promise<{ billingCadence: string; billingCutoffTime: string; billingTimezone: string } | undefined> {
    const [owner] = await db
      .select({
        billingCadence: owners.billingCadence,
        billingCutoffTime: owners.billingCutoffTime,
        billingTimezone: owners.billingTimezone,
      })
      .from(owners)
      .where(eq(owners.id, ownerId));
    
    if (!owner) return undefined;
    
    return {
      billingCadence: owner.billingCadence || 'daily',
      billingCutoffTime: owner.billingCutoffTime || '23:59:00',
      billingTimezone: owner.billingTimezone || 'America/Chicago',
    };
  }

  async updateOwnerBillingSettings(ownerId: string, settings: { billingCadence?: string; billingCutoffTime?: string; billingTimezone?: string }): Promise<Owner> {
    const updateData: any = {
      updatedAt: new Date(),
    };
    
    if (settings.billingCadence !== undefined) {
      updateData.billingCadence = settings.billingCadence as any;
    }
    if (settings.billingCutoffTime !== undefined) {
      updateData.billingCutoffTime = settings.billingCutoffTime;
    }
    if (settings.billingTimezone !== undefined) {
      updateData.billingTimezone = settings.billingTimezone;
    }
    
    const [owner] = await db
      .update(owners)
      .set(updateData)
      .where(eq(owners.id, ownerId))
      .returning();
    
    return owner;
  }

  // Calculate business date based on owner's timezone and cutoff time
  private calculateBusinessDate(
    ownerTimezone: string = 'America/Chicago',
    cutoffTime: string = '23:59:00',
    referenceTime?: Date
  ): string {
    const now = referenceTime || new Date();
    
    console.log(`🕐 [BUSINESS_DATE_CALC] Input: timezone=${ownerTimezone}, cutoff=${cutoffTime}, ref=${now.toISOString()}`);
    
    // Parse cutoff time (HH:MM:SS)
    const [cutoffHours, cutoffMinutes, cutoffSeconds] = cutoffTime.split(':').map(Number);
    
    // Get current time in owner's timezone
    const ownerTimeString = now.toLocaleString('en-US', { 
      timeZone: ownerTimezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
    
    console.log(`🕐 [BUSINESS_DATE_CALC] Owner local time: ${ownerTimeString} (${ownerTimezone})`);
    
    // Parse the owner's local time
    const [datePart, timePart] = ownerTimeString.split(', ');
    const [month, day, year] = datePart.split('/');
    const [hours, minutes, seconds] = timePart.split(':').map(Number);
    
    // Create Date object in owner's timezone
    const ownerLocalTime = new Date(Number(year), Number(month) - 1, Number(day), hours, minutes, seconds);
    
    // Create cutoff time for today in owner's timezone  
    const todayCutoff = new Date(Number(year), Number(month) - 1, Number(day), cutoffHours, cutoffMinutes, cutoffSeconds);
    
    const isAfterCutoff = ownerLocalTime > todayCutoff;
    console.log(`🕐 [BUSINESS_DATE_CALC] Cutoff comparison: ${ownerLocalTime.toISOString()} > ${todayCutoff.toISOString()} = ${isAfterCutoff}`);
    
    // If current time is after cutoff, the business date is tomorrow
    // Otherwise, it's today
    const businessDate = isAfterCutoff
      ? new Date(todayCutoff.getTime() + 24 * 60 * 60 * 1000) // Add 1 day
      : todayCutoff;
    
    const result = businessDate.toISOString().split('T')[0];
    console.log(`🕐 [BUSINESS_DATE_CALC] Result: ${result} (${isAfterCutoff ? 'tomorrow' : 'today'})`);
    
    // Return in YYYY-MM-DD format
    return result;
  }

  // Public wrapper for business date calculation that fetches owner settings
  async calculateBusinessDateForOwner(ownerId: string, timezone?: string, cutoffTime?: string): Promise<string> {
    // Use provided settings or fetch from database
    if (!timezone || !cutoffTime) {
      const billingSettings = await this.getOwnerBillingSettings(ownerId);
      if (!billingSettings) {
        throw new Error(`No billing settings found for owner ${ownerId}`);
      }
      timezone = timezone || billingSettings.billingTimezone;
      cutoffTime = cutoffTime || billingSettings.billingCutoffTime;
    }
    
    return this.calculateBusinessDate(timezone, cutoffTime);
  }

  // Daily batch processing implementation
  async processDailyBatches(cutoffDate?: string): Promise<{ processed: number; failed: number; errors: string[] }> {
    const results = {
      processed: 0,
      failed: 0,
      errors: [] as string[]
    };

    try {
      // If cutoffDate is provided, use it directly
      // Otherwise, we'll calculate per-owner business dates based on their cutoff times
      if (cutoffDate) {
        console.log(`📅 Using provided cutoff date: ${cutoffDate}`);
      } else {
        console.log(`📅 Calculating business dates per owner based on their cutoff times`);
      }
      
      // Get all owners with pending payments
      const ownersWithPendingPayments = await db
        .selectDistinct({ 
          ownerId: payments.ownerId
        })
        .from(payments)
        .where(
          and(
            eq(payments.status, 'pending'),
            isNull(payments.batchId)
          )
        );

      console.log(`📅 Found ${ownersWithPendingPayments.length} owners with pending payments`);

      // Process each owner individually with their specific business date
      for (const { ownerId } of ownersWithPendingPayments) {
        try {
          // Get owner's billing settings
          const billingSettings = await this.getOwnerBillingSettings(ownerId);
          if (!billingSettings) {
            console.warn(`⚠️  No billing settings found for owner ${ownerId}, skipping`);
            continue;
          }

          // Calculate business date for this owner
          const ownerBusinessDate = cutoffDate || this.calculateBusinessDate(
            billingSettings.billingTimezone,
            billingSettings.billingCutoffTime
          );

          console.log(`📅 Processing owner ${ownerId} for business date ${ownerBusinessDate} (timezone: ${billingSettings.billingTimezone}, cutoff: ${billingSettings.billingCutoffTime})`);

          // Process this owner's batch for their specific business date
          await this.processOwnerBatch(ownerId, ownerBusinessDate, billingSettings);
          results.processed++;
        } catch (error: any) {
          console.error(`❌ Failed to process batch for owner ${ownerId}:`, error);
          results.failed++;
          results.errors.push(`Owner ${ownerId}: ${error.message}`);
        }
      }

      console.log(`✅ Batch processing complete - Processed: ${results.processed}, Failed: ${results.failed}`);

      // ===== MONTHLY FEE PROCESSING =====
      try {
        const billingDate = cutoffDate || new Date().toISOString().split('T')[0];
        console.log(`💳 Checking for monthly fees on ${billingDate}...`);

        // Generate monthly fee entries for owners whose billing anchor day is today
        const feeGenResult = await this.generateMonthlyFeesForDate(billingDate);
        console.log(`💳 Generated ${feeGenResult.created} fee entries for ${feeGenResult.owners.length} owners`);

        // Process pending fees (debit owner wallets via Column book transfers)
        if (feeGenResult.created > 0) {
          const feeProcessResult = await this.processPendingFees();
          console.log(`💳 Fee processing: ${feeProcessResult.processed} paid, ${feeProcessResult.failed} failed`);
          
          results.errors.push(...feeProcessResult.errors);
        }
      } catch (error: any) {
        console.error('❌ Monthly fee processing error:', error);
        results.errors.push(`Monthly fees: ${error.message}`);
      }

      return results;
    } catch (error: any) {
      console.error('❌ Daily batch processing failed:', error);
      results.errors.push(`System error: ${error.message}`);
      return results;
    }
  }

  // Process a single owner's batch for a business date
  private async processOwnerBatch(ownerId: string, businessDate: string, billingSettings?: { billingCadence: string; billingCutoffTime: string; billingTimezone: string }): Promise<void> {
    return await db.transaction(async (tx) => {
      try {
        // Check if batch already exists for this owner/date (idempotency)
        const existingBatch = await this.getBillingBatchByOwnerAndDate(ownerId, businessDate);
        if (existingBatch) {
          console.log(`⚠️  Batch already exists for owner ${ownerId} on ${businessDate}: ${existingBatch.id}`);
          return;
        }

        // Get pending payments for this owner and business date
        const pendingPayments = await this.getPendingPaymentsForBatch(ownerId, businessDate);
        
        if (pendingPayments.length === 0) {
          console.log(`ℹ️  No pending payments for owner ${ownerId} on ${businessDate}`);
          return;
        }

        // Calculate batch totals
        const totalAmount = pendingPayments.reduce((sum, payment) => sum + parseFloat(payment.amount), 0);
        const totalFees = pendingPayments.reduce((sum, payment) => sum + parseFloat(payment.processingFee) + parseFloat(payment.washoutServiceFee), 0);
        const paymentCount = pendingPayments.length;

        console.log(`💰 Processing batch for owner ${ownerId}: ${paymentCount} payments totaling $${totalAmount.toFixed(2)} (fees: $${totalFees.toFixed(2)})`);

        // Get billing settings if not provided
        const batchBillingSettings = billingSettings || await this.getOwnerBillingSettings(ownerId);
        if (!batchBillingSettings) {
          throw new Error(`No billing settings found for owner ${ownerId}`);
        }

        // Create billing batch record with proper timezone and cutoff time
        const billingBatch = await this.createBillingBatch({
          ownerId,
          businessDate,
          cutoffTime: batchBillingSettings.billingCutoffTime,
          timezone: batchBillingSettings.billingTimezone,
          status: 'processing',
          totalAmount: totalAmount.toFixed(2),
          totalFees: totalFees.toFixed(2),
          paymentCount,
          processingStartedAt: new Date(),
        });

        // Assign payments to the batch
        const paymentIds = pendingPayments.map(p => p.id);
        await this.assignPaymentsToBatch(paymentIds, billingBatch.id, businessDate);

        // Create Stripe PaymentIntent or simulate for development
        let stripePaymentIntentId: string;
        let processingResult: { success: boolean; error?: string } = { success: false };

        try {
          // Check if we're in a Stripe-enabled environment
          const stripe = await this.getStripeInstance();
          
          if (stripe) {
            // Production/Stripe-enabled environment: Create real PaymentIntent
            stripePaymentIntentId = await this.createStripePaymentIntent(
              billingBatch.id,
              ownerId,
              totalAmount,
              totalFees,
              paymentCount,
              batchBillingSettings
            );
            
            // Update batch with real Stripe payment intent
            await this.updateBillingBatchProcessing(
              billingBatch.id, 
              totalAmount.toFixed(2), 
              totalFees.toFixed(2), 
              paymentCount, 
              stripePaymentIntentId
            );
            
            console.log(`💳 Created Stripe PaymentIntent ${stripePaymentIntentId} for batch ${billingBatch.id}`);
            
            // Payment completion will be handled by Stripe webhook
            // Mark batch as processing and wait for webhook
            processingResult = { success: true };
            
          } else {
            // Development environment: Simulate success
            stripePaymentIntentId = `pi_simulated_${billingBatch.id}_${Date.now()}`;
            
            // Update batch with simulated payment intent
            await this.updateBillingBatchProcessing(
              billingBatch.id, 
              totalAmount.toFixed(2), 
              totalFees.toFixed(2), 
              paymentCount, 
              stripePaymentIntentId
            );

            // Simulate successful payment processing immediately
            await this.completeBatchPayment(billingBatch.id, stripePaymentIntentId);
            
            console.log(`🧪 Simulated successful payment for batch ${billingBatch.id} (development mode)`);
            processingResult = { success: true };
          }
          
        } catch (error: any) {
          console.error(`❌ Error creating payment for batch ${billingBatch.id}:`, error);
          
          // Mark batch as failed
          await this.markBillingBatchFailed(billingBatch.id, error.message);
          processingResult = { success: false, error: error.message };
          
          // Don't throw here - we want to continue processing other batches
          // The caller will see this batch marked as failed
        }

        console.log(`✅ Successfully processed batch ${billingBatch.id} for owner ${ownerId}`);

      } catch (error: any) {
        console.error(`❌ Error processing batch for owner ${ownerId}:`, error);
        throw error; // Will rollback transaction
      }
    });
  }

  // Complete batch payment processing (normally called by Stripe webhook)
  async completeBatchPayment(batchId: string, stripePaymentIntentId: string): Promise<void> {
    console.log(`🎯 [BATCH_COMPLETION] Starting batch completion: ${batchId}, PaymentIntent: ${stripePaymentIntentId}`);
    
    return await db.transaction(async (tx) => {
      try {
        // Get batch details
        const batch = await this.getBillingBatch(batchId);
        if (!batch) {
          throw new Error(`Batch ${batchId} not found`);
        }

        console.log(`🎯 [BATCH_COMPLETION] Batch details: ${JSON.stringify({
          id: batch.id,
          ownerId: batch.ownerId,
          businessDate: batch.businessDate,
          totalAmount: batch.totalAmount,
          paymentCount: batch.paymentCount,
          status: batch.status,
          timezone: batch.timezone,
          cutoffTime: batch.cutoffTime
        })}`);

        // Get all payments in this batch
        const batchPayments = await db
          .select({
            id: payments.id,
            driverId: payments.driverId,
            amount: payments.amount,
            activityId: payments.activityId,
          })
          .from(payments)
          .where(eq(payments.batchId, batchId));

        console.log(`🎯 [BATCH_COMPLETION] Found ${batchPayments.length} payments in batch`);

        // Update payment statuses to completed
        await db
          .update(payments)
          .set({
            status: 'completed',
            stripePaymentIntentId,
            paidAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(payments.batchId, batchId));

        console.log(`🎯 [BATCH_COMPLETION] Updated ${batchPayments.length} payments to completed status`);

        // Move funds from pending to available for each driver
        let totalMovedAmount = 0;
        for (const payment of batchPayments) {
          console.log(`💰 [WALLET_UPDATE] Moving $${payment.amount} from pending to available for driver ${payment.driverId}`);
          
          await this.movePendingToAvailable(
            payment.driverId, 
            payment.amount, 
            payment.activityId, // Source transaction ID
            batchId
          );
          
          totalMovedAmount += parseFloat(payment.amount);
          console.log(`💰 [WALLET_UPDATE] Successfully moved $${payment.amount} for driver ${payment.driverId}`);
        }

        // Mark batch as completed
        await this.markBillingBatchCompleted(batchId);

        console.log(`✅ [BATCH_COMPLETION] Successfully completed batch ${batchId}:`);
        console.log(`   - Payments processed: ${batchPayments.length}`);
        console.log(`   - Total amount moved to available: $${totalMovedAmount.toFixed(2)}`);
        console.log(`   - PaymentIntent: ${stripePaymentIntentId}`);
        console.log(`   - Business date: ${batch.businessDate}`);
        console.log(`   - Owner timezone: ${batch.timezone} (cutoff: ${batch.cutoffTime})`);

      } catch (error: any) {
        console.error(`❌ [BATCH_COMPLETION] Error completing batch payment ${batchId}:`, error);
        console.error(`❌ [BATCH_COMPLETION] Full error details:`, {
          message: error.message,
          stack: error.stack,
          batchId,
          stripePaymentIntentId
        });
        throw error; // Will rollback transaction
      }
    });
  }

  async movePendingToAvailable(
    driverId: string, 
    amount: string, 
    sourceTransactionId: string, 
    batchId: string
  ): Promise<{ wallet: DriverWallet; transaction: WalletTransaction }> {
    return await db.transaction(async (tx) => {
      try {
        // Get wallet with lock
        let wallet = await this.getDriverWallet(driverId, tx, true);
        if (!wallet) {
          throw new Error(`Wallet not found for driver ${driverId}`);
        }

        // CENT-SAFE ARITHMETIC
        const amountCents = Math.round(parseFloat(amount) * 100);
        const currentAvailableCents = Math.round(parseFloat(wallet.availableBalance) * 100);
        const currentPendingCents = Math.round(parseFloat(wallet.pendingBalance) * 100);
        
        // Validate we have enough pending balance
        if (currentPendingCents < amountCents) {
          throw new Error(`Insufficient pending balance for driver ${driverId}: ${wallet.pendingBalance} < ${amount}`);
        }

        const newAvailableCents = currentAvailableCents + amountCents;
        const newPendingCents = currentPendingCents - amountCents;
        const newAvailableBalance = (newAvailableCents / 100).toFixed(2);
        const newPendingBalance = (newPendingCents / 100).toFixed(2);

        // Create transaction record for the balance transfer
        const transaction = await this.createWalletTransaction({
          driverId,
          amount: amount,
          direction: 'credit',
          balanceAfter: newAvailableBalance,
          sourceType: 'washout',
          sourceId: batchId, // Reference the batch, not the original activity
          status: 'posted',
          description: `Batch payment posted - moved $${amount} from pending to available (batch: ${batchId})`,
          metadata: {
            transferType: 'pending_to_available',
            originalSourceId: sourceTransactionId,
            batchId,
            originalPendingBalanceCents: currentPendingCents,
            originalAvailableBalanceCents: currentAvailableCents,
            transferCents: amountCents,
            newPendingCents: newPendingCents,
            newAvailableCents: newAvailableCents
          }
        }, tx);

        // Update wallet balances atomically
        const updatedWallet = await this.updateWalletBalance(
          driverId,
          newAvailableBalance,
          newPendingBalance,
          tx
        );

        // Update the original pending transaction status to 'posted'
        await db
          .update(walletTransactions)
          .set({
            status: 'posted',
          })
          .where(and(
            eq(walletTransactions.driverId, driverId),
            eq(walletTransactions.sourceId, sourceTransactionId),
            eq(walletTransactions.status, 'pending')
          ));

        console.log(`✅ Moved $${amount} from pending to available for driver ${driverId} (batch: ${batchId})`);
        return { wallet: updatedWallet, transaction };

      } catch (error: any) {
        console.error(`❌ Failed to move pending to available for driver ${driverId}:`, error);
        throw error; // Will rollback transaction
      }
    });
  }

  // ============= FEE LEDGER OPERATIONS =============

  async createFeeLedgerEntry(fee: InsertFeeLedger): Promise<FeeLedger> {
    const [entry] = await db
      .insert(feesLedger)
      .values(fee)
      .returning();
    return entry;
  }

  async getFeeLedgerEntry(id: string): Promise<FeeLedger | undefined> {
    const [entry] = await db
      .select()
      .from(feesLedger)
      .where(eq(feesLedger.id, id));
    return entry;
  }

  async getFeeLedgerEntriesByOwner(
    ownerId: string, 
    startDate?: string, 
    endDate?: string
  ): Promise<(FeeLedger & { location?: WashoutLocation })[]> {
    const query = db
      .select({
        ...getTableColumns(feesLedger),
        location: washoutLocations,
      })
      .from(feesLedger)
      .leftJoin(washoutLocations, eq(feesLedger.locationId, washoutLocations.id))
      .where(eq(feesLedger.ownerId, ownerId))
      .$dynamic();

    if (startDate) {
      query.where(gte(feesLedger.periodStart, startDate));
    }
    if (endDate) {
      query.where(lte(feesLedger.periodEnd, endDate));
    }

    const results = await query.orderBy(desc(feesLedger.createdAt));
    return results as any;
  }

  async getFeeLedgerEntriesByStatus(
    status: string
  ): Promise<(FeeLedger & { owner: Owner & { user: User }, location?: WashoutLocation })[]> {
    const results = await db
      .select({
        ...getTableColumns(feesLedger),
        owner: owners,
        user: users,
        location: washoutLocations,
      })
      .from(feesLedger)
      .innerJoin(owners, eq(feesLedger.ownerId, owners.id))
      .innerJoin(users, eq(owners.userId, users.id))
      .leftJoin(washoutLocations, eq(feesLedger.locationId, washoutLocations.id))
      .where(eq(feesLedger.status, status))
      .orderBy(desc(feesLedger.createdAt));

    return results.map(r => ({
      ...r,
      owner: { ...r.owner, user: r.user }
    })) as any;
  }

  async updateFeeLedgerStatus(
    feeId: string, 
    status: string, 
    walletTxId?: string, 
    columnTransferId?: string, 
    failureReason?: string
  ): Promise<FeeLedger> {
    const updates: any = { status, updatedAt: new Date() };
    if (walletTxId) updates.walletTxId = walletTxId;
    if (columnTransferId) updates.columnTransferId = columnTransferId;
    if (failureReason) updates.failureReason = failureReason;
    if (status === 'paid') updates.paidAt = new Date();

    const [updated] = await db
      .update(feesLedger)
      .set(updates)
      .where(eq(feesLedger.id, feeId))
      .returning();
    return updated;
  }

  async markFeeLedgerPaid(
    feeId: string, 
    walletTxId: string, 
    columnTransferId: string
  ): Promise<FeeLedger> {
    const [updated] = await db
      .update(feesLedger)
      .set({
        status: 'paid',
        walletTxId,
        columnTransferId,
        paidAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(feesLedger.id, feeId))
      .returning();
    return updated;
  }

  async updateFeeLedgerRetryCount(feeId: string): Promise<FeeLedger> {
    const [updated] = await db
      .update(feesLedger)
      .set({
        retryCount: sql`${feesLedger.retryCount} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(feesLedger.id, feeId))
      .returning();
    return updated;
  }

  async getOwnerSubscriptionSettings(
    ownerId: string
  ): Promise<{ subscriptionPlan: string; subscriptionFeeCents: number; feeAnchorDay: number; lastFeeBillingDate: string | null } | undefined> {
    const [owner] = await db
      .select({
        subscriptionPlan: owners.subscriptionPlan,
        subscriptionFeeCents: owners.subscriptionFeeCents,
        feeAnchorDay: owners.feeAnchorDay,
        lastFeeBillingDate: owners.lastFeeBillingDate,
      })
      .from(owners)
      .where(eq(owners.id, ownerId));
    return owner;
  }

  async updateOwnerSubscriptionSettings(
    ownerId: string, 
    settings: { subscriptionPlan?: string; subscriptionFeeCents?: number; feeAnchorDay?: number }
  ): Promise<Owner> {
    const [updated] = await db
      .update(owners)
      .set({
        ...settings,
        updatedAt: new Date(),
      })
      .where(eq(owners.id, ownerId))
      .returning();
    return updated;
  }

  async generateMonthlyFeesForDate(billingDate: string): Promise<{ created: number; owners: string[] }> {
    const day = new Date(billingDate).getDate();
    
    // Find all owners whose billing anchor day matches today
    const ownersToBill = await db
      .select()
      .from(owners)
      .where(
        and(
          eq(owners.feeAnchorDay, day),
          or(
            isNull(owners.lastFeeBillingDate),
            ne(owners.lastFeeBillingDate, billingDate)
          )
        )
      );

    let created = 0;
    const processedOwners: string[] = [];

    for (const owner of ownersToBill) {
      try {
        // Calculate period dates
        const periodStart = billingDate;
        const periodEndDate = new Date(billingDate);
        periodEndDate.setMonth(periodEndDate.getMonth() + 1);
        periodEndDate.setDate(periodEndDate.getDate() - 1);
        const periodEnd = periodEndDate.toISOString().split('T')[0];

        // Skip subscription fees - membership is now one-time $1500 payment during signup
        // Only charge monthly location fees (handled below)

        // Create location fees for all active locations
        const locations = await this.getLocationsByOwner(owner.id);
        for (const location of locations) {
          if (location.isActive && location.monthlyFeeCents && location.monthlyFeeCents > 0) {
            await this.createFeeLedgerEntry({
              ownerId: owner.id,
              feeType: 'location_monthly',
              locationId: location.id,
              amountCents: location.monthlyFeeCents,
              periodStart,
              periodEnd,
              status: 'pending',
              metadata: {
                locationName: location.name,
                locationAddress: location.address,
                generatedAt: new Date().toISOString(),
              },
            });
            created++;
          }
        }

        // Update owner's last billing date
        await db
          .update(owners)
          .set({ lastFeeBillingDate: billingDate })
          .where(eq(owners.id, owner.id));

        processedOwners.push(owner.id);

      } catch (error: any) {
        console.error(`Error generating fees for owner ${owner.id}:`, error);
      }
    }

    return { created, owners: processedOwners };
  }

  async processPendingFees(): Promise<{ processed: number; failed: number; errors: string[] }> {
    const results = {
      processed: 0,
      failed: 0,
      errors: [] as string[]
    };

    try {
      // Get all pending fees
      const pendingFees = await this.getFeeLedgerEntriesByStatus('pending');
      console.log(`💳 Found ${pendingFees.length} pending fees to process`);

      for (const fee of pendingFees) {
        try {
          const owner = fee.owner;
          
          // Check if owner has sufficient wallet balance
          const walletBalance = await this.getOwnerWalletBalance(owner.id);
          if (!walletBalance) {
            throw new Error('Owner wallet not found');
          }

          const balanceCents = Math.round(parseFloat(walletBalance.balance) * 100);
          const feeCents = fee.amountCents;

          if (balanceCents < feeCents) {
            // Insufficient funds - mark as failed
            console.warn(`⚠️  Insufficient funds for fee ${fee.id}: balance $${(balanceCents / 100).toFixed(2)} < fee $${(feeCents / 100).toFixed(2)}`);
            
            await this.updateFeeLedgerStatus(
              fee.id,
              'failed',
              undefined,
              undefined,
              `Insufficient funds: balance $${(balanceCents / 100).toFixed(2)}, required $${(feeCents / 100).toFixed(2)}`
            );
            
            // Create notification for owner
            await this.createNotification({
              userId: owner.userId,
              title: 'Monthly Fee Payment Failed',
              message: `Insufficient wallet balance to pay ${fee.feeType} fee of $${(feeCents / 100).toFixed(2)}. Please add funds to your wallet.`,
              type: 'error',
            });

            results.failed++;
            results.errors.push(`Fee ${fee.id}: Insufficient funds`);
            continue;
          }

          // Debit owner wallet and transfer to platform via Column
          await db.transaction(async (tx) => {
            const feeAmount = (feeCents / 100).toFixed(2);
            const balanceBefore = walletBalance.balance;
            const balanceAfter = ((balanceCents - feeCents) / 100).toFixed(2);

            // Create wallet transaction record
            const [walletTx] = await tx
              .insert(ownerWalletTransactions)
              .values({
                ownerId: owner.id,
                type: 'fee_debit',
                amount: feeAmount,
                balanceBefore,
                balanceAfter,
                description: `${fee.feeType} fee for period ${fee.periodStart} to ${fee.periodEnd}${fee.location ? ` (${fee.location.name})` : ''}`,
                paymentId: null,
                batchId: null,
                columnTransferId: null, // Will be updated after Column transfer
              })
              .returning();

            // Update owner wallet balance
            await tx
              .update(owners)
              .set({ 
                walletBalance: balanceAfter,
                updatedAt: new Date()
              })
              .where(eq(owners.id, owner.id));

            // Attempt Column book transfer to platform account
            let columnTransferId: string | null = null;
            try {
              // Import columnService for book transfers
              const { columnService } = await import('./columnService');
              
              // Get platform account from service_payment_accounts
              const [platformAccount] = await tx
                .select()
                .from(servicePaymentAccounts)
                .where(eq(servicePaymentAccounts.accountType, 'platform'))
                .limit(1);

              if (!platformAccount || !platformAccount.columnBankAccountId) {
                throw new Error('Platform Column account not configured');
              }

              if (!owner.columnAccountId) {
                throw new Error('Owner Column account not configured');
              }

              // Create Column book transfer (owner → platform)
              const columnTransfer = await columnService.createBookTransfer({
                sender_bank_account_id: owner.columnAccountId,
                receiver_bank_account_id: platformAccount.columnBankAccountId,
                amount: feeCents,
                description: `${fee.feeType} fee - period ${fee.periodStart} to ${fee.periodEnd}`,
              });

              columnTransferId = columnTransfer.id;
              console.log(`✅ Column book transfer created: ${columnTransferId} for fee ${fee.id}`);

              // Update wallet transaction with Column transfer ID
              await tx
                .update(ownerWalletTransactions)
                .set({ columnTransferId })
                .where(eq(ownerWalletTransactions.id, walletTx.id));

            } catch (columnError: any) {
              console.error(`❌ Column transfer failed for fee ${fee.id}:`, columnError);
              // If Column transfer fails, we still debited the wallet, so mark as failed with retry
              await this.updateFeeLedgerStatus(
                fee.id,
                'failed',
                walletTx.id,
                undefined,
                `Column transfer failed: ${columnError.message}`
              );
              await this.updateFeeLedgerRetryCount(fee.id);
              
              results.failed++;
              results.errors.push(`Fee ${fee.id}: Column transfer failed - ${columnError.message}`);
              return; // Exit transaction handler
            }

            // Mark fee as paid
            await tx
              .update(feesLedger)
              .set({
                status: 'paid',
                walletTxId: walletTx.id,
                columnTransferId,
                paidAt: new Date(),
                updatedAt: new Date(),
              })
              .where(eq(feesLedger.id, fee.id));

            console.log(`✅ Fee ${fee.id} paid successfully: $${feeAmount} (${fee.feeType})`);
            results.processed++;
          });

        } catch (error: any) {
          console.error(`❌ Error processing fee ${fee.id}:`, error);
          results.failed++;
          results.errors.push(`Fee ${fee.id}: ${error.message}`);
          
          // Update retry count
          await this.updateFeeLedgerRetryCount(fee.id);
        }
      }

      return results;
    } catch (error: any) {
      console.error('❌ Fee processing failed:', error);
      results.errors.push(`System error: ${error.message}`);
      return results;
    }
  }

  // Feature Flag operations
  async getFeatureFlag(flagKey: string): Promise<FeatureFlag | undefined> {
    const [flag] = await db.select().from(featureFlags).where(eq(featureFlags.flagKey, flagKey));
    return flag;
  }

  async getAllFeatureFlags(): Promise<FeatureFlag[]> {
    return await db.select().from(featureFlags).orderBy(featureFlags.flagKey);
  }

  async createFeatureFlag(flag: InsertFeatureFlag): Promise<FeatureFlag> {
    const [newFlag] = await db.insert(featureFlags).values(flag).returning();
    return newFlag;
  }

  async updateFeatureFlag(flagKey: string, enabled: boolean): Promise<FeatureFlag> {
    const [updated] = await db
      .update(featureFlags)
      .set({ enabled, updatedAt: new Date() })
      .where(eq(featureFlags.flagKey, flagKey))
      .returning();
    return updated;
  }

  async getFeatureFlagOverride(flagKey: string, userId: string): Promise<FeatureFlagOverride | undefined> {
    const flag = await this.getFeatureFlag(flagKey);
    if (!flag) return undefined;

    const [override] = await db
      .select()
      .from(featureFlagOverrides)
      .where(and(eq(featureFlagOverrides.flagId, flag.id), eq(featureFlagOverrides.userId, userId)));
    return override;
  }

  async setFeatureFlagOverride(flagKey: string, userId: string, enabled: boolean): Promise<FeatureFlagOverride> {
    const flag = await this.getFeatureFlag(flagKey);
    if (!flag) throw new Error(`Feature flag ${flagKey} not found`);

    const [override] = await db
      .insert(featureFlagOverrides)
      .values({ flagId: flag.id, userId, enabled })
      .onConflictDoUpdate({
        target: [featureFlagOverrides.flagId, featureFlagOverrides.userId],
        set: { enabled, updatedAt: new Date() },
      })
      .returning();
    return override;
  }

  async checkFeatureFlag(flagKey: string, userId: string, userRole: string): Promise<boolean> {
    const flag = await this.getFeatureFlag(flagKey);
    if (!flag) return false;

    // Check role-based access
    if (flag.allowedRoles && flag.allowedRoles.length > 0) {
      if (!flag.allowedRoles.includes(userRole)) {
        return false; // Role not allowed
      }
    }

    // Check user-specific override
    const override = await this.getFeatureFlagOverride(flagKey, userId);
    if (override !== undefined) {
      return override.enabled;
    }

    // Fall back to global flag setting
    return flag.enabled;
  }
}

export const storage = new DatabaseStorage();
