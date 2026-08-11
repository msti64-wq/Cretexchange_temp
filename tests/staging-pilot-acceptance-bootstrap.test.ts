import assert from "node:assert/strict";
import test from "node:test";
import { bootstrapStagingPilotAcceptance, readStagingPilotAcceptanceContext } from "../scripts/bootstrap-staging-pilot-acceptance";

const environment = {
  PILOT_ACCEPTANCE_TARGET: "staging",
  RAILWAY_ENVIRONMENT_NAME: "staging",
  PILOT_ACCEPTANCE_CONFIRM: "prepare-staging-pilot-acceptance",
  STAGING_PILOT_ACCEPTANCE_NAMESPACE: "pilot-acceptance-test",
  STAGING_PILOT_ACCEPTANCE_PASSWORD: "River stones remain quiet at sunrise 47!",
  STAGING_PILOT_ACCEPTANCE_OPERATOR: "release-engineering",
};

test("staging pilot acceptance bootstrap fails closed outside explicitly confirmed staging", () => {
  assert.throws(() => readStagingPilotAcceptanceContext({ ...environment, RAILWAY_ENVIRONMENT_NAME: "production" }), /Railway environment/);
  assert.throws(() => readStagingPilotAcceptanceContext({ ...environment, PILOT_ACCEPTANCE_TARGET: "production" }), /staging-only/);
  assert.throws(() => readStagingPilotAcceptanceContext({ ...environment, PILOT_ACCEPTANCE_CONFIRM: "wrong" }), /CONFIRM/);
});

test("staging pilot acceptance bootstrap creates distinct roles and audited role profiles", async () => {
  const context = readStagingPilotAcceptanceContext(environment);
  const calls: string[] = [];
  const result = await bootstrapStagingPilotAcceptance(context, {
    findByEmail: async () => undefined,
    findByUsername: async () => undefined,
    hashPassword: async (value) => `hash-${value.length}`,
    createUser: async (input) => ({ id: input.role, username: input.username, email: input.email, role: input.role, isActive: true }),
    createDriver: async (id) => { calls.push(`driver:${id}`); },
    createOwner: async (id) => { calls.push(`owner:${id}`); },
    audit: async (input) => { calls.push(`audit:${input.role}:${input.action}`); },
  });
  assert.deepEqual(result.created, ["driver", "owner", "admin", "super_admin"]);
  assert.match(calls.join("|"), /driver:driver/);
  assert.match(calls.join("|"), /owner:owner/);
  assert.equal(calls.filter((item) => item.startsWith("audit:")).length, 4);
  assert.doesNotMatch(calls.join("|"), /River stones/);
});

test("staging pilot acceptance bootstrap is idempotent and never changes an existing identity", async () => {
  const context = readStagingPilotAcceptanceContext(environment);
  const existing = new Map(context.participants.map((participant) => [participant.email, { id: participant.role, username: participant.username, email: participant.email, role: participant.role, isActive: true }]));
  let created = false;
  const result = await bootstrapStagingPilotAcceptance(context, {
    findByEmail: async (email) => existing.get(email),
    findByUsername: async () => undefined,
    hashPassword: async () => { throw new Error("must not hash"); },
    createUser: async () => { created = true; throw new Error("must not create"); },
    createDriver: async () => undefined,
    createOwner: async () => undefined,
    audit: async () => undefined,
  });
  assert.equal(created, false);
  assert.deepEqual(result.existing, ["driver", "owner", "admin", "super_admin"]);
});
