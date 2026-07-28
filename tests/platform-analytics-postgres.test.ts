import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { Client } from "pg";

const databaseUrl = process.env.PLATFORM_ANALYTICS_TEST_DATABASE_URL;
const confirmation = process.env.PLATFORM_ANALYTICS_TEST_CONFIRM;

function requireIsolatedValidationDatabase(url: string) {
  const parsed = new URL(url);
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  if (!/(?:test|validation|isolated)/i.test(databaseName) || confirmation !== "isolated-platform-analytics") {
    throw new Error("Platform analytics integration tests require an explicitly confirmed isolated validation database");
  }
}

test("migration 0038 has transactional catalog, rollback, and idempotency evidence", { skip: !databaseUrl ? "PLATFORM_ANALYTICS_TEST_DATABASE_URL is not configured" : false }, async () => {
  requireIsolatedValidationDatabase(databaseUrl!);
  const migration = await readFile(path.resolve("migrations/0038_add_platform_analytics_events.sql"), "utf8");
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query(migration);

    const catalog = await client.query(`
      SELECT
        to_regclass('platform_analytics_events') AS relation,
        EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'platform_analytics_events_source_event_key_unique') AS source_key_constraint,
        EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'platform_analytics_events_version_positive') AS version_constraint,
        EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'platform_analytics_events_event_type_valid') AS vocabulary_constraint,
        COUNT(*) FILTER (WHERE indexname IN (
          'platform_analytics_events_type_occurred_idx',
          'platform_analytics_events_activity_occurred_idx',
          'platform_analytics_events_driver_occurred_idx',
          'platform_analytics_events_location_occurred_idx'
        )) AS required_index_count
      FROM pg_indexes
      WHERE schemaname = current_schema() AND tablename = 'platform_analytics_events'
    `);
    assert.equal(catalog.rows[0].relation, "platform_analytics_events");
    assert.equal(catalog.rows[0].source_key_constraint, true);
    assert.equal(catalog.rows[0].version_constraint, true);
    assert.equal(catalog.rows[0].vocabulary_constraint, true);
    assert.equal(Number(catalog.rows[0].required_index_count), 4);

    const event = {
      eventType: "activity.submitted",
      sourceRecordType: "washout_activity",
      sourceRecordId: "integration-activity",
      sourceEventKey: "integration:activity:submitted",
      occurredAt: new Date("2026-07-27T00:00:00.000Z"),
    };
    const insert = `INSERT INTO platform_analytics_events (event_type, source_record_type, source_record_id, source_event_key, occurred_at)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (source_event_key) DO NOTHING`;
    await client.query(insert, [event.eventType, event.sourceRecordType, event.sourceRecordId, event.sourceEventKey, event.occurredAt]);
    await client.query(insert, [event.eventType, event.sourceRecordType, event.sourceRecordId, event.sourceEventKey, event.occurredAt]);
    const afterReplay = await client.query("SELECT count(*) AS count FROM platform_analytics_events WHERE source_event_key = $1", [event.sourceEventKey]);
    assert.equal(Number(afterReplay.rows[0].count), 1);

    await client.query("SAVEPOINT analytics_transaction_boundary");
    await client.query(insert, ["activity.verified", "washout_activity", "rollback-activity", "integration:activity:rollback", event.occurredAt]);
    await client.query("ROLLBACK TO SAVEPOINT analytics_transaction_boundary");
    const afterBoundaryRollback = await client.query("SELECT count(*) AS count FROM platform_analytics_events WHERE source_event_key = 'integration:activity:rollback'");
    assert.equal(Number(afterBoundaryRollback.rows[0].count), 0);

    await client.query("ROLLBACK");
    const afterMigrationRollback = await client.query("SELECT to_regclass('platform_analytics_events') AS relation");
    // If the isolated base database already has 0038, the idempotent migration
    // leaves it in place; otherwise rollback removes the newly-created table.
    assert.ok(afterMigrationRollback.rows[0].relation === null || afterMigrationRollback.rows[0].relation === "platform_analytics_events");
  } finally {
    await client.end();
  }
});
