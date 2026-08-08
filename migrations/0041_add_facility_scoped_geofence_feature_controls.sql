-- CTX-ARCH-016 / PD-061: Facility-scoped geofence pilot controls.
-- Migration class: additive schema only; no override row, activation, or backfill.
-- Authorization boundary: preparation and isolated validation do not authorize
-- execution against Production.
-- Recovery posture: leave the additive audit evidence in place and ensure the
-- three global controls and every Facility override remain disabled. Application
-- rollback ignores these tables, so destructive database rollback is unnecessary.

CREATE TABLE IF NOT EXISTS facility_feature_flag_overrides (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id varchar NOT NULL REFERENCES washout_locations(id) ON DELETE RESTRICT,
  flag_key varchar NOT NULL REFERENCES feature_flags(flag_key) ON DELETE RESTRICT,
  enabled boolean NOT NULL DEFAULT false,
  reason text NOT NULL,
  updated_by varchar NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT facility_feature_flag_overrides_flag_allowed CHECK (
    flag_key IN (
      'geofence_submission_enforcement',
      'geofence_notifications',
      'geofence_legacy_transition'
    )
  ),
  CONSTRAINT facility_feature_flag_overrides_reason_valid CHECK (
    char_length(btrim(reason)) BETWEEN 3 AND 500
  ),
  CONSTRAINT facility_feature_flag_overrides_location_flag_unique UNIQUE (location_id, flag_key)
);

CREATE INDEX IF NOT EXISTS facility_feature_flag_overrides_flag_enabled_idx
  ON facility_feature_flag_overrides(flag_key, enabled, location_id);

CREATE TABLE IF NOT EXISTS facility_feature_flag_override_events (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id varchar NOT NULL REFERENCES washout_locations(id) ON DELETE RESTRICT,
  flag_key varchar NOT NULL REFERENCES feature_flags(flag_key) ON DELETE RESTRICT,
  actor_user_id varchar NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  actor_role varchar NOT NULL,
  reason text NOT NULL,
  prior_enabled boolean NOT NULL,
  new_enabled boolean NOT NULL,
  request_id varchar(160) NOT NULL,
  idempotency_key varchar(240) NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT facility_feature_flag_override_events_flag_allowed CHECK (
    flag_key IN (
      'geofence_submission_enforcement',
      'geofence_notifications',
      'geofence_legacy_transition'
    )
  ),
  CONSTRAINT facility_feature_flag_override_events_actor_role_valid CHECK (
    actor_role IN ('admin', 'super_admin')
  ),
  CONSTRAINT facility_feature_flag_override_events_reason_valid CHECK (
    char_length(btrim(reason)) BETWEEN 3 AND 500
  )
);

CREATE INDEX IF NOT EXISTS facility_feature_flag_override_events_location_created_idx
  ON facility_feature_flag_override_events(location_id, created_at DESC);
CREATE INDEX IF NOT EXISTS facility_feature_flag_override_events_flag_created_idx
  ON facility_feature_flag_override_events(flag_key, created_at DESC);

CREATE OR REPLACE FUNCTION reject_facility_feature_flag_audit_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'facility_feature_flag_override_events is append-only';
END;
$$;

DROP TRIGGER IF EXISTS facility_feature_flag_override_events_append_only
  ON facility_feature_flag_override_events;
CREATE TRIGGER facility_feature_flag_override_events_append_only
  BEFORE UPDATE OR DELETE ON facility_feature_flag_override_events
  FOR EACH ROW EXECUTE FUNCTION reject_facility_feature_flag_audit_mutation();

-- Intentionally no INSERT or UPDATE statement follows. Deploying this migration
-- cannot activate enforcement, notifications, legacy transition, or any Facility.
