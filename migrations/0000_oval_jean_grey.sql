-- Current sql file was generated after introspecting the database
-- If you want to run this migration please uncomment this code before executing migrations
/*
CREATE TYPE "public"."audit_action" AS ENUM('create', 'update', 'delete', 'soft_delete', 'restore');--> statement-breakpoint
CREATE TYPE "public"."audit_entity" AS ENUM('user', 'driver', 'owner', 'location', 'washout', 'payment', 'wallet', 'withdrawal', 'debit_card', 'billing');--> statement-breakpoint
CREATE TYPE "public"."batch_status" AS ENUM('pending', 'processing', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."billing_cadence" AS ENUM('daily');--> statement-breakpoint
CREATE TYPE "public"."debit_card_status" AS ENUM('requested', 'processing', 'issued', 'active', 'blocked', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."distribution_frequency" AS ENUM('daily', 'weekly', 'biweekly', 'monthly');--> statement-breakpoint
CREATE TYPE "public"."fee_status" AS ENUM('pending', 'paid', 'failed', 'past_due', 'waived');--> statement-breakpoint
CREATE TYPE "public"."fee_type" AS ENUM('location_monthly', 'subscription_monthly', 'subscription_annual');--> statement-breakpoint
CREATE TYPE "public"."membership_payment_method" AS ENUM('stripe', 'cash', 'check', 'bank_transfer', 'waived', 'other');--> statement-breakpoint
CREATE TYPE "public"."message_status" AS ENUM('unread', 'read', 'resolved');--> statement-breakpoint
CREATE TYPE "public"."owner_wallet_status" AS ENUM('active', 'suspended', 'pending_verification');--> statement-breakpoint
CREATE TYPE "public"."payment_frequency" AS ENUM('weekly', 'biweekly', 'monthly');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('check', 'venmo', 'zelle', 'ach', 'credit_card');--> statement-breakpoint
CREATE TYPE "public"."subscription_plan" AS ENUM('none', 'monthly', 'annual', 'one_time');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('active', 'inactive', 'trial', 'past_due');--> statement-breakpoint
CREATE TYPE "public"."transaction_direction" AS ENUM('credit', 'debit', 'fee');--> statement-breakpoint
CREATE TYPE "public"."transaction_source_type" AS ENUM('washout', 'withdrawal', 'adjustment');--> statement-breakpoint
CREATE TYPE "public"."transaction_status" AS ENUM('pending', 'posted', 'failed');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('driver', 'owner', 'admin', 'super_admin');--> statement-breakpoint
CREATE TYPE "public"."washout_status" AS ENUM('pending', 'verified', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."withdrawal_status" AS ENUM('requested', 'processing', 'paid', 'failed', 'canceled');--> statement-breakpoint
CREATE TABLE "feature_flags" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"flag_key" varchar NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"description" text,
	"allowed_roles" text[],
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "feature_flags_flag_key_unique" UNIQUE("flag_key")
);
--> statement-breakpoint
CREATE TABLE "feature_flag_overrides" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"flag_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"enabled" boolean NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "debit_card_requests" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"driver_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"shipping_name" varchar NOT NULL,
	"shipping_street" varchar NOT NULL,
	"shipping_city" varchar NOT NULL,
	"shipping_state" varchar NOT NULL,
	"shipping_zip" varchar NOT NULL,
	"card_status" "debit_card_status" DEFAULT 'requested' NOT NULL,
	"card_last4" varchar,
	"card_type" varchar DEFAULT 'physical',
	"expiration_month" varchar,
	"expiration_year" varchar,
	"requested_at" timestamp DEFAULT now(),
	"issued_at" timestamp,
	"activated_at" timestamp,
	"cancelled_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"stripe_issuing_card_id" varchar
);
--> statement-breakpoint
CREATE TABLE "washout_photos" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"activity_id" varchar NOT NULL,
	"storage_key" varchar NOT NULL,
	"uploaded_at" timestamp DEFAULT now() NOT NULL,
	"file_size" integer,
	"content_type" varchar DEFAULT 'image/jpeg',
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"driver_id" varchar NOT NULL,
	"owner_id" varchar NOT NULL,
	"activity_id" varchar NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"processing_fee" numeric(10, 2) NOT NULL,
	"status" varchar DEFAULT 'pending' NOT NULL,
	"paid_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"batch_id" varchar,
	"business_date" varchar,
	"washout_service_fee" numeric(10, 2) DEFAULT '8.00' NOT NULL,
	"stripe_transfer_id" varchar
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"title" varchar NOT NULL,
	"message" text NOT NULL,
	"type" varchar DEFAULT 'info' NOT NULL,
	"is_read" boolean DEFAULT false,
	"data" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"sid" varchar PRIMARY KEY NOT NULL,
	"sess" jsonb NOT NULL,
	"expire" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "washout_activities" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"driver_id" varchar NOT NULL,
	"location_id" varchar NOT NULL,
	"status" "washout_status" DEFAULT 'pending' NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"check_in_time" timestamp NOT NULL,
	"check_out_time" timestamp,
	"photo_urls" text[],
	"notes" text,
	"verified_by" varchar,
	"verified_at" timestamp,
	"latitude" numeric(9, 6),
	"longitude" numeric(10, 6),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "driver_wallets" (
	"driver_id" varchar PRIMARY KEY NOT NULL,
	"available_balance" numeric(10, 2) DEFAULT '0.00' NOT NULL,
	"pending_balance" numeric(10, 2) DEFAULT '0.00' NOT NULL,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"subject" varchar NOT NULL,
	"message" text NOT NULL,
	"status" "message_status" DEFAULT 'unread',
	"user_role" "user_role" NOT NULL,
	"user_phone" varchar,
	"created_at" timestamp DEFAULT now(),
	"resolved_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "password_reset_tokens" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"token" varchar NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "password_reset_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "washout_locations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" varchar NOT NULL,
	"name" varchar NOT NULL,
	"latitude" numeric(9, 6) NOT NULL,
	"longitude" numeric(10, 6) NOT NULL,
	"rate" numeric(10, 2) DEFAULT '5.00' NOT NULL,
	"is_active" boolean DEFAULT true,
	"is_visible" boolean DEFAULT true,
	"description" text,
	"amenities" text[],
	"operating_hours" jsonb,
	"permit_urls" text[],
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"monthly_fee_cents" integer DEFAULT 10000,
	"street" varchar NOT NULL,
	"city" varchar NOT NULL,
	"state" varchar NOT NULL,
	"zip" varchar NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stripe_event_id" varchar NOT NULL,
	"event_type" varchar NOT NULL,
	"processed" boolean DEFAULT false,
	"account_id" varchar,
	"retry_count" integer DEFAULT 0,
	"error_message" text,
	"processed_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "webhook_events_stripe_event_id_unique" UNIQUE("stripe_event_id")
);
--> statement-breakpoint
CREATE TABLE "owner_wallet_transactions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" varchar NOT NULL,
	"type" varchar NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now(),
	"balance_before" numeric(10, 2) NOT NULL,
	"balance_after" numeric(10, 2) NOT NULL,
	"payment_id" varchar,
	"batch_id" varchar,
	"stripe_transfer_id" varchar
);
--> statement-breakpoint
CREATE TABLE "fees_ledger" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" varchar NOT NULL,
	"fee_type" "fee_type" NOT NULL,
	"location_id" varchar,
	"amount_cents" integer NOT NULL,
	"period_start" varchar NOT NULL,
	"period_end" varchar NOT NULL,
	"status" "fee_status" DEFAULT 'pending' NOT NULL,
	"wallet_tx_id" varchar,
	"batch_id" varchar,
	"paid_at" timestamp,
	"failure_reason" text,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"stripe_transfer_id" varchar
);
--> statement-breakpoint
CREATE TABLE "owners" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"company_name" varchar,
	"business_license" varchar,
	"tax_id" varchar,
	"is_approved" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"has_agreed_to_terms" boolean DEFAULT false,
	"terms_agreed_at" timestamp,
	"wallet_balance" numeric(10, 2) DEFAULT '0.00' NOT NULL,
	"wallet_status" "owner_wallet_status" DEFAULT 'pending_verification',
	"low_balance_threshold" numeric(10, 2) DEFAULT '100.00',
	"auto_topup_enabled" boolean DEFAULT false,
	"auto_topup_amount" numeric(10, 2) DEFAULT '500.00',
	"billing_cadence" "billing_cadence" DEFAULT 'daily',
	"billing_cutoff_time" varchar DEFAULT '23:59:00',
	"billing_timezone" varchar DEFAULT 'America/Chicago',
	"subscription_plan" "subscription_plan" DEFAULT 'none',
	"subscription_fee_cents" integer DEFAULT 0,
	"fee_anchor_day" integer DEFAULT 1,
	"last_fee_billing_date" varchar,
	"membership_payment_method" "membership_payment_method",
	"membership_payment_notes" text,
	"membership_activated_by" varchar,
	"membership_activated_at" timestamp,
	"stripe_connect_account_id" varchar,
	"stripe_treasury_account_id" varchar,
	"stripe_customer_id" varchar,
	"stripe_payment_intent_id" varchar,
	"subscription_status" "subscription_status" DEFAULT 'inactive',
	"stripe_payment_method_id" varchar
);
--> statement-breakpoint
CREATE TABLE "service_payment_accounts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar NOT NULL,
	"description" text,
	"stripe_account_id" varchar,
	"stripe_publishable_key" varchar,
	"webhook_endpoint_id" varchar,
	"platform_fee_percentage" numeric(5, 2) DEFAULT '10.00',
	"processing_fee_flat" numeric(10, 2) DEFAULT '0.30',
	"processing_fee_percentage" numeric(5, 2) DEFAULT '2.90',
	"collect_payments_from_owners" boolean DEFAULT true,
	"auto_distribute_to_drivers" boolean DEFAULT true,
	"minimum_payout_amount" numeric(10, 2) DEFAULT '5.00',
	"is_active" boolean DEFAULT true,
	"is_default" boolean DEFAULT false,
	"last_payout_at" timestamp,
	"total_processed" numeric(15, 2) DEFAULT '0.00',
	"total_fees_collected" numeric(15, 2) DEFAULT '0.00',
	"created_by" varchar,
	"updated_by" varchar,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"distribution_frequency" "distribution_frequency" DEFAULT 'daily'
);
--> statement-breakpoint
CREATE TABLE "drivers" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"employer_name" varchar,
	"employer_phone" varchar,
	"license_number" varchar,
	"is_gps_enabled" boolean DEFAULT true,
	"current_latitude" numeric(10, 8),
	"current_longitude" numeric(11, 8),
	"last_location_update" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"truck_number" varchar,
	"has_agreed_to_terms" boolean DEFAULT false,
	"terms_agreed_at" timestamp,
	"payment_method" text DEFAULT 'ach',
	"bank_name" varchar,
	"account_holder_name" varchar,
	"routing_number" varchar,
	"account_number" varchar,
	"venmo_handle" varchar,
	"zelle_email" varchar,
	"employer_street" varchar,
	"employer_city" varchar,
	"employer_state" varchar,
	"employer_zip" varchar,
	"stripe_treasury_account_id" varchar,
	"stripe_issuing_cardholder_id" varchar,
	"stripe_treasury_account_last4" varchar
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar NOT NULL,
	"first_name" varchar NOT NULL,
	"last_name" varchar NOT NULL,
	"profile_image_url" varchar,
	"role" "user_role",
	"phone" varchar,
	"payment_method" text DEFAULT 'ach',
	"payment_frequency" "payment_frequency" DEFAULT 'weekly',
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"username" varchar NOT NULL,
	"password_hash" varchar NOT NULL,
	"street" varchar,
	"city" varchar,
	"state" varchar,
	"zip" varchar,
	"stripe_connect_account_id" varchar,
	"stripe_customer_id" varchar,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "billing_batches" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" varchar NOT NULL,
	"business_date" varchar NOT NULL,
	"cutoff_time" varchar NOT NULL,
	"timezone" varchar NOT NULL,
	"total_amount" numeric(10, 2) DEFAULT '0.00' NOT NULL,
	"total_fees" numeric(10, 2) DEFAULT '0.00' NOT NULL,
	"payment_count" integer DEFAULT 0 NOT NULL,
	"status" "batch_status" DEFAULT 'pending' NOT NULL,
	"processing_started_at" timestamp,
	"completed_at" timestamp,
	"failure_reason" text,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"stripe_batch_transfer_id" varchar
);
--> statement-breakpoint
CREATE TABLE "owner_funding_sources" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" varchar NOT NULL,
	"type" varchar NOT NULL,
	"bank_name" varchar,
	"account_holder_name" varchar,
	"routing_number" varchar,
	"last4" varchar NOT NULL,
	"is_default" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"account_number" varchar,
	"is_active" boolean DEFAULT true,
	"stripe_payment_method_id" varchar
);
--> statement-breakpoint
CREATE TABLE "wallet_transactions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"driver_id" varchar NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"direction" "transaction_direction" NOT NULL,
	"balance_after" numeric(10, 2) NOT NULL,
	"currency" varchar DEFAULT 'USD' NOT NULL,
	"source_type" "transaction_source_type" NOT NULL,
	"source_id" varchar,
	"status" "transaction_status" DEFAULT 'pending' NOT NULL,
	"description" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "withdrawals" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"driver_id" varchar NOT NULL,
	"amount_requested" numeric(10, 2) NOT NULL,
	"fee_amount" numeric(10, 2) DEFAULT '0.00' NOT NULL,
	"amount_net" numeric(10, 2) NOT NULL,
	"status" "withdrawal_status" DEFAULT 'requested' NOT NULL,
	"failure_reason" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now(),
	"processed_at" timestamp,
	"stripe_payout_id" varchar,
	"stripe_payment_method_id" varchar
);
--> statement-breakpoint
ALTER TABLE "feature_flag_overrides" ADD CONSTRAINT "feature_flag_overrides_flag_id_feature_flags_id_fk" FOREIGN KEY ("flag_id") REFERENCES "public"."feature_flags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feature_flag_overrides" ADD CONSTRAINT "feature_flag_overrides_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debit_card_requests" ADD CONSTRAINT "debit_card_requests_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debit_card_requests" ADD CONSTRAINT "debit_card_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "washout_photos" ADD CONSTRAINT "washout_photos_activity_id_washout_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."washout_activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_owner_id_owners_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."owners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_activity_id_washout_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."washout_activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_batch_id_billing_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."billing_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "washout_activities" ADD CONSTRAINT "washout_activities_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "washout_activities" ADD CONSTRAINT "washout_activities_location_id_washout_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."washout_locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "washout_activities" ADD CONSTRAINT "washout_activities_verified_by_users_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_wallets" ADD CONSTRAINT "driver_wallets_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "washout_locations" ADD CONSTRAINT "washout_locations_owner_id_owners_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."owners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owner_wallet_transactions" ADD CONSTRAINT "owner_wallet_transactions_owner_id_owners_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."owners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owner_wallet_transactions" ADD CONSTRAINT "owner_wallet_transactions_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owner_wallet_transactions" ADD CONSTRAINT "owner_wallet_transactions_batch_id_billing_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."billing_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fees_ledger" ADD CONSTRAINT "fees_ledger_owner_id_owners_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."owners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fees_ledger" ADD CONSTRAINT "fees_ledger_location_id_washout_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."washout_locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fees_ledger" ADD CONSTRAINT "fees_ledger_wallet_tx_id_owner_wallet_transactions_id_fk" FOREIGN KEY ("wallet_tx_id") REFERENCES "public"."owner_wallet_transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fees_ledger" ADD CONSTRAINT "fees_ledger_batch_id_billing_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."billing_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owners" ADD CONSTRAINT "owners_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_payment_accounts" ADD CONSTRAINT "service_payment_accounts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_payment_accounts" ADD CONSTRAINT "service_payment_accounts_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_batches" ADD CONSTRAINT "billing_batches_owner_id_owners_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."owners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owner_funding_sources" ADD CONSTRAINT "owner_funding_sources_owner_id_owners_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."owners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "withdrawals" ADD CONSTRAINT "withdrawals_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "unique_flag_user" ON "feature_flag_overrides" USING btree ("flag_id" text_ops,"user_id" text_ops);--> statement-breakpoint
CREATE INDEX "IDX_session_expire" ON "sessions" USING btree ("expire" timestamp_ops);--> statement-breakpoint
CREATE INDEX "idx_owner_wallet_transactions_owner_date" ON "owner_wallet_transactions" USING btree ("owner_id" text_ops,"created_at" text_ops);--> statement-breakpoint
CREATE INDEX "idx_fees_ledger_owner_period" ON "fees_ledger" USING btree ("owner_id" text_ops,"period_start" text_ops);--> statement-breakpoint
CREATE INDEX "idx_fees_ledger_status" ON "fees_ledger" USING btree ("status" enum_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_service_payment_accounts_default" ON "service_payment_accounts" USING btree ("is_default" bool_ops) WHERE (is_default = true);--> statement-breakpoint
CREATE INDEX "idx_billing_batches_status_date" ON "billing_batches" USING btree ("status" text_ops,"business_date" enum_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_billing_batches_owner_date" ON "billing_batches" USING btree ("owner_id" text_ops,"business_date" text_ops);--> statement-breakpoint
CREATE INDEX "idx_wallet_transactions_driver" ON "wallet_transactions" USING btree ("driver_id" text_ops,"created_at" timestamp_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_wallet_transactions_idempotency" ON "wallet_transactions" USING btree ("driver_id" enum_ops,"source_type" text_ops,"source_id" text_ops,"direction" enum_ops);
*/