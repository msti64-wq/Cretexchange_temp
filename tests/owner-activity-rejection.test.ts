import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-only-jwt-secret-32-characters-minimum";
process.env.SESSION_SECRET = "test-only-session-secret";
process.env.DATABASE_URL = "postgres://user:pass@127.0.0.1:1/cretexchange_test";

type Route = (req: any, res: any) => Promise<unknown>;
const { storage } = await import("../server/storage");
const { registerRoutes } = await import("../server/routes");
const { isAuthenticated } = await import("../server/tokenAuth");

function createRouteRegistry() {
  const puts = new Map<string, Route>();
  return {
    app: { get() {}, post() {}, delete() {}, patch() {}, use() {}, put(path: string, ...handlers: Route[]) { puts.set(path, handlers.at(-1)!); } },
    puts,
  };
}

function response() {
  return {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) { this.statusCode = code; return this; },
    json(body: unknown) { this.body = body; return this; },
  };
}

async function withStoragePatch(patch: Record<string, unknown>, run: () => Promise<void>) {
  const originals = new Map<string, unknown>();
  for (const [key, value] of Object.entries(patch)) { originals.set(key, (storage as any)[key]); (storage as any)[key] = value; }
  try { await run(); } finally { for (const [key, value] of originals) (storage as any)[key] = value; }
}

async function rejectionRoute() {
  const { app, puts } = createRouteRegistry();
  await registerRoutes(app as never);
  const route = puts.get("/api/owners/activities/:id/reject");
  assert.equal(typeof route, "function");
  return route!;
}

const pendingActivity = (overrides: Record<string, unknown> = {}) => ({
  id: "activity_1", locationId: "location_1", driverId: "driver_1", status: "pending", notes: "driver-authored note", ...overrides,
});

function ownerPatch(overrides: Record<string, unknown> = {}) {
  return {
    getOwner: async () => ({ id: "owner_1", userId: "owner_user_1" }),
    getWashoutActivity: async () => pendingActivity(),
    getWashoutLocation: async () => ({ id: "location_1", ownerId: "owner_1" }),
    rejectPendingWashoutActivityForOwner: async (input: any) => ({ ...pendingActivity(), status: "rejected", rejectionReason: input.rejectionReason, rejectedBy: input.rejectedBy, rejectedAt: new Date("2026-07-20T12:00:00.000Z") }),
    ...overrides,
  };
}

async function invoke(route: Route, body: unknown = { reason: "  duplicate photo  " }, user = { id: "owner_user_1", role: "owner" }) {
  const res = response();
  await route({ params: { id: "activity_1" }, body, user }, res);
  return res;
}

test("owner rejection requires authentication", async () => {
  const res = response();
  let next = false;
  await isAuthenticated({ method: "PUT", path: "/api/owners/activities/activity_1/reject", headers: {} } as any, res as any, () => { next = true; });
  assert.equal(res.statusCode, 401);
  assert.equal(next, false);
});

test("correct owner rejects a pending activity with server-derived audit fields", { concurrency: false }, async () => {
  const route = await rejectionRoute();
  let transitionInput: any;
  await withStoragePatch(ownerPatch({ rejectPendingWashoutActivityForOwner: async (input: any) => {
    transitionInput = input;
    return { ...pendingActivity(), status: "rejected", rejectionReason: input.rejectionReason, rejectedBy: input.rejectedBy, rejectedAt: new Date() };
  } }), async () => {
    const res = await invoke(route, { reason: "  duplicate   photo  ", rejectedBy: "client", rejectedAt: "2000-01-01", status: "verified" });
    assert.equal(res.statusCode, 200);
    assert.equal(transitionInput.ownerId, "owner_1");
    assert.equal(transitionInput.rejectedBy, "owner_user_1");
    assert.equal(transitionInput.rejectionReason, "duplicate photo");
    assert.equal(transitionInput.audit.actionSource, "owner-dashboard-rejection-dialog");
    assert.equal(transitionInput.audit.confirmationAcknowledged, true);
    assert.match(transitionInput.audit.authSessionFingerprint, /^(missing|[a-f0-9]{64})$/);
    assert.equal((res.body as any).notes, "driver-authored note");
  });
});

test("reason is required, nonblank, and no more than 500 characters", { concurrency: false }, async () => {
  const route = await rejectionRoute();
  await withStoragePatch(ownerPatch(), async () => {
    for (const body of [{}, { reason: " \n\t " }, { reason: "x".repeat(501) }]) {
      const res = await invoke(route, body);
      assert.equal(res.statusCode, 400);
    }
  });
});

