import { randomUUID } from "crypto";
import { and, desc, eq, isNull, sql } from "drizzle-orm";

import { resolveFinancialExecutionAccess } from "./financialExecutionPolicy";
import { billingBatches, canonicalFinancialPaymentAttempts, financialBatchAuditEvents, owners } from "../shared/schema";
import { db } from "./db";

export type CanonicalExecutionBatch = { id: string; reference: string; state: "draft" | "ready_for_review" | "approved" | "processing" | "paid" | "failed" | "cancelled"; ownerId: string; currency: string; frozenFacilityChargeCents: number; historical: boolean };
export type CanonicalExecutionOwner = { id: string; stripeCustomerId: string | null; stripePaymentMethodId: string | null };
export type CanonicalPaymentAttempt = { id: string; batchId: string; attemptNumber: number; idempotencyKey: string; amountCents: number; currency: string; status: "created" | "processing" | "succeeded" | "failed" | "cancelled"; providerObjectId?: string | null };
export type CanonicalExecutionProvider = { createPaymentIntent(input: { amount: number; currency: string; customer: string; paymentMethod: string; idempotencyKey: string; metadata: Record<string, string> }): Promise<{ id: string }> };
export type CanonicalExecutionReservation = { batch: CanonicalExecutionBatch; owner: CanonicalExecutionOwner; attempt: CanonicalPaymentAttempt };
export type CanonicalExecutionRepository = {
  reserve(input: { batchId: string; actorId: string; reason: string; mode: "stripe_test" | "stripe_live"; retry: boolean }): Promise<CanonicalExecutionReservation>;
  attachProviderResult(input: { attemptId: string; batchId: string; providerId: string; actorId: string; reason: string }): Promise<boolean>;
  recordProviderFailure(input: { attemptId: string; batchId: string; actorId: string; reason: string; errorCode: string; errorMessage: string }): Promise<void>;
};

export class CanonicalBatchExecutionError extends Error { constructor(readonly code: string, message: string) { super(message); } }

function stripeExecutionAllowed(environment: NodeJS.ProcessEnv): boolean {
  const key = environment.STRIPE_SECRET_KEY?.trim() || "";
  if (environment.NODE_ENV === "test") return key.startsWith("sk_test_");
  return environment.NODE_ENV === "production" && key.startsWith("sk_live_") && environment.FINANCIAL_EXECUTION_PRODUCTION_ENABLED?.trim().toLowerCase() === "true";
}

export function canonicalBatchExecutionAccess(environment: NodeJS.ProcessEnv = process.env) {
  const access = resolveFinancialExecutionAccess("facility_collection", environment as Parameters<typeof resolveFinancialExecutionAccess>[1]);
  return { allowed: access.allowed && stripeExecutionAllowed(environment), reason: !access.allowed ? access.reason : stripeExecutionAllowed(environment) ? null : "stripe_mode_or_production_gate_disabled" };
}
export function canonicalBatchExecutionIdempotencyKey(batch: Pick<CanonicalExecutionBatch, "id" | "reference">, attemptNumber = 1) { return `cretexchange:canonical-batch:${batch.id}:${batch.reference}:attempt:${attemptNumber}`; }
function executionMode(environment: NodeJS.ProcessEnv): "stripe_test" | "stripe_live" { return environment.NODE_ENV === "test" ? "stripe_test" : "stripe_live"; }
function safeProviderError(error: unknown) { const value = error as { code?: unknown; message?: unknown }; return { code: typeof value?.code === "string" ? value.code.slice(0, 100) : "provider_request_failed", message: typeof value?.message === "string" ? value.message.replace(/[\r\n]/g, " ").slice(0, 500) : "Provider request failed." }; }

