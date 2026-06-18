import { normalizeMoneyToCents } from "./money";
import { resolveWashoutDriverTipCents } from "./locationBilling";
import { isBillableWashoutForOwnerBilling } from "./washoutApproval";

export type OwnerBillingReceivableRow = {
  activityStatus?: string | null;
  activityFeeCentsPlatform?: number | string | null;
  activityAmount?: number | string | null;
  locationDriverTipRate?: number | string | null;
  paymentStatus?: string | null;
  paymentBatchId?: string | null;
};

export type OwnerBillingReceivablesSummary = {
  platformFeesOwedCents: number;
  platformFeesPaidCents: number;
  platformFeesTotalCents: number;
  approvedWashoutCount: number;
  billedWashoutCount: number;
  unbilledApprovedWashoutCount: number;
  pendingWashoutCount: number;
  needsReviewWashoutCount: number;
  declinedWashoutCount: number;
  rejectedWashoutCount: number;
  cancelledWashoutCount: number;
  driverTipTotalCents: number;
};

const BILLED_PAYMENT_STATUSES = new Set(["paid", "posted", "completed", "succeeded"]);
const PENDING_WASHOUT_STATUSES = new Set(["pending", "awaiting_driver_stripe", "pending_driver_onboarding"]);
const NEEDS_REVIEW_STATUSES = new Set(["needs_review", "photo_review"]);
const DECLINED_STATUSES = new Set(["declined"]);
const REJECTED_STATUSES = new Set(["rejected"]);
const CANCELLED_STATUSES = new Set(["cancelled", "canceled"]);

function normalizeStatus(status?: string | null): string {
  return String(status || "").trim().toLowerCase();
}

function toCents(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === "") {
    return 0;
  }
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
}

export function summarizeOwnerBillingReceivables(
  rows: OwnerBillingReceivableRow[],
  ownerPlatformFeeCents?: number | string | null,
  defaultPlatformFeeCents = 500,
): OwnerBillingReceivablesSummary {
  return rows.reduce<OwnerBillingReceivablesSummary>((summary, row) => {
    const activityStatus = normalizeStatus(row.activityStatus);
    const paymentStatus = normalizeStatus(row.paymentStatus);
    const approved = isBillableWashoutForOwnerBilling({ status: activityStatus });
    const billed = BILLED_PAYMENT_STATUSES.has(paymentStatus) || Boolean(String(row.paymentBatchId || "").trim());
    const platformFeeCents = ownerPlatformFeeCents !== null && ownerPlatformFeeCents !== undefined && ownerPlatformFeeCents !== ""
      ? normalizeMoneyToCents(ownerPlatformFeeCents, "auto")
      : defaultPlatformFeeCents;
    const driverTipCents = resolveWashoutDriverTipCents(row.activityAmount ?? null, row.locationDriverTipRate ?? null);

    if (approved) {
      summary.approvedWashoutCount += 1;
      summary.driverTipTotalCents += driverTipCents;
      if (billed) {
        summary.billedWashoutCount += 1;
        summary.platformFeesPaidCents += platformFeeCents;
      } else {
        summary.unbilledApprovedWashoutCount += 1;
        summary.platformFeesOwedCents += Number.isFinite(platformFeeCents) ? platformFeeCents : defaultPlatformFeeCents;
      }
      summary.platformFeesTotalCents += Number.isFinite(platformFeeCents) ? platformFeeCents : defaultPlatformFeeCents;
      return summary;
    }

    if (PENDING_WASHOUT_STATUSES.has(activityStatus) || (!activityStatus && PENDING_WASHOUT_STATUSES.has(paymentStatus))) {
      summary.pendingWashoutCount += 1;
      return summary;
    }

    if (NEEDS_REVIEW_STATUSES.has(activityStatus) || NEEDS_REVIEW_STATUSES.has(paymentStatus)) {
      summary.needsReviewWashoutCount += 1;
      return summary;
    }

    if (DECLINED_STATUSES.has(activityStatus) || DECLINED_STATUSES.has(paymentStatus)) {
      summary.declinedWashoutCount += 1;
      return summary;
    }

    if (REJECTED_STATUSES.has(activityStatus) || REJECTED_STATUSES.has(paymentStatus)) {
      summary.rejectedWashoutCount += 1;
      return summary;
    }

    if (CANCELLED_STATUSES.has(activityStatus) || CANCELLED_STATUSES.has(paymentStatus)) {
      summary.cancelledWashoutCount += 1;
      return summary;
    }

    return summary;
  }, {
    platformFeesOwedCents: 0,
    platformFeesPaidCents: 0,
    platformFeesTotalCents: 0,
    approvedWashoutCount: 0,
    billedWashoutCount: 0,
    unbilledApprovedWashoutCount: 0,
    pendingWashoutCount: 0,
    needsReviewWashoutCount: 0,
    declinedWashoutCount: 0,
    rejectedWashoutCount: 0,
    cancelledWashoutCount: 0,
    driverTipTotalCents: 0,
  });
}
