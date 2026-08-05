import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

type Test = { name: string; run: () => void | Promise<void> };
const tests: Test[] = [];
function test(name: string, run: Test["run"]) {
  tests.push({ name, run });
}

const routesPath = fileURLToPath(new URL("../server/routes.ts", import.meta.url));
const routesSource = readFileSync(routesPath, "utf8");

function routeBlock(start: string, end: string): string {
  const startIndex = routesSource.indexOf(start);
  assert.notEqual(startIndex, -1, `Missing route marker: ${start}`);
  const endIndex = routesSource.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, `Missing end marker: ${end}`);
  return routesSource.slice(startIndex, endIndex);
}

test("all migrated driver Stripe routes require authentication", () => {
  for (const route of [
    "app.get('/api/drivers/stripe-onboarding', isAuthenticated",
    "app.get('/api/drivers/stripe-status', isAuthenticated",
    "app.get('/api/drivers/stripe-requirements', isAuthenticated",
    "app.get('/api/column/status', isAuthenticated",
    "app.get('/api/stripe/connect/account-status', isAuthenticated",
    "app.post('/api/stripe/connect/create-account', isAuthenticated",
  ]) {
    assert.ok(routesSource.includes(route), route);
  }
});

test("canonical status endpoint enforces driver role and performs no reconciliation writes", () => {
  const block = routeBlock(
    "app.get('/api/drivers/stripe-status'",
    "// GET /api/drivers/stripe-requirements",
  );
  assert.match(block, /user\.role !== 'driver'/);
  assert.match(block, /canonicalDriverStripeService\.getDriverStripeStatus/);
  assert.match(block, /buildDriverStripeStatusApiResponse/);
  assert.doesNotMatch(block, /syncDriverStripeConnectAccountFieldsFromUser/);
  assert.doesNotMatch(block, /executeDriverStripeReconciliation|reconcileDriverStripeAccountIds|updateUserStripeInfo|updateDriver/);
});

test("requirements adapter uses canonical resolution and safe requirement keys", () => {
  const block = routeBlock(
    "app.get('/api/drivers/stripe-requirements'",
    "// GET /api/owners/stripe-onboarding",
  );
  assert.match(block, /canonicalDriverStripeService\.getDriverStripeStatus/);
  assert.match(block, /status\.requirementsDue/);
  assert.match(block, /status\.requirementsPastDue/);
  assert.doesNotMatch(block, /stripe\.accounts\.retrieve|user\.stripeConnectAccountId \|\|/);
});

test("legacy account-status is a thin payout-readiness adapter", () => {
  const block = routeBlock(
    "app.get('/api/stripe/connect/account-status'",
    "// Stripe Connect webhook handler",
  );
  assert.match(block, /canonicalDriverStripeService\.getDriverStripeStatus/);
  assert.match(block, /buildLegacyDriverStripeAccountStatusResponse/);
  assert.doesNotMatch(block, /driver\.connectedAccountId|charges_enabled|stripe\.accounts\.retrieve/);
});

test("Column driver status uses canonical Connect readiness and keeps Treasury separate", () => {
  const block = routeBlock(
    "app.get('/api/column/status'",
    "// Generate fresh Account Link for Treasury setup",
  );
  assert.match(block, /canonicalDriverStripeService\.getDriverStripeStatus/);
  assert.match(block, /buildDriverColumnStatusResponse\(status, driver\.stripeTreasuryAccountId\)/);
  assert.doesNotMatch(block, /syncDriverStripeConnectAccountFieldsFromUser/);
});

test("onboarding resolves safely before link generation", () => {
  const block = routeBlock(
    "async function handleDriverStripeOnboarding",
    "app.get('/api/drivers/stripe-onboarding'",
  );
  assert.match(block, /user\.role !== 'driver'/);
  assert.match(block, /withDriverStripeOnboardingLock/);
  assert.match(block, /safelyResolveDriverStripeOnboardingAccount/);
  assert.match(block, /if \(resolvedStatus\.payoutReady\)/);
  assert.match(block, /createDriverStripeOnboardingLink\(req, accountResult\.accountId\)/);
  assert.doesNotMatch(block, /createDriverStripePayoutAccount|syncDriverStripeConnectAccountFieldsFromUser/);
});

test("creation safeguard performs final reread, second resolution, and idempotent creation", () => {
  const block = routeBlock(
    "async function safelyResolveDriverStripeOnboardingAccount",
    "/**\n * Validate that an IP string",
  );
  assert.match(block, /coordinateDriverStripeOnboarding/);
  assert.match(block, /storage\.getUser/);
  assert.match(block, /storage\.getDriver/);
  assert.match(block, /stripe\.accounts\.create/);
  assert.equal((block.match(/stripe\.accounts\.create/g) || []).length, 1);
  assert.match(block, /idempotencyKey: `driver-connect-account-\$\{decision\.user\.id\}`/);
  assert.match(block, /executeDriverStripeReconciliation/);
});

