DO $$ BEGIN
 CREATE TYPE "photo_verification_status" AS ENUM ('verified', 'warning', 'failed', 'needs_review');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "washout_photos" ADD COLUMN IF NOT EXISTS "driver_id" varchar;
--> statement-breakpoint
ALTER TABLE "washout_photos" ADD COLUMN IF NOT EXISTS "location_id" varchar;
--> statement-breakpoint
ALTER TABLE "washout_photos" ADD COLUMN IF NOT EXISTS "image_fingerprint" text;
--> statement-breakpoint
ALTER TABLE "washout_photos" ADD COLUMN IF NOT EXISTS "duplicate_matched_photo_id" varchar;
--> statement-breakpoint
ALTER TABLE "washout_photos" ADD COLUMN IF NOT EXISTS "duplicate_matched_uploaded_at" timestamp;
--> statement-breakpoint
ALTER TABLE "washout_photos" ADD COLUMN IF NOT EXISTS "duplicate_similarity_score" integer;
--> statement-breakpoint
ALTER TABLE "washout_photos" ADD COLUMN IF NOT EXISTS "duplicate_hash_distance" integer;
--> statement-breakpoint
ALTER TABLE "washout_photos" ADD COLUMN IF NOT EXISTS "photo_taken_at" timestamp;
--> statement-breakpoint
ALTER TABLE "washout_photos" ADD COLUMN IF NOT EXISTS "uploaded_at" timestamp;
--> statement-breakpoint
ALTER TABLE "washout_photos" ADD COLUMN IF NOT EXISTS "gps_latitude" numeric(10,8);
--> statement-breakpoint
ALTER TABLE "washout_photos" ADD COLUMN IF NOT EXISTS "gps_longitude" numeric(11,8);
--> statement-breakpoint
ALTER TABLE "washout_photos" ADD COLUMN IF NOT EXISTS "verification_status" "photo_verification_status" DEFAULT 'needs_review' NOT NULL;
--> statement-breakpoint
ALTER TABLE "washout_photos" ADD COLUMN IF NOT EXISTS "verification_distance_miles" numeric(8,3);
--> statement-breakpoint
ALTER TABLE "washout_photos" ADD COLUMN IF NOT EXISTS "verification_reason" text;
--> statement-breakpoint
ALTER TABLE "washout_photos" ADD COLUMN IF NOT EXISTS "file_size" integer;
--> statement-breakpoint
ALTER TABLE "washout_photos" ADD COLUMN IF NOT EXISTS "content_type" varchar DEFAULT 'image/jpeg';
--> statement-breakpoint
UPDATE "washout_photos" wp
SET
  "driver_id" = COALESCE(wp."driver_id", wa."driver_id"),
  "location_id" = COALESCE(wp."location_id", wa."location_id")
FROM "washout_activities" wa
WHERE wp."activity_id" = wa."id"
  AND (wp."driver_id" IS NULL OR wp."location_id" IS NULL);
--> statement-breakpoint
UPDATE "washout_photos"
SET "photo_taken_at" = COALESCE("photo_taken_at", "uploaded_at", "created_at", NOW())
WHERE "photo_taken_at" IS NULL;
--> statement-breakpoint
UPDATE "washout_photos"
SET "uploaded_at" = COALESCE("uploaded_at", NOW())
WHERE "uploaded_at" IS NULL;
--> statement-breakpoint
UPDATE "washout_photos"
SET "verification_status" = COALESCE("verification_status", 'needs_review'::"photo_verification_status");
--> statement-breakpoint
UPDATE "washout_photos"
SET "content_type" = COALESCE("content_type", 'image/jpeg')
WHERE "content_type" IS NULL;
--> statement-breakpoint
ALTER TABLE "washout_photos" ALTER COLUMN "photo_taken_at" SET DEFAULT now();
--> statement-breakpoint
ALTER TABLE "washout_photos" ALTER COLUMN "uploaded_at" SET DEFAULT now();
--> statement-breakpoint
ALTER TABLE "washout_photos" ALTER COLUMN "verification_status" SET DEFAULT 'needs_review';
--> statement-breakpoint
ALTER TABLE "washout_photos" ALTER COLUMN "content_type" SET DEFAULT 'image/jpeg';
--> statement-breakpoint
ALTER TABLE "washout_photos" ALTER COLUMN "driver_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "washout_photos" ALTER COLUMN "location_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "washout_photos" ALTER COLUMN "photo_taken_at" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "washout_photos" ALTER COLUMN "uploaded_at" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "washout_photos" ALTER COLUMN "verification_status" SET NOT NULL;
--> statement-breakpoint
DO $$ BEGIN
 IF NOT EXISTS (
   SELECT 1 FROM pg_constraint WHERE conname = 'washout_photos_driver_id_drivers_id_fk'
 ) THEN
   ALTER TABLE "washout_photos"
   ADD CONSTRAINT "washout_photos_driver_id_drivers_id_fk"
   FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE cascade ON UPDATE no action;
 END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 IF NOT EXISTS (
   SELECT 1 FROM pg_constraint WHERE conname = 'washout_photos_location_id_washout_locations_id_fk'
 ) THEN
   ALTER TABLE "washout_photos"
   ADD CONSTRAINT "washout_photos_location_id_washout_locations_id_fk"
   FOREIGN KEY ("location_id") REFERENCES "public"."washout_locations"("id") ON DELETE cascade ON UPDATE no action;
 END IF;
END $$;
