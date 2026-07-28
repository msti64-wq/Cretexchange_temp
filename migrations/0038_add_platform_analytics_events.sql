-- Immutable, source-referenced operational analytics facts. This table does
-- not own lifecycle, financial, or participant-profile data.
CREATE TABLE IF NOT EXISTS platform_analytics_events (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type varchar NOT NULL,
  event_version integer NOT NULL DEFAULT 1,
  source_record_type varchar NOT NULL,
  source_record_id varchar NOT NULL,
  source_event_key varchar NOT NULL,
  activity_id varchar REFERENCES washout_activities(id) ON DELETE SET NULL,
  driver_id varchar REFERENCES drivers(id) ON DELETE SET NULL,
  owner_id varchar REFERENCES owners(id) ON DELETE SET NULL,
  location_id varchar REFERENCES washout_locations(id) ON DELETE SET NULL,
  occurred_at timestamp NOT NULL,
  recorded_at timestamp NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT platform_analytics_events_event_type_valid CHECK (event_type IN (
    'driver.registered', 'driver.profile_completed', 'driver.first_logged_in',
    'facility.registered', 'facility.approved',
    'activity.checked_in', 'photo.uploaded', 'activity.submitted', 'activity.repeat_submitted',
    'facility.first_driver', 'facility.first_verified', 'facility.recurring_usage',
    'activity.verified', 'activity.rejected',
    'admin_review.requested', 'admin_review.closed', 'admin_review.returned_to_owner_review'
  )),
  CONSTRAINT platform_analytics_events_source_record_type_valid CHECK (source_record_type IN (
    'driver', 'facility_owner', 'washout_activity', 'washout_photo', 'administrative_review'
  )),
  CONSTRAINT platform_analytics_events_source_event_key_unique UNIQUE (source_event_key),
  CONSTRAINT platform_analytics_events_version_positive CHECK (event_version > 0)
);

CREATE INDEX IF NOT EXISTS platform_analytics_events_type_occurred_idx
  ON platform_analytics_events(event_type, occurred_at);
CREATE INDEX IF NOT EXISTS platform_analytics_events_activity_occurred_idx
  ON platform_analytics_events(activity_id, occurred_at);
CREATE INDEX IF NOT EXISTS platform_analytics_events_driver_occurred_idx
  ON platform_analytics_events(driver_id, occurred_at);
CREATE INDEX IF NOT EXISTS platform_analytics_events_location_occurred_idx
  ON platform_analytics_events(location_id, occurred_at);
