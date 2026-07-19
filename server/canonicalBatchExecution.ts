import { randomUUID } from "crypto";
import { and, eq, isNull } from "drizzle-orm";

import { resolveFinancialExecutionAccess } from "./financialExecutionPolicy";
import { billingBatches, financialBatchAuditEvents, owners } from "../shared/schema";
import { db } from "./db";

export type CanonicalExecutionBatch = {
  id: string;
  reference: string;
  state: "draft" | "ready_for_review" | "approved" | "processing" | "paid" | "failed" | "cancelled";
  ownerId: string;
  currency: string;
  frozenFacilityChargeCents: number;
  executionProviderId?: string | null;
  historical: boolean;
};

export type CanonicalExecutionOwner = {
  id: string;
  stripeCustomerId: string | null;
  stripePaymentMethodId: string | null;
};

export type CanonicalExecutionProvider = {
  createPaymentIntent(input: {
    amount: number;
    currency: string;
    customer: string;
    paymentMethod: string;
    idempotencyKey: string;
    metadata: Record<string, string>;
  }): Promise<{ id: string }>;
};

export type CanonicalExecutionRepository = {
  transaction<T>(run: (tx: {
    findBatch(batchId: string): Promise<CanonicalExecutionBatch | null>;
    findOwner(ownerId: string): Promise<CanonicalExecutionOwner | null>;
    markProcessing(input: { batchId: string; providerId: string; attemptId: string; actorId: string; reason: string }): Promise<boolean>;
    appendAudit(input: { batchId: string; eventType: string; actorId: string; reason: string; priorState: string; newState: string; safeMetadata: Record<string, string> }): Promise<void>;
  }) => Promise<T>): Promise<T>;
};

export class CanonicalBatchExecutionError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
  }
}

function stripeExecutionAllowed(environment: NodeJS.ProcessEnv): boolean {
  const key = environment.STRIPE_SECRET_KEY?.trim() || "";
  if (environment.NODE_ENV === "test") return key.startsWith("sk_test_");
  return environment.NODE_ENV === "production"
    && key.startsWith("sk_live_")
    && environment.FINANCIAL_EXECUTION_PRODUCTION_ENABLED?.trim().toLowerCase() === "true";
}

export function canonicalBatchExecutionAccess(environment: NodeJS.ProcessEnv = process.env) {
  const access = resolveFinancialExecutionAccess("facility_collection", environment as Parameters<typeof resolveFinancialExecutionAccess>[1]);
  return {
    allowed: access.allowed && stripeExecutionAllowed(environment),
    reason: !access.allowed ? access.reason : stripeExecutionAllowed(environment) ? null : "stripe_mode_or_production_gate_disabled",
  };
}

export function canonicalBatchExecutionIdempotencyKey(batch: Pick<CanonicalExecutionBatch, "id" | "reference">) {
  return `cretexchange:canonical-batch:${batch.id}:${batch.reference}:v1`;
}

