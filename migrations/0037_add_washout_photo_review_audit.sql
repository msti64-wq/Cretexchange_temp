-- Administrative Photo Review is an evidence-only, auditable workflow. It
-- does not alter canonical washout activity status or any financial record.
CREATE TABLE IF NOT EXISTS washout_photo_review_events (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  photo_id varchar NOT NULL REFERENCES washout_photos(id) ON DELETE CASCADE,
  activity_id varchar NOT NULL REFERENCES washout_activities(id) ON DELETE CASCADE,
  previous_verification_status photo_verification_status NOT NULL,
  new_verification_status photo_verification_status NOT NULL,
  actor_user_id varchar REFERENCES users(id) ON DELETE SET NULL,
  reason text,
  action_source varchar NOT NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT washout_photo_review_events_rejection_reason_check
    CHECK (new_verification_status <> 'failed' OR length(btrim(coalesce(reason, ''))) > 0)
);

CREATE INDEX IF NOT EXISTS washout_photo_review_events_photo_created_idx
  ON washout_photo_review_events(photo_id, created_at);

CREATE INDEX IF NOT EXISTS washout_photo_review_events_activity_created_idx
  ON washout_photo_review_events(activity_id, created_at);
