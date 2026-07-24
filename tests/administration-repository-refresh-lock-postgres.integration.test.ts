import assert from "node:assert/strict";
import test from "node:test";
import { Pool } from "pg";
import { createPostgresAdministrationRepositoryRefreshLock } from "../server/administrationRepositoryRefreshLock";

const enabled = process.env.ADMIN_REPOSITORY_PG_INTEGRATION === "1";

test("PostgreSQL advisory refresh lock serializes independent sessions and releases on session loss", { skip: enabled ? undefined : "Set ADMIN_REPOSITORY_PG_INTEGRATION=1 with an isolated admin_repository_validation_* DATABASE_URL." }, async () => {
  assert.notEqual(process.env.NODE_ENV, "production", "integration testing must never run in production mode");
  const connectionString = process.env.DATABASE_URL?.trim();
  assert.ok(connectionString, "an explicit isolated DATABASE_URL is required");
  const target = new URL(connectionString);
  assert.match(target.pathname, /^\/admin_repository_validation_[a-z0-9_]+$/i, "database name must use the isolated admin_repository_validation_ prefix");
  assert.doesNotMatch(target.hostname, /production|prod/i, "production-like hosts are not permitted");

  const pool = new Pool({ connectionString });
  try {
    const first = createPostgresAdministrationRepositoryRefreshLock(pool);
    const second = createPostgresAdministrationRepositoryRefreshLock(pool);
    const lease = await first.acquire();
    assert.ok(lease, "first independent session acquires the advisory lock");
    assert.equal(await second.acquire(), null, "second independent session is rejected while the lock is held");
    await lease.release();
    const afterRelease = await second.acquire();
    assert.ok(afterRelease, "explicit release permits the next session");
    await afterRelease.release();

    const lostSession = await pool.connect();
    await lostSession.query("SELECT pg_advisory_lock($1::integer)", [913517683]);
    lostSession.release(new Error("intentional integration-test session termination"));
    const afterLoss = await first.acquire();
    assert.ok(afterLoss, "PostgreSQL releases a session advisory lock after the owning session terminates");
    await afterLoss.release();
  } finally {
    await pool.end();
  }
});
