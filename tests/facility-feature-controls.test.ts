import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  FEATURE_FLAGS,
  type FacilityScopedGeofenceFeatureFlag,
} from "../shared/featureFlags";
import { resolveFacilityFeatureControl } from "../server/facilityFeatureControl";
import { registerFacilityFeatureControlRoutes } from "../server/facilityFeatureControlRoutes";
import { isGeofenceFeatureEnabled } from "../server/geofenceFeatureFlags";

const FACILITY_A = "11111111-1111-4111-8111-111111111111";
const FACILITY_B = "22222222-2222-4222-8222-222222222222";

function lookup(options: {
  global?: boolean;
  user?: boolean;
  facilities?: Record<string, boolean>;
  validFacilities?: string[];
  allowedRoles?: string[];
} = {}) {
  return {
    getWashoutLocation: async (locationId: string) =>
      (options.validFacilities ?? [FACILITY_A, FACILITY_B]).includes(locationId)
        ? { id: locationId }
        : undefined,
    getFeatureFlag: async () => ({
      enabled: options.global ?? false,
      allowedRoles: options.allowedRoles ?? ["driver"],
    }),
    getFeatureFlagOverride: async () =>
      options.user === undefined ? undefined : { enabled: options.user },
    getFacilityFeatureFlagOverride: async (_flagKey: FacilityScopedGeofenceFeatureFlag, locationId: string) =>
      options.facilities?.[locationId] === undefined
        ? undefined
        : { enabled: options.facilities[locationId] },
  };
}

test("one controlled Facility can be enabled while every other Facility remains disabled", async () => {
  const flags = lookup({ facilities: { [FACILITY_A]: true }, global: false });
  const enabled = await resolveFacilityFeatureControl(flags, {
    flagKey: FEATURE_FLAGS.GEOFENCE_SUBMISSION_ENFORCEMENT,
    userId: "driver-1",
    userRole: "driver",
    verifiedFacilityId: FACILITY_A,
  });
  const isolated = await resolveFacilityFeatureControl(flags, {
    flagKey: FEATURE_FLAGS.GEOFENCE_SUBMISSION_ENFORCEMENT,
    userId: "driver-1",
    userRole: "driver",
    verifiedFacilityId: FACILITY_B,
  });
  assert.deepEqual(enabled, { enabled: true, source: "facility", facilityContextVerified: true });
  assert.deepEqual(isolated, { enabled: false, source: "global", facilityContextVerified: true });
});

test("Facility override precedes user override and global state deterministically", async () => {
  const result = await resolveFacilityFeatureControl(
    lookup({ facilities: { [FACILITY_A]: false }, user: true, global: true }),
    {
      flagKey: FEATURE_FLAGS.GEOFENCE_SUBMISSION_ENFORCEMENT,
      userId: "driver-1",
      userRole: "driver",
      verifiedFacilityId: FACILITY_A,
    },
  );
  assert.deepEqual(result, { enabled: false, source: "facility", facilityContextVerified: true });

  const userFallback = await resolveFacilityFeatureControl(
    lookup({ user: true, global: false }),
    {
      flagKey: FEATURE_FLAGS.GEOFENCE_SUBMISSION_ENFORCEMENT,
      userId: "driver-1",
      userRole: "driver",
      verifiedFacilityId: FACILITY_B,
    },
  );
  assert.deepEqual(userFallback, { enabled: true, source: "user", facilityContextVerified: true });
});

test("missing, invalid, role-denied, and non-geofence Facility context fail closed", async () => {
  const flags = lookup({ facilities: { [FACILITY_A]: true }, global: true });
  const inputs = [
    { flagKey: FEATURE_FLAGS.GEOFENCE_SUBMISSION_ENFORCEMENT, userRole: "driver", verifiedFacilityId: null },
    { flagKey: FEATURE_FLAGS.GEOFENCE_SUBMISSION_ENFORCEMENT, userRole: "driver", verifiedFacilityId: "33333333-3333-4333-8333-333333333333" },
    { flagKey: FEATURE_FLAGS.GEOFENCE_SUBMISSION_ENFORCEMENT, userRole: "owner", verifiedFacilityId: FACILITY_A },
    { flagKey: FEATURE_FLAGS.WALLET_FUNDING, userRole: "driver", verifiedFacilityId: FACILITY_A },
  ];
  for (const input of inputs) {
    const result = await resolveFacilityFeatureControl(flags, {
      ...input,
      userId: "user-1",
    });
    assert.equal(result.enabled, false);
    assert.equal(result.source, "denied");
  }
});

test("existing advisory and Owner-management controls keep their established global/user resolution", async () => {
  let legacyChecks = 0;
  const storage = {
    checkFeatureFlag: async () => { legacyChecks += 1; return true; },
    checkFacilityFeatureFlag: async () => { throw new Error("not expected"); },
  };
  assert.equal(await isGeofenceFeatureEnabled(storage, FEATURE_FLAGS.GEOFENCE_ADVISORY_EVALUATION, "driver-1", "driver"), true);
  assert.equal(await isGeofenceFeatureEnabled(storage, FEATURE_FLAGS.GEOFENCE_OWNER_BOUNDARY_MANAGEMENT, "owner-1", "owner"), true);
  assert.equal(legacyChecks, 2);
});

