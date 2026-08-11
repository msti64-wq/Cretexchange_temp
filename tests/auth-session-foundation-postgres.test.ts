import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { Client } from "pg";

const databaseUrl = process.env.AUTH_SESSION_TEST_DATABASE_URL;
const confirmation = process.env.AUTH_SESSION_TEST_CONFIRM;

function requireDisposableDatabase(url: string) {
  const databaseName = decodeURIComponent(new URL(url).pathname.replace(/^\//, ""));
  if (!/(?:test|validation|isolated)/i.test(databaseName) || confirmation !== "isolated-auth-session") {
    throw new Error("Authentication integration tests require an explicitly confirmed disposable database");
  }
}

const hash = (value: string) => value.repeat(64).slice(0, 64);

test("0042 validates rollback, clean reapplication, constraints, append-only audit, retention, and concurrency", {
  skip: !databaseUrl ? "AUTH_SESSION_TEST_DATABASE_URL is not configured" : false,
}, async () => {
  requireDisposableDatabase(databaseUrl!);
  const migration = await readFile(new URL("../migrations/0042_add_revocable_authentication_session_foundation.sql", import.meta.url), "utf8");
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public");
    await client.query("CREATE EXTENSION IF NOT EXISTS pgcrypto");
    await client.query("CREATE TABLE users (id varchar PRIMARY KEY DEFAULT gen_random_uuid())");

    await client.query("BEGIN");
    await client.query(migration);
    assert.equal(Number((await client.query("SELECT count(*) AS value FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'auth_%'")).rows[0].value), 4);
    await client.query("ROLLBACK");
    assert.equal(Number((await client.query("SELECT count(*) AS value FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'auth_%'")).rows[0].value), 0);

    await client.query(migration);
    await client.query(migration);

    const tables = await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'auth_%' ORDER BY table_name");
    assert.deepEqual(tables.rows.map((row) => row.table_name), [
      "auth_password_reset_tokens",
      "auth_rate_limit_buckets",
      "auth_security_events",
      "auth_sessions",
    ]);
    assert.equal(Number((await client.query("SELECT count(*) AS value FROM auth_sessions")).rows[0].value), 0);
    assert.equal(Number((await client.query("SELECT count(*) AS value FROM auth_security_events")).rows[0].value), 0);

    const catalog = await client.query(`
      SELECT
        (SELECT count(*) FROM pg_indexes WHERE schemaname='public' AND indexname LIKE 'auth_%')::int AS indexes,
        (SELECT count(*) FROM pg_constraint WHERE conname LIKE 'auth_%')::int AS constraints,
        (SELECT count(*) FROM pg_trigger WHERE tgname='auth_security_events_append_only' AND NOT tgisinternal)::int AS triggers,
        (SELECT count(*) FROM pg_proc WHERE proname IN ('reject_auth_security_event_mutation','minimize_expired_auth_event_network_metadata','purge_expired_auth_security_events','purge_expired_auth_rate_limit_buckets'))::int AS functions
    `);
    assert.ok(catalog.rows[0].indexes >= 13);
    assert.ok(catalog.rows[0].constraints >= 12);
    assert.equal(catalog.rows[0].triggers, 1);
    assert.equal(catalog.rows[0].functions, 4);

    const userId = "00000000-0000-4000-8000-000000000001";
    await client.query("INSERT INTO users (id) VALUES ($1)", [userId]);
    const sessionId = "00000000-0000-4000-8000-000000000011";
    await client.query(`INSERT INTO auth_sessions
      (id,user_id,token_hash,csrf_token_hash,role_snapshot,device_label,network_key_hash,network_metadata_expires_at,idle_expires_at,absolute_expires_at)
      VALUES ($1,$2,$3,$4,'admin','Desktop browser',$5,now() - interval '1 minute',now() + interval '1 hour',now() + interval '24 hours')`,
    [sessionId, userId, hash("a"), hash("b"), hash("c")]);

    await assert.rejects(
      client.query(`INSERT INTO auth_sessions
        (user_id,token_hash,csrf_token_hash,role_snapshot,device_label,idle_expires_at,absolute_expires_at)
        VALUES ($1,$2,$3,'invalid','Desktop browser',now() + interval '1 hour',now() + interval '24 hours')`,
      [userId, hash("d"), hash("e")]),
      /auth_sessions_role_snapshot_valid/,
    );
    await assert.rejects(
      client.query(`INSERT INTO auth_sessions
        (user_id,token_hash,csrf_token_hash,role_snapshot,device_label,idle_expires_at,absolute_expires_at)
        VALUES ($1,$2,$3,'driver','Mobile browser',now() + interval '2 days',now() + interval '1 day')`,
      [userId, hash("f"), hash("1")]),
      /auth_sessions_expiry_order_valid/,
    );

    const eventId = "00000000-0000-4000-8000-000000000021";
    await client.query(`INSERT INTO auth_security_events
      (id,event_type,outcome,actor_user_id,subject_user_id,session_id,request_reference,retention_class,retain_until,network_key_hash,network_metadata_expires_at,event_metadata)
      VALUES ($1,'session.created','success',$2,$2,$3,'auth-validation-reference','privileged',now() + interval '7 years',$4,now() - interval '1 minute','{"role":"admin"}')`,
    [eventId, userId, sessionId, hash("2")]);
    await client.query(`INSERT INTO auth_password_reset_tokens
      (user_id,token_hash,request_reference,network_key_hash,network_metadata_expires_at,expires_at)
      VALUES ($1,$2,'auth-network-retention',$3,now() - interval '1 minute',now() + interval '1 hour')`,
    [userId, hash("6"), hash("7")]);
    await assert.rejects(client.query("UPDATE auth_security_events SET outcome='failure' WHERE id=$1", [eventId]), /append-only/);
    await assert.rejects(client.query("DELETE FROM auth_security_events WHERE id=$1", [eventId]), /append-only/);

    await client.query("SELECT minimize_expired_auth_event_network_metadata(now())");
    const minimized = await client.query("SELECT network_key_hash, network_metadata_expires_at FROM auth_security_events WHERE id=$1", [eventId]);
    assert.equal(minimized.rows[0].network_key_hash, null);
    assert.equal(minimized.rows[0].network_metadata_expires_at, null);
    const minimizedSession = await client.query("SELECT network_key_hash, network_metadata_expires_at FROM auth_sessions WHERE id=$1", [sessionId]);
    assert.equal(minimizedSession.rows[0].network_key_hash, null);
    assert.equal(minimizedSession.rows[0].network_metadata_expires_at, null);
    const minimizedReset = await client.query("SELECT network_key_hash, network_metadata_expires_at FROM auth_password_reset_tokens WHERE token_hash=$1", [hash("6")]);
    assert.equal(minimizedReset.rows[0].network_key_hash, null);
    assert.equal(minimizedReset.rows[0].network_metadata_expires_at, null);
    await client.query("DELETE FROM auth_password_reset_tokens WHERE token_hash=$1", [hash("6")]);

    await client.query(`INSERT INTO auth_security_events
      (event_type,outcome,request_reference,retention_class,retain_until,event_metadata)
      VALUES ('expired.event','information','auth-expired-reference','routine',now() - interval '1 minute','{}')`);
    assert.equal(Number((await client.query("SELECT purge_expired_auth_security_events(now()) AS value")).rows[0].value), 1);

    await client.query(`INSERT INTO auth_rate_limit_buckets
      (action,key_hash,window_started_at,attempt_count,expires_at)
      VALUES ('login',$1,now(),1,now() - interval '1 minute')`, [hash("3")]);
    assert.equal(Number((await client.query("SELECT purge_expired_auth_rate_limit_buckets(now()) AS value")).rows[0].value), 1);

    await client.query("BEGIN");
    await client.query(`INSERT INTO auth_password_reset_tokens
      (user_id,token_hash,request_reference,expires_at) VALUES ($1,$2,'auth-reset-reference',now() + interval '1 hour')`,
    [userId, hash("4")]);
    await client.query("ROLLBACK");
    assert.equal(Number((await client.query("SELECT count(*) AS value FROM auth_password_reset_tokens")).rows[0].value), 0);

    const concurrentHash = hash("5");
    const first = new Client({ connectionString: databaseUrl });
    const second = new Client({ connectionString: databaseUrl });
    await Promise.all([first.connect(), second.connect()]);
    try {
      const results = await Promise.allSettled([
        first.query(`INSERT INTO auth_password_reset_tokens
          (user_id,token_hash,request_reference,expires_at) VALUES ($1,$2,'auth-concurrent-one',now() + interval '1 hour')`, [userId, concurrentHash]),
        second.query(`INSERT INTO auth_password_reset_tokens
          (user_id,token_hash,request_reference,expires_at) VALUES ($1,$2,'auth-concurrent-two',now() + interval '1 hour')`, [userId, concurrentHash]),
      ]);
      assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
      assert.equal(results.filter((result) => result.status === "rejected").length, 1);
    } finally {
      await Promise.all([first.end(), second.end()]);
    }

    assert.equal(Number((await client.query("SELECT count(*) AS value FROM auth_sessions")).rows[0].value), 1);
    assert.equal(Number((await client.query("SELECT count(*) AS value FROM auth_security_events")).rows[0].value), 1);
  } finally {
    await client.end();
  }
});