export async function executeApprovedCanonicalBatch(input: {
  batchId: string;
  actorId: string;
  reason: string;
  provider: CanonicalExecutionProvider;
  repository: CanonicalExecutionRepository;
  environment?: NodeJS.ProcessEnv;
}) {
  const environment = input.environment || process.env;
  const access = canonicalBatchExecutionAccess(environment);
  if (!access.allowed) throw new CanonicalBatchExecutionError("FINANCIAL_EXECUTION_DISABLED", "Financial execution is currently disabled.");
  if (!input.reason.trim() || input.reason.trim().length > 500) throw new CanonicalBatchExecutionError("FINANCIAL_BATCH_INVALID_REQUEST", "A valid execution reason is required.");

  return input.repository.transaction(async (tx) => {
    const batch = await tx.findBatch(input.batchId);
    if (!batch) throw new CanonicalBatchExecutionError("FINANCIAL_BATCH_NOT_FOUND", "Canonical financial batch not found.");
    if (batch.state === "processing" || batch.state === "paid") throw new CanonicalBatchExecutionError("FINANCIAL_BATCH_ALREADY_EXECUTED", "This batch already has an execution attempt.");
    if (batch.state !== "approved") throw new CanonicalBatchExecutionError("FINANCIAL_BATCH_NOT_APPROVED", "Only an approved canonical financial batch can execute.");
    if (batch.historical) throw new CanonicalBatchExecutionError("FINANCIAL_BATCH_HISTORICAL", "Historical records cannot be executed.");
    if (!Number.isSafeInteger(batch.frozenFacilityChargeCents) || batch.frozenFacilityChargeCents <= 0) throw new CanonicalBatchExecutionError("FINANCIAL_BATCH_INVALID_AMOUNT", "The approved batch has no valid executable amount.");
    if (batch.currency.toLowerCase() !== "usd") throw new CanonicalBatchExecutionError("FINANCIAL_BATCH_INVALID_CURRENCY", "Only USD canonical batches are supported.");
    if (batch.executionProviderId) throw new CanonicalBatchExecutionError("FINANCIAL_BATCH_ALREADY_EXECUTED", "This batch already has provider execution evidence.");
    const owner = await tx.findOwner(batch.ownerId);
    if (!owner?.stripeCustomerId || !owner.stripePaymentMethodId) throw new CanonicalBatchExecutionError("FINANCIAL_OWNER_PAYMENT_METHOD_UNAVAILABLE", "The facility does not have a ready payment method.");

    const attemptId = randomUUID();
    const providerResult = await input.provider.createPaymentIntent({
      amount: batch.frozenFacilityChargeCents,
      currency: "usd",
      customer: owner.stripeCustomerId,
      paymentMethod: owner.stripePaymentMethodId,
      idempotencyKey: canonicalBatchExecutionIdempotencyKey(batch),
      metadata: { canonicalBatchId: batch.id, canonicalBatchReference: batch.reference, executionAttemptId: attemptId },
    });
    if (!providerResult.id) throw new CanonicalBatchExecutionError("FINANCIAL_PROVIDER_RESPONSE_INVALID", "The payment provider did not return an execution reference.");
    const claimed = await tx.markProcessing({ batchId: batch.id, providerId: providerResult.id, attemptId, actorId: input.actorId, reason: input.reason.trim() });
    if (!claimed) throw new CanonicalBatchExecutionError("FINANCIAL_BATCH_EXECUTION_CONFLICT", "The batch changed while execution was being recorded.");
    await tx.appendAudit({ batchId: batch.id, eventType: "provider_execution_requested", actorId: input.actorId, reason: input.reason.trim(), priorState: "approved", newState: "processing", safeMetadata: { executionAttemptId: attemptId, provider: "stripe", mode: environment.NODE_ENV === "test" ? "test" : "live" } });
    return { batchId: batch.id, providerId: providerResult.id, attemptId, status: "processing" as const };
  });
}

export function createDatabaseCanonicalBatchExecutionRepository(): CanonicalExecutionRepository {
  return {
    transaction: async (run) => db.transaction(async (tx: any) => run({
      async findBatch(batchId) {
        const [row] = await tx.select().from(billingBatches).where(eq(billingBatches.id, batchId)).limit(1);
        if (!row || row.batchModelVersion !== "canonical_financial_batch_v1") return null;
        return {
          id: row.id,
          reference: row.canonicalReference || row.id,
          state: row.canonicalState as CanonicalExecutionBatch["state"],
          ownerId: row.ownerId,
          currency: "usd",
          frozenFacilityChargeCents: row.frozenFacilityChargeCents ?? 0,
          executionProviderId: row.stripePaymentIntentId,
          historical: false,
        };
      },
      async findOwner(ownerId) {
        const [owner] = await tx.select({ id: owners.id, stripeCustomerId: owners.stripeCustomerId, stripePaymentMethodId: owners.stripePaymentMethodId }).from(owners).where(eq(owners.id, ownerId)).limit(1);
        return owner || null;
      },
      async markProcessing(input) {
        const rows = await tx.update(billingBatches).set({
          canonicalState: "processing",
          status: "processing",
          stripePaymentIntentId: input.providerId,
          processingStartedAt: new Date(),
          updatedAt: new Date(),
          metadata: { canonicalExecutionAttemptId: input.attemptId, canonicalExecutionMode: process.env.NODE_ENV === "test" ? "test" : "live" },
        }).where(and(
          eq(billingBatches.id, input.batchId),
          eq(billingBatches.batchModelVersion, "canonical_financial_batch_v1"),
          eq(billingBatches.canonicalState, "approved"),
          isNull(billingBatches.stripePaymentIntentId),
        )).returning({ id: billingBatches.id });
        return rows.length === 1;
      },
      async appendAudit(input) {
        const [batch] = await tx.select().from(billingBatches).where(eq(billingBatches.id, input.batchId)).limit(1);
        if (!batch) throw new Error("Canonical batch disappeared while recording audit event");
        await tx.insert(financialBatchAuditEvents).values({
          batchId: input.batchId,
          eventType: input.eventType,
          actorId: input.actorId,
          actorRole: "admin",
          reason: input.reason,
          priorState: input.priorState,
          newState: input.newState,
          revision: batch.revision || 1,
          obligationCount: batch.paymentCount,
          frozenDriverIncentiveCents: batch.frozenDriverIncentiveCents || 0,
          frozenPlatformFeeCents: batch.frozenPlatformFeeCents || 0,
          frozenFacilityChargeCents: batch.frozenFacilityChargeCents || 0,
          safeMetadata: input.safeMetadata,
        });
      },
    })),
  };
}
