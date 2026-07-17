import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { Client } from "pg";

const enabled = process.env.CANONICAL_FINANCIAL_PG_INTEGRATION === "1";

test("PostgreSQL enforces the canonical partial activity-obligation boundary", {
  skip: enabled ? undefined : "Set CANONICAL_FINANCIAL_PG_INTEGRATION=1 with an isolated financial_validation_* DATABASE_URL.",
}, async () => {
  assert.notEqual(process.env.NODE_ENV, "production", "integration testing must never run in production mode");
  const connectionString = process.env.DATABASE_URL?.trim();
  assert.ok(connectionString, "an explicit isolated DATABASE_URL is required");

  const client = new Client({ connectionString, ssl: { rejectUnauthorized: true } });
  await client.connect();
  const schema = `canonical_financial_index_${randomUUID().replaceAll("-", "")}`;
  try {
    const database = String((await client.query("SELECT current_database() AS name")).rows[0]?.name || "");
    assert.match(database, /^financial_validation_[a-z0-9_]+$/, "refusing a non-isolated validation database");

    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`
      CREATE TABLE "${schema}".payments (
        id text PRIMARY KEY,
        activity_id text,
        obligation_kind text,
        obligation_created_by text,
        obligation_creation_reason text
      )
    `);
    await client.query(`CREATE UNIQUE INDEX CONCURRENTLY "${schema}_global_activity" ON "${schema}".payments (activity_id)`);

    const { deriveFinancialSchemaCapabilities } = await import("../server/financialSchemaCapabilities");
    const catalog = async () => (await client.query(`
      SELECT indexrel.relname AS index_name, i.indisunique AS is_unique,
             i.indisvalid AS is_valid, i.indisready AS is_ready,
             i.indnkeyatts AS key_count,
             pg_get_indexdef(i.indexrelid, 1, true) AS first_key,
             pg_get_expr(i.indpred, i.indrelid) AS predicate
      FROM pg_class table_rel
      JOIN pg_namespace ns ON ns.oid = table_rel.relnamespace
      JOIN pg_index i ON i.indrelid = table_rel.oid
      JOIN pg_class indexrel ON indexrel.oid = i.indexrelid
      WHERE ns.nspname = '${schema}' AND table_rel.relname = 'payments'
    `)).rows;
    const columns = ["obligation_created_by", "obligation_creation_reason", "obligation_kind"];

    assert.equal(deriveFinancialSchemaCapabilities(columns, await catalog()).schemaState, "canonical_index_pending");
    await client.query(`
      CREATE UNIQUE INDEX CONCURRENTLY "uniq_payments_canonical_verified_activity_obligation"
      ON "${schema}".payments (activity_id)
      WHERE activity_id IS NOT NULL AND obligation_kind = 'canonical_verified_activity_v1'
    `);
    assert.equal(deriveFinancialSchemaCapabilities(columns, await catalog()).schemaState, "transitional");

    await client.query(`DROP INDEX CONCURRENTLY "${schema}"."${schema}_global_activity"`);
    const finalCapabilities = deriveFinancialSchemaCapabilities(columns, await catalog());
    assert.equal(finalCapabilities.schemaState, "canonical_ready");
    assert.equal(finalCapabilities.creationAvailable, true);

    await client.query(`INSERT INTO "${schema}".payments (id, activity_id) VALUES ('legacy_b', 'activity_b')`);
    const first = await client.query(`
      INSERT INTO "${schema}".payments (id, activity_id, obligation_kind, obligation_created_by, obligation_creation_reason)
      VALUES ('canonical_a', 'activity_a', 'canonical_verified_activity_v1', 'admin', 'synthetic test')
      ON CONFLICT (activity_id)
      WHERE activity_id IS NOT NULL AND obligation_kind = 'canonical_verified_activity_v1'
      DO NOTHING
      RETURNING id
    `);
    const retry = await client.query(`
      INSERT INTO "${schema}".payments (id, activity_id, obligation_kind)
      VALUES ('canonical_a_retry', 'activity_a', 'canonical_verified_activity_v1')
      ON CONFLICT (activity_id)
      WHERE activity_id IS NOT NULL AND obligation_kind = 'canonical_verified_activity_v1'
      DO NOTHING
      RETURNING id
    `);
    const coexist = await client.query(`
      INSERT INTO "${schema}".payments (id, activity_id, obligation_kind)
      VALUES ('canonical_b', 'activity_b', 'canonical_verified_activity_v1')
      ON CONFLICT (activity_id)
      WHERE activity_id IS NOT NULL AND obligation_kind = 'canonical_verified_activity_v1'
      DO NOTHING
      RETURNING id
    `);
    assert.equal(first.rowCount, 1, "the exact partial-index arbiter must accept a first canonical obligation");
    assert.equal(retry.rowCount, 0, "the exact partial-index arbiter must make retry idempotent");
    assert.equal(coexist.rowCount, 1, "a legacy row must not consume the canonical uniqueness slot");
  } finally {
    await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`).catch(() => {});
    await client.end();
  }
});
