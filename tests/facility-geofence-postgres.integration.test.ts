import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import pg from "pg";

const databaseUrl = process.env.GEOFENCE_TEST_DATABASE_URL;

test("0040 dry-runs, rolls back, reapplies, and preserves disabled recovery in isolated PostgreSQL", {
  skip: databaseUrl ? false : "GEOFENCE_TEST_DATABASE_URL is required for isolated persistence validation",
}, async () => {
  assert.ok(databaseUrl);
  const client = new pg.Client({ connectionString: databaseUrl, ssl: false });
  await client.connect();
  try {
    await client.query(`
      CREATE TABLE users (id varchar PRIMARY KEY);
      CREATE TABLE owners (
        id varchar PRIMARY KEY,
        user_id varchar NOT NULL REFERENCES users(id)
      );
      CREATE TABLE washout_locations (
        id varchar PRIMARY KEY,
        owner_id varchar NOT NULL REFERENCES owners(id)
      );
      CREATE TABLE drivers (
        id varchar PRIMARY KEY,
        user_id varchar NOT NULL REFERENCES users(id)
      );
      CREATE TABLE washout_activities (
        id varchar PRIMARY KEY,
        driver_id varchar NOT NULL REFERENCES drivers(id),
        location_id varchar NOT NULL REFERENCES washout_locations(id)
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
      INSERT INTO users(id) VALUES ('owner-user'), ('driver-user');
      INSERT INTO owners(id, user_id) VALUES ('owner-1', 'owner-user');
      INSERT INTO washout_locations(id, owner_id) VALUES ('facility-1', 'owner-1');
      INSERT INTO drivers(id, user_id) VALUES ('driver-1', 'driver-user');
      INSERT INTO washout_activities(id, driver_id, location_id)
        VALUES ('activity-1', 'driver-1', 'facility-1');
    `);

    const migration = await readFile(
      new URL("../migrations/0040_add_canonical_facility_geofence_foundation.sql", import.meta.url),
      "utf8",
    );

    await client.query("BEGIN");
    await client.query(migration);
    const dryRunTable = await client.query<{ table_name: string | null }>(
      "SELECT to_regclass('public.facility_geofence_boundaries')::text AS table_name",
    );
    assert.equal(dryRunTable.rows[0].table_name, "facility_geofence_boundaries");
    await client.query("ROLLBACK");
    const rolledBackTable = await client.query<{ table_name: string | null }>(
      "SELECT to_regclass('public.facility_geofence_boundaries')::text AS table_name",
    );
    assert.equal(rolledBackTable.rows[0].table_name, null);

    await client.query(migration);
    const initialBoundaries = await client.query<{ count: string }>("SELECT count(*)::text AS count FROM facility_geofence_boundaries");
    assert.equal(initialBoundaries.rows[0].count, "0");

    const flags = await client.query<{ flag_key: string; enabled: boolean }>(
      "SELECT flag_key, enabled FROM feature_flags WHERE flag_key LIKE 'geofence_%' ORDER BY flag_key",
    );
    assert.equal(flags.rowCount, 5);
    assert.ok(flags.rows.every((row) => row.enabled === false));

    await client.query(`
      INSERT INTO facility_geofence_boundaries (
        id, location_id, zone_key, version, mode,
        center_latitude, center_longitude, radius_meters,
        exception_distance_meters, geometry_checksum, status, created_by
      ) VALUES (
        'boundary-v1', 'facility-1', 'primary', 1, 'radius',
        30.00000000, -97.00000000, 100.000,
        1609.344, repeat('a', 64), 'draft', 'owner-user'
      )
    `);
    await assert.rejects(
      client.query(`
        INSERT INTO facility_geofence_boundaries (
          location_id, zone_key, version, mode,
          center_latitude, center_longitude, radius_meters,
          exception_distance_meters, geometry_checksum, status
        ) VALUES (
          'facility-1', 'primary', 1, 'radius',
          30.00000000, -97.00000000, 50.000,
          1609.344, repeat('b', 64), 'draft'
        )
      `),
      /facility_geofence_boundaries_location_zone_version_unique/,
    );

    await client.query(`
      UPDATE facility_geofence_boundaries
      SET status = 'active',
          effective_from = '2026-08-04T18:00:00Z',
          activated_at = '2026-08-04T18:00:00Z',
          activated_by = 'owner-user'
      WHERE id = 'boundary-v1'
    `);
    await assert.rejects(
      client.query("UPDATE facility_geofence_boundaries SET radius_meters = 200 WHERE id = 'boundary-v1'"),
      /Activated Facility geofence boundary version content is immutable/,
    );

    await client.query(`
      INSERT INTO facility_geofence_revision_events (
        id, location_id, boundary_version_id, event_type, actor_user_id,
        actor_role, reason_code, request_id, idempotency_key
      ) VALUES (
        'revision-1', 'facility-1', 'boundary-v1', 'activated', 'owner-user',
        'owner', 'OWNER_ACTIVATED', 'request-1', 'boundary-v1:activated'
      )
    `);
    await assert.rejects(
      client.query("UPDATE facility_geofence_revision_events SET reason_code = 'CHANGED' WHERE id = 'revision-1'"),
      /append-only/,
    );

    await client.query(`
      INSERT INTO activity_geofence_evaluations (
        id, activity_id, location_id, boundary_version_id, boundary_version,
        evaluation_purpose, result_state, reason_code,
        observation_latitude, observation_longitude, accuracy_meters,
        observed_at, evaluated_at, signed_distance_meters,
        outside_distance_meters, exception_distance_meters,
        evidence_complete, idempotency_key
      ) VALUES (
        'evaluation-1', 'activity-1', 'facility-1', 'boundary-v1', 1,
        'submission', 'INSIDE_APPROVED_BOUNDARY', 'INSIDE_APPROVED_BOUNDARY',
        30.00000000, -97.00000000, 5.000,
        '2026-08-04T18:00:00Z', '2026-08-04T18:00:01Z', -50.000,
        0.000, 1609.344, true, 'activity-1:submission:boundary-v1'
      )
    `);
    const evaluation = await client.query<{ boundary_version_id: string; boundary_version: number }>(
      "SELECT boundary_version_id, boundary_version FROM activity_geofence_evaluations WHERE id = 'evaluation-1'",
    );
    assert.deepEqual(evaluation.rows[0], { boundary_version_id: "boundary-v1", boundary_version: 1 });
    await assert.rejects(
      client.query(`
        INSERT INTO activity_geofence_evaluations (
          id, activity_id, location_id, boundary_version_id, boundary_version,
          evaluation_purpose, result_state, reason_code, evaluated_at,
          evidence_complete, idempotency_key
        ) VALUES (
          'evaluation-duplicate', 'activity-1', 'facility-1', 'boundary-v1', 1,
          'submission', 'INSIDE_APPROVED_BOUNDARY', 'INSIDE_APPROVED_BOUNDARY', now(),
          true, 'activity-1:submission:boundary-v1'
        )
      `),
      /activity_geofence_evaluations_idempotency_key/i,
    );

    await client.query("BEGIN");
    try {
      await client.query("INSERT INTO washout_activities(id, driver_id, location_id) VALUES ('activity-retry', 'driver-1', 'facility-1')");
      await client.query(`
        INSERT INTO activity_geofence_evaluations (
          id, activity_id, location_id, boundary_version_id, boundary_version,
          evaluation_purpose, result_state, reason_code, evaluated_at,
          evidence_complete, idempotency_key
        ) VALUES (
          'evaluation-retry', 'activity-retry', 'facility-1', 'boundary-v1', 1,
          'submission', 'INSIDE_APPROVED_BOUNDARY', 'INSIDE_APPROVED_BOUNDARY', now(),
          true, 'activity-1:submission:boundary-v1'
        )
      `);
      assert.fail("duplicate submission idempotency key must fail");
    } catch {
      await client.query("ROLLBACK");
    }
    const rolledBackRetry = await client.query<{ count: string }>("SELECT count(*)::text AS count FROM washout_activities WHERE id = 'activity-retry'");
    assert.equal(rolledBackRetry.rows[0].count, "0");
    await assert.rejects(
      client.query("DELETE FROM activity_geofence_evaluations WHERE id = 'evaluation-1'"),
      /append-only/,
    );

    // Application recovery is non-destructive: keep evidence and force every
    // geofence control off. This mirrors the governed rollback posture.
    await client.query("UPDATE feature_flags SET enabled = false WHERE flag_key LIKE 'geofence_%'");
    const retained = await client.query<{ evaluations: string; revisions: string; enabled: string }>(`
      SELECT
        (SELECT count(*)::text FROM activity_geofence_evaluations) AS evaluations,
        (SELECT count(*)::text FROM facility_geofence_revision_events) AS revisions,
        (SELECT count(*)::text FROM feature_flags WHERE flag_key LIKE 'geofence_%' AND enabled) AS enabled
    `);
    assert.deepEqual(retained.rows[0], { evaluations: "1", revisions: "1", enabled: "0" });
  } finally {
    await client.end();
  }
});
