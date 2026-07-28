import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import pg from "pg";

type Migration = { id: "0036" | "0037" | "0038"; file: string; sha256: string; expectedObjects: number };
type MigrationState = "pending" | "applied";
const CLIENT_CLOSE_TIMEOUT_MS = 5_000;

// This is deliberately separate from the staging-only runner. It has a smaller,
// production-authorized allowlist and refuses every environment other than the
// explicitly identified Railway production deployment.
const migrations: readonly Migration[] = [
  { id: "0036", file: "migrations/0036_add_washout_activity_admin_reviews.sql", sha256: "81c8c5dbceb87ed0aa024d3a34b432a72825722703e53574af785cbc8a08fdb0", expectedObjects: 7 },
  { id: "0037", file: "migrations/0037_add_washout_photo_review_audit.sql", sha256: "5714306b60592c536dc9d1e5dbe71e20392faedde97fd06d2d4b180fb58c7e5b", expectedObjects: 4 },
  { id: "0038", file: "migrations/0038_add_platform_analytics_events.sql", sha256: "eb0a977b9853cca5f6b42c18a24d18ccb37a53baca8e5100ce0a51852e4fc747", expectedObjects: 13 },
] as const;

function fail(message: string): never { throw new Error(message); }
function arg(name: string): string | undefined { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : undefined; }
function sha(value: string | undefined): string | null { return value && /^[a-f0-9]{40}$/i.test(value.trim()) ? value.trim().toLowerCase() : null; }

function selectMigrations(from: string | undefined, to: string | undefined): readonly Migration[] {
  const first = migrations.findIndex((migration) => migration.id === from);
  const last = migrations.findIndex((migration) => migration.id === to);
  if (first < 0 || last < first) fail("Only the ordered 0036 through 0038 production allowlist is permitted.");
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
  if (migration.id === "0038") {
    const tables = await count(client, "SELECT count(*)::int AS value FROM information_schema.tables WHERE table_schema=$1 AND table_name=$2", ["public", "platform_analytics_events"]);
    const indexes = await count(client, "SELECT count(*)::int AS value FROM pg_indexes WHERE schemaname=$1 AND indexname = ANY($2::text[])", ["public", "{platform_analytics_events_type_occurred_idx,platform_analytics_events_activity_occurred_idx,platform_analytics_events_driver_occurred_idx,platform_analytics_events_location_occurred_idx}"]);
    const constraints = await count(client, "SELECT count(*)::int AS value FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname=$1 AND t.relname=$2 AND c.conname = ANY($3::text[])", ["public", "platform_analytics_events", "{platform_analytics_events_event_type_valid,platform_analytics_events_source_record_type_valid,platform_analytics_events_source_event_key_unique,platform_analytics_events_version_positive}"]);
    const foreignKeys = await count(client, "SELECT count(*)::int AS value FROM pg_constraint WHERE conrelid=$1::regclass AND contype='f'", ["platform_analytics_events"]);
    return tables + indexes + constraints + foreignKeys;
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

/**
 * node-postgres waits for PostgreSQL to close its half of the socket after a
 * graceful Terminate packet. A proxy that leaves that socket half-open would
 * otherwise keep Railway's pre-deploy process alive indefinitely. At this
 * point all migration work and the advisory-lock release have already been
 * awaited, so closing the session is safe; PostgreSQL also releases any
 * session-scoped advisory lock when the connection closes.
 */
export async function closeClient(client: pg.Client, timeoutMs = CLIENT_CLOSE_TIMEOUT_MS) {
  let closing = false;
  const timeout = setTimeout(() => {
    if (!closing) {
      console.error("CONTROLLED_PRODUCTION_MIGRATION_CLOSE_TIMEOUT forcing database session close");
      client.connection.stream.destroy();
    }
  }, timeoutMs);
  timeout.unref();
  try {
    await client.end();
  } finally {
    closing = true;
    clearTimeout(timeout);
  }
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
    await closeClient(client);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(`CONTROLLED_PRODUCTION_MIGRATION_FAILED ${error instanceof Error ? error.message : "unknown error"}`); process.exitCode = 1; });
}
