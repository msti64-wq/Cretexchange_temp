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
  const posts = new Map<string, Function>();
  const gets = new Map<string, Function>();
  const puts = new Map<string, Function>();
  const deletes = new Map<string, Function>();
  const app = {
    get(path: string, ...handlers: Function[]) { gets.set(path, handlers.at(-1)!); },
    post(path: string, ...handlers: Function[]) { posts.set(path, handlers.at(-1)!); },
    put(path: string, ...handlers: Function[]) { puts.set(path, handlers.at(-1)!); },
    delete(path: string, ...handlers: Function[]) { deletes.set(path, handlers.at(-1)!); },
    patch() {},
    use() {},
  };
  return { app, posts, gets, puts, deletes };
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

const owner = {
  id: "owner_1", userId: "owner_user_1", isApproved: true, profileCompleted: true,
  companyName: "Alpha Concrete", businessLicense: "BL-100", taxId: "12-3456789",
  stripePaymentMethodId: null, stripeCustomerId: "cus_existing", walletBalance: "99.00",
};
const ownerUser = {
  id: "owner_user_1", role: "owner", firstName: "Olivia", lastName: "Owner",
  email: "olivia@example.com", phone: "555-0100", street: "1 Main St", city: "Austin", state: "TX", zip: "78701",
};
const locationBody = {
  name: "Site A", street: "1 Main St", city: "Austin", state: "TX", zip: "78701",
  latitude: "30.2672", longitude: "-97.7431", rate: 5,
};

test("owner location routes retain authentication middleware", () => {
  const source = readFileSync(new URL("../server/routes.ts", import.meta.url), "utf8");
  for (const method of ["post", "get", "put", "delete"]) {
    assert.match(source, new RegExp(`app\\.${method}\\('/api/owners/locations[^']*', isAuthenticated`));
  }
});

test("location management UIs present canonical operational access without a payment or override bypass", () => {
  const ownerLocationsSource = readFileSync(new URL("../client/src/pages/owner/locations.tsx", import.meta.url), "utf8");
  const adminLocationsSource = readFileSync(new URL("../client/src/pages/admin/locations.tsx", import.meta.url), "utf8");

  assert.match(ownerLocationsSource, /resolveOwnerLocationAccessState/);
  assert.match(ownerLocationsSource, /disabled=\{!locationAccessState\.canManageLocations\}/);
  assert.doesNotMatch(ownerLocationsSource, /resolveOwnerMembershipState/);
  assert.doesNotMatch(ownerLocationsSource, /payment method.*location|location.*payment method/i);
  assert.match(adminLocationsSource, /approved and have a complete operational profile/i);
  assert.match(adminLocationsSource, /Financial readiness is separate/i);
  assert.doesNotMatch(adminLocationsSource, /Admin override|CC or Stripe checks/i);
});

test("approved complete Facility creates and manages its own location without a payment method", async () => {
  const { app, posts, gets, puts, deletes } = createRouteRegistry();
  const calls: string[] = [];
  await withPatchedStorage({
    getOwner: async () => ({ ...owner }),
    getUser: async () => ({ ...ownerUser }),
    getLocationsByOwner: async () => [{ id: "location_1", ownerId: owner.id }],
    createWashoutLocation: async (data: any) => { calls.push("create"); return { id: "location_1", ...data }; },
    getWashoutLocation: async () => ({ id: "location_1", ownerId: "owner_1", ...locationBody }),
    updateLocation: async () => { calls.push("edit"); return { id: "location_1" }; },
    updateLocationRate: async () => { calls.push("rate"); return { id: "location_1" }; },
    updateLocationStatus: async () => { calls.push("status"); return { id: "location_1" }; },
    deleteWashoutLocation: async () => { calls.push("delete"); return true; },
  }, async () => {
    const { registerRoutes } = await import("../server/routes");
    await registerRoutes(app as never);
    const request = { user: { id: ownerUser.id }, params: { id: "location_1" } };
    const createRes = createResponse();
    await posts.get("/api/owners/locations")!({ ...request, body: locationBody }, createRes);
    assert.equal(createRes.statusCode, 201);
    const listRes = createResponse();
    await gets.get("/api/owners/locations")!(request, listRes);
    assert.equal(listRes.statusCode, 200);
    assert.equal((listRes.body as Array<{ id: string }>)[0].id, "location_1");
    const rateRes = createResponse();
    await puts.get("/api/owners/locations/:id/rate")!({ ...request, body: { rate: 6 } }, rateRes);
    assert.equal(rateRes.statusCode, 200);
    const editRes = createResponse();
    await puts.get("/api/owners/locations/:id")!({ ...request, body: { name: "Updated Site" } }, editRes);
    assert.equal(editRes.statusCode, 200);
    const statusRes = createResponse();
    await puts.get("/api/owners/locations/:id/status")!({ ...request, body: { isActive: false } }, statusRes);
    assert.equal(statusRes.statusCode, 200);
    const deleteRes = createResponse();
    await deletes.get("/api/owners/locations/:id")!({ ...request, body: {} }, deleteRes);
    assert.equal(deleteRes.statusCode, 200);
  });
  assert.deepEqual(calls, ["create", "rate", "edit", "status", "delete"]);
  assert.equal(owner.stripePaymentMethodId, null);
  assert.equal(owner.stripeCustomerId, "cus_existing");
  assert.equal(owner.walletBalance, "99.00");
});

