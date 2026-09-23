import assert from "node:assert/strict";
import test from "node:test";
import { calculateUnitEconomicsMonth, unitEconomicsCostInputSchema, unitEconomicsMonthSchema } from "../shared/unitEconomics";

test("calculates profitable and break-even monthly unit economics", () => {
  const result = calculateUnitEconomicsMonth({ month: "2026-09", validatedLoads: 100, feePerValidatedLoadCents: 500, paymentProcessingPercent: 2.9, paymentProcessingFixedCents: 30, fixedCostsCents: 10_000 });
  assert.equal(result.processingPerLoadCents, 45);
  assert.equal(result.grossRevenueCents, 50_000);
  assert.equal(result.contributionProfitCents, 35_500);
  assert.equal(result.breakEvenLoads, 22);
  assert.equal(result.isFiveDollarFeeProfitable, true);
});

test("handles a month with no validated loads without division by zero", () => {
  const result = calculateUnitEconomicsMonth({ month: "2026-09", validatedLoads: 0, feePerValidatedLoadCents: 500, paymentProcessingPercent: 2.9, paymentProcessingFixedCents: 30, fixedCostsCents: 1_000 });
  assert.equal(result.profitPerValidatedLoadCents, null);
  assert.equal(result.contributionProfitCents, -1_000);
});

test("validates month and provider cost inputs", () => {
  assert.equal(unitEconomicsMonthSchema.safeParse("2026-09").success, true);
  assert.equal(unitEconomicsMonthSchema.safeParse("09-2026").success, false);
  assert.equal(unitEconomicsCostInputSchema.safeParse({ month: "2026-09", provider: "Squarespace", category: "domain_dns", amountCents: 2000 }).success, true);
  assert.equal(unitEconomicsCostInputSchema.safeParse({ month: "2026-09", provider: "Squarespace", category: "domain_dns", amountCents: -1 }).success, false);
});