export async function executeApprovedCanonicalBatch(input: { batchId: string; actorId: string; reason: string; provider: CanonicalExecutionProvider; repository: CanonicalExecutionRepository; environment?: NodeJS.ProcessEnv; retry?: boolean }) {
  const environment = input.environment || process.env;
  if (!canonicalBatchExecutionAccess(environment).allowed) throw new CanonicalBatchExecutionError("FINANCIAL_EXECUTION_DISABLED", "Financial execution is currently disabled.");
  const reason = input.reason.trim();
  if (!reason || reason.length > 500) throw new CanonicalBatchExecutionError("FINANCIAL_BATCH_INVALID_REQUEST", "A valid execution reason is required.");
  const reservation = await input.repository.reserve({ batchId: input.batchId, actorId: input.actorId, reason, mode: executionMode(environment), retry: input.retry === true });
  try {
    const result = await input.provider.createPaymentIntent({ amount: reservation.attempt.amountCents, currency: reservation.attempt.currency, customer: reservation.owner.stripeCustomerId!, paymentMethod: reservation.owner.stripePaymentMethodId!, idempotencyKey: reservation.attempt.idempotencyKey, metadata: { canonicalBatchId: reservation.batch.id, canonicalBatchReference: reservation.batch.reference, executionAttemptId: reservation.attempt.id } });
    if (!result.id) throw new CanonicalBatchExecutionError("FINANCIAL_PROVIDER_RESPONSE_INVALID", "The payment provider did not return an execution reference.");
    if (!await input.repository.attachProviderResult({ attemptId: reservation.attempt.id, batchId: reservation.batch.id, providerId: result.id, actorId: input.actorId, reason })) throw new CanonicalBatchExecutionError("FINANCIAL_BATCH_EXECUTION_CONFLICT", "The execution attempt could not be recorded safely.");
    return { batchId: reservation.batch.id, providerId: result.id, attemptId: reservation.attempt.id, status: "processing" as const };
  } catch (error) {
    if (error instanceof CanonicalBatchExecutionError && error.code === "FINANCIAL_PROVIDER_RESPONSE_INVALID") throw error;
    const safe = safeProviderError(error);
    await input.repository.recordProviderFailure({ attemptId: reservation.attempt.id, batchId: reservation.batch.id, actorId: input.actorId, reason, errorCode: safe.code, errorMessage: safe.message });
    throw new CanonicalBatchExecutionError("FINANCIAL_PROVIDER_REQUEST_FAILED", "The provider did not accept the batch execution request.");
  }
}

function assertReservable(batch: CanonicalExecutionBatch, owner: CanonicalExecutionOwner | null, retry: boolean) {
  if (batch.state === "paid" || batch.state === "processing") throw new CanonicalBatchExecutionError("FINANCIAL_BATCH_ALREADY_EXECUTED", "This batch already has an execution attempt.");
  if ((!retry && batch.state !== "approved") || (retry && batch.state !== "failed")) throw new CanonicalBatchExecutionError(retry ? "FINANCIAL_BATCH_NOT_RETRYABLE" : "FINANCIAL_BATCH_NOT_APPROVED", retry ? "Only a failed canonical financial batch can retry." : "Only an approved canonical financial batch can execute.");
  if (batch.historical) throw new CanonicalBatchExecutionError("FINANCIAL_BATCH_HISTORICAL", "Historical records cannot be executed.");
  if (!Number.isSafeInteger(batch.frozenFacilityChargeCents) || batch.frozenFacilityChargeCents <= 0) throw new CanonicalBatchExecutionError("FINANCIAL_BATCH_INVALID_AMOUNT", "The approved batch has no valid executable amount.");
  if (batch.currency.toLowerCase() !== "usd") throw new CanonicalBatchExecutionError("FINANCIAL_BATCH_INVALID_CURRENCY", "Only USD canonical batches are supported.");
  if (!owner?.stripeCustomerId || !owner.stripePaymentMethodId) throw new CanonicalBatchExecutionError("FINANCIAL_OWNER_PAYMENT_METHOD_UNAVAILABLE", "The facility does not have a ready payment method.");
}

