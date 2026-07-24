import { getAdministrationRepositoryInventorySnapshot, persistAdministrationRepositorySynchronization, recordAdministrationRepositoryRefreshAudit } from "./administrationRepositoryReadModel";
import { administrationRepositoryRefreshLock, type AdministrationRepositoryRefreshLock } from "./administrationRepositoryRefreshLock";
import { resolveImmutableSourceCommit } from "./administrationRepositorySourceCommit";
import { runAdministrationRepositorySynchronization, type SynchronizationEngineResult, type SynchronizationLogger } from "./administrationRepositorySynchronization";

export type AdministrationRepositoryRefreshState = "idle" | "running" | "completed" | "completed_with_warnings" | "failed";
export type AdministrationRepositoryRefreshSnapshot = {
  state: AdministrationRepositoryRefreshState;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  documentsDiscovered: number;
  documentsSynchronized: number;
  warnings: number;
  errors: number;
  sourceCommit: string | null;
};

export type RefreshExecution =
  | { status: "conflict"; snapshot: AdministrationRepositoryRefreshSnapshot }
  | { status: "completed" | "failed"; snapshot: AdministrationRepositoryRefreshSnapshot; result: SynchronizationEngineResult };

export type AdministrationRepositoryRefreshContext = {
  /** Supplied only after the shared authorization guard has verified immutable provenance. */
  sourceCommit?: string;
  /** A normalized environment classification, never a raw environment-variable value. */
  environment?: "production" | "staging" | "development" | "test" | "local";
};

export type AdministrationRepositoryRefreshDependencies = {
  resolveSourceCommit: typeof resolveImmutableSourceCommit;
  inventory: typeof getAdministrationRepositoryInventorySnapshot;
  synchronize: typeof runAdministrationRepositorySynchronization;
  publish: typeof persistAdministrationRepositorySynchronization;
  audit: typeof recordAdministrationRepositoryRefreshAudit;
  lock: AdministrationRepositoryRefreshLock;
  now?: () => Date;
  logger?: SynchronizationLogger;
};

function emptySnapshot(): AdministrationRepositoryRefreshSnapshot {
  return { state: "idle", startedAt: null, completedAt: null, durationMs: null, documentsDiscovered: 0, documentsSynchronized: 0, warnings: 0, errors: 0, sourceCommit: null };
}

function asSnapshot(result: SynchronizationEngineResult, sourceCommit: string, startedAt: Date, completedAt: Date): AdministrationRepositoryRefreshSnapshot {
  return {
    state: result.status === "failed" ? "failed" : result.warnings.length ? "completed_with_warnings" : "completed",
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    durationMs: completedAt.getTime() - startedAt.getTime(),
    documentsDiscovered: result.report.documentsDiscovered,
    documentsSynchronized: result.report.documentsSynchronized,
    warnings: result.warnings.length,
    errors: result.errors.length,
    sourceCommit,
  };
}

/**
 * Process-local execution fence and orchestration adapter for the reusable engine.
 * The engine remains responsible for scan/parse/validate/build/publish ordering;
 * this adapter only supplies persisted inventory, audit context, and one active run.
 */
export function createAdministrationRepositoryRefreshService(overrides: Partial<AdministrationRepositoryRefreshDependencies> = {}) {
  const dependencies: AdministrationRepositoryRefreshDependencies = {
    resolveSourceCommit: resolveImmutableSourceCommit,
    inventory: getAdministrationRepositoryInventorySnapshot,
    synchronize: runAdministrationRepositorySynchronization,
    publish: persistAdministrationRepositorySynchronization,
    audit: recordAdministrationRepositoryRefreshAudit,
    lock: administrationRepositoryRefreshLock,
    now: () => new Date(),
    ...overrides,
  };
  let active = false;
  let snapshot = emptySnapshot();

  return {
    getStatus: () => snapshot,
    async refresh(actorId: string, context: AdministrationRepositoryRefreshContext = {}): Promise<RefreshExecution> {
      if (active) return { status: "conflict", snapshot };
      const lease = await dependencies.lock.acquire();
      if (!lease) {
        try { await dependencies.audit("synchronization_refresh_lock_rejected", actorId, { immutableCommitSha: context.sourceCommit || null, environment: context.environment || "unknown" }); }
        catch { /* A lock conflict must remain safe even when optional audit persistence is unavailable. */ }
        dependencies.logger?.info("administration_repository_refresh_lock_rejected", { sourceCommit: context.sourceCommit || "unknown", environment: context.environment || "unknown" });
        return { status: "conflict", snapshot };
      }
      active = true;
      const startedAt = dependencies.now!();
      let sourceCommit: string | null = null;
      snapshot = { ...emptySnapshot(), state: "running", startedAt: startedAt.toISOString() };
      try {
        sourceCommit = context.sourceCommit || dependencies.resolveSourceCommit().commitSha;
        await dependencies.audit("synchronization_refresh_lock_acquired", actorId, { immutableCommitSha: sourceCommit, environment: context.environment || "unknown" });
        await dependencies.audit("synchronization_refresh_requested", actorId, { immutableCommitSha: sourceCommit, environment: context.environment || "unknown" });
        dependencies.logger?.info("administration_repository_refresh_lock_acquired", { sourceCommit, environment: context.environment || "unknown" });
        const inventory = await dependencies.inventory();
        const result = await dependencies.synchronize({
          sourceCommit,
          inventory,
          rootDirectory: process.cwd(),
          logger: dependencies.logger,
          publisher: { publish: async (staged) => {
            const publicationId = await dependencies.publish(sourceCommit!, staged, actorId);
            return { inventoryGenerationId: publicationId, documentsSynchronized: staged.documents.length };
          } },
        });
        const completedAt = dependencies.now!();
        snapshot = asSnapshot(result, sourceCommit, startedAt, completedAt);
        await dependencies.audit(result.status === "completed" ? "synchronization_refresh_completed" : "synchronization_refresh_failed", actorId, {
          immutableCommitSha: sourceCommit,
          durationMs: snapshot.durationMs || 0,
          warningCount: result.warnings.length,
          errorCount: result.errors.length,
          inventoryGenerationStatus: result.report.inventoryGenerationStatus,
        });
        return { status: result.status, snapshot, result };
      } catch {
        const completedAt = dependencies.now!();
        snapshot = { ...snapshot, state: "failed", completedAt: completedAt.toISOString(), durationMs: completedAt.getTime() - startedAt.getTime(), errors: Math.max(1, snapshot.errors), sourceCommit };
        if (sourceCommit) {
          try { await dependencies.audit("synchronization_refresh_failed", actorId, { immutableCommitSha: sourceCommit, durationMs: snapshot.durationMs || 0, errorCount: snapshot.errors, inventoryGenerationStatus: "failed" }); }
          catch { /* Preserve the original failure without exposing internal audit errors. */ }
        }
        throw new Error("administration_repository_refresh_failed");
      } finally {
        active = false;
        await lease.release();
      }
    },
  };
}

export const administrationRepositoryRefreshService = createAdministrationRepositoryRefreshService();
