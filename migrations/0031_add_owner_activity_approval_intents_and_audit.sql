-- Owner approval must be an explicit, one-time operational action. These tables
-- contain hashes and safe request metadata only; no bearer token, cookie, raw IP,
-- or user-agent value is persisted.

CREATE TABLE IF NOT EXISTS owner_activity_approval_intents (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id varchar NOT NULL REFERENCES washout_activities(id) ON DELETE CASCADE,
  owner_id varchar NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  actor_user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash varchar NOT NULL UNIQUE,
  expires_at timestamp NOT NULL,
  consumed_at timestamp,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS owner_activity_approval_intents_lookup_idx
  ON owner_activity_approval_intents (activity_id, owner_id, actor_user_id, expires_at);

CREATE TABLE IF NOT EXISTS washout_activity_review_events (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id varchar NOT NULL REFERENCES washout_activities(id) ON DELETE CASCADE,
  previous_status varchar NOT NULL,
  new_status varchar NOT NULL,
  actor_user_id varchar REFERENCES users(id) ON DELETE SET NULL,
  owner_id varchar REFERENCES owners(id) ON DELETE SET NULL,
  request_id varchar NOT NULL,
  auth_session_fingerprint varchar NOT NULL,
  user_agent_fingerprint varchar,
  ip_fingerprint varchar,
  origin varchar,
  referer varchar,
  deployed_commit varchar,
  action_source varchar NOT NULL,
  confirmation_acknowledged boolean NOT NULL DEFAULT false,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS washout_activity_review_events_activity_created_idx
  ON washout_activity_review_events (activity_id, created_at);
