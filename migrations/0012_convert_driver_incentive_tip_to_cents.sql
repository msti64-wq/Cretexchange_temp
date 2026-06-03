DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'washout_locations'
      AND column_name = 'driver_incentive_tip'
  ) THEN
    ALTER TABLE washout_locations
      ADD COLUMN driver_incentive_tip integer DEFAULT 0;
  ELSE
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'washout_locations'
        AND column_name = 'driver_incentive_tip'
        AND data_type <> 'integer'
    ) THEN
      ALTER TABLE washout_locations
        ALTER COLUMN driver_incentive_tip TYPE integer
        USING COALESCE(ROUND(driver_incentive_tip * 100), 0)::integer;
    END IF;

    ALTER TABLE washout_locations
      ALTER COLUMN driver_incentive_tip SET DEFAULT 0;
    ALTER TABLE washout_locations
      ALTER COLUMN driver_incentive_tip SET NOT NULL;
  END IF;
END $$;
