import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-only-jwt-secret-32-characters-minimum";
process.env.SESSION_SECRET = "test-only-session-secret";
process.env.DATABASE_URL = "postgres://user:pass@127.0.0.1:1/cretexchange_test";
process.env.STRIPE_SECRET_KEY = "sk_test_unit_test_secret";
process.env.PRIVATE_OBJECT_DIR = "private";
process.env.PUBLIC_OBJECT_SEARCH_PATHS = "public";

type Route = (req: any, res: any) => Promise<unknown>;

const { storage } = await import("../server/storage");
const { registerRoutes } = await import("../server/routes");
const { stripe } = await import("../server/stripeService");
const { isAuthenticated } = await import("../server/tokenAuth");

function createRouteRegistry() {
  const puts = new Map<string, Route>();
  const app = {
    get() {},
    post() {},
    put(path: string, ...handlers: Route[]) {
      puts.set(path, handlers[handlers.length - 1]);
    },
    delete() {},
    patch() {},
    use() {},
  };
  return { app, puts };
}

function createResponse() {
  return {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
  };
}

async function withStoragePatch(patch: Record<string, unknown>, run: () => Promise<void>) {
  const originals = new Map<string, unknown>();
  for (const [key, value] of Object.entries(patch)) {
    originals.set(key, storage[key]);
    storage[key] = value;
  }
  try {
    await run();
  } finally {
    for (const [key, value] of originals) storage[key] = value;
  }
}

async function getOwnerVerifyRoute(): Promise<Route> {
  const { app, puts } = createRouteRegistry();
  await registerRoutes(app as never);
  const route = puts.get("/api/owners/activities/:id/verify");
  assert.equal(typeof route, "function");
  return route!;
}

function pendingActivity(status = "pending") {
  return {
    id: "activity_1",
    locationId: "location_1",
    driverId: "driver_1",
    status,
    amount: "1.00",
    serviceType: "washout",
  };
}

function ownerPatch(overrides: Record<string, unknown> = {}) {
  return {
    getOwner: async () => ({ id: "owner_1", userId: "owner_user_1" }),
    getWashoutActivity: async () => pendingActivity(),
    getWashoutLocation: async () => ({ id: "location_1", ownerId: "owner_1", rate: "999.00" }),
    getFeatureFlag: async () => ({ enabled: false }),
    verifyWashoutActivity: async () => ({ ...pendingActivity(), status: "verified" }),
    ...overrides,
  };
}

function financialSpies() {
  const calls = {
    payment: 0,
    paymentCompletion: 0,
    billing: 0,
    ownerWallet: 0,
    driverWallet: 0,
    withdrawal: 0,
    notification: 0,
    stripe: 0,
  };
  const paymentIntents = (stripe as any)?.paymentIntents;
  const originalStripeCreate = paymentIntents?.create;
  if (paymentIntents) {
    paymentIntents.create = async () => {
      calls.stripe += 1;
      throw new Error("Stripe must not run during verification");
    };
  }
  return {
    calls,
    patch: {
      createPayment: async () => { calls.payment += 1; throw new Error("payment write"); },
      updatePaymentStatus: async () => { calls.paymentCompletion += 1; throw new Error("payment completion"); },
      processDailyBatches: async () => { calls.billing += 1; throw new Error("billing execution"); },
      createBillingBatch: async () => { calls.billing += 1; throw new Error("billing batch"); },
      adjustDriverWalletBalance: async () => { calls.driverWallet += 1; throw new Error("driver wallet"); },
      createWalletTransaction: async () => { calls.driverWallet += 1; throw new Error("driver wallet transaction"); },
      createOwnerWalletTransaction: async () => { calls.ownerWallet += 1; throw new Error("owner wallet"); },
      createWithdrawal: async () => { calls.withdrawal += 1; throw new Error("withdrawal"); },
      createNotification: async () => { calls.notification += 1; throw new Error("notification"); },
    },
    restore() {
      if (paymentIntents) paymentIntents.create = originalStripeCreate;
    },
  };
}

function assertNoFinancialCalls(calls: ReturnType<typeof financialSpies>["calls"]) {
  assert.deepEqual(calls, {
    payment: 0,
    paymentCompletion: 0,
    billing: 0,
    ownerWallet: 0,
    driverWallet: 0,
    withdrawal: 0,
    notification: 0,
    stripe: 0,
  });
}

test("owner verification requires the authenticated owner route and contains no financial execution", { concurrency: false }, () => {
  const source = readFileSync(new URL("../server/routes.ts", import.meta.url), "utf8");
  const handler = source.slice(
    source.indexOf("app.put('/api/owners/activities/:id/verify', isAuthenticated"),
    source.indexOf("app.put('/api/owners/activities/:id/reject'"),
  );
  assert.match(handler, /isAuthenticated/);
  for (const forbidden of [
    "paymentIntents.create",
    "paymentIntents.confirm",
    "charges.create",
    "transfers.create",
    "payouts.create",
    "createPayment(",
    "adjustDriverWalletBalance",
    "createWalletTransaction",
    "processOwnerBillingRun",
  ]) assert.doesNotMatch(handler, new RegExp(forbidden.replace(/[.()]/g, "\\$&")));
});

test("owner verification authentication middleware denies an unauthenticated request", { concurrency: false }, async () => {
  const response = createResponse();
  let nextCalled = false;
  await isAuthenticated(
    { method: "PUT", path: "/api/owners/activities/activity_1/verify", headers: {} } as any,
    response as any,
    () => { nextCalled = true; },
  );
  assert.equal(response.statusCode, 401);
  assert.equal(nextCalled, false);
});

