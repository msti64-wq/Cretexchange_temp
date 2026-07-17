import { pool } from "./db";

export type FinancialSchemaCapabilities = {
  previewAvailable: true;
  schemaMetadataAvailable: boolean;
  auditSchemaAvailable: boolean;
  obligationKindAvailable: boolean;
  stripeTransferEvidenceAvailable: boolean;
  stripePaymentIntentEvidenceAvailable: boolean;
  stripeChargeEvidenceAvailable: boolean;
  creationAvailable: boolean;
};

const PAYMENT_COLUMNS = [
  "obligation_created_by",
  "obligation_creation_reason",
  "obligation_kind",
  "stripe_transfer_id",
  "stripe_payment_intent_id",
  "stripe_charge_id",
] as const;

/**
 * Reads only PostgreSQL metadata. It never probes an application query with a
 * guessed column name. Preview has a deliberately pre-0020 projection, while
 * creation and canonical classification remain unavailable until the required
 * columns are positively identified.
 */
export async function getFinancialSchemaCapabilities(): Promise<FinancialSchemaCapabilities> {
  try {
    const result = await pool.query(
      `SELECT column_name
         FROM information_schema.columns
        WHERE table_schema = $1
          AND table_name = $2
          AND column_name = ANY($3::text[])`,
      ["public", "payments", [...PAYMENT_COLUMNS]],
    );
    const columns = new Set(result.rows.map((row: { column_name?: unknown }) => String(row.column_name || "")));
    const auditSchemaAvailable = columns.has("obligation_created_by") && columns.has("obligation_creation_reason");
    const obligationKindAvailable = columns.has("obligation_kind");
    return {
      previewAvailable: true,
      schemaMetadataAvailable: true,
      auditSchemaAvailable,
      obligationKindAvailable,
      stripeTransferEvidenceAvailable: columns.has("stripe_transfer_id"),
      stripePaymentIntentEvidenceAvailable: columns.has("stripe_payment_intent_id"),
      stripeChargeEvidenceAvailable: columns.has("stripe_charge_id"),
      creationAvailable: auditSchemaAvailable && obligationKindAvailable,
    };
  } catch {
    // Metadata failure must never cause a financial write or a speculative
    // column query. The preview's pre-0020 projection remains safe to use.
    return {
      previewAvailable: true,
      schemaMetadataAvailable: false,
      auditSchemaAvailable: false,
      obligationKindAvailable: false,
      stripeTransferEvidenceAvailable: false,
      stripePaymentIntentEvidenceAvailable: false,
      stripeChargeEvidenceAvailable: false,
      creationAvailable: false,
    };
  }
}
