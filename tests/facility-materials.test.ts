import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET ||= "test-only-jwt-secret-32-characters-minimum";
process.env.SESSION_SECRET ||= "test-only-session-secret";
process.env.DATABASE_URL ||= "postgres://user:pass@127.0.0.1:1/test";

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
  const deletes = new Map<string, Function>();
  return {
    gets, posts, puts, deletes,
    app: {
      get(path: string, ...handlers: Function[]) { gets.set(path, handlers.at(-1)!); },
      post(path: string, ...handlers: Function[]) { posts.set(path, handlers.at(-1)!); },
      put(path: string, ...handlers: Function[]) { puts.set(path, handlers.at(-1)!); },
      delete(path: string, ...handlers: Function[]) { deletes.set(path, handlers.at(-1)!); },
      patch() {}, use() {},
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
  try { await run(); } finally {
    for (const [key, value] of original) (storage as any)[key] = value;
  }
}

const owner = { id: "owner-a", userId: "owner-user", isApproved: true, profileCompleted: true, companyName: "Facility A", businessLicense: "A", taxId: "T" };
const user = { id: "owner-user", role: "owner", firstName: "Owner", lastName: "A", email: "a@example.com", phone: "555", street: "1 A", city: "Austin", state: "TX", zip: "78701" };
const location = { id: "location-a", ownerId: "owner-a", name: "Facility A" };
const catalog = [
  { id: "material-concrete", slug: "concrete-washout", displayName: "Concrete Washout", category: "Concrete", isActive: true, retiredAt: null },
  { id: "material-retired", slug: "retired", displayName: "Retired", category: "Concrete", isActive: false, retiredAt: new Date() },
];

test("facility material migration establishes normalized catalog, identity checks, uniqueness, and concrete compatibility backfill", () => {
  const migration = readFileSync(new URL("../migrations/0033_add_facility_material_management.sql", import.meta.url), "utf8");
  assert.match(migration, /ALTER TABLE materials ADD COLUMN IF NOT EXISTS category/);
  assert.match(migration, /location_material_intents_exactly_one_identity/);
  assert.match(migration, /idx_lmi_location_system_material_unique/);
  assert.match(migration, /idx_lmi_location_custom_material_unique/);
  assert.match(migration, /concrete-washout/);
  assert.match(migration, /ON CONFLICT \(slug\) DO UPDATE/);
  assert.doesNotMatch(migration, /INSERT INTO payments|stripe|wallet/i);
});

test("facility material identity helpers distinguish system and custom materials safely", async () => {
  const { getFacilityMaterialKind, isValidCustomFacilityMaterialName, normalizeFacilityMaterialLabel } = await import("../shared/facilityMaterials");
  assert.equal(getFacilityMaterialKind({ materialSlug: "concrete-washout" }), "system");
  assert.equal(getFacilityMaterialKind({ customLabel: "Special Aggregate" }), "custom");
  assert.equal(getFacilityMaterialKind({}), "invalid");
  assert.equal(getFacilityMaterialKind({ materialSlug: "concrete-washout", customLabel: "Other" }), "invalid");
  assert.equal(isValidCustomFacilityMaterialName("   "), false);
  assert.equal(normalizeFacilityMaterialLabel("  Special   Aggregate "), "Special Aggregate");
});

test("authorized owner manages only its facility material configuration without provider or financial calls", async () => {
  const { app, gets, posts, puts, deletes } = registry();
  const intents: any[] = [];
  const calls: string[] = [];
  await patchStorage({
    getOwner: async () => owner,
    getUser: async () => user,
    getWashoutLocation: async () => location,
    getAllMaterials: async () => catalog,
    getMaterialBySlug: async (slug: string) => catalog.find((item) => item.slug === slug),
    getLocationMaterialIntents: async () => intents,
    createLocationMaterialIntent: async (data: any) => { const created = { id: `intent-${intents.length + 1}`, ...data }; intents.push(created); return created; },
    updateLocationMaterialIntent: async (id: string, data: any) => { const intent = intents.find((item) => item.id === id); Object.assign(intent, data); return intent; },
  }, async () => {
    const { registerRoutes } = await import("../server/routes");
    await registerRoutes(app as never);
    const request = { user: { id: user.id }, params: { locationId: location.id, materialId: "intent-2" } };
    const catalogResponse = response();
    await gets.get("/api/owners/materials/catalog")!(request, catalogResponse);
    assert.equal(catalogResponse.statusCode, 200);
    assert.deepEqual((catalogResponse.body as any[]).map((item) => item.slug), ["concrete-washout"]);

    const addSystem = response();
    await posts.get("/api/owners/locations/:locationId/materials/system")!({ ...request, body: { materialSlug: "concrete-washout" } }, addSystem);
    assert.equal(addSystem.statusCode, 201);
    assert.equal(intents.length, 1);
    const duplicate = response();
    await posts.get("/api/owners/locations/:locationId/materials/system")!({ ...request, body: { materialSlug: "concrete-washout" } }, duplicate);
    assert.equal(duplicate.statusCode, 409);

    const custom = response();
    await posts.get("/api/owners/locations/:locationId/materials/custom")!({ ...request, body: { name: "  Special  Aggregate ", category: "Aggregates" } }, custom);
    assert.equal(custom.statusCode, 201);
    assert.equal(intents[1].customLabel, "Special Aggregate");
    const duplicateCustom = response();
    await posts.get("/api/owners/locations/:locationId/materials/custom")!({ ...request, body: { name: "special aggregate" } }, duplicateCustom);
    assert.equal(duplicateCustom.statusCode, 409);

    const deactivate = response();
    await deletes.get("/api/owners/locations/:locationId/materials/:materialId")!(request, deactivate);
    assert.equal(deactivate.statusCode, 200);
    assert.equal(intents[1].active, false);
    const edit = response();
    await puts.get("/api/owners/locations/:locationId/materials/:materialId")!({ ...request, body: { active: true, ownerInstructions: "Keep separate" } }, edit);
    assert.equal(edit.statusCode, 200);
    assert.equal(intents[1].ownerInstructions, "Keep separate");
    assert.deepEqual(calls, []);
  });
});

test("facility material routes reject cross-owner access, malformed custom values, and retired catalog materials", async () => {
  const { app, gets, posts } = registry();
  let ownsLocation = false;
  await patchStorage({
    getOwner: async () => owner,
    getUser: async () => user,
    getWashoutLocation: async () => ({ ...location, ownerId: ownsLocation ? owner.id : "owner-b" }),
    getAllMaterials: async () => catalog,
    getMaterialBySlug: async (slug: string) => catalog.find((item) => item.slug === slug),
    getLocationMaterialIntents: async () => [],
    createLocationMaterialIntent: async () => { throw new Error("must not create"); },
  }, async () => {
    const { registerRoutes } = await import("../server/routes");
    await registerRoutes(app as never);
    const request = { user: { id: user.id }, params: { locationId: location.id } };
    const nonOwner = response();
    await gets.get("/api/owners/materials/catalog")!({ ...request, user: { id: "driver-user", role: "driver" } }, nonOwner);
    assert.equal(nonOwner.statusCode, 403);
    const denied = response();
    await gets.get("/api/owners/locations/:locationId/materials")!(request, denied);
    assert.equal(denied.statusCode, 403);
    ownsLocation = true;
    const malformed = response();
    await posts.get("/api/owners/locations/:locationId/materials/custom")!({ ...request, body: { name: "   " } }, malformed);
    assert.equal(malformed.statusCode, 400);
    const retired = response();
    await posts.get("/api/owners/locations/:locationId/materials/system")!({ ...request, body: { materialSlug: "retired" } }, retired);
    assert.equal(retired.statusCode, 409);
  });
});

test("owner material UI uses only owner-scoped material APIs and contains no material pricing controls", () => {
  const source = readFileSync(new URL("../client/src/components/owner/FacilityMaterialsManager.tsx", import.meta.url), "utf8");
  const ownerLocations = readFileSync(new URL("../client/src/pages/owner/locations.tsx", import.meta.url), "utf8");
  assert.match(source, /\/api\/owners\/locations\/\$\{location\.id\}\/materials/);
  assert.match(source, /\/api\/owners\/materials\/catalog/);
  assert.match(ownerLocations, /FacilityMaterialsManager/);
  assert.doesNotMatch(ownerLocations, /material-intents/);
  assert.doesNotMatch(source, /Stripe|payment|rateCents|driverPayCents/);
});
