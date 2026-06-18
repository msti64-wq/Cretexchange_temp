import { normalizeMoneyToCents } from "./money";

export const DEFAULT_LOCATION_MONTHLY_FEE_CENTS = 100;
export const DEFAULT_LOCATION_DRIVER_TIP_CENTS = 0;

export function resolveLocationMonthlyFeeCents(monthlyFeeCents: number | null | undefined): number {
  if (monthlyFeeCents === null || monthlyFeeCents === undefined) {
    return DEFAULT_LOCATION_MONTHLY_FEE_CENTS;
  }

  return monthlyFeeCents;
}

export function hasMoneyValue(value: string | number | null | undefined): boolean {
  return value !== null && value !== undefined && value !== "";
}

export function resolveLocationDriverTipRateCents(rate: string | number | null | undefined): number {
  if (!hasMoneyValue(rate)) {
    return DEFAULT_LOCATION_DRIVER_TIP_CENTS;
  }

  const normalized = normalizeMoneyToCents(rate, "dollars");
  return Number.isFinite(normalized) && normalized >= 0 ? normalized : DEFAULT_LOCATION_DRIVER_TIP_CENTS;
}

export function resolveWashoutDriverTipCents(
  activityAmount: string | number | null | undefined,
  locationDriverTipRate: string | number | null | undefined,
): number {
  if (hasMoneyValue(activityAmount)) {
    return normalizeMoneyToCents(activityAmount, "dollars");
  }
  return resolveLocationDriverTipRateCents(locationDriverTipRate);
}

export function resolveApprovedWashoutDriverTipCents(
  activityAmount: string | number | null | undefined,
  _paymentTipAmountCents: string | number | null | undefined,
  locationDriverTipRate: string | number | null | undefined,
): number {
  return resolveWashoutDriverTipCents(activityAmount, locationDriverTipRate);
}

export function inspectLocationDriverTipRateCents(rate: string | number | null | undefined) {
  const rawNumber = rate === null || rate === undefined || rate === ""
    ? null
    : Number(String(rate).trim());
  const normalizedDriverTipCents = resolveLocationDriverTipRateCents(rate);
  const driverTipEnabled = rawNumber !== null ? rawNumber > 0 : false;

  if (driverTipEnabled && normalizedDriverTipCents === 0) {
    throw new Error("Driver incentive tip must be at least $0.01 when enabled");
  }

  return {
    rawNumber,
    normalizedDriverTipCents,
    driverTipEnabled,
  };
}
