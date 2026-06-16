import { normalizeMoneyToCents } from "./money";

export const DEFAULT_ANNUAL_MEMBERSHIP_AMOUNT_CENTS = 1500;
export const DEFAULT_MONTHLY_LOCATION_DUES_AMOUNT_CENTS = 100;
export const DEFAULT_PER_WASHOUT_FEE_CENTS = 500;

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

export interface OwnerBillingTransferEntry {
  driverId: string;
  connectedAccountId: string | null;
  amountCents: number;
  transferId?: string | null;
  washoutActivityIds?: string[];
}

export interface OwnerBillingLedger {
  ownerId: string;
  billingBatchId: string;
  washoutActivityIds: string[];
  approvedWashoutCount: number;
  platformFeeCentsByWashout: number[];
  platformFeeTotalCents: number;
  driverTipCentsByWashout: number[];
  driverTipCentsByDriver: Record<string, number>;
  driverTipTotalCents: number;
  ownerChargeAmountCents: number;
  platformRevenueCents: number;
  driverTransfers: OwnerBillingTransferEntry[];
  reconciliationStatus?: "pending" | "balanced" | "needs_review" | "failed";
  immediateBilling?: boolean;
  allowAdminOverride?: boolean;
  // Legacy aliases kept for compatibility during the accounting rollout.
  batchId?: string;
  platformFeeCentsPerWashout?: number[];
  driverTipCentsPerWashout?: number[];
  stripeChargeAmountCents?: number;
}

export function toCents(value: string | number | null | undefined, fallbackCents: number): number {
  if (value === null || value === undefined || value === "") {
    return fallbackCents;
  }
  const normalized = normalizeMoneyToCents(value, "dollars");
  return Number.isFinite(normalized) && normalized >= 0 ? normalized : fallbackCents;
}

export function resolvePlatformFeeCents(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === "") {
    return DEFAULT_PER_WASHOUT_FEE_CENTS;
  }
  const parsed = normalizeMoneyToCents(value, "dollars");
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_PER_WASHOUT_FEE_CENTS;
}

export function resolveConfiguredWashoutPlatformFeeCents(params: {
  ownerCustomPlatformFee?: string | number | null;
  systemPlatformWashoutFee?: string | number | null;
  requireExplicit?: boolean;
}): number {
  const { ownerCustomPlatformFee, systemPlatformWashoutFee, requireExplicit = false } = params;
  const source = ownerCustomPlatformFee !== null && ownerCustomPlatformFee !== undefined && ownerCustomPlatformFee !== ""
    ? ownerCustomPlatformFee
    : systemPlatformWashoutFee;

  if (source === null || source === undefined || source === "") {
    if (requireExplicit) {
      throw new Error("Platform fee configuration is missing");
    }
    return DEFAULT_PER_WASHOUT_FEE_CENTS;
  }

  const parsed = normalizeMoneyToCents(source, "dollars");
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error("Invalid platform fee configuration");
  }
  return parsed;
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

  const parsed = normalizeMoneyToCents(storedFeeCents, "auto");
  if (!Number.isFinite(parsed) || parsed < 0) {
    return DEFAULT_PER_WASHOUT_FEE_CENTS;
  }

  if (parsed === 0) {
    return 0;
  }

  return Math.round(parsed);
}

export function calculateOwnerWashoutChargeCents(
  baseWashoutAmountCents: number,
  platformFeeCents: number,
  driverTipCents: number = 0,
): number {
  void baseWashoutAmountCents;
  return Math.max(0, Math.round(platformFeeCents)) + Math.max(0, Math.round(driverTipCents));
}

export function calculateDriverPayoutCents(
  baseWashoutAmountCents: number,
  driverTipCents: number = 0,
): number {
  void baseWashoutAmountCents;
  return Math.max(0, Math.round(driverTipCents));
}

function normalizeOwnerBillingLedger(ledger: OwnerBillingLedger): OwnerBillingLedger {
  const billingBatchId = ledger.billingBatchId || ledger.batchId || "";
  const platformFeeCentsByWashout = ledger.platformFeeCentsByWashout || ledger.platformFeeCentsPerWashout || [];
  const driverTipCentsByWashout = ledger.driverTipCentsByWashout || ledger.driverTipCentsPerWashout || [];
  const ownerChargeAmountCents = ledger.ownerChargeAmountCents ?? ledger.stripeChargeAmountCents ?? 0;

  return {
    ...ledger,
    billingBatchId,
    batchId: billingBatchId,
    platformFeeCentsByWashout,
    platformFeeCentsPerWashout: platformFeeCentsByWashout,
    driverTipCentsByWashout,
    driverTipCentsPerWashout: driverTipCentsByWashout,
    ownerChargeAmountCents,
    stripeChargeAmountCents: ownerChargeAmountCents,
    platformRevenueCents: ledger.platformRevenueCents ?? ledger.platformFeeTotalCents,
    reconciliationStatus: ledger.reconciliationStatus ?? "pending",
  };
}

