import { resolvePlatformFeeCents } from "../shared/billingPolicy";
import { summarizeOwnerBillingReceivables } from "../shared/ownerBillingReceivables";

export type OwnerBillingReceivablesOwnerSummary = {
  ownerId: string;
  companyName: string;
  username: string;
  billingCadence: string;
  approvedWashoutCount: number;
  platformFeesOwedCents: number;
  platformFeesPaidCents: number;
  platformFeesTotalCents: number;
  billedWashoutCount: number;
  unbilledApprovedWashoutCount: number;
  pendingWashoutCount: number;
  needsReviewWashoutCount: number;
  declinedWashoutCount: number;
  rejectedWashoutCount: number;
  cancelledWashoutCount: number;
  paymentMethodStatus: string;
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
  const immediateOwners = billingSettings.filter((owner: { billingCadence?: string }) => owner.billingCadence === "immediate");

  const owners: OwnerBillingReceivablesOwnerSummary[] = await Promise.all(
    immediateOwners.map(async (ownerSetting: { ownerId: string; companyName: string; username: string; billingCadence: string }) => {
      const owner = await storageApi.getOwnerById(ownerSetting.ownerId);
      const ownerUser = owner ? await storageApi.getUser(owner.userId) : null;
      const approvedWashouts = typeof storageApi.getApprovedWashoutsForOwnerBilling === "function"
        ? await storageApi.getApprovedWashoutsForOwnerBilling(ownerSetting.ownerId)
        : [];
      const ownerCustomPlatformFeeCents = owner?.customPlatformFee !== null && owner?.customPlatformFee !== undefined && owner?.customPlatformFee !== ""
        ? resolvePlatformFeeCents(owner.customPlatformFee)
        : null;
      const receivables = summarizeOwnerBillingReceivables(approvedWashouts, ownerCustomPlatformFeeCents);
      const batches = await storageApi.getBillingBatchesByOwner(ownerSetting.ownerId);
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
      const lastBillingAmountCents = latestBatch ? Math.round(Number(latestBatch.totalAmount || 0) * 100) : 0;
      const billingDeltaCents = lastBillingAmountCents - receivables.platformFeesOwedCents;
      const billingReconciliationStatus = latestBatch?.status === "completed"
        ? (billingDeltaCents > 0 ? "overcharged" : billingDeltaCents < 0 ? "undercharged" : "matched")
        : null;
      const billingReconciliationNote = billingReconciliationStatus === "overcharged"
        ? `Expected $${(receivables.platformFeesOwedCents / 100).toFixed(2)}, actual Stripe charge was $${(lastBillingAmountCents / 100).toFixed(2)}.`
        : billingReconciliationStatus === "undercharged"
          ? `Expected $${(receivables.platformFeesOwedCents / 100).toFixed(2)}, actual Stripe charge was $${(lastBillingAmountCents / 100).toFixed(2)}.`
          : null;
      const hasStripeCustomer = Boolean(ownerUser?.stripeCustomerId);
      const hasPaymentMethod = Boolean(owner?.stripePaymentMethodId || ownerUser?.stripePaymentMethodId);

      return {
        ownerId: ownerSetting.ownerId,
        companyName: ownerSetting.companyName,
        username: ownerSetting.username,
        billingCadence: ownerSetting.billingCadence,
        ...receivables,
        paymentMethodStatus: hasStripeCustomer
          ? (hasPaymentMethod ? "configured" : "missing_payment_method")
          : "missing_stripe_customer",
        hasStripeCustomer,
        hasPaymentMethod,
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
