ALTER TABLE system_settings
  ADD COLUMN IF NOT EXISTS financial_history_cutoff_at timestamptz;
UPDATE system_settings
  SET financial_history_cutoff_at = '2026-07-17T05:00:00.000Z'::timestamptz
  WHERE financial_history_cutoff_at IS NULL;
ALTER TABLE system_settings
  ALTER COLUMN financial_history_cutoff_at SET NOT NULL;
