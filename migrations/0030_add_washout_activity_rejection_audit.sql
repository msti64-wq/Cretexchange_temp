-- Additive rejection audit fields. Existing activities remain valid and no
-- backfill is attempted. A rollback, if separately approved, must explicitly
-- drop these nullable columns after confirming no audit retention is required.
ALTER TABLE washout_activities
  ADD COLUMN IF NOT EXISTS rejection_reason text;
ALTER TABLE washout_activities
  ADD COLUMN IF NOT EXISTS rejected_by varchar REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE washout_activities
  ADD COLUMN IF NOT EXISTS rejected_at timestamp;
