import { pool } from "./db";

const BILLING_SCHEMA_TABLES = [
  "washout_activities",
  "washout_locations",
  "payments",
  "billing_batches",
  "owner_wallet_transactions",
  "fees_ledger",
] as const;

const REQUIRED_BILLING_COLUMNS: Record<string, string[]> = {
  washout_activities: [
    "id",
    "driver_id",
    "location_id",
    "status",
    "amount",
    "fee_cents_platform",
    "check_in_time",
    "verified_at",
    "created_at",
  ],
  washout_locations: [
    "id",
    "owner_id",
    "rate",
  ],
  payments: [
    "id",
    "driver_id",
    "owner_id",
    "activity_id",
    "amount",
    "processing_fee",
    "washout_service_fee",
    "status",
    "batch_id",
    "business_date",
    "paid_at",
  ],
  billing_batches: [
    "id",
    "owner_id",
    "business_date",
    "total_amount",
    "total_fees",
    "payment_count",
    "status",
    "metadata",
  ],
  owner_wallet_transactions: [
    "id",
    "owner_id",
    "type",
    "amount",
    "payment_id",
    "batch_id",
    "created_at",
  ],
  fees_ledger: [
    "id",
    "owner_id",
    "fee_type",
    "amount_cents",
    "status",
    "batch_id",
    "metadata",
  ],
};

function redactLegacyColumnForLogs(columnName: string): string {
  if (columnName.includes("incentive")) {
    return "<legacy_location_tip_column_present>";
  }
  if (columnName.includes("tip") && columnName.includes("cents")) {
    return "<legacy_tip_cents_column_present>";
  }
  return columnName;
}

export async function logBillingSchemaGuard(): Promise<void> {
  try {
    const result = await pool.query(
      `
        SELECT table_name, column_name, data_type
        FROM information_schema.columns
        WHERE table_schema = $1
          AND table_name = ANY($2::text[])
        ORDER BY table_name, ordinal_position
      `,
      ["public", [...BILLING_SCHEMA_TABLES]],
    );

    const tableColumns = new Map<string, Array<{ columnName: string; dataType: string }>>();
    for (const row of result.rows) {
      const tableName = String(row.table_name);
      const columnName = String(row.column_name);
      const dataType = String(row.data_type);
      if (!tableColumns.has(tableName)) {
        tableColumns.set(tableName, []);
      }
      tableColumns.get(tableName)!.push({ columnName, dataType });
    }

    const tables = Object.fromEntries(
      BILLING_SCHEMA_TABLES.map((tableName) => {
        const columns = tableColumns.get(tableName) || [];
        const availableColumnNames = new Set(columns.map((column) => column.columnName));
        const missingRequiredColumns = (REQUIRED_BILLING_COLUMNS[tableName] || [])
          .filter((columnName) => !availableColumnNames.has(columnName));

        return [
          tableName,
          {
            columnCount: columns.length,
            availableColumns: columns.map((column) => ({
              columnName: redactLegacyColumnForLogs(column.columnName),
              dataType: column.dataType,
            })),
            missingRequiredColumns,
          },
        ];
      }),
    );

    console.info("[BILLING_SCHEMA_GUARD]", {
      tables,
      canonicalSourceMapping: {
        ownerDashboardStats: "washout_activities + washout_locations + payments + billing_batches",
        ownerActivities: "washout_activities joined through washout_locations.owner_id",
        platformFees: "washout_activities.fee_cents_platform or configured owner/system fee",
        driverTips: "washout_activities.amount, payments.amount fallback, washout_locations.rate fallback",
        billingHistory: "billing_batches + payments + owner_wallet_transactions",
        platformEarnings: "payments.processing_fee + billing ledger platform fee totals",
      },
    });
  } catch (error) {
    console.error("[BILLING_SCHEMA_GUARD] failed", {
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
