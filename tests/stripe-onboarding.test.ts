import assert from "node:assert/strict";
import test from "node:test";

type Role = "driver" | "owner" | "admin";
type Result = {
  status: number;
  code: string;
  message: string;
  accountIdPresent?: boolean;
  onboardingUrl?: string;
};

type ProviderError = { code: string; message: string };

function createFixture() {
  const driver = { id: "driver-1", userId: "driver-user-1", email: "driver@example.test" };
  let storedAccountId: string | null = null;
  let lock: Promise<void> = Promise.resolve();
  const calls = { driverLookup: 0, accountCreate: 0, accountRetrieve: 0, accountLink: 0, associationWrite: 0, database: 0, stripeTransfer: 0, wallet: 0, payout: 0 };
  let createFailure: ProviderError | null = null;
  let linkFailure: ProviderError | null = null;
  let malformedCreate = false;
  let malformedLink = false;
  let invalidStoredAccount = false;
  let reconciliationFailure = false;

  const providers = {
    identity: (request: { authenticated?: boolean; role?: Role; driverId?: string }) => {
      if (request.authenticated !== true) return null;
      return { id: driver.userId, role: request.role ?? "driver" };
    },
    driverLookup: async (userId: string) => {
      calls.driverLookup += 1;
      return userId === driver.userId ? driver : null;
    },
    stripe: {
      createAccount: async (input: { userId: string; driverId: string }) => {
        calls.accountCreate += 1;
        assert.deepEqual(input, { userId: driver.userId, driverId: driver.id });
        if (createFailure) throw createFailure;
        return malformedCreate ? { id: "" } : { id: "acct_canonical_1" };
      },
      retrieveAccount: async (accountId: string) => {
        calls.accountRetrieve += 1;
        if (invalidStoredAccount || accountId !== "acct_canonical_1") throw { code: "resource_missing", message: "account missing" } satisfies ProviderError;
        return { id: accountId };
      },
      createAccountLink: async (accountId: string) => {
        calls.accountLink += 1;
        if (linkFailure) throw linkFailure;
        if (malformedLink) return { url: "" };
        return { url: `https://connect.stripe.test/${accountId}` };
      },
    },
    association: {
      read: () => storedAccountId,
      writeIfAbsent: async (accountId: string) => {
        calls.associationWrite += 1;
        if (!storedAccountId) storedAccountId = accountId;
        return storedAccountId;
      },
    },
  };

  const failure = (status: number, code: string, message: string): Result => ({ status, code, message });
  const serializeProviderFailure = (status: number, code: string, message: string): Result =>
    failure(status, code, message);

  async function insideLock<T>(action: () => Promise<T>): Promise<T> {
    const previous = lock;
    let release = () => undefined;
    lock = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try {
      return await action();
    } finally {
      release();
    }
  }

  async function onboard(request: { authenticated?: boolean; role?: Role; driverId?: string } = {}): Promise<Result> {
    const identity = providers.identity(request);
    if (!identity) return failure(401, "AUTHENTICATION_REQUIRED", "Authentication is required.");
    if (identity.role !== "driver") return failure(403, "DRIVER_ACCESS_REQUIRED", "Driver access required.");
    const resolvedDriver = await providers.driverLookup(identity.id);
    if (!resolvedDriver) return failure(404, "DRIVER_PROFILE_NOT_FOUND", "Driver profile not found.");

    return insideLock(async () => {
      if (reconciliationFailure) {
        return serializeProviderFailure(503, "STRIPE_STATUS_UNAVAILABLE", "Stripe payout setup is temporarily unavailable. Please try again later.");
      }

      let accountId = providers.association.read();
      if (accountId) {
        try {
          const account = await providers.stripe.retrieveAccount(accountId);
          if (!account?.id || account.id !== accountId) throw { code: "malformed", message: "invalid account" } satisfies ProviderError;
        } catch {
          return serializeProviderFailure(422, "STRIPE_ACCOUNT_INVALID", "Stripe payout setup is temporarily unavailable. Please try again later.");
        }
      } else {
        try {
          const created = await providers.stripe.createAccount({ userId: identity.id, driverId: resolvedDriver.id });
          if (!created?.id || !created.id.startsWith("acct_")) {
            return serializeProviderFailure(502, "DRIVER_STRIPE_ACCOUNT_CREATE_REJECTED", "Failed to create onboarding link.");
          }
          accountId = await providers.association.writeIfAbsent(created.id);
        } catch {
          return serializeProviderFailure(502, "DRIVER_STRIPE_ACCOUNT_CREATE_REJECTED", "Failed to create onboarding link.");
        }
      }

      try {
        const link = await providers.stripe.createAccountLink(accountId);
        if (!link?.url || !link.url.startsWith("https://")) {
          return serializeProviderFailure(502, "STRIPE_ACCOUNT_LINK_MISSING_URL", "Failed to create onboarding link.");
        }
        return { status: 200, code: "STRIPE_ONBOARDING_READY", message: "Stripe onboarding is ready.", accountIdPresent: true, onboardingUrl: link.url };
      } catch {
        return serializeProviderFailure(502, "DRIVER_STRIPE_ACCOUNT_LINK_REJECTED", "Failed to create onboarding link.");
      }
    });
  }

  const external = {
    database() { calls.database += 1; throw new Error("unexpected database access"); },
    stripeTransfer() { calls.stripeTransfer += 1; throw new Error("unexpected Stripe transfer"); },
    wallet() { calls.wallet += 1; throw new Error("unexpected wallet execution"); },
    payout() { calls.payout += 1; throw new Error("unexpected payout execution"); },
  };

  return {
    calls,
    onboard,
    external,
    get storedAccountId() { return storedAccountId; },
    setStoredAccount: (accountId: string | null) => { storedAccountId = accountId; },
    failCreate: (error: ProviderError | null) => { createFailure = error; },
    failLink: (error: ProviderError | null) => { linkFailure = error; },
    setMalformedCreate: (value: boolean) => { malformedCreate = value; },
    setMalformedLink: (value: boolean) => { malformedLink = value; },
    setInvalidStoredAccount: (value: boolean) => { invalidStoredAccount = value; },
    setReconciliationFailure: (value: boolean) => { reconciliationFailure = value; },
  };
}

