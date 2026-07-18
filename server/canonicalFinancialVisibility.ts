import { and, eq, isNull, sql } from "drizzle-orm";
import { billingBatches, drivers, financialBatchExceptions, financialBatchMemberships, financialHistoryRecords, owners, payments, washoutActivities, washoutLocations } from "../shared/schema";
import { db } from "./db";
import { CANONICAL_FINANCIAL_BATCH_MODEL_VERSION } from "./financialBatchDrafts";
import { CANONICAL_VERIFIED_ACTIVITY_OBLIGATION_KIND, parseFrozenDollarCents } from "./financialObligations";
import { HISTORICAL_TEST_DATA_CLASSIFICATION } from "./financialHistory";

export type CanonicalFinancialMetric = { count: number; driverIncentiveCents: number | null; platformFeeCents: number | null; facilityChargeCents: number | null };
export type CanonicalFinancialVisibilitySummary = {
  missingObligations: { count: number };
  openCanonicalObligations: CanonicalFinancialMetric;
  draftBatches: CanonicalFinancialMetric;
  readyForReview: CanonicalFinancialMetric;
  approvedNotExecuted: CanonicalFinancialMetric;
  exceptions: { count: number };
  historicalTestData: { activityCount: number; verifiedActivityCount: number; recordCount: number };
  generatedAt: string;
};

function validDate(value: unknown) { return value instanceof Date ? !Number.isNaN(value.getTime()) : !Number.isNaN(new Date(String(value)).getTime()); }
function isCents(value: unknown): value is number { return Number.isSafeInteger(value) && Number(value) >= 0; }
export function buildCanonicalFinancialMetric(rows: Array<{ incentive: unknown; fee: unknown; facility: unknown }>): CanonicalFinancialMetric {
  let valid = true; let driver = 0; let fee = 0; let facility = 0;
  for (const row of rows) {
    if (!isCents(row.incentive) || !isCents(row.fee) || !isCents(row.facility) || row.facility !== row.incentive + row.fee) { valid = false; continue; }
    driver += row.incentive; fee += row.fee; facility += row.facility;
    if (!Number.isSafeInteger(driver) || !Number.isSafeInteger(fee) || !Number.isSafeInteger(facility)) valid = false;
  }
  return { count: rows.length, driverIncentiveCents: valid ? driver : null, platformFeeCents: valid ? fee : null, facilityChargeCents: valid ? facility : null };
}

/** Read-only aggregate of only versioned canonical records. It never reads legacy ledgers or mutable rates. */
export async function getCanonicalFinancialVisibilitySummary(): Promise<CanonicalFinancialVisibilitySummary> {
  const [missingRows, obligationRows, batchRows, exceptionRows, historicalActivityRows, historicalRecordRows] = await Promise.all([
    db.select({ activityId: washoutActivities.id, amount: washoutActivities.amount, verifiedAt: washoutActivities.verifiedAt, driverId: drivers.id, locationId: washoutLocations.id, facilityId: owners.id, paymentId: payments.id })
      .from(washoutActivities).leftJoin(financialHistoryRecords, sql`${financialHistoryRecords.recordType} = 'washout_activity' AND ${financialHistoryRecords.recordId} = ${washoutActivities.id} AND ${financialHistoryRecords.classification} = ${HISTORICAL_TEST_DATA_CLASSIFICATION}`).leftJoin(payments, and(eq(payments.activityId, washoutActivities.id), eq(payments.obligationKind, CANONICAL_VERIFIED_ACTIVITY_OBLIGATION_KIND))).leftJoin(drivers, eq(drivers.id, washoutActivities.driverId)).leftJoin(washoutLocations, eq(washoutLocations.id, washoutActivities.locationId)).leftJoin(owners, eq(owners.id, washoutLocations.ownerId)).where(and(eq(washoutActivities.status, "verified"), isNull(financialHistoryRecords.id))),
    db.select({ amount: payments.amount, processingFee: payments.processingFee, membershipId: financialBatchMemberships.id })
      .from(payments).leftJoin(financialBatchMemberships, and(eq(financialBatchMemberships.paymentId, payments.id), eq(financialBatchMemberships.state, "active")))
      .where(and(
        eq(payments.obligationKind, CANONICAL_VERIFIED_ACTIVITY_OBLIGATION_KIND),
        eq(payments.status, "pending"),
        isNull(payments.batchId),
        isNull(payments.paidAt),
        // Transfer evidence is the only provider-related payments field proven
        // by repository migration history. Payment-intent and charge fields are
        // intentionally never selected or filtered here.
        isNull(payments.stripeTransferId),
      )),
    db.select({ state: billingBatches.canonicalState, incentive: billingBatches.frozenDriverIncentiveCents, fee: billingBatches.frozenPlatformFeeCents, facility: billingBatches.frozenFacilityChargeCents })
      .from(billingBatches).where(eq(billingBatches.batchModelVersion, CANONICAL_FINANCIAL_BATCH_MODEL_VERSION)),
    db.select({ id: financialBatchExceptions.id }).from(financialBatchExceptions).where(eq(financialBatchExceptions.status, "open")),
    db.select({ status: washoutActivities.status }).from(financialHistoryRecords).innerJoin(washoutActivities, and(eq(financialHistoryRecords.recordType, "washout_activity"), eq(financialHistoryRecords.recordId, washoutActivities.id))).where(eq(financialHistoryRecords.classification, HISTORICAL_TEST_DATA_CLASSIFICATION)),
    db.select({ id: financialHistoryRecords.id }).from(financialHistoryRecords).where(eq(financialHistoryRecords.classification, HISTORICAL_TEST_DATA_CLASSIFICATION)),
  ]);
  const missingCount = missingRows.filter((row) => {
    if (row.paymentId || !row.driverId || !row.locationId || !row.facilityId || !validDate(row.verifiedAt)) return false;
    try { parseFrozenDollarCents(row.amount, "invalid_frozen_activity_amount", "Invalid canonical amount"); return true; } catch { return false; }
  }).length;
  const open = obligationRows.filter((row) => !row.membershipId).map((row) => {
    try { const incentive = parseFrozenDollarCents(row.amount, "invalid_frozen_activity_amount", "Invalid canonical amount"); const fee = parseFrozenDollarCents(row.processingFee, "invalid_platform_fee", "Invalid canonical fee"); return { incentive, fee, facility: incentive + fee }; } catch { return { incentive: null, fee: null, facility: null }; }
  });
  const batchMetric = (state: string) => buildCanonicalFinancialMetric(batchRows.filter((row) => row.state === state).map((row) => ({ incentive: row.incentive, fee: row.fee, facility: row.facility })));
  return { missingObligations: { count: missingCount }, openCanonicalObligations: buildCanonicalFinancialMetric(open), draftBatches: batchMetric("draft"), readyForReview: batchMetric("ready_for_review"), approvedNotExecuted: batchMetric("approved"), exceptions: { count: exceptionRows.length }, historicalTestData: { activityCount: historicalActivityRows.length, verifiedActivityCount: historicalActivityRows.filter((row) => row.status === "verified").length, recordCount: historicalRecordRows.length }, generatedAt: new Date().toISOString() };
}
