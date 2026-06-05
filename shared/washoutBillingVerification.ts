import { isApprovedWashout } from "./washoutApproval";

export type WashoutBillingVerificationRow = {
  activityId: string;
  ownerId: string;
  ownerCompanyName?: string | null;
  locationId: string;
  locationName?: string | null;
  status?: string | null;
  paymentStatus?: string | null;
  feeCentsPlatform?: number | null;
  ownerCustomPlatformFeeCents?: number | null;
  driverIncentiveTipCents?: number | null;
  paymentId?: string | null;
  stripePaymentIntentId?: string | null;
  stripeChargeId?: string | null;
};

export type WashoutBillingVerificationBreakdown = {
  ownerId: string;
  ownerCompanyName: string;
  locationId: string;
  locationName: string;
  totalWashouts: number;
  approvedWashouts: number;
  approvedBillableWashouts: number;
  alreadyBilledWashouts: number;
  unbilledApprovedWashouts: number;
  declinedWashouts: number;
  rejectedWashouts: number;
  cancelledWashouts: number;
  pendingWashouts: number;
  needsReviewWashouts: number;
  platformFeeReceivableCents: number;
  platformFeeOwedCents: number;
  platformFeeBilledCents: number;
  driverIncentiveTipTotalCents: number;
  washoutIds: string[];
};

export type WashoutBillingVerificationReport = {
  totalWashouts: number;
  approvedWashouts: number;
  approvedBillableWashouts: number;
  alreadyBilledWashouts: number;
  unbilledApprovedWashouts: number;
  declinedWashouts: number;
  rejectedWashouts: number;
  cancelledWashouts: number;
  pendingWashouts: number;
  needsReviewWashouts: number;
  platformFeeReceivableCents: number;
  platformFeeOwedCents: number;
  platformFeeBilledCents: number;
  driverIncentiveTipTotalCents: number;
  washoutIdsByStatus: Record<string, string[]>;
  breakdownByOwnerLocation: WashoutBillingVerificationBreakdown[];
  dateRange: {
    startDate: string;
    endDate: string;
  };
  ownerId?: string | null;
};

const BILLED_PAYMENT_STATUSES = new Set(["paid", "posted", "completed", "succeeded"]);
const PENDING_PAYMENT_STATUSES = new Set(["pending", "awaiting_driver_stripe", "pending_driver_onboarding"]);
const NEEDS_REVIEW_STATUSES = new Set(["needs_review", "review", "pending_photo_approval", "photo_pending", "awaiting_photo_approval"]);
const DECLINED_STATUSES = new Set(["declined"]);
const REJECTED_STATUSES = new Set(["rejected"]);
const CANCELLED_STATUSES = new Set(["cancelled", "canceled"]);

function normalizeStatus(status?: string | null): string {
  return String(status || "").trim().toLowerCase();
}

function toFiniteCents(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.round(parsed);
}

function resolvePlatformFeeCents(
  row: WashoutBillingVerificationRow,
  defaultPlatformFeeCents: number,
): number {
  const stored = toFiniteCents(row.feeCentsPlatform);
  if (stored === null) {
    return Math.max(0, Math.round(defaultPlatformFeeCents));
  }

  if (stored > 0) {
    return stored;
  }

  const ownerOverride = toFiniteCents(row.ownerCustomPlatformFeeCents);
  if (ownerOverride !== null) {
    return Math.max(0, ownerOverride);
  }

  return Math.max(0, Math.round(defaultPlatformFeeCents));
}

function ensureArrayMapEntry(map: Record<string, string[]>, key: string): string[] {
  if (!map[key]) {
    map[key] = [];
  }
  return map[key];
}

function addUnique(values: string[], value: string): void {
  if (!values.includes(value)) {
    values.push(value);
  }
}

