import { calculateOwnerWashoutBillingLedger, type OwnerBillingLedger, type OwnerBillingTransferEntry } from "../../shared/billingPolicy";

export type BillableWashout = {
  id: string;
  ownerId: string;
  driverId: string;
  driverStripeAccountId?: string | null;
  platformFeeCents: number;
  driverTipCents: number;
  alreadyBilled?: boolean;
};

export type DriverTransferLedger = {
  driverId: string;
  connectedAccountId: string;
  washoutActivityIds: string[];
  tipAmountCents: number;
  amountCents: number;
  transferId?: string | null;
  stripeChargeId?: string | null;
};

export type ReportingBillingBatchStatus = "paid" | "pending" | "needs_review";

export type ReportingLedgerBatch = {
  id: string;
  ownerId: string;
  status?: string | null;
  totalAmount?: string | number | null;
  paymentCount?: number | null;
  metadata?: Record<string, unknown> | null;
  stripePaymentIntentId?: string | null;
  stripeBatchTransferId?: string | null;
};

export type ReportingLedgerPayment = {
  id: string;
  ownerId: string;
  driverId: string;
  activityId: string;
  amount?: string | number | null;
  processingFee?: string | number | null;
  tipAmountCents?: number | null;
  status?: string | null;
  batchId?: string | null;
  stripePaymentIntentId?: string | null;
  stripeTransferId?: string | null;
  stripeChargeId?: string | null;
};

export type ReportingLedgerSummary = {
  platformRevenueCents: number;
  ownerChargeTotalCents: number;
  driverTipTotalCents: number;
  driverTransferTotalCents: number;
  unpaidReceivablesCents: number;
  paidReceivablesCents: number;
  needsReviewCents: number;
  approvedWashoutCount: number;
  billedWashoutCount: number;
  ownerCount: number;
};

export type OwnerWashoutBillingPreview = {
  dryRun: true;
  title: string;
  validation: {
    passed: boolean;
    blockedForReview: boolean;
    reviewThresholdCents: number;
    reason: string | null;
  };
  ledger: Pick<OwnerBillingLedger,
    "approvedWashoutCount" |
    "platformFeeTotalCents" |
    "driverTipTotalCents" |
    "ownerChargeAmountCents" |
    "platformRevenueCents" |
    "driverTransfers"
  >;
  stripePaymentIntentPreview: {
    amount: number;
    currency: string;
    customer: string | null;
    payment_method: string | null;
    confirm: boolean;
    off_session: boolean;
    payment_method_types: string[];
    description: string;
    metadata: Record<string, string>;
  };
  stripeTransferPreviews: Array<{
    amount: number;
    currency: string;
    destination: string;
    description: string;
    metadata: Record<string, string>;
  }>;
};

const PAID_STATUSES = new Set(["paid", "posted", "completed", "succeeded"]);
const NEEDS_REVIEW_STATUSES = new Set(["needs_review", "photo_review", "failed", "rejected", "disputed"]);

function toCents(value: unknown): number {
  if (value === null || value === undefined || value === "") {
    return 0;
  }

  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
}

function normalizeBatchStatus(status?: string | null): ReportingBillingBatchStatus {
  const normalized = String(status || "").trim().toLowerCase();
  if (PAID_STATUSES.has(normalized)) {
    return "paid";
  }
  if (NEEDS_REVIEW_STATUSES.has(normalized)) {
    return "needs_review";
  }
  return "pending";
}

function normalizeTransfer(transfer: OwnerBillingTransferEntry): DriverTransferLedger {
  return {
    driverId: transfer.driverId,
    connectedAccountId: transfer.connectedAccountId || "",
    washoutActivityIds: transfer.washoutActivityIds || [],
    tipAmountCents: Math.max(0, Math.round(Number(transfer.amountCents || 0))),
    amountCents: Math.max(0, Math.round(Number(transfer.amountCents || 0))),
    transferId: transfer.transferId || null,
    stripeChargeId: null,
  };
}

