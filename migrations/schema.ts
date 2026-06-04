import { pgTable, unique, varchar, boolean, text, timestamp, uniqueIndex, foreignKey, integer, numeric, jsonb, index, pgEnum } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

export const auditAction = pgEnum("audit_action", ['create', 'update', 'delete', 'soft_delete', 'restore'])
export const auditEntity = pgEnum("audit_entity", ['user', 'driver', 'owner', 'location', 'washout', 'payment', 'wallet', 'withdrawal', 'debit_card', 'billing'])
export const batchStatus = pgEnum("batch_status", ['pending', 'processing', 'completed', 'failed', 'cancelled'])
export const billingCadence = pgEnum("billing_cadence", ['immediate', 'daily', 'weekly', 'monthly'])
export const debitCardStatus = pgEnum("debit_card_status", ['requested', 'processing', 'issued', 'active', 'blocked', 'cancelled'])
export const distributionFrequency = pgEnum("distribution_frequency", ['daily', 'weekly', 'biweekly', 'monthly'])
export const feeStatus = pgEnum("fee_status", ['pending', 'paid', 'failed', 'past_due', 'waived'])
export const feeType = pgEnum("fee_type", ['location_monthly', 'subscription_monthly', 'subscription_annual'])
export const membershipPaymentMethod = pgEnum("membership_payment_method", ['stripe', 'cash', 'check', 'bank_transfer', 'waived', 'other'])
export const messageStatus = pgEnum("message_status", ['unread', 'read', 'resolved'])
export const ownerWalletStatus = pgEnum("owner_wallet_status", ['active', 'suspended', 'pending_verification'])
export const paymentFrequency = pgEnum("payment_frequency", ['weekly', 'biweekly', 'monthly'])
export const paymentMethod = pgEnum("payment_method", ['check', 'venmo', 'zelle', 'ach', 'credit_card'])
export const subscriptionPlan = pgEnum("subscription_plan", ['none', 'monthly', 'annual', 'one_time'])
export const subscriptionStatus = pgEnum("subscription_status", ['active', 'inactive', 'trial', 'past_due'])
export const transactionDirection = pgEnum("transaction_direction", ['credit', 'debit', 'fee'])
export const transactionSourceType = pgEnum("transaction_source_type", ['washout', 'withdrawal', 'adjustment'])
export const transactionStatus = pgEnum("transaction_status", ['pending', 'posted', 'failed'])
export const userRole = pgEnum("user_role", ['driver', 'owner', 'admin', 'super_admin'])
export const washoutStatus = pgEnum("washout_status", ['pending', 'verified', 'rejected'])
export const withdrawalStatus = pgEnum("withdrawal_status", ['requested', 'processing', 'paid', 'failed', 'canceled'])


export const featureFlags = pgTable("feature_flags", {
	id: varchar().default(gen_random_uuid()).primaryKey().notNull(),
	flagKey: varchar("flag_key").notNull(),
	enabled: boolean().default(false).notNull(),
	description: text(),
	allowedRoles: text("allowed_roles").array(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	unique("feature_flags_flag_key_unique").on(table.flagKey),
]);

export const featureFlagOverrides = pgTable("feature_flag_overrides", {
	id: varchar().default(gen_random_uuid()).primaryKey().notNull(),
	flagId: varchar("flag_id").notNull(),
	userId: varchar("user_id").notNull(),
	enabled: boolean().notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	uniqueIndex("unique_flag_user").using("btree", table.flagId.asc().nullsLast().op("text_ops"), table.userId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.flagId],
			foreignColumns: [featureFlags.id],
			name: "feature_flag_overrides_flag_id_feature_flags_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "feature_flag_overrides_user_id_users_id_fk"
		}).onDelete("cascade"),
]);

