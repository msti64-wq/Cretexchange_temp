import { normalizeMoneyToCents } from "../shared/money";
import { getPaymentDriverIncentiveCents } from "../shared/paymentAccounting";
import { getOwnerStripeBillingSetup } from "../shared/ownerStripeBillingSetup";
import { isBillableWashoutForOwnerBilling } from "../shared/washoutApproval";
import { resolveConfiguredWashoutPlatformFeeCents } from "../shared/billingPolicy";
import {
  buildOwnerWashoutBillingLedgerFromBillableWashouts,
  buildOwnerWashoutBillingLedgerFromPayments,
  summarizeReportingLedgerCollection,
  getReportingBillingStatus,
} from "./billing/ownerWashoutLedger";

export type OwnerBillingReceivablesOwnerSummary = {
  ownerId: string;
  companyName: string;
  username: string;
  billingCadence: string;
  approvedWashoutCount: number;
  platformFeesOwedCents: number;
  platformFeesPaidCents: number;
  platformFeesTotalCents: number;
  driverTipTotalCents: number;
  driverTransferTotalCents: number;
  needsReviewCents: number;
  billedWashoutCount: number;
  unbilledApprovedWashoutCount: number;
  pendingWashoutCount: number;
  needsReviewWashoutCount: number;
  declinedWashoutCount: number;
  rejectedWashoutCount: number;
  cancelledWashoutCount: number;
  paymentMethodStatus: string;
  paymentMethodStatusLabel: "ready_for_billing" | "missing_customer" | "missing_payment_method";
  stripeCustomerIdSource: "owner" | "user" | null;
  stripePaymentMethodSource: "owner" | "user" | null;
  hasStripeCustomer: boolean;
  hasPaymentMethod: boolean;
  lastBillingAttemptAt: Date | string | null;
  lastBillingStatus: string;
  lastBillingWashoutCount: number;
  lastBillingAmountCents: number;
  lastStripePaymentIntentId: string | null;
  lastStripeChargeId: string | null;
  billingReconciliationStatus: string | null;
  billingReconciliationDeltaCents: number;
  billingReconciliationNote: string | null;
};

export type OwnerBillingReceivablesSummary = {
  ownerCount: number;
  approvedWashoutCount: number;
  platformFeesOwedCents: number;
  platformFeesPaidCents: number;
  platformFeesTotalCents: number;
  driverTipTotalCents: number;
  driverTransferTotalCents: number;
  needsReviewCents: number;
  billedWashoutCount: number;
  unbilledApprovedWashoutCount: number;
  pendingWashoutCount: number;
  needsReviewWashoutCount: number;
  declinedWashoutCount: number;
  rejectedWashoutCount: number;
  cancelledWashoutCount: number;
};

