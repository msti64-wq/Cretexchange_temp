import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import pg from "pg";
import { inspectTermsLedgerCatalog, type TermsLedgerCatalogState } from "../server/termsLedgerCatalog";

type Target = "staging" | "production";
export type TermsLedgerMigrationFailureCode =
  | "CHECKSUM_MISMATCH"
  | "TARGET_MISMATCH"
  | "COMMIT_MISMATCH"
  | "AUTHORIZATION_MISMATCH"
  | "LOCK_UNAVAILABLE"
  | "CATALOG_PARTIAL"
  | "MIGRATION_TRANSACTION_FAILED"
  | "CATALOG_VERIFICATION_FAILED"
  | "DATABASE_UNAVAILABLE"
  | "UNEXPECTED_FAILURE";

export const TERMS_LEDGER_MIGRATION = {
  id: "0013",
  file: "migrations/0013_add_localized_terms_acceptance.sql",
  sha256: "21c04112cae0901781c0dfb572c3de88e4e8a3ff1bf09bdaeae6633d191dc22f",
} as const;

const CLOSE_TIMEOUT_MS = 5_000;
const LOCK_NAME = "cretexchange:controlled-terms-ledger-migration";

class TermsLedgerMigrationFailure extends Error {
  constructor(readonly code: TermsLedgerMigrationFailureCode) { super(code); }
}
function fail(code: TermsLedgerMigrationFailureCode): never { throw new TermsLedgerMigrationFailure(code); }
function arg(name: string): string | undefined { const index = process.argv.indexOf(name); return index < 0 ? undefined : process.argv[index + 1]; }
function sha(value: unknown): string | null { return typeof value === "string" && /^[a-f0-9]{40}$/i.test(value.trim()) ? value.trim().toLowerCase() : null; }

export async function closeClient(client: pg.Client, timeoutMs = CLOSE_TIMEOUT_MS) {
  let closing = false;
  const timeout = setTimeout(() => {
    if (!closing) {
      console.error("TERMS_LEDGER_MIGRATION_CLOSE_TIMEOUT");
      client.connection.stream.destroy();
    }
  }, timeoutMs);
  timeout.unref();
  try { await client.end(); } finally { closing = true; clearTimeout(timeout); }
}

export async function assertMigrationChecksum(read = readFile) {
  const contents = await read(path.resolve(TERMS_LEDGER_MIGRATION.file));
  const actual = createHash("sha256").update(contents).digest("hex");
  if (actual !== TERMS_LEDGER_MIGRATION.sha256) fail("CHECKSUM_MISMATCH");
  console.log(`CHECKSUM 0013 ${actual}`);
}

export async function classifyTermsLedgerCatalog(client: pg.Client): Promise<TermsLedgerCatalogState> {
  try {
    return await inspectTermsLedgerCatalog(client);
  } catch {
    fail("DATABASE_UNAVAILABLE");
  }
}

export function assertTermsLedgerMigrationContext(input: {
  target: unknown;
  migrationTarget: unknown;
  railwayEnvironment: unknown;
  deployedSha: unknown;
  suppliedSha: unknown;
  productionAuthorization?: unknown;
}): Target {
  if (input.target !== "staging" && input.target !== "production") fail("TARGET_MISMATCH");
  const target = input.target;
  if (input.migrationTarget !== target || input.railwayEnvironment !== target) {
    fail("TARGET_MISMATCH");
  }
  const deployedSha = sha(input.deployedSha);
  if (!deployedSha || deployedSha !== sha(input.suppliedSha)) {
    fail("COMMIT_MISMATCH");
  }
  if (target === "production" && deployedSha !== sha(input.productionAuthorization)) {
    fail("AUTHORIZATION_MISMATCH");
  }
  return target;
}

async function main() {
  const mode = process.argv[2];
  const target = assertTermsLedgerMigrationContext({
    target: arg("--target"),
    migrationTarget: process.env.MIGRATION_TARGET,
    railwayEnvironment: process.env.RAILWAY_ENVIRONMENT_NAME,
    deployedSha: process.env.RAILWAY_GIT_COMMIT_SHA,
    suppliedSha: arg("--deployed-sha"),
    productionAuthorization: process.env.TERMS_LEDGER_MIGRATION_AUTHORIZATION,
  });
  await assertMigrationChecksum();
  console.log(`PLAN 0013:${TERMS_LEDGER_MIGRATION.file} target=${target}`);
  if (mode === "plan") return;
  if (mode !== "apply" || !process.argv.includes(`--confirm-${target}`)) fail("TARGET_MISMATCH");
  if (!process.env.DATABASE_URL) fail("DATABASE_UNAVAILABLE");

  const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: target === "production" ? { rejectUnauthorized: true } : undefined, connectionTimeoutMillis: 10_000 });
  try { await client.connect(); } catch { fail("DATABASE_UNAVAILABLE"); }
  try {
    const lock = await client.query<{ acquired: boolean }>("SELECT pg_try_advisory_lock(hashtext($1)) AS acquired", [LOCK_NAME]);
    if (!lock.rows[0]?.acquired) fail("LOCK_UNAVAILABLE");
    const state = await classifyTermsLedgerCatalog(client);
    if (state === "complete") { console.log("ALREADY_APPLIED 0013"); return; }
    if (state !== "absent") fail("CATALOG_PARTIAL");
    const sql = await readFile(path.resolve(TERMS_LEDGER_MIGRATION.file), "utf8");
    await client.query("BEGIN");
    try {
      await client.query("SET LOCAL statement_timeout = '30s'");
      await client.query("SET LOCAL lock_timeout = '5s'");
      await client.query(sql);
      if (await classifyTermsLedgerCatalog(client) !== "complete") fail("CATALOG_VERIFICATION_FAILED");
      await client.query("COMMIT");
      console.log("APPLIED 0013");
    } catch (error) {
      await client.query("ROLLBACK");
      if (error instanceof TermsLedgerMigrationFailure) throw error;
      fail("MIGRATION_TRANSACTION_FAILED");
    }
  } finally {
    try { await client.query("SELECT pg_advisory_unlock(hashtext($1))", [LOCK_NAME]); } catch {}
    await closeClient(client);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    const code = error instanceof TermsLedgerMigrationFailure ? error.code : "UNEXPECTED_FAILURE";
    console.error(`TERMS_LEDGER_MIGRATION_FAILED ${code}`);
    process.exitCode = 1;
  });
}
