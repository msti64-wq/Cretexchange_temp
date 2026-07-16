-- Phase 2 financial-obligation safety gate.
-- Do not merge, delete, or otherwise rewrite legacy rows here. A deployment must
-- stop for review if more than one payment row references the same activity.
ALTER TABLE "payments"
  ADD COLUMN IF NOT EXISTS "obligation_created_by" varchar REFERENCES "users"("id") ON DELETE SET NULL;

ALTER TABLE "payments"
  ADD COLUMN IF NOT EXISTS "obligation_creation_reason" text;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM payments
    GROUP BY activity_id
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Cannot create uniq_payments_activity_obligation: duplicate payment rows exist. Run the financial-obligation reconciliation preflight before deployment.';
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS "uniq_payments_activity_obligation"
  ON "payments" ("activity_id");