export const debitCardRequests = pgTable("debit_card_requests", {
	id: varchar().default(gen_random_uuid()).primaryKey().notNull(),
	driverId: varchar("driver_id").notNull(),
	userId: varchar("user_id").notNull(),
	shippingName: varchar("shipping_name").notNull(),
	shippingStreet: varchar("shipping_street").notNull(),
	shippingCity: varchar("shipping_city").notNull(),
	shippingState: varchar("shipping_state").notNull(),
	shippingZip: varchar("shipping_zip").notNull(),
	cardStatus: debitCardStatus("card_status").default('requested').notNull(),
	cardLast4: varchar("card_last4"),
	cardType: varchar("card_type").default('physical'),
	expirationMonth: varchar("expiration_month"),
	expirationYear: varchar("expiration_year"),
	requestedAt: timestamp("requested_at", { mode: 'string' }).defaultNow(),
	issuedAt: timestamp("issued_at", { mode: 'string' }),
	activatedAt: timestamp("activated_at", { mode: 'string' }),
	cancelledAt: timestamp("cancelled_at", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
	stripeIssuingCardId: varchar("stripe_issuing_card_id"),
}, (table) => [
	foreignKey({
			columns: [table.driverId],
			foreignColumns: [drivers.id],
			name: "debit_card_requests_driver_id_drivers_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "debit_card_requests_user_id_users_id_fk"
		}).onDelete("cascade"),
]);

export const washoutPhotos = pgTable("washout_photos", {
	id: varchar().default(gen_random_uuid()).primaryKey().notNull(),
	activityId: varchar("activity_id").notNull(),
	driverId: varchar("driver_id").notNull(),
	locationId: varchar("location_id").notNull(),
	storageKey: varchar("storage_key").notNull(),
	imageFingerprint: text("image_fingerprint"),
	duplicateMatchedPhotoId: varchar("duplicate_matched_photo_id"),
	duplicateMatchedUploadedAt: timestamp("duplicate_matched_uploaded_at", { mode: 'string' }),
	duplicateSimilarityScore: integer("duplicate_similarity_score"),
	duplicateHashDistance: integer("duplicate_hash_distance"),
	photoTakenAt: timestamp("photo_taken_at", { mode: 'string' }).notNull(),
	uploadedAt: timestamp("uploaded_at", { mode: 'string' }).defaultNow().notNull(),
	gpsLatitude: numeric("gps_latitude", { precision: 10, scale:  8 }),
	gpsLongitude: numeric("gps_longitude", { precision: 11, scale:  8 }),
	verificationStatus: photoVerificationStatus("verification_status").default('needs_review').notNull(),
	verificationDistanceMiles: numeric("verification_distance_miles", { precision: 8, scale: 3 }),
	verificationReason: text("verification_reason"),
	fileSize: integer("file_size"),
	contentType: varchar("content_type").default('image/jpeg'),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	foreignKey({
			columns: [table.activityId],
			foreignColumns: [washoutActivities.id],
			name: "washout_photos_activity_id_washout_activities_id_fk"
	}).onDelete("cascade"),
	foreignKey({
			columns: [table.driverId],
			foreignColumns: [drivers.id],
			name: "washout_photos_driver_id_drivers_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.locationId],
			foreignColumns: [washoutLocations.id],
			name: "washout_photos_location_id_washout_locations_id_fk"
		}).onDelete("cascade"),
]);

export const payments = pgTable("payments", {
	id: varchar().default(gen_random_uuid()).primaryKey().notNull(),
	driverId: varchar("driver_id").notNull(),
	ownerId: varchar("owner_id").notNull(),
	activityId: varchar("activity_id").notNull(),
	amount: numeric({ precision: 10, scale:  2 }).notNull(),
	processingFee: numeric("processing_fee", { precision: 10, scale:  2 }).notNull(),
	status: varchar().default('pending').notNull(),
	paidAt: timestamp("paid_at", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
	batchId: varchar("batch_id"),
	businessDate: varchar("business_date"),
	washoutServiceFee: numeric("washout_service_fee", { precision: 10, scale:  2 }).default('8.00').notNull(),
	stripeTransferId: varchar("stripe_transfer_id"),
}, (table) => [
	foreignKey({
			columns: [table.driverId],
			foreignColumns: [drivers.id],
			name: "payments_driver_id_drivers_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.ownerId],
			foreignColumns: [owners.id],
			name: "payments_owner_id_owners_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.activityId],
			foreignColumns: [washoutActivities.id],
			name: "payments_activity_id_washout_activities_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.batchId],
			foreignColumns: [billingBatches.id],
			name: "payments_batch_id_billing_batches_id_fk"
		}),
]);

export const notifications = pgTable("notifications", {
	id: varchar().default(gen_random_uuid()).primaryKey().notNull(),
	userId: varchar("user_id").notNull(),
	title: varchar().notNull(),
	message: text().notNull(),
	type: varchar().default('info').notNull(),
	isRead: boolean("is_read").default(false),
	data: jsonb(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "notifications_user_id_users_id_fk"
		}).onDelete("cascade"),
]);

export const sessions = pgTable("sessions", {
	sid: varchar().primaryKey().notNull(),
	sess: jsonb().notNull(),
	expire: timestamp({ mode: 'string' }).notNull(),
}, (table) => [
	index("IDX_session_expire").using("btree", table.expire.asc().nullsLast().op("timestamp_ops")),
]);

export const washoutActivities = pgTable("washout_activities", {
	id: varchar().default(gen_random_uuid()).primaryKey().notNull(),
	driverId: varchar("driver_id").notNull(),
	locationId: varchar("location_id").notNull(),
	status: washoutStatus().default('pending').notNull(),
	amount: numeric({ precision: 10, scale:  2 }).notNull(),
	checkInTime: timestamp("check_in_time", { mode: 'string' }).notNull(),
	checkOutTime: timestamp("check_out_time", { mode: 'string' }),
	photoUrls: text("photo_urls").array(),
	notes: text(),
	verifiedBy: varchar("verified_by"),
	verifiedAt: timestamp("verified_at", { mode: 'string' }),
	latitude: numeric({ precision: 9, scale:  6 }),
	longitude: numeric({ precision: 10, scale:  6 }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	foreignKey({
			columns: [table.driverId],
			foreignColumns: [drivers.id],
			name: "washout_activities_driver_id_drivers_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.locationId],
			foreignColumns: [washoutLocations.id],
			name: "washout_activities_location_id_washout_locations_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.verifiedBy],
			foreignColumns: [users.id],
			name: "washout_activities_verified_by_users_id_fk"
		}),
]);

export const driverWallets = pgTable("driver_wallets", {
	driverId: varchar("driver_id").primaryKey().notNull(),
	availableBalance: numeric("available_balance", { precision: 10, scale:  2 }).default('0.00').notNull(),
	pendingBalance: numeric("pending_balance", { precision: 10, scale:  2 }).default('0.00').notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	foreignKey({
			columns: [table.driverId],
			foreignColumns: [drivers.id],
			name: "driver_wallets_driver_id_drivers_id_fk"
		}).onDelete("cascade"),
]);

export const messages = pgTable("messages", {
	id: varchar().default(gen_random_uuid()).primaryKey().notNull(),
	userId: varchar("user_id").notNull(),
	subject: varchar().notNull(),
	message: text().notNull(),
	status: messageStatus().default('unread'),
	userRole: userRole("user_role").notNull(),
	userPhone: varchar("user_phone"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	resolvedAt: timestamp("resolved_at", { mode: 'string' }),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "messages_user_id_users_id_fk"
		}).onDelete("cascade"),
]);

export const passwordResetTokens = pgTable("password_reset_tokens", {
	id: varchar().default(gen_random_uuid()).primaryKey().notNull(),
	userId: varchar("user_id").notNull(),
	token: varchar().notNull(),
	expiresAt: timestamp("expires_at", { mode: 'string' }).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "password_reset_tokens_user_id_users_id_fk"
		}).onDelete("cascade"),
	unique("password_reset_tokens_token_unique").on(table.token),
]);

