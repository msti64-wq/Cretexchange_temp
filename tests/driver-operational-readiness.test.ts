import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveDriverOperationalReadiness,
  resolveDriverProfileReadiness,
} from "../shared/driverOperationalReadiness";
import { resolveDriverAccountReadiness } from "../client/src/lib/pilotOnboarding";
import { getRequiredTermsForRole } from "../shared/terms";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET ||= "test-only-jwt-secret-32-characters-minimum";
process.env.SESSION_SECRET ||= "test-only-session-secret";
process.env.DATABASE_URL ||= "postgres://user:pass@127.0.0.1:1/test";

const readyUser = {
  id: "driver-user",
  role: "driver",
  firstName: "Ava",
  lastName: "Driver",
  email: "ava@example.com",
  phone: "555-0100",
  street: "1 Main",
  city: "Austin",
  state: "TX",
  zip: "78701",
};

const readyProfile = {
  id: "driver-profile",
  userId: readyUser.id,
  employerName: "Crete Co",
  truckNumber: "12",
  activeMaterialSlug: "concrete-washout",
};

const readyMaterial = {
  slug: "concrete-washout",
  isActive: true,
  retiredAt: null,
};

function currentDriverAcceptances(userId = readyUser.id, language: "en" | "es" = "en") {
  return getRequiredTermsForRole("driver", language).map((document) => ({
    userId,
    role: "driver",
    termsType: document.termsType,
    language: document.language,
    storageKey: document.storageKey,
    version: document.version,
    contentHash: document.contentHash,
    acceptedAt: new Date(),
  }));
}

function response() {
  return {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) { this.statusCode = code; return this; },
    json(payload: unknown) { this.body = payload; return this; },
  };
}

function registry() {
  const gets = new Map<string, Function>();
  const posts = new Map<string, Function>();
  const puts = new Map<string, Function>();
  const postGuards = new Map<string, Function>();
  const putGuards = new Map<string, Function>();
  return {
    gets,
    posts,
    puts,
    postGuards,
    putGuards,
    app: {
      get(path: string, ...handlers: Function[]) { gets.set(path, handlers.at(-1)!); },
      post(path: string, ...handlers: Function[]) { posts.set(path, handlers.at(-1)!); postGuards.set(path, handlers.at(-2)!); },
      put(path: string, ...handlers: Function[]) { puts.set(path, handlers.at(-1)!); putGuards.set(path, handlers.at(-2)!); },
      delete() {}, patch() {}, use() {},
    },
  };
}

