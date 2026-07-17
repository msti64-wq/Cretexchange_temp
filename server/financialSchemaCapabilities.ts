import { pool } from "./db";
import { CANONICAL_VERIFIED_ACTIVITY_OBLIGATION_KIND } from "./financialObligations";

export type FinancialSchemaState = "metadata_unavailable" | "audit_columns_missing" | "canonical_index_pending" | "transitional" | "canonical_ready";
export type FinancialSchemaCapabilities = {
  previewAvailable: true;
  schemaMetadataAvailable: boolean;
  auditSchemaAvailable: boolean;
  obligationKindAvailable: boolean;
  canonicalPartialIndexAvailable: boolean;
  globalActivityIndexPresent: boolean;
  schemaState: FinancialSchemaState;
  creationUnavailableReason: string | null;
  stripeTransferEvidenceAvailable: boolean;
  stripePaymentIntentEvidenceAvailable: boolean;
  stripeChargeEvidenceAvailable: boolean;
  creationAvailable: boolean;
};

const PAYMENT_COLUMNS = ["obligation_created_by", "obligation_creation_reason", "obligation_kind", "stripe_transfer_id", "stripe_payment_intent_id", "stripe_charge_id"] as const;
const CANONICAL_INDEX = "uniq_payments_canonical_verified_activity_obligation";

type IndexMetadata = { index_name?: unknown; is_unique?: unknown; is_valid?: unknown; is_ready?: unknown; predicate?: unknown; key_count?: unknown; first_key?: unknown };

function booleanColumn(value: unknown): boolean { return value === true || value === "t" || value === "true" || value === 1; }
function isExactlyActivityId(value: unknown): boolean { return typeof value === "string" && value.replace(/["\s]/g, "") === "activity_id"; }

/** Normalizes PostgreSQL's equivalent cast and parenthesis formatting for the approved predicate only. */
export function isExactCanonicalObligationPredicate(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const normalized = value.toLowerCase()
    .replace(/::(?:character varying|text)/g, "")
    .replace(/[\s()'"]/g, "");
  return normalized === `activity_idisnotnullandobligation_kind=${CANONICAL_VERIFIED_ACTIVITY_OBLIGATION_KIND}`;
}

export function deriveFinancialSchemaCapabilities(columnNames: Iterable<string>, indexes: IndexMetadata[], metadataAvailable = true): FinancialSchemaCapabilities {
  const columns = new Set(columnNames);
  const auditSchemaAvailable = columns.has("obligation_created_by") && columns.has("obligation_creation_reason");
  const obligationKindAvailable = columns.has("obligation_kind");
  const canonical = indexes.find((index) => String(index.index_name) === CANONICAL_INDEX);
  const canonicalPartialIndexAvailable = Boolean(canonical && booleanColumn(canonical.is_unique) && booleanColumn(canonical.is_valid) && booleanColumn(canonical.is_ready) && isExactCanonicalObligationPredicate(canonical.predicate));
  // Do not trust the historical index name. A renamed one-column, non-partial
  // unique activity index is still incompatible with the final canonical-only
  // model and must keep creation disabled.
  const globalActivityIndexPresent = indexes.some((index) => booleanColumn(index.is_unique)
    && booleanColumn(index.is_valid)
    && booleanColumn(index.is_ready)
    && (index.predicate === null || index.predicate === undefined || index.predicate === "")
    && Number(index.key_count) === 1
    && isExactlyActivityId(index.first_key));
  const schemaState: FinancialSchemaState = !metadataAvailable ? "metadata_unavailable"
    : !auditSchemaAvailable || !obligationKindAvailable ? "audit_columns_missing"
      : !canonicalPartialIndexAvailable ? "canonical_index_pending"
        : globalActivityIndexPresent ? "transitional" : "canonical_ready";
  const creationUnavailableReason = schemaState === "canonical_ready" ? null
    : schemaState === "canonical_index_pending" ? "canonical_uniqueness_migration_pending"
      : schemaState === "transitional" ? "canonical_uniqueness_migration_transitional"
        : schemaState === "audit_columns_missing" ? "canonical_audit_schema_unavailable" : "schema_metadata_unavailable";
  return {
    previewAvailable: true,
    schemaMetadataAvailable: metadataAvailable,
    auditSchemaAvailable,
    obligationKindAvailable,
    canonicalPartialIndexAvailable,
    globalActivityIndexPresent,
    schemaState,
    creationUnavailableReason,
    stripeTransferEvidenceAvailable: columns.has("stripe_transfer_id"),
    stripePaymentIntentEvidenceAvailable: columns.has("stripe_payment_intent_id"),
    stripeChargeEvidenceAvailable: columns.has("stripe_charge_id"),
    creationAvailable: schemaState === "canonical_ready",
  };
}

/** Reads PostgreSQL metadata only. Creation is fail-closed until the final partial-index state is proven. */
export async function getFinancialSchemaCapabilities(): Promise<FinancialSchemaCapabilities> {
  try {
    const [columnResult, indexResult] = await Promise.all([
      pool.query(`SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 AND column_name = ANY($3::text[])`, ["public", "payments", [...PAYMENT_COLUMNS]]),
      pool.query(`SELECT indexrel.relname AS index_name, i.indisunique AS is_unique, i.indisvalid AS is_valid, i.indisready AS is_ready, i.indnkeyatts AS key_count, pg_get_indexdef(i.indexrelid, 1, true) AS first_key, pg_get_expr(i.indpred, i.indrelid) AS predicate FROM pg_class table_rel JOIN pg_namespace ns ON ns.oid = table_rel.relnamespace JOIN pg_index i ON i.indrelid = table_rel.oid JOIN pg_class indexrel ON indexrel.oid = i.indexrelid WHERE ns.nspname = $1 AND table_rel.relname = $2`, ["public", "payments"]),
    ]);
    return deriveFinancialSchemaCapabilities(
      columnResult.rows.map((row: { column_name?: unknown }) => String(row.column_name || "")),
      indexResult.rows,
    );
  } catch {
    return deriveFinancialSchemaCapabilities([], [], false);
  }
}
