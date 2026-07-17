import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { drizzle } from "drizzle-orm/pg-proxy";
import { sql } from "drizzle-orm";
import { payments } from "../shared/schema";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgres://user:pass@127.0.0.1:1/cretexchange_test";

const { deriveFinancialSchemaCapabilities, isExactCanonicalObligationPredicate } = await import("../server/financialSchemaCapabilities");

const requiredColumns = ["obligation_created_by", "obligation_creation_reason", "obligation_kind"];
const canonicalIndex = {
  index_name: "uniq_payments_canonical_verified_activity_obligation",
  is_unique: true,
  is_valid: true,
  is_ready: true,
  predicate: "((activity_id IS NOT NULL) AND ((obligation_kind)::text = 'canonical_verified_activity_v1'::text))",
  key_count: 1,
  first_key: "activity_id",
};

test("canonical capability requires the exact valid and ready partial unique index", () => {
  assert.equal(isExactCanonicalObligationPredicate(canonicalIndex.predicate), true);
  assert.equal(isExactCanonicalObligationPredicate("activity_id IS NOT NULL"), false);
  assert.equal(isExactCanonicalObligationPredicate("activity_id IS NOT NULL AND obligation_kind = 'other'"), false);
  const final = deriveFinancialSchemaCapabilities(requiredColumns, [canonicalIndex]);
  assert.equal(final.creationAvailable, true);
  assert.equal(final.schemaState, "canonical_ready");
  for (const invalid of [{ ...canonicalIndex, is_unique: false }, { ...canonicalIndex, is_valid: false }, { ...canonicalIndex, is_ready: false }, { ...canonicalIndex, predicate: null }]) {
    assert.equal(deriveFinancialSchemaCapabilities(requiredColumns, [invalid]).creationAvailable, false);
  }
});

test("application schema declares only the future canonical partial uniqueness boundary", async () => {
  const source = await readFile(new URL("../shared/schema.ts", import.meta.url), "utf8");
  const payments = source.slice(source.indexOf('export const payments = pgTable'), source.indexOf('// Pending washout payments'));
  assert.match(payments, /uniq_payments_canonical_verified_activity_obligation/);
  assert.match(payments, /\.where\(sql`\$\{table\.activityId\} IS NOT NULL AND \$\{table\.obligationKind\} = 'canonical_verified_activity_v1'`\)/);
  assert.doesNotMatch(payments, /uniq_payments_activity_obligation/);
});

test("Drizzle renders a literal partial-index arbiter predicate rather than a bind parameter", () => {
  const db = drizzle(async () => ({ rows: [] }));
  const query = db.insert(payments).values({
    driverId: "driver", ownerId: "owner", activityId: "activity", amount: "1.00", processingFee: "5.00", washoutServiceFee: "1.00", status: "pending", obligationKind: "canonical_verified_activity_v1",
  }).onConflictDoNothing({
    target: payments.activityId,
    where: sql`${payments.activityId} IS NOT NULL AND ${payments.obligationKind} = ${sql.raw("'canonical_verified_activity_v1'")}`,
  }).toSQL();
  assert.match(query.sql, /on conflict \("activity_id"\) where "payments"\."activity_id" IS NOT NULL AND "payments"\."obligation_kind" = 'canonical_verified_activity_v1'\s+do nothing/);
  assert.equal(query.params.includes("canonical_verified_activity_v1"), true, "the inserted row remains parameterized");
  assert.equal(query.params.length, 8, "the arbiter predicate adds no parameter");
});

test("global-index-only production-like state preserves preview and fail-closes creation", () => {
  const current = deriveFinancialSchemaCapabilities(requiredColumns, [{ index_name: "renamed_activity_uniqueness", is_unique: true, is_valid: true, is_ready: true, predicate: null, key_count: 1, first_key: "activity_id" }]);
  assert.equal(current.previewAvailable, true);
  assert.equal(current.creationAvailable, false);
  assert.equal(current.schemaState, "canonical_index_pending");
  assert.equal(current.creationUnavailableReason, "canonical_uniqueness_migration_pending");
});

test("transitional and incomplete metadata states remain controlled", () => {
  const transitional = deriveFinancialSchemaCapabilities(requiredColumns, [canonicalIndex, { index_name: "renamed_activity_uniqueness", is_unique: true, is_valid: true, is_ready: true, predicate: null, key_count: 1, first_key: "activity_id" }]);
  assert.equal(transitional.creationAvailable, false);
  assert.equal(transitional.schemaState, "transitional");
  const missingAudit = deriveFinancialSchemaCapabilities(["obligation_kind"], [canonicalIndex]);
  assert.equal(missingAudit.creationAvailable, false);
  assert.equal(missingAudit.schemaState, "audit_columns_missing");
  const unavailable = deriveFinancialSchemaCapabilities([], [], false);
  assert.equal(unavailable.creationAvailable, false);
  assert.equal(unavailable.schemaState, "metadata_unavailable");
});
