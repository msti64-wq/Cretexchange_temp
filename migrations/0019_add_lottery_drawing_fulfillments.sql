DO $$
BEGIN
  CREATE TYPE "lottery_fulfillment_status" AS ENUM (
    'pending',
    'ordered',
    'purchased',
    'shipped',
    'delivered',
    'picked_up',
    'canceled',
    'issue'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END
$$;

CREATE TABLE IF NOT EXISTS "lottery_drawing_fulfillments" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "lottery_drawing_winner_id" varchar NOT NULL REFERENCES "lottery_drawing_winners"("id") ON DELETE cascade,
  "lottery_drawing_id" varchar NOT NULL REFERENCES "lottery_drawings"("id") ON DELETE cascade,
  "prize_catalog_id" varchar REFERENCES "prize_catalog"("id") ON DELETE set null,
  "drawing_month" integer NOT NULL,
  "drawing_year" integer NOT NULL,
  "driver_id" varchar NOT NULL REFERENCES "drivers"("id") ON DELETE cascade,
  "driver_name_snapshot" varchar NOT NULL,
  "entry_id" varchar NOT NULL REFERENCES "driver_lottery_entries"("id") ON DELETE cascade,
  "ticket_number_snapshot" varchar NOT NULL,
  "prize_title_snapshot" varchar NOT NULL,
  "prize_description_snapshot" text,
  "prize_type_snapshot" varchar,
  "vendor_or_sponsor_snapshot" varchar,
  "fulfillment_status" "lottery_fulfillment_status" NOT NULL DEFAULT 'pending',
  "fulfillment_notes" text,
  "tracking_number" varchar,
  "tracking_reference" varchar,
  "fulfilled_by" varchar REFERENCES "users"("id") ON DELETE set null,
  "fulfilled_at" timestamp,
  "canceled_at" timestamp,
  "issue_reported_at" timestamp,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "uniq_lottery_drawing_fulfillments_winner"
  ON "lottery_drawing_fulfillments" ("lottery_drawing_winner_id");

CREATE INDEX IF NOT EXISTS "idx_lottery_drawing_fulfillments_drawing"
  ON "lottery_drawing_fulfillments" ("lottery_drawing_id");

CREATE INDEX IF NOT EXISTS "idx_lottery_drawing_fulfillments_status"
  ON "lottery_drawing_fulfillments" ("fulfillment_status");

CREATE INDEX IF NOT EXISTS "idx_lottery_drawing_fulfillments_driver"
  ON "lottery_drawing_fulfillments" ("driver_id");

CREATE TABLE IF NOT EXISTS "lottery_drawing_fulfillment_history" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "fulfillment_id" varchar NOT NULL REFERENCES "lottery_drawing_fulfillments"("id") ON DELETE cascade,
  "previous_status" "lottery_fulfillment_status",
  "next_status" "lottery_fulfillment_status" NOT NULL,
  "notes" text,
  "tracking_number" varchar,
  "tracking_reference" varchar,
  "changed_by" varchar NOT NULL REFERENCES "users"("id") ON DELETE restrict,
  "changed_at" timestamp DEFAULT now(),
  "metadata" jsonb
);

CREATE INDEX IF NOT EXISTS "idx_lottery_drawing_fulfillment_history_fulfillment"
  ON "lottery_drawing_fulfillment_history" ("fulfillment_id");

CREATE INDEX IF NOT EXISTS "idx_lottery_drawing_fulfillment_history_changed_at"
  ON "lottery_drawing_fulfillment_history" ("changed_at");

CREATE INDEX IF NOT EXISTS "idx_lottery_drawing_fulfillment_history_changed_by"
  ON "lottery_drawing_fulfillment_history" ("changed_by");
