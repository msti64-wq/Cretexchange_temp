DO $$ BEGIN
  CREATE TYPE "lottery_notification_kind" AS ENUM ('winner', 'participant');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "lottery_drawings"
  ADD COLUMN IF NOT EXISTS "winner_notification_count" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "winner_notifications_sent_at" timestamp,
  ADD COLUMN IF NOT EXISTS "participant_notification_count" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "participant_notifications_sent_at" timestamp;

CREATE TABLE IF NOT EXISTS "lottery_notifications" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "lottery_drawing_id" varchar NOT NULL REFERENCES "lottery_drawings"("id") ON DELETE cascade,
  "lottery_month" integer NOT NULL,
  "lottery_year" integer NOT NULL,
  "user_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "driver_id" varchar REFERENCES "drivers"("id") ON DELETE cascade,
  "notification_kind" "lottery_notification_kind" NOT NULL,
  "place" integer,
  "title" varchar NOT NULL,
  "message" text NOT NULL,
  "notification_id" varchar REFERENCES "notifications"("id") ON DELETE set null,
  "data" jsonb,
  "sent_at" timestamp,
  "created_at" timestamp DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "uniq_lottery_notifications_drawing_user_kind"
  ON "lottery_notifications" ("lottery_drawing_id", "user_id", "notification_kind");

CREATE INDEX IF NOT EXISTS "idx_lottery_notifications_drawing"
  ON "lottery_notifications" ("lottery_drawing_id");

CREATE INDEX IF NOT EXISTS "idx_lottery_notifications_user"
  ON "lottery_notifications" ("user_id");
