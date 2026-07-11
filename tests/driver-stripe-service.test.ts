import assert from "node:assert/strict";
import type { Driver, User } from "../shared/schema";
import {
  buildDriverColumnStatusResponse,
  buildDriverStripeStatusApiResponse,
  buildLegacyDriverStripeAccountStatusResponse,
  coordinateDriverStripeOnboarding,
  createDriverStripeService,
  getDriverStripeOnboardingHttpStatus,
  type DriverStripeAccountSnapshot,
  type DriverStripeReconciliationField,
} from "../server/driverStripeService";

type Test = { name: string; run: () => void | Promise<void> };
const tests: Test[] = [];
function test(name: string, run: Test["run"]) {
  tests.push({ name, run });
}

function user(overrides: Partial<User> = {}): User {
  return {
    id: "user_md1",
    email: "md1@example.com",
    stripeConnectAccountId: null,
    ...overrides,
  } as User;
}

function driver(overrides: Partial<Driver> = {}): Driver {
  return {
    id: "driver_md1",
    userId: "user_md1",
    stripeConnectAccountId: null,
    connectedAccountId: null,
    ...overrides,
  } as Driver;
}

function stripeAccount(overrides: Partial<DriverStripeAccountSnapshot> = {}): DriverStripeAccountSnapshot {
  return {
    id: "acct_md1_existing",
    metadata: { userId: "user_md1", driverId: "driver_md1" },
    details_submitted: true,
    payouts_enabled: true,
    charges_enabled: true,
    capabilities: { transfers: "active" },
    requirements: { currently_due: [], past_due: [] },
    external_accounts: { data: [{ object: "bank_account" }] },
    ...overrides,
  };
}

function serviceFor(account = stripeAccount(), overrides: Record<string, unknown> = {}) {
  let retrievals = 0;
  let reconciliationCalls = 0;
  const service = createDriverStripeService({
    retrieveAccount: async (accountId) => {
      retrievals += 1;
      return { ...account, id: accountId };
    },
    auditLogger: () => undefined,
    now: () => new Date("2026-07-11T12:00:00.000Z"),
    reconcileAccountIds: async () => {
      reconciliationCalls += 1;
      return { conflict: false, updatedFields: [] };
    },
    ...overrides,
  });
  return {
    service,
    get retrievals() { return retrievals; },
    get reconciliationCalls() { return reconciliationCalls; },
  };
}

test("resolves user account ID without writing", async () => {
  const fixture = serviceFor();
  const result = await fixture.service.resolveDriverStripeAccount({
    user: user({ stripeConnectAccountId: "acct_user" }),
    driver: driver(),
    source: "test",
  });
  assert.equal(result.validationResult, "valid");
  assert.equal(result.candidateSource, "users.stripeConnectAccountId");
  assert.equal(fixture.reconciliationCalls, 0);
});

test("resolves driver Stripe account ID", async () => {
  const fixture = serviceFor();
  const result = await fixture.service.resolveDriverStripeAccount({
    user: user(),
    driver: driver({ stripeConnectAccountId: "acct_driver" }),
    source: "test",
  });
  assert.equal(result.candidateSource, "drivers.stripeConnectAccountId");
});

test("resolves legacy connectedAccountId", async () => {
  const fixture = serviceFor();
  const result = await fixture.service.resolveDriverStripeAccount({
    user: user(),
    driver: driver({ connectedAccountId: "acct_legacy" }),
    source: "test",
  });
  assert.equal(result.candidateSource, "drivers.connectedAccountId");
});

test("matching fields form one candidate with user precedence", async () => {
  const fixture = serviceFor();
  const result = await fixture.service.resolveDriverStripeAccount({
    user: user({ stripeConnectAccountId: "acct_same" }),
    driver: driver({ stripeConnectAccountId: "acct_same", connectedAccountId: "acct_same" }),
    source: "test",
  });
  assert.equal(result.conflicts.length, 0);
  assert.equal(result.candidateSource, "users.stripeConnectAccountId");
  assert.equal(fixture.retrievals, 1);
});

