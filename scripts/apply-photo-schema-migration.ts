import { Client } from "pg";

function getDatabaseUrl() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error("DATABASE_URL must be set before running the photo schema migration.");
  }
  return url.includes("sslmode=")
    ? url
    : `${url}${url.includes("?") ? "&" : "?"}sslmode=require`;
}

async function columnExists(client: Client, tableName: string, columnName: string) {
  const result = await client.query(
    `
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
        AND column_name = $2
      LIMIT 1
    `,
    [tableName, columnName],
  );
  return result.rowCount > 0;
}

async function constraintExists(client: Client, tableName: string, constraintName: string) {
  const result = await client.query(
    `
      SELECT 1
      FROM pg_constraint c
      INNER JOIN pg_class t ON t.oid = c.conrelid
      INNER JOIN pg_namespace n ON n.oid = c.connamespace
      WHERE n.nspname = 'public'
        AND t.relname = $1
        AND c.conname = $2
      LIMIT 1
    `,
    [tableName, constraintName],
  );
  return result.rowCount > 0;
}

async function main() {
  const client = new Client({
    connectionString: getDatabaseUrl(),
    ssl: { rejectUnauthorized: true },
  });

  await client.connect();

  try {
    await client.query("BEGIN");

    await client.query(`
      DO $$ BEGIN
        CREATE TYPE "photo_verification_status" AS ENUM ('verified', 'warning', 'failed', 'needs_review');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    const columnsToEnsure = [
      ["driver_id", "varchar"],
      ["location_id", "varchar"],
      ["image_fingerprint", "text"],
      ["duplicate_matched_photo_id", "varchar"],
      ["duplicate_matched_uploaded_at", "timestamp"],
      ["duplicate_similarity_score", "integer"],
      ["duplicate_hash_distance", "integer"],
      ["photo_taken_at", "timestamp"],
      ["uploaded_at", "timestamp"],
      ["gps_latitude", "numeric(10,8)"],
      ["gps_longitude", "numeric(11,8)"],
      ["verification_status", '"photo_verification_status" DEFAULT \'needs_review\' NOT NULL'],
      ["verification_distance_miles", "numeric(8,3)"],
      ["verification_reason", "text"],
      ["file_size", "integer"],
      ["content_type", "varchar DEFAULT 'image/jpeg'"],
    ] as const;

    for (const [columnName, definition] of columnsToEnsure) {
      await client.query(
        `ALTER TABLE "washout_photos" ADD COLUMN IF NOT EXISTS "${columnName}" ${definition};`,
      );
    }

    await client.query(`
      UPDATE "washout_photos" wp
      SET
        "driver_id" = COALESCE(wp."driver_id", wa."driver_id"),
        "location_id" = COALESCE(wp."location_id", wa."location_id")
      FROM "washout_activities" wa
      WHERE wp."activity_id" = wa."id"
        AND (wp."driver_id" IS NULL OR wp."location_id" IS NULL);
    `);

    await client.query(`
      UPDATE "washout_photos"
      SET "photo_taken_at" = COALESCE("photo_taken_at", "uploaded_at", "created_at", NOW());
    `);

    await client.query(`
      UPDATE "washout_photos"
      SET "verification_status" = COALESCE("verification_status", 'needs_review'::"photo_verification_status");
    `);

    await client.query(`
      UPDATE "washout_photos"
      SET "content_type" = COALESCE("content_type", 'image/jpeg')
      WHERE "content_type" IS NULL;
    `);

    await client.query(`
      UPDATE "washout_photos"
      SET "uploaded_at" = COALESCE("uploaded_at", NOW())
      WHERE "uploaded_at" IS NULL;
    `);

    await client.query(`ALTER TABLE "washout_photos" ALTER COLUMN "photo_taken_at" SET DEFAULT now();`);
    await client.query(`ALTER TABLE "washout_photos" ALTER COLUMN "uploaded_at" SET DEFAULT now();`);
    await client.query(`ALTER TABLE "washout_photos" ALTER COLUMN "verification_status" SET DEFAULT 'needs_review';`);
    await client.query(`ALTER TABLE "washout_photos" ALTER COLUMN "content_type" SET DEFAULT 'image/jpeg';`);

    await client.query(`ALTER TABLE "washout_photos" ALTER COLUMN "driver_id" SET NOT NULL;`);
    await client.query(`ALTER TABLE "washout_photos" ALTER COLUMN "location_id" SET NOT NULL;`);
    await client.query(`ALTER TABLE "washout_photos" ALTER COLUMN "photo_taken_at" SET NOT NULL;`);
    await client.query(`ALTER TABLE "washout_photos" ALTER COLUMN "uploaded_at" SET NOT NULL;`);
    await client.query(`ALTER TABLE "washout_photos" ALTER COLUMN "verification_status" SET NOT NULL;`);

    if (!(await constraintExists(client, "washout_photos", "washout_photos_driver_id_drivers_id_fk"))) {
      await client.query(`
        ALTER TABLE "washout_photos"
        ADD CONSTRAINT "washout_photos_driver_id_drivers_id_fk"
        FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE cascade ON UPDATE no action;
      `);
    }

    if (!(await constraintExists(client, "washout_photos", "washout_photos_location_id_washout_locations_id_fk"))) {
      await client.query(`
        ALTER TABLE "washout_photos"
        ADD CONSTRAINT "washout_photos_location_id_washout_locations_id_fk"
        FOREIGN KEY ("location_id") REFERENCES "public"."washout_locations"("id") ON DELETE cascade ON UPDATE no action;
      `);
    }

    await client.query("COMMIT");

    console.log("Photo schema migration applied successfully.", {
      table: "washout_photos",
      columns: columnsToEnsure.map(([column]) => column),
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Photo schema migration failed:", error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

await main();
