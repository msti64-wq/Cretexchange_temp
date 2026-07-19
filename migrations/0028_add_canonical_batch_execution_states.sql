-- Canonical batch execution lifecycle. Additive and non-executing: deployment
-- of this migration alone cannot call Stripe, charge a facility, or change a
-- batch. It only permits the canonical state machine to record processing,
-- paid, and failed outcomes after separately authorized operations.

ALTER TABLE "billing_batches"
  DROP CONSTRAINT IF EXISTS "chk_billing_batches_canonical_frozen_totals";

ALTER TABLE "billing_batches" ADD CONSTRAINT "chk_billing_batches_canonical_frozen_totals" CHECK (
  "batch_model_version" IS NULL OR "batch_model_version" <> 'canonical_financial_batch_v1' OR (
    "canonical_reference" IS NOT NULL AND "canonical_state" IN ('draft', 'ready_for_review', 'approved', 'processing', 'paid', 'failed', 'cancelled')
    AND "period_start" IS NOT NULL AND "period_end" IS NOT NULL AND "period_end" > "period_start"
    AND "cadence" = 'weekly' AND "revision" IS NOT NULL AND "revision" > 0
    AND "frozen_driver_incentive_cents" IS NOT NULL AND "frozen_driver_incentive_cents" >= 0
    AND "frozen_platform_fee_cents" IS NOT NULL AND "frozen_platform_fee_cents" >= 0
    AND "frozen_facility_charge_cents" = "frozen_driver_incentive_cents" + "frozen_platform_fee_cents"
    AND "payment_count" >= 0 AND "exception_count" >= 0
  )
);