test("matching driver fields with empty user field form one candidate", async () => {
  const fixture = serviceFor();
  const plan = await fixture.service.planDriverStripeReconciliation({
    user: user(),
    driver: driver({ stripeConnectAccountId: "acct_same", connectedAccountId: "acct_same" }),
    source: "test",
  });
  assert.deepEqual(plan.wouldUpdate, ["users.stripeConnectAccountId"]);
  assert.equal(plan.safeToReconcile, true);
});

test("distinct local IDs return account conflict without Stripe retrieval", async () => {
  const fixture = serviceFor();
  const result = await fixture.service.resolveDriverStripeAccount({
    user: user({ stripeConnectAccountId: "acct_one" }),
    driver: driver({ stripeConnectAccountId: "acct_two" }),
    source: "test",
  });
  assert.equal(result.status, "account_conflict");
  assert.equal(result.errorState?.code, "STRIPE_ACCOUNT_CONFLICT");
  assert.equal(fixture.retrievals, 0);
});

test("invalid Stripe account returns safe unavailable state", async () => {
  const fixture = serviceFor(stripeAccount(), {
    retrieveAccount: async () => {
      throw Object.assign(new Error("not found"), { code: "resource_missing", statusCode: 404 });
    },
  });
  const result = await fixture.service.getDriverStripeStatus({
    user: user({ stripeConnectAccountId: "acct_missing" }),
    driver: driver(),
    source: "test",
  });
  assert.equal(result.status, "status_unavailable");
  assert.equal(result.errorState?.code, "STRIPE_ACCOUNT_NOT_FOUND");
});

test("identity mismatch returns identity verification failure", async () => {
  const fixture = serviceFor(stripeAccount({ metadata: { userId: "different_user" } }));
  const result = await fixture.service.getDriverStripeStatus({
    user: user({ stripeConnectAccountId: "acct_wrong" }),
    driver: driver(),
    source: "test",
  });
  assert.equal(result.status, "status_unavailable");
  assert.equal(result.errorState?.code, "STRIPE_ACCOUNT_IDENTITY_MISMATCH");
});

test("Stripe unavailability never becomes not started", async () => {
  const fixture = serviceFor(stripeAccount(), {
    retrieveAccount: async () => { throw Object.assign(new Error("network"), { code: "api_connection_error" }); },
  });
  const result = await fixture.service.getDriverStripeStatus({
    user: user({ stripeConnectAccountId: "acct_existing" }),
    driver: driver(),
    source: "test",
  });
  assert.equal(result.status, "status_unavailable");
  assert.equal(result.errorState?.retryable, true);
});

test("no candidate returns not started without Stripe retrieval", async () => {
  const fixture = serviceFor();
  const result = await fixture.service.getDriverStripeStatus({ user: user(), driver: driver(), source: "test" });
  assert.equal(result.status, "not_started");
  assert.equal(result.accountIdPresent, false);
  assert.equal(fixture.retrievals, 0);
});

test("details not submitted returns setup started", async () => {
  const fixture = serviceFor(stripeAccount({ details_submitted: false, payouts_enabled: false }));
  const result = await fixture.service.getDriverStripeStatus({
    user: user({ stripeConnectAccountId: "acct_started" }), driver: driver(), source: "test",
  });
  assert.equal(result.status, "setup_started");
});

test("payouts disabled with requirements returns action required", async () => {
  const fixture = serviceFor(stripeAccount({
    payouts_enabled: false,
    requirements: { currently_due: ["individual.verification.document"], past_due: [] },
  }));
  const result = await fixture.service.getDriverStripeStatus({
    user: user({ stripeConnectAccountId: "acct_action" }), driver: driver(), source: "test",
  });
  assert.equal(result.status, "action_required");
  assert.deepEqual(result.requirementsDue, ["individual.verification.document"]);
});

test("payouts enabled and transfers active returns payout ready", async () => {
  const fixture = serviceFor();
  const result = await fixture.service.getDriverStripeStatus({
    user: user({ stripeConnectAccountId: "acct_ready" }), driver: driver(), source: "test",
  });
  assert.equal(result.status, "payout_ready");
  assert.equal(result.payoutReady, true);
});

