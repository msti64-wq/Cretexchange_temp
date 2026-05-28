ALTER TABLE payments
ADD COLUMN IF NOT EXISTS payout_status varchar DEFAULT 'not_started' NOT NULL;

ALTER TABLE payments
ADD COLUMN IF NOT EXISTS defer_reason text;

ALTER TABLE payments
ADD COLUMN IF NOT EXISTS deferred_at timestamp;

