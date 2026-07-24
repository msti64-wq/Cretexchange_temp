-- Facilitator-only Administrative Review Requests. This table does not create
-- an activity status or financial state. The owner remains the sole approver.
CREATE TABLE IF NOT EXISTS washout_activity_admin_reviews (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id varchar NOT NULL REFERENCES washout_activities(id) ON DELETE CASCADE,
  driver_id varchar NOT NULL REFERENCES drivers(id) ON DELETE RESTRICT,
  driver_user_id varchar NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  owner_id varchar NOT NULL REFERENCES owners(id) ON DELETE RESTRICT,
  rejection_reason_snapshot text NOT NULL,
  driver_explanation text NOT NULL,
  requested_at timestamp NOT NULL DEFAULT now(),
  resolution varchar,
  admin_user_id varchar REFERENCES users(id) ON DELETE SET NULL,
  admin_rationale text,
  decided_at timestamp,
  version integer NOT NULL DEFAULT 1,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT washout_activity_admin_reviews_resolution_check CHECK (
    resolution IS NULL OR resolution IN ('closed', 'returned_to_owner_review')
  ),
  CONSTRAINT washout_activity_admin_reviews_decision_check CHECK (
    (resolution IS NULL AND admin_user_id IS NULL AND admin_rationale IS NULL AND decided_at IS NULL)
    OR (resolution IS NOT NULL AND admin_user_id IS NOT NULL AND admin_rationale IS NOT NULL AND decided_at IS NOT NULL)
  )
);

-- One active request at a time; a new request is allowed only after the prior
-- request is resolved and a subsequent owner rejection has occurred.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_washout_activity_admin_reviews_unresolved
  ON washout_activity_admin_reviews(activity_id) WHERE resolution IS NULL;
CREATE INDEX IF NOT EXISTS idx_washout_activity_admin_reviews_activity_requested
  ON washout_activity_admin_reviews(activity_id, requested_at);
CREATE INDEX IF NOT EXISTS idx_washout_activity_admin_reviews_owner_resolution
  ON washout_activity_admin_reviews(owner_id, resolution, requested_at);
CREATE INDEX IF NOT EXISTS idx_washout_activity_admin_reviews_driver_resolution
  ON washout_activity_admin_reviews(driver_id, resolution, requested_at);
