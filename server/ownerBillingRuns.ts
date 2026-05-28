import type Stripe from "stripe";
type BillingRun = any;
type BillingRunItem = any;
type Payment = any;
type User = any;
type Owner = any;
type WashoutActivity = any;
type Driver = any;

export type OwnerBillingRunType = "weekly_scheduled" | "admin_manual";
export type OwnerBillingRunStatus = "pending" | "processing" | "paid" | "failed" | "skipped";

export interface OwnerBillingRunStorage {
  getUser(userId: string): Promise<User | undefined>;
  getOwner(userId: string): Promise<Owner | undefined>;
  getOwnerById(ownerId: string): Promise<Owner | undefined>;
  getOwnerBillingSummary(ownerId: string, startDate?: Date, endDate?: Date): Promise<{
    ownerId: string;
    currentUnbilledBalanceCents: number;
    unbilledWashoutCount: number;
    lastBillingRun: BillingRun | null;
    recentRuns: BillingRun[];
  }>;
  getPendingPaymentsForOwnerBilling(ownerId: string, startDate?: Date, endDate?: Date): Promise<(Payment & { activity: WashoutActivity; driver: Driver & { user: User } })[]>;
  getBillingRun(runId: string): Promise<BillingRun | undefined>;
  createBillingRun(run: Partial<BillingRun> & {
    ownerId: string;
    runType: OwnerBillingRunType;
    triggeredByAdminId?: string | null;
    startDate?: string | null;
    endDate?: string | null;
    status: OwnerBillingRunStatus;
    stripePaymentIntentId?: string | null;
    amount: string;
    washoutCount: number;
    processedAt?: Date | null;
    failureReason?: string | null;
    metadata?: any;
  }): Promise<BillingRun>;
  createBillingRunItem(item: {
    billingRunId: string;
    paymentId: string;
    ownerId: string;
    activityId: string;
    status: OwnerBillingRunStatus;
    amount: string;
    processedAt?: Date | null;
    failureReason?: string;
    metadata?: any;
  }): Promise<BillingRunItem>;
  updateBillingRunItemsStatus(runId: string, status: OwnerBillingRunStatus, failureReason?: string): Promise<number>;
  lockPaymentsForBillingRun(paymentIds: string[], runId: string): Promise<number>;
  updateBillingRunStatus(runId: string, status: string, stripePaymentIntentId?: string, failureReason?: string): Promise<BillingRun>;
  clearBillingRunLocks(runId: string): Promise<number>;
  completeBillingRun(runId: string, stripePaymentIntentId: string): Promise<void>;
  failBillingRun(runId: string, failureReason: string, stripePaymentIntentId?: string): Promise<void>;
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

export interface RunOwnerBillingNowOptions {
  ownerId: string;
  triggeredByAdminId?: string;
  runType: OwnerBillingRunType;
  startDate?: Date;
  endDate?: Date;
  storage: OwnerBillingRunStorage;
  stripeClient?: StripeBillingChargeClient | null;
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

export async function runOwnerBillingNow(options: RunOwnerBillingNowOptions): Promise<{
  billingRun: BillingRun;
  status: OwnerBillingRunStatus;
  message: string;
  amountCents: number;
  washoutCount: number;
}> {
  const { ownerId, triggeredByAdminId, runType, startDate, endDate, storage, stripeClient } = options;

  const owner = await storage.getOwnerById(ownerId);
  if (!owner) {
    throw new Error(`Owner ${ownerId} not found`);
  }

  const ownerUser = await storage.getUser(owner.userId);
  if (!ownerUser) {
    throw new Error(`Owner user ${owner.userId} not found`);
  }

  const candidatePayments = await storage.getPendingPaymentsForOwnerBilling(ownerId, startDate, endDate);
  const summaryAmountCents = candidatePayments.reduce((sum, payment) => {
    return sum + toCents(payment.amount) + toCents(payment.processingFee) + toCents(payment.washoutServiceFee);
  }, 0);

  const billingRun = await storage.createBillingRun({
    ownerId,
    runType,
    triggeredByAdminId: triggeredByAdminId || null,
    startDate: startDate ? startDate.toISOString().split("T")[0] : null,
    endDate: endDate ? endDate.toISOString().split("T")[0] : null,
    status: "pending",
    amount: formatMoney(summaryAmountCents),
    washoutCount: candidatePayments.length,
    metadata: {
      ownerUsername: ownerUser.username,
      ownerCompanyName: owner.companyName,
      requestedBy: triggeredByAdminId || null,
      requestedAt: new Date().toISOString(),
    },
  } as any);

  if (candidatePayments.length === 0) {
    await storage.updateBillingRunStatus(billingRun.id, "skipped", undefined, "No unbilled washouts found");
    return {
      billingRun: await storage.getBillingRun(billingRun.id) as BillingRun,
      status: "skipped",
      message: "No unbilled washouts found for this owner.",
      amountCents: 0,
      washoutCount: 0,
    };
  }

  const paymentIds = candidatePayments.map((payment) => payment.id);
  const lockedCount = await storage.lockPaymentsForBillingRun(paymentIds, billingRun.id);
  if (lockedCount !== paymentIds.length) {
    await storage.updateBillingRunStatus(
      billingRun.id,
      "failed",
      undefined,
      "One or more washouts were claimed by another billing run before processing started"
    );
    return {
      billingRun: await storage.getBillingRun(billingRun.id) as BillingRun,
      status: "failed",
      message: "Some washouts were already claimed by another billing run.",
      amountCents: summaryAmountCents,
      washoutCount: candidatePayments.length,
    };
  }

  for (const payment of candidatePayments) {
    const itemAmountCents =
      toCents(payment.amount) + toCents(payment.processingFee) + toCents(payment.washoutServiceFee);
    await storage.createBillingRunItem({
      billingRunId: billingRun.id,
      paymentId: payment.id,
      ownerId,
      activityId: payment.activityId,
      status: "pending",
      amount: formatMoney(itemAmountCents),
      metadata: {
        driverId: payment.driverId,
        driverAmount: payment.amount,
        processingFee: payment.processingFee,
        washoutServiceFee: payment.washoutServiceFee,
        businessDate: payment.businessDate,
      },
    } as any);
  }

  await storage.updateBillingRunStatus(billingRun.id, "processing");

  if (!stripeClient) {
    await storage.updateBillingRunStatus(billingRun.id, "skipped", undefined, "Stripe is not configured");
    await storage.updateBillingRunItemsStatus(billingRun.id, "skipped", "Stripe is not configured");
    await storage.clearBillingRunLocks(billingRun.id);
    return {
      billingRun: await storage.getBillingRun(billingRun.id) as BillingRun,
      status: "skipped",
      message: "Stripe is not configured. Billing was not attempted.",
      amountCents: summaryAmountCents,
      washoutCount: candidatePayments.length,
    };
  }

  if (!ownerUser.stripeCustomerId || !owner.stripePaymentMethodId) {
    await storage.failBillingRun(
      billingRun.id,
      `Owner is missing ${!ownerUser.stripeCustomerId ? "Stripe customer" : "payment method"}`
    );
    return {
      billingRun: await storage.getBillingRun(billingRun.id) as BillingRun,
      status: "failed",
      message: "Owner payment method is not configured.",
      amountCents: summaryAmountCents,
      washoutCount: candidatePayments.length,
    };
  }

  try {
    const paymentIntent = await stripeClient.paymentIntents.create({
      amount: summaryAmountCents,
      currency: "usd",
      customer: ownerUser.stripeCustomerId,
      payment_method: owner.stripePaymentMethodId,
      confirm: true,
      automatic_payment_methods: {
        enabled: true,
      },
      description: `Owner billing run - ${candidatePayments.length} washouts`,
      metadata: {
        billingRunId: billingRun.id,
        ownerId,
        runType,
        washoutCount: String(candidatePayments.length),
        amountCents: String(summaryAmountCents),
      },
    } as any, {
      idempotencyKey: `owner_billing_run_${billingRun.id}`,
    });

    if (paymentIntent.status && paymentIntent.status !== "succeeded") {
      if (paymentIntent.status === "processing") {
        await storage.updateBillingRunStatus(billingRun.id, "processing", paymentIntent.id);
        return {
          billingRun: await storage.getBillingRun(billingRun.id) as BillingRun,
          status: "processing",
          message: "Stripe accepted the charge and is still processing it.",
          amountCents: summaryAmountCents,
          washoutCount: candidatePayments.length,
        };
      }

      await storage.failBillingRun(
        billingRun.id,
        `Stripe returned status ${paymentIntent.status}`,
        paymentIntent.id
      );
      return {
        billingRun: await storage.getBillingRun(billingRun.id) as BillingRun,
        status: "failed",
        message: `Stripe charge did not complete (${paymentIntent.status}).`,
        amountCents: summaryAmountCents,
        washoutCount: candidatePayments.length,
      };
    }

    await storage.completeBillingRun(billingRun.id, paymentIntent.id);
    return {
      billingRun: await storage.getBillingRun(billingRun.id) as BillingRun,
      status: "paid",
      message: `Successfully charged $${(summaryAmountCents / 100).toFixed(2)} for ${candidatePayments.length} washouts.`,
      amountCents: summaryAmountCents,
      washoutCount: candidatePayments.length,
    };
  } catch (error) {
    const failureReason = error instanceof Error ? error.message : "Unknown Stripe error";
    await storage.failBillingRun(billingRun.id, failureReason);
    return {
      billingRun: await storage.getBillingRun(billingRun.id) as BillingRun,
      status: "failed",
      message: failureReason,
      amountCents: summaryAmountCents,
      washoutCount: candidatePayments.length,
    };
  }
}
