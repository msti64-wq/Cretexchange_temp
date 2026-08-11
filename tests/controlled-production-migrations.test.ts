import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";
import {
  assert0040Prerequisites,
  assert0042Pending,
  assert0042Prerequisites,
  assertMigrationChecksum,
  closeClient,
  executeMigrationTransaction,
  productionMigrations,
  selectMigrations,
  verify0041Catalog,
  verify0042Catalog,
} from "../scripts/controlled-production-migrations";
import { readFile } from "node:fs/promises";

function sequenceClient(values: number[]) {
  let index = 0;
  return {
    query: async () => ({ rows: [{ value: values[index++] }] }),
  } as unknown as import("pg").Client;
}

test("bounded production migration cleanup force-closes a non-closing database session", async () => {
  let resolveEnd: (() => void) | undefined;
  let destroyed = false;
  const client = {
    connection: {
      stream: {
        destroy() {
          destroyed = true;
          resolveEnd?.();
        },
      },
    },
    end() {
      return new Promise<void>((resolve) => { resolveEnd = resolve; });
    },
  } as unknown as import("pg").Client;

  await closeClient(client, 5);
  assert.equal(destroyed, true);
});

test("controlled production migration runner allowlists and catalog-verifies migration 0038", async () => {
  const script = await readFile(new URL("../scripts/controlled-production-migrations.ts", import.meta.url), "utf8");
  assert.match(script, /id: "0038"/);
  assert.match(script, /0038_add_platform_analytics_events\.sql/);
  assert.match(script, /platform_analytics_events_event_type_valid/);
  assert.match(script, /platform_analytics_events_source_event_key_unique/);
  assert.match(script, /contype='f'/);
  assert.match(script, /to_regclass\(\$1\)/);
});

test("controlled production migration runner allowlists and catalog-verifies migration 0039", async () => {
  const script = await readFile(new URL("../scripts/controlled-production-migrations.ts", import.meta.url), "utf8");
  assert.match(script, /id: "0039"/);
  assert.match(script, /0039_extend_notifications_for_communication_center\.sql/);
  assert.match(script, /notifications_idempotency_key_unique/);
  assert.match(script, /notifications_schema_version_positive/);
});

test("controlled production migration runner allowlists and catalog-verifies additive terms migration 0013", async () => {
  const [script, migration] = await Promise.all([
    readFile(new URL("../scripts/controlled-production-migrations.ts", import.meta.url), "utf8"),
    readFile(new URL("../migrations/0013_add_localized_terms_acceptance.sql", import.meta.url), "utf8"),
  ]);
  assert.match(script, /id: "0013"/);
  assert.match(script, /0013_add_localized_terms_acceptance\.sql/);
  assert.match(script, /terms_versions/);
  assert.match(script, /terms_acceptances/);
  assert.match(script, /uniq_terms_acceptance_user_doc_version/);
  assert.match(script, /to_regclass\(\$1\)/);
  assert.match(script, /DATA_PRESERVED 0013/);
  assert.match(script, /Legacy terms data changed while applying 0013/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS terms_versions/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS terms_acceptances/);
  assert.doesNotMatch(migration, /^\s*(?:UPDATE\b|DELETE\s+FROM\b|DROP\b|TRUNCATE\b)/im);
  assert.doesNotMatch(migration, /has_agreed_to_terms|terms_agreed_at/i);
});

test("controlled production runner accepts only the checksum-approved 0041 artifact", async () => {
  const selected = selectMigrations("0041", "0041");
  assert.equal(selected.length, 1);
  assert.deepEqual(selected[0], {
    id: "0041",
    file: "migrations/0041_add_facility_scoped_geofence_feature_controls.sql",
    sha256: "01223adea3af146550bab3d925f12f367d14bbf832307c8a2a97de89fceca751",
    expectedObjects: 22,
  });
  const contents = await readFile(new URL("../migrations/0041_add_facility_scoped_geofence_feature_controls.sql", import.meta.url));
  assert.equal(assertMigrationChecksum(selected[0], contents), selected[0].sha256);
  assert.throws(
    () => assertMigrationChecksum(selected[0], Buffer.from(`${contents.toString("utf8")}\n-- tampered`)),
    /Checksum mismatch for 0041/,
  );
});

test("controlled production runner accepts only the checksum-approved 0042 artifact", async () => {
  const selected = selectMigrations("0042", "0042");
  assert.equal(selected.length, 1);
  assert.deepEqual(selected[0], {
    id: "0042",
    file: "migrations/0042_add_revocable_authentication_session_foundation.sql",
    sha256: "7e01dfc555d524224423e56c79eda2560ecc6b7fae25e4bdbb6556b6dce7eeff",
    expectedObjects: 43,
  });
  const contents = await readFile(new URL("../migrations/0042_add_revocable_authentication_session_foundation.sql", import.meta.url));
  assert.equal(assertMigrationChecksum(selected[0], contents), selected[0].sha256);
  assert.throws(
    () => assertMigrationChecksum(selected[0], Buffer.from(`${contents.toString("utf8")}\n-- tampered`)),
    /Checksum mismatch for 0042/,
  );
});

