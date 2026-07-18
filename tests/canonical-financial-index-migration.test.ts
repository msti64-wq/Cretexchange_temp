import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("0024 creates the canonical partial index and deliberately stops in the safe transitional state", async () => {
  const migration = await readFile(new URL("../migrations/0024_replace_global_payment_activity_uniqueness_with_canonical_partial.sql", import.meta.url), "utf8");
  assert.match(migration, /duplicate canonical obligations exist/i);
  assert.match(migration, /CREATE UNIQUE INDEX CONCURRENTLY "uniq_payments_canonical_verified_activity_obligation"/);
  assert.match(migration, /WHERE "activity_id" IS NOT NULL\s+AND "obligation_kind" = 'canonical_verified_activity_v1'/);
  assert.match(migration, /i\.indisunique\s+AND i\.indisvalid\s+AND i\.indisready/);
  assert.match(migration, /safe transitional state/i);
  assert.doesNotMatch(migration, /DROP INDEX CONCURRENTLY/);
});

test("0025 retires only the proven historical index and asserts the exact final canonical catalog state", async () => {
  const migration = await readFile(new URL("../migrations/0025_retire_global_payment_activity_uniqueness.sql", import.meta.url), "utf8");
  assert.match(migration, /autocommit migration/i);
  assert.match(migration, /index_rel\.relname = 'uniq_payments_activity_obligation'/);
  assert.match(migration, /index_rel\.relname = 'uniq_payments_canonical_verified_activity_obligation'/);
  assert.match(migration, /i\.indisunique\s+AND i\.indisvalid\s+AND i\.indisready/);
  assert.match(migration, /i\.indnkeyatts = 1\s+AND i\.indnatts = 1\s+AND i\.indexprs IS NULL/);
  assert.match(migration, /i\.indpred IS NOT NULL/);
  assert.match(migration, /DROP INDEX CONCURRENTLY "public"\."uniq_payments_activity_obligation"/);
  assert.doesNotMatch(migration, /DROP INDEX CONCURRENTLY IF EXISTS/);
  assert.doesNotMatch(migration, /\b(?:BEGIN|START TRANSACTION)\s*;/i);
  assert.doesNotMatch(migration, /\b(?:INSERT\s+INTO|UPDATE\s+payments|DELETE\s+FROM\s+payments)\b/i);

  const dropOffset = migration.indexOf('DROP INDEX CONCURRENTLY "public"."uniq_payments_activity_obligation"');
  const postconditionOffset = migration.indexOf("postcondition failed:");
  assert.ok(dropOffset >= 0 && postconditionOffset > dropOffset, "final catalog assertions must occur after the concurrent drop");
  const postDrop = migration.slice(dropOffset);
  assert.match(postDrop, /postcondition failed: historical global payment activity index still exists/);
  assert.match(postDrop, /postcondition failed: canonical payment activity index is missing/);
  assert.match(postDrop, /postcondition failed: canonical payment activity index is not attached to public\.payments/);
  assert.match(postDrop, /postcondition failed: canonical payment activity index is invalid or not ready/);
  assert.match(postDrop, /postcondition failed: canonical payment activity index key contract is incorrect/);
  assert.match(postDrop, /postcondition failed: canonical payment activity index predicate is incorrect/);
  assert.match(postDrop, /RAISE EXCEPTION/);
  assert.doesNotMatch(migration, /\b(?:Stripe|Treasury|wallet|settlement|payout|scheduler)\b/i);
  assert.match(migration, /cannot make concurrent index retirement atomic/i);
  assert.match(migration, /do not retry blindly/i);
});

test("0024 explicitly preserves legacy rows and forbids transactional execution", async () => {
  const migration = await readFile(new URL("../migrations/0024_replace_global_payment_activity_uniqueness_with_canonical_partial.sql", import.meta.url), "utf8");
  assert.match(migration, /neither classifies nor rewrites legacy/i);
  assert.match(migration, /cannot run inside a transaction block/i);
  assert.doesNotMatch(migration, /\b(?:INSERT|UPDATE|DELETE)\s+(?:INTO\s+)?"?payments"?/i);
});

test("synthetic PostgreSQL bootstrap contains only isolated fixtures for all required discovery classes", async () => {
  const bootstrap = await readFile(new URL("../scripts/bootstrap-financial-schema-rehearsal.sql", import.meta.url), "utf8");
  assert.match(bootstrap, /Synthetic, isolated PostgreSQL bootstrap/i);
  assert.match(bootstrap, /CREATE UNIQUE INDEX uniq_payments_activity_obligation/);
  assert.match(bootstrap, /ordinary missing; B: legacy linked; C: canonical existing; D: ineligible/i);
  assert.match(bootstrap, /canonical_verified_activity_v1/);
  assert.match(bootstrap, /current_database\(\) !~ '\^financial_validation_/);
  assert.match(bootstrap, /requires an empty validation database/i);
  assert.doesNotMatch(bootstrap, /\b(?:Stripe\.|Treasury\.|PaymentIntent|transfer\()\b/i);
});
