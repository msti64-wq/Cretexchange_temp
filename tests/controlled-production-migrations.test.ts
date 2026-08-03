import assert from "node:assert/strict";
import test from "node:test";
import { closeClient } from "../scripts/controlled-production-migrations";
import { readFile } from "node:fs/promises";

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
