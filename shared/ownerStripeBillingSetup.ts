type StripeBillingOwnerRecord = {
  stripeCustomerId?: string | null;
  stripePaymentMethodId?: string | null;
};

type StripeBillingUserRecord = {
  stripeCustomerId?: string | null;
  stripePaymentMethodId?: string | null;
};

function normalizeStripeId(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export type OwnerStripeBillingSetup = {
  hasStripeCustomer: boolean;
  hasPaymentMethod: boolean;
  customerId: string | null;
  paymentMethodId: string | null;
  customerIdSource: "owner" | "user" | null;
  paymentMethodSource: "owner" | "user" | null;
  statusLabel: "ready_for_billing" | "missing_customer" | "missing_payment_method";
  displayLabel: string;
};

export function getOwnerStripeBillingSetup(
  owner?: StripeBillingOwnerRecord | null,
  user?: StripeBillingUserRecord | null,
): OwnerStripeBillingSetup {
  const ownerCustomerId = normalizeStripeId(owner?.stripeCustomerId);
  const userCustomerId = normalizeStripeId(user?.stripeCustomerId);
  const ownerPaymentMethodId = normalizeStripeId(owner?.stripePaymentMethodId);
  const userPaymentMethodId = normalizeStripeId(user?.stripePaymentMethodId);

  const customerId = ownerCustomerId || userCustomerId;
  const paymentMethodId = ownerPaymentMethodId || userPaymentMethodId;
  const customerIdSource = ownerCustomerId ? "owner" : userCustomerId ? "user" : null;
  const paymentMethodSource = ownerPaymentMethodId ? "owner" : userPaymentMethodId ? "user" : null;
  const hasStripeCustomer = Boolean(customerId);
  const hasPaymentMethod = Boolean(paymentMethodId);

  if (!hasStripeCustomer) {
    return {
      hasStripeCustomer,
      hasPaymentMethod,
      customerId,
      paymentMethodId,
      customerIdSource,
      paymentMethodSource,
      statusLabel: "missing_customer",
      displayLabel: "Missing customer identification",
    };
  }

  if (!hasPaymentMethod) {
    return {
      hasStripeCustomer,
      hasPaymentMethod,
      customerId,
      paymentMethodId,
      customerIdSource,
      paymentMethodSource,
      statusLabel: "missing_payment_method",
      displayLabel: "Card missing",
    };
  }

  return {
    hasStripeCustomer,
    hasPaymentMethod,
    customerId,
    paymentMethodId,
    customerIdSource,
    paymentMethodSource,
    statusLabel: "ready_for_billing",
    displayLabel: "Card on file / Ready for billing",
  };
}
