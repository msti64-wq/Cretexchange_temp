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
export const ownerWalletStatusEnum = pgEnum("owner_wallet_status", ["active", "suspended", "pending_verification"]);
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

// Debit card enums
export const debitCardStatusEnum = pgEnum("debit_card_status", ["requested", "processing", "issued", "active", "blocked", "cancelled"]);

// Billing system enums
export const billingCadenceEnum = pgEnum("billing_cadence", ["immediate", "daily", "weekly"]);
export const batchStatusEnum = pgEnum("batch_status", ["pending", "processing", "completed", "failed", "cancelled"]);
export const feeTypeEnum = pgEnum("fee_type", ["location_monthly", "subscription_monthly", "subscription_annual"]);
export const feeStatusEnum = pgEnum("fee_status", ["pending", "paid", "failed", "past_due", "waived"]);
export const subscriptionPlanEnum = pgEnum("subscription_plan", ["none", "monthly", "annual", "one_time"]);
export const membershipPaymentMethodEnum = pgEnum("membership_payment_method", ["stripe", "cash", "check", "bank_transfer", "waived", "other"]);
export const pendingPaymentStatusEnum = pgEnum("pending_payment_status", ["queued", "processed", "failed", "cancelled"]);

// Webhook and reconciliation enums
export const webhookEventStatusEnum = pgEnum("webhook_event_status", ["received", "processing", "processed", "failed"]);
export const reconciliationStatusEnum = pgEnum("reconciliation_status", ["running", "completed", "failed"]);
export const discrepancyTypeEnum = pgEnum("discrepancy_type", ["missing_transaction", "amount_mismatch", "status_mismatch", "extra_transaction"]);

// Rubble service enums
export const materialUnitEnum = pgEnum("material_unit", ["per_load", "per_ton", "per_cy"]);
export const serviceTypeEnum = pgEnum("service_type", ["washout", "rubble_dropoff"]);

