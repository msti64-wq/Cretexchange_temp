import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createAdministrationRepositoryRefreshService } from "../server/administrationRepositoryRefresh";
import type { AdministrationRepositoryRefreshLock } from "../server/administrationRepositoryRefreshLock";
import { runAdministrationRepositorySynchronization } from "../server/administrationRepositorySynchronization";

const commit = "d".repeat(40);
const document = {
  path: "docs/operations/CTX-OPS-099-example.md",
  body: "# CTX-OPS-099 — Example\n\n- **Document ID:** CTX-OPS-099\n- **Version:** 1.0\n- **Status:** Draft\n- **Owner:** Platform Operations\n- **Classification:** Internal\n",
};

function createSharedLock(): { lock: AdministrationRepositoryRefreshLock; getReleaseCount: () => number } {
  let held = false;
  let releases = 0;
  return {
    lock: {
      async acquire() {
        if (held) return null;
        held = true;
        return { async release() { if (held) { held = false; releases += 1; } } };
      },
    },
    getReleaseCount: () => releases,
  };
}

test("Refresh API is protected, feature-gated, production-guarded, and exposes refresh status, history, and health", async () => {
  const routes = await readFile(new URL("../server/routes.ts", import.meta.url), "utf8");
  for (const route of ["/api/admin/administration-repository/refresh'", "/api/admin/administration-repository/refresh/status'", "/api/admin/administration-repository/refresh/history'", "/api/admin/administration-repository/refresh/health'"]) assert.match(routes, new RegExp(route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(routes, /app\.post\('\/api\/admin\/administration-repository\/refresh', isAuthenticated/);
  assert.match(routes, /requireAdministrationRepositoryActor\(req, res\)/);
  assert.match(routes, /authorizeAdministrationRepositoryRefresh\(process\.env/);
  assert.match(routes, /synchronization_refresh_authorization_denied/);
  assert.match(routes, /synchronization_in_progress/);
  assert.match(routes, /synchronization_engine_failure/);
  assert.match(routes, /getAdministrationRepositoryRefreshHistory/);
  assert.match(routes, /getAdministrationRepositoryDocumentationHealth/);
});

test("independent refresh orchestrators share a lock and only one publishes", async () => {
  let release: (() => void) | undefined;
  let entered: (() => void) | undefined;
  const enteredGate = new Promise<void>((resolve) => { entered = resolve; });
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const { lock, getReleaseCount } = createSharedLock();
  const audits: string[] = [];
  let publications = 0;
  const dependencies = {
    lock,
    resolveSourceCommit: () => ({ commitSha: commit, sourceVariable: "RAILWAY_GIT_COMMIT_SHA" }),
    inventory: async () => [],
    audit: async (event: string) => { audits.push(event); },
    publish: async () => { publications += 1; return "run-1"; },
    synchronize: async (input: any) => {
      entered!();
      await gate;
      return runAdministrationRepositorySynchronization({ ...input, documents: [document] });
    },
  };
  const firstService = createAdministrationRepositoryRefreshService(dependencies as any);
  const secondService = createAdministrationRepositoryRefreshService(dependencies as any);
  const first = firstService.refresh("admin-1", { sourceCommit: commit, environment: "staging" });
  await enteredGate;
  const conflict = await secondService.refresh("admin-2", { sourceCommit: commit, environment: "staging" });
  assert.equal(conflict.status, "conflict");
  release!();
  const completed = await first;
  assert.equal(completed.status, "completed");
  assert.equal(completed.snapshot.state, "completed");
  assert.equal(completed.snapshot.documentsSynchronized, 1);
  assert.equal(publications, 1);
  assert.equal(getReleaseCount(), 1);
  assert.equal(audits.includes("synchronization_refresh_lock_acquired"), true);
  assert.equal(audits.includes("synchronization_refresh_lock_rejected"), true);
});

test("validation failures do not publish and release the distributed lock", async () => {
  const { lock, getReleaseCount } = createSharedLock();
  const audits: string[] = [];
  let publications = 0;
  const service = createAdministrationRepositoryRefreshService({
    lock,
    resolveSourceCommit: () => ({ commitSha: commit, sourceVariable: "RAILWAY_GIT_COMMIT_SHA" }),
    inventory: async () => [],
    audit: async (event) => { audits.push(event); },
    publish: async () => { publications += 1; return "unexpected"; },
    synchronize: async (input) => runAdministrationRepositorySynchronization({ ...input, documents: [{ ...document, path: "docs/operations/invalid.md", body: "# Invalid\n" }] }),
  } as any);
  const result = await service.refresh("admin-1", { sourceCommit: commit, environment: "staging" });
  assert.equal(result.status, "failed");
  assert.equal(result.snapshot.state, "failed");
  assert.equal(publications, 0);
  assert.equal(getReleaseCount(), 1);
  assert.equal(audits.includes("synchronization_refresh_failed"), true);
});

test("a successful refresh with relationship warnings reports completed_with_warnings", async () => {
  const { lock } = createSharedLock();
  const service = createAdministrationRepositoryRefreshService({
    lock,
    resolveSourceCommit: () => ({ commitSha: commit, sourceVariable: "RAILWAY_GIT_COMMIT_SHA" }),
    inventory: async () => [],
    audit: async () => {},
    publish: async () => "run-warnings",
    synchronize: async (input) => runAdministrationRepositorySynchronization({
      ...input,
      documents: [{ ...document, body: `${document.body}\nSee [missing](CTX-ARCH-999).` }],
    }),
  } as any);
  const result = await service.refresh("admin-1", { sourceCommit: commit, environment: "staging" });
  assert.equal(result.status, "completed");
  assert.equal(result.snapshot.state, "completed_with_warnings");
  assert.equal(result.snapshot.warnings > 0, true);
});
