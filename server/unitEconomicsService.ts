import { sql } from "drizzle-orm";
import { db } from "./db";
import type { UnitEconomicsAssumptionInput, UnitEconomicsCostInput } from "../shared/unitEconomics";
import { calculateUnitEconomicsMonth } from "../shared/unitEconomics";

type Row = Record<string, unknown>;
function rows(result: unknown): Row[] { return ((result as { rows?: Row[] })?.rows || []) as Row[]; }
function monthDate(month: string) { return `${month}-01`; }
function n(value: unknown) { return Number(value || 0); }

export async function getUnitEconomics(month: string) {
  const capability = rows(await db.execute(sql`SELECT to_regclass('public.unit_economics_monthly_costs') IS NOT NULL AS ready`))[0];
  if (!capability?.ready) return { foundationReady: false, month, migrationRequired: "0043", costs: [] };
  const assumptions = rows(await db.execute(sql`
    SELECT fee_per_validated_load_cents, payment_processing_percent, payment_processing_fixed_cents,
           evidence_storage_provider, evidence_storage_notes
      FROM unit_economics_monthly_assumptions WHERE month=${monthDate(month)}::date`))[0] || {};
  const costs = rows(await db.execute(sql`
    SELECT id, provider, category, amount_cents AS "amountCents", notes, source_url AS "sourceUrl"
      FROM unit_economics_monthly_costs WHERE month=${monthDate(month)}::date ORDER BY provider, category`));
  const loadRow = rows(await db.execute(sql`
    SELECT count(*)::int AS count FROM washout_activities
     WHERE status='verified' AND coalesce(verified_at, check_in_time) >= ${monthDate(month)}::date
       AND coalesce(verified_at, check_in_time) < (${monthDate(month)}::date + interval '1 month')`))[0];
  const fee = n(assumptions.fee_per_validated_load_cents) || 500;
  const percent = assumptions.payment_processing_percent == null ? 2.9 : n(assumptions.payment_processing_percent);
  const fixed = assumptions.payment_processing_fixed_cents == null ? 30 : n(assumptions.payment_processing_fixed_cents);
  const fixedCostsCents = costs.reduce((sum, row) => sum + n(row.amountCents), 0);
  return {
    foundationReady: true, month, costs,
    assumptions: { feePerValidatedLoadCents: fee, paymentProcessingPercent: percent, paymentProcessingFixedCents: fixed,
      evidenceStorageProvider: String(assumptions.evidence_storage_provider || "Unconfirmed"),
      evidenceStorageNotes: String(assumptions.evidence_storage_notes || "") },
    metrics: calculateUnitEconomicsMonth({ month, validatedLoads: n(loadRow?.count), feePerValidatedLoadCents: fee,
      paymentProcessingPercent: percent, paymentProcessingFixedCents: fixed, fixedCostsCents }),
  };
}

export async function saveUnitEconomicsAssumptions(input: UnitEconomicsAssumptionInput, userId: string) {
  await db.execute(sql`INSERT INTO unit_economics_monthly_assumptions
    (month, fee_per_validated_load_cents, payment_processing_percent, payment_processing_fixed_cents, evidence_storage_provider, evidence_storage_notes, updated_by_user_id)
    VALUES (${monthDate(input.month)}::date, ${input.feePerValidatedLoadCents}, ${input.paymentProcessingPercent}, ${input.paymentProcessingFixedCents}, ${input.evidenceStorageProvider}, ${input.evidenceStorageNotes}, ${userId})
    ON CONFLICT (month) DO UPDATE SET fee_per_validated_load_cents=excluded.fee_per_validated_load_cents,
      payment_processing_percent=excluded.payment_processing_percent, payment_processing_fixed_cents=excluded.payment_processing_fixed_cents,
      evidence_storage_provider=excluded.evidence_storage_provider, evidence_storage_notes=excluded.evidence_storage_notes,
      updated_by_user_id=excluded.updated_by_user_id, updated_at=now()`);
}

export async function addUnitEconomicsCost(input: UnitEconomicsCostInput, userId: string) {
  const result = await db.execute(sql`INSERT INTO unit_economics_monthly_costs
    (month, provider, category, amount_cents, notes, source_url, created_by_user_id)
    VALUES (${monthDate(input.month)}::date, ${input.provider}, ${input.category}, ${input.amountCents}, ${input.notes}, ${input.sourceUrl}, ${userId}) RETURNING id`);
  return rows(result)[0];
}

export async function deleteUnitEconomicsCost(id: string) {
  await db.execute(sql`DELETE FROM unit_economics_monthly_costs WHERE id=${id}::uuid`);
}
