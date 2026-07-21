import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-only-jwt-secret-32-characters-minimum";
process.env.SESSION_SECRET = "test-only-session-secret";
process.env.DATABASE_URL = "postgres://user:pass@127.0.0.1:1/cretexchange_test";

const dashboard = readFileSync(new URL("../client/src/pages/owner/dashboard.tsx", import.meta.url), "utf8");
const routes = readFileSync(new URL("../server/routes.ts", import.meta.url), "utf8");
const storage = readFileSync(new URL("../server/storage.ts", import.meta.url), "utf8");
const serviceWorker = readFileSync(new URL("../client/public/sw.js", import.meta.url), "utf8");
const migration = readFileSync(new URL("../migrations/0031_add_owner_activity_approval_intents_and_audit.sql", import.meta.url), "utf8");
const auth = readFileSync(new URL("../server/tokenAuth.ts", import.meta.url), "utf8");
const authVersionMigration = readFileSync(new URL("../migrations/0032_add_user_auth_token_version.sql", import.meta.url), "utf8");
const { storage: runtimeStorage } = await import("../server/storage");
const { registerRoutes } = await import("../server/routes");

function routeSection(start: string, end: string) {
  const from = routes.indexOf(start);
  assert.notEqual(from, -1, `missing ${start}`);
  const to = routes.indexOf(end, from + start.length);
  assert.notEqual(to, -1, `missing ${end}`);
  return routes.slice(from, to);
}

type Route = (req: any, res: any) => Promise<unknown>;

function routeRegistry() {
  const posts = new Map<string, Route>();
  const puts = new Map<string, Route>();
  return {
    app: {
      get() {}, patch() {}, delete() {}, use() {},
      post(path: string, ...handlers: Route[]) { posts.set(path, handlers.at(-1)!); },
      put(path: string, ...handlers: Route[]) { puts.set(path, handlers.at(-1)!); },
    },
    posts,
    puts,
  };
}

function response() {
  return {
    statusCode: 200,
    body: undefined as unknown,
    headers: new Map<string, string>(),
    status(code: number) { this.statusCode = code; return this; },
    json(body: unknown) { this.body = body; return this; },
    setHeader(key: string, value: string) { this.headers.set(key, value); },
  };
}

async function withStoragePatch(patch: Record<string, unknown>, run: () => Promise<void>) {
  const originals = new Map<string, unknown>();
  for (const [key, value] of Object.entries(patch)) {
    originals.set(key, (runtimeStorage as any)[key]);
    (runtimeStorage as any)[key] = value;
  }
  try { await run(); } finally {
    for (const [key, value] of originals) (runtimeStorage as any)[key] = value;
  }
}

test("dashboard load, refresh, photo access, and modal state do not invoke Verify", () => {
  const mutation = dashboard.slice(dashboard.indexOf("const approveMutation"), dashboard.indexOf("const rejectMutation"));
  const refreshes = dashboard.slice(dashboard.indexOf("const { data: dashboardData"), dashboard.indexOf("const approveMutation"));
  const photoButtons = dashboard.slice(dashboard.indexOf("button-view-photos"), dashboard.indexOf("button-confirm-approve"));

  assert.match(mutation, /retry:\s*false/);
  assert.match(mutation, /intentToken/);
  assert.match(mutation, /actionSource:\s*"owner-dashboard-button"/);
  assert.match(mutation, /confirmationAcknowledged:\s*true/);
  assert.doesNotMatch(refreshes, /approveMutation\.mutate/);
  assert.doesNotMatch(photoButtons, /approveMutation\.mutate/);
  assert.match(dashboard, /const openApprovalDialog = async/);
  assert.match(dashboard, /button-confirm-approve/);
});