test("charges disabled does not block payout readiness", async () => {
  const fixture = serviceFor(stripeAccount({ charges_enabled: false }));
  const result = await fixture.service.getDriverStripeStatus({
    user: user({ stripeConnectAccountId: "acct_ready" }), driver: driver(), source: "test",
  });
  assert.equal(result.status, "payout_ready");
  assert.equal(result.chargesEnabled, false);
});

test("canonical API response retains documented compatibility aliases", async () => {
  const fixture = serviceFor(stripeAccount({ charges_enabled: false }));
  const status = await fixture.service.getDriverStripeStatus({
    user: user({ stripeConnectAccountId: "acct_ready" }), driver: driver(), source: "test",
  });
  const response = buildDriverStripeStatusApiResponse(status);
  assert.equal(response.status, "payout_ready");
  assert.equal(response.canonicalStatus, "payout_ready");
  assert.equal(response.compatibilityStatus, "payouts_ready");
  assert.equal(response.payouts_enabled, true);
  assert.equal(response.charges_enabled, false);
});

test("legacy account-status adapter uses payout readiness without charges", async () => {
  const fixture = serviceFor(stripeAccount({ charges_enabled: false }));
  const status = await fixture.service.getDriverStripeStatus({
    user: user({ stripeConnectAccountId: "acct_ready" }), driver: driver(), source: "test",
  });
  const response = buildLegacyDriverStripeAccountStatusResponse(status);
  assert.equal(response.status, "active");
  assert.equal(response.canonicalStatus, "payout_ready");
  assert.equal(response.chargesEnabled, false);
});

test("Column adapter keeps Connect readiness separate from Treasury presence", async () => {
  const fixture = serviceFor(stripeAccount({ charges_enabled: false }));
  const status = await fixture.service.getDriverStripeStatus({
    user: user({ stripeConnectAccountId: "acct_ready" }), driver: driver(), source: "test",
  });
  const response = buildDriverColumnStatusResponse(status, null);
  assert.equal(response.isOnboarded, true);
  assert.equal(response.stripePayoutReady, true);
  assert.equal(response.treasuryAccountPresent, false);
  assert.equal(response.requiresSetup, true);
});

test("onboarding HTTP status mapping distinguishes conflict, invalid, and unavailable", () => {
  assert.equal(getDriverStripeOnboardingHttpStatus("STRIPE_ACCOUNT_CONFLICT"), 409);
  assert.equal(getDriverStripeOnboardingHttpStatus("STRIPE_ACCOUNT_INVALID"), 422);
  assert.equal(getDriverStripeOnboardingHttpStatus("STRIPE_DISCOVERY_UNAVAILABLE"), 503);
});

test("inactive transfers block payout readiness", async () => {
  const fixture = serviceFor(stripeAccount({ capabilities: { transfers: "inactive" } }));
  const result = await fixture.service.getDriverStripeStatus({
    user: user({ stripeConnectAccountId: "acct_action" }), driver: driver(), source: "test",
  });
  assert.equal(result.status, "action_required");
  assert.equal(result.payoutReady, false);
});

test("reconciliation planning is dry run only", async () => {
  const fixture = serviceFor();
  const plan = await fixture.service.planDriverStripeReconciliation({
    user: user({ stripeConnectAccountId: "acct_existing" }),
    driver: driver(),
    source: "test",
  });
  assert.deepEqual(plan.wouldUpdate, ["drivers.stripeConnectAccountId", "drivers.connectedAccountId"]);
  assert.equal(fixture.reconciliationCalls, 0);
});