// Identity document enums
export const identityDocumentTypeEnum = pgEnum("identity_document_type", ["drivers_license", "passport", "state_id"]);
export const identityVerificationStatusEnum = pgEnum("identity_verification_status", ["pending", "verified", "rejected", "expired"]);

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
  street: varchar("street"),
  city: varchar("city"),
  state: varchar("state"),
  zip: varchar("zip"),
  paymentMethod: paymentMethodEnum("payment_method").default("ach"),
  paymentFrequency: paymentFrequencyEnum("payment_frequency").default("weekly"),
  // Stripe Connect integration - all users are connected accounts
  stripeConnectAccountId: varchar("stripe_connect_account_id"),
  stripeCustomerId: varchar("stripe_customer_id"), // For platform-level billing if needed
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Driver specific information
export const drivers = pgTable("drivers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  employerName: varchar("employer_name"),
  employerStreet: varchar("employer_street"),
  employerCity: varchar("employer_city"),
  employerState: varchar("employer_state"),
  employerZip: varchar("employer_zip"),
  employerPhone: varchar("employer_phone"),
  licenseNumber: varchar("license_number"),
  truckNumber: varchar("truck_number"),
  isGpsEnabled: boolean("is_gps_enabled").default(true),
  currentLatitude: decimal("current_latitude", { precision: 10, scale: 8 }),
  currentLongitude: decimal("current_longitude", { precision: 11, scale: 8 }),
  lastLocationUpdate: timestamp("last_location_update"),
  // ACH bank account details for withdrawals
  bankName: varchar("bank_name"),
  accountHolderName: varchar("account_holder_name"),
  routingNumber: varchar("routing_number"),
  accountNumber: varchar("account_number"), // Encrypted
  // Venmo/Zelle details (stored for records only, not used for withdrawals)
  venmoHandle: varchar("venmo_handle"),
  zelleEmail: varchar("zelle_email"),
  paymentMethod: paymentMethodEnum("payment_method").default("ach"), // Legacy field - kept for backward compatibility
  // Stripe Treasury integration for wallet management
  stripeTreasuryAccountId: varchar("stripe_treasury_account_id"), // Stripe Financial Account ID for wallet
  stripeTreasuryAccountLast4: varchar("stripe_treasury_account_last4"), // Last 4 digits for display
  // Stripe Issuing integration for debit cards
  stripeIssuingCardholderId: varchar("stripe_issuing_cardholder_id"), // Stripe Issuing cardholder ID
  // Stripe verification fields required for Connect account
  dateOfBirth: varchar("date_of_birth"), // YYYY-MM-DD format
  ssnLast4: varchar("ssn_last4"), // Last 4 digits of SSN
  businessWebsite: varchar("business_website"), // Required by Stripe for Connect accounts
  // Identity document for fraud prevention
  identityDocumentId: varchar("identity_document_id").references(() => identityDocuments.id, { onDelete: "set null" }),
  identityVerificationStatus: identityVerificationStatusEnum("identity_verification_status").default("pending"),
  // Stripe Connect verification tracking
  stripePayoutsEnabled: boolean("stripe_payouts_enabled").default(false),
  stripeChargesEnabled: boolean("stripe_charges_enabled").default(false),
  stripeRequirements: text("stripe_requirements"), // JSON array of currently_due requirements
  stripeVerifiedAt: timestamp("stripe_verified_at"),
  hasAgreedToTerms: boolean("has_agreed_to_terms").default(false),
  termsAgreedAt: timestamp("terms_agreed_at"),
  // Lottery prize payout preference
  payoutPreference: varchar("payout_preference").default("bank_transfer"), // 'bank_transfer' | 'gift_card' | 'other_prize'
  payoutPreferenceNote: varchar("payout_preference_note"), // Optional detail for 'other_prize'
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Identity documents for fraud prevention (Stripe requirement)
export const identityDocuments = pgTable("identity_documents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  documentType: identityDocumentTypeEnum("document_type").notNull(),
  fileUrl: varchar("file_url").notNull(), // GCS URL to uploaded document
  verificationStatus: identityVerificationStatusEnum("verification_status").notNull().default("pending"),
  stripeVerificationId: varchar("stripe_verification_id"), // Stripe verification session ID
  expirationDate: varchar("expiration_date"), // YYYY-MM-DD format
  rejectionReason: text("rejection_reason"), // If rejected or expired, reason why
  verifiedAt: timestamp("verified_at"), // When document was verified
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Debit card requests
export const debitCardRequests = pgTable("debit_card_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  driverId: varchar("driver_id").notNull().references(() => drivers.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  // Shipping information
  shippingName: varchar("shipping_name").notNull(),
  shippingStreet: varchar("shipping_street").notNull(),
  shippingCity: varchar("shipping_city").notNull(),
  shippingState: varchar("shipping_state").notNull(),
  shippingZip: varchar("shipping_zip").notNull(),
  // Card details from Stripe Issuing
  cardStatus: debitCardStatusEnum("card_status").notNull().default("requested"),
  stripeIssuingCardId: varchar("stripe_issuing_card_id"), // Stripe Issuing card ID
  cardLast4: varchar("card_last4"), // Last 4 digits of card
  cardType: varchar("card_type").default("physical"), // physical or virtual
  expirationMonth: varchar("expiration_month"), // MM
  expirationYear: varchar("expiration_year"), // YYYY
  // Tracking
  requestedAt: timestamp("requested_at").defaultNow(),
  issuedAt: timestamp("issued_at"),
  activatedAt: timestamp("activated_at"),
  cancelledAt: timestamp("cancelled_at"),
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
  businessWebsite: varchar("business_website"),
  // Stripe Connect integration
  stripeConnectAccountId: varchar("stripe_connect_account_id"),
  stripeCustomerId: varchar("stripe_customer_id"),
  stripePaymentMethodId: varchar("stripe_payment_method_id"), // Default payment method for platform fees
  stripePaymentIntentId: varchar("stripe_payment_intent_id"),
  // Stripe verification fields required for Connect account
  dateOfBirth: varchar("date_of_birth"), // YYYY-MM-DD format
  ssnLast4: varchar("ssn_last4"), // Last 4 digits of SSN
  // Identity document for fraud prevention
  identityDocumentId: varchar("identity_document_id").references(() => identityDocuments.id, { onDelete: "set null" }),
  identityVerificationStatus: identityVerificationStatusEnum("identity_verification_status").default("pending"),
  // Stripe Connect verification tracking
  stripePayoutsEnabled: boolean("stripe_payouts_enabled").default(false),
  stripeChargesEnabled: boolean("stripe_charges_enabled").default(false),
  stripeRequirements: text("stripe_requirements"), // JSON array of currently_due requirements
  stripeVerifiedAt: timestamp("stripe_verified_at"),
  // Stripe Treasury wallet integration
  stripeTreasuryAccountId: varchar("stripe_treasury_account_id"), // Stripe Financial Account ID
  walletBalance: decimal("wallet_balance", { precision: 10, scale: 2 }).notNull().default("0.00"),
  walletStatus: ownerWalletStatusEnum("wallet_status").default("pending_verification"),
  lowBalanceThreshold: decimal("low_balance_threshold", { precision: 10, scale: 2 }).default("1.00"),
  autoTopupEnabled: boolean("auto_topup_enabled").default(false),
  autoTopupAmount: decimal("auto_topup_amount", { precision: 10, scale: 2 }).default("500.00"),
  // Billing configuration for batch processing
  billingCadence: billingCadenceEnum("billing_cadence").default("daily"), // immediate = process right away, daily = end of day, weekly = end of week
  billingCutoffTime: varchar("billing_cutoff_time").default("23:59:00"), // Time of day for billing cutoff (HH:MM:SS)
  billingTimezone: varchar("billing_timezone").default("America/Chicago"), // Owner's timezone for billing cutoff
  billingDayOfWeek: integer("billing_day_of_week").default(0), // Day of week for weekly billing (0=Sunday, 6=Saturday)
  // Monthly subscription billing
  subscriptionPlan: subscriptionPlanEnum("subscription_plan").default("none"),
  subscriptionStatus: subscriptionStatusEnum("subscription_status").default("inactive"),
  subscriptionFeeCents: integer("subscription_fee_cents").default(0), // Monthly or annual fee in cents
  feeAnchorDay: integer("fee_anchor_day").default(1), // Day of month (1-28) for monthly billing
  lastFeeBillingDate: varchar("last_fee_billing_date"), // YYYY-MM-DD format of last fee billing
  // Membership payment tracking
  membershipPaymentMethod: membershipPaymentMethodEnum("membership_payment_method"), // How membership fee was paid
  membershipPaymentNotes: text("membership_payment_notes"), // Optional notes about payment
  membershipActivatedBy: varchar("membership_activated_by"), // Admin user ID who manually activated (if applicable)
  membershipActivatedAt: timestamp("membership_activated_at"), // When membership was activated
  // Custom platform fee override (per-owner pricing)
  customPlatformFee: decimal("custom_platform_fee", { precision: 10, scale: 2 }), // Custom washout fee for this owner (nullable - uses global if not set)
  // Custom billing model with lottery (feature flag for pilot program)
  useCustomBillingModel: boolean("use_custom_billing_model").default(false), // When true, uses lottery model instead of driver payouts
  customWashoutRate: decimal("custom_washout_rate", { precision: 10, scale: 2 }), // Rate charged to owner per washout in custom model
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
  street: varchar("street").notNull(),
  city: varchar("city").notNull(),
  state: varchar("state").notNull(),
  zip: varchar("zip").notNull(),
  latitude: decimal("latitude", { precision: 9, scale: 6 }).notNull(),
  longitude: decimal("longitude", { precision: 10, scale: 6 }).notNull(),
  rate: decimal("rate", { precision: 10, scale: 2 }).notNull().default("0.50"),
  monthlyFeeCents: integer("monthly_fee_cents").default(100), // Monthly listing fee in cents (default $1.00)
  isActive: boolean("is_active").default(true),
  isVisible: boolean("is_visible").default(true),
  description: text("description"),
  amenities: text("amenities").array(),
  operatingHours: jsonb("operating_hours"),
  permitUrls: text("permit_urls").array(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Washout activities (unified for both washout and rubble drop-off services)
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
  latitude: decimal("latitude", { precision: 9, scale: 6 }),
  longitude: decimal("longitude", { precision: 10, scale: 6 }),
  // Rubble service fields
  serviceType: serviceTypeEnum("service_type").default("washout"), // washout or rubble_dropoff
  materialSlug: text("material_slug"), // e.g., 'dirt', 'asphalt' - null for washout
  materialCustomLabel: text("material_custom_label"), // Custom material name - null for washout
  qty: decimal("qty", { precision: 10, scale: 2 }), // Quantity for rubble (loads, tons, cy)
  unit: materialUnitEnum("unit"), // per_load, per_ton, per_cy - null for washout
  amountCentsOwnerToDriver: integer("amount_cents_owner_to_driver"), // Owner pays driver for rubble
  feeCentsPlatform: integer("fee_cents_platform").default(0), // Platform fee (always 200 for rubble_dropoff)
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

// Rubble service: Materials catalog (presets + normalization)
export const materials = pgTable("materials", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  slug: varchar("slug").unique().notNull(), // e.g., 'dirt', 'asphalt', 'brick'
  displayName: varchar("display_name").notNull(), // e.g., 'Dirt', 'Asphalt'
  synonyms: text("synonyms").array(), // e.g., ['soil', 'topsoil'] for dirt
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Rubble service: Location material intents (what materials each location accepts)
export const locationMaterialIntents = pgTable("location_material_intents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  locationId: varchar("location_id").notNull().references(() => washoutLocations.id, { onDelete: "cascade" }),
  materialSlug: varchar("material_slug").references(() => materials.slug), // null for custom materials
  customLabel: text("custom_label"), // For custom material entries
  unit: materialUnitEnum("unit").notNull(), // per_load, per_ton, per_cy
  rateCents: integer("rate_cents").notNull().default(0), // Amount owner pays driver; 0 allowed
  rules: jsonb("rules"), // {rebar_ok: bool, trash_ok: bool, wood_ok: bool, max_piece_inches: int|null}
  capacityDaily: integer("capacity_daily"), // Optional daily capacity limit
  queueMax: integer("queue_max"), // Optional queue limit
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  locationActiveIndex: index("idx_lmi_location_active").on(table.locationId, table.active),
  materialSlugIndex: index("idx_lmi_material_slug").on(table.materialSlug),
  updatedAtIndex: index("idx_lmi_updated_at").on(table.updatedAt),
}));

// Payments
export const payments = pgTable("payments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  driverId: varchar("driver_id").notNull().references(() => drivers.id, { onDelete: "cascade" }),
  ownerId: varchar("owner_id").notNull().references(() => owners.id, { onDelete: "cascade" }),
  activityId: varchar("activity_id").notNull().references(() => washoutActivities.id, { onDelete: "cascade" }),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  processingFee: decimal("processing_fee", { precision: 10, scale: 2 }).notNull(),
  washoutServiceFee: decimal("washout_service_fee", { precision: 10, scale: 2 }).notNull().default("8.00"),
  // Stripe payment tracking - critical for reconciliation
  stripePaymentIntentId: varchar("stripe_payment_intent_id"), // Stripe PaymentIntent ID for this payment
  stripeTransferId: varchar("stripe_transfer_id"), // Stripe Transfer ID to driver
  stripeChargeId: varchar("stripe_charge_id"), // Stripe Charge ID (for refund tracking)
  status: varchar("status").notNull().default("pending"),
  // Refund tracking
  refundedAt: timestamp("refunded_at"),
  refundAmount: decimal("refund_amount", { precision: 10, scale: 2 }),
  refundReason: text("refund_reason"),
  // Batch tracking fields for daily billing
  batchId: varchar("batch_id").references(() => billingBatches.id),
  businessDate: varchar("business_date"), // YYYY-MM-DD format for the business day
  paidAt: timestamp("paid_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Pending washout payments for hourly batch processing
export const pendingWashoutPayments = pgTable("pending_washout_payments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  activityId: varchar("activity_id").notNull().references(() => washoutActivities.id, { onDelete: "cascade" }),
  driverId: varchar("driver_id").notNull().references(() => drivers.id, { onDelete: "cascade" }),
  ownerId: varchar("owner_id").notNull().references(() => owners.id, { onDelete: "cascade" }),
  locationId: varchar("location_id").notNull().references(() => washoutLocations.id, { onDelete: "cascade" }),
  driverAmount: decimal("driver_amount", { precision: 10, scale: 2 }).notNull(),
  platformFee: decimal("platform_fee", { precision: 10, scale: 2 }).notNull(),
  totalAmount: decimal("total_amount", { precision: 10, scale: 2 }).notNull(),
  status: pendingPaymentStatusEnum("status").notNull().default("queued"),
  batchId: varchar("batch_id").references(() => washoutPaymentBatches.id),
  processedAt: timestamp("processed_at"),
  failureReason: text("failure_reason"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  statusIndex: index("idx_pending_payments_status").on(table.status),
  ownerStatusIndex: index("idx_pending_payments_owner_status").on(table.ownerId, table.status),
}));

// Washout payment batches for hourly batch processing
export const washoutPaymentBatches = pgTable("washout_payment_batches", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ownerId: varchar("owner_id").notNull().references(() => owners.id, { onDelete: "cascade" }),
  batchTime: timestamp("batch_time").notNull(),
  totalDriverPayments: decimal("total_driver_payments", { precision: 10, scale: 2 }).notNull().default("0.00"),
  totalPlatformFees: decimal("total_platform_fees", { precision: 10, scale: 2 }).notNull().default("0.00"),
  totalAmount: decimal("total_amount", { precision: 10, scale: 2 }).notNull().default("0.00"),
  paymentCount: integer("payment_count").notNull().default(0),
  stripePaymentIntentId: varchar("stripe_payment_intent_id"),
  status: batchStatusEnum("status").notNull().default("pending"),
  processingStartedAt: timestamp("processing_started_at"),
  completedAt: timestamp("completed_at"),
  failureReason: text("failure_reason"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  statusIndex: index("idx_washout_batches_status").on(table.status),
  ownerTimeIndex: index("idx_washout_batches_owner_time").on(table.ownerId, table.batchTime),
}));

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
  // Stripe transfer tracking for batch payments
  stripeBatchTransferId: varchar("stripe_batch_transfer_id"),
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

// Fees ledger for monthly recurring fees (location and subscription fees)
export const feesLedger = pgTable("fees_ledger", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ownerId: varchar("owner_id").notNull().references(() => owners.id, { onDelete: "cascade" }),
  feeType: feeTypeEnum("fee_type").notNull(),
  locationId: varchar("location_id").references(() => washoutLocations.id, { onDelete: "set null" }), // Nullable for subscription fees
  amountCents: integer("amount_cents").notNull(), // Fee amount in cents
  periodStart: varchar("period_start").notNull(), // YYYY-MM-DD format
  periodEnd: varchar("period_end").notNull(), // YYYY-MM-DD format
  status: feeStatusEnum("status").notNull().default("pending"),
  // Payment tracking
  walletTxId: varchar("wallet_tx_id").references(() => ownerWalletTransactions.id),
  stripeTransferId: varchar("stripe_transfer_id"), // Stripe Transfer ID
  batchId: varchar("batch_id").references(() => billingBatches.id), // Link to billing batch
  paidAt: timestamp("paid_at"),
  failureReason: text("failure_reason"),
  retryCount: integer("retry_count").notNull().default(0),
  metadata: jsonb("metadata"), // Store additional details (location name, plan type, etc.)
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  // Index for efficient queries by owner and period
  ownerPeriodIndex: index("idx_fees_ledger_owner_period").on(table.ownerId, table.periodStart),
  // Index for status queries
  statusIndex: index("idx_fees_ledger_status").on(table.status),
}));

// Owner funding sources for Stripe Treasury wallet top-ups
export const ownerFundingSources = pgTable("owner_funding_sources", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ownerId: varchar("owner_id").notNull().references(() => owners.id, { onDelete: "cascade" }),
  type: varchar("type").notNull(), // 'bank_account' for ACH transfers
  bankName: varchar("bank_name"),
  accountHolderName: varchar("account_holder_name"),
  routingNumber: varchar("routing_number"),
  accountNumber: varchar("account_number"), // Encrypted
  last4: varchar("last4").notNull(),
  // Stripe integration - payment method for ACH transfers
  stripePaymentMethodId: varchar("stripe_payment_method_id"),
  isDefault: boolean("is_default").default(false),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Owner wallet transactions for Stripe Treasury accounts
export const ownerWalletTransactions = pgTable("owner_wallet_transactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ownerId: varchar("owner_id").notNull().references(() => owners.id, { onDelete: "cascade" }),
  type: varchar("type").notNull(), // 'topup', 'washout_debit', 'fee_debit', 'refund', 'adjustment'
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  balanceBefore: decimal("balance_before", { precision: 10, scale: 2 }).notNull(),
  balanceAfter: decimal("balance_after", { precision: 10, scale: 2 }).notNull(),
  description: text("description"),
  // Related transaction references
  paymentId: varchar("payment_id").references(() => payments.id),
  batchId: varchar("batch_id").references(() => billingBatches.id),
  stripeTransferId: varchar("stripe_transfer_id"), // Reference to Stripe transfer
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  ownerDateIndex: index("idx_owner_wallet_transactions_owner_date").on(table.ownerId, table.createdAt),
}));

