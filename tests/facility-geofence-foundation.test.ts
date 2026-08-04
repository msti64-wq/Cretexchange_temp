import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { FEATURE_FLAGS, FEATURE_FLAG_DEFINITIONS } from "../shared/featureFlags";
import { evaluatePhotoVerification } from "../shared/photoVerification";

const migrationPath = new URL("../migrations/0040_add_canonical_facility_geofence_foundation.sql", import.meta.url);

async function source(path: string | URL) {
  return readFile(path, "utf8");
}

test("geofence migration creates only additive governed structures without boundary backfill", async () => {
  const migration = await source(migrationPath);
  for (const table of [
    "facility_geofence_boundaries",
    "facility_geofence_revision_events",
    "activity_geofence_evaluations",
  ]) {
    assert.match(migration, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  }
  assert.doesNotMatch(migration, /ALTER TABLE\s+(?:washout_activities|washout_photos|payments|wallet|notifications)/i);
  assert.doesNotMatch(migration, /INSERT INTO\s+facility_geofence_boundaries/i);
  assert.doesNotMatch(migration, /UPDATE\s+(?:washout_locations|washout_activities|washout_photos|payments|notifications)/i);
  assert.doesNotMatch(migration, /(?:DROP TABLE|DROP COLUMN|TRUNCATE|DELETE FROM)/i);
  assert.match(migration, /No Facility geometry is inferred, backfilled, or activated/);
});

test("boundary lifecycle, versioning, and immutable activation are database constrained", async () => {
  const migration = await source(migrationPath);
  assert.match(migration, /UNIQUE \(location_id, zone_key, version\)/);
  assert.match(migration, /WHERE status = 'active'/);
  assert.match(migration, /status IN \('draft', 'active', 'superseded', 'invalidated'\)/);
  assert.match(migration, /mode IN \('radius', 'polygon'\)/);
  assert.match(migration, /prevent_activated_geofence_boundary_mutation/);
  assert.match(migration, /Activated Facility geofence boundary version content is immutable/);
  assert.match(migration, /effective_to IS NULL OR \(effective_from IS NOT NULL AND effective_to > effective_from\)/);
});

test("revision and evaluation persistence is append-only, indexed, versioned, and idempotent", async () => {
  const migration = await source(migrationPath);
  assert.match(migration, /reject_geofence_append_only_mutation/);
  assert.match(migration, /facility_geofence_revision_events_append_only/);
  assert.match(migration, /activity_geofence_evaluations_append_only/);
  assert.match(migration, /boundary_version_id varchar REFERENCES facility_geofence_boundaries\(id\) ON DELETE RESTRICT/);
  assert.match(migration, /boundary_version integer/);
  assert.match(migration, /idempotency_key varchar\(240\) NOT NULL UNIQUE/);
  assert.match(migration, /activity_geofence_evaluations_activity_created_idx/);
  assert.match(migration, /activity_geofence_evaluations_location_evaluated_idx/);
  assert.match(migration, /activity_geofence_evaluations_boundary_evaluated_idx/);
});

test("all five canonical geofence controls default disabled in code and migration", async () => {
  const expected = [
    FEATURE_FLAGS.GEOFENCE_ADVISORY_EVALUATION,
    FEATURE_FLAGS.GEOFENCE_OWNER_BOUNDARY_MANAGEMENT,
    FEATURE_FLAGS.GEOFENCE_SUBMISSION_ENFORCEMENT,
    FEATURE_FLAGS.GEOFENCE_NOTIFICATIONS,
    FEATURE_FLAGS.GEOFENCE_LEGACY_TRANSITION,
  ];
  const migration = await source(migrationPath);
  for (const key of expected) {
    const definition = FEATURE_FLAG_DEFINITIONS.find((entry) => entry.key === key);
    assert.ok(definition, `${key} definition is missing`);
    assert.equal(definition.enabled, false);
    assert.match(migration, new RegExp(`\\('${key}', false`));
  }
  assert.equal(expected.length, 5);
});

test("repository schema defines all geofence tables and private evidence fields", async () => {
  const schema = await source(new URL("../shared/schema.ts", import.meta.url));
  assert.match(schema, /pgTable\("facility_geofence_boundaries"/);
  assert.match(schema, /pgTable\("facility_geofence_revision_events"/);
  assert.match(schema, /pgTable\("activity_geofence_evaluations"/);
  assert.match(schema, /observationLatitude: decimal\("observation_latitude"/);
  assert.match(schema, /observationLongitude: decimal\("observation_longitude"/);
  assert.match(schema, /accuracyMeters: decimal\("accuracy_meters"/);
  assert.match(schema, /geometryGeojson: jsonb\("geometry_geojson"\)/);
  assert.match(schema, /geometryChecksum: varchar\("geometry_checksum"/);
});

test("legacy one-mile/three-mile photo verification outcomes are unchanged", () => {
  const facility = { locationLatitude: 0, locationLongitude: 0 };
  assert.equal(evaluatePhotoVerification({ ...facility, gpsLatitude: 0, gpsLongitude: 0.01 }).status, "verified");
  assert.equal(evaluatePhotoVerification({ ...facility, gpsLatitude: 0, gpsLongitude: 0.02 }).status, "warning");
  assert.equal(evaluatePhotoVerification({ ...facility, gpsLatitude: 0, gpsLongitude: 0.05 }).status, "failed");
});

test("legacy rubble gates remain duplicated at 500 feet and do not call the canonical service", async () => {
  const routes = await source(new URL("../server/routes.ts", import.meta.url));
  const matches = routes.match(/const MAX_DISTANCE_MILES = 0\.095; \/\/ 500 feet/g) ?? [];
  assert.equal(matches.length, 2);
  assert.doesNotMatch(routes, /facilityGeofenceService|GEOFENCE_SUBMISSION_ENFORCEMENT/);
});

test("Work Package 1 has no geofence notification, financial, reward, competition, or UI wiring", async () => {
  const [notificationTemplates, routes, app] = await Promise.all([
    source(new URL("../shared/notifications.ts", import.meta.url)),
    source(new URL("../server/routes.ts", import.meta.url)),
    source(new URL("../client/src/App.tsx", import.meta.url)),
  ]);
  assert.doesNotMatch(notificationTemplates, /geofence/i);
  assert.doesNotMatch(routes, /activityGeofenceEvaluations|facilityGeofenceBoundaries/);
  assert.doesNotMatch(app, /geofence/i);

  const migration = await source(migrationPath);
  assert.doesNotMatch(migration, /(?:INSERT INTO|UPDATE|ALTER TABLE)\s+(?:payments|wallet_transactions|driver_lottery_entries|notifications)/i);
});

test("selected focused Turf modules are pinned and remain outside client imports", async () => {
  const [packageJson, clientImports] = await Promise.all([
    source(new URL("../package.json", import.meta.url)),
    source(new URL("../client/src/App.tsx", import.meta.url)),
  ]);
  const parsed = JSON.parse(packageJson) as { dependencies: Record<string, string> };
  const selectedModules = [
    "@turf/area",
    "@turf/bbox",
    "@turf/boolean-point-in-polygon",
    "@turf/distance",
    "@turf/helpers",
    "@turf/kinks",
    "@turf/point-to-line-distance",
  ];
  for (const moduleName of selectedModules) {
    assert.equal(parsed.dependencies[moduleName], "7.3.5");
  }
  assert.equal(parsed.dependencies["@turf/turf"], undefined);
  assert.doesNotMatch(clientImports, /@turf\//);
});
