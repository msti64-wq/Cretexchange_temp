import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";

type Migration = { id: "0036" | "0037"; file: string; sha256: string; expectedObjects: number };
type MigrationState = "pending" | "applied";

// This is deliberately separate from the staging-only runner. It has a smaller,
// production-authorized allowlist and refuses every environment other than the
// explicitly identified Railway production deployment.
const migrations: readonly Migration[] = [
  { id: "0036", file: "migrations/0036_add_washout_activity_admin_reviews.sql", sha256: "81c8c5dbceb87ed0aa024d3a34b432a72825722703e53574af785cbc8a08fdb0", expectedObjects: 7 },
  { id: "0037", file: "migrations/0037_add_washout_photo_review_audit.sql", sha256: "5714306b60592c536dc9d1e5dbe71e20392faedde97fd06d2d4b180fb58c7e5b", expectedObjects: 4 },
] as const;

function fail(message: string): never { throw new Error(message); }
function arg(name: string): string | undefined { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : undefined; }
function sha(value: string | undefined): string | null { return value && /^[a-f0-9]{40}$/i.test(value.trim()) ? value.trim().toLowerCase() : null; }

function selectMigrations(from: string | undefined, to: string | undefined): readonly Migration[] {
  const first = migrations.findIndex((migration) => migration.id === from);
  const last = migrations.findIndex((migration) => migration.id === to);
  if (first < 0 || last < first) fail("Only the ordered 0036 through 0037 production allowlist is permitted.");
  return migrations.slice(first, last + 1);
}

async function assertChecksums(selected: readonly Migration[]) {
  for (const migration of selected) {
    const contents = await readFile(path.resolve(migration.file));
    const actual = createHash("sha256").update(contents).digest("hex");
    if (actual !== migration.sha256) fail(`Checksum mismatch for ${migration.id}.`);
    console.log(`CHECKSUM ${migration.id} ${actual}`);
  }
}

async function count(client: pg.Client, text: string, values: string[]): Promise<number> {
  return Number((await client.query<{ value: number }>(text, values)).rows[0]?.value || 0);
}

async function migrationObjectCount(client: pg.Client, migration: Migration): Promise<number> {
  if (migration.id === "0036") {
    const tables = await count(client, "SELECT count(*)::int AS value FROM information_schema.tables WHERE table_schema=$1 AND table_name=$2", ["public", "washout_activity_admin_reviews"]);
    const indexes = await count(client, "SELECT count(*)::int AS value FROM pg_indexes WHERE schemaname=$1 AND indexname = ANY($2::text[])", ["public", "{uniq_washout_activity_admin_reviews_unresolved,idx_washout_activity_admin_reviews_activity_requested,idx_washout_activity_admin_reviews_owner_resolution,idx_washout_activity_admin_reviews_driver_resolution}"]);
    const constraints = await count(client, "SELECT count(*)::int AS value FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname=$1 AND t.relname=$2 AND c.conname = ANY($3::text[])", ["public", "washout_activity_admin_reviews", "{washout_activity_admin_reviews_resolution_check,washout_activity_admin_reviews_decision_check}"]);
    return tables + indexes + constraints;
  }
  const tables = await count(client, "SELECT count(*)::int AS value FROM information_schema.tables WHERE table_schema=$1 AND table_name=$2", ["public", "washout_photo_review_events"]);
  const indexes = await count(client, "SELECT count(*)::int AS value FROM pg_indexes WHERE schemaname=$1 AND indexname = ANY($2::text[])", ["public", "{washout_photo_review_events_photo_created_idx,washout_photo_review_events_activity_created_idx}"]);
  const constraints = await count(client, "SELECT count(*)::int AS value FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname=$1 AND t.relname=$2 AND c.conname=$3", ["public", "washout_photo_review_events", "washout_photo_review_events_rejection_reason_check"]);
  return tables + indexes + constraints;
}

async function state(client: pg.Client, migration: Migration): Promise<MigrationState> {
  const actual = await migrationObjectCount(client, migration);
  if (actual === 0) return "pending";
  if (actual === migration.expectedObjects) return "applied";
  fail(`Catalog state for ${migration.id} is partial (${actual}/${migration.expectedObjects}); no repair is authorized.`);
}

function assertProductionAuthorization() {
  if (process.env.MIGRATION_TARGET !== "production") fail("MIGRATION_TARGET=production is required.");
  if (process.env.RAILWAY_ENVIRONMENT_NAME !== "production") fail("Railway environment must be explicitly identified as production.");
  const deployed = sha(process.env.RAILWAY_GIT_COMMIT_SHA);
  const supplied = sha(arg("--deployed-sha"));
  const authorization = sha(process.env.PRODUCTION_MIGRATION_AUTHORIZATION);
  if (!deployed || !supplied || !authorization || deployed !== supplied || deployed !== authorization) {
    fail("Production migration authorization must match the immutable Railway deployment commit.");
  }
}

async function main() {
  const [mode] = process.argv.slice(2);
  const selected = selectMigrations(arg("--from"), arg("--to"));
  assertProductionAuthorization();
  await assertChecksums(selected);
  console.log(`PLAN ${selected.map((migration) => `${migration.id}:${migration.file}`).join(" ")}`);
  if (mode === "plan") return;
  if (mode !== "apply" || !process.argv.includes("--confirm-production")) fail("Apply mode requires --confirm-production.");
  if (!process.env.DATABASE_URL) fail("DATABASE_URL is required inside the production migration job.");

  const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: true }, connectionTimeoutMillis: 10_000 });
  await client.connect();
  try {
    const lock = await client.query<{ acquired: boolean }>("SELECT pg_try_advisory_lock(hashtext('cretexchange:controlled-production-migrations')) AS acquired");
    if (!lock.rows[0]?.acquired) fail("Production migration advisory lock is unavailable.");
    for (const migration of selected) {
      const before = await state(client, migration);
      if (before === "applied") { console.log(`ALREADY_APPLIED ${migration.id}`); continue; }
      const sql = await readFile(path.resolve(migration.file), "utf8");
      await client.query("BEGIN");
      try {
        await client.query("SET LOCAL statement_timeout = '30s'");
        await client.query("SET LOCAL lock_timeout = '5s'");
        await client.query(sql);
        if (await state(client, migration) !== "applied") fail(`Catalog verification failed for ${migration.id}.`);
        await client.query("COMMIT");
        console.log(`APPLIED ${migration.id}`);
      } catch (error) { await client.query("ROLLBACK"); throw error; }
    }
  } finally {
    try { await client.query("SELECT pg_advisory_unlock(hashtext('cretexchange:controlled-production-migrations'))"); } catch {}
    await client.end();
  }
}

main().catch((error) => { console.error(`CONTROLLED_PRODUCTION_MIGRATION_FAILED ${error instanceof Error ? error.message : "unknown error"}`); process.exitCode = 1; });
