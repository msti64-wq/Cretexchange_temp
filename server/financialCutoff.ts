import { sql, type SQL, type SQLWrapper } from "drizzle-orm";

/** Canonical current-program boundary. The exact instant is current. */
export const DEFAULT_FINANCIAL_HISTORY_CUTOFF_AT = new Date("2026-07-17T05:00:00.000Z");

export function parseFinancialHistoryCutoff(value: Date | string | null | undefined): Date {
  const parsed = value instanceof Date ? value : typeof value === "string" ? new Date(value) : value == null ? DEFAULT_FINANCIAL_HISTORY_CUTOFF_AT : null;
  if (!parsed || Number.isNaN(parsed.getTime())) throw new Error("financial_history_cutoff_at must be a valid timestamp");
  return parsed;
}

export function effectiveFinancialTimestamp(record: { verifiedAt?: Date | string | null; createdAt?: Date | string | null }): Date | null {
  const source = record.verifiedAt ?? record.createdAt;
  if (!source) return null;
  const parsed = source instanceof Date ? source : new Date(source);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function isHistoricalFinancialRecord(record: { verifiedAt?: Date | string | null; createdAt?: Date | string | null }, cutoff: Date | string | null | undefined): boolean {
  const effective = effectiveFinancialTimestamp(record);
  return effective !== null && effective.getTime() < parseFinancialHistoryCutoff(cutoff).getTime();
}

/**
 * Current-program selection is the inverse of the configured historical
 * boundary. Records without a usable activity timestamp are deliberately not
 * eligible for current financial processing; callers must surface them through
 * an explicit audit or exception path instead of silently treating them as
 * current.
 */
export function isCurrentFinancialRecord(
  record: { verifiedAt?: Date | string | null; createdAt?: Date | string | null },
  cutoff: Date | string | null | undefined,
): boolean {
  return effectiveFinancialTimestamp(record) !== null && !isHistoricalFinancialRecord(record, cutoff);
}

/**
 * Database projection for the same COALESCE rule. Financial queries use this
 * only after reading the authoritative system setting; it intentionally has
 * no hard-coded timestamp branch of its own.
 */
export function currentFinancialActivityCondition(
  verifiedAt: SQLWrapper,
  createdAt: SQLWrapper,
  cutoff: Date | string | null | undefined,
): SQL {
  return sql`COALESCE(${verifiedAt}, ${createdAt}) >= ${parseFinancialHistoryCutoff(cutoff)}`;
}