// Webhook events - Audit trail for all Stripe webhook events (enhanced with payload and status tracking)
export const webhookEvents = pgTable("webhook_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  stripeEventId: varchar("stripe_event_id").notNull().unique(), // Stripe's event ID for idempotency
  eventType: varchar("event_type").notNull(), // e.g., payment_intent.succeeded
  status: webhookEventStatusEnum("status").default("received").notNull(),
  payload: jsonb("payload").notNull(), // Full webhook payload from Stripe
  accountId: varchar("account_id"), // Related account if applicable
  processedAt: timestamp("processed_at"),
  errorMessage: text("error_message"), // If processing failed
  retryCount: integer("retry_count").default(0),
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
  // Stripe Treasury integration for payouts
  stripePayoutId: varchar("stripe_payout_id"), // Stripe Payout ID
  stripePaymentMethodId: varchar("stripe_payment_method_id"), // Stripe Payment Method ID
  failureReason: text("failure_reason"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
  processedAt: timestamp("processed_at"),
});

// Driver lottery entries - tracks entries earned per washout for external raffle
export const driverLotteryEntries = pgTable("driver_lottery_entries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  driverId: varchar("driver_id").notNull().references(() => drivers.id, { onDelete: "cascade" }),
  activityId: varchar("activity_id").notNull().references(() => washoutActivities.id, { onDelete: "cascade" }),
  ownerId: varchar("owner_id").notNull().references(() => owners.id, { onDelete: "cascade" }),
  entriesEarned: integer("entries_earned").notNull().default(1), // Number of lottery tickets earned
  lotteryMonth: integer("lottery_month").notNull(), // 1-12 for the month
  lotteryYear: integer("lottery_year").notNull(), // Year (e.g., 2025)
  isArchived: boolean("is_archived").default(false), // True when month is closed
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  driverIndex: index("idx_lottery_entries_driver").on(table.driverId),
  ownerIndex: index("idx_lottery_entries_owner").on(table.ownerId),
  activityIndex: uniqueIndex("uniq_lottery_entries_activity").on(table.activityId), // One entry per activity
  monthYearIndex: index("idx_lottery_entries_month_year").on(table.lotteryMonth, table.lotteryYear),
}));

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
  fundingSources: many(ownerFundingSources),
  walletTransactions: many(ownerWalletTransactions),
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

