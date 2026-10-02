import { z } from "zod";

export const unitEconomicsMonthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
export const unitEconomicsCostInputSchema = z.object({
  month: unitEconomicsMonthSchema,
  provider: z.string().trim().min(1).max(80),
  category: z.enum(["hosting", "database", "email", "domain_dns", "evidence_storage", "payments", "other"]),
  amountCents: z.number().int().min(0).max(100_000_000),
  notes: z.string().trim().max(500).optional().default(""),
  sourceUrl: z.string().trim().url().max(500).or(z.literal("")).optional().default(""),
});
export const unitEconomicsAssumptionInputSchema = z.object({
  month: unitEconomicsMonthSchema,
  feePerValidatedLoadCents: z.number().int().min(0).max(100_000),
  paymentProcessingPercent: z.number().min(0).max(100),
  paymentProcessingFixedCents: z.number().int().min(0).max(10_000),
  evidenceStorageProvider: z.string().trim().min(1).max(80),
  evidenceStorageNotes: z.string().trim().max(500).optional().default(""),
});

export type UnitEconomicsCostInput = z.infer<typeof unitEconomicsCostInputSchema>;
export type UnitEconomicsAssumptionInput = z.infer<typeof unitEconomicsAssumptionInputSchema>;

export type UnitEconomicsCostStatus = "confirmed" | "estimated" | "usage_based" | "unconfirmed" | "free";
export type UnitEconomicsBillingCadence = "monthly" | "annual" | "per_transaction" | "per_unit";
export type UnitEconomicsCostModel = "fixed" | "variable";

export type UnitEconomicsProviderBaseline = {
  provider: string;
  category: UnitEconomicsCostInput["category"];
  amountCents: number;
  status: UnitEconomicsCostStatus;
  billingCadence: UnitEconomicsBillingCadence;
  costModel: UnitEconomicsCostModel;
  notes: string;
  sourceUrl: string;
  includedInCalculation: boolean;
  separatelyCalculated?: boolean;
};

// This is the governed provider register. Monthly database entries override these
// estimates; missing invoices stay visible instead of silently becoming $0.
export const unitEconomicsProviderBaseline: UnitEconomicsProviderBaseline[] = [
  { provider: "Railway application hosting", category: "hosting", amountCents: 2_000, status: "estimated", billingCadence: "monthly", costModel: "fixed", notes: "Railway Pro $20 minimum monthly usage, including $20 of usage credits. Replace with the actual invoice.", sourceUrl: "https://railway.com/pricing", includedInCalculation: true },
  { provider: "Railway Object Storage", category: "evidence_storage", amountCents: 150, status: "estimated", billingCadence: "per_unit", costModel: "variable", notes: "100 GB-month at $0.015 per GB-month for active evidence storage (orderly-duffel). Replace with measured storage usage.", sourceUrl: "https://docs.railway.com/storage-buckets/billing", includedInCalculation: true },
  { provider: "Neon PostgreSQL", category: "database", amountCents: 1_095, status: "estimated", billingCadence: "per_unit", costModel: "variable", notes: "Neon Launch: 100 active CU-hours at $0.106 plus 1 GB storage at $0.35. Replace with actual usage.", sourceUrl: "https://neon.com/pricing", includedInCalculation: true },
  { provider: "Vercel", category: "hosting", amountCents: 2_000, status: "estimated", billingCadence: "monthly", costModel: "fixed", notes: "One Vercel Pro deploying seat including usage credit. Replace with the actual invoice.", sourceUrl: "https://vercel.com/pricing", includedInCalculation: true },
  { provider: "Squarespace email", category: "email", amountCents: 840, status: "estimated", billingCadence: "monthly", costModel: "fixed", notes: "One Google Workspace Starter user billed monthly through Squarespace; recorded invoices override.", sourceUrl: "https://support.squarespace.com/hc/en-us/articles/205812258-Google-Workspace-pricing-billing-and-invoices", includedInCalculation: true },
  { provider: "Squarespace domains", category: "domain_dns", amountCents: 333, status: "estimated", billingCadence: "annual", costModel: "fixed", notes: "$40 annual domain-renewal allowance normalized monthly; replace with the actual TLD renewal invoice.", sourceUrl: "https://support.squarespace.com/hc/en-us/articles/218193418-Squarespace-domain-renewals", includedInCalculation: true },
  { provider: "Cloudflare DNS and proxy", category: "domain_dns", amountCents: 0, status: "free", billingCadence: "monthly", costModel: "fixed", notes: "Free today; retain monitoring for future plan or usage charges.", sourceUrl: "https://www.cloudflare.com/plans/free/", includedInCalculation: true },
  { provider: "Cloudflare Workers", category: "hosting", amountCents: 0, status: "free", billingCadence: "monthly", costModel: "variable", notes: "Inactive/disconnected; retain for future usage charges if re-enabled.", sourceUrl: "https://workers.cloudflare.com/pricing", includedInCalculation: true },
  { provider: "Stripe payment processing", category: "payments", amountCents: 0, status: "usage_based", billingCadence: "per_transaction", costModel: "variable", notes: "Separately calculated at 2.9% plus $0.30 per transaction; this $0 fixed baseline is not double-counted.", sourceUrl: "https://stripe.com/pricing", includedInCalculation: true, separatelyCalculated: true },
  { provider: "Google Maps Platform", category: "other", amountCents: 0, status: "estimated", billingCadence: "per_unit", costModel: "variable", notes: "Applicable Essentials SKUs assumed within 10,000-event monthly free-use caps; replace with billed usage when applicable.", sourceUrl: "https://developers.google.com/maps/billing-and-pricing/pricing", includedInCalculation: true },
  { provider: "Platform notifications", category: "email", amountCents: 2_000, status: "estimated", billingCadence: "monthly", costModel: "fixed", notes: "Planning assumption for an entry production transactional-email service; replace after the active CreteXchange provider and invoice are confirmed.", sourceUrl: "https://resend.com/pricing", includedInCalculation: true },
];

