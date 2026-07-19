-- Administrative reward-period controls are separate from the configured financial-history cutoff.
CREATE TABLE IF NOT EXISTS rewards_periods (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  month integer NOT NULL CHECK (month BETWEEN 1 AND 12),
  year integer NOT NULL CHECK (year >= 2026),
  status varchar NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'active', 'paused', 'cancelled', 'completed')),
  created_at timestamp NOT NULL DEFAULT now(),
  created_by varchar REFERENCES users(id),
  activated_at timestamp,
  activated_by varchar REFERENCES users(id),
  paused_at timestamp,
  paused_by varchar REFERENCES users(id),
  pause_reason text,
  cancelled_at timestamp,
  cancelled_by varchar REFERENCES users(id),
  cancellation_reason text,
  completed_at timestamp,
  completed_by varchar REFERENCES users(id),
  announcement_sent_at timestamp,
  announcement_sent_by varchar REFERENCES users(id),
  UNIQUE(month, year)
);

ALTER TABLE driver_lottery_entries
  ADD COLUMN IF NOT EXISTS rewards_period_id varchar REFERENCES rewards_periods(id);
ALTER TABLE driver_lottery_entries
  ADD COLUMN IF NOT EXISTS eligibility_status varchar NOT NULL DEFAULT 'eligible'
    CHECK (eligibility_status IN ('eligible', 'ineligible', 'cancelled'));
ALTER TABLE driver_lottery_entries
  ADD COLUMN IF NOT EXISTS ineligibility_reason text;
ALTER TABLE driver_lottery_entries
  ADD COLUMN IF NOT EXISTS eligibility_changed_at timestamp;
ALTER TABLE driver_lottery_entries
  ADD COLUMN IF NOT EXISTS eligibility_changed_by varchar REFERENCES users(id);

CREATE INDEX IF NOT EXISTS idx_driver_lottery_entries_period_eligibility
  ON driver_lottery_entries(rewards_period_id, eligibility_status);
