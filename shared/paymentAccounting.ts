import { normalizeMoneyToCents } from "./money";

export type PaymentAccountingLike = {
  amount?: string | number | null;
  processingFee?: string | number | null;
  washoutServiceFee?: string | number | null;
  tipAmountCents?: string | number | null;
};

function hasMoneyValue(value: string | number | null | undefined): boolean {
  return value !== null && value !== undefined && value !== "";
}

function toCents(value: string | number | null | undefined, mode: "auto" | "cents" | "dollars" = "auto"): number {
  if (!hasMoneyValue(value)) {
    return 0;
  }
  const parsed = normalizeMoneyToCents(value, mode);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

export function getPaymentDriverIncentiveCents(payment: PaymentAccountingLike | null | undefined): number {
  if (!payment) return 0;
  if (hasMoneyValue(payment.amount)) {
    return toCents(payment.amount, "dollars");
  }
  if (hasMoneyValue(payment.washoutServiceFee)) {
    return toCents(payment.washoutServiceFee, "dollars");
  }
  if (hasMoneyValue(payment.tipAmountCents)) {
    return toCents(payment.tipAmountCents, "auto");
  }
  return 0;
}

export function getPaymentPlatformFeeCents(payment: PaymentAccountingLike | null | undefined): number {
  if (!payment) return 0;
  if (hasMoneyValue(payment.processingFee)) {
    return toCents(payment.processingFee, "dollars");
  }
  return 0;
}

export function getPaymentOwnerChargeCents(payment: PaymentAccountingLike | null | undefined): number {
  return getPaymentDriverIncentiveCents(payment) + getPaymentPlatformFeeCents(payment);
}

export function getPaymentWashoutServiceFeeCents(payment: PaymentAccountingLike | null | undefined): number {
  if (!payment) return 0;
  if (hasMoneyValue(payment.washoutServiceFee)) {
    return toCents(payment.washoutServiceFee, "dollars");
  }
  return getPaymentDriverIncentiveCents(payment);
}
