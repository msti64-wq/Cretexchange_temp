import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { TERMS_LEDGER_MIGRATION, assertTermsLedgerMigrationContext } from "../scripts/controlled-terms-ledger-migration";

test("terms-ledger migration runner is limited to immutable migration 0013 and sanitized controls", async () => {
  assert.deepEqual(TERMS_LEDGER_MIGRATION, {
    id: "0013",
    file: "migrations/0013_add_localized_terms_acceptance.sql",
    sha256: "21c04112cae0901781c0dfb572c3de88e4e8a3ff1bf09bdaeae6633d191dc22f",
  });
  const script = await readFile(new URL("../scripts/controlled-terms-ledger-migration.ts", import.meta.url), "utf8");
  assert.match(script, /inspectTermsLedgerCatalog/);
  assert.match(script, /TERMS_LEDGER_MIGRATION_AUTHORIZATION/);
  assert.match(script, /ALREADY_APPLIED 0013/);
  assert.match(script, /pg_try_advisory_lock/);
  assert.match(script, /MIGRATION_TRANSACTION_FAILED/);
  assert.match(script, /UNEXPECTED_FAILURE/);
  assert.doesNotMatch(script, /readdir|glob|drizzle-kit push/);
});

test("terms-ledger runner rejects wrong target, environment, commit, and production authorization with safe categories", () => {
  const sha = "a".repeat(40);
  assert.equal(assertTermsLedgerMigrationContext({ target: "staging", migrationTarget: "staging", railwayEnvironment: "staging", deployedSha: sha, suppliedSha: sha }), "staging");
  assert.equal(assertTermsLedgerMigrationContext({ target: "production", migrationTarget: "production", railwayEnvironment: "production", deployedSha: sha, suppliedSha: sha, productionAuthorization: sha }), "production");
  assert.throws(() => assertTermsLedgerMigrationContext({ target: "development", migrationTarget: "development", railwayEnvironment: "development", deployedSha: sha, suppliedSha: sha }), /TARGET_MISMATCH/);
  assert.throws(() => assertTermsLedgerMigrationContext({ target: "staging", migrationTarget: "staging", railwayEnvironment: "production", deployedSha: sha, suppliedSha: sha }), /TARGET_MISMATCH/);
  assert.throws(() => assertTermsLedgerMigrationContext({ target: "staging", migrationTarget: "staging", railwayEnvironment: "staging", deployedSha: sha, suppliedSha: "b".repeat(40) }), /COMMIT_MISMATCH/);
  assert.throws(() => assertTermsLedgerMigrationContext({ target: "production", migrationTarget: "production", railwayEnvironment: "production", deployedSha: sha, suppliedSha: sha, productionAuthorization: "b".repeat(40) }), /AUTHORIZATION_MISMATCH/);
});

test("immutable migration 0013 contains schema-only ledger adoption with both 12-column tables", async () => {
  const sql = await readFile(new URL("../migrations/0013_add_localized_terms_acceptance.sql", import.meta.url), "utf8");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS terms_versions/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS terms_acceptances/);
  assert.match(sql, /REFERENCES users\(id\) ON DELETE CASCADE/);
  assert.doesNotMatch(sql, /\bINSERT\s+INTO\b|\bUPDATE\s+\w+|\bDELETE\s+FROM\b/i);
});
