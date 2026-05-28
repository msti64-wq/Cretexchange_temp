const DRIVER_STRIPE_WAITING_PAYMENT_STATUSES = new Set([
  "awaiting_driver_stripe",
  "pending_driver_onboarding",
]);

export function isAwaitingDriverStripePaymentStatus(status: string | null | undefined): boolean {
  if (!status) return false;
  return DRIVER_STRIPE_WAITING_PAYMENT_STATUSES.has(status);
}

export function getAwaitingDriverStripePaymentStatuses(): string[] {
  return Array.from(DRIVER_STRIPE_WAITING_PAYMENT_STATUSES);
}

export function getDriverStripeSetupMessage(): string {
  return "You have approved washouts awaiting payment. Complete your payment setup to receive payouts.";
}