test("only the explicit confirmation UI sends a Verify request", () => {
  const confirmation = dashboard.slice(dashboard.indexOf("const submitApproval"), dashboard.indexOf("const rejectMutation"));
  const verifyCalls = [...dashboard.matchAll(/approveMutation\.mutate\(/g)];
  assert.equal(verifyCalls.length, 1);
  assert.match(confirmation, /if \(!approvalTarget \|\| approveMutation\.isPending\) return/);
  assert.match(confirmation, /intentToken: approvalTarget\.intentToken/);
});

test("the Verify route rejects an empty or ambiguous approval before transition", () => {
  const verifyRoute = routeSection("app.put('/api/owners/activities/:id/verify'", "app.put('/api/owners/activities/:id/reject'");
  assert.match(verifyRoute, /ownerApprovalIntentRequestSchema\.safeParse\(req\.body\)/);
  assert.match(verifyRoute, /WASHOUT_APPROVAL_INTENT_REQUIRED/);
  assert.match(routes, /confirmationAcknowledged: z\.literal\(true\)/);
  assert.match(routes, /actionSource: z\.literal\("owner-dashboard-button"\)/);
  assert.match(verifyRoute, /activityDetails\.status !== "pending"/);
});

test("approval intent is one-time, owner-bound, pending-only, and recorded atomically", () => {
  const intentRoute = routeSection("app.post('/api/owners/activities/:id/approval-intent'", "app.put('/api/owners/activities/:id/verify'");
  const transition = storage.slice(storage.indexOf("async verifyWashoutActivityWithApprovalIntent"), storage.indexOf("async rejectPendingWashoutActivityForOwner"));

  assert.match(intentRoute, /req\.user\?\.role !== "owner"/);
  assert.match(intentRoute, /activity\.status !== "pending"/);
  assert.match(intentRoute, /location\.ownerId !== owner\.id/);
  assert.match(intentRoute, /randomBytes\(32\)/);
  assert.match(intentRoute, /tokenHash: approvalAuditFingerprint\(intentToken\)/);
  assert.match(transition, /db\.transaction/);
  assert.match(transition, /isNull\(ownerActivityApprovalIntents\.consumedAt\)/);
  assert.match(transition, /gt\(ownerActivityApprovalIntents\.expiresAt, now\)/);
  assert.match(transition, /WASHOUT_APPROVAL_INTENT_INVALID/);
  assert.match(transition, /eq\(washoutActivities\.status, "pending"\)/);
  assert.match(transition, /washoutActivityReviewEvents/);
});

test("replayed confirmations and wrong-owner requests are rejected without provider execution", () => {
  const verifyRoute = routeSection("app.put('/api/owners/activities/:id/verify'", "app.put('/api/owners/activities/:id/reject'");
  const intentRoute = routeSection("app.post('/api/owners/activities/:id/approval-intent'", "app.put('/api/owners/activities/:id/verify'");
  for (const source of [verifyRoute, intentRoute]) {
    assert.match(source, /ownerId !== owner\.id/);
    for (const forbidden of ["charges.create", "transfers.create", "payouts.create", "paymentIntents", "createWallet", "createWithdrawal("]) {
      assert.doesNotMatch(source, new RegExp(forbidden.replace(/[.()]/g, "\\$&")));
    }
  }
  assert.match(verifyRoute, /WASHOUT_APPROVAL_INTENT_INVALID/);
});

test("runtime routes issue owner-bound intents and reject a replay without changing state", { concurrency: false }, async () => {
  const { app, posts, puts } = routeRegistry();
  await registerRoutes(app as never);
  const issueIntent = posts.get("/api/owners/activities/:id/approval-intent");
  const verify = puts.get("/api/owners/activities/:id/verify");
  assert.equal(typeof issueIntent, "function");
  assert.equal(typeof verify, "function");

  const pending = { id: "activity-1", status: "pending", locationId: "location-1", driverId: "driver-1" };
  let createdIntent: any;
  let consumedIntent: any;
  const replayError = Object.assign(new Error("already used"), { code: "WASHOUT_APPROVAL_INTENT_INVALID" });

  await withStoragePatch({
    getOwner: async () => ({ id: "owner-1", userId: "owner-user-1" }),
    getWashoutActivity: async () => pending,
    getWashoutLocation: async () => ({ id: "location-1", ownerId: "owner-1" }),
    createOwnerActivityApprovalIntent: async (input: unknown) => { createdIntent = input; },
    verifyWashoutActivityWithApprovalIntent: async (input: unknown) => { consumedIntent = input; throw replayError; },
  }, async () => {
    const intentResponse = response();
    await issueIntent!({ params: { id: pending.id }, user: { id: "owner-user-1", role: "owner" } }, intentResponse);
    assert.equal(intentResponse.statusCode, 201);
    assert.equal(typeof (intentResponse.body as any).intentToken, "string");
    assert.notEqual(createdIntent.tokenHash, (intentResponse.body as any).intentToken);
    assert.equal(createdIntent.ownerId, "owner-1");

    const verifyResponse = response();
    await verify!({
      params: { id: pending.id },
      user: { id: "owner-user-1", role: "owner" },
      body: { intentToken: (intentResponse.body as any).intentToken, actionSource: "owner-dashboard-button", confirmationAcknowledged: true },
      headers: { authorization: "Bearer test-token", "user-agent": "test-agent", origin: "https://example.test", referer: "https://example.test/owner/dashboard?secret=ignored" },
      ip: "127.0.0.1",
    }, verifyResponse);
    assert.equal(verifyResponse.statusCode, 409);
    assert.equal((verifyResponse.body as any).code, "WASHOUT_APPROVAL_INTENT_INVALID");
    assert.equal(consumedIntent.ownerId, "owner-1");
    assert.equal(consumedIntent.actionSource, "owner-dashboard-button");
    assert.equal(consumedIntent.confirmationAcknowledged, true);
    assert.match(consumedIntent.authSessionFingerprint, /^[a-f0-9]{64}$/);
    assert.equal(consumedIntent.origin, "https://example.test/");
    assert.equal(consumedIntent.referer, "https://example.test/owner/dashboard");
  });
});

test("audit metadata is safe, fingerprinted, and never stores raw credentials", () => {
  assert.match(migration, /auth_session_fingerprint varchar NOT NULL/);
  assert.match(migration, /user_agent_fingerprint varchar/);
  assert.match(migration, /ip_fingerprint varchar/);
  assert.match(migration, /origin varchar/);
  assert.match(migration, /referer varchar/);
  assert.match(migration, /deployed_commit varchar/);
  assert.match(migration, /confirmation_acknowledged boolean NOT NULL DEFAULT false/);
  assert.doesNotMatch(migration, /bearer_token|authorization_header|raw_ip|user_agent text/i);
  assert.match(routes, /createHmac\("sha256", getJwtSecret\(\)\)/);
  assert.match(routes, /res\.setHeader\?\.\("X-Request-ID", requestId\)/);
});

test("service worker never caches, queues, or replays owner approval mutations", () => {
  assert.match(serviceWorker, /if \(isIcon\)/);
  assert.match(serviceWorker, /All other requests: normal network \(no caching\)/);
  assert.doesNotMatch(serviceWorker, /registration\.sync|SyncManager|event\.request\.method|workbox/i);
});

test("a per-user token version permits targeted session invalidation before retesting", () => {
  assert.match(authVersionMigration, /ADD COLUMN IF NOT EXISTS auth_token_version integer NOT NULL DEFAULT 0/);
  assert.match(auth, /authTokenVersion: user\.authTokenVersion \?\? 0/);
  assert.match(auth, /decoded\.authTokenVersion \?\? 0\) !== \(user\.authTokenVersion \?\? 0\)/);
  assert.match(auth, /Your session has expired\. Please sign in again\./);
});
