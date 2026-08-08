import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import pg from "pg";

const databaseUrl = process.env.GEOFENCE_TEST_DATABASE_URL;

test("0041 rolls back, reapplies cleanly, constrains scope, and retains append-only audit evidence", {
  skip: databaseUrl ? false : "GEOFENCE_TEST_DATABASE_URL is required for isolated persistence validation",
}, async () => {
  assert.ok(databaseUrl);
  const client = new pg.Client({ connectionString: databaseUrl, ssl: false });
  await client.connect();
  try {
    await client.query(`
      CREATE TABLE users (id varchar PRIMARY KEY);
      CREATE TABLE owners (id varchar PRIMARY KEY, user_id varchar NOT NULL REFERENCES users(id));
      CREATE TABLE washout_locations (
        id varchar PRIMARY KEY,
        owner_id varchar NOT NULL REFERENCES owners(id)
      );
      CREATE TABLE feature_flags (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        flag_key varchar NOT NULL UNIQUE,
        enabled boolean NOT NULL DEFAULT false,
        description text,
        allowed_roles text[],
        created_at timestamp DEFAULT now(),
        updated_at timestamp DEFAULT now()
      );
      INSERT INTO users(id) VALUES ('admin-1'), ('super-admin-1'), ('owner-user');
      INSERT INTO owners(id, user_id) VALUES ('owner-1', 'owner-user');
      INSERT INTO washout_locations(id, owner_id)
        VALUES ('facility-a', 'owner-1'), ('facility-b', 'owner-1');
      INSERT INTO feature_flags(flag_key, enabled, allowed_roles) VALUES
        ('geofence_submission_enforcement', false, ARRAY['driver']::text[]),
        ('geofence_notifications', false, ARRAY[]::text[]),
        ('geofence_legacy_transition', false, ARRAY[]::text[]),
        ('wallet_funding', false, ARRAY[]::text[]);
    `);

    const migration = await readFile(
      new URL("../migrations/0041_add_facility_scoped_geofence_feature_controls.sql", import.meta.url),
      "utf8",
    );

    await client.query("BEGIN");
    await client.query(migration);
    assert.equal((await client.query("SELECT to_regclass('facility_feature_flag_overrides')::text AS name")).rows[0].name, "facility_feature_flag_overrides");
    await client.query("ROLLBACK");
    assert.equal((await client.query("SELECT to_regclass('facility_feature_flag_overrides')::text AS name")).rows[0].name, null);

    await client.query(migration);
    assert.equal((await client.query("SELECT count(*)::int AS count FROM facility_feature_flag_overrides")).rows[0].count, 0);

    await client.query(`
      INSERT INTO facility_feature_flag_overrides (
        id, location_id, flag_key, enabled, reason, updated_by
      ) VALUES (
        'override-a', 'facility-a', 'geofence_submission_enforcement', true,
        'Founder-authorized controlled pilot', 'admin-1'
      );
      INSERT INTO facility_feature_flag_override_events (
        id, location_id, flag_key, actor_user_id, actor_role, reason,
        prior_enabled, new_enabled, request_id, idempotency_key
      ) VALUES (
        'event-a', 'facility-a', 'geofence_submission_enforcement', 'admin-1', 'admin',
        'Founder-authorized controlled pilot', false, true, 'request-a', 'request-a:facility-a:enforcement'
      );
    `);

    await assert.rejects(
      client.query(`
        INSERT INTO facility_feature_flag_overrides (
          location_id, flag_key, enabled, reason, updated_by
        ) VALUES (
          'facility-a', 'geofence_submission_enforcement', false,
          'Duplicate row', 'admin-1'
        )
      `),
      /facility_feature_flag_overrides_location_flag_unique/,
    );
    await assert.rejects(
      client.query(`
        INSERT INTO facility_feature_flag_overrides (
          location_id, flag_key, enabled, reason, updated_by
        ) VALUES ('facility-b', 'wallet_funding', true, 'Disallowed control', 'admin-1')
      `),
      /facility_feature_flag_overrides_flag_allowed/,
    );
    await assert.rejects(
      client.query("UPDATE facility_feature_flag_override_events SET reason = 'Changed' WHERE id = 'event-a'"),
      /append-only/,
    );
    await assert.rejects(
      client.query("DELETE FROM facility_feature_flag_override_events WHERE id = 'event-a'"),
      /append-only/,
    );

    await client.query("BEGIN");
    try {
      await client.query(`
        INSERT INTO facility_feature_flag_overrides (
          id, location_id, flag_key, enabled, reason, updated_by
        ) VALUES (
          'override-b', 'facility-b', 'geofence_notifications', true,
          'Rollback exercise', 'super-admin-1'
        )
      `);
      await client.query(`
        INSERT INTO facility_feature_flag_override_events (
          location_id, flag_key, actor_user_id, actor_role, reason,
          prior_enabled, new_enabled, request_id, idempotency_key
        ) VALUES (
          'facility-b', 'geofence_notifications', 'owner-user', 'owner',
          'Unauthorized actor exercise', false, true, 'request-b', 'request-b:facility-b:notifications'
        )
      `);
      assert.fail("Owner audit actor must be rejected");
    } catch {
      await client.query("ROLLBACK");
    }
    assert.equal((await client.query("SELECT count(*)::int AS count FROM facility_feature_flag_overrides WHERE location_id = 'facility-b'")).rows[0].count, 0);

    await client.query("UPDATE facility_feature_flag_overrides SET enabled = false WHERE enabled");
    await client.query("UPDATE feature_flags SET enabled = false WHERE flag_key LIKE 'geofence_%'");
    const recovery = await client.query(`
      SELECT
        (SELECT count(*)::int FROM facility_feature_flag_overrides WHERE enabled) AS enabled_overrides,
        (SELECT count(*)::int FROM feature_flags WHERE flag_key LIKE 'geofence_%' AND enabled) AS enabled_globals,
        (SELECT count(*)::int FROM facility_feature_flag_override_events) AS retained_events
    `);
    assert.deepEqual(recovery.rows[0], { enabled_overrides: 0, enabled_globals: 0, retained_events: 1 });

    await client.query("DROP TABLE facility_feature_flag_override_events, facility_feature_flag_overrides");
    await client.query("DROP FUNCTION reject_facility_feature_flag_audit_mutation()");
    await client.query(migration);
    assert.equal((await client.query("SELECT count(*)::int AS count FROM facility_feature_flag_overrides")).rows[0].count, 0);
    assert.equal((await client.query("SELECT count(*)::int AS count FROM facility_feature_flag_override_events")).rows[0].count, 0);
  } finally {
    await client.end();
  }
});
