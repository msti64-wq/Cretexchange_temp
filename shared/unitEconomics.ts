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