export const ownerFundingSourcesRelations = relations(ownerFundingSources, ({ one }) => ({
  owner: one(owners, { fields: [ownerFundingSources.ownerId], references: [owners.id] }),
}));

export const ownerWalletTransactionsRelations = relations(ownerWalletTransactions, ({ one }) => ({
  owner: one(owners, { fields: [ownerWalletTransactions.ownerId], references: [owners.id] }),
  payment: one(payments, { fields: [ownerWalletTransactions.paymentId], references: [payments.id] }),
  batch: one(billingBatches, { fields: [ownerWalletTransactions.batchId], references: [billingBatches.id] }),
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
  fees: many(feesLedger),
}));

export const feesLedgerRelations = relations(feesLedger, ({ one }) => ({
  owner: one(owners, { fields: [feesLedger.ownerId], references: [owners.id] }),
  location: one(washoutLocations, { fields: [feesLedger.locationId], references: [washoutLocations.id] }),
  walletTransaction: one(ownerWalletTransactions, { fields: [feesLedger.walletTxId], references: [ownerWalletTransactions.id] }),
  batch: one(billingBatches, { fields: [feesLedger.batchId], references: [billingBatches.id] }),
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

export const driverLotteryEntriesRelations = relations(driverLotteryEntries, ({ one }) => ({
  driver: one(drivers, { fields: [driverLotteryEntries.driverId], references: [drivers.id] }),
  activity: one(washoutActivities, { fields: [driverLotteryEntries.activityId], references: [washoutActivities.id] }),
  owner: one(owners, { fields: [driverLotteryEntries.ownerId], references: [owners.id] }),
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
  street: z.string().min(1, "Street is required"),
  city: z.string().min(1, "City is required"),
  state: z.string().min(2, "State is required"),
  zip: z.string().min(5, "ZIP code is required"),
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

export const insertDebitCardRequestSchema = createInsertSchema(debitCardRequests).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  requestedAt: true,
  issuedAt: true,
  activatedAt: true,
  cancelledAt: true,
  cardLast4: true,
  cardStatus: true,
  expirationMonth: true,
  expirationYear: true,
});

export const insertOwnerSchema = createInsertSchema(owners).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  walletBalance: true,
  walletStatus: true,
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

// Rubble service insert schemas
export const insertMaterialSchema = createInsertSchema(materials).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertLocationMaterialIntentSchema = createInsertSchema(locationMaterialIntents).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
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

export const insertOwnerFundingSourceSchema = createInsertSchema(ownerFundingSources).omit({
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

export const insertFeeLedgerSchema = createInsertSchema(feesLedger).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertPendingWashoutPaymentSchema = createInsertSchema(pendingWashoutPayments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertWashoutPaymentBatchSchema = createInsertSchema(washoutPaymentBatches).omit({
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
  columnTransferId: z.string().optional(),
  failureReason: z.string().optional(),
});

// Column onboarding validation schemas
export const columnOnboardingSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  ssn: z.string().regex(/^\d{9}$/, "SSN must be 9 digits"),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date of birth must be in YYYY-MM-DD format"),
  email: z.string().email("Invalid email format"),
  address: z.object({
    line1: z.string().min(1, "Address line 1 is required"),
    city: z.string().min(1, "City is required"),
    state: z.string().length(2, "State must be 2 letters"),
    postalCode: z.string().regex(/^\d{5}$/, "Postal code must be 5 digits"),
    countryCode: z.string().length(2, "Country code must be 2 letters").default("US"),
  }),
});

// Driver payout request validation schema
export const driverPayoutRequestSchema = z.object({
  amount: z.number().positive().min(5, "Minimum payout amount is $5"),
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
export type DebitCardRequest = typeof debitCardRequests.$inferSelect;
export type InsertDebitCardRequest = z.infer<typeof insertDebitCardRequestSchema>;
export type InsertOwner = z.infer<typeof insertOwnerSchema>;
export type InsertWashoutLocation = z.infer<typeof insertWashoutLocationSchema>;
export type InsertWashoutActivity = z.infer<typeof insertWashoutActivitySchema>;
export type InsertWashoutPhoto = z.infer<typeof insertWashoutPhotoSchema>;
export type InsertPayment = z.infer<typeof insertPaymentSchema>;
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type InsertPasswordResetToken = z.infer<typeof insertPasswordResetTokenSchema>;
export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
export type OwnerFundingSource = typeof ownerFundingSources.$inferSelect;
export type InsertOwnerFundingSource = z.infer<typeof insertOwnerFundingSourceSchema>;
export type OwnerWalletTransaction = typeof ownerWalletTransactions.$inferSelect;
export type DriverWallet = typeof driverWallets.$inferSelect;
export type WalletTransaction = typeof walletTransactions.$inferSelect;
export type Withdrawal = typeof withdrawals.$inferSelect;
export type InsertDriverWallet = z.infer<typeof insertDriverWalletSchema>;
export type InsertWalletTransaction = z.infer<typeof insertWalletTransactionSchema>;
export type InsertWithdrawal = z.infer<typeof insertWithdrawalSchema>;
export type BillingBatch = typeof billingBatches.$inferSelect;
export type InsertBillingBatch = z.infer<typeof insertBillingBatchSchema>;
export type FeeLedger = typeof feesLedger.$inferSelect;
export type InsertFeeLedger = z.infer<typeof insertFeeLedgerSchema>;
export type PendingWashoutPayment = typeof pendingWashoutPayments.$inferSelect;
export type InsertPendingWashoutPayment = z.infer<typeof insertPendingWashoutPaymentSchema>;
export type WashoutPaymentBatch = typeof washoutPaymentBatches.$inferSelect;
export type InsertWashoutPaymentBatch = z.infer<typeof insertWashoutPaymentBatchSchema>;
export type ServicePaymentAccount = typeof servicePaymentAccounts.$inferSelect;
export type InsertServicePaymentAccount = z.infer<typeof insertServicePaymentAccountSchema>;
export type UpdateServicePaymentAccount = z.infer<typeof updateServicePaymentAccountSchema>;

// Rubble service types
export type Material = typeof materials.$inferSelect;
export type InsertMaterial = z.infer<typeof insertMaterialSchema>;
export type LocationMaterialIntent = typeof locationMaterialIntents.$inferSelect;
export type InsertLocationMaterialIntent = z.infer<typeof insertLocationMaterialIntentSchema>;

// Webhook Events
export const insertWebhookEventSchema = createInsertSchema(webhookEvents).omit({
  id: true,
  createdAt: true,
});

export type WebhookEvent = typeof webhookEvents.$inferSelect;
export type InsertWebhookEvent = z.infer<typeof insertWebhookEventSchema>;

// Feature Flags System
export const featureFlags = pgTable("feature_flags", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  flagKey: varchar("flag_key").notNull().unique(),
  enabled: boolean("enabled").default(false).notNull(),
  description: text("description"),
  allowedRoles: text("allowed_roles").array(), // Array of roles that can access this feature
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const featureFlagOverrides = pgTable("feature_flag_overrides", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  flagId: varchar("flag_id").notNull().references(() => featureFlags.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  enabled: boolean("enabled").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  uniqueIndex("unique_flag_user").on(table.flagId, table.userId),
]);

// Feature flag schemas
export const insertFeatureFlagSchema = createInsertSchema(featureFlags).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertFeatureFlagOverrideSchema = createInsertSchema(featureFlagOverrides).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type FeatureFlag = typeof featureFlags.$inferSelect;
export type InsertFeatureFlag = z.infer<typeof insertFeatureFlagSchema>;
export type FeatureFlagOverride = typeof featureFlagOverrides.$inferSelect;
export type InsertFeatureFlagOverride = z.infer<typeof insertFeatureFlagOverrideSchema>;

// System Settings - Global configuration that can be changed at runtime
export const systemSettings = pgTable("system_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  // Stripe Automatic Tax - enables/disables automatic tax calculation on all payments
  automaticTaxEnabled: boolean("automatic_tax_enabled").default(false).notNull(),
  // Platform Washout Fee - fee charged per washout transaction (in dollars)
  // Testing: $0.40 (10% of production), Production: $4.00
  platformWashoutFee: decimal("platform_washout_fee", { precision: 10, scale: 2 }).default("0.40").notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
  updatedBy: varchar("updated_by").references(() => users.id), // Track who made the change
});

// System settings schemas
export const updateSystemSettingsSchema = z.object({
  automaticTaxEnabled: z.boolean().optional(),
  platformWashoutFee: z.string()
    .regex(/^\d+(\.\d{1,2})?$/, "Must be a valid decimal number")
    .refine((val) => parseFloat(val) > 0, "Platform fee must be greater than zero")
    .optional(),
});

export type SystemSettings = typeof systemSettings.$inferSelect;
export type UpdateSystemSettings = z.infer<typeof updateSystemSettingsSchema>;

// Balance Reconciliations - Track reconciliation runs
export const balanceReconciliations = pgTable("balance_reconciliations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  status: reconciliationStatusEnum("status").default("running").notNull(),
  accountsChecked: integer("accounts_checked").default(0),
  discrepanciesFound: integer("discrepancies_found").default(0),
  totalAmountDiscrepancy: decimal("total_amount_discrepancy", { precision: 10, scale: 2 }).default("0"),
  startedAt: timestamp("started_at").defaultNow(),
  completedAt: timestamp("completed_at"),
  errorMessage: text("error_message"),
  triggeredBy: varchar("triggered_by").references(() => users.id), // User who triggered (null if automated)
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertBalanceReconciliationSchema = createInsertSchema(balanceReconciliations).omit({
  id: true,
  createdAt: true,
});

export type BalanceReconciliation = typeof balanceReconciliations.$inferSelect;
export type InsertBalanceReconciliation = z.infer<typeof insertBalanceReconciliationSchema>;

// Reconciliation Discrepancies - Individual discrepancies found during reconciliation
export const reconciliationDiscrepancies = pgTable("reconciliation_discrepancies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  reconciliationId: varchar("reconciliation_id").notNull().references(() => balanceReconciliations.id, { onDelete: "cascade" }),
  accountType: varchar("account_type").notNull(), // 'driver' or 'owner'
  accountId: varchar("account_id").notNull(), // Driver or owner ID
  discrepancyType: discrepancyTypeEnum("discrepancy_type").notNull(),
  databaseBalance: decimal("database_balance", { precision: 10, scale: 2 }),
  stripeBalance: decimal("stripe_balance", { precision: 10, scale: 2 }),
  difference: decimal("difference", { precision: 10, scale: 2 }), // Absolute difference
  severity: varchar("severity"), // 'critical' | 'warning' | 'minor'
  stripeAccountId: varchar("stripe_account_id"), // Connect account ID for reference
  description: text("description"),
  resolved: boolean("resolved").default(false),
  resolvedAt: timestamp("resolved_at"),
  resolvedBy: varchar("resolved_by").references(() => users.id),
  resolutionNotes: text("resolution_notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertReconciliationDiscrepancySchema = createInsertSchema(reconciliationDiscrepancies).omit({
  id: true,
  createdAt: true,
});

export type ReconciliationDiscrepancy = typeof reconciliationDiscrepancies.$inferSelect;
export type InsertReconciliationDiscrepancy = z.infer<typeof insertReconciliationDiscrepancySchema>;

// Driver lottery entries schemas
export const insertDriverLotteryEntrySchema = createInsertSchema(driverLotteryEntries).omit({
  id: true,
  createdAt: true,
});

export type DriverLotteryEntry = typeof driverLotteryEntries.$inferSelect;
export type InsertDriverLotteryEntry = z.infer<typeof insertDriverLotteryEntrySchema>;

// Date range validation schema
export const dateRangeSchema = z.enum(['today', 'yesterday', '7days', '30days', '90days', 'all']).default('today');

// Query parameter schemas
export const ownerActivitiesQuerySchema = z.object({
  dateRange: dateRangeSchema.optional(),
});

// Manual membership activation schema
export const activateMembershipSchema = z.object({
  paymentMethod: z.enum(['stripe', 'cash', 'check', 'bank_transfer', 'waived', 'other']),
  paymentNotes: z.string().optional(),
});
