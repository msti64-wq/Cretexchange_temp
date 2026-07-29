export type TermsLedgerCatalogState = "absent" | "complete" | "partial";
export type TermsLedgerHealthState = "available" | "unavailable";

export interface CatalogQueryResult<Row> { rows: Row[]; }
export interface TermsLedgerCatalogQueryable {
  query<Row = Record<string, unknown>>(text: string, values?: unknown[]): Promise<CatalogQueryResult<Row>>;
}

type ColumnRow = {
  table_name: string;
  column_name: string;
  data_type: string;
  is_nullable: "YES" | "NO";
  column_default: string | null;
};

const expectedColumns: Record<string, Array<[string, string, "YES" | "NO", string | null]>> = {
  terms_versions: [
    ["id", "character varying", "NO", "gen_random_uuid()"],
    ["terms_type", "character varying", "NO", null],
    ["language", "character varying", "NO", "'en'"],
    ["storage_key", "character varying", "NO", null],
    ["version", "character varying", "NO", null],
    ["title", "character varying", "NO", null],
    ["content_hash", "character varying", "NO", null],
    ["effective_at", "timestamp without time zone", "NO", null],
    ["requires_reacceptance", "boolean", "NO", "true"],
    ["is_current", "boolean", "NO", "true"],
    ["created_at", "timestamp without time zone", "YES", "now()"],
    ["updated_at", "timestamp without time zone", "YES", "now()"],
  ],
  terms_acceptances: [
    ["id", "character varying", "NO", "gen_random_uuid()"],
    ["user_id", "character varying", "NO", null],
    ["role", "character varying", "NO", null],
    ["terms_type", "character varying", "NO", null],
    ["language", "character varying", "NO", "'en'"],
    ["storage_key", "character varying", "NO", null],
    ["version", "character varying", "NO", null],
    ["content_hash", "character varying", "NO", null],
    ["accepted_at", "timestamp without time zone", "NO", null],
    ["ip_address", "character varying", "YES", null],
    ["user_agent", "text", "YES", null],
    ["created_at", "timestamp without time zone", "YES", "now()"],
  ],
};

const expectedIndexes: Record<string, { table: string; unique: boolean; columns: string[] }> = {
  uniq_terms_versions_storage_key_version: { table: "terms_versions", unique: true, columns: ["storage_key", "version"] },
  idx_terms_versions_type_language_current: { table: "terms_versions", unique: false, columns: ["terms_type", "language", "is_current"] },
  uniq_terms_acceptance_user_doc_version: { table: "terms_acceptances", unique: true, columns: ["user_id", "terms_type", "language", "version", "content_hash"] },
  idx_terms_acceptances_user: { table: "terms_acceptances", unique: false, columns: ["user_id"] },
};

function normalizeDefault(value: string | null): string | null {
  if (value === null) return null;
  let normalized = value.toLowerCase().replace(/::character varying/g, "").replace(/\s+/g, "");
  while (normalized.startsWith("(") && normalized.endsWith(")")) normalized = normalized.slice(1, -1);
  return normalized;
}

function hasExpectedColumns(rows: ColumnRow[], table: keyof typeof expectedColumns): boolean {
  const expected = expectedColumns[table];
  if (rows.length !== expected.length) return false;
  return expected.every(([name, type, nullable, defaultValue]) => {
    const actual = rows.find((row) => row.column_name === name);
    return Boolean(actual && actual.data_type === type && actual.is_nullable === nullable && normalizeDefault(actual.column_default) === defaultValue);
  });
}

function normalizedIndexDefinition(value: string) {
  return value.toLowerCase().replace(/[\s"]/g, "");
}

function hasExpectedIndexes(rows: Array<{ indexname: string; tablename: string; indexdef: string }>): boolean {
  return Object.entries(expectedIndexes).every(([name, expected]) => {
    const actual = rows.find((row) => row.indexname === name && row.tablename === expected.table);
    if (!actual) return false;
    const definition = normalizedIndexDefinition(actual.indexdef);
    const columns = `(${expected.columns.join(",")})`;
    return definition.includes(columns) && (expected.unique ? definition.includes("createuniqueindex") : !definition.includes("createuniqueindex"));
  });
}

export async function inspectTermsLedgerCatalog(queryable: TermsLedgerCatalogQueryable): Promise<TermsLedgerCatalogState> {
  await queryable.query("SELECT 1 AS terms_ledger_probe");
  const tables = await queryable.query<{ table_name: string }>("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('terms_versions', 'terms_acceptances')");
  const names = new Set(tables.rows.map((row) => row.table_name));
  if (names.size === 0) return "absent";
  if (names.size !== 2 || !names.has("terms_versions") || !names.has("terms_acceptances")) return "partial";

  const columns = await queryable.query<ColumnRow>("SELECT table_name, column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('terms_versions', 'terms_acceptances')");
  if (!hasExpectedColumns(columns.rows.filter((row) => row.table_name === "terms_versions"), "terms_versions") ||
      !hasExpectedColumns(columns.rows.filter((row) => row.table_name === "terms_acceptances"), "terms_acceptances")) return "partial";

  const primaryKeys = await queryable.query<{ table_name: string; column_name: string }>("SELECT tc.table_name, kcu.column_name FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage kcu ON tc.constraint_name=kcu.constraint_name AND tc.table_schema=kcu.table_schema WHERE tc.table_schema='public' AND tc.constraint_type='PRIMARY KEY' AND tc.table_name IN ('terms_versions', 'terms_acceptances')");
  if (!["terms_versions", "terms_acceptances"].every((table) => primaryKeys.rows.filter((row) => row.table_name === table).length === 1 && primaryKeys.rows.find((row) => row.table_name === table)?.column_name === "id")) return "partial";

  const indexes = await queryable.query<{ indexname: string; tablename: string; indexdef: string }>("SELECT indexname, tablename, indexdef FROM pg_indexes WHERE schemaname='public' AND indexname IN ('uniq_terms_versions_storage_key_version', 'idx_terms_versions_type_language_current', 'uniq_terms_acceptance_user_doc_version', 'idx_terms_acceptances_user')");
  if (!hasExpectedIndexes(indexes.rows) || indexes.rows.length !== Object.keys(expectedIndexes).length) return "partial";

  const foreignKeys = await queryable.query<{ definition: string }>("SELECT pg_get_constraintdef(c.oid) AS definition FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='public' AND t.relname='terms_acceptances' AND c.contype='f'");
  const expectedForeignKey = "foreign key (user_id) references users(id) on delete cascade";
  if (foreignKeys.rows.length !== 1 || foreignKeys.rows[0]?.definition.toLowerCase().replace(/[\s"]/g, "") !== expectedForeignKey.replace(/\s/g, "")) return "partial";

  return "complete";
}

let cachedHealth: { expiresAt: number; state: TermsLedgerHealthState } | null = null;
const HEALTH_CACHE_MS = 10_000;

export async function getTermsLedgerHealth(queryable: TermsLedgerCatalogQueryable, now = Date.now()): Promise<TermsLedgerHealthState> {
  if (cachedHealth && cachedHealth.expiresAt > now) return cachedHealth.state;
  let state: TermsLedgerHealthState = "unavailable";
  try {
    state = (await inspectTermsLedgerCatalog(queryable)) === "complete" ? "available" : "unavailable";
  } catch {
    state = "unavailable";
  }
  cachedHealth = { state, expiresAt: now + HEALTH_CACHE_MS };
  return state;
}

export function resetTermsLedgerHealthCacheForTests() {
  cachedHealth = null;
}
