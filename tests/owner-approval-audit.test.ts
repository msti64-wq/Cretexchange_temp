import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET ||= "test-only-jwt-secret-32-characters-minimum";
process.env.SESSION_SECRET ||= "test-only-session-secret";
process.env.DATABASE_URL ||= "postgres://user:pass@127.0.0.1:1/test";
process.env.STRIPE_SECRET_KEY ||= "sk_test_unit_test_secret";

function createResponse() {
  return {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) { this.statusCode = code; return this; },
    json(payload: unknown) { this.body = payload; return this; },
  };
}

function createRouteRegistry() {
  const puts = new Map<string, Function>();
  const app = {
    get() {},
    post() {},
    put(path: string, ...handlers: Function[]) { puts.set(path, handlers.at(-1)!); },
    delete() {},
    patch() {},
    use() {},
  };
  return { app, puts };
}

async function withPatchedStorage(patch: Record<string, unknown>, run: () => Promise<void>) {
  const { storage } = await import("../server/storage");
  const original = new Map<string, unknown>();
  for (const [key, value] of Object.entries(patch)) {
    original.set(key, (storage as any)[key]);
    (storage as any)[key] = value;
  }
  try {
    await run();
  } finally {
    for (const [key, value] of original) (storage as any)[key] = value;
  }
}

test("Owner approval accepts Admin and Super Admin, and attributes the authenticated actor", async () => {
  const { app, puts } = createRouteRegistry();
  const calls: Array<{ ownerId: string; actorId: string }> = [];
  let role = "admin";
  await withPatchedStorage({
    getUser: async (id: string) => ({ id, role }),
    approveOwner: async (ownerId: string, actorId: string) => {
      calls.push({ ownerId, actorId });
      return { id: ownerId, isApproved: true };
    },
  }, async () => {
    const { registerRoutes } = await import("../server/routes");
    await registerRoutes(app as never);
    for (const currentRole of ["admin", "super_admin"]) {
      role = currentRole;
      const response = createResponse();
      await puts.get("/api/admin/owners/:id/approve")!({ user: { id: `${currentRole}_1` }, params: { id: "owner_1" } }, response);
      assert.equal(response.statusCode, 200);
    }
  });
  assert.deepEqual(calls, [
    { ownerId: "owner_1", actorId: "admin_1" },
    { ownerId: "owner_1", actorId: "super_admin_1" },
  ]);
});

test("Owner approval denies non-admins before any mutation", async () => {
  const { app, puts } = createRouteRegistry();
  let approved = false;
  await withPatchedStorage({
    getUser: async (id: string) => ({ id, role: "owner" }),
    approveOwner: async () => { approved = true; throw new Error("must not run"); },
  }, async () => {
    const { registerRoutes } = await import("../server/routes");
    await registerRoutes(app as never);
    const response = createResponse();
    await puts.get("/api/admin/owners/:id/approve")!({ user: { id: "owner_user" }, params: { id: "owner_1" } }, response);
    assert.equal(response.statusCode, 403);
  });
  assert.equal(approved, false);
});

test("approval failure returns no successful approval response", async () => {
  const { app, puts } = createRouteRegistry();
  await withPatchedStorage({
    getUser: async (id: string) => ({ id, role: "admin" }),
    approveOwner: async () => { throw new Error("governance audit write failed"); },
  }, async () => {
    const { registerRoutes } = await import("../server/routes");
    await registerRoutes(app as never);
    const response = createResponse();
    const originalConsoleError = console.error;
    console.error = () => undefined;
    try {
      await puts.get("/api/admin/owners/:id/approve")!({ user: { id: "admin_1" }, params: { id: "owner_1" } }, response);
    } finally {
      console.error = originalConsoleError;
    }
    assert.equal(response.statusCode, 500);
  });
});

test("storage makes Owner approval an atomic, single audited transition without financial mutation", () => {
  const source = readFileSync(new URL("../server/storage.ts", import.meta.url), "utf8");
  const start = source.indexOf("async approveOwner(ownerId: string, actorId: string)");
  const end = source.indexOf("async activateMembership", start);
  const approval = source.slice(start, end);

  assert.match(approval, /return db\.transaction/);
  assert.match(approval, /eq\(owners\.isApproved, false\)/);
  assert.match(approval, /governanceAuditEvents/);
  assert.match(approval, /actorId,/);
  assert.match(approval, /targetOwnerId: owner\.id/);
  assert.match(approval, /priorApprovalState: false/);
  assert.match(approval, /resultingApprovalState: true/);
  assert.match(approval, /if \(!owner\)[\s\S]*return existing/);
  assert.doesNotMatch(approval, /membershipPaymentMethod|wallet|stripe|paymentMethod|activateMembership/);
});