async function patchStorage(patch: Record<string, unknown>, run: () => Promise<void>) {
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

test("shared Driver readiness denies each incomplete account state and preserves ready Drivers", () => {
  assert.equal(resolveDriverOperationalReadiness({ user: { ...readyUser, role: "owner" } }).reasons[0]?.code, "driver_role_required");
  assert.equal(resolveDriverOperationalReadiness({ user: readyUser }).reasons[0]?.code, "driver_profile_required");
  assert.equal(resolveDriverOperationalReadiness({ user: readyUser, profile: { ...readyProfile, userId: "another-user" } }).reasons[0]?.code, "driver_profile_not_owned");

  const incomplete = resolveDriverOperationalReadiness({
    user: { ...readyUser, firstName: "", lastName: "", email: "" },
    profile: readyProfile,
    termsAccepted: true,
    activeMaterial: readyMaterial,
  });
  assert.equal(incomplete.reasons[0]?.code, "driver_profile_incomplete");
  assert.deepEqual(incomplete.reasons[0]?.missingProfileFields, ["firstName", "lastName", "email"]);

  assert.equal(resolveDriverOperationalReadiness({ user: readyUser, profile: readyProfile, activeMaterial: readyMaterial }).reasons[0]?.code, "current_terms_required");
  assert.equal(resolveDriverOperationalReadiness({ user: readyUser, profile: { ...readyProfile, activeMaterialSlug: null }, termsAccepted: true }).reasons[0]?.code, "active_material_required");
  assert.equal(resolveDriverOperationalReadiness({ user: readyUser, profile: { ...readyProfile, activeMaterialSlug: "unknown" }, termsAccepted: true }).reasons[0]?.code, "active_material_invalid");
  assert.equal(resolveDriverOperationalReadiness({ user: readyUser, profile: readyProfile, termsAccepted: true, activeMaterial: { ...readyMaterial, isActive: false } }).reasons[0]?.code, "active_material_invalid");
  assert.equal(resolveDriverOperationalReadiness({ user: readyUser, profile: readyProfile, termsAccepted: true, activeMaterial: { ...readyMaterial, retiredAt: new Date() } }).reasons[0]?.code, "active_material_retired");
  assert.equal(resolveDriverOperationalReadiness({ user: readyUser, profile: readyProfile, termsAccepted: true, activeMaterial: readyMaterial }).ready, true);
});

test("client account readiness and server readiness share the canonical profile requirements", () => {
  const client = resolveDriverAccountReadiness({
    user: {
      firstName: readyUser.firstName,
      lastName: readyUser.lastName,
      email: readyUser.email,
      phone: readyUser.phone,
      street: readyUser.street,
      city: readyUser.city,
      state: readyUser.state,
      zip: readyUser.zip,
      roleData: { employerName: readyProfile.employerName, truckNumber: readyProfile.truckNumber },
    },
    termsAccepted: true,
  });
  const sharedProfile = resolveDriverProfileReadiness({ user: readyUser, profile: readyProfile });
  const server = resolveDriverOperationalReadiness({ user: readyUser, profile: readyProfile, termsAccepted: true, activeMaterial: readyMaterial });

  assert.equal(client.profileComplete, sharedProfile.complete);
  assert.equal(client.ready, true);
  assert.equal(server.profileComplete, sharedProfile.complete);
  assert.equal(server.ready, true);
});

test("Driver and Owner bundle evaluation accepts one complete language only", async () => {
  const { evaluateCurrentTermsAcceptanceBundle } = await import("../server/terms");
  const toAcceptances = (role: "driver" | "owner", language: "en" | "es") => getRequiredTermsForRole(role, language).map((document) => ({
    id: `${role}-${document.storageKey}`,
    userId: `${role}-user`, role, termsType: document.termsType, language: document.language,
    storageKey: document.storageKey, version: document.version, contentHash: document.contentHash,
    acceptedAt: new Date(), createdAt: new Date(), ipAddress: null, userAgent: null,
  }));
  assert.equal(evaluateCurrentTermsAcceptanceBundle("driver", toAcceptances("driver", "en") as any)?.language, "en");
  assert.equal(evaluateCurrentTermsAcceptanceBundle("owner", toAcceptances("owner", "es") as any)?.language, "es");
  assert.equal(evaluateCurrentTermsAcceptanceBundle("driver", [
    ...toAcceptances("driver", "en").slice(0, 2),
    ...toAcceptances("driver", "es").slice(2),
  ] as any), null);
});

test("server guard fails closed and returns a minimal actionable denial contract", async () => {
  const { requireDriverOperationalReadiness, requireDriverRole } = await import("../server/driverOperationalReadiness");
  const anonymous = response();
  assert.equal(await requireDriverRole({}, anonymous), null);
  assert.equal(anonymous.statusCode, 401);
  assert.deepEqual(anonymous.body, { message: "Unauthorized", code: "UNAUTHENTICATED" });

  await patchStorage({
    getUser: async () => ({ id: "owner-user", role: "owner" }),
  }, async () => {
    const denied = response();
    assert.equal(await requireDriverOperationalReadiness({ user: { id: "owner-user" } }, denied), null);
    assert.equal(denied.statusCode, 403);
    assert.deepEqual(denied.body, { message: "Driver access required", code: "DRIVER_ROLE_REQUIRED" });
  });

  await patchStorage({
    getUser: async () => ({ id: "admin-user", role: "admin" }),
  }, async () => {
    const denied = response();
    assert.equal(await requireDriverOperationalReadiness({ user: { id: "admin-user" } }, denied), null);
    assert.equal(denied.statusCode, 403);
    assert.deepEqual(denied.body, { message: "Driver access required", code: "DRIVER_ROLE_REQUIRED" });
  });

  await patchStorage({
    getUser: async (userId: string) => userId === "owner-user" ? { id: "owner-user", role: "owner" } : readyUser,
    getDriver: async () => undefined,
    getTermsAcceptancesForUser: async () => currentDriverAcceptances(),
  }, async () => {
    const denied = response();
    assert.equal(await requireDriverOperationalReadiness({ user: { id: readyUser.id } }, denied), null);
    assert.equal(denied.statusCode, 409);
    assert.deepEqual((denied.body as any).readiness.reasons, [{ code: "driver_profile_required" }]);
  });

  await patchStorage({
    getUser: async (userId: string) => userId === "owner-user" ? { id: "owner-user", role: "owner" } : readyUser,
    getDriver: async () => ({ ...readyProfile, activeMaterialSlug: null }),
    getMaterialBySlug: async () => undefined,
    getTermsAcceptancesForUser: async () => currentDriverAcceptances(),
  }, async () => {
    const denied = response();
    assert.equal(await requireDriverOperationalReadiness({ user: { id: readyUser.id } }, denied), null);
    assert.equal(denied.statusCode, 409);
    assert.deepEqual(denied.body, {
      message: "Complete your Driver account readiness before submitting operational activity.",
      code: "DRIVER_OPERATIONAL_READINESS_REQUIRED",
      readiness: { ready: false, reasons: [{ code: "active_material_required" }] },
    });
  });

  await patchStorage({
    getUser: async () => readyUser,
    getDriver: async () => readyProfile,
    getMaterialBySlug: async () => readyMaterial,
    getTermsAcceptancesForUser: async () => currentDriverAcceptances().map((acceptance, index) => (
      index === 0 ? { ...acceptance, version: "superseded-version" } : acceptance
    )),
  }, async () => {
    const denied = response();
    assert.equal(await requireDriverOperationalReadiness({ user: { id: readyUser.id } }, denied), null);
    assert.equal(denied.statusCode, 409);
    assert.deepEqual((denied.body as any).readiness.reasons, [{ code: "current_terms_required" }]);
  });
});

test("Driver readiness accepts a complete supported-language bundle regardless of interface header and rejects mixed evidence", async () => {
  const { requireDriverOperationalReadiness } = await import("../server/driverOperationalReadiness");
  await patchStorage({
    getUser: async () => readyUser,
    getDriver: async () => readyProfile,
    getMaterialBySlug: async () => readyMaterial,
    getTermsAcceptancesForUser: async () => currentDriverAcceptances(readyUser.id, "es"),
  }, async () => {
    const english = response();
    await (await import("../server/driverOperationalReadiness")).driverOperationalReadinessMiddleware(
      { user: { id: readyUser.id }, headers: { "x-cretexchange-language": "en" } },
      english,
      () => { (english as any).advanced = true; },
    );
    assert.equal((english as any).advanced, true);

    const result = response();
    let advanced = false;
    await (await import("../server/driverOperationalReadiness")).driverOperationalReadinessMiddleware(
      { user: { id: readyUser.id }, headers: { "x-cretexchange-language": "es" } },
      result,
      () => { advanced = true; },
    );
    assert.equal(advanced, true);
    assert.equal(result.statusCode, 200);
    assert.ok(await requireDriverOperationalReadiness({ user: { id: readyUser.id }, headers: { "x-cretexchange-language": "forged" } }, response()));
  });

  await patchStorage({
    getUser: async () => readyUser,
    getDriver: async () => readyProfile,
    getMaterialBySlug: async () => readyMaterial,
    getTermsAcceptancesForUser: async () => [
      ...currentDriverAcceptances(readyUser.id, "en").slice(0, 2),
      ...currentDriverAcceptances(readyUser.id, "es").slice(2),
    ],
  }, async () => {
    const denied = response();
    assert.equal(await requireDriverOperationalReadiness({ user: { id: readyUser.id }, headers: { "x-cretexchange-language": "es" } }, denied), null);
    assert.equal(denied.statusCode, 409);
  });
});

test("Driver readiness denies safely when the terms ledger is unavailable", async () => {
  const { requireDriverOperationalReadiness } = await import("../server/driverOperationalReadiness");
  await patchStorage({
    getUser: async () => readyUser,
    getDriver: async () => readyProfile,
    getMaterialBySlug: async () => readyMaterial,
    getTermsAcceptancesForUser: async () => { throw new Error("ledger unavailable"); },
  }, async () => {
    const denied = response();
    assert.equal(await requireDriverOperationalReadiness({ user: { id: readyUser.id } }, denied), null);
    assert.equal(denied.statusCode, 503);
    assert.equal((denied.body as any).code, "TERMS_LEDGER_UNAVAILABLE");
    assert.deepEqual((denied.body as any).readiness.reasons, [{ code: "terms_ledger_unavailable" }]);
  });
});

test("system health exposes only sanitized structural-ledger failures", async () => {
  const unavailable = registry();
  const { pool } = await import("../server/db");
  const { resetTermsLedgerHealthCacheForTests } = await import("../server/termsLedgerCatalog");
  const originalQuery = pool.query;
  (pool as any).query = async () => { throw new Error("missing relation"); };
  resetTermsLedgerHealthCacheForTests();
  try {
    const { registerRoutes } = await import("../server/routes");
    await registerRoutes(unavailable.app as never);
    const health = response();
    await unavailable.gets.get("/api/system/health")!({}, health);
    assert.equal(health.statusCode, 503);
    assert.deepEqual((health.body as any).termsLedger, "unavailable");
    assert.doesNotMatch(JSON.stringify(health.body), /terms_acceptances|missing relation/i);
  } finally {
    (pool as any).query = originalQuery;
    resetTermsLedgerHealthCacheForTests();
  }
});

test("current and legacy activity submissions cannot bypass the readiness guard", async () => {
  const { app, posts, puts, postGuards, putGuards } = registry();
  let mutations = 0;
  await patchStorage({
    getUser: async (userId: string) => userId === "owner-user" ? { id: "owner-user", role: "owner" } : readyUser,
    getDriver: async () => ({ ...readyProfile, activeMaterialSlug: null }),
    getMaterialBySlug: async () => undefined,
    getTermsAcceptancesForUser: async () => currentDriverAcceptances(),
    createWashoutActivity: async () => { mutations += 1; throw new Error("must not mutate"); },
    createWashoutActivityWithPhotos: async () => { mutations += 1; throw new Error("must not mutate"); },
    updateDriverLocation: async () => { mutations += 1; },
    updateDriver: async () => ({ ...readyProfile }),
    upsertUser: async () => readyUser,
  }, async () => {
    const { registerRoutes } = await import("../server/routes");
    await registerRoutes(app as never);

    const legacy = response();
    await postGuards.get("/api/drivers/checkin")!({ user: { id: readyUser.id }, body: {} }, legacy, () => { throw new Error("legacy check-in must not run"); });
    assert.equal(legacy.statusCode, 409);

    const current = response();
    await postGuards.get("/api/activities/create-with-photos")!({ user: { id: readyUser.id }, body: {} }, current, () => { throw new Error("activity creation must not run"); });
    assert.equal(current.statusCode, 409);

    const location = response();
    await postGuards.get("/api/drivers/location")!({ user: { id: readyUser.id }, body: {} }, location, () => { throw new Error("location update must not run"); });
    assert.equal(location.statusCode, 409);

    const profile = response();
    let allowedProfile = false;
    await putGuards.get("/api/drivers/profile")!({ user: { id: readyUser.id }, body: {} }, profile, () => { allowedProfile = true; });
    assert.equal(allowedProfile, true);
    assert.equal(mutations, 0);

    const ownerProfile = response();
    await putGuards.get("/api/drivers/profile")!({ user: { id: "owner-user" }, body: {} }, ownerProfile, () => { throw new Error("Owner profile update must not run"); });
    assert.equal(ownerProfile.statusCode, 403);
    assert.deepEqual(ownerProfile.body, { message: "Driver access required", code: "DRIVER_ROLE_REQUIRED" });
  });
});

test("ready Driver remains able to use the existing operational location route", async () => {
  const { app, posts, postGuards } = registry();
  let updatedDriverId = "";
  await patchStorage({
    getUser: async () => readyUser,
    getDriver: async () => readyProfile,
    getMaterialBySlug: async () => readyMaterial,
    getTermsAcceptancesForUser: async () => currentDriverAcceptances(readyUser.id, "es"),
    updateDriverLocation: async (driverId: string) => { updatedDriverId = driverId; },
  }, async () => {
    const { registerRoutes } = await import("../server/routes");
    await registerRoutes(app as never);
    const result = response();
    let allowed = false;
    const request = { user: { id: readyUser.id }, headers: { "x-cretexchange-language": "en" }, body: { latitude: 30, longitude: -97 } };
    await postGuards.get("/api/drivers/location")!(request, result, () => { allowed = true; });
    assert.equal(allowed, true);
    await posts.get("/api/drivers/location")!(request, result);
    assert.equal(result.statusCode, 200);
    assert.equal(updatedDriverId, readyProfile.id);
  });
});