type Handler = (req: any, res: any) => Promise<unknown>;

function response() {
  return {
    statusCode: 200,
    body: undefined as any,
    status(code: number) { this.statusCode = code; return this; },
    json(body: any) { this.body = body; return this; },
  };
}

function routeHarness(role: string) {
  const gets = new Map<string, Handler>();
  const puts = new Map<string, Handler>();
  const writes: any[] = [];
  const app = {
    get(path: string, ...handlers: Handler[]) { gets.set(path, handlers.at(-1)!); },
    put(path: string, ...handlers: Handler[]) { puts.set(path, handlers.at(-1)!); },
  };
  registerFacilityFeatureControlRoutes(app as any, {
    storage: {
      getUser: async () => ({ id: `${role}-1`, role }),
      getWashoutLocation: async () => ({ id: FACILITY_A, ownerId: "owner-a" }),
      listFacilityFeatureFlagOverrides: async () => [],
      listFacilityFeatureFlagOverrideEvents: async () => [],
      setFacilityFeatureFlagOverride: async (input: any) => {
        writes.push(input);
        return {
          override: { locationId: input.locationId, flagKey: input.flagKey, enabled: input.enabled },
          event: {
            actorUserId: input.actorUserId,
            actorRole: input.actorRole,
            reason: input.reason,
            priorEnabled: false,
            newEnabled: input.enabled,
          },
          reused: false,
        };
      },
    } as any,
  });
  return { gets, puts, writes };
}

test("Admin and Super Admin may govern a Facility override with an auditable reason", async () => {
  for (const role of ["admin", "super_admin"]) {
    const h = routeHarness(role);
    const res = response();
    await h.puts.get("/api/admin/facilities/:locationId/geofence-controls/:flagKey")!({
      user: { id: `${role}-1` },
      params: { locationId: FACILITY_A, flagKey: FEATURE_FLAGS.GEOFENCE_SUBMISSION_ENFORCEMENT },
      body: { enabled: true, reason: "Founder-authorized controlled pilot" },
      header: () => "request-1",
    }, res);
    assert.equal(res.statusCode, 201);
    assert.equal(h.writes.length, 1);
    assert.equal(h.writes[0].actorRole, role);
    assert.equal(h.writes[0].reason, "Founder-authorized controlled pilot");
  }
});

test("Owner and Driver are denied Facility override reads and writes before storage mutation", async () => {
  for (const role of ["owner", "driver"]) {
    const h = routeHarness(role);
    const readRes = response();
    await h.gets.get("/api/admin/facilities/:locationId/geofence-controls")!({
      user: { id: `${role}-1` },
      params: { locationId: FACILITY_A },
    }, readRes);
    const writeRes = response();
    await h.puts.get("/api/admin/facilities/:locationId/geofence-controls/:flagKey")!({
      user: { id: `${role}-1` },
      params: { locationId: FACILITY_A, flagKey: FEATURE_FLAGS.GEOFENCE_SUBMISSION_ENFORCEMENT },
      body: { enabled: true, reason: "Not authorized" },
      header: () => "request-1",
    }, writeRes);
    assert.equal(readRes.statusCode, 403);
    assert.equal(writeRes.statusCode, 403);
    assert.equal(h.writes.length, 0);
  }
});

test("administrative route rejects non-geofence and financial controls before mutation", async () => {
  const h = routeHarness("super_admin");
  const res = response();
  await h.puts.get("/api/admin/facilities/:locationId/geofence-controls/:flagKey")!({
    user: { id: "super_admin-1" },
    params: { locationId: FACILITY_A, flagKey: FEATURE_FLAGS.WALLET_FUNDING },
    body: { enabled: true, reason: "Must remain globally governed" },
    header: () => "request-financial",
  }, res);
  assert.equal(res.statusCode, 400);
  assert.equal(h.writes.length, 0);
});

test("foundation deploys no override row and cannot activate financial, notification, enforcement, or legacy behavior", async () => {
  const [migration, schema, routes, featureHook, washoutForm] = await Promise.all([
    readFile(new URL("../migrations/0041_add_facility_scoped_geofence_feature_controls.sql", import.meta.url), "utf8"),
    readFile(new URL("../shared/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../server/facilityFeatureControlRoutes.ts", import.meta.url), "utf8"),
    readFile(new URL("../client/src/hooks/useFeatureFlag.ts", import.meta.url), "utf8"),
    readFile(new URL("../client/src/components/WashoutForm.tsx", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(migration, /INSERT INTO\s+facility_feature_flag_overrides/i);
  assert.doesNotMatch(migration, /UPDATE\s+(?:feature_flags|payments|wallet_transactions|notifications)/i);
  assert.match(migration, /enabled boolean NOT NULL DEFAULT false/);
  assert.match(schema, /geofence_submission_enforcement/);
  assert.match(schema, /geofence_notifications/);
  assert.match(schema, /geofence_legacy_transition/);
  assert.doesNotMatch(routes, /payment|wallet|stripe|settlement|financialExecution/i);
  assert.match(featureHook, /facilityId=\$\{encodeURIComponent\(facilityId\)\}/);
  assert.match(washoutForm, /GEOFENCE_SUBMISSION_ENFORCEMENT,[\s\S]{0,100}location\.id/);
});
