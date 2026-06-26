ALTER TABLE "prize_catalog"
  ADD COLUMN IF NOT EXISTS "reserved_quantity" integer NOT NULL DEFAULT 0;

ALTER TABLE "prize_catalog"
  ADD COLUMN IF NOT EXISTS "inventory_updated_by" varchar REFERENCES "users"("id") ON DELETE set null;

CREATE TABLE IF NOT EXISTS "prize_catalog_inventory_adjustments" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "prize_catalog_id" varchar NOT NULL REFERENCES "prize_catalog"("id") ON DELETE cascade,
  "adjustment_type" varchar NOT NULL,
  "quantity_delta" integer NOT NULL,
  "quantity_before" integer NOT NULL,
  "quantity_after" integer NOT NULL,
  "reserved_before" integer NOT NULL,
  "reserved_after" integer NOT NULL,
  "reference_type" varchar,
  "reference_id" varchar,
  "reason" text NOT NULL,
  "created_by" varchar NOT NULL REFERENCES "users"("id") ON DELETE restrict,
  "created_at" timestamp DEFAULT now(),
  "metadata" jsonb
);

CREATE INDEX IF NOT EXISTS "idx_prize_catalog_inventory_adjustments_catalog"
  ON "prize_catalog_inventory_adjustments" ("prize_catalog_id");

CREATE INDEX IF NOT EXISTS "idx_prize_catalog_inventory_adjustments_created_at"
  ON "prize_catalog_inventory_adjustments" ("created_at");

CREATE INDEX IF NOT EXISTS "idx_prize_catalog_inventory_adjustments_created_by"
  ON "prize_catalog_inventory_adjustments" ("created_by");