export const washoutLocations = pgTable("washout_locations", {
	id: varchar().default(gen_random_uuid()).primaryKey().notNull(),
	ownerId: varchar("owner_id").notNull(),
	name: varchar().notNull(),
	latitude: numeric({ precision: 9, scale:  6 }).notNull(),
	longitude: numeric({ precision: 10, scale:  6 }).notNull(),
	rate: numeric({ precision: 10, scale:  2 }).default('5.00').notNull(),
	driverIncentiveTip: integer("driver_incentive_tip").default(0).notNull(),
	isActive: boolean("is_active").default(true),
	isVisible: boolean("is_visible").default(true),
	description: text(),
	amenities: text().array(),
	operatingHours: jsonb("operating_hours"),
	permitUrls: text("permit_urls").array(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
	monthlyFeeCents: integer("monthly_fee_cents").default(10000),
	street: varchar().notNull(),
	city: varchar().notNull(),
	state: varchar().notNull(),
	zip: varchar().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.ownerId],
			foreignColumns: [owners.id],
			name: "washout_locations_owner_id_owners_id_fk"
		}).onDelete("cascade"),
]);

export const webhookEvents = pgTable("webhook_events", {
	id: varchar().default(gen_random_uuid()).primaryKey().notNull(),
	stripeEventId: varchar("stripe_event_id").notNull(),
	eventType: varchar("event_type").notNull(),
	processed: boolean().default(false),
	accountId: varchar("account_id"),
	retryCount: integer("retry_count").default(0),
	errorMessage: text("error_message"),
	processedAt: timestamp("processed_at", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	unique("webhook_events_stripe_event_id_unique").on(table.stripeEventId),
]);

export const ownerWalletTransactions = pgTable("owner_wallet_transactions", {
	id: varchar().default(gen_random_uuid()).primaryKey().notNull(),
	ownerId: varchar("owner_id").notNull(),
	type: varchar().notNull(),
	amount: numeric({ precision: 10, scale:  2 }).notNull(),
	description: text(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	balanceBefore: numeric("balance_before", { precision: 10, scale:  2 }).notNull(),
	balanceAfter: numeric("balance_after", { precision: 10, scale:  2 }).notNull(),
	paymentId: varchar("payment_id"),
	batchId: varchar("batch_id"),
	stripeTransferId: varchar("stripe_transfer_id"),
}, (table) => [
	index("idx_owner_wallet_transactions_owner_date").using("btree", table.ownerId.asc().nullsLast().op("text_ops"), table.createdAt.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.ownerId],
			foreignColumns: [owners.id],
			name: "owner_wallet_transactions_owner_id_owners_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.paymentId],
			foreignColumns: [payments.id],
			name: "owner_wallet_transactions_payment_id_payments_id_fk"
		}),
	foreignKey({
			columns: [table.batchId],
			foreignColumns: [billingBatches.id],
			name: "owner_wallet_transactions_batch_id_billing_batches_id_fk"
		}),
]);

