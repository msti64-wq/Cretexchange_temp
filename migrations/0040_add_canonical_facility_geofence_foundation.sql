-- CTX-ARCH-016 / PD-061: additive canonical Facility geofence foundation.
-- Migration class: additive schema and disabled feature-control seed records.
-- Dependency: the existing users, owners, washout_locations, washout_activities,
-- and feature_flags tables through migration 0039.
-- Transaction posture: execute as one controlled transaction after an approved
-- recovery checkpoint. No Production execution is authorized by Work Package 1.
-- Recovery posture: application rollback disables all five geofence flags and
-- retains these additive records. Destructive database reversal is not required.

CREATE TABLE IF NOT EXISTS facility_geofence_boundaries (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id varchar NOT NULL REFERENCES washout_locations(id) ON DELETE RESTRICT,
  zone_key varchar NOT NULL DEFAULT 'primary',
  version integer NOT NULL,
  mode varchar NOT NULL,
  center_latitude numeric(10,8),
  center_longitude numeric(11,8),
  radius_meters numeric(12,3),
  geometry_geojson jsonb,
  exception_distance_meters numeric(12,3) NOT NULL,
  geometry_checksum varchar(64) NOT NULL,
  status varchar NOT NULL DEFAULT 'draft',
  effective_from timestamptz,
  effective_to timestamptz,
  previous_version_id varchar REFERENCES facility_geofence_boundaries(id) ON DELETE RESTRICT,
  created_by varchar REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  activated_by varchar REFERENCES users(id) ON DELETE SET NULL,
  activated_at timestamptz,
  CONSTRAINT facility_geofence_boundaries_zone_key_valid
    CHECK (zone_key ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  CONSTRAINT facility_geofence_boundaries_version_positive CHECK (version > 0),
  CONSTRAINT facility_geofence_boundaries_mode_valid CHECK (mode IN ('radius', 'polygon')),
  CONSTRAINT facility_geofence_boundaries_status_valid
    CHECK (status IN ('draft', 'active', 'superseded', 'invalidated')),
  CONSTRAINT facility_geofence_boundaries_exception_positive CHECK (exception_distance_meters > 0),
  CONSTRAINT facility_geofence_boundaries_checksum_valid
    CHECK (length(geometry_checksum) = 64 AND geometry_checksum ~ '^[0-9a-f]{64}$'),
  CONSTRAINT facility_geofence_boundaries_mode_fields_valid CHECK (
    (mode = 'radius'
      AND center_latitude IS NOT NULL
      AND center_longitude IS NOT NULL
      AND radius_meters > 0
      AND geometry_geojson IS NULL)
    OR
    (mode = 'polygon'
      AND center_latitude IS NULL
      AND center_longitude IS NULL
      AND radius_meters IS NULL
      AND geometry_geojson IS NOT NULL
      AND jsonb_typeof(geometry_geojson) = 'object')
  ),
  CONSTRAINT facility_geofence_boundaries_center_range_valid CHECK (
    (center_latitude IS NULL AND center_longitude IS NULL)
    OR (center_latitude BETWEEN -90 AND 90 AND center_longitude BETWEEN -180 AND 180)
  ),
  CONSTRAINT facility_geofence_boundaries_effective_window_valid CHECK (
    effective_to IS NULL OR (effective_from IS NOT NULL AND effective_to > effective_from)
  ),
  CONSTRAINT facility_geofence_boundaries_activation_fields_valid CHECK (
    (status = 'draft' AND activated_at IS NULL AND activated_by IS NULL AND effective_from IS NULL)
    OR
    (status IN ('active', 'superseded', 'invalidated') AND activated_at IS NOT NULL AND activated_by IS NOT NULL AND effective_from IS NOT NULL)
  ),
  CONSTRAINT facility_geofence_boundaries_active_open_ended CHECK (status <> 'active' OR effective_to IS NULL),
  CONSTRAINT facility_geofence_boundaries_closed_lifecycle_has_end CHECK (
    status NOT IN ('superseded', 'invalidated') OR effective_to IS NOT NULL
  ),
  CONSTRAINT facility_geofence_boundaries_location_zone_version_unique UNIQUE (location_id, zone_key, version),
  CONSTRAINT facility_geofence_boundaries_id_location_zone_unique UNIQUE (id, location_id, zone_key),
  CONSTRAINT facility_geofence_boundaries_id_location_unique UNIQUE (id, location_id),
  CONSTRAINT facility_geofence_boundaries_previous_same_zone_fk
    FOREIGN KEY (previous_version_id, location_id, zone_key)
    REFERENCES facility_geofence_boundaries(id, location_id, zone_key) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS facility_geofence_boundaries_one_active_zone_unique
  ON facility_geofence_boundaries(location_id, zone_key)
  WHERE status = 'active';
CREATE INDEX IF NOT EXISTS facility_geofence_boundaries_active_lookup_idx
  ON facility_geofence_boundaries(location_id, zone_key, status, effective_from);
CREATE INDEX IF NOT EXISTS facility_geofence_boundaries_previous_version_idx
  ON facility_geofence_boundaries(previous_version_id);

-- Once activated, geometry/configuration/identity fields are immutable. The
-- lifecycle may only close an active interval by superseding or invalidating it.
CREATE OR REPLACE FUNCTION prevent_activated_geofence_boundary_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD.activated_at IS NOT NULL THEN
    RAISE EXCEPTION 'Activated Facility geofence boundary versions are immutable';
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.activated_at IS NOT NULL THEN
    IF NEW.location_id IS DISTINCT FROM OLD.location_id
      OR NEW.zone_key IS DISTINCT FROM OLD.zone_key
      OR NEW.version IS DISTINCT FROM OLD.version
      OR NEW.mode IS DISTINCT FROM OLD.mode
      OR NEW.center_latitude IS DISTINCT FROM OLD.center_latitude
      OR NEW.center_longitude IS DISTINCT FROM OLD.center_longitude
      OR NEW.radius_meters IS DISTINCT FROM OLD.radius_meters
      OR NEW.geometry_geojson IS DISTINCT FROM OLD.geometry_geojson
      OR NEW.exception_distance_meters IS DISTINCT FROM OLD.exception_distance_meters
      OR NEW.geometry_checksum IS DISTINCT FROM OLD.geometry_checksum
      OR NEW.previous_version_id IS DISTINCT FROM OLD.previous_version_id
      OR NEW.created_by IS DISTINCT FROM OLD.created_by
      OR NEW.created_at IS DISTINCT FROM OLD.created_at
      OR NEW.activated_by IS DISTINCT FROM OLD.activated_by
      OR NEW.activated_at IS DISTINCT FROM OLD.activated_at
      OR NEW.effective_from IS DISTINCT FROM OLD.effective_from
    THEN
      RAISE EXCEPTION 'Activated Facility geofence boundary version content is immutable';
    END IF;

    IF NEW.status NOT IN ('active', 'superseded', 'invalidated') THEN
      RAISE EXCEPTION 'Activated Facility geofence boundary lifecycle cannot return to draft';
    END IF;

    IF OLD.status <> 'active'
      AND (NEW.status IS DISTINCT FROM OLD.status OR NEW.effective_to IS DISTINCT FROM OLD.effective_to)
    THEN
      RAISE EXCEPTION 'Closed Facility geofence boundary lifecycle is immutable';
    END IF;
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS facility_geofence_boundaries_activated_immutable ON facility_geofence_boundaries;
CREATE TRIGGER facility_geofence_boundaries_activated_immutable
  BEFORE UPDATE OR DELETE ON facility_geofence_boundaries
  FOR EACH ROW EXECUTE FUNCTION prevent_activated_geofence_boundary_mutation();

CREATE TABLE IF NOT EXISTS facility_geofence_revision_events (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id varchar NOT NULL REFERENCES washout_locations(id) ON DELETE RESTRICT,
  boundary_version_id varchar NOT NULL REFERENCES facility_geofence_boundaries(id) ON DELETE RESTRICT,
  event_type varchar NOT NULL,
  actor_user_id varchar REFERENCES users(id) ON DELETE SET NULL,
  actor_role varchar,
  reason_code varchar NOT NULL,
  request_id varchar NOT NULL,
  idempotency_key varchar NOT NULL UNIQUE,
  safe_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT facility_geofence_revision_events_event_type_valid CHECK (
    event_type IN ('draft_created', 'validated', 'activated', 'superseded', 'invalidated', 'assistance_requested', 'correction_recorded')
  ),
  CONSTRAINT facility_geofence_revision_events_actor_role_valid CHECK (
    actor_role IS NULL OR actor_role IN ('owner', 'admin', 'super_admin', 'system')
  ),
  CONSTRAINT facility_geofence_revision_events_safe_metadata_object CHECK (jsonb_typeof(safe_metadata) = 'object'),
  CONSTRAINT facility_geofence_revision_events_boundary_location_fk
    FOREIGN KEY (boundary_version_id, location_id)
    REFERENCES facility_geofence_boundaries(id, location_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS facility_geofence_revision_events_boundary_created_idx
  ON facility_geofence_revision_events(boundary_version_id, created_at);
CREATE INDEX IF NOT EXISTS facility_geofence_revision_events_location_created_idx
  ON facility_geofence_revision_events(location_id, created_at);

CREATE TABLE IF NOT EXISTS activity_geofence_evaluations (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id varchar REFERENCES washout_activities(id) ON DELETE RESTRICT,
  workflow_reference varchar(160),
  location_id varchar NOT NULL REFERENCES washout_locations(id) ON DELETE RESTRICT,
  boundary_version_id varchar REFERENCES facility_geofence_boundaries(id) ON DELETE RESTRICT,
  boundary_version integer,
  evaluation_purpose varchar NOT NULL,
  result_state varchar NOT NULL,
  reason_code varchar NOT NULL,
  observation_latitude numeric(10,8),
  observation_longitude numeric(11,8),
  accuracy_meters numeric(10,3),
  observed_at timestamptz,
  evaluated_at timestamptz NOT NULL,
  signed_distance_meters numeric(14,3),
  outside_distance_meters numeric(14,3),
  exception_distance_meters numeric(12,3),
  exception_acknowledgement_code varchar(80),
  driver_note text,
  evidence_complete boolean NOT NULL DEFAULT false,
  idempotency_key varchar(240) NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT activity_geofence_evaluations_reference_present CHECK (
    activity_id IS NOT NULL OR workflow_reference IS NOT NULL
  ),
  CONSTRAINT activity_geofence_evaluations_boundary_reference_consistent CHECK (
    (boundary_version_id IS NULL AND boundary_version IS NULL)
    OR (boundary_version_id IS NOT NULL AND boundary_version IS NOT NULL AND boundary_version > 0)
  ),
  CONSTRAINT activity_geofence_evaluations_purpose_valid CHECK (
    evaluation_purpose IN ('selection_advisory', 'check_in', 'submission')
  ),
  CONSTRAINT activity_geofence_evaluations_state_valid CHECK (
    result_state IN (
      'INSIDE_APPROVED_BOUNDARY',
      'OUTSIDE_BOUNDARY_WITHIN_EXCEPTION_ZONE',
      'OUTSIDE_EXCEPTION_ZONE',
      'LOCATION_UNAVAILABLE',
      'LOCATION_ACCURACY_INSUFFICIENT',
      'GEOMETRY_UNAVAILABLE',
      'GEOMETRY_INVALID'
    )
  ),
  CONSTRAINT activity_geofence_evaluations_coordinates_consistent CHECK (
    (observation_latitude IS NULL AND observation_longitude IS NULL)
    OR (observation_latitude IS NOT NULL AND observation_longitude IS NOT NULL
      AND observation_latitude BETWEEN -90 AND 90 AND observation_longitude BETWEEN -180 AND 180)
  ),
  CONSTRAINT activity_geofence_evaluations_accuracy_nonnegative CHECK (accuracy_meters IS NULL OR accuracy_meters >= 0),
  CONSTRAINT activity_geofence_evaluations_outside_distance_nonnegative CHECK (outside_distance_meters IS NULL OR outside_distance_meters >= 0),
  CONSTRAINT activity_geofence_evaluations_exception_distance_positive CHECK (exception_distance_meters IS NULL OR exception_distance_meters > 0),
  CONSTRAINT activity_geofence_evaluations_driver_note_bounded CHECK (driver_note IS NULL OR char_length(driver_note) <= 500),
  CONSTRAINT activity_geofence_evaluations_boundary_location_fk
    FOREIGN KEY (boundary_version_id, location_id)
    REFERENCES facility_geofence_boundaries(id, location_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS activity_geofence_evaluations_activity_created_idx
  ON activity_geofence_evaluations(activity_id, created_at);
CREATE INDEX IF NOT EXISTS activity_geofence_evaluations_location_evaluated_idx
  ON activity_geofence_evaluations(location_id, evaluated_at);
CREATE INDEX IF NOT EXISTS activity_geofence_evaluations_boundary_evaluated_idx
  ON activity_geofence_evaluations(boundary_version_id, evaluated_at);

-- Revision and evaluation evidence is append-only. Corrections are new events,
-- boundary versions, or evaluations, never in-place rewrites.
CREATE OR REPLACE FUNCTION reject_geofence_append_only_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
END;
$$;

DROP TRIGGER IF EXISTS facility_geofence_revision_events_append_only ON facility_geofence_revision_events;
CREATE TRIGGER facility_geofence_revision_events_append_only
  BEFORE UPDATE OR DELETE ON facility_geofence_revision_events
  FOR EACH ROW EXECUTE FUNCTION reject_geofence_append_only_mutation();

DROP TRIGGER IF EXISTS activity_geofence_evaluations_append_only ON activity_geofence_evaluations;
CREATE TRIGGER activity_geofence_evaluations_append_only
  BEFORE UPDATE OR DELETE ON activity_geofence_evaluations
  FOR EACH ROW EXECUTE FUNCTION reject_geofence_append_only_mutation();

-- Seed only disabled controls in the existing canonical feature-flag table.
-- No Facility geometry is inferred, backfilled, or activated by this migration.
INSERT INTO feature_flags (flag_key, enabled, description, allowed_roles)
VALUES
  ('geofence_advisory_evaluation', false, 'Enable side-effect-free canonical Facility geofence advisory evaluation.', ARRAY['driver']::text[]),
  ('geofence_owner_boundary_management', false, 'Enable governed Owner Facility boundary management.', ARRAY['owner']::text[]),
  ('geofence_submission_enforcement', false, 'Enable canonical geofence check-in and submission enforcement.', ARRAY['driver']::text[]),
  ('geofence_notifications', false, 'Enable geofence notification intents through the canonical Notification Service.', ARRAY[]::text[]),
  ('geofence_legacy_transition', false, 'Enable separately governed transition from legacy distance rules.', ARRAY[]::text[])
ON CONFLICT (flag_key) DO NOTHING;
