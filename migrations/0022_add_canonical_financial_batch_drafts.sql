-- Phase 3B.2 canonical draft-batch foundation.
--
-- This migration is additive. It does not classify, backfill, merge, delete,
-- execute, or otherwise reinterpret legacy financial records. It must be
-- validated in disposable/staging PostgreSQL before any deployment proposal.

ALTER TABLE "billing_batches"
  ADD COLUMN IF NOT EXISTS "batch_model_version" varchar,
  ADD COLUMN IF NOT EXISTS "canonical_reference" varchar,
  ADD COLUMN IF NOT EXISTS "canonical_state" varchar,
  ADD COLUMN IF NOT EXISTS "period_start" timestamp,
  ADD COLUMN IF NOT EXISTS "period_end" timestamp,
  ADD COLUMN IF NOT EXISTS "cadence" varchar,
  ADD COLUMN IF NOT EXISTS "revision" integer,
  ADD COLUMN IF NOT EXISTS "idempotency_key" varchar,
  ADD COLUMN IF NOT EXISTS "frozen_driver_incentive_cents" integer,
  ADD COLUMN IF NOT EXISTS "frozen_platform_fee_cents" integer,
  ADD COLUMN IF NOT EXISTS "frozen_facility_charge_cents" integer,
  ADD COLUMN IF NOT EXISTS "exception_count" integer,
  ADD COLUMN IF NOT EXISTS "canonical_created_by" varchar REFERENCES "users"("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "canonical_creation_reason" text;

-- The existing legacy owner/date unique index is intentionally unchanged. If a
-- legacy record occupies the same owner/date, canonical construction fails
-- closed for review rather than rewriting, merging, or reclassifying it.

CREATE UNIQUE INDEX IF NOT EXISTS "uniq_billing_batches_canonical_reference"
  ON "billing_batches" ("canonical_reference")
  WHERE "canonical_reference" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "uniq_billing_batches_canonical_idempotency"
  ON "billing_batches" ("idempotency_key")
  WHERE "idempotency_key" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "uniq_billing_batches_canonical_facility_period_revision"
  ON "billing_batches" ("owner_id", "batch_model_version", "period_start", "revision")
  WHERE "batch_model_version" = 'canonical_financial_batch_v1';

CREATE INDEX IF NOT EXISTS "idx_billing_batches_canonical_state_period"
  ON "billing_batches" ("batch_model_version", "canonical_state", "period_start");

CREATE TABLE IF NOT EXISTS "financial_batch_memberships" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "batch_id" varchar NOT NULL REFERENCES "billing_batches"("id") ON DELETE RESTRICT,
  "payment_id" varchar NOT NULL REFERENCES "payments"("id") ON DELETE RESTRICT,
  "state" varchar NOT NULL,
  "joined_at" timestamp NOT NULL DEFAULT now(),
  "joined_by" varchar REFERENCES "users"("id") ON DELETE SET NULL,
  "join_reason" text NOT NULL,
  "released_at" timestamp,
  "released_by" varchar REFERENCES "users"("id") ON DELETE SET NULL,
  "release_reason" text,
  "frozen_driver_incentive_cents" integer NOT NULL,
  "frozen_platform_fee_cents" integer NOT NULL,
  "frozen_facility_charge_cents" integer NOT NULL,
  "batch_revision" integer NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "uniq_financial_batch_memberships_active_payment"
  ON "financial_batch_memberships" ("payment_id")
  WHERE "state" = 'active';

CREATE INDEX IF NOT EXISTS "idx_financial_batch_memberships_batch_state"
  ON "financial_batch_memberships" ("batch_id", "state");

CREATE TABLE IF NOT EXISTS "financial_batch_audit_events" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "batch_id" varchar NOT NULL REFERENCES "billing_batches"("id") ON DELETE RESTRICT,
  "event_type" varchar NOT NULL,
  "actor_id" varchar REFERENCES "users"("id") ON DELETE SET NULL,
  "actor_role" varchar NOT NULL,
  "reason" text NOT NULL,
  "prior_state" varchar,
  "new_state" varchar NOT NULL,
  "revision" integer NOT NULL,
  "obligation_count" integer NOT NULL,
  "frozen_driver_incentive_cents" integer NOT NULL,
  "frozen_platform_fee_cents" integer NOT NULL,
  "frozen_facility_charge_cents" integer NOT NULL,
  "safe_metadata" jsonb,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_financial_batch_audit_events_batch_created"
  ON "financial_batch_audit_events" ("batch_id", "created_at");

CREATE TABLE IF NOT EXISTS "financial_batch_exceptions" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "batch_id" varchar REFERENCES "billing_batches"("id") ON DELETE RESTRICT,
  "payment_id" varchar REFERENCES "payments"("id") ON DELETE RESTRICT,
  "category" varchar NOT NULL,
  "safe_reference" varchar NOT NULL,
  "status" varchar NOT NULL DEFAULT 'open',
  "safe_metadata" jsonb,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_financial_batch_exceptions_status_created"
  ON "financial_batch_exceptions" ("status", "created_at");

CREATE INDEX IF NOT EXISTS "idx_financial_batch_exceptions_payment_category"
  ON "financial_batch_exceptions" ("payment_id", "category");

-- Canonical totals and membership snapshots are immutable integer-cent facts,
-- not mutable-rate calculations. These checks leave legacy/null model rows
-- untouched while rejecting inconsistent canonical draft arithmetic.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_billing_batches_canonical_frozen_totals') THEN
    ALTER TABLE "billing_batches" ADD CONSTRAINT "chk_billing_batches_canonical_frozen_totals" CHECK (
      "batch_model_version" IS NULL OR "batch_model_version" <> 'canonical_financial_batch_v1' OR (
        "canonical_reference" IS NOT NULL AND "canonical_state" IN ('draft', 'ready_for_review', 'approved', 'cancelled')
        AND "period_start" IS NOT NULL AND "period_end" IS NOT NULL AND "period_end" > "period_start"
        AND "cadence" = 'weekly' AND "revision" IS NOT NULL AND "revision" > 0
        AND "frozen_driver_incentive_cents" IS NOT NULL AND "frozen_driver_incentive_cents" >= 0
        AND "frozen_platform_fee_cents" IS NOT NULL AND "frozen_platform_fee_cents" >= 0
        AND "frozen_facility_charge_cents" = "frozen_driver_incentive_cents" + "frozen_platform_fee_cents"
        AND "payment_count" >= 0 AND "exception_count" >= 0
      )
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_financial_batch_memberships_frozen_totals') THEN
    ALTER TABLE "financial_batch_memberships" ADD CONSTRAINT "chk_financial_batch_memberships_frozen_totals" CHECK (
      "state" IN ('active', 'released')
      AND "frozen_driver_incentive_cents" >= 0
      AND "frozen_platform_fee_cents" >= 0
      AND "frozen_facility_charge_cents" = "frozen_driver_incentive_cents" + "frozen_platform_fee_cents"
      AND "batch_revision" > 0
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_financial_batch_audit_events_frozen_totals') THEN
    ALTER TABLE "financial_batch_audit_events" ADD CONSTRAINT "chk_financial_batch_audit_events_frozen_totals" CHECK (
      "obligation_count" >= 0
      AND "frozen_driver_incentive_cents" >= 0
      AND "frozen_platform_fee_cents" >= 0
      AND "frozen_facility_charge_cents" = "frozen_driver_incentive_cents" + "frozen_platform_fee_cents"
      AND "revision" > 0
    );
  END IF;
END
$$;
