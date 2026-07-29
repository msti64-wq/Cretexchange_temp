import assert from "node:assert/strict";
import test from "node:test";
import { getTermsLedgerHealth, inspectTermsLedgerCatalog, resetTermsLedgerHealthCacheForTests, type TermsLedgerCatalogQueryable } from "../server/termsLedgerCatalog";

const columns = [
  ["terms_versions", "id", "character varying", "NO", "gen_random_uuid()"], ["terms_versions", "terms_type", "character varying", "NO", null], ["terms_versions", "language", "character varying", "NO", "'en'::character varying"], ["terms_versions", "storage_key", "character varying", "NO", null], ["terms_versions", "version", "character varying", "NO", null], ["terms_versions", "title", "character varying", "NO", null], ["terms_versions", "content_hash", "character varying", "NO", null], ["terms_versions", "effective_at", "timestamp without time zone", "NO", null], ["terms_versions", "requires_reacceptance", "boolean", "NO", "true"], ["terms_versions", "is_current", "boolean", "NO", "true"], ["terms_versions", "created_at", "timestamp without time zone", "YES", "now()"], ["terms_versions", "updated_at", "timestamp without time zone", "YES", "now()"],
  ["terms_acceptances", "id", "character varying", "NO", "gen_random_uuid()"], ["terms_acceptances", "user_id", "character varying", "NO", null], ["terms_acceptances", "role", "character varying", "NO", null], ["terms_acceptances", "terms_type", "character varying", "NO", null], ["terms_acceptances", "language", "character varying", "NO", "'en'::character varying"], ["terms_acceptances", "storage_key", "character varying", "NO", null], ["terms_acceptances", "version", "character varying", "NO", null], ["terms_acceptances", "content_hash", "character varying", "NO", null], ["terms_acceptances", "accepted_at", "timestamp without time zone", "NO", null], ["terms_acceptances", "ip_address", "character varying", "YES", null], ["terms_acceptances", "user_agent", "text", "YES", null], ["terms_acceptances", "created_at", "timestamp without time zone", "YES", "now()"],
].map(([table_name, column_name, data_type, is_nullable, column_default]) => ({ table_name, column_name, data_type, is_nullable, column_default }));

const indexes = [
  ["uniq_terms_versions_storage_key_version", "terms_versions", "CREATE UNIQUE INDEX uniq_terms_versions_storage_key_version ON public.terms_versions USING btree (storage_key, version)"],
  ["idx_terms_versions_type_language_current", "terms_versions", "CREATE INDEX idx_terms_versions_type_language_current ON public.terms_versions USING btree (terms_type, language, is_current)"],
  ["uniq_terms_acceptance_user_doc_version", "terms_acceptances", "CREATE UNIQUE INDEX uniq_terms_acceptance_user_doc_version ON public.terms_acceptances USING btree (user_id, terms_type, language, version, content_hash)"],
  ["idx_terms_acceptances_user", "terms_acceptances", "CREATE INDEX idx_terms_acceptances_user ON public.terms_acceptances USING btree (user_id)"],
].map(([indexname, tablename, indexdef]) => ({ indexname, tablename, indexdef }));

function fixture(overrides: Partial<Record<"tables" | "columns" | "primaryKeys" | "indexes" | "foreignKeys", any[]>> = {}): TermsLedgerCatalogQueryable {
  const data = {
    tables: [{ table_name: "terms_versions" }, { table_name: "terms_acceptances" }],
    columns,
    primaryKeys: [{ table_name: "terms_versions", column_name: "id" }, { table_name: "terms_acceptances", column_name: "id" }],
    indexes,
    foreignKeys: [{ definition: "FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE" }],
    ...overrides,
  };
  return { query: async (text: string) => {
    if (text.startsWith("SELECT 1")) return { rows: [{ terms_ledger_probe: 1 }] };
    if (text.includes("information_schema.tables")) return { rows: data.tables };
    if (text.includes("information_schema.columns")) return { rows: data.columns };
    if (text.includes("PRIMARY KEY")) return { rows: data.primaryKeys };
    if (text.includes("pg_indexes")) return { rows: data.indexes };
    if (text.includes("pg_get_constraintdef")) return { rows: data.foreignKeys };
    throw new Error("unexpected query");
  }};
}

test("structural catalog verifier accepts only the exact 0013 catalog", async () => {
  assert.equal(await inspectTermsLedgerCatalog(fixture()), "complete");
  assert.equal(await inspectTermsLedgerCatalog(fixture({ tables: [] })), "absent");
  assert.equal(await inspectTermsLedgerCatalog(fixture({ tables: [{ table_name: "terms_versions" }] })), "partial");
});

test("health reports available only for a complete structural catalog and uses a short safe cache", async () => {
  resetTermsLedgerHealthCacheForTests();
  assert.equal(await getTermsLedgerHealth(fixture(), 1), "available");
  assert.equal(await getTermsLedgerHealth(fixture({ tables: [] }), 2), "available");
  assert.equal(await getTermsLedgerHealth(fixture({ tables: [] }), 10_002), "unavailable");
  resetTermsLedgerHealthCacheForTests();
  assert.equal(await getTermsLedgerHealth(fixture({ columns: columns.slice(1) }), 1), "unavailable");
  resetTermsLedgerHealthCacheForTests();
});

test("structural verifier rejects missing columns and wrong types, nullability, defaults, primary keys, indexes, and foreign keys", async () => {
  assert.equal(await inspectTermsLedgerCatalog(fixture({ columns: columns.slice(1) })), "partial");
  assert.equal(await inspectTermsLedgerCatalog(fixture({ columns: columns.map((row) => row.column_name === "content_hash" ? { ...row, data_type: "text" } : row) })), "partial");
  assert.equal(await inspectTermsLedgerCatalog(fixture({ columns: columns.map((row) => row.column_name === "accepted_at" ? { ...row, is_nullable: "YES" } : row) })), "partial");
  assert.equal(await inspectTermsLedgerCatalog(fixture({ columns: columns.map((row) => row.column_name === "language" ? { ...row, column_default: "'es'::character varying" } : row) })), "partial");
  assert.equal(await inspectTermsLedgerCatalog(fixture({ primaryKeys: [{ table_name: "terms_versions", column_name: "id" }, { table_name: "terms_acceptances", column_name: "user_id" }] })), "partial");
  assert.equal(await inspectTermsLedgerCatalog(fixture({ indexes: indexes.map((row) => row.indexname === "idx_terms_acceptances_user" ? { ...row, indexdef: "CREATE UNIQUE INDEX idx_terms_acceptances_user ON public.terms_acceptances USING btree (user_id)" } : row) })), "partial");
  assert.equal(await inspectTermsLedgerCatalog(fixture({ foreignKeys: [{ definition: "FOREIGN KEY (user_id) REFERENCES accounts(id) ON DELETE RESTRICT" }] })), "partial");
});