export function calculateOwnerWashoutBillingLedger(ledger: OwnerBillingLedger): OwnerBillingLedger {
  const normalized = validateOwnerBillingAmount(ledger);
  return {
    ...normalized,
    reconciliationStatus: "balanced",
  };
}

export function buildOwnerBillingLedger(ledger: OwnerBillingLedger): OwnerBillingLedger {
  return calculateOwnerWashoutBillingLedger(ledger);
}

export function validateOwnerBillingAmount(batch: OwnerBillingLedger): OwnerBillingLedger {
  const normalized = normalizeOwnerBillingLedger(batch);
  const issues: string[] = [];
  const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
  const isIntegerCents = (value: unknown) => typeof value === "number" && Number.isInteger(value) && value >= 0;

  if (!normalized.ownerId) {
    issues.push("ownerId missing");
  }
  if (!normalized.billingBatchId) {
    issues.push("billingBatchId missing");
  }
  if (!Number.isInteger(normalized.approvedWashoutCount) || normalized.approvedWashoutCount < 0) {
    issues.push("approvedWashoutCount must be a non-negative integer");
  }
  if (!Array.isArray(normalized.washoutActivityIds) || normalized.washoutActivityIds.length !== normalized.approvedWashoutCount) {
    issues.push("washoutActivityIds must match approvedWashoutCount");
  }
  if (!Array.isArray(normalized.platformFeeCentsByWashout) || normalized.platformFeeCentsByWashout.length !== normalized.approvedWashoutCount) {
    issues.push("platformFeeCentsByWashout must match approvedWashoutCount");
  }
  if (!Array.isArray(normalized.driverTipCentsByWashout) || normalized.driverTipCentsByWashout.length !== normalized.approvedWashoutCount) {
    issues.push("driverTipCentsByWashout must match approvedWashoutCount");
  }
  if (!normalized.platformFeeCentsByWashout.every(isIntegerCents)) {
    issues.push("platform fees must be integer cents");
  }
  if (!normalized.driverTipCentsByWashout.every(isIntegerCents)) {
    issues.push("driver tips must be integer cents");
  }
  if (!isIntegerCents(normalized.platformFeeTotalCents)) {
    issues.push("platformFeeTotalCents must be integer cents");
  }
  if (!isIntegerCents(normalized.driverTipTotalCents)) {
    issues.push("driverTipTotalCents must be integer cents");
  }
  if (!isIntegerCents(normalized.ownerChargeAmountCents)) {
    issues.push("ownerChargeAmountCents must be integer cents");
  }

  const platformFeeTotalCents = sum(normalized.platformFeeCentsByWashout);
  const driverTipTotalCents = sum(normalized.driverTipCentsByWashout);
  const driverTipByDriverTotalCents = sum(Object.values(normalized.driverTipCentsByDriver || {}));
  const driverTransferTotalCents = sum((normalized.driverTransfers || []).map((transfer) => transfer.amountCents));

  if (normalized.platformFeeTotalCents !== platformFeeTotalCents) {
    issues.push("platformFeeTotalCents does not equal the per-washout platform fee sum");
  }
  if (normalized.platformRevenueCents !== platformFeeTotalCents) {
    issues.push("platformRevenueCents must equal platformFeeTotalCents");
  }
  if (normalized.driverTipTotalCents !== driverTipTotalCents) {
    issues.push("driverTipTotalCents does not equal the per-washout driver tip sum");
  }
  if (normalized.driverTipTotalCents !== driverTipByDriverTotalCents) {
    issues.push("driverTipCentsByDriver must sum to driverTipTotalCents");
  }
  if (driverTransferTotalCents !== driverTipTotalCents) {
    issues.push("sum(driverTransfers.amountCents) must equal driverTipTotalCents");
  }
  if (normalized.ownerChargeAmountCents !== platformFeeTotalCents + driverTipTotalCents) {
    issues.push("ownerChargeAmountCents must equal platformFeeTotalCents plus driverTipTotalCents");
  }
  if (normalized.approvedWashoutCount === 3 && normalized.platformFeeCentsByWashout.every((fee) => fee === 500) && normalized.platformFeeTotalCents !== 1500) {
    issues.push("3 washouts at 500 cents must total 1500 cents");
  }
  if (normalized.platformFeeCentsByWashout.some((fee) => fee > 5000) && !normalized.allowAdminOverride) {
    issues.push("platform fee per washout exceeds 5000 cents");
  }
  if (normalized.immediateBilling && normalized.ownerChargeAmountCents > 10000) {
    issues.push("immediate owner washout billing cannot exceed 10000 cents");
  }

  if (issues.length > 0) {
    const error = new Error(`Invalid owner billing amount: ${issues.join("; ")}`);
    (error as Error & { code?: string }).code = "invalid_owner_billing_amount";
    throw error;
  }

  return normalized;
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
