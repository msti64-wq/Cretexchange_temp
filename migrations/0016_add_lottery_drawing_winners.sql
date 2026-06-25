CREATE TABLE IF NOT EXISTS "lottery_drawing_winners" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "lottery_drawing_id" varchar NOT NULL REFERENCES "lottery_drawings"("id") ON DELETE cascade,
  "place_index" integer NOT NULL,
  "driver_id" varchar NOT NULL REFERENCES "drivers"("id") ON DELETE cascade,
  "entry_id" varchar NOT NULL REFERENCES "driver_lottery_entries"("id") ON DELETE cascade,
  "ticket_number" varchar NOT NULL,
  "prize_title" varchar,
  "prize_description" text,
  "notification_id" varchar REFERENCES "notifications"("id") ON DELETE set null,
  "created_at" timestamp DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "uniq_lottery_drawing_winners_drawing_place"
  ON "lottery_drawing_winners" ("lottery_drawing_id", "place_index");

CREATE INDEX IF NOT EXISTS "idx_lottery_drawing_winners_drawing"
  ON "lottery_drawing_winners" ("lottery_drawing_id");

CREATE INDEX IF NOT EXISTS "idx_lottery_drawing_winners_driver"
  ON "lottery_drawing_winners" ("driver_id");
