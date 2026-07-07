import { calculateOwnerWashoutBillingLedger, type OwnerBillingLedger, type OwnerBillingTransferEntry } from "../../shared/billingPolicy";
import { normalizeMoneyToCents } from "../../shared/money";
import {
  getPaymentDriverIncentiveCents,
  getPaymentOwnerChargeCents,
  getPaymentPlatformFeeCents,
} from "../../shared/paymentAccounting";

export type BillableWashout = {
  id: string;
  ownerId: string;
  driverId: string;
  driverStripeAccountId?: string | null;
  platformFeeCents: number | string | null;
  activityAmount?: number | string | null;
  locationDriverTipRate?: number | string | null;
  paymentTipAmountCents?: number | string | null;
  driverTipCents?: number | string | null;
  driverTipOverrideCents?: number | string | null;
  alreadyBilled?: boolean;
};

export type ResolvedDriverTipForWashout = {
  washoutActivityId: string;
  ownerId: string;
  locationId?: string | null;
  driverId: string;
  driverStripeAccountId: string | null;
  driverTipCents: number;
  source: "washout_activities.amount" | "payments.amount" | "washout_locations.rate" | "request.forceDriverTipCents";
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
  tipAmountCents?: number | string | null;
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

export type ReportingDriverTipSummary = {
  driverId: string | null;
  driverTipTotalCents: number;
  driverTransferredCents: number;
  pendingTransferCents: number;
  transferCount: number;
  pendingCount: number;
  paidCount: number;
  transferIds: string[];
  washoutActivityIds: string[];
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
    "washoutActivityIds" |
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
  const interpretedAsCents = normalizeMoneyToCents(value, "dollars");
  console.log("[MONETARY_RECONCILIATION]", {
    source: "payment.processingFee",
    rawValue: value,
    interpretedAsCents,
    displayedDollars: interpretedAsCents / 100,
  });
  return interpretedAsCents;
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
    tipAmountCents: normalizeMoneyToCents(transfer.amountCents, "auto"),
    amountCents: normalizeMoneyToCents(transfer.amountCents, "auto"),
    transferId: transfer.transferId || null,
    stripeChargeId: null,
  };
}

export function resolveDriverTipForWashout(washout: BillableWashout): ResolvedDriverTipForWashout {
  const hasOverride = washout.driverTipOverrideCents !== null && washout.driverTipOverrideCents !== undefined && washout.driverTipOverrideCents !== "";
  const hasActivityAmount = washout.activityAmount !== null && washout.activityAmount !== undefined && washout.activityAmount !== "";
  const hasPaymentDriverTip = washout.paymentTipAmountCents !== null && washout.paymentTipAmountCents !== undefined && washout.paymentTipAmountCents !== "";
  const rawDriverTipValue = hasOverride
    ? washout.driverTipOverrideCents
    : hasActivityAmount
      ? washout.activityAmount
      : hasPaymentDriverTip
        ? washout.paymentTipAmountCents
        : washout.locationDriverTipRate;
  const rawDriverTipField = hasOverride
    ? "request.forceDriverTipCents"
    : hasActivityAmount
      ? "washout_activities.amount"
      : hasPaymentDriverTip
        ? "payments.amount"
        : "washout_locations.rate";
  const driverTipCents = normalizeMoneyToCents(rawDriverTipValue, hasOverride ? "cents" : hasActivityAmount ? "auto" : hasPaymentDriverTip ? "cents" : "dollars");
  console.log("[WASHOUT_DRIVER_TIP_INPUT]", {
    washoutActivityId: washout.id,
    ownerId: washout.ownerId,
    driverId: washout.driverId,
    rawDriverTipField,
    rawDriverTipValue: rawDriverTipValue ?? null,
    rawWashoutActivityAmount: washout.activityAmount ?? null,
    normalizedWashoutActivityAmountCents: normalizeMoneyToCents(washout.activityAmount, "auto"),
    rawPaymentDriverTipCents: washout.paymentTipAmountCents ?? null,
    rawLocationDriverTipRate: washout.locationDriverTipRate ?? null,
    normalizedDriverTipCents: driverTipCents,
    normalizedLocationDriverTipCents: normalizeMoneyToCents(washout.locationDriverTipRate, "dollars"),
  });
  return {
    washoutActivityId: washout.id,
    ownerId: washout.ownerId,
    locationId: null,
    driverId: washout.driverId,
    driverStripeAccountId: washout.driverStripeAccountId || null,
    driverTipCents,
    source: rawDriverTipField,
  };
}