test("explicit reconciliation is idempotent", async () => {
  const state: Record<DriverStripeReconciliationField, string | null> = {
    "users.stripeConnectAccountId": "acct_existing",
    "drivers.stripeConnectAccountId": null,
    "drivers.connectedAccountId": null,
  };
  const reconcile = async ({ expectedAccountId }: { expectedAccountId: string }) => {
    const values = Object.values(state).filter(Boolean);
    if (values.some((value) => value !== expectedAccountId)) return { conflict: true, updatedFields: [] };
    const updatedFields = (Object.keys(state) as DriverStripeReconciliationField[])
      .filter((field) => !state[field]);
    for (const field of updatedFields) state[field] = expectedAccountId;
    return { conflict: false, updatedFields };
  };
  const fixture = serviceFor(stripeAccount(), { reconcileAccountIds: reconcile });
  const params = {
    user: user({ stripeConnectAccountId: "acct_existing" }),
    driver: driver(),
    source: "test",
  };
  const first = await fixture.service.executeDriverStripeReconciliation(params);
  const second = await fixture.service.executeDriverStripeReconciliation({
    user: user({ stripeConnectAccountId: "acct_existing" }),
    driver: driver({ stripeConnectAccountId: "acct_existing", connectedAccountId: "acct_existing" }),
    source: "test",
  });
  assert.deepEqual(first.updatedFields, ["drivers.stripeConnectAccountId", "drivers.connectedAccountId"]);
  assert.deepEqual(second.updatedFields, []);
});

test("concurrent conflicting update is rejected", async () => {
  const fixture = serviceFor(stripeAccount(), {
    reconcileAccountIds: async () => ({
      conflict: true,
      updatedFields: [],
      currentValues: { "drivers.connectedAccountId": "acct_concurrent" },
    }),
  });
  const result = await fixture.service.executeDriverStripeReconciliation({
    user: user({ stripeConnectAccountId: "acct_existing" }), driver: driver(), source: "test",
  });
  assert.equal(result.conflict, true);
  assert.deepEqual(result.updatedFields, []);
});

test("onboarding blocks creation for every unresolved local candidate", async () => {
  const fixture = serviceFor(stripeAccount(), {
    retrieveAccount: async () => { throw Object.assign(new Error("network"), { code: "api_connection_error" }); },
    findAccountsByIdentity: async () => [],
  });
  const result = await fixture.service.resolveDriverStripeAccountForOnboarding({
    user: user(), driver: driver({ connectedAccountId: "acct_unresolved" }), source: "test",
  });
  assert.equal(result.safeToCreateAccount, false);
  assert.equal(result.discoveryOutcome, "not_attempted");
});

test("zero external results allow creation only when no local blocker exists", async () => {
  const fixture = serviceFor(stripeAccount(), { findAccountsByIdentity: async () => [] });
  const result = await fixture.service.resolveDriverStripeAccountForOnboarding({
    user: user(), driver: driver(), source: "test",
  });
  assert.equal(result.discoveryOutcome, "no_matches");
  assert.equal(result.matchesFound, 0);
  assert.equal(result.safeToCreateAccount, true);
  assert.equal(result.supportRequired, false);
});

test("one verified external match is reused and blocks creation", async () => {
  const fixture = serviceFor(stripeAccount(), {
    findAccountsByIdentity: async () => [stripeAccount({ id: "acct_verified" })],
  });
  const result = await fixture.service.resolveDriverStripeAccountForOnboarding({
    user: user(), driver: driver(), source: "test",
  });
  assert.equal(result.discoveryOutcome, "one_verified_match");
  assert.equal(result.matchesFound, 1);
  assert.equal(result.validMatches, 1);
  assert.equal(result.accountId, "acct_verified");
  assert.equal(result.account, null);
  assert.equal(result.discoveredExistingAccount, true);
  assert.equal(result.safeToCreateAccount, false);
});

test("one deleted external result blocks creation as invalid", async () => {
  const fixture = serviceFor(stripeAccount(), {
    findAccountsByIdentity: async () => [stripeAccount({ id: "acct_deleted", deleted: true })],
  });
  const result = await fixture.service.resolveDriverStripeAccountForOnboarding({
    user: user(), driver: driver(), source: "test",
  });
  assert.equal(result.discoveryOutcome, "invalid_matches_found");
  assert.equal(result.invalidMatches, 1);
  assert.equal(result.errorState?.code, "STRIPE_ACCOUNT_INVALID");
  assert.equal(result.supportRequired, true);
  assert.equal(result.safeToCreateAccount, false);
});

