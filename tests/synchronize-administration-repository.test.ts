import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { ADMIN_REPOSITORY_SOURCE_COMMIT_ENV, RAILWAY_DEPLOYMENT_COMMIT_ENV, resolveImmutableSourceCommit } from "../server/administrationRepositorySourceCommit";

const railwayCommit = "a".repeat(40);
const explicitCommit = "b".repeat(40);

test("resolves a validated Railway deployment commit before the explicit staging fallback", () => {
  assert.deepEqual(resolveImmutableSourceCommit({ [RAILWAY_DEPLOYMENT_COMMIT_ENV]: railwayCommit }), { commitSha: railwayCommit, sourceVariable: RAILWAY_DEPLOYMENT_COMMIT_ENV });
  assert.deepEqual(resolveImmutableSourceCommit({ [RAILWAY_DEPLOYMENT_COMMIT_ENV]: railwayCommit, [ADMIN_REPOSITORY_SOURCE_COMMIT_ENV]: railwayCommit }), { commitSha: railwayCommit, sourceVariable: RAILWAY_DEPLOYMENT_COMMIT_ENV });
});

test("resolves a validated explicit source commit without invoking Git", () => {
  assert.deepEqual(resolveImmutableSourceCommit({ [ADMIN_REPOSITORY_SOURCE_COMMIT_ENV]: explicitCommit.toUpperCase() }), { commitSha: explicitCommit, sourceVariable: ADMIN_REPOSITORY_SOURCE_COMMIT_ENV });
});

test("fails closed for missing, malformed, or conflicting source commits", () => {
  assert.throws(() => resolveImmutableSourceCommit({}), /immutable deployment source commit/);
  assert.throws(() => resolveImmutableSourceCommit({ [RAILWAY_DEPLOYMENT_COMMIT_ENV]: "not-a-full-sha" }), /full 40-character/);
  assert.throws(() => resolveImmutableSourceCommit({ [RAILWAY_DEPLOYMENT_COMMIT_ENV]: railwayCommit, [ADMIN_REPOSITORY_SOURCE_COMMIT_ENV]: explicitCommit }), /Conflicting/);
});

test("manual Administration Repository synchronization is feature-gated and shares immutable-commit authorization with HTTP refresh", async () => {
  const [source, resolver] = await Promise.all([
    readFile(new URL("../scripts/synchronize-administration-repository.ts", import.meta.url), "utf8"),
    readFile(new URL("../server/administrationRepositorySourceCommit.ts", import.meta.url), "utf8"),
  ]);
  assert.match(source, /ADMIN_REPOSITORY_ENABLED=true/);
  assert.match(source, /authorizeAdministrationRepositoryRefresh/);
  assert.match(source, /administrationRepositoryRefreshLock/);
  assert.match(source, /Synchronization authorization denied/);
  assert.match(source, /Synchronization is already in progress/);
  assert.match(source, /runAdministrationRepositorySynchronization/);
  assert.match(source, /getAdministrationRepositoryInventorySnapshot/);
  assert.match(source, /if \(result\.status !== "completed"\)/);
  assert.match(source, /persistAdministrationRepositorySynchronization\(immutableCommitSha, staged\)/);
  assert.match(source, /import \{ pool \} from "\.\.\/server\/db"/);
  assert.match(source, /try \{/);
  assert.match(source, /finally \{\s*await pool\.end\(\);\s*\}/);
  assert.match(source, /administrationRepositorySourceCommit/);
  assert.match(resolver, /RAILWAY_GIT_COMMIT_SHA/);
  assert.match(resolver, /ADMIN_REPOSITORY_SOURCE_COMMIT/);
  assert.doesNotMatch(`${source}\n${resolver}`, /node:child_process|execFileSync|spawnSync|spawn\(|execSync|exec\(/);
  assert.doesNotMatch(source, /setInterval|cron|automatic startup/i);
});
