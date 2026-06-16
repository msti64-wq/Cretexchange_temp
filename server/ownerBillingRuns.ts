import { createHash } from "node:crypto";
import type Stripe from "stripe";
import {
  calculateOwnerWashoutBillingLedger,
  resolveConfiguredWashoutPlatformFeeCents,
} from "../shared/billingPolicy";
import { normalizeMoneyToCents } from "../shared/money";
import { getOwnerStripeBillingSetup } from "../shared/ownerStripeBillingSetup";

type BillingBatch = any;
type Payment = any;
type User = any;
type Owner = any;
type WashoutActivity = any;
type Driver = any;
type ApprovedWashoutBillingRow = {
  activityId: string;
  ownerId: string;
  driverId: string;
  locationId: string;
  activityStatus?: string | null;
  activityFeeCentsPlatform?: number | null;
  locationDriverIncentiveTip?: number | null;
  verifiedAt?: Date | string | null;
  createdAt?: Date | string | null;
};

export type OwnerBillingRunType = "weekly_scheduled" | "admin_manual";
export type OwnerBillingRunStatus = "pending" | "processing" | "paid" | "failed" | "skipped";

export interface OwnerBillingRunStorage {
  getUser(userId: string): Promise<User | undefined>;
  getOwnerById(ownerId: string): Promise<Owner | undefined>;
  getSystemSettings?: () => Promise<{ platformWashoutFee?: string | null } | null>;
  getOwnerBillingSettings(ownerId: string): Promise<{
    billingCadence: string;
    billingCutoffTime: string;
    billingTimezone: string;
    billingDayOfWeek: number;
  } | undefined>;
  getAllOwnersBillingSettings(): Promise<{
    ownerId: string;
    companyName: string;
    username: string;
    billingCadence: string;
    billingCutoffTime: string;
    billingTimezone: string;
    billingDayOfWeek: number;
  }[]>;
  getPendingPaymentsForOwnerBilling(
    ownerId: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<(Payment & { activity: WashoutActivity; driver: Driver & { user: User } })[]>;
  getApprovedWashoutsForOwnerBilling?(
    ownerId: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<ApprovedWashoutBillingRow[]>;
  getBillingBatch(batchId: string): Promise<BillingBatch | undefined>;
  getBillingBatchByOwnerAndDate(ownerId: string, businessDate: string): Promise<BillingBatch | undefined>;
  createBillingBatch(batch: Partial<BillingBatch> & {
    ownerId: string;
    businessDate: string;
    cutoffTime: string;
    timezone: string;
    status: string;
    totalAmount: string;
    totalFees: string;
    paymentCount: number;
    processingStartedAt?: Date | null;
    completedAt?: Date | null;
    failureReason?: string | null;
    metadata?: any;
  }): Promise<BillingBatch>;
  assignPaymentsToBatch(paymentIds: string[], batchId: string, businessDate: string): Promise<void>;
  getPaymentsByBatchId(batchId: string): Promise<(Payment & { activity: WashoutActivity; driver: Driver & { user: User } })[]>;
  updateBillingBatchStatus(batchId: string, status: string, stripePaymentIntentId?: string, failureReason?: string): Promise<BillingBatch>;
  updateBillingBatchProcessing(batchId: string, totalAmount: string, totalFees: string, paymentCount: number, stripePaymentIntentId?: string): Promise<BillingBatch>;
  updateBillingBatchMetadata(batchId: string, metadataPatch: Record<string, unknown>): Promise<BillingBatch>;
  markBillingBatchCompleted(batchId: string): Promise<BillingBatch>;
  markBillingBatchFailed(batchId: string, failureReason: string): Promise<void>;
  completeBatchPayment(batchId: string, stripePaymentIntentId: string): Promise<void>;
}

export interface StripePaymentIntentLike {
  id: string;
  status?: string;
}

export interface StripeBillingChargeClient {
  paymentIntents: {
    create(
      params: Stripe.PaymentIntentCreateParams,
      options?: Stripe.RequestOptions
    ): Promise<StripePaymentIntentLike>;
  };
}

export interface ProcessOwnerBillingRunOptions {
  ownerId?: string;
  triggeredByAdminId?: string;
  runType: OwnerBillingRunType;
  startDate?: Date;
  endDate?: Date;
  existingBatchId?: string | null;
  storage: OwnerBillingRunStorage;
  stripeClient?: StripeBillingChargeClient | null;
}

export interface OwnerBillingRunResult {
  ownerId: string;
  billingBatch: BillingBatch | null;
  status: OwnerBillingRunStatus;
  message: string;
  amountCents: number;
  washoutCount: number;
  stripePaymentIntentId?: string | null;
}

export interface OwnerBillingRunSummary {
  runs: OwnerBillingRunResult[];
  processed: number;
  failed: number;
  skipped: number;
  totalAmountCents: number;
  totalWashoutCount: number;
}

function toCents(amount: string | number | null | undefined): number {
  if (amount === null || amount === undefined || amount === "") {
    return 0;
  }
  const parsed = typeof amount === "number" ? amount : Number(amount);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return Math.round(parsed * 100);
}

function formatMoney(amountCents: number): string {
  return (amountCents / 100).toFixed(2);
}

function extractStripeChargeId(paymentIntent: StripePaymentIntentLike | null | undefined): string | null {
  if (!paymentIntent) {
    return null;
  }

  const latestCharge = (paymentIntent as any).latest_charge;
  if (typeof latestCharge === "string" && latestCharge.trim()) {
    return latestCharge;
  }
  if (latestCharge && typeof latestCharge === "object" && typeof latestCharge.id === "string" && latestCharge.id.trim()) {
    return latestCharge.id;
  }

  const charges = (paymentIntent as any).charges;
  const firstCharge = charges?.data?.[0];
  if (firstCharge && typeof firstCharge.id === "string" && firstCharge.id.trim()) {
    return firstCharge.id;
  }

  return null;
}

function buildStripeIdempotencyKey(
  prefix: string,
  ownerId: string,
  billingBatchId: string,
  amountCents: number,
  washoutActivityIds: string[],
  ownerStripeCustomerId: string | null,
  ownerPaymentMethodId: string | null,
  runType: OwnerBillingRunType,
): string {
  const normalizedIds = Array.from(new Set(washoutActivityIds.map((id) => String(id).trim()).filter(Boolean))).sort();
  const source = [
    prefix,
    ownerId,
    billingBatchId,
    String(amountCents),
    ownerStripeCustomerId || "",
    ownerPaymentMethodId || "",
    runType,
    normalizedIds.join(","),
  ].join("|");

  return `${prefix}_${createHash("sha256").update(source).digest("hex")}`;
}

function toDateKey(value?: Date | null): string {
  return value ? value.toISOString().split("T")[0] : new Date().toISOString().split("T")[0];
}

async function loadCandidatePayments(
  storage: OwnerBillingRunStorage,
  ownerId: string,
  startDate?: Date,
  endDate?: Date,
  existingBatchId?: string | null,
): Promise<(Payment & { activity: WashoutActivity; driver: Driver & { user: User } })[]> {
  if (existingBatchId) {
    const assignedPayments = await storage.getPaymentsByBatchId(existingBatchId);
    if (assignedPayments.length > 0) {
      return assignedPayments;
    }
  }

  return await storage.getPendingPaymentsForOwnerBilling(ownerId, startDate, endDate);
}

async function processSingleOwnerBillingRun(
  options: ProcessOwnerBillingRunOptions & { ownerId: string }
): Promise<OwnerBillingRunResult> {
  const {
    ownerId,
    triggeredByAdminId,
    runType,
    startDate,
    endDate,
    existingBatchId,
    storage,
    stripeClient,
  } = options;

  const owner = await storage.getOwnerById(ownerId);
  if (!owner) {
    throw new Error(`Owner ${ownerId} not found`);
  }

  const ownerUser = await storage.getUser(owner.userId);
  if (!ownerUser) {
    throw new Error(`Owner user ${owner.userId} not found`);
  }
  const systemSettings = typeof storage.getSystemSettings === "function"
    ? await storage.getSystemSettings()
    : null;
  const stripeSetup = getOwnerStripeBillingSetup(owner, ownerUser);
  const ownerStripeCustomerId = stripeSetup.customerId;
  const ownerPaymentMethodId = stripeSetup.paymentMethodId;

  console.log(`💳 [OWNER_BILLING] Starting ${runType} run for owner ${ownerId}`, {
    startDate: startDate ? startDate.toISOString() : null,
    endDate: endDate ? endDate.toISOString() : null,
    reusedBatchId: existingBatchId || null,
  });

  if (runType === "admin_manual" && storage.getApprovedWashoutsForOwnerBilling) {
    const billingDateKey = toDateKey(startDate ?? endDate);
    const existingBatch = existingBatchId
      ? await storage.getBillingBatch(existingBatchId)
      : await storage.getBillingBatchByOwnerAndDate(ownerId, billingDateKey);

    if (existingBatch?.status === "completed") {
      return {
        ownerId,
        billingBatch: existingBatch,
        status: "skipped",
        message: "Billing batch already completed.",
        amountCents: Math.round(Number(existingBatch.totalAmount || 0) * 100),
        washoutCount: Number(existingBatch.paymentCount || 0),
        stripePaymentIntentId: existingBatch.stripePaymentIntentId || null,
      };
    }

    const configuredPlatformFeeCents = resolveConfiguredWashoutPlatformFeeCents({
      ownerCustomPlatformFee: owner.customPlatformFee,
      systemPlatformWashoutFee: systemSettings?.platformWashoutFee,
      requireExplicit: true,
    });
    const approvedWashouts = await storage.getApprovedWashoutsForOwnerBilling(ownerId, startDate, endDate);
    const platformFeeCentsPerWashout = approvedWashouts.map(() => configuredPlatformFeeCents);
    const driverTipCentsPerWashout = approvedWashouts.map((row) => normalizeMoneyToCents(row.locationDriverIncentiveTip, "auto"));
    const platformFeeTotalCents = platformFeeCentsPerWashout.reduce((sum, feeCents) => sum + feeCents, 0);
    const driverTipTotalCents = driverTipCentsPerWashout.reduce((sum, tipCents) => sum + tipCents, 0);
    const washoutActivityIds = approvedWashouts.map((row) => row.activityId).filter(Boolean);
    const approvedDriverTipCentsByDriver = approvedWashouts.reduce<Record<string, number>>((acc, row) => {
      const tipCents = normalizeMoneyToCents(row.locationDriverIncentiveTip, "auto");
      acc[row.driverId] = (acc[row.driverId] || 0) + tipCents;
      return acc;
    }, {});
    const ledger = calculateOwnerWashoutBillingLedger({
      ownerId,
      billingBatchId: existingBatch?.id || existingBatchId || `${ownerId}_${billingDateKey}`,
      washoutActivityIds,
      approvedWashoutCount: approvedWashouts.length,
      platformFeeCentsByWashout: platformFeeCentsPerWashout,
      platformFeeTotalCents,
      driverTipCentsByWashout: driverTipCentsPerWashout,
      driverTipCentsByDriver: approvedDriverTipCentsByDriver,
      driverTipTotalCents,
      ownerChargeAmountCents: platformFeeTotalCents + driverTipTotalCents,
      platformRevenueCents: platformFeeTotalCents,
      driverTransfers: approvedWashouts.map((row, index) => ({
        driverId: row.driverId,
        connectedAccountId: null,
        amountCents: driverTipCentsPerWashout[index] || 0,
        washoutActivityIds: [row.activityId],
      })),
      stripeChargeAmountCents: platformFeeTotalCents + driverTipTotalCents,
      platformFeeCentsPerWashout,
      driverTipCentsPerWashout,
      immediateBilling: false,
      allowAdminOverride: true,
    });

    console.log(`💳 [OWNER_BILLING] Candidate approved washouts for owner ${ownerId}: ${approvedWashouts.length}`, {
      platformFeeTotalCents,
      driverTipTotalCents,
      washoutActivityIds,
    });
    console.log(`[OWNER_BILLING_LEDGER]`, ledger);

    const batchMetadata = {
      runType,
      triggeredByAdminId: triggeredByAdminId || null,
      requestedAt: new Date().toISOString(),
      startDate: startDate ? startDate.toISOString() : null,
      endDate: endDate ? endDate.toISOString() : null,
      ownerUsername: ownerUser.username,
      ownerCompanyName: owner.companyName,
      reusedBatchId: existingBatch?.id || existingBatchId || null,
      washoutActivityIds: washoutActivityIds.join(","),
      platformFeeTotal: formatMoney(platformFeeTotalCents),
      driverTipTotal: formatMoney(driverTipTotalCents),
      stripeChargeAmount: formatMoney(ledger.ownerChargeAmountCents),
    };

    const billingBatch =
      existingBatch ||
      await storage.createBillingBatch({
        ownerId,
        businessDate: billingDateKey,
        cutoffTime: owner.billingCutoffTime || "23:59:00",
        timezone: owner.billingTimezone || "America/Chicago",
        status: "pending",
        totalAmount: formatMoney(ledger.ownerChargeAmountCents),
        totalFees: formatMoney(platformFeeTotalCents),
        paymentCount: approvedWashouts.length,
        metadata: batchMetadata,
      } as any);

    if (approvedWashouts.length === 0) {
      await storage.updateBillingBatchStatus(
        billingBatch.id,
        "skipped",
        undefined,
        "No approved washouts found"
      );
      return {
        ownerId,
        billingBatch: await storage.getBillingBatch(billingBatch.id) as BillingBatch,
        status: "skipped",
        message: "No approved washouts found for this owner.",
        amountCents: 0,
        washoutCount: 0,
      };
    }

    if (ledger.ownerChargeAmountCents <= 0) {
      await storage.updateBillingBatchStatus(
        billingBatch.id,
        "skipped",
        undefined,
        "No platform fee or driver tip amount owed"
      );
      return {
        ownerId,
        billingBatch: await storage.getBillingBatch(billingBatch.id) as BillingBatch,
        status: "skipped",
        message: "No platform fee or driver tip amount was owed for the approved washouts.",
        amountCents: 0,
        washoutCount: approvedWashouts.length,
      };
    }

    if (!stripeClient) {
      const failureReason = "Stripe is not configured";
      await storage.updateBillingBatchStatus(billingBatch.id, "skipped", undefined, failureReason);
      console.log(`⏭️  [OWNER_BILLING] Stripe unavailable for owner ${ownerId} batch ${billingBatch.id} - skipping`);
      return {
        ownerId,
        billingBatch: await storage.getBillingBatch(billingBatch.id) as BillingBatch,
        status: "skipped",
        message: "Stripe is not configured. Billing was not attempted.",
        amountCents: ledger.ownerChargeAmountCents,
        washoutCount: approvedWashouts.length,
      };
    }

    if (!ownerStripeCustomerId || !ownerPaymentMethodId) {
      const missingField = !ownerStripeCustomerId ? "Stripe customer" : "payment method";
      const failureReason = `Owner is missing ${missingField}`;
      await storage.markBillingBatchFailed(billingBatch.id, failureReason);
      console.warn(`⚠️  [OWNER_BILLING] Missing payment setup for owner ${ownerId}: ${failureReason}`);
      return {
        ownerId,
        billingBatch: await storage.getBillingBatch(billingBatch.id) as BillingBatch,
        status: "failed",
        message: "Owner payment method is not configured.",
        amountCents: ledger.ownerChargeAmountCents,
        washoutCount: approvedWashouts.length,
      };
    }

    const paymentIntentMetadata = {
      batchId: billingBatch.id,
      ownerId,
      runType,
      startDate: startDate ? startDate.toISOString().split("T")[0] : "",
      endDate: endDate ? endDate.toISOString().split("T")[0] : "",
      washoutCount: String(approvedWashouts.length),
      amountCents: String(ledger.ownerChargeAmountCents),
      platformFeeCentsPerWashout: ledger.platformFeeCentsByWashout.join(","),
      driverTipCentsPerWashout: ledger.driverTipCentsByWashout.join(","),
      stripeChargeAmountCents: String(ledger.ownerChargeAmountCents),
      washoutActivityIds: washoutActivityIds.join(","),
      platformFeeTotal: formatMoney(platformFeeTotalCents),
      driverTipTotal: formatMoney(driverTipTotalCents),
    };

    try {
      const idempotencyKey = buildStripeIdempotencyKey(
        "owner_platform_billing",
        ownerId,
        billingBatch.id,
        platformFeeTotalCents,
        washoutActivityIds,
        ownerStripeCustomerId,
        ownerPaymentMethodId,
        runType,
      );
      const paymentIntent = await stripeClient.paymentIntents.create({
        amount: ledger.ownerChargeAmountCents,
        currency: "usd",
        customer: ownerStripeCustomerId,
        payment_method: ownerPaymentMethodId,
        confirm: true,
        off_session: true,
        payment_method_types: ["card"],
        description: `Owner platform billing - ${approvedWashouts.length} approved washouts`,
        metadata: paymentIntentMetadata,
      } as any, {
        idempotencyKey,
      });
      const stripeChargeId = extractStripeChargeId(paymentIntent);

      if (typeof storage.updateBillingBatchMetadata === "function") {
        await storage.updateBillingBatchMetadata(billingBatch.id, {
          stripePaymentIntentId: paymentIntent.id,
          stripeChargeId,
        });
      }

      console.log(`💳 [OWNER_BILLING] Stripe payment intent created for owner ${ownerId}`, {
        billingBatchId: billingBatch.id,
        paymentIntentId: paymentIntent.id,
        stripeChargeId,
        amountCents: ledger.ownerChargeAmountCents,
        washoutCount: approvedWashouts.length,
      });

      if (paymentIntent.status && paymentIntent.status !== "succeeded") {
        if (paymentIntent.status === "processing") {
          await storage.updateBillingBatchStatus(billingBatch.id, "processing", paymentIntent.id);
          return {
            ownerId,
            billingBatch: await storage.getBillingBatch(billingBatch.id) as BillingBatch,
            status: "processing",
            message: "Stripe accepted the charge and is still processing it.",
            amountCents: ledger.ownerChargeAmountCents,
            washoutCount: approvedWashouts.length,
            stripePaymentIntentId: paymentIntent.id,
          };
        }

        const failureReason = `Stripe returned status ${paymentIntent.status}`;
        await storage.markBillingBatchFailed(billingBatch.id, failureReason);
        return {
          ownerId,
          billingBatch: await storage.getBillingBatch(billingBatch.id) as BillingBatch,
          status: "failed",
          message: `Stripe charge did not complete (${paymentIntent.status}).`,
          amountCents: ledger.ownerChargeAmountCents,
          washoutCount: approvedWashouts.length,
          stripePaymentIntentId: paymentIntent.id,
        };
      }

      await storage.updateBillingBatchStatus(billingBatch.id, "completed", paymentIntent.id);
      return {
        ownerId,
        billingBatch: await storage.getBillingBatch(billingBatch.id) as BillingBatch,
        status: "paid",
        message: `Successfully charged $${(ledger.ownerChargeAmountCents / 100).toFixed(2)} for ${approvedWashouts.length} approved washouts.`,
        amountCents: ledger.ownerChargeAmountCents,
        washoutCount: approvedWashouts.length,
        stripePaymentIntentId: paymentIntent.id,
      };
    } catch (error) {
      const failureReason = error instanceof Error ? error.message : "Unknown Stripe error";
      await storage.markBillingBatchFailed(billingBatch.id, failureReason);
      console.error(`❌ [OWNER_BILLING] Billing failed for owner ${ownerId}: ${failureReason}`);
      return {
        ownerId,
        billingBatch: await storage.getBillingBatch(billingBatch.id) as BillingBatch,
        status: "failed",
        message: failureReason,
        amountCents: ledger.ownerChargeAmountCents,
        washoutCount: approvedWashouts.length,
      };
    }
  }

  const billingDateKey = toDateKey(startDate ?? endDate);
  const existingBatch = existingBatchId
    ? await storage.getBillingBatch(existingBatchId)
    : await storage.getBillingBatchByOwnerAndDate(ownerId, billingDateKey);

  if (existingBatch?.status === "completed") {
    return {
      ownerId,
      billingBatch: existingBatch,
      status: "skipped",
      message: "Billing batch already completed.",
      amountCents: Math.round(Number(existingBatch.totalAmount || 0) * 100),
      washoutCount: Number(existingBatch.paymentCount || 0),
      stripePaymentIntentId: existingBatch.stripePaymentIntentId || null,
    };
  }

  const candidatePayments = await loadCandidatePayments(
    storage,
    ownerId,
    startDate,
    endDate,
    existingBatchId || existingBatch?.id || null,
  );

  console.log(`💳 [OWNER_BILLING] Candidate washouts for owner ${ownerId}: ${candidatePayments.length}`);

  const platformFeeCentsPerWashout = candidatePayments.map((payment) => toCents(payment.processingFee));
  const driverTipCentsPerWashout = candidatePayments.map((payment) => normalizeMoneyToCents(payment.tipAmountCents, "auto"));
  const platformFeeTotalCents = platformFeeCentsPerWashout.reduce((sum, feeCents) => sum + feeCents, 0);
  const driverTipTotalCents = driverTipCentsPerWashout.reduce((sum, tipCents) => sum + tipCents, 0);
  const candidateDriverTipCentsByDriver = candidatePayments.reduce<Record<string, number>>((acc, payment) => {
    const tipCents = normalizeMoneyToCents(payment.tipAmountCents, "auto");
    acc[payment.driverId] = (acc[payment.driverId] || 0) + tipCents;
    return acc;
  }, {});
  const ledger = calculateOwnerWashoutBillingLedger({
    ownerId,
    billingBatchId: existingBatch?.id || existingBatchId || `${ownerId}_${billingDateKey}`,
    washoutActivityIds: candidatePayments.map((payment) => payment.activityId).filter(Boolean),
    approvedWashoutCount: candidatePayments.length,
    platformFeeCentsByWashout: platformFeeCentsPerWashout,
    platformFeeTotalCents,
    driverTipCentsByWashout: driverTipCentsPerWashout,
    driverTipCentsByDriver: candidateDriverTipCentsByDriver,
    driverTipTotalCents,
    ownerChargeAmountCents: platformFeeTotalCents + driverTipTotalCents,
    platformRevenueCents: platformFeeTotalCents,
    driverTransfers: candidatePayments.map((payment) => ({
      driverId: payment.driverId,
      connectedAccountId: payment.driver?.stripeConnectAccountId || null,
      amountCents: normalizeMoneyToCents(payment.tipAmountCents, "auto"),
      washoutActivityIds: [payment.activityId],
    })),
    stripeChargeAmountCents: platformFeeTotalCents + driverTipTotalCents,
    platformFeeCentsPerWashout,
    driverTipCentsPerWashout,
    immediateBilling: runType !== "admin_manual",
    allowAdminOverride: runType === "admin_manual",
  });
  const candidateAmountCents = ledger.ownerChargeAmountCents;
  const washoutActivityIds = candidatePayments.map((payment) => payment.activityId).filter(Boolean);

  const batchMetadata = {
    runType,
    triggeredByAdminId: triggeredByAdminId || null,
    requestedAt: new Date().toISOString(),
    startDate: startDate ? startDate.toISOString() : null,
    endDate: endDate ? endDate.toISOString() : null,
    ownerUsername: ownerUser.username,
    ownerCompanyName: owner.companyName,
    reusedBatchId: existingBatch?.id || existingBatchId || null,
    washoutActivityIds: washoutActivityIds.join(","),
    platformFeeTotal: formatMoney(platformFeeTotalCents),
    driverTipTotal: formatMoney(driverTipTotalCents),
    stripeChargeAmount: formatMoney(ledger.ownerChargeAmountCents),
  };

  const billingBatch =
    existingBatch ||
    await storage.createBillingBatch({
      ownerId,
      businessDate: billingDateKey,
      cutoffTime: owner.billingCutoffTime || "23:59:00",
      timezone: owner.billingTimezone || "America/Chicago",
      status: "pending",
      totalAmount: formatMoney(ledger.ownerChargeAmountCents),
      totalFees: formatMoney(platformFeeTotalCents),
      paymentCount: candidatePayments.length,
      metadata: batchMetadata,
    } as any);

  if (candidatePayments.length === 0) {
    await storage.updateBillingBatchStatus(
      billingBatch.id,
      "skipped",
      undefined,
      "No unbilled completed washouts found"
    );
    return {
      ownerId,
      billingBatch: await storage.getBillingBatch(billingBatch.id) as BillingBatch,
      status: "skipped",
      message: "No unbilled completed washouts found for this owner.",
      amountCents: 0,
      washoutCount: 0,
    };
  }

  let batchPayments = await storage.getPaymentsByBatchId(billingBatch.id);
  if (batchPayments.length === 0) {
    const paymentIds = candidatePayments.map((payment) => payment.id);
    await storage.assignPaymentsToBatch(paymentIds, billingBatch.id, billingDateKey);
    batchPayments = await storage.getPaymentsByBatchId(billingBatch.id);
    if (batchPayments.length !== candidatePayments.length) {
      await storage.updateBillingBatchStatus(
        billingBatch.id,
        "failed",
        undefined,
        "Unable to lock all washouts for billing"
      );
      return {
        ownerId,
        billingBatch: await storage.getBillingBatch(billingBatch.id) as BillingBatch,
        status: "failed",
        message: "Unable to lock washouts for billing.",
        amountCents: candidateAmountCents,
        washoutCount: candidatePayments.length,
      };
    }
  }

  const paymentsToBill = batchPayments.length > 0 ? batchPayments : candidatePayments;
  const totalPlatformFeeCents = paymentsToBill.reduce((sum, payment) => sum + toCents(payment.processingFee), 0);
  const totalDriverTipCents = paymentsToBill.reduce((sum, payment) => sum + normalizeMoneyToCents(payment.tipAmountCents, "auto"), 0);
  const batchDriverTipCentsByDriver = paymentsToBill.reduce<Record<string, number>>((acc, payment) => {
    const tipCents = normalizeMoneyToCents(payment.tipAmountCents, "auto");
    acc[payment.driverId] = (acc[payment.driverId] || 0) + tipCents;
    return acc;
  }, {});
  const batchLedger = calculateOwnerWashoutBillingLedger({
    ownerId,
    billingBatchId: billingBatch.id,
    washoutActivityIds: paymentsToBill.map((payment) => payment.activityId).filter(Boolean),
    approvedWashoutCount: paymentsToBill.length,
    platformFeeCentsByWashout: paymentsToBill.map((payment) => toCents(payment.processingFee)),
    platformFeeTotalCents: totalPlatformFeeCents,
    driverTipCentsByWashout: paymentsToBill.map((payment) => normalizeMoneyToCents(payment.tipAmountCents, "auto")),
    driverTipCentsByDriver: batchDriverTipCentsByDriver,
    driverTipTotalCents: totalDriverTipCents,
    ownerChargeAmountCents: totalPlatformFeeCents + totalDriverTipCents,
    platformRevenueCents: totalPlatformFeeCents,
    driverTransfers: paymentsToBill.map((payment) => ({
      driverId: payment.driverId,
      connectedAccountId: payment.driver?.stripeConnectAccountId || null,
      amountCents: normalizeMoneyToCents(payment.tipAmountCents, "auto"),
      washoutActivityIds: [payment.activityId],
    })),
    stripeChargeAmountCents: totalPlatformFeeCents + totalDriverTipCents,
    platformFeeCentsPerWashout: paymentsToBill.map((payment) => toCents(payment.processingFee)),
    driverTipCentsPerWashout: paymentsToBill.map((payment) => normalizeMoneyToCents(payment.tipAmountCents, "auto")),
    immediateBilling: false,
    allowAdminOverride: runType === "admin_manual",
  });
  console.log(`[OWNER_BILLING_LEDGER]`, batchLedger);

  await storage.updateBillingBatchProcessing(
    billingBatch.id,
    formatMoney(batchLedger.ownerChargeAmountCents),
    formatMoney(totalPlatformFeeCents),
    paymentsToBill.length,
  );

  if (!stripeClient) {
    const failureReason = "Stripe is not configured";
    await storage.updateBillingBatchStatus(billingBatch.id, "skipped", undefined, failureReason);
    console.log(`⏭️  [OWNER_BILLING] Stripe unavailable for owner ${ownerId} batch ${billingBatch.id} - skipping`);
    return {
      ownerId,
      billingBatch: await storage.getBillingBatch(billingBatch.id) as BillingBatch,
      status: "skipped",
      message: "Stripe is not configured. Billing was not attempted.",
      amountCents: batchLedger.ownerChargeAmountCents,
      washoutCount: paymentsToBill.length,
    };
  }

  if (!ownerStripeCustomerId || !ownerPaymentMethodId) {
    const failureReason = `Owner is missing ${!ownerStripeCustomerId ? "Stripe customer" : "payment method"}`;
    await storage.markBillingBatchFailed(billingBatch.id, failureReason);
    console.warn(`⚠️  [OWNER_BILLING] Missing payment setup for owner ${ownerId}: ${failureReason}`);
    return {
      ownerId,
      billingBatch: await storage.getBillingBatch(billingBatch.id) as BillingBatch,
      status: "failed",
      message: "Owner payment method is not configured.",
      amountCents: batchLedger.ownerChargeAmountCents,
      washoutCount: paymentsToBill.length,
    };
  }

  const paymentIntentMetadata = {
    batchId: billingBatch.id,
    ownerId,
    runType,
    startDate: startDate ? startDate.toISOString().split("T")[0] : "",
    endDate: endDate ? endDate.toISOString().split("T")[0] : "",
    washoutCount: String(paymentsToBill.length),
    amountCents: String(batchLedger.ownerChargeAmountCents),
    platformFeeCentsPerWashout: batchLedger.platformFeeCentsByWashout.join(","),
    driverTipCentsPerWashout: batchLedger.driverTipCentsByWashout.join(","),
    stripeChargeAmountCents: String(batchLedger.ownerChargeAmountCents),
    washoutActivityIds: paymentsToBill.map((payment) => payment.activityId).join(","),
    platformFeeTotal: formatMoney(totalPlatformFeeCents),
    driverTipTotal: formatMoney(totalDriverTipCents),
  };

  try {
    console.log(`[STRIPE_PAYMENT_REQUEST]`, {
      route: "processOwnerBillingRun",
      ownerId,
      billingBatchId: billingBatch.id,
      amountCents: batchLedger.ownerChargeAmountCents,
      platformRevenueCents: batchLedger.platformRevenueCents,
      driverTipTotalCents: batchLedger.driverTipTotalCents,
      washoutActivityIds: batchLedger.washoutActivityIds,
    });
    const paymentActivityIds = paymentsToBill
      .map((payment) => payment.activityId)
      .filter((activityId) => Boolean(activityId));
    const idempotencyKey = buildStripeIdempotencyKey(
      "owner_billing_run",
      ownerId,
      billingBatch.id,
      batchLedger.ownerChargeAmountCents,
      paymentActivityIds,
      ownerStripeCustomerId,
      ownerPaymentMethodId,
      runType,
    );
    const paymentIntent = await stripeClient.paymentIntents.create({
      amount: batchLedger.ownerChargeAmountCents,
      currency: "usd",
      customer: ownerStripeCustomerId,
      payment_method: ownerPaymentMethodId,
      confirm: true,
      off_session: true,
      payment_method_types: ["card"],
      description: `Owner billing run - ${paymentsToBill.length} washouts`,
      metadata: paymentIntentMetadata,
    } as any, {
      idempotencyKey,
    });

    console.log(`💳 [OWNER_BILLING] Stripe payment intent created for owner ${ownerId}`, {
      billingBatchId: billingBatch.id,
      paymentIntentId: paymentIntent.id,
      amountCents: batchLedger.ownerChargeAmountCents,
      washoutCount: paymentsToBill.length,
    });
    console.log(`[OWNER_BILLING_RECONCILIATION]`, {
      ownerId,
      billingBatchId: billingBatch.id,
      requestedChargeAmountCents: batchLedger.ownerChargeAmountCents,
      platformRevenueCents: batchLedger.platformRevenueCents,
      driverTransferAmountCents: batchLedger.driverTransfers.reduce((sum, transfer) => sum + transfer.amountCents, 0),
      paymentIntentId: paymentIntent.id,
    });

    if (paymentIntent.status && paymentIntent.status !== "succeeded") {
      if (paymentIntent.status === "processing") {
        await storage.updateBillingBatchStatus(billingBatch.id, "processing", paymentIntent.id);
        console.log(`⏳ [OWNER_BILLING] Payment intent ${paymentIntent.id} still processing for owner ${ownerId}`);
        return {
          ownerId,
          billingBatch: await storage.getBillingBatch(billingBatch.id) as BillingBatch,
          status: "processing",
          message: "Stripe accepted the charge and is still processing it.",
          amountCents: batchLedger.ownerChargeAmountCents,
          washoutCount: paymentsToBill.length,
          stripePaymentIntentId: paymentIntent.id,
        };
      }

      const failureReason = `Stripe returned status ${paymentIntent.status}`;
      await storage.markBillingBatchFailed(billingBatch.id, failureReason);
      console.warn(`❌ [OWNER_BILLING] Stripe charge incomplete for owner ${ownerId}: ${failureReason}`);
      return {
        ownerId,
        billingBatch: await storage.getBillingBatch(billingBatch.id) as BillingBatch,
        status: "failed",
        message: `Stripe charge did not complete (${paymentIntent.status}).`,
        amountCents: batchLedger.ownerChargeAmountCents,
        washoutCount: paymentsToBill.length,
        stripePaymentIntentId: paymentIntent.id,
      };
    }

    await storage.completeBatchPayment(billingBatch.id, paymentIntent.id);
    console.log(`✅ [OWNER_BILLING] Billing completed for owner ${ownerId}`, {
      billingBatchId: billingBatch.id,
      paymentIntentId: paymentIntent.id,
      amountCents: batchLedger.ownerChargeAmountCents,
      washoutCount: paymentsToBill.length,
    });
    return {
      ownerId,
      billingBatch: await storage.getBillingBatch(billingBatch.id) as BillingBatch,
      status: "paid",
      message: `Successfully charged $${(batchLedger.ownerChargeAmountCents / 100).toFixed(2)} for ${paymentsToBill.length} washouts.`,
      amountCents: batchLedger.ownerChargeAmountCents,
      washoutCount: paymentsToBill.length,
      stripePaymentIntentId: paymentIntent.id,
    };
  } catch (error) {
    const failureReason = error instanceof Error ? error.message : "Unknown Stripe error";
    await storage.markBillingBatchFailed(billingBatch.id, failureReason);
    console.error(`❌ [OWNER_BILLING] Billing failed for owner ${ownerId}: ${failureReason}`);
    return {
      ownerId,
      billingBatch: await storage.getBillingBatch(billingBatch.id) as BillingBatch,
      status: "failed",
      message: failureReason,
      amountCents: batchLedger.ownerChargeAmountCents,
      washoutCount: paymentsToBill.length,
    };
  }
}

export async function processOwnerBillingRun(
  options: ProcessOwnerBillingRunOptions
): Promise<OwnerBillingRunSummary> {
  const { ownerId, startDate, endDate, storage, stripeClient } = options;

  const runResults: OwnerBillingRunResult[] = [];
  const ownersToProcess = ownerId
    ? [{ ownerId }]
    : await storage.getAllOwnersBillingSettings();

  for (const ownerEntry of ownersToProcess) {
    const currentOwnerId = ownerEntry.ownerId;

    if (!ownerId) {
      const previewPayments = await storage.getPendingPaymentsForOwnerBilling(currentOwnerId, startDate, endDate);
      if (previewPayments.length === 0) {
        continue;
      }
    }

    try {
      const result = await processSingleOwnerBillingRun({
        ...options,
        ownerId: currentOwnerId,
      });
      runResults.push(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown billing run error";
      runResults.push({
        ownerId: currentOwnerId,
        billingBatch: null,
        status: "failed",
        message,
        amountCents: 0,
        washoutCount: 0,
      });
    }
  }

  return {
    runs: runResults,
    processed: runResults.filter((run) => run.status === "paid" || run.status === "processing").length,
    failed: runResults.filter((run) => run.status === "failed").length,
    skipped: runResults.filter((run) => run.status === "skipped").length,
    totalAmountCents: runResults.reduce((sum, run) => sum + run.amountCents, 0),
    totalWashoutCount: runResults.reduce((sum, run) => sum + run.washoutCount, 0),
  };
}

export async function runOwnerBillingNow(options: ProcessOwnerBillingRunOptions): Promise<{
  billingRun: BillingBatch | null;
  status: OwnerBillingRunStatus;
  message: string;
  amountCents: number;
  washoutCount: number;
}> {
  const ownerResult = await processOwnerBillingRun(options);
  const [firstRun] = ownerResult.runs;

  if (!firstRun) {
    return {
      billingRun: null,
      status: "skipped",
      message: "No owner billing runs were processed.",
      amountCents: 0,
      washoutCount: 0,
    };
  }

  return {
    billingRun: firstRun.billingBatch,
    status: firstRun.status,
    message: firstRun.message,
    amountCents: firstRun.amountCents,
    washoutCount: firstRun.washoutCount,
  };
}