export function buildWashoutBillingVerificationReport(
  rows: WashoutBillingVerificationRow[],
  defaultPlatformFeeCents = 500,
  filters?: {
    ownerId?: string | null;
    startDate?: Date;
    endDate?: Date;
  },
): WashoutBillingVerificationReport {
  const washoutIdsByStatus: Record<string, string[]> = {};
  const breakdownMap = new Map<string, WashoutBillingVerificationBreakdown>();

  const report = rows.reduce<WashoutBillingVerificationReport>((summary, row) => {
    const status = normalizeStatus(row.status);
    const paymentStatus = normalizeStatus(row.paymentStatus);
    const activityId = String(row.activityId);
    const ownerId = String(row.ownerId);
    const ownerCompanyName = String(row.ownerCompanyName || "").trim() || ownerId;
    const locationId = String(row.locationId);
    const locationName = String(row.locationName || "").trim() || locationId;
    const platformFeeCents = resolvePlatformFeeCents(row, defaultPlatformFeeCents);
    const driverTipCents = Math.max(0, toFiniteCents(row.driverIncentiveTipCents) ?? 0);
    const approved = isApprovedWashout(status);
    const rejected = REJECTED_STATUSES.has(status);
    const declined = DECLINED_STATUSES.has(status);
    const cancelled = CANCELLED_STATUSES.has(status);
    const needsReview = NEEDS_REVIEW_STATUSES.has(status);
    const pending = !approved && !rejected && !declined && !cancelled && (
      !paymentStatus || PENDING_PAYMENT_STATUSES.has(paymentStatus) || (!needsReview && !declined && !cancelled && !rejected)
    );
    const billed = approved && BILLED_PAYMENT_STATUSES.has(paymentStatus);

    summary.totalWashouts += 1;
    addUnique(ensureArrayMapEntry(washoutIdsByStatus, status || "unknown"), activityId);

    if (approved) {
      summary.approvedWashouts += 1;
      summary.approvedBillableWashouts += 1;
      summary.platformFeeReceivableCents += platformFeeCents;
      summary.driverIncentiveTipTotalCents += driverTipCents;
      if (billed) {
        summary.alreadyBilledWashouts += 1;
        summary.platformFeeBilledCents += platformFeeCents;
      } else {
        summary.unbilledApprovedWashouts += 1;
        summary.platformFeeOwedCents += platformFeeCents;
      }
    } else if (rejected) {
      summary.rejectedWashouts += 1;
    } else if (declined) {
      summary.declinedWashouts += 1;
    } else if (cancelled) {
      summary.cancelledWashouts += 1;
    } else if (needsReview) {
      summary.needsReviewWashouts += 1;
    } else if (pending) {
      summary.pendingWashouts += 1;
    }

    const key = `${ownerId}::${locationId}`;
    const breakdown = breakdownMap.get(key) || {
      ownerId,
      ownerCompanyName,
      locationId,
      locationName,
      totalWashouts: 0,
      approvedWashouts: 0,
      approvedBillableWashouts: 0,
      alreadyBilledWashouts: 0,
      unbilledApprovedWashouts: 0,
      declinedWashouts: 0,
      rejectedWashouts: 0,
      cancelledWashouts: 0,
      pendingWashouts: 0,
      needsReviewWashouts: 0,
      platformFeeReceivableCents: 0,
      platformFeeOwedCents: 0,
      platformFeeBilledCents: 0,
      driverIncentiveTipTotalCents: 0,
      washoutIds: [],
    };

    breakdown.totalWashouts += 1;
    addUnique(breakdown.washoutIds, activityId);

    if (approved) {
      breakdown.approvedWashouts += 1;
      breakdown.approvedBillableWashouts += 1;
      breakdown.platformFeeReceivableCents += platformFeeCents;
      breakdown.driverIncentiveTipTotalCents += driverTipCents;
      if (billed) {
        breakdown.alreadyBilledWashouts += 1;
        breakdown.platformFeeBilledCents += platformFeeCents;
      } else {
        breakdown.unbilledApprovedWashouts += 1;
        breakdown.platformFeeOwedCents += platformFeeCents;
      }
    } else if (rejected) {
      breakdown.rejectedWashouts += 1;
    } else if (declined) {
      breakdown.declinedWashouts += 1;
    } else if (cancelled) {
      breakdown.cancelledWashouts += 1;
    } else if (needsReview) {
      breakdown.needsReviewWashouts += 1;
    } else if (pending) {
      breakdown.pendingWashouts += 1;
    }

    breakdownMap.set(key, breakdown);
    return summary;
  }, {
    totalWashouts: 0,
    approvedWashouts: 0,
    approvedBillableWashouts: 0,
    alreadyBilledWashouts: 0,
    unbilledApprovedWashouts: 0,
    declinedWashouts: 0,
    rejectedWashouts: 0,
    cancelledWashouts: 0,
    pendingWashouts: 0,
    needsReviewWashouts: 0,
    platformFeeReceivableCents: 0,
    platformFeeOwedCents: 0,
    platformFeeBilledCents: 0,
    driverIncentiveTipTotalCents: 0,
    washoutIdsByStatus,
    breakdownByOwnerLocation: [],
    dateRange: {
      startDate: filters?.startDate ? filters.startDate.toISOString() : "",
      endDate: filters?.endDate ? filters.endDate.toISOString() : "",
    },
    ownerId: filters?.ownerId || null,
  });

  report.breakdownByOwnerLocation = Array.from(breakdownMap.values()).sort((a, b) => {
    if (a.ownerCompanyName !== b.ownerCompanyName) return a.ownerCompanyName.localeCompare(b.ownerCompanyName);
    if (a.locationName !== b.locationName) return a.locationName.localeCompare(b.locationName);
    return a.ownerId.localeCompare(b.ownerId);
  });

  return report;
}
