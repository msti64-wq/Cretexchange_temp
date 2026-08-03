ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS recipient_role varchar,
  ADD COLUMN IF NOT EXISTS category varchar NOT NULL DEFAULT 'system',
  ADD COLUMN IF NOT EXISTS template_key varchar,
  ADD COLUMN IF NOT EXISTS template_version varchar NOT NULL DEFAULT '1',
  ADD COLUMN IF NOT EXISTS read_at timestamp,
  ADD COLUMN IF NOT EXISTS archived_at timestamp,
  ADD COLUMN IF NOT EXISTS deep_link varchar,
  ADD COLUMN IF NOT EXISTS source_entity_type varchar,
  ADD COLUMN IF NOT EXISTS source_entity_id varchar,
  ADD COLUMN IF NOT EXISTS idempotency_key varchar,
  ADD COLUMN IF NOT EXISTS priority varchar NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS delivery_state varchar NOT NULL DEFAULT 'delivered',
  ADD COLUMN IF NOT EXISTS schema_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS updated_at timestamp DEFAULT now();

ALTER TABLE notifications ALTER COLUMN is_read SET DEFAULT false;
UPDATE notifications SET is_read = false WHERE is_read IS NULL;
ALTER TABLE notifications ALTER COLUMN is_read SET NOT NULL;

DO $$ BEGIN
  ALTER TABLE notifications ADD CONSTRAINT notifications_recipient_role_valid
    CHECK (recipient_role IS NULL OR recipient_role IN ('driver','owner','admin','super_admin'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE notifications ADD CONSTRAINT notifications_category_valid
    CHECK (category IN ('operational','achievement','competition','administrative','system','announcement'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE notifications ADD CONSTRAINT notifications_priority_valid
    CHECK (priority IN ('normal','high'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE notifications ADD CONSTRAINT notifications_delivery_state_valid
    CHECK (delivery_state IN ('delivered','suppressed'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE notifications ADD CONSTRAINT notifications_schema_version_positive
    CHECK (schema_version > 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS notifications_idempotency_key_unique
  ON notifications(idempotency_key);
CREATE INDEX IF NOT EXISTS notifications_user_archived_created_idx
  ON notifications(user_id, archived_at, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_user_read_archived_idx
  ON notifications(user_id, is_read, archived_at);
CREATE INDEX IF NOT EXISTS notifications_user_category_created_idx
  ON notifications(user_id, category, created_at DESC);
