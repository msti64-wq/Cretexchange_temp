import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";

type Migration = { id: string; file: string; sha256: string; verify: (client: pg.Client) => Promise<void> };

const releaseMigrations: Migration[] = [
  { id: "0031", file: "migrations/0031_add_owner_activity_approval_intents_and_audit.sql", sha256: "23ffad8cc0f323d6d703723ec01ae2bd04f85ee2fe53ab20f885e6a5092d9b11", verify: verify0031 },
  { id: "0032", file: "migrations/0032_add_user_auth_token_version.sql", sha256: "6d9f10fb3a7fe3abd9c549398a3f41cadfe5798df93ac007f5336e5d18387700", verify: verify0032 },
  { id: "0033", file: "migrations/0033_add_facility_material_management.sql", sha256: "537980195a1f4987de93760c404f436f7c6bc72aa94544c8bde818a38fb4702e", verify: verify0033 },
  { id: "0034", file: "migrations/0034_add_driver_active_material_intent.sql", sha256: "100ef11493eb9898378de0dc3d669765429090db0d6388cfedcfb503a9f02a0d", verify: verify0034 },
  { id: "0035", file: "migrations/0035_add_administration_repository_foundation.sql", sha256: "e7d9a17933c7bdaf8783948a7e146a5978a941a55ac56a089c326fa3ce40a18f", verify: verify0035 },
];

function fail(message: string): never { throw new Error(message); }
function arg(name: string): string | undefined { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : undefined; }
function selectedMigrations(from: string | undefined, to: string | undefined): Migration[] {
  const first = releaseMigrations.findIndex((migration) => migration.id === from);
  const last = releaseMigrations.findIndex((migration) => migration.id === to);
  if (first < 0 || last < first) fail("Only the ordered 0031 through 0035 release allowlist is permitted.");
  return releaseMigrations.slice(first, last + 1);
}
async function assertChecksums(migrations: Migration[]) {
  for (const migration of migrations) {
    const contents = await readFile(path.resolve(migration.file));
    const actual = createHash("sha256").update(contents).digest("hex");
    if (actual !== migration.sha256) fail(`Checksum mismatch for ${migration.id}.`);
    console.log(`CHECKSUM ${migration.id} ${actual}`);
  }
}
async function scalar(client: pg.Client, query: string): Promise<number> { return Number((await client.query<{ value: number }>(query)).rows[0]?.value || 0); }
async function requireCount(client: pg.Client, query: string, expected: number, label: string) { const actual = await scalar(client, query); if (actual !== expected) fail(`Verification failed for ${label}: expected ${expected}, received ${actual}.`); }