test("owner lifecycle routes deny unapproved, incomplete, missing, and non-owned access", async () => {
  const { app, posts, puts } = createRouteRegistry();
  let scenario: "unapproved" | "incomplete" | "missing" = "unapproved";
  await withPatchedStorage({
    getOwner: async () => scenario === "missing" ? undefined : scenario === "incomplete"
      ? { ...owner, profileCompleted: false, companyName: "" }
      : { ...owner, isApproved: false },
    getUser: async () => scenario === "incomplete" ? { ...ownerUser, firstName: "" } : { ...ownerUser },
    getWashoutLocation: async () => ({ id: "location_1", ownerId: "other_owner" }),
  }, async () => {
    const { registerRoutes } = await import("../server/routes");
    await registerRoutes(app as never);
    const createRes = createResponse();
    await posts.get("/api/owners/locations")!({ user: { id: ownerUser.id }, body: locationBody }, createRes);
    assert.equal(createRes.statusCode, 403);
    const updateRes = createResponse();
    await puts.get("/api/owners/locations/:id/status")!({ user: { id: ownerUser.id }, params: { id: "location_1" }, body: { isActive: true } }, updateRes);
    assert.equal(updateRes.statusCode, 403);
    scenario = "incomplete";
    const incompleteRes = createResponse();
    await posts.get("/api/owners/locations")!({ user: { id: ownerUser.id }, body: locationBody }, incompleteRes);
    assert.equal(incompleteRes.statusCode, 403);
    assert.match(String((incompleteRes.body as { message?: string }).message || ""), /complete your Facility profile/i);
    scenario = "missing";
    const missingRes = createResponse();
    await posts.get("/api/owners/locations")!({ user: { id: ownerUser.id }, body: locationBody }, missingRes);
    assert.equal(missingRes.statusCode, 404);
  });
});

test("an operationally ready Facility cannot modify another Facility's location", async () => {
  const { app, puts } = createRouteRegistry();
  await withPatchedStorage({
    getOwner: async () => ({ ...owner }),
    getUser: async () => ({ ...ownerUser }),
    getWashoutLocation: async () => ({ id: "location_1", ownerId: "other_owner" }),
  }, async () => {
    const { registerRoutes } = await import("../server/routes");
    await registerRoutes(app as never);
    const res = createResponse();
    await puts.get("/api/owners/locations/:id/status")!({ user: { id: ownerUser.id }, params: { id: "location_1" }, body: { isActive: true } }, res);
    assert.equal(res.statusCode, 403);
    assert.match(String((res.body as { message?: string }).message || ""), /not authorized/i);
  });
});

test("admin creates only for an approved, complete Facility and never depends on a payment method", async () => {
  const { app, posts } = createRouteRegistry();
  let created = false;
  await withPatchedStorage({
    getUser: async (id: string) => id === "admin_1" ? { id, role: "admin" } : { ...ownerUser },
    getOwnerById: async () => ({ ...owner }),
    createWashoutLocation: async () => { created = true; return { id: "location_1" }; },
  }, async () => {
    const { registerRoutes } = await import("../server/routes");
    await registerRoutes(app as never);
    const res = createResponse();
    await posts.get("/api/admin/locations")!({ user: { id: "admin_1" }, body: { ownerId: owner.id, ...locationBody } }, res);
    assert.equal(res.statusCode, 201);
  });
  assert.equal(created, true);
});

test("admin route denies non-admin and prevents approval/profile bypass", async () => {
  const { app, posts } = createRouteRegistry();
  let adminRole = "driver";
  let targetState: "unapproved" | "incomplete" = "unapproved";
  await withPatchedStorage({
    getUser: async (id: string) => id === "admin_1" ? { id, role: adminRole } : { ...ownerUser },
    getOwnerById: async () => targetState === "incomplete"
      ? { ...owner, profileCompleted: false, companyName: "" }
      : { ...owner, isApproved: false },
  }, async () => {
    const { registerRoutes } = await import("../server/routes");
    await registerRoutes(app as never);
    const unauthorised = createResponse();
    await posts.get("/api/admin/locations")!({ user: { id: "admin_1" }, body: { ownerId: owner.id, ...locationBody } }, unauthorised);
    assert.equal(unauthorised.statusCode, 403);
    adminRole = "admin";
    const blockedTarget = createResponse();
    await posts.get("/api/admin/locations")!({ user: { id: "admin_1" }, body: { ownerId: owner.id, ...locationBody } }, blockedTarget);
    assert.equal(blockedTarget.statusCode, 403);
    assert.match(String((blockedTarget.body as { message?: string }).message || ""), /approval/i);
    targetState = "incomplete";
    const incompleteTarget = createResponse();
    await posts.get("/api/admin/locations")!({ user: { id: "admin_1" }, body: { ownerId: owner.id, ...locationBody } }, incompleteTarget);
    assert.equal(incompleteTarget.statusCode, 403);
    assert.match(String((incompleteTarget.body as { message?: string }).message || ""), /complete your Facility profile/i);
  });
});
