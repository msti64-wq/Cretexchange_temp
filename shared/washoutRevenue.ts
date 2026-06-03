export type WashoutPaymentRevenueRow = {
  status?: string | null;
  processingFee?: string | number | null;
  tipAmountCents?: number | null;
};

export type WashoutRevenueSummary = {
  platformWashoutRevenue: number;
  driverTipTotal: number;
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
    billedWashouts: 0,
    pendingWashouts: 0,
    failedWashouts: 0,
    refundedWashouts: 0,
    disputedWashouts: 0,
  });
}