test("unknown, out-of-order, and catalog-only 0040 selections remain denied", () => {
  assert.throws(() => selectMigrations("0043", "0043"), /explicit ordered/);
  assert.throws(() => selectMigrations("0042", "0041"), /explicit ordered/);
  assert.throws(() => selectMigrations("0040", "0040"), /explicit ordered/);
});

test("0040 prerequisites are catalog-only and every missing prerequisite fails closed", async () => {
  const expected = [3, 4, 8, 2, 3, 5];
  const labels = ["tables", "constraints", "indexes", "functions", "triggers", "feature controls"];
  for (let missing = 0; missing < expected.length; missing += 1) {
    const observed = [...expected];
    observed[missing] -= 1;
    await assert.rejects(
      assert0040Prerequisites(sequenceClient(observed)),
      new RegExp(`0040 prerequisite ${labels[missing]} catalog verification failed`),
    );
  }
  await assert.doesNotReject(assert0040Prerequisites(sequenceClient(expected)));
});

test("0041 verification fails for any missing table, constraint, index, function, or trigger", async () => {
  const expected = [2, 15, 3, 1, 1, 0, 0];
  for (let missing = 0; missing < 5; missing += 1) {
    const observed = [...expected];
    observed[missing] -= 1;
    await assert.rejects(
      verify0041Catalog(sequenceClient(observed)),
      /0041 catalog verification failed/,
    );
  }
});

test("0041 verification requires zero initial override rows and zero initial audit history", async () => {
  await assert.rejects(
    verify0041Catalog(sequenceClient([2, 15, 3, 1, 1, 1, 0])),
    /0041 initial Facility override rows catalog verification failed/,
  );
  await assert.rejects(
    verify0041Catalog(sequenceClient([2, 15, 3, 1, 1, 0, 1])),
    /0041 initial audit-history rows catalog verification failed/,
  );
  await assert.doesNotReject(verify0041Catalog(sequenceClient([2, 15, 3, 1, 1, 0, 0])));
});

test("0042 prerequisites require the exact prior catalog without executing prior migrations", async () => {
  const expected = [1, 1, 1, 0, 3, 4, 8, 2, 3, 5, 2, 15, 3, 1, 1];
  for (let missing = 0; missing < expected.length; missing += 1) {
    const observed = [...expected];
    observed[missing] = expected[missing] === 0 ? 1 : expected[missing] - 1;
    await assert.rejects(assert0042Prerequisites(sequenceClient(observed)), /004[02] prerequisite/);
  }
  await assert.doesNotReject(assert0042Prerequisites(sequenceClient(expected)));
});

test("0042 verification requires every object, retention protection, and zero-row state", async () => {
  const expected = [4, 22, 12, 4, 1, 3, 3, 0, 0, 0, 0, 0];
  for (let missing = 0; missing < 7; missing += 1) {
    const observed = [...expected];
    observed[missing] = Math.max(0, observed[missing] - 1);
    await assert.rejects(verify0042Catalog(sequenceClient(observed)), /0042/);
  }
  const publicExecuteGranted = [...expected];
  publicExecuteGranted[7] = 1;
  await assert.rejects(verify0042Catalog(sequenceClient(publicExecuteGranted)), /PUBLIC execute/);
  for (let table = 8; table < expected.length; table += 1) {
    const observed = [...expected];
    observed[table] = 1;
    await assert.rejects(verify0042Catalog(sequenceClient(observed)), /0042 initial/);
  }
  await assert.doesNotReject(verify0042Catalog(sequenceClient(expected)));
});

test("0042 duplicate and partial catalog states fail closed", async () => {
  await assert.doesNotReject(assert0042Pending(sequenceClient([0, 0, 0, 0, 0])));
  await assert.rejects(assert0042Pending(sequenceClient([4, 22, 12, 4, 1])), /already applied.*duplicate execution/i);
  await assert.rejects(assert0042Pending(sequenceClient([3, 22, 12, 4, 1])), /partial.*no repair/i);
});

test("bounded migration transaction rolls back on execution failure", async () => {
  const queries: string[] = [];
  const client = {
    async query(text: string) {
      queries.push(text);
      if (text === "FAIL SQL") throw new Error("synthetic migration failure");
      return { rows: [] };
    },
  } as unknown as import("pg").Client;
  await assert.rejects(
    executeMigrationTransaction(client, "FAIL SQL", async () => undefined),
    /synthetic migration failure/,
  );
  assert.deepEqual(queries, [
    "BEGIN",
    "SET LOCAL statement_timeout = '30s'",
    "SET LOCAL lock_timeout = '5s'",
    "FAIL SQL",
    "ROLLBACK",
  ]);
});

