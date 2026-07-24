import assert from "node:assert/strict";
import test from "node:test";
import { authorizeAdministrationRepositoryRefresh } from "../server/administrationRepositoryRefreshAuthorization";

const commit = "a".repeat(40);
const production = (overrides: Record<string, string | undefined> = {}) => ({
  SYNCHRONIZATION_TARGET: "production",
  RAILWAY_ENVIRONMENT_NAME: "production",
  RAILWAY_GIT_COMMIT_SHA: commit,
  ...overrides,
});

test("production refresh authorization fails closed for absent authorization, wrong identity, absent commit, and a mismatched commit", () => {
  assert.deepEqual(authorizeAdministrationRepositoryRefresh(production()), { allowed: false, environment: "production", code: "administration_repository_production_authorization_missing" });
  assert.deepEqual(authorizeAdministrationRepositoryRefresh(production({ RAILWAY_ENVIRONMENT_NAME: "staging" })), { allowed: false, environment: "unknown", code: "administration_repository_environment_identity_invalid" });
  assert.deepEqual(authorizeAdministrationRepositoryRefresh(production({ RAILWAY_GIT_COMMIT_SHA: undefined })), { allowed: false, environment: "production", code: "administration_repository_source_commit_invalid" });
  assert.deepEqual(authorizeAdministrationRepositoryRefresh(production({ ADMIN_REPOSITORY_PRODUCTION_SYNC_AUTHORIZATION: "b".repeat(40) })), { allowed: false, environment: "production", code: "administration_repository_production_authorization_mismatch" });
});

test("production authorization permits only an explicit authorization bound to the immutable source commit", () => {
  const result = authorizeAdministrationRepositoryRefresh(production({ ADMIN_REPOSITORY_PRODUCTION_SYNC_AUTHORIZATION: commit.toUpperCase() }));
  assert.equal(result.allowed, true);
  if (result.allowed) {
    assert.equal(result.environment, "production");
    assert.equal(result.sourceCommit.commitSha, commit);
  }
});

test("staging remains authorized without a production authorization but ambiguous non-production identity fails closed", () => {
  const staging = authorizeAdministrationRepositoryRefresh({ SYNCHRONIZATION_TARGET: "staging", RAILWAY_ENVIRONMENT_NAME: "staging", RAILWAY_GIT_COMMIT_SHA: commit });
  assert.equal(staging.allowed, true);
  assert.deepEqual(authorizeAdministrationRepositoryRefresh({ SYNCHRONIZATION_TARGET: "staging", RAILWAY_GIT_COMMIT_SHA: commit }), { allowed: false, environment: "unknown", code: "administration_repository_environment_identity_invalid" });
});

test("CLI default preserves staging-only non-production authorization while HTTP may opt into explicitly named development environments", () => {
  const development = { SYNCHRONIZATION_TARGET: "development", RAILWAY_ENVIRONMENT_NAME: "development", RAILWAY_GIT_COMMIT_SHA: commit };
  assert.equal(authorizeAdministrationRepositoryRefresh(development).allowed, false);
  assert.equal(authorizeAdministrationRepositoryRefresh(development, { allowedNonProductionEnvironments: ["staging", "development", "test", "local"] }).allowed, true);
});
