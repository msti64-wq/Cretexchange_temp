import { normalizeMoneyToCents } from "./money";

export const DEFAULT_LOCATION_MONTHLY_FEE_CENTS = 100;
export const DEFAULT_LOCATION_DRIVER_INCENTIVE_TIP_CENTS = 0;

export function resolveLocationMonthlyFeeCents(monthlyFeeCents: number | null | undefined): number {
  if (monthlyFeeCents === null || monthlyFeeCents === undefined) {
    return DEFAULT_LOCATION_MONTHLY_FEE_CENTS;
  }

  return monthlyFeeCents;
}

export function resolveLocationDriverIncentiveTipCents(tipAmount: string | number | null | undefined): number {
  if (tipAmount === null || tipAmount === undefined || tipAmount === "") {
    return DEFAULT_LOCATION_DRIVER_INCENTIVE_TIP_CENTS;
  }

  const normalized = normalizeMoneyToCents(tipAmount, "auto");
  return Number.isFinite(normalized) && normalized >= 0 ? normalized : DEFAULT_LOCATION_DRIVER_INCENTIVE_TIP_CENTS;
}

export function inspectLocationDriverIncentiveTipCents(tipAmount: string | number | null | undefined) {
  const rawNumber = tipAmount === null || tipAmount === undefined || tipAmount === ""
    ? null
    : Number(String(tipAmount).trim());
  const normalizedDriverTipCents = resolveLocationDriverIncentiveTipCents(tipAmount);
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