export function buildOwnerWashoutBillingLedgerFromBillableWashouts(params: {
  ownerId: string;
  billingBatchId: string;
  washouts: BillableWashout[];
  allowAdminOverride?: boolean;
  immediateBilling?: boolean;
}): OwnerBillingLedger {
  const billable = params.washouts.filter((washout) => washout.ownerId === params.ownerId && !washout.alreadyBilled);
  const washoutActivityIds = billable.map((washout) => washout.id);
  const platformFeeCentsByWashout = billable.map((washout) => Math.max(0, Math.round(Number(washout.platformFeeCents || 0))));
  const driverTipCentsByWashout = billable.map((washout) => Math.max(0, Math.round(Number(washout.driverTipCents || 0))));
  const driverTipCentsByDriver = billable.reduce<Record<string, number>>((acc, washout) => {
    acc[washout.driverId] = (acc[washout.driverId] || 0) + Math.max(0, Math.round(Number(washout.driverTipCents || 0)));
    return acc;
  }, {});
  const driverTransfers = Object.entries(driverTipCentsByDriver).map(([driverId, tipAmountCents]) => {
    const driverWashoutIds = billable
      .filter((washout) => washout.driverId === driverId)
      .map((washout) => washout.id);
    const connectedAccountId = billable.find((washout) => washout.driverId === driverId)?.driverStripeAccountId || "";
    return normalizeTransfer({
      driverId,
      connectedAccountId,
      amountCents: tipAmountCents,
      washoutActivityIds: driverWashoutIds,
    });
  });

  return calculateOwnerWashoutBillingLedger({
    ownerId: params.ownerId,
    billingBatchId: params.billingBatchId,
    washoutActivityIds,
    approvedWashoutCount: billable.length,
    platformFeeCentsByWashout,
    platformFeeTotalCents: platformFeeCentsByWashout.reduce((sum, cents) => sum + cents, 0),
    driverTipCentsByWashout,
    driverTipCentsByDriver,
    driverTipTotalCents: driverTipCentsByWashout.reduce((sum, cents) => sum + cents, 0),
    ownerChargeAmountCents: platformFeeCentsByWashout.reduce((sum, cents) => sum + cents, 0) + driverTipCentsByWashout.reduce((sum, cents) => sum + cents, 0),
    platformRevenueCents: platformFeeCentsByWashout.reduce((sum, cents) => sum + cents, 0),
    driverTransfers,
    allowAdminOverride: Boolean(params.allowAdminOverride),
    immediateBilling: Boolean(params.immediateBilling),
  });
}