export async function buildOwnerBillingReceivablesOverview(storageApi: any): Promise<{
  owners: OwnerBillingReceivablesOwnerSummary[];
  summary: OwnerBillingReceivablesSummary;
}> {
  const billingSettings = await storageApi.getAllOwnersBillingSettings();
  const systemSettings = typeof storageApi.getSystemSettings === "function"
    ? await storageApi.getSystemSettings()
    : null;
  const immediateOwners = billingSettings.filter((owner: { billingCadence?: string }) => owner.billingCadence === "immediate");

  const owners: OwnerBillingReceivablesOwnerSummary[] = await Promise.all(
    immediateOwners.map(async (ownerSetting: { ownerId: string; companyName: string; username: string; billingCadence: string }) => {
      const owner = await storageApi.getOwnerById(ownerSetting.ownerId);
      const ownerUser = owner ? await storageApi.getUser(owner.userId) : null;
      if (typeof storageApi.getApprovedWashoutsForOwnerBilling !== "function") {
        throw new Error("[OWNER_BILLING_RECEIVABLES] getApprovedWashoutsForOwnerBilling is not available");
      }
      const approvedWashouts = await storageApi.getApprovedWashoutsForOwnerBilling(ownerSetting.ownerId);
      const configuredPlatformFeeCents = resolveConfiguredWashoutPlatformFeeCents({
        ownerCustomPlatformFee: owner?.customPlatformFee,
        systemPlatformWashoutFee: systemSettings?.platformWashoutFee,
      });
      const batches = await storageApi.getBillingBatchesByOwner(ownerSetting.ownerId);
      const billableApprovedWashouts = approvedWashouts.filter((row: any) => isBillableWashoutForOwnerBilling({ status: row.activityStatus }));
      const approvedLedger = billableApprovedWashouts.length > 0
        ? buildOwnerWashoutBillingLedgerFromBillableWashouts({
            ownerId: ownerSetting.ownerId,
            billingBatchId: `${ownerSetting.ownerId}:receivables:${Date.now()}`,
            washouts: billableApprovedWashouts.map((row: any) => ({
              id: row.activityId,
              ownerId: row.ownerId,
              driverId: row.driverId,
              driverStripeAccountId: null,
              platformFeeCents: configuredPlatformFeeCents,
              driverTipCents: normalizeMoneyToCents(row.activityDriverTipAmount || 0, "dollars"),
            })),
            allowAdminOverride: true,
          })
        : null;
      const batchLedgers = await Promise.all(
        batches.map(async (batch: { id: string; status?: string | null }) => {
          if (typeof storageApi.getPaymentsByBatchId !== "function") {
            throw new Error("[OWNER_BILLING_RECEIVABLES] getPaymentsByBatchId is not available");
          }
          const payments = await storageApi.getPaymentsByBatchId(batch.id);
          const ledger = buildOwnerWashoutBillingLedgerFromPayments({
            ownerId: ownerSetting.ownerId,
            billingBatchId: batch.id,
            payments: payments.map((payment: any) => ({
              id: payment.id,
              ownerId: payment.ownerId,
              driverId: payment.driverId,
              activityId: payment.activityId,
              processingFee: payment.processingFee,
              tipAmountCents: getPaymentDriverIncentiveCents(payment),
              status: payment.status,
              batchId: payment.batchId,
              stripePaymentIntentId: payment.stripePaymentIntentId,
              stripeTransferId: payment.stripeTransferId,
              stripeChargeId: payment.stripeChargeId,
            })),
            allowAdminOverride: true,
          });
          return {
            ...ledger,
            billingStatus: getReportingBillingStatus(batch.status),
          };
        })
      );
      const receivables = summarizeReportingLedgerCollection([
        ...(approvedLedger ? [{ ...approvedLedger, billingStatus: "pending" as const }] : []),
        ...batchLedgers,
      ]);
      const paidBatchLedgers = batchLedgers.filter((ledger) => ledger.billingStatus === "paid");
      const paidPlatformFeesCents = paidBatchLedgers.reduce((sum: number, ledger: any) => {
        return sum + Number(ledger.platformRevenueCents || 0);
      }, 0);
      const billedWashoutCount = paidBatchLedgers.reduce((sum: number, ledger: any) => {
        return sum + Number(ledger.approvedWashoutCount || 0);
      }, 0);
      const completedBatches = batches.filter((batch: { status?: string | null; completedAt?: Date | string | null }) => {
        const status = String(batch.status || "").toLowerCase();
        return Boolean(batch.completedAt) || [
          "completed",
          "paid",
          "succeeded",
          "posted",
          "settled",
        ].includes(status);
      });
      const fallbackPaidPlatformFeesCents = completedBatches.reduce((sum: number, batch: any) => {
        const batchMetadata = batch.metadata && typeof batch.metadata === "object"
          ? batch.metadata as Record<string, unknown>
          : {};
        const platformFeeTotalCents = batchMetadata.platformFeeTotalCents !== undefined && batchMetadata.platformFeeTotalCents !== null && batchMetadata.platformFeeTotalCents !== ""
          ? Number(batchMetadata.platformFeeTotalCents)
          : batchMetadata.platformFeeTotal !== undefined && batchMetadata.platformFeeTotal !== null && batchMetadata.platformFeeTotal !== ""
            ? normalizeMoneyToCents(batchMetadata.platformFeeTotal, "dollars")
            : normalizeMoneyToCents(batch.totalAmount, "dollars");
        return sum + platformFeeTotalCents;
      }, 0);
      const fallbackBilledWashoutCount = completedBatches.reduce((sum: number, batch: any) => {
        return sum + Number(batch.paymentCount || 0);
      }, 0);
      const effectivePaidPlatformFeesCents = paidPlatformFeesCents > 0 ? paidPlatformFeesCents : fallbackPaidPlatformFeesCents;
      const effectiveBilledWashoutCount = billedWashoutCount > 0 ? billedWashoutCount : fallbackBilledWashoutCount;

      const totalPlatformFeesCents = receivables.unpaidReceivablesCents + effectivePaidPlatformFeesCents;
      const latestBatch = (batches[0] || null) as {
        totalAmount?: string | null;
        paymentCount?: number | null;
        status?: string | null;
        stripePaymentIntentId?: string | null;
        metadata?: Record<string, unknown> | null;
        updatedAt?: Date | string | null;
        createdAt?: Date | string | null;
      } | null;
      const latestBatchMetadata = latestBatch?.metadata && typeof latestBatch.metadata === "object"
        ? latestBatch.metadata as Record<string, unknown>
        : {};
      const lastStripeChargeId = typeof latestBatchMetadata.stripeChargeId === "string"
        ? latestBatchMetadata.stripeChargeId
        : null;
      const lastBillingAmountCents = latestBatch ? normalizeMoneyToCents(latestBatch.totalAmount, "dollars") : 0;
      const lastBillingExpectedPlatformFeeCents = latestBatchMetadata.platformFeeTotalCents !== undefined && latestBatchMetadata.platformFeeTotalCents !== null && latestBatchMetadata.platformFeeTotalCents !== ""
        ? Number(latestBatchMetadata.platformFeeTotalCents)
        : latestBatchMetadata.platformFeeTotal !== undefined && latestBatchMetadata.platformFeeTotal !== null && latestBatchMetadata.platformFeeTotal !== ""
          ? normalizeMoneyToCents(latestBatchMetadata.platformFeeTotal, "dollars")
          : receivables.unpaidReceivablesCents;
      const billingDeltaCents = lastBillingAmountCents - lastBillingExpectedPlatformFeeCents;
      const billingReconciliationStatus = latestBatch?.status === "completed"
        ? (billingDeltaCents > 0 ? "overcharged" : billingDeltaCents < 0 ? "undercharged" : "matched")
        : null;
      const billingReconciliationNote = billingReconciliationStatus === "overcharged"
        ? `Expected $${(lastBillingExpectedPlatformFeeCents / 100).toFixed(2)}, actual Stripe charge was $${(lastBillingAmountCents / 100).toFixed(2)}.`
        : billingReconciliationStatus === "undercharged"
          ? `Expected $${(lastBillingExpectedPlatformFeeCents / 100).toFixed(2)}, actual Stripe charge was $${(lastBillingAmountCents / 100).toFixed(2)}.`
          : null;
      const stripeSetup = getOwnerStripeBillingSetup(owner, ownerUser);

      return {
        ownerId: ownerSetting.ownerId,
        companyName: ownerSetting.companyName,
        username: ownerSetting.username,
        billingCadence: ownerSetting.billingCadence,
        approvedWashoutCount: receivables.approvedWashoutCount,
        platformFeesOwedCents: receivables.unpaidReceivablesCents,
        platformFeesOwed: (receivables.unpaidReceivablesCents / 100).toFixed(2),
        platformFeesPaidCents: effectivePaidPlatformFeesCents,
        platformFeesTotalCents: totalPlatformFeesCents,
        driverTipTotalCents: receivables.driverTipTotalCents,
        driverTransferTotalCents: receivables.driverTransferTotalCents,
        needsReviewCents: receivables.needsReviewCents,
        billedWashoutCount: effectiveBilledWashoutCount,
        unbilledApprovedWashoutCount: Math.max(0, receivables.approvedWashoutCount - effectiveBilledWashoutCount),
        pendingWashoutCount: Math.max(0, receivables.approvedWashoutCount - effectiveBilledWashoutCount),
        needsReviewWashoutCount: 0,
        declinedWashoutCount: 0,
        rejectedWashoutCount: 0,
        cancelledWashoutCount: 0,
        paymentMethodStatus: stripeSetup.displayLabel,
        paymentMethodStatusLabel: stripeSetup.statusLabel,
        stripeCustomerIdSource: stripeSetup.customerIdSource,
        stripePaymentMethodSource: stripeSetup.paymentMethodSource,
        hasStripeCustomer: stripeSetup.hasStripeCustomer,
        hasPaymentMethod: stripeSetup.hasPaymentMethod,
        lastBillingAttemptAt: latestBatch?.updatedAt || latestBatch?.createdAt || null,
        lastBillingStatus: latestBatch?.status || "never",
        lastBillingWashoutCount: latestBatch ? Number(latestBatch.paymentCount || 0) : 0,
        lastBillingAmountCents,
        lastStripePaymentIntentId: latestBatch?.stripePaymentIntentId || null,
        lastStripeChargeId,
        billingReconciliationStatus,
        billingReconciliationDeltaCents: billingDeltaCents,
        billingReconciliationNote,
      };
    })
  );

  const summary = owners.reduce(
    (acc, row) => {
      acc.ownerCount += 1;
      acc.approvedWashoutCount += row.approvedWashoutCount;
      acc.platformFeesOwedCents += row.platformFeesOwedCents;
      acc.platformFeesPaidCents += row.platformFeesPaidCents;
      acc.platformFeesTotalCents += row.platformFeesTotalCents;
      acc.driverTipTotalCents += row.driverTipTotalCents;
      acc.driverTransferTotalCents += row.driverTransferTotalCents;
      acc.needsReviewCents += row.needsReviewCents;
      acc.billedWashoutCount += row.billedWashoutCount;
      acc.unbilledApprovedWashoutCount += row.unbilledApprovedWashoutCount;
      acc.pendingWashoutCount += row.pendingWashoutCount;
      acc.needsReviewWashoutCount += row.needsReviewWashoutCount;
      acc.declinedWashoutCount += row.declinedWashoutCount;
      acc.rejectedWashoutCount += row.rejectedWashoutCount;
      acc.cancelledWashoutCount += row.cancelledWashoutCount;
      return acc;
    },
    {
      ownerCount: 0,
      approvedWashoutCount: 0,
      platformFeesOwedCents: 0,
      platformFeesPaidCents: 0,
      platformFeesTotalCents: 0,
      driverTipTotalCents: 0,
      driverTransferTotalCents: 0,
      needsReviewCents: 0,
      billedWashoutCount: 0,
      unbilledApprovedWashoutCount: 0,
      pendingWashoutCount: 0,
      needsReviewWashoutCount: 0,
      declinedWashoutCount: 0,
      rejectedWashoutCount: 0,
      cancelledWashoutCount: 0,
    }
  );

  return { owners, summary };
}