test("legacy create and onboarding-link routes cannot bypass canonical safeguards", () => {
  const createBlock = routeBlock(
    "app.post('/api/stripe/connect/create-account'",
    "// Get Stripe Connect onboarding link for driver",
  );
  assert.match(createBlock, /safelyResolveDriverStripeOnboardingAccount/);
  assert.doesNotMatch(createBlock, /stripe\.accounts\.create|createDriverStripePayoutAccount/);

  const linkBlock = routeBlock(
    "app.get('/api/stripe/connect/onboarding-link'",
    "// Deprecated independent status logic",
  );
  assert.match(linkBlock, /handleDriverStripeOnboarding/);
  assert.doesNotMatch(linkBlock, /driver\.connectedAccountId|stripe\.accounts\.retrieve/);
});

test("legacy Column onboarding delegates driver requests to guarded onboarding", () => {
  const block = routeBlock(
    "app.post('/api/column/onboard'",
    "// Driver payout request endpoint",
  );
  assert.match(block, /if \(user\.role === 'driver'\)/);
  assert.match(block, /return handleDriverStripeOnboarding\(req, res\)/);
});

test("debit-card setup cannot bypass canonical Connect resolution", () => {
  const block = routeBlock(
    "app.post('/api/drivers/request-debit-card'",
    "// Create Stripe payment intent for $15.00 membership fee",
  );
  assert.match(block, /safelyResolveDriverStripeOnboardingAccount/);
  assert.doesNotMatch(block, /createDriverStripePayoutAccount/);
});

