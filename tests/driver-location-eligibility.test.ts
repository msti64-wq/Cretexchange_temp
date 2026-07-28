import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET ||= "test-only-jwt-secret-32-characters-minimum";
process.env.SESSION_SECRET ||= "test-only-session-secret";
process.env.DATABASE_URL ||= "postgres://user:pass@127.0.0.1:1/test";

const driverUser = {
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
const driver = { id: "driver-profile", userId: driverUser.id, employerName: "Crete Co", truckNumber: "12", activeMaterialSlug: "concrete-washout" };
const material = { slug: "concrete-washout", isActive: true, retiredAt: null };
const eligibleLocation = { id: "eligible-location", ownerId: "owner", name: "Eligible Facility", rate: "0", latitude: "30", longitude: "-97", isActive: true, isVisible: true, materialIntent: { id: "intent", locationId: "eligible-location", materialSlug: material.slug, active: true } };

function response() {
  return {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) { this.statusCode = code; return this; },
    json(payload: unknown) { this.body = payload; return this; },
  };
}

function registry() {
  const posts = new Map<string, Function>();
  return {
    posts,
    app: {
      get() {},
      post(path: string, ...handlers: Function[]) { posts.set(path, handlers.at(-1)!); },
      put() {}, delete() {}, patch() {}, use() {},
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

test("eligibility reuses the canonical discovery result and keeps unavailable locations indistinguishable", async () => {
  const { resolveDriverLocationEligibility, requireDriverLocationEligibility } = await import("../server/driverLocationEligibility");
  let requestedSlug = "";
  await patchStorage({
    getDriver: async () => driver,
    getMaterialBySlug: async () => material,
    getActiveLocationsAcceptingMaterial: async (slug: string) => { requestedSlug = slug; return [eligibleLocation]; },
  }, async () => {
    assert.equal((await resolveDriverLocationEligibility(driverUser.id, eligibleLocation.id))?.id, eligibleLocation.id);
    assert.equal(requestedSlug, material.slug);
  });

  for (const unavailableLocation of ["missing", "hidden", "inactive", "no-association", "inactive-association", "stale-selection"]) {
    await patchStorage({
      getDriver: async () => driver,
      getMaterialBySlug: async () => material,
      getActiveLocationsAcceptingMaterial: async () => [],
    }, async () => {
      const result = response();
      assert.equal(await requireDriverLocationEligibility({ user: { id: driverUser.id } }, result, unavailableLocation), null);
      assert.equal(result.statusCode, 409);
      assert.deepEqual(result.body, {
        message: "This facility is no longer available for your selected material. Refresh available locations and select an eligible facility.",
        code: "DRIVER_LOCATION_NOT_ELIGIBLE",
      });
    });
  }
});

test("invalid or retired driver material cannot make a location eligible", async () => {
  const { resolveDriverLocationEligibility } = await import("../server/driverLocationEligibility");
  let discoveryCalled = false;
  for (const activeMaterial of [undefined, { ...material, isActive: false }, { ...material, retiredAt: new Date() }]) {
    await patchStorage({
      getDriver: async () => driver,
      getMaterialBySlug: async () => activeMaterial,
      getActiveLocationsAcceptingMaterial: async () => { discoveryCalled = true; return [eligibleLocation]; },
    }, async () => assert.equal(await resolveDriverLocationEligibility(driverUser.id, eligibleLocation.id), null));
  }
  assert.equal(discoveryCalled, false);
});

test("check-in, photo-backed activity, and rubble creation reject a stale direct location identifier before mutation", async () => {
  const { app, posts } = registry();
  let mutations = 0;
  await patchStorage({
    getDriver: async () => driver,
    getMaterialBySlug: async () => material,
    getActiveLocationsAcceptingMaterial: async () => [],
    getWashoutLocation: async () => { throw new Error("ineligible location must not be read for mutation"); },
    createWashoutActivity: async () => { mutations += 1; },
    createWashoutActivityWithPhotos: async () => { mutations += 1; },
  }, async () => {
    const { registerRoutes } = await import("../server/routes");
    await registerRoutes(app as never);

    const checkin = response();
    await posts.get("/api/drivers/checkin")!({ user: { id: driverUser.id }, body: { locationId: "stale-selection" } }, checkin);
    assert.equal(checkin.statusCode, 409);

    const photoActivity = response();
    await posts.get("/api/activities/create-with-photos")!({
      user: { id: driverUser.id },
      body: { activityData: { locationId: "stale-selection", amount: "0", checkInTime: "2026-07-28T00:00:00.000Z", status: "pending" }, photoData: [] },
    }, photoActivity);
    assert.equal(photoActivity.statusCode, 409);

    const rubble = response();
    await posts.get("/api/rubble/visits")!({ user: { id: driverUser.id }, body: { locationId: "stale-selection", materialSlug: material.slug } }, rubble);
    assert.equal(rubble.statusCode, 409);
    assert.equal(mutations, 0);
  });
});

test("legacy rubble arrive and complete revalidate the visit location before mutation", async () => {
  const { app, posts } = registry();
  let mutations = 0;
  await patchStorage({
    getDriver: async () => driver,
    getMaterialBySlug: async () => material,
    getActiveLocationsAcceptingMaterial: async () => [],
    getWashoutActivity: async (id: string) => ({ id, driverId: driver.id, locationId: "stale-selection", serviceType: "rubble_dropoff", status: id === "in-progress" ? "in_progress" : "pending" }),
    updateWashoutActivityStatus: async () => { mutations += 1; },
    createWashoutPhoto: async () => { mutations += 1; },
  }, async () => {
    const { registerRoutes } = await import("../server/routes");
    await registerRoutes(app as never);
    const arrive = response();
    await posts.get("/api/rubble/visits/:visitId/arrive")!({ user: { id: driverUser.id }, params: { visitId: "pending" }, body: { latitude: 30, longitude: -97 } }, arrive);
    assert.equal(arrive.statusCode, 409);
    const complete = response();
    await posts.get("/api/rubble/visits/:visitId/complete")!({ user: { id: driverUser.id }, params: { visitId: "in-progress" }, body: { beforePhotoUrl: "before", afterPhotoUrl: "after", latitude: 30, longitude: -97 } }, complete);
    assert.equal(complete.statusCode, 409);
    assert.equal(mutations, 0);
  });
});

test("rubble creation rejects a conflicting request material before mutation and persists the authoritative association", async () => {
  const { app, posts } = registry();
  let mutations = 0;
  const created: any[] = [];
  await patchStorage({
    getDriver: async () => driver,
    getMaterialBySlug: async () => material,
    getActiveLocationsAcceptingMaterial: async () => [eligibleLocation],
    getWashoutLocation: async () => eligibleLocation,
    getLocationMaterialIntents: async () => [
      { ...eligibleLocation.materialIntent, materialSlug: material.slug, acceptsRebar: true, acceptsTrash: true, acceptsWood: true },
      { ...eligibleLocation.materialIntent, id: "other-intent", materialSlug: "aggregate", acceptsRebar: true, acceptsTrash: true, acceptsWood: true },
    ],
    createWashoutActivity: async (value: any) => { mutations += 1; created.push(value); return value; },
  }, async () => {
    const { registerRoutes } = await import("../server/routes");
    await registerRoutes(app as never);
    const mismatch = response();
    await posts.get("/api/rubble/visits")!({ user: { id: driverUser.id }, body: { locationId: eligibleLocation.id, materialSlug: "aggregate" } }, mismatch);
    assert.equal(mismatch.statusCode, 409);
    assert.deepEqual(mismatch.body, { message: "The submitted material does not match your selected active material. Refresh your material selection and try again.", code: "DRIVER_MATERIAL_MISMATCH" });
    assert.equal(mutations, 0);

    const matching = response();
    await posts.get("/api/rubble/visits")!({ user: { id: driverUser.id }, body: { locationId: eligibleLocation.id, materialSlug: material.slug } }, matching);
    assert.equal(matching.statusCode, 200);
    assert.equal(mutations, 1);
    assert.equal(created[0].materialSlug, material.slug);
  });
});

test("foreign Drivers cannot arrive at or complete another Driver's visit before mutation", async () => {
  const { app, posts } = registry();
  let mutations = 0;
  await patchStorage({
    getDriver: async () => driver,
    getWashoutActivity: async () => ({ id: "visit", driverId: "another-driver", locationId: eligibleLocation.id, serviceType: "rubble_dropoff", status: "in_progress" }),
    updateWashoutActivityStatus: async () => { mutations += 1; },
    createWashoutPhoto: async () => { mutations += 1; },
  }, async () => {
    const { registerRoutes } = await import("../server/routes");
    await registerRoutes(app as never);
    const arrive = response();
    await posts.get("/api/rubble/visits/:visitId/arrive")!({ user: { id: driverUser.id }, params: { visitId: "visit" }, body: { latitude: 30, longitude: -97 } }, arrive);
    assert.equal(arrive.statusCode, 403);
    assert.deepEqual(arrive.body, { message: "This is not your visit" });
    const complete = response();
    await posts.get("/api/rubble/visits/:visitId/complete")!({ user: { id: driverUser.id }, params: { visitId: "visit" }, body: { beforePhotoUrl: "before", afterPhotoUrl: "after", latitude: 30, longitude: -97 } }, complete);
    assert.equal(complete.statusCode, 403);
    assert.deepEqual(complete.body, { message: "This is not your visit" });
    assert.equal(mutations, 0);
  });
});

test("the owning ready Driver retains arrive and complete access for the persisted eligible visit", async () => {
  const { app, posts } = registry();
  let updates = 0;
  let photos = 0;
  await patchStorage({
    getDriver: async () => driver,
    getMaterialBySlug: async () => material,
    getActiveLocationsAcceptingMaterial: async () => [eligibleLocation],
    getWashoutActivity: async (id: string) => ({ id, driverId: driver.id, locationId: eligibleLocation.id, serviceType: "rubble_dropoff", status: id === "complete" ? "in_progress" : "pending", materialSlug: material.slug }),
    getWashoutLocation: async () => eligibleLocation,
    getLocationMaterialIntents: async () => [{ ...eligibleLocation.materialIntent, materialSlug: material.slug, driverPayCents: 0 }],
    updateWashoutActivityStatus: async (id: string) => { updates += 1; return { id }; },
    createWashoutPhoto: async () => { photos += 1; },
  }, async () => {
    const { registerRoutes } = await import("../server/routes");
    await registerRoutes(app as never);
    const arrive = response();
    await posts.get("/api/rubble/visits/:visitId/arrive")!({ user: { id: driverUser.id }, params: { visitId: "arrive" }, body: { latitude: 30, longitude: -97 } }, arrive);
    assert.equal(arrive.statusCode, 200);
    const complete = response();
    await posts.get("/api/rubble/visits/:visitId/complete")!({ user: { id: driverUser.id }, params: { visitId: "complete" }, body: { beforePhotoUrl: "before", afterPhotoUrl: "after", latitude: 30, longitude: -97 } }, complete);
    assert.equal(complete.statusCode, 200);
    assert.equal(updates, 2);
    assert.equal(photos, 2);
  });
});

test("a ready Driver can check in at a location from the canonical eligible result", async () => {
  const { app, posts } = registry();
  let createdAt = "";
  await patchStorage({
    getDriver: async () => driver,
    getMaterialBySlug: async () => material,
    getActiveLocationsAcceptingMaterial: async () => [eligibleLocation],
    getWashoutLocation: async () => eligibleLocation,
    createWashoutActivity: async (input: any) => { createdAt = input.locationId; return { id: "activity" }; },
  }, async () => {
    const { registerRoutes } = await import("../server/routes");
    await registerRoutes(app as never);
    const result = response();
    await posts.get("/api/drivers/checkin")!({ user: { id: driverUser.id }, body: { locationId: eligibleLocation.id, photoUrls: [] } }, result);
    assert.equal(result.statusCode, 200);
    assert.equal(createdAt, eligibleLocation.id);
  });
});

test("check-in consumes the material-filtered Driver discovery endpoint", () => {
  const checkIn = readFileSync(new URL("../client/src/pages/driver/check-in.tsx", import.meta.url), "utf8");
  assert.match(checkIn, /driverMaterialIntentKey/);
  assert.match(checkIn, /\/api\/drivers\/locations\?materialSlug=/);
  assert.doesNotMatch(checkIn, /queryKey:\s*\['\/api\/drivers\/locations'\],/);
});