export function buildOwnerWashoutBillingLedgerFromPayments(params: {
  ownerId: string;
  billingBatchId: string;
  payments: ReportingLedgerPayment[];
  allowAdminOverride?: boolean;
  immediateBilling?: boolean;
}): OwnerBillingLedger {
  const billablePayments = params.payments.filter((payment) => payment.ownerId === params.ownerId);
  const washoutActivityIds = billablePayments.map((payment) => payment.activityId);
  const platformFeeCentsByWashout = billablePayments.map((payment) => toCents(payment.processingFee));
  const driverTipCentsByWashout = billablePayments.map((payment) => Math.max(0, Math.round(Number(payment.tipAmountCents || 0))));
  const driverTipCentsByDriver = billablePayments.reduce<Record<string, number>>((acc, payment) => {
    acc[payment.driverId] = (acc[payment.driverId] || 0) + Math.max(0, Math.round(Number(payment.tipAmountCents || 0)));
    return acc;
  }, {});
  const driverTransfers = billablePayments.reduce<DriverTransferLedger[]>((acc, payment) => {
    const tipAmountCents = Math.max(0, Math.round(Number(payment.tipAmountCents || 0)));
    const existing = acc.find((entry) => entry.driverId === payment.driverId);
    if (existing) {
      existing.tipAmountCents += tipAmountCents;
      existing.washoutActivityIds.push(payment.activityId);
      if (!existing.connectedAccountId && payment.stripeTransferId) {
        existing.transferId = payment.stripeTransferId;
      }
      if (!existing.stripeChargeId && payment.stripeChargeId) {
        existing.stripeChargeId = payment.stripeChargeId;
      }
      return acc;
    }
    acc.push({
      driverId: payment.driverId,
      connectedAccountId: "",
      washoutActivityIds: [payment.activityId],
      tipAmountCents,
      amountCents: tipAmountCents,
      transferId: payment.stripeTransferId || null,
      stripeChargeId: payment.stripeChargeId || null,
    });
    return acc;
  }, []);

  return calculateOwnerWashoutBillingLedger({
    ownerId: params.ownerId,
    billingBatchId: params.billingBatchId,
    washoutActivityIds,
    approvedWashoutCount: billablePayments.length,
    platformFeeCentsByWashout,
    platformFeeTotalCents: platformFeeCentsByWashout.reduce((sum, cents) => sum + cents, 0),
    driverTipCentsByWashout,
    driverTipCentsByDriver,
    driverTipTotalCents: driverTipCentsByWashout.reduce((sum, cents) => sum + cents, 0),
    ownerChargeAmountCents: platformFeeCentsByWashout.reduce((sum, cents) => sum + cents, 0) + driverTipCentsByWashout.reduce((sum, cents) => sum + cents, 0),
    platformRevenueCents: platformFeeCentsByWashout.reduce((sum, cents) => sum + cents, 0),
    driverTransfers,
    allowAdminOverride: Boolean(params.allowAdminOverride),
    immediateBilling: Boolean(params.immediateBilling),
  });
}

export function summarizeReportingLedgerCollection(ledgers: Array<OwnerBillingLedger & { billingStatus?: ReportingBillingBatchStatus }>): ReportingLedgerSummary {
  const summary = ledgers.reduce<ReportingLedgerSummary>((acc, ledger) => {
    acc.ownerCount += ledger.ownerId ? 1 : 0;
    acc.approvedWashoutCount += Number(ledger.approvedWashoutCount || 0);
    acc.platformRevenueCents += Number(ledger.platformRevenueCents || 0);
    acc.ownerChargeTotalCents += Number(ledger.ownerChargeAmountCents || 0);
    acc.driverTipTotalCents += Number(ledger.driverTipTotalCents || 0);
    acc.driverTransferTotalCents += ledger.driverTransfers.reduce((sum, transfer) => sum + Number(transfer.amountCents || 0), 0);

    const status = ledger.billingStatus || "pending";
    if (status === "paid") {
      acc.paidReceivablesCents += Number(ledger.ownerChargeAmountCents || 0);
      acc.billedWashoutCount += Number(ledger.approvedWashoutCount || 0);
    } else if (status === "needs_review") {
      acc.needsReviewCents += Number(ledger.ownerChargeAmountCents || 0);
    } else {
      acc.unpaidReceivablesCents += Number(ledger.ownerChargeAmountCents || 0);
    }
    return acc;
  }, {
    platformRevenueCents: 0,
    ownerChargeTotalCents: 0,
    driverTipTotalCents: 0,
    driverTransferTotalCents: 0,
    unpaidReceivablesCents: 0,
    paidReceivablesCents: 0,
    needsReviewCents: 0,
    approvedWashoutCount: 0,
    billedWashoutCount: 0,
    ownerCount: 0,
  });

  console.log("[REPORTING_RECONCILIATION]", summary);
  return summary;
}

export function getReportingBillingStatus(status?: string | null): ReportingBillingBatchStatus {
  return normalizeBatchStatus(status);
}

