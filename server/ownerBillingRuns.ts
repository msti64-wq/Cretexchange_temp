import type Stripe from "stripe";

type BillingBatch = any;
type Payment = any;
type User = any;
type Owner = any;
type WashoutActivity = any;
type Driver = any;

export type OwnerBillingRunType = "weekly_scheduled" | "admin_manual";
export type OwnerBillingRunStatus = "pending" | "processing" | "paid" | "failed" | "skipped";

export interface OwnerBillingRunStorage {
  getUser(userId: string): Promise<User | undefined>;
  getOwnerById(ownerId: string): Promise<Owner | undefined>;
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

  console.log(`💳 [OWNER_BILLING] Starting ${runType} run for owner ${ownerId}`, {
    startDate: startDate ? startDate.toISOString() : null,
    endDate: endDate ? endDate.toISOString() : null,
    reusedBatchId: existingBatchId || null,
  });

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

  const candidateAmountCents = candidatePayments.reduce((sum, payment) => {
    return sum + toCents(payment.amount) + toCents(payment.processingFee) + toCents(payment.washoutServiceFee);
  }, 0);

  const batchMetadata = {
    runType,
    triggeredByAdminId: triggeredByAdminId || null,
    requestedAt: new Date().toISOString(),
    startDate: startDate ? startDate.toISOString() : null,
    endDate: endDate ? endDate.toISOString() : null,
    ownerUsername: ownerUser.username,
    ownerCompanyName: owner.companyName,
    reusedBatchId: existingBatch?.id || existingBatchId || null,
  };

  const billingBatch =
    existingBatch ||
    await storage.createBillingBatch({
      ownerId,
      businessDate: billingDateKey,
      cutoffTime: owner.billingCutoffTime || "23:59:00",
      timezone: owner.billingTimezone || "America/Chicago",
      status: "pending",
      totalAmount: formatMoney(candidateAmountCents),
      totalFees: "0.00",
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
  const totalAmountCents = paymentsToBill.reduce((sum, payment) => {
    return sum + toCents(payment.amount) + toCents(payment.processingFee) + toCents(payment.washoutServiceFee);
  }, 0);
  const totalFeesCents = paymentsToBill.reduce((sum, payment) => {
    return sum + toCents(payment.processingFee) + toCents(payment.washoutServiceFee);
  }, 0);

  await storage.updateBillingBatchProcessing(
    billingBatch.id,
    formatMoney(totalAmountCents),
    formatMoney(totalFeesCents),
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
      amountCents: totalAmountCents,
      washoutCount: paymentsToBill.length,
    };
  }

  if (!ownerUser.stripeCustomerId || !owner.stripePaymentMethodId) {
    const failureReason = `Owner is missing ${!ownerUser.stripeCustomerId ? "Stripe customer" : "payment method"}`;
    await storage.markBillingBatchFailed(billingBatch.id, failureReason);
    console.warn(`⚠️  [OWNER_BILLING] Missing payment setup for owner ${ownerId}: ${failureReason}`);
    return {
      ownerId,
      billingBatch: await storage.getBillingBatch(billingBatch.id) as BillingBatch,
      status: "failed",
      message: "Owner payment method is not configured.",
      amountCents: totalAmountCents,
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
    amountCents: String(totalAmountCents),
  };

  try {
    const paymentIntent = await stripeClient.paymentIntents.create({
      amount: totalAmountCents,
      currency: "usd",
      customer: ownerUser.stripeCustomerId,
      payment_method: owner.stripePaymentMethodId,
      confirm: true,
      automatic_payment_methods: {
        enabled: true,
      },
      description: `Owner billing run - ${paymentsToBill.length} washouts`,
      metadata: paymentIntentMetadata,
    } as any, {
      idempotencyKey: `owner_billing_run_${billingBatch.id}`,
    });

    console.log(`💳 [OWNER_BILLING] Stripe payment intent created for owner ${ownerId}`, {
      billingBatchId: billingBatch.id,
      paymentIntentId: paymentIntent.id,
      amountCents: totalAmountCents,
      washoutCount: paymentsToBill.length,
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
          amountCents: totalAmountCents,
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
        amountCents: totalAmountCents,
        washoutCount: paymentsToBill.length,
        stripePaymentIntentId: paymentIntent.id,
      };
    }

    await storage.completeBatchPayment(billingBatch.id, paymentIntent.id);
    console.log(`✅ [OWNER_BILLING] Billing completed for owner ${ownerId}`, {
      billingBatchId: billingBatch.id,
      paymentIntentId: paymentIntent.id,
      amountCents: totalAmountCents,
      washoutCount: paymentsToBill.length,
    });
    return {
      ownerId,
      billingBatch: await storage.getBillingBatch(billingBatch.id) as BillingBatch,
      status: "paid",
      message: `Successfully charged $${(totalAmountCents / 100).toFixed(2)} for ${paymentsToBill.length} washouts.`,
      amountCents: totalAmountCents,
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
      amountCents: totalAmountCents,
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