test("other owners and non-owner roles cannot reject an activity", { concurrency: false }, async () => {
  const route = await rejectionRoute();
  await withStoragePatch(ownerPatch({ getWashoutLocation: async () => ({ id: "location_1", ownerId: "other_owner" }) }), async () => {
    assert.equal((await invoke(route)).statusCode, 404);
  });
  await withStoragePatch(ownerPatch({ getOwner: async () => undefined }), async () => {
    assert.equal((await invoke(route, { reason: "reason" }, { id: "driver_user", role: "driver" })).statusCode, 403);
  });
});

test("missing, approved, and already-rejected activities cannot transition", { concurrency: false }, async () => {
  const route = await rejectionRoute();
  for (const activity of [undefined, pendingActivity({ status: "verified" }), pendingActivity({ status: "rejected" })]) {
    await withStoragePatch(ownerPatch({ getWashoutActivity: async () => activity }), async () => {
      const res = await invoke(route);
      assert.equal(res.statusCode, activity ? 409 : 404);
    });
  }
});

test("compare-and-set allows only one concurrent rejection", { concurrency: false }, async () => {
  const route = await rejectionRoute();
  let claimed = false;
  await withStoragePatch(ownerPatch({ rejectPendingWashoutActivityForOwner: async (input: any) => {
    if (claimed) return undefined;
    claimed = true;
    return { ...pendingActivity(), status: "rejected", rejectionReason: input.rejectionReason };
  } }), async () => {
    const [first, second] = await Promise.all([invoke(route), invoke(route)]);
    assert.deepEqual([first.statusCode, second.statusCode].sort(), [200, 409]);
  });
});

test("dashboard rejection has one reason-only, no-retry mutation and one dialog submission path", () => {
  const source = readFileSync(new URL("../client/src/pages/owner/dashboard.tsx", import.meta.url), "utf8");
  assert.match(source, /retry: false/);
  assert.match(source, /apiRequest\("PUT", `\/api\/owners\/activities\/\$\{activityId\}\/reject`, \{ reason \}\)/);
  assert.doesNotMatch(source, /rejectMutation\.mutate\(activity\.id\)/);
  assert.match(source, /onClick=\{submitRejection\}/);
  assert.match(source, /rejectionSubmissionRef\.current/);
  assert.match(source, /disabled=\{rejectMutation\.isPending \|\| approveMutation\.isPending \|\| rejectionTarget\?\.id === activity\.id\}/);
  assert.match(source, /filterPendingWashoutApprovals\(allActivitiesData\)/);
  assert.match(source, /queryClient\.invalidateQueries\(\{ queryKey: \['\/api\/owners\/dashboard'\] \}\)/);
  assert.match(source, /startsWith\('\/api\/owners\/activities'\)/);
});

test("rejection migration and storage transition retain separate audit fields", () => {
  const migration = readFileSync(new URL("../migrations/0030_add_washout_activity_rejection_audit.sql", import.meta.url), "utf8");
  const storageSource = readFileSync(new URL("../server/storage.ts", import.meta.url), "utf8");
  assert.match(migration, /ADD COLUMN IF NOT EXISTS rejection_reason text/);
  assert.match(migration, /rejected_by varchar REFERENCES users\(id\) ON DELETE SET NULL/);
  assert.match(migration, /rejected_at timestamp/);
  const transition = storageSource.slice(storageSource.indexOf("async rejectPendingWashoutActivityForOwner"), storageSource.indexOf("async updateWashoutActivityStatus"));
  assert.match(transition, /eq\(washoutActivities\.status, "pending"\)/);
  assert.match(transition, /rejectionReason/);
  assert.doesNotMatch(transition, /verifiedBy:/);
  assert.doesNotMatch(transition, /verifiedAt:/);
});

test("owner rejection route has no provider, wallet, payout, or financial execution path", () => {
  const source = readFileSync(new URL("../server/routes.ts", import.meta.url), "utf8");
  const handler = source.slice(
    source.indexOf("app.put('/api/owners/activities/:id/reject'"),
    source.indexOf("// Financial obligation creation"),
  );
  for (const forbidden of ["paymentIntents", "charges.create", "transfers.create", "payouts.create", "createPayment(", "createWallet", "createWithdrawal("]) {
    assert.doesNotMatch(handler, new RegExp(forbidden.replace(/[.()]/g, "\\$&")));
  }
});