test("one malformed external result blocks creation as invalid", async () => {
  const fixture = serviceFor(stripeAccount(), {
    findAccountsByIdentity: async () => [stripeAccount({ id: "" })],
  });
  const result = await fixture.service.resolveDriverStripeAccountForOnboarding({
    user: user(), driver: driver(), source: "test",
  });
  assert.equal(result.discoveryOutcome, "invalid_matches_found");
  assert.equal(result.invalidMatches, 1);
  assert.equal(result.errorState?.code, "STRIPE_ACCOUNT_INVALID");
  assert.equal(result.safeToCreateAccount, false);
});

test("metadata identity mismatch blocks discovery adoption and creation", async () => {
  const fixture = serviceFor(stripeAccount(), {
    findAccountsByIdentity: async () => [stripeAccount({
      id: "acct_metadata_mismatch",
      metadata: { userId: "different_user", driverId: "driver_md1" },
    })],
  });
  const result = await fixture.service.resolveDriverStripeAccountForOnboarding({
    user: user(), driver: driver(), source: "test",
  });
  assert.equal(result.discoveryOutcome, "identity_mismatch");
  assert.equal(result.identityMismatches, 1);
  assert.equal(result.errorState?.code, "STRIPE_ACCOUNT_IDENTITY_MISMATCH");
  assert.equal(result.supportRequired, true);
  assert.equal(result.safeToCreateAccount, false);
});

test("metadata-free account with mismatched email blocks adoption and creation", async () => {
  const fixture = serviceFor(stripeAccount(), {
    findAccountsByIdentity: async () => [stripeAccount({
      id: "acct_email_mismatch",
      metadata: null,
      email: "other@example.com",
    })],
  });
  const result = await fixture.service.resolveDriverStripeAccountForOnboarding({
    user: user({ email: "md1@example.com" }), driver: driver(), source: "test",
  });
  assert.equal(result.discoveryOutcome, "identity_mismatch");
  assert.equal(result.errorState?.code, "STRIPE_ACCOUNT_IDENTITY_MISMATCH");
  assert.equal(result.safeToCreateAccount, false);
});

test("metadata-free account with matching normalized email is compatible", async () => {
  const fixture = serviceFor(stripeAccount(), {
    findAccountsByIdentity: async () => [stripeAccount({
      id: "acct_legacy_email_match",
      metadata: null,
      email: "  md1@example.com  ",
    })],
  });
  const result = await fixture.service.resolveDriverStripeAccountForOnboarding({
    user: user({ email: " MD1@EXAMPLE.COM " }), driver: driver(), source: "test",
  });
  assert.equal(result.discoveryOutcome, "one_verified_match");
  assert.equal(result.accountId, "acct_legacy_email_match");
  assert.equal(result.validMatches, 1);
  assert.equal(result.safeToCreateAccount, false);
});

test("metadata-free account without Stripe email requires support and blocks creation", async () => {
  const fixture = serviceFor(stripeAccount(), {
    findAccountsByIdentity: async () => [stripeAccount({
      id: "acct_legacy_unverified",
      metadata: null,
      email: null,
    })],
  });
  const result = await fixture.service.resolveDriverStripeAccountForOnboarding({
    user: user(), driver: driver(), source: "test",
  });
  assert.equal(result.discoveryOutcome, "identity_unverified");
  assert.equal(result.identityUnverified, 1);
  assert.equal(result.errorState?.code, "STRIPE_ACCOUNT_IDENTITY_UNVERIFIED");
  assert.equal(result.supportRequired, true);
  assert.equal(result.safeToCreateAccount, false);
});

test("multiple verified external matches block creation as ambiguous", async () => {
  const fixture = serviceFor(stripeAccount(), {
    findAccountsByIdentity: async () => [stripeAccount({ id: "acct_one" }), stripeAccount({ id: "acct_two" })],
  });
  const result = await fixture.service.resolveDriverStripeAccountForOnboarding({
    user: user(), driver: driver(), source: "test",
  });
  assert.equal(result.safeToCreateAccount, false);
  assert.equal(result.status, "account_conflict");
  assert.equal(result.discoveryOutcome, "ambiguous_matches");
  assert.equal(result.validMatches, 2);
  assert.equal(result.errorState?.code, "STRIPE_ACCOUNT_MATCH_AMBIGUOUS");
});

