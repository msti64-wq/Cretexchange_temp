export const DEFAULT_ANNUAL_MEMBERSHIP_AMOUNT_CENTS = 1500;
export const DEFAULT_MONTHLY_LOCATION_DUES_AMOUNT_CENTS = 100;
export const DEFAULT_PER_WASHOUT_FEE_CENTS = 500;

function toNonNegativeCents(value: string | number | null | undefined, fallbackCents: number): number {
  if (value === null || value === undefined || value === "") {
    return fallbackCents;
  }

  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallbackCents;
  }

  return Math.round(parsed * 100);
}

export interface PlatformBillingSettingsInput {
  enableAnnualMembership?: boolean | null;
  enableMonthlyLocationDues?: boolean | null;
  defaultAnnualMembershipAmount?: string | number | null;
  defaultMonthlyLocationDuesAmount?: string | number | null;
  defaultPerWashoutFee?: string | number | null;
}

export interface OwnerBillingOverridesInput {
  annualMembershipEnabledOverride?: boolean | null;
  monthlyLocationDuesEnabledOverride?: boolean | null;
  membershipFeeOverride?: string | number | null;
  perWashoutFeeOverride?: string | number | null;
}

export interface LocationBillingOverrideInput {
  monthlyLocationFeeOverride?: number | null;
  monthlyFeeCents?: number | null;
}

export interface ResolvedBillingPolicy {
  enableAnnualMembership: boolean;
  enableMonthlyLocationDues: boolean;
  annualMembershipAmountCents: number;
  monthlyLocationDuesAmountCents: number;
  perWashoutFeeCents: number;
}

export function toCents(value: string | number | null | undefined, fallbackCents: number): number {
  return toNonNegativeCents(value, fallbackCents);
}

export function resolvePlatformFeeCents(value: string | number | null | undefined): number {
  return toNonNegativeCents(value, DEFAULT_PER_WASHOUT_FEE_CENTS);
}

export function resolveApprovedWashoutPlatformFeeCents(
  storedFeeCents: number | string | null | undefined,
  explicitOverrideCents?: number | string | null,
): number {
  if (explicitOverrideCents !== null && explicitOverrideCents !== undefined && explicitOverrideCents !== "") {
    const override = resolvePlatformFeeCents(explicitOverrideCents);
    if (override >= 0) {
      return override;
    }
  }

  if (storedFeeCents === null || storedFeeCents === undefined || storedFeeCents === "") {
    return DEFAULT_PER_WASHOUT_FEE_CENTS;
  }

  const parsed = typeof storedFeeCents === "number" ? storedFeeCents : Number(storedFeeCents);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return DEFAULT_PER_WASHOUT_FEE_CENTS;
  }

  if (parsed === 0) {
    return DEFAULT_PER_WASHOUT_FEE_CENTS;
  }

  return Math.round(parsed);
}

export function calculateOwnerWashoutChargeCents(
  baseWashoutAmountCents: number,
  platformFeeCents: number,
  driverTipCents: number = 0,
): number {
  return Math.max(0, baseWashoutAmountCents) + Math.max(0, platformFeeCents) + Math.max(0, driverTipCents);
}

export function calculateDriverPayoutCents(
  baseWashoutAmountCents: number,
  driverTipCents: number = 0,
): number {
  return Math.max(0, baseWashoutAmountCents) + Math.max(0, driverTipCents);
}

export function resolveBillingPolicy(
  platform: PlatformBillingSettingsInput | null | undefined,
  owner?: OwnerBillingOverridesInput | null,
  location?: LocationBillingOverrideInput | null,
): ResolvedBillingPolicy {
  const annualEnabled = owner?.annualMembershipEnabledOverride ?? platform?.enableAnnualMembership ?? true;
  const monthlyEnabled = owner?.monthlyLocationDuesEnabledOverride ?? platform?.enableMonthlyLocationDues ?? true;

  return {
    enableAnnualMembership: annualEnabled,
    enableMonthlyLocationDues: monthlyEnabled,
    annualMembershipAmountCents: owner?.membershipFeeOverride !== null && owner?.membershipFeeOverride !== undefined
      ? toCents(owner.membershipFeeOverride, DEFAULT_ANNUAL_MEMBERSHIP_AMOUNT_CENTS)
      : toCents(platform?.defaultAnnualMembershipAmount, DEFAULT_ANNUAL_MEMBERSHIP_AMOUNT_CENTS),
    monthlyLocationDuesAmountCents: location?.monthlyLocationFeeOverride !== null && location?.monthlyLocationFeeOverride !== undefined
      ? location.monthlyLocationFeeOverride
      : toCents(platform?.defaultMonthlyLocationDuesAmount, DEFAULT_MONTHLY_LOCATION_DUES_AMOUNT_CENTS),
    perWashoutFeeCents: owner?.perWashoutFeeOverride !== null && owner?.perWashoutFeeOverride !== undefined
      ? toCents(owner.perWashoutFeeOverride, DEFAULT_PER_WASHOUT_FEE_CENTS)
      : toCents(platform?.defaultPerWashoutFee, DEFAULT_PER_WASHOUT_FEE_CENTS),
  };
}

export function getActiveBillingPolicyLabels(policy: ResolvedBillingPolicy): Array<{ key: string; label: string; amountCents: number }> {
  const items: Array<{ key: string; label: string; amountCents: number }> = [];

  if (policy.enableAnnualMembership) {
    items.push({
      key: "annual-membership",
      label: "Annual platform fee",
      amountCents: policy.annualMembershipAmountCents,
    });
  }

  if (policy.enableMonthlyLocationDues) {
    items.push({
      key: "monthly-location-dues",
      label: "Monthly location dues",
      amountCents: policy.monthlyLocationDuesAmountCents,
    });
  }

  items.push({
    key: "per-washout-fee",
    label: "Platform fee per washout",
    amountCents: policy.perWashoutFeeCents,
  });

  return items;
}
