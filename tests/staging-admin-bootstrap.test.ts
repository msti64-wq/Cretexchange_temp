import assert from "node:assert/strict";
import test from "node:test";
import { bootstrapStagingAdmin, readStagingAdminBootstrapContext } from "../scripts/bootstrap-staging-admin";

const environment = {
  ADMIN_BOOTSTRAP_TARGET: "staging",
  RAILWAY_ENVIRONMENT_NAME: "staging",
  STAGING_ADMIN_BOOTSTRAP_CONFIRM: "bootstrap-staging-admin",
  STAGING_ADMIN_EMAIL: "staging-release-admin@cretexchange.test",
  STAGING_ADMIN_PASSWORD: "staging-only-password",
  STAGING_ADMIN_BOOTSTRAP_OPERATOR: "release-engineering",
};

test("staging admin bootstrap fails closed outside the explicitly confirmed Railway staging environment", () => {
  assert.throws(() => readStagingAdminBootstrapContext({ ...environment, RAILWAY_ENVIRONMENT_NAME: "production" }), /Railway environment/);
  assert.throws(() => readStagingAdminBootstrapContext({ ...environment, ADMIN_BOOTSTRAP_TARGET: "production" }), /staging-only/);
  assert.throws(() => readStagingAdminBootstrapContext({ ...environment, STAGING_ADMIN_BOOTSTRAP_CONFIRM: "wrong" }), /CONFIRM/);
});

test("staging admin bootstrap creates a normal Admin and records sanitized audit metadata", async () => {
  const context = readStagingAdminBootstrapContext(environment);
  const calls: string[] = [];
  const result = await bootstrapStagingAdmin(context, {
    findByEmail: async () => undefined,
    findByUsername: async () => undefined,
    hashPassword: async (password) => `hash:${password.length}`,
    create: async (input) => ({ id: "admin-1", username: input.username, email: input.email, role: "admin", isActive: true }),
    audit: async (input) => { calls.push(JSON.stringify(input)); },
  });
  assert.equal(result.action, "created");
  assert.equal(result.user.role, "admin");
  assert.match(calls[0], /staging_admin_bootstrap_created/);
  assert.doesNotMatch(calls[0], /staging-only-password/);
});

test("staging admin bootstrap is idempotent and never resets an existing administrative credential", async () => {
  const context = readStagingAdminBootstrapContext(environment);
  let created = false;
  let hashed = false;
  const result = await bootstrapStagingAdmin(context, {
    findByEmail: async () => ({ id: "admin-1", username: "staging-release-admin", email: context.email, role: "admin", isActive: true }),
    findByUsername: async () => undefined,
    hashPassword: async () => { hashed = true; return "hash"; },
    create: async () => { created = true; throw new Error("must not create"); },
    audit: async () => undefined,
  });
  assert.equal(result.action, "already_admin");
  assert.equal(created, false);
  assert.equal(hashed, false);
});

test("staging admin bootstrap refuses to repurpose an existing driver or owner", async () => {
  const context = readStagingAdminBootstrapContext(environment);
  await assert.rejects(() => bootstrapStagingAdmin(context, {
    findByEmail: async () => ({ id: "driver-1", username: "driver", email: context.email, role: "driver", isActive: true }),
    findByUsername: async () => undefined,
    hashPassword: async () => "hash",
    create: async () => { throw new Error("must not create"); },
    audit: async () => undefined,
  }), /non-administrative role/);
});
