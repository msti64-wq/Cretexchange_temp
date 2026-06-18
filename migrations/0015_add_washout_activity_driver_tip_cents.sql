ALTER TABLE washout_activities
ADD COLUMN IF NOT EXISTS driver_tip_cents integer NOT NULL DEFAULT 0;
