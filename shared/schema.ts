import { sql, relations } from "drizzle-orm";
import {
  index,
  uniqueIndex,
  jsonb,
  pgTable,
  timestamp,
  varchar,
  text,
  decimal,
  boolean,
  integer,
  pgEnum,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Session storage table - required for Replit Auth
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// Password reset tokens
export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  token: varchar("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Enums
export const userRoleEnum = pgEnum("user_role", ["driver", "owner", "admin", "super_admin"]);
export const paymentMethodEnum = pgEnum("payment_method", ["check", "venmo", "zelle", "ach", "credit_card"]);
export const paymentFrequencyEnum = pgEnum("payment_frequency", ["weekly", "biweekly", "monthly"]);
export const subscriptionStatusEnum = pgEnum("subscription_status", ["active", "inactive", "trial", "past_due"]);
export const washoutStatusEnum = pgEnum("washout_status", ["pending", "verified", "rejected"]);
export const messageStatusEnum = pgEnum("message_status", ["unread", "read", "resolved"]);
export const distributionFrequencyEnum = pgEnum("distribution_frequency", ["daily", "weekly", "biweekly", "monthly"]);

// Wallet system enums
export const transactionDirectionEnum = pgEnum("transaction_direction", ["credit", "debit", "fee"]);
export const transactionSourceTypeEnum = pgEnum("transaction_source_type", ["washout", "withdrawal", "adjustment"]);
export const transactionStatusEnum = pgEnum("transaction_status", ["pending", "posted", "failed"]);
export const withdrawalStatusEnum = pgEnum("withdrawal_status", ["requested", "processing", "paid", "failed", "canceled"]);

// Billing system enums
export const billingCadenceEnum = pgEnum("billing_cadence", ["daily"]);
export const batchStatusEnum = pgEnum("batch_status", ["pending", "processing", "completed", "failed", "cancelled"]);

// User storage table - local authentication
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: varchar("username").unique().notNull(),
  email: varchar("email").unique().notNull(),
  passwordHash: varchar("password_hash").notNull(),
  firstName: varchar("first_name").notNull(),
  lastName: varchar("last_name").notNull(),
  profileImageUrl: varchar("profile_image_url"),
  role: userRoleEnum("role"),
  phone: varchar("phone"),
  address: text("address"),
  paymentMethod: paymentMethodEnum("payment_method").default("check"),
  paymentFrequency: paymentFrequencyEnum("payment_frequency").default("weekly"),
  stripeCustomerId: varchar("stripe_customer_id"),
  stripeSubscriptionId: varchar("stripe_subscription_id"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Driver specific information
export const drivers = pgTable("drivers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  employerName: varchar("employer_name"),
  employerAddress: text("employer_address"),
  employerPhone: varchar("employer_phone"),
  licenseNumber: varchar("license_number"),
  truckNumber: varchar("truck_number"),
  isGpsEnabled: boolean("is_gps_enabled").default(true),
  currentLatitude: decimal("current_latitude", { precision: 10, scale: 8 }),
  currentLongitude: decimal("current_longitude", { precision: 11, scale: 8 }),
  lastLocationUpdate: timestamp("last_location_update"),
  connectedAccountId: varchar("connected_account_id"), // Stripe Connect account ID for drivers
  hasAgreedToTerms: boolean("has_agreed_to_terms").default(false),
  termsAgreedAt: timestamp("terms_agreed_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Owner specific information
export const owners = pgTable("owners", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  companyName: varchar("company_name"),
  businessLicense: varchar("business_license"),
  taxId: varchar("tax_id"),
  subscriptionStatus: subscriptionStatusEnum("subscription_status").default("trial"),
  subscriptionPlan: varchar("subscription_plan").default("monthly"),
  subscriptionEndsAt: timestamp("subscription_ends_at"),
  pastDueDate: timestamp("past_due_date"), // When subscription first became past due
  gracePeriodStartDate: timestamp("grace_period_start_date"), // When 7-day grace period started
  lastReminderSent: timestamp("last_reminder_sent"), // Last time we sent a reminder
  // Billing configuration for daily batch processing
  billingCadence: billingCadenceEnum("billing_cadence").default("daily"),
  billingCutoffTime: varchar("billing_cutoff_time").default("23:59:00"), // Time of day for billing cutoff (HH:MM:SS)
  billingTimezone: varchar("billing_timezone").default("America/Chicago"), // Owner's timezone for billing cutoff
  isApproved: boolean("is_approved").default(false),
  hasAgreedToTerms: boolean("has_agreed_to_terms").default(false),
  termsAgreedAt: timestamp("terms_agreed_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Washout locations
export const washoutLocations = pgTable("washout_locations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ownerId: varchar("owner_id").notNull().references(() => owners.id, { onDelete: "cascade" }),
  name: varchar("name").notNull(),
  address: text("address").notNull(),
  latitude: decimal("latitude", { precision: 10, scale: 8 }).notNull(),
  longitude: decimal("longitude", { precision: 11, scale: 8 }).notNull(),
  rate: decimal("rate", { precision: 10, scale: 2 }).notNull().default("5.00"),
  isActive: boolean("is_active").default(true),
  isVisible: boolean("is_visible").default(true),
  description: text("description"),
  amenities: text("amenities").array(),
  operatingHours: jsonb("operating_hours"),
  permitUrls: text("permit_urls").array(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Washout activities
export const washoutActivities = pgTable("washout_activities", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  driverId: varchar("driver_id").notNull().references(() => drivers.id, { onDelete: "cascade" }),
  locationId: varchar("location_id").notNull().references(() => washoutLocations.id, { onDelete: "cascade" }),
  status: washoutStatusEnum("status").notNull().default("pending"),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  checkInTime: timestamp("check_in_time").notNull(),
  checkOutTime: timestamp("check_out_time"),
  photoUrls: text("photo_urls").array(), // Legacy field - will be removed after migration
  notes: text("notes"),
  verifiedBy: varchar("verified_by").references(() => users.id),
  verifiedAt: timestamp("verified_at"),
  latitude: decimal("latitude", { precision: 10, scale: 8 }),
  longitude: decimal("longitude", { precision: 11, scale: 8 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// NEW: Clean photo table with referential integrity
export const washoutPhotos = pgTable("washout_photos", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  activityId: varchar("activity_id").notNull().references(() => washoutActivities.id, { onDelete: "cascade" }),
  storageKey: varchar("storage_key").notNull(), // e.g., "photo-1758728697596-jji6m2mh1.jpg"
  uploadedAt: timestamp("uploaded_at").notNull().defaultNow(),
  fileSize: integer("file_size"), // Optional: track file size
  contentType: varchar("content_type").default("image/jpeg"), // e.g., "image/jpeg"
  createdAt: timestamp("created_at").defaultNow(),
});

// Payments
export const payments = pgTable("payments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  driverId: varchar("driver_id").notNull().references(() => drivers.id, { onDelete: "cascade" }),
  ownerId: varchar("owner_id").notNull().references(() => owners.id, { onDelete: "cascade" }),
  activityId: varchar("activity_id").notNull().references(() => washoutActivities.id, { onDelete: "cascade" }),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  processingFee: decimal("processing_fee", { precision: 10, scale: 2 }).notNull(),
  washoutServiceFee: decimal("washout_service_fee", { precision: 10, scale: 2 }).notNull().default("8.00"),
  stripePaymentIntentId: varchar("stripe_payment_intent_id"),
  status: varchar("status").notNull().default("pending"),
  // Batch tracking fields for daily billing
  batchId: varchar("batch_id").references(() => billingBatches.id),
  businessDate: varchar("business_date"), // YYYY-MM-DD format for the business day
  paidAt: timestamp("paid_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Billing batches for daily batch processing
export const billingBatches = pgTable("billing_batches", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ownerId: varchar("owner_id").notNull().references(() => owners.id, { onDelete: "cascade" }),
  businessDate: varchar("business_date").notNull(), // YYYY-MM-DD format
  cutoffTime: varchar("cutoff_time").notNull(), // HH:MM:SS format when batch was created
  timezone: varchar("timezone").notNull(), // Timezone used for cutoff
  totalAmount: decimal("total_amount", { precision: 10, scale: 2 }).notNull().default("0.00"),
  totalFees: decimal("total_fees", { precision: 10, scale: 2 }).notNull().default("0.00"),
  paymentCount: integer("payment_count").notNull().default(0),
  stripePaymentIntentId: varchar("stripe_payment_intent_id"),
  status: batchStatusEnum("status").notNull().default("pending"),
  processingStartedAt: timestamp("processing_started_at"),
  completedAt: timestamp("completed_at"),
  failureReason: text("failure_reason"),
  retryCount: integer("retry_count").notNull().default(0),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  // Unique constraint: one batch per owner per business date
  uniqueBatchPerDay: uniqueIndex("uniq_billing_batches_owner_date").on(table.ownerId, table.businessDate),
  // Index for efficient queries by status and date
  statusDateIndex: index("idx_billing_batches_status_date").on(table.status, table.businessDate),
}));

// Owner payment methods
export const ownerPaymentMethods = pgTable("owner_payment_methods", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ownerId: varchar("owner_id").notNull().references(() => owners.id, { onDelete: "cascade" }),
  type: varchar("type").notNull(), // 'card' or 'bank'
  last4: varchar("last4").notNull(),
  // Card specific fields
  expiryMonth: varchar("expiry_month"),
  expiryYear: varchar("expiry_year"),
  cardholderName: varchar("cardholder_name"),
  // Bank specific fields
  bankName: varchar("bank_name"),
  accountHolderName: varchar("account_holder_name"),
  // Stripe integration
  stripePaymentMethodId: varchar("stripe_payment_method_id"),
  isDefault: boolean("is_default").default(false),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Webhook events for idempotency handling
export const webhookEvents = pgTable("webhook_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  stripeEventId: varchar("stripe_event_id").notNull().unique(),
  eventType: varchar("event_type").notNull(),
  processed: boolean("processed").default(false),
  accountId: varchar("account_id"),
  retryCount: integer("retry_count").default(0),
  errorMessage: text("error_message"),
  processedAt: timestamp("processed_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Notifications
export const notifications = pgTable("notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: varchar("title").notNull(),
  message: text("message").notNull(),
  type: varchar("type").notNull().default("info"),
  isRead: boolean("is_read").default(false),
  data: jsonb("data"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Support messages from users to admin
export const messages = pgTable("messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  subject: varchar("subject").notNull(),
  message: text("message").notNull(),
  status: messageStatusEnum("status").default("unread"),
  userRole: userRoleEnum("user_role").notNull(),
  userPhone: varchar("user_phone"),
  createdAt: timestamp("created_at").defaultNow(),
  resolvedAt: timestamp("resolved_at"),
});

// Driver wallets - stores current wallet balances
export const driverWallets = pgTable("driver_wallets", {
  driverId: varchar("driver_id").primaryKey().references(() => drivers.id, { onDelete: "cascade" }),
  availableBalance: decimal("available_balance", { precision: 10, scale: 2 }).notNull().default("0.00"),
  pendingBalance: decimal("pending_balance", { precision: 10, scale: 2 }).notNull().default("0.00"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Wallet transactions - tracks all wallet credits, debits, and fees
export const walletTransactions = pgTable("wallet_transactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  driverId: varchar("driver_id").notNull().references(() => drivers.id, { onDelete: "cascade" }),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  direction: transactionDirectionEnum("direction").notNull(),
  balanceAfter: decimal("balance_after", { precision: 10, scale: 2 }).notNull(),
  currency: varchar("currency").notNull().default("USD"),
  sourceType: transactionSourceTypeEnum("source_type").notNull(),
  sourceId: varchar("source_id"), // References activity, withdrawal, or adjustment ID
  status: transactionStatusEnum("status").notNull().default("pending"),
  description: text("description"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  // Index for performance
  driverCreatedAtIndex: index("idx_wallet_transactions_driver").on(table.driverId, table.createdAt),
  // UNIQUE constraint to prevent duplicate credits from the same source - sourceId can be null
  idempotencyConstraint: uniqueIndex("uniq_wallet_transactions_idempotency").on(table.driverId, table.sourceType, table.sourceId, table.direction),
}));

// Withdrawals - tracks withdrawal requests and processing status
export const withdrawals = pgTable("withdrawals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  driverId: varchar("driver_id").notNull().references(() => drivers.id, { onDelete: "cascade" }),
  amountRequested: decimal("amount_requested", { precision: 10, scale: 2 }).notNull(),
  feeAmount: decimal("fee_amount", { precision: 10, scale: 2 }).notNull().default("0.00"),
  amountNet: decimal("amount_net", { precision: 10, scale: 2 }).notNull(),
  status: withdrawalStatusEnum("status").notNull().default("requested"),
  stripeTransferId: varchar("stripe_transfer_id"),
  stripePayoutId: varchar("stripe_payout_id"),
  failureReason: text("failure_reason"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
  processedAt: timestamp("processed_at"),
});

// Relations
export const usersRelations = relations(users, ({ one, many }) => ({
  driver: one(drivers, { fields: [users.id], references: [drivers.userId] }),
  owner: one(owners, { fields: [users.id], references: [owners.userId] }),
  notifications: many(notifications),
}));

export const driversRelations = relations(drivers, ({ one, many }) => ({
  user: one(users, { fields: [drivers.userId], references: [users.id] }),
  activities: many(washoutActivities),
  payments: many(payments),
  wallet: one(driverWallets, { fields: [drivers.id], references: [driverWallets.driverId] }),
  walletTransactions: many(walletTransactions),
  withdrawals: many(withdrawals),
}));

export const ownersRelations = relations(owners, ({ one, many }) => ({
  user: one(users, { fields: [owners.userId], references: [users.id] }),
  locations: many(washoutLocations),
  payments: many(payments),
  paymentMethods: many(ownerPaymentMethods),
  billingBatches: many(billingBatches),
}));

export const washoutLocationsRelations = relations(washoutLocations, ({ one, many }) => ({
  owner: one(owners, { fields: [washoutLocations.ownerId], references: [owners.id] }),
  activities: many(washoutActivities),
}));

export const washoutActivitiesRelations = relations(washoutActivities, ({ one }) => ({
  driver: one(drivers, { fields: [washoutActivities.driverId], references: [drivers.id] }),
  location: one(washoutLocations, { fields: [washoutActivities.locationId], references: [washoutLocations.id] }),
  payment: one(payments, { fields: [washoutActivities.id], references: [payments.activityId] }),
}));

export const ownerPaymentMethodsRelations = relations(ownerPaymentMethods, ({ one }) => ({
  owner: one(owners, { fields: [ownerPaymentMethods.ownerId], references: [owners.id] }),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  driver: one(drivers, { fields: [payments.driverId], references: [drivers.id] }),
  owner: one(owners, { fields: [payments.ownerId], references: [owners.id] }),
  activity: one(washoutActivities, { fields: [payments.activityId], references: [washoutActivities.id] }),
  batch: one(billingBatches, { fields: [payments.batchId], references: [billingBatches.id] }),
}));

export const billingBatchesRelations = relations(billingBatches, ({ one, many }) => ({
  owner: one(owners, { fields: [billingBatches.ownerId], references: [owners.id] }),
  payments: many(payments),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, { fields: [notifications.userId], references: [users.id] }),
}));

export const driverWalletsRelations = relations(driverWallets, ({ one, many }) => ({
  driver: one(drivers, { fields: [driverWallets.driverId], references: [drivers.id] }),
  transactions: many(walletTransactions),
}));

export const walletTransactionsRelations = relations(walletTransactions, ({ one }) => ({
  driver: one(drivers, { fields: [walletTransactions.driverId], references: [drivers.id] }),
  wallet: one(driverWallets, { fields: [walletTransactions.driverId], references: [driverWallets.driverId] }),
}));

export const withdrawalsRelations = relations(withdrawals, ({ one }) => ({
  driver: one(drivers, { fields: [withdrawals.driverId], references: [drivers.id] }),
}));

// Insert schemas
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  passwordHash: true, // This will be handled separately for security
  createdAt: true,
  updatedAt: true,
});

// Registration schema for new users
export const userRegistrationSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters"),
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  phone: z.string().min(10, "Phone number must be at least 10 digits"),
  address: z.string().min(5, "Address is required"),
  role: z.enum(["driver", "owner"]),
});

// Login schema
export const userLoginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

// Password reset schemas
export const forgotPasswordSchema = z.object({
  email: z.string().email("Invalid email address"),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, "Reset token is required"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export const insertDriverSchema = createInsertSchema(drivers).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertOwnerSchema = createInsertSchema(owners).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertWashoutLocationSchema = createInsertSchema(washoutLocations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  latitude: z.number().transform(val => val.toString()),
  longitude: z.number().transform(val => val.toString()),
  rate: z.number().transform(val => val.toString()),
});

export const insertWashoutActivitySchema = createInsertSchema(washoutActivities).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  // Accept ISO string for checkInTime and convert to Date
  checkInTime: z.string().datetime().transform(val => new Date(val)),
});

export const insertWashoutPhotoSchema = createInsertSchema(washoutPhotos).omit({
  id: true,
  createdAt: true,
});

export const insertPaymentSchema = createInsertSchema(payments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertNotificationSchema = createInsertSchema(notifications).omit({
  id: true,
  createdAt: true,
});

export const insertMessageSchema = createInsertSchema(messages).omit({
  id: true,
  createdAt: true,
});

export const insertPasswordResetTokenSchema = createInsertSchema(passwordResetTokens).omit({
  id: true,
  createdAt: true,
});

export const insertOwnerPaymentMethodSchema = createInsertSchema(ownerPaymentMethods).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertDriverWalletSchema = createInsertSchema(driverWallets).omit({
  updatedAt: true,
});

export const insertWalletTransactionSchema = createInsertSchema(walletTransactions).omit({
  id: true,
  createdAt: true,
});

export const insertWithdrawalSchema = createInsertSchema(withdrawals).omit({
  id: true,
  createdAt: true,
});

export const insertBillingBatchSchema = createInsertSchema(billingBatches).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Wallet API request validation schemas
export const withdrawalRequestSchema = z.object({
  amount: z.number().positive().min(5, "Minimum withdrawal amount is $5"),
});

export const walletTransactionQuerySchema = z.object({
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(20),
  type: z.enum(["credit", "debit", "fee"]).optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});

export const adminWithdrawalUpdateSchema = z.object({
  status: z.enum(["processing", "paid", "failed", "canceled"]),
  failureReason: z.string().optional(),
});

// Location update validation schemas
export const updateLocationRateSchema = z.object({
  rate: z.number().min(0.01, "Rate must be greater than 0").transform(val => val.toString()),
});

export const updateLocationStatusSchema = z.object({
  isActive: z.boolean(),
});

export const updateLocationSchema = insertWashoutLocationSchema.partial().omit({
  ownerId: true, // Owner cannot be changed through update
});

// UUID parameter validation schema for route parameters
export const uuidParamSchema = z.object({
  id: z.string().uuid("Invalid UUID format"),
});

// Super admin email update schema
export const superAdminEmailUpdateSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newEmail: z.string().email("Invalid email format")
});

// Service Payment Account Configuration - managed by superadmin
export const servicePaymentAccounts = pgTable("service_payment_accounts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name").notNull(), // Display name for the service account
  description: text("description"), // Optional description
  
  // Stripe Configuration
  stripeAccountId: varchar("stripe_account_id"), // Main service Stripe account ID
  stripePublishableKey: varchar("stripe_publishable_key"), // Associated publishable key
  webhookEndpointId: varchar("webhook_endpoint_id"), // Stripe webhook endpoint ID
  
  // Platform Fee Configuration
  platformFeePercentage: decimal("platform_fee_percentage", { precision: 5, scale: 2 }).default("10.00"), // Platform fee percentage (default 10%)
  processingFeeFlat: decimal("processing_fee_flat", { precision: 10, scale: 2 }).default("0.30"), // Flat processing fee
  processingFeePercentage: decimal("processing_fee_percentage", { precision: 5, scale: 2 }).default("2.90"), // Processing fee percentage
  
  // Payment Collection Settings
  collectPaymentsFromOwners: boolean("collect_payments_from_owners").default(true), // Whether to collect from owners
  autoDistributeToDrivers: boolean("auto_distribute_to_drivers").default(true), // Auto-distribute to drivers
  distributionFrequency: distributionFrequencyEnum("distribution_frequency").default("daily"), // daily, weekly, biweekly, monthly
  minimumPayoutAmount: decimal("minimum_payout_amount", { precision: 10, scale: 2 }).default("5.00"), // Minimum payout threshold
  
  // Account Status and Settings
  isActive: boolean("is_active").default(true),
  isDefault: boolean("is_default").default(false), // Whether this is the default service account
  lastPayoutAt: timestamp("last_payout_at"),
  totalProcessed: decimal("total_processed", { precision: 15, scale: 2 }).default("0.00"), // Total amount processed
  totalFeesCollected: decimal("total_fees_collected", { precision: 15, scale: 2 }).default("0.00"), // Total fees collected
  
  // Audit fields
  createdBy: varchar("created_by").references(() => users.id),
  updatedBy: varchar("updated_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  // Partial unique index to ensure only one default account exists
  // This constraint prevents multiple accounts from being set as default
  uniqueDefaultAccountConstraint: uniqueIndex("uniq_service_payment_accounts_default")
    .on(table.isDefault)
    .where(sql`${table.isDefault} = true`),
}));

// Insert and Update schemas for service payment accounts
export const insertServicePaymentAccountSchema = createInsertSchema(servicePaymentAccounts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  totalProcessed: true,
  totalFeesCollected: true,
  lastPayoutAt: true,
});

export const updateServicePaymentAccountSchema = insertServicePaymentAccountSchema.partial().omit({
  createdBy: true, // Cannot change creator
  isDefault: true, // Cannot be set by clients - use dedicated endpoint
}).extend({
  // Add validation for fee fields to prevent invalid values
  platformFeePercentage: z.coerce.number().min(0, "Platform fee must be >= 0").max(100, "Platform fee must be <= 100%").transform(val => val.toString()).optional(),
  processingFeeFlat: z.coerce.number().min(0, "Processing fee must be >= 0").transform(val => val.toString()).optional(),
  processingFeePercentage: z.coerce.number().min(0, "Processing fee must be >= 0").max(100, "Processing fee must be <= 100%").transform(val => val.toString()).optional(),
  minimumPayoutAmount: z.coerce.number().min(0.01, "Minimum payout must be >= $0.01").transform(val => val.toString()).optional(),
});

// Types
export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;
export type Driver = typeof drivers.$inferSelect;
export type Owner = typeof owners.$inferSelect;
export type WashoutLocation = typeof washoutLocations.$inferSelect;
export type WashoutActivity = typeof washoutActivities.$inferSelect;
export type WashoutPhoto = typeof washoutPhotos.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type Message = typeof messages.$inferSelect;

export type InsertDriver = z.infer<typeof insertDriverSchema>;
export type InsertOwner = z.infer<typeof insertOwnerSchema>;
export type InsertWashoutLocation = z.infer<typeof insertWashoutLocationSchema>;
export type InsertWashoutActivity = z.infer<typeof insertWashoutActivitySchema>;
export type InsertWashoutPhoto = z.infer<typeof insertWashoutPhotoSchema>;
export type InsertPayment = z.infer<typeof insertPaymentSchema>;
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type InsertPasswordResetToken = z.infer<typeof insertPasswordResetTokenSchema>;
export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
export type OwnerPaymentMethod = typeof ownerPaymentMethods.$inferSelect;
export type InsertOwnerPaymentMethod = z.infer<typeof insertOwnerPaymentMethodSchema>;
export type DriverWallet = typeof driverWallets.$inferSelect;
export type WalletTransaction = typeof walletTransactions.$inferSelect;
export type Withdrawal = typeof withdrawals.$inferSelect;
export type InsertDriverWallet = z.infer<typeof insertDriverWalletSchema>;
export type InsertWalletTransaction = z.infer<typeof insertWalletTransactionSchema>;
export type InsertWithdrawal = z.infer<typeof insertWithdrawalSchema>;
export type BillingBatch = typeof billingBatches.$inferSelect;
export type InsertBillingBatch = z.infer<typeof insertBillingBatchSchema>;
export type ServicePaymentAccount = typeof servicePaymentAccounts.$inferSelect;
export type InsertServicePaymentAccount = z.infer<typeof insertServicePaymentAccountSchema>;
export type UpdateServicePaymentAccount = z.infer<typeof updateServicePaymentAccountSchema>;

// Date range validation schema
export const dateRangeSchema = z.enum(['today', 'yesterday', '7days', '30days', '90days', 'all']).default('today');

// Query parameter schemas
export const ownerActivitiesQuerySchema = z.object({
  dateRange: dateRangeSchema.optional(),
});