export const feesLedger = pgTable("fees_ledger", {
	id: varchar().default(gen_random_uuid()).primaryKey().notNull(),
	ownerId: varchar("owner_id").notNull(),
	feeType: feeType("fee_type").notNull(),
	locationId: varchar("location_id"),
	amountCents: integer("amount_cents").notNull(),
	periodStart: varchar("period_start").notNull(),
	periodEnd: varchar("period_end").notNull(),
	status: feeStatus().default('pending').notNull(),
	walletTxId: varchar("wallet_tx_id"),
	batchId: varchar("batch_id"),
	paidAt: timestamp("paid_at", { mode: 'string' }),
	failureReason: text("failure_reason"),
	retryCount: integer("retry_count").default(0).notNull(),
	metadata: jsonb(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
	stripeTransferId: varchar("stripe_transfer_id"),
}, (table) => [
	index("idx_fees_ledger_owner_period").using("btree", table.ownerId.asc().nullsLast().op("text_ops"), table.periodStart.asc().nullsLast().op("text_ops")),
	index("idx_fees_ledger_status").using("btree", table.status.asc().nullsLast().op("enum_ops")),
	foreignKey({
			columns: [table.ownerId],
			foreignColumns: [owners.id],
			name: "fees_ledger_owner_id_owners_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.locationId],
			foreignColumns: [washoutLocations.id],
			name: "fees_ledger_location_id_washout_locations_id_fk"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.walletTxId],
			foreignColumns: [ownerWalletTransactions.id],
			name: "fees_ledger_wallet_tx_id_owner_wallet_transactions_id_fk"
		}),
	foreignKey({
			columns: [table.batchId],
			foreignColumns: [billingBatches.id],
			name: "fees_ledger_batch_id_billing_batches_id_fk"
		}),
]);