test("mixed verified and identity-mismatched results block adoption and creation", async () => {
  const fixture = serviceFor(stripeAccount(), {
    findAccountsByIdentity: async () => [
      stripeAccount({ id: "acct_verified" }),
      stripeAccount({ id: "acct_other_identity", metadata: { userId: "different_user" } }),
    ],
  });
  const result = await fixture.service.resolveDriverStripeAccountForOnboarding({
    user: user(), driver: driver(), source: "test",
  });
  assert.equal(result.discoveryOutcome, "identity_mismatch");
  assert.equal(result.validMatches, 1);
  assert.equal(result.identityMismatches, 1);
  assert.equal(result.discoveredExistingAccount, false);
  assert.equal(result.accountId, null);
  assert.equal(result.safeToCreateAccount, false);
});

test("one verified match may be reused when other matches are clearly deleted", async () => {
  const fixture = serviceFor(stripeAccount(), {
    findAccountsByIdentity: async () => [
      stripeAccount({ id: "acct_verified" }),
      stripeAccount({ id: "acct_deleted", deleted: true }),
    ],
  });
  const result = await fixture.service.resolveDriverStripeAccountForOnboarding({
    user: user(), driver: driver(), source: "test",
  });
  assert.equal(result.discoveryOutcome, "one_verified_match");
  assert.equal(result.validMatches, 1);
  assert.equal(result.invalidMatches, 1);
  assert.equal(result.accountId, "acct_verified");
  assert.equal(result.safeToCreateAccount, false);
});

test("Stripe discovery unavailability blocks account creation", async () => {
  const fixture = serviceFor(stripeAccount(), {
    findAccountsByIdentity: async () => { throw new Error("Stripe unavailable"); },
  });
  const result = await fixture.service.resolveDriverStripeAccountForOnboarding({
    user: user(), driver: driver(), source: "test",
  });
  assert.equal(result.discoveryOutcome, "discovery_unavailable");
  assert.equal(result.errorState?.code, "STRIPE_DISCOVERY_UNAVAILABLE");
  assert.equal(result.safeToCreateAccount, false);
});

test("final onboarding re-read reuses a concurrent verified candidate", async () => {
  const fixture = serviceFor(stripeAccount(), { findAccountsByIdentity: async () => [] });
  let resolveCalls = 0;
  const decision = await coordinateDriverStripeOnboarding({
    user: user(),
    driver: driver(),
    resolve: async (currentUser, currentDriver) => {
      resolveCalls += 1;
      return fixture.service.resolveDriverStripeAccountForOnboarding({
        user: currentUser,
        driver: currentDriver,
        source: "test-final-reread",
      });
    },
    reload: async () => ({
      user: user({ stripeConnectAccountId: "acct_concurrent" }),
      driver: driver(),
    }),
  });
  assert.equal(resolveCalls, 2);
  assert.equal(decision.action, "reuse");
  assert.equal(decision.resolution.accountId, "acct_concurrent");
});

test("failed final onboarding re-read blocks a previously safe creation", async () => {
  const fixture = serviceFor(stripeAccount(), { findAccountsByIdentity: async () => [] });
  const decision = await coordinateDriverStripeOnboarding({
    user: user(),
    driver: driver(),
    resolve: (currentUser, currentDriver) => fixture.service.resolveDriverStripeAccountForOnboarding({
      user: currentUser,
      driver: currentDriver,
      source: "test-final-reread",
    }),
    reload: async () => null,
  });
  assert.equal(decision.action, "blocked");
  assert.equal(decision.resolution.errorState?.code, "STRIPE_DISCOVERY_UNAVAILABLE");
  assert.equal(decision.resolution.safeToCreateAccount, false);
});

