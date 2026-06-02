const DRIVER_STRIPE_WAITING_PAYMENT_STATUSES = new Set([
  "awaiting_driver_stripe",
  "pending_driver_onboarding",
  "held_for_onboarding",
]);

export function isAwaitingDriverStripePaymentStatus(status: string | null | undefined): boolean {
  if (!status) return false;
  return DRIVER_STRIPE_WAITING_PAYMENT_STATUSES.has(status);
}

export function getAwaitingDriverStripePaymentStatuses(): string[] {
  return Array.from(DRIVER_STRIPE_WAITING_PAYMENT_STATUSES);
}

export function getDriverStripeSetupMessage(): string {
  return "You have approved washouts with owner-funded tips waiting on your Stripe setup. Complete setup to receive tip payouts.";
}