export function createDatabaseCanonicalBatchExecutionRepository(): CanonicalExecutionRepository {
  return {
    async reserve(input) { return db.transaction(async (tx: any) => {
      const [row] = await tx.select().from(billingBatches).where(eq(billingBatches.id, input.batchId)).limit(1);
      if (!row || row.batchModelVersion !== "canonical_financial_batch_v1") throw new CanonicalBatchExecutionError("FINANCIAL_BATCH_NOT_FOUND", "Canonical financial batch not found.");
      const batch: CanonicalExecutionBatch = { id: row.id, reference: row.canonicalReference || row.id, state: row.canonicalState as CanonicalExecutionBatch["state"], ownerId: row.ownerId, currency: "usd", frozenFacilityChargeCents: row.frozenFacilityChargeCents ?? 0, historical: false };
      const [owner] = await tx.select({ id: owners.id, stripeCustomerId: owners.stripeCustomerId, stripePaymentMethodId: owners.stripePaymentMethodId }).from(owners).where(eq(owners.id, row.ownerId)).limit(1);
      assertReservable(batch, owner || null, input.retry);
      const [latest] = await tx.select({ attemptNumber: canonicalFinancialPaymentAttempts.attemptNumber }).from(canonicalFinancialPaymentAttempts).where(eq(canonicalFinancialPaymentAttempts.batchId, batch.id)).orderBy(desc(canonicalFinancialPaymentAttempts.attemptNumber)).limit(1);
      const attemptNumber = (latest?.attemptNumber || 0) + 1;
      const attempt: CanonicalPaymentAttempt = { id: randomUUID(), batchId: batch.id, attemptNumber, idempotencyKey: canonicalBatchExecutionIdempotencyKey(batch, attemptNumber), amountCents: batch.frozenFacilityChargeCents, currency: "usd", status: "created" };
      await tx.insert(canonicalFinancialPaymentAttempts).values({ ...attempt, executionMode: input.mode, providerCustomerId: owner!.stripeCustomerId, initiatedBy: input.actorId, reason: input.reason });
      const claimed = await tx.update(billingBatches).set({ canonicalState: "processing", status: "processing", processingStartedAt: new Date(), failureReason: null, updatedAt: new Date(), metadata: { canonicalExecutionAttemptId: attempt.id, canonicalExecutionMode: input.mode } }).where(and(eq(billingBatches.id, batch.id), eq(billingBatches.batchModelVersion, "canonical_financial_batch_v1"), eq(billingBatches.canonicalState, input.retry ? "failed" : "approved"), isNull(billingBatches.stripePaymentIntentId))).returning({ id: billingBatches.id });
      if (claimed.length !== 1) throw new CanonicalBatchExecutionError("FINANCIAL_BATCH_EXECUTION_CONFLICT", "The batch changed while execution was being reserved.");
      await tx.insert(financialBatchAuditEvents).values({ batchId: batch.id, eventType: input.retry ? "provider_execution_retried" : "provider_execution_reserved", actorId: input.actorId, actorRole: "admin", reason: input.reason, priorState: input.retry ? "failed" : "approved", newState: "processing", revision: row.revision || 1, obligationCount: row.paymentCount, frozenDriverIncentiveCents: row.frozenDriverIncentiveCents || 0, frozenPlatformFeeCents: row.frozenPlatformFeeCents || 0, frozenFacilityChargeCents: row.frozenFacilityChargeCents || 0, safeMetadata: { executionAttemptId: attempt.id, mode: input.mode } });
      return { batch, owner: owner!, attempt };
    }); },
    async attachProviderResult(input) { return db.transaction(async (tx: any) => {
      const attempts = await tx.update(canonicalFinancialPaymentAttempts).set({ providerObjectId: input.providerId, status: "processing", processingAt: new Date() }).where(and(eq(canonicalFinancialPaymentAttempts.id, input.attemptId), eq(canonicalFinancialPaymentAttempts.batchId, input.batchId), eq(canonicalFinancialPaymentAttempts.status, "created"))).returning({ id: canonicalFinancialPaymentAttempts.id });
      if (attempts.length !== 1) return false;
      const rows = await tx.update(billingBatches).set({ stripePaymentIntentId: input.providerId, updatedAt: new Date() }).where(and(eq(billingBatches.id, input.batchId), eq(billingBatches.canonicalState, "processing"), isNull(billingBatches.stripePaymentIntentId))).returning({ id: billingBatches.id });
      if (rows.length !== 1) throw new CanonicalBatchExecutionError("FINANCIAL_BATCH_EXECUTION_CONFLICT", "The batch changed while provider evidence was being stored.");
      return true;
    }); },
    async recordProviderFailure(input) { await db.transaction(async (tx: any) => {
      await tx.update(canonicalFinancialPaymentAttempts).set({ status: "failed", failedAt: new Date(), providerErrorCode: input.errorCode, providerErrorMessage: input.errorMessage }).where(and(eq(canonicalFinancialPaymentAttempts.id, input.attemptId), eq(canonicalFinancialPaymentAttempts.status, "created")));
      await tx.update(billingBatches).set({ canonicalState: "failed", status: "failed", failureReason: input.errorCode, updatedAt: new Date() }).where(and(eq(billingBatches.id, input.batchId), eq(billingBatches.canonicalState, "processing"), isNull(billingBatches.stripePaymentIntentId)));
    }); },
  };
}

/** Safe administrative projection: it intentionally omits provider payloads,
 * payment methods, customer identifiers, and idempotency keys. */
export async function listCanonicalBatchPaymentAttempts(batchId: string) {
  const rows = await db.select({
    id: canonicalFinancialPaymentAttempts.id,
    attemptNumber: canonicalFinancialPaymentAttempts.attemptNumber,
    amountCents: canonicalFinancialPaymentAttempts.amountCents,
    currency: canonicalFinancialPaymentAttempts.currency,
    executionMode: canonicalFinancialPaymentAttempts.executionMode,
    status: canonicalFinancialPaymentAttempts.status,
    providerErrorCode: canonicalFinancialPaymentAttempts.providerErrorCode,
    providerErrorMessage: canonicalFinancialPaymentAttempts.providerErrorMessage,
    createdAt: canonicalFinancialPaymentAttempts.createdAt,
    processingAt: canonicalFinancialPaymentAttempts.processingAt,
    succeededAt: canonicalFinancialPaymentAttempts.succeededAt,
    failedAt: canonicalFinancialPaymentAttempts.failedAt,
  }).from(canonicalFinancialPaymentAttempts).where(eq(canonicalFinancialPaymentAttempts.batchId, batchId)).orderBy(desc(canonicalFinancialPaymentAttempts.attemptNumber));
  return rows;
}
