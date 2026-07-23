import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createAdministrationRepositoryRefreshService } from "../server/administrationRepositoryRefresh";
import { runAdministrationRepositorySynchronization } from "../server/administrationRepositorySynchronization";

const commit = "d".repeat(40);
const document = {
  path: "docs/operations/CTX-OPS-099-example.md",
  body: "# CTX-OPS-099 — Example\n\n- **Document ID:** CTX-OPS-099\n- **Version:** 1.0\n- **Status:** Draft\n- **Owner:** Platform Operations\n- **Classification:** Internal\n",
};

test("Refresh API is protected, feature-gated, and exposes refresh status, history, and health", async () => {
  const routes = await readFile(new URL("../server/routes.ts", import.meta.url), "utf8");
  for (const route of ["/api/admin/administration-repository/refresh'", "/api/admin/administration-repository/refresh/status'", "/api/admin/administration-repository/refresh/history'", "/api/admin/administration-repository/refresh/health'"]) assert.match(routes, new RegExp(route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(routes, /app\.post\('\/api\/admin\/administration-repository\/refresh', isAuthenticated/);
  assert.match(routes, /requireAdministrationRepositoryActor\(req, res\)/);
  assert.match(routes, /synchronization_in_progress/);
  assert.match(routes, /synchronization_engine_failure/);
  assert.match(routes, /getAdministrationRepositoryRefreshHistory/);
  assert.match(routes, /getAdministrationRepositoryDocumentationHealth/);
});

test("authorized refresh invokes the existing engine, audits completion, and serializes concurrent requests", async () => {
  let release: (() => void) | undefined;
  let entered: (() => void) | undefined;
  const enteredGate = new Promise<void>((resolve) => { entered = resolve; });
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const audits: string[] = [];
  let publications = 0;
  const service = createAdministrationRepositoryRefreshService({
    resolveSourceCommit: () => ({ commitSha: commit, sourceVariable: "RAILWAY_GIT_COMMIT_SHA" }),
    inventory: async () => [],
    audit: async (event) => { audits.push(event); },
    publish: async () => { publications += 1; return "run-1"; },
    synchronize: async (input) => {
      entered!();
      await gate;
      return runAdministrationRepositorySynchronization({ ...input, documents: [document] });
    },
  } as any);
  const first = service.refresh("admin-1");
  await enteredGate;
  assert.equal(service.getStatus().state, "running");
  const conflict = await service.refresh("admin-2");
  assert.equal(conflict.status, "conflict");
  release!();
  const completed = await first;
  assert.equal(completed.status, "completed");
  assert.equal(completed.snapshot.state, "completed");
  assert.equal(publications, 1);
  assert.deepEqual(audits, ["synchronization_refresh_requested", "synchronization_refresh_completed"]);
});

test("validation failures are returned without publication and retain audit evidence", async () => {
  const audits: string[] = [];
  let publications = 0;
  const service = createAdministrationRepositoryRefreshService({
    resolveSourceCommit: () => ({ commitSha: commit, sourceVariable: "RAILWAY_GIT_COMMIT_SHA" }),
    inventory: async () => [],
    audit: async (event) => { audits.push(event); },
    publish: async () => { publications += 1; return "unexpected"; },
    synchronize: async (input) => runAdministrationRepositorySynchronization({ ...input, documents: [{ ...document, path: "docs/operations/invalid.md", body: "# Invalid\n" }] }),
  } as any);
  const result = await service.refresh("admin-1");
  assert.equal(result.status, "failed");
  assert.equal(result.snapshot.state, "failed");
  assert.equal(publications, 0);
  assert.deepEqual(audits, ["synchronization_refresh_requested", "synchronization_refresh_failed"]);
});

test("a successful refresh with relationship warnings reports completed_with_warnings", async () => {
  const service = createAdministrationRepositoryRefreshService({
    resolveSourceCommit: () => ({ commitSha: commit, sourceVariable: "RAILWAY_GIT_COMMIT_SHA" }),
    inventory: async () => [],
    audit: async () => {},
    publish: async () => "run-warnings",
    synchronize: async (input) => runAdministrationRepositorySynchronization({
      ...input,
      documents: [{ ...document, body: `${document.body}\nSee [missing](CTX-ARCH-999).` }],
    }),
  } as any);
  const result = await service.refresh("admin-1");
  assert.equal(result.status, "completed");
  assert.equal(result.snapshot.state, "completed_with_warnings");
  assert.equal(result.snapshot.warnings > 0, true);
});