test("owner verification enforces owner ownership and returns only an operational result", { concurrency: false }, async () => {
  const route = await getOwnerVerifyRoute();
  const spies = financialSpies();
  try {
    await withStoragePatch(ownerPatch({ ...spies.patch }), async () => {
      const response = createResponse();
      await route({ params: { id: "activity_1" }, user: { id: "owner_user_1" } }, response);
      assert.equal(response.statusCode, 200);
      assert.equal((response.body as any).status, "verified");
      assert.match((response.body as any).message, /payment information is handled separately/i);
      assert.doesNotMatch((response.body as any).message, /paid|scheduled|settled|wallet|funds available/i);
      assert.equal((response.body as any).paymentStatus, undefined);
      assertNoFinancialCalls(spies.calls);
    });

    await withStoragePatch(ownerPatch({ getOwner: async () => undefined, ...spies.patch }), async () => {
      const response = createResponse();
      await route({ params: { id: "activity_1" }, user: { id: "missing_owner" } }, response);
      assert.equal(response.statusCode, 404);
    });

    await withStoragePatch(ownerPatch({ getWashoutActivity: async () => undefined, ...spies.patch }), async () => {
      const response = createResponse();
      await route({ params: { id: "missing_activity" }, user: { id: "owner_user_1" } }, response);
      assert.equal(response.statusCode, 404);
    });

    await withStoragePatch(ownerPatch({
      getWashoutLocation: async () => ({ id: "location_1", ownerId: "other_owner" }),
      ...spies.patch,
    }), async () => {
      const response = createResponse();
      await route({ params: { id: "activity_1" }, user: { id: "owner_user_1" } }, response);
      assert.equal(response.statusCode, 403);
    });
  } finally {
    spies.restore();
  }
});

test("only pending activities transition and a concurrent claimant receives conflict", { concurrency: false }, async () => {
  const route = await getOwnerVerifyRoute();
  for (const status of ["verified", "rejected"]) {
    await withStoragePatch(ownerPatch({ getWashoutActivity: async () => pendingActivity(status) }), async () => {
      const response = createResponse();
      await route({ params: { id: "activity_1" }, user: { id: "owner_user_1" } }, response);
      assert.equal(response.statusCode, 409);
    });
  }

  let claimed = false;
  const spies = financialSpies();
  try {
    await withStoragePatch(ownerPatch({
      ...spies.patch,
      verifyWashoutActivity: async () => {
        if (claimed) {
          const error = new Error("not pending") as Error & { code?: string };
          error.code = "WASHOUT_ACTIVITY_NOT_PENDING";
          throw error;
        }
        claimed = true;
        return { ...pendingActivity(), status: "verified" };
      },
    }), async () => {
      const first = createResponse();
      const second = createResponse();
      await Promise.all([
        route({ params: { id: "activity_1" }, user: { id: "owner_user_1" } }, first),
        route({ params: { id: "activity_1" }, user: { id: "owner_user_1" } }, second),
      ]);
      assert.deepEqual([first.statusCode, second.statusCode].sort(), [200, 409]);
      assertNoFinancialCalls(spies.calls);
    });
  } finally {
    spies.restore();
  }
});

test("all billing cadences remain operational-only", { concurrency: false }, async () => {
  const route = await getOwnerVerifyRoute();
  for (const billingCadence of ["immediate", "daily", "weekly", "monthly", undefined, "malformed"] as const) {
    const spies = financialSpies();
    try {
      await withStoragePatch(ownerPatch({
        ...spies.patch,
        getOwnerBillingSettings: async () => billingCadence === undefined ? undefined : { billingCadence },
      }), async () => {
        const response = createResponse();
        await route({ params: { id: "activity_1" }, user: { id: "owner_user_1" } }, response);
        assert.equal(response.statusCode, 200, String(billingCadence));
        assertNoFinancialCalls(spies.calls);
      });
    } finally {
      spies.restore();
    }
  }
});

test("auto-approval is operational-only and a prior manual claim is safe", { concurrency: false }, async () => {
  const source = readFileSync(new URL("../server/storage.ts", import.meta.url), "utf8");
  const autoApproval = source.slice(source.indexOf("async autoApproveExpiredActivities"), source.indexOf("async createPayment"));
  for (const forbidden of ["createPayment(", "location.rate", "platformFee", "driverTip", "ownerCharge"]) {
    assert.doesNotMatch(autoApproval, new RegExp(forbidden.replace(/[.()]/g, "\\$&")));
  }

  const spies = financialSpies();
  let claimed = false;
  try {
    await withStoragePatch({
      ...spies.patch,
      getExpiredPendingActivities: async () => [{
        ...pendingActivity(),
        createdAt: new Date("2026-01-01T00:00:00Z"),
        location: { id: "location_1", name: "Facility", ownerId: "owner_1", rate: "999.00" },
        driver: { id: "driver_1", user: { firstName: "Driver", lastName: "One" } },
      }],
      getWashoutLocation: async () => ({ id: "location_1", ownerId: "owner_1", rate: "999.00" }),
      getOwnerById: async () => ({ id: "owner_1", userId: "owner_user_1" }),
      getFeatureFlag: async () => ({ enabled: false }),
      verifyWashoutActivity: async () => {
        if (claimed) {
          const error = new Error("not pending") as Error & { code?: string };
          error.code = "WASHOUT_ACTIVITY_NOT_PENDING";
          throw error;
        }
        claimed = true;
        return { ...pendingActivity(), status: "verified" };
      },
    }, async () => {
      const first = await storage.autoApproveExpiredActivities(72);
      assert.equal(first.approved, 1);
      assert.equal(first.failed, 0);
      const second = await storage.autoApproveExpiredActivities(72);
      assert.equal(second.approved, 0);
      assert.equal(second.failed, 1);
      assertNoFinancialCalls(spies.calls);
    });
  } finally {
    spies.restore();
  }
});