function assertSafe(result: Result, code: string) {
  assert.equal(result.code, code);
  assert.doesNotMatch(result.message, /acct_|secret|stack|provider|raw/i);
  assert.equal(Object.hasOwn(result, "error"), false);
  assert.equal(Object.hasOwn(result, "details"), false);
}

test("authenticated driver identity is authoritative and client driver IDs cannot redirect onboarding", async () => {
  const state = createFixture();
  const result = await state.onboard({ authenticated: true, role: "driver", driverId: "another-driver" });
  assert.equal(result.status, 200);
  assert.equal(state.storedAccountId, "acct_canonical_1");
  assert.equal(state.calls.driverLookup, 1);
  assert.equal(state.calls.accountCreate, 1);
});

test("authentication and driver-role failures have stable, sanitized semantics", async () => {
  const state = createFixture();
  const unauthenticated = await state.onboard();
  assert.equal(unauthenticated.status, 401);
  assertSafe(unauthenticated, "AUTHENTICATION_REQUIRED");
  const owner = await state.onboard({ authenticated: true, role: "owner" });
  assert.equal(owner.status, 403);
  assertSafe(owner, "DRIVER_ACCESS_REQUIRED");
});

test("a new account is associated atomically and an existing valid account is reused after validation", async () => {
  const state = createFixture();
  await state.onboard({ authenticated: true });
  const again = await state.onboard({ authenticated: true });
  assert.equal(again.status, 200);
  assert.equal(state.calls.accountCreate, 1);
  assert.equal(state.calls.associationWrite, 1);
  assert.equal(state.calls.accountRetrieve, 1);
  assert.equal(state.storedAccountId, "acct_canonical_1");
});

test("account creation rejects malformed and provider failures without a partial durable association", async () => {
  const malformed = createFixture();
  malformed.setMalformedCreate(true);
  const malformedResult = await malformed.onboard({ authenticated: true });
  assertSafe(malformedResult, "DRIVER_STRIPE_ACCOUNT_CREATE_REJECTED");
  assert.equal(malformed.storedAccountId, null);
  const rejected = createFixture();
  rejected.failCreate({ code: "invalid_request_error", message: "raw provider request details" });
  const rejectedResult = await rejected.onboard({ authenticated: true });
  assertSafe(rejectedResult, "DRIVER_STRIPE_ACCOUNT_CREATE_REJECTED");
  assert.equal(rejected.storedAccountId, null);
});

test("link creation succeeds only for a valid account and provider errors are sanitized with stable codes", async () => {
  const state = createFixture();
  state.setStoredAccount("acct_canonical_1");
  const success = await state.onboard({ authenticated: true });
  assert.equal(success.onboardingUrl, "https://connect.stripe.test/acct_canonical_1");
  state.failLink({ code: "api_error", message: "raw Stripe account link failure" });
  const failed = await state.onboard({ authenticated: true });
  assertSafe(failed, "DRIVER_STRIPE_ACCOUNT_LINK_REJECTED");
  state.failLink(null);
  state.setMalformedLink(true);
  const missing = await state.onboard({ authenticated: true });
  assertSafe(missing, "STRIPE_ACCOUNT_LINK_MISSING_URL");
});

test("invalid stored accounts and reconciliation failures are unavailable rather than silently reused", async () => {
  const invalid = createFixture();
  invalid.setStoredAccount("acct_canonical_1");
  invalid.setInvalidStoredAccount(true);
  const invalidResult = await invalid.onboard({ authenticated: true });
  assert.equal(invalidResult.status, 422);
  assertSafe(invalidResult, "STRIPE_ACCOUNT_INVALID");
  const unavailable = createFixture();
  unavailable.setReconciliationFailure(true);
  const unavailableResult = await unavailable.onboard({ authenticated: true });
  assert.equal(unavailableResult.status, 503);
  assertSafe(unavailableResult, "STRIPE_STATUS_UNAVAILABLE");
});

test("concurrent onboarding converges on one durable association and stale writes cannot overwrite it", async () => {
  const state = createFixture();
  const [first, second] = await Promise.all([
    state.onboard({ authenticated: true }),
    state.onboard({ authenticated: true }),
  ]);
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(state.calls.accountCreate, 1);
  assert.equal(state.calls.associationWrite, 1);
  assert.equal(state.storedAccountId, "acct_canonical_1");
});

test("unexpected database, transfer, wallet, payout, and provider access fails immediately", () => {
  const state = createFixture();
  assert.throws(() => state.external.database(), /unexpected database access/);
  assert.throws(() => state.external.stripeTransfer(), /unexpected Stripe transfer/);
  assert.throws(() => state.external.wallet(), /unexpected wallet execution/);
  assert.throws(() => state.external.payout(), /unexpected payout execution/);
  assert.deepEqual(state.calls, { driverLookup: 0, accountCreate: 0, accountRetrieve: 0, accountLink: 0, associationWrite: 0, database: 1, stripeTransfer: 1, wallet: 1, payout: 1 });
});
