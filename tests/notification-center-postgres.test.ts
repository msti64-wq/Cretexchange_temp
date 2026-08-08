import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { Client } from "pg";
import type { ActivityGeofenceEvaluation } from "../shared/schema";

const databaseUrl = process.env.NOTIFICATION_TEST_DATABASE_URL;
const confirmation = process.env.NOTIFICATION_TEST_CONFIRM;

function requireIsolatedDatabase(url: string) {
  const name = decodeURIComponent(new URL(url).pathname.replace(/^\//, ""));
  if (!/(?:test|validation|isolated)/i.test(name) || confirmation !== "isolated-notifications") {
    throw new Error("Notification integration tests require an explicitly confirmed isolated validation database");
  }
}

test("0039 supports idempotency, recipient scoping, read/archive state, and indexed query plans", { skip: !databaseUrl ? "NOTIFICATION_TEST_DATABASE_URL is not configured" : false }, async () => {
  requireIsolatedDatabase(databaseUrl!);
  const migration = await readFile(path.resolve("migrations/0039_extend_notifications_for_communication_center.sql"), "utf8");
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query("CREATE TEMP TABLE notifications (id varchar PRIMARY KEY, user_id varchar NOT NULL, title varchar NOT NULL, message text NOT NULL, type varchar NOT NULL DEFAULT 'info', is_read boolean DEFAULT false, data jsonb, created_at timestamp DEFAULT now())");
    await client.query(migration);

    const insert = `INSERT INTO notifications
      (id,user_id,title,message,type,recipient_role,category,template_key,idempotency_key,deep_link,data)
      VALUES ($1,$2,'Submitted','Submitted','activity_submitted','driver','operational','activity_submitted',$3,'/activity','{"facilityName":"Test"}')
      ON CONFLICT (idempotency_key) DO NOTHING`;
    await client.query(insert, ["n1", "driver-one", "activity:a:submitted:driver"]);
    await client.query(insert, ["n2", "driver-one", "activity:a:submitted:driver"]);
    assert.equal(Number((await client.query("SELECT count(*) AS value FROM notifications WHERE user_id='driver-one'")).rows[0].value), 1);
    assert.equal(Number((await client.query("SELECT count(*) AS value FROM notifications WHERE user_id='driver-two'")).rows[0].value), 0);

    await client.query("UPDATE notifications SET is_read=true, read_at=now() WHERE id='n1' AND user_id='driver-one'");
    assert.equal((await client.query("SELECT read_at IS NOT NULL AS read FROM notifications WHERE id='n1'")).rows[0].read, true);
    await client.query("UPDATE notifications SET archived_at=now() WHERE id='n1' AND user_id='driver-one'");
    assert.equal(Number((await client.query("SELECT count(*) AS value FROM notifications WHERE user_id='driver-one' AND archived_at IS NULL")).rows[0].value), 0);

    const catalog = await client.query("SELECT count(*)::int AS value FROM pg_indexes WHERE schemaname LIKE 'pg_temp_%' AND indexname IN ('notifications_idempotency_key_unique','notifications_user_archived_created_idx','notifications_user_read_archived_idx','notifications_user_category_created_idx')");
    assert.equal(Number(catalog.rows[0].value), 4);
    await client.query("ROLLBACK");
  } finally {
    await client.end();
  }
});

const uuid = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;

test("completed yellow and Gray submissions persist exactly-once privacy-safe governed notifications", { skip: !databaseUrl ? "NOTIFICATION_TEST_DATABASE_URL is not configured" : false }, async () => {
  requireIsolatedDatabase(databaseUrl!);
  if (process.env.DATABASE_URL !== databaseUrl) {
    throw new Error("DATABASE_URL must equal NOTIFICATION_TEST_DATABASE_URL for the isolated persistence test");
  }

  const [{ notificationService }, { pool }, { deliverCompletedSubmissionGeofenceNotifications }] = await Promise.all([
    import("../server/notificationService"),
    import("../server/db"),
    import("../server/geofenceCompletedSubmissionNotifications"),
  ]);
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  const ids = {
    driverUser: uuid(1), ownerUser: uuid(2), adminUser: uuid(3), superAdminUser: uuid(4),
    otherDriverUser: uuid(5), otherOwnerUser: uuid(6), inactiveAdminUser: uuid(7),
    driver: uuid(11), owner: uuid(12), otherDriver: uuid(13), otherOwner: uuid(14), facility: uuid(21),
  };

  const createAggregate = async (sequence: number, resultState: string, reasonCode: string, options: {
    acknowledgementCode?: string | null;
    driverNote?: string | null;
  } = {}) => {
    const activityId = uuid(100 + sequence);
    const photoId = uuid(200 + sequence);
    const evaluationId = uuid(300 + sequence);
    await client.query(
      `INSERT INTO washout_activities (id, driver_id, location_id, status, amount, check_in_time)
       VALUES ($1, $2, $3, 'pending', '0.00', now())`,
      [activityId, ids.driver, ids.facility],
    );
    await client.query(
      `INSERT INTO washout_photos (id, activity_id, driver_id, location_id, storage_key, photo_taken_at)
       VALUES ($1, $2, $3, $4, $5, now())`,
      [photoId, activityId, ids.driver, ids.facility, `private-validation-${sequence}`],
    );
    await client.query(
      `INSERT INTO activity_geofence_evaluations
       (id, activity_id, location_id, evaluation_purpose, result_state, reason_code, evaluated_at,
        exception_acknowledgement_code, driver_note, evidence_complete, idempotency_key)
       VALUES ($1, $2, $3, 'submission', $4, $5, now(), $6, $7, true, $8)`,
      [evaluationId, activityId, ids.facility, resultState, reasonCode, options.acknowledgementCode ?? null,
        options.driverNote ?? null, `isolated:submission:${activityId}`],
    );
    const evaluation: ActivityGeofenceEvaluation = {
      id: evaluationId,
      activityId,
      workflowReference: null,
      locationId: ids.facility,
      boundaryVersionId: null,
      boundaryVersion: null,
      evaluationPurpose: "submission",
      resultState,
      reasonCode,
      observationLatitude: null,
      observationLongitude: null,
      accuracyMeters: null,
      observedAt: null,
      evaluatedAt: new Date(),
      signedDistanceMeters: null,
      outsideDistanceMeters: null,
      exceptionDistanceMeters: null,
      exceptionAcknowledgementCode: options.acknowledgementCode ?? null,
      driverNote: options.driverNote ?? null,
      evidenceComplete: true,
      idempotencyKey: `isolated:submission:${activityId}`,
      createdAt: new Date(),
    };
    return { activityId, photoId, evaluationId, evaluation };
  };

  const deliver = (aggregate: Awaited<ReturnType<typeof createAggregate>>, enabled = true, fail = false) =>
    deliverCompletedSubmissionGeofenceNotifications({
      enabled,
      activity: { id: aggregate.activityId, status: "pending", driverUserId: ids.driverUser },
      facility: { id: ids.facility, name: "Isolated Validation Facility", resolveOwnerUserId: async () => ids.ownerUser },
      retainedPhotoCount: 1,
      evaluation: aggregate.evaluation,
      emitUser: fail
        ? async () => { throw new Error("isolated notification failure"); }
        : async (input) => { await notificationService.create(input); },
      emitRole: fail
        ? async () => { throw new Error("isolated notification failure"); }
        : async (input) => { await notificationService.createForRole(input); },
    });

  try {
    await client.query(
      "TRUNCATE notifications, activity_geofence_evaluations, washout_photos, washout_activities, washout_locations, drivers, owners, users CASCADE",
    );
    await client.query(
      `INSERT INTO users (id, username, email, password_hash, first_name, last_name, role, is_active) VALUES
       ($1,'notification-driver','notification-driver@example.invalid','test','Driver','Test','driver',true),
       ($2,'notification-owner','notification-owner@example.invalid','test','Owner','Test','owner',true),
       ($3,'notification-admin','notification-admin@example.invalid','test','Admin','Test','admin',true),
       ($4,'notification-super','notification-super@example.invalid','test','Super','Test','super_admin',true),
       ($5,'notification-other-driver','notification-other-driver@example.invalid','test','Other','Driver','driver',true),
       ($6,'notification-other-owner','notification-other-owner@example.invalid','test','Other','Owner','owner',true),
       ($7,'notification-inactive-admin','notification-inactive-admin@example.invalid','test','Inactive','Admin','admin',false)`,
      [ids.driverUser, ids.ownerUser, ids.adminUser, ids.superAdminUser, ids.otherDriverUser, ids.otherOwnerUser, ids.inactiveAdminUser],
    );
    await client.query("INSERT INTO drivers (id, user_id) VALUES ($1,$2),($3,$4)", [ids.driver, ids.driverUser, ids.otherDriver, ids.otherDriverUser]);
    await client.query("INSERT INTO owners (id, user_id, company_name) VALUES ($1,$2,'Validation Owner'),($3,$4,'Other Owner')", [ids.owner, ids.ownerUser, ids.otherOwner, ids.otherOwnerUser]);
    await client.query(
      `INSERT INTO washout_locations (id, owner_id, name, street, city, state, zip, latitude, longitude)
       VALUES ($1,$2,'Isolated Validation Facility','1 Test Way','Austin','TX','78701','30.000000','-97.000000')`,
      [ids.facility, ids.owner],
    );

    const yellow = await createAggregate(1, "OUTSIDE_BOUNDARY_WITHIN_EXCEPTION_ZONE", "OUTSIDE_BOUNDARY_WITHIN_EXCEPTION_ZONE", {
      acknowledgementCode: "BOUNDARY_APPEARS_INCORRECT",
      driverNote: "Call 512-555-1212; s3://private/photo.jpg; GPS: 30.12,-97.12; $25",
    });
    assert.deepEqual(await deliver(yellow), { handled: true, classification: { kind: "yellow" }, attempted: 4, failed: 0 });
    const yellowRows = (await client.query(
      `SELECT user_id, recipient_role, template_key, idempotency_key, deep_link, data
       FROM notifications WHERE source_entity_id=$1 ORDER BY recipient_role`,
      [yellow.activityId],
    )).rows;
    assert.equal(yellowRows.length, 4);
    assert.deepEqual(yellowRows.map((row) => row.recipient_role), ["admin", "driver", "owner", "super_admin"]);
    assert.deepEqual(new Set(yellowRows.map((row) => row.user_id)), new Set([ids.driverUser, ids.ownerUser, ids.adminUser, ids.superAdminUser]));
    assert.equal(yellowRows.some((row) => [ids.otherDriverUser, ids.otherOwnerUser, ids.inactiveAdminUser].includes(row.user_id)), false);
    assert.equal(yellowRows.find((row) => row.recipient_role === "driver").deep_link, `/activity?submittedActivityId=${yellow.activityId}`);
    assert.equal(yellowRows.find((row) => row.recipient_role === "owner").deep_link,
      `/dashboard/reviews?facilityId=${ids.facility}&activityId=${yellow.activityId}#activity-${yellow.activityId}`);
    assert.equal(yellowRows.find((row) => row.recipient_role === "admin").deep_link, "/notifications");
    assert.equal(yellowRows.find((row) => row.recipient_role === "super_admin").deep_link, "/notifications");
    assert.deepEqual(new Set(yellowRows.map((row) => row.idempotency_key)), new Set([
      `activity:${yellow.activityId}:geofence:completed-yellow:driver:geofence_exception_submitted:${ids.driverUser}`,
      `activity:${yellow.activityId}:geofence:completed-yellow:owner:owner_geofence_exception_review:${ids.ownerUser}`,
      `activity:${yellow.activityId}:geofence:completed-yellow:admin:admin_geofence_exception_attention:${ids.adminUser}`,
      `activity:${yellow.activityId}:geofence:completed-yellow:super_admin:admin_geofence_exception_attention:${ids.superAdminUser}`,
    ]));
    assert.doesNotMatch(JSON.stringify(yellowRows), /512-555-1212|s3:\/\/private|30\.12|-97\.12|\$25|storage|polygon/i);

    await deliver(yellow);
    await Promise.all(Array.from({ length: 12 }, () => deliver(yellow)));
    assert.equal(Number((await client.query("SELECT count(*) AS value FROM notifications WHERE source_entity_id=$1", [yellow.activityId])).rows[0].value), 4);

    const grayCases = [
      ["LOCATION_UNAVAILABLE", "LOCATION_COORDINATES_UNAVAILABLE", "gps_unavailable"],
      ["LOCATION_ACCURACY_INSUFFICIENT", "LOCATION_ACCURACY_EXCEEDS_LIMIT", "gps_accuracy_insufficient"],
      ["LOCATION_ACCURACY_INSUFFICIENT", "LOCATION_UNCERTAINTY_OVERLAPS_BOUNDARY", "near_boundary_uncertainty"],
      ["LOCATION_ACCURACY_INSUFFICIENT", "LOCATION_UNCERTAINTY_OVERLAPS_EXCEPTION_THRESHOLD", "near_advisory_limit_uncertainty"],
      ["GEOMETRY_UNAVAILABLE", "NO_ACTIVE_PRIMARY_BOUNDARY", "boundary_unavailable"],
      ["GEOMETRY_INVALID", "GEOMETRY_CHECKSUM_MISMATCH", "boundary_invalid"],
    ] as const;
    for (const [index, [state, reason, condition]] of grayCases.entries()) {
      const aggregate = await createAggregate(index + 2, state, reason);
      const result = await deliver(aggregate);
      assert.deepEqual(result.classification, { kind: "gray", condition });
      assert.equal(result.failed, 0);
      const rows = (await client.query("SELECT user_id, recipient_role, idempotency_key, deep_link, data FROM notifications WHERE source_entity_id=$1", [aggregate.activityId])).rows;
      assert.equal(rows.length, 4);
      assert.deepEqual(rows.map((row) => row.recipient_role).sort(), ["admin", "driver", "owner", "super_admin"]);
      assert.equal(rows.every((row) => row.data.status === condition), true);
      assert.equal(rows.every((row) => row.idempotency_key.includes(`geofence:completed-gray-${condition}:`)), true);
      await Promise.all(Array.from({ length: 8 }, () => deliver(aggregate)));
      assert.equal(Number((await client.query("SELECT count(*) AS value FROM notifications WHERE source_entity_id=$1", [aggregate.activityId])).rows[0].value), 4);
    }

    const disabled = await createAggregate(20, "LOCATION_UNAVAILABLE", "LOCATION_COORDINATES_UNAVAILABLE");
    assert.equal((await deliver(disabled, false)).handled, false);
    const green = await createAggregate(21, "INSIDE_APPROVED_BOUNDARY", "INSIDE_APPROVED_BOUNDARY");
    const red = await createAggregate(22, "OUTSIDE_EXCEPTION_ZONE", "OUTSIDE_EXCEPTION_ZONE");
    assert.equal((await deliver(green)).handled, false);
    assert.equal((await deliver(red)).handled, false);
    for (const aggregate of [disabled, green, red]) {
      assert.equal(Number((await client.query("SELECT count(*) AS value FROM notifications WHERE source_entity_id=$1", [aggregate.activityId])).rows[0].value), 0);
    }

    const failed = await createAggregate(23, "LOCATION_UNAVAILABLE", "LOCATION_COORDINATES_UNAVAILABLE");
    const failedResult = await deliver(failed, true, true);
    assert.equal(failedResult.failed, 4);
    const retained = await client.query(
      `SELECT
       EXISTS(SELECT 1 FROM washout_activities WHERE id=$1) AS activity,
       EXISTS(SELECT 1 FROM washout_photos WHERE id=$2) AS photo,
       EXISTS(SELECT 1 FROM activity_geofence_evaluations WHERE id=$3) AS evaluation`,
      [failed.activityId, failed.photoId, failed.evaluationId],
    );
    assert.deepEqual(retained.rows[0], { activity: true, photo: true, evaluation: true });
    assert.equal(Number((await client.query("SELECT count(*) AS value FROM notifications WHERE source_entity_id=$1", [failed.activityId])).rows[0].value), 0);

    const duplicateKey = yellowRows[0].idempotency_key;
    await client.query("BEGIN");
    await assert.rejects(
      client.query(
        `INSERT INTO notifications (user_id,title,message,type,recipient_role,category,template_key,idempotency_key)
         VALUES ($1,'duplicate','duplicate','admin_geofence_exception_attention','admin','administrative','admin_geofence_exception_attention',$2)`,
        [ids.adminUser, duplicateKey],
      ),
      (error: any) => error?.code === "23505",
    );
    await client.query("ROLLBACK");
    assert.equal(Number((await client.query("SELECT count(*) AS value FROM notifications WHERE idempotency_key=$1", [duplicateKey])).rows[0].value), 1);
  } finally {
    await client.end();
    await pool.end();
  }
});
