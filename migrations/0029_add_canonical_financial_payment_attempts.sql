-- Persist canonical provider attempts independently from a batch. This is
-- additive, non-executing schema only; it cannot invoke a provider.
CREATE TABLE "canonical_financial_payment_attempts" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "batch_id" varchar NOT NULL REFERENCES "billing_batches"("id") ON DELETE RESTRICT,
  "attempt_number" integer NOT NULL,
  "prior_attempt_id" varchar,
  "execution_mode" varchar NOT NULL,
  "amount_cents" integer NOT NULL,
  "currency" varchar NOT NULL,
  "idempotency_key" varchar NOT NULL,
  "provider_object_id" varchar,
  "provider_customer_id" varchar,
  "status" varchar NOT NULL DEFAULT 'created',
  "provider_error_code" varchar,
  "provider_error_message" varchar,
  "initiated_by" varchar REFERENCES "users"("id") ON DELETE SET NULL,
  "reason" text NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "processing_at" timestamp,
  "succeeded_at" timestamp,
  "failed_at" timestamp,
  "cancelled_at" timestamp,
  CONSTRAINT "chk_canonical_financial_attempt_valid" CHECK (
    "attempt_number" > 0 AND "amount_cents" > 0 AND "currency" = 'usd'
    AND "execution_mode" IN ('stripe_test', 'stripe_live')
    AND "status" IN ('created', 'processing', 'succeeded', 'failed', 'cancelled')
  )
);
CREATE UNIQUE INDEX "uniq_canonical_financial_attempt_batch_number" ON "canonical_financial_payment_attempts" ("batch_id", "attempt_number");
CREATE UNIQUE INDEX "uniq_canonical_financial_attempt_idempotency" ON "canonical_financial_payment_attempts" ("idempotency_key");
CREATE UNIQUE INDEX "uniq_canonical_financial_attempt_provider_object" ON "canonical_financial_payment_attempts" ("provider_object_id") WHERE "provider_object_id" IS NOT NULL;
CREATE UNIQUE INDEX "uniq_canonical_financial_attempt_live_or_successful" ON "canonical_financial_payment_attempts" ("batch_id") WHERE "status" IN ('created', 'processing', 'succeeded');
CREATE INDEX "idx_canonical_financial_attempt_batch_state" ON "canonical_financial_payment_attempts" ("batch_id", "status");
