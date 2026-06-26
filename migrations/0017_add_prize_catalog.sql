CREATE TABLE IF NOT EXISTS "prize_catalog" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "title" varchar NOT NULL,
  "description" text,
  "prize_type" varchar NOT NULL,
  "estimated_value_cents" integer,
  "is_active" boolean NOT NULL DEFAULT true,
  "inventory_quantity" integer NOT NULL DEFAULT 0,
  "minimum_inventory_alert" integer NOT NULL DEFAULT 0,
  "is_unlimited" boolean NOT NULL DEFAULT false,
  "last_inventory_update" timestamp DEFAULT now(),
  "fulfillment_instructions" text,
  "sponsor_vendor" varchar,
  "internal_notes" text,
  "created_by" varchar REFERENCES "users"("id") ON DELETE set null,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);
