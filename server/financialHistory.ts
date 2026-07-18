/**
 * Canonical clean-slate boundary for the internal financial-test history.
 * PostgreSQL migration 0026 applies the same Central-Time wall-clock boundary
 * to timestamp-without-time-zone legacy columns via AT TIME ZONE.
 */
export const FINANCIAL_HISTORY_CUTOFF_TIME_ZONE = "America/Chicago";
export const FINANCIAL_HISTORY_CUTOFF_KEY = "financial_history_cutoff_2026_07_17";
export const FINANCIAL_HISTORY_CUTOFF_INSTANT = "2026-07-17T05:00:00.000Z";
export const HISTORICAL_TEST_DATA_CLASSIFICATION = "historical_test_data";

export type FinancialHistoryRecordType =
  | "washout_activity"
  | "payment"
  | "billing_batch"
  | "owner_wallet_transaction"
  | "fee_ledger"
  | "pending_washout_payment"
  | "washout_payment_batch"
  | "wallet_transaction"
  | "withdrawal"
  | "driver_lottery_entry"
  | "lottery_drawing_winner"
  | "lottery_drawing_fulfillment"
  | "lottery_notification"
  | "notification";

/**
 * The source activity is the only eligibility authority for current-program
 * incentives and rewards. The database join uses the same exact tuple in
 * every consumer; source records are never mutated to encode this boundary.
 */
export const HISTORICAL_ACTIVITY_RECORD_TYPE: FinancialHistoryRecordType = "washout_activity";

/** The activity business timestamp is verification time, falling back to creation time. */
export function activityBusinessTimestamp(value: { verifiedAt?: Date | string | null; createdAt?: Date | string | null }): Date | null {
  const candidate = value.verifiedAt ?? value.createdAt ?? null;
  if (!candidate) return null;
  const parsed = candidate instanceof Date ? candidate : new Date(candidate);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function isHistoricalTestClassification(value: unknown): boolean {
  return value === HISTORICAL_TEST_DATA_CLASSIFICATION;
}

/** ISO inputs are instants; the fixed UTC cutoff is the Central midnight boundary in July 2026. */
export function isHistoricalFinancialTestActivity(value: { verifiedAt?: Date | string | null; createdAt?: Date | string | null }): boolean {
  const timestamp = activityBusinessTimestamp(value);
  return Boolean(timestamp && timestamp.getTime() < new Date(FINANCIAL_HISTORY_CUTOFF_INSTANT).getTime());
}
