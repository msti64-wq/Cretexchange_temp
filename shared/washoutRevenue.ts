import { isBillableWashoutForOwnerBilling } from "./washoutApproval";
import { normalizeMoneyToCents } from "./money";
import { resolveApprovedWashoutDriverTipCents } from "./locationBilling";

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
  activityAmount?: string | number | null;
  locationDriverTipRate?: string | number | null;
  paymentDriverTipCents?: number | null;
  paymentProcessingFee?: string | number | null;
  paymentTipAmountCents?: number | null;
};

export type WashoutRevenueSummary = {
  platformWashoutRevenueCents: number;
  platformWashoutPaidRevenueCents: number;
  driverTipTotalCents: number;
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

function toCents(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === "") return 0;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed * 100)) : 0;
}

export function summarizeWashoutRevenue(rows: WashoutPaymentRevenueRow[]): WashoutRevenueSummary {
  return rows.reduce<WashoutRevenueSummary>((summary, row) => {
    const status = String(row.status || "").toLowerCase();
    const processingFeeCents = toCents(row.processingFee);
    const tipTotalCents = normalizeMoneyToCents(row.tipAmountCents, "auto");

    if (BILLED_STATUSES.has(status)) {
      summary.platformWashoutRevenueCents += processingFeeCents;
      summary.platformWashoutPaidRevenueCents += processingFeeCents;
      summary.driverTipTotalCents += tipTotalCents;
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
    platformWashoutRevenueCents: 0,
    platformWashoutPaidRevenueCents: 0,
    driverTipTotalCents: 0,
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

function resolveActivityPlatformFeeCents(
  row: WashoutActivityRevenueRow,
  defaultPlatformFeeCents: number,
): number {
  if (row.activityFeeCentsPlatform !== null && row.activityFeeCentsPlatform !== undefined) {
    const rowFee = normalizeMoneyToCents(row.activityFeeCentsPlatform, "auto");
    return Number.isFinite(rowFee) ? rowFee : Math.max(0, Math.round(defaultPlatformFeeCents));
  }

  if (row.platformFeeCents !== null && row.platformFeeCents !== undefined) {
    const legacyFee = normalizeMoneyToCents(row.platformFeeCents, "auto");
    return Number.isFinite(legacyFee) ? legacyFee : Math.max(0, Math.round(defaultPlatformFeeCents));
  }

  return Math.max(0, Math.round(defaultPlatformFeeCents));
}

export function summarizeWashoutRevenueFromActivities(
  rows: WashoutActivityRevenueRow[],
  defaultPlatformFeeCents = 500,
): WashoutRevenueSummary {
  return rows.reduce<WashoutRevenueSummary>((summary, row) => {
    const activityStatus = normalizeActivityStatus(row.activityStatus);
    const paymentStatus = normalizeActivityStatus(row.paymentStatus);
    const platformFeeCents = resolveActivityPlatformFeeCents(row, defaultPlatformFeeCents);
    const activityAmount = row.activityAmount ?? null;
    const locationDriverTipRate = row.locationDriverTipRate ?? null;
    const driverTipCents = resolveApprovedWashoutDriverTipCents(activityAmount, row.paymentDriverTipCents ?? null, locationDriverTipRate);
    const approved = isBillableWashoutForOwnerBilling({ status: activityStatus });
    const billed = ["paid", "posted", "completed", "succeeded"].includes(paymentStatus);
    const pending = !approved && (
      !paymentStatus || ["pending", "awaiting_driver_stripe", "pending_driver_onboarding"].includes(paymentStatus)
    );
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
      summary.platformWashoutRevenueCents += platformFeeCents;
      summary.driverTipTotalCents += driverTipCents;
      if (billed) {
        summary.billedWashouts += 1;
        summary.platformWashoutPaidRevenueCents += platformFeeCents;
      }
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
    platformWashoutRevenueCents: 0,
    platformWashoutPaidRevenueCents: 0,
    driverTipTotalCents: 0,
    approvedWashouts: 0,
    billedWashouts: 0,
    pendingWashouts: 0,
    failedWashouts: 0,
    refundedWashouts: 0,
    disputedWashouts: 0,
  });
}
