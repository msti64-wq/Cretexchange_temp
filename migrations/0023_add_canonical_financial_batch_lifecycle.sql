-- Phase 3B.3 canonical batch review/approval/cancellation metadata.
-- Additive only: no legacy row is converted and no economic, provider, wallet,
-- payment, or settlement field is changed by this migration.

ALTER TABLE "billing_batches"
  ADD COLUMN IF NOT EXISTS "review_by" varchar REFERENCES "users"("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "review_role" varchar,
  ADD COLUMN IF NOT EXISTS "reviewed_at" timestamp,
  ADD COLUMN IF NOT EXISTS "review_reason" text,
  ADD COLUMN IF NOT EXISTS "approved_by" varchar REFERENCES "users"("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "approved_role" varchar,
  ADD COLUMN IF NOT EXISTS "approved_at" timestamp,
  ADD COLUMN IF NOT EXISTS "approval_reason" text,
  ADD COLUMN IF NOT EXISTS "cancelled_by" varchar REFERENCES "users"("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "cancelled_role" varchar,
  ADD COLUMN IF NOT EXISTS "cancelled_at" timestamp,
  ADD COLUMN IF NOT EXISTS "cancellation_reason" text;

CREATE INDEX IF NOT EXISTS "idx_billing_batches_canonical_state_updated"
  ON "billing_batches" ("batch_model_version", "canonical_state", "updated_at");

-- Canonical lifecycle metadata is required when its state makes the action
-- historical. This deliberately leaves legacy/null-version records untouched.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_billing_batches_canonical_lifecycle_metadata') THEN
    ALTER TABLE "billing_batches" ADD CONSTRAINT "chk_billing_batches_canonical_lifecycle_metadata" CHECK (
      "batch_model_version" IS NULL OR "batch_model_version" <> 'canonical_financial_batch_v1' OR (
        ("canonical_state" NOT IN ('ready_for_review', 'approved') OR (
          "review_by" IS NOT NULL AND "review_role" IS NOT NULL AND "reviewed_at" IS NOT NULL AND "review_reason" IS NOT NULL
        ))
        AND ("canonical_state" <> 'approved' OR (
          "approved_by" IS NOT NULL AND "approved_role" IS NOT NULL AND "approved_at" IS NOT NULL AND "approval_reason" IS NOT NULL
        ))
        AND ("canonical_state" <> 'cancelled' OR (
          "cancelled_by" IS NOT NULL AND "cancelled_role" IS NOT NULL AND "cancelled_at" IS NOT NULL AND "cancellation_reason" IS NOT NULL
        ))
      )
    );
  END IF;
END
$$;