async function verify0031(client: pg.Client) {
  await requireCount(client, "SELECT count(*)::int AS value FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('owner_activity_approval_intents','washout_activity_review_events')", 2, "0031 tables");
  await requireCount(client, "SELECT count(*)::int AS value FROM pg_indexes WHERE schemaname='public' AND indexname IN ('owner_activity_approval_intents_lookup_idx','washout_activity_review_events_activity_created_idx')", 2, "0031 indexes");
}
async function verify0032(client: pg.Client) {
  await requireCount(client, "SELECT count(*)::int AS value FROM information_schema.columns WHERE table_schema='public' AND table_name='users' AND column_name='auth_token_version' AND data_type='integer' AND is_nullable='NO' AND column_default='0'", 1, "0032 column contract");
  await requireCount(client, "SELECT count(*)::int AS value FROM users WHERE auth_token_version IS NULL OR auth_token_version < 0", 0, "0032 invariant");
}
async function verify0033(client: pg.Client) {
  await requireCount(client, "SELECT count(*)::int AS value FROM information_schema.columns WHERE table_schema='public' AND table_name='materials' AND column_name IN ('category','description','is_active','retired_at','display_order','icon_ref')", 6, "0033 materials columns");
  await requireCount(client, "SELECT count(*)::int AS value FROM information_schema.columns WHERE table_schema='public' AND table_name='location_material_intents' AND column_name IN ('custom_category','custom_description','owner_instructions','created_by_user_id','updated_by_user_id')", 5, "0033 intent columns");
  await requireCount(client, "SELECT count(*)::int AS value FROM pg_constraint WHERE conname='location_material_intents_exactly_one_identity'", 1, "0033 identity constraint");
  await requireCount(client, "SELECT count(*)::int AS value FROM pg_indexes WHERE schemaname='public' AND indexname IN ('idx_lmi_location_system_material_unique','idx_lmi_location_custom_material_unique')", 2, "0033 indexes");
  await requireCount(client, "SELECT count(*)::int AS value FROM materials", 30, "0033 material catalog");
  await requireCount(client, "SELECT count(*)::int AS value FROM (SELECT slug FROM materials GROUP BY slug HAVING count(*) > 1) duplicates", 0, "0033 duplicate material slugs");
  await requireCount(client, "SELECT count(*)::int AS value FROM location_material_intents WHERE material_slug IS NOT NULL AND custom_label IS NOT NULL AND btrim(custom_label) <> ''", 0, "0033 invalid dual identities");
  await requireCount(client, "SELECT count(*)::int AS value FROM location_material_intents WHERE material_slug IS NULL AND (custom_label IS NULL OR btrim(custom_label) = '')", 0, "0033 invalid empty identities");
  await requireCount(client, "SELECT count(*)::int AS value FROM location_material_intents WHERE material_slug='concrete-washout' AND active=true", 1, "0033 default location intent");
}
async function verify0034(client: pg.Client) {
  await requireCount(client, "SELECT count(*)::int AS value FROM information_schema.columns WHERE table_schema='public' AND table_name='drivers' AND column_name IN ('active_material_slug','active_material_updated_at')", 2, "0034 columns");
  await requireCount(client, "SELECT count(*)::int AS value FROM pg_indexes WHERE schemaname='public' AND indexname='idx_drivers_active_material_slug'", 1, "0034 index");
  await requireCount(client, "SELECT count(*)::int AS value FROM drivers d LEFT JOIN materials m ON m.slug=d.active_material_slug WHERE d.active_material_slug IS NOT NULL AND m.slug IS NULL", 0, "0034 foreign-key integrity");
}
async function verify0035(client: pg.Client) {
  const tables = "'governed_documents','document_source_versions','document_metadata','document_classifications','publication_sets','publication_manifest_entries','document_relationships','synchronization_runs','synchronization_results','governance_audit_events'";
  const indexes = "'idx_governed_documents_type_state','idx_governed_documents_path','idx_document_source_versions_commit','idx_document_relationships_source','uniq_document_relationship_identity','idx_synchronization_results_run','idx_governance_audit_events_created'";
  await requireCount(client, `SELECT count(*)::int AS value FROM information_schema.tables WHERE table_schema='public' AND table_name IN (${tables})`, 10, "0035 tables");
  await requireCount(client, `SELECT count(*)::int AS value FROM pg_indexes WHERE schemaname='public' AND indexname IN (${indexes})`, 7, "0035 indexes");
  await requireCount(client, "SELECT count(*)::int AS value FROM pg_proc WHERE proname='gen_random_uuid'", 1, "0035 UUID support");
}

async function main() {
  const [mode] = process.argv.slice(2);
  const target = arg("--target"); const migrations = selectedMigrations(arg("--from"), arg("--to"));
  if (!process.env.MIGRATION_TARGET || process.env.MIGRATION_TARGET !== "staging" || target !== "staging") fail("This runner is staging-only and requires MIGRATION_TARGET=staging.");
  if (!process.env.RAILWAY_ENVIRONMENT_NAME || process.env.RAILWAY_ENVIRONMENT_NAME !== "staging") fail("Railway environment must be explicitly identified as staging.");
  await assertChecksums(migrations);
  console.log(`PLAN ${migrations.map((migration) => `${migration.id}:${migration.file}`).join(" ")}`);
  if (mode === "plan") return;
  if (mode !== "apply" || !process.argv.includes("--confirm-staging")) fail("Apply mode requires --confirm-staging.");
  if (!process.env.DATABASE_URL) fail("DATABASE_URL is required inside the staging migration job.");
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL }); await client.connect();
  try {
    const lock = await client.query<{ acquired: boolean }>("SELECT pg_try_advisory_lock(hashtext('cretexchange:controlled-staging-migrations')) AS acquired");
    if (!lock.rows[0]?.acquired) fail("Migration advisory lock is unavailable.");
    for (const migration of migrations) {
      const sql = await readFile(path.resolve(migration.file), "utf8");
      await client.query("BEGIN");
      try { await client.query("SET LOCAL statement_timeout = '30s'"); await client.query("SET LOCAL lock_timeout = '5s'"); await client.query(sql); await migration.verify(client); await client.query("COMMIT"); console.log(`APPLIED ${migration.id}`); }
      catch (error) { await client.query("ROLLBACK"); throw error; }
    }
  } finally { try { await client.query("SELECT pg_advisory_unlock(hashtext('cretexchange:controlled-staging-migrations'))"); } catch {} await client.end(); }
}

main().catch((error) => { console.error(`CONTROLLED_MIGRATION_FAILED ${error instanceof Error ? error.message : "unknown error"}`); process.exitCode = 1; });
