DO $$ BEGIN
 CREATE TYPE "photo_verification_status" AS ENUM ('verified', 'warning', 'failed', 'needs_review');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
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
UPDATE "washout_photos"
SET "photo_taken_at" = COALESCE("photo_taken_at", "uploaded_at", "created_at", NOW())
WHERE "photo_taken_at" IS NULL;
--> statement-breakpoint
ALTER TABLE "washout_photos" ALTER COLUMN "photo_taken_at" SET DEFAULT now();
--> statement-breakpoint
ALTER TABLE "washout_photos" ALTER COLUMN "photo_taken_at" SET NOT NULL;
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
