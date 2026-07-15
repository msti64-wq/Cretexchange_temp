export interface DriverLifecycleActivity {
  id?: string;
  status?: unknown;
  washoutStatus?: unknown;
  washout_activities?: { id?: string; status?: unknown; washoutStatus?: unknown };
}

export interface DriverLifecyclePayment {
  status?: unknown;
  activity?: DriverLifecycleActivity | null;
  washoutActivity?: DriverLifecycleActivity | null;
  deferReason?: unknown;
}

export interface DriverPaymentLifecyclePresentation {
  activitySource: "available" | "unavailable";
  financialSource: "available" | "unavailable";
  awaitingReviewCount: number | null;
  verifiedAwaitingPaymentCount: number | null;
  paymentExceptionCount: number | null;
  scheduledPaymentCount: null;
  paidCount: null;
}

const PENDING_ACTIVITY_STATUSES = new Set(["pending"]);
const VERIFIED_ACTIVITY_STATUSES = new Set(["verified"]);
const CANONICAL_ACTIVITY_STATUSES = new Set(["pending", "verified", "rejected"]);
const UNPAID_PAYMENT_STATUSES = new Set(["pending", "processing", "queued"]);
const PAYMENT_EXCEPTION_STATUSES = new Set(["failed", "held", "cancelled", "canceled"]);

function activityStatus(activity: DriverLifecycleActivity | null | undefined): string {
  return String(activity?.washout_activities?.status ?? activity?.washout_activities?.washoutStatus ?? activity?.washoutStatus ?? activity?.status ?? "").toLowerCase();
}

function paymentActivity(payment: DriverLifecyclePayment): DriverLifecycleActivity | null {
  return payment.activity || payment.washoutActivity || null;
}

function hasUnknownActivityStatus(activities: DriverLifecycleActivity[]): boolean {
  return activities.some((activity) => !CANONICAL_ACTIVITY_STATUSES.has(activityStatus(activity)));
}

export function buildDriverPaymentLifecycle(
  activities: DriverLifecycleActivity[] | undefined,
  payments: DriverLifecyclePayment[] | undefined,
): DriverPaymentLifecyclePresentation {
  const activitySource = Array.isArray(activities) && !hasUnknownActivityStatus(activities) ? "available" : "unavailable";
  const financialSource = Array.isArray(payments) ? "available" : "unavailable";
  const activityRows = activities || [];
  const paymentRows = payments || [];
  const hasUnknownUnpaidPaymentActivity = paymentRows.some((payment) =>
    UNPAID_PAYMENT_STATUSES.has(String(payment.status || "").toLowerCase())
    && !CANONICAL_ACTIVITY_STATUSES.has(activityStatus(paymentActivity(payment))),
  );

  return {
    activitySource,
    financialSource,
    awaitingReviewCount: activitySource === "available"
      ? activityRows.filter((activity) => PENDING_ACTIVITY_STATUSES.has(activityStatus(activity))).length
      : null,
    verifiedAwaitingPaymentCount: financialSource === "available" && !hasUnknownUnpaidPaymentActivity
      ? paymentRows.filter((payment) => UNPAID_PAYMENT_STATUSES.has(String(payment.status || "").toLowerCase()) && VERIFIED_ACTIVITY_STATUSES.has(activityStatus(paymentActivity(payment)))).length
      : null,
    paymentExceptionCount: financialSource === "available"
      ? paymentRows.filter((payment) => PAYMENT_EXCEPTION_STATUSES.has(String(payment.status || "").toLowerCase()) || Boolean(payment.deferReason)).length
      : null,
    // No driver-scoped scheduled-payout or reconciled payout-history source is exposed today.
    scheduledPaymentCount: null,
    paidCount: null,
  };
}
