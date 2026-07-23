import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("Documentation Management uses the protected refresh API and existing Administration patterns", async () => {
  const [page, app, library] = await Promise.all([
    readFile(new URL("../client/src/pages/admin/administration-repository-management.tsx", import.meta.url), "utf8"),
    readFile(new URL("../client/src/App.tsx", import.meta.url), "utf8"),
    readFile(new URL("../client/src/pages/admin/administration-repository.tsx", import.meta.url), "utf8"),
  ]);
  for (const feature of [
    "Documentation Management",
    "Refresh Documentation Library",
    "/api/admin/administration-repository/refresh/health",
    "/api/admin/administration-repository/refresh/status",
    "/api/admin/administration-repository/refresh/history?limit=10",
    "apiRequest(\"POST\", \"/api/admin/administration-repository/refresh\")",
    "synchronization_in_progress",
    "completed_with_warnings",
    "Refresh Documentation Library?",
    "Documentation Library",
    "Recent synchronization history",
    "The active Documentation Library remains available if validation or publication fails.",
    "queryClient.invalidateQueries",
    "refetchInterval",
    "isPlatformOperationsRole",
    "AlertDialog",
    "aria-live=\"polite\"",
  ]) assert.match(page, new RegExp(feature.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(app, /administration-repository\/manage/);
  assert.match(library, /Documentation Management/);
});

test("Documentation Management remains a client of the API and does not implement synchronization or expose source content", async () => {
  const page = await readFile(new URL("../client/src/pages/admin/administration-repository-management.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(page, /runAdministrationRepositorySynchronization|synchronizeGovernedDocuments|readFile\(|process\.cwd\(|child_process|DATABASE_URL/);
  assert.match(page, /publicErrorMessage/);
  assert.doesNotMatch(page, /stack\s*:/i);
});
