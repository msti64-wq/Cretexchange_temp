import { getAdministrationRepositoryInventorySnapshot, persistAdministrationRepositorySynchronization, recordAdministrationRepositoryRefreshAudit } from "./administrationRepositoryReadModel";
import { resolveImmutableSourceCommit } from "./administrationRepositorySourceCommit";
import { runAdministrationRepositorySynchronization, type SynchronizationEngineResult, type SynchronizationLogger } from "./administrationRepositorySynchronization";

export type AdministrationRepositoryRefreshState = "idle" | "running" | "completed" | "completed_with_warnings" | "failed";
export type AdministrationRepositoryRefreshSnapshot = {
  state: AdministrationRepositoryRefreshState;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  documentsDiscovered: number;
  documentsPublished: number;
  warnings: number;
  errors: number;
  sourceCommit: string | null;
};

export type RefreshExecution =
  | { status: "conflict"; snapshot: AdministrationRepositoryRefreshSnapshot }
  | { status: "completed" | "failed"; snapshot: AdministrationRepositoryRefreshSnapshot; result: SynchronizationEngineResult };

export type AdministrationRepositoryRefreshDependencies = {
  resolveSourceCommit: typeof resolveImmutableSourceCommit;
  inventory: typeof getAdministrationRepositoryInventorySnapshot;
  synchronize: typeof runAdministrationRepositorySynchronization;
  publish: typeof persistAdministrationRepositorySynchronization;
  audit: typeof recordAdministrationRepositoryRefreshAudit;
  now?: () => Date;
  logger?: SynchronizationLogger;
};

function emptySnapshot(): AdministrationRepositoryRefreshSnapshot {
  return { state: "idle", startedAt: null, completedAt: null, durationMs: null, documentsDiscovered: 0, documentsPublished: 0, warnings: 0, errors: 0, sourceCommit: null };
}

function asSnapshot(result: SynchronizationEngineResult, sourceCommit: string, startedAt: Date, completedAt: Date): AdministrationRepositoryRefreshSnapshot {
  return {
    state: result.status === "failed" ? "failed" : result.warnings.length ? "completed_with_warnings" : "completed",
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    durationMs: completedAt.getTime() - startedAt.getTime(),
    documentsDiscovered: result.report.documentsDiscovered,
    documentsPublished: result.report.documentsPublished,
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
    now: () => new Date(),
    ...overrides,
  };
  let active = false;
  let snapshot = emptySnapshot();

  return {
    getStatus: () => snapshot,
    async refresh(actorId: string): Promise<RefreshExecution> {
      if (active) return { status: "conflict", snapshot };
      active = true;
      const startedAt = dependencies.now!();
      let sourceCommit: string | null = null;
      snapshot = { ...emptySnapshot(), state: "running", startedAt: startedAt.toISOString() };
      try {
        sourceCommit = dependencies.resolveSourceCommit().commitSha;
        await dependencies.audit("synchronization_refresh_requested", actorId, { immutableCommitSha: sourceCommit });
        const inventory = await dependencies.inventory();
        const result = await dependencies.synchronize({
          sourceCommit,
          inventory,
          rootDirectory: process.cwd(),
          logger: dependencies.logger,
          publisher: { publish: async (staged) => {
            const publicationId = await dependencies.publish(sourceCommit!, staged, actorId);
            return { publicationId, documentsPublished: staged.documents.length };
          } },
        });
        const completedAt = dependencies.now!();
        snapshot = asSnapshot(result, sourceCommit, startedAt, completedAt);
        await dependencies.audit(result.status === "completed" ? "synchronization_refresh_completed" : "synchronization_refresh_failed", actorId, {
          immutableCommitSha: sourceCommit,
          durationMs: snapshot.durationMs || 0,
          warningCount: result.warnings.length,
          errorCount: result.errors.length,
          publicationStatus: result.report.publicationStatus,
        });
        return { status: result.status, snapshot, result };
      } catch {
        const completedAt = dependencies.now!();
        snapshot = { ...snapshot, state: "failed", completedAt: completedAt.toISOString(), durationMs: completedAt.getTime() - startedAt.getTime(), errors: Math.max(1, snapshot.errors), sourceCommit };
        if (sourceCommit) {
          try { await dependencies.audit("synchronization_refresh_failed", actorId, { immutableCommitSha: sourceCommit, durationMs: snapshot.durationMs || 0, errorCount: snapshot.errors, publicationStatus: "failed" }); }
          catch { /* Preserve the original failure without exposing internal audit errors. */ }
        }
        throw new Error("administration_repository_refresh_failed");
      } finally {
        active = false;
      }
    },
  };
}

export const administrationRepositoryRefreshService = createAdministrationRepositoryRefreshService();
