import {
  users,
  drivers,
  owners,
  washoutLocations,
  washoutActivities,
  washoutPhotos,
  payments,
  notifications,
  termsVersions,
  termsAcceptances,
  messages,
  passwordResetTokens,
  ownerFundingSources,
  ownerWalletTransactions,
  driverWallets,
  walletTransactions,
  withdrawals,
  debitCardRequests,
  webhookEvents,
  balanceReconciliations,
  reconciliationDiscrepancies,
  servicePaymentAccounts,
  billingBatches,
  feesLedger,
  pendingWashoutPayments,
  washoutPaymentBatches,
  featureFlags,
  featureFlagOverrides,
  systemSettings,
  materials,
  locationMaterialIntents,
  identityDocuments,
  driverLotteryEntries,
  prizeCatalog,
  prizeCatalogInventoryAdjustments,
  lotteryNotifications,
  lotteryDrawingFulfillments,
  lotteryDrawingFulfillmentHistory,
  type PrizeCatalog,
  type InsertPrizeCatalog,
  type UpdatePrizeCatalog,
  type PrizeCatalogInventoryAdjustment,
  type PrizeCatalogInventoryAdjustmentType,
  type LotteryDrawingFulfillment,
  type InsertLotteryDrawingFulfillment,
  type LotteryDrawingFulfillmentHistory,
  type InsertLotteryDrawingFulfillmentHistory,
  type User,
  type UpsertUser,
  type Driver,
  type Owner,
  type WashoutLocation,
  type WashoutActivity,
  type WashoutPhoto,
  type Payment,
  type Notification,
  type TermsVersion,
  type TermsAcceptance,
  type Message,
  type PasswordResetToken,
  type OwnerFundingSource,
  type OwnerWalletTransaction,
  type DriverWallet,
  type WalletTransaction,
  type Withdrawal,
  type DebitCardRequest,
  type WebhookEvent,
  type InsertWebhookEvent,
  type BalanceReconciliation,
  type InsertBalanceReconciliation,
  type ReconciliationDiscrepancy,
  type InsertReconciliationDiscrepancy,
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
  type InsertTermsVersion,
  type InsertTermsAcceptance,
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
  type PendingWashoutPayment,
  type InsertPendingWashoutPayment,
  type WashoutPaymentBatch,
  type InsertWashoutPaymentBatch,
  type SystemSettings,
  type UpdateSystemSettings,
  type Material,
  type InsertMaterial,
  type LocationMaterialIntent,
  type InsertLocationMaterialIntent,
  type DriverLotteryEntry,
  type InsertDriverLotteryEntry,
  type LotteryDrawingWinner,
  type InsertLotteryDrawingWinner,
  type LotteryNotification,
  type InsertLotteryNotification,
  lotteryDrawingWinners,
  lotteryDrawings,
  financialHistoryRecords,
} from "@shared/schema";
import { db } from "./db";
import { summarizeDatabaseError } from "./dbErrors";
import { processOwnerBillingRun } from "./ownerBillingRuns";
import { assertLegacyFinancialExecutionRetired, isLegacyFinancialExecutionFenced, logFinancialExecutionDenied } from "./financialExecutionPolicy";
import { resolvePlatformFeeCents, resolveConfiguredWashoutPlatformFeeCents, type OwnerBillingLedger } from "../shared/billingPolicy";
import { normalizeMoneyToCents } from "../shared/money";
import {
  getPaymentDriverIncentiveCents,
  getPaymentOwnerChargeCents,
  getPaymentPlatformFeeCents,
  getPaymentWashoutServiceFeeCents,
} from "../shared/paymentAccounting";
import { resolveDriverLocationVisibilityState } from "../shared/ownerLocationAccess";
import { resolveOwnerMembershipState } from "../shared/ownerMembership";
import {
  buildOwnerWashoutBillingLedgerFromBillableWashouts,
  buildOwnerWashoutBillingLedgerFromPayments,
  getDriverTipSummaryFromPayments,
  getOwnerBillingSummary,
  getPlatformRevenueSummary,
  getReceivablesSummary,
  getReportingBillingStatus,
  type ReportingLedgerPayment,
  type ReportingLedgerBatch,
} from "./billing/ownerWashoutLedger";
import { isBillableWashoutForOwnerBilling } from "../shared/washoutApproval";
import { eq, and, gte, lte, asc, desc, sql, count, ne, or, getTableColumns, isNull, isNotNull, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { formatAddress } from "@shared/addressUtils";
import type { PhotoFingerprintCandidate } from "@shared/photoFingerprint";

type IdentityDocument = typeof identityDocuments.$inferSelect;

export interface IStorage {
  // User operations - local authentication
  getUser(id: string): Promise<User | undefined>;
  getUserById(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByUsernameInsensitive(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getAllUsers(): Promise<User[]>;
  createUser(user: { username: string; email: string; passwordHash: string; firstName: string; lastName: string; phone?: string; address?: string; role: string }): Promise<User>;
  upsertUser(user: UpsertUser): Promise<User>;
  updateUserPassword(userId: string, passwordHash: string): Promise<User>;
  updateUserStatus(userId: string, isActive: boolean): Promise<User | undefined>;
  updateUserStripeInfo(userId: string, stripeData: { stripeConnectAccountId?: string; stripeCustomerId?: string }): Promise<User>;
  reconcileDriverStripeAccountIds(params: {
    userId: string;
    driverId: string;
    expectedAccountId: string;
  }): Promise<{
    conflict: boolean;
    updatedFields: Array<"users.stripeConnectAccountId" | "drivers.stripeConnectAccountId" | "drivers.connectedAccountId">;
    currentValues?: Record<string, string | null>;
  }>;

  // Password reset operations
  createPasswordResetToken(token: InsertPasswordResetToken): Promise<PasswordResetToken>;
  getPasswordResetToken(token: string): Promise<PasswordResetToken | undefined>;
  deletePasswordResetToken(tokenId: string): Promise<void>;

  // Driver operations
  createDriver(driver: InsertDriver): Promise<Driver>;
  getDriver(userId: string): Promise<Driver | undefined>;
  getDriverByUserId(userId: string): Promise<Driver | undefined>;
  getDriverById(id: string): Promise<Driver | undefined>;
  getDriverByConnectedAccountId(connectedAccountId: string): Promise<Driver | undefined>;
  updateDriver(driverId: string, driverData: Partial<InsertDriver>): Promise<Driver>;
  updateDriverPaymentPreferences(driverId: string, paymentData: { paymentMethod: "ach" | "venmo" | "zelle"; bankName?: string; accountHolderName?: string; routingNumber?: string; accountNumber?: string; venmoHandle?: string; zelleEmail?: string }): Promise<Driver>;
  updateDriverLocation(driverId: string, latitude: number, longitude: number): Promise<void>;
  updateDriverWallet(driverId: string, availableBalance?: string, pendingBalance?: string): Promise<DriverWallet>;
  getAllDrivers(): Promise<(Driver & { user: User })[]>;
  getAllAdmins(): Promise<User[]>;
  createAdminUser(adminData: { username: string; email: string; passwordHash: string; firstName: string; lastName: string }): Promise<User>;

  // Owner operations
  createOwner(owner: InsertOwner): Promise<Owner>;
  getOwner(userId: string): Promise<Owner | undefined>;
  getOwnerById(id: string): Promise<Owner | undefined>;
  updateOwner(ownerId: string, ownerData: Partial<InsertOwner>): Promise<Owner>;
  updateOwnerSubscription(ownerId: string, subscriptionStatus: string, pastDueDate?: Date | null, subscriptionEndsAt?: Date | null, gracePeriodStartDate?: Date | null, lastReminderSent?: Date | null): Promise<Owner>;
  // Owner wallet operations (replacing subscription model)
  getOwnerWalletBalance(ownerId: string): Promise<{ balance: string; status: string } | undefined>;
  updateOwnerWalletBalance(ownerId: string, amount: string, type: string, description?: string): Promise<void>;
  getOwnerWalletTransactions(ownerId: string, startDate?: Date, endDate?: Date): Promise<any[]>;
  approveOwner(ownerId: string): Promise<Owner>;
  activateMembership(ownerId: string, paymentMethod: string, paymentNotes: string | undefined, activatedBy: string): Promise<Owner>;
  updateOwnerCustomPlatformFee(ownerId: string, customFee: string | null): Promise<Owner>;
  updateOwnerCustomBillingSettings(ownerId: string, useCustomBillingModel: boolean, customWashoutRate: string | null): Promise<Owner>;
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
  // Admin pricing operations
  batchUpdateAllLocationRates(newRate: string): Promise<{ updated: number; locations: WashoutLocation[] }>;
  batchUpdatePendingActivityAmounts(newAmount: string): Promise<{ updated: number; activities: WashoutActivity[] }>;
  getPendingActivities(): Promise<WashoutActivity[]>;

  // Rubble service: Material operations
  getAllMaterials(): Promise<Material[]>;
  getMaterialBySlug(slug: string): Promise<Material | undefined>;
  createMaterial(material: InsertMaterial): Promise<Material>;

  // Rubble service: Location material intent operations
  getLocationMaterialIntents(locationId: string): Promise<LocationMaterialIntent[]>;
  createLocationMaterialIntent(intent: InsertLocationMaterialIntent): Promise<LocationMaterialIntent>;
  updateLocationMaterialIntent(intentId: string, updates: Partial<InsertLocationMaterialIntent>): Promise<LocationMaterialIntent>;
  deleteLocationMaterialIntent(intentId: string): Promise<boolean>;
  deleteAllLocationMaterialIntents(locationId: string): Promise<void>;

  // Activity operations
  createWashoutActivity(activity: InsertWashoutActivity): Promise<WashoutActivity>;
  getWashoutActivity(id: string): Promise<WashoutActivity | undefined>;
  getActivitiesByDriver(driverId: string, startDate?: Date, endDate?: Date): Promise<(WashoutActivity & { location: WashoutLocation })[]>;
  getActivitiesByLocation(locationId: string, startDate?: Date, endDate?: Date): Promise<(WashoutActivity & { driver: Driver & { user: User } })[]>;
  getActivitiesByOwner(ownerId: string, startDate?: Date, endDate?: Date): Promise<(WashoutActivity & { location: WashoutLocation; driver: Driver & { user: User } })[]>;
  verifyWashoutActivity(activityId: string, verifiedBy: string): Promise<WashoutActivity>;
  rejectWashoutActivity(activityId: string, rejectedBy: string): Promise<WashoutActivity>;
  updateWashoutActivityStatus(activityId: string, status: string): Promise<WashoutActivity>;
  getRecentActivitiesByDriver(driverId: string, limit?: number): Promise<(WashoutActivity & { location: WashoutLocation })[]>;
  getAllActivities(startDate?: Date, endDate?: Date): Promise<(WashoutActivity & { location: WashoutLocation; driver: Driver & { user: User } })[]>;
  
  // Auto-approval operations (72-hour timeout)
  getExpiredPendingActivities(hoursOld?: number): Promise<(WashoutActivity & { location: WashoutLocation; driver: Driver & { user: User } })[]>;
  autoApproveExpiredActivities(hoursOld?: number): Promise<{ approved: number; failed: number; errors: string[] }>;

  // Photo operations - NEW clean photo system
  createWashoutPhoto(photo: InsertWashoutPhoto): Promise<WashoutPhoto>;
  getPhotosByActivity(activityId: string): Promise<WashoutPhoto[]>;
  getPhotoById(photoId: string): Promise<WashoutPhoto | undefined>;
  getRecentWashoutPhotoDuplicateCandidates(since: Date): Promise<PhotoFingerprintCandidate[]>;
  deletePhoto(photoId: string): Promise<boolean>;
  // Transactional operation: create activity with photos atomically
  createWashoutActivityWithPhotos(
    activity: InsertWashoutActivity, 
    photos: Omit<InsertWashoutPhoto, 'activityId'>[]
  ): Promise<{ activity: WashoutActivity; photos: WashoutPhoto[] }>;

  // Payment operations
  createPayment(payment: InsertPayment & { tipAmountCents?: number | string | null }): Promise<Payment>;
  getPaymentById(paymentId: string): Promise<Payment | undefined>;
  getPaymentsByDriver(driverId: string, startDate?: Date, endDate?: Date): Promise<(Payment & { activity: WashoutActivity & { location: WashoutLocation } })[]>;
  getPaymentsByOwner(ownerId: string, startDate?: Date, endDate?: Date): Promise<(Payment & { activity: WashoutActivity & { driver: Driver & { user: User } } })[]>;
  getPaymentsAwaitingDriverStripe(): Promise<(Payment & { activity: WashoutActivity; driver: Driver & { user: User }; owner: Owner & { user: User }; location: WashoutLocation })[]>;
  getPaymentsAwaitingDriverStripeByDriver(driverId: string): Promise<(Payment & { activity: WashoutActivity & { location: WashoutLocation }; owner: Owner & { user: User } })[]>;
  updatePaymentStatus(paymentId: string, status: string, columnTransferId?: string): Promise<Payment>;
  getAllPayments(startDate?: Date, endDate?: Date): Promise<(Payment & { driver: Driver & { user: User }; owner: Owner & { user: User }; activity: WashoutActivity })[]>;

  // Statistics operations
  getDriverStats(driverId: string, days: number): Promise<{
    totalEarnings: number;
    totalWashouts: number;
    avgPerWashout: number;
    tipTotalCents?: number;
    transferTotalCents?: number;
    pendingTransferCents?: number;
    paidTransferCents?: number;
    transferCount?: number;
  }>;
  getOwnerStats(ownerId: string, days: number): Promise<{
    totalPayments: number;
    totalWashouts: number;
    totalDrivers: number;
    platformFeesOwedCents?: number;
    platformFeesPaidCents?: number;
    driverTipTotalCents?: number;
    ownerChargeTotalCents?: number;
    paidBillingCount?: number;
    needsReviewBillingCount?: number;
    unpaidBillingCount?: number;
  }>;
  getSystemStats(days: number): Promise<{
    totalEarnings: number;
    totalWashouts: number;
    totalDrivers: number;
    totalOwners: number;
    platformRevenueCents?: number | null;
    ownerChargeTotalCents?: number | null;
    driverTipTotalCents?: number | null;
    driverTransferTotalCents?: number | null;
    unpaidReceivablesCents?: number | null;
    paidReceivablesCents?: number | null;
    needsReviewCents?: number | null;
    platformWashoutRevenue: number | null;
    platformWashoutRevenueCents: number | null;
    platformWashoutPaidRevenue: number | null;
    platformWashoutPaidRevenueCents: number | null;
    platformFeeRecordCount: number | null;
    approvedWashouts: number | null;
    driverTipTotal: number | null;
    billedWashouts: number | null;
    pendingWashouts: number | null;
    failedWashouts: number | null;
    refundedWashouts: number | null;
    disputedWashouts: number | null;
    subscriptionRevenue: number;
    activeLicenses: number;
    licenseRenewals: number;
    washoutRevenueError?: string;
    lotteryMetricsError?: string;
  }>;

  // Notification operations
  createNotification(notification: InsertNotification): Promise<Notification>;
  getNotificationsByUser(userId: string): Promise<Notification[]>;
  getUnreadNotificationsByUser(userId: string): Promise<Notification[]>;
  markNotificationAsRead(notificationId: string, userId: string): Promise<Notification | undefined>;
  markAllNotificationsAsRead(userId: string): Promise<void>;
  clearNotificationsByType(userId: string, type: string): Promise<void>;

  // Legal terms operations
  upsertTermsVersion(version: InsertTermsVersion): Promise<TermsVersion>;
  getTermsAcceptancesForUser(userId: string): Promise<TermsAcceptance[]>;
  createTermsAcceptance(acceptance: InsertTermsAcceptance): Promise<TermsAcceptance>;

  // Message operations
  createMessage(message: InsertMessage): Promise<Message>;
  getAllMessages(): Promise<(Message & { user: User })[]>;
  getMessageById(messageId: string): Promise<(Message & { user: User }) | undefined>;
  updateMessageStatus(messageId: string, status: string): Promise<Message>;

  // Webhook event operations for idempotency
  createWebhookEvent(eventId: string, eventType: string, accountId?: string): Promise<boolean>;
  isWebhookEventProcessed(eventId: string): Promise<boolean>;
  markWebhookEventProcessed(eventId: string): Promise<void>;
  markWebhookEventFailed(eventId: string, errorMessage: string): Promise<void>;

  // Owner funding sources operations (replacing payment methods)
  createOwnerFundingSource(fundingSource: InsertOwnerFundingSource): Promise<OwnerFundingSource>;
  getOwnerFundingSources(ownerId: string): Promise<OwnerFundingSource[]>;
  getOwnerPaymentMethods(ownerId: string): Promise<OwnerFundingSource[]>;
  createOwnerPaymentMethod(fundingSource: InsertOwnerFundingSource): Promise<OwnerFundingSource>;
  getOwnerFundingSourceById(id: string): Promise<OwnerFundingSource | undefined>;
  deleteOwnerFundingSource(id: string): Promise<void>;
  deleteOwnerPaymentMethod(id: string): Promise<void>;
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
  getBillingBatches(startDate?: Date, endDate?: Date): Promise<(BillingBatch & { owner: Owner & { user: User } })[]>;
  getBillingBatchesByOwner(ownerId: string, startDate?: Date, endDate?: Date): Promise<BillingBatch[]>;
  getBillingBatchesByStatus(status: string): Promise<(BillingBatch & { owner: Owner & { user: User } })[]>;
  updateBillingBatchStatus(batchId: string, status: string, stripePaymentIntentId?: string, failureReason?: string): Promise<BillingBatch>;
  updateBillingBatchProcessing(batchId: string, totalAmount: string, totalFees: string, paymentCount: number, stripePaymentIntentId?: string): Promise<BillingBatch>;
  updateBillingBatchMetadata(batchId: string, metadataPatch: Record<string, unknown>): Promise<BillingBatch>;
  markBillingBatchCompleted(batchId: string): Promise<BillingBatch>;
  getPendingPaymentsForBatch(ownerId: string, businessDate: string): Promise<(Payment & { activity: WashoutActivity; driver: Driver & { user: User } })[]>;
  getPendingPaymentsForOwnerBilling(ownerId: string, startDate?: Date, endDate?: Date): Promise<(Payment & { activity: WashoutActivity; driver: Driver & { user: User } })[]>;
  assignPaymentsToBatch(paymentIds: string[], batchId: string, businessDate: string): Promise<void>;
  getPaymentsByBatchId(batchId: string): Promise<(Payment & { activity: WashoutActivity; driver: Driver & { user: User } })[]>;
  
  // Daily batch processing methods
  processDailyBatches(cutoffDate?: string): Promise<{ processed: number; failed: number; errors: string[] }>;
  movePendingToAvailable(driverId: string, amount: string, sourceTransactionId: string, batchId: string): Promise<{ wallet: DriverWallet; transaction: WalletTransaction }>;
  getOwnerBillingSettings(ownerId: string): Promise<{ billingCadence: string; billingCutoffTime: string; billingTimezone: string; billingDayOfWeek: number } | undefined>;
  updateOwnerBillingSettings(ownerId: string, settings: { billingCadence?: string; billingCutoffTime?: string; billingTimezone?: string; billingDayOfWeek?: number }): Promise<Owner>;
  getAllOwnersBillingSettings(): Promise<{ ownerId: string; companyName: string; username: string; billingCadence: string; billingCutoffTime: string; billingTimezone: string; billingDayOfWeek: number }[]>;

  // Pending washout payment operations (hourly batch processing)
  createPendingWashoutPayment(payment: InsertPendingWashoutPayment): Promise<PendingWashoutPayment>;
  getPendingWashoutPaymentsByOwner(ownerId: string): Promise<(PendingWashoutPayment & { activity: WashoutActivity; driver: Driver & { user: User }; location: WashoutLocation })[]>;
  getPendingWashoutPaymentsByStatus(status: string): Promise<(PendingWashoutPayment & { activity: WashoutActivity; driver: Driver & { user: User }; owner: Owner & { user: User } })[]>;
  updatePendingPaymentStatus(paymentId: string, status: string, batchId?: string, failureReason?: string): Promise<PendingWashoutPayment>;
  getAllPendingWashoutPayments(): Promise<(PendingWashoutPayment & { activity: WashoutActivity; driver: Driver & { user: User }; owner: Owner & { user: User }; location: WashoutLocation })[]>;

  // Washout payment batch operations (hourly batch processing)
  createWashoutPaymentBatch(batch: InsertWashoutPaymentBatch): Promise<WashoutPaymentBatch>;
  getWashoutPaymentBatch(id: string): Promise<WashoutPaymentBatch | undefined>;
  getWashoutPaymentBatchesByOwner(ownerId: string): Promise<WashoutPaymentBatch[]>;
  getWashoutPaymentBatchesByStatus(status: string): Promise<(WashoutPaymentBatch & { owner: Owner & { user: User } })[]>;
  updateWashoutPaymentBatchStatus(batchId: string, status: string, stripePaymentIntentId?: string, failureReason?: string): Promise<WashoutPaymentBatch>;
  markWashoutPaymentBatchCompleted(batchId: string): Promise<WashoutPaymentBatch>;
  getPendingPaymentsForOwner(ownerId: string): Promise<(PendingWashoutPayment & { activity: WashoutActivity; driver: Driver & { user: User } })[]>;

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

  // Feature flag operations
  getFeatureFlag(flagKey: string): Promise<any | undefined>;
  getAllFeatureFlags(): Promise<any[]>;
  createFeatureFlag(flag: { flagKey: string; enabled: boolean; description?: string; allowedRoles?: string[] }): Promise<any>;
  updateFeatureFlag(flagKey: string, enabled: boolean): Promise<any>;
  updateFeatureFlagRoles(flagKey: string, allowedRoles: string[]): Promise<any>;
  getFeatureFlagOverride(flagKey: string, userId: string): Promise<any | undefined>;
  setFeatureFlagOverride(flagKey: string, userId: string, enabled: boolean): Promise<any>;
  checkFeatureFlag(flagKey: string, userId: string, userRole: string): Promise<boolean>;

  // System settings operations
  getSystemSettings(): Promise<SystemSettings>;
  updateSystemSettings(settings: UpdateSystemSettings, updatedBy: string): Promise<SystemSettings>;

  // Identity document operations (for Stripe fraud prevention)
  createIdentityDocument(doc: any): Promise<any>;
  getIdentityDocumentByUserId(userId: string): Promise<any | undefined>;
  getIdentityDocument(docId: string): Promise<any | undefined>;
  updateIdentityDocument(docId: string, updates: any): Promise<any>;

  // Custom billing model operations (feature flag per owner)
  updateOwnerCustomBillingModel(ownerId: string, settings: { useCustomBillingModel?: boolean; customWashoutRate?: string | null }): Promise<Owner>;
  getOwnersWithCustomBillingModel(): Promise<(Owner & { user: User })[]>;

  // Driver Rewards Program prize catalog operations
  getPrizeCatalog(): Promise<PrizeCatalog[]>;
  getPrizeCatalogById(id: string): Promise<PrizeCatalog | undefined>;
  createPrizeCatalogItem(item: InsertPrizeCatalog): Promise<PrizeCatalog>;
  updatePrizeCatalogItem(id: string, updates: UpdatePrizeCatalog): Promise<PrizeCatalog>;
  updatePrizeCatalogItemStatus(id: string, isActive: boolean): Promise<PrizeCatalog>;
  adjustPrizeCatalogInventory(
    prizeCatalogId: string,
    delta: number,
    options: {
      adjustmentType?: PrizeCatalogInventoryAdjustmentType;
      reason: string;
      referenceType?: string | null;
      referenceId?: string | null;
      metadata?: Record<string, unknown> | null;
      createdBy: string;
    }
  ): Promise<{ catalog: PrizeCatalog; adjustment: PrizeCatalogInventoryAdjustment }>;
  getPrizeCatalogInventoryHistory(prizeCatalogId: string): Promise<PrizeCatalogInventoryAdjustment[]>;
  getPrizeCatalogInventorySummary(prizeCatalogId: string): Promise<{
    catalog: PrizeCatalog;
    availableQuantity: number;
    isLowInventory: boolean;
    lastAdjustment: PrizeCatalogInventoryAdjustment | null;
  }>;

  // Lottery drawings operations
  createLotteryDrawing(data: any): Promise<any>;
  getLotteryDrawings(): Promise<any[]>;
  getLotteryDrawingByMonthYear(month: number, year: number): Promise<any | undefined>;
  createLotteryDrawingWinner(winner: InsertLotteryDrawingWinner): Promise<LotteryDrawingWinner>;
  getLotteryDrawingWinners(drawingId: string): Promise<any[]>;
  getLotteryDrawingHistoryWithWinners(): Promise<any[]>;
  getDriverLotteryHistory(driverId: string): Promise<any[]>;
  getDriverLotteryFulfillments(driverId: string): Promise<any[]>;
  createLotteryDrawingFulfillments(
    fulfillments: InsertLotteryDrawingFulfillment[],
    tx?: any,
  ): Promise<LotteryDrawingFulfillment[]>;
  createLotteryDrawingFulfillmentHistory(
    history: InsertLotteryDrawingFulfillmentHistory[],
    tx?: any,
  ): Promise<LotteryDrawingFulfillmentHistory[]>;
  getLotteryDrawingFulfillments(filters?: { status?: string; month?: number; year?: number }): Promise<any[]>;
  getLotteryDrawingFulfillmentById(id: string): Promise<any | undefined>;
  getLotteryDrawingFulfillmentHistory(fulfillmentId: string): Promise<LotteryDrawingFulfillmentHistory[]>;
  updateLotteryDrawingFulfillmentStatus(id: string, status: string, actorUserId: string): Promise<any>;
  updateLotteryDrawingFulfillmentNotes(id: string, notes: string, actorUserId: string): Promise<any>;
  updateLotteryDrawingFulfillmentTracking(id: string, tracking: { trackingNumber?: string | null; trackingReference?: string | null }, actorUserId: string): Promise<any>;
  getPendingLotteryDrawings(): Promise<any[]>;
  markLotteryPrizeDelivered(drawingId: string, place: 'first' | 'second' | 'third'): Promise<any>;
  updateLotteryDrawingNotificationSummary(drawingId: string, updates: {
    winnerNotificationCount?: number;
    winnerNotificationsSentAt?: Date | null;
    participantNotificationCount?: number;
    participantNotificationsSentAt?: Date | null;
  }): Promise<any>;

  // Driver lottery entries operations
  createDriverLotteryEntry(entry: { driverId: string; activityId: string; ownerId: string; entriesEarned?: number }): Promise<any>;
  getDriverLotteryEntries(driverId: string): Promise<any[]>;
  getDriverLotteryEntriesWithDetails(driverId: string, month?: number, year?: number): Promise<any[]>;
  getDriverLotteryEntryCount(driverId: string): Promise<number>;
  getAllDriverLotteryEntries(startDate?: Date, endDate?: Date): Promise<any[]>;
  getDriverLotteryEntryTotals(month?: number, year?: number): Promise<{ driverId: string; driverName: string; totalEntries: number; payoutPreference: string | null; payoutPreferenceNote: string | null }[]>;
  getDriverLotteryEntryByActivity(activityId: string): Promise<any | undefined>;
  archiveLotteryMonth(month: number, year: number): Promise<number>;
  getLotteryMonths(): Promise<{ month: number; year: number; isArchived: boolean; totalEntries: number }[]>;
  createLotteryNotificationOnce(notification: InsertLotteryNotification): Promise<{ record: LotteryNotification; created: boolean }>;
  getLotteryNotificationsByDrawing(drawingId: string): Promise<LotteryNotification[]>;
  getLotteryNotificationSummary(drawingId: string): Promise<{
    winnerNotificationCount: number;
    participantNotificationCount: number;
    winnerNotificationsSentAt: Date | null;
    participantNotificationsSentAt: Date | null;
  } | undefined>;
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

  async updateUserStripeInfo(userId: string, stripeData: { stripeConnectAccountId?: string; stripeCustomerId?: string }): Promise<User> {
    const [user] = await db
      .update(users)
      .set({ 
        ...stripeData,
        updatedAt: new Date() 
      })
      .where(eq(users.id, userId))
      .returning();
    return user;
  }

  async reconcileDriverStripeAccountIds(params: {
    userId: string;
    driverId: string;
    expectedAccountId: string;
  }): Promise<{
    conflict: boolean;
    updatedFields: Array<"users.stripeConnectAccountId" | "drivers.stripeConnectAccountId" | "drivers.connectedAccountId">;
    currentValues?: Record<string, string | null>;
  }> {
    const expectedAccountId = params.expectedAccountId.trim();
    if (!expectedAccountId) {
      throw new Error("Expected Stripe account ID is required for reconciliation");
    }

    return await db.transaction(async (tx) => {
      const [currentUser] = await tx
        .select({ id: users.id, stripeConnectAccountId: users.stripeConnectAccountId })
        .from(users)
        .where(eq(users.id, params.userId))
        .for("update");
      const [currentDriver] = await tx
        .select({
          id: drivers.id,
          userId: drivers.userId,
          stripeConnectAccountId: drivers.stripeConnectAccountId,
          connectedAccountId: drivers.connectedAccountId,
        })
        .from(drivers)
        .where(eq(drivers.id, params.driverId))
        .for("update");

      if (!currentUser || !currentDriver || currentDriver.userId !== currentUser.id) {
        return { conflict: true, updatedFields: [] };
      }

      const currentValues = {
        "users.stripeConnectAccountId": currentUser.stripeConnectAccountId,
        "drivers.stripeConnectAccountId": currentDriver.stripeConnectAccountId,
        "drivers.connectedAccountId": currentDriver.connectedAccountId,
      };
      const normalizedValues = Object.values(currentValues)
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value));
      if (normalizedValues.some((value) => value !== expectedAccountId)) {
        return { conflict: true, updatedFields: [], currentValues };
      }

      const updatedFields: Array<"users.stripeConnectAccountId" | "drivers.stripeConnectAccountId" | "drivers.connectedAccountId"> = [];
      if (!currentUser.stripeConnectAccountId?.trim()) {
        await tx
          .update(users)
          .set({ stripeConnectAccountId: expectedAccountId, updatedAt: new Date() })
          .where(eq(users.id, currentUser.id));
        updatedFields.push("users.stripeConnectAccountId");
      }

      const driverUpdates: { stripeConnectAccountId?: string; connectedAccountId?: string; updatedAt?: Date } = {};
      if (!currentDriver.stripeConnectAccountId?.trim()) {
        driverUpdates.stripeConnectAccountId = expectedAccountId;
        updatedFields.push("drivers.stripeConnectAccountId");
      }
      if (!currentDriver.connectedAccountId?.trim()) {
        driverUpdates.connectedAccountId = expectedAccountId;
        updatedFields.push("drivers.connectedAccountId");
      }
      if (driverUpdates.stripeConnectAccountId || driverUpdates.connectedAccountId) {
        driverUpdates.updatedAt = new Date();
        await tx.update(drivers).set(driverUpdates).where(eq(drivers.id, currentDriver.id));
      }

      return { conflict: false, updatedFields, currentValues };
    });
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

  async getDriverByUserId(userId: string): Promise<Driver | undefined> {
    return await this.getDriver(userId);
  }

  async getDriverById(id: string): Promise<Driver | undefined> {
    const [driver] = await db.select().from(drivers).where(eq(drivers.id, id));
    return driver;
  }

  async getDriverByConnectedAccountId(connectedAccountId: string): Promise<Driver | undefined> {
    const [driver] = await db
      .select()
      .from(drivers)
      .where(or(
        eq(drivers.connectedAccountId, connectedAccountId),
        eq(drivers.stripeConnectAccountId, connectedAccountId)
      ));
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

  async updateDriverWallet(driverId: string, availableBalance?: string, pendingBalance?: string): Promise<DriverWallet> {
    const [existing] = await db.select().from(driverWallets).where(eq(driverWallets.driverId, driverId));
    const [updated] = await db
      .insert(driverWallets)
      .values({
        driverId,
        availableBalance: availableBalance ?? existing?.availableBalance ?? "0.00",
        pendingBalance: pendingBalance ?? existing?.pendingBalance ?? "0.00",
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: driverWallets.driverId,
        set: {
          availableBalance: availableBalance ?? existing?.availableBalance ?? "0.00",
          pendingBalance: pendingBalance ?? existing?.pendingBalance ?? "0.00",
          updatedAt: new Date(),
        },
      })
      .returning();
    return updated;
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
        bankName: drivers.bankName,
        accountHolderName: drivers.accountHolderName,
        routingNumber: drivers.routingNumber,
        accountNumber: drivers.accountNumber,
        venmoHandle: drivers.venmoHandle,
        zelleEmail: drivers.zelleEmail,
        paymentMethod: drivers.paymentMethod,
        stripeTreasuryAccountId: drivers.stripeTreasuryAccountId,
        stripeTreasuryAccountLast4: drivers.stripeTreasuryAccountLast4,
        stripeIssuingCardholderId: drivers.stripeIssuingCardholderId,
        hasAgreedToTerms: drivers.hasAgreedToTerms,
        termsAgreedAt: drivers.termsAgreedAt,
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
          street: users.street,
          city: users.city,
          state: users.state,
          zip: users.zip,
          paymentMethod: users.paymentMethod,
          paymentFrequency: users.paymentFrequency,
          stripeConnectAccountId: users.stripeConnectAccountId,
          stripeCustomerId: users.stripeCustomerId,
          isActive: users.isActive,
          createdAt: users.createdAt,
          updatedAt: users.updatedAt,
        },
      })
      .from(drivers)
      .innerJoin(users, eq(drivers.userId, users.id));
    return result as any;
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

  async updateOwner(ownerId: string, ownerData: Partial<Owner>): Promise<Owner> {
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

  async updateOwnerSubscription(
    ownerId: string,
    subscriptionStatus: string,
    pastDueDate?: Date | null,
    subscriptionEndsAt?: Date | null,
    gracePeriodStartDate?: Date | null,
    lastReminderSent?: Date | null
  ): Promise<Owner> {
    const updateData: Partial<Owner> = {
      subscriptionStatus: subscriptionStatus as Owner["subscriptionStatus"],
      updatedAt: new Date(),
    };

    if (subscriptionEndsAt !== undefined) {
      updateData.subscriptionEndsAt = subscriptionEndsAt;
    }

    if (subscriptionStatus === "past_due") {
      const now = new Date();
      updateData.pastDueDate = pastDueDate ?? now;
      updateData.gracePeriodStartDate = gracePeriodStartDate ?? now;
      if (lastReminderSent !== undefined) {
        updateData.lastReminderSent = lastReminderSent;
      }
    } else if (subscriptionStatus === "active") {
      updateData.pastDueDate = pastDueDate ?? null;
      updateData.gracePeriodStartDate = gracePeriodStartDate ?? null;
      updateData.lastReminderSent = lastReminderSent ?? null;
    } else {
      if (pastDueDate !== undefined) {
        updateData.pastDueDate = pastDueDate;
      }
      if (gracePeriodStartDate !== undefined) {
        updateData.gracePeriodStartDate = gracePeriodStartDate;
      }
      if (lastReminderSent !== undefined) {
        updateData.lastReminderSent = lastReminderSent;
      }
    }

    const [owner] = await db
      .update(owners)
      .set(updateData)
      .where(eq(owners.id, ownerId))
      .returning();
    return owner;
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
    return owner ? { balance: owner.balance, status: owner.status || 'pending_verification' } : undefined;
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
    const walletConditions = [eq(ownerWalletTransactions.ownerId, ownerId)];
    if (startDate) {
      walletConditions.push(gte(ownerWalletTransactions.createdAt, startDate));
    }
    if (endDate) {
      walletConditions.push(lte(ownerWalletTransactions.createdAt, endDate));
    }

    const walletTransactions = await db
      .select()
      .from(ownerWalletTransactions)
      .where(and(...walletConditions))
      .orderBy(desc(ownerWalletTransactions.createdAt));

    const billingBatches = await this.getBillingBatchesByOwner(ownerId, startDate, endDate);
    const completedBillingTransactions = billingBatches
      .filter((batch) => batch.status === "completed")
      .map((batch) => ({
        id: `billing-batch:${batch.id}`,
        ownerId,
        type: "billing_batch",
        amount: batch.totalAmount,
        balanceBefore: "0.00",
        balanceAfter: "0.00",
        description: `Completed billing batch ${batch.businessDate} (${batch.paymentCount} washouts)`,
        status: batch.status,
        paymentId: null,
        batchId: batch.id,
        columnTransferId: batch.stripeBatchTransferId ?? null,
        columnCounterpartyId: null,
        stripeTransferId: batch.stripeBatchTransferId ?? null,
        stripePaymentIntentId: batch.stripePaymentIntentId ?? null,
        externalTransactionId: batch.stripePaymentIntentId ?? batch.stripeBatchTransferId ?? null,
        washoutCount: batch.paymentCount,
        businessDate: batch.businessDate,
        createdAt: batch.completedAt ?? batch.createdAt,
      }));

    return [
      ...walletTransactions,
      ...completedBillingTransactions,
    ].sort((left: any, right: any) => {
      const leftTime = new Date(left.createdAt || 0).getTime();
      const rightTime = new Date(right.createdAt || 0).getTime();
      return rightTime - leftTime;
    });
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

  async updateOwnerCustomPlatformFee(ownerId: string, customFee: string | null): Promise<Owner> {
    const [owner] = await db
      .update(owners)
      .set({ 
        customPlatformFee: customFee,
        updatedAt: new Date()
      })
      .where(eq(owners.id, ownerId))
      .returning();
    return owner;
  }

  async updateOwnerCustomBillingSettings(ownerId: string, useCustomBillingModel: boolean, customWashoutRate: string | null): Promise<Owner> {
    const [owner] = await db
      .update(owners)
      .set({ 
        useCustomBillingModel,
        customWashoutRate,
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
        // Stripe integration fields
        stripeConnectAccountId: owners.stripeConnectAccountId,
        stripeCustomerId: owners.stripeCustomerId,
        stripePaymentIntentId: owners.stripePaymentIntentId,
        stripeTreasuryAccountId: owners.stripeTreasuryAccountId,
        walletBalance: owners.walletBalance,
        walletStatus: owners.walletStatus,
        lowBalanceThreshold: owners.lowBalanceThreshold,
        autoTopupEnabled: owners.autoTopupEnabled,
        autoTopupAmount: owners.autoTopupAmount,
        billingCadence: owners.billingCadence,
        billingCutoffTime: owners.billingCutoffTime,
        billingTimezone: owners.billingTimezone,
        subscriptionPlan: owners.subscriptionPlan,
        subscriptionStatus: owners.subscriptionStatus,
        subscriptionFeeCents: owners.subscriptionFeeCents,
        feeAnchorDay: owners.feeAnchorDay,
        lastFeeBillingDate: owners.lastFeeBillingDate,
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
          passwordHash: users.passwordHash,
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
          stripeConnectAccountId: users.stripeConnectAccountId,
          stripeCustomerId: users.stripeCustomerId,
          isActive: users.isActive,
          createdAt: users.createdAt,
          updatedAt: users.updatedAt,
        },
      })
      .from(owners)
      .innerJoin(users, eq(owners.userId, users.id));
    return result as any;
  }

  async getAllAdmins(): Promise<User[]> {
    return await db
      .select({
        id: users.id,
        username: users.username,
        email: users.email,
        passwordHash: users.passwordHash,
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
        stripeConnectAccountId: users.stripeConnectAccountId,
        stripeCustomerId: users.stripeCustomerId,
        isActive: users.isActive,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      })
      .from(users)
      .where(or(eq(users.role, 'admin'), eq(users.role, 'super_admin')))
      .orderBy(desc(users.createdAt)) as any;
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
    if (location.latitude === undefined || location.longitude === undefined) {
      throw new Error("Latitude and longitude are required to create a washout location");
    }

    const locationValues: typeof washoutLocations.$inferInsert = {
      ...location,
      latitude: location.latitude,
      longitude: location.longitude,
    };
    const [newLocation] = await db.insert(washoutLocations).values(locationValues).returning();
    return newLocation;
  }

  async getWashoutLocation(id: string): Promise<WashoutLocation | undefined> {
    const [location] = await db.select().from(washoutLocations).where(eq(washoutLocations.id, id));
    return location;
  }

  async getLocationsByOwner(ownerId: string): Promise<WashoutLocation[]> {
    const rows = await db
      .select({
        id: washoutLocations.id,
        ownerId: washoutLocations.ownerId,
        name: washoutLocations.name,
        street: washoutLocations.street,
        city: washoutLocations.city,
        state: washoutLocations.state,
        zip: washoutLocations.zip,
        address: washoutLocations.address,
        latitude: washoutLocations.latitude,
        longitude: washoutLocations.longitude,
        rate: washoutLocations.rate,
        monthlyFeeCents: washoutLocations.monthlyFeeCents,
        isActive: washoutLocations.isActive,
        isVisible: washoutLocations.isVisible,
        description: washoutLocations.description,
        amenities: washoutLocations.amenities,
        operatingHours: washoutLocations.operatingHours,
        permitUrls: washoutLocations.permitUrls,
        createdAt: washoutLocations.createdAt,
        updatedAt: washoutLocations.updatedAt,
      })
      .from(washoutLocations)
      .where(eq(washoutLocations.ownerId, ownerId))
      .orderBy(desc(washoutLocations.createdAt));

    return rows as WashoutLocation[];
  }

  async getActiveLocations(): Promise<(WashoutLocation & { owner: Owner & { user: User } })[]> {
    const results = await db
      .select()
      .from(washoutLocations)
      .innerJoin(owners, eq(washoutLocations.ownerId, owners.id))
      .innerJoin(users, eq(owners.userId, users.id))
      .orderBy(washoutLocations.name);

    const mappedLocations: any[] = [];

    for (const row of results as any[]) {
      const location = row.washout_locations as WashoutLocation;
      const owner = row.owners as Owner;
      const user = row.users as User;
      const visibilityState = resolveDriverLocationVisibilityState(location, owner);

      if (!visibilityState.visibleToDrivers) {
        console.info(
          "[driver-locations] excluded location",
          JSON.stringify({
            locationId: location.id,
            ownerId: owner?.id ?? null,
            ownerMembershipStatus: visibilityState.ownerMembershipStatus ?? null,
            isActive: location.isActive,
            isVisible: location.isVisible,
            reason: visibilityState.exclusionReason ?? "unknown",
          }),
        );
        continue;
      }

      mappedLocations.push({
        ...location,
        owner: {
          ...owner,
          user,
        },
      });
    }

    return mappedLocations;
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
    const mappedPayments: any = results.map((row: any) => ({
      ...row.washout_locations,
      owner: (() => {
        const membershipState = resolveOwnerMembershipState(row.owners);
        return {
          ...row.owners,
          user: row.users,
          membershipStatus: membershipState.membershipStatus,
          dashboardAccessAllowed: membershipState.dashboardAccessAllowed,
        };
      })(),
    })) as any;
    return mappedPayments;
  }

  // Admin pricing operations - batch update all locations to new rate
  async batchUpdateAllLocationRates(newRate: string): Promise<{ updated: number; locations: WashoutLocation[] }> {
    const updatedLocations = await db
      .update(washoutLocations)
      .set({ rate: newRate, updatedAt: new Date() })
      .returning();
    
    return { updated: updatedLocations.length, locations: updatedLocations };
  }

  // Admin pricing operations - update pending activity amounts
  async batchUpdatePendingActivityAmounts(newAmount: string): Promise<{ updated: number; activities: WashoutActivity[] }> {
    const updatedActivities = await db
      .update(washoutActivities)
      .set({ amount: newAmount, updatedAt: new Date() })
      .where(eq(washoutActivities.status, 'pending'))
      .returning();
    
    return { updated: updatedActivities.length, activities: updatedActivities };
  }

  // Get all pending activities for admin review
  async getPendingActivities(): Promise<WashoutActivity[]> {
    return await db
      .select()
      .from(washoutActivities)
      .where(eq(washoutActivities.status, 'pending'))
      .orderBy(desc(washoutActivities.createdAt));
  }

  // Rubble service: Material operations
  async getAllMaterials(): Promise<Material[]> {
    return await db
      .select()
      .from(materials)
      .orderBy(materials.displayName);
  }

  async getMaterialBySlug(slug: string): Promise<Material | undefined> {
    const [material] = await db
      .select()
      .from(materials)
      .where(eq(materials.slug, slug));
    return material;
  }

  async createMaterial(material: InsertMaterial): Promise<Material> {
    const [newMaterial] = await db
      .insert(materials)
      .values(material)
      .returning();
    return newMaterial;
  }

  // Rubble service: Location material intent operations
  async getLocationMaterialIntents(locationId: string): Promise<LocationMaterialIntent[]> {
    return await db
      .select()
      .from(locationMaterialIntents)
      .where(eq(locationMaterialIntents.locationId, locationId))
      .orderBy(locationMaterialIntents.createdAt);
  }

  async createLocationMaterialIntent(intent: InsertLocationMaterialIntent): Promise<LocationMaterialIntent> {
    const [newIntent] = await db
      .insert(locationMaterialIntents)
      .values(intent)
      .returning();
    return newIntent;
  }

  async updateLocationMaterialIntent(intentId: string, updates: Partial<InsertLocationMaterialIntent>): Promise<LocationMaterialIntent> {
    const [updatedIntent] = await db
      .update(locationMaterialIntents)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(locationMaterialIntents.id, intentId))
      .returning();
    return updatedIntent;
  }

  async deleteLocationMaterialIntent(intentId: string): Promise<boolean> {
    const result = await db
      .delete(locationMaterialIntents)
      .where(eq(locationMaterialIntents.id, intentId))
      .returning();
    return result.length > 0;
  }

  async deleteAllLocationMaterialIntents(locationId: string): Promise<void> {
    await db
      .delete(locationMaterialIntents)
      .where(eq(locationMaterialIntents.locationId, locationId));
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
      .leftJoin(financialHistoryRecords, sql`${financialHistoryRecords.recordType} = 'washout_activity' AND ${financialHistoryRecords.recordId} = ${washoutActivities.id} AND ${financialHistoryRecords.classification} = 'historical_test_data'`)
      .where(and(...conditions, isNull(financialHistoryRecords.id)))
      .orderBy(desc(washoutActivities.checkInTime));

    const mappedPayments: any = results.map((row: any) => ({
      ...row.washout_activities,
      location: row.washout_locations
    })) as any;
    return mappedPayments;
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

    const mappedActivities: any = results.map((row: any) => ({
      ...row.washout_activities,
      driver: {
        ...row.drivers,
        user: row.users
      },
      location: row.washout_locations
    })) as any;
    return mappedActivities;
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
      .leftJoin(financialHistoryRecords, sql`${financialHistoryRecords.recordType} = 'washout_activity' AND ${financialHistoryRecords.recordId} = ${washoutActivities.id} AND ${financialHistoryRecords.classification} = 'historical_test_data'`)
      .where(and(...conditions, isNull(financialHistoryRecords.id)))
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

  async getRecentWashoutPhotoDuplicateCandidates(since: Date): Promise<PhotoFingerprintCandidate[]> {
    try {
      const recentPhotos = await db
        .select()
        .from(washoutPhotos)
        .where(
          and(
            gte(washoutPhotos.uploadedAt, since),
            isNotNull(washoutPhotos.imageFingerprint),
          ),
        )
        .orderBy(desc(washoutPhotos.uploadedAt));

      const candidates: PhotoFingerprintCandidate[] = [];

      for (const photo of recentPhotos) {
        const [activity, driver, location] = await Promise.all([
          this.getWashoutActivity(photo.activityId),
          this.getDriverById(photo.driverId),
          this.getWashoutLocation(photo.locationId),
        ]);

        if (!activity || !driver || !location) {
          continue;
        }

        const user = await this.getUserById(driver.userId);
        if (!user) {
          continue;
        }

        candidates.push({
          photoId: photo.id,
          activityId: photo.activityId,
          driverId: photo.driverId,
          driverName: `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.username,
          locationId: photo.locationId,
          locationName: location.name,
          priorUploadedAt: new Date(photo.uploadedAt as unknown as string | number | Date).toISOString(),
          imageFingerprint: String(photo.imageFingerprint ?? ""),
        });
      }

      return candidates;
    } catch (error) {
      console.error("Duplicate photo candidate lookup failed; returning empty candidate list:", {
        ...summarizeDatabaseError(error, {
          phase: "photo-duplicate-candidate-lookup",
          table: "washout_photos",
        }),
        query: typeof error === "object" && error && "query" in error ? (error as { query?: string }).query : undefined,
        params: typeof error === "object" && error && "params" in error ? (error as { params?: unknown[] }).params : undefined,
        stack: error instanceof Error ? error.stack : undefined,
        since: since.toISOString(),
      });
      return [];
    }
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
      let newActivity: WashoutActivity;
      try {
        [newActivity] = await tx.insert(washoutActivities).values(activity).returning();
      } catch (error) {
        console.error("Create-with-photos activity insert failed:", summarizeDatabaseError(error, {
          phase: "activity-insert",
          table: "washout_activities",
        }));
        throw error;
      }
      
      // Create photos with the activity ID
      const photoValues = photos.map(photo => ({
        ...photo,
        activityId: newActivity.id
      }));
      
      let newPhotos: WashoutPhoto[];
      try {
        newPhotos = await tx.insert(washoutPhotos).values(photoValues).returning();
      } catch (error) {
        console.error("Create-with-photos photo insert failed:", summarizeDatabaseError(error, {
          phase: "photo-insert",
          table: "washout_photos",
        }));
        throw error;
      }
      
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
      // Compare-and-set prevents concurrent owner/manual/auto verification from
      // producing duplicate downstream side effects.
      .where(and(
        eq(washoutActivities.id, activityId),
        eq(washoutActivities.status, "pending"),
      ))
      .returning();

    if (!activity) {
      const error = new Error("Washout activity is no longer pending") as Error & { code?: string };
      error.code = "WASHOUT_ACTIVITY_NOT_PENDING";
      throw error;
    }

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

  async updateWashoutActivityStatus(activityId: string, status: string): Promise<WashoutActivity> {
    const [activity] = await db
      .update(washoutActivities)
      .set({ 
        status: status as WashoutActivity["status"],
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
      .leftJoin(financialHistoryRecords, sql`${financialHistoryRecords.recordType} = 'washout_activity' AND ${financialHistoryRecords.recordId} = ${washoutActivities.id} AND ${financialHistoryRecords.classification} = 'historical_test_data'`)
      .where(and(eq(washoutActivities.driverId, driverId), isNull(financialHistoryRecords.id)))
      .orderBy(desc(washoutActivities.checkInTime))
      .limit(limit);
    
    const mappedPayments: any = results.map((row: any) => ({
      ...row.washout_activities,
      location: row.washout_locations
    })) as any;
    return mappedPayments;
    return mappedPayments;
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
      .select({
        activityId: washoutActivities.id,
        activityDriverId: washoutActivities.driverId,
        activityLocationId: washoutActivities.locationId,
        activityCheckInTime: washoutActivities.checkInTime,
        activityStatus: washoutActivities.status,
        activityAmount: washoutActivities.amount,
        activityFeeCentsPlatform: washoutActivities.feeCentsPlatform,
        activityNotes: washoutActivities.notes,
        activityPhotoUrls: washoutActivities.photoUrls,
        locationId: washoutLocations.id,
        locationOwnerId: washoutLocations.ownerId,
        locationName: washoutLocations.name,
        locationStreet: washoutLocations.street,
        locationCity: washoutLocations.city,
        locationState: washoutLocations.state,
        locationZip: washoutLocations.zip,
        locationRate: washoutLocations.rate,
        locationDriverRate: washoutLocations.rate,
        locationMonthlyFeeCents: washoutLocations.monthlyFeeCents,
        driverId: drivers.id,
        driverUserId: drivers.userId,
        driverTruckNumber: drivers.truckNumber,
        driverLicenseNumber: drivers.licenseNumber,
        driverEmployerName: drivers.employerName,
        driverEmployerStreet: drivers.employerStreet,
        driverEmployerCity: drivers.employerCity,
        driverEmployerState: drivers.employerState,
        driverEmployerZip: drivers.employerZip,
        driverEmployerPhone: drivers.employerPhone,
        driverPhone: users.phone,
        driverFirstName: users.firstName,
        driverLastName: users.lastName,
        driverEmail: users.email,
      })
      .from(washoutActivities)
      .innerJoin(washoutLocations, eq(washoutActivities.locationId, washoutLocations.id))
      .innerJoin(drivers, eq(washoutActivities.driverId, drivers.id))
      .innerJoin(users, eq(drivers.userId, users.id))
      .leftJoin(financialHistoryRecords, sql`${financialHistoryRecords.recordType} = 'washout_activity' AND ${financialHistoryRecords.recordId} = ${washoutActivities.id} AND ${financialHistoryRecords.classification} = 'historical_test_data'`)
      .where(and(...conditions, isNull(financialHistoryRecords.id)))
      .orderBy(desc(washoutActivities.checkInTime));
    
    const mappedBatches: any = results.map((row: any) => ({
      id: row.activityId,
      driverId: row.activityDriverId,
      locationId: row.activityLocationId,
      checkInTime: row.activityCheckInTime,
      status: row.activityStatus,
      amount: row.activityAmount,
      feeCentsPlatform: row.activityFeeCentsPlatform,
      notes: row.activityNotes,
      photoUrls: row.activityPhotoUrls,
      createdAt: row.activityCheckInTime,
      updatedAt: row.activityCheckInTime,
      location: {
        id: row.locationId,
        ownerId: row.locationOwnerId,
        name: row.locationName,
        street: row.locationStreet,
        city: row.locationCity,
        state: row.locationState,
        zip: row.locationZip,
        rate: row.locationRate,
        driverIncentiveTip: normalizeMoneyToCents(row.locationDriverRate, "dollars"),
        monthlyFeeCents: row.locationMonthlyFeeCents,
      },
      driver: {
        id: row.driverId,
        userId: row.driverUserId,
        truckNumber: row.driverTruckNumber,
        licenseNumber: row.driverLicenseNumber,
        employerName: row.driverEmployerName,
        employerStreet: row.driverEmployerStreet,
        employerCity: row.driverEmployerCity,
        employerState: row.driverEmployerState,
        employerZip: row.driverEmployerZip,
        employerPhone: row.driverEmployerPhone,
        user: {
          id: row.driverUserId,
          username: row.driverEmail,
          email: row.driverEmail,
          passwordHash: "",
          firstName: row.driverFirstName,
          lastName: row.driverLastName,
          role: "driver",
          phone: row.driverPhone,
          street: "",
          city: "",
          state: "",
          zip: "",
          paymentMethod: "ach",
          paymentFrequency: "weekly",
          stripeConnectAccountId: null,
          stripeCustomerId: null,
          stripeConnectBalance: null,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          profileImageUrl: null,
        } as User,
      },
    }));
    return mappedBatches as any;
  }

  // ============= AUTO-APPROVAL OPERATIONS =============
  
  async getExpiredPendingActivities(hoursOld: number = 72): Promise<(WashoutActivity & { location: WashoutLocation; driver: Driver & { user: User } })[]> {
    const cutoffDate = new Date();
    cutoffDate.setHours(cutoffDate.getHours() - hoursOld);
    
    console.log(`🔍 Looking for pending activities older than ${hoursOld} hours (before ${cutoffDate.toISOString()})`);
    
    const results = await db
      .select()
      .from(washoutActivities)
      .innerJoin(washoutLocations, eq(washoutActivities.locationId, washoutLocations.id))
      .innerJoin(drivers, eq(washoutActivities.driverId, drivers.id))
      .innerJoin(users, eq(drivers.userId, users.id))
      .where(
        and(
          eq(washoutActivities.status, 'pending'),
          lte(washoutActivities.createdAt, cutoffDate)
        )
      )
      .orderBy(washoutActivities.createdAt);
    
    console.log(`📋 Found ${results.length} expired pending activities`);
    
    const mappedBatches: any = results.map((row: any) => ({
      ...row.washout_activities,
      location: row.washout_locations,
      driver: {
        ...row.drivers,
        user: row.users
      }
    })) as any;
    return mappedBatches;
  }

  async autoApproveExpiredActivities(hoursOld: number = 72): Promise<{ approved: number; failed: number; errors: string[] }> {
    const results = {
      approved: 0,
      failed: 0,
      errors: [] as string[]
    };

    console.log(`\n🤖 ===== AUTO-APPROVAL: Processing activities older than ${hoursOld} hours =====`);
    
    // Get all expired pending activities
    const expiredActivities = await this.getExpiredPendingActivities(hoursOld);
    
    if (expiredActivities.length === 0) {
      console.log(`✅ No expired pending activities found`);
      return results;
    }

    console.log(`📋 Found ${expiredActivities.length} activities to auto-approve`);

    for (const activity of expiredActivities) {
      try {
        console.log(`\n🔄 Auto-approving activity ${activity.id}:`);
        console.log(`   - Service: ${activity.serviceType || 'washout'}`);
        console.log(`   - Driver: ${activity.driver.user.firstName} ${activity.driver.user.lastName}`);
        console.log(`   - Location: ${activity.location.name}`);
        console.log(`   - Created: ${activity.createdAt}`);
        console.log(`   - Amount: $${activity.amount}`);

        // Get the location's owner for payment creation
        const location = await this.getWashoutLocation(activity.locationId);
        if (!location) {
          throw new Error(`Location ${activity.locationId} not found`);
        }

        const owner = await this.getOwnerById(location.ownerId);
        if (!owner) {
          throw new Error(`Owner for location ${activity.locationId} not found`);
        }

        // Auto-verify the activity with system as verifier
        const verifiedActivity = await this.verifyWashoutActivity(activity.id, 'system-auto-approval');

        try {
          const lotteryFlag = await this.getFeatureFlag('lottery_enabled');
          const lotteryEnabled = lotteryFlag?.enabled ?? false;
          if (lotteryEnabled && activity.serviceType !== 'rubble_dropoff') {
            const lotteryEntry = await this.createDriverLotteryEntry({
              driverId: activity.driverId,
              activityId: activity.id,
              ownerId: owner.id,
              entriesEarned: 1,
            });
            if ((lotteryEntry as any)?.outcome === "historical_reward_suppressed") {
              console.log(`🎰 Lottery entry suppressed for historical auto-approved washout ${activity.id}`);
            } else {
              console.log(`🎰 Lottery entry created for auto-approved washout ${activity.id}, entry ID: ${lotteryEntry.id}`);
            }
          } else {
            console.log(`🎰 Lottery skipped for auto-approved washout ${activity.id}`, {
              lotteryEnabled,
              serviceType: activity.serviceType,
            });
          }
        } catch (lotteryError: any) {
          console.error(`❌ Failed to create lottery entry for auto-approved washout ${activity.id}:`, lotteryError);
        }
        
        // Auto-approval is operational only. A future canonical obligation flow must
        // establish frozen amounts and idempotency before any financial record exists.
        console.log(`   ✅ Auto-approved operational activity`, {
          ownerId: owner.id,
          activityId: activity.id,
          driverId: activity.driverId,
          status: verifiedActivity.status,
        });
        results.approved++;
        
      } catch (error: any) {
        console.error(`   ❌ Failed to auto-approve activity ${activity.id}:`, error.message);
        results.errors.push(`Activity ${activity.id}: ${error.message}`);
        results.failed++;
      }
    }

    console.log(`\n🏁 Auto-approval complete: ${results.approved} approved, ${results.failed} failed`);
    return results;
  }

  // Payment operations
  async createPayment(payment: InsertPayment & { tipAmountCents?: number | string | null }): Promise<Payment> {
    // This historical generic writer cannot establish a canonical obligation.
    // It is permanently fenced so an active flow cannot create an unclassified
    // `payments` row by bypassing the dedicated canonical service.
    assertLegacyFinancialExecutionRetired("facility_collection", "storage.createPayment");
    const {
      tipAmountCents,
      deferReason: _deferReason,
      deferredAt: _deferredAt,
      ...paymentData
    } = payment as any;
    if (paymentData.washoutServiceFee === undefined) {
      paymentData.washoutServiceFee = (getPaymentWashoutServiceFeeCents({
        amount: paymentData.amount,
        processingFee: paymentData.processingFee,
        tipAmountCents,
      }) / 100).toFixed(2);
    }
    const [newPayment] = await db.insert(payments).values(paymentData).returning();
    return newPayment;
  }

  async getPaymentById(paymentId: string): Promise<Payment | undefined> {
    const [row] = await db
      .select({
        paymentId: payments.id,
        paymentDriverId: payments.driverId,
        paymentOwnerId: payments.ownerId,
        paymentActivityId: payments.activityId,
        paymentAmount: payments.amount,
        paymentProcessingFee: payments.processingFee,
        paymentDriverTipCents: sql<number>`ROUND(CAST(${payments.amount} AS DECIMAL) * 100)`,
        paymentStripePaymentIntentId: payments.stripePaymentIntentId,
        paymentStripeTransferId: payments.stripeTransferId,
        paymentStripeChargeId: payments.stripeChargeId,
        paymentStatus: payments.status,
        paymentRefundedAt: payments.refundedAt,
        paymentRefundAmount: payments.refundAmount,
        paymentRefundReason: payments.refundReason,
        paymentBatchId: payments.batchId,
        paymentPaidAt: payments.paidAt,
        paymentCreatedAt: payments.createdAt,
        paymentUpdatedAt: payments.updatedAt,
        activityLocationId: washoutActivities.locationId,
        activityAmount: washoutActivities.amount,
        locationDriverRate: washoutLocations.rate,
      })
      .from(payments)
      .leftJoin(washoutActivities, eq(payments.activityId, washoutActivities.id))
      .leftJoin(washoutLocations, eq(washoutActivities.locationId, washoutLocations.id))
      .where(eq(payments.id, paymentId));

    if (!row) return undefined;

    return {
      id: row.paymentId,
      driverId: row.paymentDriverId,
      ownerId: row.paymentOwnerId,
      activityId: row.paymentActivityId,
      amount: row.paymentAmount,
      processingFee: row.paymentProcessingFee,
      platformFee: row.paymentProcessingFee,
      washoutServiceFee: (getPaymentWashoutServiceFeeCents({ amount: row.paymentAmount }) / 100).toFixed(2),
      tipAmountCents: getPaymentDriverIncentiveCents({ amount: row.paymentAmount }),
      stripePaymentIntentId: row.paymentStripePaymentIntentId,
      stripeTransferId: row.paymentStripeTransferId,
      stripeChargeId: row.paymentStripeChargeId,
      status: row.paymentStatus,
      refundedAt: row.paymentRefundedAt,
      refundAmount: row.paymentRefundAmount,
      refundReason: row.paymentRefundReason,
      batchId: row.paymentBatchId,
      deferReason: null,
      deferredAt: null,
      businessDate: row.paymentCreatedAt ? row.paymentCreatedAt.toISOString().split('T')[0] : null,
      paidAt: row.paymentPaidAt,
      createdAt: row.paymentCreatedAt,
      updatedAt: row.paymentUpdatedAt,
    } as Payment;
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
      .select({
        paymentId: payments.id,
        paymentDriverId: payments.driverId,
        paymentOwnerId: payments.ownerId,
        paymentActivityId: payments.activityId,
        paymentAmount: payments.amount,
        paymentProcessingFee: payments.processingFee,
        paymentDriverTipCents: sql<number>`ROUND(CAST(${payments.amount} AS DECIMAL) * 100)`,
        paymentStripePaymentIntentId: payments.stripePaymentIntentId,
        paymentStripeTransferId: payments.stripeTransferId,
        paymentStripeChargeId: payments.stripeChargeId,
        paymentStatus: payments.status,
        paymentRefundedAt: payments.refundedAt,
        paymentRefundAmount: payments.refundAmount,
        paymentRefundReason: payments.refundReason,
        paymentBatchId: payments.batchId,
        paymentPaidAt: payments.paidAt,
        paymentCreatedAt: payments.createdAt,
        paymentUpdatedAt: payments.updatedAt,
        activityId: washoutActivities.id,
        activityDriverId: washoutActivities.driverId,
        activityLocationId: washoutActivities.locationId,
        activityCheckInTime: washoutActivities.checkInTime,
        activityCheckOutTime: washoutActivities.checkOutTime,
        activityStatus: washoutActivities.status,
        activityAmount: washoutActivities.amount,
        activityNotes: washoutActivities.notes,
        locationId: washoutLocations.id,
        locationOwnerId: washoutLocations.ownerId,
        locationName: washoutLocations.name,
        locationStreet: washoutLocations.street,
        locationCity: washoutLocations.city,
        locationState: washoutLocations.state,
        locationZip: washoutLocations.zip,
        locationAddress: washoutLocations.address,
        locationLatitude: washoutLocations.latitude,
        locationLongitude: washoutLocations.longitude,
        locationRate: washoutLocations.rate,
        locationDriverRate: washoutLocations.rate,
        locationMonthlyFeeCents: washoutLocations.monthlyFeeCents,
        locationIsActive: washoutLocations.isActive,
        locationIsVisible: washoutLocations.isVisible,
        locationCreatedAt: washoutLocations.createdAt,
        locationUpdatedAt: washoutLocations.updatedAt,
      })
      .from(payments)
      .innerJoin(washoutActivities, eq(payments.activityId, washoutActivities.id))
      .innerJoin(washoutLocations, eq(washoutActivities.locationId, washoutLocations.id))
      .leftJoin(financialHistoryRecords, sql`${financialHistoryRecords.recordType} = 'washout_activity' AND ${financialHistoryRecords.recordId} = ${washoutActivities.id} AND ${financialHistoryRecords.classification} = 'historical_test_data'`)
      .where(and(...conditions, isNull(financialHistoryRecords.id)))
      .orderBy(desc(payments.createdAt));

    const mappedBatches: any = results.map((row: any) => ({
      id: row.paymentId,
      driverId: row.paymentDriverId,
      ownerId: row.paymentOwnerId,
      activityId: row.paymentActivityId,
      amount: row.paymentAmount,
      processingFee: row.paymentProcessingFee,
      platformFee: row.paymentProcessingFee,
      washoutServiceFee: (getPaymentWashoutServiceFeeCents({ amount: row.paymentAmount }) / 100).toFixed(2),
      tipAmountCents: getPaymentDriverIncentiveCents({ amount: row.paymentAmount }),
      stripePaymentIntentId: row.paymentStripePaymentIntentId,
      stripeTransferId: row.paymentStripeTransferId,
      stripeChargeId: row.paymentStripeChargeId,
      status: row.paymentStatus,
      refundedAt: row.paymentRefundedAt,
      refundAmount: row.paymentRefundAmount,
      refundReason: row.paymentRefundReason,
      batchId: row.paymentBatchId,
      deferReason: null,
      deferredAt: null,
      businessDate: row.paymentCreatedAt ? row.paymentCreatedAt.toISOString().split('T')[0] : null,
      paidAt: row.paymentPaidAt,
      createdAt: row.paymentCreatedAt,
      updatedAt: row.paymentUpdatedAt,
      activity: {
        id: row.activityId,
        driverId: row.activityDriverId,
        locationId: row.activityLocationId,
        checkInTime: row.activityCheckInTime,
        checkOutTime: row.activityCheckOutTime,
        status: row.activityStatus,
        amount: row.activityAmount,
        notes: row.activityNotes,
        location: row.locationId ? {
          id: row.locationId,
          ownerId: row.locationOwnerId,
          name: row.locationName,
          street: row.locationStreet,
          city: row.locationCity,
          state: row.locationState,
          zip: row.locationZip,
          address: row.locationAddress,
          latitude: row.locationLatitude,
          longitude: row.locationLongitude,
          rate: row.locationRate,
          driverIncentiveTip: normalizeMoneyToCents(row.locationDriverRate, "dollars"),
          monthlyFeeCents: row.locationMonthlyFeeCents,
          isActive: row.locationIsActive,
          isVisible: row.locationIsVisible,
          createdAt: row.locationCreatedAt,
          updatedAt: row.locationUpdatedAt,
        } : undefined
      }
    })) as any;
    return mappedBatches;
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
      .select({
        paymentId: payments.id,
        paymentDriverId: payments.driverId,
        paymentOwnerId: payments.ownerId,
        paymentActivityId: payments.activityId,
        paymentAmount: payments.amount,
        paymentProcessingFee: payments.processingFee,
        paymentDriverTipCents: sql<number>`ROUND(CAST(${payments.amount} AS DECIMAL) * 100)`,
        paymentStripePaymentIntentId: payments.stripePaymentIntentId,
        paymentStripeTransferId: payments.stripeTransferId,
        paymentStripeChargeId: payments.stripeChargeId,
        paymentStatus: payments.status,
        paymentRefundedAt: payments.refundedAt,
        paymentRefundAmount: payments.refundAmount,
        paymentRefundReason: payments.refundReason,
        paymentBatchId: payments.batchId,
        paymentPaidAt: payments.paidAt,
        paymentCreatedAt: payments.createdAt,
        paymentUpdatedAt: payments.updatedAt,
        activityId: washoutActivities.id,
        activityDriverId: washoutActivities.driverId,
        activityLocationId: washoutActivities.locationId,
        activityCheckInTime: washoutActivities.checkInTime,
        activityCheckOutTime: washoutActivities.checkOutTime,
        activityStatus: washoutActivities.status,
        activityAmount: washoutActivities.amount,
        activityNotes: washoutActivities.notes,
        driverId: drivers.id,
        driverUserId: drivers.userId,
        driverTruckNumber: drivers.truckNumber,
        driverFirstName: users.firstName,
        driverLastName: users.lastName,
        driverEmail: users.email,
        driverPhone: users.phone,
        locationId: washoutLocations.id,
        locationOwnerId: washoutLocations.ownerId,
        locationName: washoutLocations.name,
        locationStreet: washoutLocations.street,
        locationCity: washoutLocations.city,
        locationState: washoutLocations.state,
        locationZip: washoutLocations.zip,
        locationAddress: washoutLocations.address,
        locationLatitude: washoutLocations.latitude,
        locationLongitude: washoutLocations.longitude,
        locationRate: washoutLocations.rate,
        locationDriverRate: washoutLocations.rate,
        locationMonthlyFeeCents: washoutLocations.monthlyFeeCents,
        locationIsActive: washoutLocations.isActive,
        locationIsVisible: washoutLocations.isVisible,
        locationCreatedAt: washoutLocations.createdAt,
        locationUpdatedAt: washoutLocations.updatedAt,
      })
      .from(payments)
      .innerJoin(washoutActivities, eq(payments.activityId, washoutActivities.id))
      .innerJoin(drivers, eq(washoutActivities.driverId, drivers.id))
      .innerJoin(users, eq(drivers.userId, users.id))
      .innerJoin(washoutLocations, eq(washoutActivities.locationId, washoutLocations.id))
      .leftJoin(financialHistoryRecords, sql`${financialHistoryRecords.recordType} = 'washout_activity' AND ${financialHistoryRecords.recordId} = ${washoutActivities.id} AND ${financialHistoryRecords.classification} = 'historical_test_data'`)
      .where(and(...conditions, isNull(financialHistoryRecords.id)))
      .orderBy(desc(payments.createdAt));

    const mappedBatches: any = results.map((row: any) => ({
      id: row.paymentId,
      driverId: row.paymentDriverId,
      ownerId: row.paymentOwnerId,
      activityId: row.paymentActivityId,
      amount: row.paymentAmount,
      processingFee: row.paymentProcessingFee,
      platformFee: row.paymentProcessingFee,
      tipAmountCents: getPaymentDriverIncentiveCents({ amount: row.paymentAmount }),
      stripePaymentIntentId: row.paymentStripePaymentIntentId,
      stripeTransferId: row.paymentStripeTransferId,
      stripeChargeId: row.paymentStripeChargeId,
      status: row.paymentStatus,
      refundedAt: row.paymentRefundedAt,
      refundAmount: row.paymentRefundAmount,
      refundReason: row.paymentRefundReason,
      batchId: row.paymentBatchId,
      deferReason: null,
      deferredAt: null,
      paidAt: row.paymentPaidAt,
      createdAt: row.paymentCreatedAt,
      updatedAt: row.paymentUpdatedAt,
      activity: {
        id: row.activityId,
        driverId: row.activityDriverId,
        locationId: row.activityLocationId,
        checkInTime: row.activityCheckInTime,
        checkOutTime: row.activityCheckOutTime,
        status: row.activityStatus,
        amount: row.activityAmount,
        notes: row.activityNotes,
        location: row.locationId ? {
          id: row.locationId,
          ownerId: row.locationOwnerId,
          name: row.locationName,
          street: row.locationStreet,
          city: row.locationCity,
          state: row.locationState,
          zip: row.locationZip,
          address: row.locationAddress,
          latitude: row.locationLatitude,
          longitude: row.locationLongitude,
          rate: row.locationRate,
          driverIncentiveTip: normalizeMoneyToCents(row.locationDriverRate, "dollars"),
          monthlyFeeCents: row.locationMonthlyFeeCents,
          isActive: row.locationIsActive,
          isVisible: row.locationIsVisible,
          createdAt: row.locationCreatedAt,
          updatedAt: row.locationUpdatedAt,
        } : undefined,
        driver: {
          id: row.driverId,
          userId: row.driverUserId,
          truckNumber: row.driverTruckNumber,
          user: {
            id: row.driverUserId,
            username: row.driverEmail,
            email: row.driverEmail,
            passwordHash: "",
            firstName: row.driverFirstName,
            lastName: row.driverLastName,
            role: "driver",
            phone: row.driverPhone,
            street: "",
            city: "",
            state: "",
            zip: "",
            paymentMethod: "ach",
            paymentFrequency: "weekly",
            stripeConnectAccountId: null,
            stripeCustomerId: null,
            stripeConnectBalance: null,
            isActive: true,
            createdAt: row.paymentCreatedAt,
            updatedAt: row.paymentUpdatedAt,
            profileImageUrl: null,
          } as User,
        },
      }
    })) as any;
    return mappedBatches;
  }

  async getPaymentsAwaitingDriverStripe(): Promise<(Payment & { activity: WashoutActivity; driver: Driver & { user: User }; owner: Owner & { user: User }; location: WashoutLocation })[]> {
    const driverUsers = alias(users, "payment_driver_users");
    const ownerUsers = alias(users, "payment_owner_users");

    const rows = await db
      .select({
        paymentId: payments.id,
        paymentDriverId: payments.driverId,
        paymentOwnerId: payments.ownerId,
        paymentActivityId: payments.activityId,
        paymentAmount: payments.amount,
        paymentProcessingFee: payments.processingFee,
        paymentDriverTipCents: sql<number>`ROUND(CAST(${payments.amount} AS DECIMAL) * 100)`,
        paymentStripePaymentIntentId: payments.stripePaymentIntentId,
        paymentStripeTransferId: payments.stripeTransferId,
        paymentStripeChargeId: payments.stripeChargeId,
        paymentStatus: payments.status,
        paymentRefundedAt: payments.refundedAt,
        paymentRefundAmount: payments.refundAmount,
        paymentRefundReason: payments.refundReason,
        paymentBatchId: payments.batchId,
        paymentPaidAt: payments.paidAt,
        paymentCreatedAt: payments.createdAt,
        paymentUpdatedAt: payments.updatedAt,
        activityId: washoutActivities.id,
        activityLocationId: washoutActivities.locationId,
        activityStatus: washoutActivities.status,
        activityCheckInTime: washoutActivities.checkInTime,
        activityCheckOutTime: washoutActivities.checkOutTime,
        activityNotes: washoutActivities.notes,
        driverId: drivers.id,
        driverUserId: driverUsers.id,
        driverUsername: driverUsers.username,
        driverEmail: driverUsers.email,
        driverFirstName: driverUsers.firstName,
        driverLastName: driverUsers.lastName,
        driverPhone: driverUsers.phone,
        driverTruckNumber: drivers.truckNumber,
        driverLicenseNumber: drivers.licenseNumber,
        ownerId: owners.id,
        ownerUserId: ownerUsers.id,
        ownerUsername: ownerUsers.username,
        ownerEmail: ownerUsers.email,
        ownerFirstName: ownerUsers.firstName,
        ownerLastName: ownerUsers.lastName,
        ownerPhone: ownerUsers.phone,
        ownerCompanyName: owners.companyName,
        locationId: washoutLocations.id,
        locationOwnerId: washoutLocations.ownerId,
        locationName: washoutLocations.name,
        locationStreet: washoutLocations.street,
        locationCity: washoutLocations.city,
        locationState: washoutLocations.state,
        locationZip: washoutLocations.zip,
        locationAddress: washoutLocations.address,
        locationLatitude: washoutLocations.latitude,
        locationLongitude: washoutLocations.longitude,
        locationRate: washoutLocations.rate,
        locationDriverRate: washoutLocations.rate,
        locationMonthlyFeeCents: washoutLocations.monthlyFeeCents,
        locationIsActive: washoutLocations.isActive,
        locationIsVisible: washoutLocations.isVisible,
        locationCreatedAt: washoutLocations.createdAt,
        locationUpdatedAt: washoutLocations.updatedAt,
      })
      .from(payments)
      .leftJoin(washoutActivities, eq(payments.activityId, washoutActivities.id))
      .leftJoin(drivers, eq(payments.driverId, drivers.id))
      .leftJoin(driverUsers, eq(drivers.userId, driverUsers.id))
      .leftJoin(owners, eq(payments.ownerId, owners.id))
      .leftJoin(ownerUsers, eq(owners.userId, ownerUsers.id))
      .leftJoin(washoutLocations, eq(washoutActivities.locationId, washoutLocations.id))
      .where(and(
        inArray(payments.status, ["awaiting_driver_stripe", "pending_driver_onboarding"]),
      ));

    return rows.map((row: any) => ({
      id: row.paymentId,
      driverId: row.paymentDriverId,
      ownerId: row.paymentOwnerId,
      activityId: row.paymentActivityId,
      amount: row.paymentAmount,
      processingFee: row.paymentProcessingFee,
      platformFee: row.paymentProcessingFee,
      tipAmountCents: getPaymentDriverIncentiveCents({ amount: row.paymentAmount }),
      deferReason: null,
      deferredAt: null,
      stripePaymentIntentId: row.paymentStripePaymentIntentId,
      stripeTransferId: row.paymentStripeTransferId,
      stripeChargeId: row.paymentStripeChargeId,
      status: row.paymentStatus,
      refundedAt: row.paymentRefundedAt,
      refundAmount: row.paymentRefundAmount,
      refundReason: row.paymentRefundReason,
      batchId: row.paymentBatchId,
      paidAt: row.paymentPaidAt,
      createdAt: row.paymentCreatedAt,
      updatedAt: row.paymentUpdatedAt,
      activity: row.activityId ? {
        id: row.activityId,
        locationId: row.activityLocationId,
        status: row.activityStatus,
        checkInTime: row.activityCheckInTime,
        checkOutTime: row.activityCheckOutTime,
        notes: row.activityNotes,
        location: row.locationId ? {
          id: row.locationId,
          ownerId: row.locationOwnerId,
          name: row.locationName,
          street: row.locationStreet,
          city: row.locationCity,
          state: row.locationState,
          zip: row.locationZip,
          address: row.locationAddress,
          latitude: row.locationLatitude,
          longitude: row.locationLongitude,
          rate: row.locationRate,
          driverIncentiveTip: normalizeMoneyToCents(row.locationDriverRate, "dollars"),
          monthlyFeeCents: row.locationMonthlyFeeCents,
          isActive: row.locationIsActive,
          isVisible: row.locationIsVisible,
          createdAt: row.locationCreatedAt,
          updatedAt: row.locationUpdatedAt,
        } : undefined,
      } : undefined,
      driver: row.driverId ? {
        id: row.driverId,
        userId: row.driverUserId,
        truckNumber: row.driverTruckNumber,
        licenseNumber: row.driverLicenseNumber,
        user: row.driverUserId ? {
          id: row.driverUserId,
          username: row.driverUsername,
          email: row.driverEmail,
          firstName: row.driverFirstName,
          lastName: row.driverLastName,
          phone: row.driverPhone,
        } : undefined,
      } : undefined,
      owner: row.ownerId ? {
        id: row.ownerId,
        userId: row.ownerUserId,
        companyName: row.ownerCompanyName,
        user: row.ownerUserId ? {
          id: row.ownerUserId,
          username: row.ownerUsername,
          email: row.ownerEmail,
          firstName: row.ownerFirstName,
          lastName: row.ownerLastName,
          phone: row.ownerPhone,
        } : undefined,
      } : undefined,
      driverUser: row.driverUserId ? {
        id: row.driverUserId,
        username: row.driverUsername,
        email: row.driverEmail,
        firstName: row.driverFirstName,
        lastName: row.driverLastName,
        phone: row.driverPhone,
      } : undefined,
      ownerUser: row.ownerUserId ? {
        id: row.ownerUserId,
        username: row.ownerUsername,
        email: row.ownerEmail,
        firstName: row.ownerFirstName,
        lastName: row.ownerLastName,
        phone: row.ownerPhone,
      } : undefined,
      location: row.locationId ? {
        id: row.locationId,
        ownerId: row.locationOwnerId,
        name: row.locationName,
        street: row.locationStreet,
        city: row.locationCity,
        state: row.locationState,
        zip: row.locationZip,
        address: row.locationAddress,
        latitude: row.locationLatitude,
        longitude: row.locationLongitude,
        rate: row.locationRate,
        driverIncentiveTip: normalizeMoneyToCents(row.locationDriverRate, "dollars"),
        monthlyFeeCents: row.locationMonthlyFeeCents,
        isActive: row.locationIsActive,
        isVisible: row.locationIsVisible,
        createdAt: row.locationCreatedAt,
        updatedAt: row.locationUpdatedAt,
      } : undefined,
    })) as any;
  }

  async getPaymentsAwaitingDriverStripeByDriver(driverId: string): Promise<(Payment & { activity: WashoutActivity & { location: WashoutLocation }; owner: Owner & { user: User } })[]> {
    const ownerUsers = alias(users, "payment_owner_users");

    const rows = await db
      .select({
        paymentId: payments.id,
        paymentDriverId: payments.driverId,
        paymentOwnerId: payments.ownerId,
        paymentActivityId: payments.activityId,
        paymentAmount: payments.amount,
        paymentProcessingFee: payments.processingFee,
        paymentDriverTipCents: sql<number>`ROUND(CAST(${payments.amount} AS DECIMAL) * 100)`,
        paymentStripePaymentIntentId: payments.stripePaymentIntentId,
        paymentStripeTransferId: payments.stripeTransferId,
        paymentStripeChargeId: payments.stripeChargeId,
        paymentStatus: payments.status,
        paymentRefundedAt: payments.refundedAt,
        paymentRefundAmount: payments.refundAmount,
        paymentRefundReason: payments.refundReason,
        paymentBatchId: payments.batchId,
        paymentPaidAt: payments.paidAt,
        paymentCreatedAt: payments.createdAt,
        paymentUpdatedAt: payments.updatedAt,
        activityId: washoutActivities.id,
        activityLocationId: washoutActivities.locationId,
        activityStatus: washoutActivities.status,
        activityCheckInTime: washoutActivities.checkInTime,
        activityCheckOutTime: washoutActivities.checkOutTime,
        activityNotes: washoutActivities.notes,
        ownerId: owners.id,
        ownerUserId: ownerUsers.id,
        ownerUsername: ownerUsers.username,
        ownerEmail: ownerUsers.email,
        ownerFirstName: ownerUsers.firstName,
        ownerLastName: ownerUsers.lastName,
        ownerPhone: ownerUsers.phone,
        ownerCompanyName: owners.companyName,
        locationId: washoutLocations.id,
        locationOwnerId: washoutLocations.ownerId,
        locationName: washoutLocations.name,
        locationStreet: washoutLocations.street,
        locationCity: washoutLocations.city,
        locationState: washoutLocations.state,
        locationZip: washoutLocations.zip,
        locationAddress: washoutLocations.address,
        locationLatitude: washoutLocations.latitude,
        locationLongitude: washoutLocations.longitude,
        locationRate: washoutLocations.rate,
        locationMonthlyFeeCents: washoutLocations.monthlyFeeCents,
        locationIsActive: washoutLocations.isActive,
        locationIsVisible: washoutLocations.isVisible,
        locationCreatedAt: washoutLocations.createdAt,
        locationUpdatedAt: washoutLocations.updatedAt,
      })
      .from(payments)
      .leftJoin(washoutActivities, eq(payments.activityId, washoutActivities.id))
      .leftJoin(owners, eq(payments.ownerId, owners.id))
      .leftJoin(ownerUsers, eq(owners.userId, ownerUsers.id))
      .leftJoin(washoutLocations, eq(washoutActivities.locationId, washoutLocations.id))
      .leftJoin(financialHistoryRecords, sql`${financialHistoryRecords.recordType} = 'washout_activity' AND ${financialHistoryRecords.recordId} = ${washoutActivities.id} AND ${financialHistoryRecords.classification} = 'historical_test_data'`)
      .where(
        and(
          eq(payments.driverId, driverId),
          inArray(payments.status, ["awaiting_driver_stripe", "pending_driver_onboarding"]),
          isNull(financialHistoryRecords.id),
        ),
      );

    return rows.map((row: any) => ({
      id: row.paymentId,
      driverId: row.paymentDriverId,
      ownerId: row.paymentOwnerId,
      activityId: row.paymentActivityId,
      amount: row.paymentAmount,
      processingFee: row.paymentProcessingFee,
      platformFee: row.paymentProcessingFee,
      tipAmountCents: getPaymentDriverIncentiveCents({ amount: row.paymentAmount }),
      deferReason: null,
      deferredAt: null,
      stripePaymentIntentId: row.paymentStripePaymentIntentId,
      stripeTransferId: row.paymentStripeTransferId,
      stripeChargeId: row.paymentStripeChargeId,
      status: row.paymentStatus,
      refundedAt: row.paymentRefundedAt,
      refundAmount: row.paymentRefundAmount,
      refundReason: row.paymentRefundReason,
      batchId: row.paymentBatchId,
      paidAt: row.paymentPaidAt,
      createdAt: row.paymentCreatedAt,
      updatedAt: row.paymentUpdatedAt,
      activity: row.activityId ? {
        id: row.activityId,
        locationId: row.activityLocationId,
        status: row.activityStatus,
        checkInTime: row.activityCheckInTime,
        checkOutTime: row.activityCheckOutTime,
        notes: row.activityNotes,
        location: row.locationId ? {
          id: row.locationId,
          ownerId: row.locationOwnerId,
          name: row.locationName,
          street: row.locationStreet,
          city: row.locationCity,
          state: row.locationState,
          zip: row.locationZip,
          address: row.locationAddress,
          latitude: row.locationLatitude,
          longitude: row.locationLongitude,
          rate: row.locationRate,
          driverIncentiveTip: normalizeMoneyToCents(row.locationDriverRate, "dollars"),
          monthlyFeeCents: row.locationMonthlyFeeCents,
          isActive: row.locationIsActive,
          isVisible: row.locationIsVisible,
          createdAt: row.locationCreatedAt,
          updatedAt: row.locationUpdatedAt,
        } : undefined,
      } : undefined,
      owner: row.ownerId ? {
        id: row.ownerId,
        userId: row.ownerUserId,
        companyName: row.ownerCompanyName,
        user: row.ownerUserId ? {
          id: row.ownerUserId,
          username: row.ownerUsername,
          email: row.ownerEmail,
          firstName: row.ownerFirstName,
          lastName: row.ownerLastName,
          phone: row.ownerPhone,
        } : undefined,
      } : undefined,
      ownerUser: row.ownerUserId ? {
        id: row.ownerUserId,
        username: row.ownerUsername,
        email: row.ownerEmail,
        firstName: row.ownerFirstName,
        lastName: row.ownerLastName,
        phone: row.ownerPhone,
      } : undefined,
      location: row.locationId ? {
        id: row.locationId,
        ownerId: row.locationOwnerId,
        name: row.locationName,
        street: row.locationStreet,
        city: row.locationCity,
        state: row.locationState,
        zip: row.locationZip,
        address: row.locationAddress,
        latitude: row.locationLatitude,
        longitude: row.locationLongitude,
        rate: row.locationRate,
        driverIncentiveTip: normalizeMoneyToCents(row.locationDriverRate, "dollars"),
        monthlyFeeCents: row.locationMonthlyFeeCents,
        isActive: row.locationIsActive,
        isVisible: row.locationIsVisible,
        createdAt: row.locationCreatedAt,
        updatedAt: row.locationUpdatedAt,
      } : undefined,
    })) as any;
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

    const ownerUsers = alias(users, "payment_owner_users");

    const results = await db
      .select({
        paymentId: payments.id,
        paymentDriverId: payments.driverId,
        paymentOwnerId: payments.ownerId,
        paymentActivityId: payments.activityId,
        paymentAmount: payments.amount,
        paymentProcessingFee: payments.processingFee,
        paymentDriverTipCents: sql<number>`ROUND(CAST(${payments.amount} AS DECIMAL) * 100)`,
        paymentStripePaymentIntentId: payments.stripePaymentIntentId,
        paymentStripeTransferId: payments.stripeTransferId,
        paymentStripeChargeId: payments.stripeChargeId,
        paymentStatus: payments.status,
        paymentRefundedAt: payments.refundedAt,
        paymentRefundAmount: payments.refundAmount,
        paymentRefundReason: payments.refundReason,
        paymentBatchId: payments.batchId,
        paymentPaidAt: payments.paidAt,
        paymentCreatedAt: payments.createdAt,
        paymentUpdatedAt: payments.updatedAt,
        driverId: drivers.id,
        driverUserId: drivers.userId,
        driverTruckNumber: drivers.truckNumber,
        driverFirstName: users.firstName,
        driverLastName: users.lastName,
        driverEmail: users.email,
        driverPhone: users.phone,
        ownerId: owners.id,
        ownerUserId: owners.userId,
        ownerCompanyName: owners.companyName,
        ownerFirstName: ownerUsers.firstName,
        ownerLastName: ownerUsers.lastName,
        ownerEmail: ownerUsers.email,
        ownerPhone: ownerUsers.phone,
        locationId: washoutLocations.id,
        locationOwnerId: washoutLocations.ownerId,
        locationName: washoutLocations.name,
        locationStreet: washoutLocations.street,
        locationCity: washoutLocations.city,
        locationState: washoutLocations.state,
        locationZip: washoutLocations.zip,
        locationAddress: washoutLocations.address,
        locationLatitude: washoutLocations.latitude,
        locationLongitude: washoutLocations.longitude,
        locationRate: washoutLocations.rate,
        locationDriverRate: washoutLocations.rate,
        locationMonthlyFeeCents: washoutLocations.monthlyFeeCents,
        locationIsActive: washoutLocations.isActive,
        locationIsVisible: washoutLocations.isVisible,
        locationCreatedAt: washoutLocations.createdAt,
        locationUpdatedAt: washoutLocations.updatedAt,
        activityId: washoutActivities.id,
        activityLocationId: washoutActivities.locationId,
        activityCheckInTime: washoutActivities.checkInTime,
        activityStatus: washoutActivities.status,
        activityAmount: washoutActivities.amount,
        activityNotes: washoutActivities.notes,
      })
      .from(payments)
      .innerJoin(drivers, eq(payments.driverId, drivers.id))
      .innerJoin(users, eq(drivers.userId, users.id))
      .innerJoin(owners, eq(payments.ownerId, owners.id))
      .innerJoin(ownerUsers, eq(owners.userId, ownerUsers.id))
      .innerJoin(washoutActivities, eq(payments.activityId, washoutActivities.id))
      .innerJoin(washoutLocations, eq(washoutActivities.locationId, washoutLocations.id))
      .leftJoin(financialHistoryRecords, sql`${financialHistoryRecords.recordType} = 'washout_activity' AND ${financialHistoryRecords.recordId} = ${washoutActivities.id} AND ${financialHistoryRecords.classification} = 'historical_test_data'`)
      .where(and(...conditions, isNull(financialHistoryRecords.id)))
      .orderBy(desc(payments.createdAt));

    const mappedPayments: any = results.map((row: any) => ({
      id: row.paymentId,
      driverId: row.paymentDriverId,
      ownerId: row.paymentOwnerId,
      activityId: row.paymentActivityId,
      amount: row.paymentAmount,
      processingFee: row.paymentProcessingFee,
      platformFee: row.paymentProcessingFee,
      tipAmountCents: getPaymentDriverIncentiveCents({ amount: row.paymentAmount }),
      stripePaymentIntentId: row.paymentStripePaymentIntentId,
      stripeTransferId: row.paymentStripeTransferId,
      stripeChargeId: row.paymentStripeChargeId,
      status: row.paymentStatus,
      refundedAt: row.paymentRefundedAt,
      refundAmount: row.paymentRefundAmount,
      refundReason: row.paymentRefundReason,
      batchId: row.paymentBatchId,
      deferReason: null,
      deferredAt: null,
      paidAt: row.paymentPaidAt,
      createdAt: row.paymentCreatedAt,
      updatedAt: row.paymentUpdatedAt,
      driver: {
        id: row.driverId,
        userId: row.driverUserId,
        truckNumber: row.driverTruckNumber,
        user: {
          id: row.driverUserId,
          username: row.driverEmail,
          email: row.driverEmail,
          passwordHash: "",
          firstName: row.driverFirstName,
          lastName: row.driverLastName,
          role: "driver",
          phone: row.driverPhone,
          street: "",
          city: "",
          state: "",
          zip: "",
          paymentMethod: "ach",
          paymentFrequency: "weekly",
          stripeConnectAccountId: null,
          stripeCustomerId: null,
          stripeConnectBalance: null,
          isActive: true,
          createdAt: row.paymentCreatedAt,
          updatedAt: row.paymentUpdatedAt,
          profileImageUrl: null,
        } as User,
      },
      owner: {
        id: row.ownerId,
        userId: row.ownerUserId,
        companyName: row.ownerCompanyName,
        stripeCustomerId: null,
        user: {
          id: row.ownerUserId,
          username: row.ownerEmail,
          email: row.ownerEmail,
          passwordHash: "",
          firstName: row.ownerFirstName,
          lastName: row.ownerLastName,
          role: "owner",
          phone: row.ownerPhone,
          street: "",
          city: "",
          state: "",
          zip: "",
          paymentMethod: "ach",
          paymentFrequency: "weekly",
          stripeConnectAccountId: null,
          stripeCustomerId: null,
          stripeConnectBalance: null,
          isActive: true,
          createdAt: row.paymentCreatedAt,
          updatedAt: row.paymentUpdatedAt,
          profileImageUrl: null,
        } as User,
      },
      activity: {
        id: row.activityId,
        driverId: row.paymentDriverId,
        locationId: row.activityLocationId,
        checkInTime: row.activityCheckInTime,
        status: row.activityStatus,
        amount: row.activityAmount,
        notes: row.activityNotes,
        createdAt: row.paymentCreatedAt,
        updatedAt: row.paymentUpdatedAt,
      } as WashoutActivity,
    })) as any;
    return mappedPayments;
  }

  // Statistics operations
  async getDriverStats(driverId: string, days: number): Promise<{
    totalEarnings: number;
    totalWashouts: number;
    avgPerWashout: number;
    tipTotalCents?: number;
    transferTotalCents?: number;
    pendingTransferCents?: number;
    paidTransferCents?: number;
    transferCount?: number;
  }> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const payments = await this.getPaymentsByDriver(driverId, startDate, new Date());
    const driverSummary = getDriverTipSummaryFromPayments(driverId, payments.map((payment) => ({
      id: payment.id,
      ownerId: payment.ownerId,
      driverId: payment.driverId,
      activityId: payment.activityId,
      processingFee: payment.processingFee,
      tipAmountCents: getPaymentDriverIncentiveCents(payment),
      status: payment.status,
      batchId: payment.batchId,
      stripePaymentIntentId: payment.stripePaymentIntentId,
      stripeTransferId: payment.stripeTransferId,
      stripeChargeId: payment.stripeChargeId,
    })));
    const totalEarningsCents = driverSummary.driverTipTotalCents;
    const totalWashouts = payments.length;
    const paidTransferCents = driverSummary.driverTransferredCents;
    const pendingTransferCents = driverSummary.pendingTransferCents;
    const transferCount = driverSummary.transferCount;
    const avgPerWashout = totalWashouts > 0 ? (totalEarningsCents / 100) / totalWashouts : 0;

    return {
      totalEarnings: Number((totalEarningsCents / 100).toFixed(2)),
      totalWashouts,
      avgPerWashout: Number(avgPerWashout.toFixed(2)),
      tipTotalCents: totalEarningsCents,
      transferTotalCents: totalEarningsCents,
      pendingTransferCents,
      paidTransferCents,
      transferCount,
    };
  }

  async getOwnerStats(ownerId: string, days: number): Promise<{
    totalPayments: number;
    totalWashouts: number;
    totalDrivers: number;
    platformFeesOwedCents?: number;
    platformFeesPaidCents?: number;
    driverTipTotalCents?: number;
    ownerChargeTotalCents?: number;
    needsReviewBillingCents?: number;
    paidBillingCount?: number;
    needsReviewBillingCount?: number;
    unpaidBillingCount?: number;
  }> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const approvedWashouts = await this.getApprovedWashoutsForOwnerBilling(ownerId, startDate, new Date());
    const batches = await this.getBillingBatchesByOwner(ownerId, startDate, new Date());
    const pendingLedger = approvedWashouts.length > 0
      ? buildOwnerWashoutBillingLedgerFromBillableWashouts({
          ownerId,
          billingBatchId: `${ownerId}:pending:${startDate.toISOString().split("T")[0]}`,
          washouts: approvedWashouts.map((row) => ({
            id: row.activityId,
            ownerId: row.ownerId,
            driverId: row.driverId,
            driverStripeAccountId: null,
            platformFeeCents: normalizeMoneyToCents(row.activityFeeCentsPlatform ?? 0, "auto"),
            driverTipCents: normalizeMoneyToCents(row.activityDriverTipAmount || 0, "dollars"),
          })),
          immediateBilling: true,
        })
      : null;
    const batchLedgers = await Promise.all(
      batches.map(async (batch) => {
        const batchPayments = await this.getPaymentsByBatchId(batch.id);
        const ledger = buildOwnerWashoutBillingLedgerFromPayments({
          ownerId,
          billingBatchId: batch.id,
          payments: batchPayments.map((payment) => ({
            id: payment.id,
            ownerId: payment.ownerId,
            driverId: payment.driverId,
            activityId: payment.activityId,
            processingFee: payment.processingFee,
            tipAmountCents: getPaymentDriverIncentiveCents(payment),
            status: payment.status,
            batchId: payment.batchId,
            stripePaymentIntentId: payment.stripePaymentIntentId,
            stripeTransferId: payment.stripeTransferId,
            stripeChargeId: payment.stripeChargeId,
          })),
        });
        return {
          ...ledger,
          billingStatus: getReportingBillingStatus(batch.status),
        };
      })
    );
    const summary = getOwnerBillingSummary(ownerId, [
      ...(pendingLedger ? [{ ...pendingLedger, billingStatus: "pending" as const }] : []),
      ...batchLedgers,
    ]);
    const totalDrivers = new Set([
      ...approvedWashouts.map((row) => row.driverId),
      ...batchLedgers.flatMap((ledger) => ledger.driverTransfers.map((transfer) => transfer.driverId)),
    ]).size;

    return {
      totalPayments: Number((summary.ownerChargeTotalCents / 100).toFixed(2)),
      totalWashouts: summary.approvedWashoutCount,
      totalDrivers,
      platformFeesOwedCents: summary.unpaidReceivablesCents,
      platformFeesPaidCents: summary.paidReceivablesCents,
      driverTipTotalCents: summary.driverTipTotalCents,
      ownerChargeTotalCents: summary.ownerChargeTotalCents,
      needsReviewBillingCents: summary.needsReviewCents,
      paidBillingCount: batchLedgers.filter((ledger) => ledger.billingStatus === "paid").length,
      needsReviewBillingCount: batchLedgers.filter((ledger) => ledger.billingStatus === "needs_review").length,
      unpaidBillingCount: batchLedgers.filter((ledger) => ledger.billingStatus === "pending").length,
    };
  }

  async getSystemStats(days: number): Promise<{ 
    totalEarnings: number; 
    totalWashouts: number; 
    totalDrivers: number; 
    totalOwners: number;
    platformRevenueCents?: number | null;
    ownerChargeTotalCents?: number | null;
    driverTipTotalCents?: number | null;
    driverTransferTotalCents?: number | null;
    unpaidReceivablesCents?: number | null;
    paidReceivablesCents?: number | null;
    needsReviewCents?: number | null;
    platformWashoutRevenue: number | null;
    platformWashoutRevenueCents: number | null;
    platformWashoutPaidRevenue: number | null;
    platformWashoutPaidRevenueCents: number | null;
    platformFeeRecordCount: number | null;
    approvedWashouts: number | null;
    driverTipTotal: number | null;
    billedWashouts: number | null;
    pendingWashouts: number | null;
    failedWashouts: number | null;
    refundedWashouts: number | null;
    disputedWashouts: number | null;
    lotteryTicketCount: number;
    lotteryDriverCount: number;
    subscriptionRevenue: number;
    activeLicenses: number;
    licenseRenewals: number;
    washoutRevenueError?: string;
    lotteryMetricsError?: string;
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
    let totalEarnings = Number(stats.totalEarnings);
    let totalWashouts = Number(stats.totalWashouts);
    let totalDrivers = Number(stats.totalDrivers);
    const systemSettings = await this.getSystemSettings();
    let platformWashoutRevenue: number | null = null;
    let platformWashoutRevenueCents: number | null = null;
    let platformWashoutPaidRevenue: number | null = null;
    let platformWashoutPaidRevenueCents: number | null = null;
    let platformFeeRecordCount: number | null = null;
    let approvedWashouts: number | null = null;
    let driverTipTotal: number | null = null;
    let billedWashouts: number | null = null;
    let pendingWashouts: number | null = null;
    let failedWashouts: number | null = null;
    let refundedWashouts: number | null = null;
    let disputedWashouts: number | null = null;
    let platformRevenueCents: number | null = null;
    let ownerChargeTotalCents: number | null = null;
    let driverTipTotalCents: number | null = null;
    let driverTransferTotalCents: number | null = null;
    let unpaidReceivablesCents: number | null = null;
    let paidReceivablesCents: number | null = null;
    let needsReviewCents: number | null = null;
    let washoutRevenueError: string | undefined;

    try {
      const ownersWithBillingSettings = await this.getAllOwnersBillingSettings();
      const ownerLedgers: Array<OwnerBillingLedger & { billingStatus?: "paid" | "pending" | "needs_review" }> = [];
      const reportingDriverIds = new Set<string>();

      for (const ownerSetting of ownersWithBillingSettings) {
        const owner = await this.getOwnerById(ownerSetting.ownerId);
        if (!owner) continue;
        const configuredPlatformFeeCents = resolveConfiguredWashoutPlatformFeeCents({
          ownerCustomPlatformFee: owner.customPlatformFee,
          systemPlatformWashoutFee: systemSettings?.platformWashoutFee,
        });

        const approvedOwnerWashouts = await this.getApprovedWashoutsForOwnerBilling(ownerSetting.ownerId, startDate, new Date());
        if (approvedOwnerWashouts.length > 0) {
          const pendingLedger = buildOwnerWashoutBillingLedgerFromBillableWashouts({
            ownerId: ownerSetting.ownerId,
            billingBatchId: `${ownerSetting.ownerId}:report:${startDate.toISOString().split("T")[0]}`,
            washouts: approvedOwnerWashouts.map((row) => ({
              id: row.activityId,
              ownerId: row.ownerId,
              driverId: row.driverId,
              driverStripeAccountId: null,
              platformFeeCents: configuredPlatformFeeCents,
              driverTipCents: normalizeMoneyToCents(row.activityDriverTipAmount || 0, "dollars"),
            })),
            immediateBilling: ownerSetting.billingCadence === "immediate",
            allowAdminOverride: true,
          });
          ownerLedgers.push({
            ...pendingLedger,
            billingStatus: "pending",
          });
          Object.keys(pendingLedger.driverTipCentsByDriver || {}).forEach((driverId) => reportingDriverIds.add(driverId));
        }

        const ownerBatches = await this.getBillingBatchesByOwner(ownerSetting.ownerId, startDate, new Date());
        for (const batch of ownerBatches) {
          const batchPayments = await this.getPaymentsByBatchId(batch.id);
          const ledger = buildOwnerWashoutBillingLedgerFromPayments({
            ownerId: ownerSetting.ownerId,
            billingBatchId: batch.id,
            payments: batchPayments.map((payment) => ({
              id: payment.id,
              ownerId: payment.ownerId,
              driverId: payment.driverId,
              activityId: payment.activityId,
              processingFee: payment.processingFee,
              tipAmountCents: getPaymentDriverIncentiveCents(payment),
              status: payment.status,
              batchId: payment.batchId,
              stripePaymentIntentId: payment.stripePaymentIntentId,
              stripeTransferId: payment.stripeTransferId,
              stripeChargeId: payment.stripeChargeId,
            })),
            immediateBilling: ownerSetting.billingCadence === "immediate",
            allowAdminOverride: true,
          });
          ownerLedgers.push({
            ...ledger,
            billingStatus: getReportingBillingStatus(batch.status),
          });
          ledger.driverTransfers.forEach((transfer) => reportingDriverIds.add(transfer.driverId));
        }
      }

      const platformSummary = getPlatformRevenueSummary(ownerLedgers);
      const paymentSummary = getReceivablesSummary(ownerLedgers);
      platformRevenueCents = platformSummary.platformRevenueCents;
      ownerChargeTotalCents = platformSummary.ownerChargeTotalCents;
      driverTipTotalCents = paymentSummary.driverTipTotalCents;
      driverTransferTotalCents = paymentSummary.driverTransferTotalCents;
      unpaidReceivablesCents = platformSummary.unpaidReceivablesCents;
      paidReceivablesCents = platformSummary.paidReceivablesCents;
      needsReviewCents = platformSummary.needsReviewCents;
      platformWashoutRevenueCents = platformSummary.platformRevenueCents;
      platformWashoutRevenue = platformWashoutRevenueCents / 100;
      platformWashoutPaidRevenueCents = platformSummary.paidReceivablesCents;
      platformWashoutPaidRevenue = platformWashoutPaidRevenueCents / 100;
      platformFeeRecordCount = platformSummary.approvedWashoutCount;
      approvedWashouts = platformSummary.approvedWashoutCount;
      driverTipTotal = paymentSummary.driverTipTotalCents / 100;
      billedWashouts = platformSummary.billedWashoutCount;
      pendingWashouts = Math.max(0, platformSummary.approvedWashoutCount - platformSummary.billedWashoutCount);
      failedWashouts = 0;
      refundedWashouts = 0;
      disputedWashouts = 0;
      console.log("[REPORTING_RECONCILIATION]", {
        platformRevenueCents,
        ownerChargeTotalCents,
        driverTipTotalCents,
        driverTransferTotalCents,
        unpaidReceivablesCents,
        paidReceivablesCents,
        needsReviewCents,
      });
      totalDrivers = reportingDriverIds.size;
      totalWashouts = paymentSummary.approvedWashoutCount;
      totalEarnings = Number(((ownerChargeTotalCents || 0) / 100).toFixed(2));
    } catch (error) {
      const safeError = summarizeDatabaseError(error);
      washoutRevenueError = "Unable to load washout revenue metrics.";
      console.error("[SYSTEM_STATS] washoutRevenue query failed", {
        days,
        startDate: startDate.toISOString(),
        query: "washoutRevenue",
        ...safeError,
      });
    }

    let lotteryTicketCount = 0;
    let lotteryDriverCount = 0;
    let lotteryMetricsError: string | undefined;
    try {
      const lotteryStats = await db
        .select({
          lotteryTicketCount: sql<number>`COALESCE(COUNT(*), 0)::integer`,
          lotteryDriverCount: sql<number>`COALESCE(COUNT(DISTINCT ${driverLotteryEntries.driverId}), 0)::integer`,
        })
        .from(driverLotteryEntries)
        .where(gte(driverLotteryEntries.createdAt, startDate));
      lotteryTicketCount = Number(lotteryStats[0]?.lotteryTicketCount || 0);
      lotteryDriverCount = Number(lotteryStats[0]?.lotteryDriverCount || 0);
    } catch (error) {
      const safeError = summarizeDatabaseError(error);
      lotteryMetricsError = "Unable to load lottery metrics.";
      console.error("[SYSTEM_STATS] lotteryMetrics query failed", {
        days,
        startDate: startDate.toISOString(),
        query: "lotteryMetrics",
        ...safeError,
      });
    }

    console.log(`[SYSTEM_STATS] washout revenue summary`, {
      days,
      startDate: startDate.toISOString(),
      platformFeeRecordCount,
      approvedWashouts,
      platformWashoutRevenueCents,
      platformWashoutPaidRevenue,
      platformWashoutPaidRevenueCents,
      platformWashoutRevenue,
      driverTipTotal,
      billedWashouts,
      pendingWashouts,
      failedWashouts,
      refundedWashouts,
      disputedWashouts,
      lotteryTicketCount,
      lotteryDriverCount,
    });

    return {
      totalEarnings: Number((ownerChargeTotalCents ?? 0) / 100),
      totalWashouts: Number(approvedWashouts ?? stats.totalWashouts),
      totalDrivers: Number(totalDrivers),
      totalOwners: Number(ownerCount),
      platformRevenueCents: platformRevenueCents ?? null,
      ownerChargeTotalCents: ownerChargeTotalCents ?? null,
      driverTipTotalCents: driverTipTotalCents ?? null,
      driverTransferTotalCents: driverTransferTotalCents ?? null,
      unpaidReceivablesCents: unpaidReceivablesCents ?? null,
      paidReceivablesCents: paidReceivablesCents ?? null,
      needsReviewCents: needsReviewCents ?? null,
      platformWashoutRevenue,
      platformWashoutRevenueCents,
      platformWashoutPaidRevenue,
      platformWashoutPaidRevenueCents,
      platformFeeRecordCount,
      approvedWashouts,
      driverTipTotal,
      billedWashouts,
      pendingWashouts,
      failedWashouts,
      refundedWashouts,
      disputedWashouts,
      lotteryTicketCount,
      lotteryDriverCount,
      subscriptionRevenue: subscriptionRevenue,
      activeLicenses: Number(subStats.activeLicenses),
      licenseRenewals: Number(subStats.licenseRenewals),
      washoutRevenueError,
      lotteryMetricsError,
    };
  }

  // Notification operations
  async createNotification(notification: InsertNotification): Promise<Notification> {
    const [newNotification] = await db.insert(notifications).values(notification).returning();
    return newNotification;
  }

  async getNotificationsByUser(userId: string): Promise<Notification[]> {
    const rows = await db
      .select()
      .from(notifications)
      .leftJoin(financialHistoryRecords, sql`${financialHistoryRecords.recordType} = 'notification' AND ${financialHistoryRecords.recordId} = ${notifications.id} AND ${financialHistoryRecords.classification} = 'historical_test_data'`)
      .where(and(eq(notifications.userId, userId), isNull(financialHistoryRecords.id)))
      .orderBy(desc(notifications.createdAt));
    return rows.map((row: any) => row.notifications) as Notification[];
  }

  async markAllNotificationsAsRead(userId: string): Promise<void> {
    await db
      .update(notifications)
      .set({ isRead: true })
      .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)));
  }

  async markNotificationAsRead(notificationId: string, userId: string): Promise<Notification | undefined> {
    const [notification] = await db
      .update(notifications)
      .set({ isRead: true })
      .where(and(eq(notifications.id, notificationId), eq(notifications.userId, userId)))
      .returning();
    return notification;
  }

  async getUnreadNotificationsByUser(userId: string): Promise<Notification[]> {
    const rows = await db
      .select()
      .from(notifications)
      .leftJoin(financialHistoryRecords, sql`${financialHistoryRecords.recordType} = 'notification' AND ${financialHistoryRecords.recordId} = ${notifications.id} AND ${financialHistoryRecords.classification} = 'historical_test_data'`)
      .where(and(
        eq(notifications.userId, userId),
        eq(notifications.isRead, false),
        isNull(financialHistoryRecords.id),
      ))
      .orderBy(desc(notifications.createdAt));
    return rows.map((row: any) => row.notifications) as Notification[];
  }

  async clearNotificationsByType(userId: string, type: string): Promise<void> {
    await db
      .delete(notifications)
      .where(and(
        eq(notifications.userId, userId),
        eq(notifications.type, type)
      ));
  }

  // Legal terms operations
  async upsertTermsVersion(version: InsertTermsVersion): Promise<TermsVersion> {
    const [termsVersion] = await db
      .insert(termsVersions)
      .values(version)
      .onConflictDoUpdate({
        target: [termsVersions.storageKey, termsVersions.version],
        set: {
          termsType: version.termsType,
          language: version.language,
          title: version.title,
          contentHash: version.contentHash,
          effectiveAt: version.effectiveAt,
          requiresReacceptance: version.requiresReacceptance,
          isCurrent: version.isCurrent,
          updatedAt: new Date(),
        },
      })
      .returning();
    return termsVersion;
  }

  async getTermsAcceptancesForUser(userId: string): Promise<TermsAcceptance[]> {
    return await db
      .select()
      .from(termsAcceptances)
      .where(eq(termsAcceptances.userId, userId))
      .orderBy(desc(termsAcceptances.acceptedAt));
  }

  async createTermsAcceptance(acceptance: InsertTermsAcceptance): Promise<TermsAcceptance> {
    const [termsAcceptance] = await db
      .insert(termsAcceptances)
      .values(acceptance)
      .onConflictDoUpdate({
        target: [
          termsAcceptances.userId,
          termsAcceptances.termsType,
          termsAcceptances.language,
          termsAcceptances.version,
          termsAcceptances.contentHash,
        ],
        set: {
          role: acceptance.role,
          storageKey: acceptance.storageKey,
          acceptedAt: acceptance.acceptedAt,
          ipAddress: acceptance.ipAddress,
          userAgent: acceptance.userAgent,
        },
      })
      .returning();
    return termsAcceptance;
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
    
    const mappedBatches: any = results.map((row: any) => ({
      ...row.messages,
      user: row.users
    })) as any;
    return mappedBatches;
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

  async getAllUsers(): Promise<User[]> {
    return await db.select().from(users) as any;
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

  async getOwnerPaymentMethods(ownerId: string): Promise<OwnerFundingSource[]> {
    return await this.getOwnerFundingSources(ownerId);
  }

  async createOwnerPaymentMethod(fundingSource: InsertOwnerFundingSource): Promise<OwnerFundingSource> {
    return await this.createOwnerFundingSource(fundingSource);
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

  async deleteOwnerPaymentMethod(id: string): Promise<void> {
    await this.deleteOwnerFundingSource(id);
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

    const rows = await db
      .select()
      .from(walletTransactions)
      .leftJoin(financialHistoryRecords, sql`${financialHistoryRecords.recordType} = 'wallet_transaction' AND ${financialHistoryRecords.recordId} = ${walletTransactions.id} AND ${financialHistoryRecords.classification} = 'historical_test_data'`)
      .where(and(...conditions, isNull(financialHistoryRecords.id)))
      .orderBy(desc(walletTransactions.createdAt));
    return rows.map((row: any) => row.wallet_transactions) as WalletTransaction[];
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
    
    const mappedBatches: any = results.map((row: any) => ({
      ...row.withdrawals,
      driver: {
        ...row.drivers,
        user: row.users
      }
    })) as any;
    return mappedBatches;
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

  // Webhook event operations for idempotency (updated to use new status enum)
  async createWebhookEvent(stripeEventId: string, eventType: string, accountId?: string): Promise<boolean> {
    try {
      await db.insert(webhookEvents).values({
        stripeEventId,
        eventType,
        accountId,
        status: 'received',
        payload: {}, // Default empty payload, will be updated later
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
    return event?.status === 'processed' || false;
  }

  async markWebhookEventProcessed(stripeEventId: string): Promise<void> {
    await db.update(webhookEvents)
      .set({ status: 'processed', processedAt: new Date() })
      .where(eq(webhookEvents.stripeEventId, stripeEventId));
  }

  async markWebhookEventFailed(stripeEventId: string, errorMessage: string): Promise<void> {
    await db.update(webhookEvents)
      .set({ 
        status: 'failed',
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
    const [result] = await db
      .select({
        owner: getTableColumns(owners),
        user: getTableColumns(users),
      })
      .from(owners)
      .innerJoin(users, eq(owners.userId, users.id))
      .where(eq(users.stripeCustomerId, customerId));
    
    return result ? { ...result.owner, user: result.user } : undefined;
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

  async getBillingBatches(startDate?: Date, endDate?: Date): Promise<(BillingBatch & { owner: Owner & { user: User } })[]> {
    const conditions = [] as any[];

    if (startDate) {
      conditions.push(gte(billingBatches.createdAt, startDate));
    }
    if (endDate) {
      conditions.push(lte(billingBatches.createdAt, endDate));
    }

    const ownerUsers = alias(users, "billing_batch_owner_users");

    const results = await db
      .select({
        batchId: billingBatches.id,
        batchOwnerId: billingBatches.ownerId,
        batchBusinessDate: billingBatches.businessDate,
        batchCutoffTime: billingBatches.cutoffTime,
        batchTimezone: billingBatches.timezone,
        batchTotalAmount: billingBatches.totalAmount,
        batchTotalFees: billingBatches.totalFees,
        batchPaymentCount: billingBatches.paymentCount,
        batchStripePaymentIntentId: billingBatches.stripePaymentIntentId,
        batchStripeBatchTransferId: billingBatches.stripeBatchTransferId,
        batchStatus: billingBatches.status,
        batchProcessingStartedAt: billingBatches.processingStartedAt,
        batchCompletedAt: billingBatches.completedAt,
        batchFailureReason: billingBatches.failureReason,
        batchRetryCount: billingBatches.retryCount,
        batchMetadata: billingBatches.metadata,
        batchCreatedAt: billingBatches.createdAt,
        batchUpdatedAt: billingBatches.updatedAt,
        ownerId: owners.id,
        ownerUserId: owners.userId,
        ownerCompanyName: owners.companyName,
        ownerStripeCustomerId: owners.stripeCustomerId,
        ownerStripePaymentMethodId: owners.stripePaymentMethodId,
        ownerFirstName: ownerUsers.firstName,
        ownerLastName: ownerUsers.lastName,
        ownerEmail: ownerUsers.email,
        ownerPhone: ownerUsers.phone,
      })
      .from(billingBatches)
      .innerJoin(owners, eq(billingBatches.ownerId, owners.id))
      .innerJoin(ownerUsers, eq(owners.userId, ownerUsers.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(billingBatches.createdAt));

    const mappedBatches: any = results.map((row: any) => ({
      id: row.batchId,
      ownerId: row.batchOwnerId,
      businessDate: row.batchBusinessDate,
      cutoffTime: row.batchCutoffTime,
      timezone: row.batchTimezone,
      totalAmount: row.batchTotalAmount,
      totalFees: row.batchTotalFees,
      paymentCount: row.batchPaymentCount,
      stripePaymentIntentId: row.batchStripePaymentIntentId,
      stripeBatchTransferId: row.batchStripeBatchTransferId,
      status: row.batchStatus,
      processingStartedAt: row.batchProcessingStartedAt,
      completedAt: row.batchCompletedAt,
      failureReason: row.batchFailureReason,
      retryCount: row.batchRetryCount,
      metadata: row.batchMetadata,
      createdAt: row.batchCreatedAt,
      updatedAt: row.batchUpdatedAt,
      owner: {
        id: row.ownerId,
        userId: row.ownerUserId,
        companyName: row.ownerCompanyName,
        stripeCustomerId: row.ownerStripeCustomerId,
        stripePaymentMethodId: row.ownerStripePaymentMethodId,
        user: {
          id: row.ownerUserId,
          username: row.ownerEmail,
          email: row.ownerEmail,
          passwordHash: "",
          firstName: row.ownerFirstName,
          lastName: row.ownerLastName,
          role: "owner",
          phone: row.ownerPhone,
          street: "",
          city: "",
          state: "",
          zip: "",
          paymentMethod: "ach",
          paymentFrequency: "weekly",
          stripeConnectAccountId: null,
          stripeCustomerId: row.ownerStripeCustomerId,
          stripeConnectBalance: null,
          isActive: true,
          createdAt: row.batchCreatedAt,
          updatedAt: row.batchUpdatedAt,
          profileImageUrl: null,
        } as User,
      },
    })) as any;
    return mappedBatches;
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
        batch: getTableColumns(billingBatches),
        owner: getTableColumns(owners),
        user: getTableColumns(users),
      })
      .from(billingBatches)
      .innerJoin(owners, eq(billingBatches.ownerId, owners.id))
      .innerJoin(users, eq(owners.userId, users.id))
      .where(eq(billingBatches.status, status as any))
      .orderBy(desc(billingBatches.createdAt));

    return batches.map(({ batch, owner, user }) => ({
      ...batch,
      owner: { ...owner, user },
    }));
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

  async updateBillingBatchMetadata(batchId: string, metadataPatch: Record<string, unknown>): Promise<BillingBatch> {
    const [batch] = await db
      .update(billingBatches)
      .set({
        metadata: sql`coalesce(${billingBatches.metadata}, '{}'::jsonb) || ${JSON.stringify(metadataPatch)}::jsonb`,
        updatedAt: new Date(),
      })
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
    assertLegacyFinancialExecutionRetired("facility_collection", "storage.createStripePaymentIntent");
    const stripe = await this.getStripeInstance();
    if (!stripe) {
      throw new Error('Stripe not available');
    }

    // Get owner's user information
    const ownerResult = await db
      .select({
        owner: getTableColumns(owners),
        user: getTableColumns(users),
      })
      .from(owners)
      .innerJoin(users, eq(owners.userId, users.id))
      .where(eq(owners.id, ownerId));
    
    const stripeCustomerId = ownerResult[0]?.user.stripeCustomerId;
    if (!stripeCustomerId) {
      throw new Error(`No Stripe customer ID found for owner ${ownerId}`);
    }
    
    const owner = { ...ownerResult[0].owner, user: ownerResult[0].user };

    // Convert to cents for Stripe - charge platform fees plus driver tips only
    const fullChargeAmount = totalAmount + totalFees;
    const amountCents = Math.round(fullChargeAmount * 100);
    
    // Create idempotency key based on batch - use full amount for consistency
    const idempotencyKey = `batch_payment_${batchId}_${Math.round(fullChargeAmount * 100)}`;
    
    // Create PaymentIntent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: 'usd',
      customer: stripeCustomerId,
      description: `Daily batch payment - ${paymentCount} washouts (Platform fees: $${totalAmount.toFixed(2)}, Driver tips: $${totalFees.toFixed(2)})`,
      metadata: {
        batchId,
        ownerId,
        paymentCount: paymentCount.toString(),
        platformFees: totalAmount.toFixed(2),
        driverTips: totalFees.toFixed(2),
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
        batch: getTableColumns(billingBatches),
        owner: getTableColumns(owners),
        user: getTableColumns(users),
      })
      .from(billingBatches)
      .innerJoin(owners, eq(billingBatches.ownerId, owners.id))
      .innerJoin(users, eq(owners.userId, users.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(billingBatches.createdAt))
      .limit(filters.limit || 50)
      .offset(filters.offset || 0);

    return batches.map(({ batch, owner, user }) => ({
      ...batch,
      owner: { ...owner, user },
    }));
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
      const ownerUser = await this.getUser(owner.userId);

      // Calculate totals
      const batchTotal = pendingPayments.reduce((sum, payment) => sum + getPaymentOwnerChargeCents(payment), 0) / 100;
      const batchFees = pendingPayments.reduce((sum, payment) => sum + getPaymentPlatformFeeCents(payment), 0) / 100;

      ownerBatches.push({
        ownerId,
        ownerName: owner.companyName || (ownerUser ? `${ownerUser.firstName} ${ownerUser.lastName}` : ownerId),
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
        paymentId: payments.id,
        paymentDriverId: payments.driverId,
        paymentOwnerId: payments.ownerId,
        paymentActivityId: payments.activityId,
        paymentAmount: payments.amount,
        paymentProcessingFee: payments.processingFee,
        paymentWashoutServiceFee: payments.washoutServiceFee,
        paymentStripePaymentIntentId: payments.stripePaymentIntentId,
        paymentStripeTransferId: payments.stripeTransferId,
        paymentStripeChargeId: payments.stripeChargeId,
        paymentStatus: payments.status,
        paymentRefundedAt: payments.refundedAt,
        paymentRefundAmount: payments.refundAmount,
        paymentRefundReason: payments.refundReason,
        paymentBatchId: payments.batchId,
        paymentPaidAt: payments.paidAt,
        paymentCreatedAt: payments.createdAt,
        paymentUpdatedAt: payments.updatedAt,
        activityId: washoutActivities.id,
        activityDriverId: washoutActivities.driverId,
        activityLocationId: washoutActivities.locationId,
        activityCheckInTime: washoutActivities.checkInTime,
        activityCheckOutTime: washoutActivities.checkOutTime,
        activityStatus: washoutActivities.status,
        activityAmount: washoutActivities.amount,
        activityNotes: washoutActivities.notes,
        locationDriverRate: washoutLocations.rate,
        driverId: drivers.id,
        driverUserId: drivers.userId,
        driverTruckNumber: drivers.truckNumber,
        driverFirstName: users.firstName,
        driverLastName: users.lastName,
        driverEmail: users.email,
        driverPhone: users.phone,
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

    return pendingPayments.map((row: any) => ({
      id: row.paymentId,
      driverId: row.paymentDriverId,
      ownerId: row.paymentOwnerId,
      activityId: row.paymentActivityId,
      amount: row.paymentAmount,
      processingFee: row.paymentProcessingFee,
      platformFee: row.paymentProcessingFee,
      washoutServiceFee: (getPaymentWashoutServiceFeeCents({ amount: row.paymentAmount }) / 100).toFixed(2),
      tipAmountCents: getPaymentDriverIncentiveCents({ amount: row.paymentAmount }),
      stripePaymentIntentId: row.paymentStripePaymentIntentId,
      stripeTransferId: row.paymentStripeTransferId,
      stripeChargeId: row.paymentStripeChargeId,
      status: row.paymentStatus,
      refundedAt: row.paymentRefundedAt,
      refundAmount: row.paymentRefundAmount,
      refundReason: row.paymentRefundReason,
      batchId: row.paymentBatchId,
      deferReason: null,
      deferredAt: null,
      businessDate: row.paymentCreatedAt ? row.paymentCreatedAt.toISOString().split('T')[0] : null,
      paidAt: row.paymentPaidAt,
      createdAt: row.paymentCreatedAt,
      updatedAt: row.paymentUpdatedAt,
      activity: {
        id: row.activityId,
        driverId: row.activityDriverId,
        locationId: row.activityLocationId,
        checkInTime: row.activityCheckInTime,
        checkOutTime: row.activityCheckOutTime,
        status: row.activityStatus,
        amount: row.activityAmount,
        notes: row.activityNotes,
      } as WashoutActivity,
      driver: {
        id: row.driverId,
        userId: row.driverUserId,
        truckNumber: row.driverTruckNumber,
        licenseNumber: null as any,
        user: {
          id: row.driverUserId,
          username: row.driverEmail,
          email: row.driverEmail,
          passwordHash: "",
          firstName: row.driverFirstName,
          lastName: row.driverLastName,
          role: "driver",
          phone: row.driverPhone,
          street: "",
          city: "",
          state: "",
          zip: "",
          paymentMethod: "ach",
          paymentFrequency: "weekly",
          stripeConnectAccountId: null,
          stripeCustomerId: null,
          stripeConnectBalance: null,
          isActive: true,
          createdAt: row.paymentCreatedAt,
          updatedAt: row.paymentUpdatedAt,
          profileImageUrl: null,
        } as User,
      },
    })) as any;
  }

  async getPendingPaymentsForOwnerBilling(ownerId: string, startDate?: Date, endDate?: Date): Promise<(Payment & { activity: WashoutActivity; driver: Driver & { user: User } })[]> {
    const conditions = [
      eq(payments.ownerId, ownerId),
      eq(payments.status, 'pending'),
      isNull(payments.batchId),
    ];

    if (startDate) {
      conditions.push(gte(payments.businessDate, startDate.toISOString().split('T')[0]));
    }

    if (endDate) {
      conditions.push(lte(payments.businessDate, endDate.toISOString().split('T')[0]));
    }

    const pendingPayments = await db
      .select({
        paymentId: payments.id,
        paymentDriverId: payments.driverId,
        paymentOwnerId: payments.ownerId,
        paymentActivityId: payments.activityId,
        paymentAmount: payments.amount,
        paymentProcessingFee: payments.processingFee,
        paymentDriverTipCents: sql<number>`ROUND(CAST(${payments.amount} AS DECIMAL) * 100)`,
        paymentStripePaymentIntentId: payments.stripePaymentIntentId,
        paymentStripeTransferId: payments.stripeTransferId,
        paymentStripeChargeId: payments.stripeChargeId,
        paymentStatus: payments.status,
        paymentRefundedAt: payments.refundedAt,
        paymentRefundAmount: payments.refundAmount,
        paymentRefundReason: payments.refundReason,
        paymentBatchId: payments.batchId,
        paymentPaidAt: payments.paidAt,
        paymentCreatedAt: payments.createdAt,
        paymentUpdatedAt: payments.updatedAt,
        activityId: washoutActivities.id,
        activityDriverId: washoutActivities.driverId,
        activityLocationId: washoutActivities.locationId,
        activityCheckInTime: washoutActivities.checkInTime,
        activityCheckOutTime: washoutActivities.checkOutTime,
        activityStatus: washoutActivities.status,
        activityAmount: washoutActivities.amount,
        activityNotes: washoutActivities.notes,
        locationDriverRate: washoutLocations.rate,
        driverId: drivers.id,
        driverUserId: drivers.userId,
        driverTruckNumber: drivers.truckNumber,
        driverFirstName: users.firstName,
        driverLastName: users.lastName,
        driverEmail: users.email,
        driverPhone: users.phone,
      })
      .from(payments)
      .innerJoin(washoutActivities, eq(payments.activityId, washoutActivities.id))
      .innerJoin(drivers, eq(payments.driverId, drivers.id))
      .innerJoin(users, eq(drivers.userId, users.id))
      .leftJoin(financialHistoryRecords, sql`${financialHistoryRecords.recordType} = 'washout_activity' AND ${financialHistoryRecords.recordId} = ${washoutActivities.id} AND ${financialHistoryRecords.classification} = 'historical_test_data'`)
      .where(and(...conditions, isNull(financialHistoryRecords.id)))
      .orderBy(payments.createdAt);

    return pendingPayments.map((row: any) => ({
      id: row.paymentId,
      driverId: row.paymentDriverId,
      ownerId: row.paymentOwnerId,
      activityId: row.paymentActivityId,
      amount: row.paymentAmount,
      processingFee: row.paymentProcessingFee,
      platformFee: row.paymentProcessingFee,
      washoutServiceFee: (getPaymentWashoutServiceFeeCents({ amount: row.paymentAmount }) / 100).toFixed(2),
      tipAmountCents: getPaymentDriverIncentiveCents({ amount: row.paymentAmount }),
      stripePaymentIntentId: row.paymentStripePaymentIntentId,
      stripeTransferId: row.paymentStripeTransferId,
      stripeChargeId: row.paymentStripeChargeId,
      status: row.paymentStatus,
      refundedAt: row.paymentRefundedAt,
      refundAmount: row.paymentRefundAmount,
      refundReason: row.paymentRefundReason,
      batchId: row.paymentBatchId,
      deferReason: null,
      deferredAt: null,
      businessDate: row.paymentCreatedAt ? row.paymentCreatedAt.toISOString().split('T')[0] : null,
      paidAt: row.paymentPaidAt,
      createdAt: row.paymentCreatedAt,
      updatedAt: row.paymentUpdatedAt,
      activity: {
        id: row.activityId,
        driverId: row.activityDriverId,
        locationId: row.activityLocationId,
        checkInTime: row.activityCheckInTime,
        checkOutTime: row.activityCheckOutTime,
        status: row.activityStatus,
        amount: row.activityAmount,
        notes: row.activityNotes,
      } as WashoutActivity,
      driver: {
        id: row.driverId,
        userId: row.driverUserId,
        truckNumber: row.driverTruckNumber,
        licenseNumber: null as any,
        user: {
          id: row.driverUserId,
          username: row.driverEmail,
          email: row.driverEmail,
          passwordHash: "",
          firstName: row.driverFirstName,
          lastName: row.driverLastName,
          role: "driver",
          phone: row.driverPhone,
          street: "",
          city: "",
          state: "",
          zip: "",
          paymentMethod: "ach",
          paymentFrequency: "weekly",
          stripeConnectAccountId: null,
          stripeCustomerId: null,
          stripeConnectBalance: null,
          isActive: true,
          createdAt: row.paymentCreatedAt,
          updatedAt: row.paymentUpdatedAt,
          profileImageUrl: null,
        } as User,
      },
    })) as any;
  }

  async getApprovedWashoutsForOwnerBilling(ownerId: string, startDate?: Date, endDate?: Date): Promise<Array<{
    activityId: string;
    ownerId: string;
    driverId: string;
    locationId: string;
    activityStatus?: string | null;
    activityFeeCentsPlatform?: number | null;
    activityDriverTipAmount?: number | string | null;
    locationDriverRate?: number | string | null;
    locationRate?: number | string | null;
    verifiedAt?: Date | null;
    createdAt?: Date | null;
  }>> {
    const conditions = [
      eq(owners.id, ownerId),
      or(
        eq(washoutActivities.status, "verified"),
        sql<boolean>`${washoutActivities.status}::text = 'completed'`
      ),
    ];

    if (startDate) {
      conditions.push(gte(sql<Date>`COALESCE(${washoutActivities.verifiedAt}, ${washoutActivities.checkInTime}, ${washoutActivities.createdAt})`, startDate));
    }

    if (endDate) {
      conditions.push(lte(sql<Date>`COALESCE(${washoutActivities.verifiedAt}, ${washoutActivities.checkInTime}, ${washoutActivities.createdAt})`, endDate));
    }

    const rows = await db
      .select({
        activityId: washoutActivities.id,
        ownerId: owners.id,
        driverId: washoutActivities.driverId,
        locationId: washoutActivities.locationId,
        activityStatus: washoutActivities.status,
        activityFeeCentsPlatform: washoutActivities.feeCentsPlatform,
        activityDriverTipAmount: washoutActivities.amount,
        locationRate: washoutLocations.rate,
        paymentStatus: payments.status,
        paymentBatchId: payments.batchId,
        verifiedAt: washoutActivities.verifiedAt,
        createdAt: washoutActivities.createdAt,
      })
      .from(washoutActivities)
      .innerJoin(washoutLocations, eq(washoutActivities.locationId, washoutLocations.id))
      .innerJoin(owners, eq(washoutLocations.ownerId, owners.id))
      .leftJoin(payments, eq(payments.activityId, washoutActivities.id))
      .leftJoin(financialHistoryRecords, sql`${financialHistoryRecords.recordType} = 'washout_activity' AND ${financialHistoryRecords.recordId} = ${washoutActivities.id} AND ${financialHistoryRecords.classification} = 'historical_test_data'`)
      .where(and(...conditions, isNull(financialHistoryRecords.id)))
      .orderBy(desc(washoutActivities.verifiedAt), desc(washoutActivities.createdAt));

    const billedActivityIds = new Set<string>();
    const billedStatuses = new Set(["paid", "posted", "completed", "succeeded"]);
    const batches = await this.getBillingBatchesByOwner(ownerId);
    for (const batch of batches) {
      const batchStatus = String(batch.status || "").toLowerCase();
      if (!["completed", "paid", "processing"].includes(batchStatus)) {
        continue;
      }

      const metadataSource = batch.metadata as unknown;
      const metadata = metadataSource && typeof metadataSource === "object"
        ? metadataSource as Record<string, unknown>
        : {};
      const rawIds = metadata.washoutActivityIds;
      const ids = Array.isArray(rawIds)
        ? rawIds.map((id) => String(id))
        : typeof rawIds === "string"
          ? rawIds.split(",")
          : [];
      for (const id of ids.map((id) => String(id).trim()).filter(Boolean)) {
        billedActivityIds.add(id);
      }
    }

    return rows.filter((row: any) => {
      const activityId = String(row.activityId || "");
      if (!isBillableWashoutForOwnerBilling({ status: row.activityStatus })) {
        return false;
      }
      if (billedActivityIds.has(activityId)) {
        return false;
      }
      const paymentStatus = String(row.paymentStatus || "").toLowerCase();
      const paymentBatchId = String(row.paymentBatchId || "").trim();
      if (paymentBatchId) {
        return false;
      }
      if (billedStatuses.has(paymentStatus)) {
        return false;
      }
      return true;
    }).map((row: any) => ({
      ...row,
      activityDriverTipAmount: row.activityDriverTipAmount,
      locationDriverRate: row.locationRate,
    })) as any;
  }

  async repairMissingVerifiedWashoutPayments(options: {
    ownerId?: string;
    startDate?: Date;
    endDate?: Date;
    dryRun?: boolean;
    triggeredByAdminId?: string | null;
  } = {}): Promise<{
    ownersChecked: number;
    approvedWashoutsChecked: number;
    missingPaymentCount: number;
    repairedCount: number;
    skippedCount: number;
    repairNeededCount: number;
    repairedWalletTransactionCount: number;
    repairedPayments: Array<{
      paymentId: string;
      ownerId: string;
      driverId: string;
      activityId: string;
      amountCents: number;
      processingFeeCents: number;
      businessDate: string;
    }>;
    errors: string[];
  }> {
    if (!options.dryRun) {
      assertLegacyFinancialExecutionRetired("facility_collection", "storage.repairMissingVerifiedWashoutPayments");
    }
    const result = {
      ownersChecked: 0,
      approvedWashoutsChecked: 0,
      missingPaymentCount: 0,
      repairedCount: 0,
      skippedCount: 0,
      repairNeededCount: 0,
      repairedWalletTransactionCount: 0,
      repairedPayments: [] as Array<{
        paymentId: string;
        ownerId: string;
        driverId: string;
        activityId: string;
        amountCents: number;
        processingFeeCents: number;
        businessDate: string;
      }>,
      errors: [] as string[],
    };

    const systemSettings = typeof this.getSystemSettings === "function"
      ? await this.getSystemSettings()
      : null;
    const ownersToInspect = options.ownerId
      ? (await this.getAllOwnersBillingSettings()).filter((ownerSetting) => ownerSetting.ownerId === options.ownerId)
      : await this.getAllOwnersBillingSettings();

    for (const ownerSetting of ownersToInspect) {
      result.ownersChecked++;

      try {
        const owner = await this.getOwnerById(ownerSetting.ownerId);
        if (!owner) {
          result.errors.push(`Owner ${ownerSetting.ownerId}: owner record not found`);
          continue;
        }

        const configuredPlatformFeeCents = resolveConfiguredWashoutPlatformFeeCents({
          ownerCustomPlatformFee: owner.customPlatformFee,
          systemPlatformWashoutFee: systemSettings?.platformWashoutFee,
        });

        const repairRows = await db
          .select({
            activityId: washoutActivities.id,
            ownerId: owners.id,
            driverId: washoutActivities.driverId,
            locationId: washoutActivities.locationId,
            activityStatus: washoutActivities.status,
            activityAmount: washoutActivities.amount,
            locationRate: washoutLocations.rate,
            verifiedAt: washoutActivities.verifiedAt,
            createdAt: washoutActivities.createdAt,
            paymentId: payments.id,
            paymentAmount: payments.amount,
            paymentProcessingFee: payments.processingFee,
            paymentWashoutServiceFee: payments.washoutServiceFee,
            paymentStatus: payments.status,
            paymentBatchId: payments.batchId,
            walletTransactionId: walletTransactions.id,
            walletTransactionAmount: walletTransactions.amount,
            walletTransactionBalanceAfter: walletTransactions.balanceAfter,
            walletTransactionStatus: walletTransactions.status,
          })
          .from(washoutActivities)
          .innerJoin(washoutLocations, eq(washoutActivities.locationId, washoutLocations.id))
          .innerJoin(owners, eq(washoutLocations.ownerId, owners.id))
          .leftJoin(payments, eq(payments.activityId, washoutActivities.id))
          .leftJoin(
            walletTransactions,
            and(
              eq(walletTransactions.driverId, washoutActivities.driverId),
              eq(walletTransactions.sourceType, "washout"),
              eq(walletTransactions.sourceId, washoutActivities.id),
              eq(walletTransactions.direction, "credit"),
            ),
          )
          .where(and(
            eq(owners.id, ownerSetting.ownerId),
            or(
              eq(washoutActivities.status, "verified"),
              sql<boolean>`${washoutActivities.status}::text = 'completed'`,
            ),
            ...(options.startDate
              ? [gte(sql<Date>`COALESCE(${washoutActivities.verifiedAt}, ${washoutActivities.checkInTime}, ${washoutActivities.createdAt})`, options.startDate)]
              : []),
            ...(options.endDate
              ? [lte(sql<Date>`COALESCE(${washoutActivities.verifiedAt}, ${washoutActivities.checkInTime}, ${washoutActivities.createdAt})`, options.endDate)]
              : []),
          ))
          .orderBy(desc(washoutActivities.verifiedAt), desc(washoutActivities.createdAt));

        result.approvedWashoutsChecked += repairRows.length;

        for (const row of repairRows) {
          const activityStatus = String(row.activityStatus || "").trim().toLowerCase();
          if (!isBillableWashoutForOwnerBilling({ status: activityStatus })) {
            continue;
          }

          const referenceTime = row.verifiedAt || row.createdAt || new Date();
          const businessDate = this.calculateBusinessDate(
            ownerSetting.billingTimezone || "America/Chicago",
            ownerSetting.billingCutoffTime || "23:59:00",
            referenceTime instanceof Date ? referenceTime : new Date(referenceTime),
          );

          const canonicalDriverTipCents = normalizeMoneyToCents(
            row.locationRate ?? row.activityAmount ?? 0,
            "dollars",
          );
          if (canonicalDriverTipCents <= 0) {
            result.errors.push(`Activity ${row.activityId}: canonical driver incentive resolved to $0.00`);
            continue;
          }
          const currentPaymentAmountCents = normalizeMoneyToCents(row.paymentAmount ?? 0, "dollars");
          const currentProcessingFeeCents = normalizeMoneyToCents(row.paymentProcessingFee ?? 0, "dollars");
          const currentWashoutServiceFeeCents = normalizeMoneyToCents(row.paymentWashoutServiceFee ?? 0, "dollars");
          const currentWalletTransactionAmountCents = normalizeMoneyToCents(row.walletTransactionAmount ?? 0, "dollars");
          const walletRowMissing = !row.walletTransactionId;
          const paymentNeedsRepair = !row.paymentId
            || currentPaymentAmountCents <= 0
            || (canonicalDriverTipCents > 0 && currentPaymentAmountCents < canonicalDriverTipCents)
            || currentProcessingFeeCents !== configuredPlatformFeeCents
            || currentWashoutServiceFeeCents !== canonicalDriverTipCents;
          const walletNeedsRepair = walletRowMissing
            || currentWalletTransactionAmountCents !== canonicalDriverTipCents;

          if (!paymentNeedsRepair && !walletNeedsRepair) {
            continue;
          }

          result.repairNeededCount++;
          if (!row.paymentId) {
            result.missingPaymentCount++;
          }

          if (options.dryRun) {
            result.skippedCount++;
            console.log("[WASHOUT_PAYMENT_REPAIR][DRY_RUN]", {
              ownerId: ownerSetting.ownerId,
              driverId: row.driverId,
              activityId: row.activityId,
              paymentNeedsRepair,
              walletNeedsRepair,
              amountCents: canonicalDriverTipCents,
              processingFeeCents: configuredPlatformFeeCents,
              businessDate,
            });
            continue;
          }

          await db.transaction(async (tx) => {
            const [currentPayment] = await tx
              .select()
              .from(payments)
              .where(eq(payments.activityId, row.activityId))
              .orderBy(desc(payments.createdAt))
              .limit(1);

            let paymentId = currentPayment?.id ?? null;
            let paymentAmountCents = currentPayment ? normalizeMoneyToCents(currentPayment.amount, "dollars") : 0;
            let paymentProcessingFeeCents = currentPayment ? normalizeMoneyToCents(currentPayment.processingFee, "dollars") : 0;
            let paymentWashoutServiceFeeCents = currentPayment ? normalizeMoneyToCents(currentPayment.washoutServiceFee ?? currentPayment.amount, "dollars") : 0;
            const currentWalletTxAmountCents = normalizeMoneyToCents(row.walletTransactionAmount ?? 0, "dollars");

            if (!currentPayment) {
              const [insertedPayment] = await tx.insert(payments).values({
                activityId: row.activityId,
                driverId: row.driverId,
                ownerId: row.ownerId,
                amount: (canonicalDriverTipCents / 100).toFixed(2),
                processingFee: (configuredPlatformFeeCents / 100).toFixed(2),
                washoutServiceFee: (canonicalDriverTipCents / 100).toFixed(2),
                status: "pending",
                businessDate,
              }).returning();

              paymentId = insertedPayment.id;
              paymentAmountCents = canonicalDriverTipCents;
              paymentProcessingFeeCents = configuredPlatformFeeCents;
              paymentWashoutServiceFeeCents = canonicalDriverTipCents;
            } else if (
              paymentAmountCents <= 0
              || (canonicalDriverTipCents > 0 && paymentAmountCents < canonicalDriverTipCents)
              || paymentProcessingFeeCents !== configuredPlatformFeeCents
              || paymentWashoutServiceFeeCents !== canonicalDriverTipCents
            ) {
              const [updatedPayment] = await tx
                .update(payments)
                .set({
                  amount: (canonicalDriverTipCents / 100).toFixed(2),
                  processingFee: (configuredPlatformFeeCents / 100).toFixed(2),
                  washoutServiceFee: (canonicalDriverTipCents / 100).toFixed(2),
                  updatedAt: new Date(),
                })
                .where(eq(payments.id, currentPayment.id))
                .returning();

              paymentId = updatedPayment.id;
              paymentAmountCents = canonicalDriverTipCents;
              paymentProcessingFeeCents = configuredPlatformFeeCents;
              paymentWashoutServiceFeeCents = canonicalDriverTipCents;
            }

            const [lockedWallet] = await tx
              .select()
              .from(driverWallets)
              .where(eq(driverWallets.driverId, row.driverId))
              .for("update");

            let wallet = lockedWallet;
            if (!wallet) {
              const seededAvailableBalanceCents = row.walletTransactionId && row.walletTransactionBalanceAfter
                ? normalizeMoneyToCents(row.walletTransactionBalanceAfter, "dollars")
                : 0;
              [wallet] = await tx.insert(driverWallets).values({
                driverId: row.driverId,
                availableBalance: (seededAvailableBalanceCents / 100).toFixed(2),
                pendingBalance: "0.00",
                updatedAt: new Date(),
              }).returning();
            }

            const currentWalletAvailableCents = Math.round(parseFloat(wallet.availableBalance) * 100);
            const walletDeltaCents = canonicalDriverTipCents - currentWalletTxAmountCents;
            const repairWalletTransaction = walletRowMissing || walletDeltaCents !== 0 || !lockedWallet;

            let walletTransactionId = row.walletTransactionId ?? null;
            if (!row.walletTransactionId) {
              const nextAvailableBalanceCents = currentWalletAvailableCents + canonicalDriverTipCents;
              const [createdWalletTransaction] = await tx.insert(walletTransactions).values({
                driverId: row.driverId,
                amount: (canonicalDriverTipCents / 100).toFixed(2),
                direction: "credit",
                balanceAfter: (nextAvailableBalanceCents / 100).toFixed(2),
                currency: "USD",
                sourceType: "washout",
                sourceId: row.activityId,
                status: "posted",
                description: `Washout repair credit for activity ${row.activityId}`,
                metadata: {
                  repairType: "washout_payment_reconciliation",
                  activityId: row.activityId,
                  ownerId: row.ownerId,
                  driverId: row.driverId,
                  paymentId,
                  canonicalDriverTipCents,
                  currentPaymentAmountCents,
                },
              }).returning();

              walletTransactionId = createdWalletTransaction.id;
              await tx
                .update(driverWallets)
                .set({
                  availableBalance: (nextAvailableBalanceCents / 100).toFixed(2),
                  pendingBalance: wallet.pendingBalance,
                  updatedAt: new Date(),
                })
                .where(eq(driverWallets.driverId, row.driverId));
              result.repairedWalletTransactionCount++;
            } else if (repairWalletTransaction) {
              const nextAvailableBalanceCents = currentWalletAvailableCents + walletDeltaCents;
              await tx
                .update(walletTransactions)
                .set({
                  amount: (canonicalDriverTipCents / 100).toFixed(2),
                  balanceAfter: (nextAvailableBalanceCents / 100).toFixed(2),
                  status: "posted",
                  description: `Washout repair credit for activity ${row.activityId}`,
                  metadata: {
                    repairType: "washout_payment_reconciliation",
                    activityId: row.activityId,
                    ownerId: row.ownerId,
                    driverId: row.driverId,
                    paymentId,
                    canonicalDriverTipCents,
                    previousWalletTransactionAmountCents: currentWalletTxAmountCents,
                    walletDeltaCents,
                    currentPaymentAmountCents,
                    paymentProcessingFeeCents,
                    paymentWashoutServiceFeeCents,
                  },
                })
                .where(eq(walletTransactions.id, row.walletTransactionId));

              await tx
                .update(driverWallets)
                .set({
                  availableBalance: (nextAvailableBalanceCents / 100).toFixed(2),
                  pendingBalance: wallet.pendingBalance,
                  updatedAt: new Date(),
                })
                .where(eq(driverWallets.driverId, row.driverId));
              result.repairedWalletTransactionCount++;
            }

            result.repairedCount++;
            result.repairedPayments.push({
              paymentId: paymentId || "",
              ownerId: row.ownerId,
              driverId: row.driverId,
              activityId: row.activityId,
              amountCents: canonicalDriverTipCents,
              processingFeeCents: configuredPlatformFeeCents,
              businessDate,
            });

            console.log("[WASHOUT_PAYMENT_REPAIR]", {
              ownerId: row.ownerId,
              driverId: row.driverId,
              activityId: row.activityId,
              paymentId,
              walletTransactionId,
              amountCents: canonicalDriverTipCents,
              processingFeeCents: configuredPlatformFeeCents,
              businessDate,
              triggeredByAdminId: options.triggeredByAdminId || null,
            });
          });
        }
      } catch (error: any) {
        const message = error instanceof Error ? error.message : String(error);
        result.errors.push(`Owner ${ownerSetting.ownerId}: ${message}`);
        console.error(`❌ [WASHOUT_PAYMENT_REPAIR] Failed for owner ${ownerSetting.ownerId}:`, message);
      }
    }

    return result;
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
        paymentId: payments.id,
        paymentDriverId: payments.driverId,
        paymentOwnerId: payments.ownerId,
        paymentActivityId: payments.activityId,
        paymentAmount: payments.amount,
        paymentProcessingFee: payments.processingFee,
        paymentDriverTipCents: sql<number>`ROUND(CAST(${payments.amount} AS DECIMAL) * 100)`,
        paymentStripePaymentIntentId: payments.stripePaymentIntentId,
        paymentStripeTransferId: payments.stripeTransferId,
        paymentStripeChargeId: payments.stripeChargeId,
        paymentStatus: payments.status,
        paymentRefundedAt: payments.refundedAt,
        paymentRefundAmount: payments.refundAmount,
        paymentRefundReason: payments.refundReason,
        paymentBatchId: payments.batchId,
        paymentPaidAt: payments.paidAt,
        paymentCreatedAt: payments.createdAt,
        paymentUpdatedAt: payments.updatedAt,
        activityId: washoutActivities.id,
        activityDriverId: washoutActivities.driverId,
        activityLocationId: washoutActivities.locationId,
        activityCheckInTime: washoutActivities.checkInTime,
        activityCheckOutTime: washoutActivities.checkOutTime,
        activityStatus: washoutActivities.status,
        activityAmount: washoutActivities.amount,
        activityNotes: washoutActivities.notes,
        locationRate: washoutLocations.rate,
        driverId: drivers.id,
        driverUserId: drivers.userId,
        driverTruckNumber: drivers.truckNumber,
        driverFirstName: users.firstName,
        driverLastName: users.lastName,
        driverEmail: users.email,
        driverPhone: users.phone,
      })
      .from(payments)
      .innerJoin(washoutActivities, eq(payments.activityId, washoutActivities.id))
      .leftJoin(washoutLocations, eq(washoutActivities.locationId, washoutLocations.id))
      .innerJoin(drivers, eq(payments.driverId, drivers.id))
      .innerJoin(users, eq(drivers.userId, users.id))
      .leftJoin(financialHistoryRecords, sql`${financialHistoryRecords.recordType} = 'washout_activity' AND ${financialHistoryRecords.recordId} = ${washoutActivities.id} AND ${financialHistoryRecords.classification} = 'historical_test_data'`)
      .where(and(eq(payments.batchId, batchId), isNull(financialHistoryRecords.id)))
      .orderBy(payments.createdAt);

    return batchPayments.map((row: any) => ({
      id: row.paymentId,
      driverId: row.paymentDriverId,
      ownerId: row.paymentOwnerId,
      activityId: row.paymentActivityId,
      amount: row.paymentAmount,
      processingFee: row.paymentProcessingFee,
      platformFee: row.paymentProcessingFee,
      washoutServiceFee: (getPaymentWashoutServiceFeeCents({ amount: row.paymentAmount }) / 100).toFixed(2),
      tipAmountCents: getPaymentDriverIncentiveCents({ amount: row.paymentAmount }),
      stripePaymentIntentId: row.paymentStripePaymentIntentId,
      stripeTransferId: row.paymentStripeTransferId,
      stripeChargeId: row.paymentStripeChargeId,
      status: row.paymentStatus,
      refundedAt: row.paymentRefundedAt,
      refundAmount: row.paymentRefundAmount,
      refundReason: row.paymentRefundReason,
      batchId: row.paymentBatchId,
      deferReason: null,
      deferredAt: null,
      businessDate: row.paymentCreatedAt ? row.paymentCreatedAt.toISOString().split('T')[0] : null,
      paidAt: row.paymentPaidAt,
      createdAt: row.paymentCreatedAt,
      updatedAt: row.paymentUpdatedAt,
      activity: {
        id: row.activityId,
        driverId: row.activityDriverId,
        locationId: row.activityLocationId,
        checkInTime: row.activityCheckInTime,
        checkOutTime: row.activityCheckOutTime,
        status: row.activityStatus,
        amount: row.activityAmount,
        notes: row.activityNotes,
      } as WashoutActivity,
      driver: {
        id: row.driverId,
        userId: row.driverUserId,
        truckNumber: row.driverTruckNumber,
        licenseNumber: null as any,
        user: {
          id: row.driverUserId,
          username: row.driverEmail,
          email: row.driverEmail,
          passwordHash: "",
          firstName: row.driverFirstName,
          lastName: row.driverLastName,
          role: "driver",
          phone: row.driverPhone,
          street: "",
          city: "",
          state: "",
          zip: "",
          paymentMethod: "ach",
          paymentFrequency: "weekly",
          stripeConnectAccountId: null,
          stripeCustomerId: null,
          stripeConnectBalance: null,
          isActive: true,
          createdAt: row.paymentCreatedAt,
          updatedAt: row.paymentUpdatedAt,
          profileImageUrl: null,
        } as User,
      },
    })) as any;
  }

  async getOwnerBillingSettings(ownerId: string): Promise<{ billingCadence: string; billingCutoffTime: string; billingTimezone: string; billingDayOfWeek: number } | undefined> {
    const [owner] = await db
      .select({
        billingCadence: owners.billingCadence,
        billingCutoffTime: owners.billingCutoffTime,
        billingTimezone: owners.billingTimezone,
        billingDayOfWeek: owners.billingDayOfWeek,
      })
      .from(owners)
      .where(eq(owners.id, ownerId));
    
    if (!owner) return undefined;
    
    return {
      billingCadence: owner.billingCadence || 'weekly',
      billingCutoffTime: owner.billingCutoffTime || '23:59:00',
      billingTimezone: owner.billingTimezone || 'America/Chicago',
      billingDayOfWeek: owner.billingDayOfWeek ?? 0,
    };
  }

  async updateOwnerBillingSettings(ownerId: string, settings: { billingCadence?: string; billingCutoffTime?: string; billingTimezone?: string; billingDayOfWeek?: number }): Promise<Owner> {
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
    if (settings.billingDayOfWeek !== undefined) {
      updateData.billingDayOfWeek = settings.billingDayOfWeek;
    }
    
    const [owner] = await db
      .update(owners)
      .set(updateData)
      .where(eq(owners.id, ownerId))
      .returning();
    
    return owner;
  }

  async getAllOwnersBillingSettings(): Promise<{ ownerId: string; companyName: string; username: string; billingCadence: string; billingCutoffTime: string; billingTimezone: string; billingDayOfWeek: number }[]> {
    const results = await db
      .select({
        ownerId: owners.id,
        companyName: owners.companyName,
        username: users.username,
        billingCadence: owners.billingCadence,
        billingCutoffTime: owners.billingCutoffTime,
        billingTimezone: owners.billingTimezone,
        billingDayOfWeek: owners.billingDayOfWeek,
      })
      .from(owners)
      .innerJoin(users, eq(owners.userId, users.id))
      .orderBy(owners.companyName);
    
    return results.map(r => ({
      ownerId: r.ownerId,
      companyName: r.companyName || r.username,
      username: r.username,
      billingCadence: r.billingCadence || 'weekly',
      billingCutoffTime: r.billingCutoffTime || '23:59:00',
      billingTimezone: r.billingTimezone || 'America/Chicago',
      billingDayOfWeek: r.billingDayOfWeek ?? 0,
    }));
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

  private isLastDayOfMonthInTimezone(timezone: string, referenceTime: Date = new Date()): boolean {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "numeric",
      day: "numeric",
    }).formatToParts(referenceTime);

    const year = Number(parts.find((part) => part.type === "year")?.value || 0);
    const month = Number(parts.find((part) => part.type === "month")?.value || 0);
    const day = Number(parts.find((part) => part.type === "day")?.value || 0);
    if (!year || !month || !day) {
      return false;
    }

    const current = new Date(Date.UTC(year, month - 1, day));
    const next = new Date(current);
    next.setUTCDate(current.getUTCDate() + 1);
    return next.getUTCMonth() !== current.getUTCMonth();
  }

  // Daily batch processing implementation
  async processDailyBatches(cutoffDate?: string): Promise<{ processed: number; failed: number; errors: string[] }> {
    // Phase 3A: the legacy scheduler is not a canonical execution rail. Fence
    // it before it can select, claim, create, or mutate financial records.
    if (isLegacyFinancialExecutionFenced()) {
      logFinancialExecutionDenied({
        operation: "storage.processDailyBatches",
        category: "scheduler",
        reason: "legacy_scheduler_retired_pending_canonical_collection",
      });
      return {
        processed: 0,
        failed: 0,
        errors: ["Financial execution is disabled; legacy daily batch processing is retired."],
      };
    }

    const results = {
      processed: 0,
      failed: 0,
      errors: [] as string[]
    };

    try {
      // ===== AUTO-APPROVAL: Process expired pending activities (72 hours) =====
      try {
        console.log(`\n🤖 Starting auto-approval check for expired activities...`);
        const autoApprovalResult = await this.autoApproveExpiredActivities(72);
        console.log(`🤖 Auto-approval complete: ${autoApprovalResult.approved} approved, ${autoApprovalResult.failed} failed`);
        
        if (autoApprovalResult.errors.length > 0) {
          results.errors.push(...autoApprovalResult.errors.map(e => `Auto-approval: ${e}`));
        }
      } catch (error: any) {
        console.error('❌ Auto-approval processing error:', error);
        results.errors.push(`Auto-approval: ${error.message}`);
      }

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

          // Check billing cadence to determine if we should process this owner
          const { billingCadence, billingDayOfWeek, billingTimezone } = billingSettings;

          // Skip legacy immediate cadence - payments are processed in real-time via Stripe Connect
          if (billingCadence === 'immediate') {
            console.log(`⏭️  Skipping owner ${ownerId} - legacy immediate cadence (processed in real-time)`);
            continue;
          }

          // For weekly cadence, check if today is the billing day
          if (billingCadence === 'weekly') {
            // Get current day of week in owner's timezone (0 = Sunday, 6 = Saturday)
            const ownerNow = new Date(new Date().toLocaleString('en-US', { timeZone: billingTimezone }));
            const currentDayOfWeek = ownerNow.getDay();
            
            if (currentDayOfWeek !== billingDayOfWeek) {
              console.log(`⏭️  Skipping owner ${ownerId} - weekly cadence, today is ${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][currentDayOfWeek]}, billing day is ${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][billingDayOfWeek]}`);
              continue;
            }
            console.log(`📅 Owner ${ownerId} - weekly cadence, today is billing day (${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][billingDayOfWeek]})`);
          }

          if (billingCadence === 'monthly') {
            const dueThisMonth = this.isLastDayOfMonthInTimezone(billingTimezone);
            if (!dueThisMonth) {
              console.log(`⏭️  Skipping owner ${ownerId} - monthly cadence, today is not the last day of the month in ${billingTimezone}`);
              continue;
            }
            console.log(`📅 Owner ${ownerId} - monthly cadence, today is the last day of the month (${billingTimezone})`);
          }

          // Calculate business date for this owner (daily, weekly, or monthly)
          const ownerBusinessDate = cutoffDate || this.calculateBusinessDate(
            billingSettings.billingTimezone,
            billingSettings.billingCutoffTime
          );

          console.log(`📅 Processing owner ${ownerId} for business date ${ownerBusinessDate} (cadence: ${billingCadence}, timezone: ${billingSettings.billingTimezone}, cutoff: ${billingSettings.billingCutoffTime})`);

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

        // Process pending fees by debiting owner wallets and recording ledger payment
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
    const billingStart = new Date(`${businessDate}T00:00:00.000Z`);
    const billingEnd = new Date(`${businessDate}T23:59:59.999Z`);
    const existingBatch = await this.getBillingBatchByOwnerAndDate(ownerId, businessDate);
    const stripe = await this.getStripeInstance();

    const result = await processOwnerBillingRun({
      ownerId,
      runType: 'weekly_scheduled',
      startDate: billingStart,
      endDate: billingEnd,
      existingBatchId: existingBatch?.id || null,
      storage: this as any,
      stripeClient: stripe,
    });

    const ownerResult = result.runs[0];
    if (!ownerResult) {
      console.log(`ℹ️  No billing run result returned for owner ${ownerId} on ${businessDate}`);
      return;
    }

    if (ownerResult.status === 'failed') {
      console.error(`❌ Billing run failed for owner ${ownerId} on ${businessDate}: ${ownerResult.message}`);
      throw new Error(ownerResult.message);
    }

    if (ownerResult.status === 'skipped') {
      console.log(`ℹ️  Billing run skipped for owner ${ownerId} on ${businessDate}: ${ownerResult.message}`);
      return;
    }

    console.log(
      `✅ Billing run processed for owner ${ownerId} on ${businessDate}: ${ownerResult.washoutCount} washouts, $${(ownerResult.amountCents / 100).toFixed(2)}`
    );
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

  // ============= PENDING WASHOUT PAYMENT OPERATIONS (HOURLY BATCH PROCESSING) =============

  async createPendingWashoutPayment(payment: InsertPendingWashoutPayment): Promise<PendingWashoutPayment> {
    const [pendingPayment] = await db
      .insert(pendingWashoutPayments)
      .values(payment)
      .returning();
    return pendingPayment;
  }

  async getPendingWashoutPaymentsByOwner(ownerId: string): Promise<(PendingWashoutPayment & { activity: WashoutActivity; driver: Driver & { user: User }; location: WashoutLocation })[]> {
    return await db
      .select({
        ...getTableColumns(pendingWashoutPayments),
        activity: washoutActivities,
        driver: drivers,
        user: users,
        location: washoutLocations,
      })
      .from(pendingWashoutPayments)
      .leftJoin(washoutActivities, eq(pendingWashoutPayments.activityId, washoutActivities.id))
      .leftJoin(drivers, eq(pendingWashoutPayments.driverId, drivers.id))
      .leftJoin(users, eq(drivers.userId, users.id))
      .leftJoin(washoutLocations, eq(pendingWashoutPayments.locationId, washoutLocations.id))
      .where(eq(pendingWashoutPayments.ownerId, ownerId)) as any;
  }

  async getPendingWashoutPaymentsByStatus(status: string): Promise<(PendingWashoutPayment & { activity: WashoutActivity; driver: Driver & { user: User }; owner: Owner & { user: User } })[]> {
    return await db
      .select({
        ...getTableColumns(pendingWashoutPayments),
        activity: washoutActivities,
        driver: drivers,
        driverUser: users,
        owner: owners,
        ownerUser: users,
      })
      .from(pendingWashoutPayments)
      .leftJoin(washoutActivities, eq(pendingWashoutPayments.activityId, washoutActivities.id))
      .leftJoin(drivers, eq(pendingWashoutPayments.driverId, drivers.id))
      .leftJoin(users, eq(drivers.userId, users.id))
      .leftJoin(owners, eq(pendingWashoutPayments.ownerId, owners.id))
      .where(eq(pendingWashoutPayments.status, status as any)) as any;
  }

  async updatePendingPaymentStatus(paymentId: string, status: string, batchId?: string, failureReason?: string): Promise<PendingWashoutPayment> {
    const updates: any = {
      status: status as any,
      updatedAt: new Date(),
    };
    if (batchId) updates.batchId = batchId;
    if (failureReason) updates.failureReason = failureReason;
    if (status === 'processed') updates.processedAt = new Date();

    const [updated] = await db
      .update(pendingWashoutPayments)
      .set(updates)
      .where(eq(pendingWashoutPayments.id, paymentId))
      .returning();
    return updated;
  }

  async getAllPendingWashoutPayments(): Promise<(PendingWashoutPayment & { activity: WashoutActivity; driver: Driver & { user: User }; owner: Owner & { user: User }; location: WashoutLocation })[]> {
    return await db
      .select({
        ...getTableColumns(pendingWashoutPayments),
        activity: washoutActivities,
        driver: drivers,
        driverUser: users,
        owner: owners,
        ownerUser: users,
        location: washoutLocations,
      })
      .from(pendingWashoutPayments)
      .leftJoin(washoutActivities, eq(pendingWashoutPayments.activityId, washoutActivities.id))
      .leftJoin(drivers, eq(pendingWashoutPayments.driverId, drivers.id))
      .leftJoin(users, eq(drivers.userId, users.id))
      .leftJoin(owners, eq(pendingWashoutPayments.ownerId, owners.id))
      .leftJoin(washoutLocations, eq(pendingWashoutPayments.locationId, washoutLocations.id)) as any;
  }

  // ============= WASHOUT PAYMENT BATCH OPERATIONS (HOURLY BATCH PROCESSING) =============

  async createWashoutPaymentBatch(batch: InsertWashoutPaymentBatch): Promise<WashoutPaymentBatch> {
    const [created] = await db
      .insert(washoutPaymentBatches)
      .values(batch)
      .returning();
    return created;
  }

  async getWashoutPaymentBatch(id: string): Promise<WashoutPaymentBatch | undefined> {
    const [batch] = await db
      .select()
      .from(washoutPaymentBatches)
      .where(eq(washoutPaymentBatches.id, id));
    return batch;
  }

  async getWashoutPaymentBatchesByOwner(ownerId: string): Promise<WashoutPaymentBatch[]> {
    return await db
      .select()
      .from(washoutPaymentBatches)
      .where(eq(washoutPaymentBatches.ownerId, ownerId))
      .orderBy(desc(washoutPaymentBatches.batchTime));
  }

  async getWashoutPaymentBatchesByStatus(status: string): Promise<(WashoutPaymentBatch & { owner: Owner & { user: User } })[]> {
    return await db
      .select({
        ...getTableColumns(washoutPaymentBatches),
        owner: owners,
        user: users,
      })
      .from(washoutPaymentBatches)
      .leftJoin(owners, eq(washoutPaymentBatches.ownerId, owners.id))
      .leftJoin(users, eq(owners.userId, users.id))
      .where(eq(washoutPaymentBatches.status, status as any)) as any;
  }

  async updateWashoutPaymentBatchStatus(batchId: string, status: string, stripePaymentIntentId?: string, failureReason?: string): Promise<WashoutPaymentBatch> {
    const updates: any = {
      status: status as any,
      updatedAt: new Date(),
    };
    if (stripePaymentIntentId) updates.stripePaymentIntentId = stripePaymentIntentId;
    if (failureReason) updates.failureReason = failureReason;
    if (status === 'processing') updates.processingStartedAt = new Date();

    const [updated] = await db
      .update(washoutPaymentBatches)
      .set(updates)
      .where(eq(washoutPaymentBatches.id, batchId))
      .returning();
    return updated;
  }

  async markWashoutPaymentBatchCompleted(batchId: string): Promise<WashoutPaymentBatch> {
    const [updated] = await db
      .update(washoutPaymentBatches)
      .set({
        status: 'completed',
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(washoutPaymentBatches.id, batchId))
      .returning();
    return updated;
  }

  async getPendingPaymentsForOwner(ownerId: string): Promise<(PendingWashoutPayment & { activity: WashoutActivity; driver: Driver & { user: User } })[]> {
    return await db
      .select({
        ...getTableColumns(pendingWashoutPayments),
        activity: washoutActivities,
        driver: drivers,
        user: users,
      })
      .from(pendingWashoutPayments)
      .leftJoin(washoutActivities, eq(pendingWashoutPayments.activityId, washoutActivities.id))
      .leftJoin(drivers, eq(pendingWashoutPayments.driverId, drivers.id))
      .leftJoin(users, eq(drivers.userId, users.id))
      .where(
        and(
          eq(pendingWashoutPayments.ownerId, ownerId),
          eq(pendingWashoutPayments.status, 'queued')
        )
      ) as any;
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
      .where(eq(feesLedger.status, status as any))
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
    if (!owner) return undefined;
    return {
      subscriptionPlan: owner.subscriptionPlan || "none",
      subscriptionFeeCents: owner.subscriptionFeeCents ?? 0,
      feeAnchorDay: owner.feeAnchorDay ?? 1,
      lastFeeBillingDate: owner.lastFeeBillingDate,
    };
  }

  async updateOwnerSubscriptionSettings(
    ownerId: string, 
    settings: { subscriptionPlan?: "none" | "monthly" | "annual" | "one_time"; subscriptionFeeCents?: number; feeAnchorDay?: number }
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

  async getOwnerSubscription(
    ownerId: string
  ): Promise<{ subscriptionStatus: string; pastDueDate: Date | null; gracePeriodStartDate: Date | null; lastReminderSent: Date | null } | undefined> {
    const [owner] = await db
      .select({
        subscriptionStatus: owners.subscriptionStatus,
        pastDueDate: owners.pastDueDate,
        gracePeriodStartDate: owners.gracePeriodStartDate,
        lastReminderSent: owners.lastReminderSent,
      })
      .from(owners)
      .where(eq(owners.id, ownerId));
    return owner as any;
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

        // Skip subscription fees - membership is now one-time $15.00 payment during signup
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
                locationAddress: formatAddress(location),
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
    // This legacy fee processor debits owner wallet balances and creates
    // transactions. It has no canonical execution authorization boundary.
    assertLegacyFinancialExecutionRetired("facility_collection", "storage.processPendingFees");

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

          // Debit owner wallet and record the fee payment
          await db.transaction(async (tx) => {
            const feeAmount = (feeCents / 100).toFixed(2);
            const balanceBefore = walletBalance.balance;
            const balanceAfter = ((balanceCents - feeCents) / 100).toFixed(2);
            const transferId: string | null = null;

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
                columnTransferId: transferId,
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

            // Mark fee as paid
            await tx
              .update(feesLedger)
              .set({
                status: 'paid',
                walletTxId: walletTx.id,
                columnTransferId: transferId,
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

  async updateFeatureFlagRoles(flagKey: string, allowedRoles: string[]): Promise<FeatureFlag> {
    const [updated] = await db
      .update(featureFlags)
      .set({ allowedRoles, updatedAt: new Date() })
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

  // System settings operations
  async getSystemSettings(): Promise<SystemSettings> {
    try {
      const result = await db.select().from(systemSettings);
      const settings = Array.isArray(result) ? result[0] : (result as Array<SystemSettings> | undefined)?.[0];

      // If no settings exist, create default settings
      if (!settings) {
        const inserted = await db
          .insert(systemSettings)
          .values({
            automaticTaxEnabled: false,
          })
          .returning();
        const newSettings = Array.isArray(inserted) ? inserted[0] : (inserted as Array<SystemSettings> | undefined)?.[0];
        if (newSettings) {
          return newSettings;
        }
        return {
          id: "system-default",
          automaticTaxEnabled: false,
          platformWashoutFee: "5.00",
          updatedAt: new Date(),
          updatedBy: null,
        } as SystemSettings;
      }

      return settings;
    } catch (error) {
      if (process.env.NODE_ENV === "test") {
        return {
          id: "system-default",
          automaticTaxEnabled: false,
          platformWashoutFee: "5.00",
          updatedAt: new Date(),
          updatedBy: null,
        } as SystemSettings;
      }
      throw error;
    }
  }

  async updateSystemSettings(settingsUpdate: UpdateSystemSettings, updatedBy: string): Promise<SystemSettings> {
    // Get or create settings first
    const currentSettings = await this.getSystemSettings();
    
    // Update the settings
    const [updated] = await db
      .update(systemSettings)
      .set({
        ...settingsUpdate,
        updatedAt: new Date(),
        updatedBy,
      })
      .where(eq(systemSettings.id, currentSettings.id))
      .returning();
    
    return updated;
  }

  // Identity document operations (for Stripe fraud prevention)
  async createIdentityDocument(doc: any): Promise<IdentityDocument> {
    const [newDoc] = await db.insert(identityDocuments).values(doc).returning();
    return newDoc;
  }

  async getIdentityDocumentByUserId(userId: string): Promise<IdentityDocument | undefined> {
    const [doc] = await db.select().from(identityDocuments).where(eq(identityDocuments.userId, userId));
    return doc;
  }

  async getIdentityDocument(docId: string): Promise<IdentityDocument | undefined> {
    const [doc] = await db.select().from(identityDocuments).where(eq(identityDocuments.id, docId));
    return doc;
  }

  async updateIdentityDocument(docId: string, updates: any): Promise<IdentityDocument> {
    const [updated] = await db
      .update(identityDocuments)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(identityDocuments.id, docId))
      .returning();
    return updated;
  }

  // Custom billing model operations (feature flag per owner)
  async updateOwnerCustomBillingModel(ownerId: string, settings: { useCustomBillingModel?: boolean; customWashoutRate?: string | null }): Promise<Owner> {
    const updateData: any = {
      updatedAt: new Date(),
    };
    if (settings.useCustomBillingModel !== undefined) {
      updateData.useCustomBillingModel = settings.useCustomBillingModel;
    }
    if (settings.customWashoutRate !== undefined) {
      updateData.customWashoutRate = settings.customWashoutRate;
    }
    const [updated] = await db
      .update(owners)
      .set(updateData)
      .where(eq(owners.id, ownerId))
      .returning();
    return updated;
  }

  async getOwnersWithCustomBillingModel(): Promise<(Owner & { user: User })[]> {
    const results = await db
      .select()
      .from(owners)
      .innerJoin(users, eq(owners.userId, users.id))
      .where(eq(owners.useCustomBillingModel, true));
    return results.map(r => ({ ...r.owners, user: r.users }));
  }

  // Driver Rewards Program prize catalog operations
  async getPrizeCatalog(): Promise<PrizeCatalog[]> {
    return await db
      .select()
      .from(prizeCatalog)
      .orderBy(desc(prizeCatalog.updatedAt), desc(prizeCatalog.createdAt));
  }

  async getPrizeCatalogById(id: string): Promise<PrizeCatalog | undefined> {
    const [record] = await db
      .select()
      .from(prizeCatalog)
      .where(eq(prizeCatalog.id, id));
    return record;
  }

  async createPrizeCatalogItem(item: InsertPrizeCatalog): Promise<PrizeCatalog> {
    const values = Object.fromEntries(
      Object.entries(item).filter(([, value]) => value !== undefined)
    ) as InsertPrizeCatalog;

    const [record] = await db
      .insert(prizeCatalog)
      .values({
        ...values,
        lastInventoryUpdate: new Date(),
      })
      .returning();
    return record;
  }

  async updatePrizeCatalogItem(id: string, updates: UpdatePrizeCatalog): Promise<PrizeCatalog> {
    const values = Object.fromEntries(
      Object.entries(updates).filter(([, value]) => value !== undefined)
    ) as UpdatePrizeCatalog;
    const inventoryFieldsChanged = ["inventoryQuantity", "minimumInventoryAlert", "isUnlimited"].some((key) =>
      Object.prototype.hasOwnProperty.call(values, key)
    );

    const [record] = await db
      .update(prizeCatalog)
      .set({
        ...values,
        ...(inventoryFieldsChanged ? { lastInventoryUpdate: new Date() } : {}),
        updatedAt: new Date(),
      })
      .where(eq(prizeCatalog.id, id))
      .returning();
    return record;
  }

  async updatePrizeCatalogItemStatus(id: string, isActive: boolean): Promise<PrizeCatalog> {
    const [record] = await db
      .update(prizeCatalog)
      .set({
        isActive,
        updatedAt: new Date(),
      })
      .where(eq(prizeCatalog.id, id))
      .returning();
    return record;
  }

  async adjustPrizeCatalogInventory(
    prizeCatalogId: string,
    delta: number,
    options: {
      adjustmentType?: PrizeCatalogInventoryAdjustmentType;
      reason: string;
      referenceType?: string | null;
      referenceId?: string | null;
      metadata?: Record<string, unknown> | null;
      createdBy: string;
    }
  ): Promise<{ catalog: PrizeCatalog; adjustment: PrizeCatalogInventoryAdjustment }> {
    if (!Number.isInteger(delta) || delta === 0) {
      throw new Error("Quantity delta must be a non-zero integer");
    }
    if (!options.reason || !String(options.reason).trim()) {
      throw new Error("Reason is required");
    }

    return await db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(prizeCatalog)
        .where(eq(prizeCatalog.id, prizeCatalogId));

      if (!current) {
        throw new Error("Prize catalog item not found");
      }

      const currentInventory = Number(current.inventoryQuantity || 0);
      const currentReserved = Number(current.reservedQuantity || 0);
      const nextInventory = currentInventory + delta;

      if (nextInventory < 0) {
        throw new Error("Inventory cannot be negative");
      }
      if (currentReserved < 0) {
        throw new Error("Reserved quantity cannot be negative");
      }

      const adjustmentType = options.adjustmentType
        ?? (delta > 0 ? "manual_increase" : "manual_decrease");

      const [catalog] = await tx
        .update(prizeCatalog)
        .set({
          inventoryQuantity: nextInventory,
          inventoryUpdatedBy: options.createdBy,
          lastInventoryUpdate: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(prizeCatalog.id, prizeCatalogId))
        .returning();

      const [adjustment] = await tx
        .insert(prizeCatalogInventoryAdjustments)
        .values({
          prizeCatalogId,
          adjustmentType,
          quantityDelta: delta,
          quantityBefore: currentInventory,
          quantityAfter: nextInventory,
          reservedBefore: currentReserved,
          reservedAfter: currentReserved,
          referenceType: options.referenceType?.trim() || null,
          referenceId: options.referenceId?.trim() || null,
          reason: options.reason.trim(),
          createdBy: options.createdBy,
          metadata: options.metadata ?? null,
        })
        .returning();

      return { catalog, adjustment };
    });
  }

  async getPrizeCatalogInventoryHistory(prizeCatalogId: string): Promise<PrizeCatalogInventoryAdjustment[]> {
    return await db
      .select()
      .from(prizeCatalogInventoryAdjustments)
      .where(eq(prizeCatalogInventoryAdjustments.prizeCatalogId, prizeCatalogId))
      .orderBy(desc(prizeCatalogInventoryAdjustments.createdAt));
  }

  async getPrizeCatalogInventorySummary(prizeCatalogId: string): Promise<{
    catalog: PrizeCatalog;
    availableQuantity: number;
    isLowInventory: boolean;
    lastAdjustment: PrizeCatalogInventoryAdjustment | null;
  }> {
    const [catalog] = await db
      .select()
      .from(prizeCatalog)
      .where(eq(prizeCatalog.id, prizeCatalogId));

    if (!catalog) {
      throw new Error("Prize catalog item not found");
    }

    const [lastAdjustment] = await db
      .select()
      .from(prizeCatalogInventoryAdjustments)
      .where(eq(prizeCatalogInventoryAdjustments.prizeCatalogId, prizeCatalogId))
      .orderBy(desc(prizeCatalogInventoryAdjustments.createdAt))
      .limit(1);

    const inventoryQuantity = Number(catalog.inventoryQuantity || 0);
    const reservedQuantity = Number(catalog.reservedQuantity || 0);
    const availableQuantity = Math.max(0, inventoryQuantity - reservedQuantity);
    const isLowInventory = !catalog.isUnlimited && inventoryQuantity <= Number(catalog.minimumInventoryAlert || 0);

    return {
      catalog,
      availableQuantity,
      isLowInventory,
      lastAdjustment: lastAdjustment || null,
    };
  }

  // Lottery drawings operations
  async createLotteryDrawing(data: any): Promise<any> {
    const [drawing] = await db.insert(lotteryDrawings).values(data).returning();
    return drawing;
  }

  async getLotteryDrawings(): Promise<any[]> {
    // A drawing may span the clean-slate boundary.  It is operationally visible
    // only when it has at least one entry whose source activity is current; the
    // callers then receive only the current entries, winners, and fulfillments.
    const rows = await db
      .select({ drawing: lotteryDrawings })
      .from(lotteryDrawings)
      .innerJoin(
        driverLotteryEntries,
        and(
          eq(driverLotteryEntries.lotteryMonth, lotteryDrawings.lotteryMonth),
          eq(driverLotteryEntries.lotteryYear, lotteryDrawings.lotteryYear),
        ),
      )
      .innerJoin(washoutActivities, eq(driverLotteryEntries.activityId, washoutActivities.id))
      .leftJoin(financialHistoryRecords, sql`${financialHistoryRecords.recordType} = 'washout_activity' AND ${financialHistoryRecords.recordId} = ${washoutActivities.id} AND ${financialHistoryRecords.classification} = 'historical_test_data'`)
      .where(isNull(financialHistoryRecords.id))
      .orderBy(desc(lotteryDrawings.drawingDate));

    return Array.from(new Map(rows.map((row: any) => [row.drawing.id, row.drawing])).values());
  }

  async getLotteryDrawingByMonthYear(month: number, year: number): Promise<any | undefined> {
    const drawings = await this.getLotteryDrawings();
    return drawings.find((drawing: any) => drawing.lotteryMonth === month && drawing.lotteryYear === year);
  }

  async createLotteryDrawingWinner(winner: InsertLotteryDrawingWinner): Promise<LotteryDrawingWinner> {
    const values = Object.fromEntries(
      Object.entries(winner).filter(([, value]) => value !== undefined)
    ) as InsertLotteryDrawingWinner;

    const [record] = await db
      .insert(lotteryDrawingWinners)
      .values(values)
      .onConflictDoUpdate({
        target: [lotteryDrawingWinners.lotteryDrawingId, lotteryDrawingWinners.placeIndex],
        set: values,
      })
      .returning();
    return record;
  }

  async getLotteryDrawingWinners(drawingId: string): Promise<any[]> {
    const results = await db
      .select({
        winner: lotteryDrawingWinners,
        driver: drivers,
        driverUser: users,
        entry: driverLotteryEntries,
      })
      .from(lotteryDrawingWinners)
      .innerJoin(drivers, eq(lotteryDrawingWinners.driverId, drivers.id))
      .innerJoin(users, eq(drivers.userId, users.id))
      .innerJoin(driverLotteryEntries, eq(lotteryDrawingWinners.entryId, driverLotteryEntries.id))
      .innerJoin(washoutActivities, eq(driverLotteryEntries.activityId, washoutActivities.id))
      .leftJoin(financialHistoryRecords, sql`${financialHistoryRecords.recordType} = 'washout_activity' AND ${financialHistoryRecords.recordId} = ${washoutActivities.id} AND ${financialHistoryRecords.classification} = 'historical_test_data'`)
      .where(and(eq(lotteryDrawingWinners.lotteryDrawingId, drawingId), isNull(financialHistoryRecords.id)))
      .orderBy(asc(lotteryDrawingWinners.placeIndex));

    return results.map((row) => ({
      ...row.winner,
      driver: { ...row.driver, user: row.driverUser },
      entry: row.entry,
      driverName: `${row.driverUser.firstName} ${row.driverUser.lastName}`,
    }));
  }

  async getPendingLotteryDrawings(): Promise<any[]> {
    return (await this.getLotteryDrawings()).filter((drawing: any) =>
      drawing.firstPlaceDelivered === false
      || drawing.secondPlaceDelivered === false
      || drawing.thirdPlaceDelivered === false,
    );
  }

  async markLotteryPrizeDelivered(drawingId: string, place: 'first' | 'second' | 'third'): Promise<any> {
    const now = new Date();
    const updates: any = {};
    if (place === 'first') { updates.firstPlaceDelivered = true; updates.firstPlaceDeliveredAt = now; }
    if (place === 'second') { updates.secondPlaceDelivered = true; updates.secondPlaceDeliveredAt = now; }
    if (place === 'third') { updates.thirdPlaceDelivered = true; updates.thirdPlaceDeliveredAt = now; }
    const [updated] = await db.update(lotteryDrawings).set(updates).where(eq(lotteryDrawings.id, drawingId)).returning();
    return updated;
  }

  async updateLotteryDrawingNotificationSummary(drawingId: string, updates: {
    winnerNotificationCount?: number;
    winnerNotificationsSentAt?: Date | null;
    participantNotificationCount?: number;
    participantNotificationsSentAt?: Date | null;
  }): Promise<any> {
    const [updated] = await db
      .update(lotteryDrawings)
      .set(updates)
      .where(eq(lotteryDrawings.id, drawingId))
      .returning();
    return updated;
  }

  async getLotteryDrawingHistoryWithWinners(): Promise<any[]> {
    const drawings = await this.getLotteryDrawings();
    if (drawings.length === 0) {
      return [];
    }

    const winners = await db
      .select({
        winner: lotteryDrawingWinners,
        driver: drivers,
        driverUser: users,
        entry: driverLotteryEntries,
      })
      .from(lotteryDrawingWinners)
      .innerJoin(drivers, eq(lotteryDrawingWinners.driverId, drivers.id))
      .innerJoin(users, eq(drivers.userId, users.id))
      .innerJoin(driverLotteryEntries, eq(lotteryDrawingWinners.entryId, driverLotteryEntries.id))
      .innerJoin(washoutActivities, eq(driverLotteryEntries.activityId, washoutActivities.id))
      .leftJoin(financialHistoryRecords, sql`${financialHistoryRecords.recordType} = 'washout_activity' AND ${financialHistoryRecords.recordId} = ${washoutActivities.id} AND ${financialHistoryRecords.classification} = 'historical_test_data'`)
      .where(isNull(financialHistoryRecords.id))
      .orderBy(desc(lotteryDrawingWinners.createdAt));

    const winnersByDrawing = new Map<string, any[]>();
    for (const row of winners) {
      const mapped = {
        ...row.winner,
        driver: { ...row.driver, user: row.driverUser },
        entry: row.entry,
        driverName: `${row.driverUser.firstName} ${row.driverUser.lastName}`,
      };
      const existing = winnersByDrawing.get(row.winner.lotteryDrawingId) || [];
      existing.push(mapped);
      winnersByDrawing.set(row.winner.lotteryDrawingId, existing);
    }

    return drawings.map((drawing: any) => {
      const winnerRows = winnersByDrawing.get(drawing.id);
      if (winnerRows?.length) {
        return {
          ...drawing,
          winners: winnerRows.sort((a, b) => (a.placeIndex || 0) - (b.placeIndex || 0)),
        };
      }

      return {
        ...drawing,
        winners: [],
      };
    });
  }

  async getDriverLotteryHistory(driverId: string): Promise<any[]> {
    const winnerNotification = alias(lotteryNotifications, "driver_lottery_history_winner_notification");
    const participantNotification = alias(lotteryNotifications, "driver_lottery_history_participant_notification");

    const results = await db
      .select({
        drawing: lotteryDrawings,
        entry: driverLotteryEntries,
        winner: lotteryDrawingWinners,
        winnerNotification,
        participantNotification,
      })
      .from(driverLotteryEntries)
      .innerJoin(washoutActivities, eq(driverLotteryEntries.activityId, washoutActivities.id))
      .innerJoin(
        lotteryDrawings,
        and(
          eq(driverLotteryEntries.lotteryMonth, lotteryDrawings.lotteryMonth),
          eq(driverLotteryEntries.lotteryYear, lotteryDrawings.lotteryYear),
        ),
      )
      .leftJoin(lotteryDrawingWinners, eq(driverLotteryEntries.id, lotteryDrawingWinners.entryId))
      .leftJoin(
        winnerNotification,
        and(
          eq(winnerNotification.lotteryDrawingId, lotteryDrawings.id),
          eq(winnerNotification.driverId, driverId),
          eq(winnerNotification.notificationKind, "winner"),
        ),
      )
      .leftJoin(
        participantNotification,
        and(
          eq(participantNotification.lotteryDrawingId, lotteryDrawings.id),
          eq(participantNotification.driverId, driverId),
          eq(participantNotification.notificationKind, "participant"),
        ),
      )
      .leftJoin(financialHistoryRecords, sql`${financialHistoryRecords.recordType} = 'washout_activity' AND ${financialHistoryRecords.recordId} = ${washoutActivities.id} AND ${financialHistoryRecords.classification} = 'historical_test_data'`)
      .where(and(eq(driverLotteryEntries.driverId, driverId), isNull(financialHistoryRecords.id)))
      .orderBy(desc(lotteryDrawings.drawingDate), desc(driverLotteryEntries.createdAt), asc(lotteryDrawingWinners.placeIndex));

    const historyByDrawing = new Map<string, any>();

    for (const row of results) {
      const drawing = row.drawing;
      if (!drawing) {
        continue;
      }

      const existing = historyByDrawing.get(drawing.id) || {
        drawingId: drawing.id,
        lotteryMonth: drawing.lotteryMonth,
        lotteryYear: drawing.lotteryYear,
        drawingDate: drawing.drawingDate,
        status: "completed",
        won: false,
        placeIndex: null,
        ticketNumber: null,
        prizeTitle: null,
        prizeDescription: null,
        notificationStatus: row.winnerNotification?.sentAt || row.participantNotification?.sentAt ? "sent" : "none",
        notificationSentAt: row.winnerNotification?.sentAt || row.participantNotification?.sentAt || null,
        createdAt: drawing.createdAt,
      };

      const winnerPlaceIndex = row.winner?.placeIndex != null ? Number(row.winner.placeIndex) : null;
      if (row.winner && winnerPlaceIndex != null) {
        const currentPlaceIndex = existing.placeIndex != null ? Number(existing.placeIndex) : Number.POSITIVE_INFINITY;
        if (!existing.won || winnerPlaceIndex < currentPlaceIndex) {
          existing.won = true;
          existing.placeIndex = winnerPlaceIndex;
          existing.ticketNumber = row.winner.ticketNumber || null;
          existing.prizeTitle = row.winner.prizeTitle || null;
          existing.prizeDescription = row.winner.prizeDescription || null;
        }
        if (row.winnerNotification?.sentAt) {
          existing.notificationStatus = "sent";
          existing.notificationSentAt = row.winnerNotification.sentAt;
        }
      } else if (!existing.notificationSentAt && row.participantNotification?.sentAt) {
        existing.notificationStatus = "sent";
        existing.notificationSentAt = row.participantNotification.sentAt;
      }

      historyByDrawing.set(drawing.id, existing);
    }

    return Array.from(historyByDrawing.values()).sort((a, b) => {
      const left = a.drawingDate ? new Date(a.drawingDate).getTime() : 0;
      const right = b.drawingDate ? new Date(b.drawingDate).getTime() : 0;
      return right - left;
    });
  }

  async getDriverLotteryFulfillments(driverId: string): Promise<any[]> {
    const results = await db
      .select({
        fulfillment: lotteryDrawingFulfillments,
        drawing: lotteryDrawings,
      })
      .from(lotteryDrawingFulfillments)
      .innerJoin(lotteryDrawingWinners, eq(lotteryDrawingFulfillments.lotteryDrawingWinnerId, lotteryDrawingWinners.id))
      .innerJoin(lotteryDrawings, eq(lotteryDrawingFulfillments.lotteryDrawingId, lotteryDrawings.id))
      .innerJoin(driverLotteryEntries, eq(lotteryDrawingFulfillments.entryId, driverLotteryEntries.id))
      .innerJoin(washoutActivities, eq(driverLotteryEntries.activityId, washoutActivities.id))
      .leftJoin(financialHistoryRecords, sql`${financialHistoryRecords.recordType} = 'washout_activity' AND ${financialHistoryRecords.recordId} = ${washoutActivities.id} AND ${financialHistoryRecords.classification} = 'historical_test_data'`)
      .where(and(eq(lotteryDrawingFulfillments.driverId, driverId), isNull(financialHistoryRecords.id)))
      .orderBy(desc(lotteryDrawingFulfillments.updatedAt), desc(lotteryDrawingFulfillments.createdAt));

    const resolveTrackingStatus = (fulfillment: typeof lotteryDrawingFulfillments.$inferSelect) => {
      const status = fulfillment.fulfillmentStatus;
      if (status === "canceled" || fulfillment.canceledAt) {
        return "canceled";
      }
      if (status === "issue" || fulfillment.issueReportedAt) {
        return "issue";
      }
      if (status === "delivered" || status === "picked_up" || fulfillment.fulfilledAt) {
        return "fulfilled";
      }
      if (status === "ordered" || status === "purchased" || status === "shipped") {
        return "in_progress";
      }
      return "pending";
    };

    return results.map((row: any) => ({
      drawingMonth: row.fulfillment.drawingMonth,
      drawingYear: row.fulfillment.drawingYear,
      prizeTitle: row.fulfillment.prizeTitleSnapshot,
      prizeDescription: row.fulfillment.prizeDescriptionSnapshot || null,
      fulfillmentStatus: row.fulfillment.fulfillmentStatus,
      trackingStatus: resolveTrackingStatus(row.fulfillment),
      fulfilledAt: row.fulfillment.fulfilledAt || null,
      canceledAt: row.fulfillment.canceledAt || null,
      issueReportedAt: row.fulfillment.issueReportedAt || null,
      createdAt: row.fulfillment.createdAt,
      updatedAt: row.fulfillment.updatedAt,
    }));
  }

  async createLotteryDrawingFulfillments(
    fulfillments: InsertLotteryDrawingFulfillment[],
    tx: any = db,
  ): Promise<LotteryDrawingFulfillment[]> {
    if (!fulfillments.length) {
      return [];
    }

    const values = fulfillments.map((fulfillment) => Object.fromEntries(
      Object.entries(fulfillment).filter(([, value]) => value !== undefined)
    )) as InsertLotteryDrawingFulfillment[];

    await tx
      .insert(lotteryDrawingFulfillments)
      .values(values)
      .onConflictDoNothing({
        target: [lotteryDrawingFulfillments.lotteryDrawingWinnerId],
      });

    return await tx
      .select()
      .from(lotteryDrawingFulfillments)
      .where(inArray(lotteryDrawingFulfillments.lotteryDrawingWinnerId, values.map((row) => row.lotteryDrawingWinnerId)));
  }

  async createLotteryDrawingFulfillmentHistory(
    history: InsertLotteryDrawingFulfillmentHistory[],
    tx: any = db,
  ): Promise<LotteryDrawingFulfillmentHistory[]> {
    if (!history.length) {
      return [];
    }

    const values = history.map((item) => Object.fromEntries(
      Object.entries(item).filter(([, value]) => value !== undefined)
    )) as InsertLotteryDrawingFulfillmentHistory[];

    return await tx
      .insert(lotteryDrawingFulfillmentHistory)
      .values(values)
      .returning();
  }

  async getLotteryDrawingFulfillments(filters?: { status?: string; month?: number; year?: number }): Promise<any[]> {
    const fulfilledByUser = alias(users, "lottery_fulfillments_fulfilled_by_user");
    const conditions = [] as any[];

    if (filters?.status) {
      conditions.push(eq(lotteryDrawingFulfillments.fulfillmentStatus, filters.status as any));
    }
    if (Number.isFinite(Number(filters?.month))) {
      conditions.push(eq(lotteryDrawingFulfillments.drawingMonth, Number(filters?.month)));
    }
    if (Number.isFinite(Number(filters?.year))) {
      conditions.push(eq(lotteryDrawingFulfillments.drawingYear, Number(filters?.year)));
    }

    const query = db
      .select({
        fulfillment: lotteryDrawingFulfillments,
        winner: lotteryDrawingWinners,
        drawing: lotteryDrawings,
        driver: drivers,
        driverUser: users,
        prizeCatalog: prizeCatalog,
        fulfilledByUser,
      })
      .from(lotteryDrawingFulfillments)
      .innerJoin(lotteryDrawingWinners, eq(lotteryDrawingFulfillments.lotteryDrawingWinnerId, lotteryDrawingWinners.id))
      .innerJoin(lotteryDrawings, eq(lotteryDrawingFulfillments.lotteryDrawingId, lotteryDrawings.id))
      .innerJoin(driverLotteryEntries, eq(lotteryDrawingFulfillments.entryId, driverLotteryEntries.id))
      .innerJoin(washoutActivities, eq(driverLotteryEntries.activityId, washoutActivities.id))
      .innerJoin(drivers, eq(lotteryDrawingFulfillments.driverId, drivers.id))
      .innerJoin(users, eq(drivers.userId, users.id))
      .leftJoin(prizeCatalog, eq(lotteryDrawingFulfillments.prizeCatalogId, prizeCatalog.id))
      .leftJoin(fulfilledByUser, eq(lotteryDrawingFulfillments.fulfilledBy, fulfilledByUser.id))
      .leftJoin(financialHistoryRecords, sql`${financialHistoryRecords.recordType} = 'washout_activity' AND ${financialHistoryRecords.recordId} = ${washoutActivities.id} AND ${financialHistoryRecords.classification} = 'historical_test_data'`);

    const results = conditions.length > 0
      ? await query.where(and(...conditions, isNull(financialHistoryRecords.id))).orderBy(desc(lotteryDrawingFulfillments.createdAt))
      : await query.where(isNull(financialHistoryRecords.id)).orderBy(desc(lotteryDrawingFulfillments.createdAt));

    return results.map((row: any) => ({
      ...row.fulfillment,
      winner: row.winner,
      drawing: row.drawing,
      driver: row.driver,
      driverUser: row.driverUser,
      prizeCatalog: row.prizeCatalog,
      fulfilledByUser: row.fulfilledByUser,
      driverName: row.fulfillment.driverNameSnapshot,
    }));
  }

  async getLotteryDrawingFulfillmentById(id: string): Promise<any | undefined> {
    const fulfilledByUser = alias(users, "lottery_fulfillments_fulfilled_by_user_single");
    const [record] = await db
      .select({
        fulfillment: lotteryDrawingFulfillments,
        winner: lotteryDrawingWinners,
        drawing: lotteryDrawings,
        driver: drivers,
        driverUser: users,
        prizeCatalog: prizeCatalog,
        fulfilledByUser,
      })
      .from(lotteryDrawingFulfillments)
      .innerJoin(lotteryDrawingWinners, eq(lotteryDrawingFulfillments.lotteryDrawingWinnerId, lotteryDrawingWinners.id))
      .innerJoin(lotteryDrawings, eq(lotteryDrawingFulfillments.lotteryDrawingId, lotteryDrawings.id))
      .innerJoin(driverLotteryEntries, eq(lotteryDrawingFulfillments.entryId, driverLotteryEntries.id))
      .innerJoin(washoutActivities, eq(driverLotteryEntries.activityId, washoutActivities.id))
      .innerJoin(drivers, eq(lotteryDrawingFulfillments.driverId, drivers.id))
      .innerJoin(users, eq(drivers.userId, users.id))
      .leftJoin(prizeCatalog, eq(lotteryDrawingFulfillments.prizeCatalogId, prizeCatalog.id))
      .leftJoin(fulfilledByUser, eq(lotteryDrawingFulfillments.fulfilledBy, fulfilledByUser.id))
      .leftJoin(financialHistoryRecords, sql`${financialHistoryRecords.recordType} = 'washout_activity' AND ${financialHistoryRecords.recordId} = ${washoutActivities.id} AND ${financialHistoryRecords.classification} = 'historical_test_data'`)
      .where(and(eq(lotteryDrawingFulfillments.id, id), isNull(financialHistoryRecords.id)))
      .limit(1);

    if (!record) {
      return undefined;
    }

    return {
      ...record.fulfillment,
      winner: record.winner,
      drawing: record.drawing,
      driver: record.driver,
      driverUser: record.driverUser,
      prizeCatalog: record.prizeCatalog,
      fulfilledByUser: record.fulfilledByUser,
      driverName: record.fulfillment.driverNameSnapshot,
    };
  }

  async getLotteryDrawingFulfillmentHistory(fulfillmentId: string): Promise<LotteryDrawingFulfillmentHistory[]> {
    const changedByUser = alias(users, "lottery_fulfillments_changed_by_user");
    const results = await db
      .select({
        history: lotteryDrawingFulfillmentHistory,
        changedByUser,
      })
      .from(lotteryDrawingFulfillmentHistory)
      .innerJoin(lotteryDrawingFulfillments, eq(lotteryDrawingFulfillmentHistory.fulfillmentId, lotteryDrawingFulfillments.id))
      .innerJoin(driverLotteryEntries, eq(lotteryDrawingFulfillments.entryId, driverLotteryEntries.id))
      .innerJoin(washoutActivities, eq(driverLotteryEntries.activityId, washoutActivities.id))
      .innerJoin(changedByUser, eq(lotteryDrawingFulfillmentHistory.changedBy, changedByUser.id))
      .leftJoin(financialHistoryRecords, sql`${financialHistoryRecords.recordType} = 'washout_activity' AND ${financialHistoryRecords.recordId} = ${washoutActivities.id} AND ${financialHistoryRecords.classification} = 'historical_test_data'`)
      .where(and(eq(lotteryDrawingFulfillmentHistory.fulfillmentId, fulfillmentId), isNull(financialHistoryRecords.id)))
      .orderBy(desc(lotteryDrawingFulfillmentHistory.changedAt));

    return results.map((row: any) => ({
      ...row.history,
      changedByUser: row.changedByUser,
    }));
  }

  async updateLotteryDrawingFulfillmentStatus(id: string, status: string, actorUserId: string): Promise<any> {
    const run = async (tx: any) => {
      const [current] = await tx
        .select()
        .from(lotteryDrawingFulfillments)
        .where(eq(lotteryDrawingFulfillments.id, id))
        .limit(1);

      if (!current) {
        throw new Error("Fulfillment record not found");
      }

      const now = new Date();
      const updates: Record<string, unknown> = {
        fulfillmentStatus: status,
        updatedAt: now,
        fulfilledBy: actorUserId,
      };

      if ((status === "delivered" || status === "picked_up") && !current.fulfilledAt) {
        updates.fulfilledAt = now;
      }
      if (status === "canceled" && !current.canceledAt) {
        updates.canceledAt = now;
      }
      if (status === "issue" && !current.issueReportedAt) {
        updates.issueReportedAt = now;
      }

      const [updated] = await tx
        .update(lotteryDrawingFulfillments)
        .set(updates)
        .where(eq(lotteryDrawingFulfillments.id, id))
        .returning();

      const [history] = await tx
        .insert(lotteryDrawingFulfillmentHistory)
        .values({
          fulfillmentId: id,
          previousStatus: current.fulfillmentStatus,
          nextStatus: status as any,
          notes: `Status updated to ${status}.`,
          trackingNumber: updated.trackingNumber || null,
          trackingReference: updated.trackingReference || null,
          changedBy: actorUserId,
          metadata: {
            source: "operations_status_update",
          },
        })
        .returning();

      return { fulfillment: updated, history };
    };

    return await db.transaction(run);
  }

  async updateLotteryDrawingFulfillmentNotes(id: string, notes: string, actorUserId: string): Promise<any> {
    const run = async (tx: any) => {
      const [current] = await tx
        .select()
        .from(lotteryDrawingFulfillments)
        .where(eq(lotteryDrawingFulfillments.id, id))
        .limit(1);

      if (!current) {
        throw new Error("Fulfillment record not found");
      }

      const now = new Date();
      const [updated] = await tx
        .update(lotteryDrawingFulfillments)
        .set({
          fulfillmentNotes: notes,
          updatedAt: now,
          fulfilledBy: actorUserId,
        })
        .where(eq(lotteryDrawingFulfillments.id, id))
        .returning();

      const [history] = await tx
        .insert(lotteryDrawingFulfillmentHistory)
        .values({
          fulfillmentId: id,
          previousStatus: current.fulfillmentStatus,
          nextStatus: current.fulfillmentStatus,
          notes,
          trackingNumber: updated.trackingNumber || null,
          trackingReference: updated.trackingReference || null,
          changedBy: actorUserId,
          metadata: {
            source: "operations_notes_update",
          },
        })
        .returning();

      return { fulfillment: updated, history };
    };

    return await db.transaction(run);
  }

  async updateLotteryDrawingFulfillmentTracking(
    id: string,
    tracking: { trackingNumber?: string | null; trackingReference?: string | null },
    actorUserId: string,
  ): Promise<any> {
    const run = async (tx: any) => {
      const [current] = await tx
        .select()
        .from(lotteryDrawingFulfillments)
        .where(eq(lotteryDrawingFulfillments.id, id))
        .limit(1);

      if (!current) {
        throw new Error("Fulfillment record not found");
      }

      const now = new Date();
      const [updated] = await tx
        .update(lotteryDrawingFulfillments)
        .set({
          trackingNumber: tracking.trackingNumber ?? null,
          trackingReference: tracking.trackingReference ?? null,
          updatedAt: now,
          fulfilledBy: actorUserId,
        })
        .where(eq(lotteryDrawingFulfillments.id, id))
        .returning();

      const [history] = await tx
        .insert(lotteryDrawingFulfillmentHistory)
        .values({
          fulfillmentId: id,
          previousStatus: current.fulfillmentStatus,
          nextStatus: current.fulfillmentStatus,
          notes: `Tracking details updated.`,
          trackingNumber: updated.trackingNumber || null,
          trackingReference: updated.trackingReference || null,
          changedBy: actorUserId,
          metadata: {
            source: "operations_tracking_update",
          },
        })
        .returning();

      return { fulfillment: updated, history };
    };

    return await db.transaction(run);
  }

  // Driver lottery entries operations
  async createDriverLotteryEntry(entry: { driverId: string; activityId: string; ownerId: string; entriesEarned?: number }): Promise<DriverLotteryEntry> {
    // This is the write-side program boundary. It intentionally precedes the
    // duplicate lookup and every ticket-number write so a pre-cutoff activity
    // cannot become an active-program reward through approval, retry, or replay.
    const [historicalSource] = await db
      .select({ id: financialHistoryRecords.id })
      .from(financialHistoryRecords)
      .where(and(
        eq(financialHistoryRecords.recordType, "washout_activity"),
        eq(financialHistoryRecords.recordId, entry.activityId),
        eq(financialHistoryRecords.classification, "historical_test_data"),
      ))
      .limit(1);
    if (historicalSource) {
      return { outcome: "historical_reward_suppressed", created: false, code: "historical_test_activity" } as unknown as DriverLotteryEntry;
    }

    const [existingEntry] = await db
      .select()
      .from(driverLotteryEntries)
      .where(eq(driverLotteryEntries.activityId, entry.activityId))
      .limit(1);
    if (existingEntry) {
      return existingEntry;
    }

    const now = new Date();
    const month = now.getMonth() + 1; // 1-12
    const year = now.getFullYear();

    for (let attempt = 0; attempt < 3; attempt++) {
      // Count all entries for this month/year (including archived) to generate a sequential ticket number
      const [countResult] = await db
        .select({ count: sql<number>`COUNT(*)::integer` })
        .from(driverLotteryEntries)
        .where(and(
          eq(driverLotteryEntries.lotteryMonth, month),
          eq(driverLotteryEntries.lotteryYear, year),
        ));
      const sequence = (countResult?.count ?? 0) + 1;
      const paddedSeq = String(sequence).padStart(4, '0');
      const paddedMonth = String(month).padStart(2, '0');
      const ticketNumber = `CX-${year}${paddedMonth}-${paddedSeq}`;

      try {
        const [newEntry] = await db
          .insert(driverLotteryEntries)
          .values({
            driverId: entry.driverId,
            activityId: entry.activityId,
            ownerId: entry.ownerId,
            ticketNumber,
            entriesEarned: entry.entriesEarned ?? 1,
            lotteryMonth: month,
            lotteryYear: year,
            isArchived: false,
          })
          .returning();
        return newEntry;
      } catch (error) {
        const [existingAfterFailure] = await db
          .select()
          .from(driverLotteryEntries)
          .where(eq(driverLotteryEntries.activityId, entry.activityId))
          .limit(1);
        if (existingAfterFailure) {
          return existingAfterFailure;
        }

        const errorCode = (error as { code?: string }).code;
        if (errorCode === '23505' && attempt < 2) {
          continue;
        }
        throw error;
      }
    }

    throw new Error("Unable to create lottery entry");
  }

  async getDriverLotteryEntryByActivity(activityId: string): Promise<DriverLotteryEntry | undefined> {
    const [entry] = await db
      .select()
      .from(driverLotteryEntries)
      .where(eq(driverLotteryEntries.activityId, activityId))
      .limit(1);
    return entry;
  }

  async createLotteryNotificationOnce(notification: InsertLotteryNotification): Promise<{ record: LotteryNotification; created: boolean }> {
    return await db.transaction(async (tx) => {
      const inserted = await tx
        .insert(lotteryNotifications)
        .values(notification)
        .onConflictDoNothing({
          target: [
            lotteryNotifications.lotteryDrawingId,
            lotteryNotifications.userId,
            lotteryNotifications.notificationKind,
          ],
        })
        .returning();

      if (inserted.length === 0) {
        const [existing] = await tx
          .select()
          .from(lotteryNotifications)
          .where(and(
            eq(lotteryNotifications.lotteryDrawingId, notification.lotteryDrawingId),
            eq(lotteryNotifications.userId, notification.userId),
            eq(lotteryNotifications.notificationKind, notification.notificationKind),
          ))
          .limit(1);
        if (!existing) {
          throw new Error("Unable to load existing lottery notification");
        }
        return { record: existing, created: false };
      }

      const [created] = inserted;
      const [message] = await tx.insert(notifications).values({
        userId: notification.userId,
        title: notification.title,
        message: notification.message,
        type: notification.notificationKind === "winner" ? "lottery_winner" : "lottery_announcement",
        data: notification.data ?? null,
      }).returning();

      const [updated] = await tx
        .update(lotteryNotifications)
        .set({
          notificationId: message.id,
          sentAt: new Date(),
        })
        .where(eq(lotteryNotifications.id, created.id))
        .returning();

      return { record: updated, created: true };
    });
  }

  async getLotteryNotificationsByDrawing(drawingId: string): Promise<LotteryNotification[]> {
    const rows = await db
      .select()
      .from(lotteryNotifications)
      .leftJoin(financialHistoryRecords, sql`${financialHistoryRecords.recordType} = 'lottery_notification' AND ${financialHistoryRecords.recordId} = ${lotteryNotifications.id} AND ${financialHistoryRecords.classification} = 'historical_test_data'`)
      .where(and(eq(lotteryNotifications.lotteryDrawingId, drawingId), isNull(financialHistoryRecords.id)))
      .orderBy(desc(lotteryNotifications.createdAt));
    return rows.map((row: any) => row.lottery_notifications) as LotteryNotification[];
  }

  async getLotteryNotificationSummary(drawingId: string): Promise<{
    winnerNotificationCount: number;
    participantNotificationCount: number;
    winnerNotificationsSentAt: Date | null;
    participantNotificationsSentAt: Date | null;
  } | undefined> {
    const [summary] = await db
      .select({
        winnerNotificationCount: sql<number>`COALESCE(SUM(CASE WHEN ${lotteryNotifications.notificationKind} = 'winner' THEN 1 ELSE 0 END), 0)::integer`,
        participantNotificationCount: sql<number>`COALESCE(SUM(CASE WHEN ${lotteryNotifications.notificationKind} = 'participant' THEN 1 ELSE 0 END), 0)::integer`,
        winnerNotificationsSentAt: sql<Date | null>`MAX(CASE WHEN ${lotteryNotifications.notificationKind} = 'winner' THEN ${lotteryNotifications.sentAt} ELSE NULL END)`,
        participantNotificationsSentAt: sql<Date | null>`MAX(CASE WHEN ${lotteryNotifications.notificationKind} = 'participant' THEN ${lotteryNotifications.sentAt} ELSE NULL END)`,
      })
      .from(lotteryNotifications)
      .leftJoin(financialHistoryRecords, sql`${financialHistoryRecords.recordType} = 'lottery_notification' AND ${financialHistoryRecords.recordId} = ${lotteryNotifications.id} AND ${financialHistoryRecords.classification} = 'historical_test_data'`)
      .where(and(eq(lotteryNotifications.lotteryDrawingId, drawingId), isNull(financialHistoryRecords.id)));
    return summary;
  }

  async getDriverLotteryEntries(driverId: string): Promise<DriverLotteryEntry[]> {
    const rows = await db
      .select()
      .from(driverLotteryEntries)
      .innerJoin(washoutActivities, eq(driverLotteryEntries.activityId, washoutActivities.id))
      .leftJoin(financialHistoryRecords, sql`${financialHistoryRecords.recordType} = 'washout_activity' AND ${financialHistoryRecords.recordId} = ${washoutActivities.id} AND ${financialHistoryRecords.classification} = 'historical_test_data'`)
      .where(and(eq(driverLotteryEntries.driverId, driverId), isNull(financialHistoryRecords.id)))
      .orderBy(desc(driverLotteryEntries.createdAt));
    return rows.map((row: any) => row.driver_lottery_entries) as DriverLotteryEntry[];
  }

  async getDriverLotteryEntriesWithDetails(driverId: string, month?: number, year?: number): Promise<any[]> {
    const conditions: any[] = [eq(driverLotteryEntries.driverId, driverId)];
    if (month) conditions.push(eq(driverLotteryEntries.lotteryMonth, month));
    if (year) conditions.push(eq(driverLotteryEntries.lotteryYear, year));

    const results = await db
      .select({
        id: driverLotteryEntries.id,
        ticketNumber: driverLotteryEntries.ticketNumber,
        entriesEarned: driverLotteryEntries.entriesEarned,
        lotteryMonth: driverLotteryEntries.lotteryMonth,
        lotteryYear: driverLotteryEntries.lotteryYear,
        isArchived: driverLotteryEntries.isArchived,
        createdAt: driverLotteryEntries.createdAt,
        ownerCompany: owners.companyName,
        locationName: washoutLocations.name,
        locationStreet: washoutLocations.street,
        locationCity: washoutLocations.city,
        locationState: washoutLocations.state,
        locationZip: washoutLocations.zip,
        activityDate: washoutActivities.checkInTime,
      })
      .from(driverLotteryEntries)
      .innerJoin(owners, eq(driverLotteryEntries.ownerId, owners.id))
      .innerJoin(washoutActivities, eq(driverLotteryEntries.activityId, washoutActivities.id))
      .innerJoin(washoutLocations, eq(washoutActivities.locationId, washoutLocations.id))
      .leftJoin(financialHistoryRecords, sql`${financialHistoryRecords.recordType} = 'washout_activity' AND ${financialHistoryRecords.recordId} = ${washoutActivities.id} AND ${financialHistoryRecords.classification} = 'historical_test_data'`)
      .where(and(...conditions, isNull(financialHistoryRecords.id)))
      .orderBy(desc(driverLotteryEntries.createdAt));

    return results.map((result) => ({
      ...result,
      locationAddress: formatAddress({
        street: result.locationStreet,
        city: result.locationCity,
        state: result.locationState,
        zip: result.locationZip,
      }),
    }));
  }

  async getDriverLotteryEntryCount(driverId: string): Promise<number> {
    // Only count current month's non-archived entries
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();
    
    const [result] = await db
      .select({
        totalEntries: sql<number>`COALESCE(SUM(${driverLotteryEntries.entriesEarned}), 0)::integer`,
      })
      .from(driverLotteryEntries)
      .innerJoin(washoutActivities, eq(driverLotteryEntries.activityId, washoutActivities.id))
      .leftJoin(financialHistoryRecords, sql`${financialHistoryRecords.recordType} = 'washout_activity' AND ${financialHistoryRecords.recordId} = ${washoutActivities.id} AND ${financialHistoryRecords.classification} = 'historical_test_data'`)
      .where(and(
        eq(driverLotteryEntries.driverId, driverId),
        eq(driverLotteryEntries.lotteryMonth, currentMonth),
        eq(driverLotteryEntries.lotteryYear, currentYear),
        eq(driverLotteryEntries.isArchived, false),
        isNull(financialHistoryRecords.id),
      ));
    return result?.totalEntries ?? 0;
  }

  async archiveLotteryMonth(month: number, year: number): Promise<number> {
    const result = await db
      .update(driverLotteryEntries)
      .set({ isArchived: true })
      .where(and(
        eq(driverLotteryEntries.lotteryMonth, month),
        eq(driverLotteryEntries.lotteryYear, year),
        eq(driverLotteryEntries.isArchived, false),
        sql`NOT EXISTS (SELECT 1 FROM financial_history_records h WHERE h.record_type = 'washout_activity' AND h.record_id = ${driverLotteryEntries.activityId} AND h.classification = 'historical_test_data')`,
      ));
    return result.rowCount ?? 0;
  }

  async getLotteryMonths(): Promise<{ month: number; year: number; isArchived: boolean; totalEntries: number }[]> {
    const results = await db
      .select({
        month: driverLotteryEntries.lotteryMonth,
        year: driverLotteryEntries.lotteryYear,
        isArchived: driverLotteryEntries.isArchived,
        totalEntries: sql<number>`COALESCE(SUM(${driverLotteryEntries.entriesEarned}), 0)::integer`,
      })
      .from(driverLotteryEntries)
      .innerJoin(washoutActivities, eq(driverLotteryEntries.activityId, washoutActivities.id))
      .leftJoin(financialHistoryRecords, sql`${financialHistoryRecords.recordType} = 'washout_activity' AND ${financialHistoryRecords.recordId} = ${washoutActivities.id} AND ${financialHistoryRecords.classification} = 'historical_test_data'`)
      .where(isNull(financialHistoryRecords.id))
      .groupBy(driverLotteryEntries.lotteryMonth, driverLotteryEntries.lotteryYear, driverLotteryEntries.isArchived)
      .orderBy(desc(driverLotteryEntries.lotteryYear), desc(driverLotteryEntries.lotteryMonth));
    return results.map(r => ({
      month: r.month,
      year: r.year,
      isArchived: r.isArchived ?? false,
      totalEntries: r.totalEntries,
    }));
  }

  async getAllDriverLotteryEntries(startDate?: Date, endDate?: Date): Promise<any[]> {
    const conditions = [];
    if (startDate) {
      conditions.push(gte(driverLotteryEntries.createdAt, startDate));
    }
    if (endDate) {
      conditions.push(lte(driverLotteryEntries.createdAt, endDate));
    }

    const results = await db
      .select({
        entry: driverLotteryEntries,
        driver: drivers,
        driverUser: users,
        owner: owners,
        ownerUser: users,
        activity: washoutActivities,
      })
      .from(driverLotteryEntries)
      .innerJoin(drivers, eq(driverLotteryEntries.driverId, drivers.id))
      .innerJoin(users, eq(drivers.userId, users.id))
      .innerJoin(owners, eq(driverLotteryEntries.ownerId, owners.id))
      .innerJoin(washoutActivities, eq(driverLotteryEntries.activityId, washoutActivities.id))
      .leftJoin(financialHistoryRecords, sql`${financialHistoryRecords.recordType} = 'washout_activity' AND ${financialHistoryRecords.recordId} = ${washoutActivities.id} AND ${financialHistoryRecords.classification} = 'historical_test_data'`)
      .where(and(...conditions, isNull(financialHistoryRecords.id)))
      .orderBy(desc(driverLotteryEntries.createdAt));

    return results.map(r => ({
      ...r.entry,
      driver: { ...r.driver, user: r.driverUser },
      owner: r.owner,
      activity: r.activity,
    }));
  }

  async getDriverLotteryEntryTotals(month?: number, year?: number): Promise<{ driverId: string; driverName: string; totalEntries: number; payoutPreference: string | null; payoutPreferenceNote: string | null }[]> {
    const conditions = [];
    if (month !== undefined && year !== undefined) {
      conditions.push(eq(driverLotteryEntries.lotteryMonth, month));
      conditions.push(eq(driverLotteryEntries.lotteryYear, year));
    }

    const results = await db
      .select({
        driverId: driverLotteryEntries.driverId,
        firstName: users.firstName,
        lastName: users.lastName,
        totalEntries: sql<number>`COALESCE(SUM(${driverLotteryEntries.entriesEarned}), 0)::integer`,
        payoutPreference: drivers.payoutPreference,
        payoutPreferenceNote: drivers.payoutPreferenceNote,
      })
      .from(driverLotteryEntries)
      .innerJoin(drivers, eq(driverLotteryEntries.driverId, drivers.id))
      .innerJoin(users, eq(drivers.userId, users.id))
      .innerJoin(washoutActivities, eq(driverLotteryEntries.activityId, washoutActivities.id))
      .leftJoin(financialHistoryRecords, sql`${financialHistoryRecords.recordType} = 'washout_activity' AND ${financialHistoryRecords.recordId} = ${washoutActivities.id} AND ${financialHistoryRecords.classification} = 'historical_test_data'`)
      .where(and(...conditions, isNull(financialHistoryRecords.id)))
      .groupBy(driverLotteryEntries.driverId, users.firstName, users.lastName, drivers.payoutPreference, drivers.payoutPreferenceNote)
      .orderBy(desc(sql`SUM(${driverLotteryEntries.entriesEarned})`));

    return results.map(r => ({
      driverId: r.driverId,
      driverName: `${r.firstName} ${r.lastName}`,
      totalEntries: r.totalEntries,
      payoutPreference: r.payoutPreference,
      payoutPreferenceNote: r.payoutPreferenceNote,
    }));
  }

}

export const storage: any = new DatabaseStorage();
