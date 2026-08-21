import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { PgDialect } from "drizzle-orm/pg-core";
import { Client } from "pg";

import { buildOwnerOperationalSummary } from "../server/ownerOperationalDashboard";

const databaseUrl = process.env.OWNER_OPERATIONAL_DASHBOARD_TEST_DATABASE_URL;
const confirmation = process.env.OWNER_OPERATIONAL_DASHBOARD_TEST_CONFIRM;

function requireIsolatedDatabase(url: string) {
  const name = decodeURIComponent(new URL(url).pathname.replace(/^\//, ""));
  if (!/(?:test|validation|isolated)/i.test(name) || confirmation !== "isolated-owner-operational-dashboard") {
    throw new Error("Owner operational-dashboard integration tests require an explicitly confirmed isolated database");
  }
}

test("PostgreSQL keeps Owner-wide and selected-Facility Today, review, evidence, UTC boundaries, and decisions consistent", {
  skip: databaseUrl ? false : "OWNER_OPERATIONAL_DASHBOARD_TEST_DATABASE_URL is not configured",
}, async () => {
  requireIsolatedDatabase(databaseUrl!);
  const client = new Client({ connectionString: databaseUrl });
  const schema = `owner_dashboard_${randomUUID().replaceAll("-", "")}`;
  const dialect = new PgDialect();
  await client.connect();
  try {
    await client.query(`CREATE SCHEMA ${schema}`);
    await client.query(`SET search_path TO ${schema}`);
    await client.query(`
      CREATE TABLE washout_locations (
        id text PRIMARY KEY, owner_id text NOT NULL, name text NOT NULL,
        is_active boolean NOT NULL, is_visible boolean NOT NULL, operating_hours jsonb
      );
      CREATE TABLE users (id text PRIMARY KEY, first_name text, last_name text);
      CREATE TABLE drivers (id text PRIMARY KEY, user_id text NOT NULL);
      CREATE TABLE washout_activities (
        id text PRIMARY KEY, driver_id text NOT NULL, location_id text NOT NULL,
        status text NOT NULL, service_type text, material_custom_label text,
        material_slug text, created_at timestamptz NOT NULL,
        verified_at timestamptz, rejected_at timestamptz
      );
      CREATE TABLE washout_photos (id text PRIMARY KEY, activity_id text NOT NULL, verification_status text NOT NULL);
      CREATE TABLE washout_activity_admin_reviews (id text PRIMARY KEY, activity_id text NOT NULL, resolution text);
      CREATE TABLE materials (slug text PRIMARY KEY, display_name text NOT NULL);
      CREATE TABLE location_material_intents (
        location_id text NOT NULL, custom_label text, material_custom_label text,
        material_slug text, active boolean NOT NULL
      );
    `);
    await client.query(`
      INSERT INTO users VALUES ('driver-user', 'Alex', 'Rivera'), ('driver-user-two', 'Jamie', 'Morgan');
      INSERT INTO drivers VALUES ('driver-one', 'driver-user'), ('driver-two', 'driver-user-two');
      INSERT INTO washout_locations VALUES
        ('home', 'owner-one', 'Home Yard', true, true, '{}'::jsonb),
        ('revel', 'owner-one', 'Revel Patio Grill', true, true, '{}'::jsonb),
        ('other', 'owner-two', 'Other Owner Facility', true, true, '{}'::jsonb);
      INSERT INTO materials VALUES ('asphalt', 'Asphalt');
      INSERT INTO location_material_intents VALUES ('revel', null, null, 'asphalt', true);
      INSERT INTO washout_activities VALUES
        ('home-old', 'driver-one', 'home', 'rejected', 'washout', null, null, '2026-08-04T19:44:00Z', null, '2026-08-04T19:44:00Z'),
        ('home-new', 'driver-one', 'home', 'pending', 'washout', null, null, '2026-08-21T19:57:00Z', null, null),
        ('home-rejected', 'driver-two', 'home', 'rejected', 'washout', null, null, '2026-08-21T10:00:00Z', null, '2026-08-21T10:05:00Z'),
        ('revel-new', 'driver-one', 'revel', 'pending', 'washout', null, null, '2026-08-21T19:55:01Z', null, null),
        ('revel-verified-boundary', 'driver-two', 'revel', 'verified', 'washout', null, null, '2026-08-21T00:00:00Z', '2026-08-21T20:00:00Z', null),
        ('revel-old', 'driver-one', 'revel', 'pending', 'rubble_dropoff', 'Reclaimed Concrete', null, '2026-08-11T18:54:17Z', null, null),
        ('revel-failed', 'driver-one', 'revel', 'pending', 'washout', null, null, '2026-08-10T18:00:00Z', null, null),
        ('revel-before-window', 'driver-one', 'revel', 'verified', 'washout', null, null, '2026-08-20T23:59:59.999Z', '2026-08-20T23:59:59.999Z', null),
        ('revel-next-window', 'driver-one', 'revel', 'verified', 'washout', null, null, '2026-08-22T00:00:00Z', '2026-08-22T00:01:00Z', null),
        ('other-new', 'driver-one', 'other', 'pending', 'washout', null, null, '2026-08-21T19:56:00Z', null, null);
      INSERT INTO washout_photos VALUES
        ('photo-home-new', 'home-new', 'verified'),
        ('photo-new', 'revel-new', 'verified'),
        ('photo-failed', 'revel-failed', 'failed');
      INSERT INTO washout_activity_admin_reviews VALUES ('returned-old', 'revel-old', 'returned_to_owner_review');
    `);

    const database = {
      async execute(query: unknown) {
        const compiled = dialect.sqlToQuery(query as never);
        return client.query(compiled.sql, compiled.params);
      },
    };
    const notificationService = {
      async unreadCount() { return 0; },
      async list() { return { items: [], pagination: { page: 1, pageSize: 5, total: 0, hasMore: false } }; },
    };
    const input = {
      database,
      notificationService,
      ownerId: "owner-one",
      ownerUserId: "owner-user",
      ownerApproved: true,
      accessState: {
        profileCompleted: true,
        approvalCompleted: true,
        accessStatus: "operationally_ready" as const,
        canManageLocations: true,
        missingProfileFields: [],
        missingProfileFieldLabels: [],
      },
      termsAcceptanceRequired: true,
      now: new Date("2026-08-21T20:15:00Z"),
    };

    const all = await buildOwnerOperationalSummary(input);
    assert.equal(all.selection.state, "all");
    assert.equal(all.selection.selectedFacilityId, null);
    assert.deepEqual(all.today, {
      submitted: 4, awaitingReview: 2, verified: 1, rejected: 1,
      activeDrivers: 2, latestActivityAt: "2026-08-21T19:57:00.000Z", timezone: "UTC",
    });
    assert.equal(all.attention?.pendingReviews, 4);
    assert.equal(all.attention?.allPendingReviews, 4);
    assert.deepEqual(all.pendingReviews.map((activity) => activity.id), ["home-new", "revel-new", "revel-old", "revel-failed"]);
    assert.deepEqual(all.pendingReviews.map((activity) => activity.facilityName), ["Home Yard", "Revel Patio Grill", "Revel Patio Grill", "Revel Patio Grill"]);
    assert.deepEqual(all.recentActivity.map((activity) => activity.id), ["home-new", "revel-new", "home-rejected", "revel-verified-boundary"]);
    assert.ok(all.recentActivity.every((activity) => activity.reviewLink.includes(`facilityId=${activity.facilityId}`)));
    assert.equal(all.facilityStatus, null);
    assert.deepEqual(all.attention?.facilitiesNeedingAttention.map((facility) => facility.id), ["home", "revel"]);

    const home = await buildOwnerOperationalSummary({ ...input, requestedFacilityId: "home" });
    assert.deepEqual(home.today, {
      submitted: 2, awaitingReview: 1, verified: 0, rejected: 1,
      activeDrivers: 2, latestActivityAt: "2026-08-21T19:57:00.000Z", timezone: "UTC",
    });
    assert.equal(home.attention?.pendingReviews, 1);
    assert.equal(home.attention?.allPendingReviews, 4);
    assert.deepEqual(home.recentActivity.map((activity) => activity.id), ["home-new", "home-rejected"]);
    assert.deepEqual(home.pendingReviews.map((activity) => activity.id), ["home-new"]);
    assert.ok(home.attention?.facilityConfigurationIssues.includes("operating_hours_missing"));
    assert.ok(home.attention?.facilityConfigurationIssues.includes("terms_acceptance_required"));

    const revelPending = await buildOwnerOperationalSummary({ ...input, requestedFacilityId: "revel" });
    assert.deepEqual(revelPending.today, {
      submitted: 2, awaitingReview: 1, verified: 1, rejected: 0,
      activeDrivers: 2, latestActivityAt: "2026-08-21T19:55:01.000Z", timezone: "UTC",
    });
    assert.equal(revelPending.attention?.pendingReviews, 3);
    assert.equal(revelPending.attention?.allPendingReviews, 4);
    assert.equal(revelPending.attention?.missingEvidence, 1);
    assert.equal(revelPending.attention?.failedEvidence, 1);
    assert.equal(revelPending.attention?.returnedFromAdministrativeReview, 1);
    assert.deepEqual(revelPending.pendingReviews.map((activity) => activity.id), ["revel-new", "revel-old", "revel-failed"]);
    assert.equal(revelPending.pendingReviews[0].evidence, "available");
    assert.equal(revelPending.pendingReviews[1].material, "Reclaimed Concrete");

    await client.query("UPDATE washout_activities SET status='verified', verified_at='2026-08-21T20:20:00Z' WHERE id='revel-new'");
    const afterApproval = await buildOwnerOperationalSummary({ ...input, requestedFacilityId: "revel" });
    assert.equal(afterApproval.today?.submitted, 2);
    assert.equal(afterApproval.today?.awaitingReview, 0);
    assert.equal(afterApproval.today?.verified, 2);
    assert.equal(afterApproval.attention?.pendingReviews, 2);
    assert.equal(afterApproval.attention?.allPendingReviews, 3);
    assert.deepEqual(afterApproval.pendingReviews.map((activity) => activity.id), ["revel-old", "revel-failed"]);

    await client.query("UPDATE washout_activities SET status='rejected', rejected_at='2026-08-21T20:25:00Z' WHERE id='home-new'");
    const afterRejection = await buildOwnerOperationalSummary(input);
    assert.equal(afterRejection.today?.submitted, 4);
    assert.equal(afterRejection.today?.awaitingReview, 0);
    assert.equal(afterRejection.today?.verified, 2);
    assert.equal(afterRejection.today?.rejected, 2);
    assert.equal(afterRejection.attention?.pendingReviews, 2);
    assert.equal(afterRejection.attention?.allPendingReviews, 2);
  } finally {
    await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await client.end();
  }
});
