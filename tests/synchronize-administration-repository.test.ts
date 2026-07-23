import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("manual Administration Repository synchronization is staging-only, feature-gated, and source-validated before persistence", async () => {
  const source = await readFile(new URL("../scripts/synchronize-administration-repository.ts", import.meta.url), "utf8");
  assert.match(source, /ADMIN_REPOSITORY_ENABLED=true/);
  assert.match(source, /SYNCHRONIZATION_TARGET !== "staging"/);
  assert.match(source, /RAILWAY_ENVIRONMENT_NAME !== "staging"/);
  assert.match(source, /synchronizeGovernedDocuments\(immutableCommitSha, documents\)/);
  assert.match(source, /if \(result\.status !== "completed"\)/);
  assert.match(source, /persistAdministrationRepositorySynchronization\(immutableCommitSha, result\)/);
  assert.doesNotMatch(source, /setInterval|cron|automatic startup/i);
});