export function buildOwnerWashoutBillingPreview(params: {
  ownerId: string;
  billingBatchId: string;
  washouts: BillableWashout[];
  customerId: string | null;
  paymentMethodId: string | null;
  runType?: string;
  ownerUsername?: string | null;
  ownerCompanyName?: string | null;
  ownerChargeDescription?: string;
}): OwnerWashoutBillingPreview {
  const ledger = buildOwnerWashoutBillingLedgerFromBillableWashouts({
    ownerId: params.ownerId,
    billingBatchId: params.billingBatchId,
    washouts: params.washouts,
    allowAdminOverride: true,
    immediateBilling: false,
  });

  const paymentIntentMetadata: Record<string, string> = {
    batchId: ledger.billingBatchId,
    ownerId: params.ownerId,
    washoutCount: String(ledger.approvedWashoutCount),
    amountCents: String(ledger.ownerChargeAmountCents),
    platformFeeCentsPerWashout: ledger.platformFeeCentsByWashout.join(","),
    driverTipCentsPerWashout: ledger.driverTipCentsByWashout.join(","),
    stripeChargeAmountCents: String(ledger.ownerChargeAmountCents),
    washoutActivityIds: ledger.washoutActivityIds.join(","),
    platformFeeTotal: (ledger.platformFeeTotalCents / 100).toFixed(2),
    driverTipTotal: (ledger.driverTipTotalCents / 100).toFixed(2),
  };

  const stripePaymentIntentPreview = {
    amount: ledger.ownerChargeAmountCents,
    currency: "usd",
    customer: params.customerId,
    payment_method: params.paymentMethodId,
    confirm: true,
    off_session: true,
    payment_method_types: ["card"],
    description: params.ownerChargeDescription || `Owner platform billing - ${ledger.approvedWashoutCount} approved washouts`,
    metadata: paymentIntentMetadata,
  };

  const stripeTransferPreviews = ledger.driverTransfers.map((transfer) => ({
    amount: transfer.amountCents,
    currency: "usd",
    destination: transfer.connectedAccountId || "",
    description: `Washout tip transfer - ${(transfer.washoutActivityIds || []).join(",")}`,
    metadata: {
      ownerId: params.ownerId,
      batchId: ledger.billingBatchId,
      driverId: transfer.driverId,
      washoutActivityIds: (transfer.washoutActivityIds || []).join(","),
      driverTip: (transfer.amountCents / 100).toFixed(2),
      type: "driver_washout_payout",
    },
  }));

  console.log("[OWNER_BILLING_DRY_RUN]", {
    ownerId: params.ownerId,
    billingBatchId: ledger.billingBatchId,
    approvedWashoutCount: ledger.approvedWashoutCount,
    platformFeeTotalCents: ledger.platformFeeTotalCents,
    driverTipTotalCents: ledger.driverTipTotalCents,
    ownerChargeAmountCents: ledger.ownerChargeAmountCents,
    platformRevenueCents: ledger.platformRevenueCents,
    driverTransfers: ledger.driverTransfers,
  });
  console.log("[STRIPE_PAYMENT_REQUEST_PREVIEW]", stripePaymentIntentPreview);
  for (const transferPreview of stripeTransferPreviews) {
  console.log("[DRIVER_TIP_TRANSFER_PREVIEW]", transferPreview);
  }

  return {
    dryRun: true,
    title: "Owner washout billing preview",
    validation: {
      passed: true,
      blockedForReview: ledger.ownerChargeAmountCents > 10000,
      reviewThresholdCents: 10000,
      reason: ledger.ownerChargeAmountCents > 10000
        ? "Immediate owner charge exceeds review threshold"
        : null,
    },
    ledger: {
      approvedWashoutCount: ledger.approvedWashoutCount,
      platformFeeTotalCents: ledger.platformFeeTotalCents,
      driverTipTotalCents: ledger.driverTipTotalCents,
      ownerChargeAmountCents: ledger.ownerChargeAmountCents,
      platformRevenueCents: ledger.platformRevenueCents,
      driverTransfers: ledger.driverTransfers,
    },
    stripePaymentIntentPreview,
    stripeTransferPreviews,
  };
}