function resolveBillableWashoutDriverTipCents(washout: BillableWashout): number {
  return resolveDriverTipForWashout(washout).driverTipCents;
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
  const platformFeeCentsByWashout = billable.map((washout) => normalizeMoneyToCents(washout.platformFeeCents, "auto"));
  const driverTipCentsByWashout = billable.map((washout) => resolveBillableWashoutDriverTipCents(washout));
  const driverTipCentsByDriver = billable.reduce<Record<string, number>>((acc, washout) => {
    acc[washout.driverId] = (acc[washout.driverId] || 0) + resolveBillableWashoutDriverTipCents(washout);
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
  const platformFeeCentsByWashout = billablePayments.map((payment) => getPaymentPlatformFeeCents(payment));
  const driverTipCentsByWashout = billablePayments.map((payment) => getPaymentDriverIncentiveCents(payment));
  const driverTipCentsByDriver = billablePayments.reduce<Record<string, number>>((acc, payment) => {
    acc[payment.driverId] = (acc[payment.driverId] || 0) + getPaymentDriverIncentiveCents(payment);
    return acc;
  }, {});
  const driverTransfers = billablePayments.reduce<DriverTransferLedger[]>((acc, payment) => {
    const tipAmountCents = getPaymentDriverIncentiveCents(payment);
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
    ownerChargeAmountCents: billablePayments.reduce((sum, payment) => sum + getPaymentOwnerChargeCents(payment), 0),
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

export function getPlatformRevenueSummary(ledgers: Array<OwnerBillingLedger & { billingStatus?: ReportingBillingBatchStatus }>) {
  const summary = summarizeReportingLedgerCollection(ledgers);
  return {
    platformRevenueCents: summary.platformRevenueCents,
    ownerChargeTotalCents: summary.ownerChargeTotalCents,
    unpaidReceivablesCents: summary.unpaidReceivablesCents,
    paidReceivablesCents: summary.paidReceivablesCents,
    needsReviewCents: summary.needsReviewCents,
    billedWashoutCount: summary.billedWashoutCount,
    approvedWashoutCount: summary.approvedWashoutCount,
  };
}

export function getReceivablesSummary(ledgers: Array<OwnerBillingLedger & { billingStatus?: ReportingBillingBatchStatus }>) {
  const summary = summarizeReportingLedgerCollection(ledgers);
  return {
    ownerCount: summary.ownerCount,
    approvedWashoutCount: summary.approvedWashoutCount,
    billedWashoutCount: summary.billedWashoutCount,
    platformRevenueCents: summary.platformRevenueCents,
    ownerChargeTotalCents: summary.ownerChargeTotalCents,
    driverTipTotalCents: summary.driverTipTotalCents,
    driverTransferTotalCents: summary.driverTransferTotalCents,
    unpaidReceivablesCents: summary.unpaidReceivablesCents,
    paidReceivablesCents: summary.paidReceivablesCents,
    needsReviewCents: summary.needsReviewCents,
  };
}

export function getOwnerBillingSummary(
  ownerId: string,
  ledgers: Array<OwnerBillingLedger & { billingStatus?: ReportingBillingBatchStatus }>,
) {
  const ownerLedgers = ledgers.filter((ledger) => ledger.ownerId === ownerId);
  return summarizeReportingLedgerCollection(ownerLedgers);
}

export function getDriverTipSummary(
  driverId: string,
  ledgers: Array<OwnerBillingLedger & { billingStatus?: ReportingBillingBatchStatus }>,
): ReportingDriverTipSummary {
  const matchingTransfers = ledgers.flatMap((ledger) => (
    ledger.driverTransfers
      .filter((transfer) => transfer.driverId === driverId)
      .map((transfer) => ({
        ...transfer,
        billingStatus: ledger.billingStatus || "pending",
      }))
  ));

  const driverTipTotalCents = matchingTransfers.reduce((sum, transfer) => sum + Number(transfer.amountCents || 0), 0);
  const paidTransfers = matchingTransfers.filter((transfer) => transfer.billingStatus === "paid");
  const needsReviewTransfers = matchingTransfers.filter((transfer) => transfer.billingStatus === "needs_review");
  const pendingTransfers = matchingTransfers.filter((transfer) => transfer.billingStatus === "pending");
  const driverTransferredCents = paidTransfers.reduce((sum, transfer) => sum + Number(transfer.amountCents || 0), 0);
  const pendingTransferCents = pendingTransfers.reduce((sum, transfer) => sum + Number(transfer.amountCents || 0), 0);

  return {
    driverId,
    driverTipTotalCents,
    driverTransferredCents,
    pendingTransferCents,
    transferCount: paidTransfers.length,
    pendingCount: pendingTransfers.length,
    paidCount: paidTransfers.length,
    transferIds: matchingTransfers.map((transfer) => transfer.transferId).filter((value): value is string => Boolean(value)),
    washoutActivityIds: Array.from(new Set(matchingTransfers.flatMap((transfer) => transfer.washoutActivityIds || []))),
  };
}

export function getDriverTipSummaryFromPayments(
  driverId: string,
  payments: ReportingLedgerPayment[],
): ReportingDriverTipSummary {
  const matchingPayments = payments.filter((payment) => payment.driverId === driverId);
  const driverTipTotalCents = matchingPayments.reduce((sum, payment) => sum + getPaymentDriverIncentiveCents(payment), 0);
  const paidPayments = matchingPayments.filter((payment) => {
    const status = String(payment.status || "").toLowerCase();
    return Boolean(payment.stripeTransferId) || ["paid", "posted", "completed", "succeeded"].includes(status);
  });
  const pendingPayments = matchingPayments.filter((payment) => {
    const status = String(payment.status || "").toLowerCase();
    return !payment.stripeTransferId && !["paid", "posted", "completed", "succeeded"].includes(status);
  });

  return {
    driverId,
    driverTipTotalCents,
    driverTransferredCents: paidPayments.reduce((sum, payment) => sum + getPaymentDriverIncentiveCents(payment), 0),
    pendingTransferCents: pendingPayments.reduce((sum, payment) => sum + getPaymentDriverIncentiveCents(payment), 0),
    transferCount: paidPayments.length,
    pendingCount: pendingPayments.length,
    paidCount: paidPayments.length,
    transferIds: paidPayments.map((payment) => payment.stripeTransferId).filter((value): value is string => Boolean(value)),
    washoutActivityIds: Array.from(new Set(matchingPayments.map((payment) => payment.activityId))),
  };
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
      driverTipCents: String(transfer.amountCents),
      type: "driver_washout_payout",
    },
  }));

  console.log("[OWNER_BILLING_DRY_RUN]", {
    ownerId: params.ownerId,
    billingBatchId: ledger.billingBatchId,
    washoutActivityIds: ledger.washoutActivityIds,
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
      washoutActivityIds: ledger.washoutActivityIds,
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
