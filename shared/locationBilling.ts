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

  const parsed = typeof tipAmount === "number" ? tipAmount : Number(tipAmount);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return DEFAULT_LOCATION_DRIVER_INCENTIVE_TIP_CENTS;
  }

  return Math.round(parsed * 100);
}
