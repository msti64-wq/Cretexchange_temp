-- Synthetic, isolated PostgreSQL bootstrap for canonical financial-index
-- validation. Run only against a new disposable database, never production or
-- a shared database. This script contains no provider, settlement, wallet, or
-- execution behavior and uses synthetic records only.

-- Refuse any database other than a dedicated empty validation database. This
-- is a guardrail, not a substitute for separately verifying the connection.
DO $$
BEGIN
  IF current_database() !~ '^financial_validation_[a-z0-9_]+$' THEN
    RAISE EXCEPTION 'This bootstrap may run only in a dedicated financial_validation_* database.';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('payments', 'washout_activities', 'users')
  ) THEN
    RAISE EXCEPTION 'Synthetic bootstrap requires an empty validation database.';
  END IF;
END
$$;

CREATE TABLE users (id varchar PRIMARY KEY, role varchar NOT NULL);
CREATE TABLE drivers (id varchar PRIMARY KEY, user_id varchar REFERENCES users(id));
CREATE TABLE owners (id varchar PRIMARY KEY, user_id varchar REFERENCES users(id));
CREATE TABLE washout_locations (id varchar PRIMARY KEY, owner_id varchar NOT NULL REFERENCES owners(id));
CREATE TABLE washout_activities (
  id varchar PRIMARY KEY,
  driver_id varchar NOT NULL REFERENCES drivers(id),
  location_id varchar NOT NULL REFERENCES washout_locations(id),
  status varchar NOT NULL,
  amount numeric(12,2),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE payments (
  id varchar PRIMARY KEY,
  driver_id varchar NOT NULL REFERENCES drivers(id),
  owner_id varchar NOT NULL REFERENCES owners(id),
  activity_id varchar REFERENCES washout_activities(id),
  amount numeric(12,2) NOT NULL,
  processing_fee numeric(12,2) NOT NULL,
  washout_service_fee numeric(12,2) NOT NULL,
  status varchar NOT NULL,
  batch_id varchar,
  paid_at timestamptz,
  stripe_payment_intent_id varchar,
  stripe_transfer_id varchar,
  stripe_charge_id varchar,
  obligation_created_by varchar REFERENCES users(id),
  obligation_creation_reason text,
  obligation_kind varchar,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uniq_payments_activity_obligation ON payments(activity_id);

CREATE TABLE billing_batches (id varchar PRIMARY KEY, batch_model_version varchar, canonical_state varchar);
CREATE TABLE financial_batch_memberships (id varchar PRIMARY KEY, batch_id varchar REFERENCES billing_batches(id), payment_id varchar REFERENCES payments(id), state varchar NOT NULL);
CREATE TABLE financial_batch_audit_events (id varchar PRIMARY KEY, batch_id varchar REFERENCES billing_batches(id), event_type varchar NOT NULL);
CREATE TABLE financial_batch_exceptions (id varchar PRIMARY KEY, batch_id varchar REFERENCES billing_batches(id), payment_id varchar REFERENCES payments(id), category varchar NOT NULL);

INSERT INTO users (id, role) VALUES ('admin_synth', 'admin'), ('driver_user', 'driver'), ('owner_user', 'owner');
INSERT INTO drivers (id, user_id) VALUES ('driver_synth', 'driver_user');
INSERT INTO owners (id, user_id) VALUES ('owner_synth', 'owner_user');
INSERT INTO washout_locations (id, owner_id) VALUES ('location_synth', 'owner_synth');

-- A: ordinary missing; B: legacy linked; C: canonical existing; D: ineligible.
INSERT INTO washout_activities (id, driver_id, location_id, status, amount) VALUES
  ('activity_a', 'driver_synth', 'location_synth', 'verified', 10.00),
  ('activity_b', 'driver_synth', 'location_synth', 'verified', 11.00),
  ('activity_c', 'driver_synth', 'location_synth', 'verified', 12.00),
  ('activity_d', 'driver_synth', 'location_synth', 'pending', 13.00);
INSERT INTO payments (id, driver_id, owner_id, activity_id, amount, processing_fee, washout_service_fee, status, obligation_kind, obligation_created_by, obligation_creation_reason) VALUES
  ('payment_b_legacy', 'driver_synth', 'owner_synth', 'activity_b', 11.00, 5.00, 11.00, 'pending', NULL, NULL, NULL),
  ('payment_c_canonical', 'driver_synth', 'owner_synth', 'activity_c', 12.00, 5.00, 12.00, 'pending', 'canonical_verified_activity_v1', 'admin_synth', 'synthetic canonical fixture');
