CREATE TABLE IF NOT EXISTS unit_economics_monthly_assumptions (
  month date PRIMARY KEY,
  fee_per_validated_load_cents integer NOT NULL DEFAULT 500,
  payment_processing_percent numeric(7,4) NOT NULL DEFAULT 2.9,
  payment_processing_fixed_cents integer NOT NULL DEFAULT 30,
  evidence_storage_provider varchar(80) NOT NULL DEFAULT 'Unconfirmed',
  evidence_storage_notes text NOT NULL DEFAULT '',
  updated_by_user_id varchar REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT unit_economics_assumptions_month_start CHECK (month = date_trunc('month', month)::date),
  CONSTRAINT unit_economics_assumptions_fee_nonnegative CHECK (fee_per_validated_load_cents >= 0),
  CONSTRAINT unit_economics_assumptions_processing_valid CHECK (payment_processing_percent BETWEEN 0 AND 100 AND payment_processing_fixed_cents >= 0)
);

CREATE TABLE IF NOT EXISTS unit_economics_monthly_costs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  month date NOT NULL,
  provider varchar(80) NOT NULL,
  category varchar(32) NOT NULL,
  amount_cents integer NOT NULL,
  notes text NOT NULL DEFAULT '',
  source_url text NOT NULL DEFAULT '',
  created_by_user_id varchar REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT unit_economics_costs_month_start CHECK (month = date_trunc('month', month)::date),
  CONSTRAINT unit_economics_costs_amount_nonnegative CHECK (amount_cents >= 0),
  CONSTRAINT unit_economics_costs_category_valid CHECK (category IN ('hosting','database','email','domain_dns','evidence_storage','payments','other'))
);

CREATE INDEX IF NOT EXISTS unit_economics_costs_month_idx ON unit_economics_monthly_costs(month);
CREATE INDEX IF NOT EXISTS unit_economics_costs_provider_month_idx ON unit_economics_monthly_costs(provider, month);
CREATE INDEX IF NOT EXISTS unit_economics_assumptions_updated_idx ON unit_economics_monthly_assumptions(updated_at DESC);
CREATE INDEX IF NOT EXISTS unit_economics_costs_category_month_idx ON unit_economics_monthly_costs(category, month);

-- Intentionally no backfill. Migration 0043 creates only an empty foundation;
-- a superadmin must enter and validate provider invoices and assumptions.