test("existing approved Production migrations remain byte-for-byte allowlist entries", () => {
  assert.deepEqual(productionMigrations.slice(0, 5), [
    { id: "0013", file: "migrations/0013_add_localized_terms_acceptance.sql", sha256: "21c04112cae0901781c0dfb572c3de88e4e8a3ff1bf09bdaeae6633d191dc22f", expectedObjects: 7 },
    { id: "0036", file: "migrations/0036_add_washout_activity_admin_reviews.sql", sha256: "81c8c5dbceb87ed0aa024d3a34b432a72825722703e53574af785cbc8a08fdb0", expectedObjects: 7 },
    { id: "0037", file: "migrations/0037_add_washout_photo_review_audit.sql", sha256: "5714306b60592c536dc9d1e5dbe71e20392faedde97fd06d2d4b180fb58c7e5b", expectedObjects: 4 },
    { id: "0038", file: "migrations/0038_add_platform_analytics_events.sql", sha256: "684a072dac88a16515118bfd7eb3e9208570b375f4dff3a3c632c6426fbee667", expectedObjects: 13 },
    { id: "0039", file: "migrations/0039_extend_notifications_for_communication_center.sql", sha256: "90d7ffe79169b3735f8af4cfa77805aac34def6f9afddf48d878abfbec9b4c79", expectedObjects: 23 },
  ]);
});

test("runner introduces no generic migration discovery or execution bypass", async () => {
  const script = await readFile(new URL("../scripts/controlled-production-migrations.ts", import.meta.url), "utf8");
  assert.doesNotMatch(script, /readdir|glob\(|fast-glob|migrations\/\*|latest migration/i);
  assert.doesNotMatch(script, /--force\b|force-execution|skip-checksum|ignore-checksum/i);
  assert.doesNotMatch(script, /id:\s*"0040"/);
  assert.match(script, /if \(migration\.id === "0041"\) await assert0040Prerequisites\(client\)/);
  assert.match(script, /await assert0042Prerequisites\(client\)/);
  assert.match(script, /await assert0042Pending\(client\)/);
  assert.match(script, /pg_try_advisory_lock/);
  assert.match(script, /SET LOCAL statement_timeout/);
  assert.match(script, /SET LOCAL lock_timeout/);
});

test("0042 runner catalog checks pass against disposable PostgreSQL after catalog-only prerequisites", {
  skip: process.env.CONTROLLED_PRODUCTION_RUNNER_TEST_DATABASE_URL ? false : "isolated PostgreSQL URL is required",
}, async () => {
  const client = new pg.Client({
    connectionString: process.env.CONTROLLED_PRODUCTION_RUNNER_TEST_DATABASE_URL,
    ssl: false,
  });
  await client.connect();
  try {
    await client.query(`
      CREATE EXTENSION IF NOT EXISTS pgcrypto;
      CREATE TABLE users (id varchar PRIMARY KEY);
      CREATE TABLE owners (id varchar PRIMARY KEY, user_id varchar NOT NULL REFERENCES users(id));
      CREATE TABLE washout_locations (id varchar PRIMARY KEY, owner_id varchar NOT NULL REFERENCES owners(id));
      CREATE TABLE washout_activities (id varchar PRIMARY KEY, location_id varchar REFERENCES washout_locations(id));
      CREATE TABLE feature_flags (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        flag_key varchar NOT NULL UNIQUE,
        enabled boolean NOT NULL DEFAULT false,
        description text,
        allowed_roles text[],
        created_at timestamp DEFAULT now(),
        updated_at timestamp DEFAULT now()
      );
    `);
    const migration0032 = await readFile(new URL("../migrations/0032_add_user_auth_token_version.sql", import.meta.url), "utf8");
    await client.query(migration0032);
    const migration0040 = await readFile(new URL("../migrations/0040_add_canonical_facility_geofence_foundation.sql", import.meta.url), "utf8");
    await client.query(migration0040);
    await assert0040Prerequisites(client);

    const migration0041 = await readFile(new URL("../migrations/0041_add_facility_scoped_geofence_feature_controls.sql", import.meta.url), "utf8");
    await executeMigrationTransaction(client, migration0041, () => verify0041Catalog(client));
    await assert0042Prerequisites(client);

    const migration0042 = await readFile(new URL("../migrations/0042_add_revocable_authentication_session_foundation.sql", import.meta.url), "utf8");
    await executeMigrationTransaction(client, migration0042, () => verify0042Catalog(client));
    await verify0042Catalog(client);
    await assert.rejects(assert0042Pending(client), /duplicate execution/i);
  } finally {
    await client.end();
  }
});
