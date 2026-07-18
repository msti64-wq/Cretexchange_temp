import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { Client } from "pg";

const enabled = process.env.CANONICAL_FINANCIAL_PG_INTEGRATION === "1";

function isolatedDatabaseName(connectionString: string): string {
  try {
    return decodeURIComponent(new URL(connectionString).pathname.replace(/^\/+/, ""));
  } catch {
    throw new Error("an explicit PostgreSQL URL for an isolated financial_validation_* database is required");
  }
}

test("PostgreSQL applies 0025 in autocommit mode and preserves the canonical partial activity-obligation boundary", {
  skip: enabled ? undefined : "Set CANONICAL_FINANCIAL_PG_INTEGRATION=1 with an isolated financial_validation_* DATABASE_URL.",
}, async () => {
  assert.notEqual(process.env.NODE_ENV, "production", "integration testing must never run in production mode");
  const connectionString = process.env.DATABASE_URL?.trim();
  assert.ok(connectionString, "an explicit isolated DATABASE_URL is required");
  assert.match(isolatedDatabaseName(connectionString), /^financial_validation_[a-z0-9_]+$/, "refusing a non-isolated validation database before connecting");

  const client = new Client({ connectionString, ssl: { rejectUnauthorized: true } });
  await client.connect();
  try {
    const database = String((await client.query("SELECT current_database() AS name")).rows[0]?.name || "");
    assert.match(database, /^financial_validation_[a-z0-9_]+$/, "refusing a non-isolated validation database");

    const [bootstrap, migration] = await Promise.all([
      readFile(new URL("../scripts/bootstrap-financial-schema-rehearsal.sql", import.meta.url), "utf8"),
      readFile(new URL("../migrations/0025_retire_global_payment_activity_uniqueness.sql", import.meta.url), "utf8"),
    ]);
    await client.query(bootstrap);

    const catalog = async () => (await client.query(`
      SELECT indexrel.relname AS index_name, i.indisunique AS is_unique,
             i.indisvalid AS is_valid, i.indisready AS is_ready,
             i.indnkeyatts AS key_count, i.indnatts AS attribute_count,
             i.indexprs IS NULL AS no_expression_keys,
             pg_get_indexdef(i.indexrelid, 1, true) AS first_key,
             pg_get_expr(i.indpred, i.indrelid) AS predicate
      FROM pg_class table_rel
      JOIN pg_namespace ns ON ns.oid = table_rel.relnamespace
      JOIN pg_index i ON i.indrelid = table_rel.oid
      JOIN pg_class indexrel ON indexrel.oid = i.indexrelid
      WHERE ns.nspname = 'public' AND table_rel.relname = 'payments'
      ORDER BY indexrel.relname
    `)).rows;
    const columns = ["obligation_created_by", "obligation_creation_reason", "obligation_kind"];
    const snapshotPayments = async () => (await client.query(`
      SELECT id, activity_id, obligation_kind, amount::text, processing_fee::text,
             washout_service_fee::text, status, batch_id, paid_at,
             stripe_payment_intent_id, stripe_transfer_id, stripe_charge_id,
             obligation_created_by, obligation_creation_reason
      FROM payments
      ORDER BY id
    `)).rows;
    const historicalIndex = "uniq_payments_activity_obligation";
    const canonicalIndex = "uniq_payments_canonical_verified_activity_obligation";

    const beforeCatalog = await catalog();
    assert.ok(beforeCatalog.some((index) => index.index_name === historicalIndex), "bootstrap must begin with the historical global index");
    assert.ok(!beforeCatalog.some((index) => index.index_name === canonicalIndex), "0024 is represented by the canonical index created below");
    await client.query(`
      CREATE UNIQUE INDEX CONCURRENTLY "${canonicalIndex}"
      ON public.payments (activity_id)
      WHERE activity_id IS NOT NULL AND obligation_kind = 'canonical_verified_activity_v1'
    `);

    const transitionalCatalog = await catalog();
    assert.ok(transitionalCatalog.some((index) => index.index_name === historicalIndex), "both indexes must coexist before 0025");
    assert.ok(transitionalCatalog.some((index) => index.index_name === canonicalIndex), "the canonical partial index must exist before 0025");
    const { deriveFinancialSchemaCapabilities } = await import("../server/financialSchemaCapabilities");
    assert.equal(deriveFinancialSchemaCapabilities(columns, transitionalCatalog).schemaState, "transitional");
    const paymentSnapshotBefore0025 = await snapshotPayments();

    const dropStatement = 'DROP INDEX CONCURRENTLY "public"."uniq_payments_activity_obligation";';
    const [preDropAssertions, postDropAssertions, unexpected] = migration.split(dropStatement);
    assert.ok(preDropAssertions && postDropAssertions && unexpected === undefined, "0025 must have one independently executed concurrent drop");
    await client.query(preDropAssertions);
    await client.query(dropStatement);
    await client.query(postDropAssertions);

    const finalCatalog = await catalog();
    assert.ok(!finalCatalog.some((index) => index.index_name === historicalIndex), "0025 must retire the historical global index");
    const finalCanonical = finalCatalog.find((index) => index.index_name === canonicalIndex);
    assert.ok(finalCanonical, "0025 must retain the canonical partial index");
    assert.equal(finalCanonical.is_unique, true);
    assert.equal(finalCanonical.is_valid, true);
    assert.equal(finalCanonical.is_ready, true);
    assert.equal(finalCanonical.key_count, 1);
    assert.equal(finalCanonical.attribute_count, 1);
    assert.equal(finalCanonical.no_expression_keys, true);
    assert.equal(finalCanonical.first_key, "activity_id");
    assert.match(String(finalCanonical.predicate), /activity_id IS NOT NULL/i);
    assert.match(String(finalCanonical.predicate), /obligation_kind.*canonical_verified_activity_v1/i);
    const finalCapabilities = deriveFinancialSchemaCapabilities(columns, finalCatalog);
    assert.equal(finalCapabilities.schemaState, "canonical_ready");
    assert.equal(finalCapabilities.creationAvailable, true);
    assert.deepEqual(await snapshotPayments(), paymentSnapshotBefore0025, "0025 must not mutate existing payment values");

    const retry = await client.query(`
      INSERT INTO payments (id, driver_id, owner_id, activity_id, amount, processing_fee, washout_service_fee, status, obligation_kind)
      VALUES ('payment_c_canonical_retry', 'driver_synth', 'owner_synth', 'activity_c', 12.00, 5.00, 12.00, 'pending', 'canonical_verified_activity_v1')
      ON CONFLICT (activity_id)
      WHERE activity_id IS NOT NULL AND obligation_kind = 'canonical_verified_activity_v1'
      DO NOTHING
      RETURNING id
    `);
    assert.equal(retry.rowCount, 0, "the exact partial index must make a canonical retry idempotent");

    await client.query(`
      INSERT INTO washout_activities (id, driver_id, location_id, status, amount) VALUES
        ('activity_e', 'driver_synth', 'location_synth', 'verified', 14.00),
        ('activity_f', 'driver_synth', 'location_synth', 'verified', 15.00)
    `);
    const coexist = await client.query(`
      INSERT INTO payments (id, driver_id, owner_id, activity_id, amount, processing_fee, washout_service_fee, status, obligation_kind)
      VALUES ('payment_b_canonical', 'driver_synth', 'owner_synth', 'activity_b', 11.00, 5.00, 11.00, 'pending', 'canonical_verified_activity_v1')
      ON CONFLICT (activity_id)
      WHERE activity_id IS NOT NULL AND obligation_kind = 'canonical_verified_activity_v1'
      DO NOTHING
      RETURNING id
    `);
    assert.equal(coexist.rowCount, 1, "legacy and canonical rows may coexist technically after global-index retirement");
    await client.query(`
      INSERT INTO payments (id, driver_id, owner_id, activity_id, amount, processing_fee, washout_service_fee, status, obligation_kind)
      VALUES ('payment_e_unknown', 'driver_synth', 'owner_synth', 'activity_e', 14.00, 5.00, 14.00, 'pending', 'future_obligation_version')
    `);
    const canonicalAfterUnknown = await client.query(`
      INSERT INTO payments (id, driver_id, owner_id, activity_id, amount, processing_fee, washout_service_fee, status, obligation_kind)
      VALUES ('payment_e_canonical', 'driver_synth', 'owner_synth', 'activity_e', 14.00, 5.00, 14.00, 'pending', 'canonical_verified_activity_v1')
      ON CONFLICT (activity_id)
      WHERE activity_id IS NOT NULL AND obligation_kind = 'canonical_verified_activity_v1'
      DO NOTHING
      RETURNING id
    `);
    assert.equal(canonicalAfterUnknown.rowCount, 1, "unknown obligation kinds must not consume canonical uniqueness");
  } finally {
    await client.query(`
      DROP TABLE IF EXISTS financial_batch_exceptions, financial_batch_audit_events,
        financial_batch_memberships, billing_batches, payments, washout_activities,
        washout_locations, owners, drivers, users CASCADE
    `).catch(() => {});
    await client.end();
  }
});
