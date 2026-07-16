-- Phase 3B.1 discovery discriminator. This is additive and deliberately does
-- not classify, backfill, merge, or otherwise alter historical payment rows.
ALTER TABLE "payments"
  ADD COLUMN IF NOT EXISTS "obligation_kind" varchar;

CREATE INDEX IF NOT EXISTS "idx_payments_obligation_kind_status_created"
  ON "payments" ("obligation_kind", "status", "created_at");
