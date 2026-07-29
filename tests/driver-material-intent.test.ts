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
  const puts = new Map<string, Function>();
  return {
    gets, puts,
    app: {
      get(path: string, ...handlers: Function[]) { gets.set(path, handlers.at(-1)!); },
      post() {}, put(path: string, ...handlers: Function[]) { puts.set(path, handlers.at(-1)!); },
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
  try { await run(); } finally {
    for (const [key, value] of original) (storage as any)[key] = value;
  }
}

const driverUser = { id: "driver-user", role: "driver" };
const catalog = [
  { slug: "concrete-washout", displayName: "Concrete Washout", category: "Concrete", isActive: true, retiredAt: null },
  { slug: "aggregate", displayName: "Aggregate", category: "Aggregate", isActive: true, retiredAt: null },
  { slug: "retired", displayName: "Retired Material", category: "Other", isActive: false, retiredAt: new Date() },
];

test("driver active material migration is operational-only and stores one catalog-backed intent", () => {
  const migration = readFileSync(new URL("../migrations/0034_add_driver_active_material_intent.sql", import.meta.url), "utf8");
  assert.match(migration, /active_material_slug/);
  assert.match(migration, /REFERENCES materials\(slug\)/);
  assert.doesNotMatch(migration, /(?:INSERT INTO|UPDATE|DELETE FROM)\s+(?:payments|wallet|settlements)/i);
});

test("driver material intent persists one active catalog material and excludes retired choices", async () => {
  const { app, gets, puts } = registry();
  const driver: any = { id: "driver-a", userId: driverUser.id, activeMaterialSlug: null, activeMaterialUpdatedAt: null };
  let updates = 0;
  await patchStorage({
    getUser: async () => driverUser,
    getDriver: async () => driver,
    getAllMaterials: async () => catalog,
    getMaterialBySlug: async (slug: string) => catalog.find((material) => material.slug === slug),
    updateDriver: async (_id: string, update: any) => { updates += 1; Object.assign(driver, update); return driver; },
    getActiveLocationsAcceptingMaterial: async () => [],
  }, async () => {
    const { registerRoutes } = await import("../server/routes");
    await registerRoutes(app as never);

    const catalogResult = response();
    await gets.get("/api/drivers/materials/catalog")!({ user: driverUser }, catalogResult);
    assert.deepEqual((catalogResult.body as any[]).map((material) => material.slug), ["concrete-washout", "aggregate"]);

    const saveResult = response();
    await puts.get("/api/drivers/material-intent")!({ user: driverUser, body: { materialSlug: "aggregate" } }, saveResult);
    assert.equal(saveResult.statusCode, 200);
    assert.equal(driver.activeMaterialSlug, "aggregate");
    assert.equal(updates, 1);

    const retiredResult = response();
    await puts.get("/api/drivers/material-intent")!({ user: driverUser, body: { materialSlug: "retired" } }, retiredResult);
    assert.equal(retiredResult.statusCode, 409);
    assert.equal(updates, 1);
  });
});

test("selected driver material filters locations through active facility acceptance only", async () => {
  const { app, gets } = registry();
  let requestedSlug = "";
  await patchStorage({
    getUser: async () => driverUser,
    getMaterialBySlug: async (slug: string) => catalog.find((material) => material.slug === slug),
    getActiveLocationsAcceptingMaterial: async (slug: string) => {
      requestedSlug = slug;
      return [{ id: "location-a", name: "Facility A", owner: { id: "owner-a", companyName: "Facility A", user: { firstName: "A", lastName: "Owner" } }, materialIntent: { id: "intent-a", locationId: "location-a", materialSlug: slug, active: true } }];
    },
    getActiveLocations: async () => { throw new Error("unfiltered location discovery must not run"); },
  }, async () => {
    const { registerRoutes } = await import("../server/routes");
    await registerRoutes(app as never);
    const result = response();
    await gets.get("/api/drivers/locations")!({ user: driverUser, query: { materialSlug: "aggregate" } }, result);
    assert.equal(result.statusCode, 200);
    assert.equal(requestedSlug, "aggregate");
    assert.deepEqual((result.body as any[]).map((location) => location.id), ["location-a"]);
    assert.equal((result.body as any[])[0].matchedMaterial.slug, "aggregate");
  });
});

test("dashboard opens the persisted material selector in a dialog while locations retain the compact selector", () => {
  const dashboard = readFileSync(new URL("../client/src/pages/driver/dashboard.tsx", import.meta.url), "utf8");
  const locations = readFileSync(new URL("../client/src/pages/driver/locations.tsx", import.meta.url), "utf8");
  const selector = readFileSync(new URL("../client/src/components/driver/DriverMaterialIntentSelector.tsx", import.meta.url), "utf8");
  assert.match(dashboard, /DriverMaterialIntentSelector/);
  assert.match(dashboard, /presentation="dialog"/);
  assert.match(dashboard, /setMaterialDialogOpen\(true\)/);
  assert.match(locations, /DriverMaterialIntentSelector compact/);
  assert.match(locations, /materialSlug=/);
  assert.match(selector, /\/api\/drivers\/material-intent/);
  assert.match(selector, /DialogContent/);
  assert.match(selector, /data-testid="dialog-driver-material-intent"/);
  assert.match(selector, /data-testid="button-open-active-material-dialog"/);
  assert.doesNotMatch(dashboard, /DRIVER_JOB_TYPE_OPTIONS|ready-mix-washout|material-recovery/);
  assert.doesNotMatch(locations, /selectedMaterials/);
});