test("migrated endpoints enforce auth and use mocked canonical Stripe behavior over HTTP", async () => {
  process.env.DATABASE_URL ||= "postgresql://user:pass@127.0.0.1:1/test?sslmode=disable";
  process.env.JWT_SECRET ||= "test-driver-stripe-route-secret-1234567890";
  process.env.STRIPE_SECRET_KEY ||= "sk_test_driver_stripe_route_harness";
  process.env.NODE_ENV = "test";

  const [{ default: express }, { default: jwt }, { registerRoutes }, { storage }, stripeModule] = await Promise.all([
    import("express"),
    import("jsonwebtoken"),
    import("../server/routes"),
    import("../server/storage"),
    import("../server/stripeService"),
  ]);
  const stripe = stripeModule.stripe as any;

  let currentUser: any;
  let currentDriver: any;
  let accountOverrides: Record<string, unknown> = {};
  let stripeUnavailable = false;
  let reconciliationCalls = 0;
  let accountCreateCalls = 0;
  let accountLinkCalls = 0;
  let lastIdempotencyKey: string | undefined;

  const resetDriver = (params: {
    userAccountId?: string | null;
    driverAccountId?: string | null;
    legacyAccountId?: string | null;
    treasuryAccountId?: string | null;
  } = {}) => {
    currentUser = {
      id: "user_http_md1",
      username: "MD1",
      email: "md1@example.com",
      role: "driver",
      isActive: true,
      stripeConnectAccountId: params.userAccountId ?? null,
    };
    currentDriver = {
      id: "driver_http_md1",
      userId: currentUser.id,
      stripeConnectAccountId: params.driverAccountId ?? null,
      connectedAccountId: params.legacyAccountId ?? null,
      stripeTreasuryAccountId: params.treasuryAccountId ?? null,
    };
    accountOverrides = {};
    stripeUnavailable = false;
  };
  resetDriver();

  (storage as any).getUserById = async () => currentUser;
  (storage as any).getUser = async () => currentUser;
  (storage as any).getDriver = async () => currentDriver;
  (storage as any).getFeatureFlag = async () => ({ enabled: true, allowedRoles: ["driver"] });
  (storage as any).getFeatureFlagOverride = async () => null;
  (storage as any).reconcileDriverStripeAccountIds = async ({ expectedAccountId }: { expectedAccountId: string }) => {
    reconciliationCalls += 1;
    const values = [
      currentUser.stripeConnectAccountId,
      currentDriver.stripeConnectAccountId,
      currentDriver.connectedAccountId,
    ].filter(Boolean);
    if (values.some((value) => value !== expectedAccountId)) {
      return { conflict: true, updatedFields: [] };
    }
    const updatedFields: string[] = [];
    if (!currentUser.stripeConnectAccountId) {
      currentUser.stripeConnectAccountId = expectedAccountId;
      updatedFields.push("users.stripeConnectAccountId");
    }
    if (!currentDriver.stripeConnectAccountId) {
      currentDriver.stripeConnectAccountId = expectedAccountId;
      updatedFields.push("drivers.stripeConnectAccountId");
    }
    if (!currentDriver.connectedAccountId) {
      currentDriver.connectedAccountId = expectedAccountId;
      updatedFields.push("drivers.connectedAccountId");
    }
    return { conflict: false, updatedFields };
  };

  const stripeAccounts = {
    retrieve: async (accountId: string) => {
      if (stripeUnavailable) {
        throw Object.assign(new Error("mock Stripe unavailable"), { code: "api_connection_error" });
      }
      return {
        id: accountId,
        email: currentUser.email,
        metadata: { userId: currentUser.id, driverId: currentDriver.id },
        details_submitted: true,
        payouts_enabled: true,
        charges_enabled: false,
        capabilities: { transfers: "active" },
        requirements: { currently_due: [], past_due: [] },
        external_accounts: { data: [{ object: "bank_account" }], total_count: 1 },
        ...accountOverrides,
      };
    },
    list: async () => ({ data: [], has_more: false }),
    create: async (_params: unknown, options: { idempotencyKey?: string }) => {
      accountCreateCalls += 1;
      lastIdempotencyKey = options?.idempotencyKey;
      return stripeAccounts.retrieve("acct_mock_created");
    },
  };
  stripe.accounts = stripeAccounts;
  stripe.accountLinks = {
    create: async ({ account }: { account: string }) => {
      accountLinkCalls += 1;
      return { url: `https://connect.stripe.test/${account}`, expires_at: 1234567890 };
    },
  };

  const app = express();
  app.use(express.json());
  const server = await registerRoutes(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const token = () => jwt.sign(
    { userId: currentUser.id, username: currentUser.username },
    process.env.JWT_SECRET!,
  );
  const get = async (path: string, authenticated = true) => {
    const response = await fetch(`${baseUrl}${path}`, {
      headers: authenticated ? { Authorization: `Bearer ${token()}` } : {},
    });
    return { response, body: await response.json() as any };
  };

  try {
    const unauthenticated = await get("/api/drivers/stripe-status", false);
    assert.equal(unauthenticated.response.status, 401);

    currentUser = { ...currentUser, role: "owner" };
    const wrongRole = await get("/api/drivers/stripe-status");
    assert.equal(wrongRole.response.status, 403);

    for (const candidate of [
      { userAccountId: "acct_user" },
      { driverAccountId: "acct_driver" },
      { legacyAccountId: "acct_legacy" },
      { userAccountId: "acct_same", driverAccountId: "acct_same", legacyAccountId: "acct_same" },
    ]) {
      resetDriver(candidate);
      const result = await get("/api/drivers/stripe-status");
      assert.equal(result.response.status, 200);
      assert.equal(result.body.status, "payout_ready");
      assert.equal(result.body.chargesEnabled, false);
    }
    assert.equal(reconciliationCalls, 0, "normal status GETs must not reconcile");

    resetDriver({ userAccountId: "acct_one", driverAccountId: "acct_two" });
    const conflict = await get("/api/drivers/stripe-status");
    assert.equal(conflict.body.status, "account_conflict");

    resetDriver({ userAccountId: "acct_unavailable" });
    stripeUnavailable = true;
    const unavailable = await get("/api/drivers/stripe-status");
    assert.equal(unavailable.body.status, "status_unavailable");
    assert.equal(unavailable.body.errorState.code, "STRIPE_STATUS_UNAVAILABLE");

    resetDriver({ userAccountId: "acct_action" });
    accountOverrides = {
      payouts_enabled: false,
      requirements: { currently_due: ["individual.verification.document"], past_due: [] },
    };
    const actionRequired = await get("/api/drivers/stripe-status");
    assert.equal(actionRequired.body.status, "action_required");
    const requirements = await get("/api/drivers/stripe-requirements");
    assert.deepEqual(requirements.body.requirements.currently_due, ["individual.verification.document"]);

    resetDriver({ userAccountId: "acct_ready", treasuryAccountId: "fa_treasury" });
    const legacyStatus = await get("/api/stripe/connect/account-status");
    assert.equal(legacyStatus.body.status, "active");
    assert.equal(legacyStatus.body.chargesEnabled, false);
    const columnStatus = await get("/api/column/status");
    assert.equal(columnStatus.body.stripePayoutReady, true);
    assert.equal(columnStatus.body.treasuryAccountPresent, true);

    resetDriver({ userAccountId: "acct_existing_action" });
    accountOverrides = { payouts_enabled: false };
    const reconciliationBeforeReuse = reconciliationCalls;
    const linksBeforeReuse = accountLinkCalls;
    const existingOnboarding = await get("/api/drivers/stripe-onboarding");
    assert.equal(existingOnboarding.response.status, 200);
    assert.equal(existingOnboarding.body.accountReused, true);
    assert.equal(existingOnboarding.body.onboardingLinkGenerated, true);
    assert.equal(accountCreateCalls, 0);
    assert.equal(reconciliationCalls, reconciliationBeforeReuse + 1);
    assert.equal(accountLinkCalls, linksBeforeReuse + 1);

    resetDriver();
    accountOverrides = { details_submitted: false, payouts_enabled: false };
    const creation = await get("/api/drivers/stripe-onboarding");
    assert.equal(creation.response.status, 200);
    assert.equal(creation.body.accountCreated, true);
    assert.equal(accountCreateCalls, 1);
    assert.equal(lastIdempotencyKey, `driver-connect-account-${currentUser.id}`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
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
  process.exit(1);
} else {
  console.log(`\n${tests.length} Driver Stripe endpoint tests passed.`);
  process.exit(0);
}