test("creation prerequisites run before the final race-sensitive reread", async () => {
  const fixture = serviceFor(stripeAccount(), { findAccountsByIdentity: async () => [] });
  const events: string[] = [];
  const decision = await coordinateDriverStripeOnboarding({
    user: user(),
    driver: driver(),
    resolve: (currentUser, currentDriver) => fixture.service.resolveDriverStripeAccountForOnboarding({
      user: currentUser,
      driver: currentDriver,
      source: "test-final-reread",
    }),
    beforeFinalResolution: async () => { events.push("prerequisite"); },
    reload: async () => {
      events.push("reload");
      return { user: user(), driver: driver() };
    },
  });
  assert.equal(decision.action, "create");
  assert.deepEqual(events, ["prerequisite", "reload"]);
});

test("MD1 reconciliation writes only missing fields once and rejects later conflicts", async () => {
  const state: Record<DriverStripeReconciliationField, string | null> = {
    "users.stripeConnectAccountId": "acct_md1_existing",
    "drivers.stripeConnectAccountId": null,
    "drivers.connectedAccountId": null,
  };
  let persistenceCalls = 0;
  let fieldWrites = 0;
  let discoveryCalls = 0;
  const reconcile = async ({ expectedAccountId }: { expectedAccountId: string }) => {
    persistenceCalls += 1;
    const values = Object.values(state).filter((value): value is string => Boolean(value));
    if (values.some((value) => value !== expectedAccountId)) {
      return { conflict: true, updatedFields: [] };
    }
    const updatedFields = (Object.keys(state) as DriverStripeReconciliationField[])
      .filter((field) => !state[field]);
    for (const field of updatedFields) {
      state[field] = expectedAccountId;
      fieldWrites += 1;
    }
    return { conflict: false, updatedFields };
  };
  const fixture = serviceFor(stripeAccount({ id: "acct_md1_existing", charges_enabled: false }), {
    reconcileAccountIds: reconcile,
    findAccountsByIdentity: async () => {
      discoveryCalls += 1;
      return [];
    },
  });
  const md1User = user({ stripeConnectAccountId: "acct_md1_existing" });
  const status = await fixture.service.getDriverStripeStatus({
    user: md1User,
    driver: driver(),
    source: "md1-regression",
  });
  assert.equal(status.status, "payout_ready");
  assert.equal(status.chargesEnabled, false);
  assert.equal(persistenceCalls, 0);

  const first = await fixture.service.executeDriverStripeReconciliation({
    user: md1User,
    driver: driver(),
    source: "md1-regression",
  });
  assert.deepEqual(first.updatedFields, ["drivers.stripeConnectAccountId", "drivers.connectedAccountId"]);
  assert.equal(fieldWrites, 2);

  const reconciledDriver = driver({
    stripeConnectAccountId: "acct_md1_existing",
    connectedAccountId: "acct_md1_existing",
  });
  const second = await fixture.service.executeDriverStripeReconciliation({
    user: md1User,
    driver: reconciledDriver,
    source: "md1-regression",
  });
  assert.deepEqual(second.updatedFields, []);
  assert.equal(fieldWrites, 2);
  assert.equal(persistenceCalls, 2);

  state["drivers.connectedAccountId"] = "acct_different_existing";
  const conflict = await fixture.service.executeDriverStripeReconciliation({
    user: md1User,
    driver: driver({
      stripeConnectAccountId: "acct_md1_existing",
      connectedAccountId: "acct_different_existing",
    }),
    source: "md1-regression",
  });
  assert.equal(conflict.conflict, true);
  assert.deepEqual(conflict.updatedFields, []);
  assert.equal(state["drivers.connectedAccountId"], "acct_different_existing");
  assert.equal(persistenceCalls, 2);
  assert.equal(discoveryCalls, 0);
});

let failures = 0;
for (const current of tests) {
  try {
    await current.run();
    console.log(`✓ ${current.name}`);
  } catch (error) {
    failures += 1;
    console.error(`✗ ${current.name}`);
    console.error(error);
  }
}

if (failures > 0) {
  process.exitCode = 1;
} else {
  console.log(`\n${tests.length} driver Stripe service tests passed.`);
}
