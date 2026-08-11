-- Phase 5 Sprint 3 Work Package 0: revocable session and authentication-security foundation.
-- Additive and default-off. No user is enrolled in 2FA, no session is created,
-- and no existing JWT or password-reset row is inferred or backfilled.

CREATE TABLE IF NOT EXISTS auth_sessions (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash varchar(64) NOT NULL UNIQUE,
  csrf_token_hash varchar(64) NOT NULL,
  role_snapshot varchar(32) NOT NULL,
  device_label varchar(80) NOT NULL,
  network_key_hash varchar(64),
  network_metadata_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  idle_expires_at timestamptz NOT NULL,
  absolute_expires_at timestamptz NOT NULL,
  mfa_verified_at timestamptz,
  revoked_at timestamptz,
  revocation_reason varchar(80),
  rotated_from_session_id varchar REFERENCES auth_sessions(id) ON DELETE SET NULL,
  CONSTRAINT auth_sessions_role_snapshot_valid CHECK (role_snapshot IN ('driver', 'owner', 'admin', 'super_admin')),
  CONSTRAINT auth_sessions_token_hash_valid CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT auth_sessions_csrf_hash_valid CHECK (csrf_token_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT auth_sessions_expiry_order_valid CHECK (idle_expires_at <= absolute_expires_at)
);

CREATE INDEX IF NOT EXISTS auth_sessions_user_active_idx
  ON auth_sessions(user_id, revoked_at, absolute_expires_at);
CREATE INDEX IF NOT EXISTS auth_sessions_idle_expiry_idx
  ON auth_sessions(idle_expires_at);
CREATE INDEX IF NOT EXISTS auth_sessions_network_expiry_idx
  ON auth_sessions(network_metadata_expires_at);

CREATE TABLE IF NOT EXISTS auth_password_reset_tokens (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash varchar(64) NOT NULL UNIQUE,
  request_reference varchar(160) NOT NULL,
  network_key_hash varchar(64),
  network_metadata_expires_at timestamptz,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT auth_password_reset_tokens_hash_valid CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT auth_password_reset_tokens_request_reference_valid CHECK (char_length(btrim(request_reference)) BETWEEN 8 AND 160)
);

CREATE INDEX IF NOT EXISTS auth_password_reset_tokens_user_active_idx
  ON auth_password_reset_tokens(user_id, consumed_at, revoked_at, expires_at);
CREATE INDEX IF NOT EXISTS auth_password_reset_tokens_expiry_idx
  ON auth_password_reset_tokens(expires_at);
CREATE INDEX IF NOT EXISTS auth_password_reset_tokens_network_expiry_idx
  ON auth_password_reset_tokens(network_metadata_expires_at);

CREATE TABLE IF NOT EXISTS auth_security_events (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type varchar(96) NOT NULL,
  outcome varchar(24) NOT NULL,
  reason_code varchar(96),
  -- Pseudonymous identifiers intentionally remain after account/session
  -- lifecycle changes; foreign-key actions cannot rewrite append-only events.
  actor_user_id varchar,
  subject_user_id varchar,
  session_id varchar,
  request_reference varchar(160) NOT NULL,
  retention_class varchar(24) NOT NULL,
  retain_until timestamptz NOT NULL,
  network_key_hash varchar(64),
  network_metadata_expires_at timestamptz,
  event_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT auth_security_events_outcome_valid CHECK (outcome IN ('success', 'failure', 'denied', 'information')),
  CONSTRAINT auth_security_events_retention_class_valid CHECK (retention_class IN ('routine', 'privileged')),
  CONSTRAINT auth_security_events_request_reference_valid CHECK (char_length(btrim(request_reference)) BETWEEN 8 AND 160),
  CONSTRAINT auth_security_events_metadata_object CHECK (jsonb_typeof(event_metadata) = 'object')
);

CREATE INDEX IF NOT EXISTS auth_security_events_subject_created_idx
  ON auth_security_events(subject_user_id, created_at);
CREATE INDEX IF NOT EXISTS auth_security_events_type_created_idx
  ON auth_security_events(event_type, created_at);
CREATE INDEX IF NOT EXISTS auth_security_events_retention_idx
  ON auth_security_events(retain_until);
CREATE INDEX IF NOT EXISTS auth_security_events_network_expiry_idx
  ON auth_security_events(network_metadata_expires_at);

CREATE TABLE IF NOT EXISTS auth_rate_limit_buckets (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  action varchar(48) NOT NULL,
  key_hash varchar(64) NOT NULL,
  window_started_at timestamptz NOT NULL,
  attempt_count integer NOT NULL DEFAULT 0,
  blocked_until timestamptz,
  expires_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT auth_rate_limit_buckets_action_key_unique UNIQUE (action, key_hash),
  CONSTRAINT auth_rate_limit_buckets_attempt_count_valid CHECK (attempt_count >= 0),
  CONSTRAINT auth_rate_limit_buckets_key_hash_valid CHECK (key_hash ~ '^[0-9a-f]{64}$')
);

CREATE INDEX IF NOT EXISTS auth_rate_limit_buckets_blocked_idx
  ON auth_rate_limit_buckets(blocked_until);
CREATE INDEX IF NOT EXISTS auth_rate_limit_buckets_expiry_idx
  ON auth_rate_limit_buckets(expires_at);

CREATE OR REPLACE FUNCTION reject_auth_security_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_setting('cretexchange.auth_retention_maintenance', true) = 'authorized' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'auth_security_events is append-only';
END;
$$;

DROP TRIGGER IF EXISTS auth_security_events_append_only ON auth_security_events;
CREATE TRIGGER auth_security_events_append_only
BEFORE UPDATE OR DELETE ON auth_security_events
FOR EACH ROW EXECUTE FUNCTION reject_auth_security_event_mutation();

CREATE OR REPLACE FUNCTION minimize_expired_auth_event_network_metadata(p_cutoff timestamptz DEFAULT now())
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  affected bigint;
BEGIN
  PERFORM set_config('cretexchange.auth_retention_maintenance', 'authorized', true);
  UPDATE auth_sessions
     SET network_key_hash = NULL,
         network_metadata_expires_at = NULL
   WHERE network_metadata_expires_at IS NOT NULL
     AND network_metadata_expires_at <= p_cutoff;
  UPDATE auth_password_reset_tokens
     SET network_key_hash = NULL,
         network_metadata_expires_at = NULL
   WHERE network_metadata_expires_at IS NOT NULL
     AND network_metadata_expires_at <= p_cutoff;
  UPDATE auth_security_events
     SET network_key_hash = NULL,
         network_metadata_expires_at = NULL
   WHERE network_metadata_expires_at IS NOT NULL
     AND network_metadata_expires_at <= p_cutoff;
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

CREATE OR REPLACE FUNCTION purge_expired_auth_security_events(p_cutoff timestamptz DEFAULT now())
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  affected bigint;
BEGIN
  PERFORM set_config('cretexchange.auth_retention_maintenance', 'authorized', true);
  DELETE FROM auth_security_events WHERE retain_until <= p_cutoff;
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

CREATE OR REPLACE FUNCTION purge_expired_auth_rate_limit_buckets(p_cutoff timestamptz DEFAULT now())
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  affected bigint;
BEGIN
  DELETE FROM auth_rate_limit_buckets WHERE expires_at <= p_cutoff;
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

REVOKE ALL ON FUNCTION minimize_expired_auth_event_network_metadata(timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION purge_expired_auth_security_events(timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION purge_expired_auth_rate_limit_buckets(timestamptz) FROM PUBLIC;