export const owners = pgTable("owners", {
	id: varchar().default(gen_random_uuid()).primaryKey().notNull(),
	userId: varchar("user_id").notNull(),
	companyName: varchar("company_name"),
	businessLicense: varchar("business_license"),
	taxId: varchar("tax_id"),
	isApproved: boolean("is_approved").default(false),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
	hasAgreedToTerms: boolean("has_agreed_to_terms").default(false),
	termsAgreedAt: timestamp("terms_agreed_at", { mode: 'string' }),
	walletBalance: numeric("wallet_balance", { precision: 10, scale:  2 }).default('0.00').notNull(),
	walletStatus: ownerWalletStatus("wallet_status").default('pending_verification'),
	lowBalanceThreshold: numeric("low_balance_threshold", { precision: 10, scale:  2 }).default('100.00'),
	autoTopupEnabled: boolean("auto_topup_enabled").default(false),
	autoTopupAmount: numeric("auto_topup_amount", { precision: 10, scale:  2 }).default('500.00'),
	billingCadence: billingCadence("billing_cadence").default('weekly'),
	billingCutoffTime: varchar("billing_cutoff_time").default('23:59:00'),
	billingTimezone: varchar("billing_timezone").default('America/Chicago'),
	subscriptionPlan: subscriptionPlan("subscription_plan").default('none'),
	subscriptionFeeCents: integer("subscription_fee_cents").default(0),
	feeAnchorDay: integer("fee_anchor_day").default(1),
	lastFeeBillingDate: varchar("last_fee_billing_date"),
	membershipPaymentMethod: membershipPaymentMethod("membership_payment_method"),
	membershipPaymentNotes: text("membership_payment_notes"),
	membershipActivatedBy: varchar("membership_activated_by"),
	membershipActivatedAt: timestamp("membership_activated_at", { mode: 'string' }),
	stripeConnectAccountId: varchar("stripe_connect_account_id"),
	stripeTreasuryAccountId: varchar("stripe_treasury_account_id"),
	stripeCustomerId: varchar("stripe_customer_id"),
	stripePaymentIntentId: varchar("stripe_payment_intent_id"),
	subscriptionStatus: subscriptionStatus("subscription_status").default('inactive'),
	stripePaymentMethodId: varchar("stripe_payment_method_id"),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "owners_user_id_users_id_fk"
		}).onDelete("cascade"),
]);

