import { and, eq, sql } from "drizzle-orm";
import { billingBatches, canonicalFinancialPaymentAttempts, financialBatchAuditEvents, financialBatchMemberships, payments } from "../shared/schema";
import { db } from "./db";

export type CanonicalPaymentIntentEvent = { type: "payment_intent.succeeded" | "payment_intent.payment_failed"; eventId: string; providerObjectId: string; amountCents: number; currency: string; metadata: Record<string, string | undefined>; errorCode?: string; errorMessage?: string };
export type CanonicalWebhookRepository = { finalize(event: CanonicalPaymentIntentEvent): Promise<"processed" | "idempotent" | "ignored" | "rejected"> };

function safeError(value: string | undefined, fallback: string) { return (value || fallback).replace(/[\r\n]/g, " ").slice(0, 500); }

export async function processCanonicalBatchPaymentIntentEvent(event: CanonicalPaymentIntentEvent, repository: CanonicalWebhookRepository = createDatabaseCanonicalWebhookRepository()) {
  const batchId = event.metadata.canonicalBatchId;
  const attemptId = event.metadata.executionAttemptId;
  if (!batchId || !attemptId) return "ignored" as const;
  return repository.finalize(event);
}

export function createDatabaseCanonicalWebhookRepository(): CanonicalWebhookRepository {
  return { async finalize(event) { return db.transaction(async (tx: any) => {
    const batchId = event.metadata.canonicalBatchId!;
    const attemptId = event.metadata.executionAttemptId!;
    const [attempt] = await tx.select().from(canonicalFinancialPaymentAttempts).where(and(eq(canonicalFinancialPaymentAttempts.id, attemptId), eq(canonicalFinancialPaymentAttempts.batchId, batchId), eq(canonicalFinancialPaymentAttempts.providerObjectId, event.providerObjectId))).limit(1);
    if (!attempt) return "ignored" as const;
    const [batch] = await tx.select().from(billingBatches).where(and(eq(billingBatches.id, batchId), eq(billingBatches.batchModelVersion, "canonical_financial_batch_v1"))).limit(1);
    if (!batch) return "ignored" as const;
    if (attempt.amountCents !== event.amountCents || attempt.currency !== event.currency.toLowerCase()) {
      await tx.insert(financialBatchAuditEvents).values({ batchId, eventType: "provider_execution_rejected", actorRole: "system", reason: "Provider amount or currency did not match the frozen canonical attempt.", priorState: batch.canonicalState, newState: batch.canonicalState || "processing", revision: batch.revision || 1, obligationCount: batch.paymentCount, frozenDriverIncentiveCents: batch.frozenDriverIncentiveCents || 0, frozenPlatformFeeCents: batch.frozenPlatformFeeCents || 0, frozenFacilityChargeCents: batch.frozenFacilityChargeCents || 0, safeMetadata: { eventId: event.eventId, rejection: "amount_or_currency_mismatch" } });
      return "rejected" as const;
    }
    if (event.type === "payment_intent.succeeded") {
      if (attempt.status === "succeeded" || batch.canonicalState === "paid") return "idempotent" as const;
      await tx.update(canonicalFinancialPaymentAttempts).set({ status: "succeeded", succeededAt: new Date(), providerErrorCode: null, providerErrorMessage: null }).where(and(eq(canonicalFinancialPaymentAttempts.id, attempt.id), eq(canonicalFinancialPaymentAttempts.status, "processing")));
      const updated = await tx.update(billingBatches).set({ canonicalState: "paid", status: "completed", completedAt: new Date(), updatedAt: new Date() }).where(and(eq(billingBatches.id, batchId), sql`${billingBatches.canonicalState} IN ('processing', 'failed')`)).returning({ id: billingBatches.id });
      if (!updated.length) return "idempotent" as const;
      await tx.update(payments).set({ status: "completed", paidAt: new Date(), updatedAt: new Date() }).where(sql`${payments.id} IN (SELECT payment_id FROM financial_batch_memberships WHERE batch_id = ${batchId} AND state = 'active')`);
      await tx.insert(financialBatchAuditEvents).values({ batchId, eventType: "provider_execution_succeeded", actorRole: "system", reason: "Provider success webhook confirmed the frozen canonical batch.", priorState: batch.canonicalState, newState: "paid", revision: batch.revision || 1, obligationCount: batch.paymentCount, frozenDriverIncentiveCents: batch.frozenDriverIncentiveCents || 0, frozenPlatformFeeCents: batch.frozenPlatformFeeCents || 0, frozenFacilityChargeCents: batch.frozenFacilityChargeCents || 0, safeMetadata: { eventId: event.eventId, executionAttemptId: attempt.id } });
      return "processed" as const;
    }
    if (attempt.status === "succeeded" || batch.canonicalState === "paid") return "idempotent" as const;
    await tx.update(canonicalFinancialPaymentAttempts).set({ status: "failed", failedAt: new Date(), providerErrorCode: safeError(event.errorCode, "provider_payment_failed"), providerErrorMessage: safeError(event.errorMessage, "The provider reported a payment failure.") }).where(and(eq(canonicalFinancialPaymentAttempts.id, attempt.id), sql`${canonicalFinancialPaymentAttempts.status} IN ('created', 'processing')`));
    await tx.update(billingBatches).set({ canonicalState: "failed", status: "failed", failureReason: safeError(event.errorCode, "provider_payment_failed"), updatedAt: new Date() }).where(and(eq(billingBatches.id, batchId), sql`${billingBatches.canonicalState} IN ('processing', 'failed')`));
    await tx.insert(financialBatchAuditEvents).values({ batchId, eventType: "provider_execution_failed", actorRole: "system", reason: "Provider failure webhook recorded without rebuilding the canonical batch.", priorState: batch.canonicalState, newState: "failed", revision: batch.revision || 1, obligationCount: batch.paymentCount, frozenDriverIncentiveCents: batch.frozenDriverIncentiveCents || 0, frozenPlatformFeeCents: batch.frozenPlatformFeeCents || 0, frozenFacilityChargeCents: batch.frozenFacilityChargeCents || 0, safeMetadata: { eventId: event.eventId, executionAttemptId: attempt.id } });
    return "processed" as const;
  }); } };
}
