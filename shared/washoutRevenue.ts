export type WashoutPaymentRevenueRow = {
  status?: string | null;
  processingFee?: string | number | null;
  tipAmountCents?: number | null;
};

export type WashoutActivityRevenueRow = {
  activityStatus?: string | null;
  paymentStatus?: string | null;
  activityFeeCentsPlatform?: number | null;
  platformFeeCents?: number | null;
  locationDriverIncentiveTipCents?: number | null;
  paymentProcessingFee?: string | number | null;
  paymentTipAmountCents?: number | null;
};

export type WashoutRevenueSummary = {
  platformWashoutRevenue: number;
  driverTipTotal: number;
  approvedWashouts: number;
  billedWashouts: number;
  pendingWashouts: number;
  failedWashouts: number;
  refundedWashouts: number;
  disputedWashouts: number;
};

const BILLED_STATUSES = new Set(["paid", "posted", "completed", "succeeded"]);
const PENDING_STATUSES = new Set(["pending", "awaiting_driver_stripe", "pending_driver_onboarding"]);
const FAILED_STATUSES = new Set(["failed"]);
const REFUNDED_STATUSES = new Set(["refunded"]);
const DISPUTED_STATUSES = new Set(["disputed"]);

function toMoneyNumber(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === "") return 0;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function summarizeWashoutRevenue(rows: WashoutPaymentRevenueRow[]): WashoutRevenueSummary {
  return rows.reduce<WashoutRevenueSummary>((summary, row) => {
    const status = String(row.status || "").toLowerCase();
    const processingFee = toMoneyNumber(row.processingFee);
    const tipTotal = Math.max(0, Number(row.tipAmountCents || 0)) / 100;

    if (BILLED_STATUSES.has(status)) {
      summary.platformWashoutRevenue += processingFee;
      summary.driverTipTotal += tipTotal;
      summary.billedWashouts += 1;
    } else if (PENDING_STATUSES.has(status)) {
      summary.pendingWashouts += 1;
    } else if (FAILED_STATUSES.has(status)) {
      summary.failedWashouts += 1;
    } else if (REFUNDED_STATUSES.has(status)) {
      summary.refundedWashouts += 1;
    } else if (DISPUTED_STATUSES.has(status)) {
      summary.disputedWashouts += 1;
    }

    return summary;
  }, {
    platformWashoutRevenue: 0,
    driverTipTotal: 0,
    approvedWashouts: 0,
    billedWashouts: 0,
    pendingWashouts: 0,
    failedWashouts: 0,
    refundedWashouts: 0,
    disputedWashouts: 0,
  });
}

function normalizeActivityStatus(status?: string | null): string {
  return String(status || "").trim().toLowerCase();
}

function resolveActivityPlatformFeeCents(row: WashoutActivityRevenueRow): number {
  const rowFee = Number(row.activityFeeCentsPlatform ?? row.platformFeeCents ?? 0);
  return Number.isFinite(rowFee) ? Math.max(0, Math.round(rowFee)) : 0;
}

export function summarizeWashoutRevenueFromActivities(
  rows: WashoutActivityRevenueRow[],
): WashoutRevenueSummary {
  return rows.reduce<WashoutRevenueSummary>((summary, row) => {
    const activityStatus = normalizeActivityStatus(row.activityStatus);
    const paymentStatus = normalizeActivityStatus(row.paymentStatus);
    const platformFeeCents = resolveActivityPlatformFeeCents(row);
    const driverTipCents = Math.max(0, Number(row.paymentTipAmountCents ?? row.locationDriverIncentiveTipCents ?? 0));
    const approved = ["verified", "approved", "completed", "paid", "settled"].includes(activityStatus);
    const billed = ["paid", "posted", "completed", "succeeded"].includes(paymentStatus);
    const pending = !paymentStatus || ["pending", "awaiting_driver_stripe", "pending_driver_onboarding"].includes(paymentStatus);
    const failed = ["failed", "canceled", "cancelled"].includes(paymentStatus);
    const refunded = ["refunded", "refund"].includes(paymentStatus);
    const disputed = paymentStatus === "disputed";

    if (approved) {
      if (failed) {
        summary.failedWashouts += 1;
        return summary;
      }
      if (refunded) {
        summary.refundedWashouts += 1;
        return summary;
      }
      if (disputed) {
        summary.disputedWashouts += 1;
        return summary;
      }
      summary.approvedWashouts += 1;
      summary.platformWashoutRevenue += platformFeeCents / 100;
      summary.driverTipTotal += driverTipCents / 100;
      if (billed) summary.billedWashouts += 1;
      else summary.pendingWashouts += 1;
      return summary;
    }

    if (pending) {
      summary.pendingWashouts += 1;
    } else if (failed) {
      summary.failedWashouts += 1;
    } else if (refunded) {
      summary.refundedWashouts += 1;
    } else if (disputed) {
      summary.disputedWashouts += 1;
    }

    return summary;
  }, {
    platformWashoutRevenue: 0,
    driverTipTotal: 0,
    approvedWashouts: 0,
    billedWashouts: 0,
    pendingWashouts: 0,
    failedWashouts: 0,
    refundedWashouts: 0,
    disputedWashouts: 0,
  });
}