export const servicePaymentAccounts = pgTable("service_payment_accounts", {
	id: varchar().default(gen_random_uuid()).primaryKey().notNull(),
	name: varchar().notNull(),
	description: text(),
	stripeAccountId: varchar("stripe_account_id"),
	stripePublishableKey: varchar("stripe_publishable_key"),
	webhookEndpointId: varchar("webhook_endpoint_id"),
	platformFeePercentage: numeric("platform_fee_percentage", { precision: 5, scale:  2 }).default('10.00'),
	processingFeeFlat: numeric("processing_fee_flat", { precision: 10, scale:  2 }).default('0.30'),
	processingFeePercentage: numeric("processing_fee_percentage", { precision: 5, scale:  2 }).default('2.90'),
	collectPaymentsFromOwners: boolean("collect_payments_from_owners").default(true),
	autoDistributeToDrivers: boolean("auto_distribute_to_drivers").default(true),
	minimumPayoutAmount: numeric("minimum_payout_amount", { precision: 10, scale:  2 }).default('5.00'),
	isActive: boolean("is_active").default(true),
	isDefault: boolean("is_default").default(false),
	lastPayoutAt: timestamp("last_payout_at", { mode: 'string' }),
	totalProcessed: numeric("total_processed", { precision: 15, scale:  2 }).default('0.00'),
	totalFeesCollected: numeric("total_fees_collected", { precision: 15, scale:  2 }).default('0.00'),
	createdBy: varchar("created_by"),
	updatedBy: varchar("updated_by"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
	distributionFrequency: distributionFrequency("distribution_frequency").default('daily'),
}, (table) => [
	uniqueIndex("uniq_service_payment_accounts_default").using("btree", table.isDefault.asc().nullsLast().op("bool_ops")).where(sql`(is_default = true)`),
	foreignKey({
			columns: [table.createdBy],
			foreignColumns: [users.id],
			name: "service_payment_accounts_created_by_users_id_fk"
		}),
	foreignKey({
			columns: [table.updatedBy],
			foreignColumns: [users.id],
			name: "service_payment_accounts_updated_by_users_id_fk"
		}),
]);

export const drivers = pgTable("drivers", {
	id: varchar().default(gen_random_uuid()).primaryKey().notNull(),
	userId: varchar("user_id").notNull(),
	employerName: varchar("employer_name"),
	employerPhone: varchar("employer_phone"),
	licenseNumber: varchar("license_number"),
	isGpsEnabled: boolean("is_gps_enabled").default(true),
	currentLatitude: numeric("current_latitude", { precision: 10, scale:  8 }),
	currentLongitude: numeric("current_longitude", { precision: 11, scale:  8 }),
	lastLocationUpdate: timestamp("last_location_update", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
	truckNumber: varchar("truck_number"),
	hasAgreedToTerms: boolean("has_agreed_to_terms").default(false),
	termsAgreedAt: timestamp("terms_agreed_at", { mode: 'string' }),
	paymentMethod: text("payment_method").default('ach'),
	bankName: varchar("bank_name"),
	accountHolderName: varchar("account_holder_name"),
	routingNumber: varchar("routing_number"),
	accountNumber: varchar("account_number"),
	venmoHandle: varchar("venmo_handle"),
	zelleEmail: varchar("zelle_email"),
	employerStreet: varchar("employer_street"),
	employerCity: varchar("employer_city"),
	employerState: varchar("employer_state"),
	employerZip: varchar("employer_zip"),
	stripeTreasuryAccountId: varchar("stripe_treasury_account_id"),
	stripeIssuingCardholderId: varchar("stripe_issuing_cardholder_id"),
	stripeTreasuryAccountLast4: varchar("stripe_treasury_account_last4"),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "drivers_user_id_users_id_fk"
		}).onDelete("cascade"),
]);

export const users = pgTable("users", {
	id: varchar().default(gen_random_uuid()).primaryKey().notNull(),
	email: varchar().notNull(),
	firstName: varchar("first_name").notNull(),
	lastName: varchar("last_name").notNull(),
	profileImageUrl: varchar("profile_image_url"),
	role: userRole(),
	phone: varchar(),
	paymentMethod: text("payment_method").default('ach'),
	paymentFrequency: paymentFrequency("payment_frequency").default('weekly'),
	isActive: boolean("is_active").default(true),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
	username: varchar().notNull(),
	passwordHash: varchar("password_hash").notNull(),
	street: varchar(),
	city: varchar(),
	state: varchar(),
	zip: varchar(),
	stripeConnectAccountId: varchar("stripe_connect_account_id"),
	stripeCustomerId: varchar("stripe_customer_id"),
}, (table) => [
	unique("users_email_unique").on(table.email),
	unique("users_username_unique").on(table.username),
]);

