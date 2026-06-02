type SystemSettingsLike = {
  enableAnnualMembership?: boolean | null;
  enableMonthlyLocationDues?: boolean | null;
  defaultAnnualMembershipAmount?: string | number | null;
  defaultMonthlyLocationDuesAmount?: string | number | null;
  defaultPerWashoutFee?: string | number | null;
};

type OwnerBillingOverridesLike = {
  annualMembershipEnabledOverride?: boolean | null;
  monthlyLocationDuesEnabledOverride?: boolean | null;
  membershipFeeOverride?: string | number | null;
  perWashoutFeeOverride?: string | number | null;
};

type WashoutLocationLike = {
  monthlyLocationFeeOverride?: number | null;
  monthlyFeeCents?: number | null;
};
import {
  getActiveBillingPolicyLabels,
  resolvePlatformFeeCents,
  calculateOwnerWashoutChargeCents,
  calculateDriverPayoutCents,
  resolveBillingPolicy,
  type ResolvedBillingPolicy,
} from "@shared/billingPolicy";

export type BillingPolicy = ResolvedBillingPolicy;

export function resolveOwnerBillingPolicy(
  systemSettings: SystemSettingsLike,
  owner: OwnerBillingOverridesLike,
  location?: WashoutLocationLike | null,
): BillingPolicy {
  return resolveBillingPolicy(systemSettings, owner, location ?? undefined);
}

export { getActiveBillingPolicyLabels, resolveBillingPolicy, resolvePlatformFeeCents, calculateOwnerWashoutChargeCents, calculateDriverPayoutCents };
