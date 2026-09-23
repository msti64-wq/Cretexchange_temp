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
  status: UnitEconomicsCostStatus;
  billingCadence: UnitEconomicsBillingCadence;
  costModel: UnitEconomicsCostModel;
  notes: string;
  sourceUrl: string;
  includedInCalculation: boolean;
};

// This is the governed provider register. Monthly database entries override these
// placeholders; missing invoices stay visible instead of silently becoming $0.
export const unitEconomicsProviderBaseline: UnitEconomicsProviderBaseline[] = [
  { provider: "Railway application hosting", category: "hosting", status: "unconfirmed", billingCadence: "monthly", costModel: "fixed", notes: "Production application hosting; enter the monthly Railway invoice.", sourceUrl: "https://railway.com", includedInCalculation: false },
  { provider: "Railway Object Storage", category: "evidence_storage", status: "usage_based", billingCadence: "per_unit", costModel: "variable", notes: "Active S3-compatible evidence storage (orderly-duffel); enter monthly storage and operations charges.", sourceUrl: "https://railway.com", includedInCalculation: false },
  { provider: "Neon PostgreSQL", category: "database", status: "unconfirmed", billingCadence: "monthly", costModel: "fixed", notes: "Production database; enter the current Neon plan or invoice.", sourceUrl: "https://neon.tech", includedInCalculation: false },
  { provider: "Vercel", category: "hosting", status: "unconfirmed", billingCadence: "monthly", costModel: "fixed", notes: "Web deployment account; confirm whether CreteXchange incurs a paid monthly charge.", sourceUrl: "https://vercel.com", includedInCalculation: false },
  { provider: "Squarespace email", category: "email", status: "estimated", billingCadence: "monthly", costModel: "fixed", notes: "Email service estimate pending invoice confirmation.", sourceUrl: "https://squarespace.com", includedInCalculation: false },
  { provider: "Squarespace domains", category: "domain_dns", status: "unconfirmed", billingCadence: "annual", costModel: "fixed", notes: "Domain registration is billed annually; enter the invoice normalized to the reporting month.", sourceUrl: "https://squarespace.com", includedInCalculation: false },
  { provider: "Cloudflare DNS and proxy", category: "domain_dns", status: "free", billingCadence: "monthly", costModel: "fixed", notes: "Free today; retain for future plan or request-volume charges.", sourceUrl: "https://cloudflare.com", includedInCalculation: true },
  { provider: "Cloudflare Workers", category: "hosting", status: "free", billingCadence: "monthly", costModel: "variable", notes: "Inactive/disconnected and free today; retain for future usage charges if re-enabled.", sourceUrl: "https://cloudflare.com", includedInCalculation: true },
  { provider: "Stripe payment processing", category: "payments", status: "usage_based", billingCadence: "per_transaction", costModel: "variable", notes: "Calculated from the processing percentage and fixed-fee assumptions above.", sourceUrl: "https://stripe.com", includedInCalculation: true },
  { provider: "Google Maps Platform", category: "other", status: "usage_based", billingCadence: "per_unit", costModel: "variable", notes: "Map and geocoding usage; enter the monthly invoice or confirmed free-tier result.", sourceUrl: "https://mapsplatform.google.com", includedInCalculation: false },
  { provider: "Platform notifications", category: "email", status: "unconfirmed", billingCadence: "per_unit", costModel: "variable", notes: "Confirm the active email/SMS notification provider and monthly usage cost.", sourceUrl: "", includedInCalculation: false },
];

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
