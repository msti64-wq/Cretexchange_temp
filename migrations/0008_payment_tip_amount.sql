ALTER TABLE payments
ADD COLUMN IF NOT EXISTS tip_amount_cents integer;