export type UnitEconomicsRecordedCost = {
  id?: string | null;
  provider: string;
  category?: UnitEconomicsCostInput["category"];
  amountCents: number;
  notes?: string | null;
  sourceUrl?: string | null;
};

export type UnitEconomicsProviderCost = UnitEconomicsProviderBaseline & {
  id: string | null;
  isRecorded: boolean;
};

function recordedStatus(row: UnitEconomicsRecordedCost): UnitEconomicsCostStatus {
  const notes = String(row.notes || "").toLowerCase();
  if (row.amountCents === 0 && notes.includes("free")) return "free";
  if (notes.includes("estimate") || notes.includes("estimated") || notes.includes("pending invoice")) return "estimated";
  return "confirmed";
}

export function buildUnitEconomicsProviderRegister(recordedCosts: UnitEconomicsRecordedCost[]): UnitEconomicsProviderCost[] {
  const providerKey = (provider: string) => provider.trim().toLowerCase();
  const recordedByProvider = new Map(recordedCosts.map((row) => [providerKey(row.provider), row]));
  const baselineKeys = new Set(unitEconomicsProviderBaseline.map((entry) => providerKey(entry.provider)));
  const baseline = unitEconomicsProviderBaseline.map((entry) => {
    const recorded = recordedByProvider.get(providerKey(entry.provider));
    if (!recorded) return { id: null, ...entry, isRecorded: false };
    return {
      ...entry,
      ...recorded,
      id: recorded.id ?? null,
      category: recorded.category ?? entry.category,
      amountCents: recorded.amountCents,
      status: recordedStatus(recorded),
      notes: recorded.notes ?? "",
      sourceUrl: recorded.sourceUrl ?? "",
      isRecorded: true,
      includedInCalculation: true,
    };
  });
  const custom = recordedCosts.filter((row) => !baselineKeys.has(providerKey(row.provider))).map((row) => ({
    id: row.id ?? null,
    provider: row.provider,
    category: row.category ?? "other",
    amountCents: row.amountCents,
    notes: row.notes ?? "",
    sourceUrl: row.sourceUrl ?? "",
    status: recordedStatus(row),
    billingCadence: "monthly" as const,
    costModel: "fixed" as const,
    isRecorded: true,
    includedInCalculation: true,
  }));
  return [...baseline, ...custom];
}

export function calculateUnitEconomicsModeledMonthlyCosts(costs: UnitEconomicsProviderCost[]): number {
  return costs.reduce((total, cost) => total +
    (cost.includedInCalculation && !cost.separatelyCalculated ? cost.amountCents : 0), 0);
}

export function calculateUnitEconomicsMonth(input: {
  month: string; validatedLoads: number; feePerValidatedLoadCents: number;
  paymentProcessingPercent: number; paymentProcessingFixedCents: number; fixedCostsCents: number;
}) {
  const processingPerLoadCents = Math.round(input.feePerValidatedLoadCents * input.paymentProcessingPercent / 100) + input.paymentProcessingFixedCents;
  const grossRevenueCents = input.validatedLoads * input.feePerValidatedLoadCents;
  const variableCostsCents = input.validatedLoads * processingPerLoadCents;
  const contributionProfitCents = grossRevenueCents - variableCostsCents - input.fixedCostsCents;
  const contributionPerLoadCents = input.feePerValidatedLoadCents - processingPerLoadCents;
  return { ...input, processingPerLoadCents, grossRevenueCents, variableCostsCents, contributionProfitCents,
    contributionMarginPercent: grossRevenueCents ? contributionProfitCents / grossRevenueCents * 100 : 0,
    breakEvenLoads: contributionPerLoadCents > 0 ? Math.ceil(input.fixedCostsCents / contributionPerLoadCents) : null,
    profitPerValidatedLoadCents: input.validatedLoads ? Math.round(contributionProfitCents / input.validatedLoads) : null,
    isFiveDollarFeeProfitable: contributionProfitCents >= 0 };
}