export const billingBatches = pgTable("billing_batches", {
	id: varchar().default(gen_random_uuid()).primaryKey().notNull(),
	ownerId: varchar("owner_id").notNull(),
	businessDate: varchar("business_date").notNull(),
	cutoffTime: varchar("cutoff_time").notNull(),
	timezone: varchar().notNull(),
	totalAmount: numeric("total_amount", { precision: 10, scale:  2 }).default('0.00').notNull(),
	totalFees: numeric("total_fees", { precision: 10, scale:  2 }).default('0.00').notNull(),
	paymentCount: integer("payment_count").default(0).notNull(),
	status: batchStatus().default('pending').notNull(),
	processingStartedAt: timestamp("processing_started_at", { mode: 'string' }),
	completedAt: timestamp("completed_at", { mode: 'string' }),
	failureReason: text("failure_reason"),
	retryCount: integer("retry_count").default(0).notNull(),
	metadata: jsonb(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
	stripeBatchTransferId: varchar("stripe_batch_transfer_id"),
}, (table) => [
	index("idx_billing_batches_status_date").using("btree", table.status.asc().nullsLast().op("text_ops"), table.businessDate.asc().nullsLast().op("enum_ops")),
	uniqueIndex("uniq_billing_batches_owner_date").using("btree", table.ownerId.asc().nullsLast().op("text_ops"), table.businessDate.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.ownerId],
			foreignColumns: [owners.id],
			name: "billing_batches_owner_id_owners_id_fk"
		}).onDelete("cascade"),
]);

export const ownerFundingSources = pgTable("owner_funding_sources", {
	id: varchar().default(gen_random_uuid()).primaryKey().notNull(),
	ownerId: varchar("owner_id").notNull(),
	type: varchar().notNull(),
	bankName: varchar("bank_name"),
	accountHolderName: varchar("account_holder_name"),
	routingNumber: varchar("routing_number"),
	last4: varchar().notNull(),
	isDefault: boolean("is_default").default(false),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
	accountNumber: varchar("account_number"),
	isActive: boolean("is_active").default(true),
	stripePaymentMethodId: varchar("stripe_payment_method_id"),
}, (table) => [
	foreignKey({
			columns: [table.ownerId],
			foreignColumns: [owners.id],
			name: "owner_funding_sources_owner_id_owners_id_fk"
		}).onDelete("cascade"),
]);

export const walletTransactions = pgTable("wallet_transactions", {
	id: varchar().default(gen_random_uuid()).primaryKey().notNull(),
	driverId: varchar("driver_id").notNull(),
	amount: numeric({ precision: 10, scale:  2 }).notNull(),
	direction: transactionDirection().notNull(),
	balanceAfter: numeric("balance_after", { precision: 10, scale:  2 }).notNull(),
	currency: varchar().default('USD').notNull(),
	sourceType: transactionSourceType("source_type").notNull(),
	sourceId: varchar("source_id"),
	status: transactionStatus().default('pending').notNull(),
	description: text(),
	metadata: jsonb(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_wallet_transactions_driver").using("btree", table.driverId.asc().nullsLast().op("text_ops"), table.createdAt.asc().nullsLast().op("timestamp_ops")),
	uniqueIndex("uniq_wallet_transactions_idempotency").using("btree", table.driverId.asc().nullsLast().op("enum_ops"), table.sourceType.asc().nullsLast().op("text_ops"), table.sourceId.asc().nullsLast().op("text_ops"), table.direction.asc().nullsLast().op("enum_ops")),
	foreignKey({
			columns: [table.driverId],
			foreignColumns: [drivers.id],
			name: "wallet_transactions_driver_id_drivers_id_fk"
		}).onDelete("cascade"),
]);

export const withdrawals = pgTable("withdrawals", {
	id: varchar().default(gen_random_uuid()).primaryKey().notNull(),
	driverId: varchar("driver_id").notNull(),
	amountRequested: numeric("amount_requested", { precision: 10, scale:  2 }).notNull(),
	feeAmount: numeric("fee_amount", { precision: 10, scale:  2 }).default('0.00').notNull(),
	amountNet: numeric("amount_net", { precision: 10, scale:  2 }).notNull(),
	status: withdrawalStatus().default('requested').notNull(),
	failureReason: text("failure_reason"),
	metadata: jsonb(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	processedAt: timestamp("processed_at", { mode: 'string' }),
	stripePayoutId: varchar("stripe_payout_id"),
	stripePaymentMethodId: varchar("stripe_payment_method_id"),
}, (table) => [
	foreignKey({
			columns: [table.driverId],
			foreignColumns: [drivers.id],
			name: "withdrawals_driver_id_drivers_id_fk"
		}).onDelete("cascade"),
]);
