ALTER TABLE washout_locations
ADD COLUMN IF NOT EXISTS driver_incentive_tip numeric(10,2) NOT NULL DEFAULT 0.00;

